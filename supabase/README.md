# Supabase database

This folder holds the database of The Great Plot Twist. Supabase gives us the login (GitHub sign-in), a Postgres database and realtime. Everything the game must remember lives here: who the players are, their saved progress, their coins and their crews.

Play money only: coins cannot be bought, cashed out or exchanged for real prizes. Every player starts with 0 coins. The first coins come later, from the intro entry kit (the `kit_grant` reason).

The browser only reads from this database. Every write comes from our Python server with the secret key.

| File | What it is |
|---|---|
| [migrations/20261106000000_foundation.sql](migrations/20261106000000_foundation.sql) | The first migration: seven tables, the security rules, the rights of each database role and four functions. Every table, column and policy is explained inside the file. |
| [migrations/20261106010000_island_exchange.sql](migrations/20261106010000_island_exchange.sql) | The second migration, for the Island Exchange (package L4): three wallet reasons, three tables and two functions. Run it after the first. See [The Island Exchange migration](#the-island-exchange-migration). |
| [migrations/20261106110000_lantern_duels.sql](migrations/20261106110000_lantern_duels.sql) | The third migration, for Lantern Duels (package A7): two wallet reasons, two tables and three functions. Run it after the second. See [The Lantern Duels migration](#the-lantern-duels-migration). |

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
| `arena_stake` | spend | Coins held as the stake of a Lantern Duel. *Added by the third migration.* |
| `arena_payout` | earn | Coins paid out of a Lantern Duel: the winnings, or a stake that comes back. *Added by the third migration.* |

The first eight come from the foundation migration, the next three from the Island Exchange migration and the last two from the Lantern Duels migration. The direction says which way the coins move. **earn** adds coins, so the amount must be above 0. **spend** takes coins away, so the amount must be below 0. **either** may go both ways, but never 0. `apply_wallet_transaction()` looks the reason up and checks the direction before it touches the balance, and the Python code checks the same rule even earlier. The `reason` column of the ledger is also a foreign key to `wallet_reasons`, so an unknown reason cannot get into the ledger by any route.

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

## The Lantern Duels migration

`migrations/20261106110000_lantern_duels.sql` is the database part of Lantern Duels (package A7): two captains each seal a sequence of lantern signals, the server opens both envelopes at once, and the duel is friendly or played for equal play-coin stakes (see [INTERFACES.md, section 2](../docs/INTERFACES.md#lantern-duels-package-a7), decision [D018](../docs/DECISIONS.md) and the spec [A7-lantern-duels.md](../specs/A7-lantern-duels.md)). Run it **after** the Island Exchange migration (it uses the wallet and the profiles from the first). It is safe to run twice. Everything is explained in the file itself. It adds two wallet reasons, `arena_stake` and `arena_payout` (see the table above), and:

| Name | What it is | Who changes it |
|---|---|---|
| `duels` | One row per challenge: who, the number of rounds, the stake, the status (`open`, then once `finished`, `withdrawn`, `declined` or `expired`) and, once decided, the result of every round. It never holds a signal. `create_uid` (the `actionUid` of the click) is unique per challenger, so a repeated click cannot send two challenges. | Only the server, through `duel_create()`, `duel_answer()` and `duel_void()`. |
| `duel_moves` | The sealed envelopes: one row per captain and round, holding a signal. The only table with a signal, so it is locked tighter than any other: players have no right on it at all (not even for their own rows), the server may only read and insert, and no role may update or delete a row. | Only `duel_create()` and `duel_answer()`. |
| `duel_create()` | Sends a challenge. In one step: check the arguments, lock the challenger's wallet, refuse a repeated `create_uid` (code `23505`, message `already_applied`), find a named captain (any letter case) and refuse a name nobody has, a name several captains share and the challenger's own name, refuse a fourth waiting challenge, insert the duel and the challenger's envelope, and hold the stake (`arena_stake`). | Run by the server only. |
| `duel_answer()` | Answers a challenge. The answer IS the acceptance. In one step: lock the duel row, refuse a caller who sealed in this duel already (`23505`), check the state (`duel_taken`, `duel_closed`, `duel_expired` by the database clock), check the numbers, lock both wallets in player-id order, refuse the pair limit (`daily_pair_limit`), take the answerer's stake, store their envelope, finish the duel and pay out (`arena_payout`). **The round results and the outcome are an input from Python** (`rules.resolve`), like the price of a trade: the database never reads the challenger's envelope, but it checks that the results fit the rounds and that the outcome fits the counted points. | Run by the server only. |
| `duel_void()` | Withdraws (the challenger), declines (the named captain) or expires (anyone, but only after `expires_at` by the database clock) a challenge, and gives the challenger's stake back (`arena_payout`). The same captain closing it the same way twice raises `23505`. | Run by the server only. |

Like `market_trade()`, each function either does its work (`{"status": "done", ...}`) or *returns* a refusal (`{"status": "refused", "reason": "duel_taken"}`) before it writes anything, and *raises* an error for a real failure: `insufficient_funds` (from the wallet), a repeat (code `23505`, message `already_applied`), or `bad_duel` / `wallet_not_found` when the server sent numbers that do not fit (a bug on the server side). Every ledger row of a duel carries the ref `duel:` and the duel id, so a stake or a payout cannot be booked twice. The cut (5 % of the pot, rounded in the winner's disfavour) has no ledger row: it is simply not paid out. The arena rows of one duel add up to 0 for a friendly duel, a draw, a withdrawal, a decline or an expiry, and to minus the cut for a decided staked duel (-1, -3, -5 or -10 for stakes of 10, 25, 50 or 100). The locks are always taken in the same order, the duel row first and then the wallets by player id, so two requests never wait for each other forever.

After applying it, the three quick checks below show **twelve** tables and **eleven** policies, **eleven** rows for `authenticated` (none for `duel_moves`), and there are **thirteen** wallet reasons. Run the Lantern Duels checks (steps D1 to D12) at the end of the manual test plan.

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
6. Do the same with `migrations/20261106110000_lantern_duels.sql` (Lantern Duels), in a new query.

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

Expected: the seven tables `crew_seats`, `crews`, `profiles`, `saves`, `wallet_reasons`, `wallet_transactions`, `wallets`, each with `rls_on` = true. After the Island Exchange migration there are ten: also `market_bases`, `market_positions` and `market_trades`. After the Lantern Duels migration there are twelve: also `duels` and `duel_moves`.

```sql
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Expected: 7 policies, one on each table, and every `cmd` is `SELECT`. There is no policy that lets a player write. After the Island Exchange migration there are 10 (one more on each new table). After the Lantern Duels migration there are 11: one more, on `duels`. `duel_moves` has no policy on purpose: with row-level security on and no policy, even a wrong grant would show a player nothing.

```sql
select grantee, table_name, string_agg(privilege_type, ', ' order by privilege_type) as rights
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
group by grantee, table_name
order by grantee, table_name;
```

Expected: no row for `anon`. For `authenticated`, 7 rows (one per table), and `rights` is `SELECT` in every row. After the Island Exchange migration: 10 rows. After the Lantern Duels migration: 11 rows, because `duels` is added with `SELECT`. There is no row for `duel_moves`: a player has no right on it.

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
| `duels` | read | no access | the duels they take part in (as challenger or opponent) | yes |
| `duels` | insert | no access | no access | yes \*\*\* (through `duel_create()`) |
| `duels` | update | no access | no access | yes \*\*\* (through `duel_answer()` and `duel_void()`) |
| `duels` | delete | no access | no access | no access (a duel goes only by cascade, when a challenger is deleted) |
| `duel_moves` | read | no access | **no access, not even their own** | yes |
| `duel_moves` | insert | no access | no access | yes \*\*\* (through `duel_create()` and `duel_answer()`) |
| `duel_moves` | update | no access | no access | **no access**: sealed means sealed |
| `duel_moves` | delete | no access | no access | **no access**: rows go only by cascade, with their duel or their captain |

\* The database lets the server update `wallets` and add ledger rows directly, because `apply_wallet_transaction()` runs with the server's rights and needs both. Our rule is that the server does this only through that function. A direct update skips the ledger row, so the balance no longer matches the ledger. Reading a balance in Python and then writing a new one can lose coins when two requests arrive together. The function cannot. A direct ledger insert would also skip the direction check, because that check lives in the function (a table rule cannot look into `wallet_reasons`). The foreign key still refuses an unknown reason, and the table still refuses a missing or blank `ref`.

\*\* The database lets the server write `market_positions` and add `market_trades` rows directly, and add and change `market_bases` rows directly, because the two functions run with the rights of the server. "Through `market_trade()`" and "through `market_set_base()`" in the table are our rule, not something the database enforces (the same pattern as `wallets` above). A direct write would skip the checks of `market_trade()`: the arithmetic, the daily cap, the holding time and the wallet. Only the server holds that right, and the code never writes these tables directly.

\*\*\* The database lets the server add and change `duels` rows and add `duel_moves` rows directly, because the three functions run with the rights of the server. "Through `duel_create()`" and so on in the table are our rule, not something the database enforces (the same pattern as the footnotes above). A direct write would skip the checks of the functions: the caps, the state of the duel and the wallet. The part that IS enforced by the database is the sealing: the server has no `update` and no `delete` on `duel_moves`, and a player has no right on it at all. Only the server holds the right to write, and the code never writes these tables directly.

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
| `market_trades_id_seq` (the trade history's id counter) | no access | no access | no access, the table's own inserts do not need a right on it |
| `duel_create()` | no access | no access | yes |
| `duel_answer()` | no access | no access | yes |
| `duel_void()` | no access | no access | yes |

"No access" means the database refuses with `permission denied`, or (for a row that belongs to someone else) shows or changes nothing.

Supabase's security advisor may warn that a signed-in player can run a `SECURITY DEFINER` function. That is `is_crew_member()`, and it is on purpose. It takes a crew id, compares it with the caller's own id (`auth.uid()`), and returns only true or false. It cannot tell anyone who sits in somebody else's crew.

## What the server's secret key may do

- It skips row-level security. It can read every player's rows in all twelve tables and write `profiles`, `saves`, `crews` and `crew_seats` (and, see below, the Exchange tables). Its table rights are still limited: it can update `wallets` but not insert or delete one, it can add ledger rows but not edit or delete one, and it can only read `wallet_reasons`.
- It is the only role that may run `apply_wallet_transaction()`. That is the one way to change a balance. The same holds for `market_trade()` (a trade) and `market_set_base()` (a company's base): the server runs them, nobody else.
- On the Exchange tables it can read all three, add and change `market_bases`, add, change and delete `market_positions`, and only add `market_trades` rows. It cannot edit or delete a trade. Like the wallet, this is a rule of the team more than a lock: see the second footnote of the matrix.
- On the Lantern Duels tables it can read `duels` and `duel_moves`, add and change `duels` rows, and add `duel_moves` rows. It cannot delete a duel, and it cannot update or delete a sealed envelope: sealed means sealed. The three functions `duel_create()`, `duel_answer()` and `duel_void()` are the way a duel changes, and nobody but the server runs them.
- Because it skips RLS, the Python code must first check who is asking (the player's verified login token) and only then touch that player's rows.
- It must never reach a browser, the repository, a log or a screenshot. It lives only in the `SUPABASE_SECRET_KEY` environment variable on Vercel, and in a local `.env` file that git ignores.
- The browser only gets `SUPABASE_PUBLISHABLE_KEY` (as `VITE_SUPABASE_PUBLISHABLE_KEY`). That key is safe to show because the two locks above protect every table, and the browser has no right to write to any of them.

## Manual test plan

You need about 30 minutes. It proves the rules for reading and writing, the money function, the eight reasons and the crews with two test players, A and B.

The steps 1 to 17 check the foundation migration. If the Island Exchange migration is applied too, read **11** instead of 8 for the number of reasons in steps 4 and 16, and **13** if the Lantern Duels migration is applied as well. Step 15 still tests the first eight reasons. The checks of the Island Exchange, including its three new reasons, are the steps E1 to E13, and the checks of Lantern Duels, including its two new reasons, are the steps D1 to D12, at the end of this plan.

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

Expected: `wrong_direction`. Finally paste the whole Island Exchange migration into the SQL editor again and run it. Expected: no error, the Exchange check for player A still shows what it showed after E12 (`balance` 2141, no units, 3 trades), and `select count(*) from public.wallet_reasons;` still shows 11 (13 once the Lantern Duels migration is applied too).

Delete the two test users when you are done (**Authentication > Users**). Their positions and trades go with them.

### Lantern Duels checks (steps D1 to D12)

These steps test the third migration. Run them after the foundation, the Island Exchange and the Lantern Duels migrations are all applied. Use **three new test users**, A, B and C (create them as in the set-up of this plan, so their balances start at 0), and replace `USER_A_ID`, `USER_B_ID` and `USER_C_ID` with their ids. Run each block in its own run, with the role left on the default (`postgres`). The server works out the round results of a duel in Python; here you write them by hand (the arrays below are right for their signals). The blocks pass "one day ago" as the start of the day for the pair limit, so every duel of this test counts, and they pass the answer window (24 hours) and the most waiting challenges (3) as the server does. The race (step D3) needs `psql`, because the SQL editor runs each block as its own transaction.

**D0. Names and coins.** The names make the challenges easy to address (a challenger names the opponent by display name, in any letter case). Run the three updates, then give each player 1000 coins (a new run):

```sql
update public.profiles set display_name = 'Duel Alice' where id = 'USER_A_ID';
update public.profiles set display_name = 'Duel Bob'   where id = 'USER_B_ID';
update public.profiles set display_name = 'Duel Carol' where id = 'USER_C_ID';
```

```sql
set local role service_role;
select public.apply_wallet_transaction('USER_A_ID', 1000, 'kit_grant', 'duel-kit') as a_balance,
       public.apply_wallet_transaction('USER_B_ID', 1000, 'kit_grant', 'duel-kit') as b_balance,
       public.apply_wallet_transaction('USER_C_ID', 1000, 'kit_grant', 'duel-kit') as c_balance;
```

Expected: 1000 each. We call the next block the **Duel check** and use it again below (default role). It shows each test player's coins and their arena ledger rows:

```sql
select p.display_name,
       w.balance,
       (select string_agg(t.reason || ' ' || t.delta, ', ' order by t.id)
          from public.wallet_transactions t
         where t.player_id = w.player_id and t.reason like 'arena%') as arena_rows
from public.wallets w
join public.profiles p on p.id = w.player_id
where w.player_id in ('USER_A_ID', 'USER_B_ID', 'USER_C_ID')
order by p.display_name;
```

Expected: three rows (Duel Alice, Duel Bob, Duel Carol), 1000 coins each, and no arena rows yet.

**D1. The worked example, staked 100.** Alice challenges Bob: 5 rounds, 100 coins each. She seals Flash, Shade, Shade, Mirror, Shade (3 of 5 oil). The name is in lower case on purpose:

```sql
set local role service_role;
select public.duel_create('USER_A_ID', 'duel bob', 5, 100, 5,
         array['flash','shade','shade','mirror','shade'], 'duel-test-001', 24, 3) as result;
```

Expected: `status` `done`, `opponentName` `Duel Bob` (the name of the profile, not what you typed) and `balance` 900. Now Bob answers with Mirror, Flash, Shade, Shade, Mirror (4 of 5 oil). Round 1: Bob's Mirror throws Alice's Flash back. Round 2: Bob's Flash outshines Alice's Shade. Round 3: Shade against Shade scores for nobody. Round 4: Bob's Shade leaves Alice's Mirror nothing to throw. Round 5: Alice's Shade leaves Bob's Mirror nothing to throw. The results are `opponent, opponent, even, opponent, challenger` and the outcome is `opponent`, 3 to 1.

```sql
set local role service_role;
select public.duel_answer((select id from public.duels where create_uid = 'duel-test-001'), 'USER_B_ID',
         array['mirror','flash','shade','shade','mirror'], 'duel-answer-001',
         array['opponent','opponent','even','opponent','challenger'], 'opponent',
         now() - interval '1 day', 3) as result;
```

Expected: `status` `done`, `balance` 1090 and `winnerTakes` 190. The Duel check: Duel Alice 900 with `arena_stake -100`, Duel Bob 1090 with `arena_stake -100, arena_payout 190`, Duel Carol 1000. The pot was 200, the winner took 190, and the 10 coins of the cut were simply not paid out. One more look at the duel itself:

```sql
select d.status, d.outcome, d.round_results,
       (select sum(t.delta) from public.wallet_transactions t where t.ref = 'duel:' || d.id::text) as arena_sum,
       (select count(*) from public.duel_moves m where m.duel_id = d.id) as envelope_rows
from public.duels d
where d.create_uid = 'duel-test-001';
```

Expected: `finished`, `opponent`, `{opponent,opponent,even,opponent,challenger}`, `arena_sum` -10 and `envelope_rows` 10 (5 for each captain).

**D2. The same challenge twice changes nothing.** Run the first block of D1 again, with the same `duel-test-001`.

Expected: an error with the message `already_applied` (error code `23505`, the same code as a repeated wallet ref). The Duel check is unchanged (Duel Alice 900), and this shows one duel:

```sql
select count(*) as duels from public.duels where create_uid = 'duel-test-001';
```

**D3. Two captains answer the same open challenge at the same moment (needs psql).** First Alice sends an open challenge (no name), staked 50, 3 rounds:

```sql
set local role service_role;
select public.duel_create('USER_A_ID', null, 3, 50, 5,
         array['flash','shade','shade'], 'duel-test-003', 24, 3) as result;
```

Expected: `done`, `balance` 850. Now open two terminals with `psql` (copy the connection string from **Connect** in the Supabase dashboard; type the database password into the terminal only, never into a file). In terminal 1, Bob answers, but do **not** commit yet:

```text
begin;
set local role service_role;
select public.duel_answer((select id from public.duels where create_uid = 'duel-test-003'), 'USER_B_ID',
         array['mirror','flash','shade'], 'duel-answer-003',
         array['opponent','opponent','even'], 'opponent', now() - interval '1 day', 3) as result;
```

In terminal 2, Carol answers the same duel with the same kind of block (`'USER_C_ID'`, the action id `'duel-answer-003c'`, the same signals and results). It **waits**, because the first answer holds the lock on the duel row. Back in terminal 1 type `commit;`. Terminal 2 now answers: `status` `refused`, `reason` `duel_taken`. Type `commit;` there too.

Expected: Bob's answer was `done`, with `winnerTakes` 95 (a pot of 100 minus a cut of 5) and `balance` 1135 (1090 - 50 + 95). The Duel check: Duel Alice 850, Duel Bob 1135, Duel Carol 1000, and Carol sealed nothing:

```sql
select count(*) as carol_envelope_rows from public.duel_moves where player_id = 'USER_C_ID';
```

Expected: 0.

**D4. A draw returns both stakes.** Alice challenges Carol, 3 rounds, 50 coins each, with Flash, Shade, Shade. Carol answers with Shade, Flash, Shade. Round 1: Alice's Flash outshines Carol's Shade. Round 2: Carol's Flash outshines Alice's Shade. Round 3: Shade against Shade scores for nobody. It is 1 to 1, a draw.

```sql
set local role service_role;
select public.duel_create('USER_A_ID', 'DUEL CAROL', 3, 50, 5,
         array['flash','shade','shade'], 'duel-test-004', 24, 3) as result;
```

Expected: `done`, `balance` 800. Then:

```sql
set local role service_role;
select public.duel_answer((select id from public.duels where create_uid = 'duel-test-004'), 'USER_C_ID',
         array['shade','flash','shade'], 'duel-answer-004',
         array['challenger','opponent','even'], 'draw',
         now() - interval '1 day', 3) as result;
```

Expected: `done`, `winnerTakes` 0 and `balance` 1000. The Duel check: both players are back where they were before this step (Duel Alice 850, Duel Carol 1000), and the arena rows of this duel add up to 0:

```sql
select sum(t.delta) as arena_sum, count(*) as rows
from public.wallet_transactions t
where t.ref = 'duel:' || (select id::text from public.duels where create_uid = 'duel-test-004');
```

Expected: `arena_sum` 0 and `rows` 4 (two stakes and two returned stakes).

**D5. Withdraw and decline give the stake back once.** Alice sends two named challenges to Bob, 100 coins each (a new run each):

```sql
set local role service_role;
select public.duel_create('USER_A_ID', 'Duel Bob', 5, 100, 5, array['shade','shade','shade','shade','shade'], 'duel-test-005', 24, 3) as result;
```

```sql
set local role service_role;
select public.duel_create('USER_A_ID', 'Duel Bob', 5, 100, 5, array['shade','shade','shade','shade','shade'], 'duel-test-006', 24, 3) as result;
```

Expected: both `done` (the second `balance` is 650). Alice withdraws the first:

```sql
set local role service_role;
select public.duel_void((select id from public.duels where create_uid = 'duel-test-005'), 'USER_A_ID', 'withdrawn') as result;
```

Expected: `status` `done`, `refunded` 100, `challengerBalance` 750. Run it again: an error `already_applied` (error code `23505`). Bob tries to decline the withdrawn duel (change the last two values):

```sql
set local role service_role;
select public.duel_void((select id from public.duels where create_uid = 'duel-test-005'), 'USER_B_ID', 'declined') as result;
```

Expected: `status` `refused`, `reason` `duel_closed`. Alice cannot decline her own challenge (the second duel), and Carol cannot withdraw it; both are refused with `not_your_duel`:

```sql
set local role service_role;
select public.duel_void((select id from public.duels where create_uid = 'duel-test-006'), 'USER_A_ID', 'declined') as alice_declines,
       public.duel_void((select id from public.duels where create_uid = 'duel-test-006'), 'USER_C_ID', 'withdrawn') as carol_withdraws;
```

Now Bob declines it; the stake goes back to Alice. A second decline is an error `already_applied`:

```sql
set local role service_role;
select public.duel_void((select id from public.duels where create_uid = 'duel-test-006'), 'USER_B_ID', 'declined') as result;
```

Expected: `done`, `refunded` 100, `challengerBalance` 850. The Duel check: Duel Alice 850.

**D6. A challenge that nobody answers expires, and is refunded once.** Alice sends an open challenge, 100 coins, then anybody asks for it to expire:

```sql
set local role service_role;
select public.duel_create('USER_A_ID', null, 5, 100, 5, array['flash','mirror','shade','shade','shade'], 'duel-test-007', 24, 3) as result;
```

```sql
set local role service_role;
select public.duel_void((select id from public.duels where create_uid = 'duel-test-007'), 'USER_C_ID', 'expired') as result;
```

Expected: `status` `refused`, `reason` `not_expired` (the database clock says the 24 hours are not over). Pretend they are. Move the creation and the deadline back by two days together, as the default role (the deadline must stay after the creation):

```sql
update public.duels
   set created_at = created_at - interval '2 days',
       expires_at = expires_at - interval '2 days'
 where create_uid = 'duel-test-007';
```

A late answer by Carol is refused and changes nothing:

```sql
set local role service_role;
select public.duel_answer((select id from public.duels where create_uid = 'duel-test-007'), 'USER_C_ID',
         array['shade','shade','shade','shade','shade'], 'duel-answer-007',
         array['challenger','challenger','even','even','even'], 'challenger',
         now() - interval '1 day', 3) as result;
```

Expected: `status` `refused`, `reason` `duel_expired`. Now Carol asks for the expiry. The run of the second block above (with `'expired'`) now does the refund; run it again. Expected: `done`, `refunded` 100, `challengerBalance` 850. Run it once more: `refused`, `duel_closed`, and Duel Alice stays at 850.

**D7. A captain who cannot pay the stake changes nothing.** Take all but 50 coins away from Carol, then Alice challenges her for 100:

```sql
set local role service_role;
select public.apply_wallet_transaction('USER_C_ID', -((select balance from public.wallets where player_id = 'USER_C_ID') - 50), 'admin_adjust', 'duel-drain') as carol_balance;
```

```sql
set local role service_role;
select public.duel_create('USER_A_ID', 'Duel Carol', 5, 100, 5, array['shade','shade','shade','shade','shade'], 'duel-test-008', 24, 3) as result;
```

Expected: `done`, `balance` 750. Carol answers:

```sql
set local role service_role;
select public.duel_answer((select id from public.duels where create_uid = 'duel-test-008'), 'USER_C_ID',
         array['shade','shade','shade','shade','shade'], 'duel-answer-008',
         array['even','even','even','even','even'], 'draw',
         now() - interval '1 day', 3) as result;
```

Expected: an error `insufficient_funds`. Nothing changed: the Duel check shows Duel Carol with 50 coins and Duel Alice with 750 (her stake is still held), and

```sql
select d.status,
       (select count(*) from public.duel_moves m where m.duel_id = d.id and m.player_id = 'USER_C_ID') as carol_envelope_rows
from public.duels d
where d.create_uid = 'duel-test-008';
```

shows `open` and 0.

**D8. The two caps.** First the pair limit: Alice and Bob have decided 2 staked duels today (D1 and D3). Alice sends Bob another, staked 10, and Bob answers with a limit of 2 (the server passes 3):

```sql
set local role service_role;
select public.duel_create('USER_A_ID', 'Duel Bob', 3, 10, 5, array['flash','shade','shade'], 'duel-test-012', 24, 3) as result;
```

```sql
set local role service_role;
select public.duel_answer((select id from public.duels where create_uid = 'duel-test-012'), 'USER_B_ID',
         array['shade','flash','shade'], 'duel-answer-012',
         array['challenger','opponent','even'], 'draw',
         now() - interval '1 day', 2) as result;
```

Expected: `status` `refused`, `reason` `daily_pair_limit`, and Bob sealed nothing. Run the answer again with the limit `3` (the last number): it is `done` (a draw, `winnerTakes` 0). Now Alice and Bob have decided 3 staked duels today. Bob challenges Alice, and Alice answers with the limit 3: she is refused too, because the limit counts either way round, so it counts the duels in both directions:

```sql
set local role service_role;
select public.duel_create('USER_B_ID', 'Duel Alice', 3, 10, 5, array['flash','shade','shade'], 'duel-test-013', 24, 3) as result;
```

```sql
set local role service_role;
select public.duel_answer((select id from public.duels where create_uid = 'duel-test-013'), 'USER_A_ID',
         array['shade','flash','shade'], 'duel-answer-013',
         array['challenger','opponent','even'], 'draw',
         now() - interval '1 day', 3) as result;
```

Expected: the create is `done`, the answer `refused` with `daily_pair_limit`. A friendly duel (stake 0) is never blocked by the limit. Second, the waiting cap. Alice has one waiting challenge (`duel-test-008`). She sends two friendly open challenges (change `duel-test-009` to `duel-test-010` for the second run), and then a third:

```sql
set local role service_role;
select public.duel_create('USER_A_ID', null, 3, 0, 5, array['shade','shade','shade'], 'duel-test-009', 24, 3) as result;
```

Expected: both `done` (the friendly ones hold no coins). Run it once more with `duel-test-011`: `status` `refused`, `reason` `too_many_waiting`. Nothing was created for `duel-test-011`.

**D9. Players see only their own duels, and nothing of the envelopes.** As Bob (the second line gives the claims the Supabase login would give):

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_B_ID", "role": "authenticated"}', true);
select count(*) as duels_seen,
       count(*) filter (where challenger_id = 'USER_B_ID' or opponent_id = 'USER_B_ID') as duels_of_bob
from public.duels;
```

Expected: two equal numbers (every duel Bob sees is one he takes part in), and fewer than the total number of duels (run `select count(*) from public.duels;` as the default role: it also counts the duels of Alice and Carol). Now replace the last statement:

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_B_ID", "role": "authenticated"}', true);
select * from public.duel_moves;
```

Expected: `permission denied for table duel_moves`. Not even his own sealed signals. Change the first line to `set local role anon;` (and drop the `set_config` line) and run `select * from public.duels;`, then `select * from public.duel_moves;`. Expected: `permission denied for table ...` both times.

**D10. Only the server runs the functions, and sealed means sealed.** Each statement fails, as the role in the left column, and changes nothing:

| Role | Statement | Expected error mentions |
|---|---|---|
| `authenticated` (player B) | `select public.duel_create('USER_B_ID', null, 3, 0, 5, array['shade','shade','shade'], 'duel-test-014', 24, 3);` | `permission denied for function duel_create` |
| `authenticated` (player B) | `select public.duel_void((select id from public.duels where create_uid = 'duel-test-008'), 'USER_B_ID', 'expired');` | `permission denied for function duel_void` |
| `authenticated` (player B) | `select public.duel_answer((select id from public.duels where create_uid = 'duel-test-008'), 'USER_B_ID', array['shade','shade','shade','shade','shade'], 'duel-answer-099', array['even','even','even','even','even'], 'draw', now(), 3);` | `permission denied for function duel_answer` |
| `authenticated` (player B) | `update public.duels set stake = 0;` | `permission denied for table duels` |
| `service_role` | `update public.duel_moves set signal = 'flash';` | `permission denied for table duel_moves` |
| `service_role` | `delete from public.duel_moves;` | `permission denied for table duel_moves` |
| `service_role` | `delete from public.duels;` | `permission denied for table duels` |

Put `set local role authenticated;` (with the `set_config` line from D9) or `set local role service_role;` in front of each, run it, and look at the error. Even the server cannot change a sealed signal or delete a duel.

**D11. The database checks what the server sends.** Each statement is refused as the server (`set local role service_role;` in front of it) with the error in the right column, and changes nothing:

| Statement | Why it is wrong | Expected error |
|---|---|---|
| `select public.duel_create('USER_A_ID', null, 4, 0, 5, array['shade','shade','shade','shade'], 'duel-test-015', 24, 3);` | 4 rounds: a duel has 3 or 5 | `bad_duel` |
| `select public.duel_create('USER_A_ID', null, 3, 101, 5, array['shade','shade','shade'], 'duel-test-016', 24, 3);` | a stake of 101: the most is 100 | `bad_duel` |
| `select public.duel_create('USER_A_ID', null, 5, 0, 5, array['shade','shade','shade'], 'duel-test-017', 24, 3);` | 3 signals for 5 rounds | `bad_duel` |
| `select public.duel_create('USER_C_ID', null, 3, 0, 5, array['flash','sparkle','shade'], 'duel-test-018', 24, 3);` | a signal that is not a signal (Carol has no waiting challenge, so the cap does not answer first) | `duel_moves_signal_allowed` |
| `select public.duel_answer((select id from public.duels where create_uid = 'duel-test-008'), 'USER_C_ID', array['shade','shade','shade','shade','shade'], 'duel-answer-098', array['challenger','challenger','challenger','challenger','challenger'], 'draw', now() - interval '1 day', 3);` | five points for the challenger, and the outcome says draw | `bad_duel` |
| `select public.duel_answer((select id from public.duels where create_uid = 'duel-test-008'), 'USER_C_ID', array['shade','shade','shade','shade','shade'], 'duel-answer-097', array['even','even','even'], 'draw', now() - interval '1 day', 3);` | 3 results for 5 rounds | `bad_duel` |
| `select public.duel_answer((select id from public.duels where create_uid = 'duel-test-008'), 'USER_C_ID', array['shade','shade','shade','shade','shade'], 'duel-answer-096', array['even','even','even','even','even'], 'draw', now() + interval '1 day', 3);` | the day starts tomorrow, so the pair limit would count nothing | `bad_duel` |

A direct insert as the default role shows the table guarding itself too. Each fails with the constraint named in the error:

```sql
insert into public.duels (challenger_id, is_open, rounds, stake, cut_percent, create_uid, expires_at)
values ('USER_A_ID', true, 3, 101, 5, 'duel-test-019', now() + interval '1 day');
```

Expected: `duels_stake_range`. Change `3, 101` to `4, 0` for `duels_rounds_allowed`, and `now() + interval '1 day'` to `now() - interval '1 day'` for `duels_expires_after_creation`.

**D12. The reasons, the sums, and running the migration again.** The two new reasons are in the list, in the right direction (default role):

```sql
select reason, direction from public.wallet_reasons where reason like 'arena\_%' order by reason;
```

Expected: 2 rows: `arena_payout` earn, `arena_stake` spend. The wallet refuses a wrong direction, for example a stake that adds coins:

```sql
set local role service_role;
select public.apply_wallet_transaction('USER_A_ID', 10, 'arena_stake', 'manual-wrong-2');
```

Expected: `wrong_direction`. No duel created a coin. Every arena row of every test duel, added up per duel:

```sql
select d.create_uid, d.status, d.stake, coalesce(sum(t.delta), 0) as arena_sum
from public.duels d
left join public.wallet_transactions t on t.ref = 'duel:' || d.id::text
where d.create_uid like 'duel-test-%'
group by d.id, d.create_uid, d.status, d.stake
order by d.create_uid;
```

Expected: a duel that ended without a winner (a draw, withdrawn, declined, expired, and every friendly one) adds up to 0; `duel-test-001` (finished, 100) adds up to -10 and `duel-test-003` (finished, 50) to -5, the cut of each; and the duels that are still open (`duel-test-008`, staked 100, and `duel-test-013`, staked 10) add up to minus their held stake, -100 and -10. Finally paste the whole Lantern Duels migration into the SQL editor again and run it. Expected: no error, the Duel check shows what it showed before, and `select count(*) from public.wallet_reasons;` still shows 13.

Delete the three test users when you are done (**Authentication > Users**). Their duels, envelopes and ledger rows go with them.

## Changing the database later

- Never edit a migration that has been applied anywhere. Add a new file named `supabase/migrations/<YYYYMMDDHHMMSS>_<topic>.sql` with a later time stamp.
- A new table needs, in the same file: row-level security switched on, policies, **explicit grants** (our project gives no rights to a new table, so nothing works until you grant them, and you grant only what is really needed), and a comment on the table, every column and every policy. Take every right away first (`revoke all` from `public`, `anon`, `authenticated` and `service_role`), then grant. The browser only reads, so `authenticated` gets `select` at most. If the table has an identity column (`generated always as identity`), also revoke all rights on its counter, as the foundation file does for `wallet_transactions_id_seq`. Copy the style of the foundation file.
- A new function needs `revoke ... from public, anon, authenticated` and then `grant execute` only to the role that must run it. Start it with `set search_path = ''`.
- A new wallet reason is one new migration with one `insert into public.wallet_reasons (reason, direction, description) values (...) on conflict (reason) do nothing;`, plus the same `(reason, direction)` pair added at the **end** of `WALLET_REASONS` in `backend/server/wallet.py`, in the same pull request. Never rename a reason or change its direction, because ledger rows point at it. The test `backend/server/tests/test_wallet_matches_migration.py` reads every migration in order and fails if the two lists differ. Add the reason to the manual test plan (step 15) too.
- Realtime is not switched on for these tables yet. The work package that needs it adds it.
- If something here is unclear, open an issue before changing the rules for money.
