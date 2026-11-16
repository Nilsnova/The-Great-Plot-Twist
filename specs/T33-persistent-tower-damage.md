# T33 Unified structure Repair — approved rules, not implemented

> **What this is:** the approved gameplay rules for gradual and paid repair of walls and towers.
>
> **Who uses it:** T54–T60 planning and implementation. See the [T54 implementation plan](T54-recovery-implementation-plan.md) for technical contracts and checks still required.

- **Status:** gameplay rules approved by Ianno (@Iannomh123456), 16 Nov 2026. No runtime code, player guide or interface contract has been changed to claim this is live.
- **Decision:** [D059](../docs/DECISIONS.md#d059--shared-gradual-hp-recovery-and-paid-instant-repair--2026-11-16); T54 issue #120. PRs #127 and #128 are closed unmerged and remain closed.

## Scope and automatic repair

The six supported kinds are walls, cannon, mortar, harpoon, culverin and swivel. Houses and watchtowers have no HP and are excluded. Preserve each structure's kind, level and upgrades.

Automatic gradual repair runs only between waves. During every active wave, automatic HP gain and healing-time credit are completely paused across all Carpenter, Workshop and Tech paths and offline time. A successful paid Repair now remains allowed. Between waves, repair starts or resumes from actual HP immediately at the canonical inactive boundary, including when settling offline time. There is no post-hit quiet period or repair-specific last-hit countdown/state. Base rate is `maxHP / 600` HP per eligible second; missing HP determines time to full. Damage subtracts from current HP; it does not additionally reset or roll back prior healing. There is no separate credit bank. For example: at 50%, healing to 60% then taking 10 percentage points of damage returns to 50%; there is no separate credit bank. Offline settlement uses the same canonical active/inactive phase as online play.

A destroyed structure remains at 0 HP and non-operational for the rest of an active wave unless a successful paid Repair now restores it. Between waves gradual repair can restore it. Any positive HP is sufficient to start the next wave, but the structure is fragile. Wave completion, reload, upgrade or stale payment cannot cause a free instant heal.

## Paid Repair now

Repair now immediately restores one selected structure to full HP and reactivates it, preserving kind, level and upgrades. It works in either phase and costs the catalogue incremental price of the current base level, independent of damage or payer; wall levels 1–5 cost 10, 20, 40, 80 and 160 coins. Engineer discounts and Tech/upgrade-tree purchases do not alter this price. Engineer's 10% build/upgrade discount remains separate.

During a wave, each island has three successful repairs total across all players and structures; the quota resets to three next wave. Between waves repairs are unlimited. Invalid, intact, insufficient-funds, unauthorized or exhausted requests consume neither payment nor quota. Wallet, HP, event and quota update atomically. Retries with the same UID return the original receipt and do not heal, charge or consume a slot; after new damage, that retry also returns current state without restoring it. A fresh restore requires a fresh UID. Reject stale phase/level quotes for reconfirmation rather than silently spending a scarce slot.

## Approved between-wave rate modifiers and progression

- Island owner's hired Carpenters are the island-wide source, capped at two, including while the owner is offline. Each adds +100% (×3 maximum); visiting players' personal crew does not count.
- Each Workshop within 10 units adds +30%, capped at +50%. Multiply Carpenter and Workshop factors.
- Wall Tech multiplies this between-wave rate: Quick Mend ×2, Mason Drill ×1.5, Bastion ×3 and retains +50% wall max HP. Quick Mend and Bastion are mutually exclusive; Mason Drill stacks with either. Maximum rate is ×20.25 with Bastion, two Carpenters, capped Workshop and Mason Drill. The same modifiers are fully paused during waves.
- Remove Captain E manual repair/rebuild, repair-only Shipwright skills, and Engineer's repair-triggered +25% wall HP. Preserve Engineer's 10% construction/upgrade discount; unrelated E build/fire/revive, Captain/Tavern healing and unrelated progression. No special refund, respec or compensation migration; ordinary earned/spent-point accounting remains valid.

## Future visual and documentation work

T59 should reuse the current pixel-style health bars (dark border, green/gold/red fill). Show proportional bars for damaged walls and towers in both phases; hide healthy bars. Destroyed structures show an empty bar, small `!` and existing ruin appearance. During combat, bars change only on damage or successful paid repair; between waves gradual repair fills them. Between-wave damaged-structure cards must clearly offer both choices: a priced instant action (for example, `Repair now — pay 40 coins`) and an estimated free-repair time (for example, `Or wait about 2 min 15 sec for free repair`). Free repair continues automatically while the card is open or ignored; no wait action, repair pause or stored time credit is needed. Calculate ETA from actual missing HP and current approved bonuses, update it when HP or bonuses change, and explain `Automatic repair pauses during waves` so players do not mistake it for a wall-clock promise across a new wave. During a wave show that automatic repair is paused and the shared remaining paid uses, without a combat repair ETA. Show exact HP and current fixed price; hide repair offers at full HP. Never round low positive HP down to a misleading 0%. Existing draw functions omit destroyed bars and outside-wave bars, so this is future renderer work. Update player-facing docs after behavior ships and matches the UI.

## Implementation and verification gate

T54 must specify trusted HP/phase authority, persistent state, deterministic precision, event replay, stale-finish reconciliation, payment/quota atomicity, API/version shapes, locking, legacy-wave compatibility, safe obstacle/egress behavior and rollout. The server is not a full combat verifier; plans must not claim it proves every reported hit. Preserve immutable wave-start snapshots and separate ordered damage/repair history. Use additive migrations for future approved state work; no migration application, feature activation, deployment or production change is authorized by this design record.

T55–T60 are claimed and reserved by Ianno but remain blocked pending the reviewed T54 technical plan. Their task titles and detailed coverage live in [OPEN-TODOS §11](../docs/OPEN-TODOS.md#11-unified-defense-recovery--unassigned-follow-ups-16-nov). Future verification must cover active/inactive boundaries, offline/reload, every free-heal path, three repairs plus a racing fourth request, two clients contending for the last slot, retries after new damage, wave history, card/bar edge cases, prices, safe obstacle restore, multiplayer replay and no bypass. No code or UI test has been run for this documentation-only update.
