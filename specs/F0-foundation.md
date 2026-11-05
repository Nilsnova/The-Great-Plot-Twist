# F0 Foundation

> **What this is:** the shared base that every later package builds on. It sets hosting, rules on the server, the play-money wallet, settings and feature flags, the pattern for outside data, sign-in, the first database migration and the engineering rules.
>
> **Who uses it:** the whole team and every coding agent. Every other package starts from what F0 delivers.

- **Status:** proposed. The scope was decided with Nils on 2026-11-05. It counts as accepted when a different teammate has reviewed it and it is merged (the same path as decision D001 in the [decision log](../docs/DECISIONS.md)).
- **Branch:** `chore/foundation`
- **Issue and pull request:** to be added when the pull request is opened

## Why

The Great Plot Twist extends Nils' text mystery Plot Twist (an intro on a lighthouse island, then a shared world of islands) into a top-down 2D game in the browser. Four of us, new to programming and working with coding agents, will add features such as a stock exchange, prediction markets, sports predictions and arena stakes.

Without a shared base, each feature would invent its own way to store data, check a login and move coins. Coins could be duplicated or lost, and nobody could explain the result line by line. F0 settles the basics first: where the code runs, where the rules live, how money works, how unfinished features stay hidden, how we reach outside services and how we write and test code.

Rules in Python on the server can be tested with pytest, which the course already uses. That is why the rules live there and not in the browser.

## What

### Decisions

| Topic | Decision |
|---|---|
| Game | "The Great Plot Twist": a top-down 2D browser game that extends the text mystery Plot Twist. Its art style is decision D005. |
| Hosting | Vercel Hobby serves the static Vite build (the `frontend/` service) and a Python API (FastAPI, the `backend/` service) from one project. `vercel.json` defines the two services and sends every `/api/...` address to the backend. The API entry file is `backend/main.py`. |
| Backend services | Supabase Free: login with GitHub sign-in (Supabase Auth), Postgres with row-level security, and realtime. |
| Where rules live | In Python on the server, tested with pytest (`uv run pytest`, as in the course). The database guarantees integrity with constraints and one atomic wallet function. The browser only displays and sends intents. |
| Money | Play money only. Coins cannot be bought, cashed out or exchanged for real prizes. Every player starts with `STARTING_BALANCE = 0` coins and gets the first ones from the intro entry kit (reason `kit_grant`). One wallet and one ledger serve every money feature. Players can never write balances. Only the server, with the secret key, changes them, through one atomic database function. The allowed reasons are rows of a database table, each with a direction (see [Wallet](#wallet)). |
| Saves | A player can read their own save. Only the server writes it, with the secret key, because progress is decided on the server (see [Saves](#saves)). |
| Display name | The name other players see is `profiles.display_name`, read from the database. At sign-up it is a neutral placeholder (`Captain-` plus six characters of the player id). It never comes from the GitHub login or any other login detail, because names appear on a projector, and players cannot edit it. A later package (A2) generates real captain names on the server. The login check carries only the verified user id. |
| Crews | A crew has up to four seats. Each taken seat holds a player or an NPC partner (a crew mate that the game runs), so the game is playable alone. Only the server writes crews (see [Crews and seats](#crews-and-seats)). |
| Database access | The browser only reads. Every write goes through the server. Our Supabase project exposes no new tables automatically, so the migration grants every right by hand. |
| Browser client | Three.js and Vite, plain JavaScript, built by package G1 in `frontend/src/`, with Vitest tests in `frontend/tests/`. G1 is not part of F0. |

### What F0 delivers

| Path | What it is |
|---|---|
| `backend/main.py` | Vercel entry only. It builds the app with `create_app()` from `backend/server/app.py` and hands it to Vercel. |
| `vercel.json` | The Vercel setup: two services, the game in `frontend/` and the Python API in `backend/` (entry `main:app`). It sends every `/api/...` address to the backend and every other address to the frontend. `frontend/` arrives with package G1. |
| `backend/server/app.py` | `create_app()` builds the FastAPI app. Every URL starts with `/api`. The interactive docs are not served in production. Importing the file builds nothing. |
| `backend/server/settings.py` | Reads the settings once at start-up. The only file in the server that reads the environment. |
| `backend/server/flags.py` | The seven feature flags, all off by default. A typo in `FEATURE_FLAGS` stops the server at start-up. |
| `backend/server/errors.py` | One JSON shape for every failed request, with no stack traces and no secrets. |
| `backend/server/clock.py` | "What time is it?" in one place, so tests can use a fake clock. |
| `backend/server/auth.py` | The sign-in dependency (`PlayerDep`). It turns `Authorization: Bearer <token>` into a player (the verified user id), or answers 401. |
| `backend/server/supabase_admin.py` | Server-only calls to database functions and table reads (`select_rows`) with the secret key. |
| `backend/server/wallet.py` | The wallet rules: `STARTING_BALANCE` (0), `WALLET_REASONS` (each reason with its direction), checking a coin change, and asking the database to apply it. |
| `backend/server/routes/health.py`, `backend/server/routes/config.py` | `GET /api/health` and `GET /api/config` (which features are on). |
| `backend/server/routes/keepalive.py` | `GET /api/keepalive`, called only by Vercel's daily cron with the cron secret. It reads one row from each of three tables, so the free Supabase project does not pause. The cron entry itself is not in `vercel.json` yet. |
| `backend/server/adapters/base.py`, `backend/server/adapters/example.py` | The pattern for outside data (cache, timeout, fallback) and a worked example to copy. |
| `backend/server/tests/` | pytest tests for everything above. |
| `supabase/migrations/20261106000000_foundation.sql` | The first migration: `profiles`, `saves`, `wallets`, `wallet_reasons`, `wallet_transactions` (the ledger), `crews` and `crew_seats`, their row-level security policies (read only for signed-in players) and explicit table privileges, the atomic function `apply_wallet_transaction`, the helper `is_crew_member`, and a trigger that creates a new player's starter rows: a placeholder name, a wallet with 0 coins and an empty save. The ledger points at `wallet_reasons` and holds one row per player, reason and `ref`. |
| `supabase/README.md` | How to apply the migration, the project settings it relies on, the policy and grant matrix ("Who may do what") and a manual test plan. See [supabase/README.md](../supabase/README.md). |
| `backend/pyproject.toml`, `backend/uv.lock`, `backend/.python-version`, `.gitignore` | Python packages and versions, and the files Git must never track. |
| `docs/ENGINEERING.md` | The engineering rulebook: [How we write code](../docs/ENGINEERING.md). |
| `docs/ARCHITECTURE.md`, `docs/INTERFACES.md`, `docs/SETUP.md` | The big picture ([Architecture](../docs/ARCHITECTURE.md)), the shared contracts ([Interfaces](../docs/INTERFACES.md)) and the one-time setup of GitHub, Supabase and Vercel ([Setup](../docs/SETUP.md)). |
| `docs/DECISIONS.md` | The decision entries D002 (hosting), D003 (rules on the server), D004 (the wallet) and D012 (crews and seats). |
| `README.md`, `AGENTS.md` | The project status and the table of links in the README, and one line in AGENTS.md that points to the engineering rules and the contracts. |
| `specs/_TEMPLATE.md`, `specs/F0-foundation.md` | The spec template and this spec. |
| `.env.example` | Every setting name with an empty value, and a comment saying whether it is safe for the browser. |

### Settings

The server reads the first seven names, and only those. The last row is read by the Vite client, not by the server. See [.env.example](../.env.example) for the template.

| Name | Meaning | Safe for the browser? |
|---|---|---|
| `APP_ENV` | `local`, `preview` or `production`. Empty means `local`. | Yes, not secret |
| `SUPABASE_URL` | Address of the Supabase project. | Yes |
| `SUPABASE_PUBLISHABLE_KEY` | Key the browser may use. Row-level security protects the data. | Yes |
| `SUPABASE_SECRET_KEY` | Server-only key that skips row-level security. | **No, server only** |
| `CRON_SECRET` | Server-only password that Vercel's cron sends to `GET /api/keepalive`. Empty on a laptop means the route answers 503. | **No, server only** |
| `DEMO_MODE` | `true` or `false`. Empty means `false`. | Yes, not secret |
| `FEATURE_FLAGS` | Comma-separated flag names to switch on. | Yes, not secret |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Copies of the two Supabase values above, for the Vite client. The server does not read them. | Yes |

### Feature flags

All off by default. A flag is on only when `FEATURE_FLAGS` names it. Each flag switches on one later feature, and that feature's own spec says exactly what it does.

`market`, `predictions`, `sports`, `arena`, `raid`, `live_presence`, `companion_llm`

### Wallet

- **One wallet and one ledger** for every money feature. `wallets` holds the balance (never below 0). `wallet_transactions` holds one row for every change, each with a reason.
- **Players only read.** A signed-in player may read their own wallet and ledger rows and nothing more. There is no policy that lets a player insert, update or delete money rows.
- **Only the server writes.** The server, with the secret key, calls `apply_wallet_transaction`. It checks the balance, changes it and writes the ledger row in one step, so two requests at the same moment cannot spend the same coins twice. If the balance would drop below 0, nothing changes and the call fails with `insufficient_funds`.
- **The ledger is append-only.** The server may read the ledger and add rows through the function. No role may update or delete a ledger row. Rows disappear only when their player is deleted (cascade). Nobody may create or delete a wallet by hand. The counter behind the ledger's `id` is closed to every role.
- **Python checks first.** `backend/server/wallet.py` refuses bad numbers, unknown reasons and a wrong direction before any call to the database. A refusal is a 422 `invalid_transaction`.
- **Every reason has a direction.** The allowed reasons are the rows of the table `wallet_reasons` (columns `reason`, `direction` and `description`). An `earn` reason always adds coins, so its amount is positive. A `spend` reason always takes coins away, so its amount is negative. An `either` reason (only `admin_adjust`) may go both ways, but never 0. `apply_wallet_transaction` looks the reason up before it touches the balance. It refuses an unknown reason (`unknown_reason`) and an amount with the wrong sign (`wrong_direction`). The ledger's `reason` column is also a foreign key to `wallet_reasons`, so an unknown reason can never be stored. This stops a bug such as buying -3 buildings from paying the player. Python checks the same rule first, so even a bug in Python cannot hand out coins.
- **Repeated requests.** Every money call needs a `ref` that stays the same when the request is repeated. A call without one is refused: Python answers 422 `invalid_transaction`, and the ledger column cannot be empty or blank. The `ref` is, for example, an order id made once per click or, for a reward, the server's own record such as the id of the solved clue. The ledger holds each player, reason and `ref` only once. A repeat changes nothing and the wallet answers 409 `already_applied`. A grant that must happen only once per player, such as the entry kit, uses a fixed `ref` (for example `kit`), so the database itself stops a second payout. A 503 means the outcome is unknown, because the call may have been saved before it timed out. Look the `ref` up in the ledger before you retry, refund or charge again.
- **New players** get a profile with a placeholder name, a wallet with `STARTING_BALANCE` (0) coins and an empty save, created by a trigger when they sign up. The trigger writes **no** ledger row. The first coins arrive later through the intro entry kit (`kit_grant`).
- **The reasons** are rows in `wallet_reasons`, and Python keeps the same pairs, in the same order, in `WALLET_REASONS`. Adding a reason is one new migration that inserts a row, plus the pair added at the end of the Python list, in one pull request (recipe [4.7 in How we write code](../docs/ENGINEERING.md#47-add-a-wallet-reason)). The test reads every migration and fails if the two lists differ. Never rename a reason or change its direction.

| # | Reason | Direction | What it is for |
|---|---|---|---|
| 1 | `kit_grant` | earn | The coins that come with the entry kit the intro gives a new player |
| 2 | `clue_reward` | earn | A clue a player found or pinned |
| 3 | `mystery_reward` | earn | A deduction, or solving the whole mystery |
| 4 | `event_reward` | earn | A special event in the world |
| 5 | `cargo_sale` | earn | Selling cargo |
| 6 | `clue_purchase` | spend | Buying a clue |
| 7 | `building_purchase` | spend | Building on a home islet |
| 8 | `admin_adjust` | either | A manual correction by an admin |

### Crews and seats

- **A crew** has up to four seats (numbered 1 to 4), a mode (`solo` or `crew`) and a status (`forming`, `active` or `finished`).
- **A seat** holds either a player or an NPC partner (`npc_id`), never both and never nobody. An NPC partner is a crew mate that the game runs itself. A seat that nobody holds has no row. This keeps the game playable alone: a solo player sits in seat 1 and NPC partners fill the other seats.
- **Players only read**, and only the crews they sit in, with all the seats of those crews. The read rule uses the small helper `is_crew_member()`, so the rule for seats does not have to read seats through its own rule (which would loop forever). Only the server writes crews and seats.
- **One active crew per player** is enforced by the server, not by the database (for now).
- **Deleting players.** If a player is deleted, their seat row goes with them and the seat is free again. If the player who created a crew is deleted, the whole crew and all its seats are deleted.

### Saves

- **Players only read.** A signed-in player may read their own save and nothing more. They cannot insert, update or delete it. The browser writes nothing straight to the database: every write goes through the server.
- **Only the server writes.** Progress is decided on the server, so the server writes saves with the secret key. The sign-up trigger creates the empty save. F0 has no route that writes a save: the first package that needs saved progress adds one that checks the data first. The database still keeps a save a JSON object of at most about 200 KB.

### Outside data (the adapter pattern)

`backend/server/adapters/base.py` wraps one outside call in a `CachedSource`. A call to `get()` tries, in order: fresh cached data, a live fetch, the last good data, a recorded fallback saved in our code, and then gives up with a 503. The outside service is called at most once per time-to-live, even when many players ask at once. This holds per running server instance: Vercel may run several at once, and a cold start begins with an empty cache. So leave headroom (for example twice the minimum time-to-live) and do not rely on it for a hard daily quota. Every result says where it came from and when it was fetched.

### Sign-in

The browser signs in with GitHub through Supabase and receives a token. It sends the token in the `Authorization: Bearer` header. `backend/server/auth.py` asks Supabase whose token it is, remembers a good answer briefly (60 seconds, so a player who just signed out or was deleted may still be accepted for that long), and gives the route a `Player` (the verified user id). The name other players see is `profiles.display_name`, read from the database. It is not taken from the token, because a player can edit their own login details. A missing or bad token gives 401, and every refused token leaves one log line with Supabase's status (never the token). A server without Supabase set up, or a Supabase that cannot be reached, gives 503.

### Folder map

`backend/`, `backend/server/`, `backend/server/tests/`, `frontend/`, `supabase/migrations/`, `docs/`, `specs/` and `content/`. Who owns which folder is in [How we write code, section 2](../docs/ENGINEERING.md#2-repository-map).

## Out of scope

- **The features themselves.** Stock exchange, prediction markets, sports predictions, arena, raid, live presence and the companion each come in a later package, behind their flag.
- **The browser client** in `frontend/` (package G1). That includes the two follow-ups for `frontend/vite.config.js`: letting the Vite dev server pass `/api` on to port 8000, and letting it read the `.env` in the repository root (see [How we write code, section 3](../docs/ENGINEERING.md#3-commands)).
- **Screens** for sign-in or the wallet in the browser.
- **Real outside data sources.** F0 gives the pattern and one worked example with made-up data.
- **Setting up the real services.** A teammate does these by hand after the merge, outside the repository. No agent ever gets the secret key.
  - Create the Supabase project and the Vercel project.
  - Set up GitHub sign-in in Supabase.
  - Enter the real keys in Vercel and in a private `.env`.
  - Allow only GitHub sign-in in Supabase: GitHub on, Email off, Anonymous sign-ins off (see [supabase/README.md](../supabase/README.md#first-allow-only-github-sign-in)).
  - Check the Supabase project settings the migration relies on: Data API on, "Automatically expose new tables" off, "Enable automatic RLS" on (see [supabase/README.md](../supabase/README.md#project-settings-this-migration-relies-on)).
  - Apply the migration to the Supabase project.
  - Sign in once on the preview site after setting the keys. A wrong or rotated publishable key makes Supabase refuse every token, so every player would see "Your login is not valid".
- **Automatic checks on GitHub (CI).** CONTRIBUTING.md says to require them once real CI exists.
- **Real money.** Never. No payments, no cash-out, no real prizes, no prices in real currency.
- **Story content** in `content/`. Its format is decided by the first story package.

**Known limits**

- **Verified on Vercel (5 Nov 2026).** After the bootstrap merge, production served the game from `frontend/` and `GET /api/health` answered `{"status":"ok","version":"0.1.0","env":"production"}` from `backend/main.py` through the two services and the `/api` rewrite in `vercel.json` (deploy check 2). Still open: the keep-alive cron together with Services (a follow-up change adds it to `vercel.json`), and deploys triggered by teammates' pushes (deploy check 1).
- **Repeated requests.** Every coin change needs a `ref`, and the ledger refuses a second row with the same player, reason and `ref`. Python refuses a call without a `ref` (422), and the database refuses a missing or blank one too, so no coin change can skip the repeat check. What no rule can check is whether a feature picks a good `ref`: a new random one on every retry would pay twice. So every money feature must make the `ref` once per player action and say in its own spec where it comes from. A 503 from the wallet means the outcome is unknown: the coins may have moved before the call timed out.
- **Saves are read-only for players.** By team rule the browser never writes game data, so it cannot write its own progress. The first package that needs saved progress adds a server route that checks the data first, and the server writes the save with the secret key.
- **The direction rule lives in the money function.** A table rule cannot look into another table, so the ledger itself no longer checks the sign of an amount against its reason. It still refuses an unknown reason (foreign key), an amount of 0, a missing or blank `ref` and a negative balance. The sign is checked by `apply_wallet_transaction` and by Python. The server's table rights would still let it insert a ledger row by hand with the wrong sign. The team rule is that the server never writes the ledger directly. Today the rule also holds in the code: the server's database client (`backend/server/supabase_admin.py`) can only call a database function or read a table, so it has no way to write a table by hand. A pull request that adds such a method breaks the rule, and a reviewer should refuse it.
- **No route pays coins yet.** F0 has no route that moves coins, so every wallet stays at 0 until the package for the entry kit pays `kit_grant` with a fixed `ref`.
- **Placeholder names.** Every player's name is `Captain-` plus six characters of their id until package A2 generates captain names. Names are not unique.
- **Crew rules the database does not check.** The server makes sure a player has only one active crew. The database also does not stop one player from holding two seats of the same crew, or the same NPC partner from sitting twice in one crew, so the server must avoid both. A later migration can add unique indexes if they are needed.
- **Deleting a player deletes crew data.** A deleted player's seat disappears. If the player who created a crew is deleted, the whole crew goes, including the seats of other players. We accept that for now.

## Done when (acceptance checks)

- [ ] **Server tests pass.** `cd backend && uv sync && uv run pytest`: every test passes and none fails. The summary line is pasted in the pull request.
- [ ] **Lint is clean.** `cd backend && uv run ruff check .` prints `All checks passed!`.
- [ ] **SQL parses.** Every file in `supabase/migrations/` is accepted by a PostgreSQL parser. One way to check is the `pglast` command in [How we write code, recipe 4.2, step 9](../docs/ENGINEERING.md#42-add-a-database-table). The pull request says how it was checked.
- [ ] **Policy matrix documented.** The "Who may do what" section of [supabase/README.md](../supabase/README.md#who-may-do-what) covers `profiles`, `saves`, `wallets`, `wallet_reasons`, `wallet_transactions`, `crews` and `crew_seats`, and the four functions, for a visitor who is not signed in, a signed-in player and the server. It matches the migration: players only read (their own wallet, ledger, save, crews and seats, all profiles, the list of reasons), and a visitor who is not signed in gets nothing.
- [ ] **Explicit grants.** The migration takes every right on every table away from `public`, `anon`, `authenticated` and `service_role`, and grants back only what is needed: `anon` nothing, `authenticated` `select` only, the server what the matrix says. It does not rely on any default of the Supabase project (ours has "Automatically expose new tables" off).
- [ ] **Money is guarded.** In the migration, only `service_role` may run `apply_wallet_transaction`, and no policy or grant lets a player write to any table. The server cannot update or delete a ledger row, insert or delete a wallet, or change the list of reasons, and no role can move the ledger's id counter.
- [ ] **New players start empty.** The sign-up trigger gives a new player a profile named `Captain-` plus six characters of their id (never taken from the login details), a wallet with 0 coins and an empty save, and writes no ledger row.
- [ ] **Crews are private.** A player can read a crew and its seats only if they sit in it, and no player can write a crew or a seat. A seat holds exactly one of a player or an NPC partner, with a seat number from 1 to 4.
- [ ] **Wallet lists agree.** `WALLET_REASONS` in `backend/server/wallet.py` and the INSERT into `wallet_reasons` in the migration hold the same eight (reason, direction) pairs in the same order. `STARTING_BALANCE` is 0 and equals the default balance of a new wallet. The `ref` is required by the ledger. `backend/server/tests/test_wallet_matches_migration.py` reads the SQL and checks this.
- [ ] **Settings and flags.** The server reads exactly the seven names in the Settings table (not the `VITE_` row). With an empty environment it uses `local`, demo mode off and every flag off. A bad `APP_ENV`, a bad `DEMO_MODE` or an unknown flag name is refused with a clear message.
- [ ] **Sign-in.** A request with no token, or a bad one, gets 401. A good token gives the player (the user id only). The tests use a fake instead of Supabase.
- [ ] **Adapter pattern.** A second call inside the time-to-live does not fetch again. A failed fetch gives the old data, then the recorded fallback. With nothing left it gives 503. No test uses the network.
- [ ] **The API starts.** With `cp .env.example .env` done, `cd backend && uv run --env-file ../.env uvicorn main:app --port 8000` starts, `GET /api/health` answers `status: ok`, and `GET /api/config` shows every flag off. In production the interactive docs (`/api/docs`) are not served.
- [ ] **No secrets.** `.env.example` has no values. `git check-ignore .env` prints `.env`. The secret check in section 6 of [How we write code](../docs/ENGINEERING.md#6-safety-checklist) prints nothing. No secret is in a `VITE_` variable.
- [ ] **Docs.** `docs/ENGINEERING.md`, `docs/ARCHITECTURE.md`, `docs/INTERFACES.md`, `specs/_TEMPLATE.md`, this spec and `.env.example` exist. Every relative link in them resolves to a file that exists.
- [ ] **Decisions recorded.** The [decision log](../docs/DECISIONS.md) has entries for the hosting and services choice, for rules living on the server, for the play-money wallet, for who writes saves, for where the display name comes from and for the unique `ref` that makes money calls safe to repeat.
- [ ] No secrets, private data or generated caches are in the diff.
- [ ] A different human teammate has reviewed and approved the current change.

## Tests to write first

Tests live in `backend/server/tests/` and use fakes, never the network. Shared helpers (a fake clock, ready-made settings, `assert_error`) are in `backend/server/tests/helpers.py`.

| Test file | What it proves |
|---|---|
| `test_settings.py` | An empty environment gives safe defaults. Every name is read. A bad `APP_ENV`, `DEMO_MODE` or flag name is refused. The secret key never shows in `repr` or `str`. |
| `test_flags.py` | The flag names are exactly the agreed seven. All are off by default. Only named flags switch on. A typo is caught. |
| `test_app.py` | Every URL starts with `/api`. Every failure has the standard error shape and leaks nothing. The Vercel entry file exposes the app. Importing `server.app` does not read the environment. The interactive docs are served locally and in preview, and answer 404 in production. |
| `test_health_and_config.py` | `GET /api/health` and `GET /api/config` answer as agreed and contain no secrets. |
| `test_adapters_base.py` | The cache, the timeout, the stale value, the recorded fallback and the 503 behave as described. |
| `test_adapters_example.py` | The worked example follows the pattern with no network. |
| `test_auth.py` | No token, a badly formed header and a refused token give 401. A good token gives the player. Supabase down, too slow or answering strangely gives 503, and so does a server where login is not set up. A good answer is remembered briefly. The raw token is never stored and never logged. A refused token is logged with its status only. The player is only the user id, even when the login details hold a name. |
| `test_supabase_admin.py` | The secret key goes in the right headers. A database function call is a POST to the right address, and a table read is a GET that sends no body and cannot change anything. Insufficient funds becomes its own error, matched exactly (the same word inside another error does not count). A repeated ledger row becomes `already_applied`. Other database errors hide the database's text. The secret key never shows in `repr` or in logs. Function names that could change the address are refused. |
| `test_keepalive.py` | `GET /api/keepalive` answers 401 with no secret or a wrong one (compared with `hmac.compare_digest`), 503 `not_configured` when `CRON_SECRET` or a Supabase setting is missing, 200 after three one-row reads, and 503 `database_unavailable` when a read fails. No secret and no database text appear in answers or logs. |
| `test_wallet.py` | `STARTING_BALANCE` is 0. `WALLET_REASONS` is exactly the eight (reason, direction) pairs in order, every direction is `earn`, `spend` or `either`, and `starting_grant` is gone. Zero, a number that is not whole, `True`/`False`, an amount over the limit, an unknown reason, a purchase that adds coins (buying -3 buildings) and a reward or sale that takes coins away are refused before any database call, and a bad amount inside a route answers 422 `invalid_transaction`. A missing or blank `ref` is refused before any database call, and the `ref` cannot be left out of the call at all. A good change reaches the database function and returns the new balance, also the entry kit with its fixed `ref`. |
| `test_wallet_matches_migration.py` | Reads every migration as text and checks that the INSERT into `wallet_reasons` equals `WALLET_REASONS` (same pairs, same order, every reason with a description), that the table allows exactly the three directions, that the ledger's `reason` is a foreign key to `wallet_reasons`, the default balance of a wallet, the longest `ref`, that the ledger refuses a missing or blank `ref`, the one-row-per-`ref` index (for every row) and the parameters of the money function (with no default for `ref`). The reader accepts capital letters and extra spaces. Two guard tests fail when a migration inserts reasons in a shape the reader cannot read, or when it updates, deletes or truncates the reasons. It also checks that the sign-up trigger writes no ledger row, gives the placeholder name and never reads the login details. |
| Database checks | No pytest file runs the database itself. The migration is checked by the parse command, by `test_wallet_matches_migration.py` (which reads the SQL as text) and by the manual test plan in [supabase/README.md](../supabase/README.md#manual-test-plan), which a teammate runs on a Supabase project. The plan covers the placeholder names and the starting balance of 0, row-level security, the sequence, the narrower rights of the server, the wallet function, the direction of each reason, repeated refs, the eight reasons, and that a player cannot read another crew or insert a seat. |

## Contracts touched

- [x] API endpoints: `GET /api/health`, `GET /api/config` and `GET /api/keepalive` (with `Authorization: Bearer <CRON_SECRET>`, called only by the cron). The sign-in header format `Authorization: Bearer <token>`. The standard error shape `{"error": {"code": "...", "message": "..."}}`.
- [ ] Browser events: none.
- [x] Database tables, policies and functions: `profiles`, `saves`, `wallets`, `wallet_reasons`, `wallet_transactions`, `crews`, `crew_seats`, their policies and privileges, `apply_wallet_transaction`, `is_crew_member`. The policy and grant matrix is in [supabase/README.md](../supabase/README.md#who-may-do-what).
- [x] Shared lists: the eight wallet reasons and their direction (earn, spend or either), the seven feature flags, the setting names and `STARTING_BALANCE`.
- [ ] Content format: none.
- [x] Decisions to record in `docs/DECISIONS.md`: the hosting and services choice, rules living on the server, the play-money wallet (starting balance 0, reasons as a table with directions), saves written only by the server, the display name generated on the server and never taken from the login, crews with NPC partners, and the unique `ref` per player and reason.

## Owner and reviewer

- **Responsible teammate:** the teammate who opens the F0 pull request. The scope was decided with Nils on 2026-11-05.
- **Coding agents used:** several, each given separate files to write. The responsible teammate stays responsible for all of it.
- **Reviewer (a different human teammate):** to be named in the pull request.
- **Last updated:** 2026-11-05
