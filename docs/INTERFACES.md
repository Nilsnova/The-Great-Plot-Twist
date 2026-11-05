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
- **JSON in, JSON out.** Field names in JSON are camelCase, as `demoMode` in `/api/config` already is. Python names and database columns stay snake_case. Names that are data, such as the flag names inside `flags`, keep their own spelling.
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
| 401 | `unauthorized` | No sign-in token, a malformed one, or one Supabase refused (wrong or expired). The keep-alive also answers 401 to a missing or wrong secret. The answer carries the header `WWW-Authenticate: Bearer`. | Ask the player to sign in again. |
| 403 | `forbidden` | Signed in, but not allowed. Planned for presenter-only routes (`require_host`, package A2). No route uses it yet. | Say "not allowed". Do not retry. |
| 404 | `not_found`, or a specific code | No such route, or no such thing, for example `ApiError(404, "no_such_island", "That island does not exist.")`. `feature_off` means the feature flag of the route is off (the Island Exchange uses it; section 11, question 3, is still open). `no_such_company` is an unknown Exchange company. | Show the message. |
| 405 | `method_not_allowed` | The wrong method, for example `POST` to a `GET` route. | Fix the caller: it is a bug. |
| 409 | `insufficient_funds`, `already_applied` | A conflict with what is saved: not enough coins, or this exact action was done before and nothing changed. Package A2 plans a 409 for a stale save version too. The Island Exchange adds `market_halted`, `holding_time`, `not_enough_units`, `daily_buy_cap` and `prices_stale` (the real prices are old, so trading is paused; nothing changed). | Show the message. After `already_applied`, treat the action as done. |
| 422 | `validation_error`, `invalid_transaction` | The request does not fit: a word where a number belongs, a missing field, or a coin change the wallet rules refuse. Nothing changed. The Island Exchange adds `trade_too_small` and `trade_too_big` (a purchase over 500 coins; a sale has no upper limit). | Show the message. Do not resend it unchanged. |
| 429 | `too_many_requests` | Too many requests in a short time, for example during a cooldown. The Island Exchange uses it for trades (more than 10 in 30 seconds by one player); the `Retry-After` header says how many seconds to wait. | Wait, then try again. |
| 500 | `server_error` | A bug on our side. The details go to the server log only. | Say "something went wrong". |
| 502 | `database_error` | The database refused the call or answered strangely. | Say "something went wrong". |
| 503 | `auth_not_configured`, `auth_unavailable`, `database_not_configured`, `database_unavailable`, `source_unavailable`, `not_configured`, `market_unavailable` | The server, or a service it needs, is not set up or not reachable right now. (`market_unavailable`: the Island Exchange data files could not be read when the server started; the rest of the API works. `source_unavailable` on `GET /api/market`: Binance has not answered once since this server instance started, so there are no prices to show.) | Try again later. For money the outcome is unknown: the coins may have moved before the call timed out, so look the `ref` up before you retry. |

## 2. Routes that exist now

Three routes exist, plus the three routes of the Island Exchange (below) and FastAPI's list of routes. Start the API on your laptop ([ENGINEERING.md, section 3](ENGINEERING.md#3-commands)) to try them. The example answers below come from the real code; `health` and `config` are shown as they answer with an empty `.env`.

### GET /api/health

Is the API alive? Anyone may call it: teammates, uptime checks and the game.

```text
GET /api/health

200 OK
{"status": "ok", "version": "0.1.0", "env": "local"}
```

`version` is the API version in `backend/server/__init__.py`. `env` is `local`, `preview` or `production`, from the setting `APP_ENV`.

### GET /api/config

How this server is set up: the environment, demo mode and which feature flags are on. Anyone may call it, and it holds no secret. The game reads it at start-up to show or hide features.

```text
GET /api/config

200 OK
{"env": "local", "demoMode": false, "flags": {"market": false, "predictions": false, "sports": false, "arena": false, "raid": false, "live_presence": false, "companion_llm": false}}
```

### GET /api/keepalive

Keeps the free Supabase project awake ([ARCHITECTURE.md](ARCHITECTURE.md#the-7-day-pause-and-the-keep-alive)). Only Vercel's daily cron calls it, with the cron secret. It reads one row from `profiles`, `wallet_reasons` and `crews`, stops at the first read that fails, and never answers with database text. The cron entry that will call it is not in `vercel.json` yet.

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

Each field is a number from 0 to 1. A value outside that range is clamped. A field that is missing, unknown or not a finite number keeps its previous value. The live weather package (L1) calls `setWeather` with the values from its reserved route `GET /api/weather`.

### Other hooks

- The camera anchors `stairwell` and `lamp_room` in `frontend/src/world/lighthouse.js`, for cut scenes.
- `createCharacter(art, { reducedMotion })` returns `{ group, sprite, face(dx, dz), animate(delta, speed) }`. Another player's captain can reuse it without the local keyboard controls.

### Reserved events

| Event | Package | Status |
|---|---|---|
| `{type: 'travel', to}` and `{type: 'arrived', place}` | G2 | draft |
| `{type: 'intro_ended', ending}` | S2 | draft |
| `{type: 'weather_updated', source, fetchedAt}` | L1 | draft |
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
- The server, not the database, makes sure that a player has at most one active crew, never holds two seats in one crew, and that one NPC partner does not sit twice in one crew.
- Deleting a player removes their seat. Deleting the player who started a crew removes the whole crew.

| Column | Meaning |
|---|---|
| `crews.id`, `created_by` | A random id, and the player who started the crew |
| `crews.mode`, `status` | `solo` or `crew`; `forming`, `active` or `finished` |
| `crew_seats.crew_id`, `seat_no` | The crew and the seat number (1 to 4). Each seat number appears once per crew. |
| `crew_seats.player_id`, `npc_id` | Who sits there: exactly one of the two. An `npc_id` is 2 to 40 characters from a-z, 0-9 and underscore. |
| `crew_seats.kit`, `joined_at` | The entry kit this seat carries (no format rule yet), and when the seat was taken |

What NPC partners do in the mystery (their orders, errands and lines) is defined by the story package S0 (skeleton under review). Package A6 adds the crew routes and crew codes, and S4 the orders for NPC partners ([section 9](#9-reserved-interfaces)).

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

| Package | Reserves | Status |
|---|---|---|
| G2 Places and sea chart | `createPlace(ctx)` returning `{group, zones, anchors, colliders, update(dt), dispose()}`; `world.goTo(placeId)`; the events `travel` and `arrived`; `content/places.json` (place ids, hotspot ids and positions) | draft |
| G3 Saltreach Harbor | A place module `harbor` whose hotspots emit `interact` with ids from `content/places.json` | draft |
| G4 Finale visuals | `world.cinematic('three_lights' \| 'fog_lift' \| 'unmask')`, which listens for the `finale` event | draft; defined by the story package S0 (skeleton under review) |
| S1 Import Plot Twist | `content/story.json`, with the content format in `content/README.md`; the original Python and JavaScript story engines | draft |
| S2 Act 1 in the browser | The move log `actions[]`; the event `intro_ended` | draft |
| S3 The Light That Shouldn't Be (the case) | `POST /api/act {place, actionId, actionUid}` returning `{accepted, message, notes, actions}`; `POST /api/case/accuse {suspect, actionUid}`; `content/case.json`, read only by the server | draft; defined by the story package S0 (skeleton under review) |
| S4 NPC partners | `POST /api/crews/me/orders {seat, order, target, actionUid}`; `content/partners.json` (orders, errand times, scripted lines) | draft; defined by the story package S0 (skeleton under review) |
| A2 Sign-in, captain names and cloud progress | `GET /api/me` returning `{captainName, coins, kit, place}`; `PUT /api/save {version, data}`, with 409 for a stale version; `DELETE /api/me`; the check `require_host` (403 for players); `content/names.json` | draft |
| A3 Referee and entry kits | `POST /api/intro/complete {actions[]}` returning `{ending, decision, readLog, kit}`; the table `entry_profiles`; the kit coins through `kit_grant` with the fixed `ref` `kit` | draft |
| A6 Crews and seats | `POST /api/crews` (returns a crew code); `POST /api/crews/join {code}`; `GET /api/crews/me`; crew codes in a new column or table | draft |
| A7 Lantern Duels (the PvP arena) | `POST /api/duels`; `POST /api/duels/{id}/move`; `GET /api/duels/{id}`; the tables `duels` and `duel_moves`; the reasons `arena_stake` and `arena_payout`; the flag `arena` | draft |
| A4 Harbor presence (later) | The table `presence`; `POST /api/presence`, at most once every 2 seconds; `GET /api/harbor/peers`; the flag `live_presence` | draft |
| L1 Live weather | `GET /api/weather?place=` returning `{cloudCover, rain, fog, wind, isDay, source, fetchedAt}`; the event `weather_updated` | draft |
| L2 Your home islet | `GET /api/islet`; `POST /api/islet/build {plot, type, actionUid}`; the table `islets`; the event `plot_clicked`; `content/buildings.json`; coins through `building_purchase` | draft |
| L3 Captain's Table board and Night of Three Lights | `GET /api/board`; `POST /api/board/pin {cardId, actionUid}`; `POST /api/finale/signal {light, bearing, actionUid}`; `GET /api/world`; the tables `board_pins`, `finale_signals` and `world_state`; the event `finale`; rewards through `clue_reward` and `mystery_reward` | draft; defined by the story package S0 (skeleton under review) |
| L4 Island Exchange (the market) | **Built** (branch `feat/l4-island-exchange`): `GET /api/market`, `GET /api/market/portfolio`, `POST /api/market/trade {companyId, side, units, actionUid}`; the tables `market_bases`, `market_positions` and `market_trades`; the reasons `market_buy`, `market_sell` and `market_fee`; `backend/content/market/companies.json` and `replay.json`; the setting `MARKET_MULTIPLIER`; the flag `market`. See section 2 and D017. | built, in review |
| L5 Prediction desk | `GET /api/predictions`; `POST /api/predictions/stake {questionId, side, amount, stakeId}`; the table `prediction_stakes`; the reasons `prediction_stake` and `prediction_payout`; `content/questions.json`; the flag `predictions` | draft |
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
- A hand-picked allow-list of 20 to 40 questions in `content/questions.json`. Never list questions automatically: user-made questions can be personal or in bad taste. No wars, deaths or elections.
- Settlement: once a question is resolved and a grace period of about an hour has passed, the winners share the pool. CANCEL, or any result other than YES or NO, refunds everyone.

**Sports predictions (L6).**

- Football primary: football-data.org, free plan: 12 competitions and 10 calls a minute. A teammate registers. Their terms forbid keys in open-source repositories, so the key lives only in Vercel, as `SPORTS_API_KEY`. Show "Football data provided by the Football-Data.org API", and use team names as text, without crests.
- Football backup: OpenLigaDB. No key, an open licence, and made for prediction games. At most one call per league every 30 to 60 seconds during live games, from our server only. Volunteers enter the results, so confirm one with a second source before paying out.
- Basketball (NBA): balldontlie, with a free key and 5 calls a minute.
- Players stake play coins into a pool, and the winners share it. No bookmaker odds. Settle only on the final result. Refund everyone when a game is postponed, cancelled or suspended. Keep to league games or 90-minute results, to avoid extra-time rules.
- Vercel's cron runs at most once a day, so settle when someone opens their stakes after the game.

**The PvP arena (A7).**

- Turn-based duels between two players. The server decides every round with Python rules, and the browser only sends moves. The browser polls for the other player's move, so Realtime is not needed.
- Optional stakes in play coins: taken once and paid once, with the duel id in the `ref`. A duel that times out refunds both players. Preset emotes only, no free text.
- Do not build it on WebSockets in Vercel Functions: they are a Beta feature, and on Hobby a connection closes after 300 seconds.

## 10. The shared mystery

Everything about the shared mystery is **defined by the story package S0 (skeleton under review)**: the cards and deductions, the case clock, the finale, the accusation, the orders and lines of NPC partners, the rewards and the rule that keeps spoilers away from crews that have not solved the case. This page only reserves the names other packages will build (S3, S4, L3 and G4 in [section 9](#9-reserved-interfaces)). Until S0 is approved, treat those shapes as placeholders.

What already holds, from the foundation: a reward is paid with `clue_reward` or `mystery_reward` and a `ref` that makes each payout happen once per player, buying a clue uses `clue_purchase`, and a crew's seats can hold NPC partners ([section 6](#6-crews-and-seats)).

## 11. Open questions for Mon 9

1. **JSON names.** Confirm camelCase in JSON (`demoMode`, `actionUid`) and snake_case in Python and SQL.
2. **Repeats.** What does a route answer when an `actionUid` comes a second time: the first answer again, or `409 already_applied` like the wallet? (The Island Exchange follows the wallet: `409 already_applied`.)
3. **Switched-off features.** Which status and code does a route answer while its flag is off? (The Island Exchange answers `404 feature_off` on its player routes, and its public price board works anyway.)
4. **The keep-alive call.** Vercel Cron, a GitHub Actions schedule (only with Nils' OK) or Supabase Cron, decided after the first deploy ([SETUP.md](SETUP.md), Step 5, check 3).
5. **Browser contracts after the final look.** G1 confirms that the event bus, the four story trigger ids and `setWeather` stay as written in section 3 when D005 is recorded.
