-- MP-ECO-07 revision-checked free personal edits for the standalone Captain API.
-- Uses the existing private edit implementation inside the same personal-state lock.

create or replace function public.personal_captain_change(
  p_player_id uuid,p_action_uid text,p_action text,p_value text,p_expected_revision numeric
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_old public.personal_captain_operations;
  v_revision numeric;
  v_fingerprint jsonb := jsonb_build_object('action',p_action,'value',p_value,
    'expectedRevision',p_expected_revision::text);
  v_result jsonb;
begin
  if p_expected_revision is null then
    return jsonb_build_object('status','refused','reason','captain_context_required');
  end if;
  if p_expected_revision::text in ('NaN','Infinity','-Infinity')
    or p_expected_revision<>trunc(p_expected_revision) or p_expected_revision<0 then
    raise exception 'invalid_captain_revision';
  end if;
  perform 1 from public.profiles where id=p_player_id for no key update;
  if not found or not exists (select 1 from public.personal_captain_profiles
    where player_id=p_player_id) then
    return jsonb_build_object('status','refused','reason','captain_context_required');
  end if;
  perform public.personal_captain_lock_state_locked(p_player_id);
  select * into v_old from public.personal_captain_operations
    where player_id=p_player_id and action_uid=p_action_uid;
  if found then
    if v_old.fingerprint<>v_fingerprint then
      return jsonb_build_object('status','refused','reason','action_conflict');
    end if;
    return jsonb_build_object('status','done','repeat',true,'receipt',v_old.result,
      'profile',public.personal_captain_snapshot_locked(p_player_id));
  end if;
  select revision into v_revision from public.personal_captain_profiles where player_id=p_player_id;
  if v_revision<>p_expected_revision then
    return jsonb_build_object('status','refused','reason','captain_revision_mismatch');
  end if;
  if p_action='learn' and not exists (select 1 from public.personal_captain_profiles as profile,
    jsonb_array_elements(profile.rules->'tree') as t(entry)
    where profile.player_id=p_player_id and entry->>'skill'=p_value) then
    return jsonb_build_object('status','refused','reason','bad_skill');
  end if;
  v_result := public.personal_captain_change(p_player_id,p_action_uid,p_action,p_value);
  if v_result->>'status'='done' then
    -- Complete the new receipt fingerprint before the transaction becomes visible.
    update public.personal_captain_operations set fingerprint=v_fingerprint
      where player_id=p_player_id and action_uid=p_action_uid;
  end if;
  return v_result;
end;
$$;
comment on function public.personal_captain_change(uuid,text,text,text,numeric) is
  'Server-only personal edit. Retry matches original expected revision and returns its immutable effect plus fresh state; a new stale request mutates nothing. No island, payer or coin fields.';

revoke all on function public.personal_captain_change(uuid,text,text,text)
  from public,anon,authenticated,service_role;
revoke all on function public.personal_captain_change(uuid,text,text,text,numeric)
  from public,anon,authenticated,service_role;
grant execute on function public.personal_captain_change(uuid,text,text,text,numeric) to service_role;
