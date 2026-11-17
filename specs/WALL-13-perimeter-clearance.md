# WALL-13: perimeter-only half-grid routing clearance

Responsible human: Johannes Franz Lang (`frcola`). Tracks [WALL-13 #254](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/254). Draft implementation follows the authorized full-perimeter contract. Based on the explicit frozen local-demo handoff [#310](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/310), retaining its live-state isolation. No activation, deployment or merge.

## Reproduced problem

Actual server placement accepts wall_13 at (-1.5,6) and wall_14 at (1.5,6). Their one-unit gap permits a BODY-radius-0.3 vertical walk at x=0: continuous `wallInWay((0,8),(0,4.5))` finds no collision. The old one-unit routing raster reports that same line blocked and diverts. Shifting the same one-unit gap to x=0.5 makes the raster accept it. A half-unit gap must remain blocked because it is smaller than the body diameter.

## Scoped plan

1. Add an explicit perimeter-only half-unit routing grid aligned to half-unit node centers and continuous body clearance; keep the legacy grid/defaults untouched.
2. Preserve standing occupancy where a broken piece overlaps another piece's clearance mask.
3. Retain safe repaired-occupant egress without allowing new hostile entry through standing walls.
4. Pass the frozen perimeter option through the simulator factory; do not alter the existing exterior-spawn logic.
5. Keep guide routes/cache identity in the same mode. Live mode comes only from the frozen snapshot/local-demo options; between-wave preview uses an explicit callback validating exact trusted policy metadata.
6. Test legal half-grid and control gaps, corners/turns/coast, breach/restoration and actual movement; retain legacy traces and existing health/routing tests.
7. Measure bounded 128-wall field size/rebuild work and unchanged-cache behavior; do not infer phone performance from Node timings.
8. Report exact checks and remaining integrated/browser/human-review evidence.

Likely files: `frontend/src/pirates/boarder-paths.js`, `path-grid.js`, the narrow simulator factory option hook, `battle-guide.js` mode/cache handoff, small controller forwarding/default callback, the island callback binding and focused tests/measurement. No broad controller rewrite, economy/recovery/version change, new dependency or implicit geometry permission.

## Implementation and compatibility

The new grid uses 0.5-unit cells with a quarter-unit origin offset: its node centers are exactly legal half-unit coordinates. Merely reducing the cell size with the old origin would leave quarter-unit centers and would still miss the narrow opening. Its wall and enabled tower masks mark node centers inside the same square expanded by the existing `BODY = 0.3` used by continuous movement. Continuous collision remains the final authority for movement and perimeter line-of-sight checks.

Neighbor selection still forbids diagonal corner cutting. Standing pieces take precedence over rubble only in the new overlapping clearance masks. A boarder already inside a restored piece may step out; continuous collision still refuses new entry. Positions are frozen for the wave. This does not introduce movement of live-wave geometry or change the existing exterior-landing fix.

The simulator receives only its frozen `perimeterWalls` option. A live guide reads the trusted initial snapshot or validated frozen local demo, never the current owner layout. Between waves, the island wiring accepts exact policy pairs `(0,12)` or `(1,128)` and hides the guide for missing/contradictory policy metadata. The guide computes pathing in perimeter mode even when an unrelated global pathing flag is off. Pirate Point receives the unchanged default callback. Legacy/default/explicit-false raster behavior remains unchanged.

WALL-16's maximum-HP cache key and research HP calculation are retained as prerequisite commit `c5255c34` (local dependency cherry-pick `8913fa7f`). The guide key additionally distinguishes perimeter mode. WALL-35 frozen local-demo commit `e7506f8e` is the draft base. These dependencies must be integrated first; the pull request must be retargeted before eventual human merge.

## Executed checks

From `frontend/`:

```sh
npx vitest run --maxWorkers=1 tests/pirates/perimeter-clearance.test.js tests/pirates/pathing-wiring.test.js tests/pirates/pathing.test.js tests/pirates/battle-guide.test.js tests/pirates/wall-blocking.test.js tests/pirates/perimeter-landing.test.js tests/pirates/perimeter-demo.test.js tests/pirates/controller.test.js
```

Result: **Test Files 8 passed (8); Tests 115 passed (115); Duration 15.50s; exit 0**. A final focused rerun after adding the frozen-demo guide assertion returned **Test Files 1 passed (1); Tests 10 passed (10); Duration 1.34s; exit 0**. Cases cover three half-grid gap offsets, actual waypoint segments checked against continuous collision, a sub-body-width gap, off-node near misses, corners, enabled tower clearance, coastline, rubble overlap, restoration egress, field reuse, guide mode switches and active-wave isolation. Existing pathing/controller/paid-ring demo/exterior-landing cases remain enabled.

`git diff --check` passed. `node scripts/text-lint/index.mjs` returned **16 errors, 8 report-only findings; exit 1**, all in existing placement/fake-transport text outside this change (unreviewed placement/construction/perimeter/piece/pieces/squares/quote words). This slice adds no player-facing text and does not silently add words to bypass that check. The aggregate owner coordinates the reviewed wording fix.

### Bounded routing measurement

`node frontend/scripts/report-perimeter-routing.js` is a repeatable synthetic Node-only probe of 128 shapes: the existing measured 102-piece fixture plus 26 interior shapes. It does not prove legal placement, a database purchase, a phone frame rate or browser performance. Each measured refresh changes every wall across HP bands; 1,000 subsequent unchanged refreshes test field reuse. Node v24.22.1, one final local run:

| Mode | Grid cells | Initial creation + refresh | 20 rebuilds total / maximum | 1,000 unchanged refreshes | Field builds |
| --- | ---: | ---: | ---: | ---: | --- |
| Legacy | 2,704 | 60.58 ms | 97.06 / 13.55 ms | 60.43 ms | 2 → 22 → 22 |
| Perimeter | 11,025 | 93.49 ms | 138.85 / 22.57 ms | 124.69 ms | 2 → 22 → 22 |

An independent same-machine run observed perimeter initial 33.23 ms, 20 rebuilds 120.03 ms total / 24.07 ms maximum and unchanged refreshes 35.29 ms; concurrent machine work and warmup affect timing. The deliberate roughly fourfold cell increase fixes the real opening bug, remains bounded by this island, and does not rebuild on unchanged ticks. No speculative optimization is added. Device/browser profiling remains a release check.

## Remaining and explain-back

The coordinated integration lane must run the aggregate build, browser/a11y/demo/budget checks and actual-game before/after screenshots at 1280×720 and 375×812. No Safari, physical phone, production rollout, live migration application or merge is claimed. The larger WALL-13 task remains draft until these checks and human review complete.

In Johannes's words: the placement grid and the pirates' walking grid used to disagree about an opening. I aligned the new walking nodes with build positions and included the pirate's body in wall clearance. The old rules keep their exact raster, while the new rules and arrows use the same frozen mode. The cost is a larger bounded field, reused until relevant wall health changes.

Explain-back questions: Why does a half-unit grid still need a quarter-unit origin offset? Why must rubble not hide the clearance mask of a standing neighbor? Why does a live wave read frozen geometry instead of the island's latest layout?
