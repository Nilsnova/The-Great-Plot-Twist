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

The coordinator explicitly approved the small redesign-movement expectation updates as the same D064 display contract. A phone management journey may explicitly use the real Fit control to view the entire island; D064's working phone view is intentionally pannable and does not promise every remote tower is initially on screen. Preserve every movement, remote-selection, pending-admission, focus, Escape and geometry assertion.

## Risks and evidence

Screen projection and legacy paint coordinates are different contracts. Do not turn old decorative depths into logical land or assert a function merely equals itself. Native pointer helpers may consume the runtime projection; pure expected positions remain independent numbers. New native failures must be reported, not hidden with forced clicks, greater timeouts, skipped checks or extra player relocation.

Initial verification pending. The coordinator owns the original full-run failure log and final complete frontend/build lane. No native passing claim is made by this specification.

## Explain-back

The game changed its display angle, while saved logical positions stayed fixed. A pointer test must ask the same projection as the displayed world where a building is drawn. A strict pure position test must independently state the expected new display coordinates. Painted cliff depth stays in its original paint units and uses its separate legacy conversion.

Before readiness: Why can the old helper miss despite correct saved XZ? Why is paint depth not logical land? Why does a phone remote-selection journey use the real Fit control?
