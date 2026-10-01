---
title: 'Story 1.2: Find direct review requests across GitHub'
type: 'feature'
created: '2026-09-30'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-1-set-up-initial-project-from-starter-template.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After Story 1.1, Pulley knows the signed-in account but never asks GitHub for anything. The queue is always empty.

**Approach:** Add a GitHub adapter that runs AD-10's paginated GraphQL search for direct review requests and normalizes it into the AD-5 `CheckResult`. It runs once after a session is found (activation or Connect), and the result is shown as plain rows in `pulley.queue`. This is a temporary window-memory rendering: Story 1.3 replaces it with `store.mutate` + `viewModel`, and Story 1.5 replaces the ad-hoc trigger with the scheduler.

## Boundaries & Constraints

**Always:**
- The only endpoint is `POST https://api.github.com/graphql` through the built-in `fetch`, with the token taken from a fresh `getSession(..., {silent:true})` for each check. The token is never logged.
- Query: `viewer { login }` plus `search(type: ISSUE, query: "is:pr is:open user-review-requested:@me archived:false", first: 50, after: $cursor)`, paging until `pageInfo.hasNextPage` is false. Per PR: `id, number, title, url, author{login}, repository{nameWithOwner}, timelineItems(itemTypes:[REVIEW_REQUESTED_EVENT], last:10){nodes{... on ReviewRequestedEvent{createdAt, actor{login}, requestedReviewer{... on User{login}}}}}`.
- `requester`/`requestedAt` come from the newest event whose `requestedReviewer.login` equals the viewer's login. Otherwise both are omitted, never substituted.
- The adapter never throws. HTTP 401 → `unauthenticated`. 403/429 with a rate-limit signal (`x-ratelimit-remaining: 0` or `retry-after`) → `rate_limited`. A fetch rejection → `network`. A top-level `errors` with no `data`, a non-JSON body, or any unexpected exception → `graphql_error`. `data` plus `errors`, or a page that fails after page 1 → `ok: true, complete: false` with the items collected so far. Each case logs one line to the "Pulley" channel.
- `fetchStartedAt` is read in the shell before the first request. `accountId` is the session account id.
- `src/shell/github.ts` imports no `vscode`. `fetch`, the token, and a `log` function are injected, so it is unit-testable under plain Node.

**Never:**
- No persistence, reconcile, removal logic, scheduler, Refresh command, or settings. Do not use a REST API, Git remotes, `vscode.git`, or a GitHub client library.
- Never show "no reviews" / clear unless the result is `ok && complete && items.length === 0`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Two repos | 3 PRs across 2 repos, 1 page | 3 rows: label = title, description = `owner/name#number · author` | N/A |
| >50 results | 2 pages (50 + 7) | 57 items, `complete: true` | N/A |
| Matching event | Events: older viewer event, newer event for another user | `requestedAt` / `requester` from the older viewer event | N/A |
| No viewer event | Team-request event only | `requester`/`requestedAt` absent | N/A |
| Partial errors | `data` + `errors` | Items kept, `complete: false`; the message says the list may be incomplete | Log the error messages |
| Page 2 fails | Page 1 ok, page 2 network error | `ok: true, complete: false`, page-1 items | Log |
| 401 / offline / rate limited | — | `ok: false` with the matching reason; the view says "Couldn't check GitHub." and shows no zero | Log reason and status only |

</frozen-after-approval>

## Code Map

- `src/core/types.ts` (new) -- `RequestItem`, `CheckResult`, `FailureReason` exactly per AD-5/AD-13. Core types are erasable-only.
- `src/core/copy.ts` (from 1.1) -- add checking, pending ("{n} reviews are waiting."), clear, incomplete, and failed strings. The clear string is the UX sentence verbatim.
- `src/shell/github.ts` (new) -- `runCheck({ fetch, token, accountId, fetchStartedAt, log }): Promise<CheckResult>`, plus a pure `normalizePage(json, viewerLogin)` export for tests.
- `src/shell/auth.ts` (from 1.1) -- add `getToken(): Promise<{accountId, token} | undefined>` (silent).
- `src/shell/queueView.ts` (from 1.1) -- render `RequestItem[]` as `TreeItem`s (`collapsibleState: None`) plus a status message in `TreeView.message`.
- `src/extension.ts` -- after a session is found at activation or after Connect, run one check and hand the result to the view.
- `docs/spikes/live-query.md` (new) -- a record of the live run.

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/types.ts`, `src/core/copy.ts` -- contract types and strings.
- [ ] `src/shell/github.ts` -- query, pagination, normalization, and error mapping per Always.
- [ ] `src/shell/auth.ts`, `src/shell/queueView.ts`, `src/extension.ts` -- wire the single check and the rendering.
- [ ] `test/shell/github.test.ts` -- a vscode-free test run by `test:core` (extend its glob to `test/core/ test/shell/`). Use a fake `fetch` that covers every matrix row, including verifying the `after` cursor on page 2.
- [ ] `docs/spikes/live-query.md` -- a template with sections for automation requesters (bot actors), SSO/OAuth-restricted orgs, partial errors, no-folder operation, and cross-window `globalState` (the last is filled in during 1.3). The human completes it from a real Extension Development Host run. Summary counts go to the output channel (pages, items, errors; no titles or tokens) to support that run.

**Acceptance Criteria:**
- Given a signed-in session and no folder open, when VS Code starts, then one check runs and the rows appear without the view having to be opened first.
- Given the request log in the "Pulley" output channel after any check, when it is inspected, then it contains no token, `Authorization` header, or PR title.
- Given the live run is recorded in `docs/spikes/live-query.md`, when a limitation is found (for example, SSO-hidden orgs returning partial errors), then it is written there as resolved or as an explicit constraint for Story 1.3's removal logic.

## Design Notes

Viewer matching uses `login`, not node id, because `requestedReviewer` is a union and `login` is available on `User` without an extra field. Bots (`Bot` actor) can be requesters. `actor.login` is recorded as-is.

## Verification

**Commands:**
- `npm run compile` -- expected: pass.
- `npm run test:core` -- expected: core and adapter tests pass under plain Node 24.
- `npm test` -- expected: the smoke tests still pass.

**Manual checks:**
- In the Extension Development Host signed in to a real account, rows match github.com's "Review requests" list (direct only). The human fills in the spike doc.

## Implementation Notes

## Spec Change Log

## Review Triage Log
