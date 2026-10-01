# Pulley PRD addendum: feasibility notes

These notes support later UX and architecture work. The PRD states the product behavior; these are implementation options and evidence, not commitments.

## VS Code surfaces

VS Code extensions can contribute a Tree View, view container, status bar item, and notifications. Its guidance recommends Tree Views for data lists and notifications used sparingly. A native queue with a concise status bar count is worth prototyping before considering a webview. The corgi's visibility and accessibility need a prototype rather than a fixed placement in the PRD.

- [Extending the workbench](https://code.visualstudio.com/api/extension-capabilities/extending-workbench)
- [Views guidance](https://code.visualstudio.com/api/ux-guidelines/views)
- [Status bar guidance](https://code.visualstudio.com/api/ux-guidelines/status-bar)
- [Notifications guidance](https://code.visualstudio.com/api/ux-guidelines/notifications)

## GitHub identity and request data

VS Code exposes a GitHub authentication provider through its extension API. GitHub distinguishes direct user review requests from team review requests. The REST requested-reviewers endpoint returns current requested users and teams, but not the time a request was made. GitHub's timeline events contain review-request timestamps and actors, so exact waiting time and requester copy would require additional matching and pagination. If matching is unreliable or too costly, the PRD requires copy that says the request time is unavailable and identifies the pull request author instead of the requester.

- [VS Code API: authentication](https://code.visualstudio.com/api/references/vscode-api)
- [GitHub issue and pull request search filters](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/filtering-and-searching-issues-and-pull-requests)
- [Requested reviewers REST API](https://docs.github.com/en/rest/pulls/review-requests)
- [Timeline REST API](https://docs.github.com/en/rest/issues/timeline)
- [GitHub issue event types](https://docs.github.com/en/rest/using-the-rest-api/issue-event-types)

## Polling and positioning

GitHub recommends webhooks where practical and conditional authenticated requests when polling. Pulley only runs inside VS Code, so the brief's 15-minute polling assumption needs dogfood validation and economical API use. The existing GitHub Pull Requests VS Code extension already supports broader pull request management; Pulley's proposed difference is a calm, mascot-led reminder loop.

- [GitHub REST API best practices](https://docs.github.com/en/enterprise-cloud@latest/rest/using-the-rest-api/best-practices-for-using-the-rest-api)
- [GitHub Pull Requests extension](https://marketplace.visualstudio.com/items?itemName=GitHub.vscode-pull-request-github)
