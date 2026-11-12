-- =============================================================================
-- 20261112100000_research_tiers.sql
--
-- WHAT IT DOES
--   The research tree of the Tech hub gets three tiers per tower kind
--   (docs/GAME-V3.md section 5.1, "a longer skill tree, with choices"):
--
--     tier 1   as before: the kind's skills open (every tower of that kind may
--              pick one of them)
--     tier 2   a choice of two bonuses for every tower of that kind. The island
--              picks ONE; the other one is closed for that island. The crew may
--              change it later for the tier's price again.
--     tier 3   a choice of two capstone skills. The island picks ONE; then a
--              tower of that kind may pick it as its skill. A change of the
--              tier-3 choice takes the old capstone off every tower that had it.
--
--     island_research       new columns tier (1 to 3, 1 for every row there
--                           is), choice_2 and choice_3 (the options chosen),
--                           with check rules: a choice only of its own kind and
--                           tier, and a choice for every tier reached.
--     islet_buildings       the check rule islet_buildings_spec_fits_kind
--                           again, with the eight capstones added.
--     island_research()     dropped and made again with three more arguments
--                           (p_tier, p_choice, p_change): one research step,
--                           raising the tier by one or changing a choice.
--     island_specialise()   made again: a tower may pick a capstone too, but
--                           only the one its island chose at tier 3.
--
-- WHO USES IT
--   Only the Python server, with the secret key (service_role): the routes
--   POST /api/island/research and /api/island/tower-skill of
--   backend/server/routes/island.py. The prices (islands.json research
--   coins, one per tier) and the unlock waves (campaign.json: tech_hub after
--   wave 8, research_2 after 15, research_3 after 25) come from the server;
--   the database only compares. No browser role gets anything new.
--
-- THE RULES THAT THE DATABASE KEEPS
--   1. Play money only; coins move only through apply_wallet_transaction().
--   2. Only a member of the game pays or picks there (the island's owner, or an
--      island_members row of that island with no left_at); else not_member.
--   3. Every research step is safe to repeat: by its ledger row (player,
--      reason tech_research, ref research:<uid>). A repeat answers
--      {status: done, repeat: true} and changes nothing.
--   4. A research step locks the payer's wallet first, then the island row of
--      the owner, then the research row (the order island_weapon_buy keeps).
--   5. The tier goes up one at a time and never above 3 (refused top_tier); a
--      tier whose wave the island has not won is refused locked; a tier above
--      the next one is refused needs_tier; the option chosen already is
--      refused known; the other option of a chosen tier is refused closed,
--      unless the call asks for a change (p_change), which pays again.
--   6. A tower carries a capstone only after its island chose it at tier 3.
--
-- WHAT IT NEEDS
--   20261112060000_tech_hub.sql (island_research, islet_buildings.spec,
--   island_research(), island_specialise()).
--
-- MERGE NOTE FOR THE CONTROLLER
--   20261112090000 (house roles, branch feat/v3-houses) changes the same check
--   rule islet_buildings_spec_fits_kind and makes island_specialise() again.
--   This file writes the rule with the full list known on main plus the eight
--   capstones, and island_specialise() as main has it plus the capstones. When
--   both land, merge the two lists (and both function bodies) in the later file.
--
-- SAFE TO RUN TWICE
--   Columns use "if not exists", check rules are dropped "if exists" first,
--   island_research() is dropped "if exists" (both signatures) before it is
--   made, island_specialise() uses "create or replace", and revokes, grants and
--   comments repeat.
--
-- HOW THE FILE IS ORGANISED
--   1. island_research: tier, choice_2, choice_3 and their check rules
--   2. islet_buildings: the skill check rule with the capstones
--   3. island_research(): one research step
--   4. island_specialise(): a tower picks a skill, a capstone only if chosen
--
-- HOW TO VERIFY (read-only queries, after applying)
--   a. select tier, choice_2, choice_3 from public.island_research limit 3;  -- 1, null, null
--   b. select pg_get_function_identity_arguments(p.oid) from pg_proc p
--       join pg_namespace n on n.oid = p.pronamespace
--      where n.nspname = 'public' and p.proname = 'island_research';     -- one row, 9 arguments
--   c. Only the server may run the functions (browser and visitor false):
--      select p.proname,
--             has_function_privilege('authenticated', p.oid, 'execute') as browser,
--             has_function_privilege('anon', p.oid, 'execute') as visitor,
--             has_function_privilege('service_role', p.oid, 'execute') as server
--        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'public' and p.proname in ('island_research', 'island_specialise');
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. island_research: the tier and the choices of tiers 2 and 3
-- -----------------------------------------------------------------------------
-- The option ids repeat backend/content/islands.json (research.branches tier2,
-- tier3) and frontend/src/campaign/tech.js; tests keep them equal.

alter table public.island_research add column if not exists tier smallint not null default 1;
alter table public.island_research add column if not exists choice_2 text;
alter table public.island_research add column if not exists choice_3 text;

alter table public.island_research drop constraint if exists island_research_tier_range;
alter table public.island_research
  add constraint island_research_tier_range check (tier between 1 and 3);

alter table public.island_research drop constraint if exists island_research_choice_fits;
alter table public.island_research
  add constraint island_research_choice_fits check (
    (choice_2 is null or (branch, choice_2) in (
      ('cannon', 'rapid_2'), ('cannon', 'long_guns'),
      ('mortar', 'quick_fuse'), ('mortar', 'heavy_shells'),
      ('wall', 'mason_drill'), ('wall', 'thick_walls'),
      ('watchtower', 'lookout_drill'), ('watchtower', 'high_tower')
    ))
    and (choice_3 is null or (branch, choice_3) in (
      ('cannon', 'broadside'), ('cannon', 'grapeshot'),
      ('mortar', 'shockwave'), ('mortar', 'inferno'),
      ('wall', 'bastion'), ('wall', 'thorns'),
      ('watchtower', 'eagle_eye'), ('watchtower', 'war_drums')
    ))
  );

-- A tier reached always has its choice, and a choice only comes with its tier.
alter table public.island_research drop constraint if exists island_research_choice_per_tier;
alter table public.island_research
  add constraint island_research_choice_per_tier check (
    (tier >= 2) = (choice_2 is not null) and (tier >= 3) = (choice_3 is not null)
  );

comment on column public.island_research.tier is
  'The research tier this branch reached on the island (docs/GAME-V3.md section 5.1): 1 the skills, 2 a bonus for every tower of the kind, 3 a capstone skill. Only island_research() raises it, one tier at a time.';
comment on column public.island_research.choice_2 is
  'The tier-2 bonus the crew chose (one of two of this kind), null below tier 2. The other option is closed; island_research() with p_change switches it for the tier''s price again.';
comment on column public.island_research.choice_3 is
  'The tier-3 capstone the crew chose (one of two of this kind), null below tier 3. Towers of this kind may pick it as their skill.';
comment on column public.island_research.coins_paid is
  'What the research of this branch cost so far, every tier and change together.';
comment on column public.island_research.ref is
  'research:<actionUid>, the ref of the ledger row of the latest research step of this branch.';

-- service_role now also raises the tier and changes a choice (no delete).
grant update (tier, choice_2, choice_3, coins_paid, ref) on table public.island_research to service_role;


-- -----------------------------------------------------------------------------
-- 2. islet_buildings: the tower skills, with the capstones of tier 3
-- -----------------------------------------------------------------------------
-- The full list known on main (20261112060000_tech_hub.sql) plus the eight
-- capstones. See the merge note in the header: 20261112090000 changes this rule
-- too.

alter table public.islet_buildings drop constraint if exists islet_buildings_spec_fits_kind;
alter table public.islet_buildings
  add constraint islet_buildings_spec_fits_kind check (
    spec is null or (building_type, spec) in (
      ('cannon', 'rapid'), ('cannon', 'heavy'), ('cannon', 'chain'),
      ('mortar', 'cluster'), ('mortar', 'fire_pot'), ('mortar', 'long_range'),
      ('wall', 'stone'), ('wall', 'spiked'), ('wall', 'quick_mend'),
      ('watchtower', 'spotter'), ('watchtower', 'signal_fire'),
      ('cannon', 'broadside'), ('cannon', 'grapeshot'),
      ('mortar', 'shockwave'), ('mortar', 'inferno'),
      ('wall', 'bastion'), ('wall', 'thorns'),
      ('watchtower', 'eagle_eye'), ('watchtower', 'war_drums')
    )
  );

comment on column public.islet_buildings.spec is
  'The tower skill this building picked at the Tech hub (docs/GAME-V3.md sections 5 and 5.1), or null: a tier-1 skill of its kind, or the capstone its island chose at tier 3. Only island_specialise() sets it; a change of the tier-3 choice in island_research() clears the old capstone.';


-- -----------------------------------------------------------------------------
-- 3. island_research(): one research step
-- -----------------------------------------------------------------------------
--   p_island_owner  the island (the game's host)
--   p_branch        cannon, mortar, wall or watchtower
--   p_price         the price of this tier in coins (islands.json); a change
--                   costs the tier's price again
--   p_unlock_wave   the island's best won wave this tier needs (campaign.json)
--   p_tier          1, 2 or 3: the tier researched (or whose choice changes)
--   p_choice        null for tier 1; for tiers 2 and 3 one of the tier's two
--                   options of the branch
--   p_change        true to switch from the option chosen before to p_choice
--
-- Returns {status: done, branch, tier, choice, balance, repeat} or {status:
-- refused, reason: player_not_set_up | no_island | not_member | top_tier |
-- locked | needs_tier | known | closed | insufficient_funds}.

-- The signature changes: the old one goes first (both, so a second run is safe).
drop function if exists public.island_research(uuid, uuid, text, text, integer, integer);
drop function if exists public.island_research(uuid, uuid, text, text, integer, integer, integer, text, boolean);

create function public.island_research(
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
  'One research step at the Tech hub of the island of p_island_owner, paid by p_player_id (the host or an active member): tier 1 of a branch, or the option p_choice of tier 2 or 3 (docs/GAME-V3.md section 5.1); with p_change a switch from the option chosen before, at p_price again (a tier-3 switch clears the old capstone from the towers). Locks the payer''s wallet, then the island row, then the research row. A repeated actionUid (ledger ref research:<uid>, reason tech_research) answers {status: done, repeat: true}. Refuses player_not_set_up, no_island, not_member, top_tier (above 3), locked (the island''s best won wave below p_unlock_wave), needs_tier, known, closed (the other option was chosen and p_change is false) and insufficient_funds, with nothing changed. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 4. island_specialise(): a tower picks one skill, a capstone only if chosen
-- -----------------------------------------------------------------------------
-- The same signature and checks as 20261112060000_tech_hub.sql, with the eight
-- capstones in the list of known skills and one more check: a capstone needs
-- its island's tier-3 choice to be that capstone (else not_researched).

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
       ('cannon', 'broadside'), ('cannon', 'grapeshot'),
       ('mortar', 'shockwave'), ('mortar', 'inferno'),
       ('wall', 'bastion'), ('wall', 'thorns'),
       ('watchtower', 'eagle_eye'), ('watchtower', 'war_drums')
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
  if not exists (
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
  'The tower on p_plot of the island of p_island_owner picks the skill p_spec of its kind p_branch (no coins; picking another one changes it): a tier-1 skill once the branch is researched, or the capstone the island chose at tier 3. Locks the island row, then the building. Refuses no_island, not_member (the caller is neither the host nor an active member), not_built, wrong_kind (another kind stands there) and not_researched (the branch is not researched there, or a capstone the island did not choose), with nothing changed. The same pick again changes nothing. Only service_role may run it.';
