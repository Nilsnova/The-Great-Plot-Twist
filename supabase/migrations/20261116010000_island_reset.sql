-- =============================================================================
-- 20261116010000_island_reset.sql
--
-- WHAT IT DOES
--   A player resets their OWN island to a fresh start (decision D054, accepted
--   by Nils on 16 Nov 2026: "Logged in with GitHub, I want to reset my island
--   to start fresh."). It is scripts/admin/fresh_start.sql for one player and
--   one island, run by the player from Settings, plus the parts of the player's
--   own progress that the admin script left alone.
--
--     wallet_reasons     one new reason, island_reset (either): the wallet goes
--                        to the starting coins through apply_wallet_transaction()
--                        (ref reset:<uid>), so the ledger tells the story.
--     island_resets      one row per reset (player, actionUid): makes a repeat
--                        safe even when the wallet held the starting coins
--                        already (a change of 0 coins writes no ledger row).
--     island_reset_own() the reset itself, in ONE transaction.
--
--   What island_reset_own() clears (only rows of the player's own island, the
--   island whose islands.player_id is the player):
--     islet_buildings      every building on the 22 island spots (walls with
--                          their health, towers with their skills, houses with
--                          their roles). The cabin has no row. The home islet
--                          buildings of the older case game (plot_2..plot_4,
--                          islet_signal_station) stay: they are not the island.
--     building_payments, building_demolitions   the island's payment and
--                          tear-down records (they belong to those buildings).
--     island_layout        every moved build spot (back to the fixed spots).
--     island_research      the Tech hub's research of the island.
--     arsenal_moves, arsenal_copies   the island's arsenal (the clicks first,
--                          they point at the copies). A member who carried one
--                          of these copies has the musket again.
--     island_wall_records, wave_rules, wave_runs   every wave run ON this island
--                          (the two tables that point at a wave first); with a
--                          run go its participants and captain revives (cascade).
--                          So the island's old scores leave the leaderboard
--                          (D054 explains why; D046 is unchanged otherwise).
--     island_members       the members of the island's game (other players).
--                          The host row stays. Members may join again by code.
--     captain_skill_learns the player's skill click records.
--     islands              back to the column defaults: wave_best 0, flags 0,
--                          next_wave null, every crew count 0 (crew_guard too),
--                          captain_level 1, won_wave_best 0, captain_skills {},
--                          weapons_owned {musket}, weapon_equipped musket,
--                          wreck_paid 0, captain_role null. The code stays.
--     wallets              to p_start_coins (islands.json startingCoins, 100).
--
--   What stays: the account, profile and captain name, the sign-in, the island
--   code, the ledger history, the save, the player's membership in OTHER
--   islands' games, waves on other islands and on Pirate Point (and what the
--   player bought there), everything of the case game.
--
-- WHO USES IT
--   Only the Python server, with the secret key (service_role): POST
--   /api/island/reset (backend/server/routes/island_reset.py). No browser role
--   gets anything. The function is SECURITY DEFINER (it runs with the rights
--   of its owner, the database owner) on purpose: the server role may still
--   not DELETE wave runs, layout rows, research, arsenal copies, members or
--   skill records itself (tests keep that), the same reason fresh_start.sql is
--   run as the database owner. Every statement inside names p_player_id's own
--   island, execute is granted to service_role only, and the search path is
--   empty.
--
-- THE RULES THAT THE DATABASE KEEPS
--   1. Play money only; coins move only through apply_wallet_transaction().
--   2. Locks the player's wallet first, then the island row (the order of
--      island_research(), island_hire() and the other island functions); a
--      wave_start() of this island waits for the island lock.
--   3. Never while a wave runs on the island (a wave_runs row not finished and
--      not past its maximum length, the rule of island_demolish()): refused
--      wave_running, nothing changed.
--   4. A repeated actionUid (an island_resets row) answers {status: done,
--      repeat: true} and changes nothing.
--   5. Only the player's own island: every delete names island_owner (or
--      player_id) = p_player_id.
--
-- WHAT IT NEEDS
--   Every migration up to 20261115140000_guard_crew.sql (crew_guard).
--
-- SAFE TO RUN AGAIN
--   The reason uses "on conflict do nothing", the table "if not exists", the
--   function "create or replace", and revokes, grants and comments repeat.
--
-- DEPLOY ORDER
--   Apply this migration before the server with POST /api/island/reset is
--   deployed; an older server never calls the function.
--
-- ROLLBACK (by hand)
--   revoke execute on function public.island_reset_own(uuid, text, integer)
--     from service_role;
--   (or drop the function and the table island_resets by hand). The reason
--   island_reset stays: a reason is never removed, and its ledger rows stay.
--
-- HOW TO VERIFY (read-only, after applying)
--   select reason, direction from public.wallet_reasons where reason = 'island_reset';
--     -- one row, either
--   select has_function_privilege('authenticated',
--          'public.island_reset_own(uuid, text, integer)', 'execute');  -- false
--   select has_function_privilege('service_role',
--          'public.island_reset_own(uuid, text, integer)', 'execute');  -- true
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The wallet reason
-- -----------------------------------------------------------------------------
-- The same pair ends WALLET_REASONS in backend/server/wallet.py (a test compares
-- them).

insert into public.wallet_reasons (reason, direction, description) values
  ('island_reset', 'either', 'A player reset their own island: the wallet goes back to the starting coins (D054).')
on conflict (reason) do nothing;


-- -----------------------------------------------------------------------------
-- 2. Table island_resets: one row per reset
-- -----------------------------------------------------------------------------

create table if not exists public.island_resets (
  player_id     uuid not null references public.profiles (id) on delete cascade,
  action_uid    text not null,
  coins_before  bigint not null,
  removed       jsonb not null,
  reset_at      timestamptz not null default now(),

  primary key (player_id, action_uid),
  constraint island_resets_action_uid_format check (action_uid ~ '^[A-Za-z0-9_-]{8,64}$'),
  constraint island_resets_removed_object check (jsonb_typeof(removed) = 'object')
);

comment on table public.island_resets is
  'One row per reset of a player''s own island (D054, island_reset_own()). Makes a repeated click safe and records what was removed. Written only by island_reset_own().';
comment on column public.island_resets.player_id is 'The player who reset their own island.';
comment on column public.island_resets.action_uid is 'The click id the browser made (ledger ref reset:<uid>).';
comment on column public.island_resets.coins_before is 'The wallet balance just before the reset.';
comment on column public.island_resets.removed is 'How many rows of each kind the reset removed ({buildings, layout, research, members, waves, arsenal, ...}).';
comment on column public.island_resets.reset_at is 'When the reset ran.';

alter table public.island_resets enable row level security;
-- No policy: players never read or write it.

revoke all on table public.island_resets from public, anon, authenticated, service_role;
grant select on table public.island_resets to service_role;


-- -----------------------------------------------------------------------------
-- 3. island_reset_own(): the fresh start of one island
-- -----------------------------------------------------------------------------
--   p_player_id    the verified player; only their own island is reset
--   p_action_uid   the click id (8 to 64 letters, digits, - or _)
--   p_start_coins  the starting coins of islands.json (100)
--
-- Returns {status: done, balance, repeat: false, removed: {...}},
-- {status: done, balance, repeat: true} for a repeated click, or {status:
-- refused, reason: player_not_set_up | no_island | wave_running}, with nothing
-- changed. A bad argument raises bad_reset.

create or replace function public.island_reset_own(
  p_player_id   uuid,
  p_action_uid  text,
  p_start_coins integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_balance   bigint;
  v_before    bigint;
  v_count     integer;
  v_removed   jsonb := '{}'::jsonb;
begin
  if p_player_id is null
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_start_coins is null or p_start_coins not between 1 and 1000000 then
    raise exception 'bad_reset';
  end if;

  -- The wallet first, then the island row (the lock wave_start() takes).
  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;
  perform 1 from public.islands where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_island');
  end if;

  -- The same click again: done already.
  if exists (
    select 1 from public.island_resets where player_id = p_player_id and action_uid = p_action_uid
  ) then
    return jsonb_build_object('status', 'done', 'balance', v_balance, 'repeat', true);
  end if;

  -- Never while a wave runs on this island.
  if exists (
    select 1 from public.wave_runs
     where island_owner = p_player_id and finished_at is null
       and starts_at + make_interval(secs => maximum_seconds) >= now()
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'wave_running');
  end if;
  v_before := v_balance;

  -- The arsenal: the clicks first (they point at the copies), then the copies.
  delete from public.arsenal_moves where island_owner = p_player_id;
  get diagnostics v_count = row_count;
  v_removed := v_removed || jsonb_build_object('arsenalMoves', v_count);
  delete from public.arsenal_copies where island_owner = p_player_id;
  get diagnostics v_count = row_count;
  v_removed := v_removed || jsonb_build_object('arsenal', v_count);

  -- Every wave run on this island, after the two tables that point at a wave.
  delete from public.island_wall_records where island_owner = p_player_id;
  get diagnostics v_count = row_count;
  v_removed := v_removed || jsonb_build_object('wallRecords', v_count);
  delete from public.wave_rules r
   using public.wave_runs w
   where w.id = r.wave_id and w.island_owner = p_player_id;
  get diagnostics v_count = row_count;
  v_removed := v_removed || jsonb_build_object('waveRules', v_count);
  delete from public.wave_runs where island_owner = p_player_id;
  get diagnostics v_count = row_count;
  v_removed := v_removed || jsonb_build_object('waves', v_count);

  -- The buildings on the 22 island spots and their records.
  delete from public.building_payments where island_owner = p_player_id;
  get diagnostics v_count = row_count;
  v_removed := v_removed || jsonb_build_object('payments', v_count);
  delete from public.building_demolitions where island_owner = p_player_id;
  get diagnostics v_count = row_count;
  v_removed := v_removed || jsonb_build_object('demolitions', v_count);
  delete from public.islet_buildings
   where player_id = p_player_id and plot ~ '^(wall|cannon|tower|house)_[0-9]+$';
  get diagnostics v_count = row_count;
  v_removed := v_removed || jsonb_build_object('buildings', v_count);
  delete from public.island_layout where island_owner = p_player_id;
  get diagnostics v_count = row_count;
  v_removed := v_removed || jsonb_build_object('layout', v_count);
  delete from public.island_research where island_owner = p_player_id;
  get diagnostics v_count = row_count;
  v_removed := v_removed || jsonb_build_object('research', v_count);

  -- The members of the island's game (the host row stays).
  delete from public.island_members where island_owner = p_player_id and player_id <> p_player_id;
  get diagnostics v_count = row_count;
  v_removed := v_removed || jsonb_build_object('members', v_count);

  -- The captain: skill click records, then the island row back to its defaults.
  delete from public.captain_skill_learns where player_id = p_player_id;
  get diagnostics v_count = row_count;
  v_removed := v_removed || jsonb_build_object('skillLearns', v_count);
  update public.islands
     set wave_best = 0, flags = 0, next_wave = null,
         crew_gunner = 0, crew_carpenter = 0, crew_lookout = 0, crew_guard = 0,
         captain_level = 1, won_wave_best = 0, captain_skills = '{}',
         weapons_owned = '{musket}', weapon_equipped = 'musket',
         wreck_paid = 0, captain_role = null
   where player_id = p_player_id;

  -- The wallet to the starting coins, through the one wallet function.
  if v_balance <> p_start_coins then
    v_balance := public.apply_wallet_transaction(
      p_player_id, p_start_coins - v_balance, 'island_reset', 'reset:' || p_action_uid
    );
  end if;

  insert into public.island_resets (player_id, action_uid, coins_before, removed)
  values (p_player_id, p_action_uid, v_before, v_removed);

  return jsonb_build_object('status', 'done', 'balance', v_balance, 'repeat', false, 'removed', v_removed);
end;
$$;

revoke all on function public.island_reset_own(uuid, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.island_reset_own(uuid, text, integer) to service_role;

comment on function public.island_reset_own(uuid, text, integer) is
  'Resets the island of p_player_id (their own, never another) to a fresh start (D054): removes its buildings on the 22 spots, their payments and tear-downs, layout, research, arsenal copies and clicks, every wave run on it (with wall records, wave rules, participants and revives) and the other members of its game; sets the island row back to its defaults (best wave, flags, next wave, crew, captain level, skills, role, weapons, wreck) and the wallet to p_start_coins (reason island_reset, ref reset:<uid>). Locks the wallet, then the island. Refuses player_not_set_up, no_island and wave_running with nothing changed. A repeated actionUid answers {status: done, repeat: true}. Raises bad_reset for a bad argument. SECURITY DEFINER (the server role cannot delete these rows itself); only service_role may run it.';
