-- The owner's playtest of 17/18 Nov (fix/playtest-1117).
-- A. Recovery waves: the weapon in the journal is the one the shooter's screen uses.
-- With the shared arsenal (flag arsenal) a captain shoots with the copy they carry from the island's
-- arsenal (frontend island/index.js captainLoadout -> arsenal.weapon()), else the musket. The protocol-2
-- input append attached islands.weapon_equipped instead, the pre-arsenal personal weapon, so a carried
-- fire bomb or rifle replayed as a musket: a bomb thrown at a point (no target) did nothing, other
-- shots used the wrong damage, range and reload. New overload recovery_wave_inputs(..., p_arsenal): the
-- server passes the flag; the 3-argument function keeps its old answer (equipped weapon) for an older
-- backend. Version-0 islands and protocol-1 waves are untouched.
-- B. Every structure is whole again the moment a recovery wave closes (finish, expiry or abandonment):
--    structure_recovery_settle_locked sets the island's health rows to full instead of projecting the
--    closed HP forward (owner's change of D059: no waiting between waves). Paid repair between waves is
--    then refused intact; the closed HP vector stays in the wave's history.

create or replace function public.recovery_wave_inputs(
  p_player_id uuid,
  p_wave_id uuid,
  p_inputs jsonb,
  p_arsenal boolean
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
  if p_player_id is null or p_wave_id is null or p_arsenal is null or jsonb_typeof(p_inputs) is distinct from 'array'
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
    -- The gun the shooter's own screen uses (island/index.js captainLoadout): with the shared arsenal on,
    -- the copy they carry from the defended island's arsenal, else the standard musket; without it, their
    -- equipped weapon. Read at each input, so a weapon taken mid-wave fires from the next command on.
    'weapon', case when p_arsenal then coalesce((
        select copy.weapon from public.arsenal_copies copy
         where copy.island_owner = v_owner and copy.holder = p_player_id
         order by copy.id limit 1), 'musket')
      else weapon_equipped end
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

revoke all on function public.recovery_wave_inputs(uuid, uuid, jsonb, boolean) from public, anon, authenticated, service_role;
grant execute on function public.recovery_wave_inputs(uuid, uuid, jsonb, boolean) to service_role;
comment on function public.recovery_wave_inputs(uuid, uuid, jsonb, boolean) is
  'Atomically validates and appends authenticated protocol-2 Captain commands through recovery_wave_append_event_locked; actor identity and Captain stats are server-derived, counters and UIDs are idempotent, the journal assigns global commit order, the attached weapon is the arsenal copy carried on the defended island (p_arsenal) or the equipped one, a command lands one tick after the server''s now (and after the seal), and a command past the wave''s last tick is refused wave_over.';

-- The previous signature, for a backend that does not pass the flag yet: the equipped weapon as before.
create or replace function public.recovery_wave_inputs(
  p_player_id uuid,
  p_wave_id uuid,
  p_inputs jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select public.recovery_wave_inputs(p_player_id, p_wave_id, p_inputs, false);
$$;

revoke all on function public.recovery_wave_inputs(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.recovery_wave_inputs(uuid, uuid, jsonb) to service_role;
comment on function public.recovery_wave_inputs(uuid, uuid, jsonb) is
  'Compatibility form of recovery_wave_inputs(uuid, uuid, jsonb, boolean) with p_arsenal false (the equipped weapon is attached).';

-- B. Full health when a recovery wave closes.
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

    -- The owner's rule (fix/playtest-1117): once a wave is over, every wall and tower is whole again at
    -- once. The closed HP vector stays in the wave's history; the health rows start the break full.
    update public.island_structure_health
       set hp_units = 1000000,
           settled_at = greatest(settled_at, p_server_now),
           updated_at = p_server_now
     where island_owner = p_island_owner;

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

comment on function public.structure_recovery_settle_locked(uuid, timestamptz) is
  'In-transaction canonical expiry/finish settlement helper. Caller must already hold payer wallet(s) sorted and owner island locks, and pass one server timestamp captured after those locks. This helper locks recovery state, wave, buildings and health in canonical order, closes an expired wave or one abandoned for 180 s (finishing its run without credit), keeps the closed HP vector in the wave history, sets every structure of the island back to full health (the owner''s rule of 18 Nov: no waiting between waves), materializes between-wave time and clears the active reservation. It never acquires a wallet.';
