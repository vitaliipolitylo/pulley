// The quiet count (Story 2.3, decided: the native view badge). Rendered from the same view model
// as the tree. Clicking the activity-bar icon opens the queue natively; Pulley adds no command.
import { isDeepStrictEqual } from 'node:util';
import type * as vscode from 'vscode';
import { copy } from '../core/copy.ts';
import type { ViewModel } from '../core/types.ts';

/** The part of a TreeView the count touches; injectable for tests. */
export type BadgeHost = Pick<vscode.TreeView<unknown>, 'badge'>;

/**
 * The badge for a model: none when the count is null or 0 (so a stale count never shows an
 * unqualified zero); otherwise the count, with the count in words as the tooltip, qualified as
 * last known when stale.
 */
export function badgeFor(model: Pick<ViewModel, 'count' | 'countStale'>): vscode.ViewBadge | undefined {
	if (model.count === null || model.count === 0) {
		return undefined;
	}
	return { value: model.count, tooltip: copy.countTooltip(model.count, model.countStale) };
}

export interface StatusCount {
	/** Sets the badge from `count`/`countStale` only, skipping an unchanged value. */
	render(model: Pick<ViewModel, 'count' | 'countStale'>): void;
}

export function createStatusCount(host: BadgeHost): StatusCount {
	// A new TreeView has no badge.
	let last: vscode.ViewBadge | undefined;
	return {
		render(model) {
			const next = badgeFor(model);
			if (isDeepStrictEqual(next, last)) {
				return;
			}
			last = next;
			host.badge = next;
		},
	};
}
