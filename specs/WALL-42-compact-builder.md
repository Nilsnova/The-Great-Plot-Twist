# WALL-42: compact the real wall builder without losing accessible controls

Responsible teammate: Johannes Franz Lang (`frcola`). Authorized integration follow-up to the full-perimeter roadmap, parent #241. No activation, deployment or merge.

Issue: [WALL-42 #329](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/329), native child of #241. Implementation: [Draft #330](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/330), branch `fix/wall-42-compact-builder`, based on immutable `chore/wall-42-pinned-base` at `ce719a3e0d1b878300cd230afc42d338a92319e0`. Retarget after the coordinated aggregate is reviewed; this base does not move with ongoing integration.

## Reproduced problem and goal

The actual 1280×720 full-game capture shows an expanded construction bar about 566 pixels wide and 376 pixels high. Its occupied area forces Fit village to leave a roughly 220-pixel island. The controls must use desktop width effectively while preserving all copy, fine-position actions and 44-pixel buttons on phones.

## Acceptance checks

- At 1280×720, the builder is about 800–1000 pixels wide, no more than 200 pixels tall closed and 250 expanded for the representative two-wall draft/ready states.
- Desktop groups the camera and purchase actions beside the draft information rather than stacking every group vertically.
- At 375×812, all controls remain reachable, at least 44×44, and within the viewport; narration clearance, scroll, keyboard disclosure and actual click hit targets remain valid.
- All existing accessible names, essential copy, prices, pending/unknown purchase behavior and fine-position controls remain unchanged. No forced clicks or smaller fonts.
- Extend the existing real DOM layout cases for the actual geometry targets. Actual before/after full-game captures belong to the coordinated WALL-24 browser lane.

## Scope and plan

1. Pin the current aggregate ce719a3e as an immutable review base and claim a draft.
2. Use responsive desktop grid grouping in wall-builder.css; add only minimal semantic layout classes to the existing bar.
3. Retain the phone flow, scroll and safe-area/narration clearance, without reducing typography or touch targets.
4. Extend existing component DOM checks with desktop closed/expanded geometry and reachable 44px controls; preserve phone checks.
5. Run the coordinated allowed checks, inspect the diff and provide handoff for actual-game captures.

Likely files: frontend/src/island/wall-builder.css, minimal frontend/src/island/wall-builder-bar.js class additions if needed, frontend/tests/island/wall-builder-dom.test.js and this specification. No game rules, purchases, camera math, transport or selector changes.

## Verification status

Before evidence: `/workspace/village-perimeter-work/wall-24-bringup/failure.png` (expanded actual game) and `before-construction-1280x720.png`. The coordinated WALL-24 lane owns actual-game after captures; this draft does not substitute a generated concept or component image for that evidence.

## Result and verification

At desktop widths of at least 900px, the bar uses up to 960px with draft information on the left and camera/actions on the right. The expanded fine-position pad places all four existing directions in one row. Smaller screens keep the existing single-column flow and compass pad. No control, disclosure, accessible name, status or essential information is removed; typography and 44px targets are retained. Long content remains scrollable inside viewport/narration bounds.

The quote's `remaining` value is inventory capacity. The copy now says `Wall slots remaining: N` so players do not interpret it as coins. `slots` was checked as the standard American English plural of the already-reviewed `slot`, then added to the text list. Price and unknown/pending purchase behavior are unchanged.

The existing real DOM test now measures actual desktop closed/expanded bounds and verifies that every visible button is at least 44px, within horizontal bounds and directly hit-testable. Its original confirmation, unknown retry, polite live-status and explicit inventory-copy checks remain. The existing phone case still exercises a 120px narration card, keyboard disclosure without purchase, 44px hit targets, half-grid movement, invalidated quote, clear and Escape.

Executed after the integration owner released the single Chromium lane:

```sh
cd frontend
npx vitest run --maxWorkers=1 tests/island/wall-builder-dom.test.js
```

**Test Files 1 passed (1); Tests 9 passed (9); Duration 14.18s; exit 0.** Before the CSS correction, the new focused geometry regression returned **1 failed / 8 skipped**, observing the old 560px width against the required minimum 800px; no existing test was disabled or weakened.

From the repository root, `node scripts/text-lint/index.mjs`: **4504 candidate strings in 500 source files; 0 errors, 8 report-only findings; exit 0**. `git diff --check` passed. Browser lane released immediately after the focused job.

Not run in this slice: aggregate full frontend suite, production build/budget/a11y/demo, actual-game after screenshots, Safari or a physical phone. The integration owner coordinates those checks and WALL-24 captures at 1280×720 and 375×812. No live deployment or merge.

## Explain-back

The bar stacked all information and controls vertically even when a desktop had room beside it. I used a responsive grid so controls sit beside the draft information and the island keeps more screen space. Phones retain their existing flow and touch sizes. The desktop height cap allows scrolling for unusually long messages instead of deleting information.

Questions: Why does the desktop arrangement have a separate breakpoint? Why do the phone's 44px buttons and narration clearance remain important? Why is the remaining wall-slot count different from a coin balance?
