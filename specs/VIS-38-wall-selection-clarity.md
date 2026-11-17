## Goal

Address the actual selected-wall reference mismatch in the composed game: the ground corners disappear beneath the wall base and the dock portrait shows a narrow post instead of a recognizable wall segment.

Parents: [VIS-31 #236](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/236) and [BASE-06 #147](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/147). Responsible teammate: Johannes Franz Lang (`frcola`), assisted by one selection-polish agent in a separate clone. Coordinator authorized this bounded followup after inspecting `stage-03-compiled/reference-selected-level3-1280x720.png` at source `c5d9774b`.

## Scope and expected files

- `frontend/src/island/selection-bracket.js`: portable thick green corner strips with a dark outline; preserve the actual affine-projected 2×2 ground tile and selected spot identity. At most two batched draw calls, no collider/pick behavior or per-frame geometry allocation.
- `frontend/src/island/building-portrait.js`: compose a current-tier wall segment from the existing normalized post and surface frames. Preserve PNG source receipts and async late/disposal/error semantics. Other building portraits retain their current frame behavior.
- Focused geometry/lifetime/provenance tests and a bounded spec.

No edits to central registrations, `world.js`, `index.js`, `game.js` or capture helpers. No fake HP/prices, new app package, source-PNG editing, gameplay, paid-tile change, production activation or merge.

## Acceptance

- Bright outlined corners remain readable above the selected wall base on desktop and phone while tracking its exact ground tile under the shared affine transform.
- Corner geometry/materials are allocated once, reused while moving selection, and disposed once; hidden or disposed brackets do not reappear.
- The portrait shows a real current-tier wall segment and carries receipts for the post plus its material surfaces, using existing `paintIds` normalization.
- Stale portrait completions cannot replace the current selection; disposal invalidates pending work; source failure stays neutral and can retry through the existing render lifecycle.
- Focused meaningful pure checks/build pass. Browser checks wait for the coordinator's explicit Chrome slot; actual composed captures remain required for visual acceptance.

## Handover

Keep the PR Draft for Johannes's explain-back and a different human's current-revision review. No main push, force push, merge, deployment, live migration, production flag change, .env change or new dependency. Nothing here claims final mockup acceptance from geometry tests alone.
