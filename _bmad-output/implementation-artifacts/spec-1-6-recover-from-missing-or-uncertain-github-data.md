---
title: 'Story 1.6: Recover from missing or uncertain GitHub data'
type: 'feature'
created: '2026-09-30'
status: 'done'
baseline_commit: 'e816bd29811f5bbcd5f1b4a82352acc8074e2fe7'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-5-refresh-and-schedule-queue-checks.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Failures are recorded (Story 1.3), but the user sees only a generic stale line. An expired token has no Reconnect path, a 401 is final on the first try, a session switch mid-check can apply the old account's result, and the view can re-announce an unchanged state on every poll.

**Approach:** Finish the AD-11/AD-13 recovery model:
- Map each failure reason to one message and action.
- Add Reconnect.
- Retry a silent session lookup once on 401.
- Add a per-window session generation so that results from before an account change are discarded.
- Make the stale, unavailable, and clear copy precise.
- Keep screen-reader output quiet when nothing changed.

## Boundaries & Constraints

**Always:**
- Window connection state is `{ kind: 'unconnected', reason: 'signed_out' | 'unauthenticated' } | { kind: 'connected', accountId, label, generation }`. `signed_out` means the silent lookup returns no session. `unauthenticated` means a 401 persisted after one silent re-lookup (the scheduler calls `getSession` silently again and retries the check once with the returned token; the reason stays `unauthenticated` even if that lookup returns the same token).
- `unauthenticated` keeps `activeAccountId`, so the account's stored rows stay visible as stale. `signed_out` renders no rows.
- Action mapping in `copy.ts`, with one message and one action each:
  - `signed_out` → Connect (existing welcome content).
  - `unauthenticated` → Reconnect. A second `viewsWelcome` entry (`when: pulley.connection == unauthenticated`) runs `pulley.connect`, which in this state calls `getSession(..., { forceNewSession: { detail: <copy> } })`. Because of the stale rows the welcome is hidden, so Reconnect is also offered as a `view/title` action and in the stale message.
  - `network`, `rate_limited`, `graphql_error` → Refresh.
- Messages:
  - Stale after a prior success: "Couldn't check GitHub. Showing the last known requests from {time}." plus a reason hint (for example, "GitHub rate limit reached.").
  - Failure with no prior success: "Couldn't check GitHub, so the queue is unavailable." No count and no clear state.
  - `count` is `null` whenever status is not `pending` or `clear`.
- Generation: `onDidChangeSessions` (github) → silent lookup → set `activeAccountId`, `generation++`, `trigger('session-changed')`. `runCheck` captures the generation at start and drops (logs) its result without calling `store.mutate` if the generation changed. An account switch never renders the previous account's rows.
- Quiet updates: `TreeView.message` and the context keys are set only when their value changes (the existing deep-equal guard). The status text is never re-set with an identical string, so no new live-region announcement happens.

**Never:**
- No sign-in prompt except from an explicit Connect or Reconnect, and no token persisted or logged.
- A failure never sets `clear`, never deletes items, and never advances `lastSuccessAt` (these are the 1.3 rules; keep them).
- No notification on failure or recovery.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Expired token | 401, silent retry → 401 | `unauthenticated`; stale rows + Reconnect | Log "401 after retry" |
| Transient 401 | 401, retry succeeds | Normal success; no failure recorded | Log retry |
| Offline after success | network | Rows kept, stale message with time, Refresh | N/A |
| Failure before any success | rate_limited | "unavailable" message, no rows, no zero | N/A |
| Account switch mid-check | gen 3 check in flight; switch → gen 4 | Gen-3 result discarded; gen-4 check shows only the new account | Log discard |
| Sign out | session removed | `signed_out` welcome with Connect; no rows | N/A |
| Recovery to empty | complete success, 0 items | Clear sentence + last checked; stale cleared | N/A |
| Unchanged poll | Same model twice | No `TreeView.message` / tree refresh call | N/A |

</frozen-after-approval>

## Code Map

- `src/core/connection.ts` (1.1) -- the reasoned unconnected state.
- `src/core/viewModel.ts`, `src/core/copy.ts` -- per-reason messages and actions, unavailable vs stale, `count` nulling.
- `src/shell/auth.ts` -- `connect({ force })` using `forceNewSession`, and the generation counter.
- `src/shell/scheduler.ts` / `src/extension.ts` -- 401 retry-once, generation capture and discard.
- `src/shell/queueView.ts` -- update only on change; set the `pulley.connection` context key to `unconnected`, `unauthenticated`, or `connected`.
- `package.json` -- the second `viewsWelcome` entry and a Reconnect `view/title` action (`$(account)`, "Reconnect GitHub", `when: pulley.connection == unauthenticated`).

## Tasks & Acceptance

**Execution:**
- [x] `src/core/connection.ts`, `viewModel.ts`, `copy.ts` -- per Always.
- [x] `src/shell/auth.ts`, `scheduler.ts`, `queueView.ts`, `src/extension.ts`, `package.json` -- the retry, generation, Reconnect, and quiet updates.
- [x] `test/core/viewModel.test.ts` -- one case per reason × {prior success, none}, plus: the clear copy includes the visibility sentence, and a stale count is never 0 without qualification.
- [x] `test/shell/scheduler.test.ts` -- 401 → silent re-lookup once → retry; a generation change during a check discards the result (the `mutate` spy is not called).
- [x] `test/smoke/queueView.test.ts` -- rendering the same model twice does not set `message` again (spy).

**Acceptance Criteria:**
- Given no usable session at startup, when the view opens, then it shows the account-scoped signed-out explanation and Connect, and no zero and no sign-in dialog.
- Given an expired session with stored rows, when Reconnect succeeds, then a check runs immediately and replaces the stale state with pending or clear.
- Given a screen reader on the Pulley view, when three background polls return identical results, then nothing is re-announced.

## Verification

**Commands:**
- `npm run compile` -- expected: pass.
- `npm run test:core` -- expected: all reason and generation cases pass.
- `npm test` -- expected: the smoke tests pass.

**Manual checks:**
- Go offline and Refresh: stale with the time. Sign out from the Accounts menu: Connect. Revoke the OAuth app on github.com and Refresh: Reconnect.

## Implementation Notes

- `ConnectionState` keeps `{ kind: 'unknown' }` for the startup lookup. The `unauthenticated` variant carries optional `accountId`/`label` so the account stays active; `activeAccountId(connection)` (core) returns it for `connected` and `unauthenticated`. Auth lookups return `SessionLookup` (no generation); `extension.ts` stamps the generation when it applies a lookup.
- `copy.ts`: `failureCopy` maps each `FailureReason` to one hint and one action; `failureMessage(reason, time?)` builds the stale ("…from {time}.") or unavailable message plus the hint. `ViewModel` gained `reason` (unconnected only) and `action` (unconnected and stale). Stale and unavailable both use status `stale` with `count: null`.
- Unauthenticated with rows: status `unconnected`, reason `unauthenticated`, rows kept, message = stale/unavailable + the Reconnect hint. With no rows the message is unset so the Reconnect welcome content shows.
- Reconnect is a separate command `pulley.reconnect` ("Reconnect GitHub", `$(account)`) for the `view/title` action (and the palette when unauthenticated); it runs the same handler as `pulley.connect`, which uses `forceNewSession: { detail }` when the window is unauthenticated. A cancelled Reconnect keeps the unauthenticated state. The welcome link runs `pulley.connect`.
- `createQueueCheck` (in `scheduler.ts`, vscode-free) is the scheduler's `runCheck`: wait for silent lookups, capture the generation, `checkWithRetry` (401 → one silent re-lookup → one retry), then apply only if the generation is unchanged. A discarded result is logged and the check runs again for the new generation (at most `MAX_GENERATION_ATTEMPTS` = 3 in total), so a `session-changed` or Connect trigger that joined the in-flight check still gets a current result.
- `SessionGeneration` (in `auth.ts`) advances on every applied lookup (activation, Connect/Reconnect, session change). A success for the account while unauthenticated returns the window to `connected` without advancing it.
- `QueueView` sets `pulley.connection` to `unconnected`, `unauthenticated`, or `connected`; the deep-equal and same-string guards are unchanged. Note: the pending/clear message includes "Last checked {time}" (Story 1.5), so a successful poll in a new minute changes the string and is re-set once; identical models and failed polls (stale time is the last success) are not re-set.

## Spec Change Log

## Review Triage Log

| # | Source | Location | Finding | Verdict | Evidence | Route |
|---|--------|----------|---------|---------|----------|-------|
| 1 | verification-gap, blind-hunter | src/extension.ts `applyResult` | Connection transitions after a check (signed_out / unauthenticated keeps account / reconnect on success) untested | medium | Pre-verified gap: tests stub `apply` or hand-build the connection; dropping `accountId` passes all tests | patch |
| 2 | verification-gap (x2), blind-hunter | src/extension.ts `connectOrReconnect`; test/smoke/activation.test.ts | Force choice and cancelled-Reconnect mapping untested; activation test only checks registration | medium | Pre-verified gap: hard-coding `force = false` passes all tests | patch |
| 3 | blind-hunter | src/core/types.ts `ViewModel.reason` | Repeats `UnconnectedReason` inline | low | Two sources of truth for the reason union; direct correction | patch |
| 4 | blind-hunter | test/smoke/queueView.test.ts | Test name says connected/unconnected though the key now has three values | low | Name out of date; direct rename | patch |
| 5 | blind-hunter | src/core/viewModel.ts stale branch | "Showing the last known requests from {time}" over an empty tree | false | The last known set at that time is empty and is what is shown; this is the frozen copy for stale-after-success, with no count or clear claim | reject |
| 6 | blind-hunter, edge-case-hunter | src/core/viewModel.ts stale/unauthenticated branches | "Unavailable" shown next to rows from incomplete-only checks | low | Real only after a partial check followed by a failure, with no complete success ever; rare, and the fix adds a branch/copy variant | reject |
| 7 | blind-hunter, edge-case-hunter | src/extension.ts `applyResult` label | Unauthenticated/connected state may carry another account's or an empty label | false | `ConnectionState.label` is never rendered or logged (grep: only set, never read), so no visible outcome | reject |
| 8 | edge-case-hunter | src/extension.ts `applyResult` | 401 result with no accountId leaves an account-less unauthenticated state | false | `runCheck` always returns the `accountId` it was given (src/shell/github.ts:234, 311) | reject |
| 9 | edge-case-hunter | src/extension.ts `applyResult` | Unauthenticated for A while silent token is B: B's success dropped | false | A session switch to B fires onDidChangeSessions, whose applied lookup sets connected(B) and bumps the generation | reject |
| 10 | blind-hunter, edge-case-hunter | src/extension.ts `apply` | Generation advances on every applied lookup even when the account is unchanged, causing refetches | low | Matches the frozen rule "onDidChangeSessions → … generation++"; cost is one refetch for an event during a short check; rare | reject |
| 11 | blind-hunter, edge-case-hunter | src/shell/scheduler.ts `createQueueCheck` | Give-up after 3 discards leaves joined triggers without a result until the next tick | low | Needs three session changes across consecutive check windows; logged; next periodic check recovers | reject |
| 12 | blind-hunter | src/extension.ts / scheduler | Periodic checks keep sending two rejected requests while unauthenticated | low | Two requests per interval (default 15 min) is negligible and lets the window recover if the session is fixed elsewhere | reject |
| 13 | blind-hunter | src/extension.ts session-change handler | Unrelated session event flips unauthenticated to connected until the next 401 | low | Frozen rule applies every silent lookup; the session-changed check right after it restores unauthenticated within the jitter window | reject |
| 14 | edge-case-hunter | src/core/viewModel.ts stale branch | Connected window with a stored `unauthenticated` failure shows the Reconnect hint while Reconnect is hidden | low | Only for another window on the same revoked session or briefly after a reconnect; the next check corrects it; fix adds a connection-dependent branch | reject |
| 15 | verification-gap, edge-case-hunter | src/extension.ts `apply` tickets | A cancelled Reconnect's ticket swallows an in-flight silent lookup | low | Needs a silent lookup already in flight when Reconnect is pressed and then cancelled; the sign-in's own session event starts after the ticket; fix adds ticket-guard complexity | reject |
| 16 | blind-hunter | src/core/copy.ts `failureCopy.signed_out` | Hint never reachable in the stale path | false | The spec requires the signed_out → Connect mapping; its `action` is used by the signed-out view model | reject |
| 17 | blind-hunter | package.json viewsWelcome | Reconnect welcome runs `pulley.connect` not `pulley.reconnect` | false | Frozen spec says the welcome runs `pulley.connect`; the handler forces whenever the window is unauthenticated, which is the only time that welcome shows | reject |
| 18 | blind-hunter | diff scope | Spec and sprint status not in the diff | false | Excluded on purpose; the spec is the claims file given to the edge-case layer | reject |
