// The first view model (AD-12): everything the queue view shows, derived from stored
// state plus window memory. Pure: no clock reads, never mutates its inputs.
import type { ConnectionState } from './connection.ts';
import { copy } from './copy.ts';
import type { Row, Stored, Tracked, ViewModel } from './types.ts';

/** Window memory the view model needs (never persisted). */
export interface WindowView {
	connection: ConnectionState;
	/** Stored data is from a newer Pulley (AD-3). */
	readOnly: boolean;
	/** A check is in flight in this window. */
	checking: boolean;
}

export interface ViewModelCtx {
	/** Epoch ms. Reserved for age strings (Story 1.4). */
	now: number;
}

/** Row description: `owner/name#number · author` (1.2 format). */
function rowDescription(item: Tracked): string {
	return `${item.repo}#${item.number} · ${item.author}`;
}

function toRow(item: Tracked): Row {
	const description = rowDescription(item);
	return {
		id: item.id,
		label: item.title,
		description,
		tooltip: `${item.title}\n${description}`,
		accessibleLabel: `${item.title}, ${description}`,
		url: item.url,
	};
}

/** Oldest first by `requestedAt ?? firstSeenAt`; ties by id. */
function byAge(a: Tracked, b: Tracked): number {
	const ka = a.requestedAt ?? a.firstSeenAt;
	const kb = b.requestedAt ?? b.firstSeenAt;
	if (ka !== kb) {
		return ka - kb;
	}
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function viewModel(stored: Stored | undefined, window: WindowView, _ctx: ViewModelCtx): ViewModel {
	if (window.readOnly || !stored) {
		return { status: 'readOnly', count: null, message: copy.updatePulley, rows: [] };
	}
	const connection = window.connection;
	if (connection.kind === 'unconnected') {
		// The native viewsWelcome content (with Connect) carries the explanation.
		return { status: 'unconnected', count: null, rows: [] };
	}
	if (connection.kind === 'unknown') {
		// The startup lookup is in flight; no account partition is known yet.
		return { status: 'loading', count: null, message: copy.checkingConnection, rows: [] };
	}

	const account = stored.accounts[connection.accountId];
	if (!account) {
		return { status: 'loading', count: null, message: copy.checking, rows: [] };
	}

	const rows = Object.values(account.items).sort(byAge).map(toRow);
	const n = rows.length;
	const count = account.lastSuccessAt === undefined ? null : n;

	if (account.lastFailure && account.lastFailure.at > (account.lastSuccessAt ?? 0)) {
		return { status: 'stale', count, message: n > 0 ? copy.stale : copy.failed, rows };
	}
	if (n > 0) {
		// Rows from incomplete checks only, or a newer incomplete check than the last complete one,
		// carry the "may be incomplete" hint.
		const incomplete =
			count === null ||
			(account.lastIncompleteFetchStartedAt !== undefined &&
				account.lastIncompleteFetchStartedAt > (account.lastSuccessAt ?? -Infinity));
		const message = incomplete ? `${copy.pending(n)} ${copy.incomplete}` : copy.pending(n);
		return { status: 'pending', count, message, rows };
	}
	if (account.lastSuccessAt !== undefined) {
		return { status: 'clear', count, message: copy.clear, rows };
	}
	// Only incomplete successes that returned nothing (or none yet): never show a zero.
	const message = account.firstCheckDone && !window.checking ? copy.incomplete : copy.checking;
	return { status: 'loading', count, message, rows };
}
