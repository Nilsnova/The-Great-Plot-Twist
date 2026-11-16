# T54 Repair rules and implementation plan

> **What this is:** the approved gameplay rules and the technical contract still needed before implementation.
>
> **Who uses it:** Ianno, the reserved T55–T60 implementers and reviewers. This is planning; no runtime behavior has changed.

- **Status:** gameplay rules approved by Ianno. Technical authority, persistence, ordering, API/version, rollout and implementation acceptance remain to be made concrete and reviewed before T55–T60 start. No runtime implementation has started; future additive state migrations remain possible after technical approval.
- **Owner:** Ianno (@Iannomh123456); T54 issue #120. PR #127 remains closed as superseded planning history; [PR #128](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/128) tracks the approved rules and documentation review.
- **Related records:** [D059](../docs/DECISIONS.md#d059--shared-gradual-hp-recovery-and-paid-instant-repair--2026-11-16), [T33 recovery spec](T33-persistent-tower-damage.md), [OPEN-TODOS §11](../docs/OPEN-TODOS.md#11-unified-defense-recovery--unassigned-follow-ups-16-nov).

## Approved gameplay rules

| Area | Rule |
|---|---|
| Supported structures | Walls, cannon, mortar, harpoon, culverin and swivel. Houses and watchtowers have no HP and are excluded. Preserve kind, level and upgrades. |
| Automatic repair | Actual HP heals gradually only between waves. During an active wave automatic healing is fully paused: no free HP gain and no battle-time credit through any Carpenter, Workshop or Tech path, including offline time. Successful paid Repair now remains allowed. Between waves it starts or resumes immediately at the canonical inactive boundary, including offline settlement; no post-hit quiet period or repair-specific last-hit countdown/state is needed. |
| Base rate and damage | Base rate is `maxHP / 600` HP per eligible second; missing HP determines time to full. Damage subtracts from current HP; it does not additionally reset or roll back prior healing, and it creates no separate credit bank. Example: 50→60, then damage of 10 percentage points returns HP to 50. Full restoration then later damage follows the same rule. |
| Offline | Apply the same canonical active/inactive wave phase as online play. Only inactive eligible elapsed time counts; active-wave offline time adds no healing or credit. |
| Destroyed structures | A structure at 0 HP stays at 0 and non-operational throughout an active wave unless paid Repair now succeeds. Between waves gradual repair can restore it. Any positive HP may start the next wave, but it is fragile. |
| Paid Repair now | Immediately restore one selected supported structure to full HP and reactivate it, preserving kind, level and upgrades. It works in either phase. Invalid, intact, unauthorized, insufficient-funds or quota-exhausted requests do not charge or consume a slot. |
| Combat limit | At most three successful paid repairs per island wave, shared by all players and all structures. The quota resets to three at the next wave. Between waves there is no limit. Keep quota history. |
| Fixed price | Charge the caller's personal wallet the catalogue incremental cost of the current base level, independent of damage and payer: wall levels 1–5 cost 10, 20, 40, 80, 160 coins. Level 1 price is its construction price. No Engineer discount or Tech/upgrade-tree purchase additions. Engineer's 10% build/upgrade discount remains separate. |
| Retry and concurrency | Same action UID returns its original receipt and does not heal, charge or spend a slot again. If that old UID is retried after new damage, return its old receipt plus current state without repairing the new damage. A fresh restore requires a fresh UID and, in combat, an available slot. Wallet, HP, event and shared quota changes are atomic. A stale phase/level quote at a boundary must be rejected for reconfirmation, never silently spend a scarce slot. |

## Approved between-wave bonuses

These multiply the same gradual between-wave rate; none creates an alternate repair path. They do not operate during waves because automatic repair is paused then.

- The island owner's hired Carpenters count, capped at two, is the shared island-wide source even while that owner is offline. Each adds +100%, for a maximum Carpenter factor of ×3. Visiting players' personal crew does not add to it.
- Each Workshop within 10 units adds +30%, capped at +50%; multiply its factor by the Carpenter factor.
- Wall Tech multiplies rate: Quick Mend ×2; Mason Drill ×1.5; Bastion ×3 and retains its +50% wall max HP. Quick Mend and Bastion are mutually exclusive choices; Mason Drill stacks with either.
- Fully stacked: ×4.5 from Carpenter/Workshop, then Tech; Quick Mend + Mason Drill yields ×13.5 total rate (about 44.44 seconds for full eligible healing). Bastion + Mason Drill yields ×20.25 (about 29.63 seconds).

## Captain and progression

Remove manual Captain E repair/rebuild, repair-only Shipwright skills, and the Engineer repair-triggered +25% wall HP effect. Keep Engineer's 10% construction/upgrade discount, unrelated E build/fire/revive actions, Captain/Tavern healing, and other unrelated progression. Do not add special refunds, respec tokens, player compensation or compensation migrations; ordinary state migrations may be part of approved future T55 work. Preserve normal earned/spent skill-point accounting.

## Visual and player-facing behavior for T59

Reuse the existing pixel-style health bars: dark border, green/gold/red fill. Show bars on all damaged walls and towers in both phases; hide bars on healthy structures. Fill is proportional to exact HP. Destroyed structures show an empty bar, a small `!`, and the existing ruin appearance. During waves the bar changes only from damage or successful paid repair; between waves it reflects gradual healing. A damaged structure's between-wave card clearly offers a priced instant action (for example, `Repair now — pay 40 coins`) and an estimated free-repair time (for example, `Or wait about 2 min 15 sec for free repair`). Free repair continues automatically while the card is open or ignored; no wait action, repair pause or stored time credit is needed. Calculate ETA from actual missing HP and current approved bonuses, update when HP or bonuses change, and explain `Automatic repair pauses during waves` so it is not a wall-clock promise across a next wave. During a wave show that automatic repair is paused and the shared remaining paid uses, with no combat repair ETA. Show exact HP and current fixed price; hide repair offers at full HP. Display rounding must never make low positive HP look like 0 HP. Existing relevant renderer locations are `render.js` `drawHealthBar` (around line 913) and tower bars (around line 1026); these currently omit zero HP and bars outside waves and are future implementation work.

## Technical plan required before implementation

T54 must turn the following into explicit, reviewable contracts before T55 begins. This is not an assertion that today's server is a full combat verifier: it is not.

1. **Authority and phase:** identify the trusted source for current HP, canonical wave identity/phase, damage ordering, offline settlement and eligible time. Preserve the server's current limits; do not imply it proves client-reported combat hits. Define phase-boundary behavior for settlement, quotes and requests.
2. **State and replay:** specify persistent actual HP, structure identity/generation, repair receipts, per-wave shared quota and quota history. No repair-specific last-hit timestamp/countdown state is required. Keep wave-start snapshots immutable. Define ordered authoritative damage/repair events, replay/checkpoint behavior for active clients, late joiners and reconnects, and stale finish-report reconciliation so post-repair damage survives while stale pre-repair state cannot overwrite it.
3. **Atomicity and locks:** specify one transaction boundary for wallet debit, current HP/full restore, event receipt and shared combat slot. Define a consistent lock order across repairs, damage/gradual settlement, wave finish/start, upgrades, demolition and island reset. Specify idempotency keys and receipt/current-state response on old-UID retries after later damage.
4. **Precision and clocks:** choose exact stored HP precision, deterministic rate arithmetic and rounding/clamping, canonical inactive-phase boundary, offline eligible-time calculation and rate changes between waves. There is no post-hit quiet boundary or hit-dependent repair delay. Do not introduce elapsed healing credit beyond actual HP.
5. **API and compatibility:** define versioned request, response, event and error shapes; authorization/membership checks; phase/level stale quote rejection; feature flag and additive migration plan; legacy wave behavior; upgrade safeguards; and rollback/drain sequencing. Preserve existing live wall-only route semantics until a reviewed versioned replacement ships. Keep current API documentation truthful.
6. **Safe world behavior:** document how a successful paid restoration re-enables tower firing and any obstacle/path collision without trapping or stranding boarders. Preserve the existing safe obstacle restore/egress behavior. No free instant healing through wave end, reload, upgrade, or stale payment; guard bypasses while permitting legitimate new construction.
7. **Rollout:** staged migration and feature-flag sequence, legacy-wave drain, observability and rollback. No production migration application, flag activation or deployment is authorized by this plan; future additive state migrations may be developed after approval.

### Verified existing-code constraints

These describe current code, not future behavior:

- `wall_health.py` has a wall-only 600-second recovery timer and missing-HP-based price; the approved fixed current-level incremental price replaces that price basis. The replacement has no post-hit repair delay.
- `tower-health.js` keeps transient per-wave tower HP and has free Captain E repair behavior.
- `sim.js` has independent Carpenter jobs, Workshop rebuilding and Bastion regeneration paths. Future work must route only the approved between-wave rate bonuses through one recovery path and fully pause them in waves.
- `rules.skill_points()` derives available points from earned points minus active skill costs; retain ordinary accounting after retiring repair-only skills.
- `IslandView.crew` is personal to each viewer. The co-op Carpenter rate must come from the island owner's hired Carpenter count, including when that owner is offline, not from visitor-local crew.
- `sync.js` applies late inputs at the receiver's next tick and documents possible drift; rooms do not retain full history for late joiners. Durable ordered paid-repair events and replay/reconciliation are therefore still technical design work.
- The seven repair-only Shipwright choices currently named in the old proposal are `quick_fix`, `long_reach`, `sturdy_planks`, `master_shipwright`, `swift_hammer`, `wide_arc`, and `grand_engineer`. Retire these under the approved policy while preserving unrelated Captain skills and normal earned/spent point accounting.

## Implementation task sequence

The issues remain claimed by Ianno, and T55–T60 are reserved and blocked pending the complete T54 technical plan and approval. Improve display names while retaining task IDs:

| Task | Name | Scope |
|---|---|---|
| T54 | Repair rules and implementation plan | This approved gameplay contract plus concrete authority, replay, locks, rounding, API/version and rollout plan. Planning only. |
| T55 | Save wall and tower health | Persistent actual HP and ordered shared state for walls and five tower kinds; immutable initial snapshots and separate repair/damage history. |
| T56 | Paid instant repair | Atomic Repair now, fixed incremental price, per-island-wave shared three-use quota, wallet and receipt idempotency. |
| T57 | Repair behavior during waves | Enforce pause during waves, offline phase rules, destroyed gate, safe firing/obstacle behavior, legacy-wave parity. |
| T58 | Captain skills and wall research | Remove repair actions/skills and repair-triggered bonus; retain approved Engineer discount and set Tech multipliers. |
| T59 | Repair cards and feedback | Health bars, exact HP, fixed price/quota display, free-repair ETA alongside the paid action, errors, and future help/tutorial/interface documentation matching shipped behavior. |
| T60 | Repair tests and balance | Lifecycle, persistence, concurrency, multiplayer, UI, migration and balance verification plus staged rollout readiness. |

Coordinate unrelated T50 ship damage, T52 preparation/tutorial UI and T53 island reset. Each future implementation task has its own branch and review. No player guide is to be rewritten as though future behavior has shipped; update player-facing docs only with T59 after implementation.

## Required future verification

- Phase boundaries: automatic repair is paused through the full active wave, including Carpenter, Workshop, Tech, disconnected owner and offline intervals; successful paid Repair now is allowed. Between-wave eligible time advances HP immediately at the canonical inactive boundary, including offline settlement. Test start/resume at wave end, reload, next-wave start and phase changes; there is no hit-dependent quiet timer or repair delay.
- Six supported structure kinds, all levels, 10/50/100% missing HP, 50→60→50 after damage, repeated hits, full health then damage, precision/clamping; houses/watchtowers excluded.
- Every old free healing path: Captain E, each Carpenter/Workshop/Tech path, Bastion, wave end, reload, upgrades and stale payments. Confirm no FREE/automatic active-wave HP increase while allowing successful paid Repair now and valid new construction.
- Destroyed structures stay at zero and inactive during waves absent a successful paid repair; successful paid repair reactivates, and any later destruction reapplies the gate. Test next-wave start after any positive between-wave repair.
- Prices for each supported kind/current base level, including wall 10/20/40/80/160; same price at partial and zero HP and across payers; no Engineer/Tech price discount. Failed actions do not charge or consume quota.
- Quota: three successes total for the island wave across players and all structures, fourth fails, four distinct structures, two clients racing for last slot, shared reset next wave, unlimited between waves, preserved history.
- Same UID retries, including after new damage; distinct UID after new damage; old receipt with current state; concurrent charge/quota/HP transaction; phase or level boundary stale quote; wallet race.
- Two-client replay, reconnect, late join, duplicated/reordered events, paid repair then subsequent damage, finish reporting, immutable snapshots, offline recovery, wave history and island reset.
- No free instant-heal bypass, safe obstacle restoration and egress, restored tower firing, exact HP bars including destroyed empty bars and low positive HP, dynamic displayed price versus free ETA at different HP/bonus values, near-instant paid repair concurrent with free healing, intact-target rejection without charge, ETA switches to paused at wave start and recomputes from actual HP/current bonuses when inactive again, cards and shared quota, and consistent state on two clients.
- Run actual documented code, migration, multiplayer and UI checks only once implementation exists; record actual results. This planning update has no runtime test results.

## Known limits and gate

Server authority over wallet and accepted events is not proof of every combat hit. T54 must not promise a full combat verifier unless a separately approved design provides one. Rate, payment, quota and phase rules materially affect balance; demonstrate them in early/mid/late solo and co-op waves before release. Obtain Ianno's explicit approval of the concrete technical plan before runtime work. Preserve old frozen-wave behavior. Additive migrations only; no migration edit/application, flag flip, or production change without its separate authorization. Ianno manually reviews; Franz approves the current revision before a human merge; agents do not merge or enable auto-merge.
