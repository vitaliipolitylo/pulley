---
title: 'Story 1.4: Understand and open a waiting review'
type: 'feature'
created: '2026-09-30'
status: 'ready-for-dev'
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
- [ ] `src/core/viewModel.ts`, `src/core/copy.ts` -- age and accessible label.
- [ ] `src/shell/queueView.ts`, `src/extension.ts`, `package.json` -- rendering and the open command.
- [ ] `test/core/viewModel.test.ts` -- a case for each matrix age row, the unknown-time label, and the full accessible text for a long title/repo.
- [ ] `test/smoke/openPullRequest.test.ts` -- stub `env.openExternal`. Executing the command with a row opens the exact URL and leaves `pulley.state.v1` unchanged. A non-GitHub URL is not opened.
- [ ] `test/smoke/fixtures/fifty.ts` + a `pulley.debugSeed` command, registered only when `context.extensionMode === Development` -- writes 50 synthetic items through `store.mutate` for the prototype checks.

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

## Spec Change Log

## Review Triage Log
