// Focus-gated alert delivery (AD-9). Pure: no clock reads, no I/O, never mutates its inputs.
import type { Account, Effect, Stored, Tracked, TransitionResult } from './types.ts';

export interface WindowFocusedCtx {
	/** The window's active account (window memory), if any. */
	activeAccountId: string | undefined;
	/** Local `YYYY-MM-DD`, computed in the shell: the delivery day of a backlog reminder (A4). */
	today: string;
}

export interface DeliverOptions {
	focused: boolean;
	/** Local `YYYY-MM-DD`: a delivered backlog reminder records it as `lastBacklogReminderDate`. */
	today: string;
}

/**
 * Delivers the alerts that are already pending on one account. Never decides new alerts.
 *
 * - When focused, every `pending` item becomes `shown` and one `notifyNew` is emitted per item,
 *   sorted by id.
 * - A pending backlog reminder with items, when focused, becomes `shown` (keeping
 *   `firstConnection`), records the delivery day, and emits one `notifyBacklog` with the item count.
 * - A pending backlog reminder with zero items becomes `'none'` with no effect, focused or not; its
 *   decision day stays recorded.
 * - Otherwise (unfocused, or nothing pending) returns the same account reference and no effects.
 */
export function deliverPending(accountId: string, account: Account, options: DeliverOptions): { account: Account; effects: Effect[] } {
	let next = account;
	const effects: Effect[] = [];
	const count = Object.keys(account.items).length;
	const backlog = account.backlogAlert;
	const backlogPending = backlog !== 'none' && backlog.state === 'pending';

	if (backlogPending && count === 0) {
		// Emptied before delivery: nothing is waiting. The decision day uses up that day (accepted).
		next = { ...next, backlogAlert: 'none' };
	}
	if (!options.focused) {
		return { account: next, effects };
	}

	if (backlogPending && count > 0) {
		next = { ...next, backlogAlert: { state: 'shown', firstConnection: backlog.firstConnection }, lastBacklogReminderDate: options.today };
		effects.push({ kind: 'notifyBacklog', accountId, count, firstConnection: backlog.firstConnection });
	}

	const pending = Object.keys(account.items)
		.filter((id) => account.items[id].alert === 'pending')
		.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
	if (pending.length > 0) {
		const items: { [id: string]: Tracked } = { ...account.items };
		for (const id of pending) {
			items[id] = { ...items[id], alert: 'shown' };
		}
		next = { ...next, items };
		for (const itemId of pending) {
			effects.push({ kind: 'notifyNew', accountId, itemId });
		}
	}
	return { account: next, effects };
}

/**
 * Runs `deliverPending` on the window's active account. No active account, or one absent from
 * `stored`, or nothing to deliver returns the same `stored` and no effects.
 */
export function deliverToActive(stored: Stored, activeAccountId: string | undefined, options: DeliverOptions): TransitionResult {
	const account = activeAccountId === undefined ? undefined : stored.accounts[activeAccountId];
	if (activeAccountId === undefined || account === undefined) {
		return { stored, effects: [] };
	}
	const delivered = deliverPending(activeAccountId, account, options);
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
	return deliverToActive(stored, ctx.activeAccountId, { focused: true, today: ctx.today });
}
