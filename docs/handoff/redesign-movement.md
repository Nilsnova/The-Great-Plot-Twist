# Continuous movement and screen-density rendering · 6 Nov 2026

Owner: Nils with Codex. Branch: `feat/redesign-movement`, based on main `f91f541`.

Camera follow and explorer illustrations now retain fractional positions. The old 1/16-world-unit
rounding could leave a small camera movement permanently at zero; its baseline was reproduced
with the original module. Follow is frame-rate independent, with smoother bounded wheel zoom.
Reduced-motion tracking skips the easing. Movement starts and stops immediately, retains analogue
strength and normalized diagonals, and bounds invalid/stalled deltas. Existing swept collision
substeps keep thin walls solid. No artificial momentum or acceleration delay was added.

The renderer fills the CSS viewport with actual backing pixels instead of enlarging a roughly
400×240 buffer. At 1280×720/DPR1, the actual world buffer is 1280×720: 921,600 pixels versus the
baseline 426×240/102,240, a 9.01-fold increase. DPR is capped at 1.5 and high/low framebuffers at
2,073,600/921,600 pixels. MSAA is disabled; higher source texture detail belongs to the separate art
work. Quality changes resize immediately, while unrelated preference changes avoid buffer resets.

CSS aspect determines world framing independently of quality/backing density: twenty world units
high on desktop, with a sixteen-unit minimum portrait width. Logical positions, collisions, sprite
geometry and server/presence coordinates are unchanged. Art metadata remains the art agent's seam.
Existing renderer/camera/controller APIs remain available; no game integration hook is required.

Verification:

- 29 focused checks passed across motion, real WebGL resize/quality, existing illustration and
  pixel contracts. Checks cover fractional follow/sprite motion, 20/30/60/144 Hz distance and
  camera equivalence, immediate release, diagonal/analogue speed, stalled-frame walls, invalid
  durations, density limits and unchanged quality framing.
- Sixteen local actual-world Chromium checks passed at 1280×720, 375×812 and 320×640. Desktop
  backing density, immediate stop, both quality pixel caps, stable framing, no page errors and
  no outside requests were verified; desktop and phone screenshots were visually inspected.
- Shared-cloud software-rendering samples are **not a performance pass**. Final run sampled
  5/25/30 FPS respectively at 97 draw calls; the desktop sample overlapped another browser run.
  Earlier MSAA samples were 10/15/12 FPS. A merged serial performance check and real hardware
  assessment remain necessary; no 60 FPS or physical-device result is claimed.
- Whitespace checks pass. No dependency, schema, live setting, G9 or server change is included.

Root integration should unify every overlay's movement/interaction blocking in `game.js`.
The existing outer frame loop caps delta at 50 ms and therefore slows walking below 20 FPS;
root owns a possible 100 ms outer cap, while this controller already safely bounds 100 ms.
Root also owns final visual captures, combined build/spoiler and the new high-detail art proof.
