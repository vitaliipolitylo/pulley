import * as vscode from 'vscode';
import { shortReason, type ConnectionState } from './core/connection.ts';
import { copy } from './core/copy.ts';
import { reconcile } from './core/reconcile.ts';
import type { CheckResult } from './core/types.ts';
import { viewModel } from './core/viewModel.ts';
import { connect, getToken, lookupSilently, onGitHubSessionsChanged } from './shell/auth.ts';
import { checkWithRetry } from './shell/checkWithRetry.ts';
import { runCheck } from './shell/github.ts';
import { OPEN_PULL_REQUEST_COMMAND, openPullRequest, QueueView } from './shell/queueView.ts';
import { createStore, type Store } from './shell/store.ts';
import { FIFTY, fiftyResult } from '../test/smoke/fixtures/fifty.ts';

/** Check interval until Story 1.5 adds the `pulley.checkIntervalMinutes` setting. */
const INTERVAL_MS = 15 * 60 * 1000;

/** Returned from `activate` only in Test mode, so smoke tests can seed and read stored state. */
export interface PulleyTestApi {
	store: Store;
}

export function activate(context: vscode.ExtensionContext): PulleyTestApi | undefined {
	const output = vscode.window.createOutputChannel(copy.outputChannelName);
	const log = (line: string): void => output.appendLine(`[${new Date().toISOString()}] ${line}`);
	const view = new QueueView();
	const store = createStore(context.globalState, log);
	context.subscriptions.push(output, view);

	// Window memory only (never persisted): the connection (and so the active account),
	// the number of checks in flight, and a ticket per lookup so a slower, older lookup
	// cannot overwrite the connection state of a newer one.
	let connection: ConnectionState = { kind: 'unknown' };
	let checking = 0;
	let latestTicket = 0;

	/** Renders from a fresh store read, which is how other windows' writes appear. */
	const render = (): Promise<void> => {
		const read = store.read();
		const model = viewModel(
			read.readOnly ? undefined : read.stored,
			{ connection, readOnly: read.readOnly, checking: checking > 0 },
			{ now: Date.now() },
		);
		return view.render(model);
	};
	const sub = store.onDidChange(() => void render());
	context.subscriptions.push({ dispose: () => sub.dispose() });

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
	// Every result goes through store.mutate(reconcile): reconcile drops other accounts' results
	// (rule 1) and results older than the last applied complete check (rule 4).
	const checkAfterConnect = async (ticket: number): Promise<void> => {
		checking++;
		void render();
		let result: CheckResult | undefined;
		try {
			result = await checkOnce();
		} finally {
			checking--;
		}
		if (!result) {
			if (ticket === latestTicket) {
				log(copy.log.checkNoSession);
				connection = { kind: 'unconnected' };
			}
			await render();
			return;
		}
		const activeAccountId = connection.kind === 'connected' ? connection.accountId : undefined;
		try {
			await store.mutate(reconcile, result, { now: Date.now(), activeAccountId, intervalMs: INTERVAL_MS });
		} catch (error) {
			log(copy.log.stateWriteFailed(shortReason(error)));
			await render();
		}
	};

	const apply = async (lookup: Promise<ConnectionState>): Promise<void> => {
		const ticket = ++latestTicket;
		const state = await lookup;
		if (ticket !== latestTicket) {
			return;
		}
		connection = state;
		log(copy.log.stateChanged(state.kind));
		await render();
		if (state.kind === 'connected' && ticket === latestTicket) {
			await checkAfterConnect(ticket);
		}
	};

	void render();

	context.subscriptions.push(
		vscode.commands.registerCommand('pulley.connect', () => apply(connect(log))),
		onGitHubSessionsChanged(() => void apply(lookupSilently(log))),
		// Bound as each row's TreeItem.command (click and Enter). `vscode.env.openExternal` is read
		// per call so smoke tests can stub it. Opening changes no stored state.
		vscode.commands.registerCommand(OPEN_PULL_REQUEST_COMMAND, (row: unknown) =>
			openPullRequest(row, (uri) => vscode.env.openExternal(uri), log),
		),
	);

	if (context.extensionMode === vscode.ExtensionMode.Development) {
		// Prototype checks (Story 1.4): fifty synthetic rows in the active account, written as a
		// complete check through the single write path. The next real check replaces them.
		// Shows the command in the palette only here (package.json menus.commandPalette).
		void vscode.commands.executeCommand('setContext', 'pulley.development', true);
		context.subscriptions.push(
			vscode.commands.registerCommand('pulley.debugSeed', async () => {
				if (connection.kind !== 'connected') {
					void vscode.window.showWarningMessage(copy.debugSeedNeedsConnection);
					return;
				}
				const now = Date.now();
				try {
					await store.mutate(reconcile, fiftyResult(connection.accountId, now), {
						now,
						activeAccountId: connection.accountId,
						intervalMs: INTERVAL_MS,
					});
					log(copy.log.debugSeeded(FIFTY));
					void vscode.window.showInformationMessage(copy.debugSeedDone(FIFTY));
				} catch (error) {
					log(copy.log.debugSeedFailed(shortReason(error)));
				}
			}),
		);
	}

	void apply(lookupSilently(log));

	return context.extensionMode === vscode.ExtensionMode.Test ? { store } : undefined;
}

export function deactivate(): void {}
