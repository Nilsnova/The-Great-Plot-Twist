# Reference village: latest actual review

Responsible human: Johannes Franz Lang (`frcola`). This package contains the
coordinator's completed **stage-eight actual game capture**, its original report
and execution record, twenty unchanged final PNGs and six unchanged before PNGs.
It does not close final human visual, device or balance acceptance.

Open [comparison.html](comparison.html) for a self-contained before/after page.
It embeds **twelve exact original PNG streams**: whole-village, combat and
selected-wall comparisons at desktop and phone viewports. Three tablists have
2 / 3 / 3 choices and support click, Arrow, Home and End navigation. No image
was edited, cropped or re-encoded. The final document's native browser check is
**PENDING** until its own source/hash-specific report is supplied; the older
[eight-image document proof](../reference-village-comparison-browser/README.md)
does not validate this new twelve-image page.

## Exact application and capture boundary

| Identity | Exact value |
|---|---|
| Actual capture runtime | `91c1f9d57c1edd957d26588b99fbb1489e575127` |
| Frozen complete-check source | `52f6bb158b03188b57260c1872e273391598debf` |
| Frontend source tree | `6e0c6b27b717a7b8eedcde498d7372de6f0942cb` |
| Public tree | `9306942db1050d728799cee2fbdc8e8960f14ad2` |
| Backend tree | `c785196095edef4f5416744b46435ab564da4e9c` |
| Supabase tree | `6e52a63b87028291127dbae8c344c9f49a73896d` |
| Included main cutoff | `ee5677ff4986b671c271c85a35abcee70aa8fe59` |

All four application trees are **identical** between the captured and frozen
check sources. The intervening files are documentation/specification evidence
only; the [manifest](sha256.json) lists every changed path. The
[execution record](execution.json) identifies the actual helper checkout and
three helper hashes. The [raw report](report.json) retains the exact declared
fixture, camera/selection/placement/wave observations and diagnostics.
The capture completed successfully in **200.36 seconds**.

The [49-component Draft snapshot](pr-snapshot.json) records public branch heads
at its stated observation time. It is a review map, not a composition manifest:
the exact frozen source above determines which code/tests were checked. Later
branch variants remain separate until reconciled; in particular, the frozen
report-input test retains its original UI button clicks.

This is a separate later package. The historical
[stage-six package](../reference-village-visual-review/README.md) and
[stage-seven before record](../VIS-31-stage-07/README.md) remain unchanged.

## What the pictures compare

The village/combat before images come from the earlier VIS33/WALL24 sources.
Their declared layout has 102 paid walls / 6,660 coins before combat; the latest
arranged layout has 123 paid walls / 5,150 coins. Projection, camera, software
and paid layouts differ. These are whole-game progress comparisons, not isolated
pixel-matched performance benchmarks.

The Selected wall scene uses stage seven as its before source:
`5e3dd6cc`, frontend `d40e9c78`, backend `e61fa1b8`. Its level-three shore wall
was partly covered by foliage. The latest source displays the actual selected
wall geometry/material above that foliage, preserving the same declared
6,620-coin paid-selection fixture. Other application/backend changes are present
between these sources; the images do not isolate those changes. The bounded
selection change is [Draft #418](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/418).
It does not manufacture HP, add land, grant upgrades or replace the saved layout.

The local fixture declares 8,000 starting coins, best wave 40, seven ordinary
paid buildings and noon lighting. Normal API actions pay for 102 outer walls
and one 20-coin upgrade (6,660 coins), then the real level2→3 upgrade pays 40
more (6,620). Four actual moves, 21 additional paid walls and 42 upgrades produce
the arranged 123-wall / 5,150-coin state. Confirmed saves or successful purchase
responses are not injected after the initial setup. The normal bell starts a
frozen legacy local-demo wave, then actual simulation, projectiles and breach
rendering run with an accelerated browser clock. This is not authenticated
production V1 durability or live multiplayer evidence. HP remains unavailable
where the declared legacy response supplies no recovery value.

| Actual state | 1280×720 | 375×812 |
|---|---|---|
| Entry / Work | [Desktop](reference-entry-1280x720.png) | [Phone viewport](reference-entry-375x812.png) |
| Complete Fit | [Desktop](reference-fit-1280x720.png) | [Phone viewport](reference-fit-375x812.png) |
| Selected level-three wall | [Desktop](reference-selected-level3-1280x720.png) | [Phone viewport](reference-selected-level3-375x812.png) |
| Move before Cancel | [Desktop](reference-move-level3-1280x720.png) | [Phone viewport](reference-move-level3-375x812.png) |
| Three-cell unpaid draft | [Desktop](reference-wall-draft-1280x720.png) | [Phone viewport](reference-wall-draft-375x812.png) |
| Expanded Fine / shore | [Desktop](reference-wall-draft-fine-1280x720.png) | [Phone viewport](reference-wall-draft-fine-375x812.png) |
| Paid arranged village | [Desktop](reference-arranged-1280x720.png) | [Phone viewport](reference-arranged-375x812.png) |
| Standing combat walls | [Desktop](wave-standing-1280x720.png) | [Phone viewport](wave-standing-375x812.png) |
| Firing / projectiles | [Desktop](wave-projectiles-1280x720.png) | [Phone viewport](wave-projectiles-375x812.png) |
| Breach / changed links | [Desktop](wave-breach-1280x720.png) | [Phone viewport](wave-breach-375x812.png) |

## Measurements and remaining boundaries

| Stage-eight sample | Desktop | Phone viewport |
|---|---:|---:|
| Entry draw calls | 116 | 116 |
| Selected wall draw calls | 119 | 116 |
| Combat standing / firing / breach | 117 / 121 / 129 | 116 / 120 / 129 |
| JavaScript page errors | 0 | 0 |
| External requests | 0 | 0 |
| Expected offline 503 console diagnostics | 1 | 1 |

The selected-wall presentation costs exactly one additional sampled draw call
against stage seven. These samples are below 150; they do not establish sustained
FPS, worst-case battle performance or a physical device. Scenery and cliffs
remain less detailed than the generated target. Encoded world art plus terrain
remains **12,554,858 bytes**, above the unchanged **8MiB** effort target. The
existing analytic coast and manual/server upgrade rules remain authoritative;
automatic island expansion is not implemented here.

The source-specific complete frontend/a11y/demo/overlap/build/budget/text/
multiplayer sequence is **PENDING** in this document until exact logs arrive.
The [targeted backend record](../reference-village-backend-checks/README.md)
separately proves 262 route/unit checks and 269 actual disposable-PostgreSQL
checks on the matching backend/Supabase trees; it is not a new full-backend pass.
Earlier failed checks stay in their [raw chronology](../reference-village-checks/README.md).

The intermediate main-integrated report-input test at source `5e3dd6cc` passed
once: [raw output](focused-report-input-5e/report-input.log),
[runner source/command](focused-report-input-5e/report.json). It checks actual
keyboard/gamepad movement and retains the original pointer activation of UI
buttons, 24 real frames, high quality and a 20-second test limit. Its body took
19.440 s (21.27 s Vitest / 21.98 s process), leaving about 0.56 s margin. This
is one focused success on the earlier `d40e9c78` / `e61fa1b8` source, not a
robust performance result or a complete pass for the latest source.

Physical Safari/phone behavior, sustained performance, balance and human visual
acceptance remain open. Generated
[approved references](../../design/reference-village/approved-2026-11-17/README.md)
are separate design evidence. No PR merge to main, deployment, live migration or
production flag activation is represented by this package.

## Reproduce without editing another writer's checkout

Use the capture helper revision/hashes in [execution.json](execution.json) from
a separate helper checkout, locked dependencies and installed Chromium:

~~~bash
CHROME_PATH=/usr/bin/chromium node scripts/capture-village-composition.mjs \
  /absolute/path/to/runtime-at-91c1f9d5/frontend /absolute/path/to/output reference --arranged --wave
~~~

The exact [document checker](verify-comparison.mjs) uses the existing frontend's
locked `playwright-core` package and headless Chromium. Run it from a repository
checkout with the frontend's locked dependencies installed:

~~~bash
CHROME_PATH=/usr/bin/chromium node docs/evidence/reference-village-latest-review/verify-comparison.mjs
~~~

It resolves the checkout's `frontend/package.json` relative to its own file,
opens the sibling `comparison.html`, and writes to `captures/review-document`
relative to the command's working directory. Optional first/second arguments
select another HTML/output path. For an extracted checker outside that checkout,
`REVIEW_FRONTEND_PACKAGE=/absolute/path/to/frontend/package.json` explicitly
selects an existing locked frontend installation; it installs no packages.
Set `CHROME_PATH` to the installed Chromium/Chrome executable on another machine.

The checker serves only the original HTML on owned ephemeral loopback and
verifies all twelve images and 2/3/3 tablists. The static HTML itself has no
package or remote-asset dependency; the checker requires the checkout's existing
dependencies. An extracted image-review ZIP is not an installed app checkout.
Managed-browser direct file opening was previously blocked before assertions;
do not disable browser policy to run this check.

Packaging checks exact copied bytes, source/tree identities, native dimensions,
twelve embedded image hashes and static document structure. Packaging ran no
application/browser suite and does not itself claim a new native document pass.
