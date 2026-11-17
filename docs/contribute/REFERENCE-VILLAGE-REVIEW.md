# Reference village: implementation and review guide

Responsible human: **Johannes Franz Lang (`frcola`)**. Documentation child
[#387](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/387) of
[VIS31 acceptance #236](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/236);
[documentation Draft #388](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/388).

**Latest-main integration is still being verified.** The main cutoff is
`ee5677ff`. The [latest stage-eight package](../evidence/reference-village-latest-review/README.md)
preserves twenty actual final PNGs, original report/execution and a new
twelve-image comparison with a Selected wall scene. Capture source `91c1f9d5`
and frozen check source `52f6bb15` have identical frontend/public/backend/Supabase
trees. The selected shore wall is readable above foliage; the exact before
source remains in [stage seven](../evidence/VIS-31-stage-07/README.md).

The [targeted backend record](../evidence/reference-village-backend-checks/README.md)
has separate 262 route/unit and 269 disposable-PostgreSQL passes on the matching
`c7851960` backend / `6e52a63b` Supabase trees, with the initial 269 SQL skips
preserved. It is not a fresh full-backend run. The complete frontend/a11y/demo/
overlap/build/budget/text/multiplayer sequence and native check of the new
twelve-image document remain **PENDING**; earlier sources/results below keep
their original boundaries.

**Historical complete-check source: `6e2c3e8b3437ba7302870adb59e2351c2fa74f5e`.** Its frontend
source tree is `8365d88e76889e68f5e1aa1d6aa9a858d3afaea3`. The complete run on that source is **not green**:
4,463 passed / 1 failed across 409 files (408 passed / 1 failed) in 563.22 s.
The remaining defense-report ownership case reached its 20-second timeout.
VIS46 candidate 4844c2c1 has identical frontend source/public/backend trees but
its new sole-owner assertion failed in 18.375 s: `worldBusy` includes the report's
own blocked state. Corrected derived-state and coherent veteran fixtures still
exceeded the unchanged 20-second limit. The [raw verification chronology](../evidence/reference-village-checks/README.md)
preserves these failed results. On later main-integrated source `5e3dd6cc`, the
unchanged report keyboard/gamepad case, using the original pointer-activated UI
controls, passed in 19.440 s; the roughly 0.56-second margin does
not establish a robust performance fix or a new complete-suite pass.

The historical [stage-six rendered review capture](../evidence/reference-village-visual-review/README.md)
contains twenty unchanged actual PNGs/report, source boundary/hashes and a
[self-contained before/after page](../evidence/reference-village-visual-review/comparison.html).
It used runtime `9f47c14277c801d10f2c504799a72fe059b52171`, frontend tree
`ff56655849b11e8f0acaa3b4e0aa2b68192b9984`. The historical 6e2 candidate's later changes are
first-wave hint accessibility wording and the current-wave lookup fence;
visible rendering/CSS/assets in this scenario are unchanged. The source trees
are **not identical** and this is not a fresh capture of the later candidate.
Public/backend trees match between those two historical sources; the manifest
names their exact two source changes.

That stage-six capture samples standing/firing/breach at **117/119/129 desktop** and
**116/120/129 phone draw calls**, with zero page errors/external requests and
one offline 503 console message per viewport. These samples are below 150, while
sustained performance, balance, physical-device/Safari coverage and final human
visual acceptance remain open. Stage-four's earlier 152/151 breach miss and the
stage-three ghost-toolbar failure remain separate historical results.

All thirteen supplied original frame families are compiled: **164 IDs**,
including all five defenses. Other actor/effect IDs retain existing renderers.
The active lossless transport at VIS30 `f6bbc967`, configured through
VIS18 `e54b0f46`, totals **12,554,858 bytes including terrain**, compared with
29,819,059 raw bytes. Candidate public tree 9306942 matches all thirteen compiled
file hashes: 9,871,501 compiled bytes plus 2,683,357 terrain bytes. The earlier
`6a04dbed` checkpoint was 13,608,302; its history remains below. The 8MiB effort
target is still **not met** after the activated lossless zlib recompression. Land expansion
and automatic island growth are not implemented by this visual phase.

The documentation review base remains `a88db370`; relative foundation-code links
follow it, while current component PR heads identify later changes. All PRs stay
Draft. The first complete run at 9f47 recorded **4,402 passed / 27 failed in 609.82 s**
and is archived as `verification-attempt-01-9f47`. The coordinator reported focused
green corrections for the thirteen failing files without weakening assertions
or timeouts; the subsequent 6e2 complete run nevertheless failed one case. Those
focused results never established complete acceptance.

The reviewed product direction is a readable pirate village with movable grid
buildings, defensive perimeter walls and the existing wave/high-score progression.
Online play is not a new prerequisite.

All listed implementation PRs are **Draft** at this snapshot. No PR merge to main,
deployment, live migration or production flag activation is represented here.
The earlier paid-wall/recovery work remains the functional foundation. Its
[perimeter review guide](PERIMETER-REVIEW.md),
[workboard](PERIMETER-WORKBOARD.md) and
[verification record](../evidence/PERIMETER-VERIFICATION.md) keep their own source
and evidence boundaries. The broader proposed work stays in
[planning Draft #239](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/239),
[visual epic #205](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/205) and
[wall gameplay epic #241](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/241).
This guide does not mark those whole epics complete.

## What is being built

The [approved concepts](../design/reference-village/approved-2026-11-17/README.md)
preserve the intended roof/front/side volume, navy roofs, timber, brass, stone,
lush terrain, continuous walls and compact parchment controls. They are generated
design references. Their [manifest](../design/reference-village/approved-2026-11-17/manifest.json)
records original bytes and dimensions; the portrait concept is not a native
375×812 capture.

The implementation uses shaded original image frames in the existing Three.js
world. It does not introduce a new 3D game engine or turn decorative pixels into
buildable land. Three different measurements remain separate:

| Measurement | Meaning | Examples and authority |
|---|---|---|
| Native image pixels | Source crop, transparency, material detail and source foot | An original 1536×1024 sheet can contain twenty defense states. The authoring audit records its exact hash and rectangles. |
| Logical visual box | Sprite width/height and ground anchor used by world, combat and portrait rendering | The core is 128×128 with a 12px anchor; approved weapon presentations use 56×48 with a 7px anchor. These are appearance dimensions. |
| Gameplay coordinates/footprint | Saved position, legal occupancy, pathfinding, collision, quote and combat state | A wall still occupies its paid 2×2 logical footprint. The server and existing deterministic rules remain authoritative. |

[D063](../DECISIONS.md#d063--approved-reference-village-world-art--2026-11-17)
allows the world-only authored imagery while keeping title, cutscenes and help
code-drawn and outside the world image import graph.
[D064](../DECISIONS.md#d064--shared-reference-village-projection-and-presentation-bounds--2026-11-17)
records the later presentation decision: `X = 1.3x + 0.2z`, `Y = -0.6z`.
The inverse maps a screen-ground pick back to the same saved logical grid.
Upright sprite images retain their widths. Legacy ground pixels use the matching
affine conversion from their original 0.72 depth; a 3.2-unit decorative facade
therefore has about 2.667 displayed vertical units. This changes presentation,
not island ownership, walkability or wave geometry.

Desktop Work is 1.05× the measured Fit zoom. Phone Work uses the **absolute**
minimum zoom `max(Fit, 0.9)`, with panning; it is not 0.9×Fit.
Fit and held Tab retain the complete-island overview. The coefficient choice
implements the approved appearance direction; the user did not separately
approve those numbers or accept the final game.

## Follow one change through the code

| Concern | Code route to read | Why it matters |
|---|---|---|
| One supplied frame | [family registration](../../frontend/src/art/village-families.js) → [raster provider](../../frontend/src/art/village-raster.js) → [texture preparation](../../frontend/src/art/textures.js) → [world art](../../frontend/src/world/art.js) / combat atlas | Frame IDs, logical dimensions and source feet must agree in every consumer. A valid image test alone cannot prove a visible world mesh uses it. |
| Ground and clicks | [projection](../../frontend/src/world/projection.js) → [ground adapter](../../frontend/src/world/ground-transform.js), [camera](../../frontend/src/player/camera.js) and [island world](../../frontend/src/island/world.js) | A building, its grid ghost and its pointer target must project and invert through one mapping. Sprite artwork stays upright. |
| Paid wall run | [builder controller](../../frontend/src/island/wall-builder-mode.js) → [wall API](../../frontend/src/island/wall-builder-api.js) → existing server quote/transaction → saved island → wall geometry | The illustrated wall is a view of a confirmed structure. Unknown replies, reset epochs, stale prices and duplicate intent cannot create free pieces. Trace the server boundary in the perimeter guide. |
| Wall appearance | [wall metadata](../../frontend/src/art/village/walls.js) → [wall atlas](../../frontend/src/art/wall-atlas.js) / [batches](../../frontend/src/island/wall-batches.js) → existing world/combat state | Connections, ends, damage and rubble use actual level/state. The level-one correction prevents legacy generic damage aliases from selecting level-three artwork. |
| Core health | [controller publisher](../../frontend/src/pirates/core-display.js) → [island state](../../frontend/src/island/core-state.js) → [core renderer](../../frontend/src/island/core-world.js) | The existing combat controller supplies HP. A narrator cue does not become a health store. Context/epoch/wave guards reject old updates, including after optional travel. The pavilion adds no new collider or upgrade economy. |
| Selection and HUD | [island controller](../../frontend/src/island/index.js), [selection model](../../frontend/src/island/selection-dock.js), [UI](../../frontend/src/island/ui.js), [wave status](../../frontend/src/ui/wave-progress.js) | Best wave, active wave, captain level, coins, upgrade cost and HP have distinct meanings. Missing recovery data must remain unavailable rather than be inferred from Strength. |
| Loading and cleanup | [artwork tasks](../../frontend/src/island/static-village-art.js), [notice](../../frontend/src/ui/village-art-notice.js), core/progress renderers | A registered source failure stays visible and retryable. Closing/travel/disposal invalidates old work and releases owned resources. It must not silently display healthy fallback art as a successful load. |
| Asset compilation | [compiler](../../frontend/scripts/bake-village-art.mjs), [planner](../../frontend/scripts/village-bake-plan.js), [artifact evidence](../evidence/VIS-30-world-art/README.md) | Explicit raw inputs become content-addressed bounded sheets after proof. Original PNG bytes remain unchanged. Compiler output, runtime registration and production-copy exclusion are separate steps. |

These foundation-code links describe the documentation review base. The current
[compiled-provider activation at `e54b0f46`](https://github.com/Nilsnova/The-Great-Plot-Twist/tree/e54b0f463aeb21b5a740aa77b6a4b8b6719692ff)
supplies the configured provider and source-download exclusion. Review its exact
artifact hashes and pending composed-runtime evidence before acceptance.

## Review order and component ownership

A row is a bounded review slice, not a new task assignment. Every writing agent
uses a separate clone/branch on behalf of Johannes. Immutable `review/...`
bases keep stacked diffs focused. Before any future human merge, reconcile
against then-current main, preserve all dependent changes and rerun affected
checks. Do not merge the aggregate preview wholesale.

1. Read the product boundary, D063/D064 and the earlier paid-wall contracts.
2. Review VIS32 normalization/loading and the raw family metadata. Independent
   family reviews can run in parallel once their shared visual metrics are clear.
3. Review the shared projection, then ground/camera, world anchors and combat
   consumers. Include the cold coast binding correction after the affine adapter.
4. Review dimensional wall/ghost geometry, truthful state, static refresh,
   selected-wall controls, HUD and guarded core forwarding.
5. Review compilation against the exact approved raw input hashes, then the
   separate provider/build exclusion. Unchanged source bytes are not proof that
   the production game requests the compiled files.
6. Review the final actual game, failure paths and performance evidence on the
   frozen composed source. Complete explain-back before requesting current-head
   human approval.

### Contract, shared rendering and projection

| Task / Draft | Branch at snapshot | Review after | Main files / outstanding boundary |
|---|---|---|---|
| VIS01 [#349](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/349) | `docs/vis-01-approved-mockups@9eb08530` | Approved direction | D063/D064, GAME-V3, approved source concepts; final appearance acceptance remains open. |
| VIS32 [#352](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/352) | `feat/vis-32-world-raster@bfc7f08c` | D063 | Provider, shared metrics, async world/atlas preparation, bounded decode leases; actual consumers still need composed checks. |
| VIS33 [#351](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/351) | `feat/vis-33-village-composition@9b55460e` | Earlier working camera | Camera/navigation and original composition evidence; the later D064 framing supersedes its absolute-close entry choice. |
| VIS34 math [#363](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/363) | `feat/vis-34-shared-projection@8cb47237` | D064 | Pure forward/inverse mapping; review before the three consumer slices. |
| VIS34 anchors [#367](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/367) | `feat/vis-34-world-anchors@7a0d70dc` | #363 | Scenery/effect/interaction anchors; no independent geometry authority. |
| VIS34 combat [#366](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/366) | `feat/vis-34-combat-projection@be6a9e9e` | #363 | Combat anchors, overlays, ground shapes and picking; final battle appearance remains open. |
| VIS34 ground [#368](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/368) | `feat/vis-34-ground-camera@28cce29e` | #363 and consuming slices | Affine backdrop, water inverse, Fit/Work, movement previews and pointer inverse; include #386. |
| VIS37 [#386](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/386) | `fix/vis-37-cold-coast-binding@635b1114` | #368 and water | Mark the assigned manual matrix dirty before first coast read; actual GPU before/after proves the narrow shoreline fix. |
| VIS30 [#371](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/371) | `perf/vis-30-baked-world-art@f6bbc967` | Exact raw metadata and #377 | All thirteen families /164 IDs; active lossless PNG transport matches candidate public 9306942.12,554,858 bytes with terrain still misses 8MiB; whole-scene/device acceptance remains open. |
| VIS40 [#396](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/396) | `fix/vis-40-compact-combat-hud@0a4ece50` | Combat source/HUD | Compact battle HUD and header clearance; actual final images preserve visible layout, later candidate changes only hint accessible wording here. |
| VIS41 [#398](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/398) | `fix/vis-41-wave-look-fence@0b9938da` | Actual full-run race finding | Fence obsolete current-wave reads before mutation/admission; later nonvisual candidate change. Fresh complete verification pending. |
| VIS42 [#400](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/400) | `test/vis-42-runtime-projection@03cc6c5b` | D064 runtime geometry | Native test pointers follow actual projection; existing assertions/timeouts retained. |
| VIS43 [#402](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/402) | `test/vis-43-art-readiness@25bbcf1a` | Registered asynchronous art | Await real artwork before lifecycle assertions; readiness is not fabricated success. |
| VIS45 [#404](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/404) | `test/vis-45-wall-projection-qa@82e8078e` | D064/canonical wall receipts | Wall test pointers/receipt expectations follow the actual shared projection and declared context, preserving meaningful assertions. |
| VIS44 [#406](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/406) | `test/vis-44-art-provider-contracts@8431f059` | Native painter plus raster provider contracts | Preserve native source checks while checking registered provider dimensions separately; no skip or timeout relaxation. |
| VIS48 [#412](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/412) | `test/vis-48-multiplayer-wall-observer@1b4065d5` | Actual textured wall geometry | Observe actual batched wall posts/material levels while retaining legacy/tower checks; full multiplayer evidence needs its own final source/result. |
| VIS49 [#414](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/414) | `chore/vis-49-latest-main@52f6bb15` | Main cutoff ee5677ff plus bounded visual changes | Preserve teammate startup/cache/recovery fixes on a separate review branch, resolve semantic integration findings and run new source-specific checks. No PR merge to main. |
| VIS50 [#416](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/416) | `fix/vis-50-finish-checkpoint-guard@455c8387` | Real first-checkpoint SQL finding | Reject malformed first finish checkpoints before payout using a forward migration file; targeted route/private-PG checks do not imply live application or a full-backend pass. |
| VIS51 [#418](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/418) | `fix/vis-51-selected-wall-visibility@cd41fd2f` | Stage-seven foliage finding | Present one actual selected owned wall above foliage with its real geometry/material/state. Stage-eight selected samples add one draw call; no HP/placement/payment authority changes. The latest branch addition packages after evidence only, after the frozen source. |
| VIS46 [#408](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/408) | `test/vis-46-report-input-owners@5cdc9b17` | Complete-run report timeout | Frozen 52f6bb15 retains revision 870e624b's original UI button clicks and real keyboard/gamepad movement checks. The later branch variant activates those UI controls by keyboard and is outside the frozen source. Original movement assertions, 24 rAF/high-quality/20-second bounds remain; latest complete verification is pending. |
| VIS47 [#410](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/410) | `test/vis-47-lobby-refresh-identity@397ab17a` | Lobby keyboard accessibility audit failure | Use existing action/readonly-field identities across real refresh while preserving order/count/type/trap/visibility assertions. Latest complete-source native audit still needs its own result. |
| VIS31 ancestry [#392](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/392) | `chore/reference-village-current-main@59181376` | Current main and composed source | Real ancestry candidate; frontend source/public/backend trees match stage four runtime 414559fb. Documentation/QA changes do not imply a new visual pass. |
| VIS18 compiled [#381](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/381) | `perf/vis-18-compiled-activation@e54b0f46` | Complete artifact outputs | Configured provider, original-source copy exclusion and shipped-file assertions implemented; 35 focused tests plus build/budget proof exist. Final combined scene/full-suite gate remains pending. |

### Original art families

All rows require actual world/combat/portrait use where applicable; source
bounds, alpha checks and recording-canvas normalization are narrower evidence.
Use each PR's exact prompt/hash audit to trace the original bytes.

| Task / Draft | Branch at snapshot | Scope and dependency | Remaining composed check |
|---|---|---|---|
| VIS05 [#346](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/346) | `feat/vis-05-village-hero@4bd02615` | Cabin; tightened crop, VIS32 | Hero size, source foot, selection/picking and no neighboring overlap. |
| VIS06 [#353](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/353) | `feat/vis-06-house-family@6f495947` | Houses/support roles; shared fit, VIS32 | Plain 80×80/8 and roles 96×88/8 across levels; roles remain truthful. |
| VIS07 [#354](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/354) | `feat/vis-07-shaded-cannons@752d6d09` | Five cannon tiers × four states | Muzzle/effects, HP, state transitions and actual world/atlas appearance. |
| VIS08 [#375](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/375) | `feat/vis-08-shaded-mortars@8451e9eb` | Twenty mortar states; in the artifact for all 13 families | Current compiled activation is implemented; firing/ruin scale and battle use still need final visual acceptance. |
| VIS09 [#382](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/382) | `feat/vis-09-shaded-harpoons@9d3e65df` | Twenty harpoon states; included in artifact for all 13 families | Actual bolt/fire-state alignment and composed visual acceptance. |
| VIS10 [#384](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/384) | `feat/vis-10-shaded-culverins@77cb303c` | Twenty culverin states; included in artifact for all 13 families | Actual firing/ruin alignment and composed visual acceptance. |
| VIS11 [#383](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/383) | `feat/vis-11-shaded-swivels@dbc015f3` | Twenty swivel nest states; pellet unchanged; included in artifact | Actual firing/ruin appearance and composed visual acceptance. |
| VIS12 [#355](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/355) | `feat/vis-12-village-landmarks@41aea46a` | Bell and watchtower | Static refresh, bell foundation/ring animation and tier bounds. |
| VIS13 [#356](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/356) | `feat/vis-13-village-services@71dcf3e1` | Research/arsenal buildings | Conditional arsenal loading, actual unlock state and source selection. |
| VIS21 [#350](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/350) | `feat/vis-21-lush-nature@0cb484c0` | Eight foliage/rock/detail frames | Full scene density, occlusion, scale and low/reduced-motion legibility. |
| VIS20 [#348](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/348) | `feat/vis-20-village-terrain@c78ec638` | Grass/path/sand/rock materials, unchanged analytic land | Final D064 facade/shore/approach alignment; component source captures alone do not pass it. |
| VIS23 [#358](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/358) | `feat/vis-23-nautical-water@32f492b6` | Nautical water/foam; rejected first style preserved | Include #386, final scene and device/quality checks; isolated GPU timings are not FPS evidence. |

### Walls, state, controls and evidence

| Task / Draft | Branch at snapshot | Review after | Main files / remaining boundary |
|---|---|---|---|
| VIS14 [#347](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/347) | `feat/vis-14-dimensional-walls@fd87981e` | VIS32 and wall contracts | Wall metadata/atlas/batches; posts, caps, joins, gaps and real damage. Include #377. |
| VIS14 correction [#377](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/377) | `fix/vis-14-level-one-wall-art@b84eadfc` | #347 | Explicit level-one state IDs and all-tier recovery fallback; actual world/combat UV regression and canonical preload coverage. |
| VIS27 [#359](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/359) | `feat/vis-27-shaded-wall-ghosts@2d9bc491` | #347 and paid builder | Same wall geometry/atlas for unpaid previews; compare semantic cells, logical links and indexed buffers, not one mesh per cell. |
| VIS28 [#360](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/360) | `feat/vis-28-reference-controls@5199ced6` | Camera and source portraits | Work/Fit, Move/placement controls, intent focus and guarded panning; actual combined input still needs final proof. |
| BASE06 [#365](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/365) | `feat/base-06-selection-dock@aefc942f` | World/portraits | Nonmodal owned-wall dock, Details, current HP and pending-action ownership; stage three desktop selection progressed, final combined selected-wall gate remains open. Include #390. |
| VIS39 [#394](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/394) | `fix/vis-39-combat-wall-tiers@01a50bab` | Actual stage four breach budget finding | Redundant wall stars removed; stage5/6 reported combat samples improve. Stage4 miss remains historical; final performance/device acceptance stays open. |
| VIS38 [#390](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/390) | `fix/vis-38-wall-selection-clarity@192e009a` | #365, #377 and actual stage three finding | Implemented corners and true-tier segment portraits; stage four actual visible bracket/four-component PNG evidence exists. Final polish/visual gate remains open. |
| BASE05 [#370](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/370) | `feat/base-05-reference-hud@0729faf5` | Existing controller progress | Real Best wave/current wave, captain in Menu, reversible Goals hiding and camera insets. Native HUD cases do not prove complete scene framing. |
| VIS35 [#369](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/369) | `feat/vis-35-core-landmarks@baca3a1e` | VIS32 and D064 consumers | Core state/publisher/renderer, record/statue and quieter planning guide; not headquarters progression. |
| VIS35 travel [#379](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/379) | `fix/vis-35-core-travel-rejoin@f52a05c5` | #369 | Guarded authoritative same-island/epoch/wave rejoin. Pure/controller/load tests are not a browser travel run. |
| VIS18 first stage [#357](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/357) | `feat/vis-18-material-activation@3593da52` | First four raw families | Historical actual checkpoint, explicitly visually rejected. Preserve its source/evidence. |
| VIS18 static [#362](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/362) | `fix/vis-18-static-art-retry@97054f3c` | Shared loader and static families | Refresh real static textures/geometry and expose registered loading failure/Retry. |
| VIS18 full raw [#372](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/372) | `feat/vis-18-full-family-activation@7477dea2` | Nine raw families, core/HUD composition | Raw registration plus core/progress task/retry bridge; later compiled activation is separate. |
| VIS36 [#374](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/374) | `test/vis-36-d064-captures@12fe7ab7` | Actual target runtime | Compiled-compatible capture; stage four helper 074a4675 matches all 3 recorded hashes. Both viewport functional journeys passed; final capture/helper hashes are preserved, while visual/device/full-suite acceptance stays open. |

## Evidence ledger: keep the source boundaries

Quoted checks below were read from committed records or the coordinator's raw
workspace reports. **This documentation task did not rerun app checks.** Counts
from overlapping commands must not be added together.

| Record | Exact source/result | What it proves and what it leaves open |
|---|---|---|
| Earlier perimeter complete suite | [Original record](../evidence/PERIMETER-VERIFICATION.md): 354 frontend files / 4,051 tests passed in 509.97s; backend 536,956 passed / 303 skipped in 941.81s; a11y 33 screens, demo 34 checks, overlaps 24 checks | Earlier perimeter candidate collected at `9dc1bea5`, with precise runtime/tree identities in that record. **These results do not validate the new visual source.** |
| Approved concepts | [Original concept manifest](../design/reference-village/approved-2026-11-17/manifest.json) | The visual target and original bytes. No gameplay, responsive or performance proof. |
| Rejected first materials stage | [Stage-one record and four actual captures](../evidence/VIS-18-stage-01/README.md), runtime `54c7f613` | Paid 102-wall fixture and real camera controls worked; close framing, visual scale and old markers failed the desired appearance. Its status stays **rejected**. |
| Intermediate nine-family actual game | Runtime `3d34f8b95e4af41b36d4cbe82f28bdfeb019a317`, frontend source tree `404dc874b5c381b8aa2eee26f014fd7427560609`; helper main `fc16920a` plus `9f19e4af` | At 1280×720 and 375×812: entry/Fit/held Tab/return/drag/remote ground pick passed, 102 paid walls and 6,660 coins preserved; 12 world/atlas pixel cases per viewport; no page errors/external requests. Both entries measured 116 draw calls. This stage still exposed the coast defect and is not final all-defense acceptance. |
| Cold shoreline correction | [Immutable paired evidence at `635b1114`](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/635b11149f900d45cbafbcecf24868d858839d5c/docs/evidence/VIS-37-cold-coast/README.md): before runtime `68330ddf`, after `7b165865` | Actual GPU inverse error fell from 0.004166666 to 3.7253e-10; alpha field difference remained 0 and both scenes measured 116 draw calls. The detached water cap disappeared in the actual 1280×720 image. This remains a nine-family intermediate scene. |
| Historical pre-transport checkpoint | [Immutable thirteen-family record](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/6a04dbedc01bf8c6fd21d3968f4b1d7dfc320014/docs/evidence/VIS-30-world-art/README.md), artifact commit `6a04dbed`; execution source `d39ba702` | 164 IDs; maximum density 4 is pixel exact against normalized original inputs. Including unchanged terrain: 29,819,059 → 13,608,302 encoded bytes. The 8,388,608-byte effort target is **not met**; This precedes the active lossless transport below. Lower-density filtering is explicitly not lossless. |
| Active lossless source transport | [VIS30 f6bbc967](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/f6bbc967a3676257660dbdc4028708e8810809d8/docs/evidence/VIS-30-world-art/README.md), provider activation e54b0f46 | All 13 active compiled file hashes match candidate public 9306942: 9,871,501 bytes plus 2,683,357 terrain = 12,554,858. Lossless zlib recompression preserves image content; 8MiB target remains unmet. This is active transport, not merely unactivated tooling. |
| Compiled-provider activation | [Draft #381](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/381), `e54b0f46`: 9 files / 35 tests passed in 3.28 s; build 1.11 s; spoiler guard 244 text files/12 protected lines clean | Cold title 18,825 JS/9,410 CSS bytes, no title image; unshipped originals in production: 0. Text lint 4,538 strings / 532 files, 0 errors / 8 report-only findings. These focused results do not constitute the new complete visual suite. |
| Historical stage-three attempt | Partial coordinator run in `stage-03-compiled/` | Desktop level-three upgrade/selection and Move/Cancel passed before a **failed ghost-toolbar visibility assertion**. Those partial PNGs never became a combined PASS. The later stage four run has separate source/evidence. |
| Stage four actual compiled game | [Twenty raw PNGs/report/manifest](../evidence/VIS-31-stage-04/README.md), runtime `414559fb`, helper `074a4675`; source/public/backend trees match main-ancestry candidate `59181376` | Both 1280×720 and 375×812 journeys passed entry/Fit/Tab/drag, paid L3 selection/Move Cancel, three-cell ghost/indexed buffers/Fine shore clearance, four real API moves, 21 paid walls / 42 upgrades and local legacy frozen-wave projectiles/breach. End 123 walls / 5,150 coins. Zero page errors/external requests; one offline 503 console message per viewport. Breach calls 152 / 151 still miss under 150; no full-suite/device/final visual pass. |
| Historical stage-six rendered review capture | [Twenty actual PNGs/report/manifest and comparison](../evidence/reference-village-visual-review/README.md), capture `9f47` / helper `074a4675`; later historical candidate `6e2c3e8b` has only the documented post-capture source changes | Both viewport functional journeys pass their declared paid camera/selection/Move/ghost/arranged-local-wave scope. Standing/firing/breach: 117/119/129 desktop, 116/120/129 phone; zero page errors/external requests, one offline 503 console each. Visible render/CSS/assets unchanged across those two sources; not a new latest-main screenshot or full-suite/device/balance pass. |
| First new complete-suite attempt | Runtime `9f47`; [raw output and source record](../evidence/reference-village-checks/README.md) | 4,402 passed / 27 failed in 609.82 s. Preserve this failed attempt. Thirteen failing files received focused green corrections with assertions/timeouts retained; the subsequent 6e2 complete run below still failed one case. |
| New complete-run retry | Frozen 6e2c3e8b; [raw output and source record](../evidence/reference-village-checks/README.md) | **4,463 passed / 1 failed**, 409 files (408 passed / 1 failed), 563.22 s. Defense-report ownership timed out at 20 s; this is a failed complete run, not acceptance. |
| VIS46 focused diagnostics | Candidates 4844c2c1, 4f69978f, 870e624b; [exact failed receipts](../evidence/reference-village-checks/README.md), app source/public/backend trees equal 6e2c3e8b | Initial sole-owner assertion **failed in 18.375 s** because `worldBusy` includes the report's own block. Derived-state and coherent veteran corrections timed out at 20.007 s and 20.013 s. Original actions, 24 rAF/high-quality/20 s checks remain; no completed input-resume pass is claimed. |
| Accessibility retry | Source 6e2c3e8b, [raw output](../evidence/reference-village-checks/README.md), 33 screens in 382.39 s | **Failed lobby keyboard audit only**; browser errors/external requests empty. Temporary markers were lost across legitimate refresh. VIS47 semantic-identity correction needs its own native result; no new accessibility pass is claimed here. |
| Unchanged multiplayer baseline | Documentation-only 8db343ba; [raw output/source record](../evidence/reference-village-checks/README.md), exit 1 in 65.84 s | Host/friend lobby and co-op construction progressed. The old per-wall-mesh observer then reported level 0 for a textured batched level-one wall. Later wave/revive/simultaneous-next/late-join/boss assertions were not reached. |
| Standalone comparison document | [Actual browser receipts](../evidence/reference-village-comparison-browser/README.md), HTML hash ee507bf4, Chromium 156.0.8078.79 | Owned-loopback HTTP passes both viewports: 8 decoded original images, 3 tablists / 27 real actions each, exact native dimensions, focus/selection/panel/overflow checks and zero page errors/external requests. Direct file-URI navigation was separately blocked before assertions. This tests the documentation page, not a later game runtime. |
| Latest-main stage-seven before record | [Selected-wall before images/raw capture/execution](../evidence/VIS-31-stage-07/README.md), source 5e3dd6cc, 208.25 s | Actual local journey completed at both viewports with 20 PNGs, zero page errors/external requests and one offline 503 console diagnostic each. The selected shore wall is still partly covered by foliage. This precedes the selected-wall correction and backend checkpoint guard; its before images remain distinct from stage eight. |
| Latest targeted backend/SQL | [Exact logs and selected-file lists](../evidence/reference-village-backend-checks/README.md), backend c7851960 / Supabase 6e52a63b | Initial a85f4f29: 262 passed / 269 skipped in 25.62 s, Ruff clean. Corrected scratch opt-in at 0d3589c2: 269 actual PostgreSQL checks passed in 15.56 s, zero skips. These are 26 selected files, not a fresh full-backend result; no live migration was applied. |
| Latest stage-eight actual capture | [Twenty final PNGs/report/execution and twelve-image comparison](../evidence/reference-village-latest-review/README.md), capture 91c1f9d5 / frozen check source 52f6bb15, 200.36 s | All four application trees match. Both local paid/camera/selection/Move/ghost/arranged-wave journeys complete; the selected wall is readable above foliage. Selected calls 119/116; combat 117/121/129 desktop and 116/120/129 phone. Zero page errors/external requests; one expected offline 503 each. Complete checks and native new-document check remain pending. |
| HUD focused proof | [BASE05 spec](../../specs/BASE-05-reference-hud.md), runtime `60573698` / final doc head `0729faf5`: 5 native HUD cases, 3 selected legacy coin cases, 20 model cases passed in separate commands | Desktop/phone/320px HUD semantics and controls, Goals restoration and coin compatibility. No final combined scene, a11y/demo or live-account claim. |
| Wall tier correction | [Correction spec](../../specs/VIS-14-level-one-wall-art.md), head `b84eadfc`: 7 files / 76 tests passed in 3.81s | All canonical damage tiers, world/combat UV buffers, fallback/API/scene/preload cases. No combined final visual or live recovery acceptance. |
| Core optional travel correction | [Handover](../handoff/vis35-core-travel-rejoin.md), `f52a05c5`: 6 files / 49 tests passed, build/spoiler guard passed | Guarded rejoin, actual controller and island-load behavior; browser travel/full-suite/live cases remain unverified. |

The intermediate nine-family camera files currently live in the coordinator
workspace under `stage-02-reference/` (four raw PNGs and `report.json`). Their
repository publication is **pending** in VIS36/VIS31; no broken or fabricated
download link is provided here. The shore-correct desktop image is already
preserved by the immutable VIS37 evidence link above. Stage-three desktop PNGs remain partial diagnostics from a failed run.
The later [stage four package](../evidence/VIS-31-stage-04/README.md) now supplies
twenty raw actual frames and its exact source/helper/hash records. The later
[rendered review package](../evidence/reference-village-visual-review/README.md)
supplies the stage-six combat/HUD source and evidence; final human visual
acceptance remains open.

The 116-call observation is below the unchanged under-150 target for that
declared scene. It does not prove the worst-case battle, sustained frame rate or
a physical phone. Decoder residency, final world canvases, atlases, GPU textures,
encoded transfer and draw calls measure different costs. The compilation record
keeps the 12MiB decode pool, two-decode cap, 8MiB encoded-source cap and existing
40/12MiB atlas budgets distinct; summed source RGBA is not simultaneous memory.

## Remaining gates and useful parallel work

| Gate | Current state at snapshot | Evidence needed to close it |
|---|---|---|
| Complete defense appearance | All thirteen source families/ 164 IDs compiled and configured, including all five defenses; final appearance acceptance open | Exact source/provenance, all supported levels/states and configured world/combat/portrait receipts for all supplied families. |
| Production asset handoff | Active VIS30 f6bbc967 / VIS18 e54b0f46 sources match public 9306942; 12,554,858 bytes with terrain still misses 8MiB | Every active compiled source is shipped and exists; inactive originals stay on disk and out of downloads; actual build/cold results and final whole-world bytes are recorded. |
| Final visual acceptance, VIS31 | Latest stage-eight package includes the actual selected-wall foliage correction; human visual acceptance remains open | Cliffs/scenery remain less detailed than the approved concepts. The bounded selected-wall presentation does not remove all scenery occlusion. Review composition, supported states and source/fixture differences; actual captures do not replace independent human acceptance. |
| Playable placement/upgrade proof | Stage four both-viewport functional journey passed selection, actual 40-coin upgrade, Move/Cancel, semantic/indexed ghost and arranged paid layout; final visual review remains open | Real upgrade price/wallet, current level/HP, Move/cancel, exact valid/invalid snapped cells, semantic draft cells and rendered indexed buffers agree. |
| New visual full-suite gate | Latest frozen source 52f6bb15 sequence is **PENDING**. Historical 6e2/4844/lobby failures remain source-specific; later focused success does not replace a complete run. | Fresh `npm test`, build/spoiler guard, budget, a11y, demo, overlap, text lint and multiplayer on the exact latest source, with actual result lines. |
| Combat and failure/quality gate | Latest stage-eight samples 117/121/129 and 116/120/129 are below 150; broader acceptance stays open | Sustained/worst-case performance, quality/failure/device evidence and actual damage/muzzle/HP alignment. Local legacy demo does not prove production V1 durability or live multiplayer. |
| Balance | Not signed off | Progressed local seed and rendering/breach proof do not establish multi-seed/multi-wave difficulty or economy balance. |
| Land expansion / growth | Not implemented by this visual phase | D064 preserves the existing analytic coast and paid footprints. Separate expansion/progression tasks need their own implementation and review; decorative pixels grant no territory. |
| Browser/device coverage | Chromium component/local evidence only | Safari and physical touch hardware are unverified. A Linux Chromium screenshot is not a Safari or real-phone test. |
| Human explanation/review | Pending | Johannes rehearses the code route and three questions below; a different human reviews the current head. AI review does not satisfy that approval. |
| Live rollout | Not performed/authorized by this document | Separate human migration/flag/deployment sequence from the existing runbook. Draft readiness is not rollout completion. |

Source-family review can proceed in parallel with documentation and independent
pure state review. Only one writer owns each branch, shared files have an explicit
owner, and the coordinator serializes composition. Browser captures use a
reserved quiet Chrome slot so resource contention does not become a reason to
relax existing assertions. A new task must first be claimed in its existing
issue/branch/PR; this table does not reserve unclaimed work.

## Reproduce and report without overstating a result

Use [ENGINEERING section 3](../ENGINEERING.md#3-commands) for the supported setup
and commands. From `frontend/`, the relevant final checks are:

~~~bash
npm test
npm run build
node scripts/report-budget.js --check
npm run test:a11y
npm run test:demo
npm run test:overlaps
~~~

From the repository root, run `node scripts/text-lint/index.mjs`. Browser
commands need installed Chrome; set `CHROME_PATH` to the available binary when
needed. The actual-game helper accepts a separately pinned runtime frontend. For this
latest stage-eight checkpoint, VIS36 helper revision `12fe7ab781b2223de191485170aa48f664e4b91e`
is code-identical to `074a4675b99c68a41604bb1658943f5dfb1ee067` and compiled-compatible. The older helper in this documentation review base still
requires nine raw families; it cannot capture the configured compiled provider.
Use a separate helper checkout instead of changing an active writer's checkout:

~~~bash
git clone --no-checkout https://github.com/Nilsnova/The-Great-Plot-Twist.git \
  /absolute/path/to/helper-checkout
git -C /absolute/path/to/helper-checkout checkout --detach \
  12fe7ab781b2223de191485170aa48f664e4b91e
cd /absolute/path/to/helper-checkout/frontend
npm ci --include=dev --no-audit --no-fund
node scripts/capture-village-composition.mjs \
  /absolute/path/to/runtime-at-91c1f9d5/frontend /absolute/path/to/output reference --arranged --wave
~~~

This uses the preserved helper and latest capture runtime with declared arranged/
local-wave scope. All four application trees match frozen verification source
52f6bb15; documentation-only paths differ and are listed in the latest manifest.
A new capture must record its new source/helper hashes; an older raw-
family-count assertion cannot establish compiled acceptance.
The current source list and exact bake invocation are in the artifact record.
No app command above was run by this docs task. Backend/SQL results stay attached
to their earlier source unless backend changes justify another run. Capture
process output and exit status, distinguish mocks/fakes from real boundaries,
and report missed targets instead of weakening a check or changing a limit.

## Explain-back and current-revision human review

Follow [EXPLAIN-YOUR-CODE](EXPLAIN-YOUR-CODE.md). This map supports learning; it
does not claim Johannes has already understood or rehearsed the whole package.
Keep personal rehearsal answers local and explain the actual chosen code.

Be able to trace a visible frame from original hash to metadata, normalization,
shared world/atlas dimensions and cleanup. Then trace a grid click through the
inverse projection, a paid quote/confirmation through the server, and a health
update through its exact wave/island context. Explain why generated concepts,
recording-canvas tests, GPU readback, local fake gameplay and live SQL evidence
answer different questions.

Ask Johannes these **three questions**, one at a time, before marking anything
ready; require him to open the functions and predict an example:

1. If a building source becomes twice as large in pixels, what changes on screen,
   and what must stay unchanged in its paid footprint and saved position? Show
   where its visual foot and a pointer-ground inverse are defined.
2. A wall purchase reply is lost, then the island is reset before Retry. Which
   state/receipt can be reconciled, which request must be refused, and why can
   the browser not simply replace its intent ID or award the wall locally?
3. A player leaves and returns during the same active wave. What authoritative
   proof allows the core display to resume HP updates, and what prevents a late
   publisher from another island or epoch from changing this core?

After rehearsal, review the current diff/evidence and ask a different human
teammate for a current-head review. No particular teammate is a mandatory
gatekeeper; choose someone able to inspect the relevant rendering/state boundary.
Do not mark a PR Ready merely because an agent completed focused checks, and do
not merge from this guide.

## Handover at this documentation snapshot

- **Changed:** a detailed review map for the current visual phase and its real
  component drafts, dependency order, source/evidence boundaries and explain-back.
- **Verified:** documentation links/content, copied file hashes/dimensions and
  source/helper tree identity. Quoted stage-eight actual captures and targeted
  backend results retain their precise sources; packaging reran no app suite/browser.
- **Not verified:** the latest 52f6 complete sequence/native twelve-image document check, Safari/physical devices,
  sustained performance, balance, land expansion, live deployment and human
  understanding/visual approval. Cliffs/scenery remain less detailed; the selected
  wall is corrected, while other scenery occlusion retains its normal scope.
- **Remaining:** inspect the exact latest complete results, preserve historical failure boundaries and address remaining
  performance/visual/device/balance work, then the coordinator addresses the
  acceptance gates above and hands the current revision to an independent human.
- **Branch/PR:** `docs/reference-village-handover`,
  [Draft #388](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/388).
