# Pulley

Pulley is a VS Code desktop extension that shows the GitHub pull requests waiting for your review, across every repository your GitHub sign-in can see. It works with no folder open.

## What it does today

- Adds a **Pulley** activity-bar container with a **Review Queue** view.
- Activates on startup and silently checks for an existing GitHub session. It never shows a sign-in prompt by itself. With no session, the view offers a **Connect** button; when the sign-in expires or is revoked, it offers **Reconnect** and keeps the last-known rows marked as stale.
- Lists every pull request where you are directly requested as a reviewer, with its `owner/name#number`, title, and who requested it (or the PR author, when the requester can't be confirmed). Selecting a row opens the pull request on GitHub.
- Checks GitHub on a schedule (`pulley.checkIntervalMinutes`, default 15) and on **Refresh**. Requests that were reviewed or withdrawn disappear after the next complete check. When some results can't be read, the view says the queue may be incomplete instead of dropping rows.
- Shows one native notification for each new review request, with an **Open Pull Request** action. Notifications wait until a VS Code window is focused, and the same request never alerts twice across reloads, restarts, or windows.
- Summarizes a backlog in one aggregate notification at first connection, and at most one startup reminder per local day while requests remain.
- Shows a quiet count on the view and a corgi status row (new, older, backlog, waiting, clear, unknown) with a word equivalent for every state. `pulley.backlogThreshold` (default 5) only changes what is shown.
- Network calls go only to `https://api.github.com/graphql` and to pull request URLs you open. There is no telemetry. The token is never stored or logged. Diagnostics go to the local "Pulley" output channel.

## Install a dogfood build

Dogfood builds are version `0.1.0` and are not published to the Marketplace. Download `pulley.vsix` from a CI run's artifacts (or build it with `npm run vsix`), then install it. A CI artifact downloads as a zip (`pulley-vsix-<commit SHA>.zip`); unzip it first to get `pulley.vsix`. VS Code 1.138 or later is required.

```sh
code --install-extension pulley.vsix
```

To uninstall:

```sh
code --uninstall-extension vitaliipolitylo.pulley
```

You can also uninstall from the Extensions view (search for "Pulley", then **Uninstall**).

## Build and test

Requires Node 24 (see `.nvmrc`).

```sh
npm install
npm run compile     # type-check, lint, bundle to dist/
npm run test:core   # pure core and shell tests under Node, no VS Code
npm test            # core tests, then smoke tests in an Extension Development Host
npm run vsix        # production bundle, packaged as pulley.vsix
node scripts/check-package-files.mjs   # package allowlist and token scan
```

Press F5 in VS Code ("Run Extension") to launch the Extension Development Host.

CI (`.github/workflows/ci.yml`) runs every test tier, packages the extension, checks the package, and uploads `pulley.vsix` as an artifact.

## Layout

- `src/core/`: pure logic and all user-facing copy, with no `vscode` import
- `src/shell/`: VS Code adapters (auth, GitHub, store, scheduler, notifier, queue view, count)
- `src/extension.ts`: wiring
- `test/core/`, `test/shell/`, `test/smoke/`: unit tests and Extension Development Host tests
- `docs/dogfood/`: dogfood checklists for installed builds

## License

MIT. See [LICENSE](LICENSE).
