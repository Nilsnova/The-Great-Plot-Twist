# Test map

> **What this file is:** per area, which tests cover it, the exact command, how many there are and
> what they do **not** cover (task E1 in [FINAL-ROADMAP.md](FINAL-ROADMAP.md)). It backs question Q2
> of the [walkthrough](WALKTHROUGH.md#q2-what-do-the-tests-cover-and-what-do-they-not-cover).
>
> **Counts** were taken on Wed 11 Nov 2026 at `b0b6fd3` with `ls` and `grep -c`, not by running the
> suites; the island, pirate and tower-defense rows and the totals were refreshed at `e9cbf5d` (evening): a "test" is one `def test_` (Python) or one `it(`/`test(` line (Vitest). Parametrized
> cases count once, so the number of cases that run is higher.

## How to read it

- Every command starts in the repository root. `cd backend` or `cd frontend` comes first, as in [ENGINEERING.md, section 3](ENGINEERING.md#3-commands).
- **No test uses the network.** Outside services, the sign-in check, the database and the clock are fakes ([ENGINEERING.md, section 5](ENGINEERING.md), rule 3).
- **No CI.** The only GitHub Actions workflow is the keep-alive ([.github/workflows/keepalive.yml](../.github/workflows/keepalive.yml)). Each pull request pastes its own results ([CONTRIBUTING.md](../CONTRIBUTING.md)).

## 1. Backend unit tests (pytest)

Command for all of them: `cd backend && uv run pytest` (paths `server/tests` and `plot_twist/tests`, set in [backend/pyproject.toml](../backend/pyproject.toml)). One file: `cd backend && uv run pytest -q server/tests/test_wave_routes.py`.

Size: 188 test files under [backend/server/tests/](../backend/server/tests/) (159 at the top, 29 in subfolders, the opt-in SQL files included) and 5 in [backend/plot_twist/tests/](../backend/plot_twist/tests/); about 4,060 test functions in all.

| Area | Files (examples) | Tests | What it covers | Does not cover |
|---|---|---|---|---|
| Islands and waves | `test_island_routes.py`, `test_island_rules.py`, `test_wave_routes.py` | 90 | Prices from `islands.json`, wrong kind or spot, repeats, `feature_off`, budgets, loot caps (boss × 2, house levels), timing refusals, `shipsSunk` bounds | The real SQL (see section 2); whether `survived` is true |
| Tower defense v2 | `test_tower_defense_routes.py` | 35 | Upgrades and `max_level`, `locked` with its wave, crew and captain, co-op builds with `code`, Pirate Point builds, the friend invite (admitted guest, `no_such_island`, budget, `demo_closed`) | Real anonymous sign-in; the browser's simulation |
| Wallet and accounts | `test_wallet.py`, `test_wallet_matches_migration.py`, `test_me.py`, `test_delete_me.py`, `test_saves.py` | 352 | Reasons and directions match the migrations, zero, negative and repeated amounts, delete my data | A real Supabase project |
| Sign-in, guests, hosts | `test_auth*.py`, `test_demo_gate.py`, `test_demo_join.py`, `test_hosts.py` | 125 | Bad and missing tokens, the guest gate, class-code join and its budget, host-only routes | Real GitHub OAuth; the email code with a real inbox |
| Keeper's Lock | `test_lock_routes.py`, `test_lock_rules.py` | 39 | Sky answers, close-enough answers, cache, riddle fallback | Real Vercel geo headers |
| Market (Exchange) | `test_market_*.py` (17 files) | 619 | Binance and Finnhub parsing, stale and closed states, no trade on stale prices, replay | Binance or Finnhub over hours; Finnhub's live key (rejected on 10 Nov, [OPEN-TODOS.md](OPEN-TODOS.md) 4c) |
| Predictions (backend only) | `test_prediction_*.py` (11 files) | 512 | Manifold parsing, recorded fallbacks, stake rules, 15-minute staleness, pools; the game no longer calls these routes (removed from the frontend on 11 Nov at the owner's request, D035) | Real Manifold answers over days |
| Sports | `test_sports_*.py` (7 files) | 51 | football-data.org parsing, the 90-minute result rule (D033), unavailable answers, stakes | Real matches; the international break |
| Weather | `test_weather_*.py`, `test_fog_nights.py` | 260 | Open-Meteo parsing, cache, stale, recorded fallback, weather states | Open-Meteo outages over hours |
| Duels | `test_duels_*.py` (7 files) | 309 | Signals, rounds, secrecy of sealed moves, refusals | Two real phones in one duel |
| App, settings, flags, errors | `test_app.py`, `test_settings.py`, `test_flags.py`, `test_request_policy.py`, `test_adapters_*.py`, `test_keepalive.py` | 185 | Error shape, no-store default, unknown flags stop start-up, adapter pattern | Vercel's real environment variables |
| Abuse and correctness | [abuse/](../backend/server/tests/abuse/), [correctness/](../backend/server/tests/correctness/) | 29 + 37 | Token bounds, hostile saves, economy model, arithmetic and settings boundaries | Load from many real clients |
| Host console | `test_host_console.py` | 11 | Host-only answers, no case data | The deployed console |
| Mystery-era code (unused since D031) | `test_case_*.py`, `test_board_*.py`, `test_finale_*.py`, `test_npc_*.py`, `test_crew*.py`, `test_festival*.py`, `test_islet_*.py` and others | 895 | The case, crews, festival and old islet, still mounted on the server | Nothing new: it leaves with the case cleanup (C1) |
| Story engine | [backend/plot_twist/tests/](../backend/plot_twist/tests/) | 45 | Story engine and its JavaScript parity (skipped without Node.js) | The removed prologue in the browser |

## 2. Backend SQL suites (opt-in)

They build a throwaway PostgreSQL on a Unix socket, apply **all migrations twice**, run each test in a rolled-back transaction, and never read a database URL or credentials ([case_sql/conftest.py](../backend/server/tests/case_sql/conftest.py)). Plain `uv run pytest` skips them.

Command pattern (from `backend/`):
`CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/<suite>`

| Suite | Files | Tests | What it covers | Extra for the command |
|---|---|---|---|---|
| [island_sql/](../backend/server/tests/island_sql/) | 3 | 48 | `island_open`, `wave_start`, `wave_join`, `wave_finish`, loot caps, one wave per island, `fresh_start.sql`; the tower-defense functions (`island_build`, `island_upgrade`, `island_hire`, `island_captain`, `pp_build`, `pp_upgrade`), levels and unlock checks, boss loot and house levels, the restart rule, four players with their own loot, no new browser rights | none |
| [demo_sql/](../backend/server/tests/demo_sql/) | 2 | 28 | Class code, `demo_guests`, the guest guard in policies | none |
| [sports_sql/](../backend/server/tests/sports_sql/) | 2 | 21 | Atomic stakes and settlement, deletion | none |
| [case_sql/](../backend/server/tests/case_sql/) | 5 | 65 | Case phases 1 to 4 (unused since D031) | none |
| [festival_sql/](../backend/server/tests/festival_sql/) | 1 | 15 | Festival timing and claims (unused since D031) | none |
| [followups_sql/](../backend/server/tests/followups_sql/) | 1 | 11 | Save versions and deletion | add `--with pglast` |
| [group3_sql/](../backend/server/tests/group3_sql/) | 1 | 3 | Schema, wallet directions, server-only grants | none |
| `abuse/test_scratch_postgres.py` | 1 | 26 | Abuse cases on real SQL | run without `CASE_PG_SCRATCH`: `uv run --frozen --with pgserver --with 'psycopg[binary]' pytest -q server/tests/abuse/test_scratch_postgres.py` |
| `test_local_server_pg.py`, `test_festival_api_pg.py`, `test_host_console_api_pg.py` | 3 | 5 | The API on top of the real SQL chain | same pattern, give the file path |

**Do not cover:** Supabase itself (Auth, the hosted Data API, Realtime policies under real tokens), the live project's applied migration history, and settings in the Supabase dashboard. The manual plan for those is in [supabase/README.md](../supabase/README.md#manual-test-plan).

## 3. Frontend unit tests (Vitest)

Command: `cd frontend && npm test` (runs `vitest run`; files `tests/**/*.test.js`, one file at a time, set in [frontend/vite.config.js](../frontend/vite.config.js)). Input only: `npm run test:input`.

Size: 193 test files in [frontend/tests/](../frontend/tests/), about 1,830 `it`/`test` lines (the run before the 11 Nov release reported 2,563 tests, because of `it.each`; one Harbor overview test fails, [OPEN-TODOS.md](OPEN-TODOS.md) section 7).

| Area | Files (examples) | Tests | What it covers | Does not cover |
|---|---|---|---|---|
| Pirate waves | [pirates/](../frontend/tests/pirates/) (`sim`, `td-sim`, `fog-balance`, `multiplayer`, `controller`, `td-flow`, `pirate-point`, `render`, `art`, `fake-api`) | 72 | Same seed and inputs give the same wave at any frame rate; the balance curve (wave 1 with one cannon, the wave 5 boss, wave 10, wave 20, below wave 30 with a full island); mortar, crew, captain musket and bad shots; boss waves; the break, Next wave and Auto next; two captains ringing at once; the single-flight join; re-sent `wave_start` | The real Realtime room; slow phones; drift after late packets |
| Island | [island/](../frontend/tests/island/) | 71 | Cards and prices, spots, the invite link and landing, visits and fake mode, start/join/finish flow, art placement | The live API |
| Class demo | `g29-*.test.js`, `duels-logic.test.js` | 175 | Class code parsing, quests, duel shortcut, lock states, lamp sync, projector, email and guest adapters | Real phones, real projector |
| Realtime and presence | `live-rules.test.js`, `realtime*.test.js`, `real-presence*.test.js` | 175 | Room names, send gaps, accepted messages, the guard, join and retry, with fake channels | The live Supabase Realtime service |
| Market | [market/](../frontend/tests/market/), `market*.test.js` | 302 | Board view, refusals, poller, formats | Live prices |
| Sports | [sports/](../frontend/tests/sports/) | 22 | Panel words and actions | Live fixtures |
| Home islet | `islet*.test.js`, `real-islet*.test.js` | 229 | Build panel, outcomes, lifecycle | The new island screens (lane P/U) |
| Sign-in, account, adapter | `auth*.test.js`, `account*.test.js`, `adapter*.test.js`, `real-adapter*.test.js`, `online*.test.js` | 200 | PKCE return, session, adapter contract and conformance | Real GitHub or email sign-in |
| Input and controls | `g20-*.test.js`, `map-touch.test.js`, `tap-path.test.js` | 64 | Keyboard, gamepad, touch mapping | Real touch screens |
| Loading and build | `lazy*.test.js`, `build*.test.js` | 30 | Lazy modules, build stamp | Load time on a real phone network |

## 4. Browser checks (`frontend/scripts/check-*.js`)

38 scripts. They drive an **installed Chrome** through `playwright-core`, mostly against a built copy with fake or recorded API answers; none signs in for real. Several build first (`npm run build && ...`). Run one at a time from `frontend/`.

| npm script (`cd frontend && npm run ...`) | Script | Checks |
|---|---|---|
| `build` | `check-spoilers.js` | No protected story text in the built files |
| `test:loading` | `check-loading.js` | Title budgets: JS at most 21,080 bytes, CSS under 12 kB, title image at most 350 kB |
| `test:csp`, `test:csp:inventory` | `check-csp.js`, `check-csp-inventory.js` | The built site under the production CSP; no forbidden inline code |
| `test:production` | `check-production.js` | The production build end to end with an offline API stub |
| `test:demo` | `check-demo-journey.js` | The class-demo journey with recorded API answers |
| `test:mp` | `check-multiplayer.js` | Two, then four pages on one island against the shared fake server (`?islands=fake`) and a BroadcastChannel room with the live room's rules: a co-op build shows on the owner's page, identical ships every second, musket shots cross pages, loot for each, one shared Next wave, a mid-wave join. **Not** the real Supabase Realtime, real accounts or the network; Pirate Point with four players and the lamps is not in it yet |
| `test:browser`, `test:world`, `test:readability` | `check-browser.js`, `check-world.js`, `check-readability.js` | The world loads, places, text contrast |
| `test:mobile`, `test:panels` | `check-mobile-walking.js`, `check-open-panels.js` | Touch walking at phone size; every panel a player can open (account, settings, the Harbor cards, the old islet panel, the island cards) fits at four sizes |
| `test:market` | `check-market-hall.js` | The Harbor market stall ("Up or down in 5 minutes?", `/api/market/calls`) in the production build with recorded answers: anonymous, the flag off, a 🪙 10 call on Up with its countdown, the request body, the HUD wallet |
| `test:online:islet`, `test:online:islet:chaos` | `check-online-islet.js` | Islet build with intercepted accounts; failures |
| `test:a11y`, `test:ui`, `test:help`, `test:credits` | `check-a11y.js`, `check-ui-kit.js`, `check-help.js`, `check-credits.js` | Keyboard, focus, reduced motion, hostile text (the Harbor market stall included; the fortune teller audit was removed on 11 Nov with the fortune teller), help and credits pages |
| `test:host` | `check-host-console.js` | Host console against fake responses |
| others | `test:art` (`check-pixel.js`), `test:weather:wiring`, `test:harbor:life`, `test:lifecycle`, `test:living`, `test:title-start`, `test:settings:visuals`, `test:build-stamp`, `test:problem-report`, `test:islet:world`, `test:festival` | See the first line of each script |
| no npm script | `check-islet.js`, `check-local-dev.js`, `check-online-auth.js`, `check-online-signin-gate.js`, `check-redesign-hud.js`, `check-redesign-movement.js`, `check-sports.js`, `check-sports-hotspot.js`, `capture-integrated.js` (the first 3 minutes with `?islands=fake`, screenshots) | Run with `node scripts/<name>` |

**Do not cover:** physical phones and their browsers, real audio output (headless Chrome has no real audio device), real sign-in, the live API and Realtime, and slow class Wi-Fi.

## 5. Live smoke test

| Command | What it checks | Does not cover |
|---|---|---|
| `bash scripts/smoke-live.sh https://the-great-plot-twist.vercel.app` (optional: an expected 40-character commit and a JSON of expected flags, [RUNBOOK.md](RUNBOOK.md)) | Signed out: home page and security headers, `/api/health`, `/api/config` flags, a private route answers `401` with `no-store`, the build stamp, bundle size, a spoiler scan ([scripts/smoke-live.mjs](../scripts/smoke-live.mjs)) | The database ("database readiness is not checked"), sign-in, Realtime, any write |
| `node --test scripts/test-smoke-live.mjs` | The smoke checker itself, against local fixtures | The live site |

## 6. Other small suites

| Command | Covers |
|---|---|
| `python3 -m unittest discover -s docs/tests` | Table and column coverage of [DATA-INVENTORY.md](DATA-INVENTORY.md) against the migrations |
| `cd backend && uv run ruff check .` | Python style and likely bugs |
| `cd frontend && npm audit` | Known npm vulnerabilities (0 on 11 Nov 2026) |

## 7. What no test covers today

- Physical phones (iOS Safari, Android Chrome) and the real projector setup ([OPEN-TODOS.md](OPEN-TODOS.md), section 5, two-phone test).
- 40 real users on one Wi-Fi: Supabase's per-address sign-in limits and Realtime's 200 connections ([ARCHITECTURE.md](ARCHITECTURE.md), free-tier limits).
- Provider outages over hours, and Vercel running several instances with separate caches and budgets.
- The email flow end to end with a real inbox and the Brevo mail service ([OPEN-TODOS.md](OPEN-TODOS.md) 4b).
- Real audio output on a device.
- The real Supabase Realtime room with four devices: `test:mp` uses a BroadcastChannel stand-in with the same message rules.
- Pirate Point with four players and the three lamps in one automated run.
- Whether the browser's `survived` in a wave is true: by design the server only bounds the loot ([D032](DECISIONS.md)).

## 8. Lane rows (to be filled by the lane's members)

The rows that start with "v3" were written on Fri 13 Nov 2026 at `6c9ffb3`. Counts are `def test_` lines (Python) or `it(`/`test(` lines (Vitest) per file, taken with `grep`, not by running the suites. The page of the [walkthrough](WALKTHROUGH.md) for each area is named in the first column. The SQL commands start in `backend/` and need no database URL.

| Lane | Tests (files) | Command | What they cover | What they do not cover |
|---|---|---|---|---|
| P, Pirates (`frontend/src/pirates/`) | [tests/pirates/](../frontend/tests/pirates/) (10 files), `check-multiplayer.js` | `cd frontend && npx vitest run tests/pirates` and `npm run test:mp` | Determinism, the balance curve to wave 100, towers, crew, captain, boss waves, the break, room sync with a stand-in room | The real Realtime room, physical phones, drift after late packets |
| H, Harbor and coins (`frontend/src/harbor/`, `lib/coins.js`) | to be written by the lane's members | | | |
| U, Look and feel (`frontend/src/ui/`) | to be written by the lane's members | | | |
| v3 Rooms: games, lobby, 10 players (WALKTHROUGH part 16) | [test_games_routes.py](../backend/server/tests/test_games_routes.py) (21), [island_sql/test_game_rooms_sql.py](../backend/server/tests/island_sql/test_game_rooms_sql.py) (8), [island/games.test.js](../frontend/tests/island/games.test.js) (13), `island/invite.test.js`, `island/one-island.test.js`, [pirates/ten-players.test.js](../frontend/tests/pirates/ten-players.test.js) (4) | `cd backend && uv run pytest -q server/tests/test_games_routes.py`; SQL: `CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql/test_game_rooms_sql.py`; `cd frontend && npx vitest run tests/island/games.test.js tests/pirates/ten-players.test.js` | Create once, join, the 10th member and the refused 11th, a guest turned away by a full game is not admitted, budgets, leave and re-join, the lobby for members only, ten senders keep one order inside the send budget | Ten real devices (`test:mp` uses at most four pages), real Realtime, a membership check at room level (none exists) |
| v3 Simulation and sync (part 17) | [pirates/sim.test.js](../frontend/tests/pirates/sim.test.js) (10), `pirates/td-sim.test.js` (15), [pirates/multiplayer.test.js](../frontend/tests/pirates/multiplayer.test.js) (17), `pirates/controller.test.js`, `pirates/td-flow.test.js`, [live-rules.test.js](../frontend/tests/live-rules.test.js) (43), `check-multiplayer.js` | `cd frontend && npx vitest run tests/pirates tests/live-rules.test.js`; `npm run test:mp` | Same seed and inputs give the same wave at any frame rate, inputs run at their target tick in a fixed order, every message shape and rate limit; `test:mp`: at least 90% of samples identical on two and four pages | The real Supabase Realtime, drift after late packets (not measured), 10 devices, a message sent in another player's name (not checked) |
| v3 Captain health and help-up (part 18) | [pirates/health.test.js](../frontend/tests/pirates/health.test.js) (21), `pirates/boarding.test.js` (17), [test_wave_revive_routes.py](../backend/server/tests/test_wave_revive_routes.py) (11), [island_sql/test_captain_revive_sql.py](../backend/server/tests/island_sql/test_captain_revive_sql.py) (9) | `cd frontend && npx vitest run tests/pirates/health.test.js`; `cd backend && uv run pytest -q server/tests/test_wave_revive_routes.py`; SQL: `CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql/test_captain_revive_sql.py` | Falling, the 2 s hold, the price 20 + 5 × wave, a repeat pays once, a second helper of one fall pays nothing, only a member in the wave pays, balance on 8 seeds | Real players, whether a fall really happened (the server cannot know), slow phones |
| v3 Campaign, Harbor gate, wreck (part 19) | [campaign/campaign.test.js](../frontend/tests/campaign/campaign.test.js) (11), [test_harbor_campaign.py](../backend/server/tests/test_harbor_campaign.py) (4), `test_tech_hub_routes.py` (13), `island_sql/test_tech_hub_sql.py` (8) | `cd frontend && npx vitest run tests/campaign`; `cd backend && uv run pytest -q server/tests/test_harbor_campaign.py` | The browser copy of `campaign.json` equals the server's, locks and unlock waves, the market stall closed before wave 4, the wreck never passes 500 | Sailing out to sea (not built), the pace of unlocks in real play |
| v3 Tech hub and research tiers (part 20) | `test_tech_hub_routes.py` (13), [test_research_tiers_routes.py](../backend/server/tests/test_research_tiers_routes.py) (8), `island_sql/test_research_tiers_sql.py` (9), `test_respec_and_wave_guards_sql.py` (6), [pirates/research-tiers.test.js](../frontend/tests/pirates/research-tiers.test.js) (11) | `cd backend && uv run pytest -q server/tests/test_research_tiers_routes.py`; SQL: `CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql/test_research_tiers_sql.py`; `cd frontend && npx vitest run tests/pirates/research-tiers.test.js` | Tier prices and unlock waves, one tier at a time, the other option closed unless paid again, capstones only after the island chose, no research during a wave, balance with tiers | Whether players understand the choice, play beyond a headless model |
| v3 Tower levels 4 and 5, late game (part 21) | [island/tiers.test.js](../frontend/tests/island/tiers.test.js) (9), `pirates/campaign-scaling.test.js` (11), [pirates/late-game.test.js](../frontend/tests/pirates/late-game.test.js) (4), `test_tower_tiers_match_migration.py` (4), `island_sql/test_tower_tiers_sql.py` (6) | `cd frontend && npx vitest run tests/island/tiers.test.js tests/pirates/campaign-scaling.test.js tests/pirates/late-game.test.js` | Prices equal on the cards and in `islands.json`, unlock waves 12, 15 and 20, the difficulty never goes down, every wave 1 to 100 runs to its end, a strong crew wins 30, 50, 70 and 100 on the model | Human play in waves 30 to 100, frame rate with 40+ ships on a phone |
| v3 Tear down and refunds (part 22) | [test_demolish_routes.py](../backend/server/tests/test_demolish_routes.py) (7), `test_demolish_matches_migration.py` (7), [island_sql/test_demolish_sql.py](../backend/server/tests/island_sql/test_demolish_sql.py) (12), `island/demolish.test.js` (16) | `cd backend && uv run pytest -q server/tests/test_demolish_routes.py`; SQL: `CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql/test_demolish_sql.py` | Each payer gets half of their own payments, legacy buildings pay the host, a repeat pays nothing twice, nothing during a wave, protected buildings, a member who left while the click waited (two real connections) | Many simultaneous tear-downs over the network, a phone's confirm card |
| v3 House roles (part 23) | [pirates/houses.test.js](../frontend/tests/pirates/houses.test.js) (18), [test_house_roles_routes.py](../backend/server/tests/test_house_roles_routes.py) (9), `test_house_roles_match_migration.py` (6), `island_sql/test_house_roles_sql.py` (8) | `cd frontend && npx vitest run tests/pirates/houses.test.js`; `cd backend && uv run pytest -q server/tests/test_house_roles_routes.py` | Militia, healing, repair speed and the stacking caps in the sim, `409 house_level`, `422 wrong_kind`, the Tavern's 25% off a revive, the recreated functions equal the old ones plus the marked lines | How the roles feel in play; militia and healing are not checked by the server |
| v3 Captain tree, roles, respec (part 24) | [test_captain_tree_routes.py](../backend/server/tests/test_captain_tree_routes.py) (9), `island_sql/test_captain_tree_sql.py` (6), `test_respec_wave_guards_match_migration.py` (6), [pirates/captain-stats.test.js](../frontend/tests/pirates/captain-stats.test.js) (16), `island/captain-tree.test.js` (7) | `cd backend && uv run pytest -q server/tests/test_captain_tree_routes.py`; `cd frontend && npx vitest run tests/pirates/captain-stats.test.js tests/island/captain-tree.test.js` | Five tiers and two forks per branch, a fork closes its twin, capstones need the role, the respec price under the lock, no respec during a wave, the Engineer discount, the two copies of the tree equal | Real crews picking roles; whether a receiving screen checks the skills a message carries |
| v3 Wave events and boss finishers (part 25) | [pirates/wave-events.test.js](../frontend/tests/pirates/wave-events.test.js) (18), `pirates/wave-events-controller.test.js` (4), [pirates/finisher.test.js](../frontend/tests/pirates/finisher.test.js) (14), [test_wave_events.py](../backend/server/tests/test_wave_events.py) (10), `test_wave_routes.py` (39) | `cd frontend && npx vitest run tests/pirates/wave-events.test.js tests/pirates/finisher.test.js`; `cd backend && uv run pytest -q server/tests/test_wave_events.py` | The server picks the same event as the browser from shared samples, no event before wave 3, a bonus counts only where the wave allows it and is dropped otherwise, finisher scoring from samples; `test:mp`: the same event on two pages and a finisher on four | A finisher on slow phones or ten players, touch controls on a real device, the look at every screen size |
| v3 Narrator and voice pipeline (part 26) | [narrator/logic.test.js](../frontend/tests/narrator/logic.test.js) (13), `narrator/narrator.test.js` (10), `pirates/narrator-events.test.js` (2), [scripts/voice/test_generate.py](../scripts/voice/test_generate.py) (29) | `cd frontend && npx vitest run tests/narrator`; `python3 -I -m unittest discover -s scripts/voice -v` (from the repository root) | Triggers, told-once memory, the queue and expiry, the manifest, a missing voice file, the generator's key and budget guards with a fake network | Real speech output (headless Chrome has no audio device), the real ElevenLabs, a check that every line has a file (not a test: I counted 80 of 80 by hand) |
| v3 Cartoon art (part 27) | [cartoon-art.test.js](../frontend/tests/cartoon-art.test.js) (4), [hires-art.test.js](../frontend/tests/hires-art.test.js) (4), [v3-raster-free.test.js](../frontend/tests/v3-raster-free.test.js) (6), `island/world-art.test.js` (7) | `cd frontend && npx vitest run tests/cartoon-art.test.js tests/hires-art.test.js tests/v3-raster-free.test.js` | Every wave sprite has a drawing with the old box and anchor, ten captain palettes, texture density within the memory budget, more texels never move collision, v3 screens load no painted or pixel pictures | How it looks (no picture comparison), memory and frame rate on real phones |
| v3 Database and server house style (part 28) | [island_sql/](../backend/server/tests/island_sql/) (13 files, 125 tests), `test_wallet_matches_migration.py` (58) and the four `test_*_matches_migration.py` files | `CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/island_sql`, run from `backend/` | Every v3 function on a real Postgres with all migrations applied twice: refusals, repeats, lock order, two real connections in some, no browser rights; Python and SQL say the same about reasons and recreated functions | The live project (applied grants, applied history, md5 of the stored text), Supabase Auth and Realtime, load |

### T26 · Ianno Hollensteiner · Harbor weather access

| What I built / why | Where and command | Covers | Misses |
|---|---|---|---|
| Opens the existing weather board from the island Harbor after wave 4; reuses the existing fetcher and card | [model test](../frontend/tests/island/card-model.test.js), [DOM test](../frontend/tests/island/weather-board.test.js): `cd frontend && npm test -- --run tests/island/card-model.test.js tests/island/weather-board.test.js`; [game journey](../frontend/scripts/check-island-weather.js): `cd frontend && node scripts/check-island-weather.js` | Wave 3/4 boundary, storm/fog/stale/missing weather, one dialog, focus/reset, Escape, cleanup; real game wiring and viewport containment at 1280 × 720 and 375 × 812 with recorded APIs | Real Open-Meteo outages, physical touch devices, deployed sign-in; changes while the weather card remains open |

### T5 · Ianno Hollensteiner · Island milestones

| What I built / why | Where and command | Covers | Misses |
|---|---|---|---|
| Number-only rank shield beside the cabin, statue at wave 25 and tree sizes of 100% / 110% / 120%; makes saved island progress visible | [Rule tests](../frontend/tests/island/decorations.test.js) and [browser component test](../frontend/tests/island/decorations-dom.test.js): `cd frontend && npm test -- tests/island/decorations.test.js tests/island/decorations-dom.test.js`; [game capture](../frontend/scripts/check-island-decorations.mjs): `cd frontend && node scripts/check-island-decorations.mjs` | Recorded win events update 21 → 22 → 29 → 30; each ten-wave rank boundary, 24/25 statue boundary, invalid records, house removal/duplicates, actual local house builds grow trees from 100% to 110% to 120%, lower progress on another island, art reuse, cleanup and unchanged colliders; full local game wiring and 1280 × 720 / 375 × 812 screenshots with a fake API | Live Supabase progress and real visits, physical phones, actual competitive play balance; ornaments are drawn on Canvas rather than exposed as interactive controls |

## T27 — Ianno Hollensteiner — Captain shooting direction

| What I built / where / why | Checks | What they cover | What they miss |
|---|---|---|---|
| Exact-angle musket aiming and upright directional bodies: `pirates/poses.js`, `pirates/shot-art.js`, `art/people.js`; shared by `player/character.js` and `world/others/index.js` | `cd frontend && npm test -- tests/pirates/poses.test.js`; `node scripts/check-shooting-direction.js`; `npm run test:mp` | Projected aim at cardinal, diagonal and intermediate angles; malformed/zero directions; color and expiry; real local/remote renderers at 1280 × 720 and 375 × 812; one body, idle restoration, texture reuse/disposal; multiplayer uses the fake room | Live Supabase, physical phones, a continuously turning 3D body; direction fixture injects controlled events; body/gun overlap is also visually reviewed |

[Walkthrough part 30](WALKTHROUGH.md#30-captain-shooting-direction--ianno-hollensteiner-t27)
and [recorded results](../specs/T27-shooting-direction.md).

### T7 · Ianno Hollensteiner · Weekly island leaderboard

| What I built / why | Where and command | Covers | Misses |
|---|---|---|---|
| Read-only top ten island teams this UTC week; highest successful wave survives a restart; wooden scoreboard with medal badges | [Backend](../backend/server/tests/test_island_leaderboard.py): `cd backend && uv run pytest -q server/tests/test_island_leaderboard.py`; [browser/API](../frontend/tests/island/leaderboard.test.js): `cd frontend && npm test -- --run tests/island/leaderboard.test.js`; [game evidence](../frontend/scripts/check-island-leaderboard.mjs): `cd frontend && node scripts/check-island-leaderboard.mjs after` | Weekly/year boundaries and query filters, duplicate/shared islands, highest win after restart, ties, top-ten pagination and scan refusal, malformed rows, login/flag/no-store; loading/error/retry/empty states, exact three rows, medals and stale response after closing; 1280 × 720 and 375 × 812, long names and 44 px controls | Live PostgREST filtering/pagination and performance, concurrent deletion during reads, real accounts and physical phones, screen-reader behavior and fairness between crew sizes; fixture screenshots show sample captains |

## T28 — Ianno Hollensteiner — Boss minigame practice

| Part and why | Existing and new checks | Covers | Misses |
|---|---|---|---|
| Personal first-time explanations and practice using the existing finisher scene | [Memory/barrier tests](../frontend/tests/pirates/finisher-practice.test.js), [real DOM and two pages](../frontend/tests/finisher-introduction.test.js), [controller](../frontend/tests/pirates/wave-events-controller.test.js), [room validation](../frontend/tests/wave-rooms.test.js); `cd frontend && npm test`; `npm run test:mp -- <folder>` | Player/island/task separation, blocked storage, skip and later encounters, keyboard/touch input and focus reset, private practice samples, spectator/old-boss/duplicate readiness, wait limit, real BroadcastChannel exchange between two pages; the multiplayer script additionally checks one practicing captain and three skipping | Real Supabase sender/delivery, packet loss and late joins beyond existing room assumptions, physical phones, projector and screen readers |

[Walkthrough part 31](WALKTHROUGH.md#31-learn-boss-minigames-with-optional-practice--ianno-hollensteiner-t28)
and [results, screenshots and manual checkpoints](evidence/T28/README.md).
