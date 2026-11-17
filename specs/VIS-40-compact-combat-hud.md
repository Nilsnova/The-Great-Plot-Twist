# VIS-40 — Compact, truthful combat HUD

Bounded battle UI correction for Johannes Franz Lang (`frcola`, `83476@novasbe.pt`), child of VIS-31 #236. Tracks #395.

## Agreed scope and source

The approved reference review found a first-wave pictogram on wave 41 and the phone battle bar overlapping the actual two-line coin purse. Keep every health, threat, loot, down/boss and weather state truthful while making the bar readable. No simulation, purchase, art, game/index or rendering change. The coordinator explicitly authorized the single controller first-wave guard so playing wave 41 cannot consume the first-wave device hint.

Pin the immutable review base `review/vis-40-main-59181376` at `591813762a11fa29dee9097a79811831982eb0ef`, fetched from the coordinator's reconciled `current-main` clone. Normal ancestry reconciliation retained the earlier specification commit and all current-main code; the reviewed runtime starts byte-identical to the coordinator's visual preview. Preserve teammate playout and core publisher code. Draft only; independent human review and explain-back remain required.

## Plan and contracts

1. Gate the pictogram to actual wave 1, retain its existing controller lifetime, and latch a tap dismissal for that wave.
2. Keep the genuine weather introduction window; afterward a native 44 px disclosure preserves its real detail for keyboard/touch.
3. Measure the actual play HUD coin/Menu rectangles and resize changes; place the bar below overlapping header content without shrinking type.
4. Compact existing battle rows and retain spoken labels, zero health, captain status, ships, ashore, loot and warnings.
5. Add controller/storage and semantic/native layout regressions, inspect the diff and report exact evidence.

Affected: `frontend/src/pirates/hud.js`, `pirates.css`, the first-wave condition/comment in `controller.js`, focused tests and this spec. No dependency, environment, live flag, schema or simulation contract changes.

## Acceptance and risks

- Wave 41 neither displays nor consumes the first-wave hint; wave 1 shows it once, tap stays dismissed, and the existing timeout/reduced-motion behavior remains.
- Weather initial warning remains, then its full real line is available through a native disclosure; fresh weather copy cannot remain stale.
- Actual `createHud` coin/Menu and battle bar do not overlap at 1280×720, 375×812 or 320×812, including a large purse and resize. Player-facing text is at least 17 px and actionable targets at least 44 px.
- Preserve zero HP, down text, boss, loot and accessible battle labels. Disconnect size/listener resources on disposal.
- Run focused pure/controller checks first; native Chrome checks only in the coordinator's exclusive lane. Full suite/build and integrated screenshot acceptance belong to the coordinator.

Risks: resize-observer feedback, controller calling hint before bar state, native disclosure state being overwritten each frame, and large-header content pushing the bar down. Tests must cover those boundaries without masks, forced clicks, shortened text or fabricated state.

## Explain-back

The battle bar uses the actual wave number and header measurements. Weather keeps its existing game timing; only its presentation folds after the introduction. Limits: a very tall purse or first-wave warning naturally uses more screen space; the change does not alter gameplay or solve unrelated center prompts.

Before readiness: Why must wave 41 not write the hint flag? Why measure the real purse rather than assume 72 px? Why preserve native weather disclosure state after the intro?

## Verification

`cd frontend && npx --no-install vitest run tests/pirates/first-wave-hint.test.js tests/pirates/controller.test.js`: 2 files, 6 tests passed (2.05 s). The new storage regression failed on the original condition because wave 41 displayed and consumed the hint, then passed after the one-condition correction. `git diff --check` and `node --check frontend/src/pirates/hud.js`: exit 0.

`cd frontend && npx --no-install vitest run tests/ui/combat-hud.test.js tests/ui/hud.test.js`: 2 files, 16 tests passed (21.37 s), using installed headless Chromium in the coordinator's exclusive lane. The new native cases mount the actual play `createHud` and combat HUD at 1280×720, 375×812 and 320×812, then change the real purse to `Number.MAX_SAFE_INTEGER`. They assert header separation, viewport/text bounds, 44 px controls, 17 px type, island HP 0, captain down, three ashore, loot/boss, first-wave dismissal, real weather intro/manual keyboard disclosure with refreshed copy, and cleanup. Existing fourteen play-HUD tests also passed. The fixtures deliberately supply component states; this is not a full-game screenshot or gameplay acceptance claim.

Both native harness browser/server instances closed through their normal cleanup. A process readback found no live Chrome/Chromium; the slot was explicitly released to the coordinator. No timeout, existing assertion, test or copy was weakened or skipped.

Accessibility follow-up `f4f04422` retains the actual Land/Block/Protect instruction in the hint button's accessible name alongside its dismissal purpose. `cd frontend && npx --no-install vitest run tests/ui/combat-hud.test.js`: 1 file, 3 tests passed (5.40 s), including actual keyboard Enter dismissal followed by repeated controller updates. The previous tap, weather, layout and cleanup cases also passed in this focused rerun. Visible layout is unchanged.

Full frontend/build/demo/a11y and integrated before/after screenshots remain with the coordinator's final combined lane. Keep this PR Draft until that evidence, a human's current review and the three explain-back answers are complete. No merge or deployment was performed.
