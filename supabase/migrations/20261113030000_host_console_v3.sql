-- =============================================================================
-- 20261113030000_host_console_v3.sql -- host console probes for the game tables
--
-- WHAT IT DOES
--   Recreates host_console_overview() with ONE new key, "game": counts for the
--   v3 tables islands, island_members, wave_runs, demo_class_code and
--   demo_guests. Every key the function had before is unchanged.
-- WHO USES IT
--   GET /api/host/overview (HostDep-protected); the browser never calls it.
--   Apply after 20261106170000_host_console.sql and every game migration.
-- RULES
--   Counts only: no names, emails, ids or codes. Same as before: security
--   invoker, empty search_path, only service_role may run it. UTC day, like
--   walletToday.
-- SAFE TO RUN TWICE
--   The function is replaced and the grants repeat.
-- =============================================================================

create or replace function public.host_console_overview()
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_positions bigint := null;
  v_objects jsonb;
  v_day_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
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
    'lastKeepaliveAt', (select succeeded_at from public.host_console_health where name = 'keepalive'),
    -- New in this migration. Counts only.
    'game', jsonb_build_object(
      'islands', jsonb_build_object(
        'total', (select count(*) from public.islands),
        'createdToday', (select count(*) from public.islands where created_at >= v_day_start)),
      -- A game is an island; members who left (left_at set) do not count.
      'games', (select jsonb_build_object(
          'withMembers', count(*) filter (where n > 1),
          'maxMembers', coalesce(max(n), 0))
        from (select count(*) as n from public.island_members
              where left_at is null group by island_owner) as sizes),
      -- Running = no finish time yet (an expired wave has one). Best wave = highest wave survived.
      'waves', jsonb_build_object(
        'runningNow', (select count(*) from public.wave_runs where finished_at is null),
        'finishedToday', (select count(*) from public.wave_runs
                          where finished_at >= v_day_start and not expired),
        'bestWave', (select coalesce(max(wave), 0) from public.wave_runs where survived)),
      'demo', jsonb_build_object(
        'codeActive', coalesce((select code is not null from public.demo_class_code
                                where name = 'class_demo'), false),
        'guestsToday', (select count(*) from public.demo_guests where admitted_at >= v_day_start))
    )
  );
end;
$$;
revoke all on function public.host_console_overview() from public, anon, authenticated, service_role;
grant execute on function public.host_console_overview() to service_role;
comment on function public.host_console_overview() is
  'Whole-database aggregates without row-limit truncation or join multiplication. UTC day; schema probes are not an applied migration history. The game key holds counts of islands, games with members, waves and the class demo, with no names or ids.';
