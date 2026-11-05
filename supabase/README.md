# Supabase database

This folder holds the database of The Great Plot Twist. Supabase gives us the login (GitHub sign-in), a Postgres database and realtime. Everything the game must remember lives here: who the players are, their saved progress and their coins.

Play money only: coins cannot be bought or cashed out. Every player starts with 1000 coins.

| File | What it is |
|---|---|
| [migrations/20261106000000_foundation.sql](migrations/20261106000000_foundation.sql) | The first migration: four tables, the security rules and three functions. Every table, column and policy is explained inside the file. |

## What the migration creates

| Name | What it is | Who changes it |
|---|---|---|
| `profiles` | One row per player: the display name. No e-mail address. | Created at sign-up. The player may change `display_name` only. |
| `saves` | One row per player: game progress as JSON, at most about 200 KB. | Only the server. The player may read their own save. |
| `wallets` | One row per player: the coin balance. Never below 0. | Only `apply_wallet_transaction()`. |
| `wallet_transactions` | The ledger: one row for every change to a wallet. The same player, reason and `ref` can appear only once. | Only `apply_wallet_transaction()` and the sign-up trigger. |
| `apply_wallet_transaction()` | The only way coins move. One step: check the balance, change it, write the ledger row. Fails with `insufficient_funds` or `wallet_not_found`. The ledger refuses a wrong-way amount or a repeated `ref`, and then nothing changes. | Run by the server only. |
| `handle_new_user()` | Runs at sign-up (trigger `on_auth_user_created`). Creates the profile, the wallet with 1000 coins, the `starting_grant` ledger row and an empty save. | Runs by itself. |
| `touch_updated_at()` | Sets `updated_at` to the server time on `saves` and `wallets`. | Runs by itself. |

The ledger accepts exactly these ten reasons, in this order. The Python code uses the same list:
`starting_grant`, `market_buy`, `market_sell`, `prediction_stake`, `prediction_payout`, `sports_stake`, `sports_payout`, `arena_stake`, `arena_payout`, `admin_adjust`.

Each reason also has a direction, and the ledger checks it. `market_buy`, `prediction_stake`, `sports_stake` and `arena_stake` always take coins away (a negative amount). `starting_grant`, `market_sell`, `prediction_payout`, `sports_payout` and `arena_payout` always add coins (a positive amount). `admin_adjust` may go either way. The Python code repeats the same rule, and it also refuses `starting_grant`, because only the sign-up trigger writes it. The test `server/tests/test_wallet_matches_migration.py` fails if the SQL and the Python ever differ.

The ledger holds one row per player, reason and `ref`. Every money call from the server passes a `ref`, such as an order id. If the same request arrives twice, the second call fails with a unique violation and changes nothing, so nobody pays or is paid twice. The server turns that failure into the answer `already_applied`.

The display name is 2 to 24 characters from A-Z, a-z, 0-9, space, underscore, dot and hyphen, with no space at the start or end. At sign-up it is taken from the GitHub login. If nothing usable is left, the player gets `Sailor-` plus the first 6 characters of their id, so a sign-up is never blocked by the name rules.

## Apply the migration

Use one way. The file is safe to run twice, so nothing breaks if you run it again.

### First: allow only GitHub sign-in

Every new user gets a wallet with 1000 coins and a profile that all players can see, and the server accepts the login of any sign-in method that is switched on. So only the sign-in we chose may create users.

1. In the dashboard open **Authentication > Sign In / Providers**.
2. Switch **GitHub** on. A teammate sets up the GitHub app and pastes its keys into the dashboard only, never into this repository.
3. Switch **Email** off.
4. Keep **Anonymous sign-ins** off. An anonymous user counts as a signed-in player too.

### Option A: SQL editor (quickest)

1. Open your project in the Supabase dashboard.
2. Open **SQL Editor** and start a new query.
3. Paste the whole content of `migrations/20261106000000_foundation.sql`.
4. Click **Run**. Expected: a success message and no error.

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

### Two quick checks after applying

Run both in the SQL editor.

```sql
select relname as table_name, relrowsecurity as rls_on
from pg_class
where relnamespace = 'public'::regnamespace and relkind = 'r'
order by relname;
```

Expected: the four tables `profiles`, `saves`, `wallet_transactions`, `wallets`, each with `rls_on` = true.

```sql
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Expected: 5 policies (2 on `profiles`, 1 on `saves`, 1 on `wallets`, 1 on `wallet_transactions`).

### If someone signed in before you ran the migration

The sign-up trigger only fires for new users. An earlier user has no profile, wallet or save. Delete that user under **Authentication > Users** and sign in again.

## Who may do what

Every table has two locks. Both must say yes.

1. **Table privileges**: may this role use the table at all?
2. **Row-level security (RLS)**: which rows may it see or change?

The three actors, and the database role behind each:

- **Visitor** (`anon`): someone who is not signed in.
- **Signed-in player** (`authenticated`): the browser, using the publishable key plus the player's login.
- **Server** (`service_role`): our Python code on Vercel, using the secret key. It skips RLS.

| Table | Action | Visitor (`anon`) | Signed-in player (`authenticated`) | Server (`service_role`) |
|---|---|---|---|---|
| `profiles` | read | no access | all rows | yes |
| `profiles` | insert | no access | no access | yes |
| `profiles` | update | no access | own row, `display_name` only | yes |
| `profiles` | delete | no access | no access | yes |
| `saves` | read | no access | own row | yes |
| `saves` | insert | no access | no access | yes |
| `saves` | update | no access | no access | yes |
| `saves` | delete | no access | no access | yes |
| `wallets` | read | no access | own row | yes |
| `wallets` | insert | no access | no access | no access (only the sign-up trigger makes a wallet) |
| `wallets` | update | no access | no access | yes * |
| `wallets` | delete | no access | no access | no access (a wallet goes only when its player is deleted) |
| `wallet_transactions` | read | no access | own rows | yes |
| `wallet_transactions` | insert | no access | no access | yes * |
| `wallet_transactions` | update | no access | no access | no access (the ledger is append-only) |
| `wallet_transactions` | delete | no access | no access | no access (the ledger is append-only) |

\* The database lets the server update `wallets` and add ledger rows directly, because `apply_wallet_transaction()` runs with the server's rights and needs both. Our rule is that the server does this only through that function. A direct update skips the ledger row, so the balance no longer matches the ledger. Reading a balance in Python and then writing a new one can lose coins when two requests arrive together. The function cannot.

| Function or counter | Visitor (`anon`) | Signed-in player (`authenticated`) | Server (`service_role`) |
|---|---|---|---|
| `apply_wallet_transaction()` | no access | no access | yes |
| `handle_new_user()` | no access | no access | no access, only the sign-up trigger runs it |
| `touch_updated_at()` | no access | no access | no access, only the triggers run it |
| `wallet_transactions_id_seq` (the ledger's id counter) | no access | no access | no access, the table's own inserts do not need a right on it |

"No access" means the database refuses with `permission denied`, or (for a row that belongs to someone else) shows or changes nothing.

## What the server's secret key may do

- It skips row-level security. It can read every player's rows in the four tables and write `profiles` and `saves`. Its table rights are still limited: it can update `wallets` but not insert or delete one, and it can add ledger rows but not edit or delete one.
- It is the only role that may run `apply_wallet_transaction()`. That is the one way to change a balance.
- Because it skips RLS, the Python code must first check who is asking (the player's verified login token) and only then touch that player's rows.
- It must never reach a browser, the repository, a log or a screenshot. It lives only in the `SUPABASE_SECRET_KEY` environment variable on Vercel, and in a local `.env` file that git ignores.
- The browser only gets `SUPABASE_PUBLISHABLE_KEY` (as `VITE_SUPABASE_PUBLISHABLE_KEY`). That key is safe to show because the two locks above protect every table.

## Manual test plan

You need about 25 minutes. It proves the rules for reading and writing, the money function and the ten reasons with two test players, A and B.

**Set up**

1. In the dashboard open **Authentication > Users > Add user > Create new user**. Create two users with two e-mail addresses you control (for example your own address with `+a` and `+b` added before the `@`). Tick **Auto Confirm User**. If the dashboard refuses because Email sign-in is switched off, switch it on for the test and off again afterwards.
2. Copy the **User UID** of each. Below, replace `USER_A_ID` and `USER_B_ID` with them. A text editor's find-and-replace is the quickest way.
3. Run each block in its own run in the SQL editor, with the role left on the default (`postgres`). The `set local role` line inside a block makes the database treat you as that player for that run.

Users made this way have no GitHub login, so their display name is `Sailor-` plus 6 characters. That also tests the fallback.

### 1. New players got their starter rows

```sql
select p.display_name,
       w.balance,
       (select count(*) from public.wallet_transactions t where t.player_id = p.id) as ledger_rows,
       (select t.reason from public.wallet_transactions t where t.player_id = p.id limit 1) as ledger_reason,
       s.version as save_version,
       s.data as save_data
from public.profiles p
join public.wallets w on w.player_id = p.id
join public.saves s on s.player_id = p.id
where p.id in ('USER_A_ID', 'USER_B_ID');
```

Expected: 2 rows. `display_name` is `Sailor-xxxxxx`, `balance` is 1000, `ledger_rows` is 1, `ledger_reason` is `starting_grant`, `save_version` is 1, `save_data` is `{}`.

### 2. Player A sees only their own money and save

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_A_ID", "role": "authenticated"}', true);
select
  (select count(*) from public.profiles)            as profiles_seen,
  (select count(*) from public.wallets)             as wallets_seen,
  (select count(*) from public.wallet_transactions) as ledger_rows_seen,
  (select count(*) from public.saves)               as saves_seen;
```

Expected: `profiles_seen` is the number of players in the project (at least 2). `wallets_seen`, `ledger_rows_seen` and `saves_seen` are each 1.

### 3. Player B cannot read A's wallet, ledger or save

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_B_ID", "role": "authenticated"}', true);
select
  (select count(*) from public.profiles            where id        = 'USER_A_ID') as a_profile,
  (select count(*) from public.wallets             where player_id = 'USER_A_ID') as a_wallet,
  (select count(*) from public.wallet_transactions where player_id = 'USER_A_ID') as a_ledger_rows,
  (select count(*) from public.saves               where player_id = 'USER_A_ID') as a_save;
```

Expected: `a_profile` is 1 (display names are public). `a_wallet`, `a_ledger_rows` and `a_save` are 0.

### 4. Nobody can change their own balance

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_A_ID", "role": "authenticated"}', true);
update public.wallets set balance = 999999 where player_id = 'USER_A_ID';
```

Expected: `permission denied for table wallets`. Run step 1 again: the balance is still 1000.

### 5. Nobody can edit the ledger or its counter

A player cannot add a ledger row:

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_A_ID", "role": "authenticated"}', true);
insert into public.wallet_transactions (player_id, delta, reason, balance_after)
values ('USER_A_ID', 500, 'admin_adjust', 1500);
```

Expected: `permission denied for table wallet_transactions`.

Nobody can move the ledger's id counter. If they could, every later money call and sign-up would fail:

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_A_ID", "role": "authenticated"}', true);
select setval('public.wallet_transactions_id_seq', 1, false);
```

Expected: `permission denied for sequence wallet_transactions_id_seq`. Change the first line to `set local role anon;` and then to `set local role service_role;` and run it again. The answer is the same.

Even the server cannot rewrite the ledger or the wallets by hand:

```sql
set local role service_role;
update public.wallet_transactions set delta = 1000 where player_id = 'USER_A_ID';
```

Expected: `permission denied for table wallet_transactions`. Now replace the last line and run again:

| Statement as `service_role` | Expected error mentions |
|---|---|
| `delete from public.wallet_transactions where player_id = 'USER_A_ID';` | `permission denied for table wallet_transactions` |
| `insert into public.wallets (player_id) values ('USER_A_ID');` | `permission denied for table wallets` |
| `delete from public.wallets where player_id = 'USER_A_ID';` | `permission denied for table wallets` |

### 6. Players cannot call the money function

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_A_ID", "role": "authenticated"}', true);
select public.apply_wallet_transaction('USER_A_ID', 500, 'admin_adjust');
```

Expected: `permission denied for function apply_wallet_transaction`.

### 7. Someone who is not signed in gets nothing

```sql
set local role anon;
select * from public.profiles;
```

Expected: `permission denied for table profiles`.

### 8. Profile rules

Rename yourself (works):

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_A_ID", "role": "authenticated"}', true);
update public.profiles set display_name = 'Captain A' where id = 'USER_A_ID' returning id, display_name;
```

Expected: 1 row with `Captain A`.

Rename someone else (silently does nothing):

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_A_ID", "role": "authenticated"}', true);
update public.profiles set display_name = 'Hacked' where id = 'USER_B_ID' returning id;
```

Expected: 0 rows. Player B keeps their name.

Break the name rules (each fails):

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_A_ID", "role": "authenticated"}', true);
update public.profiles set display_name = 'x' where id = 'USER_A_ID';
```

Expected: `violates check constraint "profiles_display_name_length"`. Now change `'x'` and run again:

| Name to try | Expected error mentions |
|---|---|
| `'Bad<>Name'` | `profiles_display_name_characters` |
| `' lead'` (space at the start) | `profiles_display_name_trimmed` |

Change a column players may not touch:

```sql
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "USER_A_ID", "role": "authenticated"}', true);
update public.profiles set created_at = now() where id = 'USER_A_ID';
```

Expected: `permission denied for table profiles`.

### 9. Saves

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

### 10. The server moves coins

```sql
set local role service_role;
select public.apply_wallet_transaction('USER_A_ID', -300, 'market_buy', 'manual-test-1') as new_balance;
```

Expected: `new_balance` is 700. Now look at the ledger (default role):

```sql
select delta, reason, ref, balance_after
from public.wallet_transactions
where player_id = 'USER_A_ID'
order by id desc
limit 1;
```

Expected: `delta` -300, `reason` `market_buy`, `ref` `manual-test-1`, `balance_after` 700.

### 11. A payment that would go below zero fails

```sql
set local role service_role;
select public.apply_wallet_transaction('USER_A_ID', -5000, 'market_buy', 'manual-test-2');
```

Expected: `insufficient_funds`. Nothing changed, which you can check (default role):

```sql
select w.balance,
       (select count(*) from public.wallet_transactions t where t.player_id = w.player_id) as ledger_rows
from public.wallets w
where w.player_id = 'USER_A_ID';
```

Expected: `balance` 700 and `ledger_rows` 2 (the starting grant and the 300 coin payment).

### 12. Other bad calls to the money function

Each call below must fail and change nothing.

```sql
set local role service_role;
select public.apply_wallet_transaction('00000000-0000-0000-0000-000000000000', 10, 'admin_adjust');
```

Expected: `wallet_not_found`.

```sql
set local role service_role;
select public.apply_wallet_transaction('USER_A_ID', 10, 'cheat');
```

Expected: `violates check constraint "wallet_transactions_reason_allowed"`.

A purchase must take coins away, so a positive amount for it is refused:

```sql
set local role service_role;
select public.apply_wallet_transaction('USER_A_ID', 30, 'market_buy', 'manual-test-3');
```

Expected: `violates check constraint "wallet_transactions_spend_takes_coins"`. The same goes the other way round: a sale must add coins.

```sql
set local role service_role;
select public.apply_wallet_transaction('USER_A_ID', -30, 'market_sell', 'manual-test-4');
```

Expected: `violates check constraint "wallet_transactions_earn_adds_coins"`.

The same player, reason and reference twice is refused. Step 10 already used `manual-test-1` for `market_buy`:

```sql
set local role service_role;
select public.apply_wallet_transaction('USER_A_ID', -300, 'market_buy', 'manual-test-1');
```

Expected: `duplicate key value violates unique constraint "wallet_transactions_one_row_per_ref"`.

After these calls, run the check from step 11 again: `balance` is still 700 and `ledger_rows` is still 2. A refused call changes nothing, not even a little.

### 13. All ten reasons are accepted

The server uses each of the ten reasons once, with the right direction: 1 coin is taken away for `market_buy`, `prediction_stake`, `sports_stake` and `arena_stake`, and 1 coin is added for the other six. Run this block once. The Python code refuses `starting_grant`, because only the sign-up trigger should write it, but the database function accepts all ten.

```sql
set local role service_role;
select v.reason,
       public.apply_wallet_transaction('USER_A_ID', v.delta, v.reason, 'reason-test') as balance_after
from (values
  ('starting_grant', 1),
  ('market_buy', -1),
  ('market_sell', 1),
  ('prediction_stake', -1),
  ('prediction_payout', 1),
  ('sports_stake', -1),
  ('sports_payout', 1),
  ('arena_stake', -1),
  ('arena_payout', 1),
  ('admin_adjust', 1)
) as v(reason, delta);
```

Expected: 10 rows, one per reason, with `balance_after` going 701, 700, 701, 700, 701, 700, 701, 700, 701, 702. Step 12 already showed that an eleventh name (`cheat`) and a wrong direction are refused. Run the check from step 11: `balance` is 702 and `ledger_rows` is 12.

### 14. Running the migration again is harmless

Paste the whole migration file into the SQL editor again and run it. Expected: no error. Run the check from step 11: `balance` is still 702 and `ledger_rows` is still 12.

### 15. Deleting a player removes their rows

Delete both test users under **Authentication > Users**. Then run:

```sql
select
  (select count(*) from public.profiles            where id        in ('USER_A_ID', 'USER_B_ID')) as profiles,
  (select count(*) from public.wallets             where player_id in ('USER_A_ID', 'USER_B_ID')) as wallets,
  (select count(*) from public.wallet_transactions where player_id in ('USER_A_ID', 'USER_B_ID')) as ledger_rows,
  (select count(*) from public.saves               where player_id in ('USER_A_ID', 'USER_B_ID')) as saves;
```

Expected: all four numbers are 0.

## Changing the database later

- Never edit a migration that has been applied anywhere. Add a new file named `supabase/migrations/<YYYYMMDDHHMMSS>_<topic>.sql` with a later time stamp.
- A new table needs, in the same file: row-level security switched on, policies, only the grants it really needs, and a comment on the table, every column and every policy. If it has an identity column (`generated always as identity`), also revoke all rights on its counter, as the foundation file does for `wallet_transactions_id_seq`. Copy the style of the foundation file.
- A new ledger reason must change these places in one pull request: the `wallet_transactions_reason_allowed` check in a new migration, the reason list in the Python code and, unless the reason may go either way like `admin_adjust`, the matching direction check (`wallet_transactions_spend_takes_coins` or `wallet_transactions_earn_adds_coins`) and `SPEND_REASONS` or `EARN_REASONS`. The test `server/tests/test_wallet_matches_migration.py` fails if they differ. Point it at the newest migration that defines the rule.
- Realtime is not switched on for these tables yet. The work package that needs it adds it.
- If something here is unclear, open an issue before changing the rules for money.
