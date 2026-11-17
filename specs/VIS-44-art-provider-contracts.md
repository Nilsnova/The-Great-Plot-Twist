# VIS-44: native art and registered raster QA contracts

Responsible teammate: Johannes Franz Lang (`frcola`), Johannes Franz Lang <83476@novasbe.pt>. [Issue #405](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/405). Branch `test/vis-44-art-provider-contracts` starts from coordinator-frozen `9f47c14277c801d10f2c504799a72fe059b52171` and targets immutable `review/vis-44-raster-9f47c142`. This is a bounded test-only follow-up to the completed full-suite failures; D063/D064 already approve registered world imagery and explicit presentation boxes.

## Findings and invariant

`hires-art.test.js` requests `explorer` and `oak` together as lazy procedural art, but oak now prepares through the eager registered raster provider. `pixel.test.js` assumes every nonpixel name has an old `islandFrame`, excluding valid compiled core/wall IDs. Twenty-four legacy pixel catalogue IDs overlap registered imagery; some approved presentation boxes differ from their preserved native pixel files. This does not change any native file metadata or authorize arbitrary extra IDs.

Preserve all native file/header/size checks, detailed-kit hashes and transfer/decoded limits, legacy/default detail selection, procedural actor laziness and sibling-failure disposal. Expected render dimensions use registered logical metadata only for actual approved overlaps; every other pixel box remains exact. The complete `artSizes` ID set must equal the explicit pixel, procedural and compiled registries.

## Plan and proof

1. Claim issue and spec-first Draft before editing tests.
2. Keep the native/detail tests intact and make their renderer category assumptions explicit.
3. Add real active compiled-registration binding coverage without mocking the family registry; mock only decoding/Canvas for pure eager-routing, failure, cleanup and retry checks.
4. Verify registered oak/core/canonical wall preparation, exact material/source metrics, lazy procedural actor and clear failure rejection in world/atlas routes.
5. Run the two original files and focused provider/artifact tests; report exact results, source and remaining combined-suite gate.

No runtime, source asset, snapshot/fingerprint, package, environment, backend, browser, deployment or merge changes. If a real runtime defect appears, report it before expanding scope. No Chrome is needed or authorized for this slice; UI screenshots/visual acceptance are not claimed. Keep Draft for independent review and the coordinator's full-suite rerun.

## Delivered contract and exact checks

[Draft #406](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/406), claim `80174a39`, source `9527bcf57facea19bca0246f13cc877809811705` and follow-up `961618134714bb1fe12a93b7a0ae649a5716420d`. The original 307 native sprite file/header checks remain exact. All 36 detailed-kit physical dimensions, file lists, hashes, encoded/decoded limits and title/ground checks remain unchanged; none of those default detailed sprites currently needs an exception to its original geometry ratio. Twenty-four native IDs overlap registered imagery, of which fourteen have approved presentation overrides; only the runtime geometry expectation branches on registered logical metadata.

The complete rendered ID set must equal the explicit native, procedural and compiled declarations. The real active compiled registry is unmocked: every declared native rectangle, logical size and foot is checked, including compiled-only core/canonical wall IDs. Controlled decoder/Canvas tests prove eager oak/core/wall preparation and world/atlas source receipts, an unpainted lazy actor, registered failure rejection, partial material/texture/lease release, actual retry, and cleanup through the distinct later legacy-PNG failure branch. Existing unknown/unloaded sprite rejection, legacy detail/default selection and native sibling-failure checks remain intact. No runtime defect was found in the two reported failures.

Before edits, `npm test -- --maxWorkers=1 tests/hires-art.test.js tests/pixel.test.js` reproduced **2 failed files; 2 failed / 7 passed tests, 1.54s**. The initial corrected three-file run passed 13 tests in 1.96s. Independent read-only review found no weakened original checks and suggested the successful real atlas/mixed-failure cases included in the final follow-up.

Final command from `frontend`:

```sh
npm test -- --maxWorkers=1 tests/hires-art.test.js tests/pixel.test.js tests/art/registered-raster-contract.test.js tests/art/village-consumers.test.js tests/art/village-baked-output.test.js tests/art/village-raster.test.js tests/art/village-decode.test.js
```

Exact final result: **7 files passed, 33 tests passed, 2.57s**. `git diff --check` passes. No browser, build, full suite, UI screenshot, runtime artifact re-generation or live operation was run by this slice. Coordinator integration/full-suite rerun and independent human review remain; no merge.

Explain-back: The old PNG library still has its original physical dimensions. A registered world picture can use a separately approved visual box, so the test checks each contract directly. Actors keep lazy procedural rendering while registered trees/buildings must prepare their image or reject the load. On failure I verify both source leases and prepared materials are released before a retry.
