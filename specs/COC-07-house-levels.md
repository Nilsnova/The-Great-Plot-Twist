# COC-07: visible house levels

Responsible teammate: Johannes Franz Lang (`frcola`). Issue: [#148](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/148).

## Result

An upgraded house now changes shape. Level 2 adds a small side room; level 3 retains that room and raises the main roof over an upper row of windows. Existing Barracks, Tavern and Workshop signs still identify the selected role. A house without a role also receives the appropriate level drawing.

| State | Drawing | Existing frame box / ground anchor |
|---|---|---|
| Plain level 1 | Existing small house | 64 × 64 / 8 logical pixels |
| Plain level 2 | House with side room | 64 × 64 / 8 |
| Plain level 3 | Side room and taller main house | 64 × 64 / 8 |
| Role level 2 | Side room plus existing role details | 80 × 72 / 8 |
| Role level 3 | Taller main house plus the same role details | 80 × 72 / 8 |

Roles still start at level 2. The Barracks keeps its flag and crossed swords, the Tavern its mug and barrel, and the Workshop its gear, hammer and saw. The upper windows use each role's existing material palette.

## How the code works

1. `house(role, level)` in [island.js](../frontend/src/art/island.js) uses the existing house painter. The shared `rise` offset raises the level-3 roof, chimney and main wall; the role details remain drawn afterward.
2. `islandFrames()` registers two additional plain house frames and one level-3 frame for each role. The existing role names remain the level-2 names, preserving their callers.
3. `buildingArt()` in [world.js](../frontend/src/island/world.js) chooses the confirmed kind, level and active role. Neutral level 2/3 houses have their own frames; a valid level-3 role adds the `-l3` suffix.
4. The island art request includes the new role frames before `apply()` uses them. The existing lazy material mechanism paints frames on first use and the existing place lifetime disposes them.

The shape fits inside the prior frame box. The ground anchor, logical footprint, collider and house-role rules remain those already used by the game. No backend, price, loot, role bonus, research, unlock or recovery code changes in this task.

## Data and lifecycle boundaries

- The server's confirmed `spot.level` and `spot.spec` remain the source. The client does not infer gameplay state from an image.
- Missing, zero, negative, non-integer and nonnumeric levels use the existing level-1 fallback. A large positive level is clamped to the highest available house drawing, as other building drawings already are.
- Unknown roles use the neutral drawing for that level. A stored role at level 1 remains inactive.
- Upgrading level 2 to 3 replaces the old geometry once. Reapplying the same state reuses the current geometry; disposal releases it once.
- The separate local GRID foundation work is not reimplemented. Its integration with this branch remains a coordinated parent-agent step.

## Verification performed

Command, from `frontend/`:

```sh
npm test -- --maxWorkers=1 tests/island/house-level-art.test.js tests/island/world-art.test.js tests/pirates/houses.test.js tests/cartoon-art.test.js
```

Actual result:

```text
Test Files  4 passed (4)
     Tests  32 passed (32)
Duration  18.46s
```

The added tests cover registered frame boxes/anchors, every valid role and house level, invalid-state fallbacks, actual painted alpha-mask changes, requesting level-3 role frames, upgrade replacement, stable refresh and disposal. Alpha masks are checked in real Chromium, so changing only a color or a pip would not satisfy the silhouette assertion.

The [capture runner](../frontend/scripts/capture-house-levels.js) renders the actual before painter from Git baseline `a09787c079ba2921fb05facdecb41f61ca8ab84d` and the changed painter at both required viewports. It checks distinct silhouettes, unchanged frame metadata and the preserved level-1 silhouette. See [evidence](../docs/evidence/COC-07-house-levels/README.md).

## Limits and remaining review

The screenshots are clearly labeled art fixtures. They establish the role/level drawing matrix, not a complete gameplay or physical-device acceptance. The parent agent coordinates the combined game preview, full frontend suite, build/budget and accessibility/demo checks; those are not claimed as passed here. Safari and actual iOS/Android hardware were not tested. A human should review the original-style silhouettes and their readability in the integrated island before the draft PR is marked ready.

## Explain-back draft

**What:** “An upgraded house now looks expanded. The role sign still tells me whether it is a Barracks, Tavern or Workshop.”

**Why:** “I reused one painter and added a small level parameter, so every role keeps the same materials and details instead of maintaining separate copied buildings.”

**Limits:** “The drawing is not the gameplay footprint. It changes no reward, range or building rule, and the component screenshots do not prove the whole game works on every phone.”

**How it could change:** “A future house level could add another shape inside an agreed frame, but it would need new mapping, fallback and visual evidence. A bigger gameplay footprint would be a separate server/layout decision.”

Questions for Johannes before marking ready:

1. Why do role and level both matter when selecting a house frame?
2. What is the difference between the sprite box, the ground anchor and the gameplay footprint?
3. How do the tests show that an unchanged state does not keep replacing geometry?
