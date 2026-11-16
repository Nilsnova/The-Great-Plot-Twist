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
| Wait | One automatic recovery countdown, 10 minutes before bonuses. Completion restores full health. |
| Pay | One **Repair now** action between waves skips the remaining wait and restores full health immediately. |

The clock runs during battles and offline. Health restoration completes only between waves. A timer expiring during a battle does not heal the structure, revive a tower or close an obstacle gap in that battle; recovery is applied at the next safe inactive boundary.

Further damage does not reset or create another countdown. Once a structure has actually returned to full health, later damage starts a fresh cycle. A subsequent wave ending is not itself a recovery trigger. Surviving structures do not automatically become whole just because a wave ended.

For example, a structure ending a wave at 40/100 HP and one ending at 0/100 HP each wait on the same kind of countdown or use Repair now. On completion both become 100/100. There is no partial rebuild percentage or separate rebuild cooldown in the replacement model.

## Captain, Carpenter and Workshop roles

- Remove Captain E repair/rebuild actions and the three-second repair action under the new policy. Keep E for unrelated interactions such as building, firing a cannon and helping up a captain.
- Remove Captain repair-only skills, including Quick Fix, and refund their spent skill points. Do not replace them with another automatic Captain healing ability or a nearby support aura.
- Carpenters and Workshops only shorten the same automatic recovery countdown. They do not heal or rebuild structures independently during a battle.
- No structure HP restoration completes during combat under the new policy. Audit all existing structure-healing sources so passive wall regeneration cannot silently bypass that rule.
- Captain/Tavern healing, revives, the shipwreck restoration quest and other non-structure systems are outside this repair change.

### Existing structure-healing and compatibility audit

The current simulation has several separate wall HP paths that implementation must remove from new-policy battles or explicitly map to the shared countdown: Captain E repairs and rebuilds walls and, under `tower_health`, towers; Carpenters repair/rebuild walls; Workshops auto-rebuild broken walls and accelerate or mend nearby walls; Bastion adds passive wall regeneration; Quick Mend and Mason Drill multiply wall repair effectiveness. These effects cannot continue restoring structure HP in combat. Quick Mend and Mason Drill are modifiers, not independent healing sources, and need a reviewed useful replacement or retirement plan.

The Shipwright skill branch includes direct repair strength/range and rebuild-strength choices, including Quick Fix; its point refund and any preserved non-repair benefit require an explicit, repeatable migration plan. The Engineer role adds repair-triggered wall strength as well as a 10% discount on buildings and upgrades: decide the fate of the repair-triggered combat bonus and refund/compensation, while evaluating the separate building discount on its own merits. Bastion also has a tower-health multiplier, so any changed benefit must be checked against current tower stats. No skill, role or purchase should become a silently useless investment.

The exact countdown speed bonuses and caps are not approved yet. They must be shown in the final implementation plan, alongside how hiring, Workshop movement or demolition affects an already-running countdown. No additional repair mechanism is implied by those modifiers.

## What this replaces

This decision replaces the earlier proposal's survivor-at-wave-end healing, one-subsequent-wave shortcut, partial rebuilds, rebuild cooldowns, automatic in-battle Carpenter/Workshop repairs and Captain repair actions. The prior nearby-only/strongest-Captain discussion applied to a discarded Captain-support design; it is not part of this replacement.

Earlier dated STATUS entries are historical records and must remain untouched. Existing D039/D049 runtime behavior stays valid until an explicitly versioned implementation is reviewed and released. This document does not assert that the current game already follows the new design.

## Implementation plan to prepare before production coding

1. Audit current HP-bearing kinds, all structure-healing sources, Captain skill costs, Engineer effects and wall research bonuses. Propose exact speed/price/compatibility values without leaving inert purchases behind.
2. Define a versioned server-owned recovery state and immutable wave snapshots for walls and towers. One clock must persist across further damage, reload, travel and offline time, and may complete only between waves.
3. Specify atomic paid recovery with a personal wallet, an idempotent action ID, current-health pricing, sufficient-funds checks and a running-wave guard. Preserve the paid-restore-versus-late-record fence from #86 for every supported structure.
4. Plan simulation, interaction, card and guide changes: no new-policy battle healing; one recovery countdown and Repair now; broken towers remain inactive/passable until actual recovery. Preserve old frozen waves and unrelated E actions.
5. Specify safe, repeatable skill refunds and staged migration/flag rollout. Use additive migrations; do not edit applied migrations. Preview and production changes require their own authorization.
6. Present the concrete plan, tests and material risks to Ianno for OK before production coding. Each implementation task gets its own branch and draft PR.

### Values and compatibility still requiring a concrete proposal

- Carpenter/Workshop speed percentages, stacking/caps/radius and treatment of changes during a countdown.
- Repair now pricing for each kind/level/upgrade state; preserve personal-wallet authority and show a consistent formula.
- Exact refund handling for the retired Shipwright choices and Engineer's repair-triggered combat bonus; its existing building discount is separate.
- Treatment of non-Captain wall modifiers such as Quick Mend, Mason Drill and Bastion: no retained battle healing or silently useless purchase.
- Exact server timer anchor, wave snapshot/report fields, policy version, endpoint names, upgrade safeguards and rollback sequencing. These are proposed implementation contracts, not existing APIs.

## Verification required for implementation

- Lifecycle parity for every supported kind: partial HP and zero HP; one countdown; later damage keeps it; restoration clears it; later fresh damage starts a new cycle.
- Before/at/after expiry; battle/offline elapsed time; expiry while a wave is active; first inactive boundary; no survivor or next-wave shortcut.
- No new-policy HP restoration from E, Carpenter, Workshop or wall regeneration during a battle. Legacy waves retain their frozen behavior; unrelated E/revive/weapon actions still work.
- Paid restore at full price/missing health as finally agreed; insufficient funds; whole structure; active wave; same-UID retry; concurrent requests; timer-expiry race; late finish record; upgrade/demolish/build identity safeguards.
- Skill-point conservation and idempotent refunds for all valid retired loadouts. Preserve unrelated skills, roles, coins, XP and progression according to the reviewed migration plan.
- Two-client, late-join and reconnect agreement, including obstacle opening/closing and tower firing eligibility.
- Real disposable PostgreSQL tests, migration reapplication/permissions checks, documented backend/frontend checks and targeted multiplayer evidence. Record actual results and any separate blockers; never weaken assertions to obtain green checks.

This documentation-only change needs document/link checks and a full diff/content review. It does not justify claiming implementation tests or a live rollout.

## Risks and release limits

Removing combat repairs changes balance. Countdown acceleration and paid prices also affect pacing, and skill removal must not lose player investment. A client-reported finish is bounded but does not become authoritative combat verification through this design. Review legacy-wave compatibility and timer/payment concurrency before implementation.

No production code, runtime flag, migration or deployed data is changed by this design update. Keep the documentation PR draft until Ianno's review and Franz's current-revision approval. New STATUS content must be appended only, with `Ianno /` at the start of the entry; existing STATUS bytes must remain unchanged.
