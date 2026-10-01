- source_spec: `D:\projects\Pulley\_bmad-output\implementation-artifacts\spec-1-1-set-up-initial-project-from-starter-template.md`
  summary: Extract the stale-lookup ticket guard in `src/extension.ts` `activate` into a testable helper and cover out-of-order resolution.
  evidence: Removing `if (ticket !== latestTicket) return;` passes every test today; Story 1.5's generation/scheduler work is the natural place to test it.
