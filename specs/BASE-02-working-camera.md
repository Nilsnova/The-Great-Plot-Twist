# BASE-02: working village camera

Adds bounded local camera controls to the existing village Fit view for Johannes Franz Lang (`frcola`), tracking [BASE-02 #143](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/143). No gameplay positions, authority, projection or battle camera rules change.

## Plan and acceptance

1. Keep Fit on entry and add accessible Zoom in, Zoom out and Fit controls.
2. Keep a separate bounded village zoom/pan state; preserve exploration zoom and battle/tutorial precedence.
3. Accept wheel zoom and thresholded one-pointer drag only while management is interactive, with no Move/dialog/pause overlap.
4. Suppress building selection after a drag, including dragging back to the original point; cancel gesture state on interruption.
5. Keep the selected view bounded to today's island and adapt its center to measured HUD/caption/management insets.
6. Run focused camera/input tests and capture actual before/after at 1280×720 and 375×812 in the coordinated browser lane.

Likely files: `frontend/src/player/camera.js`, a small village input adapter, village bar/CSS, narrow game/controller hooks and picking's canceled-event guard. Risks: pointer capture cleanup, accidental selection, Move input theft, stale inset centering, exploration zoom loss. Tests cover these boundaries rather than only asserting that a new button exists.

## Status

Implementation is present; focused camera/gesture checks pass 16/16. Entering Move deliberately restores Fit and suspends gestures, preserving the existing whole-island placement/refusal flow. Actual paired browser evidence passes at both required sizes; coordinated broader verification remains with the integration lane. This bounded slice does not complete the broader BASE-02 task, future island-growth bounds, physical-phone or Safari testing. Draft and human explain-back/review remain required. No merge or deployment.

## Explain-back

I kept village navigation in the existing camera because it already owns projection and easing. Its separate zoom and pan values do not overwrite exploration zoom. A thresholded gesture adapter cancels picking after dragging, including when a finger returns to its starting point. The controls affect only presentation; building positions and payments stay on their existing paths. Today the bounds are the current static island. Land growth must provide new accepted bounds.

1. Why are village zoom and exploration zoom separate values?
2. Why does a dragged pointerup need cancellation even if it ends near its start?
3. Why does Move return to Fit, and what would be needed to support simultaneous camera/placement gestures?

## Executed checks

`npm test -- --maxWorkers=1 tests/player/village-camera.test.js tests/player/village-navigation.test.js` from frontend: `Test Files 2 passed (2)`, `Tests 16 passed (16)`, duration 681ms. These are current source tests, not live-device evidence. An initial new-test run caught listener-removal behavior and floating-point drift in reduced-motion snapping; both were fixed in source, with assertions retained.

`node scripts/text-lint/index.mjs`: `Text lint: 4419 candidate strings in 488 source files; 0 errors, 8 report-only findings.` The reports are outside this slice. `git diff --check`: clean.

Final focused command adds `tests/island/village-mode.test.js`: `Test Files 3 passed (3)`, `Tests 30 passed (30)`, duration 1.81s. Final text lint: `Text lint: 4420 candidate strings in 488 source files; 0 errors, 8 report-only findings.` [Paired actual captures and provenance](../docs/evidence/BASE-02-working-camera/README.md): both sizes pass actual Zoom/pan/wheel/Fit/Exit and 44px hit targets, with 0 page errors and 0 external requests.
