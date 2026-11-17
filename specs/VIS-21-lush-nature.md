# VIS-21: Shaded island vegetation

For Johannes Franz Lang (`frcola`), assisted by the nature-art agent. Tracks
[issue #226](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/226).

The approved 17 November village concepts replace the rejected flat-painter trial
with original shaded world artwork. This task starts from the unmerged perimeter
candidate `9dc1bea505fe3b26bd56d6ad02c21a2db8bd8be9`; its fixed review baseline is
`review/village-visual-9dc1bea5`. No merge or production change is authorized.

## Goal and scope

Create one coherent transparent nature sheet for the existing oak, pine, birch
(palm), tall palm, rock, shrub, flowers and grass-tuft frame IDs. Rounded foliage,
warm detailed trunks, faceted stone and soft contact shadows should match the
approved blue-roof village's light direction. Native image resolution remains
separate from each frame's logical dimensions and ground foot.

Owned files are `frontend/public/village/nature*.png`, the data-only family module
`frontend/src/art/village/nature.js`, focused asset-contract checks and this spec.
VIS-32 owns shared decoding, world/combat hooks, fallback and memory policy. The
coordinator owns the explicit world-raster policy and the combined scene. Existing
colliders, sway, captain-occlusion fade, placements, picking and gameplay remain.

## Plan

1. Claim a Draft PR and agree the shared provider contract.
2. Generate an original well-spaced transparent asset sheet from the approved
   visual reference; record prompt, hash, dimensions and generation provenance.
3. Inspect actual alpha, cell boundaries and foot positions.
4. Map existing IDs to explicit source rectangles and unchanged logical frames.
5. Check source bounds and meaningful binding/foot invariants.
6. Hand off an early usable sheet for an actual-game style comparison, then
   verify the composed scene at 1280×720 and 375×812 with the coordinator.

## Acceptance and evidence

- [ ] All eight existing nature frames have original, distinct shaded artwork.
- [ ] Transparent edges have no checkerboard or opaque rectangular background.
- [ ] Feet and logical dimensions do not drift or crop; collider radii stay .48.
- [ ] Existing sway and foreground fade remain visible without halo seams.
- [ ] Source-sheet memory and encoded bytes are reported; VIS-32 owns decoding.
- [ ] Actual game captures, source revisions and quality settings are recorded.

Generated artwork is an asset, not proof that it is rendered in the game. The
coordinator's intermediate real-scene comparison is required before visual
acceptance. Physical devices, Safari and final human acceptance remain separate.

## Explain-back

1. Why does a larger painted crown not change the collision radius?
2. Why does the existing `birch` ID show a palm?
3. How does a single shared raster definition keep exploration and combat aligned?
