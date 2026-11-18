-- MP-ECO-02: exact island/run accounts and immutable cash/reservation history.
-- Used only by new shared-economy RPCs. This migration admits no existing island.

create table if not exists public.island_economy_accounts (
  id uuid primary key default gen_random_uuid(),
  island_owner uuid not null references public.islands(player_id) on delete restrict,
  run_epoch uuid not null default gen_random_uuid(),
  economy_version smallint not null default 1 check (economy_version = 1),
  state text not null default 'active' check (state in ('active', 'retired')),
  balance_coins numeric not null default 0,
  committed_coins numeric not null default 0,
  revision numeric not null default 0,
  created_at timestamptz not null default clock_timestamp(),
  retired_at timestamptz,
  unique (island_owner, run_epoch),
  unique (id, run_epoch),
  unique (id, island_owner, run_epoch),
  constraint island_economy_accounts_money check (
    balance_coins::text not in ('NaN', 'Infinity', '-Infinity')
    and committed_coins::text not in ('NaN', 'Infinity', '-Infinity')
    and balance_coins = trunc(balance_coins) and committed_coins = trunc(committed_coins)
    and balance_coins >= committed_coins and committed_coins >= 0
  ),
  constraint island_economy_accounts_revision check (
    revision::text not in ('NaN', 'Infinity', '-Infinity')
    and revision = trunc(revision) and revision >= 0
  ),
  constraint island_economy_accounts_retirement check (
    (state = 'active' and retired_at is null) or (state = 'retired' and retired_at is not null)
  )
);

comment on table public.island_economy_accounts is
  'MP-ECO: immutable account identity per island/run. Balance includes held principal; available is balance minus committed. No fixed gameplay ceiling. Owner deletion/reset policy must explicitly retire/handle retained accounts before deleting an admitted island.';
comment on column public.island_economy_accounts.id is 'Immutable server-generated account UUID.';
comment on column public.island_economy_accounts.island_owner is 'Original island owner; never a client-selected payer.';
comment on column public.island_economy_accounts.run_epoch is 'Immutable run UUID, distinct from a client revision.';
comment on column public.island_economy_accounts.economy_version is 'Persisted accounting version, currently one.';
comment on column public.island_economy_accounts.state is 'Active accepts new spending; retired retains original settlements only.';
comment on column public.island_economy_accounts.balance_coins is 'Exact integral cash including held wager principal.';
comment on column public.island_economy_accounts.committed_coins is 'Exact principal held by unresolved reserve ledger entries.';
comment on column public.island_economy_accounts.revision is 'Exact monotonically increasing financial revision.';
comment on column public.island_economy_accounts.created_at is 'Canonical account creation time.';
comment on column public.island_economy_accounts.retired_at is 'Canonical retirement time, null on an active account.';

create table if not exists public.island_economy_state (
  island_owner uuid primary key references public.islands(player_id) on delete restrict,
  mode text not null default 'island_shared' check (mode = 'island_shared'),
  economy_version smallint not null default 1 check (economy_version = 1),
  current_account_id uuid not null unique,
  run_epoch uuid not null,
  admission_state text not null default 'active' check (admission_state in ('active', 'paused')),
  admitted_at timestamptz not null default clock_timestamp(),
  foreign key (current_account_id, island_owner, run_epoch)
    references public.island_economy_accounts(id, island_owner, run_epoch) on delete restrict
);

comment on table public.island_economy_state is
  'MP-ECO persisted mode/current-run pointer. Absence after a successful known-island read means legacy; a missing table or failed query never means legacy. Paused remains shared and never restores personal funding.';
comment on column public.island_economy_state.island_owner is 'Island whose economy has explicitly been admitted.';
comment on column public.island_economy_state.mode is 'Pinned shared mode; there is no downgrade to personal accounting.';
comment on column public.island_economy_state.economy_version is 'Pinned account protocol version.';
comment on column public.island_economy_state.current_account_id is 'Current account UUID, rechecked with epoch on every new mutation.';
comment on column public.island_economy_state.run_epoch is 'Current run UUID; prior financial claims keep their old account.';
comment on column public.island_economy_state.admission_state is 'Active or paused offers; pausing does not discard state or settlements.';
comment on column public.island_economy_state.admitted_at is 'Canonical explicit admission time.';

create table if not exists public.island_treasury_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  run_epoch uuid not null,
  actor_id uuid not null,
  action_uid text not null check (action_uid ~ '^[A-Za-z0-9_-]{8,64}$'),
  kind text not null check (kind in ('credit', 'spend', 'reserve', 'settle')),
  reason text not null,
  reference text not null check (char_length(reference) between 1 and 120 and btrim(reference) <> ''),
  request_fingerprint jsonb not null check (jsonb_typeof(request_fingerprint) = 'object'),
  balance_delta numeric not null,
  committed_delta numeric not null,
  balance_at_commit numeric not null,
  committed_at_commit numeric not null,
  revision_at_commit numeric not null,
  source_reservation_id uuid unique,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (account_id, run_epoch)
    references public.island_economy_accounts(id, run_epoch) on delete restrict,
  unique (id, account_id, run_epoch),
  foreign key (source_reservation_id, account_id, run_epoch)
    references public.island_treasury_transactions(id, account_id, run_epoch) on delete restrict,
  unique (actor_id, action_uid),
  unique (account_id, action_uid),
  unique (account_id, reason, reference),
  unique (account_id, revision_at_commit),
  constraint island_treasury_transactions_money check (
    balance_delta::text not in ('NaN', 'Infinity', '-Infinity')
    and committed_delta::text not in ('NaN', 'Infinity', '-Infinity')
    and balance_delta = trunc(balance_delta) and committed_delta = trunc(committed_delta)
    and balance_at_commit::text not in ('NaN', 'Infinity', '-Infinity')
    and committed_at_commit::text not in ('NaN', 'Infinity', '-Infinity')
    and balance_at_commit = trunc(balance_at_commit)
    and committed_at_commit = trunc(committed_at_commit)
    and balance_at_commit >= committed_at_commit and committed_at_commit >= 0
    and revision_at_commit::text not in ('NaN', 'Infinity', '-Infinity')
    and revision_at_commit = trunc(revision_at_commit) and revision_at_commit > 0
  ),
  constraint island_treasury_transactions_kind check (
    (kind = 'credit' and balance_delta >= 0 and committed_delta = 0 and source_reservation_id is null)
    or (kind = 'spend' and balance_delta < 0 and committed_delta = 0 and source_reservation_id is null)
    or (kind = 'reserve' and balance_delta <= 0 and committed_delta > 0 and source_reservation_id is null)
    or (kind = 'settle' and committed_delta < 0 and source_reservation_id is not null)
  )
);

comment on table public.island_treasury_transactions is
  'MP-ECO append-only financial receipts. Record both cash and principal reservation deltas, even a zero-cash reservation. A settlement uniquely resolves its immutable source reserve on the same account/epoch. Action and reason/reference keys cannot pay twice.';
comment on column public.island_treasury_transactions.id is 'Immutable receipt UUID; reserve receipt IDs identify held principal.';
comment on column public.island_treasury_transactions.account_id is 'Immutable originating account; never reassigned at settlement.';
comment on column public.island_treasury_transactions.run_epoch is 'Originating run UUID, preserved after reset.';
comment on column public.island_treasury_transactions.actor_id is 'Original actor UUID retained for historical attribution, not a live membership FK.';
comment on column public.island_treasury_transactions.action_uid is 'One actor action; reuse on a different target or payload conflicts.';
comment on column public.island_treasury_transactions.kind is 'Credit, spend, reserve, or uniquely resolving settlement.';
comment on column public.island_treasury_transactions.reason is 'Server-chosen business reason checked by each primitive.';
comment on column public.island_treasury_transactions.reference is 'Immutable server origin key, unique per account/reason.';
comment on column public.island_treasury_transactions.request_fingerprint is 'Canonical business inputs; differing retries cannot mutate the original action.';
comment on column public.island_treasury_transactions.balance_delta is 'Exact signed change to cash, including fee and net settled profit/loss.';
comment on column public.island_treasury_transactions.committed_delta is 'Exact signed change to principal reserved, including zero-cash holds.';
comment on column public.island_treasury_transactions.balance_at_commit is 'Original cash snapshot for this receipt, never the current HUD balance.';
comment on column public.island_treasury_transactions.committed_at_commit is 'Original reserved-principal snapshot for this receipt.';
comment on column public.island_treasury_transactions.revision_at_commit is 'Original revision for this immutable receipt.';
comment on column public.island_treasury_transactions.source_reservation_id is 'Exactly one reserve resolved by this settlement; unique across all settlement/cancellation actions.';
comment on column public.island_treasury_transactions.created_at is 'Canonical transaction time.';

-- Browser reads/writes are absent; future checked API routes project permitted state.
alter table public.island_economy_accounts enable row level security;
alter table public.island_economy_state enable row level security;
alter table public.island_treasury_transactions enable row level security;
revoke all on table public.island_economy_accounts from public, anon, authenticated, service_role;
revoke all on table public.island_economy_state from public, anon, authenticated, service_role;
revoke all on table public.island_treasury_transactions from public, anon, authenticated, service_role;
grant select on table public.island_economy_accounts to service_role;
grant select on table public.island_economy_state to service_role;
grant select on table public.island_treasury_transactions to service_role;

-- Protect historical receipts even from an accidental privileged update/delete.
create or replace function public.island_treasury_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'island_treasury_receipt_immutable';
end;
$$;
revoke all on function public.island_treasury_immutable() from public, anon, authenticated, service_role;
comment on function public.island_treasury_immutable() is 'Reject every update/delete of an immutable island treasury receipt.';
create or replace trigger island_treasury_transactions_immutable
  before update or delete on public.island_treasury_transactions
  for each row execute function public.island_treasury_immutable();
