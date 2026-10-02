// Window-memory connection state (never persisted, AD-4) and diagnostics helpers.

/**
 * Why the window is unconnected (AD-11). `signed_out`: the silent lookup returned no session.
 * `unauthenticated`: GitHub returned 401 again after one silent re-lookup and retry.
 */
export type UnconnectedReason = 'signed_out' | 'unauthenticated';

export type ConnectionState =
	| { kind: 'unknown' }
	| { kind: 'unconnected'; reason: 'signed_out' }
	| {
			kind: 'unconnected';
			reason: 'unauthenticated';
			/** The account stays active, so its stored rows remain visible as stale. */
			accountId?: string;
			label?: string;
	  }
	| {
			kind: 'connected';
			accountId: string;
			label: string;
			/** Per-window session generation; results from an older generation are discarded. */
			generation: number;
	  };

export type ConnectionKind = ConnectionState['kind'];

/** What a GitHub session lookup reports, before the shell stamps a session generation. */
export type SessionLookup = { kind: 'connected'; accountId: string; label: string } | { kind: 'unconnected'; reason: 'signed_out' };

/** The account whose partition the window shows and reconciles into, if any. */
export function activeAccountId(connection: ConnectionState): string | undefined {
	return connection.kind === 'connected' || (connection.kind === 'unconnected' && connection.reason === 'unauthenticated')
		? connection.accountId
		: undefined;
}

/** Short, token-free reason for diagnostics. */
export function shortReason(error: unknown): string {
	const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown error';
	const oneLine = raw.replace(/\s+/g, ' ').trim() || 'unknown error';
	return oneLine.length > 120 ? `${oneLine.slice(0, 117)}...` : oneLine;
}
