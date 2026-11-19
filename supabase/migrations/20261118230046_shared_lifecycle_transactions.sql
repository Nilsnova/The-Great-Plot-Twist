-- Lifecycle compatibility: compose provided canonical/session/arsenal/reset hooks.
-- No new assignment, wave, money model, admission or conversion authority is added.

-- Collect every DDL barrier without retaining a partial set while waiting.
do $$
declare v_deadline timestamptz := clock_timestamp()+interval '30 seconds';
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode='25000',message='lifecycle_migration_requires_read_committed';
  end if;
  loop
    begin
      lock table public.island_economy_accounts in access exclusive mode nowait;
      lock table public.island_economy_state in access exclusive mode nowait;
      lock table public.wave_runs in access exclusive mode nowait;
      lock table public.recovery_wave_states in access exclusive mode nowait;
      lock table public.recovery_health_checkpoints in access exclusive mode nowait;
      lock table public.islands in access exclusive mode nowait;
      lock table public.profiles in access exclusive mode nowait;
      exit;
    exception when lock_not_available then
      if clock_timestamp() >= v_deadline then
        raise exception using errcode='55P03',message='lifecycle_migration_busy';
      end if;
    end;
    perform pg_sleep(0.05);
  end loop;
end;
$$;

-- Retained origins remain the original UUID; a live island/profile may disappear.
alter table public.island_economy_accounts
  drop constraint if exists island_economy_accounts_island_owner_fkey;
alter table public.wave_runs drop constraint if exists wave_runs_started_by_fkey;
alter table public.wave_runs drop constraint if exists wave_runs_island_owner_fkey;
alter table public.recovery_wave_states
  drop constraint if exists recovery_wave_states_island_owner_fkey;
alter table public.recovery_health_checkpoints
  drop constraint if exists recovery_health_checkpoints_actor_id_fkey;
comment on column public.island_economy_accounts.island_owner is
  'Original historical owner UUID, never reassigned. Live-island deletion requires checked retirement/disposition; new origins still require a live island.';
comment on column public.wave_runs.started_by is
  'Original starter UUID retained for shared canonical completion after deletion; new starts still require a live, nondeleted profile.';
comment on column public.wave_runs.island_owner is
  'Original island UUID retained for shared history after checked owner deletion; legacy-only rows are explicitly removed.';
comment on column public.recovery_wave_states.island_owner is
  'Original owner UUID of immutable shared replay/closed proof, independent of the deleted live profile.';
comment on column public.recovery_health_checkpoints.actor_id is
  'Original UUID retained only for shared canonical checkpoint proof. Legacy-only authored reports are purged by checked deletion.';

-- Preserve former FK creation checks without cascading retained history away.
create or replace function public.island_lifecycle_live_origin_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_actor uuid; v_owner uuid;
begin
  if tg_table_name='wave_runs' then
    if tg_op='INSERT' or new.started_by is distinct from old.started_by then
      v_actor := new.started_by;
    end if;
    if tg_op='INSERT' or new.island_owner is distinct from old.island_owner then
      v_owner := new.island_owner;
    end if;
  elsif tg_table_name='island_economy_accounts' then
    if tg_op='INSERT' or new.island_owner is distinct from old.island_owner then
      v_owner := new.island_owner;
    end if;
  elsif tg_table_name='recovery_wave_states' then
    if tg_op='INSERT' or new.island_owner is distinct from old.island_owner then
      v_actor := new.island_owner;
    end if;
  elsif tg_table_name='recovery_health_checkpoints' then
    if tg_op='INSERT' or new.actor_id is distinct from old.actor_id then
      v_actor := new.actor_id;
    end if;
  end if;
  if v_actor is not null then
    perform 1 from public.profiles where id=v_actor for key share;
    if not found or exists(select 1 from public.island_deleted_player_dispositions
      where player_id=v_actor) then
      raise exception using errcode='23503',message='lifecycle_origin_actor_missing';
    end if;
  end if;
  if v_owner is not null then
    perform 1 from public.islands where player_id=v_owner for key share;
    if not found then
      raise exception using errcode='23503',message='lifecycle_origin_island_missing';
    end if;
  end if;
  return new;
end;
$$;
comment on function public.island_lifecycle_live_origin_guard() is
  'Former FK KEY SHARE/live-parent creation semantics. Unchanged historical identity remains settleable after live deletion.';
create or replace trigger wave_runs_live_origin_guard
  before insert or update of started_by,island_owner on public.wave_runs
  for each row execute function public.island_lifecycle_live_origin_guard();
create or replace trigger island_economy_accounts_live_origin_guard
  before insert or update of island_owner on public.island_economy_accounts
  for each row execute function public.island_lifecycle_live_origin_guard();
create or replace trigger recovery_wave_states_live_origin_guard
  before insert or update of island_owner on public.recovery_wave_states
  for each row execute function public.island_lifecycle_live_origin_guard();
create or replace trigger recovery_health_checkpoints_live_origin_guard
  before insert or update of actor_id on public.recovery_health_checkpoints
  for each row execute function public.island_lifecycle_live_origin_guard();

-- Include legacy holders/cleanup rows, not only the shared holder helper's domain.
create or replace function public.island_lifecycle_actor_owners(p_actor_id uuid)
returns uuid[] language plpgsql stable security definer set search_path='' as $$
declare v_result uuid[];
begin
  select array_agg(owner_id order by owner_id) into v_result from (
    select p_actor_id as owner_id
    union select s.island_owner from public.island_economy_state s
      join public.island_members m on m.island_owner=s.island_owner
      where m.player_id=p_actor_id and m.left_at is null
    union select island_owner from public.arsenal_copies where holder=p_actor_id
    union select island_owner from public.wave_runs where started_by=p_actor_id
    union select w.island_owner from public.recovery_health_checkpoints c
      join public.recovery_wave_states w on w.wave_id=c.wave_id where c.actor_id=p_actor_id
    union select unnest(public.shared_session_actor_owners(p_actor_id))
  ) owners where owner_id is not null;
  return coalesce(v_result,'{}'::uuid[]);
end;
$$;
comment on function public.island_lifecycle_actor_owners(uuid) is
  'Read-only candidate inventory including ALL legacy/shared held copies and authored legacy cleanup origins. Revalidate after sorted guards and the final actor FK fence.';

create or replace function public.island_lifecycle_guard_actors(p_actor_id uuid,p_owners uuid[])
returns uuid[] language plpgsql stable security definer set search_path='' as $$
declare v_result uuid[];
begin
  select array_agg(actor_id order by actor_id) into v_result from (
    select p_actor_id as actor_id union select unnest(p_owners)
    union select player_id from public.shared_session_controls where island_owner=any(p_owners)
    union select (slot->>'playerId')::uuid
      from public.island_wave_accounting a
      cross join lateral jsonb_array_elements(a.roster) slot
      where a.island_owner=any(p_owners) and not exists(
        select 1 from public.island_wave_closures c where c.wave_id=a.wave_id)
  ) actors where actor_id is not null;
  return coalesce(v_result,'{}'::uuid[]);
end;
$$;
comment on function public.island_lifecycle_guard_actors(uuid,uuid[]) is
  'Frozen roster/owner/actor batch, discovered before any personal lock. No live roster or assignment is invented.';

create or replace function public.island_lifecycle_lock_guards(p_actors uuid[])
returns void language plpgsql volatile security definer set search_path='' as $$
declare v_key bigint;
begin
  for v_key in select distinct pg_catalog.hashtextextended('island-economy:'||actor::text,0)
    from unnest(p_actors) actor order by 1
  loop perform pg_catalog.pg_advisory_xact_lock(v_key); end loop;
end;
$$;
comment on function public.island_lifecycle_lock_guards(uuid[]) is
  'Existing common signed Class 0 key ordering, deduplicated. Caller retries the whole batch if discovery changes.';

create or replace function public.island_lifecycle_actor_related(p_actor_id uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
  return exists(select 1 from public.island_economy_state where island_owner=p_actor_id)
    or exists(select 1 from public.island_economy_accounts where island_owner=p_actor_id)
    or exists(select 1 from public.island_members m join public.island_economy_state s
      on s.island_owner=m.island_owner where m.player_id=p_actor_id and m.left_at is null)
    or exists(select 1 from public.personal_captain_profiles where player_id=p_actor_id)
    or exists(select 1 from public.island_economy_operations where actor_id=p_actor_id)
    or exists(select 1 from public.island_wave_accounting a
      cross join lateral jsonb_array_elements(a.roster) slot where slot->>'playerId'=p_actor_id::text)
    or exists(select 1 from public.recovery_health_checkpoints c
      join public.island_wave_accounting a on a.wave_id=c.wave_id where c.actor_id=p_actor_id)
    or exists(select 1 from public.arsenal_copies
      where holder=p_actor_id and economy_account_id is not null)
    or cardinality(public.shared_session_actor_owners(p_actor_id))>0;
end;
$$;
comment on function public.island_lifecycle_actor_related(uuid) is
  'Select the complete disposition path for shared, managed or historical actors. Pure legacy deletion adds no permanent UUID record.';

-- Reproduce only former legacy cascades; shared accounting is the retention fence.
create or replace function public.island_lifecycle_purge_legacy_history(p_actor_id uuid)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
  delete from public.recovery_health_checkpoints c where c.actor_id=p_actor_id
    and not exists(select 1 from public.island_wave_accounting a where a.wave_id=c.wave_id);
  delete from public.recovery_wave_states w where w.island_owner=p_actor_id
    and not exists(select 1 from public.island_wave_accounting a where a.wave_id=w.wave_id);
  delete from public.wave_runs r where (r.started_by=p_actor_id or r.island_owner=p_actor_id)
    and not exists(select 1 from public.island_wave_accounting a where a.wave_id=r.id);
end;
$$;
comment on function public.island_lifecycle_purge_legacy_history(uuid) is
  'Explicit original legacy-only wave/report purge after historical FK detachment; never deletes a shared accounting origin. Called before Auth and also guards direct legacy cascades.';

-- Preserve the established crew handover/Auth delete implementation privately.
do $$
declare v_definition text;
begin
  if to_regprocedure('public.island_lifecycle_delete_legacy(uuid)') is null then
    v_definition := pg_get_functiondef('public.delete_player(uuid)'::regprocedure);
    if position('island_lifecycle_delete_legacy' in v_definition)>0 then
      raise exception 'lifecycle_legacy_delete_source_missing';
    end if;
    execute regexp_replace(v_definition,'FUNCTION public\.delete_player\(',
      'FUNCTION public.island_lifecycle_delete_legacy(');
  end if;
end;
$$;
revoke all on function public.island_lifecycle_delete_legacy(uuid)
  from public,anon,authenticated,service_role;

-- A dashboard/raw cascade cannot bypass required shared dispositions.
create or replace function public.island_lifecycle_profile_delete_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if public.island_lifecycle_actor_related(old.id) and not exists(
    select 1 from public.island_deleted_player_dispositions where player_id=old.id) then
    raise exception using errcode='23514',message='shared_deletion_disposition_required';
  end if;
  perform public.island_lifecycle_purge_legacy_history(old.id);
  return old;
end;
$$;
comment on function public.island_lifecycle_profile_delete_guard() is
  'Fail closed on raw shared-related profile cascades; only the complete atomic lifecycle transaction prepares deletion.';
create or replace trigger island_lifecycle_profile_delete_guard before delete on public.profiles
  for each row execute function public.island_lifecycle_profile_delete_guard();

-- Keep the old signature only for genuinely unadopted legacy cleanup.
create or replace function public.delete_player(p_player_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  return public.island_lifecycle_delete_transaction(p_player_id,false,true);
end;
$$;
comment on function public.delete_player(uuid) is
  'Original legacy purge/crew handover only when no shared/managed/history disposition is required. Wallet precedes physical profile deletion. Shared-related callers must use the complete confirmed lifecycle transaction.';

-- Closing is delegated to the actual canonical owner; unknown waves stay a gate.
create or replace function public.island_lifecycle_close_owned_locked(
  p_owner uuid,p_now timestamptz
) returns integer language plpgsql volatile security definer set search_path='' as $$
declare v_wave uuid; v_count integer := 0;
begin
  for v_wave in select a.wave_id from public.island_wave_accounting a
    where a.island_owner=p_owner and not exists(
      select 1 from public.island_wave_closures c where c.wave_id=a.wave_id)
    order by a.wave_id
  loop
    perform public.shared_session_close_locked(v_wave,'abandoned','[]'::jsonb,p_now);
    if not exists(select 1 from public.island_wave_closures where wave_id=v_wave)
      or exists(select 1 from public.wave_runs where id=v_wave and finished_at is null)
      or exists(select 1 from public.recovery_wave_states where wave_id=v_wave and closed_at is null) then
      raise exception 'wave_running';
    end if;
    v_count := v_count+1;
  end loop;
  if exists(select 1 from public.wave_runs where island_owner=p_owner and finished_at is null) then
    raise exception 'wave_running';
  end if;
  return v_count;
end;
$$;
comment on function public.island_lifecycle_close_owned_locked(uuid,timestamptz) is
  'Confirmed owner deletion canonical abandonment request with actual deadline normalization and complete close proof. Reset never invokes this helper. Does not invent a missing reservation or accounting source.';

create or replace function public.island_lifecycle_reset_assets_locked(
  p_owner uuid,p_account uuid,p_epoch uuid,p_now timestamptz
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_copies jsonb; v_sessions jsonb; v_buildings integer; v_research integer;
  v_layout integer; v_health integer; v_walls integer;
begin
  perform public.island_economy_require_idle_locked(p_owner);
  v_copies := public.island_shared_arsenal_reset_locked(p_account,p_epoch,p_owner,p_now);
  v_sessions := public.shared_session_retire_island_locked(p_owner,p_account,p_epoch,p_now,false);
  if v_sessions->>'status' is distinct from 'done' then raise exception 'path_unavailable'; end if;
  delete from public.islet_buildings where player_id=p_owner and building_type<>'cabin';
  get diagnostics v_buildings=row_count;
  delete from public.island_research where island_owner=p_owner;
  get diagnostics v_research=row_count;
  delete from public.island_layout where island_owner=p_owner;
  get diagnostics v_layout=row_count;
  delete from public.island_structure_health where island_owner=p_owner;
  get diagnostics v_health=row_count;
  delete from public.island_wall_records where island_owner=p_owner;
  get diagnostics v_walls=row_count;
  -- A cabin survives as a fresh structure identity; old health/quotes cannot cross reset.
  update public.islet_buildings set recovery_instance_id=gen_random_uuid(),
    spec=null,tree_a=0,tree_b=0,economy_upgrade_revision=0
    where player_id=p_owner and building_type='cabin';
  update public.islands set wave_best=default,won_wave_best=default,flags=default,
    next_wave=default,crew_gunner=default,crew_carpenter=default,
    crew_lookout=default,crew_guard=default,wreck_paid=default,
    weapons_owned='{musket}',weapon_equipped='musket' where player_id=p_owner;
  -- Personal Captain state, legacy private wallet and cloud save are not island assets.
  update public.island_recovery_state set reset_epoch=gen_random_uuid(),revision=revision+1,
    current_wave_id=null,reserved_at=null,starts_at=null,expires_at=null,updated_at=p_now
    where island_owner=p_owner;
  if not found then raise exception 'path_unavailable'; end if;
  return jsonb_build_object('buildingsCleared',v_buildings,'researchCleared',v_research,
    'layoutCleared',v_layout,'healthCleared',v_health,'wallRecordsCleared',v_walls,
    'copiesCleared',(v_copies->>'copiesCleared')::integer,
    'historicalMovesRetained',(v_copies->>'historicalMovesRetained')::integer,
    'controlsRevoked',(v_sessions->>'controlsRevoked')::integer);
end;
$$;
comment on function public.island_lifecycle_reset_assets_locked(uuid,uuid,uuid,timestamptz) is
  'Clear current communal island assets only at an already idle canonical boundary; preserve private progress and immutable old financial/wave/move history. Actual arsenal/session hooks precede treasury retirement.';

-- A public result never adopts the replacement under the old receipt origin.
create or replace function public.island_lifecycle_reset(
  p_actor_id uuid,p_island_owner uuid,p_run_epoch uuid,p_action_uid text,
  p_confirm_code text,p_starting_coins numeric,p_grant_policy_version text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_owners uuid[]; v_players uuid[]; v_retries integer:=0;
  v_account public.island_economy_accounts; v_state public.island_economy_state;
  v_old public.island_economy_operations; v_claim jsonb; v_operation uuid;
  v_code text; v_typed text; v_fingerprint jsonb; v_effects jsonb; v_result jsonb;
  v_now timestamptz;
begin
  if p_actor_id is null or p_island_owner is null or p_run_epoch is null
    or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
    or left(p_action_uid,3)='fx_' or left(p_action_uid,4)='sys_' or p_confirm_code is null then
    return jsonb_build_object('status','refused','reason','invalid_change'); end if;
  if p_actor_id<>p_island_owner then
    return jsonb_build_object('status','refused','reason','not_owner'); end if;
  v_typed:=upper(regexp_replace(left(p_confirm_code,32),'[[:space:]-]','','g'));
  if length(v_typed)=9 and left(v_typed,4)='ISLE' then v_typed:=substr(v_typed,5); end if;
  v_fingerprint:=jsonb_build_object('mode','island_shared','version',1,
    'islandOwner',p_island_owner,'runEpoch',p_run_epoch,'confirmCode',v_typed);
  loop
    begin
      v_owners:=array[p_island_owner];
      v_players:=public.island_lifecycle_guard_actors(p_actor_id,v_owners);
      perform public.island_lifecycle_lock_guards(v_players);
      if v_players is distinct from public.island_lifecycle_guard_actors(p_actor_id,v_owners) then
        raise exception using errcode='PT516',message='lifecycle_discovery_changed'; end if;
      perform 1 from public.island_economy_accounts where island_owner=any(v_owners)
        order by id for update;
      if not public.shared_session_actor_active(p_actor_id) then raise exception 'actor_inactive'; end if;
      -- Exact original replay precedes today's phase, pointer and server grant settings.
      select * into v_old from public.island_economy_operations
        where actor_id=p_actor_id and action_uid=p_action_uid;
      if found then
        select * into strict v_account from public.island_economy_accounts where id=v_old.account_id;
        if v_old.domain_action<>'lifecycle:reset' or v_old.fingerprint<>v_fingerprint
          or v_account.island_owner<>p_island_owner or v_old.run_epoch<>p_run_epoch then
          raise exception 'action_conflict'; end if;
        if not exists(select 1 from public.island_economy_reset_receipts where id=v_old.id) then
          raise exception 'path_unavailable'; end if;
        return jsonb_set(public.island_economy_reset_result(v_old.id,true),
          '{currentEconomy}','null'::jsonb);
      end if;
      select * into v_state from public.island_economy_state where island_owner=p_island_owner;
      if not found then raise exception 'path_unavailable'; end if;
      select * into strict v_account from public.island_economy_accounts where id=v_state.current_account_id;
      if v_state.run_epoch<>p_run_epoch then raise exception 'epoch_mismatch'; end if;
      if v_account.state<>'active' or v_state.admission_state<>'active' then raise exception 'path_unavailable'; end if;
      select code into v_code from public.islands where player_id=p_island_owner;
      if v_code is null then raise exception 'not_owner'; end if;
      if v_typed is distinct from v_code then raise exception 'wrong_code'; end if;
      v_claim:=public.island_economy_claim_operation_locked(p_actor_id,v_account.id,p_run_epoch,
        p_action_uid,'lifecycle:reset',v_fingerprint);
      if v_claim->>'status'='refused' then return v_claim; end if;
      v_operation:=(v_claim->>'operationId')::uuid;
      perform public.shared_session_lock_plan_rows(jsonb_build_object(
        'owners',to_jsonb(v_owners),'players',to_jsonb(v_players)));
      if not public.shared_session_actor_active(p_actor_id) then raise exception 'actor_inactive'; end if;
      -- Reset cannot abandon, expire or seal a reservation. Canonical closure
      -- and accounting must already have committed before any live asset change.
      perform public.island_economy_require_idle_locked(p_island_owner);
      if exists(select 1 from public.island_wave_accounting a
        where a.account_id=v_account.id and not exists(
          select 1 from public.island_wave_closures c where c.wave_id=a.wave_id)) then
        raise exception 'wave_running'; end if;
      v_now:=clock_timestamp();
      v_effects:=public.island_lifecycle_reset_assets_locked(
        p_island_owner,v_account.id,p_run_epoch,v_now)||jsonb_build_object('wavesClosed',0);
      v_result:=public.island_economy_reset_treasury_locked(
        v_operation,p_starting_coins,p_grant_policy_version,v_effects);
      if v_result->>'status' is distinct from 'done' or not exists(
        select 1 from public.island_economy_reset_receipts where id=v_operation) then
        raise exception 'reset_grant_conflict'; end if;
      return jsonb_set(public.island_economy_reset_result(v_operation,false),
        '{currentEconomy}','null'::jsonb);
    exception when sqlstate 'PT516' then
      v_retries:=v_retries+1;
      if v_retries>=16 then raise exception 'lifecycle_busy'; end if;
    end;
  end loop;
exception when raise_exception then
  if sqlerrm=any(array['not_owner','wrong_code','actor_inactive','path_unavailable',
    'action_conflict','epoch_mismatch','wave_running','lifecycle_busy','invalid_change']) then
    return jsonb_build_object('status','refused','reason',sqlerrm); end if;
  raise;
end;
$$;
comment on function public.island_lifecycle_reset(uuid,uuid,uuid,text,text,numeric,text) is
  'Complete owner-confirmed original-epoch reset transaction. Common root precedes personal locks; actual canonical/arsenal hooks and assets commit with one provided treasury replacement. Exact retries retain old origin; public currentEconomy is always null.';

-- One composition also serves the old signature in strictly legacy-only mode.
create or replace function public.island_lifecycle_delete_transaction(
  p_actor_id uuid,p_confirm_owned_island boolean,p_legacy_only boolean
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_owners uuid[]; v_players uuid[]; v_retries integer:=0; v_related boolean;
  v_owned public.island_economy_state; v_account public.island_economy_accounts;
  v_attempt public.island_wave_accounting; v_copy public.arsenal_copies;
  v_disposition jsonb; v_result jsonb; v_now timestamptz; v_owner uuid;
begin
  if p_actor_id is null or p_confirm_owned_island is null or p_legacy_only is null then
    return jsonb_build_object('status','refused','reason','invalid_change'); end if;
  loop
    begin
      -- This entire block is a savepoint: retry releases every earlier guard/row.
      v_owners:=public.island_lifecycle_actor_owners(p_actor_id);
      v_players:=public.island_lifecycle_guard_actors(p_actor_id,v_owners);
      perform public.island_lifecycle_lock_guards(v_players);
      if v_owners is distinct from public.island_lifecycle_actor_owners(p_actor_id)
        or v_players is distinct from public.island_lifecycle_guard_actors(p_actor_id,v_owners) then
        raise exception using errcode='PT516',message='lifecycle_discovery_changed'; end if;
      perform 1 from public.island_economy_accounts where island_owner=any(v_owners)
        order by id for update;
      -- An accepted legacy wallet writer must finish before physical profile deletion.
      perform 1 from public.wallets where player_id=p_actor_id for update;
      -- Preserve the existing mystery-crew/Auth order before personal anchors.
      perform 1 from public.crews c where c.created_by=p_actor_id or exists(
        select 1 from public.crew_seats s where s.crew_id=c.id and s.player_id=p_actor_id)
        order by c.id for update;
      perform 1 from auth.users where id=p_actor_id for update;
      if not found then return jsonb_build_object('status','not_found'); end if;
      perform 1 from public.profiles where id=any(v_players) order by id for no key update;
      perform 1 from public.personal_captain_profiles where player_id=any(v_players)
        order by player_id for update;
      -- Freeze new FK references before the final inventory read. Unknown D-copy
      -- writers either committed before this fence (retry) or fail after deletion.
      perform 1 from public.profiles where id=p_actor_id for update;
      if v_owners is distinct from public.island_lifecycle_actor_owners(p_actor_id)
        or v_players is distinct from public.island_lifecycle_guard_actors(p_actor_id,v_owners) then
        raise exception using errcode='PT516',message='lifecycle_discovery_changed'; end if;
      v_related:=public.island_lifecycle_actor_related(p_actor_id);
      if p_legacy_only and v_related then
        return jsonb_build_object('status','refused','reason','economy_context_required'); end if;
      select * into v_owned from public.island_economy_state where island_owner=p_actor_id;
      if found and not p_confirm_owned_island then
        return jsonb_build_object('status','refused','reason','owned_island_confirmation_required'); end if;
      perform public.shared_session_lock_plan_rows(jsonb_build_object(
        'owners',to_jsonb(v_owners),'players',to_jsonb(v_players)));
      v_now:=clock_timestamp();
      if v_related then
        if not public.shared_session_actor_active(p_actor_id) then raise exception 'actor_inactive'; end if;
        -- Unconverted stock on an admitted island has no invented disposition.
        if exists(select 1 from public.arsenal_copies c join public.island_economy_state s
          on s.island_owner=c.island_owner where c.holder=p_actor_id
            and c.economy_account_id is null) then raise exception 'path_unavailable'; end if;
        if v_owned.island_owner is not null then
          perform public.island_lifecycle_close_owned_locked(p_actor_id,v_now);
        end if;
        -- A member withdraws only their exact slots; other live fighters continue.
        for v_attempt in select a.* from public.island_wave_accounting a
          where a.island_owner<>p_actor_id and not exists(
            select 1 from public.island_wave_closures c where c.wave_id=a.wave_id)
          and exists(select 1 from jsonb_array_elements(a.roster) r
            where r->>'playerId'=p_actor_id::text) order by a.island_owner,a.wave_id
        loop
          v_disposition:=public.shared_session_withdraw_locked(
            p_actor_id,v_attempt.wave_id,'account_deleted',v_now);
          if v_disposition->>'status' is distinct from 'done'
            or v_disposition->>'waveId' is distinct from v_attempt.wave_id::text
            or v_disposition->>'accountId' is distinct from v_attempt.account_id::text
            or v_disposition->>'runEpoch' is distinct from v_attempt.run_epoch::text then
            raise exception 'path_unavailable'; end if;
          if not exists(select 1 from public.shared_session_slots
            where wave_id=v_attempt.wave_id and status<>'withdrawn') then
            perform public.shared_session_close_locked(v_attempt.wave_id,'abandoned','[]'::jsonb,v_now);
          end if;
        end loop;
        -- Also revoke an idle/spectator controller; this invents no assignment.
        perform public.shared_session_withdraw_locked(p_actor_id,null,'account_deleted',v_now);
        for v_copy in select * from public.arsenal_copies
          where holder=p_actor_id and economy_account_id is not null order by id for update
        loop
          v_disposition:=public.island_shared_arsenal_prepare_holder_deletion_locked(
            v_copy.economy_account_id,v_copy.economy_run_epoch,p_actor_id,v_copy.id,
            v_copy.holder_generation,v_now,v_copy.pending_return_wave_id);
          if v_disposition->>'status' is distinct from 'done' then raise exception 'path_unavailable'; end if;
        end loop;
        perform public.shared_session_mark_actor_deleted_locked(p_actor_id,v_now);
        if v_owned.island_owner is not null then
          select * into strict v_account from public.island_economy_accounts
            where id=v_owned.current_account_id;
          perform public.island_shared_arsenal_reset_locked(
            v_account.id,v_account.run_epoch,p_actor_id,v_now);
          v_disposition:=public.shared_session_retire_island_locked(
            p_actor_id,v_account.id,v_account.run_epoch,v_now,true);
          if v_disposition->>'status' is distinct from 'done' then raise exception 'path_unavailable'; end if;
          -- Old principal/cash remain settleable in these exact retired accounts.
          update public.island_economy_accounts set state='retired',
            retired_at=coalesce(retired_at,v_now) where island_owner=p_actor_id and state='active';
          delete from public.island_economy_state where island_owner=p_actor_id;
        end if;
        -- Rotate only continuing admitted islands while their membership still exists.
        foreach v_owner in array v_owners loop
          if v_owner<>p_actor_id and exists(select 1 from public.island_economy_state
            where island_owner=v_owner) then
            perform public.shared_session_rotate_topic_locked(v_owner);
          end if;
        end loop;
        insert into public.island_deleted_player_dispositions(player_id,deleted_at)
          values(p_actor_id,v_now) on conflict(player_id) do nothing;
      end if;
      -- Former legacy cascades are explicit after their target guards are fixed.
      perform public.island_lifecycle_purge_legacy_history(p_actor_id);
      -- The established implementation performs crew handover and physical Auth
      -- deletion in this SAME transaction, after durable disposition is ready.
      v_result:=public.island_lifecycle_delete_legacy(p_actor_id);
      if v_result is distinct from jsonb_build_object('status','deleted') then
        raise exception 'lifecycle_delete_failed'; end if;
      return v_result;
    exception when sqlstate 'PT516' then
      v_retries:=v_retries+1;
      if v_retries>=16 then raise exception 'lifecycle_busy'; end if;
    end;
  end loop;
exception when raise_exception then
  if sqlerrm=any(array['actor_inactive','path_unavailable','wave_running','lifecycle_busy',
    'owned_island_confirmation_required','invalid_change']) then
    return jsonb_build_object('status','refused','reason',sqlerrm); end if;
  raise;
end;
$$;
comment on function public.island_lifecycle_delete_transaction(uuid,boolean,boolean) is
  'Private single-transaction deletion composition: fixed signed guards/accounts/wallet/crew/Auth/personal order, final actor FK fence and full retry on expanded inventory. Checked canonical/copy disposition and minimal shared tombstone precede original Auth deletion. Pure legacy mode retains its original purge without a new UUID marker.';

create or replace function public.island_lifecycle_delete_player(
  p_actor_id uuid,p_confirm_owned_island boolean
) returns jsonb language sql volatile security definer set search_path='' as $$
  select public.island_lifecycle_delete_transaction(p_actor_id,p_confirm_owned_island,false);
$$;
comment on function public.island_lifecycle_delete_player(uuid,boolean) is
  'Service-only verified-actor deletion; a separately confirmed owned admitted island is removed without succession or replacement funds. All disposition/Auth effects are atomic.';

-- Preserve the supplied accounting transaction; only the two personal-hook sites
-- gain the canonical exact deleted-slot predicate. Money/receipts remain atomic.
create or replace function public.island_wave_accounting_settle_locked(
  p_wave_id uuid,p_outcome text,p_earned_bonuses jsonb
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_attempt public.island_wave_accounting; v_close public.island_wave_closures;
  v_account public.island_economy_accounts; v_earned jsonb; v_name text; v_slot jsonb;
  v_run public.wave_runs;
  v_fingerprint jsonb; v_loot numeric := 0; v_bonus numeric := 0; v_money jsonb;
  v_receipt_id uuid; v_confirmed boolean; v_effect jsonb;
begin
  if p_outcome is null or p_outcome not in ('won','lost','abandoned','expired')
    or jsonb_typeof(p_earned_bonuses) is distinct from 'array' then
    raise exception 'invalid_wave_outcome'; end if;
  if exists(select 1 from jsonb_array_elements(p_earned_bonuses)
    where jsonb_typeof(value) is distinct from 'string') then raise exception 'invalid_wave_reward'; end if;
  select * into v_attempt from public.island_wave_accounting where wave_id=p_wave_id;
  if not found then raise exception 'wave_accounting_missing'; end if;
  select coalesce(jsonb_agg(value order by value),'[]'::jsonb) into v_earned
    from (select distinct value from jsonb_array_elements_text(p_earned_bonuses)) as names;
  if p_outcome <> 'won' and v_earned <> '[]'::jsonb then raise exception 'invalid_wave_reward'; end if;
  for v_name in select value from jsonb_array_elements_text(v_earned) loop
    if not (v_attempt.reward_basis->'bonuses' ? v_name) then raise exception 'invalid_wave_reward'; end if;
    v_bonus := v_bonus+(v_attempt.reward_basis#>>array['bonuses',v_name])::numeric;
  end loop;
  v_fingerprint := jsonb_build_object('mode',v_attempt.mode,'version',v_attempt.accounting_version,
    'waveId',p_wave_id,'accountId',v_attempt.account_id,'runEpoch',v_attempt.run_epoch,
    'playedWave',v_attempt.played_wave,'outcome',p_outcome,'earnedBonuses',v_earned);
  perform public.island_treasury_lock_scope(v_attempt.island_owner);
  select * into strict v_account from public.island_economy_accounts
    where id=v_attempt.account_id and run_epoch=v_attempt.run_epoch for update;
  select * into v_close from public.island_wave_closures where wave_id=p_wave_id;
  if found then
    if v_close.terminal_fingerprint <> v_fingerprint then raise exception 'wave_outcome_conflict'; end if;
    return public.island_wave_accounting_result(p_wave_id,true);
  end if;
  if p_outcome in ('won','lost') and clock_timestamp()<v_attempt.starts_at then
    raise exception 'wave_not_started'; end if;
  for v_slot in select value from jsonb_array_elements(v_attempt.roster) loop
    if not public.shared_session_personal_completion_omitted_locked(
      p_wave_id,(v_slot->>'playerId')::uuid) then
      perform public.personal_captain_lock_state_locked((v_slot->>'playerId')::uuid);
    end if;
  end loop;
  perform 1 from public.islands where player_id=v_attempt.island_owner for update;
  select * into v_run from public.wave_runs where id=p_wave_id for update;
  if not found then raise exception 'wave_accounting_missing'; end if;
  if v_run.finished_at is not null and
    ((p_outcome='won') is distinct from v_run.survived
      or (v_run.expired and p_outcome in ('won','lost'))) then
    raise exception 'wave_outcome_conflict'; end if;
  -- This helper does not choose/verify combat outcomes or close HP/session state.
  -- Its enclosing lifecycle transaction must establish that canonical authority.
  if p_outcome='won' then
    v_loot := ((v_attempt.reward_basis->>'baseCoins')::numeric
      +(v_attempt.reward_basis->>'perWaveCoins')::numeric*v_attempt.played_wave
      +(v_attempt.reward_basis->>'perHouseCoins')::numeric
        *(v_attempt.reward_basis->>'houseLevels')::numeric+v_bonus)
      *(v_attempt.reward_basis->>'bossMultiplier')::numeric;
  end if;
  if v_loot > 0 then
    v_money := public.island_treasury_credit(v_attempt.started_by,v_attempt.account_id,
      v_attempt.run_epoch,public.island_economy_system_uid(p_wave_id,'wave_loot'),
      'pirate_loot','wave:'||p_wave_id::text,v_loot);
    if v_money->>'status' is distinct from 'done' then raise exception 'wave_treasury_credit_failed'; end if;
    if v_money->'repeat' is distinct from 'false'::jsonb
      or jsonb_typeof(v_money#>'{receipt,id}') is distinct from 'string'
      or (v_money#>>'{receipt,id}') !~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'wave_treasury_credit_failed';
    end if;
    -- Close only against the exact persisted credit for this originating attempt.
    select id into v_receipt_id from public.island_treasury_transactions
      where id=(v_money#>>'{receipt,id}')::uuid and account_id=v_attempt.account_id
        and run_epoch=v_attempt.run_epoch and actor_id=v_attempt.started_by
        and action_uid=public.island_economy_system_uid(p_wave_id,'wave_loot')
        and kind='credit' and reason='pirate_loot' and reference='wave:'||p_wave_id::text
        and balance_delta=v_loot and committed_delta=0 and source_reservation_id is null;
    if not found or v_money->'receipt' is distinct from
      (public.island_treasury_result(v_receipt_id,false)->'receipt') then
      raise exception 'wave_treasury_credit_failed';
    end if;
  end if;
  insert into public.island_wave_closures(wave_id,outcome,earned_bonuses,loot_coins,
    treasury_receipt_id,terminal_fingerprint)
    values(p_wave_id,p_outcome,v_earned,v_loot,v_receipt_id,v_fingerprint);
  for v_slot in select value from jsonb_array_elements(v_attempt.roster) loop
    select exists(select 1 from public.island_wave_participation_receipts
      where wave_id=p_wave_id and player_id=(v_slot->>'playerId')::uuid) into v_confirmed;
    insert into public.island_wave_completion_receipts(player_id,wave_id,played_wave,outcome,
      confirmed_participation,engineer_commitment_id,account_id,run_epoch,terminal_fingerprint)
      values((v_slot->>'playerId')::uuid,p_wave_id,v_attempt.played_wave,p_outcome,v_confirmed,
        (v_slot->>'engineerCommitmentId')::uuid,v_attempt.account_id,v_attempt.run_epoch,v_fingerprint);
    if not public.shared_session_personal_completion_omitted_locked(
      p_wave_id,(v_slot->>'playerId')::uuid) then
      v_effect := public.personal_captain_complete_locked((v_slot->>'playerId')::uuid,
        p_wave_id,v_attempt.played_wave,p_outcome,v_confirmed,(v_slot->>'engineerCommitmentId')::uuid);
      if v_effect is null or v_effect->>'status'='refused' then
        raise exception 'wave_personal_completion_failed'; end if;
    end if;
  end loop;
  return public.island_wave_accounting_result(p_wave_id,false);
end;
$$;
comment on function public.island_wave_accounting_settle_locked(uuid,text,jsonb) is
  'Private canonical-close hook in the SAME lifecycle transaction as final outcome/HP/session closure. Locks origin account then personal states before island/wave; credits once and applies real personal generation-specific effects atomically. A missing personal profile is omitted only with the exact canonical deleted-slot proof; its durable completion receipt remains. Never call from participant acknowledgment.';

-- Only the three checked service entry points are executable directly.
do $$
declare v_function record;
begin
  for v_function in select p.oid::regprocedure as signature from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'island_lifecycle_%'
  loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',
      v_function.signature);
  end loop;
end;
$$;
grant execute on function public.island_lifecycle_actor_status(uuid) to service_role;
grant execute on function public.island_lifecycle_reset(uuid,uuid,uuid,text,text,numeric,text) to service_role;
grant execute on function public.island_lifecycle_delete_player(uuid,boolean) to service_role;
revoke all on function public.delete_player(uuid) from public,anon,authenticated,service_role;
grant execute on function public.delete_player(uuid) to service_role;
