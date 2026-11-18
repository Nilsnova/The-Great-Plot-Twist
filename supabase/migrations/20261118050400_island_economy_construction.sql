-- MP-ECO-04: atomic shared construction, actual payment basis and immutable receipts.
-- Existing routes and economy admission remain unchanged; only service calls use this path.

-- Cumulative base payments can exceed one legal catalogue increment. Preserve old values
-- and inline validation so legacy invoker writes need no private treasury helper grant.
alter table public.islet_buildings alter column coins_paid type numeric using coins_paid::numeric;
alter table public.islet_buildings drop constraint if exists islet_buildings_coins_paid_range;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.islet_buildings'::regclass
    and conname = 'islet_buildings_coins_paid_integral') then
    alter table public.islet_buildings add constraint islet_buildings_coins_paid_integral
      check (coins_paid::text not in ('NaN','Infinity','-Infinity')
        and coins_paid = trunc(coins_paid) and coins_paid >= 0);
  end if;
end; $$;

-- Preserve the actual shared charge for every acquired base level.
create table if not exists public.island_construction_payments (
  account_id uuid not null,
  run_epoch uuid not null,
  island_owner uuid not null,
  instance_id uuid not null,
  level smallint not null check (level between 1 and 5),
  coins numeric not null check (public.island_treasury_whole(coins, false)),
  source_kind text not null check (source_kind in ('treasury', 'conversion')),
  treasury_receipt_id uuid unique,
  conversion_reference text unique,
  created_at timestamptz not null default clock_timestamp(),
  primary key (account_id, instance_id, level),
  foreign key (account_id, island_owner, run_epoch)
    references public.island_economy_accounts(id, island_owner, run_epoch) on delete restrict,
  foreign key (treasury_receipt_id, account_id, run_epoch)
    references public.island_treasury_transactions(id, account_id, run_epoch) on delete restrict,
  constraint island_construction_payment_source check (
    (source_kind = 'treasury' and treasury_receipt_id is not null and conversion_reference is null)
    or (source_kind = 'conversion' and treasury_receipt_id is null and conversion_reference is not null
      and char_length(conversion_reference) between 1 and 120 and btrim(conversion_reference) <> '')
  )
);

comment on table public.island_construction_payments is
  'Immutable actual base construction/level payments by account/epoch/instance. No personal payer fallback. Conversion rows require an explicit unique audited source; this migration creates none.';
comment on column public.island_construction_payments.account_id is 'Original paying island account.';
comment on column public.island_construction_payments.run_epoch is 'Original run fence.';
comment on column public.island_construction_payments.island_owner is 'Owner consistent with the paying account identity.';
comment on column public.island_construction_payments.instance_id is 'Stable recovery_instance_id, retained after the structure is removed.';
comment on column public.island_construction_payments.level is 'One actual payment for this acquired base level.';
comment on column public.island_construction_payments.coins is 'Actual integral charge after the eligible Engineer discount.';
comment on column public.island_construction_payments.source_kind is 'New treasury purchase or separately approved explicit conversion mapping.';
comment on column public.island_construction_payments.treasury_receipt_id is 'Exact new treasury debit receipt; never a repair or research payment.';
comment on column public.island_construction_payments.conversion_reference is 'Unique audited old-payment origin for a future approved conversion; never client supplied.';
comment on column public.island_construction_payments.created_at is 'Canonical payment-basis creation time.';

-- Preserve the exact asset effect even when demolition refunds no coins.
create table if not exists public.island_construction_receipts (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  action_uid text not null check (action_uid ~ '^[A-Za-z0-9_-]{8,64}$'),
  account_id uuid not null,
  run_epoch uuid not null,
  action text not null check (action in ('build', 'upgrade', 'demolish')),
  instance_id uuid not null,
  request_fingerprint jsonb not null check (jsonb_typeof(request_fingerprint) = 'object'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  treasury_receipt_id uuid unique,
  created_at timestamptz not null default clock_timestamp(),
  unique (actor_id, action_uid),
  unique (account_id, action_uid),
  foreign key (account_id, run_epoch)
    references public.island_economy_accounts(id, run_epoch) on delete restrict,
  foreign key (treasury_receipt_id, account_id, run_epoch)
    references public.island_treasury_transactions(id, account_id, run_epoch) on delete restrict
);
create unique index if not exists island_construction_demolition_once
  on public.island_construction_receipts(account_id, instance_id) where action = 'demolish';

comment on table public.island_construction_receipts is
  'Immutable domain action and exact quoted intent. Keeps zero-refund demolition repeat-safe and prevents an old action from deleting a replacement instance.';
comment on column public.island_construction_receipts.id is 'Stable domain receipt identity.';
comment on column public.island_construction_receipts.actor_id is 'Historical initiating actor, with no profile cascade.';
comment on column public.island_construction_receipts.action_uid is 'One actor action, preserved across retries and account changes.';
comment on column public.island_construction_receipts.account_id is 'Immutable originating account.';
comment on column public.island_construction_receipts.run_epoch is 'Immutable originating run.';
comment on column public.island_construction_receipts.action is 'Build, base-level upgrade or demolition.';
comment on column public.island_construction_receipts.instance_id is 'The exact created, upgraded or removed instance.';
comment on column public.island_construction_receipts.request_fingerprint is 'Original account/epoch and complete quoted intent; a changed retry conflicts.';
comment on column public.island_construction_receipts.result is 'Original resource effect, actual coins and Engineer commitment, never reconstructed from current state.';
comment on column public.island_construction_receipts.treasury_receipt_id is 'Related cash receipt; null only for a zero-coin demolition refund.';
comment on column public.island_construction_receipts.created_at is 'Canonical domain commit time.';

alter table public.island_construction_payments enable row level security;
alter table public.island_construction_receipts enable row level security;
revoke all on table public.island_construction_payments from public, anon, authenticated, service_role;
revoke all on table public.island_construction_receipts from public, anon, authenticated, service_role;
grant select on table public.island_construction_payments to service_role;
grant select on table public.island_construction_receipts to service_role;

-- Payment and action history must survive later building changes and resets.
create or replace function public.island_construction_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'construction_history_immutable';
end;
$$;
create or replace trigger island_construction_payments_immutable
  before update or delete on public.island_construction_payments
  for each row execute function public.island_construction_immutable();
create or replace trigger island_construction_receipts_immutable
  before update or delete on public.island_construction_receipts
  for each row execute function public.island_construction_immutable();
comment on function public.island_construction_immutable() is 'Reject modification of committed construction history.';

-- Missing old payment history is an explicit conversion prerequisite.
create or replace function public.island_construction_refund(
  p_account_id uuid, p_instance_id uuid, p_level integer
) returns numeric language plpgsql stable security definer set search_path = '' as $$
declare
  v_count integer;
  v_paid numeric;
begin
  select count(*), sum(coins) into v_count, v_paid from public.island_construction_payments
   where account_id = p_account_id and instance_id = p_instance_id;
  if v_count <> p_level or exists (select 1 from public.island_construction_payments
    where account_id = p_account_id and instance_id = p_instance_id and level > p_level) then
    raise exception 'construction_basis_missing';
  end if;
  return floor(v_paid / 2);
end;
$$;
comment on function public.island_construction_refund(uuid, uuid, integer) is
  'Half the complete actual shared payment basis, rounded once. Never infer missing personal payments from catalogue prices.';

-- Separate the original effect from a current, membership-authorized balance.
create or replace function public.island_construction_result(
  p_receipt_id uuid, p_repeat boolean, p_show_current boolean
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_receipt public.island_construction_receipts;
  v_account public.island_economy_accounts;
begin
  select * into strict v_receipt from public.island_construction_receipts where id = p_receipt_id;
  select * into strict v_account from public.island_economy_accounts where id = v_receipt.account_id;
  return jsonb_build_object('status', 'done', 'repeat', p_repeat,
    'currentEconomy', case when p_show_current then public.island_treasury_envelope(v_account) end,
    'receipt', jsonb_build_object('receiptId', v_receipt.id, 'actionUid', v_receipt.action_uid,
      'action', v_receipt.action, 'actorId', v_receipt.actor_id,
      'origin', jsonb_build_object('mode', 'island_shared', 'version', 1,
        'islandOwner', v_account.island_owner, 'accountId', v_account.id, 'runEpoch', v_account.run_epoch),
      'result', v_receipt.result));
end;
$$;
comment on function public.island_construction_result(uuid, boolean, boolean) is
  'Original domain receipt and separately authorized fresh state; departed actors receive only their original effect.';

-- Permanent mutations cannot close or bypass an unfinished reservation.
create or replace function public.island_economy_require_idle_locked(p_island_owner uuid)
returns integer language plpgsql volatile security definer set search_path = '' as $$
declare v_version integer;
begin
  -- Caller already holds the shared scope/account and owner island locks.
  select recovery_version into v_version from public.island_recovery_state
   where island_owner = p_island_owner for update;
  if not found then raise exception 'recovery_state_incomplete'; end if;
  if exists (select 1 from public.wave_runs where island_owner = p_island_owner and finished_at is null)
     or exists (select 1 from public.island_recovery_state
       where island_owner = p_island_owner and current_wave_id is not null) then
    raise exception 'wave_running';
  end if;
  return v_version;
end;
$$;
comment on function public.island_economy_require_idle_locked(uuid) is
  'Private permanent-mutation phase guard after account/personal/island locks; returns recovery version. Unfinished reservations, including countdown and stale expiry, require canonical closure. Never auto-expires or settles a legacy wave.';

-- One SQL transaction owns the root identity, charge/refund, asset and Engineer state.
create or replace function public.island_economy_construct(
  p_actor_id uuid, p_account_id uuid, p_run_epoch uuid, p_action_uid text,
  p_intent jsonb, p_catalogue jsonb
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_account public.island_economy_accounts;
  v_state public.island_economy_state;
  v_building public.islet_buildings;
  v_existing public.island_construction_receipts;
  v_health public.island_structure_health;
  v_profile jsonb;
  v_recovery jsonb;
  v_fingerprint jsonb;
  v_manifest jsonb;
  v_finance jsonb;
  v_claim jsonb;
  v_operation_id uuid;
  v_result jsonb;
  v_receipt_id uuid;
  v_finance_id uuid;
  v_instance uuid;
  v_commitment uuid;
  v_action text;
  v_spot text;
  v_kind text;
  v_expected integer;
  v_level integer;
  v_best integer;
  v_base numeric;
  v_price numeric;
  v_quoted numeric;
  v_member boolean;
  v_recovery_version integer;
  v_now timestamptz;
begin
  if p_actor_id is null or p_account_id is null or p_run_epoch is null
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or jsonb_typeof(p_intent) is distinct from 'object'
     or (select count(*) from jsonb_object_keys(p_intent)) <> 6
     or not (p_intent ?& array['action','spot','kind','instanceId','expectedLevel','quotedCoins'])
     or jsonb_typeof(p_intent -> 'action') is distinct from 'string'
     or p_intent ->> 'action' not in ('build','upgrade','demolish')
     or jsonb_typeof(p_intent -> 'spot') is distinct from 'string'
     or jsonb_typeof(p_intent -> 'kind') is distinct from 'string'
     or p_intent ->> 'kind' not in ('wall','cannon','mortar','harpoon','culverin','swivel','watchtower','house')
     or jsonb_typeof(p_intent -> 'quotedCoins') is distinct from 'string'
     or (p_intent ->> 'quotedCoins') !~ '^(0|[1-9][0-9]*)$'
     or jsonb_typeof(p_intent -> 'expectedLevel') is distinct from 'number'
     or (p_intent ->> 'expectedLevel') !~ '^[0-5]$'
     or jsonb_typeof(p_catalogue) is distinct from 'object' then
    return jsonb_build_object('status','refused','reason','invalid_construction');
  end if;
  v_action := p_intent ->> 'action'; v_spot := p_intent ->> 'spot';
  v_kind := p_intent ->> 'kind'; v_expected := (p_intent ->> 'expectedLevel')::integer;
  v_quoted := (p_intent ->> 'quotedCoins')::numeric;
  if (v_action = 'build' and (v_expected <> 0 or p_intent -> 'instanceId' <> 'null'::jsonb))
     or (v_action <> 'build' and (v_expected = 0 or jsonb_typeof(p_intent -> 'instanceId') <> 'string'))
     or (v_action <> 'demolish' and v_quoted = 0) then
    return jsonb_build_object('status','refused','reason','invalid_construction');
  end if;
  select * into v_account from public.island_economy_accounts where id = p_account_id;
  if not found then return jsonb_build_object('status','refused','reason','account_missing'); end if;
  perform public.island_treasury_lock_scope(v_account.island_owner);
  select * into strict v_account from public.island_economy_accounts where id = p_account_id for update;
  v_fingerprint := jsonb_build_object('actor',p_actor_id,'account',p_account_id,
    'epoch',p_run_epoch,'intent',p_intent);
  v_claim := public.island_economy_claim_operation_locked(p_actor_id,p_account_id,
    p_run_epoch,p_action_uid,'construction:'||v_action,v_fingerprint);
  if v_claim ->> 'status' = 'refused' then return v_claim; end if;
  if v_claim ->> 'status' is null or v_claim ->> 'status' not in ('claimed','replay')
     or v_claim ->> 'operationId' is null then
    raise exception 'construction_operation_unreadable';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;
  select * into v_existing from public.island_construction_receipts
   where (actor_id = p_actor_id and action_uid = p_action_uid)
      or (account_id = p_account_id and action_uid = p_action_uid);
  if not found then
    if v_claim ->> 'status' = 'replay' then raise exception 'action_conflict'; end if;
    if v_action <> 'demolish' then
      v_profile := public.personal_captain_lock_state_locked(p_actor_id) -> 'captain';
    end if;
  end if;
  select wave_best into v_best from public.islands where player_id = v_account.island_owner for update;
  v_member := p_actor_id = v_account.island_owner or exists (
    select 1 from public.island_members where island_owner = v_account.island_owner
      and player_id = p_actor_id and left_at is null);
  select * into v_state from public.island_economy_state
   where island_owner = v_account.island_owner for update;
  if v_existing.id is not null then
    if v_existing.request_fingerprint <> v_fingerprint then
      raise exception 'action_conflict';
    end if;
    return public.island_construction_result(v_existing.id,true,coalesce(
      v_member and v_account.state = 'active' and v_state.current_account_id = p_account_id
      and v_state.run_epoch = p_run_epoch and v_state.admission_state = 'active',false));
  end if;
  if not v_member then raise exception 'not_member'; end if;
  if v_account.run_epoch <> p_run_epoch then
    raise exception 'epoch_mismatch';
  end if;
  if v_account.state <> 'active' or v_state.current_account_id is distinct from p_account_id
     or v_state.run_epoch is distinct from p_run_epoch or v_state.admission_state <> 'active' then
    raise exception 'path_unavailable';
  end if;
  v_recovery_version := public.island_economy_require_idle_locked(v_account.island_owner);
  v_now := clock_timestamp();
  if jsonb_typeof(p_catalogue #> array['spots',v_spot]) is distinct from 'object'
     or jsonb_typeof(p_catalogue #> array['spots',v_spot,'kinds']) is distinct from 'array'
     or not (p_catalogue #> array['spots',v_spot,'kinds'] ? v_kind) then
    raise exception 'protected';
  end if;
  if jsonb_typeof(p_catalogue #> array['spots',v_spot,'wave']) is distinct from 'number'
     or (p_catalogue #>> array['spots',v_spot,'wave']) !~ '^(0|[1-9][0-9]*)$' then
    raise exception 'invalid_construction';
  end if;
  if v_best < (p_catalogue #>> array['spots',v_spot,'wave'])::integer then
    raise exception 'locked';
  end if;
  select * into v_building from public.islet_buildings
   where player_id = v_account.island_owner and plot = v_spot for update;
  if v_action = 'build' then
    if found then raise exception 'spot_taken'; end if;
    v_instance := gen_random_uuid(); v_level := 1;
  else
    if not found then raise exception 'not_built'; end if;
    if v_building.recovery_instance_id <> (p_intent ->> 'instanceId')::uuid
       or v_building.level <> v_expected or v_building.building_type <> v_kind then
      raise exception 'stale_construction_quote';
    end if;
    v_instance := v_building.recovery_instance_id;
    perform public.island_construction_refund(p_account_id,v_instance,v_building.level);
    v_level := case when v_action = 'upgrade' then v_building.level + 1 else v_building.level end;
  end if;
  if v_action = 'demolish' then
    v_price := public.island_construction_refund(p_account_id,v_instance,v_level);
  else
    v_manifest := p_catalogue #> array['kinds',v_kind];
    if jsonb_typeof(v_manifest -> 'prices') is distinct from 'array'
       or jsonb_typeof(v_manifest -> 'waves') is distinct from 'array' then
      raise exception 'invalid_construction';
    end if;
    if jsonb_array_length(v_manifest -> 'prices') not between 1 and 5
       or jsonb_array_length(v_manifest -> 'prices') <> jsonb_array_length(v_manifest -> 'waves') then
      raise exception 'invalid_construction';
    end if;
    if v_level > jsonb_array_length(v_manifest -> 'prices') then
      raise exception 'max_level';
    end if;
    if jsonb_typeof(v_manifest -> 'waves' -> (v_level-1)) is distinct from 'number'
       or (v_manifest -> 'waves' ->> (v_level-1)) !~ '^(0|[1-9][0-9]*)$'
       or jsonb_typeof(v_manifest -> 'prices' -> (v_level-1)) is distinct from 'string'
       or (v_manifest -> 'prices' ->> (v_level-1)) !~ '^[1-9][0-9]*$' then
      raise exception 'invalid_construction';
    end if;
    if v_best < (v_manifest -> 'waves' ->> (v_level-1))::integer then
      raise exception 'locked';
    end if;
    v_base := (v_manifest -> 'prices' ->> (v_level-1))::numeric;
    if not public.island_treasury_whole(v_base,false)
       or p_catalogue ->> 'engineerDiscountPercent' is distinct from '10' then
      raise exception 'invalid_construction';
    end if;
    v_price := case when v_profile ->> 'role' = 'engineer'
      then greatest(1,floor((v_base*90+50)/100)) else v_base end;
    if v_price < v_base and v_profile ->> 'assignmentWaveId' is not null then
      raise exception 'captain_assigned';
    end if;
  end if;
  if v_price <> v_quoted then
    raise exception 'stale_construction_quote';
  end if;
  if v_action = 'upgrade' and v_recovery_version = 1
     and v_kind in ('wall','cannon','mortar','harpoon','culverin','swivel') then
    select * into v_health from public.island_structure_health
     where island_owner = v_account.island_owner and spot = v_spot
       and instance_id = v_instance for update;
    if not found or public.structure_recovery_project_hp(v_health.hp_units,
      greatest(0,floor(extract(epoch from (v_now-v_health.settled_at))*1000))::bigint,
      v_health.rate_numerator,v_health.rate_denominator) <> 1000000 then
      raise exception 'needs_repair';
    end if;
  end if;
  if v_price > 0 then
    if v_action = 'demolish' then
      v_finance := public.island_treasury_credit(p_actor_id,p_account_id,p_run_epoch,
        public.island_economy_effect_uid(v_operation_id,'refund'),'building_refund','construction:demolish:'||v_instance::text,v_price);
    else
      v_finance := public.island_treasury_spend(p_actor_id,p_account_id,p_run_epoch,
        public.island_economy_effect_uid(v_operation_id,'charge'),'building_purchase','construction:'||v_action||':'||v_instance::text||':'||v_level::text,v_price);
    end if;
    if v_finance ->> 'status' is distinct from 'done' then
      raise exception '%',v_finance ->> 'reason';
    end if;
    if (v_finance ->> 'repeat')::boolean then raise exception 'construction_financial_conflict'; end if;
    v_finance_id := (v_finance #>> '{receipt,id}')::uuid;
  end if;
  v_recovery := public.structure_recovery_mutation_begin(v_account.island_owner);
  if v_action = 'build' then
    insert into public.islets(player_id,timber) values (v_account.island_owner,0)
      on conflict (player_id) do nothing;
    insert into public.islet_buildings
      (player_id,plot,building_type,level,coins_paid,timber_paid,ref,recovery_instance_id)
    values (v_account.island_owner,v_spot,v_kind,1,v_price,0,'economy:'||v_instance::text,v_instance);
  elsif v_action = 'upgrade' then
    update public.islet_buildings set level = v_level, coins_paid = coins_paid + v_price
     where player_id = v_account.island_owner and plot = v_spot;
  else
    delete from public.islet_buildings where player_id = v_account.island_owner and plot = v_spot;
  end if;
  if v_action <> 'demolish' then
    insert into public.island_construction_payments
      (account_id,run_epoch,island_owner,instance_id,level,coins,source_kind,treasury_receipt_id)
    values (p_account_id,p_run_epoch,v_account.island_owner,v_instance,v_level,v_price,'treasury',v_finance_id);
    if v_price < v_base then
      v_commitment := public.personal_captain_bind_engineer_locked(p_actor_id);
    end if;
  end if;
  perform public.structure_recovery_mutation_finish(v_account.island_owner,v_recovery);
  v_result := jsonb_build_object('spot',v_spot,'kind',v_kind,'level',v_level,'instanceId',v_instance,
    'chargedCoins',case when v_action <> 'demolish' then trunc(v_price)::text else '0' end,
    'refundedCoins',case when v_action = 'demolish' then trunc(v_price)::text else '0' end,
    'engineerCommitmentId',v_commitment,'treasuryReceiptId',v_finance_id);
  insert into public.island_construction_receipts
    (actor_id,action_uid,account_id,run_epoch,action,instance_id,request_fingerprint,result,treasury_receipt_id)
  values (p_actor_id,p_action_uid,p_account_id,p_run_epoch,v_action,v_instance,v_fingerprint,v_result,v_finance_id)
  returning id into v_receipt_id;
  return public.island_construction_result(v_receipt_id,false,true);
exception
  when invalid_text_representation or numeric_value_out_of_range or check_violation then
    return jsonb_build_object('status','refused','reason','invalid_construction');
  when unique_violation then
    return jsonb_build_object('status','refused','reason','action_conflict');
  when raise_exception then
    if sqlerrm in ('wave_running','construction_basis_missing','captain_not_initialized','captain_assigned',
      'captain_conversion_required','engineer_required','action_conflict','not_member','epoch_mismatch',
      'path_unavailable','protected','invalid_construction','locked','spot_taken','not_built',
      'stale_construction_quote','max_level','needs_repair','insufficient_funds','invalid_change',
      'account_missing') then
      return jsonb_build_object('status','refused','reason',sqlerrm);
    elsif sqlerrm = 'construction_financial_conflict' then
      return jsonb_build_object('status','refused','reason','action_conflict');
    end if;
    raise;
end;
$$;
comment on function public.island_economy_construct(uuid, uuid, uuid, text, jsonb, jsonb) is
  'Atomic shared build/upgrade/demolish. Claims global root identity before personal/island locks; distinct child finance effects, actual basis and Engineer generation commit with the asset or roll back together. No private wallet fallback.';

revoke all on function public.island_construction_immutable() from public, anon, authenticated, service_role;
revoke all on function public.island_construction_refund(uuid, uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.island_construction_result(uuid, boolean, boolean) from public, anon, authenticated, service_role;
revoke all on function public.island_economy_require_idle_locked(uuid) from public, anon, authenticated, service_role;
revoke all on function public.island_economy_construct(uuid, uuid, uuid, text, jsonb, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.island_economy_construct(uuid, uuid, uuid, text, jsonb, jsonb) to service_role;
