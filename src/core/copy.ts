// Every user-facing string Pulley shows lives here.
// Strings that VS Code reads from package.json (view names, command titles,
// welcome content) are mirrored there; test/core/connection.test.ts keeps them in sync.

export const copy = {
	viewContainerTitle: 'Pulley',
	queueViewName: 'Review Queue',
	connectCommandTitle: 'Connect to GitHub',
	outputChannelName: 'Pulley',

	checkingConnection: 'Checking GitHub connection…',
	unconnectedExplanation:
		'Pulley needs access to your GitHub account to find pull requests waiting for your review. ' +
		'Only repositories visible to this GitHub sign-in are included.',
	connectButton: 'Connect',
	connected: (label: string): string => `Connected as ${label}. Waiting for the first check.`,

	checking: 'Checking review requests…',
	pending: (n: number): string => (n === 1 ? '1 review is waiting.' : `${n} reviews are waiting.`),
	clear: 'No reviews are waiting in repositories visible to this GitHub sign-in.',
	incomplete: 'GitHub returned only part of the results, so this list may be incomplete.',
	failed: "Couldn't check GitHub.",

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
	},
} as const;

/** The viewsWelcome markdown shown while unconnected (mirrored in package.json). */
export const unconnectedWelcome = `${copy.unconnectedExplanation}\n[${copy.connectButton}](command:pulley.connect)`;
