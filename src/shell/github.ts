// GitHub adapter (AD-10): one paginated GraphQL search per check, normalized
// into the AD-5 CheckResult. No `vscode` import: fetch, token, and log are
// injected so this runs under plain Node in test:core. It never throws.
import { copy } from '../core/copy.ts';
import { shortReason } from '../core/connection.ts';
import type { CheckResult, FailureReason, RequestItem } from '../core/types.ts';

export const GRAPHQL_ENDPOINT = 'https://api.github.com/graphql';
export const SEARCH_QUERY = 'is:pr is:open user-review-requested:@me archived:false';
const PAGE_SIZE = 50;
/** GitHub search returns at most 1000 results (20 pages); this only guards against a looping cursor. */
const MAX_PAGES = 40;

export const QUERY = `query PulleyReviewRequests($cursor: String) {
  viewer { login }
  search(type: ISSUE, query: "${SEARCH_QUERY}", first: ${PAGE_SIZE}, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        id
        number
        title
        url
        author { login }
        repository { nameWithOwner }
        timelineItems(itemTypes: [REVIEW_REQUESTED_EVENT], last: 10) {
          nodes {
            ... on ReviewRequestedEvent {
              createdAt
              actor { login }
              requestedReviewer { ... on User { login } }
            }
          }
        }
      }
    }
  }
}`;

/** The slice of a fetch Response the adapter reads. */
export interface ResponseLike {
	status: number;
	ok: boolean;
	headers: { get(name: string): string | null };
	text(): Promise<string>;
}

export type FetchLike = (
	url: string,
	init: { method: 'POST'; headers: Record<string, string>; body: string },
) => Promise<ResponseLike>;

export interface RunCheckInput {
	fetch: FetchLike;
	token: string;
	accountId: string;
	fetchStartedAt: number;
	log: (line: string) => void;
}

export interface NormalizedPage {
	items: RequestItem[];
	/** Search results that could not be read as a pull request (for example, null nodes). */
	skipped: number;
	hasNextPage: boolean;
	endCursor: string | undefined;
}

// ---------------------------------------------------------------------------
// Normalization (pure)

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function str(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

function loginOf(value: unknown): string | undefined {
	return isObject(value) ? str(value.login) : undefined;
}

/** The newest ReviewRequestedEvent whose requested reviewer is the viewer. */
function matchingRequest(
	timeline: unknown,
	viewerLogin: string | undefined,
): { requester?: string; requestedAt: number } | undefined {
	if (!viewerLogin || !isObject(timeline) || !Array.isArray(timeline.nodes)) {
		return undefined;
	}
	let best: { requester?: string; requestedAt: number } | undefined;
	for (const event of timeline.nodes) {
		if (!isObject(event) || loginOf(event.requestedReviewer) !== viewerLogin) {
			continue;
		}
		const at = Date.parse(str(event.createdAt) ?? '');
		if (Number.isNaN(at)) {
			continue;
		}
		if (!best || at >= best.requestedAt) {
			const requester = loginOf(event.actor);
			best = requester === undefined ? { requestedAt: at } : { requester, requestedAt: at };
		}
	}
	return best;
}

function toItem(node: unknown, viewerLogin: string | undefined): RequestItem | undefined {
	if (!isObject(node)) {
		return undefined;
	}
	const id = str(node.id);
	const title = str(node.title);
	const url = str(node.url);
	const repo = isObject(node.repository) ? str(node.repository.nameWithOwner) : undefined;
	const number = node.number;
	if (!id || title === undefined || !url || !repo || typeof number !== 'number') {
		return undefined;
	}
	// A deleted account shows as "ghost" on GitHub.
	const author = loginOf(node.author) ?? 'ghost';
	const item: RequestItem = { id, repo, number, title, author, url };
	const match = matchingRequest(node.timelineItems, viewerLogin);
	if (match) {
		if (match.requester !== undefined) {
			item.requester = match.requester;
		}
		item.requestedAt = match.requestedAt;
	}
	return item;
}

/**
 * Normalizes one GraphQL response body. Returns undefined when `data.search`
 * is missing or unreadable.
 */
export function normalizePage(json: unknown, viewerLogin: string | undefined): NormalizedPage | undefined {
	if (!isObject(json) || !isObject(json.data)) {
		return undefined;
	}
	const search = json.data.search;
	if (!isObject(search) || !Array.isArray(search.nodes) || !isObject(search.pageInfo)) {
		return undefined;
	}
	const items: RequestItem[] = [];
	let skipped = 0;
	for (const node of search.nodes) {
		const item = toItem(node, viewerLogin);
		if (item) {
			items.push(item);
		} else {
			skipped++;
		}
	}
	return {
		items,
		skipped,
		hasNextPage: search.pageInfo.hasNextPage === true,
		endCursor: str(search.pageInfo.endCursor),
	};
}

// ---------------------------------------------------------------------------
// Transport

type PageOutcome =
	| { kind: 'ok'; json: Record<string, unknown> }
	| { kind: 'fail'; reason: FailureReason; detail: string };

function isRateLimited(res: ResponseLike): boolean {
	if (res.status !== 403 && res.status !== 429) {
		return false;
	}
	return res.headers.get('x-ratelimit-remaining') === '0' || res.headers.get('retry-after') !== null;
}

async function fetchPage(input: RunCheckInput, cursor: string | undefined): Promise<PageOutcome> {
	let res: ResponseLike;
	try {
		res = await input.fetch(GRAPHQL_ENDPOINT, {
			method: 'POST',
			headers: {
				Authorization: `bearer ${input.token}`,
				'Content-Type': 'application/json',
				Accept: 'application/json',
				'User-Agent': 'Pulley-VSCode',
			},
			body: JSON.stringify({ query: QUERY, variables: { cursor: cursor ?? null } }),
		});
	} catch (error) {
		return { kind: 'fail', reason: 'network', detail: shortReason(error) };
	}
	if (res.status === 401) {
		return { kind: 'fail', reason: 'unauthenticated', detail: 'HTTP 401' };
	}
	if (isRateLimited(res)) {
		return { kind: 'fail', reason: 'rate_limited', detail: `HTTP ${res.status}` };
	}
	if (!res.ok) {
		return { kind: 'fail', reason: 'graphql_error', detail: `HTTP ${res.status}` };
	}
	let json: unknown;
	try {
		json = JSON.parse(await res.text());
	} catch {
		return { kind: 'fail', reason: 'graphql_error', detail: `HTTP ${res.status}, non-JSON body` };
	}
	if (!isObject(json)) {
		return { kind: 'fail', reason: 'graphql_error', detail: `HTTP ${res.status}, unexpected body` };
	}
	return { kind: 'ok', json };
}

function errorMessages(errors: unknown[]): string {
	const messages = errors.map((e) => (isObject(e) ? str(e.message) : undefined) ?? 'unknown error');
	return shortReason(messages.join('; '));
}

// ---------------------------------------------------------------------------
// Check

export async function runCheck(input: RunCheckInput): Promise<CheckResult> {
	const { accountId, fetchStartedAt } = input;
	const log = (line: string): void => {
		try {
			input.log(line);
		} catch {
			// Diagnostics must never turn a check into an exception.
		}
	};
	const fail = (reason: FailureReason, detail: string): CheckResult => {
		log(copy.log.checkFailed(reason, detail));
		return { ok: false, accountId, fetchStartedAt, reason };
	};

	try {
		const byId = new Map<string, RequestItem>();
		let complete = true;
		let pages = 0;
		let errorCount = 0;
		let viewerLogin: string | undefined;
		let cursor: string | undefined;

		for (;;) {
			const page = pages + 1;
			const outcome = await fetchPage(input, cursor);
			let pageFailure: { reason: FailureReason; detail: string } | undefined;
			let normalized: NormalizedPage | undefined;

			if (outcome.kind === 'fail') {
				pageFailure = outcome;
			} else {
				const json = outcome.json;
				const errors = Array.isArray(json.errors) ? json.errors : [];
				const data = json.data;
				if (!isObject(data)) {
					pageFailure = {
						reason: 'graphql_error',
						detail: errors.length > 0 ? `errors without data: ${errorMessages(errors)}` : 'no data',
					};
				} else {
					if (page === 1) {
						viewerLogin = loginOf(data.viewer);
					}
					normalized = normalizePage(json, viewerLogin);
					if (errors.length > 0) {
						complete = false;
						errorCount += errors.length;
						log(copy.log.checkPartialErrors(page, errorMessages(errors)));
					} else if (!normalized) {
						pageFailure = { reason: 'graphql_error', detail: 'unreadable search result' };
					}
				}
			}

			if (pageFailure) {
				if (page === 1) {
					return fail(pageFailure.reason, pageFailure.detail);
				}
				log(copy.log.checkPageFailed(page, pageFailure.reason, pageFailure.detail));
				complete = false;
				break;
			}

			pages++;
			if (!normalized) {
				// data + errors with no readable search: partial, nothing more to page through.
				break;
			}
			if (normalized.skipped > 0) {
				complete = false;
				log(copy.log.checkSkippedNodes(page, normalized.skipped));
			}
			for (const item of normalized.items) {
				byId.set(item.id, item);
			}
			if (!normalized.hasNextPage) {
				break;
			}
			if (!normalized.endCursor || normalized.endCursor === cursor || pages >= MAX_PAGES) {
				complete = false;
				log(copy.log.checkPagingStopped(pages));
				break;
			}
			cursor = normalized.endCursor;
		}

		const items = [...byId.values()];
		log(copy.log.checkSummary(pages, items.length, errorCount, complete));
		return { ok: true, accountId, fetchStartedAt, complete, items };
	} catch (error) {
		return fail('graphql_error', `unexpected: ${shortReason(error)}`);
	}
}
