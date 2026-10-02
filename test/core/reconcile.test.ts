// Table-driven reconcile tests: one case per rule 1–6 and per I/O matrix row.
// Every stored input and result is deep-frozen, so any input mutation throws.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyAccount, reconcile, type ReconcileCtx } from '../../src/core/reconcile.ts';
import { viewModel } from '../../src/core/viewModel.ts';
import type { Account, CheckResult, RequestItem, Stored, Tracked } from '../../src/core/types.ts';

const formatTime = (ms: number): string => `t${ms}`;

function deepFreeze<T>(value: T): T {
	if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const child of Object.values(value)) {
			deepFreeze(child);
		}
	}
	return value;
}

const NOW = 50_000;
const INTERVAL = 900_000;
const ctx: ReconcileCtx = { now: NOW, activeAccountId: 'Y', intervalMs: INTERVAL };

const item = (id: string, extra: Partial<RequestItem> = {}): RequestItem => ({
	id,
	repo: 'octo/app',
	number: id.charCodeAt(0),
	title: `Title ${id}`,
	author: 'alice',
	url: `https://github.com/octo/app/pull/${id}`,
	...extra,
});
const tracked = (id: string, firstSeenAt: number, extra: Partial<Tracked> = {}): Tracked => ({
	...item(id),
	firstSeenAt,
	origin: 'backlog',
	alert: 'none',
	...extra,
});
const account = (extra: Partial<Account> = {}): Account => ({ ...emptyAccount(), ...extra });
const stored = (accounts: Record<string, Account>): Stored => ({ schemaVersion: 1, accounts });
const itemsOf = (...list: Tracked[]): Account['items'] => Object.fromEntries(list.map((t) => [t.id, t]));

const ok = (fetchStartedAt: number, complete: boolean, items: RequestItem[], accountId = 'Y'): CheckResult => ({
	ok: true,
	accountId,
	fetchStartedAt,
	complete,
	items,
});
const fail = (fetchStartedAt: number, accountId: string | null = 'Y'): CheckResult =>
	accountId === null
		? { ok: false, fetchStartedAt, reason: 'network' }
		: { ok: false, accountId, fetchStartedAt, reason: 'network' };

/** A previously applied complete success at t=10 with items A and B. */
const AB = account({
	firstCheckDone: true,
	lastAttemptAt: 10,
	lastAttemptIntervalMs: INTERVAL,
	lastSuccessAt: 10,
	lastAppliedFetchStartedAt: 10,
	items: itemsOf(tracked('A', 1), tracked('B', 2)),
});
const attempt = (at: number) => ({ lastAttemptAt: at, lastAttemptIntervalMs: INTERVAL });

interface Case {
	name: string;
	stored: Stored;
	result: CheckResult;
	ctx?: ReconcileCtx;
	/** Expected stored output; `'same'` means the very same input object. */
	expected: Stored | 'same';
}

const cases: Case[] = [
	// Rule 1
	{ name: 'rule 1 / matrix "Other account": result for X while Y is active', stored: stored({ Y: AB }), result: ok(20, true, [], 'X'), ctx: { ...ctx, activeAccountId: 'Y' }, expected: 'same' },
	{ name: 'rule 1: X result with Y active is ignored even for a failure', stored: stored({ Y: AB }), result: fail(20, 'X'), expected: 'same' },
	{ name: 'rule 1: result with no accountId is ignored', stored: stored({ Y: AB }), result: fail(20, null), expected: 'same' },
	{ name: 'rule 1: no active account ignores every result', stored: stored({ Y: AB }), result: ok(20, true, []), ctx: { ...ctx, activeAccountId: undefined }, expected: 'same' },
	// Rule 2
	{
		name: 'rule 2: first result for an account creates its partition with attempt fields',
		stored: stored({}),
		result: fail(5),
		expected: stored({ Y: account({ ...attempt(5), lastFailure: { at: 5, reason: 'network' } }) }),
	},
	// Rule 3
	{
		name: 'rule 3 / matrix "Failure": network after success keeps items and sets lastFailure',
		stored: stored({ Y: AB }),
		result: fail(20),
		expected: stored({ Y: { ...AB, ...attempt(20), lastFailure: { at: 20, reason: 'network' } } }),
	},
	// Rule 4
	{
		name: 'rule 4 / matrix "Late result": fetchStartedAt equal to lastAppliedFetchStartedAt',
		stored: stored({ Y: AB }),
		result: ok(10, true, [item('C')]),
		expected: stored({ Y: { ...AB, ...attempt(10) } }),
	},
	{
		name: 'rule 4: an older incomplete success changes only the attempt fields',
		stored: stored({ Y: AB }),
		result: ok(5, false, [item('C')]),
		expected: stored({ Y: { ...AB, ...attempt(5) } }),
	},
	// Rule 5
	{
		name: 'rule 5: new id gets firstSeenAt = now; existing id refreshes fields and keeps firstSeenAt/origin/alert',
		stored: stored({
			Y: account({
				...AB,
				items: itemsOf(
					tracked('A', 1, { origin: 'new', alert: 'shown', requester: 'bob', requestedAt: 3 }),
					tracked('B', 2),
				),
			}),
		}),
		result: ok(20, true, [item('A', { title: 'Renamed', number: 99, requestedAt: 7 }), item('B'), item('C', { requester: 'carol', requestedAt: 9 })]),
		expected: stored({
			Y: {
				...AB,
				...attempt(20),
				lastSuccessAt: 20,
				lastAppliedFetchStartedAt: 20,
				items: itemsOf(
					// requester is dropped because the latest result no longer reports it.
					{ ...item('A', { title: 'Renamed', number: 99, requestedAt: 7 }), firstSeenAt: 1, origin: 'new', alert: 'shown' },
					tracked('B', 2),
					{ ...item('C', { requester: 'carol', requestedAt: 9 }), firstSeenAt: NOW, origin: 'backlog', alert: 'none' },
				),
			},
		}),
	},
	{
		name: 'rule 5: first success sets firstCheckDone with neutral Epic 2 defaults',
		stored: stored({}),
		result: ok(5, true, [item('A')]),
		expected: stored({
			Y: account({ ...attempt(5), firstCheckDone: true, lastSuccessAt: 5, lastAppliedFetchStartedAt: 5, items: itemsOf(tracked('A', NOW)) }),
		}),
	},
	{
		name: 'rule 5: an applied success older than lastFailure keeps it',
		stored: stored({ Y: { ...AB, lastFailure: { at: 30, reason: 'network' } } }),
		result: ok(20, false, [item('A'), item('B')]),
		expected: stored({ Y: { ...AB, ...attempt(20), lastFailure: { at: 30, reason: 'network' }, lastIncompleteFetchStartedAt: 20 } }),
	},
	{
		name: 'rule 5: a complete success after a failure clears lastFailure',
		stored: stored({ Y: { ...AB, lastFailure: { at: 15, reason: 'network' } } }),
		result: ok(20, true, [item('A'), item('B')]),
		expected: stored({ Y: { ...AB, ...attempt(20), lastSuccessAt: 20, lastAppliedFetchStartedAt: 20 } }),
	},
	{
		name: 'rule 5 boundary: an applied success at exactly lastFailure.at keeps lastFailure',
		stored: stored({ Y: { ...AB, lastFailure: { at: 20, reason: 'network' } } }),
		result: ok(20, true, [item('A'), item('B')]),
		expected: stored({
			Y: { ...AB, ...attempt(20), lastSuccessAt: 20, lastAppliedFetchStartedAt: 20, lastFailure: { at: 20, reason: 'network' } },
		}),
	},
	// Rule 6
	{
		name: 'rule 6 boundary: a complete success at exactly lastIncompleteFetchStartedAt deletes nothing',
		stored: stored({ Y: { ...AB, lastIncompleteFetchStartedAt: 20 } }),
		result: ok(20, true, []),
		expected: stored({ Y: { ...AB, ...attempt(20), lastIncompleteFetchStartedAt: 20, lastSuccessAt: 20, lastAppliedFetchStartedAt: 20 } }),
	},
	{
		name: 'rule 6 / matrix "Complete removes": stored {A,B}; complete {A}',
		stored: stored({ Y: AB }),
		result: ok(20, true, [item('A')]),
		expected: stored({ Y: { ...AB, ...attempt(20), lastSuccessAt: 20, lastAppliedFetchStartedAt: 20, items: itemsOf(tracked('A', 1)) } }),
	},
	{
		name: 'rule 6 / matrix "Incomplete keeps": stored {A,B}; incomplete {C}',
		stored: stored({ Y: AB }),
		result: ok(20, false, [item('C')]),
		expected: stored({
			Y: { ...AB, ...attempt(20), lastIncompleteFetchStartedAt: 20, items: itemsOf(tracked('A', 1), tracked('B', 2), tracked('C', NOW)) },
		}),
	},
	{
		name: 'rule 6: lastIncompleteFetchStartedAt keeps the newest of the applied incomplete results',
		stored: stored({ Y: { ...AB, lastIncompleteFetchStartedAt: 40 } }),
		result: ok(30, false, []),
		expected: stored({ Y: { ...AB, ...attempt(30), lastIncompleteFetchStartedAt: 40 } }),
	},
	{
		name: 'rule 6: a complete result newer than the last incomplete one deletes absent ids',
		stored: stored({ Y: { ...AB, lastIncompleteFetchStartedAt: 15 } }),
		result: ok(20, true, []),
		expected: stored({ Y: { ...AB, ...attempt(20), lastIncompleteFetchStartedAt: 15, lastSuccessAt: 20, lastAppliedFetchStartedAt: 20, items: {} } }),
	},
	{
		name: 'matrix "Late complete after newer partial": incomplete {A,C} at t2 applied; complete {A} at t1 < t2 keeps C',
		stored: stored({
			Y: { ...AB, ...attempt(30), lastIncompleteFetchStartedAt: 30, items: itemsOf(tracked('A', 1), tracked('B', 2), tracked('C', 31)) },
		}),
		result: ok(20, true, [item('A')]),
		expected: stored({
			Y: {
				...AB,
				...attempt(20),
				lastIncompleteFetchStartedAt: 30,
				lastSuccessAt: 20,
				lastAppliedFetchStartedAt: 20,
				items: itemsOf(tracked('A', 1), tracked('B', 2), tracked('C', 31)),
			},
		}),
	},
	{
		name: 'matrix "Partial after failure": failure at t1, incomplete success at t2 > t1 clears lastFailure',
		stored: stored({ Y: { ...AB, ...attempt(15), lastFailure: { at: 15, reason: 'network' } } }),
		result: ok(20, false, [item('A')]),
		expected: stored({ Y: { ...AB, ...attempt(20), lastIncompleteFetchStartedAt: 20 } }),
	},
];

for (const c of cases) {
	test(c.name, () => {
		const input = deepFreeze(c.stored);
		const result = deepFreeze(c.result);
		const out = reconcile(input, result, c.ctx ?? ctx);
		assert.deepEqual(out.effects, []);
		if (c.expected === 'same') {
			assert.equal(out.stored, input);
		} else {
			assert.deepEqual(out.stored, c.expected);
		}
	});
}

test('AC: only the active account partition changes; X is untouched (same reference)', () => {
	const X = account({ firstCheckDone: true, lastSuccessAt: 3, items: itemsOf(tracked('X1', 1)) });
	const input = deepFreeze(stored({ X, Y: AB }));
	const out = reconcile(input, deepFreeze(ok(20, true, [])), ctx).stored;
	assert.equal(out.accounts.X, input.accounts.X);
	assert.deepEqual(out.accounts.Y.items, {});
	assert.deepEqual(
		viewModel(out, { connection: { kind: 'connected', accountId: 'Y', label: 'y' }, readOnly: false, checking: false }, { now: NOW, formatTime }).rows,
		[],
	);
});

test('matrix "Reappearance": B removed, later returned is a new Tracked with a new firstSeenAt', () => {
	const afterRemoval = reconcile(deepFreeze(stored({ Y: AB })), deepFreeze(ok(20, true, [item('A')])), ctx).stored;
	assert.equal(afterRemoval.accounts.Y.items.B, undefined);
	const back = reconcile(deepFreeze(afterRemoval), deepFreeze(ok(30, true, [item('A'), item('B')])), { ...ctx, now: 77_000 }).stored;
	assert.deepEqual(back.accounts.Y.items.B, tracked('B', 77_000));
	assert.equal(back.accounts.Y.items.A.firstSeenAt, 1);
});

test('matrix "Failure": status is stale after a failure that follows a success', () => {
	const out = reconcile(deepFreeze(stored({ Y: AB })), deepFreeze(fail(20)), ctx).stored;
	const model = viewModel(out, { connection: { kind: 'connected', accountId: 'Y', label: 'y' }, readOnly: false, checking: false }, { now: NOW, formatTime });
	assert.equal(model.status, 'stale');
	assert.equal(model.rows.length, 2);
});

test('matrix "Partial after failure": status is not stale', () => {
	const failed = reconcile(deepFreeze(stored({ Y: AB })), deepFreeze(fail(15)), ctx).stored;
	const out = reconcile(deepFreeze(failed), deepFreeze(ok(20, false, [item('A')])), ctx).stored;
	const model = viewModel(out, { connection: { kind: 'connected', accountId: 'Y', label: 'y' }, readOnly: false, checking: false }, { now: NOW, formatTime });
	assert.equal(model.status, 'pending');
});

test('AC: a partial (incomplete) result never deletes, even when it omits every stored item', () => {
	const out = reconcile(deepFreeze(stored({ Y: AB })), deepFreeze(ok(20, false, [])), ctx).stored;
	assert.deepEqual(Object.keys(out.accounts.Y.items).sort(), ['A', 'B']);
});

test('optional fields are omitted rather than set to undefined', () => {
	const out = reconcile(deepFreeze(stored({})), deepFreeze(ok(5, true, [item('A')])), ctx).stored;
	const json = JSON.parse(JSON.stringify(out));
	assert.deepEqual(out, json);
	assert.ok(!('requester' in out.accounts.Y.items.A));
	assert.ok(!('lastFailure' in out.accounts.Y));
});
