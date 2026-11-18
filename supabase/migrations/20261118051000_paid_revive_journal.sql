-- A paid recovery revival and its replay event commit together (issue #466).
-- Used by POST /api/waves/revive. Protocol-1 payments keep their existing implementation.
-- As finish/paid repair do: payer wallet, then sorted islands, then recovery/wave/participant.

do $$
begin
  if to_regprocedure('public.wave_revive_charge(uuid,uuid,text,integer,text,integer,integer)') is null then
    alter function public.wave_revive(uuid,uuid,text,integer,text,integer,integer)
      rename to wave_revive_charge;
  end if;
end;
$$;

-- Old clients must never commit a charge-only revival for a saved protocol-2 wave.
create or replace function public.wave_revive(
  p_player_id uuid, p_wave_id uuid, p_fallen text, p_down_at integer,
  p_action_uid text, p_base integer, p_per_wave integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (select 1 from public.recovery_wave_states where wave_id=p_wave_id) then
    return jsonb_build_object('status','refused','reason','client_update_required');
  end if;
  return public.wave_revive_charge(p_player_id,p_wave_id,p_fallen,p_down_at,p_action_uid,p_base,p_per_wave);
end;
$$;

revoke all on function public.wave_revive(uuid,uuid,text,integer,text,integer,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.wave_revive(uuid,uuid,text,integer,text,integer,integer) to service_role;
comment on function public.wave_revive(uuid,uuid,text,integer,text,integer,integer) is
  'Legacy paid revival. A saved recovery wave refuses client_update_required before charging; use recovery_wave_revive for its atomic payment and journal effect.';

-- One server-authored revival per paid fall. No client input counter is consumed.
create or replace function public.recovery_wave_revive(
  p_player_id uuid, p_wave_id uuid, p_fallen text, p_down_at integer,
  p_action_uid text, p_base integer, p_per_wave integer,
  p_x double precision, p_z double precision
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_state public.island_recovery_state;
  v_wave public.recovery_wave_states;
  v_run public.wave_runs;
  v_participant public.recovery_wave_participants;
  v_receipt public.captain_revives;
  v_paid jsonb;
  v_captain jsonb;
  v_now timestamptz;
  v_tick integer;
  v_ref text;
  v_journaled boolean;
begin
  if p_player_id is null or p_wave_id is null
     or p_fallen is null or p_fallen !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     or p_down_at is null or p_down_at not between 0 and 18000
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_x is null or p_x not between -499.999 and 499.999
     or p_z is null or p_z not between -499.999 and 499.999 then
    raise exception 'bad_recovery_revive';
  end if;
  p_fallen := lower(p_fallen);
  select island_owner into v_owner from public.recovery_wave_states where wave_id=p_wave_id;
  if not found then return jsonb_build_object('status','refused','reason','no_such_wave'); end if;

  perform 1 from public.wallets where player_id=p_player_id for update;
  if not found then return jsonb_build_object('status','refused','reason','player_not_set_up'); end if;
  perform 1 from public.islands where player_id in (p_player_id,v_owner) order by player_id for update;
  select * into v_state from public.island_recovery_state where island_owner=v_owner for update;
  select * into v_wave from public.recovery_wave_states where wave_id=p_wave_id for update;
  select * into v_run from public.wave_runs where id=p_wave_id for update;
  select * into v_participant from public.recovery_wave_participants
   where wave_id=p_wave_id and player_id=p_player_id for update;
  if not found then return jsonb_build_object('status','refused','reason','not_in_wave'); end if;

  v_ref := 'revive:' || p_action_uid;
  select * into v_receipt from public.captain_revives where player_id=p_player_id and ref=v_ref;
  if found and (v_receipt.wave_id <> p_wave_id or v_receipt.fallen <> p_fallen or v_receipt.down_at <> p_down_at) then
    return jsonb_build_object('status','refused','reason','action_conflict');
  end if;
  select exists(select 1 from public.recovery_wave_events
    where wave_id=p_wave_id and event_kind='captain_revive' and actor_id=p_player_id
      and payload ->> 'reviveRef'=v_ref) into v_journaled;
  -- A committed success stays repeatable after the close or after leaving the island.
  if v_receipt.ref is not null and v_journaled then
    v_paid := public.wave_revive_charge(p_player_id,p_wave_id,p_fallen,p_down_at,p_action_uid,p_base,p_per_wave);
    return v_paid || jsonb_build_object('journaled',true);
  end if;

  v_now := clock_timestamp();
  v_tick := greatest(0,floor(extract(epoch from (v_now-v_run.starts_at))*20)::integer)+1;
  if v_run.id is null or v_wave.closed_at is not null
     or v_state.current_wave_id is distinct from p_wave_id
     or v_state.reset_epoch is distinct from v_wave.reset_epoch
     or v_now < v_run.starts_at
     or greatest(v_tick,v_wave.sealed_through_tick+1) > public.recovery_wave_last_tick(v_run.maximum_seconds) then
    return jsonb_build_object('status','refused','reason','wave_over');
  end if;
  if not exists(select 1 from public.recovery_wave_participants
    where wave_id=p_wave_id and participant_token=p_fallen::uuid) then
    return jsonb_build_object('status','refused','reason','not_in_wave');
  end if;
  select jsonb_build_object('level',captain_level,
    'skills',array(select skill from unnest(captain_skills ||
      case when captain_role is null then '{}'::text[] else array[captain_role] end) as skill
      where skill <> all(array['quick_fix','long_reach','sturdy_planks','master_shipwright','swift_hammer','wide_arc','grand_engineer']::text[])),
    'weapon','musket') into v_captain from public.islands where player_id=p_player_id;
  if v_captain is null then return jsonb_build_object('status','refused','reason','player_not_set_up'); end if;

  v_paid := public.wave_revive_charge(p_player_id,p_wave_id,p_fallen,p_down_at,p_action_uid,p_base,p_per_wave);
  if v_paid ->> 'status' <> 'done' then return v_paid; end if;
  perform public.recovery_wave_append_event_locked(
    p_wave_id,p_player_id,v_participant.participant_token,null,null,null,'captain_revive',v_tick,
    jsonb_build_object('reviveRef',v_ref,'captain',v_captain,'command',jsonb_build_object(
      'type','captain_revive','targetId',p_fallen,'downAt',p_down_at,'x',p_x,'z',p_z)));
  update public.recovery_wave_states set last_activity_at=v_now where wave_id=p_wave_id;
  return v_paid || jsonb_build_object('journaled',true);
end;
$$;

revoke all on function public.recovery_wave_revive(uuid,uuid,text,integer,text,integer,integer,double precision,double precision)
  from public, anon, authenticated, service_role;
grant execute on function public.recovery_wave_revive(uuid,uuid,text,integer,text,integer,integer,double precision,double precision)
  to service_role;
comment on function public.recovery_wave_revive(uuid,uuid,text,integer,text,integer,integer,double precision,double precision) is
  'Pays and journals one recovery-v1 captain revival atomically after the sealed frontier, with server identity/stats and the paid fall tick. A repeated paid action returns journaled true without charging or appending, including after close/leave. Only service_role may call it.';
