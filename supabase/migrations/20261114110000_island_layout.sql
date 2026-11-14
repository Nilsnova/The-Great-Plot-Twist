-- =============================================================================
-- 20261114110000_island_layout.sql: where the build spots of an island stand (T36)
-- =============================================================================
--
-- WHAT IT DOES
--   Flexible placement (open todos T36, decision D041, specs/T36-flexible-placement.md).
--   Each of the 22 build spots of an island keeps its id, its slot and what stands on
--   it (islet_buildings, unchanged), but may stand on any free cell of a grid of half
--   units. This file stores the cells that players picked:
--
--     island_layout   NEW table, one row per moved spot of an island. A spot without a
--                     row stands on its fixed spot of before: an old save needs no
--                     conversion, it is read as the fixed spots, each a grid cell
--                     (layout version 1). A row is layout version 2.
--     island_move()   NEW function: one spot to one cell, between waves, as a
--                     compare-and-swap against the layout the server checked.
--
-- WHO USES IT
--   Only the Python server, with the secret key (service_role):
--   backend/server/island/layout_store.py, reached by POST /api/island/move and read
--   by every island answer (GET /api/island and the rest). No browser role gets
--   anything: the positions reach the browser inside the island answer.
--
-- THE RULES THAT THE DATABASE KEEPS
--   1. Positions are whole half units (x_half = x * 2), inside the island's box.
--   2. Only the 22 island spot ids; Pirate Point's spots stay where they are.
--   3. No move while a wave runs on the island (refused wave_running): the wave reads
--      the defenses where they stood when it began. The test is island_demolish()'s.
--   4. The server checks the placement rules (land, overlaps, a way to the heart) in
--      backend/server/island/layout.py and sends the stored rows it checked against
--      (p_seen). Under the island row lock (the lock wave_start() takes) the function
--      compares them with the rows now: when another move came first it refuses busy
--      and changes nothing, so two moves at once can never overlap.
--   5. No coins move: a move is free (D041).
--
-- RUN IT
--   After every earlier migration, once. Safe to run twice (if not exists, create or
--   replace, and the revokes, grants and comments repeat). NOT applied live by the
--   branch that adds it: a teammate applies it under the team's migration policy.
--   Until then the server reads no layout (the fixed spots) and the browser shows no
--   Move button (the island answer says layout.movable false).
--
-- CHECKS AFTER APPLYING (SQL editor)
--   a. The table has row-level security and no browser rights:
--      select relrowsecurity from pg_class where oid = 'public.island_layout'::regclass;  -- true
--      select has_table_privilege('authenticated', 'public.island_layout', 'select');      -- false
--   b. Only the server may run the function:
--      select has_function_privilege('authenticated',
--             'public.island_move(uuid, uuid, text, integer, integer, jsonb)', 'execute'); -- false
--   c. A move of an unknown spot is refused by the check rule:
--      insert into public.island_layout (island_owner, plot, x_half, z_half)
--      values ('<an island owner>', 'cabin', 0, 0);                         -- check violation
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. island_layout: the cells the players picked
-- -----------------------------------------------------------------------------

create table if not exists public.island_layout (
  island_owner   uuid not null references public.islands (player_id) on delete cascade,
  plot           text not null,
  x_half         integer not null,
  z_half         integer not null,
  layout_version smallint not null default 2,
  -- set null, not cascade: the layout belongs to the island, so it stays when the member who moved a spot deletes their account.
  moved_by       uuid references public.profiles (id) on delete set null,
  moved_at       timestamptz not null default now(),

  primary key (island_owner, plot),
  constraint island_layout_plot_known check (plot in (
    'wall_1', 'wall_2', 'wall_3', 'wall_4', 'wall_5', 'wall_6',
    'wall_7', 'wall_8', 'wall_9', 'wall_10', 'wall_11', 'wall_12',
    'cannon_1', 'cannon_2', 'cannon_3', 'cannon_4', 'cannon_5', 'cannon_6', 'cannon_7',
    'tower_1', 'house_1', 'house_2')),
  constraint island_layout_x_range check (x_half between -60 and 60),
  constraint island_layout_z_range check (z_half between -60 and 60),
  constraint island_layout_version_known check (layout_version = 2)
);

comment on table public.island_layout is
  'Flexible placement (T36, D041): one row per build spot an island moved to a cell of the half-unit grid. A spot without a row stands on its fixed spot. No browser access.';
comment on column public.island_layout.island_owner is
  'The island (its owner, the game''s host) the layout belongs to.';
comment on column public.island_layout.plot is
  'The build spot id, as in islet_buildings.plot and backend/content/island_layout.json.';
comment on column public.island_layout.x_half is
  'The spot''s x on the island in half units (x = x_half / 2).';
comment on column public.island_layout.z_half is
  'The spot''s z on the island in half units (z = z_half / 2).';
comment on column public.island_layout.layout_version is
  'The layout model of the row: 2, the grid. Version 1 (the fixed spots) has no rows.';
comment on column public.island_layout.moved_by is
  'The member who last moved the spot.';
comment on column public.island_layout.moved_at is
  'When the spot was last moved.';

alter table public.island_layout enable row level security;
-- No policy: the browser never reads or writes this table. The positions reach it
-- inside the island answer of the server.

-- The second lock: take every right away, then grant back only what the server needs.
revoke all on table public.island_layout from public, anon, authenticated, service_role;
grant select, insert, update on table public.island_layout to service_role;


-- -----------------------------------------------------------------------------
-- 2. island_move(): one spot to one cell, between waves
-- -----------------------------------------------------------------------------
--   p_island_owner  the island (the server checked that the mover is its owner or a member)
--   p_mover         the player who moves (recorded in moved_by)
--   p_plot          the spot id
--   p_x_half, p_z_half  the new cell, in half units
--   p_seen          the island's rows as the server read them before it checked the
--                   rules: [{"plot", "x_half", "z_half"}] in plot order (collate "C")
--
-- Returns {status: done} or {status: refused, reason: no_island | wave_running | busy}.

create or replace function public.island_move(
  p_island_owner uuid,
  p_mover        uuid,
  p_plot         text,
  p_x_half       integer,
  p_z_half       integer,
  p_seen         jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_now jsonb;
begin
  if p_island_owner is null or p_mover is null or p_plot is null
     or p_x_half is null or p_z_half is null or jsonb_typeof(p_seen) is distinct from 'array' then
    raise exception 'bad_move';
  end if;

  perform 1 from public.islands where player_id = p_island_owner for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_island');
  end if;

  -- No move under a running wave: it fights the defenses where they stood at its start.
  -- The same test as island_demolish() (20261112080000_demolish.sql).
  if exists (
    select 1 from public.wave_runs
     where island_owner = p_island_owner and finished_at is null
       and starts_at + make_interval(secs => maximum_seconds) >= now()
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'wave_running');
  end if;

  -- The compare-and-swap: the rows now must be the rows the server checked.
  select coalesce(jsonb_agg(jsonb_build_object('plot', plot, 'x_half', x_half, 'z_half', z_half)
                            order by plot collate "C"), '[]'::jsonb)
    into v_now
    from public.island_layout
   where island_owner = p_island_owner;
  if v_now is distinct from p_seen then
    return jsonb_build_object('status', 'refused', 'reason', 'busy');
  end if;

  insert into public.island_layout (island_owner, plot, x_half, z_half, moved_by)
  values (p_island_owner, p_plot, p_x_half, p_z_half, p_mover)
  on conflict (island_owner, plot) do update
    set x_half = excluded.x_half, z_half = excluded.z_half,
        moved_by = excluded.moved_by, moved_at = now();
  return jsonb_build_object('status', 'done');
end;
$$;

comment on function public.island_move(uuid, uuid, text, integer, integer, jsonb) is
  'Flexible placement (T36, D041): move one build spot of an island to one grid cell, between waves, if the layout is still the one the server checked (else busy). No coins move. Server only.';

revoke all on function public.island_move(uuid, uuid, text, integer, integer, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.island_move(uuid, uuid, text, integer, integer, jsonb)
  to service_role;
