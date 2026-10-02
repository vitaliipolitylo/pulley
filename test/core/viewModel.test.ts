import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copy, failureCopy, failureMessage } from '../../src/core/copy.ts';
import type { ConnectionState } from '../../src/core/connection.ts';
import { emptyAccount, reconcile } from '../../src/core/reconcile.ts';
import type { Account, FailureReason, Stored, Tracked } from '../../src/core/types.ts';
import { formatRequestAge, viewModel, type WindowView } from '../../src/core/viewModel.ts';

const NOW = 100_000;
const formatTime = (ms: number): string => `t${ms}`;
const connected: ConnectionState = { kind: 'connected', accountId: 'Y', label: 'octocat', generation: 1 };
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
		const m = viewModel(s, win({ readOnly: true }), { now: NOW, formatTime });
		assert.deepEqual(m, { status: 'readOnly', count: null, message: copy.updatePulley, rows: [] });
	}
	assert.match(copy.updatePulley, /Update Pulley/);
});

test('signed out: no rows, no count, no message (welcome content with Connect explains)', () => {
	const stored = withAccount({ lastSuccessAt: 1, items: items(tracked('A', 1)) });
	assert.deepEqual(viewModel(stored, win({ connection: { kind: 'unconnected', reason: 'signed_out' } }), { now: NOW, formatTime }), {
		status: 'unconnected',
		reason: 'signed_out',
		action: 'connect',
		count: null,
		rows: [],
	});
});

test('startup lookup in flight: loading with the connection message', () => {
	const m = viewModel(withAccount({}), win({ connection: { kind: 'unknown' } }), { now: NOW, formatTime });
	assert.deepEqual(m, { status: 'loading', count: null, message: copy.checkingConnection, rows: [] });
});

test('no partition for the active account yet: loading, "Checking review requests…", no zero', () => {
	const m = viewModel({ schemaVersion: 1, accounts: {} }, win({ checking: true }), { now: NOW, formatTime });
	assert.deepEqual(m, { status: 'loading', count: null, message: 'Checking review requests…', rows: [] });
	assert.doesNotMatch(m.message!, NO_ZERO);
});

test('only another account has a partition: its rows never render', () => {
	const stored: Stored = { schemaVersion: 1, accounts: { X: { ...emptyAccount(), lastSuccessAt: 1, items: items(tracked('X1', 1)) } } };
	const m = viewModel(stored, win(), { now: NOW, formatTime });
	assert.equal(m.status, 'loading');
	assert.deepEqual(m.rows, []);
});

test('pending after a complete success: count and firm message', () => {
	const m = viewModel(withAccount({ firstCheckDone: true, lastSuccessAt: 5, items: items(tracked('A', 1), tracked('B', 2)) }), win(), { now: NOW, formatTime });
	assert.equal(m.status, 'pending');
	assert.equal(m.count, 2);
	assert.equal(m.message, '2 reviews are waiting.');
	assert.equal(m.lastChecked, 'Last checked t5');
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
	const m = viewModel(withAccount({ firstCheckDone: true, lastIncompleteFetchStartedAt: 5, items: items(tracked('A', 1)) }), win(), { now: NOW, formatTime });
	assert.equal(m.status, 'pending');
	assert.equal(m.count, null);
	assert.equal(m.message, `1 review is waiting. ${copy.incomplete}`);
});

test('pending with a newer incomplete success than the last complete one: count kept, incomplete hint shown', () => {
	const m = viewModel(
		withAccount({ firstCheckDone: true, lastSuccessAt: 5, lastIncompleteFetchStartedAt: 8, items: items(tracked('A', 1), tracked('B', 2)) }),
		win(),
		{ now: NOW, formatTime },
	);
	assert.equal(m.status, 'pending');
	assert.equal(m.count, 2);
	assert.equal(m.message, `2 reviews are waiting. ${copy.incomplete}`);
	assert.equal(m.lastChecked, 'Last checked t5');
	const older = viewModel(
		withAccount({ firstCheckDone: true, lastSuccessAt: 8, lastIncompleteFetchStartedAt: 5, items: items(tracked('A', 1)) }),
		win(),
		{ now: NOW, formatTime },
	);
	assert.equal(older.message, '1 review is waiting.');
	assert.equal(older.lastChecked, 'Last checked t8');
});

test('restart with stored items before any check completes renders the stored rows, no zero', () => {
	const m = viewModel(withAccount({ firstCheckDone: true, lastSuccessAt: 5, items: items(tracked('A', 1)) }), win({ checking: true }), { now: NOW, formatTime });
	assert.equal(m.rows.length, 1);
	assert.notEqual(m.count, 0);
	assert.doesNotMatch(m.message!, NO_ZERO);
});

test('clear only after a complete success with no items', () => {
	const m = viewModel(withAccount({ firstCheckDone: true, lastSuccessAt: 5 }), win(), { now: NOW, formatTime });
	assert.deepEqual(m, { status: 'clear', count: 0, message: copy.clear, lastChecked: 'Last checked t5', rows: [] });
});

test('stale with rows: lastFailure newer than lastSuccessAt keeps rows', () => {
	const m = viewModel(
		withAccount({ firstCheckDone: true, lastSuccessAt: 5, lastFailure: { at: 9, reason: 'network' }, items: items(tracked('A', 1)) }),
		win(),
		{ now: NOW, formatTime },
	);
	assert.equal(m.status, 'stale');
	assert.equal(m.count, null, 'a stale count is never shown');
	assert.equal(m.message, "Couldn't check GitHub. Showing the last known requests from t5. GitHub could not be reached. Refresh to try again.");
	assert.equal(m.action, 'refresh');
	assert.equal(m.rows.length, 1);
});

test('stale with no rows and no success ever: no zero, no clear', () => {
	const m = viewModel(withAccount({ lastFailure: { at: 9, reason: 'network' } }), win(), { now: NOW, formatTime });
	assert.deepEqual(m, { status: 'stale', action: 'refresh', count: null, message: failureMessage('network', undefined), rows: [] });
	assert.match(m.message!, /^Couldn't check GitHub, so the queue is unavailable\./);
	assert.doesNotMatch(m.message!, NO_ZERO);
});

test('a failure older than the last success is not stale', () => {
	const m = viewModel(withAccount({ firstCheckDone: true, lastSuccessAt: 10, lastFailure: { at: 9, reason: 'network' } }), win(), { now: NOW, formatTime });
	assert.equal(m.status, 'clear');
});

test('loading: only incomplete empty successes, not checking → "may be incomplete"', () => {
	const m = viewModel(withAccount({ firstCheckDone: true, lastIncompleteFetchStartedAt: 5 }), win({ checking: false }), { now: NOW, formatTime });
	assert.deepEqual(m, { status: 'loading', count: null, message: copy.incomplete, rows: [] });
	assert.doesNotMatch(m.message!, NO_ZERO);
});

test('loading: only incomplete empty successes, checking → "Checking review requests…"', () => {
	const m = viewModel(withAccount({ firstCheckDone: true, lastIncompleteFetchStartedAt: 5 }), win({ checking: true }), { now: NOW, formatTime });
	assert.deepEqual(m, { status: 'loading', count: null, message: copy.checking, rows: [] });
});

test('loading: partition exists but firstCheckDone is false → "Checking review requests…" whether checking or not', () => {
	for (const checking of [true, false]) {
		const m = viewModel(withAccount({ lastAttemptAt: 3 }), win({ checking }), { now: NOW, formatTime });
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
		viewModel(stored, win(), { now: NOW, formatTime }).rows.map((r) => r.id),
		['e', 'a', 'b', 'c', 'd'],
	);
});

test('inputs are not mutated', () => {
	const stored = withAccount({ firstCheckDone: true, lastSuccessAt: 5, items: items(tracked('b', 2), tracked('a', 1)) });
	const before = structuredClone(stored);
	const w = win();
	viewModel(deepFreeze(stored), deepFreeze(w), deepFreeze({ now: NOW, formatTime }));
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
		const m = viewModel(withAccount({ firstCheckDone: true, lastSuccessAt: 5, items: items(item) }), win(), { now: T, formatTime });
		const row = m.rows[0];
		assert.equal(row.age, expected, name);
		assert.ok(row.description.endsWith(` · ${expected}`), name);
		assert.ok(row.accessibleLabel.endsWith(`, ${expected}`), name);
		assert.ok(row.tooltip.endsWith(`\n${expected}`), name);
	}
});

test('known time: description is "owner/name · author · Requested 2h ago"', () => {
	const item = tracked('A', 1, { requestedAt: T - 2 * HR });
	const row = viewModel(withAccount({ firstCheckDone: true, lastSuccessAt: 5, items: items(item) }), win(), { now: T, formatTime }).rows[0];
	assert.equal(row.label, 'Fix A');
	assert.equal(row.description, 'octo/app · alice · Requested 2h ago');
});

test('unknown time: "Request time unavailable" in the description and the accessible label, never firstSeenAt', () => {
	// firstSeenAt is 2 h before now; it must not be used as a substitute.
	const item = tracked('A', T - 2 * HR);
	const row = viewModel(withAccount({ firstCheckDone: true, lastSuccessAt: 5, items: items(item) }), win(), { now: T, formatTime }).rows[0];
	assert.equal(row.description, 'octo/app · alice · Request time unavailable');
	assert.equal(row.accessibleLabel, 'octo/app#7, Fix A, by alice, Request time unavailable');
	assert.doesNotMatch(`${row.description} ${row.accessibleLabel} ${row.tooltip}`, /2h|ago/);
});

test('long title and repository: tooltip and accessible label carry the full text', () => {
	const repo = 'very-long-organization-name/an-equally-long-repository-name-for-truncation';
	const title = 'Refactor the scheduler so that overlapping checks join the in-flight one instead of starting a second request';
	const author = 'a-contributor-with-a-long-login';
	const item = tracked('A', 1, { repo, number: 12345, title, author, requestedAt: T - 30 * HR });
	const row = viewModel(withAccount({ firstCheckDone: true, lastSuccessAt: 5, items: items(item) }), win(), { now: T, formatTime }).rows[0];
	assert.equal(row.label, title);
	assert.equal(row.description, `${repo} · ${author} · Requested yesterday`);
	assert.equal(row.accessibleLabel, `${repo}#12345, ${title}, by ${author}, Requested yesterday`);
	assert.equal(row.tooltip, `${repo}#12345\n${title}\nby ${author}\nRequested yesterday`);
});

// ---------------------------------------------------------------------------
// Story 1.5: last-checked text.
// ---------------------------------------------------------------------------

test('last checked: pending reads "{n} reviews are waiting." with "Last checked {time}" as the description, via ctx.formatTime(lastSuccessAt)', () => {
	const seen: number[] = [];
	const fmt = (ms: number): string => {
		seen.push(ms);
		return '3:04 PM';
	};
	const m = viewModel(withAccount({ firstCheckDone: true, lastSuccessAt: 42, items: items(tracked('A', 1), tracked('B', 2)) }), win(), { now: NOW, formatTime: fmt });
	assert.equal(m.message, '2 reviews are waiting.');
	assert.equal(m.lastChecked, 'Last checked 3:04 PM');
	assert.deepEqual(seen, [42]);
});

test('last checked: clear reads the clear sentence with "Last checked {time}" as the description', () => {
	const m = viewModel(withAccount({ firstCheckDone: true, lastSuccessAt: 42 }), win(), { now: NOW, formatTime: () => '9:00 AM' });
	assert.equal(m.message, 'No reviews are waiting in repositories visible to this GitHub sign-in.');
	assert.equal(m.lastChecked, 'Last checked 9:00 AM');
});

test('last checked: absent until lastSuccessAt exists (loading, incomplete-only pending, failure without success)', () => {
	const never = (): string => {
		throw new Error('formatTime must not be called without lastSuccessAt');
	};
	const cases: Stored[] = [
		{ schemaVersion: 1, accounts: {} },
		withAccount({ lastAttemptAt: 3 }),
		withAccount({ firstCheckDone: true, lastIncompleteFetchStartedAt: 5 }),
		withAccount({ firstCheckDone: true, lastIncompleteFetchStartedAt: 5, items: items(tracked('A', 1)) }),
		withAccount({ lastFailure: { at: 9, reason: 'network' } }),
	];
	for (const stored of cases) {
		const m = viewModel(stored, win(), { now: NOW, formatTime: never });
		assert.doesNotMatch(m.message ?? '', /Last checked/);
		assert.equal(m.lastChecked, undefined);
	}
});

test('last checked: a failed check newer than the last success leaves lastSuccessAt and its time unchanged', () => {
	const rctx = { now: NOW, activeAccountId: 'Y', intervalMs: 15 * 60_000 };
	const item = { id: 'A', repo: 'octo/app', number: 7, title: 'Fix A', author: 'alice', url: 'https://github.com/octo/app/pull/A' };
	const succeeded = reconcile({ schemaVersion: 1, accounts: {} }, { ok: true, accountId: 'Y', fetchStartedAt: 5, complete: true, items: [item] }, rctx).stored;
	const formatted: number[] = [];
	const fmt = (ms: number): string => {
		formatted.push(ms);
		return `t${ms}`;
	};
	const before = viewModel(succeeded, win(), { now: NOW, formatTime: fmt });
	assert.equal(before.message, '1 review is waiting.');
	assert.equal(before.lastChecked, 'Last checked t5');

	const failed = reconcile(succeeded, { ok: false, accountId: 'Y', fetchStartedAt: 20, reason: 'network' }, rctx).stored;
	assert.equal(failed.accounts.Y.lastSuccessAt, 5, 'a failure never moves lastSuccessAt');
	assert.ok(failed.accounts.Y.lastFailure!.at > 5, 'the failure is newer than the success');
	const afterFailure = viewModel(failed, win(), { now: NOW, formatTime: fmt });
	assert.equal(afterFailure.status, 'stale');
	assert.equal(afterFailure.message, failureMessage('network', 't5'), 'stale copy carries the last success time');

	// A later render with no recovery still has only the original success time to show.
	const again = reconcile(failed, { ok: false, accountId: 'Y', fetchStartedAt: 30, reason: 'network' }, rctx).stored;
	assert.equal(again.accounts.Y.lastSuccessAt, 5);
	viewModel(again, win(), { now: NOW, formatTime: fmt });
	assert.deepEqual([...new Set(formatted)], [5], 'formatTime only ever sees the original success time');
});

// ---------------------------------------------------------------------------
// Story 1.6: per-reason recovery messages and actions.
// ---------------------------------------------------------------------------

const REASONS: FailureReason[] = ['signed_out', 'unauthenticated', 'network', 'rate_limited', 'graphql_error'];
const EXPECTED_ACTION: Record<FailureReason, string> = {
	signed_out: 'connect',
	unauthenticated: 'reconnect',
	network: 'refresh',
	rate_limited: 'refresh',
	graphql_error: 'refresh',
};

for (const reason of REASONS) {
	test(`failure "${reason}" after a prior success: stale with the time, the reason hint, its action, rows kept, no count`, () => {
		const stored = withAccount({ firstCheckDone: true, lastSuccessAt: 5, lastFailure: { at: 9, reason }, items: items(tracked('A', 1)) });
		const m = viewModel(stored, win(), { now: NOW, formatTime });
		assert.equal(m.status, 'stale');
		assert.equal(m.count, null);
		assert.equal(m.action, EXPECTED_ACTION[reason]);
		assert.equal(m.action, failureCopy[reason].action);
		assert.equal(m.message, `Couldn't check GitHub. Showing the last known requests from t5. ${failureCopy[reason].hint}`);
		assert.deepEqual(
			m.rows.map((r) => r.id),
			['A'],
		);
	});

	test(`failure "${reason}" with no prior success: unavailable, no rows, no count, no zero, no clear`, () => {
		const m = viewModel(withAccount({ lastFailure: { at: 9, reason } }), win(), { now: NOW, formatTime });
		assert.equal(m.status, 'stale');
		assert.equal(m.count, null);
		assert.equal(m.action, EXPECTED_ACTION[reason]);
		assert.equal(m.message, `Couldn't check GitHub, so the queue is unavailable. ${failureCopy[reason].hint}`);
		assert.deepEqual(m.rows, []);
		assert.doesNotMatch(m.message!, NO_ZERO);
		assert.doesNotMatch(m.message!, /Last checked/);
	});
}

test('every failure hint names its action', () => {
	const verb = { connect: /Connect/, reconnect: /Reconnect/, refresh: /Refresh/ };
	for (const reason of REASONS) {
		const { hint, action } = failureCopy[reason];
		assert.match(hint, verb[action], reason);
		assert.doesNotMatch(hint, NO_ZERO, reason);
	}
	assert.match(failureCopy.rate_limited.hint, /^GitHub rate limit reached\./);
});

const unauthenticated = (extra: { accountId?: string; label?: string } = { accountId: 'Y', label: 'octocat' }): ConnectionState => ({
	kind: 'unconnected',
	reason: 'unauthenticated',
	...extra,
});

test('unauthenticated with stored rows after a success: rows stay as stale with Reconnect in the message', () => {
	const stored = withAccount({
		firstCheckDone: true,
		lastSuccessAt: 5,
		lastFailure: { at: 9, reason: 'unauthenticated' },
		items: items(tracked('A', 1)),
	});
	const m = viewModel(stored, win({ connection: unauthenticated() }), { now: NOW, formatTime });
	assert.deepEqual(
		{ status: m.status, reason: m.reason, action: m.action, count: m.count, message: m.message, rows: m.rows.map((r) => r.id) },
		{
			status: 'unconnected',
			reason: 'unauthenticated',
			action: 'reconnect',
			count: null,
			message: `Couldn't check GitHub. Showing the last known requests from t5. ${failureCopy.unauthenticated.hint}`,
			rows: ['A'],
		},
	);
	assert.match(m.message!, /Reconnect/);
});

test('unauthenticated with no rows: no message, so the Reconnect welcome content shows', () => {
	const stores: Stored[] = [withAccount({ firstCheckDone: true, lastSuccessAt: 5 }), withAccount({}), { schemaVersion: 1, accounts: {} }];
	for (const stored of stores) {
		assert.deepEqual(viewModel(stored, win({ connection: unauthenticated() }), { now: NOW, formatTime }), {
			status: 'unconnected',
			reason: 'unauthenticated',
			action: 'reconnect',
			count: null,
			rows: [],
		});
	}
	// No known account: nothing to show.
	const noAccount = viewModel(withAccount({ items: items(tracked('A', 1)) }), win({ connection: unauthenticated({}) }), { now: NOW, formatTime });
	assert.deepEqual(noAccount.rows, []);
});

test('unauthenticated with rows but no prior success: unavailable message with Reconnect, no count', () => {
	const stored = withAccount({ firstCheckDone: true, lastIncompleteFetchStartedAt: 3, items: items(tracked('A', 1)) });
	const m = viewModel(stored, win({ connection: unauthenticated() }), { now: NOW, formatTime });
	assert.equal(m.count, null);
	assert.equal(m.message, `Couldn't check GitHub, so the queue is unavailable. ${failureCopy.unauthenticated.hint}`);
});

test('the clear copy includes the visibility sentence', () => {
	const m = viewModel(withAccount({ firstCheckDone: true, lastSuccessAt: 5 }), win(), { now: NOW, formatTime });
	assert.equal(m.status, 'clear');
	assert.match(m.message!, /^No reviews are waiting in repositories visible to this GitHub sign-in\.$/);
	assert.equal(m.lastChecked, 'Last checked t5');
	assert.match(copy.unauthenticatedExplanation, /Only repositories visible to this GitHub sign-in are included\./);
});

test('count is null whenever status is not pending or clear; a stale count is never 0', () => {
	const stores: Stored[] = [
		{ schemaVersion: 1, accounts: {} },
		withAccount({}),
		withAccount({ firstCheckDone: true, lastIncompleteFetchStartedAt: 5 }),
		withAccount({ firstCheckDone: true, lastIncompleteFetchStartedAt: 5, items: items(tracked('A', 1)) }),
		withAccount({ firstCheckDone: true, lastSuccessAt: 5 }),
		withAccount({ firstCheckDone: true, lastSuccessAt: 5, items: items(tracked('A', 1)) }),
		withAccount({ firstCheckDone: true, lastSuccessAt: 5, lastFailure: { at: 9, reason: 'network' } }),
		withAccount({ firstCheckDone: true, lastSuccessAt: 5, lastFailure: { at: 9, reason: 'rate_limited' }, items: items(tracked('A', 1)) }),
		withAccount({ lastFailure: { at: 9, reason: 'graphql_error' } }),
	];
	const connections: ConnectionState[] = [connected, unauthenticated(), { kind: 'unconnected', reason: 'signed_out' }, { kind: 'unknown' }];
	let staleSeen = 0;
	for (const stored of stores) {
		for (const connection of connections) {
			for (const checking of [false, true]) {
				const m = viewModel(stored, win({ connection, checking }), { now: NOW, formatTime });
				if (m.status !== 'pending' && m.status !== 'clear') {
					assert.equal(m.count, null, `${m.status}: ${JSON.stringify(stored)}`);
				}
				if (m.status === 'stale') {
					staleSeen++;
					assert.doesNotMatch(m.message!, NO_ZERO);
				}
			}
		}
	}
	assert.ok(staleSeen > 0);
});

test('recovery to empty: a complete success with no items after a failure is clear with last checked', () => {
	const rctx = { now: NOW, activeAccountId: 'Y', intervalMs: 15 * 60_000 };
	const failed = withAccount({ firstCheckDone: true, lastSuccessAt: 5, lastFailure: { at: 9, reason: 'network' }, items: items(tracked('A', 1)) });
	const recovered = reconcile(failed, { ok: true, accountId: 'Y', fetchStartedAt: 20, complete: true, items: [] }, rctx).stored;
	const m = viewModel(recovered, win(), { now: NOW, formatTime });
	assert.deepEqual(m, { status: 'clear', count: 0, message: copy.clear, lastChecked: 'Last checked t20', rows: [] });
});

test("account switch: the previous account's rows never render for the new account", () => {
	const stored: Stored = {
		schemaVersion: 1,
		accounts: {
			X: { ...emptyAccount(), lastSuccessAt: 1, items: items(tracked('X1', 1)) },
			Y: { ...emptyAccount(), firstCheckDone: true, lastSuccessAt: 2 },
		},
	};
	const m = viewModel(stored, win({ connection: { kind: 'connected', accountId: 'Y', label: 'y', generation: 4 } }), { now: NOW, formatTime });
	assert.equal(m.status, 'clear');
	assert.deepEqual(m.rows, []);
});

test('screen reader: successful polls that only move the check time leave the message unchanged', () => {
	const at = (lastSuccessAt: number) =>
		viewModel(withAccount({ firstCheckDone: true, lastSuccessAt, items: items(tracked('A', 1)) }), win(), { now: NOW, formatTime });
	const polls = [at(5), at(20), at(35)];
	assert.deepEqual(new Set(polls.map((m) => m.message)).size, 1, 'one message across three polls');
	assert.deepEqual(polls.map((m) => m.lastChecked), ['Last checked t5', 'Last checked t20', 'Last checked t35']);
});

// Review fixes: newer incomplete evidence and failed state writes.
test('review fix: a newer incomplete check with no items after an empty complete one is not clear', () => {
	const stored = withAccount({ firstCheckDone: true, lastSuccessAt: 5, lastIncompleteFetchStartedAt: 9 });
	const m = viewModel(stored, win(), { now: NOW, formatTime });
	assert.deepEqual(m, { status: 'loading', count: null, message: copy.incomplete, rows: [] });
	assert.equal(viewModel(stored, win({ checking: true }), { now: NOW, formatTime }).status, 'loading');
	// An incomplete check older than the complete one still allows clear.
	assert.equal(viewModel(withAccount({ firstCheckDone: true, lastSuccessAt: 9, lastIncompleteFetchStartedAt: 5 }), win(), { now: NOW, formatTime }).status, 'clear');
});

test('review fix: a failed state write shows stale rows with the last success time and Refresh', () => {
	const stored = withAccount({ firstCheckDone: true, lastSuccessAt: 5, items: items(tracked('A', 1)) });
	const m = viewModel(stored, win({ writeFailed: true }), { now: NOW, formatTime });
	assert.equal(m.status, 'stale');
	assert.equal(m.action, 'refresh');
	assert.equal(m.count, null);
	assert.equal(m.rows.length, 1);
	assert.equal(
		m.message,
		"Couldn't check GitHub. Showing the last known requests from t5. Pulley couldn't save the latest check. Refresh to try again.",
	);
	// Without the flag the same state is pending.
	assert.equal(viewModel(stored, win(), { now: NOW, formatTime }).status, 'pending');
});

test('review fix: a failed state write with no account or no prior success is unavailable, never clear', () => {
	for (const stored of [{ schemaVersion: 1, accounts: {} } as Stored, withAccount({ firstCheckDone: true })]) {
		const m = viewModel(stored, win({ writeFailed: true }), { now: NOW, formatTime });
		assert.deepEqual(m, {
			status: 'stale',
			action: 'refresh',
			count: null,
			message: `${copy.unavailable} ${copy.writeFailed}`,
			rows: [],
		});
	}
});
