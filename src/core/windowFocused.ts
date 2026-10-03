// Focus-gated alert delivery (AD-9). Pure: no clock reads, no I/O, never mutates its inputs.
import type { Account, Effect, Stored, Tracked, TransitionResult } from './types.ts';

export interface WindowFocusedCtx {
	/** The window's active account (window memory), if any. */
	activeAccountId: string | undefined;
}

/**
 * Delivers the alerts that are already pending on one account. When focused, every `pending`
 * item becomes `shown` in the returned account and one `notifyNew` is emitted per item, sorted by
 * id. When unfocused, or with nothing pending, returns the same account reference and no effects.
 * Never decides new alerts.
 */
export function deliverPending(
	accountId: string,
	account: Account,
	options: { focused: boolean },
): { account: Account; effects: Effect[] } {
	if (!options.focused) {
		return { account, effects: [] };
	}
	const pending = Object.keys(account.items)
		.filter((id) => account.items[id].alert === 'pending')
		.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
	if (pending.length === 0) {
		return { account, effects: [] };
	}
	const items: { [id: string]: Tracked } = { ...account.items };
	for (const id of pending) {
		items[id] = { ...items[id], alert: 'shown' };
	}
	return {
		account: { ...account, items },
		effects: pending.map((itemId) => ({ kind: 'notifyNew', accountId, itemId })),
	};
}

/**
 * Runs `deliverPending` on the window's active account. No active account, or one absent from
 * `stored`, or nothing to deliver returns the same `stored` and no effects.
 */
export function deliverToActive(stored: Stored, activeAccountId: string | undefined, focused: boolean): TransitionResult {
	const account = activeAccountId === undefined ? undefined : stored.accounts[activeAccountId];
	if (activeAccountId === undefined || account === undefined) {
		return { stored, effects: [] };
	}
	const delivered = deliverPending(activeAccountId, account, { focused });
	if (delivered.account === account) {
		return { stored, effects: [] };
	}
	return {
		stored: { ...stored, accounts: { ...stored.accounts, [activeAccountId]: delivered.account } },
		effects: delivered.effects,
	};
}

/**
 * The window gained focus: deliver whatever is still pending for the active account (rule 1 only
 * applies to that account). Returns the same `stored` when nothing is pending, so the store skips
 * the write.
 */
export function windowFocused(stored: Stored, _input: undefined, ctx: WindowFocusedCtx): TransitionResult {
	return deliverToActive(stored, ctx.activeAccountId, true);
}
