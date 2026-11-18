-- Private arsenal composition for canonical session and physical-deletion callers.
-- No session/assignment provider or account-deletion executor is introduced here.

-- Shared pending copies retain their historical holder UUID after the live profile
-- disappears. The profile trigger below preserves the old legacy deletion rule.
alter table public.arsenal_copies drop constraint if exists arsenal_copies_holder_fkey;
comment on column public.arsenal_copies.holder is
  'Null when stored; otherwise the current or pending historical holder UUID. Shared profile deletion requires a prepared return; it never cascades a communal copy.';

create or replace function public.island_shared_arsenal_holder_profile_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.holder is null then return new; end if;
  if tg_op='UPDATE' then
    if old.economy_account_id is not null and old.pending_return_wave_id is not null
      and new.id=old.id and new.island_owner=old.island_owner and new.holder=old.holder
      and new.economy_account_id=old.economy_account_id and new.economy_run_epoch=old.economy_run_epoch
      and new.holder_generation=old.holder_generation
      and new.pending_return_wave_id=old.pending_return_wave_id then return new; end if;
  end if;
  -- Same existence/key protection as the former FK for every new active tenure.
  -- Canonical writers already hold the ordered profile anchor before copy locks.
  perform 1 from public.profiles where id=new.holder for key share;
  if not found then raise exception using errcode='23503',message='arsenal_holder_profile_missing'; end if;
  return new;
end;
$$;
comment on function public.island_shared_arsenal_holder_profile_guard() is
  'Retain original live-profile integrity for new holders; only an unchanged bound pending tenure may retain its historical UUID after physical profile deletion.';
revoke all on function public.island_shared_arsenal_holder_profile_guard()
  from public,anon,authenticated,service_role;
create or replace trigger arsenal_shared_holder_profile_check before insert or update
  of holder,pending_return_wave_id,holder_generation,economy_account_id,economy_run_epoch,island_owner
  on public.arsenal_copies for each row execute function public.island_shared_arsenal_holder_profile_guard();

create or replace function public.island_shared_arsenal_profile_delete_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.arsenal_copies where holder=old.id
    and economy_account_id is not null and pending_return_wave_id is null) then
    raise exception using errcode='23514',message='arsenal_holder_not_prepared';
  end if;
  -- Preserve legacy CASCADE semantics without removing a bound communal copy.
  delete from public.arsenal_copies where holder=old.id and economy_account_id is null;
  return old;
end;
$$;
comment on function public.island_shared_arsenal_profile_delete_guard() is
  'Asset guard only: prepared pending shared copies survive profile deletion; unprepared holders refuse; legacy held copies retain their original deletion behavior. Canonical deletion authority remains mandatory.';
revoke all on function public.island_shared_arsenal_profile_delete_guard()
  from public,anon,authenticated,service_role;
create or replace trigger arsenal_shared_holder_profile_delete before delete
  on public.profiles for each row execute function public.island_shared_arsenal_profile_delete_guard();

create or replace function public.island_shared_arsenal_holder_owners(p_actor_id uuid)
returns uuid[] language sql stable security definer set search_path='' as $$
  select coalesce(array_agg(distinct island_owner order by island_owner),'{}'::uuid[])
    from public.arsenal_copies where holder=p_actor_id and economy_account_id is not null;
$$;
comment on function public.island_shared_arsenal_holder_owners(uuid) is
  'Private read-only scope discovery before personal locks. The deletion caller must acquire sorted scopes/accounts and revalidate its complete discovery before changing state.';
revoke all on function public.island_shared_arsenal_holder_owners(uuid)
  from public,anon,authenticated,service_role;

-- Preserve the existing shape. The canonical caller persists these checked rows
-- once with its accepted roster; this function alone is not an immutable snapshot.
create or replace function public.island_shared_arsenal_loadouts_locked(
  p_account_id uuid,p_run_epoch uuid,p_players uuid[]
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_owner uuid; v_result jsonb;
begin
  if p_players is null or cardinality(p_players) not between 1 and 10
    or array_position(p_players,null) is not null
    or (select count(distinct player) from unnest(p_players) player)<>cardinality(p_players) then
    raise exception using errcode='23514',message='arsenal_loadout_players_invalid';
  end if;
  select a.island_owner into v_owner from public.island_economy_accounts a
    join public.island_economy_state s on s.current_account_id=a.id
      and s.island_owner=a.island_owner and s.run_epoch=a.run_epoch
    where a.id=p_account_id and a.run_epoch=p_run_epoch and a.state='active'
      and s.admission_state='active';
  if not found then raise exception using errcode='23514',message='arsenal_loadout_origin_changed'; end if;
  perform 1 from public.arsenal_copies where island_owner=v_owner order by id for update;
  if exists(select 1 from public.arsenal_copies where island_owner=v_owner
    and (economy_account_id is distinct from p_account_id or economy_run_epoch is distinct from p_run_epoch)) then
    raise exception using errcode='23514',message='arsenal_inventory_unbound';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('playerId',p.player_id,
    'weapon',coalesce(c.weapon,'musket'),'copyId',c.id,
    'generation',trunc(c.holder_generation)::text) order by p.ordinality),'[]'::jsonb)
    into v_result from unnest(p_players) with ordinality p(player_id,ordinality)
    left join public.arsenal_copies c on c.economy_account_id=p_account_id
      and c.economy_run_epoch=p_run_epoch and c.holder=p.player_id and c.pending_return_wave_id is null;
  return v_result;
end;
$$;
comment on function public.island_shared_arsenal_loadouts_locked(uuid,uuid,uuid[]) is
  'Private accepted-bell loadout capture after common scope/account/personal/island locks. Locks and validates all target copies, retaining exact copy tenure; canonical session caller must persist the immutable snapshot.';
revoke all on function public.island_shared_arsenal_loadouts_locked(uuid,uuid,uuid[])
  from public,anon,authenticated,service_role;

create or replace function public.island_shared_arsenal_prepare_holder_deletion_locked(
  p_account_id uuid,p_run_epoch uuid,p_actor_id uuid,p_copy_id uuid,p_generation numeric,
  p_now timestamptz,p_wave_id uuid
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_copy public.arsenal_copies; v_result jsonb;
begin
  if p_account_id is null or p_run_epoch is null or p_actor_id is null or p_copy_id is null
    or p_now is null or p_generation is null or not public.island_treasury_whole(p_generation,true) then
    raise exception using errcode='23514',message='arsenal_deletion_invalid_change';
  end if;
  select * into v_copy from public.arsenal_copies where id=p_copy_id
    and economy_account_id=p_account_id and economy_run_epoch=p_run_epoch for update;
  if not found then raise exception using errcode='23514',message='arsenal_deletion_origin_changed'; end if;
  -- Canonical withdrawal may already have completed this exact outside-wave release.
  if v_copy.holder is null and v_copy.holder_generation=p_generation+1
    and v_copy.pending_return_wave_id is null then
    return jsonb_build_object('status','done','changed',false);
  end if;
  if v_copy.holder is distinct from p_actor_id or v_copy.holder_generation<>p_generation then
    raise exception using errcode='23514',message='arsenal_deletion_stale_holder';
  end if;
  if v_copy.pending_return_wave_id is not null then
    if v_copy.pending_return_wave_id is distinct from p_wave_id then
      raise exception using errcode='23514',message='arsenal_deletion_wave_changed'; end if;
    return jsonb_build_object('status','done','changed',false);
  end if;
  v_result:=public.island_shared_arsenal_holder_locked(p_account_id,p_run_epoch,p_actor_id,
    p_copy_id,p_generation,'withdraw',p_now,p_wave_id,null);
  if v_result->>'status' is distinct from 'done' then
    raise exception using errcode='23514',message='arsenal_holder_preparation_failed'; end if;
  return v_result;
end;
$$;
comment on function public.island_shared_arsenal_prepare_holder_deletion_locked(uuid,uuid,uuid,uuid,numeric,timestamptz,uuid) is
  'Private exact-tenure deletion preparation after canonical controller/assignment revocation under all common locks. The caller supplies verified original reservation and deleted-participant disposition; no deletion authority or receipt is created.';
revoke all on function public.island_shared_arsenal_prepare_holder_deletion_locked(uuid,uuid,uuid,uuid,numeric,timestamptz,uuid)
  from public,anon,authenticated,service_role;

create or replace function public.island_shared_arsenal_reset_locked(
  p_account_id uuid,p_run_epoch uuid,p_actor_id uuid,p_now timestamptz
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_owner uuid; v_authority jsonb; v_copies integer; v_moves integer;
begin
  if p_now is null or p_actor_id is null then
    raise exception using errcode='23514',message='arsenal_reset_invalid_change'; end if;
  select a.island_owner into v_owner from public.island_economy_accounts a
    join public.island_economy_state s on s.current_account_id=a.id
      and s.island_owner=a.island_owner and s.run_epoch=a.run_epoch
    where a.id=p_account_id and a.run_epoch=p_run_epoch and a.state='active'
      and s.admission_state in ('active','paused');
  if not found then raise exception using errcode='23514',message='arsenal_reset_origin_changed'; end if;
  if v_owner<>p_actor_id then raise exception using errcode='23514',message='arsenal_reset_not_owner'; end if;
  v_authority:=public.island_shared_arsenal_authority(p_actor_id,v_owner);
  if v_authority is null then raise exception using errcode='23514',message='arsenal_reset_authority_missing'; end if;
  if v_authority->>'reservation_id' is not null then
    raise exception using errcode='23514',message='arsenal_reset_wave_running'; end if;
  perform public.island_economy_require_idle_locked(v_owner);
  if exists(select 1 from public.island_wave_accounting a
    left join public.island_wave_closures c on c.wave_id=a.wave_id
    where a.account_id=p_account_id and c.wave_id is null) then
    raise exception using errcode='23514',message='arsenal_reset_wave_unclosed'; end if;
  perform 1 from public.arsenal_copies where island_owner=v_owner order by id for update;
  if exists(select 1 from public.arsenal_copies where island_owner=v_owner
    and (economy_account_id is distinct from p_account_id or economy_run_epoch is distinct from p_run_epoch)) then
    raise exception using errcode='23514',message='arsenal_inventory_unbound'; end if;
  if exists(select 1 from public.arsenal_copies where economy_account_id=p_account_id
    and economy_run_epoch=p_run_epoch and pending_return_wave_id is not null) then
    raise exception using errcode='23514',message='arsenal_reset_pending_return'; end if;
  select count(*) into v_moves from public.arsenal_moves where island_owner=v_owner;
  delete from public.arsenal_copies where economy_account_id=p_account_id and economy_run_epoch=p_run_epoch;
  get diagnostics v_copies=row_count;
  return jsonb_build_object('copiesCleared',v_copies,'historicalMovesRetained',v_moves);
end;
$$;
comment on function public.island_shared_arsenal_reset_locked(uuid,uuid,uuid,timestamptz) is
  'Private current-owner asset disposition for reset or confirmed owner deletion, including paused admission. Requires real idle authority and no pending/unclosed attempt; public reset retains its own active-admission guard. Preserves immutable history, money and legacy moves.';
revoke all on function public.island_shared_arsenal_reset_locked(uuid,uuid,uuid,timestamptz)
  from public,anon,authenticated,service_role;
