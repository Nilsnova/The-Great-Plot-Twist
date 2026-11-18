# VIS-45: wall projection test contracts

Child [issue403](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/403) of [VIS-34 #361](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/361), for Johannes Franz Lang (`frcola`,83476@novasbe.pt). This does not replace the older WALL-45 batching evidence.

Frozen source: final-preview9f47c142. Branch `test/vis-45-wall-projection-qa`; immutable PR base `review/vis45-9f47c142`. Own only the three assigned wall test files, `tests/fixtures/wall-span-parity.json` and this spec. Runtime code and gameplay remain untouched.

## Plan and acceptance

1. Read D064, the failing full-suite assertions and the original span reference recorded by the fixture.
2. Claim the issue and Draft PR before test edits.
3. Derive expected ghost/post feet from X=1.3x+0.2z,Y=−.6z, with upright sprite dimensions/anchor unchanged.
4. Add an independent numeric span endpoint/height reference; verify it also reproduces the historical.72 position receipt before deriving D064 positions.
5. Update only position receipts; preserve old source SHA/position receipts and all logical links, layer orders, colors, indices, buffer counts, break/restore and resource ownership assertions.
6. Run focused pure tests, inspect the full diff and record exact results. No Chrome/full-suite/build claim is needed for this test-only slice.

The existing fixture identifies original per-span source `b1755351b07e5c7e76c22de199ab5ddb70068d0c`. Its four quads are top, front, side and thin upper course. Original source inspected directly with `git show`; no fixture generator is committed. The independent reference will retain thickness.56, height.95/1.15/1.45, upper-course inset.07 and lift.01. Derive vertices from each logical span's center/extents and named corners. Apply presentation to ground XY only, then add upright height before Float32 quantization. Never affine-transform an already raised point.

Risk: blindly recording actual new buffers could bless a runtime defect; require historical-reference parity and explicit hand-worked endpoint/post examples. No source changes yet; the full suite's four reported failures are the baseline. Keep Draft for parent integration and independent human review. No new packages, live services, `.env`, migrations, flags, deployments or merges.

## Implementation and exact evidence

The test-only reference helper `frontend/tests/fixtures/wall-span-reference.js` derives the four surfaces from logical center/extents and named corners; it imports neither the renderer nor the shared projection implementation. Its legacy mode reproduced all72 historical healthy/broken position hashes before D064 hashes were written. Each updated fixture layer keeps its old receipt as `legacyPositionsSha256`; `source`, `scope`, logical hashes/counts, painter orders, vertex/index counts and color/index hashes remain byte-for-byte equivalent values. Each focused test run now checks both historical reference parity and complete current numeric position buffers, alongside all existing ownership and break/restore assertions.

Hand calculations recorded directly in tests: ghost logical(1.5,6) displays at(3.15,−3.6); level5 post logical(4,3) has foot(5.8,−1.8), unchanged width3 and upright anchor.375, giving X[4.3,7.3] and Y[−2.175,−.175]. Horizontal logical top corner(0,−.28,height.95) displays at(−.056,1.118); vertical(−.28,0,height1.45) at(−.364,1.45). New coordinate tolerances are1e−10 for unquantized sprite data; Float32 span buffers still compare exactly.

From `frontend/`:

```sh
npm test -- --maxWorkers=1 tests/island/wall-builder-preview.test.js tests/island/wall-span-batches.test.js tests/island/wall-textured-batches.test.js
```

Exact result: `Test Files 3 passed (3)`; `Tests 13 passed (13)`; `Duration 1.55s`. Log: `/workspace/reference-village-work/vis45-wall-projection-qa.log`. `git diff --check` passed. An independent comparison against frozen9f47c142 confirmed all72 layer color/index/order/count receipts and all historical position receipts were preserved; no renderer output supplied the expected hashes.

No runtime defect was found or runtime source changed. Not run: build, broad frontend/backend suites, Chrome, GPU/Safari, accessibility/demo or screenshot captures. These are not claimed by this bounded pure-test follow-up; VIS42 retains the browser lane. Parent should integrate this spec claim followed by the test source commit and rerun the combined suite. Keep Draft for human review; no task-completion claim for the parent visual redesign.

Explain-back: “The camera projection changed, so the old expected drawing numbers no longer describe the intended scene. We recalculated those numbers from the documented geometry, proved the same calculation reproduces the old receipts, and kept every gameplay, topology and disposal check.”

Walkthrough questions: Why is upright height added after projecting ground? Why retain old position receipts when adding new ones? Which unchanged checks prove that this does not grant free walls or change real connections?
