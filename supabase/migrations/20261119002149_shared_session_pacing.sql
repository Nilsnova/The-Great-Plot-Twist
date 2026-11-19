-- Durable leader pacing and explicit controller exit. Common actor roots own
-- immutable receipts; current projections are never cached in those receipts.

alter table public.shared_session_settings add column if not exists next_after_wave_id uuid
  references public.island_wave_closures(wave_id) on delete restrict;
alter table public.shared_session_settings add column if not exists next_bell_at timestamptz;
alter table public.shared_session_settings add column if not exists break_remaining_ms integer;
comment on column public.shared_session_settings.next_after_wave_id is
  'Previous won canonical closure whose existing eight-second break is pending; never a second wave reservation.';
comment on column public.shared_session_settings.next_bell_at is
  'Trusted server deadline for an unpaused pending break; eligibility is rechecked under canonical locks.';
comment on column public.shared_session_settings.break_remaining_ms is
  'Nonnegative remaining break milliseconds, captured when paused; combat clocks are unaffected.';

create or replace function public.shared_session_change_locked(
  p_actor_id uuid,p_island_owner uuid,p_run_epoch uuid,p_session_id uuid,
  p_connection_generation numeric,p_action_uid text,p_settings jsonb
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_action text:=case when p_settings is null then 'session_leave' else 'session_settings' end;
  v_fingerprint jsonb; v_old public.island_economy_operations; v_account public.island_economy_accounts;
  v_control public.shared_session_controls; v_plan jsonb; v_claim jsonb; v_operation uuid;
  v_receipt jsonb; v_result jsonb; v_meta jsonb; v_now timestamptz; v_changes jsonb;
  v_reservation uuid; v_copy public.arsenal_copies;
begin
  if not public.shared_session_actor_active(p_actor_id) then raise insufficient_privilege using message='actor_inactive'; end if;
  if not coalesce(public.island_treasury_whole(p_connection_generation,false),false)
    or p_session_id is null then return jsonb_build_object('status','refused','reason','invalid_change'); end if;
  if p_settings is not null and (jsonb_typeof(p_settings) is distinct from 'object'
    or p_settings='{}'::jsonb or exists(select 1 from jsonb_object_keys(p_settings) k
      where k not in ('breakPaused','autoNext','countdownSeconds'))
    or (p_settings?'breakPaused' and jsonb_typeof(p_settings->'breakPaused') is distinct from 'boolean')
    or (p_settings?'autoNext' and jsonb_typeof(p_settings->'autoNext') is distinct from 'boolean')
    or (p_settings?'countdownSeconds' and (jsonb_typeof(p_settings->'countdownSeconds') is distinct from 'number'
      or p_settings->>'countdownSeconds'!~'^[0-9]{1,2}$' or (p_settings->>'countdownSeconds')::integer>60))) then
    return jsonb_build_object('status','refused','reason','invalid_change'); end if;
  v_fingerprint:=jsonb_build_object('islandOwner',p_island_owner,'runEpoch',p_run_epoch,
    'sessionId',p_session_id,'connectionGeneration',trunc(p_connection_generation)::text,'settings',p_settings);
  select * into v_old from public.island_economy_operations where actor_id=p_actor_id and action_uid=p_action_uid;
  -- Root history is checked before discovery of the actor's current island.
  if found then
    if not v_old.is_player_intent or v_old.domain_action<>v_action or v_old.fingerprint<>v_fingerprint then
      return jsonb_build_object('status','refused','reason','action_conflict'); end if;
    select result into strict v_receipt from public.shared_session_receipts where operation_id=v_old.id;
    return jsonb_build_object('status','done','repeat',true,'receipt',v_receipt,'economy',null,'session',null);
  end if;
  v_plan:=public.shared_session_lock_plan(array[p_island_owner],p_actor_id);
  select a.* into v_account from public.island_economy_state s join public.island_economy_accounts a
    on a.id=s.current_account_id where s.island_owner=p_island_owner;
  if not found then return jsonb_build_object('status','refused','reason','account_missing'); end if;
  v_claim:=public.island_economy_claim_operation_locked(p_actor_id,v_account.id,p_run_epoch,p_action_uid,v_action,v_fingerprint);
  if v_claim->>'status'='refused' then return v_claim; end if;
  v_operation:=(v_claim->>'operationId')::uuid;
  if (v_claim->>'repeat')::boolean then
    select result into strict v_receipt from public.shared_session_receipts where operation_id=v_operation;
    return jsonb_build_object('status','done','repeat',true,'receipt',v_receipt,'economy',null,'session',null); end if;
  perform public.shared_session_lock_plan_rows(v_plan);
  v_now:=clock_timestamp();
  perform public.shared_session_normalize_locked(p_island_owner,v_now);
  if v_account.run_epoch is distinct from p_run_epoch then
    v_result:=jsonb_build_object('status','refused','reason','epoch_mismatch'); raise sqlstate 'PS001'; end if;
  if p_actor_id<>p_island_owner and not exists(select 1 from public.island_members
    where island_owner=p_island_owner and player_id=p_actor_id and left_at is null) then
    v_result:=jsonb_build_object('status','refused','reason','not_member'); raise sqlstate 'PS001'; end if;
  select * into v_control from public.shared_session_controls where player_id=p_actor_id;
  if not found or v_control.island_owner is distinct from p_island_owner or v_control.run_epoch is distinct from p_run_epoch
    or v_control.session_id is distinct from p_session_id or v_control.connection_generation is distinct from p_connection_generation
    or v_now>=coalesce(v_control.grace_until,v_control.last_seen+interval '60 seconds') then
    v_result:=jsonb_build_object('status','refused','reason','stale_controller'); raise sqlstate 'PS001'; end if;
  if p_settings is not null then
    if v_control.connected_until is null or v_control.connected_until<=v_now
      or public.shared_session_elect_locked(p_island_owner,v_now) is distinct from p_actor_id then
      v_result:=jsonb_build_object('status','refused','reason','not_session_leader'); raise sqlstate 'PS001'; end if;
    -- Capture/restore only the break clock when the pause value changes.
    if p_settings?'breakPaused' then
      update public.shared_session_settings set
        break_remaining_ms=case when (p_settings->>'breakPaused')::boolean and not break_paused
          and next_bell_at is not null then greatest(0,ceil(extract(epoch from (next_bell_at-v_now))*1000)::integer)
          else break_remaining_ms end,
        next_bell_at=case when (p_settings->>'breakPaused')::boolean then null
          when break_paused and next_after_wave_id is not null then
            v_now+make_interval(secs=>coalesce(break_remaining_ms,8000)::double precision/1000)
          else next_bell_at end
        where island_owner=p_island_owner;
    end if;
    update public.shared_session_settings set
      break_paused=coalesce((p_settings->>'breakPaused')::boolean,break_paused),
      auto_next=coalesce((p_settings->>'autoNext')::boolean,auto_next),
      countdown_seconds=coalesce((p_settings->>'countdownSeconds')::integer,countdown_seconds)
      where island_owner=p_island_owner returning jsonb_build_object('breakPaused',break_paused,
        'autoNext',auto_next,'countdownSeconds',countdown_seconds) into v_changes;
  else
    select (public.island_economy_authority(p_actor_id,p_island_owner)->>'reservation_id')::uuid into v_reservation;
    perform public.shared_session_withdraw_locked(p_actor_id,null,'leave',v_now);
    for v_copy in select * from public.arsenal_copies where island_owner=p_island_owner
      and holder=p_actor_id and pending_return_wave_id is null order by id for update loop
      if v_copy.economy_account_id is distinct from v_account.id or v_copy.economy_run_epoch is distinct from p_run_epoch then
        raise exception 'path_unavailable'; end if;
      perform public.island_shared_arsenal_holder_locked(v_account.id,p_run_epoch,p_actor_id,v_copy.id,
        v_copy.holder_generation,'withdraw',v_now,v_reservation,null);
    end loop;
    perform public.shared_session_normalize_locked(p_island_owner,v_now);
    v_changes:=jsonb_build_object('connectionGeneration',trunc(p_connection_generation)::text);
  end if;
  v_receipt:=jsonb_build_object('receiptId',v_operation,'actionUid',p_action_uid,'action',v_action,'actorId',p_actor_id,
    'origin',jsonb_build_object('mode','island_shared','version',1,'islandOwner',p_island_owner,
      'accountId',v_account.id,'runEpoch',p_run_epoch),'result',v_changes);
  insert into public.shared_session_receipts(operation_id,result) values(v_operation,v_receipt);
  v_meta:=public.shared_session_read(p_actor_id,p_island_owner,p_session_id,p_connection_generation);
  return jsonb_build_object('status','done','repeat',false,'receipt',v_receipt,
    'economy',v_meta->'economy','session',v_meta->'session');
exception when sqlstate 'PS001' then return v_result;
end; $$;
comment on function public.shared_session_change_locked(uuid,uuid,uuid,uuid,numeric,text,jsonb) is
  'Private shared implementation for common-root leader settings or explicit control withdrawal. Exact historical receipts replay without current projections; rejected new intents roll back root and effects together.';
revoke all on function public.shared_session_change_locked(uuid,uuid,uuid,uuid,numeric,text,jsonb)
  from public,anon,authenticated,service_role;

create or replace function public.shared_session_leave(
  p_actor_id uuid,p_island_owner uuid,p_run_epoch uuid,p_session_id uuid,p_connection_generation numeric,p_action_uid text
) returns jsonb language sql volatile security definer set search_path='' as $$
  select public.shared_session_change_locked(p_actor_id,p_island_owner,p_run_epoch,p_session_id,p_connection_generation,p_action_uid,null);
$$;
comment on function public.shared_session_leave(uuid,uuid,uuid,uuid,numeric,text) is
  'Explicit controller exit revokes matching assignment/input and binds held stock to the actual accepted reservation; this does not delete island membership.';
revoke all on function public.shared_session_leave(uuid,uuid,uuid,uuid,numeric,text) from public,anon,authenticated,service_role;
grant execute on function public.shared_session_leave(uuid,uuid,uuid,uuid,numeric,text) to service_role;

create or replace function public.shared_session_settings(
  p_actor_id uuid,p_island_owner uuid,p_run_epoch uuid,p_session_id uuid,p_connection_generation numeric,p_action_uid text,p_settings jsonb
) returns jsonb language sql volatile security definer set search_path='' as $$
  select public.shared_session_change_locked(p_actor_id,p_island_owner,p_run_epoch,p_session_id,p_connection_generation,p_action_uid,p_settings);
$$;
comment on function public.shared_session_settings(uuid,uuid,uuid,uuid,numeric,text,jsonb) is
  'Current connected leader controls break pause, auto-next and countdown with one common actor root; no setting pauses an active combat or changes frozen wave rules.';
revoke all on function public.shared_session_settings(uuid,uuid,uuid,uuid,numeric,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.shared_session_settings(uuid,uuid,uuid,uuid,numeric,text,jsonb) to service_role;

do $$
begin
  if to_regprocedure('public.shared_session_close_before_pacing_locked(uuid,text,jsonb,timestamptz)') is null then
    alter function public.shared_session_close_locked(uuid,text,jsonb,timestamptz)
      rename to shared_session_close_before_pacing_locked;
  end if;
end $$;
revoke all on function public.shared_session_close_before_pacing_locked(uuid,text,jsonb,timestamptz)
  from public,anon,authenticated,service_role;
create or replace function public.shared_session_close_locked(
  p_wave_id uuid,p_outcome text,p_bonuses jsonb,p_now timestamptz
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_result jsonb; v_owner uuid;
begin
  v_result:=public.shared_session_close_before_pacing_locked(p_wave_id,p_outcome,p_bonuses,p_now);
  if v_result->'repeat'='false'::jsonb then
    select island_owner into strict v_owner from public.island_wave_accounting where wave_id=p_wave_id;
    update public.shared_session_settings set
      next_after_wave_id=case when v_result->>'outcome'='won' then p_wave_id end,
      next_bell_at=case when v_result->>'outcome'='won' and not break_paused then p_now+interval '8 seconds' end,
      break_remaining_ms=case when v_result->>'outcome'='won' then 8000 end where island_owner=v_owner;
  end if;
  return v_result;
end; $$;
comment on function public.shared_session_close_locked(uuid,text,jsonb,timestamptz) is
  'Sole canonical close plus durable won-only eight-second break. Exact terminal replay cannot restart or extend pacing; loss/abandonment/expiry remain manual.';
revoke all on function public.shared_session_close_locked(uuid,text,jsonb,timestamptz) from public,anon,authenticated,service_role;

do $$
begin
  if to_regprocedure('public.shared_session_retire_before_pacing_locked(uuid,uuid,uuid,timestamptz,boolean)') is null then
    alter function public.shared_session_retire_island_locked(uuid,uuid,uuid,timestamptz,boolean)
      rename to shared_session_retire_before_pacing_locked;
  end if;
end $$;
revoke all on function public.shared_session_retire_before_pacing_locked(uuid,uuid,uuid,timestamptz,boolean)
  from public,anon,authenticated,service_role;
create or replace function public.shared_session_retire_island_locked(
  p_island_owner uuid,p_old_account uuid,p_old_epoch uuid,p_now timestamptz,p_deleted boolean
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_result jsonb;
begin
  v_result:=public.shared_session_retire_before_pacing_locked(p_island_owner,p_old_account,p_old_epoch,p_now,p_deleted);
  update public.shared_session_settings set next_after_wave_id=null,next_bell_at=null,break_remaining_ms=null
    where island_owner=p_island_owner;
  return v_result;
end; $$;
comment on function public.shared_session_retire_island_locked(uuid,uuid,uuid,timestamptz,boolean) is
  'Retire only the original target session/lease state and pending break, preserving closed history and unrelated global assignments.';
revoke all on function public.shared_session_retire_island_locked(uuid,uuid,uuid,timestamptz,boolean)
  from public,anon,authenticated,service_role;

-- One accepted-bell implementation serves explicit and automatic starts.
create or replace function public.shared_session_accept_bell_locked(
  p_actor_id uuid,p_island_owner uuid,p_run_epoch uuid,p_session_id uuid,p_connection_generation numeric,
  p_action_uid text,p_operation uuid,p_seed integer,p_countdown_seconds integer,p_minimum_seconds integer,
  p_maximum_seconds integer,p_highest_wave integer,p_weather_kind text,p_weather_ships numeric,p_weather_fog numeric,
  p_rules text[],p_snapshot_template jsonb,p_reward_basis jsonb,p_now timestamptz
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_state public.island_economy_state;
  v_lease public.shared_session_controls; v_run public.wave_runs; v_recovery public.island_recovery_state;
  v_next integer; v_now timestamptz; v_rules text[]; v_players uuid[]; v_actor uuid; v_token uuid;
  v_personal jsonb; v_loadouts jsonb; v_loadout jsonb; v_captain jsonb; v_role text;
  v_roster jsonb:='[]'; v_participants jsonb:='[]'; v_slots jsonb:='[]'; v_slot jsonb;
  v_snapshot jsonb; v_operation uuid; v_result jsonb;
begin
  select * into strict v_state from public.island_economy_state where island_owner=p_island_owner;
  v_operation:=p_operation;
  v_now:=p_now;
  select countdown_seconds into strict p_countdown_seconds from public.shared_session_settings where island_owner=p_island_owner;
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
  update public.shared_session_settings set next_after_wave_id=null,next_bell_at=null,break_remaining_ms=null
    where island_owner=p_island_owner;
  insert into public.shared_session_receipts(operation_id,result) values(v_operation,
    public.shared_session_wave_view_locked(p_actor_id,v_run.id,null,null,true,true));
  return public.shared_session_wave_view_locked(p_actor_id,v_run.id,p_session_id,p_connection_generation,false,false);
exception when sqlstate 'PS001' then return v_result;
end; $$;
comment on function public.shared_session_accept_bell_locked(uuid,uuid,uuid,uuid,numeric,text,uuid,integer,integer,integer,integer,integer,text,numeric,numeric,text[],jsonb,jsonb,timestamptz) is
  'Private sole accepted-bell writer after common scope/root/roster locks; real persisted leader countdown, static CAS, profile/loadout/accounting freeze and pending-break cancellation.';
revoke all on function public.shared_session_accept_bell_locked(uuid,uuid,uuid,uuid,numeric,text,uuid,integer,integer,integer,integer,integer,text,numeric,numeric,text[],jsonb,jsonb,timestamptz) from public,anon,authenticated,service_role;

create or replace function public.shared_session_wave_start(
  p_actor_id uuid,p_island_owner uuid,p_run_epoch uuid,p_session_id uuid,p_connection_generation numeric,
  p_action_uid text,p_seed integer,p_countdown_seconds integer,p_minimum_seconds integer,
  p_maximum_seconds integer,p_highest_wave integer,p_weather_kind text,p_weather_ships numeric,p_weather_fog numeric,
  p_rules text[],p_snapshot_template jsonb,p_reward_basis jsonb
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_replay jsonb; v_plan jsonb; v_state public.island_economy_state;
  v_now timestamptz; v_claim jsonb; v_operation uuid; v_result jsonb;
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
  v_result:=public.shared_session_accept_bell_locked(p_actor_id,p_island_owner,p_run_epoch,p_session_id,
    p_connection_generation,p_action_uid,v_operation,p_seed,p_countdown_seconds,p_minimum_seconds,
    p_maximum_seconds,p_highest_wave,p_weather_kind,p_weather_ships,p_weather_fog,p_rules,p_snapshot_template,p_reward_basis,v_now);
  if v_result->>'status'='refused' then raise sqlstate 'PS001'; end if;
  return v_result;
exception when sqlstate 'PS001' then return v_result;
end; $$;

comment on function public.shared_session_wave_start(uuid,uuid,uuid,uuid,numeric,text,integer,integer,integer,integer,integer,text,numeric,numeric,text[],jsonb,jsonb) is
  'Explicit start retains immutable root replay before mutable preparation and delegates the accepted bell to the same writer used by server auto-next.';
revoke all on function public.shared_session_wave_start(uuid,uuid,uuid,uuid,numeric,text,integer,integer,integer,integer,integer,text,numeric,numeric,text[],jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.shared_session_wave_start(uuid,uuid,uuid,uuid,numeric,text,integer,integer,integer,integer,integer,text,numeric,numeric,text[],jsonb,jsonb) to service_role;

create or replace function public.shared_session_auto_candidates(p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_candidates jsonb;
begin
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid_worker_limit'; end if;
  select coalesce(jsonb_agg(to_jsonb(candidate)),'[]'::jsonb) into v_candidates from (
    select s.island_owner as "islandOwner",a.run_epoch as "runEpoch",s.next_after_wave_id as "afterWaveId",
      l.player_id as "actorId",l.session_id as "sessionId",trunc(l.connection_generation)::text as "connectionGeneration"
    from public.shared_session_settings s join public.island_economy_state e on e.island_owner=s.island_owner
    join public.island_wave_accounting a on a.wave_id=s.next_after_wave_id
    join public.island_wave_closures c on c.wave_id=a.wave_id and c.outcome='won'
    join public.shared_session_controls l on l.player_id=s.leader_id and l.island_owner=s.island_owner
      and l.run_epoch=a.run_epoch
    where s.auto_next and not s.break_paused and s.next_bell_at<=statement_timestamp()
      and e.current_account_id=a.account_id and e.run_epoch=a.run_epoch and e.admission_state='active'
      and l.connected_until>statement_timestamp() and public.shared_session_actor_active(l.player_id)
      and (l.player_id=s.island_owner or exists(select 1 from public.island_members m
        where m.island_owner=s.island_owner and m.player_id=l.player_id and m.left_at is null))
      and not exists(select 1 from public.personal_captain_profiles p where p.player_id=l.player_id and p.assignment_wave_id is not null)
    order by s.next_bell_at,s.island_owner limit p_limit
  ) candidate;
  return jsonb_build_object('status','done','candidates',v_candidates);
end; $$;
comment on function public.shared_session_auto_candidates(integer) is
  'Service-only read-only worker preparation hints. No lease renewal, assignment, deadline normalization, root claim or accepted bell; the auto-start transaction independently rechecks all hints.';
revoke all on function public.shared_session_auto_candidates(integer) from public,anon,authenticated,service_role;
grant execute on function public.shared_session_auto_candidates(integer) to service_role;

create or replace function public.shared_session_wave_auto_start(
  p_actor_id uuid,p_island_owner uuid,p_run_epoch uuid,p_after_wave_id uuid,p_session_id uuid,p_connection_generation numeric,
  p_seed integer,p_minimum_seconds integer,p_maximum_seconds integer,p_highest_wave integer,
  p_weather_kind text,p_weather_ships numeric,p_weather_fog numeric,p_rules text[],p_snapshot_template jsonb,p_reward_basis jsonb
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_plan jsonb; v_now timestamptz; v_attempt public.island_wave_accounting;
  v_settings public.shared_session_settings; v_operation public.island_economy_operations;
  v_uid text; v_fingerprint jsonb; v_result jsonb;
begin
  if p_actor_id is null or p_island_owner is null or p_run_epoch is null or p_after_wave_id is null
    or p_session_id is null or not coalesce(public.island_treasury_whole(p_connection_generation,false),false)
    or p_seed is null or p_seed<0 or p_minimum_seconds<0 or p_maximum_seconds not between 1 and 86400
    or p_minimum_seconds>p_maximum_seconds or p_highest_wave not between 1 and 1000 or p_rules is null then
    return jsonb_build_object('status','refused','reason','invalid_change'); end if;
  select * into v_attempt from public.island_wave_accounting where wave_id=p_after_wave_id;
  if not found or v_attempt.island_owner is distinct from p_island_owner or v_attempt.run_epoch is distinct from p_run_epoch
    or not exists(select 1 from public.island_wave_closures where wave_id=p_after_wave_id and outcome='won') then
    return jsonb_build_object('status','refused','reason','epoch_mismatch'); end if;
  v_uid:=public.island_economy_system_uid(p_after_wave_id,'auto_next');
  v_fingerprint:=jsonb_build_object('afterWaveId',p_after_wave_id,'islandOwner',p_island_owner,'runEpoch',p_run_epoch);
  v_plan:=public.shared_session_lock_plan(array[p_island_owner],p_actor_id);
  -- This is a real server operation in the common registry, never a forged
  -- player intent. Its identity is stable across different worker attempts.
  insert into public.island_economy_operations(actor_id,action_uid,account_id,run_epoch,is_player_intent,domain_action,fingerprint)
    values(p_island_owner,v_uid,v_attempt.account_id,p_run_epoch,false,'wave_auto_start',v_fingerprint)
    on conflict(actor_id,action_uid) do nothing;
  select * into strict v_operation from public.island_economy_operations where actor_id=p_island_owner and action_uid=v_uid;
  if v_operation.is_player_intent or v_operation.domain_action<>'wave_auto_start' or v_operation.fingerprint<>v_fingerprint
    or v_operation.account_id is distinct from v_attempt.account_id or v_operation.run_epoch is distinct from p_run_epoch then
    v_result:=jsonb_build_object('status','refused','reason','action_conflict'); raise sqlstate 'PS001'; end if;
  if exists(select 1 from public.shared_session_receipts where operation_id=v_operation.id) then
    select result into strict v_result from public.shared_session_receipts where operation_id=v_operation.id;
    return v_result; end if;
  perform public.shared_session_lock_plan_rows(v_plan);
  v_now:=clock_timestamp();
  perform public.shared_session_normalize_locked(p_island_owner,v_now);
  select * into strict v_settings from public.shared_session_settings where island_owner=p_island_owner;
  if not v_settings.auto_next or v_settings.break_paused or v_settings.next_after_wave_id is distinct from p_after_wave_id
    or v_settings.next_bell_at is null or v_settings.next_bell_at>v_now
    or not exists(select 1 from public.island_economy_state where island_owner=p_island_owner
      and current_account_id=v_attempt.account_id and run_epoch=p_run_epoch and admission_state='active') then
    v_result:=jsonb_build_object('status','refused','reason','auto_next_not_due'); raise sqlstate 'PS001'; end if;
  v_result:=public.shared_session_accept_bell_locked(p_actor_id,p_island_owner,p_run_epoch,p_session_id,
    p_connection_generation,v_uid,v_operation.id,p_seed,v_settings.countdown_seconds,p_minimum_seconds,p_maximum_seconds,
    p_highest_wave,p_weather_kind,p_weather_ships,p_weather_fog,p_rules,p_snapshot_template,p_reward_basis,v_now);
  if v_result->>'status'='refused' then raise sqlstate 'PS001'; end if;
  return v_result;
exception when sqlstate 'PS001' then return v_result;
end; $$;
comment on function public.shared_session_wave_auto_start(uuid,uuid,uuid,uuid,uuid,numeric,integer,integer,integer,integer,text,numeric,numeric,text[],jsonb,jsonb) is
  'Trusted worker auto-next after one exact won break. Rechecks current origin, connected elected controller and immutable preceding closure; common server root and sole accepted-bell writer make retries/races atomic.';
revoke all on function public.shared_session_wave_auto_start(uuid,uuid,uuid,uuid,uuid,numeric,integer,integer,integer,integer,text,numeric,numeric,text[],jsonb,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.shared_session_wave_auto_start(uuid,uuid,uuid,uuid,uuid,numeric,integer,integer,integer,integer,text,numeric,numeric,text[],jsonb,jsonb) to service_role;

-- Destination attach must normalize its captured previous island too; a late
-- worker cannot prolong the previous island lease beyond its original deadline.
create or replace function public.shared_session_attach(
  p_actor_id uuid,p_island_owner uuid,p_run_epoch uuid,p_session_id uuid,
  p_expected_generation numeric,p_action_uid text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_owner uuid; v_plan jsonb; v_state public.island_economy_state; v_control public.shared_session_controls;
  v_old public.island_economy_operations; v_account uuid; v_claim jsonb; v_operation uuid;
  v_result jsonb; v_fingerprint jsonb; v_now timestamptz; v_generation numeric;
  v_slot public.shared_session_slots; v_attempt public.island_wave_accounting;
begin
  if p_actor_id is null or p_island_owner is null or p_run_epoch is null or p_session_id is null
    or not coalesce(public.island_treasury_whole(p_expected_generation,true),false) then
    return jsonb_build_object('status','refused','reason','invalid_change'); end if;
  if not public.shared_session_actor_active(p_actor_id) then
    raise insufficient_privilege using message='actor_inactive'; end if;
  v_plan:=public.shared_session_lock_plan(array[p_island_owner],p_actor_id);
  v_fingerprint:=jsonb_build_object('islandOwner',p_island_owner,'runEpoch',p_run_epoch,
    'sessionId',p_session_id,'expectedGeneration',trunc(p_expected_generation)::text);
  select * into v_old from public.island_economy_operations where actor_id=p_actor_id and action_uid=p_action_uid;
  if found then v_account:=v_old.account_id;
  else
    select * into v_state from public.island_economy_state where island_owner=p_island_owner;
    if not found then return jsonb_build_object('status','refused','reason','account_missing'); end if;
    v_account:=v_state.current_account_id;
  end if;
  v_claim:=public.island_economy_claim_operation_locked(p_actor_id,v_account,p_run_epoch,
    p_action_uid,'session_attach',v_fingerprint);
  if v_claim->>'status'='refused' then return v_claim; end if;
  v_operation:=(v_claim->>'operationId')::uuid;
  if (v_claim->>'repeat')::boolean then
    select result into v_result from public.shared_session_receipts where operation_id=v_operation;
    if not found then raise exception 'session_receipt_missing'; end if;
    return v_result;
  end if;
  perform public.shared_session_lock_plan_rows(v_plan);
  if not public.shared_session_actor_active(p_actor_id) then
    v_result:=jsonb_build_object('status','refused','reason','not_member'); raise sqlstate 'PS001'; end if;
  if p_actor_id<>p_island_owner and not exists(select 1 from public.island_members
    where island_owner=p_island_owner and player_id=p_actor_id and left_at is null) then
    v_result:=jsonb_build_object('status','refused','reason','not_member'); raise sqlstate 'PS001'; end if;
  if not exists(select 1 from public.personal_captain_profiles where player_id=p_actor_id) then
    v_result:=jsonb_build_object('status','refused','reason','captain_context_required'); raise sqlstate 'PS001'; end if;
  v_now:=clock_timestamp();
  for v_owner in select value::uuid from jsonb_array_elements_text(v_plan->'owners') order by value loop
    perform public.shared_session_normalize_locked(v_owner,v_now);
  end loop;
  select * into v_control from public.shared_session_controls where player_id=p_actor_id;
  if found and v_control.released_at is null and v_control.session_id<>p_session_id then
    v_result:=jsonb_build_object('status','refused','reason','controller_held'); raise sqlstate 'PS001'; end if;
  if (v_control.player_id is null and p_expected_generation<>0)
    or (v_control.player_id is not null and v_control.released_at is null
      and v_control.connection_generation<>p_expected_generation)
    or (v_control.released_at is not null and p_expected_generation<>0
      and v_control.connection_generation<>p_expected_generation) then
    v_result:=jsonb_build_object('status','refused','reason','stale_controller'); raise sqlstate 'PS001'; end if;
  if v_control.player_id is not null and v_control.island_owner<>p_island_owner
    and exists(select 1 from public.personal_captain_profiles
      where player_id=p_actor_id and assignment_wave_id is not null) then
    v_result:=jsonb_build_object('status','refused','reason','captain_assigned'); raise sqlstate 'PS001'; end if;
  if v_control.island_owner is not null and v_control.island_owner<>p_island_owner then
    -- Direct idle travel is an explicit departure from the captured old target.
    -- Return its stock before replacing the only controller pointer to it.
    perform public.shared_session_withdraw_locked(p_actor_id,null,'leave',v_now);
  end if;
  v_generation:=coalesce(v_control.connection_generation,0)+1;
  insert into public.shared_session_controls(player_id,island_owner,run_epoch,session_id,
    connection_generation,last_seen,active_since,connected_until,grace_until,released_at)
    values(p_actor_id,p_island_owner,p_run_epoch,p_session_id,v_generation,v_now,
      case when v_control.island_owner=p_island_owner and v_control.connected_until>v_now
        then v_control.active_since else v_now end,v_now+interval '15 seconds',null,null)
    on conflict(player_id) do update set island_owner=excluded.island_owner,run_epoch=excluded.run_epoch,
      session_id=excluded.session_id,connection_generation=excluded.connection_generation,
      last_seen=excluded.last_seen,active_since=excluded.active_since,
      connected_until=excluded.connected_until,grace_until=null,released_at=null;
  update public.shared_session_slots s set connection_generation=v_generation,status='active',grace_until=null
    where s.player_id=p_actor_id and s.controlling_session_id=p_session_id and s.status<>'withdrawn'
      and (s.grace_until is null or s.grace_until>v_now)
      and exists(select 1 from public.personal_captain_profiles p
        where p.player_id=p_actor_id and p.assignment_wave_id=s.wave_id);
  for v_slot in select s.* from public.shared_session_slots s where s.player_id=p_actor_id
    and s.status='active' and s.connection_generation=v_generation and s.copy_id is not null
    and exists(select 1 from public.personal_captain_profiles p
      where p.player_id=p_actor_id and p.assignment_wave_id=s.wave_id) loop
    select * into strict v_attempt from public.island_wave_accounting where wave_id=v_slot.wave_id;
    perform public.island_shared_arsenal_holder_locked(v_attempt.account_id,v_attempt.run_epoch,
      p_actor_id,v_slot.copy_id,v_slot.copy_generation,'reconnect',v_now,v_slot.wave_id,null);
  end loop;
  perform public.shared_session_elect_locked(p_island_owner,v_now);
  if v_control.island_owner is not null and v_control.island_owner<>p_island_owner then
    perform public.shared_session_elect_locked(v_control.island_owner,v_now); end if;
  v_result:=public.shared_session_read(p_actor_id,p_island_owner,p_session_id,v_generation);
  insert into public.shared_session_receipts(operation_id,result) values(v_operation,v_result);
  return v_result;
exception when sqlstate 'PS001' then return v_result;
end; $$;
comment on function public.shared_session_attach(uuid,uuid,uuid,uuid,numeric,text) is
  'Common-root exclusive attachment normalizes every already-captured source/target owner before checking occupancy. An expired old-island lease cannot block direct attachment elsewhere until a worker runs.';
revoke all on function public.shared_session_attach(uuid,uuid,uuid,uuid,numeric,text) from public,anon,authenticated,service_role;
grant execute on function public.shared_session_attach(uuid,uuid,uuid,uuid,numeric,text) to service_role;

do $$
begin
  if to_regprocedure('public.shared_session_withdraw_before_journal_locked(uuid,uuid,text,timestamptz)') is null then
    alter function public.shared_session_withdraw_locked(uuid,uuid,text,timestamptz)
      rename to shared_session_withdraw_before_journal_locked;
  end if;
end $$;
revoke all on function public.shared_session_withdraw_before_journal_locked(uuid,uuid,text,timestamptz)
  from public,anon,authenticated,service_role;
create or replace function public.shared_session_withdraw_locked(
  p_actor_id uuid,p_wave_id uuid,p_reason text,p_now timestamptz
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_slot public.shared_session_slots; v_wave public.recovery_wave_states;
  v_run public.wave_runs; v_result jsonb; v_tick integer; v_last integer;
  v_control public.shared_session_controls; v_account public.island_economy_accounts;
  v_owner uuid; v_epoch uuid; v_reservation uuid; v_copy public.arsenal_copies; v_effect jsonb;
begin
  select * into v_control from public.shared_session_controls where player_id=p_actor_id;
  if p_wave_id is null then
    select assignment_wave_id into p_wave_id from public.personal_captain_profiles where player_id=p_actor_id; end if;
  select * into v_slot from public.shared_session_slots where wave_id=p_wave_id and player_id=p_actor_id;
  if v_slot.wave_id is not null then
    select island_owner,run_epoch into v_owner,v_epoch from public.island_wave_accounting where wave_id=p_wave_id;
  else v_owner:=v_control.island_owner; v_epoch:=v_control.run_epoch;
  end if;
  select * into v_account from public.island_economy_accounts where island_owner=v_owner and run_epoch=v_epoch;
  select r.id into v_reservation from public.wave_runs r join public.island_wave_accounting a on a.wave_id=r.id
    where a.island_owner=v_owner and a.account_id=v_account.id and a.run_epoch=v_epoch and r.finished_at is null
      and not exists(select 1 from public.island_wave_closures c where c.wave_id=r.id)
    order by r.starts_at,r.id limit 1;
  v_result:=public.shared_session_withdraw_before_journal_locked(p_actor_id,p_wave_id,p_reason,p_now);
  -- A held copy can exist without an assignment or frozen slot (idle break or
  -- late spectator). Its captured lease origin and actual reservation still
  -- determine immediate versus pending return when grace or membership ends.
  for v_copy in select * from public.arsenal_copies where island_owner=v_owner and holder=p_actor_id
    and pending_return_wave_id is null order by id for update loop
    if v_copy.economy_account_id is distinct from v_account.id or v_copy.economy_run_epoch is distinct from v_epoch then
      raise exception 'path_unavailable'; end if;
    v_effect:=public.island_shared_arsenal_holder_locked(v_account.id,v_epoch,p_actor_id,v_copy.id,
      v_copy.holder_generation,'withdraw',p_now,v_reservation,null);
    if v_effect->>'status' is distinct from 'done' then raise exception 'path_unavailable'; end if;
    if v_slot.wave_id is null then
      v_result:=v_result||jsonb_build_object('islandOwner',v_owner,'accountId',v_account.id,'runEpoch',v_epoch,
        'waveId',v_reservation,'copyId',v_copy.id,'copyGeneration',trunc(v_copy.holder_generation)::text,
        'pendingReturn',v_reservation is not null);
    end if;
  end loop;
  if v_slot.wave_id is not null and v_slot.status<>'withdrawn'
    and not exists(select 1 from public.island_wave_closures where wave_id=p_wave_id) then
    select * into strict v_wave from public.recovery_wave_states where wave_id=p_wave_id;
    select * into strict v_run from public.wave_runs where id=p_wave_id;
    v_last:=public.recovery_wave_last_tick(v_run.maximum_seconds);
    v_tick:=greatest(0,floor(extract(epoch from (p_now-v_run.starts_at))*20)::integer+1,
      v_wave.sealed_through_tick+1);
    -- At overall terminal expiry the closed wave removes all Captains. There is
    -- no legal journal tick after the final sealed prefix, so append nothing.
    if v_wave.closed_at is null and p_now<v_run.starts_at+make_interval(secs=>v_run.maximum_seconds)
      and v_tick<=v_last then
      perform public.recovery_wave_append_event_locked(p_wave_id,null,v_slot.participant_token,
        null,null,null,'captain_withdrawn',v_tick,
        jsonb_build_object('participantToken',v_slot.participant_token,'reason',p_reason));
    end if;
  end if;
  return v_result;
end; $$;
comment on function public.shared_session_withdraw_locked(uuid,uuid,text,timestamptz) is
  'Canonical first withdrawal atomically revokes control/assignment/tenure and appends one trusted opaque Captain removal after the current sealed prefix. Grace itself never hides the stationary targetable Captain.';
revoke all on function public.shared_session_withdraw_locked(uuid,uuid,text,timestamptz)
  from public,anon,authenticated,service_role;

do $$
begin
  if to_regprocedure('public.shared_session_snapshot_before_captain_state_locked(public.wave_runs,jsonb,jsonb,jsonb,text[],timestamptz)') is null then
    alter function public.shared_session_wave_snapshot_locked(public.wave_runs,jsonb,jsonb,jsonb,text[],timestamptz)
      rename to shared_session_snapshot_before_captain_state_locked;
  end if;
end $$;
revoke all on function public.shared_session_snapshot_before_captain_state_locked(public.wave_runs,jsonb,jsonb,jsonb,text[],timestamptz)
  from public,anon,authenticated,service_role;
create or replace function public.shared_session_wave_snapshot_locked(
  p_run public.wave_runs,p_template jsonb,p_participants jsonb,p_origin jsonb,p_rules text[],p_now timestamptz
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_snapshot jsonb; v_initial jsonb;
begin
  v_snapshot:=public.shared_session_snapshot_before_captain_state_locked(p_run,p_template,p_participants,p_origin,p_rules,p_now);
  -- These are the actual initial values of every newly inserted canonical slot.
  -- Publishing them seeds all frozen Captains before any move/presence message.
  select jsonb_object_agg(p->>'participantToken',jsonb_build_object('x',0,'z',0,'hpUnits',1000000,
    'downAtTick',null,'fallId',null,'reviveBasisSeq',0)) into v_initial from jsonb_array_elements(p_participants) p;
  return v_snapshot||jsonb_build_object('captainInitialState',v_initial);
end; $$;
comment on function public.shared_session_wave_snapshot_locked(public.wave_runs,jsonb,jsonb,jsonb,text[],timestamptz) is
  'Actual locked immutable recovery/roster snapshot plus exact initial pose/HP/fall/revival basis keyed by the same opaque frozen tokens. No presence inference or player/account IDs enter participant state.';
revoke all on function public.shared_session_wave_snapshot_locked(public.wave_runs,jsonb,jsonb,jsonb,text[],timestamptz)
  from public,anon,authenticated,service_role;
