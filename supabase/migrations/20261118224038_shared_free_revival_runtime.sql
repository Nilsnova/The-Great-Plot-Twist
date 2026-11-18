-- Free shared revival consumes actual canonical session/Captain facts. No money moves.
-- Requires the coordinated MP-ECO-11 context/consume hooks at runtime; absence fails closed.

create table if not exists public.island_shared_revival_holds (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  island_owner uuid not null,
  account_id uuid not null,
  run_epoch uuid not null,
  wave_id uuid not null,
  helper_token uuid not null,
  target_token uuid not null,
  fall_id uuid not null,
  session_id uuid not null,
  connection_generation numeric not null check (connection_generation>=0 and connection_generation=trunc(connection_generation)),
  start_input_uid text not null check (start_input_uid ~ '^[A-Za-z0-9_-]{8,64}$'),
  start_actor_counter bigint not null check (start_actor_counter>0),
  helper_pose_revision numeric not null check (helper_pose_revision>=0 and helper_pose_revision=trunc(helper_pose_revision)),
  target_pose_revision numeric not null check (target_pose_revision>=0 and target_pose_revision=trunc(target_pose_revision)),
  helper_revive_seq bigint not null check (helper_revive_seq>=0),
  required_ms integer not null check (required_ms in (1200,2000)),
  restore_hp_units integer not null check (restore_hp_units between 1 and 1000000),
  started_at timestamptz not null,
  cancelled_at timestamptz,
  cancel_actor_counter bigint,
  completed_operation_id uuid references public.island_economy_operations(id) on delete restrict,
  unique(wave_id,actor_id,start_input_uid),
  foreign key(account_id,run_epoch) references public.island_economy_accounts(id,run_epoch) on delete restrict,
  check ((cancelled_at is null)=(cancel_actor_counter is null)),
  check (cancel_actor_counter is null or cancel_actor_counter>start_actor_counter),
  check (cancelled_at is null or completed_operation_id is null)
);
create unique index if not exists island_shared_revival_one_active_hold
  on public.island_shared_revival_holds(wave_id,actor_id)
  where cancelled_at is null and completed_operation_id is null;
comment on table public.island_shared_revival_holds is
  'Proof of one ordered server-timed hold. Current Captain/fall/controller truth remains in the canonical session source; no live-profile or resettable-wave cascade can erase an original effect.';
comment on column public.island_shared_revival_holds.id is 'Server-created hold identity returned by the accepted start input.';
comment on column public.island_shared_revival_holds.actor_id is 'Authenticated helper, independent of a deletable live profile.';
comment on column public.island_shared_revival_holds.island_owner is 'Original frozen island identity.';
comment on column public.island_shared_revival_holds.account_id is 'Original retained island account; this action never spends it.';
comment on column public.island_shared_revival_holds.run_epoch is 'Frozen treasury run, separate from the recovery reset epoch.';
comment on column public.island_shared_revival_holds.wave_id is 'Canonical accepted reservation UUID.';
comment on column public.island_shared_revival_holds.helper_token is 'Frozen gameplay token of the authenticated helper.';
comment on column public.island_shared_revival_holds.target_token is 'Frozen gameplay token of this hold target.';
comment on column public.island_shared_revival_holds.fall_id is 'Server-owned exact current fall UUID.';
comment on column public.island_shared_revival_holds.session_id is 'Actual controlling session checked at start.';
comment on column public.island_shared_revival_holds.connection_generation is 'Actual controlling connection generation checked at start.';
comment on column public.island_shared_revival_holds.start_input_uid is 'Canonical accepted input UID; replay does not restart the timer.';
comment on column public.island_shared_revival_holds.start_actor_counter is 'Ordered canonical input counter of the start.';
comment on column public.island_shared_revival_holds.helper_pose_revision is 'Accepted helper pose fence; moving out and back invalidates the hold.';
comment on column public.island_shared_revival_holds.target_pose_revision is 'Accepted target pose fence; another position cannot reuse this interval.';
comment on column public.island_shared_revival_holds.helper_revive_seq is 'Existing canonical helper revive basis; falling then standing at the same pose cannot retain an old hold.';
comment on column public.island_shared_revival_holds.required_ms is 'Server-derived frozen ordinary or Medic hold duration.';
comment on column public.island_shared_revival_holds.restore_hp_units is 'Frozen helper restoration rule captured from actual canonical facts.';
comment on column public.island_shared_revival_holds.started_at is 'One trusted post-lock server instant; never a client clock.';
comment on column public.island_shared_revival_holds.cancelled_at is 'Server cancellation time, or null until terminal cancellation/completion.';
comment on column public.island_shared_revival_holds.cancel_actor_counter is 'Accepted cancel/replacement counter; cannot cancel a newer start.';
comment on column public.island_shared_revival_holds.completed_operation_id is 'Successful common root which consumed this hold, or null.';

create table if not exists public.island_shared_revival_receipts (
  operation_id uuid primary key references public.island_economy_operations(id) on delete restrict,
  wave_id uuid not null,
  target_token uuid not null,
  fall_id uuid not null,
  event_seq bigint not null check (event_seq>0),
  receipt_json jsonb not null check (jsonb_typeof(receipt_json)='object'),
  unique(wave_id,target_token,fall_id),
  unique(wave_id,event_seq)
);
comment on table public.island_shared_revival_receipts is 'Immutable free effect receipt; one current fall produces one journal event and one common root. No financial child exists.';
comment on column public.island_shared_revival_receipts.operation_id is 'Immutable global authenticated actor/action root.';
comment on column public.island_shared_revival_receipts.wave_id is 'Original canonical reservation, retained independently of live wave rows.';
comment on column public.island_shared_revival_receipts.target_token is 'Original fallen Captain token.';
comment on column public.island_shared_revival_receipts.fall_id is 'Original server fall UUID; never reused for another fall.';
comment on column public.island_shared_revival_receipts.event_seq is 'Committed global journal sequence, also the canonical revive basis.';
comment on column public.island_shared_revival_receipts.receipt_json is 'Complete original common domain receipt, with no mutable account/HP projection.';

alter table public.island_shared_revival_holds enable row level security;
alter table public.island_shared_revival_receipts enable row level security;
revoke all on table public.island_shared_revival_holds,public.island_shared_revival_receipts
  from public,anon,authenticated,service_role;

create or replace function public.shared_revival_hold_immutable()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then raise exception 'revival_hold_immutable'; end if;
  if (to_jsonb(new)-array['cancelled_at','cancel_actor_counter','completed_operation_id'])
     is distinct from (to_jsonb(old)-array['cancelled_at','cancel_actor_counter','completed_operation_id'])
     or old.cancelled_at is not null and new is distinct from old
     or old.completed_operation_id is not null and new is distinct from old then
    raise exception 'revival_hold_immutable';
  end if;
  return new;
end;
$$;
revoke all on function public.shared_revival_hold_immutable() from public,anon,authenticated,service_role;
comment on function public.shared_revival_hold_immutable() is 'Retain original hold facts and terminal cancellation/completion; never restart an accepted interval.';
create or replace trigger shared_revival_hold_immutable before update or delete
  on public.island_shared_revival_holds for each row execute function public.shared_revival_hold_immutable();
create or replace trigger shared_revival_receipt_immutable before update or delete
  on public.island_shared_revival_receipts for each row execute function public.island_economy_operation_immutable();

create or replace function public.shared_revival_checked_context_locked(
  p_actor_id uuid,p_wave_id uuid,p_target_token uuid,p_session_id uuid,p_connection_generation numeric
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v jsonb; k text; n numeric; c jsonb;
begin
  if to_regprocedure('public.shared_session_revival_context_locked(uuid,uuid,uuid,uuid,numeric)') is null then
    raise exception 'path_unavailable'; end if;
  v:=public.shared_session_revival_context_locked(p_actor_id,p_wave_id,p_target_token,p_session_id,p_connection_generation);
  if jsonb_typeof(v) is distinct from 'object' then raise exception 'path_unavailable'; end if;
  foreach k in array array['helperToken','targetToken','fallId'] loop
    if jsonb_typeof(v->k) is distinct from 'string' or (v->>k)::uuid::text is distinct from v->>k then
      raise exception 'path_unavailable'; end if;
  end loop;
  if v->>'targetToken' is distinct from p_target_token::text then raise exception 'path_unavailable'; end if;
  foreach k in array array['helperPoseRevision','targetPoseRevision'] loop
    if jsonb_typeof(v->k) is distinct from 'string' or v->>k!~'^(0|[1-9][0-9]*)$' then
      raise exception 'path_unavailable'; end if;
  end loop;
  foreach k in array array['downAtTick','helperReviveSeq','helperHpUnits',
    'targetHpUnits','targetMaxHP','requiredMs','restoreHPUnits','helperX','helperZ','targetX','targetZ','reviveReach'] loop
    if jsonb_typeof(v->k) is distinct from 'number' then raise exception 'path_unavailable'; end if;
  end loop;
  foreach k in array array['downAtTick','helperReviveSeq','helperHpUnits',
    'targetHpUnits','requiredMs','restoreHPUnits'] loop
    if not public.island_treasury_whole((v->>k)::numeric,true) then raise exception 'path_unavailable'; end if;
  end loop;
  if (v->>'downAtTick')::numeric>18000 or (v->>'helperHpUnits')::numeric not between 1 and 1000000
     or (v->>'targetHpUnits')::numeric<>0 or (v->>'targetMaxHP')::numeric<=0
     or (v->>'requiredMs')::numeric not in (1200,2000)
     or (v->>'restoreHPUnits')::numeric not between 1 and 1000000
     or (v->>'reviveReach')::numeric not between 0.01 and 10 then raise exception 'path_unavailable'; end if;
  foreach k in array array['helperX','helperZ','targetX','targetZ'] loop
    n:=(v->>k)::numeric;
    if n not between -499.999 and 499.999 then raise exception 'path_unavailable'; end if;
  end loop;
  c:=v->'frozenHelperCaptain';
  if jsonb_typeof(c) is distinct from 'object' or jsonb_typeof(c->'level') is distinct from 'number'
     or not public.island_treasury_whole((c->>'level')::numeric,false)
     or (c->>'level')::numeric not between 1 and 5
     or jsonb_typeof(c->'skills') is distinct from 'array'
     or c->'skills' is distinct from v->'frozenHelperSkills'
     or jsonb_typeof(c->'weapon') is distinct from 'string'
     or length(c->>'weapon') not between 1 and 64 then raise exception 'path_unavailable'; end if;
  if jsonb_array_length(c->'skills')>32 or exists(select 1 from jsonb_array_elements(c->'skills') x
    where jsonb_typeof(x) is distinct from 'string') then raise exception 'path_unavailable'; end if;
  return v;
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'path_unavailable';
end;
$$;
revoke all on function public.shared_revival_checked_context_locked(uuid,uuid,uuid,uuid,numeric)
  from public,anon,authenticated,service_role;
comment on function public.shared_revival_checked_context_locked(uuid,uuid,uuid,uuid,numeric) is
  'Private defensive reader of real MP-ECO-11 facts; no caller JSON or fallback can replace the canonical provider.';

create or replace function public.shared_revival_hold_start_locked(
  p_actor_id uuid,p_wave_id uuid,p_target_token uuid,p_fall_id uuid,p_session_id uuid,
  p_connection_generation numeric,p_input_uid text,p_actor_counter bigint,p_server_now timestamptz
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v jsonb; b jsonb; h public.island_shared_revival_holds;
begin
  if p_actor_id is null or p_wave_id is null or p_target_token is null or p_fall_id is null
    or p_session_id is null or not public.island_treasury_whole(p_connection_generation,true)
    or p_input_uid is null or p_input_uid!~'^[A-Za-z0-9_-]{8,64}$'
    or p_actor_counter is null or p_actor_counter<1 or p_server_now is null then
    raise exception 'bad_revival_hold'; end if;
  select * into h from public.island_shared_revival_holds
    where wave_id=p_wave_id and actor_id=p_actor_id and start_input_uid=p_input_uid for update;
  if found then
    if h.target_token<>p_target_token or h.fall_id<>p_fall_id or h.session_id<>p_session_id
      or h.connection_generation<>p_connection_generation or h.start_actor_counter<>p_actor_counter then
      raise exception 'input_uid_conflict'; end if;
    return jsonb_build_object('holdId',h.id,'startedAt',h.started_at,'requiredMs',h.required_ms,'repeat',true);
  end if;
  v:=public.shared_revival_checked_context_locked(p_actor_id,p_wave_id,p_target_token,p_session_id,p_connection_generation);
  if v->>'fallId' is distinct from p_fall_id::text then raise exception 'stale_fall'; end if;
  if power((v->>'helperX')::numeric-(v->>'targetX')::numeric,2)
     +power((v->>'helperZ')::numeric-(v->>'targetZ')::numeric,2)>power((v->>'reviveReach')::numeric,2) then
    raise exception 'out_of_range'; end if;
  select initial_snapshot->'economy' into b from public.recovery_wave_states where wave_id=p_wave_id;
  if jsonb_typeof(b) is distinct from 'object' or b->'mode' is distinct from '"island_shared"'::jsonb
    or b->'version' is distinct from '1'::jsonb then raise exception 'path_unavailable'; end if;
  if exists(select 1 from public.island_shared_revival_holds where wave_id=p_wave_id and actor_id=p_actor_id
    and cancelled_at is null and completed_operation_id is null and start_actor_counter>=p_actor_counter) then
    raise exception 'input_counter_conflict'; end if;
  update public.island_shared_revival_holds set cancelled_at=p_server_now,cancel_actor_counter=p_actor_counter
    where wave_id=p_wave_id and actor_id=p_actor_id and cancelled_at is null and completed_operation_id is null;
  insert into public.island_shared_revival_holds(actor_id,island_owner,account_id,run_epoch,wave_id,
    helper_token,target_token,fall_id,session_id,connection_generation,start_input_uid,start_actor_counter,
    helper_pose_revision,target_pose_revision,helper_revive_seq,required_ms,restore_hp_units,started_at)
  values(p_actor_id,(b->>'islandOwner')::uuid,(b->>'accountId')::uuid,(b->>'runEpoch')::uuid,p_wave_id,
    (v->>'helperToken')::uuid,p_target_token,p_fall_id,p_session_id,p_connection_generation,p_input_uid,p_actor_counter,
    (v->>'helperPoseRevision')::numeric,(v->>'targetPoseRevision')::numeric,(v->>'helperReviveSeq')::bigint,
    (v->>'requiredMs')::integer,(v->>'restoreHPUnits')::integer,p_server_now) returning * into h;
  return jsonb_build_object('holdId',h.id,'startedAt',h.started_at,'requiredMs',h.required_ms,'repeat',false);
end;
$$;
revoke all on function public.shared_revival_hold_start_locked(uuid,uuid,uuid,uuid,uuid,numeric,text,bigint,timestamptz)
  from public,anon,authenticated,service_role;
comment on function public.shared_revival_hold_start_locked(uuid,uuid,uuid,uuid,uuid,numeric,text,bigint,timestamptz) is
  'Private accepted-input hook. Canonical caller preholds common locks and has checked UID/counter ordering/current control. Captures genuine target/fall/pose/frozen timing once; never a standalone client timing capability.';

create or replace function public.shared_revival_hold_cancel_locked(
  p_actor_id uuid,p_wave_id uuid,p_session_id uuid,p_connection_generation numeric,
  p_input_uid text,p_actor_counter bigint,p_server_now timestamptz
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare n integer;
begin
  if p_actor_id is null or p_wave_id is null or p_session_id is null
    or not public.island_treasury_whole(p_connection_generation,true)
    or p_input_uid is null or p_input_uid!~'^[A-Za-z0-9_-]{8,64}$'
    or p_actor_counter is null or p_actor_counter<1 or p_server_now is null then
    raise exception 'bad_revival_hold'; end if;
  update public.island_shared_revival_holds set cancelled_at=p_server_now,cancel_actor_counter=p_actor_counter
    where actor_id=p_actor_id and wave_id=p_wave_id and session_id=p_session_id
      and connection_generation=p_connection_generation and start_actor_counter<p_actor_counter
      and cancelled_at is null and completed_operation_id is null;
  get diagnostics n=row_count;
  return jsonb_build_object('cancelled',n>0);
end;
$$;
revoke all on function public.shared_revival_hold_cancel_locked(uuid,uuid,uuid,numeric,text,bigint,timestamptz)
  from public,anon,authenticated,service_role;
comment on function public.shared_revival_hold_cancel_locked(uuid,uuid,uuid,numeric,text,bigint,timestamptz) is
  'Private accepted cancel-input hook after actual controller and input order checks. Old counters/generations cannot cancel newer starts; target disappearance never prevents cancellation of an owned interval.';

create or replace function public.shared_revival_hold_context_locked(
  p_actor_id uuid,p_wave_id uuid,p_hold_id uuid,p_target_token uuid,p_fall_id uuid,
  p_session_id uuid,p_connection_generation numeric,p_server_now timestamptz
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare h public.island_shared_revival_holds; v jsonb;
begin
  select * into h from public.island_shared_revival_holds
    where id=p_hold_id and actor_id=p_actor_id and wave_id=p_wave_id for update;
  if not found then raise exception 'hold_missing'; end if;
  if h.cancelled_at is not null or h.completed_operation_id is not null
    or h.target_token<>p_target_token or h.fall_id<>p_fall_id or h.session_id<>p_session_id
    or h.connection_generation is distinct from p_connection_generation then raise exception 'hold_invalidated'; end if;
  v:=public.shared_revival_checked_context_locked(p_actor_id,p_wave_id,p_target_token,p_session_id,p_connection_generation);
  if v->>'fallId' is distinct from p_fall_id::text then raise exception 'stale_fall'; end if;
  if (v->>'helperToken')::uuid<>h.helper_token
    or (v->>'helperPoseRevision')::numeric<>h.helper_pose_revision
    or (v->>'targetPoseRevision')::numeric<>h.target_pose_revision
    or (v->>'helperReviveSeq')::bigint<>h.helper_revive_seq
    or (v->>'requiredMs')::integer<>h.required_ms
    or (v->>'restoreHPUnits')::integer<>h.restore_hp_units then raise exception 'hold_invalidated'; end if;
  if power((v->>'helperX')::numeric-(v->>'targetX')::numeric,2)
    +power((v->>'helperZ')::numeric-(v->>'targetZ')::numeric,2)>power((v->>'reviveReach')::numeric,2) then
    raise exception 'out_of_range'; end if;
  if p_server_now is null or p_server_now<h.started_at
    or extract(epoch from (p_server_now-h.started_at))*1000<h.required_ms then raise exception 'hold_incomplete'; end if;
  return v||jsonb_build_object('holdId',h.id,'startedAt',h.started_at);
end;
$$;
revoke all on function public.shared_revival_hold_context_locked(uuid,uuid,uuid,uuid,uuid,uuid,numeric,timestamptz)
  from public,anon,authenticated,service_role;
comment on function public.shared_revival_hold_context_locked(uuid,uuid,uuid,uuid,uuid,uuid,numeric,timestamptz) is
  'Private current hold proof: actual canonical context, exact fall/poses/control generation, frozen reach and server elapsed time. No caller state flag or elapsed assertion is accepted.';

create or replace function public.island_shared_revival_replay(
  p_actor_id uuid,p_island_owner uuid,p_account_id uuid,p_run_epoch uuid,p_action_uid text,p_fingerprint jsonb
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.island_economy_operations; r public.island_shared_revival_receipts;
begin
  select * into o from public.island_economy_operations where actor_id=p_actor_id and action_uid=p_action_uid;
  if not found then return null; end if;
  if not o.is_player_intent or o.domain_action<>'wave_revive' or o.fingerprint is distinct from p_fingerprint
    or o.run_epoch is distinct from p_run_epoch or p_account_id is not null and o.account_id<>p_account_id
    or not exists(select 1 from public.island_economy_accounts where id=o.account_id and island_owner=p_island_owner) then
    return jsonb_build_object('status','refused','reason','action_conflict'); end if;
  select * into r from public.island_shared_revival_receipts where operation_id=o.id;
  if not found then return jsonb_build_object('status','refused','reason','path_unavailable'); end if;
  return jsonb_build_object('status','done','repeat',true,'receipt',r.receipt_json);
end;
$$;
revoke all on function public.island_shared_revival_replay(uuid,uuid,uuid,uuid,text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.island_shared_revival_replay(uuid,uuid,uuid,uuid,text,jsonb) to service_role;
comment on function public.island_shared_revival_replay(uuid,uuid,uuid,uuid,text,jsonb) is
  'Read only original authenticated root/target/fall receipt before current membership, hold, epoch or phase. Never exposes current money or Captain state.';

create or replace function public.island_shared_captain_revive(
  p_actor_id uuid,p_island_owner uuid,p_account_id uuid,p_run_epoch uuid,p_action_uid text,
  p_wave_id uuid,p_target_token uuid,p_fall_id uuid,p_hold_id uuid,p_session_id uuid,p_connection_generation numeric
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  a public.island_economy_accounts; s public.island_economy_state; w public.recovery_wave_states;
  recovery public.island_recovery_state;
  run public.wave_runs; h public.island_shared_revival_holds; e public.recovery_wave_events;
  f jsonb; root jsonb; op uuid; proof jsonb; b jsonb; receipt jsonb; result jsonb;
  scope bigint; target_player uuid; players uuid[]; now_at timestamptz; tick integer; reason text;
begin
  if p_actor_id is null or p_island_owner is null or p_account_id is null or p_run_epoch is null
    or p_wave_id is null or p_target_token is null or p_fall_id is null or p_hold_id is null or p_session_id is null
    or p_action_uid is null or p_action_uid!~'^[A-Za-z0-9_-]{8,64}$'
    or left(p_action_uid,3)='fx_' or left(p_action_uid,4)='sys_'
    or not public.island_treasury_whole(p_connection_generation,true) then
    return jsonb_build_object('status','refused','reason','invalid_change'); end if;
  f:=jsonb_build_object('islandOwner',p_island_owner,'waveId',p_wave_id,'targetToken',p_target_token,'fallId',p_fall_id);
  -- Capture the actual target's personal scope before earlier lock classes. Missing live
  -- state cannot block owned historical receipt replay; fresh authority is checked below.
  if to_regclass('public.shared_session_slots') is not null then
    select slot.player_id into target_player from public.shared_session_slots slot
      join public.island_wave_accounting attempt on attempt.wave_id=slot.wave_id
      where slot.wave_id=p_wave_id and slot.participant_token=p_target_token
        and attempt.island_owner=p_island_owner and attempt.account_id=p_account_id
        and attempt.run_epoch=p_run_epoch;
  end if;
  for scope in select distinct hashtextextended('island-economy:'||owner_id::text,0)
    from unnest(array[p_actor_id,p_island_owner,target_player]) owner_id
    where owner_id is not null order by 1 loop
    perform pg_advisory_xact_lock(scope);
  end loop;
  select * into a from public.island_economy_accounts
    where id=p_account_id and island_owner=p_island_owner for update;
  if not found or a.island_owner<>p_island_owner then return jsonb_build_object('status','refused','reason','account_missing'); end if;
  begin
    root:=public.island_economy_claim_operation_locked(p_actor_id,p_account_id,p_run_epoch,p_action_uid,'wave_revive',f);
    if root->>'status'='refused' then result:=root; raise exception using errcode='PT052'; end if;
    if root->>'status'='replay' then
      return public.island_shared_revival_replay(p_actor_id,p_island_owner,p_account_id,p_run_epoch,p_action_uid,f);
    end if;
    op:=(root->>'operationId')::uuid;
    if to_regprocedure('public.shared_session_revival_context_locked(uuid,uuid,uuid,uuid,numeric)') is null
      or to_regprocedure('public.shared_session_revive_consume_locked(uuid,uuid,uuid,bigint,integer)') is null then
      result:=jsonb_build_object('status','refused','reason','path_unavailable'); raise exception using errcode='PT052'; end if;
    -- Do not discover another earlier scope after account/root locks. Retry with the
    -- complete immutable target set if a previously invisible bell committed meanwhile.
    if target_player is distinct from (select slot.player_id from public.shared_session_slots slot
      join public.island_wave_accounting attempt on attempt.wave_id=slot.wave_id
      where slot.wave_id=p_wave_id and slot.participant_token=p_target_token
        and attempt.island_owner=p_island_owner and attempt.account_id=p_account_id
        and attempt.run_epoch=p_run_epoch) then
      result:=jsonb_build_object('status','refused','reason','path_unavailable'); raise exception using errcode='PT052'; end if;
    -- Only helper and target personal anchors are needed; an unrelated deleted roster member is not a gate.
    players:=array[p_actor_id,target_player];
    perform 1 from public.profiles where id=any(players) order by id for no key update;
    perform 1 from public.personal_captain_profiles where player_id=any(players) order by player_id for update;
    perform 1 from public.islands where player_id=p_island_owner for update;
    if not found then raise exception 'wave_over'; end if;
    select * into s from public.island_economy_state where island_owner=p_island_owner for update;
    if not found or s.current_account_id<>p_account_id or s.run_epoch<>p_run_epoch or a.run_epoch<>p_run_epoch then
      result:=jsonb_build_object('status','refused','reason','epoch_mismatch'); raise exception using errcode='PT052'; end if;
    if a.state<>'active' then raise exception 'wave_over'; end if;
    select * into recovery from public.island_recovery_state where island_owner=p_island_owner for update;
    select * into w from public.recovery_wave_states where wave_id=p_wave_id and island_owner=p_island_owner for update;
    if not found or w.closed_at is not null then raise exception 'wave_over'; end if;
    if recovery.island_owner is null or recovery.current_wave_id is distinct from p_wave_id
      or recovery.reset_epoch is distinct from w.reset_epoch then raise exception 'wave_over'; end if;
    select * into run from public.wave_runs
      where id=p_wave_id and place='island' and island_owner=p_island_owner for update;
    if not found then raise exception 'wave_over'; end if;
    b:=w.initial_snapshot->'economy';
    if jsonb_typeof(b) is distinct from 'object' or b->'mode' is distinct from '"island_shared"'::jsonb
      or b->'version' is distinct from '1'::jsonb or b->'islandOwner' is distinct from to_jsonb(p_island_owner::text)
      or b->'accountId' is distinct from to_jsonb(p_account_id::text) or b->'runEpoch' is distinct from to_jsonb(p_run_epoch::text) then
      raise exception 'path_unavailable'; end if;
    now_at:=clock_timestamp();
    proof:=public.shared_revival_hold_context_locked(p_actor_id,p_wave_id,p_hold_id,p_target_token,p_fall_id,
      p_session_id,p_connection_generation,now_at);
    select * into h from public.island_shared_revival_holds where id=p_hold_id;
    if h.account_id<>p_account_id or h.run_epoch<>p_run_epoch or h.island_owner<>p_island_owner then raise exception 'hold_invalidated'; end if;
    tick:=greatest(0,floor(extract(epoch from (now_at-run.starts_at))*20)::integer)+1;
    e:=public.recovery_wave_append_event_locked(p_wave_id,p_actor_id,(proof->>'helperToken')::uuid,null,null,null,
      'captain_revive',tick,jsonb_build_object('operationId',op,'targetId',p_target_token,'fallId',p_fall_id,'holdId',p_hold_id,
        'captain',proof->'frozenHelperCaptain','command',jsonb_build_object('type','captain_revive',
          'targetId',p_target_token,'downAt',(proof->>'downAtTick')::integer,
          'x',(proof->>'helperX')::numeric,'z',(proof->>'helperZ')::numeric)));
    perform public.shared_session_revive_consume_locked(p_wave_id,p_target_token,p_fall_id,e.seq,(proof->>'restoreHPUnits')::integer);
    receipt:=jsonb_build_object('receiptId',op,'actionUid',p_action_uid,'action','wave_revive','actorId',p_actor_id,
      'origin',jsonb_build_object('mode','island_shared','version',1,'islandOwner',p_island_owner,'accountId',p_account_id,'runEpoch',p_run_epoch),
      'result',jsonb_build_object('waveId',p_wave_id,'targetToken',p_target_token,'fallId',p_fall_id,'holdId',p_hold_id,
        'downAtTick',(proof->>'downAtTick')::integer,'eventSeq',e.seq,'reviveSeq',e.seq,'restoredHPUnits',(proof->>'restoreHPUnits')::integer));
    insert into public.island_shared_revival_receipts(operation_id,wave_id,target_token,fall_id,event_seq,receipt_json)
      values(op,p_wave_id,p_target_token,p_fall_id,e.seq,receipt);
    update public.island_shared_revival_holds set completed_operation_id=op where id=p_hold_id;
    return jsonb_build_object('status','done','repeat',false,'receipt',receipt);
  exception when sqlstate 'PT052' then return result;
  when raise_exception then
    reason:=sqlerrm;
    if reason='stale_fall' then reason:='fall_mismatch'; end if;
    if reason='target_not_fallen' then reason:='target_unavailable'; end if;
    if reason='out_of_reach' then reason:='out_of_range'; end if;
    if reason in ('not_controller','not_in_wave','not_member','wave_over','hold_missing','hold_invalidated',
      'hold_incomplete','fall_mismatch','target_unavailable','out_of_range','health_sync_required','path_unavailable') then
      return jsonb_build_object('status','refused','reason',reason);
    end if;
    if reason='recovery_event_after_maximum' then return jsonb_build_object('status','refused','reason','wave_over'); end if;
    raise;
  end;
end;
$$;
revoke all on function public.island_shared_captain_revive(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,numeric)
  from public,anon,authenticated,service_role;
grant execute on function public.island_shared_captain_revive(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,numeric) to service_role;
comment on function public.island_shared_captain_revive(uuid,uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,numeric) is
  'Atomic free current-fall revival: scope/account/root/personal/island/recovery/wave locks, genuine canonical timed-hold proof, one journal event/current-fall consume/common receipt. All refusals roll back a new root; no wallet, treasury delta, financial child or paid quota exists.';
