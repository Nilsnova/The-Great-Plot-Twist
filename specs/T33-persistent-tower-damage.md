# T33 Unified defense recovery — approved design, not implemented

> **What this is:** Ianno's replacement repair design for all damageable island structures. It supersedes the earlier multi-mechanism proposal in PR #85.
>
> **Who uses it:** Ianno, implementers, and Franz when reviewing the final implementation plan and later code.

- **Owner:** Ianno (@Iannomh123456).
- **Design approval:** Ianno approved the simplified model on 16 Nov 2026.
- **Runtime status:** not implemented. Current game behavior and existing public API contracts remain unchanged.
- **Baseline:** main `9b4e41a4`; prior design PR #85 was merged through #117, but contained documentation only.
- **Tracking:** [issue #83](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/83).
- **Decision:** [D059](../docs/DECISIONS.md#d059--shared-gradual-hp-recovery-and-paid-instant-repair--2026-11-16), accepted design pending peer review and implementation-plan approval.
- **Review:** Ianno manually reviews; Franz (@frcola) must approve the current revision before a human merge. Franz may merge manually after checks and reviews. Agents never merge or enable auto-merge.

## One shared system

The same rules apply to walls and all island towers with HP: cannon, mortar, harpoon, culverin and swivel nest. Damaged standing structures and destroyed structures follow the same recovery process. Their kind, level and upgrades are preserved.

| Choice | Approved behavior |
|---|---|
| Wait | Gradual automatic HP recovery at base rate `maxHP / 600 seconds` before approved acceleration bonuses. Thus 10% missing health takes 1 minute, 50% takes 5 minutes, and 0 HP takes 10 minutes of eligible healing time. After a damaging hit, healing pauses until exactly 3 seconds have passed without another hit; further hits restart that quiet period and reduce current HP. Healing resumes from actual current HP; previously regained HP is represented by that HP and is not lost or separately banked. For example, 50% HP gradually heals to 60%, then 10 percentage points of damage returns it to 50%. Automatic healing can continue during or between waves and offline under the trusted server model, and can reach full health during combat. Paused and quiet-period time does not count as eligible healing time, so wall-clock duration may exceed 10 minutes. T54 must specify rate modifiers, HP precision, rounding/clamping, clock and event ordering, and the zero-HP activation/obstacle policy. The 3-second quiet period is separate from the removed three-second Captain repair action. Current HP is clamped between zero and maxHP. |
| Pay | One explicit paid **Repair now** action restores one player-selected supported structure to full health immediately, either during or between waves. It skips gradual recovery and the three-second quiet period for that target. It is the instant full-restore option; automatic gradual recovery may also run during combat. |

The building card shows the structure's health, gradual recovery rate/estimated remaining time and Repair now price. Ianno's follow-up decision fixes that price by structure kind and level, irrespective of damage: the same kind/level costs the same at 90%, 20% or 0% HP. HP determines whether recovery is needed, not the price; exact values remain for T54 approval. Repair now charges the caller's personal wallet once, restores the selected structure to full health immediately and clears any remaining recovery need without changing kind, level or upgrades. It requires no held repair action and is allowed during or between waves. The paid combat restoration must be authorized by the server and represented as an ordered, tick-stamped event so all active clients, late joiners and reconnecting clients apply the same state transition. Exact prices, the authority for current combat HP, action ordering, HP precision and any cooldown, range or per-wave limit remain for T54 to specify; do not invent those values.

Automatic recovery applies gradual HP restoration at its approved rate during and between waves and offline. A damaging hit subtracts from current HP and pauses healing until 3 seconds have passed without another hit; another hit restarts that quiet period. No healing-work credit is stored apart from actual HP. T54 specifies the trusted clock/health source, offline periods, modifier/rate math, HP precision and damage/finish event ordering. Automatic healing can continue in combat, including to full health; paid Repair now is an immediate full restore ordered at its authoritative event/tick. Healing does not wait for an inactive boundary. Whether a zero-HP structure can fire, reactivate or close an obstacle at each HP level remains for T54 to propose and Ianno to approve.

A subsequent wave ending is not itself a recovery trigger: HP changes only through gradual healing, damage or paid Repair now. Once a structure reaches full health, later damage starts a new 3-second quiet period before gradual healing resumes.

A structure ending a wave at 40/100 HP and one ending at 0/100 HP use the same gradual base recovery rate or Repair now. At the base rate, the first takes 6 minutes and the second 10 minutes of eligible healing time to reach full health. Automatic healing may reach full health during a wave; paid Repair now restores the selected structure immediately in either phase. For example, 50/100 HP can gradually rise to 60/100, then 10 points of damage returns it to 50/100. Full automatic or paid restoration leaves current HP at max; later damage reduces that actual HP and starts a new quiet period. T54 must propose and test zero-HP firing/reactivation and obstacle behavior rather than assume a threshold. There is no separate rebuild cooldown in the replacement model.

## Captain, Carpenter and Workshop roles

- Remove Captain E repair/rebuild actions and the three-second repair action under the new policy. Keep E for unrelated interactions such as building, firing a cannon and helping up a captain.
- Remove Captain repair-only skills, including Quick Fix, and refund their spent skill points. Do not replace them with another automatic Captain healing ability or a nearby support aura.
- Carpenters and Workshops only accelerate the same gradual automatic HP recovery rate. They do not run separate repair/rebuild jobs during a battle.
- Gradual automatic recovery may restore structure HP during combat; paid Repair now provides an immediate full restore during either phase. Captain E, repair-only skills, independent Carpenter/Workshop jobs, Bastion regeneration or other passive sources must not add separate HP-restoration paths. T54 determines whether a passive modifier is removed or mapped to the shared rate.
- Captain/Tavern healing, revives, the shipwreck restoration quest and other non-structure systems are outside this repair change.

### Existing structure-healing and compatibility audit

The current simulation has several separate wall HP paths that implementation must remove or explicitly map to the shared gradual rate: Captain E repairs and rebuilds walls and, under `tower_health`, towers; Carpenters repair/rebuild walls; Workshops auto-rebuild broken walls and accelerate or mend nearby walls; Bastion adds passive wall regeneration; Quick Mend and Mason Drill multiply wall repair effectiveness. Keep Carpenter/Workshop effects only as approved rate modifiers; remove independent repair/rebuild jobs and Captain E/repair-only skill healing. Quick Mend and Mason Drill are modifiers, not independent healing sources, and need a reviewed useful replacement or retirement plan. Bastion's passive regeneration must be removed or mapped to the approved shared rate under T54; it cannot create an extra combat healing path.

The Shipwright skill branch includes direct repair strength/range and rebuild-strength choices, including Quick Fix; its point refund and any preserved non-repair benefit require an explicit, repeatable migration plan. The Engineer role adds repair-triggered wall strength as well as a 10% discount on buildings and upgrades: decide the fate of the repair-triggered combat bonus and refund/compensation while preserving the separate building discount. Bastion also increases wall maximum HP by 50%; review that benefit separately from its passive wall regeneration. No skill, role or purchase should become a silently useless investment.

The exact shared recovery rate bonuses and caps are not approved yet. They must be shown in the final implementation plan, alongside how hiring, Workshop movement or demolition affects ongoing recovery. No additional repair mechanism is implied by those modifiers.

## What this replaces

This decision replaces the earlier proposal's survivor-at-wave-end healing, one-subsequent-wave shortcut, fixed-share rebuilds, rebuild cooldowns, independent in-battle Carpenter/Workshop repair jobs and Captain repair actions. The prior nearby-only/strongest-Captain discussion applied to a discarded Captain-support design; it is not part of this replacement.

Earlier dated STATUS entries are historical records and must remain untouched. Existing D039/D049 runtime behavior stays valid until an explicitly versioned implementation is reviewed and released. This document does not assert that the current game already follows the new design.

## Implementation plan to prepare before production coding

1. Audit current HP-bearing kinds, all structure-healing sources, Captain skill costs, Engineer effects and wall research bonuses. Propose exact speed/price/compatibility values without leaving inert purchases behind.
2. Define versioned server-owned HP state and immutable wave-start snapshots for walls and towers, plus a separate authoritative in-wave paid-action history. Do not mutate initial snapshots when a paid repair occurs. Order paid restores and damage with server-authorized event/tick stamps; reconcile later damage after a paid restore while rejecting stale pre-restore finish reports, rather than ignoring a whole-wave report by its start timestamp. Gradual recovery uses base rate `maxHP / 600 seconds` before approved bonuses; after a hit, healing pauses for 3 seconds after the latest hit, then continues from actual HP. For example, 50% HP heals to 60%, then a hit of 10 percentage points returns it to 50%; do not store elapsed-time credit apart from HP. [T54](../docs/OPEN-TODOS.md#11-unified-defense-recovery--unassigned-follow-ups-16-nov) / [issue #120](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/120) specifies HP precision, rate modifiers, trusted clock/health authority, zero-HP behavior, ordering and event handling.
3. Specify atomic paid recovery with a personal wallet and idempotent action ID, with use allowed both during and between waves. Validate the selected target and current HP from the approved authority, charge once, and publish an authenticated ordered/tick-stamped action event. Serialize the action against hits, gradual HP updates/full-health transitions, finishes, new waves, resets, upgrades and competing callers. Preserve post-restore damage while rejecting stale pre-restore reports; define a replacement for the current late-record fence where needed.
4. Plan simulation, interaction, card and guide changes: apply the approved gradual shared HP recovery during combat, with only the shared rate modifiers; paid Repair now is an immediate full restore in either phase and must replay identically for active clients, late joiners and reconnects. Define zero-HP, tower-firing and obstacle behavior for both gradual and paid restoration without trapping boarders. Preserve old frozen waves and unrelated E actions.
5. Specify safe, repeatable skill refunds and staged migration/flag rollout. Use additive migrations; do not edit applied migrations. Preview and production changes require their own authorization.
6. Present the concrete plan, tests and material risks to Ianno for OK before production coding. Each implementation task gets its own branch and draft PR.

### Values and compatibility still requiring a concrete proposal

- Carpenter/Workshop rate percentages, stacking/caps/radius and treatment of changes during gradual healing.
- Exact fixed Repair now prices by structure kind and level, with no missing-health multiplier; preserve personal-wallet authority and show the same price for partial damage and destruction.
- Exact refund handling for the retired Shipwright choices and Engineer's repair-triggered combat bonus; its existing building discount is separate.
- Treatment of non-Captain wall modifiers such as Quick Mend, Mason Drill and Bastion: no separate healing mechanism or silently useless purchase; any retained healing modifier feeds the shared gradual rate.
- Exact recovery clock/health authority, rate precision/rounding, zero-HP reactivation/firing/obstacle policy, immutable initial snapshots plus action-history/event ordering, finish-report reconciliation, endpoint/event/version names, upgrade safeguards and rollback sequencing. Paid-action prices and any cooldown, range or per-wave cap also remain unapproved. These are proposed implementation contracts, not existing APIs.

## Verification required for implementation

- Lifecycle parity for every supported kind: base rate `maxHP / 600 seconds` before bonuses; 10% / 50% / 100% missing-HP examples; exact 3-second post-hit quiet period; HP gradually increases during eligible time and a hit subtracts from actual HP; `50% HP → 60% HP → 50% HP` on 10 percentage points of damage; repeated hits restart only the quiet period; current HP clamps between zero and max; full automatic or paid restoration leaves full HP and later damage reduces it normally. No hidden timer-credit bank.
- Battle/offline healing, mixed modifier and event-order variants, exact 3-second boundary behavior, automatic healing to full in combat, and wave-end independence under T54's approved clock/HP authority. Confirm remaining time pauses during hits and quiet periods, with wall-clock time able to exceed the base 10 minutes.
- No independent new-policy combat HP paths from Captain E, repair-only skills, old Carpenter/Workshop repair jobs, Bastion regeneration or other free/passive sources; approved Carpenters/Workshop effects only adjust the shared rate. Legacy waves retain their frozen behavior; unrelated E/revive/weapon actions still work.
- Paid restore of partial/destroyed targets during and between waves; insufficient funds; personal-wallet atomicity; same-UID retry; two callers; forged/duplicate/reordered events; current combat HP validation; timer/payment/finish/new-wave/reset races; post-restore damage retained; stale pre-restore damage rejected; no immutable snapshot mutation.
- Skill-point conservation and idempotent refunds for all valid retired loadouts. Preserve unrelated skills, roles, coins, XP and progression according to the reviewed migration plan.
- Two-client, late-join and reconnect agreement for gradual HP changes and tick-stamped paid restores; damage before/after restore and finish ordering; restored tower firing; gradual and paid obstacle closure/path changes without trapping boarders.
- Real disposable PostgreSQL tests, migration reapplication/permissions checks, documented backend/frontend checks and targeted multiplayer evidence. Record actual results and any separate blockers; never weaken assertions to obtain green checks.

This documentation-only change needs document/link checks and a full diff/content review. It does not justify claiming implementation tests or a live rollout.

## Risks and release limits

Gradual healing during combat, immediate paid repair, the proportional base rate and the 3-second quiet period change balance. Rate modifiers, zero-HP behavior, event ordering and prices need review, and skill removal must not lose player investment. A client-reported finish is bounded but does not become authoritative combat verification through this design. Review legacy-wave compatibility and damage/payment concurrency before implementation.

No production code, runtime flag, migration or deployed data is changed by this design update. Keep the documentation PR draft until Ianno's review and Franz's current-revision approval. New STATUS content must be appended only, with `Ianno /` at the start of the entry; existing STATUS bytes must remain unchanged.
