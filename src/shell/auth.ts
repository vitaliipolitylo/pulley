import * as vscode from 'vscode';
import { copy } from '../core/copy.ts';
import { shortReason, type ConnectionState } from '../core/connection.ts';

const PROVIDER_ID = 'github';
const SCOPES = ['repo'];

type Log = (line: string) => void;

/** The slice of `vscode.authentication.getSession` Pulley uses; injectable for tests. */
export type GetSession = (
	providerId: string,
	scopes: readonly string[],
	options: vscode.AuthenticationGetSessionOptions,
) => Thenable<vscode.AuthenticationSession | undefined>;

const defaultGetSession: GetSession = (providerId, scopes, options) =>
	vscode.authentication.getSession(providerId, scopes, options);

function fromSession(session: vscode.AuthenticationSession | undefined): ConnectionState {
	if (!session) {
		return { kind: 'unconnected' };
	}
	// Only the account identity is kept, in window memory. The token is never read here.
	return { kind: 'connected', accountId: session.account.id, label: session.account.label };
}

/** Silent lookup: never prompts, never throws. */
export async function lookupSilently(log: Log, getSession: GetSession = defaultGetSession): Promise<ConnectionState> {
	try {
		const session = await getSession(PROVIDER_ID, SCOPES, { silent: true });
		return fromSession(session);
	} catch (error) {
		log(copy.log.silentLookupFailed(shortReason(error)));
		return { kind: 'unconnected' };
	}
}

/** Explicit Connect: may show the VS Code GitHub consent. Never throws. */
export async function connect(log: Log, getSession: GetSession = defaultGetSession): Promise<ConnectionState> {
	log(copy.log.connectStarted);
	try {
		const session = await getSession(PROVIDER_ID, SCOPES, { createIfNone: true });
		return fromSession(session);
	} catch (error) {
		log(copy.log.connectFailed(shortReason(error)));
		return { kind: 'unconnected' };
	}
}

/** Calls `listener` whenever GitHub sessions change elsewhere. The event source is injectable for tests. */
export function onGitHubSessionsChanged(
	listener: () => void,
	onDidChangeSessions: vscode.Event<vscode.AuthenticationSessionsChangeEvent> = vscode.authentication.onDidChangeSessions,
): vscode.Disposable {
	return onDidChangeSessions((event) => {
		if (event.provider.id === PROVIDER_ID) {
			listener();
		}
	});
}
