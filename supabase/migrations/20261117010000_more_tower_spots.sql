-- =============================================================================
-- 20261117010000_more_tower_spots.sql
--
-- WHAT IT DOES
--   Decision D060 (more tower spots over time): four extra tower spots,
--   cannon_8..cannon_11, that open after won waves 10, 20, 30 and 40
--   (backend/content/islands.json extraTowerSpots). Each takes every tower kind
--   of cannon_1: cannon, mortar, harpoon, culverin and swivel. Four rules learn
--   the new spot ids, nothing else changes:
--     1. the check rule islet_buildings_plot_fits_building: the full list of
--        20261116020100_swivel_spot_rule.sql plus the 20 pairs
--        (cannon_8..cannon_11) x (cannon, mortar, harpoon, culverin, swivel);
--     2. the check rule island_layout_plot_known (T36, D041): the new spots may
--        be moved on the build grid like the other 22;
--     3. island_demolish_quote() and 4. island_demolish(): their plot test
--        accepts cannon_8..cannon_11 (otherwise a building there could never be
--        torn down: "protected"). Both functions are copied unchanged from
--        20261112080000_demolish.sql except that one test.
--   islet_buildings_spec_fits_kind, island_build(), island_upgrade(), the skill,
--   tree and wave functions take the kind or the plot as an argument and do not
--   list spots: no change. island_fresh_start() deletes by player: no change.
--
-- WHY THE SERVER WAITS FOR IT
--   The server offers the new spots only while its flag more_tower_spots is on
--   (backend/server/flags.py). Until this file is applied a build there is
--   refused by the database (a check violation: the server answers 502 and
--   charges nothing). So: apply this file first, then switch the flag on.
--
-- WHY THE DROPS
--   A check rule cannot be widened without DROP CONSTRAINT. Each one is dropped
--   and added again in the SAME statement, so the table is never without it.
--
-- WHAT IT NEEDS
--   20261116020100_swivel_spot_rule.sql (the rule it widens),
--   20261114110000_island_layout.sql (the layout table) and
--   20261112080000_demolish.sql (the two functions it replaces).
--
-- SAFE TO RUN AGAIN
--   Every constraint is dropped if it exists and added again; the functions are
--   create or replace; the grants and comments repeat.
--
-- ROLLBACK (by hand, only while no row stands on cannon_8..cannon_11)
--   Run the spot rule of 20261116020100_swivel_spot_rule.sql, the constraint of
--   20261114110000_island_layout.sql and sections 7 and 8 of
--   20261112080000_demolish.sql again.
--
-- HOW TO VERIFY (read-only, after applying)
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname in ('islet_buildings_plot_fits_building', 'island_layout_plot_known');
--   -- the lists hold ('cannon_11', 'swivel') and 'cannon_11'
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Every tower kind on the extra tower spots
-- -----------------------------------------------------------------------------
-- The pairs repeat backend/content/buildings.json (the four home islet pairs),
-- backend/content/islands.json (spots and extraTowerSpots) and
-- backend/content/defenses_v2.json (the culverin's spots); a test keeps them
-- equal (backend/server/tests/test_island_rules.py). One statement: the old rule
-- goes and the wider one comes in the same step.

alter table public.islet_buildings
  drop constraint if exists islet_buildings_plot_fits_building,
  add constraint islet_buildings_plot_fits_building
    check ((plot, building_type) in (
      ('plot_2', 'workshop'),
      ('plot_3', 'windmill'),
      ('plot_4', 'greenhouse'),
      ('islet_signal_station', 'signal_station'),
      ('wall_1', 'wall'),
      ('wall_2', 'wall'),
      ('wall_3', 'wall'),
      ('wall_4', 'wall'),
      ('wall_5', 'wall'),
      ('wall_6', 'wall'),
      ('wall_7', 'wall'),
      ('wall_8', 'wall'),
      ('wall_9', 'wall'),
      ('wall_10', 'wall'),
      ('wall_11', 'wall'),
      ('wall_12', 'wall'),
      ('cannon_1', 'cannon'),
      ('cannon_1', 'mortar'),
      ('cannon_1', 'harpoon'),
      ('cannon_1', 'culverin'),
      ('cannon_1', 'swivel'),
      ('cannon_2', 'cannon'),
      ('cannon_2', 'mortar'),
      ('cannon_2', 'harpoon'),
      ('cannon_2', 'culverin'),
      ('cannon_2', 'swivel'),
      ('cannon_3', 'cannon'),
      ('cannon_3', 'mortar'),
      ('cannon_3', 'harpoon'),
      ('cannon_3', 'culverin'),
      ('cannon_3', 'swivel'),
      ('cannon_4', 'cannon'),
      ('cannon_4', 'mortar'),
      ('cannon_4', 'harpoon'),
      ('cannon_4', 'culverin'),
      ('cannon_4', 'swivel'),
      ('cannon_5', 'cannon'),
      ('cannon_5', 'mortar'),
      ('cannon_5', 'harpoon'),
      ('cannon_5', 'culverin'),
      ('cannon_5', 'swivel'),
      ('cannon_6', 'cannon'),
      ('cannon_6', 'mortar'),
      ('cannon_6', 'harpoon'),
      ('cannon_6', 'culverin'),
      ('cannon_6', 'swivel'),
      ('cannon_7', 'cannon'),
      ('cannon_7', 'mortar'),
      ('cannon_7', 'harpoon'),
      ('cannon_7', 'culverin'),
      ('cannon_7', 'swivel'),
      ('cannon_8', 'cannon'),
      ('cannon_8', 'mortar'),
      ('cannon_8', 'harpoon'),
      ('cannon_8', 'culverin'),
      ('cannon_8', 'swivel'),
      ('cannon_9', 'cannon'),
      ('cannon_9', 'mortar'),
      ('cannon_9', 'harpoon'),
      ('cannon_9', 'culverin'),
      ('cannon_9', 'swivel'),
      ('cannon_10', 'cannon'),
      ('cannon_10', 'mortar'),
      ('cannon_10', 'harpoon'),
      ('cannon_10', 'culverin'),
      ('cannon_10', 'swivel'),
      ('cannon_11', 'cannon'),
      ('cannon_11', 'mortar'),
      ('cannon_11', 'harpoon'),
      ('cannon_11', 'culverin'),
      ('cannon_11', 'swivel'),
      ('tower_1', 'watchtower'),
      ('house_1', 'house'),
      ('house_2', 'house')
    ));

comment on constraint islet_buildings_plot_fits_building on public.islet_buildings is
  'Each spot holds only its own kinds: the four home islet pairs (buildings.json) and the 26 island spots (islands.json: wall_1..12 wall, the shore walls 1..6 and the inner ring 7..12; cannon_1..7 and the extra tower spots cannon_8..11 of D060 (extraTowerSpots) cannon, mortar, harpoon or swivel, and with defenses_v2.json the culverin; tower_1 watchtower, house_1..2 house). The cabin has no row.';

-- -----------------------------------------------------------------------------
-- 2. The extra tower spots move on the build grid (T36, D041)
-- -----------------------------------------------------------------------------

alter table public.island_layout
  drop constraint if exists island_layout_plot_known,
  add constraint island_layout_plot_known check (plot in (
    'wall_1', 'wall_2', 'wall_3', 'wall_4', 'wall_5', 'wall_6',
    'wall_7', 'wall_8', 'wall_9', 'wall_10', 'wall_11', 'wall_12',
    'cannon_1', 'cannon_2', 'cannon_3', 'cannon_4', 'cannon_5', 'cannon_6', 'cannon_7',
    'cannon_8', 'cannon_9', 'cannon_10', 'cannon_11',
    'tower_1', 'house_1', 'house_2'));


-- -----------------------------------------------------------------------------
-- 3. island_demolish_quote(): the plot test knows cannon_8..cannon_11
-- -----------------------------------------------------------------------------
-- Copied from 20261112080000_demolish.sql section 7; only the plot test changed.

create or replace function public.island_demolish_quote(
  p_player_id     uuid,
  p_island_owner  uuid,
  p_plot          text,
  p_prices        jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_building public.islet_buildings;
begin
  if p_player_id is null or p_island_owner is null or p_plot is null
     or p_prices is null or jsonb_typeof(p_prices) <> 'object' then
    raise exception 'bad_demolish';
  end if;
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
  if exists (
    select 1 from public.wave_runs
     where island_owner = p_island_owner and finished_at is null
       and starts_at + make_interval(secs => maximum_seconds) >= now()
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'wave_running');
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

  return jsonb_build_object(
    'status', 'quote', 'plot', p_plot, 'kind', v_building.building_type, 'level', v_building.level,
    'refunds', public.island_refund_split(
      p_island_owner, v_building.ref, v_building.building_type, v_building.level, p_prices
    )
  );
end;
$$;

revoke all on function public.island_demolish_quote(uuid, uuid, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.island_demolish_quote(uuid, uuid, text, jsonb)
  to service_role;

comment on function public.island_demolish_quote(uuid, uuid, text, jsonb) is
  'What tearing down the building on p_plot of the island of p_island_owner would pay back, per payer, for the confirmation card: {status: quote, plot, kind, level, refunds: [{playerId, paid, coins}]}. Refuses protected (not an island build spot), no_island, not_member, not_built and wave_running. Reads only, locks nothing. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 4. island_demolish(): the plot test knows cannon_8..cannon_11
-- -----------------------------------------------------------------------------
-- Copied from 20261112080000_demolish.sql section 8; only the plot test changed.

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

  return jsonb_build_object(
    'status', 'done', 'plot', p_plot, 'kind', v_building.building_type, 'level', v_building.level,
    'refunds', v_refunds, 'repeat', false
  );
end;
$$;

revoke all on function public.island_demolish(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.island_demolish(uuid, uuid, text, text, jsonb)
  to service_role;

comment on function public.island_demolish(uuid, uuid, text, text, jsonb) is
  'Tears down the building on p_plot of the island of p_island_owner (p_player_id: the host or an active member) while no wave runs there, and pays every payer half of what they paid for it, rounded down (reason building_refund, ref demolish:<uid>); a level without a payment row goes to the host at its price in p_prices. Locks the payers'' and the host''s wallets in player id order, then the island row, then the building. A repeated actionUid answers {status: done, repeat: true} with the same refunds. Refuses protected (not an island build spot), no_island, not_member, not_built, wave_running and busy (a payment arrived meanwhile), with nothing changed. Only service_role may run it.';
