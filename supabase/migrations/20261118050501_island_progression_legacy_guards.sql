-- Keep personal legacy progression RPCs outside every admitted shared island.
-- Used by old routes until shared progression is explicitly integrated.

-- Capture only original bodies, once; old migrations may redefine public wrappers
-- when the complete chain is reapplied, but must never replace the private aliases.
do $$
declare v_item record; v_definition text;
begin
  for v_item in select * from (values
    ('island_research','uuid,uuid,text,text,integer,integer,integer,text,boolean'),
    ('island_specialise','uuid,uuid,text,text,text,text,integer'),
    ('island_tower_tree','uuid,uuid,text,text,text,integer,text,integer,integer,integer'),
    ('island_wreck_repair','uuid,uuid,integer,text,integer,integer')
  ) as functions(name, arguments) loop
    if to_regprocedure('public.'||v_item.name||'_legacy_personal('||v_item.arguments||')') is null then
      v_definition := pg_get_functiondef(to_regprocedure('public.'||v_item.name||'('||v_item.arguments||')'));
      if v_definition is null or position(v_item.name||'_legacy_personal' in v_definition) > 0 then
        raise exception 'progression_legacy_source_missing';
      end if;
      execute regexp_replace(v_definition,'FUNCTION public\.'||v_item.name||'\(',
        'FUNCTION public.'||v_item.name||'_legacy_personal(');
    end if;
    execute format('revoke all on function public.%I(%s) from public, anon, authenticated, service_role',
      v_item.name||'_legacy_personal',v_item.arguments);
  end loop;
end;
$$;

-- The shared scope guard precedes every legacy personal wallet lock and admission.
create or replace function public.island_research(
  p_player_id uuid, p_island_owner uuid, p_branch text, p_action_uid text,
  p_price integer, p_unlock_wave integer, p_tier integer, p_choice text, p_change boolean
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.island_treasury_lock_scope(p_island_owner);
  if exists (select 1 from public.island_economy_state where island_owner = p_island_owner) then
    return jsonb_build_object('status','refused','reason','economy_context_required');
  end if;
  return public.island_research_legacy_personal(p_player_id,p_island_owner,p_branch,
    p_action_uid,p_price,p_unlock_wave,p_tier,p_choice,p_change);
end;
$$;
comment on function public.island_research(uuid, uuid, text, text, integer, integer, integer, text, boolean) is
  'Legacy personal research only. Every admitted shared mode, including paused mode, requires the shared operation protocol.';

create or replace function public.island_specialise(
  p_player_id uuid, p_island_owner uuid, p_plot text, p_branch text, p_spec text,
  p_action_uid text, p_price integer
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.island_treasury_lock_scope(p_island_owner);
  if exists (select 1 from public.island_economy_state where island_owner = p_island_owner) then
    return jsonb_build_object('status','refused','reason','economy_context_required');
  end if;
  return public.island_specialise_legacy_personal(p_player_id,p_island_owner,p_plot,
    p_branch,p_spec,p_action_uid,p_price);
end;
$$;
comment on function public.island_specialise(uuid, uuid, text, text, text, text, integer) is
  'Legacy personal skill and free house role selection, refused for all admitted shared islands before any private mutation.';

create or replace function public.island_tower_tree(
  p_player_id uuid, p_island_owner uuid, p_plot text, p_kind text, p_path text,
  p_tier integer, p_action_uid text, p_price integer, p_unlock_wave integer, p_level integer
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.island_treasury_lock_scope(p_island_owner);
  if exists (select 1 from public.island_economy_state where island_owner = p_island_owner) then
    return jsonb_build_object('status','refused','reason','economy_context_required');
  end if;
  return public.island_tower_tree_legacy_personal(p_player_id,p_island_owner,p_plot,
    p_kind,p_path,p_tier,p_action_uid,p_price,p_unlock_wave,p_level);
end;
$$;
comment on function public.island_tower_tree(uuid, uuid, text, text, text, integer, text, integer, integer, integer) is
  'Legacy personal tree upgrades only; shared funds cannot fall back to a private wallet.';

create or replace function public.island_wreck_repair(
  p_player_id uuid, p_island_owner uuid, p_amount integer, p_action_uid text,
  p_goal integer, p_unlock_wave integer
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.island_treasury_lock_scope(p_island_owner);
  if exists (select 1 from public.island_economy_state where island_owner = p_island_owner) then
    return jsonb_build_object('status','refused','reason','economy_context_required');
  end if;
  return public.island_wreck_repair_legacy_personal(p_player_id,p_island_owner,p_amount,
    p_action_uid,p_goal,p_unlock_wave);
end;
$$;
comment on function public.island_wreck_repair(uuid, uuid, integer, text, integer, integer) is
  'Legacy private wreck gifts outside admitted islands; shared final contributions use atomic exact-remaining funding.';

revoke all on function public.island_research(uuid, uuid, text, text, integer, integer, integer, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.island_specialise(uuid, uuid, text, text, text, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.island_tower_tree(uuid, uuid, text, text, text, integer, text, integer, integer, integer) from public, anon, authenticated, service_role;
revoke all on function public.island_wreck_repair(uuid, uuid, integer, text, integer, integer) from public, anon, authenticated, service_role;
grant execute on function public.island_research(uuid, uuid, text, text, integer, integer, integer, text, boolean) to service_role;
grant execute on function public.island_specialise(uuid, uuid, text, text, text, text, integer) to service_role;
grant execute on function public.island_tower_tree(uuid, uuid, text, text, text, integer, text, integer, integer, integer) to service_role;
grant execute on function public.island_wreck_repair(uuid, uuid, integer, text, integer, integer) to service_role;
