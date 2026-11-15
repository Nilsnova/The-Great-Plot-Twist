# T33 Persistent tower damage between waves — design proposal

> **What this is:** a reviewable design for carrying damage to all existing HP-bearing defenses across island waves, with automatic between-wave recovery, paid instant repair and upgrade safeguards.
>
> **Who uses it:** the T33 owner, server and client implementers, reviewers of the tower health and wave contracts.

- **Status:** design proposal only; production implementation is not authorized by this document.
- **Issue:** [#83](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/83), requested by Ianno Hollensteiner (`Iannomh123456`).
- **Branch:** `docs/t33-persistent-tower-damage-design`.
- **Baseline:** main `e8c61c64`.
- **Decision:** D049 was accepted by Nils on 15 Nov 2026; the older status line in [T33 tower health](T33-tower-health.md) is stale. The extension rules and values in this document remain proposals pending final user approval; existing D039 wall rules remain the baseline.
- **Dependency:** [issue #82](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/82) proposes `wall_restored_at` as a timestamp fence against a late first finish overwriting a paid restore. That change is not in this baseline. Tower recording needs an equivalent fence or an explicitly reviewed alternative before implementation. Coordinate with [issue #84, tower path obstacles](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/84): this proposal does not change obstacle/pathing rules, and standing/broken obstacle status must follow the same hp state under the wave's frozen rules.

## Why this work is needed

Today tower hp resets to full at each wave start. T33 implements damage, breakage, art and active free E repair/rebuild during one wave under the `tower_health` rule, but explicitly leaves tower persistence for follow-up. Walls already persist damage under accepted D039, with a 600-second timer that restores full health and paid instant between-wave Repair/Rebuild. This proposal keeps existing wall behavior. For towers, automatic recovery is between waves and paid repair completes instantly between waves; whether the automatic tower recovery restores full health after a timer or heals gradually remains open for the user to decide. No passive healing ticks are introduced during battle; existing active E actions remain unchanged.

Relevant current sources: [T33 tower health](T33-tower-health.md), [D049](../docs/DECISIONS.md#d049--tower-health-inside-a-wave-t33--2026-11-14), [D039 wall recovery](../docs/DECISIONS.md#d039--wall-recovery-damage-stays-after-a-wave--2026-11-14), [wall recovery spec](T29-T32-wall-recovery.md), [wave route contracts](../backend/server/routes/waves.py), [tower health rules](../frontend/src/pirates/tower-health.js), [tower simulation](../frontend/src/pirates/sim.js), [tower health wave-rule mapping](../frontend/src/pirates/wave-rules.js), [wall recovery database pattern](../supabase/migrations/20261114100000_wall_recovery.sql), [BUILD-PLAN §6](../docs/BUILD-PLAN.md#6-defense-and-shared-island-expansion), [wave contracts](../docs/INTERFACES.md#wave-rules-t33-t34t35-t38).

## Current behavior and model

Walls already use D039 persistent health, a 600-second timer and paid instant between-wave repair/rebuild. This proposal does not replace that behavior or alter wall prices; it proposes reusing the D039 tower price formula. For automatic tower recovery, full restore at the 600-second boundary follows the existing wall pattern, while gradual healing is an alternative that requires an explicit user decision. The shared wave, concurrency and UX design covers walls plus towers while keeping their existing wall route and the proposed tower route separate.


- [The tower health rules](../frontend/src/pirates/tower-health.js) define transient hp by kind and level for cannon, mortar, harpoon, and culverin. Culverin hp is 70% of same-level cannon hp, rounded, via `DEFENSES_V2.culverin.hpShare`.
- [The wave simulation](../frontend/src/pirates/sim.js) builds each wave's towers from island defenses and currently starts tower health at full. If the wave has `tower_health`, boarders can damage towers; free E repair/rebuild is transient. The simulation state exposes towers and hp, while the finish currently sends wall percentages.
- [Wall recovery service](../backend/server/island/wall_repair.py), [wall recovery routes](../backend/server/routes/wall_recovery.py), and [D039 migration](../supabase/migrations/20261114100000_wall_recovery.sql) establish the closest persistent state, paid-action and snapshot pattern. The upgrade guard is wired through [island routes](../backend/server/routes/island.py) and [island service](../backend/server/island/service.py).
- [Wall recovery UI](../frontend/src/island/wall-recovery.js) and [building card model](../frontend/src/island/card-model.js) show the current wall card; tower card integration needs to stay distinct from the wall-only repair route.
- `watchtower`, houses and Pirate Point defenses do not have tower health in the current tower-health rules. The proposed scope below keeps them excluded.

## Proposed scope and explicit exclusions

Persistence and recovery cover existing HP-bearing defenses: **walls, cannons, mortars, harpoons and culverins** on an island. Culverin is in scope because it already has hp under `tower_health`. **Watchtower stays excluded. Houses stay excluded** because they have no health in this system. Pirate Point buildings stay out of scope. Walls remain governed by D039, and this design preserves their current price/timer behavior while aligning their shared lifecycle contracts with tower persistence.

Tower persistence is active for a wave only when `tower_recovery` and the wave's frozen `tower_health` rule are both active. If `tower_recovery` is off but `tower_health` is on, towers start full and still take normal transient in-wave damage, but the finish does not persist that damage. If `tower_health` is off, towers start full and take no T33 tower damage, regardless of `tower_recovery`. This proposal does not change T33's combat values, target selection, in-wave free E behavior, crew/research/skill bonuses, demolition refund, wave payout, or house behavior. It does not make destroyed towers traversable or change path blocking: preserve current obstacle semantics until T34/T35 explicitly agrees otherwise. Damage persistence is a separate concern from persistent building kind/level.

## Proposed state and wave contract

For every eligible built tower, store an integer `tower_health` percentage from 0 to 100, default 100 for existing saves, plus nullable `tower_damaged_at`. Health 100 means intact; 1–99 damaged; 0 destroyed. The tower kind and level stay as-is when damaged or destroyed. The user must choose the tower automatic recovery mode: (A) effective health becomes 100 at a 600-second boundary after damage is recorded, matching existing walls, with offline time counting and no background job; or (B) health rises gradually between waves over an agreed interval. Paid repair or rebuild instantly returns a tower to full health at the same kind and level. Walls keep their existing D039 columns, 600-second timer and costs.

At wave start, atomically compute effective percentages at the wave's immutable `startsAt` and persist that exact snapshot with the wave record (plus the frozen `tower_recovery` and `tower_health` applicability). Return `towers: {"cannon_1": 65, ...}` from that persisted snapshot with the wave start/join/current answer. A late joiner must read the saved snapshot, never recompute from mutable building rows: a repair, timer expiry, or later wave may change current rows but cannot change this wave's state. Every client passes the same snapshot into the deterministic simulation; convert the percentage to current max hp with the existing `startHp` rounding convention. No client reads the database or computes recovery time.

At the first finish only, submit eligible towers' ending percentages, and only when the wave record froze both `tower_recovery` and `tower_health` as active. Cap every value to the health in the persisted wave snapshot (not a fresh read of building rows) and drop unknown/missing spots. This prevents free E repairs, Workshop-like effects, client mistakes or forged higher values from healing a tower between waves. As with wall reports, lower client values cannot be proven; they may cause bounded loss of health. Only an island wave participant may record, the first record per wave wins, and expired waves record nothing. Failure to record after the paid finish is logged and best-effort; it must not turn a settled finish into an error.

## Proposed recovery rules (values are not approved)

Use D039 as the baseline. Wall timer and prices below describe existing behavior. For towers, the 600-second full-restore timer and same price formula are proposals; the automatic recovery mode needs user approval:

| Rule | Proposal |
|---|---|
| Automatic recovery | Walls retain the existing 600-second full-restore timer. For towers, user choice is pending: full restore at 600 seconds (recommended for parity with walls), or gradual between-wave healing over an agreed interval. Offline time counts. A later wave ending damaged restarts the recovery clock/curve. Each wave uses its frozen start snapshot. |
| Rebuild base price | 30% of cumulative catalogue prices for that tower's levels, rounded up, minimum 1 coin. Apply the existing engineer building discount to the full rebuild base. |
| Repair price | `ceil(rebuild_base × missing_percent / 100)`, minimum 1 coin. A destroyed tower's repair cost is therefore the full rebuild price. |
| Payment | Caller pays their own wallet, including on a co-op island; no shared-wallet change. Use existing wallet reason `building_purchase`, proposed ref `towerfix:<actionUid>`. Same action id repeated returns the original outcome and never charges twice. |
| Between-wave action | One atomic server/database operation locks the wallet and affected building row, checks the wave guard and current effective health, charges once, then sets 100 and clears the timer. This is instant recovery between waves; never a battle-time passive boost. Whole/expired towers refuse `409 intact`; a running wave refuses `409 wave_running`; insufficient funds refuse with no state change. |
| Upgrade | Refuse damaged/destroyed towers with `409 needs_repair`; upgrade card shows Repair/Rebuild instead of Upgrade. An intact tower upgrades at 100% of the new level. The guard and upgrade must serialize against each other so no racing upgrade heals or bypasses the persisted damage. |
| Battle-time healing | Add no passive healing ticks during battles. Keep existing active E repair/rebuild for towers and walls unchanged. To match D039 cap-to-start, active in-wave E repair/rebuild does not increase the recorded persistent percentage beyond wave-start health; it still helps in that battle. |
| Timer/UI | Show effective health, next automatic recovery time/estimate, and caller-specific `repairCost`; after full recovery show intact and no repair action. No background task for timer-based recovery. If gradual healing is chosen, use a deterministic server-time calculation and display its completion time. |

Price examples must be calculated from the catalogue by kind and level in implementation tests; do not hard-code estimates in the UI. This design deliberately proposes no new wallet reason. If the team chooses a dedicated reason, add it through the normal wallet-reason coordination first.

## Paid recovery and concurrency safeguards

The restore function is the authority: it recomputes missing-share price from the locked row, checks the wallet, checks that no wave is running, and applies wallet debit plus health restore atomically. Wave start and restore must share serialization: either restore commits before the wave snapshot (the wave captures the restored 100%), or wave start commits first and restore refuses `wave_running`. A repeated `actionUid` is safe after timeouts/503 and across double-clicks. A request after timer expiry is refused as `intact`, without charge.

Recording and paid restore race at wave closure. The [#82 proposal](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/82) adds `wall_restored_at` to fence the analogous wall race without changing existing RPC signatures. For towers, implementation must add an equivalent tower-specific timestamp fence (or a reviewed shared mechanism) and test both orderings: record locks/commits first then restore; restore commits first then late first finish. A restore that wins must not be overwritten by the just-closed wave's stale snapshot. Do not claim #82 solves this tower race automatically.

For upgrades, the API pre-check alone is insufficient: persistently damaged tower state must be checked under the same database serialization as upgrade, or the schema/RPC must otherwise ensure health remains damaged and kind/level semantics stay valid. If a finish report arrives after an upgrade, it must map health only to the frozen pre-upgrade tower identity/level; it must never convert a percent from the old max hp into damage on the new max hp or reset the upgraded tower. Recommended phase guard: refuse upgrades while any island wave is running, matching D039 wall restore behavior, and atomically recheck effective health under the upgrade lock. Also freeze each tower row's kind, level and state version in the wave snapshot. A delayed first-finish report may update a row only if its identity/level/version still matches that snapshot; an upgrade after the wave closes but before finish recording then leaves the newly upgraded tower whole instead of applying old-level percent damage to its new max hp. Test concurrent upgrade-versus-repair and upgrade-versus-wave-record cases. Empty spots, non-tower buildings, max-level towers and normal build/upgrade behavior keep current meanings.

## Proposed API and UI contract

- Add a separate guarded route pair, tentatively `GET /api/island/towers` and `POST /api/island/tower-repair`; do not broaden `/api/island/walls` or permit a tower id through the wall-only route. GET returns `coins` and eligible built towers with `spot`, `kind`, `level`, effective `health`, nullable `recoversAt`, and nullable payer-specific `repairCost`.
- POST accepts `spot`, `actionUid`, optional visit `code`; answers the refreshed tower state. Keep existing auth, member permissions and input validation conventions. Status/error names should mirror wall recovery (`feature_off`, `not_built`, `wrong_kind`, `wave_running`, `intact`, `insufficient_funds`, `needs_repair`, `database_unavailable`). Final path and exact response/error shape require team agreement before implementation.
- Add `towers` to island wave start/join/current answers when the new persistence flag is active; accept `towers` on finish. Existing `rules` remains the authority for simulation mechanics. The server includes persistent tower snapshots only for waves whose frozen applicability has both `tower_recovery` and `tower_health` active.
- Add an independent server flag, tentatively `tower_recovery`, off by default, and require `islands`. It is separate from `tower_health`, but persistence for a particular wave is active only when both flags are on at wave start. Freeze that applicability and the snapshot on the wave row. If `tower_recovery` is off when a new wave starts, that wave has no persistent tower snapshot and its finish does not record tower health; its transient damage still follows the frozen `tower_health` rule. If `tower_health` is off, the wave starts whole with no tower damage. Current config at join or finish must never retroactively change either frozen rule. Existing running waves keep their frozen settings if flags later change, and their first finish must be recorded using the frozen applicability. Recovery routes are hidden with 404 `feature_off` when `tower_recovery` is off for new requests; finish ignores tower reports only when that wave was not frozen with both flags active. A flag-on deployment requires the migration first.
- The tower card offers Repair when damaged and Rebuild when destroyed; wall cards keep their current D039 labels. Both offer immediate paid recovery between waves; automatic recovery remains timer-based. Cards display cost, timer, health and disabled/refusal feedback. It must not show Upgrade while damage blocks upgrading. In-wave tower display keeps T33 damaged/broken art and hp bar.
- No new realtime room message is needed. Existing deterministic wave start contract conveys the saved state to all clients; current `repair`/`rebuild` inputs are wave-local only.

These names and shapes are proposals, not shared contracts yet. If team agreement chooses different names, update `INTERFACES.md` and the spec in the implementation PR.

## Migration and rollout proposal

Add an additive migration after current mainline migrations: default-100 percentage and timestamp columns constrained to eligible kinds; columns on `wave_runs` for frozen applicability and an immutable tower snapshot including identity/level/version (or an equivalent wave-scoped snapshot table); a per-wave first-finish record; a version or timestamp fence incremented by upgrade/restore; service-role-only functions for wave snapshot creation, recording and paid restore (and an atomic upgrade guard). Snapshot creation must serialize with restore and wave start. Existing rows migrate as whole. Prefer a tower-specific record table/function over overloading wall RPCs so row scope and tests stay plain. No client write grants or RLS policies are added. Document grants and table/function contracts in `supabase/README.md`.

Roll out in stages:

1. Agree the rules, prices, permissions, API names and race fence; update D049 or add a new accepted decision. Keep this document explicitly proposed until then.
2. Implement migration and backend behind `tower_recovery` off; add unit, API and disposable-Postgres SQL tests. Keep `tower_health` independent.
3. Implement frontend snapshots, late join, finish reporting, card and tests; run deterministic same-seed tests and the existing two-browser wall smoke as applicable.
4. Apply migration to preview, enable the flag there, exercise damage → finish → late join/reload → paid repair/rebuild → timer expiry → upgrade guard with two clients.
5. Only after human review, capture evidence and follow the production flag/migration procedure. This design task does not authorize a production change or release.

Rollback: turn `tower_recovery` off to stop snapshots for new waves and hide recovery routes for new actions. Keep compatible code deployed long enough to honor the frozen snapshots of already-running waves and accept their first finishes. If rolling back to code that cannot honor those wave rows, first quiesce new waves and wait for all running waves to finish/record. Keep additive columns and records in place during code rollback. Dropping data/functions is a separate reviewed migration, and only safe after confirming no code version depends on them. Do not disable `tower_health` as an implicit rollback for persistent storage.

## Proposed implementation phases

1. **Backend model and migration:** pure effective-health, price and snapshot/cap helpers; schema/RPC; server snapshot, first-finish recording, guarded read/restore endpoints; atomic upgrade safeguard; flags and interface docs.
2. **Simulation and rendering:** initialize hp from server snapshot; include all eligible towers in finish state; preserve deterministic behavior and existing T33 free in-wave actions; include culverin in persistent states; no watchtower/house changes.
3. **Card and wiring:** GET/POST client calls, tower-specific repair card states, loading/retry/refusal behavior, co-op payer display, wave start/join/current/finish wiring.
4. **Review and rollout:** SQL concurrency tests, browser screenshots/two-client rehearsal, migration/flag sequencing and rollback evidence.

## Test matrix for the implementation PR

| Area | Cases |
|---|---|
| Pure health rules | default/full, partial, zero, timer boundary or gradual-healing time points (after user choice), offline recovery, wave snapshot frozen at `startsAt`; prices at all eligible kinds/levels; engineer discount; rounding and minimum 1. |
| Simulation | same seed + same walls/towers gives same result; saved partial/zero state starts correctly; cap rejects healing and unknown spots; a tower absent at wave start cannot be recorded; both-flag snapshot mode, tower_recovery-only and tower_health-only behaviors; culverin supported; watchtower/houses absent; destroyed-obstacle behavior follows frozen T34/T35 rules. |
| Wave lifecycle | start/join/current return same snapshot; late join and reconnect match initial clients; first finish won or lost records; second finish changes nothing; expired/no-report wave does not record; nonparticipant/Pirate Point skipped; failure after settlement is best effort. |
| Paid action | damaged repair partial price, destroyed rebuild full price, insufficient funds, whole/expired, wave running, wrong kind/not built, co-op payer, repeated same UID, timeout retry same UID, concurrent double click, concurrent different UID. |
| Race and safeguards | record-before-restore, restore-before-late-record using timestamp fence, two first finishes, concurrent upgrade/repair, concurrent upgrade/record, damaged and destroyed upgrade refusal, intact upgrade allowed at new level full, expired timer permits upgrade. |
| UI and flags | off hides recovery route/snapshot while preserving transient tower_health behavior; enabled tower card shows cost/timer and correct Repair/Rebuild; upgrade is suppressed while damaged; error/refetch states; two-browser state agreement. |

## Exact existing repository checks to run in implementation PR

- `cd backend && uv run pytest -q`
- `cd backend && uv run ruff check .`
- `cd backend && CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql/test_tower_recovery_sql.py` (new SQL test module name is proposed; use actual created name).
- `cd frontend && npm test`
- `cd frontend && npm run build`
- `cd frontend && npm run test:mp`
- `cd frontend && npm run test:walls` (if wall recovery/shared finish guards are touched)
- `cd frontend && npm run dev` with two browsers for the manual flow and screenshots.

No implementation tests are run for this design-only change.

## Limits and decisions needing agreement

This design cannot verify client-reported ending health; a malicious participant could lower health on the first finish. The proposed cap and one-record-per-wave rule bound the effect; automatic tower recovery mode is awaiting the user’s choice. Active repair price and automatic recovery mode can affect balance and need a playtest; watchtower and houses are intentionally excluded because they have no hp; walls keep D039 behavior. Migration application and live flag state need explicit staging because wave snapshots depend on server/database consistency. Mixed client versions during a wave may render or simulate different tower health; all captains should reload after a flag change, and preview rollout should use compatible clients.

Before implementation, team agreement is needed on: full restore after 600 seconds versus gradual automatic tower recovery; 30% rebuild base and proportional tower repair; engineer discount; use of `building_purchase` and `towerfix:<uid>`; who may repair on a co-op island; persistence flag/API names and the frozen two-flag applicability; culverin inclusion; whether upgrades are refused during a wave; atomic snapshot/upgrade ordering; obstacle/pathing interaction with T34/T35 and issue #84; and the tower equivalent of issue #82's timestamp race fence. No choice in this proposal is treated as approved.
