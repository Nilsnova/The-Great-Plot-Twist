-- =============================================================================
-- 20261112090000_house_roles.sql
--
-- WHAT IT DOES
--   The database part of the house roles (docs/GAME-V3.md, "Houses"): a house
--   keeps its loot bonus and, from level 2, picks one role on its card, free
--   and changeable between waves, like a tower skill (20261112060000_tech_hub.sql)
--   but with no research:
--     barracks   militia walk out of the house each wave and fight boarders
--     tavern     captains near it heal; helping a captain up costs 25% less
--     workshop   walls near it repair faster, and a broken one mends itself
--   Militia, healing and mending happen in every player's browser (the wave's
--   simulation, frontend/src/pirates/sim.js), from the role stored here.
--
--     islet_buildings      the check rule on spec also allows the three house
--                          roles on a house
--     island_specialise()  also takes p_branch house with a role, for a house of
--                          level 2 or more (no research); refused house_level
--                          below level 2
--     wave_revive()        25% off, rounded down, on an island with a Tavern
--
--   Nothing else changes: both functions are the ones of
--   20261112060000_tech_hub.sql and 20261112050000_captain_revive.sql, word for
--   word, except the lines marked in sections 2 and 3 (and one more sentence in
--   each comment). backend/server/tests/test_house_roles_match_migration.py
--   checks that.
--
-- WHY IT IS ISLAND-WIDE
--   A Tavern heals captains near it, but the server never knows where a captain
--   stands (positions live in the browsers' simulation). So the revive discount
--   is checked on the island's buildings: any house of level 2 or more on that
--   island with the role tavern. Two Taverns give the same 25% (the cap).
--   Wall repairs and rebuilds cost no coins (they are free inputs of the wave's
--   simulation), so the Workshop has nothing to discount here: it works only in
--   the simulation (faster repairs, a shorter rebuild, walls that mend).
--
-- WHO USES IT
--   Only the Python server, with the secret key (service_role): POST
--   /api/island/tower-skill (backend/server/routes/island.py) for the roles, and
--   POST /api/waves/revive (backend/server/routes/waves.py). The 25 repeats
--   backend/content/islands.json (revive.tavernPercent); a test keeps them equal.
--   No browser role gets anything new.
--
-- WHAT IT NEEDS
--   20261112050000_captain_revive.sql (wave_revive) and
--   20261112060000_tech_hub.sql (islet_buildings.spec, its check rule
--   islet_buildings_spec_fits_kind, island_specialise).
--
-- SAFE TO RUN TWICE
--   The check rule is dropped "if exists" first and added again; the functions
--   use "create or replace"; revokes, grants and comments repeat.
--
-- HOW THE FILE IS ORGANISED
--   1. The check rule on spec: the tower skills and the house roles
--   2. island_specialise(): a house of level 2 picks a role
--   3. wave_revive(): a Tavern takes 25% off
--
-- HOW TO VERIFY (read-only queries, after applying)
--   a. select pg_get_constraintdef(oid) from pg_constraint
--       where conname = 'islet_buildings_spec_fits_kind';  -- lists ('house', 'tavern') too
--   b. select spec, count(*) from public.islet_buildings
--       where building_type = 'house' group by spec;      -- null until a house picks a role
--   c. select position('house_level' in prosrc) > 0 from pg_proc
--       where proname = 'island_specialise';               -- true
--      select position('tavern' in prosrc) > 0 from pg_proc
--       where proname = 'wave_revive';                     -- true
--   d. Only the server may run them (browser and visitor false, server true):
--      select p.proname,
--             has_function_privilege('authenticated', p.oid, 'execute') as browser,
--             has_function_privilege('anon', p.oid, 'execute') as visitor,
--             has_function_privilege('service_role', p.oid, 'execute') as server
--        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'public' and p.proname in ('island_specialise', 'wave_revive');
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The check rule on spec: the tower skills and the house roles
-- -----------------------------------------------------------------------------
-- The name and the eleven tower pairs are the ones of 20261112060000_tech_hub.sql;
-- the house roles repeat frontend/src/campaign/houses.js and HOUSE_ROLES in
-- backend/server/island/catalogue.py (tests keep them equal). The level rule (a
-- role from level 2) is island_specialise()'s, so an upgrade never meets it.

alter table public.islet_buildings drop constraint if exists islet_buildings_spec_fits_kind;
alter table public.islet_buildings
  add constraint islet_buildings_spec_fits_kind check (
    spec is null or (building_type, spec) in (
      ('cannon', 'rapid'), ('cannon', 'heavy'), ('cannon', 'chain'),
      ('mortar', 'cluster'), ('mortar', 'fire_pot'), ('mortar', 'long_range'),
      ('wall', 'stone'), ('wall', 'spiked'), ('wall', 'quick_mend'),
      ('watchtower', 'spotter'), ('watchtower', 'signal_fire'),
      ('house', 'barracks'), ('house', 'tavern'), ('house', 'workshop')
    )
  );

comment on column public.islet_buildings.spec is
  'The tower skill this building picked at the Tech hub (docs/GAME-V3.md section 5), or a house''s role (barracks, tavern, workshop; docs/GAME-V3.md "Houses"), or null. Only island_specialise() sets it, and only to a skill of its own kind or, on a house of level 2 or more, a role.';


-- -----------------------------------------------------------------------------
-- 2. island_specialise(): a house of level 2 picks a role
-- -----------------------------------------------------------------------------
--   p_branch  the kind the skill belongs to, or house for a house role (the
--             server reads it from the spec); it must be the kind on the spot
--   p_spec    the skill, or barracks, tavern or workshop
--
-- Changed from 20261112060000_tech_hub.sql: the three (house, role) pairs in the
-- argument check, and "a house role needs level 2, not research".
-- Returns {status: done, plot, spec} or {status: refused, reason: no_island |
-- not_member | not_built | wrong_kind | not_researched | house_level}.

create or replace function public.island_specialise(
  p_player_id     uuid,
  p_island_owner  uuid,
  p_plot          text,
  p_branch        text,
  p_spec          text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_building public.islet_buildings;
begin
  if p_player_id is null or p_island_owner is null or p_plot is null
     or p_branch is null or p_spec is null
     or (p_branch, p_spec) not in (
       ('cannon', 'rapid'), ('cannon', 'heavy'), ('cannon', 'chain'),
       ('mortar', 'cluster'), ('mortar', 'fire_pot'), ('mortar', 'long_range'),
       ('wall', 'stone'), ('wall', 'spiked'), ('wall', 'quick_mend'),
       ('watchtower', 'spotter'), ('watchtower', 'signal_fire'),
       ('house', 'barracks'), ('house', 'tavern'), ('house', 'workshop')
     ) then
    raise exception 'bad_specialise';
  end if;

  -- The island row first, as every write to an island's buildings does.
  perform 1 from public.islands where player_id = p_island_owner for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_island');
  end if;
  if p_player_id <> p_island_owner and not exists (
    select 1 from public.island_members
     where island_owner = p_island_owner and player_id = p_player_id and left_at is null
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'not_member');
  end if;

  select * into v_building
    from public.islet_buildings
   where player_id = p_island_owner and plot = p_plot
     for update;
  if v_building.player_id is null then
    return jsonb_build_object('status', 'refused', 'reason', 'not_built');
  end if;
  if v_building.building_type <> p_branch then
    return jsonb_build_object('status', 'refused', 'reason', 'wrong_kind');
  end if;
  -- A house role (docs/GAME-V3.md "Houses") needs no research, only a house of level 2 or more.
  if p_branch = 'house' then
    if v_building.level < 2 then
      return jsonb_build_object('status', 'refused', 'reason', 'house_level');
    end if;
  elsif not exists (
    select 1 from public.island_research where island_owner = p_island_owner and branch = p_branch
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'not_researched');
  end if;

  update public.islet_buildings set spec = p_spec
   where player_id = p_island_owner and plot = p_plot;
  return jsonb_build_object('status', 'done', 'plot', p_plot, 'spec', p_spec);
end;
$$;

revoke all on function public.island_specialise(uuid, uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.island_specialise(uuid, uuid, text, text, text)
  to service_role;

comment on function public.island_specialise(uuid, uuid, text, text, text) is
  'The tower on p_plot of the island of p_island_owner picks the skill p_spec of its kind p_branch (no coins; picking another one changes it). Locks the island row, then the building. Refuses no_island, not_member (the caller is neither the host nor an active member), not_built, wrong_kind (another kind stands there), not_researched (the branch is not researched on that island) and house_level (a house role on a house below level 2), with nothing changed. A house of level 2 or more picks a role (barracks, tavern or workshop) with p_branch house and no research. The same pick again changes nothing. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 3. wave_revive(): a Tavern takes 25% off
-- -----------------------------------------------------------------------------
-- Changed from 20261112050000_captain_revive.sql: the Tavern block after the
-- price, nothing else. The discount comes before the coins are compared, so a
-- helper with exactly the lower price can pay.

create or replace function public.wave_revive(
  p_player_id   uuid,
  p_wave_id     uuid,
  p_fallen      text,
  p_down_at     integer,
  p_action_uid  text,
  p_base        integer,
  p_per_wave    integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_ref      text;
  v_balance  bigint;
  v_run      public.wave_runs;
  v_joined   public.wave_participants;
  v_done     public.captain_revives;
  v_price    integer;
  v_index    text;
begin
  if p_player_id is null or p_wave_id is null
     or p_fallen is null or p_fallen !~ '^[A-Za-z0-9_.:-]{1,64}$'
     or p_down_at is null or p_down_at < 0 or p_down_at > 100000
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_base is null or p_base < 1 or p_base > 1000
     or p_per_wave is null or p_per_wave < 0 or p_per_wave > 1000 then
    raise exception 'bad_wave_revive';
  end if;
  v_ref := 'revive:' || p_action_uid;

  -- The wallet first, as every paid action does.
  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  -- A repeated click answers what it paid.
  select * into v_done from public.captain_revives where player_id = p_player_id and ref = v_ref;
  if found then
    return jsonb_build_object('status', 'done', 'price', v_done.price, 'balance', v_balance, 'repeat', true);
  end if;

  -- The wave, read without a lock (the finish locks it; the wallet is held already).
  select * into v_run from public.wave_runs where id = p_wave_id;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_wave');
  end if;
  if v_run.place = 'island' and v_run.island_owner <> p_player_id and not exists (
    select 1 from public.island_members
     where island_owner = v_run.island_owner and player_id = p_player_id and left_at is null
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'not_member');
  end if;
  select * into v_joined from public.wave_participants where wave_id = p_wave_id and player_id = p_player_id;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'not_in_wave');
  end if;
  if v_joined.finished_at is not null
     or now() < v_run.starts_at
     or now() > v_run.starts_at + make_interval(secs => v_run.maximum_seconds) then
    return jsonb_build_object('status', 'refused', 'reason', 'wave_over');
  end if;

  v_price := p_base + p_per_wave * v_run.wave;
  -- A Tavern on the island (a house of level 2 or more with the role tavern,
  -- docs/GAME-V3.md "Houses") takes 25% off, rounded down. The server cannot
  -- see where the captains stand, so the discount is for the whole island.
  if v_run.place = 'island' and exists (
    select 1 from public.islet_buildings
     where player_id = v_run.island_owner and building_type = 'house'
       and spec = 'tavern' and level >= 2
  ) then
    v_price := v_price * (100 - 25) / 100;
  end if;
  if v_balance < v_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', v_price);
  end if;

  -- The fall first (rule 6): a helper who comes second waits here for the first
  -- one's commit, then is refused, before any coin moves.
  begin
    insert into public.captain_revives (player_id, ref, wave_id, fallen, down_at, price)
    values (p_player_id, v_ref, p_wave_id, p_fallen, p_down_at, v_price);
  exception when unique_violation then
    get stacked diagnostics v_index = constraint_name;
    if v_index <> 'captain_revives_one_per_fall' then
      raise;
    end if;
    return jsonb_build_object('status', 'refused', 'reason', 'already_up');
  end;
  v_balance := public.apply_wallet_transaction(p_player_id, -v_price, 'captain_revive', v_ref);

  return jsonb_build_object('status', 'done', 'price', v_price, 'balance', v_balance, 'repeat', false);
end;
$$;

revoke all on function public.wave_revive(uuid, uuid, text, integer, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.wave_revive(uuid, uuid, text, integer, text, integer, integer)
  to service_role;

comment on function public.wave_revive(uuid, uuid, text, integer, text, integer, integer) is
  'Pays for helping a fallen captain up in a pirate wave (docs/GAME-V3.md section 3): p_base + p_per_wave x the wave number, from the helper''s wallet (reason captain_revive, ref revive:<actionUid>). Locks the wallet first. Only a player in the wave who has not finished it, while it runs; on somebody else''s island only a member of that game. A repeated actionUid answers {status: done, repeat: true} with the price it paid. One fall (p_fallen at tick p_down_at) is paid for once: a second helper is refused already_up. Refuses player_not_set_up, no_such_wave, not_member, not_in_wave, wave_over, insufficient_funds and already_up, with nothing changed. Raises bad_wave_revive for a bad argument. On an island with a Tavern (a house of level 2 or more with the role tavern) the price is 25% less, rounded down. Only service_role may run it.';
