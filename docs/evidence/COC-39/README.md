# COC-39 evidence

The real gameplay wiring now exposes a bounded, read-only **Last defense report** menu entry after a completed island wave. See [the specification](../../../specs/COC-39-defense-report.md) for authority, limits, event semantics and actual checks.

Screenshot generation is prepared in `frontend/scripts/capture-defense-report.js`. It captures the unchanged pause menu before the feature is mounted and this branch's real report after a controlled `createWave` run, at 1280×720 and 375×812. This is component evidence, not a live production backend session.

Captures are pending the coordinated browser slot. No missing screenshot is claimed as completed. Root coordinates the final full-suite/build/a11y/demo results.
