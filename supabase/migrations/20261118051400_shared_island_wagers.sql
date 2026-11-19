-- Shared fixed-odds market/football products, atomically using common treasury and root intents.
-- No browser grant, route activation, admission, migration application or provider is added.

create table if not exists public.island_wagers (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique references public.island_economy_operations(id),
  actor_id uuid not null,
  account_id uuid not null,
  run_epoch uuid not null,
  product text not null check (product in ('market_call','football')),
  event_id text not null,
  selection text not null,
  stake numeric not null check (public.island_treasury_whole(stake,false)),
  opening_evidence jsonb not null check (jsonb_typeof(opening_evidence)='object'),
  opened_at timestamptz not null,
  settle_at timestamptz not null check (settle_at > opened_at),
  source_reservation_id uuid not null unique,
  foreign key (account_id,run_epoch) references public.island_economy_accounts(id,run_epoch),
  foreign key (source_reservation_id,account_id,run_epoch)
    references public.island_treasury_transactions(id,account_id,run_epoch),
  constraint island_wager_terms check (
    (product='market_call' and event_id in
      ('harbor-trust','tidewright-works','greyfathom-salvage','apple','nvidia')
      and selection in ('up','down'))
    or (product='football' and event_id ~ '^fd-[1-9][0-9]{0,14}$'
      and selection in ('home','draw','away'))
  )
);
comment on table public.island_wagers is
  'Immutable product terms and source reserve, created in the same transaction as one global player root and its treasury child. No stake, day, count or same-event economic caps.';

create table if not exists public.island_wager_settlements (
  wager_id uuid primary key references public.island_wagers(id),
  outcome text not null check (outcome in ('won','lost','refunded')),
  returned_payout numeric not null check (public.island_treasury_whole(returned_payout,true)),
  evidence jsonb not null,
  treasury_receipt_id uuid not null unique references public.island_treasury_transactions(id),
  settled_at timestamptz not null default clock_timestamp()
);
comment on table public.island_wager_settlements is
  'One immutable verified product result committed together with original-reservation treasury settlement. Clock-authorized refunds retain unusable-price evidence without treating it as a result.';

alter table public.island_wagers enable row level security;
alter table public.island_wager_settlements enable row level security;
revoke all on table public.island_wagers, public.island_wager_settlements
  from public,anon,authenticated,service_role;
grant select on table public.island_wagers, public.island_wager_settlements to service_role;

create or replace function public.island_wager_immutable()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'island_wager_immutable'; end;
$$;
comment on function public.island_wager_immutable() is 'Reject product and settlement history updates/deletes.';
create or replace trigger island_wagers_immutable before update or delete on public.island_wagers
  for each row execute function public.island_wager_immutable();
create or replace trigger island_wager_settlements_immutable before update or delete
  on public.island_wager_settlements for each row execute function public.island_wager_immutable();

create or replace function public.island_wager_fail(p_reason text)
returns void language plpgsql set search_path='' as $$
begin
  raise exception using errcode='P0401',
    message=jsonb_build_object('status','refused','reason',p_reason)::text;
end;
$$;
comment on function public.island_wager_fail(text) is
  'Private business refusal that rolls back the encompassing root, financial child and product before returning a standard refusal.';

create or replace function public.island_wager_provenance()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_wager public.island_wagers;
  v_operation public.island_economy_operations;
  v_financial public.island_treasury_transactions;
begin
  if tg_table_name='island_wagers' then
    select * into strict v_operation from public.island_economy_operations where id=new.operation_id;
    select * into strict v_financial from public.island_treasury_transactions
      where id=new.source_reservation_id;
    if not v_operation.is_player_intent or v_operation.domain_action<>'harbor:wager'
      or v_operation.actor_id<>new.actor_id or v_operation.account_id<>new.account_id
      or v_operation.run_epoch<>new.run_epoch or v_financial.kind<>'reserve'
      or v_financial.actor_id<>new.actor_id or v_financial.account_id<>new.account_id
      or v_financial.run_epoch<>new.run_epoch or v_financial.committed_delta<>new.stake
      or v_financial.balance_delta<>0 or v_financial.action_uid<>
        public.island_economy_effect_uid(v_operation.id,'stake') then
      perform public.island_wager_fail('invalid_change');
    end if;
  else
    select * into strict v_wager from public.island_wagers where id=new.wager_id;
    select * into strict v_financial from public.island_treasury_transactions
      where id=new.treasury_receipt_id;
    if v_financial.kind<>'settle' or v_financial.source_reservation_id<>v_wager.source_reservation_id
      or v_financial.account_id<>v_wager.account_id or v_financial.run_epoch<>v_wager.run_epoch
      or v_financial.actor_id<>v_wager.actor_id or v_financial.committed_delta<>-v_wager.stake
      or v_financial.balance_delta<>new.returned_payout-v_wager.stake
      or v_financial.action_uid<>public.island_economy_system_uid(v_wager.id,'settle')
      or new.returned_payout<>(case new.outcome when 'won' then 2*v_wager.stake
        when 'refunded' then v_wager.stake else 0 end) then
      perform public.island_wager_fail('invalid_change');
    end if;
  end if;
  return new;
end;
$$;
comment on function public.island_wager_provenance() is
  'Enforce exact product/root/financial source linkage on insert; only common registry children and immutable original-account settlements may back these products.';
create or replace trigger island_wagers_provenance before insert on public.island_wagers
  for each row execute function public.island_wager_provenance();
create or replace trigger island_wager_settlements_provenance before insert
  on public.island_wager_settlements for each row execute function public.island_wager_provenance();

create or replace function public.island_wager_result(
  p_wager_id uuid,p_repeat boolean,p_settled boolean default false
)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_wager public.island_wagers;
  v_settlement public.island_wager_settlements;
  v_account public.island_economy_accounts;
  v_financial jsonb;
  v_action_uid text;
begin
  select * into strict v_wager from public.island_wagers where id=p_wager_id;
  if p_settled then
    select * into strict v_settlement from public.island_wager_settlements where wager_id=p_wager_id;
  end if;
  select action_uid into strict v_action_uid from public.island_economy_operations
    where id=v_wager.operation_id;
  select * into strict v_account from public.island_economy_accounts where id=v_wager.account_id;
  v_financial := public.island_treasury_result(
    coalesce(v_settlement.treasury_receipt_id,v_wager.source_reservation_id),p_repeat);
  -- A historical receipt is not permission to read a continuing island's fresh finances.
  if v_account.state <> 'active' or not exists(select 1 from public.island_economy_state
      where current_account_id=v_account.id and run_epoch=v_account.run_epoch)
    or (v_wager.actor_id<>v_account.island_owner and not exists(
      select 1 from public.island_members where island_owner=v_account.island_owner
        and player_id=v_wager.actor_id and left_at is null)) then
    v_financial := (v_financial-'currentEconomy'-'accountState'-'admissionState')
      ||jsonb_build_object('currentEconomy',null);
  end if;
  return jsonb_build_object('status','done','repeat',p_repeat,
    'currentEconomy',v_financial->'currentEconomy',
    'receipt',jsonb_build_object(
      'receiptId',case when p_settled then v_settlement.treasury_receipt_id else v_wager.id end,
      'actionUid',case when p_settled then null else v_action_uid end,
      'action',case when p_settled then 'island_bet_settle' else 'island_bet' end,
      'actorId',case when p_settled then null else v_wager.actor_id end,
      'origin',jsonb_build_object('mode','island_shared','version',1,
        'islandOwner',v_account.island_owner,'accountId',v_wager.account_id,'runEpoch',v_wager.run_epoch),
      'result',jsonb_build_object('financialReceipt',v_financial->'receipt',
      'wager',jsonb_build_object('id',v_wager.id,'operationId',v_wager.operation_id,
      'actorId',v_wager.actor_id,'accountId',v_wager.account_id,'runEpoch',v_wager.run_epoch,
      'product',v_wager.product,'eventId',v_wager.event_id,'selection',v_wager.selection,
      'stake',trunc(v_wager.stake)::text,'openedAt',v_wager.opened_at,'settleAt',v_wager.settle_at,
      'sourceReservationId',v_wager.source_reservation_id),
    'settlement',case when v_settlement.wager_id is null then null else jsonb_build_object(
      'outcome',v_settlement.outcome,'returnedPayout',trunc(v_settlement.returned_payout)::text,
      'treasuryReceiptId',v_settlement.treasury_receipt_id,'settledAt',v_settlement.settled_at) end)));
end;
$$;
comment on function public.island_wager_result(uuid,boolean,boolean) is
  'Private original product/financial receipt view; fresh account state is included only for an original actor still authorized on the current source account.';

create or replace function public.island_wager_open(
  p_actor_id uuid,p_island_owner uuid,p_run_epoch uuid,p_action_uid text,
  p_product text,p_event_id text,p_selection text,p_stake numeric,p_evidence jsonb
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  v_state public.island_economy_state;
  v_account public.island_economy_accounts;
  v_operation jsonb;
  v_fingerprint jsonb;
  v_financial jsonb;
  v_authority jsonb;
  v_wager_id uuid;
  v_now timestamptz;
  v_fetched timestamptz;
  v_quoted timestamptz;
  v_settle_at timestamptz;
  v_price numeric;
  v_best integer;
  v_prior public.island_economy_operations;
begin
  if p_actor_id is null or p_island_owner is null or p_run_epoch is null
    or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
    or left(p_action_uid,3)='fx_' or left(p_action_uid,4)='sys_'
    or not public.island_treasury_whole(p_stake,false) then
    perform public.island_wager_fail('invalid_change');
  end if;
  if p_product is null or p_product not in ('market_call','football') then
    perform public.island_wager_fail('path_unavailable');
  end if;
  if p_event_id is null or p_selection is null
    or (p_product='market_call' and (p_event_id not in
      ('harbor-trust','tidewright-works','greyfathom-salvage','apple','nvidia')
      or p_selection not in ('up','down')))
    or (p_product='football' and (p_event_id !~ '^fd-[1-9][0-9]{0,14}$'
      or p_selection not in ('home','draw','away'))) then
    perform public.island_wager_fail('invalid_change');
  end if;
  perform public.island_treasury_lock_scope(p_island_owner);
  v_fingerprint := jsonb_build_object('product',p_product,'eventId',p_event_id,
    'selection',p_selection,'stake',trunc(p_stake)::text,'islandOwner',p_island_owner);
  -- Historical replay resolves its original account before looking at the current run.
  select * into v_prior from public.island_economy_operations
    where actor_id=p_actor_id and action_uid=p_action_uid;
  if found then
    select * into v_account from public.island_economy_accounts where id=v_prior.account_id;
    if v_account.island_owner is distinct from p_island_owner
      or v_prior.run_epoch is distinct from p_run_epoch then
      perform public.island_wager_fail('action_conflict');
    end if;
  else
    select * into v_state from public.island_economy_state where island_owner=p_island_owner;
    select * into v_account from public.island_economy_accounts where id=v_state.current_account_id;
  end if;
  if v_account.id is null then perform public.island_wager_fail('account_missing'); end if;
  select * into strict v_account from public.island_economy_accounts
    where id=v_account.id for update;
  if v_account.run_epoch<>p_run_epoch then perform public.island_wager_fail('epoch_mismatch'); end if;
  v_operation := public.island_economy_claim_operation_locked(p_actor_id,v_account.id,
    p_run_epoch,p_action_uid,'harbor:wager',v_fingerprint);
  if v_operation->>'status'='refused' then
    perform public.island_wager_fail(v_operation->>'reason');
  end if;
  if (v_operation->>'repeat')::boolean then
    select id into v_wager_id from public.island_wagers
      where operation_id=(v_operation->>'operationId')::uuid;
    if v_wager_id is null then perform public.island_wager_fail('path_unavailable'); end if;
    return public.island_wager_result(v_wager_id,true);
  end if;
  select wave_best into v_best from public.islands where player_id=p_island_owner for update;
  select * into v_state from public.island_economy_state where island_owner=p_island_owner for update;
  if v_state.current_account_id is distinct from v_account.id or v_state.run_epoch<>p_run_epoch
    or v_state.admission_state<>'active' then perform public.island_wager_fail('path_unavailable'); end if;
  if to_regprocedure('public.island_economy_authority(uuid,uuid)') is null then
    perform public.island_wager_fail('path_unavailable');
  end if;
  execute 'select public.island_economy_authority($1,$2)' into v_authority
    using p_actor_id,p_island_owner;
  if v_authority is null or jsonb_typeof(v_authority)<>'object'
    or not v_authority ?& array['actor_id','island_owner','is_member','reservation_id',
      'session_leader_id','actor_assignment_wave_id']
    or (select count(*) from jsonb_object_keys(v_authority))<>6
    or v_authority->>'actor_id' is distinct from p_actor_id::text
    or v_authority->>'island_owner' is distinct from p_island_owner::text
    or jsonb_typeof(v_authority->'is_member')<>'boolean' then
    perform public.island_wager_fail('path_unavailable');
  end if;
  if exists(select 1 from unnest(array['reservation_id','session_leader_id',
      'actor_assignment_wave_id']) field where jsonb_typeof(v_authority->field)<>'null'
      and (jsonb_typeof(v_authority->field)<>'string' or v_authority->>field !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) then
    perform public.island_wager_fail('path_unavailable');
  end if;
  if p_actor_id<>p_island_owner and (v_authority->>'is_member')::boolean is not true then
    perform public.island_wager_fail('not_member');
  end if;
  -- Existing campaign.json milestones, checked against this island rather than a visitor.
  if v_best<(case p_product when 'market_call' then 4 else 7 end) then
    perform public.island_wager_fail('harbor_closed');
  end if;
  if p_evidence is null or jsonb_typeof(p_evidence)<>'object'
    or coalesce(p_evidence->>'source','') not in ('live','cache') then
    perform public.island_wager_fail('result_pending');
  end if;
  v_now := clock_timestamp();
  v_fetched := (p_evidence->>'fetchedAt')::timestamptz;
  if v_fetched is null or v_fetched>v_now then perform public.island_wager_fail('result_pending'); end if;
  if p_product='market_call' then
    if p_evidence->>'asset' is distinct from p_event_id then
      perform public.island_wager_fail('result_pending');
    end if;
    v_price := (p_evidence->>'price')::numeric;
    v_quoted := (p_evidence->>'quotedAt')::timestamptz;
    if v_price is null or v_price::text in ('NaN','Infinity','-Infinity') or v_price<=0
      or v_now-v_fetched>interval '5 seconds' or v_quoted is null or v_quoted>v_now
      or v_quoted<v_fetched-interval '60 seconds' then
      perform public.island_wager_fail('result_pending');
    end if;
    v_settle_at := v_now+interval '5 minutes';
  else
    if p_evidence->>'provider' is distinct from 'football-data.org'
      or p_evidence->>'fixtureId' is distinct from p_event_id
      or p_evidence->>'sport' is distinct from 'football'
      or p_evidence->>'status' is distinct from 'scheduled'
      or v_now-v_fetched>=interval '60 seconds' then
      perform public.island_wager_fail('result_pending');
    end if;
    v_settle_at := (p_evidence->>'kickoff')::timestamptz;
    if v_settle_at is null or v_settle_at<=v_now+interval '1 hour' then
      perform public.island_wager_fail('result_pending');
    end if;
  end if;
  v_wager_id := gen_random_uuid();
  v_financial := public.island_treasury_reserve(p_actor_id,v_account.id,p_run_epoch,
    public.island_economy_effect_uid((v_operation->>'operationId')::uuid,'stake'),
    case when p_product='market_call' then 'market_call_stake' else 'prediction_stake' end,
    'wager:'||v_wager_id::text,p_stake,0);
  if v_financial->>'status'<>'done' then perform public.island_wager_fail(v_financial->>'reason'); end if;
  insert into public.island_wagers(id,operation_id,actor_id,account_id,run_epoch,product,
    event_id,selection,stake,opening_evidence,opened_at,settle_at,source_reservation_id)
  values(v_wager_id,(v_operation->>'operationId')::uuid,p_actor_id,v_account.id,p_run_epoch,
    p_product,p_event_id,p_selection,p_stake,p_evidence,v_now,v_settle_at,
    (v_financial->'receipt'->>'id')::uuid);
  return public.island_wager_result(v_wager_id,false);
exception when sqlstate 'P0401' then return sqlerrm::jsonb;
  when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
    return jsonb_build_object('status','refused','reason','invalid_change');
end;
$$;
comment on function public.island_wager_open(uuid,uuid,uuid,text,text,text,text,numeric,jsonb) is
  'Service-only fixed-odds intent: account derived from island/run, exact authority under common locks, root/fx reserve/product atomic with complete business-refusal rollback. Same-event separate roots are allowed.';

create or replace function public.island_wager_replay(
  p_actor_id uuid,p_island_owner uuid,p_run_epoch uuid,p_action_uid text,
  p_product text,p_event_id text,p_selection text,p_stake numeric
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  if not exists(select 1 from public.island_economy_operations
    where actor_id=p_actor_id and action_uid=p_action_uid) then
    return jsonb_build_object('status','missing');
  end if;
  return public.island_wager_open(p_actor_id,p_island_owner,p_run_epoch,p_action_uid,
    p_product,p_event_id,p_selection,p_stake,null);
end;
$$;
comment on function public.island_wager_replay(uuid,uuid,uuid,text,text,text,text,numeric) is
  'Own immutable operation read before current-member preflight or fresh provider requests. Existing roots are rechecked by the exact domain open replay path; no new root can be claimed here.';

create or replace function public.island_wager_settle(p_wager_id uuid,p_evidence jsonb)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  v_wager public.island_wagers;
  v_account public.island_economy_accounts;
  v_financial jsonb;
  v_now timestamptz;
  v_fetched timestamptz;
  v_quoted timestamptz;
  v_price numeric;
  v_opening numeric;
  v_payout numeric;
  v_outcome text;
  v_result text;
  v_home numeric;
  v_away numeric;
  v_valid_price boolean := false;
begin
  select * into v_wager from public.island_wagers where id=p_wager_id;
  if not found then perform public.island_wager_fail('wager_missing'); end if;
  select * into strict v_account from public.island_economy_accounts where id=v_wager.account_id;
  perform public.island_treasury_lock_scope(v_account.island_owner);
  perform 1 from public.island_economy_accounts where id=v_account.id for update;
  perform 1 from public.island_wagers where id=p_wager_id for update;
  if exists(select 1 from public.island_wager_settlements where wager_id=p_wager_id) then
    return public.island_wager_result(p_wager_id,true,true);
  end if;
  v_now := clock_timestamp();
  if v_wager.product='market_call' then
    if v_now<v_wager.settle_at then perform public.island_wager_fail('result_pending'); end if;
    if p_evidence is not null and jsonb_typeof(p_evidence)='object' then
      if p_evidence->>'asset' is distinct from v_wager.event_id then
        perform public.island_wager_fail('result_pending');
      end if;
      v_price := (p_evidence->>'price')::numeric;
      v_fetched := (p_evidence->>'fetchedAt')::timestamptz;
      v_quoted := (p_evidence->>'quotedAt')::timestamptz;
      v_valid_price := coalesce(p_evidence->>'source' in ('live','cache')
        and v_price::text not in ('NaN','Infinity','-Infinity') and v_price>0
        and v_fetched between v_wager.settle_at and v_now
        and v_quoted>v_wager.opened_at and v_quoted<=v_now,false);
    end if;
    if not v_valid_price then
      if v_now<=v_wager.settle_at+interval '24 hours' then
        perform public.island_wager_fail('result_pending');
      end if;
      v_payout := v_wager.stake;
    else
      v_opening := (v_wager.opening_evidence->>'price')::numeric;
      v_payout := case when v_price=v_opening then v_wager.stake
        when (v_price>v_opening)=(v_wager.selection='up') then v_wager.stake*2 else 0 end;
    end if;
  else
    if p_evidence is null or jsonb_typeof(p_evidence)<>'object'
      or p_evidence->>'provider' is distinct from 'football-data.org'
      or p_evidence->>'source' is distinct from 'live'
      or p_evidence->>'fixtureId' is distinct from v_wager.event_id
      or p_evidence->>'sport' is distinct from 'football' then
      perform public.island_wager_fail('result_pending');
    end if;
    v_fetched := (p_evidence->>'fetchedAt')::timestamptz;
    if v_fetched is null or v_fetched>v_now or v_now-v_fetched>=interval '60 seconds' then
      perform public.island_wager_fail('result_pending');
    end if;
    if p_evidence->>'status' in ('postponed','cancelled','suspended') then
      v_payout := v_wager.stake;
    elsif p_evidence->>'status'='finished' and v_now>=v_wager.settle_at then
      v_home := (p_evidence->>'homeScore')::numeric;
      v_away := (p_evidence->>'awayScore')::numeric;
      if not public.island_treasury_whole(v_home,true)
        or not public.island_treasury_whole(v_away,true) or v_home>1000 or v_away>1000 then
        perform public.island_wager_fail('invalid_change');
      end if;
      v_result := case when v_home=v_away then 'draw' when v_home>v_away then 'home' else 'away' end;
      v_payout := case when v_result=v_wager.selection then v_wager.stake*2 else 0 end;
    else perform public.island_wager_fail('result_pending');
    end if;
  end if;
  v_outcome := case when v_payout=v_wager.stake then 'refunded'
    when v_payout=0 then 'lost' else 'won' end;
  v_financial := public.island_treasury_settle(v_wager.source_reservation_id,v_payout,
    'wager:'||v_wager.id::text||':settle',public.island_economy_system_uid(v_wager.id,'settle'));
  if v_financial->>'status'<>'done' then perform public.island_wager_fail(v_financial->>'reason'); end if;
  insert into public.island_wager_settlements(wager_id,outcome,returned_payout,evidence,treasury_receipt_id)
  values(v_wager.id,v_outcome,v_payout,coalesce(p_evidence,'null'::jsonb),
    (v_financial->'receipt'->>'id')::uuid);
  return public.island_wager_result(p_wager_id,false,true);
exception when sqlstate 'P0401' then return sqlerrm::jsonb;
  when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
    return jsonb_build_object('status','refused','reason','invalid_change');
end;
$$;
comment on function public.island_wager_settle(uuid,jsonb) is
  'Service-only autonomous verifier, with no supplied payout/account. Fixed-odds result plus sys-origin treasury settlement persist once against immutable original reservation, including departed actors/retired accounts.';

revoke all on function public.island_wager_immutable() from public,anon,authenticated,service_role;
revoke all on function public.island_wager_fail(text) from public,anon,authenticated,service_role;
revoke all on function public.island_wager_provenance() from public,anon,authenticated,service_role;
revoke all on function public.island_wager_result(uuid,boolean,boolean) from public,anon,authenticated,service_role;
revoke all on function public.island_wager_open(uuid,uuid,uuid,text,text,text,text,numeric,jsonb)
  from public,anon,authenticated,service_role;
revoke all on function public.island_wager_settle(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.island_wager_open(uuid,uuid,uuid,text,text,text,text,numeric,jsonb)
  to service_role;
grant execute on function public.island_wager_settle(uuid,jsonb) to service_role;
revoke all on function public.island_wager_replay(uuid,uuid,uuid,text,text,text,text,numeric)
  from public,anon,authenticated,service_role;
grant execute on function public.island_wager_replay(uuid,uuid,uuid,text,text,text,text,numeric)
  to service_role;
