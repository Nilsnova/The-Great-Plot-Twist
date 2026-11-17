# VIS-07 cannon source evidence

For Johannes Franz Lang (`frcola`), [Draft #354](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/354).
These are source-art and metadata checks. Actual-game appearance and the changed
visual box still require the coordinator's intermediate world/combat comparison.

## Asset and state contract

The [original transparent sheet](../../../frontend/public/village/cannons-v1.png)
contains five cannon levels, each intact, firing, damaged and broken. Wood/iron,
stone foundations, brass and the higher naval ornament retain distinct silhouettes.
The [family definition](../../../frontend/src/art/village/cannons.js) maps all20
existing canonical IDs, including `island-cannon-fire-lN` and
`island-cannon-lN-damaged`/`-broken`.

The approved VIS-04 visual box is **56×48, anchor7**; the old registry's
48×32/5 remains available as procedural fallback. The gameplay footprint stays
2×2. These image coordinates do not change coins, unlocks, aim, HP or collision.
The coordinator owns consistent world/combat bounds, muzzle/health offsets and
picking evidence before accepting the enlarged artwork.

The PNG is1536×1024 RGBA, **2,301,091 bytes**, **6MiB** native decoded.
SHA-256: `34d114e147b363bbef131b407d762d7006201a9d4c0cd89a3d01aa12238f48bf`.
835,586 pixels are alpha0; all canvas corners are alpha0. Authored crop edges
have at most alpha4/255, retaining antialiasing while preventing visible neighboring
frames. Opaque-looking interiors reach alpha254; exact255 is not required.

The first source's fired base and damaged smoke nearly touched. A spacing-only
export was rejected because it added more faint matte. The accepted cleanup on
the original retained the designs/positions and muzzle flashes while removing
floating baked gray smoke. Existing game smoke effects remain. The export is
copied unchanged; [generation provenance](provenance.json) and the
[read-only pixel audit](asset-audit.json) record the exact source.

## Stable state fitting

All four poses of a level share one root-relative `fitBounds` extent. Clean
broken-row crops start at/after nativey800 and retain their true foot, while virtual
transparent headroom keeps the same scale as intact/firing/damaged poses. Without
that distinction, a tall broken crop could include the previous row or a shorter
crop could enlarge the wreck. VIS-32 validates that fitting bounds contain every
actual crop and never uses them to clip image content.

## Executed checks and limits

`npm test -- --maxWorkers=1 tests/art/village-cannons.test.js` from `frontend/`:
**1file /29tests passed in528ms**, exit0. Tests bind source hash/RGBA/bounds,
actual canonical names, approved visual metrics, all pose bands and disjoint crops,
feet, native transfer/memory limits and common per-level fitting extents.

`npm run build` passed in2.24s, including spoiler guard241text files/12protected
lines with no suspect elimination data. `node scripts/report-budget.js --check`
passed: initial JavaScript18,698/21,080bytes, CSS9,410/12,000bytes. This is the
cold-title transfer gate, not a composed world-memory or frame-rate acceptance.

The [shared-provider probe](provider-probe.json) executes VIS-32's actual
`collectRasterFrames`/`normalizeRasterFrame` at source
`bfc7f08c4b7aa28d20c9f5fe65cfb94adae555c5`: all60 metadata cases at densities1.5,2,4
retain logicalfoot(28,41), identical scale per level across all states and contained
crops. Its canvas is a recording stub: **it does not render pixels or prove game
appearance**.

Actual1280×720/375×812 game images, world/atlas pixel parity, material quality,
source lifetime under travel, full atlas budgets and device/Safari acceptance
remain separate coordinator checks. No merge, deployment, production activation
or database work occurred.
