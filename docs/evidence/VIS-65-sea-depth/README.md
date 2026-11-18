# VIS65: sea depth and surface lighting

Presentation follow-up for Johannes Franz Lang (`frcola`), used by the visual review coordinator and a different human reviewer. Tracks [issue #442](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/442), [Draft #446](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/446).

## What changed and why

The earlier actual game capture shows a mostly uniform turquoise field and many fine parallel strokes. The approved island reference has stronger dark-water pockets and broader broken reflections. This task refines the existing [`water.js`](../../../frontend/src/world/water.js) fragment shader; it does not add another sea mesh, texture or service.

The first implementation source is `01f0b1d13572695f7668135ab45f9e830a32b354`, stacked on VIS61 `1bce43099cc4e78781faa0b74051d331bfe85e24`. That base retains current main `48aee0e7` and prior visual review `2a2e9651`. The source diff is 22 inserted / 15 removed lines in one product file.

- **Broad depth:** the real coast-distance value supplies an artistic depth ramp between one and eleven displayed world units from the coast. Two slow spatial noise scales vary the dark pockets. This is shading, not measured water depth or a navigation rule.
- **Crossing light:** the broad swell is less densely spaced and slightly diagonal. In high detail, a second reflection direction crosses the first. Slowly warped noise breaks their crests into irregular strokes rather than a regular grid.
- **Restrained contrast:** broad sheen blends at 7%; primary and crossing crest contributions are bounded at 28% and 13%. Near-shore caustics rise from a 5.5% to a 12% blend. Existing shallow, foam, whitecap and glint layers still control the immediate coast.
- **Palette:** deeper offshore blue-green contrasts with turquoise shallows. It uses the same existing color uniforms and linear-to-sRGB output path.

These changes apply to the existing sea under every place. They do not change the island silhouette, decorative cliff alpha, saved positions, legal land, walls or combat.

## Controls and resources retained

[Source-boundary receipt](source-boundaries.json) compares the base with the code source. The following sections are byte-identical:

1. Coast texture allocation/cache, distance-field computation, image-row flip, projection binding and shared uniform declarations.
2. Foam, wind whitecaps, sun flecks and rain rings.
3. Mesh/material creation and ownership, coast rebinding, weather updates, boss pace, quality switching and disposal.

The broad depth and swell layer is available in both quality modes, as before. The additional reflection strokes, crossing sheen and caustics remain inside `uDetail > .5`. Low quality still disables those extras. Reduced motion still receives the existing repeated time-zero updates; no new clock or autonomous timer was added. The lighthouse continues sharing the same time, coast, weather and quality references.

There is still one existing water plane, material and shared coast texture. The shader performs more procedural arithmetic: one additional noise sample in the broad layer and another in the high-detail layer. Unchanged resources do not imply unchanged GPU cost. Sustained performance must be measured separately.

Public assets, backend, migrations, package manifests and the existing test files are unchanged. No `.env`, dependency, account, deployment or live database work was performed.

## Executed checks

All commands ran in this isolated branch's `frontend/`, on source `01f0b1d1`:

| Check | Exact result | Receipt |
|---|---|---|
| `npm test -- tests/art/coast-water.test.js tests/world/ground-transform.test.js --maxWorkers=1` | **11 passed / 2 files**, 1.27s | [Original output](focused.log) |
| `npm run build` | Exit 0; Vite **built in 1.35s**; process 2.68s. Spoiler guard: **245 text files / 12 protected lines**, no suspect elimination data. | [Original output](build.log) |
| `node scripts/report-budget.js --check` | Exit 0, 0.40s; title **18,959 / 21,080 JS bytes**, **9,410 / 12,000 CSS bytes**, no title image. | [Original output](budget.log) |
| `node ../scripts/text-lint/index.mjs` | Exit 0, 1.61s; **4,550 candidate strings / 535 source files**, **0 errors / 8 report-only findings**. | [Original output](text-lint.log) |
| Source-boundary and full scope comparison | All five recorded checks true. | [Receipt](source-boundaries.json) |

[Machine-readable command receipt](checks.json).

The existing six coast/water tests retain inverse/translated projection, land/sea orientation, field refresh/failure, shared lighthouse uniforms, high/low quality, weather, boss pace, repeated time-zero and disposal checks. The five ground-transform tests retain the shared affine ground contract. No test was skipped, weakened or given a larger timeout. New assertions of color constants would not prove the visual result; actual browser proof remains a separate requirement.

## Not yet verified here

This writer did not start Chrome or run a full frontend suite, accessibility, demo, multiplayer or backend commands. Vite building the shader string does not prove native GLSL compilation or final appearance.

The coordinator owns native compilation and actual 1280×720 / 375×812 before/after captures. Their check should compare high and low detail, frozen motion, wind/rain and shoreline placement; inspect shader/page errors; and preserve the screenshots as actual game evidence. A still image alone does not establish sustained FPS, physical-device/Safari behavior or final human visual acceptance.

The sea refinement does not fix wall/object intersections. Those are separate VIS62 placement and VIS63 selection tasks; upright wall proportions are VIS64. All remain review work until their combined behavior is checked.

## Explain-back

I made the existing sea look deeper and less repetitive. The real coast-distance field still tells it where the shore is. I use that distance only to blend the colors, with slow noise to avoid one flat band. Two broken reflection directions add surface light in high detail. I kept the existing clock, weather and quality controls so reduced motion, boss slow motion and the lighthouse still agree.

The limits are that this is artistic shading, not a new water simulation, and extra shader arithmetic can cost GPU time. The existing tests protect the coast and control contracts; a real browser must still compile and display the shader. Later work could tune the bounded blends or simplify the high-detail noise after measured device testing.

Walkthrough questions:

1. How does this shader distinguish the real shore from its artistic depth shading?
2. Which details disappear in low quality, and what still freezes with the shared time-zero update?
3. Why do passing coast tests and Vite build not prove native compilation, visual acceptance or sustained performance?

## Remaining / branch

Branch: `feat/vis-65-sea-depth`; [Draft #446](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/446). The coordinator must integrate and capture the actual game, then record exact results. A different human reviews the current revision after Johannes's explain-back. No PR/main merge or Ready status is claimed.
