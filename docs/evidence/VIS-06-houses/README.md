# VIS-06: original house and support-role source

For Johannes Franz Lang (`frcola`), [issue #211](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/211),
[Draft #353](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/353).

## Original source

The original transparent3×3 house sheet was generated with OpenAI `image_gen` on
17 November 2026, using the approved village concept and new cabin source for
consistent navy slate, warm timber, stone, gold and lighting. It is copied
unchanged into [`houses-v1.png`](../../../frontend/public/village/houses-v1.png).
Read-only alpha/cell inspection emits metadata only; no offline edited or cropped
image is produced and no new package is installed.

The request specified exactly9 isolated buildings with no ground/scenery, people,
text, grid, checkerboard or opaque matte: plain levels1–3, then Barracks/Tavern/
Workshop at level2, then the same roles at level3. Level2 visibly adds a side room;
level3 rises upward. Role signs retain swords/shield, tankard/awning and gear/
hammer. Every building uses a front/right three-quarter view with upper-left
light, a stone foundation and a recognizable entrance.

| Property | Measured result |
|---|---|
| Native source | 1254×1254 RGBA PNG |
| Grid | 3×3, each cell418×418 native pixels |
| Encoded size | 2,055,185bytes |
| SHA-256 | `9c7e6e80c8f8b089e2213c2274d4cf98d0d8ba7c9f1574b417855e3f4aad2585` |
| Approved plain presentation | 80×80, anchor8 |
| Approved role presentation | 96×88, anchor8 |
| Alpha at whole-sheet corners | 0 /0 /1 /0 |

[Raw source/cell report](asset-report.json) records each exact source rectangle,
solid alpha bounds at threshold240 and the measured ground foot at the cell's
center. Low alpha below16 includes faint peripheral generation noise. Every solid
building stays within a tight measured rectangle with at least12px margin. The
original418×418 source cells remain recorded, while runtime rectangles omit blank
margins. After the actual stage-one checkpoint, root approved80×80/anchor8 plain
and96×88/anchor8 role presentation boxes. Common fit bounds per related level group
retain actual silhouette growth instead of fitting every tier to equal size.
Original PNG bytes, native ground feet, saved positions and collision stay fixed.

## Mapping and runtime boundary

[`houses.js`](../../../frontend/src/art/village/houses.js) exports the agreed
VIS-32 `sheets`/`frames` data contract. All9 supported frame identities are mapped
one-to-one; role choice and level still come from the real `buildingArt()` state
selector. No new house slot, role, price, unlock, range, recovery or upgrade rule
is added. Only the approved visible presentation boxes change; collision,
interaction, original ground feet and gameplay geometry remain.

The source test compares PNG headers, dimensions and hash with the actual asset,
derives the required identities from the real level/role selector, rejects cell
aliasing, and checks measured feet and complete solid silhouettes against native
cell bounds. VIS-32 owns shared loading, atlas/world parity, density and cleanup.

## Exact checks and limits

From `frontend/`:

```sh
npm test -- --maxWorkers=1 tests/art/village-houses.test.js tests/cartoon-art.test.js
```

Result: **2 files /7 tests passed in1.47s**, exit0. Build completed in1.08s; spoiler
guard checked241 files /12 protected lines without suspect elimination data.
Cold-title transfer remains18,698 JavaScript and9,410 CSS bytes under the
unchanged21,080 /12,000 limits. Text lint records0 errors and8 existing report-only
findings. This branch supplies a declarative family; shared
registration and actual1280×720 /375×812 game captures remain coordinated work.
Generated sprite-sheet quality is supplementary and does not establish runtime
selection, physical-device performance, Safari or final human visual acceptance.

No live migration, production flag, deployment or merge occurred. A different
human reviews the current revision after Johannes's own explain-back.
