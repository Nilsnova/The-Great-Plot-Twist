-- Shared research, tower progression and wreck funding. Used by service-only RPCs.
-- No admission, route activation or personal wallet change is performed here.

-- Inline checks preserve legacy invoker inserts without granting private treasury helpers.
alter table public.island_research add column if not exists economy_revision numeric not null default 0
  check (economy_revision::text not in ('NaN','Infinity','-Infinity')
    and economy_revision = trunc(economy_revision) and economy_revision >= 0);
alter table public.islet_buildings add column if not exists economy_upgrade_revision numeric not null default 0
  check (economy_upgrade_revision::text not in ('NaN','Infinity','-Infinity')
    and economy_upgrade_revision = trunc(economy_upgrade_revision) and economy_upgrade_revision >= 0);
comment on column public.island_research.economy_revision is
  'Shared progression CAS revision; every successful research change advances it, including switches back to a former choice.';
comment on column public.islet_buildings.economy_upgrade_revision is
  'Shared skill/tree CAS revision. Used together with the immutable building instance and full expected state.';

-- Repeated legitimate choice switches have no lifetime total-spend ceiling.
alter table public.island_research alter column coins_paid type numeric using coins_paid::numeric;
alter table public.island_research drop constraint if exists island_research_coins_paid_range;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.island_research'::regclass
    and conname = 'island_research_coins_paid_integral') then
    alter table public.island_research add constraint island_research_coins_paid_integral
      check (coins_paid::text not in ('NaN','Infinity','-Infinity')
        and coins_paid = trunc(coins_paid) and coins_paid > 0);
  end if;
end; $$;

-- Original domain outcomes remain readable even after the live choice changes again.
create table if not exists public.island_progression_receipts (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  action_uid text not null check (action_uid ~ '^[A-Za-z0-9_-]{8,64}$'),
  account_id uuid not null,
  run_epoch uuid not null,
  action text not null check (action in ('research','specialise','tower_tree','wreck')),
  request_fingerprint jsonb not null check (jsonb_typeof(request_fingerprint) = 'object'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  treasury_receipt_id uuid unique,
  created_at timestamptz not null default clock_timestamp(),
  unique (actor_id, action_uid),
  unique (account_id, action_uid),
  foreign key (account_id, run_epoch)
    references public.island_economy_accounts(id, run_epoch) on delete restrict,
  foreign key (treasury_receipt_id, account_id, run_epoch)
    references public.island_treasury_transactions(id, account_id, run_epoch) on delete restrict
);
comment on table public.island_progression_receipts is
  'Immutable research, tower skill/tree and wreck outcomes, including free roles and no-op skill selections. The common operation claim binds root actor UID across domains.';
comment on column public.island_progression_receipts.actor_id is 'Original authenticated initiator, without profile cascade.';
comment on column public.island_progression_receipts.action_uid is 'Root operation UID, distinct from deterministic financial child UIDs.';
comment on column public.island_progression_receipts.account_id is 'Immutable originating shared island account.';
comment on column public.island_progression_receipts.run_epoch is 'Original island run fence.';
comment on column public.island_progression_receipts.action is 'Research, tower skill, tree step or wreck contribution.';
comment on column public.island_progression_receipts.request_fingerprint is 'Complete original user intent, actor, account and epoch. Excludes changing server catalogue rules.';
comment on column public.island_progression_receipts.result is 'Original exact charge and domain state at commit; never reconstructed from current assets.';
comment on column public.island_progression_receipts.treasury_receipt_id is 'Related debit receipt; null only when the successful action costs zero coins.';
comment on column public.island_progression_receipts.created_at is 'Canonical domain completion time.';
alter table public.island_progression_receipts enable row level security;
revoke all on table public.island_progression_receipts from public, anon, authenticated, service_role;
grant select on table public.island_progression_receipts to service_role;

-- Privileged accidental updates must not rewrite completed progression history.
create or replace function public.island_progression_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'progression_history_immutable'; end;
$$;
create or replace trigger island_progression_receipts_immutable
  before update or delete on public.island_progression_receipts
  for each row execute function public.island_progression_immutable();

-- Exact state shapes are also used for request comparisons under the island lock.
create or replace function public.island_progression_research_state(p_row public.island_research)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('tier',coalesce(p_row.tier,0),'choice2',p_row.choice_2,
    'choice3',p_row.choice_3,'revision',trunc(coalesce(p_row.economy_revision,0))::text);
$$;
create or replace function public.island_progression_building_state(p_row public.islet_buildings)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('instanceId',p_row.recovery_instance_id,'kind',p_row.building_type,
    'level',p_row.level,'spec',p_row.spec,'treeA',p_row.tree_a,'treeB',p_row.tree_b,
    'revision',trunc(p_row.economy_upgrade_revision)::text);
$$;

-- Current balances are disclosed only to a current member; original own effects remain repeatable.
create or replace function public.island_progression_result(p_id uuid, p_repeat boolean, p_show_current boolean)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_receipt public.island_progression_receipts; v_account public.island_economy_accounts;
begin
  select * into strict v_receipt from public.island_progression_receipts where id = p_id;
  select * into strict v_account from public.island_economy_accounts where id = v_receipt.account_id;
  return jsonb_build_object('status','done','repeat',p_repeat,
    'currentEconomy',case when p_show_current then public.island_treasury_envelope(v_account) end,
    'receipt',jsonb_build_object('receiptId',v_receipt.id,'actorId',v_receipt.actor_id,
      'actionUid',v_receipt.action_uid,'action',v_receipt.action,
      'origin',jsonb_build_object('mode','island_shared','version',1,
        'islandOwner',v_account.island_owner,'accountId',v_account.id,'runEpoch',v_account.run_epoch),
      'result',v_receipt.result));
end;
$$;

-- Static request structure is checked before resolving any account; state comparisons below
-- require exact JSON types and all expected keys, so missing and null never become defaults.
create or replace function public.island_progression_valid_intent(p_intent jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare v_action text; v_keys text[];
begin
  if jsonb_typeof(p_intent) is distinct from 'object' then return false; end if;
  v_action := p_intent ->> 'action';
  v_keys := case v_action
    when 'research' then array['action','branch','tier','choice','change','expected','quotedCoins']
    when 'specialise' then array['action','spot','spec','expected','quotedCoins']
    when 'tower_tree' then array['action','spot','path','tier','expected','quotedCoins']
    when 'wreck' then array['action','amount','quotedCoins'] end;
  if v_keys is null or not (p_intent ?& v_keys)
    or (select count(*) from jsonb_object_keys(p_intent)) <> cardinality(v_keys)
    or jsonb_typeof(p_intent -> 'quotedCoins') is distinct from 'string'
    or (p_intent ->> 'quotedCoins') !~ '^(0|[1-9][0-9]*)$' then return false; end if;
  if v_action in ('research','tower_tree') and
    (jsonb_typeof(p_intent -> 'tier') is distinct from 'number'
      or (p_intent ->> 'tier') !~ '^[1-3]$') then return false; end if;
  if v_action = 'research' then
    return jsonb_typeof(p_intent -> 'branch') = 'string'
      and p_intent ->> 'branch' in ('cannon','mortar','wall','watchtower')
      and jsonb_typeof(p_intent -> 'change') = 'boolean'
      and jsonb_typeof(p_intent -> 'expected') = 'object'
      and ((p_intent ->> 'tier' = '1' and p_intent -> 'choice' = 'null'::jsonb)
        or (p_intent ->> 'tier' <> '1' and jsonb_typeof(p_intent -> 'choice') = 'string'));
  elsif v_action = 'wreck' then
    return jsonb_typeof(p_intent -> 'amount') = 'number' and (p_intent ->> 'amount') ~ '^[1-9][0-9]*$';
  end if;
  return jsonb_typeof(p_intent -> 'spot') = 'string'
    and jsonb_typeof(p_intent -> 'expected') = 'object'
    and ((v_action = 'specialise' and jsonb_typeof(p_intent -> 'spec') = 'string')
      or (v_action = 'tower_tree' and p_intent ->> 'path' in ('a','b')));
end;
$$;

-- A downstream refusal aborts the enclosing subtransaction, including an early root claim.
create or replace function public.island_progression_refuse(p_reason text)
returns jsonb language plpgsql volatile set search_path = '' as $$
begin raise exception using message = 'progression_refused', detail = p_reason; end;
$$;

-- One transaction checks admission/membership/phase, then binds the intent, charges and
-- updates assets. The catalogue rule is trusted server input, never a browser price.
create or replace function public.island_economy_progression(
  p_actor_id uuid, p_account_id uuid, p_run_epoch uuid, p_action_uid text,
  p_intent jsonb, p_rule jsonb
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_account public.island_economy_accounts; v_state public.island_economy_state;
  v_island public.islands; v_row public.island_research; v_building public.islet_buildings;
  v_existing public.island_progression_receipts;
  v_action text; v_branch text; v_spot text; v_spec text; v_choice text; v_before text; v_path text;
  v_tier integer; v_now integer; v_other integer; v_goal integer; v_member boolean;
  v_recovery_version integer;
  v_price numeric; v_quote numeric; v_claim jsonb; v_finance jsonb; v_recovery jsonb;
  v_fingerprint jsonb; v_result jsonb; v_research jsonb; v_structure jsonb;
  v_id uuid; v_finance_id uuid; v_child_uid text; v_reason text; v_detail text;
begin
  if p_actor_id is null or p_account_id is null or p_run_epoch is null
    or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
    or not coalesce(public.island_progression_valid_intent(p_intent),false)
    or jsonb_typeof(p_rule) is distinct from 'object' then
    return jsonb_build_object('status','refused','reason','invalid_progression');
  end if;
  v_action := p_intent ->> 'action'; v_quote := (p_intent ->> 'quotedCoins')::numeric;
  select * into v_account from public.island_economy_accounts where id = p_account_id;
  if not found then return jsonb_build_object('status','refused','reason','account_missing'); end if;
  perform public.island_treasury_lock_scope(v_account.island_owner);
  select * into strict v_account from public.island_economy_accounts where id = p_account_id for update;
  v_fingerprint := jsonb_build_object('actor',p_actor_id,'account',p_account_id,'epoch',p_run_epoch,'intent',p_intent);
  v_claim := public.island_economy_claim_operation_locked(p_actor_id,p_account_id,p_run_epoch,
    p_action_uid,'progression:'||v_action,v_fingerprint);
  if v_claim ->> 'status' = 'refused' then return v_claim; end if;
  if v_claim ->> 'status' not in ('claimed','replay') or v_claim ->> 'status' is null then
    raise exception 'progression_operation_unavailable';
  end if;
  select * into v_existing from public.island_progression_receipts
   where (actor_id = p_actor_id and action_uid = p_action_uid)
      or (account_id = p_account_id and action_uid = p_action_uid);
  select * into strict v_island from public.islands where player_id = v_account.island_owner for update;
  v_member := p_actor_id = v_account.island_owner or exists (
    select 1 from public.island_members where island_owner = v_account.island_owner
      and player_id = p_actor_id and left_at is null);
  select * into v_state from public.island_economy_state where island_owner = v_account.island_owner for update;
  if v_existing.id is not null then
    if v_existing.request_fingerprint <> v_fingerprint then
      return public.island_progression_refuse('action_conflict');
    end if;
    return public.island_progression_result(v_existing.id,true,coalesce(
      v_member and v_account.state = 'active' and v_state.current_account_id = p_account_id
      and v_state.run_epoch = p_run_epoch and v_state.admission_state = 'active',false));
  end if;
  if v_claim ->> 'status' = 'replay' then raise exception 'progression_operation_unavailable'; end if;
  if not v_member then return public.island_progression_refuse('not_member'); end if;
  if v_account.run_epoch <> p_run_epoch then
    return public.island_progression_refuse('epoch_mismatch');
  end if;
  if v_account.state <> 'active' or v_state.current_account_id is distinct from p_account_id
    or v_state.run_epoch is distinct from p_run_epoch or v_state.admission_state <> 'active' then
    return public.island_progression_refuse('path_unavailable');
  end if;
  v_recovery_version := public.island_economy_require_idle_locked(v_account.island_owner);
  if jsonb_typeof(p_rule -> 'unlockWave') is distinct from 'number'
    or (p_rule ->> 'unlockWave') !~ '^(0|[1-9][0-9]*)$' then
    return public.island_progression_refuse('invalid_progression');
  end if;
  if v_island.wave_best < (p_rule ->> 'unlockWave')::integer then
    return public.island_progression_refuse('locked');
  end if;
  if v_action = 'wreck' then
    if jsonb_typeof(p_rule -> 'goal') is distinct from 'number'
      or (p_rule ->> 'goal') !~ '^[1-9][0-9]*$' then
      return public.island_progression_refuse('invalid_progression');
    end if;
    v_goal := (p_rule ->> 'goal')::integer;
    if v_island.wreck_paid >= v_goal then return public.island_progression_refuse('repaired'); end if;
    v_price := least((p_intent ->> 'amount')::numeric,v_goal - v_island.wreck_paid);
    if v_price > v_quote or v_quote > (p_intent ->> 'amount')::numeric then
      return public.island_progression_refuse('stale_progression_quote');
    end if;
  else
    if jsonb_typeof(p_rule -> 'price') is distinct from 'string'
      or (p_rule ->> 'price') !~ '^(0|[1-9][0-9]*)$' then
      return public.island_progression_refuse('invalid_progression');
    end if;
    v_price := (p_rule ->> 'price')::numeric;
    if v_price <> v_quote then return public.island_progression_refuse('stale_progression_quote'); end if;
  end if;
  if v_action = 'research' then
    v_branch := p_intent ->> 'branch'; v_tier := (p_intent ->> 'tier')::integer; v_choice := p_intent ->> 'choice';
    select * into v_row from public.island_research
     where island_owner = v_account.island_owner and branch = v_branch for update;
    if p_intent -> 'expected' <> public.island_progression_research_state(v_row) then
      return public.island_progression_refuse('stale_progression_quote');
    end if;
    if v_price <= 0 then return public.island_progression_refuse('invalid_progression'); end if;
    if v_tier = 1 and v_row.island_owner is not null then
      return public.island_progression_refuse('known');
    elsif v_tier > 1 then
      if v_row.island_owner is null or v_row.tier < v_tier - 1 then
        return public.island_progression_refuse('needs_tier');
      end if;
      v_before := case v_tier when 2 then v_row.choice_2 else v_row.choice_3 end;
      if v_before = v_choice then return public.island_progression_refuse('known'); end if;
      if v_before is not null and not (p_intent ->> 'change')::boolean then
        return public.island_progression_refuse('closed');
      end if;
    end if;
    if v_recovery_version = 1 and v_branch = 'wall' and v_tier = 2 and v_choice = 'mason_drill' then
      return public.island_progression_refuse('recovery_option_retired');
    end if;
  elsif v_action in ('specialise','tower_tree') then
    v_spot := p_intent ->> 'spot';
    select * into v_building from public.islet_buildings where player_id = v_account.island_owner and plot = v_spot for update;
    if not found then return public.island_progression_refuse('not_built'); end if;
    if p_intent -> 'expected' <> public.island_progression_building_state(v_building) then
      return public.island_progression_refuse('stale_progression_quote');
    end if;
    if v_action = 'specialise' then
      v_branch := p_rule ->> 'branch'; v_spec := p_intent ->> 'spec';
      if v_branch is distinct from v_building.building_type or jsonb_typeof(p_rule -> 'capstone') is distinct from 'boolean' then
        return public.island_progression_refuse('invalid_progression');
      end if;
      if v_branch = 'house' then
        if v_building.level < 2 then return public.island_progression_refuse('needs_level'); end if;
        if v_price <> 0 then return public.island_progression_refuse('invalid_progression'); end if;
      else
        if v_price <= 0 then return public.island_progression_refuse('invalid_progression'); end if;
        select * into v_row from public.island_research
         where island_owner = v_account.island_owner and branch = v_branch for update;
        if v_row.island_owner is null or ((p_rule ->> 'capstone')::boolean and v_row.choice_3 is distinct from v_spec) then
          return public.island_progression_refuse('not_researched');
        end if;
      end if;
      if v_building.spec = v_spec then
        v_price := 0;
      elsif v_recovery_version = 1 and v_spec in ('workshop','quick_mend') then
        return public.island_progression_refuse('recovery_option_retired');
      end if;
    else
      v_tier := (p_intent ->> 'tier')::integer; v_path := p_intent ->> 'path';
      if v_price <= 0 or jsonb_typeof(p_rule -> 'level') is distinct from 'number'
        or (p_rule ->> 'level') !~ '^[1-5]$' then
        return public.island_progression_refuse('invalid_progression');
      end if;
      if v_building.level < (p_rule ->> 'level')::integer then
        return public.island_progression_refuse('needs_level');
      end if;
      v_now := case v_path when 'a' then v_building.tree_a else v_building.tree_b end;
      v_other := case v_path when 'a' then v_building.tree_b else v_building.tree_a end;
      if v_now >= v_tier then return public.island_progression_refuse('known'); end if;
      if v_now < v_tier - 1 then return public.island_progression_refuse('needs_tier'); end if;
      if v_tier > 1 and v_other > 1 then return public.island_progression_refuse('closed'); end if;
    end if;
  end if;
  if v_account.balance_coins - v_account.committed_coins < v_price then
    return public.island_progression_refuse('insufficient_funds');
  end if;
  if v_price > 0 then
    v_child_uid := public.island_economy_effect_uid((v_claim ->> 'operationId')::uuid,'charge');
    v_reason := case v_action when 'research' then 'tech_research' when 'specialise' then 'tower_skill'
      when 'tower_tree' then 'tower_tree' else 'wreck_repair' end;
    v_finance := public.island_treasury_spend(p_actor_id,p_account_id,p_run_epoch,v_child_uid,
      v_reason,'progression:'||v_child_uid,v_price);
    if v_finance ->> 'status' is distinct from 'done'
      or v_finance -> 'repeat' is distinct from 'false'::jsonb
      or jsonb_typeof(v_finance #> '{receipt,id}') is distinct from 'string'
      or (v_finance #>> '{receipt,id}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'progression_financial_conflict';
    end if;
    -- The reply must prove this exact committed child debit, not another receipt
    -- from the same account or a successful-looking response with different fields.
    select id into v_finance_id from public.island_treasury_transactions
     where id = (v_finance #>> '{receipt,id}')::uuid and account_id = p_account_id
       and run_epoch = p_run_epoch and actor_id = p_actor_id and action_uid = v_child_uid
       and kind = 'spend' and reason = v_reason and reference = 'progression:'||v_child_uid
       and balance_delta = -v_price and committed_delta = 0 and source_reservation_id is null;
    if not found then raise exception 'progression_financial_conflict'; end if;
    if v_finance -> 'receipt' is distinct from
       (public.island_treasury_result(v_finance_id,false) -> 'receipt') then
      raise exception 'progression_financial_conflict';
    end if;
  end if;
  v_recovery := public.structure_recovery_mutation_begin(v_account.island_owner);
  if v_action = 'research' then
    if v_tier = 1 then
      insert into public.island_research(island_owner,branch,researched_by,coins_paid,ref,economy_revision)
      values(v_account.island_owner,v_branch,p_actor_id,v_price,'research:'||p_action_uid,1) returning * into v_row;
    else
      update public.island_research set tier = greatest(tier,v_tier),
        choice_2 = case when v_tier = 2 then v_choice else choice_2 end,
        choice_3 = case when v_tier = 3 then v_choice else choice_3 end,
        coins_paid = coins_paid + v_price, ref = 'research:'||p_action_uid, economy_revision = economy_revision + 1
       where island_owner = v_account.island_owner and branch = v_branch returning * into v_row;
      if v_tier = 3 and v_before is not null then
        update public.islet_buildings set spec = null, economy_upgrade_revision = economy_upgrade_revision + 1
         where player_id = v_account.island_owner and building_type = v_branch and spec = v_before;
      end if;
    end if;
    v_research := public.island_progression_research_state(v_row) ||
      jsonb_build_object('branch',v_branch,'coinsPaid',trunc(v_row.coins_paid)::text);
  elsif v_action in ('specialise','tower_tree') then
    update public.islet_buildings set
      spec = case when v_action = 'specialise' then v_spec else spec end,
      tree_a = case when v_action = 'tower_tree' and v_path = 'a' then v_tier else tree_a end,
      tree_b = case when v_action = 'tower_tree' and v_path = 'b' then v_tier else tree_b end,
      economy_upgrade_revision = economy_upgrade_revision + 1
     where player_id = v_account.island_owner and plot = v_spot returning * into v_building;
    v_structure := public.island_progression_building_state(v_building) || jsonb_build_object('spot',v_spot);
  else
    update public.islands set wreck_paid = wreck_paid + v_price::integer where player_id = v_account.island_owner
      returning * into v_island;
  end if;
  perform public.structure_recovery_mutation_finish(v_account.island_owner,v_recovery);
  v_result := jsonb_build_object('chargedCoins',trunc(v_price)::text,'treasuryReceiptId',v_finance_id,
    'research',v_research,'building',v_structure,'wreckPaid',case when v_action = 'wreck' then v_island.wreck_paid end);
  insert into public.island_progression_receipts(actor_id,action_uid,account_id,run_epoch,action,
    request_fingerprint,result,treasury_receipt_id)
  values(p_actor_id,p_action_uid,p_account_id,p_run_epoch,v_action,v_fingerprint,v_result,v_finance_id) returning id into v_id;
  return public.island_progression_result(v_id,false,true);
exception
  when invalid_text_representation or numeric_value_out_of_range or check_violation then
    return jsonb_build_object('status','refused','reason','invalid_progression');
  when unique_violation then return jsonb_build_object('status','refused','reason','action_conflict');
  when undefined_function then return jsonb_build_object('status','refused','reason','path_unavailable');
  when raise_exception then
    if sqlerrm = 'progression_refused' then
      get stacked diagnostics v_detail = pg_exception_detail;
      return jsonb_build_object('status','refused','reason',v_detail);
    elsif sqlerrm in ('wave_running','recovery_state_incomplete') then
      return jsonb_build_object('status','refused','reason',sqlerrm);
    elsif sqlerrm = 'progression_financial_conflict' then
      return jsonb_build_object('status','refused','reason','action_conflict');
    elsif sqlerrm = 'progression_operation_unavailable' then
      return jsonb_build_object('status','refused','reason','path_unavailable');
    end if;
    raise;
end;
$$;
comment on function public.island_economy_progression(uuid, uuid, uuid, text, jsonb, jsonb) is
  'Atomic shared progression. Root intent claim covers free and paid effects; current catalogue checks, idle phase and exact expected state prevent stale choices or overspending. No Engineer discount.';

revoke all on function public.island_progression_immutable() from public, anon, authenticated, service_role;
revoke all on function public.island_progression_research_state(public.island_research) from public, anon, authenticated, service_role;
revoke all on function public.island_progression_building_state(public.islet_buildings) from public, anon, authenticated, service_role;
revoke all on function public.island_progression_result(uuid, boolean, boolean) from public, anon, authenticated, service_role;
revoke all on function public.island_progression_valid_intent(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.island_economy_progression(uuid, uuid, uuid, text, jsonb, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.island_economy_progression(uuid, uuid, uuid, text, jsonb, jsonb) to service_role;

revoke all on function public.island_progression_refuse(text) from public, anon, authenticated, service_role;

-- A bounded, member-authorized projection supplies the exact CAS fields for new intents.
-- Reading during a wave is allowed; mutations independently require the idle phase.
create or replace function public.island_economy_progression_state(
  p_actor_id uuid, p_account_id uuid, p_run_epoch uuid
) returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_account public.island_economy_accounts; v_state public.island_economy_state;
  v_island public.islands; v_research jsonb; v_buildings jsonb;
begin
  select * into v_account from public.island_economy_accounts where id = p_account_id;
  if not found then return jsonb_build_object('status','refused','reason','account_missing'); end if;
  perform public.island_treasury_lock_scope(v_account.island_owner);
  select * into strict v_account from public.island_economy_accounts where id = p_account_id for update;
  select * into strict v_island from public.islands where player_id = v_account.island_owner for update;
  if p_actor_id is null or (p_actor_id <> v_account.island_owner and not exists (
    select 1 from public.island_members where island_owner = v_account.island_owner
      and player_id = p_actor_id and left_at is null)) then
    return jsonb_build_object('status','refused','reason','not_member');
  end if;
  if v_account.run_epoch is distinct from p_run_epoch then
    return jsonb_build_object('status','refused','reason','epoch_mismatch');
  end if;
  select * into v_state from public.island_economy_state where island_owner = v_account.island_owner for update;
  if v_account.state <> 'active' or v_state.current_account_id is distinct from p_account_id
    or v_state.run_epoch is distinct from p_run_epoch or v_state.admission_state <> 'active' then
    return jsonb_build_object('status','refused','reason','path_unavailable');
  end if;
  select coalesce(jsonb_agg(public.island_progression_research_state(r) || jsonb_build_object(
    'branch',r.branch,'coinsPaid',trunc(r.coins_paid)::text) order by r.branch),'[]'::jsonb)
    into v_research from public.island_research r where r.island_owner = v_account.island_owner;
  select coalesce(jsonb_agg(public.island_progression_building_state(b) || jsonb_build_object(
    'spot',b.plot) order by b.plot),'[]'::jsonb)
    into v_buildings from public.islet_buildings b where b.player_id = v_account.island_owner;
  if jsonb_array_length(v_research) > 10 or jsonb_array_length(v_buildings) > 50 then
    return jsonb_build_object('status','refused','reason','path_unavailable');
  end if;
  return jsonb_build_object('status','ok','economy',public.island_treasury_envelope(v_account),
    'bestWave',v_island.wave_best,'wreckPaid',v_island.wreck_paid,'research',v_research,'buildings',v_buildings);
end;
$$;
comment on function public.island_economy_progression_state(uuid, uuid, uuid) is
  'Current member-only account/run projection with exact progression revisions and cumulative research coins. Legacy fields are not used as a shared purchase or refund basis.';
revoke all on function public.island_economy_progression_state(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.island_economy_progression_state(uuid, uuid, uuid) to service_role;
