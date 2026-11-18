# VIS64: upright wall volume

Responsible teammate: **Johannes Franz Lang (`frcola`)**.
Issue: [#441](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/441).
Branch: `feat/vis-64-upright-walls`, stacked on VIS61's current-main-preserving
review base `1bce4309`. This is an unmerged presentation follow-up.

## Agreed scope

The previous narrow wall profile reads as a thin rail beside the approved
buildings. Refit the existing original wall posts into a taller upright visual
box, then raise and thicken the shared connecting geometry while keeping its
cap below the authored post. Preserve the exact logical foot, paid 2×2 ground
footprint, contacts, tiers, broken gaps and simulation rules.

This writer owns `art/village/walls.js`, `island/wall-batches.js`, the generated
wall-family entries in `art/village/baked.js`, its newly compiled sheet and
focused volume/frame tests. VIS63 separately owns normal selection composition
and removes the opaque global foreground overlay.

The agreed fourth argument of `texturedWallBatches` is an options object:
`{selectedId: null, selectionOnly: false}`. Normal rendering always includes all
rows; `selectedId` retains the real selected post in its ordinary depth layer.
The optional filtered mode exists only for explicit diagnostic callers.

## Verification plan

- Meaningful tests first for taller normalized posts, exact ground-foot mapping,
  all five tier profiles and projected rear/cap clearance.
- Preserve existing connected/mixed/broken topology, selected ordinary posts,
  input nonmutation and shared village/combat geometry.
- Run the existing compiler against raw `walls` only in the coordinator's
  exclusive browser lane. Preserve raw image bytes, every unrelated compiled
  family and the historical VIS30 report. Retain the new compiler proof here.
- Run applicable focused pure tests, build, title budget and text lint. The
  coordinator owns actual desktop/phone captures and broader browser checks.

## Current status

Claim only: implementation and all verification results remain pending. No
passing check, visual acceptance, live persistence or production claim is made.
All PRs remain Draft for explain-back and a different human's current review.
No PR merge, deployment or live SQL is performed.
