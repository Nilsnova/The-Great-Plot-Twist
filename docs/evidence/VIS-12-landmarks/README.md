# VIS-12: original bell and watchtower sources

For Johannes Franz Lang (`frcola`), [issue #217](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/217),
[Draft #355](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/355).

## Source and measured regions

One original transparent source was generated with OpenAI `image_gen` on
17 November 2026 using the approved village and cabin material references. The
unchanged [`landmarks-v1.png`](../../../frontend/public/village/landmarks-v1.png)
contains the bell pavilion and watchtower base/l4/l5. No offline image edits or
cropped image files are produced; the provider samples declared source rectangles
at runtime.

The request specified a broad bronze-bell timber pavilion with anchor plaque and
stone footing, plus three stable timber lookout tiers with navy canopy, brass
telescope and stone base. Tier 4 retains a teal pennant and tier 5 a royal-blue/gold
star. There is no occupant, cannon, scenery, text, opaque matte or checkerboard.
The artworks add no actual crew, weapon or new service.

Native size is 1254×1254 RGBA, **1,191,880bytes**. SHA-256:
`f1b8eeeadb2883b3565b47e592a722539edeb1281902955fb67650b4a819fab2`.
[Raw inspection](asset-report.json) records the actual generated row spacing,
alpha thresholds, complete meaningful bounds and measured foundation feet. The
nominal 2×2 request did not create an exact halfway row boundary, so the mappings
use measured regions rather than cutting a pennant at 627px. Source rectangles
include all alpha ≥16 plus 12px margin. Lower-alpha peripheral generation noise
remains in the unchanged original file; sheet-corner alpha is0 /0 /1 /0.

| Existing frame | Native source rectangle | Relative foot | Logical box/anchor |
|---|---|---|---|
| Bell | 112,69,459,497 | 225,483 | 56×72 /8 |
| Watchtower base | 760,8,325,558 | 161,543 | 64×128 /8 |
| Watchtower level 4 | 168,582,332,611 | 164,596 | 64×128 /8 |
| Watchtower level 5 | 742,575,357,624 | 174,609 | 64×128 /8 |

## Presentation and gameplay boundary

[`landmarks.js`](../../../frontend/src/art/village/landmarks.js) exports the shared
VIS-32 `sheets`/`frames` contract. Root approved the bell's presentation-only
56×72/anchor 8 box under VIS-04, preserving its ground point, interaction zone,
keep-out/collider and wave/input rules. Watchtower geometry and actual level
selection remain; levels 2/3 continue using the base frame. Native rectangles and
explicit source feet preserve aspect and consistent ground across world/atlas
consumers.

Registered image failures must reject clearly for retry. Unregistered artwork
retains the old procedural route; synchronous preparation placeholders normalize
their old source feet into the approved new logical box. A stretched 24×40 bell
with a shifted foot is not an acceptable substitute.

## Checks and remaining gates

From `frontend/`:

```sh
npm test -- --maxWorkers=1 tests/art/village-landmarks.test.js tests/cartoon-art.test.js
```

**2 files / 7 tests passed in 1.32s**, exit 0. The tests inspect actual PNG dimensions
and hash, derive real watchtower selections, restrict the metric override to the
approved bell, and guard complete source bounds/feet and non-overlapping regions.
Build completed in 662ms; spoiler guard checked 241 text files/12 protected lines
without suspect elimination data. Cold-title transfer remains 18,698 JavaScript
and 9,410 CSS bytes under unchanged 21,080/12,000 limits. Text lint reports 0 errors
and 8 existing report-only findings.

This supplies source and metadata. Shared provider registration, actual bell
refresh/foot/overhang/neighbors, world/phase captures at 1280×720 and 375×812,
physical-device/Safari acceptance and final human visual approval remain
coordinated gates. The generated image alone is not gameplay proof. No live
migration, production activation, deployment or merge occurred.
