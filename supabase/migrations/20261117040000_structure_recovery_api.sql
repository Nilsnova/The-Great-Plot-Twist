-- Protocol-2 journal and complete replay checkpoint transport.
-- This migration is additive; the legacy wave functions are intentionally untouched.
alter table public.recovery_wave_events
  add column if not exists actor_counter bigint,
  add column if not exists requested_tick integer;

alter table public.recovery_wave_participants
  add column if not exists page_head_seq bigint,
  add column if not exists page_sealed_tick integer;

alter table public.recovery_wave_participants
  drop constraint if exists recovery_wave_participants_page_pair,
  add constraint recovery_wave_participants_page_pair check (
    (page_head_seq is null and page_sealed_tick is null)
    or (page_head_seq >= 0 and page_sealed_tick >= -1)
  );

comment on column public.recovery_wave_events.actor_counter is
  'Actor-local monotonic input counter, distinct from global serverSeq. Null on server-authored events.';
comment on column public.recovery_wave_events.requested_tick is
  'Client-requested input tick retained privately for stable retry fingerprints; accepted effective_tick is server-clamped.';
comment on column public.recovery_wave_participants.page_head_seq is
  'Private read watermark for this participant current event page; the matching sealed tick stays fixed across pages.';
comment on column public.recovery_wave_participants.page_sealed_tick is
  'Sealed frontier paired with page_head_seq until this participant opens its next watermark.';

grant update (last_actor_counter, page_head_seq, page_sealed_tick)
  on table public.recovery_wave_participants to service_role;

-- Keep retry fingerprints immutable when account deletion anonymizes event actors.
create or replace function public.recovery_wave_event_append_only()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.actor_id is not null and new.actor_id is null
     and old.participant_token is not null
     and new.wave_id = old.wave_id and new.seq = old.seq
     and new.participant_token = old.participant_token
     and new.input_uid is not distinct from old.input_uid
     and new.actor_counter is not distinct from old.actor_counter
     and new.requested_tick is not distinct from old.requested_tick
     and new.event_kind = old.event_kind
     and new.effective_tick = old.effective_tick
     and new.payload = old.payload
     and new.committed_at = old.committed_at
     and not exists (select 1 from public.profiles where id = old.actor_id) then
    return new;
  end if;
  raise exception 'recovery_event_append_only';
end;
$$;

comment on function public.recovery_wave_event_append_only() is
  'Rejects journal mutation except clearing the private actor ID after profile deletion; token, UID/counter/tick fingerprint and replay payload remain immutable.';

create or replace function public.recovery_wave_inputs(
  p_player_id uuid,
  p_wave_id uuid,
  p_inputs jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_island_state public.island_recovery_state;
  v_wave public.recovery_wave_states;
  v_run public.wave_runs;
  v_participant public.recovery_wave_participants;
  v_owner uuid;
  v_now timestamptz;
  v_tick integer;
  v_effective integer;
  v_head bigint;
  v_counter bigint;
  v_expected bigint;
  v_uid text;
  v_command jsonb;
  v_captain jsonb;
  v_payload jsonb;
  v_kind text;
  v_requested_tick integer;
  v_existing public.recovery_wave_events;
  v_event public.recovery_wave_events;
  v_new jsonb := '[]'::jsonb;
  v_all jsonb := '[]'::jsonb;
  v_pending jsonb := '[]'::jsonb;
  v_item jsonb;
  v_existing_count integer := 0;
  v_is_repeat boolean;
begin
  if p_player_id is null or p_wave_id is null or jsonb_typeof(p_inputs) is distinct from 'array'
     or jsonb_array_length(p_inputs) not between 1 and 32 then
    raise exception 'bad_recovery_inputs';
  end if;
  if octet_length(p_inputs::text) > 16384 then
    raise exception 'recovery_inputs_too_large';
  end if;
  if exists (select 1 from jsonb_array_elements(p_inputs) as input_row(value)
      group by input_row.value ->> 'inputUid' having count(*) > 1) then
    raise exception 'bad_recovery_input';
  end if;

  select island_owner into v_owner from public.recovery_wave_states where wave_id = p_wave_id;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_wave');
  end if;
  -- Progression is read from both the defended island and the sender's own
  -- island. Lock both in UUID order before taking wave/participant locks.
  perform 1 from public.islands
   where player_id = p_player_id or player_id = v_owner
   order by player_id for update;
  select * into v_island_state from public.island_recovery_state
   where island_owner=v_owner for update;
  if not found or v_island_state.current_wave_id is distinct from p_wave_id then
    return jsonb_build_object('status','refused','reason','wave_over');
  end if;
  select * into v_wave from public.recovery_wave_states where wave_id = p_wave_id for update;
  select * into v_run from public.wave_runs where id = p_wave_id for update;
  if not found or v_wave.wave_protocol <> 2 or v_wave.recovery_version <> 1 then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_wave');
  end if;
  select * into v_participant from public.recovery_wave_participants
   where wave_id = p_wave_id and player_id = p_player_id for update;
  if not found or not exists (
    select 1 from public.wave_participants
     where wave_id = p_wave_id and player_id = p_player_id and finished_at is null
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'not_in_wave');
  end if;
  if v_wave.closed_at is not null or v_wave.reset_epoch is distinct from (
    select reset_epoch from public.island_recovery_state where island_owner = v_owner
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'wave_over');
  end if;

  v_now := clock_timestamp();
  if v_run.starts_at + make_interval(secs => v_run.maximum_seconds) <= v_now then
    return jsonb_build_object('status', 'refused', 'reason', 'wave_over');
  end if;
  v_tick := greatest(0, floor(extract(epoch from (v_now - v_run.starts_at)) * 20)::integer);
  v_counter := v_participant.last_actor_counter;
  v_head := v_wave.journal_head;

  select jsonb_build_object(
    'level', captain_level,
    'skills', case when v_wave.recovery_version = 1 then
       array(select skill from unnest(captain_skills ||
              case when captain_role is null then '{}'::text[] else array[captain_role] end) as skill
              where skill <> all(array['quick_fix','long_reach','sturdy_planks','master_shipwright','swift_hammer','wide_arc','grand_engineer']::text[]))
       else captain_skills end,
    'weapon', weapon_equipped
  ) into v_captain from public.islands where player_id = p_player_id;
  if v_captain is null then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  -- Validate every command and its retry identity before writing anything.
  for v_item in select value from jsonb_array_elements(p_inputs)
  loop
    v_uid := v_item ->> 'inputUid';
    v_expected := nullif(v_item ->> 'actorCounter', '')::bigint;
    v_requested_tick := nullif(v_item ->> 'tick', '')::integer;
    v_command := v_item -> 'command';
    v_kind := v_command ->> 'type';
    if v_uid is null or v_uid !~ '^[A-Za-z0-9_-]{8,64}$'
       or v_expected is null or v_expected < 1 or jsonb_typeof(v_command) is distinct from 'object'
       or jsonb_typeof(v_item -> 'tick') is distinct from 'number'
       or v_requested_tick not between 0 and 18000
       or v_kind not in ('fire','lamps_lit','captain_shot','captain_strike','captain_move','captain_revive','finisher_ready','finisher_input')
       or v_kind is null or v_command ?| array['by','level','skills','weapon'] then
      raise exception 'bad_recovery_input';
    end if;
    select * into v_existing from public.recovery_wave_events
     where wave_id = p_wave_id and participant_token = v_participant.participant_token
       and input_uid = v_uid;
    if found then
      if v_existing.actor_counter is distinct from v_expected
         or v_existing.requested_tick is distinct from v_requested_tick
         or v_existing.payload -> 'command' is distinct from v_command then
        return jsonb_build_object('status', 'refused', 'reason', 'input_conflict');
      end if;
      v_all := v_all || jsonb_build_array(jsonb_build_object(
        'serverSeq', v_existing.seq, 'effectiveTick', v_existing.effective_tick,
        'type', v_existing.event_kind, 'participantToken', v_existing.participant_token,
        'payload', v_existing.payload));
      v_existing_count := v_existing_count + 1;
      continue;
    end if;
    if v_expected <> v_counter + 1 then
      return jsonb_build_object('status', 'refused', 'reason', 'counter_gap');
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_inputs) as later(value)
       where later.value ->> 'actorCounter' = v_expected::text
         and later.value ->> 'inputUid' <> v_uid
    ) then
      raise exception 'bad_recovery_input';
    end if;
    if v_now < v_run.starts_at and v_kind not in ('captain_move') then
      return jsonb_build_object('status', 'refused', 'reason', 'command_before_start');
    end if;
    if v_run.place = 'island' and v_kind = 'lamps_lit' then
      return jsonb_build_object('status', 'refused', 'reason', 'bad_recovery_input');
    end if;
    v_counter := v_expected;
    v_effective := case when v_now < v_run.starts_at then 0
      else greatest(v_requested_tick, v_tick + 5, v_wave.sealed_through_tick + 1, 0) end;
    v_payload := jsonb_build_object(
      'inputUid', v_uid, 'actorCounter', v_expected,
      'participantToken', v_participant.participant_token,
      'command', v_command, 'captain', v_captain
    );
    v_pending := v_pending || jsonb_build_array(jsonb_build_object(
      'effectiveTick', v_effective, 'inputUid', v_uid, 'actorCounter', v_expected,
      'tick', v_requested_tick,
      'payload', v_payload));
  end loop;

  for v_item in select value from jsonb_array_elements(v_pending)
  loop
    v_head := v_head + 1;
    insert into public.recovery_wave_events
      (wave_id, seq, actor_id, participant_token, input_uid, actor_counter,requested_tick,
       event_kind, effective_tick, payload)
    values
      (p_wave_id, v_head, p_player_id, v_participant.participant_token,
       v_item ->> 'inputUid', (v_item ->> 'actorCounter')::bigint,
       (v_item ->> 'tick')::integer,
       'captain_input', (v_item ->> 'effectiveTick')::integer, v_item -> 'payload')
    returning * into v_event;
    v_new := v_new || jsonb_build_array(jsonb_build_object(
      'serverSeq', v_event.seq, 'effectiveTick', v_event.effective_tick,
      'type', v_event.event_kind, 'participantToken', v_event.participant_token,
      'payload', v_event.payload));
  end loop;
  update public.recovery_wave_participants set last_actor_counter = v_counter
   where wave_id = p_wave_id and player_id = p_player_id;
  update public.recovery_wave_states set journal_head = v_head
   where wave_id = p_wave_id;
  return jsonb_build_object('status', 'accepted', 'accepted', v_all || v_new, 'headSeq', v_head,
                            'repeat', jsonb_array_length(v_pending) = 0);
end;
$$;

create or replace function public.recovery_wave_events_page(
  p_player_id uuid,
  p_wave_id uuid,
  p_after bigint,
  p_through bigint default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_island_state public.island_recovery_state;
  v_wave public.recovery_wave_states;
  v_part public.recovery_wave_participants;
  v_run public.wave_runs;
  v_owner uuid;
  v_now timestamptz;
  v_head bigint;
  v_sealed integer;
  v_through bigint;
  v_page jsonb;
begin
  if p_player_id is null or p_wave_id is null or p_after is null or p_after < 0
     or (p_through is not null and p_through < 0) then
    raise exception 'bad_recovery_page';
  end if;
  select island_owner into v_owner from public.recovery_wave_states where wave_id = p_wave_id;
  if not found then return jsonb_build_object('status','refused','reason','no_such_wave'); end if;
  perform 1 from public.islands where player_id = v_owner order by player_id for update;
  select * into v_island_state from public.island_recovery_state
   where island_owner=v_owner for update;
  select * into v_wave from public.recovery_wave_states where wave_id = p_wave_id for update;
  select * into v_part from public.recovery_wave_participants
   where wave_id = p_wave_id and player_id = p_player_id for update;
  if not found or not exists (
    select 1 from public.wave_participants where wave_id=p_wave_id and player_id=p_player_id
  ) then return jsonb_build_object('status','refused','reason','not_in_wave'); end if;
  if v_wave.wave_protocol <> 2 then
    return jsonb_build_object('status','refused','reason','client_update_required');
  end if;
  v_now := clock_timestamp();
  if p_through is null then
    if v_part.page_head_seq is not null and p_after < v_part.page_head_seq then
      return jsonb_build_object('status','refused','reason','page_incomplete');
    end if;
    select * into v_run from public.wave_runs where id=p_wave_id;
    v_head := v_wave.journal_head;
    v_sealed := case when v_now < v_run.starts_at then -1 else
      greatest(v_wave.sealed_through_tick, floor(extract(epoch from (v_now - v_run.starts_at)) * 20)::integer - 1) end;
    update public.recovery_wave_states set sealed_through_tick = greatest(sealed_through_tick, v_sealed)
     where wave_id=p_wave_id;
    v_sealed := greatest(v_wave.sealed_through_tick, v_sealed);
    update public.recovery_wave_participants
       set page_head_seq=v_head, page_sealed_tick=v_sealed
     where wave_id=p_wave_id and player_id=p_player_id;
    v_through := v_head;
  else
    if v_part.page_head_seq is distinct from p_through or v_part.page_sealed_tick is null then
      return jsonb_build_object('status','refused','reason','page_watermark_invalid');
    end if;
    v_head := v_part.page_head_seq;
    v_sealed := v_part.page_sealed_tick;
    v_through := p_through;
  end if;
  if p_after > v_through then return jsonb_build_object('status','refused','reason','bad_recovery_page'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'serverSeq',seq,'effectiveTick',effective_tick,'type',event_kind,
      'participantToken',participant_token,'payload',payload) order by seq),'[]'::jsonb)
    into v_page from (
      select seq,effective_tick,event_kind,participant_token,payload
        from public.recovery_wave_events
       where wave_id=p_wave_id and seq>p_after and seq<=v_through
       order by seq limit 256
    ) page;
  return jsonb_build_object('status','ok','headSeq',v_head,'sealedThroughTick',v_sealed,
    'through',case when p_through is null then null else v_through end,'events',v_page);
end;
$$;

revoke all on function public.recovery_wave_inputs(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.recovery_wave_inputs(uuid, uuid, jsonb) to service_role;
revoke all on function public.recovery_wave_events_page(uuid, uuid, bigint, bigint) from public, anon, authenticated, service_role;
grant execute on function public.recovery_wave_events_page(uuid, uuid, bigint, bigint) to service_role;

comment on function public.recovery_wave_inputs(uuid, uuid, jsonb) is
  'Atomically validates and appends authenticated protocol-2 Captain commands; actor identity and Captain stats are server-derived, counters and UIDs are idempotent, and the journal assigns global commit order.';
comment on function public.recovery_wave_events_page(uuid, uuid, bigint, bigint) is
  'Returns an authenticated participant a bounded journal page under a fixed per-participant head and sealed-tick watermark. A new watermark opens only after the previous head is fetched.';

-- Accepts a complete health vector only for a sealed, replayable journal prefix.
create or replace function public.recovery_wave_report_health_locked(
  p_player_id uuid,
  p_wave_id uuid,
  p_island_epoch uuid,
  p_checkpoint_uid text,
  p_through_tick integer,
  p_input_head_seq bigint,
  p_last_repair_seq bigint,
  p_basis_repair_seq jsonb,
  p_hp_units jsonb,
  p_server_now timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_island_state public.island_recovery_state;
  v_wave public.recovery_wave_states;
  v_history public.recovery_health_checkpoints;
  v_now timestamptz;
  v_instance text;
  v_structure jsonb;
  v_event public.recovery_wave_events;
  v_expected_basis bigint;
  v_expected_repair_counter bigint;
  v_previous_hp integer;
  v_reported_hp integer;
  v_previous_basis bigint;
  v_seen_instances integer := 0;
  v_snapshot_instances integer := 0;
  v_hp_key_count integer := 0;
  v_basis_key_count integer := 0;
  v_repeat boolean := false;
begin
  if p_player_id is null or p_wave_id is null or p_island_epoch is null
     or p_checkpoint_uid is null or p_checkpoint_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_through_tick is null or p_through_tick < 0
     or p_input_head_seq is null or p_input_head_seq < 0
     or p_last_repair_seq is null or p_last_repair_seq < 0
     or p_server_now is null
     or jsonb_typeof(p_basis_repair_seq) is distinct from 'object'
     or jsonb_typeof(p_hp_units) is distinct from 'object' then
    raise exception 'bad_recovery_checkpoint';
  end if;
  select island_owner into v_owner from public.recovery_wave_states where wave_id = p_wave_id;
  if not found then return jsonb_build_object('status','refused','reason','no_such_wave'); end if;
  perform 1 from public.islands where player_id = v_owner order by player_id for update;
  select * into v_island_state from public.island_recovery_state
   where island_owner=v_owner for update;
  select * into v_wave from public.recovery_wave_states where wave_id = p_wave_id for update;
  if not exists (select 1 from public.recovery_wave_participants
                  where wave_id = p_wave_id and player_id = p_player_id) then
    return jsonb_build_object('status','refused','reason','not_in_wave');
  end if;
  select * into v_history from public.recovery_health_checkpoints
   where wave_id = p_wave_id and actor_id = p_player_id and checkpoint_uid = p_checkpoint_uid;
  if found then
    if v_history.reset_epoch is distinct from p_island_epoch
       or v_history.through_tick is distinct from p_through_tick
       or v_history.input_head_seq is distinct from p_input_head_seq
       or v_history.last_repair_seq is distinct from p_last_repair_seq
       or v_history.basis_repair_seq is distinct from p_basis_repair_seq
       or v_history.hp_vector is distinct from p_hp_units then
      return jsonb_build_object('status','refused','reason','checkpoint_divergence');
    end if;
    return jsonb_build_object('status','accepted','accepted',true,'repeated',true,
      'throughTick',v_history.through_tick,'inputHeadSeq',v_history.input_head_seq,
      'lastRepairSeq',v_history.last_repair_seq,'hpUnits',v_history.hp_vector);
  end if;
  if v_wave.closed_at is not null then
    return jsonb_build_object('status','refused','reason','wave_over');
  end if;
  if v_island_state.island_owner is null
     or v_island_state.reset_epoch is distinct from p_island_epoch
     or v_island_state.current_wave_id is distinct from p_wave_id then
    return jsonb_build_object('status','refused','reason','epoch_mismatch');
  end if;
  if v_wave.reset_epoch is distinct from p_island_epoch then
    return jsonb_build_object('status','refused','reason','epoch_mismatch');
  end if;
  if p_through_tick > v_wave.sealed_through_tick
     or p_input_head_seq > v_wave.journal_head then
    return jsonb_build_object('status','refused','reason','health_sync_required');
  end if;
  if exists (
    select 1 from public.recovery_wave_events
     where wave_id = p_wave_id
       and seq > p_input_head_seq
       and effective_tick <= p_through_tick
  ) then
    return jsonb_build_object('status','refused','reason','health_sync_required');
  end if;
  if p_through_tick < coalesce(v_wave.checkpoint_through_tick, -1)
     or (p_through_tick = v_wave.checkpoint_through_tick
         and p_input_head_seq < v_wave.checkpoint_input_head_seq) then
    return jsonb_build_object('status','refused','reason','checkpoint_stale');
  end if;
  if v_wave.checkpoint_through_tick = p_through_tick
     and v_wave.checkpoint_input_head_seq = p_input_head_seq then
    if v_wave.checkpoint_last_repair_seq is distinct from p_last_repair_seq
       or v_wave.checkpoint_basis_repair_seq is distinct from p_basis_repair_seq
       or v_wave.checkpoint_hp is distinct from p_hp_units then
      return jsonb_build_object('status','refused','reason','checkpoint_divergence');
    end if;
    return jsonb_build_object('status','accepted','accepted',true,'repeated',true,
      'throughTick',p_through_tick,'inputHeadSeq',p_input_head_seq,
      'lastRepairSeq',p_last_repair_seq,'hpUnits',p_hp_units);
  end if;

  select count(*) into v_snapshot_instances
    from jsonb_array_elements(v_wave.initial_snapshot -> 'structures') as item(value);
  select count(*) into v_hp_key_count from jsonb_object_keys(p_hp_units);
  select count(*) into v_basis_key_count from jsonb_object_keys(p_basis_repair_seq);
  if v_hp_key_count <> v_snapshot_instances or v_basis_key_count <> v_snapshot_instances then
    return jsonb_build_object('status','refused','reason','checkpoint_divergence');
  end if;
  for v_structure in
    select value from jsonb_array_elements(v_wave.initial_snapshot -> 'structures') as item(value)
  loop
    v_instance := v_structure ->> 'instanceId';
    if v_instance is null or not p_hp_units ? v_instance or not p_basis_repair_seq ? v_instance
       or jsonb_typeof(p_hp_units -> v_instance) is distinct from 'number'
       or jsonb_typeof(p_basis_repair_seq -> v_instance) is distinct from 'number'
       or (p_hp_units ->> v_instance)::numeric not between 0 and 1000000
       or (p_hp_units ->> v_instance)::numeric <> trunc((p_hp_units ->> v_instance)::numeric)
       or (p_basis_repair_seq ->> v_instance)::numeric < 0
       or (p_basis_repair_seq ->> v_instance)::numeric <> trunc((p_basis_repair_seq ->> v_instance)::numeric) then
      return jsonb_build_object('status','refused','reason','checkpoint_divergence');
    end if;
    v_expected_basis := coalesce(nullif(v_structure ->> 'repairSeq','')::bigint,0);
    v_previous_hp := coalesce((v_wave.checkpoint_hp ->> v_instance)::integer,
                              nullif(v_structure ->> 'hpUnits','')::integer);
    v_previous_basis := coalesce((v_wave.checkpoint_basis_repair_seq ->> v_instance)::bigint,
                                 v_expected_basis);
    for v_event in select * from public.recovery_wave_events
      where wave_id=p_wave_id and seq<=p_input_head_seq and effective_tick<=p_through_tick
        and event_kind='structure_repaired' and payload ->> 'instanceId'=v_instance order by seq
    loop
      v_expected_basis := greatest(v_expected_basis, (v_event.payload ->> 'repairSeq')::bigint);
    end loop;
    if (p_basis_repair_seq ->> v_instance)::bigint <> v_expected_basis then
      return jsonb_build_object('status','refused','reason','health_sync_required');
    end if;
    v_reported_hp := (p_hp_units ->> v_instance)::integer;
    if v_reported_hp > v_previous_hp and v_expected_basis <= v_previous_basis then
      return jsonb_build_object('status','refused','reason','checkpoint_divergence');
    end if;
    v_seen_instances := v_seen_instances + 1;
  end loop;
  if v_seen_instances <> v_hp_key_count then
    return jsonb_build_object('status','refused','reason','checkpoint_divergence');
  end if;
  select count(*) into v_expected_repair_counter from public.recovery_wave_events
   where wave_id=p_wave_id and seq<=p_input_head_seq and effective_tick<=p_through_tick
     and event_kind='structure_repaired';
  if p_last_repair_seq <> v_expected_repair_counter then
    return jsonb_build_object('status','refused','reason','health_sync_required');
  end if;

  v_now := p_server_now;
  insert into public.recovery_health_checkpoints
    (wave_id,actor_id,checkpoint_uid,reset_epoch,through_tick,input_head_seq,
     last_repair_seq,basis_repair_seq,hp_vector,accepted_at)
  values (p_wave_id,p_player_id,p_checkpoint_uid,p_island_epoch,p_through_tick,
          p_input_head_seq,p_last_repair_seq,p_basis_repair_seq,p_hp_units,v_now);
  update public.recovery_wave_states
     set checkpoint_actor=p_player_id,checkpoint_uid=p_checkpoint_uid,
         checkpoint_through_tick=p_through_tick,checkpoint_input_head_seq=p_input_head_seq,
         checkpoint_last_repair_seq=p_last_repair_seq,
         checkpoint_basis_repair_seq=p_basis_repair_seq,checkpoint_hp=p_hp_units,
         checkpoint_accepted_at=v_now
   where wave_id=p_wave_id;
  return jsonb_build_object('status','accepted','accepted',true,'repeated',false,
    'throughTick',p_through_tick,'inputHeadSeq',p_input_head_seq,
    'lastRepairSeq',p_last_repair_seq,'hpUnits',p_hp_units);
end;
$$;


create or replace function public.recovery_wave_report_health(
  p_player_id uuid, p_wave_id uuid, p_island_epoch uuid, p_checkpoint_uid text,
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
  v_server_now timestamptz;
begin
  select island_owner into v_owner from public.recovery_wave_states where wave_id=p_wave_id;
  if not found then return jsonb_build_object('status','refused','reason','no_such_wave'); end if;
  perform 1 from public.islands where player_id in (v_owner,p_player_id) order by player_id for update;
  v_server_now := clock_timestamp();
  return public.recovery_wave_report_health_locked(p_player_id,p_wave_id,p_island_epoch,
    p_checkpoint_uid,p_through_tick,p_input_head_seq,p_last_repair_seq,
    p_basis_repair_seq,p_hp_units,v_server_now);
end;
$$;

revoke all on function public.recovery_wave_report_health_locked(uuid,uuid,uuid,text,integer,bigint,bigint,jsonb,jsonb,timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.recovery_wave_report_health_locked(uuid,uuid,uuid,text,integer,bigint,bigint,jsonb,jsonb,timestamptz) to service_role;
comment on function public.recovery_wave_report_health_locked(uuid,uuid,uuid,text,integer,bigint,bigint,jsonb,jsonb,timestamptz) is
  'Internal checkpoint validator for callers holding canonical island locks and a single post-lock database timestamp.';

revoke all on function public.recovery_wave_report_health(uuid,uuid,uuid,text,integer,bigint,bigint,jsonb,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.recovery_wave_report_health(uuid,uuid,uuid,text,integer,bigint,bigint,jsonb,jsonb) to service_role;
comment on function public.recovery_wave_report_health(uuid,uuid,uuid,text,integer,bigint,bigint,jsonb,jsonb) is
  'Accepts an immutable complete HP checkpoint only for a sealed journal prefix, requiring the wave reset epoch and each instance repair fence to match; retries are read-only and same-prefix divergence is refused.';

-- Starts a protocol-2 wave only for an admitted island policy, preserving frozen v1 policy after flag-off.
create or replace function public.recovery_wave_start(
  p_player_id uuid, p_action_uid text, p_place text, p_island_owner uuid,
  p_seed integer, p_countdown_seconds integer, p_minimum_seconds integer,
  p_maximum_seconds integer, p_highest_wave integer, p_weather_kind text,
  p_weather_ships numeric, p_weather_fog numeric,
  p_rules text[], p_snapshot_template jsonb, p_admit_v1 boolean, p_protocol smallint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_start jsonb;
  v_rules_reply jsonb;
  v_rules text[];
  v_owner_state public.island_recovery_state;
  v_run public.wave_runs;
  v_wave public.recovery_wave_states;
  v_player_token uuid;
  v_player_counter bigint;
  v_server_now timestamptz;
  v_captain jsonb;
  v_snapshot jsonb;
  v_create jsonb;
  v_wave_event jsonb;
  v_wave_boss jsonb;
  v_refresh jsonb;
  v_positions jsonb;
  v_defenses jsonb := '[]'::jsonb;
  v_structures jsonb := '[]'::jsonb;
  v_config jsonb;
  v_config_spot jsonb;
  v_defense jsonb;
  v_building public.islet_buildings;
  v_health public.island_structure_health;
  v_hp integer;
  v_max_hp numeric;
  v_admit boolean := false;
  v_config_count integer;
  v_defense_spot text;
  v_action_repeat boolean := false;
  v_next_wave integer;
begin
  if p_player_id is null or p_rules is null
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_seed is null or p_seed < 0 or p_countdown_seconds is null or p_countdown_seconds < 0
     or p_minimum_seconds is null or p_maximum_seconds is null
     or p_highest_wave is null or p_highest_wave < 1
     or p_weather_kind is null or p_weather_ships is null or p_weather_fog is null
     or p_admit_v1 is null or p_protocol is null or p_protocol not in (1,2) then
    raise exception 'bad_recovery_start';
  end if;
  if p_place <> 'island' or p_island_owner is null then
    v_start := public.wave_start(p_player_id,p_action_uid,p_place,p_island_owner,p_seed,
      p_countdown_seconds,p_minimum_seconds,p_maximum_seconds,p_highest_wave,
      p_weather_kind,p_weather_ships,p_weather_fog);
    if v_start ->> 'status' = 'started' then
      v_rules_reply := public.wave_rules_keep((v_start ->> 'waveId')::uuid,p_rules);
      v_start := v_start || jsonb_build_object('rules',v_rules_reply -> 'rules');
    end if;
    if v_start ->> 'status' = 'started' then
      return v_start || jsonb_build_object('recoveryVersion',0,'waveProtocol',1);
    end if;
    return v_start;
  end if;

  -- The owner row is the canonical island lock and precedes recovery state/wave/health.
  perform 1 from public.islands where player_id=p_island_owner for update;
  if not found then return jsonb_build_object('status','refused','reason','no_such_island'); end if;
  if p_player_id <> p_island_owner and not exists (
    select 1 from public.island_members where island_owner=p_island_owner
      and player_id=p_player_id and left_at is null
  ) then return jsonb_build_object('status','refused','reason','not_member'); end if;
  select * into v_owner_state from public.island_recovery_state
   where island_owner=p_island_owner for update;
  if not found then raise exception 'recovery_state_incomplete'; end if;
  v_server_now := clock_timestamp();
  select * into v_run from public.wave_runs
   where started_by=p_player_id and action_uid=p_action_uid;
  v_action_repeat := found;
  if v_action_repeat then
    select * into v_wave from public.recovery_wave_states where wave_id=v_run.id;
    if found and p_protocol=1 then
      return jsonb_build_object('status','refused','reason','client_update_required');
    end if;
    if found then
      select participant_token,last_actor_counter into v_player_token,v_player_counter
        from public.recovery_wave_participants where wave_id=v_run.id and player_id=p_player_id;
      return jsonb_build_object('status','started','waveId',v_run.id,'wave',v_run.wave,
        'seed',v_run.seed,'startsAt',v_run.starts_at,'weatherKind',v_run.weather_kind,
        'ships',v_run.weather_ships,'fog',v_run.weather_fog,'place',v_run.place,'repeat',true,
        'rules',v_wave.initial_snapshot -> 'rules','recoveryVersion',1,'waveProtocol',2,
        'initialSnapshot',v_wave.initial_snapshot,'participantToken',v_player_token,
        'lastActorCounter',coalesce(v_player_counter,0));
    end if;
    v_start := jsonb_build_object('status','started','waveId',v_run.id,'wave',v_run.wave,
      'seed',v_run.seed,'startsAt',v_run.starts_at,'weatherKind',v_run.weather_kind,
      'ships',v_run.weather_ships,'fog',v_run.weather_fog,'place',v_run.place,'repeat',true);
  elsif p_protocol=1 and v_owner_state.recovery_version=1 then
    return jsonb_build_object('status','refused','reason','client_update_required');
  end if;
  v_admit := (v_owner_state.recovery_version = 1)
             or (p_protocol=2 and p_admit_v1 and 'structure_recovery' = any(p_rules));
  v_rules := p_rules;
  if v_admit and not ('structure_recovery' = any(v_rules)) then
    v_rules := array_append(v_rules,'structure_recovery');
  end if;

  if not v_action_repeat then
    if v_admit then
      if p_snapshot_template is null
         or jsonb_typeof(p_snapshot_template) is distinct from 'object'
         or jsonb_typeof(p_snapshot_template -> 'createWave') is distinct from 'object'
         or jsonb_typeof(p_snapshot_template -> 'priceSchedule') is distinct from 'object'
         or jsonb_typeof(p_snapshot_template -> 'eventByWave') is distinct from 'object'
         or jsonb_typeof(p_snapshot_template -> 'bossByWave') is distinct from 'object'
         or (p_snapshot_template ->> 'configVersion')::integer is distinct from 1
         or jsonb_typeof(p_snapshot_template -> 'expectedRevision') is distinct from 'number'
         or (p_snapshot_template ->> 'expectedRevision') !~ '^[0-9]+$' then
        raise exception 'bad_recovery_snapshot';
      end if;
      if (p_snapshot_template ->> 'expectedRevision')::bigint <> v_owner_state.revision then
        return jsonb_build_object('status','refused','reason','island_changed');
      end if;
    end if;
    perform public.structure_recovery_settle_locked(p_island_owner,v_server_now);
  end if;

  if not v_action_repeat then
    if v_admit then
      if not exists(select 1 from public.profiles where id=p_player_id) then
        return jsonb_build_object('status','refused','reason','player_not_set_up');
      end if;
      update public.wave_runs set finished_at=v_server_now,survived=false,ships_sunk=0,loot=0,expired=true
       where island_owner=p_island_owner and finished_at is null
         and starts_at+make_interval(secs=>maximum_seconds)<v_server_now;
      if exists(select 1 from public.wave_runs where island_owner=p_island_owner and finished_at is null) then
        return jsonb_build_object('status','refused','reason','wave_running');
      end if;
      select least(greatest(coalesce(next_wave,wave_best+1),1),p_highest_wave)
        into v_next_wave from public.islands where player_id=p_island_owner;
      insert into public.wave_runs(started_by,action_uid,place,island_owner,wave,seed,starts_at,
        minimum_seconds,maximum_seconds,weather_kind,weather_ships,weather_fog)
      values(p_player_id,p_action_uid,'island',p_island_owner,v_next_wave,p_seed,
        greatest(date_trunc('second',now())+make_interval(secs=>p_countdown_seconds),v_server_now),
        p_minimum_seconds,p_maximum_seconds,p_weather_kind,p_weather_ships,p_weather_fog)
      returning * into v_run;
      insert into public.wave_participants(wave_id,player_id) values(v_run.id,p_player_id);
      v_start := jsonb_build_object('status','started','waveId',v_run.id,'wave',v_run.wave,
        'seed',v_run.seed,'startsAt',v_run.starts_at,'weatherKind',v_run.weather_kind,
        'ships',v_run.weather_ships,'fog',v_run.weather_fog,'place',v_run.place,'repeat',false);
    else
      v_start := public.wave_start(p_player_id,p_action_uid,p_place,p_island_owner,p_seed,
        p_countdown_seconds,p_minimum_seconds,p_maximum_seconds,p_highest_wave,
        p_weather_kind,p_weather_ships,p_weather_fog);
      if v_start ->> 'status' <> 'started' then return v_start; end if;
      select * into v_run from public.wave_runs where id=(v_start ->> 'waveId')::uuid;
      if not coalesce((v_start ->> 'repeat')::boolean,false) and v_run.starts_at < v_server_now then
        update public.wave_runs set starts_at=v_server_now where id=v_run.id returning * into v_run;
        v_start := jsonb_set(v_start,'{startsAt}',to_jsonb(v_run.starts_at),true);
      end if;
    end if;
  end if;
  v_rules_reply := public.wave_rules_keep(v_run.id,v_rules);
  v_rules := array(select jsonb_array_elements_text(v_rules_reply -> 'rules'));

  -- An action retry can only return the immutable policy/snapshot it first created.
  select * into v_wave from public.recovery_wave_states where wave_id=v_run.id;
  if found then
    if p_protocol=1 then return jsonb_build_object('status','refused','reason','client_update_required'); end if;
    select participant_token,last_actor_counter into v_player_token,v_player_counter
      from public.recovery_wave_participants where wave_id=v_run.id and player_id=p_player_id;
    return v_start || jsonb_build_object('rules',to_jsonb(v_rules),'recoveryVersion',1,
      'waveProtocol',2,'initialSnapshot',v_wave.initial_snapshot,
      'participantToken',v_player_token,'lastActorCounter',coalesce(v_player_counter,0));
  end if;
  if coalesce((v_start ->> 'repeat')::boolean,false) then
    return v_start || jsonb_build_object('rules',to_jsonb(v_rules),'recoveryVersion',0,'waveProtocol',1);
  end if;
  if not v_admit then
    return v_start || jsonb_build_object('rules',to_jsonb(v_rules),'recoveryVersion',0,'waveProtocol',1);
  end if;

  -- Keep the owner's current Captain metadata as server-authored simulation input.
  select jsonb_build_object('level',captain_level,
    'skills',array(select skill from unnest(captain_skills ||
      case when captain_role is null then '{}'::text[] else array[captain_role] end) as skill
      where skill <> all(array['quick_fix','long_reach','sturdy_planks','master_shipwright',
        'swift_hammer','wide_arc','grand_engineer']::text[])),
    'weapon',weapon_equipped)
    into v_captain from public.islands where player_id=p_player_id;
  if v_captain is null then return jsonb_build_object('status','refused','reason','player_not_set_up'); end if;
  select * into v_owner_state from public.island_recovery_state
   where island_owner=p_island_owner;
  v_config := p_snapshot_template -> 'structureConfigBySpot';
  if jsonb_typeof(v_config) is distinct from 'object'
     or p_snapshot_template ->> 'legacyWallRecoverSeconds' is null
     or (p_snapshot_template ->> 'legacyWallRecoverSeconds')::integer < 1
     or jsonb_typeof(p_snapshot_template -> 'createWave' -> 'defenses') is distinct from 'array' then
    raise exception 'bad_recovery_snapshot_config';
  end if;
  v_refresh := public.structure_recovery_refresh_locked(p_island_owner,v_server_now,p_snapshot_template);
  v_positions := v_refresh -> 'positions';
  v_structures := v_refresh -> 'structures';
  v_snapshot := jsonb_set(p_snapshot_template,'{defaultPositions}',v_positions,true);

  -- A legacy island enters v1 once. Walls preserve the old D039 timer; towers start whole.
  if v_owner_state.recovery_version = 0 then
    for v_building in select * from public.islet_buildings
      where player_id=p_island_owner and building_type in ('wall','cannon','mortar','harpoon','culverin','swivel')
      order by plot for update
    loop
      v_config_spot := v_config -> v_building.plot;
      if v_config_spot is null or v_config_spot ->> 'kind' <> v_building.building_type
         or (v_config_spot ->> 'level')::integer <> v_building.level then
        raise exception 'recovery_snapshot_structure_mismatch';
      end if;
      v_max_hp := (v_config_spot ->> 'maxHP')::numeric;
      v_hp := case when v_building.building_type='wall' and v_building.wall_health < 100
                     and v_building.wall_damaged_at is not null
                     and v_building.wall_damaged_at + make_interval(secs =>
                       (p_snapshot_template ->> 'legacyWallRecoverSeconds')::integer) > v_server_now
                   then v_building.wall_health * 10000 else 1000000 end;
      insert into public.island_structure_health
        (island_owner,spot,instance_id,building_kind,level,hp_units,max_hp,config_version,
         settled_at,rate_numerator,rate_denominator,repair_seq,updated_at)
      values (p_island_owner,v_building.plot,v_building.recovery_instance_id,
        v_building.building_type,v_building.level,v_hp,v_max_hp,1,v_server_now,
        (v_config_spot ->> 'rateNumerator')::bigint,
        (v_config_spot ->> 'rateDenominator')::bigint,0,v_server_now)
      on conflict (island_owner,spot) do nothing;
    end loop;
  end if;

  -- Every built eligible structure must agree with the server-created static template and DB identity.
  for v_building in select * from public.islet_buildings
    where player_id=p_island_owner and building_type in ('wall','cannon','mortar','harpoon','culverin','swivel')
    order by plot for update
  loop
    v_config_spot := v_config -> v_building.plot;
    if v_config_spot is null or v_config_spot ->> 'kind' <> v_building.building_type
       or (v_config_spot ->> 'level')::integer <> v_building.level then
      raise exception 'recovery_snapshot_structure_mismatch';
    end if;
    select * into v_health from public.island_structure_health
     where island_owner=p_island_owner and spot=v_building.plot for update;
    if not found or v_health.instance_id <> v_building.recovery_instance_id
       or v_health.building_kind <> v_building.building_type or v_health.level <> v_building.level
       or v_health.max_hp <> (v_config_spot ->> 'maxHP')::numeric then
      raise exception 'recovery_state_incomplete';
    end if;
  end loop;
  select count(*) into v_config_count from jsonb_object_keys(v_config);
  if v_config_count <> (select count(*) from public.islet_buildings
      where player_id=p_island_owner and building_type in ('wall','cannon','mortar','harpoon','culverin','swivel')) then
    raise exception 'recovery_snapshot_structure_mismatch';
  end if;
  for v_defense in select value from jsonb_array_elements(p_snapshot_template -> 'createWave' -> 'defenses') as item(value)
  loop
    v_defense_spot := v_defense ->> 'id';
    if v_defense_spot is null then raise exception 'bad_recovery_snapshot_defense'; end if;
    select * into v_building from public.islet_buildings
     where player_id=p_island_owner and plot=v_defense_spot;
    if not found or v_building.building_type <> v_defense ->> 'kind'
       or v_building.level <> (v_defense ->> 'level')::integer then
      raise exception 'recovery_snapshot_structure_mismatch';
    end if;
    if v_building.building_type in ('wall','cannon','mortar','harpoon','culverin','swivel') then
      select * into v_health from public.island_structure_health
       where island_owner=p_island_owner and spot=v_defense_spot;
      v_defenses := v_defenses || jsonb_build_array(v_defense || jsonb_build_object(
        'x',(v_positions -> v_defense_spot ->> 'x')::numeric,
        'z',(v_positions -> v_defense_spot ->> 'z')::numeric,
        'instanceId',v_health.instance_id,'hpUnits',v_health.hp_units,'maxHP',v_health.max_hp,
        'repairSeq',v_health.repair_seq));
    else
      v_defenses := v_defenses || jsonb_build_array(v_defense || jsonb_build_object(
        'x',(v_positions -> v_defense_spot ->> 'x')::numeric,
        'z',(v_positions -> v_defense_spot ->> 'z')::numeric));
    end if;
  end loop;
  v_player_token := gen_random_uuid();
  v_snapshot := v_snapshot || jsonb_build_object(
    'waveId',v_run.id,'islandEpoch',v_owner_state.reset_epoch,'recoveryVersion',1,
    'waveProtocol',2,'wave',v_run.wave,'seed',v_run.seed,'startsAt',v_run.starts_at,
    'expiresAt',v_run.starts_at + make_interval(secs => v_run.maximum_seconds),
    'maximumSeconds',v_run.maximum_seconds,'rules',to_jsonb(v_rules),
    'structures',v_structures,
    'participants',jsonb_build_array(jsonb_build_object('participantToken',v_player_token,'captain',v_captain)));
  v_create := (p_snapshot_template -> 'createWave') || jsonb_build_object(
    'wave',v_run.wave,'seed',v_run.seed,'startsAt',v_run.starts_at,
    'weatherKind',v_run.weather_kind,'ships',v_run.weather_ships,'fog',v_run.weather_fog,
    'rules',to_jsonb(v_rules),'defenses',v_defenses);
  if not (p_snapshot_template -> 'eventByWave') ? v_run.wave::text
     or not (p_snapshot_template -> 'bossByWave') ? v_run.wave::text then
    raise exception 'recovery_snapshot_wave_config_missing';
  end if;
  v_wave_event := p_snapshot_template -> 'eventByWave' -> v_run.wave::text;
  v_wave_boss := p_snapshot_template -> 'bossByWave' -> v_run.wave::text;
  if (jsonb_typeof(v_wave_event) is distinct from 'string'
      and jsonb_typeof(v_wave_event) is distinct from 'null')
     or jsonb_typeof(v_wave_boss) is distinct from 'boolean' then
    raise exception 'recovery_snapshot_wave_config_invalid';
  end if;
  v_create := v_create || jsonb_build_object('event',v_wave_event,'boss',v_wave_boss);
  v_snapshot := jsonb_set(v_snapshot,'{createWave}',v_create,true);
  insert into public.recovery_wave_states
    (wave_id,island_owner,reset_epoch,recovery_version,wave_protocol,initial_snapshot)
  values (v_run.id,p_island_owner,v_owner_state.reset_epoch,1,2,v_snapshot);
  insert into public.recovery_wave_participants(wave_id,player_id,participant_token)
  values (v_run.id,p_player_id,v_player_token);
  update public.island_recovery_state set recovery_version=1,wave_protocol=2,
    current_wave_id=v_run.id,reserved_at=v_server_now,starts_at=v_run.starts_at,
    expires_at=v_run.starts_at + make_interval(secs => v_run.maximum_seconds),
    revision=revision+1,updated_at=v_server_now where island_owner=p_island_owner;
  return v_start || jsonb_build_object('rules',to_jsonb(v_rules),'recoveryVersion',1,
    'waveProtocol',2,'initialSnapshot',v_snapshot,'participantToken',v_player_token,
    'lastActorCounter',0);
end;
$$;

revoke all on function public.recovery_wave_start(uuid,text,text,uuid,integer,integer,integer,integer,integer,text,numeric,numeric,text[],jsonb,boolean,smallint) from public, anon, authenticated, service_role;
grant execute on function public.recovery_wave_start(uuid,text,text,uuid,integer,integer,integer,integer,integer,text,numeric,numeric,text[],jsonb,boolean,smallint) to service_role;
comment on function public.recovery_wave_start(uuid,text,text,uuid,integer,integer,integer,integer,integer,text,numeric,numeric,text[],jsonb,boolean,smallint) is
  'Atomically settles the owner island, starts a legacy-compatible wave, and on admitted recovery-v1 islands freezes a full actual-health simulation snapshot, participant token and immutable recovery policy.';

-- Joins a legacy wave unchanged or appends one token-only participant event to a v1 journal.
create or replace function public.recovery_wave_join(
  p_player_id uuid, p_wave_id uuid, p_protocol smallint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_wave public.recovery_wave_states;
  v_run public.wave_runs;
  v_part public.recovery_wave_participants;
  v_reply jsonb;
  v_captain jsonb;
  v_now timestamptz;
  v_seq bigint;
begin
  if p_player_id is null or p_wave_id is null or p_protocol is null or p_protocol not in (1,2) then
    raise exception 'bad_recovery_join';
  end if;
  select island_owner into v_owner from public.wave_runs where id=p_wave_id;
  if not found then return jsonb_build_object('status','refused','reason','no_such_wave'); end if;
  if v_owner is null then
    v_reply := public.wave_join(p_player_id,p_wave_id);
    if v_reply ->> 'status'='joined' then
      return v_reply || jsonb_build_object('recoveryVersion',0,'waveProtocol',1);
    end if;
    return v_reply;
  end if;

  -- All participating island rows precede recovery state, wave and participant rows.
  perform 1 from public.islands where player_id in (v_owner,p_player_id) order by player_id for update;
  if not exists (select 1 from public.islands where player_id=v_owner) then
    return jsonb_build_object('status','refused','reason','no_such_wave');
  end if;
  if p_player_id <> v_owner and not exists (
    select 1 from public.island_members where island_owner=v_owner
      and player_id=p_player_id and left_at is null
  ) then return jsonb_build_object('status','refused','reason','not_member'); end if;
  v_now := clock_timestamp();
  perform public.structure_recovery_settle_locked(v_owner,v_now);
  select * into v_wave from public.recovery_wave_states where wave_id=p_wave_id for update;
  if not found then
    v_reply := public.wave_join(p_player_id,p_wave_id);
    if v_reply ->> 'status'='joined' then
      return v_reply || jsonb_build_object('recoveryVersion',0,'waveProtocol',1);
    end if;
    return v_reply;
  end if;
  if p_protocol < v_wave.wave_protocol then
    return jsonb_build_object('status','refused','reason','client_update_required');
  end if;
  select * into v_run from public.wave_runs where id=p_wave_id for update;
  if not found then return jsonb_build_object('status','refused','reason','no_such_wave'); end if;
  select jsonb_build_object('level',captain_level,
    'skills',array(select skill from unnest(captain_skills ||
      case when captain_role is null then '{}'::text[] else array[captain_role] end) as skill
      where skill <> all(array['quick_fix','long_reach','sturdy_planks','master_shipwright',
        'swift_hammer','wide_arc','grand_engineer']::text[])),
    'weapon',weapon_equipped) into v_captain from public.islands where player_id=p_player_id;
  if v_captain is null then return jsonb_build_object('status','refused','reason','player_not_set_up'); end if;
  select * into v_part from public.recovery_wave_participants
   where wave_id=p_wave_id and player_id=p_player_id;
  if found then
    return jsonb_build_object('status','joined','waveId',v_run.id,'wave',v_run.wave,
      'seed',v_run.seed,'startsAt',v_run.starts_at,'weatherKind',v_run.weather_kind,
      'ships',v_run.weather_ships,'fog',v_run.weather_fog,'place',v_run.place,'repeat',true,
      'recoveryVersion',1,'waveProtocol',2,
      'initialSnapshot',v_wave.initial_snapshot,'participantToken',v_part.participant_token,
      'lastActorCounter',v_part.last_actor_counter);
  end if;
  if v_run.finished_at is not null
     or v_now > v_run.starts_at + make_interval(secs => v_run.maximum_seconds) then
    return jsonb_build_object('status','refused','reason','wave_over');
  end if;
  if exists (select 1 from public.wave_participants where wave_id=p_wave_id and player_id=p_player_id) then
    raise exception 'recovery_state_incomplete';
  end if;
  insert into public.wave_participants(wave_id,player_id) values(p_wave_id,p_player_id);
  insert into public.recovery_wave_participants(wave_id,player_id)
  values (p_wave_id,p_player_id) returning * into v_part;
  v_seq := v_wave.journal_head + 1;
  insert into public.recovery_wave_events
    (wave_id,seq,actor_id,participant_token,input_uid,event_kind,effective_tick,payload)
  values (p_wave_id,v_seq,null,v_part.participant_token,null,'participant_joined',0,
    jsonb_build_object('participantToken',v_part.participant_token,'captain',v_captain));
  update public.recovery_wave_states set journal_head=v_seq where wave_id=p_wave_id;
  return jsonb_build_object('status','joined','waveId',v_run.id,'wave',v_run.wave,
    'seed',v_run.seed,'startsAt',v_run.starts_at,'weatherKind',v_run.weather_kind,
    'ships',v_run.weather_ships,'fog',v_run.weather_fog,'place',v_run.place,'repeat',false,
    'recoveryVersion',1,'waveProtocol',2,
    'initialSnapshot',v_wave.initial_snapshot,'participantToken',v_part.participant_token,
    'lastActorCounter',0);
end;
$$;

revoke all on function public.recovery_wave_join(uuid,uuid,smallint) from public, anon, authenticated, service_role;
grant execute on function public.recovery_wave_join(uuid,uuid,smallint) to service_role;
comment on function public.recovery_wave_join(uuid,uuid,smallint) is
  'Joins a frozen protocol-2 wave under canonical island/state locks and appends participant_joined with a private-profile-free token and server Captain stats; protocol-1 legacy waves retain the old join contract.';

-- Returns the current legacy or recovery wave; v1 callers receive only their own private token mapping.
create or replace function public.recovery_wave_current(
  p_player_id uuid, p_place text, p_island_owner uuid, p_protocol smallint
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_reply jsonb;
  v_wave_id uuid;
  v_wave public.recovery_wave_states;
  v_part public.recovery_wave_participants;
begin
  if p_player_id is null or p_place is null or p_place not in ('island','pirate_point')
     or (p_place='island') <> (p_island_owner is not null)
     or p_protocol is null or p_protocol not in (1,2) then
    raise exception 'bad_recovery_current';
  end if;
  v_reply := public.wave_current(p_place,p_island_owner);
  if v_reply is null then return jsonb_build_object('status','empty'); end if;
  v_wave_id := (v_reply ->> 'waveId')::uuid;
  select * into v_wave from public.recovery_wave_states where wave_id=v_wave_id;
  if not found then return v_reply || jsonb_build_object('recoveryVersion',0,'waveProtocol',1); end if;
  if p_protocol < v_wave.wave_protocol then
    return jsonb_build_object('status','refused','reason','client_update_required');
  end if;
  if not exists (select 1 from public.recovery_wave_participants
                  where wave_id=v_wave_id and player_id=p_player_id) then
    return jsonb_build_object('status','refused','reason','not_in_wave');
  end if;
  select * into v_part from public.recovery_wave_participants
   where wave_id=v_wave_id and player_id=p_player_id;
  return v_reply || jsonb_build_object('recoveryVersion',1,'waveProtocol',2,
    'initialSnapshot',v_wave.initial_snapshot,
    'participantToken',case when found then v_part.participant_token end,
    'lastActorCounter',case when found then v_part.last_actor_counter end);
end;
$$;

revoke all on function public.recovery_wave_current(uuid,text,uuid,smallint) from public, anon, authenticated, service_role;
grant execute on function public.recovery_wave_current(uuid,text,uuid,smallint) to service_role;
comment on function public.recovery_wave_current(uuid,text,uuid,smallint) is
  'Reads the current wave with its frozen versioned snapshot and the authenticated caller''s token/counter only; no account identifiers enter the returned snapshot or journal.';

-- Refreshes current structure metadata after the caller locks owner island and captures server time.
create or replace function public.structure_recovery_refresh_locked(
  p_island_owner uuid, p_server_now timestamptz, p_snapshot_template jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.island_recovery_state;
  v_building public.islet_buildings;
  v_health public.island_structure_health;
  v_template jsonb;
  v_recovery_config jsonb;
  v_positions jsonb;
  v_configs jsonb;
  v_config jsonb;
  v_position jsonb;
  v_layout record;
  v_wall_research text;
  v_wall_spec text;
  v_max_hp numeric;
  v_rate_num bigint;
  v_rate_den bigint;
  v_carpenters integer;
  v_workshops integer;
  v_workshop_percent integer;
  v_carpenter_factor integer;
  v_spec_num integer;
  v_spec_den integer;
  v_research_num integer;
  v_research_den integer;
  v_hp integer;
  v_same_instance boolean;
  v_base_max_hp numeric;
  v_revision bigint;
  v_items jsonb := '[]'::jsonb;
  v_item jsonb;
begin
  if p_island_owner is null or p_server_now is null then raise exception 'bad_recovery_refresh'; end if;
  select * into v_state from public.island_recovery_state
   where island_owner=p_island_owner for update;
  if not found then raise exception 'recovery_state_incomplete'; end if;
  v_template := p_snapshot_template;
  if v_template is null and v_state.recovery_version=1 then
    select initial_snapshot into v_template from public.recovery_wave_states
     where island_owner=p_island_owner order by created_at desc limit 1;
  end if;
  if v_template is null or jsonb_typeof(v_template -> 'recoveryConfig') is distinct from 'object'
     or jsonb_typeof(v_template -> 'defaultPositions') is distinct from 'object' then
    raise exception 'recovery_config_missing';
  end if;
  v_recovery_config := v_template -> 'recoveryConfig';
  v_positions := v_template -> 'defaultPositions';
  v_configs := v_template -> 'structureConfigBySpot';
  if p_snapshot_template is null then v_configs := '{}'::jsonb; end if;
  if (v_recovery_config ->> 'recoveryVersion')::integer <> 1
     or (v_recovery_config ->> 'waveProtocol')::integer <> 2
     or jsonb_typeof(v_recovery_config -> 'structureMaxHp') is distinct from 'object'
     or jsonb_typeof(v_recovery_config -> 'recoveryRateFactors') is distinct from 'object' then
    raise exception 'bad_recovery_config';
  end if;
  select crew_carpenter into v_carpenters from public.islands where player_id=p_island_owner;
  if not found then raise exception 'no_such_island'; end if;
  v_carpenters := least(v_carpenters, (v_recovery_config -> 'recoveryRateFactors' ->> 'carpenterMaximumWorkers')::integer);
  select choice_2 into v_wall_research from public.island_research
   where island_owner=p_island_owner and branch='wall';

  -- Persisted placements override static defaults; this handles moved workshop radii at mutation time.
  perform 1 from public.island_layout where island_owner=p_island_owner order by plot for update;
  for v_layout in select plot,x_half,z_half from public.island_layout
    where island_owner=p_island_owner order by plot
  loop
    v_positions := jsonb_set(v_positions,array[v_layout.plot],jsonb_build_object(
      'x',v_layout.x_half::numeric/2,'z',v_layout.z_half::numeric/2),true);
  end loop;

  -- Lock all current structures before health rows in deterministic spot order.
  perform 1 from public.islet_buildings where player_id=p_island_owner
    and building_type in ('wall','cannon','mortar','harpoon','culverin','swivel')
    order by plot for update;
  perform 1 from public.island_structure_health where island_owner=p_island_owner order by spot for update;
  for v_building in select * from public.islet_buildings where player_id=p_island_owner
    and building_type in ('wall','cannon','mortar','harpoon','culverin','swivel') order by plot
  loop
    v_config := v_configs -> v_building.plot;
    v_position := v_positions -> v_building.plot;
    if v_position is null or v_position ->> 'x' is null or v_position ->> 'z' is null then
      raise exception 'recovery_position_missing';
    end if;
    if v_config is not null then
      if v_config ->> 'kind' <> v_building.building_type
         or (v_config ->> 'level')::integer <> v_building.level then
        raise exception 'recovery_snapshot_structure_mismatch';
      end if;
    end if;
    v_base_max_hp := ((v_recovery_config -> 'structureMaxHp' -> v_building.building_type)
                       -> (v_building.level-1)) #>> '{}' ;
    v_max_hp := v_base_max_hp;
    v_wall_spec := null;
    if v_building.building_type='wall' then
      v_wall_spec := v_building.spec;
      if v_wall_spec is not null and v_recovery_config -> 'wallSkillMaxHpFactors' ? v_wall_spec then
        v_max_hp := v_max_hp * ((v_recovery_config -> 'wallSkillMaxHpFactors' -> v_wall_spec ->> 0)::numeric
                               / (v_recovery_config -> 'wallSkillMaxHpFactors' -> v_wall_spec ->> 1)::numeric);
      end if;
      if v_wall_research is not null and v_recovery_config -> 'wallResearchMaxHpFactors' ? v_wall_research then
        v_max_hp := v_max_hp * ((v_recovery_config -> 'wallResearchMaxHpFactors' -> v_wall_research ->> 0)::numeric
                               / (v_recovery_config -> 'wallResearchMaxHpFactors' -> v_wall_research ->> 1)::numeric);
      end if;
    end if;
    if exists (select 1 from public.islet_buildings h where h.player_id=p_island_owner
           and h.building_type='house' and h.level>=2 and h.spec='workshop'
           and not (v_positions ? h.plot)) then
      raise exception 'recovery_position_missing';
    end if;
    select count(*) into v_workshops from public.islet_buildings h
       where h.player_id=p_island_owner and h.building_type='house' and h.level>=2 and h.spec='workshop'
         and power((v_position ->> 'x')::numeric - (v_positions -> h.plot ->> 'x')::numeric,2)
           + power((v_position ->> 'z')::numeric - (v_positions -> h.plot ->> 'z')::numeric,2)
             <= power((v_recovery_config -> 'recoveryRateFactors' ->> 'workshopRadius')::numeric,2);
    v_workshop_percent := 100 + least(
        (v_recovery_config -> 'recoveryRateFactors' ->> 'workshopPercentPerHouse')::integer * v_workshops,
        (v_recovery_config -> 'recoveryRateFactors' ->> 'workshopPercentCap')::integer);
    v_carpenter_factor := 1 + v_carpenters *
        (v_recovery_config -> 'recoveryRateFactors' ->> 'carpenterMultiplierPerWorker')::integer;
    v_spec_num := 1; v_spec_den := 1; v_research_num := 1; v_research_den := 1;
    if v_building.building_type='wall' and v_wall_spec is not null
         and v_recovery_config -> 'recoveryRateFactors' -> 'wallSpecRateFactors' ? v_wall_spec then
      v_spec_num := ((v_recovery_config -> 'recoveryRateFactors' -> 'wallSpecRateFactors' -> v_wall_spec ->> 0)::integer);
      v_spec_den := ((v_recovery_config -> 'recoveryRateFactors' -> 'wallSpecRateFactors' -> v_wall_spec ->> 1)::integer);
    end if;
    if v_building.building_type='wall' and v_wall_research is not null
         and v_recovery_config -> 'recoveryRateFactors' -> 'wallResearchRateFactors' ? v_wall_research then
      v_research_num := ((v_recovery_config -> 'recoveryRateFactors' -> 'wallResearchRateFactors' -> v_wall_research ->> 0)::integer);
      v_research_den := ((v_recovery_config -> 'recoveryRateFactors' -> 'wallResearchRateFactors' -> v_wall_research ->> 1)::integer);
    end if;
    v_rate_num := v_carpenter_factor * v_workshop_percent * v_spec_num * v_research_num;
    v_rate_den := 100 * v_spec_den * v_research_den;
    if v_max_hp <= 0 or v_rate_den <= 0 or v_rate_num < 0 then raise exception 'bad_recovery_config'; end if;
    select * into v_health from public.island_structure_health
     where island_owner=p_island_owner and spot=v_building.plot;
    v_same_instance := found and v_health.instance_id=v_building.recovery_instance_id;
    v_hp := case when v_same_instance then v_health.hp_units else
      case when v_state.recovery_version=0 and v_building.building_type='wall'
              and v_building.wall_health < 100 and v_building.wall_damaged_at is not null
              and v_building.wall_damaged_at + make_interval(secs =>
                (v_template ->> 'legacyWallRecoverSeconds')::integer) > p_server_now
        then v_building.wall_health * 10000 else 1000000 end end;
    if v_same_instance then
      update public.island_structure_health set building_kind=v_building.building_type,
        level=v_building.level,max_hp=v_max_hp,hp_units=v_hp,settled_at=p_server_now,
        rate_numerator=v_rate_num,rate_denominator=v_rate_den,updated_at=p_server_now
       where island_owner=p_island_owner and spot=v_building.plot;
    else
      insert into public.island_structure_health
        (island_owner,spot,instance_id,building_kind,level,hp_units,max_hp,config_version,
         settled_at,rate_numerator,rate_denominator,repair_seq,updated_at)
      values (p_island_owner,v_building.plot,v_building.recovery_instance_id,
        v_building.building_type,v_building.level,v_hp,v_max_hp,1,p_server_now,
        v_rate_num,v_rate_den,0,p_server_now)
      on conflict (island_owner,spot) do update set
        instance_id=excluded.instance_id,building_kind=excluded.building_kind,level=excluded.level,
        hp_units=excluded.hp_units,max_hp=excluded.max_hp,config_version=excluded.config_version,
        settled_at=excluded.settled_at,rate_numerator=excluded.rate_numerator,
        rate_denominator=excluded.rate_denominator,repair_seq=0,updated_at=excluded.updated_at;
    end if;
    select * into v_health from public.island_structure_health
     where island_owner=p_island_owner and spot=v_building.plot;
    v_item := coalesce(v_config,'{}'::jsonb) || jsonb_build_object(
      'spot',v_building.plot,'instanceId',v_building.recovery_instance_id,
      'kind',v_building.building_type,'level',v_building.level,
      'hpUnits',v_health.hp_units,'maxHP',v_health.max_hp,'repairSeq',v_health.repair_seq,
      'x',(v_position ->> 'x')::numeric,'z',(v_position ->> 'z')::numeric,
      'wallSpec',case when v_building.building_type='wall' then v_wall_spec end,
      'wallResearch',case when v_building.building_type='wall' then v_wall_research end,
      'nearbyWorkshops',v_workshops,
      'rateNumerator',v_health.rate_numerator,'rateDenominator',v_health.rate_denominator);
    v_items := v_items || jsonb_build_array(v_item);
  end loop;
  delete from public.island_structure_health h where h.island_owner=p_island_owner
    and not exists (select 1 from public.islet_buildings b where b.player_id=p_island_owner
      and b.plot=h.spot and b.recovery_instance_id=h.instance_id
      and b.building_type in ('wall','cannon','mortar','harpoon','culverin','swivel'));
  update public.island_recovery_state set revision=revision+1,updated_at=p_server_now
   where island_owner=p_island_owner returning revision into v_revision;
  return jsonb_build_object('status','refreshed','serverNow',p_server_now,
    'revision',v_revision,'positions',v_positions,'structures',v_items);
end;
$$;

revoke all on function public.structure_recovery_refresh_locked(uuid,timestamptz,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.structure_recovery_refresh_locked(uuid,timestamptz,jsonb) to service_role;
comment on function public.structure_recovery_refresh_locked(uuid,timestamptz,jsonb) is
  'Caller first locks affected owner islands and settles with the same server timestamp. Preserves normalized HP for the same instance, initializes a new instance at full HP, reads versioned config and positions, refreshes current max HP and owner recovery rates, and deletes only removed current-health rows.';

-- Closes the first canonical HP receipt and pays each participant in one transaction.
create or replace function public.recovery_wave_finish(
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
  if p_player_id<>v_owner and not exists (
    select 1 from public.island_members where island_owner=v_owner
      and player_id=p_player_id and left_at is null
  ) then return jsonb_build_object('status','refused','reason','not_member'); end if;
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
    if p_through_tick < v_wave.sealed_through_tick or p_input_head_seq < v_wave.journal_head then
      return jsonb_build_object('status','refused','reason','health_sync_required');
    end if;
    if v_server_now < v_run.starts_at + make_interval(secs=>v_run.minimum_seconds)
       and v_part.finished_at is null then
      return jsonb_build_object('status','refused','reason','too_early',
        'waitSeconds',greatest(1,ceil(extract(epoch from
          v_run.starts_at+make_interval(secs=>v_run.minimum_seconds)-v_server_now))::integer));
    end if;
    v_checkpoint := public.recovery_wave_report_health_locked(
      p_player_id,p_wave_id,p_island_epoch,p_checkpoint_uid,p_through_tick,
      p_input_head_seq,p_last_repair_seq,p_basis_repair_seq,p_hp_units,v_server_now);
    if v_checkpoint ->> 'status'<>'accepted' then return v_checkpoint; end if;
  end if;

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
  else
    if not v_repeat and p_last_repair_seq is distinct from v_wave.last_repair_seq then
      return jsonb_build_object('status','refused','reason','health_sync_required');
    end if;
    if not v_repeat and v_server_now < v_run.starts_at + make_interval(secs=>v_run.minimum_seconds) then
      return jsonb_build_object('status','refused','reason','too_early',
        'waitSeconds',greatest(1,ceil(extract(epoch from
          v_run.starts_at+make_interval(secs=>v_run.minimum_seconds)-v_server_now))::integer));
    end if;
    if not v_repeat then
      if p_survived then
        v_base := p_loot_base;
        select coalesce(sum(level),0) into v_houses from public.islet_buildings
         where player_id=v_owner and building_type='house';
        v_loot := v_base + p_loot_per_wave*v_run.wave + p_loot_per_house*v_houses;
        if v_boss then v_loot := v_loot*p_boss_multiplier; end if;
      end if;
      update public.wave_participants set finished_at=v_server_now,survived=p_survived,
        ships_sunk=p_ships_sunk,loot=v_loot,expired=false
       where wave_id=p_wave_id and player_id=p_player_id returning * into v_part;
      if v_run.finished_at is null then
        update public.wave_runs set finished_at=v_server_now,survived=p_survived,
          ships_sunk=p_ships_sunk,loot=v_loot where id=p_wave_id;
      end if;
      if not p_survived and v_run.finished_at is null and not v_run.flag_counted then
        update public.islands set next_wave=greatest(1,wave_best-p_restart_back)
         where player_id=v_owner;
      end if;
      if p_survived and not v_run.flag_counted then
        update public.wave_runs set flag_counted=true where id=p_wave_id;
        update public.islands set wave_best=greatest(wave_best,v_run.wave),flags=flags+1,
          next_wave=v_run.wave+1
         where player_id=v_owner;
      end if;
      if p_survived then
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

revoke all on function public.recovery_wave_finish(uuid,uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer,uuid,text,integer,bigint,bigint,jsonb,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.recovery_wave_finish(uuid,uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer,uuid,text,integer,bigint,bigint,jsonb,jsonb) to service_role;
comment on function public.recovery_wave_finish(uuid,uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer,uuid,text,integer,bigint,bigint,jsonb,jsonb) is
  'Validates a complete sealed health checkpoint, closes the first canonical HP vector and settles participant loot atomically. Later participants receive the immutable first close receipt and their own idempotent loot.';
