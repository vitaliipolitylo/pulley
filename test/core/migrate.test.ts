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

// Review fix: stored timestamps and lastFailure must be usable before rendering formats them.
const acct = (extra: Record<string, unknown>) => ({ schemaVersion: 1, accounts: { Y: { ...v1.accounts.Y, ...extra } } });
const badAccountFields: Array<[string, unknown]> = [];
for (const field of ['lastSuccessAt', 'lastAttemptAt', 'lastAppliedFetchStartedAt', 'lastIncompleteFetchStartedAt']) {
	badAccountFields.push(
		[`${field} is a string`, acct({ [field]: 'x' })],
		[`${field} is Infinity`, acct({ [field]: Infinity })],
		[`${field} is NaN`, acct({ [field]: NaN })],
		[`${field} is beyond Date's range`, acct({ [field]: 8.64e15 + 1 })],
		[`${field} is below Date's range`, acct({ [field]: -8.64e15 - 1 })],
	);
}
badAccountFields.push(
	['lastFailure is not an object', acct({ lastFailure: 'network' })],
	['lastFailure is null', acct({ lastFailure: null })],
	['lastFailure.at is a string', acct({ lastFailure: { at: 'x', reason: 'network' } })],
	['lastFailure.at is out of range', acct({ lastFailure: { at: 1e16, reason: 'network' } })],
	['lastFailure.reason is unknown', acct({ lastFailure: { at: 9, reason: 'teapot' } })],
	['lastFailure.reason is missing', acct({ lastFailure: { at: 9 } })],
);

for (const [name, raw] of badAccountFields) {
	test(`malformed account field (${name}) is empty v1 with a named problem`, () => {
		const result = migrate(raw);
		assert.ok(!result.readOnly);
		assert.deepEqual(result.stored, emptyStored());
		assert.match(result.malformed ?? '', /invalid (lastSuccessAt|lastAttemptAt|lastAppliedFetchStartedAt|lastIncompleteFetchStartedAt|lastFailure)/);
	});
}

// Story 2.1: alert fields must be inside their unions before core reads them.
const itemWith = (extra: Record<string, unknown>) => acct({ items: { A: { ...v1.accounts.Y.items.A, ...extra } } });
const badAlertFields: Array<[string, unknown, RegExp]> = [
	['item alert is unknown', itemWith({ alert: 'sent' }), /invalid alert/],
	['item alert is missing', itemWith({ alert: undefined }), /invalid alert/],
	['item origin is unknown', itemWith({ origin: 'old' }), /invalid origin/],
	['item origin is missing', itemWith({ origin: undefined }), /invalid origin/],
	['account newSignal is a string', acct({ newSignal: 'yes' }), /invalid newSignal/],
	['account newSignal is missing', acct({ newSignal: undefined }), /invalid newSignal/],
	['lastAttemptIntervalMs is a string', acct({ lastAttemptIntervalMs: '900000' }), /invalid lastAttemptIntervalMs/],
	['lastAttemptIntervalMs is zero', acct({ lastAttemptIntervalMs: 0 }), /invalid lastAttemptIntervalMs/],
	['lastAttemptIntervalMs is negative', acct({ lastAttemptIntervalMs: -1 }), /invalid lastAttemptIntervalMs/],
	['lastAttemptIntervalMs is null', acct({ lastAttemptIntervalMs: null }), /invalid lastAttemptIntervalMs/],
	// Story 2.2: backlog reminder fields.
	['backlogAlert is missing', acct({ backlogAlert: undefined }), /invalid backlogAlert/],
	['backlogAlert is an unknown string', acct({ backlogAlert: 'pending' }), /invalid backlogAlert/],
	['backlogAlert has an unknown state', acct({ backlogAlert: { state: 'sent', firstConnection: false } }), /invalid backlogAlert/],
	['backlogAlert has no firstConnection', acct({ backlogAlert: { state: 'pending' } }), /invalid backlogAlert/],
	['backlogAlert firstConnection is not boolean', acct({ backlogAlert: { state: 'shown', firstConnection: 'yes' } }), /invalid backlogAlert/],
	['backlogAlert is null', acct({ backlogAlert: null }), /invalid backlogAlert/],
	['lastBacklogReminderDate is a number', acct({ lastBacklogReminderDate: 20261003 }), /invalid lastBacklogReminderDate/],
	['lastBacklogReminderDate is not YYYY-MM-DD', acct({ lastBacklogReminderDate: '2026-1-3' }), /invalid lastBacklogReminderDate/],
	['lastBacklogReminderDate is a timestamp string', acct({ lastBacklogReminderDate: '2026-10-03T00:00' }), /invalid lastBacklogReminderDate/],
];

test('Story 2.2: every valid backlogAlert and a YYYY-MM-DD lastBacklogReminderDate are accepted as-is', () => {
	const alerts = ['none', ...['pending', 'shown'].flatMap((state) => [true, false].map((firstConnection) => ({ state, firstConnection })))];
	for (const backlogAlert of alerts) {
		const raw = acct({ backlogAlert, lastBacklogReminderDate: '2026-10-03' });
		const result = migrate(raw);
		assert.ok(!result.readOnly);
		assert.equal(result.malformed, undefined);
		assert.equal(result.stored, raw);
	}
});

for (const [name, raw, problem] of badAlertFields) {
	test(`malformed alert field (${name}) is empty v1 with a named problem`, () => {
		const result = migrate(JSON.parse(JSON.stringify(raw)));
		assert.ok(!result.readOnly);
		assert.deepEqual(result.stored, emptyStored());
		assert.match(result.malformed ?? '', problem);
	});
}

test('lastAttemptIntervalMs: Infinity and NaN are rejected; a positive finite value is accepted', () => {
	// Not JSON-round-tripped: JSON would turn these into null.
	for (const bad of [Infinity, NaN]) {
		const result = migrate(acct({ lastAttemptIntervalMs: bad }));
		assert.ok(!result.readOnly);
		assert.match(result.malformed ?? '', /invalid lastAttemptIntervalMs/);
	}
	const raw = acct({ lastAttemptIntervalMs: 900_000 });
	const result = migrate(raw);
	assert.ok(!result.readOnly);
	assert.equal(result.malformed, undefined);
	assert.equal(result.stored, raw);
});

test('every valid origin, alert, and newSignal value is accepted as-is', () => {
	for (const origin of ['new', 'backlog']) {
		for (const alert of ['none', 'pending', 'shown']) {
			for (const newSignal of [true, false]) {
				const raw = { schemaVersion: 1, accounts: { Y: { ...v1.accounts.Y, newSignal, items: { A: { ...v1.accounts.Y.items.A, origin, alert } } } } };
				const result = migrate(raw);
				assert.ok(!result.readOnly);
				assert.equal(result.malformed, undefined);
				assert.equal(result.stored, raw);
			}
		}
	}
});

test('valid timestamps at the edge of Date range and every failure reason are accepted', () => {
	for (const reason of ['signed_out', 'unauthenticated', 'network', 'rate_limited', 'graphql_error']) {
		const raw = acct({ lastAttemptAt: 8.64e15, lastIncompleteFetchStartedAt: -8.64e15, lastFailure: { at: 9, reason } });
		const result = migrate(raw);
		assert.ok(!result.readOnly);
		assert.equal(result.malformed, undefined);
		assert.equal(result.stored, raw);
	}
});
