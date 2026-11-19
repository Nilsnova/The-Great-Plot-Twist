-- MP-ECO-07: free personal edits share the global paid/free operation namespace.
-- Claims precede personal locks; every refused new claim rolls back with its effects.
-- No personal history is inferred or backfilled, and no route/admission is activated.

alter table public.personal_captain_operations
  add column if not exists operation_id uuid unique
  references public.island_economy_operations(id) on delete restrict;
comment on column public.personal_captain_operations.operation_id is
  'Exact null-account personal root. Null is unregistered history requiring reviewed mapping before replay; never inferred from current profile state.';

create or replace function public.personal_captain_change(
  p_player_id uuid,p_action_uid text,p_action text,p_value text,p_expected_revision numeric
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_old public.personal_captain_operations;
  v_revision numeric;
  v_fingerprint jsonb;
  v_claim jsonb;
  v_result jsonb;
begin
  if p_expected_revision is null then
    return jsonb_build_object('status','refused','reason','captain_context_required');
  end if;
  if p_expected_revision::text in ('NaN','Infinity','-Infinity')
    or p_expected_revision<>trunc(p_expected_revision) or p_expected_revision<0 then
    raise exception 'invalid_captain_revision';
  end if;
  if p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
    or p_action is null or p_action not in ('role','learn','respec')
    or (p_action='respec' and p_value is not null) then
    raise exception 'invalid_captain_action';
  end if;
  v_fingerprint := jsonb_build_object('action',p_action,'value',p_value,
    'expectedRevision',trunc(p_expected_revision)::text);
  v_claim := public.island_economy_claim_operation_locked(
    p_player_id,null,null,p_action_uid,'captain:'||p_action,v_fingerprint);
  if v_claim->>'status' not in ('claimed','replay') then
    v_result := v_claim;
    raise sqlstate 'P0701';
  end if;
  select * into v_old from public.personal_captain_operations
    where player_id=p_player_id and action_uid=p_action_uid;
  if found and v_old.operation_id is null then
    v_result := jsonb_build_object('status','refused','reason','captain_conversion_required');
    raise sqlstate 'P0701';
  end if;
  if v_claim->>'status'='replay' and v_old.id is null then
    raise exception 'captain_operation_incomplete';
  end if;
  if v_old.id is not null and (v_old.operation_id is distinct from (v_claim->>'operationId')::uuid
    or v_old.fingerprint<>v_fingerprint) then
    v_result := jsonb_build_object('status','refused','reason','action_conflict');
    raise sqlstate 'P0701';
  end if;
  perform 1 from public.profiles where id=p_player_id for no key update;
  if not found or not exists (select 1 from public.personal_captain_profiles
    where player_id=p_player_id) then
    v_result := jsonb_build_object('status','refused','reason','captain_context_required');
    raise sqlstate 'P0701';
  end if;
  perform public.personal_captain_lock_state_locked(p_player_id);
  if v_old.id is not null then
    return jsonb_build_object('status','done','repeat',true,'receipt',v_old.result,
      'profile',public.personal_captain_snapshot_locked(p_player_id));
  end if;
  select revision into v_revision from public.personal_captain_profiles where player_id=p_player_id;
  if v_revision<>p_expected_revision then
    v_result := jsonb_build_object('status','refused','reason','captain_revision_mismatch');
    raise sqlstate 'P0701';
  end if;
  if p_action='learn' and not exists (select 1 from public.personal_captain_profiles as profile,
    jsonb_array_elements(profile.rules->'tree') as t(entry)
    where profile.player_id=p_player_id and entry->>'skill'=p_value) then
    v_result := jsonb_build_object('status','refused','reason','bad_skill');
    raise sqlstate 'P0701';
  end if;
  v_result := public.personal_captain_change(p_player_id,p_action_uid,p_action,p_value);
  if v_result->>'status'<>'done' then
    raise sqlstate 'P0701';
  end if;
  update public.personal_captain_operations set fingerprint=v_fingerprint,
    operation_id=(v_claim->>'operationId')::uuid
    where player_id=p_player_id and action_uid=p_action_uid;
  return v_result;
exception when sqlstate 'P0701' then
  -- This block's savepoint removes the new root and all effects before returning a refusal.
  return v_result;
end;
$$;
comment on function public.personal_captain_change(uuid,text,text,text,numeric) is
  'Server-only revision-checked free edit. Null-scope global root precedes personal locks; exact replay precedes revision/phase checks. All refused claims roll back. Unregistered personal history requires explicit mapping.';
revoke all on function public.personal_captain_change(uuid,text,text,text,numeric)
  from public,anon,authenticated,service_role;
grant execute on function public.personal_captain_change(uuid,text,text,text,numeric) to service_role;
