# VIS-30 provisional original-world asset compilation

This is software texture compilation and isolated browser pixel evidence, not a gameplay screenshot or final visual acceptance. Provisional scope: seven raw families,74 IDs. Core/progress must be appended before final activation and budget acceptance.

Source executed: `562d1199e897d4def060f5cfd9c7356d8a1e3a00`; Chromium156.0.8078.79; command from `frontend`: `node scripts/bake-village-art.mjs`. Compiler commits3a2a549a/99d3a2e1; approved input dependencies4bd02615→9f6408eb and6f495947→562d1199. The latter preserves corrected house sizes/common state fitting; it is not this task's art change. [Raw report](bake-report.json) includes full native/logical data, source/output hashes and every density result; [unmodified process log](run.log).

| Family | IDs | Original encoded bytes | Compiled encoded bytes | Compiled source dimensions |
|---|---:|---:|---:|---|
| buildings | 1 | 1,624,431 | 215,050 | 392×392 |
| houses | 9 | 2,055,185 | 1,602,640 | 984×1408 |
| landmarks | 4 | 1,191,880 | 650,386 | 1024×520 |
| services | 2 | 2,193,948 | 361,375 | 656×360 |
| nature | 8 | 2,103,968 | 781,068 | 984×880 |
| cannons | 20 | 2,301,091 | 1,134,354 | 928×1000 |
| walls | 30 | 4,493,421 | 744,024 | 1008×680 |

Frames total:15,963,924→5,488,897 encoded bytes. Including unchanged terrain2,683,357 bytes: **18,647,281→8,172,254 bytes**,56.2% smaller and below the provisional8MiB target8,388,608. This is the selected asset payload after future atomic activation/exclusion; current production output still contains raw originals, and this branch changes no runtime registration/build exclusion. New core/progress may change that result.

Summed frame-source decoded RGBA:50,327,472→19,148,544 bytes; this is not simultaneous residency. Largest compiled source5,541,888 bytes. Observed compiler/proof source-cache maximum6,291,456 bytes, with zero retained decoded bytes after every family. The12MiB pool and two-decode cap stay unchanged. Offline compiler canvases are reported separately. Baking does not reduce final logical world canvases/combat atlas dimensions, mipmapped GPU allocations or renderer passes; no FPS/device improvement is claimed. Existing40/12MiB atlas and under150 world-draw targets remain.

All74 source-normalized4× frames versus decoded compiled4× frames have **RGB delta0, alpha delta0, differing pixels0**, with nonzero visible pixels. Native output feet equal logical feet×4; virtual source padding has already been rendered into each cell. Original PNG bytes were hashed before/after and remain unchanged. Transparent gutters pass.

Lower-density two-stage filtering is **not lossless**. Across74 cases each, density2 worst alpha delta50 and worst alpha-weighted mean RGB delta3.686/255; density1.5 alpha65 and mean5.027/255. Raw RGB maxima255 include fringes; worst weighted mean is wallL5. Actual low-quality game appearance still needs review. Errors[]; external requests[].

Reproduction writes content-hash PNG names only after proofs succeed, then atomically replaces data-only `src/art/village/baked.js`. The explicit input list never discovers baked output; `--families=buildings,houses,landmarks,services,nature,cannons,walls,core,progress` can append later raw inputs when present. Encoded files must also fit the existing8MiB decoder cap. A failed rerun cannot overwrite a file referenced by old metadata. Old unreferenced compiled outputs require coordinator build-exclusion/cleanup when replacing a prior compiled set; originals remain preserved.

Focused command: `npm test -- --maxWorkers=1 tests/art/village-bake.test.js tests/art/village-baked-output.test.js tests/art/village-buildings.test.js tests/art/village-houses.test.js tests/art/village-raster.test.js tests/art/village-consumers.test.js` — **6 files/27 tests passed,1.82s**. This validates pack bounds, IDs/feet/aliases, recorded proof, original/output hashes and stale-input detection. Earlier wrong-working-directory command launches did not execute tests; corrected commands above are the reported results.

Not verified: final nine-family budget, activation/build exclusion, actual gameplay/browser4× world-atlas handoff after activation, lower-quality visual acceptance, build/cold/a11y/demo/overlap suites, Safari/physical devices or sustained performance. Root coordinates these gates. No original editing/deletion, dependency, gameplay/environment/live change, deployment or merge.

Explain-back: I prepare the same approved pictures at the largest size the renderer uses, then pack those pixels into smaller source files. Their names, logical sizes and ground feet stay the same. Temporary source images are released; final GPU work is a separate cost. Smaller views filter the baked image again, which is why I measure lower-density differences rather than call every scale identical.
