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

_Filled in during Story 1.3_ (Story 1.2 keeps results in window memory only).

- Does a `globalState.update` in one window become visible to another window's
  `globalState.get` without a reload? How quickly?
- Outcome:

## Limitations and decisions

| # | Limitation | Resolved / Constraint for 1.3 | Notes |
|---|------------|-------------------------------|-------|
|   |            |                               |       |
