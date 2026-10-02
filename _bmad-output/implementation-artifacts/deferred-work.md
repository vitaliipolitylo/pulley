- source_spec: `D:\projects\Pulley\_bmad-output\implementation-artifacts\spec-1-1-set-up-initial-project-from-starter-template.md`
  summary: Extract the stale-lookup ticket guard in `src/extension.ts` `activate` into a testable helper and cover out-of-order resolution.
  evidence: Removing `if (ticket !== latestTicket) return;` passes every test today; Story 1.5's generation/scheduler work is the natural place to test it.
- source_spec: `D:\projects\Pulley\_bmad-output\implementation-artifacts\spec-1-2-find-direct-review-requests-across-github.md`
  summary: Cover the result-acceptance guards in `src/extension.ts` `checkAfterConnect` (stale ticket and account mismatch) with tests once Story 1.5's scheduler replaces the ad-hoc check trigger.
  evidence: Removing `ticket !== latestTicket` or `result.accountId !== accountId` in `checkAfterConnect` passes every test today, so rows from a previous account could render after a switch. On a mismatch the function also returns without rendering, relying on a session-change event to re-render.
- source_spec: `D:\projects\Pulley\_bmad-output\implementation-artifacts\spec-1-3-keep-the-queue-accurate-across-checks.md`
  summary: Add a smoke test that drives `activate` in `src/extension.ts` with a fake `globalState` and a stubbed check, asserting that results reach `store.mutate(reconcile)` with the current `activeAccountId`, that rows render after the write, and that the checking message clears.
  evidence: Story 1.3 replaced the 1.2 ticket/account guards with reconcile rule 1 and store-driven rendering. Swapping the `activeAccountId` source, dropping the `store.onDidChange` subscription, or skipping the post-failure `render()` passes every test today. `activate` needs an injection seam first; Story 1.5 rewrites this flow.
- source_spec: `D:\projects\Pulley\_bmad-output\implementation-artifacts\spec-1-3-keep-the-queue-accurate-across-checks.md`
  summary: Confirm in a live two-window run whether `store.mutate`'s whole-value write to `pulley.state.v1` can drop another window's write, and narrow the storage layout if it does.
  evidence: Unverified (maybe-false; medium if true). Read→transition→`update` is synchronous within a window, so loss depends on how quickly another window's `globalState` cache sees a write. `docs/spikes/live-query.md` has the run steps.
- source_spec: `D:\projects\Pulley\_bmad-output\implementation-artifacts\spec-1-4-understand-and-open-a-waiting-review.md`
  summary: Move the `pulley.debugSeed` handler body out of `src/extension.ts` into a testable `src/shell` function and smoke-test its connection guard and its seed of 50 items into the active account.
  evidence: Flipping the `connection.kind !== 'connected'` guard, passing `activeAccountId: undefined`, or dropping the `setContext('pulley.development')` call passes every test today. The smoke host runs in Test mode, where the command isn't registered.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-refresh-and-schedule-queue-checks.md`
  summary: Extract the scheduler wiring in `src/extension.ts` (runQueueCheck, Refresh progress-once, Connect manual trigger, config restart, lookup gating) into a testable factory and cover it, including the "No session" matrix row where it actually lives.
  evidence: Story 1.5 review found these behaviors run in no automated test; the scheduler tests use a fake runCheck and the "No session" case wraps checkWithRetry directly, so regressions in the activate closures would ship unnoticed.
