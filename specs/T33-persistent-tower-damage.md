# T33 Shared structure health and repair

> **What this is:** the current gameplay summary for wall/tower HP and paid restoration.
>
> **Who uses it:** T54–T60 implementers and reviewers.

- **Status:** core implementation merged through [PR #203](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/203); full wave-end recovery is on main. Ianno approved the consistency cleanup on 18 Nov 2026. Release evidence is separate from a code merge.
- **Authority:** [D059](../docs/DECISIONS.md#d059--shared-gradual-hp-recovery-and-paid-instant-repair--2026-11-16), [T54 technical plan](T54-recovery-implementation-plan.md) and [current task board](../docs/OPEN-TODOS.md#11-unified-defense-recovery--unassigned-follow-ups-16-nov).

## Current rules

Walls, cannon, mortar, harpoon, culverin and swivel share one HP lifecycle. Houses and watchtowers have no structure HP. Each canonical wave end restores every supported structure fully and free, including destroyed structures, whether won, lost, expired or abandoned. There is no gradual recovery, repair timer, quiet period, healing-speed bonus or free-repair ETA.

From accepted bell reservation through preparation/countdown and combat, no free structure repair occurs. Zero HP disables the structure until successful paid repair or wave-end recovery. Repair now fully restores one target for the incremental catalogue cost of its current base level, independent of damage/payer; walls L1–L5 cost 10/20/40/80/160. Three successes total are shared per island reservation across all players and structures. Outside reservations the API has no quota, but targets are normally intact after free wave-end recovery. Intact/failed requests cost nothing. Same-UID retries return their old receipt and current state without repairing later damage again.

Upgrades require full HP and an inactive reservation. Damage bars, exact HP, shared remaining uses and the paid price stay visible where relevant; no countdown or wait action is needed. Grey disabled Upgrade remains visible while canonical health is unavailable.

## Progression cleanup

Under recovery v1, retire new Carpenter hires, Workshop role selection, Quick Mend and Mason Drill. Bastion retains +50% maximum wall HP without a repair bonus. Keep Engineer's 10% build/upgrade discount, unrelated Captain abilities, Captain/Tavern healing and other house/crew roles. No refunds, replacement roles or compensation subsystem; retain saved identifiers and immutable legacy snapshots/history.

[T58 follow-up #456](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/456) owns authoritative refusal; [T59 follow-up #457](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/457) owns choices/copy. Existing health-policy fallback and saved gated-defense fixes remain distinct tasks.

## Verification and limits

Verify wave-end full restoration, all six kinds, zero/positive HP, damage after paid repair, fixed price/shared allowance, same-UID retry, last-slot races, closure/payment/reset races, preserved closed combat HP and frozen legacy replay. Test obsolete requests without charge and preserved Bastion/Engineer/unrelated choices; capture visible UI with honest transport limits. The server does not prove every reported combat hit. No live migration, activation, deployment or merge is authorized by this spec.
