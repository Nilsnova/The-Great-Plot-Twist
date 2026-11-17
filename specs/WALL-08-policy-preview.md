# WALL-08: trusted wall preview policy

For Johannes Franz Lang (`frcola`), tracking [WALL-08 #249](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/249). This is a bounded dependent slice on WALL-03's cohort recognition and WALL-06's approved rules; it changes browser previews, not server authority.

1. Retain legacy lane restrictions when policy metadata is absent or rule0/capacity12.
2. Remove only the wall-lane restriction for exact trusted response policy rule1/capacity128; reject malformed/unsupported metadata.
3. Include new inventory walls only after paid, finite positioned response rows; no fictitious empty default reservations.
4. Give existing Move its current island's layout metadata, truthful hint and ordinary grid/coast/overlap/reachability checks.
5. Prove ID boundaries, legacy/perimeter parity, unsupported metadata, normal occupancy and stale-context cancellation with focused tests.

Files: placement.js, move-mode.js, narrow index callback hook and focused tests. Root owns server/SQL; another writer owns builder UI. The fake perimeter transport and world drawing are separate WALL-31/WALL-30 slices. No new dependencies, env edits, live migration/activation or merge.

## Evidence and limits

Focused command from frontend: `npm test -- --maxWorkers=1 tests/island/wall-policy-preview.test.js tests/island/placement.test.js tests/island/move-mode.test.js tests/island/wall-cohort.test.js`: `Test Files 4 passed (4)`, `Tests 67 passed (67)`, duration 1.62s. Exact 1/128 metadata admits off-lane movement; malformed metadata and out-of-capacity IDs fail closed. New cohort occupancy comes only from positioned paid rows. Existing layout.version 2 alone cannot grant free-grid authority.

Existing Move captures its original code/policy context and ignores a late response after that context changes. Own-island reset lifecycle cancellation remains the controller's existing responsibility; this small key is not a new island epoch. The metadata callback is wired in index.js; world lane-art and cohort drawing are separate WALL-30 work. Actual UI/browser, full suite/build/budget/text and production/Safari/device evidence remain for the coordinated integration lane.

## Explain-back

I changed one preview permission: an exact supported wall policy removes the old lane restriction. Grid, land, overlaps and route rules still run. Layout version 1/2 already means fixed versus stored coordinates, so it cannot also mean free placement. New pieces have no default coordinate, so only a paid positioned response row lets Move start.

1. Why does layout.version 2 not authorize free-grid walls?
2. What still makes an off-lane cell invalid under policy 1/128?
3. Why capture the island code before an asynchronous move instead of reading it after the reply?

Safety follow-up: policy 1 preview also reserves all four D060 sites even when purchases are unoffered. The server supplies readonly `layout.reservedPositions` with actual/default hidden coordinates; missing/malformed required rows fail closed, and contradictory offered/reserved coordinates do not guess a location. These positions do not offer tower purchases. A moved hidden cannon_8 regression and malformed-map cases are included.
