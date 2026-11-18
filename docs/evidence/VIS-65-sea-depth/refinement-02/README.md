# VIS65 refinement 2: remove the sea's periodic lattice

Follow-up for Johannes Franz Lang (`frcola`), used by the visual review coordinator and peer reviewer. Continues [issue #442](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/442) and [Draft #446](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/446); no new task or PR.

## Actual screenshot feedback

The first sea pass improved depth contrast, but the coordinator's actual `paid-level-2-1280x720.png` in the `clearance-paid-progress` capture showed a new problem: the two bright periodic crest directions read as a large graph-paper lattice. The approved reference instead uses irregular short curved highlights over broad dark-water pockets. Passing coast/control tests had not established visual acceptance.

The coordinator inspected that intermediate game capture and the approved reference before authorizing this bounded correction. Its original capture remains historical evidence; it is not relabeled as the final sea result. The [first-phase guide](../README.md), [manifest](../manifest.json) and original seven manifested artifacts are retained byte-for-byte from `7e768d0e`.

## What changed

Refinement source: **`fbed69c2`**, following `7e768d0e0c33438bc29d0c6b07d19f4efcf28775`. Only the high-detail reflection subsection of [`water.js`](../../../../frontend/src/world/water.js) changes: **10 inserted / 10 removed lines**.

- Remove the second bright crest family and both reflection sine waves.
- Sample two existing noise fields at the same positions as before. They bend the coordinates of a third anisotropic field, stretched along the surface rather than repeating two families of parallel lines.
- Draw restrained broken contours near the third field's `0.55` value, with antialiased width `0.025`. The first field masks their coverage; the existing coast distance still fades them near land.
- Reduce stroke blending to `16%` and soft sheen to `5%`.

The original weighted broad field is explicitly retained as `curl × 0.6 + coarse × 0.4`, using exactly the same two noise inputs. Therefore the existing dark-pocket modulation and near-shore caustic inputs keep their previous values; changing reflection topology does not also retune those layers.

The reflection subsection still evaluates **three noise samples**, replacing the previous two broad-field samples plus one broken-stroke sample. It adds no noise evaluation, texture, mesh, material, clock or autonomous update. Two sine evaluations are removed. These source counts do not establish measured GPU cost.

## Controls and boundaries retained

[Source-boundary receipt](source-boundaries.json) confirms:

- Low-quality/palette/depth code is unchanged, apart from the descriptive comment.
- The remaining caustic/foam/whitecap/glint/rain, coast binding, clocks/weather, quality controls and resource ownership code is byte-identical.
- The near-shore caustic's weighted broad inputs retain their original formula and sample coordinates.
- Existing tests, assets, backend, migrations and dependencies are unchanged.

This is still artistic surface shading. Coast distance, land, paid positions, waves and navigation remain authoritative and unchanged.

## Executed checks on this source

[Machine-readable receipt](checks.json). Commands run in this branch's `frontend/`:

| Check | Exact result | Original output |
|---|---|---|
| `npm test -- tests/art/coast-water.test.js tests/world/ground-transform.test.js --maxWorkers=1` | **11 passed / 2 files**, **1.02s** | [Log](focused.log) |
| `npm run build` | Exit 0; **built in 1.39s**, 2.68s process. Spoiler guard: **245 text files / 12 protected lines**, no suspect elimination data. | [Log](build.log) |
| `node scripts/report-budget.js --check` | Exit 0, 0.36s; title **18,959 / 21,080 JS**, **9,410 / 12,000 CSS bytes**, no title image. | [Log](budget.log) |
| `node ../scripts/text-lint/index.mjs` | Exit 0, 1.78s; **4,550 candidate strings / 535 source files**, **0 errors / 8 report-only findings**. | [Log](text-lint.log) |

The existing six coast/water and five ground-transform cases remain unchanged. No check was skipped, weakened or given a larger timeout. A brief initial working edit also passed the same selection before the broad-field weights were explicitly retained; [that original output](focused-first.log) is separate and is not the final-source result above.

## Not verified here / remaining

This writer launched no Chrome and performed no native GLSL compilation, final screenshots, full frontend, accessibility, demo, multiplayer, backend or performance run. Vite builds a shader string; pure checks protect contracts rather than proving final pixels.

The coordinator owns the new actual desktop/phone comparison, low/high detail, frozen motion, weather and error inspection. Native output must confirm that the contours look organic and remain restrained; the first screenshot's lattice is a recorded visual defect, not accepted final quality. Sustained FPS, Safari/physical-device behavior and final human acceptance remain separate.

## Explain-back

I kept the improved depth colors but replaced the two bright repeating line directions. Two existing random fields now bend where a third field is sampled. A narrow, softly drawn contour in that field produces irregular broken highlights. The same three samples are reused, and the original weighted broad field is kept for the existing shore material.

The important lesson is that passing placement/coast/clock tests did not tell us whether the sea looked right. The actual intermediate screenshot exposed the lattice, so this correction still needs another real screenshot before visual acceptance.

Questions:

1. Why did two bright sine-wave crest directions produce a visible grid?
2. How are three existing noise evaluations reused without adding textures or changing the shore's weighted field?
3. What does the new browser comparison need to establish beyond the eleven passing contract tests?

All work remains in `feat/vis-65-sea-depth`, [Draft #446](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/446). No merge, Ready status, deployment or database action is claimed.
