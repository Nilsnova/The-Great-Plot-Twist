-- TEST ONLY: injected phase/leader/assignment for disposable PostgreSQL checks.
-- Never apply this file as a migration or install it on a configured database.

do $$
declare
  v_function regprocedure := to_regprocedure('public.island_economy_authority(uuid,uuid)');
begin
  if v_function is not null and coalesce(obj_description(v_function, 'pg_proc'), '') <>
     'TEST ONLY: injected economy authority; not a persistent session provider.' then
    raise exception 'test_economy_authority_cannot_replace_provider';
  end if;
end;
$$;

-- Test state is deliberately separate from production session/profile schemas.
create schema if not exists mp_eco_test;
create table if not exists mp_eco_test.authority (
  actor_id uuid not null,
  island_owner uuid not null,
  reservation_id uuid,
  session_leader_id uuid,
  actor_assignment_wave_id uuid,
  primary key (actor_id, island_owner)
);
comment on table mp_eco_test.authority is
  'TEST ONLY: explicit injected values; no Captain, journal, lease or session lifecycle implementation.';
revoke all on schema mp_eco_test from public, anon, authenticated, service_role;
revoke all on table mp_eco_test.authority from public, anon, authenticated, service_role;

-- Current membership is real; only unavailable session authority is injected.
create or replace function public.island_economy_authority(
  p_actor_id uuid, p_island_owner uuid
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_state mp_eco_test.authority;
  v_member boolean;
begin
  select * into v_state from mp_eco_test.authority
   where actor_id = p_actor_id and island_owner = p_island_owner;
  if not found then
    raise exception 'test_economy_authority_not_configured';
  end if;
  select exists (select 1 from public.islands i where i.player_id = p_island_owner
    and (p_actor_id = p_island_owner or exists (
      select 1 from public.island_members m where m.island_owner = p_island_owner
        and m.player_id = p_actor_id and m.left_at is null))) into v_member;
  return jsonb_build_object(
    'actor_id', p_actor_id, 'island_owner', p_island_owner, 'is_member', v_member,
    'reservation_id', v_state.reservation_id,
    'session_leader_id', v_state.session_leader_id,
    'actor_assignment_wave_id', v_state.actor_assignment_wave_id);
end;
$$;
comment on function public.island_economy_authority(uuid, uuid) is
  'TEST ONLY: injected economy authority; not a persistent session provider.';
revoke all on function public.island_economy_authority(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.island_economy_authority(uuid, uuid) to service_role;
