# T54 Unified recovery implementation plan

> **What this is:** the gameplay choices and implementation proposal for D059, prepared before runtime coding.
>
> **Who uses it:** Ianno, the T55–T60 implementers and Franz when reviewing the plan and later changes.

- **Status:** accepted gameplay choices consolidated; final skill/research recommendations and technical contracts still need final T54 approval. Runtime implementation has not started.
- **Responsible teammate:** Ianno (@Iannomh123456).
- **Issue:** [T54 #120](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/120); [draft PR #127](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/127).
- **Branch/baseline:** `docs/t54-recovery-implementation-plan`, main `e180ef53`.
- **Design:** [D059](../docs/DECISIONS.md#d059--shared-gradual-hp-recovery-and-paid-instant-repair--2026-11-16) and [T33 recovery spec](T33-persistent-tower-damage.md), merged in PR #118.

## Gameplay choices accepted by Ianno

| Concern | Rule |
|---|---|
| Supported structures | Walls, cannon, mortar, harpoon, culverin and swivel. Preserve kind, level and upgrades at every HP value. |
| Automatic recovery | Actual HP gradually increases at base `maxHP / 600 seconds`, during combat, between waves and offline. It can reach full HP during combat. |
| Taking damage | Damage subtracts from current HP and pauses healing for three seconds after the latest damaging hit. Regained HP is retained in actual HP; no separate time-credit bank. Example: 50% HP heals to 60%, then 10 percentage points of damage leaves 50%. |
| Carpenter | Each Carpenter gives +100% shared healing speed island-wide; maximum two gives ×3. |
| Workshop | Each Workshop within 10 units gives +30% shared healing speed, capped at +50%; multiply this with the Carpenter factor. Maximum combined crew/Workshop rate is ×4.5, so full recovery takes about 133.3 seconds of eligible healing. |
| Destroyed structures | Recovery starts after the same quiet period; a structure becomes active as soon as HP is positive. Towers can fire again and their applicable path obstacle closes, subject to safe egress for units already inside. |
| Paid Repair now | One selected structure returns to full HP immediately during either phase, skipping gradual recovery and the quiet period. Charge the caller's personal wallet once per accepted action; retries never double-charge. |
| Fixed price | `max(1, ceil(30% × sum(catalogue construction prices through current level)))`. Same kind/level has the same price at 90%, 20% or 0% HP, for every payer. No damage, Carpenter, Workshop or Engineer discount. Engineer construction/upgrade discounts remain separate. Wall prices at levels 1–5: 3, 9, 21, 45, 93 coins. |
| Compensation | No free respec tokens, special skill refunds, purchase compensation or player-compensation migrations. Ordinary skill definitions and point accounting must remain valid. |

Wave end alone never restores health. New damage after full recovery uses the same three-second pause. No separate fixed-share rebuild or rebuild cooldown is introduced.

## Final recommended Captain and Tech rules

These effects are recommendations for final plan approval, not implemented behavior:

- Remove Captain E repair/rebuild and the seven repair-only Shipwright choices (`quick_fix`, `long_reach`, `sturdy_planks`, `master_shipwright`, `swift_hammer`, `wide_arc`, `grand_engineer`). Keep unrelated E interactions and non-structure healing/revives.
- Keep Engineer's 10% construction/upgrade discount; remove the old manual-repair-triggered +25% wall HP effect. No free role reset or compensation feature.
- Quick Mend multiplies that wall's shared recovery rate by ×2; Mason Drill multiplies all walls' rate by ×1.5.
- Bastion keeps +50% wall maximum HP and multiplies its wall's shared recovery rate by ×3, replacing its independent passive regeneration.
- Quick Mend and Bastion share one wall skill slot and cannot combine; Mason Drill can combine with either. All benefits use the same healing process.

## Source-audit findings and implementation proposal

- `wall_health.py` currently uses a wall-only 600-second full-restore timer and missing-HP pricing. Replace those rules only under the new reviewed policy; its 30% cumulative full-rebuild basis provides the accepted fixed price.
- `tower-health.js` currently has transient per-wave HP, free Captain repairs and positive-HP firing eligibility. Persist HP and use the shared recovery rule; preserve unrelated targeting/jam behavior.
- `sim.js` has independent Carpenter jobs, Workshop rebuilding, Bastion regeneration and wall repair multipliers. Route approved bonuses through one recovery helper and remove the separate new-policy paths.
- `rules.skill_points()` derives available points from earned points minus active skill costs. Use valid final definitions and ordinary accounting; do not create a refund balance or migration reward.
- Co-op `IslandView.crew` is personal, so it cannot be read independently by each client for an island-wide bonus. Proposed canonical source: the island owner's hired Carpenter count, capped at two and frozen in the wave snapshot; visiting crew does not add extra stacks. Between waves, settle HP at the old rate before applying a crew/layout/research change. This co-op interpretation needs final plan approval.
- Existing `sync.js` applies late inputs at the receiver's next tick and explicitly documents possible drift; rooms do not retain full history for late joiners. Paid repair requires durable ordered events and consistent replay, not an unsigned room-only heal. T55/T57 must define the accepted input/history boundary, late-event replay and recovery checkpoints before coding.
- Proposed arithmetic: normalized integer HP units (one million = full health), a canonical 50-ms simulation tick and a three-second/60-tick quiet period. Compute gradual HP from a canonical time/HP anchor; specify rounding once at authoritative settlement rather than independently rounding every display frame. Persist between-wave HP/time/rate anchors for offline recovery.
- Keep immutable wave-start HP, layout, max-HP/research, rate and policy snapshots plus separate ordered damage/paid-action history. Current HP eligibility and finish reports remain participant-reported combat data with server bounds unless a separately approved authoritative simulator is introduced. Server authority over coins/events is not proof that every reported hit occurred.
- A paid transaction validates membership, target identity, kind/level fixed price, accepted current HP and wave/policy state; locks and commits one personal-wallet charge and one ordered restore event atomically. Persist receipt/action ID and return the same outcome on retry. Preserve damage after restore and reject stale pre-restore reports; the current whole-wave timestamp fence alone is insufficient.
- New-wave start, finish, paid repair, gradual settlement, upgrades, demolition and reset must serialize with the same target generation. No damaged upgrade may bypass recovery. T55 must define the lock order and API/state shapes; T56 implements against that shared contract.

## Tests and release gates

| Area | Required evidence |
|---|---|
| HP arithmetic | Every kind; 50→60→damage10→50; exact quiet boundary and repeated hits; base/bonus rates; full HP during combat; offline time and rate changes; integer rounding/clamping. |
| Zero HP | First positive HP reactivates; firing and obstacle closure; an enemy inside can exit; repeated break/recovery cannot cause stuck loops or ghost shots. |
| Fixed payment | Same kind/level at every eligible HP costs the same; different levels/kinds use the catalogue; insufficient funds, whole/stale target and unauthorized caller have no side effects; one charge on retries/two callers. |
| Ordering | Hits/gradual HP/paid restore/finish in both orderings; damage after restore retained; old reports rejected; immutable start snapshot unchanged; upgrade/demolition/reset identity guards. |
| Multiplayer | Identical committed HP and paid events on two clients, late join and reconnect; duplicate/out-of-order/lost messages recover through the authoritative history; no local-only heal. |
| Skills/research | No retired Captain actions; valid ordinary point accounting; Engineer construction discount preserved; each shared wall multiplier and exclusive slot; no compensation subsystem. |
| Balance/performance | Early/mid/late solo and co-op waves. Fully supported Bastion + Mason Drill wall can heal at ×20.25: about 29.6 seconds from zero, plus quiet time. Test this deliberately before release. Measure journal/replay and mobile performance with the actual new policy enabled. |

Use documented backend pytest/Ruff, real disposable PostgreSQL migration/concurrency/permission tests, frontend tests/build, rules/obstacle and multiplayer checks when implementation changes those areas. Record actual results and baseline failures without weakening assertions. No application tests have been run for this documentation-only proposal.

## Task ownership and next gate

T54–T60 belong to Ianno. T54 is planning in this orchestration session; T55–T60 remain reserved and dependency-blocked. Each implementation task gets its own branch, draft PR and writing agent when its approved prerequisites are available.

Finish the proposed authority/input-history/API/lock/rounding and rollout contracts, then obtain Ianno's explicit OK on the complete T54 plan before runtime coding. Use additive migrations, preserve applied migrations and retain old frozen waves until safely drained. Migration application, flag activation and deployment require their own authorization. Ianno manually reviews; Franz must approve the current revision before a human merge; agents never merge or enable auto-merge.
