// The check scheduler (AD-14). Owns the triggers `activation`, `periodic`, `manual`, and
// `session-changed`; allows one in-flight check per window that later triggers join; adds
// shell-side jitter to non-manual triggers; and runs the periodic timer. No `vscode` import:
// timers, randomness, and the check itself are injected so tests can use fakes.
import { activeAccountId, shortReason, type ConnectionState, type SessionLookup } from '../core/connection.ts';
import { copy } from '../core/copy.ts';
import type { CheckResult } from '../core/types.ts';
import { checkWithRetry } from './checkWithRetry.ts';

export type TriggerKind = 'activation' | 'periodic' | 'manual' | 'session-changed';

/** Non-manual triggers wait `random() * JITTER_MAX_MS` before the check starts. */
export const JITTER_MAX_MS = 60_000;

export const INTERVAL_DEFAULT_MINUTES = 15;
export const INTERVAL_MIN_MINUTES = 5;
export const INTERVAL_MAX_MINUTES = 240;

type TimerHandle = unknown;

export interface SchedulerDeps {
	/** One full check. Expected not to reject; a rejection is logged and never escapes. */
	runCheck: () => Promise<void>;
	/** Read on every arm, so a settings change applies at the next restart. */
	getIntervalMs: () => number;
	/** In [0, 1). */
	random: () => number;
	setTimeout: (callback: () => void, ms: number) => TimerHandle;
	clearTimeout: (handle: TimerHandle) => void;
	log: (line: string) => void;
}

export interface Scheduler {
	/**
	 * Requests a check. While a check is in flight this returns that check's promise (join).
	 * Non-manual kinds first wait a random 0–60 s; a manual trigger during that wait cancels it
	 * and runs now. The returned promise never rejects.
	 */
	trigger(kind: TriggerKind): Promise<void>;
	/** Restarts the periodic timer with a fresh full interval. Starts no check. */
	restartInterval(): void;
	/** Clears every timer; later triggers do nothing. */
	dispose(): void;
}

interface JitterWait {
	handle: TimerHandle;
	promise: Promise<void>;
	resolve: () => void;
}

export function createScheduler(deps: SchedulerDeps): Scheduler {
	let inFlight: Promise<void> | undefined;
	let wait: JitterWait | undefined;
	let periodicHandle: TimerHandle | undefined;
	let disposed = false;

	const clearPeriodic = (): void => {
		if (periodicHandle !== undefined) {
			deps.clearTimeout(periodicHandle);
			periodicHandle = undefined;
		}
	};

	/** A repeating timeout of `intervalMs`, re-armed after each check settles. */
	const armPeriodic = (): void => {
		clearPeriodic();
		if (disposed) {
			return;
		}
		periodicHandle = deps.setTimeout(() => {
			periodicHandle = undefined;
			void trigger('periodic');
		}, deps.getIntervalMs());
	};

	const run = (): Promise<void> => {
		const check = (async () => {
			try {
				await deps.runCheck();
			} catch (error) {
				deps.log(copy.log.checkCrashed(shortReason(error)));
			} finally {
				inFlight = undefined;
				armPeriodic();
			}
		})();
		inFlight = check;
		return check;
	};

	function trigger(kind: TriggerKind): Promise<void> {
		if (disposed) {
			return Promise.resolve();
		}
		if (inFlight) {
			deps.log(copy.log.checkJoined(kind));
			return inFlight;
		}
		if (kind === 'manual') {
			deps.log(copy.log.checkTriggered(kind, 0));
			const pending = wait;
			if (pending) {
				// The user is waiting: cancel the jitter and run now; the waiters join this check.
				wait = undefined;
				deps.clearTimeout(pending.handle);
			}
			const check = run();
			if (pending) {
				void check.then(pending.resolve);
			}
			return check;
		}
		if (wait) {
			deps.log(copy.log.checkJoined(kind));
			return wait.promise;
		}
		const delayMs = Math.max(0, Math.min(JITTER_MAX_MS - 1, Math.floor(deps.random() * JITTER_MAX_MS)));
		deps.log(copy.log.checkTriggered(kind, delayMs));
		let resolve!: () => void;
		const promise = new Promise<void>((r) => (resolve = r));
		const entry: JitterWait = { handle: undefined, promise, resolve };
		entry.handle = deps.setTimeout(() => {
			if (wait !== entry) {
				return;
			}
			wait = undefined;
			// A check started meanwhile (only a manual one can): join it instead of running twice.
			void (inFlight ?? run()).then(resolve);
		}, delayMs);
		wait = entry;
		return promise;
	}

	return {
		trigger,
		restartInterval: armPeriodic,
		dispose(): void {
			disposed = true;
			clearPeriodic();
			if (wait) {
				deps.clearTimeout(wait.handle);
				wait.resolve();
				wait = undefined;
			}
		},
	};
}

/**
 * The window's connection after applying a check result from the current generation. No session
 * is `signed_out`; a 401 after the retry is `unauthenticated` and keeps the account so its rows
 * stay as stale; a success for the unauthenticated account returns it to `connected` at
 * `generation`. Returns `current` itself when nothing changes.
 */
export function nextConnection(current: ConnectionState, result: CheckResult | undefined, generation: number): ConnectionState {
	if (!result) {
		return current.kind === 'unconnected' && current.reason === 'signed_out' ? current : { kind: 'unconnected', reason: 'signed_out' };
	}
	const label = 'label' in current ? current.label : undefined;
	if (!result.ok && result.reason === 'unauthenticated') {
		const accountId = result.accountId ?? activeAccountId(current);
		if (current.kind === 'unconnected' && current.reason === 'unauthenticated' && current.accountId === accountId) {
			return current;
		}
		return { kind: 'unconnected', reason: 'unauthenticated', accountId, label };
	}
	if (result.ok && current.kind === 'unconnected' && current.reason === 'unauthenticated' && result.accountId === current.accountId) {
		return { kind: 'connected', accountId: result.accountId, label: label ?? '', generation };
	}
	return current;
}

/**
 * How Connect runs from the current state: Reconnect (`force`, a new session via
 * `forceNewSession`) only while unauthenticated. `map` turns the sign-in result into the lookup to
 * apply; `undefined` keeps the current state, so a cancelled Reconnect keeps its stale rows.
 */
export function connectPlan(current: ConnectionState): { force: boolean; map: (found: SessionLookup) => SessionLookup | undefined } {
	const force = current.kind === 'unconnected' && current.reason === 'unauthenticated';
	return { force, map: (found) => (force && found.kind !== 'connected' ? undefined : found) };
}

/** A check whose result was discarded runs again at most this many times in total. */
export const MAX_GENERATION_ATTEMPTS = 3;

export interface QueueCheckDeps {
	/** Resolves once the newest silent connection lookup has been applied. */
	lookupsSettled: () => Promise<void>;
	/** The window's current session generation. */
	generation: () => number;
	/** Fresh silent session lookup; undefined when there is no session. */
	getToken: () => Promise<{ accountId: string; token: string } | undefined>;
	/** One GitHub check with the given token. */
	fetchCheck: (token: string, accountId: string) => Promise<CheckResult>;
	/**
	 * Applies a result from the current generation (`store.mutate(reconcile, …)` plus connection
	 * updates); `undefined` means no session. Never called for a discarded result.
	 */
	apply: (result: CheckResult | undefined) => Promise<void>;
	log: (line: string) => void;
}

/**
 * The scheduler's `runCheck` (AD-11, AD-14): wait for the window's connection, capture the session
 * generation, check with one silent re-lookup and retry on 401, then apply the result only if the
 * generation is unchanged. A discarded result is logged and the check runs again for the new
 * generation, so triggers that joined it (session-changed, Connect) still see a current result.
 */
export function createQueueCheck(deps: QueueCheckDeps): () => Promise<void> {
	return async () => {
		for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
			await deps.lookupsSettled();
			const started = deps.generation();
			const result = await checkWithRetry({ getToken: deps.getToken, runCheck: deps.fetchCheck, log: deps.log });
			const current = deps.generation();
			if (current !== started) {
				deps.log(copy.log.checkDiscarded(started, current));
				continue;
			}
			if (!result) {
				deps.log(copy.log.checkNoSession);
			} else if (!result.ok && result.reason === 'unauthenticated') {
				deps.log(copy.log.checkUnauthenticated);
			}
			await deps.apply(result);
			return;
		}
		deps.log(copy.log.checkGenerationGaveUp);
	};
}

/**
 * Reads `pulley.checkIntervalMinutes` as milliseconds: non-numbers use the default, and
 * out-of-range values are clamped to 5–240 minutes and logged once per distinct value.
 */
export function createIntervalReader(read: () => unknown, log: (line: string) => void): () => number {
	const logged = new Set<string>();
	return () => {
		const raw = read();
		let minutes = typeof raw === 'number' && Number.isFinite(raw) ? raw : INTERVAL_DEFAULT_MINUTES;
		const clamped = Math.min(INTERVAL_MAX_MINUTES, Math.max(INTERVAL_MIN_MINUTES, minutes));
		if (clamped !== minutes || (raw !== undefined && minutes !== raw)) {
			const key = String(raw);
			if (!logged.has(key)) {
				logged.add(key);
				log(copy.log.intervalClamped(key, clamped));
			}
		}
		minutes = clamped;
		return minutes * 60_000;
	};
}

export const THRESHOLD_DEFAULT = 5;

/**
 * Reads `pulley.backlogThreshold` (Story 2.3): an unset value uses the default; any other value
 * that is not an integer of at least 1 (2.5, 0, a string) uses the default and is logged once per
 * distinct value. Presentation only: reading it never checks, writes, or alerts.
 */
export function createThresholdReader(read: () => unknown, log: (line: string) => void): () => number {
	const logged = new Set<string>();
	return () => {
		const raw = read();
		if (raw === undefined) {
			return THRESHOLD_DEFAULT;
		}
		if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1) {
			return raw;
		}
		const key = typeof raw === 'string' ? JSON.stringify(raw) : String(raw);
		if (!logged.has(key)) {
			logged.add(key);
			log(copy.log.thresholdInvalid(key, THRESHOLD_DEFAULT));
		}
		return THRESHOLD_DEFAULT;
	};
}

/**
 * The local calendar day of `ms` as `YYYY-MM-DD` (the `today` of every transition ctx, AD-8). Uses
 * the machine's time zone, never UTC, so a reminder day follows the user's own midnight.
 */
export function localDate(ms: number): string {
	const at = new Date(ms);
	const pad = (n: number): string => String(n).padStart(2, '0');
	return `${String(at.getFullYear()).padStart(4, '0')}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/**
 * The window's `startupReminderDue` after a reconcile mutate resolved (AD-8, A6): cleared only when
 * the report says the reminder was evaluated. A missing report (read-only mode) keeps the flag.
 * A rejected mutate (write failure) never reaches here, so the flag stays set.
 */
export function nextStartupReminderDue(flag: boolean, report: { reminderEvaluated: boolean } | undefined): boolean {
	return flag && report?.reminderEvaluated !== true;
}

/**
 * The shell's `formatTime` for "Last checked {time}": a short time, plus a short date when
 * `ms` is not on the same local day as `now`.
 */
export function formatCheckTime(ms: number, now: number = Date.now(), locale?: string): string {
	const at = new Date(ms);
	const sameDay = at.toDateString() === new Date(now).toDateString();
	const options: Intl.DateTimeFormatOptions = sameDay ? { timeStyle: 'short' } : { dateStyle: 'short', timeStyle: 'short' };
	return new Intl.DateTimeFormat(locale, options).format(at);
}
