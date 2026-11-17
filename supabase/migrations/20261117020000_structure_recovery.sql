-- =============================================================================
-- 20261117020000_structure_recovery.sql
--
-- WHAT IT DOES
--   Adds service-only, versioned island structure health, immutable wave start
--   snapshots, append-only ordered events, replay health checkpoints and the
--   shared paid-repair receipt/quota foundation. Legacy wave rows are not the
--   durable history key: recovery history is intentionally independent of
--   wave_runs so fresh-start cleanup cannot erase a closed wave's journal.
--   No existing wave/build/reset function is replaced in this additive phase.
--
-- SAFE TO RUN AGAIN
--   All objects are created conditionally or replaced idempotently. No existing
--   rows are deleted or reinterpreted; each existing building gets a fresh
--   recovery instance UUID once when this migration first adds the column.
-- =============================================================================

-- A demolished and rebuilt structure at the same spot is a different target.
alter table public.islet_buildings
  add column if not exists recovery_instance_id uuid not null default gen_random_uuid();

create unique index if not exists islet_buildings_recovery_instance_unique
  on public.islet_buildings (recovery_instance_id);

comment on column public.islet_buildings.recovery_instance_id is
  'Stable identity of this structure build instance for recovery v1. A demolished replacement receives a new UUID; a spot and level alone never authorize stale health or repair data.';

-- Frozen protocol-2 waves include the recovery policy rule. The registry stays
-- off by default in backend/server/flags.py; allowing its name does not activate it.
alter table public.wave_rules
  drop constraint if exists wave_rules_known_names,
  add constraint wave_rules_known_names
    check (rules <@ array[
      'tower_health', 'pathing', 'tower_obstacles', 'rescue', 'defenses_v2', 'ship_fire',
      'structure_recovery'
    ]::text[]);

comment on table public.wave_rules is
  'Frozen simulation rules (tower_health, pathing, tower_obstacles, rescue, defenses_v2, ship_fire, structure_recovery) kept by the first start/join/current answer for a wave so every client uses the same policy. Written only by wave_rules_keep().';

-- Current policy epoch and active reservation pointer. Reset advances the epoch;
-- old receipts and wave records remain independently readable by service code.
create table if not exists public.island_recovery_state (
  island_owner uuid primary key references public.islands (player_id) on delete cascade,
  reset_epoch uuid not null default gen_random_uuid(),
  recovery_version smallint not null default 0,
  wave_protocol smallint not null default 1,
  revision bigint not null default 0,
  current_wave_id uuid,
  reserved_at timestamptz,
  starts_at timestamptz,
  expires_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  constraint island_recovery_state_version check (recovery_version in (0, 1)),
  constraint island_recovery_state_protocol check (wave_protocol in (1, 2)),
  constraint island_recovery_state_version_protocol check (
    (recovery_version = 0 and wave_protocol = 1)
    or (recovery_version = 1 and wave_protocol = 2)
  ),
  constraint island_recovery_state_revision check (revision >= 0),
  constraint island_recovery_state_reservation check (
    (current_wave_id is null and reserved_at is null and starts_at is null and expires_at is null)
    or (current_wave_id is not null and reserved_at is not null and starts_at is not null
        and expires_at is not null and reserved_at <= starts_at and starts_at <= expires_at)
  )
);

comment on table public.island_recovery_state is
  'Current recovery policy, reset epoch, revision and canonical active reservation for an island. Mutable current state only; wave snapshots, events and receipts live in history tables that do not cascade from this row.';
comment on column public.island_recovery_state.island_owner is 'Island owner and stable current-state key.';
comment on column public.island_recovery_state.reset_epoch is 'Identity fence replaced by an authorized island reset; stale clients and receipts cannot affect a newer epoch.';
comment on column public.island_recovery_state.recovery_version is 'Server-owned policy: 0 legacy, 1 normalized persistent recovery.';
comment on column public.island_recovery_state.wave_protocol is 'Server-owned protocol: 1 legacy or 2 durable recovery journal.';
comment on column public.island_recovery_state.revision is 'Monotonic revision of materialized island recovery state.';
comment on column public.island_recovery_state.current_wave_id is 'Canonical UUID of the accepted reservation; null when no recovery wave is reserved.';
comment on column public.island_recovery_state.reserved_at is 'Database UTC instant when the accepted bell transaction acquired the reservation.';
comment on column public.island_recovery_state.starts_at is 'Canonical wave start; countdown and combat both pause recovery.';
comment on column public.island_recovery_state.expires_at is 'Canonical expiry, starts_at plus the frozen maximum duration.';
comment on column public.island_recovery_state.updated_at is 'Database UTC time of the latest current-state mutation.';

insert into public.island_recovery_state (island_owner)
select player_id from public.islands
on conflict (island_owner) do nothing;

create or replace function public.island_recovery_state_seed()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.island_recovery_state (island_owner)
  values (new.player_id)
  on conflict (island_owner) do nothing;
  return new;
end;
$$;

comment on function public.island_recovery_state_seed() is
  'Creates the v0 reset-epoch fence for each newly opened island without changing legacy island behavior.';

drop trigger if exists island_recovery_state_seed_after_insert on public.islands;
create trigger island_recovery_state_seed_after_insert
  after insert on public.islands
  for each row execute function public.island_recovery_state_seed();

create or replace function public.island_recovery_state_monotonic()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.revision < old.revision
     or new.recovery_version < old.recovery_version
     or new.wave_protocol < old.wave_protocol then
    raise exception 'recovery_state_not_monotonic';
  end if;
  return new;
end;
$$;

comment on function public.island_recovery_state_monotonic() is
  'Prevents recovery policy, protocol and revision counters from moving backwards; disabling the flag cannot reinterpret persisted policy.';

drop trigger if exists island_recovery_state_never_rewinds on public.island_recovery_state;
create trigger island_recovery_state_never_rewinds
  before update on public.island_recovery_state
  for each row execute function public.island_recovery_state_monotonic();

create table if not exists public.island_structure_health (
  island_owner uuid not null references public.island_recovery_state (island_owner) on delete cascade,
  spot text not null,
  instance_id uuid not null,
  building_kind text not null,
  level smallint not null,
  hp_units integer not null,
  max_hp numeric(12, 2) not null,
  config_version smallint not null,
  settled_at timestamptz not null,
  rate_numerator bigint not null,
  rate_denominator bigint not null,
  repair_seq bigint not null default 0,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (island_owner, spot),
  unique (instance_id),
  constraint island_structure_health_spot check (spot ~ '^(wall_(?:[1-9]|1[0-2])|cannon_(?:[1-9]|1[01]))$'),
  constraint island_structure_health_kind check (building_kind in ('wall', 'cannon', 'mortar', 'harpoon', 'culverin', 'swivel')),
  constraint island_structure_health_level check (level between 1 and 5),
  constraint island_structure_health_units check (hp_units between 0 and 1000000),
  constraint island_structure_health_max check (max_hp > 0),
  constraint island_structure_health_config check (config_version = 1),
  constraint island_structure_health_rate check (rate_numerator >= 0 and rate_denominator > 0),
  constraint island_structure_health_repair_seq check (repair_seq >= 0)
);

create index if not exists island_structure_health_instance_idx
  on public.island_structure_health (island_owner, instance_id);

comment on table public.island_structure_health is
  'Current normalized health for each currently built wall or tower. Instance, kind and level are checked against islet_buildings by service transactions; health is not immutable wave-start data.';
comment on column public.island_structure_health.island_owner is 'Island owner; the row is current state and is cleared on island recovery-state reset.';
comment on column public.island_structure_health.spot is 'Canonical D060-aware island spot, used only with instance_id as the target fence.';
comment on column public.island_structure_health.instance_id is 'The exact islet_buildings.recovery_instance_id represented by this health row.';
comment on column public.island_structure_health.building_kind is 'Server-verified structure kind used with the versioned maximum-HP manifest.';
comment on column public.island_structure_health.level is 'Server-verified building level at settled_at.';
comment on column public.island_structure_health.hp_units is 'Normalized actual health in integer units from zero through 1,000,000.';
comment on column public.island_structure_health.max_hp is 'Actual configured maximum HP, not normalized units and never client supplied.';
comment on column public.island_structure_health.config_version is 'Maximum-HP and recovery manifest version for this stored state.';
comment on column public.island_structure_health.settled_at is 'Database UTC materialization anchor for the stored hp_units and rate.';
comment on column public.island_structure_health.rate_numerator is 'Numerator of the exact between-wave recovery factor; base rate is 1,000,000 / 600,000 units per millisecond.';
comment on column public.island_structure_health.rate_denominator is 'Positive denominator of the exact between-wave recovery factor.';
comment on column public.island_structure_health.repair_seq is 'Per-instance paid-repair sequence used to fence quotes and stale checkpoints.';
comment on column public.island_structure_health.updated_at is 'Database UTC time this materialized row last changed.';

-- No foreign key to wave_runs: reset may remove that legacy operational row,
-- while this immutable record remains the canonical protocol-2 history key.
create table if not exists public.recovery_wave_states (
  wave_id uuid primary key,
  island_owner uuid not null references public.profiles (id) on delete cascade,
  reset_epoch uuid not null,
  recovery_version smallint not null,
  wave_protocol smallint not null,
  initial_snapshot jsonb not null,
  paid_used smallint not null default 0,
  journal_head bigint not null default 0,
  sealed_through_tick integer not null default -1,
  last_repair_seq bigint not null default 0,
  checkpoint_actor uuid references public.profiles (id) on delete set null,
  checkpoint_uid text,
  checkpoint_through_tick integer,
  checkpoint_input_head_seq bigint,
  checkpoint_last_repair_seq bigint,
  checkpoint_basis_repair_seq jsonb,
  checkpoint_hp jsonb,
  checkpoint_accepted_at timestamptz,
  closed_at timestamptz,
  closed_hp jsonb,
  created_at timestamptz not null default clock_timestamp(),
  constraint recovery_wave_states_version check (recovery_version = 1),
  constraint recovery_wave_states_protocol check (wave_protocol = 2),
  constraint recovery_wave_states_snapshot check (jsonb_typeof(initial_snapshot) = 'object'),
  constraint recovery_wave_states_paid_used check (paid_used between 0 and 3),
  constraint recovery_wave_states_head check (journal_head >= 0),
  constraint recovery_wave_states_sealed check (sealed_through_tick >= -1),
  constraint recovery_wave_states_repair_seq check (last_repair_seq >= 0),
  constraint recovery_wave_states_checkpoint_pair check (
    (checkpoint_uid is null and checkpoint_through_tick is null
     and checkpoint_input_head_seq is null and checkpoint_last_repair_seq is null
     and checkpoint_basis_repair_seq is null and checkpoint_hp is null
     and checkpoint_accepted_at is null)
    or (checkpoint_uid ~ '^[A-Za-z0-9_-]{8,64}$' and checkpoint_through_tick >= 0
        and checkpoint_input_head_seq >= 0 and checkpoint_last_repair_seq >= 0
        and jsonb_typeof(checkpoint_basis_repair_seq) = 'object'
        and jsonb_typeof(checkpoint_hp) = 'object' and checkpoint_accepted_at is not null)
  ),
  constraint recovery_wave_states_closed_pair check ((closed_at is null) = (closed_hp is null))
);

create index if not exists recovery_wave_states_owner_history_idx
  on public.recovery_wave_states (island_owner, created_at desc);

comment on table public.recovery_wave_states is
  'Immutable protocol-2 wave start snapshot plus mutable journal/quota cursors and one terminal accepted health vector. History is keyed by canonical wave UUID and intentionally survives deletion of legacy wave_runs during reset.';
comment on column public.recovery_wave_states.wave_id is 'Canonical UUID of the accepted wave and its three-use quota; never a display wave number.';
comment on column public.recovery_wave_states.island_owner is 'Island whose wave state and snapshot this row records.';
comment on column public.recovery_wave_states.reset_epoch is 'Reset epoch frozen at wave admission.';
comment on column public.recovery_wave_states.recovery_version is 'Frozen recovery policy version; protocol-2 rows are version 1.';
comment on column public.recovery_wave_states.wave_protocol is 'Frozen durable wave protocol version.';
comment on column public.recovery_wave_states.initial_snapshot is 'Immutable full createWave input set and initial per-instance actual health/config, separate from subsequent event and health history.';
comment on column public.recovery_wave_states.paid_used is 'Shared paid-restore uses committed in this canonical wave, from zero through three.';
comment on column public.recovery_wave_states.journal_head is 'Largest committed server sequence in recovery_wave_events.';
comment on column public.recovery_wave_states.sealed_through_tick is 'Largest server-sealed simulation tick; accepted events cannot backdate before it.';
comment on column public.recovery_wave_states.last_repair_seq is 'Largest server-authored repair sequence in this wave.';
comment on column public.recovery_wave_states.checkpoint_actor is 'Participant who submitted the current globally accepted canonical HP prefix; anonymized to null if that account is deleted.';
comment on column public.recovery_wave_states.checkpoint_uid is 'Stable UID for the current globally accepted checkpoint prefix.';
comment on column public.recovery_wave_states.checkpoint_through_tick is 'Through-tick cursor for the current globally accepted complete HP vector.';
comment on column public.recovery_wave_states.checkpoint_input_head_seq is 'Journal sequence head covered by the current canonical checkpoint.';
comment on column public.recovery_wave_states.checkpoint_last_repair_seq is 'Global repair sequence covered by the current canonical checkpoint.';
comment on column public.recovery_wave_states.checkpoint_basis_repair_seq is 'Per-instance repair sequence basis for the current canonical checkpoint.';
comment on column public.recovery_wave_states.checkpoint_hp is 'Current globally accepted complete normalized HP vector; it is distinct from the immutable start snapshot and terminal closed_hp.';
comment on column public.recovery_wave_states.checkpoint_accepted_at is 'Database UTC timestamp of the current canonical checkpoint acceptance.';
comment on column public.recovery_wave_states.closed_at is 'Database UTC time the first canonical finish closes health, or null while reserved.';
comment on column public.recovery_wave_states.closed_hp is 'Immutable full normalized HP vector accepted by the first canonical finish.';
comment on column public.recovery_wave_states.created_at is 'Database UTC time the reservation snapshot was committed.';

create table if not exists public.recovery_wave_participants (
  wave_id uuid not null references public.recovery_wave_states (wave_id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  participant_token uuid not null default gen_random_uuid(),
  last_actor_counter bigint not null default 0,
  joined_at timestamptz not null default clock_timestamp(),
  primary key (wave_id, player_id),
  unique (wave_id, participant_token),
  constraint recovery_wave_participants_counter check (last_actor_counter >= 0)
);

comment on table public.recovery_wave_participants is
  'Private per-wave mapping from an authenticated profile to a random stable gameplay participant token. Account deletion removes the mapping while frozen snapshots and journal events retain only the token for deterministic replay.';
comment on column public.recovery_wave_participants.wave_id is 'Canonical recovery wave UUID.';
comment on column public.recovery_wave_participants.player_id is 'Private authenticated profile identity; cascades on account deletion.';
comment on column public.recovery_wave_participants.participant_token is 'Server-generated random per-wave gameplay identity, safe to retain in immutable replay data after account deletion.';
comment on column public.recovery_wave_participants.last_actor_counter is 'Largest accepted actor-local command counter; only the server increments it.';
comment on column public.recovery_wave_participants.joined_at is 'Database UTC time this participant joined the recovery wave.';

create or replace function public.recovery_wave_snapshot_immutable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.wave_id is distinct from old.wave_id
     or new.island_owner is distinct from old.island_owner
     or new.reset_epoch is distinct from old.reset_epoch
     or new.recovery_version is distinct from old.recovery_version
     or new.wave_protocol is distinct from old.wave_protocol
     or new.initial_snapshot is distinct from old.initial_snapshot
     or new.created_at is distinct from old.created_at then
    raise exception 'recovery_snapshot_immutable';
  end if;
  if new.paid_used < old.paid_used
     or new.journal_head < old.journal_head
     or new.sealed_through_tick < old.sealed_through_tick
     or new.last_repair_seq < old.last_repair_seq
     or (old.checkpoint_through_tick is not null and (
         new.checkpoint_through_tick is null
         or new.checkpoint_through_tick < old.checkpoint_through_tick
         or new.checkpoint_input_head_seq < old.checkpoint_input_head_seq
         or new.checkpoint_last_repair_seq < old.checkpoint_last_repair_seq)) then
    raise exception 'recovery_state_not_monotonic';
  end if;
  if old.checkpoint_through_tick is not null
     and new.checkpoint_through_tick = old.checkpoint_through_tick
     and new.checkpoint_input_head_seq = old.checkpoint_input_head_seq
     and new.checkpoint_hp is distinct from old.checkpoint_hp then
    raise exception 'recovery_checkpoint_divergence';
  end if;
  if old.closed_at is not null and to_jsonb(new) is distinct from to_jsonb(old) then
    if old.checkpoint_actor is not null and new.checkpoint_actor is null
       and (to_jsonb(new) - 'checkpoint_actor') = (to_jsonb(old) - 'checkpoint_actor')
       and not exists (select 1 from public.profiles where id = old.checkpoint_actor) then
      return new;
    end if;
    raise exception 'recovery_wave_closed';
  end if;
  return new;
end;
$$;

comment on function public.recovery_wave_snapshot_immutable() is
  'Rejects mutation of immutable recovery wave identity and start snapshot; terminal closed health cannot be rewritten.';

drop trigger if exists recovery_wave_snapshot_is_immutable on public.recovery_wave_states;
create trigger recovery_wave_snapshot_is_immutable
  before update on public.recovery_wave_states
  for each row execute function public.recovery_wave_snapshot_immutable();

create table if not exists public.recovery_wave_events (
  wave_id uuid not null references public.recovery_wave_states (wave_id) on delete cascade,
  seq bigint not null,
  actor_id uuid references public.profiles (id) on delete set null,
  participant_token uuid,
  input_uid text,
  event_kind text not null,
  effective_tick integer not null,
  payload jsonb not null,
  committed_at timestamptz not null default clock_timestamp(),
  primary key (wave_id, seq),
  constraint recovery_wave_events_seq check (seq > 0),
  constraint recovery_wave_events_uid check (input_uid is null or input_uid ~ '^[A-Za-z0-9_-]{8,64}$'),
  constraint recovery_wave_events_actor_pair check (actor_id is null or participant_token is not null),
  constraint recovery_wave_events_kind check (event_kind ~ '^[a-z][a-z0-9_]{0,47}$'),
  constraint recovery_wave_events_tick check (effective_tick >= 0),
  constraint recovery_wave_events_payload check (jsonb_typeof(payload) = 'object')
);

create unique index if not exists recovery_wave_events_actor_uid_unique
  on public.recovery_wave_events (wave_id, participant_token, input_uid)
  where input_uid is not null and participant_token is not null;
create index if not exists recovery_wave_events_replay_order_idx
  on public.recovery_wave_events (wave_id, effective_tick, seq);

comment on table public.recovery_wave_events is
  'Append-only server-ordered wave journal. Replay order is (effective_tick, seq); payloads contain no payer wallet balances.';
comment on column public.recovery_wave_events.wave_id is 'Canonical recovery wave UUID.';
comment on column public.recovery_wave_events.seq is 'Monotonic server commit sequence within wave.';
comment on column public.recovery_wave_events.actor_id is 'Private authenticated profile that authored the input; cleared by the account-deletion anonymization trigger while preserving replay data.';
comment on column public.recovery_wave_events.participant_token is 'Server-owned per-wave gameplay identity, never client supplied; remains stable in replay after account deletion.';
comment on column public.recovery_wave_events.input_uid is 'Stable actor command UID for idempotent client input; null for server-authored entries.';
comment on column public.recovery_wave_events.event_kind is 'Whitelisted command kind, including server structure_repaired events.';
comment on column public.recovery_wave_events.effective_tick is 'Simulation application tick, independent of commit sequence.';
comment on column public.recovery_wave_events.payload is 'Validated command or repair payload, excluding wallet balances and secrets.';
comment on column public.recovery_wave_events.committed_at is 'Database UTC commit timestamp.';

create or replace function public.recovery_wave_event_append_only()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.actor_id is not null and new.actor_id is null
     and old.participant_token is not null
     and new.wave_id = old.wave_id and new.seq = old.seq
     and new.participant_token = old.participant_token
     and new.input_uid is not distinct from old.input_uid
     and new.event_kind = old.event_kind
     and new.effective_tick = old.effective_tick
     and new.payload = old.payload
     and new.committed_at = old.committed_at
     and not exists (select 1 from public.profiles where id = old.actor_id) then
    return new;
  end if;
  raise exception 'recovery_event_append_only';
end;
$$;

comment on function public.recovery_wave_event_append_only() is
  'Rejects UPDATE of journal events; service_role has no DELETE grant, while parent/account cascade deletion remains available for privacy.';

drop trigger if exists recovery_wave_events_append_only on public.recovery_wave_events;
create trigger recovery_wave_events_append_only
  before update on public.recovery_wave_events
  for each row execute function public.recovery_wave_event_append_only();

create table if not exists public.recovery_health_checkpoints (
  wave_id uuid not null references public.recovery_wave_states (wave_id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  checkpoint_uid text not null,
  reset_epoch uuid not null,
  through_tick integer not null,
  input_head_seq bigint not null,
  last_repair_seq bigint not null,
  basis_repair_seq jsonb not null,
  hp_vector jsonb not null,
  accepted_at timestamptz not null default clock_timestamp(),
  primary key (wave_id, actor_id, checkpoint_uid),
  constraint recovery_health_checkpoint_uid check (checkpoint_uid ~ '^[A-Za-z0-9_-]{8,64}$'),
  constraint recovery_health_checkpoint_tick check (through_tick >= 0),
  constraint recovery_health_checkpoint_cursor check (input_head_seq >= 0 and last_repair_seq >= 0),
  constraint recovery_health_checkpoint_basis check (jsonb_typeof(basis_repair_seq) = 'object'),
  constraint recovery_health_checkpoint_vector check (jsonb_typeof(hp_vector) = 'object')
);

create index if not exists recovery_health_checkpoints_latest_idx
  on public.recovery_health_checkpoints (wave_id, actor_id, through_tick desc, accepted_at desc);

comment on table public.recovery_health_checkpoints is
  'Immutable accepted replay health reports keyed by wave, participant and idempotent checkpoint UID; service validation compares epoch, event head, repair fences and every snapshot instance.';
comment on column public.recovery_health_checkpoints.wave_id is 'Canonical recovery wave UUID.';
comment on column public.recovery_health_checkpoints.actor_id is 'Authenticated wave participant who replayed the reported sealed prefix.';
comment on column public.recovery_health_checkpoints.checkpoint_uid is 'Stable client checkpoint UID for read-only retries.';
comment on column public.recovery_health_checkpoints.reset_epoch is 'Island epoch copied from the immutable wave snapshot.';
comment on column public.recovery_health_checkpoints.through_tick is 'Highest simulation tick included in the reported sealed prefix.';
comment on column public.recovery_health_checkpoints.input_head_seq is 'Journal head sequence included in the replayed prefix.';
comment on column public.recovery_health_checkpoints.last_repair_seq is 'Latest server repair event included in this report.';
comment on column public.recovery_health_checkpoints.basis_repair_seq is 'Per-instance repair sequence at the checkpoint, preventing a repair to another structure from authorizing HP.';
comment on column public.recovery_health_checkpoints.hp_vector is 'Complete normalized HP vector for the immutable start-snapshot instances, including zero values.';
comment on column public.recovery_health_checkpoints.accepted_at is 'Database UTC time checkpoint was accepted.';

create table if not exists public.structure_repair_receipts (
  payer_id uuid not null references public.profiles (id) on delete cascade,
  action_uid text not null,
  island_owner uuid not null references public.profiles (id) on delete cascade,
  reset_epoch uuid not null,
  instance_id uuid not null,
  spot text not null,
  building_kind text not null,
  level smallint not null,
  wave_id uuid,
  use_ordinal smallint,
  charged_price bigint not null,
  event_seq bigint,
  receipt_json jsonb not null,
  request_fingerprint text not null,
  committed_at timestamptz not null default clock_timestamp(),
  primary key (payer_id, action_uid),
  constraint structure_repair_receipts_uid check (action_uid ~ '^[A-Za-z0-9_-]{8,64}$'),
  constraint structure_repair_receipts_level check (level between 1 and 5),
  constraint structure_repair_receipts_price check (charged_price > 0),
  constraint structure_repair_receipts_quota_pair check (
    (wave_id is null and use_ordinal is null and event_seq is null)
    or (wave_id is not null and use_ordinal between 1 and 3 and event_seq > 0)
  ),
  constraint structure_repair_receipts_json check (jsonb_typeof(receipt_json) = 'object'),
  constraint structure_repair_receipts_fingerprint check (request_fingerprint ~ '^[0-9a-f]{64}$')
);

create unique index if not exists structure_repair_receipts_wave_use_unique
  on public.structure_repair_receipts (wave_id, use_ordinal)
  where wave_id is not null;
create index if not exists structure_repair_receipts_owner_history_idx
  on public.structure_repair_receipts (island_owner, committed_at desc);

comment on table public.structure_repair_receipts is
  'Durable T56 repair receipt and shared-quota foundation. This migration creates no payment RPC and changes no wallet; T56 owns the atomic paid transaction.';
comment on column public.structure_repair_receipts.payer_id is 'Authenticated player charged by the eventual T56 transaction.';
comment on column public.structure_repair_receipts.action_uid is 'Stable payer-scoped idempotency UID; one UID cannot charge twice across islands.';
comment on column public.structure_repair_receipts.island_owner is 'Island whose current epoch and structure the request targeted.';
comment on column public.structure_repair_receipts.reset_epoch is 'Epoch captured by the accepted repair; old receipts cannot restore after reset.';
comment on column public.structure_repair_receipts.instance_id is 'Exact structure build instance repaired.';
comment on column public.structure_repair_receipts.spot is 'Canonical structure spot as displayed at acceptance.';
comment on column public.structure_repair_receipts.building_kind is 'Server-verified structure kind at acceptance.';
comment on column public.structure_repair_receipts.level is 'Server-verified level and fixed-price schedule at acceptance.';
comment on column public.structure_repair_receipts.wave_id is 'Canonical reserved wave UUID; null for unlimited between-wave repairs.';
comment on column public.structure_repair_receipts.use_ordinal is 'Shared one-based quota slot from one through three; null outside a reserved wave.';
comment on column public.structure_repair_receipts.charged_price is 'Immutable coins charged by the paid transaction.';
comment on column public.structure_repair_receipts.event_seq is 'Server journal sequence for an in-wave repair; null between waves.';
comment on column public.structure_repair_receipts.receipt_json is 'Immutable accepted receipt including balance at commit, separate from current wallet state.';
comment on column public.structure_repair_receipts.request_fingerprint is 'SHA-256 fingerprint of stable repair intent, excluding ephemeral revisions and quote cursors.';
comment on column public.structure_repair_receipts.committed_at is 'Database UTC time accepted repair committed.';

create or replace function public.structure_repair_receipt_immutable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'structure_repair_receipt_immutable';
end;
$$;

comment on function public.structure_repair_receipt_immutable() is
  'Rejects UPDATE of an accepted repair receipt; service transactions insert it once and read it on retries.';

drop trigger if exists structure_repair_receipts_immutable on public.structure_repair_receipts;
create trigger structure_repair_receipts_immutable
  before update on public.structure_repair_receipts
  for each row execute function public.structure_repair_receipt_immutable();

-- Pure integer projection and canonical phase calculation. They accept only server
-- values; callers capture clock_timestamp() after acquiring recovery locks.
create or replace function public.structure_recovery_project_hp(
  p_hp_units integer,
  p_elapsed_ms bigint,
  p_rate_numerator bigint,
  p_rate_denominator bigint
)
returns integer
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_delta numeric;
begin
  if p_hp_units is null or p_hp_units not between 0 and 1000000
     or p_elapsed_ms is null or p_elapsed_ms < 0
     or p_rate_numerator is null or p_rate_numerator < 0
     or p_rate_denominator is null or p_rate_denominator <= 0 then
    raise exception 'bad_structure_health';
  end if;
  v_delta := floor(p_elapsed_ms::numeric * 1000000::numeric * p_rate_numerator::numeric
                   / (600000::numeric * p_rate_denominator::numeric));
  return least(1000000::numeric, p_hp_units::numeric + v_delta)::integer;
end;
$$;

comment on function public.structure_recovery_project_hp(integer, bigint, bigint, bigint) is
  'Pure integer HP projection from normalized units and an exact recovery multiplier; floors only elapsed recovery and permits zero-HP structures to recover.';

create or replace function public.structure_recovery_phase(
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_closed_at timestamptz,
  p_server_now timestamptz
)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  if p_server_now is null then
    raise exception 'bad_structure_phase';
  end if;
  if p_closed_at is not null or p_expires_at is null or p_server_now >= p_expires_at then
    return 'between_waves';
  end if;
  if p_starts_at is null then
    raise exception 'bad_structure_phase';
  end if;
  if p_server_now < p_starts_at then
    return 'preparing';
  end if;
  return 'combat';
end;
$$;

comment on function public.structure_recovery_phase(timestamptz, timestamptz, timestamptz, timestamptz) is
  'Derives canonical preparing/combat/between_waves phase from database timestamps; expiry is exactly starts_at plus frozen maximum duration.';

create or replace function public.structure_recovery_wave_hp(p_wave_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_wave public.recovery_wave_states;
  v_hp jsonb;
  v_basis jsonb;
  v_structure jsonb;
  v_event public.recovery_wave_events;
  v_instance text;
  v_repair_seq bigint;
begin
  select * into v_wave from public.recovery_wave_states where wave_id = p_wave_id;
  if not found then
    raise exception 'no_recovery_wave';
  end if;

  v_hp := v_wave.checkpoint_hp;
  v_basis := v_wave.checkpoint_basis_repair_seq;
  if v_hp is null then
    v_hp := '{}'::jsonb;
    v_basis := '{}'::jsonb;
    for v_structure in
      select item from jsonb_array_elements(v_wave.initial_snapshot -> 'structures') as s(item)
    loop
      v_instance := v_structure ->> 'instanceId';
      if v_instance is null or v_structure ->> 'hpUnits' is null then
        raise exception 'recovery_snapshot_incomplete';
      end if;
      v_hp := jsonb_set(v_hp, array[v_instance], v_structure -> 'hpUnits', true);
      v_basis := jsonb_set(
        v_basis, array[v_instance], coalesce(v_structure -> 'repairSeq', '0'::jsonb), true
      );
    end loop;
  end if;

  for v_event in
    select * from public.recovery_wave_events
     where wave_id = p_wave_id and event_kind = 'structure_repaired'
     order by seq
  loop
    v_instance := v_event.payload ->> 'instanceId';
    v_repair_seq := nullif(v_event.payload ->> 'repairSeq', '')::bigint;
    if v_instance is null or v_repair_seq is null
       or v_event.payload ->> 'hpUnits' is null then
      raise exception 'bad_recovery_repair_event';
    end if;
    if v_repair_seq > coalesce((v_basis ->> v_instance)::bigint, 0) then
      v_hp := jsonb_set(v_hp, array[v_instance], v_event.payload -> 'hpUnits', true);
    end if;
  end loop;
  return v_hp;
end;
$$;

comment on function public.structure_recovery_wave_hp(uuid) is
  'Builds the latest canonical wave HP vector from the last accepted complete checkpoint (or immutable start snapshot) plus later committed per-instance repair events.';

create or replace function public.structure_recovery_settle_locked(
  p_island_owner uuid,
  p_server_now timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.island_recovery_state;
  v_wave public.recovery_wave_states;
  v_phase text;
  v_status text := 'between_waves';
  v_boundary timestamptz;
  v_hp jsonb;
  v_health public.island_structure_health;
  v_expected integer;
  v_elapsed_ms bigint;
begin
  if p_island_owner is null or p_server_now is null then
    raise exception 'bad_recovery_settlement';
  end if;
  select * into v_state from public.island_recovery_state
   where island_owner = p_island_owner for update;
  if not found then
    return jsonb_build_object('status', 'missing');
  end if;
  if v_state.recovery_version = 0 then
    return jsonb_build_object(
      'status', 'legacy', 'serverNow', p_server_now, 'islandEpoch', v_state.reset_epoch,
      'revision', v_state.revision, 'recoveryVersion', 0, 'waveProtocol', 1,
      'displayPhase', 'between_waves', 'repairWindow', 'between_waves',
      'waveId', null, 'remainingPaidUses', null
    );
  end if;

  if v_state.current_wave_id is not null then
    select * into v_wave from public.recovery_wave_states
     where wave_id = v_state.current_wave_id for update;
    if not found then
      raise exception 'recovery_state_incomplete';
    end if;
    v_phase := public.structure_recovery_phase(
      v_state.starts_at, v_state.expires_at, v_wave.closed_at, p_server_now
    );
    if v_phase <> 'between_waves' then
      return jsonb_build_object(
        'status', 'reserved', 'serverNow', p_server_now, 'islandEpoch', v_state.reset_epoch,
        'revision', v_state.revision, 'recoveryVersion', v_state.recovery_version,
        'waveProtocol', v_state.wave_protocol, 'displayPhase', v_phase,
        'repairWindow', 'reserved_wave', 'waveId', v_state.current_wave_id,
        'remainingPaidUses', greatest(0, 3 - v_wave.paid_used)
      );
    end if;

    v_boundary := coalesce(v_wave.closed_at, v_state.expires_at);
    v_hp := case when v_wave.closed_at is null
                 then public.structure_recovery_wave_hp(v_wave.wave_id)
                 else v_wave.closed_hp end;
    if v_wave.closed_at is null then
      update public.recovery_wave_states
         set closed_at = v_boundary, closed_hp = v_hp
       where wave_id = v_wave.wave_id;
    end if;

    -- The caller already holds wallet and island locks. Lock all structures in
    -- canonical order before materializing any health or clearing the phase.
    perform 1 from public.islet_buildings
     where player_id = p_island_owner
       and building_type in ('wall', 'cannon', 'mortar', 'harpoon', 'culverin', 'swivel')
     order by plot for update;
    perform 1 from public.island_structure_health
     where island_owner = p_island_owner order by spot for update;

    for v_health in
      select * from public.island_structure_health
       where island_owner = p_island_owner order by spot
    loop
      if v_hp ? v_health.instance_id::text then
        v_expected := (v_hp ->> v_health.instance_id::text)::integer;
      else
        v_expected := v_health.hp_units;
      end if;
      v_elapsed_ms := greatest(
        0,
        floor(extract(epoch from (p_server_now - greatest(v_boundary, v_health.settled_at))) * 1000)::bigint
      );
      update public.island_structure_health
         set hp_units = public.structure_recovery_project_hp(
               v_expected, v_elapsed_ms, v_health.rate_numerator, v_health.rate_denominator
             ),
             settled_at = greatest(v_health.settled_at, p_server_now),
             updated_at = p_server_now
       where island_owner = p_island_owner and spot = v_health.spot
         and instance_id = v_health.instance_id;
    end loop;

    update public.island_recovery_state
       set current_wave_id = null, reserved_at = null, starts_at = null, expires_at = null,
           revision = revision + 1, updated_at = p_server_now
     where island_owner = p_island_owner;
    v_status := 'settled';
  else
    -- A paid request depends on current HP, so materialize every eligible
    -- between-wave fraction before testing whether a target is intact. This
    -- uses one timestamp captured by the caller after wallet/island locks.
    perform 1 from public.islet_buildings
     where player_id = p_island_owner
       and building_type in ('wall', 'cannon', 'mortar', 'harpoon', 'culverin', 'swivel')
     order by plot for update;
    perform 1 from public.island_structure_health
     where island_owner = p_island_owner order by spot for update;

    for v_health in
      select * from public.island_structure_health
       where island_owner = p_island_owner order by spot
    loop
      v_elapsed_ms := greatest(
        0,
        floor(extract(epoch from (p_server_now - v_health.settled_at)) * 1000)::bigint
      );
      update public.island_structure_health
         set hp_units = public.structure_recovery_project_hp(
               v_health.hp_units, v_elapsed_ms, v_health.rate_numerator, v_health.rate_denominator
             ),
             settled_at = greatest(v_health.settled_at, p_server_now),
             updated_at = p_server_now
       where island_owner = p_island_owner and spot = v_health.spot
         and instance_id = v_health.instance_id;
    end loop;
    update public.island_recovery_state
       set revision = revision + 1, updated_at = p_server_now
     where island_owner = p_island_owner;
  end if;

  select * into v_state from public.island_recovery_state where island_owner = p_island_owner;
  return jsonb_build_object(
    'status', v_status, 'serverNow', p_server_now, 'islandEpoch', v_state.reset_epoch,
    'revision', v_state.revision, 'recoveryVersion', v_state.recovery_version,
    'waveProtocol', v_state.wave_protocol, 'displayPhase', 'between_waves',
    'repairWindow', 'between_waves', 'waveId', null, 'remainingPaidUses', null
  );
end;
$$;

comment on function public.structure_recovery_settle_locked(uuid, timestamptz) is
  'In-transaction canonical expiry/finish settlement helper. Caller must already hold payer wallet(s) sorted and owner island locks, and pass one server timestamp captured after those locks. This helper locks recovery state, wave, buildings and health in canonical order, merges accepted checkpoint HP with later server repair events, materializes only inactive time, closes history and clears the active reservation. It never acquires a wallet.';

create or replace function public.structure_recovery_read_state(
  p_island_owner uuid,
  p_prices jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := statement_timestamp();
  v_state public.island_recovery_state;
  v_wave public.recovery_wave_states;
  v_health public.island_structure_health;
  v_snapshot_structure jsonb;
  v_phase text := 'between_waves';
  v_boundary timestamptz;
  v_hp jsonb;
  v_price_schedule jsonb := p_prices;
  v_price integer;
  v_display_hp integer;
  v_display_max_hp numeric;
  v_elapsed_ms bigint;
  v_rate numeric;
  v_eta integer;
  v_structures jsonb := '[]'::jsonb;
begin
  if p_island_owner is null or jsonb_typeof(p_prices) is distinct from 'object' then
    raise exception 'bad_recovery_read';
  end if;
  select * into v_state from public.island_recovery_state
   where island_owner = p_island_owner;
  if not found then
    return jsonb_build_object('status', 'missing');
  end if;
  if v_state.recovery_version = 0 then
    return jsonb_build_object(
      'status', 'legacy', 'serverNow', v_now, 'islandEpoch', v_state.reset_epoch,
      'revision', v_state.revision, 'recoveryVersion', 0, 'waveProtocol', 1,
      'displayPhase', 'between_waves', 'repairWindow', 'between_waves',
      'waveId', null, 'remainingPaidUses', null, 'structures', '[]'::jsonb
    );
  end if;

  if v_state.current_wave_id is not null then
    select * into v_wave from public.recovery_wave_states
     where wave_id = v_state.current_wave_id;
    if not found then
      raise exception 'recovery_state_incomplete';
    end if;
    v_phase := public.structure_recovery_phase(
      v_state.starts_at, v_state.expires_at, v_wave.closed_at, v_now
    );
    v_hp := case when v_wave.closed_at is null
                 then public.structure_recovery_wave_hp(v_wave.wave_id)
                 else v_wave.closed_hp end;
    if v_phase = 'between_waves' then
      v_boundary := coalesce(v_wave.closed_at, v_state.expires_at);
    else
      v_price_schedule := v_wave.initial_snapshot -> 'priceSchedule';
    end if;
  end if;

  if exists (
    select 1 from public.islet_buildings b
     left join public.island_structure_health h
       on h.island_owner = b.player_id and h.spot = b.plot
      and h.instance_id = b.recovery_instance_id
     where b.player_id = p_island_owner
       and b.building_type in ('wall', 'cannon', 'mortar', 'harpoon', 'culverin', 'swivel')
       and h.instance_id is null
  ) then
    raise exception 'recovery_state_incomplete';
  end if;

  for v_health in
    select h.* from public.island_structure_health h
    join public.islet_buildings b
      on b.player_id = h.island_owner and b.plot = h.spot
     and b.recovery_instance_id = h.instance_id
     and b.building_type = h.building_kind and b.level = h.level
   where h.island_owner = p_island_owner order by h.spot
  loop
    v_display_hp := v_health.hp_units;
    v_display_max_hp := v_health.max_hp;
    if v_hp ? v_health.instance_id::text then
      v_display_hp := (v_hp ->> v_health.instance_id::text)::integer;
    end if;
    if v_phase <> 'between_waves' then
      select item into v_snapshot_structure
        from jsonb_array_elements(v_wave.initial_snapshot -> 'structures') as s(item)
       where item ->> 'instanceId' = v_health.instance_id::text;
      if v_snapshot_structure is not null then
        v_display_max_hp := (v_snapshot_structure ->> 'maxHP')::numeric;
      end if;
    end if;
    if v_phase = 'between_waves' then
      v_elapsed_ms := greatest(
        0,
        floor(extract(epoch from (v_now - greatest(coalesce(v_boundary, v_health.settled_at), v_health.settled_at))) * 1000)::bigint
      );
      v_display_hp := public.structure_recovery_project_hp(
        v_display_hp, v_elapsed_ms, v_health.rate_numerator, v_health.rate_denominator
      );
      v_rate := (1000000::numeric * v_health.rate_numerator)
                / (600::numeric * v_health.rate_denominator);
      if v_display_hp >= 1000000 then
        v_eta := 0;
      elsif v_rate = 0 then
        v_eta := null;
      else
        v_eta := ceil((1000000 - v_display_hp)::numeric / v_rate)::integer;
      end if;
    else
      v_rate := 0;
      v_eta := null;
    end if;

    if jsonb_typeof(v_price_schedule -> v_health.building_kind) is distinct from 'array'
       or jsonb_array_length(v_price_schedule -> v_health.building_kind) < v_health.level then
      raise exception 'bad_recovery_prices';
    end if;
    v_price := ((v_price_schedule -> v_health.building_kind) -> (v_health.level - 1) #>> '{}')::integer;
    v_structures := v_structures || jsonb_build_array(jsonb_build_object(
      'spot', v_health.spot, 'instanceId', v_health.instance_id,
      'kind', v_health.building_kind, 'level', v_health.level,
      'hpUnits', v_display_hp, 'maxHP', v_display_max_hp,
      'rateUnitsPerSecond', v_rate, 'estimatedFreeSeconds', v_eta,
      'fixedPrice', v_price, 'repairSeq', v_health.repair_seq
    ));
  end loop;

  return jsonb_build_object(
    'status', 'ok', 'serverNow', v_now, 'islandEpoch', v_state.reset_epoch,
    'revision', v_state.revision, 'recoveryVersion', v_state.recovery_version,
    'waveProtocol', v_state.wave_protocol, 'displayPhase', v_phase,
    'repairWindow', case when v_phase = 'between_waves' then 'between_waves' else 'reserved_wave' end,
    'waveId', case when v_phase = 'between_waves' then null else v_state.current_wave_id end,
    'remainingPaidUses', case when v_phase = 'between_waves' then null else greatest(0, 3 - v_wave.paid_used) end,
    'structures', v_structures
  );
end;
$$;

comment on function public.structure_recovery_read_state(uuid, jsonb) is
  'Read-only, statement-snapshot-consistent database-clock current structure projection. Before expiry it pauses recovery and uses frozen wave prices; at finish/expiry it uses the same canonical checkpoint plus later paid-repair events and only projects from the canonical boundary without mutating anchors. Write paths instead capture clock_timestamp() after acquiring canonical locks.';

-- Service code is the only reader/writer. RLS remains enabled with no browser
-- policies; service_role has the minimum operations needed for each table.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'island_recovery_state', 'island_structure_health', 'recovery_wave_states', 'recovery_wave_participants',
    'recovery_wave_events', 'recovery_health_checkpoints', 'structure_repair_receipts'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', v_table);
  end loop;
end;
$$;

grant select, insert, update on table public.island_recovery_state to service_role;
grant select, insert, update, delete on table public.island_structure_health to service_role;
grant select, insert, update on table public.recovery_wave_states to service_role;
grant select, insert on table public.recovery_wave_participants to service_role;
grant select, insert on table public.recovery_wave_events to service_role;
grant select, insert on table public.recovery_health_checkpoints to service_role;
grant select, insert on table public.structure_repair_receipts to service_role;

revoke all on function public.recovery_wave_snapshot_immutable() from public, anon, authenticated;
revoke all on function public.recovery_wave_event_append_only() from public, anon, authenticated;
revoke all on function public.structure_repair_receipt_immutable() from public, anon, authenticated;
revoke all on function public.island_recovery_state_seed() from public, anon, authenticated;
revoke all on function public.island_recovery_state_monotonic() from public, anon, authenticated;
revoke all on function public.structure_recovery_project_hp(integer, bigint, bigint, bigint) from public, anon, authenticated;
revoke all on function public.structure_recovery_phase(timestamptz, timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.structure_recovery_wave_hp(uuid) from public, anon, authenticated;
revoke all on function public.structure_recovery_settle_locked(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.structure_recovery_read_state(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.recovery_wave_snapshot_immutable() to service_role;
grant execute on function public.recovery_wave_event_append_only() to service_role;
grant execute on function public.structure_repair_receipt_immutable() to service_role;
grant execute on function public.island_recovery_state_seed() to service_role;
grant execute on function public.island_recovery_state_monotonic() to service_role;
grant execute on function public.structure_recovery_project_hp(integer, bigint, bigint, bigint) to service_role;
grant execute on function public.structure_recovery_phase(timestamptz, timestamptz, timestamptz, timestamptz) to service_role;
grant execute on function public.structure_recovery_wave_hp(uuid) to service_role;
grant execute on function public.structure_recovery_settle_locked(uuid, timestamptz) to service_role;
grant execute on function public.structure_recovery_read_state(uuid, jsonb) to service_role;
