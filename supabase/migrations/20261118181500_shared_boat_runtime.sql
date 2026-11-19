-- MP-ECO-15: protected boat status and an atomic persisted-mode guard for legacy rewards.
-- No admission, production authority provider or feature activation is introduced.

-- Read mode and the correct reward bucket inside the canonical island/account boundary.
create or replace function public.island_boat_runtime_status(p_actor_id uuid,p_island_owner uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_state public.island_economy_state;
  v_account public.island_economy_accounts;
  v_island public.islands;
  v_game text;
  v_games jsonb := '[]'::jsonb;
  v_shared boolean;
  v_reason text;
  v_message text;
  v_paid integer;
  v_maximum integer;
  v_legacy_paid boolean;
begin
  if p_actor_id is null or p_island_owner is null then
    return jsonb_build_object('status','refused','reason','invalid_change');
  end if;
  perform public.island_treasury_lock_scope(p_island_owner);
  select * into v_state from public.island_economy_state where island_owner=p_island_owner;
  v_shared := found;
  if v_shared then
    select * into strict v_account from public.island_economy_accounts
      where id=v_state.current_account_id for update;
    if v_account.state <> 'active' or v_account.island_owner <> p_island_owner
       or v_account.run_epoch <> v_state.run_epoch or v_state.admission_state <> 'active' then
      raise exception using errcode='PT515',message='path_unavailable';
    end if;
  end if;
  select * into v_island from public.islands where player_id=p_island_owner for update;
  if not found then return jsonb_build_object('status','missing_island'); end if;
  if v_shared then
    begin
      perform public.island_boat_require_play_locked(p_actor_id,p_island_owner);
    exception when sqlstate 'PT515' then
      if sqlerrm <> 'wave_running' then raise; end if;
      v_reason := 'wave_running'; v_message := 'Sail between wave reservations.';
    end;
  elsif p_actor_id <> p_island_owner and not exists (
    select 1 from public.island_members where island_owner=p_island_owner
      and player_id=p_actor_id and left_at is null
  ) then
    return jsonb_build_object('status','refused','reason','not_member');
  end if;
  if v_island.wave_best < 30 then
    v_reason := 'locked'; v_message := 'Opens after wave 30.';
  elsif v_island.wreck_paid < 500 then
    v_reason := 'not_repaired'; v_message := 'Finish repairing the island wreck first.';
  end if;
  v_maximum := 3*(6+least(v_island.wave_best,100)/5);
  foreach v_game in array array['broadside','dash'] loop
    if v_shared then
      select paid_coins into v_paid from public.island_boat_reward_buckets
        where account_id=v_account.id and run_epoch=v_account.run_epoch
          and game=v_game and record_wave=v_island.wave_best;
      v_paid := coalesce(v_paid,0);
      if v_paid not between 0 and v_maximum then
        raise exception using errcode='PT515',message='path_unavailable';
      end if;
      v_games := v_games || jsonb_build_array(jsonb_build_object('id',v_game,
        'paid',v_paid=v_maximum,'best',v_maximum,'claimedCoins',v_paid::text,
        'remainingCoins',(v_maximum-v_paid)::text,'maximumCoins',v_maximum::text));
    else
      select exists(select 1 from public.wallet_transactions where player_id=p_actor_id
        and reason='boat_game'
        and ref='boat:'||p_island_owner::text||':'||v_island.wave_best::text||':'||v_game)
        into v_legacy_paid;
      v_games := v_games || jsonb_build_array(jsonb_build_object('id',v_game,
        'paid',v_legacy_paid,'best',v_maximum));
    end if;
  end loop;
  return jsonb_build_object('status',case when v_shared then 'shared' else 'legacy' end,
    'open',v_reason is null,'reason',v_reason,'message',v_message,
    'wave',v_island.wave_best,'unlockWave',30,
    'wreck',jsonb_build_object('paid',least(v_island.wreck_paid,500),'goal',500),'games',v_games)
    || case when v_shared then jsonb_build_object('economy',public.island_treasury_envelope(v_account))
       else '{}'::jsonb end;
exception when sqlstate 'PT515' then
  return jsonb_build_object('status','refused','reason',sqlerrm);
end;
$$;
comment on function public.island_boat_runtime_status(uuid,uuid) is
  'Service-only mode-aware boat read. Shared authority and bucket remain canonical; absent/failed tables never select private funding. Shared DTO carries the exact common economy envelope.';

-- Legacy rewards cannot cross admission: the mode guard and payout share one transaction.
create or replace function public.island_legacy_boat_reward(
  p_actor_id uuid,p_island_owner uuid,p_game text,p_stars integer
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_island public.islands;
  v_reference text;
  v_already boolean;
  v_coins integer;
  v_balance bigint;
begin
  if p_actor_id is null or p_island_owner is null or p_game is null
     or p_game not in ('broadside','dash') or p_stars is null or p_stars not between 0 and 3 then
    return jsonb_build_object('status','refused','reason','invalid_change');
  end if;
  perform public.island_treasury_lock_scope(p_island_owner);
  if exists(select 1 from public.island_economy_state where island_owner=p_island_owner) then
    return jsonb_build_object('status','refused','reason','shared_context_required');
  end if;
  perform 1 from public.wallets where player_id=p_actor_id for update;
  if not found then return jsonb_build_object('status','refused','reason','account_missing'); end if;
  select * into v_island from public.islands where player_id=p_island_owner for update;
  if not found then return jsonb_build_object('status','missing_island'); end if;
  if p_actor_id <> p_island_owner and not exists (
    select 1 from public.island_members where island_owner=p_island_owner
      and player_id=p_actor_id and left_at is null
  ) then return jsonb_build_object('status','refused','reason','not_member'); end if;
  if v_island.wave_best < 30 then
    return jsonb_build_object('status','refused','reason','locked');
  end if;
  if v_island.wreck_paid < 500 then
    return jsonb_build_object('status','refused','reason','not_repaired',
      'leftCoins',500-v_island.wreck_paid);
  end if;
  v_reference := 'boat:'||p_island_owner::text||':'||v_island.wave_best::text||':'||p_game;
  select exists(select 1 from public.wallet_transactions where player_id=p_actor_id
    and reason='boat_game' and ref=v_reference) into v_already;
  v_coins := p_stars*(6+least(v_island.wave_best,100)/5);
  if v_already or v_coins=0 then
    return jsonb_build_object('status','legacy','game',p_game,'stars',p_stars,'coins',0,
      'paid',false,'already',v_already,'balance',null,'wave',v_island.wave_best);
  end if;
  v_balance := public.apply_wallet_transaction(p_actor_id,v_coins,'boat_game',v_reference);
  return jsonb_build_object('status','legacy','game',p_game,'stars',p_stars,'coins',v_coins,
    'paid',true,'already',false,'balance',v_balance,'wave',v_island.wave_best);
end;
$$;
comment on function public.island_legacy_boat_reward(uuid,uuid,text,integer) is
  'Legacy personal payout only while persisted shared admission is absent under the common scope. Wallet/island locks and stable legacy reference preserve original personal semantics without a stale preflight race.';

revoke all on function public.island_boat_runtime_status(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.island_legacy_boat_reward(uuid,uuid,text,integer) from public,anon,authenticated,service_role;
grant execute on function public.island_boat_runtime_status(uuid,uuid) to service_role;
grant execute on function public.island_legacy_boat_reward(uuid,uuid,text,integer) to service_role;
