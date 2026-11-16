-- Bounded, server-only source runs for the T7/T45 island leaderboard.
-- The response is one best winning run per island, ordered for the top ten.

create or replace function public.leaderboard_best_runs(
  p_cutoff timestamptz,
  p_window_start timestamptz default null,
  p_window_end timestamptz default null
)
returns table (id uuid, island_owner uuid, wave integer)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_cutoff is null then
    raise exception using errcode = '22023', message = 'cutoff_required';
  end if;

  if (p_window_start is null) <> (p_window_end is null)
     or (p_window_start is not null and p_window_start >= p_window_end) then
    raise exception using errcode = '22023', message = 'invalid_window';
  end if;

  return query
    with ordered_runs as (
      select
        runs.id,
        runs.island_owner,
        runs.wave,
        runs.finished_at,
        row_number() over (
          partition by runs.island_owner
          order by runs.wave desc, runs.finished_at asc, runs.id asc
        ) as island_position
      from public.wave_runs as runs
      where runs.place = 'island'
        and runs.island_owner is not null
        and runs.survived is true
        and runs.expired is false
        and runs.finished_at is not null
        and runs.finished_at <= p_cutoff
        and (p_window_start is null or runs.finished_at >= p_window_start)
        and (p_window_end is null or runs.finished_at < p_window_end)
    )
    select
      best.id,
      best.island_owner,
      best.wave
    from ordered_runs as best
    where best.island_position = 1
    order by best.wave desc, best.finished_at asc, best.id asc
    limit 10;
end;
$$;

comment on function public.leaderboard_best_runs(timestamptz, timestamptz, timestamptz) is
  'Returns the best qualifying finished winning island run for each of the top ten islands at a request cutoff and optional half-open window. Used by the server leaderboard; returns no captain names or participant data.';

revoke all on function public.leaderboard_best_runs(timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.leaderboard_best_runs(timestamptz, timestamptz, timestamptz)
  to service_role;
