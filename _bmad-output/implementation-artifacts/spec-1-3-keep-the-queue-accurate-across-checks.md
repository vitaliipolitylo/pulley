---
title: 'Story 1.3: Keep the queue accurate across checks'
type: 'feature'
created: '2026-09-30'
status: 'done'
baseline_commit: '6c0fd770475040ed415739f7529ce1bebf8f9bb0'
route: 'dispatch'
review_loop_iteration: 1
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
- `Stored = { schemaVersion: 1, accounts: { [accountId]: Account } }` under the `globalState` key `pulley.state.v1`. `Account` and `Tracked` carry every AD-4 field, including the Epic 2 fields. Epic 1 writes them with neutral defaults: `origin: 'backlog'`, `alert: 'none'`, `newSignal: false`, `backlogAlert: 'none'`. No classification or effect is emitted yet (`effects: []` always). `Account` also gets `lastIncompleteFetchStartedAt?` (a Story 1.3 addition to AD-4): the newest `fetchStartedAt` of an applied incomplete success.
- `reconcile(stored, result, ctx:{ now, activeAccountId, intervalMs })` rules:
  1. `result.accountId !== activeAccountId` (or missing) → return the input unchanged.
  2. Every other result sets `lastAttemptAt = fetchStartedAt` and `lastAttemptIntervalMs = intervalMs`.
  3. Failure → also `lastFailure = { at: fetchStartedAt, reason }`. Nothing else changes.
  4. Success with `fetchStartedAt <= lastAppliedFetchStartedAt` → only the attempt fields change.
  5. Success → upsert each item. A new id gets `firstSeenAt = now`. An existing id updates title, repo, url, author, requester, and requestedAt, and keeps `firstSeenAt`, `origin`, and `alert`. Set `firstCheckDone = true`. Any applied success, complete or not, with `fetchStartedAt > lastFailure.at` clears `lastFailure`.
  6. A success that is also `complete` → set `lastSuccessAt = fetchStartedAt` and `lastAppliedFetchStartedAt = fetchStartedAt`. It deletes ids absent from the result only when `fetchStartedAt > (lastIncompleteFetchStartedAt ?? -∞)`; an older complete result deletes nothing. An incomplete success advances neither marker, deletes nothing, and sets `lastIncompleteFetchStartedAt = max(existing, fetchStartedAt)`.
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
| Partial after failure | failure at t1; incomplete success at t2 > t1 | `lastFailure` cleared; status not `stale` | N/A |
| Late complete after newer partial | incomplete {A,C} at t2 applied; complete {A} started t1 < t2 arrives | C kept; markers set to t1 | N/A |

</frozen-after-approval>

## Code Map

- `src/core/types.ts` -- add `Stored`, `Account`, `Tracked`, `Effect` (closed union, declared now for Epic 2), `ViewModel`.
- `src/core/migrate.ts`, `src/core/reconcile.ts`, `src/core/viewModel.ts` (new) -- pure; no input mutation. `migrate` treats an `items` entry that is not an object with string `id` and numeric `firstSeenAt` as malformed (it would otherwise crash `viewModel` during `activate`). In `viewModel`, rows with `count: null` show the pending message plus the 1.2 `copy.incomplete` hint.
- `src/core/copy.ts` -- add loading ("Checking review requests…"), a basic stale message, and the read-only "Update Pulley" message.
- `src/shell/store.ts` (new) -- `createStore(globalState, log)` → `{ mutate, read, onDidChange }`.
- `src/shell/queueView.ts` -- render from a `ViewModel` only; skip the re-render if the model is deep-equal to the last one.
- `src/core/connection.ts`, `src/core/checkPresentation.ts` -- `viewModel` replaces `checkPresentation` and `connectionPresentation`/`connectionMessage`/`copy.connected`; delete them and their tests rather than leaving them unused.
- `src/extension.ts` -- the 1.2 check result goes to `store.mutate(reconcile, …)`. The window holds `activeAccountId` and `checking`. `intervalMs` is 15 min until Story 1.5 adds the setting.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/types.ts`, `migrate.ts`, `reconcile.ts`, `viewModel.ts`, `copy.ts` -- per Always.
- [x] `src/shell/store.ts` -- the mutate pipeline.
- [x] `src/shell/queueView.ts`, `src/extension.ts` -- route everything through the store and the view model.
- [x] `test/core/reconcile.test.ts` -- table-driven, one case per rule 1–6 and per matrix row. Assert that inputs are not mutated (deep-freeze them).
- [x] `test/core/migrate.test.ts`, `test/core/viewModel.test.ts` -- a case for each stored version / newer version, a malformed item entry, each status, null count before the first success, the incomplete hint, the loading message with `firstCheckDone` both checking and not, and the id tie-break in row order.
- [x] `test/smoke/store.test.ts` -- two concurrent `mutate` calls are serialized; the listener fires only after `update` resolves.
- [x] `docs/spikes/live-query.md` -- fill in the cross-window propagation section. A second window sees the rows after its next render or check.

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

Iteration 0 (reverted after review; decisions below are carried forward unless the Spec Change Log amends them):

- `migrate` returns `{ readOnly: true, schemaVersion }` or `{ readOnly: false, stored, malformed? }`. Core stays pure, so the store writes the log line: newer schema once per window, a malformed problem once per distinct problem. Malformed means not an object, no integer `schemaVersion >= 1`, no `accounts` map, or an account without an `items` map. A malformed value is overwritten with empty v1 on the next mutate.
- `reconcile` also refreshes `number` on an existing id (alongside the listed fields). A `requester`/`requestedAt` the latest result no longer reports is dropped, not kept. Optional fields are omitted rather than set to `undefined`, so stored JSON stays stable. A result with no `accountId` or no active account returns the input object unchanged.
- `BacklogAlert` is typed `'none' | { state: 'pending' | 'shown'; firstConnection }` for Epic 2; Epic 1 writes only `'none'`. `Effect` is the closed `notifyNew` / `notifyBacklog` union; `createStore` accepts an optional `runEffects` that runs after the write (unused while `effects` is always `[]`).
- `store.mutate` skips `globalState.update` when the transition returns the same `stored` object (for example another account's result), unless the read was malformed. Listeners are still notified, including in read-only mode. A throwing transition or a rejected write rejects that call only; later calls still run. `store.ts` has no `vscode` import (a `StateMemento` slice is injected).
- `viewModel`: `connection.kind === 'unknown'` (startup lookup in flight) is `loading` with "Checking GitHub connection…", because no account partition is known yet. Stale says "Couldn't check GitHub. Showing the last known requests." when rows exist, else "Couldn't check GitHub." Loading says "Checking review requests…", except when only incomplete empty successes exist and no check is running, where it says the list may be incomplete. Rows sort by `requestedAt ?? firstSeenAt`, ties by id. Pending items before the first complete success show rows with `count: null`.
- `QueueView.render(model)` skips everything when the model is deep-equal (`util.isDeepStrictEqual`) to the last, refreshes the tree only when rows change, and sets `pulley.connection` to `unconnected` or `connected` only when that changes. During the startup lookup the key is now `connected` instead of `unknown`; it only gates the `== unconnected` welcome content.
- `extension.ts` renders from a fresh `store.read()` on every render (which is how other windows' writes appear). It applies every check result through `store.mutate(reconcile, …)` with the current `activeAccountId`; the old ticket/account guards on results are replaced by reconcile's rule 1 and rule 4. `checking` is a per-window in-flight counter. `src/core/checkPresentation.ts` and its test were removed; their row format and messages live in `viewModel`.

## Spec Change Log

- **Iteration 1 (2026-10-01, human-approved intent amendment).**
  - **Triggers:** review triage rows 1 and 2 (intent_gap).
  - **Amended (frozen, approved by the human):**
    - Rule 5: any applied success newer than `lastFailure.at` clears it.
    - Rule 6: deletion now requires `fetchStartedAt > lastIncompleteFetchStartedAt`, and incomplete successes record `lastIncompleteFetchStartedAt`.
    - Added that `Account` field and two matrix rows.
  - **Amended (non-frozen):** Code Map and tasks now carry the review patches (rows 3, 4, 7, 8, 10).
  - **Known-bad states avoided:**
    - An always-incomplete account stuck on `stale` after one failure.
    - A late complete result deleting rows that a newer incomplete check added.
    - `migrate` passing null item entries that crash `activate`.
    - Rows from incomplete checks shown with a firm count message.
  - **KEEP from iteration 0 (all verified passing):**
    - The Implementation Notes decisions.
    - `store.ts` with an injected `StateMemento`, no `vscode` import, an identity-skip write, a `tail.catch` chain, and the once-only log lines.
    - `QueueView` deep-equal skip and rows-only refresh.
    - Table-driven, deep-frozen reconcile tests. Every case must deep-freeze its result too.
    - The controllable-memento store smoke tests.
    - The spike-doc cross-window section and limitations table.
    - The `Store.onDidChange` doc says it also fires when an unchanged transition skips the write.

## Review Triage Log

Review pass 1 (blind-hunter, edge-case-hunter, verification-gap).

| # | Finding | Verdict | Route | Evidence |
|---|---------|---------|-------|----------|
| 1 | Incomplete success never clears an older `lastFailure`, so `viewModel` shows `stale` until a complete success; an account whose checks are always incomplete (SSO-hidden orgs) stays stale forever after one network blip (blind, edge) | medium | intent_gap | `reconcile` clears `lastFailure` only on complete success (frozen rule 6); `viewModel` stale test is `lastFailure.at > (lastSuccessAt ?? 0)` (frozen status rule). Story 1.6 does not change either. |
| 2 | A late complete result (started before a newer incomplete success) deletes rows that the newer check added; they come back with a new `firstSeenAt` (blind, edge ×2) | medium | intent_gap | Rule 4 compares only against `lastAppliedFetchStartedAt`, which incomplete successes never advance (frozen rules 4/6). Contradicts the intent's problem statement ("a partial, late … result can wipe out correct rows"). Reachable with overlapping checks or two windows. |
| 3 | `migrate` accepts any `items` entries; a null/non-object item makes `viewModel` throw in `byAge`/`toRow`, and the first `render()` in `activate` is uncaught (verification-gap other, blind, edge) | medium | patch | `migrate.ts` validates accounts down to `items` only; `extension.ts` calls `render()` synchronously in `activate`. Spec says malformed data → empty v1. |
| 4 | Rows that come only from incomplete checks (`count: null`) show "N reviews are waiting." without the 1.2 "may be incomplete" hint (blind, edge deletion) | medium | patch | Removed `checkMessage` appended `copy.incomplete`; `viewModel` pending branch returns `copy.pending(n)` only. |
| 5 | `extension.ts` store/reconcile/viewModel wiring has no test; old UI-level account-isolation tests were removed (verification-gap, blind) | medium | defer | Pre-verified gap; needs an injection seam in `activate`. Extends the existing 1.2 deferred item on `checkAfterConnect` guards; Story 1.5 rewrites this flow. |
| 6 | Two windows can lose each other's writes because `store.mutate` writes the whole `pulley.state.v1` value from a possibly stale cached read (blind) | maybe-false (medium if true) | defer | Read→transition→`update` is synchronous within a window, so loss depends on how fast another window's `globalState` cache sees a write. The live two-window spike run would settle it. |
| 7 | No test for the loading message when `firstCheckDone` and `checking: true` (verification-gap) | low | patch | `viewModel.test.ts` covers checking with no account and incomplete with not checking only. |
| 8 | No test for the id tie-break in row sorting (verification-gap) | low | patch | Sort test uses distinct keys only. |
| 9 | Reconcile test "complete success after a failure" passes a non-frozen result (blind) | low | patch | Spec task requires deep-frozen inputs. |
| 10 | `connectionPresentation`, `connectionMessage`, `copy.connected` are now referenced only by tests (edge) | low | patch | grep shows no `src` caller outside `connection.ts`. |
| 11 | `Store.onDidChange` doc omits that it also fires when an unchanged transition skips the write (blind) | low | patch | `store.ts` `run` notifies on every non-throwing path. |
| 12 | `lastAttemptAt` (and `lastFailure`) can move backwards on a late result (blind, edge) | low | reject | Mandated by frozen rule 2; fix would edit the spec. Relevant to Story 1.5's scheduler. |
| 13 | One unreadable account makes `migrate` reset every partition (blind, edge) | low | reject | Spec mandates malformed → empty v1; only reachable through storage corruption. |
| 14 | Checks still hit GitHub in read-only mode (blind) | low | reject | Only after a downgrade; nothing is written or shown. |
| 15 | `void view.render` / `this.last` set before `setContext` can strand the context key on rejection (blind, edge) | low | reject | `setContext` via `executeCommand` does not reject in practice; fix adds guards. |
| 16 | The account name ("Connected as …") no longer appears (blind) | low | reject | No UX requirement found in `planning-artifacts/ux-designs`. |
| 17 | Spike doc's observed-propagation field is empty while the task is checked (blind) | low | reject | Doc marks it as a pending human live run; reported to the human. |
| 18 | Other missing tests: late failure, `runEffects` ordering, throwing listener, malformed read logging (blind) | low | reject | Effects are always `[]`; remaining behaviors are simple and partly covered by store tests. |
| 19 | A failure without `accountId` leaves the view on "Checking…" (blind) | false | reject | Every `CheckFailure` producer sets `accountId` (`github.ts:234`); no session returns `undefined` from `checkWithRetry`. |
| 20 | Spec and sprint status disagree (blind) | false | reject | Sprint status stays `in-progress` until step 5 sets `review`; this is workflow state. |
| 21 | `firstSeenAt` uses `now` while markers use `fetchStartedAt` (blind) | false | reject | Frozen rule 5 mandates `firstSeenAt = now`. |
| 22 | `checkOnce()` rejection leaves an unhandled rejection with no re-render (edge) | false | reject | `getToken` returns `undefined` on failure and `runCheck` converts exceptions to `graphql_error`; both are tested. |
| 23 | `runEffects` rejection after a write skips notify (edge) | false | reject | No transition emits effects; `runEffects` is never called. |
| 24 | Stored rows are hidden during the startup lookup (edge) | false | reject | Rows render as soon as the silent lookup resolves, before any check completes; `unconnected` correctly shows none. |

Review pass 2 (iteration 1; blind-hunter, edge-case-hunter, verification-gap).

| # | Finding | Verdict | Route | Evidence |
|---|---------|---------|-------|----------|
| 25 | `extension.ts` store/reconcile/viewModel wiring has no test (verification-gap) | medium | defer | carried: row 5. Not written to deferred-work in pass 1 (moot under loopback), so written now. |
| 26 | Two windows can lose each other's writes (spike doc lists it to confirm) | maybe-false (medium if true) | defer | carried: row 6; live two-window run settles it. |
| 27 | Strict `>` boundaries of the amended rules 5 and 6 are not pinned by equal-timestamp cases (verification-gap, blind) | low | patch | No `reconcile.test.ts` case has `fetchStartedAt` equal to `lastIncompleteFetchStartedAt` or `lastFailure.at`. |
| 28 | After a complete success, a newer incomplete success shows a firm count with no "may be incomplete" hint; the spike doc says such rows show it (blind, edge ×2) | low | patch | `viewModel` keys the hint on `count === null` only; `lastIncompleteFetchStartedAt > lastSuccessAt` is available. |
| 29 | Spike limitation 1 wording reads as per-item filtering; a complete result older than the newest applied incomplete deletes nothing at all (blind) | low | patch | `docs/spikes/live-query.md` table row 1 vs `reconcile.ts` rule 6 guard. |
| 30 | "No session" is logged for a superseded check (edge) | low | patch | `extension.ts:66` logs before the `ticket === latestTicket` check. |
| 31 | No test for a rejected `memento.update` (blind) | low | patch | `store.test.ts` covers only a throwing transition; the documented "rejects that call only" path is untested. |
| 32 | `viewModel` no-mutation test uses a shallow `Object.freeze` (blind) | low | patch | Nested `accounts`/`items` mutation would not throw. |
| 33 | `BacklogAlert.firstConnection` is optional while `notifyBacklog` requires it (blind) | low | patch | `types.ts:52` vs `types.ts:88`; Epic 2 would have to guess. |
| 34 | A late failure older than a newer applied success re-sets `lastFailure`, briefly showing `stale` (edge ×3) | low | reject | Frozen rule 3 sets `lastFailure` on every failure and the frozen stale rule compares with `lastSuccessAt`; fix would edit the spec. Needs overlapping checks; clears on the next success. |
| 35 | A late result overwrites item fields refreshed by a newer one (blind, edge) | low | reject | Frozen rule 5 upserts on every applied success; fields self-correct on the next check; fix adds per-item bookkeeping. |
| 36 | Stale message drops the incomplete hint for rows from incomplete checks (blind) | low | reject | Stale already says the rows are the last known; fix adds message branching. |
| 37 | `migrate` does not check item key = `id`, item field types, or account marker types (blind, edge ×2) | low | reject | Only reachable through storage corruption; the crash path (null items, missing `firstSeenAt`) is already covered. |
| 38 | Architecture guard test in `connection.test.ts` is weak and misplaced (blind) | low | reject | It is an extra guard beyond the spec; weakness causes no wrong behavior. |
| 39 | `lastSuccessAt` and `lastAppliedFetchStartedAt` have the same doc comment (blind) | false | reject | Both are AD-4 fields that rule 6 sets together; nothing in this code reads them inconsistently. |
| 40 | Store tests run only under `npm test`, not `test:core` (verification-gap other) | false | reject | The spec places the store test in `test/smoke` and verifies it with `npm test`. |
