-- Close old personal paid-revival entry points for a persisted shared island target.
-- Existing protocol-1 wrapper delegates wave_revive_charge; recovery_wave_revive also
-- takes the same sorted class-zero guards before its own wallet/island/recovery locks.
-- No table, payment reason, producer, free hold authority or browser privilege is added.

create or replace function public.wave_revive_charge(
  p_player_id   uuid,
  p_wave_id     uuid,
  p_fallen      text,
  p_down_at     integer,
  p_action_uid  text,
  p_base        integer,
  p_per_wave    integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_scope_owner uuid;
  v_scope_key bigint;
  v_ref      text;
  v_balance  bigint;
  v_run      public.wave_runs;
  v_joined   public.wave_participants;
  v_done     public.captain_revives;
  v_price    integer;
  v_index    text;
begin
  if p_player_id is null or p_wave_id is null
     or p_fallen is null or p_fallen !~ '^[A-Za-z0-9_.:-]{1,64}$'
     or p_down_at is null or p_down_at < 0 or p_down_at > 100000
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_base is null or p_base < 1 or p_base > 1000
     or p_per_wave is null or p_per_wave < 0 or p_per_wave > 1000 then
    raise exception 'bad_wave_revive';
  end if;
  v_ref := 'revive:' || p_action_uid;

  -- Resolve only the actual target; the helper's own shared island is not its payer.
  select case when place = 'island' then island_owner end into v_scope_owner
    from public.wave_runs where id = p_wave_id;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_wave');
  end if;
  for v_scope_key in
    select distinct hashtextextended('island-economy:' || owner_id::text, 0)
      from unnest(array[p_player_id, v_scope_owner]) owner_id
     where owner_id is not null
     order by 1
  loop
    perform pg_advisory_xact_lock(v_scope_key);
  end loop;
  if exists(select 1 from public.island_economy_state where island_owner = v_scope_owner) then
    return jsonb_build_object('status', 'refused', 'reason', 'economy_context_required');
  end if;

  -- After sorted common scope guards, preserve the legacy wallet-first row order.
  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  -- A repeated click answers what it paid.
  select * into v_done from public.captain_revives where player_id = p_player_id and ref = v_ref;
  if found then
    return jsonb_build_object('status', 'done', 'price', v_done.price, 'balance', v_balance, 'repeat', true);
  end if;

  -- The wave, read without a lock (the finish locks it; the wallet is held already).
  select * into v_run from public.wave_runs where id = p_wave_id;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_wave');
  end if;
  -- Never use a changed target with scope guards acquired for another origin.
  if (case when v_run.place = 'island' then v_run.island_owner end)
     is distinct from v_scope_owner then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_wave');
  end if;
  if v_run.place = 'island' and v_run.island_owner <> p_player_id and not exists (
    select 1 from public.island_members
     where island_owner = v_run.island_owner and player_id = p_player_id and left_at is null
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'not_member');
  end if;
  select * into v_joined from public.wave_participants where wave_id = p_wave_id and player_id = p_player_id;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'not_in_wave');
  end if;
  if v_joined.finished_at is not null
     or now() < v_run.starts_at
     or now() > v_run.starts_at + make_interval(secs => v_run.maximum_seconds) then
    return jsonb_build_object('status', 'refused', 'reason', 'wave_over');
  end if;

  v_price := p_base + p_per_wave * v_run.wave;
  -- A Tavern on the island (a house of level 2 or more with the role tavern,
  -- docs/GAME-V3.md "Houses") takes 25% off, rounded down. The server cannot
  -- see where the captains stand, so the discount is for the whole island.
  if v_run.place = 'island' and exists (
    select 1 from public.islet_buildings
     where player_id = v_run.island_owner and building_type = 'house'
       and spec = 'tavern' and level >= 2
  ) then
    v_price := greatest(1, v_price * (100 - 25) / 100);
  end if;
  if v_balance < v_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', v_price);
  end if;

  -- The fall first (rule 6): a helper who comes second waits here for the first
  -- one's commit, then is refused, before any coin moves.
  begin
    insert into public.captain_revives (player_id, ref, wave_id, fallen, down_at, price)
    values (p_player_id, v_ref, p_wave_id, p_fallen, p_down_at, v_price);
  exception when unique_violation then
    get stacked diagnostics v_index = constraint_name;
    if v_index <> 'captain_revives_one_per_fall' then
      raise;
    end if;
    return jsonb_build_object('status', 'refused', 'reason', 'already_up');
  end;
  v_balance := public.apply_wallet_transaction(p_player_id, -v_price, 'captain_revive', v_ref);

  return jsonb_build_object('status', 'done', 'price', v_price, 'balance', v_balance, 'repeat', false);
end;
$$;

revoke all on function public.wave_revive_charge(uuid, uuid, text, integer, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.wave_revive_charge(uuid, uuid, text, integer, text, integer, integer)
  to service_role;

comment on function public.wave_revive_charge(uuid, uuid, text, integer, text, integer, integer) is
  'Pays for helping a fallen captain up in a pirate wave (docs/GAME-V3.md section 3): p_base + p_per_wave x the wave number, from the helper''s wallet (reason captain_revive, ref revive:<actionUid>). Takes sorted common actor/target scope guards, refuses an admitted shared target, then locks the personal wallet first among rows. Only a player in the wave who has not finished it, while it runs; on somebody else''s island only a member of that game. A repeated actionUid answers {status: done, repeat: true} with the price it paid. One fall (p_fallen at tick p_down_at) is paid for once: a second helper is refused already_up. Refuses player_not_set_up, no_such_wave, not_member, not_in_wave, wave_over, insufficient_funds and already_up, with nothing changed. Raises bad_wave_revive for a bad argument. On an island with a Tavern (a house of level 2 or more with the role tavern) the price is 25% less, rounded down. Only service_role may run it.';

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
  v_scope_key bigint;
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

  -- The outer transaction must hold both guards before its wallet lock; the charge
  -- helper reacquires these same transaction guards without adding a later lock class.
  for v_scope_key in
    select distinct hashtextextended('island-economy:' || owner_id::text, 0)
      from unnest(array[p_player_id, v_owner]) owner_id
     order by 1
  loop
    perform pg_advisory_xact_lock(v_scope_key);
  end loop;
  if exists(select 1 from public.island_economy_state where island_owner = v_owner) then
    return jsonb_build_object('status', 'refused', 'reason', 'economy_context_required');
  end if;

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
  'Takes sorted common actor/target scope guards and refuses shared targets before personal payment. On explicit legacy targets, pays and journals one recovery-v1 captain revival atomically after the sealed frontier, with server identity/stats and the paid fall tick. A repeated paid action returns journaled true without charging or appending, including after close/leave. Only service_role may call it.';
