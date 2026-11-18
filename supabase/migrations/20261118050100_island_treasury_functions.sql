-- MP-ECO-02: server-only treasury primitives; no routes/admission are enabled here.
-- Lock order: sorted island advisory scopes, account UUIDs, personal state, island,
-- admission/recovery, wave/assets/product, then immutable receipt insertion.

create or replace function public.island_treasury_lock_scope(p_island_owner uuid)
returns void language sql volatile security definer set search_path = '' as $$
  select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('island-economy:' || p_island_owner::text, 0));
$$;
comment on function public.island_treasury_lock_scope(uuid) is
  'Class-zero scope guard before account locks. Multi-island callers sort distinct signed hash keys ascending. Protects first admission where no account row exists.';

create or replace function public.island_treasury_whole(p_value numeric, p_zero boolean)
returns boolean language sql immutable set search_path = '' as $$
  select p_value is not null and p_value::text not in ('NaN', 'Infinity', '-Infinity')
     and p_value = trunc(p_value) and (p_value > 0 or (p_zero and p_value = 0));
$$;
comment on function public.island_treasury_whole(numeric, boolean) is
  'Validate finite integral coins without a fixed stake or legacy wallet ceiling.';

create or replace function public.island_treasury_envelope(p_account public.island_economy_accounts)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'mode', 'island_shared', 'version', p_account.economy_version,
    'islandOwner', p_account.island_owner, 'accountId', p_account.id,
    'runEpoch', p_account.run_epoch, 'revision', trunc(p_account.revision)::text,
    'treasury', jsonb_build_object(
      'balanceCoins', trunc(p_account.balance_coins)::text,
      'committedCoins', trunc(p_account.committed_coins)::text,
      'availableCoins', trunc(p_account.balance_coins - p_account.committed_coins)::text));
$$;
comment on function public.island_treasury_envelope(public.island_economy_accounts) is
  'Exact common DTO for a specified originating account. Money/revision are decimal strings.';

create or replace function public.island_treasury_result(p_receipt_id uuid, p_repeat boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_receipt public.island_treasury_transactions;
  v_account public.island_economy_accounts;
  v_admission text;
begin
  select * into strict v_receipt from public.island_treasury_transactions where id = p_receipt_id;
  select * into strict v_account from public.island_economy_accounts where id = v_receipt.account_id;
  select admission_state into v_admission from public.island_economy_state
   where current_account_id = v_account.id;
  return jsonb_build_object('status', 'done', 'repeat', p_repeat,
    'currentEconomy', public.island_treasury_envelope(v_account),
    'accountState', v_account.state, 'admissionState', v_admission,
    'receipt', jsonb_build_object(
      'id', v_receipt.id, 'accountId', v_receipt.account_id, 'runEpoch', v_receipt.run_epoch,
      'actorId', v_receipt.actor_id, 'actionUid', v_receipt.action_uid,
      'kind', v_receipt.kind, 'reason', v_receipt.reason, 'reference', v_receipt.reference,
      'balanceDelta', trunc(v_receipt.balance_delta)::text,
      'committedDelta', trunc(v_receipt.committed_delta)::text,
      'balanceAtCommit', trunc(v_receipt.balance_at_commit)::text,
      'committedAtCommit', trunc(v_receipt.committed_at_commit)::text,
      'revisionAtCommit', trunc(v_receipt.revision_at_commit)::text,
      'sourceReservationId', v_receipt.source_reservation_id));
end;
$$;
comment on function public.island_treasury_result(uuid, boolean) is
  'Separate original immutable receipt values from fresh originating-account state on every retry.';

create or replace function public.island_treasury_replay(
  p_account_id uuid, p_actor_id uuid, p_action_uid text, p_reason text,
  p_reference text, p_fingerprint jsonb
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_ids uuid[];
  v_receipt public.island_treasury_transactions;
begin
  select array_agg(id) into v_ids from public.island_treasury_transactions
   where (actor_id = p_actor_id and action_uid = p_action_uid)
      or (account_id = p_account_id and action_uid = p_action_uid)
      or (account_id = p_account_id and reason = p_reason and reference = p_reference);
  if v_ids is null then return null; end if;
  if cardinality(v_ids) <> 1 then
    return jsonb_build_object('status', 'refused', 'reason', 'action_conflict');
  end if;
  select * into strict v_receipt from public.island_treasury_transactions where id = v_ids[1];
  if v_receipt.account_id <> p_account_id or v_receipt.actor_id <> p_actor_id
     or v_receipt.request_fingerprint <> p_fingerprint then
    return jsonb_build_object('status', 'refused', 'reason', 'action_conflict');
  end if;
  return public.island_treasury_result(v_receipt.id, true);
end;
$$;
comment on function public.island_treasury_replay(uuid, uuid, text, text, text, jsonb) is
  'Return the original business receipt or refuse changed inputs/targets; canonical origin references cannot mint twice.';

create or replace function public.island_treasury_record_locked(
  p_account_id uuid, p_actor_id uuid, p_action_uid text, p_kind text, p_reason text,
  p_reference text, p_fingerprint jsonb, p_balance_delta numeric,
  p_committed_delta numeric, p_source_reservation_id uuid default null
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_account public.island_economy_accounts;
  v_receipt_id uuid;
  v_replay jsonb;
begin
  -- Private helper: caller must take the scope/account locks before other resources.
  select * into strict v_account from public.island_economy_accounts
   where id = p_account_id for update;
  if v_account.balance_coins + p_balance_delta < v_account.committed_coins + p_committed_delta
     or v_account.committed_coins + p_committed_delta < 0 then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds');
  end if;
  update public.island_economy_accounts
     set balance_coins = balance_coins + trunc(p_balance_delta),
         committed_coins = committed_coins + trunc(p_committed_delta), revision = revision + 1
   where id = p_account_id returning * into v_account;
  insert into public.island_treasury_transactions
    (account_id, run_epoch, actor_id, action_uid, kind, reason, reference,
     request_fingerprint, balance_delta, committed_delta, balance_at_commit,
     committed_at_commit, revision_at_commit, source_reservation_id)
  values (v_account.id, v_account.run_epoch, p_actor_id, p_action_uid, p_kind, p_reason,
    p_reference, p_fingerprint, trunc(p_balance_delta), trunc(p_committed_delta),
    v_account.balance_coins, v_account.committed_coins, v_account.revision,
    p_source_reservation_id) returning id into v_receipt_id;
  return public.island_treasury_result(v_receipt_id, false);
exception when unique_violation then
  -- This block rolls back its balance update before resolving a cross-account UID race.
  v_replay := public.island_treasury_replay(p_account_id, p_actor_id, p_action_uid,
    p_reason, p_reference, p_fingerprint);
  return coalesce(v_replay, jsonb_build_object('status', 'refused', 'reason', 'action_conflict'));
end;
$$;
comment on function public.island_treasury_record_locked(uuid, uuid, text, text, text, text, jsonb, numeric, numeric, uuid) is
  'Private atomic account/receipt change. Future game RPCs call within the same transaction as their checked asset mutation; never debit via a separate network request.';

create or replace function public.island_economy_context(p_island_owner uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_state public.island_economy_state;
  v_account public.island_economy_accounts;
begin
  if not exists (select 1 from public.islands where player_id = p_island_owner) then
    return jsonb_build_object('status', 'missing_island');
  end if;
  select * into v_state from public.island_economy_state where island_owner = p_island_owner;
  if not found then
    return jsonb_build_object('status', 'legacy', 'islandOwner', p_island_owner);
  end if;
  select * into strict v_account from public.island_economy_accounts
   where id = v_state.current_account_id and island_owner = p_island_owner
     and run_epoch = v_state.run_epoch and state = 'active';
  return jsonb_build_object('status', 'ok',
    'economy', public.island_treasury_envelope(v_account),
    'accountState', v_account.state, 'admissionState', v_state.admission_state);
end;
$$;
comment on function public.island_economy_context(uuid) is
  'Server-only consistent persisted mode/context read. No membership authorization is implied; the permission layer owns that check.';

create or replace function public.island_treasury_admit(
  p_actor_id uuid, p_island_owner uuid, p_action_uid text, p_starting_coins numeric
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_state public.island_economy_state;
  v_account public.island_economy_accounts;
  v_fingerprint jsonb;
  v_replay jsonb;
  v_result jsonb;
begin
  if p_actor_id is null or p_island_owner is null or p_action_uid is null
     or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or not public.island_treasury_whole(p_starting_coins, true) then
    return jsonb_build_object('status', 'refused', 'reason', 'invalid_change');
  end if;
  if p_actor_id <> p_island_owner then
    return jsonb_build_object('status', 'refused', 'reason', 'not_owner');
  end if;
  perform public.island_treasury_lock_scope(p_island_owner);
  select * into v_state from public.island_economy_state where island_owner = p_island_owner;
  if found then
    perform 1 from public.island_economy_accounts where id = v_state.current_account_id for update;
  end if;
  perform 1 from public.islands where player_id = p_island_owner for update;
  if not found then return jsonb_build_object('status', 'missing_island'); end if;
  v_fingerprint := jsonb_build_object('kind', 'admission', 'actor', p_actor_id,
    'island', p_island_owner, 'starting', trunc(p_starting_coins)::text);
  if v_state.current_account_id is not null then
    if exists (select 1 from public.island_treasury_transactions
      where (actor_id = p_actor_id or account_id = v_state.current_account_id)
        and action_uid = p_action_uid) then
      v_replay := public.island_treasury_replay(v_state.current_account_id, p_actor_id,
        p_action_uid, 'starting_coins', 'starting_coins', v_fingerprint);
    end if;
    return coalesce(v_replay,
      jsonb_build_object('status', 'refused', 'reason', 'already_admitted'));
  end if;
  if exists (select 1 from public.wave_runs where island_owner = p_island_owner
    and finished_at is null
    and starts_at + make_interval(secs => maximum_seconds) > clock_timestamp())
    or exists (select 1 from public.island_recovery_state where island_owner = p_island_owner
      and current_wave_id is not null and expires_at > clock_timestamp()) then
    return jsonb_build_object('status', 'refused', 'reason', 'wave_running');
  end if;
  begin
    insert into public.island_economy_accounts(island_owner)
      values (p_island_owner) returning * into v_account;
    insert into public.island_economy_state(island_owner, current_account_id, run_epoch)
      values (p_island_owner, v_account.id, v_account.run_epoch);
    v_result := public.island_treasury_record_locked(v_account.id, p_actor_id, p_action_uid,
      'credit', 'starting_coins', 'starting_coins', v_fingerprint, p_starting_coins, 0);
    if v_result->>'status' <> 'done' then
      raise exception using errcode = 'PT001', message = 'treasury_admission_not_applied';
    end if;
    return v_result;
  exception when sqlstate 'PT001' then
    -- An actor/UID collision on another island must not leave an admitted empty
    -- account after the grant itself rolled back.
    return v_result;
  end;
end;
$$;
comment on function public.island_treasury_admit(uuid, uuid, text, numeric) is
  'Explicit owner-only bootstrap with one starting receipt per already-known island. Existing admission never creates a second epoch/grant. No runtime route calls this until conversion/admission policy is approved.';

-- Financial primitives use this checked member path; game-specific phase/price/asset
-- checks still belong to the encompassing game RPC in the same transaction.
create or replace function public.island_treasury_member_change(
  p_actor_id uuid, p_account_id uuid, p_run_epoch uuid, p_action_uid text,
  p_kind text, p_reason text, p_reference text, p_amount numeric, p_fee numeric
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_account public.island_economy_accounts;
  v_state public.island_economy_state;
  v_fingerprint jsonb;
  v_replay jsonb;
begin
  if p_actor_id is null or p_account_id is null or p_run_epoch is null
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_reference is null or char_length(p_reference) not between 1 and 120
     or btrim(p_reference) = '' or not public.island_treasury_whole(p_amount, false)
     or not public.island_treasury_whole(p_fee, true) then
    return jsonb_build_object('status', 'refused', 'reason', 'invalid_change');
  end if;
  if (p_kind = 'spend' and (p_fee <> 0 or p_reason not in
      ('building_purchase', 'crew_hire', 'weapon_purchase', 'tech_research',
       'wreck_repair', 'tower_skill', 'tower_tree', 'structure_repair')))
    or (p_kind = 'reserve' and p_reason not in
      ('market_stake', 'market_call_stake', 'prediction_stake', 'arena_stake'))
    or p_kind not in ('spend', 'reserve') or p_reason is null then
    return jsonb_build_object('status', 'refused', 'reason', 'invalid_change');
  end if;
  select * into v_account from public.island_economy_accounts where id = p_account_id;
  if not found then return jsonb_build_object('status', 'refused', 'reason', 'account_missing'); end if;
  perform public.island_treasury_lock_scope(v_account.island_owner);
  select * into strict v_account from public.island_economy_accounts
   where id = p_account_id for update;
  v_fingerprint := jsonb_build_object('kind', p_kind, 'actor', p_actor_id,
    'account', p_account_id, 'epoch', p_run_epoch, 'reason', p_reason,
    'reference', p_reference, 'amount', trunc(p_amount)::text, 'fee', trunc(p_fee)::text);
  v_replay := public.island_treasury_replay(p_account_id, p_actor_id, p_action_uid,
    p_reason, p_reference, v_fingerprint);
  if v_replay is not null then return v_replay; end if;
  if v_account.run_epoch <> p_run_epoch then
    return jsonb_build_object('status', 'refused', 'reason', 'epoch_mismatch');
  end if;
  perform 1 from public.islands where player_id = v_account.island_owner for update;
  if p_actor_id <> v_account.island_owner and not exists (
    select 1 from public.island_members where island_owner = v_account.island_owner
      and player_id = p_actor_id and left_at is null
  ) then return jsonb_build_object('status', 'refused', 'reason', 'not_member'); end if;
  select * into v_state from public.island_economy_state
   where island_owner = v_account.island_owner for update;
  if v_account.state <> 'active' or v_state.current_account_id is distinct from p_account_id
     or v_state.run_epoch is distinct from p_run_epoch or v_state.admission_state <> 'active' then
    return jsonb_build_object('status', 'refused', 'reason', 'path_unavailable');
  end if;
  if v_account.balance_coins - v_account.committed_coins < p_amount + p_fee then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds');
  end if;
  return public.island_treasury_record_locked(p_account_id, p_actor_id, p_action_uid,
    p_kind, p_reason, p_reference, v_fingerprint,
    case when p_kind = 'spend' then -p_amount else -p_fee end,
    case when p_kind = 'reserve' then p_amount else 0 end);
end;
$$;
comment on function public.island_treasury_member_change(uuid, uuid, uuid, text, text, text, text, numeric, numeric) is
  'Private new-spending path: same available funds for purchases and wagers; account/epoch/current admission and member checks are locked. No extra wager caps.';

create or replace function public.island_treasury_spend(
  p_actor_id uuid, p_account_id uuid, p_run_epoch uuid, p_action_uid text,
  p_reason text, p_reference text, p_amount numeric
) returns jsonb language sql volatile security definer set search_path = '' as $$
  select public.island_treasury_member_change(p_actor_id, p_account_id, p_run_epoch,
    p_action_uid, 'spend', p_reason, p_reference, p_amount, 0);
$$;
comment on function public.island_treasury_spend(uuid, uuid, uuid, text, text, text, numeric) is
  'Server-only financial debit primitive; a game purchase must share its database transaction with the asset mutation.';

create or replace function public.island_treasury_reserve(
  p_actor_id uuid, p_account_id uuid, p_run_epoch uuid, p_action_uid text,
  p_reason text, p_reference text, p_principal numeric, p_fee numeric
) returns jsonb language sql volatile security definer set search_path = '' as $$
  select public.island_treasury_member_change(p_actor_id, p_account_id, p_run_epoch,
    p_action_uid, 'reserve', p_reason, p_reference, p_principal, p_fee);
$$;
comment on function public.island_treasury_reserve(uuid, uuid, uuid, text, text, text, numeric, numeric) is
  'Reserve principal plus any product opening fee against all free treasury funds. Reserve receipt is the immutable source for exactly one settlement.';

create or replace function public.island_treasury_credit(
  p_actor_id uuid, p_account_id uuid, p_run_epoch uuid, p_action_uid text,
  p_reason text, p_reference text, p_amount numeric
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_account public.island_economy_accounts;
  v_fingerprint jsonb;
  v_replay jsonb;
begin
  if p_actor_id is null or p_account_id is null or p_run_epoch is null
    or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
    or p_reference is null or char_length(p_reference) not between 1 and 120
    or btrim(p_reference) = '' or not public.island_treasury_whole(p_amount, false)
    or p_reason is null or p_reason not in ('pirate_loot', 'building_refund', 'boat_game') then
    return jsonb_build_object('status', 'refused', 'reason', 'invalid_change');
  end if;
  select * into v_account from public.island_economy_accounts where id = p_account_id;
  if not found then return jsonb_build_object('status', 'refused', 'reason', 'account_missing'); end if;
  perform public.island_treasury_lock_scope(v_account.island_owner);
  select * into strict v_account from public.island_economy_accounts
   where id = p_account_id for update;
  v_fingerprint := jsonb_build_object('kind', 'credit', 'actor', p_actor_id,
    'account', p_account_id, 'epoch', p_run_epoch, 'reason', p_reason,
    'reference', p_reference, 'amount', trunc(p_amount)::text);
  v_replay := public.island_treasury_replay(p_account_id, p_actor_id, p_action_uid,
    p_reason, p_reference, v_fingerprint);
  if v_replay is not null then return v_replay; end if;
  if v_account.run_epoch <> p_run_epoch then
    return jsonb_build_object('status', 'refused', 'reason', 'epoch_mismatch');
  end if;
  -- Privileged server-origin credit: the domain caller verifies its canonical
  -- reward/refund source. Current membership or selected island is irrelevant.
  return public.island_treasury_record_locked(p_account_id, p_actor_id, p_action_uid,
    'credit', p_reason, p_reference, v_fingerprint, p_amount, 0);
end;
$$;
comment on function public.island_treasury_credit(uuid, uuid, uuid, text, text, text, numeric) is
  'Privileged canonical reward/refund primitive bound to saved account/epoch. Domain verification belongs to the encompassing server/game RPC; no current-member requirement and no new starting-grant reason.';

create or replace function public.island_treasury_settle(
  p_reservation_id uuid, p_returned_payout numeric, p_reference text, p_action_uid text
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_source public.island_treasury_transactions;
  v_account public.island_economy_accounts;
  v_fingerprint jsonb;
  v_replay jsonb;
  v_reason text;
begin
  if p_reservation_id is null or p_action_uid is null
     or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_reference is null or char_length(p_reference) not between 1 and 120
     or btrim(p_reference) = '' or not public.island_treasury_whole(p_returned_payout, true) then
    return jsonb_build_object('status', 'refused', 'reason', 'invalid_change');
  end if;
  select * into v_source from public.island_treasury_transactions
   where id = p_reservation_id and kind = 'reserve';
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'reservation_missing');
  end if;
  select * into strict v_account from public.island_economy_accounts where id = v_source.account_id;
  perform public.island_treasury_lock_scope(v_account.island_owner);
  perform 1 from public.island_economy_accounts where id = v_account.id for update;
  v_reason := case v_source.reason when 'market_stake' then 'market_payout'
    when 'market_call_stake' then 'market_call_payout'
    when 'prediction_stake' then 'prediction_payout' when 'arena_stake' then 'arena_payout' end;
  v_fingerprint := jsonb_build_object('kind', 'settle', 'source', p_reservation_id,
    'reference', p_reference, 'returnedPayout', trunc(p_returned_payout)::text);
  v_replay := public.island_treasury_replay(v_account.id, v_source.actor_id,
    p_action_uid, v_reason, p_reference, v_fingerprint);
  if v_replay is not null then return v_replay; end if;
  if exists (select 1 from public.island_treasury_transactions
    where source_reservation_id = p_reservation_id) then
    return jsonb_build_object('status', 'refused', 'reason', 'reservation_settled');
  end if;
  -- Returned payout includes principal and is already net of any closing fee;
  -- the verified product caller applies that fee once, never again here.
  -- Source is immutable; principal, account, epoch, actor and payout reason are
  -- derived here, never chosen from the caller's current membership or location.
  return public.island_treasury_record_locked(v_account.id, v_source.actor_id, p_action_uid,
    'settle', v_reason, p_reference, v_fingerprint,
    p_returned_payout - v_source.committed_delta, -v_source.committed_delta, p_reservation_id);
end;
$$;
comment on function public.island_treasury_settle(uuid, numeric, text, text) is
  'Resolve one immutable hold exactly once, including after departure/retirement. The trusted product caller verifies returned payout including principal after closing fees; this primitive derives original account/epoch/actor/principal and deducts no second closing fee.';

-- Private helpers are callable only inside owner-defined SQL game functions.
revoke all on function public.island_treasury_lock_scope(uuid) from public, anon, authenticated, service_role;
revoke all on function public.island_treasury_whole(numeric, boolean) from public, anon, authenticated, service_role;
revoke all on function public.island_treasury_envelope(public.island_economy_accounts) from public, anon, authenticated, service_role;
revoke all on function public.island_treasury_result(uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function public.island_treasury_replay(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.island_treasury_record_locked(uuid, uuid, text, text, text, text, jsonb, numeric, numeric, uuid) from public, anon, authenticated, service_role;
revoke all on function public.island_treasury_member_change(uuid, uuid, uuid, text, text, text, text, numeric, numeric) from public, anon, authenticated, service_role;

revoke all on function public.island_economy_context(uuid) from public, anon, authenticated, service_role;
revoke all on function public.island_treasury_admit(uuid, uuid, text, numeric) from public, anon, authenticated, service_role;
revoke all on function public.island_treasury_spend(uuid, uuid, uuid, text, text, text, numeric) from public, anon, authenticated, service_role;
revoke all on function public.island_treasury_reserve(uuid, uuid, uuid, text, text, text, numeric, numeric) from public, anon, authenticated, service_role;
revoke all on function public.island_treasury_credit(uuid, uuid, uuid, text, text, text, numeric) from public, anon, authenticated, service_role;
revoke all on function public.island_treasury_settle(uuid, numeric, text, text) from public, anon, authenticated, service_role;
grant execute on function public.island_economy_context(uuid) to service_role;
grant execute on function public.island_treasury_admit(uuid, uuid, text, numeric) to service_role;
grant execute on function public.island_treasury_spend(uuid, uuid, uuid, text, text, text, numeric) to service_role;
grant execute on function public.island_treasury_reserve(uuid, uuid, uuid, text, text, text, numeric, numeric) to service_role;
grant execute on function public.island_treasury_credit(uuid, uuid, uuid, text, text, text, numeric) to service_role;
grant execute on function public.island_treasury_settle(uuid, numeric, text, text) to service_role;
