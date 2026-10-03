// The `reconcile` transition: applies one check result to stored state (AD-5, AD-6, AD-7) and
// delivers the active account's pending alerts when the window is focused (AD-9).
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

function applySuccess(account: Account, previous: Account, result: CheckSuccess, now: number): Account {
	const at = result.fetchStartedAt;
	// Rule 4: a success at or before the last applied complete result changes only the attempt fields.
	if (account.lastAppliedFetchStartedAt !== undefined && at <= account.lastAppliedFetchStartedAt) {
		return account;
	}

	// Rule 5: upsert every item. A result older than an applied incomplete result still adds new
	// ids, but every existing id keeps its stored metadata (there is no per-item write time, so any
	// stored item may hold newer data than this result).
	const origin = classify(previous, at);
	const olderThanIncomplete = account.lastIncompleteFetchStartedAt !== undefined && at < account.lastIncompleteFetchStartedAt;
	const items: Account['items'] = { ...account.items };
	let addedNew = false;
	for (const item of result.items) {
		const existing = items[item.id];
		if (olderThanIncomplete && existing) {
			continue;
		}
		if (!existing && origin === 'new') {
			addedNew = true;
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
		return { ...next, lastIncompleteFetchStartedAt: prev === undefined ? at : Math.max(prev, at) };
	}

	// Rule 6, complete: advance markers; delete absent ids only if newer than every applied incomplete result.
	next = { ...next, lastSuccessAt: at, lastAppliedFetchStartedAt: at };
	if (next.lastIncompleteFetchStartedAt === undefined || at > next.lastIncompleteFetchStartedAt) {
		const present = new Set(result.items.map((item) => item.id));
		next.items = Object.fromEntries(Object.entries(items).filter(([id]) => present.has(id)));
	}
	return next;
}

export function reconcile(stored: Stored, result: CheckResult, ctx: ReconcileCtx): TransitionResult {
	// Rule 1: only the window's active account. The result is dropped, but the active account's
	// pending alerts are still delivered (same `stored` when there is nothing to deliver).
	if (result.accountId === undefined || ctx.activeAccountId === undefined || result.accountId !== ctx.activeAccountId) {
		return deliverToActive(stored, ctx.activeAccountId, ctx.windowFocused);
	}
	const accountId = result.accountId;
	const current = stored.accounts[accountId] ?? emptyAccount();

	// Rule 2: every attempt records itself.
	const attempted: Account = {
		...current,
		lastAttemptAt: result.fetchStartedAt,
		lastAttemptIntervalMs: ctx.intervalMs,
	};

	const next = result.ok
		? applySuccess(attempted, current, result, ctx.now)
		: // Rule 3: a failure changes only the attempt fields and lastFailure; an older failure
			// applied late never replaces a newer one.
			{
				...attempted,
				lastFailure:
					current.lastFailure && current.lastFailure.at > result.fetchStartedAt
						? current.lastFailure
						: { at: result.fetchStartedAt, reason: result.reason },
			};

	// Delivery after every result: the failure and no-op invariants govern queue changes and
	// alert decisions, not delivery of alerts that are already pending.
	const delivered = deliverPending(accountId, next, { focused: ctx.windowFocused });
	return {
		stored: { ...stored, accounts: { ...stored.accounts, [accountId]: delivered.account } },
		effects: delivered.effects,
	};
}
