-- =============================================================================
-- 20261110020000_wave_crews.sql
--
-- WHAT IT DOES
--   Shared pirate waves (lane 0, task 0.4; decision D031): friends on an island
--   and everyone at Pirate Point fight the same wave, and every one of them gets
--   their own loot, not only the player who rang the bell.
--
--     wave_participants    one row per player in a wave: when they joined, and
--                          their own result and loot once they finished
--     wave_runs            gets the column flag_counted: whether the wave's one
--                          best-wave-and-flag was counted already
--
--     wave_start()         replaced (same signature): the bell-ringer is the
--                          first participant; Pirate Point's best wave counts
--                          flag_counted; the answer also says the place
--     wave_join()          joins a running wave; safe to repeat
--     wave_current()       the running wave of an island or of Pirate Point, or
--                          null, so a friend who sails in mid-wave can join
--     wave_finish()        replaced (one more parameter, the Pirate Point loot
--                          base): every participant finishes for themselves
--
-- WHO USES IT
--   Only the Python server, with the secret key (service_role): the routes
--   POST /api/waves/start, /join, /finish and GET /api/waves/current
--   (backend/server/island/waves.py). The browser never reads the new table:
--   row-level security on, no policy. Run it after
--   20261110010000_islands_and_waves.sql, which it builds on and does not edit.
--
-- THE RULES THAT THE DATABASE KEEPS
--   1. Play money only; coins move only through apply_wallet_transaction().
--   2. A player joins a wave only while it runs: nobody has finished it yet and
--      its maximum length has not passed. A repeated join changes nothing.
--   3. Every participant finishes once, for themselves, with their own loot
--      (reason pirate_loot, ref wave:<wave id>:<player id>). A repeat answers the
--      stored result and pays nothing. Someone who never joined cannot finish.
--   4. The first finish closes the wave run (finished_at and the first
--      finisher's result), so no new player can join and the island may ring its
--      next bell. The others still finish their own part until the maximum
--      length; after it they get 0.
--   5. The island's best wave and one flag are counted once per wave, at the
--      first survived finish (flag_counted). Pirate Point keeps its own best
--      wave and flag count the same way.
--   6. The loot of a survived wave is base + perWave * wave + perHouse * houses
--      on that island; on Pirate Point the base is p_point_loot_base and there
--      are no houses. The server passes the numbers (backend/content/islands.json).
--
-- WHAT IT NEEDS
--   Every earlier migration, in particular 20261110010000_islands_and_waves.sql
--   (islands, wave_runs, the reason pirate_loot).
--
-- SAFE TO RUN TWICE
--   The column and the table use "if not exists", the two backfills change only
--   rows that need it ("on conflict do nothing" and a "where" that a second run
--   no longer matches), the old wave_finish signature is dropped "if exists",
--   functions use "create or replace", and revokes, grants and comments repeat.
--
-- WHAT CHANGES FOR A RUNNING SERVER
--   The 7-argument wave_finish() of 20261110010000 is replaced by an 8-argument
--   one. A server from before this migration would get an error from
--   POST /api/waves/finish until the new server code is deployed; the flag
--   islands is off until then.
--
-- HOW THE FILE IS ORGANISED
--   1. wave_runs.flag_counted, backfilled
--   2. Table wave_participants, rights, backfilled with every bell-ringer
--   3. Function wave_start(), replaced
--   4. Function wave_join()
--   5. Function wave_current()
--   6. Function wave_finish(), replaced
--
-- HOW TO VERIFY (read-only queries, after applying)
--   a. select relrowsecurity from pg_class where relname = 'wave_participants';  -- true
--      select count(*) from pg_policies where tablename = 'wave_participants';   -- 0
--   b. Every wave has its bell-ringer as a participant (expect 0):
--        select count(*) from public.wave_runs r
--         where not exists (select 1 from public.wave_participants p
--                            where p.wave_id = r.id and p.player_id = r.started_by);
--   c. One wave_finish, with 8 arguments:
--        select pg_get_function_identity_arguments(oid) from pg_proc
--         where proname = 'wave_finish';
--   d. Only the server may run the functions (browser false, server true):
--        select p.proname,
--               has_function_privilege('authenticated', p.oid, 'execute') as browser,
--               has_function_privilege('service_role', p.oid, 'execute') as server
--          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--         where n.nspname = 'public'
--           and p.proname in ('wave_start', 'wave_join', 'wave_current', 'wave_finish');
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. wave_runs.flag_counted: the one best wave and flag of a wave
-- -----------------------------------------------------------------------------
-- Before this migration a survived finish counted the flag at once, so every
-- survived wave run has its flag counted already.

alter table public.wave_runs
  add column if not exists flag_counted boolean not null default false;

update public.wave_runs
   set flag_counted = true
 where survived and not flag_counted;

comment on column public.wave_runs.flag_counted is
  'True once the best wave and the flag of this wave were counted: at the first survived finish of any participant. Pirate Point counts its best wave and flags from these rows.';


-- -----------------------------------------------------------------------------
-- 2. Table wave_participants: every player in a wave and their own result
-- -----------------------------------------------------------------------------

create table if not exists public.wave_participants (
  wave_id     uuid not null references public.wave_runs (id) on delete cascade,
  player_id   uuid not null references public.profiles (id) on delete cascade,
  joined_at   timestamptz not null default now(),
  finished_at timestamptz,
  survived    boolean,
  ships_sunk  integer,
  loot        integer,
  expired     boolean not null default false,

  primary key (wave_id, player_id),
  -- The result is all there or all missing.
  constraint wave_participants_result_complete
    check (
      (finished_at is null) = (survived is null)
      and (finished_at is null) = (ships_sunk is null)
      and (finished_at is null) = (loot is null)
    ),
  constraint wave_participants_ships_sunk_range
    check (ships_sunk is null or ships_sunk between 0 and 1000),
  -- The biggest change the wallet allows (MAX_DELTA in backend/server/wallet.py).
  constraint wave_participants_loot_range
    check (loot is null or loot between 0 and 1000000),
  constraint wave_participants_expired_lost
    check (not expired or (survived = false and loot = 0))
);

-- A player's rows, also for the cascade when a player is deleted.
create index if not exists wave_participants_player_idx
  on public.wave_participants (player_id);

comment on table public.wave_participants is
  'One row per player in a pirate wave: the bell-ringer (from wave_start) and every friend or Pirate Point captain who joined (wave_join), with their own result and loot once they finished (wave_finish). No browser access.';
comment on column public.wave_participants.wave_id is
  'The wave. Deleting the wave run deletes the row.';
comment on column public.wave_participants.player_id is
  'The participant. With wave_id the primary key: one row per player and wave. Deleting the player deletes the row.';
comment on column public.wave_participants.joined_at is
  'When the player rang the bell or joined. Set by the database.';
comment on column public.wave_participants.finished_at is
  'When this player finished their part. Null while they have not.';
comment on column public.wave_participants.survived is
  'True if the island held, as this player''s browser reported it.';
comment on column public.wave_participants.ships_sunk is
  'Ships sunk, as this player''s browser reported it (0 to 1000). Shown only.';
comment on column public.wave_participants.loot is
  'Coins paid to this player for the wave (ledger ref wave:<wave id>:<player id>); 0 for a lost or late finish.';
comment on column public.wave_participants.expired is
  'True if the player finished after the maximum length of the wave and so got nothing.';

-- Row-level security on and no policy: no browser role sees a row.
--   anon, authenticated  nothing
--   service_role         read, insert (wave_start, wave_join), update (wave_finish); no delete
alter table public.wave_participants enable row level security;
revoke all on table public.wave_participants from public, anon, authenticated, service_role;
grant select, insert, update on table public.wave_participants to service_role;

-- Every wave so far has its bell-ringer as the one participant, with the result
-- the old wave_finish stored. Their loot was paid with the old ref wave:<id>, so
-- a finished row stays finished and is never paid again.
insert into public.wave_participants
  (wave_id, player_id, joined_at, finished_at, survived, ships_sunk, loot, expired)
select id, started_by, created_at, finished_at, survived, ships_sunk, loot, expired
  from public.wave_runs
on conflict (wave_id, player_id) do nothing;


-- -----------------------------------------------------------------------------
-- 3. Function wave_start(), replaced
-- -----------------------------------------------------------------------------
-- The same arguments and steps as in 20261110010000, with three changes:
--   * Pirate Point's best wave counts the waves with flag_counted,
--   * the bell-ringer becomes the first participant of a new wave (and of a
--     repeated one, if their row is missing), and
--   * the answer also says the place ("island" or "pirate_point").

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
  v_best   integer;
  v_repeat boolean := false;
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

  -- Step 2: one bell at a time per island.
  if p_place = 'island' then
    select wave_best into v_best
      from public.islands
     where player_id = p_island_owner
       for update;
    if not found then
      return jsonb_build_object('status', 'refused', 'reason', 'no_such_island');
    end if;
  else
    perform pg_advisory_xact_lock(hashtext('public.wave_runs:pirate_point'));
    select coalesce(max(wave), 0) into v_best
      from public.wave_runs
     where place = 'pirate_point' and flag_counted;
  end if;

  -- Step 3: the same click again is the same wave.
  select * into v_run
    from public.wave_runs
   where started_by = p_player_id and action_uid = p_action_uid;

  if found then
    v_repeat := true;
  else
    -- Step 4: a wave nobody finished is over after its maximum length.
    update public.wave_runs
       set finished_at = now(), survived = false, ships_sunk = 0, loot = 0, expired = true
     where coalesce(island_owner::text, place) = coalesce(p_island_owner::text, p_place)
       and finished_at is null
       and starts_at + make_interval(secs => maximum_seconds) < now();

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
      p_player_id, p_action_uid, p_place, p_island_owner, least(v_best + 1, p_highest_wave),
      p_seed, date_trunc('second', now()) + make_interval(secs => p_countdown_seconds),
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

revoke all on function public.wave_start(
  uuid, text, text, uuid, integer, integer, integer, integer, integer, text, numeric, numeric
) from public, anon, authenticated, service_role;
grant execute on function public.wave_start(
  uuid, text, text, uuid, integer, integer, integer, integer, integer, text, numeric, numeric
) to service_role;

comment on function public.wave_start(
  uuid, text, text, uuid, integer, integer, integer, integer, integer, text, numeric, numeric
) is
  'Starts a pirate wave on an island or on Pirate Point and makes the bell-ringer its first participant. Locks the island (or Pirate Point), answers a repeated player and actionUid with the same wave (repeat true), closes a running wave past its maximum length as expired, refuses while another wave runs there (wave_running) or when the island does not exist (no_such_island), and writes the next wave (best wave + 1, at most p_highest_wave) starting after the countdown. Returns {status: started, waveId, wave, seed, startsAt, weatherKind, ships, fog, place, repeat} or {status: refused, reason}. Raises bad_wave for a bad argument. Never moves coins. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 4. Function wave_join(): join a running wave
-- -----------------------------------------------------------------------------
-- It returns {"status": "joined", "waveId", "wave", "seed", "startsAt",
-- "weatherKind", "ships", "fog", "place", "repeat"} (repeat true for a player
-- who is in the wave already, also once it is over), or {"status": "refused",
-- "reason": "no_such_wave" | "wave_over" | "player_not_set_up"} with nothing
-- changed.

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
begin
  if p_player_id is null or p_wave_id is null then
    raise exception 'bad_wave_join';
  end if;

  -- The wave row first, so a join and the first finish run one after the other.
  select * into v_run from public.wave_runs where id = p_wave_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_wave');
  end if;

  if exists (
    select 1 from public.wave_participants
     where wave_id = p_wave_id and player_id = p_player_id
  ) then
    v_repeat := true;
  elsif v_run.finished_at is not null
     or now() > v_run.starts_at + make_interval(secs => v_run.maximum_seconds) then
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

revoke all on function public.wave_join(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.wave_join(uuid, uuid) to service_role;

comment on function public.wave_join(uuid, uuid) is
  'Adds a player to a running pirate wave (not finished by anyone yet, maximum length not passed). A player who is in the wave already gets it again with repeat true and nothing changes. Returns {status: joined, waveId, wave, seed, startsAt, weatherKind, ships, fog, place, repeat} or {status: refused, reason: no_such_wave, wave_over or player_not_set_up}. Raises bad_wave_join for a missing argument. Never moves coins. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 5. Function wave_current(): the running wave of an island or Pirate Point
-- -----------------------------------------------------------------------------
-- p_place 'island' with p_island_owner, or 'pirate_point' with null. Returns the
-- wave in the shape of wave_join() with status "running" (and no repeat), or
-- null when no wave runs there. Reads only.

create or replace function public.wave_current(
  p_place        text,
  p_island_owner uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_run public.wave_runs;
begin
  if p_place is null or p_place not in ('island', 'pirate_point')
     or (p_place = 'island') <> (p_island_owner is not null) then
    raise exception 'bad_wave_current';
  end if;

  select * into v_run
    from public.wave_runs
   where coalesce(island_owner::text, place) = coalesce(p_island_owner::text, p_place)
     and finished_at is null
     and now() <= starts_at + make_interval(secs => maximum_seconds)
   limit 1;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'status', 'running', 'waveId', v_run.id, 'wave', v_run.wave, 'seed', v_run.seed,
    'startsAt', v_run.starts_at, 'weatherKind', v_run.weather_kind,
    'ships', v_run.weather_ships, 'fog', v_run.weather_fog, 'place', v_run.place
  );
end;
$$;

revoke all on function public.wave_current(text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.wave_current(text, uuid) to service_role;

comment on function public.wave_current(text, uuid) is
  'The running pirate wave of an island (p_place island, p_island_owner) or of Pirate Point (pirate_point, null): {status: running, waveId, wave, seed, startsAt, weatherKind, ships, fog, place}, or null when none runs there. Raises bad_wave_current for a bad argument. Reads only. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 6. Function wave_finish(), replaced: every participant for themselves
-- -----------------------------------------------------------------------------
--   p_player_id         the verified participant
--   p_wave_id           the wave
--   p_survived          did the island hold (as this player's simulation says)
--   p_ships_sunk        ships sunk (as this player's browser says), 0 to 1000
--   p_loot_base, p_loot_per_wave, p_loot_per_house
--                       the loot rule of islands.json (10, 5, 5)
--   p_point_loot_base   the base on Pirate Point instead of p_loot_base (20)
--
-- In one transaction it:
--   1. checks the arguments (bad_wave_finish),
--   2. locks the player's wallet, then the wave, then the player's own row,
--   3. refuses a wave that does not exist (no_such_wave) or a player who is not
--      in it (not_in_wave),
--   4. answers a player who finished already with their stored result
--      ("repeat": true) and pays nothing,
--   5. refuses a finish before the minimum length (too_early, with waitSeconds),
--   6. gives 0 for a finish after the maximum length (expired),
--   7. otherwise works out this player's loot, stores their result, closes the
--      wave run with it if nobody finished before, counts the best wave and one
--      flag at the first survived finish (flag_counted), and pays the loot with
--      apply_wallet_transaction() (reason pirate_loot, ref wave:<id>:<player>).
--
-- It returns {"status": "done", "loot", "balance", "survived", "wave",
-- "waveBest", "flags", "expired", "repeat"} for this player (waveBest and flags
-- of the place of the wave), or {"status": "refused", "reason": ...} with
-- nothing changed.

drop function if exists public.wave_finish(uuid, uuid, boolean, integer, integer, integer, integer);

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
  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  select * into v_run from public.wave_runs where id = p_wave_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_wave');
  end if;

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
  elsif now() < v_run.starts_at + make_interval(secs => v_run.minimum_seconds) then
    -- Step 5: too early. Nothing changes; the wave keeps running.
    return jsonb_build_object(
      'status', 'refused', 'reason', 'too_early',
      'waitSeconds', greatest(1, ceil(extract(epoch from
        v_run.starts_at + make_interval(secs => v_run.minimum_seconds) - now()))::integer)
    );
  elsif now() > v_run.starts_at + make_interval(secs => v_run.maximum_seconds) then
    -- Step 6: too late. This player gets nothing; an open wave run is closed.
    update public.wave_participants
       set finished_at = now(), survived = false, ships_sunk = 0, loot = 0, expired = true
     where wave_id = p_wave_id and player_id = p_player_id
    returning * into v_part;
    update public.wave_runs
       set finished_at = now(), survived = false, ships_sunk = 0, loot = 0, expired = true
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
       set finished_at = now(), survived = p_survived, ships_sunk = p_ships_sunk, loot = v_loot
     where wave_id = p_wave_id and player_id = p_player_id
    returning * into v_part;

    -- The first finish closes the wave run: no new joins, the next bell may ring.
    if v_run.finished_at is null then
      update public.wave_runs
         set finished_at = now(), survived = p_survived, ships_sunk = p_ships_sunk, loot = v_loot
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

revoke all on function public.wave_finish(
  uuid, uuid, boolean, integer, integer, integer, integer, integer
) from public, anon, authenticated, service_role;
grant execute on function public.wave_finish(
  uuid, uuid, boolean, integer, integer, integer, integer, integer
) to service_role;

comment on function public.wave_finish(
  uuid, uuid, boolean, integer, integer, integer, integer, integer
) is
  'Finishes a pirate wave for one participant. Locks the wallet, the wave and the player''s row. A player who finished answers their stored result (repeat true, nothing paid). Refuses no_such_wave, not_in_wave (never joined) and too_early (with waitSeconds). After the maximum length the player gets 0 (expired). Otherwise their loot is the base (p_point_loot_base on Pirate Point) + p_loot_per_wave * wave + p_loot_per_house * houses for a survived wave and 0 for a lost one, paid with apply_wallet_transaction() (reason pirate_loot, ref wave:<id>:<player>). The first finish closes the wave run; the first survived finish counts the best wave and one flag (flag_counted). Returns {status: done, loot, balance, survived, wave, waveBest, flags, expired, repeat} or {status: refused, reason}. Only service_role may run it.';
