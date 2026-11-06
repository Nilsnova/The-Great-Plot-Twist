-- =============================================================================
-- 20261106170000_host_console.sql -- G14, the class host's console
--
-- WHAT IT DOES
--   Adds a private action log, a durable successful keep-alive stamp, aggregate
--   reads, and an atomic close of the caller's forming test crew. No case data.
-- WHO USES IT
--   HostDep-protected server routes only; the browser never calls these RPCs.
--   Apply after the foundation, market, accounts, entry and crew migrations.
-- RULES
--   Functions run as the invoker, with an empty search_path. Only service_role
--   has access. The server verifies HOST_PLAYER_IDS before passing p_host_id.
--   Closing retains seats/history, never changes money, and refuses a crew with
--   another human. The host confirms the crew is a test in the console.
-- SAFE TO RUN TWICE
--   Tables/indexes use if not exists, functions are replaced, grants repeat.
-- =============================================================================

create table if not exists public.host_console_actions (
  host_id uuid not null references public.profiles(id) on delete cascade,
  action_uid uuid not null,
  crew_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (host_id, action_uid),
  unique (crew_id)
);
comment on table public.host_console_actions is
  'Successful test-crew closes. Kept if the crew is deleted; removed when its host deletes their account. No names or tokens.';
comment on column public.host_console_actions.host_id is 'Verified host who requested the close.';
comment on column public.host_console_actions.action_uid is 'Retry identity scoped to this host.';
comment on column public.host_console_actions.crew_id is 'Crew closed once; no cascading deletion of audit.';
comment on column public.host_console_actions.created_at is 'Database time of the successful close.';

create table if not exists public.host_console_health (
  name text primary key check (name = 'keepalive'),
  succeeded_at timestamptz not null default now()
);
comment on table public.host_console_health is 'Last confirmed successful daily keep-alive, across server instances.';
comment on column public.host_console_health.name is 'Only the keepalive check is currently recorded.';
comment on column public.host_console_health.succeeded_at is 'Database time after all three keep-alive reads succeeded.';

alter table public.host_console_actions enable row level security;
alter table public.host_console_health enable row level security;
revoke all on table public.host_console_actions, public.host_console_health
  from public, anon, authenticated, service_role;
grant select, insert on table public.host_console_actions to service_role;
grant select, insert, update on table public.host_console_health to service_role;
-- No browser policies: even signed-in players have no access to these tables.

create or replace function public.host_record_keepalive()
returns void language sql security invoker set search_path = '' as $$
  insert into public.host_console_health (name, succeeded_at) values ('keepalive', now())
  on conflict (name) do update set succeeded_at =
    greatest(public.host_console_health.succeeded_at, excluded.succeeded_at);
$$;
revoke all on function public.host_record_keepalive() from public, anon, authenticated, service_role;
grant execute on function public.host_record_keepalive() to service_role;
comment on function public.host_record_keepalive() is 'Server records success only after every keep-alive read succeeded.';

create or replace function public.host_close_test_crew(
  p_host_id uuid, p_crew_id uuid, p_action_uid uuid
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_crew public.crews%rowtype;
  v_previous uuid;
begin
  if p_host_id is null or p_crew_id is null or p_action_uid is null then
    raise exception 'bad_action';
  end if;
  -- Serialize action reuse even when two different crews are targeted at once.
  perform pg_advisory_xact_lock(hashtextextended(p_host_id::text || p_action_uid::text, 0));
  select crew_id into v_previous from public.host_console_actions
    where host_id = p_host_id and action_uid = p_action_uid;
  if found then
    if v_previous = p_crew_id then
      return jsonb_build_object('status', 'closed', 'crewId', p_crew_id);
    end if;
    return jsonb_build_object('status', 'refused', 'reason', 'action_conflict');
  end if;
  -- Existing join and muster functions also lock this row before changing seats.
  select * into v_crew from public.crews where id = p_crew_id for update;
  if not found or v_crew.created_by <> p_host_id then
    return jsonb_build_object('status', 'refused', 'reason', 'not_test_crew');
  end if;
  if v_crew.status <> 'forming' then
    return jsonb_build_object('status', 'refused', 'reason', 'not_forming');
  end if;
  if exists (select 1 from public.crew_seats
             where crew_id = p_crew_id and player_id <> p_host_id) then
    return jsonb_build_object('status', 'refused', 'reason', 'not_test_crew');
  end if;
  -- A normal join locks this profile before its draft crew. Do not wait here
  -- with the crew locked: the audit foreign key would otherwise reverse that order.
  -- The account-deletion function keeps its existing crew-before-profile order.
  begin
    perform 1 from public.profiles where id = p_host_id for key share nowait;
  exception when lock_not_available then
    return jsonb_build_object('status', 'refused', 'reason', 'crew_busy');
  end;
  update public.crews set status = 'finished', version = version + 1 where id = p_crew_id;
  insert into public.host_console_actions (host_id, action_uid, crew_id)
    values (p_host_id, p_action_uid, p_crew_id);
  return jsonb_build_object('status', 'closed', 'crewId', p_crew_id);
end;
$$;
revoke all on function public.host_close_test_crew(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.host_close_test_crew(uuid, uuid, uuid) to service_role;
comment on function public.host_close_test_crew(uuid, uuid, uuid) is
  'Host-only server cleanup: own forming crew, no other human seats. Atomic, logged, retry-safe; never deletes seats or moves coins.';

create or replace function public.host_console_overview()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_positions bigint := null;
  v_objects jsonb;
begin
  if to_regclass('public.exchange_positions') is not null then
    select count(*) into v_positions from public.exchange_positions where status = 'open';
  end if;
  select jsonb_object_agg(name, to_regclass('public.' || name) is not null)
    into v_objects from unnest(array['profiles', 'saves', 'wallet_transactions', 'crews',
      'exchange_positions', 'captain_name_rerolls', 'entry_profiles', 'crew_join_failures',
      'case_state', 'islets', 'board_pins', 'prediction_pools', 'duels', 'world_state', 'npc_orders',
      'festival_actions',
      'host_console_actions', 'host_console_health']) as names(name);
  v_objects := v_objects || jsonb_build_object(
    'live_crew_id', to_regprocedure('public.live_crew_id(text)') is not null,
    'delete_player', to_regprocedure('public.delete_player(uuid)') is not null
  );
  return jsonb_build_object(
    'players', (select count(*) from public.profiles),
    'crews', (select jsonb_object_agg(status, n) from
      (select status, count(*) as n from public.crews group by status) as counts),
    'openPositions', v_positions,
    'day', (now() at time zone 'UTC')::date,
    'walletToday', (select coalesce(jsonb_agg(to_jsonb(m) order by reason), '[]'::jsonb) from
      (select reason, count(*) as count,
        coalesce(sum(delta) filter (where delta > 0), 0) as earned,
        -coalesce(sum(delta) filter (where delta < 0), 0) as spent, sum(delta) as net
       from public.wallet_transactions
       where created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
         and created_at < (date_trunc('day', now() at time zone 'UTC') + interval '1 day') at time zone 'UTC'
       group by reason) as m),
    'schemaObjects', v_objects,
    'lastKeepaliveAt', (select succeeded_at from public.host_console_health where name = 'keepalive')
  );
end;
$$;
revoke all on function public.host_console_overview() from public, anon, authenticated, service_role;
grant execute on function public.host_console_overview() to service_role;
comment on function public.host_console_overview() is
  'Whole-database aggregates without row-limit truncation or join multiplication. UTC day; schema probes are not an applied migration history.';

create or replace function public.host_console_crews(p_host_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('total', (select count(*) from public.crews), 'limit', 50,
    'crews', coalesce((select jsonb_agg(to_jsonb(recent) order by recent.created_at desc, recent.id)
      from (
        select c.id, c.code, c.status, c.started_at as "startedAt", c.created_at,
          c.status = 'forming' and c.created_by = p_host_id and not exists (
            select 1 from public.crew_seats s where s.crew_id = c.id and s.player_id <> p_host_id
          ) as "canClose",
          coalesce((select jsonb_agg(jsonb_build_object(
            'seatNo', s.seat_no, 'kind', case when s.player_id is null then 'npc' else 'player' end,
            'captainName', p.display_name) order by s.seat_no)
            from public.crew_seats s left join public.profiles p on p.id = s.player_id
            where s.crew_id = c.id), '[]'::jsonb) as seats
        from public.crews c order by c.created_at desc, c.id limit 50
      ) as recent), '[]'::jsonb));
$$;
revoke all on function public.host_console_crews(uuid) from public, anon, authenticated, service_role;
grant execute on function public.host_console_crews(uuid) to service_role;
comment on function public.host_console_crews(uuid) is
  'Newest 50 crews, total count and captain names only. No user ids, login details, kits or solution data.';
