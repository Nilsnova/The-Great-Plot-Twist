# Village clearance review evidence

For Johannes Franz Lang (`frcola`) and a different human reviewer. Tracks [VIS61 #438](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/438), assembled [Draft #445](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/445) and documentation [Draft #452](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/452).

**Status: native captures and frontend are closed; remaining application/backend checks are being collected.** Final frontend: **4,906 passed / one unchanged 20-second input timeout**. The complete suite is not green. This documentation writer has run no browser, application or database checks. The coordinator owns those commands. A screenshot file appearing during a run does not establish that the entire journey passed.

- [Detailed code, review and explain-back guide](../../contribute/VILLAGE-CLEARANCE-REVIEW.md).
- [Source/capture status](source.json) identifies the immutable runtime and separates pending results.
- [Previous polish evidence](../village-polish-review/README.md) remains historical, including original failed attempts and its 112-image package.
- [Approved generated concepts](../../design/reference-village/approved-2026-11-17/README.md) are references, not implemented-game evidence.

The new example uses a corrected 102-piece paid perimeter and 21 paid inner partition pieces through normal actions. It also moves four building spots through normal free Move. Before/after comparison therefore includes an intentional new demonstration layout as well as visual changes; loading the new code does not automatically rearrange a paid save. Historical fixtures/images remain unchanged.

Prospective scenery guards do not sanitize existing paid layouts. The decorative barrel's new ground point can intersect a formerly legal paid cell; [the actual VIS66 examples](../VIS-66-barrel-clearance/legacy-limit.json) are retained. Reads preserve those coordinates. Manual review through normal free Move is distinct from an automatic repair or a live rollout.

The [intermediate paid receipt](progress-paid-bcf/execution.json) is complete: source `bcf8f1bc`, **335.47s / exit 0**, **18 original PNGs**, **984 successful paid upgrades** and **11,570 final coins per viewport**. All nine tree feet/colliders remain fixed. Snapshots retain High and full drawing density 1 after a normal viewport refresh; adaptive density before that refresh can be lower. This does not establish sustained FPS.

[Open the static actual before/after comparison](comparison.html): six original before/after pairs at wall levels 1/3/5 and both viewports. The after set is the **final frontend paid stage**, source `68d41990`: **335.84s / exit 0 / 28 original PNGs / 984 paid upgrades / 11,570 final coins per viewport**. Ten additional actual Fit overviews (all five tiers at both sizes) supplement the Work views; they are not substituted into an older Work pair. [Exact execution](paid-final/execution.json) and [complete original report](paid-final/report.json) retain the assertions and action receipts.

The final paid stage verifies the revised water and local fake guard candidate. [VIS68 #454](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/454)/[Draft #455](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/455) authoritative backend/SQL proof and the complete application sequence remain separate and pending. This index does not infer a full-suite or server persistence pass from screenshots.

[Earlier working-tree integration checks](integration-fixture-checks/checks.json) retain the original 80 passed / 2 failed frontend run and corrected 82 passed / 8 files / 11.63s run, plus 38 backend passes / 3.75s. The two original failures exposed a discontinuous inner construction chain and an upright badge offset accidentally scaled by ground projection. The fixture/code were corrected; assertions were retained. These earlier selected checks do not replace final frozen-source verification.

[Final actual-game journey](actual-final/execution.json), source `68d41990`: **210.61s / exit 0 / 20 original PNGs**. The declared 8,000-coin fixture ends with 123 paid walls and 5,150 coins after normal purchases/upgrades/four Moves. Selection, canceled Move, unpaid ghosts, firing and a real breach are recorded. No page errors/external requests; expected offline 503 console messages remain in the report.

[Final native renderer matrix](native-matrix/execution.json), same frontend: **12.79s / exit 0 / 22 original sheets**. These are compiled-art and actual-wall-render fixtures with negative controls, not gameplay or progression screenshots. A contact sheet can be taller than its declared viewport because it records the whole fixture page.

[Closed full-frontend step](checks/final-frontend/summary.json): **4,906 passed / one failed**, 435 files (434 passed / one failed), 622.73s Vitest / 623.58s process. The original [verbose output](checks/final-frontend/frontend.log) is unchanged. Only the preexisting input-ownership case times out at 20 seconds; its test blob is byte-identical to the prior visual review. No retry, skip or timeout relaxation is used.

The ordinary snapshot helper retains its inherited Low-to-High graphics reset before captures. The paid-tier helper uses a normal viewport refresh without lowering the High setting. Both record full drawing density 1 / DPR 1 for the images; neither proves sustained performance.

[D066's mandatory normal-purchase authority](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/chore/vis-61-clearance-review/docs/DECISIONS.md#d066--atomic-authority-for-every-fresh-original-wall-purchase--2026-11-18) requires checked effective coordinates, complete-row/policy fencing and transaction-local authority. Old-signature fresh purchases fail closed. Migration `20261118060000_wall_single_build_clearance.sql` is written only and must be applied by the human owner before the corresponding backend deploy; existing retries, reads and upgrades remain authoritative. Initial e57 SQL passes are not treated as closure of the later raw/effective gap. Strict final backend/PG results remain pending.

Other final command receipts will be copied only after their coordinator runs finish. Final source identities, original-byte inventory, manifest and static-link checks will be updated with that evidence. No complete-suite, sustained-performance, physical-device or live-persistence pass is claimed here. All PRs remain Draft; explain-back and different-human review are open.
