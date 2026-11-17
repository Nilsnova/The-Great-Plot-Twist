-- Production apply for migration 20261118030000_recovery_away.sql (feat/recovery-teammate-instant).
-- Idempotent: create or replace + revoke/grant/comment, and the history row with on conflict do nothing;
-- running it twice changes nothing. One transaction.
-- Order: apply AFTER the backend deploy of feat/recovery-teammate-instant. The new events page adds a
-- `closed` field, which the old backend's strict page model refuses (every journal read would answer
-- 502). The new backend and frontend work with or without this SQL (the field is optional).
-- The body between the markers is byte-identical to the migration file.
begin;

-- >>> migration body 20261118030000
-- Recovery waves: friendlier away handling and a shorter input lead (feat/recovery-teammate-instant).
-- 1. A started wave counts as abandoned after 180 s without a journal read or input (was 60 s), so a
--    player whose tab was hidden for a few minutes comes back to the same wave.
-- 2. Every events page says whether the wave is closed (closed: true/false). A player who returns to a
--    wave that was closed while they were away (its seal frozen before the simulation's end) can end it
--    on screen instead of waiting for seals that never come. Needs the backend that accepts the field.
-- 3. An input lands one tick after the server's now instead of five (still after the seal), so every
--    screen shows a command about 200 ms sooner. Determinism and the sealed-frontier rule are unchanged:
--    the append helper still puts every event after the current seal.
-- Same signatures, grants and comment style; version-0 islands and protocol-1 waves take none of these paths.

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
                         + interval '180 seconds';
$$;

revoke all on function public.recovery_wave_is_abandoned(timestamptz,timestamptz,timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.recovery_wave_is_abandoned(timestamptz,timestamptz,timestamptz) to service_role;
comment on function public.recovery_wave_is_abandoned(timestamptz,timestamptz,timestamptz) is
  'A started recovery wave whose participants have neither read its journal nor sent input for 180 seconds (20261118030000; was 60).';

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
      else greatest(v_requested_tick, v_tick + 1, v_wave.sealed_through_tick + 1, 0) end;
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
  'Atomically validates and appends authenticated protocol-2 Captain commands through recovery_wave_append_event_locked; actor identity and Captain stats are server-derived, counters and UIDs are idempotent, the journal assigns global commit order, a command lands one tick after the server''s now (and after the seal), and a command past the wave''s last tick is refused wave_over.';

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
    'through',case when p_through is null then null else v_through end,'events',v_page,
    'closed',v_wave.closed_at is not null);
end;
$$;

revoke all on function public.recovery_wave_events_page(uuid, uuid, bigint, bigint, integer) from public, anon, authenticated, service_role;
grant execute on function public.recovery_wave_events_page(uuid, uuid, bigint, bigint, integer) to service_role;
comment on function public.recovery_wave_events_page(uuid, uuid, bigint, bigint, integer) is
  'Returns bounded journal pages under caller-supplied fixed head and seal watermarks; reconnects and concurrent readers can replay any complete prefix without per-participant cursors. An open-head read seals at most the wave''s last tick and records participant activity; a closed wave keeps its last seal and every page says whether the wave is closed (closed).';

comment on column public.recovery_wave_states.last_activity_at is
  'Last journal read or input of any participant while the wave was open; a reserved wave silent for 180 s is closed as abandoned by the next settlement.';
comment on function public.structure_recovery_settle_locked(uuid, timestamptz) is
  'In-transaction canonical expiry/finish settlement helper. Caller must already hold payer wallet(s) sorted and owner island locks, and pass one server timestamp captured after those locks. This helper locks recovery state, wave, buildings and health in canonical order, closes an expired wave or one abandoned for 180 s (finishing its run without credit), merges accepted checkpoint HP with later server repair events, materializes only inactive time, closes history and clears the active reservation. It never acquires a wallet.';
-- <<< migration body 20261118030000

insert into supabase_migrations.schema_migrations (version, name)
values ('20261118030000', 'recovery_away')
on conflict (version) do nothing;

commit;
