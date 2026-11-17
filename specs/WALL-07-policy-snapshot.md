# WALL-07 — atomic policy snapshot and fenced Move transport

Responsible human: Johannes Franz Lang (`frcola`). Tracks [WALL-07 #248](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/248), stacked on the pure [WALL-06 draft #271](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/271).

## Scope and plan

1. Add a strict `LayoutSnapshot(rule_version, capacity, rows)` adapter for `island_wall_layout_read(p_island_owner)`.
2. Validate supported policy pairs, unique bounded known rows and grid coordinates; refuse malformed state rather than downgrade it.
3. Read policy and rows together for Move, and carry both policy and ordered rows into `island_wall_move` CAS, including legacy policy.
4. Retain all existing validation, no-op, retry, phase and owner resolution semantics.
5. Verify direct transport/flow cases with focused tests; integrate the separately owned SQL/service paths afterward.

Likely files: `backend/server/island/layout_store.py`, `backend/server/island/placement.py` and focused tests. Root owns the SQL RPCs, public response/service/wave integration and shared route fake. Deploy the migration before dependent server paths. No broad error fallback to old policy is permitted.

## Status and limits

Implementation claimed, checks pending. The new transport is not a working perimeter builder or proof of SQL concurrency. No migration application, activation, deployment or merge.
