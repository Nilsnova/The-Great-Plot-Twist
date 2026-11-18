# VIS31 stage four: actual compiled village and local combat

**Intermediate functional evidence; final visual acceptance remains open.**
These are twenty unchanged actual game screenshots at **1280×720** and
**375×812**, plus the complete [raw report](report.json).
[sha256.json](sha256.json) records every copied file's byte count/hash, PNG
dimensions, exact helper hashes and matching application trees. No screenshot
was painted over, resized, edited or re-encoded during packaging.

The capture passed the declared camera, paid selection/placement and local
combat checks. The breach samples still exceed the unchanged under-150 draw-call
target. Further combat/HUD polish, a fresh complete visual suite, Safari,
physical-device testing and current-head human acceptance are pending.
The [review guide](../../contribute/REFERENCE-VILLAGE-REVIEW.md) keeps those
gates separate.

## Exact source and reproducibility

| Item | Recorded identity |
|---|---|
| Captured runtime | `414559fba3efade531de71acd7f24593f65b006d` |
| Captured frontend source tree | `b765286c950b39405ebfd2767ad5c45e2af9ba4d` |
| Main-ancestry candidate | `591813762a11fa29dee9097a79811831982eb0ef`, [Draft #392](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/392) |
| Identical frontend public tree | `9306942db1050d728799cee2fbdc8e8960f14ad2` |
| Identical backend tree | `e8d128f1ed1830a052aa1407858d8d899d3cb2d8` |
| Capture helper | `074a4675b99c68a41604bb1658943f5dfb1ee067`, VIS36 [Draft #374](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/374) |

The packager verified that **frontend/src, frontend/public and backend trees
match exactly** between the captured runtime and the main-ancestry candidate.
The later ancestry/documentation/QA changes therefore do not establish a new
visual result. The helper's three file hashes match the report byte-for-byte;
the main helper and its UI/wave modules are pinned in the manifest.

Use a separate helper checkout at the recorded revision with installed locked
frontend dependencies. From its `frontend/` directory:

~~~bash
node scripts/capture-village-composition.mjs \
  /absolute/path/to/runtime-at-414559fb/frontend \
  /absolute/path/to/output reference --arranged --wave
~~~

This is a local headless Chromium capture using the existing fake API/offline
fixtures. The source helper chooses the installed Chromium or `CHROME_PATH`.
These PNGs are native viewport-sized outputs with screenshot pixel ratio 1 and
recorded high quality; the report also retains the prior adaptive drawing ratio
before each capture. This is not a native Safari or physical-phone session.
The raw report does not embed a browser-version string.

## Declared progression and authoritative actions

The local fixture starts with 8,000 coins and best wave 40 to make the catalog
available, noon lighting and seven ordinary paid buildings. That funding and
progression are declared setup, not default first-session earnings or a live
account. Four public builder quote/confirm runs pay for the 102-piece perimeter;
one 20-coin wall upgrade leaves **6,660 coins**.

Both viewports then exercise normal entry, Fit, held Tab and release, pointer
drag and an actual remote ground pick. The captain and paid layout stay fixed
during camera actions. The selected wall's real level2→3 upgrade pays another
**40 coins**, leaving **6,620**. Its portrait is a real PNG wall segment with
four tier-three components: post, front, top and side. The actual visible green
selection mesh records 32 vertices/48 indices and the selected 2×2 logical cell.

Real Move/Cancel preserves the saved wall. A separate three-cell unpaid draft
records controller cells, rendered semantic cells, logical contacts and finite
indexed buffers; batching is not mistaken for one mesh per cell. Expanded Fine
controls are checked against the **actual transformed shore/cliff clearance**,
with real visible-control hit/label measurements.

The optional arranged view then uses **four successful real API moves**, a
quoted/paid 21-piece inner run and **42 successful upgrade replies**. It adds no
saved buildings by injection. The ledger ends at **123 walls / 5,150 coins**:
21 purchases cost 210 coins, and 21 level1→2→3 upgrade pairs cost 1,260, a total
additional 1,470 coins. This is a progressed example of player layout choices,
not a new default island or free ring.

## Actual screenshots

| State | 1280×720 | 375×812 |
|---|---|---|
| Entry / Work | [Desktop](reference-entry-1280x720.png) | [Phone viewport](reference-entry-375x812.png) |
| Complete-island Fit | [Desktop](reference-fit-1280x720.png) | [Phone viewport](reference-fit-375x812.png) |
| Paid level-three wall selection | [Desktop](reference-selected-level3-1280x720.png) | [Phone viewport](reference-selected-level3-375x812.png) |
| Real Move before Cancel | [Desktop](reference-move-level3-1280x720.png) | [Phone viewport](reference-move-level3-375x812.png) |
| Three unpaid snapped wall cells | [Desktop](reference-wall-draft-1280x720.png) | [Phone viewport](reference-wall-draft-375x812.png) |
| Expanded Fine controls / real shore | [Desktop](reference-wall-draft-fine-1280x720.png) | [Phone viewport](reference-wall-draft-fine-375x812.png) |
| Arranged 123-wall paid village | [Desktop](reference-arranged-1280x720.png) | [Phone viewport](reference-arranged-375x812.png) |
| Normal bell / standing combat walls | [Desktop](wave-standing-1280x720.png) | [Phone viewport](wave-standing-375x812.png) |
| Actual projectiles / firing | [Desktop](wave-projectiles-1280x720.png) | [Phone viewport](wave-projectiles-375x812.png) |
| Actual broken wall / changed links | [Desktop](wave-breach-1280x720.png) | [Phone viewport](wave-breach-375x812.png) |

## Local wave boundary and measured results

The normal bell/card starts the fake server's frozen **legacy local-demo**
inputs, then the actual controller, deterministic simulation and renderer run.
The browser clock is accelerated. Standing walls, projectiles, a real breach,
changed logical links and the new atlas PNG sources are recorded. The fixture
fires its built defenses; this does not claim every state of all five weapon
families fired in this journey.

This is not a production V1 durable recovery wave, live account, multiplayer
synchronization, sustained-FPS benchmark or migration/flag rollout. The source
atlas receipts, isolated pixel proof and local fight answer different questions.

| Sample / result | 1280×720 | 375×812 |
|---|---:|---:|
| Entry draw calls | 116 | 116 |
| Selected-wall draw calls | 118 | 115 |
| Arranged-village draw calls | 125 | 125 |
| Wave standing draw calls | 139 | 138 |
| Wave firing/projectiles draw calls | 141 | 142 |
| Wave breach draw calls | **152** | **151** |
| JavaScript page errors | 0 | 0 |
| External requests | 0 | 0 |
| Offline console 503 messages | 1 | 1 |

The **under-150 combat target is not met at the breach checkpoint**.
[VIS39 #393](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/393) /
[Draft #394](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/394) removes
redundant wall-level stars; its later runtime must be composed and measured
separately. Compact combat-HUD work is also in progress. The single 503 console
message per viewport is retained in the report; zero page exceptions/external
requests does not mean a clean console.

## Earlier actual software and the concept reference

| Earlier evidence | Actual desktop | Actual phone viewport | Comparison boundary |
|---|---|---|---|
| [WALL24 functional baseline](../WALL-24/README.md) | [Working village](../WALL-24/working-zoom-1280x720.png) | [Working village](../WALL-24/working-zoom-375x812.png) | Earlier runtime `525c2ab4`, original source/fixture in its record. |
| [VIS33 old-art camera pair](../VIS-33-working-composition/README.md) | [Before entry](../VIS-33-working-composition/before-entry-1280x720.png) | [Before entry](../VIS-33-working-composition/before-entry-375x812.png) | The pair isolates its camera change with unchanged old art; it is not this stage's visual acceptance. |

These historical actual images are separate software/fixture records, not
pixel-matched benchmarks for the changed projection, art and arranged inventory.
The [approved generated concepts](../../design/reference-village/approved-2026-11-17/README.md)
remain **design references only**. No generated concept is included among the
twenty actual screenshots above.

## Packaging checks and remaining work

Packaging verified 21 copied input files against their originals, native PNG
dimensions, three helper SHA-256 values and three identical application trees.
It reran no app suite or browser session. The functional observations above are
quoted from the saved actual capture/report.

Keep this stage as **intermediate passed functionality**. Final stage-five
captures, battle-call and HUD improvements, fresh complete-suite/build/a11y/demo/
overlap results, device coverage and independent human acceptance must have
their own source, helper hashes and exact result lines. No merge or deployment
is claimed.
