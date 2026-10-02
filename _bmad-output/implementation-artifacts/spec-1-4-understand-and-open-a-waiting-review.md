---
title: 'Story 1.4: Understand and open a waiting review'
type: 'feature'
created: '2026-09-30'
status: 'done'
baseline_commit: '0e1f98239588ed64ba525351c510c6915c4a298a'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-3-keep-the-queue-accurate-across-checks.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Pulley-2026-09-29/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Queue rows from Story 1.3 show only a title and `owner/name#number · author`. They don't say how long a request has waited, they lose information when truncated, and they can't be opened.

**Approach:** Enrich `viewModel` rows with a request-age string (or "Request time unavailable") and a full `accessibleLabel`. Render them as native `TreeItem`s with a tooltip and accessibility information. Add `pulley.openPullRequest`, which opens the row's GitHub PR in the browser and leaves the stored state untouched.

## Boundaries & Constraints

**Decisions:** Pulley never reveals or focuses its view automatically. Checks run regardless, and the user opens the view from the activity bar. The prototype records whether discoverability suffers.

**Always:**
- The row label is the PR title. The description is `owner/name · author · {age}`, following the pending mock. The tooltip and `accessibilityInformation.label` contain `owner/name#number`, the title, "by {author}", and the age phrase in full.
- The age is formatted only in `viewModel` from `now - requestedAt`:
  - under 1 min → "Requested just now";
  - under 60 min → "Requested {m}m ago";
  - under 24 h → "Requested {h}h ago";
  - under 48 h → "Requested yesterday";
  - otherwise → "Requested {d}d ago".
  - With `requestedAt` absent, it says "Request time unavailable". `firstSeenAt`, PR creation time, and author are never used as substitutes.
- `pulley.openPullRequest(row)` is bound as `TreeItem.command`, so it works with a click and with Enter. It calls `vscode.env.openExternal(Uri.parse(url))` only when the URL starts with `https://github.com/`, and otherwise logs and ignores the call. The command is hidden from the Command Palette (`menus.commandPalette` `when: false`).
- Opening a row changes no stored state, and the row stays until reconcile removes it.
- Rows use the native `$(git-pull-request)` ThemeIcon with no custom colors, so they inherit the theme, focus, and high contrast.

**Never:**
- No webview, detail pane, custom colors, per-row badges, branch metadata, or check/CI status.
- No re-render timer just to age strings. Ages refresh on the next model change or check (Story 1.5).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Known time | `requestedAt` = now − 2 h | description ends "Requested 2h ago" | N/A |
| Unknown time | no `requestedAt` | "Request time unavailable" in the description and the accessible label | N/A |
| Boundaries | 59 s / 59 m / 23 h 59 m / 47 h / 48 h | just now / 59m / 23h / yesterday / 2d | N/A |
| Future time (clock skew) | `requestedAt > now` | "Requested just now" | N/A |
| Open row | Enter on a focused row | Browser opens the PR URL; the row stays | Non-GitHub URL → log only |

</frozen-after-approval>

## Code Map

- `src/core/viewModel.ts` (1.3) -- add `age` and `accessibleLabel` to each row, via a pure `formatRequestAge(now, requestedAt?)`.
- `src/core/copy.ts` -- age phrases and the accessible-label template.
- `src/shell/queueView.ts` -- build `TreeItem`s with `description`, `tooltip` (MarkdownString, text only, no links), `accessibilityInformation`, `iconPath`, `command`, and `id = row.id`, so focus survives re-renders.
- `src/extension.ts` -- register `pulley.openPullRequest`.
- `package.json` -- declare the command and hide it from the palette.

## Tasks & Acceptance

**Execution:**
- [x] `src/core/viewModel.ts`, `src/core/copy.ts` -- age and accessible label.
- [x] `src/shell/queueView.ts`, `src/extension.ts`, `package.json` -- rendering and the open command.
- [x] `test/core/viewModel.test.ts` -- a case for each matrix age row, the unknown-time label, and the full accessible text for a long title/repo.
- [x] `test/smoke/openPullRequest.test.ts` -- stub `env.openExternal`. Executing the command with a row opens the exact URL and leaves `pulley.state.v1` unchanged. A non-GitHub URL is not opened.
- [x] `test/smoke/fixtures/fifty.ts` + a `pulley.debugSeed` command, registered only when `context.extensionMode === Development` -- writes 50 synthetic items through `store.mutate` for the prototype checks.

**Acceptance Criteria:**
- Given 50 pending items, when the view is in a narrow sidebar and then moved to the bottom Panel, then the list scrolls, stays responsive, and every row still shows its repository. A human verifies this, together with light, dark, high-contrast, and 150% zoom.
- Given a row with a truncated title, when it is hovered or focused with a screen reader, then the full repository, title, author, and age phrase are exposed.
- Given the Pulley view has never been opened, when a check completes, then the state is stored and the rows appear the moment the view is opened.

## Verification

**Commands:**
- `npm run compile` -- expected: pass.
- `npm run test:core` -- expected: age and label cases pass.
- `npm test` -- expected: the open-command smoke test passes.

**Manual checks:**
- Run `Pulley: Debug Seed` in the Extension Development Host. Walk through the sidebar and Panel placements, the three themes, zoom, and keyboard-only open. Record the results (including any discoverability concerns) in `docs/spikes/view-prototype.md`.

## Implementation Notes

- `formatRequestAge(now, requestedAt?)` is exported from `viewModel.ts`; it floors minutes, hours, and days, and treats a non-finite `requestedAt` like an absent one. `Row` gains `age`. Copy templates: description `owner/name · author · {age}`, accessible label `owner/name#number, title, by author, {age}`, tooltip the same four facts one per line. The age phrase is the same in all three ("Requested 2h ago").
- `toTreeItem` wraps the tooltip with `MarkdownString().appendText` (escapes Markdown and `$(icon)` syntax, untrusted). `openPullRequest(row, openExternal, log)` lives in `queueView.ts`; `extension.ts` reads `vscode.env.openExternal` per call, so the smoke test stubs it on the shared `vscode.env` object. Ignored URLs are logged single-line and bounded.
- `activate` returns `{ store }` only when `extensionMode === Test` (`PulleyTestApi`), so the smoke test can seed the fifty fixture and compare `store.read()` before and after the command.
- `pulley.debugSeed` (Development only) applies `fiftyResult` as one complete check through `store.mutate(reconcile)` into the active account, so it replaces that account's rows until the next real check; it warns when not connected. A `pulley.development` context key shows it in the palette only in that mode. `extension.ts` imports the fixture from `test/smoke/fixtures/fifty.ts`, so the 50 synthetic items are also bundled into `dist/extension.js` (unreachable outside Development).
- `docs/spikes/view-prototype.md` holds the manual checklist; results are pending a human run.

## Spec Change Log

## Review Triage Log

Review pass 1 (blind-hunter, edge-case-hunter, verification-gap).

| # | Finding | Verdict | Route | Evidence |
|---|---------|---------|-------|----------|
| 1 | The `openExternal` failure path in `openPullRequest` (log `openFailed`, resolve false) is never tested (verification-gap) | low | patch | Pre-verified gap: every smoke stub resolves `true`; `openFailed` appears only in `queueView.ts` and `copy.ts`. |
| 2 | `pulley.debugSeed` handler (Development-only registration, connection guard, seed write, context key) has no test (verification-gap, blind) | low | defer | Pre-verified gap; the smoke host runs in Test mode, so the handler is unreachable without moving its body into a testable `src/shell` function. |
| 3 | Debug Seed message and the spike doc say "the next check replaces them", but an incomplete check never deletes ids (edge) | low | patch | Reconcile rule 6: an incomplete result upserts only; only a complete result deletes absent ids. |
| 4 | Request ages freeze between renders (e.g. "just now" for 15 min) (blind, verification-gap other) | false | reject | Frozen Never: "No re-render timer just to age strings. Ages refresh on the next model change or check (Story 1.5)." Excluded by intent. |
| 5 | `src/extension.ts` imports `test/smoke/fixtures/fifty.ts`, so the synthetic fixture ships in `dist/extension.js` (blind, verification-gap other) | low | reject | Real but unreachable outside Development mode (~2 KB of strings); compile and lint pass. The fix means moving the file away from the spec's task path, which is more than a direct correction. Already noted in Implementation Notes. |
| 6 | Spec `in-review` vs sprint-status `in-progress` mismatch (blind) | false | reject | Workflow-controlled: sprint-status moves to `review` when the story is presented. |
| 7 | Open failures (non-GitHub URL, `openExternal` throws or returns false) show nothing to the user (blind) | low | reject | Frozen Always: a non-GitHub URL "logs and ignores the call". A false return is VS Code's own cancel/deny flow. Showing a toast would add copy and branches. |
| 8 | Debug Seed reports success when the store is read-only, when a same-ms or older `fetchStartedAt` makes rule 4 a no-op, or when a racing in-flight check is discarded; its failure only logs (blind, edge ×3) | low | reject | All real but dev-only and rare (a newer schema in a dev host, same-ms reruns, seeding mid-check); the guards add branches and state. |
| 9 | `formatRequestAge` returns "Requested NaNd ago" for a non-finite `now` (blind) | false | reject | `ctx.now` is always `Date.now()` from `render()` in `extension.ts`; no caller passes a non-finite value. |
| 10 | "Requested yesterday" is elapsed time, not calendar days (blind) | false | reject | Frozen Always defines it as "under 48 h → Requested yesterday". |
| 11 | Smoke test leaves the `smoke-open-account` partition in the test host's state and can flake if a background check writes between reads (blind, edge ×2) | low | reject | `activeAccountId` is reconcile ctx, not persisted. The test host has no GitHub session, so `activate` triggers no check write. A rerun applies a newer complete result over the leftovers. A teardown would add code for a rare case. |
| 12 | No test that `activate` returns `undefined` outside Test mode, or that the `pulley.development` key is set only in Development (blind) | low | reject | Both branches are one-line mode checks; the Development branch is untestable in the smoke host (see #2). |
| 13 | URL check is a string prefix, not a parsed host check, and rejects `www.github.com`/GHE (blind) | false | reject | Frozen Always mandates the `https://github.com/` prefix. Any URL with that prefix has the authority `github.com`, so a look-alike host can't pass (the smoke test covers `github.com.evil.example`). |
| 14 | Manual checklist lacks hostile-title hover, unavailable-time screen reader, and seed-absent checks; header fields empty (blind) | low | reject | The checklist covers the spec's manual checks. Hostile-title escaping is smoke-tested; header fields are filled in during the human run. |
