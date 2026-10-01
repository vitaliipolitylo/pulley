// Adapter tests under plain Node (no vscode): one case per I/O matrix row, plus error mapping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	GRAPHQL_ENDPOINT,
	normalizePage,
	runCheck,
	type FetchLike,
	type ResponseLike,
} from '../../src/shell/github.ts';
import type { CheckResult } from '../../src/core/types.ts';

const TOKEN = 'gho_TEST_TOKEN_never_logged';
const VIEWER = 'me';
const STARTED = 1_700_000_000_000;

type Reply = ResponseLike | Error;

function res(status: number, body: unknown, headers: Record<string, string> = {}): ResponseLike {
	const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
	return {
		status,
		ok: status >= 200 && status < 300,
		headers: { get: (name) => lower[name.toLowerCase()] ?? null },
		text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
	};
}

function fakeFetch(replies: Reply[]) {
	const calls: Array<{ url: string; headers: Record<string, string>; body: { query: string; variables: { cursor: string | null } } }> =
		[];
	const fetch: FetchLike = async (url, init) => {
		calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
		const reply = replies.shift();
		if (!reply) {
			throw new Error('unexpected extra request');
		}
		if (reply instanceof Error) {
			throw reply;
		}
		return reply;
	};
	return { fetch, calls };
}

interface PrOpts {
	n: number;
	repo?: string;
	title?: string;
	author?: string | null;
	events?: unknown[];
}

function pr({ n, repo = 'octo/app', title = `Secret PR title ${n}`, author = 'alice', events = [] }: PrOpts) {
	return {
		id: `PR_${repo}_${n}`,
		number: n,
		title,
		url: `https://github.com/${repo}/pull/${n}`,
		author: author === null ? null : { login: author },
		repository: { nameWithOwner: repo },
		timelineItems: { nodes: events },
	};
}

function page(nodes: unknown[], hasNextPage = false, endCursor: string | null = null, extra: Record<string, unknown> = {}) {
	return {
		data: { viewer: { login: VIEWER }, search: { pageInfo: { hasNextPage, endCursor }, nodes } },
		...extra,
	};
}

async function check(replies: Reply[]) {
	const { fetch, calls } = fakeFetch(replies);
	const lines: string[] = [];
	const result = await runCheck({ fetch, token: TOKEN, accountId: 'acct-1', fetchStartedAt: STARTED, log: (l) => lines.push(l) });
	return { result, calls, lines };
}

function assertLogSafe(lines: string[]) {
	const text = lines.join('\n');
	assert.ok(!text.includes(TOKEN), 'token not logged');
	assert.ok(!/authorization|bearer/i.test(text), 'no Authorization header logged');
	assert.ok(!text.includes('Secret PR title'), 'no PR title logged');
}

function ok(result: CheckResult) {
	assert.equal(result.ok, true);
	if (!result.ok) {
		throw new Error('unreachable');
	}
	return result;
}

test('two repos, one page: 3 items normalized, complete', async () => {
	const { result, calls, lines } = await check([
		res(200, page([pr({ n: 1, repo: 'octo/app' }), pr({ n: 2, repo: 'octo/app', author: 'bob' }), pr({ n: 7, repo: 'acme/lib' })])),
	]);
	const r = ok(result);
	assert.equal(r.complete, true);
	assert.equal(r.accountId, 'acct-1');
	assert.equal(r.fetchStartedAt, STARTED);
	assert.deepEqual(
		r.items.map((i) => [i.repo, i.number, i.author]),
		[
			['octo/app', 1, 'alice'],
			['octo/app', 2, 'bob'],
			['acme/lib', 7, 'alice'],
		],
	);
	assert.deepEqual(r.items[0], {
		id: 'PR_octo/app_1',
		repo: 'octo/app',
		number: 1,
		title: 'Secret PR title 1',
		author: 'alice',
		url: 'https://github.com/octo/app/pull/1',
	});
	assert.equal(calls.length, 1);
	assert.equal(calls[0].url, GRAPHQL_ENDPOINT);
	assert.equal(calls[0].url, 'https://api.github.com/graphql');
	assert.equal(calls[0].headers.Authorization, `bearer ${TOKEN}`);
	assert.equal(calls[0].body.variables.cursor, null);
	assert.match(calls[0].body.query, /is:pr is:open user-review-requested:@me archived:false/);
	assert.match(calls[0].body.query, /first: 50, after: \$cursor/);
	assert.match(calls[0].body.query, /viewer \{ login \}/);
	assert.match(calls[0].body.query, /REVIEW_REQUESTED_EVENT\], last: 10/);
	assert.ok(lines.some((l) => /pages=1, items=3, errors=0, complete=true/.test(l)));
	assertLogSafe(lines);
});

test('>50 results: two pages (50 + 7), cursor sent on page 2, complete', async () => {
	const first = Array.from({ length: 50 }, (_, i) => pr({ n: i + 1 }));
	const second = Array.from({ length: 7 }, (_, i) => pr({ n: 51 + i }));
	const { result, calls, lines } = await check([res(200, page(first, true, 'CURSOR_1')), res(200, page(second, false, 'CURSOR_2'))]);
	const r = ok(result);
	assert.equal(r.items.length, 57);
	assert.equal(r.complete, true);
	assert.equal(calls.length, 2);
	assert.equal(calls[0].body.variables.cursor, null);
	assert.equal(calls[1].body.variables.cursor, 'CURSOR_1');
	assert.ok(lines.some((l) => /pages=2, items=57, errors=0, complete=true/.test(l)));
	assertLogSafe(lines);
});

test('matching event: the newest viewer event wins over a newer event for someone else', async () => {
	const events = [
		{ createdAt: '2026-09-01T10:00:00Z', actor: { login: 'carol' }, requestedReviewer: { login: VIEWER } },
		{ createdAt: '2026-09-02T10:00:00Z', actor: { login: 'dave' }, requestedReviewer: { login: VIEWER } },
		{ createdAt: '2026-09-03T10:00:00Z', actor: { login: 'erin' }, requestedReviewer: { login: 'someone-else' } },
	];
	const { result } = await check([res(200, page([pr({ n: 1, events })]))]);
	const item = ok(result).items[0];
	assert.equal(item.requester, 'dave');
	assert.equal(item.requestedAt, Date.parse('2026-09-02T10:00:00Z'));
});

test('matching event: bot actors are recorded as-is', async () => {
	const events = [{ createdAt: '2026-09-01T10:00:00Z', actor: { login: 'dependabot' }, requestedReviewer: { login: VIEWER } }];
	const item = ok((await check([res(200, page([pr({ n: 1, events })]))])).result).items[0];
	assert.equal(item.requester, 'dependabot');
});

test('no viewer event (team request only): requester and requestedAt are absent, never substituted', async () => {
	const events = [{ createdAt: '2026-09-01T10:00:00Z', actor: { login: 'carol' }, requestedReviewer: {} }];
	const item = ok((await check([res(200, page([pr({ n: 1, events })]))])).result).items[0];
	assert.ok(!('requester' in item));
	assert.ok(!('requestedAt' in item));
});

test('partial errors: data + errors keeps items, complete false, logs the error messages', async () => {
	const body = page([pr({ n: 1 }), null], false, null, {
		errors: [{ message: 'Resource protected by organization SAML enforcement.' }],
	});
	const { result, lines } = await check([res(200, body)]);
	const r = ok(result);
	assert.equal(r.complete, false);
	assert.equal(r.items.length, 1);
	assert.ok(lines.some((l) => l.includes('SAML enforcement') && l.includes('may be incomplete')));
	assertLogSafe(lines);
});

test('page 2 fails with a network error: ok, incomplete, page-1 items', async () => {
	const { result, calls, lines } = await check([res(200, page([pr({ n: 1 }), pr({ n: 2 })], true, 'C1')), new Error('fetch failed')]);
	const r = ok(result);
	assert.equal(r.complete, false);
	assert.deepEqual(
		r.items.map((i) => i.number),
		[1, 2],
	);
	assert.equal(calls[1].body.variables.cursor, 'C1');
	assert.ok(lines.some((l) => /Page 2 failed \(network/.test(l)));
	assertLogSafe(lines);
});

const failures: Array<{ name: string; reply: Reply; reason: string }> = [
	{ name: 'HTTP 401', reply: res(401, { message: 'Bad credentials' }), reason: 'unauthenticated' },
	{ name: 'offline', reply: new Error('fetch failed'), reason: 'network' },
	{ name: '403 with x-ratelimit-remaining: 0', reply: res(403, {}, { 'x-ratelimit-remaining': '0' }), reason: 'rate_limited' },
	{ name: '429 with retry-after', reply: res(429, {}, { 'Retry-After': '60' }), reason: 'rate_limited' },
	{ name: '403 without a rate-limit signal', reply: res(403, {}, { 'x-ratelimit-remaining': '12' }), reason: 'graphql_error' },
	{ name: 'HTTP 502', reply: res(502, 'Bad gateway'), reason: 'graphql_error' },
	{ name: 'non-JSON body', reply: res(200, '<html>Secret PR title</html>'), reason: 'graphql_error' },
	{ name: 'errors without data', reply: res(200, { errors: [{ message: 'Something went wrong' }] }), reason: 'graphql_error' },
	{ name: 'data: null with errors', reply: res(200, { data: null, errors: [{ message: 'x' }] }), reason: 'graphql_error' },
	{ name: 'unreadable search shape', reply: res(200, { data: { viewer: { login: VIEWER } } }), reason: 'graphql_error' },
];

for (const f of failures) {
	test(`page 1 failure (${f.name}) → ok:false, ${f.reason}, one log line`, async () => {
		const { result, lines } = await check([f.reply]);
		assert.deepEqual(result, { ok: false, accountId: 'acct-1', fetchStartedAt: STARTED, reason: f.reason });
		assert.equal(lines.length, 1);
		assert.ok(lines[0].includes(f.reason));
		assertLogSafe(lines);
	});
}

test('an unexpected exception becomes graphql_error and does not throw', async () => {
	const headersThrow: ResponseLike = {
		status: 403,
		ok: false,
		headers: {
			get: () => {
				throw new Error('boom');
			},
		},
		text: async () => '{}',
	};
	const { result, lines } = await check([headersThrow]);
	assert.deepEqual(result, { ok: false, accountId: 'acct-1', fetchStartedAt: STARTED, reason: 'graphql_error' });
	assert.ok(lines[0].includes('unexpected'));

	// Even a throwing log function cannot make the adapter throw.
	const { fetch } = fakeFetch([res(200, page([pr({ n: 1 })]))]);
	const r2 = await runCheck({
		fetch,
		token: TOKEN,
		accountId: 'a',
		fetchStartedAt: 1,
		log: () => {
			throw new Error('channel closed');
		},
	});
	assert.equal(r2.ok, true);
});

test('hasNextPage without a cursor stops paging and marks incomplete', async () => {
	const { result, calls } = await check([res(200, page([pr({ n: 1 })], true, null))]);
	const r = ok(result);
	assert.equal(r.complete, false);
	assert.equal(r.items.length, 1);
	assert.equal(calls.length, 1);
});

test('page 1 data + errors with an unreadable search: ok, incomplete, no items, partial-errors log', async () => {
	const { result, lines } = await check([res(200, { data: { viewer: { login: VIEWER } }, errors: [{ message: 'SSO required' }] })]);
	assert.deepEqual(result, { ok: true, accountId: 'acct-1', fetchStartedAt: STARTED, complete: false, items: [] });
	assert.ok(lines.some((l) => l.includes('errors with data on page 1') && l.includes('SSO required')));
	assertLogSafe(lines);
});

test('a null search node without errors: incomplete, unreadable-result log', async () => {
	const { result, lines } = await check([res(200, page([pr({ n: 1 }), null]))]);
	const r = ok(result);
	assert.equal(r.complete, false);
	assert.equal(r.items.length, 1);
	assert.ok(lines.some((l) => /Page 1 had 1 unreadable search result/.test(l)));
	assertLogSafe(lines);
});

test('a node id repeated on page 2 is counted once', async () => {
	const { result } = await check([
		res(200, page([pr({ n: 1 }), pr({ n: 2 })], true, 'C1')),
		res(200, page([pr({ n: 2 }), pr({ n: 3 })], false, 'C2')),
	]);
	const r = ok(result);
	assert.equal(r.complete, true);
	assert.deepEqual(
		r.items.map((i) => i.number),
		[1, 2, 3],
	);
});

test('page 2 returning the cursor that was sent stops paging, incomplete', async () => {
	const { result, calls, lines } = await check([
		res(200, page([pr({ n: 1 })], true, 'C1')),
		res(200, page([pr({ n: 2 })], true, 'C1')),
	]);
	const r = ok(result);
	assert.equal(r.complete, false);
	assert.equal(r.items.length, 2);
	assert.equal(calls.length, 2);
	assert.ok(lines.some((l) => /Paging stopped after page 2/.test(l)));
	assert.ok(!lines.some((l) => /Page 3 failed/.test(l)));
});

test('an always-changing cursor stops at the 40-page cap, incomplete', async () => {
	const replies = Array.from({ length: 45 }, (_, i) => res(200, page([pr({ n: i + 1 })], true, `C${i + 1}`)));
	const { result, calls, lines } = await check(replies);
	const r = ok(result);
	assert.equal(r.complete, false);
	assert.equal(calls.length, 40);
	assert.equal(r.items.length, 40);
	assert.ok(lines.some((l) => /Paging stopped after page 40/.test(l)));
	assertLogSafe(lines);
});

test('normalizePage: null nodes are counted as skipped; deleted author is "ghost"', () => {
	const n = normalizePage(page([pr({ n: 1, author: null }), null]), VIEWER);
	assert.ok(n);
	assert.equal(n.skipped, 1);
	assert.equal(n.items[0].author, 'ghost');
	assert.equal(normalizePage({ data: {} }, VIEWER), undefined);
	assert.equal(normalizePage('nope', VIEWER), undefined);
});

test('normalizePage does not mutate its input', () => {
	const json = page([pr({ n: 1 })]);
	const before = JSON.stringify(json);
	normalizePage(json, VIEWER);
	assert.equal(JSON.stringify(json), before);
});

test('src/shell/github.ts imports no vscode', () => {
	const source = readFileSync(join(process.cwd(), 'src', 'shell', 'github.ts'), 'utf8');
	assert.doesNotMatch(source, /from\s+['"]vscode['"]|require\(\s*['"]vscode['"]\s*\)/);
});
