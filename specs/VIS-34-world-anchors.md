# VIS-34 — World effects and interaction anchors

Responsible teammate: Johannes Franz Lang (`frcola`, `83476@novasbe.pt`).
Issue: https://github.com/Nilsnova/The-Great-Plot-Twist/issues/361
Component base: `8cb4723719aaabbf32214a68d8591da3e7127e79`.

## Goal and contract

Use the approved shared `projectGround` presentation (`X=1.3*x+.2*z`, `Y=-.6*z`)
for ambient effects, plot clicks, landmark lights and tutorial targets. Project a
logical building foot first; apply artwork offsets afterward so sprites stay
upright. The inverse selects the same logical ground. Saved state, logical zones,
colliders, movement, travel and payments remain unchanged.

## Scope and ownership

This component owns `world/places/home.js`, `settlement.js`, `registry.js`,
`world/ambient/harbor-life.js`, `world/lighthouse.js`,
`class-demo/world-objects.js`, `tutorial/game-hooks.js`, and only the coordinate
line/import in `island/decorations.js`. VIS-35 owns its milestone artwork. The
primary VIS-34 branch owns world projection, terrain/water, camera and island
picking. The combat component owns combat consumers. No new packages or services.

## Plan and acceptance

1. Add focused failing checks for projected effects, lights, plot clicks and tutorial anchors.
2. Project complete bases and preserve upright artwork offsets and animation lifts.
3. Share actual harbor/signal/ruin beam anchors; remove the class-demo duplicate.
4. Test home plot visual picking in displayed coordinates and its existing logical state behavior.
5. Run the focused consumer/regression checks and inspect the complete diff.
6. Hand off exact hashes and limits for combined actual-game desktop/phone captures.

The change is complete only when effects and overlays follow the shared foot,
normal/reduced-motion animations retain those bases, plot taps pick the visible
building, and the unchanged logical-state tests pass. Actual screenshots and
whole-scene composition remain the primary integration branch's verification.

## Risks and limits

Projecting old drawn beam Y would also squash the lamp height; named logical feet
and separate display lifts prevent that. A partial projection rollout can still
misalign this component with the main world until integration. Browser, a11y and
demo checks are intentionally deferred to the root-owned browser lane. This PR
stays Draft; no merge, main push, deployment, live migration or flag activation.

## Component evidence

The original nine new consumer checks failed against the pre-change consumers,
then passed after implementation. A tenth check covers milestone feet and painter
order. The focused command is:

`cd frontend && npm test -- --maxWorkers=1 tests/world-anchor-projection.test.js tests/harbor-life.test.js tests/place-lifetime.test.js tests/places.test.js`

The tests exercise real Three.js scene objects and pointer events, with local
texture adapters and a canvas-only stub for the class-demo artwork. They cover
pan/zoom visual plot clicks, normal/reduced-motion effects, light/camera/tutorial
anchors and unchanged logical zones, colliders and travel. They do not render
WebGL, fetch production images, prove the combined appearance or exercise live
services. Parent integration still owns screenshots and visual acceptance.
