---
title: 'Story 1.3: Keep the queue accurate across checks'
type: 'feature'
created: '2026-09-30'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-2-find-direct-review-requests-across-github.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 1.2 shows whatever the last check returned, held in window memory. A partial, late, or other-account result can wipe out correct rows, and nothing survives a restart or is shared between windows.

**Approach:** Introduce the durable core: stored-state types (AD-4), `migrate`, the `reconcile` transition (AD-5/6/7 guards and attempt bookkeeping), a first `viewModel` (AD-12), and the shell's `store.mutate` (AD-3). All check results now flow `CheckResult → store.mutate(reconcile) → viewModel → queueView`.

## Boundaries & Constraints

**Always:**
- `Stored = { schemaVersion: 1, accounts: { [accountId]: Account } }` under the `globalState` key `pulley.state.v1`. `Account` and `Tracked` carry every AD-4 field, including the Epic 2 fields. Epic 1 writes them with neutral defaults: `origin: 'backlog'`, `alert: 'none'`, `newSignal: false`, `backlogAlert: 'none'`. No classification or effect is emitted yet (`effects: []` always).
- `reconcile(stored, result, ctx:{ now, activeAccountId, intervalMs })` rules:
  1. `result.accountId !== activeAccountId` (or missing) → return the input unchanged.
  2. Every other result sets `lastAttemptAt = fetchStartedAt` and `lastAttemptIntervalMs = intervalMs`.
  3. Failure → also `lastFailure = { at: fetchStartedAt, reason }`. Nothing else changes.
  4. Success with `fetchStartedAt <= lastAppliedFetchStartedAt` → only the attempt fields change.
  5. Success → upsert each item. A new id gets `firstSeenAt = now`. An existing id updates title, repo, url, author, requester, and requestedAt, and keeps `firstSeenAt`, `origin`, and `alert`. Set `firstCheckDone = true`.
  6. A success that is also `complete` → delete ids absent from the result, set `lastSuccessAt = fetchStartedAt` and `lastAppliedFetchStartedAt = fetchStartedAt`, and clear `lastFailure`. An incomplete success advances neither marker and deletes nothing.
- `migrate(raw)`: `undefined` → empty v1. v1 → as-is. `schemaVersion > 1` → `{ readOnly: true }`. Malformed data → empty v1 plus a log line.
- `store.mutate(transition, input, ctx)`: a per-window promise chain; re-read `globalState.get` → `migrate` → transition → `await globalState.update` → run effects → notify listeners to re-render. In read-only mode it skips the write and effects. It is the only `globalState.update` caller.
- `viewModel(stored, window:{ connection, readOnly, checking }, { now })` → `{ status, count, message, rows }`. Status rules:
  - `readOnly` wins.
  - Unconnected → `unconnected`.
  - `lastFailure.at > (lastSuccessAt ?? 0)` → `stale`.
  - Items exist → `pending`.
  - No items and `lastSuccessAt` exists → `clear`.
  - Otherwise → `loading`. This covers no account partition yet, or only incomplete successes that returned nothing.
  - `count` is null until `lastSuccessAt` exists.
  - Rows sort by `requestedAt ?? firstSeenAt`, oldest first.
  - Row label and description keep the 1.2 format.

**Never:**
- No notifications, `queueViewed`/`windowFocused`, alert or backlog logic, scheduler, or stale-recovery actions (Story 1.6).
- No product state in `workspaceState`, files, or module-level variables.
- The shell never edits `Stored` fields directly.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Complete removes | Stored {A,B}; complete {A} | {A}; B deleted | N/A |
| Incomplete keeps | Stored {A,B}; incomplete {C} | {A,B,C}; markers unchanged | N/A |
| Late result | `fetchStartedAt` ≤ `lastAppliedFetchStartedAt` | Only attempt fields change | N/A |
| Other account | `accountId` X, active Y | Unchanged | N/A |
| Failure | network after success | Items kept, `lastFailure` set, status `stale` | N/A |
| Reappearance | B removed, later returned | New `Tracked` with new `firstSeenAt` | N/A |
| Newer schema | `schemaVersion: 2` | View "Update Pulley"; no writes | Log once |

</frozen-after-approval>

## Code Map

- `src/core/types.ts` -- add `Stored`, `Account`, `Tracked`, `Effect` (closed union, declared now for Epic 2), `ViewModel`.
- `src/core/migrate.ts`, `src/core/reconcile.ts`, `src/core/viewModel.ts` (new) -- pure; no input mutation.
- `src/core/copy.ts` -- add loading ("Checking review requests…"), a basic stale message, and the read-only "Update Pulley" message.
- `src/shell/store.ts` (new) -- `createStore(globalState, log)` → `{ mutate, read, onDidChange }`.
- `src/shell/queueView.ts` -- render from a `ViewModel` only; skip the re-render if the model is deep-equal to the last one.
- `src/extension.ts` -- the 1.2 check result goes to `store.mutate(reconcile, …)`. The window holds `activeAccountId` and `checking`. `intervalMs` is 15 min until Story 1.5 adds the setting.

## Tasks & Acceptance

**Execution:**
- [ ] `src/core/types.ts`, `migrate.ts`, `reconcile.ts`, `viewModel.ts`, `copy.ts` -- per Always.
- [ ] `src/shell/store.ts` -- the mutate pipeline.
- [ ] `src/shell/queueView.ts`, `src/extension.ts` -- route everything through the store and the view model.
- [ ] `test/core/reconcile.test.ts` -- table-driven, one case per rule 1–6 and per matrix row. Assert that inputs are not mutated (deep-freeze them).
- [ ] `test/core/migrate.test.ts`, `test/core/viewModel.test.ts` -- a case for each stored version / newer version, each status, and null count before the first success.
- [ ] `test/smoke/store.test.ts` -- two concurrent `mutate` calls are serialized; the listener fires only after `update` resolves.
- [ ] `docs/spikes/live-query.md` -- fill in the cross-window propagation section. A second window sees the rows after its next render or check.

**Acceptance Criteria:**
- Given two accounts' partitions in storage, when account Y is active, then only Y's rows render and X's partition is untouched after a write.
- Given VS Code restarts with stored items, when the window activates before any check completes, then the last stored rows render (status per the view model) and no zero is shown.
- Given the spike doc records a query limitation, when rule 6 is implemented, then that limitation cannot cause deletion (for example, partial errors stay `complete: false`).

## Verification

**Commands:**
- `npm run compile` -- expected: pass.
- `npm run test:core` -- expected: all reconcile, migrate, and viewModel cases pass.
- `npm test` -- expected: the store smoke test passes.

## Implementation Notes

## Spec Change Log

## Review Triage Log
