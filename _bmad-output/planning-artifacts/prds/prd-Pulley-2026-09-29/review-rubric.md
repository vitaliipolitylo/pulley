# PRD Quality Review — Pulley

## Overall verdict

This is an adequate, focused PRD for a small solo project: the calm alert plus persistent queue thesis is clear, and the mascot has a defined role. Before stories are written, the request-cycle detection rule and reminder behavior need to be made implementable and internally consistent; the current success test for usefulness also needs an observable task outcome.

## Decision-readiness — adequate

The Purpose and vision, Scope boundaries, and Open decisions make the main product choice explicit: one workspace repository, direct requests, a quiet queue, and a restrained corgi. The document acknowledges that request age, requester identity, VS Code placement, and private repository access need validation. These are real implementation decisions and are not falsely presented as settled.

The harder trade-off is the promise to alert once per **request cycle** while checking periodically. A request can be withdrawn and reissued between checks; snapshot comparison alone cannot distinguish that from an uninterrupted request. The PRD does not yet say whether event history is required or whether that case is knowingly outside the promise.

### Findings

- **high** Resolve the request-cycle detection promise (§Terms, FR-7, FR-8, Open decisions 1 and 4) — A1 defines a later re-request as new, and FR-8 promises one alert for each, but periodic queue snapshots may never observe the gap between request cycles. *Fix:* Specify the source of cycle identity (for example, matching GitHub review-request events) and the supported edge cases, or narrow the promise to newly observed pending requests and explicitly exclude cycles missed between checks.

## Substance over theater — strong

The single target user drives the queue, one alert, and direct open action. The corgi states and kind copy express the product's distinct experience without pretending to be a productivity metric. The quality statements are mostly tied to concrete behaviors, such as preserving stale data after a failed check and capping alerts. SM-4 is a legitimate learning objective for this project, though it is separate from evidence that Pulley helps reviewers.

### Findings

No substantive finding.

## Strategic coherence — adequate

The PRD has a coherent thesis: review requests become visible inside the editor without a noisy notification stream. The scope follows it, with AI and broad pull request management excluded. SM-1 and SM-2 validate trust and alert restraint; the counter-metric names interruption cost.

SM-3 is the only measure of the central user benefit, but it mostly asks for a subjective impression. A participant could say Pulley was pleasant while still failing to find or return to a request. Also, the PRD makes cadence and the backlog threshold configurable from the start, although the thesis does not depend on tuning either setting.

### Findings

- **medium** Measure the actual review-return task (§Success measures, SM-3) — “can notice and return to reviews without describing Pulley as intrusive” has no task, observation window, or success condition for finding and reopening a request. *Fix:* Run a short scenario where participants notice a newly requested PR and later reopen it from the queue; record completion and perceived interruption separately, then keep the proposed small-sample threshold as a dogfood signal.
- **low** Challenge two MVP settings (§FR-5, FR-13) — Configurable polling and backlog thresholds add settings, persistence, and tests before there is evidence that users need them. *Fix:* Treat 15 minutes and five requests as fixed pilot defaults unless dogfooding reveals a concrete need to expose either setting.

## Done-ness clarity — adequate

Most FRs have observable consequences: requests enter and leave the queue after successful checks, failed checks retain stale items, notifications link to the correct PR, and the queue distinguishes clear from unavailable. This is enough to derive the core stories. The exact presentation can appropriately wait for UX and feasibility work.

The notification rules are not fully testable as written because FR-9 uses “at most one” on first connection and “may give one” later, while UJ-2 implies one reminder and SM-2 requires one first-connection alert. FR-13 also calls for a “new work” corgi state without defining when it stops being new. The first ambiguity affects alert acceptance tests; the second can be settled in UX.

### Findings

- **medium** Choose a single backlog notification rule (§UJ-2, FR-9, SM-2) — The journey expects one reminder, FR-9 permits zero, and SM-2 requires one first-connection alert. *Fix:* State exactly when an aggregate alert is sent on first connection and startup, including whether a user who already saw it that local day gets another; align the journey and metric with that rule.
- **low** Bound the “new work” mascot state (§FR-10, FR-13) — The states include excited/new and backlog, but the transition after an alert or across a restart is undefined. *Fix:* Define whether “new” lasts until the next successful check, the current session, or a user action; the UX document can choose the visual treatment.

## Scope honesty — strong

The Scope boundaries expressly exclude account-wide and team requests, GitHub Enterprise, offline behavior, AI, prioritization, and escalation. Eight assumptions are clearly marked and indexed. The Open decisions section names the main technical unknowns. This is appropriate transparency for a fast-path PRD rather than pretending the feasibility work has been done.

### Findings

No substantive finding.

## Downstream usability — adequate

The Terms section gives downstream work a stable vocabulary for workspace repository, review request, queue, check, and backlog. UJ-1 through UJ-3 have a named protagonist; FR-1 through FR-13 and SM-1 through SM-4 are contiguous and unique. The grouped FR sections explain which journeys they realize, and the metrics name the FRs they validate.

The main downstream hazard is conceptual rather than mechanical: request cycle, newly observed request, and backlog will need a single lifecycle model before implementation stories can promise exactly-once alerts.

### Findings

No finding beyond the request-cycle issue above.

## Shape fit — strong

The document fits a small VS Code extension and a solo learning project. Three brief journeys give enough experience context without persona theater. It is sufficiently structured to feed UX, architecture, and stories without becoming a large platform PRD. The open VS Code surface decision is appropriate because the product value does not depend on a predetermined panel.

### Findings

No substantive finding.

## Mechanical notes

- FR IDs 1–13, UJ IDs 1–3, and SM IDs 1–4 are contiguous and unique; their explicit cross-references resolve.
- All inline assumptions A1–A8 appear in the Assumptions index, and every indexed assumption appears inline. A1 is referenced again in FR-7.
- Each journey names Maya and carries its context inline. Required sections are present for the agreed solo-project stakes.
- “Multiple repositories” in Scope boundaries could be read as contradicting FR-2's choice among repositories in a multi-repository workspace. Clarify that the exclusion means **simultaneous monitoring** of multiple repositories.
