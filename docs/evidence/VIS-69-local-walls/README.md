# Local wall integration review

Reviewed on the Apple Silicon Mac with Chrome 157.0.8103.79. The browser comparisons use main `840549a5` and the revised renderer on `fix/vis-69-integrated-walls`. They use the in-memory island API and the same prices, fixture, controls and camera presets. Both viewports retain the real game interface.

| View | Desktop 1280 × 720 | Phone 375 × 812 |
| --- | --- | --- |
| Fit | [Baseline](baseline-desktop-fit.png) · [Revised](revised-desktop-fit.png) | [Baseline](baseline-phone-fit.png) · [Revised](revised-phone-fit.png) |
| Work | [Baseline](baseline-desktop-work.png) · [Revised](revised-desktop-work.png) | [Baseline](baseline-phone-work.png) · [Revised](revised-phone-work.png) |
| Breach | [Baseline](baseline-desktop-breach.png) · [Revised](revised-desktop-breach.png) | [Baseline](baseline-phone-breach.png) · [Revised](revised-phone-breach.png) |

The first pass lowered spans and posts to keep roofs, towers and the island heart legible. The next pass added a soft ground contact, insets at exposed tips and a quieter lane overlay. A final tier-by-tier pass removed the bright line at the base of the pale-stone faces. The matrix uses the actual village/combat wall renderer and its atlas on a plain field. It covers straight runs, depth, corners, mixed tiers, damage and open breaches. The solid-alpha receipt measures the actual atlas across all 15 tier/state combinations. [Baseline matrix](baseline-matrix.png) · [Revised matrix](revised-matrix.png) · [Alpha receipt](alpha-samples.json)

## What the browser verified

- Each of the four journeys paid for twelve walls and 21 upgrades, spent 1,180 coins on walls and ended with 398,420 coins after the fixture's other purchases. All five tiers appeared. The test used real pointer selection and the Move controls. Moving `wall_6` to `(-12, -1)` charged zero. The revised game disabled Place for a fourth row, and the fake API independently replied `409 wall_rows`. The refused move, duplicate build, thirteenth wall and max-level upgrade preserved the layout and wallet. [Phone refusal](revised-phone-fourth-row.png)
- In wave 31, both revisions recorded 14 cannon shots, 13 ship shots and 16 landed boarders by the first breach. The real simulation reduced `wall_1` to zero HP after 15.25 seconds. The renderer still drew seven intact and four damaged walls, and the battle snapshot used the saved Move position. [Actual firing](revised-desktop-firing.png)
- A confirmed build or upgrade held its exact ground anchor. Normal motion expanded and faded the gold ring. Reduced motion held its scale and opacity until it cleared. The village quick-action panel left the ring visible in both layouts. The full details panel on a phone can cover the ground during the ring, while the purchase receipt remains visible. The feedback tests also exercised refused actions, uncertain-outcome retries, previous-island replies, pause, battle entry and disposal. [Desktop upgrade](revised-desktop-upgrade-feedback.png) · [Phone upgrade](revised-phone-upgrade-feedback.png)
- The four runs reported zero page exceptions, console errors or external requests. Work/Fit used 79 baseline draw calls and 80 revised draw calls in the sampled frames. The phone used Chrome touch emulation at DPR 2 with reduced motion. Fit showed the whole island, while Work gave a closer view with panning. [Baseline desktop receipt](baseline-desktop.json) · [Revised desktop receipt](revised-desktop.json) · [Baseline phone receipt](baseline-phone.json) · [Revised phone receipt](revised-phone.json)

A separate 35-second High-quality desktop Work sample used WebGL 2 through ANGLE Metal on the M1 Max. Browser frame cadence was 60.00 Hz with a 16.70 ms 95th-percentile interval and no intervals above 25 ms. It held 90 draw calls, 51 textures and 142 geometries throughout. This sample used twelve walls and eight other buildings between waves, with other workloads running on the Mac. [Performance receipt](work-performance.json)

## Parallel work

| Work | Contribution |
| --- | --- |
| Wall art and integration | Coordinator iterated on the profiles, ground contact, visible face seams and guide contrast. [VIS70](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/470) |
| Placement and combat verification | An independent agent verified the client/server rules and isolated a boarder spawn inside a legal coastal wall. Its regression fix preserves the existing spawn time and blocks the landing on the seaward side. [VIS71](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/471) |
| Build and upgrade feedback | A separate agent traced the purchase lifecycle, implemented the world feedback and verified the reduced-motion and stale-reply cases. [VIS72](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/472) |
| Browser evidence | A separate agent built and ran the four matching Chrome journeys with real game rendering, controls and local purchase receipts. [VIS73](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/473) |

## Verification results

| Check | Result |
| --- | --- |
| Frontend suite with installed Chrome | 4,757 passed across 420 files |
| Focused wall, placement, combat and baked-art selection | 434 passed across 11 files |
| Backend | 71 targeted checks passed. Full suite reported 536,827 passed and 304 skipped. Five Node-dependent checks passed separately. The disposable PostgreSQL checks remained opt-in. Ruff passed. |
| Production build, spoiler and cold-title budgets | Passed. The title loads 18,959 JavaScript bytes and 9,410 CSS bytes before compression. |
| Accessibility and class demo | 33 screens audited with zero failures. All 34 demo assertions passed. |
| Multiplayer browser journey | Passed across four players, including shared purchases, active-wave joins, synchronized combat and the boss finisher. |
| Wall recovery in two Chrome tabs | All six scenarios passed, including damage, repairs charged once, matching starting health and timed recovery. The separately tracked late-report scenario also passed. |
| Text lint | Zero errors and eight report-only findings in unrelated strings. |
| Existing readability and two-player placement scripts | Both revisions timed out. Readability waited for `.sea-chart` to open. Placement waited for two online lobby rows before building a wall. The new focused browser journey completed placement and battle at both viewports. |

## Reproduce

Install the locked frontend dependencies in both checkouts, then run the same script against each checkout. Each command produces desktop and phone captures and a JSON receipt. The committed screenshots are the selected review frames.

```bash
node frontend/scripts/check-wall-integration.mjs /path/to/main-840549a5 /path/to/evidence baseline
node frontend/scripts/check-wall-integration.mjs /path/to/fix-vis-69 /path/to/evidence revised
```

The local backend checks exercise the authoritative rules. The browser goes through the in-memory transport, so its receipts do not cover a live database. Safari 27.2's WebDriver reached the preview and refused to start a test session because Allow Remote Automation was disabled. A physical phone and long-session combat performance still need device testing.
