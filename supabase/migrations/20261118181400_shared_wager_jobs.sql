-- Durable origin-bound wager work and authorized paginated Harbor activity.
-- No scheduler, feature or existing island is activated by this migration.

create index if not exists island_wagers_account_page
  on public.island_wagers(account_id,product,opened_at desc,id desc);

create table if not exists public.island_wager_jobs (
  wager_id uuid primary key references public.island_wagers(id),
  next_attempt_at timestamptz not null,
  attempts integer not null default 0 check (attempts>=0),
  last_error text check (last_error in ('result_pending','source_unavailable',
    'database_unavailable','worker_error')),
  completed_at timestamptz
);
comment on table public.island_wager_jobs is
  'Durable original-wager work, independent of initiating browser/member presence. Finite worker batches are pagination, never financial caps. Duplicate workers remain safe through unique source settlement.';
create index if not exists island_wager_jobs_due on public.island_wager_jobs(next_attempt_at,wager_id)
  where completed_at is null;
alter table public.island_wager_jobs enable row level security;
revoke all on table public.island_wager_jobs from public,anon,authenticated,service_role;
grant select on table public.island_wager_jobs to service_role;

create or replace function public.island_wager_queue_change()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='island_wagers' then
    insert into public.island_wager_jobs(wager_id,next_attempt_at)
    values(new.id,new.settle_at) on conflict(wager_id) do nothing;
  else
    update public.island_wager_jobs set completed_at=clock_timestamp(),last_error=null
      where wager_id=new.wager_id;
  end if;
  return new;
end;
$$;
comment on function public.island_wager_queue_change() is
  'Queue product creation and mark canonical completion inside the same financial/domain transaction; no queue lock is held before account/product locks.';
create or replace trigger island_wager_queue_insert after insert on public.island_wagers
  for each row execute function public.island_wager_queue_change();
create or replace trigger island_wager_queue_complete after insert on public.island_wager_settlements
  for each row execute function public.island_wager_queue_change();
insert into public.island_wager_jobs(wager_id,next_attempt_at)
select w.id,w.settle_at from public.island_wagers w
  where not exists(select 1 from public.island_wager_settlements s where s.wager_id=w.id)
on conflict(wager_id) do nothing;

create or replace function public.island_wager_jobs_due(p_limit integer default 40)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if p_limit is null or p_limit not between 1 and 100 then
    return jsonb_build_object('status','refused','reason','invalid_change');
  end if;
  return jsonb_build_object('status','done','jobs',coalesce((select jsonb_agg(row_to_json(j))
    from (select w.id as "wagerId",w.product,w.event_id as "eventId"
      from public.island_wager_jobs q join public.island_wagers w on w.id=q.wager_id
      where q.completed_at is null and q.next_attempt_at<=clock_timestamp()
      order by q.next_attempt_at,q.wager_id limit p_limit) j),'[]'::jsonb));
end;
$$;
comment on function public.island_wager_jobs_due(integer) is
  'Service-only discovery of due original wagers, including retired accounts. No queue row lock precedes financial locks; duplicate discoveries cannot duplicate settlement.';

create or replace function public.island_wager_job_retry(p_wager_id uuid,p_error text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  v_wager public.island_wagers;
  v_owner uuid;
begin
  if p_error is null or p_error not in ('result_pending','source_unavailable',
    'database_unavailable','worker_error') then
    return jsonb_build_object('status','refused','reason','invalid_change');
  end if;
  select * into v_wager from public.island_wagers where id=p_wager_id;
  if not found then return jsonb_build_object('status','refused','reason','wager_missing'); end if;
  select island_owner into strict v_owner from public.island_economy_accounts where id=v_wager.account_id;
  perform public.island_treasury_lock_scope(v_owner);
  perform 1 from public.island_economy_accounts where id=v_wager.account_id for update;
  perform 1 from public.island_wagers where id=p_wager_id for update;
  update public.island_wager_jobs set attempts=attempts+1,last_error=p_error,
    next_attempt_at=clock_timestamp()+interval '5 minutes'
    where wager_id=p_wager_id and completed_at is null;
  return jsonb_build_object('status','done');
end;
$$;
comment on function public.island_wager_job_retry(uuid,text) is
  'Persist bounded retry delay and a generic diagnostic after scope/account/product locks. Never reroute funds, reopen a completed reserve or store provider error text.';

create or replace function public.island_wager_page(
  p_actor_id uuid,p_island_owner uuid,p_run_epoch uuid,p_product text,p_cursor uuid default null
) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare
  v_state public.island_economy_state;
  v_account public.island_economy_accounts;
  v_cursor public.island_wagers;
  v_items jsonb;
  v_next uuid;
begin
  if p_actor_id is null or p_island_owner is null or p_product is null
    or p_product not in ('market_call','football') then
    perform public.island_wager_fail('invalid_change');
  end if;
  perform public.island_treasury_lock_scope(p_island_owner);
  select * into v_state from public.island_economy_state where island_owner=p_island_owner;
  if not found then perform public.island_wager_fail('account_missing'); end if;
  select * into strict v_account from public.island_economy_accounts
    where id=v_state.current_account_id for update;
  perform 1 from public.islands where player_id=p_island_owner for update;
  if p_actor_id<>p_island_owner and not exists(select 1 from public.island_members
    where island_owner=p_island_owner and player_id=p_actor_id and left_at is null) then
    perform public.island_wager_fail('not_member');
  end if;
  if p_run_epoch is not null and p_run_epoch<>v_account.run_epoch then
    perform public.island_wager_fail('epoch_mismatch');
  end if;
  if p_cursor is not null then
    select * into v_cursor from public.island_wagers where id=p_cursor
      and account_id=v_account.id and product=p_product;
    if not found then perform public.island_wager_fail('invalid_change'); end if;
  end if;
  select coalesce(jsonb_agg(to_jsonb(items)),'[]'::jsonb) into v_items from (
    select w.id,w.product,w.event_id as "eventId",w.selection,trunc(w.stake)::text as stake,
      w.opened_at as "openedAt",w.settle_at as "settleAt",coalesce(s.outcome,'open') as status,
      case when s.wager_id is null then null else trunc(s.returned_payout)::text end as payout,
      coalesce(p.display_name,'Captain') as "actorName",w.opening_evidence->>'home' as home,
      w.opening_evidence->>'away' as away
    from public.island_wagers w left join public.island_wager_settlements s on s.wager_id=w.id
      left join public.profiles p on p.id=w.actor_id
    where w.account_id=v_account.id and w.product=p_product
      and (p_cursor is null or (w.opened_at,w.id)<(v_cursor.opened_at,v_cursor.id))
    order by w.opened_at desc,w.id desc limit 51
  ) items;
  if jsonb_array_length(v_items)>50 then
    v_items := v_items-50;
    v_next := (v_items->49->>'id')::uuid;
  end if;
  return jsonb_build_object('status','done','economy',public.island_treasury_envelope(v_account),
    'items',v_items,'nextCursor',v_next,'product',p_product);
exception when sqlstate 'P0401' then return sqlerrm::jsonb;
end;
$$;
comment on function public.island_wager_page(uuid,uuid,uuid,text,uuid) is
  'Current-member account-scoped keyset pages. Page size is not an open-count limit. Old/other account cursors and stale epochs refuse; historical receipt replay has its separate immutable path.';

revoke all on function public.island_wager_queue_change() from public,anon,authenticated,service_role;
revoke all on function public.island_wager_jobs_due(integer) from public,anon,authenticated,service_role;
revoke all on function public.island_wager_job_retry(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.island_wager_page(uuid,uuid,uuid,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.island_wager_jobs_due(integer) to service_role;
grant execute on function public.island_wager_job_retry(uuid,text) to service_role;
grant execute on function public.island_wager_page(uuid,uuid,uuid,text,uuid) to service_role;
