# T58 Wave-end repair option evidence

Used by reviewers of [#456](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/456). Responsible: Ianno (@Iannomh123456). Branch: `fix/wave-end-repair-options`. No PR, live migration application, deployment or activation is claimed.

## Changed

Source `920a0fde` retires new recovery-v1 Carpenter hires, Workshop roles, Quick Mend specs and Mason Drill research with `409 recovery_option_retired`. Additive `20261118050000_retired_recovery_options.sql` guards new transitions after existing canonical wallet/owner/recovery locking. Exact SQL `P0001/recovery_option_retired` maps to the safe API refusal; the whole RPC transaction rolls back. NULL tier-1 choices and unchanged stored choices remain legal. Successful action-UID replay precedes retirement checks. Legacy behavior, Bastion +50% maximum wall HP and Engineer's separate build/upgrade discount remain.

New snapshot rate fields are neutral compatibility metadata, with old immutable snapshots preserved. Full canonical wave-end recovery itself is existing main behavior from `20261118040000_playtest.sql`; this task adds six-kind damaged/zero-HP regressions for won/lost/expired/abandoned closure, asserting current FULL HP separately from retained damaged `closed_hp`.

`b0172542` gives the concurrent policy-transition fixture a robust cleanup so committed synthetic rows cannot leak into later reset/build tests. `4678728c` adds server-owned persisted `recoveryVersion` to ordinary own/visit island JSON. Visit uses the target owner's policy, including a v1 island viewed by a v0 visitor; this metadata is available before `/structures` discovery. `1af5d457` updates the exact visit-response contract assertion for the added field.

## Verified

From `backend/`, the task agent ran:

- Focused retirement/recovery/mutation disposable PostgreSQL checks: **28 passed**. The retirement file followed by legacy mutation tests in one scratch process: **16 passed**, confirming fixture isolation.
- Final policy JSON/route/Captain/research/house checks: **94 passed**; affected `server/tests/test_tower_defense_routes.py`: **51 passed**.
- Changed-file Ruff and `git diff --check`: passed.
- Earlier broad `UV_CACHE_DIR=/tmp/wave-end-options-uv-cache uv run pytest -q`: **536,807 passed, 305 skipped in 1117.53 seconds**. It started before the serializer/test follow-ups; it is broad historical evidence and does not prove those final changes. Final changed paths are verified separately above.

Shared source review combined this branch with saved-policy error handling, existing gated defenses, UI and current rules on a local test candidate. The complete disposable island SQL command passed **398 tests in 35.64 seconds**:

```sh
CASE_PG_SCRATCH=1 UV_CACHE_DIR=/tmp/wave-end-integration-uv-cache uv run --with pgserver --with 'psycopg[binary]' --with pglast pytest -q server/tests/island_sql
```

The first combined SQL attempt had 395 passed / 3 failed from committed race-fixture data leaking into subsequent reset/build cases; `b0172542` corrected cleanup without weakening those assertions. The final run applies/reapplies the full migration chain locally, including guard recreation, paid allowance/price/retry checks and actual HTTP/SQL paths. No production source changed after that run. A combined 11-file Python pass reported 433 passed / 1 exact-response-field assertion failure; `1af5d457` corrects that expectation and the affected 51-test suite passes. This is reported as separate runs, not relabelled as one complete passing rerun.

## Limits and risks

All PostgreSQL/authentication data is synthetic and disposable. Backend tests are not rendered browser, real provider, live database or authenticated two-browser proof. The combined frontend fixtures are documented separately by T59. Frozen replay, closed combat history and paid receipts must stay immutable. New policy metadata is additive; old clients cannot choose or override it. There is no player compensation subsystem, role reassignment or replacement repair ability. Human review/publication confirmation and Franz's current-revision review remain before a human merge.

## Latest-main integration (2026-11-18)

Merged `origin/main` at `37eb70fa` into the task branch with a two-parent merge. The only textual conflict was `docs/STATUS.md`; the provided merge-history helper resolved it, and an order-preserving subsequence check confirmed all 1,143 lines from the task side and all 1,144 lines from main remain in the merged file. No protected policy files were changed. Main's current layout/scenery, content, test, documentation, frontend refactoring and artwork changes were retained. Existing task-only retirement migration/tests, recovery-version serialization, and evidence remain present.

From `backend/`, the current merged tree passed the focused recovery/retirement/routes tests (276 passed, 3 skipped):

```sh
UV_CACHE_DIR=/tmp/wave-end-options-uv-cache uv run pytest -q server/tests/test_captain_recovery_policy.py server/tests/test_house_roles_match_migration.py server/tests/test_house_roles_routes.py server/tests/test_island_routes.py server/tests/test_research_tiers_routes.py server/tests/test_structure_recovery_manifest.py server/tests/test_structure_recovery_rate.py server/tests/test_structure_recovery_routes.py server/tests/test_supabase_admin.py server/tests/test_tower_defense_routes.py server/tests/test_tower_skill_price_routes.py server/tests/test_wave_recovery_routes.py server/tests/test_wave_recovery_transport.py server/tests/island_sql/test_recovery_wave_end_sql.py server/tests/island_sql/test_retired_recovery_options_sql.py server/tests/island_sql/test_structure_recovery_mutations_sql.py
```

The complete disposable SQL suite passed on the merged tree (395 passed in 39.76 seconds):

```sh
CASE_PG_SCRATCH=1 UV_CACHE_DIR=/tmp/wave-end-options-uv-cache uv run --with pgserver --with 'psycopg[binary]' --with pglast pytest -q server/tests/island_sql
```

`UV_CACHE_DIR=/tmp/wave-end-options-uv-cache uv run ruff check .` passed. This remains local disposable PostgreSQL evidence; there was no live database, migration application, feature activation, deployment or PR. The incoming-main-relative whole-tree whitespace scan also reports its existing trailing blank line in `frontend/src/ui/styles.css`; it is unchanged from main. `git -c core.whitespace=-blank-at-eof diff --check origin/main...HEAD` passes for the task delta. Manual review and explicit publication approval remain outstanding.
