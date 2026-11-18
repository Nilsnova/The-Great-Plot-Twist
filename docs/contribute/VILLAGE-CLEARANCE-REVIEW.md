# Village wall clearance and visual review

For **Johannes Franz Lang (`frcola`)** and a different human reviewer. This guide
explains the follow-up after the user reported walls crossing objects and an
appearance still below the approved island reference.

**The review package is complete; application checks are not fully green.**
The final frontend has **4,906 passes / one unchanged 20-second input timeout**.
Native multiplayer stops at the known own-musket-pose check, **0 versus 2**.
Paid tiers, actual-game captures, native art fixtures and the stated accessibility,
demo, measured-layout, build, budget and text checks passed. The final targeted
backend run passed **1,792 checks with zero skips**, plus whole-backend Ruff.
All PRs remain Draft; visual acceptance, explain-back and different-human review
are open. No PR merge, live migration or deployment is recorded.

## Review order and ownership

The base retains current main `48aee0e7` and the earlier visual preview
`2a2e9651`. Teammate playtest fixes and new path/skill marks remain inherited.
[D065](../DECISIONS.md#d065--wall-clearance-and-upright-presentation-follow-up--2026-11-18)
records the bounded presentation and clearance revision.

| Work | Draft PR | Review question |
|---|---|---|
| VIS62: prospective scenery clearance | [#443](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/443) | Do client, fake and trusted Python reject the same real ground conflicts before payment? |
| VIS63: truthful selected-wall depth | [#444](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/444) | Is the selected post drawn once at ordinary depth, with only the existing green corners in front? |
| VIS64: upright wall volume | [#447](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/447) | Do normalized original pixels, tier profiles, health labels and shared world/combat geometry agree? |
| VIS65: sea material | [#446](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/446) | Are stronger surface/depth colors confined to the existing material and controls? |
| VIS66: one decorative corridor move | [#450](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/450) | Do the single barrel foot and both prospective reserves move together, with existing saves retained? |
| VIS68: original-wall normal purchases | [#455](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/455) | Does the ordinary owner/friend purchase guard protect both policies atomically, while preserving retries? Final targeted backend/SQL proof passed; migration and coordinated deployment remain human steps. |
| VIS67: independent wall observer | [#451](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/451) | Do unchanged negative cases still reject stale/wrong buffers under the revised presentation contract? |
| VIS61: assembled review | [#445](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/445) | Does the actual combined game match the evidence and retain current-main behavior? |
| VIS61: documentation | [#452](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/452) | Are original captures, exact sources, failed attempts and limits stated accurately? |

Issues are [VIS61 #438](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/438),
[VIS62 #439](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/439),
[VIS63 #440](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/440),
[VIS64 #441](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/441),
[VIS65 #442](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/442),
[VIS66 #448](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/448) and
[VIS67 #449](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/449) and
[VIS68 #454](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/454).

The aggregate preview contains earlier dependencies and is an inspection branch.
VIS63/#444 and VIS64/#447 share the changed batching API and must be reviewed as a
coordinated rendering stack with VIS67/#451 and the tested assembled preview.
Neither leaf is a standalone deployment recommendation.
Review the focused changes rather than treating the aggregate as a blanket merge
recommendation. Suggested review split: Nico for rendering/readability and Ianno
for the preserved placement/recovery boundary, subject to the team's assignment.

## Two defects that needed different fixes

The historical 102-piece review ring intersects five of the nine tree trunks at
nine wall cells. Those screenshots faithfully showed a layout the earlier
validators accepted; shrinking tree crowns could not correct the ground conflict.
Separately, selecting a wall copied its post and connected spans into a global
foreground draw at order `199`. A wall could then paint opaque pixels over a
nearer tree or building even where its paid footprint was legal.

The follow-up changes placement and rendering separately. A new explicit wall
intent cannot overlap the existing tree circles or documented prop bases. A
selected wall keeps ordinary painter depth; its green exact-footprint corners
and dock remain the selection indicator. Neither fix rewrites a saved wall.

## How the prospective clearance works

[`wall-obstacles.js`](../../frontend/src/island/wall-obstacles.js) contains the
browser's immutable copy of `wallObstacles` from
[`island_layout.json`](../../backend/content/island_layout.json). The production
[`placement.js`](../../frontend/src/island/placement.js) preview and authoritative
[`layout.py`](../../backend/server/island/layout.py) check the same geometry:

- Nine circles use the actual home-tree centers and radius `0.48`.
- The bench, barrel, lantern, record board and future statue reserve their ground
  bases. Their upright artwork and tree canopies are not treated as ground boxes.
- Wall squares use the unchanged paid `2 × 2` footprint. Touching without an
  intersection remains legal; circle/square checks measure the nearest point.
- The guard applies to future explicit wall intents. Existing seven `KEEP_OUT`
  entries, route admission, legacy wall settlement, colliders and simulation are
  unchanged. Towers and houses retain their existing placement rules.

The local fake uses the same client rules. The trusted quote and move paths use
the Python validator, and positioned construction re-quotes before its atomic
snapshot-fenced RPC. A separate normal-build follow-up, [VIS68 #454](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/454),
closes the original-wall purchase bypass with separately tested atomic authority.
The intermediate paid capture alone does not establish that server/SQL guarantee. VIS62's positioned quote/Move guard needs no new migration; the separate regular-build
follow-up owns any required atomic SQL change. An exact paid receipt is
reconciled before revalidation: it remains the same receipt rather than charging
again or reconstructing a demolished/reset piece. See
[VIS62's authority and tests](../evidence/VIS-62-scenery-clearance/README.md).

## Ordinary purchases need atomic checked authority too

Independent review found a separate bypass after the explicit quote/Move guard:
an ordinary owner/friend purchase could still buy an old empty original wall
site on scenery. A raw stored coordinate cannot authorize that fresh purchase:
legacy settlement can display the site somewhere else. [VIS68/Draft #455](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/455)
and [D066](https://github.com/Nilsnova/The-Great-Plot-Twist/blob/chore/vis-61-clearance-review/docs/DECISIONS.md#d066--atomic-authority-for-every-fresh-original-wall-purchase--2026-11-18)
define the mandatory checked normal-build wrappers that close this path.
The final strict implementation passed the targeted real PostgreSQL/HTTP selection.

The wall-only service path supplies the effective displayed cell and complete
atomic layout snapshot. Under the existing payer-wallet then owner-island lock
order, the wrapper preserves original UID replay/already-built results first,
fences policy/capacity/every raw row, materializes only the fresh purchase's checked
cell only when it differs from the current raw/default coordinate, then performs
the original payment/build in the same transaction. A default purchase adds no
layout row, and matching raw metadata stays unchanged. A refusal
must roll back that materialization too. Fresh insertion requires transaction-local
authority matching owner, plot and checked coordinate; raw rows alone are insufficient.
Old-signature fresh purchases fail closed. Existing paid reads, retries and health
upgrades are not converted into layout cleanup; non-wall calls keep their old signatures.

The additive 72nd migration, `20261118060000_wall_single_build_clearance.sql`, is
written for review/private tests only. The human owner applies it before deploying
the corresponding backend; missing mandatory overloads fail closed without an
old-signature fallback. No agent applies it live. The earlier 41 new / 182 broader SQL
passes on the initial e57 source do not establish closure of the later raw/effective
authority gap. The final strict compatibility source `456960d0` passed all 1,792
selected checks with zero skips in 76.98s; the earlier wide failure is preserved.

## What selection now draws

[`wall-connections.js`](../../frontend/src/island/wall-connections.js) rebuilds
ordinary wall batches when the selected ID changes. The selected straight wall
keeps its full actual-tier post once, inside the normal `100 + z` depth layers.
The former opaque `wall-selection.js` foreground copy is removed. The existing
[`selection-bracket.js`](../../frontend/src/island/selection-bracket.js) supplies
the green paid-tile corners; it does not copy wall textures or incident spans.

The batching options distinguish an actual selection from diagnostic filtering:
`{selectedId: null, selectionOnly: false}` is the normal default. A read-only
`wallSelectedId` diagnostic names only an existing current post, and clears for
unknown, removed or disposed selections. The independent observer can recognize
the selected full post without guessing from whichever buffers happen to exist.
[VIS63's guide](../evidence/VIS-63-wall-selection/README.md) explains lifecycle,
buffer reuse and disposal checks.

## Why the wall silhouette is more substantial

[`walls.js`](../../frontend/src/art/village/walls.js) uses tighter authored source
rectangles and one common state fit per tier. The original source PNG bytes remain
unchanged. Intact, damaged and broken frames share their source normalization and real ground
foot. The renderer retains its existing `0.75` width factor for connected intact
junction posts; common fitting does not mean every state has identical geometry. The upright logical box changes from `48 × 32 / anchor 6` to
`48 × 48 / anchor 6`; this is presentation, not a larger paid footprint.

[`wall-batches.js`](../../frontend/src/island/wall-batches.js) uses five heights
`[1.45, 1.70, 1.95, 2.10, 2.20]` and visual half-width `0.40`. Rear projection
adds `0.24`, and the cap lift adds `0.02`: the maximum cap is `2.46`, below the
measured level-five solid post top of about `2.477`. This checks visible source
content rather than relying only on the taller logical box's `2.625` top.

The existing full-side contact topology remains authoritative. A diagonal or
partial contact is not turned into a join. Mixed-tier links use the lower tier,
and a broken wall keeps its real paid gap. World and combat share the drawing
implementation. Health-label presentation is adjusted for the taller art; HP,
phase, color and repair logic remain unchanged.

The existing native compiler processed only the wall family. The old active
proof is preserved byte-for-byte, and the active aggregate proof changes only
owned wall records/totals with explicit replacement history. Unrelated compiled
families and raw PNGs are unchanged. The new active world-art-plus-terrain transfer
is **12,950,770 bytes**, above the unchanged **8 MiB effort target**. The result
does not close the art budget. See [VIS64's source/compiler evidence](../evidence/VIS-64-upright-walls/README.md).

## Sea lighting and the one decorative move

[`water.js`](../../frontend/src/world/water.js) adds broader crossing reflections,
deeper blue-green pockets driven by the existing coast field, and restrained
near-shore caustics. This is artistic shading, not measured water depth or a
navigation rule. A later refinement removes the visible periodic lattice seen in the intermediate
L5 capture, retaining warped broken contours with the same noise-sample count.
The existing mesh/material, shared coast texture, projection,
clock, weather, low/high detail and reduced-motion paths stay in place. Added
procedural arithmetic can still cost GPU time; unchanged resources do not prove
unchanged performance. [VIS65](../evidence/VIS-65-sea-depth/README.md) records the
precise source boundary and isolated checks.

Only the unsaved decorative barrel moves, from `(-12, 7)` to `(-10.5, 8)` in
[`layouts.js`](../../frontend/src/world/places/layouts.js). Its matching browser
and server reserves move to the same point; the box stays `1.25 × 0.75`. It has
no collider, saved entity or interaction zone. No tree or other prop is moved.
This clears the existing two-unit corridor between cabin and wreck.
[VIS66](../evidence/VIS-66-barrel-clearance/README.md) verifies the actual scene
foot, normal depth, nine unchanged tree colliders and both corridor cells.

## Saved layouts and the comparison's exact meaning

The large perimeter fixtures explicitly enable the local `perimeter_walls`
policy. They do not establish production flag/cohort admission or live rollout.

Clearance is prospective. Old paid walls remain at their stored coordinates,
including any historical conflicts. The decoration change also cannot guarantee
that every old possible layout is clear: VIS66 retains actual examples where
formerly legal cells `(-12, 8.5)` and `(-12, 9)` intersect the new barrel reserve.
Reads remain unchanged. Normal free Move is the manual review path; this work
does not silently move, delete, hide or refund those paid walls.

The new review arrangement intentionally uses normal purchase/quote/Move actions.
It contains a separately named 102-wall outer cycle measured against all fourteen
non-wall reservations, all nine tree blockers and five prop bases, plus 21 paid
inner partition pieces. Its west service opening is a real gap, not a newly
implemented gate. The old `perimeter-ring.json`, old arranged fixture and original
images remain historical evidence.

Before/after pictures therefore compare a corrected paid demonstration layout
as well as revised drawing. They are not evidence that loading the new code
automatically rearranges a player's save. Declared local fake funds and best-wave
values are fixture setup, not a default save or production wallet.

## What the integration checks caught

Individual legal cells did not prove that the first inner-wall draft formed a
continuous quoted chain. The actual client quote test rejected its discontinuity.
The fixture was corrected rather than weakening the full-side chain contract.
A second unchanged main test caught an upright path badge offset of `-0.62`
being multiplied by the ground projection to `-0.806`. The badge now receives its
screen-facing offset after its building foot is projected, matching combat.

The [original selected-check logs](../evidence/village-clearance-review/integration-fixture-checks/checks.json)
retain 80 passes / 2 failures and then 82 passes across eight files in 11.63s, plus
38 targeted backend passes in 3.75s. These working-tree checks precede the final
frozen runtime and are not relabeled as complete application verification.

## Exact final verification and remaining gates

The frontend UI source is `68d41990`. Its application, public, script and test
trees match the final backend snapshot `456960d0`; backend and migration identities
match the separate targeted PostgreSQL receipt. See the [source record](../evidence/village-clearance-review/source.json).

| Check | Exact result and scope |
|---|---|
| Full frontend | **4,906 passed / one failed**, 435 files (434 passed / one failed); **622.73s Vitest / 623.58s process**. Only the unchanged input-ownership case times out at 20 seconds; no retry, skip or timeout relaxation. |
| Accessibility | **33 screens**, failures/errors empty; **407.00s**. |
| Demo | **34 checks**, errors/external requests empty; **86.98s**. |
| Measured layout | **21 cases passed**, three nonapplicable rows retained; **89.37s**. This does not prove every transient battle-HUD timing is clear. |
| Build/spoiler guard | Passed, **2.32s process / 1.34s Vite**; 245 text files / 12 protected lines. |
| Title budget | Passed, **18,959 / 21,080 JS bytes**, **9,410 / 12,000 CSS bytes**, no title image; **0.29s**. The separate world-art effort target remains unmet. |
| Text lint | **0 errors / 8 report-only findings**, 4,579 strings / 535 source files; **2.01s**. Root's final static text check is retained separately. |
| Paid game progression | Passed, **335.84s**, **28 original PNGs**, **984 paid upgrade receipts** across both viewports; all 123 walls reach levels 1–5. Five real Fit overviews per viewport supplement Work views. |
| Actual game journey | Passed, **210.61s / 20 PNGs**; declared 8,000 coins end at **5,150**, 123 paid walls, selection, canceled Move, unpaid ghosts, firing and real breach. |
| Native renderer matrix | Passed, **12.79s / 22 labeled sheets**; existing 100 defense poses and five wall tiers/states, real-buffer negative controls. These are fixtures, not gameplay/progression proof. |
| Native multiplayer | **Failed after 371.10s**, own musket pose **0 versus 2**, `check-multiplayer.js:814`. Only `fake-wave-1` owner/Ben has **113 distinct matching ship/boarder pairs**, worst drift 0/0, 20 with boarders; heart/militia **84/84** each. Ana/Max joined, but later-wave comparisons, boss and finisher were not reached. |
| Targeted backend/SQL | **1,792 passed / zero skips**, 36 selected route/unit files plus all 51 island-SQL modules; **76.98s pytest / 78.38s process**. Whole-backend Ruff passed in **0.22s**. Private disposable PostgreSQL/HTTP only; not a complete-backend rerun. |

The first wide backend attempt on `a76e9ccc` had **1,758 passes, five failures and
21 setup errors in 141.77s**, with Ruff passing. Its original report/log remain.
The conditional fresh-cell materialization fix retained matching raw/default
metadata, added eight PostgreSQL regressions and passed the identical wide target.
Fresh-purchase fixture coordinates were also adapted where the new scenery
constraints made the old values invalid; assertions were not relaxed.
Earlier partial SQL passes are not relabeled as proof of the final authority boundary.

Paid snapshots retain High and use a normal viewport refresh to establish drawing
density 1 / DPR 1. The ordinary actual-game helper retains its inherited Low-to-High
reset before snapshots. Both establish full-resolution stills rather than sustained
FPS, physical-phone/Retina behavior or Safari support. Contact sheets can exceed
their declared viewport height because they record the whole fixture page.

The phone bell-hint/countdown-toast overlap remains visible and was also present
in source `7fab8866`; [the original before/current views](../evidence/village-clearance-review/README.md)
are retained. It is an inherited HUD gap, not a claim of complete battle-HUD acceptance.
Wall damage remains subtle at small scale; the existing watchtower level-1-to-3
art reuse and wider scenery/defense proportions are not redesigned here. The
new source remains below the reference's full detail and needs human visual acceptance.
Live persistence/provider behavior, physical devices, sustained performance,
production admission and owner-applied migration/deployment remain unverified.

## Evidence and walkthrough

[The evidence index](../evidence/village-clearance-review/README.md) records the
exact runtime/code identities, original captures, command outputs and remaining
checks. The [previous polish guide](VILLAGE-POLISH-REVIEW.md) retains the prior
112-image package and mixed test outcomes; those results are not relabeled as
fresh checks of this follow-up. The
[approved generated concepts](../design/reference-village/approved-2026-11-17/README.md)
remain labeled concepts. Official reference imagery is not copied into the game.

In my words: I corrected two different problems. The server and browser now keep
new wall squares off real scenery bases. The renderer no longer paints the
selected wall over everything in front. I refitted the existing wall pixels and
shared joins so tiers read as upright walls, and moved one harmless barrel to
leave a usable corridor. Existing paid coordinates and battle rules stay theirs;
the improved example layout is built through normal actions. Captures and pure
checks establish specific behavior, not live persistence or sustained performance.

Before marking a PR ready, answer aloud:

1. Why does rejecting a new overlap not repair an old saved layout, and why must
   an exact old payment receipt still reconcile first?
2. Why can the selection corners draw in front while the opaque wall post must
   stay at its ordinary depth?
3. Why must taller posts, shared cap height, source feet, damaged states and health
   labels be verified together?

A different human reviews the current revision. Human visual acceptance,
explain-back, physical Safari/device checks, sustained performance and live
persistence remain separate. No agent marks this ready or merges it.
