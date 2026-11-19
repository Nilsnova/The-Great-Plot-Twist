-- Canonical shared controllers and frozen participant slots (#501).
-- Existing wave/recovery rows own reservations/outcomes; personal Captain state
-- owns the sole global assignment. This migration admits no island or player.

create table if not exists public.shared_session_settings (
  island_owner uuid primary key references public.islands(player_id) on delete restrict,
  leader_id uuid,
  topic_nonce text not null default left(replace(gen_random_uuid()::text,'-',''),24)
    check(topic_nonce ~ '^[0-9a-f]{24}$'),
  topic_generation numeric not null default 1 check(public.island_treasury_whole(topic_generation,false)),
  break_paused boolean not null default false,
  auto_next boolean not null default false,
  countdown_seconds integer not null default 10 check(countdown_seconds between 0 and 60)
);
comment on table public.shared_session_settings is
  'Persisted leader, between-wave pacing and private channel generation; never a wave/assignment authority duplicate.';

create table if not exists public.shared_session_controls (
  player_id uuid primary key references public.profiles(id) on delete cascade,
  island_owner uuid references public.islands(player_id) on delete restrict,
  run_epoch uuid,
  session_id uuid not null unique,
  connection_generation numeric not null check(public.island_treasury_whole(connection_generation,false)),
  last_seen timestamptz not null,
  active_since timestamptz,
  connected_until timestamptz,
  grace_until timestamptz,
  released_at timestamptz,
  check((released_at is null and island_owner is not null and run_epoch is not null
      and ((active_since is not null and connected_until is not null and grace_until is null)
        or (active_since is null and connected_until is null and grace_until is not null)))
    or (released_at is not null and island_owner is null and run_epoch is null
      and active_since is null and connected_until is null and grace_until is null))
);
comment on table public.shared_session_controls is
  'One controlling connection lease per player globally. Generation fences duplicate tabs and obsolete callbacks; browser presence is not authority.';
create index if not exists shared_session_controls_owner on public.shared_session_controls(island_owner,player_id);

create table if not exists public.shared_session_slots (
  wave_id uuid not null references public.island_wave_accounting(wave_id) on delete restrict,
  player_id uuid not null,
  controlling_session_id uuid not null,
  participant_token uuid not null,
  connection_generation numeric not null check(public.island_treasury_whole(connection_generation,false)),
  status text not null default 'active' check(status in ('active','grace','withdrawn')),
  grace_until timestamptz,
  withdrawn_at timestamptz,
  deleted_at timestamptz,
  frozen_captain jsonb not null check(jsonb_typeof(frozen_captain)='object'),
  copy_id uuid,
  copy_generation numeric,
  hp_units integer not null default 1000000 check(hp_units between 0 and 1000000),
  down boolean not null default false,
  fall_id uuid,
  down_at_tick integer,
  x numeric not null default 0,
  z numeric not null default 0,
  pose_revision numeric not null default 0 check(public.island_treasury_whole(pose_revision,true)),
  state_through_tick integer not null default -1,
  state_input_head bigint not null default 0,
  revive_basis_seq bigint not null default 0,
  cooldowns jsonb not null default '{}' check(jsonb_typeof(cooldowns)='object'),
  heal_allowance_units numeric not null default 0 check(heal_allowance_units>=0),
  position_tick integer not null default 0,
  primary key(wave_id,player_id),
  unique(wave_id,participant_token),
  check((copy_id is null)=(copy_generation is null)),
  check(copy_generation is null or public.island_treasury_whole(copy_generation,true)),
  check(x::text not in ('NaN','Infinity','-Infinity') and z::text not in ('NaN','Infinity','-Infinity')
    and x between -499.999 and 499.999 and z between -499.999 and 499.999),
  check((down and hp_units=0 and fall_id is not null and down_at_tick is not null)
     or (not down and hp_units>0 and fall_id is null and down_at_tick is null))
);
comment on table public.shared_session_slots is
  'Frozen controller/Captain/loadout and dynamic journal-bound slot. Historical player UUID has no profile cascade; accounting remains the immutable origin/roster source.';
create index if not exists shared_session_slots_actor on public.shared_session_slots(player_id,wave_id);

create or replace function public.shared_session_slot_frozen()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if (new.wave_id,new.player_id,new.controlling_session_id,new.participant_token,
      new.frozen_captain,new.copy_id,new.copy_generation) is distinct from
     (old.wave_id,old.player_id,old.controlling_session_id,old.participant_token,
      old.frozen_captain,old.copy_id,old.copy_generation)
    or (old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at) then
    raise exception 'shared_session_slot_frozen'; end if;
  return new;
end; $$;
comment on function public.shared_session_slot_frozen() is
  'Preserve immutable bell controller/token/profile/loadout identity and any durable deletion disposition.';
create or replace trigger shared_session_slot_frozen before update on public.shared_session_slots
  for each row execute function public.shared_session_slot_frozen();

create table if not exists public.shared_session_receipts (
  operation_id uuid primary key references public.island_economy_operations(id) on delete restrict,
  result jsonb not null check(jsonb_typeof(result)='object')
);
comment on table public.shared_session_receipts is
  'Immutable common-root controller/settings receipts; historical replay never grants a new lease.';
create or replace trigger shared_session_receipts_immutable before update or delete
  on public.shared_session_receipts for each row execute function public.island_treasury_immutable();

do $$
declare v_table text; v_column record;
begin
  foreach v_table in array array['shared_session_settings','shared_session_controls',
    'shared_session_slots','shared_session_receipts'] loop
    execute format('alter table public.%I enable row level security',v_table);
    execute format('revoke all on table public.%I from public,anon,authenticated,service_role',v_table);
    execute format('grant select on table public.%I to service_role',v_table);
    for v_column in select column_name from information_schema.columns
      where table_schema='public' and table_name=v_table loop
      execute format('comment on column public.%I.%I is %L',v_table,v_column.column_name,
        'Canonical session field: '||v_column.column_name||'. Written only by checked domain transactions.');
    end loop;
  end loop;
end $$;

create or replace function public.shared_session_actor_active(p_actor_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
  if p_actor_id is null or not exists(select 1 from public.profiles where id=p_actor_id)
    or to_regclass('public.island_deleted_player_dispositions') is null then return false; end if;
  return not exists(select 1 from public.island_deleted_player_dispositions where player_id=p_actor_id);
end; $$;
comment on function public.shared_session_actor_active(uuid) is
  'Private current identity check including durable deletion tombstone. Missing lifecycle prerequisite fails closed.';

create or replace function public.shared_session_rotate_topic_locked(p_island_owner uuid)
returns text language plpgsql volatile security definer set search_path='' as $$
declare v_nonce text;
begin
  if not exists(select 1 from public.island_economy_state where island_owner=p_island_owner) then
    raise exception 'economy_context_required'; end if;
  insert into public.shared_session_settings(island_owner) values(p_island_owner)
    on conflict(island_owner) do update set
      topic_nonce=left(replace(gen_random_uuid()::text,'-',''),24),
      topic_generation=public.shared_session_settings.topic_generation+1
    returning topic_nonce into v_nonce;
  return v_nonce;
end; $$;
comment on function public.shared_session_rotate_topic_locked(uuid) is
  'Private lock-preserving membership/admission/reset/deletion topic rotation; caller preholds canonical origin locks.';

create or replace function public.shared_session_admission_topic()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform public.shared_session_rotate_topic_locked(new.island_owner);
  return null;
end; $$;
comment on function public.shared_session_admission_topic() is
  'Create a private channel generation atomically with persisted shared admission.';
create or replace trigger shared_session_admission_topic after insert on public.island_economy_state
  for each row execute function public.shared_session_admission_topic();
insert into public.shared_session_settings(island_owner)
  select island_owner from public.island_economy_state on conflict(island_owner) do nothing;

create or replace function public.shared_session_actor_owners(p_actor_id uuid)
returns uuid[] language sql stable security definer set search_path='' as $$
  select coalesce(array_agg(distinct owner order by owner),'{}'::uuid[]) from (
    select island_owner as owner from public.shared_session_controls where player_id=p_actor_id
    union select a.island_owner from public.shared_session_slots s
      join public.island_wave_accounting a on a.wave_id=s.wave_id
      where s.player_id=p_actor_id and not exists(
        select 1 from public.island_wave_closures c where c.wave_id=s.wave_id)
  ) owners where owner is not null;
$$;
comment on function public.shared_session_actor_owners(uuid) is
  'Private deletion discovery before scope locks; caller captures, locks and revalidates the complete affected set.';

create or replace function public.shared_session_personal_completion_omitted_locked(
  p_wave_id uuid,p_actor_id uuid
) returns boolean language sql stable security definer set search_path='' as $$
  select not exists(select 1 from public.profiles where id=p_actor_id)
    and exists(select 1 from public.shared_session_slots s
      join public.island_wave_accounting a on a.wave_id=s.wave_id
      where s.wave_id=p_wave_id and s.player_id=p_actor_id and s.deleted_at is not null
        and exists(select 1 from jsonb_array_elements(a.roster) r
          where r->>'playerId'=p_actor_id::text
            and r->>'controllingSessionId'=s.controlling_session_id::text));
$$;
comment on function public.shared_session_personal_completion_omitted_locked(uuid,uuid) is
  'Only a durable exact frozen-slot deletion disposition plus missing profile can omit a personal hook. Departure alone never qualifies.';

create or replace function public.shared_session_mark_actor_deleted_locked(
  p_actor_id uuid,p_now timestamptz
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_count integer;
begin
  if p_now is null then raise exception 'invalid_session_time'; end if;
  if exists(select 1 from public.shared_session_slots s where s.player_id=p_actor_id
    and s.status<>'withdrawn' and not exists(
      select 1 from public.island_wave_closures c where c.wave_id=s.wave_id)) then
    raise exception 'captain_still_assigned'; end if;
  update public.shared_session_slots s set deleted_at=coalesce(s.deleted_at,p_now)
    where s.player_id=p_actor_id and not exists(
      select 1 from public.island_wave_closures c where c.wave_id=s.wave_id);
  get diagnostics v_count=row_count;
  return jsonb_build_object('status','done','slots',v_count);
end; $$;
comment on function public.shared_session_mark_actor_deleted_locked(uuid,timestamptz) is
  'Private deletion-only disposition after controller withdrawal and before physical Auth deletion in the same transaction.';

create or replace function public.island_economy_authority(p_actor_id uuid,p_island_owner uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_reservation uuid; v_leader uuid; v_assignment uuid; v_epoch uuid; v_now timestamptz;
begin
  if not public.shared_session_actor_active(p_actor_id) then
    raise insufficient_privilege using message='actor_inactive'; end if;
  select run_epoch into v_epoch from public.island_economy_state where island_owner=p_island_owner;
  if not found then raise exception 'economy_context_required'; end if;
  v_now:=statement_timestamp();
  select r.id into v_reservation from public.wave_runs r
    join public.island_wave_accounting a on a.wave_id=r.id
    where a.island_owner=p_island_owner and a.run_epoch=v_epoch and r.finished_at is null
      and not exists(select 1 from public.island_wave_closures c where c.wave_id=r.id)
    order by r.starts_at,r.id limit 1;
  select s.leader_id into v_leader from public.shared_session_settings s
    join public.shared_session_controls l on l.player_id=s.leader_id
    where s.island_owner=p_island_owner and l.island_owner=p_island_owner and l.run_epoch=v_epoch
      and public.shared_session_actor_active(l.player_id)
      and (l.player_id=p_island_owner or exists(select 1 from public.island_members m
        where m.island_owner=p_island_owner and m.player_id=l.player_id and m.left_at is null))
      and v_now<coalesce(l.grace_until,l.last_seen+interval '60 seconds');
  select assignment_wave_id into v_assignment from public.personal_captain_profiles where player_id=p_actor_id;
  return jsonb_build_object('actor_id',p_actor_id,'island_owner',p_island_owner,
    'is_member',p_actor_id=p_island_owner or exists(select 1 from public.island_members m
      where m.island_owner=p_island_owner and m.player_id=p_actor_id and m.left_at is null),
    'reservation_id',v_reservation,'session_leader_id',v_leader,'actor_assignment_wave_id',v_assignment);
end; $$;
comment on function public.island_economy_authority(uuid,uuid) is
  'Exact six-field service-only read-only canonical membership/reservation/leader/personal-assignment provider. No read-side expiry or mutation.';

-- Every private function is denied direct browser and service execution. Explicit
-- public service entry points are granted individually after their definitions.
do $$
declare v_function record;
begin
  for v_function in select p.oid::regprocedure as signature from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
      and (p.proname like 'shared_session_%' or p.proname='island_economy_authority') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',v_function.signature);
  end loop;
end $$;
grant execute on function public.island_economy_authority(uuid,uuid) to service_role;

create or replace function public.shared_session_lock_plan(p_owners uuid[],p_actor_id uuid default null)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_owners uuid[]; v_players uuid[]; v_scopes uuid[]; v_key bigint;
begin
  select array_agg(distinct owner order by owner) into v_owners from unnest(
    coalesce(p_owners,'{}'::uuid[])||coalesce(public.shared_session_actor_owners(p_actor_id),'{}'::uuid[])
  ) owner where owner is not null;
  select coalesce(array_agg(distinct actor order by actor),'{}'::uuid[]) into v_players from (
    select p_actor_id as actor union select player_id from public.shared_session_controls
      where island_owner=any(v_owners)
    union select (r->>'playerId')::uuid from public.island_wave_accounting a,
      jsonb_array_elements(a.roster) r where a.island_owner=any(v_owners)
        and not exists(select 1 from public.island_wave_closures c where c.wave_id=a.wave_id)
  ) players where actor is not null;
  select coalesce(array_agg(distinct owner order by owner),'{}'::uuid[]) into v_scopes
    from unnest(coalesce(v_owners,'{}'::uuid[])||v_players) owner;
  for v_key in select distinct hashtextextended('island-economy:'||owner::text,0)
    from unnest(v_scopes) owner order by 1 loop perform pg_advisory_xact_lock(v_key); end loop;
  -- The discovered set is fixed before waiting; never introduce a new guard
  -- after an account/personal lock. A competing arrival is retried from discovery.
  if exists(select 1 from public.shared_session_controls where island_owner=any(v_owners)
      and not player_id=any(v_players))
    or exists(select 1 from unnest(public.shared_session_actor_owners(p_actor_id)) owner
      where not owner=any(v_owners)) then
    raise serialization_failure using message='session_scope_changed'; end if;
  perform 1 from public.island_economy_accounts where island_owner=any(v_scopes) order by id for update;
  return jsonb_build_object('owners',to_jsonb(v_owners),'players',to_jsonb(v_players));
end; $$;
comment on function public.shared_session_lock_plan(uuid[],uuid) is
  'Private captured sorted scope/account stage, before common root claims and personal/domain rows. Membership/lease discovery is revalidated without late guard expansion.';

create or replace function public.shared_session_lock_plan_rows(p_plan jsonb)
returns void language plpgsql volatile security definer set search_path='' as $$
declare v_owners uuid[]; v_players uuid[];
begin
  select array_agg(value::uuid) into v_owners from jsonb_array_elements_text(p_plan->'owners');
  select array_agg(value::uuid) into v_players from jsonb_array_elements_text(p_plan->'players');
  perform 1 from public.profiles where id=any(v_players) order by id for no key update;
  perform 1 from public.personal_captain_profiles where player_id=any(v_players) order by player_id for update;
  perform 1 from public.shared_session_controls where player_id=any(v_players) order by player_id for update;
  perform 1 from public.islands where player_id=any(v_owners) order by player_id for update;
  perform 1 from public.island_economy_state where island_owner=any(v_owners) order by island_owner for update;
  perform 1 from public.island_recovery_state where island_owner=any(v_owners) order by island_owner for update;
  perform 1 from public.wave_runs r where exists(select 1 from public.island_wave_accounting a
    where a.wave_id=r.id and a.island_owner=any(v_owners)) order by r.id for update;
  perform 1 from public.recovery_wave_states w where exists(select 1 from public.island_wave_accounting a
    where a.wave_id=w.wave_id and a.island_owner=any(v_owners)) order by w.wave_id for update;
  perform 1 from public.shared_session_settings where island_owner=any(v_owners) order by island_owner for update;
  perform 1 from public.shared_session_slots s where exists(select 1 from public.island_wave_accounting a
    where a.wave_id=s.wave_id and a.island_owner=any(v_owners)) order by s.wave_id,s.player_id for update;
end; $$;
comment on function public.shared_session_lock_plan_rows(jsonb) is
  'Private personal/island/recovery/wave/domain lock stage after common root claim. Missing deleted profiles are not fabricated or automatically excused.';

create or replace function public.shared_session_elect_locked(p_owner uuid,p_now timestamptz)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare v_current uuid; v_epoch uuid; v_next uuid;
begin
  select run_epoch into v_epoch from public.island_economy_state where island_owner=p_owner;
  select leader_id into v_current from public.shared_session_settings where island_owner=p_owner;
  if exists(select 1 from public.shared_session_controls l where l.player_id=v_current
    and l.island_owner=p_owner and l.run_epoch=v_epoch
    and p_now<coalesce(l.grace_until,l.last_seen+interval '60 seconds')
    and public.shared_session_actor_active(l.player_id)
    and (l.player_id=p_owner or exists(select 1 from public.island_members m
      where m.island_owner=p_owner and m.player_id=l.player_id and m.left_at is null))) then
    return v_current; end if;
  select l.player_id into v_next from public.shared_session_controls l
    where l.island_owner=p_owner and l.run_epoch=v_epoch and l.active_since is not null
      and l.connected_until>p_now and public.shared_session_actor_active(l.player_id)
      and (l.player_id=p_owner or exists(select 1 from public.island_members m
        where m.island_owner=p_owner and m.player_id=l.player_id and m.left_at is null))
    order by l.active_since,l.player_id limit 1;
  update public.shared_session_settings set leader_id=v_next where island_owner=p_owner;
  return v_next;
end; $$;
comment on function public.shared_session_elect_locked(uuid,timestamptz) is
  'Retain eligible incumbent strictly through its fixed grace, then oldest continuously connected eligible player with stable UUID tie break.';

create or replace function public.shared_session_read(
  p_actor_id uuid,p_island_owner uuid,p_session_id uuid default null,p_connection_generation numeric default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_authority jsonb; v_settings public.shared_session_settings; v_control public.shared_session_controls;
  v_account public.island_economy_accounts; v_code text; v_controller boolean;
begin
  v_authority:=public.island_economy_authority(p_actor_id,p_island_owner);
  if not (v_authority->>'is_member')::boolean then
    return jsonb_build_object('status','refused','reason','not_member'); end if;
  select * into v_settings from public.shared_session_settings where island_owner=p_island_owner;
  if not found then return jsonb_build_object('status','refused','reason','path_unavailable'); end if;
  select a.* into v_account from public.island_economy_accounts a join public.island_economy_state s
    on s.current_account_id=a.id where s.island_owner=p_island_owner;
  select code into v_code from public.islands where player_id=p_island_owner;
  select * into v_control from public.shared_session_controls where player_id=p_actor_id
    and island_owner=p_island_owner and run_epoch=v_account.run_epoch;
  v_controller:=coalesce(v_control.session_id=p_session_id
    and v_control.connection_generation=p_connection_generation
    and v_control.connected_until>statement_timestamp(),false);
  return jsonb_build_object('status','done','economy',public.island_treasury_envelope(v_account),
    'session',jsonb_build_object('sessionId',case when v_controller then v_control.session_id end,
      'connectionGeneration',case when v_controller then trunc(v_control.connection_generation)::text end,
      'isController',v_controller,'isSpectator',not v_controller,
      'leaderId',v_authority->'session_leader_id','graceUntil',v_control.grace_until,
      'place','isle_'||lower(v_code)||'_'||v_settings.topic_nonce,
      'topicGeneration',trunc(v_settings.topic_generation)::text,
      'breakPaused',v_settings.break_paused,'autoNext',v_settings.auto_next,
      'countdownSeconds',v_settings.countdown_seconds));
end; $$;
comment on function public.shared_session_read(uuid,uuid,uuid,numeric) is
  'Member-only metadata; another controlling tab session UUID/generation are never disclosed. Read creates no state, lease or assignment.';

create or replace function public.shared_session_withdraw_locked(
  p_actor_id uuid,p_wave_id uuid,p_reason text,p_now timestamptz
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_slot public.shared_session_slots; v_attempt public.island_wave_accounting;
  v_control public.shared_session_controls; v_pending boolean:=false;
begin
  if p_now is null or p_reason not in ('leave','disconnect_expired','membership_lost','account_deleted','reset') then
    raise exception 'invalid_session_withdrawal'; end if;
  select * into v_control from public.shared_session_controls where player_id=p_actor_id;
  if p_wave_id is null then
    select assignment_wave_id into p_wave_id from public.personal_captain_profiles where player_id=p_actor_id;
  end if;
  if p_wave_id is not null then
    select * into v_slot from public.shared_session_slots where wave_id=p_wave_id and player_id=p_actor_id;
    if not found then raise exception 'not_in_wave'; end if;
    select * into strict v_attempt from public.island_wave_accounting where wave_id=p_wave_id;
    v_pending:=not exists(select 1 from public.island_wave_closures where wave_id=p_wave_id);
    update public.shared_session_slots set status='withdrawn',grace_until=null,
      withdrawn_at=coalesce(withdrawn_at,p_now) where wave_id=p_wave_id and player_id=p_actor_id;
    if exists(select 1 from public.personal_captain_profiles where player_id=p_actor_id) then
      perform public.personal_captain_release_assignment_locked(p_actor_id,p_wave_id); end if;
    if v_slot.copy_id is not null then
      perform public.island_shared_arsenal_holder_locked(v_attempt.account_id,v_attempt.run_epoch,
        p_actor_id,v_slot.copy_id,v_slot.copy_generation,'withdraw',p_now,
        case when v_pending then p_wave_id else null end,null);
    end if;
  end if;
  -- Removing this lease cannot release another island's new assignment.
  if p_wave_id is null or v_control.island_owner=v_attempt.island_owner then
    update public.shared_session_controls set island_owner=null,run_epoch=null,
      active_since=null,connected_until=null,grace_until=null,released_at=p_now where player_id=p_actor_id;
  end if;
  if v_control.island_owner is not null then
    perform public.shared_session_elect_locked(v_control.island_owner,p_now); end if;
  return jsonb_build_object('status','done','islandOwner',v_attempt.island_owner,
    'accountId',v_attempt.account_id,'runEpoch',v_attempt.run_epoch,'waveId',p_wave_id,
    'copyId',v_slot.copy_id,'copyGeneration',case when v_slot.copy_generation is not null
      then trunc(v_slot.copy_generation)::text end,'pendingReturn',v_pending and v_slot.copy_id is not null);
end; $$;
comment on function public.shared_session_withdraw_locked(uuid,uuid,text,timestamptz) is
  'Private lock-preserving immediate input/assignment revocation and original-wave tenure-fenced pending return. No receipt or historical participation is erased.';

create or replace function public.shared_session_normalize_locked(p_owner uuid,p_now timestamptz)
returns void language plpgsql volatile security definer set search_path='' as $$
declare v_lease public.shared_session_controls; v_wave uuid; v_slot public.shared_session_slots;
begin
  for v_lease in select * from public.shared_session_controls where island_owner=p_owner order by player_id loop
    if not public.shared_session_actor_active(v_lease.player_id)
      or (v_lease.player_id<>p_owner and not exists(select 1 from public.island_members
        where island_owner=p_owner and player_id=v_lease.player_id and left_at is null)) then
      perform public.shared_session_withdraw_locked(v_lease.player_id,null,'membership_lost',p_now);
    elsif p_now>=coalesce(v_lease.grace_until,v_lease.last_seen+interval '60 seconds') then
      perform public.shared_session_withdraw_locked(v_lease.player_id,null,'disconnect_expired',p_now);
    elsif v_lease.connected_until<=p_now then
      update public.shared_session_controls set active_since=null,connected_until=null,
        grace_until=last_seen+interval '60 seconds' where player_id=v_lease.player_id;
      update public.shared_session_slots s set status='grace',grace_until=v_lease.last_seen+interval '60 seconds'
        where s.player_id=v_lease.player_id and s.status='active' and exists(
          select 1 from public.island_wave_accounting a where a.wave_id=s.wave_id and a.island_owner=p_owner)
        and not exists(select 1 from public.island_wave_closures c where c.wave_id=s.wave_id);
      perform public.shared_session_grace_copy_locked(v_lease.player_id,p_owner,p_now);
    end if;
  end loop;
  perform public.shared_session_elect_locked(p_owner,p_now);
end; $$;
comment on function public.shared_session_normalize_locked(uuid,timestamptz) is
  'Normalize fixed heartbeat/disconnect deadlines before any effect; delayed workers never extend grace. Caller already owns full affected personal/domain lock plan.';

create or replace function public.shared_session_attach(
  p_actor_id uuid,p_island_owner uuid,p_run_epoch uuid,p_session_id uuid,
  p_expected_generation numeric,p_action_uid text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_plan jsonb; v_state public.island_economy_state; v_control public.shared_session_controls;
  v_old public.island_economy_operations; v_account uuid; v_claim jsonb; v_operation uuid;
  v_result jsonb; v_fingerprint jsonb; v_now timestamptz; v_generation numeric;
  v_slot public.shared_session_slots; v_attempt public.island_wave_accounting;
begin
  if p_actor_id is null or p_island_owner is null or p_run_epoch is null or p_session_id is null
    or not coalesce(public.island_treasury_whole(p_expected_generation,true),false) then
    return jsonb_build_object('status','refused','reason','invalid_change'); end if;
  if not public.shared_session_actor_active(p_actor_id) then
    raise insufficient_privilege using message='actor_inactive'; end if;
  v_plan:=public.shared_session_lock_plan(array[p_island_owner],p_actor_id);
  v_fingerprint:=jsonb_build_object('islandOwner',p_island_owner,'runEpoch',p_run_epoch,
    'sessionId',p_session_id,'expectedGeneration',trunc(p_expected_generation)::text);
  select * into v_old from public.island_economy_operations where actor_id=p_actor_id and action_uid=p_action_uid;
  if found then v_account:=v_old.account_id;
  else
    select * into v_state from public.island_economy_state where island_owner=p_island_owner;
    if not found then return jsonb_build_object('status','refused','reason','account_missing'); end if;
    v_account:=v_state.current_account_id;
  end if;
  v_claim:=public.island_economy_claim_operation_locked(p_actor_id,v_account,p_run_epoch,
    p_action_uid,'session_attach',v_fingerprint);
  if v_claim->>'status'='refused' then return v_claim; end if;
  v_operation:=(v_claim->>'operationId')::uuid;
  if (v_claim->>'repeat')::boolean then
    select result into v_result from public.shared_session_receipts where operation_id=v_operation;
    if not found then raise exception 'session_receipt_missing'; end if;
    return v_result;
  end if;
  perform public.shared_session_lock_plan_rows(v_plan);
  if not public.shared_session_actor_active(p_actor_id) then
    v_result:=jsonb_build_object('status','refused','reason','not_member'); raise sqlstate 'PS001'; end if;
  if p_actor_id<>p_island_owner and not exists(select 1 from public.island_members
    where island_owner=p_island_owner and player_id=p_actor_id and left_at is null) then
    v_result:=jsonb_build_object('status','refused','reason','not_member'); raise sqlstate 'PS001'; end if;
  if not exists(select 1 from public.personal_captain_profiles where player_id=p_actor_id) then
    v_result:=jsonb_build_object('status','refused','reason','captain_context_required'); raise sqlstate 'PS001'; end if;
  v_now:=clock_timestamp();
  perform public.shared_session_normalize_locked(p_island_owner,v_now);
  select * into v_control from public.shared_session_controls where player_id=p_actor_id;
  if found and v_control.released_at is null and v_control.session_id<>p_session_id then
    v_result:=jsonb_build_object('status','refused','reason','controller_held'); raise sqlstate 'PS001'; end if;
  if (v_control.player_id is null and p_expected_generation<>0)
    or (v_control.player_id is not null and v_control.released_at is null
      and v_control.connection_generation<>p_expected_generation)
    or (v_control.released_at is not null and p_expected_generation<>0
      and v_control.connection_generation<>p_expected_generation) then
    v_result:=jsonb_build_object('status','refused','reason','stale_controller'); raise sqlstate 'PS001'; end if;
  if v_control.player_id is not null and v_control.island_owner<>p_island_owner
    and exists(select 1 from public.personal_captain_profiles
      where player_id=p_actor_id and assignment_wave_id is not null) then
    v_result:=jsonb_build_object('status','refused','reason','captain_assigned'); raise sqlstate 'PS001'; end if;
  v_generation:=coalesce(v_control.connection_generation,0)+1;
  insert into public.shared_session_controls(player_id,island_owner,run_epoch,session_id,
    connection_generation,last_seen,active_since,connected_until,grace_until,released_at)
    values(p_actor_id,p_island_owner,p_run_epoch,p_session_id,v_generation,v_now,
      case when v_control.island_owner=p_island_owner and v_control.connected_until>v_now
        then v_control.active_since else v_now end,v_now+interval '15 seconds',null,null)
    on conflict(player_id) do update set island_owner=excluded.island_owner,run_epoch=excluded.run_epoch,
      session_id=excluded.session_id,connection_generation=excluded.connection_generation,
      last_seen=excluded.last_seen,active_since=excluded.active_since,
      connected_until=excluded.connected_until,grace_until=null,released_at=null;
  update public.shared_session_slots s set connection_generation=v_generation,status='active',grace_until=null
    where s.player_id=p_actor_id and s.controlling_session_id=p_session_id and s.status<>'withdrawn'
      and (s.grace_until is null or s.grace_until>v_now)
      and exists(select 1 from public.personal_captain_profiles p
        where p.player_id=p_actor_id and p.assignment_wave_id=s.wave_id);
  for v_slot in select s.* from public.shared_session_slots s where s.player_id=p_actor_id
    and s.status='active' and s.connection_generation=v_generation and s.copy_id is not null
    and exists(select 1 from public.personal_captain_profiles p
      where p.player_id=p_actor_id and p.assignment_wave_id=s.wave_id) loop
    select * into strict v_attempt from public.island_wave_accounting where wave_id=v_slot.wave_id;
    perform public.island_shared_arsenal_holder_locked(v_attempt.account_id,v_attempt.run_epoch,
      p_actor_id,v_slot.copy_id,v_slot.copy_generation,'reconnect',v_now,v_slot.wave_id,null);
  end loop;
  perform public.shared_session_elect_locked(p_island_owner,v_now);
  if v_control.island_owner is not null and v_control.island_owner<>p_island_owner then
    perform public.shared_session_elect_locked(v_control.island_owner,v_now); end if;
  v_result:=public.shared_session_read(p_actor_id,p_island_owner,p_session_id,v_generation);
  insert into public.shared_session_receipts(operation_id,result) values(v_operation,v_result);
  return v_result;
exception when sqlstate 'PS001' then return v_result;
end; $$;
comment on function public.shared_session_attach(uuid,uuid,uuid,uuid,numeric,text) is
  'Service-only generation-CAS controller attachment. Common-root replay before phase changes, with refusal rollback and no second tab/assignment.';

create or replace function public.shared_session_heartbeat(
  p_actor_id uuid,p_island_owner uuid,p_run_epoch uuid,p_session_id uuid,p_connection_generation numeric
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_plan jsonb; v_control public.shared_session_controls; v_now timestamptz;
begin
  if not public.shared_session_actor_active(p_actor_id) then
    raise insufficient_privilege using message='actor_inactive'; end if;
  v_plan:=public.shared_session_lock_plan(array[p_island_owner],p_actor_id);
  perform public.shared_session_lock_plan_rows(v_plan);
  v_now:=clock_timestamp();
  select * into v_control from public.shared_session_controls where player_id=p_actor_id;
  if not found or v_control.island_owner is distinct from p_island_owner
    or v_control.run_epoch is distinct from p_run_epoch or v_control.session_id is distinct from p_session_id
    or v_control.connection_generation is distinct from p_connection_generation then
    return jsonb_build_object('status','refused','reason','stale_controller'); end if;
  perform public.shared_session_normalize_locked(p_island_owner,v_now);
  if not exists(select 1 from public.shared_session_controls where player_id=p_actor_id) then
    return jsonb_build_object('status','refused','reason','stale_controller'); end if;
  if v_control.connected_until is null or v_now>=v_control.connected_until then
    return jsonb_build_object('status','refused','reason','reconnect_required'); end if;
  update public.shared_session_controls set last_seen=v_now,connected_until=v_now+interval '15 seconds'
    where player_id=p_actor_id;
  return public.shared_session_read(p_actor_id,p_island_owner,p_session_id,p_connection_generation);
end; $$;
comment on function public.shared_session_heartbeat(uuid,uuid,uuid,uuid,numeric) is
  'Only a current active controller renews trusted proof time; an expired lease requires fenced reconnect and cannot extend an old absence deadline.';

create or replace function public.shared_session_disconnect(
  p_actor_id uuid,p_island_owner uuid,p_run_epoch uuid,p_session_id uuid,p_connection_generation numeric
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_plan jsonb; v_control public.shared_session_controls; v_now timestamptz;
begin
  if not public.shared_session_actor_active(p_actor_id) then
    raise insufficient_privilege using message='actor_inactive'; end if;
  v_plan:=public.shared_session_lock_plan(array[p_island_owner],p_actor_id);
  perform public.shared_session_lock_plan_rows(v_plan);
  v_now:=clock_timestamp();
  select * into v_control from public.shared_session_controls where player_id=p_actor_id;
  if not found or v_control.island_owner is distinct from p_island_owner
    or v_control.run_epoch is distinct from p_run_epoch or v_control.session_id is distinct from p_session_id
    or v_control.connection_generation is distinct from p_connection_generation then
    return jsonb_build_object('status','refused','reason','stale_controller'); end if;
  if v_control.grace_until is null then
    update public.shared_session_controls set active_since=null,connected_until=null,
      grace_until=case when v_now>=v_control.connected_until then v_control.last_seen+interval '60 seconds'
        else v_now+interval '60 seconds' end where player_id=p_actor_id;
    update public.shared_session_slots s set status='grace',grace_until=(
      select grace_until from public.shared_session_controls where player_id=p_actor_id)
      where s.player_id=p_actor_id and s.status='active' and exists(select 1 from public.personal_captain_profiles p
        where p.player_id=p_actor_id and p.assignment_wave_id=s.wave_id);
    perform public.shared_session_grace_copy_locked(p_actor_id,p_island_owner,v_now);
  end if;
  return public.shared_session_read(p_actor_id,p_island_owner,p_session_id,p_connection_generation);
end; $$;
comment on function public.shared_session_disconnect(uuid,uuid,uuid,uuid,numeric) is
  'Fenced disconnect fixes a nonrenewable deadline once. Duplicate or obsolete notifications never extend grace.';

create or replace function public.shared_session_process_due(p_limit integer default 20)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_owners uuid[]; v_owner uuid; v_plan jsonb; v_now timestamptz;
begin
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid_worker_limit'; end if;
  select array_agg(island_owner order by island_owner) into v_owners from (
    select distinct island_owner from public.shared_session_controls
      where coalesce(grace_until,connected_until)<=clock_timestamp()
      order by island_owner limit p_limit
  ) due;
  if v_owners is null then return jsonb_build_object('status','done','islands',0); end if;
  v_plan:=public.shared_session_lock_plan(v_owners);
  perform public.shared_session_lock_plan_rows(v_plan);
  v_now:=clock_timestamp();
  foreach v_owner in array v_owners loop perform public.shared_session_normalize_locked(v_owner,v_now); end loop;
  return jsonb_build_object('status','done','islands',cardinality(v_owners));
end; $$;
comment on function public.shared_session_process_due(integer) is
  'Bounded independent worker transaction; captured complete cohort scopes/accounts precede all personal/domain locks. Deadlines are rechecked, never trusted from timer payloads.';

do $$
declare v_function record;
begin
  for v_function in select p.oid::regprocedure as signature from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
      and p.proname like 'shared_session_%' loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',v_function.signature);
  end loop;
end $$;
grant execute on function public.shared_session_read(uuid,uuid,uuid,numeric) to service_role;
grant execute on function public.shared_session_attach(uuid,uuid,uuid,uuid,numeric,text) to service_role;
grant execute on function public.shared_session_heartbeat(uuid,uuid,uuid,uuid,numeric) to service_role;
grant execute on function public.shared_session_disconnect(uuid,uuid,uuid,uuid,numeric) to service_role;
grant execute on function public.shared_session_process_due(integer) to service_role;

create or replace function public.shared_session_retire_island_locked(
  p_island_owner uuid,p_old_account uuid,p_old_epoch uuid,p_now timestamptz,p_deleted boolean
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_count integer; v_generation numeric;
begin
  if p_now is null or p_deleted is null or not exists(select 1 from public.island_economy_accounts
    where id=p_old_account and island_owner=p_island_owner and run_epoch=p_old_epoch) then
    raise exception 'economy_origin_mismatch'; end if;
  if exists(select 1 from public.island_wave_accounting a where a.account_id=p_old_account
    and a.run_epoch=p_old_epoch and not exists(
      select 1 from public.island_wave_closures c where c.wave_id=a.wave_id)) then
    raise exception 'wave_still_reserved'; end if;
  update public.shared_session_controls set island_owner=null,run_epoch=null,
    active_since=null,connected_until=null,grace_until=null,released_at=p_now
    where island_owner=p_island_owner and run_epoch=p_old_epoch;
  get diagnostics v_count=row_count;
  if p_deleted then
    delete from public.shared_session_settings where island_owner=p_island_owner;
  else
    perform public.shared_session_rotate_topic_locked(p_island_owner);
    update public.shared_session_settings set leader_id=null,break_paused=false,auto_next=false
      where island_owner=p_island_owner returning topic_generation into v_generation;
  end if;
  return jsonb_build_object('status','done','controlsRevoked',v_count,
    'topicGeneration',case when v_generation is not null then trunc(v_generation)::text end);
end; $$;
comment on function public.shared_session_retire_island_locked(uuid,uuid,uuid,timestamptz,boolean) is
  'Private reset/deletion ephemeral cleanup after original-account closure. Preserves frozen history and unrelated assignments/controllers; rotates reset topics and removes deleted-island settings.';

create or replace function public.shared_session_revival_context_locked(
  p_actor_id uuid,p_wave_id uuid,p_target_token uuid,p_session_id uuid,p_connection_generation numeric
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_attempt public.island_wave_accounting; v_control public.shared_session_controls;
  v_helper public.shared_session_slots; v_target public.shared_session_slots;
  v_now timestamptz; v_skills jsonb; v_ms integer; v_share integer;
  v_seal integer; v_required_head bigint;
begin
  v_now:=clock_timestamp();
  if not public.shared_session_actor_active(p_actor_id) then raise exception 'not_member'; end if;
  select * into v_attempt from public.island_wave_accounting where wave_id=p_wave_id;
  if not found then raise exception 'not_in_wave'; end if;
  if not exists(select 1 from public.wave_runs r join public.recovery_wave_states w on w.wave_id=r.id
    where r.id=p_wave_id and r.finished_at is null and w.closed_at is null
      and v_now>=r.starts_at and v_now<r.starts_at+make_interval(secs=>r.maximum_seconds))
    or exists(select 1 from public.island_wave_closures where wave_id=p_wave_id) then
    raise exception 'wave_over'; end if;
  if p_actor_id<>v_attempt.island_owner and not exists(select 1 from public.island_members
    where island_owner=v_attempt.island_owner and player_id=p_actor_id and left_at is null) then
    raise exception 'not_member'; end if;
  select * into v_control from public.shared_session_controls where player_id=p_actor_id;
  if not found or v_control.island_owner is distinct from v_attempt.island_owner
    or v_control.run_epoch is distinct from v_attempt.run_epoch
    or v_control.session_id is distinct from p_session_id
    or v_control.connection_generation is distinct from p_connection_generation
    or v_control.connected_until is null or v_now>=v_control.connected_until then
    raise exception 'not_controller'; end if;
  if not exists(select 1 from public.personal_captain_profiles
    where player_id=p_actor_id and assignment_wave_id=p_wave_id) then raise exception 'not_in_wave'; end if;
  perform 1 from public.shared_session_slots where wave_id=p_wave_id
    and (player_id=p_actor_id or participant_token=p_target_token) order by player_id for update;
  select * into v_helper from public.shared_session_slots where wave_id=p_wave_id and player_id=p_actor_id;
  select * into v_target from public.shared_session_slots where wave_id=p_wave_id and participant_token=p_target_token;
  select sealed_through_tick into v_seal from public.recovery_wave_states where wave_id=p_wave_id;
  select coalesce(max(seq),0) into v_required_head from public.recovery_wave_events
    where wave_id=p_wave_id and effective_tick<=v_seal;
  if v_helper.player_id is not null and v_target.player_id is not null
    and (v_helper.state_through_tick<v_seal or v_target.state_through_tick<v_seal
      or v_helper.state_input_head<v_required_head or v_target.state_input_head<v_required_head) then
    raise exception 'health_sync_required'; end if;
  if v_helper.player_id is null or v_helper.status<>'active' or v_helper.down
    or v_helper.controlling_session_id is distinct from p_session_id
    or v_helper.connection_generation is distinct from p_connection_generation then
    raise exception 'not_controller'; end if;
  if v_target.player_id is null or v_target.player_id=p_actor_id or v_target.status='withdrawn'
    or (v_target.status='grace' and v_target.grace_until<=v_now)
    or not public.shared_session_actor_active(v_target.player_id)
    or not exists(select 1 from public.personal_captain_profiles
      where player_id=v_target.player_id and assignment_wave_id=p_wave_id)
    or not exists(select 1 from public.shared_session_controls l
      where l.player_id=v_target.player_id and l.island_owner=v_attempt.island_owner
        and l.run_epoch=v_attempt.run_epoch and l.session_id=v_target.controlling_session_id
        and l.connection_generation=v_target.connection_generation
        and v_now<coalesce(l.grace_until,l.last_seen+interval '60 seconds'))
    or (v_target.player_id<>v_attempt.island_owner and not exists(select 1 from public.island_members
      where island_owner=v_attempt.island_owner and player_id=v_target.player_id and left_at is null))
    or not v_target.down or v_target.fall_id is null then raise exception 'target_not_fallen'; end if;
  if (v_helper.x-v_target.x)^2+(v_helper.z-v_target.z)^2>9 then raise exception 'out_of_reach'; end if;
  v_skills:=v_helper.frozen_captain->'skills';
  v_ms:=case when v_skills ? 'medic' then 1200 else 2000 end;
  v_share:=case when v_skills ? 'field_surgeon' then 1000000
    when v_skills ? 'medic' then 750000 else 500000 end;
  return jsonb_build_object('helperToken',v_helper.participant_token,'targetToken',v_target.participant_token,
    'fallId',v_target.fall_id,'downAtTick',v_target.down_at_tick,
    'helperPoseRevision',trunc(v_helper.pose_revision)::text,'targetPoseRevision',trunc(v_target.pose_revision)::text,
    'helperX',v_helper.x,'helperZ',v_helper.z,'targetX',v_target.x,'targetZ',v_target.z,
    'helperHpUnits',v_helper.hp_units,'targetHpUnits',v_target.hp_units,'targetMaxHP',100,
    'helperReviveSeq',v_helper.revive_basis_seq,
    'frozenHelperSkills',v_skills,'frozenHelperCaptain',v_helper.frozen_captain,
    'requiredMs',v_ms,'restoreHPUnits',v_share,'reviveReach',3);
end; $$;
comment on function public.shared_session_revival_context_locked(uuid,uuid,uuid,uuid,numeric) is
  'Private current canonical helper/target proof after earlier origin/personal locks. No normalization, hold store or earlier lock acquisition; immutable Captain/loadout supplies Medic stats.';

create or replace function public.shared_session_revive_consume_locked(
  p_wave_id uuid,p_target_token uuid,p_expected_fall_id uuid,p_revive_seq bigint,p_restore_hp_units integer
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_target public.shared_session_slots;
begin
  select * into v_target from public.shared_session_slots where wave_id=p_wave_id
    and participant_token=p_target_token for update;
  if not found or v_target.status='withdrawn' or not v_target.down then raise exception 'target_not_fallen'; end if;
  if v_target.fall_id is distinct from p_expected_fall_id then raise exception 'stale_fall'; end if;
  if p_restore_hp_units is null or p_restore_hp_units not between 1 and 1000000
    or p_revive_seq is null or p_revive_seq<=v_target.revive_basis_seq then raise exception 'invalid_revival'; end if;
  if not exists(select 1 from public.recovery_wave_events e where e.wave_id=p_wave_id and e.seq=p_revive_seq
    and e.event_kind='captain_revive' and e.payload->>'targetId'=p_target_token::text
    and e.payload->>'fallId'=p_expected_fall_id::text) then raise exception 'revival_event_missing'; end if;
  update public.shared_session_slots set hp_units=p_restore_hp_units,down=false,fall_id=null,
    down_at_tick=null,revive_basis_seq=p_revive_seq where wave_id=p_wave_id and participant_token=p_target_token;
  return jsonb_build_object('status','done','hpUnits',p_restore_hp_units,'reviveSeq',p_revive_seq);
end; $$;
comment on function public.shared_session_revive_consume_locked(uuid,uuid,uuid,bigint,integer) is
  'Consume exactly the current fall after its real server journal event, advancing the revival basis atomically. No payout, generic heal or pose reset.';
revoke all on function public.shared_session_retire_island_locked(uuid,uuid,uuid,timestamptz,boolean)
  from public,anon,authenticated,service_role;
revoke all on function public.shared_session_revival_context_locked(uuid,uuid,uuid,uuid,numeric)
  from public,anon,authenticated,service_role;
revoke all on function public.shared_session_revive_consume_locked(uuid,uuid,uuid,bigint,integer)
  from public,anon,authenticated,service_role;

create or replace function public.shared_session_grace_copy_locked(
  p_actor_id uuid,p_owner uuid,p_now timestamptz
) returns void language plpgsql volatile security definer set search_path='' as $$
declare v_slot public.shared_session_slots; v_attempt public.island_wave_accounting;
begin
  for v_slot in select s.* from public.shared_session_slots s
    where s.player_id=p_actor_id and s.status='grace' and s.copy_id is not null
      and exists(select 1 from public.island_wave_accounting a
        where a.wave_id=s.wave_id and a.island_owner=p_owner)
      and not exists(select 1 from public.island_wave_closures c where c.wave_id=s.wave_id) loop
    select * into strict v_attempt from public.island_wave_accounting where wave_id=v_slot.wave_id;
    perform public.island_shared_arsenal_holder_locked(v_attempt.account_id,v_attempt.run_epoch,
      p_actor_id,v_slot.copy_id,v_slot.copy_generation,'disconnect',p_now,v_slot.wave_id,v_slot.grace_until);
  end loop;
end; $$;
comment on function public.shared_session_grace_copy_locked(uuid,uuid,timestamptz) is
  'Private original-slot/tenure disconnect deadline synchronization; no competing timer or assignment source.';
revoke all on function public.shared_session_grace_copy_locked(uuid,uuid,timestamptz)
  from public,anon,authenticated,service_role;

-- Existing policies retain their guest/Broadcast gates and call this predicate.
-- A cached legacy/old-generation subscriber receives no new shared frames once
-- clients move to the rotated namespace; new joins require the exact nonce.
create or replace function island_realtime_private.may_access_place_topic(p_topic text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare v_actor uuid:=auth.uid(); v_place text; v_code text; v_owner uuid; v_shared boolean; v_nonce text;
begin
  if v_actor is null or p_topic is null
    or p_topic !~ '^live:place:[a-z][a-z0-9_]{1,39}:[1-9][0-9]?$' then return false; end if;
  v_place:=split_part(p_topic,':',3);
  if v_place<>'isle' and left(v_place,5)<>'isle_' then return true; end if;
  if v_place !~ '^isle_[abcdefghjkmnpqrstuvwxyz23456789]{5}(_[0-9a-f]{24})?$' then return false; end if;
  v_code:=substring(v_place from 6 for 5);
  select i.player_id,s.island_owner is not null,t.topic_nonce into v_owner,v_shared,v_nonce
    from public.islands i left join public.island_economy_state s on s.island_owner=i.player_id
    left join public.shared_session_settings t on t.island_owner=i.player_id where i.code=upper(v_code);
  if not found then return false; end if;
  if not v_shared then return v_place='isle_'||v_code; end if;
  if not public.shared_session_actor_active(v_actor) or v_nonce is null
    or v_place<>'isle_'||v_code||'_'||v_nonce then return false; end if;
  return v_actor=v_owner or exists(select 1 from public.island_members m
    where m.island_owner=v_owner and m.player_id=v_actor and m.left_at is null);
end; $$;
comment on function island_realtime_private.may_access_place_topic(text) is
  'Caller-only fresh Broadcast authorization: known legacy bare topics remain; persisted shared islands require active identity/member and exact current server topic nonce.';
revoke all on function island_realtime_private.may_access_place_topic(text)
  from public,anon,authenticated,service_role;
grant execute on function island_realtime_private.may_access_place_topic(text) to authenticated;
