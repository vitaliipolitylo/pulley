import * as assert from 'assert';
import type * as vscode from 'vscode';
import { connect, lookupSilently, onGitHubSessionsChanged, type GetSession } from '../../src/shell/auth.ts';

const TOKEN = 'gho_secret_token_value';
const session: vscode.AuthenticationSession = {
	id: 's1',
	accessToken: TOKEN,
	account: { id: '42', label: 'octocat' },
	scopes: ['repo'],
};

function recorder(result: () => Promise<vscode.AuthenticationSession | undefined>) {
	const calls: Array<{ providerId: string; scopes: readonly string[]; options: vscode.AuthenticationGetSessionOptions }> = [];
	const getSession: GetSession = (providerId, scopes, options) => {
		calls.push({ providerId, scopes, options });
		return result();
	};
	return { calls, getSession };
}

suite('Auth', () => {
	test('fresh start: silent lookup with no session is unconnected and never prompts', async () => {
		const { calls, getSession } = recorder(async () => undefined);
		const state = await lookupSilently(() => {}, getSession);
		assert.deepStrictEqual(state, { kind: 'unconnected' });
		assert.deepStrictEqual(calls, [{ providerId: 'github', scopes: ['repo'], options: { silent: true } }]);
	});

	test('existing session: silent lookup is connected with the account only', async () => {
		const { getSession } = recorder(async () => session);
		const state = await lookupSilently(() => {}, getSession);
		assert.deepStrictEqual(state, { kind: 'connected', accountId: '42', label: 'octocat' });
		assert.ok(!JSON.stringify(state).includes(TOKEN));
	});

	test('connect succeeds: requests repo with createIfNone and keeps no token', async () => {
		const lines: string[] = [];
		const { calls, getSession } = recorder(async () => session);
		const state = await connect((l) => lines.push(l), getSession);
		assert.deepStrictEqual(state, { kind: 'connected', accountId: '42', label: 'octocat' });
		assert.deepStrictEqual(calls[0].options, { createIfNone: true });
		assert.ok(!lines.join('\n').includes(TOKEN));
	});

	test('connect cancelled or failed: stays unconnected, logs a short reason, does not throw', async () => {
		const lines: string[] = [];
		const { getSession } = recorder(async () => {
			throw new Error('User did not consent to login.');
		});
		const state = await connect((l) => lines.push(l), getSession);
		assert.deepStrictEqual(state, { kind: 'unconnected' });
		assert.ok(lines.some((l) => l.includes('User did not consent to login.')));
	});

	test('session removed elsewhere: silent lookup returning undefined goes back to unconnected', async () => {
		let current: vscode.AuthenticationSession | undefined = session;
		const { getSession } = recorder(async () => current);
		assert.strictEqual((await lookupSilently(() => {}, getSession)).kind, 'connected');
		current = undefined;
		assert.deepStrictEqual(await lookupSilently(() => {}, getSession), { kind: 'unconnected' });
	});

	test('session change listener runs only for the github provider', () => {
		let handler: ((e: vscode.AuthenticationSessionsChangeEvent) => void) | undefined;
		const fakeEvent: vscode.Event<vscode.AuthenticationSessionsChangeEvent> = (listener) => {
			handler = listener;
			return { dispose: () => (handler = undefined) };
		};
		let calls = 0;
		const disposable = onGitHubSessionsChanged(() => calls++, fakeEvent);
		handler!({ provider: { id: 'microsoft', label: 'Microsoft' } });
		assert.strictEqual(calls, 0);
		handler!({ provider: { id: 'github', label: 'GitHub' } });
		assert.strictEqual(calls, 1);
		disposable.dispose();
		assert.strictEqual(handler, undefined);
	});

	test('silent lookup failure is unconnected and does not throw', async () => {
		const { getSession } = recorder(async () => {
			throw new Error('provider unavailable');
		});
		assert.deepStrictEqual(await lookupSilently(() => {}, getSession), { kind: 'unconnected' });
	});
});
