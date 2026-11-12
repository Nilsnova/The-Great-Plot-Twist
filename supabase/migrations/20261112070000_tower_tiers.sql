-- =============================================================================
-- 20261112070000_tower_tiers.sql
--
-- WHAT IT DOES
--   Opens building levels 4 and 5, the tower tiers of the campaign
--   (docs/GAME-V3.md sections 4 and 4.1: "12, 15, 20: new tower tiers").
--
--     islet_buildings          the check rule on level allows 1 to 5 (was 1 to 3)
--     pirate_point_buildings   the same (Pirate Point shares the prices)
--     island_upgrade()         accepts a price list of 1 to 5 levels (was 1 to 3)
--     pp_upgrade()             the same
--
--   Nothing else changes: the functions are the ones of
--   20261111030000_tower_defense.sql, word for word, except the length check of
--   p_prices.
--
-- WHY
--   The campaign table (backend/content/campaign.json) and the narrator promise
--   new tower levels after waves 12, 15 and 20, and the late waves (50 to 100)
--   need them: level 4 for cannons and walls and level 3 for the watchtower
--   after wave 12, level 4 for mortars and the watchtower after 15, level 5 for
--   all four after 20. The house keeps its two levels.
--
-- NOTES
--   - The prices and the waves stay where they were: backend/content/islands.json
--     (kinds[].prices, now five per tower kind) and campaign.json. The server
--     sends them as p_prices and p_unlocked_level; the database still only
--     compares. max_level is the length of p_prices; locked is above
--     p_unlocked_level. So a level 4 before wave 12 is refused by the server
--     (409 locked, "Opens after wave 12.") and, if a server ever sent it, by the
--     database too (p_unlocked_level 3).
--   - island_build() and pp_build() write level 1 only: unchanged.
--   - The biggest price (a level-5 mortar, 960 coins) is far below the
--     coins_paid ceiling of 1 000 000 and the wallet's MAX_DELTA.
--   - No browser role gets anything new; the grants repeat the old ones.
--
-- WHAT IT NEEDS
--   20261106070000_home_islet.sql (islet_buildings_level_range) and
--   20261111030000_tower_defense.sql (pirate_point_buildings_level_range,
--   island_upgrade(), pp_upgrade()).
--
-- SAFE TO RUN TWICE
--   The check rules are dropped "if exists" first and added again; the
--   functions use "create or replace"; revokes, grants and comments repeat.
--
-- HOW THE FILE IS ORGANISED
--   1. The level check rules, 1 to 5
--   2. island_upgrade(), up to five levels
--   3. pp_upgrade(), up to five levels
--
-- HOW TO VERIFY (read-only queries, after applying)
--   a. select conname, pg_get_constraintdef(oid) from pg_constraint
--       where conname in ('islet_buildings_level_range',
--                         'pirate_point_buildings_level_range');
--      -- 2 rows, both CHECK (((level >= 1) AND (level <= 5)))
--   b. select max(level) from public.islet_buildings;          -- 3 or less until
--      select max(level) from public.pirate_point_buildings;   -- someone upgrades
--   c. select position('between 1 and 5' in prosrc) > 0 as five
--        from pg_proc where proname in ('island_upgrade', 'pp_upgrade');  -- true, true
--   d. Only the server may run them (browser and visitor false, server true):
--      select p.proname,
--             has_function_privilege('authenticated', p.oid, 'execute') as browser,
--             has_function_privilege('anon', p.oid, 'execute') as visitor,
--             has_function_privilege('service_role', p.oid, 'execute') as server
--        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'public' and p.proname in ('island_upgrade', 'pp_upgrade');
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The level check rules, 1 to 5
-- -----------------------------------------------------------------------------
-- The names are the ones of 20261106070000_home_islet.sql and
-- 20261111030000_tower_defense.sql.

alter table public.islet_buildings drop constraint if exists islet_buildings_level_range;
alter table public.islet_buildings
  add constraint islet_buildings_level_range check (level between 1 and 5);

alter table public.pirate_point_buildings drop constraint if exists pirate_point_buildings_level_range;
alter table public.pirate_point_buildings
  add constraint pirate_point_buildings_level_range check (level between 1 and 5);

comment on column public.islet_buildings.level is
  'The level of the building, from 1 to 5 (levels 4 and 5 since 20261112070000_tower_tiers.sql). islet_build() and island_build() build level 1; island_upgrade() raises it.';
comment on column public.pirate_point_buildings.level is
  'The level, 1 to 5.';


-- -----------------------------------------------------------------------------
-- 2. island_upgrade(), up to five levels
-- -----------------------------------------------------------------------------
-- As in 20261111030000_tower_defense.sql section 5; only the length check of
-- p_prices changes (1 to 5 levels).
--   p_prices          the price list of the building's kind from islands.json,
--                     index 1 = level 1 (the build), 2 = level 2, ...; its
--                     length is the maximum level
--   p_unlocked_level  the highest level this player has unlocked for the kind
--
-- Returns {status: done, level, balance, repeat} or {status: refused, reason:
-- player_not_set_up | not_built | max_level | locked | insufficient_funds,
-- price?} with nothing changed.

create or replace function public.island_upgrade(
  p_player_id      uuid,
  p_island_owner   uuid,
  p_plot           text,
  p_action_uid     text,
  p_prices         integer[],
  p_unlocked_level integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_ref      text;
  v_balance  bigint;
  v_building public.islet_buildings;
  v_price    integer;
begin
  if p_player_id is null or p_island_owner is null or p_plot is null or p_unlocked_level is null
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_prices is null or coalesce(array_length(p_prices, 1), 0) not between 1 and 5
     or exists (select 1 from unnest(p_prices) price where price is null or price < 1) then
    raise exception 'bad_upgrade';
  end if;
  v_ref := 'upgrade:' || p_action_uid;

  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  select * into v_building
    from public.islet_buildings
   where player_id = p_island_owner and plot = p_plot
     for update;

  if exists (
    select 1 from public.wallet_transactions
     where player_id = p_player_id and reason = 'building_purchase' and ref = v_ref
  ) then
    return jsonb_build_object(
      'status', 'done', 'level', coalesce(v_building.level, 0), 'balance', v_balance,
      'repeat', true
    );
  end if;

  if v_building.player_id is null then
    return jsonb_build_object('status', 'refused', 'reason', 'not_built');
  end if;
  if v_building.level >= array_length(p_prices, 1) then
    return jsonb_build_object('status', 'refused', 'reason', 'max_level');
  end if;
  if v_building.level + 1 > p_unlocked_level then
    return jsonb_build_object('status', 'refused', 'reason', 'locked');
  end if;
  v_price := p_prices[v_building.level + 1];
  if v_balance < v_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', v_price);
  end if;

  v_balance := public.apply_wallet_transaction(p_player_id, -v_price, 'building_purchase', v_ref);
  update public.islet_buildings
     set level = level + 1, coins_paid = coins_paid + v_price
   where player_id = p_island_owner and plot = p_plot
  returning * into v_building;

  return jsonb_build_object(
    'status', 'done', 'level', v_building.level, 'balance', v_balance, 'repeat', false
  );
end;
$$;

revoke all on function public.island_upgrade(uuid, uuid, text, text, integer[], integer)
  from public, anon, authenticated, service_role;
grant execute on function public.island_upgrade(uuid, uuid, text, text, integer[], integer)
  to service_role;

comment on function public.island_upgrade(uuid, uuid, text, text, integer[], integer) is
  'Raises one building on the island of p_island_owner by one level, paid by p_player_id (the owner or a visitor). Locks the payer''s wallet, then the building. A repeated actionUid (ledger ref upgrade:<uid>, reason building_purchase) answers {status: done, repeat: true}. Refuses not_built, max_level (the length of p_prices), locked (above p_unlocked_level) and insufficient_funds, with nothing changed. Only service_role may run it.';



-- -----------------------------------------------------------------------------
-- 3. pp_upgrade(), up to five levels
-- -----------------------------------------------------------------------------
-- As in 20261111030000_tower_defense.sql section 8; only the length check of
-- p_prices changes (1 to 5 levels).

create or replace function public.pp_upgrade(
  p_player_id      uuid,
  p_spot           text,
  p_kind           text,
  p_action_uid     text,
  p_prices         integer[],
  p_unlocked_level integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_ref      text;
  v_balance  bigint;
  v_building public.pirate_point_buildings;
  v_price    integer;
begin
  if p_player_id is null or p_spot is null or p_kind is null or p_unlocked_level is null
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_prices is null or coalesce(array_length(p_prices, 1), 0) not between 1 and 5
     or exists (select 1 from unnest(p_prices) price where price is null or price < 1) then
    raise exception 'bad_pp_upgrade';
  end if;
  v_ref := 'pp:' || p_action_uid;

  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;
  perform pg_advisory_xact_lock(hashtext('public.pirate_point_buildings'));

  select * into v_building from public.pirate_point_buildings where spot = p_spot;

  if exists (
    select 1 from public.wallet_transactions
     where player_id = p_player_id and reason = 'building_purchase' and ref = v_ref
  ) then
    return jsonb_build_object(
      'status', 'done', 'level', coalesce(v_building.level, 0), 'balance', v_balance,
      'repeat', true
    );
  end if;

  if v_building.spot is null then
    return jsonb_build_object('status', 'refused', 'reason', 'not_built');
  end if;
  if v_building.kind <> p_kind then
    return jsonb_build_object('status', 'refused', 'reason', 'wrong_kind');
  end if;
  if v_building.level >= array_length(p_prices, 1) then
    return jsonb_build_object('status', 'refused', 'reason', 'max_level');
  end if;
  if v_building.level + 1 > p_unlocked_level then
    return jsonb_build_object('status', 'refused', 'reason', 'locked');
  end if;
  v_price := p_prices[v_building.level + 1];
  if v_balance < v_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', v_price);
  end if;

  v_balance := public.apply_wallet_transaction(p_player_id, -v_price, 'building_purchase', v_ref);
  update public.pirate_point_buildings
     set level = level + 1, coins_paid = coins_paid + v_price
   where spot = p_spot
  returning * into v_building;

  return jsonb_build_object(
    'status', 'done', 'level', v_building.level, 'balance', v_balance, 'repeat', false
  );
end;
$$;

revoke all on function public.pp_upgrade(uuid, text, text, text, integer[], integer)
  from public, anon, authenticated, service_role;
grant execute on function public.pp_upgrade(uuid, text, text, text, integer[], integer)
  to service_role;

comment on function public.pp_upgrade(uuid, text, text, text, integer[], integer) is
  'Raises one Pirate Point building by one level, paid by p_player_id (reason building_purchase, ref pp:<uid>). Locks the wallet, then all of Pirate Point. A repeat answers {status: done, repeat: true}. Refuses not_built, wrong_kind (p_kind is not what stands there), max_level, locked and insufficient_funds, with nothing changed. Only service_role may run it.';
