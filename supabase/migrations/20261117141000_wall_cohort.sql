-- Bounded perimeter-wall IDs and positioned-build guards (WALL-19).
-- Requires 20261117140000_wall_policy.sql. Only a trusted positioned transaction
-- may create the 116 new inventory pieces. No prices or paid history are changed.

-- Return a canonical wall number, or null. Three digits bound the cast before
-- conversion; leading zeroes, aliases and IDs above the cohort are never admitted.
create or replace function public.island_wall_number(p_plot text)
returns integer language sql immutable security invoker set search_path = ''
as $$
  select case when p_plot ~ '^wall_[1-9][0-9]{0,2}$'
    then case when substring(p_plot from 6)::integer <= 128
      then substring(p_plot from 6)::integer end end;
$$;
revoke all on function public.island_wall_number(text) from public, anon, authenticated, service_role;
grant execute on function public.island_wall_number(text) to service_role;
comment on function public.island_wall_number(text) is
  'Canonical wall_1..wall_128 identity; null for aliases and out-of-cohort names.';

-- Preserve every home plot, D060 tower-kind pair, watchtower and house pair.
-- DROP and ADD share one statement: the table is never left unconstrained.
alter table public.islet_buildings
  drop constraint if exists islet_buildings_plot_fits_building,
  add constraint islet_buildings_plot_fits_building check (
    (building_type = 'wall' and public.island_wall_number(plot) is not null)
    or (plot, building_type) in (
      ('plot_2', 'workshop'), ('plot_3', 'windmill'), ('plot_4', 'greenhouse'),
      ('islet_signal_station', 'signal_station'), ('tower_1', 'watchtower'),
      ('house_1', 'house'), ('house_2', 'house'))
    or (plot ~ '^cannon_([1-9]|1[01])$'
      and building_type in ('cannon', 'mortar', 'harpoon', 'culverin', 'swivel'))
  );
comment on constraint islet_buildings_plot_fits_building on public.islet_buildings is
  'Current home and D060 tower pairs, plus canonical wall_1..128; new inventory builds additionally require positioned transaction authority.';

-- A positioned batch has a distinct construction contribution per piece.
-- Preserve old single-build/upgrade refs; only the exact bounded new namespace
-- may use a suffix, and it must identify this level-one building instance.
alter table public.building_payments
  drop constraint if exists building_payments_ref_format,
  add constraint building_payments_ref_format check (
    ref ~ '^(island|upgrade):[A-Za-z0-9_-]{8,64}$'
    or (ref ~ '^island:[A-Za-z0-9_-]{8,64}:wall_[1-9][0-9]{0,2}$'
      and public.island_wall_number(split_part(ref, ':', 3)) is not null
      and split_part(ref, ':', 3) = plot and ref = building_ref and level = 1));
comment on constraint building_payments_ref_format on public.building_payments is
  'Legacy island/upgrade UIDs, or an exact positioned level-one per-piece ref with canonical wall identity and matching building/plot; UID bounds remain8..64.';

-- New pieces have coordinates only once placed by the authoritative transaction.
alter table public.island_layout
  drop constraint if exists island_layout_plot_known,
  add constraint island_layout_plot_known check (
    public.island_wall_number(plot) is not null
    or plot ~ '^cannon_([1-9]|1[01])$' or plot in ('tower_1', 'house_1', 'house_2'));
comment on constraint island_layout_plot_known on public.island_layout is
  'Canonical wall_1..128 and the existing D060-aware non-wall island sites.';

-- The health table must admit every selected wall before offers can activate.
alter table public.island_structure_health
  drop constraint if exists island_structure_health_spot,
  add constraint island_structure_health_spot check (
    public.island_wall_number(spot) is not null or spot ~ '^cannon_([1-9]|1[01])$');
comment on constraint island_structure_health_spot on public.island_structure_health is
  'Current health identities include the complete bounded wall cohort and D060 towers.';

-- This context is set locally by the service-only positioned-chain RPC, never by
-- a request's policy field. The RPC inserts the checked coordinate before its
-- building; permission, final-layout CAS, price and wallet checks remain there.
create or replace function public.island_inventory_wall_build_guard()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  v_context jsonb;
begin
  if coalesce(public.island_wall_number(new.plot), 0) <= 12 then return new; end if;
  begin
    v_context := nullif(current_setting('app.positioned_wall_build', true), '')::jsonb;
  exception when invalid_text_representation then
    raise check_violation using message = 'positioned_wall_build_required';
  end;
  if jsonb_typeof(v_context) is distinct from 'object'
     or v_context ->> 'owner' is distinct from new.player_id::text
     or coalesce(v_context ->> 'payer', '') !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
     or coalesce(v_context ->> 'actionUid', '') !~ '^[A-Za-z0-9_-]{8,64}$'
     or jsonb_typeof(v_context -> 'plots') is distinct from 'array'
     or not (v_context -> 'plots' ? new.plot)
     or new.ref is distinct from ('island:' || (v_context ->> 'actionUid') || ':' || new.plot)
     or not exists (select 1 from public.island_wall_policy
       where island_owner = new.player_id and rule_version = 1 and capacity = 128)
     or not exists (select 1 from public.island_layout
       where island_owner = new.player_id and plot = new.plot) then
    raise check_violation using message = 'positioned_wall_build_required';
  end if;
  return new;
end;
$$;
revoke all on function public.island_inventory_wall_build_guard() from public, anon, authenticated, service_role;
grant execute on function public.island_inventory_wall_build_guard() to service_role;
comment on function public.island_inventory_wall_build_guard() is
  'New inventory IDs require matching owner/piece/ref authority, persisted cohort policy and a positioned coordinate; a refused old build rolls back its entire transaction.';
drop trigger if exists island_inventory_wall_build_guard on public.islet_buildings;
create trigger island_inventory_wall_build_guard before insert on public.islet_buildings
  for each row execute function public.island_inventory_wall_build_guard();

-- Added pieces return to inventory on demolition/reset. The original twelve keep
-- their legacy empty-site positions; deletion of the island itself is harmless.
create or replace function public.island_inventory_wall_position_release()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if public.island_wall_number(old.plot) > 12 then
    delete from public.island_layout where island_owner = old.player_id and plot = old.plot;
  end if;
  return old;
end;
$$;
revoke all on function public.island_inventory_wall_position_release() from public, anon, authenticated, service_role;
grant execute on function public.island_inventory_wall_position_release() to service_role;
comment on function public.island_inventory_wall_position_release() is
  'Releases only an added inventory wall coordinate when its building is removed; legacy reserved sites retain their positions.';
drop trigger if exists island_inventory_wall_position_release on public.islet_buildings;
create trigger island_inventory_wall_position_release after delete on public.islet_buildings
  for each row execute function public.island_inventory_wall_position_release();
