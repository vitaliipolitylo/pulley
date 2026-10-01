---
title: "Product Brief: Pulley"
status: ready-for-review
created: 2026-09-29
updated: 2026-09-29
---

# Product Brief: Pulley

## Executive Summary

Pulley is a small VS Code extension that helps developers notice GitHub pull requests awaiting their review without adding another noisy notification stream. It gives one timely alert when a new request arrives, then keeps unresolved requests visible in a quiet, trustworthy queue.

A friendly corgi mascot communicates queue state at a glance: alert for new work, gently overwhelmed by a backlog, and resting when the queue is clear. The first release covers one GitHub repository associated with the current VS Code workspace and operates only while VS Code is running.

Pulley is also a learning project: the creator will use the BMAD process to ship a useful, deliberately small extension and build practical experience with VS Code, GitHub integration, and AI-assisted development.

## The Problem

Developers often discover review requests late because the signal is separated from the place where they spend most of their working day. GitHub notifications and email compete with many other messages, while repeatedly checking a pull request page interrupts work and adds mental overhead. Reminders also lose trust when they repeat too often or continue showing requests after completion, withdrawal, or closure.

The primary user needs a timely first signal, a calm place to return to later, and confidence that the queue reflects reality.

## The Product Experience

When a new review request appears, Pulley sends one gentle notification, such as “Pulley spotted a review from Maya,” with an action to open the pull request. When Pulley cannot determine who requested the review, it shows the pull request author instead.

After that first alert, the request remains in a persistent queue without triggering repeated notifications. The queue shows the pull request title, author, and time since the user was asked to review. Selecting an item opens it on GitHub; resolving or withdrawing the request removes it from the queue.

A badge or count and the mascot communicate new, backlogged, and clear states. Pulley aggregates a backlog into one rotating, hand-written message and limits startup reminders to once per day. A disconnected workspace gets a clear explanation and recovery path.

## Who This Serves

The first user is a developer who works in VS Code, collaborates through GitHub pull requests, and wants requests to remain visible without constant interruptions. Success means noticing new requests promptly, returning to them when ready, and trusting the queue.

## First-Release Scope

### Included

- Connect to GitHub and resolve the repository associated with the current VS Code workspace.
- Check at activation, on manual refresh, and at the configured interval for open pull requests that directly request a review from the current user.
- Send one notification for each newly observed request, then persist notification state across reloads and restarts to prevent repeats.
- Show a queue with title, author, time waiting, and an action to open the pull request on GitHub; remove resolved, withdrawn, and closed requests promptly.
- Show a quiet count and clear mascot states for a new request, a backlog, and a clear queue.
- Aggregate an existing backlog, limit startup reminders to once per day, and use a configurable backlog threshold that defaults to five.
- Explain how to recover when the workspace is not connected to a GitHub repository.

### Outside the First Release

- Multiple repositories or an account-wide review inbox.
- Team-based review requests, GitHub Enterprise, browser-hosted VS Code, and background reminders while VS Code is closed.
- AI summaries, risk detection, focus suggestions, assisted reviews, or automatic prioritization.
- Team performance tracking, escalation rules, or manager-facing reporting.
- A custom placement setting for the view; VS Code's native layout controls are sufficient initially.
- Rich row metadata such as labels and source/target branches.

## Product Principles

1. **One useful interruption, then quiet persistence.** Personality must never create notification spam.
2. **Trust before charm.** Queue accuracy and timely removal matter more than mascot copy or animation.
3. **Friendly, never judgmental.** Backlog messages may be playful but must not imply performance monitoring.
4. **Small enough to finish.** Every first-release choice should support a complete learning loop from idea to shipped extension.
5. **Graceful at scale.** First connection and large queues use aggregate messaging and remain usable.

## Success Criteria

- A developer can connect Pulley to the current workspace repository and see every open pull request that directly requests their review.
- Each newly observed request triggers one notification with a working **Open Pull Request** action, and Pulley does not notify for that request again.
- Unresolved requests remain visible and disappear after the user completes the review, the request is withdrawn, or the pull request is closed.
- On first connection, an existing backlog triggers one aggregate notification; startup backlog reminders never appear more than once per day.
- The queue remains readable and responsive when displaying 50 pending requests. **[ASSUMPTION]**
- In a dogfood test with 3–5 developers, participants notice pending reviews sooner without finding Pulley intrusive. **[ASSUMPTION: define a concrete success threshold before testing.]**
- The creator completes the MVP through the BMAD workflow and can explain the major product and implementation decisions.

## Open Decisions

| Decision | Provisional answer | Validation needed |
| --- | --- | --- |
| Requester identity and waiting time | Load and cache the latest matching GitHub timeline event; fall back to the pull request author if requester data is unavailable. | Confirm the extra API calls remain reliable and economical with a 50-item queue. |
| Polling cadence | **[ASSUMPTION]** Check every 15 minutes, plus activation and manual refresh. | Dogfood timeliness and monitor GitHub API usage. |
| Primary VS Code surface | Use native UI with a quiet count; avoid a custom webview initially. | Prototype a Tree View or Quick Pick and verify the mascot can remain clear and useful. |
| Private repository access | Start with VS Code's built-in GitHub authentication. | Confirm that its repository permission model is acceptable; otherwise evaluate a fine-grained GitHub App flow. |
| Re-requests and automation | **[ASSUMPTION]** Reset elapsed time to the latest request addressed to the current user and label automated requesters when identifiable. | Test re-request, bot, missing-actor, authentication-expiry, and network-failure cases. |

## Future Direction

If the core reminder loop proves useful and trustworthy, Pulley can expand to multiple repositories and later summarize changes, highlight risk, suggest review focus, and help users prioritize or complete reviews while preserving developer control and a calm experience.
