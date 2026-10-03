// Table-driven windowFocused / deliverPending tests (AD-9). Every input is deep-frozen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyAccount } from '../../src/core/reconcile.ts';
import type { Account, Effect, Stored, Tracked } from '../../src/core/types.ts';
import { deliverPending, windowFocused, type WindowFocusedCtx } from '../../src/core/windowFocused.ts';

function deepFreeze<T>(value: T): T {
	if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const child of Object.values(value)) {
			deepFreeze(child);
		}
	}
	return value;
}

const tracked = (id: string, alert: Tracked['alert'], origin: Tracked['origin'] = 'new'): Tracked => ({
	id,
	repo: 'octo/app',
	number: 1,
	title: `Title ${id}`,
	author: 'alice',
	url: `https://github.com/octo/app/pull/${id}`,
	firstSeenAt: 1,
	origin,
	alert,
});
const account = (...items: Tracked[]): Account => ({
	...emptyAccount(),
	firstCheckDone: true,
	newSignal: true,
	items: Object.fromEntries(items.map((t) => [t.id, t])),
});
const stored = (accounts: Record<string, Account>): Stored => ({ schemaVersion: 1, accounts });
const notifyNew = (itemId: string, accountId = 'Y') => ({ kind: 'notifyNew' as const, accountId, itemId });
const TODAY = '2026-10-03';

interface Case {
	name: string;
	stored: Stored;
	ctx: WindowFocusedCtx;
	expected: Stored | 'same';
	effects: Effect[];
}

const cases: Case[] = [
	{
		name: 'matrix "New, unfocused" then focus: pending X becomes shown and is emitted once',
		stored: stored({ Y: account(tracked('X', 'pending'), tracked('B', 'none', 'backlog')) }),
		ctx: { activeAccountId: 'Y', today: TODAY },
		expected: stored({ Y: account(tracked('X', 'shown'), tracked('B', 'none', 'backlog')) }),
		effects: [notifyNew('X')],
	},
	{
		name: 'several pending items: one effect each, sorted by id; newSignal untouched',
		stored: stored({ Y: account(tracked('c', 'pending'), tracked('a', 'pending'), tracked('b', 'shown')) }),
		ctx: { activeAccountId: 'Y', today: TODAY },
		expected: stored({ Y: account(tracked('c', 'shown'), tracked('a', 'shown'), tracked('b', 'shown')) }),
		effects: [notifyNew('a'), notifyNew('c')],
	},
	{
		name: 'matrix "Already shown": nothing pending returns the same stored (the store skips the write)',
		stored: stored({ Y: account(tracked('X', 'shown')) }),
		ctx: { activeAccountId: 'Y', today: TODAY },
		expected: 'same',
		effects: [],
	},
	{
		name: 'B2: no active account (focus before the first lookup settles) is a no-op',
		stored: stored({ Y: account(tracked('X', 'pending')) }),
		ctx: { activeAccountId: undefined, today: TODAY },
		expected: 'same',
		effects: [],
	},
	{
		name: 'an active account absent from stored is a no-op',
		stored: stored({ Y: account(tracked('X', 'pending')) }),
		ctx: { activeAccountId: 'W', today: TODAY },
		expected: 'same',
		effects: [],
	},
	{
		name: "rule 1: another account's pending items are not delivered",
		stored: stored({ Y: account(tracked('X', 'pending')), Z: account(tracked('Q', 'pending')) }),
		ctx: { activeAccountId: 'Z', today: TODAY },
		expected: stored({ Y: account(tracked('X', 'pending')), Z: account(tracked('Q', 'shown')) }),
		effects: [notifyNew('Q', 'Z')],
	},
];

for (const c of cases) {
	test(`windowFocused / ${c.name}`, () => {
		const input = deepFreeze(c.stored);
		const out = windowFocused(input, undefined, c.ctx);
		assert.deepEqual(out.effects, c.effects);
		if (c.expected === 'same') {
			assert.equal(out.stored, input);
		} else {
			assert.deepEqual(out.stored, c.expected);
		}
	});
}

test('windowFocused / a second focus after delivery emits nothing more and returns the same stored', () => {
	const first = windowFocused(deepFreeze(stored({ Y: account(tracked('X', 'pending')) })), undefined, { activeAccountId: 'Y', today: TODAY });
	const secondInput = deepFreeze(first.stored);
	const second = windowFocused(secondInput, undefined, { activeAccountId: 'Y', today: TODAY });
	assert.equal(second.stored, secondInput);
	assert.deepEqual(second.effects, []);
});

test('windowFocused / the other account partition keeps its reference', () => {
	const input = deepFreeze(stored({ Y: account(tracked('X', 'pending')), Z: account(tracked('Q', 'pending')) }));
	const out = windowFocused(input, undefined, { activeAccountId: 'Y', today: TODAY });
	assert.equal(out.stored.accounts.Z, input.accounts.Z);
});

test('deliverPending / unfocused returns the same account and no effects, even with pending items', () => {
	const acct = deepFreeze(account(tracked('X', 'pending')));
	const out = deliverPending('Y', acct, { focused: false, today: TODAY });
	assert.equal(out.account, acct);
	assert.deepEqual(out.effects, []);
});

test('deliverPending / focused with nothing pending returns the same account', () => {
	const acct = deepFreeze(account(tracked('X', 'shown'), tracked('B', 'none', 'backlog')));
	const out = deliverPending('Y', acct, { focused: true, today: TODAY });
	assert.equal(out.account, acct);
	assert.deepEqual(out.effects, []);
});

test('deliverPending / never decides new alerts: none/backlog items stay none', () => {
	const acct = deepFreeze(account(tracked('X', 'pending'), tracked('B', 'none', 'backlog')));
	const out = deliverPending('Y', acct, { focused: true, today: TODAY });
	assert.equal(out.account.items.B, acct.items.B);
	assert.deepEqual(out.effects, [notifyNew('X')]);
});

// ---------------------------------------------------------------------------
// Story 2.2: backlog reminder delivery (AD-8, A4, A5, E3).
// ---------------------------------------------------------------------------

const D = '2026-10-02';
const D1 = '2026-10-03';
const notifyBacklog = (count: number, firstConnection: boolean, accountId = 'Y'): Effect => ({ kind: 'notifyBacklog', accountId, count, firstConnection });
const withReminder = (acct: Account, backlogAlert: Account['backlogAlert'], lastBacklogReminderDate?: string): Account =>
	lastBacklogReminderDate === undefined ? { ...acct, backlogAlert } : { ...acct, backlogAlert, lastBacklogReminderDate };
const backlogItems = () => [tracked('A', 'none', 'backlog'), tracked('B', 'none', 'backlog'), tracked('C', 'none', 'backlog')];

interface BacklogCase {
	name: string;
	account: Account;
	options: { focused: boolean; today: string };
	expected: Account | 'same';
	effects: Effect[];
}

const backlogCases: BacklogCase[] = [
	{
		name: 'matrix "First connection, items": a pending first-connection alert, focused: shown, one notifyBacklog {3, true}, no notifyNew',
		account: withReminder(account(...backlogItems()), { state: 'pending', firstConnection: true }, D1),
		options: { focused: true, today: D1 },
		expected: withReminder(account(...backlogItems()), { state: 'shown', firstConnection: true }, D1),
		effects: [notifyBacklog(3, true)],
	},
	{
		name: 'matrix "Unfocused": a pending reminder stays pending (same account)',
		account: withReminder(account(...backlogItems()), { state: 'pending', firstConnection: false }, D),
		options: { focused: false, today: D },
		expected: 'same',
		effects: [],
	},
	{
		name: 'matrix "Pending at midnight" (A4, E3): decided on D, delivered on D+1 records D+1',
		account: withReminder(account(...backlogItems()), { state: 'pending', firstConnection: false }, D),
		options: { focused: true, today: D1 },
		expected: withReminder(account(...backlogItems()), { state: 'shown', firstConnection: false }, D1),
		effects: [notifyBacklog(3, false)],
	},
	{
		name: 'matrix "Pending first connection, next day" (A5): delivers {n, true} on D+1 and records D+1',
		account: withReminder(account(...backlogItems()), { state: 'pending', firstConnection: true }, D),
		options: { focused: true, today: D1 },
		expected: withReminder(account(...backlogItems()), { state: 'shown', firstConnection: true }, D1),
		effects: [notifyBacklog(3, true)],
	},
	{
		name: 'matrix "Emptied", focused: a pending reminder with zero items becomes none, no effect, date stays D',
		account: withReminder(account(), { state: 'pending', firstConnection: false }, D),
		options: { focused: true, today: D1 },
		expected: withReminder(account(), 'none', D),
		effects: [],
	},
	{
		name: 'matrix "Emptied", unfocused: still becomes none with no effect (exception to the same-reference rule)',
		account: withReminder(account(), { state: 'pending', firstConnection: true }, D),
		options: { focused: false, today: D },
		expected: withReminder(account(), 'none', D),
		effects: [],
	},
	{
		name: 'a shown reminder is never delivered again',
		account: withReminder(account(...backlogItems()), { state: 'shown', firstConnection: false }, D),
		options: { focused: true, today: D1 },
		expected: 'same',
		effects: [],
	},
	{
		name: 'a pending reminder and a pending new item: notifyBacklog (count of every item) then notifyNew',
		account: withReminder(account(tracked('X', 'pending'), tracked('B', 'none', 'backlog')), { state: 'pending', firstConnection: false }, D),
		options: { focused: true, today: D },
		expected: withReminder(account(tracked('X', 'shown'), tracked('B', 'none', 'backlog')), { state: 'shown', firstConnection: false }, D),
		effects: [notifyBacklog(2, false), notifyNew('X')],
	},
];

for (const c of backlogCases) {
	test(`deliverPending / story 2.2 / ${c.name}`, () => {
		const input = deepFreeze(c.account);
		const out = deliverPending('Y', input, c.options);
		assert.deepEqual(out.effects, c.effects);
		if (c.expected === 'same') {
			assert.equal(out.account, input);
		} else {
			assert.deepEqual(out.account, c.expected);
		}
	});
}

test('windowFocused / story 2.2 / matrix "Unfocused": focus delivers the pending reminder once; a second focus does nothing', () => {
	const input = deepFreeze(stored({ Y: withReminder(account(...backlogItems()), { state: 'pending', firstConnection: false }, D) }));
	const first = windowFocused(input, undefined, { activeAccountId: 'Y', today: D });
	assert.deepEqual(first.effects, [notifyBacklog(3, false)]);
	assert.deepEqual(first.stored.accounts.Y.backlogAlert, { state: 'shown', firstConnection: false });
	assert.equal(first.stored.accounts.Y.lastBacklogReminderDate, D);
	const secondInput = deepFreeze(first.stored);
	const second = windowFocused(secondInput, undefined, { activeAccountId: 'Y', today: D });
	assert.equal(second.stored, secondInput);
	assert.deepEqual(second.effects, []);
});

test("windowFocused / story 2.2: another account's pending reminder is not delivered", () => {
	const input = deepFreeze(
		stored({ Y: account(tracked('X', 'shown')), Z: withReminder(account(...backlogItems()), { state: 'pending', firstConnection: false }, D) }),
	);
	const out = windowFocused(input, undefined, { activeAccountId: 'Y', today: D });
	assert.equal(out.stored, input);
	assert.deepEqual(out.effects, []);
});
