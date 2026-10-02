import * as assert from 'assert';
import * as vscode from 'vscode';
import type { Row, ViewModel } from '../../src/core/types.ts';
import { QueueView, type QueueTreeView } from '../../src/shell/queueView.ts';

function fakes() {
	let messageWrites = 0;
	let message: string | undefined = 'initial';
	const tree: QueueTreeView = {
		get message() {
			return message;
		},
		set message(value) {
			messageWrites++;
			message = value;
		},
		dispose: () => {},
	};
	const context: Array<[string, unknown]> = [];
	const view = new QueueView(tree, async (key, value) => {
		context.push([key, value]);
	});
	let refreshes = 0;
	view.provider.onDidChangeTreeData(() => refreshes++);
	return { tree, context, view, counts: () => ({ messageWrites, refreshes }) };
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
const pending = (rows: Row[], message = `${rows.length} reviews are waiting.`): ViewModel => ({ status: 'pending', count: rows.length, message, rows });

suite('QueueView', () => {
	test('unconnected: context key unconnected, no tree message (welcome content shows)', async () => {
		const { tree, context, view } = fakes();
		await view.render({ status: 'unconnected', count: null, rows: [] });
		assert.deepStrictEqual(context, [['pulley.connection', 'unconnected']]);
		assert.strictEqual(tree.message, undefined);
	});

	test('rows render as native tree items with tooltip, accessible label, icon, and open command', async () => {
		const { tree, context, view } = fakes();
		await view.render(pending([row(1), row(2)]));
		assert.deepStrictEqual(context, [['pulley.connection', 'connected']]);
		assert.strictEqual(tree.message, '2 reviews are waiting.');
		const rows = view.provider.getChildren();
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
		await view.render(pending([row(1)]));
		const start = counts();
		await view.render({ status: 'stale', count: 1, message: "Couldn't check GitHub. Showing the last known requests.", rows: [row(1)] });
		assert.strictEqual(counts().refreshes, start.refreshes);
		assert.strictEqual(counts().messageWrites, start.messageWrites + 1);
		await view.render(pending([row(1), row(2)]));
		assert.strictEqual(counts().refreshes, start.refreshes + 1);
	});

	test('context key changes only when connected/unconnected flips', async () => {
		const { context, view } = fakes();
		await view.render({ status: 'loading', count: null, message: 'Checking GitHub connection…', rows: [] });
		await view.render(pending([row(1)]));
		await view.render({ status: 'unconnected', count: null, rows: [] });
		assert.deepStrictEqual(context, [
			['pulley.connection', 'connected'],
			['pulley.connection', 'unconnected'],
		]);
	});
});
