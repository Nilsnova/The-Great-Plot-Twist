-- Native protocol-2 shared bell/journal/closure. Existing wave/recovery tables
-- remain canonical; these paths never call public legacy wave RPCs.

create or replace function public.shared_session_source_locked(p_owner uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_island public.islands; v_recovery public.island_recovery_state;
  v_buildings jsonb; v_research jsonb; v_layout jsonb;
begin
  select * into strict v_island from public.islands where player_id=p_owner;
  select * into strict v_recovery from public.island_recovery_state where island_owner=p_owner;
  select coalesce(jsonb_agg(jsonb_build_object('spot',plot,'kind',building_type,'level',level,
    'instanceId',recovery_instance_id,'spec',spec,'treeA',tree_a,'treeB',tree_b,
    'revision',trunc(economy_upgrade_revision)::text) order by plot),'[]'::jsonb)
    into v_buildings from public.islet_buildings where player_id=p_owner;
  select coalesce(jsonb_agg(public.island_progression_research_state(r)||jsonb_build_object(
    'branch',r.branch) order by r.branch),'[]'::jsonb) into v_research
    from public.island_research r where island_owner=p_owner;
  select coalesce(jsonb_agg(jsonb_build_object('plot',plot,'xHalf',x_half,'zHalf',z_half)
    order by plot),'[]'::jsonb) into v_layout from public.island_layout where island_owner=p_owner;
  return jsonb_build_object('waveBest',v_island.wave_best,'nextWave',v_island.next_wave,
    'flags',v_island.flags,'crew',jsonb_build_object('gunner',v_island.crew_gunner,
      'carpenter',v_island.crew_carpenter,'lookout',v_island.crew_lookout,'guard',v_island.crew_guard),
    'buildings',v_buildings,'research',v_research,'layout',v_layout,
    'recoveryVersion',v_recovery.recovery_version,'waveProtocol',v_recovery.wave_protocol);
end; $$;
comment on function public.shared_session_source_locked(uuid) is
  'Private exact static bell CAS matching one coherent SnapshotFacts preparation; no mutable funds, private Captain fields or invented world revision.';

create or replace function public.shared_session_wave_snapshot_locked(
  p_run public.wave_runs,p_template jsonb,p_participants jsonb,p_origin jsonb,p_rules text[],p_now timestamptz
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_refresh jsonb; v_defense jsonb; v_building public.islet_buildings; v_health public.island_structure_health;
  v_position jsonb; v_defenses jsonb:='[]'; v_create jsonb; v_snapshot jsonb; v_epoch uuid;
begin
  if jsonb_typeof(p_template->'createWave') is distinct from 'object'
    or jsonb_typeof(p_template->'createWave'->'defenses') is distinct from 'array'
    or jsonb_typeof(p_template->'priceSchedule') is distinct from 'object'
    or p_template->'configVersion' is distinct from '1'::jsonb
    or p_template#>>'{createWave,seed}' is distinct from p_run.seed::text then
    raise exception 'bad_recovery_snapshot'; end if;
  if jsonb_array_length(p_template#>'{createWave,defenses}')<>(select count(*)
    from public.islet_buildings where player_id=p_run.island_owner)
    or (select count(distinct d->>'id') from jsonb_array_elements(p_template#>'{createWave,defenses}') d)
      <>jsonb_array_length(p_template#>'{createWave,defenses}') then
    raise exception 'recovery_snapshot_structure_mismatch'; end if;
  v_refresh:=public.structure_recovery_refresh_locked(p_run.island_owner,p_now,p_template);
  for v_defense in select value from jsonb_array_elements(p_template#>'{createWave,defenses}') loop
    select * into v_building from public.islet_buildings where player_id=p_run.island_owner
      and plot=v_defense->>'id';
    if not found or v_building.building_type is distinct from v_defense->>'kind'
      or v_building.level::text is distinct from v_defense->>'level' then
      raise exception 'recovery_snapshot_structure_mismatch'; end if;
    v_position:=v_refresh->'positions'->v_building.plot;
    if v_position is null then raise exception 'recovery_snapshot_structure_mismatch'; end if;
    v_defense:=v_defense||v_position;
    if v_building.building_type in ('wall','cannon','mortar','harpoon','culverin','swivel') then
      select * into strict v_health from public.island_structure_health
        where island_owner=p_run.island_owner and spot=v_building.plot;
      if v_health.instance_id is distinct from v_building.recovery_instance_id then
        raise exception 'recovery_snapshot_structure_mismatch'; end if;
      v_defense:=v_defense||jsonb_build_object('instanceId',v_health.instance_id,'hpUnits',v_health.hp_units,
        'maxHP',v_health.max_hp,'repairSeq',v_health.repair_seq);
    end if;
    v_defenses:=v_defenses||jsonb_build_array(v_defense);
  end loop;
  select reset_epoch into strict v_epoch from public.island_recovery_state where island_owner=p_run.island_owner;
  if not (p_template->'eventByWave') ? p_run.wave::text
    or not (p_template->'bossByWave') ? p_run.wave::text then raise exception 'recovery_snapshot_wave_config_missing'; end if;
  if jsonb_typeof(p_template->'bossByWave'->p_run.wave::text) is distinct from 'boolean'
    or jsonb_typeof(p_template->'eventByWave'->p_run.wave::text) not in ('string','null')
    or jsonb_typeof(p_template->'weatherLabel') is distinct from 'string' then
    raise exception 'bad_recovery_snapshot'; end if;
  v_create:=(p_template->'createWave')||jsonb_build_object('wave',p_run.wave,'seed',p_run.seed,
    'startsAt',p_run.starts_at,'weatherKind',p_run.weather_kind,'ships',p_run.weather_ships,
    'fog',p_run.weather_fog,'rules',to_jsonb(p_rules),'defenses',v_defenses,
    'event',p_template->'eventByWave'->p_run.wave::text,'boss',p_template->'bossByWave'->p_run.wave::text);
  v_snapshot:=p_template||jsonb_build_object('waveId',p_run.id,'islandEpoch',v_epoch,
    'economy',p_origin,'recoveryVersion',1,'waveProtocol',2,'wave',p_run.wave,'seed',p_run.seed,
    'startsAt',p_run.starts_at,'expiresAt',p_run.starts_at+make_interval(secs=>p_run.maximum_seconds),
    'maximumSeconds',p_run.maximum_seconds,'rules',to_jsonb(p_rules),'createWave',v_create,
    'defaultPositions',v_refresh->'positions','structures',v_refresh->'structures',
    'participants',p_participants,'rosterSize',jsonb_array_length(p_participants));
  return v_snapshot;
end; $$;
comment on function public.shared_session_wave_snapshot_locked(public.wave_runs,jsonb,jsonb,jsonb,text[],timestamptz) is
  'Private native immutable snapshot assembly from validated server template and real locked health/geometry plus full bell token roster and five-field original economy.';

create or replace function public.shared_session_wave_view_locked(
  p_actor_id uuid,p_wave_id uuid,p_session_id uuid,p_generation numeric,p_repeat boolean,p_historical boolean
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_run public.wave_runs; v_wave public.recovery_wave_states; v_attempt public.island_wave_accounting;
  v_slot public.shared_session_slots; v_meta jsonb; v_can_control boolean:=false; v_counter bigint;
begin
  select * into strict v_run from public.wave_runs where id=p_wave_id;
  select * into strict v_wave from public.recovery_wave_states where wave_id=p_wave_id;
  select * into strict v_attempt from public.island_wave_accounting where wave_id=p_wave_id;
  if not p_historical then
    v_meta:=public.shared_session_read(p_actor_id,v_attempt.island_owner,p_session_id,p_generation);
    if v_meta->>'status'<>'done' or v_meta#>>'{economy,accountId}'<>v_attempt.account_id::text
      or v_meta#>>'{economy,runEpoch}'<>v_attempt.run_epoch::text then v_meta:=null; end if;
  end if;
  if v_meta is not null then
    select * into v_slot from public.shared_session_slots where wave_id=p_wave_id and player_id=p_actor_id;
    v_can_control:=coalesce((v_meta#>>'{session,isController}')::boolean and v_slot.status='active'
      and v_slot.controlling_session_id=p_session_id and v_slot.connection_generation=p_generation
      and v_run.finished_at is null and v_wave.closed_at is null,false);
    if v_can_control then select last_actor_counter into v_counter from public.recovery_wave_participants
      where wave_id=p_wave_id and player_id=p_actor_id; end if;
    v_meta:=jsonb_set(v_meta,'{session,isController}',to_jsonb(v_can_control));
    v_meta:=jsonb_set(v_meta,'{session,isSpectator}',to_jsonb(not v_can_control));
    if not v_can_control then
      v_meta:=jsonb_set(v_meta,'{session,sessionId}','null'::jsonb);
      v_meta:=jsonb_set(v_meta,'{session,connectionGeneration}','null'::jsonb);
    end if;
  end if;
  return jsonb_build_object('status','started','waveId',v_run.id,'place','island',
    'islandOwner',v_attempt.island_owner,'wave',v_run.wave,'seed',v_run.seed,'startsAt',v_run.starts_at,
    'minimumSeconds',v_run.minimum_seconds,'maximumSeconds',v_run.maximum_seconds,
    'countdownSeconds',coalesce((v_wave.initial_snapshot->>'countdownSeconds')::integer,0),
    'weather',jsonb_build_object('kind',v_run.weather_kind,'ships',v_run.weather_ships,'fog',v_run.weather_fog),
    'boss',v_wave.initial_snapshot#>'{createWave,boss}','flagship',false,
    'rules',v_wave.initial_snapshot->'rules','repeat',p_repeat,'historical',p_historical,
    'recoveryVersion',1,'waveProtocol',2,'initialSnapshot',v_wave.initial_snapshot,
    'participantToken',case when v_can_control then v_slot.participant_token end,
    'lastActorCounter',case when v_can_control then coalesce(v_counter,0) end,
    'economy',v_meta->'economy','session',v_meta->'session','serverNow',statement_timestamp(),
    'closed',v_run.finished_at is not null or v_wave.closed_at is not null)
    ||jsonb_build_object('weather',jsonb_build_object('kind',v_run.weather_kind,
      'ships',v_run.weather_ships,'fog',v_run.weather_fog,'label',v_wave.initial_snapshot->>'weatherLabel'));
end; $$;
comment on function public.shared_session_wave_view_locked(uuid,uuid,uuid,numeric,boolean,boolean) is
  'Private native serialization with no legacy expiry/joins; a historical own root returns immutable attempt data only, and current token authority is independently proved.';

create or replace function public.shared_session_wave_replay(
  p_actor_id uuid,p_island_owner uuid,p_run_epoch uuid,p_action_uid text
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_operation public.island_economy_operations; v_account public.island_economy_accounts; v_receipt jsonb;
begin
  if not public.shared_session_actor_active(p_actor_id) then
    raise insufficient_privilege using message='actor_inactive'; end if;
  select * into v_operation from public.island_economy_operations where actor_id=p_actor_id and action_uid=p_action_uid;
  if not found then return jsonb_build_object('status','new'); end if;
  if not v_operation.is_player_intent or v_operation.domain_action<>'wave_start'
    or v_operation.account_id is null then
    return jsonb_build_object('status','refused','reason','action_conflict'); end if;
  select * into strict v_account from public.island_economy_accounts where id=v_operation.account_id;
  if not v_operation.is_player_intent or v_operation.domain_action<>'wave_start'
    or v_account.island_owner is distinct from p_island_owner or v_operation.run_epoch is distinct from p_run_epoch then
    return jsonb_build_object('status','refused','reason','action_conflict'); end if;
  select result into v_receipt from public.shared_session_receipts where operation_id=v_operation.id;
  if not found then raise exception 'session_receipt_missing'; end if;
  return v_receipt;
end; $$;
comment on function public.shared_session_wave_replay(uuid,uuid,uuid,text) is
  'Read-only own accepted-bell lookup before current mode/epoch/lease/template preparation. No old root can create a new wave or expose current island facts.';

create or replace function public.shared_session_wave_start(
  p_actor_id uuid,p_island_owner uuid,p_run_epoch uuid,p_session_id uuid,p_connection_generation numeric,
  p_action_uid text,p_seed integer,p_countdown_seconds integer,p_minimum_seconds integer,
  p_maximum_seconds integer,p_highest_wave integer,p_weather_kind text,p_weather_ships numeric,p_weather_fog numeric,
  p_rules text[],p_snapshot_template jsonb,p_reward_basis jsonb
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_replay jsonb; v_plan jsonb; v_state public.island_economy_state; v_account public.island_economy_accounts;
  v_lease public.shared_session_controls; v_run public.wave_runs; v_recovery public.island_recovery_state;
  v_next integer; v_now timestamptz; v_rules text[]; v_players uuid[]; v_actor uuid; v_token uuid;
  v_personal jsonb; v_loadouts jsonb; v_loadout jsonb; v_captain jsonb; v_role text;
  v_roster jsonb:='[]'; v_participants jsonb:='[]'; v_slots jsonb:='[]'; v_slot jsonb;
  v_snapshot jsonb; v_claim jsonb; v_operation uuid; v_result jsonb; v_old public.island_economy_operations;
begin
  v_replay:=public.shared_session_wave_replay(p_actor_id,p_island_owner,p_run_epoch,p_action_uid);
  if v_replay->>'status'<>'new' then return v_replay; end if;
  if p_actor_id is null or p_island_owner is null or p_run_epoch is null or p_session_id is null
    or not coalesce(public.island_treasury_whole(p_connection_generation,false),false)
    or p_seed is null or p_seed<0 or p_countdown_seconds not between 0 and 60
    or p_minimum_seconds<0 or p_maximum_seconds not between 1 and 86400
    or p_minimum_seconds>p_maximum_seconds or p_highest_wave not between 1 and 1000
    or p_rules is null then return jsonb_build_object('status','refused','reason','invalid_change'); end if;
  v_plan:=public.shared_session_lock_plan(array[p_island_owner],p_actor_id);
  -- Recheck the root after waiting for guards; a concurrent same click may have completed.
  v_replay:=public.shared_session_wave_replay(p_actor_id,p_island_owner,p_run_epoch,p_action_uid);
  if v_replay->>'status'<>'new' then return v_replay; end if;
  select * into v_state from public.island_economy_state where island_owner=p_island_owner;
  if not found then return jsonb_build_object('status','refused','reason','account_missing'); end if;
  v_claim:=public.island_economy_claim_operation_locked(p_actor_id,v_state.current_account_id,p_run_epoch,
    p_action_uid,'wave_start',jsonb_build_object('islandOwner',p_island_owner,'runEpoch',p_run_epoch,
      'sessionId',p_session_id,'connectionGeneration',trunc(p_connection_generation)::text));
  if v_claim->>'status'='refused' then return v_claim; end if;
  v_operation:=(v_claim->>'operationId')::uuid;
  perform public.shared_session_lock_plan_rows(v_plan);
  v_now:=clock_timestamp();
  perform public.shared_session_normalize_locked(p_island_owner,v_now);
  if not public.shared_session_actor_active(p_actor_id) or (p_actor_id<>p_island_owner and not exists(
    select 1 from public.island_members where island_owner=p_island_owner and player_id=p_actor_id and left_at is null)) then
    v_result:=jsonb_build_object('status','refused','reason','not_member'); raise sqlstate 'PS001'; end if;
  select * into v_lease from public.shared_session_controls where player_id=p_actor_id;
  if not found or v_lease.island_owner is distinct from p_island_owner or v_lease.run_epoch is distinct from p_run_epoch
    or v_lease.session_id is distinct from p_session_id or v_lease.connection_generation is distinct from p_connection_generation
    or v_lease.connected_until is null or v_now>=v_lease.connected_until then
    v_result:=jsonb_build_object('status','refused','reason','stale_controller'); raise sqlstate 'PS001'; end if;
  if public.shared_session_elect_locked(p_island_owner,v_now) is distinct from p_actor_id then
    v_result:=jsonb_build_object('status','refused','reason','not_session_leader'); raise sqlstate 'PS001'; end if;
  if exists(select 1 from public.wave_runs where island_owner=p_island_owner and finished_at is null)
    or exists(select 1 from public.island_wave_accounting a where a.island_owner=p_island_owner
      and not exists(select 1 from public.island_wave_closures c where c.wave_id=a.wave_id)) then
    v_result:=jsonb_build_object('status','refused','reason','wave_running'); raise sqlstate 'PS001'; end if;
  select * into strict v_recovery from public.island_recovery_state where island_owner=p_island_owner;
  if p_snapshot_template->'expectedSource' is distinct from public.shared_session_source_locked(p_island_owner)
    or p_snapshot_template->>'expectedRevision' is distinct from v_recovery.revision::text then
    v_result:=jsonb_build_object('status','refused','reason','island_changed'); raise sqlstate 'PS001'; end if;
  select least(greatest(coalesce(next_wave,wave_best+1),1),p_highest_wave) into v_next
    from public.islands where player_id=p_island_owner;
  if not public.island_wave_reward_valid(p_reward_basis,v_next) then raise exception 'invalid_wave_reward'; end if;
  select array_agg(l.player_id order by l.player_id) into v_players from public.shared_session_controls l
    where l.island_owner=p_island_owner and l.run_epoch=p_run_epoch and l.connected_until>v_now
      and public.shared_session_actor_active(l.player_id)
      and (l.player_id=p_island_owner or exists(select 1 from public.island_members m
        where m.island_owner=p_island_owner and m.player_id=l.player_id and m.left_at is null));
  if cardinality(v_players) not between 1 and 10 then raise exception 'invalid_wave_roster'; end if;
  if exists(select 1 from unnest(v_players) player where not exists(select 1 from public.personal_captain_profiles
      where player_id=player and assignment_wave_id is null)) then
    v_result:=jsonb_build_object('status','refused','reason','captain_assigned'); raise sqlstate 'PS001'; end if;
  insert into public.wave_runs(started_by,action_uid,place,island_owner,wave,seed,starts_at,
    minimum_seconds,maximum_seconds,weather_kind,weather_ships,weather_fog)
    values(p_actor_id,p_action_uid,'island',p_island_owner,v_next,p_seed,v_now+make_interval(secs=>p_countdown_seconds),
      p_minimum_seconds,p_maximum_seconds,p_weather_kind,p_weather_ships,p_weather_fog) returning * into v_run;
  v_rules:=p_rules;
  if not 'structure_recovery'=any(v_rules) then v_rules:=array_append(v_rules,'structure_recovery'); end if;
  insert into public.wave_rules(wave_id,rules) values(v_run.id,v_rules);
  v_loadouts:=public.island_shared_arsenal_loadouts_locked(v_state.current_account_id,p_run_epoch,v_players);
  foreach v_actor in array v_players loop
    v_personal:=public.personal_captain_attach_wave_locked(v_actor,v_run.id,v_next);
    select value into strict v_loadout from jsonb_array_elements(v_loadouts) where value->>'playerId'=v_actor::text;
    v_role:=v_personal#>>'{profile,captain,role}';
    v_captain:=jsonb_build_object('level',(v_personal#>>'{profile,captain,level}')::integer,
      'skills',(v_personal->'activeSkills')||case when v_role is null then '[]'::jsonb
        else jsonb_build_array(v_role) end,'weapon',v_loadout->>'weapon');
    v_token:=gen_random_uuid();
    select * into strict v_lease from public.shared_session_controls where player_id=v_actor;
    v_roster:=v_roster||jsonb_build_array(jsonb_build_object('playerId',v_actor,
      'controllingSessionId',v_lease.session_id,'engineerCommitmentId',v_personal->'engineerCommitmentId'));
    v_participants:=v_participants||jsonb_build_array(jsonb_build_object('participantToken',v_token,'captain',v_captain));
    v_slots:=v_slots||jsonb_build_array(jsonb_build_object('player',v_actor,'session',v_lease.session_id,
      'generation',trunc(v_lease.connection_generation)::text,'token',v_token,'captain',v_captain,
      'copyId',v_loadout->'copyId','copyGeneration',v_loadout->'generation'));
    insert into public.wave_participants(wave_id,player_id) values(v_run.id,v_actor);
  end loop;
  v_snapshot:=public.shared_session_wave_snapshot_locked(v_run,p_snapshot_template,v_participants,
    jsonb_build_object('mode','island_shared','version',1,'islandOwner',p_island_owner,
      'accountId',v_state.current_account_id,'runEpoch',p_run_epoch),v_rules,v_now)
    ||jsonb_build_object('countdownSeconds',p_countdown_seconds);
  insert into public.recovery_wave_states(wave_id,island_owner,reset_epoch,recovery_version,wave_protocol,initial_snapshot)
    values(v_run.id,p_island_owner,v_recovery.reset_epoch,1,2,v_snapshot);
  perform public.island_wave_accounting_freeze_locked(v_run.id,v_state.current_account_id,p_run_epoch,v_roster,p_reward_basis);
  for v_slot in select value from jsonb_array_elements(v_slots) loop
    insert into public.shared_session_slots(wave_id,player_id,controlling_session_id,participant_token,
      connection_generation,frozen_captain,copy_id,copy_generation)
      values(v_run.id,(v_slot->>'player')::uuid,(v_slot->>'session')::uuid,(v_slot->>'token')::uuid,
        (v_slot->>'generation')::numeric,v_slot->'captain',(v_slot->>'copyId')::uuid,(v_slot->>'copyGeneration')::numeric);
    insert into public.recovery_wave_participants(wave_id,player_id,participant_token)
      values(v_run.id,(v_slot->>'player')::uuid,(v_slot->>'token')::uuid);
  end loop;
  update public.island_recovery_state set recovery_version=1,wave_protocol=2,current_wave_id=v_run.id,
    reserved_at=v_now,starts_at=v_run.starts_at,expires_at=v_run.starts_at+make_interval(secs=>v_run.maximum_seconds),
    revision=revision+1,updated_at=v_now where island_owner=p_island_owner;
  insert into public.shared_session_receipts(operation_id,result) values(v_operation,
    public.shared_session_wave_view_locked(p_actor_id,v_run.id,null,null,true,true));
  return public.shared_session_wave_view_locked(p_actor_id,v_run.id,p_session_id,p_connection_generation,false,false);
exception when sqlstate 'PS001' then return v_result;
end; $$;
comment on function public.shared_session_wave_start(uuid,uuid,uuid,uuid,numeric,text,integer,integer,integer,integer,integer,text,numeric,numeric,text[],jsonb,jsonb) is
  'Service-only native accepted bell: original root replay first, then one ordered transaction freezes real controller/profile/Engineer/Arsenal roster, existing wave/recovery snapshot and accounting.';

do $$
declare v_function record;
begin
  for v_function in select p.oid::regprocedure signature from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
      and p.proname in ('shared_session_source_locked','shared_session_wave_snapshot_locked',
        'shared_session_wave_view_locked','shared_session_wave_replay','shared_session_wave_start') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',v_function.signature);
  end loop;
end $$;
grant execute on function public.shared_session_wave_replay(uuid,uuid,uuid,text) to service_role;
grant execute on function public.shared_session_wave_start(uuid,uuid,uuid,uuid,numeric,text,integer,integer,integer,integer,integer,text,numeric,numeric,text[],jsonb,jsonb) to service_role;

do $$
begin
  if to_regprocedure('public.shared_session_heartbeat_control_locked(uuid,uuid,uuid,uuid,numeric)') is null then
    alter function public.shared_session_heartbeat(uuid,uuid,uuid,uuid,numeric)
      rename to shared_session_heartbeat_control_locked;
  end if;
end $$;
revoke all on function public.shared_session_heartbeat_control_locked(uuid,uuid,uuid,uuid,numeric)
  from public,anon,authenticated,service_role;
create or replace function public.shared_session_heartbeat(
  p_actor_id uuid,p_island_owner uuid,p_run_epoch uuid,p_session_id uuid,p_connection_generation numeric
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_result jsonb; v_wave uuid;
begin
  v_result:=public.shared_session_heartbeat_control_locked(p_actor_id,p_island_owner,p_run_epoch,
    p_session_id,p_connection_generation);
  if v_result->>'status'<>'done' then return v_result; end if;
  select s.wave_id into v_wave from public.shared_session_slots s
    join public.personal_captain_profiles p on p.player_id=s.player_id and p.assignment_wave_id=s.wave_id
    join public.wave_runs r on r.id=s.wave_id join public.recovery_wave_states w on w.wave_id=s.wave_id
    where s.player_id=p_actor_id and s.controlling_session_id=p_session_id
      and s.connection_generation=p_connection_generation and s.status='active'
      and r.finished_at is null and w.closed_at is null
      and clock_timestamp()>=r.starts_at and clock_timestamp()<r.starts_at+make_interval(secs=>r.maximum_seconds);
  if found then
    perform public.island_wave_confirm_participation_locked(v_wave,p_actor_id,p_session_id);
  end if;
  return v_result;
end; $$;
comment on function public.shared_session_heartbeat(uuid,uuid,uuid,uuid,numeric) is
  'Native live-controller acknowledgment confirms participation only after actual combat starts; countdown/member/spectator traffic never qualifies.';
revoke all on function public.shared_session_heartbeat(uuid,uuid,uuid,uuid,numeric)
  from public,anon,authenticated,service_role;
grant execute on function public.shared_session_heartbeat(uuid,uuid,uuid,uuid,numeric) to service_role;

create or replace function public.shared_session_require_control_locked(
  p_actor uuid,p_wave uuid,p_owner uuid,p_epoch uuid,p_session uuid,p_generation numeric,p_now timestamptz
) returns public.shared_session_slots language plpgsql volatile security definer set search_path='' as $$
declare v_slot public.shared_session_slots; v_attempt public.island_wave_accounting;
begin
  if not public.shared_session_actor_active(p_actor) then raise exception 'not_member'; end if;
  select * into v_attempt from public.island_wave_accounting where wave_id=p_wave;
  if not found then raise exception 'not_in_wave'; end if;
  if v_attempt.island_owner is distinct from p_owner or v_attempt.run_epoch is distinct from p_epoch then
    raise exception 'epoch_mismatch'; end if;
  if not exists(select 1 from public.island_economy_state where island_owner=p_owner
    and current_account_id=v_attempt.account_id and run_epoch=p_epoch) then raise exception 'epoch_mismatch'; end if;
  if p_actor<>p_owner and not exists(select 1 from public.island_members
    where island_owner=p_owner and player_id=p_actor and left_at is null) then raise exception 'not_member'; end if;
  select * into v_slot from public.shared_session_slots where wave_id=p_wave and player_id=p_actor;
  if not found or v_slot.status<>'active' or v_slot.controlling_session_id is distinct from p_session
    or v_slot.connection_generation is distinct from p_generation
    or not exists(select 1 from public.personal_captain_profiles where player_id=p_actor and assignment_wave_id=p_wave)
    or not exists(select 1 from public.shared_session_controls where player_id=p_actor and island_owner=p_owner
      and run_epoch=p_epoch and session_id=p_session and connection_generation=p_generation
      and connected_until>p_now) then raise exception 'not_controller'; end if;
  if not exists(select 1 from public.wave_runs r join public.recovery_wave_states w on w.wave_id=r.id
    where r.id=p_wave and r.finished_at is null and w.closed_at is null
      and p_now<r.starts_at+make_interval(secs=>r.maximum_seconds))
    or exists(select 1 from public.island_wave_closures where wave_id=p_wave) then raise exception 'wave_over'; end if;
  return v_slot;
end; $$;
comment on function public.shared_session_require_control_locked(uuid,uuid,uuid,uuid,uuid,numeric,timestamptz) is
  'Private native mutation proof against actual origin, current global assignment, controller generation, membership and absolute deadlines. Acquires no earlier locks.';

create or replace function public.shared_session_event_json(p_event public.recovery_wave_events)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('serverSeq',p_event.seq,'effectiveTick',p_event.effective_tick,
    'type',p_event.event_kind,'participantToken',p_event.participant_token,'payload',p_event.payload);
$$;
comment on function public.shared_session_event_json(public.recovery_wave_events) is
  'Private canonical journal wire projection, preserving existing opaque participant identities.';

create or replace function public.shared_session_wave_inputs(
  p_actor_id uuid,p_island_owner uuid,p_run_epoch uuid,p_wave_id uuid,p_session_id uuid,
  p_connection_generation numeric,p_inputs jsonb
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_plan jsonb; v_slot public.shared_session_slots; v_run public.wave_runs;
  v_wave public.recovery_wave_states; v_participant public.recovery_wave_participants;
  v_now timestamptz; v_counter bigint; v_tick integer; v_item jsonb; v_command jsonb;
  v_uid text; v_expected bigint; v_requested integer; v_kind text; v_effective integer;
  v_event public.recovery_wave_events; v_existing public.recovery_wave_events;
  v_pending jsonb:='[]'; v_all jsonb:='[]'; v_payload jsonb; v_hold jsonb; v_reason text;
begin
  if jsonb_typeof(p_inputs) is distinct from 'array' or jsonb_array_length(p_inputs) not between 1 and 32
    or octet_length(p_inputs::text)>16384 then raise exception 'bad_recovery_input'; end if;
  v_plan:=public.shared_session_lock_plan(array[p_island_owner],p_actor_id);
  perform public.shared_session_lock_plan_rows(v_plan);
  v_now:=clock_timestamp();
  perform public.shared_session_normalize_locked(p_island_owner,v_now);
  v_slot:=public.shared_session_require_control_locked(p_actor_id,p_wave_id,p_island_owner,p_run_epoch,
    p_session_id,p_connection_generation,v_now);
  select * into strict v_run from public.wave_runs where id=p_wave_id;
  select * into strict v_wave from public.recovery_wave_states where wave_id=p_wave_id;
  select * into strict v_participant from public.recovery_wave_participants
    where wave_id=p_wave_id and player_id=p_actor_id for update;
  v_counter:=v_participant.last_actor_counter;
  v_tick:=greatest(0,floor(extract(epoch from(v_now-v_run.starts_at))*20)::integer);
  for v_item in select value from jsonb_array_elements(p_inputs) loop
    v_uid:=v_item->>'inputUid'; v_command:=v_item->'command'; v_kind:=v_command->>'type';
    if jsonb_typeof(v_item) is distinct from 'object' or (select count(*) from jsonb_object_keys(v_item))<>4
      or v_uid is null or v_uid !~ '^[A-Za-z0-9_-]{8,64}$'
      or jsonb_typeof(v_item->'actorCounter') is distinct from 'number'
      or (v_item->>'actorCounter') !~ '^[1-9][0-9]*$'
      or jsonb_typeof(v_item->'tick') is distinct from 'number' or (v_item->>'tick') !~ '^(0|[1-9][0-9]*)$'
      or jsonb_typeof(v_command) is distinct from 'object'
      or v_kind is null or v_kind not in ('fire','captain_shot','captain_strike','captain_move',
        'finisher_ready','finisher_input','captain_revive_hold_start','captain_revive_hold_cancel')
      or v_command ?|array['by','level','skills','weapon','captain','participantToken'] then
      raise exception 'bad_recovery_input'; end if;
    v_expected:=(v_item->>'actorCounter')::bigint; v_requested:=(v_item->>'tick')::integer;
    if v_requested not between 0 and 18000 then raise exception 'bad_recovery_input'; end if;
    select * into v_existing from public.recovery_wave_events where wave_id=p_wave_id
      and participant_token=v_slot.participant_token and input_uid=v_uid;
    if found then
      if v_existing.actor_counter is distinct from v_expected or v_existing.requested_tick is distinct from v_requested
        or v_existing.payload->'command' is distinct from v_command then raise exception 'input_conflict'; end if;
      v_all:=v_all||jsonb_build_array(public.shared_session_event_json(v_existing));
      continue;
    end if;
    if v_expected<>v_counter+1 then raise exception 'counter_gap'; end if;
    if exists(select 1 from jsonb_array_elements(v_pending) x where x->>'inputUid'=v_uid) then
      raise exception 'bad_recovery_input'; end if;
    if v_now<v_run.starts_at and v_kind<>'captain_move' then raise exception 'command_before_start'; end if;
    if v_kind in ('captain_move','captain_shot','captain_strike') and (jsonb_typeof(v_command->'x') is distinct from 'number'
      or jsonb_typeof(v_command->'z') is distinct from 'number'
      or (v_command->>'x')::numeric not between -499.999 and 499.999
      or (v_command->>'z')::numeric not between -499.999 and 499.999) then raise exception 'bad_recovery_input'; end if;
    if v_requested>v_tick+20 and v_now>=v_run.starts_at then raise exception 'input_tick_ahead'; end if;
    if v_command->'away' is not null and v_command->'away'<>'false'::jsonb then
      raise exception 'bad_recovery_input'; end if;
    if v_slot.down and (v_kind not in ('captain_move','captain_revive_hold_cancel')
      or (v_kind='captain_move' and ((v_command->>'x')::numeric is distinct from v_slot.x
        or (v_command->>'z')::numeric is distinct from v_slot.z))) then raise exception 'captain_down'; end if;
    if v_kind='captain_revive_hold_start' and (
      (select count(*) from jsonb_object_keys(v_command))<>3
      or jsonb_typeof(v_command->'targetId') is distinct from 'string'
      or jsonb_typeof(v_command->'fallId') is distinct from 'string'
      or v_command->>'targetId' !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
      or v_command->>'fallId' !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$') then
      raise exception 'bad_recovery_input'; end if;
    v_counter:=v_expected;
    v_pending:=v_pending||jsonb_build_array(v_item);
  end loop;
  for v_item in select value from jsonb_array_elements(v_pending) loop
    v_uid:=v_item->>'inputUid'; v_command:=v_item->'command'; v_kind:=v_command->>'type';
    v_expected:=(v_item->>'actorCounter')::bigint; v_requested:=(v_item->>'tick')::integer;
    v_effective:=case when v_now<v_run.starts_at then 0
      else greatest(v_requested,v_tick+1,v_wave.sealed_through_tick+1) end;
    v_payload:=jsonb_build_object('inputUid',v_uid,'actorCounter',v_expected,
      'participantToken',v_slot.participant_token,'command',v_command,'captain',v_slot.frozen_captain);
    if v_kind='captain_revive_hold_start' then
      if (select count(*) from jsonb_object_keys(v_command))<>3 then raise exception 'bad_recovery_input'; end if;
      v_hold:=public.shared_revival_hold_start_locked(p_actor_id,p_wave_id,(v_command->>'targetId')::uuid,
        (v_command->>'fallId')::uuid,p_session_id,p_connection_generation,v_uid,v_expected,v_now);
      v_payload:=v_payload||jsonb_build_object('hold',v_hold);
    elsif v_kind='captain_revive_hold_cancel' then
      if (select count(*) from jsonb_object_keys(v_command))<>1 then raise exception 'bad_recovery_input'; end if;
      perform public.shared_revival_hold_cancel_locked(p_actor_id,p_wave_id,p_session_id,
        p_connection_generation,v_uid,v_expected,v_now);
    elsif v_kind in ('captain_move','captain_shot','captain_strike') then
      update public.shared_session_slots set
        pose_revision=pose_revision+case when x is distinct from (v_command->>'x')::numeric
          or z is distinct from (v_command->>'z')::numeric or coalesce((v_command->>'away')::boolean,false)
          then 1 else 0 end,
        x=case when down then x else (v_command->>'x')::numeric end,
        z=case when down then z else (v_command->>'z')::numeric end,position_tick=v_effective
        where wave_id=p_wave_id and player_id=p_actor_id;
    end if;
    v_event:=public.recovery_wave_append_event_locked(p_wave_id,p_actor_id,v_slot.participant_token,
      v_uid,v_expected,v_requested,'captain_input',v_effective,v_payload);
    v_all:=v_all||jsonb_build_array(public.shared_session_event_json(v_event));
  end loop;
  update public.recovery_wave_participants set last_actor_counter=v_counter
    where wave_id=p_wave_id and player_id=p_actor_id;
  if v_now>=v_run.starts_at then
    perform public.island_wave_confirm_participation_locked(p_wave_id,p_actor_id,p_session_id); end if;
  update public.recovery_wave_states set last_activity_at=v_now where wave_id=p_wave_id
    returning journal_head into v_counter;
  return jsonb_build_object('status','accepted','accepted',v_all,'headSeq',v_counter);
exception when raise_exception then
  get stacked diagnostics v_reason=message_text;
  if v_reason=any(array['not_member','not_controller','not_in_wave','epoch_mismatch','wave_over',
    'bad_recovery_input','input_conflict','counter_gap','command_before_start','health_sync_required',
    'target_not_fallen','stale_fall','out_of_reach','input_tick_ahead','captain_down']) then
    return jsonb_build_object('status','refused','reason',v_reason); end if;
  raise;
end; $$;
comment on function public.shared_session_wave_inputs(uuid,uuid,uuid,uuid,uuid,numeric,jsonb) is
  'Native ordered controller input acceptance with real frozen Captain metadata. Raw client revive is denied; accepted hold hooks run once after UID/counter checks in the same journal transaction.';
revoke all on function public.shared_session_require_control_locked(uuid,uuid,uuid,uuid,uuid,numeric,timestamptz)
  from public,anon,authenticated,service_role;
revoke all on function public.shared_session_event_json(public.recovery_wave_events)
  from public,anon,authenticated,service_role;
revoke all on function public.shared_session_wave_inputs(uuid,uuid,uuid,uuid,uuid,numeric,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.shared_session_wave_inputs(uuid,uuid,uuid,uuid,uuid,numeric,jsonb) to service_role;

create or replace function public.shared_session_wave_join(
  p_actor_id uuid,p_island_owner uuid,p_run_epoch uuid,p_wave_id uuid,p_session_id uuid,p_connection_generation numeric
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_attempt public.island_wave_accounting; v_authority jsonb;
begin
  v_authority:=public.island_economy_authority(p_actor_id,p_island_owner);
  if not (v_authority->>'is_member')::boolean then return jsonb_build_object('status','refused','reason','not_member'); end if;
  select * into v_attempt from public.island_wave_accounting where wave_id=p_wave_id;
  if not found then return jsonb_build_object('status','refused','reason','not_in_wave'); end if;
  if v_attempt.island_owner is distinct from p_island_owner or v_attempt.run_epoch is distinct from p_run_epoch
    or not exists(select 1 from public.island_economy_state where island_owner=p_island_owner
      and current_account_id=v_attempt.account_id and run_epoch=p_run_epoch) then
    return jsonb_build_object('status','refused','reason','epoch_mismatch'); end if;
  return public.shared_session_wave_view_locked(p_actor_id,p_wave_id,p_session_id,p_connection_generation,false,false);
end; $$;
comment on function public.shared_session_wave_join(uuid,uuid,uuid,uuid,uuid,numeric) is
  'Native member-only read of a frozen wave. Retained controllers keep their token; late arrivals remain spectators and no participant row is added.';

create or replace function public.shared_session_wave_current(
  p_actor_id uuid,p_island_owner uuid,p_session_id uuid default null,p_connection_generation numeric default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_authority jsonb;
begin
  v_authority:=public.island_economy_authority(p_actor_id,p_island_owner);
  if not (v_authority->>'is_member')::boolean then return jsonb_build_object('status','refused','reason','not_member'); end if;
  if v_authority->>'reservation_id' is null then return jsonb_build_object('status','none'); end if;
  return public.shared_session_wave_view_locked(p_actor_id,(v_authority->>'reservation_id')::uuid,
    p_session_id,p_connection_generation,false,false);
end; $$;
comment on function public.shared_session_wave_current(uuid,uuid,uuid,numeric) is
  'Read-only current native reservation; no legacy lazy expiry, implicit participant join, profile import or control lease.';

create or replace function public.shared_session_wave_events(
  p_actor_id uuid,p_island_owner uuid,p_run_epoch uuid,p_wave_id uuid,p_session_id uuid,
  p_connection_generation numeric,p_after bigint default 0,p_through bigint default null,
  p_sealed_through_tick integer default null
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_attempt public.island_wave_accounting; v_account public.island_economy_accounts;
  v_wave public.recovery_wave_states; v_run public.wave_runs; v_seal integer; v_head bigint;
  v_events jsonb; v_now timestamptz;
begin
  if not public.shared_session_actor_active(p_actor_id) then
    raise insufficient_privilege using message='actor_inactive'; end if;
  select * into v_attempt from public.island_wave_accounting where wave_id=p_wave_id;
  if not found then return jsonb_build_object('status','refused','reason','not_in_wave'); end if;
  if v_attempt.island_owner is distinct from p_island_owner or v_attempt.run_epoch is distinct from p_run_epoch then
    return jsonb_build_object('status','refused','reason','epoch_mismatch'); end if;
  perform public.island_treasury_lock_scope(p_island_owner);
  select * into strict v_account from public.island_economy_accounts where id=v_attempt.account_id for share;
  if not exists(select 1 from public.island_economy_state where island_owner=p_island_owner
    and current_account_id=v_attempt.account_id and run_epoch=p_run_epoch) then
    return jsonb_build_object('status','refused','reason','epoch_mismatch'); end if;
  if not public.shared_session_actor_active(p_actor_id) or (p_actor_id<>p_island_owner and not exists(
    select 1 from public.island_members where island_owner=p_island_owner and player_id=p_actor_id and left_at is null)) then
    return jsonb_build_object('status','refused','reason','not_member'); end if;
  perform 1 from public.islands where player_id=p_island_owner for share;
  perform 1 from public.island_recovery_state where island_owner=p_island_owner for share;
  select * into strict v_run from public.wave_runs where id=p_wave_id for share;
  select * into strict v_wave from public.recovery_wave_states where wave_id=p_wave_id for update;
  if p_after is null or p_after<0 or p_after>v_wave.journal_head or (p_through is null)<>(p_sealed_through_tick is null)
    or p_through<p_after or p_through>v_wave.journal_head or p_sealed_through_tick< -1
    or p_sealed_through_tick>v_wave.sealed_through_tick then
    return jsonb_build_object('status','refused','reason','page_watermark_invalid'); end if;
  v_now:=clock_timestamp();
  if p_through is null then
    v_seal:=v_wave.sealed_through_tick;
    if v_wave.closed_at is null and v_run.finished_at is null then
      v_seal:=greatest(v_seal,least(public.recovery_wave_last_tick(v_run.maximum_seconds),
        floor(extract(epoch from(v_now-v_run.starts_at))*20)::integer-1));
      update public.recovery_wave_states set sealed_through_tick=v_seal,last_activity_at=v_now where wave_id=p_wave_id;
    end if;
    v_head:=v_wave.journal_head;
  else v_seal:=p_sealed_through_tick; v_head:=p_through;
  end if;
  select coalesce(jsonb_agg(public.shared_session_event_json(e) order by e.seq),'[]'::jsonb)
    into v_events from(select * from public.recovery_wave_events where wave_id=p_wave_id
      and seq>p_after and seq<=v_head order by seq limit 256) e;
  return jsonb_build_object('headSeq',v_wave.journal_head,'through',v_head,
    'sealedThroughTick',v_seal,'events',v_events,'closed',v_wave.closed_at is not null or v_run.finished_at is not null);
end; $$;
comment on function public.shared_session_wave_events(uuid,uuid,uuid,uuid,uuid,numeric,bigint,bigint,integer) is
  'Member spectator-readable native journal with fixed head/seal pages. Proof may be null; reads neither renew controlling leases nor decide abandonment/loot.';
revoke all on function public.shared_session_wave_join(uuid,uuid,uuid,uuid,uuid,numeric)
  from public,anon,authenticated,service_role;
revoke all on function public.shared_session_wave_current(uuid,uuid,uuid,numeric)
  from public,anon,authenticated,service_role;
revoke all on function public.shared_session_wave_events(uuid,uuid,uuid,uuid,uuid,numeric,bigint,bigint,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.shared_session_wave_join(uuid,uuid,uuid,uuid,uuid,numeric) to service_role;
grant execute on function public.shared_session_wave_current(uuid,uuid,uuid,numeric) to service_role;
grant execute on function public.shared_session_wave_events(uuid,uuid,uuid,uuid,uuid,numeric,bigint,bigint,integer) to service_role;

create table if not exists public.shared_session_captain_reports (
  wave_id uuid not null references public.island_wave_accounting(wave_id) on delete restrict,
  actor_id uuid not null,
  checkpoint_uid text not null check(checkpoint_uid ~ '^[A-Za-z0-9_-]{8,64}$'),
  request_fingerprint jsonb not null,
  result jsonb not null,
  primary key(wave_id,actor_id,checkpoint_uid)
);
comment on table public.shared_session_captain_reports is
  'Immutable accepted Captain checkpoint/retry identities scoped to their actual wave and reporter; no profile cascade or client-selected fall identity.';
comment on column public.shared_session_captain_reports.wave_id is 'Original immutable accounting wave.';
comment on column public.shared_session_captain_reports.actor_id is 'Authenticated reporter UUID retained as history.';
comment on column public.shared_session_captain_reports.checkpoint_uid is 'Reporter retry identity; never a financial operation.';
comment on column public.shared_session_captain_reports.request_fingerprint is 'Exact original sealed-frontier and full retained-roster report.';
comment on column public.shared_session_captain_reports.result is 'Original accepted facts including server-generated fall identities.';
alter table public.shared_session_captain_reports enable row level security;
revoke all on table public.shared_session_captain_reports from public,anon,authenticated,service_role;
grant select on table public.shared_session_captain_reports to service_role;
create or replace trigger shared_session_captain_reports_immutable before update or delete
  on public.shared_session_captain_reports for each row execute function public.island_treasury_immutable();

create or replace function public.shared_session_heal_allowance_locked(
  p_wave uuid,p_token uuid,p_from integer,p_through integer
) returns numeric language sql stable security definer set search_path='' as $$
  with snapshot as(select initial_snapshot s from public.recovery_wave_states where wave_id=p_wave),
  baseline as(select coalesce((e.payload#>>'{command,x}')::numeric,0) x,
    coalesce((e.payload#>>'{command,z}')::numeric,0) z from (select 1) anchor left join lateral(
      select payload from public.recovery_wave_events where wave_id=p_wave and participant_token=p_token
        and event_kind='captain_input' and payload#>>'{command,type}' in ('captain_move','captain_shot','captain_strike')
        and effective_tick<=greatest(p_from,0) order by effective_tick desc,seq desc limit 1) e on true),
  poses as(select greatest(p_from,0) tick,0::bigint seq,x,z from baseline union all
    select effective_tick,seq,(payload#>>'{command,x}')::numeric,(payload#>>'{command,z}')::numeric
      from public.recovery_wave_events where wave_id=p_wave and participant_token=p_token
        and event_kind='captain_input' and payload#>>'{command,type}' in ('captain_move','captain_shot','captain_strike')
        and effective_tick>greatest(p_from,0) and effective_tick<=p_through),
  intervals as(select *,lead(tick,1,p_through) over(order by tick,seq) until_tick from poses)
  select coalesce(sum(greatest(0,i.until_tick-i.tick)*500*least(3,2*(select count(*)
    from snapshot,jsonb_array_elements(s#>'{createWave,defenses}') d
    where d->>'kind'='house' and d->>'spec'='tavern' and (d->>'level')::integer>=2
      and ((d->>'x')::numeric-i.x)^2+((d->>'z')::numeric-i.z)^2<=36))),0)
    from intervals i;
$$;
comment on function public.shared_session_heal_allowance_locked(uuid,uuid,integer,integer) is
  'Bound natural Captain healing by frozen Tavern geometry (radius6,2HP/s/house capped3) and accepted pose intervals at50ms ticks; never heal fallen state or reconnect.';

create or replace function public.shared_session_wave_captains(
  p_actor_id uuid,p_island_owner uuid,p_run_epoch uuid,p_wave_id uuid,p_session_id uuid,
  p_connection_generation numeric,p_report jsonb
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_plan jsonb; v_controller public.shared_session_slots; v_wave public.recovery_wave_states;
  v_slot public.shared_session_slots; v_old public.shared_session_captain_reports;
  v_uid text; v_through integer; v_head bigint; v_required bigint; v_now timestamptz;
  v_item record; v_fact jsonb; v_hp integer; v_down integer; v_basis bigint; v_credit numeric;
  v_fall uuid; v_result jsonb; v_facts jsonb:='{}'; v_reason text;
begin
  if jsonb_typeof(p_report) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_report))<>4
    or p_report->>'checkpointUid' is null or p_report->>'checkpointUid' !~ '^[A-Za-z0-9_-]{8,64}$'
    or jsonb_typeof(p_report->'throughTick') is distinct from 'number'
    or p_report->>'throughTick' !~ '^(0|[1-9][0-9]*)$'
    or jsonb_typeof(p_report->'inputHeadSeq') is distinct from 'number'
    or p_report->>'inputHeadSeq' !~ '^(0|[1-9][0-9]*)$'
    or jsonb_typeof(p_report->'captains') is distinct from 'object' then raise exception 'bad_recovery_input'; end if;
  v_uid:=p_report->>'checkpointUid'; v_through:=(p_report->>'throughTick')::integer;
  v_head:=(p_report->>'inputHeadSeq')::bigint;
  v_plan:=public.shared_session_lock_plan(array[p_island_owner],p_actor_id);
  perform public.shared_session_lock_plan_rows(v_plan);
  v_now:=clock_timestamp();
  perform public.shared_session_normalize_locked(p_island_owner,v_now);
  v_controller:=public.shared_session_require_control_locked(p_actor_id,p_wave_id,p_island_owner,p_run_epoch,
    p_session_id,p_connection_generation,v_now);
  select * into v_old from public.shared_session_captain_reports where wave_id=p_wave_id
    and actor_id=p_actor_id and checkpoint_uid=v_uid;
  if found then
    if v_old.request_fingerprint is distinct from p_report then raise exception 'checkpoint_divergence'; end if;
    return v_old.result||jsonb_build_object('repeated',true);
  end if;
  select * into strict v_wave from public.recovery_wave_states where wave_id=p_wave_id;
  select coalesce(max(seq),0) into v_required from public.recovery_wave_events
    where wave_id=p_wave_id and effective_tick<=v_through;
  if v_through not between 0 and 18000 or v_through>v_wave.sealed_through_tick
    or v_head<v_required or v_head>v_wave.journal_head then raise exception 'health_sync_required'; end if;
  if exists(select 1 from public.shared_session_slots s where s.wave_id=p_wave_id and s.status<>'withdrawn'
    and not (p_report->'captains') ? s.participant_token::text)
    or exists(select 1 from jsonb_object_keys(p_report->'captains') k where not exists(
      select 1 from public.shared_session_slots s where s.wave_id=p_wave_id and s.participant_token::text=k)) then
    raise exception 'bad_recovery_input'; end if;
  for v_slot in select * from public.shared_session_slots where wave_id=p_wave_id and status<>'withdrawn'
    order by player_id loop
    v_fact:=p_report->'captains'->v_slot.participant_token::text;
    if jsonb_typeof(v_fact) is distinct from 'object' or (select count(*) from jsonb_object_keys(v_fact))<>3
      or jsonb_typeof(v_fact->'hpUnits') is distinct from 'number' or v_fact->>'hpUnits' !~ '^(0|[1-9][0-9]*)$'
      or jsonb_typeof(v_fact->'reviveBasisSeq') is distinct from 'number'
      or v_fact->>'reviveBasisSeq' !~ '^(0|[1-9][0-9]*)$' or not v_fact ? 'downAtTick'
      or (v_fact->'downAtTick'<>'null'::jsonb and (jsonb_typeof(v_fact->'downAtTick') is distinct from 'number'
        or v_fact->>'downAtTick' !~ '^(0|[1-9][0-9]*)$')) then
      raise exception 'bad_recovery_input'; end if;
    v_hp:=(v_fact->>'hpUnits')::integer; v_down:=(v_fact->>'downAtTick')::integer;
    v_basis:=(v_fact->>'reviveBasisSeq')::bigint;
    if v_hp not between 0 and 1000000 or (v_hp=0) is distinct from (v_down is not null)
      or v_down<0 or v_down>v_through then raise exception 'bad_recovery_input'; end if;
    if v_basis is distinct from v_slot.revive_basis_seq or v_through<v_slot.state_through_tick
      or v_head<v_slot.state_input_head or v_head<v_basis then raise exception 'checkpoint_stale'; end if;
    if v_basis>0 and not exists(select 1 from public.recovery_wave_events e
      where e.wave_id=p_wave_id and e.seq=v_basis and e.event_kind='captain_revive'
        and e.payload->>'targetId'=v_slot.participant_token::text and e.effective_tick<=v_through) then
      raise exception 'health_sync_required'; end if;
    if v_through=v_slot.state_through_tick and v_head=v_slot.state_input_head
      and (v_hp<>v_slot.hp_units or v_down is distinct from v_slot.down_at_tick) then
      raise exception 'checkpoint_divergence'; end if;
    v_credit:=case when v_slot.down then 0 else public.shared_session_heal_allowance_locked(
      p_wave_id,v_slot.participant_token,v_slot.state_through_tick,v_through) end;
    if (v_slot.down and v_hp>0) or v_hp>least(1000000,v_slot.hp_units+v_credit) then
      raise exception 'captain_hp_increase'; end if;
    if v_slot.down and v_down is distinct from v_slot.down_at_tick then raise exception 'stale_fall'; end if;
    v_fall:=case when v_hp>0 then null when v_slot.down then v_slot.fall_id else gen_random_uuid() end;
    update public.shared_session_slots set hp_units=v_hp,down=v_hp=0,fall_id=v_fall,
      down_at_tick=v_down,state_through_tick=v_through,state_input_head=v_head
      where wave_id=p_wave_id and player_id=v_slot.player_id;
    v_facts:=v_facts||jsonb_build_object(v_slot.participant_token::text,
      jsonb_build_object('hpUnits',v_hp,'downAtTick',v_down,'fallId',v_fall,'reviveBasisSeq',v_basis));
  end loop;
  v_result:=jsonb_build_object('accepted',true,'repeated',false,'throughTick',v_through,
    'inputHeadSeq',v_head,'captains',v_facts);
  insert into public.shared_session_captain_reports(wave_id,actor_id,checkpoint_uid,request_fingerprint,result)
    values(p_wave_id,p_actor_id,v_uid,p_report,v_result);
  return v_result;
exception when raise_exception then
  get stacked diagnostics v_reason=message_text;
  if v_reason=any(array['not_member','not_controller','not_in_wave','epoch_mismatch','wave_over',
    'bad_recovery_input','checkpoint_divergence','checkpoint_stale','health_sync_required',
    'captain_hp_increase','stale_fall']) then return jsonb_build_object('status','refused','reason',v_reason); end if;
  raise;
end; $$;
comment on function public.shared_session_wave_captains(uuid,uuid,uuid,uuid,uuid,numeric,jsonb) is
  'Native authenticated full-roster sealed Captain checkpoint. Actual server fall nonce, bounded natural Tavern healing and exact revival basis; no per-hit-verifier claim.';
revoke all on function public.shared_session_heal_allowance_locked(uuid,uuid,integer,integer)
  from public,anon,authenticated,service_role;
revoke all on function public.shared_session_wave_captains(uuid,uuid,uuid,uuid,uuid,numeric,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.shared_session_wave_captains(uuid,uuid,uuid,uuid,uuid,numeric,jsonb) to service_role;

create or replace function public.shared_session_wave_health(
  p_actor_id uuid,p_island_owner uuid,p_run_epoch uuid,p_wave_id uuid,p_session_id uuid,
  p_connection_generation numeric,p_report jsonb
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_plan jsonb; v_slot public.shared_session_slots; v_now timestamptz; v_reason text;
begin
  v_plan:=public.shared_session_lock_plan(array[p_island_owner],p_actor_id);
  perform public.shared_session_lock_plan_rows(v_plan);
  v_now:=clock_timestamp();
  perform public.shared_session_normalize_locked(p_island_owner,v_now);
  v_slot:=public.shared_session_require_control_locked(p_actor_id,p_wave_id,p_island_owner,p_run_epoch,
    p_session_id,p_connection_generation,v_now);
  return public.recovery_wave_report_health_locked(p_actor_id,p_wave_id,
    (p_report->>'islandEpoch')::uuid,p_report->>'checkpointUid',(p_report->>'throughTick')::integer,
    (p_report->>'inputHeadSeq')::bigint,(p_report->>'lastRepairSeq')::bigint,
    p_report->'basisRepairSeq',p_report->'hpUnits');
exception when raise_exception then
  get stacked diagnostics v_reason=message_text;
  if v_reason=any(array['not_member','not_controller','not_in_wave','epoch_mismatch','wave_over']) then
    return jsonb_build_object('status','refused','reason',v_reason); end if;
  raise;
end; $$;
comment on function public.shared_session_wave_health(uuid,uuid,uuid,uuid,uuid,numeric,jsonb) is
  'Native controller/original-economy proof around the actual private sealed structure HP checkpoint helper; never enters a fenced public legacy RPC.';
revoke all on function public.shared_session_wave_health(uuid,uuid,uuid,uuid,uuid,numeric,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.shared_session_wave_health(uuid,uuid,uuid,uuid,uuid,numeric,jsonb) to service_role;

-- A canonical revival is a new HP basis at its real event tick. Healing/report
-- intervals must not include the time that Captain was fallen before it.
do $$
begin
  if to_regprocedure('public.shared_session_revive_consume_before_checkpoint_locked(uuid,uuid,uuid,bigint,integer)') is null then
    alter function public.shared_session_revive_consume_locked(uuid,uuid,uuid,bigint,integer)
      rename to shared_session_revive_consume_before_checkpoint_locked;
  end if;
end $$;
revoke all on function public.shared_session_revive_consume_before_checkpoint_locked(uuid,uuid,uuid,bigint,integer)
  from public,anon,authenticated,service_role;
create or replace function public.shared_session_revive_consume_locked(
  p_wave_id uuid,p_target_token uuid,p_expected_fall_id uuid,p_revive_seq bigint,p_restore_hp_units integer
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_result jsonb; v_tick integer;
begin
  v_result:=public.shared_session_revive_consume_before_checkpoint_locked(p_wave_id,p_target_token,
    p_expected_fall_id,p_revive_seq,p_restore_hp_units);
  select effective_tick into strict v_tick from public.recovery_wave_events where wave_id=p_wave_id and seq=p_revive_seq;
  update public.shared_session_slots set state_through_tick=greatest(state_through_tick,v_tick),
    state_input_head=greatest(state_input_head,p_revive_seq)
    where wave_id=p_wave_id and participant_token=p_target_token;
  return v_result;
end; $$;
comment on function public.shared_session_revive_consume_locked(uuid,uuid,uuid,bigint,integer) is
  'Consume the exact current fall and advance its actual revival event frontier, preventing pre-revival damage replay or healing credit across fallen time.';
revoke all on function public.shared_session_revive_consume_locked(uuid,uuid,uuid,bigint,integer)
  from public,anon,authenticated,service_role;
