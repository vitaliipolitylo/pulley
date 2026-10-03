# Change Log

All notable changes to Pulley are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/), and versions follow [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-03 (dogfood build, not published)

Dogfood build for technical testing. It is installed from `pulley.vsix` and is not published to the Marketplace.

- Review Queue view listing every pull request where you are directly requested as a reviewer, across all repositories your GitHub sign-in can see, with no folder open.
- Connect and Reconnect through VS Code's GitHub sign-in; scheduled checks and Refresh; recovery from partial and failed checks.
- One notification per new review request, delivered to a focused window; one aggregate backlog notification at first connection and at most one startup reminder per local day.
- Quiet count badge and corgi status row with a word equivalent for each state; `pulley.backlogThreshold` setting.
- Extension ID `vitaliipolitylo.pulley`, MIT license, CI packaging with a package allowlist check.
