# Approved village appearance

For Johannes Franz Lang (`frcola`), VIS-01 #206. Approved on 17 November 2026
after the earlier flat-painter proof was rejected. This directory preserves the
three unedited generated concepts; [manifest.json](manifest.json) records their
actual dimensions, original filenames and SHA-256 hashes.

| View | Approved concept |
|---|---|
| Desktop village | [Overview](desktop-overview.png) |
| Selected wall and upgrade card | [Wall selection](desktop-wall-selected.png) |
| Portrait art and control arrangement | [Portrait](portrait-wall-selected.png) |

These images are design references, not implemented gameplay or native-viewport
acceptance captures. In particular, the portrait's generated aspect ratio is not
375×812. Real responsive evidence must use that actual viewport and its measured
touch targets, text, insets and selected-building visibility.

## Visual requirements

- Three-quarter miniature buildings with substantial roof/front/side volume,
  warm timber, navy slate, brass details, beveled stone and contact shadows.
- Continuous walls with readable fronts and tops, corner/end posts and material
  progression; real healthy, damaged and broken states remain distinguishable.
- Textured grass, path pavers, faceted cliffs, sand, lush foliage and coherent
  ocean foam. Decorative pixels never grant new walkable/buildable land.
- A close, readable village district in the working view. Complete-island Fit
  and Tab stay available. Phone framing can pan rather than shrinking every
  building to fit the entire island above an oversized control panel.
- Calm teal/gold HUD and parchment action cards, actual prices/health/levels,
  fully readable text and unobscured enabled controls at least44px across.

## Implementation and evidence

Build on the paid-grid/perimeter candidate `9dc1bea5`, including current main
`8759fc80`. Keep existing inventory, costs, health/recovery, deterministic combat,
captain colors, input ownership and reset/receipt safeguards. No headquarters
progression, new land, free wall ring, extra currency or new account is implied
by concept composition.

VIS-32 supplies one normalized visual source to world and combat. Each family
records native source rectangles and feet separately from logical visual boxes
and gameplay footprints. A larger visual box needs explicit bounds, anchor,
picking and muzzle/health-bar evidence; it does not enlarge a collision box.
The world-only image exception is [D063](../../../DECISIONS.md#d063--approved-reference-village-world-art--2026-11-17).

Intermediate checks compare actual rendered frames after composition, hero and
terrain, walls, then the combined village/combat. Each uses declared saved state,
lighting, quality and camera. Generated asset previews cannot pass that gate.
Correct a flat, sparse, clipped or incorrectly scaled stage before expanding it.
Final comparison is VIS-31; actual performance, atlas/decode budgets and cold
transfer are VIS-30. Existing targets remain unchanged.

No merge, deployment, live migration or production activation is authorized by
this reference record. All implementation stays in Draft for explain-back and
a different human's current-revision review.
