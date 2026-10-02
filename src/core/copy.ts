// Every user-facing string Pulley shows lives here.
// Strings that VS Code reads from package.json (view names, command titles,
// welcome content) are mirrored there; test/core/connection.test.ts keeps them in sync.
import type { FailureAction, FailureReason } from './types.ts';

export const copy = {
	viewContainerTitle: 'Pulley',
	queueViewName: 'Review Queue',
	connectCommandTitle: 'Connect to GitHub',
	reconnectCommandTitle: 'Reconnect GitHub',
	openPullRequestCommandTitle: 'Open Pull Request',
	refreshCommandTitle: 'Refresh review requests',
	checkIntervalDescription: 'How often Pulley checks GitHub for review requests, in minutes (5–240).',
	debugSeedCommandTitle: 'Debug Seed',
	outputChannelName: 'Pulley',

	checkingConnection: 'Checking GitHub connection…',
	unconnectedExplanation:
		'Pulley needs access to your GitHub account to find pull requests waiting for your review. ' +
		'Only repositories visible to this GitHub sign-in are included.',
	connectButton: 'Connect',
	unauthenticatedExplanation:
		"Pulley's GitHub sign-in expired or was revoked, so the queue can't be checked. " +
		'Only repositories visible to this GitHub sign-in are included.',
	reconnectButton: 'Reconnect',
	/** Shown in VS Code's sign-in prompt when Reconnect asks for a new session. */
	reconnectDetail: "Pulley's GitHub sign-in expired or was revoked. Sign in again to check your review requests.",

	checking: 'Checking review requests…',
	pending: (n: number): string => (n === 1 ? '1 review is waiting.' : `${n} reviews are waiting.`),
	clear: 'No reviews are waiting in repositories visible to this GitHub sign-in.',
	incomplete: 'GitHub returned only part of the results, so this list may be incomplete.',
	/** A failure after a prior complete success: the stored rows are shown as stale. */
	stale: (time: string): string => `Couldn't check GitHub. Showing the last known requests from ${time}.`,
	/** A failure with no prior complete success: no count and no clear state. */
	unavailable: "Couldn't check GitHub, so the queue is unavailable.",
	/** Appended to the pending and clear messages once a complete check has succeeded (Story 1.5). */
	lastChecked: (time: string): string => `Last checked ${time}`,
	updatePulley: 'This data was saved by a newer version of Pulley. Update Pulley to see your review queue.',

	// Request age phrases (Story 1.4). Formatted only in viewModel, from `now - requestedAt`.
	requestedJustNow: 'Requested just now',
	requestedMinutesAgo: (m: number): string => `Requested ${m}m ago`,
	requestedHoursAgo: (h: number): string => `Requested ${h}h ago`,
	requestedYesterday: 'Requested yesterday',
	requestedDaysAgo: (d: number): string => `Requested ${d}d ago`,
	requestTimeUnavailable: 'Request time unavailable',
	/** Row description, following the pending mock: `owner/name · author · {age}`. */
	rowDescription: (repo: string, author: string, age: string): string => `${repo} · ${author} · ${age}`,
	/** Full row text for screen readers, exposed even when the row is visually truncated. */
	rowAccessibleLabel: (repo: string, number: number, title: string, author: string, age: string): string =>
		`${repo}#${number}, ${title}, by ${author}, ${age}`,
	/** Full row text for the hover, one fact per line (plain text; the shell escapes it). */
	rowTooltip: (repo: string, number: number, title: string, author: string, age: string): string =>
		`${repo}#${number}\n${title}\nby ${author}\n${age}`,

	debugSeedNeedsConnection: 'Connect to GitHub before running Pulley: Debug Seed. Seeded rows go into the active account.',
	debugSeedDone: (n: number): string => `Pulley seeded ${n} synthetic review requests. The next complete check replaces them.`,

	log: {
		connectStarted: 'Connect requested.',
		connectFailed: (reason: string): string => `Connect did not complete: ${reason}`,
		silentLookupFailed: (reason: string): string => `GitHub session lookup failed: ${reason}`,
		stateChanged: (kind: string): string => `Connection state: ${kind}.`,
		checkStarted: 'Check started.',
		checkNoSession: 'Check skipped: no GitHub session.',
		checkRetryAfter401: 'GitHub returned 401; retrying once with a fresh silent session lookup.',
		checkUnauthenticated: 'GitHub returned 401 after retry; Reconnect is needed.',
		checkDiscarded: (started: number, current: number): string =>
			`Check result discarded: the GitHub session changed during the check (generation ${started} → ${current}).`,
		checkGenerationGaveUp: 'The GitHub session kept changing during the check; the next trigger checks again.',
		checkSummary: (pages: number, items: number, errors: number, complete: boolean): string =>
			`Check finished: pages=${pages}, items=${items}, errors=${errors}, complete=${complete}.`,
		checkFailed: (reason: string, detail: string): string => `Check failed: ${reason} (${detail}).`,
		checkPartialErrors: (page: number, messages: string): string =>
			`GitHub returned errors with data on page ${page}; the list may be incomplete: ${messages}`,
		checkPageFailed: (page: number, reason: string, detail: string): string =>
			`Page ${page} failed (${reason}, ${detail}); keeping earlier pages, the list may be incomplete.`,
		checkPagingStopped: (pages: number): string =>
			`Paging stopped after page ${pages} (no usable cursor or page limit); the list may be incomplete.`,
		checkSkippedNodes: (page: number, count: number): string =>
			`Page ${page} had ${count} unreadable search result(s); the list may be incomplete.`,
		stateNewerSchema: (version: number): string =>
			`Stored state has schemaVersion ${version}, newer than this Pulley understands; read-only until Pulley is updated.`,
		stateMalformed: (problem: string): string =>
			`Stored state is malformed (${problem}); it will be replaced with empty state on the next write.`,
		listenerFailed: (reason: string): string => `Re-render after a state change failed: ${reason}`,
		stateWriteFailed: (reason: string): string => `Applying a check result failed: ${reason}`,
		openIgnored: (url: string): string => `Open Pull Request ignored: not a https://github.com/ URL (${url}).`,
		openFailed: (reason: string): string => `Opening the pull request failed: ${reason}`,
		debugSeeded: (n: number): string => `Debug seed wrote ${n} synthetic items.`,
		debugSeedFailed: (reason: string): string => `Debug seed failed: ${reason}`,
		checkTriggered: (kind: string, delayMs: number): string =>
			delayMs > 0 ? `Check trigger: ${kind} (starting in ${Math.round(delayMs / 1000)} s).` : `Check trigger: ${kind}.`,
		checkJoined: (kind: string): string => `Check trigger: ${kind} joined the check already in progress.`,
		checkCrashed: (reason: string): string => `Check ended unexpectedly: ${reason}`,
		intervalClamped: (raw: string, minutes: number): string =>
			`pulley.checkIntervalMinutes ${raw} is out of range (5–240); using ${minutes}.`,
		intervalRestarted: (minutes: number): string => `Check interval is ${minutes} min; the timer restarted.`,
	},
} as const;

/** The viewsWelcome markdown shown while unconnected (mirrored in package.json). */
export const unconnectedWelcome = `${copy.unconnectedExplanation}\n[${copy.connectButton}](command:pulley.connect)`;

/** The viewsWelcome markdown shown while unauthenticated (mirrored in package.json). */
export const unauthenticatedWelcome = `${copy.unauthenticatedExplanation}\n[${copy.reconnectButton}](command:pulley.connect)`;

/** One message hint and one action per failure reason. */
export const failureCopy: Readonly<Record<FailureReason, { hint: string; action: FailureAction }>> = {
	signed_out: { hint: 'GitHub is not connected. Connect to check again.', action: 'connect' },
	unauthenticated: { hint: 'The GitHub sign-in expired or was revoked. Reconnect to check again.', action: 'reconnect' },
	network: { hint: 'GitHub could not be reached. Refresh to try again.', action: 'refresh' },
	rate_limited: { hint: 'GitHub rate limit reached. Refresh to try again later.', action: 'refresh' },
	graphql_error: { hint: 'GitHub returned an error. Refresh to try again.', action: 'refresh' },
};

/**
 * The message for a failed check: stale (with the last success time) when a complete check has
 * succeeded before, unavailable otherwise; then the reason's hint.
 */
export function failureMessage(reason: FailureReason, lastSuccessTime: string | undefined): string {
	const lead = lastSuccessTime === undefined ? copy.unavailable : copy.stale(lastSuccessTime);
	return `${lead} ${failureCopy[reason].hint}`;
}
