---
title: 'Epic 2 spec review fixes'
type: 'chore'
created: '2026-10-03'
status: 'done'
route: 'dispatch'
baseline_commit: '8be05d5b5617cdb0c59073c209817c88c57a67d3'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/implementation-artifacts/review-epic-2-specs-2026-10-03.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Epic 2 spec review (2026-10-03) found 22 behavioral defects across the Story 2.1–2.6 specs. Some rules contradict each other, for example failure-time delivery against "failures never touch `backlogAlert`". Some sequences break guarantees: the daily limit across midnight, startup before account lookup settles, stale views. Some release and validation gates can't be executed as written. It also found one structural move and two prose edits.

**Approach:** Amend the six `ready-for-dev` specs in place. The human asked for this, which counts as renegotiating the frozen blocks. Each finding gets one concrete rule, a matrix row or test, and a task line. The specs stay `ready-for-dev`; no product code changes.

## Boundaries & Constraints

**Always:**
- Every review finding (A1–A15, E1–E7) is resolved by an edit, or explicitly accepted with a reason in that spec's Design Notes.
- Resolutions (decided):
  - **Delivery vs invariants (A2, E2):** `deliverPending` runs after every `reconcile`, including failures and rule-4 no-ops. It only delivers alerts that are already pending. The failure and no-op invariants govern queue changes and reminder *decisions*, not delivery. Reword 2.2 to say so.
  - **Startup readiness (A1):** after each connection lookup that changes the active account (including the first one), the shell runs `windowFocused` if the window is focused and `queueViewed` if the view is visible. Add a test with a pending alert persisted at startup.
  - **Account binding (A8):** `notifyNew` and `notifyBacklog` carry `accountId`. The notifier resolves items from that account in the written `stored`, never from the current active account. Add a test for an account switch during a deferred write.
  - **Daily-limit accounting (A4, A5, E3):** `windowFocused` ctx gains `today`. When a backlog alert is delivered, `lastBacklogReminderDate` is set to the delivery day. A pending alert is never replaced: an ongoing reminder is not decided while `backlogAlert` is pending, so `firstConnection: true` survives midnight. Add matrix rows for "pending at midnight, then startup" and "pending first connection, next-day success".
  - **First connection (A3):** `result.ok && result.complete && previous.lastSuccessAt === undefined`. Incomplete successes before that point store items as backlog with no alert.
  - **Flag clearing (A6, E4):** `store.mutate` resolves to the transition's report. `reconcile` reports `reminderEvaluated: boolean`. The shell clears `startupReminderDue` only when that is true. It stays set after rule-1 rejection, rule-4 no-ops, read-only mode, and failures.
  - **View freshness (A9, E5):** `QueueView.render` refreshes the provider when the rows or the status row (presence, label, icon) change. After rendering, if `treeView.visible` and `newSignal` is true, it runs `queueViewed`. Add tests for mascot-only changes and a new request arriving while the view is visible.
  - **Dogfood setup (A10):** each hard scenario has prerequisites and a trigger:
    - SSO partial: a SAML organization where the token isn't authorized. If the tester has none, mark it N/A with that reason; unit tests cover it.
    - Revoked sign-in: revoke the VS Code OAuth app on github.com, then Refresh.
    - 50 items: Debug Seed in the Development Host on the same commit SHA as the `.vsix`, recorded as such.
  - **Usability timing (A11, E6):** for the session, `pulley.checkIntervalMinutes` is set to 5. Task 2 starts right after a check, and the request is made in its first minute. Observation lasts until 5 minutes after the notification, up to 15 minutes. If no notification arrives within 6 minutes, record a *delivery failure*, not a missed notice.
  - **Entry gate (A12, E7):** 2.6 requires `usability-results.md` to record **Go** and every `fix before 2.6` issue to be closed, with its spec `done`.
  - **Release commit (A14):** verify CI on the release commit SHA, then tag exactly that SHA.
  - **Privacy runtime guard (A15):** add tests that use an injected `fetch` to assert every request goes to `https://api.github.com/graphql`, and log-sink tests that push a sentinel token and title through error, partial-error, and rejected-URL paths and assert neither appears.
  - **Release version (A13, human):** the release is always `0.1.1` (preview). Dogfood builds stay `0.1.0` and are never published. The guarantee becomes "the published file is the exact `.vsix` smoke-tested in release step 2".
  - **Partial checks (A3/E4, human):** complete-only. First-connection, startup, and gap reminders are decided only on complete applied successes, and `reminderEvaluated` is true only for those. A persistent partial error gives no reminder; record this in 2.2's Design Notes.
  - **Submission failure (A7, human):** at-most-once. The notifier catches sync throws and async rejections of `showMessage`, logs `copy.log.notifyFailed` (`repo#number` or count only), and treats the alert as consumed. No rejection escapes the effect runner.
  - **Cross-window stale write (E1, human):** accept. Extend the architecture's accepted focus race to cover writes within the `globalState` sync window. Scope 2.1's "exactly one across windows" acceptance criterion to windows that aren't racing, and record the reason in 2.1's Design Notes.
  - **Viewed requires focus (B5, human):** the post-render `queueViewed` runs only when the view is visible and the window is focused. `windowFocused` handling also runs `queueViewed` when the view is visible.
  - **Delivery failure fails the participant (B8, human):** in 2.5's pass formula, a participant with a delivery failure counts as *not passing*, and the failure is triaged.
  - **Structure and prose:** in 2.1, move the "Why a baseline predicate" note to just before Code Map, outside the frozen block. Rename the matrix label "Still pending" to "Already shown". Change "Manual checks (if no CLI):" to "Manual checks:" in all six specs.

**Never:**
- No product code, tests, or `sprint-status.yaml` changes.
- No changes to the review files or `epic-2-context.md`.
- No new scope beyond what the findings require.

</frozen-after-approval>

## Code Map

- `_bmad-output/implementation-artifacts/spec-2-1-…md` -- A1, A2, A7, A8, E1; the Design Notes move; the "Already shown" label; the `runEffects` and notifier test lines.
- `spec-2-2-…md` -- A2, A3, A4, A5, A6, E2, E3, E4; the `windowFocused` ctx `today`; the `mutate` report; new matrix rows.
- `spec-2-3-…md` -- A9, E5; the `queueView.render` refresh rule; smoke tests. A1's `queueViewed`-at-lookup goes here too.
- `spec-2-4-…md` -- A10 checklist prerequisites and triggers.
- `spec-2-5-…md` -- A11, E6 Task 2 timing and the delivery-failure column in results.
- `spec-2-6-…md` -- A12, E7 gate; A13 version; A14 procedure order; A15 runtime privacy tests.
- Facts: `lastSuccessAt` is set only on complete successes (`src/core/reconcile.ts:76`). Partial GraphQL errors give `complete:false` (`src/shell/github.ts:314`). `QueueView.render` refreshes only on row changes (`src/shell/queueView.ts:120`). Interval minimum is 5 min and jitter is ≤60 s (`src/shell/scheduler.ts:13-16`). `Effect` is in `src/core/types.ts:87`.

## Tasks & Acceptance

**Execution:**
- [x] `spec-2-1-…md` -- apply 2.1 resolutions; update the Store/Notifier rules, matrix, and tasks.
- [x] `spec-2-2-…md` -- apply 2.2 resolutions (complete-only); add the midnight rows.
- [x] `spec-2-3-…md` -- the refresh rule, `queueViewed` after render and lookup, tests.
- [x] `spec-2-4-…md` -- scenario prerequisites and triggers.
- [x] `spec-2-5-…md` -- the Task 2 schedule and the delivery-failure record.
- [x] `spec-2-6-…md` -- gate, version, procedure order, privacy runtime tests.
- [x] All six -- "Manual checks:" label; each spec stays under ~1600 tokens where practical.

**Acceptance Criteria:**
- Given the review's 22 findings, when each spec is read, then every finding maps to a rule, matrix row, or test, or to a recorded acceptance with a reason.
- Given 2.1 and 2.2 together, then there's no contradiction between delivery and the failure/no-op invariants, and no sequence lets two aggregate notifications appear on one local day for one account in one window.

## Implementation Notes

- Finding IDs are cited inline in the amended specs so each one can be found by search. E1 and the complete-only partial-error behavior are recorded as accepted in the Design Notes of 2.1 and 2.2.
- 2.1 and 2.2 run over ~1600 tokens (about 1850 and 1700 words) because of the added matrix rows and rules. Trimming them further would drop required resolutions.
- A15 sentinel placement: the token is the auth token and the title is in the returned nodes and rows. Sentinels are not injected into GraphQL error text or rejected URLs, so the legitimate `checkPartialErrors` and `openIgnored` diagnostics are kept.

## Spec Change Log

- **Loop 1 (intent_gap, B5/X6 and B8/X11):** the human decided "viewed requires focus" and "a delivery failure fails the participant", now recorded in the frozen block. The six specs were reverted to their pre-fix state and are re-derived. Avoids: `newSignal` cleared in a background window, and unscored delivery-failure sessions. **KEEP:**
  - inline finding IDs;
  - 2.1's moved Design Notes (baseline rationale, E1 accepted, at-most-once);
  - 2.2's complete-only and delivery-day Design Notes;
  - the added matrix rows in 2.1, 2.2, and 2.3;
  - 2.4's Prerequisites and Trigger columns and build SHA;
  - 2.5's Task 2 timing bullets;
  - 2.6's verify-then-tag procedure and runtime privacy tests.

## Review Triage Log

Pass 1 (blind = B, edge = X):

| # | Finding | Verdict | Evidence / route |
|---|---------|---------|------------------|
| B1 | 2.1/2.2 `deliverPending`/`windowFocused` signatures disagree | low | 2.2 adds `today` without a final signature → patch |
| B2 | Focus event before first lookup | low | Rule 1 already no-ops on undefined `activeAccountId`; the spec doesn't say so → patch (clarify) |
| B3 | 2.2 "one window" carve-out cites a race that 2.1 scopes to item alerts | low | E1 decision accepted the race; 2.2 Design Notes don't extend it to `backlogAlert` → patch |
| B4 | Debug Seed can consume `startupReminderDue` | medium | debugSeed builds a reconcile ctx (`src/extension.ts:226`) → patch |
| B5, X6 | Post-render `queueViewed` fires in a visible but unfocused window | medium | `treeView.visible` is independent of window focus; the frozen E5 decision omits focus → intent_gap |
| B6 | Revoking the OAuth app signs out other VS Code GitHub features | low | Missing warning and re-authorize step → patch |
| B7 | N/A and Development Host rows' effect on Go/No-go undefined | low | → patch |
| B8, X11 | Pass formula ignores delivery-failure participants | medium | Frozen A11 decision adds the failure class but no scoring → intent_gap |
| B9, X9, X10 | Unfocused window misclassified as delivery failure; tight margin | medium | Focus-gated delivery (2.1). The margin part is false: the request follows a check, so the next check lands ≤ ~6 min later → patch (focus classification) |
| B10 | Release code may differ from the dogfooded code | medium | Pre-existing (the original 2.6 allowed post-dogfood fixes); fix-before-2.6 specs go through review → defer |
| B10b, X13 | No path for a redone 0.1.1 publish | low | → patch |
| B11 | Privacy AC says "another host" for the open path; notifier logs not covered | low | → patch |
| B12 | CHANGELOG 0.1.0 entry vs 0.1.1 entry | low | → patch |
| B13 | Review IDs unresolvable; "A8" collides with the PRD A8 | low | → patch (change-log pointer per spec) |
| X1, X2 | Rule-4 "same reference" / "changes nothing" wrong | medium | Rule 2 records attempt fields before rule 4 (`src/core/reconcile.ts:93-97`) → patch |
| X3 | Delivery with undefined or missing active account | low | Rule-1 path now also delivers → patch (skip) |
| X4 | Notifier: effect `accountId` absent from `stored` | low | → patch (treat as missing item) |
| X5 | Post-render `queueViewed` loops in read-only mode | medium | Read-only `mutate` still notifies → render → hook; `newSignal` never clears → patch (guard) |
| X7 | Clock moved back a day | low | Rare; the fix adds a branch → rejected |
| X8 | Missing-prior-attempt branch vs "gap rule" ambiguous | low | → patch |
| X12 | Destination test passes vacuously | low | → patch (assert ≥1 request) |

Pass 2, loop 1 (blind = B2-, edge = X2-):

| # | Finding | Verdict | Evidence / route |
|---|---------|---------|------------------|
| B2-1 | Frozen content changed with no re-approval note | false | The human authorized the renegotiation; it is recorded in this spec's frozen intent and in each Spec Change Log |
| B2-2, X2-2 | Focused rule-1 result with nothing pending may build a new reference and write | low | 2.1 states "unchanged" only for the unfocused case → patch |
| B2-3 | `notifiedNew` / `notifyFailed` order undefined | low | → patch |
| B2-4 | `mutate` report on a skipped write or a write failure unstated | low | The store contract rejects on write failure (`src/shell/store.ts` doc) → patch (state it) |
| B2-5 | Emptied pending reminder still uses up the day | low | The date is set at decision; the emptied branch leaves it → patch (record as accepted) |
| B2-6 | The `new` state flashes for a watching user | false | Intended by the frozen E5 decision plus the human's focus decision |
| B2-7, X2-1 | In-flight post-render `queueViewed`: a skipped render is never retried; untested | medium | → patch (re-check on completion, add a test) |
| B2-8 | Dogfood table lacks an Expected column | low | → patch |
| B2-9 | The two-windows row ignores the accepted race | low | → patch |
| B2-10a | Fresh profile and second account setup unstated | low | → patch |
| B2-10b | Dogfood lacks next-day, gap, unfocused, button, and pending-at-startup scenarios | medium | Pre-existing omission; A10 asked only for repeatable triggers → defer |
| B2-11 | Earlier Pulley state, or a failed or partial check, contaminates Task 2 | medium | → patch (first-connection before Task 1; check Output before classifying) |
| B2-12 | The "A8" ID clash is only explained | low | The Change Log note resolves the ambiguity; renaming IDs everywhere isn't a direct correction → rejected |
| B2-13 | Released code never dogfooded | medium | carried: B10 → defer |
| B2-14 | Privacy log-sink exemptions untracked | low | `openIgnored` logs a URL by design → patch (2.6 Design Note) |
| B2-15 | No version-bump step; tag failure after acceptance | low | → patch |
| X2-3 | `windowFocused` with the active account absent from `stored` | low | → patch |
| X2-4 | Pending, zero items, unfocused: branch order conflicts | low | → patch (zero items → `none` regardless of focus) |
| X2-5 | 6-minute bound vs fetch latency | low | The request follows a completed Refresh, so the next check starts ≤6 min later; the gap is seconds → rejected |
| X2-6 | Focus regained after the 15-minute cap | low | → patch (facilitator asks the participant to return to VS Code at the cap) |
| X2-7 | A triaged non-blocking Fail conflicts with the Go rule | low | → patch |
| X2-8 | "Wait one interval" ignores jitter | low | → patch |
| X2-9 | `runCheck` doesn't retry; the retry path is untested | low | → patch (`checkWithRetry`) |
| X2-10 | Unknown Marketplace state after a step-4 error | low | → patch (`vsce show` first) |
| X2-11 | Timezone moves back | low | carried: X7 → rejected |

## Verification

**Manual checks:**
- Cross-read the six amended specs against the review's finding list. Each finding ID can be found in its spec's text or Design Notes.
- `git diff --stat` touches only the six spec files and this spec.
