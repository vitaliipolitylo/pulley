// The `reconcile` transition: applies one check result to stored state (AD-5, AD-6, AD-7).
// Pure: no clock reads, no I/O, never mutates `stored` or `result`.
import type { Account, CheckResult, CheckSuccess, RequestItem, Stored, Tracked, TransitionResult } from './types.ts';

export interface ReconcileCtx {
	/** Epoch ms, read in the shell. Used for `firstSeenAt` of new items. */
	now: number;
	/** The window's active account (window memory), if any. */
	activeAccountId: string | undefined;
	/** The current check interval (AD-7 attempt bookkeeping). */
	intervalMs: number;
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

function upsert(existing: Tracked | undefined, item: RequestItem, now: number): Tracked {
	if (existing) {
		return { ...requestFields(item), firstSeenAt: existing.firstSeenAt, origin: existing.origin, alert: existing.alert };
	}
	// Epic 1 writes neutral classification defaults; Epic 2 adds new/backlog classification.
	return { ...requestFields(item), firstSeenAt: now, origin: 'backlog', alert: 'none' };
}

function applySuccess(account: Account, result: CheckSuccess, now: number): Account {
	const at = result.fetchStartedAt;
	// Rule 4: a success at or before the last applied complete result changes only the attempt fields.
	if (account.lastAppliedFetchStartedAt !== undefined && at <= account.lastAppliedFetchStartedAt) {
		return account;
	}

	// Rule 5: upsert every item. A result older than an applied incomplete result still adds new
	// ids, but every existing id keeps its stored metadata (there is no per-item write time, so any
	// stored item may hold newer data than this result).
	const olderThanIncomplete = account.lastIncompleteFetchStartedAt !== undefined && at < account.lastIncompleteFetchStartedAt;
	const items: Account['items'] = { ...account.items };
	for (const item of result.items) {
		if (olderThanIncomplete && items[item.id]) {
			continue;
		}
		items[item.id] = upsert(items[item.id], item, now);
	}
	let next: Account = { ...account, firstCheckDone: true, items };
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
	// Rule 1: only the window's active account.
	if (result.accountId === undefined || ctx.activeAccountId === undefined || result.accountId !== ctx.activeAccountId) {
		return { stored, effects: [] };
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
		? applySuccess(attempted, result, ctx.now)
		: // Rule 3: a failure changes only the attempt fields and lastFailure; an older failure
			// applied late never replaces a newer one.
			{
				...attempted,
				lastFailure:
					current.lastFailure && current.lastFailure.at > result.fetchStartedAt
						? current.lastFailure
						: { at: result.fetchStartedAt, reason: result.reason },
			};

	return {
		stored: { ...stored, accounts: { ...stored.accounts, [accountId]: next } },
		effects: [],
	};
}
