-- MP-ECO-06: island-targeted crew hires paid atomically by the shared treasury.
-- Only service RPCs use this path. No admission, save conversion or route is activated.

-- Keep every new hire's original resource effect and financial provenance after departure/reset.
create table if not exists public.island_crew_receipts (
  id uuid primary key references public.island_economy_operations(id) on delete restrict,
  actor_id uuid not null,
  action_uid text not null check (action_uid ~ '^[A-Za-z0-9_-]{8,64}$'),
  account_id uuid not null,
  run_epoch uuid not null,
  crew text not null check (crew in ('gunner','lookout','guard')),
  previous_count smallint not null check (previous_count between 0 and 9),
  count smallint not null check (count = previous_count + 1 and count between 1 and 10),
  charged_coins numeric not null check (public.island_treasury_whole(charged_coins, false)),
  treasury_receipt_id uuid not null unique,
  created_at timestamptz not null default clock_timestamp(),
  unique (actor_id, action_uid),
  foreign key (account_id, run_epoch)
    references public.island_economy_accounts(id, run_epoch) on delete restrict,
  foreign key (treasury_receipt_id, account_id, run_epoch)
    references public.island_treasury_transactions(id, account_id, run_epoch) on delete restrict
);
comment on table public.island_crew_receipts is
  'Immutable shared hire effects linked to their root operation and actual treasury debit. Existing crew, including Carpenter counts and old provenance, are neither recreated nor refunded.';
comment on column public.island_crew_receipts.id is 'Global root operation and domain receipt identity.';
comment on column public.island_crew_receipts.actor_id is 'Original initiating actor, retained without a profile cascade.';
comment on column public.island_crew_receipts.action_uid is 'Original player intent, globally bound across domains.';
comment on column public.island_crew_receipts.account_id is 'Original paying defended-island account.';
comment on column public.island_crew_receipts.run_epoch is 'Original account epoch; never substituted after reset.';
comment on column public.island_crew_receipts.crew is 'New shared purchases allow Gunner, Lookout or Guard only.';
comment on column public.island_crew_receipts.previous_count is 'The target count immediately before the hire.';
comment on column public.island_crew_receipts.count is 'The count acquired by this one hire, not a current snapshot.';
comment on column public.island_crew_receipts.charged_coins is 'Actual full catalogue price; no Captain discount.';
comment on column public.island_crew_receipts.treasury_receipt_id is 'The distinct financial child effect in the same transaction.';
comment on column public.island_crew_receipts.created_at is 'Canonical commit time of the crew effect.';
alter table public.island_crew_receipts enable row level security;
revoke all on table public.island_crew_receipts from public, anon, authenticated, service_role;
grant select on table public.island_crew_receipts to service_role;

-- History is not a mutable current count or an account-deletion cascade.
create or replace function public.island_crew_history_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'crew_history_immutable'; end;
$$;
comment on function public.island_crew_history_immutable() is 'Reject changes to a committed shared crew receipt.';
create or replace trigger island_crew_receipts_immutable
  before update or delete on public.island_crew_receipts
  for each row execute function public.island_crew_history_immutable();

-- Only a locked, authorized caller may expose this current island projection.
create or replace function public.island_crew_counts_locked(p_island_owner uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('gunner',crew_gunner,'carpenter',crew_carpenter,
    'lookout',crew_lookout,'guard',crew_guard)
  from public.islands where player_id = p_island_owner;
$$;
comment on function public.island_crew_counts_locked(uuid) is
  'Private defended-island counts; caller holds its island lock and authorizes current membership/origin.';

-- Original receipt and authorized current state are deliberately separate.
create or replace function public.island_crew_result(p_receipt_id uuid, p_repeat boolean, p_current boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_receipt public.island_crew_receipts;
  v_account public.island_economy_accounts;
  v_best integer;
begin
  select * into strict v_receipt from public.island_crew_receipts where id = p_receipt_id;
  select * into strict v_account from public.island_economy_accounts where id = v_receipt.account_id;
  if p_current then
    select wave_best into strict v_best from public.islands where player_id = v_account.island_owner;
  end if;
  return jsonb_build_object('status','done','repeat',p_repeat,
    'currentEconomy',case when p_current then public.island_treasury_envelope(v_account) end,
    'currentCrew',case when p_current then public.island_crew_counts_locked(v_account.island_owner) end,
    'currentWaveBest',v_best,
    'receipt',jsonb_build_object('receiptId',v_receipt.id,'actionUid',v_receipt.action_uid,
      'action','hire','actorId',v_receipt.actor_id,
      'origin',jsonb_build_object('mode','island_shared','version',1,
        'islandOwner',v_account.island_owner,'accountId',v_account.id,'runEpoch',v_account.run_epoch),
      'result',jsonb_build_object('crew',v_receipt.crew,'previousCount',v_receipt.previous_count,
        'count',v_receipt.count,'chargedCoins',trunc(v_receipt.charged_coins)::text,
        'treasuryReceiptId',v_receipt.treasury_receipt_id)));
end;
$$;
comment on function public.island_crew_result(uuid, boolean, boolean) is
  'Original immutable effect; departed actors or retired origins receive null current projections, never another run''s crew or treasury.';

-- Member-authorized read of one active original island. No online/presence dependency exists.
create or replace function public.island_economy_crew(p_actor_id uuid, p_account_id uuid, p_run_epoch uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_account public.island_economy_accounts;
  v_best integer;
begin
  if p_actor_id is null or p_account_id is null or p_run_epoch is null then
    return jsonb_build_object('status','refused','reason','invalid_crew');
  end if;
  select * into v_account from public.island_economy_accounts where id = p_account_id;
  if not found then return jsonb_build_object('status','refused','reason','account_missing'); end if;
  perform public.island_treasury_lock_scope(v_account.island_owner);
  select * into strict v_account from public.island_economy_accounts where id = p_account_id for update;
  if v_account.run_epoch <> p_run_epoch then
    return jsonb_build_object('status','refused','reason','epoch_mismatch');
  end if;
  select wave_best into v_best from public.islands where player_id = v_account.island_owner for update;
  perform 1 from public.island_members where island_owner = v_account.island_owner
    and player_id = p_actor_id for update;
  if p_actor_id <> v_account.island_owner and not exists (
    select 1 from public.island_members where island_owner = v_account.island_owner
      and player_id = p_actor_id and left_at is null) then
    return jsonb_build_object('status','refused','reason','not_member');
  end if;
  if v_account.state <> 'active' or not exists (select 1 from public.island_economy_state
    where island_owner = v_account.island_owner and current_account_id = p_account_id
      and run_epoch = p_run_epoch) then
    return jsonb_build_object('status','refused','reason','path_unavailable');
  end if;
  return jsonb_build_object('status','ok','currentEconomy',public.island_treasury_envelope(v_account),
    'crew',public.island_crew_counts_locked(v_account.island_owner),'waveBest',v_best);
end;
$$;
comment on function public.island_economy_crew(uuid, uuid, uuid) is
  'Service-only same-origin member crew read. Paused admission remains shared and readable; retired origins do not expose replacement state.';

-- Claim the intent before mutable crew checks, then commit the charge and count together.
create or replace function public.island_economy_hire(
  p_actor_id uuid, p_account_id uuid, p_run_epoch uuid, p_action_uid text,
  p_crew text, p_catalogue jsonb
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_account public.island_economy_accounts;
  v_existing public.island_crew_receipts;
  v_claim jsonb;
  v_operation uuid;
  v_member boolean;
  v_current boolean;
  v_best integer;
  v_before integer;
  v_max integer;
  v_unlock integer;
  v_price numeric;
  v_offer jsonb;
  v_finance jsonb;
begin
  if p_actor_id is null or p_account_id is null or p_run_epoch is null
     or p_crew is null or p_crew not in ('gunner','carpenter','lookout','guard') then
    return jsonb_build_object('status','refused','reason','invalid_crew');
  end if;
  select * into v_account from public.island_economy_accounts where id = p_account_id;
  if not found then return jsonb_build_object('status','refused','reason','account_missing'); end if;
  perform public.island_treasury_lock_scope(v_account.island_owner);
  select * into strict v_account from public.island_economy_accounts where id = p_account_id for update;
  v_claim := public.island_economy_claim_operation_locked(p_actor_id,p_account_id,p_run_epoch,
    p_action_uid,'crew:hire',jsonb_build_object('crew',p_crew));
  if v_claim ->> 'status' = 'refused' then return v_claim; end if;
  if v_claim ->> 'status' is null or v_claim ->> 'status' not in ('claimed','replay')
     or v_claim ->> 'operationId' is null then raise exception 'crew_operation_unreadable'; end if;
  v_operation := (v_claim ->> 'operationId')::uuid;
  select * into v_existing from public.island_crew_receipts where id = v_operation;
  if not found and v_claim ->> 'status' = 'replay' then raise exception 'action_conflict'; end if;
  select wave_best into v_best from public.islands where player_id = v_account.island_owner for update;
  perform 1 from public.island_members where island_owner = v_account.island_owner
    and player_id = p_actor_id for update;
  v_member := p_actor_id = v_account.island_owner or exists (
    select 1 from public.island_members where island_owner = v_account.island_owner
      and player_id = p_actor_id and left_at is null);
  v_current := v_member and v_account.state = 'active' and exists (
    select 1 from public.island_economy_state where island_owner = v_account.island_owner
      and current_account_id = p_account_id and run_epoch = p_run_epoch);
  if v_existing.id is not null then
    return public.island_crew_result(v_existing.id,true,v_current);
  end if;
  if not v_member then raise exception 'not_member'; end if;
  if not v_current or not exists (select 1 from public.island_economy_state
    where island_owner = v_account.island_owner and admission_state = 'active') then
    raise exception 'path_unavailable';
  end if;
  perform public.island_economy_require_idle_locked(v_account.island_owner);
  if p_crew = 'carpenter' then raise exception 'crew_unavailable'; end if;
  v_offer := p_catalogue -> p_crew;
  if jsonb_typeof(v_offer) is distinct from 'object'
     or jsonb_typeof(v_offer -> 'priceCoins') is distinct from 'string'
     or (v_offer ->> 'priceCoins') !~ '^[1-9][0-9]*$'
     or jsonb_typeof(v_offer -> 'maxCount') is distinct from 'number'
     or (v_offer ->> 'maxCount') !~ '^([1-9]|10)$'
     or jsonb_typeof(v_offer -> 'unlockWave') is distinct from 'number'
     or (v_offer ->> 'unlockWave') !~ '^(0|[1-9][0-9]*)$' then
    raise exception 'invalid_crew';
  end if;
  v_price := (v_offer ->> 'priceCoins')::numeric;
  v_max := (v_offer ->> 'maxCount')::integer;
  v_unlock := (v_offer ->> 'unlockWave')::integer;
  if not public.island_treasury_whole(v_price,false) or v_unlock > 1000 then raise exception 'invalid_crew'; end if;
  if v_best < v_unlock then raise exception 'locked'; end if;
  select case p_crew when 'gunner' then crew_gunner when 'lookout' then crew_lookout
    when 'guard' then crew_guard end into v_before
    from public.islands where player_id = v_account.island_owner;
  if v_before >= v_max then raise exception 'crew_full'; end if;
  v_finance := public.island_treasury_spend(p_actor_id,p_account_id,p_run_epoch,
    public.island_economy_effect_uid(v_operation,'charge'),'crew_hire',
    'crew:hire:'||v_operation::text,v_price);
  if v_finance ->> 'status' is distinct from 'done' then
    raise exception '%',coalesce(v_finance ->> 'reason','crew_financial_conflict');
  end if;
  if (v_finance ->> 'repeat')::boolean then raise exception 'crew_financial_conflict'; end if;
  update public.islands set
    crew_gunner = crew_gunner + case when p_crew = 'gunner' then 1 else 0 end,
    crew_lookout = crew_lookout + case when p_crew = 'lookout' then 1 else 0 end,
    crew_guard = crew_guard + case when p_crew = 'guard' then 1 else 0 end,
    updated_at = clock_timestamp() where player_id = v_account.island_owner;
  insert into public.island_crew_receipts
    (id,actor_id,action_uid,account_id,run_epoch,crew,previous_count,count,charged_coins,treasury_receipt_id)
  values (v_operation,p_actor_id,p_action_uid,p_account_id,p_run_epoch,p_crew,
    v_before,v_before+1,v_price,(v_finance #>> '{receipt,id}')::uuid);
  return public.island_crew_result(v_operation,false,true);
exception
  when invalid_text_representation or numeric_value_out_of_range or check_violation then
    return jsonb_build_object('status','refused','reason','invalid_crew');
  when unique_violation then
    return jsonb_build_object('status','refused','reason','action_conflict');
  when raise_exception then
    if sqlerrm in ('action_conflict','not_member','path_unavailable','wave_running','crew_unavailable',
      'invalid_crew','locked','crew_full','insufficient_funds','invalid_change','epoch_mismatch','account_missing') then
      return jsonb_build_object('status','refused','reason',sqlerrm);
    elsif sqlerrm = 'crew_financial_conflict' then
      return jsonb_build_object('status','refused','reason','action_conflict');
    end if;
    raise;
end;
$$;
comment on function public.island_economy_hire(uuid, uuid, uuid, text, text, jsonb) is
  'Atomic full-price shared Gunner/Lookout/Guard hire. Scope/account then root claim, island/member and canonical phase locks. The claim, child charge, count and receipt roll back together. No personal wallet or visitor crew stacking.';

revoke all on function public.island_crew_history_immutable() from public, anon, authenticated, service_role;
revoke all on function public.island_crew_counts_locked(uuid) from public, anon, authenticated, service_role;
revoke all on function public.island_crew_result(uuid, boolean, boolean) from public, anon, authenticated, service_role;
revoke all on function public.island_economy_crew(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.island_economy_hire(uuid, uuid, uuid, text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.island_economy_crew(uuid, uuid, uuid) to service_role;
grant execute on function public.island_economy_hire(uuid, uuid, uuid, text, text, jsonb) to service_role;
