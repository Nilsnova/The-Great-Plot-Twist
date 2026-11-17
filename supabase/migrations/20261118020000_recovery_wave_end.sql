-- Recovery waves: the server owns the end of a wave (integ/recovery-fixes).
-- 1. One journal append helper: every event gets effective_tick >= seal + 1, clamped to the wave's
--    last tick (a later one is refused). Inputs and participant_joined use it; a late join no longer
--    lands at tick 0 behind the seal, which stranded every earlier participant's replay.
-- 2. The seal never passes the wave's last tick and never moves after the close (the closed-row
--    trigger turned a teammate's poll after the close into an exception).
-- 3. Finish takes the caller's own complete prefix (through tick <= seal, head <= journal head)
--    instead of the exact current seal and head, so a teammate's poll can no longer refuse it. A
--    checkpoint older than one already accepted (or diverging from it) is not stored, and the close
--    uses the accepted state. Later finishers get the first close's outcome.
-- 4. Abandoned waves end on the server: a reserved wave whose participants have not read the journal
--    for 60 s (or that passed its maximum) is closed as expired by the next settle (bell, join, build,
--    repair), and wave_runs.finished_at is set with it. /api/waves/current no longer offers it.
-- Version 0 islands and protocol-1 waves take none of these paths.

alter table public.recovery_wave_states
  add column if not exists last_activity_at timestamptz;

comment on column public.recovery_wave_states.last_activity_at is
  'Last journal read or input of any participant while the wave was open; a reserved wave silent for 60 s is closed as abandoned by the next settlement.';

-- The last simulation tick of a wave (20 ticks a second), at most 18000 (the client and route bound).
create or replace function public.recovery_wave_last_tick(p_maximum_seconds integer)
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$
  select least(18000, greatest(0, coalesce(p_maximum_seconds, 0) * 20 - 1));
$$;

revoke all on function public.recovery_wave_last_tick(integer) from public, anon, authenticated, service_role;
grant execute on function public.recovery_wave_last_tick(integer) to service_role;
comment on function public.recovery_wave_last_tick(integer) is
  'The last simulation tick of a recovery wave: maximum_seconds x 20 - 1, never above 18000.';

-- True when nobody has read the journal or sent input for 60 s since the wave started.
create or replace function public.recovery_wave_is_abandoned(
  p_starts_at timestamptz, p_last_activity_at timestamptz, p_server_now timestamptz
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_starts_at is not null and p_server_now is not null
     and p_server_now >= greatest(p_starts_at, coalesce(p_last_activity_at, p_starts_at))
                         + interval '60 seconds';
$$;

revoke all on function public.recovery_wave_is_abandoned(timestamptz,timestamptz,timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.recovery_wave_is_abandoned(timestamptz,timestamptz,timestamptz) to service_role;
comment on function public.recovery_wave_is_abandoned(timestamptz,timestamptz,timestamptz) is
  'A started recovery wave whose participants have neither read its journal nor sent input for 60 seconds.';

-- The one journal append. Caller holds the owner island lock (and so the wave row order).
create or replace function public.recovery_wave_append_event_locked(
  p_wave_id uuid, p_actor_id uuid, p_participant_token uuid, p_input_uid text,
  p_actor_counter bigint, p_requested_tick integer, p_event_kind text, p_min_tick integer,
  p_payload jsonb
)
returns public.recovery_wave_events
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_wave public.recovery_wave_states;
  v_maximum integer;
  v_effective integer;
  v_event public.recovery_wave_events;
begin
  if p_wave_id is null or p_event_kind is null or p_payload is null then
    raise exception 'bad_recovery_event';
  end if;
  select * into v_wave from public.recovery_wave_states where wave_id=p_wave_id for update;
  if not found then raise exception 'no_recovery_wave'; end if;
  select maximum_seconds into v_maximum from public.wave_runs where id=p_wave_id;
  v_effective := greatest(0, coalesce(p_min_tick, 0), v_wave.sealed_through_tick + 1);
  if v_effective > public.recovery_wave_last_tick(v_maximum) then
    raise exception 'recovery_event_after_maximum';
  end if;
  insert into public.recovery_wave_events
    (wave_id, seq, actor_id, participant_token, input_uid, actor_counter, requested_tick,
     event_kind, effective_tick, payload)
  values
    (p_wave_id, v_wave.journal_head + 1, p_actor_id, p_participant_token, p_input_uid,
     p_actor_counter, p_requested_tick, p_event_kind, v_effective, p_payload)
  returning * into v_event;
  update public.recovery_wave_states set journal_head = v_event.seq where wave_id = p_wave_id;
  return v_event;
end;
$$;

revoke all on function public.recovery_wave_append_event_locked(uuid,uuid,uuid,text,bigint,integer,text,integer,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.recovery_wave_append_event_locked(uuid,uuid,uuid,text,bigint,integer,text,integer,jsonb) to service_role;
comment on function public.recovery_wave_append_event_locked(uuid,uuid,uuid,text,bigint,integer,text,integer,jsonb) is
  'Appends one protocol-2 journal event at journal_head + 1 with effective_tick = max(0, p_min_tick, sealed_through_tick + 1); raises recovery_event_after_maximum past the wave''s last tick. Caller must hold the owner island lock.';

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
  v_last_tick integer;
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
  v_last_tick := public.recovery_wave_last_tick(v_run.maximum_seconds);
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
      return jsonb_build_object('status', 'refused', 'reason', 'counter_gap',
        'lastActorCounter', v_participant.last_actor_counter);
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
    -- A command after the wave's last tick can never run: the wave is over for it.
    if v_effective > v_last_tick then
      return jsonb_build_object('status', 'refused', 'reason', 'wave_over');
    end if;
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
    v_event := public.recovery_wave_append_event_locked(
      p_wave_id, p_player_id, v_participant.participant_token, v_item ->> 'inputUid',
      (v_item ->> 'actorCounter')::bigint, (v_item ->> 'tick')::integer, 'captain_input',
      (v_item ->> 'effectiveTick')::integer, v_item -> 'payload');
    v_head := v_event.seq;
    v_new := v_new || jsonb_build_array(jsonb_build_object(
      'serverSeq', v_event.seq, 'effectiveTick', v_event.effective_tick,
      'type', v_event.event_kind, 'participantToken', v_event.participant_token,
      'payload', v_event.payload));
  end loop;
  update public.recovery_wave_participants set last_actor_counter = v_counter
   where wave_id = p_wave_id and player_id = p_player_id;
  update public.recovery_wave_states set last_activity_at = v_now
   where wave_id = p_wave_id;
  return jsonb_build_object('status', 'accepted', 'accepted', v_all || v_new, 'headSeq', v_head,
                            'repeat', jsonb_array_length(v_pending) = 0);
end;
$$;

revoke all on function public.recovery_wave_inputs(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.recovery_wave_inputs(uuid, uuid, jsonb) to service_role;
comment on function public.recovery_wave_inputs(uuid, uuid, jsonb) is
  'Atomically validates and appends authenticated protocol-2 Captain commands through recovery_wave_append_event_locked; actor identity and Captain stats are server-derived, counters and UIDs are idempotent, the journal assigns global commit order, and a command past the wave''s last tick is refused wave_over.';

create or replace function public.recovery_wave_events_page(
  p_player_id uuid,
  p_wave_id uuid,
  p_after bigint,
  p_through bigint default null,
  p_sealed_through_tick integer default null
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
  v_owner uuid;
  v_now timestamptz;
  v_head bigint;
  v_sealed integer;
  v_through bigint;
  v_page jsonb;
begin
  if p_player_id is null or p_wave_id is null or p_after is null or p_after < 0
     or (p_through is not null and p_through < 0)
     or (p_sealed_through_tick is not null and p_sealed_through_tick < -1)
     or ((p_through is null) <> (p_sealed_through_tick is null)) then
    raise exception 'bad_recovery_page';
  end if;
  select island_owner into v_owner from public.recovery_wave_states where wave_id = p_wave_id;
  if not found then return jsonb_build_object('status','refused','reason','no_such_wave'); end if;
  perform 1 from public.islands where player_id = v_owner order by player_id for update;
  select * into v_island_state from public.island_recovery_state
   where island_owner=v_owner for update;
  select * into v_wave from public.recovery_wave_states where wave_id = p_wave_id for update;
  if not exists (
    select 1 from public.recovery_wave_participants
     where wave_id=p_wave_id and player_id=p_player_id
  ) or not exists (
    select 1 from public.wave_participants where wave_id=p_wave_id and player_id=p_player_id
  ) then return jsonb_build_object('status','refused','reason','not_in_wave'); end if;
  if v_wave.wave_protocol <> 2 then
    return jsonb_build_object('status','refused','reason','client_update_required');
  end if;
  v_now := clock_timestamp();
  if p_through is null then
    select * into v_run from public.wave_runs where id=p_wave_id;
    v_head := v_wave.journal_head;
    if p_after > v_head then
      return jsonb_build_object('status','refused','reason','bad_recovery_page');
    end if;
    if v_wave.closed_at is not null then
      -- A closed wave keeps its last seal: it covers the close, and the closed row is immutable.
      v_sealed := v_wave.sealed_through_tick;
    else
      v_sealed := case when v_now < v_run.starts_at then -1 else
        greatest(v_wave.sealed_through_tick,
                 least(floor(extract(epoch from (v_now - v_run.starts_at)) * 20)::integer - 1,
                       public.recovery_wave_last_tick(v_run.maximum_seconds))) end;
      update public.recovery_wave_states
         set sealed_through_tick = greatest(sealed_through_tick, v_sealed), last_activity_at = v_now
       where wave_id=p_wave_id returning sealed_through_tick into v_sealed;
    end if;
    v_through := v_head;
  else
    if p_through > v_wave.journal_head or p_sealed_through_tick > v_wave.sealed_through_tick then
      return jsonb_build_object('status','refused','reason','page_watermark_invalid');
    end if;
    if exists (select 1 from public.recovery_wave_events
      where wave_id=p_wave_id and seq>p_through
        and effective_tick<=p_sealed_through_tick) then
      return jsonb_build_object('status','refused','reason','page_incomplete');
    end if;
    v_head := p_through;
    v_sealed := p_sealed_through_tick;
    v_through := p_through;
    if p_after > v_through then
      return jsonb_build_object('status','refused','reason','bad_recovery_page');
    end if;
  end if;
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

revoke all on function public.recovery_wave_events_page(uuid, uuid, bigint, bigint, integer) from public, anon, authenticated, service_role;
grant execute on function public.recovery_wave_events_page(uuid, uuid, bigint, bigint, integer) to service_role;
comment on function public.recovery_wave_events_page(uuid, uuid, bigint, bigint, integer) is
  'Returns bounded journal pages under caller-supplied fixed head and seal watermarks; reconnects and concurrent readers can replay any complete prefix without per-participant cursors. An open-head read seals at most the wave''s last tick and records participant activity; a closed wave keeps its last seal.';

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
  v_event public.recovery_wave_events;
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
  -- Also closes an overdue or abandoned wave (and finishes its run) before anyone joins it.
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
  if v_run.finished_at is not null or v_wave.closed_at is not null
     or v_now > v_run.starts_at + make_interval(secs => v_run.maximum_seconds) then
    return jsonb_build_object('status','refused','reason','wave_over');
  end if;
  if exists (select 1 from public.wave_participants where wave_id=p_wave_id and player_id=p_player_id) then
    raise exception 'recovery_state_incomplete';
  end if;
  insert into public.wave_participants(wave_id,player_id) values(p_wave_id,p_player_id);
  insert into public.recovery_wave_participants(wave_id,player_id)
  values (p_wave_id,p_player_id) returning * into v_part;
  -- After the seal like every other event: earlier participants' sealed prefixes stay complete.
  v_event := public.recovery_wave_append_event_locked(
    p_wave_id, null, v_part.participant_token, null, null, null, 'participant_joined', 0,
    jsonb_build_object('participantToken',v_part.participant_token,'captain',v_captain));
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
  'Joins a frozen protocol-2 wave under canonical island/state locks and appends participant_joined after the current seal with a private-profile-free token and server Captain stats; an overdue or abandoned wave is settled first and refused wave_over; protocol-1 legacy waves retain the old join contract.';

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
  -- A closed or abandoned recovery wave is not offered: the next bell settles it.
  if v_wave.closed_at is not null or public.recovery_wave_is_abandoned(
       (v_reply ->> 'startsAt')::timestamptz, v_wave.last_activity_at, clock_timestamp()) then
    return jsonb_build_object('status','empty');
  end if;
  if p_protocol < v_wave.wave_protocol then
    return jsonb_build_object('status','refused','reason','client_update_required');
  end if;
  if not exists (select 1 from public.recovery_wave_participants
                  where wave_id=v_wave_id and player_id=p_player_id) then
    if p_player_id <> v_wave.island_owner and not exists (
      select 1 from public.island_members where island_owner=v_wave.island_owner
        and player_id=p_player_id and left_at is null
    ) then
      return jsonb_build_object('status','refused','reason','not_in_wave');
    end if;
    return v_reply || jsonb_build_object('recoveryVersion',1,'waveProtocol',2,'joined',false);
  end if;
  select * into v_part from public.recovery_wave_participants
   where wave_id=v_wave_id and player_id=p_player_id;
  return v_reply || jsonb_build_object('recoveryVersion',1,'waveProtocol',2,
    'initialSnapshot',v_wave.initial_snapshot,
    'participantToken',case when found then v_part.participant_token end,
    'lastActorCounter',case when found then v_part.last_actor_counter end,
    'joined',true);
end;
$$;

revoke all on function public.recovery_wave_current(uuid,text,uuid,smallint) from public, anon, authenticated, service_role;
grant execute on function public.recovery_wave_current(uuid,text,uuid,smallint) to service_role;
comment on function public.recovery_wave_current(uuid,text,uuid,smallint) is
  'Reads the current wave. A participant gets the frozen versioned snapshot and only their own token/counter (joined true); the island owner or an active member who has not joined gets the public wave row with recoveryVersion 1, waveProtocol 2 and joined false, without snapshot, token or counter; anyone else is refused not_in_wave. A closed or abandoned recovery wave answers empty. No account identifiers enter the returned snapshot or journal.';

create or replace function public.structure_recovery_settle_locked(
  p_island_owner uuid,
  p_server_now timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.island_recovery_state;
  v_wave public.recovery_wave_states;
  v_phase text;
  v_status text := 'between_waves';
  v_boundary timestamptz;
  v_hp jsonb;
  v_health public.island_structure_health;
  v_expected integer;
  v_elapsed_ms bigint;
  v_abandoned boolean := false;
begin
  if p_island_owner is null or p_server_now is null then
    raise exception 'bad_recovery_settlement';
  end if;
  select * into v_state from public.island_recovery_state
   where island_owner = p_island_owner for update;
  if not found then
    return jsonb_build_object('status', 'missing');
  end if;
  if v_state.recovery_version = 0 then
    return jsonb_build_object(
      'status', 'legacy', 'serverNow', p_server_now, 'islandEpoch', v_state.reset_epoch,
      'revision', v_state.revision, 'recoveryVersion', 0, 'waveProtocol', 1,
      'displayPhase', 'between_waves', 'repairWindow', 'between_waves',
      'waveId', null, 'remainingPaidUses', null
    );
  end if;

  if v_state.current_wave_id is not null then
    select * into v_wave from public.recovery_wave_states
     where wave_id = v_state.current_wave_id for update;
    if not found then
      raise exception 'recovery_state_incomplete';
    end if;
    v_phase := public.structure_recovery_phase(
      v_state.starts_at, v_state.expires_at, v_wave.closed_at, p_server_now
    );
    -- Nobody has read the journal for a minute: the server ends the wave now.
    if v_phase <> 'between_waves' and v_wave.closed_at is null
       and public.recovery_wave_is_abandoned(v_state.starts_at, v_wave.last_activity_at, p_server_now) then
      v_abandoned := true;
      v_phase := 'between_waves';
    end if;
    if v_phase <> 'between_waves' then
      return jsonb_build_object(
        'status', 'reserved', 'serverNow', p_server_now, 'islandEpoch', v_state.reset_epoch,
        'revision', v_state.revision, 'recoveryVersion', v_state.recovery_version,
        'waveProtocol', v_state.wave_protocol, 'displayPhase', v_phase,
        'repairWindow', 'reserved_wave', 'waveId', v_state.current_wave_id,
        'remainingPaidUses', greatest(0, 3 - v_wave.paid_used)
      );
    end if;

    v_boundary := coalesce(v_wave.closed_at,
                           case when v_abandoned then p_server_now else v_state.expires_at end);
    v_hp := case when v_wave.closed_at is null
                 then public.structure_recovery_wave_hp(v_wave.wave_id)
                 else v_wave.closed_hp end;
    if v_wave.closed_at is null then
      update public.recovery_wave_states
         set closed_at = v_boundary, closed_hp = v_hp
       where wave_id = v_wave.wave_id;
      -- An expired or abandoned wave ends without credit; its run no longer blocks the bell.
      update public.wave_runs
         set finished_at = v_boundary, survived = false, ships_sunk = 0, loot = 0, expired = true
       where id = v_wave.wave_id and finished_at is null;
    end if;

    -- The caller already holds wallet and island locks. Lock all structures in
    -- canonical order before materializing any health or clearing the phase.
    perform 1 from public.islet_buildings
     where player_id = p_island_owner
       and building_type in ('wall', 'cannon', 'mortar', 'harpoon', 'culverin', 'swivel')
     order by plot for update;
    perform 1 from public.island_structure_health
     where island_owner = p_island_owner order by spot for update;

    for v_health in
      select * from public.island_structure_health
       where island_owner = p_island_owner order by spot
    loop
      if v_hp ? v_health.instance_id::text then
        v_expected := (v_hp ->> v_health.instance_id::text)::integer;
      else
        v_expected := v_health.hp_units;
      end if;
      v_elapsed_ms := greatest(
        0,
        floor(extract(epoch from (p_server_now - greatest(v_boundary, v_health.settled_at))) * 1000)::bigint
      );
      update public.island_structure_health
         set hp_units = public.structure_recovery_project_hp(
               v_expected, v_elapsed_ms, v_health.rate_numerator, v_health.rate_denominator
             ),
             settled_at = greatest(v_health.settled_at, p_server_now),
             updated_at = p_server_now
       where island_owner = p_island_owner and spot = v_health.spot
         and instance_id = v_health.instance_id;
    end loop;

    update public.island_recovery_state
       set current_wave_id = null, reserved_at = null, starts_at = null, expires_at = null,
           revision = revision + 1, updated_at = p_server_now
     where island_owner = p_island_owner;
    v_status := 'settled';
  else
    -- A paid request depends on current HP, so materialize every eligible
    -- between-wave fraction before testing whether a target is intact. This
    -- uses one timestamp captured by the caller after wallet/island locks.
    perform 1 from public.islet_buildings
     where player_id = p_island_owner
       and building_type in ('wall', 'cannon', 'mortar', 'harpoon', 'culverin', 'swivel')
     order by plot for update;
    perform 1 from public.island_structure_health
     where island_owner = p_island_owner order by spot for update;

    for v_health in
      select * from public.island_structure_health
       where island_owner = p_island_owner order by spot
    loop
      v_elapsed_ms := greatest(
        0,
        floor(extract(epoch from (p_server_now - v_health.settled_at)) * 1000)::bigint
      );
      update public.island_structure_health
         set hp_units = public.structure_recovery_project_hp(
               v_health.hp_units, v_elapsed_ms, v_health.rate_numerator, v_health.rate_denominator
             ),
             settled_at = greatest(v_health.settled_at, p_server_now),
             updated_at = p_server_now
       where island_owner = p_island_owner and spot = v_health.spot
         and instance_id = v_health.instance_id;
    end loop;
    update public.island_recovery_state
       set revision = revision + 1, updated_at = p_server_now
     where island_owner = p_island_owner;
  end if;

  select * into v_state from public.island_recovery_state where island_owner = p_island_owner;
  return jsonb_build_object(
    'status', v_status, 'serverNow', p_server_now, 'islandEpoch', v_state.reset_epoch,
    'revision', v_state.revision, 'recoveryVersion', v_state.recovery_version,
    'waveProtocol', v_state.wave_protocol, 'displayPhase', 'between_waves',
    'repairWindow', 'between_waves', 'waveId', null, 'remainingPaidUses', null
  );
end;
$$;

comment on function public.structure_recovery_settle_locked(uuid, timestamptz) is
  'In-transaction canonical expiry/finish settlement helper. Caller must already hold payer wallet(s) sorted and owner island locks, and pass one server timestamp captured after those locks. This helper locks recovery state, wave, buildings and health in canonical order, closes an expired wave or one abandoned for 60 s (finishing its run without credit), merges accepted checkpoint HP with later server repair events, materializes only inactive time, closes history and clears the active reservation. It never acquires a wallet.';

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
    if v_checkpoint ->> 'status'<>'accepted'
       and coalesce(v_checkpoint ->> 'reason','') not in ('checkpoint_stale','checkpoint_divergence') then
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

revoke all on function public.recovery_wave_finish(uuid,uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer,uuid,text,integer,bigint,bigint,jsonb,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.recovery_wave_finish(uuid,uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer,uuid,text,integer,bigint,bigint,jsonb,jsonb) to service_role;
comment on function public.recovery_wave_finish(uuid,uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer,uuid,text,integer,bigint,bigint,jsonb,jsonb) is
  'Closes a recovery wave from the caller''s own complete sealed prefix (no exact seal/head match; an older or diverging checkpoint is not stored), closes the first canonical HP vector and settles participant loot atomically. Later participants receive the immutable first close receipt, the first close''s outcome and their own idempotent loot.';
