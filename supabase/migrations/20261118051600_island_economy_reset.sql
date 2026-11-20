-- MP-ECO-16: private treasury replacement and immutable reset receipts only.
-- A future complete owner reset must clear assets/session/copies in the SAME
-- transaction. No route, service execution, admission or account deletion is enabled.

-- Collect all relation barriers before FK/trigger DDL; never wait with a partial
-- set that could block a runtime account -> operation -> ledger writer.
do $$
declare v_deadline timestamptz := clock_timestamp()+interval '30 seconds';
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode='25000', message='island_economy_reset_requires_read_committed';
  end if;
  loop
    begin
      lock table public.island_economy_accounts in exclusive mode nowait;
      lock table public.island_economy_operations in access exclusive mode nowait;
      lock table public.island_treasury_transactions in share row exclusive mode nowait;
      if to_regclass('public.island_economy_reset_receipts') is not null then
        lock table public.island_economy_reset_receipts in access exclusive mode nowait;
      end if;
      exit;
    exception when lock_not_available then
      if clock_timestamp() >= v_deadline then
        raise exception using errcode='55P03', message='island_economy_reset_migration_busy';
      end if;
    end;
    perform pg_sleep(0.05);
  end loop;
end;
$$;

-- Original cash is a retirement snapshot, never a transfer to the new account.
create table if not exists public.island_economy_reset_receipts (
  id uuid primary key references public.island_economy_operations(id) on delete restrict,
  actor_id uuid not null,
  action_uid text not null check (action_uid ~ '^[A-Za-z0-9_-]{8,64}$'),
  island_owner uuid not null check (actor_id=island_owner),
  old_account_id uuid not null unique,
  old_run_epoch uuid not null,
  new_account_id uuid not null unique check (new_account_id<>old_account_id),
  new_run_epoch uuid not null check (new_run_epoch<>old_run_epoch),
  retired_balance numeric not null,
  retired_committed numeric not null,
  retired_revision numeric not null,
  starting_coins numeric not null,
  grant_receipt_id uuid not null unique,
  grant_policy_version text not null check (char_length(grant_policy_version) between 1 and 80
    and btrim(grant_policy_version)<>''),
  request_fingerprint jsonb not null check (jsonb_typeof(request_fingerprint)='object'),
  effects jsonb not null check (jsonb_typeof(effects)='object'),
  created_at timestamptz not null default clock_timestamp(),
  unique (actor_id,action_uid),
  foreign key(old_account_id,island_owner,old_run_epoch)
    references public.island_economy_accounts(id,island_owner,run_epoch) on delete restrict,
  foreign key(new_account_id,island_owner,new_run_epoch)
    references public.island_economy_accounts(id,island_owner,run_epoch) on delete restrict,
  foreign key(grant_receipt_id,new_account_id,new_run_epoch)
    references public.island_treasury_transactions(id,account_id,run_epoch) on delete restrict,
  check (retired_balance::text not in ('NaN','Infinity','-Infinity')
    and retired_committed::text not in ('NaN','Infinity','-Infinity')
    and retired_revision::text not in ('NaN','Infinity','-Infinity')
    and starting_coins::text not in ('NaN','Infinity','-Infinity')
    and retired_balance=trunc(retired_balance) and retired_committed=trunc(retired_committed)
    and retired_revision=trunc(retired_revision) and starting_coins=trunc(starting_coins)
    and retired_balance>=retired_committed and retired_committed>=0
    and retired_revision>=0 and starting_coins>=0)
);
comment on table public.island_economy_reset_receipts is
  'Immutable treasury half of a complete owner reset. Old cash/holds remain retired; new account gets one server grant. This receipt never proves that missing asset/session/copy hooks ran.';
comment on column public.island_economy_reset_receipts.id is 'Matching early-claimed owner lifecycle:reset root operation.';
comment on column public.island_economy_reset_receipts.actor_id is 'Original owner actor, without a live-profile cascade.';
comment on column public.island_economy_reset_receipts.action_uid is 'Original global player intent identifier.';
comment on column public.island_economy_reset_receipts.island_owner is 'Historical island origin; no successor/transfer is implied.';
comment on column public.island_economy_reset_receipts.old_account_id is 'Retired original account; one replacement per run.';
comment on column public.island_economy_reset_receipts.old_run_epoch is 'Original immutable economy epoch.';
comment on column public.island_economy_reset_receipts.new_account_id is 'New server-generated replacement account.';
comment on column public.island_economy_reset_receipts.new_run_epoch is 'New server-generated economy epoch.';
comment on column public.island_economy_reset_receipts.retired_balance is 'Historical old cash including held principal at reset.';
comment on column public.island_economy_reset_receipts.retired_committed is 'Historical old held principal; never a reset blocker.';
comment on column public.island_economy_reset_receipts.retired_revision is 'Financial revision at retirement; later source settlement may advance it.';
comment on column public.island_economy_reset_receipts.starting_coins is 'Configured server grant, excluding all old funds.';
comment on column public.island_economy_reset_receipts.grant_receipt_id is 'Exactly one new-run system financial receipt.';
comment on column public.island_economy_reset_receipts.grant_policy_version is 'Server-pinned grant configuration identifier.';
comment on column public.island_economy_reset_receipts.request_fingerprint is 'Original immutable root request, independent of later catalogue changes.';
comment on column public.island_economy_reset_receipts.effects is 'Server-derived nonnegative effect counts from the encompassing transaction, never client authorization.';
comment on column public.island_economy_reset_receipts.created_at is 'Canonical reset receipt time.';
alter table public.island_economy_reset_receipts enable row level security;
revoke all on table public.island_economy_reset_receipts from public,anon,authenticated,service_role;
grant select on table public.island_economy_reset_receipts to service_role;

-- Shared receipt history cannot be changed or cascade away with a participant.
create or replace function public.island_economy_reset_immutable()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'reset_history_immutable'; end;
$$;
comment on function public.island_economy_reset_immutable() is 'Reject updates/deletes of a committed reset receipt.';
create or replace trigger island_economy_reset_receipts_immutable
  before update or delete on public.island_economy_reset_receipts
  for each row execute function public.island_economy_reset_immutable();

-- Historical effect stays fixed; a later replacement never becomes current again.
create or replace function public.island_economy_reset_result(p_receipt_id uuid,p_repeat boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_receipt public.island_economy_reset_receipts; v_current public.island_economy_accounts;
begin
  select * into strict v_receipt from public.island_economy_reset_receipts where id=p_receipt_id;
  select a.* into v_current from public.island_economy_accounts a
    join public.island_economy_state s on s.current_account_id=a.id
      and s.island_owner=a.island_owner and s.run_epoch=a.run_epoch
    where a.id=v_receipt.new_account_id and a.state='active';
  return jsonb_build_object('status','done','repeat',p_repeat,
    'currentEconomy',case when v_current.id is not null then public.island_treasury_envelope(v_current) end,
    'receipt',jsonb_build_object('receiptId',v_receipt.id,'actorId',v_receipt.actor_id,
      'actionUid',v_receipt.action_uid,'action','reset',
      'origin',jsonb_build_object('mode','island_shared','version',1,'islandOwner',v_receipt.island_owner,
        'accountId',v_receipt.old_account_id,'runEpoch',v_receipt.old_run_epoch),
      'result',jsonb_build_object('newAccountId',v_receipt.new_account_id,'newRunEpoch',v_receipt.new_run_epoch,
        'retiredTreasury',jsonb_build_object('balanceCoins',trunc(v_receipt.retired_balance)::text,
          'committedCoins',trunc(v_receipt.retired_committed)::text,
          'availableCoins',trunc(v_receipt.retired_balance-v_receipt.retired_committed)::text,
          'revision',trunc(v_receipt.retired_revision)::text),
        'startingCoins',trunc(v_receipt.starting_coins)::text,'grantReceiptId',v_receipt.grant_receipt_id,
        'grantPolicyVersion',v_receipt.grant_policy_version,'effects',v_receipt.effects)));
end;
$$;
comment on function public.island_economy_reset_result(uuid,boolean) is
  'Private original owner receipt plus current projection only for its still-current replacement; caller authenticates receipt access and holds scope/account locks.';

-- Caller already claimed the root before personal/island locks and must perform
-- ALL approved asset/session/copy reset work in this same outer transaction.
-- Every refusal raises: the caller must roll back its claim and prior effects.
create or replace function public.island_economy_reset_treasury_locked(
  p_operation_id uuid,p_starting_coins numeric,p_grant_policy_version text,p_effects jsonb
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  v_operation public.island_economy_operations; v_old public.island_economy_accounts;
  v_new public.island_economy_accounts; v_state public.island_economy_state;
  v_grant jsonb; v_grant_id uuid; v_now timestamptz; v_uid text; v_fingerprint jsonb;
begin
  select * into v_operation from public.island_economy_operations where id=p_operation_id;
  if not found or not v_operation.is_player_intent or v_operation.domain_action<>'lifecycle:reset'
    or v_operation.account_id is null then raise exception 'action_conflict'; end if;
  select * into strict v_old from public.island_economy_accounts where id=v_operation.account_id;
  if v_operation.actor_id<>v_old.island_owner then raise exception 'not_owner'; end if;
  perform public.island_treasury_lock_scope(v_old.island_owner);
  select * into strict v_old from public.island_economy_accounts where id=v_old.id for update;
  if exists(select 1 from public.island_economy_reset_receipts where id=p_operation_id) then
    return public.island_economy_reset_result(p_operation_id,true);
  end if;
  if not public.island_treasury_whole(p_starting_coins,true) or p_grant_policy_version is null
    or char_length(p_grant_policy_version) not between 1 and 80 or btrim(p_grant_policy_version)=''
    or jsonb_typeof(p_effects) is distinct from 'object' then raise exception 'invalid_change'; end if;
  if exists(select 1 from jsonb_each(p_effects) where jsonb_typeof(value)<>'number'
    or value::text !~ '^(0|[1-9][0-9]*)$') then raise exception 'invalid_change'; end if;
  perform 1 from public.islands where player_id=v_old.island_owner for update;
  if not found then raise exception 'economy_context_required'; end if;
  select * into v_state from public.island_economy_state where island_owner=v_old.island_owner for update;
  if v_old.state<>'active' or v_state.current_account_id is distinct from v_old.id
    or v_state.run_epoch is distinct from v_operation.run_epoch or v_state.admission_state<>'active'
    then raise exception 'path_unavailable'; end if;
  perform public.island_economy_require_idle_locked(v_old.island_owner);
  if exists(select 1 from public.island_wave_accounting a left join public.island_wave_closures c
    on c.wave_id=a.wave_id where a.account_id=v_old.id and c.wave_id is null)
    then raise exception 'wave_running'; end if;
  v_now:=clock_timestamp();
  insert into public.island_economy_accounts(island_owner) values(v_old.island_owner) returning * into v_new;
  update public.island_economy_accounts set state='retired',retired_at=v_now where id=v_old.id;
  v_uid:=public.island_economy_system_uid(v_new.run_epoch,'run_start');
  v_fingerprint:=jsonb_build_object('kind','run_start','operationId',p_operation_id,
    'account',v_new.id,'epoch',v_new.run_epoch,'policy',p_grant_policy_version,'starting',trunc(p_starting_coins)::text);
  v_grant:=public.island_treasury_record_locked(v_new.id,v_operation.actor_id,v_uid,'credit','starting_coins',
    'run:'||v_new.run_epoch::text,v_fingerprint,p_starting_coins,0);
  if v_grant->>'status' is distinct from 'done' or (v_grant->>'repeat')::boolean is distinct from false
    or v_grant#>>'{receipt,id}' is null then raise exception 'reset_grant_conflict'; end if;
  v_grant_id:=(v_grant#>>'{receipt,id}')::uuid;
  if not exists(select 1 from public.island_treasury_transactions where id=v_grant_id
    and account_id=v_new.id and run_epoch=v_new.run_epoch and actor_id=v_operation.actor_id
    and action_uid=v_uid and kind='credit' and reason='starting_coins'
    and balance_delta=p_starting_coins and committed_delta=0) then raise exception 'reset_grant_conflict'; end if;
  update public.island_economy_state set current_account_id=v_new.id,run_epoch=v_new.run_epoch
    where island_owner=v_old.island_owner;
  insert into public.island_economy_reset_receipts(id,actor_id,action_uid,island_owner,
    old_account_id,old_run_epoch,new_account_id,new_run_epoch,retired_balance,retired_committed,
    retired_revision,starting_coins,grant_receipt_id,grant_policy_version,request_fingerprint,effects,created_at)
    values(p_operation_id,v_operation.actor_id,v_operation.action_uid,v_old.island_owner,v_old.id,v_old.run_epoch,
      v_new.id,v_new.run_epoch,v_old.balance_coins,v_old.committed_coins,v_old.revision,trunc(p_starting_coins),
      v_grant_id,p_grant_policy_version,v_operation.fingerprint,p_effects,v_now);
  return public.island_economy_reset_result(p_operation_id,false);
end;
$$;
comment on function public.island_economy_reset_treasury_locked(uuid,numeric,text,jsonb) is
  'Private treasury half only: matching early owner root, preheld ordered locks and SAME outer asset/session/copy reset transaction are mandatory. Retains old cash/holds, creates one new run grant, raises every refusal. No public reset or delete authority.';
revoke all on function public.island_economy_reset_immutable() from public,anon,authenticated,service_role;
revoke all on function public.island_economy_reset_result(uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function public.island_economy_reset_treasury_locked(uuid,numeric,text,jsonb) from public,anon,authenticated,service_role;
