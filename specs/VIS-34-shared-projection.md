# VIS-34: shared village presentation projection

For Johannes Franz Lang (`frcola`), assisted by the projection/wall-art agent. [Issue #361](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/361). Base `cd6dc2e77218762ba512d147a860f9228aed85d6` includes the prior paid grid, wall core, original PNG provider and current visual work. This remains unmerged.

## Problem and approved boundary

The actual material checkpoint shows richer source art but fails the approved composition: the old near-circular ground fit makes a close view crop too much, and zero-shear north/south wall sides are edge-on. The approved follow-up introduces one invertible visual ground transform, while preserving all saved logical XZ, walk/build rights, colliders, payments and seeded simulation.

The starting candidate is display X = 1.4×logical x + 0.2×logical z, display Y = −0.55×logical z. Sprite images remain upright and keep independent visual size/height; ground feet use the transform. A small pure module owns forward/inverse, legacy-backdrop conversion, projected directions and measured land/decorative bounds. The old .72 convention is retained only as an explicitly named legacy texture coordinate contract. Root records the explicit D064 policy revision.

## Scope and ownership

First component: pure math, roundtrip/bounds tests and this spec. A separate stacked consumer component will apply the contract coherently if the complete source/test change exceeds about400 lines. The preview is not accepted until both are composed and actual captures pass.

Consumers include world/combat sprite feet, manual x/y conversions, camera Fit/Work/focus, ground picking, range/footprint geometry, water/coast-mask inverse, shader guide/fog coordinates, aim/interact positions and screen overlays. The old64×48 backdrop may use the affine conversion of its existing texture plane; its water mask must use the exact inverse. The existing decorative3.2 legacy projected-depth extent is converted and measured, not claimed unchanged in displayed units.

Root owns D064 and central registration. Static-art refresh owns loading/refresh/error hunks and a new helper; projection owns picking/range/preview hunks. The terrain agent owns the new VIS-23 water styling; preserve those changes when adding mask coordinates. No artwork generation, backend, package, `.env`, live migration, flag, main push, force push, deployment or merge in this task.

## Plan

1. Inventory actual ground projections and distinguish unrelated .72 style/opacity constants.
2. Define one pure forward/inverse and legacy-backdrop conversion with roundtrip tests.
3. Measure projected analytic shore plus decorative bounds; select a readable initial village frame.
4. Apply the same projection to world/combat feet and ground geometry without stretching sprites.
5. Update inverse picking, shader masks, aim/guide positions and screen overlays coherently.
6. Verify unchanged logical simulation, exact saved/placed cells, Fit/Tab/focus and input precedence.
7. Coordinate actual1280×720 and375×812 normal village and wave captures.
8. Compare against the approved target; retain Draft until reference quality and human review are supported.

## Acceptance and risk

- [ ] Forward/inverse roundtrips, positive nondegenerate determinant and bounded projected terrain/decorative extent.
- [ ] Actual pointer inputs still address the same logical cells; no paid/saved or CPU simulation change.
- [ ] All world/combat/guide/water/overlay feet agree; no one-file projection shortcut.
- [ ] Whole-island Fit and held Tab retain measured shore clearance; Work opens at a useful reference-like scale.
- [ ] Upright images, real wall openings, hull/water relationships and selected controls remain readable.
- [ ] Actual required desktop/phone evidence and exact checks recorded; no target or timeout raised.

A partial transform would break clicking, aim, masks and occlusion. Source audits and unit tests alone cannot accept the visual composition. The root coordinator owns Chrome until the lane is explicitly released. No actual captures or tests have run at claim time.

## Explain-back

1. Why can a new visual projection preserve the same saved island and deterministic battle?
2. Why must a mouse click use the exact inverse of the ground transform?
3. Why are sprite height and the old backdrop's texture coordinates different from logical ground XZ?
