# VIS55 connected wall detail

Actual pure-test/build receipts for the shared village/combat wall drawing. Used by Johannes Franz Lang (`frcola`) and a different human reviewer; this is not browser or release acceptance.

## Change and source

[Spec](../../../specs/VIS-55-connected-wall-detail.md), [issue #423](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/423), [Draft #428](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/428). Corrected runtime commit: `d6ca4998`; VIS57 base: `6c87b8dc`. [Current source and receipts](profile-boundary-source.json) are separate from [the retained first-iteration source](source.json).

Straight runs now retain a full authored post every third two-unit cell, based on the varying logical coordinate. A selected middle segment always gets its actual tier post. Ends, corners, branches, mixed tiers and damage retain their full artwork. Five existing span profiles are `.95`, `1.15`, `1.25`, `1.35`, `1.43`. The fourth span quad is now an upright trim face using the existing top material.

This replaces quad contents, not counts: every span still has four quads, every post one quad, and painter layers/material ownership remain unchanged. The existing mixed-tier 102-post/106-join fixture still asserts exactly `106*4+102` quads and fewer than 70 layers. Nine-piece uniform horizontal/vertical runs explicitly retain five full posts in two/17 drawing layers respectively.

## Independent review correction and current checks

Independent review caught a real error in the first iteration: comparing only the upright lift omitted the rear cross-section's `.168` projected rise and the straight cap's `.02` lift. Actual level-4/5 vertices reached `1.638`/`1.718`, above the authored post top `1.625`. The first attempt remains below; it is not the accepted final profile.

Commit `d6ca4998` lowers the upper tier profiles while preserving five distinct levels. The current maximum straight-cap vertex is `1.43+.168+.02=1.618`; the horizontal span maximum is `1.598`. New tests inspect actual generated vertices, both orientations, a non-buttress straight cap and the actual buttress post, rather than checking raw height constants alone. Fixed numerical coordinate receipts are updated to the corrected design. Independent code review found this issue resolved; human/browser acceptance remains separate.

| Check after correction | Result | Receipt |
|---|---|---|
| New projection-bound tests before correction | **6 failed / 19 passed**, 2 files, **954ms**, including explicit `1.638`/`1.718 > 1.625` failures | [profile-boundary-red.log](profile-boundary-red.log) |
| Eight focused wall suites after correction | **64 passed**, 8 files, **2.76s** | [profile-boundary-focused.log](profile-boundary-focused.log) |
| `npm run build` | Exit 0; Vite **1.12s**, process **2.38s**; spoiler guard **244 text files / 12 protected lines**, no suspect elimination data | [profile-boundary-build.log](profile-boundary-build.log) |
| `node scripts/report-budget.js --check` | Exit 0, **0.44s**; title JS **18,932 / 21,080**, CSS **9,410 / 12,000**, no title image | [profile-boundary-title-budget.log](profile-boundary-title-budget.log) |

An earlier projection-red run put the numeric-profile assertion before the bound assertion; [that raw attempt](profile-boundary-red-value-first.log) is also retained. Only assertion order changed before the explicit-bound red receipt.

## Retained first iteration, runtime `3ccbe82b`

| Check | Result | Receipt |
|---|---|---|
| New detail and independent profile tests before runtime change | **12 failed / 8 passed**, 2 files, 1.60s; expected missing-post/buttress and old-profile failures | [red.log](red.log) |
| Eight focused wall suites after implementation | **59 passed**, 8 files, 5.92s | [focused.log](focused.log) |
| `npm run build` | Exit 0; Vite **1.38s**, process **3.12s**; spoiler guard **244 text files / 12 protected lines**, no suspect elimination data | [build.log](build.log) |
| `node scripts/report-budget.js --check` | Exit 0, **0.49s**; title JS **18,932 / 21,080**, CSS **9,410 / 12,000**, no title image | [title-budget.log](title-budget.log) |

Focused command, from `frontend/`:

```bash
npm test -- --run tests/island/wall-tier-detail.test.js tests/island/wall-textured-batches.test.js tests/island/wall-selection.test.js tests/island/wall-connections.test.js tests/island/wall-span-batches.test.js tests/pirates/wall-connections.test.js tests/art/wall-tier-identity.test.js tests/art/wall-atlas.test.js --maxWorkers=1
```

The former textured/fallback position-equality assertion was deliberately replaced by fixed independent numerical coordinates for both orientations at all five tiers: the new visible heights and trim intentionally differ. Ground feet, exact index/quad counts, depth order, atlas identity, nonmutation, breach and lifetime checks remain. The no-art fallback code, `wall-span-batches.test.js`, independent numeric reference and original hash fixture are unchanged. The only subsequent selected-test edit was a comment describing the coordinate-zero buttress.

## Explain-back and remaining gates

The wall renderer reads the real position, tier and accepted damage state. A contact still joins only two exact full sides; mixed levels use the lower tier. Coordinate-based posts stay in place when the server returns rows in another order. A broken piece removes its adjacent spans, leaving the ruin at its real foot. The drawing never changes what is bought or what blocks a boarder.

No Chrome was launched by this agent. Coordinator desktop/phone before/after and level/state screenshots, combined application checks, physical-device/Safari, sustained performance and human visual/explain-back acceptance remain pending. These focused results do not turn the previously documented input timeout or multiplayer pose failure green. No PR/main merge, deployment, live migration, package, game-rule, payment or progression change.
