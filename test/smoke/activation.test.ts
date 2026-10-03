import * as assert from 'assert';
import * as vscode from 'vscode';
import { emptyAccount } from '../../src/core/reconcile.ts';
import type { Stored, Tracked } from '../../src/core/types.ts';
import { copy } from '../../src/core/copy.ts';
import { createAlertingStore } from '../../src/shell/alertWiring.ts';
import { STATE_KEY, type StateMemento } from '../../src/shell/store.ts';

function findPulley(): vscode.Extension<unknown> | undefined {
	return vscode.extensions.all.find((ext) => ext.packageJSON?.name === 'pulley');
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (predicate()) {
			return true;
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	return predicate();
}

suite('Activation', () => {
	test('activates on startup with no folder open and without opening the view', async () => {
		assert.strictEqual(vscode.workspace.workspaceFolders, undefined, 'expected no folder to be open');
		const ext = findPulley();
		assert.ok(ext, 'Pulley extension is installed in the test host');
		// Do not call ext.activate() or open the view: onStartupFinished must be enough.
		const active = await waitFor(() => ext.isActive, 20000);
		assert.ok(active, 'Pulley activated on startup');
	});

	test('registers pulley.connect', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('pulley.connect'));
		assert.ok(!commands.includes('pulley.helloWorld'), 'scaffold hello-world command removed');
		assert.ok(commands.includes('pulley.openPullRequest'));
		assert.ok(!commands.includes('pulley.debugSeed'), 'debug seed is registered only in Development mode');
	});

	test('registers pulley.refresh and pulley.reconnect', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('pulley.refresh'));
		assert.ok(commands.includes('pulley.reconnect'));
	});

	test('Story 2.2: pulley.queue.focus (the backlog notification button) exists', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('pulley.queue.focus'));
	});

	test('pulley.checkIntervalMinutes defaults to 15', () => {
		const inspected = vscode.workspace.getConfiguration('pulley').inspect<number>('checkIntervalMinutes');
		assert.strictEqual(inspected?.defaultValue, 15);
	});

	test('Story 2.3: pulley.backlogThreshold defaults to 5', () => {
		const inspected = vscode.workspace.getConfiguration('pulley').inspect<number>('backlogThreshold');
		assert.strictEqual(inspected?.defaultValue, 5);
	});

	/** A memento seeded with one pending item X for account A, shared across simulated windows. */
	function seededMemento(url: string) {
		const pending: Tracked = {
			id: 'X',
			repo: 'octo/app',
			number: 7,
			title: 'Pending at startup',
			author: 'alice',
			url,
			firstSeenAt: 1,
			origin: 'new',
			alert: 'pending',
		};
		const state = { value: { schemaVersion: 1, accounts: { A: { ...emptyAccount(), firstCheckDone: true, newSignal: true, items: { X: pending } } } } } as { value: unknown };
		const memento: StateMemento = {
			get: (key) => (key === STATE_KEY ? state.value : undefined),
			update: async (_key, next) => {
				state.value = next;
			},
		};
		return { memento, stored: () => state.value as Stored };
	}

	const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

	test('Story 2.1 (A1): a pending alert persisted at startup is delivered once after the first lookup in a focused window', async () => {
		const seeded = seededMemento('https://github.com/octo/app/pull/7');
		const shown: string[] = [];
		/** One window's activation, through the same factory extension.ts calls. */
		const activateWindow = () =>
			createAlertingStore({
				memento: seeded.memento,
				log: () => {},
				showMessage: (text) => {
					shown.push(text);
					return new Promise<string | undefined>(() => {});
				},
				openExternal: async () => true,
				isFocused: () => true,
				focusQueue: () => undefined,
				today: () => '2026-10-03',
			}).focusDelivery;

		const window = activateWindow();
		// B2: a focus event before the first lookup settles has no active account: a no-op.
		await window.focused(undefined);
		assert.deepStrictEqual(shown, []);
		// The first silent lookup settles with account A: delivered without a poll or focus change.
		await window.lookupApplied(undefined, 'A');
		assert.strictEqual(shown.length, 1);
		assert.match(shown[0], /octo\/app#7/);
		assert.strictEqual(seeded.stored().accounts.A.items.X.alert, 'shown');
		// Later focus events and a reload (a fresh activation over the same state) show nothing more.
		await window.focused('A');
		const reloaded = activateWindow();
		await reloaded.lookupApplied(undefined, 'A');
		await reloaded.focused('A');
		assert.strictEqual(shown.length, 1);
	});

	test('Story 2.1: the notification button opens the exact GitHub URL through the factory', async () => {
		const seeded = seededMemento('https://github.com/octo/app/pull/7');
		const opened: string[] = [];
		const { focusDelivery } = createAlertingStore({
			memento: seeded.memento,
			log: () => {},
			showMessage: async (_text, button) => button,
			openExternal: async (uri) => {
				opened.push(uri.toString(true));
				return true;
			},
			isFocused: () => true,
				focusQueue: () => undefined,
				today: () => '2026-10-03',
		});
		await focusDelivery.lookupApplied(undefined, 'A');
		await tick();
		assert.deepStrictEqual(opened, ['https://github.com/octo/app/pull/7']);
	});

	test('Story 2.1: the notification button on a non-GitHub URL logs openIgnored and never opens', async () => {
		const seeded = seededMemento('https://evil.example/octo/app/pull/7');
		const opened: string[] = [];
		const lines: string[] = [];
		const { focusDelivery } = createAlertingStore({
			memento: seeded.memento,
			log: (line) => lines.push(line),
			showMessage: async (_text, button) => button,
			openExternal: async (uri) => {
				opened.push(uri.toString(true));
				return true;
			},
			isFocused: () => true,
				focusQueue: () => undefined,
				today: () => '2026-10-03',
		});
		await focusDelivery.lookupApplied(undefined, 'A');
		await tick();
		assert.deepStrictEqual(opened, []);
		assert.ok(lines.includes(copy.log.openIgnored('https://evil.example/octo/app/pull/7')), lines.join('\n'));
	});
});
