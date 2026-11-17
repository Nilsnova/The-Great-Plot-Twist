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
64×48 backdrop, path anchors, saved positions, navigation and footprint rules do
not change. D063 explicitly expands the old 1.4-unit decorative trial to 3.2
between coves, retaining .35 at all three approaches. The new paint grants no land.

The temporary source-image lease comes from VIS-32. `loadBackdrop` holds it only
while composing the owned canvas/texture, releases it in `finally`, and propagates
decode or painter failures. It does not retain the decoded source image or add a
GPU material/mesh to the scene. Unsupported places keep their existing route.

## Verification at the feature commit

From `frontend/`:

```sh
npm test -- --maxWorkers=1 tests/art/terrain-materials.test.js tests/art/coast-cliffs.test.js tests/island/placement.test.js
```

Actual result: **3 files passed, 17 tests passed in 1.96s**, exit 0. This checks the
committed PNG dimensions and non-overlapping source regions, stable material
placement, grass bounds/coves and unchanged analytical coast/placement behavior.

The first backdrop lifetime attempt on the isolated pinned base could not collect
because VIS-32's provider was a separate dependency; no assertions ran. Verification
then used a separate composed clone with provider commit `3b8fe1be` and the terrain
commits. The final 3.2 source run is `9bdbeb75` (the capture's later QA-only label
commit does not change application code).

```sh
npm test -- --maxWorkers=1 tests/art/terrain-materials.test.js tests/art/terrain-backdrop-lifetime.test.js tests/art/coast-cliffs.test.js tests/cartoon-art.test.js tests/island/placement.test.js tests/island/world-art.test.js tests/places.test.js tests/place-lifetime.test.js
```

Actual composed result: **8 files passed, 40 tests passed in 3.70s**, exit 0. The
strict 3.2 limit initially caught a floating-point overshoot to 3.2000000000000006;
the source interpolation was clamped, retaining the strict original assertion.
Lifetime tests cover success, painter/texture failure, failed acquisition and the
unchanged other-place route. Counts above are overlapping runs, not additive.

## Real Canvas evidence

Capture source [`e02d49054d3306280310f16ad5692748b8339327`](https://github.com/Nilsnova/The-Great-Plot-Twist/tree/e02d49054d3306280310f16ad5692748b8339327)
is pinned on `review/vis-20-proof-e02d4905`. It composes the provider and terrain,
including the reproduction helper. Run from that checkout's root:

```sh
node frontend/scripts/check-terrain-materials.mjs frontend <output-directory>
```

Actual result: `PASS: actual16/32 terrain materials, clipping, analytic top, real naval anchors and decoded-source release; 0 page errors/external requests`.

These PNGs are **isolated terrain components**, exported directly by the actual
Canvas renderer. Both sides use the same candidate 3.2 facade; Before means its
procedural fallback, not an old-software screenshot. No image file was edited.

| Density / native canvas | Before material | After material |
|---|---|---|
| 16 /1024×768 | [Before](component-before-16.png) | [After](component-after-16.png) |
| 32 /2048×1536 | [Before](component-before-32.png) | [After](component-after-32.png) |

[Raw report](report.json) and [capture hashes](capture-hashes.json) retain:

- Zero opaque pixels beyond the declared decorative bounds at both densities.
- All 5,543 sampled analytic top points visible; 17 actual simulation anchors and 21
  minimum-distance anchors remain in visual water; zero hidden anchors.
- 6,290,064 source bytes while leased; probe-owned cache bytes/entries/queue/decodes
  all return to zero after release. Actual `loadBackdrop` is exercised separately
  by the same probe; its `finally` behavior is covered by the lifetime tests.
- Changed material pixels 258,752 /1,028,782; alpha-threshold differences 24 /50.
  The latter are preserved observations, not an exact silhouette-pixel identity
  claim. The analytic land and declared profile bounds remain authoritative.

The earlier 1.4 trial's14 /43 alpha-threshold differences are preserved in the
[historical report](historical-1_4-report.json), not presented as the final 3.2 run.

## Remaining acceptance

Actual 1280×720 / 375×812 gameplay screenshots, whole captain/hull/shore-wall
occlusion, full client, build/budget, accessibility/demo/overlap, physical devices
and final visual acceptance remain with the coordinator's combined scene. The
component proof does not close those gates. No new package, service, gameplay
data, migration, production activation, deployment or merge occurred here.
