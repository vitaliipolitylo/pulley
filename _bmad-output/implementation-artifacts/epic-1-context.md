# Epic 1 Context: See and Act on a Trustworthy Review Queue

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Deliver a usable Pulley VS Code desktop extension in which a developer connects their GitHub account, sees the direct review requests waiting for them in every repository that account can see, opens the correct PR from a native queue, and can trust what the queue says: loading, pending, stale, unavailable, and confirmed clear. This epic establishes the extension scaffold, pure functional core, account-partitioned durable state, auth, GitHub query, scheduler, and native Tree View. It must work with no folder open and without Epic 2, which adds notifications, backlog reminders, mascot states, and the quiet count.

## Stories

- Story 1.1: Set Up Initial Project from Starter Template (connect to GitHub)
- Story 1.2: Find Direct Review Requests Across GitHub
- Story 1.3: Keep the Queue Accurate Across Checks
- Story 1.4: Understand and Open a Waiting Review
- Story 1.5: Refresh and Schedule Queue Checks
- Story 1.6: Recover from Missing or Uncertain GitHub Data

## Requirements & Constraints

- The scope is account-wide. Show direct requests from every repository visible to the signed-in account, whatever folders are open (including none). There is no repository chooser, and Pulley reads no Git remotes.
- Include only open PRs with an outstanding **direct** request for the signed-in user. Exclude team-only requests. Remove a request once a review is submitted, the request is withdrawn, or the PR closes, but only after a complete successful check confirms it.
- Check on activation, on Refresh, and on a configurable interval (default 15 minutes). Show the last successful check time.
- A failed check never counts as confirmed clear. Keep the last known rows, mark them stale, and offer the right action: Connect, Reconnect, or Refresh.
- Rows show title first, then full `owner/name`, author, and the time since the latest direct request when it is reliably known. Otherwise they say "Request time unavailable". Never substitute PR age or author.
- Opening a row opens the correct GitHub PR, and the row stays until a later complete successful check confirms the request ended.
- Clear-state and connection copy say that only repositories visible to the current GitHub sign-in are included.
- The queue must stay readable and responsive with 50 pending requests.
- Privacy: network calls go only to `https://api.github.com/graphql` and to PR URLs the user opens. There is no telemetry, no PR contents go to any AI service, and tokens are never logged or persisted. Diagnostics go only to the local "Pulley" output channel.

## Technical Decisions

- **Stack:** generator-code 1.12 scaffold (TypeScript 6.0.x with esbuild 0.28.x), `engines.vscode` taken from the scaffold (`^1.138.0`), Node 24 LTS tooling, and `@vscode/test-cli`/`@vscode/test-electron` for tests. GitHub is called through the built-in `fetch` with no client library.
- **Layout:** `src/core/` is pure and imports only core. `src/shell/` holds `github.ts`, `auth.ts`, `store.ts`, `scheduler.ts`, `queueView.ts`, and later `notifier.ts` and `statusCount.ts`. `src/extension.ts` contains only wiring. Tests are split into `test/core/` (unit, no VS Code) and `test/smoke/`.
- **Pure core:** core code has no `vscode` import, I/O, clock reads, `Math.random`, or timers, and it never mutates its inputs. `now` (epoch ms), `today` (local `YYYY-MM-DD`, computed in the shell), settings, and window context are passed in as arguments.
- **Transitions:** every durable change has the form `(stored, input, ctx) -> { stored, effects[] }`. The transitions are `reconcile`, `queueViewed`, and `windowFocused`. The shell never edits state fields or decides whether to notify.
- **Single write path, `store.mutate`:** serialize calls within the window, re-read `pulley.state.v1`, migrate, apply the transition, await the write, then run effects and re-render. It is the only caller of `globalState.update`. If the stored `schemaVersion` is newer than the code understands, Pulley enters read-only "Update Pulley" mode with no writes and no effects.
- **Stored state:** one `globalState` JSON value, `{ schemaVersion, accounts: { [session.account.id]: Account } }`. Every product field sits in its account's partition. `Account` holds `firstCheckDone`, `lastAttemptAt`, `lastAttemptIntervalMs`, `lastSuccessAt`, `lastAppliedFetchStartedAt`, `lastFailure {at, reason}`, `items: { [prNodeId]: Tracked }`, and the alert and backlog fields Epic 2 will use. Window memory (active account, session generation, in-flight check, `startupReminderDue`) and settings are never persisted.
- **Check result contract:** success is `{ ok: true, accountId, fetchStartedAt, complete, items: RequestItem[] }` and failure is `{ ok: false, accountId?, fetchStartedAt, reason }`. A `RequestItem` is `{ id, repo, number, title, author, url, requester?, requestedAt? }`. `complete` is true only when every page was fetched with no GraphQL errors.
- **`reconcile` guards:**
  - Ignore results for any account other than the active one.
  - Treat a success whose `fetchStartedAt` is at or before `lastAppliedFetchStartedAt` as a no-op.
  - An incomplete result may add or update items but never removes them.
  - The first complete result that omits a PR node ID deletes that item and its history; a later reappearance starts a new cycle.
  - Every attempt, successful or failed, sets `lastAttemptAt` and `lastAttemptIntervalMs`.
  - A failure changes only the attempt fields and `lastFailure`.
- **GitHub query:** a paginated GraphQL `search(type: ISSUE, query: "is:pr is:open user-review-requested:@me archived:false", first: 50)` that pages until `hasNextPage` is false. For each PR it reads `timelineItems(itemTypes: [REVIEW_REQUESTED_EVENT], last: 10)`. `requester` and `requestedAt` come from the newest event whose `requestedReviewer` is the viewer, and are omitted when none matches. A response with both data and errors counts as incomplete and is logged.
- **Live-query spike:** the first live run must record how the query handles automation requesters, SSO/OAuth-restricted organizations, partial errors, no-folder operation, and cross-window `globalState` propagation.
- **Auth:** use only `vscode.authentication.getSession('github', ['repo'])`.
  - Call it with `silent: true` on activation. Use `createIfNone` only from explicit Connect or Reconnect.
  - Get the token per check and never persist it.
  - On a 401, retry a silent lookup once before reporting `unauthenticated`.
  - On `onDidChangeSessions`, update the active account, increment the session generation, and trigger a check. Discard results from an older generation.
- **Failures:** `reason` is one of `signed_out` (Connect), `unauthenticated` (Reconnect), or `network`, `rate_limited`, `graphql_error` (Refresh). Adapters never throw; unexpected exceptions become `graphql_error` and are logged.
- **View model:** `viewModel(stored, window, {now, today, threshold, checking})` returns `status` (`loading|unconnected(reason)|pending|clear|stale|readOnly`), `count` (null until the first success), `countStale`, `lastSuccessAt`, `message`, and `rows`. Each row has title, repo, author, url, an age string or unavailable text, and an `accessibleLabel`. Status is `stale` when `lastFailure.at > lastSuccessAt`. Age strings are formatted only here, and the shell re-renders only when the model changes.
- **Copy:** all user-facing strings live in `src/core/copy.ts`.
- **Scheduling:**
  - Activate on `onStartupFinished`; opening the view is not a trigger.
  - Triggers are `activation`, `periodic`, `manual`, and `session-changed`.
  - At most one check is in flight per window, and later triggers join it.
  - Non-manual triggers get a random 0–60 s jitter, applied in the shell.
- **Settings:** both are `application`-scoped.
  - `pulley.checkIntervalMinutes`: default 15, range 5–240. A change restarts the timer.
  - `pulley.backlogThreshold`: default 5, minimum 1. A change only re-renders.
- **Conventions:** all names use the `pulley.` prefix (`pulley.queue`, `pulley.connect`, `pulley.refresh`, `pulley.openPullRequest`). Core types are PascalCase (`Stored`, `Account`, `Tracked`, `RequestItem`, `CheckResult`, `Effect`, `ViewModel`). Timestamps are stored as epoch milliseconds, and PRs are displayed as `owner/name#number`.
- **Tests:** table-driven core tests with one case per reconcile rule, a migration test for each stored version, and smoke tests for activation without the view open and for `store.mutate` ordering.

## UX & Interaction Patterns

- Use one native Tree View for the queue. It must work in a sidebar or when the user moves it to the bottom Panel, with no custom placement setting, webview, detail pane, cards, chips, or branch metadata. Moving the view must not change behavior.
- Inherit the active VS Code theme's colors, focus, selection, fonts, and spacing. Test light, dark, high-contrast, and zoomed UI.
- State copy is factual and short:
  - Cold load: "Checking review requests…", with no zero shown.
  - Stale: "Couldn't check GitHub. Showing the last known requests from {time}.", with Refresh.
  - Clear: "No reviews are waiting in repositories visible to this GitHub sign-in."
  - Unconnected: explains the missing or expired authorization and offers Connect or Reconnect.
- Truncated rows expose their full text through a tooltip or accessible name. Rows open by mouse or keyboard with visible native focus. Refresh, Connect, and Reconnect have descriptive names, and repeated Refresh does not start duplicate operations.
- Failures announce stale or unavailable data rather than an empty list. Background polls must not repeatedly announce an unchanged state to screen readers.
- A prototype must validate the assumption that activation opens the Queue view, and checks must still run when the view has never been opened.

## Cross-Story Dependencies

- Story 1.1 (scaffold, auth, connection state) comes before everything else. Story 1.2's adapter and live-query spike come before Story 1.3's reconcile removal logic. Story 1.3's `store.mutate`, state schema, and `viewModel` underpin Stories 1.4–1.6. Story 1.5's scheduler supplies the triggers used by Story 1.6's session-change and recovery flows.
- Epic 2 builds on this epic's core, stored state, and `store.mutate`. Keep the `Tracked.alert`, `origin`, `newSignal`, `backlogAlert`, and attempt-gap fields in the schema so Epic 2 can add alert, backlog, mascot, and count behavior without a schema break. Do not implement notification behavior here.
