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
This task is claimed before implementation. Code and checks are pending.

## Plan

1. Keep all normal wall surfaces at their existing `100 + z` painter depths.
2. Remove the opaque selected-wall foreground allocation and its borrowed material.
3. Rebuild ordinary batches when the selected ID changes so its real post remains visible.
4. Reuse the existing exact-tile world bracket without adding another indicator.
5. Update the native rendering fixture to assert the new selection contract.
6. Verify ordinary depth, exact inputs, real tier/state, selection lifecycle and disposal.
7. Record the focused results and leave actual game screenshots to the coordinator.

Shared renderer coordination: VIS64 owns `wall-batches.js`; argument four becomes
`{selectedId: null, selectionOnly: false}`. A selected ID retains a normal full
post, while the default returns all ordinary rows. This task owns
`wall-connections.js`, retirement of `wall-selection.js`, selection tests and only
the selection assertions in `visual-matrix-fixture.js`.

## Evidence and limits

No implementation or test result is claimed yet. The coordinator owns Chrome,
desktop/phone screenshots and combined application checks. This branch does not
change paid coordinates, HP, prices, footprints, placement or combat rules. VIS62
separately addresses actual tree/prop placement conflicts. All PRs remain Draft;
human explain-back and different-human review precede readiness or merge.
