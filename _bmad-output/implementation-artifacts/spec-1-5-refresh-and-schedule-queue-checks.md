---
title: 'Story 1.5: Refresh and schedule queue checks'
type: 'feature'
created: '2026-09-30'
status: 'done'
route: 'dispatch'
baseline_commit: 'c849e0920122444fec71b09c642890261a669527'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-4-understand-and-open-a-waiting-review.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pulley checks GitHub only once, at activation or Connect (the ad-hoc trigger from Story 1.2). The queue goes stale during a working session, and the user cannot force an update.

**Approach:** Add `src/shell/scheduler.ts`, which owns the AD-14 triggers (`activation`, `periodic`, `manual`, `session-changed`). It allows one in-flight check per window that later triggers join, adds shell-side jitter, and reads `pulley.checkIntervalMinutes`. Add a native **Refresh** action (`pulley.refresh`) and show the last successful check time in the queue.

## Boundaries & Constraints

**Always:**
- `createScheduler({ runCheck, getIntervalMs, random, setTimeout, clearTimeout, log })` has injected clock, timer, and randomness functions, so the join, jitter, and restart behavior can be unit-tested with fakes.
- `trigger(kind)`:
  - If a check is in flight, it returns that check's promise (join). Manual Refresh during a check joins it and does not queue a second check.
  - Non-manual kinds wait `random() * 60_000` ms first. A manual trigger during that wait cancels the wait and runs immediately.
- `periodic` uses a repeating timeout of `intervalMs`, re-armed after each check settles. It runs even if the view has never been opened.
- `pulley.checkIntervalMinutes`: `application` scope, number, default 15, minimum 5, maximum 240. The shell clamps out-of-range values. `onDidChangeConfiguration` restarts the timer, starting a fresh interval from the change, and does not trigger a check or change stored items.
- `runCheck` = silent session → `github.runCheck` → `store.mutate(reconcile, result, { intervalMs, … })`. The window's `checking` flag is set around it and passed to `viewModel`.
- `activation` triggers at `activate` (activation event `onStartupFinished`). `session-changed` is wired to the existing 1.1 `onDidChangeSessions` handler. Story 1.6 adds generation discarding.
- `pulley.refresh` has the `$(refresh)` icon and the title "Refresh review requests". It appears in `view/title` (`navigation` group) for `pulley.queue` when `pulley.connection == connected` and is also in the Command Palette. While checking, its handler joins, and no second progress indicator appears (`withProgress({ location: { viewId: 'pulley.queue' } })` wraps only the in-flight promise, once).
- `viewModel` message: pending → "{n} reviews are waiting. Last checked {time}". Clear → the clear sentence plus " Last checked {time}". `{time}` comes from an injected `ctx.formatTime(ms)` (the shell supplies `Intl.DateTimeFormat` with `timeStyle: 'short'`, adding a short date when the time is not today), so core stays clock-free.

**Never:**
- No timers, `Math.random`, or clock reads in `src/core/`.
- No `pulley.backlogThreshold` (Epic 2), no custom keyboard shortcut, and no product-specific placement setting.
- No check on view open or focus.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Double Refresh | 2× manual during one check | 1 `runCheck` call, both promises resolve together | N/A |
| Manual during jitter | periodic waiting 40 s, then manual | Runs now; the jitter timer is cancelled; 1 check | N/A |
| Interval change | 15 → 30 | Timer restarted at 30 min; no immediate check | N/A |
| Out of range | 2 or 999 | Clamped to 5 / 240 | Log once |
| Check throws | `runCheck` rejects unexpectedly | In-flight state is cleared and the next trigger works | Log; never unhandled |
| No session | trigger with no session | No network call; state stays unconnected | N/A |

</frozen-after-approval>

## Code Map

- `src/shell/scheduler.ts` (new) -- the triggers, join, jitter, and interval timer.
- `src/extension.ts` -- replace the 1.2 ad-hoc check with `scheduler.trigger('activation')`. Wire Connect success to `trigger('manual')`, because the user is waiting and must not see jitter; the `onDidChangeSessions` event that fires with it then joins that check. Wire other session changes to `trigger('session-changed')`, `pulley.refresh` to `trigger('manual')`, and configuration changes to the interval restart. Dispose timers in `deactivate`.
- `src/core/viewModel.ts`, `src/core/copy.ts` -- add the last-checked text and the `formatTime` context parameter.
- `package.json` -- `contributes.configuration` (the interval), the `pulley.refresh` command, and the `view/title` menu.

## Tasks & Acceptance

**Execution:**
- [x] `src/shell/scheduler.ts` -- per Always.
- [x] `src/extension.ts`, `package.json` -- wiring and contributions.
- [x] `src/core/viewModel.ts`, `src/core/copy.ts` -- the last-checked message.
- [x] `test/shell/scheduler.test.ts` -- vscode-free, with a fake timer and random functions. One case for each matrix row, plus jitter bounds (random 0 → 0 ms, random 0.999 → < 60 s) and "periodic re-arms after the check settles".
- [x] `test/core/viewModel.test.ts` -- last-checked text present only after `lastSuccessAt` exists, with a stub `formatTime`.
- [x] `test/smoke/activation.test.ts` -- extend it: `pulley.refresh` is registered and the configuration default is 15.

**Acceptance Criteria:**
- Given Pulley starts with the view closed and a session available, when activation completes, then a check starts within 60 s and stores its result, and the view shows "Checking review requests…" (not zero) until the first success.
- Given a successful check, when the view renders, then it shows "Last checked {time}". After a failed check, that time is unchanged.
- Given the Refresh button is pressed repeatedly during a check, then only one progress indicator and one GitHub request sequence occur.

## Verification

**Commands:**
- `npm run compile` -- expected: pass.
- `npm run test:core` -- expected: scheduler and viewModel cases pass.
- `npm test` -- expected: the smoke tests pass.

**Manual checks:**
- Set the interval to 5 in Settings, then watch the "Pulley" output channel log a periodic check about 5 minutes later (plus up to 60 s of jitter).

## Implementation Notes

- `createScheduler` keeps one in-flight promise and one jitter wait. Non-manual triggers during the wait join it. A manual trigger during the wait clears the jitter timer, runs now, and resolves the wait's promise when that check settles. The periodic timer is re-armed (clear, then arm) in the check's `finally`, so any check, including a manual one, starts a fresh interval. Nothing arms the timer before the first check settles; the activation trigger always settles. `restartInterval()` arms a fresh timer and starts no check. `dispose()` clears both timers and resolves a pending wait.
- Jitter is `floor(random() * 60_000)`, capped at 59 999 ms. `createIntervalReader` (in `scheduler.ts`) clamps to 5–240, treats non-numbers as 15, and logs once per distinct out-of-range value. `formatCheckTime(ms, now)` (also in `scheduler.ts`, vscode-free) is the shell's `formatTime`.
- `extension.ts`: the scheduler's `runCheck` first waits for the newest silent connection lookup (never the interactive Connect lookup, whose consent can stay open), so it reconciles into the right account; it holds the `checking` counter around the check and re-renders in `finally`. A no-session result sets `unconnected` only if no newer lookup has started. `pulley.refresh` wraps each distinct in-flight promise in `withProgress({ location: { viewId: 'pulley.queue' } })` once. After Connect's lookup settles, Connect waits for any newer silent lookup (the session event `createIfNone` fires) and triggers `manual` whenever the window is connected, whichever lookup won; `onDidChangeSessions` triggers `session-changed` after its lookup is applied. `deactivate` disposes the scheduler (it is also in `context.subscriptions`).
- The setting description lives in `copy.checkIntervalDescription` and is mirrored in `package.json`; `test/core/connection.test.ts` checks the mirror, the `view/title` menu, the setting schema, that there are no keybindings, and that `src/core` has no timers, `Math.random`, or clock reads.
- Pending messages with the incomplete hint read "{n} reviews are waiting. {incomplete hint} Last checked {time}". The stale message is unchanged (Story 1.6 owns it).

## Spec Change Log

## Review Triage Log

| # | Source | Location | Claim | Verdict | Evidence | Route |
|---|--------|----------|-------|---------|----------|-------|
| 1 | blind, edge (×2), verification-gap other | `src/extension.ts` connect handler | Connect skips the manual check when `onDidChangeSessions` supersedes its lookup ticket | medium | `getSession({createIfNone})` creates the session (firing the event) before resolving; the silent lookup takes a newer ticket, `apply(connect)` returns `undefined`, so only the jittered `session-changed` check runs (up to 60 s). | patch |
| 2 | edge | `src/extension.ts` `runQueueCheck` | A check started while the Connect consent/sign-in is open waits on that interactive lookup | medium | `apply(connect(...))` sets `latestLookup`; `runQueueCheck` awaits it, so the check stays in flight, every trigger joins it, and the periodic timer never re-arms until the user answers. | patch |
| 3 | blind, verification-gap | `src/shell/scheduler.ts` `formatCheckTime` | The real formatter has no test | low | Grep shows only the definition and its call; every viewModel test stubs `formatTime`, so a wrong same-day branch would pass. | patch |
| 4 | blind | `test/core/viewModel.test.ts` | "failed check after a success" test uses a failure older than the success | low | Fixture has `lastFailure.at: 4`, `lastSuccessAt: 5`, which renders `clear`; the AC's failure-after-success case is never exercised. | patch |
| 5 | blind, verification-gap | `test/shell/scheduler.test.ts`, `src/extension.ts` wiring | The No-session row and the extension wiring (refresh progress-once, connect, config restart, lookup wait) have no test where the behavior lives | low | The "No session" test wraps `checkWithRetry` directly; `runQueueCheck` and the `activate` closures run in no test. Closing it needs the wiring extracted into a testable factory. | defer |
| 6 | blind | `src/core/viewModel.ts` stale branch | Stale message has no "Last checked" time | false | Out of scope for 1.5: Story 1.6 owns the stale copy ("…from {time}."), per epic-1-context and spec-1-6. | reject |
| 7 | blind | `src/shell/scheduler.ts` `armPeriodic` | Real period is interval + jitter + check duration | false | This is the spec's own design (re-arm after settle, jitter on non-manual triggers); the fix would edit this spec. | reject |
| 8 | blind | scheduler, per window | Every window polls independently | false | AD-14 defines one in-flight check per window with jitter as the spread; cross-window coordination is not in the intent. | reject |
| 9 | blind | `package.json` commandPalette | Refresh shows in the palette while unconnected | low | Spec asks for it in the palette; running it unconnected does a silent lookup and stays unconnected. Harmless; gating it is a spec change. | reject |
| 10 | blind | `src/shell/scheduler.ts` `createIntervalReader` | Non-number value logged as "out of range"; range hard-coded in copy | low | True, but settings UI validates type; fixing needs a new branch and copy string. | reject |
| 11 | blind, edge | `src/extension.ts` lifecycle | Restart log on unchanged value; double dispose path; check may write/render after dispose | low | Dispose is idempotent; a post-deactivate write happens only at shutdown mid-check and goes to the same globalState. Rare, fix adds guards. | reject |
| 12 | edge | `src/core/viewModel.ts` `lastChecked` | Non-finite/out-of-range `lastSuccessAt` throws RangeError in `Intl.DateTimeFormat` | low | `lastSuccessAt` is only written by reconcile from `Date.now()`; reaching it needs corrupted storage. Fix adds a guard. | reject |
| 13 | edge | `src/extension.ts` `apply` | A rejected `render()` would leave `latestLookup` rejected and break later checks | low | `lookup` never rejects; `QueueView.render` rejecting is not shown to happen. Fix adds a guard. | reject |
| 14 | edge (×2) | `src/extension.ts` `runQueueCheck` | A lookup started after the check began is not awaited, so a result can be dropped as wrong-account | low | Reconcile rule 1 drops it correctly and the next trigger recovers; session-generation discarding is Story 1.6's scope. | reject |
