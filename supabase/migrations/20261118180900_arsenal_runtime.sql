-- Versioned arsenal reads and legacy fences. Canonical session authority is consumed, not created.

create table if not exists public.shared_arsenal_versions (
  account_id uuid primary key,
  run_epoch uuid not null,
  revision numeric not null default 0 check(public.island_treasury_whole(revision,true)),
  foreign key(account_id,run_epoch)
    references public.island_economy_accounts(id,run_epoch) on delete restrict
);
comment on table public.shared_arsenal_versions is
  'Arsenal domain revision, separate from money revision so free holder/lifecycle changes remain ordered.';
comment on column public.shared_arsenal_versions.account_id is 'Original inventory account.';
comment on column public.shared_arsenal_versions.run_epoch is 'Original inventory run.';
comment on column public.shared_arsenal_versions.revision is 'Exact monotonic domain revision; zero for untouched stock.';
alter table public.shared_arsenal_versions enable row level security;
revoke all on table public.shared_arsenal_versions from public,anon,authenticated,service_role;
grant select on table public.shared_arsenal_versions to service_role;

-- All shared writers already own the common account/scope locks before touching copies.
create or replace function public.island_shared_arsenal_advance()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  v_old_account uuid;
  v_old_epoch uuid;
  v_new_account uuid;
  v_new_epoch uuid;
  v_scope record;
begin
  if tg_op<>'INSERT' then v_old_account:=old.economy_account_id; v_old_epoch:=old.economy_run_epoch; end if;
  if tg_op<>'DELETE' then v_new_account:=new.economy_account_id; v_new_epoch:=new.economy_run_epoch; end if;
  for v_scope in select distinct account_id,run_epoch from (values
    (v_old_account,v_old_epoch),(v_new_account,v_new_epoch)) s(account_id,run_epoch)
    where account_id is not null order by account_id loop
    insert into public.shared_arsenal_versions(account_id,run_epoch,revision)
      values(v_scope.account_id,v_scope.run_epoch,1)
      on conflict(account_id) do update set revision=public.shared_arsenal_versions.revision+1;
  end loop;
  return null;
end;
$$;
comment on function public.island_shared_arsenal_advance() is
  'Advance domain revision with each persisted copy change, including free lifecycle transitions; never initializes on read.';
revoke all on function public.island_shared_arsenal_advance() from public,anon,authenticated,service_role;
create or replace trigger shared_arsenal_copy_revision after insert or update or delete
  on public.arsenal_copies for each row execute function public.island_shared_arsenal_advance();

-- Checked projection uses common authority under scope/account/island locks. It creates nothing.
create or replace function public.island_shared_arsenal_read(p_actor_id uuid,p_island_owner uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  v_state public.island_economy_state;
  v_account public.island_economy_accounts;
  v_island public.islands;
  v_authority jsonb;
  v_copies jsonb;
  v_mine public.arsenal_copies;
  v_revision numeric;
  v_stored integer;
begin
  if p_actor_id is null or p_island_owner is null then
    return jsonb_build_object('status','refused','reason','invalid_change');
  end if;
  perform public.island_treasury_lock_scope(p_island_owner);
  select * into v_state from public.island_economy_state where island_owner=p_island_owner;
  if not found then return jsonb_build_object('status','refused','reason','account_missing'); end if;
  select * into v_account from public.island_economy_accounts where id=v_state.current_account_id for share;
  select * into v_island from public.islands where player_id=p_island_owner for share;
  if not found or v_account.island_owner<>p_island_owner or v_account.run_epoch<>v_state.run_epoch
    or v_account.state<>'active' then
    return jsonb_build_object('status','refused','reason','path_unavailable');
  end if;
  v_authority:=public.island_shared_arsenal_authority(p_actor_id,p_island_owner);
  if v_authority is null then return jsonb_build_object('status','refused','reason','path_unavailable'); end if;
  if p_actor_id<>p_island_owner and not (v_authority->>'is_member')::boolean then
    return jsonb_build_object('status','refused','reason','not_member');
  end if;
  if exists(select 1 from public.arsenal_copies where island_owner=p_island_owner
    and (economy_account_id is distinct from v_account.id or economy_run_epoch is distinct from v_account.run_epoch)) then
    return jsonb_build_object('status','refused','reason','path_unavailable');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'no',c.copy_no,'weapon',c.weapon,
    'holder',c.holder,'holderName',p.display_name,'holderGeneration',trunc(c.holder_generation)::text,
    'pendingReturnWaveId',c.pending_return_wave_id,'disconnectedUntil',c.disconnected_until,
    'away',c.holder is not null and c.holder<>p_island_owner and not exists(
      select 1 from public.island_members m where m.island_owner=p_island_owner
        and m.player_id=c.holder and m.left_at is null),
    'you',coalesce(c.holder=p_actor_id and c.pending_return_wave_id is null,false))
    order by c.copy_no),'[]'::jsonb),count(*) filter(where c.holder is null)
    into v_copies,v_stored from public.arsenal_copies c left join public.profiles p on p.id=c.holder
    where c.island_owner=p_island_owner;
  select * into v_mine from public.arsenal_copies where island_owner=p_island_owner
    and holder=p_actor_id and pending_return_wave_id is null;
  select revision into v_revision from public.shared_arsenal_versions where account_id=v_account.id;
  return jsonb_build_object('status','done','arsenalVersion',1,'economy',public.island_treasury_envelope(v_account),
    'arsenalRevision',trunc(coalesce(v_revision,0))::text,'code','ISLE-'||v_island.code,
    'capacity',20,'total',jsonb_array_length(v_copies),'stored',v_stored,'copies',v_copies,
    'mine',v_mine.id,'carried',coalesce(v_mine.weapon,'musket'),'unlockWave',v_island.wave_best,
    'waveRunning',v_authority->>'reservation_id' is not null);
end;
$$;
comment on function public.island_shared_arsenal_read(uuid,uuid) is
  'Server-only authorized shared arsenal snapshot. No private wallet, grant, conversion, sweep or read-side mutation. HTTP layer requires capability.';
revoke all on function public.island_shared_arsenal_read(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.island_shared_arsenal_read(uuid,uuid) to service_role;

-- Account selection and original replay share the same scope boundary as the mutation.
create or replace function public.island_shared_arsenal_request(
  p_actor_id uuid,p_island_owner uuid,p_run_epoch uuid,p_action_uid text,p_kind text,
  p_weapon text default null,p_copy_id uuid default null,p_expected_generation numeric default null,
  p_price numeric default null,p_unlock_wave integer default null
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_operation public.island_economy_operations; v_account uuid; v_owner uuid;
begin
  if p_actor_id is null or p_island_owner is null or p_run_epoch is null then
    return jsonb_build_object('status','refused','reason','invalid_change'); end if;
  perform public.island_treasury_lock_scope(p_island_owner);
  select * into v_operation from public.island_economy_operations
    where actor_id=p_actor_id and action_uid=p_action_uid;
  if found then
    select island_owner into v_owner from public.island_economy_accounts where id=v_operation.account_id;
    if not v_operation.is_player_intent or v_owner is distinct from p_island_owner
      or v_operation.run_epoch is distinct from p_run_epoch then
      return jsonb_build_object('status','refused','reason','action_conflict'); end if;
    v_account:=v_operation.account_id;
  else
    select current_account_id into v_account from public.island_economy_state where island_owner=p_island_owner;
    if not found then return jsonb_build_object('status','refused','reason','account_missing'); end if;
  end if;
  return public.island_shared_arsenal_mutate(p_actor_id,p_island_owner,v_account,p_run_epoch,
    p_action_uid,p_kind,p_weapon,p_copy_id,p_expected_generation,p_price,p_unlock_wave);
end; $$;
comment on function public.island_shared_arsenal_request(uuid,uuid,uuid,text,text,text,uuid,numeric,numeric,integer) is
  'Service-only wire-intent adapter. Resolves original/current account atomically and delegates to the common-root arsenal transaction; own replay precedes mutable preflight.';
revoke all on function public.island_shared_arsenal_request(uuid,uuid,uuid,text,text,text,uuid,numeric,numeric,integer)
  from public,anon,authenticated,service_role;
grant execute on function public.island_shared_arsenal_request(uuid,uuid,uuid,text,text,text,uuid,numeric,numeric,integer) to service_role;

-- Preserve the existing legacy bodies privately; repeat application never wraps a wrapper.
do $$
begin
  if to_regprocedure('public.arsenal_legacy_state(uuid,uuid)') is null then
    alter function public.arsenal_state(uuid,uuid) rename to arsenal_legacy_state;
    alter function public.arsenal_buy(uuid,uuid,text,text,integer,integer) rename to arsenal_legacy_buy;
    alter function public.arsenal_take(uuid,uuid,uuid,text) rename to arsenal_legacy_take;
    alter function public.arsenal_return(uuid,uuid,text) rename to arsenal_legacy_return;
    alter function public.arsenal_sweep(uuid) rename to arsenal_legacy_sweep;
    alter function public.arsenal_convert_island(uuid) rename to arsenal_legacy_convert_island;
  end if;
end;
$$;
revoke all on function public.arsenal_legacy_state(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.arsenal_legacy_buy(uuid,uuid,text,text,integer,integer) from public,anon,authenticated,service_role;
revoke all on function public.arsenal_legacy_take(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.arsenal_legacy_return(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.arsenal_legacy_sweep(uuid) from public,anon,authenticated,service_role;
revoke all on function public.arsenal_legacy_convert_island(uuid) from public,anon,authenticated,service_role;

-- Class zero precedes any old wallet/island mutation, serializing with admission.
create or replace function public.arsenal_state(p_player_id uuid,p_island_owner uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform public.island_treasury_lock_scope(p_island_owner);
  if exists(select 1 from public.island_economy_state where island_owner=p_island_owner) then
    return jsonb_build_object('status','refused','reason','economy_context_required'); end if;
  return public.arsenal_legacy_state(p_player_id,p_island_owner);
end; $$;
comment on function public.arsenal_state(uuid,uuid) is 'Legacy state entry guarded before lazy conversion or sweep; shared islands require the versioned path.';
create or replace function public.arsenal_buy(p_player_id uuid,p_island_owner uuid,p_weapon text,p_action_uid text,p_price integer,p_unlock_wave integer)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform public.island_treasury_lock_scope(p_island_owner);
  if exists(select 1 from public.island_economy_state where island_owner=p_island_owner) then
    return jsonb_build_object('status','refused','reason','economy_context_required'); end if;
  return public.arsenal_legacy_buy(p_player_id,p_island_owner,p_weapon,p_action_uid,p_price,p_unlock_wave);
end; $$;
comment on function public.arsenal_buy(uuid,uuid,text,text,integer,integer) is 'Legacy buy guarded at class zero before wallet debit or island locks; explicit legacy behavior is retained.';
create or replace function public.arsenal_take(p_player_id uuid,p_island_owner uuid,p_copy_id uuid,p_action_uid text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform public.island_treasury_lock_scope(p_island_owner);
  if exists(select 1 from public.island_economy_state where island_owner=p_island_owner) then
    return jsonb_build_object('status','refused','reason','economy_context_required'); end if;
  return public.arsenal_legacy_take(p_player_id,p_island_owner,p_copy_id,p_action_uid);
end; $$;
comment on function public.arsenal_take(uuid,uuid,uuid,text) is 'Legacy take/swap guarded before island mutation; admitted shared stock cannot use this path.';
create or replace function public.arsenal_return(p_player_id uuid,p_island_owner uuid,p_action_uid text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform public.island_treasury_lock_scope(p_island_owner);
  if exists(select 1 from public.island_economy_state where island_owner=p_island_owner) then
    return jsonb_build_object('status','refused','reason','economy_context_required'); end if;
  return public.arsenal_legacy_return(p_player_id,p_island_owner,p_action_uid);
end; $$;
comment on function public.arsenal_return(uuid,uuid,text) is 'Legacy return guarded before island mutation; shared stock uses exact-tenure transactions.';
create or replace function public.arsenal_sweep(p_island_owner uuid)
returns integer language plpgsql security definer set search_path='' as $$
begin
  perform public.island_treasury_lock_scope(p_island_owner);
  if exists(select 1 from public.island_economy_state where island_owner=p_island_owner) then return 0; end if;
  perform 1 from public.islands where player_id=p_island_owner for update;
  return public.arsenal_legacy_sweep(p_island_owner);
end; $$;
comment on function public.arsenal_sweep(uuid) is 'Legacy-only sweep; never releases shared retained or pending copies.';
create or replace function public.arsenal_convert_island(p_owner uuid)
returns integer language plpgsql security definer set search_path='' as $$
begin
  perform public.island_treasury_lock_scope(p_owner);
  if exists(select 1 from public.island_economy_state where island_owner=p_owner) then return 0; end if;
  perform 1 from public.islands where player_id=p_owner for update;
  return public.arsenal_legacy_convert_island(p_owner);
end; $$;
comment on function public.arsenal_convert_island(uuid) is 'Legacy-only personal conversion, guarded before island mutation. Shared admission requires explicit conversion.';

-- The batch takes every signed scope key first; nested helpers only reacquire held guards.
create or replace function public.arsenal_convert_personal_weapons()
returns integer language plpgsql security definer set search_path='' as $$
declare v_key bigint; v_owner uuid; v_owners uuid[]; v_made integer:=0;
begin
  -- Freeze candidates before waiting: a second mutable predicate could introduce
  -- an owner whose class-zero guard was never acquired by this transaction.
  select coalesce(array_agg(player_id order by player_id),'{}'::uuid[]) into v_owners
    from public.islands where cardinality(weapons_owned)>1;
  for v_key in select distinct hashtextextended('island-economy:'||owner::text,0)
    from unnest(v_owners) owner order by 1 loop
    perform pg_advisory_xact_lock(v_key); end loop;
  for v_owner in select player_id from public.islands where player_id=any(v_owners)
    order by player_id for update loop
    v_made:=v_made+public.arsenal_convert_island(v_owner); end loop;
  return v_made;
end; $$;
comment on function public.arsenal_convert_personal_weapons() is 'Legacy conversion batch with sorted class-zero guards; admitted shared islands are skipped without mutation.';

-- Legacy initialization and operation share the scope boundary, so a stale HTTP
-- preflight cannot grant private money before its shared-target refusal.
create or replace function public.island_arsenal_legacy_request(
  p_actor_id uuid,p_island_owner uuid,p_kind text,p_action_uid text,p_weapon text,p_copy_id uuid,
  p_starting_coins bigint,p_price integer,p_unlock_wave integer,p_new_code text
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare v_key bigint; v_open jsonb; v_result jsonb; v_island jsonb;
begin
  if p_actor_id is null or p_island_owner is null or p_kind is null
    or p_kind not in ('state','buy','take','return') then
    return jsonb_build_object('status','refused','reason','invalid_change'); end if;
  for v_key in select distinct hashtextextended('island-economy:'||owner::text,0)
    from unnest(array[p_actor_id,p_island_owner]) owner order by 1 loop
    perform pg_advisory_xact_lock(v_key); end loop;
  if exists(select 1 from public.island_economy_state where island_owner=p_island_owner) then
    return jsonb_build_object('status','refused','reason','economy_context_required'); end if;
  if not exists(select 1 from public.island_economy_state where island_owner=p_actor_id) then
    v_open:=public.island_open(p_actor_id,p_new_code,p_starting_coins);
    if v_open->>'status'<>'open' then return v_open; end if;
  end if;
  case p_kind
    when 'state' then v_result:=public.arsenal_legacy_state(p_actor_id,p_island_owner);
    when 'buy' then v_result:=public.arsenal_legacy_buy(p_actor_id,p_island_owner,p_weapon,p_action_uid,p_price,p_unlock_wave);
    when 'take' then v_result:=public.arsenal_legacy_take(p_actor_id,p_island_owner,p_copy_id,p_action_uid);
    when 'return' then v_result:=public.arsenal_legacy_return(p_actor_id,p_island_owner,p_action_uid);
  end case;
  if v_result->>'status' in ('ok','done') then
    select jsonb_build_object('player_id',player_id,'code',code,'wave_best',wave_best,'flags',flags)
      into v_island from public.islands where player_id=p_island_owner;
    return v_result||jsonb_build_object('island',v_island);
  end if;
  return v_result;
end; $$;
comment on function public.island_arsenal_legacy_request(uuid,uuid,text,text,text,uuid,bigint,integer,integer,text) is
  'Service-only complete legacy arsenal request under sorted actor/target scope guards. Shared target refuses before initialization/grant; actor-owned shared islands are never initialized by this path.';
revoke all on function public.island_arsenal_legacy_request(uuid,uuid,text,text,text,uuid,bigint,integer,integer,text)
  from public,anon,authenticated,service_role;
grant execute on function public.island_arsenal_legacy_request(uuid,uuid,text,text,text,uuid,bigint,integer,integer,text) to service_role;

-- Existing browser grants remain absent after replacement of server-only entrypoints.
revoke all on function public.arsenal_state(uuid,uuid) from public,anon,authenticated;
revoke all on function public.arsenal_buy(uuid,uuid,text,text,integer,integer) from public,anon,authenticated;
revoke all on function public.arsenal_take(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.arsenal_return(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.arsenal_sweep(uuid) from public,anon,authenticated;
revoke all on function public.arsenal_convert_island(uuid) from public,anon,authenticated;
revoke all on function public.arsenal_convert_personal_weapons() from public,anon,authenticated;
grant execute on function public.arsenal_state(uuid,uuid) to service_role;
grant execute on function public.arsenal_buy(uuid,uuid,text,text,integer,integer) to service_role;
grant execute on function public.arsenal_take(uuid,uuid,uuid,text) to service_role;
grant execute on function public.arsenal_return(uuid,uuid,text) to service_role;
grant execute on function public.arsenal_sweep(uuid) to service_role;
grant execute on function public.arsenal_convert_island(uuid) to service_role;
grant execute on function public.arsenal_convert_personal_weapons() to service_role;
