-- Atomic core legacy fences, used before shared HTTP/personal-v1 route integration.
-- Requires the MP-ECO-04 grant/build scope guards; no admission or new mode is activated.

-- Capture each supported body once. The removed unchecked island_respec stays absent.
do $$
declare v_item record; v_definition text;
begin
  for v_item in select * from (values
    ('islet_build','uuid,text,text,bigint,integer,integer,text'),
    ('island_captain','uuid,text,integer[],integer'),
    ('island_learn_skill','uuid,text,text,jsonb,integer'),
    ('island_pick_role','uuid,text,integer'),
    ('island_respec_at_level','uuid,text,integer'),
    ('island_open','uuid,text,bigint'),
    ('island_fresh_start','uuid,text,text,integer')
  ) as functions(name, arguments) loop
    if to_regprocedure('public.'||v_item.name||'_core_legacy_personal('||v_item.arguments||')')
      is null then
      v_definition := pg_get_functiondef(to_regprocedure('public.'||v_item.name||
        '('||v_item.arguments||')'));
      if v_definition is null or position(v_item.name||'_core_legacy_personal' in v_definition)>0
        then raise exception 'core_legacy_source_missing'; end if;
      execute regexp_replace(v_definition,'FUNCTION public\.'||v_item.name||'\(',
        'FUNCTION public.'||v_item.name||'_core_legacy_personal(');
    end if;
    execute format('revoke all on function public.%I(%s) from public,anon,authenticated,service_role',
      v_item.name||'_core_legacy_personal',v_item.arguments);
  end loop;
end;
$$;

-- Actor-only entries serialize with admission and the actor scopes of visiting builds.
create or replace function public.island_economy_core_legacy_gate_locked(p_actor_id uuid)
returns text language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.island_treasury_lock_scope(p_actor_id);
  if exists (select 1 from public.island_economy_state where island_owner=p_actor_id) then
    return 'economy_context_required';
  end if;
  perform 1 from public.wallets where player_id=p_actor_id for update;
  perform 1 from public.profiles where id=p_actor_id for no key update;
  if not found then return null; end if;
  -- Keep the earlier scope/wallet/profile locks when translating the managed refusal.
  begin
    perform public.personal_captain_legacy_guard_locked(p_actor_id);
  exception when raise_exception then
    if sqlerrm='personal_captain_managed' then return 'captain_context_required'; end if;
    raise;
  end;
  return null;
end;
$$;
comment on function public.island_economy_core_legacy_gate_locked(uuid) is
  'Private actor scope then wallet/profile guard. Null permits only the original legacy body and never creates missing setup. Any admitted own island or global managed Captain refuses unsupported edits. Missing schema/hooks fail closed.';
revoke all on function public.island_economy_core_legacy_gate_locked(uuid)
  from public,anon,authenticated,service_role;

-- The old own-islet route writes island assets too; it must not bypass shared funding.
create or replace function public.islet_build(
  p_player_id uuid,p_plot text,p_building_type text,p_coins bigint,
  p_timber integer,p_starter_timber integer,p_ref text
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_reason text;
begin
  v_reason := public.island_economy_core_legacy_gate_locked(p_player_id);
  if v_reason is not null then
    return jsonb_build_object('status','refused','reason',v_reason); end if;
  return public.islet_build_core_legacy_personal(p_player_id,p_plot,p_building_type,
    p_coins,p_timber,p_starter_timber,p_ref);
end;
$$;
comment on function public.islet_build(uuid,text,text,bigint,integer,integer,text) is
  'Original home-islet build only for an unadopted actor/target. Atomic mode/personal fencing precedes its private wallet and asset changes.';

-- Paid legacy levels cannot change or charge a globally managed Captain.
create or replace function public.island_captain(
  p_player_id uuid,p_action_uid text,p_prices integer[],p_unlocked_level integer
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_reason text;
begin
  v_reason := public.island_economy_core_legacy_gate_locked(p_player_id);
  if v_reason is not null then
    return jsonb_build_object('status','refused','reason',v_reason); end if;
  return public.island_captain_core_legacy_personal(p_player_id,p_action_uid,p_prices,
    p_unlocked_level);
end;
$$;
comment on function public.island_captain(uuid,text,integer[],integer) is
  'Legacy paid Captain levels preserve their original behavior only before island/personal adoption; no new paid v1 level path.';

-- Old skill learns cannot bypass the global personal profile or frozen assignment.
create or replace function public.island_learn_skill(
  p_player_id uuid,p_skill text,p_action_uid text,p_tree jsonb,p_waves_per_point integer
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_reason text;
begin
  v_reason := public.island_economy_core_legacy_gate_locked(p_player_id);
  if v_reason is not null then
    return jsonb_build_object('status','refused','reason',v_reason); end if;
  return public.island_learn_skill_core_legacy_personal(p_player_id,p_skill,p_action_uid,
    p_tree,p_waves_per_point);
end;
$$;
comment on function public.island_learn_skill(uuid,text,text,jsonb,integer) is
  'Original skill learn only before island/global personal adoption, with existing legacy receipts and recovery policy retained.';

-- Role selection must not rewrite an old mirror underneath a managed Engineer.
create or replace function public.island_pick_role(
  p_player_id uuid,p_role text,p_min_level integer
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_reason text;
begin
  v_reason := public.island_economy_core_legacy_gate_locked(p_player_id);
  if v_reason is not null then
    return jsonb_build_object('status','refused','reason',v_reason); end if;
  return public.island_pick_role_core_legacy_personal(p_player_id,p_role,p_min_level);
end;
$$;
comment on function public.island_pick_role(uuid,text,integer) is
  'Original legacy role choice, refused after island or global personal adoption even on a legacy-money home.';

-- Keep the checked legacy respec; never resurrect the dropped unchecked overload.
create or replace function public.island_respec_at_level(
  p_player_id uuid,p_action_uid text,p_per_level integer
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_reason text;
begin
  v_reason := public.island_economy_core_legacy_gate_locked(p_player_id);
  if v_reason is not null then
    return jsonb_build_object('status','refused','reason',v_reason); end if;
  return public.island_respec_at_level_core_legacy_personal(p_player_id,p_action_uid,p_per_level);
end;
$$;
comment on function public.island_respec_at_level(uuid,text,integer) is
  'Original priced legacy respec only before island/global personal adoption. Managed histories remain stored without executing old edits or inventing acknowledgements.';

-- Opening a managed legacy home is a read, never a grant or personal import.
create or replace function public.island_open(
  p_player_id uuid,p_code text,p_starting_coins bigint
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_reason text; v_island public.islands;
begin
  if p_player_id is null or p_code is null
    or p_code !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$'
    or p_starting_coins is null or p_starting_coins<1 or p_starting_coins>1000000 then
    raise exception 'bad_island'; end if;
  v_reason := public.island_economy_core_legacy_gate_locked(p_player_id);
  if v_reason='captain_context_required' then
    select * into v_island from public.islands where player_id=p_player_id for update;
    if found then
      return jsonb_build_object('status','open','code',v_island.code,'waveBest',v_island.wave_best,
        'flags',v_island.flags,'created',false,'paid',0);
    end if;
  end if;
  if v_reason is not null then
    return jsonb_build_object('status','refused','reason',v_reason); end if;
  return public.island_open_core_legacy_personal(p_player_id,p_code,p_starting_coins);
end;
$$;
comment on function public.island_open(uuid,text,bigint) is
  'Shared owners refuse the legacy open path. Managed existing legacy homes return only stored metadata, created false and paid zero; absent managed homes refuse. Original unadopted creation/grant is unchanged.';

-- The old reset may clear personal mirrors, history and private funds; adoption needs its own API.
create or replace function public.island_fresh_start(
  p_player_id uuid,p_action_uid text,p_confirm_code text,p_starting_coins integer
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_reason text;
begin
  v_reason := public.island_economy_core_legacy_gate_locked(p_player_id);
  if v_reason is not null then
    return jsonb_build_object('status','refused','reason',v_reason); end if;
  return public.island_fresh_start_core_legacy_personal(p_player_id,p_action_uid,p_confirm_code,
    p_starting_coins);
end;
$$;
comment on function public.island_fresh_start(uuid,text,text,integer) is
  'Original reset only before island/global personal adoption. Stored historical reset receipts are not changed or deleted when a managed old call refuses.';

-- Only the trusted server may enter the guarded public wrappers.
do $$
declare v_item record;
begin
  for v_item in select * from (values
    ('islet_build','uuid,text,text,bigint,integer,integer,text'),
    ('island_captain','uuid,text,integer[],integer'),
    ('island_learn_skill','uuid,text,text,jsonb,integer'),
    ('island_pick_role','uuid,text,integer'),
    ('island_respec_at_level','uuid,text,integer'),
    ('island_open','uuid,text,bigint'),
    ('island_fresh_start','uuid,text,text,integer')
  ) as functions(name, arguments) loop
    execute format('revoke all on function public.%I(%s) from public,anon,authenticated,service_role',
      v_item.name,v_item.arguments);
    execute format('grant execute on function public.%I(%s) to service_role',
      v_item.name,v_item.arguments);
  end loop;
end;
$$;
