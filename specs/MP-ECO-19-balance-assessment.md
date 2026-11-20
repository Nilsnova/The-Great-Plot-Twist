# MP-ECO-19 Shared island economy: numerical baseline

> **What this is:** a reproducible coin-flow assessment using the current catalogue and the agreed shared-island rules.
>
> **Who uses it:** the economy reviewer and the teammate preparing integrated multiplayer balance playtests.

- **Status:** numerical baseline and funded production-combat follow-up; human/runtime acceptance remains qualified
- **Branch:** `test/mp-eco-funded-balance` (follow-up to `docs/mp-eco-19-balance`)
- **Issue:** [#512](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/512), part of [#492](https://github.com/Nilsnova/The-Great-Plot-Twist/issues/492)

## Why

One treasury removes the previous per-finisher multiplication of wave money. Combat strength, shared defense costs and personal weapon-copy demand do not change in the same proportion. Existing combat fixtures do not prove that their buildings can be afforded from one island's income. This assessment records the arithmetic before proposing any price change.

## Scope and method

The offline tool reads the actual catalogue through the existing server loaders and money rules. It records source hashes, early/mid/late income for 1/2/4/10 Captains, house/boss contributions, cumulative purchase costs, affordable purchase timelines, ship-reward deltas, and recovery/farming/reset-wager sensitivities. Every timeline assumes its stated wins; it is not a combat result. Fixed house levels from wave 1 are explicitly unattainable revenue bounds, never purchase plans.

The selected ship rule pays only positive star improvements per island, game and newly reached island wave record, capped by the existing catalogue formula. Betting remains unrestricted except available funds including fees/escrow. Conditional wager examples do not estimate win probabilities or expected returns.

**Files:** `backend/tools/economy/island_balance*.py`, focused arithmetic tests, and the [report with deterministic JSON](../docs/evidence/MP-ECO-19/README.md).

**Dependencies:** the [agreed target](../docs/DECISIONS.md#shared-island-economy-2026-11-18) and current catalogue. Actual shared-mode gameplay needs MP-ECO-03–16/18/22 integration, canonical outcomes and measured play; none is substituted by this model.

## Out of scope

No catalogue, price, scaling, game route, migration or feature-activation changes. No invented Carpenter/Workshop effects, new recovery grants, gambling caps, betting budgets, personal-wallet transfers or estimates presented as play evidence. Captain upgrades/respec have no coin cost in the modeled target. Technical ledger safety remains separate from playable balance.

## Acceptance checks

- [x] `cd backend && uv run python -m tools.economy.island_balance` reproduces the committed JSON byte for byte.
- [x] Focused tests independently check boss/late-wave arithmetic, once-per-attempt income, purchase timing/unlocks/nonnegative funds, ship score improvements and restricted assumptions.
- [x] The report covers 1/2/4/10 Captains, catalogue costs, house timing, paid combat repair, repeat-wave and reset/wager loops, and clearly lists the remaining integrated measurements.
- [x] `cd backend && uv run ruff check .` and `git diff --check` pass; report links resolve.
- [ ] A different human teammate reviews the assessment before balance choices or release.

## Tests to write first

| Test | Evidence |
|---|---|
| Current reward checkpoints and boss/late transitions | Production rules are used, including wave 40's special multiplier. |
| Shared income is independent of Captain count | Join/acknowledgement count never multiplies the modeled grant or reward. |
| A purchase waits for both funds and unlock | Houses do not contribute before being bought and cannot fund their own purchase. |
| All plan balances remain nonnegative and conserve coins | An affordable timeline is distinct from a fixed-house upper bound. |
| Ship rewards pay positive improvements within each game's record | Duplicate/lower scores and extra claimants add no coins. |

## Contracts touched

None. This is an offline assessment, not a public API, database contract or balance decision. The JSON is evidence from the stated inputs; changed inputs require a new assessment.

## Verification and remaining evidence

Commands ran from `backend/` with the locked project dependencies and a writable UV cache:

- `uv run python -m tools.economy.island_balance | cmp - ../docs/evidence/MP-ECO-19/numerical-baseline.json`: passed, byte-identical output.
- `uv run pytest -q server/tests/test_island_balance_assessment.py server/tests/test_island_rules.py server/tests/test_boat_routes.py`: **109 passed in 1.46s**, including 27 new assessment cases.
- `uv run ruff check .`: **All checks passed**.
- `git diff --check`: passed; **19 relative documentation links/anchors** checked.

After integrating `main` through `a195ec35`, the same focused selection passed **111 checks in 1.57s**; full backend Ruff and byte-identical regeneration passed again. The refreshed report records the selected recovery-v1 retirement instead of an undecided Carpenter replacement. Catalogue and simulator source hashes were refreshed; all numerical evidence remains unchanged.

Review after integrating `f606412f` found that a custom plan could change a standing cannon into a level-2 mortar without demolition or a new level-1 purchase. The new regression failed before correction; plans now reject a kind change on an occupied spot. The same focused selection passed **112 checks in 1.31s**, including that regression, and full backend Ruff passed. Evidence regeneration is byte-identical after recording the split simulator configuration/fleet/setup inputs; all numerical rows remain unchanged. Nine cumulative-income checkpoints, both queues' 200 conservation rows and the 7,926-coin conditional ship total were checked independently. All **16 relative documentation links/anchors** resolve. This corrects the offline assessment, not a game transaction or price.

Current-main refresh through `1350c2ba` removes the obsolete flag adapter from the assessment and uses `runtime_catalogue`, matching the server after the always-on flag retirement. Culverin is included in the current building inventory; the unchanged extra-spot and culverin prices are listed as options outside the two illustrative original-seven-spot queues. No economic setting changes. A new custom-plan regression found that extra spots could be bought before their `Spot.unlock_wave`; four cases failed before correction, and quotes now preserve that existing catalogue requirement. Existing income, funded-queue, ship and wager numerical sections remain unchanged. Current verification passed **117 focused Python checks in 2.99s**, including five current-catalogue/extra-slot checks, plus full backend Ruff, byte-identical regeneration and **16 documentation links/anchors**. All 200 declared-queue conservation rows and the conditional 7,926-coin ship total were checked independently; existing numerical sections and prices are unchanged.

Tests first failed on the missing tool module. An early checkpoint expectation was corrected after manually verifying that waves 1–5 earn 425 and the separate 200 grant makes 625; the tool was not changed to double-count the grant. Both purchase queues conserve coins and purchase only current unlocked levels. No runtime rules or dependencies were changed, so the full backend, browser and PostgreSQL suites were not rerun for this offline assessment.

No integrated shared-mode play, browser interaction, live database or external wagering service was used. Canonical lifecycle/treasury/UI integration, actual combat outcomes and durations, mixed/veteran crews, supported wager returns and human review remain open. New Carpenter and repair-only offers are retired under recovery v1 without replacement effects or compensation. The [report's experiment matrix](../docs/evidence/MP-ECO-19/README.md#measurements-still-required) defines the next evidence; this numerical baseline does not complete gameplay acceptance or choose new balance values.

## Funded production-combat follow-up

The [funded measurement method](../docs/evidence/MP-ECO-19/funded-play.md) adds
actual production-simulator outcomes to the earlier assumed-victory arithmetic.
Fresh 1/2/4/10-Captain campaigns use two fixed seeds, three declared control
policies and defense/income/adaptive funded priorities. Separate reset cohorts
retain only progress earned by their preceding campaign, including genuinely
new Captains alongside retained veterans. No price or scaling value changes.

`tools.economy.funded_sql` composes a funded campaign with the real disposable
SQL authority, quotes, purchases, accepted bell, personal effects and native
finish transactions. `--choices` then measures research reversals, actual-cost
refunds, full-budget wager loss/win/reinvestment and owner resets on that earned
island. Wager deadlines elapse naturally; prices are explicit test inputs.
The SQL headless configuration has zero countdown/minimum wait and does not
establish rendered input/journal/checkpoint or real-provider authentication.

Meaningful runner checks reject assumed defeat income, unavailable house income,
unearned skills, cross-Captain milestone inheritance, skipped levels/kind changes,
member-multiplied loot and water/wall traversal. Disposable composition checks
verify actual first-wave receipts and reset-preserved earned progression.
Exact final commands/results, data and source boundaries are recorded in the
linked evidence. Earlier unrestricted-position diagnostics are superseded after
the movement correction and are not claimed as accepted balance results.

Human gameplay, remaining opportunity-cost/ship measurements and the full
authenticated matrix remain explicit; this increment does not assert complete
balance acceptance or authorize release.

## Owner and reviewer

- **Responsible teammate:** Ianno Hollensteiner (`Iannomh123456`)
- **Coding assistance:** Codex; the responsible teammate remains accountable for the result.
- **Reviewer:** pending a different human teammate
- **Last updated:** 2026-11-19
