// Scheduler tests with fake timers and randomness. No `vscode` import.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkWithRetry } from '../../src/shell/checkWithRetry.ts';
import { activeAccountId, type ConnectionState } from '../../src/core/connection.ts';
import { reconcile } from '../../src/core/reconcile.ts';
import type { CheckResult } from '../../src/core/types.ts';
import { viewModel } from '../../src/core/viewModel.ts';
import {
	connectPlan,
	createIntervalReader,
	createQueueCheck,
	createScheduler,
	formatCheckTime,
	JITTER_MAX_MS,
	MAX_GENERATION_ATTEMPTS,
	nextConnection,
	type QueueCheckDeps,
	type SchedulerDeps,
} from '../../src/shell/scheduler.ts';

interface FakeTimer {
	id: number;
	ms: number;
	callback: () => void;
	cleared: boolean;
	fired: boolean;
}

const MIN = 60_000;

/** Lets pending promise callbacks run. */
const flush = async (): Promise<void> => {
	for (let i = 0; i < 10; i++) {
		await Promise.resolve();
	}
};

function harness(opts: { random?: number; intervalMs?: number; runCheck?: () => Promise<void> } = {}) {
	const timers: FakeTimer[] = [];
	const logs: string[] = [];
	let nextId = 1;
	let checks = 0;
	let releases: Array<() => void> = [];
	let intervalMs = opts.intervalMs ?? 15 * MIN;
	const deps: SchedulerDeps = {
		runCheck:
			opts.runCheck ??
			(() => {
				checks++;
				return new Promise<void>((resolve) => releases.push(resolve));
			}),
		getIntervalMs: () => intervalMs,
		random: () => opts.random ?? 0.5,
		setTimeout: (callback, ms) => {
			const timer: FakeTimer = { id: nextId++, ms, callback, cleared: false, fired: false };
			timers.push(timer);
			return timer.id;
		},
		clearTimeout: (handle) => {
			const timer = timers.find((t) => t.id === handle);
			if (timer) {
				timer.cleared = true;
			}
		},
		log: (line) => logs.push(line),
	};
	const scheduler = createScheduler(deps);
	const live = () => timers.filter((t) => !t.cleared && !t.fired);
	const fire = async (timer: FakeTimer | undefined) => {
		assert.ok(timer, 'expected a live timer');
		assert.ok(!timer.cleared && !timer.fired, 'timer is live');
		timer.fired = true;
		timer.callback();
		await flush();
	};
	/** Settles every running check. */
	const release = async () => {
		const pending = releases;
		releases = [];
		for (const r of pending) {
			r();
		}
		await flush();
	};
	return {
		scheduler,
		timers,
		logs,
		live,
		fire,
		release,
		checks: () => checks,
		setInterval: (ms: number) => (intervalMs = ms),
	};
}

test('matrix "Double Refresh": two manual triggers during one check → one runCheck, both resolve together', async () => {
	const h = harness();
	const a = h.scheduler.trigger('manual');
	const b = h.scheduler.trigger('manual');
	assert.equal(a, b, 'the second manual joins the first');
	assert.equal(h.checks(), 1);
	let resolved = 0;
	void a.then(() => resolved++);
	void b.then(() => resolved++);
	await flush();
	assert.equal(resolved, 0);
	await h.release();
	assert.equal(resolved, 2);
	assert.equal(h.checks(), 1);
});

test('manual runs immediately with no jitter timer', async () => {
	const h = harness({ random: 0.9 });
	void h.scheduler.trigger('manual');
	assert.equal(h.checks(), 1);
	assert.equal(h.live().length, 0, 'no jitter or periodic timer while the check runs');
});

test('matrix "Manual during jitter": periodic waiting, then manual → runs now, jitter cancelled, 1 check', async () => {
	const h = harness({ random: 40_000 / JITTER_MAX_MS });
	const periodic = h.scheduler.trigger('periodic');
	assert.equal(h.checks(), 0);
	const jitter = h.live()[0];
	assert.equal(jitter.ms, 40_000);
	const manual = h.scheduler.trigger('manual');
	assert.equal(h.checks(), 1, 'manual runs now');
	assert.ok(jitter.cleared, 'the jitter timer is cancelled');
	let done = 0;
	void periodic.then(() => done++);
	void manual.then(() => done++);
	await h.release();
	assert.equal(done, 2, 'the periodic waiter resolves with the manual check');
	assert.equal(h.checks(), 1);
});

test('non-manual triggers during jitter join the same wait and run one check', async () => {
	const h = harness({ random: 0.25 });
	const a = h.scheduler.trigger('activation');
	const b = h.scheduler.trigger('session-changed');
	assert.equal(a, b);
	assert.equal(h.live().length, 1);
	await h.fire(h.live()[0]);
	assert.equal(h.checks(), 1);
	const c = h.scheduler.trigger('periodic');
	assert.equal(h.checks(), 1, 'a trigger during the check joins it');
	let done = 0;
	for (const p of [a, b, c]) {
		void p.then(() => done++);
	}
	await h.release();
	assert.equal(done, 3);
});

test('jitter bounds: random 0 → 0 ms; random 0.999 → under 60 s', async () => {
	const zero = harness({ random: 0 });
	void zero.scheduler.trigger('activation');
	assert.equal(zero.live()[0].ms, 0);
	assert.equal(zero.checks(), 0, 'still waits for the timer');
	await zero.fire(zero.live()[0]);
	assert.equal(zero.checks(), 1);

	const high = harness({ random: 0.999 });
	void high.scheduler.trigger('session-changed');
	const ms = high.live()[0].ms;
	assert.ok(ms < 60_000 && ms >= 59_000, `jitter ${ms}`);
});

test('periodic re-arms after the check settles, with a fresh intervalMs timeout', async () => {
	const h = harness({ random: 0, intervalMs: 15 * MIN });
	void h.scheduler.trigger('activation');
	await h.fire(h.live()[0]);
	assert.equal(h.live().length, 0, 'no periodic timer while the check is in flight');
	await h.release();
	const periodic = h.live();
	assert.equal(periodic.length, 1);
	assert.equal(periodic[0].ms, 15 * MIN);

	// The periodic timer fires → jitter wait → check → re-armed again.
	await h.fire(periodic[0]);
	await h.fire(h.live()[0]); // jitter (0 ms)
	assert.equal(h.checks(), 2);
	assert.equal(h.live().length, 0);
	await h.release();
	assert.equal(h.live().length, 1);
	assert.equal(h.live()[0].ms, 15 * MIN);
});

test('periodic runs with no view involvement: only timers drive it', async () => {
	const h = harness({ random: 0 });
	h.scheduler.restartInterval();
	await h.fire(h.live()[0]);
	await h.fire(h.live()[0]);
	assert.equal(h.checks(), 1);
});

test('matrix "Interval change": 15 → 30 restarts the timer at 30 min with no immediate check', async () => {
	const h = harness({ random: 0, intervalMs: 15 * MIN });
	h.scheduler.restartInterval();
	const old = h.live()[0];
	assert.equal(old.ms, 15 * MIN);
	h.setInterval(30 * MIN);
	h.scheduler.restartInterval();
	assert.ok(old.cleared, 'the old interval timer is cleared');
	const live = h.live();
	assert.equal(live.length, 1);
	assert.equal(live[0].ms, 30 * MIN);
	await flush();
	assert.equal(h.checks(), 0, 'no check on interval change');
});

test('matrix "Out of range": 2 → 5 min, 999 → 240 min, logged once per value', () => {
	let raw: unknown = 2;
	const logs: string[] = [];
	const read = createIntervalReader(() => raw, (line) => logs.push(line));
	assert.equal(read(), 5 * MIN);
	assert.equal(read(), 5 * MIN);
	assert.equal(logs.length, 1);
	raw = 999;
	assert.equal(read(), 240 * MIN);
	assert.equal(read(), 240 * MIN);
	assert.equal(logs.length, 2);
	raw = 30;
	assert.equal(read(), 30 * MIN);
	raw = undefined;
	assert.equal(read(), 15 * MIN, 'default 15');
	raw = 'often';
	assert.equal(read(), 15 * MIN, 'non-number → default');
	assert.equal(logs.length, 3);
	for (const [value, minutes] of [[5, 5], [240, 240]] as const) {
		raw = value;
		assert.equal(read(), minutes * MIN, 'bounds are inclusive');
	}
	assert.equal(logs.length, 3);
});

test('matrix "Check throws": in-flight state is cleared, logged, never unhandled; the next trigger works', async () => {
	let calls = 0;
	const h = harness({
		runCheck: async () => {
			calls++;
			if (calls === 1) {
				throw new Error('boom');
			}
		},
	});
	await h.scheduler.trigger('manual'); // resolves, does not reject
	assert.equal(calls, 1);
	assert.ok(h.logs.some((l) => l.includes('boom')));
	assert.equal(h.live().length, 1, 'periodic re-armed after a crash');
	await h.scheduler.trigger('manual');
	assert.equal(calls, 2, 'not joined to the crashed check');
});

test('matrix "No session": a trigger with no session makes no network call', async () => {
	let fetches = 0;
	let applied = 0;
	const h = harness({
		random: 0,
		runCheck: async () => {
			const result = await checkWithRetry({
				getToken: async () => undefined,
				runCheck: async () => {
					fetches++;
					throw new Error('no network expected');
				},
				log: () => {},
			});
			if (result) {
				applied++;
			}
		},
	});
	await h.scheduler.trigger('manual');
	void h.scheduler.trigger('periodic');
	await h.fire(h.live().find((t) => t.ms === 0));
	assert.equal(fetches, 0);
	assert.equal(applied, 0, 'nothing reaches the store');
});

test('dispose clears timers, resolves waiters, and ignores later triggers', async () => {
	const h = harness({ random: 0.5 });
	h.scheduler.restartInterval();
	const waiting = h.scheduler.trigger('activation');
	h.scheduler.dispose();
	assert.equal(h.live().length, 0);
	await waiting;
	await h.scheduler.trigger('manual');
	assert.equal(h.checks(), 0);
});

test('formatCheckTime: same local day → short time only; previous day or across midnight → short date and time', () => {
	const at = new Date(2026, 9, 2, 15, 4).getTime();
	const sameDay = formatCheckTime(at, new Date(2026, 9, 2, 23, 59).getTime(), 'en-US');
	assert.equal(sameDay, new Intl.DateTimeFormat('en-US', { timeStyle: 'short' }).format(at));
	assert.doesNotMatch(sameDay, /\d+\/\d+\/\d+/, 'no date part today');

	const lateEvening = new Date(2026, 9, 1, 23, 58).getTime();
	const afterMidnight = new Date(2026, 9, 2, 0, 1).getTime();
	for (const [ms, now] of [
		[at, new Date(2026, 9, 3, 9, 0).getTime()],
		[lateEvening, afterMidnight],
	]) {
		const text = formatCheckTime(ms, now, 'en-US');
		assert.equal(text, new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeStyle: 'short' }).format(ms));
		assert.match(text, /\d+\/\d+\/\d+/, 'date part present');
	}
});

// ---------------------------------------------------------------------------
// Story 1.6: the queue check — 401 retry-once and session-generation discard.
// ---------------------------------------------------------------------------

const ok = (accountId: string, fetchStartedAt = 1): CheckResult => ({ ok: true, accountId, fetchStartedAt, complete: true, items: [] });
const unauth = (accountId: string): CheckResult => ({ ok: false, accountId, fetchStartedAt: 1, reason: 'unauthenticated' });

function queueHarness(opts: {
	sessions: Array<{ accountId: string; token: string } | undefined>;
	results: Array<CheckResult | (() => Promise<CheckResult>)>;
}) {
	let generation = 3;
	const tokenLookups: number[] = [];
	const fetches: Array<{ token: string; accountId: string }> = [];
	const mutate: Array<CheckResult | undefined> = [];
	const logs: string[] = [];
	const deps: QueueCheckDeps = {
		lookupsSettled: async () => {},
		generation: () => generation,
		getToken: async () => {
			tokenLookups.push(generation);
			return opts.sessions.length > 1 ? opts.sessions.shift() : opts.sessions[0];
		},
		fetchCheck: async (token, accountId) => {
			fetches.push({ token, accountId });
			const next = opts.results.shift();
			assert.ok(next, 'unexpected extra GitHub check');
			return typeof next === 'function' ? next() : next;
		},
		apply: async (result) => {
			mutate.push(result);
		},
		log: (line) => logs.push(line),
	};
	return {
		check: createQueueCheck(deps),
		bump: () => ++generation,
		tokenLookups,
		fetches,
		mutate,
		logs,
	};
}

test('401 → one silent re-lookup → one retry; a retry success applies normally with no failure', async () => {
	const h = queueHarness({ sessions: [{ accountId: 'A', token: 't1' }, { accountId: 'A', token: 't2' }], results: [unauth('A'), ok('A')] });
	await h.check();
	assert.equal(h.tokenLookups.length, 2, 'exactly one silent re-lookup');
	assert.deepEqual(h.fetches, [
		{ token: 't1', accountId: 'A' },
		{ token: 't2', accountId: 'A' },
	]);
	assert.deepEqual(h.mutate, [ok('A')], 'the success is applied; no failure recorded');
	assert.ok(h.logs.some((l) => /retrying once/.test(l)), 'retry logged');
	assert.ok(!h.logs.some((l) => /after retry/.test(l)));
});

test('401 → re-lookup → 401 again: unauthenticated is applied (even with the same token) and logged', async () => {
	const same = { accountId: 'A', token: 't1' };
	const h = queueHarness({ sessions: [same, same], results: [unauth('A'), unauth('A')] });
	await h.check();
	assert.equal(h.tokenLookups.length, 2);
	assert.equal(h.fetches.length, 2, 'retried exactly once');
	assert.deepEqual(h.mutate, [unauth('A')]);
	assert.ok(h.logs.some((l) => /401 after retry/.test(l)));
});

test('a 401 whose re-lookup finds no session applies "no session" (signed out)', async () => {
	const h = queueHarness({ sessions: [{ accountId: 'A', token: 't1' }, undefined], results: [unauth('A')] });
	await h.check();
	assert.deepEqual(h.mutate, [undefined]);
});

test('matrix "Account switch mid-check": a generation change during a check discards the result (mutate not called for it)', async () => {
	let release!: (r: CheckResult) => void;
	const inFlight = new Promise<CheckResult>((resolve) => (release = resolve));
	const h = queueHarness({
		sessions: [{ accountId: 'A', token: 'tA' }, { accountId: 'B', token: 'tB' }],
		results: [() => inFlight, ok('B', 2)],
	});
	const done = h.check();
	await flush();
	assert.equal(h.fetches.length, 1, 'gen-3 check in flight');
	h.bump(); // onDidChangeSessions → silent lookup → generation 4
	release(ok('A'));
	await done;
	assert.ok(!h.mutate.some((r) => r?.ok && r.accountId === 'A'), 'the gen-3 result never reaches store.mutate');
	assert.deepEqual(h.mutate, [ok('B', 2)], 'the gen-4 check applies only the new account');
	assert.deepEqual(h.tokenLookups, [3, 4]);
	assert.ok(h.logs.some((l) => /discarded/.test(l) && /3 → 4/.test(l)), 'discard logged');
});

test('a generation that keeps changing gives up after the attempt cap without applying anything', async () => {
	const results: Array<() => Promise<CheckResult>> = [];
	const h = queueHarness({ sessions: [{ accountId: 'A', token: 't' }], results });
	for (let i = 0; i < MAX_GENERATION_ATTEMPTS; i++) {
		results.push(async () => {
			h.bump();
			return ok('A');
		});
	}
	await h.check();
	assert.equal(h.fetches.length, MAX_GENERATION_ATTEMPTS);
	assert.deepEqual(h.mutate, []);
	assert.ok(h.logs.some((l) => /kept changing/.test(l)));
});

test('scheduler + queue check: a session-changed trigger that joins a discarded check still gets the new account', async () => {
	let release!: (r: CheckResult) => void;
	const inFlight = new Promise<CheckResult>((resolve) => (release = resolve));
	const q = queueHarness({
		sessions: [{ accountId: 'A', token: 'tA' }, { accountId: 'B', token: 'tB' }],
		results: [() => inFlight, ok('B', 2)],
	});
	const h = harness({ runCheck: q.check });
	const first = h.scheduler.trigger('manual');
	await flush();
	q.bump();
	const joined = h.scheduler.trigger('session-changed');
	assert.equal(joined, first, 'session-changed joins the in-flight check');
	release(ok('A'));
	await joined;
	assert.deepEqual(q.mutate, [ok('B', 2)]);
});

// ---------------------------------------------------------------------------
// Story 1.6: connection transitions after a check, and the Connect/Reconnect plan.
// ---------------------------------------------------------------------------

const connectedA: ConnectionState = { kind: 'connected', accountId: 'A', label: 'alice', generation: 3 };
const unauthA: ConnectionState = { kind: 'unconnected', reason: 'unauthenticated', accountId: 'A', label: 'alice' };
const signedOut: ConnectionState = { kind: 'unconnected', reason: 'signed_out' };

test('nextConnection: no session → signed_out (unchanged object when already signed out)', () => {
	assert.deepEqual(nextConnection(connectedA, undefined, 3), signedOut);
	assert.deepEqual(nextConnection(unauthA, undefined, 3), signedOut);
	assert.equal(nextConnection(signedOut, undefined, 3), signedOut);
});

test('nextConnection: 401 after retry → unauthenticated, keeping the account id and label', () => {
	assert.deepEqual(nextConnection(connectedA, unauth('A'), 3), unauthA);
	const { accountId: _omit, ...noAccount } = unauth('A') as Extract<CheckResult, { ok: false }>;
	assert.deepEqual(nextConnection(connectedA, noAccount, 3), unauthA, 'falls back to the active account');
	assert.equal(nextConnection(unauthA, unauth('A'), 3), unauthA, 'unchanged when already unauthenticated');
});

test('nextConnection: an ok result for the unauthenticated account → connected at the current generation', () => {
	assert.deepEqual(nextConnection(unauthA, ok('A'), 7), { kind: 'connected', accountId: 'A', label: 'alice', generation: 7 });
	assert.equal(nextConnection(unauthA, ok('B'), 7), unauthA, "another account's success does not reconnect");
});

test('nextConnection: other results leave the connection unchanged', () => {
	assert.equal(nextConnection(connectedA, ok('A'), 9), connectedA);
	assert.equal(nextConnection(connectedA, { ok: false, accountId: 'A', fetchStartedAt: 1, reason: 'network' }, 9), connectedA);
	assert.equal(nextConnection(unauthA, { ok: false, accountId: 'A', fetchStartedAt: 1, reason: 'network' }, 9), unauthA);
});

test('chain: a 401 applied via nextConnection + reconcile + viewModel keeps the rows and offers reconnect', () => {
	const item = { id: 'PR_1', repo: 'octo/app', number: 1, title: 'Fix', author: 'bob', url: 'https://github.com/octo/app/pull/1' };
	const rctx = { now: 10, activeAccountId: 'A', intervalMs: 15 * MIN };
	const succeeded = reconcile({ schemaVersion: 1, accounts: {} }, { ok: true, accountId: 'A', fetchStartedAt: 5, complete: true, items: [item] }, rctx).stored;
	const failure: CheckResult = { ok: false, accountId: 'A', fetchStartedAt: 9, reason: 'unauthenticated' };
	const connection = nextConnection(connectedA, failure, 3);
	const stored = reconcile(succeeded, failure, { ...rctx, activeAccountId: activeAccountId(connection) }).stored;
	const m = viewModel(stored, { connection, readOnly: false, checking: false }, { now: 10, formatTime: (ms) => `t${ms}` });
	assert.equal(m.action, 'reconnect');
	assert.equal(m.reason, 'unauthenticated');
	assert.deepEqual(
		m.rows.map((r) => r.id),
		['PR_1'],
	);
	assert.match(m.message!, /from t5\..*Reconnect/);
});

test('connectPlan: forces a new session only while unauthenticated', () => {
	assert.equal(connectPlan(unauthA).force, true);
	for (const state of [signedOut, connectedA, { kind: 'unknown' } as ConnectionState]) {
		assert.equal(connectPlan(state).force, false);
	}
});

test('connectPlan: a cancelled forced Reconnect keeps the current state; a plain Connect applies signed_out', () => {
	const found = { kind: 'connected', accountId: 'A', label: 'alice' } as const;
	const cancelled = { kind: 'unconnected', reason: 'signed_out' } as const;
	assert.equal(connectPlan(unauthA).map(cancelled), undefined, 'undefined = keep the unauthenticated state');
	assert.deepEqual(connectPlan(unauthA).map(found), found);
	assert.deepEqual(connectPlan(signedOut).map(cancelled), cancelled);
	assert.deepEqual(connectPlan(signedOut).map(found), found);
});
