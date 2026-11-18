# VIS-21 nature asset evidence

For Johannes Franz Lang (`frcola`), [Draft #350](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/350).
This is source-art and metadata evidence. Actual-game comparison remains with the
coordinator and is not inferred from a generated sheet.

The original [transparent sheet](../../../frontend/public/village/nature-v1.png)
contains oak, pine, two palms, rock, shrub, flowers and grass. [Frame metadata](../../../frontend/src/art/village/nature.js)
retains the existing logical dimensions and ground anchors. The `birch` IDs remain
palms, as in the current game. No colliders, placements, sway or fade code changes.

Native image: 1536×1024 RGBA, **2,103,968 bytes**, 6 MiB decoded before the shared
provider's density policy. SHA-256:
`c528807c91a2d79ba73ba201085ac7343a271818500421e656c3a9576b774412`.
All four corner alpha values are zero; 977,213 pixels are exactly transparent.
Crop boundaries have at most alpha2/255 and contain all substantial silhouettes.
See [read-only pixel audit](asset-audit.json) and [all three generation requests](provenance.json).

The generator did not follow the requested equal-cell layout precisely. Explicit
source rectangles describe the actual nonuniform positions instead. No offline
cropping, recoloring or alpha processing changed the final image. The first layout
revision had alpha1/255 in a corner; the strict corner test found it. A further
image-generation background removal corrected the export, keeping that test intact.

Focused command from `frontend/`:

```text
npm test -- --maxWorkers=1 tests/art/village-nature.test.js
Test Files  1 passed (1)
Tests       11 passed (11)
Duration    488ms
```

The checks bind the PNG hash/dimensions/alpha audit, constrain source memory and
transfer size, preserve the old logical frames, and reject overlapping/out-of-range
crops or invalid feet. They do not prove visual integration, captain fade, sway,
whole-game resource budgets, Safari or physical-device acceptance. Those remain
open until the shared VIS-32 provider and actual scene captures are composed.
