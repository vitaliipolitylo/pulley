import * as vscode from 'vscode';
import { copy } from '../core/copy.ts';
import { shortReason, type SessionLookup } from '../core/connection.ts';

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

const SIGNED_OUT: SessionLookup = { kind: 'unconnected', reason: 'signed_out' };

function fromSession(session: vscode.AuthenticationSession | undefined): SessionLookup {
	if (!session) {
		return SIGNED_OUT;
	}
	// Only the account identity is kept, in window memory. The token is never read here.
	return { kind: 'connected', accountId: session.account.id, label: session.account.label };
}

/** Silent lookup: never prompts, never throws. No session is `signed_out`. */
export async function lookupSilently(log: Log, getSession: GetSession = defaultGetSession): Promise<SessionLookup> {
	try {
		const session = await getSession(PROVIDER_ID, SCOPES, { silent: true });
		return fromSession(session);
	} catch (error) {
		log(copy.log.silentLookupFailed(shortReason(error)));
		return SIGNED_OUT;
	}
}

/**
 * Fresh silent lookup for one check. The token is returned to the caller for
 * that check only; it is never stored or logged. Never prompts, never throws.
 */
export async function getToken(
	log: Log,
	getSession: GetSession = defaultGetSession,
): Promise<{ accountId: string; token: string } | undefined> {
	try {
		const session = await getSession(PROVIDER_ID, SCOPES, { silent: true });
		return session ? { accountId: session.account.id, token: session.accessToken } : undefined;
	} catch (error) {
		log(copy.log.silentLookupFailed(shortReason(error)));
		return undefined;
	}
}

export interface ConnectOptions {
	/**
	 * Reconnect: the current session is rejected by GitHub (401 after retry), so ask VS Code for a
	 * new one with `forceNewSession` instead of `createIfNone`, which would return the same session.
	 */
	force?: boolean;
	getSession?: GetSession;
}

/**
 * Explicit Connect or Reconnect: may show the VS Code GitHub consent. Never throws.
 * Resolves to `signed_out` when the sign-in was cancelled or failed.
 */
export async function connect(log: Log, options: ConnectOptions = {}): Promise<SessionLookup> {
	const getSession = options.getSession ?? defaultGetSession;
	log(copy.log.connectStarted);
	try {
		const session = await getSession(
			PROVIDER_ID,
			SCOPES,
			options.force ? { forceNewSession: { detail: copy.reconnectDetail } } : { createIfNone: true },
		);
		return fromSession(session);
	} catch (error) {
		log(copy.log.connectFailed(shortReason(error)));
		return SIGNED_OUT;
	}
}

/**
 * The per-window session generation (AD-11). It advances whenever a lookup changes the window's
 * connection; a check captures it at start and discards its result if it moved.
 */
export class SessionGeneration {
	private value = 0;

	get current(): number {
		return this.value;
	}

	next(): number {
		return ++this.value;
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
