# VIS-20: original terrain material source and runtime handover

For Johannes Franz Lang (`frcola`); [issue #225](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/225),
[Draft #348](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/348).

## Source, composition and boundaries

[Source manifest](source-manifest.json) records the exact original generated
1254×1254 PNG, prompt, bytes, SHA-256 and four source rectangles. The committed
file is copied byte-for-byte. One-pixel sampling insets prevent the neighboring
material from bleeding into a resized tile. This sheet is a source asset, not
an actual gameplay screenshot or evidence of final visual acceptance.

Grass, sandstone paving, rock and beach sand are sampled directly into the
existing backdrop canvas. The same world-anchored grid is used at every density;
grass/sand mirror alternate cells to reduce visible seams. Paving is clipped to
the original path strokes and clearings. Rock is clipped to each existing cliff
facet, then shaded by that facet's existing direction and depth.

Only the cosmetic meadow boundary moves toward the cliff lip, tapering back to
the existing sandy east/south/west approach coves. Analytic land, projection,
64×48 backdrop, path anchors, saved positions, navigation, footprint rules and
the bounded1.4/.35 decorative depth do not change. The new paint grants no land.

The temporary source-image lease comes from VIS-32. `loadBackdrop` holds it only
while composing the owned canvas/texture, releases it in `finally`, and propagates
decode or painter failures. It does not retain the decoded source image or add a
GPU material/mesh to the scene. Unsupported places keep their existing route.

## Verification at the feature commit

From `frontend/`:

```sh
npm test -- --maxWorkers=1 tests/art/terrain-materials.test.js tests/art/coast-cliffs.test.js tests/island/placement.test.js
```

Actual result: **3 files passed, 17 tests passed in1.96s**, exit0. This checks the
committed PNG dimensions and non-overlapping source regions, stable material
placement, grass bounds/coves and unchanged analytical coast/placement behavior.

The new backdrop lifetime suite was attempted on the isolated pinned base and
could not collect because VIS-32's `village-raster.js` is a separate dependency.
No assertions ran in that attempt. Composed provider/terrain checks and actual
Canvas/game evidence will be added with their exact source revision.

Actual desktop/phone screenshots, texture clipping/shore-foot checks, full client,
build, budget, accessibility/demo/overlap and physical-device acceptance are not
claimed at this feature commit. The coordinator owns combined acceptance. No
new package, service, gameplay data, migration, production activation or merge.
