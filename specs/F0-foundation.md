# F0 Foundation

> **What this is:** the shared base that every later package builds on. It sets hosting, rules on the server, the play-money wallet, settings and feature flags, the pattern for outside data, sign-in, the first database migration and the engineering rules.
>
> **Who uses it:** the whole team and every coding agent. Every other package starts from what F0 delivers.

- **Status:** proposed. The scope was decided with Nils on 2026-11-05. It counts as accepted when a different teammate has reviewed it and it is merged (the same path as decision D001 in the [decision log](../docs/DECISIONS.md)).
- **Branch:** `chore/foundation`
- **Issue and pull request:** to be added when the pull request is opened

## Why

The Great Plot Twist extends Nils' text mystery Plot Twist (an intro on a lighthouse island, then a shared world of islands) into a light-3D game in the browser. Four of us, new to programming and working with coding agents, will add features such as a stock exchange, prediction markets, sports predictions and arena stakes.

Without a shared base, each feature would invent its own way to store data, check a login and move coins. Coins could be duplicated or lost, and nobody could explain the result line by line. F0 settles the basics first: where the code runs, where the rules live, how money works, how unfinished features stay hidden, how we reach outside services and how we write and test code.

Rules in Python on the server can be tested with pytest, which the course already uses. That is why the rules live there and not in the browser.

## What

### Decisions

| Topic | Decision |
|---|---|
| Game | "The Great Plot Twist": a light-3D, low-poly browser game that extends the text mystery Plot Twist. |
| Hosting | Vercel Hobby serves the static Vite build and a Python API (FastAPI) from one project. The API entry file is `api/index.py`. |
| Backend services | Supabase Free: login with GitHub sign-in (Supabase Auth), Postgres with row-level security, and realtime. |
| Where rules live | In Python on the server, tested with pytest (`uv run pytest`, as in the course). The database guarantees integrity with constraints and one atomic wallet function. The browser only displays and sends intents. |
| Money | Play money only. Coins cannot be bought or cashed out. Every player starts with `STARTING_BALANCE = 1000` coins. One wallet and one ledger serve every money feature: stock exchange, prediction markets, sports predictions, arena stakes. Players can never write balances. Only the server, with the secret key, changes them, through one atomic database function. |
| Saves | A player can read their own save. Only the server writes it, with the secret key, because progress is decided on the server (see [Saves](#saves)). |
| Display name | The name other players see is `profiles.display_name`, read from the database. The login check carries only the verified user id. |
| Browser client | Three.js and Vite, plain JavaScript, built by package G1 in `src/`, with Vitest tests in `tests/`. G1 is not part of F0. |

### What F0 delivers

| Path | What it is |
|---|---|
| `api/index.py` | Vercel entry only. It builds the app with `create_app()` from `server/app.py` and hands it to Vercel. |
| `server/app.py` | `create_app()` builds the FastAPI app. Every URL starts with `/api`. The interactive docs are not served in production. Importing the file builds nothing. |
| `server/settings.py` | Reads the settings once at start-up. The only file in the server that reads the environment. |
| `server/flags.py` | The seven feature flags, all off by default. A typo in `FEATURE_FLAGS` stops the server at start-up. |
| `server/errors.py` | One JSON shape for every failed request, with no stack traces and no secrets. |
| `server/clock.py` | "What time is it?" in one place, so tests can use a fake clock. |
| `server/auth.py` | The sign-in dependency (`PlayerDep`). It turns `Authorization: Bearer <token>` into a player (the verified user id), or answers 401. |
| `server/supabase_admin.py` | Server-only calls to database functions with the secret key. |
| `server/wallet.py` | The wallet rules: `STARTING_BALANCE`, `REASONS` with their direction (`SPEND_REASONS`, `EARN_REASONS`), checking a coin change, and asking the database to apply it. |
| `server/routes/health.py`, `server/routes/config.py` | `GET /api/health` and `GET /api/config` (which features are on). |
| `server/adapters/base.py`, `server/adapters/example.py` | The pattern for outside data (cache, timeout, fallback) and a worked example to copy. |
| `server/tests/` | pytest tests for everything above. |
| `supabase/migrations/20261106000000_foundation.sql` | The first migration: `profiles`, `saves`, `wallets` and `wallet_transactions` (the ledger), their row-level security policies and table privileges, the atomic function `apply_wallet_transaction`, and a trigger that creates a new player's starter rows. The ledger checks the direction of every reason and holds one row per player, reason and `ref`. |
| `supabase/README.md` | How to apply the migration, the policy matrix ("Who may do what") and a manual test plan. See [supabase/README.md](../supabase/README.md). |
| `pyproject.toml`, `uv.lock`, `.python-version`, `.gitignore` | Python packages and versions, and the files Git must never track. |
| `docs/ENGINEERING.md` | The engineering rulebook: [How we write code](../docs/ENGINEERING.md). |
| `specs/_TEMPLATE.md`, `specs/F0-foundation.md` | The spec template and this spec. |
| `.env.example` | Every setting name with an empty value, and a comment saying whether it is safe for the browser. |

### Settings

The server reads these names, and only these. See [.env.example](../.env.example) for the template.

| Name | Meaning | Safe for the browser? |
|---|---|---|
| `APP_ENV` | `local`, `preview` or `production`. Empty means `local`. | Yes, not secret |
| `SUPABASE_URL` | Address of the Supabase project. | Yes |
| `SUPABASE_PUBLISHABLE_KEY` | Key the browser may use. Row-level security protects the data. | Yes |
| `SUPABASE_SECRET_KEY` | Server-only key that skips row-level security. | **No, server only** |
| `DEMO_MODE` | `true` or `false`. Empty means `false`. | Yes, not secret |
| `FEATURE_FLAGS` | Comma-separated flag names to switch on. | Yes, not secret |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Copies of the two Supabase values above, for the Vite client. | Yes |

### Feature flags

All off by default. A flag is on only when `FEATURE_FLAGS` names it. Each flag switches on one later feature, and that feature's own spec says exactly what it does.

`market`, `predictions`, `sports`, `arena`, `raid`, `live_presence`, `companion_llm`

### Wallet

- **One wallet and one ledger** for every money feature. `wallets` holds the balance (never below 0). `wallet_transactions` holds one row for every change, each with a reason.
- **Players only read.** A signed-in player may read their own wallet and ledger rows and nothing more. There is no policy that lets a player insert, update or delete money rows.
- **Only the server writes.** The server, with the secret key, calls `apply_wallet_transaction`. It checks the balance, changes it and writes the ledger row in one step, so two requests at the same moment cannot spend the same coins twice. If the balance would drop below 0, nothing changes and the call fails with `insufficient_funds`.
- **The ledger is append-only.** The server may read the ledger and add rows through the function. No role may update or delete a ledger row, and nobody may create or delete a wallet by hand. The counter behind the ledger's `id` is closed to every role.
- **Python checks first.** `server/wallet.py` refuses bad numbers, unknown reasons and a wrong direction before any call to the database. A refusal is a 422 `invalid_transaction`.
- **Every reason has a direction.** A purchase or a stake (`market_buy`, `prediction_stake`, `sports_stake`, `arena_stake`) always takes coins away, so its amount is negative. A grant, a sale or a payout (`starting_grant`, `market_sell`, `prediction_payout`, `sports_payout`, `arena_payout`) always adds coins, so its amount is positive. Only `admin_adjust` may go either way. This stops a bug such as buying -3 shares from paying the player. The server also refuses `starting_grant`, because only the sign-up trigger writes it. The database checks the same rule, so even a bug in Python cannot hand out coins.
- **Repeated requests.** Every money call passes a `ref` that stays the same when the request is repeated: an order id made once per click, or, for a payout, the server's own record such as the duel id. The ledger holds each player, reason and `ref` only once. A repeat changes nothing and the wallet answers 409 `already_applied`. A 503 means the outcome is unknown, because the call may have been saved before it timed out. Look the `ref` up in the ledger before you retry, refund or charge again.
- **New players** get a profile, a wallet with `STARTING_BALANCE` coins, a `starting_grant` ledger row and an empty save, created by a trigger when they sign up.
- **The reasons** are the same list, in the same order, in Python (`REASONS`) and in SQL. New reasons are added at the end, in both places, in one pull request.

| # | Reason | Used by | Amount |
|---|---|---|---|
| 1 | `starting_grant` | The sign-up trigger only | positive |
| 2 | `market_buy` | Stock exchange | negative |
| 3 | `market_sell` | Stock exchange | positive |
| 4 | `prediction_stake` | Prediction markets | negative |
| 5 | `prediction_payout` | Prediction markets | positive |
| 6 | `sports_stake` | Sports predictions | negative |
| 7 | `sports_payout` | Sports predictions | positive |
| 8 | `arena_stake` | Arena stakes | negative |
| 9 | `arena_payout` | Arena stakes | positive |
| 10 | `admin_adjust` | A manual correction by an admin | either |

### Saves

- **Players only read.** A signed-in player may read their own save and nothing more. They cannot insert, update or delete it. The only thing the browser writes straight to the database is a player's own `profiles.display_name`.
- **Only the server writes.** Progress is decided on the server, so the server writes saves with the secret key. The sign-up trigger creates the empty save. F0 has no route that writes a save: the first package that needs saved progress adds one that checks the data first. The database still keeps a save a JSON object of at most about 200 KB.

### Outside data (the adapter pattern)

`server/adapters/base.py` wraps one outside call in a `CachedSource`. A call to `get()` tries, in order: fresh cached data, a live fetch, the last good data, a recorded fallback saved in our code, and then gives up with a 503. The outside service is called at most once per time-to-live, even when many players ask at once. This holds per running server instance: Vercel may run several at once, and a cold start begins with an empty cache. So leave headroom (for example twice the minimum time-to-live) and do not rely on it for a hard daily quota. Every result says where it came from and when it was fetched.

### Sign-in

The browser signs in with GitHub through Supabase and receives a token. It sends the token in the `Authorization: Bearer` header. `server/auth.py` asks Supabase whose token it is, remembers a good answer briefly (60 seconds, so a player who just signed out or was deleted may still be accepted for that long), and gives the route a `Player` (the verified user id). The name other players see is `profiles.display_name`, read from the database. It is not taken from the token, because a player can edit their own login details. A missing or bad token gives 401, and every refused token leaves one log line with Supabase's status (never the token). A server without Supabase set up, or a Supabase that cannot be reached, gives 503.

### Folder map

`api/`, `server/`, `server/tests/`, `supabase/migrations/`, `docs/`, `specs/`, `content/`, `src/` and `tests/`. Who owns which folder is in [How we write code, section 2](../docs/ENGINEERING.md#2-repository-map).

## Out of scope

- **The features themselves.** Stock exchange, prediction markets, sports predictions, arena, raid, live presence and the companion each come in a later package, behind their flag.
- **The browser client** in `src/` and `tests/` (package G1). That includes the follow-up that lets the Vite dev server pass `/api` on to port 8000 (see [How we write code, section 3](../docs/ENGINEERING.md#3-commands)).
- **Screens** for sign-in or the wallet in the browser.
- **Real outside data sources.** F0 gives the pattern and one worked example with made-up data.
- **Setting up the real services.** A teammate does these by hand after the merge, outside the repository. No agent ever gets the secret key.
  - Create the Supabase project and the Vercel project.
  - Set up GitHub sign-in in Supabase.
  - Enter the real keys in Vercel and in a private `.env`.
  - Allow only GitHub sign-in in Supabase: GitHub on, Email off, Anonymous sign-ins off (see [supabase/README.md](../supabase/README.md#first-allow-only-github-sign-in)).
  - Apply the migration to the Supabase project.
  - Sign in once on the preview site after setting the keys. A wrong or rotated publishable key makes Supabase refuse every token, so every player would see "Your login is not valid".
- **Automatic checks on GitHub (CI).** CONTRIBUTING.md says to require them once real CI exists.
- **Real money.** Never. No payments, no cash-out, no prices in real currency.
- **Story content** in `content/`. Its format is decided by the first story package.
- **README changes.** Pointing the README at the commands in [How we write code](../docs/ENGINEERING.md#3-commands) is a separate one-line change to `README.md`.

**Known limits**

- **Not tried on Vercel yet.** The API runs and passes its tests on a laptop. Whether `GET /api/health` is reachable on a Vercel deployment depends on how Vercel routes `/api/...` requests to `api/index.py`. It may need a `vercel.json` setting or a different entry setup. The first deploy checks this, and the result goes in the [decision log](../docs/DECISIONS.md).
- **Repeated requests.** The ledger refuses a second row with the same player, reason and `ref`, but only when a `ref` is passed. A money call without one is not protected, so every money feature must pass a `ref` that stays the same when the request is repeated, and say in its own spec where it comes from. A 503 from the wallet means the outcome is unknown: the coins may have moved before the call timed out.
- **Saves are read-only for players.** The browser cannot write its own progress yet. If the team prefers browser-written saves, a new migration can add the two policies and the privileges back, together with a written rule that nothing in a save may change coins, prices, stakes or what other players see.

## Done when (acceptance checks)

- [ ] **Server tests pass.** `uv sync`, then `uv run pytest`: every test passes and none fails. The summary line is pasted in the pull request.
- [ ] **Lint is clean.** `uv run ruff check .` prints `All checks passed!`.
- [ ] **SQL parses.** Every file in `supabase/migrations/` is accepted by a PostgreSQL parser. One way to check is the `pglast` command in [How we write code, recipe 4.2, step 9](../docs/ENGINEERING.md#42-add-a-database-table). The pull request says how it was checked.
- [ ] **Policy matrix documented.** The "Who may do what" section of [supabase/README.md](../supabase/README.md#who-may-do-what) covers `profiles`, `saves`, `wallets` and `wallet_transactions` for a visitor who is not signed in, a signed-in player and the server. It matches the migration: players only read the wallet, the ledger and their save, and a visitor who is not signed in gets nothing.
- [ ] **Money is guarded.** In the migration, only `service_role` may run `apply_wallet_transaction`, and no policy lets a player write to `wallets`, `wallet_transactions` or `saves`. The server cannot update or delete a ledger row or insert or delete a wallet, and no role can move the ledger's id counter.
- [ ] **Wallet lists agree.** `REASONS` in `server/wallet.py` and the reason list in the migration hold the same ten names in the same order, and `SPEND_REASONS` and `EARN_REASONS` match the two direction checks. `STARTING_BALANCE` is 1000 and equals the default balance of a new wallet. `server/tests/test_wallet_matches_migration.py` reads the SQL and checks this.
- [ ] **Settings and flags.** The server reads exactly the names in the Settings table. With an empty environment it uses `local`, demo mode off and every flag off. A bad `APP_ENV`, a bad `DEMO_MODE` or an unknown flag name is refused with a clear message.
- [ ] **Sign-in.** A request with no token, or a bad one, gets 401. A good token gives the player (the user id only). The tests use a fake instead of Supabase.
- [ ] **Adapter pattern.** A second call inside the time-to-live does not fetch again. A failed fetch gives the old data, then the recorded fallback. With nothing left it gives 503. No test uses the network.
- [ ] **The API starts.** With `cp .env.example .env` done, `uv run --env-file .env uvicorn api.index:app --port 8000` starts, `GET /api/health` answers `status: ok`, and `GET /api/config` shows every flag off. In production the interactive docs (`/api/docs`) are not served.
- [ ] **No secrets.** `.env.example` has no values. `git check-ignore .env` prints `.env`. The secret check in section 6 of [How we write code](../docs/ENGINEERING.md#6-safety-checklist) prints nothing. No secret is in a `VITE_` variable.
- [ ] **Docs.** `docs/ENGINEERING.md`, `specs/_TEMPLATE.md`, this spec and `.env.example` exist. Every relative link in them resolves to a file that exists.
- [ ] **Decisions recorded.** The [decision log](../docs/DECISIONS.md) has entries for the hosting and services choice, for rules living on the server, for the play-money wallet, for who writes saves, for where the display name comes from and for the unique `ref` that makes money calls safe to repeat.
- [ ] No secrets, private data or generated caches are in the diff.
- [ ] A different human teammate has reviewed and approved the current change.

## Tests to write first

Tests live in `server/tests/` and use fakes, never the network. Shared helpers (a fake clock, ready-made settings, `assert_error`) are in `server/tests/helpers.py`.

| Test file | What it proves |
|---|---|
| `test_settings.py` | An empty environment gives safe defaults. Every name is read. A bad `APP_ENV`, `DEMO_MODE` or flag name is refused. The secret key never shows in `repr` or `str`. |
| `test_flags.py` | The flag names are exactly the agreed seven. All are off by default. Only named flags switch on. A typo is caught. |
| `test_app.py` | Every URL starts with `/api`. Every failure has the standard error shape and leaks nothing. The Vercel entry file exposes the app. Importing `server.app` does not read the environment. The interactive docs are served locally and in preview, and answer 404 in production. |
| `test_health_and_config.py` | `GET /api/health` and `GET /api/config` answer as agreed and contain no secrets. |
| `test_adapters_base.py` | The cache, the timeout, the stale value, the recorded fallback and the 503 behave as described. |
| `test_adapters_example.py` | The worked example follows the pattern with no network. |
| `test_auth.py` | No token, a badly formed header and a refused token give 401. A good token gives the player. Supabase down, too slow or answering strangely gives 503, and so does a server where login is not set up. A good answer is remembered briefly. The raw token is never stored and never logged. A refused token is logged with its status only. The player is only the user id, even when the login details hold a name. |
| `test_supabase_admin.py` | The secret key goes in the right headers. A database function call is a POST to the right address. Insufficient funds becomes its own error, matched exactly (the same word inside another error does not count). A repeated ledger row becomes `already_applied`. Other database errors hide the database's text. The secret key never shows in `repr` or in logs. Function names that could change the address are refused. |
| `test_wallet.py` | `STARTING_BALANCE` is 1000. `REASONS` is exactly the ten names in order, and every reason is a spend reason, an earn reason or `admin_adjust`. Zero, a number that is not whole, `True`/`False`, an amount over the limit, an unknown reason, a purchase that adds coins (buying -3 shares), a sale that takes coins away and `starting_grant` are refused before any database call, and a bad amount inside a route answers 422 `invalid_transaction`. A good change reaches the database function and returns the new balance. |
| `test_wallet_matches_migration.py` | Reads the migration as text and checks that its reason list, its two direction lists, the default balance of a wallet, the longest `ref`, the one-row-per-`ref` index and the parameters of the money function match the Python. |
| Database checks | No pytest file runs the database itself. The migration is checked by the parse command, by `test_wallet_matches_migration.py` (which reads the SQL as text) and by the manual test plan in [supabase/README.md](../supabase/README.md#manual-test-plan), which a teammate runs on a Supabase project. The plan covers row-level security, the sequence, the narrower rights of the server, the wallet function, the direction of each reason, repeated refs and the ten reasons. |

## Contracts touched

- [x] API endpoints: `GET /api/health` and `GET /api/config`. The sign-in header format `Authorization: Bearer <token>`. The standard error shape `{"error": {"code": "...", "message": "..."}}`.
- [ ] Browser events: none.
- [x] Database tables, policies and functions: `profiles`, `saves`, `wallets`, `wallet_transactions`, their policies and privileges, `apply_wallet_transaction`. The policy matrix is in [supabase/README.md](../supabase/README.md#who-may-do-what).
- [x] Shared lists: the ten wallet reasons and their direction (spend, earn or either), the seven feature flags, the setting names and `STARTING_BALANCE`.
- [ ] Content format: none.
- [x] Decisions to record in `docs/DECISIONS.md`: the hosting and services choice, rules living on the server, the play-money wallet, saves written only by the server, the display name read from the database, and the unique `ref` per player and reason.

## Owner and reviewer

- **Responsible teammate:** the teammate who opens the F0 pull request. The scope was decided with Nils on 2026-11-05.
- **Coding agents used:** several, each given separate files to write. The responsible teammate stays responsible for all of it.
- **Reviewer (a different human teammate):** to be named in the pull request.
- **Last updated:** 2026-11-05
