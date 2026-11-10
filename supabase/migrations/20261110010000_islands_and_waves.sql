-- =============================================================================
-- 20261110010000_islands_and_waves.sql
--
-- WHAT IT DOES
--   The database part of the new game loop (docs/PITCH.md, docs/BUILD-PLAN.md
--   section 3, lane 0 tasks 0.2 and 0.3): every player's own island with its
--   code, the new build spots, and the pirate waves with their loot.
--
--   It adds two tables, three functions and three wallet reasons, and it
--   replaces one check rule of islet_buildings:
--
--     islands            one row per player who opened their island: the island
--                        code (5 symbols, shown as ISLE-<code>), the best wave
--                        survived and the number of pirate flags
--     wave_runs          one row per wave a player started: where (an island or
--                        Pirate Point), the wave number, the seed, when it
--                        starts, the weather, and how it ended
--
--     island_open()      makes a player's island with its code, once, and pays
--                        a brand-new player the starting coins (reason
--                        starting_coins), once
--     wave_start()       starts one wave on an island or on Pirate Point; one
--                        running wave per island; safe to repeat (actionUid)
--     wave_finish()      ends a wave: checks the timing, caps the loot, pays it
--                        (reason pirate_loot) and counts the best wave and the
--                        flags; safe to repeat (the wave id)
--
--     wallet reasons     pirate_loot (earn), starting_coins (earn) and
--                        fresh_start (either, used only by the admin script
--                        scripts/admin/fresh_start.sql)
--
--     islet_buildings    the check rule islet_buildings_plot_fits_building now
--                        also allows the new spots: wall_1..wall_4 (wall),
--                        cannon_1..cannon_4 (cannon), tower_1 (watchtower),
--                        house_1, house_2 (house). The four old pairs stay, so
--                        every existing row still passes. The cabin stands from
--                        the start and still has no row.
--
-- WHO USES IT
--   Only the Python server, with the secret key (service_role): the routes
--   GET /api/island, POST /api/island/build, GET /api/island/visit/{code},
--   POST /api/waves/start and POST /api/waves/finish (backend/server/island/).
--   A build on the new spots goes through the existing islet_build() of
--   20261106070000_home_islet.sql with a timber price of 0: coins only. The
--   browser never reads the two new tables: they have row-level security and no
--   policy (the island answers come from the server). Run it after every earlier
--   migration.
--
-- THE RULES THAT THE DATABASE KEEPS
--   1. Play money only. Coins cannot be bought, cashed out or exchanged for real
--      prizes. Coins move only through apply_wallet_transaction().
--   2. An island code is 5 symbols of ABCDEFGHJKMNPQRSTUVWXYZ23456789 (no 0, O,
--      1, I, L), unique, and it never changes. The server makes it from a secure
--      random source; the database only checks it and keeps it unique.
--   3. The starting coins are paid once per player (fixed ref starting_coins),
--      and only to a player whose wallet never moved (no ledger row at all). A
--      player who got coins any other way (an entry kit, the fresh start) gets
--      nothing here.
--   4. One running wave per island and one on Pirate Point. A wave that was
--      never finished counts as running until its maximum length has passed;
--      then the next start closes it (expired, no loot).
--   5. The same player and actionUid start one wave only; a repeat answers with
--      the same wave. A wave is finished once; a repeat answers with the stored
--      result and pays nothing more (ledger ref wave:<wave id>).
--   6. Only the player who started a wave may finish it. A finish before the
--      wave's minimum length is refused and changes nothing. A finish after its
--      maximum length pays nothing.
--   7. The loot of a survived wave is base + perWave * wave + perHouse *
--      houses (houses on the island the wave was fought on; none on Pirate
--      Point). The server passes the three numbers (backend/content/islands.json:
--      10, 5 and 5); a lost wave pays 0.
--   8. Someone who is not signed in (role "anon"), and every browser role, gets
--      nothing at all from the new tables and functions.
--
-- WHAT IT NEEDS
--   The earlier migrations: profiles, wallets, wallet_reasons,
--   wallet_transactions and apply_wallet_transaction() (foundation),
--   islet_buildings and islet_build() (home islet). PostgreSQL 13 or newer for
--   gen_random_uuid().
--
-- SAFE TO RUN TWICE
--   Tables and indexes use "if not exists", the wallet reasons "on conflict do
--   nothing", functions "create or replace", the replaced check rule is dropped
--   with "if exists" before it is added again, and revokes, grants and comments
--   simply repeat. A second run changes nothing.
--
-- HOW THE FILE IS ORGANISED
--   1. Three wallet reasons
--   2. The new spots in islet_buildings
--   3. Table islands, rights
--   4. Table wave_runs, rights
--   5. Function island_open()
--   6. Function wave_start()
--   7. Function wave_finish()
--
-- HOW TO VERIFY (read-only queries, after applying)
--   a. The new tables have RLS on and no policy:
--        select relname, relrowsecurity from pg_class
--         where relname in ('islands', 'wave_runs');                    -- both true
--        select count(*) from pg_policies
--         where tablename in ('islands', 'wave_runs');                  -- 0
--   b. The three reasons are there:
--        select reason, direction from public.wallet_reasons
--         where reason in ('pirate_loot', 'starting_coins', 'fresh_start');
--   c. The check rule names all 15 pairs:
--        select pg_get_constraintdef(oid) from pg_constraint
--         where conname = 'islet_buildings_plot_fits_building';
--   d. Only the server may run the new functions (browser and visitor false):
--        select p.proname,
--               has_function_privilege('authenticated', p.oid, 'execute') as browser,
--               has_function_privilege('anon', p.oid, 'execute') as visitor,
--               has_function_privilege('service_role', p.oid, 'execute') as server
--          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--         where n.nspname = 'public'
--           and p.proname in ('island_open', 'wave_start', 'wave_finish');
--   e. The browser roles cannot read the new tables (all false):
--        select has_table_privilege('authenticated', 'public.islands', 'select'),
--               has_table_privilege('authenticated', 'public.wave_runs', 'select'),
--               has_table_privilege('anon', 'public.islands', 'select');
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Three wallet reasons
-- -----------------------------------------------------------------------------
-- The same pairs, in the same order, end WALLET_REASONS in
-- backend/server/wallet.py (a test compares them).

insert into public.wallet_reasons (reason, direction, description) values
  ('pirate_loot',    'earn',   'Loot for surviving a pirate wave, capped by the wave number and the houses.'),
  ('starting_coins', 'earn',   'The starting coins of a brand-new captain, paid once when their island opens.'),
  ('fresh_start',    'either', 'Sets a wallet to the new starting coins in the fresh start of the redesign.')
on conflict (reason) do nothing;


-- -----------------------------------------------------------------------------
-- 2. The new spots in islet_buildings
-- -----------------------------------------------------------------------------
-- The buildings of the new island live in the same table as the home islet:
-- one row per building, the primary key (player_id, plot) allows one building
-- per spot, and islet_build() writes the row together with the coins. The list
-- of pairs repeats backend/content/buildings.json (the four old pairs) and
-- backend/content/islands.json (the eleven new ones); a test keeps them equal.
-- Every existing row has one of the four old pairs, so the new rule accepts it.

alter table public.islet_buildings
  drop constraint if exists islet_buildings_plot_fits_building;

alter table public.islet_buildings
  add constraint islet_buildings_plot_fits_building
    check ((plot, building_type) in (
      ('plot_2', 'workshop'),
      ('plot_3', 'windmill'),
      ('plot_4', 'greenhouse'),
      ('islet_signal_station', 'signal_station'),
      ('wall_1', 'wall'),
      ('wall_2', 'wall'),
      ('wall_3', 'wall'),
      ('wall_4', 'wall'),
      ('cannon_1', 'cannon'),
      ('cannon_2', 'cannon'),
      ('cannon_3', 'cannon'),
      ('cannon_4', 'cannon'),
      ('tower_1', 'watchtower'),
      ('house_1', 'house'),
      ('house_2', 'house')
    ));

comment on constraint islet_buildings_plot_fits_building on public.islet_buildings is
  'Each spot holds only its own kind of building: the four home islet pairs (buildings.json) and the eleven island spots (islands.json: wall_1..4 wall, cannon_1..4 cannon, tower_1 watchtower, house_1..2 house). The cabin has no row.';


-- -----------------------------------------------------------------------------
-- 3. Table islands: the island code, the best wave and the flags
-- -----------------------------------------------------------------------------
-- One row per player, made by island_open() the first time the player (or a
-- route for them) opens their island. The code is what a friend types to sail
-- over; it is stored without the ISLE- prefix the screens show.

create table if not exists public.islands (
  player_id   uuid primary key references public.profiles (id) on delete cascade,
  code        text not null,
  wave_best   integer not null default 0,
  flags       integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- 5 symbols without 0, O, 1, I and L, like the class code.
  constraint islands_code_format
    check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$'),
  constraint islands_wave_best_not_negative
    check (wave_best >= 0),
  constraint islands_flags_not_negative
    check (flags >= 0)
);

-- Two islands never share a code. Also makes "find the island with this code" fast.
create unique index if not exists islands_code_unique
  on public.islands (code);

-- Whenever the best wave or the flags change, stamp updated_at with the server time.
create or replace trigger islands_touch_updated_at
  before insert or update on public.islands
  for each row execute function public.touch_updated_at();

comment on table public.islands is
  'One row per player who opened their island: the island code friends use to visit, the best wave survived there and the pirate flags won. Made by island_open(); the best wave and the flags change only in wave_finish(). No browser access: the server answers GET /api/island and the visit route.';
comment on column public.islands.player_id is
  'The player who owns the island. Also the primary key: one island per player. Deleting the player deletes the island.';
comment on column public.islands.code is
  'The island code: 5 symbols of ABCDEFGHJKMNPQRSTUVWXYZ23456789, shown as ISLE-<code>. Unique, made once by the server, never changed. Not a secret: it only lets another player look at the island and defend it.';
comment on column public.islands.wave_best is
  'The highest wave survived on this island, 0 before the first. The next wave on the island is wave_best + 1.';
comment on column public.islands.flags is
  'Pirate flags on the flagpole: one for every wave survived on this island.';
comment on column public.islands.created_at is
  'When the island was opened. Set by the database.';
comment on column public.islands.updated_at is
  'When the best wave or the flags last changed. Set by the database.';

-- Row-level security on and no policy: no browser role sees a row.
--   anon, authenticated  nothing
--   service_role         read, insert (island_open), update (wave_finish); no delete
alter table public.islands enable row level security;
revoke all on table public.islands from public, anon, authenticated, service_role;
grant select, insert, update on table public.islands to service_role;


-- -----------------------------------------------------------------------------
-- 4. Table wave_runs: every wave a player started
-- -----------------------------------------------------------------------------
-- One row per started wave. place says where: 'island' (island_owner names
-- whose island) or 'pirate_point' (the shared island, island_owner is null).
-- The row is written by wave_start() and completed once by wave_finish(); the
-- columns of the result (finished_at, survived, ships_sunk, loot) are all empty
-- while the wave runs and all set after it.

create table if not exists public.wave_runs (
  id               uuid primary key default gen_random_uuid(),
  started_by       uuid not null references public.profiles (id) on delete cascade,
  action_uid       text not null,
  place            text not null,
  island_owner     uuid references public.islands (player_id) on delete cascade,
  wave             integer not null,
  seed             integer not null,
  starts_at        timestamptz not null,
  minimum_seconds  integer not null,
  maximum_seconds  integer not null,
  weather_kind     text not null,
  weather_ships    numeric(3, 2) not null,
  weather_fog      numeric(3, 2) not null,
  finished_at      timestamptz,
  survived         boolean,
  ships_sunk       integer,
  loot             integer,
  expired          boolean not null default false,
  created_at       timestamptz not null default now(),

  constraint wave_runs_place_allowed
    check (place in ('island', 'pirate_point')),
  -- An island wave names its island; a Pirate Point wave names none.
  constraint wave_runs_owner_fits_place
    check ((place = 'island') = (island_owner is not null)),
  constraint wave_runs_action_uid_format
    check (action_uid ~ '^[A-Za-z0-9_-]{8,64}$'),
  constraint wave_runs_wave_range
    check (wave between 1 and 1000),
  -- A seed fits a JavaScript number without loss.
  constraint wave_runs_seed_range
    check (seed >= 0),
  constraint wave_runs_timing_range
    check (minimum_seconds between 0 and maximum_seconds and maximum_seconds <= 86400),
  constraint wave_runs_weather_kind_allowed
    check (weather_kind in ('storm', 'fog', 'rain', 'calm')),
  constraint wave_runs_weather_ships_range
    check (weather_ships between 0.5 and 3),
  constraint wave_runs_weather_fog_range
    check (weather_fog between 0 and 1),
  -- The result is all there or all missing.
  constraint wave_runs_result_complete
    check (
      (finished_at is null) = (survived is null)
      and (finished_at is null) = (ships_sunk is null)
      and (finished_at is null) = (loot is null)
    ),
  constraint wave_runs_ships_sunk_range
    check (ships_sunk is null or ships_sunk between 0 and 1000),
  -- The biggest change the wallet allows (MAX_DELTA in backend/server/wallet.py).
  constraint wave_runs_loot_range
    check (loot is null or loot between 0 and 1000000),
  -- Only a lost wave can have expired.
  constraint wave_runs_expired_lost
    check (not expired or (survived = false and loot = 0))
);

-- One wave per player and actionUid: a repeated start is the same wave.
create unique index if not exists wave_runs_one_per_action
  on public.wave_runs (started_by, action_uid);

-- One running wave per island, and one on Pirate Point. wave_start() takes a
-- lock first and asks; this index is the lock that cannot be passed.
create unique index if not exists wave_runs_one_running_per_island
  on public.wave_runs ((coalesce(island_owner::text, place)))
  where finished_at is null;

-- The best survived wave of Pirate Point, and the cascade from an island owner.
create index if not exists wave_runs_survived_by_place
  on public.wave_runs (place, wave)
  where survived;
create index if not exists wave_runs_island_owner_idx
  on public.wave_runs (island_owner);

comment on table public.wave_runs is
  'One row per pirate wave a player started, on an island or on Pirate Point: the wave number, the seed every client feeds into the same simulation, when it starts, the weather, and the result once it was finished. Written only by wave_start() and wave_finish(). No browser access.';
comment on column public.wave_runs.id is
  'The wave id the browser sends back to finish the wave. The ledger ref of the loot is wave:<id>.';
comment on column public.wave_runs.started_by is
  'The player who rang the bell. Only they may finish the wave, and the loot is theirs. Deleting the player deletes the row.';
comment on column public.wave_runs.action_uid is
  'The id the browser made for the click on the bell (8 to 64 letters, digits, hyphens or underscores). One wave per player and actionUid.';
comment on column public.wave_runs.place is
  'Where the wave is fought: island (the island of island_owner) or pirate_point (the shared island).';
comment on column public.wave_runs.island_owner is
  'The owner of the island the wave is fought on; null on Pirate Point. Deleting that island deletes the row.';
comment on column public.wave_runs.wave is
  'The wave number, from 1: the best wave of the place plus one, at most the highest wave of islands.json.';
comment on column public.wave_runs.seed is
  'The random seed of the wave simulation (frontend/src/pirates/sim.js), made by the server, from 0 to 2147483647.';
comment on column public.wave_runs.starts_at is
  'When the ships come: the moment of the start plus the 10-second countdown, in whole seconds.';
comment on column public.wave_runs.minimum_seconds is
  'A finish earlier than starts_at plus this many seconds is refused.';
comment on column public.wave_runs.maximum_seconds is
  'After starts_at plus this many seconds the wave is over: a finish then pays nothing, and the next start closes the wave as expired.';
comment on column public.wave_runs.weather_kind is
  'The real weather state at the start: storm, fog, rain or calm (calm when the weather could not be read).';
comment on column public.wave_runs.weather_ships is
  'How many ships compared with calm weather: 1.5 in a storm, otherwise 1.';
comment on column public.wave_runs.weather_fog is
  'How much fog hides the ships, 0 to 1: 0.4 in fog, otherwise 0.';
comment on column public.wave_runs.finished_at is
  'When the wave was finished or closed as expired. Null while it runs.';
comment on column public.wave_runs.survived is
  'True if the island held, as the browser reported it. Null while the wave runs.';
comment on column public.wave_runs.ships_sunk is
  'Ships sunk, as the browser reported it (0 to 1000). Shown only; it does not change the loot.';
comment on column public.wave_runs.loot is
  'Coins paid for the wave: the cap of section 7 for a survived wave, 0 for a lost or expired one.';
comment on column public.wave_runs.expired is
  'True if the wave was closed because nobody finished it within its maximum length.';
comment on column public.wave_runs.created_at is
  'When the bell was rung. Set by the database.';

-- Row-level security on and no policy: no browser role sees a row.
--   anon, authenticated  nothing
--   service_role         read, insert (wave_start), update (wave_finish and the
--                        expiry in wave_start); no delete
-- The id is a uuid with a default, not an identity column: there is no counter.
alter table public.wave_runs enable row level security;
revoke all on table public.wave_runs from public, anon, authenticated, service_role;
grant select, insert, update on table public.wave_runs to service_role;


-- -----------------------------------------------------------------------------
-- 5. Function island_open(): the island and the starting coins, once
-- -----------------------------------------------------------------------------
--   p_player_id       the verified player
--   p_code            a new code the server made (5 symbols); used only when the
--                     player has no island yet
--   p_starting_coins  the starting coins of islands.json (100)
--
-- In one transaction it locks the profile row (FOR NO KEY UPDATE, the same lock
-- grant_entry_kit() takes first) and the wallet, makes the island if there is
-- none, and pays the starting coins if the wallet never moved.
--
-- It returns:
--   {"status": "open", "code", "waveBest", "flags", "created": true or false,
--    "paid": 0 or the starting coins}
--   {"status": "missing"}     the player has no profile or no wallet
--   {"status": "code_taken"}  another island has this code; nothing changed.
--                             The server tries again with a new code.
-- A missing or malformed argument raises bad_island.

create or replace function public.island_open(
  p_player_id      uuid,
  p_code           text,
  p_starting_coins bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_island  public.islands;
  v_created boolean := false;
  v_paid    bigint := 0;
begin
  if p_player_id is null
     or p_code is null or p_code !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$'
     or p_starting_coins is null or p_starting_coins < 1 or p_starting_coins > 1000000 then
    raise exception 'bad_island';
  end if;

  -- Two first visits of one player run one after the other.
  perform 1 from public.profiles where id = p_player_id for no key update;
  if not found then
    return jsonb_build_object('status', 'missing');
  end if;
  perform 1 from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'missing');
  end if;

  select * into v_island from public.islands where player_id = p_player_id;
  if not found then
    if exists (select 1 from public.islands where code = p_code) then
      return jsonb_build_object('status', 'code_taken');
    end if;
    insert into public.islands (player_id, code)
    values (p_player_id, p_code)
    returning * into v_island;
    v_created := true;
  end if;

  -- The starting coins: only for a wallet that never moved, and only once.
  if not exists (select 1 from public.wallet_transactions where player_id = p_player_id) then
    perform public.apply_wallet_transaction(
      p_player_id, p_starting_coins, 'starting_coins', 'starting_coins'
    );
    v_paid := p_starting_coins;
  end if;

  return jsonb_build_object(
    'status', 'open', 'code', v_island.code, 'waveBest', v_island.wave_best,
    'flags', v_island.flags, 'created', v_created, 'paid', v_paid
  );
end;
$$;

revoke all on function public.island_open(uuid, text, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.island_open(uuid, text, bigint) to service_role;

comment on function public.island_open(uuid, text, bigint) is
  'Opens a player''s island: makes the islands row with p_code if the player has none (status code_taken when another island has that code, nothing changed), and pays p_starting_coins once (reason starting_coins, ref starting_coins) to a player whose wallet never moved. Returns {status: open, code, waveBest, flags, created, paid} or {status: missing}. Raises bad_island for a bad argument. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 6. Function wave_start(): ring the bell
-- -----------------------------------------------------------------------------
--   p_player_id          the verified player who rang the bell
--   p_action_uid         the id the browser made for the click
--   p_place              'island' or 'pirate_point'
--   p_island_owner       whose island ('island' only; null for Pirate Point)
--   p_seed               a random seed the server made (used for a new wave only)
--   p_countdown_seconds  the countdown before the ships come (10)
--   p_minimum_seconds    the shortest finish after the countdown (15)
--   p_maximum_seconds    when an unfinished wave is over (900)
--   p_highest_wave       the highest wave number (50)
--   p_weather_kind, p_weather_ships, p_weather_fog
--                        the weather at the start, worked out by the server
--
-- In one transaction it:
--   1. checks the arguments (bad_wave),
--   2. locks the island row, or for Pirate Point a transaction lock of its own,
--      so two bells on one island ring one after the other,
--   3. answers a repeated actionUid with the same wave ("repeat": true),
--   4. closes a running wave that is past its maximum length (expired, no loot),
--   5. refuses while another wave runs there (wave_running),
--   6. works out the wave number: the best wave of the place plus one, at most
--      p_highest_wave, and
--   7. writes the wave.
--
-- It returns {"status": "started", "waveId", "wave", "seed", "startsAt",
-- "weatherKind", "ships", "fog", "repeat"} or {"status": "refused", "reason":
-- "no_such_island" | "wave_running"} with nothing changed.

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
  v_run  public.wave_runs;
  v_best integer;
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
     where place = 'pirate_point' and survived;
  end if;

  -- Step 3: the same click again is the same wave.
  select * into v_run
    from public.wave_runs
   where started_by = p_player_id and action_uid = p_action_uid;
  if found then
    return jsonb_build_object(
      'status', 'started', 'waveId', v_run.id, 'wave', v_run.wave, 'seed', v_run.seed,
      'startsAt', v_run.starts_at, 'weatherKind', v_run.weather_kind,
      'ships', v_run.weather_ships, 'fog', v_run.weather_fog, 'repeat', true
    );
  end if;

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

  return jsonb_build_object(
    'status', 'started', 'waveId', v_run.id, 'wave', v_run.wave, 'seed', v_run.seed,
    'startsAt', v_run.starts_at, 'weatherKind', v_run.weather_kind,
    'ships', v_run.weather_ships, 'fog', v_run.weather_fog, 'repeat', false
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
  'Starts a pirate wave on an island or on Pirate Point. Locks the island (or Pirate Point), answers a repeated player and actionUid with the same wave (repeat true), closes a running wave past its maximum length as expired, refuses while another wave runs there (wave_running) or when the island does not exist (no_such_island), and writes the next wave (best wave + 1, at most p_highest_wave) starting after the countdown. Returns {status: started, waveId, wave, seed, startsAt, weatherKind, ships, fog, repeat} or {status: refused, reason}. Raises bad_wave for a bad argument. Never moves coins. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 7. Function wave_finish(): the result and the loot
-- -----------------------------------------------------------------------------
--   p_player_id       the verified player who finishes the wave
--   p_wave_id         the wave from wave_start()
--   p_survived        did the island hold (as the browser's simulation says)
--   p_ships_sunk      ships sunk (as the browser says), 0 to 1000
--   p_loot_base, p_loot_per_wave, p_loot_per_house
--                     the loot rule of islands.json (10, 5, 5)
--
-- In one transaction it:
--   1. checks the arguments (bad_wave_finish),
--   2. locks the player's wallet (always the wallet first, as in every money
--      function) and then the wave,
--   3. refuses a wave that does not exist or that another player started,
--   4. answers a wave that is finished already with its stored result
--      ("repeat": true) and pays nothing,
--   5. refuses a finish before the minimum length (too_early, with waitSeconds),
--   6. pays nothing for a finish after the maximum length (expired),
--   7. otherwise works out the loot (survived: base + perWave * wave + perHouse
--      * houses on that island; lost: 0), stores the result, adds the best wave
--      and a flag to the island of a survived wave, and pays the loot with
--      apply_wallet_transaction() (reason pirate_loot, ref wave:<id>).
--
-- It returns {"status": "done", "loot", "balance", "survived", "wave",
-- "waveBest", "flags", "expired", "repeat"}, where waveBest and flags belong to
-- the place of the wave (Pirate Point: its best survived wave and the number of
-- survived waves), or {"status": "refused", "reason": "player_not_set_up" |
-- "no_such_wave" | "not_your_wave" | "too_early"} with nothing changed.

create or replace function public.wave_finish(
  p_player_id      uuid,
  p_wave_id        uuid,
  p_survived       boolean,
  p_ships_sunk     integer,
  p_loot_base      integer,
  p_loot_per_wave  integer,
  p_loot_per_house integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_run     public.wave_runs;
  v_houses  integer := 0;
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
     or p_loot_per_house is null or p_loot_per_house < 0 then
    raise exception 'bad_wave_finish';
  end if;

  -- Step 2: the wallet first, then the wave.
  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  select * into v_run from public.wave_runs where id = p_wave_id for update;

  -- Step 3: only the player who rang the bell.
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_wave');
  end if;
  if v_run.started_by <> p_player_id then
    return jsonb_build_object('status', 'refused', 'reason', 'not_your_wave');
  end if;

  if v_run.finished_at is not null then
    -- Step 4: finished already; the stored result stands.
    v_repeat := true;
    v_loot := v_run.loot;
  elsif now() < v_run.starts_at + make_interval(secs => v_run.minimum_seconds) then
    -- Step 5: too early. Nothing changes; the wave keeps running.
    return jsonb_build_object(
      'status', 'refused', 'reason', 'too_early',
      'waitSeconds', greatest(1, ceil(extract(epoch from
        v_run.starts_at + make_interval(secs => v_run.minimum_seconds) - now()))::integer)
    );
  elsif now() > v_run.starts_at + make_interval(secs => v_run.maximum_seconds) then
    -- Step 6: too late. The wave is closed as expired and pays nothing.
    update public.wave_runs
       set finished_at = now(), survived = false, ships_sunk = 0, loot = 0, expired = true
     where id = v_run.id
    returning * into v_run;
  else
    -- Step 7: the loot, capped by the wave number and the houses.
    if p_survived then
      if v_run.place = 'island' then
        select count(*) into v_houses
          from public.islet_buildings
         where player_id = v_run.island_owner and building_type = 'house';
      end if;
      v_loot := p_loot_base + p_loot_per_wave * v_run.wave + p_loot_per_house * v_houses;
    end if;

    update public.wave_runs
       set finished_at = now(), survived = p_survived, ships_sunk = p_ships_sunk, loot = v_loot
     where id = v_run.id
    returning * into v_run;

    if p_survived and v_run.place = 'island' then
      update public.islands
         set wave_best = greatest(wave_best, v_run.wave), flags = flags + 1
       where player_id = v_run.island_owner;
    end if;

    if v_loot > 0 then
      v_balance := public.apply_wallet_transaction(
        p_player_id, v_loot, 'pirate_loot', 'wave:' || v_run.id::text
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
     where place = 'pirate_point' and survived;
  end if;

  return jsonb_build_object(
    'status', 'done', 'loot', v_loot, 'balance', v_balance, 'survived', v_run.survived,
    'wave', v_run.wave, 'waveBest', v_best, 'flags', v_flags,
    'expired', v_run.expired, 'repeat', v_repeat
  );
end;
$$;

revoke all on function public.wave_finish(uuid, uuid, boolean, integer, integer, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.wave_finish(uuid, uuid, boolean, integer, integer, integer, integer)
  to service_role;

comment on function public.wave_finish(uuid, uuid, boolean, integer, integer, integer, integer) is
  'Finishes a pirate wave for the player who started it. Locks the wallet, then the wave. A finished wave answers with its stored result (repeat true, nothing paid). Refuses before the minimum length (too_early with waitSeconds), a missing wave (no_such_wave) and a wave of another player (not_your_wave). After the maximum length the wave is closed as expired with loot 0. Otherwise the loot is p_loot_base + p_loot_per_wave * wave + p_loot_per_house * houses for a survived wave and 0 for a lost one, paid with apply_wallet_transaction() (reason pirate_loot, ref wave:<id>); a survived island wave raises the island best wave and adds a flag. Returns {status: done, loot, balance, survived, wave, waveBest, flags, expired, repeat} or {status: refused, reason}. Only service_role may run it.';
