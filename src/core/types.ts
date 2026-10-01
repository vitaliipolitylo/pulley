// Contract types shared by core and shell (AD-5, AD-13). Erasable-only TypeScript.

/** One outstanding direct review request, normalized from GitHub. */
export interface RequestItem {
	/** PR GraphQL node id: the request's identity (AD-6). */
	id: string;
	/** "owner/name". */
	repo: string;
	number: number;
	title: string;
	/** PR author login. */
	author: string;
	url: string;
	/** Login of whoever made the newest direct request for the viewer, when known. */
	requester?: string;
	/** Epoch ms of the newest direct request for the viewer, when known. */
	requestedAt?: number;
}

export type FailureReason = 'signed_out' | 'unauthenticated' | 'network' | 'rate_limited' | 'graphql_error';

export interface CheckSuccess {
	ok: true;
	accountId: string;
	/** Epoch ms, read in the shell before the first request. */
	fetchStartedAt: number;
	/** True only when every page was fetched with no GraphQL errors. */
	complete: boolean;
	items: RequestItem[];
}

export interface CheckFailure {
	ok: false;
	accountId?: string;
	fetchStartedAt: number;
	reason: FailureReason;
}

export type CheckResult = CheckSuccess | CheckFailure;

// ---------------------------------------------------------------------------
// Stored state (AD-4). One JSON value in globalState under `pulley.state.v1`.
// ---------------------------------------------------------------------------

/** How a tracked request was first classified (AD-7). Epic 1 writes only `'backlog'`. */
export type Origin = 'new' | 'backlog';

/** Per-item alert state (AD-9). Epic 1 writes only `'none'`. */
export type AlertState = 'none' | 'pending' | 'shown';

/** Backlog reminder state (AD-8). Epic 1 writes only `'none'`. */
export type BacklogAlert = 'none' | { state: 'pending' | 'shown'; firstConnection: boolean };

/** One outstanding request as stored: the latest `RequestItem` fields plus core-owned fields. */
export interface Tracked extends RequestItem {
	/** Epoch ms when this cycle was first observed (AD-6). */
	firstSeenAt: number;
	origin: Origin;
	alert: AlertState;
}

export interface Account {
	firstCheckDone: boolean;
	lastAttemptAt?: number;
	lastAttemptIntervalMs?: number;
	/** `fetchStartedAt` of the newest applied complete success. */
	lastSuccessAt?: number;
	/** `fetchStartedAt` of the newest applied complete success (AD-5 ordering guard). */
	lastAppliedFetchStartedAt?: number;
	/** `fetchStartedAt` of the newest applied incomplete success (Story 1.3 addition). */
	lastIncompleteFetchStartedAt?: number;
	lastFailure?: { at: number; reason: FailureReason };
	/** Local `YYYY-MM-DD` of the last backlog reminder (Epic 2). */
	lastBacklogReminderDate?: string;
	backlogAlert: BacklogAlert;
	newSignal: boolean;
	items: { [prNodeId: string]: Tracked };
}

export interface Stored {
	schemaVersion: 1;
	accounts: { [accountId: string]: Account };
}

/** Effects a transition asks the shell to run after the write (AD-2). Closed union. */
export type Effect =
	| { kind: 'notifyNew'; itemId: string }
	| { kind: 'notifyBacklog'; count: number; firstConnection: boolean };

/** Every durable change: `(stored, input, ctx) → { stored, effects }`. */
export interface TransitionResult {
	stored: Stored;
	effects: Effect[];
}

// ---------------------------------------------------------------------------
// View model (AD-12).
// ---------------------------------------------------------------------------

export type ViewStatus = 'loading' | 'unconnected' | 'pending' | 'clear' | 'stale' | 'readOnly';

export interface Row {
	/** PR node id. */
	id: string;
	/** Tree item label: the PR title. */
	label: string;
	/** `owner/name#number · author`. */
	description: string;
	tooltip: string;
	accessibleLabel: string;
	url: string;
}

export interface ViewModel {
	status: ViewStatus;
	/** Null until the account's first complete successful check. */
	count: number | null;
	/** TreeView.message. Undefined while unconnected (the welcome content explains). */
	message?: string;
	rows: Row[];
}
