-- =============================================================================
-- 20261116050000_wall_restore_record_fence.sql
--
-- WHAT IT DOES
--   A paid wall restore fences out a delayed record from a wave that had already
--   started. Used by the server-only wall recovery functions (D039, issue #82).
--
-- SAFE TO RUN AGAIN
--   Adds one nullable marker and replaces the existing functions in place.
-- =============================================================================

alter table public.islet_buildings
  add column if not exists wall_restored_at timestamptz;

comment on column public.islet_buildings.wall_restored_at is
  'Last successful paid wall restore; an older wave record cannot undo a restore made after that wave started.';

-- Recording only takes building row locks, in plot order. A restore keeps its
-- existing wallet-then-building order and never asks for another lock afterward.
create or replace function public.island_walls_record(
  p_player_id uuid,
  p_wave_id   uuid,
  p_walls     jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner       uuid;
  v_starts_at   timestamptz;
  v_inserted    integer;
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

  select island_owner, starts_at into v_owner, v_starts_at
    from public.wave_runs
   where id = p_wave_id and place = 'island';
  if v_owner is null or not exists (
    select 1 from public.wave_participants
     where wave_id = p_wave_id and player_id = p_player_id
  ) then
    return jsonb_build_object('status', 'skipped');
  end if;

  -- Stable row-lock order also makes a multi-wall report safe beside repairs.
  perform building.plot
    from public.islet_buildings building
   where building.player_id = v_owner
     and building.building_type = 'wall'
     and building.plot in (select key from jsonb_each(p_walls))
   order by building.plot
     for update;

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
     and building.building_type = 'wall'
     and (building.wall_restored_at is null or building.wall_restored_at < v_starts_at);

  return jsonb_build_object('status', 'recorded');
end;
$$;
revoke all on function public.island_walls_record(uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.island_walls_record(uuid, uuid, jsonb) to service_role;

comment on function public.island_walls_record(uuid, uuid, jsonb) is
  'Keeps the wall health (percent) a finishing player''s simulation ended island wave p_wave_id with, once per wave. A paid restore after the wave started fences out its delayed report. Only service_role may run it.';

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
set search_path = ''
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
     set wall_health = 100,
         wall_damaged_at = null,
         wall_restored_at = clock_timestamp()
   where player_id = p_island_owner and plot = p_plot;

  return jsonb_build_object('status', 'done', 'balance', v_balance, 'price', v_price, 'repeat', false);
end;
$$;
revoke all on function public.island_wall_restore(uuid, uuid, text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.island_wall_restore(uuid, uuid, text, text, integer, integer)
  to service_role;

comment on function public.island_wall_restore(uuid, uuid, text, text, integer, integer) is
  'Repairs or rebuilds one wall between waves, paid through the wallet ledger. The successful restore time fences out delayed reports from waves already started. Locks wallet then building; only service_role may run it.';
