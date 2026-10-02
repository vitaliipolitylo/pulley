# Epic 2 spec review

Reviewed 2026-10-03 using bmad-review. Scope: all six Story 2.1–2.6 specs. Context and explicitly referenced implementation were checked for grounding; this is a specification review, not an implementation test run. Specs are unchanged.

22 behavioral findings (15 adversarial, 7 edge-case), one actionable structural suggestion, two preservation decisions, and two prose edits. No severity or ranking is assigned.

Independent lenses: adversarial, edge-case-hunter, structure. Prose ran after structure. Verification-gap is code-only and did not apply. Customization resolution failed because uv could not access its Python installation directory; shipped defaults were used, and no project bmad-review overrides were found. Editorial word metrics succeeded using bundled Python.

Overlap is retained: failure-time delivery, cross-midnight reminder delivery, observation timing, and the usability release gate appear in both behavioral passes. Startup account readiness and partial-startup flag handling are related but distinct. The cross-window finding concerns stale writes restoring pending state, beyond the architecture's accepted simultaneous-focus race. Submission-failure semantics require a decision about the limits of the exactly-once guarantee; retry is a proposed option, not an existing requirement.

These specs help implementers deliver Epic 2 and human reviewers verify behavior and release gates. Editorial model: Prompt/Task Definition (Functional), with a consistent reference schema. Preserve concise technical wording, identifiers, rule references, checklists, and gentle user-facing copy.

## adversarial

### 1. Activation invokes focus and visibility transitions before silent account lookup resolves.

Location: [spec-2-1-get-one-useful-alert-for-a-new-request.md — Shell wiring; Story 2.3 queueViewed](D:/projects/Pulley/_bmad-output/implementation-artifacts/spec-2-1-get-one-useful-alert-for-a-new-request.md)

Consequence: Pending alerts await a later poll/focus change; the visible queue can retain newSignal.

Suggested guard or clarification: After account lookup settles or changes accounts, invoke windowFocused if focused and queueViewed if visible; test persisted pending alerts at startup.

### 2. A focused failure encounters pending backlogAlert: delivery after any result conflicts with failures never touching it.

Location: [spec-2-1-get-one-useful-alert-for-a-new-request.md — Shared delivery helper; Story 2.2 reminder invariants](D:/projects/Pulley/_bmad-output/implementation-artifacts/spec-2-1-get-one-useful-alert-for-a-new-request.md)

Consequence: Implementers must violate one of the two required behaviors.

Suggested guard or clarification: Choose whether failure-time delivery is allowed; align helper, invariant and focused-failure tests.

### 3. Repeated incomplete successes before the first complete success can repeatedly satisfy the baseline predicate.

Location: [spec-2-2-return-to-a-backlog-with-a-daily-limit.md — First connection](D:/projects/Pulley/_bmad-output/implementation-artifacts/spec-2-2-return-to-a-backlog-with-a-daily-limit.md)

Consequence: Incomplete checks can repeatedly re-arm first-connection alerts outside the daily limit.

Suggested guard or clarification: Define first connection as result.ok && result.complete && previous.lastSuccessAt === undefined; specify partial-baseline handling.

### 4. A day-D pending reminder delivers on D+1, then another eligible startup on D+1 sees the recorded date D.

Location: [spec-2-2-return-to-a-backlog-with-a-daily-limit.md — Ongoing reminder and Delivery](D:/projects/Pulley/_bmad-output/implementation-artifacts/spec-2-2-return-to-a-backlog-with-a-daily-limit.md)

Consequence: Two aggregate notifications can appear on one local day.

Suggested guard or clarification: Specify delivery-day accounting, pass today to focus delivery if needed, and test midnight then startup.

### 5. An undelivered firstConnection alert crosses midnight and an ongoing success replaces it with firstConnection: false.

Location: [spec-2-2-return-to-a-backlog-with-a-daily-limit.md — Ongoing reminder](D:/projects/Pulley/_bmad-output/implementation-artifacts/spec-2-2-return-to-a-backlog-with-a-daily-limit.md)

Consequence: First-connection effect metadata is overwritten before delivery.

Suggested guard or clarification: Preserve pending first-connection intent; define reminder-date advancement and test this sequence.

### 6. An ok mutate resolves after rule-1 rejection, rule-4 ignored result or read-only operation; the shell clears the flag.

Location: [spec-2-2-return-to-a-backlog-with-a-daily-limit.md — startupReminderDue](D:/projects/Pulley/_bmad-output/implementation-artifacts/spec-2-2-return-to-a-backlog-with-a-daily-limit.md)

Consequence: A startup reminder is consumed before the intended account's queue is evaluated.

Suggested guard or clarification: Expose whether an eligible success applied and clear the flag only on that outcome.

### 7. showMessage throws or rejects after alert: shown has been persisted.

Location: [spec-2-1-get-one-useful-alert-for-a-new-request.md — Notifier behaviour and Store effects](D:/projects/Pulley/_bmad-output/implementation-artifacts/spec-2-1-get-one-useful-alert-for-a-new-request.md)

Consequence: The only alert can be permanently lost and a rejection can escape the notifier.

Suggested guard or clarification: Specify submission-failure semantics; catch sync/async failures without blocking; decide whether failed submission retries or is consumed.

### 8. The active account changes during memento.update; the notifier resolves item-only effects using the current account.

Location: [spec-2-1-get-one-useful-alert-for-a-new-request.md — Store effects and createNotifier](D:/projects/Pulley/_bmad-output/implementation-artifacts/spec-2-1-get-one-useful-alert-for-a-new-request.md)

Consequence: The alert is skipped or composed from the wrong partition while its source remains shown.

Suggested guard or clarification: Bind effect execution to the originating account or carry accountId with the snapshot; test account switch during deferred write.

### 9. Mascot changes without PR-row changes, but QueueView currently refreshes its provider only when rows differ.

Location: [spec-2-3-read-queue-state-at-a-glance.md — Corgi placement and Rendering](D:/projects/Pulley/_bmad-output/implementation-artifacts/spec-2-3-read-queue-state-at-a-glance.md)

Consequence: Corgi artwork and text remain stale despite a correct view model.

Suggested guard or clarification: Refresh for status-row presence, label or icon changes; test mascot-only transitions.

### 10. Partial errors, revoked sign-in or 50-item scenarios lack reproducible setup or a fixture-build procedure.

Location: [spec-2-4-package-and-technically-dogfood-the-calm-mvp.md — Dogfood checklist](D:/projects/Pulley/_bmad-output/implementation-artifacts/spec-2-4-package-and-technically-dogfood-the-calm-mvp.md)

Consequence: Installed-build evidence cannot be completed consistently or compared with the release candidate.

Suggested guard or clarification: Provide prerequisites and repeatable triggers, including fixture-build steps and their relation to the release artifact.

### 11. A review arrives during ten-minute observation with the default fifteen-minute polling interval plus jitter.

Location: [spec-2-5-validate-the-experience-with-developers.md — Protocol Task 2](D:/projects/Pulley/_bmad-output/implementation-artifacts/spec-2-5-validate-the-experience-with-developers.md)

Consequence: Usability evidence measures an alert that had no opportunity to appear.

Suggested guard or clarification: Specify request/check scheduling and observation duration guaranteeing an ordinary eligible poll; distinguish delivery failure from non-noticing.

### 12. Usability records No-go or unresolved fix-before-2.6 issues, but all failures are triaged.

Location: [spec-2-6-publish-pulley-with-a-support-path.md — Entry gate](D:/projects/Pulley/_bmad-output/implementation-artifacts/spec-2-6-publish-pulley-with-a-support-path.md)

Consequence: Release preparation proceeds against failed validation or unresolved blocking fixes.

Suggested guard or clarification: Require affirmative usability release approval and verified closure of all fix-before-2.6 issues.

### 13. Packaged icon, preview metadata or README changes after dogfood, but version-bump condition mentions only dogfood code fixes.

Location: [spec-2-6-publish-pulley-with-a-support-path.md — Release identity](D:/projects/Pulley/_bmad-output/implementation-artifacts/spec-2-6-publish-pulley-with-a-support-path.md)

Consequence: Different VSIX artifacts share 0.1.0, contradicting the tested-bits guarantee.

Suggested guard or clarification: Apply artifact-identity rules to all packaged changes, or explicitly scope same-version guarantees to the final candidate.

### 14. Step 1 requires CI on the tagged commit, but step 5 creates the tag.

Location: [spec-2-6-publish-pulley-with-a-support-path.md — Release procedure steps 1 and 5](D:/projects/Pulley/_bmad-output/implementation-artifacts/spec-2-6-publish-pulley-with-a-support-path.md)

Consequence: The release procedure blocks or requires improvisation about the verified commit.

Suggested guard or clarification: Verify CI on the identified release commit, then tag that exact commit; alternatively tag before verification.

### 15. Dynamic endpoints or sensitive values aliased through reason/detail/url evade literal and parameter-name scans.

Location: [spec-2-6-publish-pulley-with-a-support-path.md — Privacy guard test](D:/projects/Pulley/_bmad-output/implementation-artifacts/spec-2-6-publish-pulley-with-a-support-path.md)

Consequence: The privacy guard passes while unapproved network calls or sensitive logs remain possible.

Suggested guard or clarification: Add injected-fetch destination assertions and runtime log tests with sentinel tokens/titles through errors and rejected URLs.

## edge-case-hunter

### 1. Two windows read pending state before either window's write becomes visible.

Location: [_bmad-output/implementation-artifacts/spec-2-1-get-one-useful-alert-for-a-new-request.md:32](D:/projects/Pulley/_bmad-output/implementation-artifacts/spec-2-1-get-one-useful-alert-for-a-new-request.md:32)

Consequence: A stale write restores pending alerts, allowing duplicate notifications after focus changes.

Suggested guard or clarification: Serialize read-transition-write across windows, with one owner for notification delivery.

### 2. A focused failure or rule-4 no-op encounters a pending backlog reminder.

Location: [_bmad-output/implementation-artifacts/spec-2-2-return-to-a-backlog-with-a-daily-limit.md:29-35](D:/projects/Pulley/_bmad-output/implementation-artifacts/spec-2-2-return-to-a-backlog-with-a-daily-limit.md:29)

Consequence: The unconditional delivery helper changes reminder state despite explicit failure and no-op prohibitions.

Suggested guard or clarification: Specify whether delivery bypasses the failure/no-op invariants; guard deliverPending accordingly.

### 3. Yesterday's pending reminder is delivered today, followed by another startup today.

Location: [_bmad-output/implementation-artifacts/spec-2-2-return-to-a-backlog-with-a-daily-limit.md:27-35](D:/projects/Pulley/_bmad-output/implementation-artifacts/spec-2-2-return-to-a-backlog-with-a-daily-limit.md:27)

Consequence: Two aggregate notifications appear on one local day despite the daily limit.

Suggested guard or clarification: Record the actual delivery date and suppress further aggregate delivery on that date.

### 4. The first successful ok mutate applies an incomplete startup result.

Location: [_bmad-output/implementation-artifacts/spec-2-2-return-to-a-backlog-with-a-daily-limit.md:26](D:/projects/Pulley/_bmad-output/implementation-artifacts/spec-2-2-return-to-a-backlog-with-a-daily-limit.md:26)

Consequence: An empty partial result consumes the startup reminder before existing requests are recovered.

Suggested guard or clarification: Keep startupReminderDue until a complete applied success, or explicitly specify partial-result reminder behavior.

### 5. A new request arrives while the queue is already visible.

Location: [_bmad-output/implementation-artifacts/spec-2-3-read-queue-state-at-a-glance.md:41](D:/projects/Pulley/_bmad-output/implementation-artifacts/spec-2-3-read-queue-state-at-a-glance.md:41)

Consequence: A viewed request retains the new mascot until another poll or visibility change.

Suggested guard or clarification: Apply queueViewed after rendering new rows when treeView.visible is already true.

### 6. Task 2 starts just after a poll with the default fifteen-minute interval.

Location: [_bmad-output/implementation-artifacts/spec-2-5-validate-the-experience-with-developers.md:28](D:/projects/Pulley/_bmad-output/implementation-artifacts/spec-2-5-validate-the-experience-with-developers.md:28)

Consequence: The ten-minute session ends before notification delivery, invalidating intrusiveness and noticing measurements.

Suggested guard or clarification: Set a documented test interval and request timing that guarantees notification delivery during observation.

### 7. Usability results record No-go with all failures triaged.

Location: [_bmad-output/implementation-artifacts/spec-2-6-publish-pulley-with-a-support-path.md:27-33](D:/projects/Pulley/_bmad-output/implementation-artifacts/spec-2-6-publish-pulley-with-a-support-path.md:27)

Consequence: Release preparation proceeds despite failed validation or unresolved release-blocking fixes.

Suggested guard or clarification: Require an affirmative usability release decision and closure of every fix-before-2.6 issue.

## Editorial structure and prose

| Pass | Original Text | Revised Text | Changes |
| --- | --- | --- | --- |
| structure | Story 2.1 §Design Notes: Why a baseline predicate instead of firstCheckDone (55 body words), after three empty log sections. | MOVE unchanged rationale immediately before §Code Map, outside the frozen block. | Defines the AD-7 deviation before implementation mapping. Moves 55 words; saves 0. |
| structure | Stories 2.1–2.6: constraints, matrices, tasks/acceptance and verification. | PRESERVE separate sections. | Different purposes: define, illustrate, assign, validate. Saves 0 words. |
| structure | Stories 2.1–2.6: empty Implementation Notes, Spec Change Log and Review Triage Log. | PRESERVE template scaffolding. | Reserved implementation and review records; bodies contain 0 words. Saves 0. |
| prose | Stories 2.1–2.6 §Verification: Manual checks (if no CLI): | Manual checks: | Human validation and Marketplace checks remain necessary when CLI verification is available. |
| prose | Story 2.1 matrix: Still pending — X shown, later polls, reloads, or a second window. | Scenario label: Already shown | Aligns the label with delivered alert state. |

Exact staged collection count: 6,396 words. Structure: one actionable recommendation and two preservation decisions; reduction 0 words (0%). No length target was supplied. The move preserves all content. No prose edit is needed inside the relocated rationale.

## Verification limits

No product tests or live VS Code sessions were run: these findings concern requirements and reachable sequences. Multi-window behavior and notification submission failures remain static contract findings, not live reproductions. External tooling version/support claims were not revalidated. Guard snippets are recommendations, not implemented changes.

