---
title: 'Story 2.5: Validate the experience with developers'
type: 'chore'
created: '2026-10-02'
status: 'done'
baseline_commit: '4b34c0677c12e2bf16d591ade045c8c7df15d247'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-4-package-and-technically-dogfood-the-calm-mvp.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The release decision needs evidence that real developers can find and open a waiting review quickly and don't find Pulley intrusive (NFR-4, SM-3 with assumption A8). Nothing yet defines how to run that test, what counts as passing, or how failures are triaged before publishing.

**Approach:** Write a moderated usability test protocol and a results record in `docs/validation/`. A human facilitator runs it with 3–5 developers on the Story 2.4 `.vsix`, then records the outcomes, the pass/fail calculation, and a triage of every failure before Story 2.6.

## Boundaries & Constraints

**Always:**
- **Protocol** (`docs/validation/usability-protocol.md`):
  - **Participants:** 3–5 developers who use VS Code and receive GitHub review requests. No Pulley contributors.
  - **Setup:** the installed `.vsix` from Story 2.4, the participant's own GitHub account (or a prepared test account with at least 2 waiting requests across 2 repositories), and no folder open. Half of the sessions move the view to the bottom Panel before starting, and the rest keep the sidebar.
  - **Task 1:** "Find a pull request that is waiting for your review and open it." It is timed from the prompt until the PR page opens. Success means 2 minutes or less with no facilitator hint.
  - **Task 2:** while the participant codes in VS Code, the facilitator requests one new review. Observe whether they notice it, act on it, and react to the single notification. Timing (A11, E6):
    - For the session, `pulley.checkIntervalMinutes` is set to 5 before Pulley first connects. Restore it afterwards.
    - Before Task 1, Pulley has connected, and any first-connection aggregate notification has already appeared, so prior state can't mix into Task 2.
    - Task 2 starts right after a check (the facilitator presses Refresh and waits for it to finish). The request is made within the first minute.
    - The next ordinary check then runs within about 6 minutes of the request (5-minute interval plus at most 60 s of jitter).
    - Observation lasts until 5 minutes after the notification appears, up to 15 minutes in total.
    - If no notification appears within 6 minutes of the request while the VS Code window was focused, record a **delivery failure**, not a missed notice. Before recording it, the facilitator checks Output → Pulley and records the cause: no complete check after the request, a failed check, or a partial check. It is still a delivery failure whatever the cause.
    - Notifications are delivered only to a focused window (B9). If the participant had switched away from VS Code, the notification is expected when they return; record the focus switch. It counts as a delivery failure only if no notification appears within 1 minute of the window regaining focus after the 6 minutes have passed. If the participant is still away at the 15-minute cap, the facilitator asks them to return to VS Code and waits 1 minute before classifying.
  - **Interview questions:**
    - Is the count understandable?
    - Can you tell which repository each request belongs to?
    - What does the corgi's current state mean to you?
    - What would you do if Pulley said it couldn't check GitHub?
    - Was anything intrusive or nagging?

    The facilitator records verbatim quotes on intrusiveness.
  - **Privacy:** no screen recording of PR contents without consent. Participant names are stored as P1–P5 only.
- **Results record** (`docs/validation/usability-results.md`):
  - A per-participant table: placement, Task 1 time and success, notification delivered (yes / **delivery failure**), notification noticed (yes/no), described as intrusive (yes/no plus quote), and comprehension of count, repository, corgi, and recovery.
  - A pass calculation: **pass** = (participants with Task 1 success AND not intrusive AND no delivery failure) ≥ 4 of 5, or 3 of 3 when only three take part. With 4 participants the bar is 4 of 4. That is the stricter reading, because PRD assumption A8 defines only the 5- and 3-person bars. A participant with a delivery failure counts as not passing (B8), and the failure is triaged.
  - A failure and assumption-change log.
  - A triage table: each issue gets one of `fix before 2.6` (a new spec), `accept`, or `defer` (a `deferred-work.md` entry), plus an owner.
  - A final **release decision** line: **Go** or **No-go**. Story 2.6 requires Go, and every `fix before 2.6` issue closed with its spec `done` (A12, E7).
- The two files are linked from `docs/dogfood/dogfood-0.1.0.md`'s decision section.

**Never:**
- No product or code changes in this story. Fixes go to new specs.
- No telemetry or analytics to measure the tasks; timing is done by hand.
- No participant-identifying data in the repository.

</frozen-after-approval>

## Code Map

- `docs/dogfood/dogfood-0.1.0.md` (from Story 2.4) -- add links to the protocol and results.
- `_bmad-output/planning-artifacts/prds/prd-Pulley-2026-09-29/prd.md` -- the source of the NFR-4 and SM-3 (A8) thresholds. Reference it; do not copy it.
- `_bmad-output/planning-artifacts/ux-designs/ux-Pulley-2026-09-29/EXPERIENCE.md` -- the UJ-1 and UJ-2 journeys, which the tasks mirror.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- the destination for `defer` triage entries, in its existing format.

## Tasks & Acceptance

**Execution:**
- [x] `docs/validation/usability-protocol.md` -- per Always.
- [x] `docs/validation/usability-results.md` -- an empty template with tables, the pass formula, triage, and decision.
- [x] `docs/dogfood/dogfood-0.1.0.md` -- links.

**Acceptance Criteria:**
- Given the protocol, when a facilitator who has not read the planning docs follows it, then they can run a session end to end without asking how to set up, time, or score it.
- Given 3–5 completed sessions recorded in the results file, when the pass formula is applied, then the result is unambiguous, and every failure has a triage outcome before Story 2.6 starts.
- Given Task 2 run per the timing rules, when no notification arrives in time while the window was focused, then the record shows a delivery failure, distinct from a missed notice, and the participant does not pass.
- Given a tester in Panel placement, when they are interviewed, then the record notes whether the count, repository names, corgi state, and recovery actions were understood without extra alerts.

## Verification

**Manual checks:**
- Proofread both documents against NFR-4 and SM-3 (A8) in `prd.md`: the participant counts and the 2-minute threshold match.
- After the human runs the sessions, the results file has no empty required cells and a release decision is recorded.

## Implementation Notes

## Spec Change Log

- **2026-10-03, Epic 2 spec review fixes:** finding IDs cited inline (A1–A15 = adversarial findings 1–15, E1–E7 = edge-case findings 1–7) refer to `review-epic-2-specs-2026-10-03.md`, not PRD assumptions such as A8. B- and X-IDs refer to the Review Triage Log of `spec-epic-2-spec-review-fixes.md`. This story resolves A11, E6, B8, and B9, and states the Go decision Story 2.6 requires (A12, E7).

## Review Triage Log

| # | Source | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| R1 | blind, edge | Flat TR+6:00 deadline ignores check time; a request made seconds after T0 can be logged as a false delivery failure | medium | `src/shell/scheduler.ts` re-arms the periodic timer when a check settles: start ≤ T0+5:00+<60 s jitter, plus check duration | patch: TR between T0+0:30 and T0+1:00 |
| R2 | blind | No delivery-failure cause for a complete check that misses the new PR (search lag) | low | The cause list names only missing, failed, and partial checks | patch |
| R3 | blind | Task 1 route not recorded; a github.com success counts as Pulley success | medium | SM-3 says "from Pulley"; results tables had no route column | patch |
| R4 | blind | No informed-consent step | low | Consent covered screen recording only | patch |
| R5 | blind, edge | Wrap-up never signs the GitHub account out | medium | Uninstalling leaves the session in VS Code Accounts | patch |
| R6 | blind | Do Not Disturb turned off in Setup, never restored | low | No restore step in Wrap-up | patch |
| R7 | blind, edge | Profile commands omit `--profile`; the application-scoped interval is shared across profiles, yet Wrap-up allowed "delete the test profile" | medium | `package.json` `pulley.checkIntervalMinutes` has `"scope": "application"` | patch |
| R8 | blind | Output → Pulley in Setup step 9 conflicts with Panel placement | low | Output and the Review Queue share the Panel | patch |
| R9 | edge | A participant using their own account sees the Pulley view while signing in during setup | medium | Setup step 5 had the sign-in in the Pulley view | patch |
| R10 | edge | T0 Refresh in the view reveals the hidden view | low | Step 10 hides the view; T0 used the view button | patch |
| R11 | edge | Replacement participant IDs fall outside P1–P5 and break the placement alternation | low | "Assign IDs in session order" plus replacement | patch |
| R12 | edge | Optional stopping: adding sessions after a Fail can turn it into a Pass | medium | "Fewer than 3 … run more sessions" with no fixed target | patch |
| R13 | edge | Task 2 end undefined when no notification appears | low | End row was relative to TN only | patch |
| R14 | edge | A PR opened in an in-editor view has no Task 1 stop mark | low | Stop mark named only the browser | patch |
| R15 | edge | "Comprehension problem" undefined for triage completeness | low | The term was used in the log and triage with no definition | patch |
| R16 | blind, edge | With 3 sessions only one participant uses the Panel | low | Alternation P2/P4; the spec says "half" | patch: state the limit and log it |
| R17 | edge | A Go after `fix before 2.6` specs publishes a build developers never tested | medium | Already deferred as B10 in spec 2.6's change log; not caused by this story | defer |
| R18 | blind | The sprint-status change is missing from the reviewed diff | false | Excluded on purpose: it is workflow bookkeeping, updated to in-progress in `sprint-status.yaml` | reject |
