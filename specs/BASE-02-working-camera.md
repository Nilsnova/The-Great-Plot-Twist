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

Claimed; implementation and verification pending. This bounded slice does not complete the broader BASE-02 task, future island-growth bounds, physical-phone or Safari testing. Draft and human explain-back/review remain required. No merge or deployment.
