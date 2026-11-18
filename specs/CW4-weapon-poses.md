# CW4 · Show the captain's carried weapon

Responsible teammate: Ianno Hollensteiner (`Iannomh123456`), assisted by Codex. Issue: [#461](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/461). Branch: `feat/cw4-weapon-poses`, based on `48aee0e7b34c879968c4bc606b543f911032adfa`. Draft PR: [#464](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/464). Explain-back, manual review and independent human approval remain.

## Problem and result

Every `captain_fired` event used a musket body pose, including fire bombs. The captain now carries two short pistols, a flared blunderbuss, a long rifle, or a bomb in the matching firing/throwing pose. Bombs keep their existing flight and explosion and produce no firearm muzzle bloom or flash.

The existing event's weapon chooses the pose; unknown or missing IDs keep the musket fallback. The revised non-musket drawings use shoulder, elbow and wrist chains whose hands share the weapon's projected grip coordinates. Rifle/blunderbuss palms meet the trigger and underside of the fore-end; each pistol has its own grip. The bomb's firing phase is an empty release hand, and its later ready phase cradles one bomb in that hand; the other arm balances empty. The approved musket painter remains separate and pixel-identical.

The body remains upright while the arms and weapon follow the projected aim. The same pose feeds the local character and a teammate's presence figure, in each of the ten lobby colors. Pose expiry returns that body to walking. One dynamic texture per captain is repainted when weapon, aim, color or phase changes and released on disposal.

Scope: `frontend/src/pirates/poses.js`, `shot-art.js`, `render.js`, the procedural painters in `src/art/people.js`, focused tests and the existing direction browser check. Shot cadence, balance, damage, prices, ownership, room messages and recovery journals are unchanged. No new dependency, external service or art source.

## Acceptance and evidence

- All five weapon events select matching art, both phases and all ten colors; bad IDs retain the standard weapon.
- A bomb remains a thrown shell with no firearm muzzle bloom/flash, including reduced motion.
- Actual Chromium character and presence renderers each show one body, exact aim, the correct mirror and expiry at 1280 × 720 and 375 × 812.
- Switching weapons at the same aim yields five different silhouettes; the existing dynamic texture is reused and disposed.
- Before/after images and explicit fixture limits: [CW4 evidence](../docs/evidence/CW4-weapon-poses/README.md).

## Revision 2 verification · 18 November 2026

The first hand/arm layout at `0f6b966e` was rejected in visual review. This revision changes only the procedural pose painter and its verification/evidence; the old pictures below are historical. [Current before/after evidence and phase sheets](../docs/evidence/CW4-weapon-poses/revision-2/README.md) compare against that exact rejected revision.

- Focused art/pose/render checks: **6 files / 63 tests passed**. Four new invariant cases cover joined projected wrists, bent noncollapsed arm segments, two pistol grips, supporting palms and zero released/one held bomb.
- Existing Chromium direction check: **passed**, five weapons × two actual `POSES` phases × own/remote renderers × ten directions × two viewport sizes; correct frame, exact aim/mirror, one body, expiry and texture reuse/disposal.
- Musket RGBA regression: **220 exact matches** against fingerprints recorded from approved `0f6b966e` before edits: ten colors × two phases × ten representative projected directions plus the static atlas fallback. Chromium 156.0.8078.79 on Debian 13/Linux x86_64, density 3. The fixture records this environment and provenance; do not regenerate it from revised musket code. These finite samples do not claim every real-valued angle or every rasterizer.
- Current `npm run build` and spoiler guard: passed. Current budget gate: passed, initial JavaScript **18,899 / 21,080 bytes**, CSS **9,410 / 12,000 bytes**.
- Current integrated fake-match capture: **passed** at 1280 × 720 and 375 × 812, real fake-arsenal purchase and controller fire, matching visible bomb pose, zero browser errors/external requests.
- Current `npm run test:a11y`: **33 screens, exit 1, seven findings**, all present in the preserved unchanged-main baseline: three market contrast findings and four market keyboard findings. The baseline-only lobby keyboard finding did not reproduce; no focus fix is claimed. No new findings, audit errors, browser errors or external requests. [Comparison](../docs/evidence/CW4-weapon-poses/revision-2/accessibility-comparison.json).
- Current demo rerun: **exit 1**, same hidden-lamp click timeout at `check-demo-journey.js:63` as the preserved baseline; no passing demo claim.
- Coordinator text lint: **4,429 candidates / 489 source files, zero errors**, eight existing report-only findings. Diff check passes.
- Current full frontend: `npm test -- --maxWorkers=2` passed **347 files / 3,850 tests** in **542.92 s**. Painter and pose-test hashes stayed unchanged throughout the run. Independent code and all-direction visual reviews found no actionable issues. Historical first-pass results remain separately labeled.

## First-pass verification · historical at 0f6b966e

- Tests first: the new checks failed with six failures (four wrong weapon kinds, missing frame IDs and the bomb's muzzle bloom); the unchanged tests passed.
- `cd frontend && npm test -- tests/pirates/poses.test.js tests/pirates/render.test.js tests/pirates/art.test.js tests/cartoon-art.test.js tests/hires-art.test.js tests/pirates/captain-stats.test.js`: **6 files passed; 59 tests passed**.
- `T27_CAPTURES=/tmp/cw4-before node scripts/check-shooting-direction.js --before`: **OK**, baseline source before the art/pose changes.
- `T27_CAPTURES=/tmp/cw4-after node scripts/check-shooting-direction.js`: **OK**, five weapons, two pages, ten angles and two viewports; same-angle silhouette and texture cleanup assertions passed.
- `node scripts/capture-weapon-match.js /tmp/cw4-match`: **OK**, actual integrated fake wave, a fire-bomb purchase through the existing arsenal, carried weapon verified, matching visible pose at both viewport sizes; zero browser errors or external requests.
- `npm run build`: passed; spoiler guard checked 243 text files and 12 protected lines, with no suspect elimination data.
- `node scripts/report-budget.js --check`: passed; initial JavaScript **18,899 / 21,080 bytes**, CSS **9,410 / 12,000 bytes**.
- `SHOTS_DIR=/tmp/cw4-demo npm run test:demo`: failed at `check-demo-journey.js:63`, waiting to click the hidden lamp quest. The exact unchanged `48aee0e7` baseline reproduced the same failure. This does not prove the full demo journey.
- `npm run test:a11y`: 33 screens audited, exit 1 with eight findings: market-placed contrast at 1280/375/320, plus keyboard findings on market-hotspot, market-prices, market-confirm, market-placed and lobby. An unchanged `48aee0e7` worktree reproduced the exact failure list; no new findings. Audit errors, browser errors and external requests are empty on both. [Baseline comparison](../docs/evidence/CW4-weapon-poses/accessibility-baseline.json).
- `npm test -- --maxWorkers=2`: **347 files / 3,846 tests passed** in **362.46 s**.
- Independent agent review found no actionable issues and separately ran 3 files / 35 tests; final capture/safety review passed.
- Relative documentation destinations, `git diff --check` and the committed-diff secret scan pass.

No production deployment, signed-in multiplayer match or live device check was performed. Human explain-back, manual review and independent approval remain outstanding; nothing is merged.

## Explain-back questions

1. How do the sleeve wrists and weapon grips share the same projection while the captain's body stays upright?
2. Why is the bomb hand empty in the firing phase and holding one bomb in the later ready phase, without adding a network state?
3. How do the 220 RGBA checks protect the approved musket, and which angles, browsers or live behavior do those checks leave unverified?
