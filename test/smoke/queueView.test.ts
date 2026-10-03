import * as assert from 'assert';
import * as vscode from 'vscode';
import { copy } from '../../src/core/copy.ts';
import { queueViewed } from '../../src/core/queueViewed.ts';
import { emptyAccount, reconcile } from '../../src/core/reconcile.ts';
import type { Mascot, Row, Stored, ViewModel } from '../../src/core/types.ts';
import { viewModel } from '../../src/core/viewModel.ts';
import {
	createQueueViewedSync,
	createQueueViewedWiring,
	openPullRequest,
	QueueView,
	STATUS_ROW_ID,
	type QueueElement,
	type QueueTreeView,
	type StatusRow,
} from '../../src/shell/queueView.ts';
import { createStatusCount } from '../../src/shell/statusCount.ts';
import { createStore, STATE_KEY, type StateMemento, type Store } from '../../src/shell/store.ts';

const EXT = vscode.Uri.file('/pulley-ext');

function fakes() {
	let messageWrites = 0;
	let message: string | undefined = 'initial';
	let descriptionWrites = 0;
	let description: string | undefined;
	let badgeWrites = 0;
	let badge: vscode.ViewBadge | undefined;
	const visibility = new vscode.EventEmitter<vscode.TreeViewVisibilityChangeEvent>();
	const tree: QueueTreeView & { visible: boolean } = {
		visible: true,
		get message() {
			return message;
		},
		set message(value) {
			messageWrites++;
			message = value;
		},
		get description() {
			return description;
		},
		set description(value) {
			descriptionWrites++;
			description = value;
		},
		get badge() {
			return badge;
		},
		set badge(value) {
			badgeWrites++;
			badge = value;
		},
		onDidChangeVisibility: visibility.event,
		dispose: () => visibility.dispose(),
	};
	const context: Array<[string, unknown]> = [];
	const view = new QueueView(EXT, tree, async (key, value) => {
		context.push([key, value]);
	});
	let refreshes = 0;
	view.provider.onDidChangeTreeData(() => refreshes++);
	return {
		tree,
		context,
		view,
		visibility,
		counts: () => ({ messageWrites, refreshes }),
		descriptionWrites: () => descriptionWrites,
		badgeWrites: () => badgeWrites,
	};
}

const row = (n: number): Row => ({
	id: `PR_${n}`,
	label: `Fix ${n}`,
	description: 'octo/app · alice · Requested 2h ago',
	age: 'Requested 2h ago',
	tooltip: `octo/app#${n}\nFix ${n}\nby alice\nRequested 2h ago`,
	accessibleLabel: `octo/app#${n}, Fix ${n}, by alice, Requested 2h ago`,
	url: `https://github.com/octo/app/pull/${n}`,
});
const corgi = (mascot: Mascot, countStale = false) => ({
	countStale,
	mascot,
	mascotText: mascot === 'backlog' ? 'The corgi saved your place in line.' : copy.mascot[mascot],
});
const UNKNOWN = corgi('unknown');
const stale = "Couldn't check GitHub. Showing the last known requests from 9:00 AM. GitHub could not be reached. Refresh to try again.";
const pending = (rows: Row[], message = `${rows.length} reviews are waiting.`, mascot: Mascot = 'waiting'): ViewModel => ({
	status: 'pending',
	count: rows.length,
	...corgi(mascot),
	message,
	rows,
});
const staleModel = (rows: Row[], message = stale): ViewModel => ({ status: 'stale', action: 'refresh', count: rows.length, ...corgi('unknown', true), message, rows });
const isRow = (element: QueueElement): element is Row => !('kind' in element);
const requestRows = (view: QueueView): Row[] => view.provider.getChildren().filter(isRow);

suite('QueueView', () => {
	test('unconnected: context key unconnected, no tree message (welcome content shows), no status row', async () => {
		const { tree, context, view } = fakes();
		await view.render({ status: 'unconnected', reason: 'signed_out', action: 'connect', count: null, ...UNKNOWN, rows: [] });
		assert.deepStrictEqual(context, [['pulley.connection', 'unconnected']]);
		assert.strictEqual(tree.message, undefined);
		assert.deepStrictEqual(view.provider.getChildren(), []);
	});

	test('rows render as native tree items with tooltip, accessible label, icon, and open command', async () => {
		const { tree, context, view } = fakes();
		await view.render(pending([row(1), row(2)]));
		assert.deepStrictEqual(context, [['pulley.connection', 'connected']]);
		assert.strictEqual(tree.message, '2 reviews are waiting.');
		const rows = requestRows(view);
		assert.strictEqual(rows.length, 2);
		const item = view.provider.getTreeItem(rows[0]);
		assert.strictEqual(item.label, 'Fix 1');
		assert.strictEqual(item.id, 'PR_1');
		assert.strictEqual(item.description, 'octo/app · alice · Requested 2h ago');
		assert.ok(item.tooltip instanceof vscode.MarkdownString);
		const tooltip = item.tooltip as vscode.MarkdownString;
		assert.ok(!tooltip.isTrusted, 'tooltip is not trusted');
		// appendText escapes Markdown punctuation and spaces; undo that to read the visible text.
		const visible = tooltip.value.replace(/\\(.)/g, '$1').replace(/&nbsp;/g, ' ');
		assert.deepStrictEqual(
			visible.split('\n').filter((line) => line !== ''),
			['octo/app#1', 'Fix 1', 'by alice', 'Requested 2h ago'],
		);
		assert.deepStrictEqual(item.accessibilityInformation, { label: 'octo/app#1, Fix 1, by alice, Requested 2h ago' });
		assert.ok(item.iconPath instanceof vscode.ThemeIcon);
		assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, 'git-pull-request');
		assert.strictEqual((item.iconPath as vscode.ThemeIcon).color, undefined, 'no custom color');
		assert.strictEqual(item.command?.command, 'pulley.openPullRequest');
		assert.deepStrictEqual(item.command?.arguments, [rows[0]]);
		assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.None);
		assert.deepStrictEqual(view.provider.getChildren(rows[0]), []);
	});

	test('tooltip is text only: Markdown, links, and theme icons in a title are escaped', () => {
		const { view } = fakes();
		const tricky: Row = { ...row(3), tooltip: 'octo/app#3\n[click](https://evil.example) **bold** $(alert)\nby alice\nRequested 2h ago' };
		const tooltip = view.provider.getTreeItem(tricky).tooltip as vscode.MarkdownString;
		assert.ok(!tooltip.value.includes('[click](https://evil.example)'), tooltip.value);
		assert.ok(!tooltip.value.includes('**bold**'), tooltip.value);
		assert.ok(!tooltip.supportThemeIcons, 'theme icons are not rendered');
	});

	test('a deep-equal model does nothing', async () => {
		const { context, view, counts } = fakes();
		await view.render(pending([row(1)]));
		const before = counts();
		await view.render(pending([row(1)]));
		assert.deepStrictEqual(counts(), before);
		assert.strictEqual(context.length, 1);
	});

	test('a message-only change does not refresh the tree; a row change does', async () => {
		const { view, counts } = fakes();
		await view.render(staleModel([row(1)]));
		const start = counts();
		await view.render(staleModel([row(1)], `${stale} Again.`));
		assert.strictEqual(counts().refreshes, start.refreshes);
		assert.strictEqual(counts().messageWrites, start.messageWrites + 1);
		await view.render(staleModel([row(1), row(2)], `${stale} Again.`));
		assert.strictEqual(counts().refreshes, start.refreshes + 1);
	});

	test('matrix "Unchanged poll": the same model rendered three times sets message and refreshes the tree only once', async () => {
		for (const model of [
			{ ...pending([row(1)], '1 review is waiting.'), lastChecked: 'Last checked 9:00 AM' } satisfies ViewModel,
			staleModel([row(1)]),
			{ status: 'unconnected', reason: 'unauthenticated', action: 'reconnect', count: 1, ...corgi('unknown', true), message: stale, rows: [row(1)] } satisfies ViewModel,
		]) {
			const { tree, context, view, counts, badgeWrites } = fakes();
			const count = createStatusCount(tree);
			count.render(structuredClone(model));
			await view.render(structuredClone(model));
			assert.deepStrictEqual(counts(), { messageWrites: 1, refreshes: 1 });
			for (let i = 0; i < 2; i++) {
				count.render(structuredClone(model));
				await view.render(structuredClone(model));
			}
			assert.deepStrictEqual(counts(), { messageWrites: 1, refreshes: 1 }, model.status);
			assert.strictEqual(context.length, 1);
			assert.strictEqual(badgeWrites(), 1, 'the count is set once');
		}
	});

	test('screen reader: three successful polls that only move the check time never re-set the message', async () => {
		const { tree, view, counts, descriptionWrites } = fakes();
		for (const time of ['9:00 AM', '9:15 AM', '9:30 AM']) {
			await view.render({ ...pending([row(1)], '1 review is waiting.'), lastChecked: `Last checked ${time}` });
		}
		assert.deepStrictEqual(counts(), { messageWrites: 1, refreshes: 1 });
		assert.strictEqual(descriptionWrites(), 3, 'the time moves in the view description');
		assert.strictEqual(tree.description, 'Last checked 9:30 AM');
	});

	test('the same message string is never re-set, even when other fields change', async () => {
		const { view, counts } = fakes();
		await view.render(staleModel([row(1)]));
		await view.render(staleModel([row(1), row(2)]));
		assert.strictEqual(counts().messageWrites, 1);
	});

	test('unauthenticated: context key unauthenticated (Reconnect welcome, title action), rows kept as stale', async () => {
		const { tree, context, view } = fakes();
		await view.render(pending([row(1)]));
		await view.render({ status: 'unconnected', reason: 'unauthenticated', action: 'reconnect', count: 1, ...corgi('unknown', true), message: stale, rows: [row(1)] });
		assert.deepStrictEqual(context, [
			['pulley.connection', 'connected'],
			['pulley.connection', 'unauthenticated'],
		]);
		assert.strictEqual(tree.message, stale);
		assert.strictEqual(requestRows(view).length, 1);
		await view.render({ status: 'unconnected', reason: 'unauthenticated', action: 'reconnect', count: null, ...UNKNOWN, rows: [] });
		assert.strictEqual(tree.message, undefined, 'no rows: the welcome content shows');
		assert.deepStrictEqual(view.provider.getChildren(), [], 'no status row either');
		await view.render({ status: 'unconnected', reason: 'signed_out', action: 'connect', count: null, ...UNKNOWN, rows: [] });
		assert.deepStrictEqual(context.at(-1), ['pulley.connection', 'unconnected']);
	});

	test('context key is set only when its value changes', async () => {
		const { context, view } = fakes();
		await view.render({ status: 'loading', count: null, ...UNKNOWN, message: 'Checking GitHub connection…', rows: [] });
		await view.render(pending([row(1)]));
		await view.render({ status: 'unconnected', reason: 'signed_out', action: 'connect', count: null, ...UNKNOWN, rows: [] });
		assert.deepStrictEqual(context, [
			['pulley.connection', 'connected'],
			['pulley.connection', 'unconnected'],
		]);
	});
});

suite('Story 2.3: corgi status row', () => {
	test('a status row comes first: id pulley.status, corgi icon, mascotText label and accessible text, no command', async () => {
		const { view } = fakes();
		await view.render(pending([row(1), row(2)], '2 reviews are waiting.', 'new'));
		const children = view.provider.getChildren();
		assert.strictEqual(children.length, 3);
		const status = children[0] as StatusRow;
		assert.strictEqual(status.kind, 'status');
		const item = view.provider.getTreeItem(status);
		assert.strictEqual(item.id, STATUS_ROW_ID);
		assert.strictEqual(item.label, copy.mascot.new);
		assert.deepStrictEqual(item.accessibilityInformation, { label: copy.mascot.new });
		assert.strictEqual(item.command, undefined, 'not clickable');
		assert.ok(item.iconPath instanceof vscode.Uri);
		assert.strictEqual((item.iconPath as vscode.Uri).toString(), vscode.Uri.joinPath(EXT, 'media', 'corgi', 'new.svg').toString());
		assert.strictEqual(item.collapsibleState, vscode.TreeItemCollapsibleState.None);
		// Rows keep their ids, so focus and selection survive.
		assert.deepStrictEqual(children.slice(1).map((c) => view.provider.getTreeItem(c).id), ['PR_1', 'PR_2']);
	});

	test('clear shows the resting corgi; stale rows show the unknown pose; unknown with no rows has no status row', async () => {
		const { view } = fakes();
		await view.render({ status: 'clear', count: 0, ...corgi('clear'), message: copy.clear, rows: [] });
		let children = view.provider.getChildren();
		assert.strictEqual(children.length, 1);
		assert.strictEqual(view.provider.getTreeItem(children[0]).label, copy.mascot.clear);
		assert.ok(((view.provider.getTreeItem(children[0]).iconPath as vscode.Uri).path).endsWith('/media/corgi/clear.svg'));

		await view.render(staleModel([row(1)]));
		children = view.provider.getChildren();
		assert.strictEqual(children.length, 2);
		assert.ok(((view.provider.getTreeItem(children[0]).iconPath as vscode.Uri).path).endsWith('/media/corgi/unknown.svg'));

		await view.render({ status: 'stale', action: 'refresh', count: null, ...UNKNOWN, message: 'unavailable', rows: [] });
		assert.deepStrictEqual(view.provider.getChildren(), []);
	});

	test('matrix "Mascot-only change" (A9): same rows, new → waiting refreshes the provider with the waiting art and text', async () => {
		const { view, counts } = fakes();
		await view.render(pending([row(1)], '1 review is waiting.', 'new'));
		const before = counts().refreshes;
		await view.render(pending([row(1)], '1 review is waiting.', 'waiting'));
		assert.strictEqual(counts().refreshes, before + 1);
		const item = view.provider.getTreeItem(view.provider.getChildren()[0]);
		assert.strictEqual(item.label, copy.mascot.waiting);
		assert.ok((item.iconPath as vscode.Uri).path.endsWith('/media/corgi/waiting.svg'));
	});

	test('pulley.openPullRequest ignores the status row', async () => {
		const lines: string[] = [];
		const opened: string[] = [];
		const status: StatusRow = { kind: 'status', mascot: 'waiting', text: copy.mascot.waiting };
		const result = await openPullRequest(status, async (uri) => {
			opened.push(uri.toString());
			return true;
		}, (line) => lines.push(line));
		assert.strictEqual(result, false);
		assert.deepStrictEqual(opened, []);
		assert.deepStrictEqual(lines, []);
	});

	test('the six corgi files exist in media/corgi', async () => {
		const ext = vscode.extensions.all.find((e) => e.packageJSON?.name === 'pulley');
		assert.ok(ext);
		for (const mascot of ['new', 'older', 'backlog', 'waiting', 'clear', 'unknown']) {
			const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(ext.extensionUri, 'media', 'corgi', `${mascot}.svg`));
			const text = new TextDecoder().decode(bytes);
			assert.match(text, /^<svg /, mascot);
			assert.doesNotMatch(text, /<animate|@keyframes|transition/, `${mascot}: no animation`);
		}
	});
});

suite('Story 2.3: quiet count badge', () => {
	test('renders count and tooltip; stale is qualified as last known; null and 0 show no badge; unchanged is skipped', () => {
		const { tree, badgeWrites } = fakes();
		const count = createStatusCount(tree);
		count.render({ count: null, countStale: false });
		assert.strictEqual(badgeWrites(), 0, 'no badge to begin with: nothing to set');
		count.render({ count: 3, countStale: false });
		assert.deepStrictEqual(tree.badge, { value: 3, tooltip: '3 reviews are waiting.' });
		count.render({ count: 3, countStale: false });
		assert.strictEqual(badgeWrites(), 1, 'unchanged count is skipped');
		count.render({ count: 3, countStale: true });
		assert.deepStrictEqual(tree.badge, { value: 3, tooltip: `3 reviews are waiting. ${copy.countLastKnown}` });
		assert.strictEqual(copy.countLastKnown, "Last known count; Pulley couldn't confirm it.");
		count.render({ count: 0, countStale: true });
		assert.strictEqual(tree.badge, undefined, 'never an unqualified zero');
		count.render({ count: 0, countStale: false });
		assert.strictEqual(tree.badge, undefined, 'clear: no badge');
		count.render({ count: null, countStale: false });
		assert.strictEqual(badgeWrites(), 3);
	});
});

/** A memento with one account Y holding one item and the given `newSignal`. */
function memento(newSignal: boolean, schemaVersion = 1) {
	const item = {
		id: 'X',
		repo: 'octo/app',
		number: 7,
		title: 'Fix X',
		author: 'alice',
		url: 'https://github.com/octo/app/pull/7',
		firstSeenAt: 1,
		origin: 'new',
		alert: 'shown',
	};
	const state = {
		value: {
			schemaVersion,
			accounts: {
				Y: { ...emptyAccount(), firstCheckDone: true, lastSuccessAt: 1, lastAttemptAt: 1, lastAttemptIntervalMs: 15 * 60_000, newSignal, items: { X: item } },
			},
		} as unknown,
	};
	let writes = 0;
	const m: StateMemento = {
		get: (key) => (key === STATE_KEY ? state.value : undefined),
		update: async (_key, next) => {
			writes++;
			state.value = next;
		},
	};
	return { memento: m, stored: () => state.value as Stored, writes: () => writes };
}

const settle = async () => {
	for (let i = 0; i < 10; i++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
};

/**
 * One window's `queueViewed` wiring over a real store, through the same helper extension.ts calls.
 * Visibility and focus are injected events fired by the tests; every store change re-renders,
 * and every render ends with `afterRender` (as extension.ts's render does).
 */
function window(seed: ReturnType<typeof memento>, opts: { visible: boolean; focused: boolean }) {
	const real = createStore(seed.memento, () => {});
	let runs = 0;
	const store: Pick<Store, 'read' | 'mutate'> = {
		read: () => real.read(),
		mutate: (transition, input, ctx) => {
			if ((transition as unknown) === queueViewed) {
				runs++;
			}
			return real.mutate(transition, input, ctx);
		},
	};
	const { tree, visibility } = fakes();
	tree.visible = opts.visible;
	const windowState = new vscode.EventEmitter<{ focused: boolean }>();
	let focused = opts.focused;
	const wiring = createQueueViewedWiring({
		store,
		treeView: tree,
		onDidChangeWindowState: windowState.event,
		isFocused: () => focused,
		getActiveAccountId: () => 'Y',
		log: () => {},
	});
	let renders = 0;
	real.onDidChange(() => {
		renders++;
		wiring.afterRender();
	});
	return {
		store: real,
		wiring,
		runs: () => runs,
		renders: () => renders,
		/** The tree view becomes visible (or hidden) and fires its visibility event. */
		show: (visible: boolean) => {
			tree.visible = visible;
			visibility.fire({ visible });
		},
		/** The window gains (or loses) focus and fires its window-state event. */
		focus: (next: boolean) => {
			focused = next;
			windowState.fire({ focused: next });
		},
	};
}

suite('Story 2.3: queueViewed wiring', () => {
	const rctx = { now: 10_000, activeAccountId: 'Y', intervalMs: 15 * 60_000, windowFocused: true, today: '2026-10-03', startupReminderDue: false };
	const newItem = { id: 'Z', repo: 'octo/app', number: 9, title: 'Fix Z', author: 'bob', url: 'https://github.com/octo/app/pull/9' };
	const keep = { id: 'X', repo: 'octo/app', number: 7, title: 'Fix X', author: 'alice', url: 'https://github.com/octo/app/pull/7' };

	test('matrix "Queue opened": the visibility event runs queueViewed and clears newSignal with no effect', async () => {
		const seed = memento(true);
		const w = window(seed, { visible: false, focused: false });
		w.show(true);
		await settle();
		assert.strictEqual(seed.stored().accounts.Y.newSignal, false);
		assert.strictEqual(w.runs(), 1);
		// Already false: no queueViewed, no write, and no re-render on the next visibility or focus.
		const writes = seed.writes();
		const renders = w.renders();
		w.show(false);
		w.show(true);
		w.focus(true);
		await settle();
		assert.strictEqual(w.runs(), 1);
		assert.strictEqual(seed.writes(), writes);
		assert.strictEqual(w.renders(), renders);
	});

	test('a hidden view does not run queueViewed from focus, lookups, or renders', async () => {
		const seed = memento(true);
		const w = window(seed, { visible: false, focused: false });
		w.focus(true);
		await w.wiring.lookupApplied(undefined, 'Y');
		w.wiring.afterRender();
		await settle();
		assert.strictEqual(w.runs(), 0);
		assert.strictEqual(seed.stored().accounts.Y.newSignal, true);
	});

	test('matrix "New while visible" (E5): a check adding X while visible and focused renders new, then clears newSignal', async () => {
		const seed = memento(false);
		const w = window(seed, { visible: true, focused: true });
		const seen: Mascot[] = [];
		w.store.onDidChange(() => {
			const read = w.store.read();
			assert.ok(!read.readOnly);
			const m = viewModel(read.stored, { connection: { kind: 'connected', accountId: 'Y', label: 'y', generation: 1 }, readOnly: false, checking: false }, {
				now: 10_000,
				formatTime: String,
				today: '2026-10-03',
				threshold: 5,
			});
			seen.push(m.mascot);
		});
		await w.store.mutate(reconcile, { ok: true, accountId: 'Y', fetchStartedAt: 2, complete: true, items: [keep, newItem] }, rctx);
		await settle();
		assert.strictEqual(seen[0], 'new', 'the new request renders first');
		assert.strictEqual(seen.at(-1), 'waiting', 'then the post-render queueViewed ends the signal');
		assert.strictEqual(seed.stored().accounts.Y.newSignal, false);
		assert.strictEqual(w.runs(), 1);
	});

	test('matrix "New while visible, unfocused" (B5): newSignal stays until focus, whose event runs queueViewed', async () => {
		const seed = memento(false);
		const w = window(seed, { visible: true, focused: false });
		await w.store.mutate(reconcile, { ok: true, accountId: 'Y', fetchStartedAt: 2, complete: true, items: [keep, newItem] }, { ...rctx, windowFocused: false });
		await settle();
		assert.strictEqual(seed.stored().accounts.Y.newSignal, true);
		assert.strictEqual(w.runs(), 0);
		w.focus(true);
		await settle();
		assert.strictEqual(seed.stored().accounts.Y.newSignal, false);
		assert.strictEqual(w.runs(), 1);
	});

	test('matrix "Read-only store" (X5): newer schema, visible and focused: no queueViewed and no render loop', async () => {
		const seed = memento(true, 2);
		const w = window(seed, { visible: true, focused: true });
		w.wiring.afterRender();
		w.show(true);
		w.focus(true);
		await w.wiring.lookupApplied(undefined, 'Y');
		await settle();
		assert.strictEqual(w.runs(), 0);
		assert.strictEqual(w.renders(), 0);
		assert.strictEqual(seed.writes(), 0);
	});

	test('dispose stops the visibility and focus subscriptions', async () => {
		const seed = memento(true);
		const w = window(seed, { visible: false, focused: true });
		w.wiring.dispose();
		w.show(true);
		w.focus(true);
		await settle();
		assert.strictEqual(w.runs(), 0);
	});

	test('a render that sets newSignal again while a post-render queueViewed is in flight triggers one more run', async () => {
		let newSignal = true;
		let release: (() => void) | undefined;
		let runs = 0;
		const sync = createQueueViewedSync({
			isVisible: () => true,
			isFocused: () => true,
			newSignal: () => newSignal,
			run: () => {
				runs++;
				return new Promise<void>((resolve) => {
					release = () => {
						newSignal = false;
						resolve();
					};
				});
			},
			log: () => {},
		});
		sync.afterRender();
		assert.strictEqual(runs, 1);
		// A render arrives while the call is in flight: at most one call is in flight.
		sync.afterRender();
		assert.strictEqual(runs, 1);
		// The first call clears the signal, but a check sets it again before the re-check.
		const first = release!;
		first();
		newSignal = true;
		await settle();
		assert.strictEqual(runs, 2, 'the re-check runs once more');
		release!();
		await settle();
		assert.strictEqual(runs, 2, 'and stops once the signal is clear');
	});

	test('a failed post-render queueViewed is logged and not retried in a loop', async () => {
		const lines: string[] = [];
		let runs = 0;
		const sync = createQueueViewedSync({
			isVisible: () => true,
			isFocused: () => true,
			newSignal: () => true,
			run: async () => {
				runs++;
				throw new Error('disk full');
			},
			log: (line) => lines.push(line),
		});
		sync.afterRender();
		await settle();
		assert.strictEqual(runs, 1);
		assert.deepStrictEqual(lines, [copy.log.queueViewedFailed('disk full')]);
	});

	test('matrix "Startup, view visible" (A1): a persisted newSignal is cleared after the first lookup', async () => {
		const seed = memento(true);
		// Unfocused at activation: only the lookup trigger applies.
		const w = window(seed, { visible: true, focused: false });
		await w.wiring.lookupApplied(undefined, 'Y');
		assert.strictEqual(seed.stored().accounts.Y.newSignal, false);
		assert.strictEqual(w.runs(), 1);
		// A lookup that keeps the same account does not run it again.
		await w.wiring.lookupApplied('Y', 'Y');
		assert.strictEqual(w.runs(), 1);
	});
});
