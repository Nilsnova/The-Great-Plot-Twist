# VIS63: selected walls keep their ordinary depth

Responsible teammate: **Johannes Franz Lang (`frcola`)**. Issue [#440](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/440).

## Goal and scope

Selecting a wall currently copies its textured post and incident spans to a global
foreground draw. This can paint opaque wall pixels over a tree or building that
stands in front. Remove that copy and retain the selected post's actual tier
artwork in its ordinary depth layer. The existing world footprint bracket and
selection dock identify the selected tile.

Base: `1bce43099cc4e78781faa0b74051d331bfe85e24`, the VIS61 review branch retaining
current main and the prior visual preview. Branch: `fix/vis-63-wall-selection`.
The claim was pushed and [Draft #444](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/444)
opened before implementation. Code and focused checks are complete; the
coordinator owns the combined native proof and actual screenshots.

## The bug and the corrected example

Ordinary wall artwork uses painter layers near `100 + z`. A tree rooted at `z=3`
is drawn at `103`; a wall at `z=0` normally appears behind it. The previous
selection helper collected the selected post and both incident connected spans,
copied their textured quads into a new mesh and drew everything at `199`. That
overrode normal occlusion even when the ground footprints did not intersect.

Now selecting a wall changes only which ordinary post keeps its full tier
artwork. In the pure regression, wall `b` at `(2,0)` changes from a straight cap
to its one real post in layer `100`. The foreground prop remains at `103`. No
opaque wall mesh appears outside the ordinary wall group. The existing world
tile bracket supplies the selection indication, with its green corners and the
selection dock identifying the exact spot.

This fixes a rendering defect, not actual placement conflicts. VIS62 separately
guards new wall placements against tree/prop obstacles. Existing saved positions
and the current island's blockers are not moved by this leaf.

## Route through the code

1. The existing world update reads its selection anchor. It passes the spot ID
   to `wallConnections.select()` and independently shows its existing bracket.
2. `select()` normalizes a nonempty string; an unchanged ID returns immediately.
   A changed ID reruns `show(lastSpots)` with the same actual spot data.
3. `show()` derives the usual contacts and validated visual rows. Its cache key
   now includes the selected ID, so a new selection rebuilds the ordinary
   geometries once; the same selection/data on subsequent frames reuse them.
4. It calls `texturedWallBatches(..., {selectedId})`. The VIS64 dependency returns
   every normal wall and keeps the selected straight segment's full real post.
   Every textured mesh keeps the renderer's original painter layer and material.
5. A changed accepted position, tier, damage state or selection disposes the old
   owned geometry before creating replacement geometry. Borrowed atlas textures
   remain borrowed; an owned atlas is released only by its owner.
6. Move, Close, visitor/battle transitions and removed state follow the existing
   world lifecycle. No second selection indicator, material or update loop is
   introduced. The unused `wall-selection.js` module is removed.

Shared renderer coordination: VIS64 owns `wall-batches.js`; argument four becomes
`{selectedId: null, selectionOnly: false}`. A selected ID retains a normal full
post, while the default returns all ordinary rows. This task owns
`wall-connections.js`, retirement of `wall-selection.js`, selection tests and only
the selection assertions in `visual-matrix-fixture.js`.

Its API dependency is `bdf54f43` (cherry-picked here as `a7df3f5e`). This branch
does not own the later VIS64 wall-height or thickness changes. The dependency
also retains its original focused failure/pass logs; those are separate from
the VIS63 receipts below.

## Native rendering fixture contract

The contact-sheet fixture previously required the same global opaque overlay.
It now constructs the existing `makeSelectionBracket()` for its standalone
scene, checks that it identifies the actual selected post, and asserts that no
`island-selected-wall` mesh exists. A traversal additionally refuses an atlas
wall texture at foreground order `150` or above.

The real WebGL call/triangle checks and hidden-wall framebuffer negative
control remain. The control hides both the ordinary walls and the bracket so
the indicator alone cannot satisfy visible-wall coverage. Fixture cleanup owns
and disposes the bracket separately. This writer syntax-checked that helper but
did not launch it; the coordinator must run its native browser proof.

## Exact focused evidence

Command, from `frontend/`:

```sh
npm test -- --maxWorkers=1 tests/island/wall-selection.test.js tests/island/selection-bracket.test.js tests/island/wall-batch-options.test.js tests/island/wall-textured-batches.test.js tests/island/wall-tier-detail.test.js tests/island/wall-connections.test.js tests/pirates/wall-connections.test.js
```

- Tests first: [raw red selection run](red-selection.log), **9 failed / 9 passed**,
  one file, **1.38s**, against the old selection wrapper with the new renderer
  API dependency. The intended no-opaque-overlay and normal selected-post
  expectations failed before the wrapper was changed.
- First combined attempt: [original log](first-green-world-fixture-failure.log),
  **63 passed / one failed**, seven files, **3.55s**. The new world test wrongly
  compared one owner-state zone snapshot across later visitor, battle and empty
  inputs. Those inputs legitimately alter zones. The corrected test retains the
  original owner selection/Move/Close invariants and independently compares each
  transition's zones/colliders immediately before and after selection update.
  No product assertion, timeout or guard was relaxed.
- Final selection: [raw green log](green-selection.log), **64 passed / seven files**,
  **2.92s**. This includes all five selected tiers, non-buttress retention,
  ordinary foreground-prop ordering, repeated selection/show caching, accepted
  tier/damage/position changes, broken gaps, invalid/missing/unbuilt state,
  art-readiness/retry, borrowed/owned disposal and the actual world bracket path.
- `node --check frontend/scripts/visual-matrix-fixture.js` passed.
- Build, budget and text commands/results are retained unchanged in
  [checks.json](checks.json), [build.log](build.log), [budget.log](budget.log)
  and [text-lint.log](text-lint.log). All exited `0`: build/spoiler guard **2.32s**,
  title budget **0.42s** (**18,959 / 21,080 JS bytes**, **9,410 / 12,000 CSS bytes**,
  no title image), text lint **1.95s** (**0 errors / 8 report-only findings**).

These are pure tests using real Three.js geometry with mocked texture loading,
plus a production build. The prop-order regression checks the actual painter
contract; it does not claim observed native pixels. No full frontend, backend,
native multiplayer, accessibility, demo, overlap or physical-device run was
performed by this writer. Root owns the actual browser/capture and integrated
checks on the composed application.

## Trade-offs, limits and handover

The selected post can be naturally occluded by an object in front, as it is
before selection. The green footprint corners and dock remain available to
identify the selected tile; the wall texture no longer cuts through that
object. This choice avoids moving real geometry or fading every foreground
building merely to show selection.

Changing the selected ID rebuilds bounded wall geometries rather than keeping
a second textured copy. Repeated updates with identical state allocate no new
geometry. No per-wall material, texture, animation or physics object is added.
Draw-count and actual appearance claims require the coordinator's native run.

All saved XZ coordinates, IDs, levels, HP, prices, placement legality and
deterministic combat remain authoritative. Main's newer path marks are
inherited unchanged from the VIS61 base. No backend, SQL, feature flag,
dependency or public asset changes occur in this task.

## Explain-back practice

This is an agent-drafted code map; Johannes must inspect the current diff and
explain it himself. It does not record rehearsed understanding or human approval.

1. A tree and wall can overlap on screen while their ground footprints do not.
   Which two painter orders decide what appears in front, and what did `199` do?
2. Why must selecting a straight non-buttress segment invalidate the ordinary
   geometry cache, and why should fifty repeats reuse the same buffers?
3. Which resources does `clear()` own, and why must it not dispose a borrowed
   atlas texture when a selection changes?

Remain Draft until actual desktop/phone evidence, human visual acceptance,
explain-back and a different human's current-revision review. Suggested rendering
reviewer: Nico, subject to the team's own assignment. No merge, deployment,
live migration application or production activation is authorized by this leaf.
