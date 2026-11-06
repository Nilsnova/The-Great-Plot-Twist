-- Records the shared coast's Relighting and contributor-only Wall of Lights.
-- Used by case_accuse inside its solve transaction. Phase 1 creates its empty hook only
-- when absent, so reloading 060000 never restores that hook over this implementation.
-- Apply after 080000. This migration never opens RELIGHT_OPEN and never relights on apply.

-- Exactly one shared coast; only the first accepted open solve sets the Relighting time.
create table if not exists public.world_state (
  id smallint primary key default 1,
  stage text not null default 'dark',
  relit_at timestamptz,
  first_crew_id uuid references public.crews (id) on delete set null,
  solves integer not null default 0,
  extra_lights integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint world_state_one_row check (id = 1),
  constraint world_state_stage_allowed check (stage in ('dark', 'relit')),
  constraint world_state_relit_has_a_time check ((stage = 'relit') = (relit_at is not null)),
  constraint world_state_extra_lights_range check (extra_lights between 0 and 12),
  constraint world_state_solves_not_negative check (solves >= 0)
);
insert into public.world_state (id) values (1) on conflict (id) do nothing;
create index if not exists world_state_first_crew_idx on public.world_state (first_crew_id);

-- A crew is counted at most once, even if the hook is retried after finishing.
create table if not exists public.world_solves (
  crew_id uuid primary key references public.crews (id) on delete cascade,
  solve_no integer not null,
  solved_at timestamptz not null default now(),
  constraint world_solves_solve_no_positive check (solve_no >= 1)
);
create unique index if not exists world_solves_one_per_number on public.world_solves (solve_no);

-- Contributors appear once by their current generated captain name; account deletion removes it.
create table if not exists public.wall_of_lights (
  player_id uuid primary key references public.profiles (id) on delete cascade,
  solve_no integer not null,
  crew_id uuid references public.crews (id) on delete set null,
  added_at timestamptz not null default now(),
  constraint wall_of_lights_solve_no_positive check (solve_no >= 1)
);
create index if not exists wall_of_lights_order_idx
  on public.wall_of_lights (solve_no, added_at, player_id);
create index if not exists wall_of_lights_crew_idx on public.wall_of_lights (crew_id);

alter table public.world_state enable row level security;
alter table public.world_solves enable row level security;
alter table public.wall_of_lights enable row level security;
revoke all on table public.world_state, public.world_solves, public.wall_of_lights
  from public, anon, authenticated, service_role;
grant select, update on table public.world_state to service_role;
grant select, insert on table public.world_solves, public.wall_of_lights to service_role;

-- Only case_accuse calls this, after its crew/state/wallet locks. The shared row is last.
create or replace function public.case_after_solve(
  p_crew_id uuid, p_relight_open boolean, p_contributors uuid[])
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_world public.world_state%rowtype;
  v_solve_no integer;
  v_first boolean;
begin
  -- A locked solve never reaches the world later, including a direct server-side retry (C9).
  if not coalesce(p_relight_open, false) or exists (
    select 1 from public.case_state where crew_id = p_crew_id and world_outcome = 'locked'
  ) then
    return jsonb_build_object('world', 'locked');
  end if;
  if not exists (
    select 1 from public.case_state where crew_id = p_crew_id and solved_second is not null
  ) then
    raise exception 'bad_world_solve';
  end if;
  select * into v_world from public.world_state where id = 1 for update;
  if not found then
    raise exception 'world_state_missing';
  end if;
  if exists (select 1 from public.world_solves where crew_id = p_crew_id) then
    return jsonb_build_object('world', 'already_recorded');
  end if;
  v_solve_no := v_world.solves + 1;
  insert into public.world_solves (crew_id, solve_no) values (p_crew_id, v_solve_no);
  -- This is the only dark -> relit update. The row lock serialises simultaneous crews.
  update public.world_state
     set stage = 'relit', relit_at = now(), first_crew_id = p_crew_id,
         solves = v_solve_no, updated_at = now()
   where id = 1 and stage = 'dark';
  v_first := found;
  if not v_first then
    -- 12 = relighting.later_crews.extra_light_spots in the private case data.
    update public.world_state
       set solves = v_solve_no, extra_lights = least(extra_lights + 1, 12), updated_at = now()
     where id = 1;
  end if;
  -- Defend the contributor-only decision using the solve snapshot, rather than trusting names
  -- or client-supplied seats. A player's first qualifying solve keeps their original order.
  insert into public.wall_of_lights (player_id, solve_no, crew_id)
  select s.player_id, v_solve_no, p_crew_id
    from public.case_solvers as s
   where s.crew_id = p_crew_id and s.contributor and s.share > 0
     and s.player_id = any(coalesce(p_contributors, '{}'::uuid[]))
  on conflict (player_id) do nothing;
  return jsonb_build_object('world', case when v_first then 'relit' else 'added' end,
                            'solveNo', v_solve_no);
end;
$$;
revoke all on function public.case_after_solve(uuid, boolean, uuid[])
  from public, anon, authenticated;
grant execute on function public.case_after_solve(uuid, boolean, uuid[]) to service_role;
comment on function public.case_after_solve(uuid, boolean, uuid[]) is
  'Phase 3 Relighting hook: locked solves remain private forever; open solves atomically relight once, count later lights and add contributors only. Server-only invoker.';

comment on table public.world_state is 'Server-only singleton shared coast state. RLS intentionally has no browser policy.';
comment on column public.world_state.id is 'Always 1, enforced by a check.';
comment on column public.world_state.stage is 'dark until the first accepted solve with the server relight switch open.';
comment on column public.world_state.relit_at is 'Time of the first open solve; never moved by later solves.';
comment on column public.world_state.first_crew_id is 'First open solving crew; cleared if that crew is deleted.';
comment on column public.world_state.solves is 'Lifetime count of open qualifying crew solves.';
comment on column public.world_state.extra_lights is 'Later crew lamps, capped at 12.';
comment on column public.world_state.updated_at is 'Time of the most recent qualifying solve.';
comment on table public.world_solves is 'Server-only once-per-crew ledger of open solves, ordered by shared row lock.';
comment on column public.world_solves.crew_id is 'Qualifying crew; removed if that crew is deleted.';
comment on column public.world_solves.solve_no is 'Unique positive solve order, allocated while the shared coast is locked.';
comment on column public.world_solves.solved_at is 'Time the qualifying solve transaction began.';
comment on table public.wall_of_lights is 'Server-only contributor names; public API emits current captain name and order only.';
comment on column public.wall_of_lights.player_id is 'Contributor profile; account deletion cascades the Wall entry.';
comment on column public.wall_of_lights.solve_no is 'Order of this contributor first qualifying for the Wall.';
comment on column public.wall_of_lights.crew_id is 'First qualifying crew; cleared if the crew is deleted.';
comment on column public.wall_of_lights.added_at is 'Time the contributor first reached the Wall.';
