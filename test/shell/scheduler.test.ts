// Scheduler tests with fake timers and randomness. No `vscode` import.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkWithRetry } from '../../src/shell/checkWithRetry.ts';
import { createIntervalReader, createScheduler, formatCheckTime, JITTER_MAX_MS, type SchedulerDeps } from '../../src/shell/scheduler.ts';

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
