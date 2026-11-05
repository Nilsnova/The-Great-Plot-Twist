-- =============================================================================
-- 20261106000000_foundation.sql
--
-- WHAT IT DOES
--   The first database migration for "The Great Plot Twist". It creates the
--   four tables that every feature shares, the rules that decide who may see
--   or change each row, and three functions.
--
--     profiles             one row per player (display name only)
--     saves                one row per player (game progress)
--     wallets              one row per player (coin balance)
--     wallet_transactions  the ledger: one row for every change to a wallet
--
-- WHO USES IT
--   You run it once on the Supabase project (the steps are in
--   supabase/README.md). After that, the browser game reads what row-level
--   security allows and the Python server in server/ writes money and
--   progress. This file is the last line of defence: if the game code has a
--   bug, the database still refuses what is not allowed.
--
-- THE FOUR BIG RULES
--   1. Play money only. Coins cannot be bought or cashed out.
--   2. A player can read their own wallet, ledger and save, but can never write
--      to them. Money and progress are decided by the server.
--   3. Only the server (the Supabase secret key, role "service_role") changes
--      money, and only through apply_wallet_transaction().
--   4. Someone who is not signed in (role "anon") gets nothing at all.
--
-- WHAT IT NEEDS
--   A Supabase project (Postgres 17). Every Supabase project already has the
--   roles anon, authenticated and service_role and the auth schema that this
--   file builds on. It will not run on a plain Postgres database.
--
-- SAFE TO RUN TWICE
--   Tables and indexes use "if not exists", functions and triggers use "create
--   or replace", policies are dropped and created again, and grants and
--   comments simply repeat. A second run changes nothing. If a run stops with
--   an error, fix the cause and run the whole file again.
--
-- HOW THE FILE IS ORGANISED
--   1. Helper function touch_updated_at()
--   2. Table profiles
--   3. Table saves
--   4. Table wallets
--   5. Table wallet_transactions (the ledger)
--   6. Row-level security: who may see or change which row
--   7. Table privileges: which roles may use which table at all
--   8. Function apply_wallet_transaction(): the only way money moves
--   9. Function handle_new_user() and its trigger: starter rows at sign-up
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Helper function touch_updated_at()
-- -----------------------------------------------------------------------------
-- Triggers on saves and wallets call this just before a row is written. It
-- sets updated_at to the current time, so a browser can never send a fake
-- "last saved" time.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- A trigger fires without checking who may run the function, so nobody needs
-- the right to call it directly.
revoke all on function public.touch_updated_at()
  from public, anon, authenticated, service_role;

comment on function public.touch_updated_at() is
  'Trigger helper. Sets updated_at to the current time whenever a row is inserted or updated.';


-- -----------------------------------------------------------------------------
-- 2. Table profiles: who is playing
-- -----------------------------------------------------------------------------
-- Public information about a player. Other players may read it, so it holds
-- the display name and nothing personal (no e-mail address).
-- Rows are created by handle_new_user() when someone signs up (section 9).
--
-- "Letters" in the display name means A-Z and a-z on purpose. The same simple
-- rule is easy to repeat in Python and JavaScript. To allow more letters later,
-- add a new migration; do not edit this one.

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now(),

  -- One small check per rule, so the error message names the broken rule.
  constraint profiles_display_name_length
    check (char_length(display_name) between 2 and 24),
  -- The pattern reads: from the start (^) to the end ($), one or more (+)
  -- characters, each one of: A-Z, a-z, 0-9, space, underscore, dot, hyphen.
  constraint profiles_display_name_characters
    check (display_name ~ '^[A-Za-z0-9 _.-]+$'),
  constraint profiles_display_name_trimmed
    check (display_name = btrim(display_name))
);

comment on table public.profiles is
  'One row per player. Public information that other players may see: the display name. No e-mail address or other personal data is stored here.';
comment on column public.profiles.id is
  'Same id as the player in Supabase Auth (auth.users). Deleting the auth user deletes this row too.';
comment on column public.profiles.display_name is
  'Name shown to other players. 2 to 24 characters: letters A-Z, digits, space, underscore, dot, hyphen. No space at the start or end. Not unique.';
comment on column public.profiles.created_at is
  'When the player first signed up.';


-- -----------------------------------------------------------------------------
-- 3. Table saves: the player's progress
-- -----------------------------------------------------------------------------
-- One save per player. A player can read their own save but cannot write it:
-- progress is decided by the server, which writes saves with the secret key.
-- No server route does that yet. The first package that needs saved progress
-- adds one. The database keeps the save a JSON object of reasonable size.

create table if not exists public.saves (
  player_id  uuid primary key references public.profiles (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  version    integer not null default 1,
  updated_at timestamptz not null default now(),

  constraint saves_data_is_object
    check (jsonb_typeof(data) = 'object'),
  -- About 200 KB. Counted as the length of the JSON written out as text.
  constraint saves_data_max_size
    check (octet_length(data::text) <= 200000),
  constraint saves_version_positive
    check (version >= 1)
);

-- Whenever a save is written, stamp updated_at with the server time.
create or replace trigger saves_touch_updated_at
  before insert or update on public.saves
  for each row execute function public.touch_updated_at();

comment on table public.saves is
  'One row per player: the game progress that is kept between visits. A player can read only their own save. Only the server writes it, with the secret key.';
comment on column public.saves.player_id is
  'The player this save belongs to. It is also the primary key, so there is exactly one save per player.';
comment on column public.saves.data is
  'The progress itself as a JSON object: intro outcome, items, flags, home island. At most about 200 KB. Written only by the server.';
comment on column public.saves.version is
  'Version of the save format, starting at 1. The server raises it when the shape of data changes, so old saves can be upgraded.';
comment on column public.saves.updated_at is
  'When the save was last written. Set by the database.';


-- -----------------------------------------------------------------------------
-- 4. Table wallets: how many coins each player has
-- -----------------------------------------------------------------------------
-- One wallet per player, shared by every money feature (stock exchange,
-- prediction markets, sports predictions, arena stakes).
-- Players can only read it. Only apply_wallet_transaction() changes it. The
-- sign-up trigger creates it, and no role may create or delete a wallet by hand
-- (see section 7).
--
-- The starting balance of 1000 is the column default below. The Python code
-- has the same number as STARTING_BALANCE; keep the two in step. A test
-- (server/tests/test_wallet_matches_migration.py) fails if they differ.

create table if not exists public.wallets (
  player_id  uuid primary key references public.profiles (id) on delete cascade,
  balance    bigint not null default 1000,
  updated_at timestamptz not null default now(),

  constraint wallets_balance_not_negative
    check (balance >= 0)
);

-- Whenever a wallet is written, stamp updated_at with the server time.
create or replace trigger wallets_touch_updated_at
  before insert or update on public.wallets
  for each row execute function public.touch_updated_at();

comment on table public.wallets is
  'One row per player: the current coin balance (play money only). Players can read their own wallet but never write to it. Only the server changes it, through apply_wallet_transaction().';
comment on column public.wallets.player_id is
  'The player this wallet belongs to. It is also the primary key, so there is exactly one wallet per player.';
comment on column public.wallets.balance is
  'Coins the player owns right now. Never below 0. A new wallet starts with 1000 coins (STARTING_BALANCE in the Python code).';
comment on column public.wallets.updated_at is
  'When the balance last changed. Set by the database.';


-- -----------------------------------------------------------------------------
-- 5. Table wallet_transactions: the ledger
-- -----------------------------------------------------------------------------
-- One row for every change to a wallet, and no row is ever edited afterwards:
-- no role has the right to update or delete a ledger row (see section 7).
-- If a balance looks wrong, this table tells the story of how it got there.
-- Rows are added only by apply_wallet_transaction() and by the sign-up trigger.

create table if not exists public.wallet_transactions (
  id            bigint generated always as identity primary key,
  player_id     uuid not null references public.profiles (id) on delete cascade,
  delta         bigint not null,
  reason        text not null,
  ref           text,
  balance_after bigint not null,
  created_at    timestamptz not null default now(),

  constraint wallet_transactions_delta_not_zero
    check (delta <> 0),
  -- The ten allowed reasons. The same list, in the same order, lives in the
  -- Python code (server/wallet.py). Change both together.
  constraint wallet_transactions_reason_allowed
    check (reason in (
      'starting_grant',
      'market_buy',
      'market_sell',
      'prediction_stake',
      'prediction_payout',
      'sports_stake',
      'sports_payout',
      'arena_stake',
      'arena_payout',
      'admin_adjust'
    )),
  -- Each reason has a direction. Read the next two rules as: "if the reason is
  -- one of these, then the amount must be below (or above) zero". A purchase
  -- or a stake takes coins away. A grant, a sale or a payout adds coins.
  -- admin_adjust is in neither list, so it may go either way. The same lists
  -- live in the Python code (SPEND_REASONS and EARN_REASONS in server/wallet.py).
  constraint wallet_transactions_spend_takes_coins
    check (reason not in ('market_buy', 'prediction_stake', 'sports_stake', 'arena_stake')
           or delta < 0),
  constraint wallet_transactions_earn_adds_coins
    check (reason not in ('starting_grant', 'market_sell', 'prediction_payout', 'sports_payout', 'arena_payout')
           or delta > 0),
  constraint wallet_transactions_ref_max_length
    check (char_length(ref) <= 120),
  constraint wallet_transactions_balance_after_not_negative
    check (balance_after >= 0)
);

-- Makes "show me this player's latest transactions" fast: the rows of one
-- player, newest first. "Newest" means the highest id (see the comment on the
-- id column). It also helps the database find a player's ledger rows when that
-- player is deleted.
create index if not exists wallet_transactions_player_id_idx
  on public.wallet_transactions (player_id, id desc);

-- One ledger row per player, reason and ref. This makes a repeated request
-- safe: if the same request arrives twice with the same ref, the second call
-- to apply_wallet_transaction() fails with a "unique violation" and its
-- balance change is rolled back, so nobody pays or is paid twice. A row with
-- no ref is not covered, so every money call from the server passes one.
create unique index if not exists wallet_transactions_one_row_per_ref
  on public.wallet_transactions (player_id, reason, ref)
  where ref is not null;

comment on table public.wallet_transactions is
  'The ledger: one row for every change to a wallet, never edited afterwards. Players can read their own rows. Rows are added only by apply_wallet_transaction() and by the sign-up trigger. The same player, reason and ref can appear only once.';
comment on column public.wallet_transactions.id is
  'Running number in the order the changes were applied. Order the rows of a player by id, never by created_at.';
comment on column public.wallet_transactions.player_id is
  'The player whose wallet changed.';
comment on column public.wallet_transactions.delta is
  'Coins added (positive) or taken away (negative). Never 0. The sign must fit the reason: purchases and stakes are negative, grants, sales and payouts are positive, admin_adjust may be either.';
comment on column public.wallet_transactions.reason is
  'Why the balance changed. One of: starting_grant, market_buy, market_sell, prediction_stake, prediction_payout, sports_stake, sports_payout, arena_stake, arena_payout, admin_adjust.';
comment on column public.wallet_transactions.ref is
  'Optional link to what caused the change, for example a trade, bet or duel id. At most 120 characters. For one player and one reason the same ref can be used only once, so a repeated request cannot pay twice.';
comment on column public.wallet_transactions.balance_after is
  'The wallet balance right after this transaction. Never below 0.';
comment on column public.wallet_transactions.created_at is
  'When the database transaction that wrote the row started. A transaction can wait for a lock, so a row with a higher id can have an earlier created_at. To order rows, use id.';


-- -----------------------------------------------------------------------------
-- 6. Row-level security (RLS): who may see or change which row
-- -----------------------------------------------------------------------------
-- RLS is a filter that the database adds to every query. With RLS switched on,
-- a role can only touch rows that a policy allows. An action with no policy is
-- refused.
--
--   * All policies below are for "authenticated" (a signed-in player).
--   * "anon" (not signed in) has no policy at all, so it gets nothing.
--   * (select auth.uid()) is the id of the signed-in player. Writing it inside
--     (select ...) lets the database work it out once per query instead of
--     once per row.
--   * There is no policy for insert, update or delete on saves, wallets and
--     wallet_transactions, so players can never write progress or money.
--     The only thing a player writes is their own display name (profiles).
--   * The server key (service_role) skips RLS completely. That is why it must
--     never leave the server.

alter table public.profiles            enable row level security;
alter table public.saves               enable row level security;
alter table public.wallets             enable row level security;
alter table public.wallet_transactions enable row level security;

-- profiles: every signed-in player may read every profile, because display
-- names are shown to other players.
drop policy if exists "Players can read all profiles" on public.profiles;
create policy "Players can read all profiles"
  on public.profiles for select to authenticated
  using (true);
comment on policy "Players can read all profiles" on public.profiles is
  'Any signed-in player may read every profile, because display names are shown to other players.';

-- profiles: a player may change only their own row. The "with check" part
-- stops them from handing the row over to someone else.
drop policy if exists "Players can update their own profile" on public.profiles;
create policy "Players can update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
comment on policy "Players can update their own profile" on public.profiles is
  'A signed-in player may change only their own profile row, and cannot hand it to another player. Only display_name can be changed (see the table privileges).';

-- No insert policy and no delete policy on profiles: the sign-up trigger
-- creates profiles, and players cannot delete them.

-- saves: a player may read only their own save.
drop policy if exists "Players can read their own save" on public.saves;
create policy "Players can read their own save"
  on public.saves for select to authenticated
  using (player_id = (select auth.uid()));
comment on policy "Players can read their own save" on public.saves is
  'A signed-in player may read only their own save. Nobody except the server can write to it.';

-- No insert, update or delete policy on saves: players cannot write their own
-- save. The sign-up trigger creates it, and the server (which skips RLS)
-- writes it. Progress is decided by the server, not by the browser.

-- wallets: a player may read only their own wallet.
drop policy if exists "Players can read their own wallet" on public.wallets;
create policy "Players can read their own wallet"
  on public.wallets for select to authenticated
  using (player_id = (select auth.uid()));
comment on policy "Players can read their own wallet" on public.wallets is
  'A signed-in player may read only their own wallet. Nobody except the server can write to it.';

-- No insert, update or delete policy on wallets: players can never write
-- money. Only the server does, through apply_wallet_transaction().

-- wallet_transactions: a player may read only their own ledger rows.
drop policy if exists "Players can read their own transactions" on public.wallet_transactions;
create policy "Players can read their own transactions"
  on public.wallet_transactions for select to authenticated
  using (player_id = (select auth.uid()));
comment on policy "Players can read their own transactions" on public.wallet_transactions is
  'A signed-in player may read only their own ledger rows. Nobody except the server can add rows.';

-- No insert, update or delete policy on wallet_transactions: only the server
-- adds ledger rows, through apply_wallet_transaction().


-- -----------------------------------------------------------------------------
-- 7. Table privileges: which roles may use which table at all
-- -----------------------------------------------------------------------------
-- This is the second lock, next to RLS. Supabase may give every role full
-- access to new tables, functions and sequences and then let RLS decide. We do
-- not rely on that. First we take everything away, then we hand back only what
-- each role needs. Even if a policy were wrong, a missing privilege still stops
-- the action.
--
--   anon           nothing
--   authenticated  read profiles, own save, own wallet and own ledger rows;
--                  change only display_name on profiles
--   service_role   the server (it bypasses RLS):
--                    profiles, saves   read, insert, update, delete
--                    wallets           read, update (no insert, no delete)
--                    wallet_transactions  read, insert (no update, no delete)

revoke all on table
  public.profiles,
  public.saves,
  public.wallets,
  public.wallet_transactions
from public, anon, authenticated, service_role;

-- The ledger's id counter (the sequence behind the identity column "id"). An
-- identity column needs no rights on its counter, but Supabase hands out rights
-- on new sequences to every role by default. Without this line anybody could
-- move the counter, and then every money call and every sign-up would fail.
revoke all on sequence public.wallet_transactions_id_seq
from public, anon, authenticated, service_role;

-- Signed-in players. Money and progress are read-only for them.
grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;
grant select on table public.saves to authenticated;
grant select on table public.wallets to authenticated;
grant select on table public.wallet_transactions to authenticated;

-- The server (Supabase secret key).
grant select, insert, update, delete on table
  public.profiles,
  public.saves
to service_role;

-- A wallet is created only by the sign-up trigger and goes away only when its
-- player is deleted, so the server may read and update it but not insert or
-- delete. UPDATE is needed because apply_wallet_transaction() runs with the
-- rights of its caller. By team rule the server never updates a wallet
-- directly: a direct update skips the ledger row.
grant select, update on table public.wallets to service_role;

-- The ledger is append-only: the server may read it and add rows (the money
-- function does that), but never edit or delete a row.
grant select, insert on table public.wallet_transactions to service_role;


-- -----------------------------------------------------------------------------
-- 8. Function apply_wallet_transaction(): the only way money moves
-- -----------------------------------------------------------------------------
-- The server calls this for every coin movement (market buy, bet stake, ...).
--
--   p_player_id  whose wallet changes
--   p_delta      coins to add (positive) or take away (negative); never 0
--   p_reason     one of the ten reasons the ledger allows
--   p_ref        the trade, bet or duel id (max 120 characters). It may be
--                left out, but the server always passes one, because the same
--                player, reason and ref can be used only once.
--
-- It returns the new balance.
--
-- Why it is safe:
--   * One single UPDATE both checks the balance and changes it. The database
--     locks the wallet row while it works, so two requests at the same moment
--     can never spend the same coins twice.
--   * If the balance would drop below 0, nothing changes and the call stops
--     with the error "insufficient_funds".
--   * If the player has no wallet, the call stops with "wallet_not_found".
--   * The ledger row is written in the same transaction. A broken table rule
--     cancels the whole call, including the balance change. Either both happen
--     or neither does. The rules that can cancel a call are: an unknown
--     reason, an amount with the wrong sign for its reason (for example a
--     purchase that adds coins), a ref that is too long, and a repeat (the
--     same player, reason and ref as an earlier call).
--   * Only service_role may run it (grants at the end of this section).
--   * It is not SECURITY DEFINER on purpose. It runs with the rights of the
--     caller, so even if someone granted it by mistake later, a player would
--     still be stopped by the table privileges and RLS above.

create or replace function public.apply_wallet_transaction(
  p_player_id uuid,
  p_delta     bigint,
  p_reason    text,
  p_ref       text default null
)
returns bigint
language plpgsql
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_balance bigint;
begin
  -- Step 1: change the balance, but only if the result is not below zero.
  update public.wallets
     set balance = balance + p_delta
   where player_id = p_player_id
     and balance + p_delta >= 0
  returning balance into v_balance;

  -- Step 2: no row was updated. Find out why and say so.
  if not found then
    if exists (select 1 from public.wallets where player_id = p_player_id) then
      raise exception 'insufficient_funds';
    else
      raise exception 'wallet_not_found';
    end if;
  end if;

  -- Step 3: write the ledger row. The table rules are checked here.
  insert into public.wallet_transactions (player_id, delta, reason, ref, balance_after)
  values (p_player_id, p_delta, p_reason, p_ref, v_balance);

  return v_balance;
end;
$$;

-- Supabase hands out run rights to everybody by default, so we take them back
-- from each role by name and give them to the server only.
revoke all on function public.apply_wallet_transaction(uuid, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_wallet_transaction(uuid, bigint, text, text)
  to service_role;

comment on function public.apply_wallet_transaction(uuid, bigint, text, text) is
  'The only way money moves. Adds p_delta (positive or negative) to the wallet of p_player_id and writes the ledger row, all in one step. Returns the new balance. Raises insufficient_funds if the balance would go below 0, and wallet_not_found if the player has no wallet. Fails with a constraint error, and changes nothing, if the reason is unknown, the sign of p_delta does not fit the reason, or the same player, reason and ref were used before. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 9. Function handle_new_user() and its trigger: starter rows at sign-up
-- -----------------------------------------------------------------------------
-- When someone signs up, Supabase Auth adds a row to auth.users. The trigger
-- below then runs this function, which creates everything the player needs:
--
--   1. a profile (display name = GitHub login, cleaned up)
--   2. a wallet with the starting balance
--   3. the matching "starting_grant" ledger row
--   4. an empty save
--
-- Two details worth knowing:
--   * SECURITY DEFINER means the function runs with the rights of its owner,
--     not of the person signing up. It has to, because a brand-new player
--     has no right to write to these tables.
--   * If this function fails, the sign-up fails. So it must never fail. The
--     display name is cleaned and, if nothing usable is left, replaced by a
--     name that always passes the profile rules.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  -- The same limits as the display name checks on the profiles table.
  c_name_min_length constant integer := 2;
  c_name_max_length constant integer := 24;
  -- How many characters of the player id the fallback name uses.
  c_fallback_id_length constant integer := 6;

  v_name  text;
  v_start bigint;
begin
  -- Display name: take the GitHub login (user_name).
  v_name := coalesce(new.raw_user_meta_data ->> 'user_name', '');

  -- Delete every character that is NOT on the allowed list. In the pattern,
  -- [^...] means "any character except these", and the last argument 'g' means
  -- "everywhere in the text". Then cut the name to the maximum length and
  -- remove spaces at both ends.
  v_name := regexp_replace(v_name, '[^A-Za-z0-9 _.-]', '', 'g');
  v_name := btrim(left(v_name, c_name_max_length));

  -- Nothing usable left (or no GitHub login at all)? Use "Sailor-" and the
  -- first characters of the player id. These are hex digits, so it passes.
  if char_length(v_name) < c_name_min_length then
    v_name := 'Sailor-' || left(new.id::text, c_fallback_id_length);
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, v_name);

  -- The wallet takes its starting balance from the column default (1000).
  insert into public.wallets (player_id)
  values (new.id)
  returning balance into v_start;

  -- The matching ledger row. The ledger refuses a delta of 0, so a start
  -- balance of 0 would simply get no row.
  if v_start > 0 then
    insert into public.wallet_transactions (player_id, delta, reason, balance_after)
    values (new.id, v_start, 'starting_grant', v_start);
  end if;

  insert into public.saves (player_id)
  values (new.id);

  return new;
end;
$$;

-- Nobody calls this function directly. Only the trigger below runs it.
revoke all on function public.handle_new_user()
  from public, anon, authenticated, service_role;

comment on function public.handle_new_user() is
  'Runs after a new row appears in auth.users. Creates the profile, the wallet with the starting balance, the starting_grant ledger row and an empty save for the new player.';

-- Run handle_new_user() once for every new player.
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
