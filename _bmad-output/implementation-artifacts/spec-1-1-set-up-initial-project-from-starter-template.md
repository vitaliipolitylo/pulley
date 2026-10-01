---
title: 'Story 1.1: Set up initial project from starter template (connect to GitHub)'
type: 'feature'
created: '2026-09-30'
status: 'done'
baseline_commit: 'NO_VCS'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** There is no Pulley code yet. A developer cannot install anything that explains which GitHub account Pulley will use, or sign in to it.

**Approach:** Scaffold the extension with generator-code 1.12 (TypeScript + esbuild, npm) and reshape it into the architecture's `src/core/`, `src/shell/`, `src/extension.ts`, `test/core/`, and `test/smoke/` layout. Contribute a native `pulley.queue` Tree View and a `pulley.connect` command. The view shows a plain-language connection state. On an explicit Connect it requests a GitHub `repo` session through VS Code authentication and shows "connected, awaiting first check" for the session account.

## Boundaries & Constraints

**Decisions:** The extension lives at the project root `D:\projects\Pulley`. `_bmad*`, `.claude`, `.agents`, `.opencode`, and `.uv-cache` are excluded from the package through `.vscodeignore` (and `.uv-cache` through `.gitignore`). Git is initialized during scaffolding with a `.gitignore` for `node_modules`, build output, and `.uv-cache`. Nothing is committed or pushed unless the user asks.

**Always:**
- Activate on `onStartupFinished`; work with no folder open. Opening the view must not be the trigger.
- Use `vscode.authentication.getSession('github', ['repo'], …)` only: `{ silent: true }` on activation and on `onDidChangeSessions` (github provider), `{ createIfNone: true }` only from `pulley.connect`.
- Keep the account (`id`, `label`) in window memory only. Never persist, log, or display the token.
- All user-facing strings live in `src/core/copy.ts`. Unconnected and cancelled/failed copy says the queue covers only repositories visible to the GitHub sign-in.
- `src/core/` is pure: no `vscode` import, I/O, clock, randomness, or timers. It uses erasable-only TypeScript so Node 24 can run core tests directly.
- Diagnostics (no token or PR data) go only to a "Pulley" output channel.

**Never:**
- No GitHub API calls, `globalState` writes, `store.mutate`, scheduler, reconcile, rows, count, badge, notifications, `pulley.refresh`, or settings. These belong to Stories 1.2–1.6 and Epic 2.
- No webview, telemetry, GitHub client library, or automatic sign-in prompt.
- Never show a count or a "no reviews" / zero state in this story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fresh start | No GitHub session, no folder | Welcome content: explains that GitHub access is needed and that only repos visible to the sign-in are included, with a **Connect** button. No sign-in dialog. | N/A |
| Existing session | Silent lookup returns a session | "Connected as {label}. Waiting for the first check." No Connect button. | N/A |
| Connect succeeds | User runs `pulley.connect` | VS Code GitHub consent (`repo`); then the connected state for the session account. | N/A |
| Connect cancelled / fails | `getSession` rejects | State stays unconnected, and the Connect button still works. | Catch the error, log only a short reason to the output channel, show no error modal. |
| Session removed elsewhere | `onDidChangeSessions` (github), silent lookup returns undefined | Back to the unconnected state. | N/A |

</frozen-after-approval>

## Code Map

Greenfield: the project has no source code. Constraints come from `epic-1-context.md` (Stack, Layout, Auth, Conventions, Tests).
- `package.json` -- manifest. `engines.vscode` comes from the scaffold (expected `^1.138.0`); `activationEvents: ["onStartupFinished"]`; contributes the `pulley` activity-bar container, the `pulley.queue` view, `viewsWelcome` gated on the `pulley.connection` context key, and the `pulley.connect` command.
- `media/pulley.svg` -- monochrome (`currentColor`) corgi silhouette for the activity bar, derived from `_bmad-output/planning-artifacts/ux-designs/ux-Pulley-2026-09-29/mockups/corgi.svg` (broad upright ears, low wide face).
- `src/core/copy.ts`, `src/core/connection.ts` -- pure strings, plus `ConnectionState = {kind:'unknown'} | {kind:'unconnected'} | {kind:'connected', accountId, label}` and `connectionMessage(state)`.
- `src/shell/auth.ts` -- silent lookup, connect, session-change listener; returns `ConnectionState`; never throws.
- `src/shell/queueView.ts` -- empty `TreeDataProvider`; sets `TreeView.message` and the `pulley.connection` context key from `ConnectionState`.
- `src/extension.ts` -- wiring only.

## Tasks & Acceptance

**Execution:**
- [x] scaffold -- run `npx --yes --package yo --package generator-code@1.12 -- yo code` non-interactively (TypeScript, esbuild, npm, id `pulley`, display name `Pulley`) without git into a temporary folder, move the output to the project root without overwriting existing files, then run `git init` at the root -- the starter the story requires.
- [x] `package.json`, `.nvmrc`, `.vscodeignore`, `.gitignore` -- add the contributions above, Node 24 tooling (`.nvmrc` = `24`, `@types/node` 24.x), a `test:core` script (`node --test test/core/`), and keep the scaffold's `compile`/`watch`/`package`/`lint`/`test` scripts -- manifest and tooling.
- [x] `src/core/copy.ts`, `src/core/connection.ts` -- pure state and copy -- the single source for strings.
- [x] `src/shell/auth.ts`, `src/shell/queueView.ts`, `src/extension.ts` -- implement per Code Map; remove the scaffold's hello-world command -- the behavior in the matrix.
- [x] `test/core/connection.test.ts` -- table test of `connectionMessage` for each state; asserts the visibility note on unconnected and that no copy contains a zero count -- covers the core matrix rows.
- [x] `test/smoke/activation.test.ts`, `.vscode-test.mjs` -- move the scaffold test here; assert that the extension activates with no folder and without the view opened, and that `pulley.connect` is registered -- the activation guarantee.
- [x] `media/pulley.svg` -- the icon.

**Acceptance Criteria:**
- Given a fresh install with no GitHub session, when VS Code starts, then Pulley is active, the Pulley view shows the unconnected explanation with **Connect**, and no sign-in dialog appears.
- Given the unconnected state, when the user clicks **Connect** and approves, then the view shows the connected state naming the session account, and the token is not in `globalState` or the output channel.
- Given the Connect dialog is cancelled, when control returns, then the unconnected state and its **Connect** action remain.
- Given the repository, when it is inspected, then `src/core/`, `src/shell/`, `src/extension.ts`, `test/core/`, and `test/smoke/` exist, and `src/core/` has no `vscode` import.

## Design Notes

The unconnected state uses `viewsWelcome` (`when: pulley.connection == unconnected`) because native welcome content renders a real button and a readable paragraph in both the sidebar and the Panel. The connected state uses `TreeView.message` over an empty tree, which Story 1.2 will fill. While the first silent lookup runs, the state is `unknown`, and the view shows only "Checking GitHub connection…". This avoids a flash of the Connect button.

## Verification

**Commands:**
- `npm run compile` -- expected: type-check, lint, and esbuild succeed.
- `npm run test:core` -- expected: all core tests pass without VS Code.
- `npm test` -- expected: smoke tests pass in the Extension Development Host.

**Manual checks:**
- Launch the Extension Development Host with no folder open. Confirm the Pulley activity-bar icon, the unconnected copy and Connect button, and that cancelling Connect keeps the state.

## Implementation Notes

- Scaffold: `yo code pulley --extensionType=ts --extensionId=pulley --extensionDisplayName=Pulley --pkgManager=npm --bundler=esbuild --gitInit=false --quick` in a temp folder. generator-code still created a `.git`; it was deleted before moving files, then `git init` ran at the root. Nothing was overwritten (no name collisions). `engines.vscode` is `^1.138.0`, TypeScript ^6.0.3, esbuild ^0.28.1, and `@types/node` 24.x come from the scaffold.
- `test:core` is `node --test "test/core/**/*.test.ts"`. The literal `node --test test/core/` fails on Node 24.21, which resolves a directory argument as a module. Node prints a harmless "Reparsing as ES module" warning because package.json has no `"type"`.
- tsconfig: `rootDir: "."`, `include: ["src","test"]`, `erasableSyntaxOnly`, and `rewriteRelativeImportExtensions`, so core and its tests use `.ts` import specifiers that Node runs directly. The smoke tests compile to `out/test/smoke`, and `.vscode-test.mjs` points there. `lint` now covers `src test`.
- viewsWelcome and the view, container, and command titles must live in package.json. They mirror `copy.ts` (`unconnectedWelcome`), and a core test fails on drift.
- `connectionPresentation(state)` in core decides the context key and `TreeView.message` (undefined while unconnected, so the native welcome and its Connect button show). The extension uses a ticket counter so an older lookup cannot overwrite a newer one.
- No `publisher` field was added, because the spec names none. The smoke test finds the extension by `packageJSON.name`.
- Matrix audit: `src/shell/auth.ts` takes an optional injected `getSession` (default: `vscode.authentication.getSession`), and `test/smoke/auth.test.ts` covers every matrix row at the shell level: the silent/createIfNone options, the connected account with no token, cancel/fail → unconnected with a logged reason, and session removal → unconnected.

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Evidence | Route |
|---|--------|---------|---------|----------|-------|
| 1 | verification-gap | `onGitHubSessionsChanged` filter and its subscription are untested | medium | Pre-verified: no test refers to it, so removing the subscription or wiring it to `connect` passes. | patch |
| 2 | verification-gap, blind | `QueueView.render` (context key and message) is untested | medium | Pre-verified: dropping `setContext` hides the Connect welcome and every test still passes. | patch |
| 3 | verification-gap, blind | Ticket guard in `activate` is untested | low | Pre-verified: it is an inline closure that no test reaches; Story 1.5 plans generation tests. | defer |
| 4 | verification-gap, blind | `npm test` does not run the core tests | low | `pretest` runs only compile-tests/compile/lint, so the copy-drift check is skipped. A one-line script fix. | patch |
| 5 | blind | The "no vscode import" guard checks a hardcoded file list | low | `['copy.ts','connection.ts']`; a new core file in Story 1.2 escapes it. Fix is `readdirSync`. | patch |
| 6 | blind | README and quickstart are stale scaffold boilerplate | low | README.md is the template text and the quickstart mentions Hello World; `vsce` rejects a template README. | patch |
| 7 | edge-case | esbuild problem matcher crashes on a null `location` | low | esbuild.js:19 dereferences `location` without a check; esbuild messages may have `location: null`. | patch |
| 8 | blind, edge-case | `apply` / `render` rejections are unhandled | low | Lookups never throw, and `setContext` rejection is not demonstrated; the fix adds guards for undemonstrated state. | reject |
| 9 | blind | Overlapping Connect prompts | maybe-false | Depends on whether VS Code dedupes concurrent `createIfNone` requests; if real it would be low. | reject |
| 10 | blind | `repo` scope is too broad | false | The frozen intent requires a GitHub `repo` session. | reject |
| 11 | blind | No `publisher`, `engines.node`, or `type` | low | Matters only for packaging (Story 2.4); F5 and the tests work. The publisher value is not in the intent. | reject |
| 12 | blind | Connect still shows in the palette when connected; no disconnect | low | `createIfNone` with an existing session returns it at once, which is harmless. Disconnect is not in the intent. | reject |
| 13 | blind | `shortReason` is not really token-free | maybe-false | Would need a provider error message that contains a token; none is known. If real it would be low. | reject |
| 14 | blind | The initial `unknown` render can land after a lookup | false | It runs synchronously before any lookup is awaited, and its `setContext` is queued first. | reject |
| 15 | blind | Mixed indentation in tasks.json; no smoke-test launch config | low | Cosmetic scaffold content. | reject |
| 16 | edge-case | Lookup resolves after dispose | maybe-false | Needs evidence that a disposed TreeView throws on `message`; if real it would be low. | reject |
| 17 | edge-case | An empty account label shows "Connected as ." | false | A GitHub session label is the login, which is never empty. | reject |
| 18 | edge-case | A transient silent-lookup error shows unconnected | low | Clicking Connect returns the existing session at once; the fix adds error-classification branches. | reject |
