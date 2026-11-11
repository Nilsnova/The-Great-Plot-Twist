-- =============================================================================
-- 20261112030000_captain_skills.sql
--
-- WHAT IT DOES
--   The database part of the captain's skill tree and weapon shop
--   (docs/TOWER-DEFENSE.md sections 14 and 15, owner 11 Nov: "a skill tree for
--   the player themselves", "a weapon shop with cool upgrades").
--
--     islands              new columns: captain_skills (the skills this player
--                          learnt), weapons_owned (the weapons bought, always
--                          with the musket) and weapon_equipped (the one the
--                          captain carries). Check rules allow only known ids.
--     captain_skill_learns one row per learnt skill: the click (actionUid) that
--                          learnt it, so a repeated click is answered, not
--                          learnt twice
--
--     island_learn_skill() one skill, paid with skill points (no coins): one
--                          point per two won waves (won_wave_best), minus the
--                          points already spent; tier order inside a branch
--     island_weapon_buy()  one weapon, paid in coins through the wallet ledger
--                          (reason weapon_purchase, ref weapon:<uid>); it is
--                          equipped at once
--     island_weapon_equip() carry a weapon you own
--
--     wallet reason        weapon_purchase (spend).
--
-- WHO USES IT
--   Only the Python server, with the secret key (service_role): the routes of
--   backend/server/routes/island.py. The tree (ids, tier order, costs), the
--   waves per point, the weapon prices and their unlock waves come from
--   backend/content/islands.json through the server; the database only
--   compares. No browser role gets anything new.
--
-- THE RULES THAT THE DATABASE KEEPS
--   1. Play money only; coins move only through apply_wallet_transaction().
--   2. Every write is safe to repeat: a skill by its row in
--      captain_skill_learns (player, ref skill:<uid>), a weapon by its ledger
--      row (player, weapon_purchase, weapon:<uid>). A repeat answers
--      {status: done, repeat: true} and changes nothing. Equipping is the same
--      every time.
--   3. A paid action locks the wallet first, then the island row; a skill
--      locks the island row (it holds the skills and won_wave_best).
--   4. Skill points spent never pass floor(won_wave_best / waves per point).
--   5. The equipped weapon is always one the player owns; the musket is always
--      owned.
--
-- WHAT IT NEEDS
--   Every earlier migration, in particular 20261110010000_islands_and_waves.sql
--   and 20261111030000_tower_defense.sql (won_wave_best, the captain).
--
-- SAFE TO RUN TWICE
--   Columns and the table use "if not exists", the reason "on conflict do
--   nothing", check rules are dropped "if exists" first, functions use
--   "create or replace", and revokes, grants and comments repeat.
--
-- HOW THE FILE IS ORGANISED
--   1. One wallet reason
--   2. New columns of islands, with their check rules
--   3. Table captain_skill_learns
--   4. island_learn_skill()
--   5. island_weapon_buy() and island_weapon_equip()
--
-- HOW TO VERIFY (read-only queries, after applying)
--   a. select relrowsecurity from pg_class where relname = 'captain_skill_learns'; -- true
--      select count(*) from pg_policies where tablename = 'captain_skill_learns';  -- 0
--   b. select reason, direction from public.wallet_reasons
--       where reason = 'weapon_purchase';                                        -- 1 row, spend
--   c. select captain_skills, weapons_owned, weapon_equipped from public.islands
--       limit 3;                                                                 -- {}, {musket}, musket
--   d. Only the server may run the new functions (browser and visitor false):
--      select p.proname,
--             has_function_privilege('authenticated', p.oid, 'execute') as browser,
--             has_function_privilege('anon', p.oid, 'execute') as visitor,
--             has_function_privilege('service_role', p.oid, 'execute') as server
--        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'public'
--         and p.proname in ('island_learn_skill', 'island_weapon_buy', 'island_weapon_equip');
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. One wallet reason
-- -----------------------------------------------------------------------------
-- The same pair ends WALLET_REASONS in backend/server/wallet.py (a test compares
-- them).

insert into public.wallet_reasons (reason, direction, description) values
  ('weapon_purchase', 'spend', 'Buying a weapon for your captain in the weapon shop.')
on conflict (reason) do nothing;


-- -----------------------------------------------------------------------------
-- 2. New columns of islands
-- -----------------------------------------------------------------------------
-- The ids repeat backend/content/islands.json (captainSkills.tree, weapons) and
-- frontend/src/pirates/captain-ids.js; tests keep them equal.

alter table public.islands add column if not exists captain_skills text[] not null default '{}';
alter table public.islands add column if not exists weapons_owned text[] not null default '{musket}';
alter table public.islands add column if not exists weapon_equipped text not null default 'musket';

alter table public.islands drop constraint if exists islands_captain_skills_known;
alter table public.islands
  add constraint islands_captain_skills_known check (
    captain_skills <@ array[
      'steady_aim', 'long_barrel', 'quick_hands',
      'cutlass', 'sweep', 'second_wind',
      'quick_fix', 'long_reach', 'master_shipwright'
    ]::text[]
    and cardinality(captain_skills) <= 9
    and array_position(captain_skills, null) is null
  );
alter table public.islands drop constraint if exists islands_weapons_owned_known;
alter table public.islands
  add constraint islands_weapons_owned_known check (
    weapons_owned <@ array['musket', 'pistols', 'blunderbuss', 'long_rifle', 'fire_bombs']::text[]
    and 'musket' = any (weapons_owned)
    and cardinality(weapons_owned) <= 5
    and array_position(weapons_owned, null) is null
  );
alter table public.islands drop constraint if exists islands_weapon_equipped_owned;
alter table public.islands
  add constraint islands_weapon_equipped_owned check (weapon_equipped = any (weapons_owned));

comment on column public.islands.captain_skills is
  'The skills this player learnt (docs/TOWER-DEFENSE.md section 14), in the order learnt. Only island_learn_skill() adds one.';
comment on column public.islands.weapons_owned is
  'The weapons this player bought (section 15). Always holds the musket. Only island_weapon_buy() adds one.';
comment on column public.islands.weapon_equipped is
  'The weapon the captain carries, always one of weapons_owned. Set by island_weapon_buy() and island_weapon_equip().';


-- -----------------------------------------------------------------------------
-- 3. Table captain_skill_learns: one row per learnt skill, by its click
-- -----------------------------------------------------------------------------

create table if not exists public.captain_skill_learns (
  player_id  uuid not null references public.islands (player_id) on delete cascade,
  ref        text not null,
  skill      text not null,
  learned_at timestamptz not null default now(),

  primary key (player_id, ref),
  constraint captain_skill_learns_ref_format check (ref ~ '^skill:[A-Za-z0-9_-]{8,64}$'),
  constraint captain_skill_learns_skill_known check (
    skill in (
      'steady_aim', 'long_barrel', 'quick_hands',
      'cutlass', 'sweep', 'second_wind',
      'quick_fix', 'long_reach', 'master_shipwright'
    )
  )
);

comment on table public.captain_skill_learns is
  'One row per skill a player learnt, with the click that learnt it (ref skill:<actionUid>), so a repeated click is answered and never learns twice. No browser access.';
comment on column public.captain_skill_learns.ref is
  'skill:<actionUid>, the click id the browser made (8 to 64 letters, digits, hyphens or underscores).';
comment on column public.captain_skill_learns.skill is
  'The skill learnt by that click.';
comment on column public.captain_skill_learns.learned_at is
  'When it was learnt. Set by the database.';

-- Row-level security on and no policy: no browser role sees a row.
--   service_role  read, insert (island_learn_skill); no update, no delete
alter table public.captain_skill_learns enable row level security;
revoke all on table public.captain_skill_learns from public, anon, authenticated, service_role;
grant select, insert on table public.captain_skill_learns to service_role;


-- -----------------------------------------------------------------------------
-- 4. island_learn_skill(): one skill, paid with skill points
-- -----------------------------------------------------------------------------
--   p_skill            the skill to learn
--   p_tree             the whole tree of islands.json: [{skill, needs, cost}, ...]
--                      (needs: the skill of the tier above, or null)
--   p_waves_per_point  one skill point per this many won waves (2)
--
-- Returns {status: done, skills, points, repeat} (points: what is left) or
-- {status: refused, reason: no_island | bad_skill | known | locked | no_points}.

create or replace function public.island_learn_skill(
  p_player_id        uuid,
  p_skill            text,
  p_action_uid       text,
  p_tree             jsonb,
  p_waves_per_point  integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_ref     text;
  v_island  public.islands;
  v_entry   jsonb;
  v_needs   text;
  v_cost    integer;
  v_spent   integer;
  v_points  integer;
begin
  if p_player_id is null or p_skill is null
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_tree is null or jsonb_typeof(p_tree) <> 'array'
     or jsonb_array_length(p_tree) not between 1 and 9
     or p_waves_per_point is null or p_waves_per_point < 1 then
    raise exception 'bad_skill_learn';
  end if;
  v_ref := 'skill:' || p_action_uid;

  select * into v_island from public.islands where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_island');
  end if;

  if exists (
    select 1 from public.captain_skill_learns where player_id = p_player_id and ref = v_ref
  ) then
    v_spent := coalesce((
      select sum((entry ->> 'cost')::integer)
        from jsonb_array_elements(p_tree) as t(entry)
       where entry ->> 'skill' = any (v_island.captain_skills)
    ), 0);
    return jsonb_build_object(
      'status', 'done', 'skills', to_jsonb(v_island.captain_skills),
      'points', greatest(0, v_island.won_wave_best / p_waves_per_point - v_spent), 'repeat', true
    );
  end if;

  select entry into v_entry from jsonb_array_elements(p_tree) as t(entry) where entry ->> 'skill' = p_skill;
  if v_entry is null then
    return jsonb_build_object('status', 'refused', 'reason', 'bad_skill');
  end if;
  v_needs := v_entry ->> 'needs';
  v_cost := (v_entry ->> 'cost')::integer;
  if v_cost is null or v_cost < 1 then
    raise exception 'bad_skill_learn';
  end if;

  if p_skill = any (v_island.captain_skills) then
    return jsonb_build_object('status', 'refused', 'reason', 'known');
  end if;
  if v_needs is not null and not (v_needs = any (v_island.captain_skills)) then
    return jsonb_build_object('status', 'refused', 'reason', 'locked', 'needs', v_needs);
  end if;

  v_spent := coalesce((
    select sum((entry ->> 'cost')::integer)
      from jsonb_array_elements(p_tree) as t(entry)
     where entry ->> 'skill' = any (v_island.captain_skills)
  ), 0);
  -- Integer division: floor for whole, non-negative numbers.
  v_points := v_island.won_wave_best / p_waves_per_point - v_spent;
  if v_points < v_cost then
    return jsonb_build_object('status', 'refused', 'reason', 'no_points', 'points', greatest(0, v_points));
  end if;

  insert into public.captain_skill_learns (player_id, ref, skill) values (p_player_id, v_ref, p_skill);
  update public.islands
     set captain_skills = array_append(captain_skills, p_skill)
   where player_id = p_player_id
  returning * into v_island;

  return jsonb_build_object(
    'status', 'done', 'skills', to_jsonb(v_island.captain_skills),
    'points', v_points - v_cost, 'repeat', false
  );
end;
$$;

revoke all on function public.island_learn_skill(uuid, text, text, jsonb, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.island_learn_skill(uuid, text, text, jsonb, integer)
  to service_role;

comment on function public.island_learn_skill(uuid, text, text, jsonb, integer) is
  'Learns one captain skill with skill points: floor(won_wave_best / p_waves_per_point) minus the costs of the skills already learnt (costs from p_tree). Locks the island row. A repeated actionUid (captain_skill_learns ref skill:<uid>) answers {status: done, repeat: true}. Refuses no_island, bad_skill (not in p_tree), known, locked (the tier above is not learnt) and no_points, with nothing changed. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 5. island_weapon_buy() and island_weapon_equip(): the weapon shop
-- -----------------------------------------------------------------------------
--   p_price        the weapon's price in coins (islands.json)
--   p_unlock_wave  the best won wave it needs (islands.json); compared with
--                  the greater of wave_best and won_wave_best, like the unlocks
--
-- island_weapon_buy returns {status: done, weapon, balance, repeat} or
-- {status: refused, reason: player_not_set_up | no_island | owned | locked |
-- insufficient_funds}. island_weapon_equip returns {status: done, weapon} or
-- {status: refused, reason: no_island | not_owned}.

create or replace function public.island_weapon_buy(
  p_player_id    uuid,
  p_weapon       text,
  p_action_uid   text,
  p_price        integer,
  p_unlock_wave  integer
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
  if p_player_id is null or p_price is null or p_price < 1
     or p_unlock_wave is null or p_unlock_wave < 0
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_weapon is null
     or p_weapon not in ('pistols', 'blunderbuss', 'long_rifle', 'fire_bombs') then
    raise exception 'bad_weapon_buy';
  end if;
  v_ref := 'weapon:' || p_action_uid;

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
     where player_id = p_player_id and reason = 'weapon_purchase' and ref = v_ref
  ) then
    return jsonb_build_object(
      'status', 'done', 'weapon', v_island.weapon_equipped, 'balance', v_balance, 'repeat', true
    );
  end if;

  if p_weapon = any (v_island.weapons_owned) then
    return jsonb_build_object('status', 'refused', 'reason', 'owned');
  end if;
  if greatest(v_island.wave_best, v_island.won_wave_best) < p_unlock_wave then
    return jsonb_build_object('status', 'refused', 'reason', 'locked');
  end if;
  if v_balance < p_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', p_price);
  end if;

  v_balance := public.apply_wallet_transaction(p_player_id, -p_price, 'weapon_purchase', v_ref);
  update public.islands
     set weapons_owned = array_append(weapons_owned, p_weapon),
         weapon_equipped = p_weapon
   where player_id = p_player_id
  returning * into v_island;

  return jsonb_build_object(
    'status', 'done', 'weapon', v_island.weapon_equipped, 'balance', v_balance, 'repeat', false
  );
end;
$$;

revoke all on function public.island_weapon_buy(uuid, text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.island_weapon_buy(uuid, text, text, integer, integer)
  to service_role;

comment on function public.island_weapon_buy(uuid, text, text, integer, integer) is
  'Buys one weapon for the player''s captain and equips it. Locks the wallet, then the island. A repeated actionUid (ledger ref weapon:<uid>, reason weapon_purchase) answers {status: done, repeat: true}. Refuses player_not_set_up, no_island, owned, locked (below p_unlock_wave) and insufficient_funds, with nothing changed. Only service_role may run it.';

create or replace function public.island_weapon_equip(
  p_player_id  uuid,
  p_weapon     text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_island  public.islands;
begin
  if p_player_id is null or p_weapon is null
     or p_weapon not in ('musket', 'pistols', 'blunderbuss', 'long_rifle', 'fire_bombs') then
    raise exception 'bad_weapon_equip';
  end if;

  select * into v_island from public.islands where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_island');
  end if;
  if not (p_weapon = any (v_island.weapons_owned)) then
    return jsonb_build_object('status', 'refused', 'reason', 'not_owned');
  end if;

  update public.islands set weapon_equipped = p_weapon where player_id = p_player_id;
  return jsonb_build_object('status', 'done', 'weapon', p_weapon);
end;
$$;

revoke all on function public.island_weapon_equip(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.island_weapon_equip(uuid, text)
  to service_role;

comment on function public.island_weapon_equip(uuid, text) is
  'The player''s captain carries this weapon from now on. Locks the island row. Refuses no_island and not_owned, with nothing changed. Equipping the same weapon again changes nothing. Only service_role may run it.';
