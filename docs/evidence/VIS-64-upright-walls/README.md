# VIS64: upright wall volume

Responsible teammate: **Johannes Franz Lang (`frcola`)**.
Issue: [#441](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/441).
Branch: `feat/vis-64-upright-walls`, stacked on VIS61's current-main-preserving
review base `1bce4309`. This is an unmerged presentation follow-up.

## Result and boundaries

The former short wall profile read as a thin rail beside the approved buildings.
Existing original post artwork now uses tighter native source rectangles and a
**48×48 / anchor 6** logical visual box. Shared connecting faces are taller and
have half-width **0.40**, with the same number of quads and painter layers.

This changes presentation. The original native ground feet, paid 2×2 footprints,
saved coordinates, tier identities, contacts, mixed-tier rules, broken gaps,
health, prices and simulation inputs remain authoritative. VIS63 separately
removes the opaque selected-wall foreground overlay; this branch's batching
options are coordinated with that normal-selection integration.

The implementation reuses the existing original art, normalizer, one-family
compiler, shared village/combat drawing and resource disposal. There is no new
image service or application dependency. It does not by itself establish the
full approved appearance, solve fixed-object placement or enable island growth.

## Route through the code

1. [`walls.js`](../../../frontend/src/art/village/walls.js) defines fifteen
   canonical post crops, their unchanged source ground feet, and the existing
   front/top/side materials. Each level uses one fitting bound across intact,
   damaged and broken states. A shorter ruin therefore stays at the same native
   pixel scale rather than expanding to fill a taller box.
2. [`normalizeRasterFrame()`](../../../frontend/src/art/village-raster.js) keeps
   aspect ratio and maps every state's source foot to logical **(24,42)**. Its
   code is unchanged. The crops retain four native pixels around alpha≥16
   artwork and include the original foot. Alpha below 16 outside those rectangles
   is excluded; this is a deliberate crop change, not a claim that every faint
   native background pixel remains in the normalized output.
3. The existing compiler produces the new 4× wall-family PNG from those raw
   originals. Only **33 declared metadata keys** change: one sheet and 32 frame
   bindings including aliases. Other compiled families and both raw wall PNGs
   remain byte-identical.
4. [`texturedWallBatches()`](../../../frontend/src/island/wall-batches.js) draws
   the true standing connections and posts. Profiles follow the real level,
   mixed joins still use the lower endpoint and broken walls keep open gaps.
   An intact connected post keeps its existing width factor; selected posts stay
   in their ordinary depth layer.
5. The fourth argument is `{selectedId: null, selectionOnly: false}`. Default
   rendering includes all rows; `selectedId` preserves the actual full selected
   post. Filtering requires explicit diagnostic `selectionOnly: true`. The game
   and VIS63's native fixture use normal rendering.
6. Health labels must clear the new artwork. Village wall indicators move from
   **2.2 to 3.2** above the ground; the legacy combat guide's wall bars move from
   **1.45×k to 2.9×k**. The unchanged canonical combat bar at 2.7 already clears
   the registered 2.625 post box at its minimum scale. No HP, color, phase,
   hiding or payment rule changes.

## Profile bounds include the actual source art

| Tier | Shared face height | Maximum rear cap including projection/lift | Native alpha≥128 post peak above its foot |
|---|---:|---:|---:|
| 1 | 1.45 | 1.71 | 2.47209 |
| 2 | 1.70 | 1.96 | 2.43199 |
| 3 | 1.95 | 2.21 | 2.45642 |
| 4 | 2.10 | 2.36 | 2.45833 |
| 5 | 2.20 | 2.46 | 2.47700 |

The highest cap is `2.20 + 0.6×0.40 + 0.02 = 2.46`. This stays below the
visible level-five post peak, as well as the logical box top **2.625**. Testing
only the transparent box would miss a cap rising above the actual authored top.
The [read-only native alpha audit](native-alpha-clearance.json) verifies all
fifteen crops against the original PNG and records every fitting calculation.

## Compiler provenance and exact artifact limits

The coordinator granted this writer one exclusive browser lease for this command:

```sh
node /workspace/reference-village-work/clearance-pass/bake-vis64-walls.mjs
```

The [exact executed wrapper](bake-wrapper-used.mjs) calls the existing
`node scripts/bake-village-art.mjs --families=walls` inside the isolated checkout.
It is archived with its original workspace paths for auditing; it is not a
runtime app entry point or a generally portable command.

The compiler emits a wall-only module/report, which the wrapper validates before
merging only owned entries into the full metadata. The prior
[baked module](baked-before.js) and [full report](bake-report-before.json) are
preserved byte-exact. The active VIS30 aggregate receives only wall input,
planning, proof, memory and compiled-file replacements, recalculated totals and
explicit replacement history. Historical transport receipts remain historical;
they do not claim the new post canvas is identical to its old shape.

- [Exact single-family native compiler report](wall-bake-report.json): source
  **`15d8362f`**, Chromium **156.0.8078.79**, 32 IDs × densities **4, 2.5, 2, 1.5**
  = 128 comparisons. Every 4× frame has zero visible/alpha pixel difference
  against its current raw normalization; all are visible. Browser errors and
  external requests are empty.
- [Wrapper integrity receipt](rebake-integrity.json) binds raw images, executed
  helper, old artifacts, new compiler report, active metadata and aggregate.
- New sheet: **1000×1008**, **1,046,956 encoded bytes**, **4,032,000 decoded bytes**.
  Compiler peak held raw-source bytes: **6,291,456**; retained decoded bytes after
  release: **0**; largest temporary canvas: **147,456 bytes**.
- Full selected world art plus unchanged terrain is now **12,950,770 bytes**.
  This is **395,912 bytes more** than the previous 12,554,858-byte selection and
  remains above the unchanged **8 MiB** effort target. The single-family report's
  lower subtotal is not the complete world's transfer cost.

## Executed checks

[Command/process receipts](checks.json) retain the exact selection and source
boundaries. Final pure checks run from committed test revision **`27bc9920`**;
build/budget/text ran on application source **`e5ad8a78`**, whose application and
public trees are unchanged by that later test-only commit. Documentation commits
can change the build stamp without changing these application trees.

| Check | Exact result |
|---|---|
| Final focused pure selection | **14 files passed; 103 tests passed; 6.43s** Vitest / 7.68s process. Includes source crops/feet, actual cap bounds, all tiers/states, exact geometry, mixed/broken topology, world/combat parity, ghost resizing, cleanup, health labels and historical/native provenance. |
| Build and spoiler guard | Exit **0**; **built in 1.02s**, 2.09s process; **245 text files, 12 protected lines, no suspect elimination data**. |
| Title budget | Exit **0**, 0.32s; **18,959 / 21,080 JS bytes**, **9,410 / 12,000 CSS bytes**, no title image. This is separate from the unmet world-art target. |
| Text lint | Exit **0**, 1.42s; **4,550 candidate strings / 535 source files; 0 errors, 8 report-only findings**. |

Tests-first receipts are retained: [API red](api-red.log), [volume red](volume-red.log)
and [health-clearance red](health-clearance-red.log). The initial API green run
also found an overly tight fixture-center bound at a connector end; its
[original failure](api-first-green-fixture-failure.log) remains. No test is
skipped, timing limit raised or gameplay assertion removed. Existing frame and
geometry expectations change to the deliberately revised presentation and are
strengthened with exact native crop and visible-source-top checks.

## Not verified here / remaining

This writer ran the bounded compiler browser proof, not an actual game journey.
The coordinator owns fresh 1280×720 and 375×812 screenshots, composition and
fixed-object/selection fixes, broader frontend/browser suites, performance and
visual acceptance. Native compilation and pure geometry tests do not establish
Safari, physical devices, sustained FPS, production persistence or complete
multiplayer success. Earlier unrelated input/pose failures remain separate.

This is a substantial wall-proportion improvement within the existing artwork;
sea/scenery fidelity, all possible user layouts and the unmet transfer target
remain limitations. All PRs stay Draft for explain-back and a different human's
current review. No PR merge, deployment, live SQL, `.env` edit or force-push occurs.

## Explain-back preparation

Follow [EXPLAIN-YOUR-CODE.md](../../contribute/EXPLAIN-YOUR-CODE.md); write personal
answers in your own words rather than treating this guide as evidence of human
understanding. Suggested reviewer: Nico for rendering, with Ianno for preserved
recovery-label behavior, subject to the team's assignment.

1. Trace one intact and one broken level-five native source foot into logical
   `(24,42)`. Why do their different crops still have the same scale?
2. Why must the highest cap include rear ground projection, and why is the
   visible native post peak a stronger bound than the logical image top?
3. Which evidence proves pixel/provenance behavior, which proves actual gameplay,
   and which release/device questions remain unanswered?
