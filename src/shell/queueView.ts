import * as vscode from 'vscode';
import { connectionPresentation, type ConnectionState } from '../core/connection.ts';
import { checkMessage, rowDescription, rowTooltip } from '../core/checkPresentation.ts';
import { copy } from '../core/copy.ts';
import type { CheckResult, RequestItem } from '../core/types.ts';

export const QUEUE_VIEW_ID = 'pulley.queue';
const CONNECTION_CONTEXT_KEY = 'pulley.connection';

/** Builds the plain, non-collapsible row for one request. */
export function toTreeItem(item: RequestItem): vscode.TreeItem {
	const treeItem = new vscode.TreeItem(item.title, vscode.TreeItemCollapsibleState.None);
	treeItem.id = item.id;
	treeItem.description = rowDescription(item);
	treeItem.tooltip = rowTooltip(item);
	treeItem.accessibilityInformation = { label: `${item.title}, ${rowDescription(item)}` };
	return treeItem;
}

/**
 * Window-memory rows (Story 1.2). Story 1.3 replaces this with store.mutate + viewModel.
 */
export class QueueTreeDataProvider implements vscode.TreeDataProvider<RequestItem> {
	private items: RequestItem[] = [];
	private readonly changed = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this.changed.event;

	setItems(items: RequestItem[]): void {
		this.items = items;
		this.changed.fire();
	}

	getItems(): readonly RequestItem[] {
		return this.items;
	}

	getTreeItem(element: RequestItem): vscode.TreeItem {
		return toTreeItem(element);
	}

	getChildren(element?: RequestItem): RequestItem[] {
		return element ? [] : this.items;
	}

	dispose(): void {
		this.changed.dispose();
	}
}

/** The parts of a TreeView that QueueView touches; injectable for tests. */
export type QueueTreeView = Pick<vscode.TreeView<RequestItem>, 'message' | 'dispose'>;
export type SetContext = (key: string, value: unknown) => Thenable<unknown>;

const defaultSetContext: SetContext = (key, value) => vscode.commands.executeCommand('setContext', key, value);

export class QueueView implements vscode.Disposable {
	private readonly treeView: QueueTreeView;
	private readonly setContext: SetContext;
	readonly provider: QueueTreeDataProvider;
	/** Account whose rows are currently shown; rows never carry over to another account. */
	private rowsAccountId: string | undefined;

	constructor(treeView?: QueueTreeView, setContext: SetContext = defaultSetContext) {
		this.provider = new QueueTreeDataProvider();
		this.treeView =
			treeView ?? vscode.window.createTreeView(QUEUE_VIEW_ID, { treeDataProvider: this.provider });
		this.setContext = setContext;
	}

	async render(state: ConnectionState): Promise<void> {
		const presentation = connectionPresentation(state);
		if (state.kind !== 'connected' || state.accountId !== this.rowsAccountId) {
			this.rowsAccountId = undefined;
			this.provider.setItems([]);
		}
		this.treeView.message = presentation.message;
		await this.setContext(CONNECTION_CONTEXT_KEY, presentation.contextKey);
	}

	/** A check is running. Rows from the same account stay; no zero is shown. */
	renderChecking(): void {
		this.treeView.message = copy.checking;
	}

	/**
	 * Shows a check result. A failure keeps the last rows for that account and
	 * never shows an empty or clear queue.
	 */
	renderCheck(result: CheckResult): void {
		if (result.ok) {
			this.rowsAccountId = result.accountId;
			this.provider.setItems(result.items);
		} else if (result.accountId !== this.rowsAccountId) {
			this.rowsAccountId = undefined;
			this.provider.setItems([]);
		}
		this.treeView.message = checkMessage(result);
	}

	dispose(): void {
		this.treeView.dispose();
		this.provider.dispose();
	}
}
