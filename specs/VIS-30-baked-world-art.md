# VIS-30: compiled original world artwork

Responsible teammate: Johannes Franz Lang (`frcola`), Johannes Franz Lang <83476@novasbe.pt>. [Issue #235](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/235). Branch `perf/vis-30-baked-world-art` starts at coordinator candidate `cd6dc2e77218762ba512d147a860f9228aed85d6` and targets immutable `review/vis-30-bake-cd6dc2e7`. User-approved D063 original artwork is preserved; this task compiles its already-approved normalized frames rather than designing or editing art.

## Contract and ownership

Original PNG bytes, raw data modules and provenance remain untouched. The compiler explicitly lists raw families and accepts later families without reading its own generated output. It uses the existing browser Canvas `normalizeRasterFrame` at maximum density4, copies those normalized pixels into bounded PNG sheets with transparent gutters, and emits generated data-only frame metadata. Every ID, state, logical box and ground foot remains exact; compiled native coordinates describe the baked pixels rather than pretending the old native sheet dimensions still apply.

Each decoded output source fits12MiB and sides at most1024×2048; keep the shared decoded pool12MiB, combat atlas40/12MiB, cold-title and under150 world-draw targets unchanged. Per-family outputs preserve lazy acquisition; exact input aliases may share one compiled rectangle while all IDs remain. Raw terrain stays unchanged initially and its real bytes/decode cost count in the target roughly8MiB payload. Terrain's explicit sample rectangles prevent an uncoordinated image-path swap.

The coordinator owns central `village-families.js` activation and any atomic raw-source production-build exclusion. This branch first delivers compiler, generated PNGs/module, provenance and proof. Never delete/move/alter original PNGs or ship broken asset URLs. No package, runtime format/parser, environment, gameplay geometry, live setting, deployment or merge change.

## Plan and proof

1. Publish this scoped claim as a Draft before implementation.
2. Implement deterministic raw-input validation, max-density packing and metadata generation using existing Node/Vite/Playwright/Canvas capabilities.
3. Test packing bounds, exact ID/foot/logical identity, alias behavior, manifest immutability and unsafe-input rejection without launching Chrome.
4. In the sole coordinated browser lane, normalize approved sources, encode output PNGs, then decode and compare original4× normalized versus compiled4× pixels. Record actual lower-density differences rather than calling two-stage filtering lossless.
5. Record source/output hashes, encoded bytes, decoded bytes, pool/canvas/GPU distinctions, browser/source identities and reproducible commands. Include unchanged terrain and pending optional/new families explicitly.
6. Hand over a clean Draft for coordinator activation plus later combined build/budget/cold/full-game checks and human visual review.

Main risks: virtual source padding/state scale lost during metadata conversion; accidental recursive baking; overlarge output sources or unbounded decode; stale provenance after appending families; lower-density filtering changes; counting source sheets as GPU textures or declaring final transfer before atomic activation. Unit and isolated browser pixel proof are supplementary, not a full-game appearance/performance pass.

## Earlier provisional result and input preparation

Compiler source `3a2a549a`/`99d3a2e1` and provisional outputs `9180ca3d` implement the route. Approved cabin/house input dependencies `4bd02615`/`6f495947` are preserved separately as `9f6408eb`/`562d1199`. The executed seven-family source is `562d1199e897d4def060f5cfd9c7356d8a1e3a00`: 74 IDs pass actual Chromium4× pixels with zero difference, and transfer including unchanged terrain is 8,172,254 bytes versus 18,647,281 raw. [Exact proof/cost/filtering limits](../docs/evidence/VIS-30-world-art/README.md). Lower densities are measured and differ; no all-scale losslessness or final GPU/pass reduction is claimed.

That preparation appended core/progress as explicit raw inputs: exact five raw files from approved coordinator source `5e0e9f7b3b06524dc75de97e282bbeb84faef463` (VIS-35 original `7deaf12c`), copied unchanged in dependency commit `bc9c848b`. No renderer hooks were copied. Canonical wall-tier correction `813a08673c2f2159cb41612d1af784d157552800`, picked as dependency `a73bd188`, added two unambiguous level-one damage IDs while preserving generic legacy aliases. The nine-family/84-ID stage added requested density 2.5 to 4/2/1.5, covering a common desktop case, then passed in its coordinated Chromium slot. No central manifest or source exclusion was changed.

## Delivered 13-family scope and transport follow-up

The selected catalogue now contains **164 IDs across 13 raw families**, including all five defense types and their five tiers/four states. Approved raw mortar/harpoon/culverin/swivel dependencies are `8451e9eb`, `9d3e65df`, `77cb303c` and `dbc015f3`; their source images and provenance are unchanged. Full reproduction from `frontend`: `node scripts/bake-village-art.mjs`, then `node scripts/recompress-village-art.mjs`. Incremental `--append=family1,family2` validates prior original/module/compiled hashes, normalizer/decoder source, proof densities and browser version before reusing existing proof; compiled images are never normalized as raw inputs.

The first 13-family compilation is `6a04dbedc01bf8c6fd21d3968f4b1d7dfc320014`. The approved lossless transport helper/wrapper are `8cf4859e`/`9a52ebcc`; optimized outputs are `48bddcd2d6c7df7ad97f0dc3e02eb209174a8eab`. [Complete evidence and exact limitations](../docs/evidence/VIS-30-world-art/README.md), [compact machine summary](../docs/evidence/VIS-30-world-art/summary.json).

Selected assets including unchanged terrain: **29,819,059 raw bytes → 13,608,302 compiled bytes → 12,554,858 losslessly recompressed bytes**. The **8MiB target remains unmet**; no limit was raised. Summed decoded frame sources fall from 88,077,512 to 38,543,104 bytes; this is not simultaneous residency. Codec compression changes encoded transfer only, with no further decoded/GPU/pass saving. Original images remain present; root exclusively owns atomic runtime activation and build exclusion in Draft #381.

All 164 prior maximum-density source/compiled pixel proofs are exact. Codec checks every PNG's CRCs, bounded format, unchanged filtered scanlines and non-IDAT bytes/order, preserving every logical/native frame coordinate. It then decodes one representative per source at four densities in actual Chromium: **52 cases passed**, maximum-density RGB/alpha deltas zero, errors/external requests empty. Lower-density filtering relative to the original authoring sheet remains different and is reported rather than called lossless. Every source lease returns to zero after use. Source/decoded/canvas/GPU costs are distinguished in the evidence.

Latest focused command: `npm test -- --maxWorkers=1 tests/art/village-png-codec.test.js tests/art/village-bake.test.js tests/art/village-baked-output.test.js tests/art/village-buildings.test.js tests/art/village-houses.test.js tests/art/village-raster.test.js tests/art/village-consumers.test.js tests/art/wall-tier-identity.test.js` — **8 files / 38 tests passed, 2.41s** on optimized artifacts. A dependency's earlier raw-provider rectangle assertion failed on this isolated four-family registry; its owner corrected the contract for compiled native coordinates without dropping raw tier/state or real UV checks. The corrected test is included and passes. No browser is left running.

Repository text lint: **4514 candidate strings in 521 source files; 0 errors, 8 report-only findings**, all in untouched files. Syntax and `git diff --check` pass.

Not verified by this writer: coordinator runtime activation/build/cold budgets, actual whole-game paired captures/selection/combat, a11y/demo/overlaps, sustained hardware performance, Safari/real devices or final human visual acceptance. The wider VIS-30 task and the 8MiB target stay open. No original editing/deletion, new dependencies, gameplay/environment/live changes, deployment or merge.

Explain-back: I compile each approved picture at the largest supported density and preserve its exact ground foot. A temporary decoded sheet is released after its frame pixels are copied. PNG compression then changes how those pixels are stored, preserving their complete decoder input. That cuts transfer without claiming a reduction in final GPU work. Lower-density filtering and the unmet full-catalogue transfer target remain explicit limits.
