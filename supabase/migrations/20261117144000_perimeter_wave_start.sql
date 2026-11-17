-- Public start fence for perimeter policy; the existing recovery lifecycle stays internal.
-- No activation or data rewrite. Owner-first matches recovery_wave_start and wave_start;
-- neither start function acquires a player wallet before that owner lock.
create or replace function public.perimeter_wave_start(
  p_player_id uuid, p_action_uid text, p_place text, p_island_owner uuid,
  p_seed integer, p_countdown_seconds integer, p_minimum_seconds integer,
  p_maximum_seconds integer, p_highest_wave integer, p_weather_kind text,
  p_weather_ships numeric, p_weather_fog numeric,
  p_rules text[], p_snapshot_template jsonb, p_admit_v1 boolean, p_protocol smallint,
  p_wall_client_version smallint default 0
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_run public.wave_runs;
  v_repeat boolean;
  v_recovery_version smallint;
  v_policy public.island_wall_policy;
begin
  if p_player_id is null or p_action_uid is null or p_rules is null
     or p_protocol is null or p_protocol not in (1,2) then
    raise exception 'bad_recovery_start';
  end if;
  if p_place = 'island' and p_island_owner is not null then
    perform 1 from public.islands where player_id=p_island_owner for update;
    if not found then
      return jsonb_build_object('status','refused','reason','no_such_island');
    end if;
    if p_player_id <> p_island_owner and not exists (
      select 1 from public.island_members where island_owner=p_island_owner
        and player_id=p_player_id and left_at is null
    ) then
      return jsonb_build_object('status','refused','reason','not_member');
    end if;
  end if;
  -- Permission precedes lookup; a UID can replay only its original target context.
  select * into v_run from public.wave_runs
    where started_by=p_player_id and action_uid=p_action_uid;
  v_repeat := found;
  if v_repeat and (v_run.place is distinct from p_place
      or v_run.island_owner is distinct from p_island_owner) then
    return jsonb_build_object('status','refused','reason','input_conflict');
  end if;
  if not v_repeat and p_place = 'island' and p_island_owner is not null then
    select * into v_policy from public.island_wall_policy where island_owner=p_island_owner;
    if found then
      if v_policy.rule_version <> 1 or v_policy.capacity <> 128 then
        raise exception 'unsupported_wall_policy';
      end if;
      if p_protocol <> 2 or p_wall_client_version is distinct from 1 then
        return jsonb_build_object('status','refused','reason','client_update_required');
      end if;
      select recovery_version into v_recovery_version from public.island_recovery_state
        where island_owner=p_island_owner;
      if coalesce(v_recovery_version,0) <> 1
         and not (p_admit_v1 is true and coalesce('structure_recovery' = any(p_rules),false)) then
        return jsonb_build_object('status','refused','reason','structure_recovery_required');
      end if;
      if array_position(p_rules,null) is not null or not coalesce('pathing' = any(p_rules),false)
         or jsonb_typeof(p_snapshot_template) is distinct from 'object'
         or p_snapshot_template -> 'wallRuleVersion' is distinct from '1'::jsonb
         or p_snapshot_template -> 'wallCapacity' is distinct from '128'::jsonb
         or p_snapshot_template -> 'configVersion' is distinct from '1'::jsonb
         or p_snapshot_template #> '{createWave,pathing}' is distinct from 'true'::jsonb
         or p_snapshot_template #> '{createWave,perimeterWalls}' is distinct from 'true'::jsonb then
        return jsonb_build_object('status','refused','reason','perimeter_rules_required');
      end if;
    end if;
  end if;
  -- Immutable retries keep their original snapshot; the delegate validates revision and identities.
  return public.recovery_wave_start(
    p_player_id,p_action_uid,p_place,p_island_owner,p_seed,p_countdown_seconds,
    p_minimum_seconds,p_maximum_seconds,p_highest_wave,p_weather_kind,p_weather_ships,
    p_weather_fog,p_rules,p_snapshot_template,p_admit_v1,p_protocol);
end;
$$;
revoke all on function public.perimeter_wave_start(uuid,text,text,uuid,integer,integer,integer,
  integer,integer,text,numeric,numeric,text[],jsonb,boolean,smallint,smallint)
  from public,anon,authenticated,service_role;
grant execute on function public.perimeter_wave_start(uuid,text,text,uuid,integer,integer,integer,
  integer,integer,text,numeric,numeric,text[],jsonb,boolean,smallint,smallint) to service_role;
comment on function public.perimeter_wave_start(uuid,text,text,uuid,integer,integer,integer,
  integer,integer,text,numeric,numeric,text[],jsonb,boolean,smallint,smallint) is
  'Owner-locked perimeter admission, client capability and immutable target-context replay fence; legacy lifecycle remains delegated.';
