# Pulley

Pulley is a VS Code desktop extension that will show the GitHub pull requests waiting for your review, across every repository your GitHub sign-in can see. It works with no folder open.

## What it does today

- Adds a **Pulley** activity-bar container with a **Review Queue** view.
- Activates on startup and silently checks for an existing GitHub session. It never shows a sign-in prompt by itself.
- With no session, the view explains that GitHub access is needed and that only repositories visible to that sign-in are included, and offers a **Connect** button (`pulley.connect`).
- Connect asks VS Code for a GitHub session with the `repo` scope. Once connected, the view shows "Connected as {account}. Waiting for the first check."
- The account name and id are kept in window memory only. The token is never stored or logged. Diagnostics go to the local "Pulley" output channel.

Fetching review requests is not implemented yet.

## Build and test

Requires Node 24 (see `.nvmrc`).

```sh
npm install
npm run compile     # type-check, lint, bundle to dist/
npm run test:core   # pure core tests under Node, no VS Code
npm test            # core tests, then smoke tests in an Extension Development Host
```

Press F5 in VS Code ("Run Extension") to launch the Extension Development Host.

## Layout

- `src/core/`: pure logic and all user-facing copy, with no `vscode` import
- `src/shell/`: VS Code adapters (auth, queue view)
- `src/extension.ts`: wiring
- `test/core/`, `test/smoke/`: unit tests and Extension Development Host tests
