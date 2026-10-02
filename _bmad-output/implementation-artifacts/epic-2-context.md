# Epic 2 Context: Notice Requests Without Repeated Interruptions

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Turn Epic 1's trustworthy queue into a calm, installable MVP. A developer gets exactly one useful notification for each new direct review request. A backlog is summarized in one aggregate reminder per local day, never as a flood of individual alerts. A quiet count, an accessible corgi state, and gentle hand-written copy show the queue state at a glance. The epic adds durable alert and reminder state, focus-gated notification delivery, mascot and count presentation, packaging and CI, technical and usability dogfooding, and Marketplace publishing. The goal is to make Pulley something developers trust and do not find intrusive.

## Stories

- Story 2.1: Get One Useful Alert for a New Request
- Story 2.2: Return to a Backlog with a Daily Limit
- Story 2.3: Read Queue State at a Glance
- Story 2.4: Package and Technically Dogfood the Calm MVP
- Story 2.5: Validate the Experience with Developers
- Story 2.6: Publish Pulley with a Support Path

## Requirements & Constraints

- **Alert once per cycle:** alert history survives reloads, restarts, and other windows. The same outstanding request never produces a second individual alert. A re-request can alert again only after a successful complete check has observed the previous cycle end. Cycles that start and end entirely between checks are outside the MVP guarantee.
- **New-request notification:** it names the repository and PR (`owner/name#number`, title) and has an **Open Pull Request** action that opens the exact PR URL. It names the requester only when that person was verifiably matched to the viewer's direct request. Otherwise it labels the PR author as the author. Dismissing it changes neither the queue nor alert history.
- **Backlog:** existing requests at first connection produce one aggregate alert, whatever the threshold. Requests that arrive while VS Code is closed, or during a long gap in checks, join the backlog silently.
  - On later startups, show at most one aggregate reminder per local calendar day, and only while requests remain.
  - A continuous session gets no repeated reminder.
  - A failed startup check neither uses up the day's reminder nor clears the queue.
- **Mascot and copy:** the corgi has states for new, older, backlog, neutral waiting, clear, and unknown. The copy is kind and short, with facts first. It never shames, scores productivity, or escalates. Backlog lines rotate deterministically.
- **Older:** a request counts as older only when its latest direct-request time is known and is at least 24 hours old. The older state changes only visuals and copy and never triggers an alert.
- **Quiet count:** the count opens the queue. It is `null` before the first success, marked stale after a later failure, and never shown as an unqualified zero on failure.
- **Backlog threshold:** `pulley.backlogThreshold` (default 5, minimum 1) affects presentation only. Changing it never alerts retroactively and never triggers a check.
- **No engagement tricks:** no extra reminders from mascot or threshold state, no animation, and no faster polling meant to raise engagement.
- **Success criteria:**
  - Each new request produces exactly one working notification. A backlog produces one first-connection alert and no more than one startup reminder per day.
  - The queue stays responsive with 50 pending items.
  - In a 3–5 developer test, at least 4 of 5 (or all 3 if only three take part) find and open a waiting review within two minutes and do not call Pulley intrusive.
- **Privacy:**
  - Network calls go only to `https://api.github.com/graphql` and to PR URLs the user opens.
  - There is no telemetry, and tokens and PR contents are never logged.
  - Diagnostics go only to the local "Pulley" output channel.

## Technical Decisions

- **Core decides, shell executes.**
  - `reconcile`, `queueViewed`, and `windowFocused` are the only transitions that decide alerts.
  - Effects form a closed union: `notifyNew { itemId }` and `notifyBacklog { count, firstConnection }`.
  - The shell never decides whether to notify, and the view never receives effects.
  - `ctx` carries `now`, `today` (local `YYYY-MM-DD`, computed in the shell), `windowFocused`, `startupReminderDue`, and settings.
- **Write before effect:** `store.mutate` writes durably, and only then runs effects and re-renders. A transition emits an effect only when `ctx.windowFocused` is true, and marks it `shown` in the same write.
- **Durable alert fields:**
  - Account fields: `firstCheckDone`, `lastBacklogReminderDate`, `backlogAlert: none|pending|shown(firstConnection?)`, and `newSignal`.
  - Item fields on `Tracked`: `firstSeenAt`, `origin: new|backlog`, and `alert: none|pending|shown`.
  - All of these live in the account partition of `pulley.state.v1`.
  - `startupReminderDue` is per-window memory. It is set at activation and cleared by that window's first successful check, and it is never persisted.
- **New or backlog:** a newly observed item is **backlog** when `firstCheckDone` is false, or when `fetchStartedAt` minus the previous `lastAttemptAt` is more than 2 × the previous `lastAttemptIntervalMs`.
  - Otherwise it is **new** and its `alert` becomes `pending`.
  - `origin` is never recomputed.
  - `newSignal` is set when a check adds a new item. It is cleared by a successful check that adds none, or by `queueViewed`.
- **Cycles:** identity is the PR GraphQL node ID.
  - The first complete check that omits an item deletes it together with its alert history, so a later reappearance starts a new cycle.
  - Incomplete results never end a cycle.
  - A re-request while the item stays present only updates `requester` and `requestedAt`.
- **Backlog reminder:** `backlogAlert` becomes `pending` in two cases:
  - **First connection:** the first successful check (`firstCheckDone` false) has items. That check sets `firstCheckDone` whether or not items exist.
  - **Ongoing reminder:** pending items exist, `lastBacklogReminderDate ≠ today`, and either `startupReminderDue` is set or this check classified items as backlog.

  Setting it pending also sets `lastBacklogReminderDate = today`.
- **Focus gating:** every window records pending alerts. `windowFocused` delivers whatever is still pending, working from freshly read state. The race where two windows gain focus within milliseconds of each other is accepted.
- **View model:** it adds `mascot` (`new|older|backlog|waiting|clear|unknown`) and `mascotText`.
  - Precedence for pending work: backlog (count ≥ threshold), then new (`newSignal`), then older, then waiting.
  - `clear` applies only after a successful check with zero results. `unknown` applies whenever data is not confirmed.
  - The count and the tree render from the same `viewModel`. The shell re-renders only when the model changes.
  - The backlog line is chosen by a deterministic function of `today`.
  - All strings live in `src/core/copy.ts`.
- **New shell units:** `src/shell/notifier.ts` (native notifications) and `src/shell/statusCount.ts`. The prototype chooses whether the count is a native view badge or a status bar item.
- **Tests:**
  - Table-driven core tests with one case for every alert, cycle, classification, backlog, and focus rule.
  - A migration test for each stored version.
  - Host smoke tests for activation without the view open, `store.mutate` ordering, and notification delivery.
- **Release:**
  - Package with `@vscode/vsce` 4.0.0, which needs Node ≥ 22; tooling uses Node 24 LTS.
  - The publisher and extension ID are fixed before the first distributed `.vsix` and never change, because `globalState` is keyed by them.
  - Use SemVer, with the same version in the `.vsix` and on the Marketplace.
  - An incompatible state change bumps `schemaVersion` and adds a tested `migrate` step, keeping the `pulley.state.v1` key.
  - Publish with `vsce publish --azure-credential` (Microsoft Entra), not a PAT.
  - CI runs on GitHub Actions (`.github/workflows/ci.yml`): tests and packaging on push. CI must be confirmed before the release story.

## UX & Interaction Patterns

- Use native VS Code notifications. A new-request message reads like "Pulley spotted a review request for {owner/name}#{number}: '{title}'." A backlog message reads "{count} reviews are waiting." and may add one gentle rotating corgi line.
- **Corgi mark:** compact, with broad upright ears, a low wide face, a short muzzle, and a central blaze. It must not read as a generic dog face.
  - Its state variants are subtle, and every pose has a text equivalent.
  - The `corgi-*` colors (coat `#c98143`, cream `#fff8ec`, ear `#e8a198`, ink `#3e302d`) are used only in the artwork, never as UI state colors.
  - There is no animation, including under reduced motion.
  - Reference vectors are `mockups/corgi.svg` (waiting) and `mockups/corgi-resting.svg`.
- The count is quiet and numeric, with no competing decorative badge.
- State must never rely on pose or color alone. Expose the count and status in words. Background polls must not repeatedly announce an unchanged state to screen readers.
- Validate the following in sidebar and bottom Panel placements at real icon size:
  - light, dark, and high-contrast themes, plus zoomed UI;
  - keyboard and screen-reader use;
  - native focus, selection, and typography.

  Moving the view must not change behavior. There is no placement setting and no custom shortcut.
- Dogfooding checks whether the count, repository names, corgi state, and recovery actions are understandable without extra alerts.

## Cross-Story Dependencies

- Builds on Epic 1's pure core, `store.mutate`, account-partitioned schema (alert, origin, newSignal, and backlog fields already reserved), `viewModel`, scheduler, and queue view.
- Story 2.1 (new/backlog classification, alert state, focus-gated notifier) comes before Story 2.2, which reuses that classification and delivery path for aggregate reminders. Story 2.3 consumes `newSignal`, the threshold, and request times from both stories.
- Stories 2.4 (package and CI), 2.5 (usability validation), and 2.6 (publish) run in that order after 2.1–2.3. Story 2.4 dogfoods the installed build with multiple repositories and no folder open. It must cover partial errors, re-requests, a missing requester, expired auth, cross-window updates, and 50 items. Story 2.5's unresolved usability failures must be triaged before 2.6. Story 2.6 needs the dogfood go decision and a fixed publisher ID.
