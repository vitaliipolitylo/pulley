---
title: 'Story 1.5: Refresh and schedule queue checks'
type: 'feature'
created: '2026-09-30'
status: 'ready-for-dev'
route: 'dispatch'
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
- [ ] `src/shell/scheduler.ts` -- per Always.
- [ ] `src/extension.ts`, `package.json` -- wiring and contributions.
- [ ] `src/core/viewModel.ts`, `src/core/copy.ts` -- the last-checked message.
- [ ] `test/shell/scheduler.test.ts` -- vscode-free, with a fake timer and random functions. One case for each matrix row, plus jitter bounds (random 0 → 0 ms, random 0.999 → < 60 s) and "periodic re-arms after the check settles".
- [ ] `test/core/viewModel.test.ts` -- last-checked text present only after `lastSuccessAt` exists, with a stub `formatTime`.
- [ ] `test/smoke/activation.test.ts` -- extend it: `pulley.refresh` is registered and the configuration default is 15.

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

## Spec Change Log

## Review Triage Log
