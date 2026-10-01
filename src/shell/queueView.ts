import * as vscode from 'vscode';
import { connectionPresentation, type ConnectionState } from '../core/connection.ts';

export const QUEUE_VIEW_ID = 'pulley.queue';
const CONNECTION_CONTEXT_KEY = 'pulley.connection';

/** Empty for now; Story 1.2 fills the queue rows. */
class QueueTreeDataProvider implements vscode.TreeDataProvider<never> {
	getTreeItem(element: never): vscode.TreeItem {
		return element;
	}

	getChildren(): never[] {
		return [];
	}
}

/** The parts of a TreeView that QueueView touches; injectable for tests. */
export type QueueTreeView = Pick<vscode.TreeView<never>, 'message' | 'dispose'>;
export type SetContext = (key: string, value: unknown) => Thenable<unknown>;

const defaultSetContext: SetContext = (key, value) => vscode.commands.executeCommand('setContext', key, value);

export class QueueView implements vscode.Disposable {
	private readonly treeView: QueueTreeView;
	private readonly setContext: SetContext;

	constructor(treeView?: QueueTreeView, setContext: SetContext = defaultSetContext) {
		this.treeView =
			treeView ?? vscode.window.createTreeView(QUEUE_VIEW_ID, { treeDataProvider: new QueueTreeDataProvider() });
		this.setContext = setContext;
	}

	async render(state: ConnectionState): Promise<void> {
		const presentation = connectionPresentation(state);
		this.treeView.message = presentation.message;
		await this.setContext(CONNECTION_CONTEXT_KEY, presentation.contextKey);
	}

	dispose(): void {
		this.treeView.dispose();
	}
}
