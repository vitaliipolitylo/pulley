---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - prds/prd-Pulley-2026-09-29/prd.md
  - prds/prd-Pulley-2026-09-29/addendum.md
  - architecture/architecture-Pulley-2026-09-30/ARCHITECTURE-SPINE.md
  - ux-designs/ux-Pulley-2026-09-29/DESIGN.md
  - ux-designs/ux-Pulley-2026-09-29/EXPERIENCE.md
  - briefs/brief-Pulley-2026-09-29/brief.md
  - ../brainstorming/brainstorm-pulley-github-review-reminders-2026-09-29/.memlog.md
---

# Pulley - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Pulley, decomposing the requirements from the PRD, UX Design, and Architecture into implementable stories. The product brief and brainstorming log provide context; where their earlier one-repository scope differs, the final PRD's account-wide scope governs. UX mockups and the architecture explainer are illustrative companions to the listed source documents.

## Requirements Inventory

### Functional Requirements

FR-1: Let the developer authorize the GitHub account and repository access needed to find review requests; identify the signed-in user before showing their queue.

FR-2: Check direct requests across all repositories visible to that account, independent of open folders or workspaces; work with multiple folders or none; identify each item's repository without a repository chooser.

FR-3: Explain missing or expired authorization and GitHub failures in plain language, offer the appropriate Connect, Reconnect, or Refresh action, and never present a failed check as confirmed clear. Explain the signed-in account's repository visibility in connection and clear copy.

FR-4: On successful checks, find open PRs with outstanding direct requests for the signed-in user. Exclude team-only requests and remove requests cleared by submitted review, withdrawal, or PR closure.

FR-5: Check on activation, Refresh, and a configurable interval defaulting to 15 minutes while VS Code runs; show the last successful check time.

FR-6: On successful checks, add current requests and remove those no longer pending. On failure, retain last known items, mark freshness uncertain, and allow manual refresh.

FR-7: Persist per-request alert history across reloads and restarts; do not alert again for the same outstanding request. A later re-request may alert only after a successful check observed the previous cycle end; cycles entirely between checks are outside the MVP guarantee.

FR-8: Notify once per newly observed post-baseline request with repository, PR, and Open Pull Request action. Name the requester only when verified; otherwise label the PR author as author. Open the correct GitHub PR.

FR-9: Give one aggregate notification for an existing first-connection backlog. On later startups, remind at most once per local calendar day when requests remain. Requests arriving while VS Code was closed join the backlog without individual alerts, and a continuous session produces no repeated reminder.

FR-10: Provide hand-written, kind mascot messages and states for new, older, backlog, and clear work; rotate backlog copy. An older request changes copy or visual state after 24 hours when its latest direct request time is known, without extra alerts, shame, scores, or escalation.

FR-11: List each pending PR's repository, title, author, and elapsed time since the latest direct request when reliable; otherwise explicitly say request time is unavailable. Distinguish pending, stale, unavailable, and clear states.

FR-12: Open the correct GitHub PR when a queue item is activated; keep it pending until a later successful check confirms the request ended.

FR-13: Show a quiet count and recognizable corgi states for new, backlog, and clear work. Make the presentation-only backlog threshold configurable with a default of five; use VS Code's native layout controls for view placement.

### NonFunctional Requirements

NFR-1: Keep the queue readable and responsive with 50 pending requests, the first-release stress case.

NFR-2: Access only account and repository data needed for the review-request experience; send no PR contents to an AI service.

NFR-3: Preserve alert trust and low interruption cost: no duplicate request alerts, no extra reminders from mascot state or backlog threshold, and no animation or faster polling solely to increase engagement.

NFR-4: In dogfood testing with 3–5 developers, at least four of five (or all three if only three participate) can find and open a waiting review within two minutes and do not describe Pulley as intrusive. This threshold is a PRD assumption.

### Additional Requirements

- Scaffold a TypeScript VS Code desktop extension with generator-code/esbuild, `engines.vscode` from the scaffold, Node 24 LTS tooling, core unit tests, VS Code host smoke tests, package scripts, and a fixed extension ID before distributing a `.vsix`. The architecture's structural seed defines `src/core/`, `src/shell/`, `src/extension.ts`, and `test/`. This is the designated starter for Epic 1 Story 1.
- Keep product rules in a pure functional core: no VS Code imports, I/O, clock reads, randomness, timers, or mutation of inputs. Pass `now`, local `today`, settings, and window context into transitions.
- Use core `reconcile`, `queueViewed`, and `windowFocused` transitions as the sole deciders of durable state and `notifyNew`/`notifyBacklog` effects. Render queue and count from a shared `viewModel`; keep user-facing strings in `src/core/copy.ts`.
- Use one `globalState` key, `pulley.state.v1`, with schema version and account partitions keyed by `AuthenticationSession.account.id`; store product fields per account and keep window memory and settings outside it.
- Make `store.mutate` the only write path: serialize within a window, re-read, migrate, transition, await storage, then execute effects and render. A newer unknown schema enters read-only Update Pulley mode.
- Normalize GitHub results to complete/incomplete success or typed failure. Ignore wrong-account or stale fetch results; incomplete results may add or update but never end a request cycle. Use PR GraphQL node ID to identify a cycle across renames or transfers.
- Classify first-check and long-gap discoveries as backlog; only ordinary newly observed requests become individual pending alerts. Preserve pending effects across unfocused windows; only a focused window delivers them after a durable write. Accept the documented simultaneous-focus race.
- Apply first-connection and later local-day backlog reminder rules in core. Persist reminder date and alert state so failures, reloads, and other windows do not reset the limit.
- Build the account-wide, paginated GraphQL search for `is:pr is:open user-review-requested:@me archived:false`, with 50 results per page and up to 10 recent review-request events per PR. Match the viewer as requested reviewer to obtain requester and request time; omit those fields when unmatched. Never silently truncate or treat partial GraphQL data as a complete check.
- Use VS Code's GitHub authentication provider with `repo` scope; request a session silently on activation and prompt only on explicit Connect/Reconnect. Get a token for each check, never persist it, retry silent auth once after 401, and discard results from an older session generation.
- Map signed-out, unauthenticated, network, rate-limit, and GraphQL errors to plain-language messages and appropriate actions. Preserve last known data on failed checks.
- Activate on `onStartupFinished`; schedule activation, periodic, manual, and session-change checks with one in-flight check per window and 0–60 second jitter for non-manual triggers. Define application-scoped settings: `pulley.checkIntervalMinutes` default 15, range 5–240; `pulley.backlogThreshold` default 5, minimum 1. Restart the timer for interval changes and only re-render for threshold changes.
- Limit extension network calls to `https://api.github.com/graphql` and opened PR URLs. Use no telemetry, never log tokens, and keep diagnostics in the local Pulley output channel.
- Follow `pulley.` command, view, and setting names; store epoch milliseconds and local `YYYY-MM-DD`; display PRs as `owner/name#number`.
- Cover core rule combinations with table-driven unit tests, migration tests per stored version, and VS Code host smoke tests for activation without an open view, `store.mutate` ordering, and notification delivery.
- Package a `.vsix`, dogfood with representative multi-repository and no-folder cases, and validate the GraphQL query against live repositories, automation requesters, SSO/OAuth restrictions, partial errors, and cross-window state propagation. Confirm CI before its release story.
- Use SemVer and matching `.vsix`/Marketplace versions. Migrate incompatible stored state by schema version. Publish to the VS Code Marketplace with Microsoft Entra credentials after selecting a publisher ID; provide local output-channel diagnostics for support.

### UX Design Requirements

UX-DR1: Prototype one native Tree View queue in a sidebar and in a user-moved bottom Panel; verify corgi legibility, row density, repository identification, and quiet count location at actual VS Code sizes. Use the supplied mockups as illustrations, with the UX spines authoritative on behavior and appearance.

UX-DR2: Use a compact vertical native queue that puts PR title first and keeps `owner/name`, author, and reliable request age legible; expose full long titles and repository names through tooltip or accessible name. Avoid chips, cards, branch metadata, and a status message that crowds out rows.

UX-DR3: Implement a compact, clearly corgi-shaped mark with broad upright ears, low wide face, short muzzle, and central blaze; provide subtle variants for new, older, backlog, neutral waiting, and clear states at actual icon size. Validate final artwork and placement; pair every pose with a text equivalent.

UX-DR4: Inherit active VS Code theme colors, focus, selection, font roles, scaling, spacing, and control shapes. Limit illustrative coat, cream, ear, and ink tokens to the corgi artwork, not UI state colors; test light, dark, and high-contrast themes.

UX-DR5: Render a quiet native count of pending items that opens the queue, labels stale counts after failure, and withholds a confirmed zero before the first successful check. Select a native view badge or status bar placement through the prototype.

UX-DR6: Use native VS Code notifications with a clear Open Pull Request action. Individual notifications identify repository and PR; identify requester only when verified and otherwise explicitly identify the author as author. Aggregate backlog notifications identify the count and use a small rotating, hand-written set of gentle lines.

UX-DR7: Provide concise, factual loading, pending, clear, stale, and unavailable state messages. Clear and connection text explain the signed-in account's repository visibility; stale text identifies the last known check time and offers Refresh.

UX-DR8: Provide native, descriptively named Refresh, Connect, and Reconnect actions appropriate to the current state. Repeated Refresh while a check is in progress must not create duplicate visible operations.

UX-DR9: Use native VS Code Settings controls for check interval and backlog threshold; setting changes must not retroactively notify existing requests. Do not add a product-specific placement setting or custom MVP shortcut.

UX-DR10: Support mouse and keyboard activation of each row, opening its correct GitHub PR while retaining the row until a later successful check confirms request end.

UX-DR11: Expose full accessible row text with repository, title, author, and request age or “Request time unavailable,” even when the visual row truncates. Make queue, actions, notification action, and settings keyboard reachable with visible native focus.

UX-DR12: Expose mascot state, count, and data status in words without relying on pose or color, and avoid repeated screen-reader announcements from background polling. Announce stale or unavailable data on failure rather than an empty list.

UX-DR13: Keep the queue understandable in a narrow sidebar and a wide, shallow bottom Panel, with a scrollable native list for 50 items. Validate zoomed UI and keyboard use along with light, dark, and high-contrast themes.

UX-DR14: Honor reduced-motion preferences; use no mascot animation in the MVP. Keep copy short and kind, with facts before personality, no productivity judgment, and no extra notifications from an older or backlog state.

UX-DR15: Keep the new mascot state until the queue is opened or the next successful check adds no new request, whichever comes first; give backlog state precedence at the configured threshold. Show older state only when reliable request time is at least 24 hours old; use neutral waiting for other confirmed pending work and resting/clear only for a confirmed empty queue.

UX-DR16: Validate the UX assumption that activation opens the Queue view; ensure activation checks still run when the view has not been opened and that native view movement does not change queue behavior.

### FR Coverage Map

FR-1: Epic 1 — authorize GitHub and identify the signed-in account.

FR-2: Epic 1 — show account-wide direct requests independently of workspace folders.

FR-3: Epic 1 — explain and recover from missing authorization or unavailable GitHub data.

FR-4: Epic 1 — find only current direct requests on open PRs.

FR-5: Epic 1 — check on activation, Refresh, and a configurable schedule.

FR-6: Epic 1 — reconcile successful results and preserve stale data on failure.

FR-7: Epic 2 — persist alert history across restarts and request cycles.

FR-8: Epic 2 — give one actionable alert for each new request after baseline.

FR-9: Epic 2 — summarize first-connection and startup backlog within the daily limit.

FR-10: Epic 2 — provide kind, hand-written corgi states and copy.

FR-11: Epic 1 — show complete, honest queue metadata and data states.

FR-12: Epic 1 — open a PR while keeping it pending until a successful check confirms resolution.

FR-13: Epic 2 — show a quiet count and presentation-only backlog threshold with native placement.

## Epic List

### Epic 1: See and Act on a Trustworthy Review Queue

A developer can connect their GitHub account, see current direct review requests across visible repositories in VS Code, open the correct PR, and trust clear, stale, and unavailable states. This epic delivers a usable queue before notification behavior is added.

**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-11, FR-12.

**Implementation notes:** Begin with the TypeScript VS Code extension scaffold and a live GraphQL query feasibility spike. Build the pure core, account-partitioned state, auth, scheduler, native queue, and failure recovery as vertical stories. Prototype the Tree View in sidebar and Panel and validate keyboard use, repository identification, request-age fallback, and 50-item responsiveness. The queue must function with no open folder and without any later epic.

### Epic 2: Notice Requests Without Repeated Interruptions

A developer receives one useful signal for new work, can return to an existing backlog without alert fatigue, and understands queue state through a quiet count, accessible corgi state, and gentle copy. This epic builds on the working queue from Epic 1 and completes the installable MVP.

**FRs covered:** FR-7, FR-8, FR-9, FR-10, FR-13.

**Implementation notes:** Add durable per-cycle alert and reminder state through core transitions and `store.mutate`, focused-window notification delivery, threshold-based presentation, and accessible mascot/count states. Keep copy and visual state consistent with the shared view model. Include packaging, representative dogfood validation, CI confirmation, and Marketplace release work in the relevant final stories; do not create a separate technical-layer epic.

## Epic 1: See and Act on a Trustworthy Review Queue

A developer can connect their GitHub account, see current direct review requests across visible repositories in VS Code, open the correct PR, and trust clear, stale, and unavailable states. This epic delivers a usable queue before notification behavior is added.

### Story 1.1: Set Up Initial Project from Starter Template

<!-- Covers: FR-1, FR-3; UX-DR7, UX-DR8 -->

As a developer working in VS Code,
I want Pulley to explain its GitHub connection and let me sign in,
So that it can identify the account whose review requests I want to see.

**Acceptance Criteria:**

**Given** a fresh install with no GitHub session
**When** VS Code starts
**Then** Pulley activates without requiring an open folder and shows a plain-language connection state with a **Connect** action
**And** it shows no confirmed zero and does not prompt for sign-in automatically.

**Given** the connection state
**When** I choose **Connect**
**Then** Pulley requests a GitHub session with `repo` scope through VS Code authentication and identifies the session account
**And** it shows a connected state awaiting the first check without persisting the token.

**Given** I cancel or fail the sign-in
**When** control returns to Pulley
**Then** the connection state remains actionable
**And** it explains that the queue covers repositories visible to the GitHub sign-in.

**Given** the generator-code TypeScript and esbuild starter
**When** it is created, dependencies are installed, and it is built and run in an Extension Development Host
**Then** the native `pulley.queue` view and `pulley.connect` command are contributed with initial `engines.vscode`, package scripts, and Node 24 tooling configuration
**And** the project has the architecture's `src/core/`, `src/shell/`, `src/extension.ts`, and test layout without implementing future queue or alert behavior upfront.

### Story 1.2: Find Direct Review Requests Across GitHub

<!-- Covers: FR-2, FR-4; UX-DR1, UX-DR2 -->

As a signed-in developer,
I want Pulley to find my direct review requests across repositories visible to my GitHub account,
So that my queue reflects work beyond the current VS Code folder.

**Acceptance Criteria:**

**Given** a signed-in account with direct requests in two visible repositories
**When** Pulley checks GitHub
**Then** it runs the paginated GraphQL search `is:pr is:open user-review-requested:@me archived:false`, fetches every result page of up to 50, and shows each PR with a stable node ID, `owner/name`, number, title, author, and URL
**And** the same results appear with no folder open.

**Given** team-only requests, closed PRs, or requests no longer pending
**When** the search completes
**Then** they are excluded from the result
**And** results are never silently truncated at 50.

**Given** a matching review-request event in a PR's recent timeline
**When** the result is normalized
**Then** the newest of up to 10 recent `ReviewRequestedEvent` timeline items whose requested reviewer is the viewer supplies requester and request time
**And** if no reliable event matches the signed-in user, those fields remain absent without substituting PR age or author.

**Given** a GraphQL response with errors, missing pages, or a failed request
**When** the adapter returns a result
**Then** it marks the data incomplete or failed and logs a local diagnostic
**And** it does not claim the queue is confirmed clear.

**Given** the first live integration check
**When** it is tested against representative repositories
**Then** the developer records what happens for automation requesters, SSO or OAuth restrictions, partial errors, and no-folder operation
**And** any discovered query limitation is resolved or recorded before relying on the query for queue removal.

### Story 1.3: Keep the Queue Accurate Across Checks

<!-- Covers: FR-4, FR-6, FR-7; UX-DR7 -->

As a developer with pending reviews,
I want Pulley to preserve and reconcile my queue accurately,
So that completed or withdrawn requests disappear without unrelated requests being lost.

**Acceptance Criteria:**

**Given** a complete successful result for my account
**When** Pulley reconciles it
**Then** each returned PR node ID is added or updated in that account's stored queue
**And** an ID absent from that complete result is removed, ending its observed request cycle.

**Given** an incomplete or failed result
**When** Pulley reconciles it
**Then** it may add or update returned items but does not end any existing cycle
**And** it preserves the last known queue and alert history.

**Given** a result from another account or one whose fetch began no later than the last applied complete result
**When** it reaches reconciliation
**Then** it is ignored
**And** it cannot overwrite newer or different-account state.

**Given** any check attempt, successful or failed
**When** its result is processed
**Then** the account records its fetch start time and the active check interval for later backlog-gap classification
**And** an incomplete or failed result does not advance the last complete successful fetch marker.

**Given** a queue write from any VS Code window
**When** `store.mutate` applies a core transition
**Then** it serializes writes within the window, re-reads and migrates `pulley.state.v1`, awaits the write, and only then renders or executes effects
**And** all product state is partitioned by `AuthenticationSession.account.id`, while window state and settings remain outside storage.

**Given** stored state from an older supported schema or a newer unknown schema
**When** Pulley loads it
**Then** supported versions migrate with a test for each version
**And** a newer unknown version enters a read-only **Update Pulley** state with no write or notification effects.

### Story 1.4: Understand and Open a Waiting Review

<!-- Covers: FR-11, FR-12; UX-DR1, UX-DR2, UX-DR4, UX-DR10, UX-DR11, UX-DR13, UX-DR16 -->

As a developer returning to pending reviews,
I want a readable queue that opens the correct PR,
So that I can choose a review without losing track of what is still requested.

**Acceptance Criteria:**

**Given** a successful check with pending requests
**When** the native Tree View renders the shared `viewModel`
**Then** each row prioritizes title and identifies full `owner/name`, author, and elapsed time since the latest direct request when known
**And** an unknown request time reads **Request time unavailable**, never PR age.

**Given** a long title or repository name in a narrow sidebar
**When** the row is visually truncated
**Then** tooltip or accessible text exposes its full repository, title, author, and age or unknown-time phrase
**And** the row remains keyboard reachable with visible native focus.

**Given** a queue row
**When** I activate it by mouse or keyboard
**Then** its correct GitHub PR opens
**And** the row remains pending until a later complete successful check confirms its request ended.

**Given** a prototype in a sidebar and user-moved bottom Panel
**When** 50 requests, narrow width, shallow height, zoomed UI, and light, dark, and high-contrast themes are tried
**Then** the native list stays scrollable, readable, and responsive
**And** repository identity, row density, and the assumption that activation opens the view are validated without making view opening a prerequisite for checks.

### Story 1.5: Refresh and Schedule Queue Checks

<!-- Covers: FR-5; UX-DR8, UX-DR9 -->

As a developer working in VS Code,
I want my queue to refresh on demand and at a predictable cadence,
So that waiting reviews appear without constant manual checking.

**Acceptance Criteria:**

**Given** Pulley starts with or without its view open
**When** activation completes
**Then** `onStartupFinished` initiates a check using the current silent session
**And** the queue shows checking rather than confirmed zero until the first successful result.

**Given** a connected account
**When** I choose **Refresh** or a periodic timer fires
**Then** a check begins for that account and the last successful check time updates only after complete success
**And** repeated triggers while a check is in flight join it rather than starting duplicate operations.

**Given** no manual trigger
**When** activation, periodic, or session-change scheduling runs
**Then** the shell applies its 0–60 second jitter and checks at most once in flight per window
**And** core product rules remain free of timers, randomness, and clock reads.

**Given** `pulley.checkIntervalMinutes` is changed in native VS Code Settings
**When** the value is within 5–240 minutes
**Then** the application-scoped timer restarts at that interval, defaulting to 15 minutes
**And** changing the interval does not retroactively alert existing requests.

### Story 1.6: Recover from Missing or Uncertain GitHub Data

<!-- Covers: FR-1, FR-3, FR-6, FR-11; UX-DR7, UX-DR8, UX-DR12 -->

As a developer whose GitHub connection or check fails,
I want to know whether the queue is stale and how to recover,
So that I never mistake missing data for having no reviews.

**Acceptance Criteria:**

**Given** no usable GitHub session or an expired one
**When** Pulley cannot check
**Then** the queue shows an account-scoped signed-out or unauthenticated explanation with **Connect** or **Reconnect** as appropriate
**And** it does not display an unqualified zero.

**Given** a 401 response during a check
**When** Pulley handles it
**Then** it retries a silent GitHub session lookup once before reporting unauthenticated
**And** no startup sign-in prompt or persisted token is introduced.

**Given** a network, rate-limit, or GraphQL failure after a prior success
**When** the failure is recorded
**Then** last known rows and count remain visible as stale with the last successful check time and a descriptive **Refresh** action
**And** clear status and request-cycle deletion are withheld.

**Given** a GitHub session change or account switch
**When** the session event arrives
**Then** Pulley updates the active account, triggers a check, and discards results from the previous session generation
**And** it never displays one account's queue or alert history as another account's.

**Given** a successful empty check after recovery
**When** the shared view model renders
**Then** it shows a confirmed clear state that says only repositories visible to the current GitHub sign-in are included
**And** background polling does not repeatedly announce an unchanged state to screen readers.

## Epic 2: Notice Requests Without Repeated Interruptions

A developer receives one useful signal for new work, can return to an existing backlog without alert fatigue, and understands queue state through a quiet count, accessible corgi state, and gentle copy. This epic builds on the working queue from Epic 1 and completes the installable MVP.

### Story 2.1: Get One Useful Alert for a New Request

<!-- Covers: FR-7, FR-8; UX-DR6, UX-DR10 -->

As a developer focused on coding,
I want one actionable signal when a new direct review request appears,
So that I notice it without being repeatedly interrupted.

**Acceptance Criteria:**

**Given** an account with a completed initial baseline and a recent prior check
**When** a complete check first adds a direct request
**Then** the core records a pending individual alert for that observed request cycle
**And** it does not classify the item as new if the gap since the previous attempt exceeds twice the previous check interval.

**Given** a pending alert and a focused VS Code window
**When** `store.mutate` applies the transition
**Then** it durably marks the alert shown before the notifier displays one native notification naming repository and PR with **Open Pull Request**
**And** the action opens that exact GitHub URL while dismissal changes neither queue nor alert history.

**Given** requester identity is reliably matched to the current user's direct request
**When** the notification is composed
**Then** it may name that requester
**And** otherwise it labels the PR author as author rather than claiming the author requested the review.

**Given** the request remains pending across polls, reloads, restarts, or a second window
**When** later checks or focus events occur
**Then** no second individual alert is produced
**And** an unfocused window leaves a pending alert for a focused window to deliver from fresh stored state, subject to the architecture's documented simultaneous-focus race.

**Given** a complete successful check observed a request end
**When** the same PR node ID appears in a later complete result
**Then** it starts a new observed cycle eligible for one new alert
**And** a re-request that never disappeared between checks only updates its metadata without alerting again.

### Story 2.2: Return to a Backlog with a Daily Limit

<!-- Covers: FR-9; UX-DR6, UX-DR14 -->

As a developer returning to VS Code,
I want one calm summary of waiting reviews,
So that I can return to them without a flood of individual alerts.

**Acceptance Criteria:**

**Given** an account's first complete successful check finds existing requests
**When** Pulley establishes its baseline
**Then** it classifies them as backlog and records one aggregate first-connection alert
**And** it sends no individual alert for those items, regardless of backlog threshold.

**Given** an account's first complete successful check finds no requests
**When** Pulley establishes its baseline
**Then** it records that the first check is done without a backlog alert
**And** a request first found on a later ordinary check is eligible for an individual alert.

**Given** VS Code was closed or checks were absent for more than twice the previous interval
**When** the next check discovers additional requests
**Then** they join the backlog without individual alerts
**And** the queue retains each item for later action.

**Given** pending requests remain at a later startup and no reminder was recorded on the local calendar day
**When** a focused window can deliver the reminder
**Then** it records and shows at most one aggregate notification with the pending count
**And** a failed startup check does not consume the startup opportunity or clear the prior queue.

**Given** multiple windows, repeated checks, or a continuous session on the same local day
**When** backlog conditions are evaluated
**Then** the persisted reminder date and pending/shown state prevent additional aggregate notifications
**And** dismissal does not reset the limit or the queue.

**Given** a backlog notification
**When** its copy is selected
**Then** it uses one of a small deterministic set of hand-written, gentle lines for that day
**And** it contains no shame, productivity score, or escalation language.

### Story 2.3: Read Queue State at a Glance

<!-- Covers: FR-10, FR-13; UX-DR1, UX-DR3, UX-DR4, UX-DR5, UX-DR9, UX-DR12, UX-DR14, UX-DR15 -->

As a developer with reviews to manage,
I want a quiet count and kind corgi state,
So that I can understand the queue without opening every PR or receiving more alerts.

**Acceptance Criteria:**

**Given** a successful check
**When** the shared `viewModel` renders
**Then** a native quiet count shows the pending total and opens the queue
**And** the count is null before first success, marked stale after later failure, and never shows an unqualified zero on failure.

**Given** the queue has pending work
**When** corgi state is selected
**Then** backlog takes precedence at the configured threshold, otherwise new signal precedes older, and older requires a known direct-request time at least 24 hours old
**And** an empty confirmed queue uses resting/clear while uncertain data uses an unknown state rather than a false clear pose.

**Given** a low pending count with no new signal or reliably older request
**When** corgi state is selected
**Then** it uses a neutral waiting pose and text rather than a clear/resting state
**And** it remains distinct from confirmed clear and unknown-data states.

**Given** a new signal
**When** the queue opens or a later successful check adds no new request
**Then** the new state ends
**And** the change does not generate another notification.

**Given** `pulley.backlogThreshold` is changed in native VS Code Settings
**When** the application-scoped value is at least one, defaulting to five
**Then** the mascot and presentation update without a new GitHub check or retroactive alert
**And** copy stays in `src/core/copy.ts` with deterministic backlog rotation.

**Given** sidebar and Panel prototypes at actual icon size
**When** light, dark, high-contrast, zoomed, keyboard, and screen-reader modes are checked
**Then** the corgi's broad ears, low wide face, short muzzle, and central blaze remain recognizable, all state variants have words and count equivalents, and the chosen native count location remains unobtrusive
**And** native theme typography, spacing, focus, selection, and contrast are honored with no mascot animation, including under reduced motion.

### Story 2.4: Package and Technically Dogfood the Calm MVP

<!-- Covers: NFR-1, NFR-3; UX-DR13 -->

As a developer trying Pulley outside the Development Host,
I want an installable build whose queue and alerts are validated,
So that I can trust it in normal VS Code use.

**Acceptance Criteria:**

**Given** an implementation ready for dogfood
**When** the extension is packaged
**Then** it produces a versioned `.vsix` with a fixed publisher and extension ID, a matching SemVer package version, and an installation path for testers
**And** no tokens or other secrets are bundled.

**Given** CI has been confirmed for the repository
**When** code is pushed
**Then** GitHub Actions runs core table-driven rule tests, stored-version migration tests, VS Code host smoke tests, and package validation
**And** the smoke checks include startup without an open view, write-before-effect ordering, and notification delivery.

**Given** representative direct requests in multiple repositories and no open folder
**When** the installed extension is dogfooded
**Then** current requests appear with correct repository names, resolved or withdrawn requests disappear at the next complete check, and one-time versus aggregate notification behavior matches the PRD
**And** partial errors, re-requests, missing requester identity, expired auth, cross-window updates, and 50 pending items are exercised.

### Story 2.5: Validate the Experience with Developers

<!-- Covers: NFR-4; UX-DR1, UX-DR13, UX-DR14 -->

As a developer considering Pulley for daily use,
I want its usefulness and interruption cost checked with real developers,
So that the release decision is based on observed behavior.

**Acceptance Criteria:**

**Given** a usability test with three to five developers
**When** participants are asked to find and open a waiting review
**Then** at least four of five, or all three if only three participate, finish within two minutes and do not describe Pulley as intrusive
**And** failures and assumption changes are recorded for a product decision before release.

**Given** testers use the installed extension in sidebar or Panel placement
**When** feedback is collected
**Then** the tester notes whether the count, repository names, corgi state, and recovery actions are understandable without extra alerts
**And** unresolved usability failures are triaged before the publishing story begins.

### Story 2.6: Publish Pulley with a Support Path

<!-- Covers: NFR-2; FR-3 -->

As a developer who wants Pulley in regular VS Code,
I want a published release with local diagnostics,
So that I can install, update, and troubleshoot it reliably.

**Acceptance Criteria:**

**Given** the dogfood decision approves release and the publisher ID is fixed
**When** the release is prepared
**Then** the Marketplace package and `.vsix` use the same SemVer version and extension ID
**And** incompatible state changes increment `schemaVersion` with a tested migration while retaining `pulley.state.v1` unless migration is impossible.

**Given** an authorized publisher account
**When** Pulley is published to the VS Code Marketplace
**Then** publishing uses Microsoft Entra credentials rather than a long-lived personal access token
**And** the released extension can be installed in desktop VS Code.

**Given** a user encounters a GitHub or extension failure
**When** they inspect Pulley's local output channel
**Then** it contains actionable diagnostics without tokens or PR contents
**And** the extension sends no telemetry or third-party data and makes network calls only to GitHub GraphQL plus user-opened PR URLs.
