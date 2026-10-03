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

/** How a tracked request was first classified (AD-7); never recomputed while the item stays. */
export type Origin = 'new' | 'backlog';

/** Per-item alert state (AD-9): a new item is `'pending'` until a focused window marks it `'shown'`. */
export type AlertState = 'none' | 'pending' | 'shown';

/**
 * Backlog reminder state (AD-8). `reconcile` sets `'pending'` (first connection, or at most one
 * ongoing reminder per local day); a focused window's delivery marks it `'shown'`.
 */
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
	/**
	 * Local `YYYY-MM-DD` of the last backlog reminder: the decision day when it became pending, then
	 * the delivery day once it is shown (Story 2.2).
	 */
	lastBacklogReminderDate?: string;
	backlogAlert: BacklogAlert;
	/**
	 * Set by an applied success that adds a new item; cleared by an applied success that adds none
	 * (AD-7). Failures and rule-4 no-op successes leave it unchanged.
	 */
	newSignal: boolean;
	items: { [prNodeId: string]: Tracked };
}

export interface Stored {
	schemaVersion: 1;
	accounts: { [accountId: string]: Account };
}

/**
 * Effects a transition asks the shell to run after the write (AD-2). Closed union. Each effect
 * carries its account, so the shell resolves it from that partition, never the active account.
 */
export type Effect =
	| { kind: 'notifyNew'; accountId: string; itemId: string }
	| { kind: 'notifyBacklog'; accountId: string; count: number; firstConnection: boolean };

/**
 * Every durable change: `(stored, input, ctx) → { stored, effects, report? }`. `report` is window
 * information for the shell (never stored); `store.mutate` resolves to it after the write.
 */
export interface TransitionResult<R = unknown> {
	stored: Stored;
	effects: Effect[];
	report?: R;
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
	/**
	 * TreeView.description: "Last checked {time}" for pending and clear once a complete check has
	 * succeeded. Kept out of `message` so a poll that only moves the time re-announces nothing.
	 */
	lastChecked?: string;
	rows: Row[];
}
