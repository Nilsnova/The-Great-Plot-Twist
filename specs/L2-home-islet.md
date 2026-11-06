# L2 Your home islet: implementation spec

> **What this is:** the build spec for package L2. Every player gets their own home islet, saved to their account, with a build panel, two API routes, one atomic database function and the "signal station built" fact that the finale needs.
>
> **Who uses it:** the backend builder and the panel builder of this workflow run, the controller (Claude), who merges and hands out the follow-ups, and the S3 and L3 builders, who read the signal station for the Night of Three Lights.

- **Status:** draft for the controller. Nothing here waits for a teammate: every item has an agent owner (section 10). Teammates review it and may extend it.
- **Branch:** `feat/l2-home-islet`, from `main` at `9f5bf97`.
- **Migration:** `supabase/migrations/20261106070000_home_islet.sql`.
- **Decision number:** the next free number at merge time. Today A2/A3 hold D006, D018 and D019, A6 holds D020, and the A4 spec also claims D018. Proposed: **D021**. The controller renumbers at merge. (It stayed D021; the two D018 entries of A2 and A4 became D022 and D023.)
- **Approved design used (read only, branch `docs/s0-story-round`):** `docs/story/OPEN-WORLD.md` sections 1 to 6 and 13 to 15, and `docs/story/CASE-FILE.md` sections 1, 3, 9, 10 and 17. These files are not on `main` yet, so cite them by that branch.

## Answer first

- **Five spots, one building each.** The registry's home islet has `plot_1` (cabin), `plot_2` (workshop), `plot_3` (windmill), `plot_4` (greenhouse) and `islet_signal_station` (signal station). Each spot holds only its own building. The cabin is there from the start. It is free and has no levels (OPEN-WORLD 5.1).
- **Prices.** Level 1 of every building costs **300 coins and 10 timber**, from one shared price list. Levels 2 (900 coins) and 3 (2,000 coins) come later, together with their materials. Every player gets **20 timber once** (the starter pack), stored with the islet.
- **23 Nov minimum.** The cabin plus two buildings you can build: the **signal station** (the crew's third light) and the **workshop**. The windmill and the greenhouse show as "coming later" until timber has a second source (the driftline). 20 timber buys exactly the station and the workshop, in either order, so no player can spend the starter timber in a way that blocks the finale.
- **Two routes.**
  - `GET /api/islet` returns the whole islet: coins, timber, and for each spot its state (`built`, `empty` or `locked`), its cost, what is missing and `canBuild`. It also returns `signalStationBuilt`.
  - `POST /api/islet/build {plot, type, actionUid}` builds level 1. The server takes every price from `backend/content/buildings.json`, never from the request.
- **Refusals.** None of these changes anything:
  - `404 no_such_plot` (out of range), `404 no_such_building` (unknown type), `404 player_not_set_up`
  - `422 wrong_plot`
  - `409 plot_occupied`, `409 not_buildable_yet`, `409 not_enough_timber`, `409 insufficient_funds`
  - `409 already_applied` for a repeated `actionUid`, which is always the first answer
  - the usual 401, 422, 502 and 503
- **One atomic SQL function, `islet_build()`,** following the L4 Exchange pattern. In order, it:
  1. locks the wallet row
  2. refuses a repeated ref
  3. creates the islet row with the starter pack on first use, then locks it
  4. checks the plot
  5. checks the timber
  6. charges the coins through `apply_wallet_transaction()` (reason `building_purchase`, ref `islet:<actionUid>`)
  7. takes the timber and records the building

  It is all or nothing, and it adds **no new wallet reason**. I ran a draft of this migration on a scratch Postgres: 30 of 30 checks passed, including six races (section 5.6).
- **Two tables.** `islets` has one row per player (their timber). `islet_buildings` has one row per standing building, with the primary key (player, plot). Both have RLS, players read only their own rows, every right is granted explicitly, and only `islet_build()` writes.
- **The finale (S3, L3).** They call `players_with_signal_station(admin, crew_player_ids)` in `backend/server/game/islet_store.py`. In SQL the same fact is one `exists` over `islet_buildings`. A station is never removed, so a check made before L3's own transaction stays true. The case never charges for the station itself: the finale screen's "Build signal" button maps to `POST /api/islet/build`.
- **The panel** lives in `frontend/src/screens/islet/`:
  - a kit modal with five spot cards
  - an adapter that maps two intents (`refresh`, `build`) to the two routes through an injected transport
  - a local fake transport for `?islet=local` in dev
  - a host that opens the panel on `plot_clicked`

  The hook is one import, one changed line and three `stopPlots.active` checks in `frontend/src/game.js` (section 7.5).

## Why

The roadmap makes L2 core for M2: "Each islet is saved per account". The case needs it even more than the roadmap says. CASE-FILE 10.2 makes a home signal station the crew's third light, so without L2 no crew can finish the finale. The open world (OPEN-WORLD 5.1) also uses the islet as the main way to spend coins. Coins are play money only.

## Facts checked on 5 Nov 2026, in this worktree and the parallel worktrees

| Fact | Where |
|---|---|
| The home islet has the zones `plot_1` "Cabin plot", `plot_2` "Workshop plot", `plot_3` "Windmill plot", `plot_4` "Greenhouse plot", `islet_signal_station` "Islet signal station" and `home_driftline`. The light `islet_signal_station` has a beam origin. | `frontend/src/world/places/registry.js` |
| `decorateHome` emits `{type:'plot_clicked', plot}` for `plot_1` to `plot_4` only, from an `interact` (E key) or a pointer click. It does not emit it for the signal station. | `frontend/src/world/places/home.js`, GRAPHICS.md line 110 |
| Interacting with `islet_signal_station` opens the case finale screen. | `frontend/src/world/places/case-spots.js` |
| The only listener of `plot_clicked` is `const stopPlots = on('plot_clicked', event => hud.notify(event.plot));`. `dispose()` and the start-up failure path both call `stopPlots()`. | `frontend/src/game.js` line 67 |
| The islet always draws all four buildings and a signal station, as scenery. | `layouts.home_islet` in `frontend/src/world/places/layouts.js` |
| The case fake charges 300 coins and 10 timber itself for `buildLight('islet_signal_station')`, and keeps `timber: 20` in the case state. | `frontend/src/adapter/fake/night.js`, `state.js` (Codex's files) |
| Vitest collects only `tests/**/*.test.js`. There is no DOM test environment (no jsdom), so the client tests are pure. The DOM is checked in a real browser by `scripts/check-*.js`. | `frontend/vite.config.js`, `frontend/package.json` |
| A frontend test may read a backend content file with `readFileSync('../backend/content/...')`. | `frontend/tests/demo-content.test.js` |
| `building_purchase` exists, with direction `spend`. | foundation migration, `WALLET_REASONS` |
| `market_trade()` locks the wallet row first (`select ... for update`). | Exchange migration, step 2 |
| `read_reply` maps a body code `23505` to `409 already_applied`, `P0001 insufficient_funds` to `409 insufficient_funds`, a 5xx to `503 database_unavailable`, and anything else to `502 database_error`. | `backend/server/supabase_admin.py` |
| `create_app` takes services by keyword only, after `*`. | `backend/server/app.py` |
| A3 (not merged) creates `backend/server/game/__init__.py`, `entry_kits.py`, `referee.py` and `entry_profile_store.py`. A2 adds `frontend/src/online/api.js`, whose `api.get` and `api.post` return `{ok, status, data}` or `{ok:false, status, code, message, retryAfterSeconds?}`. | the A2/A3 branch |
| Parallel migrations: `020000_accounts` and `030000_entry_profiles` (A2/A3), `040000_crew_codes` (A6), `050000_live_presence` (A4). | the parallel worktrees |
| `test_wallet_matches_migration.py` scans every migration for `insert into ... wallet_reasons` and for `update`, `delete from` or `truncate` of `wallet_reasons`, comments included. | that test |

## Design decisions, and where this spec departs from the design documents

| # | Decision | Why |
|---|---|---|
| 1 | Five spots, each with a fixed building. The request still carries `type`, as a confirmation: a mismatch is `422 wrong_plot`. | OPEN-WORLD 5.1 ("Each line has its own spot"), the registry, and the roadmap's `{plot, type, actionUid}`. This replaces the roadmap's "3 plots" (OPEN-WORLD 15.2, point 18). |
| 2 | The cabin is there from the start: no row, no charge, no ledger row. A build on `plot_1` is `409 plot_occupied`. | "It is free, and in version 1 it has no levels." A wallet call for 0 coins is impossible (`wrong_direction`). |
| 3 | For 23 Nov, only the station and the workshop can be built. | OPEN-WORLD 4.2 row 3 and 5.1. Without salvage a player has 20 timber for life, so a third building would let a player spend the timber the station needs. I rejected a "keep 10 timber for the station" rule, because it needs another argument and another branch in the SQL function. |
| 4 | The ledger ref is `islet:<actionUid>`, not `build:<line>:<level>` (OPEN-WORLD 13.1). | Same pattern as the Exchange (`market:<actionUid>`) and INTERFACES section 1. A level cannot be paid twice, because the primary key `(player_id, plot)` and the charge are in one transaction under the wallet lock (the race checks prove it). A fixed ref would also block a rebuild forever. |
| 5 | The starter pack is stored in `islets.timber` and arrives when the first build creates the row. Before that, GET shows 20. | OPEN-WORLD says "with the entry kit", "stored with the islet", "no ledger row". Doing it at the first build keeps L2 independent of A3. The result is the same: 20 timber once per player, guarded by the primary key. |
| 6 | Prices and the starter pack are arguments of `islet_build()`, taken from `buildings.json`. | Every number has one home (the "Numbers" rule in OPEN-WORLD). It is the same pattern as `market_trade()`, where the price is an input. |
| 7 | The SQL function **returns** refusals that depend on saved state as JSON. It **raises** only for missing coins (`insufficient_funds`) and for a repeat (`23505`). | The Exchange pattern: a raised error cannot carry a reason through `read_reply`, and returned refusals leave `supabase_admin.py` unchanged. |
| 8 | Every money function locks the wallet before the islet. | Same lock order as `market_trade()`, so a trade and a build never deadlock. Two races prove it. |
| 9 | In this version a building is never edited or deleted (there is no grant for it). | Least privilege. Phase 2 grants `update` together with its upgrade function. |
| 10 | No feature flag and no speed limit. | L2 is core (OPEN-WORLD 13.3 lists its flag as "none"). At most two builds can succeed per player, and every refusal costs one read and one function call. Add the Exchange's speed-limit pattern if abuse shows up. |
| 11 | Islets are private: other players cannot read yours. | "Visiting friends" comes later (OPEN-WORLD 4.2). The finale reads through the server. |

## 1. `backend/content/buildings.json`

This file is server only. The browser never fetches it (D016); it gets everything through `GET /api/islet`. Keys are camelCase, like `market/companies.json`.

```json
{
  "about": "The buildings of a home islet (package L2). Each spot is a hotspot of home_islet in frontend/src/world/places/registry.js and holds one kind of building. Every number is a start value from docs/story/OPEN-WORLD.md section 5.1 and changes only by pull request.",
  "playMoneyNote": "Play money. No cash value. It cannot be bought or cashed out.",
  "starterTimber": 20,
  "priceList": [
    { "level": 1, "coins": 300, "timber": 10 }
  ],
  "spots": [
    { "plot": "plot_1", "plotName": "Cabin plot", "type": "cabin", "name": "Cabin",
      "about": "Your home on the islet. It stands from the start and costs nothing.",
      "standsFromStart": true, "buildable": false },
    { "plot": "plot_2", "plotName": "Workshop plot", "type": "workshop", "name": "Workshop",
      "about": "A bench and tools for making parts. What it can make comes in a later update.",
      "buildable": true },
    { "plot": "plot_3", "plotName": "Windmill plot", "type": "windmill", "name": "Windmill",
      "about": "Presses lamp oil for your signal station.",
      "buildable": false, "lockedNote": "Opens when timber starts washing up on your beach, in a later update." },
    { "plot": "plot_4", "plotName": "Greenhouse plot", "type": "greenhouse", "name": "Greenhouse",
      "about": "A garden you can see from the sea.",
      "buildable": false, "lockedNote": "Opens when timber starts washing up on your beach, in a later update." },
    { "plot": "islet_signal_station", "plotName": "Islet signal station", "type": "signal_station", "name": "Signal station",
      "about": "Your home light. Your crew needs one signal station for the Night of Three Lights.",
      "buildable": true }
  ]
}
```

**Rules the loader checks.** The loader is `backend/server/game/building_catalogue.py`, modelled on `market/companies.py`. Any mistake stops the islet with a message that names the entry and the field.

- `starterTimber`: a whole number (not a bool) from 0 to 100.
- `priceList`: exactly one entry in Phase 1, with `level` 1. `coins` is a whole number from 1 to `MAX_DELTA` (1,000,000, from `wallet.py`). `timber` is a whole number from 0 to 1,000.
- `spots`: a list of 1 to 10 entries.
  - `plot` and `type` match `^[a-z0-9_]{2,40}$`.
  - `plotName` and `name` are 2 to 40 characters, `about` is 1 to 160, and `lockedNote` is 1 to 160.
  - `standsFromStart` and `buildable` are booleans. `standsFromStart` defaults to false.
- No two spots share a `plot` or a `type`.
- A spot that is there from the start cannot also be buildable.
- A spot that is neither buildable nor there from the start needs a `lockedNote`.
- Exactly one spot has `type` `signal_station`, and its `plot` is `islet_signal_station`. The finale depends on this.
- `playMoneyNote` and `about` are text that is not empty.

Document the format as a new section "buildings.json" in `backend/content/README.md`. It holds the table of fields above and the rule "never rename a plot or type after players have built: rows in `islet_buildings` point at them".

## 2. Pure rules: `backend/server/game/building.py`

No network, no database, no clock: plain values in, plain values out, about 120 lines. The data types that the catalogue needs (`Cost`, `Spot`, `BuildingCatalogue`) live in `building_catalogue.py`, so the two files import in one direction only.

```python
SIGNAL_STATION = "signal_station"  # the building the finale counts (CASE-FILE section 10.2)
COINS, TIMBER = "coins", "timber"   # the words of `missing`, in this order
BUILT, EMPTY, LOCKED = "built", "empty", "locked"

@dataclass(frozen=True)
class StandingBuilding:   # one row of islet_buildings
    plot: str
    building_type: str
    level: int
    built_at: datetime

@dataclass(frozen=True)
class SpotPlan:           # one spot as GET /api/islet shows it
    spot: Spot
    state: str            # BUILT, EMPTY or LOCKED
    level: int | None     # None for the cabin and for empty or locked spots
    built_at: datetime | None
    cost: Cost | None     # None when built
    missing: tuple[str, ...]
    can_build: bool

@dataclass(frozen=True)
class IsletPlan:
    coins: int
    timber: int
    spots: tuple[SpotPlan, ...]
    signal_station_built: bool

class BuildRefused(ApiError):
    """A build the rules do not allow. Nothing was changed."""

def find_spot(catalogue, plot) -> Spot                       # 404 no_such_plot
def check_build(catalogue, plot, building_type) -> tuple[Spot, Cost]
def level_one_cost(catalogue) -> Cost
def missing_for(cost, coins, timber) -> tuple[str, ...]      # (), ("coins",), ("timber",) or both
def plan_spot(catalogue, spot, standing, coins, timber) -> SpotPlan
def plan_islet(catalogue, standing: list[StandingBuilding], coins, timber) -> IsletPlan
def has_signal_station(standing: list[StandingBuilding]) -> bool
```

`check_build` refuses in this fixed order, and otherwise returns the spot and the level 1 cost:

1. an unknown plot: `404 no_such_plot`
2. an unknown type: `404 no_such_building`
3. a type that belongs to another plot: `422 wrong_plot`
4. a spot that is there from the start: `409 plot_occupied`, "Your cabin already stands here."
5. a spot that is not buildable: `409 not_buildable_yet`, with the `lockedNote` as the message

`plan_spot` decides the state of a spot in this order:

1. A spot that is there from the start is `built`, with no level and no time.
2. A plot that has a row is `built`, with the row's level and time. A row whose plot is not in the catalogue is skipped and logged as a warning.
3. A spot that is not buildable is `locked`. Its cost is shown and `missing` is empty.
4. Otherwise the spot is `empty`, with `missing = missing_for(cost, coins, timber)` and `can_build = not missing`.

The plan keeps the order of `spots` in the file.

## 3. The routes: `backend/server/routes/islet.py`

The header comment of this file is where the contract lives (ENGINEERING "Where contracts live"). Both routes:

- are for signed-in players only (`PlayerDep`)
- take the player id only from the verified sign-in
- answer with `Cache-Control: private, no-store`
- have no feature flag

### GET /api/islet

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
   "state": "built", "level": null, "builtAt": null, "cost": null, "missing": [], "canBuild": false, "lockedNote": null},
  {"plot": "plot_2", "plotName": "Workshop plot", "type": "workshop", "name": "Workshop", "about": "...",
   "state": "empty", "level": null, "builtAt": null, "cost": {"coins": 300, "timber": 10}, "missing": [], "canBuild": true, "lockedNote": null},
  {"plot": "plot_3", "...": "...", "state": "locked", "cost": {"coins": 300, "timber": 10}, "missing": [], "canBuild": false,
   "lockedNote": "Opens when timber starts washing up on your beach, in a later update."},
  {"plot": "plot_4", "...": "..."},
  {"plot": "islet_signal_station", "plotName": "Islet signal station", "type": "signal_station", "name": "Signal station", "about": "...",
   "state": "empty", "level": null, "builtAt": null, "cost": {"coins": 300, "timber": 10}, "missing": [], "canBuild": true, "lockedNote": null}]}
```

- The route makes three reads with the secret key, each filtered on the verified player id:
  - `wallets` for the balance. No row means `404 player_not_set_up`.
  - `islets` for the timber. No row means the starter pack (`starterTimber`).
  - `islet_buildings` with `plot,building_type,level,built_at`, `order=plot.asc` and `limit=10`.
- `builtAt` has no microseconds, as in `2026-11-16T10:00:00Z`. Drop them the way `whole_seconds` in `routes/market.py` does, with a small helper of your own.
- `missing` lists what is short, in the order `coins`, `timber`. The server decides `canBuild`; the browser only shows it.

| Case | Answer |
|---|---|
| Signed in, wallet found | `200` as above |
| No sign-in, or a bad one | `401 unauthorized` with `WWW-Authenticate: Bearer` |
| No wallet row (the account was made before the migration) | `404 player_not_set_up` (same text as `/api/me`) |
| `buildings.json` could not be read at start-up | `503 islet_unavailable`; the rest of the API works |
| The database is not set up, or not reachable | `503 database_not_configured` or `503 database_unavailable` |
| The database refused a read or answered strangely | `502 database_error` |

### POST /api/islet/build

```text
POST /api/islet/build
Authorization: Bearer <token>
{"plot": "islet_signal_station", "type": "signal_station", "actionUid": "k3j9x2m4q8w1z7a0"}

200 OK
Cache-Control: private, no-store
{"plot": "islet_signal_station", "type": "signal_station", "name": "Signal station", "level": 1,
 "coinsPaid": 300, "timberPaid": 10, "coins": 700, "timber": 10}
```

**The request model** is Pydantic with `extra="forbid"`, so a `coins`, `price` or `playerId` field is a 422.

- `plot` and `type` match `^[a-z0-9_]{2,40}$`.
- `actionUid` is 8 to 64 characters of `^[A-Za-z0-9_-]+$` (the Exchange's limits).
- The ledger ref is `islet:<actionUid>`, at most 70 characters.
- The browser makes the `actionUid` once per click and sends the same one again on a retry.

**Order of the checks** (fixed, and tested):

1. Before the route runs, FastAPI checks the sign-in (`401`), the catalogue (`503 islet_unavailable`) and the request shape (`422 validation_error`).
2. **Repeat.** If a building row of this player with the ref `islet:<actionUid>` exists, the answer is `409 already_applied`, and nothing else is asked, whatever has changed since. This is the Exchange's `trade_exists` pattern.
3. **Rules** (`building.check_build`): `404 no_such_plot`, `404 no_such_building`, `422 wrong_plot`, `409 plot_occupied` (the cabin), `409 not_buildable_yet`.
4. **Wallet rules in Python:** `validate_transaction(-coins, "building_purchase", ref)`, which answers `422 invalid_transaction`. With a checked file this cannot happen.
5. **`islet_build()`** answers one of:
   - `404 player_not_set_up`
   - `409 already_applied`, for a repeat that slipped past step 2 while the first request was still running
   - `409 plot_occupied`: "A signal station already stands on Islet signal station."
   - `409 not_enough_timber`: "The signal station needs 10 timber. You have 0."
   - `409 insufficient_funds`, raised again with the price: "The signal station costs 300 coins. You do not have enough coins."
   - done

| Status | Code | Meaning | What changed |
|---|---|---|---|
| 200 | | Built, and charged once | coins, timber, one building |
| 401 | `unauthorized` | No sign-in, or a bad one | nothing |
| 404 | `no_such_plot` | Not one of the five spots ("out of range") | nothing |
| 404 | `no_such_building` | Not a building in `buildings.json` ("unknown type") | nothing |
| 404 | `player_not_set_up` | No wallet row | nothing |
| 409 | `already_applied` | This `actionUid` was used before. Treat it as done. | nothing |
| 409 | `plot_occupied` | Something already stands on that plot (always true for the cabin) | nothing |
| 409 | `not_buildable_yet` | The windmill or the greenhouse, before the driftline exists | nothing |
| 409 | `not_enough_timber` | Not enough timber | nothing |
| 409 | `insufficient_funds` | Not enough coins | nothing |
| 422 | `wrong_plot` | That building belongs on another plot | nothing |
| 422 | `validation_error` | Wrong shape: a missing or extra field, a bad pattern, a number where text belongs | nothing |
| 502 | `database_error` | The database refused (`bad_build`, a broken check rule) or sent a refusal we do not know. This is a bug. | nothing |
| 503 | `islet_unavailable` | The data file could not be read | nothing |
| 503 | `database_unavailable` | **Outcome unknown.** Call `GET /api/islet`. If the building stands, it is done. Otherwise retry with the **same** `actionUid`. | unknown |

## 4. Server modules and wiring

Every new file has a plain-English header comment (what it does and who uses it), functions of about 20 lines, files under about 200 lines, and no em or en dashes.

| File | Its one job |
|---|---|
| `backend/server/game/__init__.py` | The package description. A3 creates this file on its branch. If A3 is on `main`, add four lines to its list. If not, create it with the same header and the four lines; the controller combines the two versions when merging. |
| `backend/server/game/building_catalogue.py` | `Cost`, `Spot`, `BuildingCatalogue`, `BuildingsFileError`, `load_buildings(path=CONTENT_FILE)` and `catalogue_or_none()`. The last one logs the error and returns None, like `market_or_none`. |
| `backend/server/game/building.py` | The pure rules of section 2. |
| `backend/server/game/islet_store.py` | Database calls only: `read_coins`, `read_timber` (None without a row), `read_buildings`, `build_exists(admin, player_id, ref)`, `build_arguments(...)`, `read_build_reply`, `run_build`, `players_with_signal_station` and `has_signal_station_built`. |
| `backend/server/game/islet_service.py` | Puts the pieces together: `REF_PREFIX = "islet:"`, `look(admin, catalogue, player_id) -> IsletPlan`, `build(admin, catalogue, player_id, plot, building_type, action_uid) -> BuildReceipt`, the mapping from each refusal to its `ApiError`, and `IsletCatalogueDep`, which answers 503 `islet_unavailable` when the catalogue is None. |
| `backend/server/routes/islet.py` | The contract header, the Pydantic models and two thin route functions. The model field names are the camelCase JSON names: `plotName`, `builtAt`, `canBuild`, `lockedNote`, `signalStationBuilt`, `playMoneyNote`, `coinsPaid`, `timberPaid`, `actionUid`, and `type`. |
| `backend/server/app.py` | A new keyword-only parameter `islet_catalogue: BuildingCatalogue | None = None`, defaulting to `catalogue_or_none()`, stored as `app.state.islet_catalogue`, plus `app.include_router(islet.router, prefix="/api")`. |
| `backend/server/routes/__init__.py`, `backend/server/__init__.py` | One line each in their file lists. |

`build_arguments` sends exactly `p_player_id, p_plot, p_building_type, p_coins, p_timber, p_starter_timber, p_ref`. `read_build_reply` accepts `{"status":"done","balance","timber","level"}` or `{"status":"refused","reason", "standing"?, "timberHeld"?}`. Anything else is a `502`, and so is a refusal reason the server does not know, as in the Exchange.

## 5. The database: `supabase/migrations/20261106070000_home_islet.sql`

Follow ENGINEERING recipe 4.2 and the house style of the Exchange file:

- a full header: what it does, who uses it, the rules the database keeps, what it needs, why it is safe to run twice, and how the file is organised
- a plain-English comment above every table, policy and function
- `comment on` for both tables, every column, both policies and the function

**Never write the words "insert into", "update", "delete from" or "truncate" next to `wallet_reasons`, not even in a comment.** `test_wallet_matches_migration.py` scans for them. The migration adds no wallet reason.

### 5.1 Tables (the tested draft; add the comments)

```sql
create table if not exists public.islets (
  player_id  uuid primary key references public.profiles (id) on delete cascade,
  timber     integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint islets_timber_not_negative
    check (timber >= 0)
);

create or replace trigger islets_touch_updated_at
  before insert or update on public.islets
  for each row execute function public.touch_updated_at();

create table if not exists public.islet_buildings (
  player_id     uuid not null references public.islets (player_id) on delete cascade,
  plot          text not null,
  building_type text not null,
  level         smallint not null,
  coins_paid    bigint not null,
  timber_paid   integer not null,
  ref           text not null,
  built_at      timestamptz not null default now(),

  primary key (player_id, plot),
  constraint islet_buildings_plot_fits_building
    check ((plot, building_type) in (
      ('plot_2', 'workshop'),
      ('plot_3', 'windmill'),
      ('plot_4', 'greenhouse'),
      ('islet_signal_station', 'signal_station')
    )),
  constraint islet_buildings_level_range
    check (level between 1 and 3),
  constraint islet_buildings_coins_paid_range
    check (coins_paid between 1 and 1000000),
  constraint islet_buildings_timber_paid_not_negative
    check (timber_paid >= 0),
  constraint islet_buildings_ref_not_blank
    check (char_length(btrim(ref)) > 0),
  constraint islet_buildings_ref_max_length
    check (char_length(ref) <= 120)
);

create unique index if not exists islet_buildings_one_row_per_ref
  on public.islet_buildings (player_id, ref);
```

- The four pairs repeat `buildings.json` (the cabin has no row). A test keeps them equal. Adding a spot later needs a new migration that replaces this check.
- `coins_paid` and `timber_paid` record what was paid. Timber has no ledger, so this row is the only record of it.
- The check allows levels 2 and 3 for Phase 2, but `islet_build()` writes only level 1.
- There is no identity column, so there is no sequence to revoke.

### 5.2 Row-level security and grants

```sql
alter table public.islets          enable row level security;
alter table public.islet_buildings enable row level security;

drop policy if exists "Players can read their own islet" on public.islets;
create policy "Players can read their own islet"
  on public.islets for select to authenticated
  using (player_id = (select auth.uid()));

drop policy if exists "Players can read their own islet buildings" on public.islet_buildings;
create policy "Players can read their own islet buildings"
  on public.islet_buildings for select to authenticated
  using (player_id = (select auth.uid()));

revoke all on table public.islets, public.islet_buildings
from public, anon, authenticated, service_role;

grant select on table public.islets, public.islet_buildings to authenticated;
grant select, insert, update on table public.islets to service_role;
grant select, insert on table public.islet_buildings to service_role;
```

### 5.3 The function

```sql
create or replace function public.islet_build(
  p_player_id      uuid,
  p_plot           text,
  p_building_type  text,
  p_coins          bigint,
  p_timber         integer,
  p_starter_timber integer,
  p_ref            text
)
returns jsonb
language plpgsql
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_timber   integer;
  v_standing text;
  v_balance  bigint;
begin
  -- Step 1: the arguments must make sense. None may be missing. A failure here is a server bug.
  if p_player_id is null
     or p_plot is null
     or p_building_type is null
     or p_coins is null or p_coins < 1
     or p_timber is null or p_timber < 0
     or p_starter_timber is null or p_starter_timber < 0
     or p_ref is null then
    raise exception 'bad_build';
  end if;

  -- Step 2: lock the player's wallet row until the end of this transaction, as market_trade()
  -- does. A second build or a trade of the same player waits here.
  perform 1 from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  -- Step 3: a repeated ref (the same click again) is answered first, with code 23505.
  if exists (
    select 1 from public.islet_buildings where player_id = p_player_id and ref = p_ref
  ) then
    raise exception 'already_applied' using errcode = '23505';
  end if;

  -- Step 4: the islet row, made with the starter pack the first time, then locked.
  insert into public.islets (player_id, timber)
  values (p_player_id, p_starter_timber)
  on conflict (player_id) do nothing;

  select timber
    into v_timber
    from public.islets
   where player_id = p_player_id
     for update;

  -- Step 5: one building per plot.
  select building_type
    into v_standing
    from public.islet_buildings
   where player_id = p_player_id and plot = p_plot;
  if found then
    return jsonb_build_object(
      'status', 'refused', 'reason', 'plot_occupied', 'standing', v_standing
    );
  end if;

  -- Step 6: enough timber.
  if v_timber < p_timber then
    return jsonb_build_object(
      'status', 'refused', 'reason', 'not_enough_timber', 'timberHeld', v_timber
    );
  end if;

  -- Step 7: the coins, through the wallet. insufficient_funds cancels everything,
  -- including a new islet row from step 4.
  v_balance := public.apply_wallet_transaction(p_player_id, -p_coins, 'building_purchase', p_ref);

  -- Step 8: take the timber and record the building.
  update public.islets
     set timber = timber - p_timber
   where player_id = p_player_id
  returning timber into v_timber;

  insert into public.islet_buildings
    (player_id, plot, building_type, level, coins_paid, timber_paid, ref)
  values
    (p_player_id, p_plot, p_building_type, 1, p_coins, p_timber, p_ref);

  return jsonb_build_object('status', 'done', 'balance', v_balance, 'timber', v_timber, 'level', 1);
end;
$$;

revoke all on function public.islet_build(uuid, text, text, bigint, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.islet_build(uuid, text, text, bigint, integer, integer, text)
  to service_role;
```

- The function is not `security definer`. It runs with the caller's rights, so a player is stopped by the grants and RLS even if someone granted execute to players by mistake.
- A refusal that the function returns writes nothing a player could see. The only possible trace is a new `islets` row holding exactly the starter pack, which is what `GET /api/islet` already shows. With today's numbers a first build is never refused at step 5 or 6, so in practice no refused call leaves a row behind.
- A wrong plot and building pair, a blank or too long ref, or a bad argument raises an error and rolls everything back. The server answers `502 database_error`.

### 5.4 `supabase/README.md`

- **Top file table:** one row for the new file: "run it after the foundation; it needs nothing from the other migrations, but apply files in time-stamp order".
- **A section "The home islet migration"**, like the Exchange's: what it creates (two tables, one function), who changes each one, the starter-pack rule and the lock order.
- **Who may do what**, new rows:

| Table | Action | Visitor (`anon`) | Signed-in player | Server (`service_role`) |
|---|---|---|---|---|
| `islets` | read | no access | own row | yes |
| `islets` | insert | no access | no access | yes (through `islet_build()`) |
| `islets` | update | no access | no access | yes (through `islet_build()`) |
| `islets` | delete | no access | no access | no access (deleted with its player, by cascade) |
| `islet_buildings` | read | no access | own rows | yes |
| `islet_buildings` | insert | no access | no access | yes (through `islet_build()`) |
| `islet_buildings` | update | no access | no access | no access (never changed in this version) |
| `islet_buildings` | delete | no access | no access | no access (deleted with its player, by cascade) |

  Add a function row for `islet_build()`: no access, no access, yes. Add the Exchange's "through" footnote: this is a team rule, not a database lock.
- **Three quick checks:** write "two more tables, two more policies and two more `authenticated` grant rows than before this migration" instead of totals, because four other migrations are landing at the same time.
- **Manual test plan, steps H1 to H15.** Use two new test users, A and B. A gets 1,000 coins with `kit_grant` and ref `kit`; B gets 100.
  - **H1** set-up.
  - **H2** A builds the station: `{"status":"done","balance":700,"timber":10,"level":1}`.
  - **H3** an "islet check" query: balance, timber, buildings, and the ledger rows with ref `islet:manual-1`.
  - **H4** the same ref again: error `already_applied` (23505), and the islet check of H3 is unchanged.
  - **H5** a new ref on the same plot: refused `plot_occupied`, standing `signal_station`.
  - **H6** the workshop: done, with 400 coins and 0 timber.
  - **H7** the greenhouse: refused `not_enough_timber`, `timberHeld` 0.
  - **H8** B builds the station with 100 coins: error `insufficient_funds`, and B has no `islets` row.
  - **H9** B sends the pair `plot_2` and `windmill`: check violation `islet_buildings_plot_fits_building`, nothing changed.
  - **H10** an unknown player id: refused `player_not_set_up`.
  - **H11** a price of 0: `bad_build`.
  - **H12** as player A: one islet row and two buildings. As player B: none of A's. A cannot update `islets`, add to `islet_buildings` or run `islet_build()` (`permission denied`). `anon` gets `permission denied` on both tables.
  - **H13** as `service_role`: `update public.islet_buildings ...` and `delete from public.islets ...` are `permission denied`.
  - **H14** run the migration again: no error, and A is unchanged.
  - **H15** delete A and B: their rows are gone.
  - **Optional race step** with two SQL editor tabs. In the first tab run `begin; select public.islet_build(...); select pg_sleep(10); commit;`. The second tab waits, then answers `plot_occupied`.

### 5.5 Applying it

Only with Nils' OK. Apply it after the foundation, in time-stamp order with the other new files (020000, 030000, 040000, 050000, then 070000), then run H1 to H15. The API code may reach production before the migration, because the panel then runs in unavailable mode and sends no request. What must wait for the migration is passing the live transport (`transport: api` in `frontend/src/game.js`): until it is applied, `GET /api/islet` answers `502 database_error`.

### 5.6 What I verified for this spec

I ran a private scratch Postgres 16.2 (pgserver, Unix socket only, removed afterwards), with the stand-ins for Supabase's roles and `auth` from the M1 backbone spec.

- `pglast` parses the three files.
- The foundation, the Exchange and the draft apply twice without an error, and a third run changes nothing.
- **Behaviour checks that hold:**
  - a build writes one ledger row of -300 with the ref
  - a repeat gives 23505 and charges nothing
  - an occupied plot is refused
  - a second building can use the last timber
  - no timber left is refused
  - a wrong pair rolls everything back
  - not enough coins leaves no islet row
  - spending the whole balance works
  - a player with no wallet is refused
  - a price of 0 is refused
  - a blank ref is refused
  - RLS reads only the player's own rows
  - player writes and `execute` are refused
  - `anon` is refused
  - the server cannot edit a building
  - deleting a player cascades
- **Races.** Each uses two connections, with the first holding its transaction open:
  - same plot, two clicks: one build and one charge; the second answers `plot_occupied`
  - coins for one building only: the second answers `insufficient_funds`, and timber is taken once
  - the same click twice: the second answers `already_applied`
  - timber for one building only: the second answers `not_enough_timber`
  - a trade and then a build: no deadlock, no overspending
  - a build and then a trade: no deadlock, no overspending

Result: 30 passed, 0 failed. I did not run it on Postgres 17; nothing in the SQL needs 17.

The draft and its check script were run from a scratch folder and are not committed.

## 6. The finale: how S3 and L3 read "this player's signal station is built"

**On the server (the authority),** `backend/server/game/islet_store.py` provides:

```python
async def players_with_signal_station(admin: SupabaseAdmin, player_ids: Sequence[str]) -> frozenset[str]:
    """The players among player_ids whose islet has a signal station. One read, at most 4 ids."""

async def has_signal_station_built(admin: SupabaseAdmin, player_id: str) -> bool:
```

- **The read.** It is one read: `select=player_id`, `building_type=eq.signal_station`, `player_id=in.(<ids>)`, `limit=4`. It takes at most 4 ids (one crew). Each id must parse with `uuid.UUID`, otherwise it raises `ValueError`. That would be a bug, because the ids never come from player input.
- **It can only become true.** A station is never removed or downgraded (no update or delete rights), so the answer can only change from false to true. L3 may check in Python before its own atomic SQL call without any race.
- **In SQL.** If L3 prefers to check inside its own function, the fact is `exists (select 1 from public.islet_buildings where player_id = <player> and building_type = 'signal_station')`. The table and column names are part of this contract (INTERFACES section 4).
- **The rule we recommend to S3 and L3** (CASE-FILE 10.2 and the case fake):
  - The light `islet_signal_station` is ready for a crew when at least one **player** seated in the crew has a station ("A crew counts one home station").
  - NPC partners never man it (`partners_may_man` is false).
  - Any player of the crew may take that post. If S3 decides that only a player who owns a station may take it, the same helper answers that too.
- **The case never charges for the station.** The finale screen's "Build signal" button is the case intent `buildLight('islet_signal_station')`. The real case adapter maps it to `POST /api/islet/build {plot: "islet_signal_station", type: "signal_station", actionUid}` and then refreshes the case view. The 300 coins and 10 timber in the case fake are a stand-in and must not exist in the real adapter. `buildLight('ruin_light')` is not part of L2 (the lens is a "should" item, after D3).
- **S3's solvability tests** read the station price and the starter pack from `load_buildings()` instead of copying 300, 10 and 20.
- **Tests that S3 and L3 add:**
  - with no station in the crew, taking the `islet_signal_station` post is refused and nothing changes
  - after one player builds a station, the light is ready for the whole crew
  - a partner cannot man it
- **In the browser,** L3's board or finale view carries `lights[].ready`, which the server computes with the helper. `signalStationBuilt` in `GET /api/islet` is for the islet panel only.
- **Spoilers.** L2 holds no case text except the station's "about" line, which names no culprit.

## 7. The build panel and its adapter: `frontend/src/screens/islet/`

The rules for this folder:

- plain JavaScript ES modules, each file under 150 lines, with a one-line header comment
- text only through `textContent` (the kit's `node()`)
- UI from `frontend/src/ui/kit`: `createModal`, `createButton`, `formatCoins`
- **screens never call fetch and never decide rules.** The panel sends intents to the adapter, and the adapter only maps them to the two routes and maps the answers back.

| File | Its one job |
|---|---|
| `README.md` | What the folder is, the view and the intents, the HTTP mapping, how to try it locally, and the follow-ups. |
| `host.js` | `attachIsletPanel({container, on, emit, resetInput, focus, transport = null, canAsk = () => true, loadPanel, search = location.search, dev = import.meta.env.DEV})`. The last three can be injected for tests. `canAsk` is for live mode: it says whether the player is signed in, and the refresh on arrival waits until it does. It picks the transport and listens to `plot_clicked` (open at that plot), `travel` (close) and `arrived` with `place: 'home_islet'` (refresh). It loads the panel lazily on the first open, emits `islet_changed` after every good answer, and returns one `stop()` that unsubscribes and disposes everything. |
| `adapter.js` | `createIsletAdapter({transport, mode, makeUid})`: the view, the two intents, and one `actionUid` per click, kept for a safe retry. |
| `view.js` | Pure functions: the server answer becomes view spots, a receipt or an error becomes a notice, and each spot gets its labels for the panel. |
| `action-uid.js` | `makeActionUid(randomBytes)`: 16 characters of `[a-z0-9]` from `crypto.getRandomValues`. The random source can be injected for tests. |
| `fake-transport.js` | For local rehearsal only: an in-memory stand-in for the two routes, with the server's answers, codes and check order. It has `dev` helpers: `setCoins`, `setTimber`, `failNext('timeout' or 'network' or 'server')` and `reset`. Nothing is saved. |
| `fake-catalogue.js` | The fake's copy of `buildings.json`. A test keeps the two equal, because the frontend build on Vercel cannot read `backend/`. |
| `panel.js` | DOM only: the kit modal with five spot cards and a status line. |
| `islet.css` | Styles in the kit's colours. |

### 7.1 Choosing the transport (in `host.js`)

- **Dev build with `?islet=local`:** the fake transport, mode `local`. This mirrors the case bridge's `?case=local`.
- **A `transport` was passed:** mode `live`. The transport is A2's `api` from `frontend/src/online/api.js`. Its `get(path)` and `post(path, body)` return `{ok:true, status, data}` or `{ok:false, status, code, message, retryAfterSeconds?}`.
- **Otherwise:** mode `unavailable`, which sends no requests at all. The panel says "Your islet will be saved to your account once sign-in is connected." A2 is not on `main` yet, so production starts in this mode.

### 7.2 The view and the intents

```js
// adapter.read() returns a copy of:
{
  schema: 1,
  mode: 'live' | 'local' | 'unavailable',
  status: 'loading' | 'ready' | 'error' | 'unavailable',
  busyPlot: null,                  // the plot whose build is running
  coins: 1000, timber: 20,         // null until the first answer
  playMoneyNote: 'Play money. No cash value. It cannot be bought or cashed out.',
  signalStationBuilt: false,
  spots: [{plot, plotName, type, name, about, state, level, builtAt, cost, missing, canBuild, lockedNote,
           retry: false}],          // retry: the last build of this plot has an unknown outcome
  notice: null,                    // or {tone: 'success' | 'error' | 'info', code, message}
  revision: 0,
}
// intents:
adapter.refresh()      // GET /api/islet
adapter.build(plot)    // POST /api/islet/build
adapter.subscribe(listener)  // listener({type: 'islet_updated', view}); returns stop()
adapter.dispose()
```

### 7.3 The HTTP mapping

**`refresh()`** sends `GET /api/islet`.
- On a good answer, the spots, coins and timber are copied from the answer as they are.
- On any other answer, the adapter keeps the last good view and shows the transport's message: "Please sign in again." for `401`, or the message for `404 player_not_set_up`, a `503` or a network failure.

**`build(plot)`** sends `POST /api/islet/build` with `{plot, type: spot.type, actionUid}`. `type` is copied from the server's spot, never chosen by the browser.
- **Good answer:** show "Signal station built. You have 700 coins and 10 timber left.", drop the click id, then call `refresh()`.
- **`409 already_applied`:** treat it as done, drop the click id and refresh.
- **Any other 4xx:** show the server's message, drop the click id and refresh.
- **No answer (status 0), or any 5xx:**
  1. Keep the click id and mark the spot `retry`.
  2. Show "We could not confirm the build. Checking your islet now." and refresh.
  3. If the refreshed spot is built, drop the click id and show "Built."

Two more rules:

- **One request at a time.** While `busyPlot` is set, `build()` answers `{accepted: false, code: 'busy'}` and sends nothing. The panel also disables every build button while busy.
- **The retry rule in one sentence.** The adapter keeps the click id only when the answer does not say what happened. A retry then sends the same id again, and the server answers `already_applied` if the first request went through.

### 7.4 The panel

- **Header:** the title "Your islet", a line with coins and timber, the `playMoneyNote`, and a status line with `role="status"`.
- **Five cards,** in file order. Each card shows:
  - the building name and the plot name
  - a badge: "Standing", "Empty plot" or "Coming later"
  - the about line
  - the cost ("300 coins and 10 timber") and what is missing ("You need 120 more coins")
  - the locked note, or the date it was built
  - one button: "Build the workshop for 300 coins and 10 timber", or "Try again: build the workshop (it will not charge twice)" when `retry` is set. Each button names its building, so a screen reader's list of buttons never holds two with the same name (WCAG 2.4.6). The button is disabled unless `canBuild` (or `retry`) is true and nothing is busy.
- **`open(plot)`:** reset the game input, open the modal, refresh, and focus the card of that plot (its button if enabled, otherwise its heading).
- **Keyboard:** the panel's root stops `keydown` propagation for every key except Escape and Tab, so the explorer does not walk behind the modal. Escape closes the kit modal, and focus returns to the canvas.
- **Travel:** the panel closes on `travel`. This keeps the world browser check passing (it clicks `plot_1`, then travels by script).

### 7.5 The hook: the one change outside the folder

In `frontend/src/game.js`, add one import, change one line and add three `stopPlots.active` checks:

```js
import {attachIsletPanel} from './screens/islet/host.js';
// line 67 becomes:
const stopPlots = attachIsletPanel({container, on, emit, resetInput: input.reset, focus: () => graphics.renderer.domElement.focus()});
```

`dispose()` and the start-up failure path already call `stopPlots()`.

`stopPlots` also carries an `active` flag, true while the panel is open. Three checks use it, and `tests/islet-boundary.test.js` pins each one:

- `hasOverlay`: the shell opens Pause on Escape unless an overlay is open, so without the flag Escape would open Pause over the panel.
- `deviceActions.isPlaying`: with the panel open the gamepad is not "playing". The stick no longer walks the explorer behind the panel, A no longer presses E (which at the signal station would open the case finale over the panel), and Y and Start no longer open the chart or Pause. The gamepad uses its dialog branch instead: the D-pad moves focus, A presses the focused button, B or Start closes the panel and focus returns to the canvas.
- The gate of `controller.update`: a stick or touch push left over from before the panel opened moves nothing.

After A2 merges, the controller adds `import {api} from './online/api.js';` and passes `transport: api` in that call, together with `canAsk: () => session.signedIn` (or A2's equivalent). The arrival refresh is silent, and A2's `api` answers a 401 by making the session forget the token, so without `canAsk` a player whose token has expired would get the sign-in prompt just by sailing home. Opening the panel always asks, because the player asked for it. The test in `tests/islet-boundary.test.js` that pins the hook line changes with the call.

### 7.6 The event `islet_changed` (draft, for the world drawing)

The event is `{type: 'islet_changed', built: ['plot_1', 'islet_signal_station'], signalStationBuilt: true}`.

- `built` lists every plot whose state is `built`, the cabin included.
- `host.js` emits it after every good answer in `live` or `local` mode, never in `unavailable` mode.
- Its home is INTERFACES section 3 (reserved events) until the world listener lands and documents it in `frontend/GRAPHICS.md`.

### 7.7 How to try it locally

1. Run `cd frontend && npm run dev`.
2. Open `http://127.0.0.1:5173/?islet=local` and start a game.
3. Sail to the home islet and click a plot. Or run `__island.emit({type: 'plot_clicked', plot: 'plot_2'})` in the console.

## 8. Tests to write first

### 8.1 Backend (pytest, fakes only, no network)

`backend/server/tests/test_building_catalogue.py`

- `test_the_real_buildings_file_loads_with_five_spots_in_registry_order`
- `test_level_one_costs_300_coins_and_10_timber_and_the_starter_pack_is_20`
- `test_the_cabin_stands_from_the_start_and_is_not_buildable`
- `test_exactly_one_signal_station_stands_on_islet_signal_station`
- `test_two_spots_with_the_same_plot_or_type_are_refused`
- `test_a_price_of_zero_or_above_the_wallet_limit_is_refused`
- `test_negative_or_fractional_or_boolean_timber_is_refused`
- `test_a_locked_spot_without_a_locked_note_is_refused`
- `test_an_id_with_capitals_or_spaces_is_refused`
- `test_a_broken_file_names_the_entry_and_the_field`
- `test_catalogue_or_none_returns_none_for_a_broken_file`

`backend/server/tests/test_building.py`

- `test_an_unknown_plot_is_404_no_such_plot`
- `test_an_unknown_type_is_404_no_such_building`
- `test_a_building_on_another_plot_is_422_wrong_plot`
- `test_the_cabin_plot_is_409_plot_occupied`
- `test_the_windmill_and_the_greenhouse_are_409_not_buildable_yet`
- `test_the_station_and_the_workshop_cost_the_level_one_price`
- `test_refusals_come_in_the_documented_order`
- `test_a_new_islet_shows_the_cabin_standing_two_spots_empty_and_two_locked`
- `test_a_new_player_with_1000_coins_can_build_the_station_and_the_workshop`
- `test_missing_names_coins_timber_or_both`
- `test_exactly_300_coins_and_10_timber_is_enough`
- `test_a_built_plot_shows_its_level_and_time_and_cannot_be_built`
- `test_a_row_for_an_unknown_plot_is_skipped`
- `test_has_signal_station_is_true_only_with_a_station`
- `test_prices_come_from_the_catalogue_not_from_the_code` (a catalogue with 7 coins and 3 timber gives 7 and 3)

`backend/server/tests/test_islet_store.py` (fake transport, `make_admin`)

- `test_every_read_filters_on_the_verified_player_and_has_a_limit`
- `test_read_timber_is_none_without_an_islet_row`
- `test_build_exists_looks_for_this_player_and_this_ref`
- `test_run_build_sends_exactly_the_seven_arguments`
- `test_a_done_reply_and_each_refused_reply_are_understood`
- `test_an_unreadable_reply_is_a_502`
- `test_players_with_signal_station_asks_one_read_for_at_most_four_ids`
- `test_players_with_signal_station_refuses_a_non_uuid_and_more_than_four_ids`
- `test_players_with_signal_station_returns_only_players_who_built_one`

`backend/server/tests/test_islet_routes.py` (a `FakeIsletDatabase` like the Exchange's `FakeDatabase`, a fake verifier, and the real catalogue unless a test passes its own)

- **GET:**
  - `test_the_islet_needs_a_sign_in`
  - `test_a_new_player_sees_the_starter_pack_the_cabin_and_their_coins`
  - `test_the_answer_is_never_cached`
  - `test_the_answer_says_whether_the_signal_station_stands`
  - `test_built_at_has_whole_seconds_in_utc`
  - `test_a_player_without_a_wallet_is_404_player_not_set_up`
  - `test_an_unconfigured_database_is_503`
  - `test_a_database_that_fails_a_read_is_502`
  - `test_a_broken_buildings_file_makes_the_islet_503_and_health_still_works`
  - `test_the_answer_holds_no_secret_and_no_other_player`
- **POST, normal path:**
  - `test_building_the_station_charges_300_coins_and_10_timber_once`
  - `test_the_server_sends_the_verified_player_and_the_catalogue_prices`
  - `test_spending_exactly_the_whole_balance_works`
- **POST, input:**
  - `test_an_extra_field_such_as_coins_or_player_id_is_422`
  - `test_bad_shapes_are_422` (parametrized: a missing field, capitals, too long, a number where text belongs, a short `actionUid`)
  - `test_an_unknown_plot_is_404_and_the_database_is_not_asked_to_build`
  - `test_an_unknown_type_is_404_no_such_building`
  - `test_a_type_on_another_plot_is_422_wrong_plot`
  - `test_the_cabin_plot_is_409_plot_occupied`
  - `test_the_windmill_is_409_not_buildable_yet`
- **POST, database refusals:**
  - `test_an_occupied_plot_is_409_and_names_what_stands_there`
  - `test_not_enough_timber_is_409_with_the_timber_held`
  - `test_not_enough_coins_is_409_insufficient_funds_with_the_price`
  - `test_a_player_without_a_wallet_is_404_player_not_set_up`
  - `test_a_refusal_we_do_not_know_is_a_502_and_not_a_success`
- **POST, repeats:**
  - `test_a_repeated_action_uid_is_409_already_applied_and_nothing_else_is_asked`
  - `test_a_repeat_is_already_applied_even_when_the_plot_is_occupied_now`
  - `test_a_repeat_that_raced_past_the_first_check_is_409_already_applied` (the function answers 23505)
  - `test_the_same_click_twice_uses_the_same_ref`
  - `test_two_clicks_use_two_refs`
- **POST, money safety:**
  - `test_the_wallet_rules_check_the_charge_before_the_database_is_asked`
  - `test_a_database_that_times_out_is_503_and_the_outcome_is_unknown`

`backend/server/tests/test_islet_matches_migration.py` (reads the SQL as text, like `test_wallet_matches_migration.py`)

- `test_islet_build_takes_exactly_the_arguments_the_server_sends`
- `test_islet_build_has_no_default_for_any_argument`
- `test_the_migration_sorts_after_the_foundation`
- `test_the_migration_adds_no_wallet_reason_and_building_purchase_is_a_spend_reason`
- `test_the_allowed_plot_and_building_pairs_are_the_buildable_spots_of_buildings_json`
- `test_the_highest_price_in_the_database_is_the_wallet_limit`
- `test_a_building_ref_can_be_as_long_as_a_wallet_ref`
- `test_the_action_uid_limit_fits_into_the_ref_with_its_prefix`
- `test_both_tables_have_row_level_security_and_only_read_policies`
- `test_the_migration_takes_every_right_away_before_it_grants`
- `test_islet_build_is_for_the_server_only_and_not_security_definer`
- `test_islet_build_locks_the_wallet_before_it_charges_through_apply_wallet_transaction`
- `test_one_building_per_plot_is_the_primary_key_and_a_ref_is_used_once`
- `test_the_starter_pack_is_handed_out_once_and_never_again` (the starter pack is inserted with `on conflict (player_id) do nothing`)
- `test_islet_build_runs_its_checks_in_the_documented_order` (wallet lock, repeated ref, islet row, occupied plot, timber, charge; the exact text of each step is pinned, so `<=` instead of `<` fails)

### 8.2 Money races and repeats on a real Postgres

pytest has no database and refuses the network, so the races are proved on the scratch Postgres (section 5.6) and written into the manual test plan. The backend builder reruns the six race checks against the final file and reports the PASS lines.

### 8.3 Frontend (Vitest, pure functions)

These are new files in `frontend/tests/`, because Vitest collects only that folder.

- **`islet-action-uid.test.js`:** 16 characters of `[a-z0-9]`, within the server's pattern and length, using the injected random source.
- **`islet-view.test.js`:**
  - badges, cost and missing labels, button labels and disabled flags for `built`, `empty`, `locked` and `retry`
  - every build button and every retry button names its building, so no two buttons share an accessible name
  - the success notice
  - no rule is computed in the browser: a spot with `canBuild: false` is never enabled
- **`islet-fake.test.js`:**
  - the fake answers every refusal of section 3 with the same status, code and order
  - the starter pack appears with the first build
  - one building per plot
  - a repeat answers `already_applied`
  - `failNext('timeout')` applies the build and loses the answer
- **`islet-adapter.test.js`:**
  - `refresh()` calls `GET /api/islet` once and copies the answer
  - `build()` posts `{plot, type, actionUid}`, with `type` taken from the server's spot
  - two builds started without waiting send one request
  - after a timeout the id is kept, the retry sends the **same** id, the fake answers `already_applied`, and the spot ends `built`
  - after a definitive refusal, the next click makes a new id
  - a `401` shows "Please sign in again."
  - unavailable mode never calls the transport
  - `dispose()` stops the listeners
- **`islet-host.test.js`** (with an injected `loadPanel` and a fake event bus):
  - `plot_clicked` loads the panel once and opens it at that plot
  - `travel` closes it
  - `arrived` at `home_islet` refreshes, but in live mode only when `canAsk()` says the player is signed in (the local fake and a click on a plot ignore it)
  - `islet_changed` is emitted after a good answer and never in unavailable mode
  - the transport choice: dev with `?islet=local`, a given transport, or none
  - `stop()` unsubscribes and disposes
- **`islet-boundary.test.js`:** the rules of the folder, and the four lines of `game.js` (the hook, and `stopPlots.active` in `hasOverlay`, in `isPlaying` and in the gate of `controller.update`).
- **`islet-catalogue.test.js`:**
  - the fake's copy deep-equals `../backend/content/buildings.json`
  - every spot is a `home_islet` zone in the registry, and every `home_islet` zone except `home_driftline` has a spot

### 8.4 Browser checks

- **Manual, with `?islet=local`:**
  - open the panel from each plot
  - build the station (700 coins, 10 timber)
  - build it again (`plot_occupied`)
  - the windmill shows "Coming later"
  - Escape closes the panel and focus returns
  - the explorer does not move while the panel is open
  - reduced motion and the colour-blind setting look right

  Attach a screenshot.
- **`cd frontend && node scripts/check-islet.js`**, if Chrome is installed. It opens the panel in a real browser with `?islet=local` and checks what the unit tests cannot: E at a plot and a click on a plot open the panel, the explorer does not walk behind it (keyboard and gamepad), Escape closes it without opening Pause and focus returns to the canvas, locked and unaffordable buttons are off, a gamepad can build and close, and building the station leaves 700 coins and 10 timber. The controller adds `"test:islet": "node scripts/check-islet.js"` to `package.json` once Codex's change to that file has merged.
- **`cd frontend && npm run test:world`**, if Chrome is installed. It clicks `plot_1`, so it now opens the panel. If Chrome is missing, report that it was not run. A throwaway Playwright script in the scratchpad may take the screenshot; do not commit it.

## 9. Docs and contracts to update (backend builder)

- **`docs/INTERFACES.md`:**
  - **Section 1, status table:** add 404 `no_such_plot` and `no_such_building`; 409 `plot_occupied`, `not_buildable_yet` and `not_enough_timber`; 422 `wrong_plot`; 503 `islet_unavailable`.
  - **Section 2:** a subsection "Your home islet (package L2)" with both routes, the examples and the error table.
  - **Section 3:** mark `plot_clicked` as "built (G2), opens the islet panel (L2)", and add a draft row `islet_changed` (L2).
  - **Section 4:** the two tables and `islet_build()`.
  - **Section 5:** "`building_purchase` refs are `islet:<actionUid>`".
  - **Section 9:** mark the L2 row as built, and add `islet_buildings` to its reserved table names.
- **`supabase/README.md`:** everything in section 5.4.
- **`backend/content/README.md`:** the "buildings.json" section.
- **`docs/DECISIONS.md`:** "D021 (or the next free number) · Home islet rules · 2026-11-05", status proposed. It holds:
  - the decision: sections 1 to 6 of this spec in one paragraph
  - why
  - the alternatives from the decision table: fixed refs, the timber reserve rule, all buildings as JSON in one row, the starter pack at the kit grant
  - "Agreed by: pending Nils"
- **`.env.example`:** no change; L2 adds no setting.
- **Not ours:** `ROADMAP.md` still says "3 plots", and `docs/STATUS.md` needs updating. The controller changes both.

## 10. The 23 Nov minimum, and the rest of L2

### 10.1 Minimum (merged by the M2 freeze, Wed 18 Nov 18:00; ships on Mon 23 Nov)

1. **Backend:** `buildings.json`, the loader, `building.py`, the store, the service, the two routes, the migration, the docs and all tests. **Owner: the backend builder, now.**
2. **Panel:** the folder of section 7, the hook and the tests. **Owner: the panel builder, now.**
3. **Live transport** once A2 is on `main` (one line). **Owner: the controller, at the A2 merge.**
4. **Migration** applied to Supabase, and H1 to H15 run. **Owner: the controller, with Nils' OK.**
5. **Finale reads** (section 6) inside S3 and L3, and the `buildLight` mapping in the real case adapter. **Owner: the S3 and L3 builders, using this contract.**
6. **World drawing:** the islet shows a building only when it stands. **Owner: the G lane agent (Codex), after its current branch; the controller dispatches it.**
   - `home.js` listens to `islet_changed`. Until the first event it shows the cabin and four empty plots.
   - It hides the station's glow and beam until `signalStationBuilt`.
   - Colliders may stay, so the plot reads as fenced.
   - About 20 lines in `frontend/src/world/places/home.js` and `layouts.js`, plus a place test and an updated `frontend/GRAPHICS.md`.
   - Without this step, the world keeps showing every building as scenery while the panel shows the truth.

**Done when:**

- [ ] `cd backend && uv run pytest -q`: all pass (report the count). `uv run ruff check .`: "All checks passed!". `uv run ruff format --check` on every changed Python file.
- [ ] `cd backend && uv run --with pglast python -c "import pathlib, pglast; files = sorted(pathlib.Path('../supabase/migrations').glob('*.sql')); [pglast.parse_sql(f.read_text()) for f in files]; print('SQL parses:', len(files), 'file(s)')"`.
- [ ] Scratch Postgres: the foundation, the Exchange and the new migration applied twice; the 30 checks of section 5.6 pass, the six races included; the server stopped and its folder removed.
- [ ] `cd frontend && npm install && npm test && npm run build`: all pass, and the spoiler guard line prints.
- [ ] The manual browser check of section 8.4, with a screenshot. `node scripts/check-islet.js` and `npm run test:world` pass, or are reported as not run.
- [ ] After A2 and the migration, on a preview: build in one browser, then open the panel in a second browser. It shows the same islet (the roadmap's acceptance check "the islet looks the same after a reload in another browser").
- [ ] No secrets, no `.env`, and nothing outside each builder's ownership in the diff.
- [ ] A different human teammate has reviewed and approved.

### 10.2 The rest of L2

Our agents continue in this order. Only the materials depend on another loop.

1. **World drawing,** if it missed the freeze.
2. **Windmill and greenhouse at level 1:** set `buildable` to true in `buildings.json` once timber has a second source (the driftline, OPEN-WORLD 5.3). No code change.
3. **Upgrades to levels 2 and 3.** Level 2 costs 900 coins, 20 timber and 5 rope; level 3 costs 2,000 coins, 10 brass and 5 glass.
   - New route `POST /api/islet/upgrade {plot, toLevel, actionUid}`. `toLevel` must be the current level plus one, otherwise `409 level_changed`, so a double click never buys two levels.
   - A new migration adds `rope`, `glass` and `brass` columns to `islets` and an `islet_upgrade()` function in the same pattern: wallet lock first, ref `islet:<actionUid>`, a history table for upgrades, and an `update` grant on `islet_buildings` from then on.
   - New refusals: `not_built`, `max_level`, `level_changed`, `not_enough_rope`, `not_enough_glass`, `not_enough_brass`.
4. **Windmill oil:** worked out on request from a timestamp (1 oil every 6 hours, storing up to 4, or 6 at level 2; OPEN-WORLD 5.1), collected and spent with an `actionUid`. No timers.
5. **Decor:** 100 to 5,000 coins, reason `building_purchase`.
6. **Later:** visiting a friend's islet (needs A4 presence).

## 11. Open points

| # | Point | Recommendation | Who decides |
|---|---|---|---|
| 1 | Approve the five spots, the cabin rule, the two buildable buildings for 23 Nov, and the starter pack at the first build. | Yes, as written. | Nils |
| 2 | OPEN-WORLD 6.1 says a player without a kit "sees no money panels". The islet panel instead shows 0 coins and "You need 300 more coins". | Keep it simple for 23 Nov. If wanted, `GET /api/islet` can read A3's `entry_profiles` and hide the build buttons until the kit arrives. | Team |
| 3 | Who may take the home-station post: any player of the crew, or only a player who owns a station? | Any player (CASE-FILE: "a crew counts one home station"). | S3 and L3 builders, Nils |
| 4 | The decision number. | D021 unless it is taken; the controller renumbers. | Controller |

## 12. Process notes for the controller

- **The panel's tests cannot live in its own folder.** Vitest collects only `frontend/tests/**/*.test.js` (`frontend/vite.config.js`), so the panel builder's tests cannot live in `frontend/src/screens/islet/`. Allow new files named `frontend/tests/islet-*.test.js`.
- **No DOM test environment** in the frontend. The panel's DOM is checked in a real browser. `npm run test:world` now opens the panel when it clicks `plot_1`; the host closes it on `travel`.
- **Merge conflicts to expect:**
  - `backend/server/game/__init__.py`: both A3 and L2 create it
  - `backend/server/app.py`, `routes/__init__.py`, `server/__init__.py`: also changed by A2/A3, A6 and A4
  - `docs/INTERFACES.md`, `docs/DECISIONS.md`, `supabase/README.md`: also changed by A2/A3 and A6
  - `backend/content/README.md`: also changed by A2/A3
  - `frontend/src/game.js`: the hook (line 67) sits next to Codex's case bridge line, and `hasOverlay`, `isPlaying` and the gate of `controller.update` each gained `stopPlots.active`. Each conflict is one line
  - `frontend/scripts/intro-browser-fixture.js`: one line, also in Codex's area
- **Edits outside the agreed ownership. Each is needed. The controller keeps them and names them in the PR, or reverts them:**
  - `frontend/scripts/intro-browser-fixture.js`: `dismissIntro` also closes `.islet-modal`. Without it `check-world` fails at `home_islet/plot_2`, because E at a plot now opens the panel.
  - `frontend/src/game.js`: `stopPlots.active` in `hasOverlay` (Escape would open Pause over the panel), in `isPlaying` (the gamepad would walk the explorer behind the panel and could not use it) and in the gate of `controller.update`.
  - `frontend/scripts/check-islet.js` and `frontend/scripts/gamepad-browser-fixture.js`: a new real-browser check of the panel, and the fake gamepad it uses.
  - `docs/ENGINEERING.md`: the `backend/server/` row now lists `game/` and the islet route.
  - `specs/L2-home-islet.md`: this file.
- **Decision numbers already collide:** the A4 spec claims D018, which A2/A3 also use (D018, D019); A6 uses D020.
- **Items that need an owner outside this run:**
  - the world drawing (section 10.1, item 6), which touches G lane files
  - ROADMAP's "3 plots" line
  - the `buildLight` mapping in the case adapter (Codex's files)
- **The scratch Postgres recipe in `specs/M1-backbone.md` section 7 worked as written** (pgserver, Postgres 16.2, cached by uv).
- **Skills:** none were loaded in this step, so there is nothing to log about a skill.
