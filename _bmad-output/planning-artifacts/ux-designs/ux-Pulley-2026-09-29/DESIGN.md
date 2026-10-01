---
name: Pulley
description: Friendly, restrained corgi reminders in VS Code.
status: final
sources:
  - ../../briefs/brief-Pulley-2026-09-29/brief.md
  - ../../prds/prd-Pulley-2026-09-29/prd.md
updated: 2026-09-30
colors:
  corgi-coat: '#c98143'
  corgi-cream: '#fff8ec'
  corgi-ear: '#e8a198'
  corgi-ink: '#3e302d'
typography: {}
rounded: {}
spacing: {}
components:
  corgi-mark: { note: 'Minimal state mark; artwork remains an assumption.' }
  queue-row: { note: 'Native VS Code list treatment.' }
  queue-count: { note: 'Quiet native count treatment.' }
  notification: { note: 'Native VS Code notification treatment.' }
  state-message: { note: 'Native view text treatment.' }
  refresh-action: { note: 'Native VS Code action treatment.' }
  settings-control: { note: 'Native VS Code Settings treatment.' }
---

## Brand & Style

Pulley feels like a friendly reminder corgi. The user wants minimalistic icons and an uncluttered but informative interface. The corgi gives a gentle state cue; request information remains the focus. The first generic dog sketch did not read as a corgi, so the mark must remain recognizable at its actual display size. **[ASSUMPTION]** A compact corgi mark has variants for new, older, backlog, neutral waiting, and clear states. Exact placement and expression await testing.

## Colors

**[ASSUMPTION]** Inherit the active VS Code theme for surfaces, text, focus, and selection. The four `corgi-*` tokens describe only the illustrative mascot: warm coat, pale blaze, inner ears, and dark features. They are not UI state colors or an approved brand palette. Convey state through words and counts as well as the corgi; test light, dark, and high contrast themes.

## Typography

Inherit VS Code's native font roles and scaling. Pull request title is primary; repository, author, and request age are secondary but legible. No display font or decorative type is specified.

## Layout & Spacing

**[ASSUMPTION]** Use a compact native VS Code view with a vertical queue. Each row prioritizes title, then repository, author, and request age. The exact arrangement depends on native Tree View constraints. Long titles and repository names must expose full text through tooltip or accessible name. A status message must not push useful requests out of the visible area. Inherit native spacing. The [pending queue](mockups/key-pending-backlog.html) and [stale and clear](mockups/key-stale-clear.html) mocks illustrate states at a narrow sidebar width. The [sidebar workbench](mockups/workbench-sidebar.html) and [bottom Panel workbench](mockups/workbench-bottom-panel.html) mocks illustrate the same hierarchy in two VS Code layouts. If a mock conflicts with these documents, follow `DESIGN.md` for appearance and `EXPERIENCE.md` for behavior.

## Elevation & Depth

Inherit native VS Code surfaces and selection. No custom cards, shadows, or layers.

## Shapes

Icons have few details and use a consistent stroke or fill style. They remain legible at actual VS Code icon sizes. The corgi mark needs broad upright ears, a low wide face, a short muzzle, and a clear central blaze; do not reduce it to a generic round dog face. **[ASSUMPTION]** A restrained tan and cream treatment in the mocks makes these features easier to read, while surrounding UI still follows the VS Code theme. Inherit native control shapes.

## Components

| Component | Visual contract |
|---|---|
| Corgi mark | Compact and clearly corgi-shaped at display size; state variants remain subtle. Each has a text equivalent. The [waiting](mockups/corgi.svg) and [resting](mockups/corgi-resting.svg) vectors use `{colors.corgi-coat}`, `{colors.corgi-cream}`, `{colors.corgi-ear}`, and `{colors.corgi-ink}`. Final artwork and location are **[ASSUMPTION]**. |
| Queue row | Native list row with title first; `owner/name`, author, and reliable request age subordinate. No decorative chips or branch metadata. |
| Queue count | Quiet numeric count in a native location; no competing decorative badge. |
| Notification | Native VS Code notification with a clear **Open Pull Request** action. |
| State message | One concise factual line for clear, stale, loading, or connection status. |
| Refresh action | Standard native icon labeled **Refresh**. |
| Settings control | Native VS Code Settings controls. |

## Do's and Don'ts

| Do | Don't |
|---|---|
| Let the corgi signal state without taking over the queue. | Fill the view with art, cards, or long copy. |
| Keep icons minimal and make the corgi recognizable through its silhouette. | Use detailed scenes or a generic dog face as functional icons. |
| Show title, repository, author, and reliable request age clearly. | Present pull request creation age as request age. |
| Respect active VS Code theme. | Hard-code an unapproved palette. |
| Pair visual state with words and count. | Rely on pose or color alone. |
