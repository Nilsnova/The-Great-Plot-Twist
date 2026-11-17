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
