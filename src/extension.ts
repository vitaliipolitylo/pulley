import * as vscode from 'vscode';
import { shortReason, type ConnectionState } from './core/connection.ts';
import { copy } from './core/copy.ts';
import { reconcile } from './core/reconcile.ts';
import type { CheckResult } from './core/types.ts';
import { viewModel } from './core/viewModel.ts';
import { connect, getToken, lookupSilently, onGitHubSessionsChanged } from './shell/auth.ts';
import { checkWithRetry } from './shell/checkWithRetry.ts';
import { runCheck } from './shell/github.ts';
import { OPEN_PULL_REQUEST_COMMAND, openPullRequest, QUEUE_VIEW_ID, QueueView } from './shell/queueView.ts';
import { createIntervalReader, createScheduler, formatCheckTime, type Scheduler } from './shell/scheduler.ts';
import { createStore, type Store } from './shell/store.ts';
import { FIFTY, fiftyResult } from '../test/smoke/fixtures/fifty.ts';

const INTERVAL_SETTING = 'pulley.checkIntervalMinutes';

/** Returned from `activate` only in Test mode, so smoke tests can seed and read stored state. */
export interface PulleyTestApi {
	store: Store;
}

let activeScheduler: Scheduler | undefined;

export function activate(context: vscode.ExtensionContext): PulleyTestApi | undefined {
	const output = vscode.window.createOutputChannel(copy.outputChannelName);
	const log = (line: string): void => output.appendLine(`[${new Date().toISOString()}] ${line}`);
	const view = new QueueView();
	const store = createStore(context.globalState, log);
	context.subscriptions.push(output, view);

	// Window memory only (never persisted): the connection (and so the active account), the
	// number of checks in flight, a ticket per lookup so a slower, older lookup cannot overwrite
	// a newer one's connection state, and the latest silent lookup so a check waits for its
	// account. Interactive Connect lookups never gate a check (consent can stay open forever).
	let connection: ConnectionState = { kind: 'unknown' };
	let checking = 0;
	let latestTicket = 0;
	let latestSilentLookup: Promise<unknown> = Promise.resolve();

	/** Waits until the newest silent lookup has settled, including ones started meanwhile. */
	const silentLookupsSettled = async (): Promise<void> => {
		let current: Promise<unknown>;
		do {
			current = latestSilentLookup;
			await current;
		} while (current !== latestSilentLookup);
	};

	const getIntervalMs = createIntervalReader(() => vscode.workspace.getConfiguration().get<unknown>(INTERVAL_SETTING), log);

	/** Renders from a fresh store read, which is how other windows' writes appear. */
	const render = (): Promise<void> => {
		const read = store.read();
		const now = Date.now();
		const model = viewModel(
			read.readOnly ? undefined : read.stored,
			{ connection, readOnly: read.readOnly, checking: checking > 0 },
			{ now, formatTime: (ms) => formatCheckTime(ms, now) },
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

	/**
	 * The scheduler's check: silent session → GitHub → store.mutate(reconcile), with the window's
	 * `checking` flag set around it. Reconcile drops other accounts' results (rule 1) and results
	 * older than the last applied complete check (rule 4). No session means no network call.
	 */
	const runQueueCheck = async (): Promise<void> => {
		await silentLookupsSettled();
		const ticket = latestTicket;
		checking++;
		try {
			void render();
			const result = await checkOnce();
			if (!result) {
				log(copy.log.checkNoSession);
				if (ticket === latestTicket) {
					connection = { kind: 'unconnected' };
				}
				return;
			}
			const activeAccountId = connection.kind === 'connected' ? connection.accountId : undefined;
			try {
				await store.mutate(reconcile, result, { now: Date.now(), activeAccountId, intervalMs: getIntervalMs() });
			} catch (error) {
				log(copy.log.stateWriteFailed(shortReason(error)));
			}
		} finally {
			checking--;
			await render();
		}
	};

	const scheduler = createScheduler({
		runCheck: runQueueCheck,
		getIntervalMs,
		random: Math.random,
		setTimeout: (callback, ms) => setTimeout(callback, ms),
		clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
		log,
	});
	activeScheduler = scheduler;
	context.subscriptions.push({ dispose: () => scheduler.dispose() });

	/** Applies a connection lookup; resolves to its state, or undefined when a newer lookup won. */
	const apply = (lookup: Promise<ConnectionState>, silent: boolean): Promise<ConnectionState | undefined> => {
		const ticket = ++latestTicket;
		const applied = (async () => {
			const state = await lookup;
			if (ticket !== latestTicket) {
				return undefined;
			}
			connection = state;
			log(copy.log.stateChanged(state.kind));
			await render();
			return state;
		})();
		if (silent) {
			latestSilentLookup = applied;
		}
		return applied;
	};

	// Refresh joins an in-flight check, and the view's progress indicator wraps each in-flight
	// promise once, so repeated presses show one indicator and start one request sequence.
	let progressShownFor: Promise<void> | undefined;
	const refresh = (): Promise<void> => {
		const check = scheduler.trigger('manual');
		if (check !== progressShownFor) {
			progressShownFor = check;
			void vscode.window.withProgress({ location: { viewId: QUEUE_VIEW_ID } }, () => check);
		}
		return check;
	};

	void render();

	context.subscriptions.push(
		vscode.commands.registerCommand('pulley.connect', async () => {
			await apply(connect(log), false);
			// createIfNone fires onDidChangeSessions before connect() resolves, so a newer silent
			// lookup may win the ticket. Wait for it, then check whichever lookup won. The user is
			// waiting: a manual trigger skips jitter and cancels that event's jittered check.
			await silentLookupsSettled();
			if (connection.kind === 'connected') {
				await scheduler.trigger('manual');
			}
		}),
		vscode.commands.registerCommand('pulley.refresh', () => refresh()),
		onGitHubSessionsChanged(() => {
			void apply(lookupSilently(log), true).then((state) => (state ? scheduler.trigger('session-changed') : undefined));
		}),
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration(INTERVAL_SETTING)) {
				// A fresh interval from the change; no check and no stored change.
				scheduler.restartInterval();
				log(copy.log.intervalRestarted(getIntervalMs() / 60_000));
			}
		}),
		// Bound as each row's TreeItem.command (click and Enter). `vscode.env.openExternal` is read
		// per call so smoke tests can stub it. Opening changes no stored state.
		vscode.commands.registerCommand(OPEN_PULL_REQUEST_COMMAND, (row: unknown) =>
			openPullRequest(row, (uri) => vscode.env.openExternal(uri), log),
		),
	);

	if (context.extensionMode === vscode.ExtensionMode.Development) {
		// Prototype checks (Story 1.4): fifty synthetic rows in the active account, written as a
		// complete check through the single write path. The next complete check replaces them.
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
						intervalMs: getIntervalMs(),
					});
					log(copy.log.debugSeeded(FIFTY));
					void vscode.window.showInformationMessage(copy.debugSeedDone(FIFTY));
				} catch (error) {
					log(copy.log.debugSeedFailed(shortReason(error)));
				}
			}),
		);
	}

	void apply(lookupSilently(log), true);
	void scheduler.trigger('activation');

	return context.extensionMode === vscode.ExtensionMode.Test ? { store } : undefined;
}

export function deactivate(): void {
	activeScheduler?.dispose();
	activeScheduler = undefined;
}
