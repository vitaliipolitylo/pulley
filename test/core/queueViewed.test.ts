import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queueViewed } from '../../src/core/queueViewed.ts';
import { emptyAccount } from '../../src/core/reconcile.ts';
import type { Stored } from '../../src/core/types.ts';

const stored = (yNewSignal: boolean, xNewSignal = true): Stored => ({
	schemaVersion: 1,
	accounts: {
		X: { ...emptyAccount(), newSignal: xNewSignal },
		Y: { ...emptyAccount(), newSignal: yNewSignal },
	},
});

test('matrix "Queue opened": newSignal true → false on the active account, no effect', () => {
	const before = stored(true);
	const snapshot = structuredClone(before);
	const out = queueViewed(before, undefined, { activeAccountId: 'Y' });
	assert.equal(out.stored.accounts.Y.newSignal, false);
	assert.deepEqual(out.effects, []);
	assert.equal(out.report, undefined);
	assert.deepEqual(before, snapshot, 'input not mutated');
	// Rule 1: other accounts are untouched.
	assert.equal(out.stored.accounts.X, before.accounts.X);
	assert.equal(out.stored.accounts.X.newSignal, true);
	assert.deepEqual({ ...out.stored.accounts.Y, newSignal: true }, before.accounts.Y, 'only newSignal changes');
});

test('already false: the same reference, so the store skips the write', () => {
	const before = stored(false);
	const out = queueViewed(before, undefined, { activeAccountId: 'Y' });
	assert.equal(out.stored, before);
	assert.deepEqual(out.effects, []);
});

test('no active account, or no partition for it: a no-op', () => {
	const before = stored(true);
	assert.equal(queueViewed(before, undefined, { activeAccountId: undefined }).stored, before);
	assert.equal(queueViewed(before, undefined, { activeAccountId: 'Z' }).stored, before);
});
