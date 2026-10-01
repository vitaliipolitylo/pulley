// Window-memory connection state (never persisted, AD-4) and diagnostics helpers.

export type ConnectionState =
	| { kind: 'unknown' }
	| { kind: 'unconnected' }
	| { kind: 'connected'; accountId: string; label: string };

export type ConnectionKind = ConnectionState['kind'];

/** Short, token-free reason for diagnostics. */
export function shortReason(error: unknown): string {
	const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown error';
	const oneLine = raw.replace(/\s+/g, ' ').trim() || 'unknown error';
	return oneLine.length > 120 ? `${oneLine.slice(0, 117)}...` : oneLine;
}
