-- Coherent shared member snapshots and authenticated root-origin discovery.
-- Reads lock existing state but never create profiles, grant money or expire waves.

-- Resolve a retry before current authority checks, waiting for its original target scope.
create or replace function public.island_economy_operation_origin(
  p_actor_id uuid, p_island_owner uuid, p_run_epoch uuid, p_action_uid text,
  p_domain_action text
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_operation public.island_economy_operations;
  v_account public.island_economy_accounts;
begin
  if p_actor_id is null or p_island_owner is null or p_run_epoch is null
    or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
    or left(p_action_uid,3) = 'fx_' or left(p_action_uid,4) = 'sys_'
    or p_domain_action is null or p_domain_action !~ '^[a-z][a-z0-9_:.-]{0,79}$' then
    return jsonb_build_object('status','refused','reason','invalid_change');
  end if;
  perform public.island_treasury_lock_scope(p_island_owner);
  select * into v_operation from public.island_economy_operations
   where actor_id = p_actor_id and action_uid = p_action_uid;
  if not found then return jsonb_build_object('status','new'); end if;
  select * into v_account from public.island_economy_accounts where id = v_operation.account_id;
  if not v_operation.is_player_intent or v_operation.domain_action <> p_domain_action
     or v_operation.run_epoch is distinct from p_run_epoch
     or v_account.island_owner is distinct from p_island_owner then
    return jsonb_build_object('status','refused','reason','action_conflict');
  end if;
  return jsonb_build_object('status','replay','origin',jsonb_build_object(
    'mode','island_shared','version',1,'islandOwner',v_account.island_owner,
    'accountId',v_account.id,'runEpoch',v_account.run_epoch));
end;
$$;
comment on function public.island_economy_operation_origin(uuid,uuid,uuid,text,text) is
  'Actor-owned immutable origin only. No claim, membership grant or current projection. Exact intent and original receipt remain the domain transaction responsibility.';

-- Read one target and personal projection after all authority locks, including paused reads.
create or replace function public.island_economy_snapshot(p_actor_id uuid,p_island_owner uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_account public.island_economy_accounts;
  v_state public.island_economy_state;
  v_island public.islands;
  v_recovery public.island_recovery_state;
  v_building public.islet_buildings;
  v_health public.island_structure_health;
  v_personal jsonb;
  v_buildings jsonb := '[]'::jsonb;
  v_research jsonb;
  v_layout jsonb;
  v_refund numeric;
  v_refund_reason text;
  v_hp integer;
  v_reserved boolean;
  v_owner_name text;
  v_now timestamptz;
begin
  if p_actor_id is null or p_island_owner is null then
    return jsonb_build_object('status','refused','reason','invalid_change');
  end if;
  perform public.island_treasury_lock_scope(p_island_owner);
  select * into v_state from public.island_economy_state where island_owner = p_island_owner;
  if not found then return jsonb_build_object('status','refused','reason','account_missing'); end if;
  select * into v_account from public.island_economy_accounts
   where id = v_state.current_account_id for update;
  if not found then return jsonb_build_object('status','refused','reason','path_unavailable'); end if;

  -- Both known profile anchors use one order; owner display-name changes cannot mix the read.
  perform 1 from public.profiles where id in (p_actor_id,p_island_owner)
   order by id for no key update;
  if not exists (select 1 from public.profiles where id = p_actor_id) then
    return jsonb_build_object('status','refused','reason','player_not_set_up');
  end if;
  perform 1 from public.personal_captain_profiles where player_id = p_actor_id for update;
  if found then v_personal := public.personal_captain_snapshot_locked(p_actor_id); end if;
  select * into v_island from public.islands where player_id = p_island_owner for update;
  if not found then return jsonb_build_object('status','missing_island'); end if;
  if p_actor_id <> p_island_owner and not exists (
    select 1 from public.island_members where island_owner = p_island_owner
      and player_id = p_actor_id and left_at is null) then
    return jsonb_build_object('status','refused','reason','not_member');
  end if;
  select * into strict v_state from public.island_economy_state
   where island_owner = p_island_owner for update;
  if v_account.state <> 'active' or v_state.current_account_id is distinct from v_account.id
     or v_state.run_epoch is distinct from v_account.run_epoch
     or v_account.island_owner <> p_island_owner
     or v_state.admission_state not in ('active','paused') then
    return jsonb_build_object('status','refused','reason','path_unavailable');
  end if;
  select * into v_recovery from public.island_recovery_state
   where island_owner = p_island_owner for update;
  if not found then
    return jsonb_build_object('status','refused','reason','recovery_state_incomplete');
  end if;
  perform 1 from public.islet_buildings where player_id = p_island_owner order by plot for update;
  perform 1 from public.island_structure_health where island_owner = p_island_owner order by spot for update;
  perform 1 from public.island_research where island_owner = p_island_owner order by branch for update;
  perform 1 from public.island_layout where island_owner = p_island_owner order by plot for update;
  v_now := clock_timestamp();
  v_reserved := v_recovery.current_wave_id is not null or exists (
    select 1 from public.wave_runs where island_owner = p_island_owner and finished_at is null);
  select display_name into strict v_owner_name from public.profiles where id = p_island_owner;

  for v_building in select * from public.islet_buildings
    where player_id = p_island_owner order by plot loop
    v_refund := null; v_refund_reason := null; v_hp := null;
    begin
      v_refund := public.island_construction_refund(v_account.id,v_building.recovery_instance_id,
        v_building.level);
    exception when raise_exception then
      if sqlerrm <> 'construction_basis_missing' then raise; end if;
      v_refund_reason := 'construction_basis_missing';
    end;
    select * into v_health from public.island_structure_health
     where island_owner = p_island_owner and spot = v_building.plot
       and instance_id = v_building.recovery_instance_id;
    if found and v_recovery.recovery_version = 1 and not v_reserved then
      v_hp := public.structure_recovery_project_hp(v_health.hp_units,
        greatest(0,floor(extract(epoch from (v_now-v_health.settled_at))*1000))::bigint,
        v_health.rate_numerator,v_health.rate_denominator);
    end if;
    v_buildings := v_buildings || jsonb_build_array(jsonb_build_object(
      'spot',v_building.plot,'kind',v_building.building_type,'level',v_building.level,
      'instanceId',v_building.recovery_instance_id,'spec',v_building.spec,
      'treeA',v_building.tree_a,'treeB',v_building.tree_b,
      'revision',trunc(v_building.economy_upgrade_revision)::text,
      'refundCoins',case when v_refund is not null then trunc(v_refund)::text end,
      'refundReason',v_refund_reason,'hpUnits',v_hp,'maxHP',v_health.max_hp));
  end loop;
  select coalesce(jsonb_agg(public.island_progression_research_state(r) || jsonb_build_object(
    'branch',r.branch,'coinsPaid',trunc(r.coins_paid)::text) order by r.branch),'[]'::jsonb)
   into v_research from public.island_research r where island_owner = p_island_owner;
  select coalesce(jsonb_agg(jsonb_build_object('plot',plot,'xHalf',x_half,'zHalf',z_half)
    order by plot),'[]'::jsonb) into v_layout from public.island_layout
   where island_owner = p_island_owner;
  if jsonb_array_length(v_buildings) > 50 or jsonb_array_length(v_research) > 10
     or jsonb_array_length(v_layout) > 50 then
    return jsonb_build_object('status','refused','reason','path_unavailable');
  end if;
  return jsonb_build_object('status','ok','actorId',p_actor_id,'owner',p_island_owner,
    'code',v_island.code,'ownerName',v_owner_name,
    'economy',public.island_treasury_envelope(v_account),'admissionState',v_state.admission_state,
    'waveBest',v_island.wave_best,'nextWave',v_island.next_wave,'flags',v_island.flags,
    'crew',jsonb_build_object('gunner',v_island.crew_gunner,'carpenter',v_island.crew_carpenter,
      'lookout',v_island.crew_lookout,'guard',v_island.crew_guard),
    'personal',v_personal,'buildings',v_buildings,'research',v_research,'layout',v_layout,
    'wreckPaid',v_island.wreck_paid,'recoveryVersion',v_recovery.recovery_version,
    'waveProtocol',v_recovery.wave_protocol,'serverNow',v_now,'reserved',v_reserved);
end;
$$;
comment on function public.island_economy_snapshot(uuid,uuid) is
  'Current member-only coherent target and authenticated personal facts, readable while paused. No legacy wallet, implicit initialization, wave settlement or guessed session authority.';

revoke all on function public.island_economy_operation_origin(uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.island_economy_snapshot(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.island_economy_operation_origin(uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.island_economy_snapshot(uuid,uuid) to service_role;
