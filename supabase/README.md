# Supabase database

This folder holds the database of The Great Plot Twist. Supabase gives us the login (GitHub sign-in), a Postgres database and realtime. Everything the game must remember lives here: who the players are, their saved progress, their coins and their crews.

Play money only: coins cannot be bought, cashed out or exchanged for real prizes. Every player starts with 0 coins. The first coins come later, from the intro entry kit (the `kit_grant` reason).

The browser only reads from this database. Every write comes from our Python server with the secret key.

| File | What it is |
|---|---|
| [migrations/20261106000000_foundation.sql](migrations/20261106000000_foundation.sql) | The first migration: seven tables, the security rules, the rights of each database role and four functions. Every table, column and policy is explained inside the file. |
| [migrations/20261106010000_island_exchange.sql](migrations/20261106010000_island_exchange.sql) | The second migration, for the Island Exchange (package L4): three wallet reasons, three tables and two functions. Run it after the first. See [The Island Exchange migration](#the-island-exchange-migration). |
| [migrations/20261106020000_accounts.sql](migrations/20261106020000_accounts.sql) | The third migration, for the accounts (package A2: captain names, cloud progress and "delete my data"): one table and four functions. Run it after the first. See [The accounts migration](#the-accounts-migration-package-a2). |
| [migrations/20261106030000_entry_profiles.sql](migrations/20261106030000_entry_profiles.sql) | The fourth migration, for the referee and the entry kits (package A3): one table and one function. Run it after the first, and **before** the code that reads it is merged into `main` (see [Apply before you merge](#apply-before-you-merge)). See [The entry kits migration](#the-entry-kits-migration-package-a3). |

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

The display name is 2 to 24 characters from A-Z, a-z, 0-9, space, underscore, dot and hyphen, with no space at the start or end. At sign-up every player gets a neutral placeholder: `Captain-` plus the first 6 characters of their id, for example `Captain-3fa85f`. The name **never** comes from the GitHub login or any other login detail, because names appear on a projector. Package A2 generates real captain names on the server (`POST /api/me/name`, from the word lists in `backend/content/names.json`; see [The accounts migration](#the-accounts-migration-package-a2)). Players cannot change their name, because the browser has no right to write to `profiles`.

### Crews and seats

A crew has up to four seats (numbered 1 to 4). Every seat that is taken holds **either** a player (`player_id`) **or** an NPC partner (`npc_id`), never both and never nobody. An NPC partner is a crew mate that the game runs. That is how the game works for one player alone: the player sits in seat 1 and NPC partners fill the other seats. A seat that nobody holds has no row. An `npc_id` is 2 to 40 characters: a-z, 0-9 and underscore.

A player can read a crew and its seats only while they sit in that crew. The rule uses the small helper `is_crew_member()`. The helper exists so that the rule for `crew_seats` does not have to read `crew_seats` through its own rule, which would never end. Only the server creates crews and seats.

Three things to know:

- **At most one open crew per player** (a crew that is `forming` or `active`) is kept by the four crew functions below, under a lock on the player's profile, and not by a table rule. By team rule the server writes crews and seats only through those functions (the same rule as the wallet). The database itself guards one seat per player and one seat per NPC partner in a crew (two unique indexes), the kit ids, and the crew code.
- If a player is deleted, their seat row is deleted with them, and the seat is empty again: a friend who joins fills an empty seat first. If the player who created a crew is deleted, the whole crew and all its seats are deleted.
- The crew migration changes no row that exists. A crew or a seat written before it (only test rows from the manual test plan) stays as it is.

### Crew codes, the muster and partners (migration 20261106040000, package A6)

`migrations/20261106040000_crew_codes.sql` adds what the crew routes (`backend/server/routes/crews.py`, decision D020) need. Run it **after** the foundation migration. It is safe to run twice and explains itself inside the file. It reads nothing from the entry kits migration of package A3: the server passes each player's kit in.

| Name | What it is | Who changes it |
|---|---|---|
| `crews.code` | The crew code a friend types: 6 symbols from `A-Z` without `I`, `L` and `O`, and `2-9` (for example `K7QF2M`). Unique. A crew made before this migration has no code. | `crew_create()` |
| `crews.version` | Counts the changes of a crew (starts at 1). A join or the muster works only if the server read the current version, so a request never acts on an old picture of the crew. | `crew_take_seat()`, `crew_start()` |
| `crews.started_at` | When the muster happened. Empty while the crew is forming. | `crew_start()` |
| `crew_seats.kit` rule | A seat carries one of `true_keeper`, `witness`, `informant`, `stranger`. Checked for every new or changed row; rows from before are not checked again (`not valid`), so the migration cannot fail on old test data. | the database |
| Two unique indexes | One seat per player in a crew, and one seat per NPC partner in a crew. | the database |
| `crew_join_failures` | One row for every wrong crew code a player typed, to slow down guessing. No policy: players see nothing. Rows older than the window are deleted each time the table is used. | `crew_find_by_code()` |
| `crew_create()` | Starts a crew with the player in seat 1 (mode `solo`, status `forming`). It returns the player's own draft if they already have one (a crew they started and sit in alone), and refuses a player who sits in another open crew. | Run by the server only. |
| `crew_find_by_code()` | Looks a crew up by its code and answers with the crew and all its seats. Counts wrong guesses: after 10 wrong codes in 10 minutes it refuses **before it looks at the code**, so even a right code is refused and a guesser cannot confirm a hit. | Run by the server only. |
| `crew_take_seat()` | Seats a friend in an empty seat, or in an NPC partner's seat. The server decides the seat and the kit; the function checks that the crew still has the version the server read. A player who started a crew and sits in it alone gives that draft up by joining another crew, in the same step. | Run by the server only. |
| `crew_start()` | The muster: seats the NPC partners the server chose in every empty seat, then makes the crew `active`. The crew must have four seats afterwards. | Run by the server only. |

A crew function *returns* `{"status": ...}`, or `{"status": "refused", "reason": ...}` with nothing changed when a rule says no (the same pattern as `market_trade()`). It *raises* only for a bug, such as a bad argument. Every refusal comes before the first change, because a function that returns keeps what it has done so far.

Which seat a friend takes and which kit each NPC partner carries is decided by the server (`backend/server/crews/seats.py`). The database does not repeat those two rules. Two of the choices there wait for Nils and are marked `PENDING` in the code: the kit a seat carries after a friend takes over a partner (built default: the friend's own kit), and the order in which partners fill the missing kits (built default: informant, stranger, true_keeper, witness).

After applying it, the three quick checks show **one more table** (`crew_join_failures`, with row-level security and no policy and no grant for players). Run the crew checks (steps C1 to C8) after step 17 of the manual test plan.

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

## The accounts migration (package A2)

`migrations/20261106020000_accounts.sql` is the database part of package A2: generated captain names, progress in the cloud and "delete my data" (see [INTERFACES.md, section 2](../docs/INTERFACES.md#post-apimename-and-reroll) and decisions [D006 and D022](../docs/DECISIONS.md)). Run it **after** the foundation migration, because it uses the tables `profiles`, `saves`, `crews` and `crew_seats` from there. It is safe to run twice. Everything is explained in the file itself. It adds one table, so the three quick checks below show one more table, one more policy and one more row for `authenticated` than before.

| Name | What it is | Who changes it |
|---|---|---|
| `captain_name_rerolls` | One row per player who used their one captain name re-roll. The primary key is the player id, so a second re-roll is impossible. `action_uid` is the id the browser made for the click, so a repeat of the same request is recognised. | Only the server, through `reroll_captain_name()`. |
| `assign_captain_name()` | Gives a player their generated name, but only while they still have the sign-up placeholder. A repeat, or a request at the same moment, changes nothing and returns the first name. | Run by the server only. |
| `reroll_captain_name()` | Changes the name once. It locks the profile, so two re-rolls of one player happen one after the other. It *returns* a refusal such as `{"status": "refused", "reason": "no_rerolls_left"}` (also `already_applied` for a repeat of the same request, and `no_name_yet` before the first name) with nothing changed, and *raises* `same_name` when the server sends the current name again (a bug on the server side). | Run by the server only. |
| `save_progress()` | Writes a save only if it still has the version the caller read, and then adds 1. It *returns* `{"status": "stale", "version": ...}` when somebody saved first, `too_big` when the data is over 200000 bytes as text (the limit of the table rule), and `missing` when the player has no save. It *raises* `bad_save` for a missing version or data that is not a JSON object. | Run by the server only. |
| `delete_player()` | Deletes the login in `auth.users`, and the database removes everything else by cascade (see below). First it hands a crew that the player started and that others sit in to the player in the lowest seat. Answers `deleted` or `not_found`. | Run by the server only. |

It also changes the meaning of the column `saves.version`. The foundation file called it the version of the save format, and nothing ever used it that way. Now it **counts the writes**, starting at 1. Two devices of one player cannot overwrite each other: `PUT /api/save` sends the version it last read, and `save_progress()` refuses to write when the save has moved on. The server checks the size of a save first (100000 bytes of compact JSON); the database checks it again at the limit of the table rule (200000 bytes of its own JSON text), because a small JSON can grow a lot when it is written out (a number such as `1e300` becomes 301 digits).

**What "delete my data" deletes.** `delete_player()` deletes the login, and the database follows the cascading foreign keys: the profile, save, wallet, **all ledger rows**, seats, Island Exchange positions and trades, the name re-roll, and every table a later package ties to the player with `references public.profiles (id) on delete cascade`. That is the rule for every later table: if a row must outlive the player, it uses `on delete set null` on a nullable column instead. **The ledger keeps nothing about the player**: the coins are play money, no other player's balance depends on those rows, and a ledger that stayed would still be tied to an account id. A crew that the player started and that other players sit in is **handed over first** to the player in the lowest seat, so friends keep their game. The deleted player's own seat goes with them and is open again. A crew nobody else sits in is deleted with the player. **The handover happens only in `delete_player()` (`DELETE /api/me`).** Deleting a user in the dashboard (**Authentication > Users**) skips it and deletes every crew the user started, with everyone's seats. Whether the team wants this is decision D022, pending Nils.

**What it does not delete.** Supabase Auth keeps its own audit log, the table `auth.audit_log_entries`. It has no foreign key to `auth.users`, so deleting the login does not remove its rows. The `payload` of a row can hold the actor's id and the login e-mail address, and the row can hold an IP address. Supabase's platform logs stay too, and they expire on Supabase's own schedule. Step N6 below counts the audit log rows that a deleted test user leaves. Whether to purge those rows, or to stop Auth writing its audit log to the database (if the Auth settings of the project allow it), is part of the pending "delete my data" decision (D022).

**Why `delete_player()` is `SECURITY DEFINER`.** Deleting from `auth.users` needs the rights of the function owner (the `postgres` role), which the server's role does not have. It is the only `SECURITY DEFINER` function among the new ones, and it is safe for three reasons: only `service_role` may run it, it takes the id from the server (which takes it from the verified login), and it starts with `set search_path = ''` and names every table in full. The other three functions run with the rights of their caller, like `market_trade()`.

## The entry kits migration (package A3)

`migrations/20261106030000_entry_profiles.sql` is the database part of package A3: the referee and the entry kits (see [INTERFACES.md, section 2](../docs/INTERFACES.md#post-apiintrocomplete) and decision [D019](../docs/DECISIONS.md)). Run it **after** the foundation migration, because it uses the tables `profiles` and `wallet_transactions`, the wallet reason `kit_grant` and the function `apply_wallet_transaction()` from there. It is safe to run twice. Everything is explained in the file itself. It adds one table, so the three quick checks below show one more table, one more policy and one more row for `authenticated` than before.

**Apply it before the branch that reads `GET /api/me` is merged into `main`.** That route already exists and is live, and the new code makes it read `entry_profiles` (for `kit` and `place`). A merge into `main` deploys to production at once, and a server that runs without the table answers `502 database_error` on `GET /api/me` for every player. That also breaks the sign-in check page (`/auth-check.html`) and deploy check 5 in [SETUP.md](../docs/SETUP.md). Previews use the same Supabase project, so a preview breaks in the same way. See [Apply before you merge](#apply-before-you-merge).

| Name | What it is | Who changes it |
|---|---|---|
| `entry_profiles` | One row per player who finished Act 1: the ending, the decision, whether they read the logbook, the kit with its start place and coins, the move count and the SHA-256 of the story file the replay used. The primary key is the player id, so there is exactly one row per player: the first ending counts. | Only the server, through `grant_entry_kit()`. Nobody updates or deletes a row; it goes with its player, by cascade. |
| `grant_entry_kit()` | Stores the entry profile and pays the kit coins, once, in one step. It locks the player's profile row first, so two requests at the same moment run one after the other. If a profile exists already it changes nothing, pays nothing and returns the **stored** profile with status `stored`. Otherwise it stores the profile and pays the coins through `apply_wallet_transaction()` (reason `kit_grant`, ref `kit`) and returns status `granted`. It *returns* `{"status": "missing"}` for a player with no profile row, and *raises* an error, with nothing changed, if a value breaks a table rule (a kit id that does not exist) or the wallet call fails. | Run by the server only. |

The kit coins are paid by this function and by nothing else. The profile and the payment are one transaction: either both are saved or neither. The ledger accepts the pair (player, `kit_grant`, `kit`) once, which is the last guard against a second payment. Step 2 of the manual test plan pays that same reason and ref by hand to the test users A and B; `grant_entry_kit()` copes with that (it stores the profile and pays nothing more), but use new test users for the entry kit checks below.

The server decides which ending leads to which kit (`backend/content/entry_kits.json`, replayed by `backend/server/game/referee.py`). The table only makes sure that a row holds values of the right kind: one of the four kit ids (the list in the rule `entry_profiles_kit_allowed` is compared with `entry_kits.json` by a test), one of three decisions, a move count from 1 to 300, coins from 1 to 1,000,000 (the limit of a wallet change), ids in the usual format and a story hash of 64 hexadecimal characters.

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
5. Do the same with `migrations/20261106010000_island_exchange.sql` (the Island Exchange), in a new query. The files start with a time stamp, so apply them oldest first. Steps 5, 6 and 7 each need only the foundation (step 3), not each other, so step 5 can wait until the Exchange goes live (see [Apply before you merge](#apply-before-you-merge) for what that means for the Supabase CLI).
6. Do the same with `migrations/20261106020000_accounts.sql` (captain names, cloud progress, delete my data), in a new query.
7. Do the same with `migrations/20261106030000_entry_profiles.sql` (the referee and the entry kits), in a new query. Do this **before** the branch that reads `GET /api/me` is merged into `main`, and before you test a preview of it.

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

### Apply before you merge

Every push to `main` deploys to production at once, and previews use the same Supabase project. So a migration has to be applied **before** the code that needs it reaches `main`, or a preview you want to test. Applying a migration first is safe when it only adds things, as both new files do (the accounts file also re-words the comment on one column): the code that is live does not use the new tables and functions, and each file is safe to run twice. (A migration that changes or removes something the live code uses is a different case and needs its own plan.)

Today this decides the order for one file. `20261106030000_entry_profiles.sql` matters most, because `GET /api/me` already exists and is live, and the new code makes it read `entry_profiles`. Until the table exists, every player gets `502 database_error` there. `20261106020000_accounts.sql` matters less: the new routes (names, saves, delete my data) also answer `502` until it is applied, but no screen calls them yet.

The order to follow: get Nils' OK, apply `20261106020000_accounts.sql` and `20261106030000_entry_profiles.sql`, check a preview, and only then merge the branch into `main`. If a merge has to come first, keep the read of `entry_profiles` out of `backend/server/routes/me.py` (so `kit` and `place` stay `null`) and merge that read after the apply.

A rule that holds for every later migration: when a route that is live today starts to read a new table, apply the migration first. When only new routes or a switched-off feature (a flag that is off) use it, the migration may follow the merge. The Island Exchange was safe to merge first for that reason.

With the Supabase CLI (Option B), the CLI records which files it applied. If you apply `20261106020000` and `20261106030000` while the older `20261106010000_island_exchange.sql` is still unapplied, a later `supabase db push` refuses the older file until you add `--include-all`.

### Three quick checks after applying

Run all three in the SQL editor.

```sql
select relname as table_name, relrowsecurity as rls_on
from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r'
order by relname;
```

Expected: the seven tables `crew_seats`, `crews`, `profiles`, `saves`, `wallet_reasons`, `wallet_transactions`, `wallets`, each with `rls_on` = true. After the Island Exchange migration there are ten: also `market_bases`, `market_positions` and `market_trades`.

```sql
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Expected: 7 policies, one on each table, and every `cmd` is `SELECT`. There is no policy that lets a player write. After the Island Exchange migration there are 10 (one more on each new table).

```sql
select grantee, table_name, string_agg(privilege_type, ', ' order by privilege_type) as rights
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
group by grantee, table_name
order by grantee, table_name;
```

Expected: no row for `anon`. For `authenticated`, 7 rows (one per table), and `rights` is `SELECT` in every row. After the Island Exchange migration: 10 rows.

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
| `wallets` | update | no access | no access | yes [1] |
| `wallets` | delete | no access | no access | no access (a wallet goes only when its player is deleted) |
| `wallet_reasons` | read | no access | all rows | yes |
| `wallet_reasons` | insert | no access | no access | no access (a new reason arrives with a new migration) |
| `wallet_reasons` | update | no access | no access | no access |
| `wallet_reasons` | delete | no access | no access | no access |
| `wallet_transactions` | read | no access | own rows | yes |
| `wallet_transactions` | insert | no access | no access | yes [1] |
| `wallet_transactions` | update | no access | no access | no access (the ledger is append-only: rows disappear only when their player is deleted, by cascade) |
| `wallet_transactions` | delete | no access | no access | no access (the ledger is append-only: rows disappear only when their player is deleted, by cascade) |
| `crews` | read | no access | crews they sit in | yes |
| `crews` | insert | no access | no access | yes [5] |
| `crews` | update | no access | no access | yes [5] |
| `crews` | delete | no access | no access | yes [5] |
| `crew_seats` | read | no access | seats of crews they sit in | yes |
| `crew_seats` | insert | no access | no access | yes [5] |
| `crew_seats` | update | no access | no access | yes [5] |
| `crew_seats` | delete | no access | no access | yes [5] |
| `crew_join_failures` | read | no access | no access | yes |
| `crew_join_failures` | insert | no access | no access | yes (through `crew_find_by_code()`) |
| `crew_join_failures` | update | no access | no access | no access |
| `crew_join_failures` | delete | no access | no access | yes (through `crew_find_by_code()`, rows older than the window) |
| `market_bases` | read | no access | all rows | yes |
| `market_bases` | insert | no access | no access | yes [2] (through `market_set_base()`) |
| `market_bases` | update | no access | no access | yes [2] (through `market_set_base()`) |
| `market_bases` | delete | no access | no access | no access (a company's base is never deleted) |
| `market_positions` | read | no access | own rows | yes |
| `market_positions` | insert | no access | no access | yes [2] (through `market_trade()`) |
| `market_positions` | update | no access | no access | yes [2] (through `market_trade()`) |
| `market_positions` | delete | no access | no access | yes [2] (through `market_trade()`, when a player sells everything) |
| `market_trades` | read | no access | own rows | yes |
| `market_trades` | insert | no access | no access | yes [2] (through `market_trade()`) |
| `market_trades` | update | no access | no access | no access (the history is append-only: rows disappear only when their player is deleted, by cascade) |
| `market_trades` | delete | no access | no access | no access (same) |
| `captain_name_rerolls` | read | no access | own row | yes |
| `captain_name_rerolls` | insert | no access | no access | yes [3] (through `reroll_captain_name()`) |
| `captain_name_rerolls` | update | no access | no access | no access (a re-roll is final) |
| `captain_name_rerolls` | delete | no access | no access | no access (goes with its player, by cascade) |
| `entry_profiles` | read | no access | own row | yes |
| `entry_profiles` | insert | no access | no access | yes [3] (through `grant_entry_kit()`) |
| `entry_profiles` | update | no access | no access | no access (the first ending counts) |
| `entry_profiles` | delete | no access | no access | no access (goes with its player, by cascade) |

[1] The database lets the server update `wallets` and add ledger rows directly, because `apply_wallet_transaction()` runs with the server's rights and needs both. Our rule is that the server does this only through that function. A direct update skips the ledger row, so the balance no longer matches the ledger. Reading a balance in Python and then writing a new one can lose coins when two requests arrive together. The function cannot. A direct ledger insert would also skip the direction check, because that check lives in the function (a table rule cannot look into `wallet_reasons`). The foreign key still refuses an unknown reason, and the table still refuses a missing or blank `ref`.

[2] The database lets the server write `market_positions` and add `market_trades` rows directly, and add and change `market_bases` rows directly, because the two functions run with the rights of the server. "Through `market_trade()`" and "through `market_set_base()`" in the table are our rule, not something the database enforces (the same pattern as `wallets` above). A direct write would skip the checks of `market_trade()`: the arithmetic, the daily cap, the holding time and the wallet. Only the server holds that right, and the code never writes these tables directly.

[3] The same holds for the two insert rows of the account and entry kit tables: the database lets the server add a row to `captain_name_rerolls` and to `entry_profiles` directly, because `reroll_captain_name()` and `grant_entry_kit()` run with the rights of their caller. "Through `reroll_captain_name()`" and "through `grant_entry_kit()`" are our rule, not something the database enforces. A direct insert into `captain_name_rerolls` would use up a player's one re-roll without changing their name. A direct insert into `entry_profiles` would store a profile without paying the kit coins, and without the lock that makes two requests of one player run one after the other. The code never writes these tables directly.

[4] `delete_player()` is `SECURITY DEFINER`, because it deletes the login in `auth.users`, and that needs the rights of the function owner. It is safe because only `service_role` may run it and the server passes the id of the verified player. It hands every crew the player started to the player in the lowest other seat before it deletes the login.

[5] `crews` and `crew_seats`: the server writes them through the four crew functions (`crew_create()`, `crew_find_by_code()`, `crew_take_seat()` and `crew_start()`), a team rule as with the wallet. The database lets the server write the two tables directly, because the functions run with the rights of the server. A direct write would skip the locks, the version check and the rule that a player sits in at most one open crew. The code never writes these tables directly.

Rows disappear from the ledger only when their player is deleted: deleting a player (a `profiles` row, or the user under Authentication > Users) also deletes their save, wallet, ledger rows and seats, and the crews they started, through cascading foreign keys. No role needs a `delete` right on those tables for that.

| Function or counter | Visitor (`anon`) | Signed-in player (`authenticated`) | Server (`service_role`) |
|---|---|---|---|
| `apply_wallet_transaction()` | no access | no access | yes |
| `is_crew_member()` | no access | yes, and it only ever answers for the caller | no access, the server skips RLS and does not need it |
| `crew_create()` | no access | no access | yes |
| `crew_find_by_code()` | no access | no access | yes |
| `crew_take_seat()` | no access | no access | yes |
| `crew_start()` | no access | no access | yes |
| `crew_join_failures_id_seq` (the wrong-code counter's id counter) | no access | no access | no access, the table's own inserts do not need a right on it |
| `handle_new_user()` | no access | no access | no access, only the sign-up trigger runs it |
| `touch_updated_at()` | no access | no access | no access, only the triggers run it |
| `wallet_transactions_id_seq` (the ledger's id counter) | no access | no access | no access, the table's own inserts do not need a right on it |
| `market_trade()` | no access | no access | yes |
| `market_set_base()` | no access | no access | yes |
| `market_trades_id_seq` (the trade history's id counter) | no access | no access | no access, the table's own inserts do not need a right on it |
| `assign_captain_name()` | no access | no access | yes |
| `reroll_captain_name()` | no access | no access | yes |
| `save_progress()` | no access | no access | yes |
| `delete_player()` [4] | no access | no access | yes |
| `grant_entry_kit()` | no access | no access | yes |

"No access" means the database refuses with `permission denied`, or (for a row that belongs to someone else) shows or changes nothing.

Supabase's security advisor may warn that a signed-in player can run a `SECURITY DEFINER` function. That is `is_crew_member()`, and it is on purpose. It takes a crew id, compares it with the caller's own id (`auth.uid()`), and returns only true or false. It cannot tell anyone who sits in somebody else's crew.

## What the server's secret key may do

- It skips row-level security. It can read every player's rows in all ten tables and write `profiles`, `saves`, `crews` and `crew_seats` (and, see below, the Exchange tables). Its table rights are still limited: it can update `wallets` but not insert or delete one, it can add ledger rows but not edit or delete one, and it can only read `wallet_reasons`.
- It is the only role that may run `apply_wallet_transaction()`. That is the one way to change a balance. The same holds for `market_trade()` (a trade) and `market_set_base()` (a company's base): the server runs them, nobody else.
- On the Exchange tables it can read all three, add and change `market_bases`, add, change and delete `market_positions`, and only add `market_trades` rows. It cannot edit or delete a trade. Like the wallet, this is a rule of the team more than a lock: see note [2] of the matrix.
- On the account functions it may read and add `captain_name_rerolls` rows (only through `reroll_captain_name()`; a re-roll is final, so no update and no delete), and it is the only role that may run `assign_captain_name()`, `reroll_captain_name()`, `save_progress()` and `delete_player()`. `delete_player()` is the most powerful call the server can make: it deletes a login and everything about a player. The Python code passes it only the id of the verified player, and only after the request said `"confirm": true`.
- On the entry kit table it may read and add `entry_profiles` rows (only through `grant_entry_kit()`; a profile is written once and the first ending counts, so no update and no delete), and it is the only role that may run `grant_entry_kit()`. That function is also the only place where the entry kit coins are paid.
- Because it skips RLS, the Python code must first check who is asking (the player's verified login token) and only then touch that player's rows.
- It must never reach a browser, the repository, a log or a screenshot. It lives only in the `SUPABASE_SECRET_KEY` environment variable on Vercel, and in a local `.env` file that git ignores.
- The browser only gets `SUPABASE_PUBLISHABLE_KEY` (as `VITE_SUPABASE_PUBLISHABLE_KEY`). That key is safe to show because the two locks above protect every table, and the browser has no right to write to any of them.

## Manual test plan

You need about 30 minutes. It proves the rules for reading and writing, the money function, the eight reasons and the crews with two test players, A and B.

The steps 1 to 17 check the foundation migration. If the Island Exchange migration is applied too, read **11** instead of 8 for the number of reasons in steps 4 and 16. Step 15 still tests the first eight reasons. The checks of the Island Exchange, including its three new reasons, are the steps E1 to E13 at the end of this plan.

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

Crew A is a solo crew: player A in seat 1 and three NPC partners. Crew B has player B in seat 1 and one NPC partner. Every seat carries one of the four kit ids (`witness`, `informant`, `stranger`, `true_keeper`), because the crew migration of package A6 checks the kit of every new seat. If only the foundation is applied, the kit is not checked, and these rows work too.

```sql
set local role service_role;
insert into public.crews (id, created_by, mode) values
  ('CREW_A_ID', 'USER_A_ID', 'solo'),
  ('CREW_B_ID', 'USER_B_ID', 'crew');
insert into public.crew_seats (crew_id, seat_no, player_id, npc_id, kit) values
  ('CREW_A_ID', 1, 'USER_A_ID', null, 'witness'),
  ('CREW_A_ID', 2, null, 'old_salt', 'informant'),
  ('CREW_A_ID', 3, null, 'deck_hand', 'stranger'),
  ('CREW_A_ID', 4, null, 'cook_pete', 'true_keeper'),
  ('CREW_B_ID', 1, 'USER_B_ID', null, 'stranger'),
  ('CREW_B_ID', 2, null, 'old_salt', 'informant');
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
insert into public.crew_seats (crew_id, seat_no, npc_id, kit) values ('CREW_B_ID', 3, 'deck_hand', 'witness') returning seat_no, npc_id, kit;
```

Expected: 1 row.

The database guards the shape of a seat, even against the server. Every statement below carries a valid kit, on purpose: Postgres checks the rules of a table in the order of their names, and `crew_seats_kit_allowed` (added by the crew migration) comes before the rule each statement is meant to test.

```sql
set local role service_role;
insert into public.crew_seats (crew_id, seat_no, npc_id, kit) values ('CREW_B_ID', 5, 'old_salt', 'witness');
```

Expected: `violates check constraint "crew_seats_seat_no_range"`. Now replace the last line and run again:

| Statement as `service_role` | Expected error mentions |
|---|---|
| `insert into public.crew_seats (crew_id, seat_no, npc_id, kit) values ('CREW_B_ID', 4, 'Old Salt', 'witness');` | `crew_seats_npc_id_format` |
| `insert into public.crew_seats (crew_id, seat_no, player_id, npc_id, kit) values ('CREW_B_ID', 4, 'USER_A_ID', 'old_salt', 'witness');` | `crew_seats_player_or_npc` |
| `insert into public.crew_seats (crew_id, seat_no, kit) values ('CREW_B_ID', 4, 'witness');` | `crew_seats_player_or_npc` |
| `insert into public.crew_seats (crew_id, seat_no, npc_id, kit) values ('CREW_B_ID', 2, 'cook_pete', 'witness');` | `crew_seats_pkey` |
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

### Crew checks (steps C1 to C8)

These steps test the crew migration (`20261106040000_crew_codes.sql`, package A6). Run them after the foundation migration and the crew migration are both applied. The entry profiles of package A3 are needed only for the last check of C8. Use **three new test users**, A, B and C (the users of the steps above were deleted in step 17, so create new ones as in the set-up of this plan), and replace `USER_A_ID`, `USER_B_ID` and `USER_C_ID` with their ids. The crew functions get each player's kit from the server, so the blocks below pass the kits in. Run every block in its own run.

We call the next block the **Crew check** and use it again below (default role). It lists the crews that the three players started, with their seats written as `seat player-or-partner kit`:

```sql
select c.code, c.status, c.mode, c.version, c.started_at is not null as sailed,
       (select string_agg(
                 s.seat_no || ' '
                 || case s.player_id when 'USER_A_ID' then 'A' when 'USER_B_ID' then 'B' when 'USER_C_ID' then 'C' else s.npc_id end
                 || ' ' || s.kit,
                 ', ' order by s.seat_no)
          from public.crew_seats s where s.crew_id = c.id) as seats
from public.crews c
where c.created_by in ('USER_A_ID', 'USER_B_ID', 'USER_C_ID')
order by c.created_at;
```

**C1. Start a crew, and the same request again.** Player A starts a crew with the code `K7QF2M` and the kit `witness` (the server sends the code and the kit):

```sql
set local role service_role;
select public.crew_create('USER_A_ID', 'K7QF2M', 'witness') as result;
```

Expected: `result` has `status` `created` and a `crewId`. The Crew check shows one row: `K7QF2M`, `forming`, `solo`, version 1, `sailed` false, seats `1 A witness`. Now send the request again with another code, as a double click would:

```sql
set local role service_role;
select public.crew_create('USER_A_ID', 'AAAAAA', 'witness') as result;
```

Expected: `status` `existing` and the same `crewId`. The Crew check still shows one row with the code `K7QF2M`: the second code was not used, and no second crew exists.

**C2. A wrong code adds one failure row and changes no crew.** Player B types a code that no crew has:

```sql
set local role service_role;
select public.crew_find_by_code('USER_B_ID', 'ZZZZZZ', 10, 600) as result;
```

Expected: `status` `refused`, `reason` `wrong_code`. The Crew check is the same as after C1: no crew and no seat changed. The only change is one row in the table of wrong codes (default role):

```sql
select count(*) as wrong_codes from public.crew_join_failures where player_id = 'USER_B_ID';
```

Expected: `wrong_codes` is 1. Now the right code:

```sql
set local role service_role;
select public.crew_find_by_code('USER_B_ID', 'K7QF2M', 10, 600) as result;
```

Expected: `status` `found`, `crewStatus` `forming`, `version` 1 and one entry in `seats`: player A in seat 1 with the kit `witness`. A right code adds no row: `wrong_codes` is still 1.

**C3. Ten wrong codes, then even the right code is refused.** Player B types nine more wrong codes, which makes ten:

```sql
set local role service_role;
select public.crew_find_by_code('USER_B_ID', 'YYYYYY', 10, 600) as result from generate_series(1, 9);
```

Expected: nine rows, each `refused` with `wrong_code`. The next try uses the **right** code (a new run):

```sql
set local role service_role;
select public.crew_find_by_code('USER_B_ID', 'K7QF2M', 10, 600) as result;
```

Expected: `status` `refused`, `reason` `too_many_attempts` and `retryAfterSeconds` of about 600 (a little less). The right code is refused **before** the code is looked at, so a guesser cannot find out whether a guess was right. `wrong_codes` stays at 10: a refused try adds no row. Pretend that 11 minutes have passed (default role), then try the right code again:

```sql
update public.crew_join_failures set attempted_at = now() - interval '11 minutes' where player_id = 'USER_B_ID';
```

```sql
set local role service_role;
select public.crew_find_by_code('USER_B_ID', 'K7QF2M', 10, 600) as result;
```

Expected: `status` `found`. The old wrong codes were deleted: `wrong_codes` is 0.

**C4. Join seat 2, and an old version gives `changed`.** The server read the crew at version 1 and decided that player B takes seat 2 with B's own kit `stranger`. First a request with an old picture of the crew (version 99, which does not match):

```sql
set local role service_role;
select public.crew_take_seat((select id from public.crews where code = 'K7QF2M'), 'USER_B_ID', 2, 'stranger', 99) as result;
```

Expected: `status` `refused`, `reason` `changed`, and nothing changed (the Crew check is the same as after C1). Now with the version the server read:

```sql
set local role service_role;
select public.crew_take_seat((select id from public.crews where code = 'K7QF2M'), 'USER_B_ID', 2, 'stranger', 1) as result;
```

Expected: `status` `joined`, `seatNo` 2 and `replacedPartner` null (the seat was empty). The Crew check: mode `crew`, version 2, seats `1 A witness, 2 B stranger`.

**C5. A second seat is refused, and so is a second crew.** Player B tries to take seat 3 of the same crew:

```sql
set local role service_role;
select public.crew_take_seat((select id from public.crews where code = 'K7QF2M'), 'USER_B_ID', 3, 'stranger', 2) as result;
```

Expected: `status` `refused`, `reason` `already_seated`. Player A, who now sits in a crew with a friend, cannot start another crew either:

```sql
set local role service_role;
select public.crew_create('USER_A_ID', 'BBBBBB', 'witness') as result;
```

Expected: `status` `refused`, `reason` `already_in_crew`. The Crew check is the same as after C4.

**C6. The muster fills the crew to four seats, and a second start is refused.** The server read the crew at version 2 and chose the Bosun with the kit `informant` for seat 3 and the Cook with the kit `true_keeper` for seat 4:

```sql
set local role service_role;
select public.crew_start(
  (select id from public.crews where code = 'K7QF2M'), 'USER_A_ID',
  '[{"seatNo": 3, "npcId": "bosun", "kit": "informant"}, {"seatNo": 4, "npcId": "cook", "kit": "true_keeper"}]'::jsonb,
  2) as result;
```

Expected: `status` `started`. The Crew check: `active`, mode `crew`, version 3, `sailed` true, seats `1 A witness, 2 B stranger, 3 bosun informant, 4 cook true_keeper`. Send it again with the new version:

```sql
set local role service_role;
select public.crew_start(
  (select id from public.crews where code = 'K7QF2M'), 'USER_A_ID',
  '[{"seatNo": 3, "npcId": "bosun", "kit": "informant"}, {"seatNo": 4, "npcId": "cook", "kit": "true_keeper"}]'::jsonb,
  3) as result;
```

Expected: `status` `refused`, `reason` `already_started`, and the Crew check is the same.

**C7. A friend with a draft takes a partner's seat with their own kit, and the draft is deleted.** Player C starts a crew of their own (a draft) with the kit `stranger`:

```sql
set local role service_role;
select public.crew_create('USER_C_ID', 'CCCCCC', 'stranger') as result;
```

Expected: `status` `created`. Player C first tries seat 1, which player A holds (the server read version 3):

```sql
set local role service_role;
select public.crew_take_seat((select id from public.crews where code = 'K7QF2M'), 'USER_C_ID', 1, 'stranger', 3) as result;
```

Expected: `status` `refused`, `reason` `changed`. Every refusal comes before the first change, so the draft is still there: the Crew check shows the crew `CCCCCC` with the seat `1 C stranger`. Now player C takes the seat of the Bosun, who carries `informant`:

```sql
set local role service_role;
select public.crew_take_seat((select id from public.crews where code = 'K7QF2M'), 'USER_C_ID', 3, 'stranger', 3) as result;
```

Expected: `status` `joined`, `seatNo` 3 and `replacedPartner` `bosun`. The Crew check shows one row: `K7QF2M`, version 4, seats `1 A witness, 2 B stranger, 3 C stranger, 4 cook true_keeper`. The seat carries C's **own** kit (`stranger`), not the Bosun's (a decision that still waits for Nils). The crew `CCCCCC` is gone: the draft was deleted in the same step, with its seat.

**C8. A player cannot run the functions, the database guards crews and seats, and the read of the routes works.** Player A tries to run a crew function:

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_A_ID", "role": "authenticated"}', true);
select public.crew_create('USER_A_ID', 'DDDDDD', 'witness');
```

Expected: `permission denied for function crew_create`. Now replace the last line and run again. Each one fails the same way:

| Statement as player A | Expected error mentions |
|---|---|
| `select public.crew_find_by_code('USER_A_ID', 'K7QF2M', 10, 600);` | `permission denied for function crew_find_by_code` |
| `select public.crew_take_seat((select id from public.crews where code = 'K7QF2M'), 'USER_A_ID', 2, 'witness', 1);` | `permission denied for function crew_take_seat` |
| `select public.crew_start((select id from public.crews where code = 'K7QF2M'), 'USER_A_ID', '[]'::jsonb, 1);` | `permission denied for function crew_start` |
| `select count(*) from public.crew_join_failures;` | `permission denied for table crew_join_failures` |
| `insert into public.crew_join_failures (player_id) values ('USER_A_ID');` | `permission denied for table crew_join_failures` |

The database also guards crews and seats against the server itself. Put `set local role service_role;` in front of each statement, run it, and read the error. None of them changes anything:

| Statement as `service_role` | Expected error mentions |
|---|---|
| `update public.crew_seats set kit = 'lantern' where crew_id = (select id from public.crews where code = 'K7QF2M') and seat_no = 1;` | `crew_seats_kit_allowed` |
| `insert into public.crews (created_by, mode, code) values ('USER_A_ID', 'solo', 'k7qf2m');` | `crews_code_format` |
| `insert into public.crews (created_by, mode, code) values ('USER_A_ID', 'solo', 'K7QF2M');` | `crews_code_unique` |
| `update public.crew_seats set player_id = 'USER_A_ID' where crew_id = (select id from public.crews where code = 'K7QF2M') and seat_no = 2;` | `crew_seats_one_seat_per_player` |
| `update public.crew_seats set player_id = null, npc_id = 'cook' where crew_id = (select id from public.crews where code = 'K7QF2M') and seat_no = 3;` | `crew_seats_one_seat_per_partner` |

Last, the read that `GET /api/crews/me` makes through Supabase's REST interface. It asks the database to join the crew, its seats and the display name of each player in one request (the join syntax of the REST interface), and it needs the secret key, so **a teammate runs it in their own terminal**, with the values of their private `.env`, and never pastes the key anywhere else. Run it once, now that the crew `K7QF2M` has four seats:

```bash
set -a; . ./.env; set +a
curl -s -g "$SUPABASE_URL/rest/v1/crews?select=id,code,status,mode,version,started_at,crew_seats(seat_no,player_id,npc_id,kit,profiles(display_name))&code=eq.K7QF2M" \
  -H "apikey: $SUPABASE_SECRET_KEY"
```

If your key does not start with `sb_secret_` (an old-style key), also add `-H "Authorization: Bearer $SUPABASE_SECRET_KEY"`, as `backend/server/supabase_admin.py` does.

Expected: a list with one crew, whose `crew_seats` holds four entries. The entries of players A, B and C carry `"profiles": {"display_name": "Captain-..."}`, and the entry of the Cook, an NPC partner, carries `"profiles": null`. If the answer is an error that talks about a relationship instead, the read in `backend/server/crews/store.py` (`CREW_COLUMNS`) has to change, so tell the team. The player-kit read (`entry_profiles?select=kit&...`) needs the migration of package A3: run it the same way with `rest/v1/entry_profiles?select=kit&limit=1` once that migration is applied.

Finally paste the whole crew migration into the SQL editor again and run it. Expected: no error, and the Crew check still shows what it showed after C7.

Delete the three test users when you are done (**Authentication > Users**). Their crews, seats and wrong codes go with them.

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

### Account checks (steps N1 to N6)

These steps test the accounts migration. Run them after the foundation, the Island Exchange and the accounts migrations are all applied. Use **new test users** (create them as in the set-up of this plan, so their names start as placeholders): A and B for N1 to N5, and C and D for N6. Replace `USER_A_ID`, `USER_B_ID`, `USER_C_ID` and `USER_D_ID` with their ids. The placeholder name of a user is `Captain-` and the first 6 characters of the id, which the statements below work out themselves (`'Captain-' || left('USER_A_ID', 6)`). The answers of the functions are JSON, so the order of the keys in your result may differ from the text below. **N6 deletes a user for good: run it on throwaway test users only, never on a real player.**

**N1. A first name is given once.** Both calls ask for a name. The second one is ignored, because the player has a name already:

```sql
set local role service_role;
select public.assign_captain_name('USER_A_ID', 'Captain-' || left('USER_A_ID', 6), 'Brave Puffin 17') as first_call,
       public.assign_captain_name('USER_A_ID', 'Captain-' || left('USER_A_ID', 6), 'Calm Gannet 42') as second_call;
```

Expected: both answers have `status` `named` and `name` `Brave Puffin 17`, with `rerollsUsed` 0. Check the profile (default role): `select display_name from public.profiles where id = 'USER_A_ID';` shows `Brave Puffin 17`. A player who does not exist gets `{"status": "missing"}`:

```sql
set local role service_role;
select public.assign_captain_name('00000000-0000-0000-0000-000000000000', 'Captain-000000', 'Brave Puffin 17');
```

A name that breaks the rules of the profile is refused by the table, and the player keeps the placeholder:

```sql
set local role service_role;
select public.assign_captain_name('USER_B_ID', 'Captain-' || left('USER_B_ID', 6), 'Bad<>Name');
```

Expected: `violates check constraint "profiles_display_name_characters"`.

**N2. One re-roll, and a second one is refused.** Player B has no name yet, so there is nothing to change:

```sql
set local role service_role;
select public.reroll_captain_name('USER_B_ID', 'Captain-' || left('USER_B_ID', 6), 'Wise Otter 55', 'manual-uid-0001') as before_a_name;
```

Expected: `status` `refused`, `reason` `no_name_yet`. Now player A (who got `Brave Puffin 17` in N1) re-rolls. The second call is the same request again, and the third is another request:

```sql
set local role service_role;
select public.reroll_captain_name('USER_A_ID', 'Captain-' || left('USER_A_ID', 6), 'Calm Gannet 42', 'manual-uid-0001') as first_reroll,
       public.reroll_captain_name('USER_A_ID', 'Captain-' || left('USER_A_ID', 6), 'Wise Otter 55', 'manual-uid-0001') as same_request,
       public.reroll_captain_name('USER_A_ID', 'Captain-' || left('USER_A_ID', 6), 'Wise Otter 55', 'manual-uid-0002') as another_request;
```

Expected: `first_reroll` has `status` `named`, `name` `Calm Gannet 42` and `rerollsUsed` 1. `same_request` has `status` `refused`, `reason` `already_applied` and `name` `Calm Gannet 42`. `another_request` has `status` `refused`, `reason` `no_rerolls_left` and `name` `Calm Gannet 42`. Check (default role): `select display_name from public.profiles where id = 'USER_A_ID';` shows `Calm Gannet 42`, and `select count(*) from public.captain_name_rerolls where player_id = 'USER_A_ID';` shows 1.

The server must send a different name. Give player B a name (a new run), and then ask for a re-roll to the very same name (a bug on the server side, so it is an error and not a refusal):

```sql
set local role service_role;
select public.assign_captain_name('USER_B_ID', 'Captain-' || left('USER_B_ID', 6), 'Bold Tern 12');
```

```sql
set local role service_role;
select public.reroll_captain_name('USER_B_ID', 'Captain-' || left('USER_B_ID', 6), 'Bold Tern 12', 'manual-uid-0002');
```

Expected: the first run answers `named`, the second fails with `same_name`. Player B still has no re-roll row: `select count(*) from public.captain_name_rerolls where player_id = 'USER_B_ID';` shows 0.

**N3. A stale save is refused and changes nothing.** A new player's save is at version 1. The first call saves from version 1. The second call also comes from version 1 (a second device that did not know): it is refused. The third call continues from version 2:

```sql
set local role service_role;
select public.save_progress('USER_A_ID', 1, '{"intro": {"scene": "shore"}}') as first_save,
       public.save_progress('USER_A_ID', 1, '{"intro": {"scene": "tower"}}') as stale_save,
       public.save_progress('USER_A_ID', 2, '{"intro": {"scene": "tower"}}') as second_save;
```

Expected: `first_save` has `status` `saved`, `version` 2 and an `updatedAt` time. `stale_save` is `{"status": "stale", "version": 2}`, and the save did not change. `second_save` has `status` `saved` and `version` 3. Check (default role): `select version, data from public.saves where player_id = 'USER_A_ID';` shows version 3 and `{"intro": {"scene": "tower"}}`. A save for a player who has none answers `{"status": "missing"}`:

```sql
set local role service_role;
select public.save_progress('00000000-0000-0000-0000-000000000000', 1, '{}');
```

**N4. A save that is too big, and a call that makes no sense.**

```sql
set local role service_role;
select public.save_progress('USER_A_ID', 3, jsonb_build_object('blob', repeat('x', 250000))) as result;
```

Expected: `{"status": "too_big"}`, and the save is still at version 3. A missing or too small version, or data that is not a JSON object, is a bug on the server side and raises an error. Replace the last line and run again. Each one fails:

| Statement as `service_role` | Expected error mentions |
|---|---|
| `select public.save_progress('USER_A_ID', 0, '{}');` | `bad_save` |
| `select public.save_progress('USER_A_ID', null, '{}');` | `bad_save` |
| `select public.save_progress('USER_A_ID', 3, '[]');` | `bad_save` |
| `select public.save_progress('USER_A_ID', 3, 'null');` | `bad_save` |

**N5. Nobody but the server can run the four functions or write a re-roll.** A signed-in player tries to run a function:

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_A_ID", "role": "authenticated"}', true);
select public.assign_captain_name('USER_A_ID', 'Captain-' || left('USER_A_ID', 6), 'Hacker 99');
```

Expected: `permission denied for function assign_captain_name`. Now replace the last line and run again. Each one fails the same way:

| Statement as player A | Expected error mentions |
|---|---|
| `select public.reroll_captain_name('USER_A_ID', 'Captain-' \|\| left('USER_A_ID', 6), 'Hacker 99', 'manual-uid-0003');` | `permission denied for function reroll_captain_name` |
| `select public.save_progress('USER_A_ID', 3, '{"hacked": true}');` | `permission denied for function save_progress` |
| `select public.delete_player('USER_A_ID');` | `permission denied for function delete_player` |
| `insert into public.captain_name_rerolls (player_id, action_uid) values ('USER_B_ID', 'manual-uid-0004');` | `permission denied for table captain_name_rerolls` |
| `update public.captain_name_rerolls set action_uid = 'manual-uid-0005';` | `permission denied for table captain_name_rerolls` |
| `delete from public.captain_name_rerolls;` | `permission denied for table captain_name_rerolls` |

Change the first line to `set local role anon;` (and drop the `set_config` line) and run any of them: the answer is the same kind of `permission denied`. A player may read their own re-roll row, and only that one:

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_A_ID", "role": "authenticated"}', true);
select player_id, action_uid from public.captain_name_rerolls;
```

Expected: 1 row, player A with `manual-uid-0001`. Even the server cannot edit a re-roll (a re-roll is final):

```sql
set local role service_role;
update public.captain_name_rerolls set action_uid = 'manual-uid-0005';
```

Expected: `permission denied for table captain_name_rerolls`. The same happens for `delete from public.captain_name_rerolls;`.

**N6. Delete a player (throwaway test users C and D only).** This also proves, on Supabase, that the `postgres` role may delete from `auth.users`: `delete_player()` runs with the rights of its owner. Replace `CREW_C_ID` with `33333333-3333-4333-8333-333333333333`, a made-up crew id. Set up: player C gets a name and 100 coins, player D gets 50 coins, and C starts a crew with D in seat 2:

```sql
set local role service_role;
select public.assign_captain_name('USER_C_ID', 'Captain-' || left('USER_C_ID', 6), 'Bold Tern 14') as c_name,
       public.apply_wallet_transaction('USER_C_ID', 100, 'kit_grant', 'kit') as c_balance,
       public.apply_wallet_transaction('USER_D_ID', 50, 'kit_grant', 'kit') as d_balance;
insert into public.crews (id, created_by, mode) values ('CREW_C_ID', 'USER_C_ID', 'crew');
insert into public.crew_seats (crew_id, seat_no, player_id, kit) values
  ('CREW_C_ID', 1, 'USER_C_ID', 'witness'),
  ('CREW_C_ID', 2, 'USER_D_ID', 'stranger');
```

We call the next block the **delete check** and use it again below (default role):

```sql
select
  (select count(*) from auth.users                 where id        = 'USER_C_ID') as login,
  (select count(*) from public.profiles            where id        = 'USER_C_ID') as profile,
  (select count(*) from public.wallets             where player_id = 'USER_C_ID') as wallet,
  (select count(*) from public.wallet_transactions where player_id = 'USER_C_ID') as ledger_rows,
  (select count(*) from public.saves               where player_id = 'USER_C_ID') as save,
  (select count(*) from public.crew_seats          where player_id = 'USER_C_ID') as seats,
  (select created_by::text from public.crews       where id        = 'CREW_C_ID') as crew_started_by;
```

Expected before the delete: `login`, `profile`, `wallet`, `ledger_rows`, `save` and `seats` are all 1, and `crew_started_by` is `USER_C_ID`. Now delete player C:

```sql
set local role service_role;
select public.delete_player('USER_C_ID') as result;
```

Expected: `{"status": "deleted"}`. Run the delete check again: the six counts are all **0** (the ledger row went too), and `crew_started_by` is now `USER_D_ID`: the crew was handed over to the player in the lowest other seat. The seat of C is open again:

```sql
select seat_no, player_id from public.crew_seats where crew_id = 'CREW_C_ID';
```

Expected: 1 row, seat 2 with player D. Player D is untouched: `select balance from public.wallets where player_id = 'USER_D_ID';` shows 50. Deleting again is safe:

```sql
set local role service_role;
select public.delete_player('USER_C_ID') as result;
```

Expected: `{"status": "not_found"}`. If the first call fails with `permission denied for table users`, the owner of the function cannot delete users on this project: tell the team before anyone uses `DELETE /api/me`.

Now record what the delete leaves behind in Supabase Auth's audit log. This is a number to write down, not a pass or fail check (default role):

```sql
select count(*) from auth.audit_log_entries where payload->>'actor_id' = 'USER_C_ID';
```

Write the number in the pull request. 0 means Auth has no audit row that names player C (for example because the project does not write its audit log to the database). More than 0 means the audit log kept entries of the deleted player: the table has no link to `auth.users`, the `payload` of a row can hold the login e-mail address, and the row can hold an IP address. Whether to purge those rows, or to stop Auth writing them to the database, is part of the pending "delete my data" decision (D022). Supabase's platform logs are not in this table and also stay until they expire.

Finally delete user D under **Authentication > Users**. Nobody else sits in the crew, so it goes with D: `select count(*) from public.crews where id = 'CREW_C_ID';` shows 0.

Delete the other test users when you are done. Finally paste the whole accounts migration into the SQL editor again and run it. Expected: no error, and the checks of N1 to N3 show what they showed before (the comment on `saves.version` is set again, and nothing else changes).

### Entry kit checks (steps K1 to K5)

These steps test the entry profiles migration. Run them after the foundation, the Island Exchange, the accounts and the entry profiles migrations are all applied. Use **two new test users**, E and F (create them as in the set-up of this plan, so their wallets are at 0 and the ledger has no `kit_grant` row for them). Replace `USER_E_ID` and `USER_F_ID` with their ids. The long run of `a` characters stands for the SHA-256 of the story file: any 64 characters from 0-9 and a-f will do. The answers of the function are JSON, so the order of the keys in your result may differ from the text below.

**K1. The first grant pays.** Player E finishes Act 1 as a Witness:

```sql
set local role service_role;
select public.grant_entry_kit('USER_E_ID', 'ending_trapped', 'warned', false, 'witness', 'saltreach_harbor', 1000, 11,
                              'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') as first_grant;
```

Expected: `status` `granted`, `paid` 1000, `ending` `ending_trapped`, `decision` `warned`, `readLog` false, `kit` `witness`, `startPlace` `saltreach_harbor` and `kitCoins` 1000. We call the next block the **kit check** and use it again below (default role):

```sql
select w.balance,
       (select count(*) from public.wallet_transactions t where t.player_id = w.player_id) as ledger_rows,
       (select count(*) from public.entry_profiles e where e.player_id = w.player_id) as profiles
from public.wallets w
where w.player_id = 'USER_E_ID';
```

Expected: `balance` 1000, `ledger_rows` 1 and `profiles` 1.

**K2. The second grant pays nothing and returns the first profile.** Player E plays Act 1 again and this time ends as a True Keeper, with another log. The first ending counts:

```sql
set local role service_role;
select public.grant_entry_kit('USER_E_ID', 'ending_rescue', 'warned', true, 'true_keeper', 'lighthouse_isle', 1000, 12,
                              'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb') as second_grant;
```

Expected: `status` `stored`, `paid` 0, and the values of K1, not the values of this call: `ending` `ending_trapped`, `readLog` false, `kit` `witness`, `startPlace` `saltreach_harbor`. Run the kit check again: the same three numbers as in K1.

**K3. The ledger has one kit row, and the ledger itself refuses a second one.**

```sql
select delta, reason, ref, balance_after
from public.wallet_transactions
where player_id = 'USER_E_ID';
```

Expected: 1 row: `delta` 1000, `reason` `kit_grant`, `ref` `kit`, `balance_after` 1000. Paying the kit again by hand fails:

```sql
set local role service_role;
select public.apply_wallet_transaction('USER_E_ID', 1000, 'kit_grant', 'kit');
```

Expected: `duplicate key value violates unique constraint "wallet_transactions_one_row_per_ref"`. That is the last guard: even outside `grant_entry_kit()` the ledger holds each player, reason and ref once.

**K4. Nobody but the server can run the function or write a profile, and a player reads only their own.** A signed-in player tries to run the function:

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_E_ID", "role": "authenticated"}', true);
select public.grant_entry_kit('USER_E_ID', 'ending_trapped', 'warned', false, 'witness', 'saltreach_harbor', 1000, 11,
                              'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
```

Expected: `permission denied for function grant_entry_kit`. Now replace the last statement and run again. The insert fails the same way (`permission denied for table entry_profiles`):

```sql
insert into public.entry_profiles (player_id, ending, decision, read_log, kit, start_place, kit_coins, move_count, story_sha256)
values ('USER_F_ID', 'ending_trapped', 'warned', false, 'witness', 'saltreach_harbor', 1000, 11, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
```

| Statement as player E | Expected error mentions |
|---|---|
| `update public.entry_profiles set kit = 'stranger';` | `permission denied for table entry_profiles` |
| `delete from public.entry_profiles;` | `permission denied for table entry_profiles` |

Change the first line to `set local role anon;` (and drop the `set_config` line) and run any of them, or `select * from public.entry_profiles;`: the answer is the same kind of `permission denied`. A player may read their own profile, and only that one:

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_E_ID", "role": "authenticated"}', true);
select player_id, kit, start_place from public.entry_profiles;
```

Expected: 1 row, player E, `witness`, `saltreach_harbor`. Put `USER_F_ID` in the second line instead: 0 rows. Even the server cannot change a profile (the first ending counts):

```sql
set local role service_role;
update public.entry_profiles set kit = 'stranger';
```

Expected: `permission denied for table entry_profiles`. The same happens for `delete from public.entry_profiles;`.

**K5. A bad kit id is refused, and nothing changes.** Player F tries to get a kit that does not exist:

```sql
set local role service_role;
select public.grant_entry_kit('USER_F_ID', 'ending_trapped', 'warned', false, 'dragon', 'saltreach_harbor', 1000, 11,
                              'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
```

Expected: `violates check constraint "entry_profiles_kit_allowed"`. The whole call was rolled back. Look at player F (default role):

```sql
select w.balance,
       (select count(*) from public.wallet_transactions t where t.player_id = w.player_id) as ledger_rows,
       (select count(*) from public.entry_profiles e where e.player_id = w.player_id) as profiles
from public.wallets w
where w.player_id = 'USER_F_ID';
```

Expected: `balance` 0, `ledger_rows` 0 and `profiles` 0. The other table rules refuse their values the same way. Put `'witness'` back as the kit (the table rules run in the order of their names, so a bad kit id would be reported before anything else), change one other value in the call above and run it again:

| Change this value | Expected error mentions |
|---|---|
| the decision `'warned'` to `'maybe'` | `entry_profiles_decision_allowed` |
| the coins `1000` to `0` (or to `1000001`) | `entry_profiles_kit_coins_range` |
| the move count `11` to `0` (or to `301`) | `entry_profiles_move_count_range` |
| the last value, the hash, to 63 characters | `entry_profiles_story_sha256_format` |

A player who does not exist gets a plain answer and not an error:

```sql
set local role service_role;
select public.grant_entry_kit('00000000-0000-0000-0000-000000000000', 'ending_trapped', 'warned', false, 'witness', 'saltreach_harbor', 1000, 11,
                              'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
```

Expected: `{"status": "missing"}`. Last, a test user that was paid the kit by hand (as step 2 does) still gets a profile, and is not paid twice. Pay player F by hand, then grant:

```sql
set local role service_role;
select public.apply_wallet_transaction('USER_F_ID', 100, 'kit_grant', 'kit') as by_hand,
       public.grant_entry_kit('USER_F_ID', 'ending_trapped', 'warned', false, 'witness', 'saltreach_harbor', 1000, 11,
                              'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa') as grant_result;
```

Expected: `by_hand` is 100, and `grant_result` has `status` `granted` and `paid` 0. Run the kit check for `USER_F_ID`: `balance` 100, `ledger_rows` 1 and `profiles` 1.

Delete the two test users when you are done (**Authentication > Users**): their entry profiles go with them. Finally paste the whole entry profiles migration into the SQL editor again and run it. Expected: no error, and the kit check for player E still shows what it showed in K1.

## Changing the database later

- Never edit a migration that has been applied anywhere. Add a new file named `supabase/migrations/<YYYYMMDDHHMMSS>_<topic>.sql` with a later time stamp.
- A new table needs, in the same file: row-level security switched on, policies, **explicit grants** (our project gives no rights to a new table, so nothing works until you grant them, and you grant only what is really needed), and a comment on the table, every column and every policy. Take every right away first (`revoke all` from `public`, `anon`, `authenticated` and `service_role`), then grant. The browser only reads, so `authenticated` gets `select` at most. If the table has an identity column (`generated always as identity`), also revoke all rights on its counter, as the foundation file does for `wallet_transactions_id_seq`. Copy the style of the foundation file.
- A new function needs `revoke ... from public, anon, authenticated` and then `grant execute` only to the role that must run it. Start it with `set search_path = ''`.
- A new wallet reason is one new migration with one `insert into public.wallet_reasons (reason, direction, description) values (...) on conflict (reason) do nothing;`, plus the same `(reason, direction)` pair added at the **end** of `WALLET_REASONS` in `backend/server/wallet.py`, in the same pull request. Never rename a reason or change its direction, because ledger rows point at it. The test `backend/server/tests/test_wallet_matches_migration.py` reads every migration in order and fails if the two lists differ. Add the reason to the manual test plan (step 15) too.
- Realtime is not switched on for these tables yet. The work package that needs it adds it.
- If something here is unclear, open an issue before changing the rules for money.
