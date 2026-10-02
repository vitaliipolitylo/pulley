import * as assert from 'assert';
import * as vscode from 'vscode';
import { reconcile } from '../../src/core/reconcile.ts';
import type { Row } from '../../src/core/types.ts';
import { viewModel } from '../../src/core/viewModel.ts';
import type { PulleyTestApi } from '../../src/extension.ts';
import { openPullRequest } from '../../src/shell/queueView.ts';
import { FIFTY, fiftyResult } from './fixtures/fifty.ts';

const ACCOUNT = 'smoke-open-account';

async function pulleyApi(): Promise<PulleyTestApi> {
	const ext = vscode.extensions.all.find((e) => e.packageJSON?.name === 'pulley');
	assert.ok(ext, 'Pulley extension is installed in the test host');
	const api = (await ext.activate()) as PulleyTestApi | undefined;
	assert.ok(api?.store, 'activate returns the test API in Test mode');
	return api;
}

/** Replaces `vscode.env.openExternal` for the duration of `body`, recording every URI. */
async function withStubbedOpenExternal(body: (opened: string[]) => Promise<void>): Promise<void> {
	const env = vscode.env as { openExternal: typeof vscode.env.openExternal };
	const original = env.openExternal;
	const opened: string[] = [];
	env.openExternal = async (uri: vscode.Uri) => {
		opened.push(uri.toString(true));
		return true;
	};
	try {
		assert.notStrictEqual(vscode.env.openExternal, original, 'openExternal stub installed');
		await body(opened);
	} finally {
		env.openExternal = original;
	}
}

suite('pulley.openPullRequest', () => {
	let rows: Row[] = [];
	let api: PulleyTestApi;

	suiteSetup(async () => {
		api = await pulleyApi();
		const now = Date.now();
		await api.store.mutate(reconcile, fiftyResult(ACCOUNT, now), { now, activeAccountId: ACCOUNT, intervalMs: 15 * 60 * 1000 });
		const read = api.store.read();
		assert.ok(!read.readOnly);
		rows = viewModel(
			read.stored,
			{ connection: { kind: 'connected', accountId: ACCOUNT, label: 'smoke' }, readOnly: false, checking: false },
			{ now },
		).rows;
		assert.strictEqual(rows.length, FIFTY, 'fifty seeded rows');
	});

	test('opens the exact PR URL and leaves pulley.state.v1 unchanged', async () => {
		const row = rows[7];
		const before = structuredClone(api.store.read());
		await withStubbedOpenExternal(async (opened) => {
			await vscode.commands.executeCommand('pulley.openPullRequest', row);
			assert.deepStrictEqual(opened, [row.url]);
		});
		assert.deepStrictEqual(api.store.read(), before, 'stored state unchanged; the row stays');
	});

	test('a rejected openExternal logs one failure line, resolves false, and leaves state unchanged', async () => {
		const before = structuredClone(api.store.read());
		const lines: string[] = [];
		const result = await openPullRequest(rows[0], () => Promise.reject(new Error('boom')), (line) => lines.push(line));
		assert.strictEqual(result, false);
		assert.strictEqual(lines.length, 1);
		assert.ok(lines[0].startsWith('Opening the pull request failed'), lines[0]);
		assert.deepStrictEqual(api.store.read(), before);
	});

	test('a non-GitHub URL is not opened', async () => {
		const before = structuredClone(api.store.read());
		await withStubbedOpenExternal(async (opened) => {
			for (const url of ['https://evil.example/pull/1', 'http://github.com/o/r/pull/1', 'https://github.com.evil.example/o/r/pull/1', 'javascript:alert(1)']) {
				await vscode.commands.executeCommand('pulley.openPullRequest', { ...rows[0], url });
			}
			await vscode.commands.executeCommand('pulley.openPullRequest', undefined);
			await vscode.commands.executeCommand('pulley.openPullRequest', { url: 42 });
			assert.deepStrictEqual(opened, []);
		});
		assert.deepStrictEqual(api.store.read(), before);
	});
});
