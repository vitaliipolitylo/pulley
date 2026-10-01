---
name: Pulley
status: final
sources:
  - ../../briefs/brief-Pulley-2026-09-29/brief.md
  - ../../prds/prd-Pulley-2026-09-29/prd.md
updated: 2026-09-30
---

# Pulley — Experience Spine

## Foundation

Pulley is a VS Code desktop extension showing the signed-in user's direct review requests across repositories visible to that GitHub account. It works with any folder or none. The PRD's account-wide scope supersedes the linked brief's one-repository boundary. **[ASSUMPTION]** A native Tree View is the persistent queue, paired with a quiet native count, VS Code notifications, and VS Code Settings. The view should work in a sidebar or when the user moves it to the bottom Panel; its placement is not a product-specific setting. Prototype this to verify corgi legibility, row density, repository identification, and count placement. `DESIGN.md` owns appearance and inherits the active VS Code theme; this spine owns behavior. GitHub is the destination for reviewing a pull request.

## Information Architecture

| Surface | Reached from | Purpose | Journey |
|---|---|---|---|
| Queue view | Pulley view in a sidebar or user-moved bottom Panel | Current requests, corgi state, count, last successful check, Refresh, and connection recovery | UJ-1, UJ-2, UJ-3 |
| Notification | Newly observed request, first connection backlog, or eligible startup backlog | One useful alert or aggregate reminder | UJ-1, UJ-2 |
| Quiet count | **[ASSUMPTION]** Native view badge or status bar | Glanceable pending total and route to Queue view | UJ-1, UJ-2 |
| VS Code Settings | Standard settings search or view action | Check interval and backlog threshold | UJ-2 |
| GitHub PR page | Notification action or Queue row | Read and submit review | UJ-1, UJ-2 |

These surfaces cover every stated journey. The queue is account-wide; there is no first-release repository chooser, detail pane, or webview. Rows identify their repository without relying on the open workspace.

The [pending queue](mockups/key-pending-backlog.html) mock illustrates UJ-2's count, request metadata, and unknown-time fallback. The [stale and clear](mockups/key-stale-clear.html) mock illustrates preserved rows after failure and a confirmed clear state. The [sidebar workbench](mockups/workbench-sidebar.html) and [bottom Panel workbench](mockups/workbench-bottom-panel.html) mocks show two possible view positions while the same queue behavior remains. Notification, quiet count outside the queue, Settings, and GitHub PR page are specified by these documents only. If a mock conflicts with these documents, follow `DESIGN.md` for appearance and `EXPERIENCE.md` for behavior.

## Voice and Tone

Facts precede personality. The corgi sounds kind and never judges pace or scores productivity. Keep messages short in narrow editor space.

| Situation | Copy direction |
|---|---|
| New | “Pulley spotted a review request for {owner/name}#{number}: ‘{title}’.” Name requester only if verified; otherwise identify the PR author as author. |
| Backlog | “{count} reviews are waiting.” Optional rotating, hand-written gentle corgi line. |
| Clear | “No reviews are waiting in repositories visible to this GitHub sign-in.” |
| Stale | “Couldn't check GitHub. Showing the last known requests from {time}.” |
| Unconnected | Explain missing or expired GitHub authorization and give a specific Connect or Reconnect action. Note that only repositories visible to that sign-in can appear. |
| Unknown request time | “Request time unavailable.” Never substitute PR age. |

## Component Patterns

Visual specs are in the Components section of `DESIGN.md`.

| Component | Behavioral contract |
|---|---|
| Corgi mark | Reflects new, older, backlog, neutral waiting, or clear only when data supports it. Neutral waiting applies to pending requests below the backlog threshold when no new or reliably older signal applies; clear is reserved for a confirmed empty queue. **[ASSUMPTION]** The new state ends when the queue opens or the next check succeeds, whichever comes first. Backlog presentation takes precedence at threshold. Each pose has a word equivalent. |
| Queue row | Represents one outstanding direct request. Shows `owner/name` with title, author, and reliable request age so requests from different repositories remain distinguishable. Mouse or keyboard activation opens the correct GitHub PR. It remains until a later successful check confirms request end. |
| Queue count | Total from last successful check. Mark stale after failure; never show unqualified zero on failure. **[ASSUMPTION]** Activation opens Queue view. |
| Notification | One individual alert for each new request after baseline; one aggregate first-connection or eligible startup backlog alert. Dismissal changes neither queue nor alert history. |
| State message | Factual loading, clear, stale, or unavailable status, with recovery action where possible. |
| Refresh action | Starts an immediate check; repeated activation during one check does not produce duplicate visible operations. |
| Settings control | Interval and threshold use native VS Code Settings. Threshold changes presentation, not alert frequency. |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| Cold load | Queue, count | “Checking review requests…”; no confirmed zero before successful check. |
| Pending | Queue, count | Rows, count, and last successful check time; a neutral waiting corgi state when no new, older, or backlog state applies. |
| New | Queue, notification | Add row and send one alert if newly observed after baseline. |
| Older | Queue | PRD's assumed 24-hour corgi/copy change only; no alert. |
| Backlog | Queue, count, notification | Aggregate state at threshold; first-connection alert once and later startup reminder at most once per local day. Requests that arrived while VS Code was closed never get individual alerts. |
| Clear | Queue, count | After successful zero-result check, resting corgi and copy scoped to repositories visible to the GitHub sign-in. |
| Offline or GitHub failure | Queue, count | Preserve last known rows and time; label stale; offer Refresh. |
| Missing or expired authorization | Queue | Explain GitHub access and provide sign-in or reconnect action; retain prior rows as stale if any. |
| Keyboard focus | Queue, actions, settings | Native visible focus; row action works with keyboard. |
| Fifty requests | Queue | Scrollable, responsive native list; no per-row decoration that crowds metadata. |

## Interaction Primitives

- Activation, Refresh, and configured periodic checks fetch while VS Code is running.
- Native keyboard navigation and focus follow VS Code conventions. **[ASSUMPTION]** No custom shortcut is needed for MVP.
- Settings changes affect later checks or state presentation; they do not retroactively alert old requests.

## Accessibility Floor

- Queue, Refresh, notification action, and settings are keyboard reachable with visible native focus.
- Corgi pose is never the only state label. Expose count and status in words without repeated screen-reader announcements on background polling.
- Accessible row text includes full repository name, title, author, and request age or “Request time unavailable,” even when visually truncated.
- Failed checks announce stale or unavailable data rather than an empty list. Recovery actions have descriptive names.
- Honor VS Code theme contrast and reduced motion. **[ASSUMPTION]** No mascot animation in MVP.

## Responsive & Platform

Desktop VS Code only. Queue must remain understandable in a narrow sidebar and a wide, shallow bottom Panel using native layout controls. The Copilot Chat view normally opens in the Secondary Side Bar; a user can move views into the Panel, so any side-by-side Panel composition is illustrative of a customized layout. Test light, dark, high contrast, keyboard use, and zoomed UI. Browser-hosted VS Code and mobile are outside MVP. See [VS Code's custom layout guide](https://code.visualstudio.com/docs/configure/custom-layout) for supported view movement.

## Key Flows

### UJ-1 — Maya notices a new request

1. Maya codes in VS Code when a teammate directly requests her review on a pull request in any repository visible to her GitHub sign-in.
2. At the next successful check, Pulley adds the row, updates count, and shows one notification with **Open Pull Request**.
3. Maya dismisses it and keeps coding; the queue item persists without repeated individual alerts.
4. Later she opens the queue, reads repository, title, author, and reliable time since request, then activates the row.
5. **Climax:** The correct GitHub PR opens while Pulley retains the row until a later check confirms the request ended. She deferred the interruption without losing the task.

Failure: GitHub unavailable → retain and mark last known queue stale; offer Refresh, never false clear.

### UJ-2 — Maya returns to a backlog

1. Maya opens VS Code after time away; Pulley finds several requests, including ones received while it was closed.
2. Queue shows count and rows. First connection produces one aggregate alert; a later startup does so only when no reminder appeared that local day.
3. Maya can adjust check interval or backlog threshold in VS Code Settings; threshold changes presentation only.
4. She opens a row and later submits her review on GitHub.
5. **Climax:** At the next successful check, that request disappears and count falls; at zero, the corgi rests and account-scoped clear text appears.

Failure: Failed check preserves prior rows as stale. Closed or withdrawn items disappear only after a successful check.

### UJ-3 — Maya reconnects GitHub

1. Maya opens VS Code without a usable GitHub sign-in; no folder is open.
2. Queue explains that GitHub authorization is needed, offers Connect or Reconnect, and does not show a confirmed zero.
3. Maya signs in and activates Refresh if a check does not start automatically.
4. **Climax:** A successful check replaces the diagnostic with requests from repositories visible to that sign-in, or an account-scoped clear state.

Failure: If GitHub remains unavailable, diagnostic stays actionable and any prior known rows remain stale.

**Requirement trace:** UJ-1 covers FR-4–FR-8 and FR-11–FR-13; UJ-2 covers FR-5–FR-7 and FR-9–FR-13; UJ-3 covers FR-1–FR-3 and FR-6. FR-10's mascot states span all three flows. PRD assumptions A1–A8 remain source assumptions; UX-specific assumptions above need prototype or dogfood validation.
