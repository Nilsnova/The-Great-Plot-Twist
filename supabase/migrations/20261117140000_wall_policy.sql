-- Trusted perimeter policy and layout CAS. Apply before dependent API deployment; never downgrade owned pieces.
create table if not exists public.island_wall_policy (
  island_owner uuid primary key references public.islands(player_id) on delete cascade,
  rule_version smallint not null,
  capacity smallint not null,
  constraint island_wall_policy_supported check (rule_version = 1 and capacity = 128)
);
comment on table public.island_wall_policy is
  'Monotonic owner wall policy. No row means legacy lanes and twelve pieces; version 1 allows 128.';
alter table public.island_wall_policy enable row level security;
revoke all on public.island_wall_policy from public, anon, authenticated;
revoke update, delete on public.island_wall_policy from service_role;
grant select, insert on public.island_wall_policy to service_role;

-- One SQL statement reads the carrier and complete ordered layout from the same MVCC snapshot.
create or replace function public.island_wall_layout_read(p_island_owner uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_result jsonb;
begin
  if p_island_owner is null then raise exception 'bad_wall_layout_read'; end if;
  select jsonb_build_object(
    'ruleVersion', coalesce(p.rule_version, 0), 'capacity', coalesce(p.capacity, 12),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
      'plot', l.plot, 'x_half', l.x_half, 'z_half', l.z_half) order by l.plot collate "C")
      from public.island_layout l where l.island_owner = p_island_owner), '[]'::jsonb))
    into v_result
    from (select 1) seed left join public.island_wall_policy p on p.island_owner = p_island_owner;
  if jsonb_array_length(v_result -> 'rows') > 142 then raise exception 'wall_layout_overflow'; end if;
  return v_result;
end;
$$;
revoke all on function public.island_wall_layout_read(uuid) from public, anon, authenticated, service_role;
grant execute on function public.island_wall_layout_read(uuid) to service_role;
comment on function public.island_wall_layout_read(uuid) is
  'Service-only atomic wall policy and complete layout; malformed/overflow state is never truncated.';

-- Admission receives only server-computed effective legacy cells, fenced against the raw rows checked.
create or replace function public.island_wall_policy_admit(
  p_player_id uuid, p_island_owner uuid, p_seen jsonb, p_effective jsonb
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_now jsonb; v_context jsonb;
begin
  if p_player_id is null or p_island_owner is null
     or jsonb_typeof(p_seen) is distinct from 'array'
     or jsonb_typeof(p_effective) is distinct from 'array'
     or jsonb_array_length(p_effective) not between 22 and 26 then
    raise exception 'bad_wall_policy_admit';
  end if;
  if p_player_id <> p_island_owner then
    return jsonb_build_object('status', 'refused', 'reason', 'owner_only');
  end if;
  perform 1 from public.islands where player_id = p_island_owner for update;
  if not found then return jsonb_build_object('status', 'refused', 'reason', 'no_island'); end if;
  if exists (select 1 from public.island_wall_policy where island_owner = p_island_owner) then
    return jsonb_build_object('status', 'done', 'repeat', true);
  end if;
  v_now := public.island_wall_layout_read(p_island_owner);
  if v_now -> 'rows' is distinct from p_seen then
    return jsonb_build_object('status', 'refused', 'reason', 'busy');
  end if;
  if exists (select 1 from public.wave_runs where island_owner = p_island_owner
    and finished_at is null and starts_at + make_interval(secs => maximum_seconds) >= clock_timestamp()) then
    return jsonb_build_object('status', 'refused', 'reason', 'wave_running');
  end if;
  -- Bound every row, reject duplicates, and require all twelve original wall identities.
  if exists (select 1 from jsonb_array_elements(p_effective) e where
    jsonb_typeof(e) is distinct from 'object'
    or (e ->> 'plot') !~ '^(wall_([1-9]|1[0-2])|cannon_([1-9]|1[01])|tower_1|house_[12])$'
    or jsonb_typeof(e -> 'x_half') is distinct from 'number'
    or jsonb_typeof(e -> 'z_half') is distinct from 'number'
    or (e ->> 'x_half')::numeric <> trunc((e ->> 'x_half')::numeric)
    or (e ->> 'z_half')::numeric <> trunc((e ->> 'z_half')::numeric)
    or abs((e ->> 'x_half')::numeric) > 60 or abs((e ->> 'z_half')::numeric) > 60)
    or (select count(distinct e ->> 'plot') from jsonb_array_elements(p_effective) e)
       <> jsonb_array_length(p_effective)
    or exists (select 1 from generate_series(1, 12) n where not exists (
      select 1 from jsonb_array_elements(p_effective) e where e ->> 'plot' = 'wall_' || n)) then
    raise exception 'bad_wall_policy_admit';
  end if;
  v_context := public.structure_recovery_mutation_begin(p_island_owner);
  if v_context #>> '{settlement,status}' = 'reserved' then
    return jsonb_build_object('status', 'refused', 'reason', 'wave_running');
  end if;
  insert into public.island_layout (island_owner, plot, x_half, z_half, moved_by)
    select p_island_owner, e ->> 'plot', (e ->> 'x_half')::integer,
      (e ->> 'z_half')::integer, p_player_id from jsonb_array_elements(p_effective) e
    on conflict (island_owner, plot) do update set
      x_half = excluded.x_half, z_half = excluded.z_half, moved_by = excluded.moved_by, moved_at = now();
  insert into public.island_wall_policy (island_owner, rule_version, capacity)
    values (p_island_owner, 1, 128);
  perform public.structure_recovery_mutation_finish(p_island_owner, v_context);
  return jsonb_build_object('status', 'done', 'repeat', false);
end;
$$;
revoke all on function public.island_wall_policy_admit(uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.island_wall_policy_admit(uuid, uuid, jsonb, jsonb) to service_role;
comment on function public.island_wall_policy_admit(uuid, uuid, jsonb, jsonb) is
  'Owner-only between-wave monotonic admission; materializes effective old cells after settling old recovery.';

-- Both old and new policy moves use this fence; an old validation cannot race admission.
create or replace function public.island_wall_move(
  p_island_owner uuid, p_mover uuid, p_plot text, p_x_half integer, p_z_half integer,
  p_seen jsonb, p_expected_rule_version integer, p_expected_capacity integer
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_now jsonb; v_context jsonb;
begin
  if p_island_owner is null or p_mover is null or p_plot is null
    or p_x_half is null or p_z_half is null or abs(p_x_half::bigint) > 60 or abs(p_z_half::bigint) > 60
    or jsonb_typeof(p_seen) is distinct from 'array'
    or p_expected_rule_version is null or p_expected_capacity is null then raise exception 'bad_wall_move'; end if;
  perform 1 from public.islands where player_id = p_island_owner for update;
  if not found then return jsonb_build_object('status', 'refused', 'reason', 'no_island'); end if;
  if p_mover <> p_island_owner and not exists (select 1 from public.island_members
    where island_owner = p_island_owner and player_id = p_mover and left_at is null) then
    return jsonb_build_object('status', 'refused', 'reason', 'not_member');
  end if;
  v_now := public.island_wall_layout_read(p_island_owner);
  if (v_now ->> 'ruleVersion')::integer <> p_expected_rule_version
     or (v_now ->> 'capacity')::integer <> p_expected_capacity
     or v_now -> 'rows' is distinct from p_seen then
    return jsonb_build_object('status', 'refused', 'reason', 'busy');
  end if;
  if p_plot !~ '^(wall_([1-9]|[1-9][0-9]|1[01][0-9]|12[0-8])|cannon_([1-9]|1[01])|tower_1|house_[12])$'
     or (p_expected_rule_version = 0 and p_plot ~ '^wall_' and substring(p_plot from 6)::integer > 12) then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_spot');
  end if;
  if p_plot ~ '^wall_' and substring(p_plot from 6)::integer > 12
    and not exists (select 1 from public.islet_buildings where player_id = p_island_owner and plot = p_plot) then
    return jsonb_build_object('status', 'refused', 'reason', 'not_built');
  end if;
  v_context := public.structure_recovery_mutation_begin(p_island_owner);
  if v_context #>> '{settlement,status}' = 'reserved' or exists (
    select 1 from public.wave_runs where island_owner = p_island_owner and finished_at is null
      and starts_at + make_interval(secs => maximum_seconds) >= clock_timestamp()) then
    return jsonb_build_object('status', 'refused', 'reason', 'wave_running');
  end if;
  insert into public.island_layout (island_owner, plot, x_half, z_half, moved_by)
    values (p_island_owner, p_plot, p_x_half, p_z_half, p_mover)
    on conflict (island_owner, plot) do update set x_half = excluded.x_half,
      z_half = excluded.z_half, moved_by = excluded.moved_by, moved_at = now();
  perform public.structure_recovery_mutation_finish(p_island_owner, v_context);
  return jsonb_build_object('status', 'done');
end;
$$;
revoke all on function public.island_wall_move(uuid, uuid, text, integer, integer, jsonb, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.island_wall_move(uuid, uuid, text, integer, integer, jsonb, integer, integer)
  to service_role;
comment on function public.island_wall_move(uuid, uuid, text, integer, integer, jsonb, integer, integer) is
  'Service-validated move with owner/member, wave, policy and complete layout fences under the island lock.';
