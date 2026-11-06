# L4 Island Exchange v2: real prices and 10x positions

> **What this is:** the build spec for the reworked Island Exchange: real prices 1:1, every investment a 10x position (rising or falling) that closes itself at zero, the new migration, four routes, the Exchange panel and the content linter.
>
> **Who uses it:** the server builder, the screen builder and the linter builder on `feat/l4-exchange-v2`, and the reviewers. Nils' answers of 5 Nov 2026 are the source of truth. Anything marked *chosen here* is a default for Nils' OK.

- **Status:** draft, ready to build. Nothing here is applied to the real Supabase project.
- **Branch:** `feat/l4-exchange-v2` in the worktree `/Users/nilslenke/Developer/The-Great-Plot-Twist-exv2` (from `main` at `3d59b6a`).
- **Source of truth:** `20261105_Roadmap-Inputs.md`, section "Nils' answers to the Island Exchange questions (D017)", items 1 to 7. Item 2c (10x positions) replaces the x100 multiplier of items 1 and 2a. Item 7 lists the defaults this spec takes.
- **Stock source:** the decision memo of the research workflow (5 Nov 2026) recommends **Finnhub** (free key) as primary and **Alpaca Basic** as a technical backup. This spec follows it and lists where the memo still assumed v1 (section 4.3).
- **Suggested home:** `specs/L4-island-exchange-v2.md` (the controller commits it).

## 0. The answer in ten lines

1. **Prices are real, 1:1.** The seven island companies follow Binance (no key, around the clock). Five real US stock companies follow Finnhub. Stocks stay off until Nils has the key and Finnhub's written OK to show the prices.
2. **Every investment is a position:** a stake of 10 to 500 coins, 10x leverage, rising or falling. A 1 % price move changes the position by 10 % of the stake.
3. **Value** = stake x (1 + 10 x change) for rising, stake x (1 - 10 x change) for falling, where change = price / entry price - 1. It is counted in whole coins, rounded down, and never goes below 0.
4. **Zero point:** 90 % of the entry price (rising) or 110 % (falling). There the position closes itself at zero. A jump past the point also closes it at zero. Nobody loses more than stake plus opening fee, and nobody owes coins.
5. **Fee:** 2 % of the stake, rounded up, at opening and again at closing (taken from the value, never more than it). 1 % after the Relighting.
6. **Market hours:** a stock trades only while its market is open (calendar file for New York, Euronext and Xetra, 6 Nov to 31 Dec 2026). Market closed or price source away: last price, labelled, no trading, no automatic close.
7. **Brakes:** a trade uses a price at most 5 s old, a player makes at most 10 trades in 30 s. No price protection, no minimum hold, positions stay open across days.
8. **No timer exists,** so the automatic close runs whenever the server looks at prices: every board look, every trade, every portfolio look. One set-based SQL function does it.
9. **Database:** migration `20261106090000_exchange_leverage.sql` removes the v1 Exchange objects (never applied), adds `exchange_positions`, `exchange_events`, the reasons `market_stake` and `market_payout`, and three server-only functions. `market_fee` from v1 is reused.
10. **Routes:** `GET /api/market`, `GET /api/market/portfolio`, `POST /api/market/open`, `POST /api/market/close`. A panel opens at the harbor hotspot `market_hall`. A stdlib-only linter checks `backend/content/`.

## 1. Why

Nils wants an Exchange with real companies and real prices, where investments can reach zero fast enough to feel in a class (item 2c: "do all investments with 10x leverage, so they also hit 0 relatively quick and are then sold, so moved to zero"). v1 amplified real moves with a multiplier, a floor, a ceiling and 30 % pauses. It was merged, but its migration was never applied, and Nils' answers replace its price rules. Real prices need no amplification rule, so the floor, ceiling, pauses and daily re-base go away. The money rules become one simple idea: a stake that can grow, shrink or end at zero, never below.

## 2. The rules

| # | Rule | From |
|---|---|---|
| R1 | Real prices 1:1. Island companies show the Binance price of their instrument; stock companies show their real share price. No amplification. | Nils 2c |
| R2 | The seven island companies of v1 stay (same ids, names, tickers and Binance pairs). | Nils 2b |
| R3 | Real stock companies with real names and real market hours, through a stock-price API with a free key. Nils creates the key; agents never sign up. Off until the key exists, and (*chosen here*, from the memo) until Finnhub agrees in writing that its prices may be shown. | Nils 2b, memo |
| R4 | Every investment is a 10x position, rising or falling, on crypto, EUR/USD, gold and stocks alike. | Nils 2c, 7a, "same for crypto" |
| R5 | A position whose stake is used up (the price moved 10 % against it) closes automatically at zero. A gap past the zero point closes it at zero, never below. | Nils 2c, item 7 defaults |
| R6 | No floor, no ceiling, no pauses on prices. | Nils 1, 2a, 2c |
| R7 | A company whose source is away or whose market is closed shows its last price with a label and cannot be traded. | Nils 3 (A) |
| R8 | A stock position can be closed or used up only while its market is open. | item 7 default |
| R9 | Trading stays allowed in demo mode on the labelled recording. Those trades change real coins; the recording is public. | Nils 4 (B) |
| R10 | No price protection: a trade goes through at the server price of that moment. | Nils 5 (B) |
| R11 | A trade uses a price at most 5 seconds old (fetched fresh if older). A player makes at most 10 trades in 30 seconds. | Nils 6 |
| R12 | The fee is 2 % of the stake each way (opening and closing), 1 % after the Relighting. | Nils 7b |
| R13 | At most 500 coins per position and 2,000 coins of new stakes per day. | item 7 default |
| R14 | Positions stay open across days until closed or used up. No minimum holding time. | item 7 default |
| R15 | At least 10 coins per position. The fee is rounded up, so a smaller stake would pay a fee of 10 % or more. | *chosen here* |
| R16 | At most 20 open positions per player, so the portfolio is one short list and every answer stays bounded. | *chosen here* |
| R17 | The day of the daily stake cap starts at 08:00 Europe/Lisbon (the v1 market day, kept). | *chosen here* |
| R18 | Values are rounded down and fees up (against the player). The closing fee is never more than the value. | *chosen here* |
| R19 | Reaching the zero point exactly counts as used up. | *chosen here* |
| R20 | A position opened on live prices can only be closed with live prices, one opened on the recording only with the recording. | *chosen here* |
| R21 | After the Relighting, Greyfathom Salvage takes no new positions ("Greyfathom is delisted", docs/STORY.md). Its open positions can still be closed and still close at zero. | *chosen here* |
| R22 | An open **rising** position in Greyfathom Salvage counts as the "Greyfathom share" of card C6 (shareholder register). | *chosen here* |
| R23 | The automatic close uses only prices the server fetched, and a price closes only positions that were already open when it was quoted. | *chosen here* |
| R24 | Stocks are not part of the demo recording; in demo mode they are hidden. | *chosen here* |

## 3. What changes from v1

### 3.1 Server modules

| v1 | v2 | Why |
|---|---|---|
| `market/rules.py` (amplified price, floor, ceiling, breaker, re-base, source change) | retired. `market_day_start` moves to `market/game_day.py` as `game_day_start`, with its tests | R1, R6 |
| `market/trade_rules.py` (units, rounding, holding time) | retired, replaced by `market/positions.py` | R4, R14 |
| `market/feed.py` | split: `binance.py` (request and parsing), `replay.py` (the recorded day), `stocks.py` (stock source, providers, call budget), `stock_finnhub.py` (the Finnhub adapter), `feed.py` (caches and freshness per source) | two sources, freshness per company |
| `market/companies.py` | rewritten for the v2 file | island and stock companies |
| new | `market/calendars.py`: loads `calendars.json`, `session_at(market, now)` | R7, R8 |
| new | `market/states.py`: pure `company_state(...)` | one status per company |
| `market/store.py` | rewritten: positions, events, the three functions; the number readers (`to_decimal`, `to_time`, `plain`) stay | new tables |
| `market/exchange.py` | rewritten: `MarketService` with `board()`, `portfolio()`, `open_position()`, `close_position()` and the sweeps. Split into `exchange.py` and `trading.py` if it passes about 200 lines | |
| `market/limits.py` | unchanged | R11 |
| `routes/market.py` | rewritten: four routes | |
| `content/market/companies.json` | v2 format, 12 companies | R2, R3 |
| new `content/market/calendars.json` | | R7, R8 |
| `content/market/replay.json` | unchanged | R9 |
| `content/market/README.md` | rewritten | |
| setting `MARKET_MULTIPLIER` | removed | R1 |
| new settings `STOCK_API_PROVIDER`, `STOCK_API_KEY` | | R3 |

Some v1 tests are retired **together with the rules they test**: amplification, the breaker, the floor and ceiling, the re-base, the source change, whole units and the holding time. The pull request says so, because Nils changed the requirement (ENGINEERING.md, section 5, rule 2). These tests stay, adapted to the new shapes: the Binance request, the caches, the rush lock, the 5-second rule, the stale prices, the replay file, the speed limit and the number readers.

### 3.2 Who builds what

| Builder | Files |
|---|---|
| Server | `backend/server/market/`, `backend/server/routes/market.py`, `backend/content/market/`, the market tests, `supabase/migrations/20261106090000_exchange_leverage.sql`, `supabase/README.md`, `docs/INTERFACES.md` (market text), `docs/DECISIONS.md` (D017), `.env.example` |
| Screen | `frontend/src/screens/market/` (panel, adapter, fake, HTTP mapping, README), `frontend/tests/market/`, and one small hook in `frontend/src/game.js` |
| Linter | `backend/tools/__init__.py`, `backend/tools/lint_content.py`, `backend/server/tests/test_lint_content.py` (pytest collects only `server/tests` and `plot_twist/tests`, and `pyproject.toml` stays untouched) |

**Outside the listed ownership, needed by the rework (the controller confirms):**

- `backend/server/wallet.py`: append `("market_stake", SPEND)` and `("market_payout", EARN)` to `WALLET_REASONS` (recipe 4.7). `test_wallet_matches_migration.py` fails without it.
- `backend/server/tests/test_wallet.py`: the expected list of reasons gains the same two pairs.
- `backend/server/settings.py` (and `test_settings.py` if it names the multiplier): add `stock_api_provider` and `stock_api_key` (`SecretStr`), remove `market_multiplier`.
- `backend/server/app.py`: no change. `market_or_none(settings)` builds the sources, and tests pass `market_service=` by keyword as today.

**Follow-ups for the controller (not on this branch's list):**

- `docs/STORY.md` section 6, Exchange row: "amplified x20 to 100; resets daily; pauses" is stale.
- `ROADMAP.md`, L4 text: stale (builders never touch it).
- `docs/ARCHITECTURE.md`, "where each secret lives": needs `STOCK_API_KEY`.
- `docs/SETUP.md`: needs the key step.
- `backend/content/README.md`: needs one line pointing to the linter.
- D014: records that Nils owns the Finnhub key.

**Never touched:** `vercel.json`, `.github/`, `docs/STATUS.md`, `ROADMAP.md`, the case adapter, `frontend/GRAPHICS.md`, `frontend/package.json`, the v1 migration `20261106010000_island_exchange.sql`.

## 4. The price feed

### 4.1 The companies file (v2)

`backend/content/market/companies.json` keeps `about` and `nameCheck` and lists 12 companies: the seven island companies of v1 and five US stock companies (the memo's list).

```json
{
  "id": "harbor-trust",
  "name": "Saltreach Harbor Trust",
  "ticker": "SHT",
  "kind": "island",
  "follows": "Bitcoin",
  "symbol": "BTCUSDT",
  "market": "always",
  "currency": "USDT",
  "priceDecimals": 2,
  "tagline": "The old harbor bank. When it moves, the whole market feels it."
}
```

```json
{
  "id": "apple",
  "name": "Apple",
  "ticker": "AAPL",
  "kind": "stock",
  "follows": "Apple Inc. shares (Nasdaq)",
  "market": "us",
  "currency": "USD",
  "priceDecimals": 2,
  "tagline": "Phones, laptops and the shop in every pocket."
}
```

| Field | Rule |
|---|---|
| `id` | `^[a-z0-9-]{2,40}$`, unique. Never renamed or removed while players may hold open positions in it. |
| `name` | 2 to 40 characters. Island companies: invented. Stock companies: the real company name. |
| `ticker` | `^[A-Z0-9]{1,6}$`, unique across all companies. Island: invented. Stock: the real exchange ticker. |
| `kind` | `island` (an invented company that follows a Binance pair) or `stock` (a real listed company). |
| `follows` | 2 to 60 characters: the real instrument or share, in words. The board shows it next to every name. |
| `symbol` | Island only: the Binance pair, `^[A-Z0-9]{5,20}$`, unique. Stocks have none (ticker plus market). |
| `market` | `always` for island companies; a market id from `calendars.json` for stocks. |
| `currency` | 3 to 5 capital letters: `USDT` for Binance pairs (a dollar token), `USD` or `EUR` for stocks. |
| `priceDecimals` | 0 to 8, for display only. |
| `tagline` | 1 to 120 characters. |
| `delistAtRelighting` | optional `true`; only Greyfathom Salvage has it (R21). |

At most 20 companies. `startPrice` is gone (there is no game price any more).

| Company | Kind | Follows | Symbol or ticker | Market | Currency | Decimals |
|---|---|---|---|---|---|---|
| Saltreach Harbor Trust (`harbor-trust`) | island | Bitcoin | BTCUSDT | always | USDT | 2 |
| Tidewright Works (`tidewright-works`) | island | Ether | ETHUSDT | always | USDT | 2 |
| Swiftwater Ferries (`swiftwater-ferries`) | island | Solana | SOLUSDT | always | USDT | 2 |
| Pier Post Courier (`pier-post-courier`) | island | XRP | XRPUSDT | always | USDT | 4 |
| Market Hall Guild (`market-hall-guild`) | island | BNB | BNBUSDT | always | USDT | 2 |
| Two Shores Change Bureau (`two-shores-bureau`) | island | Euro in US dollars | EURUSDT | always | USDT | 4 |
| Greyfathom Salvage (`greyfathom-salvage`) | island | Gold (PAXG, one troy ounce) | PAXGUSDT | always | USDT | 2 |
| Apple (`apple`) | stock | Apple Inc. shares (Nasdaq) | AAPL | us | USD | 2 |
| NVIDIA (`nvidia`) | stock | NVIDIA Corporation shares (Nasdaq) | NVDA | us | USD | 2 |
| Tesla (`tesla`) | stock | Tesla Inc. shares (Nasdaq) | TSLA | us | USD | 2 |
| Coca-Cola (`coca-cola`) | stock | The Coca-Cola Company shares (NYSE) | KO | us | USD | 2 |
| Spotify (`spotify`) | stock | Spotify Technology shares (NYSE) | SPOT | us | USD | 2 |

- **No European company is listed.** No free source gives fresh European prices (memo). Euronext and Xetra are still in `calendars.json`, so a European company is one entry once a source exists.
- **"Tesla" carries a person's surname** as a company name. The linter exempts stock company names, but the team may swap it (for example for Amazon).
- **The new `about` text** says: island companies are invented; stock companies are real listed companies, shown with their real names and real prices in a play-money simulation. No link to or endorsement by any of them, and no logos.
- `nameCheck` stays for the island names (story rule 5).

`companies.py` refuses a bad file at start-up with a message that names the company and the field (as v1). It also refuses a stock whose `market` is not in `calendars.json`.

### 4.2 The two sources

**Binance (island companies).** Unchanged from v1:

- `GET https://data-api.binance.vision/api/v3/ticker/price?symbols=[...]`: one request for all seven pairs, no key, prices as text, 3 s timeout.
- The quote time is our fetch time, because the answer has none.
- Parsing is per symbol: a pair missing from a good answer leaves only that company without a fresh price. v1 failed the whole answer.

**The stock source (provider-agnostic).** One interface in `market/stocks.py`; the provider is the setting `STOCK_API_PROVIDER`, its key `STOCK_API_KEY`.

```python
@dataclass(frozen=True)
class Quote:
    price: Decimal          # above 0, at most 8 decimals (more are rounded half-even to 8)
    quoted_at: datetime     # the provider's time of this price, in UTC

class StockProvider(Protocol):
    name: str                          # the value of STOCK_API_PROVIDER, for example "finnhub"
    markets: frozenset[str]            # the calendars it covers, for example {"us"}
    credit: str                        # the credit line its terms ask for
    def symbol_for(self, ticker: str, market: str) -> str | None: ...   # None: not covered
    def requests_for(self, symbols: Sequence[str], key: str) -> list[httpx.Request]: ...
    def read_answer(self, symbols: Sequence[str], text: str) -> dict[str, Quote]: ...
```

- **`requests_for`** returns one request for a provider with a batch call (Alpaca), and one request per symbol for Finnhub, whose quote endpoint takes one symbol per call. The source sends them together (one lock, one moment, `asyncio.gather`), so one refresh still serves every player with the same shared prices. This is the one place where "one request per source for all symbols" cannot hold, because of the recommended provider. The call budget below is the safeguard.
- **`read_answer`** gets the raw text and parses it with `json.loads(text, parse_float=Decimal)`, so prices stay exact.
- **Call budget** (*chosen here*): at most `STOCK_CALLS_PER_MINUTE = 25` provider calls per server instance in any 60 seconds, counted in a sliding window like `limits.py`. Finnhub allows 60 a minute per key, so two busy instances fit. A refresh that would go over the budget is not sent. The company keeps its last price, and a trade that needed a fresh one is refused with `409 prices_stale`.
- **Off** when `STOCK_API_PROVIDER` is empty, or when the key is empty (one warning at start-up).
  - An unknown provider name stops the server at start-up with a clear message, like an unknown feature flag. So set the name only after its adapter is merged.
  - Demo mode never builds or calls the stock source.
- **Finnhub adapter** (`stock_finnhub.py`):
  - Request: `GET https://finnhub.io/api/v1/quote?symbol=AAPL`, with the key in the header `X-Finnhub-Token`. The memo names the header from general knowledge, so the builder confirms it in Finnhub's docs before coding.
  - Answer: `{"c", "d", "dp", "h", "l", "o", "pc", "t"}`. The price is `c`, the time is `t` (unix seconds). `c` or `t` of 0 means "no quote" (an unknown symbol).
  - Tests use invented numbers in this shape, never recorded vendor prices.
  - If Finnhub only accepted the key in the URL, that URL must never reach a log. `app.py` already keeps httpx at WARNING, and `CachedSource` logs only the error type.
- **Alpaca adapter** (backup, built only if needed):
  - Request: `GET https://data.alpaca.markets/v2/stocks/snapshots?symbols=AAPL,NVDA,TSLA,KO,SPOT&feed=iex`, with the headers `APCA-API-KEY-ID` and `APCA-API-SECRET-KEY`. It needs a second secret, `STOCK_API_SECRET`, added only with this adapter.
  - Answer: price `latestTrade.p`, time `latestTrade.t` (RFC 3339 with nanoseconds; cut to microseconds).

### 4.3 Stock-price candidates (memo of 5 Nov 2026, plus checks of my own)

| Provider | Free plan | Fits? |
|---|---|---|
| **Finnhub** (primary) | Real-time US quotes, 60 calls a minute, 30 a second, no daily cap listed; US only; one symbol per call; personal use, and sharing data with others needs Finnhub's written approval | yes, after written approval |
| **Alpaca Basic** (backup) | IEX feed only (about 2.5 % of US trading), 200 calls a minute, all symbols in one call; Alpaca's support says its API data may not be redistributed | technical backup only |
| Twelve Data Basic | 8 credits a minute and 800 a day, one credit per symbol, real-time US in regular hours; licence "internal non-display usage" (checked on twelvedata.com/pricing) | no: no display |
| Tiingo, Alpha Vantage, Massive (Polygon), FMP, EODHD, Marketstack, Pyth, Stooq, Yahoo | too few calls, end of day or delayed, no display rights, or no longer usable from a server | no |
| Europe (Euronext, Xetra) | no free key gives fresh European prices; Twelve Data Pro ($229 a month) plus a Cboe add-on, and more for public display | not for a class game |

**Where the memo still assumed v1** (and what this spec does instead):

1. The memo's request to Finnhub says players never see real prices. Under v2 they **do**: the board shows real prices 1:1. The request must say so (corrected text in section 15).
2. The memo suggests a one-minute price age for stock trades. Nils decided 5 seconds for every trade (item 6). This spec keeps 5 seconds: a stock trade refreshes only its own symbol (one call), inside the call budget.
3. The memo's re-base at each open and the circuit breaker no longer exist. A gap at the open simply closes used-up positions at zero (R5, R8).
4. The memo asks for the `tzdata` package. This spec needs no new dependency. `calendars.json` carries the UTC offset of each market for its window, because no clock change happens between 6 Nov and 31 Dec 2026. A test compares the offsets with the time-zone database where it exists.
5. The memo suggests D019 for the decision. The controller's brief says D017 is updated; the key's owner goes into D014.

### 4.4 Caching and freshness

| | Island companies (Binance) | Stock companies (Finnhub) |
|---|---|---|
| One refresh | one request for all seven pairs | one call per stock (five), sent together |
| The board accepts | prices up to 60 s old | prices up to 60 s old while the market is open |
| A trade needs | a price at most 5 s old; if older, ask again (a rush is one request) | the same, for the traded stock only (one call) |
| Quote time | our fetch time | the provider's time `t` |
| Also stale when | | quoted before today's open, or quoted more than 60 s before we fetched it |
| After a failed request (any error, timeout, 429) | wait 10 s before asking again | wait 30 s |
| Timeout | 3 s | 3 s |
| While the market is closed | never closed | no call once the instance holds a price fetched at least 10 min after the last close; a fresh instance asks once to learn the last price |
| Budget | weight 4 of Binance's 6,000 a minute per request | at most 25 calls a minute per instance |
| Demo mode | the recording; Binance is never called | never called; stocks hidden |

The caches live in memory, once per server instance (as v1, `adapters/base.py`).

- Each source keeps its newest quote per symbol and when it got it. A good answer updates only the symbols it contains.
- "Last price" means the newest price this instance holds.
- Known limit: a fresh instance during an outage has no last price, so the company shows "No price yet". A shared last-price table is listed under "later".

Call arithmetic for Finnhub:

- A board refresh costs 5 calls, at most once a minute per instance.
- The US session is 390 minutes, so that is at most 1,950 board calls a day per instance, plus trades inside the budget of 25 a minute.
- Closed hours cost 5 calls per fresh instance.

The 60-second quote-lag rule is a named constant (`MAX_QUOTE_LAG_SECONDS`). Check it on a preview during US hours: if Finnhub's `t` lags by design for liquid stocks, the constant changes, not the rule.

### 4.5 Market hours: `calendars.json`

```json
{
  "about": "Opening hours of the stock markets behind the Island Exchange, with their holidays from 6 Nov to 31 Dec 2026. Local exchange times; utcOffset holds for the whole window, because no clock change falls inside it.",
  "validFrom": "2026-11-06",
  "validTo": "2026-12-31",
  "checkedOn": "2026-11-05",
  "markets": [
    {
      "id": "us",
      "name": "New York (NYSE and Nasdaq)",
      "timeZone": "America/New_York",
      "utcOffset": "-05:00",
      "opens": "09:30",
      "closes": "16:00",
      "closedDays": [
        {"date": "2026-11-26", "name": "Thanksgiving Day"},
        {"date": "2026-12-25", "name": "Christmas Day"}
      ],
      "shortDays": [
        {"date": "2026-11-27", "closes": "13:00", "name": "Day after Thanksgiving"},
        {"date": "2026-12-24", "closes": "13:00", "name": "Christmas Eve"}
      ],
      "source": "https://www.nyse.com/markets/hours-calendars"
    }
  ]
}
```

| Market | Regular hours (local) | In UTC, 6 Nov to 31 Dec 2026 | Closed | Short days |
|---|---|---|---|---|
| `us`: NYSE and Nasdaq | 09:30 to 16:00 New York | 14:30 to 21:00 | Thu 26 Nov (Thanksgiving Day), Fri 25 Dec (Christmas Day) | Fri 27 Nov and Thu 24 Dec close at 13:00 New York (18:00 UTC) |
| `euronext`: Amsterdam, Brussels, Lisbon, Paris | 09:00 to 17:30 Paris | 08:00 to 16:30 | Fri 25 Dec | Thu 24 Dec and Thu 31 Dec are half days. Euronext lists the 2026 times as "to be announced"; use 14:05 Paris (13:05 UTC), the time of earlier years, and update the file when Euronext publishes it |
| `xetra`: Frankfurt | 09:00 to 17:30 Frankfurt | 08:00 to 16:30 | Thu 24 Dec, Fri 25 Dec, Thu 31 Dec | none; Deutsche Boerse may announce other hours for Wed 30 Dec by circular |

Lisbon is on UTC in this window, so the UTC column is Lisbon time. At the 11:00 class, Euronext and Xetra are open and New York is closed. So at class time only the island companies trade, and the US stocks show "Closed, opens 14:30".

**Session rules** (`session_at(market, now)`, pure):

- `always` (island companies): open, no times.
- A stock market is **open** when all three hold:
  - its local date (UTC plus `utcOffset`) is Monday to Friday;
  - that date is not a closed day;
  - the local time is at or after `opens` and before that day's close (the `shortDays` close, otherwise `closes`).
- **Closed** gives a `reason` and `opensAt`:
  - `reason` is `weekend`, `holiday` (with the day's `name`), `outside_hours`, or `no_calendar` (before `validFrom` or after `validTo`);
  - `opensAt` is the next open moment inside the window, in UTC, or null when it lies beyond `validTo`.
- **Open** gives `opened_at` and `closes_at` of today's session in UTC.

### 4.6 Company state: what the board says about each company

`company_state(...)` (pure, `states.py`) gives each company a `status` and a `reason`, checked in this order:

| Order | Status | Reasons | The company |
|---|---|---|---|
| 1 | `unavailable` | `source_off` (stock source off, or the provider does not cover its market), `not_in_recording` (a stock in demo mode), `no_price` (no price yet) | shows "No price yet" or why; no trading |
| 2 | `closed` | `weekend`, `holiday`, `outside_hours`, `no_calendar` | shows its last price with its time and `opensAt`; no trading, no automatic close |
| 3 | `stale` | `source_away` (the latest request failed or the budget was used up), `waiting_first_price` (stock quoted before today's open), `quote_old` (stock quoted more than 60 s before we fetched it) | shows its last price with its time; no trading, no automatic close |
| 4 | `open` | none | tradable |

For a trade the same check runs on a reading at most 5 s old.

- `canOpen`: the flag `market` is on, the status is `open` and the company is not delisted.
- `canClose`: the flag is on and the status is `open`.
- A delisted company (R21) keeps its status and shows `delisted: true`.

**What "closed" returns** on the board (a US stock at 12:05 Lisbon on Fri 6 Nov):

```json
{"id": "apple", "price": 271.2, "priceAt": "2026-11-05T20:59:59Z", "source": "cache",
 "status": "closed", "reason": "outside_hours", "holiday": null,
 "opensAt": "2026-11-06T14:30:00Z", "closesAt": null,
 "canOpen": false, "canClose": false, "zeroPrices": null}
```

- On Thanksgiving: `"reason": "holiday", "holiday": "Thanksgiving Day", "opensAt": "2026-11-27T14:30:00Z"`.
- After 31 Dec: `"reason": "no_calendar", "opensAt": null`.
- A trade on a closed company answers `409 market_closed` with the opening time in words.

### 4.7 Demo mode

With `DEMO_MODE=true`:

- The island companies play `replay.json` as in v1 (90 recorded minutes of 4 Nov 2026, Binance Vision, CC BY-NC-SA 4.0). Trading on it is allowed (R9).
- Binance and the stock provider are never called. Stock companies are hidden (R24).
- Positions opened in demo mode are stored with `price_mode = 'replay'`. A demo server never closes live positions, and a live server never closes recording positions (R20). So mixing modes on one database can never pay out at a recorded price. Every deployment that shares one database should still use the same `DEMO_MODE`.
- The board says `"demo": true` and carries the label text (section 9.4).
- The v1 start-up failure ("the replay lacks a symbol") cannot hit stocks: only island pairs are checked against the recording.

## 5. Position rules (pure functions in `positions.py`)

### 5.1 The numbers (named once, here)

| Name | Value |
|---|---|
| `LEVERAGE` | 10 (must divide a power of ten, so the zero point is an exact decimal) |
| `FEE_BASIS_POINTS` / `RELIT_FEE_BASIS_POINTS` | 200 (2 %) / 100 (1 %) |
| `MIN_STAKE_COINS` / `MAX_STAKE_COINS` | 10 / 500 |
| `DAILY_STAKE_CAP_COINS` | 2,000 (game day from 08:00 Europe/Lisbon) |
| `MAX_OPEN_POSITIONS` | 20 |
| `MAX_VALUE_COINS` | 1,000,000 (the wallet's largest change, `MAX_DELTA`; unreachable in practice) |
| `STAKE_CHOICES` | 10, 25, 50, 100, 250, 500 (what the screen offers) |
| `MAX_PRICE_DECIMALS` | 8 |
| `RISING`, `FALLING` | `"rising"`, `"falling"` |

### 5.2 The formulas

With `entry` the entry price, `price` the price now and `move = price - entry`:

- **Zero point:** rising `entry x 9 / 10`; falling `entry x 11 / 10` (in general `entry x (L - 1) / L` and `entry x (L + 1) / L`).
- **Used up:** rising when `price <= zero point`; falling when `price >= zero point` (R19).
- **Value in whole coins** (multiply first, divide once at the very end):
  - rising: `n = stake x (entry + 10 x move)`; falling: `n = stake x (entry - 10 x move)`;
  - if `n <= 0` the position is used up and worth 0; otherwise `value = min(n // entry, 1,000,000)`.

  Python `Decimal //` and Postgres `div(n, entry)` both give the exact whole-number part. So Python and SQL always agree, with no rounding of a long fraction. `n <= 0` is the same test as "at or past the zero point".
- **Profit:** `value - stake`. **Profit percent:** `(value - stake) / stake x 100`, two decimals (display).
- **Fee:** `ceil(stake x basis points / 10,000)`: 2 % of the stake, rounded up, at least 1 coin.
- **Opening costs:** `stake + fee` (both leave the wallet).
- **Closing:** `close fee = min(fee, value)`; the player receives `value - close fee`. A position used up at the moment of closing has value 0 and pays no fee.
- **Result** (both fees counted): `value - close fee - stake - opening fee`.

A rising position has no upper limit. A falling one is worth at most 11 x the stake, because the price cannot go below 0.

The functions, each a few lines with plain values in and out:

- `fee_basis_points(is_relit)`, `fee_for(stake, basis_points)`
- `check_stake(stake)` (raises the 422s)
- `zero_price(side, entry)`, `is_used_up(side, entry, price)`, `position_value(side, stake, entry, price)`
- `opening_costs(stake, basis_points)`, `closing_amounts(side, stake, entry, price, basis_points)` (value, close fee, coins change, used up)
- `profit(value, stake)`, `profit_percent(value, stake)`, `stake_choices(basis_points)`

`states.py` adds `sweep_prices(states)`: the price list for the automatic close, built only from companies with status `open`.

### 5.3 Worked examples (the table the tests use)

| Side | Stake | Entry | Price | Value | Note |
|---|---|---|---|---|---|
| rising | 100 | 76,000.00 | 77,520.00 (+2 %) | 120 | +20 coins |
| rising | 100 | 76,000.00 | 74,480.00 (-2 %) | 80 | -20 coins |
| rising | 100 | 76,000.00 | 68,400.00 | 0 | exactly the zero point: closed at zero |
| rising | 100 | 76,000.00 | 68,400.01 | 0 | still open (worth less than 1 coin) |
| rising | 100 | 76,000.00 | 60,000.00 | 0 | gap past the zero point: zero, never below |
| falling | 50 | 200.00 | 190.00 (-5 %) | 75 | +25 coins |
| falling | 50 | 200.00 | 210.00 (+5 %) | 25 | -25 coins |
| falling | 50 | 200.00 | 220.00 | 0 | exactly the zero point |
| falling | 50 | 200.00 | 219.99 | 0 | still open |
| falling | 50 | 200.00 | 260.00 | 0 | gap past the zero point |
| falling | 50 | 200.00 | 0.01 | 549 | near the most a falling position can be worth (550) |
| rising | 10 | 3.0000 | 3.0001 | 10 | rounded down |
| rising | 100 | 75,000.00 | 76,159.21 | 115 | the portfolio example in section 8 |
| rising | 500 | 50.00 | 45.03 | 3 | close fee 10 is capped at 3: the player receives 0 |

Zero points: entry 76,159.21 gives 68,543.289 (rising) and 83,775.131 (falling); entry 214.35 gives 192.915 and 235.785.

### 5.4 Fees by stake

| Stake | 10 | 25 | 50 | 51 | 100 | 250 | 500 |
|---|---|---|---|---|---|---|---|
| Fee at 2 % | 1 | 1 | 1 | 2 | 2 | 5 | 10 |
| Opening costs at 2 % | 11 | 26 | 51 | 53 | 102 | 255 | 510 |
| Fee at 1 % (after the Relighting) | 1 | 1 | 1 | 1 | 1 | 3 | 5 |

A round trip at an unchanged price always costs both fees, so it never makes coins from nothing.

## 6. The automatic close at zero

### 6.1 When it runs

Vercel functions run only when a request arrives, and there is no timer:

- Vercel Cron breaks our deploys while we use Services (D002).
- A GitHub Actions schedule every few minutes would spend the account's Actions minutes and can start many minutes late.
- A database timer (pg_cron with pg_net) would make the database fetch prices and hold the stock key, which nobody could explain in a code walkthrough.

So the close runs whenever the server has prices in hand:

| Moment | Prices used | Positions checked |
|---|---|---|
| Every board build that reaches the function (`GET /api/market`, flag `market` on) | every company with status `open` (prices up to 60 s old) | all players |
| Every open (before the open) | the same, refreshed for the traded company (at most 5 s old) | all players (so the count of 20 open positions is right) |
| Every close (after the close) | the same | all players |
| Every portfolio look | every company with status `open` | that player |

Each run is **one** call of `exchange_close_used_up(prices, player)` (section 7.7). It is one set-based statement that closes every open position of the right company and price mode whose zero point the price has reached. It only closes positions opened before that price was quoted (R23).

- Closed and stale companies are never in the price list, so stock positions are never closed while their market is closed (R8).
- A failed sweep is logged and never fails the answer; the next look runs it again.
- A player close that finds its own position used up closes it at zero itself.
- The board is cached at the edge for 30 s, so a public look triggers at most about two sweeps a minute per edge region.
- While the flag is off, nothing sweeps.

### 6.2 Why nobody can be left below zero

1. The stake and the opening fee leave the wallet when the position opens, in the same transaction that creates the position. They go through `apply_wallet_transaction()`, which refuses a balance below 0.
2. From then on the position can only **pay** coins, never take them. The value is `max(0, ...)` and the closing fee is at most the value, so a close moves 0 coins or more into the wallet.
3. A late close (because nobody looked) changes only **when** a used-up position is marked closed, never how many coins anybody has: it moves 0 coins.
4. A gap past the zero point is still 0, never negative, because `n <= 0` means value 0.
5. The database checks it too: `close_value >= 0`, `close_fee <= close_value`, a zeroed position has value and fee 0, and the wallet never goes below 0.

So no order of looks, races or gaps can put a wallet below zero or create a debt. The most a player can lose on one position is the stake plus the opening fee.

### 6.3 Known limit

The Exchange sees only the prices it fetches. A dip past the zero point that comes and goes between two looks is missed, so that position survives (in the player's favour). While anybody plays, an open panel refreshes the board every 30 seconds, so this matters mainly at night. Catching every dip would need per-symbol candles (one request per symbol) or a timer we do not have.

## 7. Database: `supabase/migrations/20261106090000_exchange_leverage.sql`

### 7.1 Header and order

The header follows the v1 file:

- WHAT IT DOES, WHO USES IT, THE RULES THAT THE DATABASE KEEPS;
- WHAT IT NEEDS: the foundation migration and the v1 Exchange migration, because `market_fee` comes from there;
- SAFE TO RUN TWICE, HOW THE FILE IS ORGANISED.

The file is organised in this order:

1. Stop if the v1 tables hold data (guard).
2. Remove the v1 Exchange functions and tables.
3. Wallet reasons `market_stake` and `market_payout`.
4. Table `exchange_positions`.
5. Table `exchange_events`.
6. Row-level security.
7. Table privileges.
8. Function `exchange_open_position()`.
9. Function `exchange_close_position()`.
10. Function `exchange_close_used_up()`.

Style rules:

- lowercase SQL;
- a plain-English comment above every table, policy and function;
- `comment on` for every table, column, policy and function;
- every function with `set search_path = ''` and full names.

### 7.2 Removing v1

v1 was merged but never applied, so its tables can hold no real data. The file first runs a guard, then drops:

```sql
-- Stop before anything changes if the old v1 trade history was ever used. Then a person decides.
do $$
begin
  if to_regclass('public.market_trades') is not null then
    if exists (select 1 from public.market_trades) then
      raise exception 'v1_market_data_present';
    end if;
  end if;
end;
$$;

drop function if exists public.market_trade(uuid, text, text, bigint, numeric, bigint, bigint, text, integer, bigint, timestamptz, integer, bigint);
drop function if exists public.market_trade(uuid, text, text, bigint, numeric, bigint, bigint, text, integer, bigint, timestamptz);
drop function if exists public.market_set_base(text, numeric, numeric, timestamptz, text, timestamptz, numeric, integer);
drop table if exists public.market_trades;
drop table if exists public.market_positions;
drop table if exists public.market_bases;
```

- The nested `if` matters: the inner query is planned only when the table exists.
- The v2 tables have **new names** (`exchange_...`), so dropping a v1 name can never touch v2 data, even when this file runs twice.
- The reasons `market_buy` and `market_sell` stay in `wallet_reasons`, unused. A reason is never removed, and `test_wallet_matches_migration.py` refuses any update or delete of the list.

### 7.3 Wallet reasons

```sql
insert into public.wallet_reasons (reason, direction, description) values
  ('market_stake',  'spend', 'Coins put into an Island Exchange position (the stake).'),
  ('market_payout', 'earn',  'Coins paid out when an Island Exchange position is closed.')
on conflict (reason) do nothing;
```

`market_fee` (spend, from v1) is reused for both fees.

**No reason for a close at zero.** It moves 0 coins, and the wallet refuses an amount of 0, so it is recorded only as an `exchange_events` row of kind `zero`.

The ledger rows of one action share one ref:

| Action | Ledger rows | Ref |
|---|---|---|
| open | `market_stake` -stake, `market_fee` -fee | `market:open:<actionUid>` |
| close by the player | `market_payout` +value (if above 0), `market_fee` -close fee (if above 0) | `market:close:<actionUid>` |
| close at zero (sweep) | none | event ref `market:zero:<position id>` |

The prefixes keep open and close refs apart, even if a browser reused one `actionUid`. The longest ref is 13 + 64 = 77 characters, under the 120 limit. After this migration there are 13 reasons.

### 7.4 Table `exchange_positions`

| Column | Type | Rule |
|---|---|---|
| `id` | `uuid` primary key, `default gen_random_uuid()` | |
| `player_id` | `uuid not null` references `profiles (id) on delete cascade` | |
| `company_id` | `text not null` | `^[a-z0-9-]{2,40}$` |
| `side` | `text not null` | `rising` or `falling` |
| `price_mode` | `text not null` | `live` or `replay` (R20) |
| `leverage` | `integer not null` | `= 10` (a test compares it with `LEVERAGE`) |
| `stake` | `bigint not null` | 1 to 1,000,000 (the function checks the real limits) |
| `entry_price` | `numeric(28, 10) not null` | above 0, at most 8 decimals (`entry_price = round(entry_price, 8)`) |
| `zero_price` | `numeric(28, 10) not null` | rising: `zero_price * leverage = entry_price * (leverage - 1)`; falling: `zero_price * leverage = entry_price * (leverage + 1)` |
| `open_fee` | `bigint not null` | at least 1 |
| `open_ref` | `text not null` | not blank, at most 120 |
| `opened_at` | `timestamptz not null default now()` | |
| `status` | `text not null default 'open'` | `open`, `closed` or `zeroed` |
| `closed_at`, `close_price`, `close_value`, `close_fee`, `close_ref` | nullable | all empty while `open`; all filled once closed; `close_price` above 0 with at most 8 decimals; `close_value >= 0`; `0 <= close_fee <= close_value`; a `zeroed` row has value 0 and fee 0 |

Indexes:

- unique `(player_id, open_ref)`;
- `(company_id, side, zero_price) where status = 'open'` (for the sweep);
- `(player_id, status, opened_at desc)` (for the portfolio, the open count and the daily cap).

Rows are never deleted, except together with their player.

### 7.5 Table `exchange_events` (append-only history)

| Column | Type | Rule |
|---|---|---|
| `id` | `bigint generated always as identity primary key` | |
| `player_id` | `uuid not null` references `profiles (id) on delete cascade` | |
| `position_id` | `uuid not null` references `exchange_positions (id) on delete cascade` | |
| `kind` | `text not null` | `open`, `close` or `zero` |
| `company_id`, `side` | `text not null` | as in positions |
| `price` | `numeric(28, 10) not null` | above 0, at most 8 decimals |
| `stake`, `value`, `fee`, `coins_change` | `bigint not null` | open: value 0, `coins_change = -(stake + fee)`; close: `fee <= value`, `coins_change = value - fee`; zero: value, fee and coins_change 0 |
| `ref` | `text not null` | not blank, at most 120 |
| `created_at` | `timestamptz not null default now()` | |

Indexes: unique `(player_id, ref)`, so a repeated click can never act twice; and `(player_id, id desc)`.

### 7.6 Row-level security, grants and the matrix

- **RLS** is on for both tables, with one policy each: `"Players can read their own exchange positions"` and `"Players can read their own exchange events"`, both `for select to authenticated using (player_id = (select auth.uid()))`. There is no insert, update or delete policy.
- **Grants:**
  - first `revoke all` on both tables from `public, anon, authenticated, service_role`, and on the sequence `public.exchange_events_id_seq`;
  - then `grant select` to `authenticated`;
  - `grant select, insert, update on exchange_positions to service_role`;
  - `grant select, insert on exchange_events to service_role`;
  - no delete for anybody.
- **The three functions:** `revoke all ... from public, anon, authenticated`, then `grant execute ... to service_role`. They are not `security definer`: they run with the server's rights.

Matrix rows for `supabase/README.md` ("Who may do what"), replacing the `market_*` rows:

| Table | Action | Visitor (`anon`) | Player (`authenticated`) | Server (`service_role`) |
|---|---|---|---|---|
| `exchange_positions` | read | no access | own rows | yes |
| `exchange_positions` | insert | no access | no access | yes \*\* (through `exchange_open_position()`) |
| `exchange_positions` | update | no access | no access | yes \*\* (through `exchange_close_position()` and `exchange_close_used_up()`) |
| `exchange_positions` | delete | no access | no access | no access (rows go only with their player) |
| `exchange_events` | read | no access | own rows | yes |
| `exchange_events` | insert | no access | no access | yes \*\* (through the three functions) |
| `exchange_events` | update, delete | no access | no access | no access (append-only) |

- Function rows: the three functions are for the server only; `exchange_events_id_seq` is no access for everybody.
- The `**` footnote is rewritten for the new names: a direct write would skip the checks; only the server holds the right, and the code never writes the tables directly.

### 7.7 The three functions

What all three share:

- They return `jsonb` with camelCase keys (as v1).
- They *return* a refusal and change nothing.
- They *raise* only for real failures:
  - `insufficient_funds` (from the wallet);
  - `already_applied` with error code `23505`, so `supabase_admin.py` maps it as today;
  - `wallet_not_found`;
  - `bad_trade` / `bad_sweep` when the server sent numbers that do not add up. That is a bug, not something a player can cause.
- No parameter has a default.

**`exchange_open_position(p_player_id uuid, p_company_id text, p_side text, p_price_mode text, p_entry_price numeric, p_leverage integer, p_stake bigint, p_fee bigint, p_fee_basis_points integer, p_ref text, p_min_stake bigint, p_max_stake bigint, p_daily_stake_cap bigint, p_day_start timestamptz, p_max_open_positions integer)`**

1. Check the arguments, else `bad_trade`:
   - none missing; known side and mode;
   - entry above 0 with at most 8 decimals;
   - stake from `p_min_stake` to `p_max_stake`;
   - `p_fee_basis_points` is 100 or 200, and `p_fee = ceil(p_stake * p_fee_basis_points / 10000)`;
   - `p_day_start` not more than one minute in the future;
   - limits at least 1.
2. Lock the player's wallet row (`for update`), so one player's actions happen one at a time.
3. A repeated ref (an `exchange_events` row with this player and ref): raise `already_applied` (23505).
4. If the player already has `p_max_open_positions` or more open positions: return `{"status": "refused", "reason": "too_many_positions", "openCount": n}`.
5. If the stakes opened since `p_day_start` plus `p_stake` pass `p_daily_stake_cap`: return `{"status": "refused", "reason": "daily_cap", "coinsLeft": n}`.
6. `apply_wallet_transaction(-p_stake, 'market_stake', p_ref)`, then `apply_wallet_transaction(-p_fee, 'market_fee', p_ref)`. Not enough coins raises and undoes everything.
7. Insert the position. The function works out `zero_price` itself from the entry, the side and the leverage.
8. Insert the `open` event.
9. Return `{"status": "done", "positionId", "zeroPrice", "balance", "openedAt"}`.

**`exchange_close_position(p_player_id uuid, p_position_id uuid, p_price_mode text, p_close_price numeric, p_value bigint, p_fee bigint, p_fee_basis_points integer, p_ref text)`**

1. Check the arguments, else `bad_trade`: price above 0 with at most 8 decimals, known mode, rate 100 or 200, value and fee not negative.
2. Lock the wallet row.
3. A repeated ref: raise `already_applied`.
4. Lock the position (`select ... for update`) by id **and** player. Not found: return `{"status": "refused", "reason": "no_such_position"}`.
5. Not open: return `{"status": "refused", "reason": "position_closed", "closedAs": "closed" | "zeroed", "closedAt"}`.
6. Another price mode: return `{"status": "refused", "reason": "wrong_price_mode"}`.
7. Work out the value and the close fee:
   - the value with the formula of 5.2: `div(n, entry_price)`, capped at 1,000,000; 0 and "used up" when `n <= 0`;
   - the close fee: `least(ceil(stake * rate / 10000), value)`.

   If `p_value` or `p_fee` differ from these: `bad_trade`. This is the database checking the server's arithmetic.
8. Move the coins:
   - value above 0: `apply_wallet_transaction(+value, 'market_payout', p_ref)`;
   - fee above 0: `apply_wallet_transaction(-fee, 'market_fee', p_ref)`.

   The payout comes first, so the balance never dips.
9. Mark the position `closed`, or `zeroed` when used up, with the close columns. Insert a `close` or `zero` event with `p_ref`.
10. Return `{"status": "done", "closedAs", "value", "fee", "coinsChange", "balance", "closedAt"}`.

**`exchange_close_used_up(p_prices jsonb, p_player_id uuid)`**

`p_prices` is a JSON array, for example `[{"company_id": "harbor-trust", "price": "76159.21", "quoted_at": "2026-11-06T12:05:00Z", "mode": "live"}]`.

- Its keys are snake_case, because it is a database contract.
- Prices are text, so they stay exact.
- `p_player_id` null means all players.

1. Check every element, else `bad_sweep`: known keys, price above 0 with at most 8 decimals, mode `live` or `replay`, each company and mode at most once.
2. Close the positions in one statement:

```sql
with prices as (
  select * from jsonb_to_recordset(p_prices)
    as q(company_id text, price numeric, quoted_at timestamptz, mode text)
), due as (
  select p.id, q.price
    from public.exchange_positions p
    join prices q on q.company_id = p.company_id and q.mode = p.price_mode
   where p.status = 'open'
     and p.opened_at < q.quoted_at
     and (p_player_id is null or p.player_id = p_player_id)
     and ((p.side = 'rising'  and q.price <= p.zero_price)
       or (p.side = 'falling' and q.price >= p.zero_price))
   order by p.id
     for update of p skip locked
), closed as (
  update public.exchange_positions p
     set status = 'zeroed', closed_at = now(), close_price = due.price,
         close_value = 0, close_fee = 0, close_ref = 'market:zero:' || p.id::text
    from due
   where p.id = due.id
     and p.status = 'open'  -- a second guard, cheap
  returning p.*
)
insert into public.exchange_events
  (player_id, position_id, kind, company_id, side, price, stake, value, fee, coins_change, ref)
select player_id, id, 'zero', company_id, side, close_price, stake, 0, 0, 0, close_ref
  from closed;
```

3. Return `{"closed": n, "positionIds": [...]}`.

`skip locked` means that a position another call is closing right now is left to that call. So two sweeps never wait for each other, never deadlock and never close one position twice. No coins move, so the sweep locks no wallet.

### 7.8 `supabase/README.md`

- **File table:** the third migration, run after the first two.
- **"The Island Exchange migration":** rewritten for v2: the two tables, the three functions, the arithmetic the database checks, and that v1's tables are removed.
- **Reasons table:** add `market_stake` and `market_payout`. Mark `market_buy` and `market_sell` as "v1, never used, kept because reasons are never removed". 13 reasons in all.
- **Quick checks after all three migrations:** 9 tables (seven foundation plus two), 9 policies, 9 `authenticated` grant rows.
- **Manual test plan:** replace E1 to E13 with **X1 to X15**:

| Step | What it does | Expected |
|---|---|---|
| X1 | open rising: stake 100 at 76,000.00, fee 2 | balance 898, zero point 68,400.00, ledger `market_stake -100, market_fee -2` |
| X2 | the same ref again | `already_applied`, nothing changed |
| X3 | open falling: stake 50 at 200.00 | zero point 220.00 |
| X4 | close X1 at 77,520.00 | value 120, fee 2, ledger `market_payout +120, market_fee -2` |
| X5 | close X1 again with a new ref | `position_closed` |
| X6 | sweep at 221.00 | X3 closes at zero, no ledger row, one `zero` event |
| X7 | a gap: rising at 50.00, sweep at 30.00 | zeroed, balance unchanged |
| X8 | a player close past the zero point | `closedAs` zeroed, 0 coins |
| X9 | daily cap | `daily_cap` with `coinsLeft` |
| X10 | open-position limit | `too_many_positions` |
| X11 | not enough coins | `insufficient_funds`, nothing changed |
| X12 | arithmetic refusals: wrong fee, rate 300, stake 501 with a maximum of 500, entry with 9 decimals, day start tomorrow, wrong expected value | `bad_trade` each time |
| X13 | rights | players read only their own rows and cannot write; `anon` gets nothing; players cannot run the functions; even the server cannot update or delete events |
| X14 | price modes | closing a live position with mode `replay` gives `wrong_price_mode`; a replay sweep skips live positions |
| X15 | reasons and a second run | 13 reasons; the whole file runs again with no error and no change |

## 8. Routes

The home of each contract is the header comment and the Pydantic models of `backend/server/routes/market.py`.

- JSON is camelCase.
- Times are UTC with whole seconds (`2026-11-06T12:05:00Z`).
- Prices are JSON numbers; coins are whole numbers.

| Route | Who | What |
|---|---|---|
| `GET /api/market` | anyone; works while the flag is off (then it only looks and runs no sweep) | the board |
| `GET /api/market/portfolio` | signed in, flag on | the player's coins, open positions with live profit and loss, recently closed positions |
| `POST /api/market/open` | signed in, flag on | `{companyId, side, stake, actionUid}` |
| `POST /api/market/close` | signed in, flag on | `{positionId, actionUid}` |

`POST /api/market/trade` of v1 is removed.

### 8.1 `GET /api/market`

```json
{
  "generatedAt": "2026-11-06T12:05:03Z",
  "demo": false,
  "demoNote": null,
  "tradingEnabled": true,
  "relit": false,
  "companies": [
    {"id": "harbor-trust", "name": "Saltreach Harbor Trust", "ticker": "SHT", "kind": "island",
     "follows": "Bitcoin", "market": "always", "marketName": "Around the clock",
     "currency": "USDT", "priceDecimals": 2, "tagline": "The old harbor bank. When it moves, the whole market feels it.",
     "price": 76159.21, "priceAt": "2026-11-06T12:05:00Z", "source": "cache",
     "status": "open", "reason": null, "holiday": null, "opensAt": null, "closesAt": null,
     "delisted": false, "canOpen": true, "canClose": true,
     "zeroPrices": {"rising": 68543.289, "falling": 83775.131}},
    {"id": "apple", "name": "Apple", "ticker": "AAPL", "kind": "stock",
     "follows": "Apple Inc. shares (Nasdaq)", "market": "us", "marketName": "New York (NYSE and Nasdaq)",
     "currency": "USD", "priceDecimals": 2, "tagline": "Phones, laptops and the shop in every pocket.",
     "price": 271.2, "priceAt": "2026-11-05T20:59:59Z", "source": "cache",
     "status": "closed", "reason": "outside_hours", "holiday": null,
     "opensAt": "2026-11-06T14:30:00Z", "closesAt": null,
     "delisted": false, "canOpen": false, "canClose": false, "zeroPrices": null}
  ],
  "rules": {
    "leverage": 10, "zeroPointMovePercent": 10, "feePercent": 2.0,
    "minStake": 10, "maxStake": 500, "dailyStakeCap": 2000, "maxOpenPositions": 20,
    "stakeChoices": [{"stake": 10, "fee": 1, "total": 11}, {"stake": 25, "fee": 1, "total": 26},
                     {"stake": 50, "fee": 1, "total": 51}, {"stake": 100, "fee": 2, "total": 102},
                     {"stake": 250, "fee": 5, "total": 255}, {"stake": 500, "fee": 10, "total": 510}],
    "tradePriceMaxAgeSeconds": 5, "tradesPer30Seconds": 10, "gameDayStarts": "08:00 Europe/Lisbon"
  },
  "credits": [
    {"text": "Real prices from Binance market data.", "href": null, "licenceText": null, "licenceHref": null},
    {"text": "Stock prices from Finnhub.", "href": "https://finnhub.io", "licenceText": null, "licenceHref": null}
  ],
  "simulationNote": "Simulation with play money. Real names and real prices, no real money and no prizes."
}
```

- **Company order:** island companies in file order, then stocks in file order. Stocks appear only while the stock source is on and the server is not in demo mode.
- **`source`** per company is `live`, `cache`, `stale`, `replay` or `none`. `priceAt` is the quote time (the Exchange's form of `fetchedAt`).
- **`zeroPrices`** is an estimate at the board price, given only for `open` companies. The real zero point comes from the price at the moment of opening (no price protection, R10).
- **In demo mode:** `"demo": true`, the credit of the recording with `licenceText: "CC BY-NC-SA 4.0"` and `licenceHref`, and `demoNote` (section 9.4).
- **Caching:** `Cache-Control: public, max-age=30, s-maxage=30`, on 200 only. No query parameters (`422 validation_error`), so nobody skips the cache.
- **The board answers 200** whenever the data files loaded. A price problem is a per-company status, never a 503 for the whole board. `503 market_unavailable` comes only when a data file could not be read at start-up.

### 8.2 `GET /api/market/portfolio`

```json
{
  "coins": 940,
  "demo": false,
  "feePercent": 2.0,
  "stakedToday": 100, "dailyStakeCap": 2000,
  "openCount": 1, "maxOpenPositions": 20,
  "positions": [
    {"id": "7b3e...", "companyId": "harbor-trust", "name": "Saltreach Harbor Trust", "ticker": "SHT",
     "follows": "Bitcoin", "side": "rising", "mode": "live", "stake": 100, "openFee": 2,
     "entryPrice": 75000.0, "zeroPrice": 67500.0, "openedAt": "2026-11-06T11:40:12Z",
     "price": 76159.21, "priceAt": "2026-11-06T12:05:00Z", "companyStatus": "open", "companyReason": null, "opensAt": null,
     "value": 115, "profit": 15, "profitPercent": 15.0, "closeFee": 2, "wouldReceive": 113, "result": 11,
     "canClose": true}
  ],
  "recentlyClosed": [
    {"id": "9a71...", "companyId": "pier-post-courier", "name": "Pier Post Courier", "side": "falling", "mode": "live",
     "stake": 50, "openFee": 1, "entryPrice": 2.4, "zeroPrice": 2.64, "openedAt": "2026-11-06T09:12:40Z",
     "closedAs": "zeroed", "closePrice": 2.6512, "closedAt": "2026-11-06T10:02:31Z",
     "value": 0, "closeFee": 0, "coinsChange": 0, "result": -51}
  ],
  "generatedAt": "2026-11-06T12:05:03Z"
}
```

- **`positions`:** every open position, newest first (at most 20). Values are at the current price, or at the last price when `companyStatus` is `closed` or `stale` (then `canClose` is false).
- **`recentlyClosed`:** the 10 newest closed or zeroed positions.
- All numbers are worked out by the server (section 5); the screen does no arithmetic.
- Before reading, the sweep runs for this player. `Cache-Control: no-store`. No query parameters.
- A position of a company no longer in `companies.json` shows `companyStatus: "unavailable"` and cannot be closed. The content README forbids removing such a company.

### 8.3 `POST /api/market/open`

```text
POST /api/market/open
Authorization: Bearer <token>
{"companyId": "harbor-trust", "side": "rising", "stake": 100, "actionUid": "5d2c9f7e-3b1a-4c8e-9f20-6a7b8c9d0e1f"}

200 OK
{"positionId": "2f0c...", "companyId": "harbor-trust", "side": "rising", "stake": 100, "fee": 2,
 "coinsChange": -102, "coins": 838, "entryPrice": 76159.21, "zeroPrice": 68543.289,
 "feePercent": 2.0, "openedAt": "2026-11-06T12:05:04Z"}
```

Request model:

- `extra="forbid"`;
- `companyId`: 2 to 40 characters of `[a-z0-9-]`;
- `side`: `"rising"` or `"falling"`;
- `stake`: a `StrictInt` from 1 to 1,000,000; the rule check then gives `stake_too_small` or `stake_too_big`;
- `actionUid`: 8 to 64 characters of `[A-Za-z0-9_-]` (a `crypto.randomUUID()` fits).

The browser never sends a price.

Order of checks:

1. sign-in (401);
2. flag (404 `feature_off`);
3. body (422);
4. speed limit (429);
5. **repeat (409 `already_applied`)**, before anything else that could have changed;
6. stake range (422);
7. company (404);
8. delisted (409);
9. source on (409 `company_unavailable`);
10. fresh price and open market (409 `market_closed` or `prices_stale`);
11. sweep (it never fails the trade);
12. the wallet rules for each coin movement (`validate_transaction`);
13. the database.

### 8.4 `POST /api/market/close`

```text
POST /api/market/close
Authorization: Bearer <token>
{"positionId": "7b3e...", "actionUid": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"}

200 OK
{"positionId": "7b3e...", "closedAs": "closed", "closePrice": 76159.21, "value": 115, "fee": 2,
 "coinsChange": 113, "coins": 951, "closedAt": "2026-11-06T12:06:10Z"}
```

`positionId` is a UUID; a malformed one gives 422.

Order of checks:

1. sign-in, flag, body, speed limit, repeat;
2. read the position by id and player (404 `no_such_position`, 409 `position_closed`);
3. company available (409 `company_unavailable`);
4. price mode (409 `wrong_price_mode`);
5. fresh price and open market (409);
6. amounts from section 5, then the wallet rules;
7. the database, then the sweep.

A close that finds the position used up answers 200 with `"closedAs": "zeroed"` and 0 coins. Delisted companies can still be closed.

### 8.5 Every error, in plain words

The server message is the plain words. The screen shows it and has its own fallback per code (section 9.4).

| Status and code | Route | Message (server) |
|---|---|---|
| 401 `unauthorized` | portfolio, open, close | the standard answer; screen: "Sign in to trade on the Island Exchange." |
| 404 `feature_off` | portfolio, open, close | "The Island Exchange is not open yet." |
| 404 `no_such_company` | open | "There is no company with that id." |
| 404 `no_such_position` | close | "You have no position with that id." |
| 409 `already_applied` | open, close | "This was already done." (treat as done, refresh) |
| 409 `market_closed` | open, close | "Apple trades in New York, which is closed now (outside its hours). It opens again on Friday 6 November at 14:30 Lisbon time." (holiday: "closed for Thanksgiving Day"; after the calendar: "Its opening hours after 31 December 2026 are not known yet.") |
| 409 `prices_stale` | open, close | "The price of Apple is not up to date right now, so trading is paused. Try again in a moment." |
| 409 `company_unavailable` | open, close | "Apple cannot be traded right now: its prices are not connected." |
| 409 `company_delisted` | open | "Greyfathom Salvage was delisted after the Relighting. You can still close your positions in it." |
| 409 `daily_stake_cap` | open | "You can put at most 2,000 coins into new positions per game day (from 08:00 Lisbon time). You can still use 380 coins today." |
| 409 `too_many_positions` | open | "You can have at most 20 open positions. Close one first." |
| 409 `insufficient_funds` | open | the standard answer; screen: "You need 102 coins for this stake and its fee." |
| 409 `position_closed` | close | "This position is already closed: you closed it at 12:06 Lisbon time." or "...: it reached its zero point at 10:02 Lisbon time and closed at zero." |
| 409 `wrong_price_mode` | close | "This position was opened on the live market, so it can only be closed there." (or "...on the demo recording, so it can only be closed in demo mode.") |
| 422 `validation_error` | all | the standard answer |
| 422 `stake_too_small` / `stake_too_big` | open | "A position needs a stake of at least 10 coins." / "A position can have a stake of at most 500 coins." |
| 422 `invalid_transaction` | open, close | the wallet's answer (a server bug) |
| 429 `too_many_requests` | open, close | "You are trading very fast. Wait a few seconds, then try again." with `Retry-After` |
| 502 `database_error` | all with a database | the standard answer (also when the database answers `bad_trade` or a refusal the server does not know) |
| 503 `database_unavailable` | open, close | "The database did not answer in time. Your trade may or may not have gone through: check your positions before you try again." |
| 503 `database_not_configured` | portfolio, open, close | the standard answer (a laptop without Supabase) |
| 503 `market_unavailable` | all four | "The Island Exchange is not available right now." |

Gone from v1: `market_halted`, `holding_time`, `not_enough_units`, `daily_buy_cap`, `trade_too_small`, `trade_too_big`, and the board's `503 source_unavailable`.

### 8.6 `docs/INTERFACES.md` (market text)

- **Section 2:** rewrite "The Island Exchange (package L4)" with the four routes and the examples above.
- **Section 1:** update the Exchange codes in the status-code table.
- **Section 4:** the L4 tables (`exchange_positions`, `exchange_events`, three functions).
- **Section 5:** the reasons (13).
- **Section 9:** the L4 row (built: routes, tables, reasons, settings `STOCK_API_PROVIDER` and `STOCK_API_KEY`, content files, flag `market`), and the market part of "Rules for the live data features" (real prices, positions, Binance, the stock source and its display condition, calendars, demo mode).
- **The C6 seam:** `store.has_open_rising_position(admin, player_id, "greyfathom-salvage")` is what S3 calls for "holds a Greyfathom share" (R22).

## 9. The screen

### 9.1 Files (each under 150 lines, plain names, a header comment)

| File | Job |
|---|---|
| `frontend/src/screens/market/index.js` | `createMarketEntry(ctx)`: picks the adapter (the fake only in DEV with `?market=local`, else the HTTP one), lazy-loads the panel. The only file that imports `http.js` or `fake.js`. |
| `panel.js` | `createMarketPanel({container, adapter, resetInput, focusGame, openShareholderRegister})`: the kit modal (`createModal`), two kit tabs ("Prices", "Your positions"), polling, focus. No fetch. |
| `board-view.js` | the company cards |
| `open-form.js` | side, stake, the 10x note, fee, zero point, confirm |
| `positions-view.js` | open positions with live profit and loss and close buttons; recently closed |
| `view-models.js` | pure: `boardRows(board)`, `openPreview(row, side, choice, rules)`, `positionRows(portfolio)`; only server numbers |
| `words.js` | pure: plain words for every status, reason and error code |
| `format.js` | pure: prices with `priceDecimals` and currency, coins, times in the player's time zone |
| `http.js` | the HTTP mapping: the only file with `fetch` |
| `fake.js`, `fixtures.js` | the local fake and its canned answers (the shapes of section 8) |
| `market.css` | layout, 375 px, reduced motion |
| `README.md` | what the panel does, the adapter contract, the fake, the accessibility checklist, how to test |

### 9.2 The adapter contract

```js
// createMarketHttpAdapter({ fetchImpl, getToken, makeUid, timeoutMs })
// defaults: fetchImpl = fetch, getToken = () => null, makeUid = () => crypto.randomUUID(), timeoutMs = 10000
const adapter = createMarketHttpAdapter({ getToken });
await adapter.board();                                   // GET /api/market
await adapter.portfolio();                               // GET /api/market/portfolio (Bearer token)
await adapter.open({ companyId, side, stake }, { uid }); // POST /api/market/open
await adapter.close({ positionId }, { uid });            // POST /api/market/close
// every call resolves, never throws:
// { ok: true, data } or { ok: false, code, message, status, retryAfterSeconds }
```

- **One `uid` per click.** "Send again" after an unknown outcome reuses it, so a repeat answers `already_applied` instead of trading twice.
- **Unknown outcome:** a network failure, a timeout (10 s) or a 503 on open or close becomes `code: "outcome_unknown"`. The panel then refreshes the portfolio and offers "Check again" and "Send again".
- **429** gives `retryAfterSeconds` from `Retry-After`.
- **No token:** no `Authorization` header, and the 401 shows "Sign in to trade". The game has no sign-in until A2, so the board works and trading waits for it.
- **The fake** has the same surface and answers from `fixtures.js` (scenarios: mixed statuses, demo, every refusal). It has no fetch and no game rules: an accepted open adds a canned position built from the board's own `zeroPrices` and `stakeChoices`.

### 9.3 What the panel shows

**Prices tab.** A card per company:

- name and `follows` ("Saltreach Harbor Trust, follows Bitcoin");
- the real price with its currency ("76,159.21 USDT");
- the status in words with its time ("Open around the clock", "Closed, opens 14:30", "Price source not answering; last price 12:05; trading paused", "No price yet");
- "Open a position" when `canOpen`; otherwise the reason as text, never a silent disabled button.

On top of the tab: the demo label when `demo`, the "trading opens soon" note when `tradingEnabled` is false, the simulation note, and all credits with their links.

**Open form** (inside the card):

- side: "Rising: you gain when the price goes up" / "Falling: you gain when the price goes down";
- stake choices from `rules.stakeChoices` ("100 coins + 2 fee");
- the 10x note: "10x: every 1 % the price moves changes your position by 10 % of your stake. If the price reaches the zero point (10 % against you), the position closes by itself at zero.";
- "Zero point: 68,543.29 USDT (estimate; set by the price at the moment you open)";
- "You can lose at most 102 coins";
- confirm button: "Open rising position for 102 coins".

After success it shows the server's entry price and zero point.

**Your positions tab:**

- the player's coins;
- per open position: company, side, stake, entry price, zero point, price now (or the last price with its status), value, and profit in coins and percent (the words "up" or "down", not colour alone);
- "If you close now: you receive 113 coins", then "Close position", then a confirm "Close and receive about 113 coins?" with "Yes, close it" / "Keep it";
- recently closed: "Closed by you: +113 coins" or "Closed at zero: the price reached 2.6400";
- "Staked today: 100 of 2,000 coins" and "Open positions: 1 of 20".

**Other behaviour:**

- **Zero closes:** when a position the panel showed as open comes back zeroed, the panel says once: "Your falling position in Pier Post Courier reached its zero point and closed at zero."
- **Shareholder register:** a quiet button that closes the panel and calls `openShareholderRegister()`, so card C6 stays reachable at `market_hall`.
- **Polling:** the board every 30 s, the portfolio every 15 s while its tab is shown. Polling pauses while the page is hidden, runs at once after each action and stops when the panel closes. A failed poll keeps the last view with "Could not refresh (last update 12:05)".
- **Zero points** are shown with `priceDecimals`, rounded toward the entry price (rising up, falling down). So a shown zero point is never passed without the position closing.

### 9.4 Plain words (`words.js`)

| Code | Words |
|---|---|
| status `open` | island: "Open around the clock"; stock: "Open until 16:30" (from `closesAt`, local time) |
| `closed` + `outside_hours` / `weekend` / `holiday` / `no_calendar` | "Closed, opens 14:30" / "Closed for the weekend, opens Monday 14:30" / "Closed for Thanksgiving Day, opens Friday 14:30" / "Closed: opening hours after 31 December are not known yet" |
| `stale` + `source_away` / `waiting_first_price` / `quote_old` | "Price source not answering. Last price 12:05. Trading paused." / "Waiting for the first price of the day." / "Waiting for a fresh price." |
| `unavailable` + `no_price` / `source_off` / `not_in_recording` | "No price yet." / "Prices not connected yet." / "Not part of the demo recording." |
| `delisted` | "Delisted after the Relighting: you can only close positions." |
| demo label | "Demo recording: prices from 4 November 2026 (Binance Vision), played back. Trades here use your real coins." |
| `outcome_unknown` | "We could not confirm this. Check your positions before you try again." |
| unknown code | "Something went wrong. Please try again." |

Every error code of section 8.5 has a fallback line here; a test checks the list is complete.

### 9.5 Keyboard, screen reader, reduced motion, 375 px

- **Keyboard:**
  - the kit modal traps focus, Escape closes it, and focus returns to the game;
  - the kit tabs use arrow keys, Home and End;
  - side and stake are native radio groups in `fieldset` and `legend`;
  - every action is a real `button`;
  - after an action, focus moves to the result line.
- **Screen reader:**
  - the dialog is labelled "Island Exchange";
  - each card has a heading with the company name;
  - price and status are words in a definition list;
  - buttons name the company ("Open a position in Apple", "Close your rising position in Saltreach Harbor Trust");
  - one `role="status"` line announces results and refusals; polling never announces.
- **Reduced motion:** no ticker, flash or slide. Follow `reducedMotion()` from `settings/preferences.js` (it sets `data-reduced-motion`) and `prefers-reduced-motion`.
- **375 px:** one column of cards and no horizontal scroll. Text is at least 14 px and body text 16 px (the G6 readability rule). Touch targets are at least 44 px, and the modal scrolls inside the viewport.

### 9.6 The hook (`frontend/src/game.js`, the only change outside `screens/market/`)

```js
let marketUi = null; // made on the first visit to the market hall
async function openMarket() {
  try {
    if (!marketUi) {
      const { createMarketEntry } = await import('./screens/market/index.js');
      marketUi = createMarketEntry({ container, resetInput: input.reset,
        focusGame: () => graphics.renderer.domElement.focus(),
        openShareholderRegister: () => caseUi.open('search', { spot: 'market_hall' }) });
    }
    marketUi.open();
  } catch { hud.message('The Island Exchange could not open. Try again.'); }
}
const stopListening = on('interact', event => {
  hud.notify(event.id);
  if (intro.active) return;
  if (event.id === 'market_hall') { openMarket(); return; }
  caseUi.interact(event);
});
```

Two more small edits in the same file:

- add `|| marketUi?.active` next to each existing `caseUi.active` check (the world's `isBlocked`, `deviceActions.isPlaying`, the loop's input gate, `touch.update`);
- call `marketUi?.dispose()` in `dispose()`.

`case-spots.js` and the case adapter are not touched.

## 10. The content linter (`backend/tools/lint_content.py`)

- **Standard library only** (`argparse`, `ast`, `json`, `pathlib`, `re`, `sys`, `datetime`, `zoneinfo`). It never imports `server` or FastAPI.
- **Run:** `cd backend && uv run python tools/lint_content.py` (or plain `python3`).
- **Options:** `--root` (default `backend/content`), `--today YYYY-MM-DD` (for tests).
- **Output:** one line per finding, `ERROR <path>[:line:col] <where>: <message>` or `WARNING ...`, then a summary such as `Content check: 0 errors, 1 warning, 17 files.`
- **Exit codes:** 0 without errors, 1 with errors, 2 when the tool itself cannot run (bad arguments, missing root).
- **Contract:** the header comment lists every check; that docstring is the home of the linter's contract.

| # | Check | Rule |
|---|---|---|
| L1 | JSON parses | every `.json` under the root is UTF-8 JSON; duplicate keys are an error (`object_pairs_hook`), `NaN` and `Infinity` too; the message gives line and column |
| L2 | No em or en dashes | no U+2014 or U+2013 in any `.json` or `.md` under the root, with line and column |
| L3 | Required fields | known files have a schema: `story.json` (`title`, `start`, `items`, `scenes`; scenes `title` and `text`; actions `id`, `label`, `message`), `market/companies.json` (section 4.1), `market/calendars.json` (section 4.5), `market/replay.json` (`credit`, `licence`, `licenceUrl` with `https://`, `candles`, `candleSeconds`, `closes`), `secret/case.json` (L8). Weather files are saved vendor answers: parse only. Any other `.json`: a warning "no schema yet". |
| L4 | Unique and existing ids | story: `start` and every `goto` name a scene; every `take`, `has` and `missing` names an item; every flag in `flags` or `not_flags` is set by some action; action ids unique. Companies: ids and tickers unique, Binance pairs unique, every stock market in `calendars.json`, at most 20, only Greyfathom may carry `delistAtRelighting`. Calendars: market ids unique, dates inside `validFrom` to `validTo`, no date twice, no closed day that is also a short day, a short-day close after `opens` and before `closes`, a weekend date is a warning, `utcOffset` matches `timeZone` on every day of the window (skipped with a note without tz data). Replay: `closes` covers every island pair with exactly `candles` positive numbers. |
| L5 | No real personal names in game data | person fields (`speaker`, `character`, `person`, `npc`, `owner`, `author`, `captain`, and `name` inside `partners`, `suspects` or `characters`) must hold a title (a word from the linter's list: Captain, Keeper, Harbor, Master, Clerk, Commander, Foreman, Fisherman, Coastguard, Doorman, Dockhand, Ferry, Stranger, Informant) or an allowed name (`Elena Vos`, `Elena`: D013); anything else is an error ("characters have titles, not personal names"). Emails and `@handles` anywhere are errors. Stock company names in `companies.json` are real companies on purpose and exempt. |
| L6 | Nothing secret in the public allow-list | read `PUBLIC_CONTENT` from `backend/server/routes/content.py` with `ast` (no import). Each value: a plain file name (no `/`, `\`, `..`, no leading dot), the file exists, it is not in `secret/`, its name does not contain `secret`, `case`, `solution` or `answer`, and its text holds no secret-looking string (`sb_secret_`, a JWT `eyJ...`, `-----BEGIN`, `SECRET=`, `SERVICE_ROLE`). The same secret patterns are an error in any content file. |
| L7 | The calendar is still valid | a warning when `validTo` is less than 14 days after `--today` |
| L8 | The case rules, when `secret/case.json` exists | `cards` (exactly 8, ids `C1` to `C8`, unique), `deductions` (exactly 4, `D1` to `D4`, each naming two different existing cards, every card in exactly one deduction), `suspects` (unique ids), `culprit` (a known suspect), `routes` (unique ids, each `cardId` exists, whole-coin prices and minutes of 0 or more). Spoiler rule: no text of the case file longer than 20 characters appears in any public file (L6). Without the file: one note "No case file yet: case rules skipped." S3 owns the case format and updates L8 with it. |

## 11. D017 (replacement text for `docs/DECISIONS.md`)

The entry keeps its number and title and replaces its body. The log's rule says to keep the original rationale when superseding, so the v1 reasoning stays as a short history paragraph with a pointer to git.

> ## D017 · Island Exchange rules · 2026-11-05
>
> **Status:** Decided by Nils on 5 Nov 2026 (his answers to the Exchange questions, items 1 to 7; item 2c, 10x positions, replaces the x100 price amplification of items 1 and 2a). The points marked "chosen here" are defaults Claude took for the rework and told Nils; they stand unless he objects. This version replaces v1 (see "History"), which was merged but never went live: its migration was never applied.
>
> **Decision:**
> 1. **Real prices, 1:1.** Seven invented island companies follow seven real instruments at their real Binance prices (BTC, ETH, SOL, XRP, BNB, EUR/USD as EURUSDT, gold as PAXG; around the clock; no key). Real stock companies, shown with their real names, follow their real share prices through a stock-price API with a free key that Nils creates (agents never sign up), chosen by the settings `STOCK_API_PROVIDER` and `STOCK_API_KEY` and off until the key exists. Chosen here, from the research memo of 5 Nov: Finnhub for five US companies, switched on only once Finnhub has agreed in writing that the prices may be shown. No floor, no ceiling, no pauses.
> 2. **Every investment is a 10x position,** rising or falling, with a stake of coins. Each 1 % the price moves for the position adds 10 % of the stake, each 1 % against takes 10 % away.
> 3. **Closed at zero.** A position whose stake is used up (price at 90 % of the entry for a rising position, 110 % for a falling one) closes automatically at zero; a jump past that point also closes it at zero. A player never loses more than the stake and the opening fee and never owes coins.
> 4. **Market hours.** A stock trades only while its market is open (New York, Euronext or Xetra, from a calendar file with the holidays from 6 Nov to 31 Dec 2026). While its market is closed or a price source is away, a company shows its last price with a label and cannot be traded, and its positions are neither closed nor used up until fresh prices arrive. Island companies never close.
> 5. **Demo mode** plays the recorded Binance Vision day, clearly labelled, and trading on it is allowed; those trades change players' real coins, and the recording is public. Chosen here: stocks are not part of it.
> 6. **No price protection.** A trade goes through at the server price of that moment.
> 7. **Brakes.** A trade uses a price at most 5 seconds old (fetched fresh if older); a player makes at most 10 trades in 30 seconds.
> 8. **Fee:** 2 % of the stake, rounded up, at opening and again at closing; 1 % after the Relighting. The closing fee comes out of the value and is never more than it.
> 9. **Limits:** at most 500 coins per position and 2,000 coins of new stakes per game day (from 08:00 Lisbon time). Chosen here: at least 10 coins per position, at most 20 open positions.
> 10. **Positions stay open across days.** No minimum holding time.
> 11. **Chosen here:** the automatic close runs whenever the server looks at prices (every board look, every trade, every portfolio look) and uses only prices it fetched; positions opened on live prices close only on live prices, recording positions only on the recording; after the Relighting Greyfathom Salvage takes no new positions; an open rising position in Greyfathom Salvage is the "Greyfathom share" of card C6.
> 12. **Database:** migration `20261106090000_exchange_leverage.sql` removes the v1 Exchange tables and functions and adds `exchange_positions`, `exchange_events`, the reasons `market_stake` and `market_payout` (v1's `market_fee` is reused; `market_buy` and `market_sell` stay unused, because a reason is never removed) and three server-only functions that move the coins and change the positions in one step.
>
> **Why:** Nils wants real companies and real prices, and investments that can end at zero within a class: at 10x, a real move of 1 % is 10 % of the stake, and a real move of 10 % against a position ends it. Real prices need no amplification rule, so nothing can drift away from reality or sink toward one cent (the v1 problems). A stake can be lost but nothing more, so no balance goes below zero and nobody owes coins. One shared server price, fresh for trades, and no trading on closed or stale companies stop players from trading on prices they know are out of date.
>
> **Trade-offs:**
> - Real prices move slowly: in a 90-minute class crypto often moves under 1 %, so a position moves by a few percent to about 10 % of its stake; on a volatile day a position can end at zero.
> - The automatic close sees only prices the server fetched; a dip past the zero point between two looks is missed (in the player's favour). No timer is available (Vercel Cron breaks our deploys while we use Services, GitHub Actions is too slow and limited, a database timer would have to fetch prices and hold the key).
> - No price protection: a trade can get another price than the screen showed (the board may be 30 s old).
> - Prices up to 5 s old leave a fast player who watches the live market a small edge; the 2 % fee each way makes it rarely worth it.
> - Real prices are shown as they are, so display rights matter: Binance's terms do not say whether a class game may show its prices; Finnhub's free plan allows it only with written approval; no free source covers European shares.
> - At the 11:00 class the US stocks are closed; only the island companies trade.
> - Stocks can open far from their last close, which closes rising or falling positions at zero at the open.
> - Each server instance holds its own prices in memory, so a fresh instance during an outage shows "no price yet".
> - Demo-mode trades change real coins on a public recording (Nils accepted it).
>
> **Alternatives:** amplified prices with a floor, ceiling and pauses (v1); x100 that never reaches zero with daily rounds (item 2a, replaced by 2c); 10x on top of x100 (would end a position after a 0.1 % move); price protection with a tolerance (item 5, not chosen); a timer for the automatic close (not available); per-symbol candles to catch dips (one request per symbol); a shared table of last prices (later).
>
> **History: v1 (superseded).** v1 amplified real moves (game price = base x (1 + multiplier x real change), multiplier 20 to 100), held prices between 25 % and 400 % of a start price, paused a company for 15 minutes after a 30 % move, re-based every day at 08:00 Lisbon, traded whole units with a 10-minute holding time, and limited purchases to 500 coins and 2,000 a day. An independent review found trades on old prices, a predictable public replay and prices sinking toward one cent; the fixes that still apply carry over (prices at most 5 s old for trades, no replay in live mode, the daily cap, 10 trades in 30 s). Its simulations showed that at x100 prices spent most of a multi-day run near their floor. The full v1 text is in git history (`docs/DECISIONS.md` at `3d59b6a`).
>
> **Agreed by, PR and impact:** Nils, 5 Nov 2026. Built on `feat/l4-exchange-v2`. Affects the Exchange panel, card C6 (the Greyfathom share), the Relighting (fees drop, Greyfathom delisted; L3 provides the switch), D014 (Nils owns the Finnhub key) and every package that adds wallet reasons (the list now has 13).

**The Relighting seam:**

- `MarketService` takes `relit_check` by keyword: an async function of the admin client.
- Its default is `never_relit`: always false, no database call.
- L3 replaces it with a read of its `world_state`.
- A failed read counts as "not relit" (2 %) and is logged.

## 12. Tests to write first

### 12.1 Server (pytest, no network: `conftest.py` refuses connections)

**`test_market_positions.py`** (pure):

- the zero point is 90 % (rising) and 110 % (falling) of the entry;
- a 1 % move changes the value by 10 % of the stake, on both sides;
- the value is rounded down;
- a position is used up exactly at the zero point, on both sides, and one tick inside the zero point it stays open;
- a gap past the zero point gives 0, never a negative value, on both sides;
- a falling position is worth at most 11 x the stake, and no value passes 1,000,000;
- every row of the table in 5.3 (parametrized);
- the fee is 2 % of the stake rounded up, 1 % after the Relighting (table 5.4);
- opening costs stake plus fee;
- the closing fee is never more than the value, and a close at zero pays nothing and charges no fee;
- a round trip at an unchanged price never makes coins (parametrized over the stake choices);
- stakes of 9 and 501 are refused with their own codes;
- the stake choices carry fee and total at the current rate;
- a price with 9 decimals is refused;
- `LEVERAGE` divides a power of ten.

**`test_market_game_day.py`:** the v1 day-start tests, moved (08:00 Lisbon, the day before at 07:59, summer time, the day the clocks change, no tz data falls back to UTC).

**`test_market_calendars.py`:**

- the real file covers 6 Nov to 31 Dec 2026;
- New York is open from 14:30 to 21:00 UTC on a normal November weekday, and closed at 14:29 and at 21:00;
- New York is closed on 26 Nov with the name "Thanksgiving Day", closes at 18:00 UTC on 27 Nov and 24 Dec, and is closed on 25 Dec;
- Euronext and Xetra are open 08:00 to 16:30 UTC;
- Xetra is closed on 24, 25 and 31 Dec;
- Euronext closes at 13:05 UTC on 24 and 31 Dec and is closed on 25 Dec;
- Saturdays and Sundays are closed;
- a closed market gives its reason and the next opening, which skips a weekend and a holiday;
- outside the window the reason is `no_calendar`, with no opening time;
- the offsets in the file match the time-zone database on every day of the window (skipped without tz data);
- an island company is always open;
- bad calendar files are refused with the market and field named.

**`test_market_companies.py`:**

- the seven island companies keep their ids, names, tickers and pairs;
- the five stocks follow `us`;
- a stock with an unknown market, a duplicate ticker, a bad `kind` or a missing field is refused with the field named;
- only Greyfathom carries `delistAtRelighting`;
- the file says island companies are invented and stocks are real;
- at most 20 companies.

**`test_market_feed.py`** (Binance tests kept from v1, adapted):

- one request for all pairs at the documented address, with no key and no secret header;
- prices up to 60 s old for the board and 5 s for a trade;
- a rush is one request;
- after a failure, the old prices come back marked stale with their time;
- Binance is asked again only 10 s after a failure;
- the replay never plays in live mode, and demo mode never calls Binance;
- a pair missing from a good answer leaves only that company without a fresh price.

**`test_market_stocks.py`:**

- off when the provider is empty; off with one warning when the key is empty;
- an unknown provider stops start-up with a clear message;
- with a fake provider, one refresh asks for all stock symbols together;
- a stock trade refreshes only its own symbol;
- the call budget stops at 25 calls a minute, and the trade gets `prices_stale`;
- after a failure or a 429 the source waits 30 s;
- no call while every market is closed and closing prices are held; a fresh instance asks once while closed;
- the key is sent in a header and never appears in a log line or an error (`caplog`);
- demo mode never builds the source.
- Finnhub adapter (once built): it reads `c` and `t` from an invented answer, treats `c` or `t` of 0 as no quote, keeps prices exact and refuses a time far in the future.

**`test_market_states.py`** (pure):

- island: open, stale (`source_away`), unavailable (`no_price`);
- stock: closed with the last price and `opensAt`; closed on a holiday with its name; stale `waiting_first_price` and `quote_old`; open when fresh; unavailable `source_off` and `not_in_recording`;
- a delisted company can close but not open;
- a trade needs a reading at most 5 s old;
- `canOpen` and `canClose` are false while the flag is off.

**`test_market_routes.py`**, the board:

- no sign-in needed;
- real prices 1:1 for the seven island companies;
- works while the flag is off, and then runs no sweep;
- cached 30 s; a failed board is not cached;
- no query parameters;
- rules with stake choices; zero prices per side for open companies only;
- per-company status and `priceAt`;
- stocks hidden while the source is off and in demo mode;
- a closed stock row with `opensAt`; stale rows when Binance fails;
- the sweep runs once per board build with only open companies, and a failed sweep does not fail the board;
- demo mode shows the label and the licence link.

**`test_market_routes.py`**, the portfolio:

- needs sign-in; 404 while the flag is off;
- values, profit, close fee, `wouldReceive` and `result` at the current price;
- a closed stock's position shows the last price with `canClose` false;
- at most 10 recently closed positions;
- the player's sweep runs first.

**`test_market_routes.py`**, open:

- needs sign-in; 404 while the flag is off;
- 422 for extra fields (a price or a player id in the body), a bad side, or a stake as text;
- 422 `stake_too_small` and `stake_too_big`;
- 429 after 10 trades in 30 s, with `Retry-After`;
- a repeated `actionUid` gets 409 `already_applied` first, even when the market has closed or the price is stale since;
- 404 for an unknown company;
- 409 `market_closed` with the opening time in words;
- 409 `prices_stale`, 409 `company_unavailable`, and 409 `company_delisted` after the Relighting;
- the database gets the verified player, the fresh price, the fee and the limits;
- the answer carries entry price, zero point, fee, `coinsChange` and coins;
- 409 `insufficient_funds`, `daily_stake_cap` (with the coins left in words) and `too_many_positions`;
- a database timeout is a 503 with an unknown outcome;
- the same click twice sends the same ref; two clicks send two refs;
- the trade asks for prices at most 5 s old, and the sweep runs before the open.

**`test_market_routes.py`**, close:

- needs sign-in;
- 404 `no_such_position` for another player's position;
- 409 `position_closed`, saying how it closed;
- 409 `market_closed` for a stock at night;
- 409 `prices_stale` and 409 `wrong_price_mode`;
- the value and fee sent equal the pure rules;
- a close past the zero point answers `closedAs` zeroed with 0 coins;
- 409 `already_applied`; a 503 with an unknown outcome;
- the sweep runs after the close.

**`test_market_store.py`:**

- the number and time readers (kept);
- a positions row and an events row are read exactly;
- the arguments of the three functions use the SQL parameter names;
- every refusal reason is understood, and an unknown one is a 502;
- `has_open_rising_position` asks only for open rising positions of that player and company.

**`test_wallet_matches_migration.py`**, Exchange section rewritten for the new file:

- Python's reasons end with the v1 three and then `market_stake`, `market_payout`;
- the new file inserts exactly those two, in that order;
- no migration changes or removes a reason;
- the parameters of the three functions equal what Python sends, with no defaults;
- `LEVERAGE` equals the table check;
- the allowed fee rates equal `FEE_BASIS_POINTS` and `RELIT_FEE_BASIS_POINTS`;
- refs with their prefixes fit 120 characters;
- the company id pattern is the same in both tables and fits every id in `companies.json`;
- RLS has select-only policies;
- `revoke all` comes before every grant and also covers the sequence;
- the functions are for the server only;
- the guard comes before the first drop, and the file drops every v1 Exchange table and function.

**Other server tests:**

- `test_wallet.py`: the expected list gains the two reasons.
- Settings: `STOCK_API_PROVIDER` is empty or a known name; `STOCK_API_KEY` is a `SecretStr` and prints as stars; `MARKET_MULTIPLIER` is no longer read.
- Demo mode: positions opened on the recording are stored with mode `replay`; a live server answers `wrong_price_mode` for them and the reverse; a sweep uses only prices of the positions' own mode.
- `test_market_limits.py` stays unchanged.

### 12.2 SQL on a private scratch Postgres 17 (the money races)

1. Apply foundation, v1 and the new file, then all three again. Both runs succeed, and the second changes nothing.
2. A plain Postgres needs a small prelude kept outside the repository: the roles `anon`, `authenticated` and `service_role`, an `auth.users` table and an `auth.uid()` that reads `request.jwt.claims`.
3. Never use the real project, and stop the server afterwards.

Then run each race with two sessions: `begin` in one, the second call in the other, then `commit`.

| # | Race | Expected |
|---|---|---|
| S1 | two opens of 400 by one player with 500 coins | the second waits for the wallet lock, then `insufficient_funds`; one position, balance 92 |
| S2 | the same ref twice at once | the second raises `already_applied`; one position, one pair of ledger rows |
| S3 | two opens that together pass the daily cap | the second is refused `daily_cap` |
| S4 | a sweep holds a position, then the player closes it | the close waits, then `position_closed` (`zeroed`) |
| S5 | the player's close holds the position, then a sweep runs | the sweep skips it (`closed: 0`); the close finishes |
| S6 | two sweeps at once over the same positions | each position zeroed once, one `zero` event each, no deadlock |
| S7 | the guard | with a row in a v1 `market_trades`, the file stops with `v1_market_data_present` and changes nothing |

Also run the manual plan X1 to X15 (section 7.8) on the scratch database, and the parse check (ENGINEERING.md 4.2, step 9).

### 12.3 Screen (Vitest, node environment)

There is no DOM library, so the logic lives in pure modules.

- **`frontend/tests/market/http.test.js`:** the board needs no token; the portfolio sends the Bearer token; no token sends no header; open posts the camelCase body with a fresh uid; "Send again" reuses the uid; a 409 maps to `{ok: false, code, message}`; a 429 gives `retryAfterSeconds`; a network error, a timeout and a 503 on open become `outcome_unknown`; nothing throws.
- **`view-models.test.js`:** card rows use the server's status and reason; the open preview takes fee and total from `stakeChoices` and the zero point from `zeroPrices`, with no arithmetic; positions show up and down in words; zeroed positions are labelled; the zero point rounds toward the entry.
- **`words.test.js`:** every status, reason and error code of section 8.5 has words; an unknown code gets the generic line.
- **`format.test.js`:** decimals and currency, coins with thousands separators, local times.
- **`fake.test.js`:** every adapter method answers in the shapes of section 8; the scenarios cover open, closed, stale, unavailable, demo and every refusal; the fake never calls fetch.
- **`boundary.test.js`:** only `http.js` contains `fetch(`; only `index.js` imports `http.js` or `fake.js`.
- **Browser checklist** in the README: keyboard-only open and close, screen-reader names, reduced motion, 375 px without horizontal scroll, focus back to the game, the C6 button. It stays manual this round: a `frontend/scripts/check-market.js` needs the controller's OK, and `package.json` stays untouched.

### 12.4 Linter (`backend/server/tests/test_lint_content.py`)

- The real `backend/content` passes with 0 errors.
- Each check fails on a small file in `tmp_path`:
  - bad JSON (with line and column), a duplicate key, `NaN`;
  - an em dash in JSON, an en dash in a README;
  - a missing required field;
  - a duplicate company id and ticker, an unknown market;
  - a calendar date outside the window, a short-day close after the regular close;
  - a `goto` to a missing scene, a flag nobody sets;
  - a personal name in a person field (the allowed name passes), an email;
  - a public name with a path, a secret file and a missing file;
  - a secret-looking key in content;
  - every case rule (8 cards, 4 deductions, pairs, culprit, route cards), and case text inside a public file.
- Without a case file, the linter prints the note.
- Exit codes are 0, 1 and 2.
- The linter imports only standard-library modules (checked against `sys.stdlib_module_names`).

## 13. The 23 Nov minimum

Core packages ship by M2 (Wed 18 Nov, freeze 18:00); submission is Mon 23 Nov.

**Must (by Wed 18):**

- **The migration**, reviewed by Opus and passing all tests, then applied by Claude and reported (Nils' rule of 5 Nov).
- **Server:**
  - the seven island companies at real Binance prices;
  - rising and falling 10x positions: open, close, and the automatic close at zero (board, trades, portfolio);
  - fees (2 %, and 1 % once L3 reports the Relighting);
  - stake limits, the daily cap and the 20 open positions;
  - both brakes;
  - demo mode on the labelled recording.
- **Stock source, switched off:** its interface, settings, call budget, calendars and states, and the Finnhub adapter tested with invented answers.
- **The panel:** board, open, close, positions with profit and loss, plain words, accessibility and 375 px, plus the hook with the C6 button.
- **The linter:** all checks; the case checks are tested on sample files.
- **Docs:** D017, INTERFACES, supabase/README, the content README, `.env.example`.

**Should:**

- Stocks switched on (`STOCK_API_PROVIDER=finnhub`) once Nils has the key **and** Finnhub's written OK, tested on a preview before the freeze.
- Invented practice prices for stocks in demo mode, labelled as invented, so a rehearsal can show stocks moving.
- An "other amount" stake field.
- The browser check script.

**Later:**

- a shared last-price table for fresh instances during outages;
- candles to catch dips between looks;
- a European source (paid);
- calendars after 31 Dec 2026;
- a longer position history.

Rough sizes: server about 2.5 days, screen about 1.5 days, linter about half a day. The screen is built against the fake and the JSON of section 8 while the server is built.

## 14. Done when

- [ ] `cd backend && uv run pytest -q` passes; `uv run ruff check .` reports nothing; `uv run ruff format --check` passes on every changed Python file.
- [ ] `cd backend && uv run --with pglast python -c "..."` (ENGINEERING.md 4.2, step 9) parses all three migrations.
- [ ] On a private scratch Postgres 17: foundation, v1 and the new file applied twice without error; S1 to S7 and X1 to X15 behave as written; the server is stopped afterwards.
- [ ] `cd backend && uv run python tools/lint_content.py` exits 0 on the real content.
- [ ] `cd frontend && npm install && npm test && npm run build` pass (the build includes the spoiler guard).
- [ ] The board answers with real prices on the laptop with a fake transport; no test or check touched the network, the real Supabase project or any live market source.
- [ ] No key, `.env` content or token in the diff, a log or the output; the secret scan of ENGINEERING.md section 6 finds nothing.
- [ ] Docs updated:
  - D017;
  - the INTERFACES market text;
  - supabase/README (matrix, counts, X1 to X15);
  - `backend/content/market/README.md`;
  - `.env.example`: `STOCK_API_PROVIDER` and `STOCK_API_KEY` added, `MARKET_MULTIPLIER` removed, and the demo-mode line says stocks are not in the recording.
- [ ] Nothing committed or pushed by a builder; the controller reviews and commits.
- [ ] A different human teammate reviews before a merge to `main` (CONTRIBUTING.md).

## 15. Open points

1. **Finnhub permission (Nils):**
   - create the free key;
   - put it only in Vercel as `STOCK_API_KEY` (Production; Preview only if previews may share the call limit);
   - record in D014 that he owns it;
   - send Finnhub a request from his own mailbox.

   The memo's draft says players never see real prices, which is no longer true. Corrected draft for Nils to send himself:

   > Hello, I am a student at Nova SBE in Lisbon. For our Introduction to Programming course we are building a free, non-commercial game with play money on a public website for our class this term. We would like to use your free quote endpoint for five US stocks (AAPL, NVDA, TSLA, KO, SPOT) during US market hours. Our server would stay well under your free limit of 60 calls a minute (about 2,000 calls a day), cache the answers, and show each stock's current price to our players next to a play-money investment game. Nothing is sold or resold and there are no real prizes. May we show these prices on the free plan, and which attribution line would you like? Thank you, Nils
2. **Calendar details to confirm:** Euronext's half-day closing time for 24 and 31 Dec 2026 (listed as "to be announced"; 14:05 Paris is assumed), and Deutsche Boerse's hours for 30 Dec 2026.
3. **Chosen-here defaults:** R15 to R24 need Nils' OK.
4. **Ownership:** `wallet.py`, `test_wallet.py` and `settings.py` (with its tests) must change but are not on the builders' lists.
5. **Seams:** S3 wires the C6 share rule to `has_open_rising_position`; L3 provides `relit_check`.
6. **Content:** the stock list (the memo's five; Tesla carries a person's surname) and the island name check (story rule 5).
7. **Binance display terms:** still unconfirmed for showing real prices in a class game (unchanged from v1; ask the teacher if unsure).

## 16. Sources checked on 5 Nov 2026

- NYSE holidays and early closes 2026: [nyse.com/markets/hours-calendars](https://www.nyse.com/markets/hours-calendars)
- Euronext 2026 holiday calendar (24 and 31 Dec half days, times to be announced; 25 Dec closed): [live.euronext.com/resources/trading-hours-holidays](https://live.euronext.com/resources/trading-hours-holidays)
- Xetra 2026 trading calendar (24, 25 and 31 Dec no trading; 09:00 to 17:30 CET): [cashmarket.deutsche-boerse.com](https://cashmarket.deutsche-boerse.com/cash-en/trading/trading-calendar-and-trading-hours)
- Twelve Data Basic (8 credits a minute, 800 a day, internal non-display): [twelvedata.com/pricing](https://twelvedata.com/pricing)
- Alpaca Basic (IEX, 200 calls a minute, US only) and the multi-symbol snapshots endpoint: [docs.alpaca.markets/docs/about-market-data-api](https://docs.alpaca.markets/docs/about-market-data-api), [docs.alpaca.markets/reference/stocksnapshots-1](https://docs.alpaca.markets/reference/stocksnapshots-1)
- Finnhub, the Alpaca terms and the other providers: the research workflow's memo and comparison of 5 Nov 2026 (`finnhub.io/pricing`, `finnhub.io/terms-of-service`, `alpaca.markets/support/redistribute-alpaca-api`), not re-checked here.

## process_notes

- **The research memo arrived during the work.** It was not in the journal on my first two checks. The spec follows its recommendation (Finnhub primary, Alpaca backup, five US companies, no free European source). Section 4.3 lists five places where the memo still assumed the v1 design. One of them is its Finnhub request text, which would now misstate what players see.
- **Worth logging for whichever skill or script plans these workflows:**
  - The computed brief asked for "wallet reasons for closes at zero". The wallet refuses 0-coin rows, so a close at zero can only be an event row.
  - The ownership list left out `wallet.py`, `test_wallet.py` and `settings.py`. Any change to wallet reasons or settings must touch them, and `test_wallet_matches_migration.py` enforces it.
- **What I did and did not touch:** I wrote no repository files, ran no repository tests, made no commits and wrote nothing under the task-observer workspace. I checked this spec for em and en dashes in a scratch copy at `/private/tmp/claude-501/-Users-nilslenke-Desktop-02-University-Nova-Classes-Intro-to-Programming-Group-Project/569201b0-f556-4177-bafd-264473fb70ab/scratchpad/L4-island-exchange-v2-spec.md`.
- **Checked on the web during this step:** the NYSE, Euronext and Xetra calendars for Nov and Dec 2026, Twelve Data's free licence, and Alpaca's free plan and snapshots endpoint (section 16). The Finnhub facts come from the memo only.
