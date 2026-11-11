# Test map

> **What this file is:** per area, which tests cover it, the exact command, how many there are and
> what they do **not** cover (task E1 in [FINAL-ROADMAP.md](FINAL-ROADMAP.md)). It backs question Q2
> of the [walkthrough](WALKTHROUGH.md#q2-what-do-the-tests-cover-and-what-do-they-not-cover).
>
> **Counts** were taken on Wed 11 Nov 2026 at `b0b6fd3` with `ls` and `grep -c`, not by running the
> suites: a "test" is one `def test_` (Python) or one `it(`/`test(` line (Vitest). Parametrized
> cases count once, so the number of cases that run is higher.

## How to read it

- Every command starts in the repository root. `cd backend` or `cd frontend` comes first, as in [ENGINEERING.md, section 3](ENGINEERING.md#3-commands).
- **No test uses the network.** Outside services, the sign-in check, the database and the clock are fakes ([ENGINEERING.md, section 5](ENGINEERING.md), rule 3).
- **No CI.** The only GitHub Actions workflow is the keep-alive ([.github/workflows/keepalive.yml](../.github/workflows/keepalive.yml)). Each pull request pastes its own results ([CONTRIBUTING.md](../CONTRIBUTING.md)).

## 1. Backend unit tests (pytest)

Command for all of them: `cd backend && uv run pytest` (paths `server/tests` and `plot_twist/tests`, set in [backend/pyproject.toml](../backend/pyproject.toml)). One file: `cd backend && uv run pytest -q server/tests/test_wave_routes.py`.

Size: 184 test files under [backend/server/tests/](../backend/server/tests/) (157 at the top, 27 in subfolders, the opt-in SQL files included) and 5 in [backend/plot_twist/tests/](../backend/plot_twist/tests/); about 3,900 test functions in all.

| Area | Files (examples) | Tests | What it covers | Does not cover |
|---|---|---|---|---|
| Islands and waves | `test_island_routes.py`, `test_island_rules.py`, `test_wave_routes.py` | 83 | Prices from `islands.json`, wrong kind or spot, repeats, `feature_off`, budgets, loot caps, timing refusals | The real SQL (see section 2); the pirate frontend, not built |
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
| [island_sql/](../backend/server/tests/island_sql/) | 2 | 33 | `island_open`, `wave_start`, `wave_join`, `wave_finish`, loot caps, one wave per island, `fresh_start.sql` | none |
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

Size: 180 test files in [frontend/tests/](../frontend/tests/), about 1,700 `it`/`test` lines.

| Area | Files (examples) | Tests | What it covers | Does not cover |
|---|---|---|---|---|
| Class demo | `g29-*.test.js`, `duels-logic.test.js` | 175 | Class code parsing, quests, duel shortcut, lock states, lamp sync, projector, email and guest adapters | Real phones, real projector |
| Realtime and presence | `live-rules.test.js`, `realtime*.test.js`, `real-presence*.test.js` | 175 | Room names, send gaps, accepted messages, the guard, join and retry, with fake channels | The live Supabase Realtime service |
| Market | [market/](../frontend/tests/market/), `market*.test.js` | 302 | Board view, refusals, poller, formats | Live prices |
| Sports | [sports/](../frontend/tests/sports/) | 22 | Panel words and actions | Live fixtures |
| Home islet | `islet*.test.js`, `real-islet*.test.js` | 229 | Build panel, outcomes, lifecycle | The new island screens (lane P/U) |
| Sign-in, account, adapter | `auth*.test.js`, `account*.test.js`, `adapter*.test.js`, `real-adapter*.test.js`, `online*.test.js` | 200 | PKCE return, session, adapter contract and conformance | Real GitHub or email sign-in |
| Input and controls | `g20-*.test.js`, `map-touch.test.js`, `tap-path.test.js` | 64 | Keyboard, gamepad, touch mapping | Real touch screens |
| Loading and build | `lazy*.test.js`, `build*.test.js` | 30 | Lazy modules, build stamp | Load time on a real phone network |

## 4. Browser checks (`frontend/scripts/check-*.js`)

39 scripts. They drive an **installed Chrome** through `playwright-core`, mostly against a built copy with fake or recorded API answers; none signs in for real. Several build first (`npm run build && ...`). Run one at a time from `frontend/`.

| npm script (`cd frontend && npm run ...`) | Script | Checks |
|---|---|---|
| `build` | `check-spoilers.js` | No protected story text in the built files |
| `test:loading` | `check-loading.js` | Title budgets: JS at most 21,080 bytes, CSS under 12 kB, title image at most 350 kB |
| `test:csp`, `test:csp:inventory` | `check-csp.js`, `check-csp-inventory.js` | The built site under the production CSP; no forbidden inline code |
| `test:production` | `check-production.js` | The production build end to end with an offline API stub |
| `test:demo` | `check-demo-journey.js` | The class-demo journey with recorded API answers |
| `test:browser`, `test:world`, `test:readability` | `check-browser.js`, `check-world.js`, `check-readability.js` | The world loads, places, text contrast |
| `test:mobile`, `test:panels` | `check-mobile-walking.js`, `check-open-panels.js` | Touch walking at phone size; every panel a player can open (account, settings, the Harbor cards, the old islet panel, the island cards) fits at four sizes |
| `test:market` | `check-market-hall.js` | The Harbor market stall ("Up or down in 1 hour?", `/api/market/calls`) in the production build with recorded answers: anonymous, the flag off, a 🪙 10 call on Up with its countdown, the request body, the HUD wallet |
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
- The pirate frontend (lanes P, H, U): not built yet; the server side has the tests in sections 1 and 2.
- Whether the browser's `survived` in a wave is true: by design the server only bounds the loot ([D032](DECISIONS.md)).

## 8. Lane rows (to be filled by the lane's members)

| Lane | Tests (files) | Command | What they cover | What they do not cover |
|---|---|---|---|---|
| P, Pirates (`frontend/src/pirates/`) | to be written by the lane's members | | BUILD-PLAN P1 asks for: a won wave, a lost wave, same seed same result, fog and storm, invalid inputs ignored | |
| H, Harbor and coins (`frontend/src/harbor/`, `lib/coins.js`) | to be written by the lane's members | | | |
| U, Look and feel (`frontend/src/ui/`) | to be written by the lane's members | | | |
