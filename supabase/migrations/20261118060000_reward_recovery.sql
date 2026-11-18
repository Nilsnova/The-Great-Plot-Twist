-- Recovers saved unpaid protocol-2 results after return. Used only by the authenticated server.
-- No client checkpoint, current membership, current prices or current island phase is consulted.
-- Each participant shares the first close's saved outcome and exact loot; the existing wallet
-- reason/reference and finished_at gate prevent duplicate payment. No host/structure state changes.

-- Find one player's unfinished history without scanning already settled participations.
create index if not exists wave_participants_pending_player_idx
  on public.wave_participants (player_id, joined_at, wave_id)
  where finished_at is null;

-- One eligibility rule for candidate selection and the locked recheck. Malformed or incomplete
-- closes are skipped before the batch limit, so they cannot starve later valid saved rewards.
create or replace function public.recovery_wave_reward_is_closed(p_wave_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.wave_runs r
    join public.recovery_wave_states s on s.wave_id=r.id
    where r.id=p_wave_id and s.recovery_version=1 and s.wave_protocol=2
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
$$;

-- Settle one known participation under the same locks as the ordinary finish. For an open wave
-- this is a no-op that retains its locks, so the finish wrapper cannot race a first close.
create or replace function public.recovery_wave_recover_reward_locked(
  p_player_id uuid, p_wave_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner uuid;
  v_wave public.recovery_wave_states;
  v_run public.wave_runs;
  v_part public.wave_participants;
begin
  if p_player_id is null or p_wave_id is null then return null; end if;
  perform 1 from public.wallets where player_id=p_player_id for update;
  if not found then return null; end if;
  select island_owner into v_owner from public.wave_runs where id=p_wave_id;
  if not found or v_owner is null then return null; end if;
  perform 1 from public.islands where player_id in (v_owner,p_player_id)
    order by player_id for update;
  perform 1 from public.island_recovery_state where island_owner=v_owner for update;
  select * into v_wave from public.recovery_wave_states where wave_id=p_wave_id for update;
  if not found then return null; end if;
  select * into v_run from public.wave_runs where id=p_wave_id for update;
  if not found then return null; end if;
  select * into v_part from public.wave_participants
    where wave_id=p_wave_id and player_id=p_player_id for update;
  if not found or v_part.finished_at is not null then return null; end if;
  if not public.recovery_wave_reward_is_closed(p_wave_id) then return null; end if;

  update public.wave_participants
    set finished_at=clock_timestamp(),survived=v_run.survived,
        ships_sunk=v_run.ships_sunk,loot=v_run.loot,expired=v_run.expired
    where wave_id=p_wave_id and player_id=p_player_id and finished_at is null;
  if v_run.survived then
    update public.islands set won_wave_best=greatest(won_wave_best,v_run.wave)
      where player_id=p_player_id;
  end if;
  if v_run.loot>0 then
    perform public.apply_wallet_transaction(p_player_id,v_run.loot,'pirate_loot',
      'wave:'||p_wave_id::text||':'||p_player_id::text);
  end if;
  return jsonb_build_object('waveId',p_wave_id,'wave',v_run.wave,
    'survived',v_run.survived,'loot',v_run.loot);
end;
$$;

-- Recover at most 20 saved results, plus one lookahead for hasMore. Prelock every participating
-- island in UUID order so batches spanning different hosts cannot invert the normal lock order.
create or replace function public.recovery_wave_recover_rewards(p_player_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_balance bigint;
  v_best integer;
  v_ids uuid[];
  v_id uuid;
  v_receipt jsonb;
  v_recovered jsonb := '[]'::jsonb;
begin
  select balance into v_balance from public.wallets where player_id=p_player_id for update;
  if not found then
    return jsonb_build_object('status','refused','reason','player_not_set_up');
  end if;
  select coalesce(array_agg(candidate.wave_id order by candidate.joined_at,candidate.wave_id),'{}'::uuid[])
    into v_ids from (
      select p.wave_id,p.joined_at from public.wave_participants p
      where p.player_id=p_player_id and p.finished_at is null
        and public.recovery_wave_reward_is_closed(p.wave_id)
      order by p.joined_at,p.wave_id limit 21
    ) candidate;
  perform 1 from public.islands
    where player_id=p_player_id or player_id in (
      select island_owner from public.wave_runs where id=any(v_ids[1:20])
    ) order by player_id for update;
  foreach v_id in array v_ids[1:20] loop
    v_receipt := public.recovery_wave_recover_reward_locked(p_player_id,v_id);
    if v_receipt is not null then v_recovered := v_recovered||jsonb_build_array(v_receipt); end if;
  end loop;
  select balance into v_balance from public.wallets where player_id=p_player_id;
  select won_wave_best into v_best from public.islands where player_id=p_player_id;
  return jsonb_build_object('status','done','coins',v_balance,'wonWaveBest',coalesce(v_best,0),
    'recovered',v_recovered,'hasMore',cardinality(v_ids)>20);
end;
$$;

-- Keep the existing complete finish and its canonical receipt. The wrapper first settles an
-- already closed participation, so a late ordinary finish sees a repeat instead of zeroing a win.
-- The guard makes this rename safe when this migration, or the full chain, is applied twice.
do $rename$
begin
  if to_regprocedure('public.recovery_wave_finish_before_reward_recovery(uuid,uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer,uuid,text,integer,bigint,bigint,jsonb,jsonb)') is null then
    alter function public.recovery_wave_finish(uuid,uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer,uuid,text,integer,bigint,bigint,jsonb,jsonb)
      rename to recovery_wave_finish_before_reward_recovery;
  end if;
end;
$rename$;

-- The public server signature stays unchanged; open waves still require their real checkpoint.
create or replace function public.recovery_wave_finish(
  p_player_id uuid, p_wave_id uuid, p_survived boolean, p_ships_sunk integer,
  p_loot_base integer, p_loot_per_wave integer, p_loot_per_house integer,
  p_point_loot_base integer, p_boss_every integer, p_boss_multiplier integer,
  p_restart_back integer, p_island_epoch uuid, p_checkpoint_uid text,
  p_through_tick integer, p_input_head_seq bigint, p_last_repair_seq bigint,
  p_basis_repair_seq jsonb, p_hp_units jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.recovery_wave_recover_reward_locked(p_player_id,p_wave_id);
  return public.recovery_wave_finish_before_reward_recovery(
    p_player_id,p_wave_id,p_survived,p_ships_sunk,p_loot_base,p_loot_per_wave,p_loot_per_house,
    p_point_loot_base,p_boss_every,p_boss_multiplier,p_restart_back,p_island_epoch,p_checkpoint_uid,
    p_through_tick,p_input_head_seq,p_last_repair_seq,p_basis_repair_seq,p_hp_units);
end;
$$;

revoke all on function public.recovery_wave_reward_is_closed(uuid) from public,anon,authenticated,service_role;
grant execute on function public.recovery_wave_reward_is_closed(uuid) to service_role;
revoke all on function public.recovery_wave_recover_reward_locked(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.recovery_wave_recover_reward_locked(uuid,uuid) to service_role;
revoke all on function public.recovery_wave_recover_rewards(uuid) from public,anon,authenticated,service_role;
grant execute on function public.recovery_wave_recover_rewards(uuid) to service_role;
revoke all on function public.recovery_wave_finish_before_reward_recovery(uuid,uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer,uuid,text,integer,bigint,bigint,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.recovery_wave_finish_before_reward_recovery(uuid,uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer,uuid,text,integer,bigint,bigint,jsonb,jsonb) to service_role;
revoke all on function public.recovery_wave_finish(uuid,uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer,uuid,text,integer,bigint,bigint,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.recovery_wave_finish(uuid,uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer,uuid,text,integer,bigint,bigint,jsonb,jsonb) to service_role;

comment on function public.recovery_wave_reward_is_closed(uuid) is
  'Shared service-only eligibility check for complete protocol-2 saved results: frozen identity/version, matching host, canonical close, saved boolean and valid saved loot. Used before batch limiting and again under settlement locks.';
comment on function public.recovery_wave_recover_reward_locked(uuid,uuid) is
  'Service-only shared settlement for an unpaid, canonically closed protocol-2 participation. Uses saved first-close outcome/loot, existing wallet ref and normal lock order; never changes host flags, structures or wave phase.';
comment on function public.recovery_wave_recover_rewards(uuid) is
  'Recovers at most 20 of the verified caller''s saved unpaid results, regardless of current membership, epoch or island. Empty repeats still return current wallet and personal won-wave totals.';
comment on function public.recovery_wave_finish(uuid,uuid,boolean,integer,integer,integer,integer,integer,integer,integer,integer,uuid,text,integer,bigint,bigint,jsonb,jsonb) is
  'Preserves normal checkpoint finish for open waves. Already closed protocol-2 participations settle the exact saved result before returning the existing canonical receipt, including beyond the original deadline.';
