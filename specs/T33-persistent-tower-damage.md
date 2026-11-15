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

Today tower hp resets to full each wave. T33 adds damage, breakage, art and active free E repair/rebuild during one wave. Walls currently use accepted D039: stored percent health, a 600-second recovery timer and paid instant between-wave Repair/Rebuild. The user confirmed the shared policy: any HP-bearing defense ending a wave above 0 hp becomes whole at wave end; an object ending destroyed stays destroyed until 10 minutes pass or one subsequent wave completes, whichever comes first, but recovery never happens during an active wave. Paid instant repair/rebuild stays between waves. Player E repair/rebuild is disabled during new-policy waves. Existing wall-only automatic Carpenter and Workshop repair/rebuild remains active during battle with current behavior.

Relevant current sources: [T33 tower health](T33-tower-health.md), [D049](../docs/DECISIONS.md#d049--tower-health-inside-a-wave-t33--2026-11-14), [D039 wall recovery](../docs/DECISIONS.md#d039--wall-recovery-damage-stays-after-a-wave--2026-11-14), [wall recovery spec](T29-T32-wall-recovery.md), [wave route contracts](../backend/server/routes/waves.py), [tower health rules](../frontend/src/pirates/tower-health.js), [tower simulation](../frontend/src/pirates/sim.js), [tower health wave-rule mapping](../frontend/src/pirates/wave-rules.js), [wall recovery database pattern](../supabase/migrations/20261114100000_wall_recovery.sql), [BUILD-PLAN §6](../docs/BUILD-PLAN.md#6-defense-and-shared-island-expansion), [wave contracts](../docs/INTERFACES.md#wave-rules-t33-t34t35-t38).

## Current behavior and model

Walls currently use D039 persistent health, a 600-second timer and paid instant between-wave repair/rebuild. The new versioned policy changes automatic recovery: surviving walls become whole at wave end; destroyed walls recover after 10 minutes or one subsequent wave completion, whichever comes sooner, only between waves. The shared design covers walls plus towers and keeps their routes separate.


- [The tower health rules](../frontend/src/pirates/tower-health.js) define transient hp by kind and level for cannon, mortar, harpoon, and culverin. Culverin hp is 70% of same-level cannon hp, rounded, via `DEFENSES_V2.culverin.hpShare`.
- [The wave simulation](../frontend/src/pirates/sim.js) builds each wave's towers from island defenses and currently starts tower health at full. If the wave has `tower_health`, boarders can damage towers; free E repair/rebuild is transient. The simulation state exposes towers and hp, while the finish currently sends wall percentages.
- [Wall recovery service](../backend/server/island/wall_repair.py), [wall recovery routes](../backend/server/routes/wall_recovery.py), and [D039 migration](../supabase/migrations/20261114100000_wall_recovery.sql) establish the closest persistent state, paid-action and snapshot pattern. The upgrade guard is wired through [island routes](../backend/server/routes/island.py) and [island service](../backend/server/island/service.py).
- [Wall recovery UI](../frontend/src/island/wall-recovery.js) and [building card model](../frontend/src/island/card-model.js) show the current wall card; tower card integration needs to stay distinct from the wall-only repair route.
- `watchtower`, houses and Pirate Point defenses do not have tower health in the current tower-health rules. The proposed scope below keeps them excluded.

## Proposed scope and explicit exclusions

Persistence and recovery cover existing HP-bearing defenses: walls, cannons, mortars, harpoons and culverins on an island. Culverin is included because it already has hp under tower_health. Watchtower and houses stay excluded because they have no health. Pirate Point buildings stay out of scope. This new policy applies to walls as well as towers and requires a new accepted decision to revise D039 automatic recovery. Wall prices and paid instant repair remain unchanged.

For a new-policy wave, towers use persistent state only when defense_recovery_v2 and the frozen tower_health rule are both active. If only tower_health is active, towers start full and take transient damage as usual, but no tower state persists. If tower_health is off, towers start full and take no T33 tower damage. A wave frozen to old policy keeps D039 wall behavior and no persistent tower state. This proposal does not change T33 combat values, target selection, active in-wave E behavior, crew/research/skill bonuses, demolition refund, wave payout, or house behavior. It does not make destroyed towers traversable or change path blocking: preserve current obstacle semantics until T34/T35 explicitly agrees otherwise.

## Proposed state and wave contract

For every eligible built tower, store persistent state as whole (100) or destroyed (0), plus the time and wave id when destruction was first recorded. Existing saves default to whole. Legacy wall rows with 1–99% health remain readable under their frozen D039 policy; a new-policy wave starts from its server snapshot and records whole if ending hp is positive, destroyed if zero. Positive ending hp becomes whole immediately at wave end. Ending hp 0 remains destroyed unless the timer or one-subsequent-wave boundary is due; a zero-to-zero finish without intervening rebuild keeps the original destruction marker. A 600-second clock uses real server elapsed time, including battle time and offline time, but recovery cannot be applied during an active wave; if due mid-wave, defer until the inactive boundary. Player E repair/rebuild is disabled during new-policy waves. Existing wall-only automatic Carpenter/Workshop repairs remain active during battle. Open edge: if an existing destroyed wall is automatically rebuilt by Workshop during the next wave, then destroyed again before that wave ends, does the new destruction restart the timer and subsequent-wave count, or does the earlier deadline recover it at that boundary?

At wave start, atomically compute wall and tower starting states at the wave immutable startsAt and persist those exact snapshots with the wave record, alongside the frozen policy version and tower_health applicability. Return existing walls and proposed towers states from those snapshots with wave start, join and current answers. A late joiner reads this saved snapshot, never recomputes from mutable building rows; a repair, timer expiry or later wave cannot change current wave state. Every client uses the same snapshot; no client reads the database or computes recovery time.

At the first finish only, submit ending hp status for eligible towers when the wave froze the new recovery policy and tower_health active; keep existing wall-report compatibility for waves on D039. Persist every positive ending hp as whole and zero as destroyed unless a due recovery boundary makes it whole; do not cap positive ending hp to wave-start hp because survivors become whole at wave end. Drop unknown or missing spots. A participant could falsely report zero to leave an object destroyed. Bound this with one record per wave, destroyed recovery after 10 minutes or one completed subsequent wave, and play money only.

## Proposed recovery rules (values are not approved)

Use D039 price and paid-repair rules for old-policy walls. Under the new policy, partial wall rows remain compatible until a new-policy wave ends; then positive ending hp is whole and zero is destroyed. Paid rebuild for new-policy destroyed defenses uses the full proposed rebuild base price.

| Rule | Proposal |
|---|---|
| At wave finish | Ending hp > 0 becomes whole immediately. Ending hp 0 remains destroyed unless timer/one-subsequent-wave recovery is due at this boundary; a zero-to-zero finish without rebuild keeps its original destruction marker. A rebuilt-in-wave object ending above 0 becomes whole. |
| Rebuild base price | For towers, 30% of cumulative catalogue prices through the tower level, rounded up, minimum 1 coin; apply existing engineer building discount. For walls, retain the current D039 catalogue-price formula. |
| Repair/Rebuild price | New-policy persistent state is whole or destroyed, so paid between-wave recovery applies only to destroyed objects at full rebuild base price. Keep the D039 missing-share formula for legacy partial walls under the old policy; propose its full rebuild base for towers, pending balance review. |
| Payment | Caller pays their own wallet, including on a co-op island; no shared-wallet change. Use existing wallet reason `building_purchase`, proposed ref `towerfix:<actionUid>`. Same action id repeated returns the original outcome and never charges twice. |
| Between-wave action | One atomic server/database operation locks the wallet and affected building row, checks the wave guard and current effective health, charges once, then sets 100 and clears the timer. This is instant recovery between waves; never a battle-time passive boost. Whole/expired towers refuse `409 intact`; a running wave refuses `409 wave_running`; insufficient funds refuse with no state change. |
| Upgrade | Refuse destroyed towers with 409 needs_repair; survivors are whole after wave end and may upgrade normally. The card shows Rebuild instead of Upgrade while a tower remains destroyed. An intact tower upgrades at full health of the new level. The guard and upgrade must serialize to prevent a racing upgrade from bypassing recovery. |
| Battle-time repair | Player E repair/rebuild is disabled during new-policy waves; forged local or room repair/rebuild inputs must be ignored or rejected by server and clients. Existing wall-only automatic Carpenter/Workshop effects continue during battle with current behavior; their surviving walls become whole at wave end under the shared rule. |
| Destroyed recovery | Whole between waves after 600 seconds since first finish recorded destruction OR one subsequent island wave completes, whichever comes first. Never recovers mid-wave; if due during battle, defer until boundary. Offline time counts. A zero-to-zero finish without rebuild keeps the marker so the one-wave rule can recover it. |

### Captain repair skills and Engineer role: compatibility decision

Blocking player repair/rebuild during a new-policy battle removes the current combat use of these personal Shipwright effects. The current source is [captain-stats.js](../frontend/src/pirates/captain-stats.js), [captain-ids.js](../frontend/src/pirates/captain-ids.js), [sim.js](../frontend/src/pirates/sim.js) and [GAME-V3 captain tree and roles](../docs/GAME-V3.md#53-captain-tree-and-roles).

| Current choice | Exact current effect | Effect under the confirmed new-policy battle rule |
|---|---|---|
| Quick Fix | Player wall/tower repair rate ×1.5. | No battle E repair to accelerate. |
| Master Shipwright | Player wall/tower repair rate ×2; rebuild share 60% instead of 40%. | No battle E action to accelerate or rebuild. |
| Swift Hammer | Player repair rate ×1.25; with Master Shipwright the combined multiplier is ×2.5. | No battle E repair to accelerate. |
| Sturdy Planks | Player wall rebuild share 55%. | No player battle rebuild to improve. |
| Grand Engineer | Engineer-only player wall rebuild share 80%. | No player battle rebuild to improve. |
| Long Reach / Wide Arc | Player wall/tower repair interaction range +2 units. | No battle repair target interaction to extend. |
| Engineer role | Player-repaired/rebuilt wall max hp +25% once per wall per wave. | No player wall E action to apply the boost. Its 10% island building/upgrade discount remains active; proposed paid rebuild pricing can keep the existing engineer discount. |

Tower E repair uses the same Quick Fix/Master Shipwright/Swift Hammer multipliers and Sturdy Planks/Master/Grand Engineer rebuild shares in [tower-health.js](../frontend/src/pirates/tower-health.js). No automatic tower repair crew currently exists. The Shipwright tree unlock path is: Quick Fix tier 1; the mutually exclusive tier 2 choices Long Reach or Sturdy Planks; Master Shipwright tier 3 requires either tier 2 choice; the mutually exclusive tier 4 choices Swift Hammer or Wide Arc; Grand Engineer is the Engineer-only tier 5 capstone. The Engineer role unlocks at captain level 3. Under the new policy, player E action effects become unavailable in battle, but these skills still cost/occupy the same skill points.

Island wall Quick Mend and research Mason Drill are separate wall modifiers; both still benefit automatic Carpenter repairs. Bastion’s passive wall mend and existing Workshop/Carpenter repair/rebuild also remain unchanged under the confirmed behavior. Captain repair skills are not currently applied to Carpenter/Workshop: those effects use the wall’s skill/research repair boost and house Workshop multiplier, not captainStats.

The user has not chosen how to preserve value from the now-inert personal combat effects. The preferred option to evaluate is to redesign the affected Shipwright effects as support for automatic wall crew work, while preserving the current player-owned bonus and stacking rules in the crew calculation; this changes shared-island benefit and currently captain stats do not affect crew. Alternatives are moving suitable rate/share effects to paid between-wave price or timing benefits (an economy redesign), or retiring/refunding/retuning affected choices and the Engineer wall-health combat bonus. No mapping or stacking has been approved; each option needs a concrete effect and balance plan before coding. Do not silently select an option. Engineer's building discount and wall research/skill/Workshop effects listed above remain separate and active.

Price examples must be calculated from the catalogue by kind and level in implementation tests; do not hard-code estimates in the UI. This design deliberately proposes no new wallet reason. If the team chooses a dedicated reason, add it through the normal wallet-reason coordination first.

## Paid recovery and concurrency safeguards

The restore function is the authority: it recomputes missing-share price from the locked row, checks the wallet, checks that no wave is running, and applies wallet debit plus health restore atomically. Wave start and restore must share serialization: either restore commits before the wave snapshot (the wave captures the restored 100%), or wave start commits first and restore refuses `wave_running`. A repeated `actionUid` is safe after timeouts/503 and across double-clicks. A request after timer expiry is refused as `intact`, without charge.

Recording and paid restore race at wave closure. The [#82 proposal](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/82) adds `wall_restored_at` to fence the analogous wall race without changing existing RPC signatures. For towers, implementation must add an equivalent tower-specific timestamp fence (or a reviewed shared mechanism) and test both orderings: record locks/commits first then restore; restore commits first then late first finish. A restore that wins must not be overwritten by the just-closed wave's stale snapshot. Do not claim #82 solves this tower race automatically.

For upgrades, the API pre-check alone is insufficient: persistently destroyed tower state must be checked under the same database serialization as upgrade, or the schema/RPC must otherwise ensure health remains damaged and kind/level semantics stay valid. If a finish report arrives after an upgrade, it must map health only to the frozen pre-upgrade tower identity/level; it must never convert a percent from the old max hp into damage on the new max hp or reset the upgraded tower. Recommended phase guard: refuse upgrades while any island wave is running, matching D039 wall restore behavior, and atomically recheck effective health under the upgrade lock. Also freeze each tower row's kind, level and state version in the wave snapshot. A delayed first-finish report may update a row only if its identity/level/version still matches that snapshot; an upgrade after the wave closes but before finish recording then leaves the newly upgraded tower whole instead of applying old-level percent damage to its new max hp. Test concurrent upgrade-versus-repair and upgrade-versus-wave-record cases. Empty spots, non-tower buildings, max-level towers and normal build/upgrade behavior keep current meanings.

## Proposed API and UI contract

- Add a separate guarded route pair, tentatively `GET /api/island/towers` and `POST /api/island/tower-repair`; do not broaden `/api/island/walls` or permit a tower id through the wall-only route. GET returns `coins` and eligible built towers with `spot`, `kind`, `level`, effective `health`, nullable `recoversAt`, and nullable payer-specific `repairCost`.
- POST accepts `spot`, `actionUid`, optional visit `code`; answers the refreshed tower state. Keep existing auth, member permissions and input validation conventions. Status/error names should mirror wall recovery (`feature_off`, `not_built`, `wrong_kind`, `wave_running`, `intact`, `insufficient_funds`, `needs_repair`, `database_unavailable`). Final path and exact response/error shape require team agreement before implementation.
- Add `towers` to island wave start/join/current answers when the new persistence flag is active; accept `towers` on finish. Existing `rules` remains the authority for simulation mechanics. The server includes persistent tower snapshots only for waves whose frozen applicability has both `defense_recovery_v2` and `tower_health` active.
- Add an independent server flag, tentatively `defense_recovery_v2`, off by default, and require `islands`. It covers both wall-policy revision and tower persistence, and is separate from the combat rule `tower_health`; tower persistence is active only when both flags are on at wave start. Wall policy revision also requires `wall_recovery`. Freeze that applicability and the snapshot on the wave row. If `defense_recovery_v2` is off when a new wave starts, that wave has no persistent tower snapshot and its finish does not record tower health; its transient damage still follows the frozen `tower_health` rule. If `tower_health` is off, the wave starts whole with no tower damage. Current config at join or finish must never retroactively change either frozen rule. Existing running waves keep their frozen settings if flags later change, and their first finish must be recorded using the frozen applicability. Recovery routes for tower actions are hidden with 404 `feature_off` when `defense_recovery_v2` is off for new requests; finish ignores tower reports only when that wave was not frozen with both flags active. A flag-on deployment requires the migration first. Introduce an explicit recovery-policy version in the frozen wave record and a new flag such as defense_recovery_v2, rather than changing the meaning of wall_recovery silently. Existing waves keep D039 semantics; new versioned waves use the approved new policy.
- Under the new policy, persistent objects are either whole or destroyed. The tower card offers Rebuild for destroyed towers; the wall card offers Rebuild for destroyed walls. Old-policy wall rows keep the existing D039 card contract. Paid rebuild is instant between waves; survivors recover at wave end, and destroyed defenses follow the timer/next-wave rule.
- No new realtime room message is needed for recovery snapshots. Legacy repair/rebuild room inputs remain valid only for waves frozen to the old policy. Under the new policy, server and clients ignore or reject forged repair/rebuild inputs during battle; the paid between-wave route is the only repair/rebuild path.

These names and shapes are proposals, not shared contracts yet. If team agreement chooses different names, update `INTERFACES.md` and the spec in the implementation PR.

## Migration and rollout proposal

Add an additive migration after current mainline migrations: default-100 percentage and timestamp columns constrained to eligible kinds; columns on `wave_runs` for frozen recovery-policy applicability and immutable wall/tower snapshots including identity/level/version (or an equivalent wave-scoped snapshot table); wall and tower last-damaged wave ids; per-wave first-finish records; a version or timestamp fence incremented by upgrade/restore; service-role-only functions for wave snapshot creation, recording and paid restore (and an atomic upgrade guard). Snapshot creation must serialize with restore and wave start. Existing rows migrate as whole. Prefer a tower-specific record table/function over overloading wall RPCs so row scope and tests stay plain. No client write grants or RLS policies are added. Document grants and table/function contracts in `supabase/README.md`.

Roll out in stages:

1. Agree the rules, prices, permissions, API names and race fence; update D049 or add a new accepted decision. Keep this document explicitly proposed until then.
2. Implement migration and backend behind `defense_recovery_v2` off; add unit, API and disposable-Postgres SQL tests. Keep `tower_health` independent.
3. Implement frontend snapshots, late join, finish reporting, card and tests; run deterministic same-seed tests and the existing two-browser wall smoke as applicable.
4. Apply migration to preview, enable the flag there, exercise damage → finish → late join/reload → paid repair/rebuild → timer expiry → upgrade guard with two clients.
5. Only after human review, capture evidence and follow the production flag/migration procedure. This design task does not authorize a production change or release.

Rollback: turn `defense_recovery_v2` off to stop revised-policy snapshots for new waves and hide recovery routes for new actions. Keep compatible code deployed long enough to honor the frozen snapshots of already-running waves and accept their first finishes. If rolling back to code that cannot honor those wave rows, first quiesce new waves and wait for all running waves to finish/record. Keep additive columns and records in place during code rollback. Dropping data/functions is a separate reviewed migration, and only safe after confirming no code version depends on them. Do not disable `tower_health` as an implicit rollback for persistent storage.

## Proposed implementation phases

1. **Backend model and migration:** pure effective-health, price and snapshot/cap helpers; schema/RPC; server snapshot, first-finish recording, guarded read/restore endpoints; atomic upgrade safeguard; flags and interface docs.
2. **Simulation and rendering:** initialize hp from server snapshot; include all eligible towers in finish state; preserve deterministic behavior and existing T33 free in-wave actions; include culverin in persistent states; no watchtower/house changes.
3. **Card and wiring:** GET/POST client calls, tower-specific repair card states, loading/retry/refusal behavior, co-op payer display, wave start/join/current/finish wiring.
4. **Review and rollout:** SQL concurrency tests, browser screenshots/two-client rehearsal, migration/flag sequencing and rollback evidence.

## Test matrix for the implementation PR

| Area | Cases |
|---|---|
| Pure health rules | whole/destroyed state, legacy partial wall row under old policy, positive versus zero ending hp, 10-minute destroyed boundary, one-subsequent-wave boundary, timer due during battle, player repair input ignored, automatic wall Carpenter/Workshop behavior preserved, Workshop rebuild then re-destroy boundary, offline recovery and snapshot boundaries. |
| Simulation | same seed + same walls/towers gives same result; old-policy partial wall state remains readable; positive ending hp becomes whole, zero stays destroyed, unknown spots are dropped; forged E and room repair/rebuild inputs ignored under new policy; old/new policy modes; culverin supported; watchtower/houses absent; obstacle state follows frozen T34/T35 rules. |
| Wave lifecycle | start/join/current return same snapshot; late join and reconnect match initial clients; first finish won or lost records; second finish changes nothing; expired/no-report wave does not record; nonparticipant/Pirate Point skipped; failure after settlement is best effort. |
| Paid action | destroyed rebuild at full price, legacy partial wall repair under old policy, insufficient funds, whole/expired, wave running, wrong kind/not built, co-op payer, repeated same UID, timeout retry same UID, concurrent double click, concurrent different UID. |
| Race and safeguards | record-before-restore, restore-before-late-record using timestamp fence, two first finishes, concurrent upgrade/repair, concurrent upgrade/record, damaged and destroyed upgrade refusal, intact upgrade allowed at new level full, timer recovery permits upgrade. |
| UI and flags | new policy off preserves old behavior; old-policy wall card contract remains; enabled tower card shows destroyed Rebuild cost/timer; player repair/rebuild disabled in battle; error/refetch states; two-browser state agreement. |

## Exact existing repository checks to run in implementation PR

- `cd backend && uv run pytest -q`
- `cd backend && uv run ruff check .`
- `cd backend && CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql/test_defense_recovery_v2_sql.py` (new SQL test module name is proposed; use actual created name).
- `cd frontend && npm test`
- `cd frontend && npm run build`
- `cd frontend && npm run test:mp`
- `cd frontend && npm run test:walls` (if wall recovery/shared finish guards are touched)
- `cd frontend && npm run dev` with two browsers for the manual flow and screenshots.

No implementation tests are run for this design-only change.

## Limits and decisions needing agreement

This design cannot verify client-reported ending health; a malicious participant could report zero on the first finish. Positive ending hp becomes whole under the confirmed policy, so the relevant failure is bounded destroyed status. One record per wave, timed or subsequent-wave recovery and play money limit its effect. The new wall policy changes D039 only when the new policy version is active; old waves keep their frozen D039 contract.

The core recovery behavior is confirmed by the user. Two compatibility decisions remain before implementation: how to preserve value from Captain Shipwright repair skills and the Engineer wall-health combat bonus, and if a destroyed wall is automatically rebuilt by Workshop during its one subsequent wave then destroyed again before that wave ends, whether the new destruction restarts recovery or the original deadline heals it at that boundary. Automatic wall crew behavior otherwise stays unchanged; player E repair/rebuild is disabled during new-policy battles.
