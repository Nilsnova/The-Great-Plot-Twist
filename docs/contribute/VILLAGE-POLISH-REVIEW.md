# Village polish: code and evidence review

For **Johannes Franz Lang (`frcola`)** and a different human reviewer. This guide
explains the presentation follow-up to the existing reference-village build. It
does not record completed human approval or a deployment.

**Review status: combined checks are in progress.** Final actual-game captures,
native terrain, the first renderer matrix and both paid-tier walkthroughs have
completed. The caption-corrected matrix, comparison-page browser check and full
application receipts remain pending. Pending entries below are not passes. All
linked PRs remain Draft.

The user's latest constraint is to keep the game that teammates have playtested
and improve how it looks. Relative to fixed before source `6c87b8dc`, this pass
changes five presentation files. It retains the paid grid, wall IDs, colliders,
controls, prices, progression, wave rules, saves and high-score behavior. Newer
main's playtest changes are inherited through a separately reviewed base.

## Open the evidence

- [Evidence index and exact source record](../evidence/village-polish-review/README.md).
- [Offline before/after page](../evidence/village-polish-review/comparison.html):
  twelve unchanged actual PNGs compare Village, Combat and Selected wall at both
  sizes. Keep its relative image folders together. Its native browser check is
  separate and remains pending.
- [Previous reference-village guide](REFERENCE-VILLAGE-REVIEW.md) preserves the
  older 50-component review and its mixed test results. Those historical passes
  and failures are not relabeled as checks of this follow-up.
- [Approved generated concepts](../design/reference-village/approved-2026-11-17/README.md)
  are design references, distinct from actual game screenshots.

Official [Supercell gameplay imagery](https://supercell.com/en/games/clashofclans/)
and the [App Store listing](https://apps.apple.com/us/app/clash-of-clans/id529479190)
were studied for wall continuity, compartments, readable proportions and foliage
spacing. Their images are not copied into this repository or shipped by the game.
The implementation retains its existing original pirate-village artwork.

## Review the focused PRs

| Order | Work | Draft PR | What the reviewer should establish |
|---|---|---|---|
| 1 | VIS57: preserve current main and the prior visual preview | [#426](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/426) | Both histories and all teammate fixes survive; the renderer uses smoothed coordinates with the existing projection; migration versions are unique. |
| 2 | VIS54: home-tree clearance | [#427](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/427) | Smaller artwork leaves exact tree feet, blockers, player fade, wind and house growth intact. |
| 3 | VIS55: connected wall details | [#428](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/428) | Real tier posts, cap trim and profiles improve readability without changing paid positions, contacts, health or gaps. |
| 4 | VIS58: landscape materials | [#431](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/431) | Ground color/texture sampling and rock lighting change inside the original masks; native alpha and fallback bytes are retained. |
| 5 | VIS56: existing-level renderer fixtures | [#430](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/430) | The actual compiled frames and shared wall renderer cover the real level/state catalogue; fixtures are labeled honestly. |
| 6 | VIS56: assembled actual-game review | [#432](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/432) | The composed source has matching screenshots, paid-action proof and fresh regression results. |
| 7 | VIS56: this documentation package | [#433](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/433) | Claims, sources, raw receipts, copied bytes and remaining gates agree. |

Issues: [#422](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/422),
[#423](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/423),
[#424](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/424),
[#425](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/425) and
[#429](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/429).

The two assembled preview branches retain many earlier dependencies. Their small
component PRs, not a wholesale aggregate merge, are the review units. A different
human must approve the current revision; agent review does not replace that step.
Suggested review split: Nico for rendering/readability and Ianno for the preserved
recovery/migration boundary, subject to the team's own assignment.

## What changed and why

### Trees: preserve the blocker, reduce the crown

[`createSettlement()`](../../frontend/src/world/places/settlement.js) still creates
the nine home trees at the coordinates in
[`layouts.js`](../../frontend/src/world/places/layouts.js). Each tree retains its
radius-`0.48` collider and painter order `100 + z`. Home-tree meshes receive a
uniform `0.70` visual baseline before their existing progress decorator captures
that baseline. Other destinations retain their previous scale.

[`decorateProgress()`](../../frontend/src/island/decorations.js) continues to
multiply the baseline by `1`, `1.1` or `1.2` for zero, one or two existing houses.
The resulting home-tree scales are `0.70`, `0.77` and `0.84`. Removing a house or
disposing the decorator follows the existing restoration path. The change does
not relocate trees, clear obstacles, add resources or change legal build space.

Smaller crowns improve the view of the island's perimeter and inner structures.
They do not guarantee that every possible player layout is free of canopy
overlap. The existing selected-wall foreground overlay remains available; normal
walls are not raised above every tree or building.

### Walls: show existing detail without adding a draw object per cell

[`wall-batches.js`](../../frontend/src/island/wall-batches.js) uses the existing
original wall post and surface frames. Uniform straight runs previously replaced
every middle post with a tiny top quad, including the selected segment. The
follow-up keeps full authored posts at corners, ends, branches, mixed tiers,
damage, selection and sparse regular buttresses.

Buttresses use the varying logical coordinate: every third two-unit cell keeps
its post. Their placement does not depend on input-array order or renamed IDs.
Other straight cells retain a simple cap. A post replaces its former cap quad;
it does not create a new draw object. The existing fourth span face becomes an
upright trim face using the current top texture. A connected span still has four
quads, and all existing painter layers remain unchanged.

The five visual heights are `0.95`, `1.15`, `1.25`, `1.35` and `1.43`.
These heights include a deliberate correction discovered during independent
review: ground projection adds `0.168` to the rear of the cross-section, and a
straight cap adds another `0.02`. The highest shared straight cap is therefore
`1.43 + 0.168 + 0.02 = 1.618`, below the authored post top `1.625`. Initial
profiles that exceeded that bound are retained in the component's red evidence.
This bound describes shared standing joins and straight caps; the inherited
terminal decorative extension is a separate existing behavior.

[`wallTopology()`](../../frontend/src/island/wall-connections.js) remains the
authority for exact contacts. Adjacent standing walls share a full two-unit side;
partial sides and diagonal corners do not connect. A mixed-tier link uses its
lower endpoint tier. A broken wall removes its adjacent joins and keeps its
ruin at the same paid position. Village and combat continue to share the drawing
implementation through the existing combat adapter. No health, pathfinding,
purchase, upgrade, refund, collider or simulation rule changes in this leaf.

### Ground: reduce competition with the buildings

[`ground.js`](../../frontend/src/art/ground.js) reduces the existing grass
material blend from `0.82` to `0.60`, letting the broad green lighting read more
clearly. [`terrain-materials.js`](../../frontend/src/art/village/terrain-materials.js)
changes the path texture's world sampling period from `4 × 2.88` to
`5.5 × 3.96`. Pavers become larger without moving or widening a path, clearing,
source rectangle or building anchor.

[`coast-cliffs.js`](../../frontend/src/art/coast-cliffs.js) strengthens upper
lighting and lower shadow on the existing rock material. Seam colors change;
the original stroke alpha values are retained. Cliff depth remains `3.2`, shallow
approach depth remains `0.35`, and all three naval coves use the same profile.
The water shader, walking surface and ownership rules are unchanged.

The native painter proof compares every one of the `2,408,448` alpha bytes at
`1792 × 1344`, the thresholded coast mask, exact profile, source PNG/crops and
fallback RGBA. All match while the shaded terrain's RGB changes. This proves a
specific boundary invariant; it is not proof of full-game play or performance.

### The teammate base: preserve, do not redesign

[VIS57's audit](../evidence/VIS-57-playtest-base/README.md) retains main
`66d29ea9` and earlier preview `e636ae75` as ancestors. It inspects all 46 incoming
paths, including 19 overlaps. The sole renderer conflict uses the main smoother
while supplying its smoothed `x` and `z` to the existing projected ship metadata.
The main's carried-weapon, throw, loot, repair and movement fixes remain inherited.

Main's playtest migration and the unmerged accepted-checkpoint guard had
independently reserved version `20261118040000`. Only the unmerged guard moves
to `20261118050000`, with its SQL body unchanged.
Main's `18040000_playtest.sql` is byte-identical. There are 71 unique migration
versions. The guard still requires an accepted first checkpoint; main's existing
full-repair-at-wave-end settlement remains intact. No live SQL was applied.

## The existing levels covered by review

| Existing structure | Level/state scope |
|---|---|
| Walls | Levels 1–5; intact, damaged, broken, connected, mixed and selected states. |
| Cannon, mortar, harpoon, culverin, swivel | Five levels each, with intact/firing/damaged/broken frames: 100 registered defense poses. |
| Houses | Levels 1–3, including existing barracks, tavern and workshop role variants. No level-5 house is invented. |
| Watchtower | Gameplay levels 1–5; its existing artwork intentionally shares the level-1 appearance for levels 1–3, then uses distinct level-4/5 artwork. |
| Cabin and services | Their existing single-building appearances. |
| Core | Its existing intact, damaged and broken appearances. |

The renderer matrix exercises these existing inputs. It does not add unlocks,
automatic upgrades, new building systems or automatic island expansion. Upgrades
retain the existing manual/server-governed rules.

## Source chronology and evidence boundaries

| Source | Role and exact limit |
|---|---|
| `6c87b8dcd2d7a1bb5376c3b64bbede27a144479e` | Fixed before source: latest-main-preserving base, actual full journey at both viewports, 20 PNGs, exit 0 in 215.30s. |
| `65bda4fd750e4a2001fecc6d99b03ff287727e10` | First visual iteration: actual journey passed in 188.05s, but later wall-height/alpha refinements mean these pictures are historical, not final. |
| `9fa154940cbc9dab29ece4d15bba7efa8778a520` | Corrected application source: accepted terrain/matrix proof and functional paid-tier walkthrough. The paid screenshots used the production adaptive density, not full drawing resolution. |
| `13c10cdc2789829eacd9d71cfd8d5e16072be88b` | Documentation composition before this child: same frontend source, public assets, backend and complete migrations subtree as `9fa15494`; top-level Supabase differs through README only. |
| `b844407065cfc9cb3a974c11224050c6186e6bc6` | Later helper-only high-density attempt: failed before its first intended capture because the capture helper read a null selection. This is retained as a verification-helper failure, not a game regression. |
| `7fab8866b83e27c6102df6b123ffdf2eb96619d0` | Runtime after helper null handling is corrected: high-density paid-tier proof passed in 305.36s and ordinary actual capture passed in 192.03s. Fresh full checks are running. Product and test trees are unchanged from `9fa15494`. |

The candidate's application identities are recorded in
[the source record](../evidence/village-polish-review/source.json). Source identity
is tracked separately from scripts, tests and documentation. A documentation-only
commit changes the Git HEAD and build stamp, so matching application trees do not
mean two built bundles are byte-identical.

The main before/after journey declares `8,000` starting coins and best wave `40`.
Seven real paid buildings cost `300`; 102 quoted/paid outer walls cost `1,020`;
one wall upgrade costs `20`, leaving `6,660`. The selected level-2-to-3 upgrade
costs another `40`, leaving `6,620`. Four real free Moves and the optional inner
court add 21 paid walls (`210`) plus 42 upgrades (`1,260`), leaving **123 walls
and 5,150 coins**. This arrangement is a declared review fixture, not a free
default enclosure or injected successful save.

The separate paid-tier walkthrough declares `50,000` coins. The same seven
buildings cost `300`, 123 walls cost `1,230`, and four paid upgrades of every wall
cost `36,900`: **492 successful upgrade receipts per viewport**, ending at
`11,570`. It checks actual paid positions, rendered tiers/buffer changes, nine
tree anchors/colliders through house growth, exact `409 max_level`, the intended
selected wall and high graphics quality. Its local fake API is not production
persistence proof. The accepted first run passed in **223.56s** at both viewports.
Its screenshots used adaptive density `0.50` on desktop and `0.55` on phone while
the quality setting remained high. They establish the recorded functional checks,
not full-resolution screenshot quality. A helper-only follow-up uses a real
viewport resize/restore and asserts density scale `1` and the exact drawing
dimensions before its high-density captures. That follow-up **passed in 305.36s**
on `7fab8866`, preserving 18 original PNGs and another 984 successful upgrade
receipts in total across the two independent viewport fixtures.

The unchanged ordinary actual-game helper has its own longstanding Low→High
quality reset before snapshots. All twenty records in both the fixed before and
final after capture use High quality, drawing density `1` and DPR `1`. This is an
evidence-capture method, not a game performance
optimization. The new paid helper instead uses a real viewport
resize/restore and asserts that selection is unchanged. Full requested drawing
resolution at DPR `1` is not physical-phone/Retina or sustained-FPS proof.

The native matrix is a separately labeled art/renderer fixture. Its contact sheets
may be taller than the declared viewport because they show the whole fixture.
They are not full-game screenshots. Actual compiled PNG bindings and a real
hidden-wall framebuffer negative control prevent empty drawing from passing.
The executed helper's bytes must match the supplied candidate before Chrome or
temporary server resources are allocated.
Independent visual inspection of all first-pass matrix sheets found no crop,
state-size jump, corner spike or closed broken gap. A small phone contact-sheet
caption wrapping issue has a helper-only follow-up; it does not change game UI.
Subtle damage cues on a small phone view and the intentional shared watchtower
appearance remain limitations to assess rather than invented new tier art.

## Verification status

| Check | Current documented result |
|---|---|
| VIS57 focused frontend | 236 passed across 19 files, 27.09s; initial obsolete zero-time smoothing fixture failure retained. |
| VIS57 targeted backend and disposable PostgreSQL | 725 passed across 36 selected files, zero skips, 66.95s; Ruff passed. Matching backend/migration trees, not a fresh complete-backend run. |
| VIS54 focused checks | 67 passed across 8 files, 6.45s; red proof 2 failures/7 passes retained. |
| VIS55 corrected focused checks | 64 passed across 8 files, 2.76s; projection red proof 6 failures/19 passes retained. |
| VIS58 focused checks | 25 passed across 6 files, 1.47s; component build/title budget/text checks passed. |
| VIS56 focused art/state checks | 163 passed across 10 files, 3.32s; deliberate wrong-candidate helper refusal retained. |
| Native terrain boundary | Passed on `6c87b8dc` versus `9fa15494`; every alpha byte/coast/profile/source/fallback invariant matched. |
| Actual paid-tier walkthrough | Functional run passed both viewports, 492 receipts each, 223.56s on `9fa15494`; high-density run passed in 305.36s on `7fab8866`, with High/density 1/exact drawing dimensions and 18 original PNGs per run. |
| Native renderer matrix | Initial 22 fixture sheets / all 100 defense bindings passed in 12.29s on `9fa15494`, with visible framebuffer negative controls and no page errors/external requests. Caption-only follow-up pending. |
| Corrected actual full-game captures | Passed on `7fab8866`: 20 original PNGs, 192.03s helper / 192.13s wrapper, both viewports, all snapshots High/density 1/DPR 1; zero page errors/external requests and one expected offline 503 console message per viewport. |
| Comparison document browser | Checker prepared for exact served HTML/image hashes, 12 decodes and 33 real tab actions per viewport; root native run pending. This is document operability, not game test coverage. |
| Fresh complete frontend/a11y/demo/overlap/build/budget/text/multiplayer | Pending coordinator results; older passes and failures are historical. |
| This documentation | Interim static check passed: 109 copied originals, all 20 before-image inventory hashes, 12 image dimensions, ARIA/syntax, 50 relative link targets and 115 manifest file hashes. Final matrix/application additions require a fresh static pass. No application tests run by this writer. |

The fresh frontend run is still in progress and has already logged the unchanged
defense-report ownership case at its **20.027s timeout**. Final pass/file counts
and the completed command result are not yet available. This guide does not call
the suite green while it is running.

The older `e874023f` frontend run had **4,586 passes and one unchanged 20-second
input timeout**. Its full multiplayer predecessor stopped at a firing-pose check;
later boss/finisher steps were not reached. Those remain historical open evidence
in [the previous guide](REFERENCE-VILLAGE-REVIEW.md), [Draft #408](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/408)
and [issue #421](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/421).
Fresh results must establish their status on the corrected follow-up. No timeout,
frame count, graphics limit or substantive assertion is relaxed to obtain a pass.

## Limits and the human review gate

- The landscape and wall composition improve readability; pixel-perfect parity
  and commercial-game production quality are not established.
- Original world art and terrain still total **12,554,858 bytes**. The unchanged
  **8MiB effort target is not met**. No new shipped image or dependency is added.
- Some actor, fleet and effect art retains its existing implementation. Further
  scenery/water refinement remains separate from this bounded pass.
- Physical devices, Safari, sustained/worst-case FPS, balance and high-score
  comparability need their own checks. Sampled draw counts are not an FPS proof.
- Local fake/offline scenes do not prove live accounts, production V1 durable
  recovery, deployment or applied SQL. Unavailable live health is labeled as such.
- Island growth is not implemented here. No PR/main merge, force push, email,
  deployment, production flag change or live migration was performed by this task.

Review screenshots at both sizes, inspect the component diffs, reproduce relevant
checks and decide whether the visual result is acceptable. Keep the PRs Draft
until Johannes understands the code and a different human reviews the current
revision. No agent marks that personal understanding complete.

## Explain-back practice

This is a practice outline, not a statement that Johannes has already rehearsed:

> I changed how the same village is drawn. The trees are smaller pictures, but
> their blockers and saved positions stay in place. The walls reuse existing
> materials and batches, with clearer posts and tier profiles. I kept the real
> grid, costs, health and broken gaps. The terrain proof checks that the land's
> alpha boundary did not change. Pictures and local fixture tests do not prove
> live persistence, every device or final visual quality; those limits are recorded.

1. Why can a tree crown shrink while its collision and legal build space stay
   the same? Which files own those two responsibilities?
2. Why must the cap-height calculation include the projected cross-section, and
   why does a broken wall remove both adjacent links?
3. What does the local 492-receipt tier walkthrough establish, and what still
   requires real accounts, devices, performance measurements or human review?

Follow [EXPLAIN-YOUR-CODE.md](EXPLAIN-YOUR-CODE.md) for personal practice. To change
this design later, start with a focused issue: a new gameplay rule, asset family,
wall collider or island-growth feature needs its own contract and review.
