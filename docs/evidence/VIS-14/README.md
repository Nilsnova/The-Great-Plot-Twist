# VIS-14 dimensional wall artwork: implementation evidence

For Johannes Franz Lang (`frcola`); [issue #219](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/219), [Draft #347](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/347). This is an unmerged wall-art slice on the existing perimeter candidate `9dc1bea5`. Actual integrated reference-style acceptance is separate from the asset and geometry checks below.

## Original source artwork

Two original image_gen assets are copied unchanged into `frontend/public/village/`:

- `walls-posts-v1.png`: five intact tiers, their damaged variants and five low rubble piles. A second image_gen edit removed the studio background; read-only alpha analysis records957,516 completely transparent pixels of 1,572,864, with near-opaque object interiors. No offline Python/Pillow image editing was used.
- `walls-surfaces-v1.png`: opaque wood, sandstone, gray stone, gold/slate and gold/blue masonry facade, coping and side samples. The runtime UV crops remain inside each authored material cell.

[Native sizes, bytes and SHA-256 hashes](assets.json) identify the exact files. These production source sheets are not screenshots of the game. Image generation used the user-approved `exec-a07561c7-7dbd-4f08-b8f4-55ebaa15ab65.png` selected-wall reference: richly shaded stylized 3D materials, consistent upper-left light, bevels and contact depth; no third-party game artwork is imported. The original generator outputs remain under `/workspace/generated_images`.

## Runtime design

The shared VIS-32 provider supplies the same original frames to exploration, combat and preview consumers. This task owns only its family data and wall presentation hooks; central family registration is coordinator-owned. Registered-art load failure must remain visible/retryable through the coordinated error UI, not silently count as accepted painted artwork.

The approved wall **presentation** box is 48×32 logical pixels with anchor 6; its old paid 2×2 footprint and exact ground coordinate are unchanged. Native source pixels and feet are explicit metadata. Original unregistered fallback frames retain their old box. Five level mappings and all healthy/damaged/broken identities remain distinct.

Connected spans keep the original WALL-45 position/index buffers and exact painter orders. The new material maps UVs onto the real top/front/side planes. Each piece also has owned-cell end/isolated panels; those panels cannot extend past its footprint or invent a neighbor link. Long equal-level straight runs use low coping instead of a tall pier at every cell. Corners, ends, T junctions, mixed levels and damaged pieces retain piers. Zero-health pieces draw low rubble and no intact span or end panel.

World wall posts share atlas quads within their existing 100+z depth layers; spans stay in their original averaged-z layers. Transparent camera-facing quads use one double-sided pass. Public `wallLinks` diagnostics still describe 106 logical contacts in the measured 102-piece ring, independently from draw meshes; `wallPosts` identifies the actual piece states. Ground picking remains the existing authoritative `pickAt` path.

World owns its dedicated bounded wall texture and disposes it once. Combat borrows its existing atlas texture and does not dispose that shared map. Late world completion after disposal releases the produced texture. The draft borrows its world's texture and takes the registered frame height/foot. Existing health, repair, ownership, prices, upgrades, collision and simulation are unchanged.

## Checks and remaining acceptance

Executed from `frontend/`:

```sh
npm test -- --maxWorkers=1 tests/island/wall-textured-batches.test.js tests/island/wall-connections.test.js tests/island/wall-span-batches.test.js tests/pirates/wall-connections.test.js tests/pirates/rebuilt-wall-look.test.js tests/island/world-art.test.js tests/island/world-cohort.test.js tests/island/wall-builder-preview.test.js
```

**8 files passed; 47 tests passed in 3.52s; exit 0.** `npm run build` completed, including the spoiler guard; `node scripts/report-budget.js --check` exited 0. Root text lint: **4,508 candidate strings / 503 source files, 0 errors, 8 existing report-only findings**; exit 0. No full frontend or browser pass is inferred from these focused checks. Current checks cover native crop/foot bounds, per-tier ruin IDs, old/new span-buffer parity,102posts/106contacts, painter orders, UV bounds, breach/rubble/repair, stale starting-health rejection, unknown-combat links and resource lifetime. Existing fallback topology and original WALL-45 hash fixtures remain in the test run.

No Chrome run is claimed here at this checkpoint. The root coordinator owns the sole integrated browser lane and actual 1280×720 / 375×812 before/after captures. Those captures must verify post/span height, transparent edges, corners/gaps, actual wall selection/upgrades/breach and reference quality before this task can be accepted. Native PNGs, generated concepts and fake-texture unit tests alone do not close that gate.

The earlier measured 235 calls and under-150 target are not changed by this documentation. New batching is implemented, but no new draw-call/FPS/device pass is claimed without measurement. Safari, physical devices, production assets, live saves, deployment and human review remain unverified. No agent merge or production change occurred.

## Fractional-density follow-up

A focused regression reproduced the world atlas using 213 logical rows even though a density of 2.5 produces a rounded 533px canvas. The helper now derives its UV extent from actual pixel dimensions / density, matching combat's convention (213.2 rows), without changing frame feet, positions or gameplay. Registered decode failures still propagate to the visible retry path; an incomplete unregistered family creates no texture. The new case failed before the fix, then the complete nearby run passed **9 files / 50 tests in 3.17s; exit 0**. Build/spoiler guard and cold-title transfer checks passed again after this correction. Actual integrated captures remain pending.
