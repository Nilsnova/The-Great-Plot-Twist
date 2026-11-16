-- =============================================================================
-- apply-2026-11-16.sql: the pending migrations of branch integ/owner-0116, in one paste
-- =============================================================================
--
-- WHAT IT DOES
--   Applies, in timestamp order and inside one transaction, the three migrations
--   on the branch that are not applied live yet, then registers each version in
--   supabase_migrations.schema_migrations (so `supabase db push` / the migration
--   list see them as applied). The migration texts below are byte-for-byte the
--   files in supabase/migrations/ (md5 of each file listed here).
--
--     20261115160000_tower_obstacles.sql
--         T35 (#84): allow the wave rule name tower_obstacles
--         md5 af6507396fa2c3b131e7c89c2a58a035
--     20261116070000_island_fresh_start.sql
--         T53: island_resets table, island_fresh_start(), delete grants
--         md5 02bbd5dbb6ea6efea34618171a947fd8
--     20261116160000_ship_fire_rule.sql
--         T50: allow the wave rule name ship_fire (final list of all six names)
--         md5 45993c2951f1b055fcc68fa1ea985889
--
--   Live before this file (already applied and registered, NOT repeated here):
--   up to 20261114140000_culverin, 20261115120000_bigger_stakes,
--   20261115130000_tower_skill_price, 20261115140000_guard_crew,
--   20261115150000_wall_restore_record_fence, 20261116020000_tower_trees,
--   20261116020100_swivel_spot_rule, 20261116040000_boat_games,
--   20261116100000_leaderboard_query.
--
-- DROP / DELETE IN THIS FILE
--   * 20261115160000 and 20261116160000: `alter table public.wave_rules drop
--     constraint if exists wave_rules_known_names` and add it again, wider, in the
--     same transaction (no row is touched; the table is never without the rule).
--     The final check rule allows: tower_health, pathing, tower_obstacles, rescue,
--     defenses_v2, ship_fire (= SIM_RULES in backend/server/island/wave_rules.py).
--   * 20261116070000: NO drop and NO delete runs when you apply it. It GRANTS
--     delete on island_research, island_layout, arsenal_moves, arsenal_copies,
--     island_wall_records, wave_rules and wave_runs to service_role, and creates
--     the function island_fresh_start() whose body deletes ONE owner's island rows
--     when the server calls it (Settings > Reset my island). Nothing is deleted
--     until a player resets their own island.
--
-- SAFE TO RUN AGAIN
--   Every part is idempotent (if not exists / create or replace / drop constraint
--   if exists + add / repeated grants and comments); the registration uses
--   on conflict do nothing.
--
-- AFTER APPLYING
--   No feature flag is switched on by this file. ship_fire and tower_obstacles stay
--   off until the owner switches them on (FEATURE_FLAGS); the reset route works as
--   soon as the backend with T53 is deployed.
--   Verify: select pg_get_constraintdef(oid) from pg_constraint
--            where conname = 'wave_rules_known_names';
--           select version, name from supabase_migrations.schema_migrations
--            where version >= '20261115160000' order by version;
-- =============================================================================

begin;

-- >>>>>>>>>>>>>>>>>>>> 20261115160000_tower_obstacles.sql >>>>>>>>>>>>>>>>>>>>

-- Allow the T35 tower obstacle rule to be kept with a wave after pathing and tower_health are deployed.
-- Used by: wave_rules_keep()'s existing known-name check. Rollback: switch the flag off; keep this allowed name
-- while any wave_rules row could contain it, then a later cleanup migration may remove it.
alter table public.wave_rules drop constraint if exists wave_rules_known_names;
alter table public.wave_rules
  add constraint wave_rules_known_names
    check (rules <@ array['tower_health', 'pathing', 'tower_obstacles', 'rescue', 'defenses_v2']::text[]);

comment on table public.wave_rules is
  'The simulation rules (tower_health, pathing, tower_obstacles, rescue, defenses_v2) a wave plays with, kept by the first start/join/current answer for it, so every client of the wave plays the same rules even if a flag changes while it runs. Written only by wave_rules_keep().';

-- <<<<<<<<<<<<<<<<<<<< end of 20261115160000_tower_obstacles.sql <<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>> 20261116070000_island_fresh_start.sql >>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- 20261116070000_island_fresh_start.sql: a player resets their own island (T53)
-- =============================================================================
--
-- WHAT IT DOES
--   The owner's play-test of 16 Nov (docs/OPEN-TODOS.md section 10, T53): in
--   Settings a player may reset their own island to a fresh start, between waves
--   only, after typing the island code to confirm. It is the hand-run reset of
--   scripts/admin/fresh_start.sql, filtered to ONE island owner, plus the research,
--   the wreck and the captain:
--
--     island_resets         NEW table, one row per reset: the click that did it
--                           (its actionUid) and the counts it answered, so a
--                           repeated click is answered and never resets twice.
--     island_fresh_start()  NEW function: the reset, in one transaction.
--
--   What one reset changes, for the island of p_player_id only:
--     1. the wallet set to the starting coins of a brand-new player
--        (p_starting_coins: islands.json startingCoins, sent by the server, the
--        same number island_open() pays) through apply_wallet_transaction()
--        (reason fresh_start, ref reset:<actionUid>); no ledger row when it holds
--        that amount already (a change of 0 coins is not allowed),
--     2. the cloud save emptied (saves.data becomes {}; the row stays),
--     3. every building of the owner removed except the cabin (the cabin stands
--        from the start and has no row anyway),
--     4. the island's research (island_research), its moved build spots
--        (island_layout), its arsenal (arsenal_moves, then arsenal_copies: the
--        clicks point at the copies) and its wall records (island_wall_records),
--     5. the island's waves: their kept sim rules (wave_rules) first, then the
--        waves (wave_runs). The participants (wave_participants) and the revives
--        (captain_revives) go with each wave by cascade.
--     6. the island row back to its defaults: wave_best, won_wave_best, flags,
--        next_wave, the four crews, captain_level, captain_skills, captain_role,
--        wreck_paid, and only the musket again (weapons_owned '{musket}',
--        weapon_equipped 'musket').
--
--   What stays:
--     * the island itself and its code, so the game keeps its name and its link,
--     * every member of the game (island_members): friends stay in the game,
--     * every ledger row (wallet_transactions), and the records that act as one:
--       building_payments and building_demolitions (who paid, who tore down; a
--       new building has a new ref, so it never inherits a row), and
--       captain_skill_learns (the click ids of the skills learnt),
--     * the members' own islands, wallets and saves (only the owner's change),
--     * Pirate Point and its buildings,
--     * the home islet's timber (islets.timber, legacy, unused by v3).
--
-- WHO USES IT
--   Only the Python server, with the secret key (service_role): the route
--   POST /api/island/fresh-start of backend/server/routes/island_reset.py (rules in
--   backend/server/island/fresh_start.py). No browser role gets anything.
--
-- THE RULES THAT THE DATABASE KEEPS
--   1. Only your own island: the function resets the island whose owner is
--      p_player_id (islands.player_id), never another one. A player with no island
--      of their own, or a code that names somebody else's island, is refused
--      not_owner (a member of a friend's game cannot reset it).
--   2. The code must be the island's own (refused wrong_code): compared without
--      case, spaces or dashes, with or without "ISLE-" (ISLE-K7Q2M, k7q2m).
--   3. Never while a wave runs on that island (a wave that has a row, is not
--      finished and is not past its maximum length, its countdown included):
--      refused wave_running. The test is island_demolish()'s
--      (20261112080000_demolish.sql, 20261113010000_respec_and_wave_guards.sql).
--   4. Safe to repeat: the island_resets row (island_owner, action_uid). A repeat
--      answers {status: done, repeat: true} with the counts of the first time, and
--      changes nothing, wave or not.
--   5. Locks, in the order of the other money functions: the wallet first, then
--      the island row (the lock wave_start() takes, so a bell and a reset run one
--      after the other). The wave test runs after the island lock.
--   6. Play money only; coins move only through apply_wallet_transaction().
--
-- RIGHTS IT ADDS
--   The function is security invoker, so it runs with the server's rights. It
--   deletes rows the server could not delete before, so service_role gets delete
--   on exactly these tables (and nothing else):
--     island_research, island_layout, arsenal_moves, arsenal_copies,
--     island_wall_records, wave_rules, wave_runs.
--   (Delete on islet_buildings is there since 20261112080000_demolish.sql; update
--   on saves and islands is there since the foundation and 20261110010000.) The
--   cascades from wave_runs to wave_participants and captain_revives run with the
--   table owner's rights, so they need no grant.
--
-- WHAT IT NEEDS
--   Every earlier migration, in particular 20261110010000_islands_and_waves.sql
--   (the wallet reason fresh_start, islands, wave_runs), 20261112060000_tech_hub.sql
--   (island_research, wreck_paid), 20261112120000_captain_tree.sql (captain_role),
--   20261114100000_wall_recovery.sql, 20261114110000_island_layout.sql,
--   20261114120000_arsenal.sql, 20261114130500_wave_rules.sql and
--   20261115140000_guard_crew.sql (crew_guard).
--
-- SAFE TO RUN TWICE
--   The table uses "if not exists", the function "create or replace", and the
--   revokes, grants and comments repeat. No check rule is added to an existing
--   table.
--
-- ROLLBACK (by hand)
--   Deploy the server without the route; drop function
--   public.island_fresh_start(uuid, text, text, integer); revoke the deletes listed
--   above.
--   Keep island_resets (it records what happened).
--
-- HOW TO VERIFY (read-only queries, after applying)
--   a. select relrowsecurity from pg_class where oid = 'public.island_resets'::regclass; -- true
--      select count(*) from pg_policies where tablename = 'island_resets';               -- 0
--   b. Only the server may run the function (browser and visitor false):
--      select has_function_privilege('authenticated',
--               'public.island_fresh_start(uuid, text, text, integer)', 'execute') as browser,
--             has_function_privilege('anon',
--               'public.island_fresh_start(uuid, text, text, integer)', 'execute') as visitor,
--             has_function_privilege('service_role',
--               'public.island_fresh_start(uuid, text, text, integer)', 'execute') as server;
--   c. select count(*) from public.island_resets;                       -- 0 until a reset
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Table island_resets: one row per reset, by its click
-- -----------------------------------------------------------------------------

create table if not exists public.island_resets (
  island_owner  uuid not null references public.islands (player_id) on delete cascade,
  action_uid    text not null,
  counts        jsonb not null,
  reset_at      timestamptz not null default now(),

  primary key (island_owner, action_uid),
  constraint island_resets_action_uid_format
    check (action_uid ~ '^[A-Za-z0-9_-]{8,64}$'),
  constraint island_resets_counts_object
    check (jsonb_typeof(counts) = 'object')
);

comment on table public.island_resets is
  'One row per island reset in Settings (T53, island_fresh_start()): which click did it and what it cleared, so a repeated click is answered with the same counts and never resets twice. No browser access.';
comment on column public.island_resets.island_owner is
  'The island that was reset (its owner, the game''s host, who asked for it).';
comment on column public.island_resets.action_uid is
  'The click id the browser made (8 to 64 letters, digits, hyphens or underscores). The wallet''s ledger row, if any, has ref reset:<action_uid>.';
comment on column public.island_resets.counts is
  'The answer of that reset: {coins, saves, buildings, research, layout, arsenalMoves, arsenalCopies, wallRecords, waveRules, waves, membersKept}.';
comment on column public.island_resets.reset_at is
  'When. Set by the database.';

-- Row-level security on and no policy: no browser role sees a row.
--   service_role  read, insert (island_fresh_start); no update, no delete
alter table public.island_resets enable row level security;
revoke all on table public.island_resets from public, anon, authenticated, service_role;
grant select, insert on table public.island_resets to service_role;


-- -----------------------------------------------------------------------------
-- 2. The rights the reset needs (see RIGHTS IT ADDS above)
-- -----------------------------------------------------------------------------

grant delete on table public.island_research     to service_role;
grant delete on table public.island_layout       to service_role;
grant delete on table public.arsenal_moves       to service_role;
grant delete on table public.arsenal_copies      to service_role;
grant delete on table public.island_wall_records to service_role;
grant delete on table public.wave_rules          to service_role;
grant delete on table public.wave_runs           to service_role;


-- -----------------------------------------------------------------------------
-- 3. island_fresh_start(): the reset
-- -----------------------------------------------------------------------------
--   p_player_id     the player, who must own the island (it is always their own)
--   p_action_uid    the click id (8 to 64 letters, digits, hyphens or underscores)
--   p_confirm_code  the island code as the player typed it (ISLE-K7Q2M, k7q2m, ...)
--   p_starting_coins  the coins of a brand-new player (islands.json startingCoins),
--                   1 to 100000; the wallet is set to it
--
-- Returns {status: done, repeat, balance, counts: {coins, saves, buildings, research,
-- layout, arsenalMoves, arsenalCopies, wallRecords, waveRules, waves, membersKept}}
-- or {status: refused, reason: player_not_set_up | not_owner | wrong_code |
-- wave_running}. coins is the change made to the wallet (p_starting_coins - the
-- balance before; 0 when it held that already). Raises bad_fresh_start for a missing
-- player, a bad click id, a missing code or starting coins outside 1 to 100000.

create or replace function public.island_fresh_start(
  p_player_id     uuid,
  p_action_uid    text,
  p_confirm_code    text,
  p_starting_coins  integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_balance        bigint;
  v_island         public.islands;
  v_typed          text;
  v_done           jsonb;
  v_counts         jsonb;
  v_coins          bigint := 0;
  v_saves          integer := 0;
  v_buildings      integer := 0;
  v_research       integer := 0;
  v_layout         integer := 0;
  v_arsenal_moves  integer := 0;
  v_arsenal_copies integer := 0;
  v_wall_records   integer := 0;
  v_wave_rules     integer := 0;
  v_waves          integer := 0;
  v_members        integer := 0;
begin
  if p_player_id is null or p_confirm_code is null
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_starting_coins is null or p_starting_coins not between 1 and 100000 then
    raise exception 'bad_fresh_start';
  end if;

  -- Lock 1: the wallet.
  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  -- Lock 2: the player's own island (the lock wave_start() takes). No island of
  -- their own: there is nothing they may reset.
  select * into v_island from public.islands where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'not_owner');
  end if;

  -- A repeat of a reset that went through: the same answer, nothing changed.
  select counts into v_done
    from public.island_resets
   where island_owner = p_player_id and action_uid = p_action_uid;
  if found then
    return jsonb_build_object('status', 'done', 'repeat', true, 'balance', v_balance,
                              'counts', v_done);
  end if;

  -- The typed code: no spaces, dashes or case, and "ISLE" in front is allowed.
  v_typed := upper(regexp_replace(left(p_confirm_code, 32), '[[:space:]-]', '', 'g'));
  if char_length(v_typed) = 9 and left(v_typed, 4) = 'ISLE' then
    v_typed := substr(v_typed, 5);
  end if;
  if v_typed is distinct from v_island.code then
    -- Somebody else's island (a friend's game): only its owner may reset it.
    if exists (select 1 from public.islands where code = v_typed) then
      return jsonb_build_object('status', 'refused', 'reason', 'not_owner');
    end if;
    return jsonb_build_object('status', 'refused', 'reason', 'wrong_code');
  end if;

  -- No reset while a wave runs on this island: the wave reads the buildings, the
  -- crews and the captain. The same test as island_demolish(); the island row is
  -- locked above, so no wave can start between this test and the reset.
  if exists (
    select 1 from public.wave_runs
     where island_owner = p_player_id and finished_at is null
       and starts_at + make_interval(secs => maximum_seconds) >= now()
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'wave_running');
  end if;

  -- 1. The wallet to the starting coins, through the one wallet function.
  if v_balance <> p_starting_coins then
    v_coins := p_starting_coins - v_balance;
    v_balance := public.apply_wallet_transaction(
      p_player_id, v_coins, 'fresh_start', 'reset:' || p_action_uid
    );
  end if;

  -- 2. The cloud save empty (the row stays).
  update public.saves set data = '{}'::jsonb
   where player_id = p_player_id and data <> '{}'::jsonb;
  get diagnostics v_saves = row_count;

  -- 3. Every building of the owner except the cabin.
  delete from public.islet_buildings
   where player_id = p_player_id and building_type <> 'cabin';
  get diagnostics v_buildings = row_count;

  -- 4. Research, moved spots, the arsenal (clicks first: they point at the copies)
  --    and the wall records.
  delete from public.island_research where island_owner = p_player_id;
  get diagnostics v_research = row_count;
  delete from public.island_layout where island_owner = p_player_id;
  get diagnostics v_layout = row_count;
  delete from public.arsenal_moves where island_owner = p_player_id;
  get diagnostics v_arsenal_moves = row_count;
  delete from public.arsenal_copies where island_owner = p_player_id;
  get diagnostics v_arsenal_copies = row_count;
  delete from public.island_wall_records where island_owner = p_player_id;
  get diagnostics v_wall_records = row_count;

  -- 5. The island's waves, after their kept rules (participants and revives go
  --    with each wave by cascade).
  delete from public.wave_rules
   where wave_id in (select id from public.wave_runs where island_owner = p_player_id);
  get diagnostics v_wave_rules = row_count;
  delete from public.wave_runs where island_owner = p_player_id;
  get diagnostics v_waves = row_count;

  -- 6. The island row back to the start (both weapon columns in one update, so
  --    the check rule "the carried weapon is one you own" holds).
  update public.islands
     set wave_best       = default,
         won_wave_best   = default,
         flags           = default,
         next_wave       = default,
         crew_gunner     = default,
         crew_carpenter  = default,
         crew_lookout    = default,
         crew_guard      = default,
         captain_level   = default,
         captain_skills  = default,
         captain_role    = default,
         wreck_paid      = default,
         weapons_owned   = '{musket}',
         weapon_equipped = 'musket'
   where player_id = p_player_id;

  -- 7. The members stay; counted for the answer only.
  select count(*) into v_members
    from public.island_members
   where island_owner = p_player_id and role = 'member' and left_at is null;

  v_counts := jsonb_build_object(
    'coins', v_coins,
    'saves', v_saves,
    'buildings', v_buildings,
    'research', v_research,
    'layout', v_layout,
    'arsenalMoves', v_arsenal_moves,
    'arsenalCopies', v_arsenal_copies,
    'wallRecords', v_wall_records,
    'waveRules', v_wave_rules,
    'waves', v_waves,
    'membersKept', v_members
  );
  insert into public.island_resets (island_owner, action_uid, counts)
  values (p_player_id, p_action_uid, v_counts);

  return jsonb_build_object('status', 'done', 'repeat', false, 'balance', v_balance,
                            'counts', v_counts);
end;
$$;

revoke all on function public.island_fresh_start(uuid, text, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.island_fresh_start(uuid, text, text, integer)
  to service_role;

comment on function public.island_fresh_start(uuid, text, text, integer) is
  'Resets the island of p_player_id to a fresh start (T53): wallet to p_starting_coins, the coins of a brand-new player (reason fresh_start, ref reset:<actionUid>), the save emptied, every building but the cabin, the research, the moved spots, the arsenal, the wall records and the waves removed, and the island row (best waves, flags, next wave, crews, captain, wreck, weapons) back to its defaults. The island, its code, its members and the ledger stay. Locks the wallet, then the island. A repeated actionUid (island_resets) answers {status: done, repeat: true} with the first counts. Refuses player_not_set_up, not_owner (no island of your own, or a code of somebody else''s island), wrong_code (not the island''s code, compared without case, spaces, dashes or ISLE-) and wave_running, with nothing changed. Only service_role may run it.';

-- <<<<<<<<<<<<<<<<<<<< end of 20261116070000_island_fresh_start.sql <<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>> 20261116160000_ship_fire_rule.sql >>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- 20261116160000_ship_fire_rule.sql
--
-- WHAT IT DOES
--   Ship fire at real targets (T50, the owner's play-test of 16 Nov): with the
--   wave rule ship_fire every client's sim has a ship at anchor fire at a real
--   wall, tower or the island's heart, and the hit costs that target health
--   (frontend/src/pirates/ship-fire.js). The rule is switched on by the feature
--   flag ship_fire and kept per wave like the others (wave_rules_keep()), so a
--   wave that started without it plays without it to its end.
--
--     wave_rules           the check rule wave_rules_known_names also allows the
--                          rule name ship_fire (SIM_RULES in
--                          backend/server/island/wave_rules.py).
--
--   Nothing else changes: no table, column, function or grant. The wave
--   functions take no rule names, so they need no change.
--
-- WHAT IT NEEDS
--   20261114130500_wave_rules.sql (the table wave_rules),
--   20261114140000_culverin.sql (defenses_v2) and
--   20261115160000_tower_obstacles.sql (tower_obstacles). This file is the
--   latest check rule, so it lists every name of SIM_RULES: tower_health,
--   pathing, tower_obstacles, rescue, defenses_v2 and ship_fire. Applied after
--   20261115160000 it keeps that file's tower_obstacles; applied without it, it
--   allows tower_obstacles all the same (only a name, harmless).
--
-- SAFE TO RUN AGAIN
--   The constraint is dropped if it exists and added again; the comment repeats.
--
-- ROLLBACK (by hand, only while no wave keeps ship_fire)
--   Run 20261115160000_tower_obstacles.sql again.
--
-- HOW TO VERIFY (read-only, after applying)
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'wave_rules_known_names';
--   -- the rule names are tower_health, pathing, tower_obstacles, rescue,
--   -- defenses_v2 and ship_fire
--
-- Switch the flag ship_fire on only after this migration is applied: before it
-- the database refuses to keep a wave with ship_fire, and such a wave then plays
-- with no rules at all (the server logs it and leaves "rules" out).
-- =============================================================================

alter table public.wave_rules drop constraint if exists wave_rules_known_names;
-- Only the names the server knows (SIM_RULES in backend/server/island/wave_rules.py).
alter table public.wave_rules
  add constraint wave_rules_known_names
    check (rules <@ array['tower_health', 'pathing', 'tower_obstacles', 'rescue', 'defenses_v2', 'ship_fire']::text[]);

comment on table public.wave_rules is
  'The simulation rules (tower_health, pathing, tower_obstacles, rescue, defenses_v2, ship_fire) a wave plays with, kept by the first start/join/current answer for it, so every client of the wave plays the same rules even if a flag changes while it runs. Written only by wave_rules_keep().';

-- <<<<<<<<<<<<<<<<<<<< end of 20261116160000_ship_fire_rule.sql <<<<<<<<<<<<<<<<<<<<

-- Register the three versions as applied.
insert into supabase_migrations.schema_migrations (version, name)
values
  ('20261115160000', 'tower_obstacles'),
  ('20261116070000', 'island_fresh_start'),
  ('20261116160000', 'ship_fire_rule')
on conflict (version) do nothing;

commit;
