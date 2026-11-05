# Supabase database

This folder holds the database of The Great Plot Twist. Supabase gives us the login (GitHub sign-in), a Postgres database and realtime. Everything the game must remember lives here: who the players are, their saved progress, their coins and their crews.

Play money only: coins cannot be bought, cashed out or exchanged for real prizes. Every player starts with 0 coins. The first coins come later, from the intro entry kit (the `kit_grant` reason).

The browser only reads from this database. Every write comes from our Python server with the secret key.

| File | What it is |
|---|---|
| [migrations/20261106000000_foundation.sql](migrations/20261106000000_foundation.sql) | The first migration: seven tables, the security rules, the rights of each database role and four functions. Every table, column and policy is explained inside the file. |
| [migrations/20261106010000_island_exchange.sql](migrations/20261106010000_island_exchange.sql) | The second migration, for the Island Exchange (package L4): three wallet reasons, three tables and two functions. Run it after the first. See [The Island Exchange migration](#the-island-exchange-migration). |
| [migrations/20261106070000_home_islet.sql](migrations/20261106070000_home_islet.sql) | The home islet migration (package L2): two tables and one function. Run it after the foundation. It needs nothing from the other migrations, but apply the files in time-stamp order. See [The home islet migration](#the-home-islet-migration). |

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
| `market_buy` | spend | Coins paid for shares bought on the Island Exchange. *Added by the second migration.* |
| `market_sell` | earn | Coins received for shares sold on the Island Exchange. *Added by the second migration.* |
| `market_fee` | spend | Fee paid on a trade on the Island Exchange. *Added by the second migration.* |

The first eight come from the foundation migration, the last three from the Island Exchange migration. The direction says which way the coins move. **earn** adds coins, so the amount must be above 0. **spend** takes coins away, so the amount must be below 0. **either** may go both ways, but never 0. `apply_wallet_transaction()` looks the reason up and checks the direction before it touches the balance, and the Python code checks the same rule even earlier. The `reason` column of the ledger is also a foreign key to `wallet_reasons`, so an unknown reason cannot get into the ledger by any route.

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

`migrations/20261106010000_island_exchange.sql` is the database part of the Island Exchange (fictional island companies whose play-money prices follow real markets, amplified; see [INTERFACES.md, section 2](../docs/INTERFACES.md#the-island-exchange-package-l4) and decision [D017](../docs/DECISIONS.md)). Run it **after** the foundation migration, because it uses the wallet and the profiles from there. It is safe to run twice. Everything is explained in the file itself.

| Name | What it is | Who changes it |
|---|---|---|
| `market_bases` | One row per company: the base its game price is measured from (a game price and a real price), and whether trading is paused (`halted_until`, `frozen_price`). A `version` number counts the saves. Every server instance reads the same row, so all agree on the base and on a pause (each instance still works out the price from its own copy of the real prices, so two instances can differ by the age of that copy). | Only the server, through `market_set_base()`. |
| `market_positions` | One row per player and company the player holds units of. `last_buy_at` is what the 10-minute holding time counts from. The row is deleted when the player sells everything. | Only `market_trade()`. |
| `market_trades` | The trade history: one row per buy or sell, never edited. The ref (`market:` plus the id the browser made for the click) can be used once per player. | Only `market_trade()`. |
| `market_trade()` | The only way a trade happens. In one step: check that the numbers add up (see below), lock the player's wallet, refuse a repeated ref, refuse a paused company, check the daily buy cap (a buy) or the units held and the holding time (a sell), move the coins with `apply_wallet_transaction()` (`market_buy` or `market_sell`, plus `market_fee`), change the position, write the trade. It *returns* a refusal such as `{"status": "refused", "reason": "holding_time"}` with nothing changed, and *raises* `insufficient_funds` (from the wallet), a repeated ref (code `23505`, message `already_applied`), or `bad_trade` / `unknown_company` when the server sent numbers that do not add up (a bug on the server side, not something a player can cause). | Run by the server only. |
| `market_set_base()` | Saves one company's base. The caller says which version it read; the row changes only if it still has that version (0 creates it). Returns the new version, or null if somebody else saved first. | Run by the server only. |

A trade writes two ledger rows with the same ref: `market_buy` and `market_fee` for a buy, `market_sell` and `market_fee` for a sell. The ledger accepts each player, reason and ref once, so the same ref is fine for two different reasons.

The price rules (the multiplier, the floor and ceiling, the 30 % breaker, the daily re-base) are **Python** (`backend/server/market/rules.py`). The database stores their state and enforces what depends on a player's earlier trades, because only the database can see two requests at the same moment: the daily buy cap, the units held and the holding time are passed to `market_trade()` as arguments, so the numbers live in one place (`backend/server/market/trade_rules.py`).

**The database also checks the arithmetic of a trade, so it stays right even if the Python has a bug.** The price itself is an input from the server, like the amount of a wallet change: the database does not repeat the price rules. But everything that follows from the price, it recomputes. `market_trade()` refuses the trade with `bad_trade` (and changes nothing) when:

- the coins for the shares are not the units times the price, rounded **up** for a buy and **down** for a sell,
- the fee is not the fee rate (`p_fee_basis_points`, 200 = 2 %) of those coins, rounded up (so a fee of 0 is refused),
- a **purchase** is worth more than `p_max_buy_coins` (500). A sale has no upper limit, so a player can always sell what they hold,
- the start of the market day is more than a minute in the future (the daily cap would then count no trades at all).

It refuses a company that has no row in `market_bases` with `unknown_company` (the server saves a base for every company before it trades).

After applying it, the three quick checks below show **ten** tables and **ten** policies, and there are **eleven** wallet reasons. Run the Exchange checks at the end of the manual test plan.

## The home islet migration

`migrations/20261106070000_home_islet.sql` is the database part of the home islet: every player's own islet, with the timber they hold and the buildings that stand on it (see [INTERFACES.md, section 2](../docs/INTERFACES.md#your-home-islet-package-l2) and decision [D021](../docs/DECISIONS.md)). Run it **after** the foundation migration, because it uses the profiles, the wallets, `apply_wallet_transaction()` and `touch_updated_at()` from there. It needs nothing from the other migrations, but apply the files oldest time stamp first, as always. It is safe to run twice. It adds **no wallet reason**: a building is paid with `building_purchase`, which the foundation migration already has. Everything is explained in the file itself.

| Name | What it is | Who changes it |
|---|---|---|
| `islets` | One row per player who has built something: the timber the player holds, never below 0. The first build makes the row, and it starts with the **starter pack** of timber (20 today, from `backend/content/buildings.json`). The primary key is the player, so the pack arrives once. Timber is not coins, so it has no ledger. | Only the server, through `islet_build()`. |
| `islet_buildings` | One row per building that stands on a player's islet. The primary key is the player and the plot, so a plot holds one building. A check rule keeps each plot and its kind of building together (`plot_2` workshop, `plot_3` windmill, `plot_4` greenhouse, `islet_signal_station` signal_station). The cabin on `plot_1` stands from the start and has no row. The ref (`islet:` plus the id the browser made for the click) can be used once per player. `coins_paid` and `timber_paid` record what was paid: timber has no ledger, so that row is its only record. | Only the server, through `islet_build()`. |
| `islet_build()` | The only way a building goes up. In one step: check the arguments, lock the player's wallet, refuse a repeated ref, make the islet row with the starter pack if there is none and lock it, refuse a plot that holds a building, refuse a build when the player holds too little timber, take the coins with `apply_wallet_transaction()` (reason `building_purchase`), take the timber and write the building (level 1). It *returns* a refusal such as `{"status": "refused", "reason": "plot_occupied", "standing": "signal_station"}` with nothing charged, and *raises* `insufficient_funds` (from the wallet), a repeated ref (code `23505`, message `already_applied`), `bad_build` when the server sent an argument that makes no sense, or a check error when a plot and its building do not belong together. | Run by the server only. |

**The starter-pack rule.** The server shows a player who has not built yet 20 timber, and `islet_build()` makes the islet row with the same number (the server passes it in, from `buildings.json`). So what the player saw is what the player gets, and the pack cannot arrive twice. 20 timber buys exactly the signal station and the workshop, in either order, so nobody can spend the starter timber in a way that blocks the finale.

**The prices are arguments.** `islet_build()` takes the coins, the timber and the starter pack as arguments, like the price of an Island Exchange trade, so every number lives in one place (`buildings.json`) and the database only compares against what it is given. Which building may be built on which plot, and whether a spot can be built yet, are Python rules (`backend/server/game/building.py`). The database checks what depends on earlier builds, because only it sees two requests at the same moment: is the plot taken, is there enough timber, is the ref new, and are there enough coins.

**The lock order.** Every money function locks the player's wallet row first. `islet_build()` does so before it touches the islet, like `market_trade()`, so a trade and a build of the same player wait in a line and never in a circle. The races in the manual test plan (below) try it.

**The finale reads it.** A signal station is never removed or downgraded: no role can update or delete a building. So "this player has a signal station" can only change from no to yes. In SQL it is `exists (select 1 from public.islet_buildings where player_id = <player> and building_type = 'signal_station')`. The table and column names are part of the contract in [INTERFACES.md](../docs/INTERFACES.md#your-home-islet-package-l2).

After applying it, the three quick checks below show two more tables, two more policies and two more `authenticated` grant rows than before this migration. Run the home islet checks (steps H1 to H15) at the end of the manual test plan.

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
5. Do the same with `migrations/20261106010000_island_exchange.sql` (the Island Exchange), in a new query. The order matters: the files start with a time stamp, so apply them oldest first.
6. Do the same with `migrations/20261106070000_home_islet.sql` (the home islet). It needs only the foundation, but its time stamp is later than the other new files, so apply it after them if they are there.

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

Expected: the seven tables `crew_seats`, `crews`, `profiles`, `saves`, `wallet_reasons`, `wallet_transactions`, `wallets`, each with `rls_on` = true. After the Island Exchange migration there are ten: also `market_bases`, `market_positions` and `market_trades`. The home islet migration adds two more, `islets` and `islet_buildings`, each with `rls_on` = true. Other migrations add tables too, so compare with the list before you applied this file, not with a total.

```sql
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Expected: 7 policies, one on each table, and every `cmd` is `SELECT`. There is no policy that lets a player write. After the Island Exchange migration there are 10 (one more on each new table). The home islet migration adds two more, `Players can read their own islet` and `Players can read their own islet buildings`, both `SELECT`.

```sql
select grantee, table_name, string_agg(privilege_type, ', ' order by privilege_type) as rights
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
group by grantee, table_name
order by grantee, table_name;
```

Expected: no row for `anon`. For `authenticated`, 7 rows (one per table), and `rights` is `SELECT` in every row. After the Island Exchange migration: 10 rows. The home islet migration adds two more rows, for `islets` and `islet_buildings`, each with `SELECT`.

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
| `market_bases` | read | no access | all rows | yes |
| `market_bases` | insert | no access | no access | yes \*\* (through `market_set_base()`) |
| `market_bases` | update | no access | no access | yes \*\* (through `market_set_base()`) |
| `market_bases` | delete | no access | no access | no access (a company's base is never deleted) |
| `market_positions` | read | no access | own rows | yes |
| `market_positions` | insert | no access | no access | yes \*\* (through `market_trade()`) |
| `market_positions` | update | no access | no access | yes \*\* (through `market_trade()`) |
| `market_positions` | delete | no access | no access | yes \*\* (through `market_trade()`, when a player sells everything) |
| `market_trades` | read | no access | own rows | yes |
| `market_trades` | insert | no access | no access | yes \*\* (through `market_trade()`) |
| `market_trades` | update | no access | no access | no access (the history is append-only: rows disappear only when their player is deleted, by cascade) |
| `market_trades` | delete | no access | no access | no access (same) |
| `islets` | read | no access | own row | yes |
| `islets` | insert | no access | no access | yes \*\*\* (through `islet_build()`) |
| `islets` | update | no access | no access | yes \*\*\* (through `islet_build()`) |
| `islets` | delete | no access | no access | no access (an islet is deleted only with its player, by cascade) |
| `islet_buildings` | read | no access | own rows | yes |
| `islet_buildings` | insert | no access | no access | yes \*\*\* (through `islet_build()`) |
| `islet_buildings` | update | no access | no access | no access (a building is never changed in this version) |
| `islet_buildings` | delete | no access | no access | no access (deleted with its player, by cascade) |

\* The database lets the server update `wallets` and add ledger rows directly, because `apply_wallet_transaction()` runs with the server's rights and needs both. Our rule is that the server does this only through that function. A direct update skips the ledger row, so the balance no longer matches the ledger. Reading a balance in Python and then writing a new one can lose coins when two requests arrive together. The function cannot. A direct ledger insert would also skip the direction check, because that check lives in the function (a table rule cannot look into `wallet_reasons`). The foreign key still refuses an unknown reason, and the table still refuses a missing or blank `ref`.

\*\* The database lets the server write `market_positions` and add `market_trades` rows directly, and add and change `market_bases` rows directly, because the two functions run with the rights of the server. "Through `market_trade()`" and "through `market_set_base()`" in the table are our rule, not something the database enforces (the same pattern as `wallets` above). A direct write would skip the checks of `market_trade()`: the arithmetic, the daily cap, the holding time and the wallet. Only the server holds that right, and the code never writes these tables directly.

\*\*\* The database lets the server add `islets` and `islet_buildings` rows and change `islets` rows directly, because `islet_build()` runs with the rights of the server. "Through `islet_build()`" in the table is our rule, not something the database enforces (the same pattern as `wallets` and the Exchange tables above). A direct write would skip the checks of `islet_build()`: the wallet, the timber, the one building per plot and the repeat check. Only the server holds that right, and the code never writes these tables directly. The server cannot edit or delete a building at all, and that is a lock: a signal station, once built, stays, and the finale counts on it.

Rows disappear from the ledger only when their player is deleted: deleting a player (a `profiles` row, or the user under Authentication > Users) also deletes their save, wallet, ledger rows and seats, and the crews they started, through cascading foreign keys. No role needs a `delete` right on those tables for that.

| Function or counter | Visitor (`anon`) | Signed-in player (`authenticated`) | Server (`service_role`) |
|---|---|---|---|
| `apply_wallet_transaction()` | no access | no access | yes |
| `is_crew_member()` | no access | yes, and it only ever answers for the caller | no access, the server skips RLS and does not need it |
| `handle_new_user()` | no access | no access | no access, only the sign-up trigger runs it |
| `touch_updated_at()` | no access | no access | no access, only the triggers run it |
| `wallet_transactions_id_seq` (the ledger's id counter) | no access | no access | no access, the table's own inserts do not need a right on it |
| `market_trade()` | no access | no access | yes |
| `market_set_base()` | no access | no access | yes |
| `islet_build()` | no access | no access | yes |
| `market_trades_id_seq` (the trade history's id counter) | no access | no access | no access, the table's own inserts do not need a right on it |

"No access" means the database refuses with `permission denied`, or (for a row that belongs to someone else) shows or changes nothing.

Supabase's security advisor may warn that a signed-in player can run a `SECURITY DEFINER` function. That is `is_crew_member()`, and it is on purpose. It takes a crew id, compares it with the caller's own id (`auth.uid()`), and returns only true or false. It cannot tell anyone who sits in somebody else's crew.

## What the server's secret key may do

- It skips row-level security. It can read every player's rows in every table and write `profiles`, `saves`, `crews` and `crew_seats` (and, see below, the Exchange tables). Its table rights are still limited: it can update `wallets` but not insert or delete one, it can add ledger rows but not edit or delete one, and it can only read `wallet_reasons`.
- It is the only role that may run `apply_wallet_transaction()`. That is the one way to change a balance. The same holds for `market_trade()` (a trade) and `market_set_base()` (a company's base): the server runs them, nobody else.
- On the Exchange tables it can read all three, add and change `market_bases`, add, change and delete `market_positions`, and only add `market_trades` rows. It cannot edit or delete a trade. Like the wallet, this is a rule of the team more than a lock: see the second footnote of the matrix.
- On the home islet tables it can read both, add and change `islets` rows (the timber), and only add `islet_buildings` rows. It cannot edit or delete a building, and it cannot delete an islet. It is the only role that may run `islet_build()`. Like the wallet, this is a rule of the team more than a lock: see the third footnote of the matrix.
- Because it skips RLS, the Python code must first check who is asking (the player's verified login token) and only then touch that player's rows.
- It must never reach a browser, the repository, a log or a screenshot. It lives only in the `SUPABASE_SECRET_KEY` environment variable on Vercel, and in a local `.env` file that git ignores.
- The browser only gets `SUPABASE_PUBLISHABLE_KEY` (as `VITE_SUPABASE_PUBLISHABLE_KEY`). That key is safe to show because the two locks above protect every table, and the browser has no right to write to any of them.

## Manual test plan

You need about 30 minutes. It proves the rules for reading and writing, the money function, the eight reasons and the crews with two test players, A and B.

The steps 1 to 17 check the foundation migration. If the Island Exchange migration is applied too, read **11** instead of 8 for the number of reasons in steps 4 and 16. Step 15 still tests the first eight reasons. The checks of the Island Exchange, including its three new reasons, are the steps E1 to E13 after step 17. The checks of the home islet are the steps H1 to H15 at the end of this plan.

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

### Island Exchange checks (steps E1 to E13)

These steps test the second migration. Run them after the foundation migration and the Island Exchange migration are both applied. Use **two new test users**, A and B (create them as in the set-up of this plan, so their balances start at 0), and replace `USER_A_ID` and `USER_B_ID` with their ids. The trade function takes its limits as arguments, so the blocks below pass them in: a holding time of 600 seconds, a daily cap, the start of the market day (here "one hour ago"), the fee rate in basis points (200 = 2 %) and the most one purchase may be worth (500 coins). The database also checks that the coins and the fee follow from the units and the price, so every number in the blocks below is the right one for its trade.

**E1. A buy.** Give both players 1000 coins and save the base of the company, as the server does before the first trade (`market_trade()` refuses a company that has no base). Then player A buys 5 units at 12.34. The shares cost 5 x 12.34 = 61.70, rounded **up** to 62 coins, and the fee is 2 % of 62 = 1.24, rounded up to 2.

```sql
set local role service_role;
select public.apply_wallet_transaction('USER_A_ID', 1000, 'kit_grant', 'exchange-kit') as a_balance,
       public.apply_wallet_transaction('USER_B_ID', 1000, 'kit_grant', 'exchange-kit') as b_balance,
       public.market_set_base('harbor-trust', 60.00, 76159.21, now(), 'live', null, null, 0) as harbor_trust_base;
```

Expected: `a_balance` and `b_balance` are 1000, and `harbor_trust_base` is 1 (the first version of the row). Now the buy (a new run):

```sql
set local role service_role;
select public.market_trade('USER_A_ID', 'harbor-trust', 'buy', 5, 12.34, 62, 2, 'market:manual-1', 600, 2000, now() - interval '1 hour', 200, 500) as result;
```

Expected: `result` has `status` `done`, `balance` 936, `unitsAfter` 5, `avgPrice` 12.34 and a `tradeId`. We call the next block the **Exchange check** and use it again below (default role):

```sql
select w.balance,
       (select units from public.market_positions p where p.player_id = w.player_id and p.company_id = 'harbor-trust') as units,
       (select count(*) from public.market_trades t where t.player_id = w.player_id) as trades,
       (select string_agg(t.reason || ' ' || t.delta, ', ' order by t.id) from public.wallet_transactions t where t.player_id = w.player_id and t.ref = 'market:manual-1') as ledger
from public.wallets w
where w.player_id = 'USER_A_ID';
```

Expected: `balance` 936, `units` 5, `trades` 1 and `ledger` `market_buy -62, market_fee -2` (two ledger rows with the same ref).

**E2. Selling too early is refused.** The holding time counts from the latest purchase.

```sql
set local role service_role;
select public.market_trade('USER_A_ID', 'harbor-trust', 'sell', 2, 15.00, 30, 1, 'market:manual-2', 600, 2000, now() - interval '1 hour', 200, 500) as result;
```

Expected: `status` `refused`, `reason` `holding_time`, and `waitSeconds` about 600 (a little less, the longer you waited after the buy). Nothing changed: the Exchange check still shows 936, 5, 1.

**E3. A sale after 10 minutes.** Pretend the 10 minutes have passed (default role), then sell 2 units at 15.00. The shares bring 2 x 15 = 30 coins, and the fee is 2 % of 30 = 0.6, rounded up to 1.

```sql
update public.market_positions set last_buy_at = now() - interval '11 minutes' where player_id = 'USER_A_ID';
```

```sql
set local role service_role;
select public.market_trade('USER_A_ID', 'harbor-trust', 'sell', 2, 15.00, 30, 1, 'market:manual-3', 600, 2000, now() - interval '1 hour', 200, 500) as result;
```

Expected: `status` `done`, `balance` 965 (936 + 30 - 1), `unitsAfter` 3, `avgPrice` 12.34 (a sale does not change the average price). The Exchange check: 965, 3, 2 trades.

**E4. Selling more than you hold is refused.**

```sql
set local role service_role;
select public.market_trade('USER_A_ID', 'harbor-trust', 'sell', 4, 15.00, 60, 2, 'market:manual-4', 600, 2000, now() - interval '1 hour', 200, 500) as result;
```

Expected: `status` `refused`, `reason` `not_enough_units`, `unitsHeld` 3.

**E5. The same ref twice changes nothing.** Run the buy of E1 again, with the same ref `market:manual-1`:

```sql
set local role service_role;
select public.market_trade('USER_A_ID', 'harbor-trust', 'buy', 5, 12.34, 62, 2, 'market:manual-1', 600, 2000, now() - interval '1 hour', 200, 500) as result;
```

Expected: an error, message `already_applied` (error code `23505`, the same code as a repeated wallet ref). The Exchange check is still 965, 3, 2.

**E6. Not enough coins.** Player B has 1000 coins and tries to buy shares worth 1234. The block raises the daily cap and the limit of one purchase to 5000, so that the wallet is what says no:

```sql
set local role service_role;
select public.market_trade('USER_B_ID', 'harbor-trust', 'buy', 100, 12.34, 1234, 25, 'market:manual-5', 600, 5000, now() - interval '1 hour', 200, 5000) as result;
```

Expected: an error `insufficient_funds`. B still has 1000 coins and no position (run the Exchange check with `USER_B_ID`: `balance` 1000, `units` empty, `trades` 0).

**E7. The daily buy cap.** Player A has bought 62 coins of shares today. With a cap of 80, one more buy of 30 would make 92:

```sql
set local role service_role;
select public.market_trade('USER_A_ID', 'harbor-trust', 'buy', 3, 10.00, 30, 1, 'market:manual-6', 600, 80, now() - interval '1 hour', 200, 500) as result;
```

Expected: `status` `refused`, `reason` `daily_cap`, `coinsLeft` 18.

**E8. A paused company.** The server saves a pause with `market_set_base()` (the first number after the name is the game price, then the real price, the time, the source, the end of the pause and the frozen price; the last 0 means "no row yet"):

```sql
set local role service_role;
select public.market_set_base('swiftwater-ferries', 24.00, 100.50, now(), 'live', now() + interval '15 minutes', 31.20, 0) as version;
```

Expected: `version` 1. Now player B tries to buy that company:

```sql
set local role service_role;
select public.market_trade('USER_B_ID', 'swiftwater-ferries', 'buy', 1, 31.20, 32, 1, 'market:manual-7', 600, 2000, now() - interval '1 hour', 200, 500) as result;
```

Expected: `status` `refused`, `reason` `halted`. End the pause (default role) and try again with a new ref:

```sql
update public.market_bases set halted_until = now() - interval '1 second' where company_id = 'swiftwater-ferries';
```

```sql
set local role service_role;
select public.market_trade('USER_B_ID', 'swiftwater-ferries', 'buy', 1, 31.20, 32, 1, 'market:manual-8', 600, 2000, now() - interval '1 hour', 200, 500) as result;
```

Expected: `status` `done`, `balance` 967 (1000 - 32 - 1).

**E9. Two servers saving the same base.** The caller passes the version it read. Only the right version wins:

```sql
set local role service_role;
select public.market_set_base('swiftwater-ferries', 24.00, 100.50, now(), 'live', null, null, 0) as create_again,
       public.market_set_base('swiftwater-ferries', 24.00, 101.00, now(), 'live', null, null, 1) as right_version,
       public.market_set_base('swiftwater-ferries', 24.00, 102.00, now(), 'live', null, null, 1) as old_version;
```

Expected: `create_again` is empty (null: the row exists), `right_version` is 2, `old_version` is empty (the version is 2 now).

**E10. Players see only their own trades and positions.**

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_A_ID", "role": "authenticated"}', true);
select (select count(*) from public.market_positions) as positions_seen,
       (select count(*) from public.market_trades) as trades_seen,
       (select count(*) from public.market_trades where player_id = 'USER_B_ID') as b_trades_seen,
       (select count(*) from public.market_bases) as bases_seen;
```

Expected: `positions_seen` 1, `trades_seen` 2, `b_trades_seen` 0 and `bases_seen` 2 (every signed-in player may read the company bases; there are two rows so far, harbor-trust from E1 and swiftwater-ferries from E8, and there are 7 once the server has shown the price board).

**E11. Players cannot write, and a visitor gets nothing.** Each statement fails with `permission denied`:

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_A_ID", "role": "authenticated"}', true);
update public.market_positions set units = 1000000 where player_id = 'USER_A_ID';
```

Expected: `permission denied for table market_positions`. Now replace the last line and run again. Each one fails the same way:

| Statement as player A | Expected error mentions |
|---|---|
| `insert into public.market_trades (player_id, company_id, side, units, price, gross, fee, ref) values ('USER_A_ID', 'harbor-trust', 'sell', 1, 1, 1, 0, 'x');` | `permission denied for table market_trades` |
| `update public.market_bases set base_game_price = 1000;` | `permission denied for table market_bases` |
| `delete from public.market_trades where player_id = 'USER_A_ID';` | `permission denied for table market_trades` |
| `select public.market_trade('USER_A_ID', 'harbor-trust', 'buy', 1, 1, 1, 0, 'x', 0, 100, now(), 200, 500);` | `permission denied for function market_trade` |
| `select public.market_set_base('harbor-trust', 1, 1, now(), 'live', null, null, 0);` | `permission denied for function market_set_base` |

Change the first line to `set local role anon;` (and drop the `set_config` line) and run `select * from public.market_positions;`, then the same for `market_trades` and `market_bases`. Expected: `permission denied for table ...` each time. Even the server cannot edit the history:

```sql
set local role service_role;
update public.market_trades set gross = 1 where player_id = 'USER_A_ID';
```

Expected: `permission denied for table market_trades`.

**E12. The database checks the arithmetic.** The server works out the coins of a trade. The database recomputes them, so it stays right even if the server has a bug. Each statement below is refused, as the server (role `service_role`) with the error in the right column, and changes nothing. Put `set local role service_role;` in front of each, run it, and then run the Exchange check: it still shows 965, 3 and 2.

| Statement | Why it is wrong | Expected error |
|---|---|---|
| `select public.market_trade('USER_A_ID', 'harbor-trust', 'buy', 5, 12.34, 61, 2, 'market:manual-9', 600, 2000, now() - interval '1 hour', 200, 500);` | 5 x 12.34 = 61.70 must be rounded **up** to 62 for a buy | `bad_trade` |
| `select public.market_trade('USER_A_ID', 'harbor-trust', 'sell', 1, 0.01, 400, 8, 'market:manual-9', 600, 2000, now() - interval '1 hour', 200, 500);` | the coins have nothing to do with the price | `bad_trade` |
| `select public.market_trade('USER_A_ID', 'harbor-trust', 'buy', 5, 12.34, 62, 0, 'market:manual-9', 600, 2000, now() - interval '1 hour', 200, 500);` | a fee of 0: it must be 2 % of 62, rounded up, which is 2 | `bad_trade` |
| `select public.market_trade('USER_A_ID', 'harbor-trust', 'buy', 501, 1.00, 501, 11, 'market:manual-9', 600, 5000, now() - interval '1 hour', 200, 500);` | a purchase worth 501 coins, over the limit of 500 | `bad_trade` |
| `select public.market_trade('USER_A_ID', 'harbor-trust', 'buy', 1, 1.00, 1, 1, 'market:manual-9', 600, 2000, now() + interval '1 day', 200, 500);` | the market day starts tomorrow, so the daily cap would count nothing | `bad_trade` |
| `select public.market_trade('USER_A_ID', 'no-such-company', 'buy', 1, 1.00, 1, 1, 'market:manual-9', 600, 2000, now() - interval '1 hour', 200, 500);` | the company has no base | `unknown_company` |

A sale has no upper limit, because a price can rise until a few units are worth more than a purchase may be. Run this with player A's remaining 3 units, after the holding time (default role first):

```sql
update public.market_positions set last_buy_at = now() - interval '11 minutes' where player_id = 'USER_A_ID';
```

```sql
set local role service_role;
select public.market_trade('USER_A_ID', 'harbor-trust', 'sell', 3, 400.00, 1200, 24, 'market:manual-10', 600, 2000, now() - interval '1 hour', 200, 500) as result;
```

Expected: `status` `done`, `balance` 2141 (965 + 1200 - 24) and `unitsAfter` 0: a sale worth 1200 coins is fine, although a purchase over 500 is refused. The Exchange check now shows 2141, no units and 3 trades.

**E13. The reasons, and running the migration again.** The three new reasons are in the list (default role):

```sql
select reason, direction from public.wallet_reasons where reason like 'market\_%' order by reason;
```

Expected: 3 rows: `market_buy` spend, `market_fee` spend, `market_sell` earn. The wallet refuses a wrong direction, for example a purchase that adds coins:

```sql
set local role service_role;
select public.apply_wallet_transaction('USER_A_ID', 10, 'market_buy', 'manual-wrong-1');
```

Expected: `wrong_direction`. Finally paste the whole Island Exchange migration into the SQL editor again and run it. Expected: no error, the Exchange check for player A still shows what it showed after E12 (`balance` 2141, no units, 3 trades), and `select count(*) from public.wallet_reasons;` still shows 11.

Delete the two test users when you are done (**Authentication > Users**). Their positions and trades go with them.

### Home islet checks (steps H1 to H15)

These steps test the home islet migration. Run them after the foundation migration and the home islet migration are both applied (the Island Exchange migration is not needed). Use **two new test users**, A and B (create them as in the set-up of this plan, so their balances start at 0), and replace `USER_A_ID` and `USER_B_ID` with their ids. `islet_build()` takes the prices and the starter pack as arguments, so every block below passes them in: 300 coins and 10 timber for a building, and a starter pack of 20 timber, the numbers of `backend/content/buildings.json`. Every block uses a new ref (`islet:manual-1`, `islet:manual-2`, and so on), except where a step repeats one on purpose. Run each block in its own run, with the role left on the default (`postgres`).

**H1. Set-up.** Give player A 1000 coins and player B 100 coins, with the entry kit reason and the fixed ref `kit`:

```sql
set local role service_role;
select public.apply_wallet_transaction('USER_A_ID', 1000, 'kit_grant', 'kit') as a_balance,
       public.apply_wallet_transaction('USER_B_ID', 100, 'kit_grant', 'kit') as b_balance;
```

Expected: `a_balance` 1000 and `b_balance` 100. Neither player has an islet yet (default role):

```sql
select (select count(*) from public.islets where player_id in ('USER_A_ID', 'USER_B_ID')) as islet_rows,
       (select count(*) from public.islet_buildings where player_id in ('USER_A_ID', 'USER_B_ID')) as buildings;
```

Expected: `islet_rows` 0 and `buildings` 0. The islet row appears with the first build.

**H2. A builds the signal station.** The station costs 300 coins and 10 timber. The islet row is made with the starter pack of 20 timber:

```sql
set local role service_role;
select public.islet_build('USER_A_ID', 'islet_signal_station', 'signal_station', 300, 10, 20, 'islet:manual-1') as result;
```

Expected: `result` has `status` `done`, `balance` 700, `timber` 10 and `level` 1.

**H3. The islet check.** We call the next block the **islet check** and use it again below (default role):

```sql
select w.balance,
       (select i.timber from public.islets i where i.player_id = w.player_id) as timber,
       (select string_agg(b.plot || ' ' || b.building_type || ' L' || b.level, ', ' order by b.plot) from public.islet_buildings b where b.player_id = w.player_id) as buildings,
       (select string_agg(t.reason || ' ' || t.delta, ', ' order by t.id) from public.wallet_transactions t where t.player_id = w.player_id and t.ref = 'islet:manual-1') as ledger
from public.wallets w
where w.player_id = 'USER_A_ID';
```

Expected after H2: `balance` 700, `timber` 10, `buildings` `islet_signal_station signal_station L1` and `ledger` `building_purchase -300` (one ledger row, with the same ref as the building).

**H4. The same ref twice changes nothing.** Run the build of H2 again, with the same ref `islet:manual-1`:

```sql
set local role service_role;
select public.islet_build('USER_A_ID', 'islet_signal_station', 'signal_station', 300, 10, 20, 'islet:manual-1') as result;
```

Expected: an error, message `already_applied` (error code `23505`, the same code as a repeated wallet ref). The islet check is unchanged: 700, 10, one building, one ledger row.

**H5. One building per plot.** A new ref on the same plot is refused, and nothing is charged:

```sql
set local role service_role;
select public.islet_build('USER_A_ID', 'islet_signal_station', 'signal_station', 300, 10, 20, 'islet:manual-2') as result;
```

Expected: `status` `refused`, `reason` `plot_occupied` and `standing` `signal_station`. The islet check is unchanged: 700 and 10.

**H6. A second building uses the last timber.** The workshop on `plot_2`. The starter pack is not given a second time:

```sql
set local role service_role;
select public.islet_build('USER_A_ID', 'plot_2', 'workshop', 300, 10, 20, 'islet:manual-3') as result;
```

Expected: `status` `done`, `balance` 400, `timber` 0 and `level` 1.

**H7. Too little timber.** A has no timber left, so the greenhouse on `plot_4` is refused before any coin moves:

```sql
set local role service_role;
select public.islet_build('USER_A_ID', 'plot_4', 'greenhouse', 300, 10, 20, 'islet:manual-4') as result;
```

Expected: `status` `refused`, `reason` `not_enough_timber` and `timberHeld` 0. The islet check shows 400 and 0.

**H8. Too few coins.** Player B has 100 coins and tries the 300-coin station:

```sql
set local role service_role;
select public.islet_build('USER_B_ID', 'islet_signal_station', 'signal_station', 300, 10, 20, 'islet:manual-5') as result;
```

Expected: an error `insufficient_funds`. Nothing is left behind, not even the islet row that the build made first. We call the next block the **B check** (default role):

```sql
select (select balance from public.wallets where player_id = 'USER_B_ID') as balance,
       (select count(*) from public.islets where player_id = 'USER_B_ID') as islet_rows,
       (select count(*) from public.wallet_transactions where player_id = 'USER_B_ID' and reason = 'building_purchase') as purchases;
```

Expected: `balance` 100, `islet_rows` 0 and `purchases` 0.

**H9. The database keeps a plot and its building together.** Player B sends the windmill for `plot_2`. The price here is 50 coins, so that B can pay it and the table rule is what says no:

```sql
set local role service_role;
select public.islet_build('USER_B_ID', 'plot_2', 'windmill', 50, 10, 20, 'islet:manual-6') as result;
```

Expected: an error that mentions the check rule `islet_buildings_plot_fits_building`. Everything is rolled back, the 50 coins included: the B check shows 100, 0 and 0.

**H10. A player who does not exist.**

```sql
set local role service_role;
select public.islet_build('00000000-0000-4000-8000-000000000000', 'plot_2', 'workshop', 300, 10, 20, 'islet:manual-7') as result;
```

Expected: `status` `refused` and `reason` `player_not_set_up`. Nothing was made.

**H11. Arguments that make no sense.** A price of 0 coins:

```sql
set local role service_role;
select public.islet_build('USER_A_ID', 'plot_3', 'windmill', 0, 10, 20, 'islet:manual-8') as result;
```

Expected: an error `bad_build`. Now a negative price in timber:

```sql
set local role service_role;
select public.islet_build('USER_A_ID', 'plot_3', 'windmill', 300, -1, 20, 'islet:manual-8') as result;
```

Expected: an error `bad_build`. The islet check still shows 400 and 0.

**H12. Who may read, and who may not.** As player A (the block sets the role and the login for that run):

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_A_ID", "role": "authenticated"}', true);
select (select count(*) from public.islets) as islet_rows,
       (select count(*) from public.islet_buildings) as buildings_seen,
       (select count(*) from public.islet_buildings where player_id = 'USER_B_ID') as b_buildings_seen;
```

Expected: `islet_rows` 1, `buildings_seen` 2 and `b_buildings_seen` 0. Now as player B:

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_B_ID", "role": "authenticated"}', true);
select (select count(*) from public.islets) as islet_rows,
       (select count(*) from public.islet_buildings) as buildings_seen,
       (select count(*) from public.islet_buildings where player_id = 'USER_A_ID') as a_buildings_seen;
```

Expected: all three numbers are 0. B sees none of A's islet. Now player A tries to write. Each of the three blocks fails with `permission denied`:

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_A_ID", "role": "authenticated"}', true);
update public.islets set timber = 999 where player_id = 'USER_A_ID';
```

Expected: `permission denied for table islets`.

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_A_ID", "role": "authenticated"}', true);
insert into public.islet_buildings (player_id, plot, building_type, level, coins_paid, timber_paid, ref) values ('USER_A_ID', 'plot_3', 'windmill', 1, 1, 0, 'x');
```

Expected: `permission denied for table islet_buildings`.

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_A_ID", "role": "authenticated"}', true);
select public.islet_build('USER_A_ID', 'plot_3', 'windmill', 1, 0, 20, 'x');
```

Expected: `permission denied for function islet_build`. A visitor who is not signed in gets nothing at all. Each of the two blocks fails with `permission denied for table ...`:

```sql
set local role anon;
select * from public.islets;
```

```sql
set local role anon;
select * from public.islet_buildings;
```

**H13. Even the server cannot edit or delete a building.** A building is never changed in this version, and the finale counts on a signal station staying:

```sql
set local role service_role;
update public.islet_buildings set level = 2 where player_id = 'USER_A_ID';
```

Expected: `permission denied for table islet_buildings`. And an islet cannot be deleted by hand either:

```sql
set local role service_role;
delete from public.islets where player_id = 'USER_A_ID';
```

Expected: `permission denied for table islets`.

**H14. Running the migration again is harmless.** Paste the whole home islet migration into the SQL editor again and run it. Expected: no error, and the islet check still shows 400, 0, the two buildings `islet_signal_station signal_station L1, plot_2 workshop L1` and the same ledger row as before. The quick checks still show the same tables and policies.

**H15. Deleting a player removes their islet.** Delete both test users under **Authentication > Users**. Then run:

```sql
select (select count(*) from public.islets where player_id in ('USER_A_ID', 'USER_B_ID')) as islet_rows,
       (select count(*) from public.islet_buildings where player_id in ('USER_A_ID', 'USER_B_ID')) as buildings,
       (select count(*) from public.wallet_transactions where player_id in ('USER_A_ID', 'USER_B_ID')) as ledger_rows;
```

Expected: all three numbers are 0.

**Optional: the race.** Two builds of the same player at the same moment must build once. Create a third test user C and give C 1000 coins as in H1 (ref `kit`). Open two SQL editor tabs. In the first tab run (it holds its transaction open for 10 seconds):

```sql
begin;
select public.islet_build('USER_C_ID', 'islet_signal_station', 'signal_station', 300, 10, 20, 'islet:manual-9');
select pg_sleep(10);
commit;
```

Within those 10 seconds, run this in the second tab:

```sql
set local role service_role;
select public.islet_build('USER_C_ID', 'islet_signal_station', 'signal_station', 300, 10, 20, 'islet:manual-10') as result;
```

Expected: the second tab waits until the first commits, and then answers `refused` with `plot_occupied`. C has 700 coins, 10 timber and one building: the wallet lock made the second build wait and then see the first. Delete user C when you are done.

Delete the test users when you are done (**Authentication > Users**). Their islets and buildings go with them.

## Changing the database later

- Never edit a migration that has been applied anywhere. Add a new file named `supabase/migrations/<YYYYMMDDHHMMSS>_<topic>.sql` with a later time stamp.
- A new table needs, in the same file: row-level security switched on, policies, **explicit grants** (our project gives no rights to a new table, so nothing works until you grant them, and you grant only what is really needed), and a comment on the table, every column and every policy. Take every right away first (`revoke all` from `public`, `anon`, `authenticated` and `service_role`), then grant. The browser only reads, so `authenticated` gets `select` at most. If the table has an identity column (`generated always as identity`), also revoke all rights on its counter, as the foundation file does for `wallet_transactions_id_seq`. Copy the style of the foundation file.
- A new function needs `revoke ... from public, anon, authenticated` and then `grant execute` only to the role that must run it. Start it with `set search_path = ''`.
- A new wallet reason is one new migration with one `insert into public.wallet_reasons (reason, direction, description) values (...) on conflict (reason) do nothing;`, plus the same `(reason, direction)` pair added at the **end** of `WALLET_REASONS` in `backend/server/wallet.py`, in the same pull request. Never rename a reason or change its direction, because ledger rows point at it. The test `backend/server/tests/test_wallet_matches_migration.py` reads every migration in order and fails if the two lists differ. Add the reason to the manual test plan (step 15) too.
- Realtime is not switched on for these tables yet. The work package that needs it adds it.
- If something here is unclear, open an issue before changing the rules for money.
