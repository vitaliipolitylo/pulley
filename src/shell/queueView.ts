import { isDeepStrictEqual } from 'node:util';
import * as vscode from 'vscode';
import { shortReason } from '../core/connection.ts';
import { copy } from '../core/copy.ts';
import type { Row, ViewModel } from '../core/types.ts';

export const QUEUE_VIEW_ID = 'pulley.queue';
const CONNECTION_CONTEXT_KEY = 'pulley.connection';

export const OPEN_PULL_REQUEST_COMMAND = 'pulley.openPullRequest';
const GITHUB_PREFIX = 'https://github.com/';

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
 * The `pulley.openPullRequest` handler. Opens the row's PR only when its URL starts with
 * `https://github.com/`; anything else is logged and ignored. Changes no stored state.
 */
export async function openPullRequest(
	row: unknown,
	openExternal: (uri: vscode.Uri) => Thenable<boolean>,
	log: (line: string) => void,
): Promise<boolean> {
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

/** Rows come only from the view model (AD-12). */
export class QueueTreeDataProvider implements vscode.TreeDataProvider<Row> {
	private rows: Row[] = [];
	private readonly changed = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this.changed.event;

	setRows(rows: Row[]): void {
		this.rows = rows;
		this.changed.fire();
	}

	getTreeItem(element: Row): vscode.TreeItem {
		return toTreeItem(element);
	}

	getChildren(element?: Row): Row[] {
		return element ? [] : this.rows;
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

/** The parts of a TreeView that QueueView touches; injectable for tests. */
export type QueueTreeView = Pick<vscode.TreeView<Row>, 'message' | 'dispose'>;
export type SetContext = (key: string, value: unknown) => Thenable<unknown>;

const defaultSetContext: SetContext = (key, value) => vscode.commands.executeCommand('setContext', key, value);

export class QueueView implements vscode.Disposable {
	private readonly treeView: QueueTreeView;
	private readonly setContext: SetContext;
	readonly provider: QueueTreeDataProvider;
	private last: ViewModel | undefined;
	private contextKey: ConnectionContextKey | undefined;

	constructor(treeView?: QueueTreeView, setContext: SetContext = defaultSetContext) {
		this.provider = new QueueTreeDataProvider();
		this.treeView =
			treeView ?? vscode.window.createTreeView(QUEUE_VIEW_ID, { treeDataProvider: this.provider });
		this.setContext = setContext;
	}

	/**
	 * Renders a view model. An unchanged model does nothing (no tree refresh, no
	 * message reassignment that a screen reader could re-announce); the tree is
	 * refreshed only when the rows change.
	 */
	async render(model: ViewModel): Promise<void> {
		const previous = this.last;
		if (previous && isDeepStrictEqual(previous, model)) {
			return;
		}
		this.last = model;
		if (!previous || !isDeepStrictEqual(previous.rows, model.rows)) {
			this.provider.setRows(model.rows);
		}
		if (!previous || previous.message !== model.message) {
			this.treeView.message = model.message;
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
