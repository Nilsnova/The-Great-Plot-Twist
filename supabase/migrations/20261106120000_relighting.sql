-- WHAT IT DOES
-- Stores the one world stage, counted solves and contributor Wall entries.
-- WHO USES IT
-- The accepted case accusation calls this hook inside the same transaction as its rewards.
-- WHAT IT NEEDS
-- The full migration chain through Phase 2; settings are checked by the server, not SQL.
-- SAFE TO RUN TWICE
-- Tables, indexes and the singleton seed repeat safely; this file replaces the solve hook.
-- Phase 1 creates its empty hook only when missing, preserving this replacement and comment.
-- HOW THE FILE IS ORGANISED
-- The singleton and history tables, the world hook, server-only grants and schema comments.

-- Keeps the one global world stage and the first relighting time.
create table if not exists public.world_state (
  id            smallint primary key default 1,
  stage         text not null default 'dark',
  relit_at      timestamptz,
  first_crew_id uuid references public.crews (id) on delete set null,
  solves        integer not null default 0,
  extra_lights  integer not null default 0,
  updated_at    timestamptz not null default now(),
  constraint world_state_one_row check (id = 1),
  constraint world_state_stage_allowed check (stage in ('dark', 'relit')),
  constraint world_state_relit_has_a_time check ((stage = 'relit') = (relit_at is not null)),
  constraint world_state_extra_lights_range check (extra_lights between 0 and 12),
  constraint world_state_solves_not_negative check (solves >= 0)
);
insert into public.world_state (id) values (1) on conflict (id) do nothing;

-- Records each world-visible crew solve once in its global solve order.
create table if not exists public.world_solves (
  crew_id   uuid primary key references public.crews (id) on delete cascade,
  solve_no  integer not null,
  solved_at timestamptz not null default now(),
  constraint world_solves_solve_no_positive check (solve_no >= 1)
);
create unique index if not exists world_solves_one_per_number on public.world_solves (solve_no);

-- Keeps each contributing player first Wall entry, removed with their account.
create table if not exists public.wall_of_lights (
  player_id uuid primary key references public.profiles (id) on delete cascade,
  solve_no  integer not null,
  crew_id   uuid references public.crews (id) on delete set null,
  added_at  timestamptz not null default now(),
  constraint wall_of_lights_solve_no_positive check (solve_no >= 1)
);
create index if not exists wall_of_lights_order_idx on public.wall_of_lights (solve_no, added_at);

-- Relights once or counts a later solve while the server relight switch is open.
create or replace function public.case_after_solve(p_crew_id uuid, p_relight_open boolean, p_contributors uuid[])
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_world    public.world_state%rowtype;
  v_solve_no integer;
  v_first    boolean;
begin
  -- The relight lock: while RELIGHT_OPEN is off, a solve stays inside its crew (decision 19).
  if not coalesce(p_relight_open, false) then
    return jsonb_build_object('world', 'locked');
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
  -- The one conditional update: only if the coast is still dark.
  update public.world_state
     set stage = 'relit', relit_at = now(), first_crew_id = p_crew_id,
         solves = v_solve_no, updated_at = now()
   where id = 1 and stage = 'dark';
  v_first := found;
  if not v_first then
    -- 12 = relighting.later_crews.extra_light_spots in case.json (a test compares).
    update public.world_state
       set solves = v_solve_no, extra_lights = least(extra_lights + 1, 12), updated_at = now()
     where id = 1;
  end if;
  insert into public.wall_of_lights (player_id, solve_no, crew_id)
  select contributor, v_solve_no, p_crew_id from unnest(coalesce(p_contributors, '{}')) as contributor
  on conflict (player_id) do nothing;
  return jsonb_build_object('world', case when v_first then 'relit' else 'added' end, 'solveNo', v_solve_no);
end;
$$;

-- The server can change the singleton and append history; players have no direct access.
alter table public.world_state enable row level security;
revoke all on table public.world_state from public, anon, authenticated, service_role;
grant select, update on table public.world_state to service_role;
alter table public.world_solves enable row level security;
revoke all on table public.world_solves from public, anon, authenticated, service_role;
grant select, insert on table public.world_solves to service_role;
alter table public.wall_of_lights enable row level security;
revoke all on table public.wall_of_lights from public, anon, authenticated, service_role;
grant select, insert on table public.wall_of_lights to service_role;

-- The hook runs with caller rights inside case_accuse after the crew and wallet locks.
revoke all on function public.case_after_solve(uuid, boolean, uuid[]) from public, anon, authenticated;
grant execute on function public.case_after_solve(uuid, boolean, uuid[]) to service_role;
comment on function public.case_after_solve(uuid, boolean, uuid[]) is
  'Relighting hook: closed solves stay private; open solves relight once or add a light and contributor Wall entries. Called atomically by case_accuse.';

comment on table public.world_state is
  'Keeps the one global world stage and the first relighting time.';
comment on column public.world_state.id is
  'The only world row has id 1.';
comment on column public.world_state.stage is
  'The global stage, dark before the first open solve and relit afterwards.';
comment on column public.world_state.relit_at is
  'When the first open solve relit the world; later solves preserve this time.';
comment on column public.world_state.first_crew_id is
  'The first relighting crew, or null after that crew is deleted.';
comment on column public.world_state.solves is
  'The number of world-visible solves, counted once for each crew.';
comment on column public.world_state.extra_lights is
  'Later crew lights, capped at the twelve available spots.';
comment on column public.world_state.updated_at is
  'When the singleton last counted a world-visible solve.';
comment on table public.world_solves is
  'Records each world-visible crew solve once in its global solve order.';
comment on column public.world_solves.crew_id is
  'The crew whose accepted open solve was counted once.';
comment on column public.world_solves.solve_no is
  'The unique positive global order of this crew solve.';
comment on column public.world_solves.solved_at is
  'When this world-visible solve was recorded.';
comment on table public.wall_of_lights is
  'Keeps each contributing player first Wall entry, removed with their account.';
comment on column public.wall_of_lights.player_id is
  'The contributing player, shown by their current captain name through the API.';
comment on column public.wall_of_lights.solve_no is
  'The order of the first world-visible solve to which this player contributed.';
comment on column public.wall_of_lights.crew_id is
  'The crew for that first contribution, or null after the crew is deleted.';
comment on column public.wall_of_lights.added_at is
  'When this player first joined the Wall, used to order tied solve entries.';
