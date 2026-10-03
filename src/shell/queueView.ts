import { isDeepStrictEqual } from 'node:util';
import * as vscode from 'vscode';
import { shortReason } from '../core/connection.ts';
import { copy } from '../core/copy.ts';
import { queueViewed } from '../core/queueViewed.ts';
import type { Mascot, Row, ViewModel } from '../core/types.ts';
import type { Store } from './store.ts';

export const QUEUE_VIEW_ID = 'pulley.queue';
const CONNECTION_CONTEXT_KEY = 'pulley.connection';

export const OPEN_PULL_REQUEST_COMMAND = 'pulley.openPullRequest';
const GITHUB_PREFIX = 'https://github.com/';

/** The corgi status row's tree item id (Story 2.3). */
export const STATUS_ROW_ID = 'pulley.status';

/** The non-clickable first tree item: the corgi pose with its word equivalent. */
export interface StatusRow {
	kind: 'status';
	mascot: Mascot;
	text: string;
}

/** One element of the queue tree: the corgi status row or a request row. */
export type QueueElement = StatusRow | Row;

function isStatusRow(element: unknown): element is StatusRow {
	return typeof element === 'object' && element !== null && (element as { kind?: unknown }).kind === 'status';
}

/**
 * The status row for a model: present whenever the view has rows or the corgi is resting (clear).
 * With stale rows the model's mascot is already `unknown`. Absent for `unknown` with no rows, where
 * the message or welcome content explains.
 */
export function statusRowFor(model: ViewModel): StatusRow | undefined {
	return model.rows.length > 0 || model.mascot === 'clear' ? { kind: 'status', mascot: model.mascot, text: model.mascotText } : undefined;
}

/**
 * Builds the plain, non-collapsible tree item for one view-model row. `id` is the PR
 * node id so focus and selection survive re-renders; the native ThemeIcon and default
 * colors inherit the theme, focus, and high contrast. Activation (click or Enter) runs
 * `pulley.openPullRequest` with the row.
 */
export function toTreeItem(row: Row): vscode.TreeItem {
	const treeItem = new vscode.TreeItem(row.label, vscode.TreeItemCollapsibleState.None);
	treeItem.id = row.id;
	treeItem.description = row.description;
	// Text only: appendText escapes Markdown, and the string is untrusted with no links added.
	treeItem.tooltip = new vscode.MarkdownString().appendText(row.tooltip);
	treeItem.accessibilityInformation = { label: row.accessibleLabel };
	treeItem.iconPath = new vscode.ThemeIcon('git-pull-request');
	treeItem.command = { command: OPEN_PULL_REQUEST_COMMAND, title: copy.openPullRequestCommandTitle, arguments: [row] };
	return treeItem;
}

/**
 * The corgi status row: `media/corgi/{mascot}.svg` with `mascotText` as its label and accessible
 * text, so the pose never stands alone. No command: it is not clickable.
 */
export function toStatusTreeItem(status: StatusRow, extensionUri: vscode.Uri): vscode.TreeItem {
	const treeItem = new vscode.TreeItem(status.text, vscode.TreeItemCollapsibleState.None);
	treeItem.id = STATUS_ROW_ID;
	treeItem.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'corgi', `${status.mascot}.svg`);
	treeItem.accessibilityInformation = { label: status.text };
	return treeItem;
}

/**
 * The `pulley.openPullRequest` handler. Opens the row's PR only when its URL starts with
 * `https://github.com/`; anything else is logged and ignored. The corgi status row is ignored
 * silently. Changes no stored state.
 */
export async function openPullRequest(
	row: unknown,
	openExternal: (uri: vscode.Uri) => Thenable<boolean>,
	log: (line: string) => void,
): Promise<boolean> {
	if (isStatusRow(row)) {
		return false;
	}
	const url = typeof row === 'object' && row !== null ? (row as { url?: unknown }).url : undefined;
	if (typeof url !== 'string' || !url.startsWith(GITHUB_PREFIX)) {
		log(copy.log.openIgnored(typeof url === 'string' ? shortReason(url) : `no URL (${typeof url})`));
		return false;
	}
	try {
		return await openExternal(vscode.Uri.parse(url));
	} catch (error) {
		log(copy.log.openFailed(shortReason(error)));
		return false;
	}
}

/** Rows come only from the view model (AD-12); the status row, when present, is first. */
export class QueueTreeDataProvider implements vscode.TreeDataProvider<QueueElement> {
	private elements: QueueElement[] = [];
	private readonly changed = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this.changed.event;
	private readonly extensionUri: vscode.Uri;

	constructor(extensionUri: vscode.Uri) {
		this.extensionUri = extensionUri;
	}

	setRows(rows: Row[], status?: StatusRow): void {
		this.elements = status ? [status, ...rows] : rows;
		this.changed.fire();
	}

	getTreeItem(element: QueueElement): vscode.TreeItem {
		return isStatusRow(element) ? toStatusTreeItem(element, this.extensionUri) : toTreeItem(element);
	}

	getChildren(element?: QueueElement): QueueElement[] {
		return element ? [] : this.elements;
	}

	dispose(): void {
		this.changed.dispose();
	}
}

/**
 * The `pulley.connection` context key value. It gates the Connect and Reconnect welcome content,
 * the Reconnect title action (`unauthenticated`), and Refresh (`connected`).
 */
export type ConnectionContextKey = 'unconnected' | 'unauthenticated' | 'connected';

export function connectionContextKey(model: ViewModel): ConnectionContextKey {
	if (model.status !== 'unconnected') {
		return 'connected';
	}
	return model.reason === 'unauthenticated' ? 'unauthenticated' : 'unconnected';
}

/** The parts of a TreeView that the shell touches; injectable for tests. */
export type QueueTreeView = Pick<
	vscode.TreeView<QueueElement>,
	'message' | 'description' | 'badge' | 'visible' | 'onDidChangeVisibility' | 'dispose'
>;
export type SetContext = (key: string, value: unknown) => Thenable<unknown>;

const defaultSetContext: SetContext = (key, value) => vscode.commands.executeCommand('setContext', key, value);

export class QueueView implements vscode.Disposable {
	readonly treeView: QueueTreeView;
	private readonly setContext: SetContext;
	readonly provider: QueueTreeDataProvider;
	private last: ViewModel | undefined;
	private contextKey: ConnectionContextKey | undefined;

	constructor(extensionUri: vscode.Uri, treeView?: QueueTreeView, setContext: SetContext = defaultSetContext) {
		this.provider = new QueueTreeDataProvider(extensionUri);
		this.treeView =
			treeView ?? vscode.window.createTreeView(QUEUE_VIEW_ID, { treeDataProvider: this.provider });
		this.setContext = setContext;
	}

	/**
	 * Renders a view model. An unchanged model does nothing (no tree refresh, no
	 * message reassignment that a screen reader could re-announce); the tree is
	 * refreshed only when the rows or the status row (presence, label, or icon) change (A9).
	 */
	async render(model: ViewModel): Promise<void> {
		const previous = this.last;
		if (previous && isDeepStrictEqual(previous, model)) {
			return;
		}
		this.last = model;
		const status = statusRowFor(model);
		if (!previous || !isDeepStrictEqual(previous.rows, model.rows) || !isDeepStrictEqual(statusRowFor(previous), status)) {
			this.provider.setRows(model.rows, status);
		}
		if (!previous || previous.message !== model.message) {
			this.treeView.message = model.message;
		}
		// The check time lives in the view header, not the message, so a poll that only moves
		// the time never re-sets the message.
		if (!previous || previous.lastChecked !== model.lastChecked) {
			this.treeView.description = model.lastChecked;
		}
		const key = connectionContextKey(model);
		if (key !== this.contextKey) {
			this.contextKey = key;
			await this.setContext(CONNECTION_CONTEXT_KEY, key);
		}
	}

	dispose(): void {
		this.treeView.dispose();
		this.provider.dispose();
	}
}

export interface QueueViewedDeps {
	/** `treeView.visible`, read per call. */
	isVisible(): boolean;
	/** `vscode.window.state.focused`, read per call. */
	isFocused(): boolean;
	/**
	 * A fresh store read of the active account's `newSignal`: `undefined` when the store is
	 * read-only (X5) or there is no active account partition.
	 */
	newSignal(): boolean | undefined;
	/** Runs `store.mutate(queueViewed, undefined, { activeAccountId })`. */
	run(): Promise<unknown>;
	log(line: string): void;
}

export interface QueueViewedSync {
	/**
	 * The view became visible, or a focused window has it visible (B5): mark the queue viewed when
	 * the active account's `newSignal` is set.
	 */
	viewed(): Promise<void>;
	/**
	 * A connection lookup was applied (including the first at activation, A1). When it changed the
	 * active account and the view is visible, mark the queue viewed.
	 */
	lookupApplied(previousAccountId: string | undefined, nextAccountId: string | undefined): Promise<void>;
	/**
	 * After each render (A9, E5, B5): when the view is visible, the window focused, and the active
	 * account's `newSignal` set (never in read-only mode, X5), mark the queue viewed. At most one
	 * such call is in flight; when it succeeds, the condition is checked again so a render that
	 * arrived meanwhile isn't dropped. A failed call is logged and waits for the next render.
	 */
	afterRender(): void;
}

/** Runs the `queueViewed` transition from visibility, lookups, focus, and renders (Story 2.3). */
export function createQueueViewedSync(deps: QueueViewedDeps): QueueViewedSync {
	let inFlight = false;

	const run = async (): Promise<boolean> => {
		try {
			await deps.run();
			return true;
		} catch (error) {
			deps.log(copy.log.queueViewedFailed(shortReason(error)));
			return false;
		}
	};

	// Only when there is a signal to end: no mutate (and so no re-render) in read-only mode (X5) or
	// when `newSignal` is already false.
	const viewed = async (): Promise<void> => {
		if (deps.isVisible() && deps.newSignal() === true) {
			await run();
		}
	};

	const afterRender = (): void => {
		if (inFlight || !deps.isVisible() || !deps.isFocused() || deps.newSignal() !== true) {
			return;
		}
		inFlight = true;
		void run().then((ok) => {
			inFlight = false;
			if (ok) {
				afterRender();
			}
		});
	};

	return {
		viewed,
		lookupApplied: async (previousAccountId, nextAccountId) => {
			if (nextAccountId !== undefined && nextAccountId !== previousAccountId) {
				await viewed();
			}
		},
		afterRender,
	};
}

export interface QueueViewedWiringDeps {
	store: Pick<Store, 'read' | 'mutate'>;
	/** The queue's tree view: `visible` is read per call; visibility events run `queueViewed`. */
	treeView: Pick<QueueTreeView, 'visible' | 'onDidChangeVisibility'>;
	/** `vscode.window.onDidChangeWindowState`: gaining focus with the view visible runs `queueViewed` (B5). */
	onDidChangeWindowState: vscode.Event<{ focused: boolean }>;
	/** `vscode.window.state.focused`, read per call. */
	isFocused(): boolean;
	/** The window's active account (window memory), read per call. */
	getActiveAccountId(): string | undefined;
	log(line: string): void;
}

export interface QueueViewedWiring {
	/** Call after every render (A9, E5, B5). */
	afterRender(): void;
	/** Call after every applied connection lookup, including the first (A1). */
	lookupApplied(previousAccountId: string | undefined, nextAccountId: string | undefined): Promise<void>;
	dispose(): void;
}

/**
 * The window's `queueViewed` composition (Story 2.3), as `extension.ts` uses it: the transition
 * through the store, gated on the tree view's visibility, window focus, and the active account's
 * `newSignal`. Subscribes to the visibility and window-focus events itself.
 */
export function createQueueViewedWiring(deps: QueueViewedWiringDeps): QueueViewedWiring {
	const sync = createQueueViewedSync({
		isVisible: () => deps.treeView.visible,
		isFocused: deps.isFocused,
		newSignal: () => {
			const read = deps.store.read();
			const accountId = deps.getActiveAccountId();
			return read.readOnly || accountId === undefined ? undefined : read.stored.accounts[accountId]?.newSignal;
		},
		run: () => deps.store.mutate(queueViewed, undefined, { activeAccountId: deps.getActiveAccountId() }),
		log: deps.log,
	});
	const subscriptions = [
		deps.treeView.onDidChangeVisibility((event) => {
			if (event.visible) {
				void sync.viewed();
			}
		}),
		deps.onDidChangeWindowState((state) => {
			if (state.focused) {
				void sync.viewed();
			}
		}),
	];
	return {
		afterRender: sync.afterRender,
		lookupApplied: sync.lookupApplied,
		dispose: () => {
			for (const subscription of subscriptions) {
				subscription.dispose();
			}
		},
	};
}
