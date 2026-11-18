# VIS-42 — Runtime-projected native test helpers

QA correction for Johannes Franz Lang (`frcola`, `83476@novasbe.pt`), tracking #399, child of VIS-34 #361.

## Problem and boundary

The coordinator's frozen full run at `9f47c14277c801d10f2c504799a72fe059b52171` timed out waiting for a cannon card because `village-game.test.js` still clicks the old `(x, -0.72z)` screen location. D064 now displays `(1.3x + 0.2z, -0.6z)`. Correct test instrumentation; change no product runtime.

Use separate clone `projection-qa`, branch `test/vis-42-runtime-projection`, immutable review base `review/vis-42-projection-9f47c142`. Claim and Draft precede source changes. No new package, environment, migration, main/force push, merge or deployment.

## Plan and scope

1. Inspect every test `.72` match; retain weather coordinates, weapon timing and intentional legacy paint units.
2. Replace actual native pointer formulas in village-game, nearby-game and nearby-interactions with imported runtime `projectGround`/`projectPoint` instrumentation. Pick actual persisted anchors where available.
3. Measure the wall-builder test's painted top and decorative base with runtime `projectLegacyGround`; preserve the actual clear-workspace assertion.
4. Keep strict explorer/camera display expectations in redesign-movement, using independently computed explicit D064 numbers, preserving logical movement, inverse/precision and motion checks.
5. Add a bounded actual-picking regression proving the old helper misses while the correct projected pointer reaches the intended building.
6. Rerun pure checks first; native Chrome only after the coordinator explicitly releases its full-suite lane. Run exact changed journeys with unchanged timeouts and assertions.

The coordinator explicitly approved the small redesign-movement expectation updates as the same D064 display contract, then added illustration, art/coast-cliffs and player/tab-overview expectations after the full run exposed those same stale assumptions. Their terrain elevation/physics, strict legacy paint geometry, Tab restoration, tour priority and precision assertions remain. A phone management journey explicitly uses the real Fit control to view the entire island; D064's working phone view is intentionally pannable and does not promise every remote tower is initially on screen. Preserve every movement, remote-selection, pending-admission, focus, Escape and geometry assertion.

## Risks and evidence

Screen projection and legacy paint coordinates are different contracts. Do not turn old decorative depths into logical land or assert a function merely equals itself. Native pointer helpers may consume the runtime projection; pure expected positions remain independent numbers. New native failures must be reported, not hidden with forced clicks, greater timeouts, skipped checks or extra player relocation.

## Verification record

- The coordinator's original frozen full run records both cannon-card timeouts, old wall draft cells, false fine-position cells and land bottom 603.23 below the available panel boundary in `/workspace/reference-village-work/final-checks/frontend.log`. No original assertion or limit was removed. The bounded pure actual-picking regression additionally shows old cannon point `(-12.5, 11.14)` misses and runtime-projected point `(-19.15, 9.4)` picks the same saved anchor.
- Initial pure command: `cd frontend && npx --no-install vitest run tests/redesign-movement.test.js tests/island/projected-picking.test.js`: 2 files, 21 tests passed (1.95 s).
- Native command: `cd frontend && npx --no-install vitest run tests/island/village-game.test.js tests/island/wall-builder-dom.test.js tests/island/nearby-interactions.test.js tests/island/nearby-game.test.js`. First iteration exposed Vitest rewriting `import` inside serialized callbacks (6 failures, 15 passed, 76.58 s). Corrected those callbacks to the established `window.g20Import` boundary. Second iteration passed wall-builder's 10 cases and nearby-interactions' 7 cases, including the unchanged real projected-tap/payment/fine-position and stronger top+base clearance checks; four full-game helpers still failed because navigating away from the harness clears that helper (4 failures, 17 passed, 66.17 s).
- Install the same raw module helper in the real game document after navigation. Exact affected rerun: `cd frontend && npx --no-install vitest run tests/island/village-game.test.js tests/island/nearby-game.test.js`: 2 files, 4 tests passed (71.22 s). The already-passing component files and their source were unchanged. Thus all 21 affected native cases passed across the component and final full-game runs; do not describe the earlier mixed four-file run as a passing command.
- All native jobs ran serially in the explicitly granted lane. Harnesses closed browsers/servers normally; process readback found no live Chromium. The lane was explicitly released to the coordinator before the pure follow-up run. No screenshot masking, forced click, test skip, timeout increase or assertion weakening occurred.
- `cd frontend && npx --no-install vitest run tests/illustration.test.js tests/art/coast-cliffs.test.js tests/player/tab-overview.test.js tests/redesign-movement.test.js tests/island/projected-picking.test.js`: 5 files, 37 tests passed (1.74 s). The captain return keeps exact `toBe` equality against the independently computed D064 expression `1.3*12 - 0.2*8`, preserving its actual floating-point value instead of rounding it to integer 14. `git diff --check`: exit 0. Complete frontend/build and final artifact acceptance remain coordinator-owned; no whole-suite pass is claimed here.

## Explain-back

The game changed its display angle, while saved logical positions stayed fixed. A pointer test must ask the same projection as the displayed world where a building is drawn. A strict pure position test must independently state the expected new display coordinates. Painted cliff depth stays in its original paint units and uses its separate legacy conversion.

Before readiness: Why can the old helper miss despite correct saved XZ? Why is paint depth not logical land? Why does a phone remote-selection journey use the real Fit control?
