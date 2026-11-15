-- =============================================================================
-- 20261115140000_guard_crew.sql
--
-- WHAT IT DOES
--   Hireable guards (decision D052, accepted by Nils on 15 Nov 2026): a fourth
--   crew kind next to the gunner, the carpenter and the lookout. A guard fights
--   boarders near the island's heart during a wave (frontend/src/pirates/sim.js,
--   CONFIG.crew.guard). Its price (60) and maximum (3) are in
--   backend/content/islands.json; the wave after which it can be hired (6) is in
--   backend/content/campaign.json. The server checks both before it calls
--   island_hire(), and passes the price and the maximum in.
--
--     islands              new column crew_guard (smallint, 0 by default), and
--                          the check rule islands_crew_range also keeps it
--                          between 0 and 10, like the other three
--     island_hire()        replaced (same five arguments): p_crew may also be
--                          'guard', which raises crew_guard. Everything else is
--                          as in 20261111030000_tower_defense.sql: the wallet is
--                          locked first, then the island; a repeated actionUid
--                          (ledger ref crew:<uid>) pays nothing; crew_full and
--                          insufficient_funds change nothing.
--
--   No new wallet reason: a guard is paid with crew_hire like every crew member.
--
-- WHO USES IT
--   Only the Python server, with the secret key (service_role): POST
--   /api/island/hire (backend/server/routes/island.py) and GET /api/island,
--   which reads crew_guard (backend/server/island/store.py). No browser role
--   gets anything new.
--
-- WHAT IT NEEDS
--   20261111030000_tower_defense.sql (the crew columns, islands_crew_range and
--   the first island_hire()).
--
-- SAFE TO RUN AGAIN
--   The column uses "if not exists", the check rule is dropped "if exists" first,
--   the function uses "create or replace", and revokes, grants and comments repeat.
--
-- DEPLOY ORDER
--   Apply this migration before the server that reads crew_guard is deployed:
--   that server selects the column on every GET /api/island.
--
-- ROLLBACK (by hand, only while every crew_guard is 0)
--   Run section 6 (island_hire) of 20261111030000_tower_defense.sql again, then
--   drop the column crew_guard and add islands_crew_range with the three
--   columns of that file.
--
-- HOW TO VERIFY (read-only, after applying)
--   select column_name, data_type, column_default from information_schema.columns
--    where table_name = 'islands' and column_name = 'crew_guard';   -- smallint, 0
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'islands_crew_range';                          -- four columns
--   select has_function_privilege('authenticated',
--          'public.island_hire(uuid, text, text, integer, integer)', 'execute'); -- false
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The column crew_guard and the crew check rule
-- -----------------------------------------------------------------------------

alter table public.islands add column if not exists crew_guard smallint not null default 0;

alter table public.islands drop constraint if exists islands_crew_range;
alter table public.islands
  add constraint islands_crew_range check (
    crew_gunner between 0 and 10 and crew_carpenter between 0 and 10
    and crew_lookout between 0 and 10 and crew_guard between 0 and 10
  );

comment on column public.islands.crew_guard is
  'Guards hired (island_hire, D052), at most the maximum of islands.json. They fight boarders near the heart in every wave on this island.';


-- -----------------------------------------------------------------------------
-- 2. island_hire(): one crew member, now also a guard
-- -----------------------------------------------------------------------------
-- Returns {status: done, count, balance, repeat} or {status: refused, reason:
-- player_not_set_up | no_island | crew_full | insufficient_funds}.

create or replace function public.island_hire(
  p_player_id  uuid,
  p_crew       text,
  p_action_uid text,
  p_price      integer,
  p_max        integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_ref     text;
  v_balance bigint;
  v_island  public.islands;
  v_count   integer;
begin
  if p_player_id is null or p_crew is null
     or p_crew not in ('gunner', 'carpenter', 'lookout', 'guard')
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_price is null or p_price < 1 or p_max is null or p_max not between 1 and 10 then
    raise exception 'bad_hire';
  end if;
  v_ref := 'crew:' || p_action_uid;

  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  select * into v_island from public.islands where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_island');
  end if;
  v_count := case p_crew
    when 'gunner' then v_island.crew_gunner
    when 'carpenter' then v_island.crew_carpenter
    when 'lookout' then v_island.crew_lookout
    else v_island.crew_guard
  end;

  if exists (
    select 1 from public.wallet_transactions
     where player_id = p_player_id and reason = 'crew_hire' and ref = v_ref
  ) then
    return jsonb_build_object('status', 'done', 'count', v_count, 'balance', v_balance, 'repeat', true);
  end if;

  if v_count >= p_max then
    return jsonb_build_object('status', 'refused', 'reason', 'crew_full');
  end if;
  if v_balance < p_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', p_price);
  end if;

  v_balance := public.apply_wallet_transaction(p_player_id, -p_price, 'crew_hire', v_ref);
  update public.islands
     set crew_gunner = crew_gunner + (p_crew = 'gunner')::integer,
         crew_carpenter = crew_carpenter + (p_crew = 'carpenter')::integer,
         crew_lookout = crew_lookout + (p_crew = 'lookout')::integer,
         crew_guard = crew_guard + (p_crew = 'guard')::integer
   where player_id = p_player_id;

  return jsonb_build_object('status', 'done', 'count', v_count + 1, 'balance', v_balance, 'repeat', false);
end;
$$;

revoke all on function public.island_hire(uuid, text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.island_hire(uuid, text, text, integer, integer)
  to service_role;

comment on function public.island_hire(uuid, text, text, integer, integer) is
  'Hires one gunner, carpenter, lookout or guard (D052) for the player''s island. Locks the wallet, then the island. A repeated actionUid (ledger ref crew:<uid>, reason crew_hire) answers {status: done, repeat: true}. Refuses no_island, crew_full (p_max) and insufficient_funds, with nothing changed. Only service_role may run it.';
