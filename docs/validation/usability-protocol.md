# Pulley usability test protocol

A moderated usability test of the installed Pulley `0.1.0` dogfood build. A human facilitator runs it with 3–5 developers and records every session in [`usability-results.md`](usability-results.md). The results decide whether Pulley can be published.

You do not need to read any planning documents to run this protocol. Everything you need to set up, time, and score a session is on this page.

## What the test answers

1. Can a developer find and open a pull request waiting for their review within **2 minutes** of being asked, with no hint?
2. Does a developer notice a new review request through Pulley's single notification, and is anything about Pulley **intrusive or nagging**?
3. Are the count, the repository names, the corgi state, and the recovery actions understandable without extra alerts, in both the sidebar and the bottom Panel?

The pass bar comes from success measure SM-3 with assumption A8 in the PRD (`_bmad-output/planning-artifacts/prds/prd-Pulley-2026-09-29/prd.md`), restated as NFR-4 in `_bmad-output/planning-artifacts/epics.md`. The scoring rule is in [Scoring](#scoring) below.

## Rules that apply to every session

- **No telemetry.** Time everything by hand with a stopwatch or a clock that shows seconds. Do not add logging, analytics, or code changes to measure anything.
- **No product changes during the test.** Every problem goes into the results file and is triaged there. Fixes become new specs.
- **Privacy:**
  - Store participants only as **P1–P5**. Never write a name, GitHub handle, email, employer, or anything else that identifies a participant in the repository.
  - Do not record the participant's own repository names or PR titles in the results file. Describe them generically ("a PR in their second repository").
  - Do not screen-record PR contents without the participant's explicit consent. If you record at all, keep the recording outside the repository.
  - Quotes are verbatim but must not contain identifying details. Replace them with `[…]`.

## Participants

- **3 to 5 developers** who use VS Code and receive GitHub review requests in their work.
- **No Pulley contributors**, and nobody who has seen Pulley's planning documents or a Pulley demo.
- Assign IDs in session order: P1, P2, P3, and so on.
- **Fix the planned number of sessions (3, 4, or 5) before session 1** and record it in the results header. Do not add sessions after seeing results, except to replace a session that is not counted.
- If a session can't be completed for a reason unrelated to Pulley (the participant has to leave, the machine breaks), do not count it. Log the reason in the results file's failure and assumption-change log, noting the uncounted first attempt, and recruit a replacement. The replacement **reuses the uncounted session's ID and placement** (for example, a new P2 in Panel placement). A session that stops because Pulley itself failed **does** count, and that participant does not pass.

## Placement

Alternate placement by participant number:

| Participant | Placement |
|---|---|
| P1, P3, P5 | Sidebar (Pulley's default activity-bar container) |
| P2, P4 | Bottom Panel |

This is as close to half as the session count allows: 3 sessions give 1 Panel session, 4 give 2, and 5 give 2. With 3 or 5 sessions, Panel evidence is thinner than sidebar evidence; record that in the results file's assumption-change log.

To move the view to the Panel: drag the **Review Queue** view title onto the Panel, or right-click the view title and choose **Move View** → **Panel**. Do this during setup, before Task 1. To reset afterwards, use **View: Reset View Locations** from the Command Palette.

## What you need

- The `pulley.vsix` from Story 2.4. Use the build whose commit SHA is recorded in [`../dogfood/dogfood-0.1.0.md`](../dogfood/dogfood-0.1.0.md), and record the same SHA in the results header.
- VS Code 1.138 or later on the participant's machine (or a prepared machine).
- **A GitHub account for the participant**, one of:
  - the participant's own account, **if** you (the facilitator) can request their review on a pull request during Task 2 (you have write access to a repository they can see); or
  - a **prepared test account** that you set up in advance.
- Either way, the account must have **at least 2 waiting review requests across 2 different repositories** before the session starts.
- **A second GitHub account for the facilitator** that can request a review from the participant's account in Task 2, and a **fresh pull request** to request it on. The participant must not currently be a requested reviewer on that PR, so the request is genuinely new.
- A stopwatch or a clock with seconds, and the [session sheet](#session-sheet) below.

## Consent

Before setup, ask the participant to agree to the following, and tick the consent box on the session sheet:

- taking part in the session and the interview;
- if they use their own GitHub account, signing in to it in VS Code for the session;
- having verbatim, anonymized quotes (identifying details replaced with `[…]`) kept in the repository.

Screen recording needs its own, separate consent (see Privacy above). If the participant declines any of the three points above, do not run the session.

## Setup (before the participant starts the tasks)

Do setup **before the participant sits down**, so they do not see the Pulley view before Task 1. If they use their own account and must sign in themselves, let them complete only the sign-in in step 5, then take over again, and log the exposure as a deviation in the results file's failure and assumption-change log.

Do these in order.

1. **Install the build.** Run `code --install-extension pulley.vsix`. If you use a dedicated VS Code profile, install into it with `code --profile pulley-test --install-extension pulley.vsix`. A profile does not isolate `pulley.checkIntervalMinutes`: that setting is application-wide and shared across profiles, so it must always be restored by hand.
2. **Open VS Code with no folder open.** Close any open folder or workspace (**File → Close Folder**).
3. **Set the check interval before Pulley connects.** In Settings, set `pulley.checkIntervalMinutes` to **5**. Note the previous value so you can restore it afterwards. This must happen before step 5.
4. **Turn off anything that hides notifications.** Note whether VS Code's notification **Do Not Disturb** mode is on (bell icon in the status bar), then make sure it is off.
5. **Connect.** Open the Pulley view and press **Connect**. Sign in with the account chosen above.
6. **Wait for the first check and any first-connection notification.** On first connection Pulley may show one aggregate notification such as "3 reviews are waiting." Let it appear and dismiss it. This keeps it out of Task 2. If you reconnected an account that had used Pulley earlier the same day, no notification may appear; that is expected.
7. **Confirm the queue shows the waiting requests** from at least 2 repositories.
8. **Set the placement** for this participant (see [Placement](#placement)).
9. **Do not open Output before or during the tasks.** In Panel placement, Output shares the Panel with the Review Queue, so opening it could give the view away or change it. Open **Output → Pulley** only after the Task 2 delivery deadline has passed with no notification, to record the cause.
10. Collapse or hide the Pulley view so it is not already in front of the participant. In Sidebar placement, switch the sidebar to the Explorer. In Panel placement, switch the Panel to the Terminal tab.

Tell the participant: "This tests the software, not you. Please think aloud. I can't help during the tasks, but I'll answer questions afterwards."

## Task 1: find and open a waiting review

**Prompt (read it exactly):** "Find a pull request that is waiting for your review and open it."

- **Start timing** when you finish reading the prompt.
- **Stop timing** when the pull request opens in the browser or in any in-editor pull request view (from a Pulley row or any other route the participant chooses).
- Record the **route**: a Pulley row, or another route (say which, for example github.com notifications). Log a non-Pulley route in the results file's failure log for triage, because the success measure is finding the review from Pulley.
- **Success** = 2:00 or less **and** no facilitator hint. Any hint, including pointing at the screen, makes Task 1 a failure, whatever the time.
- If 2:00 passes, Task 1 is a failure. You may let the participant continue up to 5:00 to learn what they were looking for, then end the task.
- Record the time (`m:ss`), success (yes/no), and what the participant tried first.

The opened pull request stays in the queue. That is expected and does not affect Task 2.

## Task 2: notice a new request while coding

Give the participant something ordinary to do in VS Code for up to 15 minutes, for example "Please write a small function in a new untitled file, as you normally would." Do not mention notifications or Pulley.

### Timing

| Mark | What happens |
|---|---|
| **T0** | Run **Pulley: Refresh review requests** from the Command Palette (not the button in the Pulley view, so the view stays hidden) and wait until the check finishes (the progress indicator ends). Task 2 starts now. |
| **TR** | Between T0 + 0:30 and T0 + 1:00, request the participant's review on the fresh pull request from your second account. Record TR. Not earlier: the next check fires by T0 + 6:00 (5-minute interval plus up to 60 s jitter), so waiting 30 s leaves at least 30 s for that check to run before TR + 6:00. |
| Next check | The next ordinary check runs within about 6 minutes of the request (5-minute interval plus at most 60 s of jitter, plus the check time). |
| **TN** | The moment the notification appears. Record it, or "none". |
| End | 5 minutes after TN, and never later than **T0 + 15:00**. When TN is none, the end is the delivery deadline (see below). |

### Focus

Pulley shows notifications only in a focused VS Code window. A notification for a window that isn't focused waits until the window is focused again.

- The window is **focused** when VS Code is the active application window. Switching to the browser, chat, or any other application is a **focus switch**.
- Record every focus switch away and back with its time.

### Classifying delivery

Work out the **delivery deadline**:

- **Window focused the whole time from TR to TR + 6:00:** the deadline is **TR + 6:00**.
- **Any focus switch away between TR and TR + 6:00, or the window not focused at TR + 6:00:** the deadline is **1:00 after the first moment at or after TR + 6:00 when the window is focused**. If the window is focused at TR + 6:00, that is TR + 7:00. If the participant is still away, it is 1 minute after they return.
- **Still away at T0 + 15:00:** ask the participant to return to VS Code, then wait 1 minute. The deadline is that return + 1:00.

Then:

- **Notification delivered** = a Pulley notification for the new pull request appeared by the deadline. Record **yes**.
- **Delivery failure** = no such notification by the deadline. Record **delivery failure**. This is a product failure, not a participant failure, and it is different from a missed notice. Before writing it down, open **Output → Pulley** and record the cause as one of:
  - **no complete check after the request** (no check line after TR),
  - **failed check** (a check after TR ended in an error),
  - **partial check** (a check after TR reported that some results couldn't be read).

  It is a delivery failure whatever the cause. If the cause matches none of these (the expected example: a complete, successful check ran after TR but did not yet include the new pull request, because of GitHub search lag), write what you saw in the session notes and still record a delivery failure.
- A participant with a delivery failure **does not pass**, and the failure goes to the triage table.

### Observing the notice

Only when the notification was delivered:

- **Noticed** = the participant looks at it, reads it, mentions it, or acts on it. Record **yes** or **no**. A notification that is delivered but not noticed is a **missed notice**, not a delivery failure. It does not by itself stop the participant passing, but record it and triage it.
- Record what they did: opened the pull request, opened the queue, dismissed it, or ignored it.
- Record their reaction to the single notification, verbatim if they say anything.

After the end mark, ask them to stop coding.

## Interview

Ask these questions in order, with the Pulley view visible in the participant's placement. Do not explain anything before they answer.

1. "Is the count understandable?" (Point to the number on the Pulley view only if they can't find it, and note that you pointed.)
2. "Can you tell which repository each request belongs to?"
3. "What does the corgi's current state mean to you?"
4. "What would you do if Pulley said it couldn't check GitHub?"
5. "Was anything intrusive or nagging?"

For questions 1–4, score each as **Understood**, **Partly**, or **Not understood**, and note whether the participant wanted or expected an extra alert to understand it (for example, "I'd want a popup when it's offline").

For question 5, write down every word about intrusiveness **verbatim**. Also record intrusiveness remarks the participant made unprompted during the tasks.

### When a participant counts as intrusive

Record **intrusive = yes** if, in the interview or unprompted during the session, the participant says that Pulley or any part of it (notifications, count, corgi, copy) was intrusive, nagging, annoying, distracting, interrupting, or too much, or says they would turn it off or uninstall it because of how it interrupts. Mild remarks still count; quote them. Record **no** only when the participant said nothing of that kind. If you are unsure, record **yes** with the quote and raise it in triage.

## Wrap-up

1. Restore `pulley.checkIntervalMinutes` to the value you noted.
2. Reset view locations if you moved the view (**View: Reset View Locations**).
3. Sign the GitHub account out of VS Code through the **Accounts** menu (person icon at the bottom of the activity bar → the account → **Sign Out**). Uninstalling does not remove the sign-in, so do this whether the account was the participant's own or a prepared one.
4. Restore VS Code's **Do Not Disturb** mode to the state you noted in Setup step 4.
5. If you used the participant's own account, offer to uninstall: `code --uninstall-extension vitaliipolitylo.pulley`, or `code --profile pulley-test --uninstall-extension vitaliipolitylo.pulley` if you installed into a profile.
6. Withdraw the Task 2 review request if the pull request was only for the test.
7. Fill in the participant's rows in [`usability-results.md`](usability-results.md) the same day.

## Scoring

A participant **passes** when all three hold:

- Task 1 success (2:00 or less, no hint), **and**
- not intrusive, **and**
- no delivery failure in Task 2.

The test **passes** when the number of passing participants meets the bar for the number of counted sessions:

| Counted sessions | Passing participants needed |
|---|---|
| 3 | 3 of 3 |
| 4 | 4 of 4 |
| 5 | 4 of 5 |

With 4 participants the bar is 4 of 4. That is the stricter reading, because the PRD's assumption A8 defines only the 5-person and 3-person bars. Use the planned session count fixed before session 1. Fewer than 3 counted sessions is not a result; the only sessions you may add are replacements for uncounted ones. Do not run more than 5.

Every failure (a failed Task 1, a non-Pulley Task 1 route, an intrusive remark, a delivery failure, a missed notice, a comprehension problem) gets a row in the results file's triage table before Story 2.6 starts. A **comprehension problem** is any interview score of Partly or Not understood, or an extra alert the participant wanted.

## Session sheet

Copy this for each session and transfer it to the results file afterwards. Keep paper or local copies out of the repository.

```text
Participant: P_   Placement: Sidebar / Panel   Account: own / prepared   Date:
Consent (taking part, own-account sign-in if used, anonymized quotes in repo) [ ]   screen-recording consent: yes/no
Setup: interval set to 5 before connect [ ]  first-connection notification seen/dismissed [ ]  DND previous state: on/off, now off [ ]  no folder open [ ]
Task 1: time __:__   hint given: yes/no   success: yes/no   route: Pulley row / other: ____   first thing tried:
Task 2: T0 __:__:__  TR __:__:__  TN __:__:__ / none
        focus switches (away/back times):
        deadline __:__:__   delivered: yes / delivery failure   cause (if failure):
        noticed: yes/no   action:   reaction:
Interview: count U/P/N   repository U/P/N   corgi U/P/N   recovery U/P/N   wanted extra alert:
           intrusive: yes/no   quotes:
Interval restored [ ]  view reset [ ]  GitHub account signed out [ ]  DND restored [ ]
```
