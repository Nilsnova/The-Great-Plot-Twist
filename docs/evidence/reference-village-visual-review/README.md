# Reference village: final rendered review capture

**Visual review evidence, not final human/device/balance acceptance.**
This package preserves twenty unchanged actual PNGs and the
[raw report](report.json). The [manifest](sha256.json) records original bytes,
hashes, dimensions, helper identity and the capture/candidate source boundary.

Open [comparison.html](comparison.html) locally for a standalone before/after
page. It embeds eight unchanged actual PNGs and needs no package, server or
network. Keyboard tabs switch desktop/phone and village/combat. Older village
images come from VIS33; older combat images come from WALL24. Captions explicitly
distinguish their sources and 102-wall/6,660-coin fixture from the new arranged
123-wall/5,150-coin fixture. These are different software/layout states, not
pixel-matched isolated benchmarks. Generated concepts remain
[separate design references](../../design/reference-village/approved-2026-11-17/README.md).

## Capture source and later frozen candidate

| Identity | Exact value |
|---|---|
| Actual capture runtime | `9f47c14277c801d10f2c504799a72fe059b52171` |
| Capture frontend source tree | `ff56655849b11e8f0acaa3b4e0aa2b68192b9984` |
| Frozen check candidate | `6e2c3e8b3437ba7302870adb59e2351c2fa74f5e` |
| Candidate frontend source tree | `8365d88e76889e68f5e1aa1d6aa9a858d3afaea3` |
| Public tree, identical across both | `9306942db1050d728799cee2fbdc8e8960f14ad2` |
| Backend tree, identical across both | `e8d128f1ed1830a052aa1407858d8d899d3cb2d8` |
| Capture helper | `074a4675b99c68a41604bb1658943f5dfb1ee067` |

The frontend source trees are **not identical**. After capture, the candidate
adds the current-wave lookup/context fence in `island/wave-flow.js` and changes
only the first-wave hint's accessible name in `pirates/hud.js`. The visible
rendering/CSS/assets for this captured scenario are unchanged; this is not a new
capture of the later candidate. The manifest names both changed files and keeps
the two source trees distinct. Full candidate verification needs its own logs.

## Declared actual gameplay and images

The existing local fake/offline fixture declares 8,000 starting coins, best
wave 40, seven ordinary paid buildings and noon lighting. It pays for 102 outer
walls and one 20-coin upgrade, leaving 6,660. The real selected level2→3 upgrade
pays 40 more (6,620). Its four-component PNG segment portrait and visible green
bracket, real Move/Cancel, three unpaid snapped cells/indexed buffers and expanded
Fine shore clearance are recorded at both viewport sizes.

The optional arranged view uses four successful actual API moves, 21 quoted/paid
inner walls and 42 successful upgrades, ending at 123 walls/5,150 coins. No
confirmed save, purchase or successful outcome is injected after initial setup.
The normal bell/card starts frozen legacy local-demo inputs, then the actual
controller, simulation, projectiles, wall breach and atlas renderer run with an
accelerated browser clock. This is not a production V1 durable wave or live
multiplayer session. See the [stage-four detailed action boundary](../VIS-31-stage-04/README.md)
for the same declared ledger/interaction sequence; this package has its own
source/images and lower combat drawing counts.

| Actual state | 1280×720 | 375×812 |
|---|---|---|
| Entry / Work | [Desktop](reference-entry-1280x720.png) | [Phone viewport](reference-entry-375x812.png) |
| Complete Fit | [Desktop](reference-fit-1280x720.png) | [Phone viewport](reference-fit-375x812.png) |
| Selected level-three wall | [Desktop](reference-selected-level3-1280x720.png) | [Phone viewport](reference-selected-level3-375x812.png) |
| Move before Cancel | [Desktop](reference-move-level3-1280x720.png) | [Phone viewport](reference-move-level3-375x812.png) |
| Three-cell unpaid draft | [Desktop](reference-wall-draft-1280x720.png) | [Phone viewport](reference-wall-draft-375x812.png) |
| Expanded Fine / real shore | [Desktop](reference-wall-draft-fine-1280x720.png) | [Phone viewport](reference-wall-draft-fine-375x812.png) |
| Paid arranged village | [Desktop](reference-arranged-1280x720.png) | [Phone viewport](reference-arranged-375x812.png) |
| Standing combat walls | [Desktop](wave-standing-1280x720.png) | [Phone viewport](wave-standing-375x812.png) |
| Actual firing/projectiles | [Desktop](wave-projectiles-1280x720.png) | [Phone viewport](wave-projectiles-375x812.png) |
| Actual breach / changed links | [Desktop](wave-breach-1280x720.png) | [Phone viewport](wave-breach-375x812.png) |

## Measured scope and open checks

| Final capture sample | Desktop | Phone viewport |
|---|---:|---:|
| Combat standing draw calls | 117 | 116 |
| Combat firing draw calls | 119 | 120 |
| Combat breach draw calls | 129 | 129 |
| JavaScript page errors | 0 | 0 |
| External requests | 0 | 0 |
| Offline 503 console diagnostics | 1 | 1 |

These reported samples are below 150. They do not establish sustained FPS,
worst-case performance, Safari or physical touch hardware. No numeric DOM HUD
bounding-box measurement is present in this capture report; compact HUD
appearance is shown by the actual images and its separate VIS40 component
checks. The single offline 503 diagnostic remains in each raw viewport record.

The first complete run on `9f47` reported **4,402 passed / 27 failed in 609.82 s**;
the coordinator preserves it as `verification-attempt-01-9f47`. The thirteen
failing files received focused green corrections preserving assertions/timeouts;
that did not establish a complete pass.
The complete retry on 6e2c3e8b is **not green**: 4,463 passed / 1 failed,
409 files (408 passed / 1 failed), 563.22 s; only defense-report ownership timed out
at 20 s. VIS46 candidate 4844c2c1 then failed its new sole-owner assertion in 18.375 s:
`worldBusy` includes the report's own blocked state. Its derived-state correction
and coherent veteran fixture still exceeded the unchanged 20-second limit.
Their application source/public/backend trees match 6e2c3e8b. The original
actions, 24 rAF/high-quality/20 s checks remain; completed input-resume proof is
still open. Accessibility on 6e2
also failed the lobby keyboard audit (33 screens, 382.39 s); browser/external
errors were empty. VIS47 is correcting audit identity across legitimate refresh.
No passing complete/a11y replacement is claimed until exact verified logs arrive.
The [raw failed-check chronology](../reference-village-checks/README.md) preserves
unchanged outputs, JSON records and hashes, including the later unchanged
multiplayer observer failure before its wave checks.

Active 13-family/164-ID transport at VIS30 f6bbc967 / VIS18 e54b0f46 matches the
candidate's public 9306942 tree: 9,871,501 compiled bytes plus 2,683,357 terrain,
**12,554,858 bytes total**. Lossless zlib recompression of thirteen compiled PNGs
preserves image content; this is already active, not merely tooling. The earlier
13,608,302-byte checkpoint remains historical. The 8MiB target is still **not
met**. Cliffs/scenery remain less detailed than the approved concept, and the
phone-selected wall can be partly hidden by a tree; visual acceptance is open. Balance sign-off, land
expansion and automatic island growth are not established by this visual phase.
Existing building upgrades remain governed by the existing manual/server rules.

## Reproduce and verify this package

From a separate helper checkout at `074a4675`, with its locked frontend
dependencies installed, run from `frontend/`:

~~~bash
node scripts/capture-village-composition.mjs \
  /absolute/path/to/runtime-at-9f47c142/frontend \
  /absolute/path/to/output reference --arranged --wave
~~~

The later frozen candidate has its distinct test boundary above. Record a new
source/report if recapturing it. The capture is local Chromium at native screenshot
pixel ratio 1/high quality, with prior adaptive drawing ratios retained in the
report; no physical-device claim follows. This report does not record a browser
version string.

Packaging checks exact bytes for 21 copied files, twenty PNG dimensions, three
helper hashes and the explicit post-capture source/public/backend boundary.
Comparison checks decode all eight embedded PNG streams back to their unchanged
original hashes. It uses semantic keyboard tabs and no external resources.
This documentation task ran no application suite or Chrome capture. The fresh
complete result lines will be added separately. No merge, deployment, live
migration or flag activation is claimed.
