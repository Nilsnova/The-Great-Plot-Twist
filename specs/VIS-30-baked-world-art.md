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

## Provisional result and final input preparation

Compiler source `3a2a549a`/`99d3a2e1` and provisional outputs `9180ca3d` implement the route. Approved cabin/house input dependencies `4bd02615`/`6f495947` are preserved separately as `9f6408eb`/`562d1199`. The executed seven-family source is `562d1199e897d4def060f5cfd9c7356d8a1e3a00`: 74 IDs pass actual Chromium4× pixels with zero difference, and transfer including unchanged terrain is 8,172,254 bytes versus 18,647,281 raw. [Exact proof/cost/filtering limits](../docs/evidence/VIS-30-world-art/README.md). Lower densities are measured and differ; no all-scale losslessness or final GPU/pass reduction is claimed.

Final preparation appends core/progress as explicit raw inputs: exact five raw files from approved coordinator source `5e0e9f7b3b06524dc75de97e282bbeb84faef463` (VIS-35 original `7deaf12c`), copied unchanged in dependency commit `bc9c848b`. No renderer hooks are copied. Nine-family/82-ID baking and the final budget result await the coordinator's sole Chromium grant after its coherent game captures; the provisional result does not include these additional assets. No central manifest or source exclusion has been changed.
