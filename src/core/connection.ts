import { copy } from './copy.ts';

export type ConnectionState =
	| { kind: 'unknown' }
	| { kind: 'unconnected' }
	| { kind: 'connected'; accountId: string; label: string };

export type ConnectionKind = ConnectionState['kind'];

/** Plain-language description of the connection state. */
export function connectionMessage(state: ConnectionState): string {
	switch (state.kind) {
		case 'unknown':
			return copy.checkingConnection;
		case 'unconnected':
			return copy.unconnectedExplanation;
		case 'connected':
			return copy.connected(state.label);
	}
}

export interface ConnectionPresentation {
	/** Value for the `pulley.connection` context key. */
	contextKey: ConnectionKind;
	/**
	 * TreeView.message. Undefined while unconnected, where the native
	 * viewsWelcome content (with its Connect button) carries the explanation.
	 */
	message: string | undefined;
}

export function connectionPresentation(state: ConnectionState): ConnectionPresentation {
	return {
		contextKey: state.kind,
		message: state.kind === 'unconnected' ? undefined : connectionMessage(state),
	};
}

/** Short, token-free reason for diagnostics. */
export function shortReason(error: unknown): string {
	const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown error';
	const oneLine = raw.replace(/\s+/g, ' ').trim() || 'unknown error';
	return oneLine.length > 120 ? `${oneLine.slice(0, 117)}...` : oneLine;
}
