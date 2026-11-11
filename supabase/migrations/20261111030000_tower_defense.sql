-- =============================================================================
-- 20261111030000_tower_defense.sql
--
-- WHAT IT DOES
--   The database part of tower defense version 2 (docs/TOWER-DEFENSE.md,
--   decision D036): building levels, the mortar, crew, the fighting captain,
--   the shared buildings of Pirate Point, 100 waves with boss waves, and the
--   restart rule after a lost wave.
--
--     islet_buildings      the check rule now allows the 16 island spots:
--                          wall_1..wall_6 (wall), cannon_1..cannon_7 (cannon
--                          or mortar), tower_1 (watchtower), house_1, house_2
--                          (house). Every pair an existing row uses stays. The
--                          server may now update a row (the level).
--     islands              new columns: next_wave (the restart rule),
--                          crew_gunner, crew_carpenter, crew_lookout,
--                          captain_level and point_wave_best (the best Pirate
--                          Point wave this player fought and won, for unlocks)
--     pirate_point_buildings  one row per built spot of Pirate Point
--
--     island_upgrade()     one level up for a building on the player's island
--     island_hire()        one crew member
--     island_captain()     one captain level up
--     pp_build(), pp_upgrade()  build or upgrade a Pirate Point spot, paid by
--                          the player who clicks
--     wave_start()         replaced (same arguments): the next island wave is
--                          islands.next_wave when it is set
--     wave_finish()        a NEW 11-argument version next to the 8-argument
--                          one of 20261110020000: house levels count, a boss
--                          wave pays the multiplier, the restart rule, and the
--                          Pirate Point best of the player. The 8-argument one
--                          stays untouched, so a server from before keeps
--                          working until the new code is deployed.
--
--     wallet reasons       crew_hire (spend) and captain_upgrade (spend).
--                          Building upgrades and Pirate Point builds use the
--                          existing building_purchase.
--
-- WHO USES IT
--   Only the Python server, with the secret key (service_role): the routes of
--   backend/server/routes/island.py, pirate_point.py and waves.py. Every price,
--   maximum and unlock comes from backend/content/islands.json through the
--   server; the database only compares. No browser role gets anything new.
--
-- THE RULES THAT THE DATABASE KEEPS
--   1. Play money only; coins move only through apply_wallet_transaction().
--   2. Every paid action is safe to repeat: the ledger row (player, reason,
--      ref) is the record. Refs: upgrade:<uid>, crew:<uid>, captain:<uid>,
--      pp:<uid>. A repeat answers {status: done, repeat: true} and pays
--      nothing.
--   3. The wallet is locked first, then the row that changes.
--   4. A level never goes above the length of the price list the server
--      passes (max_level), nor above p_unlocked_level (locked).
--   5. A lost first finish of an island wave sets next_wave to wave_best - 2
--      (at least 1); a survived first finish sets it to the wave + 1. A win
--      always beats a loss of the same wave.
--
-- WHAT IT NEEDS
--   Every earlier migration, in particular 20261106070000_home_islet.sql,
--   20261110010000_islands_and_waves.sql and 20261110020000_wave_crews.sql.
--
-- SAFE TO RUN TWICE
--   Columns and tables use "if not exists", the reasons "on conflict do
--   nothing", the check rule is dropped "if exists" first, the backfill only
--   raises a value, functions use "create or replace", and revokes, grants and
--   comments repeat.
--
-- HOW THE FILE IS ORGANISED
--   1. Two wallet reasons
--   2. The 16 spots in islet_buildings, and the right to update a level
--   3. New columns of islands, backfilled
--   4. Table pirate_point_buildings
--   5. island_upgrade()
--   6. island_hire()
--   7. island_captain()
--   8. pp_build() and pp_upgrade()
--   9. wave_start(), replaced
--  10. wave_finish(), the new 11-argument version
--
-- HOW TO VERIFY (read-only queries, after applying)
--   a. select relrowsecurity from pg_class where relname = 'pirate_point_buildings'; -- true
--      select count(*) from pg_policies where tablename = 'pirate_point_buildings';  -- 0
--   b. select reason, direction from public.wallet_reasons
--       where reason in ('crew_hire', 'captain_upgrade');                         -- 2 rows, spend
--   c. select pg_get_constraintdef(oid) from pg_constraint
--       where conname = 'islet_buildings_plot_fits_building';                     -- 27 pairs
--   d. Two wave_finish versions (8 and 11 arguments):
--      select pg_get_function_identity_arguments(oid) from pg_proc where proname = 'wave_finish';
--   e. Only the server may run the new functions (browser and visitor false):
--      select p.proname,
--             has_function_privilege('authenticated', p.oid, 'execute') as browser,
--             has_function_privilege('anon', p.oid, 'execute') as visitor,
--             has_function_privilege('service_role', p.oid, 'execute') as server
--        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'public'
--         and p.proname in ('island_upgrade', 'island_hire', 'island_captain',
--                           'pp_build', 'pp_upgrade', 'wave_start', 'wave_finish');
--   f. select column_name from information_schema.columns
--       where table_name = 'islands' order by ordinal_position;                  -- 13 columns
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Two wallet reasons
-- -----------------------------------------------------------------------------
-- The same pairs, in the same order, end WALLET_REASONS in
-- backend/server/wallet.py (a test compares them).

insert into public.wallet_reasons (reason, direction, description) values
  ('crew_hire',       'spend', 'Hiring one crew member for your island (gunner, carpenter or lookout).'),
  ('captain_upgrade', 'spend', 'One level up for your captain''s musket.')
on conflict (reason) do nothing;


-- -----------------------------------------------------------------------------
-- 2. The 16 island spots, and the level of a building
-- -----------------------------------------------------------------------------
-- The pairs repeat backend/content/buildings.json (the four home islet pairs)
-- and backend/content/islands.json (spots); a test keeps them equal. Every pair
-- of 20261110010000 is still here, so every existing row passes.

alter table public.islet_buildings
  drop constraint if exists islet_buildings_plot_fits_building;

alter table public.islet_buildings
  add constraint islet_buildings_plot_fits_building
    check ((plot, building_type) in (
      ('plot_2', 'workshop'),
      ('plot_3', 'windmill'),
      ('plot_4', 'greenhouse'),
      ('islet_signal_station', 'signal_station'),
      ('wall_1', 'wall'),
      ('wall_2', 'wall'),
      ('wall_3', 'wall'),
      ('wall_4', 'wall'),
      ('wall_5', 'wall'),
      ('wall_6', 'wall'),
      ('cannon_1', 'cannon'),
      ('cannon_1', 'mortar'),
      ('cannon_2', 'cannon'),
      ('cannon_2', 'mortar'),
      ('cannon_3', 'cannon'),
      ('cannon_3', 'mortar'),
      ('cannon_4', 'cannon'),
      ('cannon_4', 'mortar'),
      ('cannon_5', 'cannon'),
      ('cannon_5', 'mortar'),
      ('cannon_6', 'cannon'),
      ('cannon_6', 'mortar'),
      ('cannon_7', 'cannon'),
      ('cannon_7', 'mortar'),
      ('tower_1', 'watchtower'),
      ('house_1', 'house'),
      ('house_2', 'house')
    ));

comment on constraint islet_buildings_plot_fits_building on public.islet_buildings is
  'Each spot holds only its own kinds: the four home islet pairs (buildings.json) and the 16 island spots (islands.json: wall_1..6 wall, cannon_1..7 cannon or mortar, tower_1 watchtower, house_1..2 house). The cabin has no row.';

comment on column public.islet_buildings.level is
  'The level of the building, from 1 to 3. islet_build() builds level 1; island_upgrade() raises it one at a time.';

-- island_upgrade() raises the level and adds the price to coins_paid.
grant update on table public.islet_buildings to service_role;


-- -----------------------------------------------------------------------------
-- 3. New columns of islands
-- -----------------------------------------------------------------------------

alter table public.islands add column if not exists next_wave integer;
alter table public.islands add column if not exists crew_gunner smallint not null default 0;
alter table public.islands add column if not exists crew_carpenter smallint not null default 0;
alter table public.islands add column if not exists crew_lookout smallint not null default 0;
alter table public.islands add column if not exists captain_level smallint not null default 1;
alter table public.islands add column if not exists point_wave_best integer not null default 0;

alter table public.islands drop constraint if exists islands_next_wave_range;
alter table public.islands
  add constraint islands_next_wave_range check (next_wave is null or next_wave between 1 and 1001);
alter table public.islands drop constraint if exists islands_crew_range;
alter table public.islands
  add constraint islands_crew_range check (
    crew_gunner between 0 and 10 and crew_carpenter between 0 and 10
    and crew_lookout between 0 and 10
  );
alter table public.islands drop constraint if exists islands_captain_level_range;
alter table public.islands
  add constraint islands_captain_level_range check (captain_level between 1 and 5);
alter table public.islands drop constraint if exists islands_point_wave_best_not_negative;
alter table public.islands
  add constraint islands_point_wave_best_not_negative check (point_wave_best >= 0);

comment on column public.islands.next_wave is
  'The wave the next bell on this island rings, or null for wave_best + 1. Set by wave_finish(): the wave + 1 after a won wave, wave_best - 2 (at least 1) after a lost one.';
comment on column public.islands.crew_gunner is
  'Gunners hired (island_hire), at most the maximum of islands.json.';
comment on column public.islands.crew_carpenter is
  'Carpenters hired (island_hire), at most the maximum of islands.json.';
comment on column public.islands.crew_lookout is
  'Lookouts hired (island_hire), at most the maximum of islands.json.';
comment on column public.islands.captain_level is
  'The level of this player''s captain (musket), 1 to 5. Raised by island_captain().';
comment on column public.islands.point_wave_best is
  'The highest Pirate Point wave this player fought in and won (their own survived finish). With wave_best it decides the unlocks.';

-- Backfill: the Pirate Point waves every player already won. Only raises.
update public.islands i
   set point_wave_best = won.best
  from (
    select p.player_id, max(r.wave) as best
      from public.wave_participants p
      join public.wave_runs r on r.id = p.wave_id
     where r.place = 'pirate_point' and p.survived and not p.expired
     group by p.player_id
  ) won
 where won.player_id = i.player_id and i.point_wave_best < won.best;


-- -----------------------------------------------------------------------------
-- 4. Table pirate_point_buildings: the shared buildings of Pirate Point
-- -----------------------------------------------------------------------------

create table if not exists public.pirate_point_buildings (
  spot        text primary key,
  kind        text not null,
  level       smallint not null default 1,
  built_by    uuid references public.profiles (id) on delete set null,
  coins_paid  bigint not null,
  built_at    timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint pirate_point_buildings_spot_fits_kind
    check ((spot, kind) in (
      ('pp_wall_1', 'wall'), ('pp_wall_2', 'wall'), ('pp_wall_3', 'wall'), ('pp_wall_4', 'wall'),
      ('pp_tower_1', 'cannon'), ('pp_tower_1', 'mortar'),
      ('pp_tower_2', 'cannon'), ('pp_tower_2', 'mortar'),
      ('pp_tower_3', 'cannon'), ('pp_tower_3', 'mortar'),
      ('pp_tower_4', 'cannon'), ('pp_tower_4', 'mortar'),
      ('pp_tower_5', 'cannon'), ('pp_tower_5', 'mortar'),
      ('pp_tower_6', 'cannon'), ('pp_tower_6', 'mortar')
    )),
  constraint pirate_point_buildings_level_range
    check (level between 1 and 3),
  constraint pirate_point_buildings_coins_paid_range
    check (coins_paid between 1 and 1000000)
);

create or replace trigger pirate_point_buildings_touch_updated_at
  before insert or update on public.pirate_point_buildings
  for each row execute function public.touch_updated_at();

comment on table public.pirate_point_buildings is
  'One row per built spot of Pirate Point, the shared island: anyone builds or upgrades with their own coins (pp_build, pp_upgrade); the building belongs to Pirate Point and stays between battles. No browser access: the server answers GET /api/pirate-point.';
comment on column public.pirate_point_buildings.spot is
  'pp_wall_1..4 or pp_tower_1..6 (islands.json piratePointSpots). One building per spot.';
comment on column public.pirate_point_buildings.kind is
  'wall on a wall spot; cannon or mortar on a tower spot, chosen at the first build and kept.';
comment on column public.pirate_point_buildings.level is
  'The level, 1 to 3.';
comment on column public.pirate_point_buildings.built_by is
  'The player who built it first. Kept only so a row can be traced; never shown. Set to null when that player is deleted.';
comment on column public.pirate_point_buildings.coins_paid is
  'All coins paid for this spot, by everyone (build and upgrades).';
comment on column public.pirate_point_buildings.built_at is
  'When it was first built. Set by the database.';
comment on column public.pirate_point_buildings.updated_at is
  'When it last changed. Set by the database.';

-- Row-level security on and no policy: no browser role sees a row.
--   service_role  read, insert (pp_build), update (pp_upgrade); no delete
alter table public.pirate_point_buildings enable row level security;
revoke all on table public.pirate_point_buildings from public, anon, authenticated, service_role;
grant select, insert, update on table public.pirate_point_buildings to service_role;


-- -----------------------------------------------------------------------------
-- 5. island_upgrade(): one level up for a building on the player's island
-- -----------------------------------------------------------------------------
--   p_prices          the price list of the building's kind from islands.json,
--                     index 1 = level 1 (the build), 2 = level 2, ...; its
--                     length is the maximum level
--   p_unlocked_level  the highest level this player has unlocked for the kind
--
-- Returns {status: done, level, balance, repeat} or {status: refused, reason:
-- player_not_set_up | not_built | max_level | locked | insufficient_funds,
-- price?} with nothing changed.

create or replace function public.island_upgrade(
  p_player_id      uuid,
  p_plot           text,
  p_action_uid     text,
  p_prices         integer[],
  p_unlocked_level integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_ref      text;
  v_balance  bigint;
  v_building public.islet_buildings;
  v_price    integer;
begin
  if p_player_id is null or p_plot is null or p_unlocked_level is null
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_prices is null or coalesce(array_length(p_prices, 1), 0) not between 1 and 3
     or exists (select 1 from unnest(p_prices) price where price is null or price < 1) then
    raise exception 'bad_upgrade';
  end if;
  v_ref := 'upgrade:' || p_action_uid;

  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  select * into v_building
    from public.islet_buildings
   where player_id = p_player_id and plot = p_plot
     for update;

  if exists (
    select 1 from public.wallet_transactions
     where player_id = p_player_id and reason = 'building_purchase' and ref = v_ref
  ) then
    return jsonb_build_object(
      'status', 'done', 'level', coalesce(v_building.level, 0), 'balance', v_balance,
      'repeat', true
    );
  end if;

  if v_building.player_id is null then
    return jsonb_build_object('status', 'refused', 'reason', 'not_built');
  end if;
  if v_building.level >= array_length(p_prices, 1) then
    return jsonb_build_object('status', 'refused', 'reason', 'max_level');
  end if;
  if v_building.level + 1 > p_unlocked_level then
    return jsonb_build_object('status', 'refused', 'reason', 'locked');
  end if;
  v_price := p_prices[v_building.level + 1];
  if v_balance < v_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', v_price);
  end if;

  v_balance := public.apply_wallet_transaction(p_player_id, -v_price, 'building_purchase', v_ref);
  update public.islet_buildings
     set level = level + 1, coins_paid = coins_paid + v_price
   where player_id = p_player_id and plot = p_plot
  returning * into v_building;

  return jsonb_build_object(
    'status', 'done', 'level', v_building.level, 'balance', v_balance, 'repeat', false
  );
end;
$$;

revoke all on function public.island_upgrade(uuid, text, text, integer[], integer)
  from public, anon, authenticated, service_role;
grant execute on function public.island_upgrade(uuid, text, text, integer[], integer)
  to service_role;

comment on function public.island_upgrade(uuid, text, text, integer[], integer) is
  'Raises one building on the player''s island by one level. Locks the wallet, then the building. A repeated actionUid (ledger ref upgrade:<uid>, reason building_purchase) answers {status: done, repeat: true}. Refuses not_built, max_level (the length of p_prices), locked (above p_unlocked_level) and insufficient_funds, with nothing changed. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 6. island_hire(): one crew member
-- -----------------------------------------------------------------------------
-- Returns {status: done, count, balance, repeat} or {status: refused, reason:
-- player_not_set_up | no_island | crew_full | insufficient_funds}.

create or replace function public.island_hire(
  p_player_id  uuid,
  p_crew       text,
  p_action_uid text,
  p_price      integer,
  p_max        integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_ref     text;
  v_balance bigint;
  v_island  public.islands;
  v_count   integer;
begin
  if p_player_id is null or p_crew is null
     or p_crew not in ('gunner', 'carpenter', 'lookout')
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_price is null or p_price < 1 or p_max is null or p_max not between 1 and 10 then
    raise exception 'bad_hire';
  end if;
  v_ref := 'crew:' || p_action_uid;

  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  select * into v_island from public.islands where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_island');
  end if;
  v_count := case p_crew
    when 'gunner' then v_island.crew_gunner
    when 'carpenter' then v_island.crew_carpenter
    else v_island.crew_lookout
  end;

  if exists (
    select 1 from public.wallet_transactions
     where player_id = p_player_id and reason = 'crew_hire' and ref = v_ref
  ) then
    return jsonb_build_object('status', 'done', 'count', v_count, 'balance', v_balance, 'repeat', true);
  end if;

  if v_count >= p_max then
    return jsonb_build_object('status', 'refused', 'reason', 'crew_full');
  end if;
  if v_balance < p_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', p_price);
  end if;

  v_balance := public.apply_wallet_transaction(p_player_id, -p_price, 'crew_hire', v_ref);
  update public.islands
     set crew_gunner = crew_gunner + (p_crew = 'gunner')::integer,
         crew_carpenter = crew_carpenter + (p_crew = 'carpenter')::integer,
         crew_lookout = crew_lookout + (p_crew = 'lookout')::integer
   where player_id = p_player_id;

  return jsonb_build_object('status', 'done', 'count', v_count + 1, 'balance', v_balance, 'repeat', false);
end;
$$;

revoke all on function public.island_hire(uuid, text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.island_hire(uuid, text, text, integer, integer)
  to service_role;

comment on function public.island_hire(uuid, text, text, integer, integer) is
  'Hires one gunner, carpenter or lookout for the player''s island. Locks the wallet, then the island. A repeated actionUid (ledger ref crew:<uid>, reason crew_hire) answers {status: done, repeat: true}. Refuses no_island, crew_full (p_max) and insufficient_funds, with nothing changed. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 7. island_captain(): one captain level up
-- -----------------------------------------------------------------------------
--   p_prices          index n = the price of level n (index 1 is level 1, free);
--                     its length is the maximum level (5)
--   p_unlocked_level  the highest captain level this player has unlocked
--
-- Returns {status: done, level, balance, repeat} or {status: refused, reason:
-- player_not_set_up | no_island | max_level | locked | insufficient_funds}.

create or replace function public.island_captain(
  p_player_id      uuid,
  p_action_uid     text,
  p_prices         integer[],
  p_unlocked_level integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_ref     text;
  v_balance bigint;
  v_island  public.islands;
  v_price   integer;
begin
  if p_player_id is null or p_unlocked_level is null
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_prices is null or coalesce(array_length(p_prices, 1), 0) not between 1 and 5
     or exists (select 1 from unnest(p_prices) price where price is null or price < 0) then
    raise exception 'bad_captain';
  end if;
  v_ref := 'captain:' || p_action_uid;

  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  select * into v_island from public.islands where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_island');
  end if;

  if exists (
    select 1 from public.wallet_transactions
     where player_id = p_player_id and reason = 'captain_upgrade' and ref = v_ref
  ) then
    return jsonb_build_object(
      'status', 'done', 'level', v_island.captain_level, 'balance', v_balance, 'repeat', true
    );
  end if;

  if v_island.captain_level >= array_length(p_prices, 1) then
    return jsonb_build_object('status', 'refused', 'reason', 'max_level');
  end if;
  if v_island.captain_level + 1 > p_unlocked_level then
    return jsonb_build_object('status', 'refused', 'reason', 'locked');
  end if;
  v_price := p_prices[v_island.captain_level + 1];
  if v_price < 1 then
    raise exception 'bad_captain';
  end if;
  if v_balance < v_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', v_price);
  end if;

  v_balance := public.apply_wallet_transaction(p_player_id, -v_price, 'captain_upgrade', v_ref);
  update public.islands
     set captain_level = captain_level + 1
   where player_id = p_player_id
  returning * into v_island;

  return jsonb_build_object(
    'status', 'done', 'level', v_island.captain_level, 'balance', v_balance, 'repeat', false
  );
end;
$$;

revoke all on function public.island_captain(uuid, text, integer[], integer)
  from public, anon, authenticated, service_role;
grant execute on function public.island_captain(uuid, text, integer[], integer)
  to service_role;

comment on function public.island_captain(uuid, text, integer[], integer) is
  'Raises the player''s captain by one level. Locks the wallet, then the island. A repeated actionUid (ledger ref captain:<uid>, reason captain_upgrade) answers {status: done, repeat: true}. Refuses no_island, max_level (the length of p_prices), locked (above p_unlocked_level) and insufficient_funds, with nothing changed. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 8. pp_build() and pp_upgrade(): the shared buildings of Pirate Point
-- -----------------------------------------------------------------------------
-- The payer's wallet is locked first, then one transaction lock for all of
-- Pirate Point, so two captains building at once run one after the other.
-- Ledger ref pp:<uid> (reason building_purchase) for both functions.
--
-- pp_build returns {status: done, level: 1, balance, repeat} or {status:
-- refused, reason: player_not_set_up | spot_taken | insufficient_funds}.
-- pp_upgrade returns {status: done, level, balance, repeat} or {status:
-- refused, reason: player_not_set_up | not_built | wrong_kind | max_level |
-- locked | insufficient_funds}.

create or replace function public.pp_build(
  p_player_id  uuid,
  p_spot       text,
  p_kind       text,
  p_action_uid text,
  p_price      integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_ref     text;
  v_balance bigint;
  v_level   smallint;
begin
  if p_player_id is null or p_spot is null or p_kind is null
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_price is null or p_price < 1 then
    raise exception 'bad_pp_build';
  end if;
  v_ref := 'pp:' || p_action_uid;

  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;
  perform pg_advisory_xact_lock(hashtext('public.pirate_point_buildings'));

  select level into v_level from public.pirate_point_buildings where spot = p_spot;

  if exists (
    select 1 from public.wallet_transactions
     where player_id = p_player_id and reason = 'building_purchase' and ref = v_ref
  ) then
    return jsonb_build_object(
      'status', 'done', 'level', coalesce(v_level, 0), 'balance', v_balance, 'repeat', true
    );
  end if;

  if v_level is not null then
    return jsonb_build_object('status', 'refused', 'reason', 'spot_taken');
  end if;
  if v_balance < p_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', p_price);
  end if;

  v_balance := public.apply_wallet_transaction(p_player_id, -p_price, 'building_purchase', v_ref);
  insert into public.pirate_point_buildings (spot, kind, level, built_by, coins_paid)
  values (p_spot, p_kind, 1, p_player_id, p_price);

  return jsonb_build_object('status', 'done', 'level', 1, 'balance', v_balance, 'repeat', false);
end;
$$;

revoke all on function public.pp_build(uuid, text, text, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.pp_build(uuid, text, text, text, integer) to service_role;

comment on function public.pp_build(uuid, text, text, text, integer) is
  'Builds one Pirate Point spot at level 1, paid by p_player_id (reason building_purchase, ref pp:<uid>). Locks the wallet, then all of Pirate Point. A repeat answers {status: done, repeat: true}. Refuses spot_taken and insufficient_funds; a spot and kind that do not belong together fail the table check. Only service_role may run it.';

create or replace function public.pp_upgrade(
  p_player_id      uuid,
  p_spot           text,
  p_kind           text,
  p_action_uid     text,
  p_prices         integer[],
  p_unlocked_level integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_ref      text;
  v_balance  bigint;
  v_building public.pirate_point_buildings;
  v_price    integer;
begin
  if p_player_id is null or p_spot is null or p_kind is null or p_unlocked_level is null
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_prices is null or coalesce(array_length(p_prices, 1), 0) not between 1 and 3
     or exists (select 1 from unnest(p_prices) price where price is null or price < 1) then
    raise exception 'bad_pp_upgrade';
  end if;
  v_ref := 'pp:' || p_action_uid;

  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;
  perform pg_advisory_xact_lock(hashtext('public.pirate_point_buildings'));

  select * into v_building from public.pirate_point_buildings where spot = p_spot;

  if exists (
    select 1 from public.wallet_transactions
     where player_id = p_player_id and reason = 'building_purchase' and ref = v_ref
  ) then
    return jsonb_build_object(
      'status', 'done', 'level', coalesce(v_building.level, 0), 'balance', v_balance,
      'repeat', true
    );
  end if;

  if v_building.spot is null then
    return jsonb_build_object('status', 'refused', 'reason', 'not_built');
  end if;
  if v_building.kind <> p_kind then
    return jsonb_build_object('status', 'refused', 'reason', 'wrong_kind');
  end if;
  if v_building.level >= array_length(p_prices, 1) then
    return jsonb_build_object('status', 'refused', 'reason', 'max_level');
  end if;
  if v_building.level + 1 > p_unlocked_level then
    return jsonb_build_object('status', 'refused', 'reason', 'locked');
  end if;
  v_price := p_prices[v_building.level + 1];
  if v_balance < v_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', v_price);
  end if;

  v_balance := public.apply_wallet_transaction(p_player_id, -v_price, 'building_purchase', v_ref);
  update public.pirate_point_buildings
     set level = level + 1, coins_paid = coins_paid + v_price
   where spot = p_spot
  returning * into v_building;

  return jsonb_build_object(
    'status', 'done', 'level', v_building.level, 'balance', v_balance, 'repeat', false
  );
end;
$$;

revoke all on function public.pp_upgrade(uuid, text, text, text, integer[], integer)
  from public, anon, authenticated, service_role;
grant execute on function public.pp_upgrade(uuid, text, text, text, integer[], integer)
  to service_role;

comment on function public.pp_upgrade(uuid, text, text, text, integer[], integer) is
  'Raises one Pirate Point building by one level, paid by p_player_id (reason building_purchase, ref pp:<uid>). Locks the wallet, then all of Pirate Point. A repeat answers {status: done, repeat: true}. Refuses not_built, wrong_kind (p_kind is not what stands there), max_level, locked and insufficient_funds, with nothing changed. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 9. wave_start(), replaced: the restart rule
-- -----------------------------------------------------------------------------
-- The same arguments and steps as in 20261110020000_wave_crews.sql, with one
-- change: the next wave of an island is islands.next_wave when it is set (the
-- restart rule), else wave_best + 1 as before. Still at most p_highest_wave.

create or replace function public.wave_start(
  p_player_id         uuid,
  p_action_uid        text,
  p_place             text,
  p_island_owner      uuid,
  p_seed              integer,
  p_countdown_seconds integer,
  p_minimum_seconds   integer,
  p_maximum_seconds   integer,
  p_highest_wave      integer,
  p_weather_kind      text,
  p_weather_ships     numeric,
  p_weather_fog       numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_run    public.wave_runs;
  v_next   integer;
  v_repeat boolean := false;
begin
  -- Step 1: the arguments. The table rules check the rest (the weather, the timing).
  if p_player_id is null or p_action_uid is null or p_seed is null or p_seed < 0
     or p_place is null or p_place not in ('island', 'pirate_point')
     or (p_place = 'island') <> (p_island_owner is not null)
     or p_countdown_seconds is null or p_countdown_seconds < 0
     or p_minimum_seconds is null or p_maximum_seconds is null
     or p_highest_wave is null or p_highest_wave < 1 then
    raise exception 'bad_wave';
  end if;

  -- Step 2: one bell at a time per island; the next wave of the place.
  if p_place = 'island' then
    select coalesce(next_wave, wave_best + 1) into v_next
      from public.islands
     where player_id = p_island_owner
       for update;
    if not found then
      return jsonb_build_object('status', 'refused', 'reason', 'no_such_island');
    end if;
  else
    perform pg_advisory_xact_lock(hashtext('public.wave_runs:pirate_point'));
    select coalesce(max(wave), 0) + 1 into v_next
      from public.wave_runs
     where place = 'pirate_point' and flag_counted;
  end if;

  -- Step 3: the same click again is the same wave.
  select * into v_run
    from public.wave_runs
   where started_by = p_player_id and action_uid = p_action_uid;

  if found then
    v_repeat := true;
  else
    -- Step 4: a wave nobody finished is over after its maximum length.
    update public.wave_runs
       set finished_at = now(), survived = false, ships_sunk = 0, loot = 0, expired = true
     where coalesce(island_owner::text, place) = coalesce(p_island_owner::text, p_place)
       and finished_at is null
       and starts_at + make_interval(secs => maximum_seconds) < now();

    -- Step 5: one running wave per island.
    if exists (
      select 1 from public.wave_runs
       where coalesce(island_owner::text, place) = coalesce(p_island_owner::text, p_place)
         and finished_at is null
    ) then
      return jsonb_build_object('status', 'refused', 'reason', 'wave_running');
    end if;

    -- Steps 6 and 7: the next wave, which starts after the countdown.
    insert into public.wave_runs (
      started_by, action_uid, place, island_owner, wave, seed, starts_at,
      minimum_seconds, maximum_seconds, weather_kind, weather_ships, weather_fog
    )
    values (
      p_player_id, p_action_uid, p_place, p_island_owner,
      least(greatest(v_next, 1), p_highest_wave),
      p_seed, date_trunc('second', now()) + make_interval(secs => p_countdown_seconds),
      p_minimum_seconds, p_maximum_seconds, p_weather_kind, p_weather_ships, p_weather_fog
    )
    returning * into v_run;
  end if;

  -- Step 8: the bell-ringer is the first participant.
  insert into public.wave_participants (wave_id, player_id)
  values (v_run.id, p_player_id)
  on conflict (wave_id, player_id) do nothing;

  return jsonb_build_object(
    'status', 'started', 'waveId', v_run.id, 'wave', v_run.wave, 'seed', v_run.seed,
    'startsAt', v_run.starts_at, 'weatherKind', v_run.weather_kind,
    'ships', v_run.weather_ships, 'fog', v_run.weather_fog, 'place', v_run.place,
    'repeat', v_repeat
  );
end;
$$;

revoke all on function public.wave_start(
  uuid, text, text, uuid, integer, integer, integer, integer, integer, text, numeric, numeric
) from public, anon, authenticated, service_role;
grant execute on function public.wave_start(
  uuid, text, text, uuid, integer, integer, integer, integer, integer, text, numeric, numeric
) to service_role;

comment on function public.wave_start(
  uuid, text, text, uuid, integer, integer, integer, integer, integer, text, numeric, numeric
) is
  'Starts a pirate wave on an island or on Pirate Point and makes the bell-ringer its first participant. Locks the island (or Pirate Point), answers a repeated player and actionUid with the same wave (repeat true), closes a running wave past its maximum length as expired, refuses while another wave runs there (wave_running) or when the island does not exist (no_such_island), and writes the next wave (islands.next_wave if set, else best wave + 1; at most p_highest_wave) starting after the countdown. Returns {status: started, waveId, wave, seed, startsAt, weatherKind, ships, fog, place, repeat} or {status: refused, reason}. Raises bad_wave for a bad argument. Never moves coins. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 10. wave_finish(), the new 11-argument version
-- -----------------------------------------------------------------------------
-- The steps of the 8-argument version of 20261110020000_wave_crews.sql, plus:
--   * a house adds p_loot_per_house per level (level 2 gives twice as much),
--   * a boss wave (p_boss_every > 0 and wave divisible by it) pays
--     p_boss_multiplier times the loot,
--   * the restart rule on the island of the wave (islands.next_wave): the first
--     survived finish sets it to the wave + 1; a lost finish that closes the
--     wave before anyone won it sets it to wave_best - p_restart_back (at
--     least 1),
--   * a survived Pirate Point finish raises this player's point_wave_best.

create or replace function public.wave_finish(
  p_player_id         uuid,
  p_wave_id           uuid,
  p_survived          boolean,
  p_ships_sunk        integer,
  p_loot_base         integer,
  p_loot_per_wave     integer,
  p_loot_per_house    integer,
  p_point_loot_base   integer,
  p_boss_every        integer,
  p_boss_multiplier   integer,
  p_restart_back      integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_run     public.wave_runs;
  v_part    public.wave_participants;
  v_houses  integer := 0;
  v_base    integer;
  v_loot    integer := 0;
  v_balance bigint;
  v_repeat  boolean := false;
  v_best    integer;
  v_flags   integer;
  v_boss    boolean;
begin
  -- Step 1: the arguments.
  if p_player_id is null or p_wave_id is null or p_survived is null
     or p_ships_sunk is null or p_ships_sunk < 0 or p_ships_sunk > 1000
     or p_loot_base is null or p_loot_base < 0
     or p_loot_per_wave is null or p_loot_per_wave < 0
     or p_loot_per_house is null or p_loot_per_house < 0
     or p_point_loot_base is null or p_point_loot_base < 0
     or p_boss_every is null or p_boss_every < 0
     or p_boss_multiplier is null or p_boss_multiplier not between 1 and 10
     or p_restart_back is null or p_restart_back < 0 then
    raise exception 'bad_wave_finish';
  end if;

  -- Step 2: the wallet first, then the wave, then the player's own row.
  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  select * into v_run from public.wave_runs where id = p_wave_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_wave');
  end if;
  v_boss := p_boss_every > 0 and v_run.wave % p_boss_every = 0;

  -- Step 3: only a participant.
  select * into v_part
    from public.wave_participants
   where wave_id = p_wave_id and player_id = p_player_id
     for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'not_in_wave');
  end if;

  if v_part.finished_at is not null then
    -- Step 4: finished already; the stored result stands.
    v_repeat := true;
  elsif now() < v_run.starts_at + make_interval(secs => v_run.minimum_seconds) then
    -- Step 5: too early. Nothing changes; the wave keeps running.
    return jsonb_build_object(
      'status', 'refused', 'reason', 'too_early',
      'waitSeconds', greatest(1, ceil(extract(epoch from
        v_run.starts_at + make_interval(secs => v_run.minimum_seconds) - now()))::integer)
    );
  elsif now() > v_run.starts_at + make_interval(secs => v_run.maximum_seconds) then
    -- Step 6: too late. This player gets nothing; an open wave run is closed.
    update public.wave_participants
       set finished_at = now(), survived = false, ships_sunk = 0, loot = 0, expired = true
     where wave_id = p_wave_id and player_id = p_player_id
    returning * into v_part;
    update public.wave_runs
       set finished_at = now(), survived = false, ships_sunk = 0, loot = 0, expired = true
     where id = v_run.id and finished_at is null;
  else
    -- Step 7: this player's loot.
    if p_survived then
      if v_run.place = 'island' then
        v_base := p_loot_base;
        select coalesce(sum(level), 0) into v_houses
          from public.islet_buildings
         where player_id = v_run.island_owner and building_type = 'house';
      else
        v_base := p_point_loot_base;
      end if;
      v_loot := v_base + p_loot_per_wave * v_run.wave + p_loot_per_house * v_houses;
      if v_boss then
        v_loot := v_loot * p_boss_multiplier;
      end if;
    end if;

    update public.wave_participants
       set finished_at = now(), survived = p_survived, ships_sunk = p_ships_sunk, loot = v_loot
     where wave_id = p_wave_id and player_id = p_player_id
    returning * into v_part;

    -- The restart rule: a loss that closes the wave before anyone won it.
    if not p_survived and v_run.finished_at is null and not v_run.flag_counted
       and v_run.place = 'island' then
      update public.islands
         set next_wave = greatest(1, wave_best - p_restart_back)
       where player_id = v_run.island_owner;
    end if;

    -- The first finish closes the wave run: no new joins, the next bell may ring.
    if v_run.finished_at is null then
      update public.wave_runs
         set finished_at = now(), survived = p_survived, ships_sunk = p_ships_sunk, loot = v_loot
       where id = v_run.id;
    end if;

    -- One best wave and one flag per wave, at the first survived finish; a win
    -- also sets the next wave of the run.
    if p_survived and not v_run.flag_counted then
      update public.wave_runs set flag_counted = true where id = v_run.id;
      if v_run.place = 'island' then
        update public.islands
           set wave_best = greatest(wave_best, v_run.wave), flags = flags + 1,
               next_wave = v_run.wave + 1
         where player_id = v_run.island_owner;
      end if;
    end if;

    -- The player's own Pirate Point best, for the unlocks.
    if p_survived and v_run.place = 'pirate_point' then
      update public.islands
         set point_wave_best = greatest(point_wave_best, v_run.wave)
       where player_id = p_player_id and point_wave_best < v_run.wave;
    end if;

    if v_loot > 0 then
      v_balance := public.apply_wallet_transaction(
        p_player_id, v_loot, 'pirate_loot',
        'wave:' || v_run.id::text || ':' || p_player_id::text
      );
    end if;
  end if;

  -- The best wave and the flags of the place of the wave.
  if v_run.place = 'island' then
    select wave_best, flags into v_best, v_flags
      from public.islands
     where player_id = v_run.island_owner;
  else
    select coalesce(max(wave), 0), count(*) into v_best, v_flags
      from public.wave_runs
     where place = 'pirate_point' and flag_counted;
  end if;

  return jsonb_build_object(
    'status', 'done', 'loot', v_part.loot, 'balance', v_balance, 'survived', v_part.survived,
    'wave', v_run.wave, 'waveBest', v_best, 'flags', v_flags,
    'expired', v_part.expired, 'repeat', v_repeat, 'boss', v_boss
  );
end;
$$;

revoke all on function public.wave_finish(
  uuid, uuid, boolean, integer, integer, integer, integer, integer, integer, integer, integer
) from public, anon, authenticated, service_role;
grant execute on function public.wave_finish(
  uuid, uuid, boolean, integer, integer, integer, integer, integer, integer, integer, integer
) to service_role;

comment on function public.wave_finish(
  uuid, uuid, boolean, integer, integer, integer, integer, integer, integer, integer, integer
) is
  'Finishes a pirate wave for one participant (tower defense v2). As the 8-argument version, plus: a house counts p_loot_per_house per level, a boss wave (wave divisible by p_boss_every) pays p_boss_multiplier times the loot, the first survived finish sets islands.next_wave to the wave + 1, a lost finish that closes the wave before anyone won it sets next_wave to wave_best - p_restart_back (at least 1), and a survived Pirate Point finish raises the player''s point_wave_best. Returns {status: done, loot, balance, survived, wave, waveBest, flags, expired, repeat, boss} or {status: refused, reason}. Only service_role may run it.';
