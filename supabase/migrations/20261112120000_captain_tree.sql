-- =============================================================================
-- 20261112120000_captain_tree.sql
--
-- WHAT IT DOES
--   The deeper captain skill tree with exclusive choices and roles (owner,
--   12 Nov: "the team has to decide who does what"; docs/GAME-V3.md, section
--   "Captain tree and roles"). It builds on 20261112030000_captain_skills.sql.
--
--     islands              new column captain_role (null, medic, engineer or
--                          gunner). The captain_skills check rule now lists 21
--                          skills (five tiers a branch, two forks, a capstone).
--     captain_skill_learns its skill check rule lists the same 21 skills.
--     island_learn_skill() recreated with the same arguments: a skill may need
--                          ANY of several skills of the tier above (needs is a
--                          list now), a fork closes its twin (excludes), and a
--                          capstone needs the captain's role (role).
--     island_pick_role()   the role choice: once, from a captain level the
--                          server passes (3). A role cannot change without a
--                          respec.
--     island_respec()      clears every skill and the role, paid in coins
--                          through the wallet ledger (reason captain_respec,
--                          ref respec:<uid>). The skill points come back by
--                          themselves: they are computed from won_wave_best
--                          minus the skills learnt.
--
--     wallet reason        captain_respec (spend).
--
-- WHO USES IT
--   Only the Python server, with the secret key (service_role):
--   backend/server/routes/island.py (POST /api/island/skill, /role, /respec).
--   The tree (ids, costs, needs, excludes, roles), the role level and the respec
--   price come from backend/content/islands.json through the server; the
--   database only compares. No browser role gets anything new.
--
-- THE RULES THAT THE DATABASE KEEPS
--   1. Play money only; coins move only through apply_wallet_transaction().
--   2. Every write is safe to repeat: a skill by its row in
--      captain_skill_learns (ref skill:<uid>), a respec by its ledger row
--      (player, captain_respec, respec:<uid>). A repeat answers
--      {status: done, repeat: true} and changes nothing. Picking the same role
--      again is the same every time.
--   3. A skill is learnt in this order of refusals: known, closed (its fork twin
--      is learnt), locked (none of the skills of the tier above), wrong_role (a
--      capstone of another role, or no role yet), no_points. Nothing changes on
--      a refusal.
--   4. Skill points spent never pass floor(won_wave_best / waves per point).
--   5. A role is picked once, at the captain level the server passes, and is
--      cleared only by island_respec().
--   6. A respec locks the wallet first, then the island row.
--
-- WHAT IT NEEDS
--   Every earlier migration, in particular 20261112030000_captain_skills.sql.
--
-- SAFE TO RUN TWICE
--   Column and the reason use "if not exists" / "on conflict do nothing", check
--   rules are dropped "if exists" first, functions use "create or replace", and
--   revokes, grants and comments repeat.
--
-- HOW THE FILE IS ORGANISED
--   1. One wallet reason
--   2. The column captain_role and the wider check rules
--   3. island_learn_skill() (recreated)
--   4. island_pick_role()
--   5. island_respec()
--
-- HOW TO VERIFY (read-only queries, after applying)
--   a. select reason, direction from public.wallet_reasons
--       where reason = 'captain_respec';                                     -- 1 row, spend
--   b. select captain_skills, captain_role from public.islands limit 3;     -- {}, null
--   c. Only the server may run the functions (browser and visitor false):
--      select p.proname,
--             has_function_privilege('authenticated', p.oid, 'execute') as browser,
--             has_function_privilege('anon', p.oid, 'execute') as visitor,
--             has_function_privilege('service_role', p.oid, 'execute') as server
--        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'public'
--         and p.proname in ('island_learn_skill', 'island_pick_role', 'island_respec');
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. One wallet reason
-- -----------------------------------------------------------------------------
-- The same pair ends WALLET_REASONS in backend/server/wallet.py (a test compares
-- them).

insert into public.wallet_reasons (reason, direction, description) values
  ('captain_respec', 'spend', 'Paying a respec: the captain forgets every skill and the role and chooses again.')
on conflict (reason) do nothing;


-- -----------------------------------------------------------------------------
-- 2. The column captain_role and the wider check rules
-- -----------------------------------------------------------------------------
-- The ids repeat backend/content/islands.json (captainSkills) and
-- frontend/src/pirates/captain-ids.js; tests keep them equal.

alter table public.islands add column if not exists captain_role text;

alter table public.islands drop constraint if exists islands_captain_role_known;
alter table public.islands
  add constraint islands_captain_role_known check (
    captain_role is null or captain_role in ('medic', 'engineer', 'gunner')
  );

alter table public.islands drop constraint if exists islands_captain_skills_known;
alter table public.islands
  add constraint islands_captain_skills_known check (
    captain_skills <@ array[
      'steady_aim', 'long_barrel', 'hot_shot', 'quick_hands', 'far_sight', 'heavy_shot', 'dead_eye',
      'cutlass', 'sweep', 'heavy_blade', 'second_wind', 'snap_shot', 'bruiser', 'field_surgeon',
      'quick_fix', 'long_reach', 'sturdy_planks', 'master_shipwright', 'swift_hammer', 'wide_arc', 'grand_engineer'
    ]::text[]
    and cardinality(captain_skills) <= 21
    and array_position(captain_skills, null) is null
  );

alter table public.captain_skill_learns drop constraint if exists captain_skill_learns_skill_known;
alter table public.captain_skill_learns
  add constraint captain_skill_learns_skill_known check (
    skill in (
      'steady_aim', 'long_barrel', 'hot_shot', 'quick_hands', 'far_sight', 'heavy_shot', 'dead_eye',
      'cutlass', 'sweep', 'heavy_blade', 'second_wind', 'snap_shot', 'bruiser', 'field_surgeon',
      'quick_fix', 'long_reach', 'sturdy_planks', 'master_shipwright', 'swift_hammer', 'wide_arc', 'grand_engineer'
    )
  );

comment on column public.islands.captain_role is
  'The captain''s role (medic, engineer or gunner), picked once from captain level 3 and cleared only by island_respec(). It decides which branch''s capstone the captain can learn. Null until picked.';


-- -----------------------------------------------------------------------------
-- 3. island_learn_skill(): one skill, paid with skill points (recreated)
-- -----------------------------------------------------------------------------
--   p_skill            the skill to learn
--   p_tree             the whole tree of islands.json:
--                      [{skill, needs: [skill, ...], excludes, role, cost}, ...]
--                      (needs: the skills of the tier above, any one opens the
--                      skill; excludes: the fork twin or null; role: the role a
--                      capstone needs or null)
--   p_waves_per_point  one skill point per this many won waves (2)
--
-- Returns {status: done, skills, points, repeat} (points: what is left) or
-- {status: refused, reason: no_island | bad_skill | known | closed | locked |
-- wrong_role | no_points}.
--
-- Changes against 20261112030000: needs is a list (an old single text still
-- reads as a list of one); new refusals closed and wrong_role; the tree may
-- have up to 21 entries.

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
  v_ref      text;
  v_island   public.islands;
  v_entry    jsonb;
  v_needs    text[];
  v_excludes text;
  v_role     text;
  v_cost     integer;
  v_spent    integer;
  v_points   integer;
begin
  if p_player_id is null or p_skill is null
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_tree is null or jsonb_typeof(p_tree) <> 'array'
     or jsonb_array_length(p_tree) not between 1 and 21
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
  v_needs := case jsonb_typeof(v_entry -> 'needs')
    when 'array' then array(select jsonb_array_elements_text(v_entry -> 'needs'))
    when 'string' then array[v_entry ->> 'needs']
    else '{}'::text[]
  end;
  v_excludes := v_entry ->> 'excludes';
  v_role := v_entry ->> 'role';
  v_cost := (v_entry ->> 'cost')::integer;
  if v_cost is null or v_cost < 1 then
    raise exception 'bad_skill_learn';
  end if;

  if p_skill = any (v_island.captain_skills) then
    return jsonb_build_object('status', 'refused', 'reason', 'known');
  end if;
  if v_excludes is not null and v_excludes = any (v_island.captain_skills) then
    return jsonb_build_object('status', 'refused', 'reason', 'closed', 'twin', v_excludes);
  end if;
  if cardinality(v_needs) > 0 and not (v_needs && v_island.captain_skills) then
    return jsonb_build_object('status', 'refused', 'reason', 'locked', 'needs', to_jsonb(v_needs));
  end if;
  if v_role is not null and v_island.captain_role is distinct from v_role then
    return jsonb_build_object('status', 'refused', 'reason', 'wrong_role', 'role', v_role);
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
  'Learns one captain skill with skill points: floor(won_wave_best / p_waves_per_point) minus the costs of the skills already learnt (costs from p_tree). Locks the island row. A skill needs any one of the skills of the tier above (needs), closes when its fork twin is learnt (excludes) and, as a capstone, needs the captain''s role (role). A repeated actionUid (captain_skill_learns ref skill:<uid>) answers {status: done, repeat: true}. Refuses no_island, bad_skill (not in p_tree), known, closed, locked, wrong_role and no_points, with nothing changed. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 4. island_pick_role(): the role choice
-- -----------------------------------------------------------------------------
--   p_role       medic, engineer or gunner
--   p_min_level  the captain level that opens the choice (islands.json: 3)
--
-- Returns {status: done, role, repeat} or {status: refused, reason: no_island |
-- locked | role_known}. Picking the role you have is a repeat; another role
-- needs a respec first.

create or replace function public.island_pick_role(
  p_player_id  uuid,
  p_role       text,
  p_min_level  integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_island  public.islands;
begin
  if p_player_id is null or p_role is null or p_role not in ('medic', 'engineer', 'gunner')
     or p_min_level is null or p_min_level not between 1 and 5 then
    raise exception 'bad_role_pick';
  end if;

  select * into v_island from public.islands where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_island');
  end if;
  if v_island.captain_role = p_role then
    return jsonb_build_object('status', 'done', 'role', p_role, 'repeat', true);
  end if;
  if v_island.captain_role is not null then
    return jsonb_build_object('status', 'refused', 'reason', 'role_known');
  end if;
  if v_island.captain_level < p_min_level then
    return jsonb_build_object('status', 'refused', 'reason', 'locked', 'level', p_min_level);
  end if;

  update public.islands set captain_role = p_role where player_id = p_player_id;
  return jsonb_build_object('status', 'done', 'role', p_role, 'repeat', false);
end;
$$;

revoke all on function public.island_pick_role(uuid, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.island_pick_role(uuid, text, integer)
  to service_role;

comment on function public.island_pick_role(uuid, text, integer) is
  'The player''s captain takes a role (medic, engineer or gunner) once, from captain level p_min_level. Locks the island row. The same role again answers {status: done, repeat: true}. Refuses no_island, locked (captain level too low) and role_known (another role is set: respec first), with nothing changed. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 5. island_respec(): forget every skill and the role, paid in coins
-- -----------------------------------------------------------------------------
--   p_price  the coins (islands.json: coinsPerLevel x captain level)
--
-- Returns {status: done, balance, repeat} or {status: refused, reason:
-- player_not_set_up | no_island | nothing_to_reset | insufficient_funds}.

-- Added 13 Nov with 20261113010000_respec_and_wave_guards.sql, which renames the
-- argument p_price to p_per_level: a run of every migration again must not fail on
-- "cannot change name of input parameter". A no-op on a database that has none.
drop function if exists public.island_respec(uuid, text, integer);

create or replace function public.island_respec(
  p_player_id   uuid,
  p_action_uid  text,
  p_price       integer
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

  if cardinality(v_island.captain_skills) = 0 and v_island.captain_role is null then
    return jsonb_build_object('status', 'refused', 'reason', 'nothing_to_reset');
  end if;
  if v_balance < p_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', p_price);
  end if;

  v_balance := public.apply_wallet_transaction(p_player_id, -p_price, 'captain_respec', v_ref);
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
  'Clears the captain''s skills and role for p_price coins (wallet reason captain_respec, ref respec:<uid>); the skill points come back because they are computed from won_wave_best minus the skills learnt. Locks the wallet, then the island. A repeated actionUid answers {status: done, repeat: true}. Refuses player_not_set_up, no_island, nothing_to_reset and insufficient_funds, with nothing changed. Only service_role may run it.';
