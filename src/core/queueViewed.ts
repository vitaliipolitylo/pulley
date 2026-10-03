// The queue was viewed (AD-7, Story 2.3): ends the new signal. Pure: no clock reads, no I/O,
// never mutates its inputs, and never emits an effect.
import type { Stored, TransitionResult } from './types.ts';

export interface QueueViewedCtx {
	/** The window's active account (window memory), if any. Rule 1: only it is touched. */
	activeAccountId: string | undefined;
}

/**
 * Sets the active account's `newSignal` to false. Without an active account, with no partition
 * for it, or when the signal is already false, returns the same `stored` so the store skips the
 * write.
 */
export function queueViewed(stored: Stored, _input: undefined, ctx: QueueViewedCtx): TransitionResult {
	const id = ctx.activeAccountId;
	const account = id === undefined ? undefined : stored.accounts[id];
	if (id === undefined || account === undefined || !account.newSignal) {
		return { stored, effects: [] };
	}
	return {
		stored: { ...stored, accounts: { ...stored.accounts, [id]: { ...account, newSignal: false } } },
		effects: [],
	};
}
