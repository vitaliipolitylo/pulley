import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyStored, migrate } from '../../src/core/migrate.ts';
import type { Stored } from '../../src/core/types.ts';

const v1: Stored = {
	schemaVersion: 1,
	accounts: {
		Y: {
			firstCheckDone: true,
			lastSuccessAt: 5,
			lastAppliedFetchStartedAt: 5,
			backlogAlert: 'none',
			newSignal: false,
			items: {
				A: { id: 'A', repo: 'o/r', number: 1, title: 'T', author: 'a', url: 'u', firstSeenAt: 1, origin: 'backlog', alert: 'none' },
			},
		},
	},
};

test('undefined (nothing stored yet) is empty v1, not malformed', () => {
	assert.deepEqual(migrate(undefined), { readOnly: false, stored: emptyStored() });
});

test('v1 is returned as-is (same object, not mutated)', () => {
	const raw = Object.freeze(structuredClone(v1));
	const result = migrate(raw);
	assert.equal(result.readOnly, false);
	assert.ok(!result.readOnly);
	assert.equal(result.stored, raw);
	assert.equal(result.malformed, undefined);
	assert.deepEqual(raw, v1);
});

test('v1 with no accounts yet is valid', () => {
	assert.deepEqual(migrate({ schemaVersion: 1, accounts: {} }), { readOnly: false, stored: { schemaVersion: 1, accounts: {} } });
});

test('newer schemaVersion is read-only', () => {
	assert.deepEqual(migrate({ schemaVersion: 2, accounts: { anything: 'goes' } }), { readOnly: true, schemaVersion: 2 });
});

const malformed: Array<[string, unknown]> = [
	['null', null],
	['a string', 'oops'],
	['an array', []],
	['no schemaVersion', { accounts: {} }],
	['schemaVersion 0', { schemaVersion: 0, accounts: {} }],
	['non-integer schemaVersion', { schemaVersion: 1.5, accounts: {} }],
	['string schemaVersion', { schemaVersion: '1', accounts: {} }],
	['no accounts map', { schemaVersion: 1 }],
	['accounts is an array', { schemaVersion: 1, accounts: [] }],
	['account without items', { schemaVersion: 1, accounts: { Y: { firstCheckDone: true } } }],
	['account is null', { schemaVersion: 1, accounts: { Y: null } }],
	['item entry is null', { schemaVersion: 1, accounts: { Y: { ...v1.accounts.Y, items: { A: null } } } }],
	['item entry without string id', { schemaVersion: 1, accounts: { Y: { ...v1.accounts.Y, items: { A: { id: 1, firstSeenAt: 1 } } } } }],
	['item entry without numeric firstSeenAt', { schemaVersion: 1, accounts: { Y: { ...v1.accounts.Y, items: { A: { id: 'A' } } } } }],
];

for (const [name, raw] of malformed) {
	test(`malformed (${name}) is empty v1 with a named problem`, () => {
		const result = migrate(raw);
		assert.equal(result.readOnly, false);
		assert.ok(!result.readOnly);
		assert.deepEqual(result.stored, emptyStored());
		assert.equal(typeof result.malformed, 'string');
		assert.ok(result.malformed!.length > 0);
	});
}
