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

## Implemented component and exact evidence

The world compatibility projection now moves every inherited sprite foot through the shared pure transform. Both64×48 backdrop factories retain their old pixels and apply one affine mesh matrix with `matrixAutoUpdate=false`, so Three.js never discards shear during transform decomposition. Sea and lighthouse effects share the exact world-to-backdrop UV inverse, including parent translation/scale. Ground range rings, Move footprints, lane polygons and light instances transform their actual buffers; upright labels, portraits, health bars and image heights keep their own display units.

Picking first inverts the camera tap to logical XZ; upright art boxes compare displayed feet and tap positions. The independent selected bracket never writes Move state or payment data. Main game screen anchors and walking taps use the same forward/inverse API. Selected dock measurements feed the existing inset calculation; focus happens only on a new selection intent, leaving explicit Fit and manual pan usable. `hud.update` supplies optional `managing` for the coordinated BASE-05 strip owner.

Measured whole-island Fit uses the real181-point analytic contour and asymmetric3.2-unit painted cliff base, with.4 displayed-unit margin. Current bounds are X[−28.0581,27.2467], Y[−14.8817,14.0230] (55.3048×28.9047, ratio1.9134). Desktop Work opens at1.05×that measured Fit, rather than the old absolute zoom1 that cropped the rich artwork. Phone Work opens at.9 on the cabin/heart district, remains pannable and retains complete Fit/held-Tab. This is the coordinator-selected presentation revision for D064; it does not claim the superseded.72 projection or initial zoom1 is unchanged. Full Fit includes all shore/decorative-base points and actual interactive feet; ornamental upper canopy may extend beyond it.

Run from `frontend/`:

```sh
npm test -- --maxWorkers=1 tests/world/ground-transform.test.js tests/island/projected-picking.test.js tests/player/village-camera.test.js tests/player/village-composition.test.js tests/player/village-placement-focus.test.js tests/art/coast-water.test.js tests/world/projection.test.js tests/island/wall-shaded-preview.test.js tests/island/world-cohort.test.js tests/island/wall-connections.test.js tests/map-touch.test.js tests/place-lifetime.test.js
```

Exact result: `Test Files 12 passed (12)`; `Tests 83 passed (83)`; `Duration 11.69s`. The camera tests retain complete actual-land visibility, extend the phone fit to the decorative base, and retarget old zero-X/absolute-zoom expectations to the explicitly revised presentation. Half-cell wall translation is now exactly(.75,−.30) display units; logical cells and links are unchanged.

`npm run build` completed with exit0, including the spoiler check. `node scripts/report-budget.js --check` completed with exit0: initial JavaScript18800/21080bytes; CSS9410/12000bytes; no title image and no unshipped files. From the root, `node scripts/text-lint/index.mjs`: `Text lint: 4520 candidate strings in 519 source files; 0 errors, 8 report-only findings.` `git diff --check` passed.

Not run here: Chrome/WebGL shader compilation, actual desktop/phone screenshots, full frontend suite, accessibility/demo journeys, physical Safari or device/performance checks. Root owns the sole Chrome lane and combines the pure contract, ambient/anchor Draft367 and combat Draft366 before those gates. Preserve VIS18 loading/error hunks and VIS23 sea fragment style when composing. No backend or simulation source changed.

Explain-back: “We changed the drawing coordinate system, then made ground art and taps agree with it. Old ground pixels are transformed once; buildings stay upright. Fit measures the actual coast, and Work uses that size so it opens at a useful scale. The game still saves and simulates the same logical cells.”

Walkthrough questions: Why must the coast sampler use the full inverse matrix? Why does a sprite's height stay outside the ground transform? How can Tab show Fit without erasing my panned working view?
