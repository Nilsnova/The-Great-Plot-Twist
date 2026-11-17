-- WALL-20: admit the selected bounded wall cohort to existing paid repair.
-- Requires WALL-19. The current transaction is preserved; only its identity
-- guard changes. No price, receipt, quota, recovery or refund rule changes.

create or replace function public.island_structure_repair(
  p_player_id          uuid,
  p_island_owner       uuid,
  p_spot               text,
  p_instance_id        uuid,
  p_action_uid         text,
  p_expected_epoch     uuid,
  p_expected_window    text,
  p_expected_wave_id   uuid,
  p_expected_level     integer,
  p_expected_repair_seq bigint,
  p_quoted_price       integer,
  p_request_fingerprint text,
  p_prices             jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_wallet_balance bigint;
  v_server_now timestamptz;
  v_phase jsonb;
  v_current_window text;
  v_current_wave uuid;
  v_epoch uuid;
  v_recovery_version smallint;
  v_wave_protocol smallint;
  v_building public.islet_buildings;
  v_health public.island_structure_health;
  v_wave public.recovery_wave_states;
  v_snapshot_structure jsonb;
  v_receipt public.structure_repair_receipts;
  v_price integer;
  v_ordinal smallint;
  v_event_seq bigint;
  v_wave_repair_seq bigint;
  v_effective_tick integer;
  v_participant_token uuid;
  v_repair_seq bigint;
  v_event_max_hp numeric;
  v_target_hp integer;
  v_balance bigint;
  v_event jsonb;
  v_receipt_json jsonb;
  v_prices jsonb;
begin
  if p_player_id is null or p_island_owner is null or p_spot is null
     or not (public.island_wall_number(p_spot) is not null
       or p_spot ~ '^(cannon_([1-9]|1[01])|tower_1)$')
     or p_instance_id is null
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_expected_epoch is null
     or p_expected_window is null
     or p_expected_window not in ('between_waves', 'reserved_wave')
     or (p_expected_window = 'between_waves' and p_expected_wave_id is not null)
     or (p_expected_window = 'reserved_wave' and p_expected_wave_id is null)
     or p_expected_level is null or p_expected_level not between 1 and 5
     or p_expected_repair_seq is null or p_expected_repair_seq < 0
     or p_quoted_price is null or p_quoted_price not between 1 and 1000000
     or p_request_fingerprint is null
     or p_request_fingerprint !~ '^[0-9a-f]{64}$'
     or p_prices is null or jsonb_typeof(p_prices) <> 'object' then
    raise exception 'bad_structure_repair';
  end if;

  -- D043: the clicker pays. The wallet is the first lock in the shared order.
  select balance into v_wallet_balance
    from public.wallets
   where player_id = p_player_id
     for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  -- Lock the island before reading membership, epoch or recovery state. The caller
  -- may be its owner or an active member; outsiders are rejected before UID lookup.
  perform 1
    from public.islands
   where player_id = p_island_owner
     for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_island');
  end if;
  if p_player_id <> p_island_owner and not exists (
    select 1
      from public.island_members
     where island_owner = p_island_owner
       and player_id = p_player_id
       and left_at is null
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'not_member');
  end if;

  -- One database instant after wallet and island locks; the shared helper then
  -- locks recovery state, wave rows and all structure rows in canonical order.
  v_server_now := clock_timestamp();
  v_phase := public.structure_recovery_settle_locked(p_island_owner, v_server_now);
  v_current_window := v_phase ->> 'repairWindow';
  v_current_wave := nullif(v_phase ->> 'waveId', '')::uuid;
  v_epoch := nullif(v_phase ->> 'islandEpoch', '')::uuid;
  v_recovery_version := nullif(v_phase ->> 'recoveryVersion', '')::smallint;
  v_wave_protocol := nullif(v_phase ->> 'waveProtocol', '')::smallint;

  -- An old UID is resolved before epoch, phase, level or quote staleness. Receipts
  -- are immutable reads; the SQL transaction still rechecks the payer's access.
  select * into v_receipt
    from public.structure_repair_receipts
   where payer_id = p_player_id
     and action_uid = p_action_uid;
  if found then
    if v_receipt.island_owner <> p_island_owner
       or v_receipt.reset_epoch <> p_expected_epoch
       or v_receipt.instance_id <> p_instance_id
       or v_receipt.spot <> p_spot
       or v_receipt.level <> p_expected_level
       or v_receipt.charged_price <> p_quoted_price
       or v_receipt.request_fingerprint <> p_request_fingerprint then
      return jsonb_build_object('status', 'refused', 'reason', 'action_uid_conflict');
    end if;
    return jsonb_build_object(
      'status', 'done', 'repeat', true, 'receipt', v_receipt.receipt_json,
      'balance', v_wallet_balance
    );
  end if;

  -- Saved recovery-v1 receipts stay retryable after policy admission is disabled;
  -- only a fresh action needs the current island's policy and protocol.
  if v_phase ->> 'status' in ('missing', 'legacy')
     or v_recovery_version is distinct from 1 or v_wave_protocol is distinct from 2 then
    return jsonb_build_object('status', 'refused', 'reason', 'feature_off');
  end if;
  if v_phase ->> 'status' not in ('reserved', 'between_waves', 'settled') then
    return jsonb_build_object('status', 'refused', 'reason', 'recovery_unavailable');
  end if;

  -- All later refusals are side-effect free. A phase or reset crossing requires
  -- the caller to fetch the current quote again.
  if v_epoch is distinct from p_expected_epoch
     or v_current_window is distinct from p_expected_window
     or (v_current_window = 'reserved_wave' and v_current_wave is distinct from p_expected_wave_id)
     or (v_current_window = 'between_waves' and v_current_wave is not null) then
    return jsonb_build_object('status', 'refused', 'reason', 'stale_recovery_quote');
  end if;

  -- The helper has locked health rows and materialized eligible between-wave HP.
  select * into v_building
    from public.islet_buildings
   where player_id = p_island_owner
     and plot = p_spot
     and recovery_instance_id = p_instance_id
     for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'stale_recovery_quote');
  end if;
  if v_building.building_type not in ('wall', 'cannon', 'mortar', 'harpoon', 'culverin', 'swivel') then
    return jsonb_build_object('status', 'refused', 'reason', 'wrong_kind');
  end if;
  if v_building.level <> p_expected_level then
    return jsonb_build_object('status', 'refused', 'reason', 'stale_recovery_quote');
  end if;

  select * into v_health
    from public.island_structure_health
   where island_owner = p_island_owner
     and spot = p_spot
     and instance_id = p_instance_id
     for update;
  if not found or v_health.building_kind <> v_building.building_type
     or v_health.level <> v_building.level then
    return jsonb_build_object('status', 'refused', 'reason', 'recovery_unavailable');
  end if;
  if v_health.repair_seq <> p_expected_repair_seq then
    return jsonb_build_object('status', 'refused', 'reason', 'stale_recovery_quote');
  end if;

  -- A running wave uses the immutable bell-time price schedule. Outside a wave,
  -- the server catalogue schedule is authoritative. No damage, payer or bonus
  -- multiplier enters the calculation.
  if v_current_window = 'reserved_wave' then
    select * into v_wave
      from public.recovery_wave_states
     where wave_id = v_current_wave
       and island_owner = p_island_owner
       and reset_epoch = v_epoch
     for update;
    if not found or v_wave.closed_at is not null then
      return jsonb_build_object('status', 'refused', 'reason', 'stale_recovery_quote');
    end if;
    v_wave_repair_seq := v_wave.last_repair_seq + 1;
    select participant_token into v_participant_token
      from public.recovery_wave_participants
     where wave_id = v_current_wave
       and player_id = p_player_id;
    v_prices := v_wave.initial_snapshot -> 'priceSchedule' -> v_building.building_type;
  else
    v_prices := p_prices -> v_building.building_type;
  end if;
  if jsonb_typeof(v_prices) is distinct from 'array'
     or jsonb_array_length(case when jsonb_typeof(v_prices) = 'array' then v_prices else '[]'::jsonb end)
          < v_building.level
     or jsonb_typeof(v_prices -> (v_building.level - 1)) is distinct from 'number' then
    return jsonb_build_object('status', 'refused', 'reason', 'recovery_unavailable');
  end if;
  if (v_prices ->> (v_building.level - 1))::numeric not between 1 and 1000000
     or (v_prices ->> (v_building.level - 1))::numeric
           <> trunc((v_prices ->> (v_building.level - 1))::numeric) then
    return jsonb_build_object('status', 'refused', 'reason', 'recovery_unavailable');
  end if;
  v_price := (v_prices ->> (v_building.level - 1))::integer;
  if v_price <> p_quoted_price then
    return jsonb_build_object('status', 'refused', 'reason', 'stale_recovery_quote', 'price', v_price);
  end if;
  -- During a reservation, accepted checkpoints and subsequent paid events are
  -- authoritative. The health row can still contain its bell-time or last-paid
  -- value until canonical closure; consulting it would reject newly damaged
  -- targets or charge a target the shared journal has already restored.
  v_target_hp := v_health.hp_units;
  if v_current_window = 'reserved_wave' then
    v_target_hp := coalesce(
      (public.structure_recovery_wave_hp(v_current_wave) ->> p_instance_id::text)::integer,
      v_target_hp
    );
  end if;
  if v_target_hp = 1000000 then
    return jsonb_build_object('status', 'refused', 'reason', 'intact');
  end if;

  if v_current_window = 'reserved_wave' then
    if jsonb_typeof(v_wave.initial_snapshot -> 'structures') is distinct from 'array' then
      return jsonb_build_object('status', 'refused', 'reason', 'recovery_unavailable');
    end if;
    select item.value into v_snapshot_structure
      from jsonb_array_elements(v_wave.initial_snapshot -> 'structures') as item(value)
     where item.value ->> 'instanceId' = p_instance_id::text
       and item.value ->> 'spot' = p_spot
       and item.value ->> 'kind' = v_building.building_type
       and item.value ->> 'level' = v_building.level::text
     limit 1;
    if not found then
      return jsonb_build_object('status', 'refused', 'reason', 'stale_recovery_quote');
    end if;
    if jsonb_typeof(v_snapshot_structure -> 'maxHP') is distinct from 'number' then
      return jsonb_build_object('status', 'refused', 'reason', 'recovery_unavailable');
    end if;
    v_event_max_hp := (v_snapshot_structure ->> 'maxHP')::numeric;
    if v_event_max_hp not between 0.01 and 9999999999.99 then
      return jsonb_build_object('status', 'refused', 'reason', 'recovery_unavailable');
    end if;
  end if;

  -- Exactly three successful repairs share the reserved wave across all players
  -- and structures. A failed repair never increments this counter.
  if v_current_window = 'reserved_wave' then
    if v_wave.paid_used >= 3 then
      return jsonb_build_object('status', 'refused', 'reason', 'repair_limit_reached');
    end if;
    v_ordinal := v_wave.paid_used + 1;
    v_event_seq := v_wave.journal_head + 1;
    v_effective_tick := greatest(
      0,
      floor(
        extract(
          epoch from (
            v_server_now - (v_wave.initial_snapshot ->> 'startsAt')::timestamptz
          )
        ) * 20
      )::integer,
      v_wave.sealed_through_tick + 1
    );
  end if;
  v_repair_seq := v_health.repair_seq + 1;

  if v_wallet_balance < v_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', v_price);
  end if;

  -- Do not insert building_payments: Repair now never becomes refundable build
  -- or upgrade contribution when this structure is demolished later.
  v_balance := public.apply_wallet_transaction(
    p_player_id, -v_price, 'building_purchase', 'structure_repair:' || p_action_uid
  );
  update public.island_structure_health
     set hp_units = 1000000,
         settled_at = v_server_now,
         repair_seq = v_repair_seq,
         updated_at = v_server_now
   where island_owner = p_island_owner
     and spot = p_spot
     and instance_id = p_instance_id;

  if v_current_window = 'reserved_wave' then
    v_event := jsonb_build_object(
      'serverSeq', v_event_seq,
      'effectiveTick', v_effective_tick,
      'type', 'structure_repaired',
      'participantToken', v_participant_token,
      'payload', jsonb_build_object(
        'spot', p_spot,
        'instanceId', p_instance_id,
        'hpUnits', 1000000,
        'maxHP', v_event_max_hp,
        'repairSeq', v_repair_seq,
        'chargedPrice', v_price
      )
    );
    insert into public.recovery_wave_events
      (wave_id, seq, actor_id, participant_token, input_uid, event_kind, effective_tick, payload)
    values (
      v_current_wave, v_event_seq,
      null,
      v_participant_token, null,
      'structure_repaired', v_effective_tick,
      v_event -> 'payload'
    );
    update public.recovery_wave_states
       set paid_used = v_ordinal,
           journal_head = v_event_seq,
           last_repair_seq = v_wave_repair_seq
     where wave_id = v_current_wave;
  end if;

  update public.island_recovery_state
     set revision = revision + 1,
         updated_at = v_server_now
   where island_owner = p_island_owner;

  v_receipt_json := jsonb_build_object(
    'actionUid', p_action_uid,
    'spot', p_spot,
    'instanceId', p_instance_id,
    'kind', v_building.building_type,
    'level', v_building.level,
    'chargedPrice', v_price,
    'balanceAtCommit', v_balance,
    'waveId', v_current_wave,
    'useOrdinal', v_ordinal,
    'eventSeq', v_event_seq,
    'repairSeq', v_repair_seq
  );
  insert into public.structure_repair_receipts (
    payer_id, action_uid, island_owner, reset_epoch, instance_id, spot,
    building_kind, level, wave_id, use_ordinal, charged_price, event_seq,
    receipt_json, request_fingerprint
  ) values (
    p_player_id, p_action_uid, p_island_owner, v_epoch, p_instance_id, p_spot,
    v_building.building_type, v_building.level, v_current_wave, v_ordinal,
    v_price, v_event_seq, v_receipt_json, p_request_fingerprint
  );

  return jsonb_build_object(
    'status', 'done', 'repeat', false, 'receipt', v_receipt_json,
    'balance', v_balance, 'event', v_event
  );
end;
$$;

revoke all on function public.island_structure_repair(
  uuid, uuid, text, uuid, text, uuid, text, uuid, integer, bigint, integer, text, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.island_structure_repair(
  uuid, uuid, text, uuid, text, uuid, text, uuid, integer, bigint, integer, text, jsonb
) to service_role;

comment on function public.island_structure_repair(
  uuid, uuid, text, uuid, text, uuid, text, uuid, integer, bigint, integer, text, jsonb
) is
  'T56 paid Repair now. Revalidates member access and the stable UID before stale quote checks. Locks payer wallet then owner island, calls structure_recovery_settle_locked() with one post-lock database instant, and atomically debits the caller using building_purchase ref structure_repair:<uid>, restores current instance HP to full, stores its immutable receipt, and for a reserved wave appends one structure_repaired event plus the shared quota increment. Uses the frozen wave priceSchedule or current server catalogue prices. Never writes building_payments, so repair spend is not demolition-refundable. Only service_role may run it.';
