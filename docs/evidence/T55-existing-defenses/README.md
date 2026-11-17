# T55 saved-v1 availability compatibility

This evidence is for Ianno's bug follow-up in [issue #121](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/121), branch `fix/recovery-gated-defenses`, based on main `8759fc80`. The application source reuses the reviewed fix from `9b127467`; its earlier PR #238 closed without merging. The new implementation commit is `48d3d45c`.

## Failure and fix

The two new real HTTP/PostgreSQL regressions fail before source changes on current main. With the purchase flags disabled, a saved-v1 wave start returns 500 `recovery_snapshot_structure_mismatch`, and the island read omits built `cannon_8`. Both tests pass after the fix. Only already-built gated objects are added to runtime views/snapshots. Purchase eligibility stays flag-controlled; repair prices remain the current base-level catalogue prices. A new v1 wave with an existing culverin freezes its capability for host and joiners.

The tests use disposable local PostgreSQL and actual FastAPI/services with a synthetic authentication verifier. They cover extra cannon/mortar/harpoon/culverin plots, host/join/current snapshot agreement, paid culverin recovery during a reservation and between waves, and refused new gated purchases with unchanged wallet. They do not demonstrate authenticated browsers, hosted delivery or a deployed feature.

## Exact checks

From `backend/`, reproduce the two original failures or the post-fix passes with:

```sh
CASE_PG_SCRATCH=1 UV_CACHE_DIR=/tmp/recovery-gated-uv-cache uv run --with pgserver --with 'psycopg[binary]' --with pglast pytest -q server/tests/island_sql/test_structure_recovery_http_pg.py -k 'saved_v1_extra_spots_and_culverin or saved_v1_culverin_between_wave'
```

Result after the fix: **2 passed, 1 deselected**. The same invocation before the source patch produced the two failures above.

Focused Python route/rule/transport regressions:

```sh
UV_CACHE_DIR=/tmp/recovery-gated-uv-cache uv run pytest -q server/tests/test_island_routes.py server/tests/test_island_rules.py server/tests/test_structure_repair_rules.py server/tests/test_wave_recovery_transport.py server/tests/test_wave_routes.py
```

Result: **268 passed**. Ruff passed on every changed Python file. The independent review also checked formatting; one missing blank line in the HTTP test file was corrected without changing its AST.

From `frontend/`:

```sh
./node_modules/.bin/vitest run tests/pirates/defenses-v2.test.js
```

Result: **15 passed**, using the existing installed dependencies. This includes the saved culverin simulation capability and legacy exclusion checks; it is not a rendered-browser test.

## Independent verification

The complete disposable PostgreSQL island suite was run on the new branch:

```sh
# backend/
CASE_PG_SCRATCH=1 UV_CACHE_DIR=/tmp/recovery-gated-uv-cache uv run --with pgserver --with 'psycopg[binary]' --with pglast pytest -q server/tests/island_sql
```

Result: **370 passed in 33.30 seconds**. The fixture applies/reapplies the full repository migration chain locally. No migration file was changed by this fix. Runtime application source matches the previously reviewed `9b127467` implementation; current-source checks above are recorded separately from its older evidence.

No full backend/frontend suite, browser multiplayer, live database, migration application, feature activation or deployment is claimed. The change has no new rendered UI, so no screenshot is presented as proof of backend behavior. Wider authenticated two-browser recovery, balance and release gates remain separate. Ianno's manual review and publication confirmation, then Franz's current-revision review, are still required before human merge.
