-- Preserve repair effects while admitting locks through the canonical actor/profile chain.

create or replace function public.island_shared_structure_repair(
  p_actor_id uuid, p_island_owner uuid, p_account_id uuid, p_run_epoch uuid,
  p_action_uid text, p_expected_epoch uuid, p_expected_wave_id uuid,
  p_spot text, p_instance_id uuid, p_expected_level integer,
  p_expected_repair_seq bigint, p_quoted_price numeric
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_account public.island_economy_accounts;
  v_scope_key bigint;
  v_state public.island_recovery_state;
  v_wave public.recovery_wave_states;
  v_building public.islet_buildings;
  v_health public.island_structure_health;
  v_root jsonb;
  v_operation_id uuid;
  v_fingerprint jsonb;
  v_authority jsonb;
  v_binding jsonb;
  v_structure jsonb;
  v_prices jsonb;
  v_price numeric;
  v_hp jsonb;
  v_now timestamptz;
  v_event_seq bigint;
  v_repair_seq bigint;
  v_tick integer;
  v_money jsonb;
  v_receipt jsonb;
  v_result jsonb;
begin
  if p_actor_id is null or p_island_owner is null or p_account_id is null or p_run_epoch is null
     or p_expected_epoch is null or p_expected_wave_id is null or p_instance_id is null
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or left(p_action_uid,3) = 'fx_' or left(p_action_uid,4) = 'sys_'
     or p_spot is null or p_spot !~ '^[a-z][a-z0-9_]{1,39}$'
     or p_expected_level is null or p_expected_level not between 1 and 5
     or p_expected_repair_seq is null or p_expected_repair_seq < 0
     or p_expected_repair_seq = 9223372036854775807
     or not public.island_treasury_whole(p_quoted_price,false) then
    return jsonb_build_object('status','refused','reason','invalid_change');
  end if;
  -- Phase/wave/repair cursors are concurrency guards; refreshing them never creates a new paid intent.
  v_fingerprint := jsonb_build_object('islandOwner',p_island_owner,
    'recoveryEpoch',p_expected_epoch,'instanceId',p_instance_id,'spot',p_spot,
    'level',p_expected_level,'quotedPrice',trunc(p_quoted_price)::text);
  for v_scope_key in
    select distinct hashtextextended('island-economy:'||owner_id::text,0)
      from unnest(array[p_actor_id,p_island_owner]) owner_id order by 1
  loop
    perform pg_advisory_xact_lock(v_scope_key);
  end loop;
  select * into v_account from public.island_economy_accounts
    where id=p_account_id and island_owner=p_island_owner for update;
  if not found or v_account.island_owner <> p_island_owner then
    return jsonb_build_object('status','refused','reason','account_missing');
  end if;

  -- A refusal must roll back the root claim, not burn the player's UID or keep partial effects.
  begin
    v_root := public.island_economy_claim_operation_locked(p_actor_id,p_account_id,p_run_epoch,
      p_action_uid,'structure_repair',v_fingerprint);
    if v_root->>'status' = 'refused' then
      v_result := v_root; raise exception using errcode='PT012';
    end if;
    if v_root->>'status' = 'replay' then
      return public.island_shared_repair_replay(p_actor_id,p_island_owner,p_account_id,
        p_run_epoch,p_action_uid,v_fingerprint);
    end if;
    v_operation_id := (v_root->>'operationId')::uuid;
    -- Existing anchors only: repair remains available to a member without personal conversion.
    perform 1 from public.profiles where id=any(array[p_actor_id,p_island_owner])
      order by id for no key update;
    if not exists(select 1 from public.profiles where id=p_actor_id) then
      v_result := jsonb_build_object('status','refused','reason','not_member');
      raise exception using errcode='PT012';
    end if;
    perform 1 from public.personal_captain_profiles
      where player_id=any(array[p_actor_id,p_island_owner]) order by player_id for update;
    perform 1 from public.islands where player_id=p_island_owner for update;
    if not found then
      v_result := jsonb_build_object('status','refused','reason','account_missing');
      raise exception using errcode='PT012';
    end if;
    if to_regprocedure('public.island_economy_authority(uuid,uuid)') is null then
      v_result := jsonb_build_object('status','refused','reason','path_unavailable');
      raise exception using errcode='PT012';
    end if;
    execute 'select public.island_economy_authority($1,$2)' into v_authority
      using p_actor_id,p_island_owner;
    if jsonb_typeof(v_authority) is distinct from 'object' then
      v_result := jsonb_build_object('status','refused','reason','path_unavailable');
      raise exception using errcode='PT012';
    end if;
    if not (v_authority ?& array['actor_id','island_owner','is_member','reservation_id',
        'session_leader_id','actor_assignment_wave_id'])
       or exists(select 1 from jsonb_object_keys(v_authority) k where k not in
         ('actor_id','island_owner','is_member','reservation_id','session_leader_id',
          'actor_assignment_wave_id'))
       or v_authority->'actor_id' is distinct from to_jsonb(p_actor_id::text)
       or v_authority->'island_owner' is distinct from to_jsonb(p_island_owner::text)
       or jsonb_typeof(v_authority->'is_member') is distinct from 'boolean'
       or exists(select 1 from jsonb_each(v_authority) e where e.key in
          ('reservation_id','session_leader_id','actor_assignment_wave_id')
          and e.value <> 'null'::jsonb and (jsonb_typeof(e.value) <> 'string'
            or e.value#>>'{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) then
      v_result := jsonb_build_object('status','refused','reason','path_unavailable');
      raise exception using errcode='PT012';
    end if;
    if p_actor_id <> p_island_owner and (v_authority->'is_member' <> 'true'::jsonb
       or not exists(select 1 from public.island_members where island_owner=p_island_owner
         and player_id=p_actor_id and left_at is null)) then
      v_result := jsonb_build_object('status','refused','reason','not_member');
      raise exception using errcode='PT012';
    end if;
    if v_account.state <> 'active' or v_account.run_epoch <> p_run_epoch
       or not exists(select 1 from public.island_economy_state
         where island_owner=p_island_owner and current_account_id=p_account_id
           and run_epoch=p_run_epoch and admission_state='active') then
      v_result := jsonb_build_object('status','refused','reason','epoch_mismatch');
      raise exception using errcode='PT012';
    end if;
    select * into v_state from public.island_recovery_state
     where island_owner=p_island_owner for update;
    if not found or v_state.recovery_version <> 1 or v_state.wave_protocol <> 2
       or v_state.reset_epoch <> p_expected_epoch
       or v_state.current_wave_id is distinct from p_expected_wave_id
       or v_authority->'reservation_id' is distinct from to_jsonb(p_expected_wave_id::text) then
      v_result := jsonb_build_object('status','refused','reason','stale_recovery_quote');
      raise exception using errcode='PT012';
    end if;
    select * into v_wave from public.recovery_wave_states
     where wave_id=p_expected_wave_id and island_owner=p_island_owner for update;
    v_now := clock_timestamp();
    if not found or v_wave.reset_epoch <> p_expected_epoch
       or public.structure_recovery_phase(v_state.starts_at,v_state.expires_at,
         v_wave.closed_at,v_now) = 'between_waves'
       or public.recovery_wave_is_abandoned(v_state.starts_at,v_wave.last_activity_at,v_now) then
      v_result := jsonb_build_object('status','refused','reason','stale_recovery_quote');
      raise exception using errcode='PT012';
    end if;

    -- Require the immutable five-field origin written by the canonical accepted bell.
    v_binding := v_wave.initial_snapshot->'economy';
    if jsonb_typeof(v_binding) is distinct from 'object'
       or v_binding->'mode' is distinct from '"island_shared"'::jsonb
       or v_binding->'version' is distinct from '1'::jsonb
       or v_binding->'islandOwner' is distinct from to_jsonb(p_island_owner::text)
       or v_binding->'accountId' is distinct from to_jsonb(p_account_id::text)
       or v_binding->'runEpoch' is distinct from to_jsonb(p_run_epoch::text) then
      v_result := jsonb_build_object('status','refused','reason','path_unavailable');
      raise exception using errcode='PT012';
    end if;
    perform 1 from public.islet_buildings where player_id=p_island_owner order by plot for update;
    perform 1 from public.island_structure_health where island_owner=p_island_owner
     order by spot for update;
    select * into v_building from public.islet_buildings
     where player_id=p_island_owner and plot=p_spot and recovery_instance_id=p_instance_id;
    if not found or v_building.level <> p_expected_level then
      v_result := jsonb_build_object('status','refused','reason','stale_recovery_quote');
      raise exception using errcode='PT012';
    end if;
    if v_building.building_type not in ('wall','cannon','mortar','harpoon','culverin','swivel') then
      v_result := jsonb_build_object('status','refused','reason','wrong_kind');
      raise exception using errcode='PT012';
    end if;
    select * into v_health from public.island_structure_health
     where island_owner=p_island_owner and spot=p_spot and instance_id=p_instance_id;
    if not found or v_health.level <> p_expected_level
       or v_health.building_kind <> v_building.building_type
       or v_health.repair_seq <> p_expected_repair_seq then
      v_result := jsonb_build_object('status','refused','reason','stale_recovery_quote');
      raise exception using errcode='PT012';
    end if;
    if jsonb_typeof(v_wave.initial_snapshot->'structures') is distinct from 'array' then
      v_result := jsonb_build_object('status','refused','reason','path_unavailable');
      raise exception using errcode='PT012';
    end if;
    select item into v_structure from jsonb_array_elements(v_wave.initial_snapshot->'structures') item
     where item->>'instanceId'=p_instance_id::text and item->>'spot'=p_spot
       and item->>'kind'=v_building.building_type and item->'level'=to_jsonb(p_expected_level);
    v_prices := v_wave.initial_snapshot->'priceSchedule'->v_building.building_type;
    if v_structure is null or jsonb_typeof(v_structure->'maxHP') is distinct from 'number'
       or (v_structure->>'maxHP')::numeric not between 0.01 and 9999999999.99
       or jsonb_typeof(v_prices) is distinct from 'array'
       or jsonb_typeof(v_prices->(p_expected_level-1)) is distinct from 'number' then
      v_result := jsonb_build_object('status','refused','reason','path_unavailable');
      raise exception using errcode='PT012';
    end if;
    v_price := (v_prices->>(p_expected_level-1))::numeric;
    if not public.island_treasury_whole(v_price,false) or v_price <> p_quoted_price then
      v_result := jsonb_build_object('status','refused','reason','stale_recovery_quote');
      raise exception using errcode='PT012';
    end if;
    v_hp := public.structure_recovery_wave_hp(p_expected_wave_id)->p_instance_id::text;
    if jsonb_typeof(v_hp) is distinct from 'number' or (v_hp#>>'{}')::numeric not between 0 and 1000000
       or (v_hp#>>'{}')::numeric <> trunc((v_hp#>>'{}')::numeric) then
      v_result := jsonb_build_object('status','refused','reason','path_unavailable');
      raise exception using errcode='PT012';
    end if;
    if v_hp = '1000000'::jsonb then
      v_result := jsonb_build_object('status','refused','reason','intact');
      raise exception using errcode='PT012';
    end if;
    if v_wave.paid_used >= 3 then
      v_result := jsonb_build_object('status','refused','reason','repair_limit_reached');
      raise exception using errcode='PT012';
    end if;
    v_event_seq := v_wave.journal_head+1;
    v_repair_seq := v_health.repair_seq+1;
    v_tick := greatest(0,v_wave.sealed_through_tick+1,coalesce(v_wave.checkpoint_through_tick+1,0),
      floor(extract(epoch from (v_now-v_state.starts_at))*20)::integer);
    v_money := public.island_treasury_record_locked(p_account_id,p_actor_id,
      public.island_economy_effect_uid(v_operation_id,'repair'),'spend','structure_repair',
      'repair:'||v_operation_id::text,jsonb_build_object('operationId',v_operation_id,
        'price',trunc(v_price)::text),-v_price,0);
    if v_money->>'status' <> 'done' then
      v_result := v_money; raise exception using errcode='PT012';
    end if;
    if v_money->'repeat' is distinct from 'false'::jsonb then
      v_result := jsonb_build_object('status','refused','reason','path_unavailable');
      raise exception using errcode='PT012';
    end if;
    update public.island_structure_health set hp_units=1000000,settled_at=v_now,
      repair_seq=v_repair_seq,updated_at=v_now
     where island_owner=p_island_owner and spot=p_spot and instance_id=p_instance_id;
    insert into public.recovery_wave_events(wave_id,seq,actor_id,participant_token,input_uid,
      event_kind,effective_tick,payload)
    values(p_expected_wave_id,v_event_seq,null,null,null,'structure_repaired',v_tick,
      jsonb_build_object('spot',p_spot,'instanceId',p_instance_id,'hpUnits',1000000,
        'maxHP',v_structure->'maxHP','repairSeq',v_repair_seq,'chargedPrice',v_price));
    update public.recovery_wave_states set paid_used=paid_used+1,journal_head=v_event_seq,
      last_repair_seq=last_repair_seq+1 where wave_id=p_expected_wave_id;
    update public.island_recovery_state set revision=revision+1,updated_at=v_now
     where island_owner=p_island_owner;
    v_receipt := jsonb_build_object('receiptId',v_operation_id,'actionUid',p_action_uid,
      'action','structure_repair','actorId',p_actor_id,
      'origin',jsonb_build_object('mode','island_shared','version',1,'islandOwner',p_island_owner,
        'accountId',p_account_id,'runEpoch',p_run_epoch),
      'result',jsonb_build_object('recoveryEpoch',p_expected_epoch,'spot',p_spot,
        'instanceId',p_instance_id,'kind',v_building.building_type,'level',p_expected_level,
        'chargedPrice',trunc(v_price)::text,'waveId',p_expected_wave_id,
        'useOrdinal',v_wave.paid_used+1,'eventSeq',v_event_seq,'repairSeq',v_repair_seq,
        'financialReceipt',v_money->'receipt'));
    insert into public.island_shared_repair_receipts(operation_id,treasury_transaction_id,receipt_json)
    values(v_operation_id,(v_money->'receipt'->>'id')::uuid,v_receipt);
    return jsonb_build_object('status','done','repeat',false,'receipt',v_receipt,'currentEconomy',v_money->'currentEconomy');
  exception when sqlstate 'PT012' then
    return v_result;
  end;
end;
$$;
comment on function public.island_shared_structure_repair(uuid,uuid,uuid,uuid,text,uuid,uuid,text,uuid,integer,bigint,numeric) is
  'Canonical shared repair consumer. Locks sorted actor/owner scopes, matching account, root, existing sorted personal anchors, island/recovery/wave/structures. Original receipt precedes mutable authority; any member may repair without personal conversion. Exact frozen price, shared quota, financial child, HP, event and receipt remain atomic.';

revoke all on function public.island_shared_structure_repair(uuid,uuid,uuid,uuid,text,uuid,uuid,text,uuid,integer,bigint,numeric)
  from public,anon,authenticated,service_role;
grant execute on function public.island_shared_structure_repair(uuid,uuid,uuid,uuid,text,uuid,uuid,text,uuid,integer,bigint,numeric) to service_role;
