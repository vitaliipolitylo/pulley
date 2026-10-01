import { isDeepStrictEqual } from 'node:util';
import * as vscode from 'vscode';
import type { Row, ViewModel } from '../core/types.ts';

export const QUEUE_VIEW_ID = 'pulley.queue';
const CONNECTION_CONTEXT_KEY = 'pulley.connection';

/** Builds the plain, non-collapsible tree item for one view-model row. */
export function toTreeItem(row: Row): vscode.TreeItem {
	const treeItem = new vscode.TreeItem(row.label, vscode.TreeItemCollapsibleState.None);
	treeItem.id = row.id;
	treeItem.description = row.description;
	treeItem.tooltip = row.tooltip;
	treeItem.accessibilityInformation = { label: row.accessibleLabel };
	return treeItem;
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

/** The parts of a TreeView that QueueView touches; injectable for tests. */
export type QueueTreeView = Pick<vscode.TreeView<Row>, 'message' | 'dispose'>;
export type SetContext = (key: string, value: unknown) => Thenable<unknown>;

const defaultSetContext: SetContext = (key, value) => vscode.commands.executeCommand('setContext', key, value);

export class QueueView implements vscode.Disposable {
	private readonly treeView: QueueTreeView;
	private readonly setContext: SetContext;
	readonly provider: QueueTreeDataProvider;
	private last: ViewModel | undefined;
	private contextKey: 'unconnected' | 'connected' | undefined;

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
		// The key only gates the `== unconnected` welcome content.
		const key = model.status === 'unconnected' ? 'unconnected' : 'connected';
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
