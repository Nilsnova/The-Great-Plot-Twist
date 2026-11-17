-- =============================================================================
-- apply-2026-11-17-recovery.sql: the T55-T60 structure recovery migrations, in one paste
-- =============================================================================
--
-- WHAT IT DOES
--   Applies, inside one transaction and in order, the five migrations of Ianno's
--   T55-T60 stack (PRs #136-#140, #197, #199-#201, integration branch
--   integ/ianno-t55) and registers their versions in
--   supabase_migrations.schema_migrations (so `supabase db push` / the migration
--   list see them as applied). The text between the >>> / <<< markers is
--   byte-for-byte the file in supabase/migrations/ (md5 of each file below):
--
--     20261117020000_structure_recovery.sql
--         T55: recovery tables (state, health, wave snapshots, journal, checkpoints, receipts), islet_buildings.recovery_instance_id, wave-rule name structure_recovery
--         md5 041e6af541ddc997817c23e1a6902a84
--     20261117025000_legacy_wave_locks.sql
--         T55: legacy wave_start/join/finish (both overloads), island_walls_record, island_wall_restore re-created with the shared lock order and a v1 refusal
--         md5 f13386bcf7c60e9767852b68ac641c8b
--     20261117030000_paid_structure_repair.sql
--         T56: island_structure_repair(), paid Repair now
--         md5 92aa190a0ca4f62f1031e467d8a189ab
--     20261117040000_structure_recovery_api.sql
--         T55/T57: recovery_wave_start/join/current/finish, inputs, events page, health checkpoints, refresh helper
--         md5 a9fcfc4145eb9b9bd26b7104b690d7f9
--     20261117050000_structure_recovery_mutations.sql
--         T55: build/upgrade/hire/research/specialise/tower_tree/move/demolish/fresh_start/learn_skill hooks
--         md5 d31341f858e2a2d65cf48d4ee51188a6
--
--   Needs, already applied (live on 17 Nov 2026): every migration up to and
--   including 20261117010000_more_tower_spots (D060 plot pattern cannon_1..11, T53
--   island_fresh_start, D055 tower trees, D051 skill prices, D052 crew_guard, the
--   #82 wall_restored_at fence). Every function re-created here was checked line by
--   line against its newest earlier definition: only the recovery hooks are added.
--   The live-only old overloads island_specialise(5 args) and
--   sports_settle_fixture(10 args) are not touched.
--
-- FLAG
--   Nothing changes for players until the server flag structure_recovery is
--   switched on (FEATURE_FLAGS; off by default). With it off every island stays
--   recovery_version 0 / wave protocol 1 and the re-created functions keep their
--   legacy answers (D039 walls, D049 tower health). Do NOT switch it on as part of
--   this apply.
--
-- DEPLOY ORDER
--   Apply this file BEFORE deploying the integ/ianno-t55 server: the new server
--   starts, joins and reads every wave through recovery_wave_start/join/current()
--   (missing functions would break every wave). The old server keeps working on
--   the new schema (same legacy signatures and answers).
--
-- DROP / DELETE IN THIS FILE (statements that run while applying)
--   * alter table public.wave_rules drop constraint if exists wave_rules_known_names,
--     add it again with 'structure_recovery' appended, in the SAME statement.
--   * drop trigger if exists ... and re-create at once (5 triggers: one on
--     public.islands, the new island seed trigger; four on the new tables).
--   * drop function if exists public.recovery_wave_events_page(uuid,uuid,bigint,bigint)
--     (an intermediate signature that does not exist live; a no-op).
--   * No row is deleted while applying. "delete from" appears only inside function
--     bodies (island_demolish, island_fresh_start, structure_recovery_refresh_locked),
--     run later by the game exactly as today, plus the new island_structure_health rows.
--   * Backfill: alter table islet_buildings add column recovery_instance_id uuid not null
--     default gen_random_uuid() (table rewrite, one new UUID per existing building) and
--     insert into island_recovery_state one v0 row per existing island.
--
-- SAFE TO RUN AGAIN
--   Every part is idempotent (if not exists / create or replace / on conflict do
--   nothing); applied twice on a scratch database it gives the same schema.
--
-- AFTER APPLYING (read-only)
--   select count(*) from public.island_recovery_state;  -- = count(*) from public.islands
--   select recovery_version, count(*) from public.island_recovery_state group by 1;  -- only 0
--   select count(*) from public.islet_buildings where recovery_instance_id is null;  -- 0
--   select version, name from supabase_migrations.schema_migrations
--    where version between '20261117020000' and '20261117050000' order by version;
-- =============================================================================

begin;

-- >>>>>>>>>>>>>>>>>>>> 20261117020000_structure_recovery.sql >>>>>>>>>>>>>>>>>>>>
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
-- <<<<<<<<<<<<<<<<<<<< end of 20261117020000_structure_recovery.sql <<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>> 20261117025000_legacy_wave_locks.sql >>>>>>>>>>>>>>>>>>>>
-- =============================================================================
-- 20261117025000_legacy_wave_locks.sql
--
-- WHAT IT DOES
--   Aligns the final legacy wave RPCs with recovery-v1 island locks, preserving
--   their signatures and v0 outcomes. Legacy wall RPCs cannot write v1 health.
--
-- SAFE TO RUN AGAIN
--   Replaces only the six final existing functions in place; no rows are changed.
-- =============================================================================

create or replace function public.wave_start(
  p_player_id         uuid,
  p_action_uid        text,
  p_place             text,
  p_island_owner      uuid,
  p_seed              integer,
  p_countdown_seconds integer,
  p_minimum_seconds   integer,
  p_maximum_seconds   integer,
  p_highest_wave      integer,
  p_weather_kind      text,
  p_weather_ships     numeric,
  p_weather_fog       numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_run    public.wave_runs;
  v_next   integer;
  v_repeat boolean := false;
  v_recovery_version smallint := 0;
  v_now timestamptz;
begin
  -- Step 1: the arguments. The table rules check the rest (the weather, the timing).
  if p_player_id is null or p_action_uid is null or p_seed is null or p_seed < 0
     or p_place is null or p_place not in ('island', 'pirate_point')
     or (p_place = 'island') <> (p_island_owner is not null)
     or p_countdown_seconds is null or p_countdown_seconds < 0
     or p_minimum_seconds is null or p_maximum_seconds is null
     or p_highest_wave is null or p_highest_wave < 1 then
    raise exception 'bad_wave';
  end if;

  -- Step 2: one bell at a time per island; the next wave of the place.
  if p_place = 'island' then
    select coalesce(next_wave, wave_best + 1) into v_next
      from public.islands
     where player_id = p_island_owner
       for update;
    if not found then
      return jsonb_build_object('status', 'refused', 'reason', 'no_such_island');
    end if;
    insert into public.island_recovery_state (island_owner)
    values (p_island_owner) on conflict (island_owner) do nothing;
    select recovery_version into v_recovery_version
      from public.island_recovery_state
     where island_owner = p_island_owner
       for update;
  else
    perform pg_advisory_xact_lock(hashtext('public.wave_runs:pirate_point'));
    select coalesce(max(wave), 0) + 1 into v_next
      from public.wave_runs
     where place = 'pirate_point' and flag_counted;
  end if;

  -- Protocol 1 cannot answer any bell on a v1-policy island, including a UID
  -- that already names a protocol-2 reservation.
  v_now := clock_timestamp();
  if p_place = 'island' and v_recovery_version = 1 then
    return jsonb_build_object(
      'status', 'refused', 'reason', 'client_update_required',
      'recoveryVersion', 1, 'waveProtocol', 2
    );
  end if;

  -- Step 3: the same click again is the same legacy wave.
  select * into v_run
    from public.wave_runs
   where started_by = p_player_id and action_uid = p_action_uid;

  if found then
    v_repeat := true;
  else
    -- Step 4: a wave nobody finished is over after its maximum length.
    update public.wave_runs
       set finished_at = v_now, survived = false, ships_sunk = 0, loot = 0, expired = true
     where coalesce(island_owner::text, place) = coalesce(p_island_owner::text, p_place)
       and finished_at is null
       and starts_at + make_interval(secs => maximum_seconds) < v_now;

    -- Step 5: one running wave per island.
    if exists (
      select 1 from public.wave_runs
       where coalesce(island_owner::text, place) = coalesce(p_island_owner::text, p_place)
         and finished_at is null
    ) then
      return jsonb_build_object('status', 'refused', 'reason', 'wave_running');
    end if;

    -- Steps 6 and 7: the next wave, which starts after the countdown.
    insert into public.wave_runs (
      started_by, action_uid, place, island_owner, wave, seed, starts_at,
      minimum_seconds, maximum_seconds, weather_kind, weather_ships, weather_fog
    )
    values (
      p_player_id, p_action_uid, p_place, p_island_owner,
      least(greatest(v_next, 1), p_highest_wave),
      p_seed, date_trunc('second', v_now) + make_interval(secs => p_countdown_seconds),
      p_minimum_seconds, p_maximum_seconds, p_weather_kind, p_weather_ships, p_weather_fog
    )
    returning * into v_run;
  end if;

  -- Step 8: the bell-ringer is the first participant.
  insert into public.wave_participants (wave_id, player_id)
  values (v_run.id, p_player_id)
  on conflict (wave_id, player_id) do nothing;

  return jsonb_build_object(
    'status', 'started', 'waveId', v_run.id, 'wave', v_run.wave, 'seed', v_run.seed,
    'startsAt', v_run.starts_at, 'weatherKind', v_run.weather_kind,
    'ships', v_run.weather_ships, 'fog', v_run.weather_fog, 'place', v_run.place,
    'repeat', v_repeat
  );
end;
$$;
comment on function public.wave_start(uuid, text, text, uuid, integer, integer, integer, integer, integer, text, numeric, numeric) is
  'Starts or repeats a legacy protocol-1 wave under island then recovery-state locks. A new-policy island refuses with client_update_required. Existing legacy success, timing and retry answers are retained. Only service_role may run it.';

create or replace function public.wave_join(
  p_player_id uuid,
  p_wave_id   uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_run    public.wave_runs;
  v_repeat boolean := false;
  v_owner uuid;
  v_place text;
  v_now timestamptz;
begin
  if p_player_id is null or p_wave_id is null then
    raise exception 'bad_wave_join';
  end if;

  -- Discover ownership first; the lock order is island, policy state, wave.
  select island_owner, place into v_owner, v_place
    from public.wave_runs where id = p_wave_id;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_wave');
  end if;
  if v_place = 'island' then
    perform player_id from public.islands
     where player_id = v_owner for update;
    if not found then
      return jsonb_build_object('status', 'refused', 'reason', 'no_such_wave');
    end if;
    insert into public.island_recovery_state (island_owner)
    values (v_owner) on conflict (island_owner) do nothing;
    perform island_owner from public.island_recovery_state
     where island_owner = v_owner for update;
  end if;
  select * into v_run from public.wave_runs where id = p_wave_id for update;
  if not found or v_run.island_owner is distinct from v_owner or v_run.place <> v_place then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_wave');
  end if;
  v_now := clock_timestamp();
  if exists (select 1 from public.recovery_wave_states where wave_id = p_wave_id) then
    return jsonb_build_object(
      'status', 'refused', 'reason', 'client_update_required',
      'recoveryVersion', 1, 'waveProtocol', 2
    );
  end if;

  if exists (
    select 1 from public.wave_participants
     where wave_id = p_wave_id and player_id = p_player_id
  ) then
    v_repeat := true;
  elsif v_run.finished_at is not null
     or v_now > v_run.starts_at + make_interval(secs => v_run.maximum_seconds) then
    return jsonb_build_object('status', 'refused', 'reason', 'wave_over');
  elsif not exists (select 1 from public.profiles where id = p_player_id) then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  else
    insert into public.wave_participants (wave_id, player_id)
    values (p_wave_id, p_player_id);
  end if;

  return jsonb_build_object(
    'status', 'joined', 'waveId', v_run.id, 'wave', v_run.wave, 'seed', v_run.seed,
    'startsAt', v_run.starts_at, 'weatherKind', v_run.weather_kind,
    'ships', v_run.weather_ships, 'fog', v_run.weather_fog, 'place', v_run.place,
    'repeat', v_repeat
  );
end;
$$;
comment on function public.wave_join(uuid, uuid) is
  'Joins or repeats a legacy wave after island, recovery-state and wave locks. A protocol-2 recovery wave refuses with client_update_required; frozen legacy waves keep the original membership behavior. Only service_role may run it.';

create or replace function public.wave_finish(
  p_player_id       uuid,
  p_wave_id         uuid,
  p_survived        boolean,
  p_ships_sunk      integer,
  p_loot_base       integer,
  p_loot_per_wave   integer,
  p_loot_per_house  integer,
  p_point_loot_base integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_run     public.wave_runs;
  v_part    public.wave_participants;
  v_houses  integer := 0;
  v_base    integer;
  v_loot    integer := 0;
  v_balance bigint;
  v_repeat  boolean := false;
  v_best    integer;
  v_flags   integer;
  v_owner        uuid;
  v_place        text;
  v_locked_owner uuid;
  v_locked_place text;
  v_now          timestamptz;
begin
  -- Step 1: the arguments.
  if p_player_id is null or p_wave_id is null or p_survived is null
     or p_ships_sunk is null or p_ships_sunk < 0 or p_ships_sunk > 1000
     or p_loot_base is null or p_loot_base < 0
     or p_loot_per_wave is null or p_loot_per_wave < 0
     or p_loot_per_house is null or p_loot_per_house < 0
     or p_point_loot_base is null or p_point_loot_base < 0 then
    raise exception 'bad_wave_finish';
  end if;

  -- Step 2: the wallet first, then the wave, then the player's own row.
  -- Discover the immutable owner/place before locking; revalidate after the wave lock.
  select island_owner, place into v_owner, v_place
    from public.wave_runs where id = p_wave_id;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_wave');
  end if;

  -- Canonical order: payer wallet, all changed islands, recovery state, wave.
  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;
  perform player_id from public.islands
   where player_id = p_player_id or (v_place = 'island' and player_id = v_owner)
   order by player_id for update;
  select island_owner, place into v_locked_owner, v_locked_place
    from public.wave_runs where id = p_wave_id;
  if v_locked_owner is distinct from v_owner or v_locked_place is distinct from v_place then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_wave');
  end if;
  insert into public.island_recovery_state (island_owner)
  select player_id from public.islands
   where player_id = p_player_id or (v_place = 'island' and player_id = v_owner)
   order by player_id
  on conflict (island_owner) do nothing;
  perform island_owner from public.island_recovery_state
   where island_owner = p_player_id or (v_place = 'island' and island_owner = v_owner)
   order by island_owner for update;

  select * into v_run from public.wave_runs where id = p_wave_id for update;
  if not found or v_run.island_owner is distinct from v_owner or v_run.place <> v_place then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_wave');
  end if;
  if exists (select 1 from public.recovery_wave_states where wave_id = p_wave_id) then
    return jsonb_build_object(
      'status', 'refused', 'reason', 'client_update_required',
      'recoveryVersion', 1, 'waveProtocol', 2
    );
  end if;
  v_now := clock_timestamp();

  -- Step 3: only a participant.
  select * into v_part
    from public.wave_participants
   where wave_id = p_wave_id and player_id = p_player_id
     for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'not_in_wave');
  end if;

  if v_part.finished_at is not null then
    -- Step 4: finished already; the stored result stands.
    v_repeat := true;
  elsif v_now < v_run.starts_at + make_interval(secs => v_run.minimum_seconds) then
    -- Step 5: too early. Nothing changes; the wave keeps running.
    return jsonb_build_object(
      'status', 'refused', 'reason', 'too_early',
      'waitSeconds', greatest(1, ceil(extract(epoch from
        v_run.starts_at + make_interval(secs => v_run.minimum_seconds) - v_now))::integer)
    );
  elsif v_now > v_run.starts_at + make_interval(secs => v_run.maximum_seconds) then
    -- Step 6: too late. This player gets nothing; an open wave run is closed.
    update public.wave_participants
       set finished_at = v_now, survived = false, ships_sunk = 0, loot = 0, expired = true
     where wave_id = p_wave_id and player_id = p_player_id
    returning * into v_part;
    update public.wave_runs
       set finished_at = v_now, survived = false, ships_sunk = 0, loot = 0, expired = true
     where id = v_run.id and finished_at is null;
  else
    -- Step 7: this player's loot, capped by the wave number and the houses.
    if p_survived then
      if v_run.place = 'island' then
        v_base := p_loot_base;
        select count(*) into v_houses
          from public.islet_buildings
         where player_id = v_run.island_owner and building_type = 'house';
      else
        v_base := p_point_loot_base;
      end if;
      v_loot := v_base + p_loot_per_wave * v_run.wave + p_loot_per_house * v_houses;
    end if;

    update public.wave_participants
       set finished_at = v_now, survived = p_survived, ships_sunk = p_ships_sunk, loot = v_loot
     where wave_id = p_wave_id and player_id = p_player_id
    returning * into v_part;

    -- The first finish closes the wave run: no new joins, the next bell may ring.
    if v_run.finished_at is null then
      update public.wave_runs
         set finished_at = v_now, survived = p_survived, ships_sunk = p_ships_sunk, loot = v_loot
       where id = v_run.id;
    end if;

    -- One best wave and one flag per wave, at the first survived finish.
    if p_survived and not v_run.flag_counted then
      update public.wave_runs set flag_counted = true where id = v_run.id;
      if v_run.place = 'island' then
        update public.islands
           set wave_best = greatest(wave_best, v_run.wave), flags = flags + 1
         where player_id = v_run.island_owner;
      end if;
    end if;

    if v_loot > 0 then
      v_balance := public.apply_wallet_transaction(
        p_player_id, v_loot, 'pirate_loot',
        'wave:' || v_run.id::text || ':' || p_player_id::text
      );
    end if;
  end if;

  -- The best wave and the flags of the place of the wave.
  if v_run.place = 'island' then
    select wave_best, flags into v_best, v_flags
      from public.islands
     where player_id = v_run.island_owner;
  else
    select coalesce(max(wave), 0), count(*) into v_best, v_flags
      from public.wave_runs
     where place = 'pirate_point' and flag_counted;
  end if;

  return jsonb_build_object(
    'status', 'done', 'loot', v_part.loot, 'balance', v_balance, 'survived', v_part.survived,
    'wave', v_run.wave, 'waveBest', v_best, 'flags', v_flags,
    'expired', v_part.expired, 'repeat', v_repeat
  );
end;
$$;
comment on function public.wave_finish(uuid, uuid, boolean, integer, integer, integer, integer, integer) is
  'Finishes one participant in a frozen legacy wave. Locks the payer wallet, changed island and recovery-state rows in UUID order, then the wave and participant. Protocol-2 waves return client_update_required; legacy timing, loot, flags, restart and idempotent result behavior remain. Only service_role may run it.';

create or replace function public.wave_finish(
  p_player_id         uuid,
  p_wave_id           uuid,
  p_survived          boolean,
  p_ships_sunk        integer,
  p_loot_base         integer,
  p_loot_per_wave     integer,
  p_loot_per_house    integer,
  p_point_loot_base   integer,
  p_boss_every        integer,
  p_boss_multiplier   integer,
  p_restart_back      integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_run     public.wave_runs;
  v_part    public.wave_participants;
  v_houses  integer := 0;
  v_base    integer;
  v_loot    integer := 0;
  v_balance bigint;
  v_repeat  boolean := false;
  v_best    integer;
  v_flags   integer;
  v_boss    boolean;
  v_owner        uuid;
  v_place        text;
  v_locked_owner uuid;
  v_locked_place text;
  v_now          timestamptz;
begin
  -- Step 1: the arguments.
  if p_player_id is null or p_wave_id is null or p_survived is null
     or p_ships_sunk is null or p_ships_sunk < 0 or p_ships_sunk > 1000
     or p_loot_base is null or p_loot_base < 0
     or p_loot_per_wave is null or p_loot_per_wave < 0
     or p_loot_per_house is null or p_loot_per_house < 0
     or p_point_loot_base is null or p_point_loot_base < 0
     or p_boss_every is null or p_boss_every < 0
     or p_boss_multiplier is null or p_boss_multiplier not between 1 and 10
     or p_restart_back is null or p_restart_back < 0 then
    raise exception 'bad_wave_finish';
  end if;

  -- Step 2: the wallet first, then the wave, then the player's own row.
  -- Discover the immutable owner/place before locking; revalidate after the wave lock.
  select island_owner, place into v_owner, v_place
    from public.wave_runs where id = p_wave_id;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_wave');
  end if;

  -- Canonical order: payer wallet, all changed islands, recovery state, wave.
  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;
  perform player_id from public.islands
   where player_id = p_player_id or (v_place = 'island' and player_id = v_owner)
   order by player_id for update;
  select island_owner, place into v_locked_owner, v_locked_place
    from public.wave_runs where id = p_wave_id;
  if v_locked_owner is distinct from v_owner or v_locked_place is distinct from v_place then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_wave');
  end if;
  insert into public.island_recovery_state (island_owner)
  select player_id from public.islands
   where player_id = p_player_id or (v_place = 'island' and player_id = v_owner)
   order by player_id
  on conflict (island_owner) do nothing;
  perform island_owner from public.island_recovery_state
   where island_owner = p_player_id or (v_place = 'island' and island_owner = v_owner)
   order by island_owner for update;

  select * into v_run from public.wave_runs where id = p_wave_id for update;
  if not found or v_run.island_owner is distinct from v_owner or v_run.place <> v_place then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_wave');
  end if;
  if exists (select 1 from public.recovery_wave_states where wave_id = p_wave_id) then
    return jsonb_build_object(
      'status', 'refused', 'reason', 'client_update_required',
      'recoveryVersion', 1, 'waveProtocol', 2
    );
  end if;
  v_now := clock_timestamp();
  v_boss := p_boss_every > 0 and v_run.wave % p_boss_every = 0;

  -- Step 3: only a participant.
  select * into v_part
    from public.wave_participants
   where wave_id = p_wave_id and player_id = p_player_id
     for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'not_in_wave');
  end if;

  if v_part.finished_at is not null then
    -- Step 4: finished already; the stored result stands.
    v_repeat := true;
  elsif v_now < v_run.starts_at + make_interval(secs => v_run.minimum_seconds) then
    -- Step 5: too early. Nothing changes; the wave keeps running.
    return jsonb_build_object(
      'status', 'refused', 'reason', 'too_early',
      'waitSeconds', greatest(1, ceil(extract(epoch from
        v_run.starts_at + make_interval(secs => v_run.minimum_seconds) - v_now))::integer)
    );
  elsif v_now > v_run.starts_at + make_interval(secs => v_run.maximum_seconds) then
    -- Step 6: too late. This player gets nothing; an open wave run is closed.
    update public.wave_participants
       set finished_at = v_now, survived = false, ships_sunk = 0, loot = 0, expired = true
     where wave_id = p_wave_id and player_id = p_player_id
    returning * into v_part;
    update public.wave_runs
       set finished_at = v_now, survived = false, ships_sunk = 0, loot = 0, expired = true
     where id = v_run.id and finished_at is null;
  else
    -- Step 7: this player's loot.
    if p_survived then
      if v_run.place = 'island' then
        v_base := p_loot_base;
        select coalesce(sum(level), 0) into v_houses
          from public.islet_buildings
         where player_id = v_run.island_owner and building_type = 'house';
      else
        v_base := p_point_loot_base;
      end if;
      v_loot := v_base + p_loot_per_wave * v_run.wave + p_loot_per_house * v_houses;
      if v_boss then
        v_loot := v_loot * p_boss_multiplier;
      end if;
    end if;

    update public.wave_participants
       set finished_at = v_now, survived = p_survived, ships_sunk = p_ships_sunk, loot = v_loot
     where wave_id = p_wave_id and player_id = p_player_id
    returning * into v_part;

    -- The restart rule: a loss that closes the wave before anyone won it.
    if not p_survived and v_run.finished_at is null and not v_run.flag_counted
       and v_run.place = 'island' then
      update public.islands
         set next_wave = greatest(1, wave_best - p_restart_back)
       where player_id = v_run.island_owner;
    end if;

    -- The first finish closes the wave run: no new joins, the next bell may ring.
    if v_run.finished_at is null then
      update public.wave_runs
         set finished_at = v_now, survived = p_survived, ships_sunk = p_ships_sunk, loot = v_loot
       where id = v_run.id;
    end if;

    -- One best wave and one flag per wave, at the first survived finish; a win
    -- also sets the next wave of the run.
    if p_survived and not v_run.flag_counted then
      update public.wave_runs set flag_counted = true where id = v_run.id;
      if v_run.place = 'island' then
        update public.islands
           set wave_best = greatest(wave_best, v_run.wave), flags = flags + 1,
               next_wave = v_run.wave + 1
         where player_id = v_run.island_owner;
      end if;
    end if;

    -- The player's own best won wave, anywhere, for the unlocks.
    if p_survived then
      update public.islands
         set won_wave_best = greatest(won_wave_best, v_run.wave)
       where player_id = p_player_id and won_wave_best < v_run.wave;
    end if;

    if v_loot > 0 then
      v_balance := public.apply_wallet_transaction(
        p_player_id, v_loot, 'pirate_loot',
        'wave:' || v_run.id::text || ':' || p_player_id::text
      );
    end if;
  end if;

  -- The best wave and the flags of the place of the wave.
  if v_run.place = 'island' then
    select wave_best, flags into v_best, v_flags
      from public.islands
     where player_id = v_run.island_owner;
  else
    select coalesce(max(wave), 0), count(*) into v_best, v_flags
      from public.wave_runs
     where place = 'pirate_point' and flag_counted;
  end if;

  return jsonb_build_object(
    'status', 'done', 'loot', v_part.loot, 'balance', v_balance, 'survived', v_part.survived,
    'wave', v_run.wave, 'waveBest', v_best, 'flags', v_flags,
    'expired', v_part.expired, 'repeat', v_repeat, 'boss', v_boss
  );
end;
$$;
comment on function public.wave_finish(uuid, uuid, boolean, integer, integer, integer, integer, integer, integer, integer, integer) is
  'Finishes one participant in a frozen legacy tower-defense wave. Locks the payer wallet, changed island and recovery-state rows in UUID order, then the wave and participant. Protocol-2 waves return client_update_required; legacy timing, loot, boss, flags, restart and idempotent result behavior remain. Only service_role may run it.';

create or replace function public.island_walls_record(
  p_player_id uuid,
  p_wave_id   uuid,
  p_walls     jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner       uuid;
  v_starts_at   timestamptz;
  v_inserted    integer;
  v_now         timestamptz;
  v_policy      smallint;
  v_wave_owner  uuid;
  v_wave_place  text;
  v_wave_start  timestamptz;
begin
  if p_player_id is null or p_wave_id is null or p_walls is null
     or jsonb_typeof(p_walls) <> 'object'
     or exists (
       select 1 from jsonb_each(p_walls) entry
        where jsonb_typeof(entry.value) <> 'number'
           or entry.value::text !~ '^[0-9]{1,3}$'
           or entry.value::text::integer > 100
     ) then
    raise exception 'bad_walls';
  end if;

  select island_owner, place, starts_at
    into v_wave_owner, v_wave_place, v_wave_start
    from public.wave_runs where id = p_wave_id;
  if v_wave_owner is null or v_wave_place <> 'island' then
    return jsonb_build_object('status', 'skipped');
  end if;
  perform player_id from public.islands
   where player_id = v_wave_owner for update;
  if not found then
    return jsonb_build_object('status', 'skipped');
  end if;
  insert into public.island_recovery_state (island_owner)
  values (v_wave_owner) on conflict (island_owner) do nothing;
  select recovery_version into v_policy
    from public.island_recovery_state
   where island_owner = v_wave_owner for update;
  v_now := clock_timestamp();

  select island_owner, place, starts_at
    into v_owner, v_wave_place, v_starts_at
    from public.wave_runs where id = p_wave_id for update;
  if v_owner is distinct from v_wave_owner or v_wave_place <> 'island'
     or v_starts_at is distinct from v_wave_start then
    return jsonb_build_object('status', 'skipped');
  end if;
  if v_policy = 1 or exists (
    select 1 from public.recovery_wave_states where wave_id = p_wave_id
  ) then
    return jsonb_build_object('status', 'skipped');
  end if;
  if not exists (
    select 1 from public.wave_participants
     where wave_id = p_wave_id and player_id = p_player_id
  ) then
    return jsonb_build_object('status', 'skipped');
  end if;

  -- Stable row-lock order also makes a multi-wall report safe beside repairs.
  perform building.plot
    from public.islet_buildings building
   where building.player_id = v_owner
     and building.building_type = 'wall'
     and building.plot in (select key from jsonb_each(p_walls))
   order by building.plot
     for update;

  insert into public.island_wall_records (wave_id, island_owner, recorded_by)
  values (p_wave_id, v_owner, p_player_id)
  on conflict (wave_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return jsonb_build_object('status', 'repeat');
  end if;

  update public.islet_buildings building
     set wall_health = entry.value::text::smallint,
         wall_damaged_at = case when entry.value::text::integer < 100 then v_now end
    from jsonb_each(p_walls) entry
   where building.player_id = v_owner
     and building.plot = entry.key
     and building.building_type = 'wall'
     and (building.wall_restored_at is null or building.wall_restored_at < v_starts_at);

  return jsonb_build_object('status', 'recorded');
end;
$$;
comment on function public.island_walls_record(uuid, uuid, jsonb) is
  'Records a legacy island wave wall report once after owner, recovery-state, wave and sorted wall locks. It skips all recovery-v1 writes and keeps the existing delayed-restore timestamp fence. Only service_role may run it.';

create or replace function public.island_wall_restore(
  p_player_id       uuid,
  p_island_owner    uuid,
  p_plot            text,
  p_action_uid      text,
  p_full_price      integer,
  p_recover_seconds integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ref      text;
  v_balance  bigint;
  v_building public.islet_buildings;
  v_price    integer;
  v_policy   smallint;
  v_now      timestamptz;
begin
  if p_player_id is null or p_island_owner is null or p_plot is null
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_full_price is null or p_full_price < 1
     or p_recover_seconds is null or p_recover_seconds < 1 then
    raise exception 'bad_restore';
  end if;
  v_ref := 'wallfix:' || p_action_uid;

  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  if exists (
    select 1 from public.wallet_transactions
     where player_id = p_player_id and reason = 'building_purchase' and ref = v_ref
  ) then
    return jsonb_build_object('status', 'done', 'balance', v_balance, 'price', 0, 'repeat', true);
  end if;

  perform player_id from public.islands where player_id = p_island_owner for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'not_built');
  end if;
  insert into public.island_recovery_state (island_owner)
  values (p_island_owner) on conflict (island_owner) do nothing;
  select recovery_version into v_policy
    from public.island_recovery_state
   where island_owner = p_island_owner for update;
  v_now := clock_timestamp();
  if v_policy = 1 then
    return jsonb_build_object(
      'status', 'refused', 'reason', 'client_update_required',
      'recoveryVersion', 1, 'waveProtocol', 2
    );
  end if;

  select * into v_building
    from public.islet_buildings
   where player_id = p_island_owner and plot = p_plot
     for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'not_built');
  end if;
  if v_building.building_type <> 'wall' then
    return jsonb_build_object('status', 'refused', 'reason', 'wrong_kind');
  end if;
  if exists (
    select 1 from public.wave_runs
     where island_owner = p_island_owner and finished_at is null
       and starts_at + make_interval(secs => maximum_seconds) >= v_now
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'wave_running');
  end if;
  if v_building.wall_health >= 100
     or (v_building.wall_damaged_at is not null
         and v_building.wall_damaged_at + make_interval(secs => p_recover_seconds) <= v_now) then
    return jsonb_build_object('status', 'refused', 'reason', 'intact');
  end if;

  v_price := greatest(1, ceil(p_full_price * (100 - v_building.wall_health) / 100.0)::integer);
  if v_balance < v_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', v_price);
  end if;

  v_balance := public.apply_wallet_transaction(p_player_id, -v_price, 'building_purchase', v_ref);
  update public.islet_buildings
     set wall_health = 100,
         wall_damaged_at = null,
         wall_restored_at = v_now
   where player_id = p_island_owner and plot = p_plot;

  return jsonb_build_object('status', 'done', 'balance', v_balance, 'price', v_price, 'repeat', false);
end;
$$;


comment on function public.island_wall_restore(uuid, uuid, text, text, integer, integer) is
  'Repairs a legacy wall between waves after locking the payer wallet, owner island and recovery-state row before the wall. Recovery-v1 policy returns client_update_required without writing legacy wall health; v0 price, timer, timestamp fence and retries remain. Only service_role may run it.';
-- <<<<<<<<<<<<<<<<<<<< end of 20261117025000_legacy_wave_locks.sql <<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>> 20261117030000_paid_structure_repair.sql >>>>>>>>>>>>>>>>>>>>
-- =============================================================================
-- 20261117030000_paid_structure_repair.sql
--
-- WHAT IT DOES
--   Adds one atomic paid Repair now transaction for walls and the five tower
--   kinds. It commits the caller's wallet debit, full normalized HP, immutable
--   receipt, reserved-wave event and shared quota together.
--
-- SAFE TO RUN AGAIN
--   Replaces the same service-only function and grants. It does not add a wallet
--   reason, edit building contribution rows, activate recovery, or change data.
-- =============================================================================

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
     or p_spot !~ '^(wall_([1-9]|1[0-2])|cannon_([1-9]|1[01])|tower_1)$'
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
-- <<<<<<<<<<<<<<<<<<<< end of 20261117030000_paid_structure_repair.sql <<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>> 20261117040000_structure_recovery_api.sql >>>>>>>>>>>>>>>>>>>>
-- Protocol-2 journal and complete replay checkpoint transport.
-- This migration is additive; the legacy wave functions are intentionally untouched.
alter table public.recovery_wave_events
  add column if not exists actor_counter bigint,
  add column if not exists requested_tick integer;

comment on column public.recovery_wave_events.actor_counter is
  'Actor-local monotonic input counter, distinct from global serverSeq. Null on server-authored events.';
comment on column public.recovery_wave_events.requested_tick is
  'Client-requested input tick retained privately for stable retry fingerprints; accepted effective_tick is server-clamped.';

grant update (last_actor_counter)
  on table public.recovery_wave_participants to service_role;

-- Keep retry fingerprints immutable when account deletion anonymizes event actors.
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
     and new.actor_counter is not distinct from old.actor_counter
     and new.requested_tick is not distinct from old.requested_tick
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
  'Rejects journal mutation except clearing the private actor ID after profile deletion; token, UID/counter/tick fingerprint and replay payload remain immutable.';

create or replace function public.recovery_wave_inputs(
  p_player_id uuid,
  p_wave_id uuid,
  p_inputs jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_island_state public.island_recovery_state;
  v_wave public.recovery_wave_states;
  v_run public.wave_runs;
  v_participant public.recovery_wave_participants;
  v_owner uuid;
  v_now timestamptz;
  v_tick integer;
  v_effective integer;
  v_head bigint;
  v_counter bigint;
  v_expected bigint;
  v_uid text;
  v_command jsonb;
  v_captain jsonb;
  v_payload jsonb;
  v_kind text;
  v_requested_tick integer;
  v_existing public.recovery_wave_events;
  v_event public.recovery_wave_events;
  v_new jsonb := '[]'::jsonb;
  v_all jsonb := '[]'::jsonb;
  v_pending jsonb := '[]'::jsonb;
  v_item jsonb;
  v_existing_count integer := 0;
  v_is_repeat boolean;
begin
  if p_player_id is null or p_wave_id is null or jsonb_typeof(p_inputs) is distinct from 'array'
     or jsonb_array_length(p_inputs) not between 1 and 32 then
    raise exception 'bad_recovery_inputs';
  end if;
  if octet_length(p_inputs::text) > 16384 then
    raise exception 'recovery_inputs_too_large';
  end if;
  if exists (select 1 from jsonb_array_elements(p_inputs) as input_row(value)
      group by input_row.value ->> 'inputUid' having count(*) > 1) then
    raise exception 'bad_recovery_input';
  end if;

  select island_owner into v_owner from public.recovery_wave_states where wave_id = p_wave_id;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_wave');
  end if;
  -- Progression is read from both the defended island and the sender's own
  -- island. Lock both in UUID order before taking wave/participant locks.
  perform 1 from public.islands
   where player_id = p_player_id or player_id = v_owner
   order by player_id for update;
  select * into v_island_state from public.island_recovery_state
   where island_owner=v_owner for update;
  if not found or v_island_state.current_wave_id is distinct from p_wave_id then
    return jsonb_build_object('status','refused','reason','wave_over');
  end if;
  select * into v_wave from public.recovery_wave_states where wave_id = p_wave_id for update;
  select * into v_run from public.wave_runs where id = p_wave_id for update;
  if not found or v_wave.wave_protocol <> 2 or v_wave.recovery_version <> 1 then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_wave');
  end if;
  select * into v_participant from public.recovery_wave_participants
   where wave_id = p_wave_id and player_id = p_player_id for update;
  if not found or not exists (
    select 1 from public.wave_participants
     where wave_id = p_wave_id and player_id = p_player_id and finished_at is null
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'not_in_wave');
  end if;
  if v_wave.closed_at is not null or v_wave.reset_epoch is distinct from (
    select reset_epoch from public.island_recovery_state where island_owner = v_owner
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'wave_over');
  end if;

  v_now := clock_timestamp();
  if v_run.starts_at + make_interval(secs => v_run.maximum_seconds) <= v_now then
    return jsonb_build_object('status', 'refused', 'reason', 'wave_over');
  end if;
  v_tick := greatest(0, floor(extract(epoch from (v_now - v_run.starts_at)) * 20)::integer);
  v_counter := v_participant.last_actor_counter;
  v_head := v_wave.journal_head;

  select jsonb_build_object(
    'level', captain_level,
    'skills', case when v_wave.recovery_version = 1 then
       array(select skill from unnest(captain_skills ||
              case when captain_role is null then '{}'::text[] else array[captain_role] end) as skill
              where skill <> all(array['quick_fix','long_reach','sturdy_planks','master_shipwright','swift_hammer','wide_arc','grand_engineer']::text[]))
       else captain_skills end,
    'weapon', weapon_equipped
  ) into v_captain from public.islands where player_id = p_player_id;
  if v_captain is null then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  -- Validate every command and its retry identity before writing anything.
  for v_item in select value from jsonb_array_elements(p_inputs)
  loop
    v_uid := v_item ->> 'inputUid';
    v_expected := nullif(v_item ->> 'actorCounter', '')::bigint;
    v_requested_tick := nullif(v_item ->> 'tick', '')::integer;
    v_command := v_item -> 'command';
    v_kind := v_command ->> 'type';
    if v_uid is null or v_uid !~ '^[A-Za-z0-9_-]{8,64}$'
       or v_expected is null or v_expected < 1 or jsonb_typeof(v_command) is distinct from 'object'
       or jsonb_typeof(v_item -> 'tick') is distinct from 'number'
       or v_requested_tick not between 0 and 18000
       or v_kind not in ('fire','lamps_lit','captain_shot','captain_strike','captain_move','captain_revive','finisher_ready','finisher_input')
       or v_kind is null or v_command ?| array['by','level','skills','weapon'] then
      raise exception 'bad_recovery_input';
    end if;
    select * into v_existing from public.recovery_wave_events
     where wave_id = p_wave_id and participant_token = v_participant.participant_token
       and input_uid = v_uid;
    if found then
      if v_existing.actor_counter is distinct from v_expected
         or v_existing.requested_tick is distinct from v_requested_tick
         or v_existing.payload -> 'command' is distinct from v_command then
        return jsonb_build_object('status', 'refused', 'reason', 'input_conflict');
      end if;
      v_all := v_all || jsonb_build_array(jsonb_build_object(
        'serverSeq', v_existing.seq, 'effectiveTick', v_existing.effective_tick,
        'type', v_existing.event_kind, 'participantToken', v_existing.participant_token,
        'payload', v_existing.payload));
      v_existing_count := v_existing_count + 1;
      continue;
    end if;
    if v_expected <> v_counter + 1 then
      return jsonb_build_object('status', 'refused', 'reason', 'counter_gap');
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_inputs) as later(value)
       where later.value ->> 'actorCounter' = v_expected::text
         and later.value ->> 'inputUid' <> v_uid
    ) then
      raise exception 'bad_recovery_input';
    end if;
    if v_now < v_run.starts_at and v_kind not in ('captain_move') then
      return jsonb_build_object('status', 'refused', 'reason', 'command_before_start');
    end if;
    if v_run.place = 'island' and v_kind = 'lamps_lit' then
      return jsonb_build_object('status', 'refused', 'reason', 'bad_recovery_input');
    end if;
    v_counter := v_expected;
    v_effective := case when v_now < v_run.starts_at then 0
      else greatest(v_requested_tick, v_tick + 5, v_wave.sealed_through_tick + 1, 0) end;
    v_payload := jsonb_build_object(
      'inputUid', v_uid, 'actorCounter', v_expected,
      'participantToken', v_participant.participant_token,
      'command', v_command, 'captain', v_captain
    );
    v_pending := v_pending || jsonb_build_array(jsonb_build_object(
      'effectiveTick', v_effective, 'inputUid', v_uid, 'actorCounter', v_expected,
      'tick', v_requested_tick,
      'payload', v_payload));
  end loop;

  for v_item in select value from jsonb_array_elements(v_pending)
  loop
    v_head := v_head + 1;
    insert into public.recovery_wave_events
      (wave_id, seq, actor_id, participant_token, input_uid, actor_counter,requested_tick,
       event_kind, effective_tick, payload)
    values
      (p_wave_id, v_head, p_player_id, v_participant.participant_token,
       v_item ->> 'inputUid', (v_item ->> 'actorCounter')::bigint,
       (v_item ->> 'tick')::integer,
       'captain_input', (v_item ->> 'effectiveTick')::integer, v_item -> 'payload')
    returning * into v_event;
    v_new := v_new || jsonb_build_array(jsonb_build_object(
      'serverSeq', v_event.seq, 'effectiveTick', v_event.effective_tick,
      'type', v_event.event_kind, 'participantToken', v_event.participant_token,
      'payload', v_event.payload));
  end loop;
  update public.recovery_wave_participants set last_actor_counter = v_counter
   where wave_id = p_wave_id and player_id = p_player_id;
  update public.recovery_wave_states set journal_head = v_head
   where wave_id = p_wave_id;
  return jsonb_build_object('status', 'accepted', 'accepted', v_all || v_new, 'headSeq', v_head,
                            'repeat', jsonb_array_length(v_pending) = 0);
end;
$$;

drop function if exists public.recovery_wave_events_page(uuid,uuid,bigint,bigint);

create or replace function public.recovery_wave_events_page(
  p_player_id uuid,
  p_wave_id uuid,
  p_after bigint,
  p_through bigint default null,
  p_sealed_through_tick integer default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_island_state public.island_recovery_state;
  v_wave public.recovery_wave_states;
  v_run public.wave_runs;
  v_owner uuid;
  v_now timestamptz;
  v_head bigint;
  v_sealed integer;
  v_through bigint;
  v_page jsonb;
begin
  if p_player_id is null or p_wave_id is null or p_after is null or p_after < 0
     or (p_through is not null and p_through < 0)
     or (p_sealed_through_tick is not null and p_sealed_through_tick < -1)
     or ((p_through is null) <> (p_sealed_through_tick is null)) then
    raise exception 'bad_recovery_page';
  end if;
  select island_owner into v_owner from public.recovery_wave_states where wave_id = p_wave_id;
  if not found then return jsonb_build_object('status','refused','reason','no_such_wave'); end if;
  perform 1 from public.islands where player_id = v_owner order by player_id for update;
  select * into v_island_state from public.island_recovery_state
   where island_owner=v_owner for update;
  select * into v_wave from public.recovery_wave_states where wave_id = p_wave_id for update;
  if not exists (
    select 1 from public.recovery_wave_participants
     where wave_id=p_wave_id and player_id=p_player_id
  ) or not exists (
    select 1 from public.wave_participants where wave_id=p_wave_id and player_id=p_player_id
  ) then return jsonb_build_object('status','refused','reason','not_in_wave'); end if;
  if v_wave.wave_protocol <> 2 then
    return jsonb_build_object('status','refused','reason','client_update_required');
  end if;
  v_now := clock_timestamp();
  if p_through is null then
    select * into v_run from public.wave_runs where id=p_wave_id;
    v_head := v_wave.journal_head;
    if p_after > v_head then
      return jsonb_build_object('status','refused','reason','bad_recovery_page');
    end if;
    v_sealed := case when v_now < v_run.starts_at then -1 else
      greatest(v_wave.sealed_through_tick, floor(extract(epoch from (v_now - v_run.starts_at)) * 20)::integer - 1) end;
    update public.recovery_wave_states set sealed_through_tick = greatest(sealed_through_tick, v_sealed)
     where wave_id=p_wave_id returning sealed_through_tick into v_sealed;
    v_through := v_head;
  else
    if p_through > v_wave.journal_head or p_sealed_through_tick > v_wave.sealed_through_tick then
      return jsonb_build_object('status','refused','reason','page_watermark_invalid');
    end if;
    if exists (select 1 from public.recovery_wave_events
      where wave_id=p_wave_id and seq>p_through
        and effective_tick<=p_sealed_through_tick) then
      return jsonb_build_object('status','refused','reason','page_incomplete');
    end if;
    v_head := p_through;
    v_sealed := p_sealed_through_tick;
    v_through := p_through;
    if p_after > v_through then
      return jsonb_build_object('status','refused','reason','bad_recovery_page');
    end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'serverSeq',seq,'effectiveTick',effective_tick,'type',event_kind,
      'participantToken',participant_token,'payload',payload) order by seq),'[]'::jsonb)
    into v_page from (
      select seq,effective_tick,event_kind,participant_token,payload
        from public.recovery_wave_events
       where wave_id=p_wave_id and seq>p_after and seq<=v_through
       order by seq limit 256
    ) page;
  return jsonb_build_object('status','ok','headSeq',v_head,'sealedThroughTick',v_sealed,
    'through',case when p_through is null then null else v_through end,'events',v_page);
end;
$$;

revoke all on function public.recovery_wave_inputs(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.recovery_wave_inputs(uuid, uuid, jsonb) to service_role;
revoke all on function public.recovery_wave_events_page(uuid, uuid, bigint, bigint, integer) from public, anon, authenticated, service_role;
grant execute on function public.recovery_wave_events_page(uuid, uuid, bigint, bigint, integer) to service_role;

comment on function public.recovery_wave_inputs(uuid, uuid, jsonb) is
  'Atomically validates and appends authenticated protocol-2 Captain commands; actor identity and Captain stats are server-derived, counters and UIDs are idempotent, and the journal assigns global commit order.';
comment on function public.recovery_wave_events_page(uuid, uuid, bigint, bigint, integer) is
  'Returns bounded journal pages under caller-supplied fixed head and seal watermarks; reconnects and concurrent readers can replay any complete prefix without per-participant cursors.';

-- Accepts a complete health vector only for a sealed, replayable journal prefix.
create or replace function public.recovery_wave_report_health_locked(
  p_player_id uuid,
  p_wave_id uuid,
  p_island_epoch uuid,
  p_checkpoint_uid text,
  p_through_tick integer,
  p_input_head_seq bigint,
  p_last_repair_seq bigint,
  p_basis_repair_seq jsonb,
  p_hp_units jsonb,
  p_server_now timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_island_state public.island_recovery_state;
  v_wave public.recovery_wave_states;
  v_history public.recovery_health_checkpoints;
  v_now timestamptz;
  v_instance text;
  v_structure jsonb;
  v_event public.recovery_wave_events;
  v_expected_basis bigint;
  v_expected_repair_counter bigint;
  v_previous_hp integer;
  v_reported_hp integer;
  v_previous_basis bigint;
  v_seen_instances integer := 0;
  v_snapshot_instances integer := 0;
  v_hp_key_count integer := 0;
  v_basis_key_count integer := 0;
  v_repeat boolean := false;
begin
  if p_player_id is null or p_wave_id is null or p_island_epoch is null
     or p_checkpoint_uid is null or p_checkpoint_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_through_tick is null or p_through_tick < 0
     or p_input_head_seq is null or p_input_head_seq < 0
     or p_last_repair_seq is null or p_last_repair_seq < 0
     or p_server_now is null
     or jsonb_typeof(p_basis_repair_seq) is distinct from 'object'
     or jsonb_typeof(p_hp_units) is distinct from 'object' then
    raise exception 'bad_recovery_checkpoint';
  end if;
  select island_owner into v_owner from public.recovery_wave_states where wave_id = p_wave_id;
  if not found then return jsonb_build_object('status','refused','reason','no_such_wave'); end if;
  perform 1 from public.islands where player_id = v_owner order by player_id for update;
  select * into v_island_state from public.island_recovery_state
   where island_owner=v_owner for update;
  select * into v_wave from public.recovery_wave_states where wave_id = p_wave_id for update;
  if not exists (select 1 from public.recovery_wave_participants
                  where wave_id = p_wave_id and player_id = p_player_id) then
    return jsonb_build_object('status','refused','reason','not_in_wave');
  end if;
  select * into v_history from public.recovery_health_checkpoints
   where wave_id = p_wave_id and actor_id = p_player_id and checkpoint_uid = p_checkpoint_uid;
  if found then
    if v_history.reset_epoch is distinct from p_island_epoch
       or v_history.through_tick is distinct from p_through_tick
       or v_history.input_head_seq is distinct from p_input_head_seq
       or v_history.last_repair_seq is distinct from p_last_repair_seq
       or v_history.basis_repair_seq is distinct from p_basis_repair_seq
       or v_history.hp_vector is distinct from p_hp_units then
      return jsonb_build_object('status','refused','reason','checkpoint_divergence');
    end if;
    return jsonb_build_object('status','accepted','accepted',true,'repeated',true,
      'throughTick',v_history.through_tick,'inputHeadSeq',v_history.input_head_seq,
      'lastRepairSeq',v_history.last_repair_seq,'hpUnits',v_history.hp_vector);
  end if;
  if v_wave.closed_at is not null then
    return jsonb_build_object('status','refused','reason','wave_over');
  end if;
  if v_island_state.island_owner is null
     or v_island_state.reset_epoch is distinct from p_island_epoch
     or v_island_state.current_wave_id is distinct from p_wave_id then
    return jsonb_build_object('status','refused','reason','epoch_mismatch');
  end if;
  if v_wave.reset_epoch is distinct from p_island_epoch then
    return jsonb_build_object('status','refused','reason','epoch_mismatch');
  end if;
  if p_through_tick > v_wave.sealed_through_tick
     or p_input_head_seq > v_wave.journal_head then
    return jsonb_build_object('status','refused','reason','health_sync_required');
  end if;
  if exists (
    select 1 from public.recovery_wave_events
     where wave_id = p_wave_id
       and seq > p_input_head_seq
       and effective_tick <= p_through_tick
  ) then
    return jsonb_build_object('status','refused','reason','health_sync_required');
  end if;
  if p_through_tick < coalesce(v_wave.checkpoint_through_tick, -1)
     or (p_through_tick = v_wave.checkpoint_through_tick
         and p_input_head_seq < v_wave.checkpoint_input_head_seq) then
    return jsonb_build_object('status','refused','reason','checkpoint_stale');
  end if;
  if v_wave.checkpoint_through_tick = p_through_tick
     and v_wave.checkpoint_input_head_seq = p_input_head_seq then
    if v_wave.checkpoint_last_repair_seq is distinct from p_last_repair_seq
       or v_wave.checkpoint_basis_repair_seq is distinct from p_basis_repair_seq
       or v_wave.checkpoint_hp is distinct from p_hp_units then
      return jsonb_build_object('status','refused','reason','checkpoint_divergence');
    end if;
    return jsonb_build_object('status','accepted','accepted',true,'repeated',true,
      'throughTick',p_through_tick,'inputHeadSeq',p_input_head_seq,
      'lastRepairSeq',p_last_repair_seq,'hpUnits',p_hp_units);
  end if;

  select count(*) into v_snapshot_instances
    from jsonb_array_elements(v_wave.initial_snapshot -> 'structures') as item(value);
  select count(*) into v_hp_key_count from jsonb_object_keys(p_hp_units);
  select count(*) into v_basis_key_count from jsonb_object_keys(p_basis_repair_seq);
  if v_hp_key_count <> v_snapshot_instances or v_basis_key_count <> v_snapshot_instances then
    return jsonb_build_object('status','refused','reason','checkpoint_divergence');
  end if;
  for v_structure in
    select value from jsonb_array_elements(v_wave.initial_snapshot -> 'structures') as item(value)
  loop
    v_instance := v_structure ->> 'instanceId';
    if v_instance is null or not p_hp_units ? v_instance or not p_basis_repair_seq ? v_instance
       or jsonb_typeof(p_hp_units -> v_instance) is distinct from 'number'
       or jsonb_typeof(p_basis_repair_seq -> v_instance) is distinct from 'number'
       or (p_hp_units ->> v_instance)::numeric not between 0 and 1000000
       or (p_hp_units ->> v_instance)::numeric <> trunc((p_hp_units ->> v_instance)::numeric)
       or (p_basis_repair_seq ->> v_instance)::numeric < 0
       or (p_basis_repair_seq ->> v_instance)::numeric <> trunc((p_basis_repair_seq ->> v_instance)::numeric) then
      return jsonb_build_object('status','refused','reason','checkpoint_divergence');
    end if;
    v_expected_basis := coalesce(nullif(v_structure ->> 'repairSeq','')::bigint,0);
    v_previous_hp := coalesce((v_wave.checkpoint_hp ->> v_instance)::integer,
                              nullif(v_structure ->> 'hpUnits','')::integer);
    v_previous_basis := coalesce((v_wave.checkpoint_basis_repair_seq ->> v_instance)::bigint,
                                 v_expected_basis);
    for v_event in select * from public.recovery_wave_events
      where wave_id=p_wave_id and seq<=p_input_head_seq and effective_tick<=p_through_tick
        and event_kind='structure_repaired' and payload ->> 'instanceId'=v_instance order by seq
    loop
      v_expected_basis := greatest(v_expected_basis, (v_event.payload ->> 'repairSeq')::bigint);
    end loop;
    if (p_basis_repair_seq ->> v_instance)::bigint <> v_expected_basis then
      return jsonb_build_object('status','refused','reason','health_sync_required');
    end if;
    v_reported_hp := (p_hp_units ->> v_instance)::integer;
    if v_reported_hp > v_previous_hp and v_expected_basis <= v_previous_basis then
      return jsonb_build_object('status','refused','reason','checkpoint_divergence');
    end if;
    v_seen_instances := v_seen_instances + 1;
  end loop;
  if v_seen_instances <> v_hp_key_count then
    return jsonb_build_object('status','refused','reason','checkpoint_divergence');
  end if;
  select count(*) into v_expected_repair_counter from public.recovery_wave_events
   where wave_id=p_wave_id and seq<=p_input_head_seq and effective_tick<=p_through_tick
     and event_kind='structure_repaired';
  if p_last_repair_seq <> v_expected_repair_counter then
    return jsonb_build_object('status','refused','reason','health_sync_required');
  end if;

  v_now := p_server_now;
  insert into public.recovery_health_checkpoints
    (wave_id,actor_id,checkpoint_uid,reset_epoch,through_tick,input_head_seq,
     last_repair_seq,basis_repair_seq,hp_vector,accepted_at)
  values (p_wave_id,p_player_id,p_checkpoint_uid,p_island_epoch,p_through_tick,
          p_input_head_seq,p_last_repair_seq,p_basis_repair_seq,p_hp_units,v_now);
  update public.recovery_wave_states
     set checkpoint_actor=p_player_id,checkpoint_uid=p_checkpoint_uid,
         checkpoint_through_tick=p_through_tick,checkpoint_input_head_seq=p_input_head_seq,
         checkpoint_last_repair_seq=p_last_repair_seq,
         checkpoint_basis_repair_seq=p_basis_repair_seq,checkpoint_hp=p_hp_units,
         checkpoint_accepted_at=v_now
   where wave_id=p_wave_id;
  return jsonb_build_object('status','accepted','accepted',true,'repeated',false,
    'throughTick',p_through_tick,'inputHeadSeq',p_input_head_seq,
    'lastRepairSeq',p_last_repair_seq,'hpUnits',p_hp_units);
end;
$$;


create or replace function public.recovery_wave_report_health(
  p_player_id uuid, p_wave_id uuid, p_island_epoch uuid, p_checkpoint_uid text,
  p_through_tick integer, p_input_head_seq bigint, p_last_repair_seq bigint,
  p_basis_repair_seq jsonb, p_hp_units jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_server_now timestamptz;
begin
  select island_owner into v_owner from public.recovery_wave_states where wave_id=p_wave_id;
  if not found then return jsonb_build_object('status','refused','reason','no_such_wave'); end if;
  perform 1 from public.islands where player_id in (v_owner,p_player_id) order by player_id for update;
  v_server_now := clock_timestamp();
  return public.recovery_wave_report_health_locked(p_player_id,p_wave_id,p_island_epoch,
    p_checkpoint_uid,p_through_tick,p_input_head_seq,p_last_repair_seq,
    p_basis_repair_seq,p_hp_units,v_server_now);
end;
$$;

revoke all on function public.recovery_wave_report_health_locked(uuid,uuid,uuid,text,integer,bigint,bigint,jsonb,jsonb,timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.recovery_wave_report_health_locked(uuid,uuid,uuid,text,integer,bigint,bigint,jsonb,jsonb,timestamptz) to service_role;
comment on function public.recovery_wave_report_health_locked(uuid,uuid,uuid,text,integer,bigint,bigint,jsonb,jsonb,timestamptz) is
  'Internal checkpoint validator for callers holding canonical island locks and a single post-lock database timestamp.';

revoke all on function public.recovery_wave_report_health(uuid,uuid,uuid,text,integer,bigint,bigint,jsonb,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.recovery_wave_report_health(uuid,uuid,uuid,text,integer,bigint,bigint,jsonb,jsonb) to service_role;
comment on function public.recovery_wave_report_health(uuid,uuid,uuid,text,integer,bigint,bigint,jsonb,jsonb) is
  'Accepts an immutable complete HP checkpoint only for a sealed journal prefix, requiring the wave reset epoch and each instance repair fence to match; retries are read-only and same-prefix divergence is refused.';

-- Starts a protocol-2 wave only for an admitted island policy, preserving frozen v1 policy after flag-off.
create or replace function public.recovery_wave_start(
  p_player_id uuid, p_action_uid text, p_place text, p_island_owner uuid,
  p_seed integer, p_countdown_seconds integer, p_minimum_seconds integer,
  p_maximum_seconds integer, p_highest_wave integer, p_weather_kind text,
  p_weather_ships numeric, p_weather_fog numeric,
  p_rules text[], p_snapshot_template jsonb, p_admit_v1 boolean, p_protocol smallint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_start jsonb;
  v_rules_reply jsonb;
  v_rules text[];
  v_owner_state public.island_recovery_state;
  v_run public.wave_runs;
  v_wave public.recovery_wave_states;
  v_player_token uuid;
  v_player_counter bigint;
  v_server_now timestamptz;
  v_captain jsonb;
  v_snapshot jsonb;
  v_create jsonb;
  v_wave_event jsonb;
  v_wave_boss jsonb;
  v_refresh jsonb;
  v_positions jsonb;
  v_defenses jsonb := '[]'::jsonb;
  v_structures jsonb := '[]'::jsonb;
  v_config jsonb;
  v_config_spot jsonb;
  v_defense jsonb;
  v_building public.islet_buildings;
  v_health public.island_structure_health;
  v_hp integer;
  v_max_hp numeric;
  v_admit boolean := false;
  v_config_count integer;
  v_defense_spot text;
  v_action_repeat boolean := false;
  v_next_wave integer;
begin
  if p_player_id is null or p_rules is null
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_seed is null or p_seed < 0 or p_countdown_seconds is null or p_countdown_seconds < 0
     or p_minimum_seconds is null or p_maximum_seconds is null
     or p_highest_wave is null or p_highest_wave < 1
     or p_weather_kind is null or p_weather_ships is null or p_weather_fog is null
     or p_admit_v1 is null or p_protocol is null or p_protocol not in (1,2) then
    raise exception 'bad_recovery_start';
  end if;
  if p_place <> 'island' or p_island_owner is null then
    v_start := public.wave_start(p_player_id,p_action_uid,p_place,p_island_owner,p_seed,
      p_countdown_seconds,p_minimum_seconds,p_maximum_seconds,p_highest_wave,
      p_weather_kind,p_weather_ships,p_weather_fog);
    if v_start ->> 'status' = 'started' then
      v_rules_reply := public.wave_rules_keep((v_start ->> 'waveId')::uuid,p_rules);
      v_start := v_start || jsonb_build_object('rules',v_rules_reply -> 'rules');
    end if;
    if v_start ->> 'status' = 'started' then
      return v_start || jsonb_build_object('recoveryVersion',0,'waveProtocol',1);
    end if;
    return v_start;
  end if;

  -- The owner row is the canonical island lock and precedes recovery state/wave/health.
  perform 1 from public.islands where player_id=p_island_owner for update;
  if not found then return jsonb_build_object('status','refused','reason','no_such_island'); end if;
  if p_player_id <> p_island_owner and not exists (
    select 1 from public.island_members where island_owner=p_island_owner
      and player_id=p_player_id and left_at is null
  ) then return jsonb_build_object('status','refused','reason','not_member'); end if;
  select * into v_owner_state from public.island_recovery_state
   where island_owner=p_island_owner for update;
  if not found then raise exception 'recovery_state_incomplete'; end if;
  v_server_now := clock_timestamp();
  select * into v_run from public.wave_runs
   where started_by=p_player_id and action_uid=p_action_uid;
  v_action_repeat := found;
  if v_action_repeat then
    select * into v_wave from public.recovery_wave_states where wave_id=v_run.id;
    if found and p_protocol=1 then
      return jsonb_build_object('status','refused','reason','client_update_required');
    end if;
    if found then
      select participant_token,last_actor_counter into v_player_token,v_player_counter
        from public.recovery_wave_participants where wave_id=v_run.id and player_id=p_player_id;
      return jsonb_build_object('status','started','waveId',v_run.id,'wave',v_run.wave,
        'seed',v_run.seed,'startsAt',v_run.starts_at,'weatherKind',v_run.weather_kind,
        'ships',v_run.weather_ships,'fog',v_run.weather_fog,'place',v_run.place,'repeat',true,
        'rules',v_wave.initial_snapshot -> 'rules','recoveryVersion',1,'waveProtocol',2,
        'initialSnapshot',v_wave.initial_snapshot,'participantToken',v_player_token,
        'lastActorCounter',coalesce(v_player_counter,0));
    end if;
    v_start := jsonb_build_object('status','started','waveId',v_run.id,'wave',v_run.wave,
      'seed',v_run.seed,'startsAt',v_run.starts_at,'weatherKind',v_run.weather_kind,
      'ships',v_run.weather_ships,'fog',v_run.weather_fog,'place',v_run.place,'repeat',true);
  elsif p_protocol=1 and v_owner_state.recovery_version=1 then
    return jsonb_build_object('status','refused','reason','client_update_required');
  end if;
  v_admit := (v_owner_state.recovery_version = 1)
             or (p_protocol=2 and p_admit_v1 and 'structure_recovery' = any(p_rules));
  v_rules := p_rules;
  if v_admit and not ('structure_recovery' = any(v_rules)) then
    v_rules := array_append(v_rules,'structure_recovery');
  end if;

  if not v_action_repeat then
    if v_admit then
      if p_snapshot_template is null
         or jsonb_typeof(p_snapshot_template) is distinct from 'object'
         or jsonb_typeof(p_snapshot_template -> 'createWave') is distinct from 'object'
         or jsonb_typeof(p_snapshot_template -> 'priceSchedule') is distinct from 'object'
         or jsonb_typeof(p_snapshot_template -> 'eventByWave') is distinct from 'object'
         or jsonb_typeof(p_snapshot_template -> 'bossByWave') is distinct from 'object'
         or (p_snapshot_template ->> 'configVersion')::integer is distinct from 1
         or jsonb_typeof(p_snapshot_template -> 'expectedRevision') is distinct from 'number'
         or (p_snapshot_template ->> 'expectedRevision') !~ '^[0-9]+$' then
        raise exception 'bad_recovery_snapshot';
      end if;
      if (p_snapshot_template ->> 'expectedRevision')::bigint <> v_owner_state.revision then
        return jsonb_build_object('status','refused','reason','island_changed');
      end if;
    end if;
    perform public.structure_recovery_settle_locked(p_island_owner,v_server_now);
  end if;

  if not v_action_repeat then
    if v_admit then
      if not exists(select 1 from public.profiles where id=p_player_id) then
        return jsonb_build_object('status','refused','reason','player_not_set_up');
      end if;
      update public.wave_runs set finished_at=v_server_now,survived=false,ships_sunk=0,loot=0,expired=true
       where island_owner=p_island_owner and finished_at is null
         and starts_at+make_interval(secs=>maximum_seconds)<v_server_now;
      if exists(select 1 from public.wave_runs where island_owner=p_island_owner and finished_at is null) then
        return jsonb_build_object('status','refused','reason','wave_running');
      end if;
      select least(greatest(coalesce(next_wave,wave_best+1),1),p_highest_wave)
        into v_next_wave from public.islands where player_id=p_island_owner;
      insert into public.wave_runs(started_by,action_uid,place,island_owner,wave,seed,starts_at,
        minimum_seconds,maximum_seconds,weather_kind,weather_ships,weather_fog)
      values(p_player_id,p_action_uid,'island',p_island_owner,v_next_wave,p_seed,
        greatest(date_trunc('second',now())+make_interval(secs=>p_countdown_seconds),v_server_now),
        p_minimum_seconds,p_maximum_seconds,p_weather_kind,p_weather_ships,p_weather_fog)
      returning * into v_run;
      insert into public.wave_participants(wave_id,player_id) values(v_run.id,p_player_id);
      v_start := jsonb_build_object('status','started','waveId',v_run.id,'wave',v_run.wave,
        'seed',v_run.seed,'startsAt',v_run.starts_at,'weatherKind',v_run.weather_kind,
        'ships',v_run.weather_ships,'fog',v_run.weather_fog,'place',v_run.place,'repeat',false);
    else
      v_start := public.wave_start(p_player_id,p_action_uid,p_place,p_island_owner,p_seed,
        p_countdown_seconds,p_minimum_seconds,p_maximum_seconds,p_highest_wave,
        p_weather_kind,p_weather_ships,p_weather_fog);
      if v_start ->> 'status' <> 'started' then return v_start; end if;
      select * into v_run from public.wave_runs where id=(v_start ->> 'waveId')::uuid;
      if not coalesce((v_start ->> 'repeat')::boolean,false) and v_run.starts_at < v_server_now then
        update public.wave_runs set starts_at=v_server_now where id=v_run.id returning * into v_run;
        v_start := jsonb_set(v_start,'{startsAt}',to_jsonb(v_run.starts_at),true);
      end if;
    end if;
  end if;
  v_rules_reply := public.wave_rules_keep(v_run.id,v_rules);
  v_rules := array(select jsonb_array_elements_text(v_rules_reply -> 'rules'));

  -- An action retry can only return the immutable policy/snapshot it first created.
  select * into v_wave from public.recovery_wave_states where wave_id=v_run.id;
  if found then
    if p_protocol=1 then return jsonb_build_object('status','refused','reason','client_update_required'); end if;
    select participant_token,last_actor_counter into v_player_token,v_player_counter
      from public.recovery_wave_participants where wave_id=v_run.id and player_id=p_player_id;
    return v_start || jsonb_build_object('rules',to_jsonb(v_rules),'recoveryVersion',1,
      'waveProtocol',2,'initialSnapshot',v_wave.initial_snapshot,
      'participantToken',v_player_token,'lastActorCounter',coalesce(v_player_counter,0));
  end if;
  if coalesce((v_start ->> 'repeat')::boolean,false) then
    return v_start || jsonb_build_object('rules',to_jsonb(v_rules),'recoveryVersion',0,'waveProtocol',1);
  end if;
  if not v_admit then
    return v_start || jsonb_build_object('rules',to_jsonb(v_rules),'recoveryVersion',0,'waveProtocol',1);
  end if;

  -- Keep the owner's current Captain metadata as server-authored simulation input.
  select jsonb_build_object('level',captain_level,
    'skills',array(select skill from unnest(captain_skills ||
      case when captain_role is null then '{}'::text[] else array[captain_role] end) as skill
      where skill <> all(array['quick_fix','long_reach','sturdy_planks','master_shipwright',
        'swift_hammer','wide_arc','grand_engineer']::text[])),
    'weapon',weapon_equipped)
    into v_captain from public.islands where player_id=p_player_id;
  if v_captain is null then return jsonb_build_object('status','refused','reason','player_not_set_up'); end if;
  select * into v_owner_state from public.island_recovery_state
   where island_owner=p_island_owner;
  v_config := p_snapshot_template -> 'structureConfigBySpot';
  if jsonb_typeof(v_config) is distinct from 'object'
     or p_snapshot_template ->> 'legacyWallRecoverSeconds' is null
     or (p_snapshot_template ->> 'legacyWallRecoverSeconds')::integer < 1
     or jsonb_typeof(p_snapshot_template -> 'createWave' -> 'defenses') is distinct from 'array' then
    raise exception 'bad_recovery_snapshot_config';
  end if;
  v_refresh := public.structure_recovery_refresh_locked(p_island_owner,v_server_now,p_snapshot_template);
  v_positions := v_refresh -> 'positions';
  v_structures := v_refresh -> 'structures';
  v_snapshot := jsonb_set(p_snapshot_template,'{defaultPositions}',v_positions,true);

  -- A legacy island enters v1 once. Walls preserve the old D039 timer; towers start whole.
  if v_owner_state.recovery_version = 0 then
    for v_building in select * from public.islet_buildings
      where player_id=p_island_owner and building_type in ('wall','cannon','mortar','harpoon','culverin','swivel')
      order by plot for update
    loop
      v_config_spot := v_config -> v_building.plot;
      if v_config_spot is null or v_config_spot ->> 'kind' <> v_building.building_type
         or (v_config_spot ->> 'level')::integer <> v_building.level then
        raise exception 'recovery_snapshot_structure_mismatch';
      end if;
      v_max_hp := (v_config_spot ->> 'maxHP')::numeric;
      v_hp := case when v_building.building_type='wall' and v_building.wall_health < 100
                     and v_building.wall_damaged_at is not null
                     and v_building.wall_damaged_at + make_interval(secs =>
                       (p_snapshot_template ->> 'legacyWallRecoverSeconds')::integer) > v_server_now
                   then v_building.wall_health * 10000 else 1000000 end;
      insert into public.island_structure_health
        (island_owner,spot,instance_id,building_kind,level,hp_units,max_hp,config_version,
         settled_at,rate_numerator,rate_denominator,repair_seq,updated_at)
      values (p_island_owner,v_building.plot,v_building.recovery_instance_id,
        v_building.building_type,v_building.level,v_hp,v_max_hp,1,v_server_now,
        (v_config_spot ->> 'rateNumerator')::bigint,
        (v_config_spot ->> 'rateDenominator')::bigint,0,v_server_now)
      on conflict (island_owner,spot) do nothing;
    end loop;
  end if;

  -- Every built eligible structure must agree with the server-created static template and DB identity.
  for v_building in select * from public.islet_buildings
    where player_id=p_island_owner and building_type in ('wall','cannon','mortar','harpoon','culverin','swivel')
    order by plot for update
  loop
    v_config_spot := v_config -> v_building.plot;
    if v_config_spot is null or v_config_spot ->> 'kind' <> v_building.building_type
       or (v_config_spot ->> 'level')::integer <> v_building.level then
      raise exception 'recovery_snapshot_structure_mismatch';
    end if;
    select * into v_health from public.island_structure_health
     where island_owner=p_island_owner and spot=v_building.plot for update;
    if not found or v_health.instance_id <> v_building.recovery_instance_id
       or v_health.building_kind <> v_building.building_type or v_health.level <> v_building.level
       or v_health.max_hp <> (v_config_spot ->> 'maxHP')::numeric then
      raise exception 'recovery_state_incomplete';
    end if;
  end loop;
  select count(*) into v_config_count from jsonb_object_keys(v_config);
  if v_config_count <> (select count(*) from public.islet_buildings
      where player_id=p_island_owner and building_type in ('wall','cannon','mortar','harpoon','culverin','swivel')) then
    raise exception 'recovery_snapshot_structure_mismatch';
  end if;
  for v_defense in select value from jsonb_array_elements(p_snapshot_template -> 'createWave' -> 'defenses') as item(value)
  loop
    v_defense_spot := v_defense ->> 'id';
    if v_defense_spot is null then raise exception 'bad_recovery_snapshot_defense'; end if;
    select * into v_building from public.islet_buildings
     where player_id=p_island_owner and plot=v_defense_spot;
    if not found or v_building.building_type <> v_defense ->> 'kind'
       or v_building.level <> (v_defense ->> 'level')::integer then
      raise exception 'recovery_snapshot_structure_mismatch';
    end if;
    if v_building.building_type in ('wall','cannon','mortar','harpoon','culverin','swivel') then
      select * into v_health from public.island_structure_health
       where island_owner=p_island_owner and spot=v_defense_spot;
      v_defenses := v_defenses || jsonb_build_array(v_defense || jsonb_build_object(
        'x',(v_positions -> v_defense_spot ->> 'x')::numeric,
        'z',(v_positions -> v_defense_spot ->> 'z')::numeric,
        'instanceId',v_health.instance_id,'hpUnits',v_health.hp_units,'maxHP',v_health.max_hp,
        'repairSeq',v_health.repair_seq));
    else
      v_defenses := v_defenses || jsonb_build_array(v_defense || jsonb_build_object(
        'x',(v_positions -> v_defense_spot ->> 'x')::numeric,
        'z',(v_positions -> v_defense_spot ->> 'z')::numeric));
    end if;
  end loop;
  v_player_token := gen_random_uuid();
  v_snapshot := v_snapshot || jsonb_build_object(
    'waveId',v_run.id,'islandEpoch',v_owner_state.reset_epoch,'recoveryVersion',1,
    'waveProtocol',2,'wave',v_run.wave,'seed',v_run.seed,'startsAt',v_run.starts_at,
    'expiresAt',v_run.starts_at + make_interval(secs => v_run.maximum_seconds),
    'maximumSeconds',v_run.maximum_seconds,'rules',to_jsonb(v_rules),
    'structures',v_structures,
    'participants',jsonb_build_array(jsonb_build_object('participantToken',v_player_token,'captain',v_captain)));
  v_create := (p_snapshot_template -> 'createWave') || jsonb_build_object(
    'wave',v_run.wave,'seed',v_run.seed,'startsAt',v_run.starts_at,
    'weatherKind',v_run.weather_kind,'ships',v_run.weather_ships,'fog',v_run.weather_fog,
    'rules',to_jsonb(v_rules),'defenses',v_defenses);
  if not (p_snapshot_template -> 'eventByWave') ? v_run.wave::text
     or not (p_snapshot_template -> 'bossByWave') ? v_run.wave::text then
    raise exception 'recovery_snapshot_wave_config_missing';
  end if;
  v_wave_event := p_snapshot_template -> 'eventByWave' -> v_run.wave::text;
  v_wave_boss := p_snapshot_template -> 'bossByWave' -> v_run.wave::text;
  if (jsonb_typeof(v_wave_event) is distinct from 'string'
      and jsonb_typeof(v_wave_event) is distinct from 'null')
     or jsonb_typeof(v_wave_boss) is distinct from 'boolean' then
    raise exception 'recovery_snapshot_wave_config_invalid';
  end if;
  v_create := v_create || jsonb_build_object('event',v_wave_event,'boss',v_wave_boss);
  v_snapshot := jsonb_set(v_snapshot,'{createWave}',v_create,true);
  insert into public.recovery_wave_states
    (wave_id,island_owner,reset_epoch,recovery_version,wave_protocol,initial_snapshot)
  values (v_run.id,p_island_owner,v_owner_state.reset_epoch,1,2,v_snapshot);
  insert into public.recovery_wave_participants(wave_id,player_id,participant_token)
  values (v_run.id,p_player_id,v_player_token);
  update public.island_recovery_state set recovery_version=1,wave_protocol=2,
    current_wave_id=v_run.id,reserved_at=v_server_now,starts_at=v_run.starts_at,
    expires_at=v_run.starts_at + make_interval(secs => v_run.maximum_seconds),
    revision=revision+1,updated_at=v_server_now where island_owner=p_island_owner;
  return v_start || jsonb_build_object('rules',to_jsonb(v_rules),'recoveryVersion',1,
    'waveProtocol',2,'initialSnapshot',v_snapshot,'participantToken',v_player_token,
    'lastActorCounter',0);
end;
$$;

revoke all on function public.recovery_wave_start(uuid,text,text,uuid,integer,integer,integer,integer,integer,text,numeric,numeric,text[],jsonb,boolean,smallint) from public, anon, authenticated, service_role;
grant execute on function public.recovery_wave_start(uuid,text,text,uuid,integer,integer,integer,integer,integer,text,numeric,numeric,text[],jsonb,boolean,smallint) to service_role;
comment on function public.recovery_wave_start(uuid,text,text,uuid,integer,integer,integer,integer,integer,text,numeric,numeric,text[],jsonb,boolean,smallint) is
  'Atomically settles the owner island, starts a legacy-compatible wave, and on admitted recovery-v1 islands freezes a full actual-health simulation snapshot, participant token and immutable recovery policy.';

-- Joins a legacy wave unchanged or appends one token-only participant event to a v1 journal.
create or replace function public.recovery_wave_join(
  p_player_id uuid, p_wave_id uuid, p_protocol smallint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_wave public.recovery_wave_states;
  v_run public.wave_runs;
  v_part public.recovery_wave_participants;
  v_reply jsonb;
  v_captain jsonb;
  v_now timestamptz;
  v_seq bigint;
begin
  if p_player_id is null or p_wave_id is null or p_protocol is null or p_protocol not in (1,2) then
    raise exception 'bad_recovery_join';
  end if;
  select island_owner into v_owner from public.wave_runs where id=p_wave_id;
  if not found then return jsonb_build_object('status','refused','reason','no_such_wave'); end if;
  if v_owner is null then
    v_reply := public.wave_join(p_player_id,p_wave_id);
    if v_reply ->> 'status'='joined' then
      return v_reply || jsonb_build_object('recoveryVersion',0,'waveProtocol',1);
    end if;
    return v_reply;
  end if;

  -- All participating island rows precede recovery state, wave and participant rows.
  perform 1 from public.islands where player_id in (v_owner,p_player_id) order by player_id for update;
  if not exists (select 1 from public.islands where player_id=v_owner) then
    return jsonb_build_object('status','refused','reason','no_such_wave');
  end if;
  if p_player_id <> v_owner and not exists (
    select 1 from public.island_members where island_owner=v_owner
      and player_id=p_player_id and left_at is null
  ) then return jsonb_build_object('status','refused','reason','not_member'); end if;
  v_now := clock_timestamp();
  perform public.structure_recovery_settle_locked(v_owner,v_now);
  select * into v_wave from public.recovery_wave_states where wave_id=p_wave_id for update;
  if not found then
    v_reply := public.wave_join(p_player_id,p_wave_id);
    if v_reply ->> 'status'='joined' then
      return v_reply || jsonb_build_object('recoveryVersion',0,'waveProtocol',1);
    end if;
    return v_reply;
  end if;
  if p_protocol < v_wave.wave_protocol then
    return jsonb_build_object('status','refused','reason','client_update_required');
  end if;
  select * into v_run from public.wave_runs where id=p_wave_id for update;
  if not found then return jsonb_build_object('status','refused','reason','no_such_wave'); end if;
  select jsonb_build_object('level',captain_level,
    'skills',array(select skill from unnest(captain_skills ||
      case when captain_role is null then '{}'::text[] else array[captain_role] end) as skill
      where skill <> all(array['quick_fix','long_reach','sturdy_planks','master_shipwright',
        'swift_hammer','wide_arc','grand_engineer']::text[])),
    'weapon',weapon_equipped) into v_captain from public.islands where player_id=p_player_id;
  if v_captain is null then return jsonb_build_object('status','refused','reason','player_not_set_up'); end if;
  select * into v_part from public.recovery_wave_participants
   where wave_id=p_wave_id and player_id=p_player_id;
  if found then
    return jsonb_build_object('status','joined','waveId',v_run.id,'wave',v_run.wave,
      'seed',v_run.seed,'startsAt',v_run.starts_at,'weatherKind',v_run.weather_kind,
      'ships',v_run.weather_ships,'fog',v_run.weather_fog,'place',v_run.place,'repeat',true,
      'recoveryVersion',1,'waveProtocol',2,
      'initialSnapshot',v_wave.initial_snapshot,'participantToken',v_part.participant_token,
      'lastActorCounter',v_part.last_actor_counter);
  end if;
  if v_run.finished_at is not null
     or v_now > v_run.starts_at + make_interval(secs => v_run.maximum_seconds) then
    return jsonb_build_object('status','refused','reason','wave_over');
  end if;
  if exists (select 1 from public.wave_participants where wave_id=p_wave_id and player_id=p_player_id) then
    raise exception 'recovery_state_incomplete';
  end if;
  insert into public.wave_participants(wave_id,player_id) values(p_wave_id,p_player_id);
  insert into public.recovery_wave_participants(wave_id,player_id)
  values (p_wave_id,p_player_id) returning * into v_part;
  v_seq := v_wave.journal_head + 1;
  insert into public.recovery_wave_events
    (wave_id,seq,actor_id,participant_token,input_uid,event_kind,effective_tick,payload)
  values (p_wave_id,v_seq,null,v_part.participant_token,null,'participant_joined',0,
    jsonb_build_object('participantToken',v_part.participant_token,'captain',v_captain));
  update public.recovery_wave_states set journal_head=v_seq where wave_id=p_wave_id;
  return jsonb_build_object('status','joined','waveId',v_run.id,'wave',v_run.wave,
    'seed',v_run.seed,'startsAt',v_run.starts_at,'weatherKind',v_run.weather_kind,
    'ships',v_run.weather_ships,'fog',v_run.weather_fog,'place',v_run.place,'repeat',false,
    'recoveryVersion',1,'waveProtocol',2,
    'initialSnapshot',v_wave.initial_snapshot,'participantToken',v_part.participant_token,
    'lastActorCounter',0);
end;
$$;

revoke all on function public.recovery_wave_join(uuid,uuid,smallint) from public, anon, authenticated, service_role;
grant execute on function public.recovery_wave_join(uuid,uuid,smallint) to service_role;
comment on function public.recovery_wave_join(uuid,uuid,smallint) is
  'Joins a frozen protocol-2 wave under canonical island/state locks and appends participant_joined with a private-profile-free token and server Captain stats; protocol-1 legacy waves retain the old join contract.';

-- Returns the current legacy or recovery wave; v1 callers receive only their own private token mapping.
create or replace function public.recovery_wave_current(
  p_player_id uuid, p_place text, p_island_owner uuid, p_protocol smallint
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_reply jsonb;
  v_wave_id uuid;
  v_wave public.recovery_wave_states;
  v_part public.recovery_wave_participants;
begin
  if p_player_id is null or p_place is null or p_place not in ('island','pirate_point')
     or (p_place='island') <> (p_island_owner is not null)
     or p_protocol is null or p_protocol not in (1,2) then
    raise exception 'bad_recovery_current';
  end if;
  v_reply := public.wave_current(p_place,p_island_owner);
  if v_reply is null then return jsonb_build_object('status','empty'); end if;
  v_wave_id := (v_reply ->> 'waveId')::uuid;
  select * into v_wave from public.recovery_wave_states where wave_id=v_wave_id;
  if not found then return v_reply || jsonb_build_object('recoveryVersion',0,'waveProtocol',1); end if;
  if p_protocol < v_wave.wave_protocol then
    return jsonb_build_object('status','refused','reason','client_update_required');
  end if;
  if not exists (select 1 from public.recovery_wave_participants
                  where wave_id=v_wave_id and player_id=p_player_id) then
    return jsonb_build_object('status','refused','reason','not_in_wave');
  end if;
  select * into v_part from public.recovery_wave_participants
   where wave_id=v_wave_id and player_id=p_player_id;
  return v_reply || jsonb_build_object('recoveryVersion',1,'waveProtocol',2,
    'initialSnapshot',v_wave.initial_snapshot,
    'participantToken',case when found then v_part.participant_token end,
    'lastActorCounter',case when found then v_part.last_actor_counter end);
end;
$$;

revoke all on function public.recovery_wave_current(uuid,text,uuid,smallint) from public, anon, authenticated, service_role;
grant execute on function public.recovery_wave_current(uuid,text,uuid,smallint) to service_role;
comment on function public.recovery_wave_current(uuid,text,uuid,smallint) is
  'Reads the current wave with its frozen versioned snapshot and the authenticated caller''s token/counter only; no account identifiers enter the returned snapshot or journal.';

-- Refreshes current structure metadata after the caller locks owner island and captures server time.
create or replace function public.structure_recovery_refresh_locked(
  p_island_owner uuid, p_server_now timestamptz, p_snapshot_template jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.island_recovery_state;
  v_building public.islet_buildings;
  v_health public.island_structure_health;
  v_template jsonb;
  v_recovery_config jsonb;
  v_positions jsonb;
  v_configs jsonb;
  v_config jsonb;
  v_position jsonb;
  v_layout record;
  v_wall_research text;
  v_wall_spec text;
  v_max_hp numeric;
  v_rate_num bigint;
  v_rate_den bigint;
  v_carpenters integer;
  v_workshops integer;
  v_workshop_percent integer;
  v_carpenter_factor integer;
  v_spec_num integer;
  v_spec_den integer;
  v_research_num integer;
  v_research_den integer;
  v_hp integer;
  v_same_instance boolean;
  v_base_max_hp numeric;
  v_revision bigint;
  v_items jsonb := '[]'::jsonb;
  v_item jsonb;
begin
  if p_island_owner is null or p_server_now is null then raise exception 'bad_recovery_refresh'; end if;
  select * into v_state from public.island_recovery_state
   where island_owner=p_island_owner for update;
  if not found then raise exception 'recovery_state_incomplete'; end if;
  v_template := p_snapshot_template;
  if v_template is null and v_state.recovery_version=1 then
    select initial_snapshot into v_template from public.recovery_wave_states
     where island_owner=p_island_owner order by created_at desc limit 1;
  end if;
  if v_template is null or jsonb_typeof(v_template -> 'recoveryConfig') is distinct from 'object'
     or jsonb_typeof(v_template -> 'defaultPositions') is distinct from 'object' then
    raise exception 'recovery_config_missing';
  end if;
  v_recovery_config := v_template -> 'recoveryConfig';
  v_positions := v_template -> 'defaultPositions';
  v_configs := v_template -> 'structureConfigBySpot';
  if p_snapshot_template is null then v_configs := '{}'::jsonb; end if;
  if (v_recovery_config ->> 'recoveryVersion')::integer <> 1
     or (v_recovery_config ->> 'waveProtocol')::integer <> 2
     or jsonb_typeof(v_recovery_config -> 'structureMaxHp') is distinct from 'object'
     or jsonb_typeof(v_recovery_config -> 'recoveryRateFactors') is distinct from 'object' then
    raise exception 'bad_recovery_config';
  end if;
  select crew_carpenter into v_carpenters from public.islands where player_id=p_island_owner;
  if not found then raise exception 'no_such_island'; end if;
  v_carpenters := least(v_carpenters, (v_recovery_config -> 'recoveryRateFactors' ->> 'carpenterMaximumWorkers')::integer);
  select choice_2 into v_wall_research from public.island_research
   where island_owner=p_island_owner and branch='wall';

  -- Persisted placements override static defaults; this handles moved workshop radii at mutation time.
  perform 1 from public.island_layout where island_owner=p_island_owner order by plot for update;
  for v_layout in select plot,x_half,z_half from public.island_layout
    where island_owner=p_island_owner order by plot
  loop
    v_positions := jsonb_set(v_positions,array[v_layout.plot],jsonb_build_object(
      'x',v_layout.x_half::numeric/2,'z',v_layout.z_half::numeric/2),true);
  end loop;

  -- Lock all current structures before health rows in deterministic spot order.
  perform 1 from public.islet_buildings where player_id=p_island_owner
    and building_type in ('wall','cannon','mortar','harpoon','culverin','swivel')
    order by plot for update;
  perform 1 from public.island_structure_health where island_owner=p_island_owner order by spot for update;
  for v_building in select * from public.islet_buildings where player_id=p_island_owner
    and building_type in ('wall','cannon','mortar','harpoon','culverin','swivel') order by plot
  loop
    v_config := v_configs -> v_building.plot;
    v_position := v_positions -> v_building.plot;
    if v_position is null or v_position ->> 'x' is null or v_position ->> 'z' is null then
      raise exception 'recovery_position_missing';
    end if;
    if v_config is not null then
      if v_config ->> 'kind' <> v_building.building_type
         or (v_config ->> 'level')::integer <> v_building.level then
        raise exception 'recovery_snapshot_structure_mismatch';
      end if;
    end if;
    v_base_max_hp := ((v_recovery_config -> 'structureMaxHp' -> v_building.building_type)
                       -> (v_building.level-1)) #>> '{}' ;
    v_max_hp := v_base_max_hp;
    v_wall_spec := null;
    if v_building.building_type='wall' then
      v_wall_spec := v_building.spec;
      if v_wall_spec is not null and v_recovery_config -> 'wallSkillMaxHpFactors' ? v_wall_spec then
        v_max_hp := v_max_hp * ((v_recovery_config -> 'wallSkillMaxHpFactors' -> v_wall_spec ->> 0)::numeric
                               / (v_recovery_config -> 'wallSkillMaxHpFactors' -> v_wall_spec ->> 1)::numeric);
      end if;
      if v_wall_research is not null and v_recovery_config -> 'wallResearchMaxHpFactors' ? v_wall_research then
        v_max_hp := v_max_hp * ((v_recovery_config -> 'wallResearchMaxHpFactors' -> v_wall_research ->> 0)::numeric
                               / (v_recovery_config -> 'wallResearchMaxHpFactors' -> v_wall_research ->> 1)::numeric);
      end if;
    end if;
    if exists (select 1 from public.islet_buildings h where h.player_id=p_island_owner
           and h.building_type='house' and h.level>=2 and h.spec='workshop'
           and not (v_positions ? h.plot)) then
      raise exception 'recovery_position_missing';
    end if;
    select count(*) into v_workshops from public.islet_buildings h
       where h.player_id=p_island_owner and h.building_type='house' and h.level>=2 and h.spec='workshop'
         and power((v_position ->> 'x')::numeric - (v_positions -> h.plot ->> 'x')::numeric,2)
           + power((v_position ->> 'z')::numeric - (v_positions -> h.plot ->> 'z')::numeric,2)
             <= power((v_recovery_config -> 'recoveryRateFactors' ->> 'workshopRadius')::numeric,2);
    v_workshop_percent := 100 + least(
        (v_recovery_config -> 'recoveryRateFactors' ->> 'workshopPercentPerHouse')::integer * v_workshops,
        (v_recovery_config -> 'recoveryRateFactors' ->> 'workshopPercentCap')::integer);
    v_carpenter_factor := 1 + v_carpenters *
        (v_recovery_config -> 'recoveryRateFactors' ->> 'carpenterMultiplierPerWorker')::integer;
    v_spec_num := 1; v_spec_den := 1; v_research_num := 1; v_research_den := 1;
    if v_building.building_type='wall' and v_wall_spec is not null
         and v_recovery_config -> 'recoveryRateFactors' -> 'wallSpecRateFactors' ? v_wall_spec then
      v_spec_num := ((v_recovery_config -> 'recoveryRateFactors' -> 'wallSpecRateFactors' -> v_wall_spec ->> 0)::integer);
      v_spec_den := ((v_recovery_config -> 'recoveryRateFactors' -> 'wallSpecRateFactors' -> v_wall_spec ->> 1)::integer);
    end if;
    if v_building.building_type='wall' and v_wall_research is not null
         and v_recovery_config -> 'recoveryRateFactors' -> 'wallResearchRateFactors' ? v_wall_research then
      v_research_num := ((v_recovery_config -> 'recoveryRateFactors' -> 'wallResearchRateFactors' -> v_wall_research ->> 0)::integer);
      v_research_den := ((v_recovery_config -> 'recoveryRateFactors' -> 'wallResearchRateFactors' -> v_wall_research ->> 1)::integer);
    end if;
    v_rate_num := v_carpenter_factor * v_workshop_percent * v_spec_num * v_research_num;
    v_rate_den := 100 * v_spec_den * v_research_den;
    if v_max_hp <= 0 or v_rate_den <= 0 or v_rate_num < 0 then raise exception 'bad_recovery_config'; end if;
    select * into v_health from public.island_structure_health
     where island_owner=p_island_owner and spot=v_building.plot;
    v_same_instance := found and v_health.instance_id=v_building.recovery_instance_id;
    v_hp := case when v_same_instance then v_health.hp_units else
      case when v_state.recovery_version=0 and v_building.building_type='wall'
              and v_building.wall_health < 100 and v_building.wall_damaged_at is not null
              and v_building.wall_damaged_at + make_interval(secs =>
                (v_template ->> 'legacyWallRecoverSeconds')::integer) > p_server_now
        then v_building.wall_health * 10000 else 1000000 end end;
    if v_same_instance then
      update public.island_structure_health set building_kind=v_building.building_type,
        level=v_building.level,max_hp=v_max_hp,hp_units=v_hp,settled_at=p_server_now,
        rate_numerator=v_rate_num,rate_denominator=v_rate_den,updated_at=p_server_now
       where island_owner=p_island_owner and spot=v_building.plot;
    else
      insert into public.island_structure_health
        (island_owner,spot,instance_id,building_kind,level,hp_units,max_hp,config_version,
         settled_at,rate_numerator,rate_denominator,repair_seq,updated_at)
      values (p_island_owner,v_building.plot,v_building.recovery_instance_id,
        v_building.building_type,v_building.level,v_hp,v_max_hp,1,p_server_now,
        v_rate_num,v_rate_den,0,p_server_now)
      on conflict (island_owner,spot) do update set
        instance_id=excluded.instance_id,building_kind=excluded.building_kind,level=excluded.level,
        hp_units=excluded.hp_units,max_hp=excluded.max_hp,config_version=excluded.config_version,
        settled_at=excluded.settled_at,rate_numerator=excluded.rate_numerator,
        rate_denominator=excluded.rate_denominator,repair_seq=0,updated_at=excluded.updated_at;
    end if;
    select * into v_health from public.island_structure_health
     where island_owner=p_island_owner and spot=v_building.plot;
    v_item := coalesce(v_config,'{}'::jsonb) || jsonb_build_object(
      'spot',v_building.plot,'instanceId',v_building.recovery_instance_id,
      'kind',v_building.building_type,'level',v_building.level,
      'hpUnits',v_health.hp_units,'maxHP',v_health.max_hp,'repairSeq',v_health.repair_seq,
      'x',(v_position ->> 'x')::numeric,'z',(v_position ->> 'z')::numeric,
      'wallSpec',case when v_building.building_type='wall' then v_wall_spec end,
      'wallResearch',case when v_building.building_type='wall' then v_wall_research end,
      'nearbyWorkshops',v_workshops,
      'rateNumerator',v_health.rate_numerator,'rateDenominator',v_health.rate_denominator);
    v_items := v_items || jsonb_build_array(v_item);
  end loop;
  delete from public.island_structure_health h where h.island_owner=p_island_owner
    and not exists (select 1 from public.islet_buildings b where b.player_id=p_island_owner
      and b.plot=h.spot and b.recovery_instance_id=h.instance_id
      and b.building_type in ('wall','cannon','mortar','harpoon','culverin','swivel'));
  update public.island_recovery_state set revision=revision+1,updated_at=p_server_now
   where island_owner=p_island_owner returning revision into v_revision;
  return jsonb_build_object('status','refreshed','serverNow',p_server_now,
    'revision',v_revision,'positions',v_positions,'structures',v_items);
end;
$$;

revoke all on function public.structure_recovery_refresh_locked(uuid,timestamptz,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.structure_recovery_refresh_locked(uuid,timestamptz,jsonb) to service_role;
comment on function public.structure_recovery_refresh_locked(uuid,timestamptz,jsonb) is
  'Caller first locks affected owner islands and settles with the same server timestamp. Preserves normalized HP for the same instance, initializes a new instance at full HP, reads versioned config and positions, refreshes current max HP and owner recovery rates, and deletes only removed current-health rows.';

-- Closes the first canonical HP receipt and pays each participant in one transaction.
create or replace function public.recovery_wave_finish(
  p_player_id uuid, p_wave_id uuid, p_survived boolean, p_ships_sunk integer,
  p_loot_base integer, p_loot_per_wave integer, p_loot_per_house integer,
  p_point_loot_base integer, p_boss_every integer, p_boss_multiplier integer,
  p_restart_back integer, p_island_epoch uuid, p_checkpoint_uid text,
  p_through_tick integer, p_input_head_seq bigint, p_last_repair_seq bigint,
  p_basis_repair_seq jsonb, p_hp_units jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_balance bigint;
  v_server_now timestamptz;
  v_island_state public.island_recovery_state;
  v_wave public.recovery_wave_states;
  v_run public.wave_runs;
  v_part public.wave_participants;
  v_checkpoint jsonb;
  v_result jsonb;
  v_recovery jsonb;
  v_closed_hp jsonb;
  v_basis jsonb;
  v_structure jsonb;
  v_event public.recovery_wave_events;
  v_instance text;
  v_previous_basis bigint;
  v_wave_best integer;
  v_flags integer;
  v_houses integer := 0;
  v_loot integer := 0;
  v_base integer := 0;
  v_boss boolean := false;
  v_status jsonb;
  v_repeat boolean := false;
  v_is_expired boolean := false;
begin
  if p_player_id is null or p_wave_id is null or p_survived is null
     or p_ships_sunk is null or p_ships_sunk not between 0 and 1000
     or p_loot_base is null or p_loot_base < 0
     or p_loot_per_wave is null or p_loot_per_wave < 0
     or p_loot_per_house is null or p_loot_per_house < 0
     or p_point_loot_base is null or p_point_loot_base < 0
     or p_boss_every is null or p_boss_every < 0
     or p_boss_multiplier is null or p_boss_multiplier not between 1 and 10
     or p_restart_back is null or p_restart_back < 0 then
    raise exception 'bad_wave_finish';
  end if;
  select balance into v_balance from public.wallets where player_id=p_player_id for update;
  if not found then return jsonb_build_object('status','refused','reason','player_not_set_up'); end if;
  select island_owner into v_owner from public.wave_runs where id=p_wave_id;
  if not found or v_owner is null then
    return jsonb_build_object('status','refused','reason','no_such_wave');
  end if;
  perform 1 from public.islands where player_id in (v_owner,p_player_id) order by player_id for update;
  if not exists(select 1 from public.islands where player_id=v_owner) then
    return jsonb_build_object('status','refused','reason','no_such_wave');
  end if;
  v_server_now := clock_timestamp();
  select * into v_island_state from public.island_recovery_state
   where island_owner=v_owner for update;
  select * into v_wave from public.recovery_wave_states where wave_id=p_wave_id for update;
  if not found then return jsonb_build_object('status','refused','reason','client_update_required'); end if;
  select * into v_run from public.wave_runs where id=p_wave_id for update;
  if not found then return jsonb_build_object('status','refused','reason','no_such_wave'); end if;
  v_boss := p_boss_every > 0 and v_run.wave % p_boss_every = 0;
  select * into v_part from public.wave_participants
   where wave_id=p_wave_id and player_id=p_player_id for update;
  if not found then return jsonb_build_object('status','refused','reason','not_in_wave'); end if;
  v_repeat := v_part.finished_at is not null;
  if v_wave.recovery_version<>1 or v_wave.wave_protocol<>2 then
    return jsonb_build_object('status','refused','reason','client_update_required');
  end if;
  if v_wave.closed_at is null and (p_island_epoch is distinct from v_wave.reset_epoch
       or v_island_state.reset_epoch is distinct from v_wave.reset_epoch
       or v_island_state.current_wave_id is distinct from p_wave_id) then
    return jsonb_build_object('status','refused','reason','epoch_mismatch');
  end if;

  -- Exact expiry is a canonical settlement boundary and never pays a late local win.
  if v_wave.closed_at is null
     and v_server_now >= v_run.starts_at + make_interval(secs=>v_run.maximum_seconds) then
    v_is_expired := true;
    perform public.structure_recovery_settle_locked(v_owner,v_server_now);
    select * into v_wave from public.recovery_wave_states where wave_id=p_wave_id for update;
    v_closed_hp := public.structure_recovery_wave_hp(p_wave_id);
    update public.recovery_wave_states set closed_at=v_server_now,closed_hp=v_closed_hp
     where wave_id=p_wave_id and closed_at is null;
    select * into v_wave from public.recovery_wave_states where wave_id=p_wave_id for update;
    v_repeat := v_part.finished_at is not null;
    update public.wave_participants set finished_at=v_server_now,survived=false,
      ships_sunk=0,loot=0,expired=true
     where wave_id=p_wave_id and player_id=p_player_id and finished_at is null
     returning * into v_part;
    update public.wave_runs set finished_at=v_server_now,survived=false,
      ships_sunk=0,loot=0,expired=true
     where id=p_wave_id and finished_at is null;
    select wave_best,flags into v_wave_best,v_flags from public.islands where player_id=v_owner;
    v_basis := '{}'::jsonb;
    for v_structure in select value from jsonb_array_elements(v_wave.initial_snapshot -> 'structures') as item(value)
    loop
      v_instance := v_structure ->> 'instanceId';
      if v_instance is null then raise exception 'recovery_snapshot_incomplete'; end if;
      v_basis := jsonb_set(v_basis,array[v_instance],
        coalesce(v_structure -> 'repairSeq','0'::jsonb),true);
    end loop;
    for v_event in select * from public.recovery_wave_events
      where wave_id=p_wave_id and event_kind='structure_repaired' order by seq
    loop
      v_instance := v_event.payload ->> 'instanceId';
      v_previous_basis := coalesce((v_basis ->> v_instance)::bigint,0);
      v_basis := jsonb_set(v_basis,array[v_instance],
        to_jsonb(greatest(v_previous_basis,(v_event.payload ->> 'repairSeq')::bigint)),true);
    end loop;
    v_recovery := jsonb_build_object(
      'waveId',p_wave_id,'islandEpoch',v_wave.reset_epoch,'closedAt',v_wave.closed_at,
      'closedHp',v_wave.closed_hp,'checkpointUid',null,
      'throughTick',greatest(0,v_run.maximum_seconds*20-1),
      'inputHeadSeq',v_wave.journal_head,
      'lastRepairSeq',v_wave.last_repair_seq,
      'basisRepairSeq',v_basis);
    return jsonb_build_object('status','done','loot',0,'balance',v_balance,
      'survived',false,'wave',v_run.wave,'waveBest',v_wave_best,'flags',v_flags,
      'expired',true,'repeat',v_repeat,
      'boss',v_boss,'recovery',v_recovery);
  end if;

  if v_wave.closed_at is null then
    if p_checkpoint_uid is null or p_through_tick is null or p_input_head_seq is null
       or p_last_repair_seq is null or jsonb_typeof(p_basis_repair_seq) is distinct from 'object'
       or jsonb_typeof(p_hp_units) is distinct from 'object' then
      return jsonb_build_object('status','refused','reason','health_sync_required');
    end if;
    if p_through_tick < v_wave.sealed_through_tick or p_input_head_seq < v_wave.journal_head then
      return jsonb_build_object('status','refused','reason','health_sync_required');
    end if;
    if p_last_repair_seq is distinct from v_wave.last_repair_seq then
      return jsonb_build_object('status','refused','reason','health_sync_required');
    end if;
    if v_server_now < v_run.starts_at + make_interval(secs=>v_run.minimum_seconds)
       and v_part.finished_at is null then
      return jsonb_build_object('status','refused','reason','too_early',
        'waitSeconds',greatest(1,ceil(extract(epoch from
          v_run.starts_at+make_interval(secs=>v_run.minimum_seconds)-v_server_now))::integer));
    end if;
    v_checkpoint := public.recovery_wave_report_health_locked(
      p_player_id,p_wave_id,p_island_epoch,p_checkpoint_uid,p_through_tick,
      p_input_head_seq,p_last_repair_seq,p_basis_repair_seq,p_hp_units,v_server_now);
    if v_checkpoint ->> 'status'<>'accepted' then return v_checkpoint; end if;
  end if;

  -- Expiry closes canonical HP without credit; later callers cannot turn it into a win.
  v_is_expired := v_is_expired or v_run.expired or (
    v_wave.closed_at is not null and v_run.finished_at is null
    and v_wave.closed_at >= v_run.starts_at + make_interval(secs=>v_run.maximum_seconds)
  );
  if v_is_expired then
    if not v_run.expired then
      update public.wave_runs set finished_at=v_wave.closed_at,survived=false,
        ships_sunk=0,loot=0,expired=true where id=p_wave_id and finished_at is null;
      v_run.finished_at := v_wave.closed_at;
      v_run.expired := true;
      v_run.survived := false;
      v_run.ships_sunk := 0;
      v_run.loot := 0;
    end if;
    if v_part.finished_at is null then
      update public.wave_participants set finished_at=v_server_now,survived=false,
        ships_sunk=0,loot=0,expired=true
       where wave_id=p_wave_id and player_id=p_player_id returning * into v_part;
    end if;
    select wave_best,flags into v_wave_best,v_flags from public.islands where player_id=v_owner;
    v_result := jsonb_build_object('status','done','loot',v_part.loot,'balance',v_balance,
      'survived',v_part.survived,'wave',v_run.wave,'waveBest',v_wave_best,'flags',v_flags,
      'expired',true,'repeat',v_repeat,
      'boss',p_boss_every>0 and v_run.wave%p_boss_every=0);
  elsif not v_repeat
        and v_server_now > v_run.starts_at + make_interval(secs=>v_run.maximum_seconds) then
    update public.wave_participants set finished_at=v_server_now,survived=false,
      ships_sunk=0,loot=0,expired=true
     where wave_id=p_wave_id and player_id=p_player_id returning * into v_part;
    select wave_best,flags into v_wave_best,v_flags from public.islands where player_id=v_owner;
    v_result := jsonb_build_object('status','done','loot',0,'balance',v_balance,
      'survived',false,'wave',v_run.wave,'waveBest',v_wave_best,'flags',v_flags,
      'expired',true,'repeat',false,
      'boss',p_boss_every>0 and v_run.wave%p_boss_every=0);
  else
    if not v_repeat and v_server_now < v_run.starts_at + make_interval(secs=>v_run.minimum_seconds) then
      return jsonb_build_object('status','refused','reason','too_early',
        'waitSeconds',greatest(1,ceil(extract(epoch from
          v_run.starts_at+make_interval(secs=>v_run.minimum_seconds)-v_server_now))::integer));
    end if;
    if not v_repeat then
      if p_survived then
        v_base := p_loot_base;
        select coalesce(sum(level),0) into v_houses from public.islet_buildings
         where player_id=v_owner and building_type='house';
        v_loot := v_base + p_loot_per_wave*v_run.wave + p_loot_per_house*v_houses;
        if v_boss then v_loot := v_loot*p_boss_multiplier; end if;
      end if;
      update public.wave_participants set finished_at=v_server_now,survived=p_survived,
        ships_sunk=p_ships_sunk,loot=v_loot,expired=false
       where wave_id=p_wave_id and player_id=p_player_id returning * into v_part;
      if v_run.finished_at is null then
        update public.wave_runs set finished_at=v_server_now,survived=p_survived,
          ships_sunk=p_ships_sunk,loot=v_loot where id=p_wave_id;
      end if;
      if not p_survived and v_run.finished_at is null and not v_run.flag_counted then
        update public.islands set next_wave=greatest(1,wave_best-p_restart_back)
         where player_id=v_owner;
      end if;
      if p_survived and not v_run.flag_counted then
        update public.wave_runs set flag_counted=true where id=p_wave_id;
        update public.islands set wave_best=greatest(wave_best,v_run.wave),flags=flags+1,
          next_wave=v_run.wave+1
         where player_id=v_owner;
      end if;
      if p_survived then
        update public.islands set won_wave_best=greatest(won_wave_best,v_run.wave)
         where player_id=p_player_id and won_wave_best<v_run.wave;
      end if;
      if v_loot>0 then
        v_balance := public.apply_wallet_transaction(p_player_id,v_loot,'pirate_loot',
          'wave:'||v_run.id::text||':'||p_player_id::text);
      end if;
      if v_wave.closed_at is null then
        v_closed_hp := public.structure_recovery_wave_hp(p_wave_id);
        update public.recovery_wave_states set closed_at=v_server_now,closed_hp=v_closed_hp
         where wave_id=p_wave_id and closed_at is null;
        perform public.structure_recovery_settle_locked(v_owner,v_server_now);
      end if;
    end if;
    select wave_best,flags into v_wave_best,v_flags from public.islands where player_id=v_owner;
    v_result := jsonb_build_object('status','done','loot',v_part.loot,'balance',v_balance,
      'survived',v_part.survived,'wave',v_run.wave,'waveBest',v_wave_best,'flags',v_flags,
      'expired',v_part.expired,'repeat',v_repeat,
      'boss',v_boss);
  end if;
  select * into v_wave from public.recovery_wave_states where wave_id=p_wave_id;
  if v_is_expired then
    v_basis := '{}'::jsonb;
    for v_structure in select value from jsonb_array_elements(v_wave.initial_snapshot -> 'structures') as item(value)
    loop
      v_instance := v_structure ->> 'instanceId';
      if v_instance is null then raise exception 'recovery_snapshot_incomplete'; end if;
      v_basis := jsonb_set(v_basis,array[v_instance],
        coalesce(v_structure -> 'repairSeq','0'::jsonb),true);
    end loop;
    for v_event in select * from public.recovery_wave_events
      where wave_id=p_wave_id and event_kind='structure_repaired' order by seq
    loop
      v_instance := v_event.payload ->> 'instanceId';
      v_previous_basis := coalesce((v_basis ->> v_instance)::bigint,0);
      v_basis := jsonb_set(v_basis,array[v_instance],
        to_jsonb(greatest(v_previous_basis,(v_event.payload ->> 'repairSeq')::bigint)),true);
    end loop;
  end if;
  v_recovery := jsonb_build_object(
    'waveId',p_wave_id,'islandEpoch',v_wave.reset_epoch,'closedAt',v_wave.closed_at,
    'closedHp',v_wave.closed_hp,
    'checkpointUid',case when v_is_expired then null else v_wave.checkpoint_uid end,
    'throughTick',case when v_is_expired then greatest(0,v_run.maximum_seconds*20-1)
                       else coalesce(v_wave.checkpoint_through_tick,greatest(0,v_wave.sealed_through_tick)) end,
    'inputHeadSeq',case when v_is_expired then v_wave.journal_head
                        else coalesce(v_wave.checkpoint_input_head_seq,v_wave.journal_head) end,
    'lastRepairSeq',v_wave.last_repair_seq,
    'basisRepairSeq',case when v_is_expired then v_basis
                          else coalesce(v_wave.checkpoint_basis_repair_seq,'{}'::jsonb) end);
  return v_result || jsonb_build_object('recovery',v_recovery);
end;
$$;

revoke all on function public.recovery_wave_finish(uuid,uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer,uuid,text,integer,bigint,bigint,jsonb,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.recovery_wave_finish(uuid,uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer,uuid,text,integer,bigint,bigint,jsonb,jsonb) to service_role;
comment on function public.recovery_wave_finish(uuid,uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer,uuid,text,integer,bigint,bigint,jsonb,jsonb) is
  'Validates a complete sealed health checkpoint, closes the first canonical HP vector and settles participant loot atomically. Later participants receive the immutable first close receipt and their own idempotent loot.';
-- <<<<<<<<<<<<<<<<<<<< end of 20261117040000_structure_recovery_api.sql <<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>> 20261117050000_structure_recovery_mutations.sql >>>>>>>>>>>>>>>>>>>>
-- T55 mutation hooks: settle using the previous policy, then refresh future state.
-- Legacy callers retain their old results and accounting; v0 only advances the state revision.

-- Call only after locking the changed owner island row. This serializes mutation
-- with admission/reset, materializes the old rate before any change, and gives
-- every successful call the same DB instant for settlement and refresh.
create or replace function public.structure_recovery_mutation_begin(p_island_owner uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_state public.island_recovery_state;
  v_now timestamptz;
  v_settlement jsonb;
begin
  if p_island_owner is null then
    raise exception 'bad_recovery_mutation';
  end if;
  insert into public.island_recovery_state (island_owner)
  values (p_island_owner)
  on conflict (island_owner) do nothing;
  select * into v_state from public.island_recovery_state
   where island_owner = p_island_owner for update;
  v_now := clock_timestamp();
  if v_state.recovery_version = 1 then
    v_settlement := public.structure_recovery_settle_locked(p_island_owner, v_now);
  else
    v_settlement := jsonb_build_object('status', 'legacy', 'recoveryVersion', 0);
  end if;
  return jsonb_build_object(
    'serverNow', v_now, 'recoveryVersion', v_state.recovery_version,
    'waveProtocol', v_state.wave_protocol, 'settlement', v_settlement
  );
end;
$$;
revoke all on function public.structure_recovery_mutation_begin(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.structure_recovery_mutation_begin(uuid) to service_role;

-- Call after the successful mutation. v0 rows carry only a CAS revision; v1
-- refresh uses the immutable static manifest and the helper's DB layout lookup.
create or replace function public.structure_recovery_mutation_finish(
  p_island_owner uuid,
  p_context jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz;
  v_version smallint;
begin
  v_now := (p_context ->> 'serverNow')::timestamptz;
  v_version := (p_context ->> 'recoveryVersion')::smallint;
  if p_island_owner is null or v_now is null or v_version not in (0, 1) then
    raise exception 'bad_recovery_mutation';
  end if;
  if v_version = 1 then
    return public.structure_recovery_refresh_locked(p_island_owner, v_now, null);
  end if;
  update public.island_recovery_state
     set revision = revision + 1, updated_at = v_now
   where island_owner = p_island_owner;
  if not found then
    raise exception 'recovery_state_incomplete';
  end if;
  return jsonb_build_object('status', 'legacy', 'recoveryVersion', 0);
end;
$$;
revoke all on function public.structure_recovery_mutation_finish(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.structure_recovery_mutation_finish(uuid, jsonb) to service_role;

create or replace function public.island_build(
  p_player_id     uuid,
  p_island_owner  uuid,
  p_plot          text,
  p_building_type text,
  p_action_uid    text,
  p_price         integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_ref     text;
  v_balance bigint;
  v_recovery jsonb;
begin
  if p_player_id is null or p_island_owner is null or p_plot is null
     or p_building_type is null
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_price is null or p_price < 1 then
    raise exception 'bad_island_build';
  end if;
  v_ref := 'island:' || p_action_uid;

  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  if exists (
    select 1 from public.wallet_transactions
     where player_id = p_player_id and reason = 'building_purchase' and ref = v_ref
  ) then
    return jsonb_build_object('status', 'done', 'level', 1, 'balance', v_balance, 'repeat', true);
  end if;

  -- Recovery is only defined for a persisted island, not a legacy home islet.
  perform 1 from public.islands where player_id = p_island_owner for update;
  if found then v_recovery := '{}'::jsonb; end if;
  -- The persisted owner row is locked before the legacy progress/islet row, so
  -- this mutation follows the same owner-first order as recovery admission.
  insert into public.islets (player_id, timber)
  values (p_island_owner, 0)
  on conflict (player_id) do nothing;
  perform 1 from public.islets where player_id = p_island_owner for update;

  if exists (
    select 1 from public.islet_buildings where player_id = p_island_owner and plot = p_plot
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'spot_taken');
  end if;
  if v_balance < p_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', p_price);
  end if;

  if v_recovery is not null then
    v_recovery := public.structure_recovery_mutation_begin(p_island_owner);
  end if;

  v_balance := public.apply_wallet_transaction(p_player_id, -p_price, 'building_purchase', v_ref);
  insert into public.islet_buildings
    (player_id, plot, building_type, level, coins_paid, timber_paid, ref)
  values
    (p_island_owner, p_plot, p_building_type, 1, p_price, 0, v_ref);
  -- 20261112080000_demolish.sql: who paid for this building, for a refund when it is torn down.
  insert into public.building_payments
    (island_owner, plot, building_ref, level, payer, coins, ref)
  values
    (p_island_owner, p_plot, v_ref, 1, p_player_id, p_price, v_ref);

  if v_recovery is not null then
    perform public.structure_recovery_mutation_finish(p_island_owner, v_recovery);
  end if;

  return jsonb_build_object('status', 'done', 'level', 1, 'balance', v_balance, 'repeat', false);
end;
$$;

revoke all on function public.island_build(uuid, uuid, text, text, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.island_build(uuid, uuid, text, text, text, integer) to service_role;

create or replace function public.island_upgrade(
  p_player_id      uuid,
  p_island_owner   uuid,
  p_plot           text,
  p_action_uid     text,
  p_prices         integer[],
  p_unlocked_level integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_ref      text;
  v_balance  bigint;
  v_building public.islet_buildings;
  v_price    integer;
  v_recovery jsonb;
begin
  if p_player_id is null or p_island_owner is null or p_plot is null or p_unlocked_level is null
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_prices is null or coalesce(array_length(p_prices, 1), 0) not between 1 and 5
     or exists (select 1 from unnest(p_prices) price where price is null or price < 1) then
    raise exception 'bad_upgrade';
  end if;
  v_ref := 'upgrade:' || p_action_uid;

  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  perform 1 from public.islands where player_id = p_island_owner for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_island');
  end if;
  v_recovery := public.structure_recovery_mutation_begin(p_island_owner);

  select * into v_building
    from public.islet_buildings
   where player_id = p_island_owner and plot = p_plot
     for update;

  if exists (
    select 1 from public.wallet_transactions
     where player_id = p_player_id and reason = 'building_purchase' and ref = v_ref
  ) then
    return jsonb_build_object(
      'status', 'done', 'level', coalesce(v_building.level, 0), 'balance', v_balance,
      'repeat', true
    );
  end if;

  if v_building.player_id is null then
    return jsonb_build_object('status', 'refused', 'reason', 'not_built');
  end if;
  if v_building.level >= array_length(p_prices, 1) then
    return jsonb_build_object('status', 'refused', 'reason', 'max_level');
  end if;
  if v_building.level + 1 > p_unlocked_level then
    return jsonb_build_object('status', 'refused', 'reason', 'locked');
  end if;
  if (v_recovery ->> 'recoveryVersion')::integer = 1
     and v_building.building_type in ('wall', 'cannon', 'mortar', 'harpoon', 'culverin', 'swivel')
     and (v_recovery #>> '{settlement,status}') = 'reserved' then
    return jsonb_build_object('status', 'refused', 'reason', 'wave_running');
  end if;
  if (v_recovery ->> 'recoveryVersion')::integer = 1
     and v_building.building_type in ('wall', 'cannon', 'mortar', 'harpoon', 'culverin', 'swivel')
     and not exists (
       select 1 from public.island_structure_health h
        where h.island_owner = p_island_owner and h.spot = p_plot
          and h.instance_id = v_building.recovery_instance_id and h.hp_units = 1000000
     ) then
    return jsonb_build_object('status', 'refused', 'reason', 'needs_repair');
  end if;
  v_price := p_prices[v_building.level + 1];
  if v_balance < v_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', v_price);
  end if;

  v_balance := public.apply_wallet_transaction(p_player_id, -v_price, 'building_purchase', v_ref);
  update public.islet_buildings
     set level = level + 1, coins_paid = coins_paid + v_price
   where player_id = p_island_owner and plot = p_plot
  returning * into v_building;
  -- 20261112080000_demolish.sql: who paid for this level, for a refund when it is torn down.
  insert into public.building_payments
    (island_owner, plot, building_ref, level, payer, coins, ref)
  values
    (p_island_owner, p_plot, v_building.ref, v_building.level, p_player_id, v_price, v_ref);

  perform public.structure_recovery_mutation_finish(p_island_owner, v_recovery);

  return jsonb_build_object(
    'status', 'done', 'level', v_building.level, 'balance', v_balance, 'repeat', false
  );
end;
$$;

revoke all on function public.island_upgrade(uuid, uuid, text, text, integer[], integer) from public, anon, authenticated, service_role;
grant execute on function public.island_upgrade(uuid, uuid, text, text, integer[], integer) to service_role;

create or replace function public.island_hire(
  p_player_id  uuid,
  p_crew       text,
  p_action_uid text,
  p_price      integer,
  p_max        integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_ref     text;
  v_balance bigint;
  v_island  public.islands;
  v_count   integer;
  v_recovery jsonb;
begin
  if p_player_id is null or p_crew is null
     or p_crew not in ('gunner', 'carpenter', 'lookout', 'guard')
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_price is null or p_price < 1 or p_max is null or p_max not between 1 and 10 then
    raise exception 'bad_hire';
  end if;
  v_ref := 'crew:' || p_action_uid;

  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  select * into v_island from public.islands where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_island');
  end if;
  v_count := case p_crew
    when 'gunner' then v_island.crew_gunner
    when 'carpenter' then v_island.crew_carpenter
    when 'lookout' then v_island.crew_lookout
    else v_island.crew_guard
  end;

  if exists (
    select 1 from public.wallet_transactions
     where player_id = p_player_id and reason = 'crew_hire' and ref = v_ref
  ) then
    return jsonb_build_object('status', 'done', 'count', v_count, 'balance', v_balance, 'repeat', true);
  end if;

  if v_count >= p_max then
    return jsonb_build_object('status', 'refused', 'reason', 'crew_full');
  end if;
  if v_balance < p_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', p_price);
  end if;

  v_recovery := public.structure_recovery_mutation_begin(p_player_id);

  v_balance := public.apply_wallet_transaction(p_player_id, -p_price, 'crew_hire', v_ref);
  update public.islands
     set crew_gunner = crew_gunner + (p_crew = 'gunner')::integer,
         crew_carpenter = crew_carpenter + (p_crew = 'carpenter')::integer,
         crew_lookout = crew_lookout + (p_crew = 'lookout')::integer,
         crew_guard = crew_guard + (p_crew = 'guard')::integer
   where player_id = p_player_id;

  perform public.structure_recovery_mutation_finish(p_player_id, v_recovery);

  return jsonb_build_object('status', 'done', 'count', v_count + 1, 'balance', v_balance, 'repeat', false);
end;
$$;

revoke all on function public.island_hire(uuid, text, text, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.island_hire(uuid, text, text, integer, integer) to service_role;

create or replace function public.island_research(
  p_player_id     uuid,
  p_island_owner  uuid,
  p_branch        text,
  p_action_uid    text,
  p_price         integer,
  p_unlock_wave   integer,
  p_tier          integer,
  p_choice        text,
  p_change        boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_ref     text;
  v_balance bigint;
  v_island  public.islands;
  v_row     public.island_research;
  v_before  text;
  v_recovery jsonb;
begin
  if p_player_id is null or p_island_owner is null
     or p_branch is null or p_branch not in ('cannon', 'mortar', 'wall', 'watchtower')
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_price is null or p_price < 1
     or p_unlock_wave is null or p_unlock_wave < 0
     or p_tier is null or p_tier < 1
     or p_change is null
     or (p_tier = 1 and p_choice is not null)
     or (p_tier in (2, 3) and (p_choice is null or (p_branch, p_tier, p_choice) not in (
       ('cannon', 2, 'rapid_2'), ('cannon', 2, 'long_guns'),
       ('mortar', 2, 'quick_fuse'), ('mortar', 2, 'heavy_shells'),
       ('wall', 2, 'mason_drill'), ('wall', 2, 'thick_walls'),
       ('watchtower', 2, 'lookout_drill'), ('watchtower', 2, 'high_tower'),
       ('cannon', 3, 'broadside'), ('cannon', 3, 'grapeshot'),
       ('mortar', 3, 'shockwave'), ('mortar', 3, 'inferno'),
       ('wall', 3, 'bastion'), ('wall', 3, 'thorns'),
       ('watchtower', 3, 'eagle_eye'), ('watchtower', 3, 'war_drums')
     ))) then
    raise exception 'bad_research';
  end if;
  v_ref := 'research:' || p_action_uid;

  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  select * into v_island from public.islands where player_id = p_island_owner for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_island');
  end if;

  if exists (
    select 1 from public.wallet_transactions
     where player_id = p_player_id and reason = 'tech_research' and ref = v_ref
  ) then
    select * into v_row from public.island_research
     where island_owner = p_island_owner and branch = p_branch;
    return jsonb_build_object(
      'status', 'done', 'branch', p_branch, 'tier', coalesce(v_row.tier, 0), 'choice', p_choice,
      'balance', v_balance, 'repeat', true
    );
  end if;

  if p_player_id <> p_island_owner and not exists (
    select 1 from public.island_members
     where island_owner = p_island_owner and player_id = p_player_id and left_at is null
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'not_member');
  end if;
  v_recovery := public.structure_recovery_mutation_begin(p_island_owner);
  -- No research step while a wave runs on this island: a tier-3 change takes the old
  -- capstone off the towers, and the wave is reading them. The same test as
  -- island_demolish() (20261112080000_demolish.sql); the island row is locked above.
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
  if p_tier > 3 then
    return jsonb_build_object('status', 'refused', 'reason', 'top_tier');
  end if;
  if v_island.wave_best < p_unlock_wave then
    return jsonb_build_object('status', 'refused', 'reason', 'locked');
  end if;

  select * into v_row from public.island_research
   where island_owner = p_island_owner and branch = p_branch
     for update;

  if p_tier = 1 then
    if v_row.island_owner is not null then
      return jsonb_build_object('status', 'refused', 'reason', 'known');
    end if;
  else
    if v_row.island_owner is null or v_row.tier < p_tier - 1 then
      return jsonb_build_object('status', 'refused', 'reason', 'needs_tier');
    end if;
    v_before := case p_tier when 2 then v_row.choice_2 else v_row.choice_3 end;
    if v_before = p_choice then
      return jsonb_build_object('status', 'refused', 'reason', 'known');
    end if;
    if v_before is not null and not p_change then
      return jsonb_build_object('status', 'refused', 'reason', 'closed', 'chosen', v_before);
    end if;
  end if;
  if v_balance < p_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', p_price);
  end if;

  v_balance := public.apply_wallet_transaction(p_player_id, -p_price, 'tech_research', v_ref);
  if p_tier = 1 then
    insert into public.island_research (island_owner, branch, researched_by, coins_paid, ref)
    values (p_island_owner, p_branch, p_player_id, p_price, v_ref);
  else
    update public.island_research
       set tier       = greatest(tier, p_tier),
           choice_2   = case when p_tier = 2 then p_choice else choice_2 end,
           choice_3   = case when p_tier = 3 then p_choice else choice_3 end,
           coins_paid = coins_paid + p_price,
           ref        = v_ref
     where island_owner = p_island_owner and branch = p_branch;
    -- A new tier-3 choice: the old capstone leaves every tower of the island that had it.
    if p_tier = 3 and v_before is not null then
      update public.islet_buildings set spec = null
       where player_id = p_island_owner and building_type = p_branch and spec = v_before;
    end if;
  end if;

  perform public.structure_recovery_mutation_finish(p_island_owner, v_recovery);

  return jsonb_build_object(
    'status', 'done', 'branch', p_branch, 'tier', greatest(coalesce(v_row.tier, 0), p_tier),
    'choice', p_choice, 'balance', v_balance, 'repeat', false
  );
end;
$$;

revoke all on function public.island_research(uuid, uuid, text, text, integer, integer, integer, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.island_research(uuid, uuid, text, text, integer, integer, integer, text, boolean) to service_role;

create or replace function public.island_specialise(
  p_player_id     uuid,
  p_island_owner  uuid,
  p_plot          text,
  p_branch        text,
  p_spec          text,
  p_action_uid    text,
  p_price         integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_building public.islet_buildings;
  v_ref      text;
  v_balance  bigint;
  v_recovery jsonb;
  v_changed  integer;
begin
  if p_player_id is null or p_island_owner is null or p_plot is null
     or p_branch is null or p_spec is null
     or (p_branch, p_spec) not in (
       ('cannon', 'rapid'), ('cannon', 'heavy'), ('cannon', 'chain'),
       ('mortar', 'cluster'), ('mortar', 'fire_pot'), ('mortar', 'long_range'),
       ('wall', 'stone'), ('wall', 'spiked'), ('wall', 'quick_mend'),
       ('watchtower', 'spotter'), ('watchtower', 'signal_fire'),
       ('house', 'barracks'), ('house', 'tavern'), ('house', 'workshop'),
       ('cannon', 'broadside'), ('cannon', 'grapeshot'),
       ('mortar', 'shockwave'), ('mortar', 'inferno'),
       ('wall', 'bastion'), ('wall', 'thorns'),
       ('watchtower', 'eagle_eye'), ('watchtower', 'war_drums')
     )
     -- D051: a tower skill has a price and a click id; a house role is free.
     or p_price is null
     or (p_branch = 'house' and p_price <> 0)
     or (p_branch <> 'house' and (p_price < 1
         or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$')) then
    raise exception 'bad_specialise';
  end if;
  v_ref := case when p_branch = 'house' then null else 'towerskill:' || p_action_uid end;

  -- The payer's wallet first, then the island row, then the building.
  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  -- The island row first, as every write to an island's buildings does.
  perform 1 from public.islands where player_id = p_island_owner for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_island');
  end if;
  v_recovery := public.structure_recovery_mutation_begin(p_island_owner);

  -- A repeated click: answered as done, nothing paid again.
  if v_ref is not null and exists (
    select 1 from public.wallet_transactions
     where player_id = p_player_id and reason = 'tower_skill' and ref = v_ref
  ) then
    return jsonb_build_object(
      'status', 'done', 'plot', p_plot, 'spec', p_spec, 'price', 0, 'balance', v_balance,
      'repeat', true
    );
  end if;

  if p_player_id <> p_island_owner and not exists (
    select 1 from public.island_members
     where island_owner = p_island_owner and player_id = p_player_id and left_at is null
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'not_member');
  end if;

  select * into v_building
    from public.islet_buildings
   where player_id = p_island_owner and plot = p_plot
     for update;
  if v_building.player_id is null then
    return jsonb_build_object('status', 'refused', 'reason', 'not_built');
  end if;
  if v_building.building_type <> p_branch then
    return jsonb_build_object('status', 'refused', 'reason', 'wrong_kind');
  end if;
  -- A house role (docs/GAME-V3.md "Houses") needs no research, only a house of level 2 or more.
  if p_branch = 'house' then
    if v_building.level < 2 then
      return jsonb_build_object('status', 'refused', 'reason', 'house_level');
    end if;
  elsif not exists (
    select 1 from public.island_research where island_owner = p_island_owner and branch = p_branch
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'not_researched');
  end if;
  -- A capstone (tier 3): only the one the island chose.
  if p_spec in ('broadside', 'grapeshot', 'shockwave', 'inferno', 'bastion', 'thorns', 'eagle_eye', 'war_drums')
     and not exists (
       select 1 from public.island_research
        where island_owner = p_island_owner and branch = p_branch and choice_3 = p_spec
     ) then
    return jsonb_build_object('status', 'refused', 'reason', 'not_researched');
  end if;

  -- The skill it has already (or a house role): nothing to pay.
  if v_building.spec is not distinct from p_spec or p_branch = 'house' then
    update public.islet_buildings set spec = p_spec
     where player_id = p_island_owner and plot = p_plot and spec is distinct from p_spec;
    get diagnostics v_changed = row_count;
    if v_changed > 0 then
      perform public.structure_recovery_mutation_finish(p_island_owner, v_recovery);
    end if;
    return jsonb_build_object(
      'status', 'done', 'plot', p_plot, 'spec', p_spec, 'price', 0, 'balance', v_balance,
      'repeat', false
    );
  end if;

  if v_balance < p_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', p_price);
  end if;
  v_balance := public.apply_wallet_transaction(p_player_id, -p_price, 'tower_skill', v_ref);
  update public.islet_buildings set spec = p_spec
   where player_id = p_island_owner and plot = p_plot;
  perform public.structure_recovery_mutation_finish(p_island_owner, v_recovery);
  return jsonb_build_object(
    'status', 'done', 'plot', p_plot, 'spec', p_spec, 'price', p_price, 'balance', v_balance,
    'repeat', false
  );
end;
$$;

revoke all on function public.island_specialise(uuid, uuid, text, text, text, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.island_specialise(uuid, uuid, text, text, text, text, integer) to service_role;

create or replace function public.island_tower_tree(
  p_player_id     uuid,
  p_island_owner  uuid,
  p_plot          text,
  p_kind          text,
  p_path          text,
  p_tier          integer,
  p_action_uid    text,
  p_price         integer,
  p_unlock_wave   integer,
  p_level         integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_building public.islet_buildings;
  v_wave     integer;
  v_ref      text;
  v_balance  bigint;
  v_now      integer;
  v_other    integer;
  v_recovery jsonb;
begin
  if p_player_id is null or p_island_owner is null or p_plot is null
     or p_kind is null or p_kind not in ('cannon', 'mortar', 'harpoon', 'culverin', 'swivel')
     or p_path is null or p_path not in ('a', 'b')
     or p_tier is null or p_tier not between 1 and 3
     or p_price is null or p_price < 1
     or p_unlock_wave is null or p_unlock_wave < 0
     or p_level is null or p_level not between 1 and 5
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$' then
    raise exception 'bad_tower_tree';
  end if;
  v_ref := 'towertree:' || p_action_uid;

  -- The payer's wallet first, then the island row, then the building.
  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  select wave_best into v_wave from public.islands where player_id = p_island_owner for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_island');
  end if;
  v_recovery := public.structure_recovery_mutation_begin(p_island_owner);

  -- A repeated click: answered as done, nothing paid again.
  if exists (
    select 1 from public.wallet_transactions
     where player_id = p_player_id and reason = 'tower_tree' and ref = v_ref
  ) then
    return jsonb_build_object(
      'status', 'done', 'plot', p_plot, 'path', p_path, 'tier', p_tier, 'price', 0,
      'balance', v_balance, 'repeat', true
    );
  end if;

  if p_player_id <> p_island_owner and not exists (
    select 1 from public.island_members
     where island_owner = p_island_owner and player_id = p_player_id and left_at is null
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'not_member');
  end if;

  select * into v_building
    from public.islet_buildings
   where player_id = p_island_owner and plot = p_plot
     for update;
  if v_building.player_id is null then
    return jsonb_build_object('status', 'refused', 'reason', 'not_built');
  end if;
  if v_building.building_type <> p_kind then
    return jsonb_build_object('status', 'refused', 'reason', 'wrong_kind');
  end if;
  if v_building.level < p_level then
    return jsonb_build_object('status', 'refused', 'reason', 'needs_level');
  end if;
  if v_wave < p_unlock_wave then
    return jsonb_build_object('status', 'refused', 'reason', 'locked');
  end if;

  v_now   := case when p_path = 'a' then v_building.tree_a else v_building.tree_b end;
  v_other := case when p_path = 'a' then v_building.tree_b else v_building.tree_a end;
  if v_now >= p_tier then
    return jsonb_build_object('status', 'refused', 'reason', 'known');
  end if;
  if v_now < p_tier - 1 then
    return jsonb_build_object('status', 'refused', 'reason', 'needs_tier');
  end if;
  -- The Bloons rule: one path may pass tier 1, never both.
  if p_tier > 1 and v_other > 1 then
    return jsonb_build_object('status', 'refused', 'reason', 'closed');
  end if;

  if v_balance < p_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', p_price);
  end if;
  v_balance := public.apply_wallet_transaction(p_player_id, -p_price, 'tower_tree', v_ref);
  if p_path = 'a' then
    update public.islet_buildings set tree_a = p_tier
     where player_id = p_island_owner and plot = p_plot;
  else
    update public.islet_buildings set tree_b = p_tier
     where player_id = p_island_owner and plot = p_plot;
  end if;
  perform public.structure_recovery_mutation_finish(p_island_owner, v_recovery);
  return jsonb_build_object(
    'status', 'done', 'plot', p_plot, 'path', p_path, 'tier', p_tier, 'price', p_price,
    'balance', v_balance, 'repeat', false
  );
end;
$$;

revoke all on function public.island_tower_tree(uuid, uuid, text, text, text, integer, text, integer, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.island_tower_tree(uuid, uuid, text, text, text, integer, text, integer, integer, integer) to service_role;

create or replace function public.island_move(
  p_island_owner uuid,
  p_mover        uuid,
  p_plot         text,
  p_x_half       integer,
  p_z_half       integer,
  p_seen         jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_now jsonb;
  v_recovery jsonb;
begin
  if p_island_owner is null or p_mover is null or p_plot is null
     or p_x_half is null or p_z_half is null or jsonb_typeof(p_seen) is distinct from 'array' then
    raise exception 'bad_move';
  end if;

  perform 1 from public.islands where player_id = p_island_owner for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_island');
  end if;
  v_recovery := public.structure_recovery_mutation_begin(p_island_owner);

  -- No move under a running wave: it fights the defenses where they stood at its start.
  -- The same test as island_demolish() (20261112080000_demolish.sql).
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

  -- The compare-and-swap: the rows now must be the rows the server checked.
  select coalesce(jsonb_agg(jsonb_build_object('plot', plot, 'x_half', x_half, 'z_half', z_half)
                            order by plot collate "C"), '[]'::jsonb)
    into v_now
    from public.island_layout
   where island_owner = p_island_owner;
  if v_now is distinct from p_seen then
    return jsonb_build_object('status', 'refused', 'reason', 'busy');
  end if;

  insert into public.island_layout (island_owner, plot, x_half, z_half, moved_by)
  values (p_island_owner, p_plot, p_x_half, p_z_half, p_mover)
  on conflict (island_owner, plot) do update
    set x_half = excluded.x_half, z_half = excluded.z_half,
        moved_by = excluded.moved_by, moved_at = now();
  perform public.structure_recovery_mutation_finish(p_island_owner, v_recovery);
  return jsonb_build_object('status', 'done');
end;
$$;

revoke all on function public.island_move(uuid, uuid, text, integer, integer, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.island_move(uuid, uuid, text, integer, integer, jsonb) to service_role;

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

  -- Step 1: the same click again is answered from its record.
  select * into v_done
    from public.building_demolitions where demolished_by = p_player_id and ref = v_ref;
  if found then
    return jsonb_build_object(
      'status', 'done', 'plot', v_done.plot, 'kind', v_done.building_type, 'level', v_done.level,
      'refunds', v_done.refunds, 'repeat', true
    );
  end if;

  -- Step 2: only an island build spot, on an island, by a member of its game.
  if p_plot !~ '^(wall_([1-9]|1[0-2])|cannon_([1-9]|1[01])|tower_1|house_[12])$' then
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

create or replace function public.island_fresh_start(
  p_player_id     uuid,
  p_action_uid    text,
  p_confirm_code    text,
  p_starting_coins  integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_balance        bigint;
  v_island         public.islands;
  v_typed          text;
  v_done           jsonb;
  v_counts         jsonb;
  v_coins          bigint := 0;
  v_saves          integer := 0;
  v_buildings      integer := 0;
  v_research       integer := 0;
  v_layout         integer := 0;
  v_arsenal_moves  integer := 0;
  v_arsenal_copies integer := 0;
  v_wall_records   integer := 0;
  v_wave_rules     integer := 0;
  v_waves          integer := 0;
  v_members        integer := 0;
  v_recovery       jsonb;
begin
  if p_player_id is null or p_confirm_code is null
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_starting_coins is null or p_starting_coins not between 1 and 100000 then
    raise exception 'bad_fresh_start';
  end if;

  -- Lock 1: the wallet.
  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  -- Lock 2: the player's own island (the lock wave_start() takes). No island of
  -- their own: there is nothing they may reset.
  select * into v_island from public.islands where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'not_owner');
  end if;

  -- A repeat of a reset that went through: the same answer, nothing changed.
  select counts into v_done
    from public.island_resets
   where island_owner = p_player_id and action_uid = p_action_uid;
  if found then
    return jsonb_build_object('status', 'done', 'repeat', true, 'balance', v_balance,
                              'counts', v_done);
  end if;

  -- The typed code: no spaces, dashes or case, and "ISLE" in front is allowed.
  v_typed := upper(regexp_replace(left(p_confirm_code, 32), '[[:space:]-]', '', 'g'));
  if char_length(v_typed) = 9 and left(v_typed, 4) = 'ISLE' then
    v_typed := substr(v_typed, 5);
  end if;
  if v_typed is distinct from v_island.code then
    -- Somebody else's island (a friend's game): only its owner may reset it.
    if exists (select 1 from public.islands where code = v_typed) then
      return jsonb_build_object('status', 'refused', 'reason', 'not_owner');
    end if;
    return jsonb_build_object('status', 'refused', 'reason', 'wrong_code');
  end if;

  v_recovery := public.structure_recovery_mutation_begin(p_player_id);

  -- No reset while a wave runs on this island: use the canonical post-lock
  -- recovery boundary in v1, and keep the legacy transaction-time guard in v0.
  if (v_recovery ->> 'recoveryVersion')::integer = 1 then
    if v_recovery #>> '{settlement,status}' = 'reserved' then
      return jsonb_build_object('status', 'refused', 'reason', 'wave_running');
    end if;
  elsif exists (
    select 1 from public.wave_runs where island_owner = p_player_id
      and finished_at is null and starts_at + make_interval(secs => maximum_seconds) >= now()
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'wave_running');
  end if;

  -- 1. The wallet to the starting coins, through the one wallet function.
  if v_balance <> p_starting_coins then
    v_coins := p_starting_coins - v_balance;
    v_balance := public.apply_wallet_transaction(
      p_player_id, v_coins, 'fresh_start', 'reset:' || p_action_uid
    );
  end if;

  -- 2. The cloud save empty (the row stays).
  update public.saves set data = '{}'::jsonb
   where player_id = p_player_id and data <> '{}'::jsonb;
  get diagnostics v_saves = row_count;

  -- 3. Every building of the owner except the cabin.
  delete from public.islet_buildings
   where player_id = p_player_id and building_type <> 'cabin';
  get diagnostics v_buildings = row_count;

  -- 4. Research, moved spots, the arsenal (clicks first: they point at the copies)
  --    and the wall records.
  delete from public.island_research where island_owner = p_player_id;
  get diagnostics v_research = row_count;
  delete from public.island_layout where island_owner = p_player_id;
  get diagnostics v_layout = row_count;
  delete from public.arsenal_moves where island_owner = p_player_id;
  get diagnostics v_arsenal_moves = row_count;
  delete from public.arsenal_copies where island_owner = p_player_id;
  get diagnostics v_arsenal_copies = row_count;
  delete from public.island_wall_records where island_owner = p_player_id;
  get diagnostics v_wall_records = row_count;

  -- 5. The island's waves, after their kept rules (participants and revives go
  --    with each wave by cascade).
  delete from public.wave_rules
   where wave_id in (select id from public.wave_runs where island_owner = p_player_id);
  get diagnostics v_wave_rules = row_count;
  delete from public.wave_runs where island_owner = p_player_id;
  get diagnostics v_waves = row_count;

  -- 6. The island row back to the start (both weapon columns in one update, so
  --    the check rule "the carried weapon is one you own" holds).
  update public.islands
     set wave_best       = default,
         won_wave_best   = default,
         flags           = default,
         next_wave       = default,
         crew_gunner     = default,
         crew_carpenter  = default,
         crew_lookout    = default,
         crew_guard      = default,
         captain_level   = default,
         captain_skills  = default,
         captain_role    = default,
         wreck_paid      = default,
         weapons_owned   = '{musket}',
         weapon_equipped = 'musket'
   where player_id = p_player_id;

  -- 7. The members stay; counted for the answer only.
  select count(*) into v_members
    from public.island_members
   where island_owner = p_player_id and role = 'member' and left_at is null;

  v_counts := jsonb_build_object(
    'coins', v_coins,
    'saves', v_saves,
    'buildings', v_buildings,
    'research', v_research,
    'layout', v_layout,
    'arsenalMoves', v_arsenal_moves,
    'arsenalCopies', v_arsenal_copies,
    'wallRecords', v_wall_records,
    'waveRules', v_wave_rules,
    'waves', v_waves,
    'membersKept', v_members
  );
  insert into public.island_resets (island_owner, action_uid, counts)
  values (p_player_id, p_action_uid, v_counts);

  -- Advance the current epoch while retaining all immutable wave and repair history.
  update public.island_recovery_state
     set reset_epoch = gen_random_uuid(), current_wave_id = null, reserved_at = null,
         starts_at = null, expires_at = null, revision = revision + 1,
         updated_at = (v_recovery ->> 'serverNow')::timestamptz
   where island_owner = p_player_id;
  delete from public.island_structure_health where island_owner = p_player_id;

  return jsonb_build_object('status', 'done', 'repeat', false, 'balance', v_balance,
                            'counts', v_counts);
end;
$$;

revoke all on function public.island_fresh_start(uuid, text, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.island_fresh_start(uuid, text, text, integer) to service_role;

create or replace function public.island_learn_skill(
  p_player_id        uuid,
  p_skill            text,
  p_action_uid       text,
  p_tree             jsonb,
  p_waves_per_point  integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_ref      text;
  v_island   public.islands;
  v_entry    jsonb;
  v_needs    text[];
  v_excludes text;
  v_role     text;
  v_cost     integer;
  v_spent    integer;
  v_points   integer;
  v_recovery jsonb;
begin
  if p_player_id is null or p_skill is null
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_tree is null or jsonb_typeof(p_tree) <> 'array'
     or jsonb_array_length(p_tree) not between 1 and 21
     or p_waves_per_point is null or p_waves_per_point < 1 then
    raise exception 'bad_skill_learn';
  end if;
  v_ref := 'skill:' || p_action_uid;

  select * into v_island from public.islands where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_island');
  end if;

  if exists (
    select 1 from public.captain_skill_learns where player_id = p_player_id and ref = v_ref
  ) then
    v_spent := coalesce((
      select sum((entry ->> 'cost')::integer)
        from jsonb_array_elements(p_tree) as t(entry)
       where entry ->> 'skill' = any (v_island.captain_skills)
    ), 0);
    return jsonb_build_object(
      'status', 'done', 'skills', to_jsonb(v_island.captain_skills),
      'points', greatest(0, v_island.won_wave_best / p_waves_per_point - v_spent), 'repeat', true
    );
  end if;

  v_recovery := public.structure_recovery_mutation_begin(p_player_id);

  if (v_recovery ->> 'recoveryVersion')::integer = 1
     and p_skill = any (array[
       'quick_fix', 'long_reach', 'sturdy_planks', 'master_shipwright',
       'swift_hammer', 'wide_arc', 'grand_engineer'
     ]::text[]) then
    return jsonb_build_object('status', 'refused', 'reason', 'retired_skill');
  end if;

  select entry into v_entry from jsonb_array_elements(p_tree) as t(entry) where entry ->> 'skill' = p_skill;
  if v_entry is null then
    return jsonb_build_object('status', 'refused', 'reason', 'bad_skill');
  end if;
  v_needs := case jsonb_typeof(v_entry -> 'needs')
    when 'array' then array(select jsonb_array_elements_text(v_entry -> 'needs'))
    when 'string' then array[v_entry ->> 'needs']
    else '{}'::text[]
  end;
  v_excludes := v_entry ->> 'excludes';
  v_role := v_entry ->> 'role';
  v_cost := (v_entry ->> 'cost')::integer;
  if v_cost is null or v_cost < 1 then
    raise exception 'bad_skill_learn';
  end if;

  if p_skill = any (v_island.captain_skills) then
    return jsonb_build_object('status', 'refused', 'reason', 'known');
  end if;
  if v_excludes is not null and v_excludes = any (v_island.captain_skills) then
    return jsonb_build_object('status', 'refused', 'reason', 'closed', 'twin', v_excludes);
  end if;
  if cardinality(v_needs) > 0 and not (v_needs && v_island.captain_skills) then
    return jsonb_build_object('status', 'refused', 'reason', 'locked', 'needs', to_jsonb(v_needs));
  end if;
  if v_role is not null and v_island.captain_role is distinct from v_role then
    return jsonb_build_object('status', 'refused', 'reason', 'wrong_role', 'role', v_role);
  end if;

  v_spent := coalesce((
    select sum((entry ->> 'cost')::integer)
      from jsonb_array_elements(p_tree) as t(entry)
     where entry ->> 'skill' = any (v_island.captain_skills)
  ), 0);
  -- Integer division: floor for whole, non-negative numbers.
  v_points := v_island.won_wave_best / p_waves_per_point - v_spent;
  if v_points < v_cost then
    return jsonb_build_object('status', 'refused', 'reason', 'no_points', 'points', greatest(0, v_points));
  end if;

  insert into public.captain_skill_learns (player_id, ref, skill) values (p_player_id, v_ref, p_skill);
  update public.islands
     set captain_skills = array_append(captain_skills, p_skill)
   where player_id = p_player_id
  returning * into v_island;

  perform public.structure_recovery_mutation_finish(p_player_id, v_recovery);

  return jsonb_build_object(
    'status', 'done', 'skills', to_jsonb(v_island.captain_skills),
    'points', v_points - v_cost, 'repeat', false
  );
end;
$$;

revoke all on function public.island_learn_skill(uuid, text, text, jsonb, integer) from public, anon, authenticated, service_role;
grant execute on function public.island_learn_skill(uuid, text, text, jsonb, integer) to service_role;
-- <<<<<<<<<<<<<<<<<<<< end of 20261117050000_structure_recovery_mutations.sql <<<<<<<<<<<<<<<<<<<<

-- Register the versions as applied.
insert into supabase_migrations.schema_migrations (version, name)
values
  ('20261117020000', 'structure_recovery'),
  ('20261117025000', 'legacy_wave_locks'),
  ('20261117030000', 'paid_structure_repair'),
  ('20261117040000', 'structure_recovery_api'),
  ('20261117050000', 'structure_recovery_mutations')
on conflict (version) do nothing;

commit;
