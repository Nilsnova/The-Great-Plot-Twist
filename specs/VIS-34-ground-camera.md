# VIS-34: coherent ground, camera and picking consumers

For Johannes Franz Lang (`frcola`), assisted by the projection/wall-art agent. Component of [issue #361](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/361), following the [pure projection contract #363](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/363).

The immutable review base `cf5bcb95` includes the selected math plus the existing VIS-23 water style (`b78a4e74`, corrected by `672e3896`) and VIS-18 static-art retry (`765033d0`). Those are dependency source, not newly authored work in this component. Combat consumers and ambient/anchor consumers are separate coordinated Drafts; all must compose before visual acceptance.

## Goal and scope

Apply display X =1.3x +0.2z and display Y =−0.60z consistently to sprite feet, legacy ground planes, camera framing, inverse ground picking, footprints/ranges, selected brackets, water/coast masks, ground lighting and main game screen anchors. Upright image proportions/heights stay independent. No saved logical XZ, land, collision, payment, game rules or simulation changes.

Owned files: `world/art.js`, a small geometry/matrix helper, backdrop factories, `world/water.js` mask/uniform seam, camera, island range/Move/selection geometry and picking, and game inset/focus/forward/inverse hooks. Preserve terrain's new sea shading and static-art loading/error hunks. Selected dock supplies actual `selectionElement` / logical `selection`; root owns its UI and art policy.

## Plan

1. Apply the pure projection through the existing world compatibility export.
2. Affine-transform old64×48 ground planes with explicit exact inverse mask coordinates.
3. Transform ground shapes with positive-winding basis; keep sprites/labels upright.
4. Use inverse logical ground for taps, then projected upright bounds for picking.
5. Measure whole coast/decorative bounds for Fit/Tab and a near-Fit desktop Work view.
6. Consume actual selected-dock insets and intent-only focus; retain explicit Fit.
7. Run roundtrip, matrix/UV, bounds, picking, camera/input and unchanged-CPU checks.
8. Coordinate real desktop/phone and normal-wave captures before reference acceptance.

## Risks and gates

A partial consumer update would misplace feet, masks, aim or interactions. Combat/ambient components are required, not optional screenshots. Water must use the complete inverse matrix instead of an axis-aligned bounding box. Backdrop shear must not be lost through quaternion/scale decomposition. Explicitly preserve existing front-face winding and avoid new DoubleSide passes. Full-island Fit includes actual top and asymmetric decorative base; close phone Work remains pannable. Source tests do not establish physical-device or visual-quality acceptance.

No source changes or test runs in this component at claim time. No new packages, services, `.env`, live migrations, flags, main push, force push, deployment or merge. Keep Draft for exact evidence, explain-back and independent human review.
