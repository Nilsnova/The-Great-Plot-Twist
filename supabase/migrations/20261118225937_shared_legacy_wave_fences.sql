-- Legacy entry compatibility fences; canonical native producers use their private hooks.
-- Originals are captured once and never exposed to a service/browser caller.

create or replace function public.legacy_wave_fence_gate_locked(
  p_actor_id uuid,p_place text,p_island_owner uuid,p_wave_id uuid
) returns text language plpgsql volatile security definer set search_path='' as $$
declare v_owner uuid; v_place text; v_key bigint; v_checked_owner uuid; v_checked_place text;
begin
  if p_wave_id is not null then
    select place,case when place='island' then island_owner end into v_place,v_owner
      from public.wave_runs where id=p_wave_id;
    if not found then return null; end if;
    if exists(select 1 from public.island_wave_accounting where wave_id=p_wave_id) then
      return 'economy_context_required'; end if;
  else
    v_place:=p_place;
    v_owner:=case when p_place='island' then p_island_owner end;
  end if;
  for v_key in select distinct hashtextextended('island-economy:'||owner::text,0)
    from unnest(array[p_actor_id,v_owner]) owner where owner is not null order by 1 loop
    perform pg_advisory_xact_lock(v_key); end loop;
  if exists(select 1 from public.island_economy_state where island_owner=v_owner) then
    return 'economy_context_required'; end if;
  if p_actor_id is not null then
    -- Adoption on another target uses this same anchor. It precedes the old wallet/islands.
    perform 1 from public.profiles where id=p_actor_id for no key update;
    if exists(select 1 from public.personal_captain_profiles where player_id=p_actor_id) then
      return 'personal_captain_managed'; end if;
  end if;
  if p_wave_id is not null then
    select place,case when place='island' then island_owner end into v_checked_place,v_checked_owner
      from public.wave_runs where id=p_wave_id;
    if v_checked_owner is distinct from v_owner or v_checked_place is distinct from v_place then
      return 'unauthorized'; end if;
  end if;
  return null;
end;
$$;
comment on function public.legacy_wave_fence_gate_locked(uuid,text,uuid,uuid) is
  'Private old-entry guard: signed sorted actor/target scopes, persisted shared refusal, then early public personal anchor and managed refusal before any old wallet/island effect. No canonical producer calls this path.';
revoke all on function public.legacy_wave_fence_gate_locked(uuid,text,uuid,uuid)
  from public,anon,authenticated,service_role;

-- Only immutable closed personal sources bypass new mode locks. A closed source
-- cannot later freeze as shared: MP-ECO-03 rejects an already finished wave.
create or replace function public.legacy_wave_fence_retained(
  p_actor_id uuid,p_wave_id uuid,p_survived boolean
) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.wave_runs r join public.wave_participants p
    on p.wave_id=r.id and p.player_id=p_actor_id
    where r.id=p_wave_id and r.finished_at is not null
      and not exists(select 1 from public.island_wave_accounting a where a.wave_id=r.id)
      and (not exists(select 1 from public.recovery_wave_states s where s.wave_id=r.id)
        or public.recovery_wave_reward_is_closed(r.id))
      and (p.finished_at is not null or
        (p_survived is not distinct from r.survived and (not r.survived or r.flag_counted))));
$$;
comment on function public.legacy_wave_fence_retained(uuid,uuid,boolean) is
  'Private read-only retained personal-finish proof. Original participant, closed old source, no shared accounting, valid protocol-2 HP closure; no new scope/profile lock or financial effect. Unpaid wins already counted their legacy flag.';
revoke all on function public.legacy_wave_fence_retained(uuid,uuid,boolean)
  from public,anon,authenticated,service_role;

do $$ begin
  if to_regprocedure('public.legacy_wave_fence_recovery_wave_current(uuid,text,uuid,smallint)') is null then
    alter function public.recovery_wave_current(uuid,text,uuid,smallint) rename to legacy_wave_fence_recovery_wave_current;
  end if;
end; $$;
revoke all on function public.legacy_wave_fence_recovery_wave_current(uuid,text,uuid,smallint) from public,anon,authenticated,service_role;

create or replace function public.recovery_wave_current(p_player_id uuid, p_place text, p_island_owner uuid, p_protocol smallint)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_reason text;
begin
  v_reason:=public.legacy_wave_fence_gate_locked(p_player_id,p_place,p_island_owner,null);
  if v_reason is not null then return jsonb_build_object('status','refused','reason',v_reason); end if;
  return public.legacy_wave_fence_recovery_wave_current(p_player_id,p_place,p_island_owner,p_protocol);
end;
$$;
comment on function public.recovery_wave_current(uuid,text,uuid,smallint) is
  'Guarded legacy entry only. Persisted shared targets and managed new legacy control use canonical sessions; retained closed personal finish keeps its original source. Exact old signature/defaults preserved.';
revoke all on function public.recovery_wave_current(uuid,text,uuid,smallint) from public,anon,authenticated,service_role;
grant execute on function public.recovery_wave_current(uuid,text,uuid,smallint) to service_role;

do $$ begin
  if to_regprocedure('public.legacy_wave_fence_recovery_wave_events_page(uuid,uuid,bigint,bigint,integer)') is null then
    alter function public.recovery_wave_events_page(uuid,uuid,bigint,bigint,integer) rename to legacy_wave_fence_recovery_wave_events_page;
  end if;
end; $$;
revoke all on function public.legacy_wave_fence_recovery_wave_events_page(uuid,uuid,bigint,bigint,integer) from public,anon,authenticated,service_role;

create or replace function public.recovery_wave_events_page(p_player_id uuid, p_wave_id uuid, p_after bigint, p_through bigint DEFAULT NULL::bigint, p_sealed_through_tick integer DEFAULT NULL::integer)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_reason text;
begin
  v_reason:=public.legacy_wave_fence_gate_locked(p_player_id,null,null,p_wave_id);
  if v_reason is not null then return jsonb_build_object('status','refused','reason',v_reason); end if;
  return public.legacy_wave_fence_recovery_wave_events_page(p_player_id,p_wave_id,p_after,p_through,p_sealed_through_tick);
end;
$$;
comment on function public.recovery_wave_events_page(uuid,uuid,bigint,bigint,integer) is
  'Guarded legacy entry only. Persisted shared targets and managed new legacy control use canonical sessions; retained closed personal finish keeps its original source. Exact old signature/defaults preserved.';
revoke all on function public.recovery_wave_events_page(uuid,uuid,bigint,bigint,integer) from public,anon,authenticated,service_role;
grant execute on function public.recovery_wave_events_page(uuid,uuid,bigint,bigint,integer) to service_role;

do $$ begin
  if to_regprocedure('public.legacy_wave_fence_recovery_wave_finish(uuid,uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer,uuid,text,integer,bigint,bigint,jsonb,jsonb)') is null then
    alter function public.recovery_wave_finish(uuid,uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer,uuid,text,integer,bigint,bigint,jsonb,jsonb) rename to legacy_wave_fence_recovery_wave_finish;
  end if;
end; $$;
revoke all on function public.legacy_wave_fence_recovery_wave_finish(uuid,uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer,uuid,text,integer,bigint,bigint,jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function public.recovery_wave_finish(p_player_id uuid, p_wave_id uuid, p_survived boolean, p_ships_sunk integer, p_loot_base integer, p_loot_per_wave integer, p_loot_per_house integer, p_point_loot_base integer, p_boss_every integer, p_boss_multiplier integer, p_restart_back integer, p_island_epoch uuid, p_checkpoint_uid text, p_through_tick integer, p_input_head_seq bigint, p_last_repair_seq bigint, p_basis_repair_seq jsonb, p_hp_units jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_reason text;
begin
  if public.legacy_wave_fence_retained(p_player_id,p_wave_id,p_survived) then
    return public.legacy_wave_fence_recovery_wave_finish(p_player_id,p_wave_id,p_survived,p_ships_sunk,p_loot_base,p_loot_per_wave,p_loot_per_house,p_point_loot_base,p_boss_every,p_boss_multiplier,p_restart_back,p_island_epoch,p_checkpoint_uid,p_through_tick,p_input_head_seq,p_last_repair_seq,p_basis_repair_seq,p_hp_units); end if;
  v_reason:=public.legacy_wave_fence_gate_locked(p_player_id,null,null,p_wave_id);
  if v_reason is not null then return jsonb_build_object('status','refused','reason',v_reason); end if;
  return public.legacy_wave_fence_recovery_wave_finish(p_player_id,p_wave_id,p_survived,p_ships_sunk,p_loot_base,p_loot_per_wave,p_loot_per_house,p_point_loot_base,p_boss_every,p_boss_multiplier,p_restart_back,p_island_epoch,p_checkpoint_uid,p_through_tick,p_input_head_seq,p_last_repair_seq,p_basis_repair_seq,p_hp_units);
end;
$$;
comment on function public.recovery_wave_finish(uuid,uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer,uuid,text,integer,bigint,bigint,jsonb,jsonb) is
  'Guarded legacy entry only. Persisted shared targets and managed new legacy control use canonical sessions; retained closed personal finish keeps its original source. Exact old signature/defaults preserved.';
revoke all on function public.recovery_wave_finish(uuid,uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer,uuid,text,integer,bigint,bigint,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.recovery_wave_finish(uuid,uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer,uuid,text,integer,bigint,bigint,jsonb,jsonb) to service_role;

do $$ begin
  if to_regprocedure('public.legacy_wave_fence_recovery_wave_inputs(uuid,uuid,jsonb)') is null then
    alter function public.recovery_wave_inputs(uuid,uuid,jsonb) rename to legacy_wave_fence_recovery_wave_inputs;
  end if;
end; $$;
revoke all on function public.legacy_wave_fence_recovery_wave_inputs(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create or replace function public.recovery_wave_inputs(p_player_id uuid, p_wave_id uuid, p_inputs jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_reason text;
begin
  v_reason:=public.legacy_wave_fence_gate_locked(p_player_id,null,null,p_wave_id);
  if v_reason is not null then return jsonb_build_object('status','refused','reason',v_reason); end if;
  return public.legacy_wave_fence_recovery_wave_inputs(p_player_id,p_wave_id,p_inputs);
end;
$$;
comment on function public.recovery_wave_inputs(uuid,uuid,jsonb) is
  'Guarded legacy entry only. Persisted shared targets and managed new legacy control use canonical sessions; retained closed personal finish keeps its original source. Exact old signature/defaults preserved.';
revoke all on function public.recovery_wave_inputs(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.recovery_wave_inputs(uuid,uuid,jsonb) to service_role;

do $$ begin
  if to_regprocedure('public.legacy_wave_fence_recovery_wave_inputs(uuid,uuid,jsonb,boolean)') is null then
    alter function public.recovery_wave_inputs(uuid,uuid,jsonb,boolean) rename to legacy_wave_fence_recovery_wave_inputs;
  end if;
end; $$;
revoke all on function public.legacy_wave_fence_recovery_wave_inputs(uuid,uuid,jsonb,boolean) from public,anon,authenticated,service_role;

create or replace function public.recovery_wave_inputs(p_player_id uuid, p_wave_id uuid, p_inputs jsonb, p_arsenal boolean)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_reason text;
begin
  v_reason:=public.legacy_wave_fence_gate_locked(p_player_id,null,null,p_wave_id);
  if v_reason is not null then return jsonb_build_object('status','refused','reason',v_reason); end if;
  return public.legacy_wave_fence_recovery_wave_inputs(p_player_id,p_wave_id,p_inputs,p_arsenal);
end;
$$;
comment on function public.recovery_wave_inputs(uuid,uuid,jsonb,boolean) is
  'Guarded legacy entry only. Persisted shared targets and managed new legacy control use canonical sessions; retained closed personal finish keeps its original source. Exact old signature/defaults preserved.';
revoke all on function public.recovery_wave_inputs(uuid,uuid,jsonb,boolean) from public,anon,authenticated,service_role;
grant execute on function public.recovery_wave_inputs(uuid,uuid,jsonb,boolean) to service_role;

do $$ begin
  if to_regprocedure('public.legacy_wave_fence_recovery_wave_join(uuid,uuid,smallint)') is null then
    alter function public.recovery_wave_join(uuid,uuid,smallint) rename to legacy_wave_fence_recovery_wave_join;
  end if;
end; $$;
revoke all on function public.legacy_wave_fence_recovery_wave_join(uuid,uuid,smallint) from public,anon,authenticated,service_role;

create or replace function public.recovery_wave_join(p_player_id uuid, p_wave_id uuid, p_protocol smallint)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_reason text;
begin
  v_reason:=public.legacy_wave_fence_gate_locked(p_player_id,null,null,p_wave_id);
  if v_reason is not null then return jsonb_build_object('status','refused','reason',v_reason); end if;
  return public.legacy_wave_fence_recovery_wave_join(p_player_id,p_wave_id,p_protocol);
end;
$$;
comment on function public.recovery_wave_join(uuid,uuid,smallint) is
  'Guarded legacy entry only. Persisted shared targets and managed new legacy control use canonical sessions; retained closed personal finish keeps its original source. Exact old signature/defaults preserved.';
revoke all on function public.recovery_wave_join(uuid,uuid,smallint) from public,anon,authenticated,service_role;
grant execute on function public.recovery_wave_join(uuid,uuid,smallint) to service_role;

do $$ begin
  if to_regprocedure('public.legacy_wave_fence_recovery_wave_report_health(uuid,uuid,uuid,text,integer,bigint,bigint,jsonb,jsonb)') is null then
    alter function public.recovery_wave_report_health(uuid,uuid,uuid,text,integer,bigint,bigint,jsonb,jsonb) rename to legacy_wave_fence_recovery_wave_report_health;
  end if;
end; $$;
revoke all on function public.legacy_wave_fence_recovery_wave_report_health(uuid,uuid,uuid,text,integer,bigint,bigint,jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function public.recovery_wave_report_health(p_player_id uuid, p_wave_id uuid, p_island_epoch uuid, p_checkpoint_uid text, p_through_tick integer, p_input_head_seq bigint, p_last_repair_seq bigint, p_basis_repair_seq jsonb, p_hp_units jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_reason text;
begin
  v_reason:=public.legacy_wave_fence_gate_locked(p_player_id,null,null,p_wave_id);
  if v_reason is not null then return jsonb_build_object('status','refused','reason',v_reason); end if;
  return public.legacy_wave_fence_recovery_wave_report_health(p_player_id,p_wave_id,p_island_epoch,p_checkpoint_uid,p_through_tick,p_input_head_seq,p_last_repair_seq,p_basis_repair_seq,p_hp_units);
end;
$$;
comment on function public.recovery_wave_report_health(uuid,uuid,uuid,text,integer,bigint,bigint,jsonb,jsonb) is
  'Guarded legacy entry only. Persisted shared targets and managed new legacy control use canonical sessions; retained closed personal finish keeps its original source. Exact old signature/defaults preserved.';
revoke all on function public.recovery_wave_report_health(uuid,uuid,uuid,text,integer,bigint,bigint,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.recovery_wave_report_health(uuid,uuid,uuid,text,integer,bigint,bigint,jsonb,jsonb) to service_role;

do $$ begin
  if to_regprocedure('public.legacy_wave_fence_recovery_wave_revive(uuid,uuid,text,integer,text,integer,integer,double precision,double precision)') is null then
    alter function public.recovery_wave_revive(uuid,uuid,text,integer,text,integer,integer,double precision,double precision) rename to legacy_wave_fence_recovery_wave_revive;
  end if;
end; $$;
revoke all on function public.legacy_wave_fence_recovery_wave_revive(uuid,uuid,text,integer,text,integer,integer,double precision,double precision) from public,anon,authenticated,service_role;

create or replace function public.recovery_wave_revive(p_player_id uuid, p_wave_id uuid, p_fallen text, p_down_at integer, p_action_uid text, p_base integer, p_per_wave integer, p_x double precision, p_z double precision)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_reason text;
begin
  v_reason:=public.legacy_wave_fence_gate_locked(p_player_id,null,null,p_wave_id);
  if v_reason is not null then return jsonb_build_object('status','refused','reason',v_reason); end if;
  return public.legacy_wave_fence_recovery_wave_revive(p_player_id,p_wave_id,p_fallen,p_down_at,p_action_uid,p_base,p_per_wave,p_x,p_z);
end;
$$;
comment on function public.recovery_wave_revive(uuid,uuid,text,integer,text,integer,integer,double precision,double precision) is
  'Guarded legacy entry only. Persisted shared targets and managed new legacy control use canonical sessions; retained closed personal finish keeps its original source. Exact old signature/defaults preserved.';
revoke all on function public.recovery_wave_revive(uuid,uuid,text,integer,text,integer,integer,double precision,double precision) from public,anon,authenticated,service_role;
grant execute on function public.recovery_wave_revive(uuid,uuid,text,integer,text,integer,integer,double precision,double precision) to service_role;

do $$ begin
  if to_regprocedure('public.legacy_wave_fence_recovery_wave_start(uuid,text,text,uuid,integer,integer,integer,integer,integer,text,numeric,numeric,text[],jsonb,boolean,smallint)') is null then
    alter function public.recovery_wave_start(uuid,text,text,uuid,integer,integer,integer,integer,integer,text,numeric,numeric,text[],jsonb,boolean,smallint) rename to legacy_wave_fence_recovery_wave_start;
  end if;
end; $$;
revoke all on function public.legacy_wave_fence_recovery_wave_start(uuid,text,text,uuid,integer,integer,integer,integer,integer,text,numeric,numeric,text[],jsonb,boolean,smallint) from public,anon,authenticated,service_role;

create or replace function public.recovery_wave_start(p_player_id uuid, p_action_uid text, p_place text, p_island_owner uuid, p_seed integer, p_countdown_seconds integer, p_minimum_seconds integer, p_maximum_seconds integer, p_highest_wave integer, p_weather_kind text, p_weather_ships numeric, p_weather_fog numeric, p_rules text[], p_snapshot_template jsonb, p_admit_v1 boolean, p_protocol smallint)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_reason text;
begin
  v_reason:=public.legacy_wave_fence_gate_locked(p_player_id,p_place,p_island_owner,null);
  if v_reason is not null then return jsonb_build_object('status','refused','reason',v_reason); end if;
  return public.legacy_wave_fence_recovery_wave_start(p_player_id,p_action_uid,p_place,p_island_owner,p_seed,p_countdown_seconds,p_minimum_seconds,p_maximum_seconds,p_highest_wave,p_weather_kind,p_weather_ships,p_weather_fog,p_rules,p_snapshot_template,p_admit_v1,p_protocol);
end;
$$;
comment on function public.recovery_wave_start(uuid,text,text,uuid,integer,integer,integer,integer,integer,text,numeric,numeric,text[],jsonb,boolean,smallint) is
  'Guarded legacy entry only. Persisted shared targets and managed new legacy control use canonical sessions; retained closed personal finish keeps its original source. Exact old signature/defaults preserved.';
revoke all on function public.recovery_wave_start(uuid,text,text,uuid,integer,integer,integer,integer,integer,text,numeric,numeric,text[],jsonb,boolean,smallint) from public,anon,authenticated,service_role;
grant execute on function public.recovery_wave_start(uuid,text,text,uuid,integer,integer,integer,integer,integer,text,numeric,numeric,text[],jsonb,boolean,smallint) to service_role;

do $$ begin
  if to_regprocedure('public.legacy_wave_fence_wave_current(text,uuid)') is null then
    alter function public.wave_current(text,uuid) rename to legacy_wave_fence_wave_current;
  end if;
end; $$;
revoke all on function public.legacy_wave_fence_wave_current(text,uuid) from public,anon,authenticated,service_role;

create or replace function public.wave_current(p_place text, p_island_owner uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_reason text;
begin
  v_reason:=public.legacy_wave_fence_gate_locked(null,p_place,p_island_owner,null);
  if v_reason is not null then return jsonb_build_object('status','refused','reason',v_reason); end if;
  return public.legacy_wave_fence_wave_current(p_place,p_island_owner);
end;
$$;
comment on function public.wave_current(text,uuid) is
  'Guarded legacy entry only. Persisted shared targets and managed new legacy control use canonical sessions; retained closed personal finish keeps its original source. Exact old signature/defaults preserved.';
revoke all on function public.wave_current(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.wave_current(text,uuid) to service_role;

do $$ begin
  if to_regprocedure('public.legacy_wave_fence_wave_finish(uuid,uuid,boolean,integer,integer,integer,integer,integer)') is null then
    alter function public.wave_finish(uuid,uuid,boolean,integer,integer,integer,integer,integer) rename to legacy_wave_fence_wave_finish;
  end if;
end; $$;
revoke all on function public.legacy_wave_fence_wave_finish(uuid,uuid,boolean,integer,integer,integer,integer,integer) from public,anon,authenticated,service_role;

create or replace function public.wave_finish(p_player_id uuid, p_wave_id uuid, p_survived boolean, p_ships_sunk integer, p_loot_base integer, p_loot_per_wave integer, p_loot_per_house integer, p_point_loot_base integer)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_reason text;
begin
  if public.legacy_wave_fence_retained(p_player_id,p_wave_id,p_survived) then
    return public.legacy_wave_fence_wave_finish(p_player_id,p_wave_id,p_survived,p_ships_sunk,p_loot_base,p_loot_per_wave,p_loot_per_house,p_point_loot_base); end if;
  v_reason:=public.legacy_wave_fence_gate_locked(p_player_id,null,null,p_wave_id);
  if v_reason is not null then return jsonb_build_object('status','refused','reason',v_reason); end if;
  return public.legacy_wave_fence_wave_finish(p_player_id,p_wave_id,p_survived,p_ships_sunk,p_loot_base,p_loot_per_wave,p_loot_per_house,p_point_loot_base);
end;
$$;
comment on function public.wave_finish(uuid,uuid,boolean,integer,integer,integer,integer,integer) is
  'Guarded legacy entry only. Persisted shared targets and managed new legacy control use canonical sessions; retained closed personal finish keeps its original source. Exact old signature/defaults preserved.';
revoke all on function public.wave_finish(uuid,uuid,boolean,integer,integer,integer,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.wave_finish(uuid,uuid,boolean,integer,integer,integer,integer,integer) to service_role;

do $$ begin
  if to_regprocedure('public.legacy_wave_fence_wave_finish(uuid,uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer)') is null then
    alter function public.wave_finish(uuid,uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer) rename to legacy_wave_fence_wave_finish;
  end if;
end; $$;
revoke all on function public.legacy_wave_fence_wave_finish(uuid,uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer) from public,anon,authenticated,service_role;

create or replace function public.wave_finish(p_player_id uuid, p_wave_id uuid, p_survived boolean, p_ships_sunk integer, p_loot_base integer, p_loot_per_wave integer, p_loot_per_house integer, p_point_loot_base integer, p_boss_every integer, p_boss_multiplier integer, p_restart_back integer)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_reason text;
begin
  if public.legacy_wave_fence_retained(p_player_id,p_wave_id,p_survived) then
    return public.legacy_wave_fence_wave_finish(p_player_id,p_wave_id,p_survived,p_ships_sunk,p_loot_base,p_loot_per_wave,p_loot_per_house,p_point_loot_base,p_boss_every,p_boss_multiplier,p_restart_back); end if;
  v_reason:=public.legacy_wave_fence_gate_locked(p_player_id,null,null,p_wave_id);
  if v_reason is not null then return jsonb_build_object('status','refused','reason',v_reason); end if;
  return public.legacy_wave_fence_wave_finish(p_player_id,p_wave_id,p_survived,p_ships_sunk,p_loot_base,p_loot_per_wave,p_loot_per_house,p_point_loot_base,p_boss_every,p_boss_multiplier,p_restart_back);
end;
$$;
comment on function public.wave_finish(uuid,uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer) is
  'Guarded legacy entry only. Persisted shared targets and managed new legacy control use canonical sessions; retained closed personal finish keeps its original source. Exact old signature/defaults preserved.';
revoke all on function public.wave_finish(uuid,uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.wave_finish(uuid,uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer) to service_role;

do $$ begin
  if to_regprocedure('public.legacy_wave_fence_wave_join(uuid,uuid)') is null then
    alter function public.wave_join(uuid,uuid) rename to legacy_wave_fence_wave_join;
  end if;
end; $$;
revoke all on function public.legacy_wave_fence_wave_join(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.wave_join(p_player_id uuid, p_wave_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_reason text;
begin
  v_reason:=public.legacy_wave_fence_gate_locked(p_player_id,null,null,p_wave_id);
  if v_reason is not null then return jsonb_build_object('status','refused','reason',v_reason); end if;
  return public.legacy_wave_fence_wave_join(p_player_id,p_wave_id);
end;
$$;
comment on function public.wave_join(uuid,uuid) is
  'Guarded legacy entry only. Persisted shared targets and managed new legacy control use canonical sessions; retained closed personal finish keeps its original source. Exact old signature/defaults preserved.';
revoke all on function public.wave_join(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.wave_join(uuid,uuid) to service_role;

do $$ begin
  if to_regprocedure('public.legacy_wave_fence_wave_start(uuid,text,text,uuid,integer,integer,integer,integer,integer,text,numeric,numeric)') is null then
    alter function public.wave_start(uuid,text,text,uuid,integer,integer,integer,integer,integer,text,numeric,numeric) rename to legacy_wave_fence_wave_start;
  end if;
end; $$;
revoke all on function public.legacy_wave_fence_wave_start(uuid,text,text,uuid,integer,integer,integer,integer,integer,text,numeric,numeric) from public,anon,authenticated,service_role;

create or replace function public.wave_start(p_player_id uuid, p_action_uid text, p_place text, p_island_owner uuid, p_seed integer, p_countdown_seconds integer, p_minimum_seconds integer, p_maximum_seconds integer, p_highest_wave integer, p_weather_kind text, p_weather_ships numeric, p_weather_fog numeric)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_reason text;
begin
  v_reason:=public.legacy_wave_fence_gate_locked(p_player_id,p_place,p_island_owner,null);
  if v_reason is not null then return jsonb_build_object('status','refused','reason',v_reason); end if;
  return public.legacy_wave_fence_wave_start(p_player_id,p_action_uid,p_place,p_island_owner,p_seed,p_countdown_seconds,p_minimum_seconds,p_maximum_seconds,p_highest_wave,p_weather_kind,p_weather_ships,p_weather_fog);
end;
$$;
comment on function public.wave_start(uuid,text,text,uuid,integer,integer,integer,integer,integer,text,numeric,numeric) is
  'Guarded legacy entry only. Persisted shared targets and managed new legacy control use canonical sessions; retained closed personal finish keeps its original source. Exact old signature/defaults preserved.';
revoke all on function public.wave_start(uuid,text,text,uuid,integer,integer,integer,integer,integer,text,numeric,numeric) from public,anon,authenticated,service_role;
grant execute on function public.wave_start(uuid,text,text,uuid,integer,integer,integer,integer,integer,text,numeric,numeric) to service_role;

do $$ begin
  if to_regprocedure('public.legacy_wave_fence_wave_revive(uuid,uuid,text,integer,text,integer,integer)') is null then
    alter function public.wave_revive(uuid,uuid,text,integer,text,integer,integer) rename to legacy_wave_fence_wave_revive;
  end if;
end; $$;
revoke all on function public.legacy_wave_fence_wave_revive(uuid,uuid,text,integer,text,integer,integer) from public,anon,authenticated,service_role;

create or replace function public.wave_revive(p_player_id uuid, p_wave_id uuid, p_fallen text, p_down_at integer, p_action_uid text, p_base integer, p_per_wave integer)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_reason text;
begin
  v_reason:=public.legacy_wave_fence_gate_locked(p_player_id,null,null,p_wave_id);
  if v_reason is not null then return jsonb_build_object('status','refused','reason',v_reason); end if;
  return public.legacy_wave_fence_wave_revive(p_player_id,p_wave_id,p_fallen,p_down_at,p_action_uid,p_base,p_per_wave);
end;
$$;
comment on function public.wave_revive(uuid,uuid,text,integer,text,integer,integer) is
  'Guarded legacy entry only. Persisted shared targets and managed new legacy control use canonical sessions; retained closed personal finish keeps its original source. Exact old signature/defaults preserved.';
revoke all on function public.wave_revive(uuid,uuid,text,integer,text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.wave_revive(uuid,uuid,text,integer,text,integer,integer) to service_role;

do $$ begin
  if to_regprocedure('public.legacy_wave_fence_wave_revive_charge(uuid,uuid,text,integer,text,integer,integer)') is null then
    alter function public.wave_revive_charge(uuid,uuid,text,integer,text,integer,integer) rename to legacy_wave_fence_wave_revive_charge;
  end if;
end; $$;
revoke all on function public.legacy_wave_fence_wave_revive_charge(uuid,uuid,text,integer,text,integer,integer) from public,anon,authenticated,service_role;

create or replace function public.wave_revive_charge(p_player_id uuid, p_wave_id uuid, p_fallen text, p_down_at integer, p_action_uid text, p_base integer, p_per_wave integer)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_reason text;
begin
  v_reason:=public.legacy_wave_fence_gate_locked(p_player_id,null,null,p_wave_id);
  if v_reason is not null then return jsonb_build_object('status','refused','reason',v_reason); end if;
  return public.legacy_wave_fence_wave_revive_charge(p_player_id,p_wave_id,p_fallen,p_down_at,p_action_uid,p_base,p_per_wave);
end;
$$;
comment on function public.wave_revive_charge(uuid,uuid,text,integer,text,integer,integer) is
  'Guarded legacy entry only. Persisted shared targets and managed new legacy control use canonical sessions; retained closed personal finish keeps its original source. Exact old signature/defaults preserved.';
revoke all on function public.wave_revive_charge(uuid,uuid,text,integer,text,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.wave_revive_charge(uuid,uuid,text,integer,text,integer,integer) to service_role;

CREATE OR REPLACE FUNCTION public.recovery_wave_reward_is_closed(p_wave_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.wave_runs r
    join public.recovery_wave_states s on s.wave_id=r.id
    where r.id=p_wave_id
      and not exists(select 1 from public.island_wave_accounting a where a.wave_id=r.id)
      and s.recovery_version=1 and s.wave_protocol=2
      and s.island_owner=r.island_owner and s.closed_at is not null
      and jsonb_typeof(s.closed_hp)='object'
      and s.initial_snapshot->>'waveId'=r.id::text
      and s.initial_snapshot->>'islandEpoch'=s.reset_epoch::text
      and s.initial_snapshot->>'recoveryVersion'='1'
      and s.initial_snapshot->>'waveProtocol'='2'
      and r.finished_at is not null and r.survived is not null
      and r.loot between 0 and 1000000 and (r.survived or r.loot=0)
      and (not r.expired or (not r.survived and r.loot=0))
  );
$function$
;
revoke all on function public.recovery_wave_finish_before_reward_recovery(uuid,uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer,uuid,text,integer,bigint,bigint,jsonb,jsonb) from public,anon,authenticated,service_role;
comment on function public.recovery_wave_reward_is_closed(uuid) is
  'Valid retained protocol-2 personal reward source only; shared accounting attempts never enter or block legacy private recovery. Existing saved legacy obligations survive personal adoption.';
