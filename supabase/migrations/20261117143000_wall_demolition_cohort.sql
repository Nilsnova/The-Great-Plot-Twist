-- WALL-21: complete cohort demolition admission and authorized receipt replay.
-- Quote source: 20261117010000; mutation source: final recovery-aware 20261117050000.
-- Payer refunds, wallet ordering and recovery hooks remain intact. Requires WALL-19.

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
  if public.island_wall_number(p_plot) is null
     and p_plot !~ '^(cannon_([1-9]|1[01])|tower_1|house_[12])$' then
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

  -- Step 1: only an island build spot, on an island, by a member of its game.
  if public.island_wall_number(p_plot) is null
     and p_plot !~ '^(cannon_([1-9]|1[01])|tower_1|house_[12])$' then
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
  -- Step 2: only a currently authorized caller may read the old receipt.
  select * into v_done
    from public.building_demolitions where demolished_by = p_player_id and ref = v_ref;
  if found then
    -- A replay has no wallet locks or mutation. Lock only its owner to serialize
    -- permission with game_leave(), then check the immutable intent before disclosure.
    perform 1 from public.islands where player_id = p_island_owner for update;
    if not found then return jsonb_build_object('status', 'refused', 'reason', 'no_island'); end if;
    if p_player_id <> p_island_owner and not exists (
      select 1 from public.island_members where island_owner = p_island_owner
        and player_id = p_player_id and left_at is null) then
      return jsonb_build_object('status', 'refused', 'reason', 'not_member');
    end if;
    if v_done.island_owner <> p_island_owner or v_done.plot <> p_plot then
      return jsonb_build_object('status', 'refused', 'reason', 'action_uid_conflict');
    end if;
    return jsonb_build_object(
      'status', 'done', 'plot', v_done.plot, 'kind', v_done.building_type, 'level', v_done.level,
      'refunds', v_done.refunds, 'repeat', true
    );
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
  if (v_recovery ->> 'recoveryVersion')::integer = 1 then
    if v_recovery #>> '{settlement,status}' = 'reserved' then
      return jsonb_build_object('status', 'refused', 'reason', 'wave_running');
    end if;
  elsif exists (
    select 1 from public.wave_runs where island_owner = p_island_owner
      and finished_at is null and starts_at + make_interval(secs => maximum_seconds) >= now()
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
      if v_done.island_owner <> p_island_owner or v_done.plot <> p_plot then
        return jsonb_build_object('status', 'refused', 'reason', 'action_uid_conflict');
      end if;
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
