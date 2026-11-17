# VIS-30: current 13-family world-art compilation

This is software texture compilation and isolated browser pixel evidence, not a gameplay screenshot or final visual acceptance. Current selected scope: **13 raw families, 164 IDs**. All five defense families, core/progress and corrected level-one wall state IDs are included.

Source executed: `d39ba70278c7060774a7cc03aa01e44e159cf1ac`; Chromium **156.0.8078.79**. From `frontend`, full reproduction: `node scripts/bake-village-art.mjs` followed by `node scripts/recompress-village-art.mjs`. Lossless transport source: `9a52ebcce7922e4a70030440e1d8f2525269c479`; actual command `node scripts/recompress-village-art.mjs`. See [compact summary](summary.json), [complete source/output hashes and pixel proof](bake-report.json), and [unmodified process log](run.log). A historical provisional 74-ID proof is retained in commit 9180ca3d. Approved hero/house fitting dependencies 4bd02615/6f495947, core/progress 5e0e9f7b and canonical walls 813a0867 are input dependencies, not this task's artwork.

| Family | IDs | Original encoded bytes | Compiled encoded bytes | Compiled source dimensions |
|---|---:|---:|---:|---|
| buildings | 1 | 1,624,431 | 195,710 | 392×392 |
| houses | 9 | 2,055,185 | 1,447,769 | 984×1408 |
| landmarks | 4 | 1,191,880 | 584,481 | 1024×520 |
| services | 2 | 2,193,948 | 330,405 | 656×360 |
| nature | 8 | 2,103,968 | 714,854 | 984×880 |
| cannons | 20 | 2,301,091 | 1,005,906 | 928×1000 |
| walls | 32 | 4,493,421 | 651,044 | 1000×816 |
| core | 3 | 1,078,155 | 798,655 | 520×1560 |
| progress | 5 | 1,200,780 | 232,321 | 840×232 |
| mortars | 20 | 2,020,969 | 912,517 | 928×1000 |
| harpoons | 20 | 2,004,621 | 923,330 | 928×1000 |
| culverins | 20 | 2,257,251 | 1,069,222 | 928×1000 |
| swivels | 20 | 2,610,002 | 1,005,287 | 928×1000 |

Frame source transfer: **27,135,702→9,871,501 bytes**. Including unchanged terrain **2,683,357 bytes**: **29,819,059→12,554,858 bytes**. The effort target is **8,388,608 bytes (8MiB)** and is **NOT met** for this expanded scope. Limits were not raised. These bytes describe selected assets after future atomic activation/exclusion; this branch changes no runtime registration or production exclusion.

Summed decoded frame-source RGBA: **88,077,512→38,543,104 bytes**; this is not simultaneous residency. Largest compiled source: **5,541,888 bytes**. Every compile/proof family releases its source cache to zero; offline canvas costs are separate in the report. The 12MiB decoded pool, two-decode cap and 8MiB encoded-source cap stay unchanged. Final world canvases, mipmapped GPU allocations and renderer passes remain a separate unchanged-density cost; no FPS/device improvement is claimed. Existing 40/12MiB atlas and under-150 world-draw targets remain.

For all 164 frames, the original-normalized versus decoded-compiled comparison at density 4 is visible and **pixel exact (RGB delta 0, alpha delta 0)**. Native output feet equal logical feet×4; original virtual padding is already rendered. Original source PNG bytes remain unchanged and transparent gutters pass. Lower-density two-stage filtering is **not lossless**:

| Density | Cases | Maximum RGB delta | Maximum alpha delta | Worst alpha-weighted mean RGB delta /255 |
|---|---:|---:|---:|---:|
| 4 | 164 | 0 | 0 | 0.000 |
| 2.5 | 164 | 255 | 52 | 3.537 |
| 2 | 164 | 255 | 59 | 5.190 |
| 1.5 | 164 | 255 | 74 | 5.550 |

Raw RGB maxima include low-alpha fringes. Density 2.5 covers a common desktop source density. Actual lower-quality game appearance still needs review; these values are reported, not hidden behind an all-scale lossless claim. Errors and external requests are both empty.

The compiler uses explicit raw inputs and never discovers generated output as a raw family. It rejects overlarge PNGs, stages content-addressed files for browser proof, checks unchanged source hashes, publishes images after success and atomically replaces data-only `src/art/village/baked.js` last. A failed run cannot overwrite an existing referenced sheet. Obsolete generated outputs are removed only after successful publication; original images stay present. Append mode, when used, validates prior raw/output hashes and retains prior per-family proof source identities rather than rebaking compiled images.

Not verified: coordinator activation/build exclusion, actual gameplay world/combat handoff after activation, lower-quality visual acceptance, build/cold/a11y/demo/overlap gates, Safari/physical devices or sustained performance. Root owns those gates. No new packages, authoring-image edits/deletions, gameplay/environment/live changes, deployment or merge.

Explain-back: I prepare the same approved pictures at the largest size the renderer uses and pack those pixels into smaller source files. Their IDs, logical boxes and ground feet stay the same. Temporary source images are released; final GPU work is a separate cost. Smaller views filter the picture again, so I measure their differences rather than call every scale identical.

## Lossless PNG transport follow-up

Built-in Node zlib level 9 reduced encoded frame sources **10,924,945→9,871,501 bytes**, saving **1,053,444 bytes** after the initial bake. Every one of 13 source PNGs passes signature/chunk/order/CRC/bounds validation, exact decompressed filtered-scanline equality and exact non-IDAT chunk-byte/order equality. Original authoring images were not edited. All 164 frame IDs, logical/native rectangles and ground feet remain identical. Per-file encoded, scanline and metadata SHA256 values are in the report.

Actual Chromium proof decodes the recompressed source for one representative per sheet at 4/2.5/2/1.5: **52 cases**, 4× RGB/alpha deltas 0; errors `[]` and external requests `[]`. This supplements, rather than reruns, all 164 prior source-normalization proofs, which remain valid through exact PNG decoder-input equality. Lower-density differences relative to original authoring images are inherited unchanged; the codec adds no further pixel change. Runtime activation/build exclusion and whole-game acceptance remain coordinator Draft #381, not a production deployment.
