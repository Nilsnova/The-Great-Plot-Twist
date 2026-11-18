# MP-ECO-03 Canonical wave treasury settlement

> **What this is:** isolated, repeat-safe wave accounting and personal completion receipts for the shared island economy.
>
> **Who uses it:** accepted-bell and canonical-finish integrations, personal Captain progression and their reviewers.

- **Status:** isolated foundation implemented; canonical lifecycle integration and release remain open.
- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`).
- **Coding assistance:** Codex; the responsible teammate remains accountable.
- **Branch:** `feat/mp-eco-03-wave-rewards`.
- **Issue:** [#506](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/506), under [epic #492](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/492).
- **Prerequisites:** MP-ECO-01 implementation contract; MP-ECO-02 treasury primitives and operation identities (`ba05448d`, `de6ac1b8`); MP-ECO-07 personal hooks and anchor/generation corrections (`e9c9890e`, `9a2c5a12`). Actual finish integration also needs MP-ECO-11 canonical session/lifecycle authority.

## Problem and scope

Existing finish paths pay each participant's personal wallet. Shared mode instead credits one frozen attempt to its originating island account exactly once. Participant acknowledgment cannot decide another payout, rewrite a terminal loss/expiry, or substitute the island's record for the played wave.

Add isolated reward-basis/models/helpers under `backend/server/island/wave_economy*.py`, focused Python and disposable-PostgreSQL tests, and additive migration `20261118050200_wave_treasury_settlement.sql`. Existing wave services/routes and simulation are not rewritten. The first increment is a transactional integration foundation, not a complete shared-mode finish implementation.

## Stored contract

- `island_wave_accounting`: immutable shared-mode snapshot keyed by wave UUID, with original island/account/epoch, fixed historical actor, protocol, played wave/seed/timing, sorted roster/session/Engineer identities and server-derived reward basis. It has no cascading foreign key to deletable `wave_runs`.
- `island_wave_participation_receipts`: one immutable post-combat-start confirmation per frozen player/wave/session. Membership, spectating and countdown-only presence do not qualify. Later withdrawal, falling or disconnect does not erase a confirmation.
- `island_wave_closures`: one immutable canonical outcome, earned-bonus set, exact coin amount and optional treasury receipt per attempt. Outcomes are `won`, `lost`, `abandoned` or `expired`.
- `island_wave_completion_receipts`: durable UUID receipts unique by `(player_id, wave_id)`, with played wave, outcome, confirmed-participation flag, frozen Engineer commitment, originating account/epoch and canonical terminal fingerprint. These survive island reset and wave-row deletion; receipt reads never credit money.

All four tables use RLS without browser policies. No browser or service role receives direct write access. Immutable rows reject update/delete. Lifecycle/account deletion and retention remain admission gates; this migration grants no cleanup bypass.

### Transaction helpers

Private `island_wave_accounting_freeze_locked(wave_id, account_id, run_epoch, roster, reward_basis)` is called **inside the accepted-bell transaction**, after earlier scope/account/personal locks. It freezes exactly one shared attempt, checks current admission/account/epoch, current member roster and actual played wave/house levels, and refuses an already closed or privately paid attempt. It cannot convert an old running attempt by an ordinary route call.

Private `island_wave_confirm_participation_locked(wave_id, player_id, controlling_session_id)` is called by the checked session/input acknowledgment transaction after combat begins. It checks the frozen slot, start/expiry/closure boundary and current membership. Its caller must also prove the current controlling assignment has not been withdrawn; a matching old session ID alone is not live authority.

Private `island_wave_accounting_settle_locked(wave_id, outcome, earned_bonuses)` is called **inside canonical finish/expiry**, after any rescue outcome is final. It credits `pirate_loot` using the frozen actor/account/epoch, `island_economy_system_uid(wave_id,'wave_loot')` and `wave:<UUID>` reference, then creates completion receipts. The system UID is disjoint from client root intents; canonical closure needs no late player-intent claim under personal/domain locks. The treasury primitive preserves reserved wager principal and may settle the original retired account; current membership or the selected island cannot redirect this credit. An altered terminal intent conflicts; an exact retry returns original receipts plus fresh originating-account state.

Personal state uses MP-ECO-07's private `personal_captain_lock_state_locked(player_id)` before island/wave locks and `personal_captain_complete_locked(player_id, wave_id, played_wave, outcome, confirmed_participation, engineer_commitment_id)` after receipt insertion. Missing/uninitialized personal state or a failing completion hook aborts the encompassing transaction, including its financial effect. The hook has its own `(player_id,wave_id)` consumption identity; only a matching frozen commitment can be satisfied. Normal `lost` completion may satisfy that commitment but never grants a win milestone or loot. `abandoned`, `expired`, unconfirmed and countdown-only attempts cannot satisfy it.

Receipt retrieval is a service-only read scoped to the authenticated player. It does not recheck current island membership, reapply personal effects, return another player's receipt or require the old run to remain current.

### Reward calculation

The Python helper reuses the actual island loot rates, boss rules and allowed event bonuses from the catalogue/seed. The stored basis includes played wave, base/per-wave/per-house amounts, actual frozen house levels, boss multiplier and permitted bonus amounts. Financial values cross JSON as canonical decimal strings. The canonical caller supplies earned bonus IDs only, never new prices or an arbitrary final reward; duplicate IDs do not multiply a bonus. A repeat attempt freezes its own low played-wave basis and may earn once; it does not refresh personal milestones or ship-record rewards. No new balance value or easy-wave selector is introduced.

### Legacy exclusion and lock order

An additive `wallet_transactions` insert trigger rejects only legacy `pirate_loot` references for a wave already frozen as shared. The reference parser validates `wave:<UUID>` and `wave:<UUID>:<UUID>`. The trigger takes no new lock and uses no session GUC bypass. Freeze holds the wave row while checking that no earlier personal payout/close exists. Existing legacy finish takes that same wave row before paying: at READ COMMITTED, either the old finish commits first and freeze refuses, or freeze commits first and the trigger rolls the legacy finish back. Unrelated/legacy-only ledger entries remain unchanged. This guard is not complete compatibility routing; later converted routes still need the proper `409` context refusal before reaching a legacy writer.

A no-loot legacy defeat/expiry does not insert a wallet row, so the money trigger cannot stop that terminal metadata write. Canonical settlement also rejects a conflicting already-closed `wave_runs` result; an expired row cannot be called a normal defeat to satisfy an Engineer commitment. The later route/lifecycle conversion must still reject stale legacy writers before any new-mode state change.

Before inserting shared accounting, freeze requires each exact immutable personal snapshot to match the player, wave, actual played-wave number and frozen Engineer commitment. A mismatched personal snapshot cannot create an accounting attempt that its completion hook could never close. Participation confirmation checks the locked `wave_runs` terminal fields as well as the immutable accounting timing/closure: a first acknowledgement after a no-loot legacy loss or expiry is refused. An exact acknowledgement already stored during combat still replays after termination and retains its valid normal-completion effect. These are helper validation guarantees; canonical live-session and outcome authorization still require the lifecycle integration below.

Transaction order remains sorted island advisory scopes, originating account row, sorted personal anchors/state, island/admission/recovery rows, wave/domain rows, then receipts. Profile anchors use `FOR NO KEY UPDATE` so an unrelated legacy foreign-key `KEY SHARE` check does not create a wallet/island/profile lock cycle; the dedicated personal state still uses `FOR UPDATE`. Callers must take earlier locks before creating/updating a wave; these helpers do not authorize taking an earlier lock after an unprepared legacy mutation. Context/roster reads and Python validation are not a replacement for the encompassing SQL transaction.

## First tests and acceptance

- [x] Actual played-wave basis, house/boss/event bonuses once, integer validation and decimal-string round trips beyond personal-wallet ceilings.
- [x] Exact retry/conflicting terminal intent; simultaneous close pays one treasury receipt; delayed win cannot rewrite loss/abandonment/expiry.
- [x] Counted post-start participation versus countdown-only/absent slots; confirmed departed participants keep receipts after reset. Physical fall/reconnect transport remains lifecycle integration work.
- [x] One account credit and separate individual receipts; reading/acknowledging a receipt creates no second payout.
- [x] Actual MP-ECO-07 hooks preserve frozen C1 versus newer C2/W2; missing hook rolls back closure, money and receipts.
- [x] Retired origin/current new account separation; wager reservations remain intact; private wallets never also pay.
- [x] Real PostgreSQL freeze versus legacy-finish race; immutable/RLS/grant constraints; all migrations apply twice.
- [x] Relevant Python, PostgreSQL, SQL parse, Ruff and diff checks, with exact scope/results recorded below.
- [x] No live migration or admission/route activation; unrelated legacy attempts remain unchanged.
- [ ] Independent human review before an authorized merge.

Commands from `backend/`: `uv run pytest -q server/tests/test_wave_economy.py`; `CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql/test_wave_treasury_settlement_sql.py`; the documented full-chain parser, relevant backend regression run and `uv run ruff check .`.

## Integration limits

Private helpers and tests do not establish canonical outcome authority or prove every combat hit. MP-ECO-11 must wire accepted-bell freeze, validated live-session confirmation, terminal outcome/HP closure and these accounting effects into the same ordered transaction for both wave protocols. MP-ECO-07 must initialize personal state before admission and consume completion facts atomically. Existing routes, flag behavior and legacy rewards remain unchanged for unfrozen attempts. No implementation task is marked fully integrated from this foundation alone.

Missing personal state is not silently skipped. Before account/profile deletion is admitted, MP-ECO-10/16 must provide an explicit durable account-deleted/withdrawal disposition before cascades, preserving shared history and allowing a continuing island's monetary closure. Only that checked disposition may justify omitting a deleted player's personal hook. An ordinary departed participant with a retained profile still receives their earned receipt/progression. That deletion path is not implemented here.

Exact grants/functions must be summarized in `supabase/README.md` and the common contract linked in INTERFACES as implemented; player-facing instructions change only when the new behavior ships.

## Verification

Verified with `origin/main` at `f0c64442` integrated. Commands ran from `backend/` with a writable UV cache and the locked project dependencies:

- `uv run pytest -q server/tests/test_wave_economy.py`: **29 passed in 0.38s**.
- `CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' --with pglast pytest -q server/tests/island_sql/test_wave_treasury_settlement_sql.py server/tests/island_sql/test_island_treasury_sql.py server/tests/island_sql/test_personal_captain_sql.py server/tests/island_sql/test_economy_operations_sql.py server/tests/island_sql/test_wave_crews_sql.py server/tests/island_sql/test_recovery_wave_end_sql.py`: **113 passed in 5.19s**. Includes 31 package-specific SQL cases and actual prerequisite hooks; the complete 70-migration chain is executed twice on a disposable Unix-socket PostgreSQL server.
- `uv run pytest -q --ignore=server/tests/correctness/test_settings_contract.py`: **12622 passed, 308 skipped in 183.16s**. This is the documented faster backend regression run, excluding the exhaustive settings matrix; opt-in suites remain separate from the explicit PostgreSQL run above.
- The documented `uv run --with pglast` parser: **SQL parses: 70 file(s)**.
- `uv run ruff check .`: **All checks passed**.
- `git diff --check`: passed; six new relative documentation links/anchors resolve.

The Python and SQL tests first failed on the missing module/schema. Terminal-consistency counterexamples were also observed failing before their guards were implemented. The legacy-finish/freeze concurrency regression uses real separate connections at READ COMMITTED and the corrected personal-anchor locks; no test-only progression hook substitutes for MP-ECO-07.

No live database, credentials, admission or deployment was used. Canonical route/HP/session integration, authenticated multi-client behavior, background expiry and explicit deletion/retention disposition remain unverified. This foundation does not mark the complete multiplayer economy or finish integration done.

### Snapshot and terminal-confirmation follow-up

The focused regression was observed first as **3 failed, 1 passed** on disposable PostgreSQL: wrong played-wave snapshot acceptance and first confirmation after normal loss/expiry failed the new expectations, while existing confirmation replay remained valid. After the guards, all four cases passed. The rejected bell transaction rolls back its wave, personal snapshots and shared accounting together; a rejected late acknowledgement creates no participation receipt and cannot satisfy Engineer.

With the treasury operation-registry cutover correction included, the affected checks are:

- `CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' --with pglast pytest -q server/tests/island_sql/test_wave_treasury_settlement_sql.py server/tests/island_sql/test_island_treasury_sql.py server/tests/island_sql/test_personal_captain_sql.py server/tests/island_sql/test_economy_operations_sql.py server/tests/island_sql/test_economy_operations_cutover_sql.py server/tests/island_sql/test_wave_crews_sql.py server/tests/island_sql/test_recovery_wave_end_sql.py`: **130 passed in 24.96s**, including all 70 migrations applied twice, real concurrency and cutover writers.
- `uv run pytest -q server/tests/test_wave_economy.py server/tests/test_personal_captain.py server/tests/test_economy_operations.py server/tests/test_island_treasury.py`: **91 passed in 0.50s**.
- Full `uv run ruff check .`, all **70** migration parses and `git diff --check`: passed.

The earlier broad backend run remains the recorded baseline; this bounded SQL validation follow-up reran the affected suites above. The unintegrated lifecycle/deletion gates are unchanged.

### Current-main verification

Verified again after integrating main `77a9e34d`, including its existing gated-defense catalogue and recovery snapshot/route changes. No wave-accounting runtime change was required by that integration.

- `uv run pytest -q server/tests/test_wave_economy.py server/tests/test_personal_captain.py server/tests/test_captain_progression_routes.py server/tests/test_economy_operations.py server/tests/test_island_treasury.py server/tests/test_island_treasury_store.py server/tests/test_wave_routes.py server/tests/test_wave_recovery_transport.py server/tests/test_island_routes.py server/tests/test_island_rules.py server/tests/test_structure_repair_rules.py`: **408 passed in 12.43s**.
- `CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' --with pglast pytest -q server/tests/island_sql/test_wave_treasury_settlement_sql.py server/tests/island_sql/test_island_treasury_sql.py server/tests/island_sql/test_personal_captain_sql.py server/tests/island_sql/test_economy_operations_sql.py server/tests/island_sql/test_economy_operations_cutover_sql.py server/tests/island_sql/test_wave_crews_sql.py server/tests/island_sql/test_recovery_wave_end_sql.py server/tests/island_sql/test_structure_recovery_http_pg.py`: **134 passed in 27.88s**. The complete 70-migration chain applies twice; the added recovery HTTP/PostgreSQL scenarios exercise real replay modules.
- Backend-wide `uv run ruff check .`, **70** migration parses and `git diff --check`: passed.

The exhaustive unrelated settings matrix and complete browser suite were not rerun. The branch adds no canonical lifecycle route wiring, shared-mode activation, live database change or integrated multi-client gameplay claim.

### Published treasury dependency verification

The branch includes published treasury dependency `feca459f` as an ancestor and uses schema migration `20261118050050_island_treasury.sql`. Its duplicate-version regression check passes alongside the existing wave checks. The current main contract at `3482c281` is included; the retained personal Captain dependency remains separate from later review-base selection.

The same eight-module PostgreSQL command above now gives **137 passed in 50.51s**, including current recovery compatibility. The same eleven-module Python command plus `server/tests/test_migration_versions.py` gives **411 passed in 18.99s**. Backend-wide Ruff and all **71 migration parses with 71 unique versions** pass. Wave-accounting runtime, migration and test contents were unchanged by the treasury/main integration; canonical lifecycle, deletion and authenticated multi-client gates remain open.

### Final personal prerequisite and bounded review scope

The branch includes actual personal Captain dependency `4005fb53` and published treasury `feca459f` as ancestors. Relative to `4005fb53`, the final change is exactly the eight MP-ECO-03 files: two accounting modules, two test modules, migration `20261118050200`, this spec and the accounting sections in INTERFACES/Supabase README. Incoming personal/global-operation changes are prerequisites; the MP-ECO-03 source, migration and test semantics were not rewritten.

The current nine-module PostgreSQL run (the previous command plus `server/tests/island_sql/test_personal_captain_operations_sql.py`) gives **152 passed in 37.26s**. The current twelve-module Python command gives **415 passed in 13.13s**. Backend-wide Ruff, **72 migration parses with 72 unique versions**, and own diff checks pass. No complete browser or authenticated shared-session acceptance was added; the canonical lifecycle and deletion integration gates remain unchanged.

## Reviewer

A different human teammate, to be named before publication. Last updated: 2026-11-18.
