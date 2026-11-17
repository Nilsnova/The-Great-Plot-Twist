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
