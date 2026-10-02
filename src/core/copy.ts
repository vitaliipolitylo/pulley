// Every user-facing string Pulley shows lives here.
// Strings that VS Code reads from package.json (view names, command titles,
// welcome content) are mirrored there; test/core/connection.test.ts keeps them in sync.

export const copy = {
	viewContainerTitle: 'Pulley',
	queueViewName: 'Review Queue',
	connectCommandTitle: 'Connect to GitHub',
	openPullRequestCommandTitle: 'Open Pull Request',
	debugSeedCommandTitle: 'Debug Seed',
	outputChannelName: 'Pulley',

	checkingConnection: 'Checking GitHub connection…',
	unconnectedExplanation:
		'Pulley needs access to your GitHub account to find pull requests waiting for your review. ' +
		'Only repositories visible to this GitHub sign-in are included.',
	connectButton: 'Connect',

	checking: 'Checking review requests…',
	pending: (n: number): string => (n === 1 ? '1 review is waiting.' : `${n} reviews are waiting.`),
	clear: 'No reviews are waiting in repositories visible to this GitHub sign-in.',
	incomplete: 'GitHub returned only part of the results, so this list may be incomplete.',
	failed: "Couldn't check GitHub.",
	stale: "Couldn't check GitHub. Showing the last known requests.",
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
	},
} as const;

/** The viewsWelcome markdown shown while unconnected (mirrored in package.json). */
export const unconnectedWelcome = `${copy.unconnectedExplanation}\n[${copy.connectButton}](command:pulley.connect)`;
