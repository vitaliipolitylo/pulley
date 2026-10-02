---
title: 'Story 2.4: Package and technically dogfood the calm MVP'
type: 'chore'
created: '2026-10-02'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-3-read-queue-state-at-a-glance.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pulley runs only in the Extension Development Host. There is no `.vsix`, no fixed extension identity (`package.json` has no `publisher`), no CI, and no record that the queue and alerts behave correctly in normal VS Code use.

**Approach:**
- Fix the publisher ID, version, and license in `package.json`.
- Add `@vscode/vsce` packaging with a file allowlist check.
- Add a GitHub Actions workflow that runs every test tier and packages the extension.
- Add a dogfood checklist that a human fills in from an installed build, ending in a go/no-go decision.

## Boundaries & Constraints

**Always:**
- **Identity (decided):** `package.json` gets:
  - `publisher: "vitaliipolitylo"`;
  - `version: "0.1.0"`;
  - `license: "MIT"`, plus a root `LICENSE` file (MIT, copyright 2026 Vitalii Politylo);
  - `repository` = the public GitHub repository the human creates. The human supplies the URL at implementation, and that task blocks until then.

  The extension ID `vitaliipolitylo.pulley` is final from this story on, because `globalState` is keyed by it.
- **CI host (decided):** GitHub Actions on that public repository. CI counts as confirmed after the first green run there.
- **Packaging:**
  - `@vscode/vsce` is pinned at `4.0.0` as a devDependency.
  - Script `"vsix": "vsce package --out pulley.vsix"`; `vscode:prepublish` already runs the production bundle.
  - `*.vsix` is added to `.gitignore`.
- **Package allowlist:** `scripts/check-package-files.mjs` runs `vsce ls` and fails if any packaged path falls outside this allowlist: `package.json`, `README.md`, `CHANGELOG.md`, `LICENSE*`, `dist/extension.js`, `media/**`. That keeps out `src`, `test`, `_bmad*`, `.env*`, source maps, and token-like files. It also fails if `dist/extension.js` contains `ghp_`, `gho_`, `github_pat_`, or `Bearer ` followed by a literal token.
- **CI** (`.github/workflows/ci.yml`):
  - Runs on `push` and `pull_request` on `ubuntu-latest`, with Node from `.nvmrc` (24).
  - Steps: `npm ci` → `npm run compile` → `xvfb-run -a npm test`. That runs the core rule tests, the shell tests, the migration tests, and the host smoke tests: activation without the view, `store.mutate` write-before-effect, and notification delivery from Story 2.1.
  - Then `npm run vsix` → `node scripts/check-package-files.mjs`, and upload `pulley.vsix` as an artifact.
  - The workflow has no secrets and no publish step.
- **Install path:** README "Install a dogfood build" covers `code --install-extension pulley.vsix` and uninstall.
- **Dogfood builds are `0.1.0` and are never published (A13).** The release version is set by Story 2.6.
- **Dogfood checklist:** `docs/dogfood/dogfood-0.1.0.md` is a checklist for a human run of the installed `.vsix`, with no folder open and requests across at least 2 repositories. Its header records the commit SHA the `.vsix` was built from. Each scenario row has **Prerequisites**, **Trigger**, **Expected**, **Result** (Pass / Fail / N/A), and **Notes** columns (A10):

  | Scenario | Prerequisites | Trigger | Expected |
  |---|---|---|---|
  | Current requests, correct repository names | Waiting requests in 2+ repositories | Connect, then open the queue | Every waiting request listed with its `owner/name#number` |
  | Resolved and withdrawn requests disappear | Two waiting requests | Submit a review on one, withdraw the other; Refresh | Both rows gone after the complete check |
  | One notification for a new request | Window focused, baseline done; a second GitHub account (any account with access to the repository) | Request a review from the second account; wait one interval plus 60 s jitter plus the check time | Exactly one notification naming the PR |
  | First-connection aggregate; none on same-day restart | Fresh profile (`code --profile <new>` or `--user-data-dir <empty dir>`) with waiting requests | Connect; then restart VS Code the same day | One aggregate notification on connect; none after the restart |
  | Partial GraphQL error | A SAML-SSO organization where the VS Code token isn't SSO-authorized, with a request there | Refresh. If the tester has no such organization, mark **N/A** with that reason; unit tests cover it | Other requests shown; the view says the queue may be incomplete |
  | Re-request without an alert | An already-shown request | Re-request the same reviewer from the second account; Refresh | Row updated; no notification |
  | Missing requester (author label) | A request whose timeline has no event naming you as reviewer with a known actor (for example, the requester's account was deleted) | Refresh; read the notification and row. If none is available, mark **N/A** with the reason; unit tests cover it | Author label shown, no requester |
  | Revoked sign-in (Reconnect) | Connected | Revoke the VS Code OAuth app on github.com (Settings → Applications → Authorized OAuth Apps), then Refresh. Warning: this also signs out other VS Code GitHub features; re-authorize them through Reconnect afterwards (B6) | Stale rows with a Reconnect action; Reconnect restores the queue |
  | Two windows | Two windows, no folder; only one focused when the request lands | A new request; then Refresh in one window | One alert in total; the other window updates. A duplicate across two windows focused within the `globalState` sync window is the accepted race (Story 2.1, E1): note it, not a Fail |
  | 50 pending items | Development Host on the same commit SHA as the `.vsix` | Run Debug Seed; record the row as run in the Development Host on that SHA | Queue stays responsive while scrolling and opening rows |

- **Decision rule (B7):** the checklist ends with a **Go / No-go** decision and a list of blocking issues. Go requires every row to be Pass, N/A with a recorded reason, or a Fail triaged as non-blocking with a recorded reason. A Development Host row on the recorded SHA counts like any other row. Any other Fail is No-go until it is fixed and re-run.

**Never:**
- No Marketplace publish (Story 2.6).
- No secrets in the repository or the workflow.
- No change to the extension `name` (`pulley`).
- No product behavior changes; bugs found while dogfooding become new specs or deferred-work entries.

</frozen-after-approval>

## Code Map

- `package.json` -- `publisher`, `version`, `license`, `repository`, the `vsix` script, the `@vscode/vsce` devDependency. `engines.vscode` stays `^1.138.0`.
- `.vscodeignore` -- already excludes `src`, `test`, `_bmad*`, maps, and `docs`. Verify against the allowlist and add `scripts/**` and `mockups/**` if needed.
- `esbuild.js` -- the production bundle into `dist/extension.js`. Note that `src/extension.ts` imports `test/smoke/fixtures/fifty.ts`, which is bundled and acceptable (synthetic data, Development-mode-only command).
- `.vscode-test.mjs` -- the smoke runner that CI uses.
- `scripts/check-package-files.mjs` (new), `.github/workflows/ci.yml` (new), `docs/dogfood/dogfood-0.1.0.md` (new).
- `README.md` -- it still says "Fetching review requests is not implemented yet". Update the "What it does today" list and add the install section.
- `CHANGELOG.md` -- a `0.1.0` entry marked "dogfood build, not published" (B12); Story 2.6 adds `0.1.1` above it.

## Tasks & Acceptance

**Execution:**
- [ ] `package.json`, `package-lock.json`, `.gitignore`, `.vscodeignore`, `LICENSE` -- identity, packaging, ignores, MIT license. Exclude `.github/**` and `scripts/**` from the package.
- [ ] `scripts/check-package-files.mjs` -- the allowlist and token scan.
- [ ] `.github/workflows/ci.yml` -- per Always.
- [ ] `README.md`, `CHANGELOG.md` -- current behavior, install path, 0.1.0 entry.
- [ ] `docs/dogfood/dogfood-0.1.0.md` -- build SHA field, scenario table with prerequisites and triggers, decision rule and section.
- [ ] `test/core/connection.test.ts` -- assert that `publisher` is `vitaliipolitylo`, `version` is SemVer, and `name` is `pulley`.

**Acceptance Criteria:**
- Given a clean checkout, when `npm ci && npm run vsix && node scripts/check-package-files.mjs` runs, then `pulley.vsix` is produced with version 0.1.0 and ID `vitaliipolitylo.pulley`, and the check passes.
- Given a push to the repository, when CI runs, then every test tier and the package check pass, and the `.vsix` is uploaded as an artifact.
- Given the installed `.vsix` in normal VS Code with no folder open, when a human completes `docs/dogfood/dogfood-0.1.0.md`, then every scenario has a result (N/A only with a reason), the build SHA is recorded, and a Go/No-go decision is recorded per the decision rule.

## Verification

**Commands:**
- `npm run compile` -- expected: pass.
- `npm test` -- expected: pass.
- `npm run vsix && node scripts/check-package-files.mjs` -- expected: `.vsix` produced; check passes.

**Manual checks:**
- The first CI run on GitHub is green, and the artifact downloads and installs.
- `docs/dogfood/dogfood-0.1.0.md` is completed by the human tester.

## Implementation Notes

## Spec Change Log

- **2026-10-03, Epic 2 spec review fixes:** finding IDs cited inline (A1–A15 = adversarial findings 1–15, E1–E7 = edge-case findings 1–7) refer to `review-epic-2-specs-2026-10-03.md`, not PRD assumptions such as A8. B- and X-IDs refer to the Review Triage Log of `spec-epic-2-spec-review-fixes.md`. This story resolves A10, B6, B7, and B12, and records that dogfood builds stay `0.1.0` (A13).

## Review Triage Log
