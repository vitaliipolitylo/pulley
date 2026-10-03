# Pulley usability test results

The record of the moderated usability test run per [`usability-protocol.md`](usability-protocol.md). Fill in every `_fill in_` cell. Participants appear only as P1–P5. Do not record names, handles, the participant's repository names, or PR titles.

Story 2.6 (publishing) may start only when the [release decision](#release-decision) below is **Go**.

## Test run

| Field | Value |
|---|---|
| Build commit SHA (same as `docs/dogfood/dogfood-0.1.0.md`) | _fill in: full SHA_ |
| Extension ID and version | `vitaliipolitylo.pulley` 0.1.0 |
| Facilitator | _fill in_ |
| Session dates | _fill in_ |
| Planned sessions (3, 4, or 5; fixed before session 1, never raised after seeing results) | _fill in_ |
| Counted sessions (equals planned sessions; uncounted sessions are replaced under the same ID and placement) | _fill in_ |
| Sessions not counted, with reason | _fill in, or "None"; details in the log below_ |

## Per-participant results

One row per counted session. Use these values:

- **Placement:** Sidebar or Panel.
- **Task 1 time:** `m:ss` from the end of the prompt until the PR page opened.
- **Task 1 success:** yes only when 2:00 or less with no hint.
- **Notification delivered:** yes, or **delivery failure** (no notification by the deadline in the protocol).
- **Noticed:** yes or no (no = a missed notice; write N/A after a delivery failure).
- **Intrusive:** no, or yes plus the verbatim quote.
- **Count / Repository / Corgi / Recovery:** Understood, Partly, or Not understood.
- **Passes:** yes only when Task 1 success is yes, Intrusive is no, and Notification delivered is yes.

| Participant | Placement | Task 1 time | Task 1 success | Notification delivered | Noticed | Intrusive (quote) | Count | Repository | Corgi | Recovery | Passes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| P1 | Sidebar | | | | | | | | | | |
| P2 | Panel | | | | | | | | | | |
| P3 | Sidebar | | | | | | | | | | |
| P4 | Panel | | | | | | | | | | |
| P5 | Sidebar | | | | | | | | | | |

Delete the rows for participants who did not take part (for example P4 and P5 with three sessions).

### Session details

Times are clock times (`hh:mm:ss`). The delivery-failure cause is one of: no complete check after the request, failed check, or partial check (from Output → Pulley). Write N/A when the notification was delivered.

| Participant | Account (own / prepared) | Task 1 route (Pulley row / other: which) | T0 (Refresh done) | TR (request made) | TN (notification) | Focus switches (away → back) | Delivery deadline | Delivery-failure cause | Action on notification and reaction | Wanted extra alerts? (which) |
|---|---|---|---|---|---|---|---|---|---|---|
| P1 | | | | | | | | | | |
| P2 | | | | | | | | | | |
| P3 | | | | | | | | | | |
| P4 | | | | | | | | | | |
| P5 | | | | | | | | | | |

A Task 1 route other than a Pulley row goes into the failure log for triage.

### Comprehension notes

For each participant, especially those in Panel placement, note what they said about the count, repository names, corgi state, and recovery actions, and whether they understood them without extra alerts.

| Participant | Placement | Notes |
|---|---|---|
| P1 | Sidebar | |
| P2 | Panel | |
| P3 | Sidebar | |
| P4 | Panel | |
| P5 | Sidebar | |

## Pass calculation

**Participant passes** = Task 1 success **AND** not intrusive **AND** no delivery failure.

| Counted sessions | Passing participants needed |
|---|---|
| 3 | 3 of 3 |
| 4 | 4 of 4 (the stricter reading; PRD assumption A8 defines only the 3- and 5-person bars) |
| 5 | 4 of 5 |

A participant with a delivery failure does not pass, and the failure is triaged below.

| Field | Value |
|---|---|
| Counted sessions (N) | _fill in_ |
| Passing participants | _fill in: count, and which (for example P1, P2, P3, P5)_ |
| Bar for N | _fill in: from the table above_ |
| Test result (Pass / Fail) | _fill in_ |

## Failure and assumption-change log

Record, in date order:

- every failure: a failed Task 1, a non-Pulley Task 1 route, an intrusive remark, a delivery failure, a missed notice, or a comprehension problem (any Count, Repository, Corgi, or Recovery score of Partly or Not understood, or an extra alert the participant wanted);
- the Panel/sidebar split when it is uneven (3 sessions give 1 Panel session, 5 give 2), as an assumption change;
- every session that was not counted and why;
- every deviation from the protocol (for example, the interval was set after connecting, or the participant had seen Pulley before);
- every change to an assumption, such as the 4-of-4 reading of A8 for four participants, or anything the test showed to be wrong about how developers use Pulley.

| # | Date | Participant (or "all") | Type (failure / not counted / deviation / assumption change) | What happened | Triage # |
|---|---|---|---|---|---|
| 1 | | | | | |

## Triage

Every failure in the log above gets one row here before Story 2.6 starts. Outcomes:

- **`fix before 2.6`:** a new spec, linked here. It must reach status `done` before the decision can be Go.
- **`accept`:** no change; the reason is recorded.
- **`defer`:** an entry in `_bmad-output/implementation-artifacts/deferred-work.md` in its existing format (`source_spec`, `summary`, `evidence`), with `source_spec` set to `_bmad-output/implementation-artifacts/spec-2-5-validate-the-experience-with-developers.md`.

| # | Issue | Participants | Outcome (`fix before 2.6` / `accept` / `defer`) | Spec or deferred-work entry | Spec status | Owner | Reason |
|---|---|---|---|---|---|---|---|
| 1 | | | | | | | |

Write "None" in the first row if there were no failures.

## Release decision

**Go** requires all of:

- the test result above is **Pass**;
- every row in the failure log that is a failure has a triage row with an outcome and an owner;
- every `fix before 2.6` row has its spec at status `done`.

Otherwise the decision is **No-go**. A failed test result cannot be overridden by triage: reaching Go after a Fail needs fixes and a new round of sessions, recorded in a new results file.

| Field | Value |
|---|---|
| **Release decision (Go / No-go)** | _fill in_ |
| Decided by | _fill in_ |
| Date | _fill in_ |
| Open `fix before 2.6` specs | _fill in: list, or "None"_ |
