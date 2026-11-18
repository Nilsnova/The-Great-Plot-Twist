-- MP-ECO-02: one immutable player intent across free, paid and personal domains.
-- Domain transactions claim after scope/accounts and before personal/domain locks.
-- This migration activates no route, changes no balance and admits no island.

create table if not exists public.island_economy_operations (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  action_uid text not null check (action_uid ~ '^[A-Za-z0-9_-]{8,64}$'),
  account_id uuid,
  run_epoch uuid,
  is_player_intent boolean not null,
  domain_action text not null check (domain_action ~ '^[a-z][a-z0-9_:.-]{0,79}$'),
  fingerprint jsonb not null check (jsonb_typeof(fingerprint) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  unique (actor_id, action_uid),
  foreign key (account_id, run_epoch)
    references public.island_economy_accounts(id, run_epoch) on delete restrict,
  constraint island_economy_operations_scope check (
    (account_id is null) = (run_epoch is null)
    and (is_player_intent or account_id is not null)
  ),
  constraint island_economy_operations_player_namespace check (
    not is_player_intent or (left(action_uid, 3) <> 'fx_' and left(action_uid, 4) <> 'sys_')
  )
);

comment on table public.island_economy_operations is
  'Immutable global actor/action intent binding across free and paid domains. Personal intents have null account/epoch. Opaque original financial identities are tombstones, never adopted as player proof. Domain claim, effects and complete domain receipt must commit or roll back together.';
comment on column public.island_economy_operations.id is 'Server operation UUID; financial children derive disjoint effect identifiers from it.';
comment on column public.island_economy_operations.actor_id is 'Authenticated original actor; no live membership or cascade foreign key is implied.';
comment on column public.island_economy_operations.action_uid is 'One global client intent per actor, or an opaque internal financial identifier.';
comment on column public.island_economy_operations.account_id is 'Original shared account, null only for a player-owned personal action.';
comment on column public.island_economy_operations.run_epoch is 'Original shared run; null together with account for personal actions.';
comment on column public.island_economy_operations.is_player_intent is 'True for checked root intent; false for internal/raw financial history which cannot prove a player request.';
comment on column public.island_economy_operations.domain_action is 'Server-selected domain/action; a UID cannot change domains.';
comment on column public.island_economy_operations.fingerprint is 'Canonical validated request inputs, compared as JSONB without rereading current prices or state.';
comment on column public.island_economy_operations.created_at is 'Canonical claim time; the row is immutable after insertion.';

alter table public.island_economy_operations enable row level security;
revoke all on table public.island_economy_operations from public, anon, authenticated, service_role;
grant select on table public.island_economy_operations to service_role;

create or replace function public.island_economy_operation_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'island_economy_operation_immutable';
end;
$$;
comment on function public.island_economy_operation_immutable() is 'Reject updates/deletes of global operation identities, including historical tombstones.';
revoke all on function public.island_economy_operation_immutable() from public, anon, authenticated, service_role;
create or replace trigger island_economy_operations_immutable
  before update or delete on public.island_economy_operations
  for each row execute function public.island_economy_operation_immutable();

create or replace function public.island_economy_effect_uid(p_operation_id uuid, p_effect_key text)
returns text language plpgsql immutable set search_path = '' as $$
begin
  if p_operation_id is null or p_effect_key is null
     or p_effect_key !~ '^[a-z][a-z0-9_]{0,15}$' then
    raise exception 'invalid_operation_effect';
  end if;
  return 'fx_' || replace(p_operation_id::text, '-', '') || '_' || p_effect_key;
end;
$$;
comment on function public.island_economy_effect_uid(uuid, text) is 'Derive a financial child UID. Construction is not proof; ledger insertion verifies the matching immutable player operation.';

create or replace function public.island_economy_system_uid(p_origin_id uuid, p_effect_key text)
returns text language plpgsql immutable set search_path = '' as $$
begin
  if p_origin_id is null or p_effect_key is null
     or p_effect_key !~ '^[a-z][a-z0-9_]{0,15}$' then
    raise exception 'invalid_operation_effect';
  end if;
  return 'sys_' || replace(p_origin_id::text, '-', '') || '_' || p_effect_key;
end;
$$;
comment on function public.island_economy_system_uid(uuid, text) is 'Derive a server-origin effect UID, disjoint from client roots. The domain still verifies canonical origin and original account authorization.';

create or replace function public.island_economy_effect_operation(p_action_uid text)
returns uuid language sql immutable set search_path = '' as $$
  select case when p_action_uid ~ '^fx_[0-9a-f]{32}_[a-z][a-z0-9_]{0,15}$'
    then substring(p_action_uid from 4 for 32)::uuid else null end;
$$;
comment on function public.island_economy_effect_operation(text) is 'Read only a strictly formed child operation UUID; malformed historic prefixes never become proof.';

create or replace function public.island_economy_claim_operation_locked(
  p_actor_id uuid, p_account_id uuid, p_run_epoch uuid, p_action_uid text,
  p_domain_action text, p_fingerprint jsonb
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_operation public.island_economy_operations;
  v_account public.island_economy_accounts;
  v_inserted uuid;
begin
  if p_actor_id is null or p_action_uid is null
     or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or left(p_action_uid, 3) = 'fx_' or left(p_action_uid, 4) = 'sys_'
     or (p_account_id is null) <> (p_run_epoch is null)
     or p_domain_action is null or p_domain_action !~ '^[a-z][a-z0-9_:.-]{0,79}$'
     or p_fingerprint is null or jsonb_typeof(p_fingerprint) <> 'object' then
    return jsonb_build_object('status', 'refused', 'reason', 'invalid_change');
  end if;
  select * into v_operation from public.island_economy_operations
   where actor_id = p_actor_id and action_uid = p_action_uid;
  if not found then
    if p_account_id is not null then
      select * into v_account from public.island_economy_accounts where id = p_account_id;
      if not found or v_account.state <> 'active' then
        return jsonb_build_object('status', 'refused', 'reason', 'path_unavailable');
      end if;
      if v_account.run_epoch <> p_run_epoch then
        return jsonb_build_object('status', 'refused', 'reason', 'epoch_mismatch');
      end if;
      if not exists (select 1 from public.island_economy_state
        where current_account_id = p_account_id and run_epoch = p_run_epoch
          and admission_state = 'active') then
        return jsonb_build_object('status', 'refused', 'reason', 'path_unavailable');
      end if;
    end if;
    insert into public.island_economy_operations
      (actor_id, action_uid, account_id, run_epoch, is_player_intent, domain_action, fingerprint)
    values (p_actor_id, p_action_uid, p_account_id, p_run_epoch, true,
      p_domain_action, p_fingerprint)
    on conflict (actor_id, action_uid) do nothing returning id into v_inserted;
    if v_inserted is not null then
      return jsonb_build_object('status', 'claimed', 'operationId', v_inserted, 'repeat', false);
    end if;
    select * into strict v_operation from public.island_economy_operations
     where actor_id = p_actor_id and action_uid = p_action_uid;
  end if;
  if not v_operation.is_player_intent
     or v_operation.account_id is distinct from p_account_id
     or v_operation.run_epoch is distinct from p_run_epoch
     or v_operation.domain_action <> p_domain_action or v_operation.fingerprint <> p_fingerprint then
    return jsonb_build_object('status', 'refused', 'reason', 'action_conflict');
  end if;
  return jsonb_build_object('status', 'replay', 'operationId', v_operation.id, 'repeat', true);
end;
$$;
comment on function public.island_economy_claim_operation_locked(uuid, uuid, uuid, text, text, jsonb) is
  'Private root claim after scope/account locks, before personal/domain locks and any effects. Replay precedes mutable-state validation; downstream refusal must roll back the entire domain transaction. Null account/epoch is personal scope. No current membership or financial authority is granted here.';

-- Old direct financial identities are opaque even when their text resembles an effect UID.
-- On reapplication, skip only children already proven by a matching player operation.
-- Quiesce existing accounts in runtime order before the ledger cutover. Locking only
-- the ledger first could deadlock a writer holding an account needed by a backfill FK.
do $$
declare
  v_scope bigint;
begin
  for v_scope in select distinct hashtextextended('island-economy:' || island_owner::text, 0)
    from public.island_economy_accounts order by 1
  loop
    perform pg_advisory_xact_lock(v_scope);
  end loop;
  perform 1 from public.island_economy_accounts order by id for update;
end;
$$;
lock table public.island_treasury_transactions in share row exclusive mode;

insert into public.island_economy_operations
  (id, actor_id, action_uid, account_id, run_epoch, is_player_intent, domain_action, fingerprint)
select t.id, t.actor_id, t.action_uid, t.account_id, t.run_epoch, false,
  'financial:' || t.kind, jsonb_build_object('receiptId', t.id, 'request', t.request_fingerprint)
from public.island_treasury_transactions t
where not exists (select 1 from public.island_economy_operations p
  where p.id = public.island_economy_effect_operation(t.action_uid) and p.is_player_intent
    and p.actor_id = t.actor_id and p.account_id = t.account_id and p.run_epoch = t.run_epoch)
on conflict (actor_id, action_uid) do nothing;

do $$
begin
  if exists (select 1 from public.island_treasury_transactions t
    where not exists (select 1 from public.island_economy_operations p
      where p.id = public.island_economy_effect_operation(t.action_uid) and p.is_player_intent
        and p.actor_id = t.actor_id and p.account_id = t.account_id and p.run_epoch = t.run_epoch)
    and not exists (select 1 from public.island_economy_operations p
      where p.id = t.id and not p.is_player_intent and p.actor_id = t.actor_id
        and p.action_uid = t.action_uid and p.account_id = t.account_id and p.run_epoch = t.run_epoch
        and p.domain_action = 'financial:' || t.kind
        and p.fingerprint = jsonb_build_object('receiptId', t.id, 'request', t.request_fingerprint))) then
    raise exception 'island_economy_operation_backfill_conflict';
  end if;
end;
$$;

create or replace function public.island_economy_financial_operation_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if left(new.action_uid, 3) = 'fx_' then
    if not exists (select 1 from public.island_economy_operations p
      where p.id = public.island_economy_effect_operation(new.action_uid) and p.is_player_intent
        and p.actor_id = new.actor_id and p.account_id = new.account_id
        and p.run_epoch = new.run_epoch) then
      raise unique_violation using message = 'island_economy_operation_conflict';
    end if;
  else
    insert into public.island_economy_operations
      (id, actor_id, action_uid, account_id, run_epoch, is_player_intent, domain_action, fingerprint)
    values (new.id, new.actor_id, new.action_uid, new.account_id, new.run_epoch, false,
      'financial:' || new.kind,
      jsonb_build_object('receiptId', new.id, 'request', new.request_fingerprint));
  end if;
  return new;
end;
$$;
comment on function public.island_economy_financial_operation_guard() is
  'Keep raw financial and free player identities in one unique namespace. Proven children retain their root; other internal effects create opaque tombstones atomically. No late advisory lock, membership or current-account check changes origin settlement.';
create or replace trigger island_treasury_operation_identity
  before insert on public.island_treasury_transactions
  for each row execute function public.island_economy_financial_operation_guard();

revoke all on function public.island_economy_effect_uid(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.island_economy_system_uid(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.island_economy_effect_operation(text) from public, anon, authenticated, service_role;
revoke all on function public.island_economy_claim_operation_locked(uuid, uuid, uuid, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.island_economy_financial_operation_guard() from public, anon, authenticated, service_role;
