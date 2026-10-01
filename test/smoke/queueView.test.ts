import * as assert from 'assert';
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
