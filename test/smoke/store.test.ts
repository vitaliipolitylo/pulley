import * as assert from 'assert';
import { emptyAccount, reconcile } from '../../src/core/reconcile.ts';
import type { Effect, Stored, Tracked, TransitionResult } from '../../src/core/types.ts';
import { windowFocused } from '../../src/core/windowFocused.ts';
import { createNotifier } from '../../src/shell/notifier.ts';
import { createStore, STATE_KEY, type StateMemento } from '../../src/shell/store.ts';

/** A memento whose writes resolve only when the test releases them. */
function controllableMemento(initial?: unknown) {
	let value: unknown = initial;
	const pending: Array<() => void> = [];
	const events: string[] = [];
	let updates = 0;
	const memento: StateMemento = {
		get: (key) => {
			assert.strictEqual(key, STATE_KEY);
			events.push('get');
			return value;
		},
		update: (key, next) => {
			assert.strictEqual(key, STATE_KEY);
			updates++;
			events.push('update:start');
			return new Promise<void>((resolve) => {
				pending.push(() => {
					value = next;
					events.push('update:done');
					resolve();
				});
			});
		},
	};
	return {
		memento,
		events,
		value: () => value,
		updates: () => updates,
		pendingWrites: () => pending.length,
		releaseNext: () => pending.shift()!(),
	};
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A transition that appends `label` to a marker list on account `log`. */
const append = (stored: Stored, label: string): TransitionResult => {
	const prev = stored.accounts.log?.items ?? {};
	const id = `${Object.keys(prev).length}:${label}`;
	const tracked = { id, repo: 'o/r', number: 1, title: label, author: 'a', url: 'u', firstSeenAt: 0, origin: 'backlog' as const, alert: 'none' as const };
	return {
		stored: { ...stored, accounts: { ...stored.accounts, log: { ...emptyAccount(), items: { ...prev, [id]: tracked } } } },
		effects: [],
	};
};

suite('Store', () => {
	test('two concurrent mutate calls are serialized: the second reads after the first write resolves', async () => {
		const m = controllableMemento();
		const store = createStore(m.memento, () => {});
		const first = store.mutate(append, 'one', undefined);
		const second = store.mutate(append, 'two', undefined);
		await tick();
		assert.strictEqual(m.pendingWrites(), 1, 'only the first write has started');
		assert.deepStrictEqual(m.events, ['get', 'update:start']);
		m.releaseNext();
		await first;
		await tick();
		assert.strictEqual(m.pendingWrites(), 1, 'the second write starts after the first resolves');
		m.releaseNext();
		await second;
		assert.deepStrictEqual(m.events, ['get', 'update:start', 'update:done', 'get', 'update:start', 'update:done']);
		const stored = m.value() as Stored;
		assert.deepStrictEqual(Object.keys(stored.accounts.log.items), ['0:one', '1:two'], 'second saw the first write');
	});

	test('the listener fires only after update resolves', async () => {
		const m = controllableMemento();
		const store = createStore(m.memento, () => {});
		const seen: string[] = [];
		store.onDidChange(() => seen.push(m.events[m.events.length - 1]));
		const call = store.mutate(append, 'one', undefined);
		await tick();
		await tick();
		assert.deepStrictEqual(seen, [], 'not notified while the write is pending');
		m.releaseNext();
		await call;
		assert.deepStrictEqual(seen, ['update:done']);
	});

	test('reconcile through the store leaves another account partition untouched', async () => {
		const X = { ...emptyAccount(), firstCheckDone: true, lastSuccessAt: 1, items: {} };
		const m = controllableMemento({ schemaVersion: 1, accounts: { X } });
		const store = createStore(m.memento, () => {});
		const call = store.mutate(reconcile, { ok: true, accountId: 'Y', fetchStartedAt: 5, complete: true, items: [] }, { now: 9, activeAccountId: 'Y', intervalMs: 1, windowFocused: false });
		await tick();
		m.releaseNext();
		await call;
		const stored = m.value() as Stored;
		assert.deepStrictEqual(stored.accounts.X, X);
		assert.strictEqual(stored.accounts.Y.lastSuccessAt, 5);
	});

	test('an unchanged transition skips the write but still notifies', async () => {
		const m = controllableMemento({ schemaVersion: 1, accounts: {} });
		const store = createStore(m.memento, () => {});
		let notified = 0;
		store.onDidChange(() => notified++);
		await store.mutate(reconcile, { ok: false, accountId: 'X', fetchStartedAt: 5, reason: 'network' }, { now: 9, activeAccountId: 'Y', intervalMs: 1, windowFocused: false });
		assert.strictEqual(m.updates(), 0);
		assert.strictEqual(notified, 1);
	});

	test('newer schema: read-only, no write, notified, logged once', async () => {
		const lines: string[] = [];
		const m = controllableMemento({ schemaVersion: 2, accounts: {} });
		const store = createStore(m.memento, (l) => lines.push(l));
		let notified = 0;
		store.onDidChange(() => notified++);
		await store.mutate(append, 'one', undefined);
		await store.mutate(append, 'two', undefined);
		assert.deepStrictEqual(store.read(), { readOnly: true });
		assert.strictEqual(m.updates(), 0);
		assert.strictEqual(notified, 2);
		assert.strictEqual(lines.length, 1);
		assert.match(lines[0], /schemaVersion 2/);
	});

	test('malformed data is overwritten with v1 on the next mutate, even by an unchanged transition; logged once', async () => {
		const lines: string[] = [];
		const m = controllableMemento({ schemaVersion: 1, accounts: { Y: { items: { A: null } } } });
		const store = createStore(m.memento, (l) => lines.push(l));
		assert.deepStrictEqual(store.read(), { readOnly: false, stored: { schemaVersion: 1, accounts: {} } });
		const call = store.mutate((stored: Stored) => ({ stored, effects: [] }), undefined, undefined);
		await tick();
		m.releaseNext();
		await call;
		assert.deepStrictEqual(m.value(), { schemaVersion: 1, accounts: {} });
		assert.strictEqual(lines.length, 1);
	});

	test('a rejected write rejects that call without notifying; a later mutate still runs and writes', async () => {
		let value: unknown;
		let failNext = true;
		const memento: StateMemento = {
			get: () => value,
			update: async (_key, next) => {
				if (failNext) {
					failNext = false;
					throw new Error('disk full');
				}
				value = next;
			},
		};
		const store = createStore(memento, () => {});
		let notified = 0;
		store.onDidChange(() => notified++);
		await assert.rejects(store.mutate(append, 'lost', undefined), /disk full/);
		assert.strictEqual(notified, 0, 'no notification for the rejected write');
		await store.mutate(append, 'kept', undefined);
		assert.strictEqual(notified, 1);
		assert.deepStrictEqual(Object.keys((value as Stored).accounts.log.items), ['0:kept']);
	});

	test('a throwing transition rejects that call only; later calls still run', async () => {
		const m = controllableMemento();
		const store = createStore(m.memento, () => {});
		const bad = store.mutate(() => {
			throw new Error('boom');
		}, undefined, undefined);
		const good = store.mutate(append, 'after', undefined);
		await assert.rejects(bad, /boom/);
		await tick();
		m.releaseNext();
		await good;
		assert.deepStrictEqual(Object.keys((m.value() as Stored).accounts.log.items), ['0:after']);
	});

	test('Story 2.1: the effect runner gets the written stored, only after update resolves', async () => {
		const pending: Tracked = { id: 'X', repo: 'o/r', number: 7, title: 'T', author: 'a', url: 'https://github.com/o/r/pull/7', firstSeenAt: 1, origin: 'new', alert: 'pending' };
		const m = controllableMemento({ schemaVersion: 1, accounts: { Y: { ...emptyAccount(), items: { X: pending } } } });
		const runs: Array<{ effects: Effect[]; stored: Stored; lastEvent: string }> = [];
		const store = createStore(m.memento, () => {}, (effects, stored) => {
			runs.push({ effects, stored, lastEvent: m.events[m.events.length - 1] });
		});
		const call = store.mutate(windowFocused, undefined, { activeAccountId: 'Y' });
		await tick();
		await tick();
		assert.strictEqual(runs.length, 0, 'no effects while the write is pending');
		m.releaseNext();
		await call;
		assert.strictEqual(runs.length, 1);
		assert.deepStrictEqual(runs[0].effects, [{ kind: 'notifyNew', accountId: 'Y', itemId: 'X' }]);
		assert.strictEqual(runs[0].lastEvent, 'update:done');
		assert.strictEqual(runs[0].stored, m.value(), 'the runner gets the very state that was written');
		assert.strictEqual(runs[0].stored.accounts.Y.items.X.alert, 'shown');
	});

	test('Story 2.1 (A8): an account switch while update is pending still notifies from the originating partition', async () => {
		const item = (title: string): Tracked => ({ id: 'X', repo: 'o/r', number: 7, title, author: 'a', url: 'https://github.com/o/r/pull/7', firstSeenAt: 1, origin: 'new', alert: 'pending' });
		const m = controllableMemento({
			schemaVersion: 1,
			accounts: { A: { ...emptyAccount(), items: { X: item('From A') } }, B: { ...emptyAccount(), items: { X: item('From B') } } },
		});
		const texts: string[] = [];
		const notifier = createNotifier({
			showMessage: (text) => {
				texts.push(text);
				return new Promise<string | undefined>(() => {});
			},
			openUrl: () => undefined,
			log: () => {},
		});
		const store = createStore(m.memento, () => {}, notifier);
		let active = 'A';
		const first = store.mutate(reconcile, { ok: false, accountId: 'A', fetchStartedAt: 5, reason: 'network' }, { now: 9, activeAccountId: active, intervalMs: 1, windowFocused: true });
		await tick();
		active = 'B';
		const second = store.mutate(windowFocused, undefined, { activeAccountId: active });
		m.releaseNext();
		await first;
		assert.strictEqual(texts.length, 1);
		assert.match(texts[0], /'From A'/);
		await tick();
		m.releaseNext();
		await second;
		assert.strictEqual(texts.length, 2);
		assert.match(texts[1], /'From B'/);
	});

	test('Story 2.1: a throwing effect runner is logged; the write stands and mutate resolves', async () => {
		const lines: string[] = [];
		const pending: Tracked = { id: 'X', repo: 'o/r', number: 7, title: 'T', author: 'a', url: 'u', firstSeenAt: 1, origin: 'new', alert: 'pending' };
		const m = controllableMemento({ schemaVersion: 1, accounts: { Y: { ...emptyAccount(), items: { X: pending } } } });
		const store = createStore(m.memento, (l) => lines.push(l), () => {
			throw new Error('runner broke');
		});
		let notified = 0;
		store.onDidChange(() => notified++);
		const call = store.mutate(windowFocused, undefined, { activeAccountId: 'Y' });
		await tick();
		m.releaseNext();
		await call;
		assert.strictEqual((m.value() as Stored).accounts.Y.items.X.alert, 'shown');
		assert.strictEqual(notified, 1);
		assert.strictEqual(lines.length, 1);
		assert.match(lines[0], /runner broke/);
	});
});
