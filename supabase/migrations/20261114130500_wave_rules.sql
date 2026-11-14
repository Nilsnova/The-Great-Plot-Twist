-- =============================================================================
-- The simulation rules of each wave (T33 tower_health, T34/T35 pathing, T38 rescue).
-- Used by: backend/server/island/wave_rules.py (POST /api/waves/start, /join and
-- GET /api/waves/current), only while at least one of those flags is on.
-- SUPERSEDED (comment added after PR #63; no statement below changed): the sentence above is
-- outdated. Since PR #63 the server calls wave_rules_keep() on every start, join and current
-- answer, even while every rule flag is off, and keeps the empty set too, so this migration is
-- needed whatever the flags say. Also, the check rule below was widened for defenses_v2 by
-- 20261114140000_culverin.sql.
--
-- WHY
--   The server's flags decide which sim rules a wave plays with, and every
--   client of the wave must play the same ones. Reading the flags on every
--   start, join and current answer would give a friend who joins after a flag
--   was switched other rules than the bell-ringer: their simulations would
--   drift apart. So the first answer for a wave keeps its rule set here, and
--   every later answer for that wave serves the kept set.
--
-- WHAT IT ADDS (additive only: no existing table or function changes)
--   wave_rules         one row per wave: the rule names it plays with
--   wave_rules_keep()  keep a wave's rules once, answer the kept ones
--
-- WHAT IT NEEDS
--   20261110010000_islands_and_waves.sql (wave_runs).
--
-- SAFE TO RUN AGAIN
--   create table if not exists, create or replace function, drop ... if exists.
--
-- ROLLBACK (by hand)
--   drop function public.wave_rules_keep(uuid, text[]);
--   drop table public.wave_rules;
--
-- HOW TO VERIFY (read-only, after applying)
--   select count(*) from public.wave_rules;  -- 0 until a rule flag is on
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. wave_rules: the rule set of one wave, kept by its first answer
-- -----------------------------------------------------------------------------

create table if not exists public.wave_rules (
  wave_id    uuid primary key references public.wave_runs (id) on delete cascade,
  rules      text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.wave_rules drop constraint if exists wave_rules_known_names;
-- Only the names the server knows (SIM_RULES in backend/server/island/wave_rules.py).
alter table public.wave_rules
  add constraint wave_rules_known_names
    check (rules <@ array['tower_health', 'pathing', 'rescue']::text[]);

comment on table public.wave_rules is
  'The simulation rules (tower_health, pathing, rescue) a wave plays with, kept by the first start/join/current answer for it, so every client of the wave plays the same rules even if a flag changes while it runs. Written only by wave_rules_keep().';
comment on column public.wave_rules.wave_id is 'The wave (wave_runs.id).';
comment on column public.wave_rules.rules is 'The rule names, in the server''s order; empty means none.';
comment on column public.wave_rules.created_at is 'When the rules were kept.';

alter table public.wave_rules enable row level security;
-- No policy: players never read or write it. The server uses it only through the function.

revoke all on table public.wave_rules from public, anon, authenticated, service_role;
grant select, insert on table public.wave_rules to service_role;

-- -----------------------------------------------------------------------------
-- 2. wave_rules_keep(): keep a wave's rules once, answer the kept ones
-- -----------------------------------------------------------------------------
--   p_rules  the rules the server's flags say now
-- Returns {"rules": [...]}: the rules kept for the wave (the first call's p_rules;
-- a later call with other rules changes nothing). The primary key serialises two
-- calls at once: one inserts, the other reads the inserted row.

create or replace function public.wave_rules_keep(
  p_wave_id uuid,
  p_rules   text[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_rules text[];
begin
  if p_wave_id is null or p_rules is null then
    raise exception 'bad_rules';
  end if;

  insert into public.wave_rules (wave_id, rules)
  values (p_wave_id, p_rules)
  on conflict (wave_id) do nothing;

  select rules into v_rules from public.wave_rules where wave_id = p_wave_id;
  return jsonb_build_object('rules', to_jsonb(v_rules));
end;
$$;
revoke all on function public.wave_rules_keep(uuid, text[])
  from public, anon, authenticated, service_role;
grant execute on function public.wave_rules_keep(uuid, text[]) to service_role;

comment on function public.wave_rules_keep(uuid, text[]) is
  'Keeps the simulation rules of wave p_wave_id the first time it is called for that wave and answers the kept rules every time ({"rules": [...]}), so a wave keeps one rule set while it runs. Only service_role may run it.';
