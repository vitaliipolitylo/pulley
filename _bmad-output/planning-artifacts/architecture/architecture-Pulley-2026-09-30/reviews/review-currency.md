---
review: currency
target: ../ARCHITECTURE-SPINE.md
date: 2026-09-30
method: npm registry queries (npm view, npm pack generator-code@1.12.0), GitHub public GraphQL schema (schema.docs.graphql), vscode.d.ts and extension source on microsoft/vscode main, official docs and changelogs
verdict: PASS WITH FIXES
---

# Currency review: Pulley architecture spine

**Verdict: PASS WITH FIXES.** The memlog `(version)` entry shows the Stack table was checked on 2026-09-30, and nearly every version and API claim holds up against live sources. One stack decision is internally inconsistent with the scaffold it leans on (TypeScript 7 vs. typescript-eslint). One operational assumption goes stale in two months: the Marketplace PAT. The remaining items are small version drift or clarifications.

## Findings

| # | Severity | Finding | Fix |
|---|---|---|---|
| F1 | **High** | **TypeScript 7.0.x breaks the scaffold's lint toolchain.** generator-code 1.12.0 pins `typescript ^6.0.3`, `typescript-eslint ^8.61.1` and `eslint ^10.5.0`, and its template runs `eslint src`. The latest typescript-eslint (8.71.0, 2026-09-28) declares peer `typescript >=4.8.4 <6.1.0`. TS 7.0 "does not ship with an API"; Microsoft expects a new API in 7.1. The typescript-eslint request to support TS 7 was closed as not planned. If `typescript@7` is installed, npm fails with ERESOLVE or linting breaks. The spine's parenthetical "keep the scaffold's pin if it is lower" technically resolves this to 6.0.x, but the table's headline value is 7.0.x, and an agent will read it as the target. esbuild does not care: it strips types itself, so the bundle is unaffected either way. | Change the Stack row to **TypeScript 6.0.x (scaffold pin `^6.0.3`)**. Optionally add: "TS 7 only side by side via `@typescript/native: npm:typescript@^7.0.2` for `tsc --noEmit`, with `typescript` aliased to `@typescript/typescript6`. Revisit when TS 7.1 ships an API and typescript-eslint supports it." |
| F2 | **Medium** | **"Marketplace publisher PAT" is being retired.** Azure DevOps retires global PATs on **2026-12-01**. The VS Code publishing docs now recommend Microsoft Entra ID (`vsce publish --azure-credential`, workload identity federation). vsce 4.0.0 (2026-09-14) added "prompted migration of legacy PAT credentials", and the 4.0.1-1 prerelease (2026-09-29) adjusts the OIDC token exchange. The Environments paragraph and the deployment diagram assume a PAT, but a post-MVP Marketplace publish will almost certainly land after that date. | Replace "Marketplace publisher PAT" with "Marketplace publish identity: Microsoft Entra ID (`vsce publish --azure-credential`); no long-lived PAT". Keep publishing manual, as the spine already decides. |
| F3 | Low | **@vscode/test-electron is 3.1.0 (2026-07-24), not 3.0.0.** The scaffold's `^3.0.0` resolves to 3.1.0, so this does no harm, but the table is stale. vsce 4.0.0, test-cli 0.0.15 and test-electron 3.x all require **Node >= 22**. | Write `^3.1` (or "scaffold pin `^3.0.0`"). Add "Node >= 22 required by vsce 4/test-cli" next to the Node row. |
| F4 | Low | **Node 24 leaves Active LTS in three weeks.** The official schedule puts v24 in Maintenance from **2026-10-20** (end of life 2028-04-30) and v26 in LTS from **2026-10-28**. "24 LTS" is correct today and still safe for an MVP, but calling it "active LTS" (memlog) goes stale this month. The scaffold pins `@types/node 24.x`, which matches. | Keep 24 and label it "24 LTS (maintenance from 2026-10-20; EOL 2028-04)", or move CI to 26 after 2026-10-28 while keeping `@types/node 24.x`. The extension runs on VS Code's bundled Electron Node, so this setting affects only tooling and CI. |
| F5 | Low | **Auth and storage behaviour: verified, with caveats the spine should state.** (a) `getSession` options: `silent` cannot be combined with `createIfNone` (vscode.d.ts). AD-10 already uses them in separate calls, which is correct. (b) The built-in `github` provider accepts arbitrary scope lists, including `repo`, and matches sessions by the sorted scope set. The provider is under heavy churn right now: Microsoft-brokered sessions, token expiry in ms (`expiresAfter`), and enterprise lifecycle split (commits 2026-09-09 to 2026-09-28). Tokens can expire mid-life. (c) `globalState` is **per profile**, not per machine. Other windows *do* see updates without reload: ExtHostMemento updates its cached value on `onDidChangeStorage` (fix for vscode#55834, Oct 2018). That update is asynchronous, so the AD-8 "read fresh" reads a cache that may lag slightly. | Add to AD-10: "On HTTP 401, retry once with a fresh `getSession(... { silent: true })` before mapping to `unauthenticated`." Add to AD-7 or AD-8: "Shared across windows *of the same profile*; cross-window propagation is asynchronous; the lag widens the accepted AD-8 race only slightly." Note in Deferred that `engines.vscode` from the scaffold will be `^1.138.0`, because it comes from the latest `@types/vscode`, which is 1.138.0 while VS Code stable is 1.139. |

## Verified claims (no action)

| Claim in spine | Status | Evidence |
|---|---|---|
| VS Code stable 1.139 | Confirmed: 1.139.1, 2026-09-23; 1.140 is Insiders | code.visualstudio.com/updates |
| generator-code 1.12.0, TS + esbuild template | Confirmed latest (published 2026-06-23). Template pins: TS ^6.0.3, esbuild ^0.28.1, test-cli ^0.0.15, test-electron ^3.0.0, eslint ^10.5.0, typescript-eslint ^8.61.1, @types/node 24.x; `engines.vscode` taken from the latest @types/vscode | `npm pack generator-code@1.12.0`, `generators/app/dependencyVersions/package.json`, `env.js` |
| esbuild 0.28.x | Confirmed 0.28.2 (2026-08-08), Node >= 18 | npm registry |
| @vscode/vsce 4.0.0 | Confirmed latest stable (2026-09-14); 4.0.1-1 prerelease 2026-09-29 | npm registry, vscode-vsce releases |
| @vscode/test-cli 0.0.15 | Confirmed latest | npm registry |
| TypeScript 7.0.2 stable | Confirmed (GA 2026-07-08; `latest` dist-tag 7.0.2). Exports only `./unstable/*`, no classic API | npm registry, TS 7.0 announcement |
| `search(type: ISSUE, query: "is:pr is:open user-review-requested:@me archived:false")` | Valid. `search(query: String!, type: SearchType!)`; `ISSUE` is not deprecated (siblings `ISSUE_ADVANCED`, `ISSUE_HYBRID`, `ISSUE_SEMANTIC`). Docs say `user-review-requested:@me` matches PRs "you have directly been asked to review" and `archived:false` restricts to unarchived repositories. Advanced search replaced ISSUE behaviour on 2025-09-04, and space-separated qualifiers remain implicit AND, so this query is unaffected. Improved (semantic) search, GA 2026-04-02, is opt-in; lexical is the default. Caveats: 1,000-result cap per search; users with access to PRs in >10,000 repositories must scope by org/user/repo. Neither matters for a personal review queue. | GraphQL public schema; docs "Searching issues and pull requests"; GitHub changelogs 2025-03-06, 2026-04-02 |
| `ReviewRequestedEvent { actor, createdAt, requestedReviewer }` | Confirmed: `actor: Actor` (nullable), `createdAt: DateTime!`, `requestedReviewer: RequestedReviewer` (nullable) where `union RequestedReviewer = Bot \| EnterpriseTeam \| Mannequin \| Team \| User`. Match the viewer through `... on User { id }`. This resolves the memlog's open question about the field shape; the spike is still worth running for real-data behaviour. | schema.docs.graphql (lines ~59852, ~59233) |
| `timelineItems(itemTypes: [REVIEW_REQUESTED_EVENT], last: 10)` | Confirmed: `REVIEW_REQUESTED_EVENT` is a member of `PullRequestTimelineItemsItemType`; `timelineItems` accepts `itemTypes`, `last` | schema.docs.graphql (~47474, ~47818) |
| No pending GraphQL breaking changes on search/timeline/ReviewRequestedEvent | Confirmed. The only nearby change is `ReviewRequest.requestedBy` → `requestedByActor` (2026-04-01), a field Pulley does not use | docs "Breaking changes" |
| Built-in `github` auth, scope `repo`, `silent` / `createIfNone`, `onDidChangeSessions` | Confirmed (see F5 caveats) | vscode.d.ts `AuthenticationGetSessionOptions`; extensions/github-authentication/src/github.ts |
| `globalState` shared across windows | Confirmed for windows of the same profile (see F5) | vscode#55834; extHostMemento.ts; vscode#270356 (per-profile) |
| GraphQL via built-in `fetch` | Fine: VS Code's extension host runs Node >= 22, which has global fetch | — |

## Sources

- npm registry (queried 2026-09-30): generator-code, esbuild, typescript, typescript-eslint (peerDependencies), @vscode/test-cli, @vscode/test-electron, @vscode/vsce, @types/vscode, @typescript/native-preview
- generator-code 1.12.0 tarball: `generators/app/dependencyVersions/package.json`, `generators/app/env.js`, `templates/ext-command-ts/package.json`
- https://code.visualstudio.com/updates (1.139.1, 2026-09-23)
- https://raw.githubusercontent.com/nodejs/Release/main/schedule.json ; https://nodejs.org/en/about/previous-releases
- https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
- https://github.com/typescript-eslint/typescript-eslint/issues/10940
- https://docs.github.com/public/fpt/schema.docs.graphql (GitHub public GraphQL schema)
- https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests
- https://docs.github.com/en/graphql/overview/breaking-changes
- https://github.blog/changelog/2025-03-06-github-issues-projects-api-support-for-issues-advanced-search-and-more/
- https://github.blog/changelog/2026-04-02-improved-search-for-github-issues-is-now-generally-available/
- https://raw.githubusercontent.com/microsoft/vscode/main/src/vscode-dts/vscode.d.ts
- https://raw.githubusercontent.com/microsoft/vscode/main/src/vs/workbench/api/common/extHostMemento.ts
- https://raw.githubusercontent.com/microsoft/vscode/main/extensions/github-authentication/src/github.ts (and recent commit history)
- https://github.com/microsoft/vscode/issues/55834 ; https://github.com/microsoft/vscode/issues/270356
- https://code.visualstudio.com/api/working-with-extensions/publishing-extension (PAT retirement 2026-12-01, `--azure-credential`)
- https://github.com/microsoft/vscode-vsce/releases (4.0.0, 4.0.1-0, 4.0.1-1)
