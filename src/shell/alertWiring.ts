// The window's alert composition (Story 2.1): the store with the notifier as its effect runner,
// focus delivery over that store, and the notification button opening PRs through the same
// `openPullRequest` guard as a row. `extension.ts` calls this; smoke tests call the same factory.
// VS Code APIs are injected, so this module never calls them directly.
import type * as vscode from 'vscode';
import { createFocusDelivery, createNotifier, type FocusDelivery, type NotifierDeps } from './notifier.ts';
import { openPullRequest } from './queueView.ts';
import { createStore, type StateMemento, type Store } from './store.ts';

export interface AlertingStoreDeps {
	memento: StateMemento;
	log: (line: string) => void;
	/** `vscode.window.showInformationMessage`. */
	showMessage: NotifierDeps['showMessage'];
	/** `vscode.env.openExternal`, behind the https://github.com/ guard. */
	openExternal: (uri: vscode.Uri) => Thenable<boolean>;
	/** `vscode.window.state.focused`, read per call. */
	isFocused: () => boolean;
	/** Reveals the review queue: `vscode.commands.executeCommand('pulley.queue.focus')`. */
	focusQueue: () => unknown;
	/** The local `YYYY-MM-DD` now (`localDate(Date.now())`), read per call. */
	today: () => string;
}

export function createAlertingStore(deps: AlertingStoreDeps): { store: Store; focusDelivery: FocusDelivery } {
	const notifier = createNotifier({
		showMessage: deps.showMessage,
		openUrl: (url) => openPullRequest({ url }, deps.openExternal, deps.log),
		focusQueue: deps.focusQueue,
		today: deps.today,
		log: deps.log,
	});
	const store = createStore(deps.memento, deps.log, notifier);
	const focusDelivery = createFocusDelivery({ store, isFocused: deps.isFocused, today: deps.today, log: deps.log });
	return { store, focusDelivery };
}
