-- #415: require an accepted recovery checkpoint before using the finish fallback.
-- The reward migration keeps recovery_wave_finish as the public entry point. Replace only the body
-- it delegates to, keeping the wrapper, locks, expiry handling and payouts intact.
create or replace function public.recovery_wave_finish_before_reward_recovery(
  p_player_id uuid, p_wave_id uuid, p_survived boolean, p_ships_sunk integer,
  p_loot_base integer, p_loot_per_wave integer, p_loot_per_house integer,
  p_point_loot_base integer, p_boss_every integer, p_boss_multiplier integer,
  p_restart_back integer, p_island_epoch uuid, p_checkpoint_uid text,
  p_through_tick integer, p_input_head_seq bigint, p_last_repair_seq bigint,
  p_basis_repair_seq jsonb, p_hp_units jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_balance bigint;
  v_server_now timestamptz;
  v_island_state public.island_recovery_state;
  v_wave public.recovery_wave_states;
  v_run public.wave_runs;
  v_part public.wave_participants;
  v_checkpoint jsonb;
  v_result jsonb;
  v_recovery jsonb;
  v_closed_hp jsonb;
  v_basis jsonb;
  v_structure jsonb;
  v_event public.recovery_wave_events;
  v_instance text;
  v_previous_basis bigint;
  v_wave_best integer;
  v_flags integer;
  v_houses integer := 0;
  v_loot integer := 0;
  v_base integer := 0;
  v_boss boolean := false;
  v_status jsonb;
  v_repeat boolean := false;
  v_is_expired boolean := false;
  v_survived boolean;
begin
  if p_player_id is null or p_wave_id is null or p_survived is null
     or p_ships_sunk is null or p_ships_sunk not between 0 and 1000
     or p_loot_base is null or p_loot_base < 0
     or p_loot_per_wave is null or p_loot_per_wave < 0
     or p_loot_per_house is null or p_loot_per_house < 0
     or p_point_loot_base is null or p_point_loot_base < 0
     or p_boss_every is null or p_boss_every < 0
     or p_boss_multiplier is null or p_boss_multiplier not between 1 and 10
     or p_restart_back is null or p_restart_back < 0 then
    raise exception 'bad_wave_finish';
  end if;
  select balance into v_balance from public.wallets where player_id=p_player_id for update;
  if not found then return jsonb_build_object('status','refused','reason','player_not_set_up'); end if;
  select island_owner into v_owner from public.wave_runs where id=p_wave_id;
  if not found or v_owner is null then
    return jsonb_build_object('status','refused','reason','no_such_wave');
  end if;
  perform 1 from public.islands where player_id in (v_owner,p_player_id) order by player_id for update;
  if not exists(select 1 from public.islands where player_id=v_owner) then
    return jsonb_build_object('status','refused','reason','no_such_wave');
  end if;
  v_server_now := clock_timestamp();
  select * into v_island_state from public.island_recovery_state
   where island_owner=v_owner for update;
  select * into v_wave from public.recovery_wave_states where wave_id=p_wave_id for update;
  if not found then return jsonb_build_object('status','refused','reason','client_update_required'); end if;
  select * into v_run from public.wave_runs where id=p_wave_id for update;
  if not found then return jsonb_build_object('status','refused','reason','no_such_wave'); end if;
  v_boss := p_boss_every > 0 and v_run.wave % p_boss_every = 0;
  select * into v_part from public.wave_participants
   where wave_id=p_wave_id and player_id=p_player_id for update;
  if not found then return jsonb_build_object('status','refused','reason','not_in_wave'); end if;
  v_repeat := v_part.finished_at is not null;
  if v_wave.recovery_version<>1 or v_wave.wave_protocol<>2 then
    return jsonb_build_object('status','refused','reason','client_update_required');
  end if;
  if v_wave.closed_at is null and (p_island_epoch is distinct from v_wave.reset_epoch
       or v_island_state.reset_epoch is distinct from v_wave.reset_epoch
       or v_island_state.current_wave_id is distinct from p_wave_id) then
    return jsonb_build_object('status','refused','reason','epoch_mismatch');
  end if;

  -- Exact expiry is a canonical settlement boundary and never pays a late local win.
  if v_wave.closed_at is null
     and v_server_now >= v_run.starts_at + make_interval(secs=>v_run.maximum_seconds) then
    v_is_expired := true;
    perform public.structure_recovery_settle_locked(v_owner,v_server_now);
    select * into v_wave from public.recovery_wave_states where wave_id=p_wave_id for update;
    v_closed_hp := public.structure_recovery_wave_hp(p_wave_id);
    update public.recovery_wave_states set closed_at=v_server_now,closed_hp=v_closed_hp
     where wave_id=p_wave_id and closed_at is null;
    select * into v_wave from public.recovery_wave_states where wave_id=p_wave_id for update;
    v_repeat := v_part.finished_at is not null;
    update public.wave_participants set finished_at=v_server_now,survived=false,
      ships_sunk=0,loot=0,expired=true
     where wave_id=p_wave_id and player_id=p_player_id and finished_at is null
     returning * into v_part;
    update public.wave_runs set finished_at=v_server_now,survived=false,
      ships_sunk=0,loot=0,expired=true
     where id=p_wave_id and finished_at is null;
    select wave_best,flags into v_wave_best,v_flags from public.islands where player_id=v_owner;
    v_basis := '{}'::jsonb;
    for v_structure in select value from jsonb_array_elements(v_wave.initial_snapshot -> 'structures') as item(value)
    loop
      v_instance := v_structure ->> 'instanceId';
      if v_instance is null then raise exception 'recovery_snapshot_incomplete'; end if;
      v_basis := jsonb_set(v_basis,array[v_instance],
        coalesce(v_structure -> 'repairSeq','0'::jsonb),true);
    end loop;
    for v_event in select * from public.recovery_wave_events
      where wave_id=p_wave_id and event_kind='structure_repaired' order by seq
    loop
      v_instance := v_event.payload ->> 'instanceId';
      v_previous_basis := coalesce((v_basis ->> v_instance)::bigint,0);
      v_basis := jsonb_set(v_basis,array[v_instance],
        to_jsonb(greatest(v_previous_basis,(v_event.payload ->> 'repairSeq')::bigint)),true);
    end loop;
    v_recovery := jsonb_build_object(
      'waveId',p_wave_id,'islandEpoch',v_wave.reset_epoch,'closedAt',v_wave.closed_at,
      'closedHp',v_wave.closed_hp,'checkpointUid',null,
      'throughTick',greatest(0,v_run.maximum_seconds*20-1),
      'inputHeadSeq',v_wave.journal_head,
      'lastRepairSeq',v_wave.last_repair_seq,
      'basisRepairSeq',v_basis);
    return jsonb_build_object('status','done','loot',0,'balance',v_balance,
      'survived',false,'wave',v_run.wave,'waveBest',v_wave_best,'flags',v_flags,
      'expired',true,'repeat',v_repeat,
      'boss',v_boss,'recovery',v_recovery);
  end if;

  if v_wave.closed_at is null then
    if p_checkpoint_uid is null or p_through_tick is null or p_input_head_seq is null
       or p_last_repair_seq is null or jsonb_typeof(p_basis_repair_seq) is distinct from 'object'
       or jsonb_typeof(p_hp_units) is distinct from 'object' then
      return jsonb_build_object('status','refused','reason','health_sync_required');
    end if;
    if v_server_now < v_run.starts_at + make_interval(secs=>v_run.minimum_seconds)
       and v_part.finished_at is null then
      return jsonb_build_object('status','refused','reason','too_early',
        'waitSeconds',greatest(1,ceil(extract(epoch from
          v_run.starts_at+make_interval(secs=>v_run.minimum_seconds)-v_server_now))::integer));
    end if;
    -- The caller's own complete prefix closes the wave: any through tick up to the current seal and
    -- any head up to the journal head, as long as no committed event inside it is missing. Later
    -- repairs are merged by structure_recovery_wave_hp. A checkpoint older than (or diverging from)
    -- one already accepted is not stored; the close then uses the accepted one.
    v_checkpoint := public.recovery_wave_report_health_locked(
      p_player_id,p_wave_id,p_island_epoch,p_checkpoint_uid,p_through_tick,
      p_input_head_seq,p_last_repair_seq,p_basis_repair_seq,p_hp_units,v_server_now);
    -- A fallback can close only the canonical checkpoint already accepted under this wave lock.
    if v_checkpoint ->> 'status'<>'accepted'
       and (coalesce(v_checkpoint ->> 'reason','') not in ('checkpoint_stale','checkpoint_divergence')
            or v_wave.checkpoint_uid is null or v_wave.checkpoint_accepted_at is null) then
      return v_checkpoint;
    end if;
    select * into v_wave from public.recovery_wave_states where wave_id=p_wave_id for update;
  end if;

  -- The first close decides the wave for everybody; a later finisher gets its outcome.
  v_survived := case when v_run.finished_at is not null and not coalesce(v_run.expired,false)
                     then coalesce(v_run.survived, p_survived) else p_survived end;

  -- Expiry closes canonical HP without credit; later callers cannot turn it into a win.
  v_is_expired := v_is_expired or v_run.expired or (
    v_wave.closed_at is not null and v_run.finished_at is null
    and v_wave.closed_at >= v_run.starts_at + make_interval(secs=>v_run.maximum_seconds)
  );
  if v_is_expired then
    if not v_run.expired then
      update public.wave_runs set finished_at=v_wave.closed_at,survived=false,
        ships_sunk=0,loot=0,expired=true where id=p_wave_id and finished_at is null;
      v_run.finished_at := v_wave.closed_at;
      v_run.expired := true;
      v_run.survived := false;
      v_run.ships_sunk := 0;
      v_run.loot := 0;
    end if;
    if v_part.finished_at is null then
      update public.wave_participants set finished_at=v_server_now,survived=false,
        ships_sunk=0,loot=0,expired=true
       where wave_id=p_wave_id and player_id=p_player_id returning * into v_part;
    end if;
    select wave_best,flags into v_wave_best,v_flags from public.islands where player_id=v_owner;
    v_result := jsonb_build_object('status','done','loot',v_part.loot,'balance',v_balance,
      'survived',v_part.survived,'wave',v_run.wave,'waveBest',v_wave_best,'flags',v_flags,
      'expired',true,'repeat',v_repeat,
      'boss',p_boss_every>0 and v_run.wave%p_boss_every=0);
  elsif not v_repeat
        and v_server_now > v_run.starts_at + make_interval(secs=>v_run.maximum_seconds) then
    update public.wave_participants set finished_at=v_server_now,survived=false,
      ships_sunk=0,loot=0,expired=true
     where wave_id=p_wave_id and player_id=p_player_id returning * into v_part;
    select wave_best,flags into v_wave_best,v_flags from public.islands where player_id=v_owner;
    v_result := jsonb_build_object('status','done','loot',0,'balance',v_balance,
      'survived',false,'wave',v_run.wave,'waveBest',v_wave_best,'flags',v_flags,
      'expired',true,'repeat',false,
      'boss',p_boss_every>0 and v_run.wave%p_boss_every=0);
  else
    if not v_repeat and v_server_now < v_run.starts_at + make_interval(secs=>v_run.minimum_seconds) then
      return jsonb_build_object('status','refused','reason','too_early',
        'waitSeconds',greatest(1,ceil(extract(epoch from
          v_run.starts_at+make_interval(secs=>v_run.minimum_seconds)-v_server_now))::integer));
    end if;
    if not v_repeat then
      if v_survived then
        v_base := p_loot_base;
        select coalesce(sum(level),0) into v_houses from public.islet_buildings
         where player_id=v_owner and building_type='house';
        v_loot := v_base + p_loot_per_wave*v_run.wave + p_loot_per_house*v_houses;
        if v_boss then v_loot := v_loot*p_boss_multiplier; end if;
      end if;
      update public.wave_participants set finished_at=v_server_now,survived=v_survived,
        ships_sunk=p_ships_sunk,loot=v_loot,expired=false
       where wave_id=p_wave_id and player_id=p_player_id returning * into v_part;
      if v_run.finished_at is null then
        update public.wave_runs set finished_at=v_server_now,survived=v_survived,
          ships_sunk=p_ships_sunk,loot=v_loot where id=p_wave_id;
      end if;
      if not v_survived and v_run.finished_at is null and not v_run.flag_counted then
        update public.islands set next_wave=greatest(1,wave_best-p_restart_back)
         where player_id=v_owner;
      end if;
      if v_survived and not v_run.flag_counted then
        update public.wave_runs set flag_counted=true where id=p_wave_id;
        update public.islands set wave_best=greatest(wave_best,v_run.wave),flags=flags+1,
          next_wave=v_run.wave+1
         where player_id=v_owner;
      end if;
      if v_survived then
        update public.islands set won_wave_best=greatest(won_wave_best,v_run.wave)
         where player_id=p_player_id and won_wave_best<v_run.wave;
      end if;
      if v_loot>0 then
        v_balance := public.apply_wallet_transaction(p_player_id,v_loot,'pirate_loot',
          'wave:'||v_run.id::text||':'||p_player_id::text);
      end if;
      if v_wave.closed_at is null then
        v_closed_hp := public.structure_recovery_wave_hp(p_wave_id);
        update public.recovery_wave_states set closed_at=v_server_now,closed_hp=v_closed_hp
         where wave_id=p_wave_id and closed_at is null;
        perform public.structure_recovery_settle_locked(v_owner,v_server_now);
      end if;
    end if;
    select wave_best,flags into v_wave_best,v_flags from public.islands where player_id=v_owner;
    v_result := jsonb_build_object('status','done','loot',v_part.loot,'balance',v_balance,
      'survived',v_part.survived,'wave',v_run.wave,'waveBest',v_wave_best,'flags',v_flags,
      'expired',v_part.expired,'repeat',v_repeat,
      'boss',v_boss);
  end if;
  select * into v_wave from public.recovery_wave_states where wave_id=p_wave_id;
  if v_is_expired then
    v_basis := '{}'::jsonb;
    for v_structure in select value from jsonb_array_elements(v_wave.initial_snapshot -> 'structures') as item(value)
    loop
      v_instance := v_structure ->> 'instanceId';
      if v_instance is null then raise exception 'recovery_snapshot_incomplete'; end if;
      v_basis := jsonb_set(v_basis,array[v_instance],
        coalesce(v_structure -> 'repairSeq','0'::jsonb),true);
    end loop;
    for v_event in select * from public.recovery_wave_events
      where wave_id=p_wave_id and event_kind='structure_repaired' order by seq
    loop
      v_instance := v_event.payload ->> 'instanceId';
      v_previous_basis := coalesce((v_basis ->> v_instance)::bigint,0);
      v_basis := jsonb_set(v_basis,array[v_instance],
        to_jsonb(greatest(v_previous_basis,(v_event.payload ->> 'repairSeq')::bigint)),true);
    end loop;
  end if;
  v_recovery := jsonb_build_object(
    'waveId',p_wave_id,'islandEpoch',v_wave.reset_epoch,'closedAt',v_wave.closed_at,
    'closedHp',v_wave.closed_hp,
    'checkpointUid',case when v_is_expired then null else v_wave.checkpoint_uid end,
    'throughTick',case when v_is_expired then greatest(0,v_run.maximum_seconds*20-1)
                       else coalesce(v_wave.checkpoint_through_tick,greatest(0,v_wave.sealed_through_tick)) end,
    'inputHeadSeq',case when v_is_expired then v_wave.journal_head
                        else coalesce(v_wave.checkpoint_input_head_seq,v_wave.journal_head) end,
    'lastRepairSeq',v_wave.last_repair_seq,
    'basisRepairSeq',case when v_is_expired then v_basis
                          else coalesce(v_wave.checkpoint_basis_repair_seq,'{}'::jsonb) end);
  return v_result || jsonb_build_object('recovery',v_recovery);
end;
$$;

revoke all on function public.recovery_wave_finish_before_reward_recovery(uuid,uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer,uuid,text,integer,bigint,bigint,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.recovery_wave_finish_before_reward_recovery(uuid,uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer,uuid,text,integer,bigint,bigint,jsonb,jsonb) to service_role;
comment on function public.recovery_wave_finish_before_reward_recovery(uuid,uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer,uuid,text,integer,bigint,bigint,jsonb,jsonb) is
  'Settles a recovery wave using the first valid sealed checkpoint or an already accepted canonical checkpoint. Later participants receive the saved result and their own idempotent loot.';
