# Supabase database

This folder holds the database of The Great Plot Twist. Supabase gives us the login (GitHub sign-in), a Postgres database and realtime. Everything the game must remember lives here: who the players are, their saved progress, their coins and their crews.

Play money only: coins cannot be bought, cashed out or exchanged for real prizes. Every player starts with 0 coins. The first coins come later, from the intro entry kit (the `kit_grant` reason).

The browser only reads from this database. Every write comes from our Python server with the secret key.

| File | What it is |
|---|---|
| [migrations/20261106000000_foundation.sql](migrations/20261106000000_foundation.sql) | The first migration: seven tables, the security rules, the rights of each database role and four functions. Every table, column and policy is explained inside the file. |
| [migrations/20261106010000_island_exchange.sql](migrations/20261106010000_island_exchange.sql) | The second migration, for the first version of the Island Exchange (package L4): three wallet reasons, three tables and two functions. It was merged but **never applied**, and the third migration removes its tables and functions again. It is never edited, because it is merged. Run it after the first. |
| [migrations/20261106090000_exchange_leverage.sql](migrations/20261106090000_exchange_leverage.sql) | The third migration, for the Island Exchange version 2 (real prices, 10x positions): two wallet reasons, two tables and three functions, and it removes what the second one added (except the reasons). Run it after the second. See [The Island Exchange migration](#the-island-exchange-migration). |

## Project settings this migration relies on

Our Supabase project is in West EU (Ireland). These settings were agreed on 5 November 2026:

| Setting | Our value | What it means for the database |
|---|---|---|
| Data API | On | The browser and the server reach the tables over the web. So every table needs both locks (rights and row-level security) from the start. |
| Automatically expose new tables | **Off** | A new table or function has **no rights for anybody** until a migration grants them. That is why the migration grants every right by hand. A new table needs explicit grants too. |
| Enable automatic RLS | On | A table that someone creates without row-level security gets it switched on automatically. Our migration switches it on by hand for every table as well. |
| Login | GitHub only. Email and anonymous sign-ins are off. | See [First: allow only GitHub sign-in](#first-allow-only-github-sign-in). |
| Supabase GitHub integration | Not used | We apply migrations by hand (see below). |

The migration does not depend on the second setting. It first takes every right away from `public`, `anon`, `authenticated` and `service_role`, and then grants back exactly what is needed. It gives the same result on a project where new tables are exposed automatically.

## What the migration creates

| Name | What it is | Who changes it |
|---|---|---|
| `profiles` | One row per player: the display name. No e-mail address, no login name. | Created at sign-up. Then only the server writes it. The player cannot rename themselves. |
| `saves` | One row per player: game progress as JSON, at most about 200 KB. | Only the server. The player may read their own save. |
| `wallets` | One row per player: the coin balance. Never below 0. Starts at 0. | Only `apply_wallet_transaction()`. |
| `wallet_reasons` | The list of reasons a balance may change, each with a direction. | Only a new migration. Nobody changes it at run time. |
| `wallet_transactions` | The ledger: one row for every change to a wallet. Every row has a `ref`, and the same player, reason and `ref` can appear only once. | Only `apply_wallet_transaction()`. |
| `crews` | One row per crew: a team of up to four seats, with a mode (`solo` or `crew`) and a status (`forming`, `active` or `finished`). | Only the server. |
| `crew_seats` | One row per taken seat: a player or an NPC partner (a crew mate run by the game). | Only the server. |
| `apply_wallet_transaction()` | The only way coins move. One step: check the reason and its direction, check the balance, change it, write the ledger row. Fails with `unknown_reason`, `wrong_direction`, `insufficient_funds` or `wallet_not_found`. A `ref` is required: a call without one does not exist. The ledger refuses a blank or repeated `ref`, and then nothing changes. | Run by the server only. |
| `is_crew_member()` | Answers "does the signed-in player sit in this crew?". The read rules for `crews` and `crew_seats` use it. | Run by the database for signed-in players. |
| `handle_new_user()` | Runs at sign-up (trigger `on_auth_user_created`). Creates the profile with a placeholder name, a wallet with 0 coins and an empty save. It writes no ledger row. | Runs by itself. |
| `touch_updated_at()` | Sets `updated_at` to the server time on `saves`, `wallets` and `crews`. | Runs by itself. |

### The wallet reasons

The ledger accepts only the reasons in `wallet_reasons`, in this order. The Python code (`WALLET_REASONS` in `backend/server/wallet.py`) has the same pairs.

| Reason | Direction | What it is for |
|---|---|---|
| `kit_grant` | earn | Coins that come with the entry kit the intro gives a new player. |
| `clue_reward` | earn | Coins for a clue a player found or pinned. |
| `mystery_reward` | earn | Coins for a deduction or for solving the whole mystery. |
| `event_reward` | earn | Coins from a special event in the world. |
| `cargo_sale` | earn | Coins from selling cargo. |
| `clue_purchase` | spend | Coins paid to buy a clue. |
| `building_purchase` | spend | Coins paid to build on a home islet. |
| `admin_adjust` | either | A manual correction by an admin. |
| `market_buy` | spend | Coins paid for shares bought on the Island Exchange. *Added by the second migration. Version 1, never used, kept because a reason is never removed.* |
| `market_sell` | earn | Coins received for shares sold on the Island Exchange. *Added by the second migration. Version 1, never used, kept because a reason is never removed.* |
| `market_fee` | spend | Fee paid on the Island Exchange: the opening fee and the closing fee of a position. *Added by the second migration, used again by the third.* |
| `market_stake` | spend | Coins put into an Island Exchange position (the stake). *Added by the third migration.* |
| `market_payout` | earn | Coins paid out when an Island Exchange position is closed. *Added by the third migration.* |

There are 13 reasons. The first eight come from the foundation migration, the next three from the second migration and the last two from the third. The direction says which way the coins move. **earn** adds coins, so the amount must be above 0. **spend** takes coins away, so the amount must be below 0. **either** may go both ways, but never 0. `apply_wallet_transaction()` looks the reason up and checks the direction before it touches the balance, and the Python code checks the same rule even earlier. The `reason` column of the ledger is also a foreign key to `wallet_reasons`, so an unknown reason cannot get into the ledger by any route.

The test `backend/server/tests/test_wallet_matches_migration.py` reads the migration and fails if its reasons, directions or starting balance differ from the Python code.

The ledger holds one row per player, reason and `ref`. Every money call needs a `ref`, such as an order id. The ledger column cannot be empty, the ref cannot be blank, and the money function has no default for it, so a call without a `ref` does not exist. If the same request arrives twice, the second call fails with a unique violation and changes nothing, so nobody pays or is paid twice. The server turns that failure into the answer `already_applied`. The entry kit always uses the same `ref`, so a player gets it only once.

### Display names

The display name is 2 to 24 characters from A-Z, a-z, 0-9, space, underscore, dot and hyphen, with no space at the start or end. At sign-up every player gets a neutral placeholder: `Captain-` plus the first 6 characters of their id, for example `Captain-3fa85f`. The name **never** comes from the GitHub login or any other login detail, because names appear on a projector. A later package (A2) generates real captain names on the server. Players cannot change their name, because the browser has no right to write to `profiles`.

### Crews and seats

A crew has up to four seats (numbered 1 to 4). Every seat that is taken holds **either** a player (`player_id`) **or** an NPC partner (`npc_id`), never both and never nobody. An NPC partner is a crew mate that the game runs. That is how the game works for one player alone: the player sits in seat 1 and NPC partners fill the other seats. A seat that nobody holds has no row. An `npc_id` is 2 to 40 characters: a-z, 0-9 and underscore.

A player can read a crew and its seats only while they sit in that crew. The rule uses the small helper `is_crew_member()`. The helper exists so that the rule for `crew_seats` does not have to read `crew_seats` through its own rule, which would never end. Only the server creates crews and seats.

Two things to know:

- **One active crew per player** is enforced by the server, not by the database (for now).
- If a player is deleted, their seat row is deleted with them, and the seat is free again. If the player who created a crew is deleted, the whole crew and all its seats are deleted.

## The Island Exchange migration

`migrations/20261106090000_exchange_leverage.sql` is the database part of the Island Exchange, version 2: real company prices and 10x positions (see [INTERFACES.md, section 2](../docs/INTERFACES.md#the-island-exchange-package-l4), the spec [specs/L4-exchange-v2.md](../specs/L4-exchange-v2.md) and decision [D017](../docs/DECISIONS.md)). Every investment is a **position**: a stake of coins at 10x, rising or falling. If the price moves 10 % against a position, the stake is used up and the position closes by itself at zero. Run it **after** the first two migrations, because it uses the wallet and the profiles from the first and the fee reason `market_fee` from the second. It is safe to run twice. Everything is explained in the file itself.

**It removes the first version of the Exchange.** That version (`market_bases`, `market_positions`, `market_trades`, `market_trade()` and `market_set_base()`) was merged but its file was never applied, so its tables hold no real data. The third migration starts with a **guard**: if the old table `market_trades` holds any row, the file stops with `v1_market_data_present` before it changes anything, and a person decides. Otherwise it drops the old functions and tables. The new tables have new names (`exchange_...`), so dropping an old name can never touch new data, even when the file runs twice. The wallet reasons `market_buy` and `market_sell` stay in the list, unused.

| Name | What it is | Who changes it |
|---|---|---|
| `exchange_positions` | One row per position: the company, the side (`rising` or `falling`), the price mode (`live` or `replay`), the stake, the entry price, the zero point (worked out by the database: 90 % of the entry price for a rising position, 110 % for a falling one), the opening fee and, once it is closed, the closing price, value, fee and ref. `status` is `open`, `closed` (the player closed it) or `zeroed` (the stake was used up). A zeroed position has a value and a fee of 0. Rows are never deleted, except together with their player. | Only `exchange_open_position()`, `exchange_close_position()` and `exchange_close_used_up()`. |
| `exchange_events` | The history: one row for every opening (`open`), closing by the player (`close`) and close at zero (`zero`), never edited. The ref can be used once per player, so a repeated click can never act twice. | Only the three functions. |
| `exchange_open_position()` | Opens a position. In one step: check that the arguments add up (see below), lock the player's wallet, refuse a repeated ref, refuse more than 20 open positions or more than 2000 coins of new stakes per game day, move the coins with `apply_wallet_transaction()` (`market_stake` and `market_fee`), write the position with its zero point, write the history row. It *returns* a refusal such as `{"status": "refused", "reason": "daily_cap", "coinsLeft": 380}` with nothing changed, and *raises* `insufficient_funds` (from the wallet), a repeated ref (code `23505`, message `already_applied`), `wallet_not_found`, or `bad_trade` when the server sent numbers that do not add up (a bug on the server side, not something a player can cause). | Run by the server only. |
| `exchange_close_position()` | Closes one position of a player. In one step: check the arguments, lock the wallet, refuse a repeated ref, lock the position by its id **and** its player, refuse a position that is not open or was opened on another price mode, work out the value and the closing fee itself, compare them with the numbers the server sent (`bad_trade` if they differ), pay the value (`market_payout`, only if above 0) and then take the fee (`market_fee`, only if above 0), mark the position closed (or zeroed, if the stake was used up) and write the history row. | Run by the server only. |
| `exchange_close_used_up()` | The automatic close. Takes a JSON array of prices (`company_id`, `price` as text, `quoted_at`, `mode`) and closes, in **one statement**, every open position of that company and price mode whose zero point a price has reached, if the position was opened **before** the price was quoted. At zero: no coins move, so it uses no wallet, and it writes one `zero` history row per position. Positions that another call is closing right now are skipped (`skip locked`), so two calls never wait for each other, never deadlock and never close one position twice. | Run by the server only. |

An opening writes two ledger rows with the same ref (`market:open:` plus the id the browser made for the click): `market_stake` and `market_fee`. A closing by the player writes `market_payout` (if the value is above 0) and `market_fee` (if the closing fee is above 0), with the ref `market:close:` plus the id of that click. A close at zero moves **0 coins** and the wallet refuses an amount of 0, so it writes no ledger row at all, only an event with the ref `market:zero:` plus the position id. The ledger accepts each player, reason and ref once, so the same ref is fine for two different reasons.

**Nobody can be left below zero.** The stake and the opening fee leave the wallet in the same transaction that creates the position, through `apply_wallet_transaction()`, which refuses a balance below 0. From then on a position can only *pay* coins into a wallet, never take them out: the value is never negative, and the closing fee is never more than the value. So the most a player can lose on one position is the stake plus the opening fee, however late the automatic close runs, and a gap past the zero point is still worth 0.

The price rules (where the prices come from, when a stock market is open, what a company shows) are **Python** (`backend/server/market/`). The database stores the positions and enforces what depends on a player's earlier actions, because only the database can see two requests at the same moment: the stake range, the daily cap and the open-position limit are passed to `exchange_open_position()` as arguments, so the numbers live in one place (`backend/server/market/positions.py`).

**The database also checks the arithmetic, so it stays right even if the Python has a bug.** The price itself is an input from the server, like the amount of a wallet change. But everything that follows from the price, the database recomputes:

- `exchange_open_position()` refuses (`bad_trade`, nothing changed) a missing argument, an unknown side or price mode, a price that is not above 0 or has more than 8 decimals, a leverage other than 10, a stake outside `p_min_stake` to `p_max_stake`, a fee rate other than 100 or 200 basis points, a fee that is not the fee rate of the stake rounded **up**, and a start of the game day more than a minute in the future (the daily cap would then count no stakes at all).
- `exchange_close_position()` works out the value itself: stake x (entry + 10 x move) / entry for a rising position and stake x (entry - 10 x move) / entry for a falling one, with move = price - entry. It multiplies first and takes the whole-number part once, at the very end (`div()`), so it always agrees with Python's `Decimal //`. The value never passes 1,000,000. If the top part is 0 or less, the stake is used up and the value is 0. The closing fee is the fee rate of the stake, rounded up, but never more than the value. If the value or the fee the server sent differ, it refuses with `bad_trade`.
- `exchange_close_used_up()` refuses (`bad_sweep`) a list that is not an array, an element with other keys than the four known ones, a price that is not above 0 with at most 8 decimals, a quote time that is not a real moment, a mode other than `live` or `replay`, or the same company and mode twice.

**Price modes.** A position opened on live prices is stored with `price_mode = 'live'`, one opened on the recorded demo day with `'replay'`. `exchange_close_position()` and `exchange_close_used_up()` only use prices of the position's own mode, so mixing the two on one database can never pay out at a recorded price.

After applying all three migrations, the three quick checks below show **nine** tables (the seven of the first migration and the two new ones) and **nine** policies, and there are **thirteen** wallet reasons. Run the Exchange checks at the end of the manual test plan.

## Apply the migration

Use one way. The file is safe to run twice, so nothing breaks if you run it again.

Apply it to a project that has none of our tables yet. If you ever tried an earlier draft of this file on a project, use a fresh project instead. The file only creates what is missing, so on top of an old draft it would stop with an error (the money function changed) or run without an error but keep the old tables, the old starting balance and the old rules.

### First: allow only GitHub sign-in

Every new user gets a wallet with 0 coins and a profile that all players can see, and the server accepts the login of any sign-in method that is switched on. So only the sign-in we chose may create users.

1. In the dashboard open **Authentication > Sign In / Providers**.
2. Switch **GitHub** on. A teammate sets up the GitHub app and pastes its keys into the dashboard only, never into this repository.
3. Switch **Email** off.
4. Keep **Anonymous sign-ins** off. An anonymous user counts as a signed-in player too.

### Option A: SQL editor (quickest)

1. Open your project in the Supabase dashboard.
2. Open **SQL Editor** and start a new query.
3. Paste the whole content of `migrations/20261106000000_foundation.sql`.
4. Click **Run**. Expected: a success message and no error.
5. Do the same with `migrations/20261106010000_island_exchange.sql` (the first Island Exchange file), in a new query, and then with `migrations/20261106090000_exchange_leverage.sql` (the Island Exchange version 2), in another new query. The order matters: the files start with a time stamp, so apply them oldest first. The third file removes the tables and functions of the second.

### Option B: Supabase CLI

Install the CLI first ([guide](https://supabase.com/docs/guides/local-development/cli/getting-started)). Then, from the repository root:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push --dry-run
supabase db push
```

- `YOUR_PROJECT_REF` is the short id in your project's dashboard address.
- `supabase link` asks for the database password you chose when you created the project. Type it into the terminal only. Never save it in a file of this repository.
- `--dry-run` only lists the migrations that would run. The CLI remembers which files it has already applied.
- If the CLI says it needs `supabase/config.toml`, run `supabase init` once. Keep secrets out of that file too.
- Optional, needs Docker: `supabase start` runs a local copy and `supabase db reset` rebuilds it from the migration files.

### Three quick checks after applying

Run all three in the SQL editor.

```sql
select relname as table_name, relrowsecurity as rls_on
from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r'
order by relname;
```

Expected: the seven tables `crew_seats`, `crews`, `profiles`, `saves`, `wallet_reasons`, `wallet_transactions`, `wallets`, each with `rls_on` = true. After all three migrations there are nine: also `exchange_events` and `exchange_positions` (the second migration adds `market_bases`, `market_positions` and `market_trades`, and the third removes them again).

```sql
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Expected: 7 policies, one on each table, and every `cmd` is `SELECT`. There is no policy that lets a player write. After all three migrations there are 9 (one more on each of the two new tables).

```sql
select grantee, table_name, string_agg(privilege_type, ', ' order by privilege_type) as rights
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
group by grantee, table_name
order by grantee, table_name;
```

Expected: no row for `anon`. For `authenticated`, 7 rows (one per table), and `rights` is `SELECT` in every row. After all three migrations: 9 rows.

### If someone signed in before you ran the migration

The sign-up trigger only fires for new users. An earlier user has no profile, wallet or save. Delete that user under **Authentication > Users** and sign in again.

## Who may do what

Every table has two locks. Both must say yes.

1. **Table privileges**: may this role use the table at all? Our project does not give any rights automatically, so each one is a `grant` in the migration.
2. **Row-level security (RLS)**: which rows may it see or change?

The three actors, and the database role behind each:

- **Visitor** (`anon`): someone who is not signed in.
- **Signed-in player** (`authenticated`): the browser, using the publishable key plus the player's login. It can only read.
- **Server** (`service_role`): our Python code on Vercel, using the secret key. It skips RLS.

| Table | Action | Visitor (`anon`) | Signed-in player (`authenticated`) | Server (`service_role`) |
|---|---|---|---|---|
| `profiles` | read | no access | all rows | yes |
| `profiles` | insert | no access | no access | yes |
| `profiles` | update | no access | no access | yes |
| `profiles` | delete | no access | no access | yes |
| `saves` | read | no access | own row | yes |
| `saves` | insert | no access | no access | yes |
| `saves` | update | no access | no access | yes |
| `saves` | delete | no access | no access | yes |
| `wallets` | read | no access | own row | yes |
| `wallets` | insert | no access | no access | no access (only the sign-up trigger makes a wallet) |
| `wallets` | update | no access | no access | yes * |
| `wallets` | delete | no access | no access | no access (a wallet goes only when its player is deleted) |
| `wallet_reasons` | read | no access | all rows | yes |
| `wallet_reasons` | insert | no access | no access | no access (a new reason arrives with a new migration) |
| `wallet_reasons` | update | no access | no access | no access |
| `wallet_reasons` | delete | no access | no access | no access |
| `wallet_transactions` | read | no access | own rows | yes |
| `wallet_transactions` | insert | no access | no access | yes * |
| `wallet_transactions` | update | no access | no access | no access (the ledger is append-only: rows disappear only when their player is deleted, by cascade) |
| `wallet_transactions` | delete | no access | no access | no access (the ledger is append-only: rows disappear only when their player is deleted, by cascade) |
| `crews` | read | no access | crews they sit in | yes |
| `crews` | insert | no access | no access | yes |
| `crews` | update | no access | no access | yes |
| `crews` | delete | no access | no access | yes |
| `crew_seats` | read | no access | seats of crews they sit in | yes |
| `crew_seats` | insert | no access | no access | yes |
| `crew_seats` | update | no access | no access | yes |
| `crew_seats` | delete | no access | no access | yes |
| `exchange_positions` | read | no access | own rows | yes |
| `exchange_positions` | insert | no access | no access | yes \*\* (through `exchange_open_position()`) |
| `exchange_positions` | update | no access | no access | yes \*\* (through `exchange_close_position()` and `exchange_close_used_up()`) |
| `exchange_positions` | delete | no access | no access | no access (rows go only with their player, by cascade) |
| `exchange_events` | read | no access | own rows | yes |
| `exchange_events` | insert | no access | no access | yes \*\* (through the three functions) |
| `exchange_events` | update, delete | no access | no access | no access (the history is append-only: rows disappear only when their player is deleted, by cascade) |

\* The database lets the server update `wallets` and add ledger rows directly, because `apply_wallet_transaction()` runs with the server's rights and needs both. Our rule is that the server does this only through that function. A direct update skips the ledger row, so the balance no longer matches the ledger. Reading a balance in Python and then writing a new one can lose coins when two requests arrive together. The function cannot. A direct ledger insert would also skip the direction check, because that check lives in the function (a table rule cannot look into `wallet_reasons`). The foreign key still refuses an unknown reason, and the table still refuses a missing or blank `ref`.

\*\* The database lets the server insert and update `exchange_positions` rows and add `exchange_events` rows directly, because the three functions run with the rights of the server. "Through `exchange_open_position()`" and the other function names in the table are our rule, not something the database enforces (the same pattern as `wallets` above). A direct write would skip the checks of the functions: the arithmetic, the limits, the repeat check and the wallet. Only the server holds that right, and the code never writes these tables directly.

Rows disappear from the ledger only when their player is deleted: deleting a player (a `profiles` row, or the user under Authentication > Users) also deletes their save, wallet, ledger rows and seats, and the crews they started, through cascading foreign keys. No role needs a `delete` right on those tables for that.

| Function or counter | Visitor (`anon`) | Signed-in player (`authenticated`) | Server (`service_role`) |
|---|---|---|---|
| `apply_wallet_transaction()` | no access | no access | yes |
| `is_crew_member()` | no access | yes, and it only ever answers for the caller | no access, the server skips RLS and does not need it |
| `handle_new_user()` | no access | no access | no access, only the sign-up trigger runs it |
| `touch_updated_at()` | no access | no access | no access, only the triggers run it |
| `wallet_transactions_id_seq` (the ledger's id counter) | no access | no access | no access, the table's own inserts do not need a right on it |
| `exchange_open_position()` | no access | no access | yes |
| `exchange_close_position()` | no access | no access | yes |
| `exchange_close_used_up()` | no access | no access | yes |
| `exchange_events_id_seq` (the event history's id counter) | no access | no access | no access, the table's own inserts do not need a right on it |

"No access" means the database refuses with `permission denied`, or (for a row that belongs to someone else) shows or changes nothing.

Supabase's security advisor may warn that a signed-in player can run a `SECURITY DEFINER` function. That is `is_crew_member()`, and it is on purpose. It takes a crew id, compares it with the caller's own id (`auth.uid()`), and returns only true or false. It cannot tell anyone who sits in somebody else's crew.

## What the server's secret key may do

- It skips row-level security. It can read every player's rows in all nine tables and write `profiles`, `saves`, `crews` and `crew_seats` (and, see below, the Exchange tables). Its table rights are still limited: it can update `wallets` but not insert or delete one, it can add ledger rows but not edit or delete one, and it can only read `wallet_reasons`.
- It is the only role that may run `apply_wallet_transaction()`. That is the one way to change a balance. The same holds for `exchange_open_position()`, `exchange_close_position()` and `exchange_close_used_up()`: the server runs them, nobody else.
- On the Exchange tables it can read both, add and change `exchange_positions` rows, and only add `exchange_events` rows. It cannot delete a position or edit or delete an event. Like the wallet, this is a rule of the team more than a lock: see the second footnote of the matrix.
- Because it skips RLS, the Python code must first check who is asking (the player's verified login token) and only then touch that player's rows.
- It must never reach a browser, the repository, a log or a screenshot. It lives only in the `SUPABASE_SECRET_KEY` environment variable on Vercel, and in a local `.env` file that git ignores.
- The browser only gets `SUPABASE_PUBLISHABLE_KEY` (as `VITE_SUPABASE_PUBLISHABLE_KEY`). That key is safe to show because the two locks above protect every table, and the browser has no right to write to any of them.

## Manual test plan

You need about 30 minutes. It proves the rules for reading and writing, the money function, the eight reasons and the crews with two test players, A and B.

The steps 1 to 17 check the foundation migration. If the Island Exchange migrations are applied too, read **13** instead of 8 for the number of reasons in steps 4 and 16. Step 15 still tests the first eight reasons. The checks of the Island Exchange version 2, including its two new reasons, are the steps X1 to X15 at the end of this plan.

**Set up**

1. In the dashboard open **Authentication > Users > Add user > Create new user**. Create two users with two e-mail addresses you control (for example your own address with `+a` and `+b` added before the `@`). Tick **Auto Confirm User**. If the dashboard refuses because Email sign-in is switched off, switch it on for the test and off again afterwards.
2. Copy the **User UID** of each. Below, replace `USER_A_ID` and `USER_B_ID` with them. A text editor's find-and-replace is the quickest way.
3. Replace `CREW_A_ID` with `11111111-1111-4111-8111-111111111111` and `CREW_B_ID` with `22222222-2222-4222-8222-222222222222`. These two crew ids are made up. Step 3 creates the crews with them.
4. Run each block in its own run in the SQL editor, with the role left on the default (`postgres`). The `set local role` line inside a block makes the database treat you as that player for that run.

Users made this way have an e-mail address, but their display name is still `Captain-` plus 6 characters. That also tests that the name does not come from the login details.

### 1. New players got their starter rows

```sql
select p.display_name,
       w.balance,
       (select count(*) from public.wallet_transactions t where t.player_id = p.id) as ledger_rows,
       s.version as save_version,
       s.data as save_data
from public.profiles p
join public.wallets w on w.player_id = p.id
join public.saves s on s.player_id = p.id
where p.id in ('USER_A_ID', 'USER_B_ID');
```

Expected: 2 rows. `display_name` is `Captain-xxxxxx` (the first 6 characters of the player's id), `balance` is 0, `ledger_rows` is 0, `save_version` is 1, `save_data` is `{}`.

### 2. The server pays out the entry kit and a purchase

Coins arrive only through the money function. Give each player the entry kit of 100 coins, and let player A pay 30 for a building:

```sql
set local role service_role;
select public.apply_wallet_transaction('USER_A_ID', 100, 'kit_grant', 'kit') as a_balance,
       public.apply_wallet_transaction('USER_B_ID', 100, 'kit_grant', 'kit') as b_balance;
```

Expected: `a_balance` is 100 and `b_balance` is 100.

```sql
set local role service_role;
select public.apply_wallet_transaction('USER_A_ID', -30, 'building_purchase', 'manual-test-1') as new_balance;
```

Expected: `new_balance` is 70. Now look at the balance and the ledger of player A (default role). We call this the **balance check** and use it again below:

```sql
select w.balance,
       (select count(*) from public.wallet_transactions t where t.player_id = w.player_id) as ledger_rows
from public.wallets w
where w.player_id = 'USER_A_ID';
```

Expected: `balance` 70 and `ledger_rows` 2 (the kit grant and the 30 coin purchase). The last ledger row is `delta` -30, `reason` `building_purchase`, `ref` `manual-test-1`, `balance_after` 70:

```sql
select delta, reason, ref, balance_after
from public.wallet_transactions
where player_id = 'USER_A_ID'
order by id desc
limit 1;
```

### 3. The server creates two crews

Crew A is a solo crew: player A in seat 1 and three NPC partners. Crew B has player B in seat 1 and one NPC partner.

```sql
set local role service_role;
insert into public.crews (id, created_by, mode) values
  ('CREW_A_ID', 'USER_A_ID', 'solo'),
  ('CREW_B_ID', 'USER_B_ID', 'crew');
insert into public.crew_seats (crew_id, seat_no, player_id, npc_id, kit) values
  ('CREW_A_ID', 1, 'USER_A_ID', null, 'lantern'),
  ('CREW_A_ID', 2, null, 'old_salt', 'compass'),
  ('CREW_A_ID', 3, null, 'deck_hand', null),
  ('CREW_A_ID', 4, null, 'cook_pete', null),
  ('CREW_B_ID', 1, 'USER_B_ID', null, 'logbook'),
  ('CREW_B_ID', 2, null, 'old_salt', null);
```

Expected: success, no error. A new crew starts with the status `forming`.

### 4. Player A sees only their own money, save and crew

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_A_ID", "role": "authenticated"}', true);
select
  (select count(*) from public.profiles)            as profiles_seen,
  (select count(*) from public.wallets)             as wallets_seen,
  (select count(*) from public.wallet_transactions) as ledger_rows_seen,
  (select count(*) from public.saves)               as saves_seen,
  (select count(*) from public.wallet_reasons)      as reasons_seen,
  (select count(*) from public.crews)               as crews_seen,
  (select count(*) from public.crew_seats)          as seats_seen;
```

Expected: `profiles_seen` is the number of players in the project (at least 2). `wallets_seen` and `saves_seen` are each 1, `ledger_rows_seen` is 2, `reasons_seen` is 8, `crews_seen` is 1 and `seats_seen` is 4 (A sees the four seats of their own crew and none of crew B).

### 5. Player B cannot read A's wallet, ledger, save, crew or seats

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_B_ID", "role": "authenticated"}', true);
select
  (select count(*) from public.profiles            where id        = 'USER_A_ID') as a_profile,
  (select count(*) from public.wallets             where player_id = 'USER_A_ID') as a_wallet,
  (select count(*) from public.wallet_transactions where player_id = 'USER_A_ID') as a_ledger_rows,
  (select count(*) from public.saves               where player_id = 'USER_A_ID') as a_save,
  (select count(*) from public.crews               where id        = 'CREW_A_ID') as a_crew,
  (select count(*) from public.crew_seats          where crew_id   = 'CREW_A_ID') as a_seats;
```

Expected: `a_profile` is 1 (display names are public). `a_wallet`, `a_ledger_rows`, `a_save`, `a_crew` and `a_seats` are all 0.

### 6. Nobody can change their own balance

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_A_ID", "role": "authenticated"}', true);
update public.wallets set balance = 999999 where player_id = 'USER_A_ID';
```

Expected: `permission denied for table wallets`. Run the balance check from step 2 again: `balance` is still 70 and `ledger_rows` is still 2.

### 7. Nobody can edit the ledger, its counter or the list of reasons

A player cannot add a ledger row:

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_A_ID", "role": "authenticated"}', true);
insert into public.wallet_transactions (player_id, delta, reason, ref, balance_after)
values ('USER_A_ID', 500, 'admin_adjust', 'manual-test-0', 570);
```

Expected: `permission denied for table wallet_transactions`.

Nobody can move the ledger's id counter. If they could, every later money call would fail:

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_A_ID", "role": "authenticated"}', true);
select setval('public.wallet_transactions_id_seq', 1, false);
```

Expected: `permission denied for sequence wallet_transactions_id_seq`. Change the first line to `set local role anon;` and then to `set local role service_role;` and run it again. The answer is the same.

Even the server cannot rewrite the ledger, the wallets or the list of reasons by hand:

```sql
set local role service_role;
update public.wallet_transactions set delta = 1 where player_id = 'USER_A_ID';
```

Expected: `permission denied for table wallet_transactions`. Now replace the last line and run again:

| Statement as `service_role` | Expected error mentions |
|---|---|
| `delete from public.wallet_transactions where player_id = 'USER_A_ID';` | `permission denied for table wallet_transactions` |
| `insert into public.wallets (player_id) values ('USER_A_ID');` | `permission denied for table wallets` |
| `delete from public.wallets where player_id = 'USER_A_ID';` | `permission denied for table wallets` |
| `update public.wallet_reasons set direction = 'earn' where reason = 'clue_purchase';` | `permission denied for table wallet_reasons` |
| `insert into public.wallet_reasons (reason, direction, description) values ('free_money', 'earn', 'x');` | `permission denied for table wallet_reasons` |

### 8. Players cannot call the money function

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_A_ID", "role": "authenticated"}', true);
select public.apply_wallet_transaction('USER_A_ID', 500, 'admin_adjust', 'manual-test-0');
```

Expected: `permission denied for function apply_wallet_transaction`.

### 9. Someone who is not signed in gets nothing

```sql
set local role anon;
select * from public.profiles;
```

Expected: `permission denied for table profiles`. Now replace the last line and run again. Each one fails the same way:

| Statement as `anon` | Expected error mentions |
|---|---|
| `select * from public.crews;` | `permission denied for table crews` |
| `select * from public.crew_seats;` | `permission denied for table crew_seats` |
| `select * from public.wallet_reasons;` | `permission denied for table wallet_reasons` |
| `select * from public.wallets;` | `permission denied for table wallets` |

### 10. Profile rules

Names are placeholders at first and only the server changes them. A player cannot rename themselves:

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_A_ID", "role": "authenticated"}', true);
update public.profiles set display_name = 'Captain A' where id = 'USER_A_ID';
```

Expected: `permission denied for table profiles`. Now replace the last line and run again. Each one fails the same way:

| Statement as player A | Expected error mentions |
|---|---|
| `update public.profiles set display_name = 'Hacked' where id = 'USER_B_ID';` | `permission denied for table profiles` |
| `update public.profiles set created_at = now() where id = 'USER_A_ID';` | `permission denied for table profiles` |
| `insert into public.profiles (id, display_name) values (gen_random_uuid(), 'Intruder');` | `permission denied for table profiles` |
| `delete from public.profiles where id = 'USER_A_ID';` | `permission denied for table profiles` |

The server gives player A a generated captain name (works):

```sql
set local role service_role;
update public.profiles set display_name = 'Brave Puffin 17' where id = 'USER_A_ID' returning id, display_name;
```

Expected: 1 row with `Brave Puffin 17`.

The server breaks the name rules (each fails):

```sql
set local role service_role;
update public.profiles set display_name = 'x' where id = 'USER_A_ID';
```

Expected: `violates check constraint "profiles_display_name_length"`. Now change `'x'` and run again:

| Name to try | Expected error mentions |
|---|---|
| `'Bad<>Name'` | `profiles_display_name_characters` |
| `' lead'` (space at the start) | `profiles_display_name_trimmed` |

### 11. Saves

A player can read their own save, but only the server writes it. Player A tries to change their own save (fails):

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_A_ID", "role": "authenticated"}', true);
update public.saves set data = '{"home_island": "lighthouse"}' where player_id = 'USER_A_ID';
```

Expected: `permission denied for table saves`. Now replace the last line and run again. Each one fails the same way:

| Statement as player A | Expected error mentions |
|---|---|
| `update public.saves set version = 999999 where player_id = 'USER_A_ID';` | `permission denied for table saves` |
| `insert into public.saves (player_id, data) values ('USER_B_ID', '{}');` | `permission denied for table saves` |
| `delete from public.saves where player_id = 'USER_A_ID';` | `permission denied for table saves` |

The server writes a save (works):

```sql
set local role service_role;
update public.saves set data = '{"home_island": "lighthouse"}' where player_id = 'USER_A_ID' returning player_id, data, version;
```

Expected: 1 row with the new `data` and `version` 1.

A save that is far too big (the server is stopped by the database rules too):

```sql
set local role service_role;
update public.saves set data = jsonb_build_object('blob', repeat('x', 250000)) where player_id = 'USER_A_ID';
```

Expected: `violates check constraint "saves_data_max_size"`.

### 12. Crews and seats

Players cannot write crews or seats. Player A tries to sit down in crew B (fails):

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_A_ID", "role": "authenticated"}', true);
insert into public.crew_seats (crew_id, seat_no, player_id) values ('CREW_B_ID', 3, 'USER_A_ID');
```

Expected: `permission denied for table crew_seats`. Now replace the last line and run again. Each one fails the same way:

| Statement as player A | Expected error mentions |
|---|---|
| `insert into public.crews (created_by, mode) values ('USER_A_ID', 'solo');` | `permission denied for table crews` |
| `update public.crews set status = 'finished' where id = 'CREW_A_ID';` | `permission denied for table crews` |
| `update public.crew_seats set kit = 'gold' where crew_id = 'CREW_A_ID' and seat_no = 1;` | `permission denied for table crew_seats` |
| `delete from public.crew_seats where crew_id = 'CREW_A_ID';` | `permission denied for table crew_seats` |

The server seats an NPC partner in crew B (works):

```sql
set local role service_role;
insert into public.crew_seats (crew_id, seat_no, npc_id, kit) values ('CREW_B_ID', 3, 'deck_hand', 'compass') returning seat_no, npc_id, kit;
```

Expected: 1 row.

The database guards the shape of a seat, even against the server:

```sql
set local role service_role;
insert into public.crew_seats (crew_id, seat_no, npc_id) values ('CREW_B_ID', 5, 'old_salt');
```

Expected: `violates check constraint "crew_seats_seat_no_range"`. Now replace the last line and run again:

| Statement as `service_role` | Expected error mentions |
|---|---|
| `insert into public.crew_seats (crew_id, seat_no, npc_id) values ('CREW_B_ID', 4, 'Old Salt');` | `crew_seats_npc_id_format` |
| `insert into public.crew_seats (crew_id, seat_no, player_id, npc_id) values ('CREW_B_ID', 4, 'USER_A_ID', 'old_salt');` | `crew_seats_player_or_npc` |
| `insert into public.crew_seats (crew_id, seat_no) values ('CREW_B_ID', 4);` | `crew_seats_player_or_npc` |
| `insert into public.crew_seats (crew_id, seat_no, npc_id) values ('CREW_B_ID', 2, 'cook_pete');` | `crew_seats_pkey` |
| `insert into public.crews (created_by, mode) values ('USER_A_ID', 'team');` | `crews_mode_allowed` |
| `insert into public.crews (created_by, mode, status) values ('USER_A_ID', 'solo', 'paused');` | `crews_status_allowed` |

Player B sees the three seats of their own crew, and none of crew A:

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_B_ID", "role": "authenticated"}', true);
select seat_no, player_id, npc_id from public.crew_seats order by seat_no;
```

Expected: 3 rows: seat 1 (player B), seat 2 (`old_salt`) and seat 3 (`deck_hand`).

### 13. A payment that would go below zero fails

```sql
set local role service_role;
select public.apply_wallet_transaction('USER_A_ID', -5000, 'building_purchase', 'manual-test-2');
```

Expected: `insufficient_funds`. Nothing changed. Run the balance check from step 2: `balance` is 70 and `ledger_rows` is 2.

### 14. Other bad calls to the money function

Each call below must fail and change nothing.

```sql
set local role service_role;
select public.apply_wallet_transaction('00000000-0000-0000-0000-000000000000', 10, 'admin_adjust', 'manual-test-6');
```

Expected: `wallet_not_found`.

```sql
set local role service_role;
select public.apply_wallet_transaction('USER_A_ID', 10, 'cheat', 'manual-test-7');
```

Expected: `unknown_reason`. The old sign-up reason `starting_grant` gets the same answer, because it does not exist any more.

A purchase must take coins away, so a positive amount for it is refused:

```sql
set local role service_role;
select public.apply_wallet_transaction('USER_A_ID', 30, 'building_purchase', 'manual-test-3');
```

Expected: `wrong_direction`. The same goes the other way round: a sale must add coins.

```sql
set local role service_role;
select public.apply_wallet_transaction('USER_A_ID', -30, 'cargo_sale', 'manual-test-4');
```

Expected: `wrong_direction`. An amount of 0 is refused for every reason, even `admin_adjust`, which may otherwise go either way:

```sql
set local role service_role;
select public.apply_wallet_transaction('USER_A_ID', 0, 'admin_adjust', 'manual-test-5');
```

Expected: `wrong_direction`.

A coin change needs a reference. The money function has no default for it, so a call with only three values does not exist:

```sql
set local role service_role;
select public.apply_wallet_transaction('USER_A_ID', 10, 'admin_adjust');
```

Expected: `function public.apply_wallet_transaction(unknown, integer, unknown) does not exist`. A reference that is `null`, empty or only spaces is refused by the ledger, and the balance change is rolled back with it. Now replace the last line and run again. Each one fails:

| Statement as `service_role` | Expected error mentions |
|---|---|
| `select public.apply_wallet_transaction('USER_A_ID', 10, 'admin_adjust', null);` | `null value in column "ref"` |
| `select public.apply_wallet_transaction('USER_A_ID', 10, 'admin_adjust', '');` | `wallet_transactions_ref_not_blank` |
| `select public.apply_wallet_transaction('USER_A_ID', 10, 'admin_adjust', '   ');` | `wallet_transactions_ref_not_blank` |

The same player, reason and reference twice is refused. Step 2 already used `manual-test-1` for `building_purchase`:

```sql
set local role service_role;
select public.apply_wallet_transaction('USER_A_ID', -30, 'building_purchase', 'manual-test-1');
```

Expected: `duplicate key value violates unique constraint "wallet_transactions_one_row_per_ref"`. The entry kit is protected the same way. Step 2 used the reference `kit`, so a second kit for the same player fails with the same message:

```sql
set local role service_role;
select public.apply_wallet_transaction('USER_A_ID', 100, 'kit_grant', 'kit');
```

After these calls, run the balance check from step 2 again: `balance` is still 70 and `ledger_rows` is still 2. A refused call changes nothing, not even a little.

### 15. All eight reasons are accepted

The server uses each of the eight reasons once, with the right direction: 1 coin is taken away for `clue_purchase` and `building_purchase`, and 1 coin is added for the other six. Run this block once.

```sql
set local role service_role;
select v.reason,
       public.apply_wallet_transaction('USER_A_ID', v.delta, v.reason, 'reason-test') as balance_after
from (values
  ('kit_grant', 1),
  ('clue_reward', 1),
  ('mystery_reward', 1),
  ('event_reward', 1),
  ('cargo_sale', 1),
  ('clue_purchase', -1),
  ('building_purchase', -1),
  ('admin_adjust', 1)
) as v(reason, delta);
```

Expected: 8 rows, one per reason, with `balance_after` going 71, 72, 73, 74, 75, 74, 73, 74. Step 14 already showed that a ninth name (`cheat`) and a wrong direction are refused. Run the balance check from step 2: `balance` is 74 and `ledger_rows` is 10.

### 16. Running the migration again is harmless

Paste the whole migration file into the SQL editor again and run it. Expected: no error. Run the balance check from step 2: `balance` is still 74 and `ledger_rows` is still 10. The list of reasons still has 8 rows:

```sql
select count(*) as reasons from public.wallet_reasons;
```

Expected: `reasons` is 8.

### 17. Deleting a player removes their rows

Delete both test users under **Authentication > Users**. Then run:

```sql
select
  (select count(*) from public.profiles            where id        in ('USER_A_ID', 'USER_B_ID')) as profiles,
  (select count(*) from public.wallets             where player_id in ('USER_A_ID', 'USER_B_ID')) as wallets,
  (select count(*) from public.wallet_transactions where player_id in ('USER_A_ID', 'USER_B_ID')) as ledger_rows,
  (select count(*) from public.saves               where player_id in ('USER_A_ID', 'USER_B_ID')) as saves,
  (select count(*) from public.crews               where id        in ('CREW_A_ID', 'CREW_B_ID')) as crews,
  (select count(*) from public.crew_seats          where crew_id   in ('CREW_A_ID', 'CREW_B_ID')) as seats;
```

Expected: all six numbers are 0. Each test player created their own crew, so deleting the players deleted the crews and their seats too.

### Island Exchange checks (steps X1 to X15)

These steps test the third migration (the Island Exchange version 2). Run them after all three migrations are applied. Use **two new test users**, A and B (create them as in the set-up of this plan, so their balances start at 0), and replace `USER_A_ID` and `USER_B_ID` with their ids. Give player A 1000 coins and player B 150 coins first (default role):

```sql
select public.apply_wallet_transaction('USER_A_ID', 1000, 'kit_grant', 'exchange-kit') as a_balance,
       public.apply_wallet_transaction('USER_B_ID', 150, 'kit_grant', 'exchange-kit') as b_balance;
```

The functions take their limits as arguments, so the blocks below pass them in. `exchange_open_position(player, company, side, price mode, entry price, leverage, stake, fee, fee rate in basis points, ref, least stake, most stake, daily cap, start of the game day, most open positions)` always gets leverage 10, a fee rate of 200 (2 %), a least stake of 10, a most stake of 500, a daily cap of 2000, "one hour ago" as the start of the game day and a limit of 20 open positions, unless a step says otherwise. `exchange_close_position(player, position id, price mode, closing price, value, fee, fee rate, ref)` gets the value and the fee the server would work out: the database recomputes them and refuses other numbers. A company is just text here (the server checks it against `companies.json`). All blocks run as the server:

```sql
set local role service_role;
```

We call this block the **Exchange check** and use it again below (default role, replace the player):

```sql
select w.balance,
       (select count(*) from public.exchange_positions p where p.player_id = w.player_id and p.status = 'open') as open_positions,
       (select count(*) from public.exchange_events e where e.player_id = w.player_id) as events,
       (select string_agg(t.reason || ' ' || t.delta, ', ' order by t.id) from public.wallet_transactions t where t.player_id = w.player_id and t.ref like 'market:%') as ledger
  from public.wallets w
 where w.player_id = 'USER_A_ID';
```

**X1. Open a rising position.** Player A puts 100 coins into Saltreach Harbor Trust at 76,000.00. The fee is 2 % of 100 = 2. The zero point of a rising position is 90 % of the entry price: 68,400.00.

```sql
set local role service_role;
select public.exchange_open_position('USER_A_ID', 'harbor-trust', 'rising', 'live', 76000.00, 10, 100, 2, 200, 'market:open:manual-1', 10, 500, 2000, now() - interval '1 hour', 20) as result;
```

Expected: `status` `done`, `zeroPrice` 68400 and `balance` 898. The Exchange check shows `balance` 898, `open_positions` 1, `events` 1 and `ledger` `market_stake -100, market_fee -2` (two ledger rows with the same ref).

**X2. The same ref twice changes nothing.** Run the block of X1 again with the same ref `market:open:manual-1`. Expected: an error, message `already_applied` (error code `23505`, the same code as a repeated wallet ref). The Exchange check still shows 898, 1, 1.

**X3. Open a falling position.** Player A puts 50 coins into Pier Post Courier at 200.00. The fee is 2 % of 50 = 1. The zero point of a falling position is 110 % of the entry price:

```sql
set local role service_role;
select public.exchange_open_position('USER_A_ID', 'pier-post-courier', 'falling', 'live', 200.00, 10, 50, 1, 200, 'market:open:manual-3', 10, 500, 2000, now() - interval '1 hour', 20) as result;
```

Expected: `done`, `zeroPrice` 220 and `balance` 847.

**X4. Close the first position at a profit.** The price rose 2 % to 77,520.00, so the position gained 20 % of its stake: it is worth 120 coins. The closing fee is 2 % of the stake, 2. The player receives 118.

```sql
set local role service_role;
select public.exchange_close_position('USER_A_ID', (select id from public.exchange_positions where open_ref = 'market:open:manual-1'), 'live', 77520.00, 120, 2, 200, 'market:close:manual-4') as result;
```

Expected: `done`, `closedAs` `closed`, `value` 120, `fee` 2, `coinsChange` 118 and `balance` 965. The Exchange check shows 965, 1 open position, 3 events and a ledger that ends with `market_payout 120, market_fee -2`.

**X5. Closing again is refused.** Run X4 again with a new ref (`market:close:manual-5`). Expected: no error, but `status` `refused`, `reason` `position_closed`, `closedAs` `closed` and a `closedAt` time. Nothing changed: the Exchange check still shows 965.

**X6. The automatic close at zero.** A price of 221.00 for Pier Post Courier is beyond the zero point (220.00) of the falling position of X3. The prices list has one price: the company, the price as text, when it was quoted and the price mode. The automatic close only closes positions that were opened *before* the price was quoted.

```sql
set local role service_role;
select public.exchange_close_used_up(
  jsonb_build_array(jsonb_build_object('company_id', 'pier-post-courier', 'price', '221.00', 'quoted_at', now(), 'mode', 'live')),
  null) as result;
```

Expected: `closed` 1 and `positionIds` with the id of the position of X3. That position is now `zeroed` with `close_value` 0 and `close_fee` 0 (look at it with `select status, close_value, close_fee, close_ref from public.exchange_positions where open_ref = 'market:open:manual-3';`, the `close_ref` is `market:zero:` plus its id). The player lost the stake and the opening fee, nothing more, and **no ledger row** was written: the Exchange check still shows `balance` 965 and the same ledger, with one more event (4 in all, a `zero` event).

**X7. A gap past the zero point.** A rising position at 50.00 has its zero point at 45.00. The price jumps from 50.00 to 30.00, far past it. The position is worth 0, never below.

```sql
set local role service_role;
select public.exchange_open_position('USER_A_ID', 'swiftwater-ferries', 'rising', 'live', 50.00, 10, 100, 2, 200, 'market:open:manual-7', 10, 500, 2000, now() - interval '1 hour', 20) as result;
```

Expected: `done`, `balance` 863. Then (a new run):

```sql
set local role service_role;
select public.exchange_close_used_up(
  jsonb_build_array(jsonb_build_object('company_id', 'swiftwater-ferries', 'price', '30.00', 'quoted_at', now(), 'mode', 'live')),
  null) as result;
```

Expected: `closed` 1. The position is `zeroed`, and the Exchange check shows `balance` 863 (unchanged by the sweep).

**X8. A player closes a position that is used up.** Player A opens another rising position at 50.00 (company `tidewright-works`):

```sql
set local role service_role;
select public.exchange_open_position('USER_A_ID', 'tidewright-works', 'rising', 'live', 50.00, 10, 100, 2, 200, 'market:open:manual-8', 10, 500, 2000, now() - interval '1 hour', 20) as result;
```

Expected: `done`, `balance` 761. Now the price is 40.00, past the zero point (45.00), so the value is 0 and the fee is 0 (a new run):

```sql
set local role service_role;
select public.exchange_close_position('USER_A_ID', (select id from public.exchange_positions where open_ref = 'market:open:manual-8'), 'live', 40.00, 0, 0, 200, 'market:close:manual-8') as result;
```

Expected: `done`, `closedAs` `zeroed`, `value` 0, `fee` 0, `coinsChange` 0 and `balance` 761. No ledger row for this ref, only an event.

**X9. The daily cap.** Player B (150 coins) opens 100 coins with a daily cap of 150, which fits (the cost is 102 with the fee). Then B tries 100 coins again with the same cap:

```sql
set local role service_role;
select public.exchange_open_position('USER_B_ID', 'harbor-trust', 'rising', 'live', 100.00, 10, 100, 2, 200, 'market:open:manual-9a', 10, 500, 150, now() - interval '1 hour', 20) as first_open;
```

Expected: `done`, `balance` 48. Then (a new run):

```sql
set local role service_role;
select public.exchange_open_position('USER_B_ID', 'harbor-trust', 'rising', 'live', 100.00, 10, 100, 2, 200, 'market:open:manual-9b', 10, 500, 150, now() - interval '1 hour', 20) as second_open;
```

Expected: `status` `refused`, `reason` `daily_cap` and `coinsLeft` 50. Nothing changed (run the Exchange check with `USER_B_ID`: 48 coins, 1 open position, 1 event).

**X10. The open-position limit.** Player B tries again with a limit of 1 open position (the last argument), and a daily cap that is high enough:

```sql
set local role service_role;
select public.exchange_open_position('USER_B_ID', 'harbor-trust', 'rising', 'live', 100.00, 10, 10, 1, 200, 'market:open:manual-10', 10, 500, 2000, now() - interval '1 hour', 1) as result;
```

Expected: `status` `refused`, `reason` `too_many_positions` and `openCount` 1.

**X11. Not enough coins.** Player B has 48 coins and a position costs 102:

```sql
set local role service_role;
select public.exchange_open_position('USER_B_ID', 'harbor-trust', 'rising', 'live', 100.00, 10, 100, 2, 200, 'market:open:manual-11', 10, 500, 2000, now() - interval '1 hour', 20) as result;
```

Expected: an error `insufficient_funds`. Nothing changed: B still has 48 coins, 1 open position and 1 event.

**X12. The database checks the arithmetic.** The server works out the fee, the value and the closing fee. The database recomputes them, so it stays right even if the server has a bug. Each statement is refused with the error `bad_trade` and changes nothing. Put `set local role service_role;` in front of each, run it, and then run the Exchange check for player A: it shows what it showed after X8.

| Statement | What is wrong | Expected |
|---|---|---|
| `select public.exchange_open_position('USER_A_ID', 'harbor-trust', 'rising', 'live', 100.00, 10, 100, 1, 200, 'market:open:manual-12', 10, 500, 2000, now() - interval '1 hour', 20);` | the fee of 100 coins at 2 % is 2, not 1 | `bad_trade` |
| `select public.exchange_open_position('USER_A_ID', 'harbor-trust', 'rising', 'live', 100.00, 10, 100, 3, 300, 'market:open:manual-12', 10, 500, 2000, now() - interval '1 hour', 20);` | a fee rate of 300 basis points does not exist (only 200 and 100) | `bad_trade` |
| `select public.exchange_open_position('USER_A_ID', 'harbor-trust', 'rising', 'live', 100.00, 10, 501, 11, 200, 'market:open:manual-12', 10, 500, 2000, now() - interval '1 hour', 20);` | a stake of 501 with a most stake of 500 | `bad_trade` |
| `select public.exchange_open_position('USER_A_ID', 'harbor-trust', 'rising', 'live', 1.123456789, 10, 100, 2, 200, 'market:open:manual-12', 10, 500, 2000, now() - interval '1 hour', 20);` | a price with 9 decimals | `bad_trade` |
| `select public.exchange_open_position('USER_A_ID', 'harbor-trust', 'rising', 'live', 100.00, 10, 100, 2, 200, 'market:open:manual-12', 10, 500, 2000, now() + interval '1 day', 20);` | the game day starts tomorrow, so the daily cap would count nothing | `bad_trade` |
| `select public.exchange_open_position('USER_A_ID', 'harbor-trust', 'rising', 'live', 100.00, 3, 100, 2, 200, 'market:open:manual-12', 10, 500, 2000, now() - interval '1 hour', 20);` | a leverage of 3 (it is always 10) | `bad_trade` |

The same for a closing. First open a position (company `market-hall-guild`, entry price 100.00, 100 coins):

```sql
set local role service_role;
select public.exchange_open_position('USER_A_ID', 'market-hall-guild', 'rising', 'live', 100.00, 10, 100, 2, 200, 'market:open:manual-12a', 10, 500, 2000, now() - interval '1 hour', 20) as result;
```

Expected: `done`. At a price of 110.00 (+10 %) the position is worth 200 coins and the closing fee is 2. Each of these statements is refused with `bad_trade`:

| Statement | What is wrong | Expected |
|---|---|---|
| `select public.exchange_close_position('USER_A_ID', (select id from public.exchange_positions where open_ref = 'market:open:manual-12a'), 'live', 110.00, 999, 2, 200, 'market:close:manual-12');` | the value is 200, not 999 | `bad_trade` |
| `select public.exchange_close_position('USER_A_ID', (select id from public.exchange_positions where open_ref = 'market:open:manual-12a'), 'live', 110.00, 200, 3, 200, 'market:close:manual-12');` | the closing fee is 2, not 3 | `bad_trade` |
| `select public.exchange_close_position('USER_A_ID', (select id from public.exchange_positions where open_ref = 'market:open:manual-12a'), 'live', 110.123456789, 200, 2, 200, 'market:close:manual-12');` | a price with 9 decimals | `bad_trade` |

**X13. Rights.** A signed-in player reads only their own positions and events and cannot write. A visitor gets nothing. Players cannot run the functions. Even the server cannot edit or delete the history. Run this as player A (replace `USER_A_ID` twice):

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_A_ID", "role": "authenticated"}', true);
select (select count(*) from public.exchange_positions) as positions_seen,
       (select count(*) from public.exchange_events) as events_seen,
       (select count(*) from public.exchange_positions where player_id = 'USER_B_ID') as b_positions_seen;
update public.exchange_positions set stake = 1000000 where player_id = 'USER_A_ID';
```

Expected: `positions_seen` 5 and `events_seen` 9 (the positions of X1, X3, X7, X8 and X12 with their events, if you ran every step), `b_positions_seen` 0 (B has one position, but A may not see it). The last line fails with `permission denied for table exchange_positions`. Now replace the last line and run again. Each one fails the same way:

| Statement (as player A, then as `anon`) | Expected |
|---|---|
| `insert into public.exchange_positions (player_id, company_id, side, price_mode, leverage, stake, entry_price, zero_price, open_fee, open_ref) values ('USER_A_ID', 'harbor-trust', 'rising', 'live', 10, 1, 1, 0.9, 1, 'x');` | `permission denied for table exchange_positions` |
| `delete from public.exchange_positions where player_id = 'USER_A_ID';` | `permission denied for table exchange_positions` |
| `update public.exchange_events set price = 1;` | `permission denied for table exchange_events` |
| `delete from public.exchange_events where player_id = 'USER_A_ID';` | `permission denied for table exchange_events` |
| `select public.exchange_open_position('USER_A_ID', 'harbor-trust', 'rising', 'live', 1.00, 10, 100, 2, 200, 'x', 10, 500, 2000, now(), 20);` | `permission denied for function exchange_open_position` |
| `select public.exchange_close_position('USER_A_ID', '00000000-0000-0000-0000-000000000000', 'live', 1.00, 0, 0, 200, 'x');` | `permission denied for function exchange_close_position` |
| `select public.exchange_close_used_up('[]'::jsonb, null);` | `permission denied for function exchange_close_used_up` |
| `select nextval('public.exchange_events_id_seq');` | `permission denied for sequence exchange_events_id_seq` |

Change the first line to `set local role anon;` (and drop the `set_config` line) and run `select * from public.exchange_positions;`, then the same for `exchange_events`. Expected: `permission denied for table ...` each time. Even the server cannot edit or delete the history, or delete a position:

```sql
set local role service_role;
update public.exchange_events set price = 1 where player_id = 'USER_A_ID';
```

Expected: `permission denied for table exchange_events`. The same for `delete from public.exchange_events ...` and `delete from public.exchange_positions ...`.

**X14. Price modes.** A position opened on live prices can only be closed with live prices. Open a live position for player B (10 coins, entry price 100.00, fee 1; B has 48 coins):

```sql
set local role service_role;
select public.exchange_open_position('USER_B_ID', 'tesla', 'rising', 'live', 100.00, 10, 10, 1, 200, 'market:open:manual-14', 10, 500, 2000, now() - interval '1 hour', 20) as result;
```

Expected: `done`. Now try to close it with prices of the recorded day (mode `replay`):

```sql
set local role service_role;
select public.exchange_close_position('USER_B_ID', (select id from public.exchange_positions where open_ref = 'market:open:manual-14'), 'replay', 110.00, 20, 1, 200, 'market:close:manual-14') as result;
```

Expected: `status` `refused`, `reason` `wrong_price_mode`. A sweep with prices of the recorded day (mode `replay`) skips the live position even at a price far past its zero point:

```sql
set local role service_role;
select public.exchange_close_used_up(
  jsonb_build_array(jsonb_build_object('company_id', 'tesla', 'price', '50.00', 'quoted_at', now(), 'mode', 'replay')),
  null) as result;
```

Expected: `closed` 0 and an empty `positionIds`. The position is still open.

**X15. The reasons, and running the migration again.** The two new reasons are in the list (default role):

```sql
select reason, direction from public.wallet_reasons where reason like 'market\_%' order by reason;
select count(*) from public.wallet_reasons;
```

Expected: 5 rows: `market_buy` spend, `market_fee` spend, `market_payout` earn, `market_sell` earn, `market_stake` spend. And 13 reasons in all. The wallet refuses a wrong direction, for example a stake that adds coins:

```sql
set local role service_role;
select public.apply_wallet_transaction('USER_A_ID', 10, 'market_stake', 'manual-wrong-1');
```

Expected: `wrong_direction`. Finally paste the whole third migration (`20261106090000_exchange_leverage.sql`) into the SQL editor again and run it. Expected: no error, the Exchange check for player A shows what it showed after X12, and `select count(*) from public.wallet_reasons;` still shows 13. (The file starts with a guard that only looks at the old first-version table `market_trades`, which no longer exists, so it does nothing the second time.)

Delete the two test users when you are done (**Authentication > Users**). Their positions and events go with them.

## Changing the database later

- Never edit a migration that has been applied anywhere. Add a new file named `supabase/migrations/<YYYYMMDDHHMMSS>_<topic>.sql` with a later time stamp.
- A new table needs, in the same file: row-level security switched on, policies, **explicit grants** (our project gives no rights to a new table, so nothing works until you grant them, and you grant only what is really needed), and a comment on the table, every column and every policy. Take every right away first (`revoke all` from `public`, `anon`, `authenticated` and `service_role`), then grant. The browser only reads, so `authenticated` gets `select` at most. If the table has an identity column (`generated always as identity`), also revoke all rights on its counter, as the foundation file does for `wallet_transactions_id_seq`. Copy the style of the foundation file.
- A new function needs `revoke ... from public, anon, authenticated` and then `grant execute` only to the role that must run it. Start it with `set search_path = ''`.
- A new wallet reason is one new migration with one `insert into public.wallet_reasons (reason, direction, description) values (...) on conflict (reason) do nothing;`, plus the same `(reason, direction)` pair added at the **end** of `WALLET_REASONS` in `backend/server/wallet.py`, in the same pull request. Never rename a reason or change its direction, because ledger rows point at it. The test `backend/server/tests/test_wallet_matches_migration.py` reads every migration in order and fails if the two lists differ. Add the reason to the manual test plan (step 15) too.
- Realtime is not switched on for these tables yet. The work package that needs it adds it.
- If something here is unclear, open an issue before changing the rules for money.
