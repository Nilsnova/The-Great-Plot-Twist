-- Atomic paid, positioned wall runs. Requires trusted policy and bounded cohort migrations.
create table if not exists public.island_wall_build_receipts (
  payer uuid not null references auth.users(id) on delete cascade,
  action_uid text not null check (action_uid ~ '^[A-Za-z0-9_-]{8,64}$'),
  island_owner uuid not null references public.islands(player_id) on delete cascade,
  island_epoch uuid not null,
  intent jsonb not null,
  placements jsonb not null check (jsonb_typeof(placements) = 'array'
    and jsonb_array_length(placements) between 1 and 32),
  total_cost integer not null check (total_cost between 1 and 32000000),
  created_at timestamptz not null default clock_timestamp(),
  primary key (payer, action_uid)
);
comment on table public.island_wall_build_receipts is
  'Immutable historical positioned-run receipts. A retry never reconstructs reset or demolished pieces.';
alter table public.island_wall_build_receipts enable row level security;
revoke all on public.island_wall_build_receipts from public, anon, authenticated, service_role;
grant select, insert on public.island_wall_build_receipts to service_role;

-- Reconciliation remains available when offers pause. Access precedes receipt lookup.
create or replace function public.island_wall_build_receipt(
  p_player_id uuid, p_island_owner uuid, p_action_uid text, p_intent jsonb
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_done public.island_wall_build_receipts;
begin
  if p_player_id is null or p_island_owner is null or p_action_uid is null
    or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$' or jsonb_typeof(p_intent) is distinct from 'object' then
    raise exception 'bad_wall_build';
  end if;
  perform 1 from public.islands where player_id = p_island_owner for update;
  if not found then return jsonb_build_object('status','refused','reason','no_island'); end if;
  if p_player_id <> p_island_owner and not exists (select 1 from public.island_members
    where island_owner = p_island_owner and player_id = p_player_id and left_at is null) then
    return jsonb_build_object('status','refused','reason','not_member');
  end if;
  select * into v_done from public.island_wall_build_receipts
    where payer = p_player_id and action_uid = p_action_uid;
  if not found then return jsonb_build_object('status','missing'); end if;
  if v_done.island_owner <> p_island_owner or v_done.intent is distinct from p_intent then
    return jsonb_build_object('status','refused','reason','action_uid_conflict');
  end if;
  return jsonb_build_object('status','done','receipt',jsonb_build_object(
    'actionUid',v_done.action_uid,'placements',v_done.placements,'totalCost',v_done.total_cost,
    'islandEpoch',v_done.island_epoch,'repeat',true));
end;
$$;
revoke all on function public.island_wall_build_receipt(uuid,uuid,text,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.island_wall_build_receipt(uuid,uuid,text,jsonb) to service_role;
comment on function public.island_wall_build_receipt(uuid,uuid,text,jsonb) is
  'Access-fenced original-intent reconciliation, including paused offers and reset/rebuilt state.';

-- Python validates current terrain, final occupancy, unlocks and exact ordered quote.
-- The database fences that read, rechecks current identity/price context and commits all or none.
create or replace function public.island_wall_build(
  p_player_id uuid, p_island_owner uuid, p_action_uid text, p_intent jsonb,
  p_items jsonb, p_seen jsonb, p_expected_role text, p_expected_wave_best integer
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_balance bigint; v_reply jsonb; v_layout jsonb; v_context jsonb;
  v_placements jsonb; v_total bigint; v_item jsonb; v_ref text; v_role text; v_wave integer;
  v_epoch uuid; v_expected_epoch uuid; v_previous text;
begin
  if p_player_id is null or p_island_owner is null then raise exception 'bad_wall_build'; end if;
  -- Match existing purchase lock order; both progress rows are then locked in UUID order.
  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then return jsonb_build_object('status','refused','reason','player_not_set_up'); end if;
  perform 1 from public.islands where player_id = any(array[p_player_id,p_island_owner])
    order by player_id for update;
  v_reply := public.island_wall_build_receipt(p_player_id,p_island_owner,p_action_uid,p_intent);
  if v_reply ->> 'status' <> 'missing' then return v_reply; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 32
    or jsonb_typeof(p_seen) is distinct from 'array' or p_expected_wave_best is null then
    raise exception 'bad_wall_build';
  end if;
  if exists (select 1 from jsonb_array_elements(p_items) e where
    public.island_wall_number(e ->> 'spot') is null
    or jsonb_typeof(e -> 'price') is distinct from 'number'
    or (e ->> 'price')::numeric not between 1 and 1000000
    or (e ->> 'price')::numeric <> trunc((e ->> 'price')::numeric)
    or jsonb_typeof(e -> 'x_half') is distinct from 'number'
    or jsonb_typeof(e -> 'z_half') is distinct from 'number'
    or abs((e ->> 'x_half')::numeric) > 60 or abs((e ->> 'z_half')::numeric) > 60
    or (e ->> 'x_half')::numeric <> trunc((e ->> 'x_half')::numeric)
    or (e ->> 'z_half')::numeric <> trunc((e ->> 'z_half')::numeric))
    or (select count(distinct e ->> 'spot') from jsonb_array_elements(p_items) e)
      <> jsonb_array_length(p_items) then raise exception 'bad_wall_build'; end if;
  v_expected_epoch := (p_intent ->> 'islandEpoch')::uuid;
  if v_expected_epoch is null then raise exception 'bad_wall_build'; end if;
  select sum((e ->> 'price')::bigint), jsonb_agg(jsonb_build_object(
    'spot',e ->> 'spot','x',(e ->> 'x_half')::numeric/2,'z',(e ->> 'z_half')::numeric/2) order by n)
    into v_total,v_placements from jsonb_array_elements(p_items) with ordinality q(e,n);
  if p_intent is distinct from jsonb_build_object('placements',v_placements,'quotedTotal',v_total,'islandEpoch',v_expected_epoch) then
    return jsonb_build_object('status','refused','reason','quote_changed');
  end if;
  v_layout := public.island_wall_layout_read(p_island_owner);
  if (v_layout ->> 'ruleVersion')::integer <> 1 or (v_layout ->> 'capacity')::integer <> 128 then
    return jsonb_build_object('status','refused','reason','walls_not_ready');
  end if;
  if v_layout -> 'rows' is distinct from p_seen then
    return jsonb_build_object('status','refused','reason','busy');
  end if;
  select reset_epoch into v_epoch from public.island_recovery_state where island_owner=p_island_owner;
  if v_epoch is null or v_epoch is distinct from v_expected_epoch then
    return jsonb_build_object('status','refused','reason','quote_changed');
  end if;
  select captain_role into v_role from public.islands where player_id = p_player_id;
  select wave_best into v_wave from public.islands where player_id = p_island_owner;
  if v_role is distinct from p_expected_role or v_wave <> p_expected_wave_best then
    return jsonb_build_object('status','refused','reason','quote_changed');
  end if;
  if exists (select 1 from public.islet_buildings b join jsonb_array_elements(p_items) e
    on b.plot = e ->> 'spot' where b.player_id = p_island_owner) then
    return jsonb_build_object('status','refused','reason','spot_taken');
  end if;
  if v_balance < v_total then
    return jsonb_build_object('status','refused','reason','insufficient_funds','price',v_total);
  end if;
  v_context := public.structure_recovery_mutation_begin(p_island_owner);
  if v_context #>> '{settlement,status}' = 'reserved' or exists (
    select 1 from public.wave_runs where island_owner = p_island_owner and finished_at is null
      and starts_at + make_interval(secs => maximum_seconds) >= clock_timestamp()) then
    return jsonb_build_object('status','refused','reason','wave_running');
  end if;
  select reset_epoch into v_epoch from public.island_recovery_state where island_owner = p_island_owner;
  insert into public.islets(player_id,timber) values(p_island_owner,0) on conflict(player_id) do nothing;
  perform 1 from public.islets where player_id = p_island_owner for update;
  v_previous := current_setting('app.positioned_wall_build',true);
  perform set_config('app.positioned_wall_build',jsonb_build_object(
    'owner',p_island_owner,'payer',p_player_id,'actionUid',p_action_uid,
    'plots',(select jsonb_agg(e ->> 'spot') from jsonb_array_elements(p_items) e))::text,true);
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_ref := 'island:' || p_action_uid || ':' || (v_item ->> 'spot');
    insert into public.island_layout(island_owner,plot,x_half,z_half,moved_by)
      values(p_island_owner,v_item ->> 'spot',(v_item ->> 'x_half')::integer,
        (v_item ->> 'z_half')::integer,p_player_id)
      on conflict(island_owner,plot) do update set x_half=excluded.x_half,z_half=excluded.z_half,
        moved_by=excluded.moved_by,moved_at=now();
    v_balance := public.apply_wallet_transaction(p_player_id,-(v_item ->> 'price')::integer,
      'building_purchase',v_ref);
    insert into public.islet_buildings(player_id,plot,building_type,level,coins_paid,timber_paid,ref)
      values(p_island_owner,v_item ->> 'spot','wall',1,(v_item ->> 'price')::integer,0,v_ref);
    insert into public.building_payments(island_owner,plot,building_ref,level,payer,coins,ref)
      values(p_island_owner,v_item ->> 'spot',v_ref,1,p_player_id,(v_item ->> 'price')::integer,v_ref);
  end loop;
  perform set_config('app.positioned_wall_build',coalesce(v_previous,''),true);
  perform public.structure_recovery_mutation_finish(p_island_owner,v_context);
  insert into public.island_wall_build_receipts(payer,action_uid,island_owner,island_epoch,
    intent,placements,total_cost) values(p_player_id,p_action_uid,p_island_owner,v_epoch,
      p_intent,v_placements,v_total::integer);
  return jsonb_build_object('status','done','balance',v_balance,'receipt',jsonb_build_object(
    'actionUid',p_action_uid,'placements',v_placements,'totalCost',v_total,
    'islandEpoch',v_epoch,'repeat',false));
end;
$$;
revoke all on function public.island_wall_build(uuid,uuid,text,jsonb,jsonb,jsonb,text,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.island_wall_build(uuid,uuid,text,jsonb,jsonb,jsonb,text,integer)
  to service_role;
comment on function public.island_wall_build(uuid,uuid,text,jsonb,jsonb,jsonb,text,integer) is
  'Atomic bounded positioned purchase with original-intent receipt, current access, layout/policy/price fences, distinct piece payments and recovery refresh.';
