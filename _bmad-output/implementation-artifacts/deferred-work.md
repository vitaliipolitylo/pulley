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
- source_spec: none
  summary: Add an injection seam to `activate` in `src/extension.ts` and smoke-test that startup runs a queue check (rows and lastSuccessAt persist without Refresh) and that a session change to account B discards account A's in-flight result.
  evidence: Split from the epic 1 review fix-up (review-epic-1-2026-10-02.md adversarial #11, verification-gap #1 and #2); test/smoke/activation.test.ts only asserts ext.isActive.
- source_spec: none
  summary: Complete the live-query spike in `docs/spikes/live-query.md` with an authenticated GitHub run, including SSO/restricted-organization observations, before treating removal behavior as verified.
  evidence: Split from the epic 1 review fix-up (review-epic-1-2026-10-02.md adversarial #10); needs a live authenticated GitHub session and cannot be done by the agent.
- source_spec: `_bmad-output/implementation-artifacts/spec-epic-1-review-fixes.md`
  summary: Once `activate` has an injection seam, smoke-test that a rejected `store.mutate` in `applyResult` renders stale with Refresh and the write-failure message, and that the flag clears after the next successful save or an account switch.
  evidence: Review of the epic 1 fix-up found that removing `writeFailed = true`, its reset, or its pass-through in `render` passes every test; only the pure viewModel branch is tested.

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-2-spec-review-fixes.md`
  summary: Story 2.6 can publish code that was never dogfooded or usability-tested, because fix-before-2.6 changes land after the 0.1.0 dogfood build and only a smoke install guards the 0.1.1 release.
  evidence: Epic 2 spec review loop (B10/B2-13). The original 2.6 already allowed post-dogfood fixes; consider re-running the notification and reminder dogfood rows on the release SHA.
- source_spec: `_bmad-output/implementation-artifacts/spec-epic-2-spec-review-fixes.md`
  summary: The Story 2.4 dogfood checklist has no scenarios for a next-day startup reminder, a gap reminder, unfocused-then-focus delivery, the Open Pull Request / Open Review Queue buttons, or a pending alert at startup.
  evidence: Epic 2 spec review loop (B2-10b). These behaviors are specified in 2.1 and 2.2 but are never exercised on an installed build.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-get-one-useful-alert-for-a-new-request.md`
  summary: Update architecture AD-7 (and epic-2-context) so the new/backlog gap is measured from the previous `lastSuccessAt`, not `lastAttemptAt`.
  evidence: Story 2.1 review loop 1 changed the predicate with the user's approval because a failed attempt shortened the gap and turned a closed-VS-Code backlog into per-item notifications; the planning docs still state the old rule.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-read-queue-state-at-a-glance.md`
  summary: Corgi SVGs use one fixed outline color with no dark/high-contrast variant, so pose details may be illegible on dark themes.
  evidence: Unverified (medium if true); settled by running the dark and high-contrast rows of the corgi checks in docs/spikes/view-prototype.md.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-read-queue-state-at-a-glance.md`
  summary: The older, waiting, and backlog corgi poses differ only by hairline details and may be indistinguishable at tree-icon size.
  evidence: Unverified (medium if true); settled by viewing media/corgi/*.svg at actual 16 px size in the manual check.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-read-queue-state-at-a-glance.md`
  summary: The badge render and pulley.backlogThreshold re-render wiring in activate() has no test at its consumer.
  evidence: Removing statusCount.render, hard-coding threshold 5, or deleting the THRESHOLD_SETTING branch passes every test; needs an activation-level harness with an injectable session.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-package-and-technically-dogfood-the-calm-mvp.md`
  summary: Add a self-test for `scripts/check-package-files.mjs` so its allowlist and token-scan failure branches are exercised (out-of-allowlist path, `gh*_`/`github_pat_`/literal Bearer in the bundle, and `bearer ${...}` placeholders passing).
  evidence: No test under `test/` references the script; CI only runs it on an already-clean package, so a loosened allowlist or broken pattern would pass silently. Requires extracting the matching into an importable helper with fixtures under `test/shell/`.
- source_spec: `D:\projects\Pulley\_bmad-output\implementation-artifacts\spec-2-5-validate-the-experience-with-developers.md`
  summary: Decide whether a usability Go reached after `fix before 2.6` specs land needs the fixed build re-dogfooded (or re-tested) before Story 2.6 publishes it.
  evidence: The Go rule in `docs/validation/usability-results.md` needs only those specs `done`. The published build then contains code developers never used. This is the same gap as B10, which spec 2.6's change log deferred.
