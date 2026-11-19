# MP-ECO core: atomic legacy entry guards

> **What this is:** database fences for legacy own-islet, Captain, open and reset entry points, using the existing construction/kit ordering protection.
>
> **Who uses it:** the core API integration and the reviewer checking legacy compatibility before personal-v1 routing.

- **Status:** guard foundation implemented and tested; HTTP integration/release remain separate
- **Issue:** [#518](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/518)
- **Branch:** `feat/mp-eco-core-guards`
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`)
- **Coding assistance:** Codex; the responsible teammate remains accountable.
- **Reviewer:** a different human teammate, pending
- **Updated:** 2026-11-19

## Problem and scope

Legacy `islet_build` writes the same asset family as island construction but has no persisted shared-economy fence. Old Captain buttons and reset can modify legacy mirrors or charge private coins after global personal-v1 adoption. `island_open` can grant private starting money even when an island already exists. HTTP preflight cannot protect calls already inside old SQL.

The additive migration `20261118050701_island_economy_legacy_guards.sql` preserves each supported original body once as a private alias, revokes direct alias access including `service_role`, and replaces only these seven existing entry points:

| Function and exact arguments | Handling |
|---|---|
| `islet_build(uuid,text,text,bigint,integer,integer,text)` | Shared owner refuses `economy_context_required`; globally managed actor refuses `captain_context_required`, preventing unsupported legacy Engineer pricing. |
| `island_captain(uuid,text,integer[],integer)` | Shared own target or global personal-v1 refuses before debit/mirror mutation. |
| `island_learn_skill(uuid,text,text,jsonb,integer)` | Same global guard, independent of visited-island economy. |
| `island_pick_role(uuid,text,integer)` | Same guard; a pending Engineer commitment cannot be erased through old mirrors. |
| `island_respec_at_level(uuid,text,integer)` | Same guard; no paid legacy respec or role clearing for managed actors. |
| `island_open(uuid,text,bigint)` | Shared owner refuses; managed existing legacy island returns the original read-only open shape with `created:false,paid:0`; managed absent island refuses. Truly unadopted legacy creation/grant is preserved. |
| `island_fresh_start(uuid,text,text,integer)` | Shared/managed unsupported reset refuses. Previously stored receipts/history are retained; this increment invents no historical acknowledgement. |

`island_respec(uuid,text,integer)` was dropped by `20261113010000_respec_and_wave_guards.sql`; this migration does not recreate it. Every active overload is verified against the disposable database.

## Lock and caller contract

The mode/profile guard takes the actor's class-zero island-economy advisory scope before legacy wallet/profile/island locks. It reads persisted admission, including paused admission, rather than a flag or request envelope. Unknown/unavailable schema fails closed. Global personal checks use the existing MP-ECO-07 anchor guard. Missing legacy setup retains the original body’s refusal; it never authorizes a new grant.

The required MP-ECO-04 `20261118050401` migration wraps `grant_entry_kit(uuid,text,text,boolean,text,text,bigint,integer,text)` with ordering-only actor scope, in the same transaction as its construction guards. This protection is required before any wallet/profile legacy guard is active; it cannot wait for later HTTP integration. Original grants, first-ending results and exact repeats remain intact. Kit and demo use that same RPC through `game/entry_profile_store.py` and `demo/guests.py`. No other SQL body calls that function. Its original body changes `entry_profiles` and the personal wallet only, not canonical personal-v1 state or Engineer commitment. `demo_guest_admit(uuid)` inserts membership metadata and performs no profile/wallet grant, so it is unchanged. Other observed profile-first crew/demo-record functions move no money.

Legacy co-op build/upgrade is covered by MP-ECO-04. Its visitor actor and target scopes must be acquired together, sorted by the **distinct signed advisory hash key**, before any old wallet/profile lock. An actor-only grant scope cannot serialize a target-only visitor build. No later actor-scope acquisition after a target lock is accepted as a substitute. Real mixed grant/demo/build and adoption races must verify this dependency.

Private aliases are captured only if absent; a wrapper must never be captured as its own source. Reapplying the full migration chain restores the same guarded public entry points. Browser roles receive no execute right; public wrappers remain `service_role` only. No new table or public gameplay endpoint is added.

## Dependencies and boundaries

Use the current MP-ECO-02 treasury/scope primitives and MP-ECO-07 global personal guard. The tested dependency cut is published treasury `feca459f` (schema migration version `20261118050050`), personal Captain `4005fb53`, construction `42f1b880` with its grant protection in `6646a842`, and main `3482c281`. MP-ECO-04 provides its self-contained `20261118050401` construction/kit guards and actor/target ordering protection; this migration does not define a kit wrapper or kit alias. This migration does not rewrite those functions or install the separate coherent snapshot migration.

The current review base also includes [MP-ECO-05 progression](MP-ECO-05-island-progression.md).
Its research wrapper and this component's respec wrapper share the historical migration
contract tests, so both final definitions must be checked together. The latest research
definition is exactly `20261118050501`; the latest checked respec is exactly `20261118050701`.
The current combined dependency verification is recorded below.

No wave, arsenal, paid-repair, deletion or historical completion API is invented. Their canonical session, frozen loadout, source settlement and retention integrations remain explicit gates. Unsupported legacy personal/reset actions may refuse after adoption while their stored historical receipts remain unchanged. Kit grants are ordinary original private-origin rewards and never transfer into a treasury.

## Acceptance and first tests

- [x] New direct-SQL regression cases fail before the fences, then pass: admitted/paused islet build, global managed Captain buttons on a legacy-money island, managed readonly open/no private grant, missing-island open and reset/commitment preservation.
- [x] Original legacy creation, building, Captain learning/respec/reset and kit grants/replays still pass; the removed respec remains absent.
- [x] Preserved aliases reject direct service execution and wrappers reject browser execution; complete migrations apply twice without recursive alias capture. All private helpers/aliases have explicit service/browser execute revocations in the migration.
- [x] Real PostgreSQL races cover admission versus islet/open, personal adoption versus old edits/build, actual kit/demo grants versus visiting builds in both orders, and opposite visiting builds. The MP-ECO-04 suite also verifies both build/upgrade early signed scopes. No private debit or mirror mutation occurs after the corresponding adoption wins.
- [x] Current focused foundation/legacy suites, backend Ruff, SQL parser and own diff checks pass with exact results recorded.
- [ ] A different human teammate reviews before merge; no live migration, route activation or publication occurs in this increment.

## Verification

The direct negative regression selection was first observed as **10 failed** against the unguarded database. The original **34 core PostgreSQL cases** pass within the broad baseline below, including the required private construction-kit alias and absence of a core-kit alias. That dependency check was observed failing before construction contained its grant protection. Races observe actual PostgreSQL advisory/transaction lock waits on separate connections; a timed future alone is not proof of entering the gate. No test-only replacement grant, profile hook or construction function is installed.

Commands ran from `backend/` with locked dependencies and a writable UV cache:

```bash
CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' --with pglast pytest -q server/tests/island_sql/test_economy_core_legacy_guards_sql.py server/tests/island_sql/test_economy_core_legacy_guard_races_sql.py server/tests/island_sql/test_island_treasury_sql.py server/tests/island_sql/test_economy_operations_sql.py server/tests/island_sql/test_economy_operations_cutover_sql.py server/tests/island_sql/test_personal_captain_sql.py server/tests/island_sql/test_personal_captain_operations_sql.py server/tests/island_sql/test_shared_construction_sql.py server/tests/island_sql/test_shared_construction_grant_races_sql.py server/tests/island_sql/test_tower_defense_sql.py server/tests/island_sql/test_captain_skills_sql.py server/tests/island_sql/test_captain_tree_sql.py server/tests/island_sql/test_respec_and_wave_guards_sql.py server/tests/island_sql/test_island_fresh_start_sql.py server/tests/island_sql/test_islands_and_waves_sql.py
```

**261 passed in 39.35s in one process**, followed by backend-wide Ruff passing. This includes the unchanged legacy global-count assertions alongside committed financial/personal races. The personal dependency isolates its committed race fixtures per module; no global fixture or assertion was weakened. All 74 migrations apply twice.

The construction dependency was also checked independently with `20261118050701` absent: `CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql/test_shared_construction_grant_races_sql.py` gave **7 passed in 5.31s**. These real intro/demo grant versus visiting build/upgrade cases, reverse ordering, first-ending replay and alias permissions establish that construction does not depend on a later core migration for its grant ordering.

```bash
uv run pytest -q server/tests/test_island_routes.py server/tests/test_personal_captain.py server/tests/test_captain_progression_routes.py server/tests/test_referee.py server/tests/test_entry_kits.py server/tests/test_entry_profiles_match_migration.py server/tests/test_demo_join.py server/tests/test_demo_gate.py server/tests/test_islet_routes.py server/tests/test_islet_store.py server/tests/test_migration_versions.py
uv run ruff check .
```

**450 passed in 15.72s; backend-wide Ruff passed.** The PostgreSQL parser accepted **74 migration files with 74 unique versions**. The final personal dependency refresh changed only two SQL-test fixture imports and its verification text; the final construction refresh changed verification text only. No runtime or SQL source changed after the checks above. Own new files pass `git diff --check`; unrelated incoming evidence whitespace was not edited.

No live credentials/database, Supabase migration-history application, complete browser suite or exhaustive unrelated backend matrix was used. Direct execution and unique filenames are not a test of Supabase migration-history bookkeeping. Core HTTP dispatch, canonical sessions/arsenal/repair/settlements and authenticated multi-client acceptance remain outside this guard foundation.

### Respec contract compatibility follow-up

The existing `backend/server/tests/test_respec_wave_guards_match_migration.py` now accepts only the exact reviewed `50701` respec wrapper as latest, while retaining the original priced-under-island-lock assertions on the immutable `130100` body. Its complete reviewed body is pinned; the preceding definition, capture-once guard, exact refusal/delegation and execute revocations are checked explicitly. Research assertions remain unchanged in this follow-up. A new PostgreSQL case compares the private alias's entire native body with that historical body, reapplies `50701` twice and confirms the alias stays private.

The original static failures were reproduced as **2 failed, 5 passed** before updating the contract checks. Current focused results:

- `uv run pytest -q server/tests/test_respec_wave_guards_match_migration.py`: **10 passed in 0.06s**.
- `CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql/test_economy_core_legacy_guards_sql.py server/tests/island_sql/test_economy_core_legacy_guard_races_sql.py server/tests/island_sql/test_respec_and_wave_guards_sql.py server/tests/island_sql/test_captain_tree_sql.py server/tests/island_sql/test_island_fresh_start_sql.py`: **68 passed in 7.27s**, including the new alias-body reapplication check (35 core cases).
- Backend-wide Ruff and `git diff --check`: passed.

This is a test-only compatibility follow-up; production code and migration contents are unchanged. The broad 261-case database run and 450-case Python run above remain the earlier baseline, not a claim that an exhaustive suite was rerun for this test update.

<a id="current-dependency-verification"></a>

## Earlier dependency verification

Main `f606412f` and reviewed construction `58a66646` are integrated. The guard SQL and
tests remain unchanged from the published component; construction now independently
verifies each exact committed debit/refund child and its complete immutable receipt.

Commands from `backend/`:

```bash
uv run --no-sync pytest -q server/tests/test_respec_wave_guards_match_migration.py server/tests/test_islet_routes.py server/tests/test_islet_store.py server/tests/test_entry_kits.py server/tests/test_entry_profiles_match_migration.py
CASE_PG_SCRATCH=1 uv run --no-sync --with pgserver --with 'psycopg[binary]' --with pglast pytest -q server/tests/island_sql/test_economy_core_legacy_guards_sql.py server/tests/island_sql/test_economy_core_legacy_guard_races_sql.py server/tests/island_sql/test_shared_construction_sql.py server/tests/island_sql/test_shared_construction_grant_races_sql.py server/tests/island_sql/test_respec_and_wave_guards_sql.py server/tests/island_sql/test_captain_tree_sql.py server/tests/island_sql/test_island_fresh_start_sql.py --tb=short
uv run --no-sync ruff check .
```

The focused Python selection passed **231 tests in 3.93 seconds**. The mixed PostgreSQL
selection passed **133 tests in 16.87 seconds**, without skips, applying the full migration
chain twice. It includes actual-connection adoption/grant/build ordering, original legacy
behavior, exact child-proof refusal rollback and private alias execution checks. A separate
initial source-review run of the two core PostgreSQL modules passed **35 tests in 6.66
seconds**. No demonstrated guard defect was found in this review. These checks retain the
same bounded scope; canonical session/HTTP integration, live schema and human approval
remain separate.

## Progression prerequisite verification

The review base is `feat/mp-eco-05-research` at `b9723adc`, including construction
`58a66646` and main `f606412f`. Production core-guard SQL is unchanged. The shared historical
contract test retains every respec pricing/body/alias assertion and the original research
recovery checks, and adds the progression wrapper's scope, refusal, private capture and
delegation checks. It pins both latest wrappers without skipped or conditional assertions.

Commands from `backend/`:

```bash
uv run --no-sync pytest -q server/tests/test_respec_wave_guards_match_migration.py server/tests/test_economy_progression.py server/tests/test_house_roles_match_migration.py server/tests/test_migration_versions.py server/tests/test_islet_routes.py server/tests/test_islet_store.py server/tests/test_entry_kits.py server/tests/test_entry_profiles_match_migration.py
CASE_PG_SCRATCH=1 uv run --no-sync --with pgserver --with 'psycopg[binary]' --with pglast pytest -q server/tests/island_sql/test_economy_core_legacy_guards_sql.py server/tests/island_sql/test_economy_core_legacy_guard_races_sql.py server/tests/island_sql/test_economy_progression_sql.py server/tests/island_sql/test_shared_construction_sql.py server/tests/island_sql/test_shared_construction_grant_races_sql.py server/tests/island_sql/test_respec_and_wave_guards_sql.py server/tests/island_sql/test_captain_tree_sql.py server/tests/island_sql/test_island_fresh_start_sql.py --tb=short
uv run --no-sync ruff check .
```

The Python selection passed **265 tests in 6.28 seconds**. The mixed PostgreSQL selection
passed **196 tests in 30.84 seconds**, without skips, applying the full migration chain
twice. This checks progression, legacy aliases, construction child-proof rollback and real
admission/grant/build ordering in one process. Backend-wide Ruff passed; **79 migration
files** parsed with unique versions. The complete comparison against the progression
prerequisite contains only the five core component paths. Full backend/browser acceptance,
registered shared HTTP/canonical lifecycle integration, live migration and human approval
remain separate.

## Always-on catalogue integration

Main `1350c2ba` and the current progression/construction prerequisites are integrated.
The nine retired feature flags stay always on, and main's fake-server/render splits are
preserved. No production core-guard SQL or core test source changed. Both exact latest
wrapper contracts remain enforced: research `50501`, respec `50701`, with all historical
pricing, private-alias, capture and delegation assertions retained.

The progression prerequisite replaces its obsolete `catalogue_for_flags` test import
with `runtime_catalogue`; deliberately restricted catalogue fixtures still exercise
saved-instance ownership and stale-quote protection rather than reviving retired flags.

Commands from `backend/`:

```bash
uv run --no-sync pytest -q server/tests/test_respec_wave_guards_match_migration.py server/tests/test_economy_progression.py server/tests/test_house_roles_match_migration.py server/tests/test_migration_versions.py server/tests/test_islet_routes.py server/tests/test_islet_store.py server/tests/test_entry_kits.py server/tests/test_entry_profiles_match_migration.py
CASE_PG_SCRATCH=1 uv run --no-sync --with pgserver --with 'psycopg[binary]' --with pglast pytest -q --tb=short server/tests/island_sql/test_economy_core_legacy_guards_sql.py server/tests/island_sql/test_economy_core_legacy_guard_races_sql.py server/tests/island_sql/test_economy_progression_sql.py server/tests/island_sql/test_shared_construction_sql.py server/tests/island_sql/test_shared_construction_grant_races_sql.py server/tests/island_sql/test_respec_and_wave_guards_sql.py server/tests/island_sql/test_captain_tree_sql.py server/tests/island_sql/test_island_fresh_start_sql.py
uv run --no-sync ruff check .
```

At source `d4e75c39`, the Python selection passed **265 tests in 4.16 seconds**. The mixed
PostgreSQL selection passed **196 tests in 24.28 seconds**, with no skips and the complete migration chain
applied twice. Backend Ruff and **79 unique migration parses** passed. No assertion was
weakened or skipped. Full backend/browser acceptance, registered shared authority,
live migration and human approval remain separate.

The final prerequisite-only update adds four current-runtime extra-slot boundary cases.
Those cases were also run with progression and all core guards installed at source
`6528ba75`:

```bash
CASE_PG_SCRATCH=1 uv run --no-sync --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql/test_shared_construction_sql.py::test_current_runtime_extra_spots_keep_their_target_island_unlock
```

All **four cases passed in 2.74 seconds**. Their target-island unlock, refusal rollback and
actual discounted charge checks retain the intended milestones for cannon spots 8–11.
Production Python and SQL trees remain identical to the earlier mixed verification cut;
the later updates change test coverage and verification text only.
