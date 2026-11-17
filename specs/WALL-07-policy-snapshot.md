# WALL-07 — atomic policy snapshot and fenced Move transport

Responsible human: Johannes Franz Lang (`frcola`). Tracks [WALL-07 #248](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/248), stacked on the pure [WALL-06 draft #271](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/271).

## Scope and plan

1. Add a strict `LayoutSnapshot(rule_version, capacity, rows)` adapter for `island_wall_layout_read(p_island_owner)`.
2. Validate supported policy pairs, unique bounded known rows and grid coordinates; refuse malformed state rather than downgrade it.
3. Read policy and rows together for Move, and carry both policy and ordered rows into `island_wall_move` CAS, including legacy policy.
4. Retain all existing validation, no-op, retry, phase and owner resolution semantics.
5. Verify direct transport/flow cases with focused tests; integrate the separately owned SQL/service paths afterward.

Likely files: `backend/server/island/layout_store.py`, `backend/server/island/placement.py` and focused tests. The integration branch owns the SQL RPCs, public response/service/wave integration and shared route fake. Deploy the migration before dependent server paths. No broad error fallback to old policy is permitted.

## Status and limits

Implemented in Draft [#277](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/277). `read_snapshot` validates the supported policy pair, complete bounded row set, canonical IDs, unique rows and integer half-coordinate bounds. Both legacy and perimeter moves use `island_wall_move`, comparing the expected policy and ordered raw rows. A missing inventory position cannot be created through free Move.

Focused checks, executed from backend with the existing project environment and workspace uv cache:

```sh
uv run --frozen --no-env-file pytest -q server/tests/test_wall_layout_snapshot.py server/tests/test_wall_policy_layout.py server/tests/test_island_layout_rules.py
uv run --frozen --no-env-file ruff check server/island/layout_store.py server/island/placement.py server/tests/test_wall_layout_snapshot.py
uv run --frozen --no-env-file ruff format --check server/island/layout_store.py server/island/placement.py server/tests/test_wall_layout_snapshot.py
```

Results: **75 passed in 1.71s**, Ruff **All checks passed!**, format **3 files already formatted**. `git diff --check` passed. These direct transport tests do not replace the separately integrated shared HTTP fake/API checks, real SQL CAS tests or a browser lifecycle. No full backend-suite pass is claimed by this slice.

Explain-back: I read the rule and coordinates together because reading them separately can mix two island states. Every write compares both values, even for an old-policy move racing admission. An unknown or unavailable policy read stops the action; it does not silently show a different layout.

Questions: What race is prevented by a single snapshot? Why must a legacy move compare expected policy too? Why must the read fail rather than fall back after a database error?

Remaining: integrated owner view/wire and shared route fixture, SQL concurrency proof, actual builder and perimeter lifecycle. No migration application, activation, deployment or merge.
