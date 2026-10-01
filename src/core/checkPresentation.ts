// Temporary window-memory presentation of a single check (Story 1.2).
// Story 1.3 replaces this with viewModel.
import { copy } from './copy.ts';
import type { CheckResult, RequestItem } from './types.ts';

/** Row description: `owner/name#number · author`. */
export function rowDescription(item: RequestItem): string {
	return `${item.repo}#${item.number} · ${item.author}`;
}

/** Full row text for tooltips and accessible names. */
export function rowTooltip(item: RequestItem): string {
	return `${item.title}\n${rowDescription(item)}`;
}

/**
 * TreeView.message for a check result. "Clear" is shown only for a complete
 * successful check with zero items; a failure or an incomplete result never
 * shows a zero.
 */
export function checkMessage(result: CheckResult): string {
	if (!result.ok) {
		return copy.failed;
	}
	const n = result.items.length;
	if (result.complete) {
		return n === 0 ? copy.clear : copy.pending(n);
	}
	return n === 0 ? copy.incomplete : `${copy.pending(n)} ${copy.incomplete}`;
}
