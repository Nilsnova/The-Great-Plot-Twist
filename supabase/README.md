# Supabase database

This folder holds the database of The Great Plot Twist. Supabase gives us the login (GitHub sign-in), a Postgres database and realtime. Everything the game must remember lives here: who the players are, their saved progress, their coins and their crews.

Play money only: coins cannot be bought, cashed out or exchanged for real prizes. Every player starts with 0 coins. The first coins come later, from the intro entry kit (the `kit_grant` reason).

The browser only reads from this database. Every write comes from our Python server with the secret key.

| File | What it is |
|---|---|
| [migrations/20261106000000_foundation.sql](migrations/20261106000000_foundation.sql) | The first migration: seven tables, the security rules, the rights of each database role and four functions. Every table, column and policy is explained inside the file. |
| [migrations/20261106010000_island_exchange.sql](migrations/20261106010000_island_exchange.sql) | The second migration, for the Island Exchange (package L4): three wallet reasons, three tables and two functions. Run it after the first. See [The Island Exchange migration](#the-island-exchange-migration). |
| [migrations/20261106100000_prediction_desk.sql](migrations/20261106100000_prediction_desk.sql) | The migration for the prediction desk (package L5): two wallet reasons, two tables, one view, one trigger and two functions. Run it after the others (it needs only the first). See [The prediction desk migration](#the-prediction-desk-migration). |

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
| `prediction_stake` | spend | Coins staked on a question at the prediction desk. Ref `stake:<stakeId>`. *Added by the prediction desk migration.* |
| `prediction_payout` | earn | Coins paid back from a prediction desk pool, for a win or a refund. Ref `pool:<questionId>`. *Added by the prediction desk migration.* |

The first eight come from the foundation migration, the next three from the Island Exchange migration and the last two from the prediction desk migration. The direction says which way the coins move. **earn** adds coins, so the amount must be above 0. **spend** takes coins away, so the amount must be below 0. **either** may go both ways, but never 0. `apply_wallet_transaction()` looks the reason up and checks the direction before it touches the balance, and the Python code checks the same rule even earlier. The `reason` column of the ledger is also a foreign key to `wallet_reasons`, so an unknown reason cannot get into the ledger by any route.

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

## The prediction desk migration

`migrations/20261106100000_prediction_desk.sql` is the database part of the prediction desk (hand-picked real questions from Manifold Markets, and play-coin pools that the winners share; see [INTERFACES.md, section 2](../docs/INTERFACES.md#the-prediction-desk-package-l5) and decision D018 in [DECISIONS.md](../docs/DECISIONS.md), whose number is provisional). Run it **after** the foundation migration, because it uses the wallet and the profiles from there. It does not need the Island Exchange migration, but it sorts after it, so the usual order (oldest first) is right. It is safe to run twice. Everything is explained in the file itself. **It is not applied to the Supabase project yet**, and the feature flag `predictions` stays off.

| Name | What it is | Who changes it |
|---|---|---|
| `prediction_pools` | One row per question: when staking closes (`closes_at`), and how the pool ended once it was settled (`status`, `outcome`, `settlement`, `settled_by`, `settled_at`, `cut_coins`, `paid_coins`). Created by the first stake or by the settlement, never deleted. It holds no running totals: they come from the stakes. | Only the server, through `prediction_place_stake()` (creates the row) and `prediction_settle_pool()` (settles it). |
| `prediction_stakes` | One row per stake: the player, the side (`yes` or `no`), the coins, the `stake_id` the browser made for the click and the ledger `ref` (`stake:` plus that id). A player has one stake per question, and can use a `stake_id` once. `payout` is written when the pool is settled. | Only `prediction_place_stake()` adds a row; only `prediction_settle_pool()` writes `payout`. |
| `prediction_pool_sides` | A view: the coins and the players on each side of each pool, added up from the stakes. It uses the rights of whoever reads it (`security_invoker`). | Nobody writes it. Only the server reads it. |
| `prediction_pools_keep_settled()` | A trigger function, run by the trigger of the same name before every update of a `prediction_pools` row. If the row is already `settled` it raises `pool_settled`, so **a settled pool is final**: nothing can change it any more, not even the server, which holds the update right on seven of its columns. Without it, a server bug that wrote the table directly could set a settled pool back to `open` and settle it again with the other outcome (`pool:<questionId>` only stops a second payout to the same player, not one to the other player). The settlement itself is not in the way: it changes an open pool, once. | Nobody calls it. The trigger runs it. |
| `prediction_place_stake()` | The only way a stake happens. In one step: check the arguments, make sure the pool row exists and **lock it**, lock the player's wallet, refuse a repeated stake id (code `23505`, message `already_applied`), refuse a settled pool or one past its closing time (the earlier of the stored and the given closing time counts), refuse a second stake on the question, refuse a stake over the daily cap, take the coins with `apply_wallet_transaction()` (`prediction_stake`) and write the stake. It *returns* a refusal such as `{"status": "refused", "reason": "daily_cap", "coinsLeft": 30}` with nothing changed, and *raises* `insufficient_funds` (from the wallet), a repeated stake id, or `bad_stake` / `wallet_not_found` (a bug on the server side). | Run by the server only. |
| `prediction_settle_pool()` | The only way a pool is settled. In one step: check the arguments, make sure the pool row exists and **lock it**, refuse a pool that is settled already (`23505`, `already_applied`), refuse yes or no before the pool has closed (void works at any time), read the pool from its stakes, decide how it ends (`refund_void`, `refund_no_winners`, `refund_one_sided` or `winners`), check the payouts, pay everybody with `apply_wallet_transaction()` (`prediction_payout`, ref `pool:<questionId>`) in player-id order, write the payout of every stake and mark the pool settled. It *returns* a refusal (`pool_open` or `stakes_changed`) with nothing changed, and *raises* `bad_settlement` when the arguments or the payouts do not add up. | Run by the server only. |

**The server works out the payouts, and the database checks them.** The rule is written once in full, in Python (`backend/server/predictions/pools.py`): the winners share the pool in proportion to their stakes, 5 % of the losing side (rounded down) leaves the game, the leftover coins go to the largest remainders and then to the earliest stake, and everybody gets a full refund when the question is void, when nobody picked the winning side or when everybody picked the same side. `prediction_settle_pool()` does not repeat the split. It checks what it is given: the payouts must name **exactly** the stakes that get paid (a refund: every stake; a win: every winning stake), they must add up to the coins staked minus the cut, each must be at least 1 coin, a refund must be the stake, and a win must be within one coin of the exact share (`abs(coins x W - stake x D) < W`, with W the winning coins and D the shared coins). If the server ever had a bug, the database refuses the settlement with `bad_settlement` instead of paying wrong coins, so **no coin is ever created or lost**. If the pool changed between the server's read and the call (a stake disappeared because its player was deleted, or a new stake arrived, which can happen to a void while staking is still open), the answer is `stakes_changed`, and the server reads again.

**The lock order** is the same everywhere: the pool row first, then the wallets, by player id. A stake and a settlement of the same pool therefore happen one at a time, a pool settles once, and two settlements (or a settlement and a stake) can never wait for each other in a circle. The limits (the biggest stake, the daily cap, the cut) are passed in as arguments from `backend/server/predictions/stake_rules.py`, so the numbers live in one place.

**The update rights are per column.** The server may update seven columns of `prediction_pools` (the settlement) and the column `payout` of `prediction_stakes`, and nothing else: it cannot change who staked what or how much, it cannot move a closing time, and it cannot delete a stake or a pool. (`select ... for update` needs the update right on at least one column, and the column grants give exactly that.) And once a pool is settled, even those seven columns are closed: the trigger `prediction_pools_keep_settled()` refuses every update of a settled pool with `pool_settled`.

**A known limit:** if a player is deleted while a pool is open, their stake row goes with them (cascade), and those coins simply leave the game. No coin is ever created.

After applying it, the three quick checks below show **twelve** tables and **twelve** policies (with the Island Exchange migration applied too), and there are **thirteen** wallet reasons. Run the checks P1 to P16 at the end of the manual test plan.

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
5. Do the same with `migrations/20261106010000_island_exchange.sql` (the Island Exchange), and then with `migrations/20261106100000_prediction_desk.sql` (the prediction desk), each in a new query. The order matters: the files start with a time stamp, so apply them oldest first.

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

Expected: the seven tables `crew_seats`, `crews`, `profiles`, `saves`, `wallet_reasons`, `wallet_transactions`, `wallets`, each with `rls_on` = true. After the Island Exchange migration there are ten: also `market_bases`, `market_positions` and `market_trades`. After the prediction desk migration there are twelve: also `prediction_pools` and `prediction_stakes` (the view `prediction_pool_sides` is not a table, so it is not in this list).

```sql
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Expected: 7 policies, one on each table, and every `cmd` is `SELECT`. There is no policy that lets a player write. After the Island Exchange migration there are 10 (one more on each new table), and after the prediction desk migration 12.

```sql
select grantee, table_name, string_agg(privilege_type, ', ' order by privilege_type) as rights
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
group by grantee, table_name
order by grantee, table_name;
```

Expected: no row for `anon`. For `authenticated`, 7 rows (one per table), and `rights` is `SELECT` in every row. After the Island Exchange migration: 10 rows, and after the prediction desk migration 12 (the view `prediction_pool_sides` has no right for `authenticated`).

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
| `prediction_pools` | read | no access | all rows | yes |
| `prediction_pools` | insert | no access | no access | yes \*\*\* (through `prediction_place_stake()` and `prediction_settle_pool()`) |
| `prediction_pools` | update | no access | no access | yes \*\*\* (seven columns only, through `prediction_settle_pool()`; not `closes_at`, not `question_id`; and never a settled pool: a trigger refuses it with `pool_settled`) |
| `prediction_pools` | delete | no access | no access | no access (a pool is never deleted) |
| `prediction_stakes` | read | no access | own rows | yes |
| `prediction_stakes` | insert | no access | no access | yes \*\*\* (through `prediction_place_stake()`) |
| `prediction_stakes` | update | no access | no access | yes \*\*\* (the column `payout` only, through `prediction_settle_pool()`; not the player, the side or the amount) |
| `prediction_stakes` | delete | no access | no access | no access (rows disappear only when their player is deleted, by cascade) |
| `prediction_pool_sides` (a view) | read | no access | no access | yes |

\* The database lets the server update `wallets` and add ledger rows directly, because `apply_wallet_transaction()` runs with the server's rights and needs both. Our rule is that the server does this only through that function. A direct update skips the ledger row, so the balance no longer matches the ledger. Reading a balance in Python and then writing a new one can lose coins when two requests arrive together. The function cannot. A direct ledger insert would also skip the direction check, because that check lives in the function (a table rule cannot look into `wallet_reasons`). The foreign key still refuses an unknown reason, and the table still refuses a missing or blank `ref`.

\*\* The database lets the server write `market_positions` and add `market_trades` rows directly, and add and change `market_bases` rows directly, because the two functions run with the rights of the server. "Through `market_trade()`" and "through `market_set_base()`" in the table are our rule, not something the database enforces (the same pattern as `wallets` above). A direct write would skip the checks of `market_trade()`: the arithmetic, the daily cap, the holding time and the wallet. Only the server holds that right, and the code never writes these tables directly.

\*\*\* The database lets the server add `prediction_pools` and `prediction_stakes` rows directly, and update the listed columns directly, because the two functions run with the rights of the server. "Through `prediction_place_stake()`" and "through `prediction_settle_pool()`" in the table are our rule, not something the database enforces (the same pattern as the footnotes above). A direct write would skip the checks of the functions: the limits, the lock and the wallet. Only the server holds that right, and the code never writes these tables directly. What the database does enforce is the per-column update right: even the server cannot change a closing time, a side or an amount, and nobody can delete a stake or a pool. It also enforces the trigger: a settled pool cannot be changed again, so a direct write cannot reopen it.

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
| `prediction_place_stake()` | no access | no access | yes |
| `prediction_settle_pool()` | no access | no access | yes |
| `prediction_pools_keep_settled()` | no access | no access | no access, only its trigger runs it |
| `prediction_stakes_id_seq` (the stakes' id counter) | no access | no access | no access, the table's own inserts do not need a right on it |

"No access" means the database refuses with `permission denied`, or (for a row that belongs to someone else) shows or changes nothing.

Supabase's security advisor may warn that a signed-in player can run a `SECURITY DEFINER` function. That is `is_crew_member()`, and it is on purpose. It takes a crew id, compares it with the caller's own id (`auth.uid()`), and returns only true or false. It cannot tell anyone who sits in somebody else's crew.

## What the server's secret key may do

- It skips row-level security. It can read every player's rows in all twelve tables and write `profiles`, `saves`, `crews` and `crew_seats` (and, see below, the Exchange tables). Its table rights are still limited: it can update `wallets` but not insert or delete one, it can add ledger rows but not edit or delete one, and it can only read `wallet_reasons`.
- It is the only role that may run `apply_wallet_transaction()`. That is the one way to change a balance. The same holds for `market_trade()` (a trade) and `market_set_base()` (a company's base): the server runs them, nobody else.
- On the Exchange tables it can read all three, add and change `market_bases`, add, change and delete `market_positions`, and only add `market_trades` rows. It cannot edit or delete a trade. Like the wallet, this is a rule of the team more than a lock: see the second footnote of the matrix.
- On the prediction desk tables it can read both and the view, add rows to both, and update only the seven settlement columns of `prediction_pools` (and not at all once a pool is settled: a trigger refuses it) and the column `payout` of `prediction_stakes`. It cannot change a closing time, a side or an amount, and it cannot delete a stake or a pool. Like the wallet, the rule "only through the two functions" is a rule of the team more than a lock: see the third footnote of the matrix.
- Because it skips RLS, the Python code must first check who is asking (the player's verified login token) and only then touch that player's rows.
- It must never reach a browser, the repository, a log or a screenshot. It lives only in the `SUPABASE_SECRET_KEY` environment variable on Vercel, and in a local `.env` file that git ignores.
- The browser only gets `SUPABASE_PUBLISHABLE_KEY` (as `VITE_SUPABASE_PUBLISHABLE_KEY`). That key is safe to show because the two locks above protect every table, and the browser has no right to write to any of them.

## Manual test plan

You need about 30 minutes. It proves the rules for reading and writing, the money function, the eight reasons and the crews with two test players, A and B.

The steps 1 to 17 check the foundation migration. If the Island Exchange migration is applied too, read **11** (or **13** with the prediction desk migration too) instead of 8 for the number of reasons in steps 4 and 16. Step 15 still tests the first eight reasons. The checks of the Island Exchange, including its three new reasons, are the steps E1 to E13 at the end of this plan, and the checks of the prediction desk, including its two reasons, are the steps P1 to P16 (and the race checks R1 to R4) after them.

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

Expected: 8 rows, one per reason, with `balance_after` going 71, 72, 73, 74, 75, 74, 73, 74. Step 14 already showed that a ninth name (`cheat`) and a wrong direction are refused. Run the balance check from step 2: `balance` is 74 and `ledger_rows` is 10. The two reasons of the prediction desk migration (`prediction_stake` and `prediction_payout`) are tested in step P1 and in P2 and P9, with their own users, so that the numbers of the steps 16 and 17 stay as they are.

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

### Prediction desk checks (steps P1 to P16, then R1 to R4)

These steps test the prediction desk migration. Run them after the foundation migration and the prediction desk migration are both applied (the Island Exchange migration is not needed). Use **five new test users**, A, B, C, D and E (create them as in the set-up of this plan, so their balances start at 0), and replace `USER_A_ID` to `USER_E_ID` with their ids. The functions take their limits as arguments, so the blocks below pass them in: the closing time of the question (`now() + interval '1 day'`, or a time in the past), the biggest stake (50 coins), the daily cap (1000, so that the earlier steps cannot get in the way; step P5 uses 80) and the start of the day (here "one hour ago"). The pools have made-up question ids that start with `desk-`. The server's own questions have other ids, so these steps do not touch them.

**P0. Set-up.** Give A, B, C and E 1000 coins and D only 20:

```sql
set local role service_role;
select public.apply_wallet_transaction('USER_A_ID', 1000, 'kit_grant', 'desk-kit') as a,
       public.apply_wallet_transaction('USER_B_ID', 1000, 'kit_grant', 'desk-kit') as b,
       public.apply_wallet_transaction('USER_C_ID', 1000, 'kit_grant', 'desk-kit') as c,
       public.apply_wallet_transaction('USER_D_ID', 20, 'kit_grant', 'desk-kit') as d,
       public.apply_wallet_transaction('USER_E_ID', 1000, 'kit_grant', 'desk-kit') as e;
```

Expected: 1000, 1000, 1000, 20, 1000. We call the next block the **Desk check** and use it again below (default role). Change the id to look at another player:

```sql
select w.balance,
       (select count(*) from public.prediction_stakes s where s.player_id = w.player_id) as stakes,
       (select string_agg(t.reason || ' ' || t.delta || ' ' || t.ref, ', ' order by t.id)
          from public.wallet_transactions t
         where t.player_id = w.player_id and t.reason like 'prediction\_%') as ledger
from public.wallets w
where w.player_id = 'USER_A_ID';
```

**P1. The reasons.** Both are on the list, and there are 13 reasons in all (8 + 3 from the Exchange + 2 from the desk; 10 if the Exchange migration is not applied):

```sql
select reason, direction from public.wallet_reasons where reason like 'prediction\_%' order by reason;
select count(*) as reasons from public.wallet_reasons;
```

Expected: `prediction_payout` earn and `prediction_stake` spend; `reasons` is 13.

**P2. A stake.** Player A stakes 30 coins on YES in the pool `desk-one`:

```sql
set local role service_role;
select public.prediction_place_stake('USER_A_ID', 'desk-one', 'yes', 30, 'desk-a-1-0001', now() + interval '1 day', 50, 1000, now() - interval '1 hour') as result;
```

Expected: `status` `done`, `balance` 970, `stakedToday` 30 and `sides` with one side: `yes`, 30 coins, 1 player. The Desk check for A shows `balance` 970, `stakes` 1 and `ledger` `prediction_stake -30 stake:desk-a-1-0001`.

**P3. The same stake id twice changes nothing.** Run the block of P2 again:

Expected: an error, message `already_applied` (error code `23505`, the same code as a repeated wallet ref). The Desk check for A is still 970, 1 stake, one ledger row. A repeat is answered `already_applied` even when the closing time has passed since, or when the amount is different.

**P4. One stake per question.** A tries a second stake on `desk-one`, with another stake id and on the other side:

```sql
set local role service_role;
select public.prediction_place_stake('USER_A_ID', 'desk-one', 'no', 10, 'desk-a-1-0002', now() + interval '1 day', 50, 1000, now() - interval '1 hour') as result;
```

Expected: `status` `refused`, `reason` `already_staked`, `side` `yes`, `amount` 30. Nothing changed: the Desk check is still 970, 1 stake.

**P5. The daily cap.** With a cap of 80 coins, A has already staked 30 today, so 50 more fit exactly and 10 more do not:

```sql
set local role service_role;
select public.prediction_place_stake('USER_A_ID', 'desk-two', 'yes', 50, 'desk-a-2-0001', now() + interval '1 day', 50, 80, now() - interval '1 hour') as result;
```

Expected: `status` `done`, `balance` 920, `stakedToday` 80. Now one more stake (a new run):

```sql
set local role service_role;
select public.prediction_place_stake('USER_A_ID', 'desk-three', 'yes', 10, 'desk-a-3-0001', now() + interval '1 day', 50, 80, now() - interval '1 hour') as result;
```

Expected: `status` `refused`, `reason` `daily_cap`, `coinsLeft` 0. The Desk check for A: `balance` 920, `stakes` 2.

**P6. A closed pool, and a stored closing time that never moves later.** B tries to stake on a pool whose closing time is one minute ago:

```sql
set local role service_role;
select public.prediction_place_stake('USER_B_ID', 'desk-closed', 'yes', 10, 'desk-b-4-0001', now() - interval '1 minute', 50, 1000, now() - interval '1 hour') as result;
```

Expected: `status` `refused`, `reason` `pool_closed`. Try again with a closing time tomorrow: the pool keeps the closing time it was given at the first stake (one minute ago) and never changes it, and the earlier of that and the new one counts, so the answer is `pool_closed` again:

```sql
set local role service_role;
select public.prediction_place_stake('USER_B_ID', 'desk-closed', 'yes', 10, 'desk-b-4-0002', now() + interval '1 day', 50, 1000, now() - interval '1 hour') as result;
```

And A tries `desk-one` (which closes tomorrow) with a closing time from one minute ago, as the server does when Manifold has closed the market early:

```sql
set local role service_role;
select public.prediction_place_stake('USER_A_ID', 'desk-one', 'yes', 10, 'desk-a-1-0003', now() - interval '1 minute', 50, 1000, now() - interval '1 hour') as result;
```

Expected: `pool_closed` as well, because the earlier of the stored time (tomorrow) and the given time (one minute ago) counts. (A repeated stake id would have been answered `already_applied` first, so this call uses a new one.) The earlier time is not stored: a later call for `desk-one` that passes tomorrow again would be accepted again, until the stored time. That is why the server passes the closing time it knows at each moment. B still has 1000 coins and no stake, A is still at 920 with 2 stakes.

**P7. Not enough coins.** D has 20 coins and tries to stake 30:

```sql
set local role service_role;
select public.prediction_place_stake('USER_D_ID', 'desk-poor', 'yes', 30, 'desk-d-4-0001', now() + interval '1 day', 50, 1000, now() - interval '1 hour') as result;
```

Expected: an error `insufficient_funds`. D still has 20 coins and no stake, and the failed call left no pool row either:

```sql
select (select balance from public.wallets where player_id = 'USER_D_ID') as balance,
       (select count(*) from public.prediction_stakes where player_id = 'USER_D_ID') as stakes,
       (select count(*) from public.prediction_pools where question_id = 'desk-poor') as pool_rows;
```

Expected: 20, 0, 0.

**P8. Staking the exact balance.** D stakes exactly the 20 coins:

```sql
set local role service_role;
select public.prediction_place_stake('USER_D_ID', 'desk-exact', 'no', 20, 'desk-d-4-0002', now() + interval '1 day', 50, 1000, now() - interval '1 hour') as result;
```

Expected: `status` `done`, `balance` 0.

**P9. A settlement pays the winners.** This is the worked example A of the pool rules: A stakes 30 and B stakes 20 on YES, C stakes 50 on NO, in the pool `desk-pay`. YES wins. The pool holds 100 coins, 5 % of the 50 losing coins is 2.5, rounded down to 2, so the winners share 98 coins: exactly 58.8 and 39.2, which is 59 and 39 after the leftover coin goes to the larger remainder.

```sql
set local role service_role;
select public.prediction_place_stake('USER_A_ID', 'desk-pay', 'yes', 30, 'desk-a-5-0001', now() + interval '1 day', 50, 1000, now() - interval '1 hour') as a,
       public.prediction_place_stake('USER_B_ID', 'desk-pay', 'yes', 20, 'desk-b-5-0001', now() + interval '1 day', 50, 1000, now() - interval '1 hour') as b,
       public.prediction_place_stake('USER_C_ID', 'desk-pay', 'no', 50, 'desk-c-5-0001', now() + interval '1 day', 50, 1000, now() - interval '1 hour') as c;
```

Expected: three results with `status` `done`. A has 890 coins, B 980 and C 950. First settle YES while staking is still open:

```sql
set local role service_role;
select public.prediction_settle_pool('desk-pay', 'yes', now() + interval '1 day', 5,
  (select jsonb_agg(jsonb_build_object('stakeRowId', id, 'coins', case player_id when 'USER_A_ID' then 59 else 39 end) order by id)
     from public.prediction_stakes where question_id = 'desk-pay' and side = 'yes'),
  'host') as result;
```

Expected: `status` `refused`, `reason` `pool_open`, and `closesAt` tomorrow. Nothing was paid. Now the same with a closing time one minute ago (the server passes an earlier closing time when the question has closed):

```sql
set local role service_role;
select public.prediction_settle_pool('desk-pay', 'yes', now() - interval '1 minute', 5,
  (select jsonb_agg(jsonb_build_object('stakeRowId', id, 'coins', case player_id when 'USER_A_ID' then 59 else 39 end) order by id)
     from public.prediction_stakes where question_id = 'desk-pay' and side = 'yes'),
  'host') as result;
```

Expected: `status` `done`, `settlement` `winners`, `paidPlayers` 2, `paidCoins` 98, `cutCoins` 2 and a `settledAt`. The Desk check for A now shows `balance` 949 and a second ledger row `prediction_payout 59 pool:desk-pay`; B has 1019 (`prediction_payout 39 pool:desk-pay`) and C still 950. The **Pool check** (default role) shows how the pool ended:

```sql
select p.status, p.outcome, p.settlement, p.settled_by, p.cut_coins, p.paid_coins,
       (select string_agg(s.payout::text, ', ' order by s.id) from public.prediction_stakes s where s.question_id = p.question_id) as payouts
from public.prediction_pools p
where p.question_id = 'desk-pay';
```

Expected: `settled`, `yes`, `winners`, `host`, `cut_coins` 2, `paid_coins` 98, `payouts` `59, 39, 0` (the loser has a payout of 0). The 100 coins staked are the 98 paid plus the 2 that left the game.

A stake on a settled pool is refused:

```sql
set local role service_role;
select public.prediction_place_stake('USER_E_ID', 'desk-pay', 'yes', 10, 'desk-e-5-0001', now() + interval '1 day', 50, 1000, now() - interval '1 hour') as result;
```

Expected: `refused`, `pool_closed`.

**P10. A pool settles once.** Run the settlement of P9 again (with the closing time in the past):

```sql
set local role service_role;
select public.prediction_settle_pool('desk-pay', 'yes', now() - interval '1 minute', 5,
  (select jsonb_agg(jsonb_build_object('stakeRowId', id, 'coins', case player_id when 'USER_A_ID' then 59 else 39 end) order by id)
     from public.prediction_stakes where question_id = 'desk-pay' and side = 'yes'),
  'host') as result;
```

And then once with `'void'` and an empty list (`'[]'::jsonb`) instead:

```sql
set local role service_role;
select public.prediction_settle_pool('desk-pay', 'void', now() + interval '1 day', 5, '[]'::jsonb, 'host') as result;
```

Expected: an error each time, message `already_applied` (error code `23505`). The Pool check, the balances and the ledger are unchanged: not even void settles a pool twice.

**P11. Wrong payouts are refused, and nothing is paid.** The pool `desk-wrong` is case A again: A 30 and B 20 on YES, C 50 on NO.

```sql
set local role service_role;
select public.prediction_place_stake('USER_A_ID', 'desk-wrong', 'yes', 30, 'desk-a-6-0001', now() + interval '1 day', 50, 1000, now() - interval '1 hour') as a,
       public.prediction_place_stake('USER_B_ID', 'desk-wrong', 'yes', 20, 'desk-b-6-0001', now() + interval '1 day', 50, 1000, now() - interval '1 hour') as b,
       public.prediction_place_stake('USER_C_ID', 'desk-wrong', 'no', 50, 'desk-c-6-0001', now() + interval '1 day', 50, 1000, now() - interval '1 hour') as c;
```

Each statement below is the settlement of `desk-wrong` with a closing time in the past, as the server (role `service_role`) and with the payouts in the second column. Put `set local role service_role;` in front of each, run it, and then run the Pool check for `desk-wrong`: it still shows `open`.

| The payouts (as the statement writes them) | Why it is wrong | Expected |
|---|---|---|
| A 60 and B 39 (`case player_id when 'USER_A_ID' then 60 else 39 end`, winners only) | 60 + 39 = 99, but the winners share 98 | error `bad_settlement` |
| A 50 and B 48 (`... then 50 else 48 end`, winners only) | the sum is right, but 50 is far from the exact share 58.8 | error `bad_settlement` |
| A 98 and B 0 (`... then 98 else 0 end`, winners only) | a payout of 0 coins | error `bad_settlement` |
| A 98 (winners where `player_id = 'USER_A_ID'`) | the winner B is missing | `refused`, `stakes_changed` |
| A 59, B 39 and C 1 (all three stakes, `... when 'USER_A_ID' then 59 when 'USER_B_ID' then 39 else 1 end`) | a loser is included | `refused`, `stakes_changed` |
| outcome `void`, all three stakes, A 31, B 19 and C 50 | a refund must be the stake | error `bad_settlement` |

The statement of the first row, as an example (the other rows change the `case` and the `where`):

```sql
set local role service_role;
select public.prediction_settle_pool('desk-wrong', 'yes', now() - interval '1 minute', 5,
  (select jsonb_agg(jsonb_build_object('stakeRowId', id, 'coins', case player_id when 'USER_A_ID' then 60 else 39 end) order by id)
     from public.prediction_stakes where question_id = 'desk-wrong' and side = 'yes'),
  'host') as result;
```

Last, a split that is within one coin of the exact shares (58 and 40, where the exact shares are 58.8 and 39.2) is accepted, as the rule says. It is the only one of these statements that pays:

```sql
set local role service_role;
select public.prediction_settle_pool('desk-wrong', 'yes', now() - interval '1 minute', 5,
  (select jsonb_agg(jsonb_build_object('stakeRowId', id, 'coins', case player_id when 'USER_A_ID' then 58 else 40 end) order by id)
     from public.prediction_stakes where question_id = 'desk-wrong' and side = 'yes'),
  'host') as result;
```

Expected: `status` `done`, `paidCoins` 98, `cutCoins` 2.

**P12. Refunds are exact.** Three pools, each settled with payouts that are the stakes themselves (`'coins', amount`).

- `desk-void`: A stakes 10 on YES and B stakes 20 on NO. Settle with outcome `void` while staking is still open (void works at any time).
- `desk-nowin`: C stakes 25 on NO. Settle with outcome `yes` (nobody picked the winning side).
- `desk-onesided`: A stakes 40 and B stakes 10, both on YES. Settle with outcome `yes` (everybody picked the same side).

```sql
set local role service_role;
select public.prediction_place_stake('USER_A_ID', 'desk-void', 'yes', 10, 'desk-a-7-0001', now() + interval '1 day', 50, 1000, now() - interval '1 hour') as a,
       public.prediction_place_stake('USER_B_ID', 'desk-void', 'no', 20, 'desk-b-7-0001', now() + interval '1 day', 50, 1000, now() - interval '1 hour') as b,
       public.prediction_place_stake('USER_C_ID', 'desk-nowin', 'no', 25, 'desk-c-8-0001', now() + interval '1 day', 50, 1000, now() - interval '1 hour') as c,
       public.prediction_place_stake('USER_A_ID', 'desk-onesided', 'yes', 40, 'desk-a-9-0001', now() + interval '1 day', 50, 1000, now() - interval '1 hour') as d,
       public.prediction_place_stake('USER_B_ID', 'desk-onesided', 'yes', 10, 'desk-b-9-0001', now() + interval '1 day', 50, 1000, now() - interval '1 hour') as e;
```

Expected: five results with `status` `done`. Now the three settlements:

```sql
set local role service_role;
select public.prediction_settle_pool('desk-void', 'void', now() + interval '1 day', 5,
         (select jsonb_agg(jsonb_build_object('stakeRowId', id, 'coins', amount) order by id) from public.prediction_stakes where question_id = 'desk-void'), 'host') as void,
       public.prediction_settle_pool('desk-nowin', 'yes', now() - interval '1 minute', 5,
         (select jsonb_agg(jsonb_build_object('stakeRowId', id, 'coins', amount) order by id) from public.prediction_stakes where question_id = 'desk-nowin'), 'host') as no_winners,
       public.prediction_settle_pool('desk-onesided', 'yes', now() - interval '1 minute', 5,
         (select jsonb_agg(jsonb_build_object('stakeRowId', id, 'coins', amount) order by id) from public.prediction_stakes where question_id = 'desk-onesided'), 'host') as one_sided;
```

Expected: `void` is `done` with `settlement` `refund_void`, `paidCoins` 30 and `cutCoins` 0; `no_winners` is `refund_no_winners` with `paidCoins` 25; `one_sided` is `refund_one_sided` with `paidCoins` 50 and `cutCoins` 0. Every player has exactly the coins they had before these stakes (A 977, B 1039, C 900, using the numbers above), and a refund of one coin less than the stake would have been refused with `bad_settlement`.

**P13. An empty pool settles and pays nothing.** Nobody staked on `desk-empty`:

```sql
set local role service_role;
select public.prediction_settle_pool('desk-empty', 'yes', now() - interval '1 minute', 5, '[]'::jsonb, 'host') as result;
```

Expected: `status` `done`, `settlement` `refund_no_winners`, `paidPlayers` 0, `paidCoins` 0, `cutCoins` 0. The pool is settled, so a stake on it is refused with `pool_closed` (repeat the stake of P9 with `'desk-empty'` and a new stake id).

**P14. Privileges.** Players can read their own stakes and every pool, and nothing else. The closing time and the amounts cannot be changed, not even by the server.

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_A_ID", "role": "authenticated"}', true);
select (select count(*) from public.prediction_stakes) as stakes_seen,
       (select count(*) from public.prediction_stakes where player_id = 'USER_B_ID') as b_stakes_seen,
       (select count(*) from public.prediction_pools) as pools_seen;
```

Expected: `stakes_seen` equal to A's own stakes (the Desk check shows the number), `b_stakes_seen` 0 and `pools_seen` all the pools (at least 10). Now replace the last line with one statement from the table and run again, as player A. Each one fails with `permission denied`:

| Statement as player A | Expected error mentions |
|---|---|
| `insert into public.prediction_stakes (question_id, player_id, side, amount, stake_id, ref) values ('desk-one', 'USER_A_ID', 'yes', 1, 'desk-hack-0001', 'stake:desk-hack-0001');` | `permission denied for table prediction_stakes` |
| `update public.prediction_stakes set amount = 1000000;` | `permission denied for table prediction_stakes` |
| `delete from public.prediction_stakes;` | `permission denied for table prediction_stakes` |
| `update public.prediction_pools set status = 'open';` | `permission denied for table prediction_pools` |
| `delete from public.prediction_pools;` | `permission denied for table prediction_pools` |
| `select * from public.prediction_pool_sides;` | `permission denied for view prediction_pool_sides` |
| `select public.prediction_place_stake('USER_A_ID', 'desk-hack', 'yes', 1, 'desk-hack-0002', now() + interval '1 day', 50, 1000, now());` | `permission denied for function prediction_place_stake` |
| `select public.prediction_settle_pool('desk-hack', 'void', now(), 5, '[]'::jsonb, 'host');` | `permission denied for function prediction_settle_pool` |

Change the first line to `set local role anon;` (and drop the `set_config` line) and run `select * from public.prediction_pools;`, then the same for `prediction_stakes` and `prediction_pool_sides`. Expected: `permission denied for table ...` each time. Even the server cannot change who staked what, or delete anything:

```sql
set local role service_role;
update public.prediction_stakes set amount = 1;
```

Expected: `permission denied for table prediction_stakes`. The same for `update public.prediction_stakes set side = 'no';`, `delete from public.prediction_stakes;`, `delete from public.prediction_pools;` and `update public.prediction_pools set closes_at = now();`. The server may read the view: `select * from public.prediction_pool_sides;` works.

**P15. Deleting a player, and running the migration again.** Delete the five test users under **Authentication > Users**. Then run:

```sql
select (select count(*) from public.prediction_stakes where player_id in ('USER_A_ID', 'USER_B_ID', 'USER_C_ID', 'USER_D_ID', 'USER_E_ID')) as stakes,
       (select count(*) from public.prediction_pools where question_id like 'desk-%') as pools;
```

Expected: `stakes` 0 (the stakes go with their players, and those coins leave the game), and `pools` is still 10 or more: a pool is never deleted. Finally paste the whole prediction desk migration into the SQL editor again and run it. Expected: no error, `select count(*) from public.wallet_reasons;` still shows 13 (10 without the Exchange migration), and the pools are unchanged.

**P16. A settled pool is final.** The function refuses a second settlement (P10), and the table refuses it too: once a pool is settled, nothing can change its row any more, not even the server, which holds the update right on seven of its columns. Without this, a server bug that wrote the table directly could set the pool `desk-pay` (settled in P9) back to open and settle it again with the other outcome, and the players on the other side would be paid from the same coins. Try it as the server:

```sql
set local role service_role;
update public.prediction_pools
   set status = 'open', outcome = null, settlement = null, settled_by = null,
       settled_at = null, cut_coins = null, paid_coins = null
 where question_id = 'desk-pay';
```

Expected: the error `pool_settled`, and nothing changes. Any other change to a settled pool fails in the same way:

```sql
set local role service_role;
update public.prediction_pools set paid_coins = 1000000 where question_id = 'desk-pay';
```

Expected: `pool_settled` again. Run the **Pool check** of P9 once more: it still shows `settled`, `yes`, `winners`, `host`, `cut_coins` 2 and `paid_coins` 98. (Run this step after P15: it also shows that the trigger is still there after the migration was run a second time. The pool `desk-pay` is still there, because a pool is never deleted.) A pool that is still open can be settled as before (P9, P12): the trigger only looks at a row that is already settled.

**The race checks (R1 to R4).** These prove that the locks work. Each needs two query tabs of the SQL editor. In the first tab, run the block that ends with `select pg_sleep(10);`: it keeps its transaction (and so its locks) open for 10 seconds. Within 5 seconds, run the block in the second tab. The second one must **wait** (its run takes several seconds) and then give the answer written below. Use user E for R1 and the pools below for the rest, and start R2 and R3 only after the stakes of their first step exist.

- **R1. The same player on two questions: the daily cap holds.** Tab 1: `set local role service_role; select public.prediction_place_stake('USER_E_ID', 'desk-r1a', 'yes', 150, 'desk-e-r1a-0001', now() + interval '1 day', 150, 200, now() - interval '1 hour'); select pg_sleep(10);` Tab 2: `set local role service_role; select public.prediction_place_stake('USER_E_ID', 'desk-r1b', 'yes', 100, 'desk-e-r1b-0001', now() + interval '1 day', 150, 200, now() - interval '1 hour');` Expected: tab 2 waits, then answers `refused`, `daily_cap`, `coinsLeft` 50. Without the wallet lock it would have let the second stake through.
- **R2. Two settlements of one pool: one pays, one is refused.** First place the stakes like in P9, in the pool `desk-r2` and with new stake ids such as `desk-a-r2-0001`: A 30 and B 20 on YES, C 50 on NO. Then tab 1 and tab 2 run the settlement of P9 with `'desk-r2'` instead of `'desk-pay'` and a closing time one minute ago, tab 1 with `select pg_sleep(10);` after it. Expected: tab 1 `done`, tab 2 waits and then fails with `already_applied`. The ledger has exactly two `prediction_payout` rows with the ref `pool:desk-r2`.
- **R3. A stake during a settlement waits, then finds the pool closed.** First place the stakes A 10 on YES and B 10 on NO in the pool `desk-r3` (new stake ids such as `desk-a-r3-0001`). Tab 1 settles it as `void` like in P12 (the payouts are the stakes) followed by `select pg_sleep(10);`. Tab 2: E stakes 10 on `desk-r3`. Expected: tab 2 waits and then answers `refused`, `pool_closed`.
- **R4. The same stake id twice at the same moment: one stake.** Tab 1: A stakes 10 on `desk-r4` with the stake id `desk-a-r4-0001`, followed by `select pg_sleep(10);`. Tab 2: the same call. Expected: tab 2 waits and then fails with `already_applied`. A has one stake on `desk-r4` and was charged 10 coins once (the Desk check for A shows one ledger row `prediction_stake -10 stake:desk-a-r4-0001`).

Delete the test users when you are done (**Authentication > Users**). Their stakes go with them.

## Changing the database later

- Never edit a migration that has been applied anywhere. Add a new file named `supabase/migrations/<YYYYMMDDHHMMSS>_<topic>.sql` with a later time stamp.
- A new table needs, in the same file: row-level security switched on, policies, **explicit grants** (our project gives no rights to a new table, so nothing works until you grant them, and you grant only what is really needed), and a comment on the table, every column and every policy. Take every right away first (`revoke all` from `public`, `anon`, `authenticated` and `service_role`), then grant. The browser only reads, so `authenticated` gets `select` at most. If the table has an identity column (`generated always as identity`), also revoke all rights on its counter, as the foundation file does for `wallet_transactions_id_seq`. Copy the style of the foundation file.
- A new function needs `revoke ... from public, anon, authenticated` and then `grant execute` only to the role that must run it. Start it with `set search_path = ''`.
- A new wallet reason is one new migration with one `insert into public.wallet_reasons (reason, direction, description) values (...) on conflict (reason) do nothing;`, plus the same `(reason, direction)` pair added at the **end** of `WALLET_REASONS` in `backend/server/wallet.py`, in the same pull request. Never rename a reason or change its direction, because ledger rows point at it. The test `backend/server/tests/test_wallet_matches_migration.py` reads every migration in order and fails if the two lists differ. Add the reason to the manual test plan (step 15) too.
- Realtime is not switched on for these tables yet. The work package that needs it adds it.
- If something here is unclear, open an issue before changing the rules for money.
