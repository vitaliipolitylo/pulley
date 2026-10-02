# Spike: queue view prototype (Story 1.4)

Record of the manual view checks from an Extension Development Host. Fill in each
section from a real run. Pulley never reveals or focuses its view on its own: open it
from the activity bar. Note any discoverability concern that causes.

- **Date:**
- **VS Code version / OS:**
- **Pulley commit:**

## How to run

1. `npm run compile`, then press F5 ("Run Extension"). The window runs in Development
   mode, which is the only mode where **Pulley: Debug Seed** exists.
2. Connect through **Pulley: Connect to GitHub**. The seed writes into the active account.
3. Run **Pulley: Debug Seed**. It writes 50 synthetic requests (`test/smoke/fixtures/fifty.ts`)
   through `store.mutate(reconcile)` as one complete check, so they replace this account's
   rows until the next complete real check removes them (an incomplete check keeps them). Ages cover every phrase, including
   "Request time unavailable", and some titles, repositories, and logins are long.
4. Open the Pulley view from the activity bar.

## Checks

| Check | Result (pass / fail + notes) |
|-------|------------------------------|
| Narrow sidebar: 50 rows scroll, stay responsive, every row still shows its repository | |
| Moved to the bottom Panel: same, rows readable in a wide, shallow area | |
| Light theme | |
| Dark theme | |
| High-contrast theme (focus outline visible, icon inherits colors) | |
| 150% zoom (`window.zoomLevel` ≈ 2.2 or View → Appearance → Zoom In) | |
| Hover a truncated row: tooltip shows `owner/name#number`, title, "by {author}", and age in full | |
| Screen reader (NVDA / VoiceOver) on a truncated row reads repository, title, author, and age | |
| Keyboard only: Tab/arrow to a row, Enter opens the PR in the browser; the row stays | |
| Mouse click opens the PR; the row stays | |
| `Pulley: Open Pull Request` does not appear in the Command Palette | |
| View never opened: after a check completes, rows appear the moment the view is opened | |

## Discoverability

Pulley does not reveal or focus the view after checks. Record whether finding the queue
from the activity bar felt like a problem, and whether Epic 2's quiet count should help.

-
