-- =============================================================================
-- 20261114100000_wall_recovery.sql
--
-- WHAT IT DOES
--   Wall damage that stays after a wave (tasks T29-T32 and T47, decision D039,
--   proposed; specs/T29-T32-wall-recovery.md). Used only while the feature flag
--   wall_recovery is on; with the flag off the server never reads or calls
--   anything below, so applying this file changes nothing that players see.
--
--     islet_buildings        two new columns for walls:
--                              wall_health     percent after the last wave
--                                              (0 destroyed .. 100 whole),
--                                              default 100: every existing
--                                              wall (an old save) is whole
--                              wall_damaged_at when the wave that left it below
--                                              100 was recorded; null while whole
--     island_wall_records    one row per island wave whose walls were recorded:
--                            the first finish of a wave writes it, so a later
--                            finish of the same wave changes nothing
--     island_walls_record()  keeps the wall health a finishing player's
--                            simulation ended an island wave with
--     island_wall_restore()  a paid Repair (damaged) or Rebuild (destroyed) of
--                            one wall between waves: coins and health in ONE step
--
-- THE RULES THAT THE DATABASE KEEPS
--   1. Play money only; coins move only through apply_wallet_transaction(),
--      reason building_purchase, ref wallfix:<uid>. A repeated uid pays nothing.
--   2. Never above whole: a restore of a wall that is whole (or whose 10-minute
--      timer has run out, p_recover_seconds) is refused intact, so two clicks at
--      once pay once. The row lock on the building serialises them.
--   3. Never while a wave runs on that island (the rule of island_demolish()):
--      the running wave's simulation already read the walls.
--   4. The level and kind never change here; a destroyed wall keeps its level.
--   5. Only the first finish of a wave records its walls, only for walls that
--      stand on that wave's island, only by a player who is in that wave.
--
-- WHAT IT NEEDS
--   20261112080000_demolish.sql (island_members, the wave tables, the wallet).
--
-- SAFE TO RUN AGAIN
--   add column if not exists, create table if not exists, create or replace
--   function, drop ... if exists before each policy and constraint.
--
-- ROLLBACK (by hand)
--   drop function public.island_wall_restore(uuid, uuid, text, text, integer, integer);
--   drop function public.island_walls_record(uuid, uuid, jsonb);
--   drop table public.island_wall_records;
--   alter table public.islet_buildings drop column wall_damaged_at, drop column wall_health;
--
-- HOW TO VERIFY (read-only, after applying)
--   select count(*) from public.islet_buildings where wall_health <> 100;  -- 0
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. islet_buildings: a wall's health after its last wave
-- -----------------------------------------------------------------------------

alter table public.islet_buildings
  add column if not exists wall_health smallint not null default 100;
alter table public.islet_buildings
  add column if not exists wall_damaged_at timestamptz;

alter table public.islet_buildings
  drop constraint if exists islet_buildings_wall_health_range;
alter table public.islet_buildings
  add constraint islet_buildings_wall_health_range
    check (wall_health between 0 and 100);
-- Only a wall has lasting damage; every other building stays at 100 with no timer.
alter table public.islet_buildings
  drop constraint if exists islet_buildings_wall_health_walls_only;
alter table public.islet_buildings
  add constraint islet_buildings_wall_health_walls_only
    check (building_type = 'wall' or (wall_health = 100 and wall_damaged_at is null));

comment on column public.islet_buildings.wall_health is
  'A wall''s health in percent after its last recorded wave: 0 destroyed, 100 whole (D039). 100 for every other building and for old rows.';
comment on column public.islet_buildings.wall_damaged_at is
  'When the wave that left this wall below 100 was recorded; the wall counts as whole again 10 minutes later (the server passes the time). Null while whole.';

-- -----------------------------------------------------------------------------
-- 2. island_wall_records: one record per island wave
-- -----------------------------------------------------------------------------

create table if not exists public.island_wall_records (
  wave_id      uuid primary key references public.wave_runs (id) on delete cascade,
  island_owner uuid not null references public.islands (player_id) on delete cascade,
  recorded_by  uuid references public.profiles (id) on delete set null,
  recorded_at  timestamptz not null default now()
);

comment on table public.island_wall_records is
  'One row per island wave whose wall health was recorded (D039): the first finish of the wave writes it, so a later finish of the same wave changes nothing. Written only by island_walls_record().';
comment on column public.island_wall_records.wave_id is 'The wave (wave_runs.id).';
comment on column public.island_wall_records.island_owner is 'The island the wave ran on.';
comment on column public.island_wall_records.recorded_by is 'The player whose finish recorded it; null once that account is deleted.';
comment on column public.island_wall_records.recorded_at is 'When it was recorded.';

alter table public.island_wall_records enable row level security;
-- No policy: players never read or write it. The server reads it only through the function.

revoke all on table public.island_wall_records from public, anon, authenticated, service_role;
grant select, insert on table public.island_wall_records to service_role;

-- -----------------------------------------------------------------------------
-- 3. island_walls_record(): the walls at the end of an island wave
-- -----------------------------------------------------------------------------
--   p_walls  {"wall_1": 40, "wall_2": 0, ...}: health percent, 0 to 100
--
-- Returns {status: recorded | repeat | skipped}. skipped: a Pirate Point wave or
-- a player who is not in the wave (nothing changes). A health below 100 starts
-- the wall's timer now; 100 clears it.

create or replace function public.island_walls_record(
  p_player_id uuid,
  p_wave_id   uuid,
  p_walls     jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_owner    uuid;
  v_inserted integer;
begin
  if p_player_id is null or p_wave_id is null or p_walls is null
     or jsonb_typeof(p_walls) <> 'object'
     or exists (
       select 1 from jsonb_each(p_walls) entry
        where jsonb_typeof(entry.value) <> 'number'
           or entry.value::text !~ '^[0-9]{1,3}$'
           or entry.value::text::integer > 100
     ) then
    raise exception 'bad_walls';
  end if;

  select island_owner into v_owner
    from public.wave_runs
   where id = p_wave_id and place = 'island';
  if v_owner is null or not exists (
    select 1 from public.wave_participants
     where wave_id = p_wave_id and player_id = p_player_id
  ) then
    return jsonb_build_object('status', 'skipped');
  end if;

  insert into public.island_wall_records (wave_id, island_owner, recorded_by)
  values (p_wave_id, v_owner, p_player_id)
  on conflict (wave_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('status', 'repeat');
  end if;

  update public.islet_buildings building
     set wall_health = entry.value::text::smallint,
         wall_damaged_at = case when entry.value::text::integer < 100 then now() end
    from jsonb_each(p_walls) entry
   where building.player_id = v_owner
     and building.plot = entry.key
     and building.building_type = 'wall';

  return jsonb_build_object('status', 'recorded');
end;
$$;
revoke all on function public.island_walls_record(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.island_walls_record(uuid, uuid, jsonb) to service_role;

comment on function public.island_walls_record(uuid, uuid, jsonb) is
  'Keeps the wall health (percent) a finishing player''s simulation ended island wave p_wave_id with (D039). Only the first call per wave counts (island_wall_records); a player not in the wave or a Pirate Point wave is skipped. Only walls that stand on that island change; below 100 starts the 10-minute timer, 100 clears it. Only service_role may run it.';

-- -----------------------------------------------------------------------------
-- 4. island_wall_restore(): a paid Repair or Rebuild between waves
-- -----------------------------------------------------------------------------
--   p_full_price       the price of a whole rebuild for this payer (the server's
--                      catalogue, engineer discount included)
--   p_recover_seconds  the timer: a wall damaged longer ago counts as whole
--
-- Price = ceil(p_full_price x (100 - health) / 100), at least 1.
-- Returns {status: done, balance, price, repeat} or {status: refused, reason:
-- player_not_set_up | not_built | wrong_kind | wave_running | intact |
-- insufficient_funds (with price)}.

create or replace function public.island_wall_restore(
  p_player_id       uuid,
  p_island_owner    uuid,
  p_plot            text,
  p_action_uid      text,
  p_full_price      integer,
  p_recover_seconds integer
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
  if p_player_id is null or p_island_owner is null or p_plot is null
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_full_price is null or p_full_price < 1
     or p_recover_seconds is null or p_recover_seconds < 1 then
    raise exception 'bad_restore';
  end if;
  v_ref := 'wallfix:' || p_action_uid;

  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  if exists (
    select 1 from public.wallet_transactions
     where player_id = p_player_id and reason = 'building_purchase' and ref = v_ref
  ) then
    return jsonb_build_object('status', 'done', 'balance', v_balance, 'price', 0, 'repeat', true);
  end if;

  select * into v_building
    from public.islet_buildings
   where player_id = p_island_owner and plot = p_plot
     for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'not_built');
  end if;
  if v_building.building_type <> 'wall' then
    return jsonb_build_object('status', 'refused', 'reason', 'wrong_kind');
  end if;
  if exists (
    select 1 from public.wave_runs
     where island_owner = p_island_owner and finished_at is null
       and starts_at + make_interval(secs => maximum_seconds) >= now()
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'wave_running');
  end if;
  if v_building.wall_health >= 100
     or (v_building.wall_damaged_at is not null
         and v_building.wall_damaged_at + make_interval(secs => p_recover_seconds) <= now()) then
    return jsonb_build_object('status', 'refused', 'reason', 'intact');
  end if;

  v_price := greatest(1, ceil(p_full_price * (100 - v_building.wall_health) / 100.0)::integer);
  if v_balance < v_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', v_price);
  end if;

  v_balance := public.apply_wallet_transaction(p_player_id, -v_price, 'building_purchase', v_ref);
  update public.islet_buildings
     set wall_health = 100, wall_damaged_at = null
   where player_id = p_island_owner and plot = p_plot;

  return jsonb_build_object('status', 'done', 'balance', v_balance, 'price', v_price, 'repeat', false);
end;
$$;
revoke all on function public.island_wall_restore(uuid, uuid, text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.island_wall_restore(uuid, uuid, text, text, integer, integer)
  to service_role;

comment on function public.island_wall_restore(uuid, uuid, text, text, integer, integer) is
  'Repairs (damaged) or rebuilds (destroyed) the wall on p_plot of the island of p_island_owner, paid by p_player_id, between waves only (D039). Price: ceil(p_full_price x missing percent / 100), at least 1. Locks the payer''s wallet, then the building. A repeated actionUid (ledger ref wallfix:<uid>, reason building_purchase) answers {status: done, repeat: true}. Refuses not_built, wrong_kind, wave_running, intact (whole, or its p_recover_seconds timer ran out) and insufficient_funds, with nothing changed. Kind and level never change. Only service_role may run it.';
