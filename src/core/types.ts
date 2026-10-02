// Contract types shared by core and shell (AD-5, AD-13). Erasable-only TypeScript.
import type { UnconnectedReason } from './connection.ts';

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
	/** `owner/name · author · {age}` (pending mock). */
	description: string;
	/** "Requested 2h ago", …, or "Request time unavailable". */
	age: string;
	/** Plain-text hover lines: `owner/name#number`, title, "by {author}", age. */
	tooltip: string;
	/** Full row text for screen readers: `owner/name#number`, title, "by {author}", age. */
	accessibleLabel: string;
	url: string;
}

/** The one action offered for a failure reason (AD-11, AD-13). */
export type FailureAction = 'connect' | 'reconnect' | 'refresh';

export interface ViewModel {
	status: ViewStatus;
	/** Why the window is unconnected; set only when `status` is `unconnected`. */
	reason?: UnconnectedReason;
	/** The action the state offers; set for `unconnected` and `stale`. */
	action?: FailureAction;
	/** Null whenever `status` is not `pending` or `clear`, and before the first complete success. */
	count: number | null;
	/** TreeView.message. Undefined while the welcome content explains (unconnected with no rows). */
	message?: string;
	rows: Row[];
}
