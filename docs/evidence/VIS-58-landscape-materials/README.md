# VIS58 landscape material checks

Used by: Johannes Franz Lang (`frcola`) and reviewers of [Draft PR #431](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/431), for [issue #429](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/429). This records the bounded landscape change, not acceptance of the entire visual phase.

## Change and source

Base: `6c87b8dcd2d7a1bb5376c3b64bbede27a144479e`, the current-main-preserving VIS57 review checkpoint. Runtime checkpoint: `b0c63cf480ac739cfc46c6ed3b28aaca563bc5d8`.

The change reuses the original terrain PNG and its four exact inset rectangles. Grass detail blends at 0.6 instead of 0.82, allowing the broad green lighting underneath to lead. Path texture cells grow from 4×2.88 to 5.5×3.96 world units; the path and clearing masks retain their original coordinates and widths. Cliff faces retain the existing polygons, profile, depth and coves, with warmer upper light, deeper lower shade and less contrast in the regular strata lines. The original stroke alpha is retained; reducing contrast uses RGB colors instead.

The no-material fallback keeps its original painting parameters. The water shader, projection, source asset, ownership/disposal, collision and game state are unchanged by this leaf.

## Exact local results

- Intended red check: one failed / three passed in `landscape-materials.test.js`, 472 ms. The new larger-paver expectation failed on the original 4×2.88 sampling. [Raw log](red.log).
- First focused pass: **6 files / 25 passed**, 2.49 s Vitest duration, 3.57 s process. Tested the working-tree bytes subsequently committed as `d890411a`, with HEAD still at the planning claim. [Raw log](focused.log).
- Final focused pass after retaining the original stroke alpha: **6 files / 25 passed**, 1.47 s Vitest duration, 2.48 s process. These working-tree bytes were subsequently committed as `b0c63cf4`. [Raw log](focused-alpha-preserving.log).
- `node --check scripts/capture-landscape-parity.mjs`: exit 0, 0.03 s. Syntax only; this does not execute Chromium.
- `npm run build`: exit 0, 2.10 s process. Spoiler guard: **244 text files, 12 protected lines, no suspect elimination data**. [Raw log](final-build.log).
- `node scripts/report-budget.js --check`: exit 0, 0.25 s. Title: **18,932 JS / 9,410 CSS bytes / no title image**, within the unchanged limits. This does not close the separate world-art transfer target. [Raw report](final-budget.log).
- `node ../scripts/text-lint/index.mjs`: exit 0, 1.36 s. **4,550 candidate strings in 534 source files; 0 errors, 8 report-only findings**. [Raw log](final-text-lint.log).

Final syntax/build/budget/text checks ran at the frozen `b0c63cf4` checkpoint. [Metadata and raw-log hashes](final-checks.json) distinguish process durations from test-runner durations. [Manifest](manifest.json) records file hashes and the exact inherited cliff/surface receipts.

The six focused files cover source regions and sampling, unchanged path masks, exact pinned cliff/surface receipts, original top/depth/naval windows, real coast-field mapping, shared weather/quality/time controls, projection and source-decode ownership/failure cleanup. No test timeout, expected graphics quality, placement rule or combat assertion was relaxed.

## Native and actual-game evidence

The isolated browser helper is [capture-landscape-parity.mjs](../../../frontend/scripts/capture-landscape-parity.mjs). It serves an owned blank page before Vite's application fallback, imports the actual terrain painter, reads the exact committed PNG and captures its output at density 28. It requires identical SHA-256 values for every alpha byte, the threshold-128 coast mask, the original PNG and the fallback RGBA; every profile coordinate and source crop must also match. RGB must change, so a no-op cannot satisfy the proof.

Run from the helper's `frontend/` directory with the two frozen frontend paths:

```sh
CHROME_PATH=/usr/bin/chromium node scripts/capture-landscape-parity.mjs <before-frontend> <after-frontend> <output-directory>
```

**Pending coordinator evidence:** this writer has not run Chromium, the native alpha comparison, actual desktop/phone captures, accessibility, demo, the full frontend suite or multiplayer. The coordinator owns the browser lease and will test the composed source. Do not treat isolated painter proof as an actual-game or live-account check. Before/after images must use the same paid fixture, time and camera before the parameter choices are accepted.

## Explain-back and limits

Review notes for Johannes to validate in his own words: this change adjusts how the ground is painted, rather than where the player can walk or build. A larger texture cell makes each source paver larger; it does not widen the clipping path. Rock shading is painted inside the existing face polygons, so changing its RGB values must not create land. The browser proof checks that separation, while real-game captures show whether the result is visually better.

Rehearsal questions, not a claim that rehearsal is complete:

1. Why can a larger texture cell leave a path's width unchanged?
2. Why must the alpha/coast-mask checks stay strict when only colors are intended to change?
3. What does an isolated painter capture fail to prove about the full game and a real device?

The art remains a projected, shaded raster presentation. Exact concept parity, physical-device/Safari behavior, sustained performance and final human visual acceptance remain open. This leaf adds no asset download or renderer object; it does not claim the overall 8MiB effort target is met. Keep Draft for Johannes's review/explain-back and a different human's current-revision approval. No PR/main merge, deployment, live migration or production activation was performed.
