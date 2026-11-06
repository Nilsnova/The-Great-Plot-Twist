-- =============================================================================
-- 20261106070000_home_islet.sql
--
-- WHAT IT DOES
--   The database part of the home islet (package L2): every player's own islet,
--   with the timber they hold and the buildings that stand on it. It adds two
--   tables and one function. It adds no wallet reason: a building is paid with
--   the reason building_purchase, which the foundation migration already has.
--
--     islets            one row per player who has built something: the timber
--                       the player holds. The first build makes the row, and it
--                       starts with the starter pack of timber.
--     islet_buildings   one row per building that stands on a player's islet
--
--     islet_build()     the only way a building goes up: it takes the coins
--                       (through apply_wallet_transaction), takes the timber
--                       and records the building in ONE step
--
-- WHO USES IT
--   You run it once on the Supabase project, AFTER the foundation migration
--   (20261106000000_foundation.sql), because it uses the profiles and wallets
--   tables, the function apply_wallet_transaction() and the helper
--   touch_updated_at() from there. It needs nothing from the other migrations
--   (apply the files oldest time stamp first, as always). The steps are in
--   supabase/README.md. After that the Python server (backend/server/game/)
--   does all the writing, with the secret key. The browser may only read its
--   own islet and its own buildings.
--
-- THE RULES THAT THE DATABASE KEEPS
--   1. Play money only. Coins cannot be bought, cashed out or exchanged for real
--      prizes.
--   2. The browser never writes. Players can read; every write goes through the
--      server (rule D003, docs/DECISIONS.md).
--   3. Coins move only through apply_wallet_transaction() (the foundation file).
--      islet_build() calls it, so a build follows the same rules as every other
--      coin change: a known reason, the right direction, never below 0 coins,
--      and every change has a ref that can be used only once.
--   4. A build is all or nothing. Either the coins, the timber and the building
--      change together, or nothing changes.
--   5. One building per plot, and each plot holds only its own kind of building.
--   6. Timber never goes below 0.
--   7. Someone who is not signed in (role "anon") gets nothing at all.
--
--   The prices and the starter pack of timber live in backend/content/buildings.json.
--   The server passes them in, like the price of an Island Exchange trade (see
--   "what the server may do" in supabase/README.md). The database does not repeat
--   them: it compares against what it is given. The rules about which building
--   may be built on which plot, and whether a spot can be built yet, live in
--   Python (backend/server/game/building.py). The database enforces what depends
--   on what a player did before (is the plot taken? is there enough timber?),
--   because only the database sees two requests at the same moment.
--
-- WHAT IT NEEDS
--   The foundation migration (tables profiles and wallets, the function
--   apply_wallet_transaction(), the helper touch_updated_at() and the wallet
--   reason building_purchase). A Supabase project has the roles anon,
--   authenticated and service_role already.
--
-- SAFE TO RUN TWICE
--   Tables and indexes use "if not exists", functions and triggers use "create
--   or replace", policies are dropped and created again, and grants and
--   comments simply repeat. A second run changes nothing.
--
-- HOW THE FILE IS ORGANISED
--   1. Table islets (the timber each player holds)
--   2. Table islet_buildings (the buildings that stand)
--   3. Row-level security: who may see which row
--   4. Table privileges: which roles may use which table at all
--   5. Function islet_build()
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Table islets: the timber each player holds
-- -----------------------------------------------------------------------------
-- One row per player, made by that player's first build. It holds the timber:
-- whole pieces, never below 0. Timber is not coins, so it has no ledger. Every
-- player gets a starter pack once, when the row is made, and each building takes
-- its timber from the row.
--
-- A player who has not built yet has no row. The server shows the starter pack
-- until then, and islet_build() makes the row with the same number, so what the
-- player saw is what the player gets. The primary key allows one row per player,
-- so the starter pack can arrive only once.
--
-- Nobody but islet_build() changes timber (section 4 lists who may do what).

create table if not exists public.islets (
  player_id  uuid primary key references public.profiles (id) on delete cascade,
  timber     integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint islets_timber_not_negative
    check (timber >= 0)
);

-- Whenever the timber changes, stamp updated_at with the server time.
create or replace trigger islets_touch_updated_at
  before insert or update on public.islets
  for each row execute function public.touch_updated_at();

comment on table public.islets is
  'One row per player who has built on their home islet: the timber the player holds. Made by islet_build() on the first build, with the starter pack of timber. Players can read only their own row. Only islet_build() writes it.';
comment on column public.islets.player_id is
  'The player this islet belongs to. It is also the primary key, so there is exactly one islet row per player and the starter pack arrives only once. Deleting the player deletes the row.';
comment on column public.islets.timber is
  'Whole pieces of timber the player holds. Never below 0. Not coins, so there is no ledger row: islet_buildings.timber_paid records what each building took.';
comment on column public.islets.created_at is
  'When the islet row was made, which is when the player built for the first time.';
comment on column public.islets.updated_at is
  'When the timber last changed. Set by the database.';


-- -----------------------------------------------------------------------------
-- 2. Table islet_buildings: the buildings that stand
-- -----------------------------------------------------------------------------
-- One row per building that stands on a player's islet. The islet has five
-- spots (plots). The cabin on plot_1 stands from the start and has no row. The
-- other four spots hold one kind of building each, so the pair (plot,
-- building_type) is checked below. The list of pairs repeats
-- backend/content/buildings.json, and a test keeps the two equal. Adding a spot
-- later needs a new migration that replaces this check.
--
-- The primary key is (player_id, plot): one building per plot. The ref is
-- "islet:" plus the id the browser made for the click (actionUid). A player can
-- use a ref only once, so a repeated request cannot build or charge twice. The
-- wallet ledger row of the build carries the same ref.
--
-- No role can edit or delete a row (section 4). A building is never removed in
-- this version, and the finale counts on that: once a player has a signal
-- station, they have it for good. Rows disappear only when their player is
-- deleted. The check on level allows levels 2 and 3 for the upgrades of a later
-- migration, but islet_build() writes only level 1.

create table if not exists public.islet_buildings (
  player_id     uuid not null references public.islets (player_id) on delete cascade,
  plot          text not null,
  building_type text not null,
  level         smallint not null,
  coins_paid    bigint not null,
  timber_paid   integer not null,
  ref           text not null,
  built_at      timestamptz not null default now(),

  primary key (player_id, plot),
  constraint islet_buildings_plot_fits_building
    check ((plot, building_type) in (
      ('plot_2', 'workshop'),
      ('plot_3', 'windmill'),
      ('plot_4', 'greenhouse'),
      ('islet_signal_station', 'signal_station')
    )),
  constraint islet_buildings_level_range
    check (level between 1 and 3),
  -- The biggest price is the biggest change the wallet allows (MAX_DELTA in
  -- backend/server/wallet.py). A test keeps the two numbers equal.
  constraint islet_buildings_coins_paid_range
    check (coins_paid between 1 and 1000000),
  constraint islet_buildings_timber_paid_not_negative
    check (timber_paid >= 0),
  constraint islet_buildings_ref_not_blank
    check (char_length(btrim(ref)) > 0),
  constraint islet_buildings_ref_max_length
    check (char_length(ref) <= 120)
);

-- One building per player and ref. This makes a repeated request safe.
create unique index if not exists islet_buildings_one_row_per_ref
  on public.islet_buildings (player_id, ref);

comment on table public.islet_buildings is
  'One row per building that stands on a home islet. The cabin stands from the start and has no row. Never edited or deleted in this version. Players can read only their own rows. Only islet_build() adds rows. The same player and ref can appear only once.';
comment on column public.islet_buildings.player_id is
  'The player whose islet the building stands on. With plot it is the primary key, so a plot holds one building. Deleting the islet deletes this row.';
comment on column public.islet_buildings.plot is
  'The spot of the islet, as written in backend/content/buildings.json and in the place registry: plot_2, plot_3, plot_4 or islet_signal_station. The cabin spot plot_1 has no row.';
comment on column public.islet_buildings.building_type is
  'What stands on the plot: workshop, windmill, greenhouse or signal_station. Each plot holds only its own kind of building (a check rule). The finale counts the rows of type signal_station.';
comment on column public.islet_buildings.level is
  'The level of the building, from 1 to 3. islet_build() builds level 1. Levels 2 and 3 come with the upgrades of a later migration.';
comment on column public.islet_buildings.coins_paid is
  'Whole coins the player paid for the building, at least 1. The wallet ledger has the matching row (reason building_purchase, the same ref).';
comment on column public.islet_buildings.timber_paid is
  'Whole pieces of timber the building took from the islet. Timber has no ledger, so this column is the only record of it.';
comment on column public.islet_buildings.ref is
  'islet: plus the actionUid the browser made for the click, at most 120 characters. For one player the same ref can be used only once, so a repeated request cannot build or charge twice. The wallet ledger row of the build uses the same ref.';
comment on column public.islet_buildings.built_at is
  'When the database transaction of the build started.';


-- -----------------------------------------------------------------------------
-- 3. Row-level security (RLS): who may see which row
-- -----------------------------------------------------------------------------
-- Same plan as the foundation file: all policies are for "authenticated" and
-- are read policies. There is no policy for insert, update or delete, so no
-- player can write. "anon" has no policy, so it gets nothing.

alter table public.islets          enable row level security;
alter table public.islet_buildings enable row level security;

-- islets: a player may read only their own islet. Islets are private: other
-- players cannot read yours.
drop policy if exists "Players can read their own islet" on public.islets;
create policy "Players can read their own islet"
  on public.islets for select to authenticated
  using (player_id = (select auth.uid()));
comment on policy "Players can read their own islet" on public.islets is
  'A signed-in player may read only their own islet row (the timber). Nobody except the server can write it.';

-- islet_buildings: a player may read only the buildings on their own islet.
drop policy if exists "Players can read their own islet buildings" on public.islet_buildings;
create policy "Players can read their own islet buildings"
  on public.islet_buildings for select to authenticated
  using (player_id = (select auth.uid()));
comment on policy "Players can read their own islet buildings" on public.islet_buildings is
  'A signed-in player may read only the buildings on their own islet. Nobody except the server can add rows.';

-- No insert, update or delete policy on either table: the browser never writes
-- game data.


-- -----------------------------------------------------------------------------
-- 4. Table privileges: which roles may use which table at all
-- -----------------------------------------------------------------------------
-- The second lock, as in the foundation file. First take everything away from
-- every role (this also makes the file behave the same on a project that hands
-- out rights to new tables by itself), then give back only what is needed.
--
--   anon           nothing
--   authenticated  read only (RLS then limits the rows)
--   service_role   the server:
--                    islets           read, insert, update   (the first build makes the row,
--                                                             every build changes the timber;
--                                                             never deleted by hand)
--                    islet_buildings  read, insert           (a building is never edited or
--                                                             deleted in this version)
--
-- Neither table has an identity column, so there is no counter to revoke.

revoke all on table public.islets, public.islet_buildings
from public, anon, authenticated, service_role;

grant select on table public.islets, public.islet_buildings to authenticated;

grant select, insert, update on table public.islets to service_role;
grant select, insert on table public.islet_buildings to service_role;


-- -----------------------------------------------------------------------------
-- 5. Function islet_build(): the only way a building goes up
-- -----------------------------------------------------------------------------
-- The server checks what it can check alone (which building belongs on which
-- plot, and whether the spot can be built yet: backend/server/game/building.py)
-- and takes the prices from backend/content/buildings.json. Then it calls this.
-- In ONE transaction the function:
--
--   1. checks the arguments it is given: none may be missing, the coins must be
--      at least 1, and the timber and the starter pack cannot be negative,
--   2. locks the player's wallet row, so one player's builds and trades happen
--      one at a time. The wallet is always locked before the islet, in every
--      money function (market_trade() does the same), so two of them can never
--      wait for each other in a circle,
--   3. refuses a repeated ref,
--   4. makes the islet row with the starter pack if the player has none yet, and
--      locks it,
--   5. refuses a plot that already holds a building,
--   6. refuses the build if the player holds too little timber,
--   7. takes the coins with apply_wallet_transaction() (reason
--      building_purchase), and
--   8. takes the timber and writes the building row (level 1).
--
--   p_player_id       whose wallet, timber and islet change
--   p_plot            the plot to build on
--   p_building_type   the building. The check rule of islet_buildings refuses a
--                     pair that does not belong together
--   p_coins           the price in coins, at least 1
--   p_timber          the price in timber, 0 or more
--   p_starter_timber  the timber every player starts with. Used only when the
--                     islet row is made
--   p_ref             'islet:' plus the id the browser made for the click
--
-- It returns a JSON object:
--   {"status": "done", "balance": ..., "timber": ..., "level": 1}
--   {"status": "refused", "reason": ...} when a rule says no. The wallet and the
--       buildings were not changed.
--       reason "player_not_set_up"  the player has no wallet
--       reason "plot_occupied"      also "standing", the building that is there
--       reason "not_enough_timber"  also "timberHeld", the timber the player holds
--
-- Real failures raise an error and change nothing:
--   * insufficient_funds, unknown_reason, wrong_direction: from the wallet function.
--     insufficient_funds cancels everything, including a new islet row from step 4.
--   * A repeated ref: error code 23505 (unique violation), message already_applied.
--   * bad_build: an argument that makes no sense. That is a bug on the server side,
--     not something a player can cause.
--   * A table rule that is broken, for example a plot and building that do not
--     belong together, or a blank or too long ref. The whole call is rolled back,
--     the coins included.
--
-- Why a refusal is returned and not raised: a raised error cannot carry the
-- reason through the server's database client. A refusal writes nothing that a
-- player could see. The only possible trace is a new islet row that holds
-- exactly the starter pack, which is what the server shows a player who has no
-- row anyway. With the numbers in buildings.json a first build is never refused
-- at step 5 or 6, so in practice a refused call leaves no row behind.
--
-- It is not SECURITY DEFINER on purpose. It runs with the rights of its caller,
-- so a player (who has no rights on these tables and no right to run it) is
-- stopped even if it were granted by mistake.

create or replace function public.islet_build(
  p_player_id      uuid,
  p_plot           text,
  p_building_type  text,
  p_coins          bigint,
  p_timber         integer,
  p_starter_timber integer,
  p_ref            text
)
returns jsonb
language plpgsql
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_timber   integer;
  v_standing text;
  v_balance  bigint;
begin
  -- Step 1: the arguments must make sense. None may be missing. A failure here
  -- is a server bug.
  if p_player_id is null
     or p_plot is null
     or p_building_type is null
     or p_coins is null or p_coins < 1
     or p_timber is null or p_timber < 0
     or p_starter_timber is null or p_starter_timber < 0
     or p_ref is null then
    raise exception 'bad_build';
  end if;

  -- Step 2: lock the player's wallet row until the end of this transaction, as
  -- market_trade() does. A second build or a trade of the same player waits here.
  -- (A SELECT ... FOR UPDATE needs the right to update wallets.)
  perform 1 from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  -- Step 3: a repeated ref (the same click again). Say "already applied" with the
  -- unique-violation code (23505), the same answer the wallet gives, before any
  -- other rule can answer.
  if exists (
    select 1 from public.islet_buildings where player_id = p_player_id and ref = p_ref
  ) then
    raise exception 'already_applied' using errcode = '23505';
  end if;

  -- Step 4: the islet row, made with the starter pack the first time, then locked.
  insert into public.islets (player_id, timber)
  values (p_player_id, p_starter_timber)
  on conflict (player_id) do nothing;

  select timber
    into v_timber
    from public.islets
   where player_id = p_player_id
     for update;

  -- Step 5: one building per plot.
  select building_type
    into v_standing
    from public.islet_buildings
   where player_id = p_player_id and plot = p_plot;
  if found then
    return jsonb_build_object(
      'status', 'refused', 'reason', 'plot_occupied', 'standing', v_standing
    );
  end if;

  -- Step 6: enough timber.
  if v_timber < p_timber then
    return jsonb_build_object(
      'status', 'refused', 'reason', 'not_enough_timber', 'timberHeld', v_timber
    );
  end if;

  -- Step 7: the coins, through the wallet. insufficient_funds cancels everything,
  -- including a new islet row from step 4.
  v_balance := public.apply_wallet_transaction(p_player_id, -p_coins, 'building_purchase', p_ref);

  -- Step 8: take the timber and record the building.
  update public.islets
     set timber = timber - p_timber
   where player_id = p_player_id
  returning timber into v_timber;

  insert into public.islet_buildings
    (player_id, plot, building_type, level, coins_paid, timber_paid, ref)
  values
    (p_player_id, p_plot, p_building_type, 1, p_coins, p_timber, p_ref);

  return jsonb_build_object('status', 'done', 'balance', v_balance, 'timber', v_timber, 'level', 1);
end;
$$;

revoke all on function public.islet_build(uuid, text, text, bigint, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.islet_build(uuid, text, text, bigint, integer, integer, text)
  to service_role;

comment on function public.islet_build(uuid, text, text, bigint, integer, integer, text) is
  'The only way a building goes up on a home islet. In one step: checks the arguments, locks the wallet, refuses a repeated ref (error 23505 already_applied), makes the islet row with the starter pack if the player has none, refuses a plot that holds a building, refuses the build when the player holds too little timber, takes the coins with apply_wallet_transaction() (reason building_purchase), takes the timber and writes the building (level 1). Returns {status: done, balance, timber, level}, or {status: refused, reason: player_not_set_up, plot_occupied (also standing) or not_enough_timber (also timberHeld)} with nothing changed. Raises insufficient_funds (from the wallet), already_applied, bad_build, or a check error if the plot and building do not belong together. Only service_role may run it.';
