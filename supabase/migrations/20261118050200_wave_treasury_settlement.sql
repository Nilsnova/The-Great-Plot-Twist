-- MP-ECO-03: immutable shared-attempt accounting and durable personal completions.
-- Private write helpers belong inside checked bell/acknowledgment/canonical-close
-- transactions. This migration starts no wave, admits no island and enables no route.
-- Requires MP-ECO-02. Personal state hooks are supplied by MP-ECO-07 before use.

create table if not exists public.island_wave_accounting (
  wave_id uuid primary key,
  island_owner uuid not null,
  account_id uuid not null,
  run_epoch uuid not null,
  mode text not null default 'island_shared' check (mode = 'island_shared'),
  accounting_version smallint not null default 1 check (accounting_version = 1),
  wave_protocol smallint not null check (wave_protocol in (1,2)),
  played_wave integer not null check (played_wave > 0),
  seed integer not null check (seed >= 0),
  started_by uuid not null,
  starts_at timestamptz not null,
  maximum_seconds integer not null check (maximum_seconds >= 0),
  roster jsonb not null check (jsonb_typeof(roster) = 'array'),
  reward_basis jsonb not null check (jsonb_typeof(reward_basis) = 'object'),
  request_fingerprint jsonb not null check (jsonb_typeof(request_fingerprint) = 'object'),
  frozen_at timestamptz not null default clock_timestamp(),
  foreign key (account_id,island_owner,run_epoch)
    references public.island_economy_accounts(id,island_owner,run_epoch) on delete restrict
);
comment on table public.island_wave_accounting is
  'Immutable accepted-bell account/epoch, played-wave, roster/session/Engineer and reward basis. No cascading wave_runs FK: reset cannot erase old accounting or personal receipts.';

create table if not exists public.island_wave_participation_receipts (
  id uuid primary key default gen_random_uuid(),
  wave_id uuid not null references public.island_wave_accounting(wave_id) on delete restrict,
  player_id uuid not null,
  controlling_session_id uuid not null,
  confirmed_at timestamptz not null default clock_timestamp(),
  unique (wave_id,player_id)
);
comment on table public.island_wave_participation_receipts is
  'One checked post-combat-start confirmation per frozen player/wave/session. Falling, departure and disconnect do not revoke existing participation; membership/countdown alone creates none.';

create table if not exists public.island_wave_closures (
  wave_id uuid primary key references public.island_wave_accounting(wave_id) on delete restrict,
  outcome text not null check (outcome in ('won','lost','abandoned','expired')),
  earned_bonuses jsonb not null check (jsonb_typeof(earned_bonuses) = 'array'),
  loot_coins numeric not null check (public.island_treasury_whole(loot_coins,true)),
  treasury_receipt_id uuid references public.island_treasury_transactions(id) on delete restrict,
  terminal_fingerprint jsonb not null check (jsonb_typeof(terminal_fingerprint) = 'object'),
  closed_at timestamptz not null default clock_timestamp(),
  check ((loot_coins > 0) = (treasury_receipt_id is not null)),
  check (outcome = 'won' or (loot_coins = 0 and earned_bonuses = '[]'::jsonb))
);
comment on table public.island_wave_closures is
  'One immutable canonical terminal outcome and once-only originating-account reward per attempt. Rescue must finish before invoking canonical close; late claims cannot rewrite loss/expiry/abandonment.';

create table if not exists public.island_wave_completion_receipts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null,
  wave_id uuid not null references public.island_wave_closures(wave_id) on delete restrict,
  played_wave integer not null check (played_wave > 0),
  outcome text not null check (outcome in ('won','lost','abandoned','expired')),
  confirmed_participation boolean not null,
  engineer_commitment_id uuid,
  account_id uuid not null,
  run_epoch uuid not null,
  terminal_fingerprint jsonb not null check (jsonb_typeof(terminal_fingerprint) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (account_id,run_epoch)
    references public.island_economy_accounts(id,run_epoch) on delete restrict,
  unique (player_id,wave_id)
);
comment on table public.island_wave_completion_receipts is
  'Durable personal completion identity independent of current membership/epoch and deletable wave rows. Win eligibility requires confirmed participation; normal loss can satisfy only the frozen Engineer generation.';

do $$
declare v_table text;
begin
  foreach v_table in array array['island_wave_accounting','island_wave_participation_receipts',
    'island_wave_closures','island_wave_completion_receipts'] loop
    execute format('alter table public.%I enable row level security',v_table);
    execute format('revoke all on table public.%I from public,anon,authenticated,service_role',v_table);
    execute format('grant select on table public.%I to service_role',v_table);
    execute format('create or replace trigger %I before update or delete on public.%I '
      'for each row execute function public.island_treasury_immutable()',v_table||'_immutable',v_table);
  end loop;
end $$;

create or replace function public.island_wave_roster_canonical(p_roster jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare v_slot jsonb; v_result jsonb;
begin
  if jsonb_typeof(p_roster) is distinct from 'array'
    or jsonb_array_length(p_roster) not between 1 and 10 then raise exception 'invalid_wave_roster'; end if;
  for v_slot in select value from jsonb_array_elements(p_roster) loop
    if jsonb_typeof(v_slot) is distinct from 'object'
      or (select count(*) from jsonb_object_keys(v_slot)) <> 3
      or jsonb_typeof(v_slot->'playerId') is distinct from 'string'
      or jsonb_typeof(v_slot->'controllingSessionId') is distinct from 'string'
      or not (v_slot ? 'engineerCommitmentId') then raise exception 'invalid_wave_roster'; end if;
    if (v_slot->>'playerId')::uuid::text <> v_slot->>'playerId'
      or (v_slot->>'controllingSessionId')::uuid::text <> v_slot->>'controllingSessionId'
      or (v_slot->'engineerCommitmentId' <> 'null'::jsonb and
        (jsonb_typeof(v_slot->'engineerCommitmentId') is distinct from 'string'
         or (v_slot->>'engineerCommitmentId')::uuid::text <> v_slot->>'engineerCommitmentId'))
      then raise exception 'invalid_wave_roster'; end if;
  end loop;
  if (select count(distinct value->>'playerId') from jsonb_array_elements(p_roster))
       <> jsonb_array_length(p_roster)
    or (select count(distinct value->>'controllingSessionId') from jsonb_array_elements(p_roster))
       <> jsonb_array_length(p_roster) then raise exception 'invalid_wave_roster'; end if;
  select jsonb_agg(value order by value->>'playerId') into v_result from jsonb_array_elements(p_roster);
  return v_result;
exception when invalid_text_representation then raise exception 'invalid_wave_roster';
end;
$$;
comment on function public.island_wave_roster_canonical(jsonb) is
  'Private strict roster normalization: canonical UUIDs, explicit nullable Engineer generation, one player and controlling session each; existing ten-member game capacity.';

create or replace function public.island_wave_reward_valid(p_basis jsonb,p_wave integer)
returns boolean language plpgsql immutable set search_path = '' as $$
declare v_name text; v_value jsonb;
begin
  if jsonb_typeof(p_basis) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_basis)) <> 7
    or jsonb_typeof(p_basis->'playedWave') is distinct from 'number'
    or p_basis->>'playedWave' is distinct from p_wave::text
    or jsonb_typeof(p_basis->'bonuses') is distinct from 'object' then return false; end if;
  foreach v_name in array array['baseCoins','perWaveCoins','perHouseCoins','houseLevels','bossMultiplier'] loop
    if jsonb_typeof(p_basis->v_name) is distinct from 'string'
      or (p_basis->>v_name) !~ '^(0|[1-9][0-9]*)$' then return false; end if;
  end loop;
  if (p_basis->>'bossMultiplier')::numeric < 1 then return false; end if;
  for v_name,v_value in select key,value from jsonb_each(p_basis->'bonuses') loop
    if v_name not in ('galleon','finisher') or jsonb_typeof(v_value) <> 'string'
      or (v_value#>>'{}') !~ '^(0|[1-9][0-9]*)$' then return false; end if;
  end loop;
  return true;
end;
$$;
comment on function public.island_wave_reward_valid(jsonb,integer) is
  'Validate the version-one frozen basis with exact decimal strings and actual played wave. No personal-wallet ceiling or floating-point amount is accepted.';

create or replace function public.island_wave_completion_json(
  p_row public.island_wave_completion_receipts
) returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('id',p_row.id,'playerId',p_row.player_id,'waveId',p_row.wave_id,
    'playedWave',p_row.played_wave,'outcome',p_row.outcome,
    'confirmedParticipation',p_row.confirmed_participation,
    'engineerCommitmentId',p_row.engineer_commitment_id,'accountId',p_row.account_id,
    'runEpoch',p_row.run_epoch,'terminalFingerprint',p_row.terminal_fingerprint);
$$;
comment on function public.island_wave_completion_json(public.island_wave_completion_receipts) is
  'Personal immutable completion DTO. It contains no current money value and cannot reapply a reward or clear a newer Engineer obligation.';

create or replace function public.island_wave_accounting_result(p_wave_id uuid,p_repeat boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_attempt public.island_wave_accounting; v_close public.island_wave_closures;
  v_account public.island_economy_accounts; v_receipts jsonb;
begin
  select * into strict v_attempt from public.island_wave_accounting where wave_id=p_wave_id;
  select * into strict v_close from public.island_wave_closures where wave_id=p_wave_id;
  select * into strict v_account from public.island_economy_accounts where id=v_attempt.account_id;
  select coalesce(jsonb_agg(public.island_wave_completion_json(r) order by r.player_id),'[]'::jsonb)
    into v_receipts from public.island_wave_completion_receipts r where wave_id=p_wave_id;
  return jsonb_build_object('status','done','repeat',p_repeat,'waveId',p_wave_id,
    'playedWave',v_attempt.played_wave,'outcome',v_close.outcome,
    'lootCoins',trunc(v_close.loot_coins)::text,'treasuryReceiptId',v_close.treasury_receipt_id,
    'economy',public.island_treasury_envelope(v_account),'completions',v_receipts);
end;
$$;
comment on function public.island_wave_accounting_result(uuid,boolean) is
  'Return original canonical completion facts plus fresh state of their original account, even when that run has since retired.';

create or replace function public.island_wave_accounting_freeze_locked(
  p_wave_id uuid,p_account_id uuid,p_run_epoch uuid,p_roster jsonb,p_reward_basis jsonb
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_account public.island_economy_accounts; v_state public.island_economy_state;
  v_run public.wave_runs; v_old public.island_wave_accounting; v_roster jsonb;
  v_slot jsonb; v_personal jsonb; v_fingerprint jsonb; v_houses bigint; v_protocol smallint;
begin
  v_roster := public.island_wave_roster_canonical(p_roster);
  v_fingerprint := jsonb_build_object('mode','island_shared','version',1,'waveId',p_wave_id,
    'accountId',p_account_id,'runEpoch',p_run_epoch,'roster',v_roster,'rewardBasis',p_reward_basis);
  select * into v_old from public.island_wave_accounting where wave_id=p_wave_id;
  if found then
    if v_old.request_fingerprint <> v_fingerprint then raise exception 'wave_accounting_conflict'; end if;
    return jsonb_build_object('status','frozen','repeat',true,'waveId',p_wave_id);
  end if;
  select * into v_account from public.island_economy_accounts where id=p_account_id;
  if not found then raise exception 'economy_context_required'; end if;
  perform public.island_treasury_lock_scope(v_account.island_owner);
  select * into strict v_account from public.island_economy_accounts where id=p_account_id for update;
  if v_account.run_epoch is distinct from p_run_epoch then raise exception 'economy_epoch_mismatch'; end if;
  for v_slot in select value from jsonb_array_elements(v_roster) loop
    v_personal := public.personal_captain_lock_state_locked((v_slot->>'playerId')::uuid);
    if v_personal#>>'{captain,assignmentWaveId}' is distinct from p_wave_id::text then
      raise exception 'not_in_wave'; end if;
    if v_personal#>>'{captain,engineerCommitment,id}' is distinct from
      v_slot->>'engineerCommitmentId' then raise exception 'wave_roster_commitment_conflict'; end if;
  end loop;
  perform 1 from public.islands where player_id=v_account.island_owner for update;
  select * into v_state from public.island_economy_state
    where island_owner=v_account.island_owner for update;
  if not found or v_state.current_account_id is distinct from p_account_id
    or v_state.run_epoch is distinct from p_run_epoch then raise exception 'economy_epoch_mismatch'; end if;
  if v_account.state <> 'active' or v_state.admission_state <> 'active' then
    raise exception 'economy_path_unavailable'; end if;
  select * into v_run from public.wave_runs where id=p_wave_id for update;
  if not found or v_run.place <> 'island' or v_run.island_owner <> v_account.island_owner then
    raise exception 'wave_accounting_missing'; end if;
  -- A competing legacy finish serializes on this wave row before it can pay.
  if v_run.finished_at is not null or exists (select 1 from public.wallet_transactions
    where reason='pirate_loot' and (ref='wave:'||p_wave_id::text
      or ref like 'wave:'||p_wave_id::text||':%')) then
    raise exception 'wave_accounting_already_closed'; end if;
  select * into v_old from public.island_wave_accounting where wave_id=p_wave_id;
  if found then
    if v_old.request_fingerprint <> v_fingerprint then raise exception 'wave_accounting_conflict'; end if;
    return jsonb_build_object('status','frozen','repeat',true,'waveId',p_wave_id);
  end if;
  if not public.island_wave_reward_valid(p_reward_basis,v_run.wave) then
    raise exception 'invalid_wave_reward'; end if;
  select coalesce(sum(level),0) into v_houses from public.islet_buildings
    where player_id=v_account.island_owner and building_type='house';
  if (p_reward_basis->>'houseLevels')::numeric <> v_houses then
    raise exception 'wave_reward_houses_changed'; end if;
  for v_slot in select value from jsonb_array_elements(v_roster) loop
    if (v_slot->>'playerId')::uuid <> v_account.island_owner and not exists (
      select 1 from public.island_members where island_owner=v_account.island_owner
        and player_id=(v_slot->>'playerId')::uuid and left_at is null) then
      raise exception 'not_member'; end if;
  end loop;
  select coalesce((select wave_protocol from public.recovery_wave_states where wave_id=p_wave_id),1)
    into v_protocol;
  insert into public.island_wave_accounting(wave_id,island_owner,account_id,run_epoch,
    wave_protocol,played_wave,seed,started_by,starts_at,maximum_seconds,roster,reward_basis,
    request_fingerprint) values(p_wave_id,v_account.island_owner,p_account_id,p_run_epoch,
    v_protocol,v_run.wave,v_run.seed,v_run.started_by,v_run.starts_at,v_run.maximum_seconds,
    v_roster,p_reward_basis,v_fingerprint);
  return jsonb_build_object('status','frozen','repeat',false,'waveId',p_wave_id);
end;
$$;
comment on function public.island_wave_accounting_freeze_locked(uuid,uuid,uuid,jsonb,jsonb) is
  'Private accepted-bell hook. Caller prelocks scope/account/personal state before creating the wave, attaches checked personal slots, then freezes this accounting in the SAME transaction. No separate route/RPC activation.';

create or replace function public.island_wave_confirm_participation_locked(
  p_wave_id uuid,p_player_id uuid,p_controlling_session_id uuid
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_attempt public.island_wave_accounting; v_old public.island_wave_participation_receipts;
  v_slot jsonb; v_personal jsonb; v_now timestamptz;
begin
  select * into v_attempt from public.island_wave_accounting where wave_id=p_wave_id;
  if not found then raise exception 'wave_accounting_missing'; end if;
  perform public.island_treasury_lock_scope(v_attempt.island_owner);
  perform 1 from public.island_economy_accounts where id=v_attempt.account_id for update;
  v_personal := public.personal_captain_lock_state_locked(p_player_id);
  perform 1 from public.islands where player_id=v_attempt.island_owner for update;
  perform 1 from public.wave_runs where id=p_wave_id for update;
  select value into v_slot from jsonb_array_elements(v_attempt.roster)
    where (value->>'playerId')::uuid=p_player_id;
  if not found or (v_slot->>'controllingSessionId')::uuid is distinct from p_controlling_session_id
    then raise exception 'not_in_wave'; end if;
  select * into v_old from public.island_wave_participation_receipts
    where wave_id=p_wave_id and player_id=p_player_id;
  if found then
    if v_old.controlling_session_id is distinct from p_controlling_session_id then
      raise exception 'not_in_wave'; end if;
    return jsonb_build_object('status','confirmed','repeat',true,'id',v_old.id);
  end if;
  if v_personal#>>'{captain,assignmentWaveId}' is distinct from p_wave_id::text then
    raise exception 'not_in_wave'; end if;
  if p_player_id <> v_attempt.island_owner and not exists (select 1 from public.island_members
    where island_owner=v_attempt.island_owner and player_id=p_player_id and left_at is null)
    then raise exception 'not_member'; end if;
  v_now := clock_timestamp();
  if v_now < v_attempt.starts_at then raise exception 'wave_not_started'; end if;
  if v_now >= v_attempt.starts_at+make_interval(secs=>v_attempt.maximum_seconds)
    or exists(select 1 from public.island_wave_closures where wave_id=p_wave_id) then
    raise exception 'wave_closed'; end if;
  insert into public.island_wave_participation_receipts(wave_id,player_id,controlling_session_id)
    values(p_wave_id,p_player_id,p_controlling_session_id) returning * into v_old;
  return jsonb_build_object('status','confirmed','repeat',false,'id',v_old.id);
end;
$$;
comment on function public.island_wave_confirm_participation_locked(uuid,uuid,uuid) is
  'Private checked live-session acknowledgment hook after combat starts. Verifies frozen token and current global wave assignment; caller also verifies current controlling-session generation/revocation under the same transaction.';

create or replace function public.island_wave_accounting_settle_locked(
  p_wave_id uuid,p_outcome text,p_earned_bonuses jsonb
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_attempt public.island_wave_accounting; v_close public.island_wave_closures;
  v_account public.island_economy_accounts; v_earned jsonb; v_name text; v_slot jsonb;
  v_run public.wave_runs;
  v_fingerprint jsonb; v_loot numeric := 0; v_bonus numeric := 0; v_money jsonb;
  v_receipt_id uuid; v_confirmed boolean; v_effect jsonb;
begin
  if p_outcome is null or p_outcome not in ('won','lost','abandoned','expired')
    or jsonb_typeof(p_earned_bonuses) is distinct from 'array' then
    raise exception 'invalid_wave_outcome'; end if;
  if exists(select 1 from jsonb_array_elements(p_earned_bonuses)
    where jsonb_typeof(value) is distinct from 'string') then raise exception 'invalid_wave_reward'; end if;
  select * into v_attempt from public.island_wave_accounting where wave_id=p_wave_id;
  if not found then raise exception 'wave_accounting_missing'; end if;
  select coalesce(jsonb_agg(value order by value),'[]'::jsonb) into v_earned
    from (select distinct value from jsonb_array_elements_text(p_earned_bonuses)) as names;
  if p_outcome <> 'won' and v_earned <> '[]'::jsonb then raise exception 'invalid_wave_reward'; end if;
  for v_name in select value from jsonb_array_elements_text(v_earned) loop
    if not (v_attempt.reward_basis->'bonuses' ? v_name) then raise exception 'invalid_wave_reward'; end if;
    v_bonus := v_bonus+(v_attempt.reward_basis#>>array['bonuses',v_name])::numeric;
  end loop;
  v_fingerprint := jsonb_build_object('mode',v_attempt.mode,'version',v_attempt.accounting_version,
    'waveId',p_wave_id,'accountId',v_attempt.account_id,'runEpoch',v_attempt.run_epoch,
    'playedWave',v_attempt.played_wave,'outcome',p_outcome,'earnedBonuses',v_earned);
  perform public.island_treasury_lock_scope(v_attempt.island_owner);
  select * into strict v_account from public.island_economy_accounts
    where id=v_attempt.account_id and run_epoch=v_attempt.run_epoch for update;
  select * into v_close from public.island_wave_closures where wave_id=p_wave_id;
  if found then
    if v_close.terminal_fingerprint <> v_fingerprint then raise exception 'wave_outcome_conflict'; end if;
    return public.island_wave_accounting_result(p_wave_id,true);
  end if;
  if p_outcome in ('won','lost') and clock_timestamp()<v_attempt.starts_at then
    raise exception 'wave_not_started'; end if;
  for v_slot in select value from jsonb_array_elements(v_attempt.roster) loop
    perform public.personal_captain_lock_state_locked((v_slot->>'playerId')::uuid);
  end loop;
  perform 1 from public.islands where player_id=v_attempt.island_owner for update;
  select * into v_run from public.wave_runs where id=p_wave_id for update;
  if not found then raise exception 'wave_accounting_missing'; end if;
  if v_run.finished_at is not null and
    ((p_outcome='won') is distinct from v_run.survived
      or (v_run.expired and p_outcome in ('won','lost'))) then
    raise exception 'wave_outcome_conflict'; end if;
  -- This helper does not choose/verify combat outcomes or close HP/session state.
  -- Its enclosing lifecycle transaction must establish that canonical authority.
  if p_outcome='won' then
    v_loot := ((v_attempt.reward_basis->>'baseCoins')::numeric
      +(v_attempt.reward_basis->>'perWaveCoins')::numeric*v_attempt.played_wave
      +(v_attempt.reward_basis->>'perHouseCoins')::numeric
        *(v_attempt.reward_basis->>'houseLevels')::numeric+v_bonus)
      *(v_attempt.reward_basis->>'bossMultiplier')::numeric;
  end if;
  if v_loot > 0 then
    v_money := public.island_treasury_credit(v_attempt.started_by,v_attempt.account_id,
      v_attempt.run_epoch,public.island_economy_system_uid(p_wave_id,'wave_loot'),
      'pirate_loot','wave:'||p_wave_id::text,v_loot);
    if v_money->>'status' is distinct from 'done' then raise exception 'wave_treasury_credit_failed'; end if;
    v_receipt_id := (v_money#>>'{receipt,id}')::uuid;
  end if;
  insert into public.island_wave_closures(wave_id,outcome,earned_bonuses,loot_coins,
    treasury_receipt_id,terminal_fingerprint)
    values(p_wave_id,p_outcome,v_earned,v_loot,v_receipt_id,v_fingerprint);
  for v_slot in select value from jsonb_array_elements(v_attempt.roster) loop
    select exists(select 1 from public.island_wave_participation_receipts
      where wave_id=p_wave_id and player_id=(v_slot->>'playerId')::uuid) into v_confirmed;
    insert into public.island_wave_completion_receipts(player_id,wave_id,played_wave,outcome,
      confirmed_participation,engineer_commitment_id,account_id,run_epoch,terminal_fingerprint)
      values((v_slot->>'playerId')::uuid,p_wave_id,v_attempt.played_wave,p_outcome,v_confirmed,
        (v_slot->>'engineerCommitmentId')::uuid,v_attempt.account_id,v_attempt.run_epoch,v_fingerprint);
    v_effect := public.personal_captain_complete_locked((v_slot->>'playerId')::uuid,
      p_wave_id,v_attempt.played_wave,p_outcome,v_confirmed,(v_slot->>'engineerCommitmentId')::uuid);
    if v_effect is null or v_effect->>'status'='refused' then
      raise exception 'wave_personal_completion_failed'; end if;
  end loop;
  return public.island_wave_accounting_result(p_wave_id,false);
end;
$$;
comment on function public.island_wave_accounting_settle_locked(uuid,text,jsonb) is
  'Private canonical-close hook in the SAME lifecycle transaction as final outcome/HP/session closure. Locks origin account then personal states before island/wave; credits once and applies real personal generation-specific effects atomically. Never call from participant acknowledgment.';

create or replace function public.island_wave_completion_receipt(p_player_id uuid,p_wave_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_receipt public.island_wave_completion_receipts;
begin
  select * into v_receipt from public.island_wave_completion_receipts
    where player_id=p_player_id and wave_id=p_wave_id;
  if not found then return jsonb_build_object('status','refused','reason','not_in_wave'); end if;
  return jsonb_build_object('status','done','receipt',public.island_wave_completion_json(v_receipt));
end;
$$;
comment on function public.island_wave_completion_receipt(uuid,uuid) is
  'Service-only historical read for the authenticated player ID. No membership/current-epoch check, profile effect or financial write; a former participant retains their own receipt after reset.';

create or replace function public.island_wave_no_personal_loot()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_wave_id uuid;
begin
  if new.reason <> 'pirate_loot' or new.ref !~
    '^wave:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})?$'
    then return new; end if;
  v_wave_id := split_part(new.ref,':',2)::uuid;
  if exists(select 1 from public.island_wave_accounting where wave_id=v_wave_id) then
    raise exception 'economy_context_required'; end if;
  return new;
end;
$$;
comment on function public.island_wave_no_personal_loot() is
  'Narrow no-lock legacy money guard. Legacy finish must already hold its wave row before paying; freeze holds that row while excluding earlier payouts. No GUC bypass or unrelated personal-wallet change. Later route compatibility still needs explicit 409 guards.';
create or replace trigger island_wave_no_personal_loot
  before insert on public.wallet_transactions for each row
  execute function public.island_wave_no_personal_loot();

-- Private helpers cannot be invoked directly by browser or service-role RPC callers.
revoke all on function public.island_wave_roster_canonical(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.island_wave_reward_valid(jsonb,integer) from public,anon,authenticated,service_role;
revoke all on function public.island_wave_completion_json(public.island_wave_completion_receipts) from public,anon,authenticated,service_role;
revoke all on function public.island_wave_accounting_result(uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function public.island_wave_accounting_freeze_locked(uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.island_wave_confirm_participation_locked(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.island_wave_accounting_settle_locked(uuid,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.island_wave_no_personal_loot() from public,anon,authenticated,service_role;
revoke all on function public.island_wave_completion_receipt(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.island_wave_completion_receipt(uuid,uuid) to service_role;
