# B2 — Harbor and menus on phones

Johannes Franz Lang (@frcola), with Codex assistance. Baseline main `86b01d9`;
independent draft #66. Actual components in isolated Chromium pages, with the
shared sheets/order from main.js and game.js, then each view's own styles.
Controls/data use existing test fixtures; no live account, purchase or provider.

## Readable match choices

At 375x812 and 390x844, the full game styles kept long team labels inside their
buttons by breaking words: “Nottin / gham” and “Manch / ester”. Team labels are
from the repository's recorded EPL data; this is an invented match/time, not a
live sports claim. A narrow CSS rule now gives each match-side choice a full row.
The 5/10/25 coin choices stay together. Labels, selected side/amount, confirmation,
API calls and settlement logic stay as before; desktop layout is retained.

| Size | Before | After |
|---|---|---|
| 375x812 | [Before](before-match-375x812.png) | [After](after-match-375x812.png) |
| 390x844 | [Before](before-match-390x844.png) | [After](after-match-390x844.png) |
| 1280x720 | [Before](before-match-1280x720.png) | [After](after-match-1280x720.png) |

A DOM Range measures each team word: more than one line rectangle means the word
was split. Both phone cases failed before the CSS change (2 failed / 34 passed in
the 36-case regression run). The final suite passes 36 cases. A preliminary
card-only-style fixture was corrected to load the actual world sheets before this
regression proof; the issue is word fragmentation, not text leaving the panel.

## Other views audited

Each view passes at 375x812, 390x844 and 1280x720: panel in viewport, no horizontal
panel overflow, effective click targets at least 44x44, keyboard focus inside the
modal and correct Escape destination. Radio targets use their clickable labels.
The “Game focus” button behind the dialog is a test focus target, not game UI.

| View | Phone sample | Covered state |
|---|---|---|
| Island Harbor | [Harbor](harbor-375x812.png) | Wave 10, all three stands open |
| Weather | [Live sample](weather-375x812.png) / [fallback](weather-fallback-375x812.png) | Storm and recorded-reading explanation |
| Market | [Market](market-375x812.png) | Five assets, including closed/unavailable stocks |
| Match board | After pictures above | Long team names, disabled confirm until selections |
| Pause | [Pause](pause-375x812.png) | Harbor, Settings, Resume/return |
| Settings | [Settings](settings-375x812.png) | Preferences, sliders/switches/radios; account summary excluded |
| Credits | [Credits](credits-375x812.png) | Team/public credits, Back/Escape to settings |
| Shortcuts | [Shortcuts](shortcuts-375x812.png) | Scrollable controls text |
| Help | [First page](help-375x812.png) | All help pages additionally traversed on both phones |

[Condensed 30-view measurements](layout-summary.json). Six further interaction
cases check Harbor identifiers, no spend before confirmation/one controlled spend
after, compact coin rows, pause closes before Harbor opens, local preference save,
and all help pages at each phone size. No money is spent outside in-memory fakes.

## Reproduce

From the repository root, after `cd frontend` and `npm install`:

```sh
npm test -- --run tests/harbor/phone-layout.test.js
```

Set CHROME_PATH if installed Chrome cannot be found. Optional B2_HARBOR_CAPTURE
points to a new output folder for all 30 screenshots and per-view measurements;
normal tests write no screenshots. The fixtures are in phone-fixtures.js, using
the existing fakeCalls/fakeSports, campaign model, card and shell components.

## Limits

This tests geometry and controlled callbacks, not real sports/provider accuracy,
settlement, authentication or room membership. No account/login view is exercised.
Physical touch/software keyboards, VoiceOver, Safari/WebKit, actual clipboard/link
navigation, live multiplayer and B2 game cards outside this pass remain open.
The taller side-choice stack uses more height; existing modal scrolling and
confirmation behavior remain. Automated geometry is not a complete contrast or
screen-reader audit. Desktop is checked, not visually redesigned.
