-- T55 mutation hooks: settle using the previous policy, then refresh future state.
-- Legacy callers retain their old results and accounting; v0 only advances the state revision.

-- Call only after locking the changed owner island row. This serializes mutation
-- with admission/reset, materializes the old rate before any change, and gives
-- every successful call the same DB instant for settlement and refresh.
create or replace function public.structure_recovery_mutation_begin(p_island_owner uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.island_recovery_state;
  v_now timestamptz;
  v_settlement jsonb;
begin
  if p_island_owner is null then
    raise exception 'bad_recovery_mutation';
  end if;
  insert into public.island_recovery_state (island_owner)
  values (p_island_owner)
  on conflict (island_owner) do nothing;
  select * into v_state from public.island_recovery_state
   where island_owner = p_island_owner for update;
  v_now := clock_timestamp();
  if v_state.recovery_version = 1 then
    v_settlement := public.structure_recovery_settle_locked(p_island_owner, v_now);
  else
    v_settlement := jsonb_build_object('status', 'legacy', 'recoveryVersion', 0);
  end if;
  return jsonb_build_object(
    'serverNow', v_now, 'recoveryVersion', v_state.recovery_version,
    'waveProtocol', v_state.wave_protocol, 'settlement', v_settlement
  );
end;
$$;
revoke all on function public.structure_recovery_mutation_begin(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.structure_recovery_mutation_begin(uuid) to service_role;

-- Call after the successful mutation. v0 rows carry only a CAS revision; v1
-- refresh uses the immutable static manifest and the helper's DB layout lookup.
create or replace function public.structure_recovery_mutation_finish(
  p_island_owner uuid,
  p_context jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz;
  v_version smallint;
begin
  v_now := (p_context ->> 'serverNow')::timestamptz;
  v_version := (p_context ->> 'recoveryVersion')::smallint;
  if p_island_owner is null or v_now is null or v_version not in (0, 1) then
    raise exception 'bad_recovery_mutation';
  end if;
  if v_version = 1 then
    return public.structure_recovery_refresh_locked(p_island_owner, v_now, null);
  end if;
  update public.island_recovery_state
     set revision = revision + 1, updated_at = v_now
   where island_owner = p_island_owner;
  if not found then
    raise exception 'recovery_state_incomplete';
  end if;
  return jsonb_build_object('status', 'legacy', 'recoveryVersion', 0);
end;
$$;
revoke all on function public.structure_recovery_mutation_finish(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.structure_recovery_mutation_finish(uuid, jsonb) to service_role;

create or replace function public.island_build(
  p_player_id     uuid,
  p_island_owner  uuid,
  p_plot          text,
  p_building_type text,
  p_action_uid    text,
  p_price         integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_ref     text;
  v_balance bigint;
  v_recovery jsonb;
begin
  if p_player_id is null or p_island_owner is null or p_plot is null
     or p_building_type is null
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_price is null or p_price < 1 then
    raise exception 'bad_island_build';
  end if;
  v_ref := 'island:' || p_action_uid;

  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  if exists (
    select 1 from public.wallet_transactions
     where player_id = p_player_id and reason = 'building_purchase' and ref = v_ref
  ) then
    return jsonb_build_object('status', 'done', 'level', 1, 'balance', v_balance, 'repeat', true);
  end if;

  insert into public.islets (player_id, timber)
  values (p_island_owner, 0)
  on conflict (player_id) do nothing;
  perform 1 from public.islets where player_id = p_island_owner for update;
  -- Recovery is only defined for a persisted island, not a legacy home islet.
  perform 1 from public.islands where player_id = p_island_owner for update;
  if found then v_recovery := '{}'::jsonb; end if;

  if exists (
    select 1 from public.islet_buildings where player_id = p_island_owner and plot = p_plot
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'spot_taken');
  end if;
  if v_balance < p_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', p_price);
  end if;

  if v_recovery is not null then
    v_recovery := public.structure_recovery_mutation_begin(p_island_owner);
  end if;

  v_balance := public.apply_wallet_transaction(p_player_id, -p_price, 'building_purchase', v_ref);
  insert into public.islet_buildings
    (player_id, plot, building_type, level, coins_paid, timber_paid, ref)
  values
    (p_island_owner, p_plot, p_building_type, 1, p_price, 0, v_ref);
  -- 20261112080000_demolish.sql: who paid for this building, for a refund when it is torn down.
  insert into public.building_payments
    (island_owner, plot, building_ref, level, payer, coins, ref)
  values
    (p_island_owner, p_plot, v_ref, 1, p_player_id, p_price, v_ref);

  if v_recovery is not null then
    perform public.structure_recovery_mutation_finish(p_island_owner, v_recovery);
  end if;

  return jsonb_build_object('status', 'done', 'level', 1, 'balance', v_balance, 'repeat', false);
end;
$$;

revoke all on function public.island_build(uuid, uuid, text, text, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.island_build(uuid, uuid, text, text, text, integer) to service_role;

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
  v_recovery jsonb;
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

  perform 1 from public.islands where player_id = p_island_owner for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_island');
  end if;
  v_recovery := public.structure_recovery_mutation_begin(p_island_owner);

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
  if (v_recovery ->> 'recoveryVersion')::integer = 1
     and v_building.building_type in ('wall', 'cannon', 'mortar', 'harpoon', 'culverin', 'swivel')
     and (v_recovery #>> '{settlement,status}') = 'reserved' then
    return jsonb_build_object('status', 'refused', 'reason', 'wave_running');
  end if;
  if (v_recovery ->> 'recoveryVersion')::integer = 1
     and v_building.building_type in ('wall', 'cannon', 'mortar', 'harpoon', 'culverin', 'swivel')
     and not exists (
       select 1 from public.island_structure_health h
        where h.island_owner = p_island_owner and h.spot = p_plot
          and h.instance_id = v_building.recovery_instance_id and h.hp_units = 1000000
     ) then
    return jsonb_build_object('status', 'refused', 'reason', 'needs_repair');
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
  -- 20261112080000_demolish.sql: who paid for this level, for a refund when it is torn down.
  insert into public.building_payments
    (island_owner, plot, building_ref, level, payer, coins, ref)
  values
    (p_island_owner, p_plot, v_building.ref, v_building.level, p_player_id, v_price, v_ref);

  perform public.structure_recovery_mutation_finish(p_island_owner, v_recovery);

  return jsonb_build_object(
    'status', 'done', 'level', v_building.level, 'balance', v_balance, 'repeat', false
  );
end;
$$;

revoke all on function public.island_upgrade(uuid, uuid, text, text, integer[], integer) from public, anon, authenticated, service_role;
grant execute on function public.island_upgrade(uuid, uuid, text, text, integer[], integer) to service_role;

create or replace function public.island_hire(
  p_player_id  uuid,
  p_crew       text,
  p_action_uid text,
  p_price      integer,
  p_max        integer
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
  v_count   integer;
  v_recovery jsonb;
begin
  if p_player_id is null or p_crew is null
     or p_crew not in ('gunner', 'carpenter', 'lookout', 'guard')
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_price is null or p_price < 1 or p_max is null or p_max not between 1 and 10 then
    raise exception 'bad_hire';
  end if;
  v_ref := 'crew:' || p_action_uid;

  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  select * into v_island from public.islands where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_island');
  end if;
  v_count := case p_crew
    when 'gunner' then v_island.crew_gunner
    when 'carpenter' then v_island.crew_carpenter
    when 'lookout' then v_island.crew_lookout
    else v_island.crew_guard
  end;

  if exists (
    select 1 from public.wallet_transactions
     where player_id = p_player_id and reason = 'crew_hire' and ref = v_ref
  ) then
    return jsonb_build_object('status', 'done', 'count', v_count, 'balance', v_balance, 'repeat', true);
  end if;

  if v_count >= p_max then
    return jsonb_build_object('status', 'refused', 'reason', 'crew_full');
  end if;
  if v_balance < p_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', p_price);
  end if;

  v_recovery := public.structure_recovery_mutation_begin(p_player_id);

  v_balance := public.apply_wallet_transaction(p_player_id, -p_price, 'crew_hire', v_ref);
  update public.islands
     set crew_gunner = crew_gunner + (p_crew = 'gunner')::integer,
         crew_carpenter = crew_carpenter + (p_crew = 'carpenter')::integer,
         crew_lookout = crew_lookout + (p_crew = 'lookout')::integer,
         crew_guard = crew_guard + (p_crew = 'guard')::integer
   where player_id = p_player_id;

  perform public.structure_recovery_mutation_finish(p_player_id, v_recovery);

  return jsonb_build_object('status', 'done', 'count', v_count + 1, 'balance', v_balance, 'repeat', false);
end;
$$;

revoke all on function public.island_hire(uuid, text, text, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.island_hire(uuid, text, text, integer, integer) to service_role;

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
  v_recovery jsonb;
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

  v_recovery := public.structure_recovery_mutation_begin(p_island_owner);

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

  perform public.structure_recovery_mutation_finish(p_island_owner, v_recovery);

  return jsonb_build_object(
    'status', 'done', 'branch', p_branch, 'tier', greatest(coalesce(v_row.tier, 0), p_tier),
    'choice', p_choice, 'balance', v_balance, 'repeat', false
  );
end;
$$;

revoke all on function public.island_research(uuid, uuid, text, text, integer, integer, integer, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.island_research(uuid, uuid, text, text, integer, integer, integer, text, boolean) to service_role;

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
  v_recovery jsonb;
  v_changed  integer;
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
  v_recovery := public.structure_recovery_mutation_begin(p_island_owner);

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
    get diagnostics v_changed = row_count;
    if v_changed > 0 then
      perform public.structure_recovery_mutation_finish(p_island_owner, v_recovery);
    end if;
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
  perform public.structure_recovery_mutation_finish(p_island_owner, v_recovery);
  return jsonb_build_object(
    'status', 'done', 'plot', p_plot, 'spec', p_spec, 'price', p_price, 'balance', v_balance,
    'repeat', false
  );
end;
$$;

revoke all on function public.island_specialise(uuid, uuid, text, text, text, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.island_specialise(uuid, uuid, text, text, text, text, integer) to service_role;

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
  v_recovery jsonb;
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
  v_recovery := public.structure_recovery_mutation_begin(p_island_owner);

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
  perform public.structure_recovery_mutation_finish(p_island_owner, v_recovery);
  return jsonb_build_object(
    'status', 'done', 'plot', p_plot, 'path', p_path, 'tier', p_tier, 'price', p_price,
    'balance', v_balance, 'repeat', false
  );
end;
$$;

revoke all on function public.island_tower_tree(uuid, uuid, text, text, text, integer, text, integer, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.island_tower_tree(uuid, uuid, text, text, text, integer, text, integer, integer, integer) to service_role;

create or replace function public.island_move(
  p_island_owner uuid,
  p_mover        uuid,
  p_plot         text,
  p_x_half       integer,
  p_z_half       integer,
  p_seen         jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_now jsonb;
  v_recovery jsonb;
begin
  if p_island_owner is null or p_mover is null or p_plot is null
     or p_x_half is null or p_z_half is null or jsonb_typeof(p_seen) is distinct from 'array' then
    raise exception 'bad_move';
  end if;

  perform 1 from public.islands where player_id = p_island_owner for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_island');
  end if;

  -- No move under a running wave: it fights the defenses where they stood at its start.
  -- The same test as island_demolish() (20261112080000_demolish.sql).
  if exists (
    select 1 from public.wave_runs
     where island_owner = p_island_owner and finished_at is null
       and starts_at + make_interval(secs => maximum_seconds) >= now()
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'wave_running');
  end if;

  -- The compare-and-swap: the rows now must be the rows the server checked.
  select coalesce(jsonb_agg(jsonb_build_object('plot', plot, 'x_half', x_half, 'z_half', z_half)
                            order by plot collate "C"), '[]'::jsonb)
    into v_now
    from public.island_layout
   where island_owner = p_island_owner;
  if v_now is distinct from p_seen then
    return jsonb_build_object('status', 'refused', 'reason', 'busy');
  end if;

  v_recovery := public.structure_recovery_mutation_begin(p_island_owner);

  insert into public.island_layout (island_owner, plot, x_half, z_half, moved_by)
  values (p_island_owner, p_plot, p_x_half, p_z_half, p_mover)
  on conflict (island_owner, plot) do update
    set x_half = excluded.x_half, z_half = excluded.z_half,
        moved_by = excluded.moved_by, moved_at = now();
  perform public.structure_recovery_mutation_finish(p_island_owner, v_recovery);
  return jsonb_build_object('status', 'done');
end;
$$;

revoke all on function public.island_move(uuid, uuid, text, integer, integer, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.island_move(uuid, uuid, text, integer, integer, jsonb) to service_role;

create or replace function public.island_demolish(
  p_player_id     uuid,
  p_island_owner  uuid,
  p_plot          text,
  p_action_uid    text,
  p_prices        jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_ref      text;
  v_done     public.building_demolitions;
  v_building public.islet_buildings;
  v_first_ref text;
  v_payers   uuid[];
  v_locked   uuid[] := '{}';
  v_id       uuid;
  v_refunds  jsonb := '[]'::jsonb;
  v_refund   jsonb;
  v_recovery jsonb;
begin
  if p_player_id is null or p_island_owner is null or p_plot is null
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_prices is null or jsonb_typeof(p_prices) <> 'object' then
    raise exception 'bad_demolish';
  end if;
  v_ref := 'demolish:' || p_action_uid;

  -- Step 1: the same click again is answered from its record.
  select * into v_done
    from public.building_demolitions where demolished_by = p_player_id and ref = v_ref;
  if found then
    return jsonb_build_object(
      'status', 'done', 'plot', v_done.plot, 'kind', v_done.building_type, 'level', v_done.level,
      'refunds', v_done.refunds, 'repeat', true
    );
  end if;

  -- Step 2: only an island build spot, on an island, by a member of its game.
  if p_plot !~ '^(wall_([1-9]|1[0-2])|cannon_([1-9]|1[01])|tower_1|house_[12])$' then
    return jsonb_build_object('status', 'refused', 'reason', 'protected');
  end if;
  if not exists (select 1 from public.islands where player_id = p_island_owner) then
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
   where player_id = p_island_owner and plot = p_plot;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'not_built');
  end if;

  v_first_ref := v_building.ref;

  -- Step 3: the wallets first, every payer of this building and the host, in
  -- player id order (the order every tear-down takes, so none waits in a circle).
  select array_agg(id order by id) into v_payers
    from (
      select payer as id from public.building_payments
       where island_owner = p_island_owner and building_ref = v_building.ref
         and refunded_by is null and payer is not null
      union
      select p_island_owner
    ) ids;
  foreach v_id in array v_payers loop
    perform 1 from public.wallets where player_id = v_id for update;
    if found then
      v_locked := v_locked || v_id;
    end if;
  end loop;

  -- Step 4: the island row (the lock wave_start() takes), then no running wave.
  perform 1 from public.islands where player_id = p_island_owner for update;
  v_recovery := public.structure_recovery_mutation_begin(p_island_owner);
  -- Still a member now? Somebody who left while this waited for the lock must not finish.
  if p_player_id <> p_island_owner and not exists (
    select 1 from public.island_members
     where island_owner = p_island_owner and player_id = p_player_id and left_at is null
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'not_member');
  end if;
  if exists (
    select 1 from public.wave_runs
     where island_owner = p_island_owner and finished_at is null
       and starts_at + make_interval(secs => maximum_seconds) >= now()
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'wave_running');
  end if;

  -- Step 5: the building row (the lock island_upgrade() takes), read again.
  select * into v_building
    from public.islet_buildings
   where player_id = p_island_owner and plot = p_plot
     for update;
  if not found then
    -- The same click may have finished meanwhile (two tabs), or another member was first.
    select * into v_done
      from public.building_demolitions where demolished_by = p_player_id and ref = v_ref;
    if found then
      return jsonb_build_object(
        'status', 'done', 'plot', v_done.plot, 'kind', v_done.building_type,
        'level', v_done.level, 'refunds', v_done.refunds, 'repeat', true
      );
    end if;
    return jsonb_build_object('status', 'refused', 'reason', 'not_built');
  end if;
  if jsonb_typeof(p_prices -> v_building.building_type) is distinct from 'array'
     or jsonb_array_length(p_prices -> v_building.building_type) < v_building.level then
    raise exception 'bad_demolish';
  end if;
  -- Like island_upgrade(): every price of the kind is a whole number of 1 or more.
  if exists (
    select 1 from jsonb_array_elements(p_prices -> v_building.building_type) price
     where case when jsonb_typeof(price) = 'number'
                then (price #>> '{}')::numeric < 1
                  or (price #>> '{}')::numeric <> trunc((price #>> '{}')::numeric)
                else true end
  ) then
    raise exception 'bad_demolish';
  end if;
  -- Torn down and built again since the first read: the wallets locked above
  -- belong to the old building, so change nothing; the next click starts over.
  if v_building.ref is distinct from v_first_ref then
    return jsonb_build_object('status', 'refused', 'reason', 'busy');
  end if;
  -- Somebody paid for it after step 3 (an upgrade got the building lock first):
  -- their wallet is not locked, so stop here; the next click locks it.
  if exists (
    select 1 from public.building_payments
     where island_owner = p_island_owner and building_ref = v_building.ref
       and refunded_by is null and payer is not null and not (payer = any(v_payers))
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'busy');
  end if;

  -- Step 6: the refunds, half of what each payer paid, into the wallets locked above. A payer
  -- without a wallet (never set up) gets nothing and is left out of the record, so the record
  -- and the answer list only coins that were really paid.
  for v_refund in
    select value from jsonb_array_elements(public.island_refund_split(
      p_island_owner, v_building.ref, v_building.building_type, v_building.level, p_prices
    ))
  loop
    if not ((v_refund ->> 'playerId')::uuid = any(v_locked)) then
      continue;
    end if;
    if (v_refund ->> 'coins')::bigint > 0 then
      perform public.apply_wallet_transaction(
        (v_refund ->> 'playerId')::uuid, (v_refund ->> 'coins')::bigint, 'building_refund', v_ref
      );
    end if;
    v_refunds := v_refunds || jsonb_build_array(v_refund);
  end loop;

  -- Step 7: the spot is empty again; its payments are refunded; the record of the click.
  update public.building_payments
     set refunded_by = v_ref
   where island_owner = p_island_owner and building_ref = v_building.ref and refunded_by is null;
  delete from public.islet_buildings where player_id = p_island_owner and plot = p_plot;
  insert into public.building_demolitions
    (demolished_by, ref, island_owner, plot, building_type, level, building_ref, refunds)
  values
    (p_player_id, v_ref, p_island_owner, p_plot, v_building.building_type, v_building.level,
     v_building.ref, v_refunds);

  perform public.structure_recovery_mutation_finish(p_island_owner, v_recovery);

  return jsonb_build_object(
    'status', 'done', 'plot', p_plot, 'kind', v_building.building_type, 'level', v_building.level,
    'refunds', v_refunds, 'repeat', false
  );
end;
$$;

revoke all on function public.island_demolish(uuid, uuid, text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.island_demolish(uuid, uuid, text, text, jsonb) to service_role;

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
  v_recovery       jsonb;
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

  v_recovery := public.structure_recovery_mutation_begin(p_player_id);

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

  -- Advance the current epoch while retaining all immutable wave and repair history.
  update public.island_recovery_state
     set reset_epoch = gen_random_uuid(), current_wave_id = null, reserved_at = null,
         starts_at = null, expires_at = null, revision = revision + 1,
         updated_at = (v_recovery ->> 'serverNow')::timestamptz
   where island_owner = p_player_id;
  delete from public.island_structure_health where island_owner = p_player_id;

  return jsonb_build_object('status', 'done', 'repeat', false, 'balance', v_balance,
                            'counts', v_counts);
end;
$$;

revoke all on function public.island_fresh_start(uuid, text, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.island_fresh_start(uuid, text, text, integer) to service_role;

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
  v_recovery jsonb;
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

  v_recovery := public.structure_recovery_mutation_begin(p_player_id);

  if (v_recovery ->> 'recoveryVersion')::integer = 1
     and p_skill = any (array[
       'quick_fix', 'long_reach', 'sturdy_planks', 'master_shipwright',
       'swift_hammer', 'wide_arc', 'grand_engineer'
     ]::text[]) then
    return jsonb_build_object('status', 'refused', 'reason', 'retired_skill');
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

  perform public.structure_recovery_mutation_finish(p_player_id, v_recovery);

  return jsonb_build_object(
    'status', 'done', 'skills', to_jsonb(v_island.captain_skills),
    'points', v_points - v_cost, 'repeat', false
  );
end;
$$;

revoke all on function public.island_learn_skill(uuid, text, text, jsonb, integer) from public, anon, authenticated, service_role;
grant execute on function public.island_learn_skill(uuid, text, text, jsonb, integer) to service_role;
