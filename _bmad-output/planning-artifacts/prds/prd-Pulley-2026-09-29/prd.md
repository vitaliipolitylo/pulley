---
title: "PRD: Pulley"
status: final
created: 2026-09-29
updated: 2026-09-30
---

# PRD: Pulley

## Purpose and vision

This PRD defines Pulley's first useful release for downstream UX, architecture, and story work. It builds on the [product brief](../../briefs/brief-Pulley-2026-09-29/brief.md); its account-wide scope supersedes the brief's one-repository boundary. Functional requirements (FRs) describe observable behavior. `[ASSUMPTION]` marks inferred rules for dogfood validation.

Pulley is a small VS Code extension for developers who are directly requested to review GitHub pull requests. It gives one useful signal when a request arrives, then keeps that request in a quiet, accurate queue until it is no longer pending. Pulley the corgi makes the queue welcoming without adding interruptions or judging the developer.

The first release tests a narrow thesis: a calm signal inside the editor makes review requests easier to notice and return to than another generic notification stream. It also takes the creator through a full BMAD learning loop from requirements to a shipped extension.

## Target user and journeys

The primary user is a developer working in VS Code who receives direct review requests across GitHub repositories visible to their signed-in account. They need to notice new work, defer it without losing it, identify its repository, open the relevant pull request, and trust that completed or withdrawn requests disappear. Pulley operates while VS Code is running, with or without an open folder.

**UJ-1 — Maya notices a new request.** Maya is coding when a teammate requests her review. Pulley detects it at the next check, gives one notification with an **Open Pull Request** action, and adds it to the queue. Maya keeps coding, then opens it from the queue when ready.

**UJ-2 — Maya returns to a backlog.** Maya opens VS Code and finds several pending requests, including any that arrived while the editor was closed. Pulley shows their count and one aggregate reminder if none has appeared that day; it does not send individual alerts for those requests. After Maya submits a review or the request is withdrawn, its item disappears at the next successful check.

**UJ-3 — Maya reconnects GitHub.** Maya opens VS Code without a usable GitHub sign-in. Pulley explains why it cannot check requests and offers Connect or Reconnect. After she signs in, a successful check shows her account-wide queue or a confirmed clear state.

## Terms

- **Review request:** an outstanding direct request for the signed-in GitHub user to review an open pull request in any repository visible to that sign-in. Team requests are excluded.
- **Queue:** Pulley's account-wide view of current direct review requests. Each item identifies its repository.
- **New request:** a review request first observed while Pulley is active, after the initial connection baseline. A later request for the same pull request is new only if a successful check observed the previous request end. **[ASSUMPTION A1: request cycles that begin and end between checks are outside the MVP detection guarantee.]**
- **Check:** a successful refresh of current review requests from GitHub. A failed attempt does not establish a clear queue or reset alert history.
- **Backlog:** pending review requests already present at first connection or startup, summarized rather than announced one by one.

## Scope boundaries

The MVP covers direct requests for the signed-in GitHub user across repositories visible to that sign-in. It works with any folder or none and does not read workspace Git remotes to determine scope. It excludes team requests, GitHub Enterprise, browser-hosted VS Code, operation while VS Code is closed, custom view placement, rich row metadata, AI features, automatic prioritization, escalation, and team performance reporting. Pulley focuses on calm awareness of requests rather than duplicating general pull request management.

## Features and functional requirements

### Connect the account

Pulley identifies the developer's GitHub account. Connection problems must remain understandable and recoverable. Supports UJ-1 and UJ-3.

**FR-1 — GitHub connection.** The developer can authorize Pulley to access the account and repository data needed to find their review requests. Pulley identifies the signed-in user before showing their queue.

**FR-2 — Account-wide scope.** Pulley checks direct requests across repositories visible to the signed-in GitHub account, independent of the open workspace. It works with multiple folders or no folder. Queue items identify their repository; there is no repository chooser. **[ASSUMPTION A2: account-wide scope remains understandable with repository names on items.]**

**FR-3 — Explain unavailable data.** If authorization is missing or expired, or GitHub cannot be reached, Pulley shows the cause in plain language and offers an appropriate retry or connection action. A failed check never presents an empty queue as confirmed clear. Clear and connection copy explains that the queue includes only repositories visible to the GitHub sign-in.

### Detect and remember requests

Pulley distinguishes a first connection's existing backlog from requests that arrive later. Supports UJ-1 and UJ-2.

**FR-4 — Find direct requests.** Each successful check finds open pull requests across repositories visible to the signed-in account with an outstanding direct review request for that user. Closed pull requests, withdrawn requests, submitted reviews that clear the request, and team-only requests do not remain in the queue.

**FR-5 — Check cadence.** Pulley checks on activation, on **Refresh**, and periodically while VS Code is running. The interval is configurable and defaults to 15 minutes. Pulley shows when the last successful check occurred. **[ASSUMPTION A3: 15 minutes is timely enough.]**

**FR-6 — Queue accuracy.** After a successful check, Pulley adds pending requests and removes those no longer pending. On failure, it preserves the last known items but marks their freshness uncertain. The developer can refresh manually.

**FR-7 — Durable alert history.** Pulley remembers which observed requests have already produced a notification across reloads and restarts. The same outstanding request produces no second individual alert. A re-request can produce a new alert only after Pulley has observed the earlier request end. **[ASSUMPTION A1]** governs requests missed between checks.

### Alert once, then stay quiet

The first signal should be useful and restrained. Existing work is summarized. Supports UJ-1 and UJ-2.

**FR-8 — New-request alert.** For each new request after the initial baseline, Pulley sends one notification identifying the repository and pull request and offering **Open Pull Request**. It names the requester only when reliably known; otherwise it names the pull request author and identifies them as the author, not the requester. The action opens the correct pull request on GitHub.

**FR-9 — Backlog reminder.** On first connection, Pulley gives one aggregate notification if requests already exist. On later startups, it gives at most one aggregate reminder when requests remain, never more than once per day. Requests that arrived while VS Code was closed join that backlog without individual alerts. No repeated reminder occurs during a continuous session. **[ASSUMPTION A4: the limit follows the local calendar day.]**

**FR-10 — Kind mascot states.** Pulley uses hand-written messages and states: excited for new work, gently impatient for an older request, overwhelmed for a backlog, and resting for a clear queue. Backlog copy rotates. Messages never shame the developer, score productivity, or escalate alert frequency. **[ASSUMPTION A5: “older” starts 24 hours after the latest direct request and changes only visual state or copy.]**

### Keep a usable queue

The queue is the lasting place to return to pending work. Exact VS Code placement remains a UX and feasibility decision. Supports UJ-1 and UJ-2.

**FR-11 — Show pending work.** The queue lists each pull request's repository, title, author, and elapsed time since the latest direct request when reliably available. If request time is unavailable, Pulley says so rather than substituting pull request age. Pending, stale, unavailable, and clear states are distinguishable.

**FR-12 — Open a request.** Selecting an item opens its pull request on GitHub. It remains pending until a later successful check confirms that the request ended.

**FR-13 — At-a-glance state.** Pulley provides a quiet count and recognizable corgi state for new work, backlog, and a clear queue. The backlog threshold is configurable and defaults to five pending requests. **[ASSUMPTION A6: the threshold changes presentation, not alert frequency.]** VS Code's native layout controls suffice for placement.

## Cross-cutting quality

- **Responsiveness:** The queue stays readable and responsive with 50 pending requests. **[ASSUMPTION A7: 50 is the first-release stress case.]**
- **Privacy:** Pulley accesses only needed account and repository data and sends no pull request contents to an AI service.

## Success measures

- **SM-1 — Correctness:** In representative dogfood cases, outstanding direct requests across the signed-in user's visible repositories appear in one queue with the correct repository identified. Each disappears at the next successful check after completion, withdrawal, or closure. Validate with multiple repositories and no open folder. Validates FR-2, FR-4, and FR-6.
- **SM-2 — Alert trust:** Each new request observed while Pulley is active generates exactly one notification with a working action; an existing backlog generates one aggregate first-connection alert and no more than one later startup reminder per day. Requests arriving while VS Code is closed generate no individual alert. Validates FR-7 through FR-9.
- **SM-3 — Useful and pleasant:** In a test with 3–5 developers, participants can find and open a waiting review from Pulley within two minutes of being asked, and do not describe Pulley as intrusive. **[ASSUMPTION A8: at least four of five participants, or all three if only three participate, should meet both conditions.]** Validates FR-10 through FR-13.
- **SM-4 — Learning:** The creator ships the MVP through BMAD and can explain major product and implementation decisions.
- **Counter-metric — Interruption cost:** More alerts, animation, or faster polling do not count as success if they interrupt coding or reduce queue trust.

## Open decisions and validation

1. **Requester identity and request age:** Confirm that matching the latest outstanding direct request to a GitHub event is reliable and economical for a 50-item queue. Otherwise use the stated fallback.
2. **VS Code surface:** Prototype a native view and quiet count to find where the corgi is legible without excessive UI. Confirm accessibility in all queue states.
3. **Private repository access:** Confirm the available VS Code GitHub authentication flow and necessary permissions.
4. **Request lifecycle and scope:** Test re-requests, automation, missing requester identity, expired authentication, network failure, multiple repositories, and no open folder against FR-2 through FR-11.
5. **Polling:** Dogfood the 15-minute default and review GitHub API use before changing it.

The creator owns these follow-ups. Revisit items 1, 3, and 4 during architecture before writing integration stories; settle item 2, including when the “new work” mascot state ends, during UX before writing interface stories; revisit item 5 after dogfooding. None changes the first-release scope without a PRD update.

## Assumptions index

- **A1:** Request cycles missed entirely between successful checks are outside the MVP detection guarantee (§Terms, FR-7).
- **A2:** Account-wide scope remains understandable when each item names its repository (§FR-2).
- **A3:** A configurable 15-minute check interval is timely enough (§FR-5).
- **A4:** The daily startup reminder limit follows the local calendar day (§FR-9).
- **A5:** A request becomes visually older after 24 hours without another alert (§FR-10).
- **A6:** The backlog threshold affects presentation, not alert frequency (§FR-13).
- **A7:** 50 pending requests is the first-release stress case (§Cross-cutting quality).
- **A8:** The proposed 3–5-person usefulness threshold is suitable for dogfooding (§Success measures).
