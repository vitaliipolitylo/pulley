- source_spec: `D:\projects\Pulley\_bmad-output\implementation-artifacts\spec-1-1-set-up-initial-project-from-starter-template.md`
  summary: Extract the stale-lookup ticket guard in `src/extension.ts` `activate` into a testable helper and cover out-of-order resolution.
  evidence: Removing `if (ticket !== latestTicket) return;` passes every test today; Story 1.5's generation/scheduler work is the natural place to test it.
- source_spec: `D:\projects\Pulley\_bmad-output\implementation-artifacts\spec-1-2-find-direct-review-requests-across-github.md`
  summary: Cover the result-acceptance guards in `src/extension.ts` `checkAfterConnect` (stale ticket and account mismatch) with tests once Story 1.5's scheduler replaces the ad-hoc check trigger.
  evidence: Removing `ticket !== latestTicket` or `result.accountId !== accountId` in `checkAfterConnect` passes every test today, so rows from a previous account could render after a switch. On a mismatch the function also returns without rendering, relying on a session-change event to re-render.
