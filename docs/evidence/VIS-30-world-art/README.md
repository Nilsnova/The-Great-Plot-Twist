# VIS-30: current 9-family world-art compilation

This is software texture compilation and isolated browser pixel evidence, not a gameplay screenshot or final visual acceptance. Current selected scope: **9 raw families, 84 IDs**. Mortars are pending a separate append; core/progress and corrected level-one wall IDs are included.

Source executed: `eb157fc82bd7e1192f65d7cca439fc166bc2fed1`; Chromium **156.0.8078.79**. From `frontend`, full reproduction: `node scripts/bake-village-art.mjs`. See [compact summary](summary.json), [complete source/output hashes and pixel proof](bake-report.json), and [unmodified process log](run.log). A historical provisional 74-ID proof is retained in commit9180ca3d. Approved hero/house fitting dependencies4bd02615/6f495947, core/progress5e0e9f7b and canonical walls813a0867 are input dependencies, not this task's artwork.

| Family | IDs | Original encoded bytes | Compiled encoded bytes | Compiled source dimensions |
|---|---:|---:|---:|---|
| buildings | 1 | 1,624,431 | 215,050 | 392×392 |
| houses | 9 | 2,055,185 | 1,602,640 | 984×1408 |
| landmarks | 4 | 1,191,880 | 650,386 | 1024×520 |
| services | 2 | 2,193,948 | 361,375 | 656×360 |
| nature | 8 | 2,103,968 | 781,068 | 984×880 |
| cannons | 20 | 2,301,091 | 1,134,354 | 928×1000 |
| walls | 32 | 4,493,421 | 773,261 | 1000×816 |
| core | 3 | 1,078,155 | 892,095 | 520×1560 |
| progress | 5 | 1,200,780 | 248,278 | 840×232 |

Frame source transfer: **18,242,859→6,658,507 bytes**. Including unchanged terrain **2,683,357 bytes**: **20,926,216→9,341,864 bytes**. The effort target is **8,388,608 bytes (8MiB)** and is **NOT met** for this expanded scope. Limits were not raised. These bytes describe selected assets after future atomic activation/exclusion; this branch changes no runtime registration or production exclusion.

Summed decoded frame-source RGBA: **62,911,688→23,695,104 bytes**; this is not simultaneous residency. Largest compiled source: **5,541,888 bytes**. Every compile/proof family releases its source cache to zero; offline canvas costs are separate in the report. The 12MiB decoded pool, two-decode cap and 8MiB encoded-source cap stay unchanged. Final world canvases, mipmapped GPU allocations and renderer passes remain a separate unchanged-density cost; no FPS/device improvement is claimed. Existing 40/12MiB atlas and under-150 world-draw targets remain.

At density4 every 84-frame original-normalized versus decoded-compiled comparison is visible and **pixel exact (RGB delta0, alpha delta0)**. Native output feet equal logical feet×4; original virtual padding is already rendered. Original source PNG bytes remain unchanged and transparent gutters pass. Lower-density two-stage filtering is **not lossless**:

| Density | Cases | Maximum RGB delta | Maximum alpha delta | Worst alpha-weighted mean RGB delta /255 |
|---|---:|---:|---:|---:|
| 4 | 84 | 0 | 0 | 0.000 |
| 2.5 | 84 | 255 | 52 | 3.487 |
| 2 | 84 | 255 | 59 | 5.190 |
| 1.5 | 84 | 255 | 74 | 5.550 |

Raw RGB maxima include low-alpha fringes. Density2.5 covers a common desktop source density. Actual lower-quality game appearance still needs review; these values are reported, not hidden behind an all-scale lossless claim. Errors and external requests are both empty.

The compiler uses explicit raw inputs and never discovers generated output as a raw family. It rejects overlarge PNGs, stages content-addressed files for browser proof, checks unchanged source hashes, publishes images after success and atomically replaces data-only `src/art/village/baked.js` last. A failed run cannot overwrite an existing referenced sheet. Obsolete generated outputs are removed only after successful publication; original images stay present. Append mode, when used, validates prior raw/output hashes and retains prior per-family proof source identities rather than rebaking compiled images.

Not verified: coordinator activation/build exclusion, actual gameplay world/combat handoff after activation, lower-quality visual acceptance, build/cold/a11y/demo/overlap gates, Safari/physical devices or sustained performance. Root owns those gates. No original editing/deletion, dependency, gameplay/environment/live change, deployment or merge.

Explain-back: I prepare the same approved pictures at the largest size the renderer uses and pack those pixels into smaller source files. Their IDs, logical boxes and ground feet stay the same. Temporary source images are released; final GPU work is a separate cost. Smaller views filter the picture again, so I measure their differences rather than call every scale identical.
