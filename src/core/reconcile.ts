// The `reconcile` transition: applies one check result to stored state (AD-5, AD-6, AD-7), decides
// backlog reminders (AD-8), and delivers the active account's pending alerts when the window is
// focused (AD-9).
// Pure: no clock reads, no I/O, never mutates `stored` or `result`.
import type { Account, CheckResult, CheckSuccess, Origin, RequestItem, Stored, Tracked, TransitionResult } from './types.ts';
import { deliverPending, deliverToActive } from './windowFocused.ts';

export interface ReconcileCtx {
	/** Epoch ms, read in the shell. Used for `firstSeenAt` of new items. */
	now: number;
	/** The window's active account (window memory), if any. */
	activeAccountId: string | undefined;
	/** The current check interval (AD-7 attempt bookkeeping). */
	intervalMs: number;
	/** `vscode.window.state.focused` when the shell built this ctx: gates alert delivery (AD-9). */
	windowFocused: boolean;
	/** Local `YYYY-MM-DD`, computed in the shell (`localDate`): the backlog reminder day (AD-8). */
	today: string;
	/**
	 * Window memory: true from activation until a result reports `reminderEvaluated`. Allows one
	 * ongoing backlog reminder per local day.
	 */
	startupReminderDue: boolean;
}

/** What `reconcile` tells the shell (never stored). */
export interface ReconcileReport {
	/**
	 * True only for a complete applied success on the active account: the backlog reminder was
	 * evaluated, so the shell clears `startupReminderDue`.
	 */
	reminderEvaluated: boolean;
}

export function emptyAccount(): Account {
	return { firstCheckDone: false, backlogAlert: 'none', newSignal: false, items: {} };
}

/** The latest RequestItem fields; optional fields are omitted, never set to undefined. */
function requestFields(item: RequestItem): RequestItem {
	const fields: RequestItem = {
		id: item.id,
		repo: item.repo,
		number: item.number,
		title: item.title,
		author: item.author,
		url: item.url,
	};
	if (item.requester !== undefined) {
		fields.requester = item.requester;
	}
	if (item.requestedAt !== undefined) {
		fields.requestedAt = item.requestedAt;
	}
	return fields;
}

/**
 * The baseline predicate (AD-7): an id first observed by a success at `at` is backlog when the
 * account had no prior complete success, when the previous interval is unknown, or when the gap
 * since the last complete success is more than twice the previous interval. The gap runs from the
 * last complete success, so failed and incomplete checks never shorten it. `previous` is the
 * account before rule 2 records this attempt.
 */
function classify(previous: Account, at: number): Origin {
	if (previous.lastSuccessAt === undefined || previous.lastAttemptIntervalMs === undefined) {
		return 'backlog';
	}
	return at - previous.lastSuccessAt > 2 * previous.lastAttemptIntervalMs ? 'backlog' : 'new';
}

function upsert(existing: Tracked | undefined, item: RequestItem, now: number, origin: Origin): Tracked {
	if (existing) {
		// A re-request while present updates only the request fields; origin and alert stay.
		return { ...requestFields(item), firstSeenAt: existing.firstSeenAt, origin: existing.origin, alert: existing.alert };
	}
	return { ...requestFields(item), firstSeenAt: now, origin, alert: origin === 'new' ? 'pending' : 'none' };
}

interface Applied {
	account: Account;
	/** False for a rule-4 no-op: only the attempt fields changed. */
	applied: boolean;
	/** This result added an id classified backlog (by the gap or missing-prior-attempt branch, X8). */
	addedBacklog: boolean;
}

function applySuccess(account: Account, previous: Account, result: CheckSuccess, now: number): Applied {
	const at = result.fetchStartedAt;
	// Rule 4: a success at or before the last applied complete result changes only the attempt fields.
	if (account.lastAppliedFetchStartedAt !== undefined && at <= account.lastAppliedFetchStartedAt) {
		return { account, applied: false, addedBacklog: false };
	}

	// Rule 5: upsert every item. A result older than an applied incomplete result still adds new
	// ids, but every existing id keeps its stored metadata (there is no per-item write time, so any
	// stored item may hold newer data than this result).
	const origin = classify(previous, at);
	const olderThanIncomplete = account.lastIncompleteFetchStartedAt !== undefined && at < account.lastIncompleteFetchStartedAt;
	const items: Account['items'] = { ...account.items };
	let addedNew = false;
	let addedBacklog = false;
	for (const item of result.items) {
		const existing = items[item.id];
		if (olderThanIncomplete && existing) {
			continue;
		}
		if (!existing) {
			if (origin === 'new') {
				addedNew = true;
			} else {
				addedBacklog = true;
			}
		}
		items[item.id] = upsert(existing, item, now, origin);
	}
	let next: Account = { ...account, firstCheckDone: true, newSignal: addedNew, items };
	if (next.lastFailure && at > next.lastFailure.at) {
		const { lastFailure: _cleared, ...rest } = next;
		next = rest;
	}

	if (!result.complete) {
		// Rule 6, incomplete: no markers advance and nothing is deleted.
		const prev = next.lastIncompleteFetchStartedAt;
		return { account: { ...next, lastIncompleteFetchStartedAt: prev === undefined ? at : Math.max(prev, at) }, applied: true, addedBacklog };
	}

	// Rule 6, complete: advance markers; delete absent ids only if newer than every applied incomplete result.
	next = { ...next, lastSuccessAt: at, lastAppliedFetchStartedAt: at };
	if (next.lastIncompleteFetchStartedAt === undefined || at > next.lastIncompleteFetchStartedAt) {
		const present = new Set(result.items.map((item) => item.id));
		next.items = Object.fromEntries(Object.entries(items).filter(([id]) => present.has(id)));
	}
	return { account: next, applied: true, addedBacklog };
}

/**
 * The backlog reminder decision (AD-8), made only after a complete applied success. `previous` is
 * the account before this result. A pending reminder is never replaced (A5), so a pending
 * first-connection alert survives midnight.
 */
function decideReminder(account: Account, previous: Account, addedBacklog: boolean, ctx: ReconcileCtx): Account {
	if (account.backlogAlert !== 'none' && account.backlogAlert.state === 'pending') {
		return account;
	}
	if (Object.keys(account.items).length === 0) {
		return account;
	}
	if (previous.lastSuccessAt === undefined) {
		// First connection (A3): whatever the threshold or the recorded date.
		return { ...account, backlogAlert: { state: 'pending', firstConnection: true }, lastBacklogReminderDate: ctx.today };
	}
	// Ongoing reminder: at most one per local day, on a startup or when this result added gap backlog.
	if (account.lastBacklogReminderDate !== ctx.today && (ctx.startupReminderDue || addedBacklog)) {
		return { ...account, backlogAlert: { state: 'pending', firstConnection: false }, lastBacklogReminderDate: ctx.today };
	}
	return account;
}

export function reconcile(stored: Stored, result: CheckResult, ctx: ReconcileCtx): TransitionResult<ReconcileReport> {
	const deliver = { focused: ctx.windowFocused, today: ctx.today };
	// Rule 1: only the window's active account. The result is dropped, but the active account's
	// pending alerts are still delivered (same `stored` when there is nothing to deliver).
	if (result.accountId === undefined || ctx.activeAccountId === undefined || result.accountId !== ctx.activeAccountId) {
		return { ...deliverToActive(stored, ctx.activeAccountId, deliver), report: { reminderEvaluated: false } };
	}
	const accountId = result.accountId;
	const current = stored.accounts[accountId] ?? emptyAccount();

	// Rule 2: every attempt records itself.
	const attempted: Account = {
		...current,
		lastAttemptAt: result.fetchStartedAt,
		lastAttemptIntervalMs: ctx.intervalMs,
	};

	let next: Account;
	let reminderEvaluated = false;
	if (result.ok) {
		const applied = applySuccess(attempted, current, result, ctx.now);
		next = applied.account;
		// Complete-only reminders: only a complete applied success decides one. Failures, rule-4
		// no-ops, and incomplete successes never set backlogAlert or lastBacklogReminderDate.
		if (applied.applied && result.complete) {
			next = decideReminder(next, current, applied.addedBacklog, ctx);
			reminderEvaluated = true;
		}
	} else {
		// Rule 3: a failure changes only the attempt fields and lastFailure; an older failure
		// applied late never replaces a newer one.
		next = {
			...attempted,
			lastFailure:
				current.lastFailure && current.lastFailure.at > result.fetchStartedAt
					? current.lastFailure
					: { at: result.fetchStartedAt, reason: result.reason },
		};
	}

	// Delivery after every result: the failure and no-op invariants govern queue changes and
	// reminder decisions, not delivery of alerts that are already pending.
	const delivered = deliverPending(accountId, next, deliver);
	return {
		stored: { ...stored, accounts: { ...stored.accounts, [accountId]: delivered.account } },
		effects: delivered.effects,
		report: { reminderEvaluated },
	};
}
