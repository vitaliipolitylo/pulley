import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copy } from '../../src/core/copy.ts';
import type { ConnectionState } from '../../src/core/connection.ts';
import { emptyAccount } from '../../src/core/reconcile.ts';
import type { Account, Stored, Tracked } from '../../src/core/types.ts';
import { formatRequestAge, viewModel, type WindowView } from '../../src/core/viewModel.ts';

const NOW = 100_000;
const connected: ConnectionState = { kind: 'connected', accountId: 'Y', label: 'octocat' };
const win = (extra: Partial<WindowView> = {}): WindowView => ({ connection: connected, readOnly: false, checking: false, ...extra });
const tracked = (id: string, firstSeenAt: number, extra: Partial<Tracked> = {}): Tracked => ({
	id,
	repo: 'octo/app',
	number: 7,
	title: `Fix ${id}`,
	author: 'alice',
	url: `https://github.com/octo/app/pull/${id}`,
	firstSeenAt,
	origin: 'backlog',
	alert: 'none',
	...extra,
});
const withAccount = (extra: Partial<Account>): Stored => ({ schemaVersion: 1, accounts: { Y: { ...emptyAccount(), ...extra } } });
const items = (...list: Tracked[]): Account['items'] => Object.fromEntries(list.map((t) => [t.id, t]));
const NO_ZERO = /\b0\b|no reviews/i;

function deepFreeze<T>(value: T): T {
	if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const child of Object.values(value)) {
			deepFreeze(child);
		}
	}
	return value;
}

test('readOnly wins over everything', () => {
	const stored = withAccount({ lastSuccessAt: 1, items: items(tracked('A', 1)) });
	for (const s of [stored, undefined]) {
		const m = viewModel(s, win({ readOnly: true }), { now: NOW });
		assert.deepEqual(m, { status: 'readOnly', count: null, message: copy.updatePulley, rows: [] });
	}
	assert.match(copy.updatePulley, /Update Pulley/);
});

test('unconnected: no rows, no count, no message (welcome content explains)', () => {
	const stored = withAccount({ lastSuccessAt: 1, items: items(tracked('A', 1)) });
	assert.deepEqual(viewModel(stored, win({ connection: { kind: 'unconnected' } }), { now: NOW }), {
		status: 'unconnected',
		count: null,
		rows: [],
	});
});

test('startup lookup in flight: loading with the connection message', () => {
	const m = viewModel(withAccount({}), win({ connection: { kind: 'unknown' } }), { now: NOW });
	assert.deepEqual(m, { status: 'loading', count: null, message: copy.checkingConnection, rows: [] });
});

test('no partition for the active account yet: loading, "Checking review requests…", no zero', () => {
	const m = viewModel({ schemaVersion: 1, accounts: {} }, win({ checking: true }), { now: NOW });
	assert.deepEqual(m, { status: 'loading', count: null, message: 'Checking review requests…', rows: [] });
	assert.doesNotMatch(m.message!, NO_ZERO);
});

test('only another account has a partition: its rows never render', () => {
	const stored: Stored = { schemaVersion: 1, accounts: { X: { ...emptyAccount(), lastSuccessAt: 1, items: items(tracked('X1', 1)) } } };
	const m = viewModel(stored, win(), { now: NOW });
	assert.equal(m.status, 'loading');
	assert.deepEqual(m.rows, []);
});

test('pending after a complete success: count and firm message', () => {
	const m = viewModel(withAccount({ firstCheckDone: true, lastSuccessAt: 5, items: items(tracked('A', 1), tracked('B', 2)) }), win(), { now: NOW });
	assert.equal(m.status, 'pending');
	assert.equal(m.count, 2);
	assert.equal(m.message, '2 reviews are waiting.');
	assert.deepEqual(m.rows[0], {
		id: 'A',
		label: 'Fix A',
		description: 'octo/app · alice · Request time unavailable',
		age: 'Request time unavailable',
		tooltip: 'octo/app#7\nFix A\nby alice\nRequest time unavailable',
		accessibleLabel: 'octo/app#7, Fix A, by alice, Request time unavailable',
		url: 'https://github.com/octo/app/pull/A',
	});
});

test('pending from incomplete checks only: count is null and the incomplete hint is shown', () => {
	const m = viewModel(withAccount({ firstCheckDone: true, lastIncompleteFetchStartedAt: 5, items: items(tracked('A', 1)) }), win(), { now: NOW });
	assert.equal(m.status, 'pending');
	assert.equal(m.count, null);
	assert.equal(m.message, `1 review is waiting. ${copy.incomplete}`);
});

test('pending with a newer incomplete success than the last complete one: count kept, incomplete hint shown', () => {
	const m = viewModel(
		withAccount({ firstCheckDone: true, lastSuccessAt: 5, lastIncompleteFetchStartedAt: 8, items: items(tracked('A', 1), tracked('B', 2)) }),
		win(),
		{ now: NOW },
	);
	assert.equal(m.status, 'pending');
	assert.equal(m.count, 2);
	assert.equal(m.message, `2 reviews are waiting. ${copy.incomplete}`);
	const older = viewModel(
		withAccount({ firstCheckDone: true, lastSuccessAt: 8, lastIncompleteFetchStartedAt: 5, items: items(tracked('A', 1)) }),
		win(),
		{ now: NOW },
	);
	assert.equal(older.message, '1 review is waiting.');
});

test('restart with stored items before any check completes renders the stored rows, no zero', () => {
	const m = viewModel(withAccount({ firstCheckDone: true, lastSuccessAt: 5, items: items(tracked('A', 1)) }), win({ checking: true }), { now: NOW });
	assert.equal(m.rows.length, 1);
	assert.notEqual(m.count, 0);
	assert.doesNotMatch(m.message!, NO_ZERO);
});

test('clear only after a complete success with no items', () => {
	const m = viewModel(withAccount({ firstCheckDone: true, lastSuccessAt: 5 }), win(), { now: NOW });
	assert.deepEqual(m, { status: 'clear', count: 0, message: copy.clear, rows: [] });
});

test('stale with rows: lastFailure newer than lastSuccessAt keeps rows', () => {
	const m = viewModel(
		withAccount({ firstCheckDone: true, lastSuccessAt: 5, lastFailure: { at: 9, reason: 'network' }, items: items(tracked('A', 1)) }),
		win(),
		{ now: NOW },
	);
	assert.equal(m.status, 'stale');
	assert.equal(m.count, 1);
	assert.equal(m.message, "Couldn't check GitHub. Showing the last known requests.");
	assert.equal(m.rows.length, 1);
});

test('stale with no rows and no success ever: no zero, no clear', () => {
	const m = viewModel(withAccount({ lastFailure: { at: 9, reason: 'network' } }), win(), { now: NOW });
	assert.deepEqual(m, { status: 'stale', count: null, message: copy.failed, rows: [] });
});

test('a failure older than the last success is not stale', () => {
	const m = viewModel(withAccount({ firstCheckDone: true, lastSuccessAt: 10, lastFailure: { at: 9, reason: 'network' } }), win(), { now: NOW });
	assert.equal(m.status, 'clear');
});

test('loading: only incomplete empty successes, not checking → "may be incomplete"', () => {
	const m = viewModel(withAccount({ firstCheckDone: true, lastIncompleteFetchStartedAt: 5 }), win({ checking: false }), { now: NOW });
	assert.deepEqual(m, { status: 'loading', count: null, message: copy.incomplete, rows: [] });
	assert.doesNotMatch(m.message!, NO_ZERO);
});

test('loading: only incomplete empty successes, checking → "Checking review requests…"', () => {
	const m = viewModel(withAccount({ firstCheckDone: true, lastIncompleteFetchStartedAt: 5 }), win({ checking: true }), { now: NOW });
	assert.deepEqual(m, { status: 'loading', count: null, message: copy.checking, rows: [] });
});

test('loading: partition exists but firstCheckDone is false → "Checking review requests…" whether checking or not', () => {
	for (const checking of [true, false]) {
		const m = viewModel(withAccount({ lastAttemptAt: 3 }), win({ checking }), { now: NOW });
		assert.deepEqual(m, { status: 'loading', count: null, message: copy.checking, rows: [] });
	}
});

test('rows sort by requestedAt ?? firstSeenAt, oldest first, ties by id', () => {
	const stored = withAccount({
		firstCheckDone: true,
		lastSuccessAt: 5,
		items: items(
			tracked('d', 50),
			tracked('c', 10, { requestedAt: 40 }),
			tracked('b', 30),
			tracked('a', 99, { requestedAt: 30 }),
			tracked('e', 5),
		),
	});
	assert.deepEqual(
		viewModel(stored, win(), { now: NOW }).rows.map((r) => r.id),
		['e', 'a', 'b', 'c', 'd'],
	);
});

test('inputs are not mutated', () => {
	const stored = withAccount({ firstCheckDone: true, lastSuccessAt: 5, items: items(tracked('b', 2), tracked('a', 1)) });
	const before = structuredClone(stored);
	const w = win();
	viewModel(deepFreeze(stored), deepFreeze(w), deepFreeze({ now: NOW }));
	assert.deepEqual(stored, before);
	assert.deepEqual(Object.keys(stored.accounts.Y.items), ['b', 'a']);
});

// ---------------------------------------------------------------------------
// Story 1.4: request age and accessible label.
// ---------------------------------------------------------------------------

const SEC = 1000;
const MIN = 60 * SEC;
const HR = 60 * MIN;
const T = 1_000 * 24 * HR; // a "now" far from zero

const ageCases: Array<[name: string, requestedAt: number | undefined, expected: string]> = [
	['known time: now − 2 h', T - 2 * HR, 'Requested 2h ago'],
	['unknown time', undefined, 'Request time unavailable'],
	['exactly now', T, 'Requested just now'],
	['boundary 59 s', T - 59 * SEC, 'Requested just now'],
	['boundary 1 min', T - MIN, 'Requested 1m ago'],
	['boundary 59 m', T - 59 * MIN, 'Requested 59m ago'],
	['boundary 59 m 59 s', T - 59 * MIN - 59 * SEC, 'Requested 59m ago'],
	['boundary 1 h', T - HR, 'Requested 1h ago'],
	['boundary 23 h 59 m', T - 23 * HR - 59 * MIN, 'Requested 23h ago'],
	['boundary 24 h', T - 24 * HR, 'Requested yesterday'],
	['boundary 47 h', T - 47 * HR, 'Requested yesterday'],
	['boundary 47 h 59 m', T - 47 * HR - 59 * MIN, 'Requested yesterday'],
	['boundary 48 h', T - 48 * HR, 'Requested 2d ago'],
	['10 days 5 h', T - 10 * 24 * HR - 5 * HR, 'Requested 10d ago'],
	['future time (clock skew)', T + 5 * MIN, 'Requested just now'],
];

for (const [name, requestedAt, expected] of ageCases) {
	test(`formatRequestAge: ${name} → "${expected}"`, () => {
		assert.equal(formatRequestAge(T, requestedAt), expected);
	});
}

test('row age matrix: description, tooltip, and accessible label end with the age phrase', () => {
	for (const [name, requestedAt, expected] of ageCases) {
		const item = tracked('A', 1, requestedAt === undefined ? {} : { requestedAt });
		const m = viewModel(withAccount({ firstCheckDone: true, lastSuccessAt: 5, items: items(item) }), win(), { now: T });
		const row = m.rows[0];
		assert.equal(row.age, expected, name);
		assert.ok(row.description.endsWith(` · ${expected}`), name);
		assert.ok(row.accessibleLabel.endsWith(`, ${expected}`), name);
		assert.ok(row.tooltip.endsWith(`\n${expected}`), name);
	}
});

test('known time: description is "owner/name · author · Requested 2h ago"', () => {
	const item = tracked('A', 1, { requestedAt: T - 2 * HR });
	const row = viewModel(withAccount({ firstCheckDone: true, lastSuccessAt: 5, items: items(item) }), win(), { now: T }).rows[0];
	assert.equal(row.label, 'Fix A');
	assert.equal(row.description, 'octo/app · alice · Requested 2h ago');
});

test('unknown time: "Request time unavailable" in the description and the accessible label, never firstSeenAt', () => {
	// firstSeenAt is 2 h before now; it must not be used as a substitute.
	const item = tracked('A', T - 2 * HR);
	const row = viewModel(withAccount({ firstCheckDone: true, lastSuccessAt: 5, items: items(item) }), win(), { now: T }).rows[0];
	assert.equal(row.description, 'octo/app · alice · Request time unavailable');
	assert.equal(row.accessibleLabel, 'octo/app#7, Fix A, by alice, Request time unavailable');
	assert.doesNotMatch(`${row.description} ${row.accessibleLabel} ${row.tooltip}`, /2h|ago/);
});

test('long title and repository: tooltip and accessible label carry the full text', () => {
	const repo = 'very-long-organization-name/an-equally-long-repository-name-for-truncation';
	const title = 'Refactor the scheduler so that overlapping checks join the in-flight one instead of starting a second request';
	const author = 'a-contributor-with-a-long-login';
	const item = tracked('A', 1, { repo, number: 12345, title, author, requestedAt: T - 30 * HR });
	const row = viewModel(withAccount({ firstCheckDone: true, lastSuccessAt: 5, items: items(item) }), win(), { now: T }).rows[0];
	assert.equal(row.label, title);
	assert.equal(row.description, `${repo} · ${author} · Requested yesterday`);
	assert.equal(row.accessibleLabel, `${repo}#12345, ${title}, by ${author}, Requested yesterday`);
	assert.equal(row.tooltip, `${repo}#12345\n${title}\nby ${author}\nRequested yesterday`);
});
