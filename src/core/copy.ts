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

	log: {
		connectStarted: 'Connect requested.',
		connectFailed: (reason: string): string => `Connect did not complete: ${reason}`,
		silentLookupFailed: (reason: string): string => `GitHub session lookup failed: ${reason}`,
		stateChanged: (kind: string): string => `Connection state: ${kind}.`,
	},
} as const;

/** The viewsWelcome markdown shown while unconnected (mirrored in package.json). */
export const unconnectedWelcome = `${copy.unconnectedExplanation}\n[${copy.connectButton}](command:pulley.connect)`;
