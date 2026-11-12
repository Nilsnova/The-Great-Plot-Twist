-- =============================================================================
-- 20261112060000_tech_hub.sql
--
-- WHAT IT DOES
--   The database part of the campaign's Tech hub and the wreck (docs/GAME-V3.md
--   sections 4 and 5, lane P: "research for the towers", "a wreck washes ashore:
--   repair it over the next waves, coins from anyone").
--
--     island_research      one row per research branch done on an island: the
--                          Tech hub researched it once, any member paid, and
--                          every tower of that kind on the island may then pick
--                          one of its skills
--     islet_buildings      new column spec: the tower skill a building picked
--                          (rapid, heavy, chain for a cannon; cluster, fire_pot,
--                          long_range for a mortar; stone, spiked, quick_mend
--                          for a wall; spotter, signal_fire for a watchtower).
--                          A check rule allows only the skills of its kind.
--     islands              new column wreck_paid: the coins paid into the
--                          island's wreck so far (0 up to the goal)
--
--     island_research()    one research branch for the island of p_island_owner,
--                          paid by p_player_id (the host or a member) through the
--                          wallet ledger (reason tech_research, ref research:<uid>)
--     island_specialise()  one tower on the island picks one skill of its
--                          researched branch (no coins; picking again changes it)
--     island_wreck_repair() coins into the wreck of the island (reason
--                          wreck_repair, ref wreck:<uid>), never past the goal
--
--     wallet reasons       tech_research and wreck_repair (both spend).
--
-- WHO USES IT
--   Only the Python server, with the secret key (service_role): the routes
--   POST /api/island/research, /api/island/specialise and /api/island/wreck of
--   backend/server/routes/island.py. The prices, the goal, the gifts and the
--   unlock waves come from backend/content/islands.json and campaign.json
--   through the server; the database only compares. No browser role gets
--   anything new.
--
-- THE RULES THAT THE DATABASE KEEPS
--   1. Play money only; coins move only through apply_wallet_transaction().
--   2. Only a member of the game pays or picks there: the payer is the island's
--      owner (the host) or has an island_members row of that island with no
--      left_at. Anyone else is refused not_member.
--   3. Every paid write is safe to repeat: by its ledger row (player, reason,
--      ref). A repeat answers {status: done, repeat: true} and changes nothing.
--      Picking a skill is the same every time.
--   4. A paid action locks the payer's wallet first, then the island row of the
--      owner (the order island_weapon_buy keeps too).
--   5. A branch is researched once per island (primary key); a wreck never holds
--      more than the goal; a tower picks only a skill of its own kind, and only
--      after its branch is researched on that island.
--
-- WHAT IT NEEDS
--   Every earlier migration, in particular 20261111030000_tower_defense.sql
--   (islet_buildings on the island spots) and 20261112040000_game_rooms.sql
--   (island_members).
--
-- SAFE TO RUN TWICE
--   Columns and the table use "if not exists", the reasons "on conflict do
--   nothing", check rules are dropped "if exists" first, functions use
--   "create or replace", and revokes, grants and comments repeat.
--
-- HOW THE FILE IS ORGANISED
--   1. Two wallet reasons
--   2. New columns (islet_buildings.spec, islands.wreck_paid) with check rules
--   3. Table island_research
--   4. island_research()
--   5. island_specialise()
--   6. island_wreck_repair()
--
-- HOW TO VERIFY (read-only queries, after applying)
--   a. select relrowsecurity from pg_class where relname = 'island_research';  -- true
--      select count(*) from pg_policies where tablename = 'island_research';   -- 0
--   b. select reason, direction from public.wallet_reasons
--       where reason in ('tech_research', 'wreck_repair');                    -- 2 rows, spend
--   c. select spec from public.islet_buildings limit 3;                       -- null
--      select wreck_paid from public.islands limit 3;                         -- 0
--   d. Only the server may run the new functions (browser and visitor false):
--      select p.proname,
--             has_function_privilege('authenticated', p.oid, 'execute') as browser,
--             has_function_privilege('anon', p.oid, 'execute') as visitor,
--             has_function_privilege('service_role', p.oid, 'execute') as server
--        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'public'
--         and p.proname in ('island_research', 'island_specialise', 'island_wreck_repair');
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Two wallet reasons
-- -----------------------------------------------------------------------------
-- The same pairs end WALLET_REASONS in backend/server/wallet.py (a test compares
-- them).

insert into public.wallet_reasons (reason, direction, description) values
  ('tech_research', 'spend', 'Research at the Tech hub of an island: every tower of that kind there may pick a skill.'),
  ('wreck_repair',  'spend', 'Coins into the repair of the wreck on an island.')
on conflict (reason) do nothing;


-- -----------------------------------------------------------------------------
-- 2. New columns
-- -----------------------------------------------------------------------------
-- The skill ids repeat backend/content/islands.json (research.branches) and
-- frontend/src/campaign/tech.js; tests keep them equal.

alter table public.islet_buildings add column if not exists spec text;

alter table public.islet_buildings drop constraint if exists islet_buildings_spec_fits_kind;
alter table public.islet_buildings
  add constraint islet_buildings_spec_fits_kind check (
    spec is null or (building_type, spec) in (
      ('cannon', 'rapid'), ('cannon', 'heavy'), ('cannon', 'chain'),
      ('mortar', 'cluster'), ('mortar', 'fire_pot'), ('mortar', 'long_range'),
      ('wall', 'stone'), ('wall', 'spiked'), ('wall', 'quick_mend'),
      ('watchtower', 'spotter'), ('watchtower', 'signal_fire')
    )
  );

comment on column public.islet_buildings.spec is
  'The tower skill this building picked at the Tech hub (docs/GAME-V3.md section 5), or null. Only island_specialise() sets it, and only to a skill of its own kind.';

alter table public.islands add column if not exists wreck_paid integer not null default 0;

alter table public.islands drop constraint if exists islands_wreck_paid_range;
alter table public.islands
  add constraint islands_wreck_paid_range check (wreck_paid between 0 and 100000);

comment on column public.islands.wreck_paid is
  'The coins paid into the wreck of this island so far (docs/GAME-V3.md section 4). Only island_wreck_repair() raises it, never past the goal it is given.';


-- -----------------------------------------------------------------------------
-- 3. Table island_research: one row per branch researched on an island
-- -----------------------------------------------------------------------------

create table if not exists public.island_research (
  island_owner  uuid not null references public.islands (player_id) on delete cascade,
  branch        text not null,
  researched_by uuid not null references public.profiles (id) on delete cascade,
  coins_paid    integer not null,
  ref           text not null,
  researched_at timestamptz not null default now(),

  primary key (island_owner, branch),
  constraint island_research_branch_known
    check (branch in ('cannon', 'mortar', 'wall', 'watchtower')),
  constraint island_research_coins_paid_range
    check (coins_paid between 1 and 1000000),
  constraint island_research_ref_format
    check (ref ~ '^research:[A-Za-z0-9_-]{8,64}$')
);

comment on table public.island_research is
  'The Tech hub (docs/GAME-V3.md section 5): one row per research branch done on an island. Every tower of that kind on the island may then pick one of its skills. No browser access.';
comment on column public.island_research.island_owner is
  'The island (its owner, the game''s host) the research belongs to.';
comment on column public.island_research.branch is
  'The tower kind researched: cannon, mortar, wall or watchtower.';
comment on column public.island_research.researched_by is
  'The member who paid for it.';
comment on column public.island_research.coins_paid is
  'What the research cost them.';
comment on column public.island_research.ref is
  'research:<actionUid>, the ref of the ledger row that paid for it.';
comment on column public.island_research.researched_at is
  'When it was researched. Set by the database.';

-- Row-level security on and no policy: no browser role sees a row.
--   service_role  read, insert (island_research); no update, no delete
alter table public.island_research enable row level security;
revoke all on table public.island_research from public, anon, authenticated, service_role;
grant select, insert on table public.island_research to service_role;


-- -----------------------------------------------------------------------------
-- 4. island_research(): one research branch for the island
-- -----------------------------------------------------------------------------
--   p_island_owner  the island (the game's host)
--   p_branch        cannon, mortar, wall or watchtower
--   p_price         the price in coins (islands.json)
--   p_unlock_wave   the island's best won wave the Tech hub needs (campaign.json)
--
-- Returns {status: done, branch, balance, repeat} or {status: refused, reason:
-- player_not_set_up | no_island | not_member | locked | known |
-- insufficient_funds}.

create or replace function public.island_research(
  p_player_id     uuid,
  p_island_owner  uuid,
  p_branch        text,
  p_action_uid    text,
  p_price         integer,
  p_unlock_wave   integer
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
begin
  if p_player_id is null or p_island_owner is null
     or p_branch is null or p_branch not in ('cannon', 'mortar', 'wall', 'watchtower')
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_price is null or p_price < 1
     or p_unlock_wave is null or p_unlock_wave < 0 then
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
    return jsonb_build_object(
      'status', 'done', 'branch', p_branch, 'balance', v_balance, 'repeat', true
    );
  end if;

  if p_player_id <> p_island_owner and not exists (
    select 1 from public.island_members
     where island_owner = p_island_owner and player_id = p_player_id and left_at is null
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'not_member');
  end if;
  if v_island.wave_best < p_unlock_wave then
    return jsonb_build_object('status', 'refused', 'reason', 'locked');
  end if;
  if exists (
    select 1 from public.island_research where island_owner = p_island_owner and branch = p_branch
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'known');
  end if;
  if v_balance < p_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', p_price);
  end if;

  v_balance := public.apply_wallet_transaction(p_player_id, -p_price, 'tech_research', v_ref);
  insert into public.island_research (island_owner, branch, researched_by, coins_paid, ref)
  values (p_island_owner, p_branch, p_player_id, p_price, v_ref);

  return jsonb_build_object(
    'status', 'done', 'branch', p_branch, 'balance', v_balance, 'repeat', false
  );
end;
$$;

revoke all on function public.island_research(uuid, uuid, text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.island_research(uuid, uuid, text, text, integer, integer)
  to service_role;

comment on function public.island_research(uuid, uuid, text, text, integer, integer) is
  'Researches one tower branch at the Tech hub of the island of p_island_owner, paid by p_player_id (the host or an active member). Locks the payer''s wallet, then the island row. A repeated actionUid (ledger ref research:<uid>, reason tech_research) answers {status: done, repeat: true}. Refuses player_not_set_up, no_island, not_member, locked (the island''s best won wave below p_unlock_wave), known (researched there already) and insufficient_funds, with nothing changed. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 5. island_specialise(): a tower picks one skill of its researched branch
-- -----------------------------------------------------------------------------
--   p_plot    the spot of the tower on the island
--   p_branch  the kind the skill belongs to (the server reads it from the
--             skill); it must be the kind that stands on the spot
--   p_spec    the skill
--
-- Returns {status: done, plot, spec} or {status: refused, reason: no_island |
-- not_member | not_built | wrong_kind | not_researched}.

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
       ('watchtower', 'spotter'), ('watchtower', 'signal_fire')
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
  'The tower on p_plot of the island of p_island_owner picks the skill p_spec of its kind p_branch (no coins; picking another one changes it). Locks the island row, then the building. Refuses no_island, not_member (the caller is neither the host nor an active member), not_built, wrong_kind (another kind stands there) and not_researched (the branch is not researched on that island), with nothing changed. The same pick again changes nothing. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 6. island_wreck_repair(): coins into the wreck of an island
-- -----------------------------------------------------------------------------
--   p_amount       what the member gives (one of the gifts of islands.json)
--   p_goal         the coins the repair needs in all (islands.json)
--   p_unlock_wave  the island's best won wave the wreck needs (campaign.json)
--
-- A gift is cut to what the repair still needs, so the wreck never holds more
-- than p_goal. Returns {status: done, paid, gift, balance, repeat} (paid: the
-- island's total, gift: what this call took) or {status: refused, reason:
-- player_not_set_up | no_island | not_member | locked | repaired |
-- insufficient_funds}.

create or replace function public.island_wreck_repair(
  p_player_id     uuid,
  p_island_owner  uuid,
  p_amount        integer,
  p_action_uid    text,
  p_goal          integer,
  p_unlock_wave   integer
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
  v_gift    integer;
begin
  if p_player_id is null or p_island_owner is null
     or p_amount is null or p_amount < 1
     or p_goal is null or p_goal not between 1 and 100000
     or p_unlock_wave is null or p_unlock_wave < 0
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$' then
    raise exception 'bad_wreck_repair';
  end if;
  v_ref := 'wreck:' || p_action_uid;

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
     where player_id = p_player_id and reason = 'wreck_repair' and ref = v_ref
  ) then
    return jsonb_build_object(
      'status', 'done', 'paid', v_island.wreck_paid, 'gift', 0, 'balance', v_balance,
      'repeat', true
    );
  end if;

  if p_player_id <> p_island_owner and not exists (
    select 1 from public.island_members
     where island_owner = p_island_owner and player_id = p_player_id and left_at is null
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'not_member');
  end if;
  if v_island.wave_best < p_unlock_wave then
    return jsonb_build_object('status', 'refused', 'reason', 'locked');
  end if;
  if v_island.wreck_paid >= p_goal then
    return jsonb_build_object('status', 'refused', 'reason', 'repaired');
  end if;
  v_gift := least(p_amount, p_goal - v_island.wreck_paid);
  if v_balance < v_gift then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', v_gift);
  end if;

  v_balance := public.apply_wallet_transaction(p_player_id, -v_gift, 'wreck_repair', v_ref);
  update public.islands set wreck_paid = wreck_paid + v_gift
   where player_id = p_island_owner
  returning * into v_island;

  return jsonb_build_object(
    'status', 'done', 'paid', v_island.wreck_paid, 'gift', v_gift, 'balance', v_balance,
    'repeat', false
  );
end;
$$;

revoke all on function public.island_wreck_repair(uuid, uuid, integer, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.island_wreck_repair(uuid, uuid, integer, text, integer, integer)
  to service_role;

comment on function public.island_wreck_repair(uuid, uuid, integer, text, integer, integer) is
  'Pays coins of p_player_id (the host or an active member) into the wreck of the island of p_island_owner, cut to what the repair still needs (never past p_goal). Locks the payer''s wallet, then the island row. A repeated actionUid (ledger ref wreck:<uid>, reason wreck_repair) answers {status: done, repeat: true}. Refuses player_not_set_up, no_island, not_member, locked (the island''s best won wave below p_unlock_wave), repaired (at the goal already) and insufficient_funds, with nothing changed. Only service_role may run it.';
