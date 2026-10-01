import * as vscode from 'vscode';
import { copy } from './core/copy.ts';
import type { ConnectionState } from './core/connection.ts';
import type { CheckResult } from './core/types.ts';
import { connect, getToken, lookupSilently, onGitHubSessionsChanged } from './shell/auth.ts';
import { checkWithRetry } from './shell/checkWithRetry.ts';
import { runCheck } from './shell/github.ts';
import { QueueView } from './shell/queueView.ts';

export function activate(context: vscode.ExtensionContext): void {
	const output = vscode.window.createOutputChannel(copy.outputChannelName);
	const log = (line: string): void => output.appendLine(`[${new Date().toISOString()}] ${line}`);
	const view = new QueueView();
	context.subscriptions.push(output, view);

	// Window memory only. Each lookup takes a ticket so a slower, older lookup
	// (or the check that follows it) cannot overwrite the result of a newer one.
	let latestTicket = 0;

	/** One check with a fresh silent token; a 401 retries the silent lookup once (AD-11). */
	const checkOnce = (): Promise<CheckResult | undefined> =>
		checkWithRetry({
			getToken: () => getToken(log),
			// fetchStartedAt is read before the first request of each attempt.
			runCheck: (token, accountId) =>
				runCheck({ fetch: globalThis.fetch, token, accountId, fetchStartedAt: Date.now(), log }),
			log,
		});

	// Temporary single check after a session is found (Story 1.5 replaces this with the scheduler).
	const checkAfterConnect = async (ticket: number, accountId: string): Promise<void> => {
		view.renderChecking();
		const result = await checkOnce();
		if (ticket !== latestTicket) {
			return;
		}
		if (!result) {
			log(copy.log.checkNoSession);
			await view.render({ kind: 'unconnected' });
			return;
		}
		if (result.accountId !== accountId) {
			// The session changed under this check; the newer lookup's check will render.
			return;
		}
		view.renderCheck(result);
	};

	const apply = async (lookup: Promise<ConnectionState>): Promise<void> => {
		const ticket = ++latestTicket;
		const state = await lookup;
		if (ticket !== latestTicket) {
			return;
		}
		log(copy.log.stateChanged(state.kind));
		await view.render(state);
		if (state.kind === 'connected' && ticket === latestTicket) {
			await checkAfterConnect(ticket, state.accountId);
		}
	};

	void view.render({ kind: 'unknown' });

	context.subscriptions.push(
		vscode.commands.registerCommand('pulley.connect', () => apply(connect(log))),
		onGitHubSessionsChanged(() => void apply(lookupSilently(log))),
	);

	void apply(lookupSilently(log));
}

export function deactivate(): void {}
