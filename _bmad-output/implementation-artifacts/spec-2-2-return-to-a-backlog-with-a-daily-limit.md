---
title: 'Story 2.2: Return to a backlog with a daily limit'
type: 'feature'
created: '2026-10-02'
status: 'done'
baseline_commit: '8c549d19d9da88b475d0a81afe57b51a3df192a7'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-1-get-one-useful-alert-for-a-new-request.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** After Story 2.1, backlog items (first connection, VS Code closed, long gaps) are stored silently. A developer returning to VS Code gets no signal that reviews are waiting.

**Approach:** `reconcile` sets `backlogAlert` pending per AD-8, either as a first-connection alert or as at most one ongoing reminder per local day. Story 2.1's focus-gated `deliverPending` emits one `notifyBacklog`, and the notifier shows the count plus a gentle line chosen deterministically from the day.

## Boundaries & Constraints

**Always:**
- **New ctx fields:** `ReconcileCtx` gains:
  - `today` (local `YYYY-MM-DD`, from a vscode-free shell helper `localDate(ms)` in `src/shell/scheduler.ts`);
  - `startupReminderDue` (window memory: `true` at `activate`; cleared only as described under **Flag clearing**).
- **Final signatures (B1, A4):** `deliverPending(accountId, account, { focused, today })` and `windowFocused(stored, undefined, { activeAccountId, today })`. The shell computes `today` for every mutate ctx.
- **Reminders are decided only on complete applied successes (complete-only).** An applied success is one past rules 1 and 4.
- **First connection (A3):** `result.ok && result.complete && previous.lastSuccessAt === undefined` ("previous" = before this result). With at least one item stored afterwards, it sets `backlogAlert = { state: 'pending', firstConnection: true }` and `lastBacklogReminderDate = today`, whatever the threshold. With zero items, there is no alert. Incomplete successes before that point store items as backlog (Story 2.1's baseline predicate) with no alert. A later item found by an ordinary check is new (Story 2.1).
- **Ongoing reminder:** after a complete applied success that is not a first connection, if `backlogAlert` is not pending, items exist, `lastBacklogReminderDate !== today`, and either `ctx.startupReminderDue` is set or this result added an item classified backlog by the gap or missing-prior-attempt branch of the baseline predicate (X8), set `backlogAlert = { state: 'pending', firstConnection: false }` and `lastBacklogReminderDate = today`.
- **A pending alert is never replaced (A5):** no reminder is decided while `backlogAlert` is pending, so `firstConnection: true` survives midnight.
- **What never changes the reminder decision (A2, E2, X1):**
  - Failures never change the queue, `newSignal`, or reminder decisions: they never set `backlogAlert` pending and never change `lastBacklogReminderDate`.
  - A rule-4 no-op changes only the attempt fields (rule 2), and never decides a reminder.
  - Incomplete successes never decide a reminder.
  - `deliverPending` still runs after all of these and may deliver an alert that is already pending. These invariants govern queue changes and reminder decisions, not delivery.
- **Flag clearing (A6, E4):** `TransitionResult` gains an optional `report`, and `store.mutate` resolves to the transition's `report` after the write and effects, and also when a same-reference result skips the write (`undefined` in read-only mode). It rejects on a write failure, per the store contract, so the flag stays set. `reconcile` reports `{ reminderEvaluated: boolean }`, true only for a complete applied success on the active account. The shell clears `startupReminderDue` only when `reminderEvaluated` is true. The flag stays set after rule-1 rejection, rule-4 no-ops, incomplete successes, read-only mode, write failures, and failures.
- **Debug Seed (B4):** debugSeed passes `startupReminderDue: false` and never clears the flag.
- **Delivery:** `deliverPending` also handles `backlogAlert`.
  - When the alert is pending, the window is focused, and items exist, it becomes `{ state: 'shown', firstConnection }` in the same write, `lastBacklogReminderDate` becomes the delivery day (`ctx.today`, A4), and it emits `notifyBacklog { accountId, count: item count, firstConnection }`.
  - When it is pending with zero items, it becomes `'none'` and nothing is emitted, whether or not the window is focused (an exception to Story 2.1's unfocused same-reference rule). `lastBacklogReminderDate` keeps the decision day.
  - When unfocused with items, it stays pending for `windowFocused`.
  - First-connection backlog items never produce `notifyNew`.
- **Notification copy:** `copy.backlogNotification(count, today)` = `copy.pending(count)` + `' '` + `backlogLine(today)`.
  - `backlogLine` picks from `copy.backlogLines` by a deterministic hash of the `today` string.
  - The four draft lines are:
    - "The corgi is keeping them warm for you."
    - "No rush. They'll be here when you're ready."
    - "One at a time is plenty."
    - "The corgi saved your place in line."
  - The notifier gets `today` from the shell when it runs the effect.
- **Notification action (decided):** one button, `copy.openReviewQueue` = "Open Review Queue", that runs `pulley.queue.focus` to reveal the queue. Dismissing changes nothing. The notifier does not await the message inside the store queue. A failed submission follows Story 2.1's at-most-once rule, logging the count only.
- **Validation:** `v1Problem` rejects a `backlogAlert` that is neither `'none'` nor `{ state: 'pending'|'shown', firstConnection: boolean }`, and a `lastBacklogReminderDate` that isn't `YYYY-MM-DD`.

**Never:**
- No reminder decided by the threshold, the mascot, or a timer.
- Dismissing the notification resets nothing.
- No second aggregate notification on the same local day for an account, from any window or any number of checks, outside the accepted cross-window race (Design Notes, B3).
- No shame, productivity score, or escalation in copy.
- No `schemaVersion` bump.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First connection, items | First complete success, 3 items, focused | `notifyBacklog {3, true}`, no `notifyNew`, `lastBacklogReminderDate` = today | N/A |
| First connection, empty | First complete success, 0 items | No alert; a later ordinary check adding X → `notifyNew X` | N/A |
| Incomplete before baseline (A3) | Two incomplete successes, then a complete one | Items backlog, no alert until the complete success, which alerts once `{n, true}` | N/A |
| Closed / gap | Complete gap success (> 2×interval) adds Y; date ≠ today | Y backlog, `notifyBacklog`; no `notifyNew Y` | N/A |
| Gap, same day | Gap adds Y; date = today | Y backlog, no notification | N/A |
| Next-day startup | `startupReminderDue`, items, date = yesterday | One `notifyBacklog {n, false}`; flag cleared | N/A |
| Same-day startup | `startupReminderDue`, date = today | Nothing; flag cleared | N/A |
| Failed startup check | Failure while `startupReminderDue` | Only attempt fields and `lastFailure` change; flag stays set; a later complete success reminds | Stale view per Epic 1 |
| Partial startup (E4) | Incomplete success while `startupReminderDue` | No reminder; `reminderEvaluated` false; flag stays set | Partial error per Epic 1 |
| Rule-1 / rule-4 / read-only (A6) | `startupReminderDue`; result dropped, stale, or read-only store | No reminder; flag stays set | N/A |
| Focused failure, pending (A2, E2) | `backlogAlert` pending; a failure applies, focused | Queue unchanged; pending alert delivered once | Failure recorded per rule 3 |
| Continuous session | Next day, no flag, no gap | No reminder | N/A |
| Second window | Window B starts after A reminded today | Nothing | N/A |
| Unfocused | Pending reminder, unfocused | Stays pending; focus delivers once | N/A |
| Pending at midnight, then startup (A4, E3) | Pending `{false}` decided on D, unfocused; on D+1 focus delivers; then a startup on D+1 | One `notifyBacklog` on D+1, date = D+1; the startup on D+1 shows nothing | N/A |
| Pending first connection, next-day success (A5) | `{pending, true}` from D; complete success on D+1 with `startupReminderDue` | Alert stays `{pending, true}`; focus delivers `{n, true}` once; date = D+1 | N/A |
| Emptied | Pending reminder decided on D, items gone at delivery (focused or not) | `backlogAlert` → `'none'`, no notification; date stays D, so D gets no further reminder | N/A |
| Debug Seed (B4) | `startupReminderDue` set; Debug Seed runs | Flag unaffected | N/A |
| Rotation | Same `today` twice / different day | Same line / deterministic pick | N/A |

</frozen-after-approval>

## Design Notes

**Complete-only reminders (accepted):** first-connection, startup, and gap reminders are decided only on complete applied successes, and `reminderEvaluated` is true only for those. A persistent partial GraphQL error (for example an SSO organization the token isn't authorized for) therefore gives no reminder until a complete check succeeds. A gap item added by an incomplete check is not re-counted by the next complete check. This avoids reminding against a queue Pulley knows is incomplete, and avoids re-arming a first-connection alert on every partial check.

**Delivery-day accounting (A4, A5, E3):** delivery sets `lastBacklogReminderDate` to the day the notification actually appears, and no reminder is decided while one is pending. Together these mean every aggregate notification on day D leaves the date at D, so no second one can be decided on D in that window.

**Emptied reminder uses up the day (accepted):** when a pending reminder empties before delivery, it becomes `'none'` and the date keeps its decision day, so that day gets no reminder even if new backlog items arrive later. Nothing was waiting at that point, and the next day's startup or gap reminds as usual.

**Cross-window race (B3):** Story 2.1's accepted stale-write race (E1) also applies to `backlogAlert`: two windows inside the `globalState` sync window can both deliver one reminder. The daily limit holds within a window and across windows that aren't racing.

## Code Map

- `src/core/reconcile.ts` -- first-connection and ongoing rules inside the complete success path. `applySuccess` must report whether it added a gap or missing-prior-attempt backlog item; return it alongside the account. Return `report: { reminderEvaluated }`.
- `src/core/types.ts` -- `TransitionResult.report?`; `notifyBacklog.accountId`.
- `src/core/windowFocused.ts` -- `deliverPending` gains the backlog branch and `today`, shared by `reconcile`; `windowFocused` ctx gains `today`.
- `src/core/copy.ts` -- `backlogLines`, `backlogLine(today)`, `backlogNotification`, and `log.notifiedBacklog(count)`.
- `src/core/migrate.ts` -- `backlogAlert`/date validation.
- `src/shell/store.ts` -- `mutate` resolves to the transition's `report`.
- `src/shell/scheduler.ts` -- `localDate(ms)` (local calendar; tests use a fixed TZ-independent construction).
- `src/shell/notifier.ts` -- the `notifyBacklog` branch; inject `today()`.
- `src/extension.ts` -- the `startupReminderDue` flag, plus `today`/`startupReminderDue` in every reconcile ctx (`applyResult`; debugSeed passes `false`) and `today` in the `windowFocused` ctx. Clear the flag only when `reminderEvaluated` is true.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/reconcile.ts`, `src/core/windowFocused.ts`, `src/core/types.ts`, `src/core/copy.ts`, `src/core/migrate.ts` -- rules, delivery-day accounting, report, copy, validation.
- [x] `src/shell/store.ts`, `src/shell/scheduler.ts`, `src/shell/notifier.ts`, `src/extension.ts` -- `mutate` report, `localDate`, the backlog notification with its Open Review Queue button (inject `focusQueue`), ctx and flag wiring.
- [x] `test/core/reconcile.test.ts`, `test/core/windowFocused.test.ts` -- one case per matrix row, including both midnight rows and `reminderEvaluated` for each result kind.
- [x] `test/core/copy.test.ts` (new) -- `backlogLine` is deterministic and covers every line across dates, and no line contains forbidden words (`behind`, `overdue`, `late`, `score`, `!`).
- [x] `test/shell/scheduler.test.ts`, `test/shell/notifier.test.ts` -- `localDate` formatting; backlog message text; the button runs `focusQueue`; dismissal is a no-op; a failed submission logs the count only.
- [x] `test/smoke/store.test.ts` -- `mutate` resolves to the report, including when the write is skipped; to `undefined` in read-only mode; and rejects on a write failure.

**Acceptance Criteria:**
- Given a first connection with existing requests and a threshold of 50, when the check completes in a focused window, then exactly one aggregate notification appears and no individual ones.
- Given two windows open across a day boundary with no gap, when checks continue, then no aggregate notification appears until a later startup or gap.
- Given any sequence of checks, failures, focus changes, and startups in one window, then at most one aggregate notification appears per local day for an account.

## Verification

**Commands:**
- `npm run compile` -- expected: pass.
- `npm run test:core` -- expected: pass.
- `npm test` -- expected: pass.

**Manual checks:**
- With requests pending, restart VS Code on the same day: no aggregate notification. Restart on the next local day: exactly one aggregate notification once the window is focused, with an **Open Review Queue** button.

## Implementation Notes

- `reconcile` returns `TransitionResult<ReconcileReport>`; `TransitionResult<R = unknown>` gained `report?: R`, and `Store.mutate<I, C, R>` resolves to `R | undefined`. `applySuccess` now returns `{ account, applied, addedBacklog }`; `decideReminder` runs only when `applied && result.complete`, and `reminderEvaluated` is true exactly then.
- `decideReminder` applies the A5 pending guard to both rules (first connection included), then the zero-items guard, then first connection (`previous.lastSuccessAt === undefined`), then the ongoing rule.
- `deliverPending(accountId, account, { focused, today })` handles the backlog branch; an emptied pending reminder becomes `none` even when unfocused (so `deliverToActive` writes it). When a reminder and new items are delivered together, `notifyBacklog` is emitted before the `notifyNew` effects (order not specified by the spec).
- `copy.backlogLine` uses an FNV-1a hash of the `today` string. New log lines: `notifiedBacklog(count)`, `backlogSubject(count)` (the `notifyFailed` subject), and `focusQueueFailed`. None carries PR content.
- `NotifierDeps`, `FocusDeliveryDeps` and `AlertingStoreDeps` gained `today()` (and `focusQueue()` for the notifier/factory). `extension.ts` passes `executeCommand('pulley.queue.focus')` and `localDate(Date.now())`; a smoke test checks that `pulley.queue.focus` exists in the host.
- `extension.ts` keeps `startupReminderDue` as window memory, passes it with `today` in `applyResult`, and clears it only when the resolved report has `reminderEvaluated`. Debug Seed passes `startupReminderDue: false` and ignores the report.
- Existing Story 2.1 tests for gap and missing-interval backlog now also expect the daily backlog reminder (no `notifyNew` still), and the Epic 1 "Before baseline" case expects a pending first-connection alert.

## Spec Change Log

- **2026-10-03, Epic 2 spec review fixes:** finding IDs cited inline (A1–A15 = adversarial findings 1–15, E1–E7 = edge-case findings 1–7) refer to `review-epic-2-specs-2026-10-03.md`, not PRD assumptions such as A8. B- and X-IDs refer to the Review Triage Log of `spec-epic-2-spec-review-fixes.md`. This story resolves A2, A3, A4, A5, A6, E2, E3, E4, B1, B3, B4, X1, X2, and X8. Complete-only partial-check behavior is recorded as accepted in Design Notes.

## Review Triage Log

| # | Source | Finding | Verdict | Evidence | Route |
|---|--------|---------|---------|----------|-------|
| 1 | verification-gap, blind | `startupReminderDue` set/clear wiring in `extension.ts` `applyResult` is not exercised by any test | medium | Pre-verified gap: only pure `reconcile` and `store.mutate` report tests exist; the closure is unreachable from smoke tests, so deleting or inverting the clear passes everything. | patch |
| 2 | blind | Notifier `else` branch treats any non-`notifyNew` effect as a backlog reminder | low | `Effect` has two kinds today; a third would silently render as a backlog notification. Direct correction (explicit kind + `never`). | patch |
| 3 | blind | `log.notifiedBacklog` uses "request(s)" | low | Cosmetic; neighbouring copy pluralises properly. Direct correction. | patch |
| 4 | blind | `notifier.ts` header comment line over-long | low | Line 2 re-flowed past the wrap width. Direct correction. | patch |
| 5 | blind | `firstConnection` carried on the effect but unused by the notifier | false | Frozen intent defines one copy (`pending(count)` + day line) for both kinds and requires the field on the effect. | reject |
| 6 | blind | A bad `backlogAlert`/date makes migrate wipe the whole store | low | Real, but the frozen Validation rule mandates `v1Problem` rejection, matching every other account field; Epic 1 always wrote `'none'` via `emptyAccount`. Changing it changes intent. | reject |
| 7 | blind | `LOCAL_DATE` regex accepts impossible dates like `2026-99-00` | low | Only `localDate` writes the field, so impossible values need hand-edited state; unlikely in use. | reject |
| 8 | blind, edge-case | `!==` lets a second reminder through when the clock or time zone moves backwards | low | Real only after a westward TZ change or clock rollback on a day that already reminded; the frozen intent specifies `lastBacklogReminderDate !== today` verbatim. Rare; surfaced to the human. | reject |
| 9 | blind | Switching accounts in a window does not re-arm the startup reminder | low | Frozen intent defines the flag as window memory cleared by the first evaluation on the active account; account switching inside a window is rare. | reject |
| 10 | blind | Backlog count includes a pending new item that also gets `notifyNew` | false | Frozen Delivery rule defines `count: item count`; behaviour matches and is recorded in Implementation Notes. | reject |
| 11 | blind | Debug Seed can still create first-connection or gap reminders | low | Debug-only command; frozen B4 constrains only the startup flag, which is respected. | reject |
| 12 | blind | Random-walk test models one window only | false | The cross-window race is accepted (B3); the "Second window" row (date already today) is tested as specified. | reject |
| 13 | blind | Notifier reads its own `today` for the line, which can drift from the recorded date at midnight | false | Frozen Notification copy says the notifier gets `today` from the shell when it runs the effect; implemented as specified. | reject |
| 14 | edge-case | Two windows starting together can both deliver a reminder | false | The accepted cross-window race (Design Notes, B3). | reject |
| 15 | edge-case | `today` computed before the serialized mutate, so a midnight crossing stamps yesterday | false | A reminder decided in the last ms of D and stamped D is a correct D decision; delivery re-stamps the delivery day (A4). No second reminder on any single day results. | reject |
| 16 | edge-case | A malformed `ctx.today` would be stored and later wipe state | false | `localDate(Date.now())` always yields zero-padded `YYYY-MM-DD`; there is no path producing NaN. | reject |
