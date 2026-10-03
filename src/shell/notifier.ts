// Native notifications for alert effects (AD-9). No `vscode` import: the message API, URL opener,
// queue reveal, clock, and log are injected. The notifier never decides whether to notify; it runs
// the effects that a core transition emitted after the store wrote them.
import { shortReason } from '../core/connection.ts';
import { copy } from '../core/copy.ts';
import type { Effect, Stored, Tracked } from '../core/types.ts';
import { windowFocused } from '../core/windowFocused.ts';
import type { EffectRunner, Store } from './store.ts';

export interface NotifierDeps {
	/**
	 * Shows a native message with one button, e.g. `vscode.window.showInformationMessage`. The
	 * returned thenable resolves only when the message is dismissed or the button is pressed.
	 */
	showMessage(text: string, button: string): PromiseLike<string | undefined>;
	/** Opens a PR URL (the shell passes `openPullRequest`, which keeps the https://github.com/ guard). */
	openUrl(url: string): unknown;
	/** Reveals the review queue (`pulley.queue.focus`): the backlog notification's button. */
	focusQueue(): unknown;
	/** The local `YYYY-MM-DD` when the effect runs: picks the backlog line. */
	today(): string;
	log(line: string): void;
}

/** `owner/name#number`: the only item detail a log line may carry. */
function itemRef(item: Tracked): string {
	return `${item.repo}#${item.number}`;
}

/**
 * Returns the store's effect runner. Items resolve from `stored.accounts[effect.accountId]` (the
 * state just written), never from the current active account. Submission is at-most-once: a sync
 * throw or async rejection of `showMessage` is logged and the alert stays consumed. The message
 * promise is never awaited, because it resolves only on dismissal.
 */
export function createNotifier(deps: NotifierDeps): EffectRunner {
	const notifyNew = (effect: Extract<Effect, { kind: 'notifyNew' }>, stored: Stored): void => {
		const item = stored.accounts[effect.accountId]?.items[effect.itemId];
		if (item === undefined) {
			deps.log(copy.log.notifyItemMissing(effect.accountId, effect.itemId));
			return;
		}
		const ref = itemRef(item);
		const button = copy.openPullRequestCommandTitle;
		let shown: PromiseLike<string | undefined>;
		try {
			shown = deps.showMessage(copy.newRequestNotification(item), button);
		} catch {
			deps.log(copy.log.notifyFailed(ref));
			return;
		}
		deps.log(copy.log.notifiedNew(ref));
		const url = item.url;
		Promise.resolve(shown).then(
			(choice) => {
				// Dismissal (undefined) changes nothing; the button opens the item's exact URL.
				if (choice === button) {
					Promise.resolve()
						.then(() => deps.openUrl(url))
						.catch((error: unknown) => deps.log(copy.log.openFailed(shortReason(error))));
				}
			},
			() => deps.log(copy.log.notifyFailed(ref)),
		);
	};

	const notifyBacklog = (effect: Extract<Effect, { kind: 'notifyBacklog' }>): void => {
		// Logs carry the count only (A7).
		const subject = copy.log.backlogSubject(effect.count);
		const button = copy.openReviewQueue;
		let shown: PromiseLike<string | undefined>;
		try {
			shown = deps.showMessage(copy.backlogNotification(effect.count, deps.today()), button);
		} catch {
			deps.log(copy.log.notifyFailed(subject));
			return;
		}
		deps.log(copy.log.notifiedBacklog(effect.count));
		Promise.resolve(shown).then(
			(choice) => {
				// Dismissal (undefined) changes nothing; the button reveals the queue.
				if (choice === button) {
					Promise.resolve()
						.then(() => deps.focusQueue())
						.catch((error: unknown) => deps.log(copy.log.focusQueueFailed(shortReason(error))));
				}
			},
			() => deps.log(copy.log.notifyFailed(subject)),
		);
	};

	return (effects, stored) => {
		for (const effect of effects) {
			try {
				if (effect.kind === 'notifyNew') {
					notifyNew(effect, stored);
				} else if (effect.kind === 'notifyBacklog') {
					notifyBacklog(effect);
				} else {
					const unknown: never = effect;
					throw new Error(`unknown effect ${(unknown as Effect).kind}`);
				}
			} catch (error) {
				// Never let one effect stop the rest, and never reject the runner.
				deps.log(copy.log.effectsFailed(shortReason(error)));
			}
		}
	};
}

export interface FocusDeliveryDeps {
	store: Pick<Store, 'mutate'>;
	isFocused(): boolean;
	/** The local `YYYY-MM-DD` when delivery runs: a delivered backlog reminder records it (A4). */
	today(): string;
	log(line: string): void;
}

export interface FocusDelivery {
	/** The window gained focus: deliver the active account's pending alerts. */
	focused(activeAccountId: string | undefined): Promise<void>;
	/**
	 * A connection lookup was applied (including the first at activation). When it changed the
	 * active account and the window is focused, deliver that account's pending alerts.
	 */
	lookupApplied(previousAccountId: string | undefined, nextAccountId: string | undefined): Promise<void>;
}

/** Runs the `windowFocused` transition through the store from focus events and lookups (AD-9, A1). */
export function createFocusDelivery(deps: FocusDeliveryDeps): FocusDelivery {
	const deliver = async (activeAccountId: string | undefined): Promise<void> => {
		try {
			await deps.store.mutate(windowFocused, undefined, { activeAccountId, today: deps.today() });
		} catch (error) {
			deps.log(copy.log.focusDeliveryFailed(shortReason(error)));
		}
	};
	return {
		focused: deliver,
		lookupApplied: async (previousAccountId, nextAccountId) => {
			if (nextAccountId !== undefined && nextAccountId !== previousAccountId && deps.isFocused()) {
				await deliver(nextAccountId);
			}
		},
	};
}
