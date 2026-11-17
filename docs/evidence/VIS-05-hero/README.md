# VIS-05: original cabin hero source

For Johannes Franz Lang (`frcola`), [issue #210](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/210),
[Draft #346](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/346).

## Source and authorship

The original transparent sprite was generated with OpenAI `image_gen` on
17 November 2026 using Johannes's approved detailed village concept as a style
reference. It is copied unchanged into
[`buildings-hero-v1.png`](../../../frontend/public/village/buildings-hero-v1.png).
No offline image editing, cropping, background substitution or new package was
used. The native source and its alpha were inspected, not inferred from the
generated preview.

The request specified one isolated front/right three-quarter orthographic pirate
captain's lodge, navy slate roof, honey timber framing, gold brackets, amber
windows, stone foundation, centered entrance, small anchor pennant and a faint
contact shadow. It explicitly excluded scenery, people, text, UI, opaque matte
and checkerboard. The front-center foundation foot was requested at 87.5% height;
the delivered native image is measured separately below.

| Property | Inspected result |
|---|---|
| Native size / format | 1254×1254, RGBA PNG |
| Encoded bytes | 1,624,431 |
| SHA-256 | `b5fb1350f511718b901f8f8ecd2291e7e5ca7b13dce5b7376d1e1353ede1fc75` |
| Native ground foot | (627,1124), front center of the foundation |
| Runtime source rectangle / relative foot | (75,39,1108,1103) / (552,1085) |
| Solid alpha bounds (threshold240) | (89,52)–(1170,1128) |
| Corner alpha | 0 /0 /0 /0 |
| Existing logical frame | 96×96; anchor12 from the bottom |

[Raw inspection report](asset-report.json). Low alpha below16 includes faint
peripheral generation noise. The solid roof, flag, foundation and contact region
fit the logical frame after aspect-preserving source-foot normalization. Native
resolution controls material detail; it changes no world position or collider.

The actual stage-one checkpoint showed excessive blank source margins. The
coordinator approved the tight rectangle above, preserving the original PNG,
native ground point and 96×96/anchor12 logical box. The rectangle retains all
alpha≥16 plus12px margin; lower-alpha peripheral noise stays in the original
file. The next combined runtime capture decides visual acceptance.

## Integration boundary

[`buildings.js`](../../../frontend/src/art/village/buildings.js) exports the
VIS-32 `sheets`/`frames` contract. Only the existing `cabin` frame is selected. The
shared loader normalizes this original source for exploration and combat; it owns
decode, density, caching and cleanup. Unregistered families retain their original procedural route. A registered image
load failure rejects clearly for retry rather than silently replacing the
approved art; any synchronous preparation placeholder keeps the same normalized
logical foot. Nothing here introduces headquarters progression,
levels, new services, new building rights or a different Move rule.

The focused source test verifies the actual PNG header/dimensions and inspected
hash, unchanged cabin logical geometry, bounded source rectangle/foot, and solid
silhouette fit. Provider parity, failure handling, actual 1280×720 /375×812 game
captures and resource acceptance belong to the coordinated integration lane.

## Executed checks

From `frontend/`:

```sh
npm test -- --maxWorkers=1 tests/art/village-buildings.test.js tests/cartoon-art.test.js
```

Result: **2 files passed, 6 tests passed in1.13s**, exit0. Build and spoiler guard
also pass; the cold title remains18,698 JavaScript bytes and9,410 CSS bytes under
the unchanged21,080/12,000 limits. Text lint records0 errors and8 existing
report-only findings. This branch's data module is consumed by the coordinated
VIS-32 registration, so these checks do not claim a standalone live art switch.
Actual-game visual acceptance is pending; this source image alone is not gameplay
evidence.

No live migration, production activation, deployment or merge occurred. A
different human reviews the current revision after Johannes practices the spec's
explain-back questions.
