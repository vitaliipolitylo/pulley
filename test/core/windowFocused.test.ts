// Table-driven windowFocused / deliverPending tests (AD-9). Every input is deep-frozen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyAccount } from '../../src/core/reconcile.ts';
import type { Account, Stored, Tracked } from '../../src/core/types.ts';
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

interface Case {
	name: string;
	stored: Stored;
	ctx: WindowFocusedCtx;
	expected: Stored | 'same';
	effects: ReturnType<typeof notifyNew>[];
}

const cases: Case[] = [
	{
		name: 'matrix "New, unfocused" then focus: pending X becomes shown and is emitted once',
		stored: stored({ Y: account(tracked('X', 'pending'), tracked('B', 'none', 'backlog')) }),
		ctx: { activeAccountId: 'Y' },
		expected: stored({ Y: account(tracked('X', 'shown'), tracked('B', 'none', 'backlog')) }),
		effects: [notifyNew('X')],
	},
	{
		name: 'several pending items: one effect each, sorted by id; newSignal untouched',
		stored: stored({ Y: account(tracked('c', 'pending'), tracked('a', 'pending'), tracked('b', 'shown')) }),
		ctx: { activeAccountId: 'Y' },
		expected: stored({ Y: account(tracked('c', 'shown'), tracked('a', 'shown'), tracked('b', 'shown')) }),
		effects: [notifyNew('a'), notifyNew('c')],
	},
	{
		name: 'matrix "Already shown": nothing pending returns the same stored (the store skips the write)',
		stored: stored({ Y: account(tracked('X', 'shown')) }),
		ctx: { activeAccountId: 'Y' },
		expected: 'same',
		effects: [],
	},
	{
		name: 'B2: no active account (focus before the first lookup settles) is a no-op',
		stored: stored({ Y: account(tracked('X', 'pending')) }),
		ctx: { activeAccountId: undefined },
		expected: 'same',
		effects: [],
	},
	{
		name: 'an active account absent from stored is a no-op',
		stored: stored({ Y: account(tracked('X', 'pending')) }),
		ctx: { activeAccountId: 'W' },
		expected: 'same',
		effects: [],
	},
	{
		name: "rule 1: another account's pending items are not delivered",
		stored: stored({ Y: account(tracked('X', 'pending')), Z: account(tracked('Q', 'pending')) }),
		ctx: { activeAccountId: 'Z' },
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
	const first = windowFocused(deepFreeze(stored({ Y: account(tracked('X', 'pending')) })), undefined, { activeAccountId: 'Y' });
	const secondInput = deepFreeze(first.stored);
	const second = windowFocused(secondInput, undefined, { activeAccountId: 'Y' });
	assert.equal(second.stored, secondInput);
	assert.deepEqual(second.effects, []);
});

test('windowFocused / the other account partition keeps its reference', () => {
	const input = deepFreeze(stored({ Y: account(tracked('X', 'pending')), Z: account(tracked('Q', 'pending')) }));
	const out = windowFocused(input, undefined, { activeAccountId: 'Y' });
	assert.equal(out.stored.accounts.Z, input.accounts.Z);
});

test('deliverPending / unfocused returns the same account and no effects, even with pending items', () => {
	const acct = deepFreeze(account(tracked('X', 'pending')));
	const out = deliverPending('Y', acct, { focused: false });
	assert.equal(out.account, acct);
	assert.deepEqual(out.effects, []);
});

test('deliverPending / focused with nothing pending returns the same account', () => {
	const acct = deepFreeze(account(tracked('X', 'shown'), tracked('B', 'none', 'backlog')));
	const out = deliverPending('Y', acct, { focused: true });
	assert.equal(out.account, acct);
	assert.deepEqual(out.effects, []);
});

test('deliverPending / never decides new alerts: none/backlog items stay none', () => {
	const acct = deepFreeze(account(tracked('X', 'pending'), tracked('B', 'none', 'backlog')));
	const out = deliverPending('Y', acct, { focused: true });
	assert.equal(out.account.items.B, acct.items.B);
	assert.deepEqual(out.effects, [notifyNew('X')]);
});
