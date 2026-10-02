---
title: 'Epic 1 review fixes: fetch safety and state correctness'
type: 'bugfix'
created: '2026-10-02'
status: 'done'
route: 'dispatch'
baseline_commit: '460b9c0aaad735d9b2fcb509ef20af6434eb4286'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/review-epic-1-2026-10-02.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Epic 1 review found malformed, stalled, truncated, or out-of-order data that Pulley treats as trustworthy. It can delete requests that were never fetched, falsely say the queue is clear, overwrite newer data with older data, hide a newer failure, crash rendering on bad stored values, or hang checking forever.

**Approach:** Tighten the GitHub adapter so uncertain results are incomplete or failures. Validate stored timestamps and failure reasons in migration. Make reconcile and the view model prefer the newest evidence. Show a failed state write in the view instead of only logging it.

## Boundaries & Constraints

**Always:** Core stays pure and clock-free with no `vscode` import, and `src/shell/github.ts` stays `vscode`-free and never throws. Every fix has a `test:core` unit test. Stored schema stays v1 with no new persisted fields. All user-facing strings live in `src/core/copy.ts`.

**Never:** Activation smoke-test seams or startup and session-change smoke tests (deferred). The live-query spike (deferred). Partitioning the search to get past 1,000 results. Retrying a later-page failure.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior |
|----------|--------------|---------------------------|
| Bad pagination | `pageInfo: {}` or non-boolean `hasNextPage` | Page treated as unreadable: page 1 → `graphql_error` failure; later page → `complete:false` |
| Stalled request | fetch or `text()` never settles | After the timeout (default 30 s, injectable), `network` failure on page 1 / incomplete later; nothing hangs |
| Later-page 401 | page 1 ok, page ≥2 HTTP 401 | `ok:false, reason:'unauthenticated'` so `checkWithRetry` retries and can offer Reconnect |
| Search cap | `search.issueCount > 1000` | `complete:false`, logged; absent or non-numeric `issueCount` is ignored |
| Newer incomplete empty | `lastSuccessAt=5`, `lastIncompleteFetchStartedAt=9`, no items | Not `clear`: falls through to the loading/incomplete branch, `count:null` |
| Bad stored timestamp | v1 account with `lastSuccessAt:'x'`, `Infinity`-like, or outside ±8.64e15 (also `lastAttemptAt`, `lastAppliedFetchStartedAt`, `lastIncompleteFetchStartedAt`) | `migrate` reports malformed → empty v1 (existing path); no render exception |
| Bad stored failure | `lastFailure` not an object, bad `at`, or `reason` outside `FailureReason` | Same malformed path |
| Older success after newer incomplete | existing item; success at 4 applied after incomplete at 9 | Existing item metadata unchanged; new ids still added; bookkeeping and deletion guard unchanged |
| Older failure after newer failure | `lastFailure.at=9`, failure result at 4 | `lastFailure` stays `{at:9}`; attempt fields still recorded |
| State write rejects | `store.mutate` throws in `applyResult` | Window flag set; view shows `stale` (rows + last success time) or unavailable, action `refresh`, write-failure copy; flag clears on the next successful apply |

**Decision (write-failure copy):** reuse the existing stale/unavailable lead and add a new hint, "Pulley couldn't save the latest check. Refresh to try again." For example: "Couldn't check GitHub. Showing the last known requests from {time}. Pulley couldn't save the latest check. Refresh to try again."

**Decision (scope/size):** keep the full spec at about 1,800 tokens. The human accepted going over the guideline.

</frozen-after-approval>

## Code Map

- `src/shell/github.ts` -- `normalizePage` L138-162 (hasNextPage coercion L159); `fetchPage` L178-213 (no timeout); `runCheck` page-failure branch L277-284 (later 401 → partial); `QUERY` L14 (add `issueCount`); `FetchLike` L48 (add optional `signal`); `RunCheckInput` (add optional `timeoutMs`).
- `src/core/migrate.ts` -- `v1Problem` L22-37: extend account checks; keep returning a problem string.
- `src/core/reconcile.ts` -- `applySuccess` upsert loop L53-56; failure branch L93-96.
- `src/core/viewModel.ts` -- `WindowView` (add optional `writeFailed?: boolean` so existing tests compile); clear branch L140-141; stale branch L120-130 shows the shape to reuse.
- `src/core/copy.ts` -- add the write-failure hint and the search-capped log line, next to `checkPagingStopped`.
- `src/extension.ts` -- `applyResult` L80-94: set/clear window `writeFailed`, pass it in `render` L64-68.
- Tests: `test/shell/github.test.ts` (`page()` helper L68 has `extra`), `test/core/{migrate,reconcile,viewModel}.test.ts` (`win()` helper L12).
- Do not change: `store.ts` contract, `checkWithRetry.ts` (it already retries `unauthenticated`), scheduler.

## Tasks & Acceptance

**Execution:**
- [x] `src/shell/github.ts` -- reject non-boolean `hasNextPage`; abort with `AbortController` and race a cleared timer over fetch and body read (`RunCheckInput.timeoutMs`, default 30_000); fail the whole check on `unauthenticated` from any page; request `issueCount` and mark >1000 incomplete with a log line -- adapter gaps (review A).
- [x] `src/core/copy.ts` -- add the write-failure hint (see decision) and the `checkSearchCapped` log line.
- [x] `src/core/migrate.ts` -- validate the four timestamp fields (finite number, |x| ≤ 8.64e15) and `lastFailure` (`at` valid, `reason` in the five reasons).
- [x] `src/core/reconcile.ts` -- skip upsert of existing ids when `at < lastIncompleteFetchStartedAt`; keep the newer `lastFailure`.
- [x] `src/core/viewModel.ts` -- no `clear` when a newer incomplete check exists; a `writeFailed` branch (connected with an account, or no account → unavailable) returns `stale`, action `refresh`.
- [x] `src/extension.ts` -- track `writeFailed` in window memory around `store.mutate` in `applyResult`; include it in `render`.
- [x] `test/shell/github.test.ts`, `test/core/migrate.test.ts`, `test/core/reconcile.test.ts`, `test/core/viewModel.test.ts` -- one test per matrix row.

**Acceptance Criteria:**
- Given any matrix row, when its unit test runs, then the expected behavior holds and the test fails if the guard is removed.
- Given the full suite, when run, then all existing tests still pass unchanged, apart from fixtures that need `issueCount` or a boolean `hasNextPage`.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route / evidence |
|---|--------|---------|---------|------------------|
| 1 | blind, edge, vgap-other | `writeFailed` is window-wide and not reset when the active account changes (`src/extension.ts:49`) | medium | patch: `apply()` changes `connection` without touching the flag, so account B shows A's save error until B's check saves |
| 2 | edge | A no-op mutate (rule 1 drops another account's result) clears `writeFailed` | low | rejected: needs an other-account result to pass the generation guard in `createQueueCheck` after a write failure, which is unlikely; the fix adds a branch |
| 3 | edge | Another window saving newer data does not clear `writeFailed` | low | rejected: needs a rare write failure plus a concurrent window; the next local save clears it; the fix adds cross-state tracking |
| 4 | edge | `writeFailed` hides the Checking state while a retry is in flight | low | rejected: the existing `lastFailure` stale branch behaves the same way, and Refresh shows its own progress indicator |
| 5 | blind | The write-failure lead says "Couldn't check GitHub" and hides the reason's hint and action | false | the copy is the human's frozen decision. Unauthenticated hits the earlier `unconnected` branch, signed_out yields no result, and every other reason's action is already `refresh` |
| 6 | blind, edge (x2) | The reconcile guard skips every existing id, not only ids the incomplete result wrote; the comment overstates it | low | patch (comment only): the behavior matches the frozen matrix row. A per-item timestamp would change the schema, which the boundaries forbid; it self-heals on the next newer complete check |
| 7 | blind | Item `firstSeenAt`/`requestedAt` are not range-validated in migrate | low | rejected: `formatRequestAge` already guards non-finite values and `byAge` cannot throw, so the worst case is odd ordering of corrupt rows |
| 8 | blind | One bad account field wipes every account | low | rejected: the frozen matrix row picks the existing malformed path |
| 9 | blind | `Infinity`/`NaN` migrate cases cannot occur via JSON | low | rejected: harmless extra coverage |
| 10 | blind | Over 1,000 results gets no user-facing explanation | low | rejected: a user with more than 1,000 open direct review requests is implausible; the matrix specifies a log line |
| 11 | blind, edge | The timeout bounds each page, not the whole check; `timeoutMs` 0/NaN is not validated | false | the only production caller omits `timeoutMs` (default 30 s); a trickling 40-page stall is not demonstrated |
| 12 | blind | Non-2xx response bodies are not cancelled | low | rejected: the code before this change also never read non-2xx bodies; `ResponseLike` has no body handle |
| 13 | blind | deferred-work entries say `source_spec: none` | false | step 1 split them before this spec existed and wrote `source_spec: none` as the workflow prescribes |
| 14 | blind | No test for a later-page 401 through `checkWithRetry`, nor for writeFailed with rows but no success | low | rejected: each half is unit-tested (`later-page HTTP 401 → ok:false unauthenticated`, checkWithRetry retry tests) |
| 15 | blind | Test label "NaN-like null" is misleading | low | patch: direct rename |
| 16 | vgap, blind, edge | The "fast response clears its timer" test cannot fail | medium | patch: node:test does not fail on pending timers; assert the captured signal is not aborted after waiting past a short timeout |
| 17 | vgap | The production `DEFAULT_TIMEOUT_MS` is never pinned | medium | patch: changing the default to 30 ms passes every test |
| 18 | vgap, blind, edge | Setting and clearing `writeFailed` in `applyResult` has no test | medium | defer: pre-verified gap; needs the `activate` injection seam the intent deferred |

## Design Notes

Timeout: a fake fetch may ignore `signal`, so race the request (and `text()`) against a timer promise that also calls `controller.abort()`, and clear the timer in `finally`. Pass `signal` in `init`; real `fetch` honors it.

## Verification

**Commands:**
- `npm run test:core` -- expected: all pass, new tests included
- `npm run check-types` -- expected: no errors
- `npm run lint` -- expected: no errors
