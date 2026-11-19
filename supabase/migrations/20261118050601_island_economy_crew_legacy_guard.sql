-- MP-ECO-06: preserve personal legacy hires and forbid private fallback after admission.
-- The exact old body is private; reapplication never captures this wrapper as its source.
do $$
declare v_definition text;
begin
  if to_regprocedure('public.island_hire_legacy_personal(uuid,text,text,integer,integer)') is null then
    v_definition := pg_get_functiondef(to_regprocedure('public.island_hire(uuid,text,text,integer,integer)'));
    if v_definition is null or position('island_hire_legacy_personal' in v_definition) > 0 then
      raise exception 'crew_legacy_source_missing';
    end if;
    execute regexp_replace(v_definition,'FUNCTION public\.island_hire\(',
      'FUNCTION public.island_hire_legacy_personal(');
  end if;
  revoke all on function public.island_hire_legacy_personal(uuid,text,text,integer,integer)
    from public, anon, authenticated, service_role;
end;
$$;

-- Legacy hire always targets the actor's home; shared crew requires an explicit account/epoch.
create or replace function public.island_hire(
  p_player_id uuid, p_crew text, p_action_uid text, p_price integer, p_max integer
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.island_treasury_lock_scope(p_player_id);
  if exists (select 1 from public.island_economy_state where island_owner = p_player_id) then
    return jsonb_build_object('status','refused','reason','economy_context_required');
  end if;
  return public.island_hire_legacy_personal(p_player_id,p_crew,p_action_uid,p_price,p_max);
end;
$$;
comment on function public.island_hire(uuid, text, text, integer, integer) is
  'Legacy personal hire only. Class-zero scope serializes with admission; every admitted state, including paused, refuses before old wallet locks. The original body has no public execute grant.';
revoke all on function public.island_hire(uuid,text,text,integer,integer) from public, anon, authenticated, service_role;
grant execute on function public.island_hire(uuid,text,text,integer,integer) to service_role;
