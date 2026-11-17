# VIS-23: nautical water and the decorative shoreline

Responsible teammate: Johannes Franz Lang (`frcola`). [Issue #228](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/228).
Branch `feat/vis-23-nautical-water`, review base `9dc1bea505fe3b26bd56d6ad02c21a2db8bd8be9`.

Johannes approved the detailed village concepts and authorized implementation.
VIS-20 provides the textured raised island; this separate slice keeps the
existing water engine and refines its visible material.

## Scope and plan

1. Preserve the backdrop-alpha distance field, coordinate mapping and explicit
   open-sea fallback after travel or a failed coast read.
2. Replace long, thin parallel streaks with restrained two-dimensional ripple
   highlights and caustic detail in high quality.
3. Tune the existing depth colors and break the secondary foam naturally around
   the actual decorative cliff foot.
4. Keep the shared weather/beam uniforms and sea clock, including boss pace and
   reduced-motion time zero. Low quality adds no glints, caustics or moving foam.
5. Verify coast reset/translation, shared uniform ownership, clock/quality behavior
   and resource disposal; coordinate actual GPU/game evidence with root.

Owned runtime file: `frontend/src/world/water.js`. No terrain, renderer projection,
world position, spawn/landing, collision, combat timing, economy, save format,
package, service, image dependency or backend change.

## Acceptance and risks

- Foam follows the visible cliff base and stays out of opaque terrain.
- Home → another place → home refreshes the existing shared field, including an
  unreadable/missing backdrop fallback with no rectangular ghost shoreline.
- Low quality/reduced motion retain the documented effect policy.
- One existing water mesh/material/coast texture; no extra draw or owned resource.
- Real shader compilation and actual desktop/phone evidence are distinct from
  unit checks. No FPS/device claim without measurement.
- Keep Draft and unmerged for explain-back and a different human's review.

## Explain-back

1. Why does foam read the decorative cliff foot instead of player land ownership?
2. What prevents a previous island's coast from remaining after travel?
3. How do low quality and reduced motion affect the new water detail?

The shader refinement and focused regressions are implemented. From `frontend/`:

```sh
npm test -- --maxWorkers=1 tests/art/coast-water.test.js tests/g20-weather-wiring.test.js tests/weather.test.js
```

Actual result: **3 files passed, 71 tests passed in 1.02s**, exit0. This checks
distance/orientation, travel/reset/fallback, shared beam/weather/quality state,
the existing paced/reduced-motion clock and owned-resource disposal. Actual GPU
compilation, rendered coast/quality/motion checks and combined scene captures are
still pending; the unit result is not visual acceptance.
