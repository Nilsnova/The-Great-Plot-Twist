# COC-39 evidence

The actual gameplay wiring exposes **Menu → Last defense report** after a completed island wave. It summarizes observed heart damage, recorded incoming hits, damage done and breaks. It is unavailable during the next active island wave, and it clears on travel/reset. [Specification and exact checks](../../../specs/COC-39-defense-report.md).

## Before and after

| Size | Before: unchanged pause menu | After: actual report component |
|---|---|---|
| 1280 × 720 | [Before](before-1280x720.png) | [After](after-1280x720.png) |
| 375 × 812 | [Before](before-375x812.png) | [After](after-375x812.png) |

All four screenshots were rendered in Chromium and visually inspected. On the phone the close control, paragraphs and both defense rows fit without horizontal overflow. This is a controlled component fixture, not a production-account or full-world screenshot. Before uses the unchanged real pause menu before the report provider is mounted; after uses this branch's real feature and a real `createWave` event stream (wave 12, seed 77, the two documented defenses). No generated artwork is used.

Reproduce from the repository root: `node frontend/scripts/capture-defense-report.js`.

Actual result: `4 screenshots saved; 2 viewports; browser errors: 0; no API writes.` The [capture JSON](capture-results.json) records heart damage 40, wall hit damage 60 / break 1 and cannon damage 111.2 for this fixture. Loot deliberately remains pending because this fixture does not call the backend. Recorded hit damage can exceed HP actually lost in the legacy shell path; the UI says so.

Final focused results: pure/runtime regressions **25 passed / 2 files / 935 ms**; DOM **2 passed / 1 file / 2.83 s**. Text lint has **0 errors / 8 existing report-only findings**. Full-suite/build/budget/a11y/demo and a production account remain unverified here; Root coordinates the central checks. No merge.
