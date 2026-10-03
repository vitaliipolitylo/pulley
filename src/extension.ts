import * as vscode from 'vscode';
import { activeAccountId, shortReason, type ConnectionState, type SessionLookup } from './core/connection.ts';
import { copy } from './core/copy.ts';
import { reconcile } from './core/reconcile.ts';
import type { CheckResult } from './core/types.ts';
import { viewModel } from './core/viewModel.ts';
import { connect, getToken, lookupSilently, onGitHubSessionsChanged, SessionGeneration } from './shell/auth.ts';
import { runCheck } from './shell/github.ts';
import { OPEN_PULL_REQUEST_COMMAND, openPullRequest, QUEUE_VIEW_ID, QueueView } from './shell/queueView.ts';
import {
	connectPlan,
	createIntervalReader,
	createQueueCheck,
	createScheduler,
	formatCheckTime,
	nextConnection,
	type Scheduler,
} from './shell/scheduler.ts';
import { createAlertingStore } from './shell/alertWiring.ts';
import type { Store } from './shell/store.ts';
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
	// Notifications run only after the store's write resolves, composed from the written state.
	// The button opens the PR through the same https://github.com/ guard as a row.
	const { store, focusDelivery } = createAlertingStore({
		memento: context.globalState,
		log,
		showMessage: (text, button) => vscode.window.showInformationMessage(text, button),
		openExternal: (uri) => vscode.env.openExternal(uri),
		isFocused: () => vscode.window.state.focused,
	});
	context.subscriptions.push(output, view);

	// Window memory only (never persisted): the connection (and so the active account), the
	// session generation, the number of checks in flight, a ticket per lookup so a slower, older
	// lookup cannot overwrite a newer one's connection state, and the latest silent lookup so a
	// check waits for its account. Interactive Connect lookups never gate a check (consent can
	// stay open forever).
	let connection: ConnectionState = { kind: 'unknown' };
	const generation = new SessionGeneration();
	let checking = 0;
	let latestTicket = 0;
	let latestSilentLookup: Promise<unknown> = Promise.resolve();
	/** The last attempt to save a check result failed; cleared by the next successful save. */
	let writeFailed = false;

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
			{ connection, readOnly: read.readOnly, checking: checking > 0, writeFailed },
			{ now, formatTime: (ms) => formatCheckTime(ms, now) },
		);
		return view.render(model);
	};
	const sub = store.onDidChange(() => void render());
	context.subscriptions.push({ dispose: () => sub.dispose() });

	/**
	 * Applies a check result from the current session generation. No session is `signed_out`; a
	 * 401 after the retry is `unauthenticated` and keeps the account active so its rows stay as
	 * stale; a success for that account while unauthenticated reconnects it. Reconcile drops other
	 * accounts' results (rule 1) and results older than the last applied complete check (rule 4).
	 */
	const applyResult = async (result: CheckResult | undefined): Promise<void> => {
		const next = nextConnection(connection, result, generation.current);
		if (next !== connection) {
			connection = next;
			log(copy.log.stateChanged(next.kind === 'unconnected' ? `unconnected (${next.reason})` : next.kind));
		}
		if (!result) {
			return;
		}
		try {
			await store.mutate(reconcile, result, {
				now: Date.now(),
				activeAccountId: activeAccountId(connection),
				intervalMs: getIntervalMs(),
				windowFocused: vscode.window.state.focused,
			});
			writeFailed = false;
		} catch (error) {
			// Shown in the view (stale or unavailable, with Refresh), not only logged.
			writeFailed = true;
			log(copy.log.stateWriteFailed(shortReason(error)));
		}
	};

	/** The scheduler's check, with the window's `checking` flag set around it. */
	const queueCheck = createQueueCheck({
		lookupsSettled: silentLookupsSettled,
		generation: () => generation.current,
		getToken: () => getToken(log),
		// fetchStartedAt is read before the first request of each attempt.
		fetchCheck: (token, accountId) => runCheck({ fetch: globalThis.fetch, token, accountId, fetchStartedAt: Date.now(), log }),
		apply: applyResult,
		log,
	});
	const runQueueCheck = async (): Promise<void> => {
		checking++;
		try {
			void render();
			await queueCheck();
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

	/**
	 * Applies a connection lookup and advances the session generation, so a check started before
	 * it is discarded. Resolves to the new state, or undefined when a newer lookup won or the
	 * lookup asked to keep the current state.
	 */
	const apply = (lookup: Promise<SessionLookup | undefined>, silent: boolean): Promise<ConnectionState | undefined> => {
		const ticket = ++latestTicket;
		const applied = (async () => {
			const found = await lookup;
			if (ticket !== latestTicket || !found) {
				return undefined;
			}
			const next = generation.next();
			const state: ConnectionState = found.kind === 'connected' ? { ...found, generation: next } : found;
			const previousAccountId = activeAccountId(connection);
			if (activeAccountId(state) !== previousAccountId) {
				// A save error belongs to the previous account; never show it for the new one.
				writeFailed = false;
			}
			connection = state;
			log(copy.log.stateChanged(state.kind === 'unconnected' ? `unconnected (${state.reason})` : state.kind));
			// Startup readiness (A1): a lookup that changes the active account (including the first
			// at activation) delivers that account's pending alerts in a focused window. Queued in the
			// store, so it never waits for a poll or a focus change.
			void focusDelivery.lookupApplied(previousAccountId, activeAccountId(state));
			await render();
			return state;
		})();
		if (silent) {
			latestSilentLookup = applied;
		}
		return applied;
	};

	/**
	 * Connect, or Reconnect while unauthenticated (a new session via `forceNewSession`). A cancelled
	 * Reconnect keeps the unauthenticated state and its stale rows.
	 */
	const connectOrReconnect = async (): Promise<void> => {
		const plan = connectPlan(connection);
		await apply(connect(log, { force: plan.force }).then(plan.map), false);
		// The sign-in fires onDidChangeSessions before connect() resolves, so a newer silent
		// lookup may win the ticket. Wait for it, then check whichever lookup won. The user is
		// waiting: a manual trigger skips jitter and cancels that event's jittered check.
		await silentLookupsSettled();
		if (connection.kind === 'connected') {
			await scheduler.trigger('manual');
		}
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
		vscode.commands.registerCommand('pulley.connect', connectOrReconnect),
		vscode.commands.registerCommand('pulley.reconnect', connectOrReconnect),
		vscode.commands.registerCommand('pulley.refresh', () => refresh()),
		onGitHubSessionsChanged(() => {
			void apply(lookupSilently(log), true).then((state) => (state ? scheduler.trigger('session-changed') : undefined));
		}),
		// Focus gating (AD-9): a focused window delivers whatever is still pending for its active
		// account. Before the first lookup settles there is no active account, so this is a no-op (B2).
		vscode.window.onDidChangeWindowState((state) => {
			if (state.focused) {
				void focusDelivery.focused(activeAccountId(connection));
			}
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
						windowFocused: vscode.window.state.focused,
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
