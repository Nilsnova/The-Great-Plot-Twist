-- =============================================================================
-- 20261113010000_respec_and_wave_guards.sql
--
-- WHAT IT DOES
--   Two small repairs to the Tech hub and the captain tree, found in the review
--   of the 12 Nov releases (open todos T23 and T24).
--
--   T23  island_respec() charged a price the Python server worked out BEFORE
--        any lock (coinsPerLevel x captain level, read earlier). A captain
--        upgrade at the same moment could make the player pay the old price.
--        The function now takes the price PER LEVEL (p_per_level, coins per
--        captain level) and works out p_per_level x captain_level itself,
--        after it has locked the island row. What the player is shown does not
--        change: the server still shows coinsPerLevel x level.
--
--   T24  island_research() and island_respec() refuse {reason: wave_running}
--        while a wave runs on the island. A tier-3 change takes the old
--        capstone off every tower (a wave that is running reads the towers),
--        and a respec clears the captain's skills (a wave that is running
--        reads those too). The test is the one island_demolish() uses.
--
--     island_respec()    dropped (the argument p_price becomes p_per_level, and
--                        Postgres will not rename an argument in place) and
--                        made again; the price is computed under the lock; new
--                        refusal wave_running.
--     island_research()  recreated with ONE addition: the wave_running refusal.
--                        Nothing else changed (checked with a diff against
--                        20261112100000_research_tiers.sql).
--
-- WHO USES IT
--   Only the Python server, with the secret key (service_role):
--   backend/server/island/service.py (respec(), research()), reached by
--   POST /api/island/respec and /api/island/research. Both answer 409
--   wave_running with a plain message. No browser role gets anything new.
--
-- THE RULES THAT THE DATABASE KEEPS
--   1. Play money only; coins move only through apply_wallet_transaction().
--   2. A respec costs p_per_level x the captain level read under the island
--      lock. The refusal insufficient_funds reports that price.
--   3. A wave "runs" on an island when it has a wave_runs row that is not
--      finished and is not past its maximum length (its countdown included).
--      Then no research step and no respec: refused wave_running, nothing
--      changed, no coins taken.
--   4. A repeat of a click that was already paid is answered first
--      ({status: done, repeat: true}) and changes nothing, wave or not.
--   5. Lock order is unchanged: the wallet first, then the island row (the lock
--      wave_start() takes), then the rest. The wave test runs after the island
--      row is locked, so a wave cannot start between the test and the write.
--
-- WHAT IT NEEDS
--   Every earlier migration, in particular 20261112080000_demolish.sql
--   (the wave test), 20261112100000_research_tiers.sql (island_research) and
--   20261112120000_captain_tree.sql (island_respec, captain_role).
--
-- SAFE TO RUN TWICE
--   island_respec() is dropped "if exists" before it is made (the signature keeps its
--   types, so a second run drops and makes the same function);
--   island_research() uses "create or replace" (its signature is unchanged);
--   revokes, grants and comments repeat.
--
-- HOW THE FILE IS ORGANISED
--   1. island_respec(): the price per level, worked out under the lock, and no
--      respec during a wave
--   2. island_research(): no research step during a wave
--
-- HOW TO VERIFY (read-only queries, after applying)
--   a. select pg_get_function_identity_arguments(p.oid) from pg_proc p
--       join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname = 'public' and p.proname = 'island_respec';
--      -- one row: p_player_id uuid, p_action_uid text, p_per_level integer
--   b. select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'public' and p.proname = 'island_research';       -- 1
--   c. Only the server may run the functions (browser and visitor false):
--      select p.proname,
--             has_function_privilege('authenticated', p.oid, 'execute') as browser,
--             has_function_privilege('anon', p.oid, 'execute') as visitor,
--             has_function_privilege('service_role', p.oid, 'execute') as server
--        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'public' and p.proname in ('island_respec', 'island_research');
--   d. Both bodies carry the wave test:
--      select p.proname, position('wave_running' in pg_get_functiondef(p.oid)) > 0
--        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'public' and p.proname in ('island_respec', 'island_research');
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. island_respec(): the price per level, worked out under the lock
-- -----------------------------------------------------------------------------
--   p_player_id   the player (a respec is always of the player's own captain)
--   p_action_uid  the click id (ledger ref respec:<uid>)
--   p_per_level   coins per captain level (islands.json captainSkills.respec.
--                 coinsPerLevel); the price is p_per_level x islands.captain_level
--
-- Returns {status: done, balance, repeat} or {status: refused, reason:
-- player_not_set_up | no_island | wave_running | nothing_to_reset |
-- insufficient_funds}.

-- The argument is renamed: the old function goes first (a second run drops this one).
drop function if exists public.island_respec(uuid, text, integer);

create function public.island_respec(
  p_player_id   uuid,
  p_action_uid  text,
  p_per_level   integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_ref     text;
  v_balance bigint;
  v_island  public.islands;
  v_price   integer;
begin
  if p_player_id is null or p_per_level is null or p_per_level < 1
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$' then
    raise exception 'bad_respec';
  end if;
  v_ref := 'respec:' || p_action_uid;

  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  select * into v_island from public.islands where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_island');
  end if;

  if exists (
    select 1 from public.wallet_transactions
     where player_id = p_player_id and reason = 'captain_respec' and ref = v_ref
  ) then
    return jsonb_build_object('status', 'done', 'balance', v_balance, 'repeat', true);
  end if;

  -- No respec while a wave runs on this island: it would clear the captain's
  -- skills under a wave that reads them. The same test as island_demolish()
  -- (20261112080000_demolish.sql); the island row is locked above.
  if exists (
    select 1 from public.wave_runs
     where island_owner = p_player_id and finished_at is null
       and starts_at + make_interval(secs => maximum_seconds) >= now()
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'wave_running');
  end if;

  if cardinality(v_island.captain_skills) = 0 and v_island.captain_role is null then
    return jsonb_build_object('status', 'refused', 'reason', 'nothing_to_reset');
  end if;

  -- The price, at the captain level that the island row has NOW (it is locked).
  v_price := p_per_level * v_island.captain_level;
  if v_balance < v_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', v_price);
  end if;

  v_balance := public.apply_wallet_transaction(p_player_id, -v_price, 'captain_respec', v_ref);
  update public.islands
     set captain_skills = '{}', captain_role = null
   where player_id = p_player_id;

  return jsonb_build_object('status', 'done', 'balance', v_balance, 'repeat', false);
end;
$$;

revoke all on function public.island_respec(uuid, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.island_respec(uuid, text, integer)
  to service_role;

comment on function public.island_respec(uuid, text, integer) is
  'Clears the captain''s skills and role for p_per_level x the captain level coins (wallet reason captain_respec, ref respec:<uid>); the level is read under the island lock, so an upgrade at the same moment cannot be undercharged or overcharged. The skill points come back because they are computed from won_wave_best minus the skills learnt. Locks the wallet, then the island. A repeated actionUid answers {status: done, repeat: true}. Refuses player_not_set_up, no_island, wave_running (a wave runs on the island), nothing_to_reset and insufficient_funds (with the price), with nothing changed. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 2. island_research(): no research step while a wave runs
-- -----------------------------------------------------------------------------
-- The same function as 20261112100000_research_tiers.sql with ONE addition: after
-- the membership test, the wave_running refusal (marked below). Returns {status:
-- done, branch, tier, choice, balance, repeat} or {status: refused, reason:
-- player_not_set_up | no_island | not_member | wave_running | top_tier | locked |
-- needs_tier | known | closed | insufficient_funds}.

create or replace function public.island_research(
  p_player_id     uuid,
  p_island_owner  uuid,
  p_branch        text,
  p_action_uid    text,
  p_price         integer,
  p_unlock_wave   integer,
  p_tier          integer,
  p_choice        text,
  p_change        boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_ref     text;
  v_balance bigint;
  v_island  public.islands;
  v_row     public.island_research;
  v_before  text;
begin
  if p_player_id is null or p_island_owner is null
     or p_branch is null or p_branch not in ('cannon', 'mortar', 'wall', 'watchtower')
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_price is null or p_price < 1
     or p_unlock_wave is null or p_unlock_wave < 0
     or p_tier is null or p_tier < 1
     or p_change is null
     or (p_tier = 1 and p_choice is not null)
     or (p_tier in (2, 3) and (p_choice is null or (p_branch, p_tier, p_choice) not in (
       ('cannon', 2, 'rapid_2'), ('cannon', 2, 'long_guns'),
       ('mortar', 2, 'quick_fuse'), ('mortar', 2, 'heavy_shells'),
       ('wall', 2, 'mason_drill'), ('wall', 2, 'thick_walls'),
       ('watchtower', 2, 'lookout_drill'), ('watchtower', 2, 'high_tower'),
       ('cannon', 3, 'broadside'), ('cannon', 3, 'grapeshot'),
       ('mortar', 3, 'shockwave'), ('mortar', 3, 'inferno'),
       ('wall', 3, 'bastion'), ('wall', 3, 'thorns'),
       ('watchtower', 3, 'eagle_eye'), ('watchtower', 3, 'war_drums')
     ))) then
    raise exception 'bad_research';
  end if;
  v_ref := 'research:' || p_action_uid;

  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  select * into v_island from public.islands where player_id = p_island_owner for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_island');
  end if;

  if exists (
    select 1 from public.wallet_transactions
     where player_id = p_player_id and reason = 'tech_research' and ref = v_ref
  ) then
    select * into v_row from public.island_research
     where island_owner = p_island_owner and branch = p_branch;
    return jsonb_build_object(
      'status', 'done', 'branch', p_branch, 'tier', coalesce(v_row.tier, 0), 'choice', p_choice,
      'balance', v_balance, 'repeat', true
    );
  end if;

  if p_player_id <> p_island_owner and not exists (
    select 1 from public.island_members
     where island_owner = p_island_owner and player_id = p_player_id and left_at is null
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'not_member');
  end if;
  -- No research step while a wave runs on this island: a tier-3 change takes the old
  -- capstone off the towers, and the wave is reading them. The same test as
  -- island_demolish() (20261112080000_demolish.sql); the island row is locked above.
  if exists (
    select 1 from public.wave_runs
     where island_owner = p_island_owner and finished_at is null
       and starts_at + make_interval(secs => maximum_seconds) >= now()
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'wave_running');
  end if;
  if p_tier > 3 then
    return jsonb_build_object('status', 'refused', 'reason', 'top_tier');
  end if;
  if v_island.wave_best < p_unlock_wave then
    return jsonb_build_object('status', 'refused', 'reason', 'locked');
  end if;

  select * into v_row from public.island_research
   where island_owner = p_island_owner and branch = p_branch
     for update;

  if p_tier = 1 then
    if v_row.island_owner is not null then
      return jsonb_build_object('status', 'refused', 'reason', 'known');
    end if;
  else
    if v_row.island_owner is null or v_row.tier < p_tier - 1 then
      return jsonb_build_object('status', 'refused', 'reason', 'needs_tier');
    end if;
    v_before := case p_tier when 2 then v_row.choice_2 else v_row.choice_3 end;
    if v_before = p_choice then
      return jsonb_build_object('status', 'refused', 'reason', 'known');
    end if;
    if v_before is not null and not p_change then
      return jsonb_build_object('status', 'refused', 'reason', 'closed', 'chosen', v_before);
    end if;
  end if;
  if v_balance < p_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', p_price);
  end if;

  v_balance := public.apply_wallet_transaction(p_player_id, -p_price, 'tech_research', v_ref);
  if p_tier = 1 then
    insert into public.island_research (island_owner, branch, researched_by, coins_paid, ref)
    values (p_island_owner, p_branch, p_player_id, p_price, v_ref);
  else
    update public.island_research
       set tier       = greatest(tier, p_tier),
           choice_2   = case when p_tier = 2 then p_choice else choice_2 end,
           choice_3   = case when p_tier = 3 then p_choice else choice_3 end,
           coins_paid = coins_paid + p_price,
           ref        = v_ref
     where island_owner = p_island_owner and branch = p_branch;
    -- A new tier-3 choice: the old capstone leaves every tower of the island that had it.
    if p_tier = 3 and v_before is not null then
      update public.islet_buildings set spec = null
       where player_id = p_island_owner and building_type = p_branch and spec = v_before;
    end if;
  end if;

  return jsonb_build_object(
    'status', 'done', 'branch', p_branch, 'tier', greatest(coalesce(v_row.tier, 0), p_tier),
    'choice', p_choice, 'balance', v_balance, 'repeat', false
  );
end;
$$;

revoke all on function public.island_research(uuid, uuid, text, text, integer, integer, integer, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.island_research(uuid, uuid, text, text, integer, integer, integer, text, boolean)
  to service_role;

comment on function public.island_research(uuid, uuid, text, text, integer, integer, integer, text, boolean) is
  'One research step at the Tech hub of the island of p_island_owner, paid by p_player_id (the host or an active member): tier 1 of a branch, or the option p_choice of tier 2 or 3 (docs/GAME-V3.md section 5.1); with p_change a switch from the option chosen before, at p_price again (a tier-3 switch clears the old capstone from the towers). Locks the payer''s wallet, then the island row, then the research row. A repeated actionUid (ledger ref research:<uid>, reason tech_research) answers {status: done, repeat: true}. Refuses player_not_set_up, no_island, not_member, wave_running (a wave runs on the island), top_tier (above 3), locked (the island''s best won wave below p_unlock_wave), needs_tier, known, closed (the other option was chosen and p_change is false) and insufficient_funds, with nothing changed. Only service_role may run it.';
