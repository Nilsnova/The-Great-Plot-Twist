# T33 Unified defense recovery — approved design, not implemented

> **What this is:** Ianno's replacement repair design for all damageable island structures. It supersedes the earlier multi-mechanism proposal in PR #85.
>
> **Who uses it:** Ianno, implementers, and Franz when reviewing the final implementation plan and later code.

- **Owner:** Ianno (@Iannomh123456).
- **Design approval:** Ianno approved the simplified model on 16 Nov 2026.
- **Runtime status:** not implemented. Current game behavior and existing public API contracts remain unchanged.
- **Baseline:** main `9b4e41a4`; prior design PR #85 was merged through #117, but contained documentation only.
- **Tracking:** [issue #83](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/83).
- **Decision:** [D059](../docs/DECISIONS.md#d059--one-recovery-countdown-for-all-damageable-structures--2026-11-16), accepted design pending peer review and implementation-plan approval.
- **Review:** Ianno manually reviews; Franz (@frcola) must approve the current revision before a human merge. Franz may merge manually after checks and reviews. Agents never merge or enable auto-merge.

## One shared system

The same rules apply to walls and all island towers with HP: cannon, mortar, harpoon, culverin and swivel nest. Damaged standing structures and destroyed structures follow the same recovery process. Their kind, level and upgrades are preserved.

| Choice | Approved behavior |
|---|---|
| Wait | One automatic countdown with base required duration `600 seconds × (maxHP − currentHP) / maxHP`, before approved acceleration bonuses. Thus 10% missing health is 1 minute, 50% is 5 minutes, and zero HP is 10 minutes. Every damaging hit pauses the timer and discards all prior elapsed recovery progress. Start a fresh base duration from current HP after 3 seconds with no additional damaging hit; each new hit restarts this quiet window. Paused and quiet-window time do not count toward the 600-second base-duration cap, so wall-clock time may exceed 10 minutes. This 3-second quiet window is separate from the removed three-second Captain repair action. Completion restores full health. |
| Pay | One explicit paid **Repair now** action restores one player-selected supported structure to full health immediately, either during or between waves. It skips any countdown and the three-second quiet window. During combat it is the sole structure HP-restoration path. |

The building card shows the structure's health, remaining wait and Repair now price. Repair now charges the caller's personal wallet once, restores the selected structure to full health and clears its recovery cycle without changing kind, level or upgrades. It requires no held repair action and is allowed during or between waves. The paid combat restoration must be authorized by the server and represented as an ordered, tick-stamped event so all active clients, late joiners and reconnecting clients apply the same state transition. Exact prices, the authority for current combat HP, action ordering, and any cooldown, range or per-wave limit remain for T54 to specify; do not invent those values.

The automatic clock may run during battles and offline while the structure is not actively being damaged. Each damaging hit pauses it and discards all prior elapsed recovery progress. After 3 seconds with no further damaging hit, a fresh base duration is calculated from current HP; another hit restarts that quiet window. Paused and quiet-window time do not count toward the 600-second base-duration cap, so wall-clock time may exceed 10 minutes. Automatic health restoration completes only between waves. A timer expiring during a battle does not heal the structure, revive a tower or close an obstacle gap in that battle; automatic recovery applies at the next safe inactive boundary. The sole combat exception is an accepted paid Repair now action, applied at its authoritative ordered event/tick.

A subsequent wave ending is not itself a recovery trigger. Surviving structures do not automatically become whole just because a wave ended. Once a structure has actually returned to full health, later damage starts a fresh recovery cycle.

A structure ending a wave at 40/100 HP and one ending at 0/100 HP use the same damage-proportional countdown rule or Repair now. The base duration is 600 seconds multiplied by the missing-health fraction; zero health reaches the same 10-minute maximum. Automatic completion restores 100/100 only between waves; paid Repair now restores the selected structure immediately, including during a wave. There is no separate rebuild cooldown in the replacement model.

## Captain, Carpenter and Workshop roles

- Remove Captain E repair/rebuild actions and the three-second repair action under the new policy. Keep E for unrelated interactions such as building, firing a cannon and helping up a captain.
- Remove Captain repair-only skills, including Quick Fix, and refund their spent skill points. Do not replace them with another automatic Captain healing ability or a nearby support aura.
- Carpenters and Workshops only shorten the same automatic recovery countdown. They do not heal or rebuild structures independently during a battle.
- Automatic or free structure HP restoration never completes during combat. Paid Repair now is the sole combat HP-restoration path. Audit E, Carpenters, Workshops and passive wall regeneration so none bypasses that rule.
- Captain/Tavern healing, revives, the shipwreck restoration quest and other non-structure systems are outside this repair change.

### Existing structure-healing and compatibility audit

The current simulation has several separate wall HP paths that implementation must remove from new-policy battles or explicitly map to the shared countdown: Captain E repairs and rebuilds walls and, under `tower_health`, towers; Carpenters repair/rebuild walls; Workshops auto-rebuild broken walls and accelerate or mend nearby walls; Bastion adds passive wall regeneration; Quick Mend and Mason Drill multiply wall repair effectiveness. These effects cannot continue restoring structure HP in combat. Quick Mend and Mason Drill are modifiers, not independent healing sources, and need a reviewed useful replacement or retirement plan.

The Shipwright skill branch includes direct repair strength/range and rebuild-strength choices, including Quick Fix; its point refund and any preserved non-repair benefit require an explicit, repeatable migration plan. The Engineer role adds repair-triggered wall strength as well as a 10% discount on buildings and upgrades: decide the fate of the repair-triggered combat bonus and refund/compensation while preserving the separate building discount. Bastion also increases wall maximum HP by 50%; review that benefit separately from its passive wall regeneration. No skill, role or purchase should become a silently useless investment.

The exact countdown speed bonuses and caps are not approved yet. They must be shown in the final implementation plan, alongside how hiring, Workshop movement or demolition affects an already-running countdown. No additional repair mechanism is implied by those modifiers.

## What this replaces

This decision replaces the earlier proposal's survivor-at-wave-end healing, one-subsequent-wave shortcut, partial rebuilds, rebuild cooldowns, automatic in-battle Carpenter/Workshop repairs and Captain repair actions. The prior nearby-only/strongest-Captain discussion applied to a discarded Captain-support design; it is not part of this replacement.

Earlier dated STATUS entries are historical records and must remain untouched. Existing D039/D049 runtime behavior stays valid until an explicitly versioned implementation is reviewed and released. This document does not assert that the current game already follows the new design.

## Implementation plan to prepare before production coding

1. Audit current HP-bearing kinds, all structure-healing sources, Captain skill costs, Engineer effects and wall research bonuses. Propose exact speed/price/compatibility values without leaving inert purchases behind.
2. Define versioned server-owned recovery state and immutable wave-start snapshots for walls and towers, plus a separate authoritative in-wave paid-action history. Do not mutate initial snapshots when a paid repair occurs. Order paid restores and damage with server-authorized event/tick stamps; reconcile later damage after a paid restore while rejecting stale pre-restore finish reports, rather than ignoring a whole-wave report by its start timestamp. The base duration is `600 seconds × missing-health fraction`; each damaging hit discards prior progress, and after exactly 3 seconds without another hit start a fresh duration from current HP. Further hits restart that quiet window. [T54](../docs/OPEN-TODOS.md#11-unified-defense-recovery--unassigned-follow-ups-16-nov) / [issue #120](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/120) specifies current-combat-HP authority, ordering and server-clock handling.
3. Specify atomic paid recovery with a personal wallet and idempotent action ID, with use allowed both during and between waves. Validate the selected target and current HP from the approved authority, charge once, and publish an authenticated ordered/tick-stamped action event. Serialize the action against hits, finishes, timer expiry, new waves, resets, upgrades and competing callers. Preserve post-restore damage while rejecting stale pre-restore reports; define a replacement for the current late-record fence where needed.
4. Plan simulation, interaction, card and guide changes: no automatic/free new-policy battle healing; paid Repair now is the sole combat HP restoration and must replay identically for active clients, late joiners and reconnects. Define how a paid restore affects tower firing and obstacle closure without trapping boarders. Preserve old frozen waves and unrelated E actions.
5. Specify safe, repeatable skill refunds and staged migration/flag rollout. Use additive migrations; do not edit applied migrations. Preview and production changes require their own authorization.
6. Present the concrete plan, tests and material risks to Ianno for OK before production coding. Each implementation task gets its own branch and draft PR.

### Values and compatibility still requiring a concrete proposal

- Carpenter/Workshop speed percentages, stacking/caps/radius and treatment of changes during a countdown.
- Repair now pricing for each kind/level/upgrade state; preserve personal-wallet authority and show a consistent formula.
- Exact refund handling for the retired Shipwright choices and Engineer's repair-triggered combat bonus; its existing building discount is separate.
- Treatment of non-Captain wall modifiers such as Quick Mend, Mason Drill and Bastion: no retained battle healing or silently useless purchase.
- Exact server timer anchor/trust, immutable initial snapshot plus action-history/event ordering, current-combat-HP authority, finish-report reconciliation, endpoint/event/version names, upgrade safeguards and rollback sequencing. Paid-action prices and any cooldown, range or per-wave cap also remain unapproved. These are proposed implementation contracts, not existing APIs.

## Verification required for implementation

- Lifecycle parity for every supported kind: exact base-duration formula (600 seconds × missing-health fraction), including 10% / 50% / 100% missing health; damage-time pause excluded from the 600-second base cap; the exact 3-second quiet window, discarded prior progress and restart-on-hit behavior; restoration clears recovery; later fresh damage after full restoration starts a new cycle.
- Before/at/after expiry; battle/offline elapsed time; 3-second quiet-window and restart-on-hit boundaries; wall-clock time exceeding 10 minutes while paused; expiry while a wave is active; first inactive boundary; no survivor or next-wave shortcut. Automatic expiry never restores HP during a wave.
- No new-policy automatic/free HP restoration from E, Carpenter, Workshop or wall regeneration during a battle. The authorized paid Repair now event is the only combat exception. Legacy waves retain their frozen behavior; unrelated E/revive/weapon actions still work.
- Paid restore of partial/destroyed targets during and between waves; insufficient funds; personal-wallet atomicity; same-UID retry; two callers; forged/duplicate/reordered events; current combat HP validation; timer/payment/finish/new-wave/reset races; post-restore damage retained; stale pre-restore damage rejected; no immutable snapshot mutation.
- Skill-point conservation and idempotent refunds for all valid retired loadouts. Preserve unrelated skills, roles, coins, XP and progression according to the reviewed migration plan.
- Two-client, late-join and reconnect agreement for tick-stamped paid restores; damage before/after restore and finish ordering; restored tower firing; obstacle closing/path changes without trapping boarders.
- Real disposable PostgreSQL tests, migration reapplication/permissions checks, documented backend/frontend checks and targeted multiplayer evidence. Record actual results and any separate blockers; never weaken assertions to obtain green checks.

This documentation-only change needs document/link checks and a full diff/content review. It does not justify claiming implementation tests or a live rollout.

## Risks and release limits

Removing free combat repairs and adding paid combat restoration change balance. The proportional timer, damage-pause rule and 3-second quiet-window rule affect pacing; modifiers, event ordering and prices need review, and skill removal must not lose player investment. A client-reported finish is bounded but does not become authoritative combat verification through this design. Review legacy-wave compatibility and timer/payment concurrency before implementation.

No production code, runtime flag, migration or deployed data is changed by this design update. Keep the documentation PR draft until Ianno's review and Franz's current-revision approval. New STATUS content must be appended only, with `Ianno /` at the start of the entry; existing STATUS bytes must remain unchanged.
