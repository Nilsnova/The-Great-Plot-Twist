# WALL-06 — trusted free-grid wall validation

Responsible human: Johannes Franz Lang (`frcola`). Tracks [WALL-06 #247](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/247). This branch is the pure server-rule slice of the approved full-perimeter implementation. It does not activate or apply a live policy.

## Scope and plan

1. Add separately named wall-rule/capacity metadata; preserve existing layout version 1/2 meaning.
2. Keep legacy lane admission and read normalization unchanged.
3. Accept valid stored free-grid walls under trusted rule 1/capacity 128; preserve all ordinary geometry refusals.
4. Treat additional wall IDs as unplaced inventory until coordinates are accepted.
5. Test legacy/new-policy parity, coordinate stability, bounds and refusal ordering.

Likely files: `backend/server/island/layout.py` and focused tests. The dependent WALL-07 slice transports the atomic policy/read snapshot and Move CAS. Root integration owns policy SQL, service/catalogue/wave inputs and public response fields. No client request chooses its own placement permission.

## Verification and risks

Run focused backend tests and Ruff against the changed files. Important cases are read-time D056 resettling, invalid/unsupported policy, coordinate/ID bounds, blocked land and unbuilt inventory accidentally reserving cells. Scratch SQL, API integration and actual browser evidence remain separate gates; pure tests do not claim a running perimeter builder.

## Handover

The pure validation slice is implemented in Draft [#271](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/271). Existing D056 reads/refusals remain the default; trusted rule 1/capacity 128 preserves accepted coordinates and recognizes canonical new IDs without default positions. `LayoutInfo.wall_rule_version` and `.wall_capacity` do not change the old fixed/stored version meaning.

Executed from `backend/`, with the existing shared project environment and `UV_CACHE_DIR=/workspace/.cache/uv`:

```sh
uv run --frozen --no-env-file pytest -q server/tests/test_island_layout_rules.py server/tests/test_wall_policy_layout.py server/tests/test_island_move_routes.py
uv run --frozen --no-env-file ruff check server/island/layout.py server/island/wall_cohort.py server/tests/test_wall_policy_layout.py
uv run --frozen --no-env-file ruff format --check server/island/layout.py server/island/wall_cohort.py server/tests/test_wall_policy_layout.py
```

Results: **72 passed in 2.45s**; Ruff **All checks passed!**; format **3 files already formatted**. The first tool attempt failed because the default uv cache directory was read-only; the corrected workspace-cache invocation above passed. No test was weakened or skipped to get this result.

Remaining: WALL-07 atomic snapshot/Move transport, root SQL admission/CAS, catalogue/wave/response integration, actual browser builder and complete perimeter lifecycle. Pure tests prove neither transaction safety nor a running builder. No migration application, activation or merge.

Explain-back: I kept the old policy as the default, so old saves still mean the same thing. The new policy skips lane resettling and admits bounded inventory pieces only when it is explicitly supplied by trusted server state. Extra pieces have no position until construction; this prevents invisible empty walls from reserving the island.

Questions: Why are layout.version and wall_rule_version separate? Why must admission preserve effective old coordinates rather than raw rows? Why must a new inventory wall not have a fallback position?
