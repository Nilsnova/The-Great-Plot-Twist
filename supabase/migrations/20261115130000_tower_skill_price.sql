-- =============================================================================
-- 20261115130000_tower_skill_price.sql
--
-- WHAT IT DOES
--   Tower skills cost coins (decision D051, accepted by Nils on 15 Nov 2026).
--   Until now a tower picked one skill of its researched branch for free
--   (20261112060000_tech_hub.sql, 20261112100000_research_tiers.sql). Now each
--   pick, or switch to another skill, is paid once by the player who clicks,
--   from their own wallet (D043: no shared wallet):
--
--     wallet_reasons       one new reason, tower_skill (spend).
--     island_specialise()  the old 5-argument function is dropped and made again
--                          with two more arguments, p_action_uid and p_price.
--                          It takes the price with apply_wallet_transaction()
--                          (reason tower_skill, ref towerskill:<uid>) and sets
--                          the skill in the SAME step, under the island lock.
--
--   What stays free: picking the skill the tower has already (nothing changes,
--   nothing is paid) and a house role (p_branch house, p_price 0). Every check
--   of 20261112100000_research_tiers.sql stays word for word: the pairs, the
--   house branch (level 2, else house_level), research, the capstone.
--
-- WHO USES IT
--   Only the Python server, with the secret key (service_role): the route
--   POST /api/island/tower-skill of backend/server/routes/island.py. The price
--   comes from the server (backend/content/islands.json, research.branches
--   skillCoins: a tier-1 skill or the tier-3 capstone); the database only
--   compares it with the payer's balance. No browser role gets anything new.
--
-- THE RULES THAT THE DATABASE KEEPS
--   1. Play money only; coins move only through apply_wallet_transaction().
--   2. Only a member of the game picks there (the island's owner, or an
--      island_members row of that island with no left_at); else not_member.
--   3. A paid pick is safe to repeat: by its ledger row (player, reason
--      tower_skill, ref towerskill:<uid>). A repeat answers {status: done,
--      repeat: true} and changes nothing.
--   4. It locks the payer's wallet first, then the island row of the owner,
--      then the building (the order island_research() keeps).
--   5. A tower pick needs a price of at least 1 and an action id; a house role
--      a price of 0. Anything else is refused bad_specialise (a server bug).
--   6. Picking the skill the building has already costs nothing.
--
-- WHAT IT NEEDS
--   20261112100000_research_tiers.sql (the island_specialise() it replaces) and
--   everything before it (wallet_reasons, apply_wallet_transaction, islands,
--   island_members, island_research, islet_buildings.spec).
--
-- DEPLOY ORDER
--   The server of the same change calls the new 7-argument function. Apply this
--   file and deploy that server together: an old server would get "function not
--   found" from the database (a 502, nothing changed) until it is replaced.
--
-- SAFE TO RUN TWICE
--   The reason uses "on conflict do nothing", the old function is dropped "if
--   exists", the new one uses "create or replace", and revokes, grants and
--   comments repeat.
--
-- ROLLBACK (by hand)
--   drop function if exists public.island_specialise(uuid, uuid, text, text, text, text, integer);
--   then run section 4 of 20261112100000_research_tiers.sql again (the free
--   5-argument version) and deploy the server before D051. The reason
--   tower_skill stays (a reason is never removed); its ledger rows stay too.
--
-- HOW TO VERIFY (read-only queries, after applying)
--   a. select reason, direction from public.wallet_reasons where reason = 'tower_skill';
--      -- one row, spend
--   b. select pg_get_function_identity_arguments(p.oid) from pg_proc p
--       join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname = 'public' and p.proname = 'island_specialise';
--      -- one row, 7 arguments
--   c. Only the server may run it (browser and visitor false):
--      select has_function_privilege('authenticated', p.oid, 'execute') as browser,
--             has_function_privilege('anon', p.oid, 'execute') as visitor,
--             has_function_privilege('service_role', p.oid, 'execute') as server
--        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'public' and p.proname = 'island_specialise';
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The wallet reason
-- -----------------------------------------------------------------------------
-- The same pair ends WALLET_REASONS in backend/server/wallet.py (a test compares
-- them).

insert into public.wallet_reasons (reason, direction, description) values
  ('tower_skill', 'spend', 'One tower on an island picks a skill of its researched branch (D051).')
on conflict (reason) do nothing;


-- -----------------------------------------------------------------------------
-- 2. island_specialise(): a paid tower skill, a free house role
-- -----------------------------------------------------------------------------
--   p_island_owner  the island (the game's host)
--   p_plot          the building's spot
--   p_branch        its kind: cannon, mortar, wall, watchtower, or house
--   p_spec          the skill (or the house role)
--   p_action_uid    the click id (8 to 64 letters, digits, - or _); null for a
--                   house role
--   p_price         the coins of this pick (islands.json skillCoins); 0 for a
--                   house role
--
-- Returns {status: done, plot, spec, price, balance, repeat} (price 0 when the
-- building had that skill already or it is a house role) or {status: refused,
-- reason: player_not_set_up | no_island | not_member | not_built | wrong_kind |
-- not_researched | house_level | insufficient_funds (with price)}.

-- The signature changes: the old one goes first, so a second run is safe.
drop function if exists public.island_specialise(uuid, uuid, text, text, text);

create or replace function public.island_specialise(
  p_player_id     uuid,
  p_island_owner  uuid,
  p_plot          text,
  p_branch        text,
  p_spec          text,
  p_action_uid    text,
  p_price         integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_building public.islet_buildings;
  v_ref      text;
  v_balance  bigint;
begin
  if p_player_id is null or p_island_owner is null or p_plot is null
     or p_branch is null or p_spec is null
     or (p_branch, p_spec) not in (
       ('cannon', 'rapid'), ('cannon', 'heavy'), ('cannon', 'chain'),
       ('mortar', 'cluster'), ('mortar', 'fire_pot'), ('mortar', 'long_range'),
       ('wall', 'stone'), ('wall', 'spiked'), ('wall', 'quick_mend'),
       ('watchtower', 'spotter'), ('watchtower', 'signal_fire'),
       ('house', 'barracks'), ('house', 'tavern'), ('house', 'workshop'),
       ('cannon', 'broadside'), ('cannon', 'grapeshot'),
       ('mortar', 'shockwave'), ('mortar', 'inferno'),
       ('wall', 'bastion'), ('wall', 'thorns'),
       ('watchtower', 'eagle_eye'), ('watchtower', 'war_drums')
     )
     -- D051: a tower skill has a price and a click id; a house role is free.
     or p_price is null
     or (p_branch = 'house' and p_price <> 0)
     or (p_branch <> 'house' and (p_price < 1
         or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$')) then
    raise exception 'bad_specialise';
  end if;
  v_ref := case when p_branch = 'house' then null else 'towerskill:' || p_action_uid end;

  -- The payer's wallet first, then the island row, then the building.
  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  -- The island row first, as every write to an island's buildings does.
  perform 1 from public.islands where player_id = p_island_owner for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_island');
  end if;

  -- A repeated click: answered as done, nothing paid again.
  if v_ref is not null and exists (
    select 1 from public.wallet_transactions
     where player_id = p_player_id and reason = 'tower_skill' and ref = v_ref
  ) then
    return jsonb_build_object(
      'status', 'done', 'plot', p_plot, 'spec', p_spec, 'price', 0, 'balance', v_balance,
      'repeat', true
    );
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
  -- A capstone (tier 3): only the one the island chose.
  if p_spec in ('broadside', 'grapeshot', 'shockwave', 'inferno', 'bastion', 'thorns', 'eagle_eye', 'war_drums')
     and not exists (
       select 1 from public.island_research
        where island_owner = p_island_owner and branch = p_branch and choice_3 = p_spec
     ) then
    return jsonb_build_object('status', 'refused', 'reason', 'not_researched');
  end if;

  -- The skill it has already (or a house role): nothing to pay.
  if v_building.spec is not distinct from p_spec or p_branch = 'house' then
    update public.islet_buildings set spec = p_spec
     where player_id = p_island_owner and plot = p_plot and spec is distinct from p_spec;
    return jsonb_build_object(
      'status', 'done', 'plot', p_plot, 'spec', p_spec, 'price', 0, 'balance', v_balance,
      'repeat', false
    );
  end if;

  if v_balance < p_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', p_price);
  end if;
  v_balance := public.apply_wallet_transaction(p_player_id, -p_price, 'tower_skill', v_ref);
  update public.islet_buildings set spec = p_spec
   where player_id = p_island_owner and plot = p_plot;
  return jsonb_build_object(
    'status', 'done', 'plot', p_plot, 'spec', p_spec, 'price', p_price, 'balance', v_balance,
    'repeat', false
  );
end;
$$;

revoke all on function public.island_specialise(uuid, uuid, text, text, text, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.island_specialise(uuid, uuid, text, text, text, text, integer)
  to service_role;

comment on function public.island_specialise(uuid, uuid, text, text, text, text, integer) is
  'The tower on p_plot of the island of p_island_owner picks the skill p_spec of its kind p_branch, paid by p_player_id (the host or an active member) with p_price coins (D051; reason tower_skill, ref towerskill:<p_action_uid>): a tier-1 skill once the branch is researched, or the capstone the island chose at tier 3. Picking the skill the tower has already costs nothing. A house of level 2 or more picks a role (barracks, tavern or workshop) with p_branch house, p_price 0 and no research. Locks the payer''s wallet, then the island row, then the building. A repeated actionUid answers {status: done, repeat: true}. Refuses player_not_set_up, no_island, not_member, not_built, wrong_kind, not_researched (the branch is not researched there, or a capstone the island did not choose), house_level and insufficient_funds, with nothing changed. Only service_role may run it.';
