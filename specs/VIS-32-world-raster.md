# VIS-32: shared original world raster source

Responsible teammate: Johannes Franz Lang (`frcola`). [Issue #237](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/237). Branch `feat/vis-32-world-raster` starts at `9dc1bea5` and targets frozen `review/village-visual-9dc1bea5`. Johannes approved the three polished village concepts and original transparent PNG implementation before this claim. Root owns the explicit D063/GAME-V3 world-only exception and cold-screen test contract.

## Contract and ownership

Family writers own `src/art/village/{buildings,nature,defenses,walls}.js` and their original `public/village/` PNGs. Each data-only module exports `sheets` and `frames`. A sheet is `{file:'village/name-v1.png',width,height}`; a frame is `{sheet:'sheetKey',rect:[x,y,w,h],logical:[w,h,anchorFromBottom],sourceFoot:[x,y]}`. The optional native source foot defaults to the proportional logical anchor. Normalization preserves aspect and fits every side around the exact logical foot. Root serializes family imports in `src/art/village-families.js`; this branch starts that registry empty.

An optional `fitBounds:[left,top,right,bottom]` declares native extents from the foot, defaulting to the actual source rectangle. All four finite extents must contain the crop. Virtual transparent padding lets a shorter broken-state crop retain the intact-state scale without including an adjacent sprite; it never changes source pixels or the ground foot. Root explicitly approved this extension; `c1f548e936863391b250677925d4dd44099a13b7` adds validation, immutable metadata, normalization, browser receipts and an intact/broken parity regression.

This writer owns the provider/decoder and shared `src/art/textures.js` / `src/world/art.js` integration. `acquireRasterSheet(def)` yields a decoded image lease with `release()`; terrain/wall writers prewarm before synchronous painting, copy to their owned canvases/textures, then release. `normalizeRasterFrame(image,frame,density)` returns the same normalized canvas source for world and combat. Registered visual metrics take precedence over the old pixel catalogue in both routes. Family writers and the coordinator explicitly approve presentation-only size changes; gameplay footprints, placement coordinates and colliders remain unchanged.

## Bounded implementation

1. Validate local PNG sheet/frame metadata and decode dimensions; no remote sources or cold-screen loading.
2. Coalesce concurrent leases inside a conservative 12MiB decoded pool; release/close the final image and dispose late failures with a bounded wait.
3. Normalize native rectangles/feet into logical canvases, preserving transparency and omitting the procedural outline.
4. Feed both asynchronous world loading and combat atlas packing through the same resolver; retain unsupported/procedural fallbacks and existing sRGB/premultiplied/mipmap handling.
5. Test normalization, limits/failure/lifetime, metadata and both consumer routes; coordinate the actual provider parity/browser proof with root.
6. Report exact tests/source/assets and remaining broader visual/build/budget/human gates. No isolated sheet or concept is sufficient runtime acceptance.

No family asset/module edits, backend/placement/state changes, new packages, environment edits, live activation, migration application, deployment or merge. Keep Draft until applicable evidence, author understanding and independent human review. Split if the source/test/capture scope grows beyond a reviewable slice; do not weaken tests or silently alias incorrect damage/fire/level states.

## Implementation and verification

Provider `3b8fe1be7a6e6c30a7b41a2fe6d121f70626ff0f`, consumers `605a2caf7b49a500248af544c775ef79defd2002`, and browser proof helper `69df948ac3f61570265b0eca2bd45b6bd5daeb52` are committed. The central family registry is intentionally empty on this isolated branch; the coordinator imports family modules when assembling the combined review candidate.

The pool reserves at most 12MiB decoded pixels and two concurrent decodes. Requests coalesce; final release closes the decoded source with no idle retention. A 15-second deadline rejects callers, aborts the request and retains its reservation until late decoding settles. Local PNG path, byte/header/dimension and frame bounds checks reject invalid input. Prepared sheets are copied one at a time, then released. Registered PNG load failures reject clearly and permit a later retry; only unregistered IDs retain procedural/pixel fallback. A synchronous legacy stand-in is explicitly marked `unprepared-placeholder`, never reported as loaded PNG art. Existing texture color space, alpha, filtering and mipmap behavior remains.

From `frontend`, ran:

```sh
npm test -- --maxWorkers=1 tests/art/village-raster.test.js tests/art/village-consumers.test.js tests/art/village-decode.test.js tests/cartoon-art.test.js tests/tower-damage-art.test.js tests/island/world-art.test.js tests/island/house-level-art.test.js tests/pirates/art.test.js tests/hires-art.test.js
```

Latest result after virtual fit bounds: **9 files passed, 44 tests passed, 6.06s** (previous consumer handoff: 43 tests, 5.91s). Coverage includes matching normalized world/atlas sources and metrics, native/logical separation, exact off-center ground foot, equal intact/broken state scale, missing registered asset rejection/retry, decoded dimension rejection, concurrency/coalescing, queue and late timeout lifetime. These are unit tests with recorded canvases, not a real-PNG screenshot claim.

The supplementary browser helper is ready: `(await import('/scripts/village-raster-fixture.js')).verifyVillageRasterFrames(['cabin'])`. It checks actual PNG source receipts, visible pixels, logical foot/metrics and world-versus-atlas pixel parity at three requested densities, disposing its owned materials. The coordinator runs it on the combined registered candidate in the sole Chromium lane. Actual full-game desktop/phone screenshots, total world/atlas memory, build/budget/cold-screen checks and human visual acceptance remain combined-candidate gates. This branch alone does not prove the approved visual target has been reached.

Explain-back: I give exploration and combat the same prepared picture and foot point. A native image can be large while its logical building size stays small. I release the temporary decoded sheet after copying the frames, and I show a load error if a registered image fails. The generated picture itself comes from the separate family task. We can add another family by registering its metadata without changing this loader.
