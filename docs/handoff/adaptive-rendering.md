# Adaptive rendering budget

Nils's detailed-art release keeps original high-density textures and the full bounded framebuffer
on capable devices. The coordinator's serial software-renderer comparison found that drawing the
native desktop frame could lower cadence from 57 FPS to 15 FPS. This follow-up calibrates the
internal drawing resolution using sustained active frame intervals. It does not change the CSS
viewport, camera framing, world geometry, texture sources, input or simulation speed.

## Integration contract

`createRenderer()` returns `sampleFrame(now, {active=true})`. The coordinator calls it with
`performance.now()` after each world render; `active` must be false during title/pause, dialogs,
rooms, travel and other blocked states. False clears stale timing while retaining calibrated density.
The method returns true only when the backing resolution changed. `renderer.userData.densityScale`
records the linear scale; ordinary `quality` still controls its existing effects and upper pixel cap.

A 1.5-second warmup precedes two-second windows of at least sixteen frames. Sustained averages over
38 ms reduce density toward a 31 ms budget, at most down to half the full linear density. Healthy
30/60/144 Hz keeps full density. A single stall cannot trigger a drop. Gaps over one second reset
sampling; isolated long samples are bounded, while sustained three-FPS frames can still calibrate.
Recovery adds only 0.05 after fifteen seconds of spare capacity below 21 ms, avoiding rapid oscillation.
Resizes or changed quality reset timing and retain the chosen density; repeated same-quality calls
are no-ops. Absolute high/low pixel caps and DPR limits remain intact.

## Verification

- Seven pure cadence/limits tests, including stalled frames, blocked frames, three-FPS calibration,
  stable projection, and slow recovery.
- Two actual WebGL browser tests verify high/low caps plus adaptive canvas resizing with exactly
  unchanged CSS dimensions and world bounds.
- The earlier movement/density focused suite passed with the initial implementation (25 tests over
  three files). Parent coordinator performs the final real-world serial measurement after wiring
  `sampleFrame`; synthetic cadence tests alone do not establish an achieved device frame rate.

No dependency, flag, API, database or production setting change. No push or live action in this branch.
