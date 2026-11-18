# CW4 · Show the captain's carried weapon

Responsible teammate: Ianno Hollensteiner (`Iannomh123456`), assisted by Codex. Issue: [#461](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/461). Branch: `feat/cw4-weapon-poses`, based on `48aee0e7b34c879968c4bc606b543f911032adfa`. Local implementation; PR publication and independent human review remain.

## Problem and result

Every `captain_fired` event used a musket body pose, including fire bombs. The captain now carries two short pistols, a flared blunderbuss, a long rifle, or a bomb in the matching firing/throwing pose. Bombs keep their existing flight and explosion and produce no firearm muzzle bloom or flash.

The existing event's weapon chooses the pose; unknown or missing IDs keep the musket fallback. The body remains upright while the arms and weapon follow the projected aim. The same pose feeds the local character and a teammate's presence figure, in each of the ten lobby colors. Pose expiry returns that body to walking. One dynamic texture per captain is repainted when weapon, aim, color or phase changes and released on disposal.

Scope: `frontend/src/pirates/poses.js`, `shot-art.js`, `render.js`, the procedural painters in `src/art/people.js`, focused tests and the existing direction browser check. Shot cadence, balance, damage, prices, ownership, room messages and recovery journals are unchanged. No new dependency, external service or art source.

## Acceptance and evidence

- All five weapon events select matching art, both phases and all ten colors; bad IDs retain the standard weapon.
- A bomb remains a thrown shell with no firearm muzzle bloom/flash, including reduced motion.
- Actual Chromium character and presence renderers each show one body, exact aim, the correct mirror and expiry at 1280 × 720 and 375 × 812.
- Switching weapons at the same aim yields five different silhouettes; the existing dynamic texture is reused and disposed.
- Before/after images and explicit fixture limits: [CW4 evidence](../docs/evidence/CW4-weapon-poses/README.md).

## Verification · 18 November 2026

- Tests first: the new checks failed with six failures (four wrong weapon kinds, missing frame IDs and the bomb's muzzle bloom); the unchanged tests passed.
- `cd frontend && npm test -- tests/pirates/poses.test.js tests/pirates/render.test.js tests/pirates/art.test.js tests/cartoon-art.test.js tests/hires-art.test.js tests/pirates/captain-stats.test.js`: **6 files passed; 59 tests passed**.
- `T27_CAPTURES=/tmp/cw4-before node scripts/check-shooting-direction.js --before`: **OK**, baseline source before the art/pose changes.
- `T27_CAPTURES=/tmp/cw4-after node scripts/check-shooting-direction.js`: **OK**, five weapons, two pages, ten angles and two viewports; same-angle silhouette and texture cleanup assertions passed.
- `node scripts/capture-weapon-match.js /tmp/cw4-match`: **OK**, actual integrated fake wave, a fire-bomb purchase through the existing arsenal, carried weapon verified, matching visible pose at both viewport sizes; zero browser errors or external requests.
- `npm run build`: passed; spoiler guard checked 243 text files and 12 protected lines, with no suspect elimination data.
- `node scripts/report-budget.js --check`: passed; initial JavaScript **18,899 / 21,080 bytes**, CSS **9,410 / 12,000 bytes**.
- `SHOTS_DIR=/tmp/cw4-demo npm run test:demo`: failed at `check-demo-journey.js:63`, waiting to click the hidden lamp quest. The exact unchanged `48aee0e7` baseline reproduced the same failure. This does not prove the full demo journey.
- `npm run test:a11y`: 33 screens audited, exit 1 with eight findings: market-placed contrast at 1280/375/320, plus keyboard findings on market-hotspot, market-prices, market-confirm, market-placed and lobby. An unchanged `48aee0e7` worktree reproduced the exact failure list; no new findings. Audit errors, browser errors and external requests are empty on both. [Baseline comparison](../docs/evidence/CW4-weapon-poses/accessibility-baseline.json).
- Relative documentation destinations and `git diff --check` pass; full frontend suite belongs to the coordinator.

No production deployment, signed-in multiplayer match or live device check was performed. The root coordinator is running the full frontend suite for this branch. Human review and merge remain outstanding.

## Explain-back questions

1. How does an existing shot event choose the captain's weapon pose without adding a room message field?
2. Why must the reused texture's cache key include the weapon when the aim angle stays the same?
3. How does the browser fixture prove that one captain body remains visible and its shot texture is released, and which live behavior does it leave unverified?
