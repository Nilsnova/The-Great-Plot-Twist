-- Reader-independent bounded accepted-prefix freshness for free revival.
-- No HP is promoted to a later tick. Existing current fall/controller/pose/hold
-- checks remain; exact completion receipt replay stays in the original consumer.

create or replace function public.shared_session_checkpoint_is_recent(
  p_starts_at timestamptz,p_through_tick integer,p_server_now timestamptz
) returns boolean language sql immutable set search_path='' as $$
  select p_starts_at is not null and p_server_now is not null and p_through_tick is not null
    and p_through_tick between 0 and 18000
    and p_server_now>=p_starts_at+p_through_tick*interval '50 milliseconds'
    and p_server_now<=p_starts_at+p_through_tick*interval '50 milliseconds'+interval '2 seconds';
$$;
comment on function public.shared_session_checkpoint_is_recent(timestamptz,integer,timestamptz) is
  'Private exact trusted-clock age predicate: accepted prefix timestamp must not be future or older than 2000 ms. New UIDs and reader seal movement cannot renew its age.';
revoke all on function public.shared_session_checkpoint_is_recent(timestamptz,integer,timestamptz)
  from public,anon,authenticated,service_role;

create or replace function public.shared_session_revival_context_locked(
  p_actor_id uuid,p_wave_id uuid,p_target_token uuid,p_session_id uuid,p_connection_generation numeric
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_attempt public.island_wave_accounting; v_control public.shared_session_controls;
  v_helper public.shared_session_slots; v_target public.shared_session_slots;
  v_now timestamptz; v_skills jsonb; v_ms integer; v_share integer;
  v_seal integer; v_journal_head bigint; v_required_head bigint;
begin
  v_now:=clock_timestamp();
  if not public.shared_session_actor_active(p_actor_id) then raise exception 'not_member'; end if;
  select * into v_attempt from public.island_wave_accounting where wave_id=p_wave_id;
  if not found then raise exception 'not_in_wave'; end if;
  if not exists(select 1 from public.wave_runs r join public.recovery_wave_states w on w.wave_id=r.id
    where r.id=p_wave_id and r.finished_at is null and w.closed_at is null
      and v_now>=r.starts_at and v_now<r.starts_at+make_interval(secs=>r.maximum_seconds))
    or exists(select 1 from public.island_wave_closures where wave_id=p_wave_id) then
    raise exception 'wave_over'; end if;
  if p_actor_id<>v_attempt.island_owner and not exists(select 1 from public.island_members
    where island_owner=v_attempt.island_owner and player_id=p_actor_id and left_at is null) then
    raise exception 'not_member'; end if;
  select * into v_control from public.shared_session_controls where player_id=p_actor_id;
  if not found or v_control.island_owner is distinct from v_attempt.island_owner
    or v_control.run_epoch is distinct from v_attempt.run_epoch
    or v_control.session_id is distinct from p_session_id
    or v_control.connection_generation is distinct from p_connection_generation
    or v_control.connected_until is null or v_now>=v_control.connected_until then
    raise exception 'not_controller'; end if;
  if not exists(select 1 from public.personal_captain_profiles
    where player_id=p_actor_id and assignment_wave_id=p_wave_id) then raise exception 'not_in_wave'; end if;
  perform 1 from public.shared_session_slots where wave_id=p_wave_id
    and (player_id=p_actor_id or participant_token=p_target_token) order by player_id for update;
  select * into v_helper from public.shared_session_slots where wave_id=p_wave_id and player_id=p_actor_id;
  select * into v_target from public.shared_session_slots where wave_id=p_wave_id and participant_token=p_target_token;
  select sealed_through_tick,journal_head into v_seal,v_journal_head
    from public.recovery_wave_states where wave_id=p_wave_id;
  if v_helper.player_id is not null and v_target.player_id is not null then
    -- Whole-party reports establish one immutable accepted prefix. Reader-only
    -- global seal progress does not renew or invalidate the age of those facts.
    if v_helper.state_through_tick is distinct from v_target.state_through_tick
      or v_helper.state_input_head is distinct from v_target.state_input_head
      or v_helper.state_through_tick>v_seal
      or v_helper.state_input_head>v_journal_head
      or not public.shared_session_checkpoint_is_recent(v_attempt.starts_at,v_helper.state_through_tick,v_now)
      or v_helper.state_input_head<v_helper.revive_basis_seq
      or v_target.state_input_head<v_target.revive_basis_seq then raise exception 'health_sync_required'; end if;
    select coalesce(max(seq),0) into v_required_head from public.recovery_wave_events
      where wave_id=p_wave_id and effective_tick<=v_helper.state_through_tick;
    if v_helper.state_input_head<v_required_head or v_target.state_input_head<v_required_head then
      raise exception 'health_sync_required'; end if;
    if exists(select 1 from public.shared_session_slots s where s.wave_id=p_wave_id
      and s.player_id in(v_helper.player_id,v_target.player_id) and s.revive_basis_seq>0
      and not exists(select 1 from public.recovery_wave_events e where e.wave_id=p_wave_id
        and e.seq=s.revive_basis_seq and e.event_kind='captain_revive'
        and e.payload->>'targetId'=s.participant_token::text and e.effective_tick<=s.state_through_tick)) then
      raise exception 'health_sync_required'; end if;
  end if;
  if v_helper.player_id is null or v_helper.status<>'active' or v_helper.down
    or v_helper.controlling_session_id is distinct from p_session_id
    or v_helper.connection_generation is distinct from p_connection_generation then
    raise exception 'not_controller'; end if;
  if v_target.player_id is null or v_target.player_id=p_actor_id or v_target.status='withdrawn'
    or (v_target.status='grace' and v_target.grace_until<=v_now)
    or not public.shared_session_actor_active(v_target.player_id)
    or not exists(select 1 from public.personal_captain_profiles
      where player_id=v_target.player_id and assignment_wave_id=p_wave_id)
    or not exists(select 1 from public.shared_session_controls l
      where l.player_id=v_target.player_id and l.island_owner=v_attempt.island_owner
        and l.run_epoch=v_attempt.run_epoch and l.session_id=v_target.controlling_session_id
        and l.connection_generation=v_target.connection_generation
        and v_now<coalesce(l.grace_until,l.last_seen+interval '60 seconds'))
    or (v_target.player_id<>v_attempt.island_owner and not exists(select 1 from public.island_members
      where island_owner=v_attempt.island_owner and player_id=v_target.player_id and left_at is null))
    or not v_target.down or v_target.fall_id is null then raise exception 'target_not_fallen'; end if;
  if (v_helper.x-v_target.x)^2+(v_helper.z-v_target.z)^2>9 then raise exception 'out_of_reach'; end if;
  v_skills:=v_helper.frozen_captain->'skills';
  v_ms:=case when v_skills ? 'medic' then 1200 else 2000 end;
  v_share:=case when v_skills ? 'field_surgeon' then 1000000
    when v_skills ? 'medic' then 750000 else 500000 end;
  return jsonb_build_object('helperToken',v_helper.participant_token,'targetToken',v_target.participant_token,
    'fallId',v_target.fall_id,'downAtTick',v_target.down_at_tick,
    'helperPoseRevision',trunc(v_helper.pose_revision)::text,'targetPoseRevision',trunc(v_target.pose_revision)::text,
    'helperX',v_helper.x,'helperZ',v_helper.z,'targetX',v_target.x,'targetZ',v_target.z,
    'helperHpUnits',v_helper.hp_units,'targetHpUnits',v_target.hp_units,'targetMaxHP',100,
    'helperReviveSeq',v_helper.revive_basis_seq,
    'frozenHelperSkills',v_skills,'frozenHelperCaptain',v_helper.frozen_captain,
    'requiredMs',v_ms,'restoreHPUnits',v_share,'reviveReach',3);
end; $$;
comment on function public.shared_session_revival_context_locked(uuid,uuid,uuid,uuid,numeric) is
  'Private current canonical helper/target proof using latest complete accepted party prefix aged at most exactly 2000 ms by the trusted server clock. Checks actual event/revival-basis coverage and all existing live membership/control/fall/pose facts; no per-hit or current-wall-clock HP proof is claimed.';
revoke all on function public.shared_session_revival_context_locked(uuid,uuid,uuid,uuid,numeric)
  from public,anon,authenticated,service_role;
