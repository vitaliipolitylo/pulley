# Rubric Review: Pulley Architecture Spine (2026-09-30)

- **Reviewed:** `ARCHITECTURE-SPINE.md` (draft, 2026-09-30), with `.memlog.md`, `prd.md`, and a spot check of `EXPERIENCE.md`
- **Checklist:** divergence coverage, enforceable Rules, Deferred safety, current tech, PRD coverage (the account-wide scope change is intentional), operational envelope, bloat
- **Verdict:** The spine is strong and mostly shippable. The functional-core/one-decider design, the normalized contract, request identity, and the failure-is-not-emptiness rules close the main alert-correctness divergences. It still has four gaps that could make independently built stories diverge. First, only checks follow the read-fresh-then-write sequence, so other state writes can undo alert history. Second, the activation event is not fixed. Third, the mascot "new" and "older" rules are only partly specified. Fourth, cross-window visibility of `globalState` is assumed but not verified. The operational envelope also needs a release and identity decision.

---

## 1. Findings

### F1 — HIGH — Only checks follow the read-fresh → transition → write sequence; other state writes can erase another window's alert history

AD-8 says "For each check, the shell re-reads…". AD-2 also allows core transitions for UI events, such as `queueOpened`, and AD-10 allows account-partition switches. The spine does not say how those writes happen. Suppose window A holds a state value that is several minutes old, applies `queueOpened`, and writes it back. That write erases items and alert history that window B recorded in the meantime. At A's next check, B's already-alerted item looks first-observed, AD-5 classifies it as **new**, and the user gets a duplicate alert. This duplicate comes from a systematic lost update, not from the simultaneous-check race that AD-8 accepts. Two stories, one for the scheduler and one for queue-view events, will build different write paths unless the spine forbids it.

**Fix:** Generalize AD-8: "Every durable state change, whether a check, a UI transition, or a partition switch, goes through one shell function `commit(transition)`. It re-reads `pulley.state.v1`, applies a pure core function, awaits the write, and then executes effects. No other code calls `globalState.update`." Add `store.commit` to the seed.

### F2 — HIGH — The activation event is not fixed, yet the scheduling and reminder semantics depend on it

AD-12 and AD-6 depend on an `activation` trigger that means "VS Code started". The spine never says when the extension activates. Since VS Code 1.74, contributed views generate implicit `onView:` activation events. A story that relies on those defaults, or on the UX note "Activation opens Queue view", will ship an extension that does not poll until the user opens the view. That breaks FR-5, FR-8, and the daily reminder in FR-9, and the unit tests will not catch it. Different stories could pick different activation events.

**Fix:** Add this to AD-12 or the conventions: "`activationEvents: ["onStartupFinished"]`. Activation must not depend on the view being opened. Showing the view does not count as an `activation` trigger." Name one smoke test that asserts the extension activates without the view open.

### F3 — MEDIUM — The mascot "new" and "older" states are only partly specified, so core and view stories will derive them differently

- The UX (EXPERIENCE.md, corgi mark) says the new state ends "when the queue opens **or the next check succeeds**, whichever comes first." The spine names only `queueOpened`. `reconcile` is not told to clear it, so one implementer will clear it on the next check and another will not.
- The spine does not say whether "new" is persisted state, and so shared across windows, or per-window state. It also does not say which VS Code signal counts as "queue opened": view visibility, focus, or selecting a row.
- **Older** (A5: 24 hours after the latest direct request) is not defined when `requestedAt` is absent. AD-3 forbids substituting PR age, so the view-model story has to invent a rule.
- FR-10 says backlog copy rotates. Rotation inside the view model needs a deterministic input. AD-1 bans clocks but not `Math.random()`, so the two surfaces (tree view and status count) could show different lines.

**Fix:** Add a mascot row, or make it an AD, that states the following:
- `newSince` is stored in `State`.
- It is cleared by `queueOpened` (the tree view's `onDidChangeVisibility` to visible) or by the next successful `reconcile`.
- An item with no `requestedAt` never counts as older.
- Rotation index = f(today, count).

Extend AD-1 to ban `Math.random()` in core.

### F4 — MEDIUM — The multi-window design rests on the unverified assumption that `globalState` is visible across windows

AD-5 ("written by any window") and AD-8 ("re-reads `pulley.state.v1`") assume that one window's `globalState.update` becomes visible to `globalState.get` in another window before that window's next check. Each extension host keeps an in-memory memento that other windows update asynchronously. The spine and memlog do not record any verification of this, or of how long propagation takes. If propagation lags or does not happen, AD-5 misclassifies items and AD-8 does not prevent duplicate alerts. No story is told to check this.

**Fix:** Add an Open Question, or extend the AD-9 spike: "Verify with two Extension Development Host windows that a `globalState` write in one is read by `get` in the other within N seconds." Record the fallback, which is the deferred notifier lease or a file in `globalStorageUri`.

### F5 — MEDIUM — The operational envelope is incomplete: release, versioning, extension identity, and CI are unresolved

- **Extension identity:** the publisher and extension ID (`<publisher>.pulley`) are not fixed. That ID namespaces `globalState`, so changing it after dogfood silently drops every tester's alert history. This is a real invariant.
- **Release and versioning:** there is no scheme for SemVer, who bumps the version, a CHANGELOG, or pre-release versus stable Marketplace channels. There is also no rule tying a state-format change to `pulley.state.v2` plus a `migrate` step. AD-7 covers reading old state but not when to bump the key.
- **CI:** memlog line 20 marks it `[ASSUMPTION]` because the user did not answer. The spine presents it as decided in the seed and deployment diagram, and has no Open Questions section.
- **Support:** "Output channel" is the only diagnostic path, and no "report an issue" route is stated. Deferring this is acceptable, but it should be written down.

**Fix:** Add a short "Release & Operations" row set:
- a fixed extension ID
- SemVer, with a `package.json` version bump per release
- pre-release channel for dogfood (or `.vsix`-only dogfood), decided either way
- a state-format bump requires a new key suffix and a `migrate` test

Add an **Open Questions** section that lists the CI assumption and F4.

### F6 — LOW — Smaller points about the Rules

- **AD-6:** if the activation-triggered check fails (offline at startup), that day's reminder is lost, because only `activation` checks may emit it. Decide explicitly: either allow the first successful check after activation to emit it, or accept the loss and state that.
- **AD-5 and AD-6:** say "per viewer partition". "User's first successful check ever" and `lastSuccessfulCheckAt` should both be scoped to the partition, so an account switch gets its own first-connection backlog.
- **Frontmatter:** `binds` omits FR-2, but AD-13 and the capability map bind FR-2.
- **Performance:** A7 (50 items, responsive) has no line in the spine. It is not a divergence risk, but the capability map could note "covered by AD-9 pagination and native TreeView".

---

## 2. Checklist Results

| Criterion | Result | Notes |
| --- | --- | --- |
| Fixes the real divergence points, misses none | Partial | AD-1 to AD-14 cover the alert and queue core well. The missing points are the write path for non-check state changes (F1), activation (F2), the mascot state (F3), and the extension ID (F5). |
| Every Rule is enforceable and prevents its divergence | Mostly | AD-1 can be enforced mechanically; an ESLint `no-restricted-imports` rule for `src/core` would make it concrete. AD-8 does not prevent its stated divergence for non-check writes (F1). AD-8 and AD-5 also depend on an unverified platform behavior (F4). |
| Nothing Deferred could let units diverge | Pass, with one exception | The `engines.vscode` "scaffold default" is fine. "Count placement" is safe because it consumes the view model. The notifier lease is safe to defer only after F4 is verified. |
| Named tech is verified-current | Pass (not re-verified here) | Memlog line 27 records verification on 2026-09-30. One risk: TypeScript 7.0 is the native (Go) compiler. Check that the scaffold's ESLint/typescript-eslint and any `tsc`-API tooling support it before pinning. The phrase "keep the scaffold's pin if it is lower" leaves the TypeScript version unfixed, so decide one. |
| Covers PRD capabilities (scope change intentional) | Pass | FR-1 to FR-13 are mapped. FR-2 and FR-3 are handled by the intentional account-wide change (AD-13). The frontmatter omits FR-2 (F6). |
| Operational envelope decided, deferred, or open | Partial | Environments and deployment are covered. CI is an unmarked assumption. Release and versioning, extension identity, and support are missing (F5). |

---

## 3. Bloat and Rationale Leakage (low)

- **AD-8:** "(user decision)" is provenance and belongs in the memlog.
- **AD-9:** "The first integration story is a spike…" is planning or backlog direction, not an invariant. It could move to Open Questions.
- **AD-13:** "The PRD and UX need a matching update" is a Finalize action item. Keep it in the memlog or in a change-proposal note.
- **Deferred bullets:** "a large build cost" and "cannot cause divergence because…" are short rationale. They are acceptable, but they could be trimmed.
- **Structural Seed:** the per-file comments and the three extra mermaid diagrams are seed material. They are clearly labeled as seed, so they are acceptable at this size.

Overall the spine is lean. None of these points blocks it.
