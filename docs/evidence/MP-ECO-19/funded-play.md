# Funded production-combat measurements

Used by the MP-ECO-19 balance review. These measurements replace assumed victories
with outcomes from the production simulator and keep evidence layers explicit.

No capital, price, loot, multiplayer scaling or ship-reward value changed. The
measurements support comparing funded strategies; scripted control does not establish
human win rates, enjoyment or full authenticated multiplayer acceptance.

## Method

Each fresh campaign receives exactly the catalogue's 200-coin grant. Purchases
wait for both the current island record and available earned money. Only a
simulated victory earns the production frozen played-wave reward, including only
bonuses the simulation actually produced. Losses earn zero and use the production
restart/rescue rule. Houses contribute only after their paid construction. No
ship income, private money, free towers, starting veteran levels or unearned
skills are inserted.

The runner uses the actual runtime catalogue, server static-wave preparation,
always-on rules, protocol 2/recovery 1 and deterministic production combat.
Every wave records seed/weather, paid build order, blocked offer, frozen personal
profiles, outcome, elapsed simulation time, heart/structure/Captain HP, bonuses
and conserved balance. Structures start whole at each ordinary terminal boundary,
matching the selected free wave-end recovery rule. There is no free in-wave
repair or revived Captain injected by the script.

Three **scripted control policies** react as novice, mixed or veteran controllers.
These names describe programmed reaction and finisher behavior, not measured
human populations. Every initial Captain still starts at level 1 with zero points.
Novice attack decisions run once per second at fixed heart posts; veteran
decisions run every 250 ms and may approach/kite a target. Finisher samples use
the same production task functions with an 800 ms novice or 100 ms veteran lag.
Those chosen controller assumptions are visible inputs, not measured human skill.
Levels and legally selected skills follow that Captain's own measured wins. A
separate restart cohort first earns its veteran progress through a complete funded
campaign, then receives a fresh run grant and no carried island cash or buildings.
Mixed restart cohorts retain alternate veterans and introduce genuinely new
zero-progress Captains. One solo Captain cannot form a mixed personal cohort.

Movement uses production `moveWithCollisions`/`canStand`, the actual home-islet
land mask, scenery/cabin collision data and conservative funded-building
footprints. Broken buildings remain blockers in this experiment. No Captain
walks through water or a wall to attack a ship. The initial unrestricted-position
diagnostic is superseded by these measurements; its figures are not accepted
balance evidence. Water/wall/speed regressions cover the correction.

The priorities are the existing strict defense-first and income-first queues,
plus an explicit alternative that skips currently locked/unaffordable priorities
while preserving every purchase price, unlock, kind and successive asset level.
This alternative changes the experiment's decisions, not the product rules.

## Evidence layers and timing

- **Headless production simulation:** fixed seeds and supplied catalogue weather;
  catalogue-funded arithmetic ledger, without database receipts or authentication.
- **Disposable SQL composition:** the real migration chain, persistent authority,
  coherent quote/CAS, construction, accepted bell, earned personal choices and
  native finish RPCs. Local Auth/Realtime schema stand-ins are explicit setup;
  no authority-provider fixture is installed. Combat reports come from the
  headless production simulation. This does not validate a rendered journal,
  damage checkpoint or provider login.
- **Wager choices:** actual product transactions and actual five-minute deadlines,
  with explicitly supplied price fixtures. No stored clock, immutable wager row
  or settlement function is rewritten. A supplied price is not a natural feed
  observation or a probability estimate.
- **Rendered provider:** the existing source-qualified observations in the common
  acceptance document retain their original source. One new local attempt completed
  shared-island entry after admission but its first pointer purchase click did not
  complete. A final retry using normal programmatic button activation failed
  earlier during game entry. Neither attempt supplies a passed funded-wave result.
  The optional rendered scenario helper is syntax-checked only; its full success
  path remains unverified and does not prove pointer hit testing.

Headless SQL explicitly uses **zero countdown and zero minimum-finish wait**.
Simulation seconds are not observed multiplayer wall-clock pacing. The headless
report also calculates a separate protocol floor. The original raw reports used
the catalogue countdown of 5 seconds; the shared session actually defaults to
**10 seconds**, overrides the supplied catalogue countdown, and permits members
to select another countdown. The corrected default projection below uses
10-second countdown, 10-second minimum and 8-second won-only break. That calculation excludes
buying, reading, thinking, player availability, network delay and rendering.
It is a projection, not an observed session duration.

## Reproduce

Measured tools: Node 24.22.1, Python 3.12.14, pgserver 0.1.4 and
psycopg/psycopg-binary 3.3.9. Use Node 24+ and the locked frontend installation
(`npm ci` in `frontend/`). From
`backend/`, with the normal locked Python dependencies:

```sh
uv run --no-sync python -m tools.economy.funded_play \
  --seeds 7919,15401 --attempts 60 --target 40 --profile-restarts > /tmp/funded-calm.json
uv run --no-sync python -m tools.economy.funded_play \
  --captains 1,4,10 --policies novice,veteran --priorities defense,adaptive \
  --seeds 7919,15401 --attempts 60 --target 40 --weather storm > /tmp/funded-storm.json
uv run --no-sync --with pgserver --with 'psycopg[binary]' \
  python -m tools.economy.funded_sql --captains 2 --policy mixed \
  --attempts 45 --target 40 --choices > /tmp/funded-sql.json
```

The last command creates and removes its own Unix-socket PostgreSQL directory.
It reads no configured database URL or credentials. Its three wager deadlines
take approximately fifteen real minutes. Every native finish uses the simulation's
actual outcome; no desired victory is supplied by a fixture. Both loss and
successful repeated low-wave attempts remain visible.

The accompanying compressed JSON records complete measurements and hashes of
the actual simulator import closure, server/catalogue inputs, tool source,
migrations and both dependency locks. Decompress with `gzip -dc`. Fixed-seed
headless outcomes reproduce; real elapsed wager wait times can differ slightly.
Financial assertions fail the command rather than silently reporting an
unavailable path as successful. The historical SQL reports captured their
307-path source inventory before execution and asserted it unchanged afterward.
The historical headless reports captured hashes after execution only; no retained
pre-run receipt exists. Their hashes match the pinned measurement implementation
`a05346fb17bdbe787f01d4eba2fda3290ebe8f96`.

The [provenance and projection qualification](funded-provenance.json) preserves
those boundaries and the original raw reports. The inherited imported planner
`backend/tools/economy/island_balance_plans.py` was omitted from the 307-path
inventory; a supplemental post-run comparison confirms it byte-identical to
base `3bdd8eda16470795fdedd68c42fffab54e5f2ced` with SHA-256
`3ecbb16980b9349c41486b0d3e6f4ca3279f51b30fdf966e6bfa0eaeff8f8ee5`.
This is a qualified inherited input, not a retroactive source fence. A later
runner correction includes the planner, adds headless pre/post capture, and fixes
the default shared projection; its bounded smoke checks do not relabel the
historical campaigns as rerun. The old SQL timing metadata names catalogue5,
not the actual default shared 10 seconds; its explicitly selected experimental
countdown and minimum were both zero.
Canonical SQL generates its own opaque participant UUIDs. Those can affect the
scripted duel prompts, so repeating the SQL command reproduces its boundary and
conservation assertions rather than promising identical UUIDs, minigame details
or real wait times. The standalone headless matrix uses fixed participant names.

## Findings and limits

The final collision-constrained dataset contains **112 campaigns/cohorts and
4,200 played attempts** through the declared wave-40 target: 72 fresh calm runs,
16 earned-profile reset runs and 24 storm runs. All use seeds 7919 and 15401.
Every declared run stops at its target, attempt budget, or six consecutive
attempts without a new island record; no unreached stage is filled with an
invented result.

| Calm scripted control | Strict defense: reached 40 | Strict income: reached 40 | Adaptive: reached 40 |
|---|---:|---:|---:|
| Novice | 8/8 | 0/8 | 8/8 |
| Mixed | 8/8 | 7/8 | 8/8 |
| Veteran | 8/8 | 7/8 | 8/8 |

Each cell spans 1/2/4/10 Captains and both seeds. All 16 reset cohorts reached 40,
including retained veteran/new-Captain mixtures. In the separate storm selection,
22/24 reached 40; the two remaining solo novice cases reached 39 and 38 within
the stated budget. These counts describe the scripts and chosen seeds, not
population win rates.

For seed 7919, the veteran-control defense plan produced these observed simulation
durations. Its closing coins were 2,424 for every crew size; no member multiplied
the grant or loot:

| Captains | Observed simulation seconds | Calculated protocol floor seconds |
|---:|---:|---:|
| 1 | 1,093.15 | 1,805.15 |
| 2 | 1,034.55 | 1,746.55 |
| 4 | 968.15 | 1,680.15 |
| 10 | 938.55 | 1,650.55 |

The second column is headless combat time. The third is only the separately
defined countdown/minimum/break calculation, not observed multiplayer wall time.

The strict income queue can wait behind a locked house tier while affordable
defenses remain available. The alternative queue measures whether spending those
funds on currently unlocked defenses resolves that specific bottleneck. This
supports a strategy comparison, not an automatic price cut or extra income.

The actual disposable SQL solo novice/income case reached record 2, then played
the legal loss/fallback/repeated-win loop, finishing with 170 coins and 19
reconciled treasury entries. Its repeated low waves did not grant a higher
personal milestone. The ten-Captain SQL case reached wave 40 with 2,424 coins
and 147 treasury entries; each participant's personal wallet stayed unchanged.

Current unchanged values include capital 200; early loot base 25, 10 per played
wave and 10 per purchased house level; the existing late/boss multipliers; and
the catalogue's actual incremental building prices. A complete defense queue
costs 14,960. No additional daily, count, event or stake cap is introduced, and
the existing ship record/improvement formula is preserved. These measurements
provide no measured reason to alter those values automatically.

The SQL choices use an actually earned island record and payment history for
research reversals and demolition. Refunds round half the actual complete basis
once, with exact retries producing one effect. The same island then measures a
whole-budget loss, ordinary zero-cash/no-assets attempts, owner reset, retained
earned Captain progress, fresh Harbor unlocking, a whole-budget win/reinvestment
and a second reset before old-origin settlement. Old payouts cannot fund the
replacement run. The measured two-Captain campaign reached 40 with 2,424 coins,
1,062.35 simulation seconds and 147 treasury entries before those choices.

| Actual financial choice | Observed result |
|---|---|
| Tier 1, tier 2, and two tier-2 reversals | 1,260 coins charged; exact retries have one effect. |
| Demolish the complete paid layout | 14,960 actual paid basis; 7,480 returned once. |
| Stake the entire available treasury | 8,644 committed, then lost; zero payout. |
| Zero cash and no assets | Played 41/39/39; all lost, zero loot; ordinary rescue/fallback only. |
| Owner reset and replay | One fresh 200 grant; earned profiles preserved; four actual wins unlock Harbor. |
| Full-budget win then reinvestment | 110 returned 220; all 220 reinvested without an extra cap. |
| Reset while the reinvestment is open | Late 440 payout stays in the retired origin; replacement remains 200. |

The three actual wager waits were 300.21, 300.18 and 299.87 seconds. Every
observed origin reconciled balance, committed money and revision against its
ledger. Personal wallet balances, ledger counts and ledger sums remained
unchanged. These transaction checks do not establish wager profitability.

Data: [calm campaigns](funded-calm.json.gz), [storm campaigns](funded-storm.json.gz),
[actual solo farming](funded-sql-farming.json.gz),
[actual ten-Captain domain campaign](funded-sql-ten.json.gz), and
[actual financial choices](funded-sql.json.gz).

Remaining acceptance includes human novice/mixed/veteran play, paid repair versus
crew/research/weapon purchase opportunity costs, naturally unlocked/scored ship
rounds, natural market/match outcomes, the full authenticated scenario matrix and
physical devices. The supplied price wins/losses do not estimate wager returns
in the real world. No hosted migration, deployment, public conversion or
activation was performed or authorized by this measurement.

## Focused verification

The measured implementation at `a05346fb` completed the declared headless matrix
and three disposable-SQL campaigns, including all three real wager deadlines.
The corrected manifest/projection runner then passed the focused Python checks
(13 cases in 2.65 seconds), disposable PostgreSQL checks (2 cases in
6.57 seconds, applying all 107 migrations),
full backend Ruff, Node syntax checks and bounded four-wave headless/SQL smoke
runs. The [headless smoke](funded-smoke-v2.json.gz) and
[SQL smoke](funded-sql-smoke-v2.json.gz) both reached record 4 with 110 coins and
90.35 simulation seconds, using the corrected 308-input pre/post manifest.
The smoke runs validate the updated provenance and projection path; the
4,200-attempt campaign matrix and fifteen-minute wager run were not rerun after
that metadata correction. Source-matched raw reports retain their original hashes.

No full backend or frontend-build suite was repeated: production application,
catalogue, dependencies and migrations did not change. Fresh rendered acceptance
was attempted but did not pass; remaining provider/human/device criteria stay open.

Commands for the focused checks, from `backend/`:

```sh
uv run --no-sync pytest -q server/tests/test_funded_balance.py
CASE_PG_SCRATCH=1 uv run --no-sync --with pgserver --with 'psycopg[binary]' \
  pytest -q server/tests/island_sql/test_funded_balance_sql.py
uv run --no-sync ruff check .
```

Both new frontend scripts pass `node --check`; `git diff --check` and relative
documentation target checks pass. The rendered scenario helper did not complete
a fresh scenario, so syntax success is its only claimed execution check.
