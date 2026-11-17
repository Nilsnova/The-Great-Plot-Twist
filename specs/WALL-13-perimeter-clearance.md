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
