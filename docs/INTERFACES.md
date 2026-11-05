# Interfaces: contracts v0

> **What this file is:** the shared contracts of The Great Plot Twist on one page: how every API route behaves, the routes that exist now, the browser events, the database tables, the wallet, crews and seats, the realtime budget, the feature flags and the names that later packages reserve.
>
> **Who uses it:** every teammate and coding agent, before adding or calling a route, an event, a table or a flag. Read [ARCHITECTURE.md](ARCHITECTURE.md) first for the big picture.

**Status: contracts v0, a draft for review.** On Mon 9 Nov all four teammates review this page. The agreed version is frozen as decision D009 and becomes contracts v1. Until then every reserved name below is a proposal.

**This page sums up and points.** A contract that already has a home is written there, and the home wins if the two ever differ (see "Where contracts live" in [ENGINEERING.md](ENGINEERING.md#where-contracts-live)). A pull request that changes a home updates this page too.

| Contract | Its home |
|---|---|
| One route | The header comment and the Pydantic models of its file in `backend/server/routes/` |
| The error shape | `backend/server/errors.py` |
| Tables, rights and database functions | The migration in `supabase/migrations/` and [supabase/README.md](../supabase/README.md) |
| Wallet reasons | The table `wallet_reasons` (in the migration) and `WALLET_REASONS` in `backend/server/wallet.py` |
| Feature flags | `FLAG_NAMES` in `backend/server/flags.py` |
| Setting names | `backend/server/settings.py` and [.env.example](../.env.example) |
| Game content files (the story) | The format in [backend/content/README.md](../backend/content/README.md), and the list of public names in `backend/server/routes/content.py` |
| Browser events and hooks | `frontend/GRAPHICS.md`, written by the graphics package (G1) |

**Changing a contract.** Until the freeze, change this page in your pull request. After the freeze, agree the change in an issue first, then change the home and this page in the same pull request, and record the outcome in the [decision log](DECISIONS.md). If the team has not agreed, keep the current contract ([CONTRIBUTING.md](../CONTRIBUTING.md)).

**Contents**

1. [API conventions](#1-api-conventions)
2. [Routes that exist now](#2-routes-that-exist-now)
3. [Browser contracts](#3-browser-contracts)
4. [Database tables](#4-database-tables)
5. [The wallet](#5-the-wallet)
6. [Crews and seats](#6-crews-and-seats)
7. [Realtime budget](#7-realtime-budget)
8. [Feature flags](#8-feature-flags)
9. [Reserved interfaces](#9-reserved-interfaces)
10. [The shared mystery](#10-the-shared-mystery)
11. [Open questions for Mon 9](#11-open-questions-for-mon-9)

## 1. API conventions

- **One address.** Every route starts with `/api`. On Vercel the game and the API share one address: `vercel.json` sends every `/api/...` request to the backend unchanged, so each route carries the `/api` prefix itself. On your laptop the API runs at `http://127.0.0.1:8000`.
- **JSON in, JSON out.** Field names in JSON are camelCase, as `demoMode` in `/api/config` already is. Python names and database columns stay snake_case. Names that are data, such as the flag names inside `flags`, keep their own spelling. Content files are data too: `GET /api/content/{name}` sends a file as it is, so `story.json` keeps its snake_case keys such as `hide_when_blocked` and `not_flags`.
- **Sign-in.** A route for signed-in players reads the header `Authorization: Bearer <token>`. The token is the one Supabase gives the browser after the GitHub sign-in. The server asks Supabase whose token it is and remembers a good answer for 60 seconds. In code, a route asks for the player by writing `player: PlayerDep` (`backend/server/auth.py`). The player id always comes from this check, never from the request body.
- **One error shape.** Every failure answers with the same JSON. The `message` never holds a stack trace, a key or the database's own error text.

  ```json
  {"error": {"code": "not_found", "message": "Not Found"}}
  ```

  `code` is a short word the browser can check, and `message` is plain English for people. To refuse a request, a route raises `ApiError(status, code, message)` from `backend/server/errors.py`.
- **Safe repeats.** Every request that changes something carries an id that stays the same when the request is sent again: the `ref` of a wallet call, or an `actionUid` (or a named id such as `orderId` or `stakeId`) in the body. The browser makes the id once per click. Coins a player receives use an id from the server's own records instead, for example the id of the solved clue. A repeat changes nothing: for the wallet the database refuses a second row with the same player, reason and `ref`, and the answer is `409 already_applied`. An id that becomes a wallet `ref` is at most 120 characters.
- **Outside data says how fresh it is.** An answer built from an outside service also carries `source` (`live`, `cache`, `stale` or `fallback`, see `backend/server/adapters/base.py`) and `fetchedAt`, a UTC time such as `"2026-11-05T12:05:00Z"`.
- **Lists are short.** Every list has a maximum page size. No route returns a whole table.

### What the status codes mean

| Status | Code | Meaning | What the browser does |
|---|---|---|---|
| 200 | | It worked. | Show the result. |
| 401 | `unauthorized` | No sign-in token, a malformed one, or one Supabase refused (wrong or expired). The sign-in code exchange also answers 401 to a code Supabase refuses, and the keep-alive to a missing or wrong secret. The answer carries the header `WWW-Authenticate: Bearer`. | Ask the player to sign in again. |
| 403 | `forbidden` | Signed in, but not allowed. Planned for presenter-only routes (`require_host`, package A2). No route uses it yet. | Say "not allowed". Do not retry. |
| 404 | `not_found`, or a specific code | No such route, or no such thing, for example `ApiError(404, "no_such_island", "That island does not exist.")`. `GET /api/me` answers `player_not_set_up` for a signed-in player who has no profile or wallet row. `feature_off` means the feature flag of the route is off (the Island Exchange uses it; section 11, question 3, is still open). `no_such_company` is an unknown Exchange company. | Show the message. |
| 405 | `method_not_allowed` | The wrong method, for example `POST` to a `GET` route. | Fix the caller: it is a bug. |
| 409 | `insufficient_funds`, `already_applied` | A conflict with what is saved: not enough coins, or this exact action was done before and nothing changed. Package A2 plans a 409 for a stale save version too. The Island Exchange adds `market_halted`, `holding_time`, `not_enough_units`, `daily_buy_cap` and `prices_stale` (the real prices are old, so trading is paused; nothing changed). | Show the message. After `already_applied`, treat the action as done. |
| 422 | `validation_error`, `invalid_transaction` | The request does not fit: a word where a number belongs, a missing field, or a coin change the wallet rules refuse. Nothing changed. The Island Exchange adds `trade_too_small` and `trade_too_big` (a purchase over 500 coins; a sale has no upper limit). | Show the message. Do not resend it unchanged. |
| 429 | `too_many_requests` | Too many requests in a short time, for example during a cooldown. The Island Exchange uses it for trades (more than 10 in 30 seconds by one player); the `Retry-After` header says how many seconds to wait. | Wait, then try again. |
| 500 | `server_error` | A bug on our side. The details go to the server log only. | Say "something went wrong". |
| 502 | `database_error` | The database refused the call or answered strangely. | Say "something went wrong". |
| 503 | `auth_not_configured`, `auth_unavailable`, `database_not_configured`, `database_unavailable`, `source_unavailable`, `not_configured`, `market_unavailable` | The server, or a service it needs, is not set up or not reachable right now. (`market_unavailable`: the Island Exchange data files could not be read when the server started; the rest of the API works. `source_unavailable` on `GET /api/market`: Binance has not answered once since this server instance started, so there are no prices to show.) | Try again later. For money the outcome is unknown: the coins may have moved before the call timed out, so look the `ref` up before you retry. |

## 2. Routes that exist now

Seven routes exist, plus the three routes of the Island Exchange (below) and FastAPI's list of routes. Start the API on your laptop ([ENGINEERING.md, section 3](ENGINEERING.md#3-commands)) to try them. The example answers below come from the real code; `health` and `config` are shown as they answer with an empty `.env`, the story in `content` is shortened, and `weather` is shown as it answered from the real Open-Meteo on 5 Nov 2026.

### GET /api/health

Is the API alive? Anyone may call it: teammates, uptime checks and the game.

```text
GET /api/health

200 OK
{"status": "ok", "version": "0.1.0", "env": "local"}
```

`version` is the API version in `backend/server/__init__.py`. `env` is `local`, `preview` or `production`, from the setting `APP_ENV`.

### GET /api/config

How this server is set up: the environment, demo mode, which feature flags are on and how to sign in. Anyone may call it, and it holds no secret. The game reads it at start-up to show or hide features, and the sign-in check page reads the Supabase address from it.

```text
GET /api/config

200 OK
{"env": "local", "demoMode": false, "flags": {"market": false, "predictions": false, "sports": false, "arena": false, "raid": false, "live_presence": false, "companion_llm": false}, "auth": {"provider": "github", "supabaseUrl": ""}}
```

`auth.provider` is always `github`. `auth.supabaseUrl` is the address of our Supabase project, the value of the setting `SUPABASE_URL`. It is public on purpose: the browser needs it to start the GitHub sign-in, and it shows in the address bar during sign-in anyway. It is an empty string while `SUPABASE_URL` is not set, which is why the example above (an empty `.env`) shows `""`. No key is ever in this answer: not the secret key, not the publishable key and not the keep-alive secret (`CRON_SECRET`).

### GET /api/me

Who am I in the game? For signed-in players only. It answers with the caller's own display name, coins and crews. The server reads them with its secret key and a filter on the verified player id (never an id from the request), so the answer can never hold another player's data. Its first user is the sign-in check page, `/auth-check.html` (a plain file in `frontend/public/`: a team check page, not the game, that signs in with GitHub and prints one line from this route).

```text
GET /api/me
Authorization: Bearer <token>

200 OK
Cache-Control: private, no-store
{"id": "3fa85f64-5717-4562-b3fc-2c963f66afa6", "displayName": "Captain-3fa85f", "coins": 0, "crews": []}
```

| Field | Meaning |
|---|---|
| `id` | The player's id, from the verified sign-in |
| `displayName` | `profiles.display_name`. Never the GitHub login name or e-mail address. |
| `coins` | `wallets.balance`. A new wallet holds 0, which is a normal answer. |
| `crews` | The crews the player sits in, newest seat first, at most 20. Each one is `{"id", "mode", "status", "seatNo"}`: the crew id, `solo` or `crew`, `forming`, `active` or `finished`, and the player's own seat number (1 to 4). Empty for a player in no crew. |

| Case | Answer |
|---|---|
| A good token, and the profile and wallet rows are found | `200` as above |
| No `Authorization` header, a malformed one, or a token Supabase refuses | `401 unauthorized`, with `WWW-Authenticate: Bearer` |
| Login is not set up here, or cannot be reached | `503 auth_not_configured` or `503 auth_unavailable` |
| A good token, but the player has no profile or wallet row: the account was made before the migration was applied, so the sign-up trigger never ran for it | `404 player_not_set_up`. A teammate deletes the user under Authentication > Users and the player signs in again ([supabase/README.md](../supabase/README.md#if-someone-signed-in-before-you-ran-the-migration)). |
| `SUPABASE_URL` or `SUPABASE_SECRET_KEY` is not set | `503 database_not_configured` |
| The database cannot be reached | `503 database_unavailable` |
| The database refuses a read, or answers with something we cannot read | `502 database_error` |

The answer is never cached. The player id stays out of the server's logs. Package A2 extends this route ([section 9](#9-reserved-interfaces)).

### POST /api/auth/exchange

Swaps a one-time sign-in code for a login token. Anyone may call it, because this is how somebody signs in: the proof is the pair of one-time code and secret. Its only user is the sign-in check page. The page signs in with Supabase's PKCE flow, which sends the browser back with a one-time code in the address (`?code=...`) and no token. The page gives that code, and the secret it made before it left for GitHub, to this route. The server swaps them with Supabase and answers with the access token. The refresh token and GitHub's own token stay inside the server, so the browser never holds anything that lasts. The page then calls `GET /api/me` with the access token.

```text
POST /api/auth/exchange
Content-Type: application/json
{"code": "6f1c0c2e-9a52-4b8e-8d3a-0a7c3f1d2b44", "codeVerifier": "<64 characters the page made>"}

200 OK
Cache-Control: private, no-store
{"accessToken": "<login token>"}
```

| Field | Meaning |
|---|---|
| `code` | The one-time code from the address. Supabase accepts it once, within 5 minutes. 1 to 200 characters. |
| `codeVerifier` | The secret the page made before it left for GitHub (PKCE calls it the code verifier). 43 to 128 characters. |
| `accessToken` | The login token for `Authorization: Bearer`. It stops working after a while (an hour by default in Supabase). |

| Case | Answer |
|---|---|
| A good code and the secret that belongs to it | `200` as above |
| Supabase refuses the code: used before, older than 5 minutes, unknown, or the secret does not fit it | `401 unauthorized`, with `WWW-Authenticate: Bearer`. Supabase's own text is never repeated. |
| A field is missing, is not text or has the wrong length | `422 validation_error`. Nothing was sent to Supabase. |
| Login is not set up here, or Supabase cannot be reached, is busy or answers strangely | `503 auth_not_configured` or `503 auth_unavailable` |

The code, the secret and the tokens stay out of the server's logs. Supabase counts requests per address, and every call through this route comes from Vercel's addresses, so a class that signs in together shares one budget. That is fine for a team check page. **The game's own sign-in (package A2) must use the PKCE flow too, never the older "implicit" flow.** The implicit flow puts the refresh token (it never expires on the free plan) and GitHub's token in the address, and the browser writes every address to its history before a page can remove it. A2 can do the exchange itself in the browser with Supabase's client library, and then this route is not needed: it is temporary and goes away with the check page.

### GET /api/content/{name}

Public game content that the browser needs in order to play. Anyone may call it, with no sign-in. Only the names on a fixed list in `backend/server/routes/content.py` exist. Today there is one:

| name | What it is |
|---|---|
| `intro-story` | The story of the intro game, *The Keeper's Last Log*: the file `backend/content/story.json`, unchanged |

```text
GET /api/content/intro-story

200 OK
Cache-Control: public, max-age=300
{"title": "The Keeper's Last Log", "start": "cottage", "items": {...}, "scenes": {...}}
```

The answer is the content file as it is, in the format described in [backend/content/README.md](../backend/content/README.md). Its keys are content data and keep their own spelling (snake_case, for example `hide_when_blocked`), which is an exception to the camelCase rule in section 1. Browsers may keep the answer for five minutes, so a changed story can take up to five minutes to reach a page that is already open. Nothing from `backend/content/secret/` is ever served.

| Case | Answer |
|---|---|
| A name on the list | `200` with the content file and the header `Cache-Control: public, max-age=300` |
| Any other name, including a file name such as `story.json` | `404 content_not_found` in the standard error shape, with no cache header |
| A name with a slash in it, such as a path | `404 not_found`, because no route matches. Nothing is looked up on disk. |

```text
GET /api/content/no-such-content

404 Not Found
{"error": {"code": "content_not_found", "message": "There is no public content with that name."}}
```

### GET /api/weather

The real weather of one place, ready for the game (package L1). Anyone may call it, and it holds no secret. It takes no input: the place comes from the settings `WEATHER_PLACE_NAME`, `WEATHER_LATITUDE` and `WEATHER_LONGITUDE` (default: Torshavn in the Faroe Islands, a proposal that the team may change at the kickoff), and a query string such as `?place=Paris` is ignored. The weather comes from [Open-Meteo](https://open-meteo.com/) through the cached source in `backend/server/weather/`, so one server instance calls Open-Meteo at most once per 10 minutes, however many players ask.

```text
GET /api/weather

200 OK
Cache-Control: public, max-age=300
{"cloudCover": 1.0, "rain": 0.0, "fog": 0.0, "wind": 0.2, "isDay": false, "summary": "Overcast", "place": "Torshavn, Faroe Islands", "source": "live", "fetchedAt": "2026-11-05T18:03:15Z", "attribution": "Weather data by Open-Meteo.com, adapted for the game"}
```

| Field | Meaning |
|---|---|
| `cloudCover`, `rain`, `fog`, `wind` | Each from 0 to 1, ready for `setWeather` ([section 3](#weather)). The rules that make them are in `backend/server/weather/mapping.py`: the cloud cover divided by 100; the higher of the weather code's rain and the measured precipitation (8 mm an hour is 1); the higher of the weather code's fog and the visibility (10 km or more is 0); the wind speed divided by 60 km/h. Snow shows as lighter rain, because the game has no snow yet. |
| `isDay` | `true` by day, `false` by night, at the place. |
| `summary` | The weather in plain words, for example `Light rain, windy`. |
| `place` | The name of the place the weather belongs to. |
| `source` | `live`, `cache`, `stale` or `fallback` ([section 1](#1-api-conventions)). |
| `fetchedAt` | When the numbers were fetched, in UTC. For `fallback` it is the time the answer was recorded. |
| `attribution` | The credit Open-Meteo asks for, with the note that the numbers were changed: `Weather data by Open-Meteo.com, adapted for the game`. Open-Meteo's CC BY 4.0 licence has three conditions, and the game must meet all of them next to the weather: (1) give the credit, as a link to `https://open-meteo.com/`; (2) link to the licence, with the name `CC BY 4.0` as a link to `https://creativecommons.org/licenses/by/4.0/`; (3) say that the data was changed, which the words "adapted for the game" do. The credit link alone is not enough. `weatherAttribution()` ([section 3](#weather)) gives the words and both addresses. |

| Case | Answer |
|---|---|
| Open-Meteo answers | `200`, `source` is `live`, or `cache` for the next 10 minutes |
| Open-Meteo is down, but an earlier answer exists | `200`, `source` is `stale`, with the time of that earlier answer |
| Open-Meteo is down from the start | `200`, `source` is `fallback`: one real answer recorded in `backend/content/weather/`, with its own place name and time |
| Demo mode (`DEMO_MODE=true`) | `200`, `source` is `fallback`; Open-Meteo is never called |
| Nothing at all: down, and the recorded file is missing or broken | `503 source_unavailable` |
| Any other method than `GET` | `405 method_not_allowed` |

Only a `200` carries `Cache-Control: public, max-age=300`, so a browser may reuse it for 5 minutes. The open question for Mon 9 about the default place is in [section 11](#11-open-questions-for-mon-9).

### GET /api/keepalive

Keeps the free Supabase project awake ([ARCHITECTURE.md](ARCHITECTURE.md#the-7-day-pause-and-the-keep-alive)). Only a caller that sends the keep-alive secret may use it. It reads one row from `profiles`, `wallet_reasons` and `crews`, stops at the first read that fails, and never answers with database text. What calls it once a day is an open decision for Nils (question 4 in [section 11](#11-open-questions-for-mon-9)), so nothing calls it yet. It is not Vercel Cron: a `crons` entry in `vercel.json` breaks our deploys while we use Vercel Services, so never add one. The header below is the one Vercel Cron would have sent. Any caller we choose sends the same header.

```text
GET /api/keepalive
Authorization: Bearer <CRON_SECRET>

200 OK
{"status": "ok", "reads": 3}
```

| Case | Answer |
|---|---|
| The right secret, and all three reads work | `200` with `{"status": "ok", "reads": 3}` |
| No header, or a wrong secret | `401 unauthorized`, with `WWW-Authenticate: Bearer` |
| `CRON_SECRET` is not set on this server. It is checked first, so an empty secret can never match. | `503 not_configured` |
| `SUPABASE_URL` or `SUPABASE_SECRET_KEY` is not set. Checked only after the secret was right. | `503 not_configured` |
| A read fails: the database is down, a table is missing or access is refused | `503 database_unavailable` |

### The Island Exchange (package L4)

Fictional island companies whose play-money prices follow real markets, amplified. The home of each route is the comment at the top of `backend/server/routes/market.py`; the rules are in `backend/server/market/` and are explained in [D017](DECISIONS.md#d016--island-exchange-rules--2026-11-05). Play money only: every answer of the board carries a line that says "simulation, play money".

| Route | Who | What it does |
|---|---|---|
| `GET /api/market` | anyone, and it works while the flag `market` is off | The price board: every company with its game price, how far the price is from its base (`movePercent`), whether it is paused (`status`, `haltedUntil`), where the real prices come from (`source`: `live`, `cache`, `stale` or `replay`) and when (`fetchedAt`), the numbers of the rules, the credit line (`attribution`) and, while the replay plays, the link to its licence (`licenceUrl`). `stale` means Binance is not answering: the prices are old and nobody can trade. `replay` only happens in demo mode. Cached for 30 seconds (`Cache-Control: public, max-age=30, s-maxage=30`), so it takes no query parameters (`422`). While the flag is off it only looks and saves nothing. |
| `GET /api/market/portfolio` | signed in, flag `market` on | The player's coins, positions (units, average price paid, price now, value, `sellableFrom`, `canSellNow`), the coins spent on buying today, and the daily cap. |
| `POST /api/market/trade` | signed in, flag `market` on | `{companyId, side: "buy" or "sell", units, actionUid}`. The server takes the price from the shared board, from real prices at most 5 seconds old, and works out every coin. It answers with the price, the coins of the trade (`gross`, `fee`, `coinsChange`), the new balance and the units held. The price can differ from the price on the player's screen, which may be a minute old. |

```text
GET /api/market

200 OK
{"companies": [{"id": "harbor-trust", "name": "Saltreach Harbor Trust", "ticker": "SHT", "follows": "BTC",
                "tagline": "...", "price": 67.2, "basePrice": 60.0, "movePercent": 12.0,
                "status": "open", "haltedUntil": null}, ...],
 "source": "live", "fetchedAt": "2026-11-05T12:05:00Z", "tradingEnabled": true,
 "rules": {"multiplier": 100, "feePercent": 2.0, "breakerPercent": 30, "haltMinutes": 15,
           "floorPercent": 25, "ceilingPercent": 400,
           "minHoldMinutes": 10, "maxTradeCoins": 500, "dailyBuyCapCoins": 2000,
           "marketDayStarts": "08:00 Europe/Lisbon", "pauseNote": "..."},
 "attribution": "Real price moves from Binance market data, amplified in the game. Simulation, play money.",
 "licenceUrl": null}

POST /api/market/trade
Authorization: Bearer <token>
{"companyId": "harbor-trust", "side": "buy", "units": 5, "actionUid": "q7x2k9m4"}

200 OK
{"companyId": "harbor-trust", "side": "buy", "units": 5, "price": 60.0, "gross": 300, "fee": 6,
 "coinsChange": -306, "coins": 694, "unitsHeld": 5, "avgPrice": 60.0}
```

The rules in one list (numbers in `backend/server/market/rules.py` and `trade_rules.py`, and the setting `MARKET_MULTIPLIER`):

- **Price.** Game price = base game price x (1 + multiplier x real change since the base), in whole cents. The multiplier is a whole number from 20 to 100 (default 100; D017 recommends 20 to 30 for the class). With 100, a real move of +0.12 % is +12 % in the game. **Floor and ceiling:** the price never falls below 25 % of the company's start price (`startPrice` in `companies.json`) and never rises above 400 % of it. Both are measured from the start price, not from the base, which moves with every pause (a floor of 5 % of the base never acted, and prices sank to one cent within days).
- **Circuit breaker.** When the game price is 30 % away from its base, up or down, the company is paused for 15 minutes. It is frozen at the 30 % limit, and nobody can trade it. **Shares are not sold when a company is paused.** After the pause the company restarts from the frozen price and measures real moves from the real price of that moment (a new base).
- **Daily re-base.** The first look after 08:00 Lisbon time gives every company a new base. The game price stays, so nobody's shares change value.
- **Trades.** Whole units. Coins are whole and always rounded against the player: a buy is rounded up, a sell is rounded down, the 2 % fee is rounded up. A buy costs shares + fee, a sell pays shares - fee. A trade is worth at least 1 coin, and a **purchase** at most 500 coins (shares only); a **sale** has no upper limit, so a player can always sell what they hold. A player can buy at most 2000 coins of shares per market day (starting 08:00 Lisbon time). Shares can be sold 10 minutes after the player's latest purchase of that company. A player may make at most 10 trades in 30 seconds (`429`).
- **Safe repeats.** The ledger ref of a trade is `market:<actionUid>` (the `actionUid` is 8 to 64 letters, digits, hyphens or underscores). A repeat answers `409 already_applied` and changes nothing: it is the first thing the server checks, before the prices, a pause or the size of the trade, so it is the answer to a repeat whatever has changed since. A trade writes two ledger rows with that ref: `market_buy` and `market_fee`, or `market_sell` and `market_fee`.
- **One shared price.** One request to Binance returns all seven instruments, and every player gets the same board. The board accepts real prices up to 60 seconds old, so one server instance asks Binance at most once per minute while nobody trades. **A trade accepts only real prices that are at most 5 seconds old** and asks Binance again if the cache is older (a rush of trades at the same moment is one request; at most 12 requests a minute per instance). The database stores each company's base, so every Vercel instance agrees on the base and on a pause; each instance still prices from its own copy of the real prices, so two instances can differ by the age of that copy (up to 60 seconds for the board, 5 seconds for a trade).
- **When Binance is away.** The board shows the last prices marked `stale`, for as long as it lasts, and **nobody can trade** (`409 prices_stale`): a player who watches Binance would know that these prices are out of date. If Binance has not answered once since the server instance started, the board answers `503 source_unavailable`. After a failed request an instance asks Binance again only 10 seconds later. The recorded replay is never played as a stand-in in live mode. In demo mode (`DEMO_MODE=true`) the server never calls Binance and plays the replay, and trading on it is allowed: those prices are a public recording that anybody can read in advance, so coins won on them must never count for anything real (a leaderboard, a prize).
- **Errors.** `404 feature_off` (flag off), `404 no_such_company`, `409 already_applied`, `409 prices_stale`, `409 market_halted`, `409 holding_time`, `409 not_enough_units`, `409 daily_buy_cap`, `409 insufficient_funds`, `422 trade_too_small` or `trade_too_big`, `422 validation_error`, `429 too_many_requests`, `503 market_unavailable`, `503 source_unavailable` (the board, when Binance has not answered yet).

The board needs the Exchange migration (it reads `market_bases`). Without a configured database the board still works from memory, which is good enough for a demo on a laptop but not shared between server instances.

### Crews and seats (package A6)

A crew has four seats. A seat holds a player or an NPC partner (a crew mate that the game runs) and carries one of the four entry kits. A player starts a crew and gets a crew code, a friend types the code to join, and when the crew sails (the "muster") NPC partners take every empty seat, so a crew of one still has four seats. The home of each route is the comment at the top of `backend/server/routes/crews.py`; the rules are in `backend/server/crews/` and in decision [D020](DECISIONS.md#d020--crews-codes-the-guessing-limit-and-partners-at-the-muster--2026-11-05). All four routes need sign-in, answer with `Cache-Control: private, no-store`, and never show a player id.

| Route | Body | What it does |
|---|---|---|
| `POST /api/crews` | none | Starts a crew with the player in seat 1 and answers with its crew code. A player who already started a crew and sits in it alone gets that same crew back. Needs the kit of the player's Act 1 ending: before it, `409 kit_needed`. |
| `POST /api/crews/join` | `{"code": "k7q-f2m"}` | Joins the crew that has the code. Capitals, spaces and hyphens do not matter. The friend takes the lowest open seat; if none is open, the NPC partner who carries the friend's own kit; otherwise the partner whose kit comes last in the partner order. The seat then carries the friend's own kit. A player who started a crew and sits in it alone gives that draft up by joining another crew. |
| `POST /api/crews/me/start` | none | The muster: the crew becomes `active`, and an NPC partner takes every empty seat, carrying the first kit that nobody in the crew has yet. |
| `GET /api/crews/me` | | The crew the player sits in (`forming` or `active`), or `{"crew": null}`. |

```text
POST /api/crews/me/start
Authorization: Bearer <token>

200 OK
Cache-Control: private, no-store
{"crew": {"id": "6fcdad72-8fec-4111-9929-9bad39fd435b", "code": "K7QF2M", "status": "active",
          "mode": "crew", "mySeat": 1, "startedAt": "2026-11-13T10:02:00Z",
          "seats": [
            {"seatNo": 1, "holder": "player",  "name": "Brave Puffin 17", "kit": "witness",     "partnerId": null,    "isMe": true},
            {"seatNo": 2, "holder": "player",  "name": "Calm Gannet 42",  "kit": "stranger",    "partnerId": null,    "isMe": false},
            {"seatNo": 3, "holder": "partner", "name": "the Bosun",       "kit": "informant",   "partnerId": "bosun", "isMe": false},
            {"seatNo": 4, "holder": "partner", "name": "the Cook",        "kit": "true_keeper", "partnerId": "cook",  "isMe": false}]}}
```

- **The view.** `seats` always has four entries in seat order. A seat nobody holds is `{"holder": "open", "name": null, "kit": null, "partnerId": null}`. A player is shown by `profiles.display_name`, a partner by its title (the Lookout, the Deckhand, the Bosun, the Cook), and no answer holds a player id. `mode` is `solo` until a second player joins and `crew` after that; it does not go back to `solo` if a player is deleted later (D020, known limits). `status` is `forming`, `active` or `finished`. `code` is empty only for a crew made before crew codes existed. `startedAt` is a UTC time, empty while the crew is forming.
- **Crew codes.** Six symbols from `A-Z` without `I`, `L` and `O`, and `2-9` (31 symbols). A player may type at most **10 wrong codes in 10 minutes**; the count lives in the database, because every server instance has its own memory. After that even the right code is refused (`429`), so a guesser cannot confirm a hit. A typing mistake (not six symbols) is a `422` and does not count as a guess.
- **Errors** (standard shape): `404 wrong_code`, `404 no_crew`, `404 player_not_set_up`; `409 kit_needed`, `already_in_crew`, `crew_full` (four players), `crew_finished`, `already_seated`, `already_started`, `crew_busy` (the crew changed three times while the request ran: try again); `422 validation_error`; `429 too_many_requests` with `Retry-After`; `503 crew_codes_busy` (five codes in a row were taken: try again). A `503` from a change means the outcome is unknown: ask `GET /api/crews/me` before trying again.
- **Safe repeats.** `POST /api/crews` gives the same draft back. `POST /api/crews/join` answers `409 already_seated`, and `POST /api/crews/me/start` answers `409 already_started`: treat both as done. A repeat never makes a second seat or a second crew.
- **Needs** the crew migration and package A3's table `entry_profiles` (one row per player, with the kit). Before A3's migration is applied the kit read fails with `502 database_error`.

### GET /api/docs

FastAPI's interactive list of every route, with the machine-readable version at `/api/openapi.json`. Served locally and on previews. In production it answers `404 not_found`.

## 3. Browser contracts

These belong to the graphics package (G1) and are written in `frontend/GRAPHICS.md`. The folder `frontend/` comes with G1 and may be missing on your branch. The art style is decision D005, written by G1. On 5 Nov the newest visual pass on the graphics branch still kept the contracts below unchanged.

### The event bus

`frontend/src/core/events.js` exports two functions.

```js
const stop = on('interact', (event) => {
  // event is exactly { type: 'interact', id: 'desk' }, for example
});
emit({ type: 'interact', id: 'desk' });
stop(); // stop listening
```

- `on(type, listener)` calls `listener(event)` for every event of that type, and returns a function that stops listening.
- `emit(event)` hands `event` to every listener of `event.type`.
- A payload is plain data: text, numbers, true or false. No Three.js objects and no functions. Event names are lowercase with underscores ([ENGINEERING.md, recipe 4.3](ENGINEERING.md#43-add-a-browser-event)).

### The story trigger ids

When the player presses E at a story location, the game emits `{ type: 'interact', id }`. The ids are exactly these four:

| id | Where |
|---|---|
| `cottage` | the cottage |
| `desk` | the desk inside the cottage |
| `shore` | the shore |
| `tower_door` | the lighthouse door |

The story package listens and decides what happens. G1 itself supplies no story outcome.

### Weather

`frontend/src/world/weather.js` exports `setWeather` and `getWeather`.

```js
setWeather({ cloudCover: 0.6, rain: 0.8, fog: 0.2, wind: 0.6 });
const weatherNow = getWeather(); // a copy: { cloudCover, rain, fog, wind }
```

Each field is a number from 0 to 1. A value outside that range is clamped. A field that is missing, unknown or not a finite number keeps its previous value.

The live weather package (L1) calls `setWeather` with the values from `GET /api/weather` ([section 2](#get-apiweather)). `startLiveWeather({ setWeather, fetchImpl, intervalMs, onUpdate })` in `frontend/src/net/weather.js` asks at once and then every 10 minutes, passes exactly the four values to `setWeather`, keeps the last good weather when a call fails or takes longer than 10 seconds (it changes nothing and logs a warning), and returns a function that stops it. The optional `onUpdate(answer)` gets the whole answer after each good update, so the caller can show the place, the summary and the credit, or emit the event `weather_updated`. `weatherAttribution(answer)` in the same file returns the credit as `{ text, href, licenceText, licenceHref }`: show `text` as a link to `href`, followed by `licenceText` as a link to `licenceHref`. All of it must be on screen next to the weather ([section 2](#get-apiweather) says why).

Starting it in the game is a separate step, because `frontend/` belongs to the graphics package. Whoever owns the client does it in these steps:

1. In `frontend/src/main.js`, import it: `import { startLiveWeather, weatherAttribution } from './net/weather.js';`. `setWeather` is already imported there.
2. Write the `onUpdate(answer)` function. It shows `weatherAttribution(answer)` next to the weather in the HUD, and it may emit `{ type: 'weather_updated', source, fetchedAt }`.
3. Start it in `startGame()` after the `try { await world.goTo('lighthouse_isle'); } catch ...` block, for example just before `quality(settings.quality)`: `const stopLiveWeather = startLiveWeather({ setWeather, onUpdate });`. Do not start it above that block. When the first place cannot load, that block cleans up and throws without calling `dispose()`, so a timer started earlier would never stop.
4. Call `stopLiveWeather()` in `dispose()`.
5. Change the weather sentence in `frontend/GRAPHICS.md`. It says that wind controls the speed of a passage and that weather "makes no API request". With live weather both change: the real wind sets the sailing time, and the game asks `/api/weather`.

### Other hooks

- The camera anchors `stairwell` and `lamp_room` in `frontend/src/world/lighthouse.js`, for cut scenes.
- `createCharacter(art, { reducedMotion })` returns `{ group, sprite, face(dx, dz), animate(delta, speed) }`. Another player's captain can reuse it without the local keyboard controls.

### Reserved events

| Event | Package | Status |
|---|---|---|
| `{type: 'travel', to}` and `{type: 'arrived', place}` | G2 | draft |
| `{type: 'intro_ended', ending}` | S2 | draft |
| `{type: 'weather_updated', source, fetchedAt}` | L1 | draft; `startLiveWeather` does not emit it itself, whoever wires it in emits it from the `onUpdate` hook |
| `{type: 'plot_clicked', plot}` | L2 | draft |
| `{type: 'finale', stage}`, listened to by G4 | L3 | draft; defined by the story package S0 (skeleton under review) |

## 4. Database tables

The first migration, `supabase/migrations/20261106000000_foundation.sql`, creates seven tables. The foundation package (A1, whose spec is `specs/F0-foundation.md`) owns them. A visitor who is not signed in gets nothing. A signed-in player only reads. The server writes, with the secret key. The full matrix, action by action, is in [supabase/README.md](../supabase/README.md#who-may-do-what).

| Table | One row per | A signed-in player may | The server may | Owner |
|---|---|---|---|---|
| `profiles` | player: the display name | read every row | read, add, change, delete | A1. A2 writes real captain names. |
| `saves` | player: progress as a JSON object of at most about 200 KB | read their own row | read, add, change, delete | A1. A2 adds the route that saves. |
| `wallets` | player: the coin balance, never below 0 | read their own row | read, change (only through the wallet function) | A1 |
| `wallet_reasons` | reason a balance may change, with its direction | read every row | read | A1. New reasons arrive by migration. |
| `wallet_transactions` | coin change: the ledger, never edited | read their own rows | read, add (only through the wallet function) | A1 |
| `crews` | crew | read the crews they sit in | read, add, change, delete | A1. A6 adds the crew routes. |
| `crew_seats` | taken seat in a crew | read the seats of the crews they sit in | read, add, change, delete | A1. A6 adds the crew routes. |

The Island Exchange migration, `supabase/migrations/20261106010000_island_exchange.sql` (package L4, run after the first one), adds three tables and two functions. The rights follow the same plan: a visitor gets nothing, a signed-in player only reads, the server writes.

| Table | One row per | A signed-in player may | The server may | Owner |
|---|---|---|---|---|
| `market_bases` | company: the base its price is measured from (a game price and a real price), and whether it is paused | read every row | read, add, change (through `market_set_base()`) | L4 |
| `market_positions` | player and company the player holds units of; deleted when the player sells everything | read their own rows | read, add, change, delete (through `market_trade()`) | L4 |
| `market_trades` | buy or sell: the trade history, never edited | read their own rows | read, add (through `market_trade()`) | L4 |

`market_trade()` is the only way a trade happens (it checks that the coins and the fee follow from the units and the price, moves the coins through `apply_wallet_transaction()`, changes the position and writes the trade in one step). `market_set_base()` saves a company's base when two server instances look at the same moment. Both are for the server only.

Four database functions come with the first migration: `apply_wallet_transaction()` (the only way coins move, for the server only), `is_crew_member()` (used by the read rules of crews and seats, for signed-in players only), `handle_new_user()` (runs at sign-up and creates a profile, a wallet with 0 coins and an empty save) and `touch_updated_at()` (stamps `updated_at`).

Details that other packages rely on:

- **Display names** (`profiles.display_name`): 2 to 24 characters from A-Z, a-z, 0-9, space, underscore, dot and hyphen, with no space at either end. Not unique. At sign-up every player gets a neutral placeholder: `Captain-` and the first 6 characters of their id. A name never comes from the GitHub login or any other login detail, because names appear on a projector.
- **Saves:** `data` (a JSON object), `version` (starts at 1; the server raises it when the shape of `data` changes) and `updated_at` (set by the database). Only the server writes a save.
- **Realtime** is not switched on for any table yet.
- **A new table** follows [ENGINEERING.md, recipe 4.2](ENGINEERING.md#42-add-a-database-table): row-level security, read-only policies for players, and explicit grants, because our project gives no rights to a new table by itself.

## 5. The wallet

Play money only. Coins cannot be bought, cashed out or exchanged for real prizes. One wallet per player and one ledger serve every money feature.

- A new wallet starts with 0 coins (`STARTING_BALANCE`), and the sign-up trigger writes no ledger row. The first coins come with the entry kit (`kit_grant`).
- Only the server moves coins, and only with this one call (from `backend/server/wallet.py`):

  ```python
  new_balance = await apply_transaction(player.id, -50, "building_purchase", ref="order-123", admin=admin)
  ```

  A negative amount takes coins away, a positive one adds them. Python checks the numbers first. Then one database function checks the reason and its direction, changes the balance only if it stays at 0 or above, and writes the ledger row, all in one step.
- An amount is a whole number of coins, never 0, and at most 1,000,000 either way. A `ref` is required: non-empty text of at most 120 characters.
- The ledger holds each player, reason and `ref` only once, so a repeat changes nothing. Every money call needs a `ref`: Python refuses a call without one (`422 invalid_transaction`), and the database refuses a missing or blank one too, so no coin change can slip past the repeat check. A payout that must happen once per player uses a fixed `ref`, such as `kit` for the entry kit.

| Answer | When |
|---|---|
| The new balance | It worked. |
| `422 invalid_transaction` | A bad amount, an unknown reason, the wrong direction, or a `ref` that is missing, blank or too long. Nothing was sent to the database. |
| `409 insufficient_funds` | The balance would go below 0. Nothing changed. |
| `409 already_applied` | This player, reason and `ref` were used before. Nothing changed. |
| `503 database_unavailable` | The outcome is unknown. Look the `ref` up in the ledger before you retry, refund or charge again. |
| `503 database_not_configured` or `502 database_error` | The database is not set up, or it refused the call. |

### The reasons

Every reason has a direction. **earn** adds coins (an amount above 0), **spend** takes coins away (below 0), and **either** may go both ways (never 0).

| Reason | Direction | What it is for |
|---|---|---|
| `kit_grant` | earn | Coins that come with the entry kit the intro gives a new player |
| `clue_reward` | earn | A clue a player found or pinned |
| `mystery_reward` | earn | A deduction, or solving the whole mystery |
| `event_reward` | earn | A special event in the world |
| `cargo_sale` | earn | Selling cargo |
| `clue_purchase` | spend | Buying a clue |
| `building_purchase` | spend | Building on a home islet |
| `admin_adjust` | either | A manual correction by an admin |
| `market_buy` | spend | Shares bought on the Island Exchange (migration `20261106010000`) |
| `market_sell` | earn | Shares sold on the Island Exchange (same migration) |
| `market_fee` | spend | The fee of an Island Exchange trade (same migration) |

A new reason is one new migration plus the same pair added at the end of `WALLET_REASONS`, in one pull request ([ENGINEERING.md, recipe 4.7](ENGINEERING.md#47-add-a-wallet-reason)). Never rename a reason or change its direction. The reason names later packages have reserved are in [section 9](#9-reserved-interfaces).

## 6. Crews and seats

- A crew has up to 4 seats, numbered 1 to 4. Each taken seat holds exactly one of two: a player, or an NPC partner (a crew mate the game runs, named by its `npc_id`). A seat that nobody holds has no row.
- **Solo play is a crew of one player.** The player sits in seat 1 and NPC partners fill the other seats (mode `solo`). With friends the mode is `crew`, and NPC partners fill any seats left empty. A friend can take over an NPC partner's seat.
- A crew's status goes from `forming` to `active` to `finished`.
- A player can read a crew and its seats only while they sit in it. Only the server creates crews and seats players and NPC partners.
- The database guards one seat per player and one seat per NPC partner in a crew (two unique indexes), the kit ids and the crew code (migration `20261106040000`, package A6). The four crew functions (`crew_create()`, `crew_find_by_code()`, `crew_take_seat()` and `crew_start()`) make sure that a player sits in at most one open crew (`forming` or `active`), under a lock on the player's profile. By team rule the server writes crews and seats only through them.
- Deleting a player removes their seat. Deleting the player who started a crew removes the whole crew.

| Column | Meaning |
|---|---|
| `crews.id`, `created_by` | A random id, and the player who started the crew |
| `crews.mode`, `status` | `solo` or `crew`; `forming`, `active` or `finished` |
| `crews.code` | The crew code a friend types to join: 6 symbols from `A-Z` without `I`, `L` and `O`, and `2-9`. Unique. Empty only for a crew made before crew codes existed. |
| `crews.version`, `started_at` | `version` counts the changes made through the crew functions (starts at 1), so a request never acts on an old picture of the crew. `started_at` is the time of the muster, empty while the crew is forming. |
| `crew_seats.crew_id`, `seat_no` | The crew and the seat number (1 to 4). Each seat number appears once per crew. |
| `crew_seats.player_id`, `npc_id` | Who sits there: exactly one of the two. An `npc_id` is 2 to 40 characters from a-z, 0-9 and underscore. |
| `crew_seats.kit`, `joined_at` | The entry kit this seat carries: `true_keeper`, `witness`, `informant` or `stranger` (checked for every new or changed row), and when the seat was taken |

What NPC partners do in the mystery (their orders, errands and lines) is defined by the story package S0 (skeleton under review). Package A6 adds the crew routes and crew codes, and S4 the orders for NPC partners ([section 9](#9-reserved-interfaces)).

### Crew codes, the muster and partners (package A6)

How a crew forms, in four steps. The home is `backend/server/routes/crews.py`; the pure rules are in `backend/server/crews/seats.py`.

1. **Start.** A player with an entry kit starts a crew (`POST /api/crews`) and sits in seat 1. The crew is `forming` and has a code.
2. **Join.** A friend types the code. The friend takes the lowest open seat. A crew that has sailed usually has no open seat, so the friend takes over the NPC partner who carries the friend's own kit, or else the partner whose kit comes last in the partner order, so the partners who stay keep the kits that are still missing. The seat carries the friend's **own** kit.
3. **Muster.** Any player of the crew calls `POST /api/crews/me/start`. The crew becomes `active`, and NPC partners take every empty seat, lowest number first. Each partner carries the first kit of the order **informant, stranger, true_keeper, witness** that nobody in the crew carries yet. The partner follows the seat number: the Lookout (`lookout`) in seat 1, the Deckhand (`deckhand`) in 2, the Bosun (`bosun`) in 3 and the Cook (`cook`) in 4.
4. **Play.** Nobody leaves and nobody is kicked in this version. A friend can still join a crew that has sailed, by taking over a partner.

- **Pending Nils' decision (story decision 12).** The order of the partner kits is the one of `NPC-PARTNERS.md` (section 4.2). `CASE-FILE.md` (sections 3 and 9) still lists another order (true_keeper, informant, stranger, witness); the story branch has to fix that file. The order is one constant (`NPC_KIT_ORDER`) in `seats.py`.
- **Pending Nils' decision (story decision 10).** The kit of a seat after a friend takes over a partner. Built default: the friend keeps their own kit. It is one switch (`FRIEND_KEEPS_OWN_KIT`) in `seats.py`.
- **A draft.** A crew that a player started and sits in alone. Joining another crew deletes the draft in the same step, so a player who pressed "start a crew" by mistake is never stuck. A crew with a friend in it is not a draft: its players cannot join another crew.
- **Guessing.** The database counts the wrong codes of each player (`crew_join_failures`) and refuses a player who typed 10 wrong codes in 10 minutes before it looks at the code. The numbers are in `backend/server/crews/codes.py`.
- **For later packages.** The case board and the finale find the crew and the seat of a player with `read_open_crew_seat()` in `backend/server/crews/store.py`, and stamp the seat number on their own rows. Partner orders and errands are package S4. Note for S4: a Witness partner starts with card C2 in its satchel.

## 7. Realtime budget

Supabase Realtime on the free plan is one budget for the whole project:

| Limit | Free plan |
|---|---|
| Connections at the same time | 200 |
| Messages per second | 100 |
| Messages per month | 2 million |
| Presence messages per second | 20 |
| Channel joins per second | 100 |
| Size of one broadcast | 256 KB |

**Every delivered copy counts.** A message counts once when it is sent, and once more for every client that receives it. Above the per-second limit, Supabase disconnects clients, and they reconnect only when the load drops. Test traffic counts too.

Two worked examples (our arithmetic):

- One crew of 4 players in one room, each sending 2 updates a second. One update costs 1 + 3 = 4 messages, so the room costs 4 x 2 x 4 = 32 messages a second, a third of the project's limit. An hour of that is 115,200 messages, so the 2 million a month last about 17 hours of such play.
- One room of 30 players, each sending 1 update a second: 30 x (1 + 29) = 900 messages a second, 9 times the limit.

Our rules:

1. **Small rooms:** one crew (at most 4 seats) or one duel per channel.
2. **At most 2 updates per second per player** ([ENGINEERING.md, section 7](ENGINEERING.md#7-performance-budgets)). The client slows itself down, and the server enforces it.
3. **The server sends with Supabase's Broadcast REST API** and never subscribes to a channel itself: a subscribed server counts as one more receiver and holds a connection.
4. **Poll when a few seconds of delay are fine.** The team roadmap plans polling for the case board (L3) and the duels (A7), so no core package needs Realtime yet.

## 8. Feature flags

A flag is off unless the setting `FEATURE_FLAGS` names it (comma separated). The server reads it once at start-up, and a name that does not exist stops the server with a clear message. The browser learns which flags are on from `GET /api/config` and never decides for itself. To add a flag, follow [ENGINEERING.md, recipe 4.5](ENGINEERING.md#45-add-a-feature-flag).

| Flag | Switches on | Package |
|---|---|---|
| `market` | the Island Exchange | L4 |
| `predictions` | the prediction desk | L5 |
| `sports` | sports predictions | L6 |
| `arena` | Lantern Duels, the turn-based arena | A7 |
| `raid` | the phone class raid | A5, later |
| `live_presence` | seeing other captains in the harbor | A4, later |
| `companion_llm` | a language-model companion | later, only with a capped server key and Nils' OK |

The names of all settings are in [.env.example](../.env.example), and [ARCHITECTURE.md](ARCHITECTURE.md#where-each-secret-lives) says where each secret lives.

## 9. Reserved interfaces

Every name here is a draft until the freeze on Mon 9 (D009). Package ids are those of the team roadmap. The package that builds an interface writes the final shape in its spec and in the contract's home, then updates this table.

**Where content files live (D016, proposed).** Content that the server reads lives in `backend/content/`. A file the browser needs in order to play is served by `GET /api/content/{name}`. A file the browser must never see lives in `backend/content/secret/` and is never served. Data that only the browser uses stays in `frontend/`. A `.json` file named in a row below has its path under `backend/content/`, unless the row gives another folder.

| Package | Reserves | Status |
|---|---|---|
| G2 Places and sea chart | `createPlace(ctx)` returning `{group, zones, anchors, colliders, update(dt), dispose()}`; `world.goTo(placeId)`; the events `travel` and `arrived`; the place registry `frontend/src/world/places/registry.js` (place ids, hotspot ids and positions), which replaced the proposed `content/places.json` | draft |
| G3 Saltreach Harbor | A place module `harbor` whose hotspots emit `interact` with ids from the place registry `frontend/src/world/places/registry.js` | draft |
| G4 Finale visuals | `world.cinematic('three_lights' \| 'fog_lift' \| 'unmask')`, which listens for the `finale` event | draft; defined by the story package S0 (skeleton under review) |
| S1 Import Plot Twist | `backend/content/story.json`, with the content format in `backend/content/README.md`; `GET /api/content/intro-story`; the story engines `backend/plot_twist/engine.py` and `frontend/src/story/engine.js`; the parity test `backend/plot_twist/tests/test_web_parity.py` with its Node.js runner `parity_runner.mjs` | draft |
| S2 Act 1 in the browser | The move log `actions[]`; the event `intro_ended` | draft |
| S3 The Light That Shouldn't Be (the case) | `POST /api/act {place, actionId, actionUid}` returning `{accepted, message, notes, actions}`; `POST /api/case/accuse {suspect, actionUid}`; `backend/content/secret/case.json`, read only by the server and never served | draft; defined by the story package S0 (skeleton under review) |
| S4 NPC partners | `POST /api/crews/me/orders {seat, order, target, actionUid}`; `backend/content/partners.json` (orders, errand times, scripted lines) | draft; defined by the story package S0 (skeleton under review) |
| A2 Sign-in, captain names and cloud progress | `GET /api/me` already exists since the sign-in check (section 2, returning `{id, displayName, coins, crews}`): A2 adds `kit` and `place` to it and writes real captain names into `displayName`; `PUT /api/save {version, data}`, with 409 for a stale version; `DELETE /api/me`; the check `require_host` (403 for players); `backend/content/names.json`; sign-in with the PKCE flow, like the check page (see `POST /api/auth/exchange`, section 2) | draft |
| A3 Referee and entry kits | `POST /api/intro/complete {actions[]}` returning `{ending, decision, readLog, kit}`; the table `entry_profiles`; the kit coins through `kit_grant` with the fixed `ref` `kit` | draft |
| A6 Crews and seats | `POST /api/crews` (returns a crew code); `POST /api/crews/join {code}`; `GET /api/crews/me`; crew codes in a new column or table | draft |
| A7 Lantern Duels (the PvP arena) | `POST /api/duels`; `POST /api/duels/{id}/move`; `GET /api/duels/{id}`; the tables `duels` and `duel_moves`; the reasons `arena_stake` and `arena_payout`; the flag `arena` | draft |
| A4 Harbor presence (later) | The table `presence`; `POST /api/presence`, at most once every 2 seconds; `GET /api/harbor/peers`; the flag `live_presence` | draft |
| L1 Live weather | `GET /api/weather` returning `{cloudCover, rain, fog, wind, isDay, summary, place, source, fetchedAt, attribution}` ([section 2](#get-apiweather)); the settings `WEATHER_PLACE_NAME`, `WEATHER_LATITUDE` and `WEATHER_LONGITUDE`; `startLiveWeather` in `frontend/src/net/weather.js`; the event `weather_updated` | built; the `?place=` option was dropped (one place, chosen by the settings). How the client starts it is in [section 3](#weather). The event stays a draft. |
| L2 Your home islet | `GET /api/islet`; `POST /api/islet/build {plot, type, actionUid}`; the table `islets`; the event `plot_clicked`; `backend/content/buildings.json`; coins through `building_purchase` | draft |
| L3 Captain's Table board and Night of Three Lights | `GET /api/board`; `POST /api/board/pin {cardId, actionUid}`; `POST /api/finale/signal {light, bearing, actionUid}`; `GET /api/world`; the tables `board_pins`, `finale_signals` and `world_state`; the event `finale`; rewards through `clue_reward` and `mystery_reward` | draft; defined by the story package S0 (skeleton under review) |
| L4 Island Exchange (the market) | **Built** (on `main`; flag `market` off; its migration is not applied yet): `GET /api/market`, `GET /api/market/portfolio`, `POST /api/market/trade {companyId, side, units, actionUid}`; the tables `market_bases`, `market_positions` and `market_trades`; the reasons `market_buy`, `market_sell` and `market_fee`; `backend/content/market/companies.json` and `replay.json`; the setting `MARKET_MULTIPLIER`; the flag `market`. See section 2 and D017. | built, in review |
| L5 Prediction desk | `GET /api/predictions`; `POST /api/predictions/stake {questionId, side, amount, stakeId}`; the table `prediction_stakes`; the reasons `prediction_stake` and `prediction_payout`; `backend/content/questions.json`; the flag `predictions` | draft |
| L6 Sports predictions | `GET /api/sports`; `POST /api/sports/stake {fixtureId, pick, amount, stakeId}`; the tables `fixtures` and `sports_stakes`; the reasons `sports_stake` and `sports_payout`; the flag `sports` | draft |

Every reserved table follows recipe 4.2, and every reserved reason recipe 4.7: neither exists until its package adds the migration.

### Rules for the live data features

These rules come from Nils' feature list and from the data sources checked on 5 Nov 2026. They hold whichever package builds the feature.

**Play money only.** Coins cannot be bought, cashed out or exchanged for real prizes. Screens say "simulation, play money", and nothing links to a betting site. Supabase's acceptable use policy forbids facilitating unregulated gambling, and Portuguese law defines gambling around money. This is not legal advice: ask the teacher if unsure.

**The market (L4).**

- Fictional island companies whose prices follow seven real instruments that trade around the clock: BTC, ETH, SOL, XRP, BNB, EUR/USD (as built: the Binance pair EURUSDT, the euro against the US-dollar stablecoin; the roadmap named the euro stablecoin EURC) and PAXG (a gold token, standing in for gold).
- **As built:** the primary feed is Binance market data (`data-api.binance.vision`), which needs no key and no account: one request returns all seven prices (weight 4 of the 6,000 a minute that an address may use), cached for 60 seconds per server instance for the board, and 5 seconds for a trade. If Binance fails, the last good prices keep showing, marked `stale`, and trading pauses until Binance answers again (the recorded replay never plays in live mode: it is public, so it would let a player trade against prices they know). Every answer says which one it is (`source`: `live`, `cache`, `stale` or `replay`). It can refuse US addresses (HTTP 451), and then the live Exchange has no prices at all. Our functions run in Dublin, but test from the deployed function first, and use `DEMO_MODE=true` if Binance refuses. Binance's own terms do not say whether public market data may be shown in a class game; ask the teacher if unsure.
- **CoinGecko is not built.** The Demo API (a free account, 100 calls a minute and 10,000 a month, one call for all seven) needs a key that a teammate must create, and an agent never signs up. It stays a possible backup. Its key would live only in Vercel, as `MARKET_DATA_API_KEY`; the screen would show "Powered by CoinGecko", and recorded CoinGecko prices are never committed. The arithmetic if it is added: 10,000 calls a month is about 330 a day, while one call every minute for a whole day would be 1,440, so refresh only when a request finds the cache expired.
- Recorded replay: `backend/content/market/replay.json`, 90 minutes of 1-minute closing prices from Binance Vision, played only in demo mode. Its licence (CC BY-NC-SA 4.0) allows committing it, with the credit "Binance Vision" and the same licence on that file (both are in the file and shown on screen while it plays, with a link to the licence text in `licenceUrl`).
- The screen always says which one is running: the live feed, the cache, old prices (trading is paused) or the replay (demo mode).
- Amplified moves: every real percentage move is multiplied by a setting from 20 to 100 (`MARKET_MULTIPLIER`, default 100), with a price floor of 25 % and a ceiling of 400 % of the start price and a circuit breaker that pauses a company for 15 minutes after a 30 % move. The exact rules are in section 2 and D017.

**The prediction desk (L5).**

- Primary: Manifold Markets. Reading needs no key and allows 500 requests a minute per address, so only our server calls it, and it caches the answers. Manifold is a play-money site itself. Credit Manifold on the page.
- Backup: Polymarket's Gamma API, no key. Use `/events/keyset`, because the old `/events` list is deprecated.
- A hand-picked allow-list of 20 to 40 questions in `backend/content/questions.json`. Never list questions automatically: user-made questions can be personal or in bad taste. No wars, deaths or elections.
- Settlement: once a question is resolved and a grace period of about an hour has passed, the winners share the pool. CANCEL, or any result other than YES or NO, refunds everyone.

**Sports predictions (L6).**

- Football primary: football-data.org, free plan: 12 competitions and 10 calls a minute. A teammate registers. Their terms forbid keys in open-source repositories, so the key lives only in Vercel, as `SPORTS_API_KEY`. Show "Football data provided by the Football-Data.org API", and use team names as text, without crests.
- Football backup: OpenLigaDB. No key, an open licence, and made for prediction games. At most one call per league every 30 to 60 seconds during live games, from our server only. Volunteers enter the results, so confirm one with a second source before paying out.
- Basketball (NBA): balldontlie, with a free key and 5 calls a minute.
- Players stake play coins into a pool, and the winners share it. No bookmaker odds. Settle only on the final result. Refund everyone when a game is postponed, cancelled or suspended. Keep to league games or 90-minute results, to avoid extra-time rules.
- Vercel Cron cannot be used with our setup (see [ARCHITECTURE.md](ARCHITECTURE.md#the-7-day-pause-and-the-keep-alive)), so no timer settles games for us. Settle when someone opens their stakes after the game.

**The PvP arena (A7).**

- Turn-based duels between two players. The server decides every round with Python rules, and the browser only sends moves. The browser polls for the other player's move, so Realtime is not needed.
- Optional stakes in play coins: taken once and paid once, with the duel id in the `ref`. A duel that times out refunds both players. Preset emotes only, no free text.
- Do not build it on WebSockets in Vercel Functions: they are a Beta feature, and on Hobby a connection closes after 300 seconds.

## 10. The shared mystery

Everything about the shared mystery is **defined by the story package S0 (skeleton under review)**: the cards and deductions, the case clock, the finale, the accusation, the orders and lines of NPC partners, the rewards and the rule that keeps spoilers away from crews that have not solved the case. This page only reserves the names other packages will build (S3, S4, L3 and G4 in [section 9](#9-reserved-interfaces)). Until S0 is approved, treat those shapes as placeholders.

What already holds, from the foundation: a reward is paid with `clue_reward` or `mystery_reward` and a `ref` that makes each payout happen once per player, buying a clue uses `clue_purchase`, and a crew's seats can hold NPC partners ([section 6](#6-crews-and-seats)).

## 11. Open questions for Mon 9

1. **JSON names.** Confirm camelCase in JSON (`demoMode`, `actionUid`) and snake_case in Python and SQL. Also confirm the exception for content files, which keep their own spelling (`story.json` uses snake_case keys such as `hide_when_blocked`).
2. **Repeats.** What does a route answer when an `actionUid` comes a second time: the first answer again, or `409 already_applied` like the wallet? (The Island Exchange follows the wallet: `409 already_applied`.)
3. **Switched-off features.** Which status and code does a route answer while its flag is off? (The Island Exchange answers `404 feature_off` on its player routes, and its public price board works anyway.)
4. **The keep-alive caller.** What calls `GET /api/keepalive` once a day. Vercel Cron is out, because a `crons` entry in `vercel.json` breaks our deploys while we use Services. The options are a scheduled GitHub Actions workflow (only with Nils' OK), a free outside scheduler or uptime monitor that sends the secret, or Supabase Cron (not checked yet). Nils decides. Until then we rely on team activity and a manual check of the Supabase project the day before the demo ([SETUP.md](SETUP.md), Step 5, check 3, and "Keep it awake until the demo").
5. **Browser contracts after the final look.** G1 confirms that the event bus, the four story trigger ids and `setWeather` stay as written in section 3 when D005 is recorded.
6. **The default weather place.** Torshavn in the Faroe Islands is the proposal (real fog and storms that suit the story), Lisbon the option (`38.72`, `-9.14`). It is only the default of three settings, so changing it needs no code change. Without a decision the Faroe Islands stay.
