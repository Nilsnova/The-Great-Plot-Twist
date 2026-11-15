# B2 — Phone entry and full lobby

Johannes Franz Lang (@frcola), assisted by Codex. Baseline main `4d83dcd`;
independent draft #61. Chrome viewport checks, not physical-phone or live-account evidence.

## Confirmed defect and fix

In a ten-player lobby, generated names such as “Wandering Lighthouse 10 (you)”
were visually truncated on both phone sizes. All ten fixture names were clipped;
the host name had only 89px at 375x812 and 104px at 390x844. The existing accessible
text was complete. The fix is visual: at widths up to 520px, use four columns for
presence, colour, name and optional role; allow the name to wrap and put status
under it. DOM order, labels, host/member rules and callbacks stay unchanged.

| Size | Before full lobby | After full lobby | Names clipped before → after |
|---|---|---|---|
| 375x812 | [Before](before-lobby-375x812.png) | [After](after-lobby-375x812.png) | 10 → 0 |
| 390x844 | [Before](before-lobby-390x844.png) | [After](after-lobby-390x844.png) | 10 → 0 |
| 1280x720 | [Before](before-lobby-1280x720.png) | [After](after-lobby-1280x720.png) | Existing desktop layout retained |

[Condensed name measurements](name-measurements.json). Fixture names use existing
adjective/noun words from `backend/content/names.json`; ten synthetic members have
mixed roles, online/away status and a host/member perspective. The full lobby's
list still scrolls; the test reaches the last member and Start/Look around first.
Taller rows show fewer players at once, with complete names when scrolled into view.

## Entry audit

The entry needed no production change in this pass. The existing Continue/Create/
Join card passes at all three sizes, including generated host names, reachable
44px buttons, invalid code (no call), valid Join, Create and Continue callbacks.
[375x812](entry-375x812.png), [390x844](entry-390x844.png), [1280x720](entry-1280x720.png).

A separate real local fake-game run audits seven stages at each of the three sizes:
title, title Join (opened, not submitted), lore intro, first tutorial, game choice,
goal card and lobby. All **21 panels** stayed in the viewport, without horizontal
panel overflow or buttons below 44x44; browser errors [] and external requests [].
[Condensed report](entry-summary.json); sample [title](title-375x812.png),
[title Join](title-join-375x812.png), [goal](goal-375x812.png).

From the repository root, after `cd frontend` and `npm install`:

```sh
npm test -- --run tests/island/phone-lobby.test.js
node scripts/check-phone-entry.js
```

The second command prints a fresh temporary output folder for all 21 pictures and
the full report. It refuses TEST_URL so actions always use its owned local server
with `?islands=fake`. Set CHROME_PATH if installed Chrome is not found. For optional
component screenshots/measurements, set B2_LOBBY_CAPTURE to a new output folder when
running the focused tests; ordinary tests do not write captures.

## Proof limits

Component callbacks are controlled; the journey uses the existing fake transport.
No authenticated service, purchase, reward, real room or QR join from a second device
is verified. Physical touch/software keyboards, VoiceOver, Safari/WebKit and the
rest of B2 outside entry/lobby remain open. No login, API or Start/join rule changes.
The new tool checks bounds and button sizes, not every possible overlap or contrast;
focused tests and visual inspection cover the full-crew name regression separately.
