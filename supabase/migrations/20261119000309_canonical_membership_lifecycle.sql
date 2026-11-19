-- Compatibility for existing game membership calls. Canonical leases, frozen
-- slots, copy tenure and channel generation remain owned by their provided hooks.
-- No new membership, authority, assignment or receipt API is introduced.

do $$
begin
  if to_regprocedure('public.island_lifecycle_legacy_game_join(uuid,uuid,integer)') is null then
    alter function public.game_join(uuid,uuid,integer) rename to island_lifecycle_legacy_game_join;
  end if;
  if to_regprocedure('public.island_lifecycle_legacy_game_leave(uuid,uuid)') is null then
    alter function public.game_leave(uuid,uuid) rename to island_lifecycle_legacy_game_leave;
  end if;
end;
$$;

create or replace function public.island_lifecycle_membership_change(
  p_actor_id uuid,p_owner uuid,p_join boolean,p_max_members integer
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_plan jsonb; v_state public.island_economy_state; v_account public.island_economy_accounts;
  v_result jsonb; v_authority jsonb; v_wave uuid; v_reservation uuid;
  v_copy public.arsenal_copies; v_effect jsonb; v_assignment uuid;
  v_was_active boolean; v_now timestamptz; v_retries integer:=0;
begin
  if p_actor_id is null or p_owner is null or p_join is null then
    if p_join then raise exception 'bad_game_join'; else raise exception 'bad_game_leave'; end if;
  end if;
  if p_join and (p_max_members is null or p_max_members not between 2 and 50) then
    raise exception 'bad_game_join'; end if;
  loop
    begin
      -- Capture every target/current-control/original-wave scope before personal
      -- or island rows. A changed inventory retries the complete guarded block.
      v_plan:=public.shared_session_lock_plan(array[p_owner],p_actor_id);
      perform public.shared_session_lock_plan_rows(v_plan);
      if not public.shared_session_actor_active(p_actor_id) then
        return jsonb_build_object('status','refused','reason','actor_inactive'); end if;
      select * into v_state from public.island_economy_state where island_owner=p_owner;
      v_was_active:=exists(select 1 from public.island_members
        where island_owner=p_owner and player_id=p_actor_id and left_at is null);
      if p_join then
        v_result:=public.island_lifecycle_legacy_game_join(p_actor_id,p_owner,p_max_members);
        if v_result->>'status'='joined' and v_state.island_owner is not null and not v_was_active then
          perform public.shared_session_rotate_topic_locked(p_owner);
        end if;
        return v_result;
      end if;
      -- Host refusal, absent membership and known legacy behavior are resolved
      -- by the original writer before any withdrawal, normalization or rotation.
      v_result:=public.island_lifecycle_legacy_game_leave(p_actor_id,p_owner);
      if v_result->>'status'<>'left' or (v_result->>'repeat')::boolean
        or v_state.island_owner is null then return v_result; end if;
      select * into strict v_account from public.island_economy_accounts
        where id=v_state.current_account_id and run_epoch=v_state.run_epoch;
      v_authority:=public.island_economy_authority(p_actor_id,p_owner);
      v_reservation:=(v_authority->>'reservation_id')::uuid;
      v_now:=clock_timestamp();
      for v_wave in select a.wave_id from public.island_wave_accounting a
        join public.shared_session_slots s on s.wave_id=a.wave_id and s.player_id=p_actor_id
        where a.island_owner=p_owner and not exists(
          select 1 from public.island_wave_closures c where c.wave_id=a.wave_id)
        order by a.wave_id
      loop
        v_effect:=public.shared_session_withdraw_locked(p_actor_id,v_wave,'leave',v_now);
        if v_effect->>'status' is distinct from 'done'
          or v_effect->>'islandOwner' is distinct from p_owner::text
          or v_effect->>'waveId' is distinct from v_wave::text then
          raise exception 'path_unavailable'; end if;
      end loop;
      -- NULL withdrawal resolves an assignment internally, so use it only for
      -- this target's idle controller after all matching slots were withdrawn.
      -- A controller/assignment on another island remains untouched.
      if exists(select 1 from public.shared_session_controls
        where player_id=p_actor_id and island_owner=p_owner) then
        select assignment_wave_id into v_assignment from public.personal_captain_profiles
          where player_id=p_actor_id;
        if v_assignment is not null then raise exception 'path_unavailable'; end if;
        perform public.shared_session_withdraw_locked(p_actor_id,null,'leave',v_now);
      end if;
      -- Held stock can exist without a lease/frozen slot. The actual accepted
      -- target reservation determines pending return; no browser wave ID is used.
      for v_copy in select * from public.arsenal_copies where island_owner=p_owner
        and holder=p_actor_id and pending_return_wave_id is null order by id for update
      loop
        if v_copy.economy_account_id is distinct from v_account.id
          or v_copy.economy_run_epoch is distinct from v_account.run_epoch then
          raise exception 'path_unavailable'; end if;
        v_effect:=public.island_shared_arsenal_holder_locked(v_account.id,v_account.run_epoch,
          p_actor_id,v_copy.id,v_copy.holder_generation,'withdraw',v_now,v_reservation,null);
        if v_effect->>'status' is distinct from 'done' then raise exception 'path_unavailable'; end if;
      end loop;
      perform public.shared_session_rotate_topic_locked(p_owner);
      perform public.shared_session_normalize_locked(p_owner,v_now);
      return v_result;
    exception when serialization_failure then
      v_retries:=v_retries+1;
      if v_retries>=16 then raise exception 'lifecycle_busy'; end if;
    end;
  end loop;
exception when raise_exception then
  if sqlerrm=any(array['actor_inactive','path_unavailable','lifecycle_busy']) then
    return jsonb_build_object('status','refused','reason',sqlerrm); end if;
  raise;
end;
$$;
comment on function public.island_lifecycle_membership_change(uuid,uuid,boolean,integer) is
  'Private existing join/leave composition. Captured canonical guards/accounts/personal rows precede original membership writer; real departure withdraws only target slots/stock, rotates topic and normalizes atomically. Host/refused/redundant calls change no lifecycle facts.';

create or replace function public.game_join(p_player_id uuid,p_island_owner uuid,p_max_members integer)
returns jsonb language sql volatile security definer set search_path='' as $$
  select public.island_lifecycle_membership_change(p_player_id,p_island_owner,true,p_max_members);
$$;
comment on function public.game_join(uuid,uuid,integer) is
  'Existing verified-player join signature and member-cap behavior. Real new/rejoined shared membership rotates its private topic; redundant active joins only refresh opened_at. Inactive actors cannot use legacy entry points.';

create or replace function public.game_leave(p_player_id uuid,p_island_owner uuid)
returns jsonb language sql volatile security definer set search_path='' as $$
  select public.island_lifecycle_membership_change(p_player_id,p_island_owner,false,null);
$$;
comment on function public.game_leave(uuid,uuid) is
  'Existing verified-player leave signature. A real shared departure revokes only that target controller/slots, returns idle stock or marks accepted-wave pending return, rotates topic and normalizes in the same transaction. Host refusal has no lifecycle effects.';

revoke all on function public.island_lifecycle_legacy_game_join(uuid,uuid,integer)
  from public,anon,authenticated,service_role;
revoke all on function public.island_lifecycle_legacy_game_leave(uuid,uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.island_lifecycle_membership_change(uuid,uuid,boolean,integer)
  from public,anon,authenticated,service_role;
revoke all on function public.game_join(uuid,uuid,integer) from public,anon,authenticated,service_role;
revoke all on function public.game_leave(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.game_join(uuid,uuid,integer) to service_role;
grant execute on function public.game_leave(uuid,uuid) to service_role;
