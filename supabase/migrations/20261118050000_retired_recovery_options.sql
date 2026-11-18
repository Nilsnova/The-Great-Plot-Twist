-- T58 follow-up #456: recovery-v1 islands may keep saved recovery choices, but new choices
-- cannot grant Carpenter, Workshop, Quick Mend or Mason Drill effects. The application checks
-- the persisted version before calling these RPCs; these row guards serialize with wave admission
-- and protect the durable state if an old caller races that check.

create or replace function public.guard_retired_recovery_option()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  v_owner uuid;
  v_retired boolean := false;
  v_version smallint;
begin
  if tg_table_name = 'islands' then
    v_owner := (v_new ->> 'player_id')::uuid;
    v_retired := coalesce((v_new ->> 'crew_carpenter')::integer, 0)
      > coalesce((v_old ->> 'crew_carpenter')::integer, 0);
  elsif tg_table_name = 'islet_buildings' then
    v_owner := (v_new ->> 'player_id')::uuid;
    v_retired := coalesce((v_new ->> 'spec') = 'quick_mend'
      and (v_new ->> 'building_type') = 'wall'
      and (v_old ->> 'spec') is distinct from 'quick_mend'
      or (v_new ->> 'spec') = 'workshop'
      and (v_new ->> 'building_type') = 'house'
      and (v_old ->> 'spec') is distinct from 'workshop', false);
  elsif tg_table_name = 'island_research' then
    v_owner := (v_new ->> 'island_owner')::uuid;
    v_retired := coalesce((v_new ->> 'branch') = 'wall'
      and (v_new ->> 'choice_2') = 'mason_drill'
      and (v_old ->> 'choice_2') is distinct from 'mason_drill', false);
  else
    raise exception 'bad_recovery_option_guard';
  end if;

  if not v_retired then
    return new;
  end if;

  -- These three writes are reachable through service-only RPCs that lock the owner and recovery
  -- rows before changing this table. Read that already locked policy row; taking a new lock here
  -- would invert the canonical order because PostgreSQL has already locked this row for the write.
  select recovery_version into v_version
    from public.island_recovery_state
   where island_owner = v_owner;
  if v_version = 1 then
    raise exception 'recovery_option_retired' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_retired_recovery_option()
  from public, anon, authenticated, service_role;
grant execute on function public.guard_retired_recovery_option() to service_role;

drop trigger if exists island_retired_recovery_carpenter_guard on public.islands;
create trigger island_retired_recovery_carpenter_guard
before update of crew_carpenter on public.islands
for each row execute function public.guard_retired_recovery_option();

drop trigger if exists islet_buildings_retired_recovery_choice_guard on public.islet_buildings;
create trigger islet_buildings_retired_recovery_choice_guard
before insert or update of spec on public.islet_buildings
for each row execute function public.guard_retired_recovery_option();

drop trigger if exists island_research_retired_recovery_choice_guard on public.island_research;
create trigger island_research_retired_recovery_choice_guard
before insert or update of choice_2 on public.island_research
for each row execute function public.guard_retired_recovery_option();

comment on function public.guard_retired_recovery_option() is
  'Rejects only new recovery-v1 transitions into retired Carpenter/Workshop/Quick Mend/Mason Drill choices. Existing stored IDs and unrelated updates remain available. The application returns a 409 before RPC; this guard fences a stale caller at the transaction boundary.';
