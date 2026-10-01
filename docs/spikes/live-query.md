# Spike: live GitHub review-request query (Story 1.2)

Record of the first live run of the AD-10 query from an Extension Development Host.
Fill in each section from a real run. When a limitation is found, record it as either
**Resolved** (with how) or **Constraint for Story 1.3** (what removal logic must respect).

- **Date:**
- **VS Code version / OS:**
- **GitHub account type** (personal, org member, enterprise/SSO):
- **Pulley commit:**

## How to run

1. `npm run compile`, then press F5 ("Run Extension") with **no folder open**.
2. In the Extension Development Host, sign in through **Pulley: Connect to GitHub** (or reuse an existing session).
3. Open **Output → Pulley**. Each check logs one summary line:
   `Check finished: pages=N, items=N, errors=N, complete=true|false.`
   Failures log `Check failed: <reason> (<HTTP status or short detail>).`
   Partial results log the GraphQL error messages and `the list may be incomplete`.
   The channel never contains the token, the `Authorization` header, or PR titles.
4. Compare the rows with github.com → Pull requests → **Review requests** (filter
   `is:pr is:open user-review-requested:@me archived:false`).

## Results

| Check | pages | items | errors | complete | Rows match github.com? |
|-------|-------|-------|--------|----------|------------------------|
|       |       |       |        |          |                        |

## Automation requesters (bot actors)

- Are PRs whose review was requested by a bot or GitHub App (for example CODEOWNERS
  auto-requests, Dependabot, Renovate) present?
- What does `actor` contain for those events (`Bot` login, `null`, the PR author)?
- Does `requester` show the bot login as-is (expected per spec Design Notes)?
- Outcome: Resolved / Constraint for Story 1.3:

## SSO / OAuth-restricted organizations

- Are there orgs that enforce SAML SSO or OAuth App access restrictions for this account?
- Does the search return `data` plus `errors` (expected: `complete=false`, error messages logged),
  silently omit those PRs, or return `null` nodes (counted as skipped, `complete=false`)?
- Exact error message(s) seen in the channel:
- Outcome: Resolved / Constraint for Story 1.3 (for example: "a check that hides an SSO org
  is always incomplete, so it never removes that org's items"; or "PRs are silently absent,
  so removal can drop items that are only hidden"):

## Partial errors

- Was any response `data` + `errors`? Which pages, which messages?
- Did a later page fail while page 1 succeeded (`Page N failed ...`)?
- GraphQL rate limiting: does GitHub answer with HTTP 403/429 plus headers (mapped to
  `rate_limited`) or HTTP 200 with `errors[].type = RATE_LIMITED` and no data (currently
  mapped to `graphql_error`)?
- Outcome: Resolved / Constraint for Story 1.3:

## No-folder operation

- With no folder open, did the check run on startup and the rows appear without opening
  the Pulley view first?
- Outcome:

## Cross-window `globalState` propagation

Story 1.3 moved check results into `globalState` under `pulley.state.v1`, written only by
`store.mutate` (`src/shell/store.ts`).

- **Design:** every window renders from a fresh `store.read()` (`globalState.get` → `migrate`)
  on each render, and every `store.mutate` re-reads before applying its transition. Pulley does
  not subscribe to cross-window change events. A second window therefore shows another window's
  rows **after its next render or check** (for example its own check after activation or Connect;
  Story 1.5 adds periodic checks and Refresh).
- **Expected:** VS Code shares `globalState` across windows of the same profile, but each window
  keeps a cached copy that is refreshed from storage asynchronously, so a write from window A may
  not be visible to window B's `get` immediately.
- **Risk to settle in the live run:** `store.mutate` writes the whole value. If window B's cache
  has not seen window A's write when B mutates, B's write can overwrite A's (last writer wins).
  Today both windows check the same account, so the next complete check converges; Epic 2's alert
  history makes this more important.
- **How to observe:** open two Extension Development Host windows (same profile). In window A,
  run **Pulley: Connect to GitHub**. In window B, note when the rows appear without a reload
  (B's next render or check), and whether a check in B ever drops rows that A just added.
- **Observed propagation (pending the human live run):**
- **Outcome:** Constraint for Story 1.5: a second window sees new rows only after its next render
  or check. Lost-write risk to be confirmed or resolved by the live run.

## Limitations and decisions

| # | Limitation | Resolved / Constraint for 1.3 | Notes |
|---|------------|-------------------------------|-------|
| 1 | Partial GraphQL errors (`data` + `errors`), a failed later page, unreadable (`null`) search nodes, or a paging stop | Constraint, implemented | The adapter reports `complete: false`; `reconcile` (rule 6) never deletes on an incomplete success, and a complete result that started before (or at the same time as) the newest applied incomplete result deletes nothing. |
| 2 | SSO/OAuth-restricted orgs may make every check incomplete | Constraint, implemented | Items are added and kept but never removed until a complete check; any applied newer success clears `lastFailure`, so the view is not stuck on stale. Rows from incomplete checks only show the "may be incomplete" hint. |
| 3 | SSO-hidden PRs silently absent (no error, no `null` node) | Open: needs the live run | If GitHub omits them with no signal, a complete check would delete them. Record here if observed. |
| 4 | Cross-window propagation is not immediate | Constraint for 1.5 | See the section above. |
