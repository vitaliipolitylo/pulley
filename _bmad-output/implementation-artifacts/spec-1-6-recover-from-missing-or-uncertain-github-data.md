---
title: 'Story 1.6: Recover from missing or uncertain GitHub data'
type: 'feature'
created: '2026-09-30'
status: 'ready-for-dev'
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
- [ ] `src/core/connection.ts`, `viewModel.ts`, `copy.ts` -- per Always.
- [ ] `src/shell/auth.ts`, `scheduler.ts`, `queueView.ts`, `src/extension.ts`, `package.json` -- the retry, generation, Reconnect, and quiet updates.
- [ ] `test/core/viewModel.test.ts` -- one case per reason × {prior success, none}, plus: the clear copy includes the visibility sentence, and a stale count is never 0 without qualification.
- [ ] `test/shell/scheduler.test.ts` -- 401 → silent re-lookup once → retry; a generation change during a check discards the result (the `mutate` spy is not called).
- [ ] `test/smoke/queueView.test.ts` -- rendering the same model twice does not set `message` again (spy).

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

## Spec Change Log

## Review Triage Log
