# VIS-20: original terrain materials in the playable village

Responsible teammate: Johannes Franz Lang (`frcola`). [Issue #225](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/225).
Branch `feat/vis-20-village-terrain`, pinned review base `9dc1bea505fe3b26bd56d6ad02c21a2db8bd8be9`.

Johannes approved the detailed village concepts on 17 November after rejecting
the flat painter trial. The selected world-art route is VIS-32. The coordinator
records the bounded image policy in D063; cold-title restrictions remain.

## Scope and plan

1. Generate an original terrain material sheet matching the approved reference.
2. Decode bounded source material only when the home-islet backdrop is requested.
3. Render textured grass, warm stone paths, sand and shaded cliff facets into the
   existing single backdrop canvas, clipped to its declared decorative silhouette.
4. Preserve every analytic land point, saved coordinate, path anchor, ground
   projection, walking/placement rule and shallow naval approach.
5. Check source mapping, deterministic layout, clipping, source/lifetime failures
   and existing land/placement/lifetime behavior.
6. Coordinate actual 1280×720 and 375×812 before/after captures and broader checks
   with the integration owner; generated materials alone are not runtime proof.

Owned files: `frontend/src/art/ground.js`, `coast-cliffs.js`, terrain helpers under
`frontend/src/art/village/`, and the backdrop seam in
`frontend/src/world/places/resources.js`. The art-pipeline writer owns shared
world/atlas decoding. Vegetation has a separate owner.

## Boundaries and acceptance

- Keep the 64×48 backdrop, .72 projection and analytic top from D062.
- Decorative cliff depth stays at most1.4 projected units, tapering to .35 at the
  existing east/south/west approaches; texture pixels never grant land.
- No new collision, road ownership, movement bonus, land purchase, save format,
  cost, unlock, building identity or authoritative gameplay change.
- Original runtime assets are separate from the target concept. Record the
  prompt, source, hash, pixel size and sampling rectangles.
- Keep bounded decode memory, one existing GPU backdrop texture, and explicit
  cleanup/failure behavior. No new package or service.
- Keep Draft and unmerged. A different human reviews the current revision.

## Verification and risks

Run focused terrain/land/placement/resource lifetime checks. Actual Canvas checks
must prove that textured pixels stay inside the previous decorative silhouette
and legal feet remain on the unchanged top. The important failures are an asset
load rejection/leak, an incorrectly sampled tile, aliasing at overview scale,
or texture detail that looks like a new build boundary.

Build, cold-load budget, text lint, accessibility/demo/overlap and full client
checks remain coordinated. Do not claim those checks before they run. Preserve
test timeouts, state assertions and the unchanged rendering budget.

## Explain-back

1. Why does the new terrain painting not change where the player can build?
2. How do seeded details stay fixed when the screen size changes?
3. Why is a decoded source image released after the backdrop is composed?

Implementation and runtime evidence are pending at the claim commit.
