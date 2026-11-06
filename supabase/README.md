# Supabase database

This folder holds the database of The Great Plot Twist. Supabase gives us the login (GitHub sign-in), a Postgres database and realtime. Everything the game must remember lives here: who the players are, their saved progress, their coins and their crews.

Play money only: coins cannot be bought, cashed out or exchanged for real prizes. Every player starts with 0 coins. The first coins come later, from the intro entry kit (the `kit_grant` reason).

The browser only reads from this database. Every write comes from our Python server with the secret key. Live presence (other captains moving, preset emotes, hints for a crew) runs on Supabase Realtime and stores nothing in these tables: its only database part is a small set of access rules, described in [The live presence migration](#the-live-presence-migration).

| File | What it is |
|---|---|
| [migrations/20261106000000_foundation.sql](migrations/20261106000000_foundation.sql) | The first migration: seven tables, the security rules, the rights of each database role and four functions. Every table, column and policy is explained inside the file. |
| [migrations/20261106010000_island_exchange.sql](migrations/20261106010000_island_exchange.sql) | The Island Exchange (package L4): three wallet reasons, three tables and two functions. Run it after the foundation. See [The Island Exchange migration](#the-island-exchange-migration). |
| [migrations/20261106020000_accounts.sql](migrations/20261106020000_accounts.sql) | The accounts (package A2: captain names, cloud progress and "delete my data"): one table and four functions. Run it after the foundation. See [The accounts migration](#the-accounts-migration-package-a2). |
| [migrations/20261106030000_entry_profiles.sql](migrations/20261106030000_entry_profiles.sql) | The referee and the entry kits (package A3): one table and one function. Run it after the foundation, and **before** the code that reads it is merged into `main` (see [Apply before you merge](#apply-before-you-merge)). See [The entry kits migration](#the-entry-kits-migration-package-a3). |
| [migrations/20261106040000_crew_codes.sql](migrations/20261106040000_crew_codes.sql) | Crew codes, the muster and partners (package A6): three new columns of `crews`, new rules for `crew_seats`, one table and four functions. Run it after the foundation. See [Crew codes, the muster and partners](#crew-codes-the-muster-and-partners-migration-20261106040000-package-a6). |
| [migrations/20261106050000_live_presence.sql](migrations/20261106050000_live_presence.sql) | Live presence (package A4): one helper function and five access rules for Supabase Realtime (policies on `realtime.messages`). No table. Run it after the foundation. It goes live with group 2; the flag `live_presence` stays off until the checks L1 to L7 have passed. See [The live presence migration](#the-live-presence-migration). |
| [migrations/20261106070000_home_islet.sql](migrations/20261106070000_home_islet.sql) | The home islet (package L2): two tables and one function. Run it after the foundation. It needs nothing from the other migrations, but apply the files in time-stamp order. See [The home islet migration](#the-home-islet-migration). |
| [migrations/20261106090000_exchange_leverage.sql](migrations/20261106090000_exchange_leverage.sql) | The third migration, for the Island Exchange version 2 (real prices, 10x positions): two wallet reasons, two tables and three functions, and it removes what the second one added (except the reasons). Run it after the second. See [The Island Exchange migration](#the-island-exchange-migration). |
| [migrations/20261106100000_prediction_desk.sql](migrations/20261106100000_prediction_desk.sql) | The migration for the prediction desk (package L5): two wallet reasons, two tables, one view, one trigger and two functions. Run it after the others (it needs only the first). See [The prediction desk migration](#the-prediction-desk-migration). |
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
| Realtime > Settings > "Allow public access" | **Off** (Nils switched it off on 6 Nov 2026) | Every Realtime room must be private, so that the access rules of [the live presence migration](#the-live-presence-migration) decide who may join. While it is on, anyone who holds the public key can use public rooms that our rules never cover, and spend the shared Realtime budget. Like any change on that screen, switching it off disconnects every client; today no client uses Realtime, so nobody notices. |

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
- If a player is deleted, their seat row is deleted with them, and the seat is empty again: a friend who joins fills an empty seat first. If the player who created a crew is deleted in the dashboard (or their `profiles` row is deleted), the whole crew and all its seats are deleted. `DELETE /api/me` first hands a crew that other players sit in to the player in the lowest other seat (`delete_player()`, see [The accounts migration](#the-accounts-migration-package-a2)), so only a crew nobody else sits in goes with the player.
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

Which seat a friend takes and which kit each NPC partner carries is decided by the server (`backend/server/crews/seats.py`). The database does not repeat those two rules. Two of the choices there waited for Nils: the kit a seat carries after a friend takes over a partner (built: the friend's own kit), and the order in which partners fill the missing kits (built: informant, stranger, true_keeper, witness). Nils decided both in the story round, as built (D018, decisions 10 and 12; decision 12 is a team call, confirmed at kickoff).

It adds one table (`crew_join_failures`, with row-level security and no policy and no grant for players), and no policy and no wallet reason: see the totals under [Three quick checks after applying](#three-quick-checks-after-applying). Run the crew checks (steps C1 to C8) after step 17 of the manual test plan.

## The Island Exchange migration

`migrations/20261106090000_exchange_leverage.sql` is the database part of the Island Exchange, version 2: real company prices and 10x positions (see [INTERFACES.md, section 2](../docs/INTERFACES.md#the-island-exchange-package-l4), the spec [specs/L4-exchange-v2.md](../specs/L4-exchange-v2.md) and decision [D017](../docs/DECISIONS.md)). Every investment is a **position**: a stake of coins at 10x, rising or falling. If the price moves 10 % against a position, the stake is used up and the position closes by itself at zero. Run it **after** the first two migrations, because it uses the wallet and the profiles from the first and the fee reason `market_fee` from the second. It is safe to run twice. Everything is explained in the file itself.

**It removes the first version of the Exchange.** That version (`market_bases`, `market_positions`, `market_trades`, `market_trade()` and `market_set_base()`) was merged but its file was never applied, so its tables hold no real data. The third migration starts with a **guard**: if the old table `market_trades` holds any row, the file stops with `v1_market_data_present` before it changes anything, and a person decides. Otherwise it drops the old functions and tables. The new tables have new names (`exchange_...`), so dropping an old name can never touch new data, even when the file runs twice. The wallet reasons `market_buy` and `market_sell` stay in the list, unused.

| Name | What it is | Who changes it |
|---|---|---|
| `exchange_positions` | One row per position: the company, the side (`rising` or `falling`), the price mode (`live` or `replay`), the stake, the entry price, the zero point (worked out by the database: 90 % of the entry price for a rising position, 110 % for a falling one), the opening fee and, once it is closed, the closing price, value, fee and ref. `status` is `open`, `closed` (the player closed it) or `zeroed` (the stake was used up). A zeroed position has a value and a fee of 0. Rows are never deleted, except together with their player. | Only `exchange_open_position()`, `exchange_close_position()` and `exchange_close_used_up()`. |
| `exchange_events` | The history: one row for every opening (`open`), closing by the player (`close`) and close at zero (`zero`), never edited. The ref can be used once per player, so a repeated click can never act twice. | Only the three functions. |

An opening writes two ledger rows with the same ref (`market:open:` plus the id the browser made for the click): `market_stake` and `market_fee`. A closing by the player writes `market_payout` (if the value is above 0) and `market_fee` (if the closing fee is above 0), with the ref `market:close:` plus the id of that click. A close at zero moves **0 coins** and the wallet refuses an amount of 0, so it writes no ledger row at all, only an event with the ref `market:zero:` plus the position id. The ledger accepts each player, reason and ref once, so the same ref is fine for two different reasons.

**Nobody can be left below zero.** The stake and the opening fee leave the wallet in the same transaction that creates the position, through `apply_wallet_transaction()`, which refuses a balance below 0. From then on a position can only *pay* coins into a wallet, never take them out: the value is never negative, and the closing fee is never more than the value. So the most a player can lose on one position is the stake plus the opening fee, however late the automatic close runs, and a gap past the zero point is still worth 0.

The price rules (where the prices come from, when a stock market is open, what a company shows) are **Python** (`backend/server/market/`). The database stores the positions and enforces what depends on a player's earlier actions, because only the database can see two requests at the same moment: the stake range, the daily cap and the open-position limit are passed to `exchange_open_position()` as arguments, so the numbers live in one place (`backend/server/market/positions.py`).

**The database also checks the arithmetic, so it stays right even if the Python has a bug.** The price itself is an input from the server, like the amount of a wallet change. But everything that follows from the price, the database recomputes:

- `exchange_open_position()` refuses (`bad_trade`, nothing changed) a missing argument, an unknown side or price mode, a price that is not above 0 or has more than 8 decimals, a leverage other than 10, a stake outside `p_min_stake` to `p_max_stake`, a fee rate other than 100 or 200 basis points, a fee that is not the fee rate of the stake rounded **up**, and a start of the game day more than a minute in the future (the daily cap would then count no stakes at all).
- `exchange_close_position()` works out the value itself: stake x (entry + 10 x move) / entry for a rising position and stake x (entry - 10 x move) / entry for a falling one, with move = price - entry. It multiplies first and takes the whole-number part once, at the very end (`div()`), so it always agrees with Python's `Decimal //`. The value never passes 1,000,000. If the top part is 0 or less, the stake is used up and the value is 0. The closing fee is the fee rate of the stake, rounded up, but never more than the value. If the value or the fee the server sent differ, it refuses with `bad_trade`.
- `exchange_close_used_up()` refuses (`bad_sweep`) a list that is not an array, an element with other keys than the four known ones, a price that is not above 0 with at most 8 decimals, a quote time that is not a real moment, a mode other than `live` or `replay`, or the same company and mode twice.

**Price modes.** A position opened on live prices is stored with `price_mode = 'live'`, one opened on the recorded demo day with `'replay'`. `exchange_close_position()` and `exchange_close_used_up()` only use prices of the position's own mode, so mixing the two on one database can never pay out at a recorded price.

After the full group 3 chain through `20261106110000`, the database has **18 tables**, **one view**, **16 public policies**, **5 Realtime policies**, **16 authenticated SELECT grant rows**, **17 wallet reasons** and **24 public functions**. All 18 tables have RLS. The view is `prediction_pool_sides`; it is not counted as a table.

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

## The live presence migration

`migrations/20261106050000_live_presence.sql` is the database part of live presence (package A4; see [INTERFACES.md, section 7](../docs/INTERFACES.md#7-realtime-budget) and decision [D023](../docs/DECISIONS.md)): players see each other's captains move, send preset emotes, and the server tells a crew the moment something changed. All of that runs on Supabase Realtime, which keeps no table of ours. The only database part is the rules that say who may join which room ("private rooms"), written as policies on the Realtime table `realtime.messages`. Run the file **after** the foundation migration, because it uses `is_crew_member()`. It is safe to run twice, and everything is explained in the file itself. It grants nothing on `realtime.messages`: Supabase sets the rights of that table (step L2 below checks them).

| Name | What it is | Who changes it |
|---|---|---|
| `live_crew_id()` | Reads the crew id out of the topic of a crew room (`live:crew:` and a lowercase uuid). Gives null for any other text and never raises an error, so a malformed topic is refused instead of crashing a policy. | Nobody at run time. Signed-in players run it inside the policies. |
| Five policies on `realtime.messages` | Who may join and send in the three kinds of room, below. All are `to authenticated`. | Only a new migration. |

| Policy | Allows | In which room |
|---|---|---|
| "Live: players can see who is online" (select) | looking at presence | `live:world` |
| "Live: players can say where they are" (insert) | tracking presence | `live:world` |
| "Live: players can watch a place room" (select) | listening to broadcasts | `live:place:<place id>:<room 1 to 99>` |
| "Live: players can move in a place room" (insert) | sending broadcasts | the same place rooms |
| "Live: crew members can hear their crew room" (select) | listening to broadcasts, only while the player holds a seat in that crew (`is_crew_member`) | `live:crew:<crew id>` |

There is no insert policy for crew rooms (only the server sends there, and its secret key skips row-level security), no policy for `anon` and no policy for any other topic. Without a policy there is no access.

Three things to know:

- **The dashboard switch comes first.** The policies decide only for private rooms. Until "Allow public access" is switched off (see the project settings above), anyone who holds the public key can use public rooms that no policy covers. That gap closed on 6 Nov 2026, when Nils switched it off, before this file was applied.
- **The flag is not the lock.** The flag `live_presence` switches on our browser module and the server helper. A modified browser ignores it, so the policies and the dashboard are the real lock. Until this file is applied, Realtime refuses every private room, so the code stays harmless. The file goes live with group 2, and the flag stays off until the checks L1 to L7 have passed.
- **Positions, presence and emotes are only for showing** (D003). Realtime keeps no client message in a table, and no rule of the game depends on what a browser claims. A forged or flooding client can:

| It can | It cannot |
|---|---|
| Join `live:world` and see which place and room every online captain is in (players see this in the game anyway, and names are public to signed-in players). | Join anything without signing in, or join or listen to another crew's room. |
| Track a fake place, room or kit for itself, join any place room, claim any position, or claim another player's id (the worst result is a misplaced captain that shows another player's server-written name). | Send anything into a crew room, so it cannot fake an event of the server. A refused write is dropped silently. |
| Flood messages. Each delivered copy counts toward the project's limits, and Supabase may close every player's rooms. The API and the game keep working; only live presence stops. | Use presence in a place room, or broadcast in the world room. Change any game state. Show free text to others, or read anyone's GitHub login or e-mail address (no payload holds them). |

The kill switch, if a flood ever happens, is in [Changing the database later](#changing-the-database-later). The manual checks are the steps L1 to L7 at the end of the manual test plan; L7 (the server's helper) must pass once before any package polls less because of crew events.

## The home islet migration

`migrations/20261106070000_home_islet.sql` is the database part of the home islet: every player's own islet, with the timber they hold and the buildings that stand on it (see [INTERFACES.md, section 2](../docs/INTERFACES.md#your-home-islet-package-l2) and decision [D021](../docs/DECISIONS.md)). Run it **after** the foundation migration, because it uses the profiles, the wallets, `apply_wallet_transaction()` and `touch_updated_at()` from there. It needs nothing from the other migrations, but apply the files oldest time stamp first, as always. It is safe to run twice. It adds **no wallet reason**: a building is paid with `building_purchase`, which the foundation migration already has. Everything is explained in the file itself.

| Name | What it is | Who changes it |
|---|---|---|
| `islets` | One row per player who has built something: the timber the player holds, never below 0. The first build makes the row, and it starts with the **starter pack** of timber (20 today, from `backend/content/buildings.json`). The primary key is the player, so the pack arrives once. Timber is not coins, so it has no ledger. | Only the server, through `islet_build()`. |
| `islet_buildings` | One row per building that stands on a player's islet. The primary key is the player and the plot, so a plot holds one building. A check rule keeps each plot and its kind of building together (`plot_2` workshop, `plot_3` windmill, `plot_4` greenhouse, `islet_signal_station` signal_station). The cabin on `plot_1` stands from the start and has no row. The ref (`islet:` plus the id the browser made for the click) can be used once per player. `coins_paid` and `timber_paid` record what was paid: timber has no ledger, so that row is its only record. | Only the server, through `islet_build()`. |
| `islet_build()` | The only way a building goes up. In one step: check the arguments, lock the player's wallet, refuse a repeated ref, make the islet row with the starter pack if there is none and lock it, refuse a plot that holds a building, refuse a build when the player holds too little timber, take the coins with `apply_wallet_transaction()` (reason `building_purchase`), take the timber and write the building (level 1). It *returns* a refusal such as `{"status": "refused", "reason": "plot_occupied", "standing": "signal_station"}` with nothing charged, and *raises* `insufficient_funds` (from the wallet), a repeated ref (code `23505`, message `already_applied`), `bad_build` when the server sent an argument that makes no sense, or a check error when a plot and its building do not belong together. | Run by the server only. |
| `exchange_open_position()` | Opens a position. In one step: check that the arguments add up (see below), lock the player's wallet, refuse a repeated ref, refuse more than 20 open positions or more than 2000 coins of new stakes per game day, move the coins with `apply_wallet_transaction()` (`market_stake` and `market_fee`), write the position with its zero point, write the history row. It *returns* a refusal such as `{"status": "refused", "reason": "daily_cap", "coinsLeft": 380}` with nothing changed, and *raises* `insufficient_funds` (from the wallet), a repeated ref (code `23505`, message `already_applied`), `wallet_not_found`, or `bad_trade` when the server sent numbers that do not add up (a bug on the server side, not something a player can cause). | Run by the server only. |
| `exchange_close_position()` | Closes one position of a player. In one step: check the arguments, lock the wallet, refuse a repeated ref, lock the position by its id **and** its player, refuse a position that is not open or was opened on another price mode, work out the value and the closing fee itself, compare them with the numbers the server sent (`bad_trade` if they differ), pay the value (`market_payout`, only if above 0) and then take the fee (`market_fee`, only if above 0), mark the position closed (or zeroed, if the stake was used up) and write the history row. | Run by the server only. |
| `exchange_close_used_up()` | The automatic close. Takes a JSON array of prices (`company_id`, `price` as text, `quoted_at`, `mode`) and closes, in **one statement**, every open position of that company and price mode whose zero point a price has reached, if the position was opened **before** the price was quoted. At zero: no coins move, so it uses no wallet, and it writes one `zero` history row per position. Positions that another call is closing right now are skipped (`skip locked`), so two calls never wait for each other, never deadlock and never close one position twice. | Run by the server only. |
| `exchange_open_position()` | no access | no access | yes |
| `exchange_close_position()` | no access | no access | yes |
| `exchange_close_used_up()` | no access | no access | yes |
| `prediction_place_stake()` | The only way a stake happens. In one step: check the arguments, make sure the pool row exists and **lock it**, lock the player's wallet, refuse a repeated stake id (code `23505`, message `already_applied`), refuse a settled pool or one past its closing time (the earlier of the stored and the given closing time counts), refuse a second stake on the question, refuse a stake over the daily cap, take the coins with `apply_wallet_transaction()` (`prediction_stake`) and write the stake. It *returns* a refusal such as `{"status": "refused", "reason": "daily_cap", "coinsLeft": 30}` with nothing changed, and *raises* `insufficient_funds` (from the wallet), a repeated stake id, or `bad_stake` / `wallet_not_found` (a bug on the server side). | Run by the server only. |
| `prediction_settle_pool()` | The only way a pool is settled. In one step: check the arguments, make sure the pool row exists and **lock it**, refuse a pool that is settled already (`23505`, `already_applied`), refuse yes or no before the pool has closed (void works at any time), read the pool from its stakes, decide how it ends (`refund_void`, `refund_no_winners`, `refund_one_sided` or `winners`), check the payouts, pay everybody with `apply_wallet_transaction()` (`prediction_payout`, ref `pool:<questionId>`) in player-id order, write the payout of every stake and mark the pool settled. It *returns* a refusal (`pool_open` or `stakes_changed`) with nothing changed, and *raises* `bad_settlement` when the arguments or the payouts do not add up. | Run by the server only. |
| `prediction_place_stake()` | no access | no access | yes |
| `prediction_settle_pool()` | no access | no access | yes |
| `duel_create()` | Sends a challenge. In one step: check the arguments, lock the challenger's wallet, refuse a repeated `create_uid` (code `23505`, message `already_applied`), find a named captain (any letter case) and refuse a name nobody has, a name several captains share and the challenger's own name, refuse a fourth waiting challenge, insert the duel and the challenger's envelope, and hold the stake (`arena_stake`). | Run by the server only. |
| `duel_answer()` | Answers a challenge. The answer IS the acceptance. In one step: lock the duel row, refuse a caller who sealed in this duel already (`23505`), check the state (`duel_taken`, `duel_closed`, `duel_expired` by the database clock), check the numbers, lock both wallets in player-id order, refuse the pair limit (`daily_pair_limit`), take the answerer's stake, store their envelope, finish the duel and pay out (`arena_payout`). **The round results and the outcome are an input from Python** (`rules.resolve`), like the price of a trade: the database never reads the challenger's envelope, but it checks that the results fit the rounds and that the outcome fits the counted points. | Run by the server only. |
| `duel_void()` | Withdraws (the challenger), declines (the named captain) or expires (anyone, but only after `expires_at` by the database clock) a challenge, and gives the challenger's stake back (`arena_payout`). The same captain closing it the same way twice raises `23505`. | Run by the server only. |
| `duel_create()` | no access | no access | yes |
| `duel_answer()` | no access | no access | yes |
| `duel_void()` | no access | no access | yes |

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
5. Do the same with `migrations/20261106010000_island_exchange.sql` (the Island Exchange), in a new query. The files start with a time stamp, so apply them oldest first. Steps 5 to 10 each need only the foundation (step 3), not each other, so step 5 can wait until the Exchange goes live (see [Apply before you merge](#apply-before-you-merge) for what that means for the Supabase CLI).
6. Do the same with `migrations/20261106020000_accounts.sql` (captain names, cloud progress, delete my data), in a new query.
7. Do the same with `migrations/20261106030000_entry_profiles.sql` (the referee and the entry kits), in a new query. Do this **before** the branch that reads `GET /api/me` is merged into `main`, and before you test a preview of it.
8. Do the same with `migrations/20261106040000_crew_codes.sql` (crew codes, the muster and partners), in a new query.
9. Do the same with `migrations/20261106050000_live_presence.sql` (live presence), in a new query. Until it is applied, Realtime refuses every private room.
10. Do the same with `migrations/20261106070000_home_islet.sql` (the home islet), in a new query. It needs only the foundation, but its time stamp is later than the other new files, so apply it after them if they are there.

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
- `supabase db push` applies every migration that is not applied yet, in order, the live presence file too.
- Optional, needs Docker: `supabase start` runs a local copy and `supabase db reset` rebuilds it from the migration files.

### Apply before you merge

Every push to `main` deploys to production at once, and previews use the same Supabase project. So a migration has to be applied **before** the code that needs it reaches `main`, or a preview you want to test. Applying a migration first is safe when it only adds things, as every new file so far does (the accounts file also re-words the comment on one column, and the live presence file adds its policies to Supabase's own table `realtime.messages`): the code that is live does not use the new tables and functions, and each file is safe to run twice. (A migration that changes or removes something the live code uses is a different case and needs its own plan.)

**Applied: group 1.** Its three files, `20261106020000_accounts.sql`, `20261106030000_entry_profiles.sql` and `20261106040000_crew_codes.sql`, are applied to the live project, together with the older `20261106010000_island_exchange.sql`, before group 1 reached `main` on 6 Nov 2026. Each was checked against its file and recorded under its own version. `20261106030000_entry_profiles.sql` mattered most, because `GET /api/me` was already live and group 1 makes it read `entry_profiles`: without the table every player would have got `502 database_error` there. The accounts and crew files mattered less, because only new routes use them, so they went in the same sitting. Group 1 followed this order: apply the files, check them, and only then merge into `main`.

**Next: group 2.** `20261106050000_live_presence.sql` and then `20261106070000_home_islet.sql` are applied by the controller before group 2 is pushed to `main`. Neither changes what live code reads. The live presence file adds one helper and five policies, and the flag `live_presence` stays off. The home islet file adds two tables and one function that only the new islet routes use; until it is applied they answer `502 database_error`. The order for group 3 (`20261106090000`, `20261106100000` and `20261106110000`) comes with group 3.

A rule that holds for every later migration: when a route that is live today starts to read a new table, apply the migration first. When only new routes or a switched-off feature (a flag that is off) use it, the migration may follow the merge. The Island Exchange was safe to merge first for that reason.

With the Supabase CLI (Option B), the CLI records which files it applied. If you apply `20261106020000` and `20261106030000` while the older `20261106010000_island_exchange.sql` is still unapplied, a later `supabase db push` refuses the older file until you add `--include-all`.

### Three quick checks after applying

Run all three in the SQL editor. After the live presence migration, run the fourth one too.

```sql
select relname as table_name, relrowsecurity as rls_on
from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r'
order by relname;
```

Expected after group 3: 18 table rows, all with `rls_on = true`. The view `prediction_pool_sides` is not a table row.

```sql
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Expected after group 3: 16 public policies, all SELECT. `crew_join_failures` and `duel_moves` have no player policy. The five Realtime policies are checked separately below.

```sql
select grantee, table_name, string_agg(privilege_type, ', ' order by privilege_type) as rights
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
group by grantee, table_name
order by grantee, table_name;
```

Expected after group 3: no anon row; 16 authenticated rows, all SELECT. The view, `crew_join_failures` and `duel_moves` add no player grant row.

The totals after each file in timestamp order. Exchange v2 removes the three v1 tables and adds two replacements, so its net table change is minus one. The last column is `select count(*) from public.wallet_reasons;`.

| After applying | Tables (check 1) | Policies (check 2) | Rows for `authenticated` (check 3) | Policies on `realtime.messages` (check 4) | Wallet reasons |
|---|---|---|---|---|---|
| `20261106000000_foundation.sql` | 7 | 7 | 7 | 0 | 8 |
| `20261106010000_island_exchange.sql` | 10 | 10 | 10 | 0 | 11 |
| `20261106020000_accounts.sql` | 11 | 11 | 11 | 0 | 11 |
| `20261106030000_entry_profiles.sql` | 12 | 12 | 12 | 0 | 11 |
| `20261106040000_crew_codes.sql` | 13 | 12 | 12 | 0 | 11 |
| `20261106050000_live_presence.sql` | 13 | 12 | 12 | 5 | 11 |
| `20261106070000_home_islet.sql` | 15 | 14 | 14 | 5 | 11 |
| `20261106090000_exchange_leverage.sql` | 14 | 13 | 13 | 5 | 13 |
| `20261106100000_prediction_desk.sql` | 16 | 15 | 15 | 5 | 15 |
| `20261106110000_lantern_duels.sql` | 18 | 16 | 16 | 5 | 17 |

With every file up to `20261106070000` applied, the database also holds 17 functions of ours (Supabase's own `rls_auto_enable()` not counted), 3 sequences and 4 triggers on our tables, as the migration review counted them on a scratch copy of the chain.

```sql
select policyname, cmd, roles
from pg_policies
where schemaname = 'realtime' and tablename = 'messages'
order by policyname;
```

Expected, after the live presence migration: exactly 5 rows, the five policies in the table above, and `roles` is `{authenticated}` in every row. Any other policy on `realtime.messages` is a policy somebody added by hand: read it, because a rule such as `using (true)` would open every room.

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
| `captain_name_rerolls` | read | no access | own row | yes |
| `captain_name_rerolls` | insert | no access | no access | yes [3] (through `reroll_captain_name()`) |
| `captain_name_rerolls` | update | no access | no access | no access (a re-roll is final) |
| `captain_name_rerolls` | delete | no access | no access | no access (goes with its player, by cascade) |
| `entry_profiles` | read | no access | own row | yes |
| `entry_profiles` | insert | no access | no access | yes [3] (through `grant_entry_kit()`) |
| `entry_profiles` | update | no access | no access | no access (the first ending counts) |
| `entry_profiles` | delete | no access | no access | no access (goes with its player, by cascade) |
| `islets` | read | no access | own row | yes |
| `islets` | insert | no access | no access | yes [6] (through `islet_build()`) |
| `islets` | update | no access | no access | yes [6] (through `islet_build()`) |
| `islets` | delete | no access | no access | no access (an islet is deleted only with its player, by cascade) |
| `islet_buildings` | read | no access | own rows | yes |
| `islet_buildings` | insert | no access | no access | yes [6] (through `islet_build()`) |
| `islet_buildings` | update | no access | no access | no access (a building is never changed in this version) |
| `islet_buildings` | delete | no access | no access | no access (deleted with its player, by cascade) |

| `exchange_positions` | One row per position: the company, the side (`rising` or `falling`), the price mode (`live` or `replay`), the stake, the entry price, the zero point (worked out by the database: 90 % of the entry price for a rising position, 110 % for a falling one), the opening fee and, once it is closed, the closing price, value, fee and ref. `status` is `open`, `closed` (the player closed it) or `zeroed` (the stake was used up). A zeroed position has a value and a fee of 0. Rows are never deleted, except together with their player. | Only `exchange_open_position()`, `exchange_close_position()` and `exchange_close_used_up()`. |
| `exchange_events` | The history: one row for every opening (`open`), closing by the player (`close`) and close at zero (`zero`), never edited. The ref can be used once per player, so a repeated click can never act twice. | Only the three functions. |
| `exchange_positions` | read | no access | own rows | yes |
| `exchange_positions` | insert | no access | no access | yes [2] (through `exchange_open_position()`) |
| `exchange_positions` | update | no access | no access | yes [2] (through `exchange_close_position()` and `exchange_close_used_up()`) |
| `exchange_positions` | delete | no access | no access | no access (rows go only with their player, by cascade) |
| `exchange_events` | read | no access | own rows | yes |
| `exchange_events` | insert | no access | no access | yes [2] (through the three functions) |
| `exchange_events` | update, delete | no access | no access | no access (the history is append-only: rows disappear only when their player is deleted, by cascade) |
| `prediction_pools` | One row per question: when staking closes (`closes_at`), and how the pool ended once it was settled (`status`, `outcome`, `settlement`, `settled_by`, `settled_at`, `cut_coins`, `paid_coins`). Created by the first stake or by the settlement, never deleted. It holds no running totals: they come from the stakes. | Only the server, through `prediction_place_stake()` (creates the row) and `prediction_settle_pool()` (settles it). |
| `prediction_stakes` | One row per stake: the player, the side (`yes` or `no`), the coins, the `stake_id` the browser made for the click and the ledger `ref` (`stake:` plus that id). A player has one stake per question, and can use a `stake_id` once. `payout` is written when the pool is settled. | Only `prediction_place_stake()` adds a row; only `prediction_settle_pool()` writes `payout`. |
| `prediction_pool_sides` | A view: the coins and the players on each side of each pool, added up from the stakes. It uses the rights of whoever reads it (`security_invoker`). | Nobody writes it. Only the server reads it. |
| `prediction_pools` | read | no access | all rows | yes |
| `prediction_pools` | insert | no access | no access | yes [7] (through `prediction_place_stake()` and `prediction_settle_pool()`) |
| `prediction_pools` | update | no access | no access | yes [7] (seven columns only, through `prediction_settle_pool()`; not `closes_at`, not `question_id`; and never a settled pool: a trigger refuses it with `pool_settled`) |
| `prediction_pools` | delete | no access | no access | no access (a pool is never deleted) |
| `prediction_stakes` | read | no access | own rows | yes |
| `prediction_stakes` | insert | no access | no access | yes [7] (through `prediction_place_stake()`) |
| `prediction_stakes` | update | no access | no access | yes [7] (the column `payout` only, through `prediction_settle_pool()`; not the player, the side or the amount) |
| `prediction_stakes` | delete | no access | no access | no access (rows disappear only when their player is deleted, by cascade) |

| `duels` | One row per challenge: who, the number of rounds, the stake, the status (`open`, then once `finished`, `withdrawn`, `declined` or `expired`) and, once decided, the result of every round. It never holds a signal. `create_uid` (the `actionUid` of the click) is unique per challenger, so a repeated click cannot send two challenges. | Only the server, through `duel_create()`, `duel_answer()` and `duel_void()`. |
| `duel_moves` | The sealed envelopes: one row per captain and round, holding a signal. The only table with a signal, so it is locked tighter than any other: players have no right on it at all (not even for their own rows), the server may only read and insert, and no role may update or delete a row. | Only `duel_create()` and `duel_answer()`. |
| `duels` | read | no access | the duels they take part in (as challenger or opponent) | yes |
| `duels` | insert | no access | no access | yes [8] (through `duel_create()`) |
| `duels` | update | no access | no access | yes [8] (through `duel_answer()` and `duel_void()`) |
| `duels` | delete | no access | no access | no access (a duel goes only by cascade, when a challenger is deleted) |
| `duel_moves` | read | no access | **no access, not even their own** | yes |
| `duel_moves` | insert | no access | no access | yes [8] (through `duel_create()` and `duel_answer()`) |
| `duel_moves` | update | no access | no access | **no access**: sealed means sealed |
| `duel_moves` | delete | no access | no access | **no access**: rows go only by cascade, with their duel or their captain |


[1] The database lets the server update `wallets` and add ledger rows directly, because `apply_wallet_transaction()` runs with the server's rights and needs both. Our rule is that the server does this only through that function. A direct update skips the ledger row, so the balance no longer matches the ledger. Reading a balance in Python and then writing a new one can lose coins when two requests arrive together. The function cannot. A direct ledger insert would also skip the direction check, because that check lives in the function (a table rule cannot look into `wallet_reasons`). The foreign key still refuses an unknown reason, and the table still refuses a missing or blank `ref`.

[2] Exchange functions run with server rights. Only those functions may update positions or append events; the Python code never writes these rows directly.

[3] The same holds for the two insert rows of the account and entry kit tables: the database lets the server add a row to `captain_name_rerolls` and to `entry_profiles` directly, because `reroll_captain_name()` and `grant_entry_kit()` run with the rights of their caller. "Through `reroll_captain_name()`" and "through `grant_entry_kit()`" are our rule, not something the database enforces. A direct insert into `captain_name_rerolls` would use up a player's one re-roll without changing their name. A direct insert into `entry_profiles` would store a profile without paying the kit coins, and without the lock that makes two requests of one player run one after the other. The code never writes these tables directly.

[4] `delete_player()` is `SECURITY DEFINER`, because it deletes the login in `auth.users`, and that needs the rights of the function owner. It is safe because only `service_role` may run it and the server passes the id of the verified player. It hands every crew the player started to the player in the lowest other seat before it deletes the login.

[5] `crews` and `crew_seats`: the server writes them through the four crew functions (`crew_create()`, `crew_find_by_code()`, `crew_take_seat()` and `crew_start()`), a team rule as with the wallet. The database lets the server write the two tables directly, because the functions run with the rights of the server. A direct write would skip the locks, the version check and the rule that a player sits in at most one open crew. The code never writes these tables directly.

[6] The database lets the server add `islets` and `islet_buildings` rows and change `islets` rows directly, because `islet_build()` runs with the rights of the server. "Through `islet_build()`" in the table is our rule, not something the database enforces (the same pattern as `wallets` and the Exchange tables above). A direct write would skip the checks of `islet_build()`: the wallet, the timber, the one building per plot and the repeat check. Only the server holds that right, and the code never writes these tables directly. The server cannot edit or delete a building at all, and that is a lock: a signal station, once built, stays, and the finale counts on it.

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
| `live_crew_id()` | no access | yes, a text helper that reads no table | no access, the server skips RLS and does not need it |
| `handle_new_user()` | no access | no access | no access, only the sign-up trigger runs it |
| `touch_updated_at()` | no access | no access | no access, only the triggers run it |
| `wallet_transactions_id_seq` (the ledger's id counter) | no access | no access | no access, the table's own inserts do not need a right on it |
| `islet_build()` | no access | no access | yes |
| `assign_captain_name()` | no access | no access | yes |
| `reroll_captain_name()` | no access | no access | yes |
| `save_progress()` | no access | no access | yes |
| `delete_player()` [4] | no access | no access | yes |
| `grant_entry_kit()` | no access | no access | yes |

"No access" means the database refuses with `permission denied`, or (for a row that belongs to someone else) shows or changes nothing.

### The live rooms (Realtime, `realtime.messages`)

The live presence migration adds no table. Its rules are policies on the Realtime table `realtime.messages`, and they work per room (topic) and per kind of traffic. They apply to private rooms, so "Allow public access" must be off (see the project settings above).

| Room (topic) | Action | Visitor (`anon`) | Signed-in player (`authenticated`) | Server (`service_role`) |
|---|---|---|---|---|
| `live:world` | look at presence | no access | yes | yes [7] |
| `live:world` | track presence (say where you are) | no access | yes | not needed |
| `live:world` | broadcast (listen or send) | no access | no access | yes [7] |
| `live:place:<place id>:<room 1 to 99>` | listen to broadcasts | no access | yes | yes [7] |
| `live:place:<place id>:<room 1 to 99>` | send broadcasts | no access | yes | yes [7] |
| `live:place:<place id>:<room 1 to 99>` | presence | no access | no access | yes [7] |
| `live:crew:<crew id>` | listen to broadcasts | no access | only if they hold a seat in that crew (`is_crew_member`) | yes [7] |
| `live:crew:<crew id>` | send broadcasts | no access | no access | yes [7] (the only sender: REST, secret key) |
| `live:crew:<crew id>` | presence | no access | no access | yes [7] |
| any other topic | everything | no access | no access | yes [7] |

[7] The server's secret key skips row-level security, so the policies do not limit it. Our rule is that the server only sends crew events (`backend/server/crew_broadcast.py`) and never joins a room. The rights on the table `realtime.messages` itself (the grants) are set by Supabase and not by us; step L2 of the manual test plan reads them.

Supabase's security advisor may warn that a signed-in player can run a `SECURITY DEFINER` function. That is `is_crew_member()`, and it is on purpose. It takes a crew id, compares it with the caller's own id (`auth.uid()`), and returns only true or false. It cannot tell anyone who sits in somebody else's crew.

| `exchange_positions` | insert | no access | no access | yes \*\* (through `exchange_open_position()`) |

| `exchange_positions` | update | no access | no access | yes \*\* (through `exchange_close_position()` and `exchange_close_used_up()`) |

| `exchange_events` | insert | no access | no access | yes \*\* (through the three functions) |




| `exchange_events_id_seq` (the event history's id counter) | no access | no access | no access, the table's own inserts do not need a right on it |



[7] Prediction writes use only their server RPCs; pool sides are a read-only view with no player grant.

[8] Duel writes use only their server RPCs; sealed moves have no player read policy.

After the full group 3 chain through `20261106110000`, the database has **18 tables**, **one view**, **16 public policies**, **5 Realtime policies**, **16 authenticated SELECT grant rows**, **17 wallet reasons** and **24 public functions**. All 18 tables have RLS. The view is `prediction_pool_sides`; it is not counted as a table.

## What the server's secret key may do

- It skips row-level security. It can read every player's rows in all eighteen tables (with every file up to `20261106070000` applied) and write `profiles`, `saves`, `crews` and `crew_seats` (and, see below, the Exchange tables). Its table rights are still limited: it can update `wallets` but not insert or delete one, it can add ledger rows but not edit or delete one, and it can only read `wallet_reasons`.
- It can send into any Realtime room through the Broadcast REST API, because that skips the rules on `realtime.messages`. The server uses this only to tell a crew that something changed (`backend/server/crew_broadcast.py`).
- It is the only role that may run `apply_wallet_transaction()`. That is the one way to change a balance. The same holds for `market_trade()` (a trade) and `market_set_base()` (a company's base): the server runs them, nobody else.
- On the Exchange tables it can read all three, add and change `market_bases`, add, change and delete `market_positions`, and only add `market_trades` rows. It cannot edit or delete a trade. Like the wallet, this is a rule of the team more than a lock: see note [2] of the matrix.
- On the account functions it may read and add `captain_name_rerolls` rows (only through `reroll_captain_name()`; a re-roll is final, so no update and no delete), and it is the only role that may run `assign_captain_name()`, `reroll_captain_name()`, `save_progress()` and `delete_player()`. `delete_player()` is the most powerful call the server can make: it deletes a login and everything about a player. The Python code passes it only the id of the verified player, and only after the request said `"confirm": true`.
- On the crew tables it writes `crews` and `crew_seats` only through the four crew functions, by team rule (note [5] of the matrix), and it may read, add and delete `crew_join_failures` rows (through `crew_find_by_code()`, which also deletes the rows older than the guessing window). It is the only role that may run `crew_create()`, `crew_find_by_code()`, `crew_take_seat()` and `crew_start()`.
- On the entry kit table it may read and add `entry_profiles` rows (only through `grant_entry_kit()`; a profile is written once and the first ending counts, so no update and no delete), and it is the only role that may run `grant_entry_kit()`. That function is also the only place where the entry kit coins are paid.
- On the home islet tables it can read both, add and change `islets` rows (the timber), and only add `islet_buildings` rows. It cannot edit or delete a building, and it cannot delete an islet. It is the only role that may run `islet_build()`. Like the wallet, this is a rule of the team more than a lock: see note [6] of the matrix.
- Because it skips RLS, the Python code must first check who is asking (the player's verified login token) and only then touch that player's rows.
- It must never reach a browser, the repository, a log or a screenshot. It lives only in the `SUPABASE_SECRET_KEY` environment variable on Vercel, and in a local `.env` file that git ignores.
- The browser only gets `SUPABASE_PUBLISHABLE_KEY` (as `VITE_SUPABASE_PUBLISHABLE_KEY`). That key is safe to show because the two locks above protect every table, and the browser has no right to write to any of them.

## Manual test plan

You need about 30 minutes. It proves the rules for reading and writing, the money function, the eight reasons and the crews with two test players, A and B.

The steps 1 to 17 check the foundation migration. If the Island Exchange migration is applied too, read **17** instead of 8 for the number of reasons in steps 4 and 16. Step 15 still tests the first eight reasons. The later files have their own checks after step 17: the crew checks C1 to C8 (`20261106040000`), the Island Exchange checks E1 to E13 (`20261106010000`, including its three new reasons), the account checks N1 to N6 (`20261106020000`), the entry kit checks K1 to K5 (`20261106030000`) the live presence checks L1 to L7 (`20261106050000`) and the home islet checks H1 to H15 (`20261106070000`). Run L3 after step 3 (it needs the crews that step makes) and before step 17 (which deletes the test players). None of the accounts, entry kit, crew, live presence or home islet files adds a reason.

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

Expected: `status` `joined`, `seatNo` 3 and `replacedPartner` `bosun`. The Crew check shows one row: `K7QF2M`, version 4, seats `1 A witness, 2 B stranger, 3 C stranger, 4 cook true_keeper`. The seat carries C's **own** kit (`stranger`), not the Bosun's (as Nils decided in the story round, D018, decision 10). The crew `CCCCCC` is gone: the draft was deleted in the same step, with its seat.

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

If your key is an old-style key (the long `service_role` JWT, not one of the new secret keys), also add `-H "Authorization: Bearer $SUPABASE_SECRET_KEY"`, as `backend/server/supabase_admin.py` does.

Expected: a list with one crew, whose `crew_seats` holds four entries. The entries of players A, B and C carry `"profiles": {"display_name": "Captain-..."}`, and the entry of the Cook, an NPC partner, carries `"profiles": null`. If the answer is an error that talks about a relationship instead, the read in `backend/server/crews/store.py` (`CREW_COLUMNS`) has to change, so tell the team. The player-kit read (`entry_profiles?select=kit&...`) needs the migration of package A3: run it the same way with `rest/v1/entry_profiles?select=kit&limit=1` once that migration is applied.

Finally paste the whole crew migration into the SQL editor again and run it. Expected: no error, and the Crew check still shows what it showed after C7.

Delete the three test users when you are done (**Authentication > Users**). Their crews, seats and wrong codes go with them.

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

Expected: 5 rows: `market_buy` spend, `market_fee` spend, `market_payout` earn, `market_sell` earn, `market_stake` spend. And 17 reasons in all after group 3. The wallet refuses a wrong direction, for example a stake that adds coins:

```sql
set local role service_role;
select public.apply_wallet_transaction('USER_A_ID', 10, 'market_stake', 'manual-wrong-1');
```

Expected: `wrong_direction`. Finally paste the whole third migration (`20261106090000_exchange_leverage.sql`) into the SQL editor again and run it. Expected: no error, the Exchange check for player A shows what it showed after X12, and `select count(*) from public.wallet_reasons;` still shows 17 after the full group 3 chain. (The file starts with a guard that only looks at the old first-version table `market_trades`, which no longer exists, so it does nothing the second time.)

Delete the two test users when you are done (**Authentication > Users**). Their positions and events go with them.

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

### Live presence checks (steps L1 to L7)

These steps test the live presence migration (`20261106050000`). Run them after the foundation migration and the live presence migration are both applied. L3 uses the two test players and the two crews of the main plan (steps 1 to 3), so run it after step 3 and before step 17; the other steps can run any time.

**L1. The five policies.** Run the fourth quick check (default role):

```sql
select policyname, cmd, roles
from pg_policies
where schemaname = 'realtime' and tablename = 'messages'
order by policyname;
```

Expected: exactly 5 rows, all with `roles` `{authenticated}`: "Live: crew members can hear their crew room" (`SELECT`), "Live: players can move in a place room" (`INSERT`), "Live: players can say where they are" (`INSERT`), "Live: players can see who is online" (`SELECT`) and "Live: players can watch a place room" (`SELECT`).

**L2. The rights on the table.** Supabase sets these, not our file:

```sql
select r.rolname as role,
       has_table_privilege(r.rolname, 'realtime.messages', 'select') as can_select,
       has_table_privilege(r.rolname, 'realtime.messages', 'insert') as can_insert
from pg_roles r
where r.rolname in ('anon', 'authenticated', 'service_role')
order by r.rolname;
```

Expected: `authenticated` has `true` in both columns. If it does not, stop and report it: do not grant anything by hand. If `anon` shows `true` too, that is fine, because `anon` has no policy and row-level security gives it no row.

**L3. The crew rule works for the right player.** Player A sits in crew A (step 3). `set_config('realtime.topic', ...)` stands in for the room that Realtime is checking:

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_A_ID", "role": "authenticated"}', true);
select set_config('realtime.topic', 'live:crew:CREW_A_ID', true);
select public.is_crew_member(public.live_crew_id(realtime.topic())) as a_hears_crew_a;
```

Expected: `a_hears_crew_a` is `true`. Run it again with `USER_B_ID` instead of `USER_A_ID`: `false`. If your project's `realtime.topic()` does not read that setting, write the topic into the call instead: `public.live_crew_id('live:crew:CREW_A_ID')`. Then check the helper on its own (default role):

```sql
select public.live_crew_id('live:crew:CREW_A_ID') as good_topic,
       public.live_crew_id('live:crew:nope') as bad_topic,
       public.live_crew_id('live:crew:CREW_A_ID' || 'x') as too_long;
```

Expected: `good_topic` is `CREW_A_ID`, and `bad_topic` and `too_long` are empty (null), with no error.

**L4. Public rooms are off.** In the dashboard open **Realtime > Settings** and check that "Allow public access" is switched off. Expected: off.

**L5. Running the migration again is harmless.** Paste the whole live presence migration into the SQL editor again and run it. Expected: no error, and the L1 listing is unchanged.

**L6. Players see each other.** Needs the screens adapter and the wiring in the game ([INTERFACES.md, section 7](../docs/INTERFACES.md#wiring-it-into-the-game)), so run it when they exist. Use two GitHub accounts in one crew and a third in another crew, with `FEATURE_FLAGS=live_presence` on a preview or on your laptop. Expected: in Saltreach Harbor all three see each other walk, see each other's emotes, and see "+N more here" for the captains in other rooms; the third player's browser logs no `live_crew_updated` for the first crew.

**L7. The server's helper (required once, before any package polls less because of crew events).** It is the only check that the server's secret key can really send into a crew room, so L3, S3, S4 and A6 keep their normal polling until it has passed on the real project. For a teammate whose own `.env` holds the server key and has `FEATURE_FLAGS=live_presence`. With a member of the crew `CREW_A_ID` looking at the game in a browser (flag on), run the real helper once from the repository root:

```bash
cd backend && uv run --env-file ../.env python -c "import asyncio; from server.crew_broadcast import broadcaster_from_settings; from server.settings import settings_from_environment; print(asyncio.run(broadcaster_from_settings(settings_from_environment()).send('CREW_A_ID', 'crew_changed', {'version': 1})))"
```

Expected: it prints `True`, and that member's browser logs `live_crew_updated`. `False` comes with one short warning on the terminal (the flag is off, Supabase is not set up, or Supabase answered with an error status). Never type the key into the command: `--env-file` reads it from your private `.env`.

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

## The prediction desk migration

`migrations/20261106100000_prediction_desk.sql` is the database part of the prediction desk (hand-picked real questions from Manifold Markets, and play-coin pools that the winners share; see [INTERFACES.md, section 2](../docs/INTERFACES.md#the-prediction-desk-package-l5) and decision D025 in [DECISIONS.md](../docs/DECISIONS.md), whose number is provisional). Run it **after** the foundation migration, because it uses the wallet and the profiles from there. It does not need the Island Exchange migration, but it sorts after it, so the usual order (oldest first) is right. It is safe to run twice. Everything is explained in the file itself. **It is not applied to the Supabase project yet**, and the feature flag `predictions` stays off.

| Name | What it is | Who changes it |
|---|---|---|
| `prediction_pools` | One row per question: when staking closes (`closes_at`), and how the pool ended once it was settled (`status`, `outcome`, `settlement`, `settled_by`, `settled_at`, `cut_coins`, `paid_coins`). Created by the first stake or by the settlement, never deleted. It holds no running totals: they come from the stakes. | Only the server, through `prediction_place_stake()` (creates the row) and `prediction_settle_pool()` (settles it). |
| `prediction_stakes` | One row per stake: the player, the side (`yes` or `no`), the coins, the `stake_id` the browser made for the click and the ledger `ref` (`stake:` plus that id). A player has one stake per question, and can use a `stake_id` once. `payout` is written when the pool is settled. | Only `prediction_place_stake()` adds a row; only `prediction_settle_pool()` writes `payout`. |
| `prediction_pool_sides` | A view: the coins and the players on each side of each pool, added up from the stakes. It uses the rights of whoever reads it (`security_invoker`). | Nobody writes it. Only the server reads it. |
| `prediction_pools_keep_settled()` | A trigger function, run by the trigger of the same name before every update of a `prediction_pools` row. If the row is already `settled` it raises `pool_settled`, so **a settled pool is final**: nothing can change it any more, not even the server, which holds the update right on seven of its columns. Without it, a server bug that wrote the table directly could set a settled pool back to `open` and settle it again with the other outcome (`pool:<questionId>` only stops a second payout to the same player, not one to the other player). The settlement itself is not in the way: it changes an open pool, once. | Nobody calls it. The trigger runs it. |

**The server works out the payouts, and the database checks them.** The rule is written once in full, in Python (`backend/server/predictions/pools.py`): the winners share the pool in proportion to their stakes, 5 % of the losing side (rounded down) leaves the game, the leftover coins go to the largest remainders and then to the earliest stake, and everybody gets a full refund when the question is void, when nobody picked the winning side or when everybody picked the same side. `prediction_settle_pool()` does not repeat the split. It checks what it is given: the payouts must name **exactly** the stakes that get paid (a refund: every stake; a win: every winning stake), they must add up to the coins staked minus the cut, each must be at least 1 coin, a refund must be the stake, and a win must be within one coin of the exact share (`abs(coins x W - stake x D) < W`, with W the winning coins and D the shared coins). If the server ever had a bug, the database refuses the settlement with `bad_settlement` instead of paying wrong coins, so **no coin is ever created or lost**. If the pool changed between the server's read and the call (a stake disappeared because its player was deleted, or a new stake arrived, which can happen to a void while staking is still open), the answer is `stakes_changed`, and the server reads again.

**The lock order** is the same everywhere: the pool row first, then the wallets, by player id. A stake and a settlement of the same pool therefore happen one at a time, a pool settles once, and two settlements (or a settlement and a stake) can never wait for each other in a circle. The limits (the biggest stake, the daily cap, the cut) are passed in as arguments from `backend/server/predictions/stake_rules.py`, so the numbers live in one place.

**The update rights are per column.** The server may update seven columns of `prediction_pools` (the settlement) and the column `payout` of `prediction_stakes`, and nothing else: it cannot change who staked what or how much, it cannot move a closing time, and it cannot delete a stake or a pool. (`select ... for update` needs the update right on at least one column, and the column grants give exactly that.) And once a pool is settled, even those seven columns are closed: the trigger `prediction_pools_keep_settled()` refuses every update of a settled pool with `pool_settled`.

**A known limit:** if a player is deleted while a pool is open, their stake row goes with them (cascade), and those coins simply leave the game. No coin is ever created.

After the full group 3 chain through `20261106110000`, the database has **18 tables**, **one view**, **16 public policies**, **5 Realtime policies**, **16 authenticated SELECT grant rows**, **17 wallet reasons** and **24 public functions**. All 18 tables have RLS. The view is `prediction_pool_sides`; it is not counted as a table.

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

**P1. The reasons.** Both are on the list, and there are 17 reasons after the full chain (8 foundation, 3 Exchange v1, 2 Exchange v2, 2 prediction and 2 arena):

```sql
select reason, direction from public.wallet_reasons where reason like 'prediction\_%' order by reason;
select count(*) as reasons from public.wallet_reasons;
```

Expected: `prediction_payout` earn and `prediction_stake` spend; `reasons` is 17.

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

Expected: `stakes` 0 (the stakes go with their players, and those coins leave the game), and `pools` is still 10 or more: a pool is never deleted. Finally paste the whole prediction desk migration into the SQL editor again and run it. Expected: no error, `select count(*) from public.wallet_reasons;` still shows 17 after the full group 3 chain (10 without the Exchange migration), and the pools are unchanged.

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

## The Lantern Duels migration

`migrations/20261106110000_lantern_duels.sql` is the database part of Lantern Duels (package A7): two captains each seal a sequence of lantern signals, the server opens both envelopes at once, and the duel is friendly or played for equal play-coin stakes (see [INTERFACES.md, section 2](../docs/INTERFACES.md#lantern-duels-package-a7), decision [D026](../docs/DECISIONS.md) and the spec [A7-lantern-duels.md](../specs/A7-lantern-duels.md)). Run it **after** the Island Exchange migration (it uses the wallet and the profiles from the first). It is safe to run twice. Everything is explained in the file itself. It adds two wallet reasons, `arena_stake` and `arena_payout` (see the table above), and:

| Name | What it is | Who changes it |
|---|---|---|
| `duels` | One row per challenge: who, the number of rounds, the stake, the status (`open`, then once `finished`, `withdrawn`, `declined` or `expired`) and, once decided, the result of every round. It never holds a signal. `create_uid` (the `actionUid` of the click) is unique per challenger, so a repeated click cannot send two challenges. | Only the server, through `duel_create()`, `duel_answer()` and `duel_void()`. |
| `duel_moves` | The sealed envelopes: one row per captain and round, holding a signal. The only table with a signal, so it is locked tighter than any other: players have no right on it at all (not even for their own rows), the server may only read and insert, and no role may update or delete a row. | Only `duel_create()` and `duel_answer()`. |

Like `market_trade()`, each function either does its work (`{"status": "done", ...}`) or *returns* a refusal (`{"status": "refused", "reason": "duel_taken"}`) before it writes anything, and *raises* an error for a real failure: `insufficient_funds` (from the wallet), a repeat (code `23505`, message `already_applied`), or `bad_duel` / `wallet_not_found` when the server sent numbers that do not fit (a bug on the server side). Every ledger row of a duel carries the ref `duel:` and the duel id, so a stake or a payout cannot be booked twice. The cut (5 % of the pot, rounded in the winner's disfavour) has no ledger row: it is simply not paid out. The arena rows of one duel add up to 0 for a friendly duel, a draw, a withdrawal, a decline or an expiry, and to minus the cut for a decided staked duel (-1, -3, -5 or -10 for stakes of 10, 25, 50 or 100). The locks are always taken in the same order, the duel row first and then the wallets by player id, so two requests never wait for each other forever.

After the full group 3 chain through `20261106110000`, the database has **18 tables**, **one view**, **16 public policies**, **5 Realtime policies**, **16 authenticated SELECT grant rows**, **17 wallet reasons** and **24 public functions**. All 18 tables have RLS. The view is `prediction_pool_sides`; it is not counted as a table.

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

Expected: a duel that ended without a winner (a draw, withdrawn, declined, expired, and every friendly one) adds up to 0; `duel-test-001` (finished, 100) adds up to -10 and `duel-test-003` (finished, 50) to -5, the cut of each; and the duels that are still open (`duel-test-008`, staked 100, and `duel-test-013`, staked 10) add up to minus their held stake, -100 and -10. Finally paste the whole Lantern Duels migration into the SQL editor again and run it. Expected: no error, the Duel check shows what it showed before, and `select count(*) from public.wallet_reasons;` still shows 17 after the full group 3 chain.

Delete the three test users when you are done (**Authentication > Users**). Their duels, envelopes and ledger rows go with them.

## Group 3 automated migration checks

The complete ten-file chain applies twice on a new local PostgreSQL over a Unix socket. The checks verify the cumulative object counts, wallet directions and server-only intent grants. They never read a configured database URL. From `backend/`:

```bash
CASE_PG_SCRATCH=1 UV_CACHE_DIR=/workspace/.cache/uv uv run --with pgserver --with 'psycopg[binary]' --with pglast pytest -q server/tests/group3_sql
```

The test-only packages stay in uv's cache. Claude reviews and applies the three protected migration files before their code reaches main; this check does not apply anything to Supabase.

## Changing the database later

- Never edit a migration that has been applied anywhere. Add a new file named `supabase/migrations/<YYYYMMDDHHMMSS>_<topic>.sql` with a later time stamp.
- A new table needs, in the same file: row-level security switched on, policies, **explicit grants** (our project gives no rights to a new table, so nothing works until you grant them, and you grant only what is really needed), and a comment on the table, every column and every policy. Take every right away first (`revoke all` from `public`, `anon`, `authenticated` and `service_role`), then grant. The browser only reads, so `authenticated` gets `select` at most. If the table has an identity column (`generated always as identity`), also revoke all rights on its counter, as the foundation file does for `wallet_transactions_id_seq`. Copy the style of the foundation file.
- A new function needs `revoke ... from public, anon, authenticated` and then `grant execute` only to the role that must run it. Start it with `set search_path = ''`.
- A new wallet reason is one new migration with one `insert into public.wallet_reasons (reason, direction, description) values (...) on conflict (reason) do nothing;`, plus the same `(reason, direction)` pair added at the **end** of `WALLET_REASONS` in `backend/server/wallet.py`, in the same pull request. Never rename a reason or change its direction, because ledger rows point at it. The test `backend/server/tests/test_wallet_matches_migration.py` reads every migration in order and fails if the two lists differ. Add the reason to the manual test plan (step 15) too.
- Realtime does not follow any of these tables (Postgres Changes is not used). Live presence uses Realtime rooms with their own rules on `realtime.messages`. Never add a policy with `using (true)`, or any rule that does not look at the topic, on `realtime.messages`: it would open every room, including every crew room, to every signed-in player.
- **Kill switch for live presence**, from the fastest to the slowest: (1) Realtime > Settings > "Enable Realtime service" off. It takes effect at once, and the API and the game keep working; only live presence stops. (2) Drop the five policies with the SQL below. Rooms that a player has already joined keep their rights until that player's next login token, at most about an hour. (3) Delete the account of a flooding player under **Authentication > Users**: its current token stays valid until it ends, at most about an hour. To bring live presence back after (2), run the live presence migration again.

  ```sql
  drop policy if exists "Live: players can see who is online" on realtime.messages;
  drop policy if exists "Live: players can say where they are" on realtime.messages;
  drop policy if exists "Live: players can watch a place room" on realtime.messages;
  drop policy if exists "Live: players can move in a place room" on realtime.messages;
  drop policy if exists "Live: crew members can hear their crew room" on realtime.messages;
  ```
- If something here is unclear, open an issue before changing the rules for money.

## Case Phase 1 migration

`migrations/20261106060000_case_rules.sql` is additive and awaits Claude's review and live application. The case flag remains off. No earlier migration or wallet-reason list changes. The full sorted local chain runs twice in the disposable database checks, preserving any later replacement of the empty world hook.

| Table | anon | authenticated | service_role |
|---|---|---|---|
| case_state | no access | no access | select, insert, update |
| case_finds | no access | no access | select, insert |
| case_deductions | no access | no access | select, insert |
| case_accusations | no access | no access | select, insert |
| case_solvers | no access | no access | select, insert |
| case_actions | no access | no access | select, insert |

All six tables have RLS and no browser policies. The two identity sequences have no role grants. Service history is append-only. Player-owned records cascade on deletion; shared history keeps nullable player references.

| Function | Who may execute | Purpose |
|---|---|---|
| case_window_open | service_role only | Match the Python recurring window rule |
| case_begin | service_role only | Crew lock, repeat, status, seat and database clock |
| case_finish | service_role only | Store the outcome and increment revision |
| case_open | service_role only | Idempotently open the clock and starting cards |
| case_start_route | service_role only | Recheck gates/windows and store a timed find |
| case_after_solve | service_role only | Empty hook until Phase 3; never reset a later hook |
| case_accuse | service_role only | Guard the snapshot, wait, solve and atomic payouts |
| case_clock_forward | service_role only | Move a seated host's crew clock after the Python host check |

All functions use caller rights and an empty search path. The API store calls only intent functions. Run from `backend/` with test-only tools, never a configured database URL:

```bash
CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' pytest -q server/tests/case_sql
```

The fixture asserts a local Unix socket, applies every migration twice, runs checks as `service_role` or refused `authenticated`, rolls back test data and deletes the server afterwards. Normal pytest skips this opt-in package. Manual checks C1 to C14 mirror the automated checks:

1. Apply the full chain twice; a later replacement of the solve hook remains intact.
2. Open twice: one state and one starting find per eligible player or partner seat.
3. Refuse forming and finished crews with their actual status.
4. A 300-second search stores that exact duration and one new revision.
5. A repeated uid returns its original kind, target and outcome, even after finishing.
6. A gated card refuses before its deduction and starts afterwards.
7. Refuse a duplicate find for the same seat and card.
8. Refuse the minute before a window opens and accept its first open minute; compare all four windows with Python.
9. Refuse accusation without the schooner or required deductions.
10. A wrong accusation waits 60 seconds; 59 refuses and 60 accepts.
11. Accept once, finish the crew, store every player solver, pay once per player across crews and return unchanged world.
12. Refuse authenticated reads of every case table and execution of every case function.
13. A stale case revision or crew version changes no accusation, action, solver or wallet row.
14. A host clock move changes only its own crew, logs the action and increments revision; forming crews refuse.


## Case Phase 2 migration

`migrations/20261106080000_case_board_and_night.sql` follows case Phase 1 and L2. Claude reviews and applies it before deployment reads these tables; keep `case` off until every required phase migration is applied. Historical migrations and wallet reason order are unchanged.

| Table | anon / authenticated | service_role |
|---|---|---|
| board_pins | no access | select, insert |
| finale_posts | no access | select, insert; update `ended_second` only |
| finale_signals | no access | select, insert; update `ended_second`, `parted` only |

All three tables have RLS with no player policy, no DELETE grant, and no sequence grants. Pins are append-only. Posts and signals retain history; partial unique indexes permit only one open post per seat and light. `case_state` adds the night number, start second and caller.

The seven caller-rights, empty-search-path functions are `finale_post_holds(uuid,text,smallint)`, `finale_leave_post(uuid,smallint,integer,integer)`, `board_pin(uuid,uuid,text,text,integer,text)`, `board_pair(uuid,uuid,text,text,text,text,integer,integer,text)`, `finale_nightfall(uuid,uuid,text,text,integer,integer)`, `finale_take_post(uuid,uuid,text,text,boolean,integer,integer)` and `finale_signal(uuid,uuid,text,text,numeric,boolean,integer,integer,integer,integer)`. Only `service_role` may execute them. The API calls the last five intent functions, which enter the Phase 1 crew lock and finish each state-changing write exactly once.

The existing disposable `case_sql` command also runs N1 to N15 in `test_phase2.py`: one-time pin/deduction rewards across crews; replayed accepted and state-changing refusals; pair/climb/night/dawn/cooldown boundaries; distinct-seat overlap; moved/replaced posts; append-only history; role and column grants. The complete sorted migration chain runs twice before tests, and the fixture deletes its Unix-socket database afterwards.
