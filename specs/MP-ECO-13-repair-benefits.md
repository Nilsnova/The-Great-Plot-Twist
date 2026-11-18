# MP ECO 13 Repair benefits after full wave end healing

> **What this is:** the Carpenter purchase policy and repair-benefit compatibility requirements for the shared island economy.
>
> **Who uses it:** the island crew, Captain progression, repair, conversion and UI implementations.

- **Status:** repair-only offer retirement agreed in D059; runtime integration and verification remain open.
- **Branch:** `docs/mp-eco-13-repair-benefits`.
- **Issue:** [MP-ECO-13 #496](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/496), under [epic #492](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/492).
- **Planning baseline:** [#491](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/491); integration must match its final accepted rules.

## Why

The 18 November revision of [D059](../docs/DECISIONS.md#d059--shared-gradual-hp-recovery-and-paid-instant-repair--2026-11-16) makes eligible structures whole at canonical wave end, including loss, expiry and abandonment. Increasing between-wave recovery speed therefore provides no benefit after an ordinary completed wave. The newer [playtest migration](../supabase/migrations/20261118040000_playtest.sql) explicitly replaces gradual end-of-wave settlement. The remaining rate helpers and older T54/T58 descriptions are retained implementation/history, not a reason to sell a useless improvement.

The agreed economy retains three successful paid instant repairs per reserved wave, their fixed current-level catalogue price, free end-of-wave healing and time-only teammate revival. Captain development and respec consume no coins. Engineer retains the separate 10% construction/upgrade discount and its next-personal-wave role commitment. None of these rules is changed by this proposal.

## Legacy and retired offer inventory

Amounts and identifiers below inventory stored catalogue values and earlier gradual-recovery clauses for compatibility. They are not currently available recovery-v1 offers or newly approved balance values. Main already retires these rate-only offers under v1; the shared economy preserves their history and unrelated benefits. Sources are [islands.json](../backend/content/islands.json), [campaign.json](../backend/content/campaign.json), the [shared rate helper](../backend/server/island/structure_recovery_rate.py), [house roles](../frontend/src/campaign/houses.js), [Captain policy](../backend/server/island/captain_recovery_policy.py), [Captain stats](../frontend/src/pirates/captain-stats.js) and [Tech definitions](../frontend/src/campaign/tech.js).

| Offer | Historical acquisition | Earlier effect | What survives full wave-end healing |
|---|---|---|---|
| Carpenter | 30 coins each, maximum 2; island unlock after wave 5 | Legacy: 6 HP/s on damaged walls, rebuild work 8 s. Recovery v1: each adds +100% between-wave rate, capped at a combined ×3. | No useful between-wave rate benefit; legacy in-wave repair must not leak into the shared recovery policy. |
| Workshop house role | Free selection on a house from level 2; switching is free between waves. House construction/levels are separate paid assets. | Recovery v1: structures within 10 units gain +30% rate per Workshop, capped +50%. Legacy also has wall rebuild/automatic-mend paths. | House and its loot bonus remain; the Workshop role's repair-only effect has no regular between-wave value. |
| Quick Mend wall skill | Wall research tier 1 costs 120 coins for the branch; equipping a tier-1 wall skill costs 40 coins per wall. | Equipped wall recovers ×2 faster between waves. | Retired under v1. Do not refund the whole branch research: Stone/Spiked and later research still have uses. |
| Mason Drill wall research | Wall tier 2 costs 240 coins; choice is exclusive with Thick Walls. | Every wall recovers ×1.5 faster between waves. | Retired under v1; preserve the acquired tier and later progression. |
| Bastion wall capstone | Wall tier 3 costs 420 coins to research its choice; equipping its capstone costs 160 coins per wall. | Equipped wall gets +50% max HP and recovery ×3; legacy has separate in-wave self-mend. | Keep the +50% max HP. Remove obsolete rate/self-mend promises only under the selected new policy; do not erase a useful paid HP effect. |
| Tavern revive-price clause | Free house-role selection; house also keeps its loot bonus. | Nearby Captains heal 2 HP/s per Tavern, with the existing healing cap; a Tavern also reduces revive coin cost by 25%. | Keep healing and its cap. The price-reduction clause becomes meaningless when revive costs zero. |
| Engineer repair-triggered wall HP | Role choice; old recovery-v0 stat path only | Legacy repair-triggered +25% wall HP. Recovery v1 already removes it. | Do not restore it as a repair replacement. The retained construction/upgrade discount is independently useful. |

Quick Mend and Bastion are mutually exclusive equipped specs, not two simultaneously active rate boosts. Mason Drill is island-wide research; a researched capstone alone is not an equipped wall spec. Carpenters and Workshop counts are island-owned, independent of which member bought them or whether that buyer is online.

### Personal skills and point accounting

[T58](T58-captain-repair.md) already retires these seven repair-only Shipwright skills for recovery v1. It preserves their stored IDs and spent-point accounting; it does not currently reimburse points automatically. The catalogue costs are:

| Skill | Cost in personal points | Legacy effect |
|---|---|---|
| `quick_fix` | 1 | Repair speed ×1.5. |
| `long_reach` | 2 | +2 repair reach. |
| `sturdy_planks` | 2 | Rebuild at 55% rather than 40% HP. |
| `master_shipwright` | 3 | Repair speed ×2, rebuild at 60% HP. |
| `swift_hammer` | 3 | Additional repair-speed ×1.25. |
| `wide_arc` | 3 | +2 repair reach. |
| `grand_engineer` | 4 | Engineer capstone, rebuild at 80% HP. |

A legal complete fork path spends 13 points (`1 + 2 + 3 + 3 + 4`); all seven catalogue costs sum to 18, but an ordinary Captain cannot learn both choices of either fork. Migration must use the actual valid saved allocation, not give every player 18 points. Preserve earned progression, existing unrelated skill allocations, Medic revive hold/HP benefits, Tavern healing, ordinary combat actions and the independent Engineer role selector even if the Shipwright skill branch is hidden.

## Selected Carpenter policy

New Carpenter hires are unavailable under recovery v1, including the shared island economy. No fortification bonus, automatic paid-repair behavior or replacement effect is introduced. Preserve recovery-v0 decoding and scoped legacy behavior; legacy money does not restore a retired v1 offer.

Existing Carpenter counts, payment provenance and crew history remain intact for explicit conversion. Removing a new-purchase offer does not authorize deletion of an existing asset or a refund calculated from today's catalogue. Existing Carpenter-only repair effects cannot bypass the new reserved-wave repair rules.

The shared crew purchase service must reject Carpenter intents before charging, and shared-mode cards must not present an actionable Carpenter hire. Gunner, Guard and Lookout purchases retain their own island-wide counts, unlocks and configured prices.

The updated [D059](../docs/DECISIONS.md#d059--shared-gradual-hp-recovery-and-paid-instant-repair--2026-11-16), merged on 18 Nov, also retires new Workshop selection, Quick Mend and Mason Drill offers under recovery v1. Reject new requests before spending or progression changes. Preserve the house/loot asset, acquired research tier and access to later tiers. Remove Bastion's repair multiplier while keeping its +50% max HP. Preserve Tavern healing, Barracks, Medic effects and Engineer's discount/commitment. Existing saved retired choices and identifiers remain decodable and must not block ordinary mutations or wave admission. Introduce no replacement effect, automatic replacement role, refund, respec token or compensation subsystem.

## Existing purchase and point conversion

The monetary conversion policy is specified by MP-ECO-17. Conversion must not infer every historical price from today's catalogue or assign a personal buyer's old payment to multiple islands. Keep immutable contribution/payment receipts; distinguish a per-wall skill payment from branch research, research switching and an unpriced house role. No refund may be paid privately and into the island again. Retired identifiers remain stored under D059; their presence alone is not an admission blocker and creates no compensation claim.

Preserve retired personal skill IDs, earned totals and ordinary spent-point accounting. The seven retired choices have no active repair effect under v1. Ordinary free respec uses the actual saved allocation, returns only its normal point value and remains subject to the personal assignment and Engineer role commitment; it grants no extra points or coins. Preserve old frozen-wave snapshots and history. No automatic compensation migration is required by the selected policy.

Preserve the acquired tier and access to later research when Quick Mend or Mason Drill is stored. Existing choices do not require an automatic replacement or a refund. Normal supported switching and unrelated management remain available under their ordinary rules; do not charge for acquiring the same tier again. Bastion remains useful with its retained HP benefit.

## Implementation boundaries

This branch changes this spec and aligns the shared-economy decision/planning text with D059. It does not change runtime helpers, catalogue prices, stats, SQL, UI offers, a feature flag or a live deployment. Preserve legacy version-0 islands and frozen legacy waves until an explicit versioned admission chooses otherwise. Do not rewrite T54–T60 history or claim their remaining authenticated-client/egress/balance checks are complete.

Future implementation is likely to touch `backend/content/islands.json`, `backend/content/campaign.json` and their existing browser copies; `backend/server/island/captain_recovery_policy.py` and recovery/snapshot helpers; `frontend/src/campaign/{captain-repair-policy,houses,tech}.js`; `frontend/src/pirates/{captain-stats,sim}.js`; Captain/Tech/house/crew cards and their focused tests. Dependencies are the MP-ECO-06 shared-crew mutation contract, 07 personal progression/Engineer commitment, 12 repair payments/quota, 17 conversion and 18 scoped UI. Do not change the fixed repair-price rule as a side effect of a benefit redesign.

## Done when and future checks

The design contribution is complete when this inventory, selected retirement policy and compatibility requirements are reviewed, every local link resolves, the point-cost arithmetic matches the catalogue, and `git diff --check` passes. Runtime completion requires the affected implementation contracts and their verification.

- [x] New Carpenter purchases are removed from shared-mode scope, with no replacement effect.
- [ ] The shared purchase service refuses Carpenter before any charge and the shared UI has no active hire offer; existing counts and history are retained.
- [ ] New-mode offers and wording never sell obsolete between-wave repair speed or a discount on free revival; legacy policy text/behavior remains scoped correctly.
- [ ] Bastion +50% max HP, Tavern healing, Medic hold/HP and Engineer 10% plus one-wave binding remain intact.
- [ ] Retirement/adoption preserves unrelated allocations and normal spent-point accounting. Explicit ordinary free respec clears skill choices normally and releases their actual cost once, preserving earned totals and any Engineer role commitment. Include a valid 13-point Shipwright path, a partial path and repeated respec.
- [ ] Stored retired choices preserve identifiers, house assets, acquired tiers and ordinary management without automatic replacement or compensation.
- [ ] Run relevant backend/frontend tests and build for the eventual code; include real client evidence for changed cards. Do not count a design document as runtime or balance evidence.
- [ ] A different human teammate reviews the current eventual implementation before merge.

## Owner and reviewer

- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`).
- **Coding agent:** Codex; the teammate remains responsible for its output.
- **Reviewer:** a different human teammate, not assigned by this local contribution.
- **Last updated:** 2026-11-18.
