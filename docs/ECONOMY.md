# Economy balance and abuse testing (G12)

Offline evidence and recommendations for Nils. Used by economy/server reviewers.
Branch: `test/g12-economy-abuse`; base inspected: `origin/main` at `c26f303`.
No production database, `.env`, credentials or live market APIs are used.

## Scope and sources

The inspected main implements **spot shares**, not the approved replacement with
real prices and 10× long/short positions. Islet building, daily income, prediction
and duel handlers, and G10's case routes have not landed. Their absence is a
coverage dependency, not a passing security check. No tuning values were changed.

Sources of truth are `backend/server/wallet.py`, `server/market/` and the five
existing SQL migrations, `backend/content/entry_kits.json`, the **numeric** reward
and cost fields of case content, and `docs/story/OPEN-WORLD.md` sections 5–9 and
15.2. The 10× replacement is recorded in `ROADMAP.md`'s L4 note. This report
contains no solution, private case text or character identifiers.

## Coin sources and sinks

All amounts are whole play-money coins. NPC partners have no wallet.

| Source/sink | Amount and limit | State / ledger reason |
|---|---|---|
| New wallet | 0; signup is not an extra grant | Implemented |
| Entry kit | 1,000 for three kits; Stranger 1,600; once per player, fixed `kit` ref | Implemented `kit_grant` |
| Share purchase | Gross 1–500 per buy; gross purchases ≤2,000 per market day; whole units | Implemented `market_buy` |
| Share sale | Gross = floor(units × price); no per-sale gross cap; requires units held ≥10 minutes since latest buy | Implemented `market_sell` |
| Exchange fee | 2% of gross each side, rounded up; buy gross rounds up, sell gross down | Implemented `market_fee` |
| Administrative adjustment | Signed amount; no public route; Python limit ±1,000,000 | Implemented privileged `admin_adjust` |
| First clue finds | 8 ×50, capped 400 per player; once per card | Content only `clue_reward` |
| Deduction contributions | 4 ×200, capped 800 per player; once per deduction | Content only `mystery_reward` |
| Solve share | 400 +100/contributing deduction +100/finale role; capped 800/player once | Content only `mystery_reward` |
| Total case income | 450 minimum documented contribution to 2,000 maximum once; not daily | Content/design only |
| Case shortcuts | Four alternatives cost 150, 200, 200, 250; paid errands charged to ordering player | Content only `clue_purchase` |
| Islet | Free cabin; four paid lines, incremental levels 300/900/2,000; all lines total 12,800 | Planned `building_purchase` |
| Finale light | 300 and 10 timber; one per crew; station level 1, **included** in four-line cost | Content/design only `building_purchase` |
| Building resources | Level 1: 10 timber; level 2: 20 timber +5 rope; level 3: 10 brass +5 glass | Planned non-coin gates |
| Salvage sales | ≤150/day | Planned `cargo_sale` |
| Harbor orders | ≤3/day, 40–60 each, ≤150/day | Planned `event_reward` |
| Weekly co-op | 300 per qualifying giver, after target reached; not a daily grant | Planned `event_reward` |
| Pier sweep | Top up to 100 once/day, not +100 on every retry | Planned `event_reward` |
| Predictions | ≤50/question, ≤200/day; winners share staked pool less 5%, round down | Planned `prediction_stake` / `prediction_payout` |
| Prediction refunds | Full stake for one-sided, no-winner or void pool; never refund and pay | Planned |
| Duels | 100/player; ≤3 staked/day/same opponent; winner gets 190 of 200; draw/timeout refunds | Planned arena reasons |
| Sports pools | Same pool conservation requirement; exact sport caps not implemented | Later sports reasons |
| 10× positions | Long/short; isolated stake closes at zero; no spot floor/ceiling/breaker | Approved replacement, absent code |
| Requested position limits | ≤500/stake, ≤2,000 new stakes/day, ≤20 open positions | G12 target contract, **not enforced by current spot code** |
| Decor | 100–5,000, cosmetic | Planned `building_purchase` |
| Boat gear | Sloop 1,500; fog lantern 400 | Later `building_purchase` |
| Fast travel | Free now; old 25/10 proposal is not enabled | No current sink |
| Storm raids | ≤100/raid, ≤1/day | Later `event_reward` |
| Beacon upkeep, auctions, donations | Amounts not specified | Later, not simulated |

The eleven current wallet reasons are exactly `kit_grant`, `clue_reward`,
`mystery_reward`, `event_reward`, `cargo_sale`, `clue_purchase`, `building_purchase`,
`admin_adjust`, `market_buy`, `market_sell`, `market_fee`. A reserved reason does
not imply a public route or a working income source.

Current spot prices amplify real moves 20–100× (default 100), stay between 25%
and 400% of start price, and halt at ±30% for 15 minutes. This amplification is
**not** 10× collateral leverage. Trade throttling is 10 attempts/30 seconds/player
per process. Crew guessing allows 10 wrong guesses/600 seconds/player in SQL.
Wallet refs are nonblank, ≤120 characters, unique per player/reason/ref.

## Reproduce the simulations

From `backend/`, run:

```bash
uv run --frozen python -m tools.economy.simulate > /tmp/g12-economy.json
cmp tools/economy/baseline.json /tmp/g12-economy.json
```

`baseline.json` is the inspectable output: 1,000 players, 14 days, seed 12.
There are 334 casual, 333 case-focused and 333 trader players. Kit types are
sampled uniformly; that distribution is an assumption, not measured player data.
Every simulated player completes the intro before day 1.

The main model imports the real fee, rounding, hold, daily-cap, price evaluation
and replay functions. One shared minute-by-minute board preserves bases, halts,
daily rebases and persistent holdings. Casual players attempt one round trip on
half of days, traders four/day; case-focused players do not trade. Purchases
choose random times/companies without foresight; sales are attempted 60 minutes
later and may fail during a halt. Each strategy is a reproducible workload, not
an estimate of human skill. Wallet cash and end-day marked net worth are reported
separately; marks deduct the exit fee but do not imply that halted shares can be sold.

**Data limitation:** the public file is only 90 minutes ×7 instruments from Binance
Vision, CC BY-NC-SA 4.0. The application repeats it forward/backward, a 178-minute
cycle; the model does the same. Fourteen simulated days are **not fourteen days of
independent observed markets**. A longer historical series is needed before live
tuning. Replay SHA-256: `c0ff74db53e13250436d3d3bfbd491594be0c56ee02dcf93b45f2eef6ad1fa0d`.

### Daily results

The table below is generated from the saved baseline. Each cell is median / p90
wallet coins at the end of that day; p90 uses the nearest-rank convention.

| Day | Main casual | Main case-focused | Main trader | Planned casual | Planned case-focused | Planned trader |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 1000 / 1600 | 1000 / 1600 | 904 / 1521 | 1068 / 1577 | 1068 / 1577 | 1365 / 1884 |
| 2 | 1000 / 1600 | 1000 / 1600 | 850 / 1548 | 1061 / 1643 | 532 / 1005 | 1654 / 2232 |
| 3 | 1000 / 1600 | 1000 / 1600 | 835 / 1535 | 511 / 1103 | 1116 / 1680 | 1988 / 2474 |
| 4 | 1000 / 1600 | 1000 / 1600 | 826 / 1533 | 485.5 / 1087 | 1326 / 1779 | 2262 / 2837 |
| 5 | 1000 / 1600 | 1000 / 1600 | 769 / 1521 | 671.5 / 1420 | 588 / 1412 | 2498 / 3168 |
| 6 | 1002 / 1581 | 1000 / 1600 | 723 / 1506 | 732 / 1391 | 56 / 743 | 2802 / 3445 |
| 7 | 1000.5 / 1573 | 1000 / 1600 | 639 / 1456 | 1138 / 1719 | 858 / 1155 | 3391 / 4110 |
| 8 | 987 / 1568 | 1000 / 1600 | 606 / 1378 | 1099 / 1775 | 439 / 975 | 3620 / 4405 |
| 9 | 978.5 / 1559 | 1000 / 1600 | 508 / 1321 | 1189.5 / 1837 | 660 / 1182 | 3887 / 4688 |
| 10 | 972.5 / 1554 | 1000 / 1600 | 441 / 1344 | 1172 / 1838 | 886 / 1478 | 4186 / 4995 |
| 11 | 974 / 1539 | 1000 / 1600 | 456 / 1268 | 1123.5 / 1818 | 1094 / 1653 | 4503 / 5309 |
| 12 | 973.5 / 1509 | 1000 / 1600 | 337 / 1231 | 1095 / 1844 | 1208 / 1815 | 4759 / 5616 |
| 13 | 967 / 1530 | 1000 / 1600 | 308 / 1191 | 656 / 1865 | 1239 / 1840 | 5048 / 5902 |
| 14 | 965.5 / 1535 | 1000 / 1600 | 250 / 1215 | 622 / 1912 | 538 / 1806 | 5590 / 6442 |

### Separate future-feature scenario

`planned.py` also runs 1,000 players over 14 days, explicitly as a counterfactual.
It exercises kit/case grants, salvage/orders/weekly co-op, top-ups, islet coin
costs, four prediction pools and three duels daily, and 10× collateral trades.
Activity schedules, building priorities, fair random bets and completion dates
are assumptions exposed in JSON. Timber constraints, real betting skill, future
server implementation and unspecified later systems are not simulated. The
station payment counts toward its building line, never twice. Pools/duels
redistribute existing coins and destroy their cut/rounding remainder; the model
checks the aggregate wallet/flow identity after every day.

Ten-times leverage uses real recorded ticks and checks every intermediate tick
for liquidation. Four nonoverlapping chronological slots/day each stake ≤500,
total ≤2,000/day, with at most one open position. This does **not** test the absent
20-position engine. Leveraged fees are excluded because their basis is undecided.

With 500 collateral, observed 10-minute long/short terminal payouts range **453–546
before fees**. The entire recorded sample spans at most **1.7295%** real movement;
it cannot demonstrate a 10% liquidation. The separately labelled stress has a
10% adverse move destroy the 500 stake, and a 10% favorable move return 1,000.
A 1,000 wallet can lose everything in two fully losing 500 positions; perfect
winning 500 positions can add 2,000/day at the requested daily stake cap, before
fees, without compounding beyond that cap. These are stresses, not forecasts or
measured time-to-ruin probabilities. A 2% fee each side costs **20** if charged on
500 collateral, versus **200** on 5,000 notional: a 4% versus 40% flat-trip loss.

### Loops and tuning recommendations (Nils decides)

- The arithmetic probe checks 90,005 valid spot round trips at unchanged prices;
  all lose at least 2 coins. Kit/ref retries do not create a recurring faucet.
- A feasible foresight attacker using public demo prices grows 1,000 to **15,207**
  in 14 repeated days (2,051 after day 1), with ≤4 nonoverlapping ten-minute
  round trips/day, gross ≤500 each and both fees paid. This is a demonstrated
  predictable-data advantage, not a live-feed exploit. Keep demo balances out of
  meaningful rankings; do not share their database with competitive play.
- On the actual-main random workload, trading destroys substantial fees and
  frequent traders finish poorer than inactive players. That alone does not
  establish fairness of the pending leveraged replacement.
- Keep the case's required 300-coin light affordable; test recovery after the
  synthetic ruin when the case income/build handlers land. Do not quietly add a
  reserve or change kit/reward numbers from this report.
- Settle the leveraged fee basis before tuning; avoid inheriting a spot fee on
  10× notional accidentally. Repeat on at least 7–28 days of permitted history,
  including gaps and strong trends, with 500/2,000/20 enforced atomically in SQL.
- Future top-ups plus transferable duel/pool winnings need account-farming tests.
  The design model grants a top-up only to 100, and pools never create coins;
  that does not prove a future production implementation has those guards.

## What we tested

HTTP tests use the real FastAPI app and explicit fake transports. They test
signed-out and forged/wrong-part tokens on every implemented personal intent,
oversized token early refusal, wrong types, huge/negative units, client-supplied
player/price/fee/coin fields, save bounds, kit log forgery, rate reset, and
retries after cache expiry. Baseline tests additionally exercise own-player
filters in crew/portfolio routes. Saves intentionally use version CAS, kits a
fixed reference and crews natural/version identity; they do not all accept an
`actionUid`. Inventing that field would only test a different API.

Scratch SQL tests apply all real migrations to a fresh `pgserver` database over
Unix sockets. Each race uses independent connections and a start barrier, with
lock/statement timeouts and surfaced worker exceptions. They test repeated and
concurrent wallet mutations, overdraft races, kit/name/save/crew retries, two
friends taking one seat, trade buy/sale replays, two closes with different refs,
500 and 2,000 caps, holding time, wrong gross/fee/unknown company, crew guessing,
and authenticated/anon permissions. RLS covers wallets, saves, positions, trades,
ledger, names, entry profiles, crews and seats. After **every scratch test**, all
wallets must be nonnegative and equal the sum of their own ledger deltas.
Changing fixture timestamps simulates old requests without sleeping; fake auth
clocks advance beyond the 60-second cache. No live SQL endpoint is accepted.

```bash
# From backend; normal suite explicitly skips scratch cases without test extras:
uv run --frozen pytest -q
uv run --frozen ruff check .
# This is the required SQL gate, with extras only in uv's cache:
uv run --frozen --with pgserver --with 'psycopg[binary]' pytest -q server/tests/abuse/test_scratch_postgres.py
# Full suite including SQL:
uv run --frozen --with pgserver --with 'psycopg[binary]' pytest -q
```

In this cloud's command sandbox, TestClient sockets stall; run these checks with
the supported execution escalation. Application HTTP tests still have the parent
`conftest.py` network prohibition; scratch SQL uses local libpq Unix sockets.

## What we found

| Severity | Finding and evidence | Fix / disposition |
|---|---|---|
| Medium | Escaped lone Unicode surrogates in save keys/values raised 500; `test_save_encoding.py` failed twice before correction | Fixed in `744ca63`; UTF-8 encoding now shares the existing validation exception handler |
| Low | 4,097-character bearer tokens reached upstream verification; `test_token_bounds.py` failed before correction | Fixed in `e6eb324`; reject above 4,096 before hashing/upstream requests |
| Low | NUL save strings/keys passed Python but scratch PostgreSQL rejects them with `22P05`; two HTTP regressions failed before correction | Fixed in `80adb44`; reject nested NUL with 422 before database calls, while preserving literal backslash text |
| Low / contract decision | Privileged SQL accepts a 1,000,001 delta while Python refuses it; `test_privileged_sql_delta_cap_differs_from_python_policy` documents both | Not a demonstrated player exploit. Reconcile wallet policy with uncapped market sales before adding a SQL guard |
| High if used competitively | Public demo replay permits foresight profits, quantified above | Already intentionally documented demo behavior; isolate demo rankings/balances |
| Informational | Personal portfolio/trade responses omit explicit `private, no-store` while other personal routes set it | Recommend consistent cache headers; no cross-player cached disclosure demonstrated |
| Dependency | 10× engine, islet, pools, duels and G10 case intents absent from inspected main | Cannot claim those attack tests passed; rerun when their branches land |

No duplicate payout or wallet/ledger mismatch was found in the exercised current
SQL paths. This is bounded evidence, not a proof that every economy exploit is
impossible. Multi-instance throttling, real auth-provider behavior and production
database policies were not tested. The scratch auth schema models only roles,
users and `auth.uid()` needed by the migrations.

## Gates, checkpoint notes and Claude handover

Completed on 6 Nov 2026. `origin/main` was fetched and merged before each
checkpoint; it remained at `c26f303`. The normal gate's 23 skips are precisely
the scratch tests without extras; all 23 then executed and passed separately.
The 134 new cases comprise 111 HTTP/model checks and 23 scratch SQL checks.
No failure, expected failure or unexecuted future handler is counted as passed.

Paste-ready checkpoint notes (under 30 lines):

```text
G12 — Nils — branch test/g12-economy-abuse; only this branch is pushed; no PR/merge.
CP1 6f6c11b: economy inventory, 1000 players ×14 days, baseline + assumptions.
CP2 b14ad55: HTTP abuse tests and real scratch SQL replay/race/RLS/invariant tests.
CP3: final report and gate evidence (this commit).
Fix 744ca63: surrogate save input 500 ->422; two failures reproduced first.
Fix e6eb324: >4096 token rejected locally; upstream-call regression failed first.
Fix 80adb44: NUL save input rejected before jsonb; two failures reproduced first.
uv run --frozen pytest -q: 3211 passed, 23 skipped (scratch extras absent).
uv run --frozen ruff check .: All checks passed.
uv run --frozen --with pgserver --with 'psycopg[binary]' pytest -q server/tests/abuse/test_scratch_postgres.py: 23 passed.
Simulation rerun + cmp baseline.json: identical.
Day14 main median cash: casual965.5, inactive case1000, trader250; marks972.5/1000/257.
Demo foresight:1000 ->15207; 90005 flat spot round trips never mint coins.
10x stress: adverse10% destroys stake; recorded ten-minute500 payouts453–546, no fees.
Medium fixed: malformed Unicode save500. Low fixed: token bound and NUL validation.
Low decision: privileged SQL delta cap differs from Python; not a player exploit.
High only if competitive: predictable demo prices. Info: private market cache headers.
No duplicate payouts or wallet/ledger mismatches in exercised SQL attacks.
Claude: queue 10x/islet/pool/duel/G10 tests when handlers land; settle leverage fee basis.
Claude: reconcile SQL delta/sale policy; consider private,no-store market responses.
No migration created/applied; no MD5. No live DB, .env, secrets or case solution printed.
Not verified: future handlers, 20-position cap, multi-instance limits, live providers.
```

The reserved `20261106150000_economy_guards.sql` filename has not been used.
