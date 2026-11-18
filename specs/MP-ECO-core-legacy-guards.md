# MP-ECO core: atomic legacy entry guards

> **What this is:** database fences for legacy own-islet, Captain, open and reset entry points, plus ordering-only protection for kit grants.
>
> **Who uses it:** the core API integration and the reviewer checking legacy compatibility before personal-v1 routing.

- **Status:** guard foundation implemented and tested; HTTP integration/release remain separate
- **Issue:** [#518](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/518)
- **Branch:** `feat/mp-eco-core-guards`
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`)
- **Coding assistance:** Codex; the responsible teammate remains accountable.
- **Reviewer:** a different human teammate, pending
- **Updated:** 2026-11-18

## Problem and scope

Legacy `islet_build` writes the same asset family as island construction but has no persisted shared-economy fence. Old Captain buttons and reset can modify legacy mirrors or charge private coins after global personal-v1 adoption. `island_open` can grant private starting money even when an island already exists. HTTP preflight cannot protect calls already inside old SQL.

The additive migration `20261118050701_island_economy_legacy_guards.sql` preserves each supported original body once as a private alias, revokes direct alias access including `service_role`, and replaces only these existing entry points:

| Function and exact arguments | Handling |
|---|---|
| `islet_build(uuid,text,text,bigint,integer,integer,text)` | Shared owner refuses `economy_context_required`; globally managed actor refuses `captain_context_required`, preventing unsupported legacy Engineer pricing. |
| `island_captain(uuid,text,integer[],integer)` | Shared own target or global personal-v1 refuses before debit/mirror mutation. |
| `island_learn_skill(uuid,text,text,jsonb,integer)` | Same global guard, independent of visited-island economy. |
| `island_pick_role(uuid,text,integer)` | Same guard; a pending Engineer commitment cannot be erased through old mirrors. |
| `island_respec_at_level(uuid,text,integer)` | Same guard; no paid legacy respec or role clearing for managed actors. |
| `island_open(uuid,text,bigint)` | Shared owner refuses; managed existing legacy island returns the original read-only open shape with `created:false,paid:0`; managed absent island refuses. Truly unadopted legacy creation/grant is preserved. |
| `island_fresh_start(uuid,text,text,integer)` | Shared/managed unsupported reset refuses. Previously stored receipts/history are retained; this increment invents no historical acknowledgement. |
| `grant_entry_kit(uuid,text,text,boolean,text,text,bigint,integer,text)` | Ordering-only actor scope before its original profile/wallet body. Original grants, first-ending result and exact repeat behavior stay intact. |

`island_respec(uuid,text,integer)` was dropped by `20261113010000_respec_and_wave_guards.sql`; this migration does not recreate it. Every active overload is verified against the disposable database.

## Lock and caller contract

The mode/profile guard takes the actor's class-zero island-economy advisory scope before legacy wallet/profile/island locks. It reads persisted admission, including paused admission, rather than a flag or request envelope. Unknown/unavailable schema fails closed. Global personal checks use the existing MP-ECO-07 anchor guard. Missing legacy setup retains the original body’s refusal; it never authorizes a new grant.

Kit and demo use the same `grant_entry_kit` RPC through `game/entry_profile_store.py` and `demo/guests.py`. No other SQL body calls that function. Its original body changes `entry_profiles` and the personal wallet only, not canonical personal-v1 state or Engineer commitment. `demo_guest_admit(uuid)` inserts membership metadata and performs no profile/wallet grant, so it is unchanged. Other observed profile-first crew/demo-record functions move no money.

Legacy co-op build/upgrade is covered by MP-ECO-04. Its visitor actor and target scopes must be acquired together, sorted by the **distinct signed advisory hash key**, before any old wallet/profile lock. An actor-only grant scope cannot serialize a target-only visitor build. No later actor-scope acquisition after a target lock is accepted as a substitute. Real mixed grant/demo/build and adoption races must verify this dependency.

Private aliases are captured only if absent; a wrapper must never be captured as its own source. Reapplying the full migration chain restores the same guarded public entry points. Browser roles receive no execute right; public wrappers remain `service_role` only. No new table or public gameplay endpoint is added.

## Dependencies and boundaries

Use the current MP-ECO-02 treasury/scope primitives and MP-ECO-07 global personal guard. The tested dependency cut is treasury `c12407e9`, personal Captain `ba351aa3`, construction `860b7964` and main `03e660fe`. MP-ECO-04 owns its existing `20261118050401` construction guards and actor/target ordering correction. This migration does not rewrite those functions or install the separate coherent snapshot migration.

No wave, arsenal, paid-repair, deletion or historical completion API is invented. Their canonical session, frozen loadout, source settlement and retention integrations remain explicit gates. Unsupported legacy personal/reset actions may refuse after adoption while their stored historical receipts remain unchanged. Kit grants are ordinary original private-origin rewards and never transfer into a treasury.

## Acceptance and first tests

- [x] New direct-SQL regression cases fail before the fences, then pass: admitted/paused islet build, global managed Captain buttons on a legacy-money island, managed readonly open/no private grant, missing-island open and reset/commitment preservation.
- [x] Original legacy creation, building, Captain learning/respec/reset and kit grants/replays still pass; the removed respec remains absent.
- [x] Preserved aliases reject direct service execution and wrappers reject browser execution; complete migrations apply twice without recursive alias capture. All private helpers/aliases have explicit service/browser execute revocations in the migration.
- [x] Real PostgreSQL races cover admission versus islet/open, personal adoption versus old edits/build, actual kit/demo grants versus visiting builds in both orders, and opposite visiting builds. The MP-ECO-04 suite also verifies both build/upgrade early signed scopes. No private debit or mirror mutation occurs after the corresponding adoption wins.
- [x] Current focused foundation/legacy suites, backend Ruff, SQL parser and own diff checks pass with exact results recorded.
- [ ] A different human teammate reviews before merge; no live migration, route activation or publication occurs in this increment.

## Verification

The direct negative regression selection was first observed as **10 failed** against the unguarded database, then **34 core PostgreSQL cases passed in 4.58s** with the real treasury, Captain and construction dependencies. Races observe actual PostgreSQL advisory/transaction lock waits on separate connections; a timed future alone is not counted as proof of entering the gate. No test-only replacement grant, profile hook or construction function is installed.

Commands below ran from `backend/` with locked dependencies and a writable UV cache:

```bash
CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' --with pglast pytest -q server/tests/island_sql/test_economy_core_legacy_guards_sql.py server/tests/island_sql/test_economy_core_legacy_guard_races_sql.py server/tests/island_sql/test_island_treasury_sql.py server/tests/island_sql/test_economy_operations_sql.py server/tests/island_sql/test_economy_operations_cutover_sql.py server/tests/island_sql/test_personal_captain_sql.py server/tests/island_sql/test_personal_captain_operations_sql.py server/tests/island_sql/test_shared_construction_sql.py
```

**175 passed in 31.66s.**

```bash
CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' --with pglast pytest -q server/tests/island_sql/test_tower_defense_sql.py server/tests/island_sql/test_captain_skills_sql.py server/tests/island_sql/test_captain_tree_sql.py server/tests/island_sql/test_respec_and_wave_guards_sql.py server/tests/island_sql/test_island_fresh_start_sql.py server/tests/island_sql/test_islands_and_waves_sql.py
```

**79 passed in 4.24s.** These two invocations deliberately use fresh disposable processes. A combined run produced 252 passes and two legacy global-count failures because existing Captain race fixtures retain committed synthetic rows in the shared cluster. Running the unchanged legacy assertions in their clean process passed; no production guard or assertion was weakened. Both new core modules register their own isolated race fixture.

```bash
uv run pytest -q server/tests/test_island_routes.py server/tests/test_personal_captain.py server/tests/test_captain_progression_routes.py server/tests/test_referee.py server/tests/test_entry_kits.py server/tests/test_entry_profiles_match_migration.py server/tests/test_demo_join.py server/tests/test_demo_gate.py server/tests/test_islet_routes.py server/tests/test_islet_store.py
uv run ruff check .
```

**449 passed in 15.35s; backend-wide Ruff passed.** The documented PostgreSQL parser accepted all **74 migration files**. The scratch runner executes the complete chain twice. Own new files pass `git diff --check`; unrelated incoming evidence whitespace was not edited.

No live credentials/database, Supabase migration-history application, complete browser suite or exhaustive unrelated backend matrix was used. Migration-version allocation and deployment readiness still require the release checks; direct execution of SQL files is not a test of Supabase migration-history bookkeeping. Core HTTP dispatch, canonical sessions/arsenal/repair/settlements and authenticated multi-client acceptance remain outside this guard foundation.
