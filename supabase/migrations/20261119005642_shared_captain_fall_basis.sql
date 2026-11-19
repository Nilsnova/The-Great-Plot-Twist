-- Native Captain checkpoint correction: a new fall timestamp cannot precede
-- the actual committed revival event whose basis the report echoes. Existing
-- immutable report replay and same-tick post-revival damage remain supported.

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
    -- A fresh revival basis proves when this life began. An old fallen
    -- timestamp cannot create a new fall before that committed event occurred.
    -- Equality permits genuine damage later in the same simulation tick.
    if v_basis>0 and v_hp=0 and not v_slot.down and exists(
      select 1 from public.recovery_wave_events e where e.wave_id=p_wave_id and e.seq=v_basis
        and e.event_kind='captain_revive' and e.payload->>'targetId'=v_slot.participant_token::text
        and v_down<e.effective_tick) then raise exception 'stale_fall'; end if;
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
  'Native sealed Captain checkpoint with actual revival frontier and new-fall timestamp fence: downAtTick must be at least the committed current basis event tick. Existing report replay, fall identity and bounded Tavern healing remain intact.';
revoke all on function public.shared_session_wave_captains(uuid,uuid,uuid,uuid,uuid,numeric,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.shared_session_wave_captains(uuid,uuid,uuid,uuid,uuid,numeric,jsonb) to service_role;
