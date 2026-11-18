-- MP-ECO-07 personal progression and generation-specific Engineer commitments.
-- Used by opt-in profile adapters and private atomic build/bell/finish wrappers.
-- Requires MP-ECO-02. This migration initializes no player or island.

create table if not exists public.personal_captain_profiles (
  player_id uuid primary key references public.profiles(id) on delete cascade,
  level smallint not null check (level between 1 and 5),
  won_wave_best integer not null check (won_wave_best >= 0),
  earned_points integer not null check (earned_points >= 0),
  skills text[] not null default '{}',
  role text check (role in ('medic','engineer','gunner')),
  rules jsonb not null check (jsonb_typeof(rules) = 'object'),
  pending_engineer_commitment_id uuid,
  assignment_wave_id uuid,
  assignment_engineer_commitment_id uuid,
  revision numeric not null default 0 check (
    revision::text not in ('NaN','Infinity','-Infinity') and revision = trunc(revision)
    and revision >= 0),
  check (assignment_wave_id is not null or assignment_engineer_commitment_id is null)
);
comment on table public.personal_captain_profiles is
  'Personal state independent of island reset. Dedicated class-three lock anchor, pinned rules and at most one global assignment. Initial import needs explicit checked shared mode; no live conversion is performed by the migration.';

create table if not exists public.personal_engineer_commitments (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.personal_captain_profiles(player_id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  satisfied_wave_id uuid,
  satisfied_at timestamptz,
  unique (player_id,id),
  check ((satisfied_wave_id is null) = (satisfied_at is null))
);
comment on table public.personal_engineer_commitments is
  'One personal generation for any number of discounted pre-wave purchases; only a matching confirmed normal completion satisfies it. No island/reset foreign key.';

alter table public.personal_captain_profiles
  drop constraint if exists personal_captain_pending_generation;
alter table public.personal_captain_profiles
  add constraint personal_captain_pending_generation
  foreign key (player_id,pending_engineer_commitment_id)
  references public.personal_engineer_commitments(player_id,id) deferrable initially deferred;

create table if not exists public.personal_captain_wave_snapshots (
  player_id uuid not null references public.personal_captain_profiles(player_id) on delete cascade,
  wave_id uuid not null,
  played_wave integer not null check (played_wave > 0),
  engineer_commitment_id uuid,
  profile jsonb not null,
  active_skills text[] not null,
  primary key (player_id,wave_id)
);
comment on table public.personal_captain_wave_snapshots is
  'Immutable personal bell snapshot; no cascade from resettable wave_runs. Dynamic combat/session state remains owned by the wave protocol.';

create table if not exists public.personal_captain_operations (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.personal_captain_profiles(player_id) on delete cascade,
  action_uid text not null check (action_uid ~ '^[A-Za-z0-9_-]{8,64}$'),
  fingerprint jsonb not null,
  result jsonb not null,
  unique (player_id,action_uid)
);
comment on table public.personal_captain_operations is
  'Immutable identity/effect of free personal changes; retries return the old effect without charging money or changing a later profile again.';

create table if not exists public.personal_captain_completion_effects (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.personal_captain_profiles(player_id) on delete cascade,
  wave_id uuid not null,
  fingerprint jsonb not null,
  result jsonb not null,
  unique (player_id,wave_id)
);
comment on table public.personal_captain_completion_effects is
  'Once-only personal effect of trusted canonical completion. MP-ECO-03 owns the authoritative durable outcome/participation receipt; this table owns consumption identity.';

do $$
declare v_name text;
begin
  foreach v_name in array array['personal_captain_profiles','personal_engineer_commitments',
    'personal_captain_wave_snapshots','personal_captain_operations',
    'personal_captain_completion_effects'] loop
    execute format('alter table public.%I enable row level security',v_name);
    execute format('revoke all on table public.%I from public,anon,authenticated,service_role',v_name);
  end loop;
end $$;

create or replace function public.personal_captain_snapshot_locked(p_player_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.personal_captain_profiles;
  v_spent integer;
  v_commitment jsonb;
begin
  select * into v_profile from public.personal_captain_profiles where player_id=p_player_id;
  if not found then raise exception 'captain_not_initialized'; end if;
  select coalesce(sum((entry->>'cost')::integer),0) into v_spent
    from jsonb_array_elements(v_profile.rules->'tree') as t(entry)
    where entry->>'skill'=any(v_profile.skills);
  if v_spent>v_profile.earned_points then raise exception 'captain_conversion_required'; end if;
  if v_profile.pending_engineer_commitment_id is not null then
    v_commitment := jsonb_build_object('id',v_profile.pending_engineer_commitment_id,
      'state',case when v_profile.assignment_engineer_commitment_id=
        v_profile.pending_engineer_commitment_id then 'attached' else 'pending' end,
      'waveId',case when v_profile.assignment_engineer_commitment_id=
        v_profile.pending_engineer_commitment_id then v_profile.assignment_wave_id end);
  end if;
  return jsonb_build_object('status','ok','captain',jsonb_build_object(
    'progressionVersion',1,'level',v_profile.level,'personalBestWave',v_profile.won_wave_best,
    'role',v_profile.role,'revision',v_profile.revision::text,
    'assignmentWaveId',v_profile.assignment_wave_id,'engineerCommitment',v_commitment,
    'canRespec',v_profile.assignment_wave_id is null,
    'respecBlockedReason',case when v_profile.assignment_wave_id is not null
      then 'captain_assigned' end,
    'roleLockedReason',case when v_profile.assignment_wave_id is not null then 'captain_assigned'
      when v_profile.pending_engineer_commitment_id is not null then 'engineer_bound' end),
    'skills',jsonb_build_object('points',v_profile.earned_points-v_spent,
      'earned',v_profile.earned_points,'spent',v_spent,'known',to_jsonb(v_profile.skills),
      'role',v_profile.role));
end;
$$;

create or replace function public.personal_captain_lock_state_locked(p_player_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.profiles where id=p_player_id for update;
  if not found then raise exception 'captain_not_initialized'; end if;
  perform 1 from public.personal_captain_profiles where player_id=p_player_id for update;
  if not found then raise exception 'captain_not_initialized'; end if;
  return public.personal_captain_snapshot_locked(p_player_id);
end;
$$;
comment on function public.personal_captain_lock_state_locked(uuid) is
  'Private class-three anchor: call after scope/accounts and before island/domain locks. Refuses missing initialization; never locks a legacy island as a personal substitute.';

create or replace function public.personal_captain_initialize(
  p_actor_id uuid,p_island_owner uuid,p_expected_epoch uuid,p_rules jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_context jsonb;
  v_legacy public.islands;
  v_known text[];
  v_spent integer;
  v_earned integer;
  v_rules jsonb;
  v_existing boolean;
begin
  if p_actor_id is null or p_island_owner is null or p_expected_epoch is null
    or jsonb_typeof(p_rules) is distinct from 'object'
    or p_rules->>'version' is distinct from '1'
    or coalesce(p_rules->>'wavesPerPoint','') !~ '^[1-9][0-9]*$'
    or coalesce(p_rules->>'roleLevel','') !~ '^[1-5]$'
    or jsonb_typeof(p_rules->'tree') is distinct from 'array'
    or jsonb_typeof(p_rules->'retired') is distinct from 'array'
    or jsonb_typeof(p_rules->'levelWaves') is distinct from 'array'
    or jsonb_array_length(p_rules->'levelWaves') not between 1 and 5
    or p_rules#>>'{levelWaves,0}' is distinct from '0'
    or jsonb_array_length(p_rules->'tree') not between 1 and 21 then
    raise exception 'invalid_captain_rules';
  end if;
  if exists (select 1 from jsonb_array_elements(p_rules->'tree') as t(entry)
    where coalesce(entry->>'skill','') !~ '^[a-z][a-z0-9_]{1,39}$'
      or coalesce(entry->>'cost','') !~ '^[1-9][0-9]*$')
    or (select count(*) from jsonb_array_elements(p_rules->'tree')) <>
       (select count(distinct entry->>'skill') from jsonb_array_elements(p_rules->'tree') as t(entry))
    or exists (select 1 from jsonb_array_elements_text(p_rules->'levelWaves') as t(value)
      where value !~ '^(0|[1-9][0-9]*)$') then raise exception 'invalid_captain_rules'; end if;
  perform public.island_treasury_lock_scope(p_island_owner);
  v_context := public.island_economy_context(p_island_owner);
  if v_context->>'status' is distinct from 'ok' then
    return jsonb_build_object('status','refused','reason','economy_context_required');
  end if;
  perform 1 from public.island_economy_accounts
    where id=(v_context#>>'{economy,accountId}')::uuid for update;
  perform 1 from public.profiles where id=p_actor_id for update;
  if not found then raise exception 'captain_not_initialized'; end if;
  select rules into v_rules from public.personal_captain_profiles
    where player_id=p_actor_id for update;
  v_existing := found;
  -- Personal anchor precedes every legacy island lock, including a visitor's own island.
  perform 1 from public.islands where player_id in (p_actor_id,p_island_owner)
    order by player_id for update;
  v_context := public.island_economy_context(p_island_owner);
  if v_context#>>'{economy,runEpoch}' is distinct from p_expected_epoch::text then
    return jsonb_build_object('status','refused','reason','economy_epoch_mismatch');
  end if;
  if v_context->>'admissionState' is distinct from 'active' then
    return jsonb_build_object('status','refused','reason','economy_path_unavailable');
  end if;
  if p_actor_id<>p_island_owner and not exists (select 1 from public.island_members
    where island_owner=p_island_owner and player_id=p_actor_id and left_at is null) then
    return jsonb_build_object('status','refused','reason','not_member');
  end if;
  if v_existing then
    if v_rules<>p_rules then
      return jsonb_build_object('status','refused','reason','captain_rules_mismatch');
    end if;
    return public.personal_captain_lock_state_locked(p_actor_id);
  end if;
  -- Admission/legacy guards must be integrated before this initializer is exposed.
  select * into v_legacy from public.islands where player_id=p_actor_id;
  v_known := coalesce(v_legacy.captain_skills,'{}'::text[]);
  if cardinality(v_known)<>(select count(distinct value) from unnest(v_known) as t(value))
    or exists (select 1 from unnest(v_known) as t(value) where not exists (
      select 1 from jsonb_array_elements(p_rules->'tree') as s(entry)
        where entry->>'skill'=value)) then
    return jsonb_build_object('status','refused','reason','captain_conversion_required');
  end if;
  v_earned := coalesce(v_legacy.won_wave_best,0)/(p_rules->>'wavesPerPoint')::integer;
  select coalesce(sum((entry->>'cost')::integer),0) into v_spent
    from jsonb_array_elements(p_rules->'tree') as t(entry)
    where entry->>'skill'=any(v_known);
  if v_spent>v_earned then
    return jsonb_build_object('status','refused','reason','captain_conversion_required');
  end if;
  insert into public.personal_captain_profiles(player_id,level,won_wave_best,earned_points,
    skills,role,rules) values(p_actor_id,coalesce(v_legacy.captain_level,1),
    coalesce(v_legacy.won_wave_best,0),v_earned,v_known,v_legacy.captain_role,p_rules);
  return public.personal_captain_snapshot_locked(p_actor_id);
end;
$$;

create or replace function public.personal_captain_read(p_player_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.personal_captain_profiles where player_id=p_player_id) then
    return jsonb_build_object('status','refused','reason','captain_not_initialized');
  end if;
  return public.personal_captain_lock_state_locked(p_player_id);
end;
$$;

create or replace function public.personal_captain_context(p_player_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.profiles where id=p_player_id for update;
  if not found then raise exception 'captain_not_initialized'; end if;
  if not exists (select 1 from public.personal_captain_profiles where player_id=p_player_id) then
    return jsonb_build_object('status','legacy');
  end if;
  return public.personal_captain_lock_state_locked(p_player_id);
end;
$$;
comment on function public.personal_captain_context(uuid) is
  'Server-only global personal mode read. Profile version one remains authoritative on legacy islands; a failed read is never a legacy fallback. No import or coin grant.';

create or replace function public.personal_captain_legacy_guard_locked(p_player_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.profiles where id=p_player_id for update;
  if not found then raise exception 'captain_not_initialized'; end if;
  if exists (select 1 from public.personal_captain_profiles where player_id=p_player_id) then
    raise exception 'personal_captain_managed';
  end if;
end;
$$;
comment on function public.personal_captain_legacy_guard_locked(uuid) is
  'Private integration gate for old Captain/session paths: lock the player anchor before legacy island locks and refuse managed profiles regardless of visited-island economy. No old route is rewired by this migration.';

create or replace function public.personal_captain_change(
  p_player_id uuid,p_action_uid text,p_action text,p_value text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.personal_captain_profiles;
  v_old public.personal_captain_operations;
  v_fingerprint jsonb := jsonb_build_object('action',p_action,'value',p_value);
  v_entry jsonb;
  v_spent integer;
  v_result jsonb;
  v_id uuid;
begin
  if p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
    or p_action is null or p_action not in ('role','learn','respec')
    or (p_action='respec' and p_value is not null) then raise exception 'invalid_captain_action'; end if;
  perform public.personal_captain_lock_state_locked(p_player_id);
  select * into v_old from public.personal_captain_operations
    where player_id=p_player_id and action_uid=p_action_uid;
  if found then
    if v_old.fingerprint<>v_fingerprint then
      return jsonb_build_object('status','refused','reason','action_conflict');
    end if;
    return jsonb_build_object('status','done','repeat',true,'receipt',v_old.result,
      'profile',public.personal_captain_snapshot_locked(p_player_id));
  end if;
  select * into v_profile from public.personal_captain_profiles where player_id=p_player_id;
  if v_profile.assignment_wave_id is not null then
    return jsonb_build_object('status','refused','reason','captain_assigned');
  end if;
  if p_action='role' then
    if p_value is null or p_value not in ('medic','engineer','gunner') then
      raise exception 'invalid_captain_role'; end if;
    if v_profile.pending_engineer_commitment_id is not null and p_value<>'engineer' then
      return jsonb_build_object('status','refused','reason','engineer_bound');
    end if;
    if v_profile.level<(v_profile.rules->>'roleLevel')::integer then
      return jsonb_build_object('status','refused','reason','locked');
    end if;
    if v_profile.role is not null and v_profile.role<>p_value then
      return jsonb_build_object('status','refused','reason','role_known');
    end if;
    update public.personal_captain_profiles set role=p_value,revision=revision+1
      where player_id=p_player_id;
  elsif p_action='respec' then
    update public.personal_captain_profiles set skills='{}',
      role=case when pending_engineer_commitment_id is not null then 'engineer' end,
      revision=revision+1 where player_id=p_player_id;
  else
    select entry into v_entry from jsonb_array_elements(v_profile.rules->'tree') as t(entry)
      where entry->>'skill'=p_value;
    if v_entry is null then raise exception 'invalid_captain_skill'; end if;
    if (v_profile.rules->'retired') ? p_value then
      return jsonb_build_object('status','refused','reason','retired_skill');
    end if;
    if p_value=any(v_profile.skills) then
      return jsonb_build_object('status','refused','reason','known');
    end if;
    if v_entry->>'excludes'=any(v_profile.skills) then
      return jsonb_build_object('status','refused','reason','closed');
    end if;
    if jsonb_array_length(v_entry->'needs')>0 and not exists (
      select 1 from jsonb_array_elements_text(v_entry->'needs') as t(value)
      where value=any(v_profile.skills)) then
      return jsonb_build_object('status','refused','reason','locked');
    end if;
    if v_entry->>'role' is not null and v_entry->>'role' is distinct from v_profile.role then
      return jsonb_build_object('status','refused','reason','wrong_role');
    end if;
    select coalesce(sum((entry->>'cost')::integer),0) into v_spent
      from jsonb_array_elements(v_profile.rules->'tree') as t(entry)
      where entry->>'skill'=any(v_profile.skills);
    if v_profile.earned_points-v_spent<(v_entry->>'cost')::integer then
      return jsonb_build_object('status','refused','reason','no_points');
    end if;
    update public.personal_captain_profiles set skills=array_append(skills,p_value),
      revision=revision+1 where player_id=p_player_id;
  end if;
  v_id := gen_random_uuid();
  v_result := jsonb_build_object('receiptId',v_id,'actionUid',p_action_uid,
    'action',p_action,'profileAtCommit',public.personal_captain_snapshot_locked(p_player_id));
  insert into public.personal_captain_operations(id,player_id,action_uid,fingerprint,result)
    values(v_id,p_player_id,p_action_uid,v_fingerprint,v_result);
  return jsonb_build_object('status','done','repeat',false,'receipt',v_result,
    'profile',public.personal_captain_snapshot_locked(p_player_id));
end;
$$;

create or replace function public.personal_captain_bind_engineer_locked(p_player_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_profile public.personal_captain_profiles; v_id uuid;
begin
  perform public.personal_captain_lock_state_locked(p_player_id);
  select * into v_profile from public.personal_captain_profiles where player_id=p_player_id;
  if v_profile.assignment_wave_id is not null then raise exception 'captain_assigned'; end if;
  if v_profile.role is distinct from 'engineer' then raise exception 'engineer_required'; end if;
  if v_profile.pending_engineer_commitment_id is not null then
    return v_profile.pending_engineer_commitment_id;
  end if;
  insert into public.personal_engineer_commitments(player_id) values(p_player_id)
    returning id into v_id;
  update public.personal_captain_profiles set pending_engineer_commitment_id=v_id,
    revision=revision+1 where player_id=p_player_id;
  return v_id;
end;
$$;
comment on function public.personal_captain_bind_engineer_locked(uuid) is
  'Private purchase hook: invoke inside the transaction that debits treasury and writes the actual-cost structure payment. Raises on guard failure so no charged-but-unbound purchase can commit.';

create or replace function public.personal_captain_attach_wave_locked(
  p_player_id uuid,p_wave_id uuid,p_played_wave integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.personal_captain_profiles;
  v_snapshot public.personal_captain_wave_snapshots;
  v_active text[];
begin
  if p_wave_id is null or p_played_wave is null or p_played_wave<1 then
    raise exception 'invalid_captain_assignment'; end if;
  perform public.personal_captain_lock_state_locked(p_player_id);
  select * into v_snapshot from public.personal_captain_wave_snapshots
    where player_id=p_player_id and wave_id=p_wave_id;
  if found then
    if v_snapshot.played_wave<>p_played_wave then raise exception 'captain_assignment_conflict'; end if;
    return jsonb_build_object('profile',v_snapshot.profile,'activeSkills',to_jsonb(v_snapshot.active_skills),
      'engineerCommitmentId',v_snapshot.engineer_commitment_id,'repeat',true);
  end if;
  select * into v_profile from public.personal_captain_profiles where player_id=p_player_id;
  if v_profile.assignment_wave_id is not null then raise exception 'captain_assigned'; end if;
  if v_profile.pending_engineer_commitment_id is not null and v_profile.role<>'engineer' then
    raise exception 'engineer_required'; end if;
  update public.personal_captain_profiles set assignment_wave_id=p_wave_id,
    assignment_engineer_commitment_id=pending_engineer_commitment_id,revision=revision+1
    where player_id=p_player_id;
  select coalesce(array_agg(value order by ordinal),'{}'::text[]) into v_active
    from unnest(v_profile.skills) with ordinality as t(value,ordinal)
    where not ((v_profile.rules->'retired') ? value);
  insert into public.personal_captain_wave_snapshots(player_id,wave_id,played_wave,
    engineer_commitment_id,profile,active_skills) values(p_player_id,p_wave_id,p_played_wave,
    v_profile.pending_engineer_commitment_id,public.personal_captain_snapshot_locked(p_player_id),v_active)
    returning * into v_snapshot;
  return jsonb_build_object('profile',v_snapshot.profile,'activeSkills',to_jsonb(v_active),
    'engineerCommitmentId',v_snapshot.engineer_commitment_id,'repeat',false);
end;
$$;

create or replace function public.personal_captain_release_assignment_locked(
  p_player_id uuid,p_wave_id uuid
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.personal_captain_lock_state_locked(p_player_id);
  update public.personal_captain_profiles set assignment_wave_id=null,
    assignment_engineer_commitment_id=null,revision=revision+1
    where player_id=p_player_id and assignment_wave_id=p_wave_id;
end;
$$;

create or replace function public.personal_captain_complete_locked(
  p_player_id uuid,p_wave_id uuid,p_played_wave integer,p_outcome text,
  p_confirmed_participation boolean,p_engineer_commitment_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.personal_captain_profiles;
  v_snapshot public.personal_captain_wave_snapshots;
  v_old public.personal_captain_completion_effects;
  v_fingerprint jsonb := jsonb_build_object('playedWave',p_played_wave,'outcome',p_outcome,
    'confirmedParticipation',p_confirmed_participation,'engineerCommitmentId',p_engineer_commitment_id);
  v_best integer;
  v_level integer;
  v_qualifies boolean;
  v_result jsonb;
begin
  if p_outcome is null or p_outcome not in ('won','lost','abandoned','expired')
    or p_confirmed_participation is null then raise exception 'invalid_captain_completion'; end if;
  perform public.personal_captain_lock_state_locked(p_player_id);
  select * into v_old from public.personal_captain_completion_effects
    where player_id=p_player_id and wave_id=p_wave_id;
  if found then
    if v_old.fingerprint<>v_fingerprint then raise exception 'captain_completion_conflict'; end if;
    return jsonb_build_object('repeat',true,'effect',v_old.result);
  end if;
  select * into v_snapshot from public.personal_captain_wave_snapshots
    where player_id=p_player_id and wave_id=p_wave_id;
  if not found or v_snapshot.played_wave is distinct from p_played_wave
    or v_snapshot.engineer_commitment_id is distinct from p_engineer_commitment_id then
    raise exception 'captain_snapshot_conflict';
  end if;
  select * into v_profile from public.personal_captain_profiles where player_id=p_player_id;
  v_best := v_profile.won_wave_best;
  v_level := v_profile.level;
  if p_confirmed_participation and p_outcome='won' then
    v_best := greatest(v_best,p_played_wave);
    select greatest(v_level,coalesce(max(ordinal),1))::integer into v_level
      from jsonb_array_elements_text(v_profile.rules->'levelWaves') with ordinality as t(value,ordinal)
      where value::integer<=v_best;
  end if;
  v_qualifies := p_confirmed_participation and p_outcome in ('won','lost')
    and p_engineer_commitment_id is not null;
  if v_qualifies then
    update public.personal_engineer_commitments set satisfied_wave_id=p_wave_id,
      satisfied_at=clock_timestamp() where player_id=p_player_id
      and id=p_engineer_commitment_id and satisfied_wave_id is null;
  end if;
  update public.personal_captain_profiles set won_wave_best=v_best,level=v_level,
    earned_points=greatest(earned_points,v_best/(rules->>'wavesPerPoint')::integer),
    pending_engineer_commitment_id=case when v_qualifies
      and pending_engineer_commitment_id=p_engineer_commitment_id then null
      else pending_engineer_commitment_id end,
    assignment_engineer_commitment_id=case when assignment_wave_id=p_wave_id then null
      else assignment_engineer_commitment_id end,
    assignment_wave_id=case when assignment_wave_id=p_wave_id then null else assignment_wave_id end,
    revision=revision+1 where player_id=p_player_id;
  v_result := jsonb_build_object('waveId',p_wave_id,'outcome',p_outcome,
    'confirmedParticipation',p_confirmed_participation,
    'engineerCommitmentId',p_engineer_commitment_id,
    'profileAtCommit',public.personal_captain_snapshot_locked(p_player_id));
  insert into public.personal_captain_completion_effects(player_id,wave_id,fingerprint,result)
    values(p_player_id,p_wave_id,v_fingerprint,v_result);
  return jsonb_build_object('repeat',false,'effect',v_result);
end;
$$;
comment on function public.personal_captain_complete_locked(uuid,uuid,integer,text,boolean,uuid) is
  'Private canonical-close hook after MP-ECO-03 durable receipt and class-three locks. No caller-selected participation RPC is granted. Completion and treasury/domain effects must commit or roll back together.';

do $$
declare v_function regprocedure;
begin
  for v_function in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace
    and proname like 'personal_captain_%' loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',v_function);
  end loop;
end $$;
grant execute on function public.personal_captain_initialize(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.personal_captain_read(uuid) to service_role;
grant execute on function public.personal_captain_context(uuid) to service_role;
grant execute on function public.personal_captain_change(uuid,text,text,text) to service_role;
