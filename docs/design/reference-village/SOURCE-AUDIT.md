# Current-code audit for the reference style

Read-only source audit for the reference tasks. Baseline: `724bbc41de5754007a9bcc27a5e84758540b540b`, 17 November 2026. The initial source audit was read-only. Root later ran six existing baseline test files (75 tests passed) and captured the actual local game at both required viewports. These checks cover existing behavior only; no proposed feature or production environment was validated.

## Current source and existing work

The team already merged the six first-wave village PRs through #202 and structure recovery through #203. BASE-07 is closed for level silhouettes; the other larger base-building parents remain open. The source audit found 190 remote branches and no open PR at its initial snapshot. This planning branch/PR and new tasks were created afterward.

The original user checkout remains on `feat/grid-layout-review`; it was fetched but not switched or edited. Audits use a separate detached copy of current main. An older BASE-09 paragraph describes a local GRID stone rim; that rim is not in this main. The existing issue has a prominent current-source correction rather than silently treating the old draft as implemented.

## Rendering and assets

- `frontend/src/world/art.js`: fixed `(x,-0.72*z)` projection, plane geometry, ground anchors and `100+z` ordering.
- `frontend/src/art/textures.js`: cached Canvas textures, unlit MeshBasic materials, atlas caps of 40 MiB high and 12 MiB low, bounded density. Enabling Three lights does not shade these already painted sprites.
- `frontend/src/art/paint.js`: existing paths, gradients, two-tone shading and shadow helpers. Reuse them before introducing only demonstrated material primitives.
- `frontend/src/art/island.js`: current nature, wall, weapon, house, cabin and bell painters. House-level silhouettes already exist.
- `frontend/src/art/campaign.js`, `arsenal.js`, `defenses-v2.js`, `swivel.js`, `people.js`, `fleet.js`: existing special-building, actor, naval and effect families.
- `frontend/src/island/world.js` and `frontend/src/pirates/render.js`: separate world and combat consumers. A new style must survive the phase handoff and actual damage/recovery frame mapping; changing only world TextureLoader behavior cannot update the Canvas combat atlas.

A shared frame/foot/picking agreement matters: world sizes can be overridden by pixel catalog entries, while current island picking uses approximate rectangles. A wider painted roof is not permission to enlarge the server footprint. Test real overlap selection and keep visual metadata small or avoid it when existing boxes suffice.

## Ground, coast and optional pier

`art/ground.js` already paints smooth grass/sand and fixed sandy paths, but no raised cliff faces. `world/water.js` already has turquoise shallows, foam and weather effects; refine that engine. Water uses backdrop alpha while `world/places/surfaces.js`, placement and simulation use analytic coast. An extended decorative rock silhouette therefore needs an explicit intended waterline mask rather than a false promise that every alpha pixel is walkable/buildable.

Existing edge trees already have collisions/fade. Their coordinates/radii and legal saved buildings cannot be moved just to match the concept. New shrubs/rocks can be deliberately cosmetic, with no resource/clear action. Broader clearable-object and owned-land behavior remains in BASE-19–27.

Home has no walkable dock rectangle. Directly adding `home_islet.docks` would return surface class 3 in the browser, while existing Move rejects only sea class 0 and the backend retains its ellipse: that can create a false legal preview. A usable pier needs a separate walking/build/naval/phase contract. New off-land captain positions can also affect combat reach, so such work is not called purely cosmetic.

## UI and truthful state

The existing kit already uses navy/brass/parchment/gold, and Move already snaps, validates, nudges and submits real actions. Only two new narrow UI children are needed: grid/ghost/glyph and Move portrait/directional cross. General action dock, catalogue, HUD, identity, camera and coverage stay in the existing base-building tasks with reference-specific acceptance.

The top-left swords counter is Captain level, not wave. The reference’s “Wave 14” must use real campaign/controller state with an explicit active/next/last meaning. A portrait or ghost uses current kind/level/role/damage state and does not grant a move or purchase. Full-health art, paid-repair feedback and zero-health ruins remain tied to actual approved state, including flag-off/on paths.

## Review and limits

Independent renderer and UI reviews checked the task scopes. Corrections applied before publication: design-only VIS-01 plan; accepted/rejected trial semantics; N/A painter outcome on the image route; world-and-atlas alternative proof; component-only unknown/unbuilt portrait fallback; exact overlap/zero-positive/phase scenarios; optional pier excluded from core gate.

The planning validator checks 32 unique tasks, default and alternative dependency graphs, source links,96 scenario records and 96 questions. These are documentation checks, not proof that the future style works. Each runtime task still needs its normal review, checks and actual evidence.
