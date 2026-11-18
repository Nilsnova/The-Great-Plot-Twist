# T55 saved-v1 availability compatibility

This evidence is for Ianno's bug follow-up in [issue #121](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/121), branch `fix/recovery-gated-defenses`, based on main `8759fc80`. The application source reuses the reviewed fix from `9b127467`; its earlier PR #238 closed without merging. The initial compatibility implementation is commit `48d3d45c`; a later follow-up adds bounded demolition receipt replay.

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

Result: **370 passed in 33.30 seconds**. The fixture applies/reapplies the full repository migration chain locally. No migration file was changed by this fix. The saved-island runtime/purchase separation and wave snapshot changes reuse the previously reviewed `9b127467` implementation. The demolition retry follow-up below is additional current-source behavior.

No full backend/frontend suite, browser multiplayer, live database, migration application, feature activation or deployment is claimed. The change has no new rendered UI, so no screenshot is presented as proof of backend behavior. Wider authenticated two-browser recovery, balance and release gates remain separate. Ianno's manual review and publication confirmation, then Franz's current-revision review, are still required before human merge.

## Demolition receipt retry follow-up

The HTTP test creates a saved recovery-v1 wave snapshot, closes the disposable wave, demolishes built `cannon_8`, then repeats the same caller/UID request. Before the final source change the first request succeeded (`repeat: false`) and the retry failed before SQL with `404 no_such_spot`. The recovery-v1 demolition mutation now uses the full known gated-plot catalogue only for that validation and SQL receipt path. The regression confirms the repeat returns the stored receipt, the refund is paid once, a fresh UID against an empty gated plot returns `409 not_built`, and an unknown plot remains `404`. The existing caller and UID checks in SQL remain authoritative.

Focused current-source command from `backend/`:

```sh
CASE_PG_SCRATCH=1 UV_CACHE_DIR=/tmp/recovery-gated-uv-cache uv run --with pgserver --with 'psycopg[binary]' --with pglast pytest -q server/tests/island_sql/test_structure_recovery_http_pg.py server/tests/island_sql/test_demolish_sql.py server/tests/island_sql/test_more_tower_spots_sql.py
```

Before the positive-refund assertion was added, the combined command above reported **32 passed in 9.88 seconds**. After that assertion, separately rerun checks passed: the three saved-v1 HTTP regressions (**3 passed, 1 unrelated test deselected**) and the demolition/extra-plot SQL suites (**28 passed**). The new HTTP regression proves the first refund is positive before checking that the retry does not change the balance. These checks use only disposable local PostgreSQL.

A later combined rerun reported **31 passed, 1 failed**: the existing `test_accepted_bell_member_join_and_paid_repair_match_committed_state` observed `combat` where it expects `preparing`, because the API start/join test elapsed through the phase boundary under the combined run. The three affected saved-v1 HTTP tests and the demolition/extra-plot SQL suites passed separately afterward; that phase-timing test was not changed. Changed-file Ruff and format checks pass; the focused island route suite passes **54 tests**. The previous **370 passed** complete island SQL result was run before this follow-up and remains historical, not final-source evidence; root is running the final independent suite.


## Final independent verification

On final application/test source commit `f75aca71`, the full disposable island SQL suite passed:

```sh
# backend/
CASE_PG_SCRATCH=1 UV_CACHE_DIR=/tmp/recovery-gated-uv-cache uv run --with pgserver --with 'psycopg[binary]' --with pglast pytest -q server/tests/island_sql
```

Result: **371 passed in 22.25 seconds**, including all four HTTP/PostgreSQL cases and the earlier preparation-phase test. [Saved exact output](final-island-sql.txt) is copied unchanged from `/tmp/recovery-gated-final-sql-f75aca71.log`. The preceding combined run's phase-timing failure remains a failed historical attempt; no assertion or product timing limit was changed to obtain this result. Main remained `8759fc80` at the final fetch.

The final source review checked that demolition-only known-plot validation occurs after caller permission checks and delegates old UID receipt/refund authority to the atomic SQL function. A positive first refund, unchanged retry balance, one demolition record, refused fresh actions on empty plots and refused unknown plots are asserted. The wider catalogue is not used for purchases or ordinary island views. Protected instruction files are unchanged, every prior STATUS entry is retained and local documentation links were checked. No bug-fix PR has been created.


## Current-main reconciliation · 18 Nov 2026

Merged current main `48aee0e7` into this task branch in `f05f98d8`. The source conflict combined both required catalogue imports; STATUS reconciliation retains both committed histories in order. Main's full wave-end restoration and snapshot tree/bonus/capstone changes remain intact.

On that merged production source, the complete disposable island SQL command above passed **391 tests in 33.12 seconds**. [Exact output](main48-island-sql.txt) retains the local run output. No live database was used. The focused five-file Python command initially reported **273 passed, 2 failed**: the older gated-culverin fixture expected an array where current main now supplies the production `{a, b}` tree shape, and main's newer snapshot test stub did not accept the task's `include_existing_gated` keyword. These were fixture-integration mismatches, not a reason to revert either production change.

Commit `66b8855b` updates those two fixture boundaries, preserving the tree/bonus/capstone and gated-defense assertions. The affected `test_wave_recovery_transport.py` then passed **19 tests in 1.57 seconds**; changed-file Ruff and format checks passed. The full earlier five-file run is retained as a failed attempt, not relabelled as a complete passing rerun. No production source changed after the 391-test SQL run. Protected instruction files and all historical log entries remain unchanged. No PR, migration application, deployment, activation or merge to main.
