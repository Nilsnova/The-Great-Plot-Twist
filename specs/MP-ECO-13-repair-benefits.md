# MP ECO 13 Repair benefits after full wave end healing

> **What this is:** the Carpenter purchase policy and repair-benefit compatibility requirements for the shared island economy.
>
> **Who uses it:** the island crew, Captain progression, repair, conversion and UI implementations.

- **Status:** Carpenter purchase retirement agreed; other repair-only benefits, conversion and implementation remain open.
- **Branch:** `docs/mp-eco-13-repair-benefits`.
- **Issue:** [MP-ECO-13 #496](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/496), under [epic #492](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/492).
- **Planning baseline:** [#491](https://github.com/Nilsnova/The-Great-Plot-Twist/pull/491); integration must match its final accepted rules.

## Why

The 18 November revision of [D059](../docs/DECISIONS.md#d059--shared-gradual-hp-recovery-and-paid-instant-repair--2026-11-16) makes eligible structures whole at canonical wave end, including loss, expiry and abandonment. Increasing between-wave recovery speed therefore provides no benefit after an ordinary completed wave. The newer [playtest migration](../supabase/migrations/20261118040000_playtest.sql) explicitly replaces gradual end-of-wave settlement. The remaining rate helpers and older T54/T58 descriptions are retained implementation/history, not a reason to sell a useless improvement.

The agreed economy retains three successful paid instant repairs per reserved wave, their fixed current-level catalogue price, free end-of-wave healing and time-only teammate revival. Captain development and respec consume no coins. Engineer retains the separate 10% construction/upgrade discount and its next-personal-wave role commitment. None of these rules is changed by this proposal.

## Current affected offers and effects

Amounts and effects below describe this checkout's catalogue and policy code, not new approved balance values or a live deployment audit. Sources are [islands.json](../backend/content/islands.json), [campaign.json](../backend/content/campaign.json), the [shared rate helper](../backend/server/island/structure_recovery_rate.py), [house roles](../frontend/src/campaign/houses.js), [Captain policy](../backend/server/island/captain_recovery_policy.py), [Captain stats](../frontend/src/pirates/captain-stats.js) and [Tech definitions](../frontend/src/campaign/tech.js).

| Offer | Current acquisition | Existing effect | What survives full wave-end healing |
|---|---|---|---|
| Carpenter | 30 coins each, maximum 2; island unlock after wave 5 | Legacy: 6 HP/s on damaged walls, rebuild work 8 s. Recovery v1: each adds +100% between-wave rate, capped at a combined ×3. | No useful between-wave rate benefit; legacy in-wave repair must not leak into the shared recovery policy. |
| Workshop house role | Free selection on a house from level 2; switching is free between waves. House construction/levels are separate paid assets. | Recovery v1: structures within 10 units gain +30% rate per Workshop, capped +50%. Legacy also has wall rebuild/automatic-mend paths. | House and its loot bonus remain; the Workshop role's repair-only effect has no regular between-wave value. |
| Quick Mend wall skill | Wall research tier 1 costs 120 coins for the branch; equipping a tier-1 wall skill costs 40 coins per wall. | Equipped wall recovers ×2 faster between waves. | Rate-only skill needs retirement or a chosen replacement. Do not refund the whole branch research: Stone/Spiked and later research still have uses. |
| Mason Drill wall research | Wall tier 2 costs 240 coins; choice is exclusive with Thick Walls. | Every wall recovers ×1.5 faster between waves. | Rate-only tier-2 choice needs retirement/replacement; preserve the acquired tier and later progression. |
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

New Carpenter hires are unavailable in the shared island economy. No fortification bonus, automatic paid-repair behavior or other replacement effect is introduced. The legacy economy retains its existing scoped behavior.

Existing Carpenter counts, payment provenance and crew history remain intact for explicit conversion. Removing a new-purchase offer does not authorize deletion of an existing asset or a refund calculated from today's catalogue. Existing Carpenter-only repair effects cannot bypass the new reserved-wave repair rules.

The shared crew purchase service must reject Carpenter intents before charging, and shared-mode cards must not present an actionable Carpenter hire. Gunner, Guard and Lookout purchases retain their own island-wide counts, unlocks and configured prices.

The other repair-only offers in the inventory still need a consistent policy before their shared-mode offers are enabled. A bounded retirement approach would stop Workshop selection, Quick Mend and Mason Drill while preserving the house/loot asset, the acquired research tier and access to later tiers. Keep Bastion's +50% max HP, Tavern healing, Barracks, Medic effects and Engineer's retained discount/commitment. This broader retirement and each existing paid asset's replacement/refund treatment remain explicit conversion decisions; no new multiplier or automatic refund is specified here.

## Existing purchase and point conversion

The monetary conversion policy is specified by MP-ECO-17. Conversion must not infer every historical price from today's catalogue or assign a personal buyer's old payment to multiple islands. Keep immutable contribution/payment receipts; distinguish a per-wall skill payment from branch research, research switching and an unpriced house role. No refund may be paid privately and into the island again. An island with unresolved obsolete paid state is not admitted on the assumption that its value can simply disappear.

For retired personal skills, the preferred bounded mechanism is to preserve earned points, remove retired IDs from the new active allocation under a versioned conversion, and recompute spent points from the retained valid allocation. Return exactly the retired allocation's actual point cost to availability; do not raise the earned total or add a coin reward. Repeat conversion must do nothing extra. Preserve old frozen-wave snapshots and history, do not mutate a reserved Captain's active stats, and use the MP-ECO-07/17 profile-transition contract. Ordinary free respec remains an alternative explicit transition, subject to the Engineer role commitment; no path may clear that commitment.

If Quick Mend/Mason Drill are retired, a no-coin replacement choice at the same already acquired tier is a possible conversion policy, not a rule selected here. Preserve the research tier and access to later tiers; replacing a retired choice must not charge for the same tier again or issue both a replacement and a refund for the same paid value. Bastion remains useful and is not refunded merely because its obsolete rate clause is removed.

## Implementation boundaries

This branch changes only this spec. It does not change runtime helpers, catalogue prices, stats, SQL, UI offers, a feature flag or a live deployment. Preserve legacy version-0 islands and frozen legacy waves until an explicit versioned admission chooses otherwise. Do not rewrite T54–T60 history or claim their remaining authenticated-client/egress/balance checks are complete.

Future implementation is likely to touch `backend/content/islands.json`, `backend/content/campaign.json` and their existing browser copies; `backend/server/island/captain_recovery_policy.py` and recovery/snapshot helpers; `frontend/src/campaign/{captain-repair-policy,houses,tech}.js`; `frontend/src/pirates/{captain-stats,sim}.js`; Captain/Tech/house/crew cards and their focused tests. Dependencies are the MP-ECO-06 shared-crew mutation contract, 07 personal progression/Engineer commitment, 12 repair payments/quota, 17 conversion and 18 scoped UI. Do not change the fixed repair-price rule as a side effect of a benefit redesign.

## Done when and future checks

The design contribution is complete when this inventory, selected Carpenter rule and remaining compatibility requirements are reviewed, every local link resolves, the point-cost arithmetic matches the catalogue, and `git diff --check` passes. Runtime completion requires the remaining benefit/conversion decisions and the affected implementation contracts.

- [x] New Carpenter purchases are removed from shared-mode scope, with no replacement effect.
- [ ] The shared purchase service refuses Carpenter before any charge and the shared UI has no active hire offer; existing counts and history are retained.
- [ ] New-mode offers and wording never sell obsolete between-wave repair speed or a discount on free revival; legacy policy text/behavior remains scoped correctly.
- [ ] Bastion +50% max HP, Tavern healing, Medic hold/HP and Engineer 10% plus one-wave binding remain intact.
- [ ] Actual saved retired allocations return their point value once, preserve earned total/unrelated skills and do not clear an Engineer commitment. Include a valid 13-point Shipwright path, a partial path and repeated conversion.
- [ ] Paid asset conversion has explicit provenance/replacement/refund rules; house construction, branch research and per-wall skill payments are not conflated.
- [ ] Run relevant backend/frontend tests and build for the eventual code; include real client evidence for changed cards. Do not count a design document as runtime or balance evidence.
- [ ] A different human teammate reviews the current eventual implementation before merge.

## Owner and reviewer

- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`).
- **Coding agent:** Codex; the teammate remains responsible for its output.
- **Reviewer:** a different human teammate, not assigned by this local contribution.
- **Last updated:** 2026-11-18.
