-- MP-ECO-04: preserve personal legacy RPC bodies while excluding admitted islands.
-- The shared scope guard precedes legacy wallet/island locks and admission.

do $$
declare
  v_item record;
  v_definition text;
begin
  for v_item in select * from (values
    ('island_build','uuid,uuid,text,text,text,integer'),
    ('island_upgrade','uuid,uuid,text,text,integer[],integer'),
    ('island_demolish','uuid,uuid,text,text,jsonb'),
    ('island_demolish_quote','uuid,uuid,text,jsonb')
  ) as functions(name, arguments) loop
    if to_regprocedure('public.'||v_item.name||'_legacy_personal('||v_item.arguments||')') is null then
      v_definition := pg_get_functiondef(to_regprocedure('public.'||v_item.name||'('||v_item.arguments||')'));
      if v_definition is null or position(v_item.name||'_legacy_personal' in v_definition) > 0 then
        raise exception 'construction_legacy_source_missing';
      end if;
      execute regexp_replace(v_definition,'FUNCTION public\.'||v_item.name||'\(',
        'FUNCTION public.'||v_item.name||'_legacy_personal(');
    end if;
    execute format('revoke all on function public.%I(%s) from public, anon, authenticated, service_role',
      v_item.name||'_legacy_personal',v_item.arguments);
  end loop;
end;
$$;

-- Admission and a legacy build serialize before the old wallet locks.
create or replace function public.island_build(
  p_player_id uuid, p_island_owner uuid, p_plot text, p_building_type text,
  p_action_uid text, p_price integer
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.island_treasury_lock_scope(p_island_owner);
  if exists (select 1 from public.island_economy_state where island_owner = p_island_owner) then
    return jsonb_build_object('status','refused','reason','economy_context_required');
  end if;
  return public.island_build_legacy_personal(p_player_id,p_island_owner,p_plot,
    p_building_type,p_action_uid,p_price);
end;
$$;
comment on function public.island_build(uuid, uuid, text, text, text, integer) is
  'Legacy personal build, unchanged outside admitted shared islands. Class-zero scope serializes legacy preflight with admission; the private original body cannot bypass the guard.';

-- An admitted island must use its shared transaction for base-level upgrades.
create or replace function public.island_upgrade(
  p_player_id uuid, p_island_owner uuid, p_plot text, p_action_uid text,
  p_prices integer[], p_unlocked_level integer
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.island_treasury_lock_scope(p_island_owner);
  if exists (select 1 from public.island_economy_state where island_owner = p_island_owner) then
    return jsonb_build_object('status','refused','reason','economy_context_required');
  end if;
  return public.island_upgrade_legacy_personal(p_player_id,p_island_owner,p_plot,
    p_action_uid,p_prices,p_unlocked_level);
end;
$$;
comment on function public.island_upgrade(uuid, uuid, text, text, integer[], integer) is
  'Legacy personal base-level upgrade, refused for every admitted shared mode before taking legacy wallet locks.';

-- Exclude private-payer and catalogue-fallback refunds after admission.
create or replace function public.island_demolish(
  p_player_id uuid, p_island_owner uuid, p_plot text, p_action_uid text, p_prices jsonb
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.island_treasury_lock_scope(p_island_owner);
  if exists (select 1 from public.island_economy_state where island_owner = p_island_owner) then
    return jsonb_build_object('status','refused','reason','economy_context_required');
  end if;
  return public.island_demolish_legacy_personal(p_player_id,p_island_owner,p_plot,p_action_uid,p_prices);
end;
$$;
comment on function public.island_demolish(uuid, uuid, text, text, jsonb) is
  'Legacy personal refunds remain unchanged for legacy islands; admitted islands cannot mint private catalogue-based refunds.';

-- A shared quote requires actual shared payments rather than an old personal split.
create or replace function public.island_demolish_quote(
  p_player_id uuid, p_island_owner uuid, p_plot text, p_prices jsonb
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.island_treasury_lock_scope(p_island_owner);
  if exists (select 1 from public.island_economy_state where island_owner = p_island_owner) then
    return jsonb_build_object('status','refused','reason','economy_context_required');
  end if;
  return public.island_demolish_quote_legacy_personal(p_player_id,p_island_owner,p_plot,p_prices);
end;
$$;
comment on function public.island_demolish_quote(uuid, uuid, text, jsonb) is
  'Legacy private-payer refund quote only; a shared island requires its actual shared payment basis.';

revoke all on function public.island_build(uuid, uuid, text, text, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.island_upgrade(uuid, uuid, text, text, integer[], integer) from public, anon, authenticated, service_role;
revoke all on function public.island_demolish(uuid, uuid, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.island_demolish_quote(uuid, uuid, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.island_build(uuid, uuid, text, text, text, integer) to service_role;
grant execute on function public.island_upgrade(uuid, uuid, text, text, integer[], integer) to service_role;
grant execute on function public.island_demolish(uuid, uuid, text, text, jsonb) to service_role;
grant execute on function public.island_demolish_quote(uuid, uuid, text, jsonb) to service_role;
