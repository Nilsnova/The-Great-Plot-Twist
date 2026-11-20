-- MP-ECO-15: server-bound ship rounds and atomic island-wide score improvements.
-- No public route, admission or authority substitute is activated by this migration.

-- Immutable round origins retain their original actor, account, epoch and island record.
create table if not exists public.island_boat_rounds (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique references public.island_economy_operations(id),
  actor_id uuid not null,
  island_owner uuid not null,
  account_id uuid not null,
  run_epoch uuid not null,
  game text not null check (game in ('broadside', 'dash')),
  record_wave integer not null check (record_wave >= 30),
  coins_per_star integer not null check (coins_per_star between 12 and 26),
  created_at timestamptz not null default clock_timestamp(),
  unique (id, account_id, run_epoch),
  foreign key (account_id, island_owner, run_epoch)
    references public.island_economy_accounts(id, island_owner, run_epoch) on delete restrict
);
comment on table public.island_boat_rounds is
  'Server-created round provenance. Actor/account/epoch/game/record/formula never come from a completion body or change after reset. Score claims retain existing browser-score trust limits.';

-- Every member contributes to one cumulative reward per game and newly reached record.
create table if not exists public.island_boat_reward_buckets (
  account_id uuid not null,
  run_epoch uuid not null,
  game text not null check (game in ('broadside', 'dash')),
  record_wave integer not null check (record_wave >= 30),
  maximum_coins integer not null check (maximum_coins between 36 and 78),
  paid_coins integer not null default 0 check (paid_coins between 0 and maximum_coins),
  primary key (account_id, run_epoch, game, record_wave),
  foreign key (account_id, run_epoch)
    references public.island_economy_accounts(id, run_epoch) on delete restrict
);
comment on table public.island_boat_reward_buckets is
  'Shared cumulative ship reward: no actor key. Positive improvements alone pay; returns, retries and player count cannot multiply the maximum.';

-- Complete domain receipts include zero rewards and consume each round once.
create table if not exists public.island_boat_results (
  operation_id uuid primary key references public.island_economy_operations(id),
  round_id uuid not null unique,
  account_id uuid not null,
  run_epoch uuid not null,
  stars smallint not null check (stars between 0 and 3),
  coins integer not null check (coins >= 0),
  cumulative_coins integer not null check (cumulative_coins >= coins),
  maximum_coins integer not null check (maximum_coins between 36 and 78),
  treasury_receipt_id uuid unique,
  created_at timestamptz not null default clock_timestamp(),
  check (cumulative_coins <= maximum_coins),
  check ((coins = 0) = (treasury_receipt_id is null)),
  foreign key (round_id, account_id, run_epoch)
    references public.island_boat_rounds(id, account_id, run_epoch) on delete restrict,
  foreign key (treasury_receipt_id, account_id, run_epoch)
    references public.island_treasury_transactions(id, account_id, run_epoch) on delete restrict
);
comment on table public.island_boat_results is
  'Immutable complete reward receipt, including a zero payout. Domain root, bucket, round completion and treasury effect commit atomically.';

alter table public.island_boat_rounds enable row level security;
alter table public.island_boat_reward_buckets enable row level security;
alter table public.island_boat_results enable row level security;
revoke all on table public.island_boat_rounds from public, anon, authenticated, service_role;
revoke all on table public.island_boat_reward_buckets from public, anon, authenticated, service_role;
revoke all on table public.island_boat_results from public, anon, authenticated, service_role;
grant select on table public.island_boat_rounds to service_role;
grant select on table public.island_boat_reward_buckets to service_role;
grant select on table public.island_boat_results to service_role;
create or replace trigger island_boat_rounds_immutable before update or delete
  on public.island_boat_rounds for each row execute function public.island_treasury_immutable();
create or replace trigger island_boat_results_immutable before update or delete
  on public.island_boat_results for each row execute function public.island_treasury_immutable();

-- Consume the exact reserved authority; absence or malformed data never means legacy.
create or replace function public.island_boat_require_play_locked(p_actor_id uuid,p_island_owner uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_authority jsonb;
  v_field text;
begin
  if to_regprocedure('public.island_economy_authority(uuid,uuid)') is null then
    raise exception using errcode='PT515',message='path_unavailable';
  end if;
  execute 'select public.island_economy_authority($1,$2)'
    into v_authority using p_actor_id,p_island_owner;
  if v_authority is null or jsonb_typeof(v_authority) <> 'object'
     or not v_authority ?& array['actor_id','island_owner','is_member','reservation_id',
       'session_leader_id','actor_assignment_wave_id']
     or v_authority - array['actor_id','island_owner','is_member','reservation_id',
       'session_leader_id','actor_assignment_wave_id'] <> '{}'::jsonb
     or v_authority->>'actor_id' is distinct from p_actor_id::text
     or v_authority->>'island_owner' is distinct from p_island_owner::text
     or jsonb_typeof(v_authority->'is_member') <> 'boolean' then
    raise exception using errcode='PT515',message='path_unavailable';
  end if;
  foreach v_field in array array['reservation_id','session_leader_id','actor_assignment_wave_id'] loop
    if jsonb_typeof(v_authority->v_field) = 'string' then
      perform (v_authority->>v_field)::uuid;
    elsif jsonb_typeof(v_authority->v_field) <> 'null' then
      raise exception using errcode='PT515',message='path_unavailable';
    end if;
  end loop;
  if p_actor_id <> p_island_owner and not (v_authority->>'is_member')::boolean then
    raise exception using errcode='PT515',message='not_member';
  end if;
  if v_authority->>'reservation_id' is not null then
    raise exception using errcode='PT515',message='wave_running';
  end if;
exception when undefined_function or invalid_text_representation then
  raise exception using errcode='PT515',message='path_unavailable';
end;
$$;
comment on function public.island_boat_require_play_locked(uuid,uuid) is
  'Private boat guard under common locks; consumes the reserved six-field authority, authorizes members, and enforces between-reservation play. It creates no permission/session state.';

-- Return immutable round identity without exposing current financial state.
create or replace function public.island_boat_round_json(p_round public.island_boat_rounds)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('id',p_round.id,'actorId',p_round.actor_id,
    'islandOwner',p_round.island_owner,'accountId',p_round.account_id,'runEpoch',p_round.run_epoch,
    'game',p_round.game,'recordWave',p_round.record_wave,
    'maximumCoins',(p_round.coins_per_star*3)::text);
$$;
comment on function public.island_boat_round_json(public.island_boat_rounds) is
  'Immutable server-bound round DTO. It contains no fresh account balance or permission grant.';

-- Free round-start actions carry the same common immutable receipt header.
create or replace function public.island_boat_start_json(p_operation_id uuid,p_repeat boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_round public.island_boat_rounds;
  v_operation public.island_economy_operations;
begin
  select * into strict v_round from public.island_boat_rounds where operation_id=p_operation_id;
  select * into strict v_operation from public.island_economy_operations where id=p_operation_id;
  return jsonb_build_object('status','started','repeat',p_repeat,
    'receipt',jsonb_build_object('receiptId',v_operation.id,'actionUid',v_operation.action_uid,
      'action','boat:start','actorId',v_round.actor_id,
      'origin',jsonb_build_object('mode','island_shared','version',1,
        'islandOwner',v_round.island_owner,'accountId',v_round.account_id,'runEpoch',v_round.run_epoch),
      'result',jsonb_build_object('round',public.island_boat_round_json(v_round))));
end;
$$;
comment on function public.island_boat_start_json(uuid,boolean) is
  'Private immutable common receipt projection for free round starts; no current balance or permission is exposed on replay.';

-- Return complete original receipt; replay never leaks a departed actor fresh treasury state.
create or replace function public.island_boat_result_json(p_operation_id uuid,p_repeat boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_result public.island_boat_results;
  v_round public.island_boat_rounds;
  v_account public.island_economy_accounts;
  v_operation public.island_economy_operations;
begin
  select * into strict v_result from public.island_boat_results where operation_id=p_operation_id;
  select * into strict v_round from public.island_boat_rounds where id=v_result.round_id;
  select * into strict v_account from public.island_economy_accounts where id=v_result.account_id;
  select * into strict v_operation from public.island_economy_operations where id=p_operation_id;
  return jsonb_build_object('status','done','repeat',p_repeat,
    'receipt',jsonb_build_object('receiptId',v_result.operation_id,'actionUid',v_operation.action_uid,
      'action','boat:claim','actorId',v_round.actor_id,
      'origin',jsonb_build_object('mode','island_shared','version',1,
        'islandOwner',v_round.island_owner,'accountId',v_round.account_id,'runEpoch',v_round.run_epoch),
      'result',jsonb_build_object('roundId',v_result.round_id,
        'game',v_round.game,'recordWave',v_round.record_wave,'stars',v_result.stars,
        'coins',v_result.coins::text,'cumulativeCoins',v_result.cumulative_coins::text,
        'maximumCoins',v_result.maximum_coins::text,'treasuryReceiptId',v_result.treasury_receipt_id)),
    'currentEconomy',case when p_repeat then null else public.island_treasury_envelope(v_account) end);
end;
$$;
comment on function public.island_boat_result_json(uuid,boolean) is
  'Private complete domain receipt projection. New authorized mutations include current common economy; historical replay returns only original receipt with null currentEconomy.';

-- Start binds original record and formula from trusted persisted island state.
create or replace function public.island_shared_boat_start(
  p_actor_id uuid,p_island_owner uuid,p_run_epoch uuid,p_game text,p_action_uid text
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_account public.island_economy_accounts;
  v_state public.island_economy_state;
  v_island public.islands;
  v_claim jsonb;
  v_operation_id uuid;
  v_round public.island_boat_rounds;
begin
  if p_actor_id is null or p_island_owner is null or p_run_epoch is null
     or p_game is null or p_game not in ('broadside','dash') then
    raise exception using errcode='PT515',message='invalid_change';
  end if;
  perform public.island_treasury_lock_scope(p_island_owner);
  select * into v_account from public.island_economy_accounts
    where island_owner=p_island_owner and run_epoch=p_run_epoch for update;
  if not found then raise exception using errcode='PT515',message='epoch_mismatch'; end if;
  v_claim := public.island_economy_claim_operation_locked(p_actor_id,v_account.id,p_run_epoch,
    p_action_uid,'boat:start',jsonb_build_object('game',p_game));
  if v_claim->>'status'='refused' then
    raise exception using errcode='PT515',message=v_claim->>'reason';
  end if;
  v_operation_id := (v_claim->>'operationId')::uuid;
  if v_claim->>'status'='replay' then
    select * into v_round from public.island_boat_rounds where operation_id=v_operation_id;
    if not found then raise exception using errcode='PT515',message='path_unavailable'; end if;
    return public.island_boat_start_json(v_operation_id,true);
  end if;
  select * into v_island from public.islands where player_id=p_island_owner for update;
  select * into v_state from public.island_economy_state where island_owner=p_island_owner for update;
  if v_account.state <> 'active' or v_state.current_account_id is distinct from v_account.id
     or v_state.run_epoch is distinct from p_run_epoch or v_state.admission_state <> 'active' then
    raise exception using errcode='PT515',message='epoch_mismatch';
  end if;
  perform public.island_boat_require_play_locked(p_actor_id,p_island_owner);
  if v_island.wave_best < 30 then raise exception using errcode='PT515',message='locked'; end if;
  if v_island.wreck_paid < 500 then raise exception using errcode='PT515',message='not_repaired'; end if;
  insert into public.island_boat_rounds(operation_id,actor_id,island_owner,account_id,run_epoch,
    game,record_wave,coins_per_star)
  values(v_operation_id,p_actor_id,p_island_owner,v_account.id,p_run_epoch,p_game,
    v_island.wave_best,6+least(v_island.wave_best,100)/5) returning * into v_round;
  return public.island_boat_start_json(v_operation_id,false);
exception when sqlstate 'PT515' then
  return jsonb_build_object('status','refused','reason',sqlerrm);
end;
$$;
comment on function public.island_shared_boat_start(uuid,uuid,uuid,text,text) is
  'Server-only checked round start, using common scope/account/operation order, reserved authority and persisted island record. Every downstream refusal rolls back its new root claim.';

-- Complete once and pay only the shared cumulative improvement in one transaction.
create or replace function public.island_shared_boat_claim(
  p_actor_id uuid,p_round_id uuid,p_run_epoch uuid,p_stars integer,p_action_uid text
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_round public.island_boat_rounds;
  v_account public.island_economy_accounts;
  v_state public.island_economy_state;
  v_bucket public.island_boat_reward_buckets;
  v_claim jsonb;
  v_operation_id uuid;
  v_financial jsonb;
  v_ledger_id uuid;
  v_paid integer;
  v_cumulative integer;
  v_maximum integer;
begin
  if p_actor_id is null or p_round_id is null or p_run_epoch is null
     or p_stars is null or p_stars not between 0 and 3 then
    raise exception using errcode='PT515',message='invalid_change';
  end if;
  select * into v_round from public.island_boat_rounds where id=p_round_id;
  if not found then raise exception using errcode='PT515',message='round_missing'; end if;
  if v_round.actor_id <> p_actor_id then
    raise exception using errcode='PT515',message='not_round_actor';
  end if;
  if v_round.run_epoch <> p_run_epoch then
    raise exception using errcode='PT515',message='epoch_mismatch';
  end if;
  perform public.island_treasury_lock_scope(v_round.island_owner);
  select * into strict v_account from public.island_economy_accounts
    where id=v_round.account_id for update;
  v_claim := public.island_economy_claim_operation_locked(p_actor_id,v_round.account_id,p_run_epoch,
    p_action_uid,'boat:claim',jsonb_build_object('roundId',p_round_id,'stars',p_stars));
  if v_claim->>'status'='refused' then
    raise exception using errcode='PT515',message=v_claim->>'reason';
  end if;
  v_operation_id := (v_claim->>'operationId')::uuid;
  if v_claim->>'status'='replay' then
    if not exists(select 1 from public.island_boat_results where operation_id=v_operation_id) then
      raise exception using errcode='PT515',message='path_unavailable';
    end if;
    return public.island_boat_result_json(v_operation_id,true);
  end if;
  perform 1 from public.islands where player_id=v_round.island_owner for update;
  select * into v_state from public.island_economy_state
    where island_owner=v_round.island_owner for update;
  if v_account.state <> 'active' or v_state.current_account_id is distinct from v_account.id
     or v_state.run_epoch is distinct from p_run_epoch or v_state.admission_state <> 'active' then
    raise exception using errcode='PT515',message='epoch_mismatch';
  end if;
  perform public.island_boat_require_play_locked(p_actor_id,v_round.island_owner);
  if exists(select 1 from public.island_boat_results where round_id=p_round_id) then
    raise exception using errcode='PT515',message='round_completed';
  end if;
  v_maximum := 3*v_round.coins_per_star;
  insert into public.island_boat_reward_buckets(account_id,run_epoch,game,record_wave,maximum_coins)
    values(v_round.account_id,p_run_epoch,v_round.game,v_round.record_wave,v_maximum)
    on conflict do nothing;
  select * into strict v_bucket from public.island_boat_reward_buckets
    where account_id=v_round.account_id and run_epoch=p_run_epoch
      and game=v_round.game and record_wave=v_round.record_wave for update;
  if v_bucket.maximum_coins <> v_maximum then
    raise exception using errcode='PT515',message='path_unavailable';
  end if;
  v_cumulative := greatest(v_bucket.paid_coins,p_stars*v_round.coins_per_star);
  v_paid := v_cumulative-v_bucket.paid_coins;
  if v_paid > 0 then
    v_financial := public.island_treasury_record_locked(v_round.account_id,p_actor_id,
      public.island_economy_effect_uid(v_operation_id,'reward'),'credit','boat_game',
      'boat-round:'||p_round_id::text,
      jsonb_build_object('operationId',v_operation_id,'roundId',p_round_id,'stars',p_stars,
        'coins',v_paid::text),v_paid,0);
    if v_financial->>'status' <> 'done' or (v_financial->>'repeat')::boolean then
      raise exception using errcode='PT515',message='action_conflict';
    end if;
    v_ledger_id := (v_financial->'receipt'->>'id')::uuid;
  end if;
  update public.island_boat_reward_buckets set paid_coins=v_cumulative
    where account_id=v_round.account_id and run_epoch=p_run_epoch
      and game=v_round.game and record_wave=v_round.record_wave;
  insert into public.island_boat_results(operation_id,round_id,account_id,run_epoch,stars,
    coins,cumulative_coins,maximum_coins,treasury_receipt_id)
    values(v_operation_id,p_round_id,v_round.account_id,p_run_epoch,p_stars,
      v_paid,v_cumulative,v_maximum,v_ledger_id);
  return public.island_boat_result_json(v_operation_id,false);
exception when sqlstate 'PT515' then
  return jsonb_build_object('status','refused','reason',sqlerrm);
end;
$$;
comment on function public.island_shared_boat_claim(uuid,uuid,uuid,integer,text) is
  'Atomically claim a server-bound round, shared improvement bucket and canonical treasury credit with immutable common intent/domain receipt. Replays precede mutable authority and expose no fresh treasury.';

revoke all on function public.island_boat_require_play_locked(uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.island_boat_round_json(public.island_boat_rounds) from public, anon, authenticated, service_role;
revoke all on function public.island_boat_start_json(uuid,boolean) from public, anon, authenticated, service_role;
revoke all on function public.island_boat_result_json(uuid,boolean) from public, anon, authenticated, service_role;
revoke all on function public.island_shared_boat_start(uuid,uuid,uuid,text,text) from public, anon, authenticated, service_role;
revoke all on function public.island_shared_boat_claim(uuid,uuid,uuid,integer,text) from public, anon, authenticated, service_role;
grant execute on function public.island_shared_boat_start(uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.island_shared_boat_claim(uuid,uuid,uuid,integer,text) to service_role;
