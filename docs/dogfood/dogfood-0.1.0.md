# Pulley 0.1.0 dogfood checklist

A human run of the installed `.vsix` in normal VS Code. This build is `0.1.0` and is never published.

## Build and run

| Field | Value |
|---|---|
| Build commit SHA (the `.vsix` was built from) | _fill in: full SHA_ |
| `.vsix` source | _fill in: CI run URL and artifact, or local `npm run vsix`_ |
| Extension ID and version | `vitaliipolitylo.pulley` 0.1.0 (confirm in the Extensions view) |
| VS Code version | _fill in_ |
| Check interval (`pulley.checkIntervalMinutes`) used | _fill in: minutes_ |
| OS | _fill in_ |
| Tester | _fill in_ |
| Date | _fill in_ |
| Repositories used (2 or more) | _fill in: `owner/name`, `owner/name`, ..._ |
| Second GitHub account | _fill in: account handle, or "none"_ |

## How to run

- Install with `code --install-extension pulley.vsix` (see the README section "Install a dogfood build").
- Run every scenario in normal VS Code with **no folder open**, unless the row says otherwise.
- Use requests across **at least 2 repositories**.
- Open the "Pulley" output channel to see when checks run. It never contains tokens or PR contents.
- Fill in **Result** with Pass, Fail, or N/A. N/A needs a reason in **Notes**. A Fail needs a description in **Notes** and a triage entry under "Blocking issues" or "Non-blocking Fails".
- A Fail that can't be fixed in this story becomes a new spec or a deferred-work entry. No product behavior changes are made while dogfooding.

## Scenarios

| # | Scenario | Prerequisites | Trigger | Expected | Result | Notes |
|---|---|---|---|---|---|---|
| 1 | Current requests, correct repository names | Waiting requests in 2+ repositories | Connect, then open the queue | Every waiting request listed with its `owner/name#number` | | |
| 2 | Resolved and withdrawn requests disappear | Two waiting requests | Submit a review on one, withdraw the other; Refresh | Both rows gone after the complete check | | |
| 3 | One notification for a new request | Window focused, baseline done; a second GitHub account (any account with access to the repository) | Request a review from the second account; wait one interval plus 60 s jitter plus the check time | Exactly one notification naming the PR | | |
| 4 | First-connection aggregate; none on same-day restart | Fresh profile (`code --profile <new>` or `--user-data-dir <empty dir>`) with waiting requests | Connect; then restart VS Code the same day | One aggregate notification on connect; none after the restart | | |
| 5 | Partial GraphQL error | A SAML-SSO organization where the VS Code token isn't SSO-authorized, with a request there | Refresh. If the tester has no such organization, mark **N/A** with that reason; unit tests cover it | Other requests shown; the view says the queue may be incomplete | | |
| 6 | Re-request without an alert | An already-shown request | Re-request the same reviewer from the second account; Refresh | Row updated; no notification | | |
| 7 | Missing requester (author label) | A request whose timeline has no event naming you as reviewer with a known actor (for example, the requester's account was deleted) | Refresh; read the notification and row. If none is available, mark **N/A** with the reason; unit tests cover it | Author label shown, no requester | | |
| 8 | Revoked sign-in (Reconnect) | Connected | Revoke the VS Code OAuth app on github.com (Settings → Applications → Authorized OAuth Apps), then Refresh. Warning: this also signs out other VS Code GitHub features; re-authorize them through Reconnect afterwards | Stale rows with a Reconnect action; Reconnect restores the queue | | |
| 9 | Two windows | Two windows, no folder; only one focused when the request lands | A new request; then Refresh in one window | One alert in total; the other window updates. A duplicate across two windows focused within the `globalState` sync window is the accepted race (Story 2.1): note it, not a Fail | | |
| 10 | 50 pending items | Development Host on the same commit SHA as the `.vsix` | Run **Pulley: Debug Seed**; record the row as run in the Development Host on that SHA | Queue stays responsive while scrolling and opening rows | | |

Row 10 runs in the Extension Development Host (F5) checked out at the build commit SHA above, because Debug Seed is available only in Development mode. Record the SHA you ran it on in **Notes**.

While running, also note whether the count, repository names, corgi state, and recovery actions are understandable without extra alerts.

## Decision

**Decision rule:** Go requires every row to be:

- **Pass**, or
- **N/A** with a recorded reason, or
- **Fail** triaged as non-blocking, with a recorded reason.

A Development Host row on the recorded SHA counts like any other row. Any other Fail is **No-go** until it is fixed and the row is re-run on a new build (record the new SHA).

| Field | Value |
|---|---|
| Decision (Go / No-go) | _fill in_ |
| Decided by | _fill in_ |
| Date | _fill in_ |

### Blocking issues

_List each blocking Fail: scenario #, what happened, and the follow-up spec or deferred-work entry. Write "None" if there are none._

### Non-blocking Fails

_List each Fail triaged as non-blocking: scenario #, what happened, and why it doesn't block. Write "None" if there are none._
