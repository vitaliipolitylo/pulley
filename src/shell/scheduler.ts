// The check scheduler (AD-14). Owns the triggers `activation`, `periodic`, `manual`, and
// `session-changed`; allows one in-flight check per window that later triggers join; adds
// shell-side jitter to non-manual triggers; and runs the periodic timer. No `vscode` import:
// timers, randomness, and the check itself are injected so tests can use fakes.
import { shortReason } from '../core/connection.ts';
import { copy } from '../core/copy.ts';

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
