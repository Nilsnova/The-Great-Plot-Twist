-- MP-ECO-09: inactive shared arsenal persistence using common roots and treasury children.
-- No authority provider, admission, conversion, route or member-deletion policy is installed.

alter table public.arsenal_copies
  add column if not exists economy_account_id uuid,
  add column if not exists economy_run_epoch uuid,
  add column if not exists holder_generation numeric not null default 0,
  add column if not exists pending_return_wave_id uuid,
  add column if not exists disconnected_until timestamptz;
alter table public.arsenal_copies drop constraint if exists arsenal_copies_economy_scope;
alter table public.arsenal_copies add constraint arsenal_copies_economy_scope check (
  (economy_account_id is null) = (economy_run_epoch is null)
  and holder_generation::text not in ('NaN','Infinity','-Infinity')
  and holder_generation=trunc(holder_generation) and holder_generation>=0
  and (holder is not null or (pending_return_wave_id is null and disconnected_until is null))
  and (pending_return_wave_id is null or disconnected_until is null)
);
alter table public.arsenal_copies drop constraint if exists arsenal_copies_economy_account;
alter table public.arsenal_copies add constraint arsenal_copies_economy_account
  foreign key(economy_account_id,island_owner,economy_run_epoch)
  references public.island_economy_accounts(id,island_owner,run_epoch) on delete restrict;
comment on column public.arsenal_copies.economy_account_id is
  'Original shared account; null on unconverted legacy stock. Conversion is explicit, never a read side effect.';
comment on column public.arsenal_copies.economy_run_epoch is
  'Original shared run, fenced together with account and island ownership.';
comment on column public.arsenal_copies.holder_generation is
  'Exact copy tenure counter advanced on every take/release. Old commands cannot release a later tenure.';
comment on column public.arsenal_copies.pending_return_wave_id is
  'Withdrawn copy retained for the original reserved wave until canonical closure; never reassigned meanwhile.';
comment on column public.arsenal_copies.disconnected_until is
  'Trusted reconnect deadline supplied by session integration. No worker or deletion behavior is installed here.';

-- Keep the legacy deferred storage rule while allowing explicitly converted excess
-- shared copies to return. New purchases still obey the shared total-copy limit.
create or replace function public.arsenal_check_capacity()
returns trigger language plpgsql set search_path='' as $$
declare v_owner uuid;
begin
  for v_owner in select distinct owner from unnest(array[
    new.island_owner,case when tg_op='UPDATE' then old.island_owner else null end
  ]) owner where owner is not null order by owner loop
    if exists(select 1 from public.arsenal_copies where island_owner=v_owner
      and economy_account_id is null)
      and (select count(*) from public.arsenal_copies where island_owner=v_owner
        and holder is null)>public.arsenal_capacity() then
      raise exception 'arsenal_over_capacity' using errcode='check_violation';
    end if;
  end loop;
  if new.economy_account_id is not null
    and ((tg_op='INSERT' and new.source='bought')
      or (tg_op='UPDATE' and new.island_owner is distinct from old.island_owner))
    and (select count(*) from public.arsenal_copies where island_owner=new.island_owner)>20 then
    raise exception 'arsenal_over_capacity' using errcode='check_violation';
  end if;
  return null;
end;
$$;
comment on function public.arsenal_check_capacity() is
  'Deferred legacy limit of 20 stored copies and shared limit of 20 total new purchases. Bound grandfathered stock can return above 20; both owners are checked on scope moves.';
drop trigger if exists arsenal_copies_capacity on public.arsenal_copies;
create constraint trigger arsenal_copies_capacity
  after insert or update of holder,island_owner,economy_account_id,economy_run_epoch
  on public.arsenal_copies deferrable initially deferred
  for each row execute function public.arsenal_check_capacity();

-- The domain result supplements the common root; it never substitutes for player authority.
create table if not exists public.shared_arsenal_receipts (
  operation_id uuid primary key references public.island_economy_operations(id) on delete restrict,
  account_id uuid not null,
  run_epoch uuid not null,
  actor_id uuid not null,
  result jsonb not null check(jsonb_typeof(result)='object'),
  created_at timestamptz not null default clock_timestamp(),
  foreign key(account_id,run_epoch)
    references public.island_economy_accounts(id,run_epoch) on delete restrict
);
comment on table public.shared_arsenal_receipts is
  'Immutable common effect receipt linked to one operation. Historical actor replay exposes no fresh island state.';
comment on column public.shared_arsenal_receipts.operation_id is 'Common player operation UUID, unique across retries.';
comment on column public.shared_arsenal_receipts.account_id is 'Original paying or inventory account.';
comment on column public.shared_arsenal_receipts.run_epoch is 'Original run, never retargeted after reset.';
comment on column public.shared_arsenal_receipts.actor_id is 'Original actor retained independently of profile deletion.';
comment on column public.shared_arsenal_receipts.result is 'Common receipt envelope with immutable origin and route-specific copy/tenure/price result.';
comment on column public.shared_arsenal_receipts.created_at is 'Canonical operation completion time.';
alter table public.shared_arsenal_receipts enable row level security;
revoke all on table public.shared_arsenal_receipts from public,anon,authenticated,service_role;
grant select on table public.shared_arsenal_receipts to service_role;
create or replace trigger shared_arsenal_receipts_immutable
  before update or delete on public.shared_arsenal_receipts
  for each row execute function public.island_treasury_immutable();

-- Private result projection: replay never returns current treasury/copy data to a former member.
create or replace function public.island_shared_arsenal_result(p_operation_id uuid,p_repeat boolean)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_receipt public.shared_arsenal_receipts;
  v_account public.island_economy_accounts;
begin
  select * into strict v_receipt from public.shared_arsenal_receipts where operation_id=p_operation_id;
  select * into strict v_account from public.island_economy_accounts where id=v_receipt.account_id;
  return jsonb_build_object('status','done','repeat',p_repeat,'operationId',p_operation_id,
    'receipt',v_receipt.result,'currentEconomy',case when not p_repeat
      then public.island_treasury_envelope(v_account) else null end);
end;
$$;
comment on function public.island_shared_arsenal_result(uuid,boolean) is
  'Private original-result projection. New authorized operations include current economy; replay returns only original effect.';

-- Missing persisted authority is an explicit fail-closed dependency, not legacy fallback.
create or replace function public.island_shared_arsenal_authority(p_actor_id uuid,p_owner uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_authority jsonb;
begin
  execute 'select public.island_economy_authority($1,$2)'
    into v_authority using p_actor_id,p_owner;
  if jsonb_typeof(v_authority) is distinct from 'object'
    or not (v_authority ?& array['actor_id','island_owner','is_member','reservation_id',
                               'session_leader_id','actor_assignment_wave_id'])
    or (select count(*) from jsonb_object_keys(v_authority))<>6
    or jsonb_typeof(v_authority->'actor_id') is distinct from 'string'
    or jsonb_typeof(v_authority->'island_owner') is distinct from 'string'
    or jsonb_typeof(v_authority->'is_member') is distinct from 'boolean'
    or (v_authority->>'actor_id')::uuid is distinct from p_actor_id
    or (v_authority->>'island_owner')::uuid is distinct from p_owner then
    return null;
  end if;
  -- Validate every nullable ID even when this action does not use leader/assignment authority.
  perform (v_authority->>'reservation_id')::uuid,
          (v_authority->>'session_leader_id')::uuid,
          (v_authority->>'actor_assignment_wave_id')::uuid;
  if exists (select 1 from jsonb_each(v_authority) e
    where e.key in ('reservation_id','session_leader_id','actor_assignment_wave_id')
      and jsonb_typeof(e.value) not in ('string','null')) then return null; end if;
  return v_authority;
exception when undefined_function or invalid_text_representation then return null;
end;
$$;
comment on function public.island_shared_arsenal_authority(uuid,uuid) is
  'Private exact reserved-authority consumer. Missing/malformed provider fails closed; no competing provider is created.';

-- All validation/effects after the root claim share the function exception savepoint.
create or replace function public.island_shared_arsenal_mutate(
  p_actor_id uuid,p_island_owner uuid,p_account_id uuid,p_run_epoch uuid,
  p_action_uid text,p_kind text,p_weapon text default null,p_copy_id uuid default null,
  p_expected_generation numeric default null,p_price numeric default null,
  p_unlock_wave integer default null
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  v_account public.island_economy_accounts;
  v_state public.island_economy_state;
  v_copy public.arsenal_copies;
  v_held public.arsenal_copies;
  v_claim jsonb;
  v_authority jsonb;
  v_reply jsonb;
  v_fingerprint jsonb;
  v_operation uuid;
  v_copy_id uuid;
  v_generation numeric;
  v_wave_best integer;
  v_copy_no integer;
begin
  if p_actor_id is null or p_island_owner is null or p_account_id is null or p_run_epoch is null
    or p_kind is null or p_kind not in ('buy','take','return')
    or (p_kind='buy' and (p_weapon is null or p_copy_id is not null or p_expected_generation is not null))
    or (p_kind<>'buy' and (p_weapon is not null or p_copy_id is null
      or not public.island_treasury_whole(p_expected_generation,true))) then
    return jsonb_build_object('status','refused','reason','invalid_change');
  end if;
  perform public.island_treasury_lock_scope(p_island_owner);
  select * into v_account from public.island_economy_accounts where id=p_account_id for update;
  if not found or v_account.island_owner<>p_island_owner then
    return jsonb_build_object('status','refused','reason','account_missing');
  end if;
  v_fingerprint:=jsonb_build_object('action',p_kind,'weapon',p_weapon,'copy',p_copy_id,
    'generation',trunc(p_expected_generation)::text);
  v_claim:=public.island_economy_claim_operation_locked(p_actor_id,p_account_id,p_run_epoch,
    p_action_uid,'arsenal:'||p_kind,v_fingerprint);
  if v_claim->>'status'='refused' then return v_claim; end if;
  v_operation:=(v_claim->>'operationId')::uuid;
  if v_claim->>'status'='replay' then
    if not exists(select 1 from public.shared_arsenal_receipts where operation_id=v_operation
      and actor_id=p_actor_id and account_id=p_account_id and run_epoch=p_run_epoch) then
      return jsonb_build_object('status','refused','reason','path_unavailable');
    end if;
    return public.island_shared_arsenal_result(v_operation,true);
  end if;
  v_reply:=jsonb_build_object('status','refused','reason','path_unavailable');
  perform 1 from public.profiles where id=p_actor_id for no key update;
  if not found then raise exception using errcode='PA001'; end if;
  select wave_best into v_wave_best from public.islands where player_id=p_island_owner for update;
  if not found then raise exception using errcode='PA001'; end if;
  select * into v_state from public.island_economy_state where island_owner=p_island_owner for update;
  if not found or v_state.current_account_id<>p_account_id or v_state.run_epoch<>p_run_epoch
    or v_state.admission_state<>'active' or v_account.state<>'active' then
    raise exception using errcode='PA001';
  end if;
  v_authority:=public.island_shared_arsenal_authority(p_actor_id,p_island_owner);
  if v_authority is null then raise exception using errcode='PA001'; end if;
  if not (v_authority->>'is_member')::boolean and p_actor_id<>p_island_owner then
    v_reply:=jsonb_build_object('status','refused','reason','not_member');
    raise exception using errcode='PA001';
  end if;
  if v_authority->>'reservation_id' is not null then
    v_reply:=jsonb_build_object('status','refused','reason','wave_running');
    raise exception using errcode='PA001';
  end if;
  perform 1 from public.arsenal_copies where island_owner=p_island_owner order by id for update;
  if exists(select 1 from public.arsenal_copies where island_owner=p_island_owner
    and (economy_account_id is distinct from p_account_id or economy_run_epoch is distinct from p_run_epoch)) then
    raise exception using errcode='PA001';
  end if;
  select * into v_held from public.arsenal_copies where island_owner=p_island_owner and holder=p_actor_id;
  if v_held.pending_return_wave_id is not null then
    v_reply:=jsonb_build_object('status','refused','reason','wave_running');
    raise exception using errcode='PA001';
  end if;
  if p_kind='buy' then
    v_reply:=jsonb_build_object('status','refused','reason','invalid_change');
    if p_weapon not in ('pistols','blunderbuss','long_rifle','fire_bombs')
      or not public.island_treasury_whole(p_price,false) or p_unlock_wave is null or p_unlock_wave<0 then
      raise exception using errcode='PA001';
    end if;
    if v_wave_best<p_unlock_wave then
      v_reply:=jsonb_build_object('status','refused','reason','locked');
      raise exception using errcode='PA001';
    end if;
    if (select count(*) from public.arsenal_copies where island_owner=p_island_owner)>=20 then
      v_reply:=jsonb_build_object('status','refused','reason','arsenal_full');
      raise exception using errcode='PA001';
    end if;
    select coalesce(max(copy_no),0)+1 into v_copy_no from public.arsenal_copies where island_owner=p_island_owner;
    v_reply:=public.island_treasury_record_locked(p_account_id,p_actor_id,
      public.island_economy_effect_uid(v_operation,'charge'),'spend','weapon_purchase',
      'arsenal:'||v_operation::text,v_fingerprint,-p_price,0);
    if v_reply->>'status'<>'done' then raise exception using errcode='PA001'; end if;
    insert into public.arsenal_copies(island_owner,copy_no,weapon,holder,bought_by,source,
      economy_account_id,economy_run_epoch,holder_generation)
    values(p_island_owner,v_copy_no,p_weapon,case when v_held.id is null then p_actor_id else null end,
      p_actor_id,'bought',p_account_id,p_run_epoch,case when v_held.id is null then 1 else 0 end)
    returning id,holder_generation into v_copy_id,v_generation;
  else
    select * into v_copy from public.arsenal_copies where id=p_copy_id and island_owner=p_island_owner;
    if not found then
      v_reply:=jsonb_build_object('status','refused','reason','no_such_copy');
      raise exception using errcode='PA001';
    end if;
    if v_copy.holder_generation<>p_expected_generation then
      v_reply:=jsonb_build_object('status','refused','reason','stale_holder');
      raise exception using errcode='PA001';
    end if;
    if p_kind='take' then
      if v_copy.holder is not null then
        v_reply:=jsonb_build_object('status','refused','reason','taken');
        raise exception using errcode='PA001';
      end if;
      update public.arsenal_copies set holder=null,holder_generation=holder_generation+1,
        disconnected_until=null where id=v_held.id;
    elsif v_copy.holder is distinct from p_actor_id or v_copy.pending_return_wave_id is not null then
      v_reply:=jsonb_build_object('status','refused','reason','nothing_held');
      raise exception using errcode='PA001';
    end if;
    update public.arsenal_copies set holder=case when p_kind='take' then p_actor_id else null end,
      holder_generation=holder_generation+1,disconnected_until=null where id=v_copy.id
      returning id,holder_generation into v_copy_id,v_generation;
  end if;
  insert into public.shared_arsenal_receipts(operation_id,account_id,run_epoch,actor_id,result)
    values(v_operation,p_account_id,p_run_epoch,p_actor_id,jsonb_build_object(
      'receiptId',v_operation,'actionUid',p_action_uid,'actorId',p_actor_id,
      'action',case p_kind when 'buy' then 'arsenal_buy' when 'take' then 'arsenal_withdraw' else 'arsenal_return' end,
      'origin',jsonb_build_object('mode','island_shared','version',1,'islandOwner',p_island_owner,
        'accountId',p_account_id,'runEpoch',p_run_epoch),
      'result',jsonb_build_object('copyId',v_copy_id,
        'weapon',case when p_kind='buy' then p_weapon else v_copy.weapon end,
        'holderGeneration',trunc(v_generation)::text,
        'priceCoins',case when p_kind='buy' then trunc(p_price)::text else '0' end,
        'financialReceiptId',case when p_kind='buy' then v_reply->'receipt'->>'id' else null end)));
  return public.island_shared_arsenal_result(v_operation,false);
exception when sqlstate 'PA001' then
  -- The enclosing savepoint removes a newly inserted root along with every money/copy effect.
  return v_reply;
end;
$$;
comment on function public.island_shared_arsenal_mutate(uuid,uuid,uuid,uuid,text,text,text,uuid,numeric,numeric,integer) is
  'Service-only atomic shared buy/take/swap/return. Requires explicit conversion and real persisted authority. Root before personal/domain locks; one treasury child and immutable result. No legacy fallback.';

-- Advisory internal bell projection; its caller freezes the result under the common locks.
create or replace function public.island_shared_arsenal_loadouts_locked(
  p_account_id uuid,p_run_epoch uuid,p_players uuid[]
) returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('playerId',p.player_id,
    'weapon',coalesce(c.weapon,'musket'),'copyId',c.id,
    'generation',trunc(c.holder_generation)::text) order by p.ordinality),'[]'::jsonb)
  from unnest(p_players) with ordinality p(player_id,ordinality)
  left join public.arsenal_copies c on c.economy_account_id=p_account_id
    and c.economy_run_epoch=p_run_epoch and c.holder=p.player_id and c.pending_return_wave_id is null;
$$;
comment on function public.island_shared_arsenal_loadouts_locked(uuid,uuid,uuid[]) is
  'Private advisory loadout projection only. Future accepted bell must authorize/lock and persist it with roster/world snapshots; repeated reads are not immutable wave snapshots.';

-- Private lifecycle persistence only. The canonical session transaction already owns
-- scope/account/personal/island/wave locks and verifies controller generation/origin.
create or replace function public.island_shared_arsenal_holder_locked(
  p_account_id uuid,p_run_epoch uuid,p_actor_id uuid,p_copy_id uuid,p_generation numeric,
  p_transition text,p_now timestamptz,p_wave_id uuid default null,p_deadline timestamptz default null
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  v_copy public.arsenal_copies;
  v_deadline timestamptz;
begin
  if p_now is null or p_transition is null
    or p_transition not in ('disconnect','reconnect','withdraw','expire')
    or not public.island_treasury_whole(p_generation,true) then
    return jsonb_build_object('status','refused','reason','invalid_change');
  end if;
  select * into v_copy from public.arsenal_copies where id=p_copy_id
    and economy_account_id=p_account_id and economy_run_epoch=p_run_epoch
    and holder=p_actor_id and holder_generation=p_generation for update;
  if not found or v_copy.pending_return_wave_id is not null then
    return jsonb_build_object('status','done','changed',false);
  end if;
  if p_transition='disconnect' then
    if p_deadline is null or p_deadline>p_now+interval '60 seconds' then
      return jsonb_build_object('status','refused','reason','invalid_change');
    end if;
    v_deadline:=least(p_deadline,coalesce(v_copy.disconnected_until,p_deadline));
    if v_deadline is not distinct from v_copy.disconnected_until then
      return jsonb_build_object('status','done','changed',false);
    end if;
    update public.arsenal_copies set disconnected_until=v_deadline where id=v_copy.id;
  elsif p_transition='reconnect' then
    if v_copy.disconnected_until is null then
      return jsonb_build_object('status','done','changed',false);
    end if;
    if p_now>=v_copy.disconnected_until then
      return jsonb_build_object('status','refused','reason','holder_grace_expired');
    end if;
    update public.arsenal_copies set disconnected_until=null where id=v_copy.id;
  else
    if p_transition='expire' and (v_copy.disconnected_until is null or p_now<v_copy.disconnected_until) then
      return jsonb_build_object('status','done','changed',false);
    end if;
    if p_wave_id is null then
      update public.arsenal_copies set holder=null,holder_generation=holder_generation+1,
        disconnected_until=null where id=v_copy.id;
    else
      update public.arsenal_copies set pending_return_wave_id=p_wave_id,disconnected_until=null
        where id=v_copy.id;
    end if;
  end if;
  return jsonb_build_object('status','done','changed',true);
end;
$$;
comment on function public.island_shared_arsenal_holder_locked(uuid,uuid,uuid,uuid,numeric,text,timestamptz,uuid,timestamptz) is
  'Private lock-preserving holder intent storage. Caller verifies original origin, controller generation and reservation, revokes input and journals atomically. No scheduler or independent authority; stale tenure is a no-op.';

-- Original-wave settlement retains all stock and needs no new member authorization or capacity.
create or replace function public.island_shared_arsenal_settle_returns_locked(
  p_account_id uuid,p_run_epoch uuid,p_wave_id uuid
) returns integer language plpgsql volatile security definer set search_path='' as $$
declare v_count integer;
begin
  if p_wave_id is null then raise exception using errcode='22023',message='missing_canonical_wave'; end if;
  perform 1 from public.arsenal_copies where economy_account_id=p_account_id
    and economy_run_epoch=p_run_epoch and pending_return_wave_id=p_wave_id order by id for update;
  update public.arsenal_copies set holder=null,holder_generation=holder_generation+1,
    pending_return_wave_id=null,disconnected_until=null where economy_account_id=p_account_id
    and economy_run_epoch=p_run_epoch and pending_return_wave_id=p_wave_id;
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;
comment on function public.island_shared_arsenal_settle_returns_locked(uuid,uuid,uuid) is
  'Private original-wave pending return settlement under existing common locks. Caller verifies canonical closure and journals; duplicate/old-wave calls cannot release another reservation.';

revoke all on function public.island_shared_arsenal_result(uuid,boolean) from public,anon,authenticated,service_role;
revoke all on function public.island_shared_arsenal_authority(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.island_shared_arsenal_loadouts_locked(uuid,uuid,uuid[]) from public,anon,authenticated,service_role;
revoke all on function public.island_shared_arsenal_holder_locked(uuid,uuid,uuid,uuid,numeric,text,timestamptz,uuid,timestamptz)
  from public,anon,authenticated,service_role;
revoke all on function public.island_shared_arsenal_settle_returns_locked(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
revoke all on function public.island_shared_arsenal_mutate(uuid,uuid,uuid,uuid,text,text,text,uuid,numeric,numeric,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.island_shared_arsenal_mutate(uuid,uuid,uuid,uuid,text,text,text,uuid,numeric,numeric,integer)
  to service_role;
