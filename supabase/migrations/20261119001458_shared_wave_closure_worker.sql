-- Canonical terminal lifecycle and autonomous due processing. Native wave and
-- personal/accounting stores remain the only outcome and assignment sources.

-- Preserve the foundation's deadline normalization as a nonrecursive primitive.
do $$
begin
  if to_regprocedure('public.shared_session_normalize_controls_locked(uuid,timestamptz)') is null then
    alter function public.shared_session_normalize_locked(uuid,timestamptz)
      rename to shared_session_normalize_controls_locked;
  end if;
end $$;
revoke all on function public.shared_session_normalize_controls_locked(uuid,timestamptz)
  from public,anon,authenticated,service_role;

create or replace function public.shared_session_normalize_slots_locked(p_owner uuid,p_now timestamptz)
returns void language plpgsql volatile security definer set search_path='' as $$
declare v_slot public.shared_session_slots; v_attempt public.island_wave_accounting;
  v_control public.shared_session_controls; v_deadline timestamptz;
begin
  perform public.shared_session_normalize_controls_locked(p_owner,p_now);
  for v_slot in select s.* from public.shared_session_slots s
    join public.island_wave_accounting a on a.wave_id=s.wave_id
    where a.island_owner=p_owner and s.status<>'withdrawn'
      and not exists(select 1 from public.island_wave_closures c where c.wave_id=s.wave_id)
    order by s.wave_id,s.player_id loop
    select * into strict v_attempt from public.island_wave_accounting where wave_id=v_slot.wave_id;
    select * into v_control from public.shared_session_controls where player_id=v_slot.player_id;
    if not public.shared_session_actor_active(v_slot.player_id) or
      (v_slot.player_id<>p_owner and not exists(select 1 from public.island_members
        where island_owner=p_owner and player_id=v_slot.player_id and left_at is null)) then
      perform public.shared_session_withdraw_locked(v_slot.player_id,v_slot.wave_id,'membership_lost',p_now);
    elsif v_control.island_owner is distinct from p_owner
      or v_control.run_epoch is distinct from v_attempt.run_epoch
      or v_control.session_id is distinct from v_slot.controlling_session_id
      or v_control.connection_generation is distinct from v_slot.connection_generation
      or not exists(select 1 from public.personal_captain_profiles where player_id=v_slot.player_id
        and assignment_wave_id=v_slot.wave_id) then
      perform public.shared_session_withdraw_locked(v_slot.player_id,v_slot.wave_id,'leave',p_now);
    else
      v_deadline:=coalesce(v_control.grace_until,v_control.last_seen+interval '60 seconds');
      if p_now>=v_deadline then
        perform public.shared_session_withdraw_locked(v_slot.player_id,v_slot.wave_id,'disconnect_expired',p_now);
      elsif v_control.connected_until is null or p_now>=v_control.connected_until then
        update public.shared_session_slots set status='grace',grace_until=v_deadline
          where wave_id=v_slot.wave_id and player_id=v_slot.player_id;
      end if;
    end if;
  end loop;
end; $$;
comment on function public.shared_session_normalize_slots_locked(uuid,timestamptz) is
  'Private nonrecursive fixed-deadline normalization. Frozen slots cannot survive a missing/replaced lease or assignment; unrelated later assignments remain untouched.';

create or replace function public.shared_session_close_locked(
  p_wave_id uuid,p_outcome text,p_bonuses jsonb,p_now timestamptz
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_attempt public.island_wave_accounting; v_run public.wave_runs;
  v_wave public.recovery_wave_states; v_outcome text; v_hp jsonb; v_result jsonb; v_back integer;
begin
  if p_wave_id is null or p_now is null or p_outcome is null
    or p_outcome not in ('won','lost','abandoned','expired')
    or jsonb_typeof(p_bonuses) is distinct from 'array' then raise exception 'invalid_wave_outcome'; end if;
  select * into strict v_attempt from public.island_wave_accounting where wave_id=p_wave_id;
  if exists(select 1 from public.island_wave_closures where wave_id=p_wave_id) then
    return public.island_wave_accounting_result(p_wave_id,true); end if;
  -- All scope/account/roster/personal locks were acquired by the enclosing writer.
  -- Deadline selection must precede a requested victory, even if the worker is late.
  perform public.shared_session_normalize_slots_locked(v_attempt.island_owner,p_now);
  select * into strict v_run from public.wave_runs where id=p_wave_id for update;
  select * into strict v_wave from public.recovery_wave_states where wave_id=p_wave_id for update;
  v_outcome:=case when p_now>=v_attempt.starts_at+make_interval(secs=>v_attempt.maximum_seconds) then 'expired'
    when not exists(select 1 from public.shared_session_slots where wave_id=p_wave_id and status<>'withdrawn')
      then 'abandoned' else p_outcome end;
  if v_outcome in ('won','lost') and p_now<v_run.starts_at then raise exception 'wave_not_started'; end if;
  if v_outcome<>'won' then p_bonuses:='[]'::jsonb; end if;
  v_hp:=public.structure_recovery_wave_hp(p_wave_id);
  update public.wave_runs set finished_at=p_now,survived=v_outcome='won',ships_sunk=0,loot=0,
    expired=v_outcome in ('expired','abandoned'),flag_counted=v_outcome='won' where id=p_wave_id;
  update public.recovery_wave_states set closed_at=p_now,closed_hp=v_hp,last_activity_at=p_now
    where wave_id=p_wave_id;
  if v_outcome='won' then
    update public.islands set wave_best=greatest(wave_best,v_run.wave),flags=flags+1,
      next_wave=v_run.wave+1 where player_id=v_attempt.island_owner;
  elsif v_outcome='lost' then
    if jsonb_typeof(v_wave.initial_snapshot#>'{finishPolicy,restartBack}') is distinct from 'number'
      or (v_wave.initial_snapshot#>>'{finishPolicy,restartBack}')!~'^[0-9]{1,3}$' then
      raise exception 'bad_recovery_snapshot'; end if;
    v_back:=(v_wave.initial_snapshot#>>'{finishPolicy,restartBack}')::integer;
    update public.islands set next_wave=greatest(1,wave_best-v_back) where player_id=v_attempt.island_owner;
  end if;
  -- Closed HP remains immutable history. Every actual structure is whole at the
  -- break boundary; there is no paid, timed or gradual between-wave restoration.
  if exists(select 1 from public.island_recovery_state where island_owner=v_attempt.island_owner
      and current_wave_id=p_wave_id) then
    perform 1 from public.islet_buildings where player_id=v_attempt.island_owner order by plot for update;
    perform 1 from public.island_structure_health where island_owner=v_attempt.island_owner order by spot for update;
    update public.island_structure_health set hp_units=1000000,
      settled_at=greatest(settled_at,p_now),updated_at=p_now where island_owner=v_attempt.island_owner;
    update public.island_recovery_state set current_wave_id=null,reserved_at=null,starts_at=null,expires_at=null,
      revision=revision+1,updated_at=p_now where island_owner=v_attempt.island_owner and current_wave_id=p_wave_id;
  end if;
  v_result:=public.island_wave_accounting_settle_locked(p_wave_id,v_outcome,p_bonuses);
  perform public.island_shared_arsenal_settle_returns_locked(v_attempt.account_id,v_attempt.run_epoch,p_wave_id);
  return v_result;
end; $$;
comment on function public.shared_session_close_locked(uuid,text,jsonb,timestamptz) is
  'Sole native terminal transaction hook after complete canonical lock plan: normalize absolute grace/expiry, close HP/run, fully restore structures, settle original treasury/personal receipts and matching pending tenures atomically.';

create or replace function public.shared_session_normalize_locked(p_owner uuid,p_now timestamptz)
returns void language plpgsql volatile security definer set search_path='' as $$
declare v_attempt public.island_wave_accounting;
begin
  perform public.shared_session_normalize_slots_locked(p_owner,p_now);
  for v_attempt in select * from public.island_wave_accounting a where a.island_owner=p_owner
    and not exists(select 1 from public.island_wave_closures c where c.wave_id=a.wave_id)
    order by a.wave_id loop
    if p_now>=v_attempt.starts_at+make_interval(secs=>v_attempt.maximum_seconds) then
      perform public.shared_session_close_locked(v_attempt.wave_id,'expired','[]',p_now);
    elsif not exists(select 1 from public.shared_session_slots where wave_id=v_attempt.wave_id and status<>'withdrawn') then
      perform public.shared_session_close_locked(v_attempt.wave_id,'abandoned','[]',p_now);
    end if;
  end loop;
end; $$;
comment on function public.shared_session_normalize_locked(uuid,timestamptz) is
  'Normalize leases, slots and terminal attempts under the preheld cohort lock plan; no recursive close, new scope discovery or read-side wall-clock abandonment.';

create or replace function public.shared_session_finish_view_locked(
  p_actor_id uuid,p_wave_id uuid,p_session_id uuid,p_generation numeric,p_repeat boolean
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_attempt public.island_wave_accounting; v_receipt public.island_wave_completion_receipts;
  v_meta jsonb; v_origin jsonb;
begin
  select * into strict v_attempt from public.island_wave_accounting where wave_id=p_wave_id;
  select * into v_receipt from public.island_wave_completion_receipts where wave_id=p_wave_id and player_id=p_actor_id;
  if not found then return jsonb_build_object('status','refused','reason','not_in_wave'); end if;
  if public.shared_session_actor_active(p_actor_id) and (p_actor_id=v_attempt.island_owner or exists(
    select 1 from public.island_members where island_owner=v_attempt.island_owner and player_id=p_actor_id and left_at is null))
    and exists(select 1 from public.island_economy_state where island_owner=v_attempt.island_owner
      and current_account_id=v_attempt.account_id and run_epoch=v_attempt.run_epoch) then
    v_meta:=public.shared_session_read(p_actor_id,v_attempt.island_owner,p_session_id,p_generation);
    if v_meta->>'status' is distinct from 'done' then v_meta:=null; end if;
  end if;
  v_origin:=jsonb_build_object('mode','island_shared','version',1,'islandOwner',v_attempt.island_owner,
    'accountId',v_attempt.account_id,'runEpoch',v_attempt.run_epoch);
  return jsonb_build_object('status','done','waveId',p_wave_id,'outcome',v_receipt.outcome,'repeat',p_repeat,
    'origin',v_origin,'completion',public.island_wave_completion_json(v_receipt),
    'economy',v_meta->'economy','session',v_meta->'session');
end; $$;
comment on function public.shared_session_finish_view_locked(uuid,uuid,uuid,numeric,boolean) is
  'Actor-only immutable completion plus original five-field origin. Fresh current projections require live membership and that exact still-current account/epoch; old receipts reveal no other players or retired funds.';

create or replace function public.shared_session_wave_finish(
  p_actor_id uuid,p_island_owner uuid,p_run_epoch uuid,p_wave_id uuid,p_session_id uuid,
  p_connection_generation numeric,p_report jsonb
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_attempt public.island_wave_accounting; v_run public.wave_runs; v_wave public.recovery_wave_states;
  v_plan jsonb; v_now timestamptz; v_result jsonb; v_outcome text; v_reason text; v_checkpoint jsonb;
  v_rescue jsonb; v_bonuses jsonb; v_survived boolean;
begin
  if not public.shared_session_actor_active(p_actor_id) then raise insufficient_privilege using message='actor_inactive'; end if;
  select * into v_attempt from public.island_wave_accounting where wave_id=p_wave_id;
  if not found then return jsonb_build_object('status','refused','reason','no_such_wave'); end if;
  if v_attempt.island_owner is distinct from p_island_owner or v_attempt.run_epoch is distinct from p_run_epoch then
    return jsonb_build_object('status','refused','reason','epoch_mismatch'); end if;
  if exists(select 1 from public.island_wave_completion_receipts where wave_id=p_wave_id and player_id=p_actor_id) then
    return public.shared_session_finish_view_locked(p_actor_id,p_wave_id,p_session_id,p_connection_generation,true); end if;
  if jsonb_typeof(p_report) is distinct from 'object' or jsonb_typeof(p_report->'survived') is distinct from 'boolean'
    or jsonb_typeof(p_report->'rescued') is distinct from 'boolean'
    or jsonb_typeof(p_report->'shipsSunk') is distinct from 'number' or (p_report->>'shipsSunk')!~'^[0-9]{1,4}$'
    or (p_report->>'shipsSunk')::integer>1000
    or exists(select 1 from jsonb_object_keys(p_report) k where k not in ('survived','shipsSunk','bonuses','rescued','checkpoint','walls')) then
    return jsonb_build_object('status','refused','reason','bad_recovery_input'); end if;
  v_bonuses:=case when p_report->'bonuses' is null or p_report->'bonuses'='null'::jsonb then '[]'::jsonb else p_report->'bonuses' end;
  if jsonb_typeof(v_bonuses) is distinct from 'array' or exists(select 1 from jsonb_array_elements(v_bonuses) b
      where jsonb_typeof(b) is distinct from 'string' or not (v_attempt.reward_basis->'bonuses' ? (b#>>'{}'))) then
    return jsonb_build_object('status','refused','reason','bad_recovery_input'); end if;
  v_plan:=public.shared_session_lock_plan(array[p_island_owner],p_actor_id);
  perform public.shared_session_lock_plan_rows(v_plan);
  v_now:=clock_timestamp();
  perform public.shared_session_normalize_locked(p_island_owner,v_now);
  if exists(select 1 from public.island_wave_completion_receipts where wave_id=p_wave_id and player_id=p_actor_id) then
    return public.shared_session_finish_view_locked(p_actor_id,p_wave_id,p_session_id,p_connection_generation,true); end if;
  perform public.shared_session_require_control_locked(p_actor_id,p_wave_id,p_island_owner,p_run_epoch,
    p_session_id,p_connection_generation,v_now);
  select * into strict v_run from public.wave_runs where id=p_wave_id;
  select * into strict v_wave from public.recovery_wave_states where wave_id=p_wave_id;
  if v_now<v_run.starts_at+make_interval(secs=>v_run.minimum_seconds) then
    return jsonb_build_object('status','refused','reason','too_early','waitSeconds',greatest(1,
      ceil(extract(epoch from v_run.starts_at+make_interval(secs=>v_run.minimum_seconds)-v_now))::integer)); end if;
  v_checkpoint:=p_report->'checkpoint';
  if v_checkpoint is not null and v_checkpoint<>'null'::jsonb then
    v_result:=public.recovery_wave_report_health_locked(p_actor_id,p_wave_id,(v_checkpoint->>'islandEpoch')::uuid,
      v_checkpoint->>'checkpointUid',(v_checkpoint->>'throughTick')::integer,(v_checkpoint->>'inputHeadSeq')::bigint,
      (v_checkpoint->>'lastRepairSeq')::bigint,v_checkpoint->'basisRepairSeq',v_checkpoint->'hpUnits',v_now);
    if v_result->>'status'='refused' then return v_result; end if;
  end if;
  v_survived:=(p_report->>'survived')::boolean;
  v_outcome:=case when v_survived then 'won' else 'lost' end;
  v_result:=public.shared_session_close_locked(p_wave_id,v_outcome,
    case when v_survived then v_bonuses else '[]'::jsonb end,v_now);
  -- Preserve the existing bounded browser rescue claim, using only accepted
  -- frozen policy. It never awards money, flags, records or a different outcome.
  v_rescue:=v_wave.initial_snapshot#>'{finishPolicy,rescue}';
  if v_result->>'outcome'='lost' and (p_report->>'rescued')::boolean
    and v_rescue->'enabled'='true'::jsonb and v_run.wave between
      (v_rescue->>'fromWave')::integer and (v_rescue->>'lastWave')::integer then
    update public.islands set next_wave=greatest(1,wave_best-(v_rescue->>'restartBack')::integer)
      where player_id=p_island_owner;
  end if;
  update public.wave_runs set ships_sunk=(p_report->>'shipsSunk')::integer where id=p_wave_id;
  return public.shared_session_finish_view_locked(p_actor_id,p_wave_id,p_session_id,p_connection_generation,false);
exception when raise_exception then
  get stacked diagnostics v_reason=message_text;
  if v_reason=any(array['not_member','not_controller','not_in_wave','epoch_mismatch','wave_over']) then
    return jsonb_build_object('status','refused','reason',v_reason); end if;
  raise;
end; $$;
comment on function public.shared_session_wave_finish(uuid,uuid,uuid,uuid,uuid,numeric,jsonb) is
  'Native first terminal report with post-lock clock, original controller/account proof and real optional health checkpoint. Own historical completion replays before mutable membership/epoch/controller facts.';

do $$
declare v_function regprocedure;
begin
  for v_function in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in
    ('shared_session_normalize_slots_locked','shared_session_close_locked','shared_session_normalize_locked',
     'shared_session_finish_view_locked','shared_session_wave_finish') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',v_function);
  end loop;
end $$;
grant execute on function public.shared_session_wave_finish(uuid,uuid,uuid,uuid,uuid,numeric,jsonb) to service_role;

create or replace function public.shared_session_process_due(p_limit integer default 20)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_owners uuid[]; v_owner uuid; v_plan jsonb; v_now timestamptz; v_closed integer:=0; v_before integer;
begin
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid_worker_limit'; end if;
  -- Capture the bounded owner set once. Re-querying eligible owners after a
  -- blocked guard would introduce scope locks after personal/domain locks.
  select array_agg(owner order by owner) into v_owners from (
    select owner from (
      select island_owner owner from public.shared_session_controls where island_owner is not null
        and coalesce(grace_until,connected_until)<=clock_timestamp()
      union
      select a.island_owner from public.island_wave_accounting a
        where not exists(select 1 from public.island_wave_closures c where c.wave_id=a.wave_id)
          and (clock_timestamp()>=a.starts_at+make_interval(secs=>a.maximum_seconds)
            or exists(select 1 from public.shared_session_slots s where s.wave_id=a.wave_id
              and s.status='grace' and s.grace_until<=clock_timestamp())
            or not exists(select 1 from public.shared_session_slots s where s.wave_id=a.wave_id and s.status<>'withdrawn'))
    ) due order by owner limit p_limit
  ) captured;
  if v_owners is null then return jsonb_build_object('status','done','islands',0,'closed',0); end if;
  v_plan:=public.shared_session_lock_plan(v_owners);
  perform public.shared_session_lock_plan_rows(v_plan);
  v_now:=clock_timestamp();
  select count(*) into v_before from public.island_wave_closures c join public.island_wave_accounting a
    on a.wave_id=c.wave_id where a.island_owner=any(v_owners);
  foreach v_owner in array v_owners loop perform public.shared_session_normalize_locked(v_owner,v_now); end loop;
  select count(*)-v_before into v_closed from public.island_wave_closures c join public.island_wave_accounting a
    on a.wave_id=c.wave_id where a.island_owner=any(v_owners);
  return jsonb_build_object('status','done','islands',cardinality(v_owners),'closed',v_closed);
end; $$;
comment on function public.shared_session_process_due(integer) is
  'Bounded service worker captures due lease/grace/expiry owners before locks, rechecks actual canonical slots and closes attempts without any browser, presence callback or activity watchdog.';
revoke all on function public.shared_session_process_due(integer) from public,anon,authenticated,service_role;
grant execute on function public.shared_session_process_due(integer) to service_role;
