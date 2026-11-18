# MP ECO 13 Repair benefits after full wave end healing

> **What this is:** the repair-benefit inventory and three bounded product choices for the shared island economy.
>
> **Who uses it:** the island crew, Captain progression, repair, conversion and UI implementations.

- **Status:** draft; inventory checked, product selection and implementation remain open.
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

## Product choices

These are alternatives, not cumulative features. No option is implemented or enabled by this spec. The selected option must be recorded in the decision log and reflected in the MP-ECO-01/06/07/12/17/18 contracts before its offers change.

| Option | Concrete behavior in the new shared economy | Cost and conversion consequences | Implementation tradeoff |
|---|---|---|---|
| **A. Retire obsolete offers first — recommended smallest scope** | Stop offering new Carpenter hires, Workshop selection, Quick Mend and Mason Drill. Keep Bastion as +50% max HP, Tavern healing, Barracks, other wall skills/research and Engineer's 10% discount with its commitment. Retain old identities/history until the selected conversion resolves existing assets. | No new replacement price or multiplier. Workshop selection itself cost no coins, so the house/loot asset remains and the team can choose a surviving role without a role-switch fee. Existing paid Carpenter/Quick Mend/Mason choices need MP-ECO-17's explicit preserve/replace/refund policy before admission; do not silently neutralize a paid asset. Restore retired personal point value through the agreed allocation conversion/free respec, never by minting coins. | Smallest runtime surface and no extra healing or automatic spending. Fewer offers remain until an intentionally designed replacement is selected. |
| **B. Keep Carpenter as a fortifier** | Carpenter adds a passive max-HP bonus to the six supported damageable structure kinds, frozen into the wave-start snapshot. A candidate for balance review is +10% per Carpenter, capped at +20% for the existing maximum of two. Retire the other rate-only offers as in A; preserve Bastion's existing HP benefit. | Keep Carpenter's current 30-coin hire price/max 2 and wave-5 unlock as a proposal, not approved balance. Existing Carpenter counts map to the replacement rather than being refunded again. Point/other-offer conversion is the same explicit policy gate as A. | Keeps a useful Carpenter without changing repair price, quota or introducing free combat healing. Requires chosen HP values, combination rules with Stone/Thick Walls/Bastion, and early/mid/late balance evidence. |
| **C. Keep Carpenter as a paid-repair assistant** | With a team setting explicitly enabled between waves, each Carpenter may automatically invoke one existing instant repair in the next reserved wave when an eligible structure is destroyed. Maximum two automated successful actions with two Carpenters. These consume the same three team repair uses and full fixed price; no extra uses or free HP. Retire the other rate-only offers as in A. | Keep the 30-coin hire price/max 2/wave-5 unlock as a proposal. Default automation off, so conversion does not silently authorize treasury spending. Existing counts remain owned. Failed or unaffordable attempts consume neither coins, a repair use nor the worker's successful-action allowance. | Preserves the repair theme through convenience. Needs server-authoritative target order, opt-in setting, stale-quote handling and races with manual repairs/bets. It is a larger runtime change than A or B. |

Option B's 10%/20% values are a concrete candidate for discussion, not a target silently selected by this task. Option C changes no accepted repair price or successful-action quota; manual and automatic actions must share the same transaction and journal path. A deterministic destroyed-target/event ordering and bounded retry rule are prerequisites if C is chosen. Avoid importing the legacy free Carpenter/Workshop healing paths as an implementation shortcut.

## Existing purchase and point conversion

The monetary conversion policy is specified by MP-ECO-17. Conversion must not infer every historical price from today's catalogue or assign a personal buyer's old payment to multiple islands. Keep immutable contribution/payment receipts; distinguish a per-wall skill payment from branch research, research switching and an unpriced house role. No refund may be paid privately and into the island again. An island with unresolved obsolete paid state is not admitted on the assumption that its value can simply disappear.

For retired personal skills, the preferred bounded mechanism is to preserve earned points, remove retired IDs from the new active allocation under a versioned conversion, and recompute spent points from the retained valid allocation. Return exactly the retired allocation's actual point cost to availability; do not raise the earned total or add a coin reward. Repeat conversion must do nothing extra. Preserve old frozen-wave snapshots and history, do not mutate a reserved Captain's active stats, and use the MP-ECO-07/17 profile-transition contract. Ordinary free respec remains an alternative explicit transition, subject to the Engineer role commitment; no path may clear that commitment.

If Quick Mend/Mason Drill are retired, a no-coin replacement choice at the same already acquired tier is a possible conversion policy, not a rule selected here. Preserve the research tier and access to later tiers; replacing a retired choice must not charge for the same tier again or issue both a replacement and a refund for the same paid value. Bastion remains useful and is not refunded merely because its obsolete rate clause is removed.

## Implementation boundaries

This branch changes only this spec. It does not change runtime helpers, catalogue prices, stats, SQL, UI offers, a feature flag or a live deployment. Preserve legacy version-0 islands and frozen legacy waves until an explicit versioned admission chooses otherwise. Do not rewrite T54–T60 history or claim their remaining authenticated-client/egress/balance checks are complete.

Future implementation is likely to touch `backend/content/islands.json`, `backend/content/campaign.json` and their existing browser copies; `backend/server/island/captain_recovery_policy.py` and recovery/snapshot helpers; `frontend/src/campaign/{captain-repair-policy,houses,tech}.js`; `frontend/src/pirates/{captain-stats,sim}.js`; Captain/Tech/house/crew cards and their focused tests. Dependencies are the MP-ECO-06 shared-crew mutation contract, 07 personal progression/Engineer commitment, 12 repair payments/quota, 17 conversion and 18 scoped UI. Do not change the fixed repair-price rule as a side effect of a benefit redesign.

## Done when and future checks

The design contribution is complete when this inventory, alternatives and unresolved choice are reviewed as a local diff, every local link resolves, the point-cost arithmetic matches the catalogue, and `git diff --check` passes. Runtime completion remains blocked on product selection and the affected implementation contracts.

- [ ] A, B or C (or another explicit effect) is selected and recorded before implementation.
- [ ] New-mode offers and wording never sell obsolete between-wave repair speed or a discount on free revival; legacy policy text/behavior remains scoped correctly.
- [ ] Bastion +50% max HP, Tavern healing, Medic hold/HP and Engineer 10% plus one-wave binding remain intact.
- [ ] Actual saved retired allocations return their point value once, preserve earned total/unrelated skills and do not clear an Engineer commitment. Include a valid 13-point Shipwright path, a partial path and repeated conversion.
- [ ] Paid asset conversion has explicit provenance/replacement/refund rules; house construction, branch research and per-wall skill payments are not conflated.
- [ ] If B: all clients use the same frozen HP and capped island crew count; modifiers compose as selected, no HP/stat gain during a reservation, no visitor-local count or reload exploit.
- [ ] If C: manual/automatic requests race for the same three uses and treasury; insufficient funds, all-in wagers, stale quotes and retries grant no extra HP/uses. Automation is off until explicitly selected and enabled.
- [ ] Run relevant backend/frontend tests and build for the eventual code; include real client evidence for changed cards. Do not count a design document as runtime or balance evidence.
- [ ] A different human teammate reviews the current eventual implementation before merge.

## Owner and reviewer

- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`).
- **Coding agent:** Codex; the teammate remains responsible for its output.
- **Reviewer:** a different human teammate, not assigned by this local contribution.
- **Last updated:** 2026-11-18.
