---
title: 'Story 2.1: Get one useful alert for a new request'
type: 'feature'
created: '2026-10-02'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-6-recover-from-missing-or-uncertain-github-data.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pulley never alerts. `reconcile` stores every item as `origin: 'backlog'`, `alert: 'none'`, and `createStore` is built without an effect runner, so a new direct review request only shows up if the user happens to open the queue.

**Approach:** Classify newly observed items as new or backlog in `reconcile` (AD-7). Record a pending alert for each new item and deliver it once through focus-gated `notifyNew` effects (AD-9), from both `reconcile` and a new `windowFocused` transition. A new `src/shell/notifier.ts` shows one native notification with **Open Pull Request**.

## Boundaries & Constraints

**Always:**
- **Baseline predicate:** an id not already in `items` is **backlog** when the account had no prior complete success (`lastSuccessAt` undefined before this result), or when its previous `lastAttemptAt` or `lastAttemptIntervalMs` is undefined, or when `fetchStartedAt − previous lastAttemptAt > 2 × previous lastAttemptIntervalMs`. "Previous" means the account values before rule 2 records this attempt. Otherwise the item is `origin: 'new'`, `alert: 'pending'`. Existing ids keep `origin`/`alert`, as `upsert` already does.
- `newSignal` becomes `true` when a success adds at least one new item, and `false` when a success adds none. Failures and rule-4 no-ops leave it unchanged. (A rule-4 no-op still records the attempt fields per rule 2, so it is not a same-reference result.)
- **Effects carry their account (A8):** `Effect` becomes `notifyNew { accountId, itemId }` (and, in Story 2.2, `notifyBacklog { accountId, count, firstConnection }`).
- **Shared delivery helper** `deliverPending(accountId, account, { focused })` in core returns `{ account, effects }`:
  - When focused, every item with `alert: 'pending'` becomes `'shown'` in the same returned state, and one `notifyNew { accountId, itemId }` is emitted per item, sorted by id.
  - When unfocused, or when nothing is pending, it returns the same account reference with no effects, so `reconcile` returns the same `stored` on a rule-1 rejection with nothing pending.
  - It only delivers alerts that are already pending; it never decides new ones.
- **Delivery after every result (A2):** `reconcile` runs `deliverPending` on the active account after every result: applied successes, failures, rule-4 no-ops, and rule-1 rejections of another account's result. It is skipped, with `stored` unchanged, when `activeAccountId` is undefined or that account is absent from `stored` (X3). The failure and no-op invariants govern queue changes and alert decisions, not delivery.
- **`windowFocused` transition:** `windowFocused(stored, undefined, { activeAccountId })` in `src/core/windowFocused.ts` applies rule 1 (active account only; an undefined `activeAccountId`, B2, or one whose account is absent from `stored`, is a no-op returning the same `stored`). It returns the same `stored` reference when nothing is pending, so the store skips the write.
- `ReconcileCtx` gains `windowFocused: boolean`. The shell reads `vscode.window.state.focused` when it builds each mutate ctx.
- **Store effects:** `createStore`'s effect runner receives `(effects, stored)`, where `stored` is the state it just wrote, and still runs only after the write resolves. The notifier composes messages from that state: no second read, so another window's write can't swap the item.
- **Notifier account binding (A8):** the notifier resolves each item from `stored.accounts[effect.accountId]`, never from the current active account. An `accountId` absent from `stored` is handled like a missing item (X4).
- **Notification copy:**
  - The base message is `Pulley spotted a review request for {repo}#{number}: '{title}'.`
  - It ends with ` Requested by {requester}.` when `requester` is present. `github.ts` sets that field only when the event's reviewer is the viewer.
  - Otherwise it ends with ` Author: {author}.`
  - The strings live in `src/core/copy.ts`. The single button uses `copy.openPullRequestCommandTitle`.
- **Notifier behaviour:**
  - The button opens the item's URL through `openPullRequest` (`https://github.com/` guard).
  - Dismissing the notification changes nothing.
  - The notifier never awaits the message promise inside the store queue, because it resolves only on dismissal.
  - **Submission failure is at-most-once (A7):** the notifier catches a synchronous throw and an asynchronous rejection of `showMessage`, logs `copy.log.notifyFailed` with `repo#number` (or the count, for backlog) only, and treats the alert as consumed. No rejection escapes the effect runner.
  - **Log order:** `notifiedNew` is logged once `showMessage` is called without a sync throw. A sync throw logs only `notifyFailed`. A later async rejection adds `notifyFailed` after `notifiedNew`.
- **Shell wiring:**
  - `vscode.window.onDidChangeWindowState` with `focused: true` → `store.mutate(windowFocused, …)`.
  - **Startup readiness (A1):** after each connection lookup that changes the active account, including the first one at activation, the shell runs `windowFocused` if the window is focused (and Story 2.3's `queueViewed` if the view is visible). A focus event before that lookup settles is a rule-1 no-op (B2).
  - Each notification shown logs `copy.log.notifiedNew` with `repo#number` only, never the title (order per **Log order**).
- `migrate`'s `v1Problem` rejects items whose `origin`/`alert` fall outside their unions, and accounts whose `newSignal` is not boolean.

**Never:**
- No aggregate or backlog notification, `today`, or `startupReminderDue` (Story 2.2).
- No `queueViewed`, mascot, or count (Story 2.3).
- No `schemaVersion` bump, because the fields already exist in v1.
- The shell never decides whether to notify, and the view never receives effects.
- No title, token, or other PR content in logs.
- No retry of a failed notification submission.

## I/O & Edge-Case Matrix

The interval I = 900 000 ms, and the previous attempt was at t.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| New, focused | Baseline done; complete success at t+I adds X | X `new`/`shown`, `newSignal` true, effect `notifyNew {acct, X}` | N/A |
| New, unfocused | Same, `windowFocused` false | X `pending`, no effect; a later `windowFocused` marks it shown and emits once | N/A |
| Gap | Success at t+2I+1 adds X | X `backlog`/`none`, no effect | N/A |
| Gap boundary | Success at exactly t+2I | X is new | N/A |
| Before baseline | No prior complete success | Every added item is backlog, with no effect | N/A |
| Already shown | X `shown`, later polls, reloads, or a second window | No further `notifyNew X` | N/A |
| Re-request kept | X present; requester/requestedAt change | Metadata only; alert unchanged | N/A |
| New cycle | A complete check omitted X, then X returns without a gap | New `pending` alert, delivered once | N/A |
| Incomplete omits | X `pending`; an incomplete success lacks X | X kept and still pending | N/A |
| Gone first | X `pending`, deleted before focus | No effect | N/A |
| Focused failure (A2) | X `pending`; a failure applies in a focused window | Queue and `newSignal` unchanged; X `shown`, `notifyNew X` | Failure recorded per rule 3 |
| Rule-1 rejection (A2, X3) | X `pending`; another account's result, focused | That result dropped; X delivered once | No active account → no change |
| Startup pending (A1) | X `pending` persisted; activation in a focused window | After the first lookup settles, `windowFocused` delivers X once | Focus before lookup → no-op |
| Account switch (A8) | Write for account A deferred; active account switches to B | Notifier composes X from A's partition in the written `stored` | N/A |
| Missing item | Effect id, or its `accountId`, absent from the written state | No notification | Log it and skip |
| Submission fails (A7) | `showMessage` throws or rejects | X stays `shown`; no retry; runner resolves | Log `notifyFailed` (`repo#number`) |

</frozen-after-approval>

## Design Notes

**Why a baseline predicate instead of `firstCheckDone`:** AD-7 says "`firstCheckDone` is false". But Epic 1 sets `firstCheckDone` on incomplete successes too, and `viewModel` relies on that. Classifying against "no prior complete success" matches the epic AC ("completed initial baseline"). It also stops an item missing from a partial first check from alerting later as new.

**Cross-window stale write, accepted (E1):** two windows can read pending state before either one's `globalState` write is visible, and a stale write can restore `pending`. This extends the architecture's accepted focus race (AD-9) to writes within the `globalState` sync window. Serializing writes across windows would need a cross-process lock that VS Code doesn't provide. The "exactly one across windows" criterion therefore covers windows that aren't racing.

**At-most-once submission (A7):** the alert is marked `shown` in the same write that emits the effect, so a failed `showMessage` cannot be retried without a second write and a duplicate risk. Losing one notification in that rare case is preferred to repeating it.

## Code Map

- `src/core/reconcile.ts` -- `applySuccess`/`upsert` do the classification. The current `upsert` hard-codes `origin: 'backlog'`, `alert: 'none'`. `reconcile` must call `deliverPending` after every result, including the rule-1 return. Keep rules 1–6 intact.
- `src/core/windowFocused.ts` (new) -- the transition, plus `deliverPending`, which `reconcile` imports (or put the helper in `reconcile.ts` and import it here).
- `src/core/types.ts` -- `Effect` (line 87) gains `accountId`. `Tracked.origin/alert` and `Account.newSignal` already exist. Update the doc comments that say "Epic 1 writes only…".
- `src/core/copy.ts` -- add `newRequestNotification(item)` and `log.notifiedNew`, `log.notifyFailed`.
- `src/core/migrate.ts` -- `v1Problem` enum checks.
- `src/shell/store.ts` -- change the `runEffects` signature to `(effects, stored)`. Keep the order write → effects → notify.
- `src/shell/notifier.ts` (new, vscode-free via injection) -- `createNotifier({ showMessage, openUrl, log })` returns the store's effect runner. `showMessage(text, button)` returns a thenable and is not awaited; its failures are caught.
- `src/extension.ts` -- pass the notifier to `createStore`; add `windowFocused` to the reconcile ctx in `applyResult` and debugSeed; wire `onDidChangeWindowState`, and run `windowFocused` after each lookup that changes the active account (in `apply`). `openUrl` = `openPullRequest({ url }, vscode.env.openExternal, log)`.
- `src/shell/queueView.ts` -- reuse `openPullRequest` unchanged.
- `src/shell/github.ts` -- already sets `requester` only on a verified viewer match (AD-10). No change.
- `test/core/reconcile.test.ts` -- the shared `ctx` needs `windowFocused: false`. Existing cases that assume `origin: 'backlog'` stay valid only for before-baseline or gap inputs, so update them where this changes the expectation. Existing rule-1/rule-4 "no effects" cases change only when the active account has something pending; with nothing pending they still return the same `stored` (rule 1) and no effects.

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/reconcile.ts`, `src/core/windowFocused.ts`, `src/core/types.ts` -- classification, `newSignal`, `Effect.accountId`, `deliverPending` after every result, the transition.
- [ ] `src/core/copy.ts`, `src/core/migrate.ts` -- notification text and log lines; enum validation.
- [ ] `src/shell/store.ts`, `src/shell/notifier.ts`, `src/extension.ts` -- effect plumbing, notifier, focus wiring, lookup-time `windowFocused`.
- [ ] `test/core/reconcile.test.ts`, `test/core/windowFocused.test.ts` -- one table case per matrix row (including focused failure, rule-1 rejection, undefined active account), plus the frozen-input checks.
- [ ] `test/core/migrate.test.ts` -- invalid `alert`/`origin`/`newSignal` → malformed.
- [ ] `test/shell/notifier.test.ts` -- requester vs author text; the button opens the exact URL; dismissal is a no-op; a missing item or missing account is logged; `showMessage` is not awaited; a sync throw and an async rejection are caught, logged with `repo#number` only in the stated log order, and never escape; items resolve from `effect.accountId`, not the active account.
- [ ] `test/smoke/store.test.ts` -- the effect runner gets the written `stored` only after `update` resolves; an account switch while `update` is pending still notifies from the originating account's partition.
- [ ] `test/smoke/activation.test.ts` -- a pending alert persisted at startup is delivered once after the first lookup in a focused window.

**Acceptance Criteria:**
- Given two windows that aren't racing (see Design Notes, E1), one focused, when one check adds X, then exactly one native notification appears across both windows, and reloading either window never shows it again.
- Given the notification, when **Open Pull Request** is pressed, then the browser opens X's exact URL and stored state is unchanged.
- Given a pending alert at activation in a focused window, when the first silent lookup settles, then it is delivered once without waiting for a poll or a focus change.

## Verification

**Commands:**
- `npm run compile` -- expected: pass.
- `npm run test:core` -- expected: all core and shell cases pass.
- `npm test` -- expected: smoke tests pass.

**Manual checks:**
- In the Development Host, request your own review on a test PR. Within one interval plus jitter, one notification appears. Reload the window; no second notification appears.

## Implementation Notes

## Spec Change Log

- **2026-10-03, Epic 2 spec review fixes:** finding IDs cited inline (A1–A15 = adversarial findings 1–15, E1–E7 = edge-case findings 1–7) refer to `review-epic-2-specs-2026-10-03.md`, not PRD assumptions such as A8. B- and X-IDs refer to the Review Triage Log of `spec-epic-2-spec-review-fixes.md`. This story resolves A1, A2, A7, A8, E1, B2, X1, X3, and X4; moves the baseline note before Code Map; and renames "Still pending" to "Already shown".

## Review Triage Log
