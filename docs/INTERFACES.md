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
| Live presence: the rooms, the messages, the `live_*` events | The header comment of `frontend/src/online/realtime.js` (it joins the parts in `frontend/src/net/`: `live-rules.js` holds the rules, `live-rooms.js`, `live-places.js`, `live-sender.js` and `live-view.js` do the work), the access rules in `supabase/migrations/20261106050000_live_presence.sql`, and [section 7](#7-realtime-budget) here. The server side is `backend/server/crew_broadcast.py`. |

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
| 403 | `forbidden`, `not_your_duel` | Signed in but not allowed. `POST /api/predictions/settle` requires `HostDep`; a visitor gets 401 first. A player may read or act only in their own duel. | Show the message. Do not retry unchanged. |
| 404 | `not_found`, `feature_off`, or a feature-specific missing-item code | Unknown route, player, company, position, question, duel, plot or building. Crew routes add `wrong_code` and `no_crew`. Exact feature codes are listed with the routes below. | Show the message. |
| 405 | `method_not_allowed` | The wrong method, for example `POST` to a `GET` route. | Fix the caller: it is a bug. |
| 409 | `insufficient_funds`, `already_applied`, `stale_save`, or a feature refusal | Saved state changed or an action cannot run now. Account and crew repeats remain safe. Exchange v2 adds `market_closed`, `prices_stale`, `company_unavailable`, `company_delisted`, `daily_stake_cap`, `too_many_positions`, `position_closed` and `wrong_price_mode`; prediction and duel refusals are listed below. | Show the message; refresh when state changed. |
| 422 | `validation_error`, `invalid_transaction`, or a feature validation code | Bad shape, extra fields, invalid move or stake. `stake_too_small` and `stake_too_big` are shared: Exchange stakes are 10 to 500 coins, prediction stakes 1 to 50. Account and islet validation codes are listed below. | Fix the input before resending. |
| 429 | `too_many_requests`, `too_many_attempts` | The feature rate limit was reached. Crew wrong-code waits, Exchange calls and the prediction and duel limits keep their own budgets. `Retry-After` gives the wait in seconds. | Wait, then retry. |
| 500 | `server_error` | A bug on our side. The details go to the server log only. | Say "something went wrong". |
| 502 | `database_error` | The database refused the call or answered strangely. | Say "something went wrong". |
| 503 | `auth_not_configured`, `auth_unavailable`, `database_not_configured`, `database_unavailable`, `source_unavailable`, `not_configured`, or a feature unavailable code | A required setting, database, source or content file is unavailable. Exchange v2 exposes missing per-company prices in its board rather than relying on the old v1 Binance-only error. A write timeout leaves its outcome unknown. | Retry safely using the same action identifier or ref. |

## 2. Routes that exist now

Case Phases 1 and 2 are specified in [section 10](#case-phase-1-contract-for-g9); keep the flag off until the required migrations are applied.

There are 42 API operations, including nine case operations: the foundation and account routes, crews, the home islet and bulletin, four Island Exchange operations, four prediction desk operations and five Lantern Duels operations. Start the API with the commands in [ENGINEERING.md](ENGINEERING.md#3-commands). The route contracts below describe their request, answer and refusal shapes.

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

Who am I in the game? For signed-in players only. It answers with the caller's own display name, captain name, coins, crews, entry kit and start place. The server reads them with its secret key and a filter on the verified player id (never an id from the request), so the answer can never hold another player's data. Its first user is the sign-in check page, `/auth-check.html` (a plain file in `frontend/public/`: a team check page, not the game, that signs in with GitHub and prints one line from this route).

```text
GET /api/me
Authorization: Bearer <token>

200 OK
Cache-Control: private, no-store
{"id": "3fa85f64-5717-4562-b3fc-2c963f66afa6", "displayName": "Captain-3fa85f", "coins": 0, "crews": [],
 "captainName": null, "kit": null, "place": null}
```

| Field | Meaning |
|---|---|
| `id` | The player's id, from the verified sign-in |
| `displayName` | `profiles.display_name`. Never the GitHub login name or e-mail address. |
| `coins` | `wallets.balance`. A new wallet holds 0, which is a normal answer. |
| `crews` | The crews the player sits in, newest seat first, at most 20. Each one is `{"id", "mode", "status", "seatNo"}`: the crew id, `solo` or `crew`, `forming`, `active` or `finished`, and the player's own seat number (1 to 4). Empty for a player in no crew. |
| `captainName` | The generated captain name, for example `Brave Puffin 17`, once the player has one. `null` while `displayName` is still the sign-up placeholder. `POST /api/me/name` gives the name. This route never does: a GET changes nothing. |
| `kit` | The id of the player's entry kit (`true_keeper`, `witness`, `informant` or `stranger`) once they have finished Act 1, otherwise `null`. It comes from the table `entry_profiles`, which `POST /api/intro/complete` fills in (package A3). |
| `place` | The id of the player's start place, which comes with the kit (`lighthouse_isle` or `saltreach_harbor`), otherwise `null`. It comes from the same row of `entry_profiles` as `kit`. |

| Case | Answer |
|---|---|
| A good token, and the profile and wallet rows are found | `200` as above |
| No `Authorization` header, a malformed one, or a token Supabase refuses | `401 unauthorized`, with `WWW-Authenticate: Bearer` |
| Login is not set up here, or cannot be reached | `503 auth_not_configured` or `503 auth_unavailable` |
| A good token, but the player has no profile or wallet row: the account was made before the migration was applied, so the sign-up trigger never ran for it | `404 player_not_set_up`. A teammate deletes the user under Authentication > Users and the player signs in again ([supabase/README.md](../supabase/README.md#if-someone-signed-in-before-you-ran-the-migration)). |
| `SUPABASE_URL` or `SUPABASE_SECRET_KEY` is not set | `503 database_not_configured` |
| The database cannot be reached | `503 database_unavailable` |
| The database refuses a read, or answers with something we cannot read | `502 database_error` |

The answer is never cached. The player id stays out of the server's logs. Package A2 added `captainName`, `kit` and `place`, and package A3 fills `kit` and `place` from the entry profile ([section 9](#9-reserved-interfaces)); the four older fields did not change. The route makes four reads, and the entry profile is the last: a server that is deployed before the entry profiles migration is applied answers `502 database_error` to every player. This route is live today, and a push to `main` deploys to production at once, so apply the migration **before the branch is merged into `main`** (previews share the same database, so the same goes for testing a preview). See [supabase/README.md](../supabase/README.md#apply-before-you-merge).

### POST /api/me/name and /reroll

The generated captain name (package A2, decision D006). At sign-up every player has a neutral placeholder (`Captain-3fa85f`). Names appear on a projector, so a real name is never taken from the login and never typed in: the server picks one from the word lists in `backend/content/names.json` (an adjective, a noun and a number from 10 to 99, for example `Brave Puffin 17`). A player gets one name and may re-roll it once. For signed-in players only; the home of both routes is the comment at the top of `backend/server/routes/captain_name.py`.

```text
POST /api/me/name
Authorization: Bearer <token>

200 OK
Cache-Control: private, no-store
{"captainName": "Brave Puffin 17", "rerollsLeft": 1}

POST /api/me/name/reroll
Authorization: Bearer <token>
{"actionUid": "r8x2k9m4"}

200 OK
{"captainName": "Calm Gannet 42", "rerollsLeft": 0}
```

| Case | Answer |
|---|---|
| `POST /api/me/name` for a player who has the placeholder | `200` with the new name and `rerollsLeft: 1` |
| `POST /api/me/name` again | `200` with the same name. The name is written only while the placeholder is there, so a repeat changes nothing. |
| `POST /api/me/name/reroll` with the first re-roll | `200` with a name that differs from the current one and `rerollsLeft: 0` |
| The same `actionUid` again | `409 already_applied`. Treat it as done. |
| Any other re-roll after the first | `409 no_rerolls_left` |
| A re-roll before the first name | `409 no_name_yet`: call `POST /api/me/name` first |
| `actionUid` missing, not 8 to 64 characters of A-Z a-z 0-9 _ -, or any extra field (a player id, a name) | `422 validation_error`. Nothing was called. |
| The player has no profile row | `404 player_not_set_up` |
| No token, login or database trouble | As for `GET /api/me` (`401`, `502`, `503`) |

Two requests at the same moment cannot give a player two names or two re-rolls: both are one step inside the database (`assign_captain_name()` and `reroll_captain_name()`). A name from the login (the GitHub login, the e-mail address) never appears.

### GET and PUT /api/save

The player's progress in the cloud, so they can go on at a second device (package A2, decision D022). The save is the browser's own progress (the local Act 1 state, settings). The server never trusts it for coins, kits, names or crews. For signed-in players only; the home of both routes is the comment at the top of `backend/server/routes/save.py`.

```text
GET /api/save
Authorization: Bearer <token>

200 OK
Cache-Control: private, no-store
{"version": 3, "data": {"intro": {"scene": "shore"}}, "updatedAt": "2026-11-06T10:15:02Z"}

PUT /api/save
Authorization: Bearer <token>
{"version": 3, "data": {"intro": {"scene": "tower"}, "settings": {"sound": true}}}

200 OK
{"version": 4, "updatedAt": "2026-11-06T10:15:30Z"}
```

`version` is the version the browser last read. The save is written only if it still has that version, and then the version goes up by one. So an old copy on a second device can never overwrite newer progress.

| Case | Answer |
|---|---|
| `PUT` with the current version | `200` with the next version |
| `PUT` with an old version (another device saved first), or the same `PUT` again | `409 stale_save`. Nothing was changed. Read the newest save with `GET /api/save`, then save again. |
| More than 100,000 bytes of compact JSON (counted in UTF-8 bytes) | `422 save_too_big`, before the database is called. The database checks 200,000 bytes of its own JSON text as well, and answers the same. |
| `NaN` or `Infinity` in the data | `422 save_not_json` |
| `version` not a whole number from 1 to 2147483647 (the largest number the database column holds), `data` not a JSON object (a list, text, `null`), or an extra field | `422 validation_error` |
| The player has no save row | `404 player_not_set_up` |

### DELETE /api/me

"Delete my data" (package A2, decision D022, pending Nils' OK because it touches personal data). For signed-in players only; the home is `backend/server/routes/delete_me.py`.

```text
DELETE /api/me
Authorization: Bearer <token>
{"confirm": true}

200 OK
Cache-Control: private, no-store
{"deleted": true}
```

It deletes the login and every row of the player: the profile, save, wallet, **all ledger rows**, seats, Island Exchange positions and trades, the name re-roll, and the tables later packages add (every table that holds a player id references `profiles(id) on delete cascade`). The ledger keeps nothing about the player: the coins are play money and nothing real is owed. A crew the player started that other players sit in is handed to the player in the lowest seat first, so friends keep their game, and the deleted player's seat is open again. A crew nobody else sits in is deleted with them. One database function does all of it in one step (`delete_player()`). The handover happens only there: deleting a user in the Supabase dashboard skips it and deletes the crews they started.

**Not deleted:** Supabase Auth's audit log (`auth.audit_log_entries`, which can hold the login e-mail address and an IP address, and has no foreign key to `auth.users`) and Supabase's platform logs, which expire on Supabase's own schedule. Whether to purge those audit rows, or to stop Auth writing its audit log to the database, is part of the decision that is pending Nils (N4, D022).

| Case | Answer |
|---|---|
| `confirm` is `true` | `200 {"deleted": true}`, also if the player was gone already. Deleting twice is safe. |
| `confirm` missing, `false`, `1`, `"yes"`, or any extra field | `422 validation_error`. Nothing was deleted. |
| The database does not answer | `503 database_unavailable`, and the outcome is unknown: the player may be deleted already. The message says deleting twice is safe. |
| No token, login trouble | `401`, `503` as for `GET /api/me` |

The server remembers a good login token for 60 seconds, so on the same server instance the old token can pass the login check for a moment after the deletion. A read in that time answers `404 player_not_set_up`. That is accepted.

### POST /api/intro/complete

The referee (package A3, decision D019). At the end of Act 1 the browser sends the moves it made, in order. The server plays the same moves again with the original story engine on its own copy of the story, works out how the story ended, and gives the player one of four entry kits: True Keeper, Witness, Informant or Stranger. A kit sets the start place, the coins, a clue card and a small item. The browser never sends an ending, a decision or a kit: any field but `actions` is refused. For signed-in players only; the home of this route is the comment at the top of `backend/server/routes/intro.py`.

```text
POST /api/intro/complete
Authorization: Bearer <token>
{"actions": ["to_desk", "take_key", "desk_back", "to_shore", "take_lantern", "warn_harbor",
             "shore_back", "to_tower", "unlock_door", "climb", "untie"]}

200 OK
Cache-Control: private, no-store
{"ending": "ending_trapped", "decision": "warned", "readLog": false,
 "kit": {"id": "witness", "name": "Witness", "startPlace": "saltreach_harbor", "coins": 1000,
         "item": {"id": "radio_words", "name": "Words through the door", "text": "..."},
         "cheapCard": "C2"},
 "coinsPaid": 1000, "alreadyGranted": false}
```

| Field | Meaning |
|---|---|
| `actions` (request) | 1 to 300 action ids of the story, in the order the player picked them. An id is 1 to 40 characters of a-z, 0-9 and underscore. |
| `ending` | The id of the Act 1 ending scene the replay reached: `ending_rescue` or `ending_trapped`. |
| `decision` | `warned` (the player sent the note to the harbor master), `trusted` (they told the fisherman) or `none` (they took no side). |
| `readLog` | `true` if the player read the keeper's last logbook entry. It gives the log card on the case board and does not change the kit. |
| `kit` | The kit: `id`, `name`, `startPlace`, `coins`, the small `item` and the `cheapCard` the player holds from the start. |
| `coinsPaid` | The coins this call paid: the kit coins the first time, otherwise `0`. |
| `alreadyGranted` | `true` if the player had an entry profile already. |

The 8 end states of today's story map to 4 kits (the full table and the file format are in [backend/content/README.md](../backend/content/README.md#the-format-of-entry_kitsjson)):

| Ending | Decision | Kit | Start place | Coins |
|---|---|---|---|---|
| `ending_rescue` | `warned` | True Keeper | `lighthouse_isle` | 1000 |
| `ending_trapped` | `warned` | Witness | `saltreach_harbor` | 1000 |
| `ending_trapped` | `trusted` | Informant | `saltreach_harbor` | 1000 |
| `ending_trapped` | `none` | Stranger | `saltreach_harbor` | 1600 |

| Case | Answer |
|---|---|
| A good log, the first time | `200`, `coinsPaid` is the kit coins, `alreadyGranted` is `false` |
| A good log, and the player has an entry profile already | `200` with the **stored** ending, decision, `readLog`, kit, start place and coins, `coinsPaid: 0` and `alreadyGranted: true`. The new log changes nothing. |
| `actions` missing, empty or longer than 300, an odd id, or any extra field (a kit, an ending, a player id) | `422 validation_error`. Nothing was stored. |
| A move the story does not allow at that point (an unknown id, a move of another scene, a blocked move such as the tower door without the key, any move after the ending) | `422 move_refused`. The message names the first bad move, for example "Move 2", and tells the player to reload and play Act 1 again. Nothing was stored. |
| The moves stop before an ending | `422 no_ending`. Nothing was stored. |
| The player has no profile row | `404 player_not_set_up` |
| The story or the kits file cannot be read on this server | `503 intro_unavailable`. Nothing was stored. |
| The database does not answer | `503 database_unavailable`, and the outcome is unknown: the kit may have been granted before the call timed out. Send the same request again (it is safe) or look at `GET /api/me`, which shows `kit` once it is granted. |
| No token, login or database trouble | `401`, `502`, `503` as for `GET /api/me` |

- **A forged log stores nothing.** The log is replayed and refused before the database is called.
- **The first ending counts** (pending Nils' decision N6). A second playthrough never changes the kit and pays nothing. The answer is built from the stored profile, so a double click, a retry after a timeout and a second playthrough all answer the same. This is why the route has no `actionUid`.
- **The coins move exactly once**, inside the database function `grant_entry_kit()`: it stores the profile and calls the wallet function in one step, with the reason `kit_grant` and the fixed `ref` `kit`. The ledger accepts that pair once per player, so even a bug could not pay twice. The route checks the amount with the wallet rules first and never calls the wallet itself.
- **No story version in the request.** The server replays on the story it has and stores the SHA-256 of that file with the profile, for audits. Story v2 only adds actions, so an old log still replays to the same end state. A log that only a newer story allows (for example `keep_quiet` before Story v2 is deployed) is refused as `move_refused`.
- **The coins and texts of the kits** come from the S0 story drafts. They waited for Nils' approval of S0 (N5); the story round settled them (D018), and the kits in `secret/case.json` are the same.

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
{"cloudCover": 1.0, "rain": 0.0, "fog": 0.0, "wind": 0.2, "isDay": false, "summary": "Overcast", "place": "Torshavn, Faroe Islands", "source": "live", "fetchedAt": "2026-11-05T18:03:15Z", "attribution": "Weather data by Open-Meteo.com, adapted for the game", "state": "calm", "tonight": {"date": "2026-11-05", "startsAt": "2026-11-05T18:00:00Z", "endsAt": "2026-11-06T06:00:00Z", "isNow": true, "state": null, "isFogNight": false, "fogNightKind": null}}
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
| `state` | The weather state now: `storm`, `fog`, `rain` or `calm`, the first that applies in that order. A storm starts at a wind of 0.8 (48 km/h), fog at a fog of 0.5 and rain at a rain of 0.4 (the numbers are start values of the design, in `backend/content/weather_states.json`). Cloud cover never changes it. `null` only if that file could not be read when the server started. |
| `tonight` | The night in progress, or the next one: `date` (the Lisbon date it starts on), `startsAt` and `endsAt` (18:00 to 06:00 Lisbon time, in UTC) and `isNow` (true while it is going on). `state` is the state of the whole night, `null` when the answer has no hours for it (the recorded fallback and demo mode have none). `isFogNight` and `fogNightKind` (`real`, `almanac` or `null`) come from the fog-night rule below. The whole object is `null` only if the rules file could not be read. |

**The fog-night rule.** A night is a fog night if the night is in the fog state, or if neither of the last two nights was a fog night. So there is a fog night at least every third night, and the false-light teaser never stalls in a sunny week. `fogNightKind` is `real` when the weather made the night a fog night (this wins when both apply) and `almanac` when only the rule did ("by the harbor's almanac"). A night or a daytime takes a state when at least 3 of its hours have it (storm first, then fog, then rain, otherwise calm). The rule looks back 30 nights from tonight, and assumes the almanac's pattern, one fog night in every three counted from Day 1 (16 Nov 2026), for the nights before that. The hours come from the same Open-Meteo call as the four values: it also asks for 31 past days and 3 forecast days of hourly weather in UTC. Tonight's real fog follows the latest forecast and then the hours that were seen, so it can appear or go during the day or the night. Details are in `backend/server/weather/fog_nights.py`. **The screens show the false light only before the first solve.** This route always sends the verdict, because after the first solve fog is only weather. Desk questions about the weather (package L5) settle on real fog only: after the night has ended, from its observed hours (the night's state is fog, `backend/server/weather/nights.py`), never from the forecast-based `tonight` of this route.

| Case | Answer |
|---|---|
| Open-Meteo answers | `200`, `source` is `live`, or `cache` for the next 10 minutes |
| Open-Meteo is down, but an earlier answer exists | `200`, `source` is `stale`, with the time of that earlier answer |
| Open-Meteo is down from the start | `200`, `source` is `fallback`: one real answer recorded in `backend/content/weather/`, with its own place name and time |
| Demo mode (`DEMO_MODE=true`) | `200`, `source` is `fallback`; Open-Meteo is never called |
| Nothing at all: down, and the recorded file is missing or broken | `503 source_unavailable` |
| `backend/content/weather_states.json` could not be read when the server started | `200`, and `state` and `tonight` are `null`; the other fields are the same |
| Any other method than `GET` | `405 method_not_allowed` |

Only a `200` carries `Cache-Control: public, max-age=300`, so a browser may reuse it for 5 minutes. The open question for Mon 9 about the default place is in [section 11](#11-open-questions-for-mon-9).

### GET /api/bulletin

The harbor bulletin (open-world must items "the daily frame" and the Chapter 2 hook, see `specs/open-world-must.md`). Anyone may call it, and it holds no secret. It takes no input: a query string and an `Authorization` header are ignored. Every player gets the same answer. The one line that differs by crew, the cheapest next lead, is served signed in by package S3 (for example `GET /api/bulletin/lead`), so this answer stays public and cacheable. It is worked out when somebody asks, from the clock, the weather the server already fetches (the same cached source as `GET /api/weather`, so it causes no extra Open-Meteo request), the stage of the world and two content files that only the server reads: `backend/content/bulletin.json` and `backend/content/chapter_two_hook.json`. There is no timer and no table.

```text
GET /api/bulletin

200 OK
Cache-Control: public, max-age=300
{"day": {"id": "2026-11-16", "startedAt": "2026-11-16T00:00:00Z", "nextDayAt": "2026-11-17T00:00:00Z",
         "bulletinDay": "2026-11-16", "publishedAt": "2026-11-16T08:00:00Z",
         "nextBulletinAt": "2026-11-17T08:00:00Z", "harborWeek": "2026-11-16",
         "nextHarborWeekAt": "2026-11-23T00:00:00Z",
         "resets": [{"when": "Every day at 00:00", "what": "A new game day begins."}, ...]},
 "lines": [{"kind": "weather", "text": "Tonight: fog. Tomorrow: calm and clear."},
           {"kind": "fog", "text": "Fog tonight. Watch for the false light."},
           {"kind": "calendar", "text": "Day 1. From today the harbor bulletin comes out every morning at 8."}],
 "weather": {"tonight": {"date": "2026-11-16", "startsAt": "2026-11-16T18:00:00Z",
                         "endsAt": "2026-11-17T06:00:00Z", "isNow": false, "state": "fog",
                         "isFogNight": true, "fogNightKind": "real"},
             "tomorrow": {"date": "2026-11-17", "startsAt": "2026-11-17T06:00:00Z",
                          "endsAt": "2026-11-17T18:00:00Z", "state": "calm"},
             "source": "live", "fetchedAt": "2026-11-16T08:55:00Z",
             "attribution": "Weather data by Open-Meteo.com, adapted for the game"},
 "exchange": null,
 "chapterTwoHook": null}
```

| Field | Meaning |
|---|---|
| `day` | The Lisbon clock around now. `id` is the game day (the Lisbon date, 00:00 to 24:00: daily caps reset when it changes). `bulletinDay` is the date of the latest 08:00 (the bulletin is published then, and the Island Exchange starts its market day then too). `harborWeek` is the Monday of the Lisbon week. Each comes with the time the next one begins (`nextDayAt`, `nextBulletinAt`, `nextHarborWeekAt`, in UTC). A day is 23 or 25 hours long on the two clock-change days (28 Mar and 31 Oct 2027), because everything is worked out on the `Europe/Lisbon` clock. `resets` says what resets when, from `bulletin.json`, for a help box. |
| `lines` | The text lines to show, in this fixed order, at most one of each kind: `weather` ("Tonight: ... Tomorrow: ..." with a word for each state, or "no forecast"); `fog` (only while the coast is dark and tonight is a fog night; one text for `real` and one for `almanac`); `exchange` (the price feed and the paused companies, only while the flag `market` is on and the board answers); `relit` (for 48 hours after the first solve); `hook` (the Chapter 2 hook, in the bulletin of the morning it fires); `calendar` (the dated notice of the bulletin day, if there is one). |
| `weather` | `tonight` is the same object, made by the same function, as `tonight` in `GET /api/weather`. `tomorrow` is the daytime after tonight (06:00 to 18:00 Lisbon time): `date`, `startsAt`, `endsAt` and `state`. `source`, `fetchedAt` and `attribution` say where the weather comes from, and the credit travels with it because the licence asks for credit wherever the data is shown (the same three conditions as for `GET /api/weather`). |
| `exchange` | `{"feed": "live", "pausedCompanies": [{"id": "harbor-trust", "name": "Saltreach Harbor Trust"}]}` while the flag `market` is on and the price board can be made, otherwise `null`. `feed` is `live`, `cache`, `stale` or `replay`. The bulletin only looks at the Exchange: it saves nothing. |
| `chapterTwoHook` | `null` while the coast is dark, and until the hook fires. After that: `{"id": "chapter_two_hook", "notice": {"title", "text"}, "beam": {"chart": {"x", "y"}, "pattern": ["short", "short", "long"], "flash": {"shortSeconds", "longSeconds", "gapSeconds", "pauseSeconds"}}}`. The notice is for the Saltreach Harbor notice board; the beam is data for the sea chart (the chart is 448 by 256). The hook fires at 06:00 Lisbon time at the end of the first calm night among the first three nights that start after the first solve, or at the end of the third of them. It looks only at nights that are over, and once fired it is visible for good. The notice describes the flashes in words and names no exact pattern. |

| Case | Answer |
|---|---|
| Normal | `200` as above, with `Cache-Control: public, max-age=300` |
| Open-Meteo is down and nothing is recorded | `200`. `weather.source`, `fetchedAt` and `attribution` are `null`, the states are `null` (the lines say "no forecast") and the harbor's almanac still decides the fog nights. |
| The flag `market` is off, the Exchange has no service, or its board cannot be made | `200` with `exchange: null` and no `exchange` line |
| The world stage cannot be read (the reader of package L3 raises an `ApiError`; any other error is a `500`) | `200` without the `fog`, `relit` and `hook` lines, and `chapterTwoHook: null` |
| `bulletin.json`, `chapter_two_hook.json` or `weather_states.json` could not be read when the server started | `503 bulletin_unavailable` |
| Any other method than `GET` | `405 method_not_allowed` |

Until package L3 builds the table `world_state` and its reader, the coast is always dark (`create_app` uses `AlwaysDark`), so `relit`, `hook` and `chapterTwoHook` do not appear yet. Nothing in this answer names the culprit or the case's answers, before or after the first solve (CASE-FILE 14.3, the spoiler rule). The two content files are not on the public list of `GET /api/content/{name}`.

### GET /api/keepalive

Keeps the free Supabase project awake ([ARCHITECTURE.md](ARCHITECTURE.md#the-7-day-pause-and-the-keep-alive)). Only a caller that sends the keep-alive secret may use it. It reads one row from `profiles`, `wallet_reasons` and `crews`, stops at the first read that fails, and never answers with database text. A daily GitHub Actions workflow (`.github/workflows/keepalive.yml`) calls it, as Nils decided on 5 Nov 2026 (question 4 in [section 11](#11-open-questions-for-mon-9)). It is not Vercel Cron: a `crons` entry in `vercel.json` breaks our deploys while we use Vercel Services, so never add one. The header below is the one Vercel Cron would have sent. Any caller we choose sends the same header.

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

Real companies at their real prices, one to one. Every investment is a **position**: a stake of 10 to 500 coins at 10x, rising or falling. A 1 % move of the price changes the position by 10 % of the stake. If the price moves 10 % against the position, the stake is used up and the position closes by itself at zero. The home of each route is the comment at the top of `backend/server/routes/market.py` (and its Pydantic models); the rules are in `backend/server/market/` and are explained in [D017](DECISIONS.md#d017--island-exchange-rules--2026-11-05) and in the spec [specs/L4-exchange-v2.md](../specs/L4-exchange-v2.md). Play money only: every board carries a line that says "simulation with play money". JSON is camelCase, times are UTC with whole seconds, prices are JSON numbers and coins are whole numbers. All numbers are worked out by the server: the screen does no arithmetic.

| Route | Who | What it does |
|---|---|---|
| `GET /api/market` | anyone, and it works while the flag `market` is off | The board: seven invented island companies that follow Binance (BTC, ETH, SOL, XRP, BNB, EUR/USD as EURUSDT and gold as PAXG), then, once the stock source is on, five real US stock companies. Each company has its real price (`price`), when it was quoted (`priceAt`), where it came from (`source`: `live`, `cache`, `stale`, `replay` or `none`), a `status` (`open`, `closed`, `stale` or `unavailable`) with a `reason`, its opening times, `canOpen` and `canClose`, and, for open companies, an estimate of the zero points (`zeroPrices`). The board also carries the rules (`rules`, with the stake choices and their fees), the credit lines (`credits`), the demo label (`demo`, `demoNote`), `relit` and a simulation note. Cached for 30 seconds (`Cache-Control: public, max-age=30, s-maxage=30`), so it takes no query parameters (`422`). While the flag is off it only looks and runs no automatic close. A price problem is the status of one company, never a 503. |
| `GET /api/market/portfolio` | signed in, flag `market` on | The player's coins, their open positions (at most 20, newest first) with value, profit, the fee a close would cost and what they would receive, the 10 newest closed positions, the stakes of today and the limits. The automatic close for this player runs first. Never cached. |
| `POST /api/market/open` | signed in, flag `market` on | `{companyId, side: "rising" or "falling", stake, actionUid}`. The browser never sends a price: the server takes the shared price of that moment, at most 5 seconds old, and works out every coin. It answers with the new position (`positionId`, `entryPrice`, `zeroPrice`), the fee, `coinsChange` (minus stake and fee), the new balance and `feePercent`. |
| `POST /api/market/close` | signed in, flag `market` on | `{positionId, actionUid}`. The server closes the position at the price of that moment and answers with `closedAs` (`closed`, or `zeroed` if the stake was used up), `closePrice`, `value`, `fee`, `coinsChange` and the new balance. |

```text
GET /api/market

200 OK
{"generatedAt": "2026-11-06T12:05:03Z", "demo": false, "demoNote": null, "tradingEnabled": true, "relit": false,
 "companies": [
   {"id": "harbor-trust", "name": "Saltreach Harbor Trust", "ticker": "SHT", "kind": "island", "follows": "Bitcoin",
    "market": "always", "marketName": "Around the clock", "currency": "USDT", "priceDecimals": 2,
    "tagline": "The old harbor bank. When it moves, the whole market feels it.",
    "price": 76159.21, "priceAt": "2026-11-06T12:05:00Z", "source": "cache",
    "status": "open", "reason": null, "holiday": null, "opensAt": null, "closesAt": null,
    "delisted": false, "canOpen": true, "canClose": true,
    "zeroPrices": {"rising": 68543.289, "falling": 83775.131}},
   {"id": "apple", "name": "Apple", "ticker": "AAPL", "kind": "stock", "follows": "Apple Inc. shares (Nasdaq)",
    "market": "us", "marketName": "New York (NYSE and Nasdaq)", "currency": "USD", "priceDecimals": 2,
    "tagline": "Phones, laptops and the shop in every pocket.",
    "price": 271.2, "priceAt": "2026-11-05T20:59:59Z", "source": "cache",
    "status": "closed", "reason": "outside_hours", "holiday": null,
    "opensAt": "2026-11-06T14:30:00Z", "closesAt": null,
    "delisted": false, "canOpen": false, "canClose": false, "zeroPrices": null}],
 "rules": {"leverage": 10, "zeroPointMovePercent": 10, "feePercent": 2.0, "minStake": 10, "maxStake": 500,
           "dailyStakeCap": 2000, "maxOpenPositions": 20,
           "stakeChoices": [{"stake": 10, "fee": 1, "total": 11}, {"stake": 100, "fee": 2, "total": 102}, "..."],
           "tradePriceMaxAgeSeconds": 5, "tradesPer30Seconds": 10, "gameDayStarts": "08:00 Europe/Lisbon"},
 "credits": [{"text": "Real prices from Binance market data.", "href": null, "licenceText": null, "licenceHref": null}],
 "simulationNote": "Simulation with play money. Real names and real prices, no real money and no prizes."}

POST /api/market/open
Authorization: Bearer <token>
{"companyId": "harbor-trust", "side": "rising", "stake": 100, "actionUid": "5d2c9f7e-3b1a-4c8e-9f20-6a7b8c9d0e1f"}

200 OK
{"positionId": "2f0c...", "companyId": "harbor-trust", "side": "rising", "stake": 100, "fee": 2,
 "coinsChange": -102, "coins": 838, "entryPrice": 76159.21, "zeroPrice": 68543.289,
 "feePercent": 2.0, "openedAt": "2026-11-06T12:05:04Z"}

POST /api/market/close
Authorization: Bearer <token>
{"positionId": "7b3e...", "actionUid": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"}

200 OK
{"positionId": "7b3e...", "closedAs": "closed", "closePrice": 76159.21, "value": 115, "fee": 2,
 "coinsChange": 113, "coins": 951, "closedAt": "2026-11-06T12:06:10Z"}
```

`GET /api/market/portfolio` answers `{coins, demo, feePercent, stakedToday, dailyStakeCap, openCount, maxOpenPositions, positions, recentlyClosed, generatedAt}`. A position has `{id, companyId, name, ticker, follows, currency, priceDecimals, side, mode, stake, openFee, entryPrice, zeroPrice, openedAt, price, priceAt, companyStatus, companyReason, opensAt, value, profit, profitPercent, closeFee, wouldReceive, result, canClose}`; a closed position has `{id, companyId, name, currency, priceDecimals, side, mode, stake, openFee, entryPrice, zeroPrice, openedAt, closedAs, closePrice, closedAt, value, closeFee, coinsChange, result}`. `currency` and `priceDecimals` say how to show the prices of the position, as on the board, so a position needs no board to be shown. A position that has no price (the company has no price yet, left the file, or was opened on the other kind of prices, `companyReason` `wrong_price_mode`) has `price`, `value`, `profit`, `profitPercent`, `closeFee`, `wouldReceive` and `result` set to null, and `canClose` false. A position whose company left `companies.json` also has `ticker`, `follows`, `currency` and `priceDecimals` set to null, and its `name` is the company id. A position with `companyReason` `wrong_price_mode` was opened on the other kind of prices than the server plays now (`mode` says which): a live one on a demo server or a recorded one on a live server. It is listed and cannot be closed until the server plays that kind of prices again.

The rules in one list (numbers in `backend/server/market/positions.py`):

- **Positions.** Value = stake x (1 + 10 x change) for a rising position and stake x (1 - 10 x change) for a falling one, where change = price / entry price - 1. It is counted in whole coins, rounded down, and never below 0. A rising position has no upper limit; a falling one is worth at most 11 times its stake. The **zero point** is 90 % of the entry price (rising) or 110 % (falling). At or beyond it the position is used up and closes at zero; a jump past the point closes it at zero too. Nobody loses more than the stake plus the opening fee, and nobody owes coins.
- **Fees and limits.** The fee is 2 % of the stake, rounded up, when a position opens and again when it closes (taken from the value, never more than it); 1 % after the Relighting. A stake is 10 to 500 coins. A player stakes at most 2000 coins per game day (from 08:00 Lisbon time) and has at most 20 open positions. Positions stay open across days; there is no minimum holding time. A player may make at most 10 trades in 30 seconds (`429`).
- **Safe repeats.** The ledger ref of an opening is `market:open:<actionUid>` and of a closing `market:close:<actionUid>` (the `actionUid` is 8 to 64 letters, digits, hyphens or underscores). A repeat answers `409 already_applied` and changes nothing: it is the first thing the server checks after the speed limit, before the stake, the company and the prices, so it is the answer to a repeat whatever has changed since. An opening writes two ledger rows with its ref (`market_stake` and `market_fee`); a closing writes `market_payout` (if the value is above 0) and `market_fee` (if the fee is above 0). A close at zero moves no coins and has no ledger row, only a history row.
- **Market hours.** An island company trades around the clock. A stock company trades only while its market is open (New York, Euronext or Xetra, from `backend/content/market/calendars.json`, valid from 6 Nov to 31 Dec 2026). While its market is closed, or a price source is away, a company shows its last price with a label and cannot be traded, and no position of it is closed or used up (`409 market_closed` or `409 prices_stale`).
- **The automatic close.** There is no timer, so the server closes used-up positions whenever it has prices in hand: on every board look, every opening, every closing and every portfolio look, with one call of the database function `exchange_close_used_up()`. It uses only prices of companies that are open, and a price closes only positions that were opened before it was quoted. A failed sweep is logged and never fails the answer. A dip past the zero point that comes and goes between two looks is missed (in the player's favour).
- **One shared price, fresh for trades.** The board accepts prices up to 60 seconds old, so one server instance asks a source at most once a minute. **A trade accepts only prices at most 5 seconds old** and asks again if the cache is older (a rush at the same moment is one request). After a failed request Binance is asked again after 10 seconds, the stock provider after 30. The stock provider is also held to 25 calls a minute per server instance. There is no price protection: a trade goes through at the server price of that moment.
- **Demo mode** (`DEMO_MODE=true`): the island companies play a public recording of 4 Nov 2026 (Binance Vision, CC BY-NC-SA 4.0), clearly labelled; the server never calls Binance or the stock provider and the stocks are hidden. Trading on it is allowed and changes real coins, so coins won on it must never count for anything real. A position opened on the recording (`mode` `replay`) can only be closed in demo mode and a live one only on live prices (`409 wrong_price_mode`).
- **The Relighting.** After it the fee is 1 % and Greyfathom Salvage takes no new positions (`409 company_delisted`); its open positions can still be closed. `MarketService` takes `relit_check`, an async function of the admin client; the default `never_relit` says no without asking anybody. L3 replaces it with a read of its `world_state`. A check that fails counts as "not relit".
- **The Greyfathom share (card C6).** `store.has_open_rising_position(admin, player_id, "greyfathom-salvage")` (`backend/server/market/store.py`) is what S3 calls for "holds a Greyfathom share": an open **rising** position in Greyfathom Salvage.
- **Errors.** `404 feature_off` (flag off), `404 no_such_company`, `404 no_such_position`, `409 already_applied`, `409 market_closed`, `409 prices_stale`, `409 company_unavailable`, `409 company_delisted`, `409 daily_stake_cap`, `409 too_many_positions`, `409 insufficient_funds`, `409 position_closed`, `409 wrong_price_mode`, `422 stake_too_small` or `stake_too_big`, `422 validation_error`, `429 too_many_requests`, `502 database_error`, `503 database_unavailable` (the outcome is unknown: the database did not answer in time, or answered an opening or closing with something that is not a refusal and cannot be read, so the coins may have moved; check the portfolio before trying again), `503 database_not_configured`, `503 market_unavailable`. The order of the checks of an opening is in the comment of `backend/server/routes/market.py`.

The Exchange needs the third migration (`supabase/migrations/20261106090000_exchange_leverage.sql`) for the portfolio, opening and closing. The board works without a database: it only skips the automatic close.

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

### Your home islet (package L2)

Every player has their own home islet, saved to their account. It has five spots, and each spot holds one kind of building: the cabin (`plot_1`, there from the start, free, no levels), the workshop (`plot_2`), the windmill (`plot_3`), the greenhouse (`plot_4`) and the signal station (`islet_signal_station`, the crew's third light in the finale). For now a player can build the workshop and the signal station. The windmill and the greenhouse show as "coming later" until timber has a second source. A level 1 building costs 300 coins and 10 timber, and every player gets 20 timber once, the starter pack. 20 timber buys exactly the station and the workshop, in either order, so nobody can spend the starter timber in a way that blocks the finale. Every number is in `backend/content/buildings.json`, which only the server reads. The home of each route is the comment at the top of `backend/server/routes/islet.py`; the rules are in `backend/server/game/` and are explained in [D021](DECISIONS.md#d021--home-islet-rules--2026-11-05). Play money only: every answer carries a line that says so.

Both routes are for signed-in players only. The player id comes from the verified sign-in, never from the request. There is no feature flag. Both answers carry `Cache-Control: private, no-store`.

| Route | What it does |
|---|---|
| `GET /api/islet` | The whole islet: `coins`, `timber`, `signalStationBuilt` and the five `spots` in the order of the place registry. Each spot has a `state` (`built`, `empty` or `locked`), its `cost`, what is `missing` (in the order `coins`, `timber`) and `canBuild`. The server decides `canBuild`; the browser only shows it. A player who has not built yet has no islet row, and the answer shows the starter pack. |
| `POST /api/islet/build` | `{plot, type, actionUid}` builds level 1. The server takes every price from `buildings.json`; the request carries no number (a `coins` or `playerId` field is a `422`). `type` confirms what the player means: a building on the wrong plot is a `422 wrong_plot`. The ledger reference is `islet:<actionUid>`, so a repeat can never build or charge twice. |

```text
GET /api/islet
Authorization: Bearer <token>

200 OK
Cache-Control: private, no-store
{"coins": 1000, "timber": 20, "signalStationBuilt": false,
 "playMoneyNote": "Play money. No cash value. It cannot be bought or cashed out.",
 "spots": [
  {"plot": "plot_1", "plotName": "Cabin plot", "type": "cabin", "name": "Cabin",
   "about": "Your home on the islet. It stands from the start and costs nothing.",
   "state": "built", "level": null, "builtAt": null, "cost": null, "missing": [],
   "canBuild": false, "lockedNote": null},
  {"plot": "plot_2", "plotName": "Workshop plot", "type": "workshop", "name": "Workshop", "about": "...",
   "state": "empty", "level": null, "builtAt": null, "cost": {"coins": 300, "timber": 10},
   "missing": [], "canBuild": true, "lockedNote": null},
  {"plot": "plot_3", "plotName": "Windmill plot", "type": "windmill", "name": "Windmill", "about": "...",
   "state": "locked", "level": null, "builtAt": null, "cost": {"coins": 300, "timber": 10},
   "missing": [], "canBuild": false,
   "lockedNote": "Opens when timber starts washing up on your beach, in a later update."},
  {"plot": "plot_4", "...": "..."},
  {"plot": "islet_signal_station", "plotName": "Islet signal station", "type": "signal_station",
   "name": "Signal station", "about": "...", "state": "empty", "level": null, "builtAt": null,
   "cost": {"coins": 300, "timber": 10}, "missing": [], "canBuild": true, "lockedNote": null}]}

POST /api/islet/build
Authorization: Bearer <token>
{"plot": "islet_signal_station", "type": "signal_station", "actionUid": "k3j9x2m4q8w1z7a0"}

200 OK
Cache-Control: private, no-store
{"plot": "islet_signal_station", "type": "signal_station", "name": "Signal station", "level": 1,
 "coinsPaid": 300, "timberPaid": 10, "coins": 700, "timber": 10}
```

`builtAt` is a UTC time without microseconds, such as `"2026-11-16T10:00:00Z"`. `actionUid` is made once per click (8 to 64 letters, digits, hyphens or underscores) and sent again if the request is repeated.

The checks of a build come in a fixed order, and the first one that fails is the answer. Every refusal changes nothing.

1. The sign-in (`401`), the data file (`503 islet_unavailable`) and the shape of the request (`422 validation_error`).
2. **A repeat.** If this player has built with this `actionUid` before, the answer is `409 already_applied` and nothing else is asked, whatever has changed since.
3. **The rules** of `backend/server/game/building.py`: `404 no_such_plot`, `404 no_such_building`, `422 wrong_plot`, `409 plot_occupied` (the cabin), `409 not_buildable_yet`.
4. **The wallet rules** for the charge (`422 invalid_transaction`; not possible with a checked file).
5. **The database function `islet_build()`**, in one step: `404 player_not_set_up`, `409 already_applied` (the same click was still running), `409 plot_occupied`, `409 not_enough_timber`, `409 insufficient_funds`, or done.

| Status | Code | Meaning |
|---|---|---|
| 401 | `unauthorized` | No sign-in, or a bad one. |
| 404 | `no_such_plot` | Not one of the five spots. |
| 404 | `no_such_building` | Not a building in `buildings.json`. |
| 404 | `player_not_set_up` | The player has no wallet row (the account was made before the migration). Same text as `GET /api/me`. |
| 409 | `already_applied` | This `actionUid` was used before. Treat the build as done. |
| 409 | `plot_occupied` | Something already stands on that plot. Always true for the cabin. |
| 409 | `not_buildable_yet` | The windmill and the greenhouse, until timber has a second source. |
| 409 | `not_enough_timber` | The player holds less timber than the building needs. |
| 409 | `insufficient_funds` | Not enough coins. |
| 422 | `wrong_plot` | That building belongs on another plot. |
| 422 | `validation_error` | A missing or extra field, a bad pattern, or a number where text belongs. |
| 502 | `database_error` | The database refused the call or sent a refusal we do not know. A bug, not something a player did. |
| 503 | `islet_unavailable` | `buildings.json` could not be read when the server started. The rest of the API works. |
| 503 | `database_unavailable` | **The outcome is unknown.** Call `GET /api/islet`. If the building stands, it is done. Otherwise try again with the **same** `actionUid`. |

**The finale (packages S3 and L3).** The crew's third light is a home signal station. Server code asks `players_with_signal_station(admin, crew_player_ids)` in `backend/server/game/islet_store.py` (one read, at most four ids). In SQL the same fact is `exists (select 1 from public.islet_buildings where player_id = <player> and building_type = 'signal_station')`. A signal station is never removed, so the answer can only change from "no" to "yes", and a check made before the finale's own transaction stays true. The case never charges for the station itself: the finale screen's "Build signal" button maps to `POST /api/islet/build`. `signalStationBuilt` in `GET /api/islet` is for the islet panel only.

The routes need the home islet migration (`20261106070000_home_islet.sql`). Until it is applied, `GET /api/islet` answers `502 database_error`, so do not pass the live transport (`transport: api` in `frontend/src/game.js`) before the migration is applied. Until then the panel runs in unavailable mode and sends no request.

### The prediction desk (package L5)

Hand-picked real questions from Manifold Markets (a play-money forecasting site), and play-coin pools that the winners share. The home of each route is the comment at the top of `backend/server/routes/predictions.py`; the rules are in `backend/server/predictions/` and are explained in decision D025 (provisional number, see [DECISIONS.md](DECISIONS.md)). Everything is behind the flag `predictions`, which stays off: while it is off, every route answers `404 feature_off` ("The prediction desk is closed for now."). Play money only: every answer of the list carries the line "Forecasting with play coins. Play money: no cash value. It cannot be bought or cashed out.", Manifold is credited in text, nothing links to a betting site, and Manifold's own probability is never shown.

| Route | Who | What it does |
|---|---|---|
| `GET /api/predictions` | anyone | The questions that a person has read, with their pools (coins and captains on each side, and `payoutPerCoin`, about how many coins one staked coin brings back if that side wins, rounded down to 2 decimals), the status (`open`, `closed`, `settled`), `canStake` (false, for example, while the only reading of Manifold is a `stale` one older than 15 minutes), what Manifold says (`manifold.state`: `open`, `closed`, `decided`, `unknown`), where that reading comes from (`source`: `live`, `cache`, `stale`, `fallback`) and when (`fetchedAt`), the numbers of the rules, the credit line (`attribution`) and the play-money line (`playMoney`). Cached for 10 seconds (`Cache-Control: public, max-age=10, s-maxage=10`), so it takes no query parameters (`422`). |
| `GET /api/predictions/mine` | signed in | The player's coins, what they staked today and how much they may still stake, their newest 50 stakes with the result (`won`, `lost`, `refunded`) and `host` (true or false). Sent with `Cache-Control: private, no-store`. |
| `POST /api/predictions/stake` | signed in | `{questionId, side: "yes" or "no", amount, stakeId}`, with any extra field refused. `amount` is a whole number from 1 to 50. `stakeId` is made once per confirmed click (8 to 64 letters, digits, hyphens or underscores) and sent again on a retry. The ledger reference is `stake:<stakeId>`. |
| `POST /api/predictions/settle` | host only (`HOST_PLAYER_IDS`) | `{questionId, outcome: "yes", "no" or "void"}`. The question id is the repeat key, because a pool settles once. A repeat answers `409 already_applied`. A retry after a `503` is always safe. |

```text
GET /api/predictions

200 OK
{"questions": [{"id": "avengers-opening-record", "text": "...", "topic": "culture",
       "decidedBy": "...", "closesAt": "2026-12-17T12:00:00Z",
       "status": "open", "canStake": true,
       "outcome": null, "settlement": null, "settledAt": null,
       "manifold": {"state": "open", "decidedAs": null, "decidedAt": null},
       "sides": [{"side": "yes", "label": "Yes", "coins": 120, "players": 4, "payoutPerCoin": 1.63},
                 {"side": "no",  "label": "No",  "coins": 80,  "players": 3, "payoutPerCoin": 2.42}],
       "totalCoins": 200, "source": "cache", "fetchedAt": "2026-11-20T10:02:11Z"}],
 "rules": {"minStake": 1, "maxStake": 50, "dailyCap": 200, "cutPercent": 5, "cutOf": "losing side",
           "dayStarts": "00:00 Europe/Lisbon"},
 "attribution": "Questions and results: Manifold Markets (manifold.markets), a play-money forecasting site.",
 "playMoney": "Forecasting with play coins. Play money: no cash value. It cannot be bought or cashed out."}

GET /api/predictions/mine
Authorization: Bearer <token>

200 OK
{"coins": 940, "stakedToday": 70, "leftToday": 130, "dailyCap": 200, "host": false,
 "stakes": [{"questionId": "avengers-opening-record", "text": "...", "side": "yes", "amount": 20,
             "placedAt": "2026-11-20T10:01:00Z", "status": "settled", "result": "won", "payout": 34,
             "settlement": "winners", "outcome": "yes", "settledAt": "2026-12-18T09:00:00Z"}]}

POST /api/predictions/stake
Authorization: Bearer <token>
{"questionId": "avengers-opening-record", "side": "yes", "amount": 20, "stakeId": "q7x2k9m4ab"}

200 OK
{"questionId": "avengers-opening-record", "side": "yes", "amount": 20, "coins": 920, "stakedToday": 90,
 "leftToday": 110, "sides": [{"side": "yes", "label": "Yes", "coins": 140, "players": 5, "payoutPerCoin": 1.54},
                              {"side": "no", "label": "No", "coins": 80, "players": 3, "payoutPerCoin": 2.66}],
 "totalCoins": 220}

POST /api/predictions/settle
Authorization: Bearer <token of a host>
{"questionId": "avengers-opening-record", "outcome": "yes"}

200 OK
{"questionId": "avengers-opening-record", "outcome": "yes", "settlement": "winners",
 "settledAt": "2026-12-18T09:00:00Z", "paidPlayers": 5, "paidCoins": 216, "cutCoins": 4}
```

The rules in one list (numbers in `backend/server/predictions/stake_rules.py`; the pool rules in `pools.py`, shared later with L6):

- **A stake.** One stake per player and question, 1 to 50 whole coins, at most 200 coins per Lisbon day (the day starts at 00:00 Europe/Lisbon). A stake cannot be changed or taken back.
- **Closing.** Each question has its own closing time in the list, at least 60 minutes before the moment that decides it. A question closes earlier if Manifold closes it or decides it. The database keeps the closing time it was given at the first stake and never changes it; at every stake the earlier of that stored time and the closing time the server knows at that moment counts. So a stored closing time never moves later. (Two server instances with different readings of Manifold can disagree for a short while.)
- **How a pool pays out.** The winners share the pool in proportion to their stakes. A cut of **5 % of the losing side**, rounded down, leaves the game (a right forecast never gets back less than it staked). Rounding is against nobody: the payouts plus the cut add up to exactly the coins staked, each payout is less than one coin away from its exact share, and the leftover coins go to the largest remainders, then to the earliest stake. **Everybody gets a full refund** when the question is void (Manifold says CANCEL, MKT or anything else that is not YES or NO, or the host voids it), when nobody picked the winning side, and when everybody picked the same side.
- **Settling (the minimum).** A host presses Settle YES, Settle NO or Void. YES or NO works only after the pool has closed, and if Manifold has decided, the choice must match (`409 outcome_conflict`); with only the recording, the host's word stands. Void works at any time. One SQL function pays everyone in one transaction, and a pool settles only once (a trigger also makes a settled pool final in the table itself). Automatic settlement (Manifold decided, then a 60-minute wait) comes after the minimum.
- **Safe repeats.** The ledger ref of a stake is `stake:<stakeId>`, and the ref of every payout (a win and a refund) is `pool:<questionId>`. A repeated stake answers `409 already_applied` and changes nothing: it is the first thing the server checks after the speed limit, before the question, Manifold or the closing time, so it is the answer to a repeat whatever has changed since. A pool settles once.
- **Manifold.** The server reads `https://api.manifold.markets/v0/market/{marketId}` (no key, 500 requests a minute per address) once per question per 2 minutes per server instance, with a 3 second timeout. If Manifold fails, the last good answer shows as `stale`, and a recorded real answer (`backend/content/predictions/recorded/`) as `fallback`. **A stake needs a real reading** (`live`, `cache` or `stale`): with only the recording the answer is `503 source_unavailable` and `canStake` is false. **A `stale` reading must not be older than 15 minutes** (`STALE_LIMIT_FOR_STAKE`): an older one is still shown (`source: "stale"`, with its `fetchedAt`) and still limits what a host may settle, but a stake on it answers `503 source_unavailable` and `canStake` is false, because the market may have been decided since and news could reach some captains first. In demo mode (`DEMO_MODE=true`) the server never calls Manifold, the recording counts as the reading, and staking works.
- **Errors.** `401 unauthorized`, `403 forbidden` (settling when you are not a host), `404 feature_off`, `404 no_such_question`, `409 already_applied`, `409 pool_closed`, `409 already_staked`, `409 daily_stake_cap`, `409 insufficient_funds`, `409 pool_open`, `409 outcome_conflict`, `409 stakes_changed`, `422 validation_error`, `422 stake_too_small`, `422 stake_too_big`, `429 too_many_requests` (more than 10 stakes in 30 seconds), `503 predictions_unavailable`, `503 source_unavailable`, `503 database_unavailable` (the outcome is unknown; sending the same `stakeId` again is safe).

The desk needs the prediction desk migration (it reads `prediction_pools`, `prediction_stakes` and `prediction_pool_sides`). Without a configured database the routes answer `503 database_not_configured`. The list of questions is `backend/content/predictions/questions.json`; every question stays `pending` (hidden, not stakeable) until a person has read the Manifold question and written their name and the date into `reviewedBy` and `reviewedOn`.

### Lantern Duels (package A7)

Two captains each seal a sequence of lantern signals: Flash, Shade or Mirror. The server opens both envelopes at once and decides every round. A duel is friendly or played for equal play-coin stakes. The whole feature sits behind the flag `arena`, which stays off. The home of each route is the comment at the top of `backend/server/routes/duels.py`; the rules are in `backend/server/duels/` and are explained in [D026](DECISIONS.md#d026--lantern-duels-rules--2026-11-06) (proposed). The full spec is [specs/A7-lantern-duels.md](../specs/A7-lantern-duels.md). Play money only: coins cannot be bought, cashed out or exchanged for real prizes, and the screen says "Simulation, play money".

| Route | Who | What it does |
|---|---|---|
| `GET /api/duels` | signed in, flag `arena` on | The rules (so the screen never guesses a number), the caller's coins and held coins, and four short lists: `incoming` (named challenges to me), `openChallenges` (open challenges of other captains), `yours` (my waiting challenges) and `recent` (my ended duels). A summary never carries a signal. Expired challenges of mine are closed and refunded while it is read. **New route**, to be agreed at the Mon 9 freeze. |
| `POST /api/duels` | signed in, flag `arena` on | Send a challenge: `{opponentName, rounds, stake, signals, actionUid}`. A name makes a named challenge; `null` or no name makes an open one. The challenger's signals are sealed and the stake is held. |
| `GET /api/duels/{id}` | signed in, flag `arena` on | One duel in full: `yourSignals` (my own) and, once the duel is finished, `reveal`, one entry per round from my side. Who may look: the two captains, and anyone while an open challenge is still open. |
| `POST /api/duels/{id}/move` | signed in, flag `arena` on | Answer a challenge: `{signals, actionUid}`. Answering is accepting: in one database step the server takes my stake, opens both envelopes, decides every round and pays out. |
| `POST /api/duels/{id}/cancel` | signed in, flag `arena` on | No body. The challenger withdraws, or the named captain declines. Either way the challenger's stake comes back. **New route**, to be agreed at the Mon 9 freeze. |

```text
POST /api/duels
Authorization: Bearer <token>
{"opponentName": "Captain-3fa85f", "rounds": 5, "stake": 100,
 "signals": ["flash", "shade", "shade", "mirror", "shade"], "actionUid": "q7x2k9m4ab"}

200 OK
Cache-Control: private, no-store
{"duel": {"id": "6f1c0c2e-9a52-4b8e-8d3a-0a7c3f1d2b44", "status": "open", "isOpen": false, "you": "challenger",
          "challengerName": "Brave Puffin 17", "opponentName": "Captain-3fa85f", "rounds": 5, "oil": 5,
          "stake": 100, "cutPercent": 5, "winnerTakes": 190,
          "createdAt": "2026-11-06T10:00:00Z", "expiresAt": "2026-11-07T10:00:00Z", "closedAt": null,
          "score": null, "yourResult": null, "coinsChange": null, "heldStake": 100,
          "canAnswer": false, "canWithdraw": true, "canDecline": false,
          "yourSignals": ["flash", "shade", "shade", "mirror", "shade"], "reveal": null},
 "coins": 900, "serverTime": "2026-11-06T10:00:00Z"}
```

The rules in one list (numbers in `backend/server/duels/rules.py`, and `GET /api/duels` sends them in `rules`):

- **Signals and oil.** Flash outshines Shade, Shade leaves Mirror nothing to throw back, and Mirror throws Flash back. The same signal on both sides scores for nobody. Each captain has as much lantern oil as the duel has rounds (3 or 5): Flash burns 2, Mirror 1 and Shade 0. A sequence that burns more is refused (`422 not_enough_oil`). More rounds won wins the duel; equal is a draw.
- **Sealed means sealed.** Each captain seals all rounds at once: the challenger with the challenge, the other captain with the answer. A signal reaches the other captain only after both envelopes are in, and only as part of the stored reveal. No answer carries it before: not the list, not the detail and not an error. The table `duel_moves` has no right for players at all, and no role may change a sealed signal.
- **Challenges.** By captain name (the exact display name, in any letter case) or open to any captain except the challenger, where the first answer wins. A named challenge can be answered only by that captain. A duel has 3 or 5 rounds. A captain may have 3 challenges waiting (`409 too_many_waiting`).
- **Stakes and the cut.** The stake is 0 (friendly), 10, 25, 50 or 100 coins from each captain. The challenger's stake is held when the challenge is sent, the answerer's when they answer. The winner takes the pot minus a cut of 5 %, rounded down to whole coins: 19, 47, 95 or 190. A draw, a withdrawal, a decline and an expiry give every stake back. The cut has no ledger row; it is simply not paid out, and duels never create coins. Two captains may decide 3 staked duels per day with each other, either way round (the day starts at 00:00 Lisbon time; `409 daily_pair_limit`).
- **Safe repeats.** The ledger ref of every coin movement is `duel:<duel id>` (the reasons `arena_stake` and `arena_payout`; a player has at most one row of each reason per duel, so the ledger itself stops a double stake or a double payout). The `actionUid` (8 to 64 letters, digits, hyphens or underscores, made once per click and sent again on a retry) is the duel's `create_uid` or the answer's `action_uid`; it is never part of a ref. The same challenge sent twice answers `409 already_applied` and creates nothing. The same answer sent twice answers `409 already_applied`; a second answer with another `actionUid` answers `409 already_sealed`, which is also what the challenger hears when answering their own challenge.
- **Timeouts are lazy.** A challenge can be answered for 24 hours. Nothing runs on a timer (Vercel Cron cannot be used with Services): the next request that touches the duel (the list or the detail of either captain, a cancel, or an answer attempt) closes it as `expired` and gives the challenger's stake back. The database clock decides. A sealed duel has no forfeits: nobody can lose by being offline.
- **Order of the checks.** Every route resolves the sign-in first (`401`), then the flag (`404 feature_off`, with no database call), then the body (`422`). The player id comes only from the sign-in. Request bodies refuse extra fields.
- **Polling.** The screen asks `GET /api/duels` every 5 seconds for 2 minutes after an action, then every 30 seconds, and stops after 10 quiet minutes. It never asks while the tab is hidden. One quiet panel makes about 40 calls in 10 minutes. No Realtime, no WebSockets and no timer on the server.
- **Errors.** `404 feature_off`, `404 no_such_duel`, `404 no_such_captain`, `403 not_your_duel`, `409 already_applied`, `409 already_sealed`, `409 duel_taken`, `409 duel_closed`, `409 duel_expired`, `409 daily_pair_limit`, `409 too_many_waiting`, `409 name_not_unique`, `409 insufficient_funds`, `422 validation_error`, `422 bad_rounds`, `422 bad_stake`, `422 wrong_signal_count`, `422 not_enough_oil`, `422 cannot_duel_yourself`, `502 database_error`, `503 database_not_configured`, `503 database_unavailable` (the OUTCOME IS UNKNOWN: read the list before you try again; never send the same intent again with a new `actionUid`).

The duels need the Lantern Duels migration (`supabase/migrations/20261106110000_lantern_duels.sql`), which is not applied yet. While the flag `arena` is off, every duel route answers `404 feature_off` and touches no database.

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

The live weather package (L1) calls `setWeather` with the values from `GET /api/weather` ([section 2](#get-apiweather)). `startLiveWeather({ setWeather, fetchImpl, intervalMs, onUpdate })` in `frontend/src/net/weather.js` asks at once and then every 10 minutes, passes exactly the four values to `setWeather`, keeps the last good weather when a call fails or takes longer than 10 seconds (it changes nothing and logs a warning), and returns a function that stops it. The optional `onUpdate(answer)` gets the whole answer after each good update, so the caller can show the place, the summary and the credit, or emit the event `weather_updated`. The answer also carries `state` and `tonight` ([section 2](#get-apiweather)); the false-light teaser can read `answer.tonight.isFogNight` and must stay off once the world is relit. `startLiveWeather` still passes only the four values to `setWeather`. `weatherAttribution(answer)` in the same file returns the credit as `{ text, href, licenceText, licenceHref }`: show `text` as a link to `href`, followed by `licenceText` as a link to `licenceHref`. All of it must be on screen next to the weather ([section 2](#get-apiweather) says why).

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
| `{type: 'plot_clicked', plot}` | G2, L2 | built (G2), opens the islet panel at `plot_1` to `plot_4` (L2). Since G8 the world also sends it for `islet_signal_station`; the panel leaves that hotspot to the finale screen (`world/places/case-spots.js`). |
| `{type: 'islet_changed', built: [plot ids], signalStationBuilt}` | L2, G8 | built; the islet panel emits it after every good answer, and `built` lists every plot whose state is `built`, the cabin included. The world draws a building only when this event says it stands (`frontend/src/world/islet/state.js`, G8). Its home is `frontend/GRAPHICS.md`. |
| `{type: 'finale', stage}`, listened to by G4 | L3 | draft; defined by the story round (S0, D018) |
| `live_status_changed`, `live_presence_changed`, `live_peer_moved`, `live_peer_emoted`, `live_crew_updated` | A4 | built, flag `live_presence` off; payloads in [section 7](#events-for-the-screens) |

### Talking to the API: api.js and session.js (package A2)

`frontend/src/online/session.js` holds the login token **in memory only**, and `frontend/src/online/api.js` is the one way the browser calls our own server. The sign-in screen (a later package, pending Nils' decision on the sign-in approach) fills the session with the token after the GitHub sign-in. There is no sign-in button yet. The home of both files is their header comment.

```js
import { api } from './online/api.js';
import { session } from './online/session.js';

session.setToken(token);                          // after the sign-in
session.onChange(({ signedIn }) => { /* show or hide the sign-in */ });

const result = await api.get('/api/me');          // also api.post, api.put and api.del
if (result.ok) show(result.data); else showError(result.message);
```

- **Results.** A call never throws for a problem with the call itself. It answers `{ ok: true, status, data }` (`data` is `null` for an empty answer), or `{ ok: false, status, code, message, retryAfterSeconds? }`. `code` is the server's own word (section 1), or a word for the status, or `network_error` or `timeout` (status 0). `message` is ready to show.
- **401.** The message is "Please sign in again." and the session forgets the token, so listeners learn that the player is signed out.
- **409.** The server's own message (it explains, for example "This was already done."), and the `code` is kept, so a screen can treat `already_applied`, `already_seated` and `already_started` as done.
- **429.** "Too many tries. Wait N seconds, then try again." with `retryAfterSeconds` from the `Retry-After` header.
- **Safety.** The path must start with `/api/` and must not contain `//` (which also refuses `://`), or the call throws a `TypeError` and fetch is never called, so the token can never go to another site. The token goes only into the `Authorization` header, never into the address. A call gives up after 10 seconds.
- **Memory only.** A reload means signing in again. Whether to remember the sign-in across reloads is the decision of the sign-in package. The files never use `localStorage`, `sessionStorage`, `IndexedDB`, a cookie or the console, and a test reads the source to check it.

The tests are `frontend/tests/online-session.test.js` and `frontend/tests/online-api.test.js`.

## 4. Database tables

The first migration, `supabase/migrations/20261106000000_foundation.sql`, creates seven tables. The foundation package (A1, whose spec is `specs/F0-foundation.md`) owns them. A visitor who is not signed in gets nothing. A signed-in player only reads. The server writes, with the secret key. The full matrix, action by action, is in [supabase/README.md](../supabase/README.md#who-may-do-what).

| Table | One row per | A signed-in player may | The server may | Owner |
|---|---|---|---|---|
| `profiles` | player: the display name | read every row | read, add, change, delete | A1. A2 writes real captain names (`assign_captain_name()`, `reroll_captain_name()`). |
| `saves` | player: progress as a JSON object of at most about 200 KB | read their own row | read, add, change, delete | A1. A2 saves it (`save_progress()`, `GET` and `PUT /api/save`). |
| `wallets` | player: the coin balance, never below 0 | read their own row | read, change (only through the wallet function) | A1 |
| `wallet_reasons` | reason a balance may change, with its direction | read every row | read | A1. New reasons arrive by migration. |
| `wallet_transactions` | coin change: the ledger, never edited | read their own rows | read, add (only through the wallet function) | A1 |
| `crews` | crew | read the crews they sit in | read, add, change, delete | A1. A6 adds the crew routes. |
| `crew_seats` | taken seat in a crew | read the seats of the crews they sit in | read, add, change, delete | A1. A6 adds the crew routes. |

The Island Exchange migration, `supabase/migrations/20261106010000_island_exchange.sql` (package L4, run after the first one), adds three tables and two functions. The rights follow the same plan: a visitor gets nothing, a signed-in player only reads, the server writes.

| Table | One row per | A signed-in player may | The server may | Owner |
|---|---|---|---|---|

`market_trade()` is the only way a trade happens (it checks that the coins and the fee follow from the units and the price, moves the coins through `apply_wallet_transaction()`, changes the position and writes the trade in one step). `market_set_base()` saves a company's base when two server instances look at the same moment. Both are for the server only.

The accounts migration, `supabase/migrations/20261106020000_accounts.sql` (package A2, run after the first one), adds one table and four functions. The rights follow the same plan: a visitor gets nothing, a signed-in player only reads, the server writes.

| Table | One row per | A signed-in player may | The server may | Owner |
|---|---|---|---|---|
| `captain_name_rerolls` | player who used their one captain name re-roll; the player id is the primary key, so a second re-roll is impossible | read their own row | read, add (through `reroll_captain_name()`) | A2 |

`assign_captain_name()` gives a player their generated name once, `reroll_captain_name()` changes it once, `save_progress()` writes a save only if it still has the version the caller read (and adds 1 to it), and `delete_player()` deletes the login and, by cascade, everything about the player. All four are for the server only. `delete_player()` is the one `SECURITY DEFINER` function among them, because deleting from `auth.users` needs the rights of the function owner.

The entry profiles migration, `supabase/migrations/20261106030000_entry_profiles.sql` (package A3, run after the first one), adds one table and one function. The rights follow the same plan: a visitor gets nothing, a signed-in player only reads, the server writes.

| Table | One row per | A signed-in player may | The server may | Owner |
|---|---|---|---|---|
| `entry_profiles` | player who finished Act 1: the ending, the decision, whether they read the log, the kit with its start place and coins, the move count and the SHA-256 of the story the replay used; the player id is the primary key, so the first ending counts | read their own row | read, add (through `grant_entry_kit()`) | A3 |

`grant_entry_kit()` stores the profile and pays the kit coins in one step (`apply_wallet_transaction()` with the reason `kit_grant` and the fixed ref `kit`), and answers a repeat with the stored profile and no payment. It is for the server only and is not `SECURITY DEFINER`. Nobody gets an update or a delete right on the table: the row goes only with its player, by cascade.

The crew codes migration, `supabase/migrations/20261106040000_crew_codes.sql` (package A6, run after the first one), changes no row that exists. It adds the columns `code`, `version` and `started_at` to `crews`, the kit rule and two unique indexes to `crew_seats` ([section 6](#6-crews-and-seats)), one table and four functions. Players get no right on the new table.

| Table | One row per | A signed-in player may | The server may | Owner |
|---|---|---|---|---|
| `crew_join_failures` | wrong crew code a player typed, kept for the guessing limit (10 in 10 minutes) | nothing (no policy, no grant) | read, add, delete (through `crew_find_by_code()`) | A6 |

`crew_create()`, `crew_find_by_code()`, `crew_take_seat()` and `crew_start()` are the only way the server starts, finds, joins and sails a crew (a team rule, as with the wallet). Each checks the crew's `version`, so a request never acts on an old picture of the crew. All four are for the server only and are not `SECURITY DEFINER`.

Four database functions come with the first migration: `apply_wallet_transaction()` (the only way coins move, for the server only), `is_crew_member()` (used by the read rules of crews and seats, for signed-in players only), `handle_new_user()` (runs at sign-up and creates a profile, a wallet with 0 coins and an empty save) and `touch_updated_at()` (stamps `updated_at`).

The home islet migration, `supabase/migrations/20261106070000_home_islet.sql` (package L2, run after the first one), adds two tables and one function. It adds no wallet reason: a building is paid with `building_purchase`. The rights follow the same plan: a visitor gets nothing, a signed-in player only reads their own rows, the server writes.

| Table | One row per | A signed-in player may | The server may | Owner |
|---|---|---|---|---|
| `islets` | player who has built: the timber the player holds, never below 0 (the first build makes the row, with the starter pack) | read their own row | read, add, change (through `islet_build()`) | L2 |
| `islet_buildings` | building that stands on an islet, never edited or deleted. The primary key is `(player_id, plot)`: one building per plot. The cabin stands from the start and has no row. | read their own rows | read, add (through `islet_build()`) | L2 |

`islet_build()` is the only way a building goes up. In one step it locks the wallet, refuses a repeated ref, makes the islet row with the starter pack if there is none, refuses a plot that holds a building and a build with too little timber, takes the coins through `apply_wallet_transaction()` (reason `building_purchase`) and writes the building. It is for the server only. The prices and the starter pack are arguments, taken from `backend/content/buildings.json`. The finale reads `islet_buildings` (`player_id`, `building_type`): the table and column names are part of this contract.

Details that other packages rely on:

- **Display names** (`profiles.display_name`): 2 to 24 characters from A-Z, a-z, 0-9, space, underscore, dot and hyphen, with no space at either end. Not unique. At sign-up every player gets a neutral placeholder: `Captain-` and the first 6 characters of their id. A name never comes from the GitHub login or any other login detail, because names appear on a projector.
- **Saves:** `data` (a JSON object, at most 200,000 bytes as database text; the server accepts at most 100,000 bytes of compact JSON), `version` (starts at 1 and counts the writes: `PUT /api/save` sends the version it last read, and `save_progress()` writes only if that is still the current version and then adds 1) and `updated_at` (set by the database). Only the server writes a save. The migration `20261106020000` changed the meaning of `version`: it was a format version before, and nothing used it.
- **Realtime.** Postgres Changes is not used; live presence rights are policies on `realtime.messages` (migration `20261106050000_live_presence.sql`, [section 7](#7-realtime-budget)).
- **A new table** follows [ENGINEERING.md, recipe 4.2](ENGINEERING.md#42-add-a-database-table): row-level security, read-only policies for players, and explicit grants, because our project gives no rights to a new table by itself.

| Table | One row per | A signed-in player may | The server may | Owner |
|---|---|---|---|---|
| `exchange_positions` | position: a stake in one company, rising or falling, at 10x, with its zero point; open, closed by the player or zeroed | read their own rows | read, add, change (through `exchange_open_position()`, `exchange_close_position()` and `exchange_close_used_up()`) | L4 |

| `exchange_events` | opening, closing or close at zero: the history, never edited | read their own rows | read, add (through the three functions) | L4 |

| Table | One row per | A signed-in player may | The server may | Owner |
|---|---|---|---|---|
| `prediction_pools` | question: when staking closes, and how the pool ended | read every row | read, add, and change seven columns (the settlement), through `prediction_settle_pool()`; never delete | L5 |
| `prediction_stakes` | stake: who staked how many coins on which side of which question | read their own rows | read, add (through `prediction_place_stake()`), and change the column `payout`; never delete | L5 |

| Table | One row per | A signed-in player may | The server may | Owner |
|---|---|---|---|---|
| `duels` | challenge: who, rounds, stake, status and, once decided, the result of every round. It holds no signal. | read the duels they take part in | read, add, change (through `duel_create()`, `duel_answer()` and `duel_void()`); never delete | A7 |
| `duel_moves` | captain and round: the sealed envelopes, the only place that holds a signal | nothing at all, not even their own rows | read, add (through `duel_create()` and `duel_answer()`); no role may change or delete a row | A7 |

### Case Phase 1 tables and functions

The additive migration `20261106060000_case_rules.sql` adds six server-only tables. All have RLS, no player policies or grants, and no service-role DELETE grant.

| Table | Stores | Server rights |
|---|---|---|
| `case_state` | One crew's clock, revision, waits and solve state | select, insert, update |
| `case_finds` | A seat's accepted find and landing time | select, insert |
| `case_deductions` | A crew's formed deductions | select, insert |
| `case_accusations` | The immutable accusation history | select, insert |
| `case_solvers` | Per-crew reveal eligibility and once-per-player payout result | select, insert |
| `case_actions` | The player's uid, intent and exact stored outcome | select, insert |

Only the server may execute `case_window_open`, `case_begin`, `case_finish`, `case_open`, `case_start_route`, `case_after_solve`, `case_accuse` and `case_clock_forward`. All use an empty search path and caller rights. The Python store calls only the four intent functions, never private helpers. Case writes lock the crew before wallets and the later world row; revision and crew-version checks prevent paying from an old snapshot. No wallet reason is added.

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
| `market_stake` | spend | The stake put into an Island Exchange position (migration `20261106090000`) |
| `market_payout` | earn | The value paid out when an Island Exchange position is closed (same migration) |
| `prediction_stake` | spend | Coins staked at the prediction desk (migration `20261106100000`); ref `stake:<stakeId>` |
| `prediction_payout` | earn | Coins paid back from a prediction desk pool, for a win or a refund (same migration); ref `pool:<questionId>` |
| `arena_stake` | spend | The stake of a Lantern Duel, held when a captain challenges or answers (migration `20261106110000`) |
| `arena_payout` | earn | A Lantern Duel payout: the winnings, or a stake that comes back after a draw, a withdrawal, a decline or an expiry (same migration) |

A new reason is one new migration plus the same pair added at the end of `WALLET_REASONS`, in one pull request ([ENGINEERING.md, recipe 4.7](ENGINEERING.md#47-add-a-wallet-reason)). Never rename a reason or change its direction. The reason names later packages have reserved are in [section 9](#9-reserved-interfaces).

## 6. Crews and seats

- A crew has up to 4 seats, numbered 1 to 4. Each taken seat holds exactly one of two: a player, or an NPC partner (a crew mate the game runs, named by its `npc_id`). A seat that nobody holds has no row.
- **Solo play is a crew of one player.** The player sits in seat 1 and NPC partners fill the other seats (mode `solo`). With friends the mode is `crew`, and NPC partners fill any seats left empty. A friend can take over an NPC partner's seat.
- A crew's status goes from `forming` to `active` to `finished`.
- A player can read a crew and its seats only while they sit in it. Only the server creates crews and seats players and NPC partners.
- The database guards one seat per player and one seat per NPC partner in a crew (two unique indexes), the kit ids and the crew code (migration `20261106040000`, package A6). The four crew functions (`crew_create()`, `crew_find_by_code()`, `crew_take_seat()` and `crew_start()`) make sure that a player sits in at most one open crew (`forming` or `active`), under a lock on the player's profile. By team rule the server writes crews and seats only through them.
- Deleting a player removes their seat. `DELETE /api/me` (`delete_player()`, package A2) first hands a crew that the player started and other players sit in to the player in the lowest other seat, so only a crew nobody else sits in goes with the player. A deletion in the Supabase dashboard skips the handover and removes every crew the player started.

| Column | Meaning |
|---|---|
| `crews.id`, `created_by` | A random id, and the player who started the crew |
| `crews.mode`, `status` | `solo` or `crew`; `forming`, `active` or `finished` |
| `crews.code` | The crew code a friend types to join: 6 symbols from `A-Z` without `I`, `L` and `O`, and `2-9`. Unique. Empty only for a crew made before crew codes existed. |
| `crews.version`, `started_at` | `version` counts the changes made through the crew functions (starts at 1), so a request never acts on an old picture of the crew. `started_at` is the time of the muster, empty while the crew is forming. |
| `crew_seats.crew_id`, `seat_no` | The crew and the seat number (1 to 4). Each seat number appears once per crew. |
| `crew_seats.player_id`, `npc_id` | Who sits there: exactly one of the two. An `npc_id` is 2 to 40 characters from a-z, 0-9 and underscore. |
| `crew_seats.kit`, `joined_at` | The entry kit this seat carries: `true_keeper`, `witness`, `informant` or `stranger` (checked for every new or changed row), and when the seat was taken |

What NPC partners do in the mystery (their orders, errands and lines) is defined by the story round (S0, D018) in [docs/story/NPC-PARTNERS.md](story/NPC-PARTNERS.md). Package A6 built the crew routes and crew codes (below), and S4 adds the orders for NPC partners ([section 9](#9-reserved-interfaces)).

### Crew codes, the muster and partners (package A6)

How a crew forms, in four steps. The home is `backend/server/routes/crews.py`; the pure rules are in `backend/server/crews/seats.py`.

1. **Start.** A player with an entry kit starts a crew (`POST /api/crews`) and sits in seat 1. The crew is `forming` and has a code.
2. **Join.** A friend types the code. The friend takes the lowest open seat. A crew that has sailed usually has no open seat, so the friend takes over the NPC partner who carries the friend's own kit, or else the partner whose kit comes last in the partner order, so the partners who stay keep the kits that are still missing. The seat carries the friend's **own** kit.
3. **Muster.** Any player of the crew calls `POST /api/crews/me/start`. The crew becomes `active`, and NPC partners take every empty seat, lowest number first. Each partner carries the first kit of the order **informant, stranger, true_keeper, witness** that nobody in the crew carries yet. The partner follows the seat number: the Lookout (`lookout`) in seat 1, the Deckhand (`deckhand`) in 2, the Bosun (`bosun`) in 3 and the Cook (`cook`) in 4.
4. **Play.** Nobody leaves and nobody is kicked in this version. A friend can still join a crew that has sailed, by taking over a partner.

- **The order of the partner kits** is the one of `NPC-PARTNERS.md` (section 4.2). Nils decided it in the story round (D018, decision 12; a team call, confirmed at kickoff), and `CASE-FILE.md` uses the same order since then. The order is one constant (`NPC_KIT_ORDER`) in `seats.py`.
- **The kit of a seat after a friend takes over a partner:** the friend keeps their own kit, as Nils decided in the story round (D018, decision 10) and as built. It is one switch (`FRIEND_KEEPS_OWN_KIT`) in `seats.py`.
- **A draft.** A crew that a player started and sits in alone. Joining another crew deletes the draft in the same step, so a player who pressed "start a crew" by mistake is never stuck. A crew with a friend in it is not a draft: its players cannot join another crew.
- **Guessing.** The database counts the wrong codes of each player (`crew_join_failures`) and refuses a player who typed 10 wrong codes in 10 minutes before it looks at the code. The numbers are in `backend/server/crews/codes.py`.
- **For later packages.** The case board and the finale find the crew and the seat of a player with `read_open_crew_seat()` in `backend/server/crews/store.py`, and stamp the seat number on their own rows. Partner orders and errands are package S4. Note for S4: a Witness partner starts with card C2 in its satchel.

## 7. Realtime budget

Live presence (package A4) runs on Supabase Realtime: players see each other's captains move in the same place, can send preset emotes, and the server can tell a crew the moment something changed. It is built and switched off by the flag `live_presence`. Its migration (`20261106050000`) goes live with group 2, applied by the controller before group 2 reaches `main`. The flag stays off until the checks L1 to L7 of [supabase/README.md](../supabase/README.md#live-presence-checks-steps-l1-to-l7) have passed on the live project (L7 needs the server key), and nothing in the game starts the module yet: the browser adapter of package G9 connects it to the presence screens of G7 and G8 ([below](#what-the-browser-adapter-g9-maps)). The design, the numbers and the reasons are in [specs/A4-live-presence.md](../specs/A4-live-presence.md) and decision D023. Everything sent in these rooms is only for showing: a position, a place or an emote decides nothing in the game (D003).

Supabase Realtime on the free plan is one budget for the whole project:

| Limit | Free plan |
|---|---|
| Connections at the same time | 200 |
| Messages per second | 100 |
| Messages per month | 2 million |
| Presence messages per second | 20 |
| Channel joins per second | 100 |
| Channels per connection | 100 |
| Size of one broadcast | 256 KB |

**Every delivered copy counts.** A message counts once when it is sent, and once more for every client that receives it. Presence counts too. Above a per-second limit, Supabase first sends a `system` message ("Too many messages per second", "Too many presence messages per second" or "Client presence rate limit exceeded") and then closes the room, and clients reconnect only when the load drops. Above the monthly quota the free plan sends a notice, then a grace period, then restrictions, with no bill. Test traffic counts too.

**Every room a player joins counts as one connection.** We assume the worst, because Supabase's "concurrent connections" count subscribed channels. A player is in at most 3 rooms (the world, one place room and the crew room), so about 66 players fit in the 200.

### The rooms

All rooms are private (`config: { private: true }`): the policies on `realtime.messages` decide who may join and send ([supabase/README.md](../supabase/README.md#the-live-presence-migration)).

| Room | Topic | Kind | Who may join | Who may send | Used for |
|---|---|---|---|---|---|
| World | `live:world` | presence only | any signed-in player | any signed-in player (track) | who is online, in which place and room, with which kit |
| Place room | `live:place:<placeId>:<room>`, for example `live:place:saltreach_harbor:1` | broadcast only | any signed-in player | any signed-in player | moves and emotes of the captains in that room |
| Crew room | `live:crew:<crewId>` | broadcast only | only players seated in the crew (`is_crew_member`) | only the server (REST, secret key) | crew events: "something changed, fetch it" |

- **Topics.** Place ids are the ids of `frontend/src/world/places/registry.js` and match `^[a-z][a-z0-9_]{1,39}$`. Room numbers run from 1 to 99. `home_islet` gets no room, because every player has their own islet.
- **A numbered room holds at most `clamp(floor(120 / online), 4, 9)` captains**: 9 (you plus 8 others) while 13 or fewer are online, 6 with 20 online, 4 with 30 or more.
- **Room choice on arrival** (`chooseRoom` in `frontend/src/net/live-rules.js`): the lowest-numbered room of the place where a crewmate already is, even if it is full; otherwise the lowest-numbered room with space. If two crewmates arrive at the same moment and land in different rooms, the one in the higher room moves down when the world presence shows the other. A new room waits for its turn: a room of one kind (world, place, crew) starts to join at most once a second.
- **Why a world room.** The budget formula needs the number of captains online, "a count of the rest" needs to know where everybody is, and a newcomer needs to know who is in its room before anyone moves. One presence update per trip solves all three.
- **Why numbered rooms.** Every message reaches everyone in its room, so a room's cost grows with the square of its size. One room of 30 would cost 30 messages per move, which at a safe rate is one update every 15 seconds.

### The messages

Payloads are small camelCase JSON with `v: 1`. They never contain free text, a name, a login or an e-mail address. A receiver drops anything that does not match.

| Room | Event | Payload | Sent when |
|---|---|---|---|
| World | presence track | `{v, place, room, kit}`. `place` and `room` are null at sea, and `room` is null on the home islet. `kit` matches `^[a-z][a-z_]{1,23}$` or is null. | Once the place room is joined, and on every change of place, room or kit. At most one track every 1.5 s; changes within that window go out together. |
| Place room | `position` | `{v, id, place, x, z, facing, moving, seq, everyMs}` | While moving, at the allowed rate. Also once on stopping, once right after we announced our place and room, and once 0.2 to 0.8 s after a newcomer appears in the room. Nothing is sent before the announcement: the others ignore a captain they do not know. |
| Place room | `emote` | `{v, id, emote, seq}` | When the player picks an emote. At most one every 3 s. |
| Crew room | `crew_event` | `{v, kind, data}` | Only from the server, after it has saved a change. |

- `id` is the sender's player id (Supabase does not tell receivers who sent a broadcast). The presence key is the player id too.
- `x` and `z` are the player's position in the place (`controller.player.position`), rounded to 2 decimals, between -200 and 200. `facing` is `up`, `down`, `left` or `right`, the same choice as `createCharacter().face(dx, dz)` (exported as `facingFrom`).
- `seq` starts at the sender's `Date.now()` and grows by 1 per message, so it keeps growing after a page reload. Receivers keep only messages newer than the last `seq` they accepted from that id. `everyMs` is the sender's current gap between updates (500 to 20000).
- `emote` is one of `wave`, `cheer`, `nod`, `shrug`, `follow_me`, `help` (the list `EMOTES`; decision D006 may rename them).
- `kind` is `board_changed` (L3), `finale_changed` (L3), `case_changed` (S3), `partner_changed` (S4) or `crew_changed` (A6). `data` is a JSON object of at most 1 KB, usually `{"version": 7}`. It never holds spoilers or another crew's data.
- **Names are never sent.** The receiver reads `display_name` from `profiles`, one read for up to 50 ids at a time, and keeps the answer for the whole session (a captain that the server renames keeps the old name until the page is loaded again). The text would otherwise come from the sender's browser, and D003 forbids showing names a browser chose.

### Our rules

1. **Small rooms.** See the room sizes above. A crew room only ever receives.
2. **One allowance per captain, shared by moves, emotes and replies.** The gap between two messages is `max(500 ms, 1000 / rate)`, rounded up to the next 100 ms, with `rate = min(2, 60 / (online x room))` updates a second. `online` is the number of valid keys in the world presence and `room` the captains in our room, counting us. Slow mode (see the guard) halves the rate. Alone in the room, nothing is sent. When the allowance frees up the order is: a queued emote, the stop update, a reply, then the regular update while moving. A message goes out only while the room is joined and the socket is open: otherwise supabase-js posts it over HTTPS (with a console warning), which is a different path with other limits, and we never want that. It also waits until the world presence holds our current place and room, because the others ignore a captain they do not know (the first announcement can wait up to 10 s, see the burst below, and our position follows right after it).
3. **The browser slows itself down, and our server never sees these messages.** They go from one browser to Supabase and on to the others, so nothing on our side can count or stop them. What protects the budget is the formula above, the guard below, receivers that drop floods, the policies, and the kill switch in [supabase/README.md](../supabase/README.md#changing-the-database-later). The old plan "the server enforces it" was not possible.
4. **The server sends with Supabase's Broadcast REST API** (`backend/server/crew_broadcast.py`) and never subscribes to a room: a subscribed server counts as one more receiver and holds a connection. Per server instance it sends at most 20 events per crew in any 10 seconds, and at most 5 events in any second over all crews together (a loop that walks over every crew is bounded too: one event costs one message to send and up to 4 to deliver). The whole call takes at most 2 seconds.
5. **Joins are spread out.** A room of one kind (world, place, crew) starts to join at most once a second, so a place or a crew that changes in every frame cannot flood the project (the free plan allows 100 channel joins a second for everybody). A crew room that the rules refused is joined again only when the game calls `setCrew` again.
6. **Poll when a few seconds of delay are fine.** L3 (the board) and A7 (the duels) keep polling as their fallback. A crew event lets them poll slowly (for example every 30 seconds) and refresh at once when an event arrives, but only after step L7 of the [manual test plan](../supabase/README.md#live-presence-checks-steps-l1-to-l7) has passed once on the real project: it is the only check that the server's secret key can really send into a crew room.

### The budget in numbers

Our arithmetic. `rate = min(2, 60 / (online x room))` keeps the moves of the whole project at or under 60 of the 100 messages a second, even if every player is walking.

| Case | Online | Room | One update every | Worst case, everyone moving |
|---|---|---|---|---|
| A crew of 4, nobody else online | 4 | 4 | 0.5 s | 4 x 2 x 4 = 32 messages a second; 115,200 an hour (57,600 if half are moving) |
| A place with 8, the only players online | 8 | 8 | 1.1 s | 8 x 0.91 x 8 = 58 a second |
| A class of 30 | 30 | 4 (rooms shrink) | 2 s | 30 x 0.5 x 4 = 60 a second |

In the class of 30, presence adds about 10 messages a second (two updates per trip, one trip per player every 3 minutes), arrival replies about 3 and crew events about 2. The worst case is about 75 a second and a realistic one about 45, both under 100. A 90-minute class costs at most 324,000 messages for moves. **The start and the reconnect are a burst of their own:** every announcement of a captain is delivered to everyone online, so N captains who announce themselves within W seconds cost about N x N / W deliveries a second near the end of that window. That is why the first announcement waits a random 0 to 5 seconds (the start) plus a random 0 to 10 seconds (after every join of the world room): a class of 30 spreads its first announcements over 15 seconds, about 30 x 30 / 15 = 60 deliveries a second at the busiest moment, plus the joins themselves. A Realtime blip that drops everybody is spread the same way, because the first announcement after each rejoin waits again. Without the wait, 30 captains in 5 seconds would cost about 180 a second. This is our arithmetic and not a measurement, and Supabase's way of averaging its per-second counter is not verified: after the first class, read Realtime > Reports (Presence Events and messages per second), and widen `TRACK_JITTER_MS` in `frontend/src/net/live-rules.js` if the peak comes near 100. **The month is the limit that really binds:** 2 million messages cover about 8 class sessions, or about 35 hours of a crew of 4 playing with half of them moving at any moment.

### The guard

Once a second the browser estimates `(updates a second heard in our room plus those we sent, averaged over the last 10 seconds) x online`: the cost of the whole game if every room were as busy as ours. Above 80, the rate is halved for 5 minutes and the status becomes `slow`. If Supabase says "Too many messages per second", the browser turns on slow mode and waits at least 10 seconds before it joins that room again. After a presence rate-limit message it waits at least 30 seconds. After any other failure it waits `1 s + random x min(30 s, 2 s x 2^tries)`, and the count of tries starts again after 60 seconds of being joined. A room whose error says "Unauthorized" is given up (the world room then reports `offline`). The first join waits a random 0 to 5 seconds, and the first announcement after every join of the world room waits a further random 0 to 10 seconds, so a class that opens the game together stays far under 20 presence tracks and 100 joins a second, and its announcements are spread as the budget above says.

### Events for the screens

The browser module `startRealtime` in `frontend/src/online/realtime.js` emits these on the event bus. The payloads are plain data. A listener that throws does not break the module. A name that is null is shown as "Captain".

| Event | When | Payload |
|---|---|---|
| `live_status_changed` | the connection changes state | `{state}`: `connecting`, `live`, `slow`, `offline` or `off` |
| `live_presence_changed` | the shown set, a count or a name changes | `{place, room, shown: [{id, name, kit, crewmate}], hiddenCount, crew: [{id, name, place}]}`. At most 8 other captains are shown, crewmates first, then by id. `hiddenCount` counts the other captains of our place in all its rooms that are not shown (0 on the home islet). `crew` lists the crew members who are online. |
| `live_peer_moved` | a shown captain sends a valid position | `{id, x, z, facing, moving, everyMs}` |
| `live_peer_emoted` | a shown captain sends a valid emote | `{id, emote}` |
| `live_crew_updated` | the server sends a crew event | `{kind, data}` |

Receivers check everything and drop what fails: the sender must be in our place and room by the world presence, `v` must be 1, the shape and the ranges must match, `place` must be ours, `seq` must be newer, a position must come at least 400 ms after the last accepted one from that captain and an emote at least 2 s after.

On the receiving side the adapter that draws a captain glides it in a straight line from where it is drawn to the new spot over `everyMs` (`glide` in `frontend/src/net/live-rules.js`). It snaps instead when the jump is longer than a captain could sprint in 1.5 x `everyMs` at 6 units a second (`shouldSnap`). The walk animation plays while `moving` is true.

### Wiring it into the game

The package builds the module and its rules. The integrator (after A2 and the screens adapter exist) wires it in with these steps, in the way section 3 describes for the weather:

1. Start it once after sign-in when `/api/config` says `flags.live_presence` is on: `const live = startRealtime({ enabled, playerId, getAccessToken, kit, crew })`. `playerId` comes from `GET /api/me` and `getAccessToken` from A2's session module. The library calls it on every connect, every room join and every 25 seconds, so it should answer from the session in memory and renew the token before it ends (if the token is not renewed, the rooms close about an hour after the last one and every rejoin is refused until a fresh token arrives). `enabled` must be the boolean `true`; anything else keeps the module switched off. `crew` is `{ id, memberIds }` from A6, or null. Import `realtime.js` only from the lazily loaded game code (`src/game.js`) or with `await import()`, never from the title entry: with its helpers it adds about 16.5 kB (6.8 kB gzipped) to the file that imports it, while the library `@supabase/supabase-js` stays a separate chunk of about 214 kB (55 kB gzipped) that loads only when the module starts, and the cold title has a budget of 35 kB, of which about 21.5 kB are used.
2. Call `live.setPlace(null)` on the `travel` event and `live.setPlace(e.place)` on `arrived`, and call it once right after the start. The module says nothing about where we are until it has been told a place once, so that the first announcement already holds the place and its room. Pass null during the intro, the cinematics and the `?demo=1` tour.
3. In the game loop, call `live.update({x, z, facing, moving: speed > 0.05})` every frame. The module slows itself down. `live.emote(id)` returns whether the emote will be sent: it is `false` for an emote that is not on the list, inside the 3 second cooldown, and while nobody could see it (alone in the room, the socket closing, or our place not announced yet).
4. The adapter draws other captains with `createCharacter(art, ...)` and moves them with `glide()`.
5. Call `live.stop()` in `dispose()` and when the player signs out.

### What the browser adapter (G9) maps

G7 and G8 draw other captains from the case adapter's view (`presence` in `frontend/src/adapter/contract.js`, checked by `frontend/src/adapter/conformance/suite.js`), and A4's module speaks its own words. They were built apart and use different names, so nothing connects them yet. The real browser adapter (package G9, Codex) is the one place that translates; neither side changes its contract for the other.

| What | G7/G8 adapter view and intents | A4 module (`frontend/src/online/realtime.js`) | What G9 does |
|---|---|---|---|
| Our position | `reportPosition({place, x, y, facing, moving})`; `y` is the world's z | `live.setPlace(place)` on travel and arrival, then `live.update({x, z, facing, moving})` | pass `y` as `z`; call `setPlace(null)` during the intro, the cinematics and the tour |
| Others' position | `presence.others[]` with `x`, `y` | `live_peer_moved {id, x, z, facing, moving, everyMs}` | `y` = `z`; keep `everyMs` for the glide |
| Facing | `front`, `back`, `left`, `right` | `up`, `down`, `left`, `right` (`facingFrom`) | `back` = `up` (moving to a smaller z), `front` = `down` |
| Emotes | `wave`, `cheer`, `point`, `lantern`, `shrug` (art `public/pixel/emote-*.png`) | `wave`, `cheer`, `nod`, `shrug`, `follow_me`, `help` (`EMOTES` in `live-rules.js`) | only `wave`, `cheer` and `shrug` exist on both sides, and A4's module refuses any other id. One list has to be chosen before the wiring (D006 left emotes to a later package) |
| Who is shown | `presence.others[]`: `id`, `name`, `kit {id, name}`, `isCrew`, `emote`, `at`; `hiddenCount`; at most 8 (`PRESENCE_LIMITS.visible`) | `live_presence_changed {place, room, shown: [{id, name, kit, crewmate}], hiddenCount, crew}`; at most 8 (`MAX_SHOWN`) | `isCrew` = `crewmate`; `kit` comes as an id or null, so G9 adds the kit's name from the entry kits; `at` is the time a message arrived; a null name shows as "Captain" |
| Our emote | `setEmote(id)`, refused as `emote_cooldown` or `invalid_emote` | `live.emote(id)` answers `false` inside the 3 s cooldown, for an unknown id, or when nobody could see it | turn `false` into the matching refusal |
| Connection | `presence.status`: `live`, `reconnecting`, `offline`, `off` | `live_status_changed {state}`: `connecting`, `live`, `slow`, `offline`, `off` | `connecting` = `reconnecting`; `slow` (the guard halved the rate) = `live` |

Two more items from Codex's G8 handoff ([frontend/GRAPHICS.md](../frontend/GRAPHICS.md)) are on G9's list. **The bulletin:** `GET /api/bulletin` already answers with the keys G8's view reads (`day`, `lines`, `weather`, `exchange`, `chapterTwoHook`, all camelCase); G9 adds `status` (`off` by default, `loading`, `ready`, or `unavailable` for `503 bulletin_unavailable`) and must send `weather.attribution` as a string when the server's is null (`frontend/src/adapter/conformance/bulletin.js` checks both). **The log and the board:** G8 also expects nested `log.observations` and earned-only deduction `clears` and `clearedTitles` from the case services (S3, L3), which are not built yet.

### Crew events from the server

`backend/server/crew_broadcast.py` sends one HTTP request per event to `POST {SUPABASE_URL}/realtime/v1/api/broadcast` with the secret key. It is wired into `create_app(..., broadcaster=...)`, and a route asks for it with `BroadcasterDep`. There is no new setting: it uses `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and the flag `live_presence` (while the flag is off it sends nothing).

```python
sent = await broadcaster.send(crew_id, "board_changed", {"version": 7})   # True if Supabase took it
```

| Kind | Sent by | After |
|---|---|---|
| `board_changed` | L3 | a pin, a deduction, nightfall, a change of post, a beam lock change |
| `finale_changed` | L3 | the Relighting |
| `case_changed` | S3 | a card is found or an accusation is made |
| `partner_changed` | S4 | an NPC errand finishes |
| `crew_changed` | A6 | someone joins or leaves the crew |

Each caller sends after its database change has succeeded, with `data={"version": n}`, on state changes only and never on every input. A wrong argument (a crew id that is not a uuid, an unknown kind, data over 1 KB) is a bug in the caller and raises `ValueError`. Everything else that can go wrong (the flag is off, Supabase is not set up, more than 20 events for one crew in 10 seconds or more than 5 events in a second over all crews, a refusal, a timeout of 2 seconds for the whole call) returns `False` with one short warning that never holds the key, the crew id or the payload. The list of kinds is `CREW_EVENT_KINDS`, in Python and in `frontend/src/net/live-rules.js`; a test keeps the two equal.

### Case refresh budget

Once A4 is on main, case writes use its broadcaster for `case_changed`, `board_changed` and `partner_changed`, carrying only `{"version": writeRevision}`. Reads, repeats, unchanged refusals and timed landings send no nudge. Cut off each nudge after one second; enforce 20 crew events per 10 seconds. Until that integration, refetch on countdown boundaries and use a five-second fallback poll; with live nudges, use a visible-tab 30-second fallback poll. No nudge carries cards, narration or player ids.

## 8. Feature flags

A flag is off unless the setting `FEATURE_FLAGS` names it (comma separated). The server reads it once at start-up, and a name that does not exist stops the server with a clear message. The browser learns which flags are on from `GET /api/config` and never decides for itself. To add a flag, follow [ENGINEERING.md, recipe 4.5](ENGINEERING.md#45-add-a-feature-flag).

| Flag | Switches on | Package |
|---|---|---|
| `market` | the Island Exchange | L4 |
| `predictions` | the prediction desk | L5 |
| `sports` | sports predictions | L6 |
| `arena` | Lantern Duels, the turn-based arena | A7 |
| `raid` | the phone class raid | A5, later |
| `live_presence` | other captains live: moves, presence, emotes, crew events (Supabase Realtime) | A4 |
| `companion_llm` | a language-model companion | later, only with a capped server key and Nils' OK |
| `case` | every case route, including the later world route | G10; off until all case migrations used by the deployment are applied |

The names of all settings are in [.env.example](../.env.example), and [ARCHITECTURE.md](ARCHITECTURE.md#where-each-secret-lives) says where each secret lives.

## 9. Reserved interfaces

Every name here is a draft until the freeze on Mon 9 (D009). Package ids are those of the team roadmap. The package that builds an interface writes the final shape in its spec and in the contract's home, then updates this table.

**Where content files live (D016, proposed).** Content that the server reads lives in `backend/content/`. A file the browser needs in order to play is served by `GET /api/content/{name}`. A file the browser must never see lives in `backend/content/secret/` and is never served. Data that only the browser uses stays in `frontend/`. A `.json` file named in a row below has its path under `backend/content/`, unless the row gives another folder. A third kind is a file that only the server reads but that is not secret: it is not on the public list, and the browser sees it only through a route. The open-world files `weather_states.json`, `bulletin.json` and `chapter_two_hook.json` are of this kind.

| Package | Reserves | Status |
|---|---|---|
| G2 Places and sea chart | `createPlace(ctx)` returning `{group, zones, anchors, colliders, update(dt), dispose()}`; `world.goTo(placeId)`; the events `travel` and `arrived`; the place registry `frontend/src/world/places/registry.js` (place ids, hotspot ids and positions), which replaced the proposed `content/places.json` | draft |
| G3 Saltreach Harbor | A place module `harbor` whose hotspots emit `interact` with ids from the place registry `frontend/src/world/places/registry.js` | draft |
| G4 Finale visuals | `world.cinematic('three_lights' \| 'fog_lift' \| 'unmask')`, which listens for the `finale` event | draft; defined by the story round (S0, D018) |
| S1 Import Plot Twist | `backend/content/story.json`, with the content format in `backend/content/README.md`; `GET /api/content/intro-story`; the story engines `backend/plot_twist/engine.py` and `frontend/src/story/engine.js`; the parity test `backend/plot_twist/tests/test_web_parity.py` with its Node.js runner `parity_runner.mjs` | draft |
| S2 Act 1 in the browser | The move log `actions[]`; the event `intro_ended` | draft |
| S3 The shared case | `GET /api/case`, `POST /api/case/search`, `POST /api/case/accuse`, `POST /api/host/case/clock`; private case data never served | Phase 1 built on `feat/case-backend`; section 10 is the contract |
| S4 NPC partners | `POST /api/crews/me/orders {seat, order, target, actionUid}`; `backend/content/partners.json` (orders, errand times, scripted lines) | draft; defined by the story round (S0, D018) |
| A2 Sign-in, captain names and cloud progress | **Built** (the sign-in itself is pending Nils' decision): `GET /api/me` returns `captainName`, `kit` and `place` besides `{id, displayName, coins, crews}` (`kit` and `place` are filled by A3, from the entry profile); `POST /api/me/name`; `POST /api/me/name/reroll {actionUid}`; `GET /api/save`; `PUT /api/save {version, data}` with `409 stale_save`; `DELETE /api/me {confirm}`; `require_host` / `HostDep` with the setting `HOST_PLAYER_IDS`; `backend/content/names.json`; the table `captain_name_rerolls`; `frontend/src/online/api.js` and `session.js`. **Not built:** the "Sign in with GitHub" button and any sign-in screen, the "Saved" indicator, a delete button, and the Supabase JS library. The game's sign-in must use the PKCE flow, like the check page (see `POST /api/auth/exchange`, section 2). Decisions D006 and D022. | built; the sign-in part is pending |
| A3 Referee and entry kits | **Built**: `POST /api/intro/complete {actions[]}` returning `{ending, decision, readLog, kit, coinsPaid, alreadyGranted}` (section 2); the table `entry_profiles`, which `GET /api/me` reads for `kit` and `place`; `backend/content/entry_kits.json`; `backend/server/game/referee.py`; the kit coins through `kit_grant` with the fixed `ref` `kit`, paid inside `grant_entry_kit()`. Decision D019. **Pending Nils:** that the first ending counts (N6). The coins and texts of the kits (N5) were settled by the story round (D018). | built, in review |
| A6 Crews and seats | **Built**: `POST /api/crews` (returns a crew code), `POST /api/crews/join {code}`, `POST /api/crews/me/start` (the muster) and `GET /api/crews/me` (section 2); the columns `crews.code`, `version` and `started_at`, the table `crew_join_failures` and the four crew functions (migration `20261106040000_crew_codes.sql`); `read_open_crew_seat()` in `backend/server/crews/store.py` for S3 and L3. Decision D020. | built, in review |
| A7 Lantern Duels (the PvP arena) | **Server built** (flag `arena` off; its migration is not applied yet): `GET /api/duels` (new), `POST /api/duels {opponentName, rounds, stake, signals, actionUid}`, `GET /api/duels/{id}`, `POST /api/duels/{id}/move {signals, actionUid}` and `POST /api/duels/{id}/cancel` (new); the tables `duels` and `duel_moves`; the functions `duel_create()`, `duel_answer()` and `duel_void()`; the reasons `arena_stake` and `arena_payout`; the flag `arena`. See section 2 and D026. The routes are built behind the arena flag; production enablement follows the post-merge checks. | built, in review |
| A4 Live presence | **Built** (flag `live_presence` off; its migration goes live with group 2; G9 connects it to the presence screens, see section 7): the private Realtime rooms `live:world`, `live:place:<place>:<room>` and `live:crew:<crew id>`; the browser module `frontend/src/online/realtime.js` with its parts in `frontend/src/net/` (`live-rules.js`, `live-rooms.js`, `live-places.js`, `live-sender.js`, `live-view.js`); the events `live_status_changed`, `live_presence_changed`, `live_peer_moved`, `live_peer_emoted` and `live_crew_updated`; the server helper `backend/server/crew_broadcast.py` (`create_app(..., broadcaster=...)`); the migration `20261106050000_live_presence.sql`; the flag `live_presence`. No table, no route. See section 7 and D023. | built, flag off |
| L1 Live weather | `GET /api/weather` returning `{cloudCover, rain, fog, wind, isDay, summary, place, source, fetchedAt, attribution}`, which also sends `state` and `tonight` ([section 2](#get-apiweather)); the settings `WEATHER_PLACE_NAME`, `WEATHER_LATITUDE` and `WEATHER_LONGITUDE`; `startLiveWeather` in `frontend/src/net/weather.js`; the event `weather_updated` | built; the `?place=` option was dropped (one place, chosen by the settings). How the client starts it is in [section 3](#weather). The event stays a draft. |
| Open-world must (W1, D1, H1) | `GET /api/weather` with `state` and `tonight` (the weather states and the fog-night rule); `GET /api/bulletin` returning `{day, lines, weather, exchange, chapterTwoHook}` (the Lisbon day, the daily bulletin and the Chapter 2 hook); the content files `weather_states.json`, `bulletin.json` and `chapter_two_hook.json` (server only, never on the public list); `create_app(..., world_stage=..., clock=...)`; the error `503 bulletin_unavailable` | built (spec `specs/open-world-must.md`); decision D024, proposed |
| L2 Your home islet | **Built** (the backend, its migration, which goes live with group 2, and the build panel): `GET /api/islet`; `POST /api/islet/build {plot, type, actionUid}`; the tables `islets` and `islet_buildings`; the function `islet_build()`; the events `plot_clicked` (opens the islet panel) and `islet_changed` (the panel emits it, G8's world draws what stands); `backend/content/buildings.json` (server only); coins through `building_purchase` with the ref `islet:<actionUid>`. See section 2 and D021. The panel is in `frontend/src/screens/islet/`. | built, in review |
| L3 Captain's Table board and Night of Three Lights | The shared read is `GET /api/case`; board/night writes are `/api/board/pin`, `/api/board/pair`, `/api/finale/nightfall`, `/api/finale/post` and `/api/finale/signal`; later `GET /api/world` | Phase 2 built, Phase 3 reserved by D027; the old `GET /api/board` reservation is replaced |
| L4 Island Exchange (the market) | **Built, version 2** (on `feat/l4-exchange-v2`; flag `market` off; its migration is not applied yet): `GET /api/market`, `GET /api/market/portfolio`, `POST /api/market/open {companyId, side, stake, actionUid}`, `POST /api/market/close {positionId, actionUid}`; the tables `exchange_positions` and `exchange_events` and the functions `exchange_open_position()`, `exchange_close_position()` and `exchange_close_used_up()`; the reasons `market_stake` and `market_payout` (`market_fee` is used again); `backend/content/market/companies.json`, `calendars.json` and `replay.json`; the settings `STOCK_API_PROVIDER` and `STOCK_API_KEY` (`MARKET_MULTIPLIER` is gone); the flag `market`; the seam `has_open_rising_position()` for card C6 and the seam `relit_check` for L3. See section 2 and D017. | built, in review |
| L5 Prediction desk | **Built** (flag `predictions` off; its migration is not applied yet): `GET /api/predictions`, `GET /api/predictions/mine`, `POST /api/predictions/stake {questionId, side, amount, stakeId}`, `POST /api/predictions/settle {questionId, outcome}` (host only); the tables `prediction_pools` and `prediction_stakes` and the view `prediction_pool_sides`; the functions `prediction_place_stake()` and `prediction_settle_pool()` and the trigger `prediction_pools_keep_settled()`; the reasons `prediction_stake` and `prediction_payout`; `backend/content/predictions/questions.json` (with `recorded/` and `samples/`); `backend/server/predictions/` (`pools.py` is shared with L6); the check `require_host` and the setting `HOST_PLAYER_IDS`. The paths changed from the roadmap: one folder per feature, as `market/` and `weather/`. See section 2 and decision D025. | built, in review |
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

Everything about the shared mystery is **defined by the story round (S0, approved by Nils on 5 Nov 2026, D018)** in [docs/story/](story/README.md) and `backend/content/secret/case.json`: the cards and deductions, the case clock, the finale, the accusation, the orders and lines of NPC partners, the rewards and the rule that keeps spoilers away from crews that have not solved the case. This page only reserves the names other packages will build (S3, S4, L3 and G4 in [section 9](#9-reserved-interfaces)). The case data format is in [backend/content/README.md](../backend/content/README.md#the-case-data-secretcasejson-and-partnersjson); Phase 1's contract below supersedes its older reservations; later phases remain reserved.

What already holds, from the foundation: a reward is paid with `clue_reward` or `mystery_reward` and a `ref` that makes each payout happen once per player, buying a clue uses `clue_purchase`, and a crew's seats can hold NPC partners ([section 6](#6-crews-and-seats)).

### Case Phase 1 contract for G9

Published on `feat/case-backend` for G9. The executable view fixture is `backend/server/tests/case_fixtures.py`; view, reveal and spoiler tests use the same fixture. Player and crew ids are replaceable fixture values. Suspect ids and all story text come from server content at runtime; clients must not depend on those values.

Every route needs the server flag `case` (off by default) and a verified player. Every answer, including a refusal or validation error, is `Cache-Control: private, no-store`. The server selects the player's own open crew, or their latest finished crew for reads. Request bodies never accept player, crew, kit, wallet or progress facts.

| Method and path | Body | Success |
|---|---|---|
| `GET /api/case` | None | `{"case": null}` without an active case, or `{"case": <view>}` |
| `POST /api/case/search` | `{"routeId":"C1.notice_board","actionUid":"search0001","paidConfirmed":false,"expectedPrice":null}` | Intent answer with `readyIn` seconds and `coinsSpent` |
| `POST /api/case/accuse` | `{"suspect":"<suspect-id>","actionUid":"accuse0001"}` | Intent answer; an accepted solve adds `solved:true`, `world` and `coinsPaid` |
| `POST /api/host/case/clock` | `{"seconds":600,"actionUid":"clock0001"}` | Host only; intent answer with the new `now` for that host's own crew |

An intent returns `200` for accepted actions and game-rule refusals:

```json
{"accepted":true,"reason":null,"message":"<interface or earned story line>","case":{}}
{"accepted":false,"reason":"locked_window","message":"<countdown>","minutes":4,"case":{}}
{"accepted":false,"reason":"accusation_refused","message":"<refusal>","repeat":true,"case":{}}
```

Make `actionUid` once per click, using 8 to 64 ASCII letters, digits, underscores or hyphens. Retry the same uid after an uncertain `503`: a stored result answers first, before current rules or finished-crew checks. The repeat keeps its original accepted/refused outcome, adds `repeat:true`, rebuilds the message and returns a fresh view. Unstored extra numbers are omitted. Reusing a uid with another target still returns the original action. A wrong accusation repeated with its uid remains a refusal, not a successful action.

Phase 1 search refusal reasons are `lead_locked`, `already_have`, `wrong_kit` and `locked_window`, checked in that order after checking the route exists. Only `kit`, `open` and `timed` routes are active. Starting a timer does not expose the card text before it lands. Accusation reasons are `already_solved` (defensive), `schooner_required`, `evidence_required`, `accusation_cooldown` and `accusation_refused`, in that order. A wrong accusation starts a 60-second wait and is remembered. No accusation checks player position or boarding.

| HTTP status | Code | Meaning |
|---|---|---|
| 401 | `unauthorized` | Missing or invalid login |
| 403 | `forbidden` | Clock caller is not a host |
| 404 | `feature_off`, `no_crew`, `no_such_route`, `no_such_suspect` | Disabled feature, no crew for a write, or unavailable id |
| 409 | `crew_not_started`, `crew_finished`, `crew_busy` | Crew state does not permit a write, or a snapshot changed twice |
| 422 | `validation_error` | Bad uid or field shape, an extra field, or clock seconds outside 1 to 3,600 |
| 429 | `too_many_requests` | More than 10 writes or 30 reads per 10 seconds per player; see `Retry-After` |
| 502 | `database_error` | Unreadable reply or a database guard failure; never a case repeat |
| 503 | `case_unavailable`, `database_not_configured`, `database_unavailable` | Broken content, missing database or uncertain operation |

The inner view has `caseId`, `writeRevision`, `now`, `minute`, `crew`, `seats`, `me`, `premise`, `question`, `board`, `search`, `accusation`, `reveal`, `credits`, `finale` and `partners`. `writeRevision` counts state-changing writes, not countdown ticks. G9 owns its own structural adapter revision. Phase 2 fills `finale` and `me.timber`; `partners:[]` remains reserved for Phase 4.

`board` contains earned `cards`, open unheld `leads`, `logLead`, `deductions`, identical-shape `suspects`, `canPair` and `pairWait`. An incomplete deduction has exactly `id`, `name` and `complete:false`; it exposes no card pair or clearing information. `search.spots` groups eligible routes by hotspot, and `search.jobs` contains running finds and finds landed in the last 10 minutes. `accusation` carries `schoonerFound`, `allowed`, `cooldown`, `status`, the public suspect list, earned evidence and `lastWrong`.

Before a solve, `reveal` is only `{"available":false}`. A solver in this crew sees `available`, `solvedSecond`, `world`, ordered `lines` (`id`, `kind`, `text`, `cites`) and payout `credits`. Solving in another crew grants no reveal here. Phase 1's world result is `unchanged`; later hooks add `locked`, `relit`, `added` and `already_recorded`. The client must render returned lines rather than carrying its own reveal copy.

Only `now`, `minute`, `remaining`, `dawnRemaining`, `cooldown`, `pairWait`, `waitMinutes` and `statusText` change with time alone between structural boundaries. Refetch at a find landing, route window change, wait expiry or job expiry. A4 is now on main. State-changing writes send version-only hints through its shared sender; clients still use boundary refreshes for timed landings.

### Case Phase 2 board and night contract for G9

All five writes use the same signed-in player, `case` flag, strict `actionUid`, private/no-store response and repeat rules above. Unknown fields are rejected. The server computes rewards, light readiness, normalized bearings and the hidden target.

| Route | Body beyond actionUid | Successful answer extras | Game refusals |
|---|---|---|---|
| `POST /api/board/pin` | `cardId` (`C1` to `C8`) | `coinsPaid` | `card_not_held`, `already_pinned` |
| `POST /api/board/pair` | `cards` (two distinct card ids) | earned `deduction`, caller's `coinsPaid` | `pair_cooldown`, `not_pinned`, `different_seats_required`, `wrong_pair`, `already_deduced` |
| `POST /api/finale/nightfall` | none | `endsIn` | `schooner_found`, `deduction_required`, `night_in_progress`, `dawn_wait` |
| `POST /api/finale/post` | `light` | `onPostIn` | `night_required`, `light_not_ready`, `post_taken`, `already_on_post` |
| `POST /api/finale/signal` | `light`, finite numeric `bearing` in `[0,360)` | `holdsFor`, `parted`; successful parting adds `lights`, exact `target` | `schooner_found`, `night_required`, `post_not_ready`, `post_not_owned`, `aim_cooldown`, `off_target` |

Wait refusals carry `seconds`. A wrong pair or missed signal changes state and is remembered; its repeat remains `accepted:false`. Refusals that change nothing are not recorded. An unavailable light is 404 `no_such_light`; malformed card pairs or bearings are 422. The board exposes deduction details only after formation.

`finale` contains `phase`, `nightNo`, `canCall`, countdowns, `status`, rounded `glow`, `parted` and the required-tier lights. A light exposes public chart coordinates, readiness, its valid open post, current lock, last bearing and action availability. Exact target coordinates appear only after a successful three-light parting. Posts and locks from replaced partner seats do not count. Posts remain after dawn; locks expire strictly at their hold boundary.

One station built by any crew player readies the home light for every crew player. Partners never hold it. `me.timber` is the viewer's islet timber, using catalogue starter timber before their first islet row. Credits count historical locks separately from the successful-parting role used for solve payouts.

Search, accusation and host-clock writes send `case_changed`; board/night writes send `board_changed`, including wrong-pair and missed-signal writes. Payloads contain only `{"version":writeRevision}`. The shared A4 sender owns its budgets; an unavailable or slow hint is quiet and bounded to one second. Reads, repeats and unchanged refusals send nothing. Time-based landings use client countdown refreshes.

## 11. Open questions for Mon 9

1. **JSON names.** Confirm camelCase in JSON (`demoMode`, `actionUid`) and snake_case in Python and SQL. Also confirm the exception for content files, which keep their own spelling (`story.json` uses snake_case keys such as `hide_when_blocked`).
2. **Repeats.** What does a route answer when an `actionUid` comes a second time: the first answer again, or `409 already_applied` like the wallet? (The Island Exchange follows the wallet: `409 already_applied`.)
3. **Switched-off features.** Which status and code does a route answer while its flag is off? (The Island Exchange answers `404 feature_off` on its player routes, and its public price board works anyway.)
4. **The keep-alive caller.** Decided by Nils on 5 Nov 2026: a scheduled GitHub Actions workflow (`.github/workflows/keepalive.yml`) calls `GET /api/keepalive` once a day with the repository secret `CRON_SECRET` ([SETUP.md](SETUP.md), "Keep it awake until the demo"). Vercel Cron stays out, because a `crons` entry in `vercel.json` breaks our deploys while we use Services.
5. **Browser contracts after the final look.** G1 confirms that the event bus, the four story trigger ids and `setWeather` stay as written in section 3 when D005 is recorded.
6. **The default weather place.** Torshavn in the Faroe Islands is the proposal (real fog and storms that suit the story), Lisbon the option (`38.72`, `-9.14`). It is only the default of three settings, so changing it needs no code change. Without a decision the Faroe Islands stay.
