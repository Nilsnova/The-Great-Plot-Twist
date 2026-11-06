# Economy balance and abuse testing (G12)

Offline evidence for Nils and economy/server reviewers. Integration branch:
`integrate/economy-abuse-v2`, starting from `478bc9d` on 6 November 2026.
No production database, credentials, live market APIs or GitHub Actions are used.

## Current scope and source contracts

G12 now targets **Exchange v2**, the implemented 10× rising/falling position engine.
The earlier spot-market simulation and `market_trade`/`market_set_base` tests were
replaced rather than kept behind a compatibility interface. Original contributions
remain as authored commits; follow-up commits adapt their tests and evidence.

Sources of truth are `server/market/positions.py`, `replay.py`, `store_calls.py`,
`routes/market.py`, `server/wallet.py`, `server/predictions/pools.py` and the actual
migration chain through `20261106110000_lantern_duels.sql`. The chain includes Case
Phase 2 at `080000`. Case economics are read numerically through `load_case()`;
this report and the generated JSON contain no solution or private case prose.

| Implemented rule | Current contract |
|---|---|
| Wallet and kit | Wallet starts at 0; kit pays 1,000 or 1,600 once per player |
| Position | 10× rising/falling; stake 10–500 coins; at most 20 open positions |
| Daily investment | At most 2,000 new stake coins per player, from 08:00 Lisbon |
| Opening fee | 2% of stake rounded up, paid on top; 1% after Relighting |
| Closing fee | Same stake-based rate, rounded up, capped by the position's value |
| Liquidation | Rising at/below 90% of entry; falling at/above 110%; value is 0 and cannot recover |
| Positive payout | Rounded down and capped at 1,000,000 coins by production position math |
| Price source | Actual underlying price; no old amplification, price floor, breaker or minimum hold |
| Price isolation | A live position cannot close on replay prices, or the reverse |
| Throttle | 10 open/close attempts in 30 seconds per player, in memory per instance |
| Prediction pool | 5% cut of losing stakes, rounded down; winners share every remaining coin by largest remainders |
| Prediction refund | Void, no-winner and one-sided pools refund rather than pay and refund |
| Case maximum | First pins 400 + deduction parts 800 + solve share 800 = 2,000 once per player |
| Required station | 300 coins and 10 timber; one crew player's station readies the crew's light |

There are 17 wallet reasons. Current Exchange writes use `market_stake`,
`market_payout` and `market_fee`. Historical `market_buy` and `market_sell` reasons
remain reserved but are not used by the position engine. A wallet reference is
nonblank, at most 120 characters, and unique per player/reason/ref.

The base already includes islet, prediction and duel implementations. G12's
specific HTTP matrix covers identity/name/save/kit/crew and Exchange open/close;
it does **not** relabel the other packages' tests as new G12 attack coverage.
Those features retain their own test suites. Sports/festival behavior is outside
this change. Feature availability in production is verified by the release owner.

## Reproduce the evidence

From `backend/`:

```bash
uv run --frozen python -m tools.economy.simulate > /tmp/g12-economy.json
cmp tools/economy/baseline.json /tmp/g12-economy.json
uv run --frozen pytest -q server/tests/abuse --ignore=server/tests/abuse/test_scratch_postgres.py server/tests/test_saves.py server/tests/test_auth.py
uv run --frozen --with pgserver --with 'psycopg[binary]' pytest -q server/tests/abuse
uv run --frozen ruff check .
```

`baseline.json` is inspectable output for 1,000 players, 14 days and seed 12.
Repeating the full command produces byte-identical output. There are 334 casual,
333 case-focused and 333 trader players. Kits are sampled uniformly; this is a
workload assumption, not measured human behavior.

The main model imports the real position value, liquidation and fee functions.
Casual players trade on approximately half their days, once on those days;
traders make four sequential visits per day; case-focused players do not trade
in this **market-only** scenario. Each visit chooses a random company, time and
side without foresight and closes after 60 minutes. Separate six-hour visit slots
keep at most one position open. Every recorded minute between opening and close
checks liquidation. A used-up stake never recovers on a later tick.

All positions close before day end, so the table reports wallet cash, not open
marked wealth. The accounting identity is checked on every run:
`final cash = initial cash - stakes + gross payouts - opening and closing fees`.
The workload excludes grants after the kit, case activity, building purchases,
predictions and duels; it does not claim that these implemented features are absent.

**Data limit:** the public recording contains only 90 minutes × seven island
instruments from Binance Vision, CC BY-NC-SA 4.0. The application repeats it forward
and backward in a 178-minute cycle. Fourteen simulated days are not fourteen days
of independent observed markets. Stocks and live outages are not modeled.
Replay SHA-256: `c0ff74db53e13250436d3d3bfbd491594be0c56ee02dcf93b45f2eef6ad1fa0d`.

### Current Exchange workload

Each cell is median / p90 wallet coins; p90 is nearest-rank.

| Day | Casual | Case-focused, no trades | Trader |
|---|---:|---:|---:|
| 1 | 1000 / 1600 | 1000 / 1600 | 941 / 1539 |
| 2 | 1000 / 1586 | 1000 / 1600 | 870 / 1456 |
| 3 | 988.5 / 1581 | 1000 / 1600 | 795 / 1370 |
| 4 | 983 / 1562 | 1000 / 1600 | 718 / 1289 |
| 5 | 976 / 1554 | 1000 / 1600 | 640 / 1209 |
| 6 | 965.5 / 1540 | 1000 / 1600 | 558 / 1141 |
| 7 | 956.5 / 1537 | 1000 / 1600 | 474 / 1059 |
| 8 | 949.5 / 1528 | 1000 / 1600 | 409 / 988 |
| 9 | 942 / 1515 | 1000 / 1600 | 350 / 920 |
| 10 | 932.5 / 1515 | 1000 / 1600 | 298 / 817 |
| 11 | 927 / 1507 | 1000 / 1600 | 245 / 733 |
| 12 | 916.5 / 1489 | 1000 / 1600 | 205 / 662 |
| 13 | 905.5 / 1483 | 1000 / 1600 | 165 / 580 |
| 14 | 888 / 1474 | 1000 / 1600 | 136 / 512 |

Initial wallet total is 1,153,000; final cash is 788,659. Stakes total 8,595,599,
gross payouts 8,582,730 and fees 351,472. There are 41,922 open/close operations.
This short recording contains no 10% liquidation in the workload; synthetic
adverse-price tests separately exercise both liquidation directions and jumps.

Across 5,892 flat-price round trips (every allowed stake, both directions, both
fee regimes and three price scales), the best result is a loss of 2 coins. On
recorded ten-minute windows, a 500 stake's gross value ranges from 453 to 546;
closing receipts range from 443 to 536 after the 10-coin closing fee. The opening
also costs 10. These observations are arithmetic checks, not a live profit forecast.

The public replay foresight probe makes four nonoverlapping ten-minute positions
per day, paying both fees and respecting the stake/day limits. Its wallet grows
from 1,000 to 2,512. The recording is intentionally public: its predictable returns
are unsuitable as evidence about live performance or competitive rankings.

### Wider economy counterfactual

`planned.py` keeps an explicitly assumed activity schedule separate from the
market-only model. It uses production Exchange fees and prediction settlement.
It also assumes full salvage/order allowances, a daily top-up, weekly co-op,
case rewards on fixed days, building levels and random duels. Several of those
income/resource/upgrade loops are proposals rather than implemented guarantees.
Timber/resource gates, human skill, draws/timeouts and later sports are not modeled.

At day 14, median / p90 cash is 616 / 1,715 casual, 576 / 1,743 case-focused and
4,588 / 5,616 trader. Every coin is recorded by a signed flow in the JSON; the
scenario checks that their sum equals final wallets. These figures test the
assumed schedule and are not a recommendation to ship all those income sources.
No tuning value or new recurring grant is enabled by G12.

## Abuse coverage and fixes

HTTP tests exercise the real FastAPI validators and auth boundary through explicit
fake transports. They attack signed-out/forged credentials, oversized tokens,
wrong types and oversized stakes, forged player/price/fee/coin fields, hidden
foreign positions, delayed action replays, save bounds, forged kit logs and the
shared opening/closing throttle. The tests use actual open/close requests and
check actual `exchange_open_position`/`exchange_close_position` arguments.

Scratch tests create a disposable PostgreSQL server reachable only over its Unix
socket and apply every repository migration in timestamp order. No configured
production URI is accepted. Independent connections and a start barrier exercise
wallet overdrafts/replays, kit/name/save/crew races, stake and 20-position caps,
opening-fee rollback, concurrent closes, sweep-versus-close races, old/wrong-mode
quotes and forged SQL arithmetic. Role checks cover anonymous/authenticated access
to personal rows and denial of privileged functions. After every test, each wallet
must be nonnegative and equal the sum of its own ledger deltas.

| Finding | Disposition |
|---|---|
| Lone Unicode surrogate in a save key/value could raise 500 | Original `744ca63` retained; encoding now shares the validation handler; regressions return 422 |
| Bearer token longer than 4,096 characters reached upstream auth | Original `e6eb324` retained; rejected locally before verification |
| NUL in a nested save key/value cannot be stored as PostgreSQL jsonb | Original `80adb44` retained; rejected with 422 before a database call; literal backslash text still works |
| Privileged wallet SQL permits a delta above Python's 1,000,000 policy | Existing bounded test documents the difference; no demonstrated player exploit, no new SQL guard invented |
| Demo replay has knowable future prices | Explicit offline evidence above; live prices never fall back to replay |

The original three security fixes were cherry-picked with Nils' authorship. Their
scope remains small: `auth.py`, `account/saves.py` and focused regression tests.
No applied migration was edited. G12 requires no new migration, so reserved
`20261106150000_economy_guards.sql` remains unused.

## Verification and remaining limits

- HTTP/security slice: 130 passed; model slice: 20 passed.
- Imported fixes plus the existing save/auth suites: combined non-SQL run 272 passed.
- Scratch SQL slice: 41 passed against the current full migration chain.
- Combined HTTP/security/model/scratch G12 gate: 191 passed.
- Ruff: all backend checks passed. Baseline generation repeated byte-identically.

These are local checks, not production-readiness certification. No live SQL writes,
deployments or production-policy verification were performed. Multi-instance
throttling, actual auth-provider behavior, long independent price histories and
new attacks spanning the separate islet/prediction/duel/case systems remain outside
this G12 matrix. Any future migration still requires independent per-file review
against the live state and the repository chain before it can be applied.
