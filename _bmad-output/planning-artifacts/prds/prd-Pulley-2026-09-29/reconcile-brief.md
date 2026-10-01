# Product brief → PRD reconciliation

Source: `briefs/brief-Pulley-2026-09-29/brief.md` (ready for review, 2026-09-29)  
Target: `prd.md` (draft, 2026-09-29)

## Overall

The PRD carries the brief's core product: one workspace repository, direct GitHub review requests, a quiet durable queue, a single alert for each newly observed request, aggregate existing-backlog reminders, open-PR actions, and kind corgi states. It preserves the exclusions for AI, team requests, multiple repositories, GitHub Enterprise, browser VS Code, and operation while VS Code is closed. Its accuracy and failure rules generally strengthen the brief without changing the product intent.

## Material gaps or tensions

1. **Startup classification is ambiguous (high).** The brief separates a timely first signal for a new request from an aggregate startup backlog. The PRD defines a *new request* as one first observed after the initial connection baseline, but also defines *backlog* as requests present at startup. A request arriving while VS Code is closed satisfies both after the first connection. FR-8 implies its own notification; FR-9 implies one aggregate reminder. Specify which rule wins on startup, including when several requests arrived while closed. This matters to the promised one useful interruption and notification tests.
2. **Multi-repository workspace behavior expands the first release (medium).** The brief promises one repository associated with the workspace and explicitly excludes multiple repositories. PRD FR-2 adds A2: ask the user to choose among multiple repositories and retain the choice. That may be a reasonable way to resolve a workspace ambiguity, but it adds selection and persistence work. Decide whether the first release supports that case or instead explains that the workspace is ambiguous and offers a recovery step. Keep the single-repository queue either way.
3. **First-connection alert strength differs inside the PRD (medium).** The brief and PRD success measure SM-2 promise one aggregate alert when existing requests are found at first connection. FR-9 says *at most one*, which also permits zero. Align the requirement and measure, or state conditions under which the first-connection aggregate alert is suppressed (such as zero requests or a prior baseline restored after reload).
4. **Requester identity in notification could mask data uncertainty (low).** The brief says to name the requester when known and otherwise the PR author; FR-8 preserves this. The open decision calls for matching an event, but neither document specifies the notification wording that distinguishes “requested by” from an author fallback. UX should avoid implying the author requested review when that is unverified. This can be handled in UX copy, without adding an MVP feature.

## Preserved brief commitments

| Brief commitment | PRD location | Assessment |
| --- | --- | --- |
| Direct outstanding requests in one workspace repository | Terms, FR-2, FR-4, scope | Preserved, subject to multi-repository note above. |
| Activation, manual, and configurable periodic checks; provisional 15-minute default | FR-5, A3 | Preserved. |
| Durable notification history across reloads and restarts | FR-7 | Preserved. |
| Queue title, author, time waiting, open action, prompt removal | FR-4, FR-6, FR-11, FR-12 | Preserved; next successful check makes “promptly” testable. |
| Calm notification behavior and once-daily startup reminder | FR-8, FR-9, quality, SM-2 | Preserved, subject to startup classification and first-connection wording above. |
| Kind corgi states, rotating hand-written backlog copy, configurable threshold of five | FR-10, FR-13 | Preserved. |
| Clear connection failure and recovery | FR-3, UJ-3 | Preserved and strengthened for stale data. |
| 50-item readability assumption and 3–5-person dogfood | Quality, SM-3, A7–A8 | Preserved with a provisional dogfood threshold. |
| BMAD learning outcome and future AI exclusions | Purpose, SM-4, scope | Preserved. |

## Recommendation

Resolve findings 1–3 before marking the PRD final. Finding 4 is a UX copy handoff. The remaining brief content is represented well enough for UX, architecture, and story work.
