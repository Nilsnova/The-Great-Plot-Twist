# MP-ECO-19: shared-island numerical baseline

> **What this is:** reproducible catalogue arithmetic for reviewing the shared island economy, measured on 18 November 2026.
>
> **Who uses it:** the balance reviewer and the teammate running the eventual integrated multiplayer playtests.

**Finding:** one treasury can fund a gradually growing island, but current combat fixtures do not establish its playable pacing. The two declared purchase queues below complete the same 14,960-coin building package before wave 41 only under assumed uninterrupted victories. Starting money, prices and difficulty are unchanged. **Actual shared-mode play runs in this assessment: zero. MP-ECO-19 gameplay acceptance remains open.**

## Reproduce and classify the evidence

The [spec](../../../specs/MP-ECO-19-balance-assessment.md) describes the bounded scope. The [JSON](numerical-baseline.json) stores inputs' SHA-256 hashes, all 100 wave rows for both queues, prices and sensitivity calculations. The numerical baseline first used catalogue/rules at main commit `f0c64442` and was regenerated after integrating `f606412f`, including the split simulator configuration, fleet and setup modules. The numerical results are unchanged. The tool reads checked server loaders and existing reward math, with no network, database or game-service writes.

From `backend/`:

```bash
uv run python -m tools.economy.island_balance | cmp - ../docs/evidence/MP-ECO-19/numerical-baseline.json
uv run pytest -q server/tests/test_island_balance_assessment.py
uv run ruff check .
```

The first command succeeds with no output for identical evidence. It does not update the committed artifact. After intentionally changing inputs, regenerate with `uv run python -m tools.economy.island_balance > ../docs/evidence/MP-ECO-19/numerical-baseline.json` and reassess the conclusions.

| Evidence class | What was measured | What it establishes |
|---|---|---|
| Component revenue bounds | One win of each numbered wave, hypothetical fixed house levels, no expenses | A bound within the stated no-bonus sequential model. Houses from wave 1 are unattainable. |
| Cash-funded purchase queues | Actual spot/level unlocks, prior coins only, purchases before the next bell | Purchase affordability conditional on the assumed wins. |
| Source review and sensitivities | Party-independent fleet inputs, costs per copy, optional bonuses/replays/ship payouts | Specific pressures and experiments to run. |
| Integrated gameplay | Not run; canonical lifecycle, treasury and UI integration is pending | No shared-mode win rate, duration, difficulty or release acceptance. |

There is no coin-per-minute claim: the 5-second countdown, 10-second minimum finish and 900-second maximum are protocol bounds, not measured combat durations. Existing [headless combat evidence](../../../specs/T33-T35-balance.md) uses supplied buildings and scripted Captains; it does not debit a shared treasury or prove a viable purchase route.

## Current income

The current [catalogue](../../../backend/content/islands.json) grants **200 coins once per island run**. The target grants no money on membership changes or reconnects. A won attempt credits once, including house/boss components once; participant count and receipt acknowledgements add no treasury money. A distinct valid repeat attempt may pay again. Loss/abandonment/expiry pays zero wave loot. Captain upgrades/respec spend zero coins in this target; the catalogue's legacy Captain prices are not charged here.

Before wave 31, ordinary island loot is `25 + 10 × played wave + 10 × frozen house levels`. From 31 it is `205 + 4 × played wave + 10 × house levels`. Above wave 40, the actual server rounds the raised base and raises the integer rates: `307 + 6 × played wave + 15 × house levels`. Every fifth wave multiplies the result by 3; wave 40 uses 5. The [production functions](../../../backend/server/island/rules.py) are called directly. For example, wave 41 without houses pays 553, and wave 100 without houses pays 2,721.

These totals include the **single 200 grant**, no purchases, no bonuses, no repeats and no ship/wager money:

| Through won wave | No houses | Hypothetical six house levels from wave 1 |
|---:|---:|---:|
| 1 | 235 | 295 |
| 5 | 625 | 1,045 |
| 10 | 1,400 | 2,240 |
| 20 | 4,000 | 5,680 |
| 30 | 8,000 | 10,520 |
| 40 | 13,620 | 17,100 |
| 50 | 21,788 | 26,528 |
| 75 | 45,883 | 53,773 |
| 100 | 75,228 | 86,268 |

The JSON's `cumulativeIncomeByFixedHouseLevels` excludes the grant; `totalBeforeSpending` includes it. Unspent cash is reported separately in each purchase timeline. These component bounds do not bound all possible income: valid bonuses, distinct repeat attempts, ship scores and wagers are separate sources.

Finisher success conditionally adds `(15 + 3 × wave) × boss multiplier` once, such as 90 at wave 5 and 675 at wave 40. A sunk treasure galleon on a seed that permits that event adds `(20 + 4 × wave) × boss multiplier`, from wave 9 onward; wave 40 would add 900. The timeline assumes neither bonus. No bonus success rate was measured, and both bonuses must not be counted automatically on every wave.

## Houses and affordable purchase timing

Each house costs incremental **50 / 100 / 200**, cumulatively 350 for level 3. Two fully raised houses cost 700 and yield six house levels. Building opens after won wave 1, level 2 after wave 2, level 3 after wave 5. Every added level yields 10 per ordinary win through wave 40 and 15 afterward; a boss applies its multiplier. At the early rate, an incremental 50/100/200 purchase needs 5/10/20 ordinary successful-wave equivalents to repay itself. A loss yields no payback. House roles add no extra coin multiplier in this calculation.

Both strict queues eventually buy 12 level-5 walls, four level-5 cannons, three level-5 mortars, one level-5 watchtower and two level-3 houses. They wait for the first unaffordable or locked queued item; they do not optimize around it. The full priority order is in [the tool](../../../backend/tools/economy/island_balance_plans.py), with every purchase and its unlock in the JSON.

- **Defense first:** buy six walls and four cannons for 180 before wave 1, leaving 20; first house before wave 2, second before wave 3; finish house levels 2 before waves 11/12 and levels 3 before waves 19/20.
- **Income first:** buy six walls and two cannons for 120 before wave 1, leaving 80; both first houses before wave 2; second levels before waves 4/5; third levels before waves 6/7. Further towers wait behind those house priorities.

| After wave | Defense first: earned loot / total build spend / cash | Income first: earned loot / total build spend / cash |
|---:|---:|---:|
| 5 | 535 / 400 / 335 | 615 / 420 / 395 |
| 10 | 1,450 / 1,180 / 470 | 1,800 / 1,420 / 580 |
| 20 | 4,670 / 4,000 / 870 | 5,240 / 4,560 / 880 |
| 30 | 9,510 / 8,400 / 1,310 | 10,080 / 9,040 / 1,240 |
| 41 | 16,733 / 14,960 / 1,973 | 17,303 / 14,960 / 2,543 |
| 100 | 85,258 / 14,960 / 70,498 | 85,828 / 14,960 / 71,068 |

Each row conserves `200 + earned loot − actual spend = cash`. None spends future income or adds a house before purchase. The final package is affordable before wave 41 in both queues. It includes no crew, research, tower skills/trees, weapons, wreck, repair, fees or wagers. The large late cash balance reflects omitted spending. House prioritization earns 570 extra coins by wave 30 under these wins; its early reduction in firepower still needs combat testing.

## Costs competing for one treasury

Prices below come from the same current files; an incremental level price is charged in addition to all earlier levels.

| Purchase | Current coins | Consequence to measure |
|---|---:|---|
| Cannon levels 1–5 | 30 / 60 / 120 / 240 / 480; 930 total | Seven at level 5 cost 6,510 before other assets. Even the unattainable six-house no-bonus envelope through wave 20 is only 5,680, before any purchase. Unlock eligibility does not guarantee immediate affordability. |
| Mortar levels 1–5 | 60 / 120 / 240 / 480 / 960; 1,860 total | The mixed four-cannon/three-mortar bill is larger than seven cannons. |
| Wall / watchtower / harpoon / swivel, all levels | 310 / 1,240 / 1,240 / 1,550 | These also compete with income houses and weapons. |
| Full modeled building package | Level-3 main structures 3,920; level 4 7,600; level 5 14,960 | All three quotes include two max-level houses; no crew or research. |
| Two Gunners + three Guards + one Lookout | 285 | Island-wide; more members do not multiply these caps or effects. Carpenter's historical catalogue price is 30 each, cap 2; new hiring is retired under recovery v1, with no replacement effect or compensation. |
| Cannon research tiers | 180 / 360 / 630 | All tiers 1,170; seven tier-1 tower selections add 1,050. A changed tier-2 decision charges another 360; a changed tier-3 decision another 630. |
| All four research branches | 4,420 | Before any per-structure skill/capstone choices; repair-only benefits remain gated. |
| One cannon tree, one full path + other tier 1 | 9,000 | [Tree tiers](../../../backend/content/tower_trees.json) open after records 20/35/45. Four cannon and three mortar packages alone cost 67,800, excluding base structures. |
| Repaired wreck | 500 | Repair funding opens after wave 6; ship games need record 30 as well. |
| Three paid level-5 cannon repairs in one reservation | 1,440 | The shared success quota is 3. One ordinary wave 21 with six house levels earns 295. Full wave-end healing and timed revival cost zero in the target. |

The main [combat fixture](../../../frontend/tests/pirates/balance-fixture.js) supplies strong late buildings directly. A fixture with top trees on every tower cannot be assumed funded at its unlock wave. Its combat results can help choose a future experiment, but a balance acceptance run must debit the actual purchase history first.

The existing Engineer reduction rounds each eligible build/level increment at 10% off. A fully discounted level-5 cannon costs 837; ordinary price is 930. This is a sensitivity for an already eligible Engineer, not a free role-toggle assumption: discounted purchases bind the buyer to the next qualifying personally played Engineer wave. The timelines use no discount. Research, tower trees/skills, weapons and paid repairs receive none. Demolishing that exact cannon returns `floor(actual eligible payments / 2)`: 465 normally or 418 after all increments were discounted. Missing payment history cannot be invented, and repair/research/tree costs are not refundable building basis.

The optional `defenses_v2` culverin costs 80/160/320/640/1,280 (2,480 total). With `more_tower_spots`, four additional tower spots open after records 10/20/30/40; filling all four with level-5 cannons adds 3,720 before their research/trees. These flags are excluded from the purchase queues and are not asserted enabled in a live environment.

## Solo and 2/4/10 Captains

For all four party sizes, the no-house gross resource totals are the same: **625 through wave 5; 4,000 through 20; 21,788 through 50; 75,228 through 100**, including one start grant. These are resources before any expense.

| Active Captains | Start grant | One wave-5 victory, no houses | Optional pistols for everyone | Optional long rifles for everyone |
|---:|---:|---:|---:|---:|
| 1 | 200 | 225 | 60 | 200 |
| 2 | 200 | 225 | 120 | 400 |
| 4 | 200 | 225 | 240 | 800 |
| 10 | 200 | 225 | 600 | 2,000 |

Everyone has the free musket. These bills mean simultaneous physical copies; a stored copy can later be reused. A capacity/holder lock does not create a second copy. Under the previous personal-payment model, N fresh 200-coin wallets and N finishers could collectively supply N times the grant and loot. Existing wallet histories and personal crew costs make that a comparison scenario, not a conversion rule. Removing the old 300-coin per-Captain level-up bill partly changes spending, but does not justify multiplying new treasury income.

The current [fleet helpers](../../../frontend/src/pirates/sim-fleet.js) `fleetOf` and `curveFor` and the [initial fleet setup](../../../frontend/src/pirates/sim-setup.js) take wave/weather/rule inputs, with no party-count multiplier. Changing Captain count changes firepower, coverage and cooperative actions. The new accepted-bell protocol must freeze whichever scaling is selected; this source review is not a newly implemented difficulty policy. Basic musket statistics illustrate why veteran mix matters: level 1 is 6 damage / 1.2-second reload, level 5 is 24 / 0.6. Those nominal 5 versus 40 damage/second figures omit travel, range, overkill, targeting, movement and falling. They are not battle DPS or a win-rate estimate. Do not price a ten-Captain island as ten solo islands or infer that ten Captains make a weak paid layout survive.

## Ship rewards, repeat waves and unrestricted wagering

The selected ship policy pays only positive star improvements per island/game/new record, with the existing [boat formula](../../../backend/content/boat.json) as cap. At record 30, one star pays 12; improvement to three pays another 24; duplicate/lower/zero scores pay zero. The second game has its own 36 cap, for **72 total**, independent of claimant count. Both-game caps at records 40/50/75/100 are **84/96/126/156**. Perfect scores for both games at every newly reached record 30–100 total **7,926**, conditional on wreck completion, playing every record and achieving those scores. The sum assumes both games are played at each record; it assigns no payout merely for passing an unplayed game window. Repeated low waves do not create new record budgets. The offline delta check does not verify the integrated reward implementation or actual achievable scores.

Fresh repeated won attempts can earn ordinary loot without a new personal milestone or new ship-record budget. Under the current restart rule, losing wave 6 at record 5 leads to wave 3, then wins of 3/4/5 return to wave 6. With six already purchased house levels, that four-attempt cycle pays **645**, assuming zero repairs and three wins. Losing wave 2 and winning wave 1 pays 35 without houses, or 55 with the two level-1 houses legally available at record 1. Losing wave 11 at record 10 and winning 8/9/10 with six house levels pays 895. These are reproducible fallback-route sensitivities, not an arbitrary low-wave selector, observed farming rate or recommendation for a new cap. Canonical lifecycle integration must preserve the selected restart behavior and outcome authority.

All invited members may wager any positive whole-coin amount fitting currently available funds, including the full treasury. Fees and escrow must fit that same amount. These scenarios introduce no betting allowance, reserve, percentage restriction, stake ceiling, daily/count limit or reinvestment limit. Outcomes remain uncertain:

- Losing the full available cash leaves zero available; demolition or commitment to open wagers can make the defense situation worse. An ordinary free attempt, an existing legitimate payout or an unspent ship-record improvement may help. If none supports recovery, the chosen extra help is owner reset; an absent owner intentionally means waiting. Arithmetic does not prove a zero-defense Captain crew can win.
- In the defense-first queue, wave 1 starts with 20 cash after the 180 build. Later research/weapon spending or escrow can consume a combat repair opportunity. Measure this interaction; do not insert a hidden repair reserve.
- A reset retires the old treasury and gives the new epoch one 200 grant. Harbor eligibility currently requires record 4, so a reset-grant wagering experiment must actually traverse those waves. With just the initial 180 build and no further purchases/bonuses, four assumed wins earn 200, leaving 220 cash. A **conditional, fee-free 2× total-return example** yields 440 on a win or 0 on a loss. It is a payoff sensitivity, not a supported-product claim or expected return. The owner could reset after losses and replay for another grant; the repeated victories and elapsed time are real work to measure. Old-epoch settlements cannot fund the replacement run, and resetting after a win leaves that balance in the retired account too. Do not add a reset cost or wagering cap to this assessment.

## Measurements still required

The arithmetic does not select a new starting grant, price or player-count multiplier. Carpenter and repair-only offers are retired under recovery v1 without replacement effects. Obtain the following integrated evidence before tuning or claiming balance acceptance:

| Experiment | Required record |
|---|---|
| Solo/2/4/10, novice/mixed/veteran profiles, early/mid/late campaign | Exact build order, catalogue/rules/epoch, seeds/weather, frozen roster/skills/copies, attempts, outcomes, heart/structure HP, completion times and treasury ledger. |
| Both funded priorities and player-chosen alternatives | Actual purchase timing, blocked offers, house payback, boss/finisher/galleon success; no free fixture buildings or unearned skills. |
| Defeat, low-wave farming, zero cash/defenses and owner absence | Canonical fallback, distinct attempts/hour, free wave-end healing, ship/pending-payout availability, and the intentional wait-for-owner result when ordinary income cannot help. |
| Paid repairs versus crew/research/weapons | Successful shared quota uses and exact debits, lost opportunities due to escrow, deaths/revives and resulting survival. |
| Research reversals and demolition | Actual repeated choice cost, exact eligible payment basis, one rounded refund, treasury destination and loss of useful assets. |
| Full-treasury losses/wins/reinvestment and reset-grant loops | Supported product, opening fees, reserved funds, verified gross returned payout, old-epoch isolation, record/elapsed effort per cycle; no imposed stake/count limits. |
| Ship score improvements and record pacing | Actual scores/time, first and improved deltas, two-game caps, no multiplication from extra players/retries/repeated records. |

Technical exactly-once ledger checks, race tests and replay protection remain independent prerequisites; they do not establish fun or fair difficulty. Human review and integrated multi-client play remain pending.

## Verification

The new arithmetic tests first failed to collect because the assessment module did not exist. During input verification, an incorrect test expectation counted the starting grant twice; manual addition of wave 1–5 rewards (35+45+55+65+225=425) corrected that expectation. The output consistently separates earned loot from total resources.

The [spec records the exact final checks](../../../specs/MP-ECO-19-balance-assessment.md#verification-and-remaining-evidence): **109 Python checks passed** (27 new), full Ruff passed, regeneration was byte-identical, and 19 relative documentation links/anchors resolved. Full backend, browser and PostgreSQL suites were not rerun for this offline assessment. No live migration, external service, game route, balance value or activation was changed.

Verification after integrating `main` through `a195ec35` passed **111 focused Python checks in 1.57s**, full backend Ruff and byte-identical regeneration. The recovery-v1 retirement labels and changed input hashes were refreshed; numerical results are unchanged.

The `f606412f` review added a regression that first failed because a custom queue could change a standing tower's kind through an upgrade. The corrected model refuses that transition; the declared queues and every numerical result are unchanged. **112 focused checks passed in 1.31s**, full backend Ruff passed, regenerated evidence is byte-identical, and **16 relative documentation links/anchors** resolve. The source inventory now includes the split configuration/fleet/setup files. Independent arithmetic checks cover nine cumulative-income checkpoints, all 200 queue conservation rows and the 7,926-coin conditional ship total.
