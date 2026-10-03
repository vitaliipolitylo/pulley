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
const ctx: ReconcileCtx = { now: NOW, activeAccountId: 'Y', intervalMs: INTERVAL, windowFocused: false };

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
/** A newly observed item classified new: its alert is pending. */
const newTracked = (id: string, firstSeenAt: number, extra: Partial<Tracked> = {}): Tracked =>
	tracked(id, firstSeenAt, { origin: 'new', alert: 'pending', ...extra });
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
				newSignal: true,
				items: itemsOf(
					// requester is dropped because the latest result no longer reports it.
					{ ...item('A', { title: 'Renamed', number: 99, requestedAt: 7 }), firstSeenAt: 1, origin: 'new', alert: 'shown' },
					tracked('B', 2),
					{ ...item('C', { requester: 'carol', requestedAt: 9 }), firstSeenAt: NOW, origin: 'new', alert: 'pending' },
				),
			},
		}),
	},
	{
		name: 'rule 5 / matrix "Before baseline": first success sets firstCheckDone; added items are backlog',
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
			Y: { ...AB, ...attempt(20), lastIncompleteFetchStartedAt: 20, newSignal: true, items: itemsOf(tracked('A', 1), tracked('B', 2), newTracked('C', NOW)) },
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
	// Review fixes: the newest evidence wins.
	{
		name: 'review fix: an older success after a newer incomplete keeps existing metadata, adds new ids, keeps bookkeeping and the deletion guard',
		stored: stored({
			Y: { ...AB, ...attempt(9), lastSuccessAt: 2, lastAppliedFetchStartedAt: 2, lastIncompleteFetchStartedAt: 9, items: itemsOf(tracked('A', 1, { title: 'Newer A' }), tracked('B', 2)) },
		}),
		result: ok(4, true, [item('A', { title: 'Older A', requestedAt: 3 }), item('C')]),
		expected: stored({
			Y: {
				...AB,
				...attempt(4),
				lastIncompleteFetchStartedAt: 9,
				lastSuccessAt: 4,
				lastAppliedFetchStartedAt: 4,
				newSignal: true,
				items: itemsOf(tracked('A', 1, { title: 'Newer A' }), tracked('B', 2), newTracked('C', NOW)),
			},
		}),
	},
	{
		name: 'review fix: an older failure applied after a newer failure keeps the newer lastFailure; attempt fields still record',
		stored: stored({ Y: { ...AB, lastFailure: { at: 9, reason: 'rate_limited' } } }),
		result: fail(4),
		expected: stored({ Y: { ...AB, ...attempt(4), lastFailure: { at: 9, reason: 'rate_limited' } } }),
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
		viewModel(out, { connection: { kind: 'connected', accountId: 'Y', label: 'y', generation: 1 }, readOnly: false, checking: false }, { now: NOW, formatTime }).rows,
		[],
	);
});

test('matrix "Reappearance": B removed, later returned is a new Tracked with a new firstSeenAt', () => {
	const afterRemoval = reconcile(deepFreeze(stored({ Y: AB })), deepFreeze(ok(20, true, [item('A')])), ctx).stored;
	assert.equal(afterRemoval.accounts.Y.items.B, undefined);
	const back = reconcile(deepFreeze(afterRemoval), deepFreeze(ok(30, true, [item('A'), item('B')])), { ...ctx, now: 77_000 }).stored;
	assert.deepEqual(back.accounts.Y.items.B, newTracked('B', 77_000));
	assert.equal(back.accounts.Y.items.A.firstSeenAt, 1);
});

test('matrix "Failure": status is stale after a failure that follows a success', () => {
	const out = reconcile(deepFreeze(stored({ Y: AB })), deepFreeze(fail(20)), ctx).stored;
	const model = viewModel(out, { connection: { kind: 'connected', accountId: 'Y', label: 'y', generation: 1 }, readOnly: false, checking: false }, { now: NOW, formatTime });
	assert.equal(model.status, 'stale');
	assert.equal(model.rows.length, 2);
});

test('matrix "Partial after failure": status is not stale', () => {
	const failed = reconcile(deepFreeze(stored({ Y: AB })), deepFreeze(fail(15)), ctx).stored;
	const out = reconcile(deepFreeze(failed), deepFreeze(ok(20, false, [item('A')])), ctx).stored;
	const model = viewModel(out, { connection: { kind: 'connected', accountId: 'Y', label: 'y', generation: 1 }, readOnly: false, checking: false }, { now: NOW, formatTime });
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

// ---------------------------------------------------------------------------
// Story 2.1: new/backlog classification, newSignal, and focus-gated delivery (AD-7, AD-9).
// The interval I = 900 000 ms and the previous attempt was at T.
// ---------------------------------------------------------------------------

const T = 1_000_000;
const I = INTERVAL;
const focused: ReconcileCtx = { ...ctx, windowFocused: true };
/** The baseline is done: a complete success at T, with the given fields. */
const baseline = (extra: Partial<Account> = {}): Account =>
	account({ firstCheckDone: true, ...attempt(T), lastSuccessAt: T, lastAppliedFetchStartedAt: T, ...extra });
/** A complete success applied at `at`. */
const completeAt = (at: number) => ({ ...attempt(at), lastSuccessAt: at, lastAppliedFetchStartedAt: at });
const notifyNew = (itemId: string, accountId = 'Y') => ({ kind: 'notifyNew' as const, accountId, itemId });

interface AlertCase {
	name: string;
	stored: Stored;
	result: CheckResult;
	ctx: ReconcileCtx;
	/** Expected stored output; `'same'` means the very same input object. */
	expected: Stored | 'same';
	effects: ReturnType<typeof notifyNew>[];
}

const alertCases: AlertCase[] = [
	{
		name: 'matrix "New, focused": a complete success at T+I adds X: new/shown, newSignal, one notifyNew',
		stored: stored({ Y: baseline() }),
		result: ok(T + I, true, [item('X')]),
		ctx: focused,
		expected: stored({ Y: baseline({ ...completeAt(T + I), newSignal: true, items: itemsOf(newTracked('X', NOW, { alert: 'shown' })) }) }),
		effects: [notifyNew('X')],
	},
	{
		name: 'matrix "New, unfocused": X is pending and nothing is emitted',
		stored: stored({ Y: baseline() }),
		result: ok(T + I, true, [item('X')]),
		ctx,
		expected: stored({ Y: baseline({ ...completeAt(T + I), newSignal: true, items: itemsOf(newTracked('X', NOW)) }) }),
		effects: [],
	},
	{
		name: 'matrix "Gap": a success at T+2I+1 adds X as backlog with no effect; newSignal false',
		stored: stored({ Y: baseline({ newSignal: true }) }),
		result: ok(T + 2 * I + 1, true, [item('X')]),
		ctx: focused,
		expected: stored({ Y: baseline({ ...completeAt(T + 2 * I + 1), newSignal: false, items: itemsOf(tracked('X', NOW)) }) }),
		effects: [],
	},
	{
		name: 'matrix "Gap boundary": a success at exactly T+2I adds X as new',
		stored: stored({ Y: baseline() }),
		result: ok(T + 2 * I, true, [item('X')]),
		ctx,
		expected: stored({ Y: baseline({ ...completeAt(T + 2 * I), newSignal: true, items: itemsOf(newTracked('X', NOW)) }) }),
		effects: [],
	},
	{
		name: 'matrix "Before baseline": only incomplete successes so far (no lastSuccessAt), so added items are backlog',
		stored: stored({ Y: account({ firstCheckDone: true, ...attempt(T), lastIncompleteFetchStartedAt: T }) }),
		result: ok(T + I, false, [item('X')]),
		ctx: focused,
		expected: stored({ Y: account({ firstCheckDone: true, ...attempt(T + I), lastIncompleteFetchStartedAt: T + I, items: itemsOf(tracked('X', NOW)) }) }),
		effects: [],
	},
	{
		name: 'baseline predicate: an unknown previous interval makes added items backlog',
		stored: stored({ Y: { ...baseline(), lastAttemptIntervalMs: undefined } }),
		result: ok(T + I, true, [item('X')]),
		ctx: focused,
		expected: stored({ Y: baseline({ ...completeAt(T + I), items: itemsOf(tracked('X', NOW)) }) }),
		effects: [],
	},
	{
		name: 'matrix "Already shown": a later poll that still has X emits nothing more',
		stored: stored({ Y: baseline({ newSignal: true, items: itemsOf(newTracked('X', 5, { alert: 'shown' })) }) }),
		result: ok(T + I, true, [item('X')]),
		ctx: focused,
		expected: stored({ Y: baseline({ ...completeAt(T + I), newSignal: false, items: itemsOf(newTracked('X', 5, { alert: 'shown' })) }) }),
		effects: [],
	},
	{
		name: 'matrix "Re-request kept": requester/requestedAt change updates metadata only; origin and alert stay',
		stored: stored({ Y: baseline({ items: itemsOf(newTracked('X', 5, { alert: 'shown', requester: 'bob', requestedAt: 1 })) }) }),
		result: ok(T + I, true, [item('X', { requester: 'carol', requestedAt: 2 })]),
		ctx: focused,
		expected: stored({ Y: baseline({ ...completeAt(T + I), items: itemsOf(newTracked('X', 5, { alert: 'shown', requester: 'carol', requestedAt: 2 })) }) }),
		effects: [],
	},
	{
		name: 'matrix "Incomplete omits": X pending; an incomplete success lacking X keeps it pending',
		stored: stored({ Y: baseline({ newSignal: true, items: itemsOf(newTracked('X', 5)) }) }),
		result: ok(T + I, false, [item('Z')]),
		ctx,
		expected: stored({
			Y: baseline({ ...attempt(T + I), lastIncompleteFetchStartedAt: T + I, newSignal: true, items: itemsOf(newTracked('X', 5), newTracked('Z', NOW)) }),
		}),
		effects: [],
	},
	{
		name: 'matrix "Gone first": X pending is deleted by a complete check before focus, so no effect',
		stored: stored({ Y: baseline({ newSignal: true, items: itemsOf(newTracked('X', 5)) }) }),
		result: ok(T + I, true, []),
		ctx: focused,
		expected: stored({ Y: baseline({ ...completeAt(T + I), newSignal: false }) }),
		effects: [],
	},
	{
		name: 'matrix "Focused failure" (A2): queue and newSignal unchanged; X shown and emitted',
		stored: stored({ Y: baseline({ newSignal: true, items: itemsOf(newTracked('X', 5), tracked('B', 2)) }) }),
		result: fail(T + I),
		ctx: focused,
		expected: stored({
			Y: baseline({
				...attempt(T + I),
				lastFailure: { at: T + I, reason: 'network' },
				newSignal: true,
				items: itemsOf(newTracked('X', 5, { alert: 'shown' }), tracked('B', 2)),
			}),
		}),
		effects: [notifyNew('X')],
	},
	{
		name: 'unfocused failure: nothing delivered, X stays pending',
		stored: stored({ Y: baseline({ newSignal: true, items: itemsOf(newTracked('X', 5)) }) }),
		result: fail(T + I),
		ctx,
		expected: stored({ Y: baseline({ ...attempt(T + I), lastFailure: { at: T + I, reason: 'network' }, newSignal: true, items: itemsOf(newTracked('X', 5)) }) }),
		effects: [],
	},
	{
		name: 'rule-4 no-op, focused: attempt fields recorded, newSignal unchanged, pending X delivered',
		stored: stored({ Y: baseline({ newSignal: true, items: itemsOf(newTracked('X', 5)) }) }),
		result: ok(T, true, [item('Z')]),
		ctx: focused,
		expected: stored({ Y: baseline({ newSignal: true, items: itemsOf(newTracked('X', 5, { alert: 'shown' })) }) }),
		effects: [notifyNew('X')],
	},
	{
		name: "matrix \"Rule-1 rejection\" (A2, X3): another account's result is dropped; Y's pending X is delivered once",
		stored: stored({ Y: baseline({ newSignal: true, items: itemsOf(newTracked('X', 5)) }) }),
		result: ok(T + I, true, [item('Q')], 'Z'),
		ctx: focused,
		expected: stored({ Y: baseline({ newSignal: true, items: itemsOf(newTracked('X', 5, { alert: 'shown' })) }) }),
		effects: [notifyNew('X')],
	},
	{
		name: 'rule-1 rejection with nothing pending returns the same stored',
		stored: stored({ Y: baseline({ items: itemsOf(newTracked('X', 5, { alert: 'shown' })) }) }),
		result: fail(T + I, 'Z'),
		ctx: focused,
		expected: 'same',
		effects: [],
	},
	{
		name: 'rule-1 rejection, unfocused: same stored even with something pending',
		stored: stored({ Y: baseline({ items: itemsOf(newTracked('X', 5)) }) }),
		result: fail(T + I, 'Z'),
		ctx,
		expected: 'same',
		effects: [],
	},
	{
		name: 'X3: no active account gives the same stored and delivers nothing',
		stored: stored({ Y: baseline({ items: itemsOf(newTracked('X', 5)) }) }),
		result: ok(T + I, true, [item('Q')]),
		ctx: { ...focused, activeAccountId: undefined },
		expected: 'same',
		effects: [],
	},
	{
		name: 'X3: an active account absent from stored gives the same stored on a rule-1 rejection',
		stored: stored({ Y: baseline({ items: itemsOf(newTracked('X', 5)) }) }),
		result: fail(T + I, null),
		ctx: { ...focused, activeAccountId: 'W' },
		expected: 'same',
		effects: [],
	},
	{
		name: 'several new items in one focused success: one notifyNew each, sorted by id',
		stored: stored({ Y: baseline() }),
		result: ok(T + I, true, [item('C'), item('A'), item('B')]),
		ctx: focused,
		expected: stored({
			Y: baseline({
				...completeAt(T + I),
				newSignal: true,
				items: itemsOf(newTracked('C', NOW, { alert: 'shown' }), newTracked('A', NOW, { alert: 'shown' }), newTracked('B', NOW, { alert: 'shown' })),
			}),
		}),
		effects: [notifyNew('A'), notifyNew('B'), notifyNew('C')],
	},
];

for (const c of alertCases) {
	test(`story 2.1 / ${c.name}`, () => {
		const input = deepFreeze(c.stored);
		const out = reconcile(input, deepFreeze(c.result), c.ctx);
		assert.deepEqual(out.effects, c.effects);
		if (c.expected === 'same') {
			assert.equal(out.stored, input);
		} else {
			assert.deepEqual(out.stored, c.expected);
		}
	});
}

test('story 2.1 / matrix "New cycle": a complete check omits X, then X returns without a gap as a new pending alert, delivered once', () => {
	const shown = deepFreeze(stored({ Y: baseline({ items: itemsOf(newTracked('X', 5, { alert: 'shown' })) }) }));
	const removed = reconcile(shown, deepFreeze(ok(T + I, true, [])), focused);
	assert.deepEqual(removed.effects, []);
	assert.equal(removed.stored.accounts.Y.items.X, undefined);
	const back = reconcile(deepFreeze(removed.stored), deepFreeze(ok(T + 2 * I, true, [item('X')])), ctx);
	assert.deepEqual(back.stored.accounts.Y.items.X, newTracked('X', NOW));
	assert.deepEqual(back.effects, []);
	const delivered = reconcile(deepFreeze(back.stored), deepFreeze(ok(T + 3 * I, true, [item('X')])), focused);
	assert.deepEqual(delivered.effects, [notifyNew('X')]);
	const again = reconcile(deepFreeze(delivered.stored), deepFreeze(ok(T + 4 * I, true, [item('X')])), focused);
	assert.deepEqual(again.effects, []);
});

test('story 2.1 / matrix "Failure after a gap": a failure at T+3I, then a complete success at T+3I+I/2 adds X as backlog', () => {
	const failed = reconcile(deepFreeze(stored({ Y: baseline() })), deepFreeze(fail(T + 3 * I)), focused);
	assert.deepEqual(failed.effects, []);
	const out = reconcile(deepFreeze(failed.stored), deepFreeze(ok(T + 3 * I + I / 2, true, [item('X')])), focused);
	assert.deepEqual(out.effects, []);
	assert.deepEqual(out.stored.accounts.Y.items.X, tracked('X', NOW));
	assert.equal(out.stored.accounts.Y.newSignal, false);
});

test('story 2.1 / matrix "Incomplete inside gap": an incomplete success at T+I, then a complete success at T+2I+1 adds X as backlog', () => {
	const partial = reconcile(deepFreeze(stored({ Y: baseline() })), deepFreeze(ok(T + I, false, [])), focused);
	const out = reconcile(deepFreeze(partial.stored), deepFreeze(ok(T + 2 * I + 1, true, [item('X')])), focused);
	assert.deepEqual(out.effects, []);
	assert.deepEqual(out.stored.accounts.Y.items.X, tracked('X', NOW));
	assert.equal(out.stored.accounts.Y.newSignal, false);
});

test('story 2.1 / rule-1 rejection delivers only the active account; the other account is untouched', () => {
	const input = deepFreeze(stored({ Y: baseline({ items: itemsOf(newTracked('X', 5)) }), Z: baseline({ items: itemsOf(newTracked('Q', 5)) }) }));
	const out = reconcile(input, deepFreeze(fail(T + I, 'Z')), focused);
	assert.deepEqual(out.effects, [notifyNew('X')]);
	assert.equal(out.stored.accounts.Z, input.accounts.Z);
});
