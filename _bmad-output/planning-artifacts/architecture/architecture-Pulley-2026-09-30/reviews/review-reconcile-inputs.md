---
review: reconcile-inputs
target: ../ARCHITECTURE-SPINE.md
inputs:
  - ../../../prds/prd-Pulley-2026-09-29/prd.md
  - ../../../prds/prd-Pulley-2026-09-29/addendum.md
  - ../../../ux-designs/ux-Pulley-2026-09-29/EXPERIENCE.md
  - ../../../ux-designs/ux-Pulley-2026-09-29/DESIGN.md
date: 2026-09-30
---

# Reconcile review: inputs vs. architecture spine

## Verdict

**Mostly aligned, but needs revisions before interface and integration stories.** The spine covers the hard product rules well: alert once (AD-2/4/5/8), failure is not emptiness (AD-11), no token storage (AD-10), refresh joins an in-flight check (AD-12), and the unknown-time fallback (AD-3). No direct contradiction exists apart from the intended AD-13 scope change. However, the spine leaves several points open where two builders could reasonably diverge:

- The "new" mascot state conflicts with how the spine stores item classification.
- The spine does not say which state fields are scoped to each account.
- The view-model contract is not defined.
- The reminder rule is tied only to the `activation` trigger.
- The spine does not say how a partial GraphQL error affects a check.

AD-13 (account-wide scope) is intentional and is not listed as a miss. The PRD and UX sections it affects are listed at the end.

Severity: **High** means builders will diverge or a PRD/UX rule will be broken. **Medium** means probable divergence. **Low** means worth a line in the spine.

---

## Findings

### F1 (High): The "new" mascot state never ends under the spine's model
- **Inputs:** EXPERIENCE › Component Patterns › Corgi mark: "The new state ends when the queue opens or the next check succeeds, whichever comes first." PRD open decision 2 assigns this rule to UX.
- **Spine:** AD-2 names `queueOpened` as ending "new". AD-5 stores the `new`/`backlog` classification on the item and says it is "never recomputed". The mascot convention derives `new | older | backlog | clear` without saying which input drives `new`.
- **Gap:** If a builder derives the mascot state from `classification === 'new'`, the state lasts until the request cycle ends. The spine never says that the next successful check also ends "new". It also does not define "queue opens" as a concrete signal, for example `TreeView.onDidChangeVisibility` becoming visible, or the view already being visible when the item arrives. `queueOpened` writes durable state, but the spine does not say whether it follows the AD-8 read-fresh-then-persist sequence.
- **Fix:** Add a state field that is separate from alert classification, for example `newSignal: { keys, since } | null`. `reconcile` sets it when it emits `notifyNew`, and clears it on the next successful check that emits no new items. `queueOpened` clears it. Define `queueOpened` as the view becoming visible, including already visible when the signal is set. Route every UI transition through the same read-fresh → transition → await-write path as checks.

### F2 (High): The spine does not say which state fields are per account, and has no active-account rule
- **Inputs:** PRD FR-1: identify the user before showing their queue. FR-9: first-connection reminder. EXPERIENCE: the missing- or expired-authorization state retains prior rows as stale.
- **Spine:** AD-7 partitions state by viewer ID. AD-5 reads "the persisted `lastSuccessfulCheckAt` (written by any window)" and "the user's first successful check ever". AD-6 uses `lastBacklogReminderDate`. AD-11 uses `lastFailure`. The spine does not say whether each of these fields is per partition or global.
- **Gap:**
  - If `lastSuccessfulCheckAt` or "first check ever" is global, signing in with a second account classifies its whole existing queue as **new**. That sends one alert per request and breaks FR-9 and SM-2.
  - A failed check with reason `unauthenticated` has no viewer ID, so the spine does not say which partition receives `lastFailure`. It also does not say which partition's rows are shown as stale.
  - For sign-out, or for switching from account A to account B, the spine does not say whether A's rows stay visible as stale.
- **Fix:** In AD-7, state that `items`, `lastSuccessfulCheckAt`, `firstCheckDone`, `lastBacklogReminderDate`, `lastFailure`, and `newSignal` are all per partition. Add a top-level `activeViewerId`, set by the most recent successful check. A failure without a viewer ID applies to the active partition. When a different viewer ID succeeds, it switches `activeViewerId`, and the previous account's rows are not shown.

### F3 (High): The view model is not defined, and it drives several PRD/UX requirements
- **Inputs:**
  - FR-5: show the last successful check time.
  - FR-11: pending, stale, unavailable, and clear states are distinguishable.
  - EXPERIENCE: "Checking review requests…" cold load with no confirmed zero; stale copy with `{time}`; the unconnected state with a specific action; the count marked stale after failure.
  - Accessibility Floor: accessible row text includes the full title, author, and age or "Request time unavailable".
  - FR-8: author labelled as author, not as requester.
- **Spine:** "It renders a view model derived by core from state." There is no type, status union, or input list. `viewModel(state')` in the sequence diagram takes no `now`, threshold, or in-flight flag.
- **Gap:** Elapsed time, the A5 "older" state, and the threshold all need `now` and settings. The loading state needs the shell's in-flight flag, which AD-2 keeps out of `State`. Without a defined contract, `queueView` and `statusCount` will each derive their own status and copy.
- **Fix:** Add a `ViewModel` contract, for example:
  - `viewModel(state, { now, threshold, checking }) → { status: 'loading' | 'unconnected' | 'pending' | 'clear' | 'stale' | 'unavailable', reason?, action?, message, lastSuccessfulCheckAt?, count: number | null, countStale: boolean, mascot: { state, text }, rows: [{ key, repo, number, title, authorLabel, requesterLabel?, ageText, accessibleLabel, url }] }`.
  - `stale` means prior rows exist. `unavailable` means no successful check has happened yet.
  - `count` is `null` unless a successful check exists.
  - All copy strings come from one core copy module, and both views render from this contract alone.

### F4 (Medium): The reminder is tied to the `activation` trigger, so a failed startup check loses the day's reminder
- **Inputs:** PRD FR-9, UJ-2, and SM-2: on a later startup, give one aggregate reminder when requests remain, at most once per day.
- **Spine:** AD-6 says only a check "triggered by activation" may emit `notifyBacklog`. Periodic, manual, and session-changed checks never emit it.
- **Gap:** A startup check can fail because the network is offline, the sign-in is still resolving (so the check is later triggered by `session-changed`), or GitHub rate-limits the request. The next successful check then has a different trigger, so that startup never gets its reminder. FR-9 says "at most", so this is technically allowed, but it breaks the UJ-2 expectation in common cases such as opening a laptop while Wi-Fi reconnects.
- **Fix:** Emit the reminder on "the first successful check in this window since activation", tracked with a per-window shell flag that is passed in `ctx`, while keeping the once-per-local-day guard. Continue to exclude periodic reminders after that first check.

### F5 (Medium): The spine does not say how a partial GraphQL error affects a check
- **Inputs:**
  - FR-6: remove requests only after a successful check.
  - FR-7 and SM-2: exactly one alert per request.
  - FR-3: explain unavailable data.
- **Spine:** AD-9 maps "HTTP and GraphQL errors" to `graphql_error`, and the AD-13 deferred item says org restrictions make PRs "silently absent".
- **Gap:** An account-wide search often returns `data` together with `errors` when an organization uses SAML/SSO or OAuth-app restrictions. There are two readings, and both cause problems:
  - **Treat the check as failed.** A user who belongs to one restricted organization never gets a successful check, and the queue stays stale permanently.
  - **Treat the check as succeeded.** Items that disappear because of a transient error end their request cycle under AD-4 and are alerted again later, which breaks SM-2.

  A related risk is that GitHub search is eventually consistent. If an item drops out of results for one poll, AD-4 ends its cycle, and the item is alerted again when it returns.
- **Fix:**
  - Define the handling rule: a response with `data.search` present and errors limited to resource-access types counts as `ok: true`, and the error types are logged. Any other error counts as `ok: false`.
  - Optionally, require an item to be missing from 2 consecutive successful checks before its cycle ends. This is a small change to AD-4 that protects SM-2 from search-index flicker. Record the choice either way.

### F6 (Medium): The "older" state has no derivation rule for the aggregate or for unknown times
- **Inputs:** PRD A5: "older starts 24 hours after the latest direct request". EXPERIENCE: the "Older" state changes only the corgi and copy.
- **Spine:** The mascot precedence is `backlog > new > older > clear`, with no rule for when `older` applies.
- **Gap:** The spine does not say whether "older" applies when any item or all items have `requestedAt` more than 24 hours before `now`. It also does not say what happens when `requestedAt` is missing: AD-3 forbids substituting PR age, so such an item can never become older. The view also needs to re-derive the state as time passes between checks. With a 15-minute polling interval, re-deriving only after each check is acceptable, but the spine should say so.
- **Fix:** Add to the mascot convention: `older` applies when at least one pending item has a known `requestedAt` and `now - requestedAt ≥ 24h`. Items with an unknown time never count toward `older` and never use PR age. The view model is re-derived after every check and after every settings change; no extra timer is needed.

### F7 (Medium): Settings validation and change handling are not specified
- **Inputs:**
  - EXPERIENCE › Interaction Primitives: settings changes affect later checks or presentation and never alert old requests retroactively.
  - Settings control: the threshold changes presentation only.
  - PRD counter-metric: faster polling is not a success measure.
  - Addendum: economical API use.
- **Spine:** AD-12 restarts the timer when the interval changes. AD-7 reads settings from configuration. AD-5 uses `2 × pollInterval`.
- **Gap:**
  - The spine sets no minimum or maximum interval, so a value of 0 or 1 is possible.
  - It does not say that a threshold change re-renders the view without running a check.
  - It does not say which interval AD-5 uses when windows have different values, or when the value changed since the last check.
  - It does not say that `onDidChangeConfiguration` must never call `reconcile` with a new-item path.
- **Fix:**
  - Declare `pulley.checkIntervalMinutes` with a minimum of 5, a default of 15, and a maximum of 240 in `contributes.configuration`, and clamp the value in the shell.
  - `pulley.backlogThreshold` has a minimum of 1 and a default of 5.
  - `onDidChangeConfiguration` restarts the timer and re-derives the view model only.
  - AD-5 uses the interval from the current `ctx` at check time. This is an accepted approximation.

### F8 (Medium): The spine sets no activation event, and the "works with no folder" rule depends on one
- **Inputs:** PRD FR-5: check on activation. AD-13: works with any folder or none.
- **Spine:** The `activation` trigger exists, but no `activationEvents` entry is specified.
- **Gap:** The scaffold defaults and view-based activation (`onView:`) would delay the startup check until the user opens the view. That breaks UJ-1 and UJ-2 notifications, and it changes what "activation" means for AD-6.
- **Fix:** Require `"activationEvents": ["onStartupFinished"]`, plus the implicit view and command activation. State that the startup check runs from `activate`.

### F9 (Medium): Background polling must not cause repeated screen-reader announcements or needless re-renders
- **Inputs:** EXPERIENCE › Accessibility Floor: expose count and status in words without repeated screen-reader announcements on background polling. Keyboard-reachable rows with descriptive names.
- **Spine:** The sequence diagram re-renders from the view model after every check. The spine sets no rule for when the tree is refreshed.
- **Gap:** Calling `onDidChangeTreeData` on every poll, or changing the view message or badge text each time, can make screen readers re-announce the view. This matters especially when the elapsed-time text changes every poll.
- **Fix:** The shell fires `onDidChangeTreeData` or updates the badge or message only when the relevant part of the view model changed. Rows use `TreeItem.accessibilityInformation` from `row.accessibleLabel`, and activation uses `TreeItem.command`, so keyboard activation is native. Periodic checks never produce a notification except for `notifyNew`.

### F10 (Low): Responsiveness with 50 items is not tied to query limits or a test
- **Inputs:** PRD A7 and the responsiveness quality: 50 pending requests. Open decision 1: economical for a 50-item queue. EXPERIENCE: the fifty-requests state.
- **Spine:** AD-9 pages until `hasNextPage` is false, with no page size and no upper bound. Account-wide scope can exceed 50 items, for example with bot or CODEOWNERS fan-out.
- **Fix:**
  - Set the search page size to `first: 50`, which fits the stress case in one request, alongside `timelineItems(last: 10)`.
  - Add a hard safety cap, for example 500 items or 10 pages. When the cap is reached, the check result is `ok: false`, `reason: graphql_error`, and the result is logged; items are never truncated silently.
  - Add a core test and a smoke test that use 50 items.
  - The spike should record the rate-limit cost of one check.

### F11 (Low): Backlog copy rotation conflicts with the rule that core is pure
- **Inputs:** FR-10: backlog copy rotates, and copy is hand-written.
- **Spine:** AD-1 forbids reading the clock in core but says nothing about randomness.
- **Fix:** Choose the rotation index deterministically, for example from a hash of the local date string passed in `ctx`. Core must not use `Math.random`.

### F12 (Low): The "closed" window used by AD-5 is 2 × the polling interval, but SM-2 says any request that arrives while VS Code is closed gets no individual alert
- **Inputs:** FR-9 and SM-2: requests arriving while VS Code is closed generate no individual alert.
- **Spine:** AD-5 treats an item as new when the last check was at most `2 × interval` ago. If the user closes VS Code for 20 minutes and reopens it, requests that arrived in that time receive individual alerts. The memlog accepts the opposite edge case, where arrivals during a long sleep become backlog, but not this one.
- **Fix:** Record this in AD-5 as an accepted approximation, or treat items first seen on the window's first check after activation as backlog when no other window has checked within one interval. Also update SM-2's wording during dogfooding.

### F13 (Low): Unauthenticated sub-cases need distinct actions
- **Inputs:** FR-3 and EXPERIENCE: explain missing or expired authorization, with a sign-in or reconnect action and descriptive recovery names.
- **Spine:** There is one `unauthenticated` reason. A silent `getSession` that returns no session is not described as a check outcome.
- **Fix:** Add `reason: 'unauthenticated'` with `detail: 'no_session' | 'rejected'`. The first maps to the **Connect GitHub** action. The second, HTTP 401 or a revoked token, maps to **Reconnect GitHub**. When no session exists at activation, the result counts as a failed check (`ok: false`) and does not touch the network.

### Confirmed as carried (no action)
- Refresh de-duplication (AD-12 join) matches EXPERIENCE's Refresh action rule.
- Dismissing a notification does not change state, because AD-8 persists before effects and there is no dismiss transition.
- The unknown-time fallback and the author-as-author label are covered by AD-3.
- Failure never shows as clear, and zero appears only after success (AD-11).
- Tone: no escalation is enforced by the closed effect union (AD-2) and by the rule that periodic checks never remind (AD-6).
- Privacy (AD-14). The `repo` scope breadth is logged under Deferred.
- The threshold affects presentation only (A6, AD-6).

---

## PRD/UX sections requiring update for account-wide scope (AD-13)

**PRD (`prd.md`)**
- Target user and journeys: remove "working in VS Code on one GitHub repository".
- UJ-3: reframe around authorization or GitHub availability, not associating a folder with a repository.
- Terms: delete **Workspace repository**. Remove "in the workspace repository" from **Review request** and **Queue**.
- Scope boundaries: remove "multiple repositories" and "account-wide requests" from the exclusions. Add the note that only repositories visible to the sign-in are included, and that organization OAuth restrictions can hide PRs.
- Connect the workspace (section intro): "finds the workspace repository".
- FR-1: account and repository data; now uses the `repo` scope across all repositories.
- FR-2: rewrite as account-wide scope with a visibility note.
- Assumption A2: retire it in both FR-2 and the Assumptions index.
- FR-3: remove "the repository cannot be resolved".
- FR-4: remove "in the workspace repository".
- FR-8: the notification identifies `owner/repo`.
- FR-11: rows include `owner/repo`.
- Cross-cutting quality › Privacy: all repositories the account can see.
- SM-1: remove "for the workspace repository".
- Open decision 3: private repository access is answered by the `repo` scope.
- Addendum › GitHub identity: optionally note that the GraphQL search `user-review-requested:@me` is the chosen approach.

**EXPERIENCE.md**
- Foundation: remove "scoped to one workspace repository".
- Information Architecture: remove "no … account-wide inbox". The Queue view row no longer handles repository recovery.
- Voice and Tone:
  - **Clear:** remove "in this workspace". Use account-wide copy plus the visibility note.
  - **New:** add `owner/repo`.
  - **Unconnected:** remove the "missing … repository" case.
- Component Patterns › Queue row: add the repository.
- State Patterns: delete the **Missing or ambiguous repository** row. Clear becomes "scoped clear copy" (redefine the scope).
- Accessibility Floor: accessible row text includes `owner/repo`.
- Key Flows:
  - UJ-1 step 1: "connected workspace repository".
  - UJ-3: rewrite the whole flow and its climax, "checking the right repository".
  - Requirement trace: FR-2.
- Mockups (`key-pending-backlog.html`, `key-stale-clear.html`, and the workbench mocks): rows and clear copy need a repository label.

**DESIGN.md**
- Typography: add the repository label as a secondary role.
- Layout & Spacing: the row priority becomes title, then `owner/repo`, author, and age.
- Components › Queue row: add the repository label. Keep the rule against "branch metadata".
