# VIS-32: shared original world raster source

Responsible teammate: Johannes Franz Lang (`frcola`). [Issue #237](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/237). Branch `feat/vis-32-world-raster` starts at `9dc1bea5` and targets frozen `review/village-visual-9dc1bea5`. Johannes approved the three polished village concepts and original transparent PNG implementation before this claim. Root owns the explicit D063/GAME-V3 world-only exception and cold-screen test contract.

## Contract and ownership

Family writers own `src/art/village/{buildings,nature,defenses,walls}.js` and their original `public/village/` PNGs. Each data-only module exports `sheets` and `frames`. A sheet is `{file:'village/name-v1.png',width,height}`; a frame is `{sheet:'sheetKey',rect:[x,y,w,h],logical:[w,h,anchorFromBottom],sourceFoot:[x,y]}`. The optional native source foot defaults to the proportional logical anchor. Normalization preserves aspect and fits every side around the exact logical foot. Root serializes family imports in `src/art/village-families.js`; this branch starts that registry empty.

This writer owns the provider/decoder and shared `src/art/textures.js` / `src/world/art.js` integration. `acquireRasterSheet(def)` yields a decoded image lease with `release()`; terrain/wall writers prewarm before synchronous painting, copy to their owned canvases/textures, then release. `normalizeRasterFrame(image,frame,density)` returns the same normalized canvas source for world and combat. Current logical metrics and gameplay footprints remain unchanged; raster visual sizes override the pixel-catalog collision in a single explicit map.

## Bounded implementation

1. Validate local PNG sheet/frame metadata and decode dimensions; no remote sources or cold-screen loading.
2. Coalesce concurrent leases inside a conservative 12MiB decoded pool; release/close the final image and dispose late failures with a bounded wait.
3. Normalize native rectangles/feet into logical canvases, preserving transparency and omitting the procedural outline.
4. Feed both asynchronous world loading and combat atlas packing through the same resolver; retain unsupported/procedural fallbacks and existing sRGB/premultiplied/mipmap handling.
5. Test normalization, limits/failure/lifetime, metadata and both consumer routes; coordinate the actual provider parity/browser proof with root.
6. Report exact tests/source/assets and remaining broader visual/build/budget/human gates. No isolated sheet or concept is sufficient runtime acceptance.

No family asset/module edits, backend/placement/state changes, new packages, environment edits, live activation, migration application, deployment or merge. Keep Draft until applicable evidence, author understanding and independent human review. Split if the source/test/capture scope grows beyond a reviewable slice; do not weaken tests or silently alias incorrect damage/fire/level states.
