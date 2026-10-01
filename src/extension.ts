import * as vscode from 'vscode';
import { copy } from './core/copy.ts';
import type { ConnectionState } from './core/connection.ts';
import { connect, lookupSilently, onGitHubSessionsChanged } from './shell/auth.ts';
import { QueueView } from './shell/queueView.ts';

export function activate(context: vscode.ExtensionContext): void {
	const output = vscode.window.createOutputChannel(copy.outputChannelName);
	const log = (line: string): void => output.appendLine(`[${new Date().toISOString()}] ${line}`);
	const view = new QueueView();
	context.subscriptions.push(output, view);

	// Window memory only. Each lookup takes a ticket so a slower, older lookup
	// cannot overwrite the result of a newer one.
	let latestTicket = 0;
	const apply = async (lookup: Promise<ConnectionState>): Promise<void> => {
		const ticket = ++latestTicket;
		const state = await lookup;
		if (ticket !== latestTicket) {
			return;
		}
		log(copy.log.stateChanged(state.kind));
		await view.render(state);
	};

	void view.render({ kind: 'unknown' });

	context.subscriptions.push(
		vscode.commands.registerCommand('pulley.connect', () => apply(connect(log))),
		onGitHubSessionsChanged(() => void apply(lookupSilently(log))),
	);

	void apply(lookupSilently(log));
}

export function deactivate(): void {}
