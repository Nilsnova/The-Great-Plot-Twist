-- =============================================================================
-- 20261106000000_foundation.sql
--
-- WHAT IT DOES
--   The first database migration for "The Great Plot Twist". It creates the
--   seven tables that every feature shares, the rules that decide who may see
--   or change each row, the rights of each database role, and four functions.
--
--     profiles             one row per player (display name only)
--     saves                one row per player (game progress)
--     wallets              one row per player (coin balance)
--     wallet_reasons       the list of reasons a balance may change, each with
--                          a direction (earn, spend or either)
--     wallet_transactions  the ledger: one row for every change to a wallet
--     crews                one row per crew (a team of up to four seats)
--     crew_seats           one row per taken seat: a player or an NPC partner
--
-- WHO USES IT
--   You run it once on the Supabase project (the steps are in
--   supabase/README.md). After that, the browser game reads what row-level
--   security allows and the Python server in backend/server/ writes everything:
--   money, progress and crews. This file is the last line of defence: if the
--   game code has a bug, the database still refuses what is not allowed.
--
-- THE FIVE BIG RULES
--   1. Play money only. Coins cannot be bought, cashed out or exchanged for
--      real prizes. A new player starts with 0 coins.
--   2. The browser never writes game data. A player can only read: their own
--      wallet, ledger, save and crews, plus the public profile names and the
--      list of wallet reasons. Money, progress and crews are decided by the
--      server.
--   3. Only the server (the Supabase secret key, role "service_role") changes
--      money, and only through apply_wallet_transaction().
--   4. Someone who is not signed in (role "anon") gets nothing at all.
--   5. Nothing is open by accident. Our Supabase project does not hand out
--      rights on new tables automatically, and this file grants every right
--      by hand.
--
-- WHAT IT NEEDS
--   A Supabase project (Postgres 17). Every Supabase project already has the
--   roles anon, authenticated and service_role and the auth schema that this
--   file builds on. It will not run on a plain Postgres database.
--
-- SAFE TO RUN TWICE
--   Tables and indexes use "if not exists", the list of reasons uses "on
--   conflict do nothing", functions and triggers use "create or replace",
--   policies are dropped and created again, and grants and comments simply
--   repeat. A second run changes nothing. If a run stops with an error, fix
--   the cause and run the whole file again.
--
-- HOW THE FILE IS ORGANISED
--    1. Helper function touch_updated_at()
--    2. Table profiles
--    3. Table saves
--    4. Table wallets
--    5. Table wallet_reasons (why a balance may change)
--    6. Table wallet_transactions (the ledger)
--    7. Tables crews and crew_seats, and the helper is_crew_member()
--    8. Row-level security: who may see or change which row
--    9. Table privileges: which roles may use which table at all
--   10. Function apply_wallet_transaction(): the only way money moves
--   11. Function handle_new_user() and its trigger: starter rows at sign-up
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Helper function touch_updated_at()
-- -----------------------------------------------------------------------------
-- Triggers on saves, wallets and crews call this just before a row is written.
-- It sets updated_at to the current time, so nobody can send a fake "last
-- saved" time.

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
-- the display name and nothing personal: no e-mail address, no GitHub login.
-- Rows are created by handle_new_user() when someone signs up (section 11).
--
-- At sign-up every player gets the same kind of neutral placeholder name:
-- "Captain-" and the first 6 characters of their id. Names appear on a
-- projector, so they must never come from the login details. A later package
-- (A2) generates real captain names on the server and writes them here. The
-- rules below guard that name, whoever writes it. Players cannot rename
-- themselves, because the browser has no right to write to this table
-- (section 9).
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
  'One row per player. Public information that other players may see: the display name. No e-mail address, login name or other personal data is stored here. Players can read all profiles but cannot change them. Only the server writes them.';
comment on column public.profiles.id is
  'Same id as the player in Supabase Auth (auth.users). Deleting the auth user deletes this row too.';
comment on column public.profiles.display_name is
  'Name shown to other players. At sign-up a neutral placeholder: Captain- and the first 6 characters of the player id. The server later replaces it with a generated captain name. 2 to 24 characters: letters A-Z, digits, space, underscore, dot, hyphen. No space at the start or end. Not unique. Players cannot change it.';
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
-- One wallet per player, shared by every money feature.
-- Players can only read it. Only apply_wallet_transaction() changes it. The
-- sign-up trigger creates it, and no role may create or delete a wallet by hand
-- (see section 9).
--
-- The starting balance is 0, the column default below. The first coins arrive
-- later, when the intro hands out the entry kit (reason kit_grant). The Python
-- code has the same number as STARTING_BALANCE; keep the two in step. A test
-- (backend/server/tests/test_wallet_matches_migration.py) fails if they differ.

create table if not exists public.wallets (
  player_id  uuid primary key references public.profiles (id) on delete cascade,
  balance    bigint not null default 0,
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
  'Coins the player owns right now. Never below 0. A new wallet starts with 0 coins (STARTING_BALANCE in the Python code). The first coins come from the intro entry kit (reason kit_grant).';
comment on column public.wallets.updated_at is
  'When the balance last changed. Set by the database.';


-- -----------------------------------------------------------------------------
-- 5. Table wallet_reasons: why a balance may change
-- -----------------------------------------------------------------------------
-- The list of allowed reasons, one row per reason. Every ledger row must name
-- one of them (a foreign key, section 6), and apply_wallet_transaction() reads
-- the direction from here:
--
--   earn     the reason adds coins, so the amount must be above 0
--   spend    the reason takes coins away, so the amount must be below 0
--   either   the amount may go either way, but never 0
--
-- To add a reason later, write a new migration with one INSERT into this table,
-- and add the same (reason, direction) pair at the end of WALLET_REASONS in
-- backend/server/wallet.py in the same pull request. Never rename a reason or
-- change its direction: ledger rows already point at it.
--
-- A test (backend/server/tests/test_wallet_matches_migration.py) reads the
-- INSERT below and fails if it differs from the Python list.

create table if not exists public.wallet_reasons (
  reason      text primary key,
  direction   text not null,
  description text not null,

  constraint wallet_reasons_direction_allowed
    check (direction in ('earn', 'spend', 'either'))
);

-- The first eight reasons, in the same order as WALLET_REASONS in
-- backend/server/wallet.py. "on conflict do nothing" makes a second run of
-- this file harmless. Write each description without an apostrophe, because
-- the test reads this list.
insert into public.wallet_reasons (reason, direction, description) values
  ('kit_grant',         'earn',   'Coins that come with the entry kit the intro gives a new player.'),
  ('clue_reward',       'earn',   'Coins for a clue a player found or pinned.'),
  ('mystery_reward',    'earn',   'Coins for a deduction or for solving the whole mystery.'),
  ('event_reward',      'earn',   'Coins from a special event in the world.'),
  ('cargo_sale',        'earn',   'Coins from selling cargo.'),
  ('clue_purchase',     'spend',  'Coins paid to buy a clue.'),
  ('building_purchase', 'spend',  'Coins paid to build on a home islet.'),
  ('admin_adjust',      'either', 'A manual correction by an admin. May add or take away coins.')
on conflict (reason) do nothing;

comment on table public.wallet_reasons is
  'The list of reasons a wallet balance may change. Every ledger row names one of them. Each reason has a direction that apply_wallet_transaction() checks. Players can read the list. Nobody changes it at run time: a new reason arrives with a new migration.';
comment on column public.wallet_reasons.reason is
  'Short name of the reason: lowercase words joined by underscores, for example kit_grant. Never renamed, because ledger rows point at it.';
comment on column public.wallet_reasons.direction is
  'earn: the amount must be above 0. spend: the amount must be below 0. either: the amount may go either way, but never 0. Never changed after the first migration that adds the reason.';
comment on column public.wallet_reasons.description is
  'One plain-English line: what the reason is for.';


-- -----------------------------------------------------------------------------
-- 6. Table wallet_transactions: the ledger
-- -----------------------------------------------------------------------------
-- One row for every change to a wallet, and no row is ever edited afterwards:
-- no role has the right to update or delete a ledger row (see section 9). Rows
-- disappear only when their player is deleted (cascade).
-- If a balance looks wrong, this table tells the story of how it got there.
-- Rows are added only by apply_wallet_transaction(). The sign-up trigger adds
-- none, because every wallet starts at 0.

create table if not exists public.wallet_transactions (
  id            bigint generated always as identity primary key,
  player_id     uuid not null references public.profiles (id) on delete cascade,
  delta         bigint not null,
  reason        text not null,
  ref           text not null,
  balance_after bigint not null,
  created_at    timestamptz not null default now(),

  constraint wallet_transactions_delta_not_zero
    check (delta <> 0),
  -- The reason must be a row in wallet_reasons (section 5). That is how the
  -- ledger refuses an unknown reason, even if the code that wrote the row has
  -- a bug. Whether the sign of delta fits the direction of the reason is
  -- checked by apply_wallet_transaction() (section 10), because a table rule
  -- cannot look into another table.
  constraint wallet_transactions_reason_fkey
    foreign key (reason) references public.wallet_reasons (reason),
  -- Every row needs a ref (the column is not null), and it must hold more than
  -- spaces. The unique index below can only protect a repeated request if
  -- every row has a ref.
  constraint wallet_transactions_ref_not_blank
    check (char_length(btrim(ref)) > 0),
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
-- balance change is rolled back, so nobody pays or is paid twice. Every row has
-- a ref (the column is not null), so every row is covered, and a coin change
-- without a ref is refused. The entry kit, for example, is always paid with the
-- same ref, so it is paid once.
create unique index if not exists wallet_transactions_one_row_per_ref
  on public.wallet_transactions (player_id, reason, ref);

comment on table public.wallet_transactions is
  'The ledger: one row for every change to a wallet, never edited afterwards. Players can read their own rows. Rows are added only by apply_wallet_transaction(). The same player, reason and ref can appear only once.';
comment on column public.wallet_transactions.id is
  'Running number in the order the changes were applied. Order the rows of a player by id, never by created_at.';
comment on column public.wallet_transactions.player_id is
  'The player whose wallet changed.';
comment on column public.wallet_transactions.delta is
  'Coins added (positive) or taken away (negative). Never 0. The sign must fit the direction of the reason (see wallet_reasons). apply_wallet_transaction() checks that.';
comment on column public.wallet_transactions.reason is
  'Why the balance changed. Must be one of the reasons in public.wallet_reasons (a foreign key).';
comment on column public.wallet_transactions.ref is
  'Link to what caused the change, for example an order or a clue id. Required: never empty or blank, and at most 120 characters. For one player and one reason the same ref can be used only once, so a repeated request cannot pay twice.';
comment on column public.wallet_transactions.balance_after is
  'The wallet balance right after this transaction. Never below 0.';
comment on column public.wallet_transactions.created_at is
  'When the database transaction that wrote the row started. A transaction can wait for a lock, so a row with a higher id can have an earlier created_at. To order rows, use id.';


-- -----------------------------------------------------------------------------
-- 7. Tables crews and crew_seats, and the helper is_crew_member()
-- -----------------------------------------------------------------------------
-- A crew is a team of up to four seats. Every seat that is taken holds either
-- a player or an NPC partner, a crew mate that the game runs itself. That is
-- how the game stays playable alone: a player who starts solo sits in seat 1
-- and NPC partners fill the other seats. A seat that nobody holds has no row.
--
-- Only the server writes these tables. A player can read a crew and its seats
-- only if they hold a seat in that crew (section 8).
--
-- "One active crew per player" is enforced by the server, not by the database
-- (for now). The server checks it before it seats a player. If that proves
-- not to be enough, a later migration can add a database rule.

create table if not exists public.crews (
  id         uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles (id) on delete cascade,
  mode       text not null,
  status     text not null default 'forming',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint crews_mode_allowed
    check (mode in ('solo', 'crew')),
  constraint crews_status_allowed
    check (status in ('forming', 'active', 'finished'))
);

-- Whenever a crew is written, stamp updated_at with the server time.
create or replace trigger crews_touch_updated_at
  before insert or update on public.crews
  for each row execute function public.touch_updated_at();

-- Helps the database find the crews of a player when that player is deleted.
create index if not exists crews_created_by_idx
  on public.crews (created_by);

comment on table public.crews is
  'One row per crew: a team of up to four seats. Players can read only the crews they sit in. Only the server writes crews. The server, not the database, makes sure a player has at most one active crew.';
comment on column public.crews.id is
  'Random id of the crew, made by the database.';
comment on column public.crews.created_by is
  'The player who started the crew. If that player is deleted, the crew and its seats are deleted too.';
comment on column public.crews.mode is
  'solo: one player, with NPC partners in the other seats. crew: several players, with NPC partners in any seats left empty.';
comment on column public.crews.status is
  'forming: still gathering players. active: playing. finished: done. A new crew starts as forming.';
comment on column public.crews.created_at is
  'When the crew was created.';
comment on column public.crews.updated_at is
  'When the crew was last changed. Set by the database.';

-- One row per taken seat. The pair (crew_id, seat_no) is the primary key, so a
-- seat number can be used only once in a crew.
--
-- player_id is "on delete cascade": if a player is deleted, their seat row goes
-- with them, and the seat is empty again. It is NOT "on delete set null",
-- because that would leave a row with no player and no NPC, which the
-- crew_seats_player_or_npc rule forbids, and it would block deleting the player.
create table if not exists public.crew_seats (
  crew_id   uuid not null references public.crews (id) on delete cascade,
  seat_no   smallint not null,
  player_id uuid references public.profiles (id) on delete cascade,
  npc_id    text,
  kit       text,
  joined_at timestamptz not null default now(),

  primary key (crew_id, seat_no),
  constraint crew_seats_seat_no_range
    check (seat_no between 1 and 4),
  -- The pattern reads: from the start (^) to the end ($), 2 to 40 characters,
  -- each one of: a-z, 0-9, underscore. A missing (null) npc_id passes this rule
  -- on purpose, because the next rule decides when npc_id must be filled in.
  constraint crew_seats_npc_id_format
    check (npc_id ~ '^[a-z0-9_]{2,40}$'),
  -- Exactly one of the two is filled in: a seat holds a player or an NPC
  -- partner, never both and never nobody.
  constraint crew_seats_player_or_npc
    check (num_nonnulls(player_id, npc_id) = 1)
);

-- Helps the database find the seats of a player when that player is deleted,
-- and lets the server ask "which crew does this player sit in?".
create index if not exists crew_seats_player_id_idx
  on public.crew_seats (player_id);

comment on table public.crew_seats is
  'One row per taken seat in a crew (seats 1 to 4). A seat holds a player or an NPC partner. Players can read the seats of the crews they sit in. Only the server writes seats.';
comment on column public.crew_seats.crew_id is
  'The crew this seat belongs to. Deleting the crew deletes its seats.';
comment on column public.crew_seats.seat_no is
  'Seat number from 1 to 4. With crew_id it is the primary key, so each seat number appears once per crew.';
comment on column public.crew_seats.player_id is
  'The player who sits here, or empty if an NPC partner sits here. Exactly one of player_id and npc_id is filled in. If the player is deleted, this seat row is deleted too.';
comment on column public.crew_seats.npc_id is
  'The NPC partner who sits here, or empty if a player sits here. 2 to 40 characters: lowercase letters, digits, underscore. The game, not a person, runs this crew mate.';
comment on column public.crew_seats.kit is
  'The entry kit this seat carries. Written by the server. The database sets no format rule yet: the package that defines the kits adds one.';
comment on column public.crew_seats.joined_at is
  'When the seat was taken.';

-- Does the signed-in player sit in this crew? The policies on crews and
-- crew_seats (section 8) ask this question.
--
-- Why a function and not a plain sub-query inside the policy: the policy on
-- crew_seats would have to read crew_seats, which would apply the same policy
-- again, and so on without end (Postgres stops that with an error). This
-- function runs with the rights of its owner (SECURITY DEFINER), so its own
-- read of crew_seats skips the policy. That breaks the loop.
--
-- It is safe because it only ever answers for the caller: it compares with
-- auth.uid() (the signed-in player) and not with an id that the caller sends.
-- So it cannot be used to find out who sits in somebody else's crew.
create or replace function public.is_crew_member(p_crew_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
  select exists (
    select 1
      from public.crew_seats
     where crew_id = p_crew_id
       and player_id = (select auth.uid())
  );
$$;

-- Only signed-in players need it, because only their queries run the policies.
-- The server skips row-level security and never calls it.
revoke all on function public.is_crew_member(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.is_crew_member(uuid)
  to authenticated;

comment on function public.is_crew_member(uuid) is
  'True if the signed-in player (auth.uid()) holds a seat in the crew p_crew_id. Used by the read policies on crews and crew_seats. SECURITY DEFINER, so its own read of crew_seats skips row-level security and the policies cannot loop. It answers only for the caller. Only authenticated may run it.';


-- -----------------------------------------------------------------------------
-- 8. Row-level security (RLS): who may see or change which row
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
--   * Every policy is a read policy (select). There is no policy for insert,
--     update or delete on any table, so players can never write anything:
--     not progress, not money, not their name, not crews. The browser only
--     reads. The server does all the writing.
--   * The server key (service_role) skips RLS completely. That is why it must
--     never leave the server.

alter table public.profiles            enable row level security;
alter table public.saves               enable row level security;
alter table public.wallets             enable row level security;
alter table public.wallet_reasons      enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.crews               enable row level security;
alter table public.crew_seats          enable row level security;

-- profiles: every signed-in player may read every profile, because display
-- names are shown to other players.
drop policy if exists "Players can read all profiles" on public.profiles;
create policy "Players can read all profiles"
  on public.profiles for select to authenticated
  using (true);
comment on policy "Players can read all profiles" on public.profiles is
  'Any signed-in player may read every profile, because display names are shown to other players. Nobody except the server can write to profiles.';

-- No insert, update or delete policy on profiles: the sign-up trigger creates
-- profiles, the server renames them, and players cannot change or delete them.

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

-- wallet_reasons: every signed-in player may read the whole list, for example
-- to show why a balance changed.
drop policy if exists "Players can read all wallet reasons" on public.wallet_reasons;
create policy "Players can read all wallet reasons"
  on public.wallet_reasons for select to authenticated
  using (true);
comment on policy "Players can read all wallet reasons" on public.wallet_reasons is
  'Any signed-in player may read the list of wallet reasons. Nobody can change it at run time.';

-- No insert, update or delete policy on wallet_reasons: new reasons arrive
-- with a new migration.

-- wallet_transactions: a player may read only their own ledger rows.
drop policy if exists "Players can read their own transactions" on public.wallet_transactions;
create policy "Players can read their own transactions"
  on public.wallet_transactions for select to authenticated
  using (player_id = (select auth.uid()));
comment on policy "Players can read their own transactions" on public.wallet_transactions is
  'A signed-in player may read only their own ledger rows. Nobody except the server can add rows.';

-- No insert, update or delete policy on wallet_transactions: only the server
-- adds ledger rows, through apply_wallet_transaction().

-- crews: a player may read a crew only if they sit in it.
drop policy if exists "Players can read the crews they sit in" on public.crews;
create policy "Players can read the crews they sit in"
  on public.crews for select to authenticated
  using (public.is_crew_member(id));
comment on policy "Players can read the crews they sit in" on public.crews is
  'A signed-in player may read a crew only if they hold a seat in it. Nobody except the server can write to crews.';

-- crew_seats: a player may read all seats of a crew they sit in, so they can
-- see who sits next to them. They cannot see the seats of any other crew.
drop policy if exists "Players can read the seats of their crews" on public.crew_seats;
create policy "Players can read the seats of their crews"
  on public.crew_seats for select to authenticated
  using (public.is_crew_member(crew_id));
comment on policy "Players can read the seats of their crews" on public.crew_seats is
  'A signed-in player may read the seats of a crew only if they hold a seat in that crew. Nobody except the server can write to seats.';

-- No insert, update or delete policy on crews and crew_seats: the server
-- creates crews, seats players and NPC partners and changes their status.


-- -----------------------------------------------------------------------------
-- 9. Table privileges: which roles may use which table at all
-- -----------------------------------------------------------------------------
-- This is the second lock, next to RLS. Our Supabase project does not expose
-- new tables automatically ("Automatically expose new tables" is off), so a
-- new table starts with no rights for anybody. But we do not rely on a project
-- setting: on a project where it is on, Supabase would give every role full
-- access to new tables, functions and sequences and let RLS decide. So first
-- we take everything away, then we hand back only what each role needs. The
-- file behaves the same either way. Even if a policy were wrong, a missing
-- privilege still stops the action.
--
--   anon           nothing
--   authenticated  read only, on all seven tables (RLS then limits the rows:
--                  all profiles and all reasons, but only the player's own
--                  save, wallet, ledger rows, crews and seats)
--   service_role   the server (it bypasses RLS):
--                    profiles, saves, crews, crew_seats   read, insert, update, delete
--                    wallets              read, update (no insert, no delete)
--                    wallet_transactions  read, insert (no update, no delete)
--                    wallet_reasons       read only (reasons arrive by migration)

revoke all on table
  public.profiles,
  public.saves,
  public.wallets,
  public.wallet_reasons,
  public.wallet_transactions,
  public.crews,
  public.crew_seats
from public, anon, authenticated, service_role;

-- The ledger's id counter (the sequence behind the identity column "id"). An
-- identity column needs no rights on its counter, but a Supabase project that
-- exposes new objects hands out rights on new sequences to every role. Without
-- this line anybody could move the counter, and then every money call would
-- fail. No other table of ours has a counter: crews use random ids.
revoke all on sequence public.wallet_transactions_id_seq
from public, anon, authenticated, service_role;

-- Signed-in players. They only read. RLS decides which rows they see.
grant select on table
  public.profiles,
  public.saves,
  public.wallets,
  public.wallet_reasons,
  public.wallet_transactions,
  public.crews,
  public.crew_seats
to authenticated;

-- The server (Supabase secret key). It owns profiles, saves and crews.
grant select, insert, update, delete on table
  public.profiles,
  public.saves,
  public.crews,
  public.crew_seats
to service_role;

-- A wallet is created only by the sign-up trigger and goes away only when its
-- player is deleted, so the server may read and update it but not insert or
-- delete. UPDATE is needed because apply_wallet_transaction() runs with the
-- rights of its caller. By team rule the server never updates a wallet
-- directly: a direct update skips the ledger row.
grant select, update on table public.wallets to service_role;

-- The ledger is append-only: the server may read it and add rows (the money
-- function does that), but never edit or delete a row. Rows disappear only when
-- their player is deleted (cascade).
grant select, insert on table public.wallet_transactions to service_role;

-- The list of reasons: the money function reads it. The server never writes it.
grant select on table public.wallet_reasons to service_role;


-- -----------------------------------------------------------------------------
-- 10. Function apply_wallet_transaction(): the only way money moves
-- -----------------------------------------------------------------------------
-- The server calls this for every coin movement (an entry kit, a reward, a
-- purchase, a sale).
--
--   p_player_id  whose wallet changes
--   p_delta      coins to add (positive) or take away (negative); never 0
--   p_reason     one of the reasons in wallet_reasons
--   p_ref        what caused the change, for example an order id (max 120
--                characters). It cannot be left out or be blank: the same
--                player, reason and ref can be used only once, and that is what
--                makes a repeated request safe.
--
-- It returns the new balance.
--
-- Why it is safe:
--   * It looks the reason up in wallet_reasons. An unknown reason stops the
--     call with the error "unknown_reason".
--   * The sign of p_delta must fit the direction of the reason: an "earn"
--     reason needs more than 0, a "spend" reason needs less than 0, an
--     "either" reason needs anything but 0. Otherwise the call stops with the
--     error "wrong_direction". A missing amount counts as wrong too.
--   * One single UPDATE both checks the balance and changes it. The database
--     locks the wallet row while it works, so two requests at the same moment
--     can never spend the same coins twice.
--   * If the balance would drop below 0, nothing changes and the call stops
--     with the error "insufficient_funds".
--   * If the player has no wallet, the call stops with "wallet_not_found".
--   * The ledger row is written in the same transaction. A broken table rule
--     cancels the whole call, including the balance change. Either both happen
--     or neither does. The rules that can still cancel a call at that point
--     are: a ref that is missing, blank or too long, and a repeat (the same
--     player, reason and ref as an earlier call).
--   * Only service_role may run it (grants at the end of this section).
--   * It is not SECURITY DEFINER on purpose. It runs with the rights of the
--     caller, so even if someone granted it by mistake later, a player would
--     still be stopped by the table privileges and RLS above.

create or replace function public.apply_wallet_transaction(
  p_player_id uuid,
  p_delta     bigint,
  p_reason    text,
  p_ref       text
)
returns bigint
language plpgsql
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_direction text;
  v_balance   bigint;
begin
  -- Step 1: look the reason up. It must be in the list.
  select direction
    into v_direction
    from public.wallet_reasons
   where reason = p_reason;

  if not found then
    raise exception 'unknown_reason';
  end if;

  -- Step 2: the sign of the amount must fit the direction of the reason.
  -- A missing (null) amount fits none of them.
  if p_delta is null
     or (v_direction = 'earn'   and p_delta <= 0)
     or (v_direction = 'spend'  and p_delta >= 0)
     or (v_direction = 'either' and p_delta = 0) then
    raise exception 'wrong_direction';
  end if;

  -- Step 3: change the balance, but only if the result is not below zero.
  update public.wallets
     set balance = balance + p_delta
   where player_id = p_player_id
     and balance + p_delta >= 0
  returning balance into v_balance;

  -- Step 4: no row was updated. Find out why and say so.
  if not found then
    if exists (select 1 from public.wallets where player_id = p_player_id) then
      raise exception 'insufficient_funds';
    else
      raise exception 'wallet_not_found';
    end if;
  end if;

  -- Step 5: write the ledger row. The table rules are checked here.
  insert into public.wallet_transactions (player_id, delta, reason, ref, balance_after)
  values (p_player_id, p_delta, p_reason, p_ref, v_balance);

  return v_balance;
end;
$$;

-- A Supabase project that exposes new objects hands out run rights to
-- everybody. We take them back from each role by name and give them to the
-- server only.
revoke all on function public.apply_wallet_transaction(uuid, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.apply_wallet_transaction(uuid, bigint, text, text)
  to service_role;

comment on function public.apply_wallet_transaction(uuid, bigint, text, text) is
  'The only way money moves. Adds p_delta (positive or negative) to the wallet of p_player_id and writes the ledger row, all in one step. Returns the new balance. Raises unknown_reason if the reason is not in wallet_reasons, and wrong_direction if the sign of p_delta does not fit the direction of the reason (or p_delta is 0 or missing). Raises insufficient_funds if the balance would go below 0, and wallet_not_found if the player has no wallet. Fails with a constraint error, and changes nothing, if the ref is missing, blank or too long, or the same player, reason and ref were used before. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 11. Function handle_new_user() and its trigger: starter rows at sign-up
-- -----------------------------------------------------------------------------
-- When someone signs up, Supabase Auth adds a row to auth.users. The trigger
-- below then runs this function, which creates everything the player needs:
--
--   1. a profile with a neutral placeholder name ("Captain-" and the first 6
--      characters of the player id)
--   2. a wallet with 0 coins (the column default)
--   3. an empty save
--
-- Four details worth knowing:
--   * The name never comes from the login details (GitHub login, e-mail
--     address or anything else in auth.users). Names appear on a projector,
--     and a player controls their own login details. A later package (A2)
--     generates real captain names on the server.
--   * There is no ledger row, because the wallet starts at 0. The first coins
--     arrive through the entry kit (reason kit_grant).
--   * SECURITY DEFINER means the function runs with the rights of its owner,
--     not of the person signing up. It has to, because a brand-new player
--     has no right to write to these tables.
--   * If this function fails, the sign-up fails. So it must never fail. The
--     placeholder name always passes the profile rules: it has 14 characters,
--     and the part taken from the id is hexadecimal digits.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  -- How many characters of the player id the placeholder name uses.
  c_id_length constant integer := 6;
begin
  insert into public.profiles (id, display_name)
  values (new.id, 'Captain-' || left(new.id::text, c_id_length));

  insert into public.wallets (player_id)
  values (new.id);

  insert into public.saves (player_id)
  values (new.id);

  return new;
end;
$$;

-- Nobody calls this function directly. Only the trigger below runs it.
revoke all on function public.handle_new_user()
  from public, anon, authenticated, service_role;

comment on function public.handle_new_user() is
  'Runs after a new row appears in auth.users. Creates the profile with a neutral placeholder name (Captain- and the first 6 characters of the player id, never taken from the login details), a wallet with 0 coins and an empty save for the new player. Writes no ledger row.';

-- Run handle_new_user() once for every new player.
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
