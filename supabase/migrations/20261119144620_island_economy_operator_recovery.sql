-- MP-ECO-21: service-only pause/resume with durable control CAS and original replay.
-- No route/admission is enabled. Control revisions never change money or game permissions.

create schema if not exists island_economy_private;
revoke all on schema island_economy_private from public, anon, authenticated, service_role;

create table if not exists island_economy_private.operator_offer_receipts (
  operation_uid text primary key check (operation_uid ~ '^[A-Za-z0-9_-]{8,64}$'),
  island_owner uuid not null,
  account_id uuid not null,
  run_epoch uuid not null,
  control_revision numeric not null check (
    control_revision = trunc(control_revision) and control_revision > 0
    and control_revision::text not in ('NaN','Infinity','-Infinity')),
  request_fingerprint jsonb not null check (jsonb_typeof(request_fingerprint) = 'object'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  unique (account_id, run_epoch, control_revision)
);
comment on table island_economy_private.operator_offer_receipts is
  'Immutable operator control history, separate from player operations and financial revisions. UUID origins survive retirement/deletion; there is no new player-data retention policy.';
alter table island_economy_private.operator_offer_receipts enable row level security;
revoke all on island_economy_private.operator_offer_receipts
  from public, anon, authenticated, service_role;
create or replace trigger operator_offer_receipts_immutable
  before update or delete on island_economy_private.operator_offer_receipts
  for each row execute function public.island_treasury_immutable();

create or replace function public.island_economy_operator_context(p_island_owner uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_state public.island_economy_state;
  v_account public.island_economy_accounts;
  v_revision numeric;
begin
  select * into v_state from public.island_economy_state where island_owner=p_island_owner;
  if not found then return jsonb_build_object('status','refused','reason','not_admitted'); end if;
  select * into v_account from public.island_economy_accounts where id=v_state.current_account_id;
  if not found then return jsonb_build_object('status','refused','reason','account_missing'); end if;
  select coalesce(max(control_revision),0) into v_revision
    from island_economy_private.operator_offer_receipts
    where account_id=v_account.id and run_epoch=v_account.run_epoch;
  return jsonb_build_object('status','ok','economy',public.island_treasury_envelope(v_account),
    'accountState',v_account.state,'admissionState',v_state.admission_state,
    'controlRevision',trunc(v_revision)::text);
end;
$$;
comment on function public.island_economy_operator_context(uuid) is
  'Service-only maintenance projection. Control revision is independent of financial revision. Reads admit/grant nothing and are not a gameplay permission.';

create or replace function public.island_economy_set_offers(
  p_operation_uid text, p_island_owner uuid, p_account_id uuid, p_run_epoch uuid,
  p_expected_revision numeric, p_expected_state text, p_target_state text
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_fingerprint jsonb;
  v_old island_economy_private.operator_offer_receipts;
  v_state public.island_economy_state;
  v_account public.island_economy_accounts;
  v_revision numeric;
  v_result jsonb;
begin
  if p_operation_uid is null or p_operation_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_island_owner is null or p_account_id is null or p_run_epoch is null
     or not public.island_treasury_whole(p_expected_revision,true)
     or p_expected_state is null or p_expected_state not in ('active','paused')
     or p_target_state is null or p_target_state not in ('active','paused')
     or p_expected_state=p_target_state then
    return jsonb_build_object('status','refused','reason','invalid_control');
  end if;
  v_fingerprint:=jsonb_build_object('islandOwner',p_island_owner,'accountId',p_account_id,
    'runEpoch',p_run_epoch,'expectedRevision',trunc(p_expected_revision)::text,
    'expectedState',p_expected_state,'targetState',p_target_state);
  -- Two-key advisory space is disjoint from the game's one-key scope locks.
  -- Operator UID is outermost; runtime transactions never acquire this operator lock.
  perform pg_catalog.pg_advisory_xact_lock(19513,pg_catalog.hashtext(p_operation_uid));
  select * into v_old from island_economy_private.operator_offer_receipts
    where operation_uid=p_operation_uid;
  if found then
    if v_old.request_fingerprint<>v_fingerprint then
      return jsonb_build_object('status','refused','reason','action_conflict');
    end if;
    return jsonb_build_object('status','done','repeat',true,'receipt',v_old.result,
      'current',public.island_economy_operator_context(p_island_owner));
  end if;
  -- One target: scope before account UUID before persisted state, matching runtime order.
  perform public.island_treasury_lock_scope(p_island_owner);
  select * into v_account from public.island_economy_accounts
    where id=p_account_id for update;
  if not found then return jsonb_build_object('status','refused','reason','account_missing'); end if;
  select * into v_state from public.island_economy_state
    where island_owner=p_island_owner for update;
  if not found then return jsonb_build_object('status','refused','reason','not_admitted'); end if;
  if v_account.island_owner<>p_island_owner or v_account.run_epoch<>p_run_epoch
     or v_state.current_account_id<>p_account_id or v_state.run_epoch<>p_run_epoch
     or v_state.mode<>'island_shared' or v_state.economy_version<>1 then
    return jsonb_build_object('status','refused','reason','origin_mismatch');
  end if;
  if v_account.state<>'active' then
    return jsonb_build_object('status','refused','reason','account_retired');
  end if;
  select coalesce(max(control_revision),0) into v_revision
    from island_economy_private.operator_offer_receipts
    where account_id=p_account_id and run_epoch=p_run_epoch;
  if v_revision<>p_expected_revision then
    return jsonb_build_object('status','refused','reason','control_revision_mismatch');
  end if;
  if v_state.admission_state<>p_expected_state then
    return jsonb_build_object('status','refused','reason','admission_state_mismatch');
  end if;
  update public.island_economy_state set admission_state=p_target_state
    where island_owner=p_island_owner;
  v_result:=jsonb_build_object('operationUid',p_operation_uid,'islandOwner',p_island_owner,
    'accountId',p_account_id,'runEpoch',p_run_epoch,'previousState',p_expected_state,
    'admissionStateAtCommit',p_target_state,'controlRevisionAtCommit',trunc(v_revision+1)::text);
  insert into island_economy_private.operator_offer_receipts
    (operation_uid,island_owner,account_id,run_epoch,control_revision,request_fingerprint,result)
    values(p_operation_uid,p_island_owner,p_account_id,p_run_epoch,v_revision+1,
      v_fingerprint,v_result);
  return jsonb_build_object('status','done','repeat',false,'receipt',v_result,
    'current',public.island_economy_operator_context(p_island_owner));
end;
$$;
comment on function public.island_economy_set_offers(text,uuid,uuid,uuid,numeric,text,text) is
  'Operator-only pause/resume CAS for one exact active account/epoch. Pausing preserves mode, money, original settlements and personal history. Original UID replay precedes mutable preflight and cannot reapply an old pause after resume. No browser route or ownership transfer.';

revoke all on function public.island_economy_operator_context(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.island_economy_set_offers(text,uuid,uuid,uuid,numeric,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.island_economy_operator_context(uuid) to service_role;
grant execute on function public.island_economy_set_offers(text,uuid,uuid,uuid,numeric,text,text)
  to service_role;
