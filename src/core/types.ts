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
