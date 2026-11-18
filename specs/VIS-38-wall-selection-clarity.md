## Goal

Address the actual selected-wall reference mismatch in the composed game: the ground corners disappear beneath the wall base and the dock portrait shows a narrow post instead of a recognizable wall segment.

Parents: [VIS-31 #236](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/236) and [BASE-06 #147](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/147). Responsible teammate: Johannes Franz Lang (`frcola`), assisted by one selection-polish agent in a separate clone. Coordinator authorized this bounded followup after inspecting `stage-03-compiled/reference-selected-level 3-1280x720.png` at source `c5d9774b`.

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

## Implemented

The selected wall's green corners are now filled triangle strips rather
than device-dependent one-pixel lines. Four L corners fit the actual 2×2
tile under the shared affine projection. A separate dark silhouette gives
contrast against grass, stone and wood. Two meshes reuse their geometry
and materials, draw at orders 200/201 above wall bases, ignore raycasts and
dispose once. Repeated selection updates do not rebuild either buffer.
The visible green arms are 0.16 logical units thick and 0.64 units long;
the outline expands 0.055 units. The footprint and click target do not grow.

Wall portraits now compose the real current-tier post with its registered
front, side and top surface patches. The existing `paintIds` pipeline
normalizes all four sources before Canvas composition. The portrait keeps
its primary frame receipt and all four component receipts, so it cannot
claim a different PNG or tier. It remains a presentation of the selected
building type/level; health and prices still come from the existing model.
Other building portraits keep their existing single-frame path.

Selection tokens and caching still reject stale completions. Disposed
portraits cannot revive, and an explicit render after a loading failure
can retry the same ID while unavailable art stays neutral. No timer,
background retry loop, dependency, source-PNG edit or gameplay change.

## Exact verification

Runtime commits: bracket `0dd20831`, portrait `0c282c04`.
Native proof source: `6dd2fa1e`. From `frontend/`:

```text
npx vitest run tests/island/building-portrait.test.js tests/island/reference-controls.test.js tests/island/selection-bracket.test.js tests/world/ground-transform.test.js tests/island/selection-dock.test.js
Test Files  5 passed (5)
Tests       24 passed (24)
Duration    2.07s

VIS38_SHOTS=/workspace/reference-village-work/selection-polish-component npx vitest run --maxWorkers=1 tests/island/selection-clarity-dom.test.js
Test Files  1 passed (1)
Tests       1 passed (1)
Duration    3.37s

npm run build
Built in 1.35s
Spoiler guard: 244 text files, 12 protected lines, no suspect elimination data.

node scripts/report-budget.js --check
Exit 0; cold-title JavaScript 18,825 bytes, CSS 9,410 bytes.
```

Text lint from the root: `4538 candidate strings in 532 source files;
0 errors, 8 report-only findings`, exit 0. Existing report-only findings
were not changed.

Pure coverage checks exact projected corner dimensions and positive
winding, two reused buffers, disabled raycasts, idempotent disposal,
all five portrait tiers, actual source requests/receipt IDs, unchanged
other-building path, cache reuse, failure retry and stale/disposed work.
The native case covers both 1280×720 and 375×812, reads actual portrait
Canvas pixels and rendered WebGL green/outline pixels above a brown base.
It observes three draw calls: one fixture base plus two corner batches.
The existing harness timeout was retained; Chrome closed and its lane
was explicitly released after the test.

[Component captures and limitations](../docs/evidence/VIS-38-selection-clarity/README.md)
include unedited PNGs and their hash manifest. The fixture's level 3,
coins and upgrade cost are explicitly supplied inputs, with health
unavailable. They are not server/payment evidence.

Not verified here: root's final full-game before/after captures and visual
acceptance, full frontend suite, a11y/demo or live behavior. Keep Draft.

## Explain-back

I use filled triangles because browsers often ignore wide WebGL line
widths. Their green shape tracks the real wall tile; its dark outline and
late drawing order make it readable over the wall base. I build the wall
portrait from the same tier's real post and material patches instead of
inventing a thumbnail. Source receipts make that relationship inspectable.
An old asynchronous result cannot replace the current selection because
each render has a token, and disposal invalidates pending work.

1. Why are filled corner strips more portable than setting a line width?
2. Why must the post and all surface patches use the same actual wall tier?
3. How do tokens and disposal prevent a late portrait from changing the dock?
