---
title: 'Story 1.2: Find direct review requests across GitHub'
type: 'feature'
created: '2026-09-30'
status: 'done'
baseline_commit: '50e490d978a12e1fae88a0d9ae21546b0eff281d'
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
- [x] `src/core/types.ts`, `src/core/copy.ts` -- contract types and strings.
- [x] `src/shell/github.ts` -- query, pagination, normalization, and error mapping per Always.
- [x] `src/shell/auth.ts`, `src/shell/queueView.ts`, `src/extension.ts` -- wire the single check and the rendering.
- [x] `test/shell/github.test.ts` -- a vscode-free test run by `test:core` (extend its glob to `test/core/ test/shell/`). Use a fake `fetch` that covers every matrix row, including verifying the `after` cursor on page 2.
- [x] `docs/spikes/live-query.md` -- a template with sections for automation requesters (bot actors), SSO/OAuth-restricted orgs, partial errors, no-folder operation, and cross-window `globalState` (the last is filled in during 1.3). The human completes it from a real Extension Development Host run. Summary counts go to the output channel (pages, items, errors; no titles or tokens) to support that run.

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

- `runCheck` posts only to `https://api.github.com/graphql` (`Authorization: bearer <token>`, `User-Agent: Pulley-VSCode`) and pages with `after: $cursor` until `hasNextPage` is false. Items are de-duplicated by node id across pages. A `hasNextPage` with no usable cursor, or more than 40 pages (GitHub search caps at 20), stops paging with `complete: false` and a log line.
- `normalizePage` returns `undefined` when `data.search` is unreadable. Search nodes that cannot be read as a PR (for example `null` nodes from hidden orgs) are counted as `skipped`, and any skip makes the result `complete: false`. This is stricter than the spec, which ties `complete` only to errors and pages; it can only prevent removals in Story 1.3.
- `requestedAt` is epoch ms (`Date.parse(createdAt)`); events with an unparseable `createdAt` are ignored. A matching event with a null `actor` yields `requestedAt` without `requester`. A null PR author is shown as `ghost`.
- `data` + `errors` with an unreadable `search` is a partial result with no items from that page (`ok: true, complete: false`). `data: null` or no `data` is `graphql_error`. The injected `log` is wrapped so a throwing log cannot make the adapter throw. GraphQL error messages are logged through `shortReason` (single line, 120 chars).
- The message logic lives in a small pure `src/core/checkPresentation.ts` (`checkMessage`, `rowDescription`, `rowTooltip`) so `test:core` covers it; Story 1.3's `viewModel` replaces it. `copy.pending` says "1 review is waiting." for one item.
- `extension.ts` runs one check after any lookup that yields a connected state (activation, Connect, and session change, so rows never belong to a previous account). It reads `fetchStartedAt = Date.now()` before the first request, retries a silent token lookup once on `unauthenticated` (AD-11), and drops results whose ticket or account is no longer current. A failure keeps rows for the same account and shows "Couldn't check GitHub."; a different account or unconnected clears rows.
- HTTP 200 with GraphQL `errors[].type = RATE_LIMITED` and no data maps to `graphql_error`, per the Always rule. The spike doc asks the live run to confirm how GitHub reports GraphQL rate limits.
- `test:core` runs `test/core/**` and `test/shell/**`. `docs/**` is excluded from the package via `.vscodeignore`.

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Evidence | Route |
|---|--------|---------|---------|----------|-------|
| 1 | blind, edge, verification (other) | `checkAfterConnect` returns without rendering on an account mismatch, so the view can stay on "Checking…" | low | Both lookups call silent `getSession` with the same scopes, so a mismatch needs a session change. A session change fires `onGitHubSessionsChanged`, which starts a newer ticket that renders. Unlikely in everyday use. | rejected |
| 2 | edge | A 401 for account A followed by a retry that returns account B is dropped as a mismatch | low | Same root cause as #1. A different account on retry implies a session change, which starts a new ticket. | rejected |
| 3 | blind | The silent 401 retry likely reuses the same token, and a persistent 401 has no reconnect path | low | AD-11 requires exactly one silent retry. The spec maps 401 to "Couldn't check GitHub." Reconnect recovery belongs to Story 1.6. | rejected |
| 4 | blind | `fetch` has no timeout, so the view can stay on "Checking…" indefinitely | low | Node/undici fetch has default connect and headers timeouts (about 300s), after which the request rejects and maps to `network`. The hang is bounded and rare. The fix would add a parameter. | rejected |
| 5 | blind | A list over 1,000 results is reported as `complete: true` | low | Needs more than 1,000 open direct review requests. Not realistic for a user. | rejected |
| 6 | blind, edge | `timelineItems(last: 10)` can miss the viewer's own event | false | The frozen spec sets `last: 10` and says requester/requestedAt are omitted when no event matches. The code follows that. | rejected |
| 7 | blind | Sprint status says `in-progress` while the spec says `in-review` | false | Sprint status is synced at the workflow's present step. Not a defect in the change. | rejected |
| 8 | blind, verification | The `extension.ts` check wiring (401 retry, ticket and account guards) has no tests | medium | Verification-gap layer, pre-verified: removing the retry or either guard passes every test. | patch (retry); defer (ticket/account guards, temporary until Story 1.5's scheduler) |
| 9 | verification | `QueueView.render` keeping rows for the same account and clearing them for another is untested | medium | Pre-verified: changing the condition would pass every test. | patch |
| 10 | blind, verification | The "data + errors with an unreadable search" partial path is untested | medium | Pre-verified: no test reaches the branch at github.ts `normalized === undefined` with errors present. | patch |
| 11 | blind, verification | Skipped null nodes making a result incomplete are masked by errors in the only covering test | medium | Pre-verified: deleting the `skipped > 0` block passes every test. | patch |
| 12 | blind, verification | De-duplication across pages, the repeated-cursor stop and the page cap are untested | low | Pre-verified gap. The cases are cheap to add next to #10 and #11. | patch |
| 13 | blind | The `errors=N` summary under-counts incomplete causes | low | Every incomplete cause (page failure, skipped nodes, cursor stop) logs its own line, so the cause is visible. | rejected |
| 14 | blind | A cursor or page-limit stop is logged as "Page N+1 failed" for a page never requested | low | Confirmed at github.ts: it reuses `checkPageFailed(page + 1, …)`. A direct correction of a misleading log line for the spike run. | patch |
| 15 | blind | The `signed_out` FailureReason is never produced | false | The spec requires types exactly per AD-5/AD-13. The epic assigns `signed_out` to Connect recovery (Story 1.6). | rejected |
| 16 | blind | A failure with an undefined `accountId` clears rows | false | `runCheck` always sets `accountId`, so the condition is unreachable. | rejected |
| 17 | blind | "Waiting for the first check" can show next to rows after a same-account re-lookup | low | `renderChecking` replaces it right after `await setContext`. The flicker lasts milliseconds. | rejected |
| 18 | blind | The `checking copy shows no zero` test compares a constant to itself | low | Cosmetic test weakness. No behavior is at risk. | rejected |
| 19 | blind | The spike doc lacks sections for over 1,000 results, `last: 10`, and proxies | low | The spec lists the spike sections. The extra cases are covered by #5, #6 and VS Code's built-in proxy support for fetch. | rejected |
| 20 | edge | A transient `getSession` exception renders unconnected and clears rows | low | Same behavior as Story 1.1's `lookupSilently`. A rare provider failure. The fix would add a branch. | rejected |
| 21 | edge | A 401 on page 2 or later gives a partial ok and skips the retry | low | Needs the token revoked between pages within one check. The result is `complete: false`, which is safe. The fix would add a branch. | rejected |
| 22 | edge | An unexpected exception on page 2 or later discards page-1 items | low | Every per-page operation is already guarded, so this is practically unreachable. The spec maps unexpected exceptions to `graphql_error`. | rejected |
| 23 | edge | `res.text()` rejecting is reported as `graphql_error`, not `network` | low | A body stream failing mid-read is rare, and both reasons show "Couldn't check GitHub." The fix would add a branch. | rejected |
| 24 | edge | A missing `viewer` silently disables requester matching | low | An authenticated GraphQL `viewer` is never null in practice. | rejected |
| 25 | edge | A 403 secondary rate limit without a signal maps to `graphql_error` | false | The frozen spec defines the rate-limit signal exactly (`x-ratelimit-remaining: 0` or `retry-after`). The code follows it. | rejected |
| 26 | edge | GraphQL error messages are logged verbatim | false | The spec matrix says to log the error messages. The AC forbids only token, Authorization and PR titles, and messages are capped at 120 chars on one line. | rejected |
