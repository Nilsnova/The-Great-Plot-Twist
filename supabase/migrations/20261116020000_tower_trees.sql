-- =============================================================================
-- 20261116020000_tower_trees.sql
--
-- WHAT IT DOES
--   Tower upgrade trees and the swivel-gun nest (decision D055, accepted by Nils
--   on 16 Nov 2026; docs/GAME-V3.md section 5.4).
--
--   1. After level 5 a cannon, mortar, harpoon tower, culverin or swivel-gun
--      nest grows on in a small tree of two paths with three tiers each: path a
--      makes it fire faster, path b hit harder. One path may go to tier 3; once
--      a path is past tier 1 the other stays at tier 1 at most. Each tier is
--      paid once by the player who clicks, from their own wallet (D043).
--
--        wallet_reasons     one new reason, tower_tree (spend).
--        islet_buildings    two new columns, tree_a and tree_b (smallint, 0 to 3,
--                           default 0: every existing row keeps its level and
--                           skill and has an empty tree), and two new check
--                           rules: islet_buildings_tree_range (0 to 3, at most
--                           one path past tier 1) and islet_buildings_tree_fits_kind
--                           (a tree only on a level-5 tower of a kind with one).
--        island_tower_tree()  a NEW function: one tier, paid with
--                           apply_wallet_transaction() (reason tower_tree, ref
--                           towertree:<uid>) and set in the SAME step, under the
--                           island lock.
--
--   2. The swivel-gun nest's spot rule is NOT in this file: widening the check
--      rule islet_buildings_plot_fits_building has to replace the old rule, which
--      a live migration of this sprint may not do. It is the follow-up file
--      20261116020100_swivel_spot_rule.sql (apply it after this one; until then
--      the database refuses a swivel build with a check violation and the server
--      answers 502, nothing charged).
--
--   This file only adds: one insert, two new columns, two new
--   check rules and one new function. island_specialise(), island_upgrade() and
--   every other function stay as they are: a tree is a new function beside them.
--
-- WHO USES IT
--   Only the Python server, with the secret key (service_role): the route
--   POST /api/island/tower-tree of backend/server/routes/island.py (and the
--   reads of islet_buildings, which now select tree_a and tree_b). The price,
--   the opening wave of the tier and the level a tree needs come from the
--   server (backend/content/tower_trees.json, campaign.json tree_1..tree_3); the
--   database compares them with the payer's balance, the island's best won wave
--   and the building. No browser role gets anything new.
--
-- THE RULES THAT THE DATABASE KEEPS
--   1. Play money only; coins move only through apply_wallet_transaction().
--   2. Only a member of the game buys there (the island's owner, or an
--      island_members row of that island with no left_at); else not_member.
--   3. A tier is safe to repeat: by its ledger row (player, reason tower_tree,
--      ref towertree:<uid>). A repeat answers {status: done, repeat: true} and
--      changes nothing.
--   4. It locks the payer's wallet first, then the island row of the owner,
--      then the building (the order island_specialise() keeps).
--   5. The tier must be the next one of its path (needs_tier, known), the other
--      path must not be past tier 1 when this one would pass it (closed), the
--      building must be a tower of p_kind at level p_level (wrong_kind,
--      needs_level) and the island's best won wave at least p_unlock_wave
--      (locked).
--   6. The check rules hold even if a future function forgets: a tree only on a
--      level-5 tower of a kind with a tree, 0 to 3 a path, one path past tier 1.
--
-- WHAT IT NEEDS
--   20261115130000_
--   tower_skill_price.sql (the order of the locks it copies) and everything
--   before them (wallet_reasons, apply_wallet_transaction, islands,
--   island_members, islet_buildings).
--
-- DEPLOY ORDER
--   Apply this file BEFORE the server of the same change starts: that server
--   reads islet_buildings.tree_a and tree_b on every island answer and would
--   get "column does not exist" (a 502) from an older database. An older server
--   on this database keeps working (it never asks for the new columns, and
--   every existing row is valid).
--
-- SAFE TO RUN TWICE
--   The reason uses "on conflict do nothing", the columns "add column if not
--   exists", the new check rules are added only when they are missing, the function uses "create or replace",
--   and revokes, grants and comments repeat.
--
-- ROLLBACK (by hand)
--   Nothing to undo for an older server: the columns, their rules, the reason and
--   island_tower_tree() can stay unused; a reason and its ledger rows are never
--   removed.
--
-- HOW TO VERIFY (read-only queries, after applying)
--   a. select reason, direction from public.wallet_reasons where reason = 'tower_tree';
--      -- one row, spend
--   b. select column_name, data_type, column_default from information_schema.columns
--       where table_schema = 'public' and table_name = 'islet_buildings'
--         and column_name in ('tree_a', 'tree_b');
--      -- two rows, smallint, default 0
--   c. select conname, pg_get_constraintdef(oid) from pg_constraint
--       where conname in ('islet_buildings_tree_range', 'islet_buildings_tree_fits_kind');
--      -- two rows
--   d. Only the server may run the new function (browser and visitor false):
--      select has_function_privilege('authenticated', p.oid, 'execute') as browser,
--             has_function_privilege('anon', p.oid, 'execute') as visitor,
--             has_function_privilege('service_role', p.oid, 'execute') as server
--        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'public' and p.proname = 'island_tower_tree';
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The wallet reason
-- -----------------------------------------------------------------------------
-- The same pair ends WALLET_REASONS in backend/server/wallet.py (a test compares
-- them).

insert into public.wallet_reasons (reason, direction, description) values
  ('tower_tree', 'spend', 'One tier of the upgrade tree of a level-5 tower on an island (D055).')
on conflict (reason) do nothing;


-- -----------------------------------------------------------------------------
-- 2. The tree of a building: two paths, 0 to 3 tiers each
-- -----------------------------------------------------------------------------

alter table public.islet_buildings add column if not exists tree_a smallint not null default 0;
alter table public.islet_buildings add column if not exists tree_b smallint not null default 0;

comment on column public.islet_buildings.tree_a is
  'D055: the tiers bought on path a (it fires faster) of this tower''s upgrade tree, 0 to 3.';
comment on column public.islet_buildings.tree_b is
  'D055: the tiers bought on path b (it hits harder) of this tower''s upgrade tree, 0 to 3.';

-- New rules only (nothing to replace): added when missing, so a second run is safe.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.islet_buildings'::regclass and conname = 'islet_buildings_tree_range'
  ) then
    alter table public.islet_buildings
      add constraint islet_buildings_tree_range
        check (tree_a between 0 and 3 and tree_b between 0 and 3 and least(tree_a, tree_b) <= 1);
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.islet_buildings'::regclass and conname = 'islet_buildings_tree_fits_kind'
  ) then
    alter table public.islet_buildings
      add constraint islet_buildings_tree_fits_kind
        check ((tree_a = 0 and tree_b = 0)
          or (building_type in ('cannon', 'mortar', 'harpoon', 'culverin', 'swivel') and level = 5));
  end if;
end
$$;

comment on constraint islet_buildings_tree_range on public.islet_buildings is
  'D055: each path of a tower''s tree has 0 to 3 tiers, and at most one path is past tier 1.';
comment on constraint islet_buildings_tree_fits_kind on public.islet_buildings is
  'D055: only a level-5 cannon, mortar, harpoon, culverin or swivel has an upgrade tree (tower_trees.json).';


-- -----------------------------------------------------------------------------
-- 3. island_tower_tree(): one paid tier of a tower's tree
-- -----------------------------------------------------------------------------
--   p_player_id     the payer (the host or an active member)
--   p_island_owner  the island (the game's host)
--   p_plot          the building's spot
--   p_kind          its kind: cannon, mortar, harpoon, culverin or swivel
--   p_path          a or b
--   p_tier          1, 2 or 3: the tier this click buys (the next one of its path)
--   p_action_uid    the click id (8 to 64 letters, digits, - or _)
--   p_price         the coins of this tier (tower_trees.json), at least 1
--   p_unlock_wave   the island's best won wave this tier needs (campaign.json)
--   p_level         the level a tower needs before its tree opens (5)
--
-- Returns {status: done, plot, path, tier, price, balance, repeat} or {status:
-- refused, reason: player_not_set_up | no_island | not_member | not_built |
-- wrong_kind | needs_level | locked | known | needs_tier | closed |
-- insufficient_funds (with price)}.

create or replace function public.island_tower_tree(
  p_player_id     uuid,
  p_island_owner  uuid,
  p_plot          text,
  p_kind          text,
  p_path          text,
  p_tier          integer,
  p_action_uid    text,
  p_price         integer,
  p_unlock_wave   integer,
  p_level         integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_building public.islet_buildings;
  v_wave     integer;
  v_ref      text;
  v_balance  bigint;
  v_now      integer;
  v_other    integer;
begin
  if p_player_id is null or p_island_owner is null or p_plot is null
     or p_kind is null or p_kind not in ('cannon', 'mortar', 'harpoon', 'culverin', 'swivel')
     or p_path is null or p_path not in ('a', 'b')
     or p_tier is null or p_tier not between 1 and 3
     or p_price is null or p_price < 1
     or p_unlock_wave is null or p_unlock_wave < 0
     or p_level is null or p_level not between 1 and 5
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$' then
    raise exception 'bad_tower_tree';
  end if;
  v_ref := 'towertree:' || p_action_uid;

  -- The payer's wallet first, then the island row, then the building.
  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  select wave_best into v_wave from public.islands where player_id = p_island_owner for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_island');
  end if;

  -- A repeated click: answered as done, nothing paid again.
  if exists (
    select 1 from public.wallet_transactions
     where player_id = p_player_id and reason = 'tower_tree' and ref = v_ref
  ) then
    return jsonb_build_object(
      'status', 'done', 'plot', p_plot, 'path', p_path, 'tier', p_tier, 'price', 0,
      'balance', v_balance, 'repeat', true
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
  if v_building.building_type <> p_kind then
    return jsonb_build_object('status', 'refused', 'reason', 'wrong_kind');
  end if;
  if v_building.level < p_level then
    return jsonb_build_object('status', 'refused', 'reason', 'needs_level');
  end if;
  if v_wave < p_unlock_wave then
    return jsonb_build_object('status', 'refused', 'reason', 'locked');
  end if;

  v_now   := case when p_path = 'a' then v_building.tree_a else v_building.tree_b end;
  v_other := case when p_path = 'a' then v_building.tree_b else v_building.tree_a end;
  if v_now >= p_tier then
    return jsonb_build_object('status', 'refused', 'reason', 'known');
  end if;
  if v_now < p_tier - 1 then
    return jsonb_build_object('status', 'refused', 'reason', 'needs_tier');
  end if;
  -- The Bloons rule: one path may pass tier 1, never both.
  if p_tier > 1 and v_other > 1 then
    return jsonb_build_object('status', 'refused', 'reason', 'closed');
  end if;

  if v_balance < p_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', p_price);
  end if;
  v_balance := public.apply_wallet_transaction(p_player_id, -p_price, 'tower_tree', v_ref);
  if p_path = 'a' then
    update public.islet_buildings set tree_a = p_tier
     where player_id = p_island_owner and plot = p_plot;
  else
    update public.islet_buildings set tree_b = p_tier
     where player_id = p_island_owner and plot = p_plot;
  end if;
  return jsonb_build_object(
    'status', 'done', 'plot', p_plot, 'path', p_path, 'tier', p_tier, 'price', p_price,
    'balance', v_balance, 'repeat', false
  );
end;
$$;

revoke all on function public.island_tower_tree(uuid, uuid, text, text, text, integer, text, integer, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.island_tower_tree(uuid, uuid, text, text, text, integer, text, integer, integer, integer)
  to service_role;

comment on function public.island_tower_tree(uuid, uuid, text, text, text, integer, text, integer, integer, integer) is
  'One tier (p_tier, the next one of path p_path: a faster, b harder) of the upgrade tree of the level-p_level tower of kind p_kind on p_plot of the island of p_island_owner, paid by p_player_id (the host or an active member) with p_price coins (D055; reason tower_tree, ref towertree:<p_action_uid>). One path may pass tier 1, never both. Locks the payer''s wallet, then the island row, then the building. A repeated actionUid answers {status: done, repeat: true}. Refuses player_not_set_up, no_island, not_member, not_built, wrong_kind, needs_level, locked (the island''s best won wave below p_unlock_wave), known, needs_tier, closed and insufficient_funds, with nothing changed. Only service_role may run it.';
