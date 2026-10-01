import * as assert from 'assert';
import * as vscode from 'vscode';
import { QueueView, type QueueTreeView } from '../../src/shell/queueView.ts';

function fakes() {
	const tree: QueueTreeView = { message: 'stale', dispose: () => {} };
	const context: Array<[string, unknown]> = [];
	const view = new QueueView(tree, async (key, value) => {
		context.push([key, value]);
	});
	return { tree, context, view };
}

suite('QueueView', () => {
	test('unconnected: context key unconnected, no tree message (welcome content shows)', async () => {
		const { tree, context, view } = fakes();
		await view.render({ kind: 'unconnected' });
		assert.deepStrictEqual(context, [['pulley.connection', 'unconnected']]);
		assert.strictEqual(tree.message, undefined);
	});

	test('connected: context key connected, "Connected as …" message', async () => {
		const { tree, context, view } = fakes();
		await view.render({ kind: 'connected', accountId: '42', label: 'octocat' });
		assert.deepStrictEqual(context, [['pulley.connection', 'connected']]);
		assert.strictEqual(tree.message, 'Connected as octocat. Waiting for the first check.');
	});
});

suite('QueueView check rendering', () => {
	const item = (n: number) => ({
		id: `PR_${n}`,
		repo: 'octo/app',
		number: n,
		title: `Fix ${n}`,
		author: 'alice',
		url: `https://github.com/octo/app/pull/${n}`,
	});

	test('success renders plain rows and the pending message', async () => {
		const { tree, view } = fakes();
		await view.render({ kind: 'connected', accountId: 'a', label: 'octocat' });
		view.renderChecking();
		assert.strictEqual(tree.message, 'Checking review requests…');
		view.renderCheck({ ok: true, accountId: 'a', fetchStartedAt: 1, complete: true, items: [item(1), item(2)] });
		assert.strictEqual(tree.message, '2 reviews are waiting.');
		const rows = view.provider.getChildren();
		assert.strictEqual(rows.length, 2);
		const treeItem = view.provider.getTreeItem(rows[0]);
		assert.strictEqual(treeItem.label, 'Fix 1');
		assert.strictEqual(treeItem.description, 'octo/app#1 · alice');
		assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None);
		assert.deepStrictEqual(view.provider.getChildren(rows[0]), []);
	});

	test('complete empty success shows the clear sentence', () => {
		const { tree, view } = fakes();
		view.renderCheck({ ok: true, accountId: 'a', fetchStartedAt: 1, complete: true, items: [] });
		assert.strictEqual(tree.message, 'No reviews are waiting in repositories visible to this GitHub sign-in.');
	});

	test('failure keeps the same account rows and never shows clear', () => {
		const { tree, view } = fakes();
		view.renderCheck({ ok: true, accountId: 'a', fetchStartedAt: 1, complete: true, items: [item(1)] });
		view.renderCheck({ ok: false, accountId: 'a', fetchStartedAt: 2, reason: 'network' });
		assert.strictEqual(tree.message, "Couldn't check GitHub.");
		assert.strictEqual(view.provider.getChildren().length, 1);
		view.renderCheck({ ok: false, accountId: 'b', fetchStartedAt: 3, reason: 'network' });
		assert.strictEqual(view.provider.getChildren().length, 0);
	});

	test('connected render keeps rows for the same account and clears them for another', async () => {
		const { view } = fakes();
		view.renderCheck({ ok: true, accountId: 'a', fetchStartedAt: 1, complete: true, items: [item(1), item(2)] });
		await view.render({ kind: 'connected', accountId: 'a', label: 'octocat' });
		assert.strictEqual(view.provider.getChildren().length, 2);
		await view.render({ kind: 'connected', accountId: 'b', label: 'hubot' });
		assert.strictEqual(view.provider.getChildren().length, 0);
	});

	test('unconnected clears rows', async () => {
		const { view } = fakes();
		view.renderCheck({ ok: true, accountId: 'a', fetchStartedAt: 1, complete: true, items: [item(1)] });
		await view.render({ kind: 'unconnected' });
		assert.strictEqual(view.provider.getChildren().length, 0);
	});
});
