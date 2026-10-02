---
title: 'Story 2.6: Publish Pulley with a support path'
type: 'chore'
created: '2026-10-02'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-4-package-and-technically-dogfood-the-calm-mvp.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pulley is not available from the VS Code Marketplace. Users have no documented way to troubleshoot it or report a problem. Nothing automated guards the privacy promises: GitHub GraphQL plus user-opened PRs only, no telemetry, no tokens or PR contents in logs.

**Approach:**
- Make the package Marketplace-ready: release version, icon, metadata, a user-facing README with troubleshooting and a support path, and a CHANGELOG.
- Add automated privacy and state-compatibility guards.
- Document a human-run `vsce publish --azure-credential` release procedure. The agent prepares the release; a human publishes it.

## Boundaries & Constraints

**Always:**
- **Entry gate:** implementation starts only when all of these hold:
  - `docs/dogfood/dogfood-0.1.0.md` records **Go**;
  - `docs/validation/usability-results.md` has every failure triaged and records the release decision **Go** (A12, E7);
  - every `fix before 2.6` issue in that file is closed, and its spec is `done`;
  - CI is confirmed green on GitHub;
  - `package.json` `publisher` is set.

  Otherwise HALT and report what is missing.
- **Release identity (decided, A13):** the release is always `version: "0.1.1"` with `"preview": true`, so the Marketplace shows a Preview badge. Dogfood builds stay `0.1.0` and are never published. The guarantee is that the published file is the exact `.vsix` smoke-tested in release step 2. `name`, `publisher`, and the `pulley.state.v1` key are unchanged. `schemaVersion` stays 1 unless Epic 2 made an incompatible state change; none is planned. If one exists, bump it and add a tested `migrate` step.
- **Marketplace metadata:**
  - `media/icon.png`: 128×128 PNG rendered once from `mockups/corgi.svg`, a static asset with no runtime dependency.
  - `icon`, `categories: ["Other"]`, `keywords` (github, pull request, code review, review requests).
  - `bugs` = `{repository}/issues` and `homepage` = `{repository}#readme` (decided: public GitHub Issues is the support path).
- **README** (the Marketplace page):
  - What Pulley does.
  - Requirements: desktop VS Code ≥ 1.138, a GitHub account with the `repo` scope, and the reason for that scope.
  - Settings: interval and threshold.
  - Privacy: only `https://api.github.com/graphql` plus PRs you open, no telemetry, the token is held by VS Code and never stored or logged, and no PR contents are sent to any AI service.
  - **Troubleshooting:** View → Output → "Pulley", what the log contains and what it never contains, and Refresh/Reconnect.
  - **Support:** open a GitHub issue at `{repository}/issues` with the copied output log, after checking that it has no private repository names you don't want to share.
- **Privacy guard test** `test/core/privacy.test.ts` (static scan of `src/`):
  - The only absolute URL literals are `https://api.github.com/graphql` and the `https://github.com/` open guard.
  - There is no `createTelemetryLogger`, `@vscode/extension-telemetry`, or other analytics import.
  - Every `copy.log.*` function signature takes no `title` or token parameter, and no `log(` call interpolates a token variable.
  - `package.json` dependencies contain no telemetry packages.
- **Privacy runtime guard (A15):** `test/shell/privacy.test.ts`:
  - **Destination:** run checks through `runCheck` with an injected `fetch` that records every request (success, partial-error, and failure responses). Drive the retry case (a 401, then success) through `checkWithRetry`, whose `runCheck` dep calls `runCheck` with the same injected `fetch`. Assert at least one request was made (X12) and every request URL is exactly `https://api.github.com/graphql`.
  - **Log sink:** with a sentinel token as the auth token and a sentinel title in the returned nodes and rows, push them through the error, partial-error, and rejected-URL (`openPullRequest` with a non-`https://github.com/` URL) paths, and through the notifier's shown and failed-submission logs (B11). Assert that neither sentinel appears in any logged line.
- **Release procedure** `docs/release.md`, for a human (A14):
  1. The release commit is Story 2.6's merged commit, which already carries `0.1.1`. Note its SHA and verify CI is green on exactly that SHA.
  2. On a clean checkout of that SHA, run `npm ci && npm run vsix` and smoke-install the `.vsix`. Keep this exact file; rebuilding means repeating the smoke install.
  3. `az login` with an account that belongs to the publisher's Microsoft Entra tenant.
  4. `npx vsce publish --azure-credential --packagePath pulley.vsix`, so the published file is the one tested in step 2.
  5. Tag exactly that SHA as `v0.1.1` (`git tag v0.1.1 <sha>`), push the tag, and attach the `.vsix` to a release.
  6. Install from the Marketplace in clean desktop VS Code and check activation and Connect.

  **Redoing a publish (B10b, X13):** if step 4 fails before the Marketplace accepts `0.1.1`, retry it with the same `.vsix`. If step 4 errors with an unknown outcome, run `npx vsce show vitaliipolitylo.pulley` before retrying, and skip to step 5 if `0.1.1` is listed. If step 5 fails after acceptance, retry step 5 only. Once `0.1.1` is accepted it can't be republished; any fix ships as a new version through a new spec.

  Also add the script `"publish:marketplace": "vsce publish --azure-credential --packagePath pulley.vsix"`.
- **CHANGELOG:** a `0.1.1` entry listing the MVP capabilities, above Story 2.4's `0.1.0` entry, which stays marked as an unpublished dogfood build (B12).

**Never:**
- The agent never runs `vsce publish`, creates a PAT, or stores credentials.
- No PAT-based publishing in CI.
- No telemetry, remote logging, or crash reporting.
- No change to the extension ID or the `pulley.state.v1` key.

</frozen-after-approval>

## Design Notes

**Log-sink exemptions (A15):** `openIgnored` logs the rejected URL by design, because PR URLs are metadata, not contents. Sentinels are not injected into GraphQL error text, so `checkPartialErrors` keeps its diagnostics. The runtime log-sink criterion therefore covers the token and the PR title only through the paths listed under **Privacy runtime guard**.

## Code Map

- `package.json` -- `version`, `preview`, `icon`, `categories`, `keywords`, `bugs`, `homepage`, and `publish:marketplace`. `publisher`, `license`, and `repository` come from Story 2.4.
- `media/icon.png` (new) -- from `_bmad-output/planning-artifacts/ux-designs/ux-Pulley-2026-09-29/mockups/corgi.svg`.
- `README.md`, `CHANGELOG.md` -- per Always. The README already has build sections; move developer setup into `CONTRIBUTING.md` (new) so the Marketplace page stays user-facing.
- `src/core/copy.ts` -- `log` functions (audit them; `openIgnored` logs a URL, which is allowed because PR URLs are metadata, not contents).
- `src/shell/github.ts`, `src/shell/auth.ts` -- the network and token paths the privacy scan must cover.
- `src/core/migrate.ts`, `test/core/migrate.test.ts` -- confirm v1 compatibility of Epic 2 fields; add a test reading an Epic 1-written v1 value.
- `scripts/check-package-files.mjs` (Story 2.4) -- add `media/icon.png` to the allowlist if it is not already covered by `media/**`.

## Tasks & Acceptance

**Execution:**
- [ ] Entry gate check -- read the dogfood and usability records (Go, fix-before-2.6 specs `done`) and the CI status; HALT if any is unmet.
- [ ] `package.json`, `media/icon.png`, `CHANGELOG.md` -- release metadata.
- [ ] `README.md`, `CONTRIBUTING.md` -- user page with privacy, troubleshooting, support; developer setup moved.
- [ ] `test/core/privacy.test.ts`, `test/shell/privacy.test.ts` -- static scan and runtime destination and log-sink guards, per Always.
- [ ] `test/core/migrate.test.ts` -- an Epic 1-shaped v1 value migrates unchanged and is valid for Epic 2 transitions.
- [ ] `docs/release.md` -- the human procedure.

**Acceptance Criteria:**
- Given the release commit, when `npm run vsix` runs, then the `.vsix` version is `0.1.1`, equal to `package.json` `version`, and its ID is `vitaliipolitylo.pulley`.
- Given a human follows `docs/release.md`, when publishing, then they use `--azure-credential` with the `.vsix` smoke-tested in step 2, the Marketplace version matches it, and the `v0.1.1` tag points at the SHA whose CI was verified.
- Given the published extension is installed in clean desktop VS Code, when it activates and connects, then the queue works, and the output channel shows actionable diagnostics with no token or PR title.
- Given `test/core/privacy.test.ts`, when a new hard-coded network URL or a telemetry import is added under `src/`, then the test fails.
- Given `test/shell/privacy.test.ts`, when check code sends a request anywhere but `https://api.github.com/graphql`, or a listed log path writes the token or a PR title (exemptions in Design Notes), then the test fails. The open path only ever opens `https://github.com/` URLs (B11).

## Verification

**Commands:**
- `npm run compile` -- expected: pass.
- `npm test` -- expected: pass, including privacy and migration tests.
- `npm run vsix && node scripts/check-package-files.mjs` -- expected: pass.

**Manual checks:**
- The human publish succeeds, and the Marketplace listing shows the icon, README, version, and preview state as chosen.
- Force a network failure, open Output → Pulley, and confirm the log explains the failure and contains no token or title.

## Implementation Notes

## Spec Change Log

- **2026-10-03, Epic 2 spec review fixes:** finding IDs cited inline (A1–A15 = adversarial findings 1–15, E1–E7 = edge-case findings 1–7) refer to `review-epic-2-specs-2026-10-03.md`, not PRD assumptions such as A8. B- and X-IDs refer to the Review Triage Log of `spec-epic-2-spec-review-fixes.md`. This story resolves A12, A13, A14, A15, E7, B10b, B11, B12, X12, and X13. Sentinels are not injected into GraphQL error text or rejected URLs, so the `checkPartialErrors` and `openIgnored` diagnostics stay as they are. B10 (release code may differ from dogfooded code) is deferred: fix-before-2.6 specs go through their own review.

## Review Triage Log
