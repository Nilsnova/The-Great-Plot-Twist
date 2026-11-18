# Village polish evidence index

Used by Johannes Franz Lang (`frcola`) and reviewers of [Draft #432](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/432) and [documentation Draft #433](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/433).

**Combined checks in progress.** The final actual-game captures, terrain, first
renderer matrix and both paid-tier walkthroughs have completed. The
caption-corrected matrix, comparison-page browser run and fresh application
checks remain pending. The directory does not
inherit a pass from older sources. The documentation writer runs static checks
only; it does not run Chrome or application tests.

Read the [code/review guide](../../contribute/VILLAGE-POLISH-REVIEW.md) first.
[source.json](source.json) records exact snapshot identities and current evidence
boundaries. [comparison.html](comparison.html) shows twelve original before/after
PNGs; keep its relative image directories together. [manifest.json](manifest.json)
records package-file hashes, and [originals.json](originals.json) records untouched
workspace origins plus the inventory of all twenty original before PNGs.

## What belongs in this package

| Group | Source and scope |
|---|---|
| Before actual game | `6c87b8dc`: 20 original captures from the actual paid fixture, exit 0 in 215.30s. Six comparison images will be copied unchanged; all original source PNG hashes are retained in provenance. |
| Final actual game | [Actual receipt](actual-after/execution.json) on `7fab8866`: passed in 192.03s (wrapper 192.13s), 20 original PNGs, both sizes at High/density 1/DPR 1. Product code matches `9fa15494`; no historical-image substitution. |
| Paid wall progression | [Functional receipt](paid-functional/execution.json) on `9fa15494`: 223.56s, 492 real local upgrades per viewport, 18 adaptive-density PNGs. [High-density receipt](paid-hires/wrapper.json) on `7fab8866`: passed in 305.36s, 18 original PNGs, High/density 1/exact drawing dimensions. |
| Art/renderer matrix | [Initial receipt](native-matrix-initial/execution.json) on `9fa15494`: 22 developer-only sheets, 100 defense bindings, 12.29s; actual compiled frames/shared WebGL walls, not normal gameplay. Caption-only final follow-up pending. |
| Landscape boundary | Native painter proof passed: exact 2,408,448 alpha bytes/coast mask/profile/source PNG/fallback RGBA retained while RGB changed. |
| Source invariants | [Coordinator's static record](checks/static-invariants.json): exactly five changed presentation files relative to `6c87b8dc`; backend, migrations, public assets and package/lock files unchanged, required histories retained and original checkout untouched. |
| Fresh application checks | First `7fab8866` frontend: 4,639 passed / 2 failed, 424 files, 563.75s (564.43s process). Known input timeout plus obsolete observer expectations; [VIS59 #435](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/435) is QA-only. Final sequence/rerun receipts remain pending. |
| Comparison document | [Native checker](verify-comparison.mjs) prepared; root run pending. It verifies exact served HTML/image bytes, 12 decoded images, three tablists and 33 real keyboard/click actions per viewport, with no page/console/external errors permitted. |

The generated concepts remain in their [original design folder](../../design/reference-village/approved-2026-11-17/README.md).
Official reference screenshots are studied externally, not copied into this
package or the shipped application. Actual PNGs are never edited, cropped,
annotated, resampled or re-encoded for this review.

## Interpret the images correctly

The ordinary actual-game fixture starts with 8,000 declared coins and a recorded
best wave of 40. It builds seven structures and 102 perimeter walls through real
local actions. After its paid selected upgrade, four Moves and 21 paid inner walls
with their upgrades, the arranged view has 123 walls and 5,150 coins. It is an
optional review arrangement, not a default saved enclosure.

The separate all-tier fixture starts with 50,000 declared coins. Seven paid
buildings cost 300, 123 walls cost 1,230 and their four upgrades cost 36,900:
492 actual upgrade receipts per viewport leave 11,570. Zero/one/two-house captures
show the existing growth multipliers on the smaller visual tree baseline. This
does not prove production durability or player-account behavior. The accepted
functional screenshots use adaptive density 0.50 desktop / 0.55 phone with the
quality setting high. They are preserved as functional evidence rather than
described as full drawing-resolution images.

The ordinary actual-game before/after helper retains its existing Low→High
reset before snapshots, with final High quality, density 1 and DPR 1. The newer
paid helper uses a real viewport resize/restore and checks exact drawing
dimensions and unchanged selection. These methods do not establish sustained
performance or physical-phone/Retina coverage.

The art matrix shows the whole fixture and can be taller than its viewport.
Each image's actual dimensions must be read from its report. Do not describe those
contact sheets as 1280x720/375x812 full-game screenshots.

The comparison-page checker uses the full checkout's locked frontend
`playwright-core` and an installed Chromium. The coordinator runs it after the
application's exclusive browser lease ends:

```bash
CHROME_PATH=/usr/bin/chromium node docs/evidence/village-polish-review/verify-comparison.mjs /absolute/output
```

It owns a loopback HTTP server and browser, verifies the exact HTML and all twelve
image response hashes against the manifest, exercises real tab input and closes
its resources in `finally`. `manifest-used.json` in its eventual proof records the
input snapshot even if the final package manifest later adds the browser receipt.
This check proves that the review page works; it does not add game test coverage.

## Inspect the paid wall levels

These original High/density-1 captures come from the accepted 305.36s paid
walkthrough. The ordinary comparison scene is a mixed-tier arrangement; this
separate fixture upgrades every one of its 123 walls through all five levels.

| Wall level | Coins left | Desktop original | Phone original |
|---|---:|---|---|
| 1 | 48,470 | [1280x720](paid-hires/paid-level-1-1280x720.png) | [375x812](paid-hires/paid-level-1-375x812.png) |
| 2 | 46,010 | [1280x720](paid-hires/paid-level-2-1280x720.png) | [375x812](paid-hires/paid-level-2-375x812.png) |
| 3 | 41,090 | [1280x720](paid-hires/paid-level-3-1280x720.png) | [375x812](paid-hires/paid-level-3-375x812.png) |
| 4 | 31,250 | [1280x720](paid-hires/paid-level-4-1280x720.png) | [375x812](paid-hires/paid-level-4-375x812.png) |
| 5 | 11,570 | [1280x720](paid-hires/paid-level-5-1280x720.png) | [375x812](paid-hires/paid-level-5-375x812.png) |

The selected level-five card is captured on
[desktop](paid-hires/paid-selected-level-5-1280x720.png) and
[phone](paid-hires/paid-selected-level-5-375x812.png). The existing maximum-level
refusal is exactly `409 max_level`, and the refused extra upgrade changes neither
balance nor position. The card truthfully labels live health unavailable in this
offline fixture.

Tree growth is captured with
[zero](paid-hires/houses-0-1280x720.png),
[one](paid-hires/houses-1-1280x720.png) and
[two](paid-hires/houses-2-1280x720.png) houses on desktop, and with
[zero](paid-hires/houses-0-375x812.png),
[one](paid-hires/houses-1-375x812.png) and
[two](paid-hires/houses-2-375x812.png) houses on phone. The exact canonical tree
coordinates, mesh feet, painter order and radius-0.48 colliders remain the same.

## Preserve the chronology

The first combined iteration `65bda4fd` passed an actual journey in 188.05s, but
its wall cap-height claim and cliff alpha handling were refined afterward. Those
captures remain historical. Final evidence must identify corrected source
the accepted runtime from each coordinator receipt. Application trees remain
unchanged across the later helper-only revisions.

The `b8444070` high-density helper attempt failed after 26.70s before its first
intended capture: it read `selection.spotId` while selection was null. The helper
null handling is corrected in `7fab8866`. Preserve this failed attempt separately;
it is not a product failure or a successful high-density pass.

Documentation at `13c10cdc` has the same frontend source/public/backend and
migrations subtree as `9fa15494`, while top-level Supabase differs through README
only. A later docs HEAD is not silently relabeled as the runtime that produced a
picture. Matching application trees do not imply byte-identical build stamps.

## Remaining gates

Human visual/explain-back acceptance and different-human review remain open.
Physical devices/Safari, sustained FPS, balance/high-score comparability, live
database application, deployment and automatic island growth are not proven.
World art and terrain still transfer 12,554,858 bytes against the unchanged 8MiB
effort target. All work remains Draft; no PR/main merge or rollout is represented.
