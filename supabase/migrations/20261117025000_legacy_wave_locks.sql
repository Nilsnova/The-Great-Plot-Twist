-- =============================================================================
-- 20261117025000_legacy_wave_locks.sql
--
-- WHAT IT DOES
--   Aligns the final legacy wave RPCs with recovery-v1 island locks, preserving
--   their signatures and v0 outcomes. Legacy wall RPCs cannot write v1 health.
--
-- SAFE TO RUN AGAIN
--   Replaces only the six final existing functions in place; no rows are changed.
-- =============================================================================

create or replace function public.wave_start(
  p_player_id         uuid,
  p_action_uid        text,
  p_place             text,
  p_island_owner      uuid,
  p_seed              integer,
  p_countdown_seconds integer,
  p_minimum_seconds   integer,
  p_maximum_seconds   integer,
  p_highest_wave      integer,
  p_weather_kind      text,
  p_weather_ships     numeric,
  p_weather_fog       numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_run    public.wave_runs;
  v_next   integer;
  v_repeat boolean := false;
  v_recovery_version smallint := 0;
  v_now timestamptz;
begin
  -- Step 1: the arguments. The table rules check the rest (the weather, the timing).
  if p_player_id is null or p_action_uid is null or p_seed is null or p_seed < 0
     or p_place is null or p_place not in ('island', 'pirate_point')
     or (p_place = 'island') <> (p_island_owner is not null)
     or p_countdown_seconds is null or p_countdown_seconds < 0
     or p_minimum_seconds is null or p_maximum_seconds is null
     or p_highest_wave is null or p_highest_wave < 1 then
    raise exception 'bad_wave';
  end if;

  -- Step 2: one bell at a time per island; the next wave of the place.
  if p_place = 'island' then
    select coalesce(next_wave, wave_best + 1) into v_next
      from public.islands
     where player_id = p_island_owner
       for update;
    if not found then
      return jsonb_build_object('status', 'refused', 'reason', 'no_such_island');
    end if;
    insert into public.island_recovery_state (island_owner)
    values (p_island_owner) on conflict (island_owner) do nothing;
    select recovery_version into v_recovery_version
      from public.island_recovery_state
     where island_owner = p_island_owner
       for update;
  else
    perform pg_advisory_xact_lock(hashtext('public.wave_runs:pirate_point'));
    select coalesce(max(wave), 0) + 1 into v_next
      from public.wave_runs
     where place = 'pirate_point' and flag_counted;
  end if;

  -- Protocol 1 cannot answer any bell on a v1-policy island, including a UID
  -- that already names a protocol-2 reservation.
  v_now := clock_timestamp();
  if p_place = 'island' and v_recovery_version = 1 then
    return jsonb_build_object(
      'status', 'refused', 'reason', 'client_update_required',
      'recoveryVersion', 1, 'waveProtocol', 2
    );
  end if;

  -- Step 3: the same click again is the same legacy wave.
  select * into v_run
    from public.wave_runs
   where started_by = p_player_id and action_uid = p_action_uid;

  if found then
    v_repeat := true;
  else
    -- Step 4: a wave nobody finished is over after its maximum length.
    update public.wave_runs
       set finished_at = v_now, survived = false, ships_sunk = 0, loot = 0, expired = true
     where coalesce(island_owner::text, place) = coalesce(p_island_owner::text, p_place)
       and finished_at is null
       and starts_at + make_interval(secs => maximum_seconds) < v_now;

    -- Step 5: one running wave per island.
    if exists (
      select 1 from public.wave_runs
       where coalesce(island_owner::text, place) = coalesce(p_island_owner::text, p_place)
         and finished_at is null
    ) then
      return jsonb_build_object('status', 'refused', 'reason', 'wave_running');
    end if;

    -- Steps 6 and 7: the next wave, which starts after the countdown.
    insert into public.wave_runs (
      started_by, action_uid, place, island_owner, wave, seed, starts_at,
      minimum_seconds, maximum_seconds, weather_kind, weather_ships, weather_fog
    )
    values (
      p_player_id, p_action_uid, p_place, p_island_owner,
      least(greatest(v_next, 1), p_highest_wave),
      p_seed, date_trunc('second', v_now) + make_interval(secs => p_countdown_seconds),
      p_minimum_seconds, p_maximum_seconds, p_weather_kind, p_weather_ships, p_weather_fog
    )
    returning * into v_run;
  end if;

  -- Step 8: the bell-ringer is the first participant.
  insert into public.wave_participants (wave_id, player_id)
  values (v_run.id, p_player_id)
  on conflict (wave_id, player_id) do nothing;

  return jsonb_build_object(
    'status', 'started', 'waveId', v_run.id, 'wave', v_run.wave, 'seed', v_run.seed,
    'startsAt', v_run.starts_at, 'weatherKind', v_run.weather_kind,
    'ships', v_run.weather_ships, 'fog', v_run.weather_fog, 'place', v_run.place,
    'repeat', v_repeat
  );
end;
$$;
comment on function public.wave_start(uuid, text, text, uuid, integer, integer, integer, integer, integer, text, numeric, numeric) is
  'Starts or repeats a legacy protocol-1 wave under island then recovery-state locks. A new-policy island refuses with client_update_required. Existing legacy success, timing and retry answers are retained. Only service_role may run it.';

create or replace function public.wave_join(
  p_player_id uuid,
  p_wave_id   uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_run    public.wave_runs;
  v_repeat boolean := false;
  v_owner uuid;
  v_place text;
  v_now timestamptz;
begin
  if p_player_id is null or p_wave_id is null then
    raise exception 'bad_wave_join';
  end if;

  -- Discover ownership first; the lock order is island, policy state, wave.
  select island_owner, place into v_owner, v_place
    from public.wave_runs where id = p_wave_id;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_wave');
  end if;
  if v_place = 'island' then
    perform player_id from public.islands
     where player_id = v_owner for update;
    if not found then
      return jsonb_build_object('status', 'refused', 'reason', 'no_such_wave');
    end if;
    insert into public.island_recovery_state (island_owner)
    values (v_owner) on conflict (island_owner) do nothing;
    perform island_owner from public.island_recovery_state
     where island_owner = v_owner for update;
  end if;
  select * into v_run from public.wave_runs where id = p_wave_id for update;
  if not found or v_run.island_owner is distinct from v_owner or v_run.place <> v_place then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_wave');
  end if;
  v_now := clock_timestamp();
  if exists (select 1 from public.recovery_wave_states where wave_id = p_wave_id) then
    return jsonb_build_object(
      'status', 'refused', 'reason', 'client_update_required',
      'recoveryVersion', 1, 'waveProtocol', 2
    );
  end if;

  if exists (
    select 1 from public.wave_participants
     where wave_id = p_wave_id and player_id = p_player_id
  ) then
    v_repeat := true;
  elsif v_run.finished_at is not null
     or v_now > v_run.starts_at + make_interval(secs => v_run.maximum_seconds) then
    return jsonb_build_object('status', 'refused', 'reason', 'wave_over');
  elsif not exists (select 1 from public.profiles where id = p_player_id) then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  else
    insert into public.wave_participants (wave_id, player_id)
    values (p_wave_id, p_player_id);
  end if;

  return jsonb_build_object(
    'status', 'joined', 'waveId', v_run.id, 'wave', v_run.wave, 'seed', v_run.seed,
    'startsAt', v_run.starts_at, 'weatherKind', v_run.weather_kind,
    'ships', v_run.weather_ships, 'fog', v_run.weather_fog, 'place', v_run.place,
    'repeat', v_repeat
  );
end;
$$;
comment on function public.wave_join(uuid, uuid) is
  'Joins or repeats a legacy wave after island, recovery-state and wave locks. A protocol-2 recovery wave refuses with client_update_required; frozen legacy waves keep the original membership behavior. Only service_role may run it.';

create or replace function public.wave_finish(
  p_player_id       uuid,
  p_wave_id         uuid,
  p_survived        boolean,
  p_ships_sunk      integer,
  p_loot_base       integer,
  p_loot_per_wave   integer,
  p_loot_per_house  integer,
  p_point_loot_base integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_run     public.wave_runs;
  v_part    public.wave_participants;
  v_houses  integer := 0;
  v_base    integer;
  v_loot    integer := 0;
  v_balance bigint;
  v_repeat  boolean := false;
  v_best    integer;
  v_flags   integer;
  v_owner        uuid;
  v_place        text;
  v_locked_owner uuid;
  v_locked_place text;
  v_now          timestamptz;
begin
  -- Step 1: the arguments.
  if p_player_id is null or p_wave_id is null or p_survived is null
     or p_ships_sunk is null or p_ships_sunk < 0 or p_ships_sunk > 1000
     or p_loot_base is null or p_loot_base < 0
     or p_loot_per_wave is null or p_loot_per_wave < 0
     or p_loot_per_house is null or p_loot_per_house < 0
     or p_point_loot_base is null or p_point_loot_base < 0 then
    raise exception 'bad_wave_finish';
  end if;

  -- Step 2: the wallet first, then the wave, then the player's own row.
  -- Discover the immutable owner/place before locking; revalidate after the wave lock.
  select island_owner, place into v_owner, v_place
    from public.wave_runs where id = p_wave_id;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_wave');
  end if;

  -- Canonical order: payer wallet, all changed islands, recovery state, wave.
  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;
  perform player_id from public.islands
   where player_id = p_player_id or (v_place = 'island' and player_id = v_owner)
   order by player_id for update;
  select island_owner, place into v_locked_owner, v_locked_place
    from public.wave_runs where id = p_wave_id;
  if v_locked_owner is distinct from v_owner or v_locked_place is distinct from v_place then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_wave');
  end if;
  insert into public.island_recovery_state (island_owner)
  select player_id from public.islands
   where player_id = p_player_id or (v_place = 'island' and player_id = v_owner)
   order by player_id
  on conflict (island_owner) do nothing;
  perform island_owner from public.island_recovery_state
   where island_owner = p_player_id or (v_place = 'island' and island_owner = v_owner)
   order by island_owner for update;

  select * into v_run from public.wave_runs where id = p_wave_id for update;
  if not found or v_run.island_owner is distinct from v_owner or v_run.place <> v_place then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_wave');
  end if;
  if exists (select 1 from public.recovery_wave_states where wave_id = p_wave_id) then
    return jsonb_build_object(
      'status', 'refused', 'reason', 'client_update_required',
      'recoveryVersion', 1, 'waveProtocol', 2
    );
  end if;
  v_now := clock_timestamp();

  -- Step 3: only a participant.
  select * into v_part
    from public.wave_participants
   where wave_id = p_wave_id and player_id = p_player_id
     for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'not_in_wave');
  end if;

  if v_part.finished_at is not null then
    -- Step 4: finished already; the stored result stands.
    v_repeat := true;
  elsif v_now < v_run.starts_at + make_interval(secs => v_run.minimum_seconds) then
    -- Step 5: too early. Nothing changes; the wave keeps running.
    return jsonb_build_object(
      'status', 'refused', 'reason', 'too_early',
      'waitSeconds', greatest(1, ceil(extract(epoch from
        v_run.starts_at + make_interval(secs => v_run.minimum_seconds) - v_now))::integer)
    );
  elsif v_now > v_run.starts_at + make_interval(secs => v_run.maximum_seconds) then
    -- Step 6: too late. This player gets nothing; an open wave run is closed.
    update public.wave_participants
       set finished_at = v_now, survived = false, ships_sunk = 0, loot = 0, expired = true
     where wave_id = p_wave_id and player_id = p_player_id
    returning * into v_part;
    update public.wave_runs
       set finished_at = v_now, survived = false, ships_sunk = 0, loot = 0, expired = true
     where id = v_run.id and finished_at is null;
  else
    -- Step 7: this player's loot, capped by the wave number and the houses.
    if p_survived then
      if v_run.place = 'island' then
        v_base := p_loot_base;
        select count(*) into v_houses
          from public.islet_buildings
         where player_id = v_run.island_owner and building_type = 'house';
      else
        v_base := p_point_loot_base;
      end if;
      v_loot := v_base + p_loot_per_wave * v_run.wave + p_loot_per_house * v_houses;
    end if;

    update public.wave_participants
       set finished_at = v_now, survived = p_survived, ships_sunk = p_ships_sunk, loot = v_loot
     where wave_id = p_wave_id and player_id = p_player_id
    returning * into v_part;

    -- The first finish closes the wave run: no new joins, the next bell may ring.
    if v_run.finished_at is null then
      update public.wave_runs
         set finished_at = v_now, survived = p_survived, ships_sunk = p_ships_sunk, loot = v_loot
       where id = v_run.id;
    end if;

    -- One best wave and one flag per wave, at the first survived finish.
    if p_survived and not v_run.flag_counted then
      update public.wave_runs set flag_counted = true where id = v_run.id;
      if v_run.place = 'island' then
        update public.islands
           set wave_best = greatest(wave_best, v_run.wave), flags = flags + 1
         where player_id = v_run.island_owner;
      end if;
    end if;

    if v_loot > 0 then
      v_balance := public.apply_wallet_transaction(
        p_player_id, v_loot, 'pirate_loot',
        'wave:' || v_run.id::text || ':' || p_player_id::text
      );
    end if;
  end if;

  -- The best wave and the flags of the place of the wave.
  if v_run.place = 'island' then
    select wave_best, flags into v_best, v_flags
      from public.islands
     where player_id = v_run.island_owner;
  else
    select coalesce(max(wave), 0), count(*) into v_best, v_flags
      from public.wave_runs
     where place = 'pirate_point' and flag_counted;
  end if;

  return jsonb_build_object(
    'status', 'done', 'loot', v_part.loot, 'balance', v_balance, 'survived', v_part.survived,
    'wave', v_run.wave, 'waveBest', v_best, 'flags', v_flags,
    'expired', v_part.expired, 'repeat', v_repeat
  );
end;
$$;
comment on function public.wave_finish(uuid, uuid, boolean, integer, integer, integer, integer, integer) is
  'Finishes one participant in a frozen legacy wave. Locks the payer wallet, changed island and recovery-state rows in UUID order, then the wave and participant. Protocol-2 waves return client_update_required; legacy timing, loot, flags, restart and idempotent result behavior remain. Only service_role may run it.';

create or replace function public.wave_finish(
  p_player_id         uuid,
  p_wave_id           uuid,
  p_survived          boolean,
  p_ships_sunk        integer,
  p_loot_base         integer,
  p_loot_per_wave     integer,
  p_loot_per_house    integer,
  p_point_loot_base   integer,
  p_boss_every        integer,
  p_boss_multiplier   integer,
  p_restart_back      integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_run     public.wave_runs;
  v_part    public.wave_participants;
  v_houses  integer := 0;
  v_base    integer;
  v_loot    integer := 0;
  v_balance bigint;
  v_repeat  boolean := false;
  v_best    integer;
  v_flags   integer;
  v_boss    boolean;
  v_owner        uuid;
  v_place        text;
  v_locked_owner uuid;
  v_locked_place text;
  v_now          timestamptz;
begin
  -- Step 1: the arguments.
  if p_player_id is null or p_wave_id is null or p_survived is null
     or p_ships_sunk is null or p_ships_sunk < 0 or p_ships_sunk > 1000
     or p_loot_base is null or p_loot_base < 0
     or p_loot_per_wave is null or p_loot_per_wave < 0
     or p_loot_per_house is null or p_loot_per_house < 0
     or p_point_loot_base is null or p_point_loot_base < 0
     or p_boss_every is null or p_boss_every < 0
     or p_boss_multiplier is null or p_boss_multiplier not between 1 and 10
     or p_restart_back is null or p_restart_back < 0 then
    raise exception 'bad_wave_finish';
  end if;

  -- Step 2: the wallet first, then the wave, then the player's own row.
  -- Discover the immutable owner/place before locking; revalidate after the wave lock.
  select island_owner, place into v_owner, v_place
    from public.wave_runs where id = p_wave_id;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_wave');
  end if;

  -- Canonical order: payer wallet, all changed islands, recovery state, wave.
  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;
  perform player_id from public.islands
   where player_id = p_player_id or (v_place = 'island' and player_id = v_owner)
   order by player_id for update;
  select island_owner, place into v_locked_owner, v_locked_place
    from public.wave_runs where id = p_wave_id;
  if v_locked_owner is distinct from v_owner or v_locked_place is distinct from v_place then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_wave');
  end if;
  insert into public.island_recovery_state (island_owner)
  select player_id from public.islands
   where player_id = p_player_id or (v_place = 'island' and player_id = v_owner)
   order by player_id
  on conflict (island_owner) do nothing;
  perform island_owner from public.island_recovery_state
   where island_owner = p_player_id or (v_place = 'island' and island_owner = v_owner)
   order by island_owner for update;

  select * into v_run from public.wave_runs where id = p_wave_id for update;
  if not found or v_run.island_owner is distinct from v_owner or v_run.place <> v_place then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_wave');
  end if;
  if exists (select 1 from public.recovery_wave_states where wave_id = p_wave_id) then
    return jsonb_build_object(
      'status', 'refused', 'reason', 'client_update_required',
      'recoveryVersion', 1, 'waveProtocol', 2
    );
  end if;
  v_now := clock_timestamp();
  v_boss := p_boss_every > 0 and v_run.wave % p_boss_every = 0;

  -- Step 3: only a participant.
  select * into v_part
    from public.wave_participants
   where wave_id = p_wave_id and player_id = p_player_id
     for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'not_in_wave');
  end if;

  if v_part.finished_at is not null then
    -- Step 4: finished already; the stored result stands.
    v_repeat := true;
  elsif v_now < v_run.starts_at + make_interval(secs => v_run.minimum_seconds) then
    -- Step 5: too early. Nothing changes; the wave keeps running.
    return jsonb_build_object(
      'status', 'refused', 'reason', 'too_early',
      'waitSeconds', greatest(1, ceil(extract(epoch from
        v_run.starts_at + make_interval(secs => v_run.minimum_seconds) - v_now))::integer)
    );
  elsif v_now > v_run.starts_at + make_interval(secs => v_run.maximum_seconds) then
    -- Step 6: too late. This player gets nothing; an open wave run is closed.
    update public.wave_participants
       set finished_at = v_now, survived = false, ships_sunk = 0, loot = 0, expired = true
     where wave_id = p_wave_id and player_id = p_player_id
    returning * into v_part;
    update public.wave_runs
       set finished_at = v_now, survived = false, ships_sunk = 0, loot = 0, expired = true
     where id = v_run.id and finished_at is null;
  else
    -- Step 7: this player's loot.
    if p_survived then
      if v_run.place = 'island' then
        v_base := p_loot_base;
        select coalesce(sum(level), 0) into v_houses
          from public.islet_buildings
         where player_id = v_run.island_owner and building_type = 'house';
      else
        v_base := p_point_loot_base;
      end if;
      v_loot := v_base + p_loot_per_wave * v_run.wave + p_loot_per_house * v_houses;
      if v_boss then
        v_loot := v_loot * p_boss_multiplier;
      end if;
    end if;

    update public.wave_participants
       set finished_at = v_now, survived = p_survived, ships_sunk = p_ships_sunk, loot = v_loot
     where wave_id = p_wave_id and player_id = p_player_id
    returning * into v_part;

    -- The restart rule: a loss that closes the wave before anyone won it.
    if not p_survived and v_run.finished_at is null and not v_run.flag_counted
       and v_run.place = 'island' then
      update public.islands
         set next_wave = greatest(1, wave_best - p_restart_back)
       where player_id = v_run.island_owner;
    end if;

    -- The first finish closes the wave run: no new joins, the next bell may ring.
    if v_run.finished_at is null then
      update public.wave_runs
         set finished_at = v_now, survived = p_survived, ships_sunk = p_ships_sunk, loot = v_loot
       where id = v_run.id;
    end if;

    -- One best wave and one flag per wave, at the first survived finish; a win
    -- also sets the next wave of the run.
    if p_survived and not v_run.flag_counted then
      update public.wave_runs set flag_counted = true where id = v_run.id;
      if v_run.place = 'island' then
        update public.islands
           set wave_best = greatest(wave_best, v_run.wave), flags = flags + 1,
               next_wave = v_run.wave + 1
         where player_id = v_run.island_owner;
      end if;
    end if;

    -- The player's own best won wave, anywhere, for the unlocks.
    if p_survived then
      update public.islands
         set won_wave_best = greatest(won_wave_best, v_run.wave)
       where player_id = p_player_id and won_wave_best < v_run.wave;
    end if;

    if v_loot > 0 then
      v_balance := public.apply_wallet_transaction(
        p_player_id, v_loot, 'pirate_loot',
        'wave:' || v_run.id::text || ':' || p_player_id::text
      );
    end if;
  end if;

  -- The best wave and the flags of the place of the wave.
  if v_run.place = 'island' then
    select wave_best, flags into v_best, v_flags
      from public.islands
     where player_id = v_run.island_owner;
  else
    select coalesce(max(wave), 0), count(*) into v_best, v_flags
      from public.wave_runs
     where place = 'pirate_point' and flag_counted;
  end if;

  return jsonb_build_object(
    'status', 'done', 'loot', v_part.loot, 'balance', v_balance, 'survived', v_part.survived,
    'wave', v_run.wave, 'waveBest', v_best, 'flags', v_flags,
    'expired', v_part.expired, 'repeat', v_repeat, 'boss', v_boss
  );
end;
$$;
comment on function public.wave_finish(uuid, uuid, boolean, integer, integer, integer, integer, integer, integer, integer, integer) is
  'Finishes one participant in a frozen legacy tower-defense wave. Locks the payer wallet, changed island and recovery-state rows in UUID order, then the wave and participant. Protocol-2 waves return client_update_required; legacy timing, loot, boss, flags, restart and idempotent result behavior remain. Only service_role may run it.';

create or replace function public.island_walls_record(
  p_player_id uuid,
  p_wave_id   uuid,
  p_walls     jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner       uuid;
  v_starts_at   timestamptz;
  v_inserted    integer;
  v_now         timestamptz;
  v_policy      smallint;
  v_wave_owner  uuid;
  v_wave_place  text;
  v_wave_start  timestamptz;
begin
  if p_player_id is null or p_wave_id is null or p_walls is null
     or jsonb_typeof(p_walls) <> 'object'
     or exists (
       select 1 from jsonb_each(p_walls) entry
        where jsonb_typeof(entry.value) <> 'number'
           or entry.value::text !~ '^[0-9]{1,3}$'
           or entry.value::text::integer > 100
     ) then
    raise exception 'bad_walls';
  end if;

  select island_owner, place, starts_at
    into v_wave_owner, v_wave_place, v_wave_start
    from public.wave_runs where id = p_wave_id;
  if v_wave_owner is null or v_wave_place <> 'island' then
    return jsonb_build_object('status', 'skipped');
  end if;
  perform player_id from public.islands
   where player_id = v_wave_owner for update;
  if not found then
    return jsonb_build_object('status', 'skipped');
  end if;
  insert into public.island_recovery_state (island_owner)
  values (v_wave_owner) on conflict (island_owner) do nothing;
  select recovery_version into v_policy
    from public.island_recovery_state
   where island_owner = v_wave_owner for update;
  v_now := clock_timestamp();

  select island_owner, place, starts_at
    into v_owner, v_wave_place, v_starts_at
    from public.wave_runs where id = p_wave_id for update;
  if v_owner is distinct from v_wave_owner or v_wave_place <> 'island'
     or v_starts_at is distinct from v_wave_start then
    return jsonb_build_object('status', 'skipped');
  end if;
  if v_policy = 1 or exists (
    select 1 from public.recovery_wave_states where wave_id = p_wave_id
  ) then
    return jsonb_build_object('status', 'skipped');
  end if;
  if not exists (
    select 1 from public.wave_participants
     where wave_id = p_wave_id and player_id = p_player_id
  ) then
    return jsonb_build_object('status', 'skipped');
  end if;

  -- Stable row-lock order also makes a multi-wall report safe beside repairs.
  perform building.plot
    from public.islet_buildings building
   where building.player_id = v_owner
     and building.building_type = 'wall'
     and building.plot in (select key from jsonb_each(p_walls))
   order by building.plot
     for update;

  insert into public.island_wall_records (wave_id, island_owner, recorded_by)
  values (p_wave_id, v_owner, p_player_id)
  on conflict (wave_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('status', 'repeat');
  end if;

  update public.islet_buildings building
     set wall_health = entry.value::text::smallint,
         wall_damaged_at = case when entry.value::text::integer < 100 then v_now end
    from jsonb_each(p_walls) entry
   where building.player_id = v_owner
     and building.plot = entry.key
     and building.building_type = 'wall'
     and (building.wall_restored_at is null or building.wall_restored_at < v_starts_at);

  return jsonb_build_object('status', 'recorded');
end;
$$;
comment on function public.island_walls_record(uuid, uuid, jsonb) is
  'Records a legacy island wave wall report once after owner, recovery-state, wave and sorted wall locks. It skips all recovery-v1 writes and keeps the existing delayed-restore timestamp fence. Only service_role may run it.';

create or replace function public.island_wall_restore(
  p_player_id       uuid,
  p_island_owner    uuid,
  p_plot            text,
  p_action_uid      text,
  p_full_price      integer,
  p_recover_seconds integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ref      text;
  v_balance  bigint;
  v_building public.islet_buildings;
  v_price    integer;
  v_policy   smallint;
  v_now      timestamptz;
begin
  if p_player_id is null or p_island_owner is null or p_plot is null
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_full_price is null or p_full_price < 1
     or p_recover_seconds is null or p_recover_seconds < 1 then
    raise exception 'bad_restore';
  end if;
  v_ref := 'wallfix:' || p_action_uid;

  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  if exists (
    select 1 from public.wallet_transactions
     where player_id = p_player_id and reason = 'building_purchase' and ref = v_ref
  ) then
    return jsonb_build_object('status', 'done', 'balance', v_balance, 'price', 0, 'repeat', true);
  end if;

  perform player_id from public.islands where player_id = p_island_owner for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'not_built');
  end if;
  insert into public.island_recovery_state (island_owner)
  values (p_island_owner) on conflict (island_owner) do nothing;
  select recovery_version into v_policy
    from public.island_recovery_state
   where island_owner = p_island_owner for update;
  v_now := clock_timestamp();
  if v_policy = 1 then
    return jsonb_build_object(
      'status', 'refused', 'reason', 'client_update_required',
      'recoveryVersion', 1, 'waveProtocol', 2
    );
  end if;

  select * into v_building
    from public.islet_buildings
   where player_id = p_island_owner and plot = p_plot
     for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'not_built');
  end if;
  if v_building.building_type <> 'wall' then
    return jsonb_build_object('status', 'refused', 'reason', 'wrong_kind');
  end if;
  if exists (
    select 1 from public.wave_runs
     where island_owner = p_island_owner and finished_at is null
       and starts_at + make_interval(secs => maximum_seconds) >= v_now
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'wave_running');
  end if;
  if v_building.wall_health >= 100
     or (v_building.wall_damaged_at is not null
         and v_building.wall_damaged_at + make_interval(secs => p_recover_seconds) <= v_now) then
    return jsonb_build_object('status', 'refused', 'reason', 'intact');
  end if;

  v_price := greatest(1, ceil(p_full_price * (100 - v_building.wall_health) / 100.0)::integer);
  if v_balance < v_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', v_price);
  end if;

  v_balance := public.apply_wallet_transaction(p_player_id, -v_price, 'building_purchase', v_ref);
  update public.islet_buildings
     set wall_health = 100,
         wall_damaged_at = null,
         wall_restored_at = v_now
   where player_id = p_island_owner and plot = p_plot;

  return jsonb_build_object('status', 'done', 'balance', v_balance, 'price', v_price, 'repeat', false);
end;
$$;


comment on function public.island_wall_restore(uuid, uuid, text, text, integer, integer) is
  'Repairs a legacy wall between waves after locking the payer wallet, owner island and recovery-state row before the wall. Recovery-v1 policy returns client_update_required without writing legacy wall health; v0 price, timer, timestamp fence and retries remain. Only service_role may run it.';
