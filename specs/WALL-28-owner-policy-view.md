# WALL-28 — trusted owner policy in views and existing actions

Responsible human: Johannes Franz Lang (`frcola`). Tracks [WALL-28 #284](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/284). Dependency-only base `chore/wall-28-view-dependencies` contains the separately reviewed WALL-06/07/03 slices; this branch adds owner-view and action integration.

## Plan and ownership

1. Read atomic policy/layout snapshots for game views; preserve existing pure view-call compatibility.
2. Adapt owner catalogue capacity, show only built/positioned additional pieces and fail on missing paid-piece coordinates.
3. Expose wall policy metadata independently of fixed/stored layout version and retain owned coordinates with placement paused.
4. Let existing upgrade, specialization and demolition recognize admitted pieces; refuse old unpositioned new-ID builds before charge.
5. Extend the shared HTTP fake and exact Move/view assertions without hiding the new CAS fields.
6. Run focused backend/routes tests, Ruff and diff/content checks; hand off to actual SQL/browser lifecycle verification.

Owned files: service.py, only LayoutOut/layout_out route hunks, shared island_helpers.py fake, focused tests. The integration owner keeps new enable/quote/build routes and positioned wall construction.

## Status

Claimed; implementation/checks pending. Migration-first deployment is required; no broad missing-RPC downgrade is allowed. No live migration application, activation, deployment or merge.
