---
title: 'Story 2.3: Read queue state at a glance'
type: 'feature'
created: '2026-10-02'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-2-return-to-a-backlog-with-a-daily-limit.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Queue state is readable only by opening the view and reading the message. Nothing outside the view shows a count, and the corgi states (new, older, backlog, waiting, clear, unknown) that FR-10 and FR-13 require don't exist.

**Approach:** Extend `viewModel` per AD-12 with `mascot`, `mascotText`, and `countStale`, driven by `pulley.backlogThreshold` and `today`. Add the `queueViewed` transition, which ends the new signal. Render a quiet native count (`src/shell/statusCount.ts`) and the corgi state from the same model.

## Boundaries & Constraints

**Always:**
- `ViewModelCtx` gains `today` and `threshold`. `ViewModel` gains `countStale: boolean`, `mascot: 'new'|'older'|'backlog'|'waiting'|'clear'|'unknown'`, and `mascotText`.
- **Count:**
  - `pending` and `clear` keep today's values, with `countStale: false`.
  - After a prior complete success, the last-known row count stays as `count` with `countStale: true` in these cases: stale (`lastFailure`), write-failed, or unauthenticated with stored rows.
  - Before any complete success, `count` is `null`.
  - The quiet count never renders an unqualified `0` when `countStale` is true.
- **Mascot:**
  - `pending` → `backlog` if rows ≥ threshold. Otherwise `new` if `account.newSignal`. Otherwise `older` if any item has a known `requestedAt` with `now − requestedAt ≥ 24 h`. Otherwise `waiting`.
  - `clear` → `clear`. Every other status → `unknown`.
  - `firstSeenAt` and PR age never count toward "older".
- **`mascotText`** (in `src/core/copy.ts`): a word equivalent per state.
  - `new`: "The corgi spotted a new request."
  - `older`: "A request has waited more than a day."
  - `backlog`: `backlogLine(today)` from Story 2.2.
  - `waiting`: "The corgi is waiting with you."
  - `clear`: "The corgi is resting."
  - `unknown`: "The corgi can't confirm the queue right now."
- **`queueViewed` transition** in `src/core/queueViewed.ts`: it sets the active account's `newSignal` to false (rule 1; no-op without an active account). It returns the same reference when the value is already false. The shell runs it:
  - on `treeView.onDidChangeVisibility(visible)`;
  - after each connection lookup that changes the active account, including the first, if the view is visible (A1);
  - in `windowFocused` handling, when the view is visible (B5);
  - **after render (A9, E5, B5):** when `treeView.visible`, the window is focused, and the active account's `newSignal` is true. It is skipped when the store read is read-only (X5), and at most one such call is in flight. When an in-flight call completes, the shell re-checks visible, focused, and `newSignal`, and runs it again if all are still true, so a render that arrived meanwhile isn't dropped.
- **`pulley.backlogThreshold` setting:** `application` scope, number, default 5, minimum 1.
  - The shell reader treats a non-integer or a value below 1 as 5 and logs once.
  - A change re-renders only. It never checks, writes, or alerts.
- **Count rendering (decided: native view badge):** `statusCount.ts` sets `TreeView.badge` from `count`/`countStale` only.
  - No badge when `count` is null or 0.
  - Otherwise `{ value: count, tooltip }`. The tooltip is `copy.pending(count)`, with `copy.countLastKnown` ("Last known count; Pulley couldn't confirm it.") appended when stale.
  - Clicking the activity-bar icon opens the queue natively.
- **Corgi assets:** the state art lives under `media/corgi/{state}.svg`, as subtle variants derived from `ux-designs/.../mockups/corgi.svg` and `corgi-resting.svg`.
  - Each keeps the broad ears, low wide face, short muzzle, and central blaze.
  - `corgi-*` colors appear only in the art.
  - No animation.
- **Corgi placement (decided: status row):** `queueView` renders a non-clickable first tree item whenever the view has rows or `mascot` is `clear`. With stale rows the row shows the `unknown` pose.
  - Its id is `pulley.status`; its icon is `media/corgi/{mascot}.svg`; its label is `mascotText`; its `accessibilityInformation` is `mascotText`; it has no command.
  - It is not added for `unknown` with no rows, where the message or welcome content explains.
  - Rows keep their ids, so focus and selection survive.
  - `pulley.openPullRequest` ignores the status row.
- **Rendering:** the shell re-renders only when the model changes (the existing deep-equal guard). Background polls with an unchanged model announce nothing.
- **Provider refresh (A9):** `QueueView.render` refreshes the provider when the rows change or when the status row changes (presence, label, or icon). A mascot-only change therefore updates the corgi art and text.

**Never:**
- No notification or effect from mascot, threshold, or `queueViewed`.
- No webview, animation, placement setting, or custom shortcut.
- Pose or color never stands alone, without words and a count.
- No copy outside `copy.ts`, apart from the `package.json` mirrors that are checked by test.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Backlog | 6 rows, threshold 5, `newSignal` | `mascot` backlog | N/A |
| New | 2 rows, `newSignal` | new | N/A |
| Older | 2 rows, one `requestedAt` = now − 24 h | older | N/A |
| Older unknown | 2 rows, no `requestedAt`, old `firstSeenAt` | waiting | N/A |
| Clear | Complete success, 0 rows | clear, count 0 | N/A |
| Stale | 3 rows, failure after success | count 3, `countStale`, unknown | N/A |
| Never succeeded | Failure only | count null, unknown | N/A |
| Threshold change | 6 rows, 5 → 10 | backlog → new/older/waiting; no check, no write | N/A |
| Bad threshold | 0 or 2.5 | Uses 5 | Log once |
| Queue opened | `newSignal` true; view visible | `newSignal` false, no effect | N/A |
| Mascot-only change (A9) | Same rows; `newSignal` true → false | Provider refreshed; status row shows `waiting` art and text | N/A |
| New while visible (E5) | View visible, window focused; a check adds X | Renders `new`, then post-render `queueViewed` clears `newSignal` | N/A |
| New while visible, unfocused (B5) | View visible, window unfocused; a check adds X | `newSignal` stays true until focus; focus runs `queueViewed` | N/A |
| Read-only store (X5) | `newSignal` true; newer schema; visible and focused | No `queueViewed`, no render loop | N/A |
| Startup, view visible (A1) | `newSignal` true persisted; view visible at activation | After the first lookup settles, `queueViewed` clears it | N/A |
| Quiet poll | Same model | No render call, no re-announcement | N/A |

</frozen-after-approval>

## Code Map

- `src/core/viewModel.ts` -- add the mascot and `countStale` per branch. The early branches (`readOnly`, `loading`, `unconnected`) become `unknown`.
- `src/core/types.ts` -- the `ViewModel` fields and the `Mascot` type.
- `src/core/queueViewed.ts` (new) -- the transition, with rule 1 active account only.
- `src/core/copy.ts` -- `mascotText`, `backlogThresholdDescription` (mirrored in `package.json`), `log.thresholdInvalid`, and the count accessible text.
- `src/shell/statusCount.ts` (new) -- `render(model)` sets `treeView.badge`, skipping unchanged values. It needs `badge` added to the `QueueTreeView` pick.
- `src/shell/queueView.ts` -- expose `onDidChangeVisibility`/`visible` via `QueueTreeView`. Prepend the corgi status row; the provider returns `[statusRow, ...rows]`. `render` currently refreshes only on row changes (line 120); extend the check to the status row.
- `src/shell/scheduler.ts` -- `createThresholdReader`, which mirrors `createIntervalReader`.
- `src/extension.ts` -- pass `today`/`threshold` into `viewModel`, render `statusCount`, wire `queueViewed` to visibility, lookup, focus, and post-render, and re-render on a threshold config change.
- `package.json` -- the `pulley.backlogThreshold` contribution.
- `test/core/connection.test.ts` -- extend the `package.json` mirror and settings-schema checks.
- `docs/spikes/view-prototype.md` -- add the corgi and count rows to the checks table.

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/types.ts`, `src/core/viewModel.ts`, `src/core/queueViewed.ts`, `src/core/copy.ts` -- model, transition, copy.
- [ ] `media/corgi/*.svg` -- six state variants.
- [ ] `src/shell/statusCount.ts`, `src/shell/queueView.ts`, `src/shell/scheduler.ts`, `src/extension.ts`, `package.json` -- rendering, threshold reader, wiring.
- [ ] `test/core/viewModel.test.ts`, `test/core/queueViewed.test.ts` -- one case per matrix row. Update existing stale cases, which expect `count: null`.
- [ ] `test/shell/scheduler.test.ts`, `test/core/connection.test.ts` -- threshold reader; manifest mirror.
- [ ] `test/smoke/queueView.test.ts` -- the count renders and is skipped when unchanged; visibility triggers `queueViewed`; a mascot-only change refreshes the provider; a new request while visible and focused clears `newSignal`, and while unfocused does not; read-only mode runs no `queueViewed`; a render that sets `newSignal` again while a post-render `queueViewed` is in flight triggers one more run after it completes; a persisted `newSignal` is cleared after the first lookup with the view visible.
- [ ] `docs/spikes/view-prototype.md` -- the checks below.

**Acceptance Criteria:**
- Given the view in the sidebar and in the bottom Panel, in light, dark, and high-contrast themes at 150% zoom, then the corgi variants stay recognizable at actual size, each state has words and a count, and keyboard and screen-reader use work with native focus and selection. These results are recorded in `docs/spikes/view-prototype.md`.
- Given a stale count, when the badge tooltip is read, then it says the count is last known. Given null or zero, then no badge shows.

## Verification

**Commands:**
- `npm run compile` -- expected: pass.
- `npm run test:core` -- expected: pass.
- `npm test` -- expected: pass.

**Manual checks:**
- Run Debug Seed (50 rows): the mascot is backlog. Set the threshold to 100: the mascot changes, the output channel shows no check, and no notification appears.

## Implementation Notes

## Spec Change Log

- **2026-10-03, Epic 2 spec review fixes:** finding IDs cited inline (A1–A15 = adversarial findings 1–15, E1–E7 = edge-case findings 1–7) refer to `review-epic-2-specs-2026-10-03.md`, not PRD assumptions such as A8. B- and X-IDs refer to the Review Triage Log of `spec-epic-2-spec-review-fixes.md`. This story resolves A1 (`queueViewed` at lookup), A9, E5, B5, and X5.

## Review Triage Log
