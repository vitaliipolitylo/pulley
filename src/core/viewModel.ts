// The first view model (AD-12): everything the queue view shows, derived from stored
// state plus window memory. Pure: no clock reads, never mutates its inputs.
import { activeAccountId, type ConnectionState } from './connection.ts';
import { copy, failureCopy, failureMessage, mascotText, writeFailedMessage } from './copy.ts';
import type { Account, Mascot, Row, Stored, Tracked, ViewModel } from './types.ts';

/** Window memory the view model needs (never persisted). */
export interface WindowView {
	connection: ConnectionState;
	/** Stored data is from a newer Pulley (AD-3). */
	readOnly: boolean;
	/** A check is in flight in this window. */
	checking: boolean;
	/** The last attempt to save a check result in this window failed; cleared by the next successful save. */
	writeFailed?: boolean;
}

export interface ViewModelCtx {
	/** Epoch ms, read in the shell. Used for request-age strings. */
	now: number;
	/**
	 * Formats an epoch-ms check time for "Last checked {time}". Supplied by the shell
	 * (`Intl.DateTimeFormat`, short time plus a short date when not today), so core stays clock-free.
	 */
	formatTime: (ms: number) => string;
	/** Local `YYYY-MM-DD`, computed in the shell: picks the backlog line (Story 2.2). */
	today: string;
	/** `pulley.backlogThreshold` as read by the shell (an integer ≥ 1). Presentation only. */
	threshold: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * The request-age phrase from `now - requestedAt`. Without `requestedAt` it says
 * "Request time unavailable"; `firstSeenAt`, PR age, and author are never substitutes.
 * A future `requestedAt` (clock skew) reads as "just now".
 */
export function formatRequestAge(now: number, requestedAt?: number): string {
	if (requestedAt === undefined || !Number.isFinite(requestedAt)) {
		return copy.requestTimeUnavailable;
	}
	const elapsed = now - requestedAt;
	if (elapsed < MINUTE) {
		return copy.requestedJustNow;
	}
	if (elapsed < HOUR) {
		return copy.requestedMinutesAgo(Math.floor(elapsed / MINUTE));
	}
	if (elapsed < DAY) {
		return copy.requestedHoursAgo(Math.floor(elapsed / HOUR));
	}
	if (elapsed < 2 * DAY) {
		return copy.requestedYesterday;
	}
	return copy.requestedDaysAgo(Math.floor(elapsed / DAY));
}

function toRow(item: Tracked, now: number): Row {
	const age = formatRequestAge(now, item.requestedAt);
	return {
		id: item.id,
		label: item.title,
		description: copy.rowDescription(item.repo, item.author, age),
		age,
		tooltip: copy.rowTooltip(item.repo, item.number, item.title, item.author, age),
		accessibleLabel: copy.rowAccessibleLabel(item.repo, item.number, item.title, item.author, age),
		url: item.url,
	};
}

/** Oldest first by `requestedAt ?? firstSeenAt`; ties by id. */
function byAge(a: Tracked, b: Tracked): number {
	const ka = a.requestedAt ?? a.firstSeenAt;
	const kb = b.requestedAt ?? b.firstSeenAt;
	if (ka !== kb) {
		return ka - kb;
	}
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function rowsOf(account: Account | undefined, now: number): Row[] {
	return account ? Object.values(account.items).sort(byAge).map((item) => toRow(item, now)) : [];
}

/** Corgi poses and their word equivalents (Story 2.3). */
type Presentation = Pick<ViewModel, 'countStale' | 'mascot' | 'mascotText'>;

function present(mascot: Mascot, ctx: ViewModelCtx, countStale = false): Presentation {
	return { countStale, mascot, mascotText: mascotText(mascot, ctx.today) };
}

/**
 * The count after a failure, a failed save, or an expired sign-in: the last-known row count
 * (marked stale) once a complete check has succeeded, otherwise null.
 */
function lastKnown(lastSuccessAt: number | undefined, n: number): { count: number | null; countStale: boolean } {
	return lastSuccessAt === undefined ? { count: null, countStale: false } : { count: n, countStale: true };
}

/**
 * The corgi for pending work: backlog (count ≥ threshold), then new (`newSignal`), then older (a
 * known `requestedAt` at least 24 h before `now`; never `firstSeenAt` or PR age), then waiting.
 */
function pendingMascot(account: Account, n: number, ctx: ViewModelCtx): Mascot {
	if (n >= ctx.threshold) {
		return 'backlog';
	}
	if (account.newSignal) {
		return 'new';
	}
	const older = Object.values(account.items).some(
		(item) => item.requestedAt !== undefined && Number.isFinite(item.requestedAt) && ctx.now - item.requestedAt >= DAY,
	);
	return older ? 'older' : 'waiting';
}

export function viewModel(stored: Stored | undefined, window: WindowView, ctx: ViewModelCtx): ViewModel {
	const unknown = present('unknown', ctx);
	if (window.readOnly || !stored) {
		return { status: 'readOnly', count: null, ...unknown, message: copy.updatePulley, rows: [] };
	}
	const connection = window.connection;
	if (connection.kind === 'unknown') {
		// The startup lookup is in flight; no account partition is known yet.
		return { status: 'loading', count: null, ...unknown, message: copy.checkingConnection, rows: [] };
	}
	if (connection.kind === 'unconnected' && connection.reason === 'signed_out') {
		// No session: no rows. The native viewsWelcome content (with Connect) carries the explanation.
		return { status: 'unconnected', reason: 'signed_out', action: failureCopy.signed_out.action, count: null, ...unknown, rows: [] };
	}

	const accountId = activeAccountId(connection);
	const account = accountId === undefined ? undefined : stored.accounts[accountId];
	const lastSuccessAt = account?.lastSuccessAt;
	const lastSuccessTime = lastSuccessAt === undefined ? undefined : ctx.formatTime(lastSuccessAt);

	if (connection.kind === 'unconnected') {
		// Unauthenticated: the account stays active, so its stored rows remain visible as stale with
		// Reconnect in the message (the welcome content is hidden behind rows). With no rows the
		// message stays unset so the Reconnect welcome content shows.
		const rows = rowsOf(account, ctx.now);
		const counted = rows.length > 0 ? lastKnown(lastSuccessAt, rows.length) : { count: null, countStale: false };
		const message = rows.length > 0 ? failureMessage('unauthenticated', lastSuccessTime) : undefined;
		const model: ViewModel = {
			status: 'unconnected',
			reason: 'unauthenticated',
			action: failureCopy.unauthenticated.action,
			...present('unknown', ctx, counted.countStale),
			count: counted.count,
			rows,
		};
		return message === undefined ? model : { ...model, message };
	}

	if (window.writeFailed) {
		// The latest check could not be saved: what is stored may be out of date. Show it as stale
		// (or unavailable with no prior success), never a firm count or clear, and offer Refresh.
		const rows = rowsOf(account, ctx.now);
		const counted = lastKnown(lastSuccessAt, rows.length);
		return {
			status: 'stale',
			action: 'refresh',
			...present('unknown', ctx, counted.countStale),
			count: counted.count,
			message: writeFailedMessage(lastSuccessTime),
			rows,
		};
	}

	if (!account) {
		return { status: 'loading', count: null, ...unknown, message: copy.checking, rows: [] };
	}

	const rows = rowsOf(account, ctx.now);
	const n = rows.length;
	/** "Last checked {time}" (the view description) once a complete check has succeeded. */
	const checked = lastSuccessTime === undefined ? {} : { lastChecked: copy.lastChecked(lastSuccessTime) };

	const failure = account.lastFailure;
	if (failure && failure.at > (lastSuccessAt ?? 0)) {
		// Stale after a prior success (with its time and the last-known count), or unavailable when
		// none: never a firm count or clear.
		const counted = lastKnown(lastSuccessAt, n);
		return {
			status: 'stale',
			action: failureCopy[failure.reason].action,
			...present('unknown', ctx, counted.countStale),
			count: counted.count,
			message: failureMessage(failure.reason, lastSuccessTime),
			rows,
		};
	}
	if (n > 0) {
		// Rows from incomplete checks only, or a newer incomplete check than the last complete one,
		// carry the "may be incomplete" hint.
		const incomplete =
			lastSuccessAt === undefined ||
			(account.lastIncompleteFetchStartedAt !== undefined && account.lastIncompleteFetchStartedAt > lastSuccessAt);
		const message = incomplete ? `${copy.pending(n)} ${copy.incomplete}` : copy.pending(n);
		return {
			status: 'pending',
			count: lastSuccessAt === undefined ? null : n,
			...present(pendingMascot(account, n, ctx), ctx),
			message,
			...checked,
			rows,
		};
	}
	const newerIncomplete =
		lastSuccessAt !== undefined &&
		account.lastIncompleteFetchStartedAt !== undefined &&
		account.lastIncompleteFetchStartedAt > lastSuccessAt;
	if (lastSuccessAt !== undefined && !newerIncomplete) {
		return { status: 'clear', count: 0, ...present('clear', ctx), message: copy.clear, ...checked, rows };
	}
	// Only incomplete successes that returned nothing (or none yet), or a newer incomplete check
	// than the last complete one: never show a zero or clear.
	const message = account.firstCheckDone && !window.checking ? copy.incomplete : copy.checking;
	return { status: 'loading', count: null, ...unknown, message, rows };
}
