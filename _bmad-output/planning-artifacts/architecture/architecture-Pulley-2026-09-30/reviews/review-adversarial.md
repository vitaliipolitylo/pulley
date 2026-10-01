---
review: adversarial
target: ../ARCHITECTURE-SPINE.md
prd: ../../../prds/prd-Pulley-2026-09-29/prd.md
date: 2026-09-30
verdict: not build-ready — revise AD-5, AD-6, AD-7, AD-8, AD-12 before stories are cut
---

# Adversarial Review — Pulley Architecture Spine

## Method

For each hole, two units one level down (stories or agents) are built so that each follows every AD literally. Then a scenario is run against the product rules (FR-6..FR-9, SM-2). Two things are out of scope and not re-argued: account-wide scope (AD-13) and the accepted race where two windows check at the same moment (AD-8). A hole is reported only if it causes **lost** alerts, or duplicates that happen **systematically** rather than occasionally.

## Verdict

**Not build-ready.** The spine is well-shaped. The pure core, single decider, and failure-is-not-emptiness rules are strong. The weak point is the multi-window and time-continuity model. The AD-8 race is described as happening "at the same moment", but several common events (install, window restore, `onDidChangeSessions`, sleep/resume) line windows up **deterministically**. Separately, AD-5 measures continuity only from successful checks. As a result, an ordinary network outage silently turns in-session requests into backlog, and those requests get no alert and no reminder. There are two critical holes, three high, and five medium/low. Every hole has a concrete rule fix below.

| # | Hole | Severity | Breaks | Fix (new/tightened AD) |
|---|------|----------|--------|------------------------|
| H1 | A stale check result overwrites a newer one (resurrect or erase) | Critical | FR-6, FR-7, SM-2 | AD-8: results are ordered by `fetchStartedAt` and older results are dropped |
| H2 | An outage, sleep, or interval change turns in-session requests into silent backlog | Critical | FR-8, SM-2 | AD-5: continuity = liveness heartbeat + persisted interval; AD-6: reminder for backlog discovered mid-session |
| H3 | Broadcast triggers line windows up; alerts land in unfocused windows | High | SM-2, FR-9 | New AD: focus-gated effect execution with `alertStatus` pending→shown; jitter for non-manual triggers |
| H4 | Partition scope of scalars is unspecified; an in-flight check from the old account lands after a switch | High | FR-7, FR-8, FR-9 | AD-7: explicit per-partition `State` shape; AD-10: session-generation discard |
| H5 | Two write paths (check vs. UI transition) and extension version skew between windows | High | FR-7 | AD-7/AD-8: single serialized `store.mutate`; `schemaVersion` never-downgrade |
| H6 | The daily reminder is lost when the activation check fails or joins another trigger | Medium | FR-9 | AD-6/AD-12: per-process `startupReminderDue` consumed by the first success |
| H7 | A transient omission from GitHub search ends the cycle, then re-alerts | Medium | FR-7, SM-2 | AD-4/AD-9: `issueCount` check; absence must be confirmed |
| H8 | First connection and reminder date diverge | Medium | FR-9, SM-2 | AD-6: *any* `notifyBacklog` sets the date |
| H9 | Tracked-item shape: frozen vs. refreshed fields | Medium | FR-10, FR-11 | AD-3/AD-4: `TrackedItem = latest RequestItem + core-owned fields` |
| H10 | Another window's view and count stay stale; the key changes on repo rename | Low | FR-6, FR-7 | Re-render on focus; key from PR node ID |

---

## H1 — A stale result overwrites a newer one (Critical)

**Units.**
- *Story A (scheduler, window 1)* follows AD-8 literally: fetch → re-read state → `reconcile` → await write → effects.
- *Story B (scheduler, window 2)* is the same code.

Both follow AD-8. AD-8 puts the **read** after the fetch, but nothing puts the **results** in order.

**Scenario (resurrection).** Window 1 starts fetching at t0. The search has several pages because of the timeline items, so it takes a few seconds, and it includes `octo/app#42`. Maya submits her review. Window 2 starts at t1 > t0, gets a result without `#42`, and writes the state: the cycle ends and the history is deleted (AD-4). Window 1 then re-reads fresh state (`#42` is absent), reconciles its **older** result (`#42` is present), and sees `#42` as first-observed. The gap is small, so the item is classified **new** and **`notifyNew` fires for a request Maya already completed**. The item also reappears in the queue until the next check.

**Scenario (erasure → duplicate).** The inverse also happens. Window 2's newer result contains a new `#43`, which is recorded and alerted. Window 1's older result lacks `#43`, and it lands afterwards. AD-4 says a successful check that omits the key ends the cycle, so the history is deleted. At the next check `#43` reappears, is classified **new** (gap small), and fires a **second alert**. This breaks FR-7.

**Why this is not the accepted race.** The accepted race is two windows reading the same state at the same moment. This hole needs only fetch *intervals* that overlap, not simultaneous reads. Paginated GraphQL makes the window seconds wide, and H3 shows that triggers are routinely synchronized. The effect is also worse than a duplicate: it produces alerts for *ended* requests and it clears alert history.

**Fix — tighten AD-8.** Add the following rule:
> Every `CheckResult` carries `fetchStartedAt` (the shell's clock read before the first page request). The partition stores `lastAppliedFetchStartedAt`. `reconcile` treats a result whose `fetchStartedAt ≤ lastAppliedFetchStartedAt` as a no-op: it returns an unchanged state and no effects, and the shell only re-renders. A failed result never advances `lastAppliedFetchStartedAt`.

Add a table-driven core test that covers both interleavings.

---

## H2 — An outage, sleep, or interval change turns in-session requests into silent backlog (Critical, LOST alerts)

**Units.**
- *Story A (reconcile/classification)* implements AD-5: backlog if `now − lastSuccessfulCheckAt > 2 × pollInterval`.
- *Story B (failure handling)* implements AD-11: a failure "never changes … `lastSuccessfulCheckAt`".

Each unit is correct on its own. Together they produce the following scenarios.

**Scenario 1: flaky network or VPN.** Maya is coding with VS Code open. The network drops for 45 minutes (on a train, or with VPN reconnects), so checks fail for 3 intervals. A teammate requests her review during the outage. The first successful check after reconnect sees a gap of 45 minutes, which is more than 30. `#42` is classified **backlog**, and no `notifyNew` fires. The trigger is `periodic`, so AD-6 **does not emit a reminder either**. The request arrived while Pulley was active and the user was in the editor, yet it produced **zero notifications**. SM-2 is violated: "Each new request observed while Pulley is active generates exactly one notification". The same happens with `rate_limited` or `graphql_error` streaks.

**Scenario 2: sleep/resume.** The laptop sleeps overnight with VS Code open. On resume, a periodic tick sees a gap of 10 hours, so everything is classified backlog and the trigger is periodic, which means no reminder. The next activation reminder comes only on a later day with a *new window or restart*, and a user who never restarts VS Code **never gets any signal** for those requests. FR-9 intends "requests that arrived while closed join the backlog" and then receive a reminder. Here they join the backlog with no path to a reminder.

**Scenario 3: settings change or mixed intervals.** `pulley.checkIntervalMinutes` is not declared application-scoped, so it can differ per workspace. Window B runs at 60 minutes. Window A (a workspace set to 5 minutes) opens 40 minutes after B's last success. A's threshold is 10 minutes, so everything that arrived during those 40 minutes (while B was active) is classified backlog. The same thing happens in a single window: a user changes the interval from 60 to 5 at minute 50, the timer restarts, the next check is at 55 minutes, and the threshold is 10 minutes, so the requests are lost.

**Fix — rewrite AD-5 continuity and extend AD-6.** Add these rules:
> AD-5′: Continuity is measured from `lastAliveAt`: the time of the latest check *attempt*, successful or failed, by any window. The attempt writes it through the AD-8 path, and this is the one field a failure may change besides `lastFailure`. The threshold uses the interval *persisted with that attempt*: `max(persistedInterval, currentInterval) × 2`. `pulley.checkIntervalMinutes` and `pulley.backlogThreshold` are declared `"scope": "application"`. An item is backlog only on the first successful check of a partition, or when `now − lastAliveAt` exceeds the threshold. That is the case where VS Code (or the machine) was actually not running Pulley.
>
> AD-6′: When a successful check classifies ≥1 item as backlog *by gap* (not by the first-ever rule) and the trigger is not `activation`, core emits `notifyBacklog` under the same once-per-local-day cap. Sleep/resume then behaves like a startup.

Note that "failure changes only `lastFailure`" in AD-11 must be relaxed to allow `lastAliveAt`. Alternatively, derive liveness as `max(lastSuccessfulCheckAt, lastFailure.at)` and state that explicitly.

---

## H3 — Broadcast triggers line windows up; alerts land in unfocused windows (High)

**Units.**
- *Story A (auth, AD-10)*: "`onDidChangeSessions` for `github` triggers a check."
- *Story B (scheduler, AD-12)*: "each window runs its own scheduler". The timer starts at activation with a fixed period.

Both follow the rules literally.

**Deterministic duplicate cases (not "occasional"):**
1. **Install.** Installing the extension activates it in *every* open window at once. Every window runs its first-ever check simultaneously, so there are **N first-connection reminders**.
2. **Connect.** The user clicks Connect in window 1. `onDidChangeSessions` fires in **all** windows at once, so all of them run `session-changed` checks together. The same thing happens on account switch and on **every token refresh or session update**, which fire the event with no user action. Any request that arrived since the last check is then alerted N times.
3. **Window restore at startup.** VS Code restores 3 windows at once. There are three activation checks, so **three daily reminders every day**. The periodic timers also start at the same time with the same period, so the windows stay **phase-locked** for the rest of the session. Every new request can then be alerted by each window whose read overlaps, and it happens at every tick, not rarely.

**Loss case.** AD-8 is effectively "first writer alerts". The winner is whichever window's timer fired first, and that is usually a window in the background, on another monitor or virtual desktop. VS Code notifications live inside that window's notification center. Maya is typing in the focused window and **never sees the toast**, while alert history records the request as alerted. With N windows, the chance that the alert lands in the window she is looking at is about 1/N. SM-2 counts it as delivered, but it is effectively lost.

**Fix — new AD (effect execution) plus tightened AD-12:**
> AD-15 Focus-gated delivery: The tracked item has `alertStatus: 'none' | 'pending' | 'shown'` (core-owned). `reconcile` marks new items `pending`, and returns `notifyNew` effects only when `ctx.windowFocused` is true, flipping them to `shown` in the same persisted state. A named core transition `windowFocused(state, now)` emits `notifyNew` for all `pending` items and persists `shown` before executing (AD-8 order). The same gating applies to `notifyBacklog`, with a `backlogReminderPending` flag. Only one window is focused at a time, which turns systematic duplicates into rare ones. It also guarantees the toast appears where the user is looking.
>
> AD-12′: Non-manual triggers (`activation`, `session-changed`, the first `periodic`) are delayed by a random offset: 0–10 s for activation and session-changed, and a uniform phase in [0, interval) for the first periodic tick. This keeps windows from phase-locking.

Pending alerts that are never shown (the user never returns to VS Code before the cycle ends) are acceptable under A1 and should be documented.

---

## H4 — Partition scope is unspecified; an old-account result lands after a switch (High)

**Units.**
- *Story A (store/state type)* reads AD-7 "partitioned by GitHub viewer ID" as `{ partitions: { [viewerId]: { items } }, lastSuccessfulCheckAt, lastBacklogReminderDate, lastFailure, everChecked }`. The scalars stay global because AD-5 says "written by any window", AD-6 says "the user's first successful check ever", and `lastFailure` for `unauthenticated` has no viewer.
- *Story B (reconcile)* reads the same words as meaning everything lives per partition.

Both are literal readings.

**Scenario under Story A's shape.** Alice has used Pulley for months. She switches the VS Code GitHub account to Bob, whose account has 12 open review requests. The partition for Bob is empty, but `everChecked` is true globally and the global `lastSuccessfulCheckAt` is 10 minutes old. All 12 items are classified **new**, producing **12 individual alerts**, and no first-connection summary is shown. FR-9 and SM-2 are violated. Switching back to Alice a week later: her partition's stale items reconcile, and anything that arrived during that week is **new** under the global timestamp, so the result is again a burst of alerts. The reverse (Story B's shape plus Story A's reminder code) gives a second daily reminder on the day of the switch.

**In-flight race.** Window 1 starts a check with Alice's token. Bob signs in, and window 2 applies Bob's result. Window 1's Alice result lands afterwards. AD-10 says "if viewer ID changes, core switches partitions". The switch is now driven by *result arrival order*: the active partition flips back to Alice, and the view shows Alice's queue while the session belongs to Bob. Any new Alice items produce alerts. This violates "No alerts fire for the other partition".

**Fix — tighten AD-7 and AD-10:**
> AD-7′: `State = { schemaVersion, partitions: Record<ViewerId, Partition> }`. `Partition = { items, firstCheckDone, lastAppliedFetchStartedAt, lastAliveAt, persistedInterval, lastSuccessfulCheckAt, lastBacklogReminderDate, lastFailure }`. No product scalar lives outside a partition. An `unauthenticated` failure is recorded against the partition of the last known viewer for *this window* (held in memory), or dropped if there is none.
>
> AD-10′: The active viewer is **not** stored in shared state. Each window holds `activeViewerId` in memory from its current session. The shell tags each check with a session generation counter, which is incremented on every `onDidChangeSessions`. A result whose generation is stale is discarded before `reconcile`: no write and no effects.

---

## H5 — Two write paths and version skew (High)

**Units.**
- *Story A (scheduler)* follows AD-8: fresh read, reconcile, write.
- *Story B (queue view)* implements the AD-2 named transition `queueOpened`. AD-8 governs only "each check", so Story B calls `queueOpened(cachedState)` on the state it rendered from and writes the result.

The state is one JSON blob (AD-7), so writes are last-writer-wins on the whole record.

**Scenario.** Window 2 renders at t0. Window 1's check at t1 adds and alerts `#43`. Maya opens the queue in window 2, which writes `queueOpened(state@t0)`, and that state has no `#43`. The alert history for `#43` is gone. The next check sees `#43` as first-observed and classifies it new, so a **duplicate alert** fires. The reverse order resurrects removed items. This is not a same-moment race. It needs only a UI event in one window after a check in another, which happens many times a day.

**Version skew.** VS Code updates extensions in the background. Windows that have not reloaded keep running the **old** extension. A future `v2` shape written by an updated window is read by an old window, whose `migrate(unknown) → empty` (AD-7) returns empty state. The old window's next check is then the "first successful check ever", which gives a **first-connection reminder**. It also *writes* that empty-derived state over v2, wiping the alert history. The updated window then migrates the old-shaped data, and the result ping-pongs between windows.

**Fix — tighten AD-7 and AD-8:**
> AD-8′: Every mutation, including checks, UI transitions, and `windowFocused`, goes through one shell function `store.mutate(transition)`. It (1) serializes within the window, (2) re-reads the state immediately before applying the pure transition, (3) awaits the write, and (4) returns effects to execute. No shell code writes `pulley.state.v1` any other way.
>
> AD-7″: State carries `schemaVersion`. `migrate` returns `{ kind: 'newer' }` for a version above the one the code knows. In that case the window does **not** write, executes no effects, and shows "Reload window to update Pulley". `migrate` returns empty state only for corrupt input, and it never treats "unknown but newer" as corrupt.

---

## H6 — The daily reminder is lost when the activation check fails or joins another trigger (Medium, LOST reminder)

**Units.**
- *Story A (scheduler)* implements "a trigger during a check joins it" (AD-12) and passes the *in-flight* check's kind.
- *Story B (reconcile)* emits the reminder only when `trigger === 'activation'` (AD-6).

**Scenarios.**
- (a) At startup, the GitHub auth provider fires `onDidChangeSessions` while it restores sessions. A `session-changed` check starts, activation joins it, and `reconcile` sees `session-changed`, so **no reminder**.
- (b) The activation check fails because the machine is offline at boot or the silent session is not yet available. The next success is `periodic`, so **no reminder** that day, even though requests remain.

FR-9 is violated: "on later startups, one aggregate reminder when requests remain".

**Fix:**
> AD-6″: Activation sets a per-window, in-memory `startupReminderDue = true`. The first *successful* check in that window, whatever its trigger, passes `ctx.startupReminderDue` and then clears it. Joined triggers are passed as a set (`ctx.triggers`), and reminder eligibility tests membership, not a single kind.

---

## H7 — A transient omission from GitHub search ends the cycle, then re-alerts (Medium)

**Units.** *Story A (GitHub adapter)* pages until `hasNextPage` is false and returns `ok`, as AD-9 requires. *Story B (reconcile)* ends the cycle at the first successful check that omits the key, as AD-4 requires.

GitHub search is backed by an index that is eventually consistent. It can omit an item for a short time (index lag after an edit, or partial results when a search times out), and GraphQL does not report this as an error. One such omission deletes the alert history. The next check sees the item again, classifies it **new**, and fires a **second alert for the same outstanding request**, which violates FR-7. AD-9's "never truncates silently" covers pagination, not results that the index itself left out.

**Fix:**
> AD-9′: The adapter compares `search.issueCount` with the number of items collected. If they differ, the check returns `{ ok: false, reason: 'graphql_error' }`.
>
> AD-4′: A key that was tracked and is now absent is confirmed before its cycle ends. Either (a) it is absent in two consecutive successful checks, or (b) preferred: in the same check, a batched `nodes(ids:)` query on the dropped PRs confirms the PR is closed or that its `reviewRequests` no longer include the viewer. This costs one extra GraphQL call, and only when keys have dropped.

---

## H8 — First connection and reminder date diverge (Medium)

AD-6 says "Emitting **it** sets that date". *Story A* reads "it" as the daily `notifyBacklog` only. With that reading, first connection at 09:00 plus any window reload or second window opened at 09:05 (activation) produces a **second aggregate notification on day one**. SM-2 is violated: "one aggregate first-connection alert and no more than one later startup reminder per day".

**Fix:** "Every emitted `notifyBacklog`, including `firstConnection: true`, sets `lastBacklogReminderDate = today`."

---

## H9 — Tracked-item shape: frozen vs. refreshed fields (Medium)

AD-3 defines `RequestItem`. AD-5 says "classification is stored on the tracked item and never recomputed". The spine never defines `TrackedItem`.

- *Story A (reconcile)* stores the `RequestItem` from first observation and adds only `classification`.
- *Story B (view model)* computes "older" (A5: 24 h after the *latest* request) and elapsed time (FR-11) from `item.requestedAt`.

After a re-request (the key stays present, so no new cycle per AD-4), `requestedAt` stays frozen. The row shows the old age, and the mascot shows "older" for a request that was just renewed. A title change or a newly matched requester (the event appears later) is also never shown.

**Fix:**
> `TrackedItem = RequestItem (replaced wholesale from each successful check) & { cycleStartedAt, classification, alertStatus }`. Only the core-owned fields persist across checks. The view model reads only `TrackedItem`.

---

## H10 — Lower-severity pairs

- **Another window's view goes stale.** `globalState` has no change event. Window 2's tree, count, and mascot show items that window 1 already removed until window 2 runs its own check, up to 15 minutes later. The two windows then show different counts, and `queueOpened` in window 2 acts on stale state (this is what enables H5). **Fix:** the shell re-reads state and re-renders on `onDidChangeWindowState(focused)`. The spike should also measure how long `globalState` takes to propagate between windows. AD-8's "read fresh" assumes the extension-host cache is current, and that assumption should be verified, not taken on trust.
- **The key changes on rename or transfer.** AD-4's key is `owner/repo#number`, so renaming or transferring a repository mid-request ends the cycle and starts a new one, which fires a **duplicate alert**. **Fix:** key = PR GraphQL node `id`, which is stable and identical across windows. Keep `owner/repo#number` as a display field.
- **Effects lost on shutdown.** State is persisted before the toast. A reload or shutdown between the write and `showInformationMessage` loses the alert. With H3's `alertStatus`, write `shown` only after the notification call returns, or accept this and document it under A1.

## Suggested additions to the test table (Consistency Conventions → Tests)

- Two results whose fetches overlap, applied in both orders (H1).
- Failure streak longer than 2× the interval, followed by success, with a new item: must alert (H2).
- A sleep gap with a periodic trigger: backlog reminder under the daily cap (H2).
- Account switch A→B→A, with an in-flight stale-generation result (H4).
- `queueOpened` on stale state interleaved with a check (H5, via `store.mutate`).
- First-connection day plus a reload on the same day: only one aggregate notification (H8).
- Re-request that keeps the key: `requestedAt` updates and no alert fires (H9).
