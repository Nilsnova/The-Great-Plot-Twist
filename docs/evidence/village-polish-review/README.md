# Village polish evidence index

Used by Johannes Franz Lang (`frcola`) and reviewers of [Draft #432](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/432) and [documentation Draft #433](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/433).

**Evidence collection is complete; application checks are not fully green.** Final
`6c1cda17` frontend: 4,792 passes / one known input timeout. Multiplayer fails
own-musket poses 0 versus 2. Actual captures, paid tiers, matrix, terrain and
comparison checks have passed their stated scope. Human review and the listed
unverified steps remain open. The directory does not
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
| Art/renderer matrix | [Initial receipt](native-matrix-initial/execution.json): 22 sheets, 12.29s on `9fa15494`. [Corrected final receipt](native-matrix-final/execution.json): 22 sheets, 11.78s on `0a461c47`, with phone label-width assertion. All 100 defense bindings and real shared walls; fixtures, not normal gameplay. |
| Landscape boundary | Native painter proof passed: exact 2,408,448 alpha bytes/coast mask/profile/source PNG/fallback RGBA retained while RGB changed. |
| Source invariants | [Coordinator's static record](checks/static-invariants.json): exactly five changed presentation files relative to `6c87b8dc`; backend, migrations, public assets and package/lock files unchanged, required histories retained and original checkout untouched. |
| First application sequence | [Raw report](checks/first-7fab/report.json) on `7fab8866`: frontend 4,639 passed / 2 failed; a11y 33/demo 34/layout 21 passed; build/budget/text passed; multiplayer coverage failed. Overall exit 1. |
| Post-VIS59 sequence | [Raw report](checks/post-vis59-0a/report.json) on `0a461c47`: frontend 4,760 passed / one input timeout; multiplayer failed at own-musket pose 1 versus 2; build/budget/text passed. Overall exit 1. |
| Final VIS60 sequence | [Raw report](checks/final-vis60/report.json) on `6c1cda17`: **4,792 passed / one failed**, 426 files (425 pass / one fail), 575.87s Vitest / 576.94s process; input timeout 20.025s. Multiplayer fails 0 versus 2 own poses in 345.91s, line 814. Build/budget/text pass 6.03s / 0.80s / 3.51s. Overall exit 1. |
| Final sync samples | [Raw arrays and metrics](checks/final-vis60/multiplayer-captures/sync-samples.json): ONLY first-wave owner/Ben, 108 distinct checked and matching ship/boarder pairs, worst 0/0; 19 include boarders, exact heart and militia 86/86 each. Later comparison target not reached. |
| Final invariants | [New receipt](checks/final-invariants-6c1cda17.json), separate from the old 480d snapshot: six code/script/test trees match runtime; five product-file delta, 71 unique migrations, unchanged backend/migrations/public/packages, required histories and original clean checkout retained. |
| Comparison document | [Native receipt](comparison-browser/report.json) passed in 7.11s: exact served HTML and 13 response hashes, 12 decoded images, 3 tablists / 33 real actions at each viewport, zero page/console/external errors. |

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
its resources in `finally`. [manifest-used.json](comparison-browser/manifest-used.json)
records the exact tested input snapshot, SHA-256
`1fe6f68db48e21f263e03426c5e212cf225f8f337bb51f5e9cec24bb885cdc71`.
The outer package manifest is extended with later immutable receipts and updated
metadata. Tested HTML, checker and all twelve original image bytes stay unchanged:
HTML `5c00049b…`, checker `c9fd2bf8…`.
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

The [b8444070 high-density helper attempt](paid-hires-attempt-01/execution.json)
failed after 26.70s before its first
intended capture: it read `selection.spotId` while selection was null. The helper
null handling is corrected in `7fab8866`. Preserve this failed attempt separately;
it is not a product failure or a successful high-density pass.

The first full multiplayer run on `7fab8866` stopped at line 816 after 341.53s:
the sampled comparison had only **one matching pair**, below its minimum of three.
Worst recorded ship/boarder drift was zero; unobserved arrays are unavailable.
This is insufficient coverage, not a proved state mismatch. Its prior pose
assertions passed. The later `0a461c47` run stopped after 358.28s at line 809:
**one own-musket pose versus two expected**, the known issue-421 family. These
are different outcomes and neither is a complete multiplayer pass. Later
boss/finisher steps remain unproved.

VIS59's strict profile observer resolves the obsolete level-three `1.45` versus
`1.25`/buttress expectation without changing the game. Its complete frontend run
has 4,760 passes and one known input timeout. VIS60 then considers all distinct
tick pairs, exact before ±1, with no sample reuse or duplicate inflation. Minimum
three comparisons, tolerances, native actions and exact heart/militia checks stay
in force. The final run provides 108 matching first-wave owner/Ben comparisons,
but fails own-pose feedback before the later target. It does **not** establish
full native resolution of the earlier late-join coverage failure. Boss/finisher
and late-join wave-two comparison steps are not reached.
Ana/Max join, lobby and membership checks passed; only the later synchronization
comparison remains unproved, not the act of joining.

Useful original multiplayer diagnostics are the
[musket-stage image](checks/final-vis60/multiplayer-captures/03-wave1-muskets-me.png),
[owner failure image](checks/final-vis60/multiplayer-captures/failure-me.png) and
[Ben failure image](checks/final-vis60/multiplayer-captures/failure-ben.png).
They use the native multiplayer harness's own viewport dimensions; they are not
the standard before/after captures.

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

Original frontend reporter logs retain their final blank line. The [Git whitespace diagnostics](checks/original-log-whitespace.txt) are recorded rather than changing those raw bytes; authored text and checker whitespace checks pass.
