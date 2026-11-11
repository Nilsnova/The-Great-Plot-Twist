-- =============================================================================
-- 20261111010000_market_calls.sql
--
-- WHAT IT DOES
--   Simple market calls for the Harbor market stall (decision D034): "Up or
--   down in 1 hour?" on Bitcoin, Ether, Gold, Apple or NVIDIA, with a stake of
--   5, 10 or 25 coins. A right call pays twice the stake, a wrong one nothing,
--   and a call that cannot be decided pays the stake back. It replaces the
--   leverage positions in the game; the Exchange tables stay untouched.
--
--     market_calls          one row per call: who, which asset, up or down,
--                           the stake, the price at the start, when it is
--                           decided, and the outcome once it is
--
--     market_call_open()    opens a call in ONE step: locks the wallet, answers
--                           a repeated actionUid with the same call, allows at
--                           most 3 open calls per player, takes the stake
--     market_call_settle()  decides a call in ONE step, once: won (2 x stake),
--                           lost (0) or refunded (the stake back)
--
--     wallet reasons        market_call_stake (spend) and market_call_payout
--                           (earn: the winnings or a refund)
--
-- WHO USES IT
--   Only the Python server, with the secret key (service_role): GET and POST
--   /api/market/calls (backend/server/market/calls.py). The browser never reads
--   the table: row-level security on, no policy, no browser grant. Run it after
--   every earlier migration.
--
-- THE RULES THAT THE DATABASE KEEPS
--   1. Play money only; coins move only through apply_wallet_transaction(). The
--      stake has the ledger ref call:<call id> (market_call_stake) and the payout
--      the same ref (market_call_payout), so each happens at most once.
--   2. The asset is one of five market company ids (harbor-trust for Bitcoin,
--      tidewright-works for Ether, greyfathom-salvage for Gold, apple, nvidia);
--      the direction is up or down; the stake 5, 10 or 25.
--   3. The same player and actionUid open one call only; a repeat answers with
--      that call and changes nothing.
--   4. A player has at most 3 open calls (not settled yet).
--   5. A call is decided at its settle time (opened_at + 1 hour) or later, once.
--      Higher (up) or lower (down) than the opening price: won, payout 2 x
--      stake. The other way: lost, payout 0. The same price: refunded. No price
--      until 24 hours after the settle time: refunded.
--   6. The server reads the prices (the market feed) and passes them in; the
--      database checks that they are positive and compares.
--
-- WHAT IT NEEDS
--   The foundation migration (profiles, wallets, wallet_reasons,
--   apply_wallet_transaction). PostgreSQL 13 or newer for gen_random_uuid().
--
-- SAFE TO RUN TWICE
--   The table and indexes use "if not exists", the reasons "on conflict do
--   nothing", the functions "create or replace", and revokes, grants and
--   comments simply repeat.
--
-- HOW THE FILE IS ORGANISED
--   1. Two wallet reasons
--   2. Table market_calls, rights
--   3. Function market_call_open()
--   4. Function market_call_settle()
--
-- HOW TO VERIFY (read-only queries, after applying)
--   a. select relrowsecurity from pg_class where relname = 'market_calls';   -- true
--      select count(*) from pg_policies where tablename = 'market_calls';    -- 0
--   b. select reason, direction from public.wallet_reasons
--       where reason like 'market_call_%';                -- stake spend, payout earn
--   c. Only the server may run the functions (browser false, server true):
--        select p.proname,
--               has_function_privilege('authenticated', p.oid, 'execute') as browser,
--               has_function_privilege('service_role', p.oid, 'execute') as server
--          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--         where n.nspname = 'public' and p.proname like 'market_call_%';
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Two wallet reasons
-- -----------------------------------------------------------------------------
-- The same pairs, in the same order, end WALLET_REASONS in
-- backend/server/wallet.py (a test compares them).

insert into public.wallet_reasons (reason, direction, description) values
  ('market_call_stake',  'spend', 'The stake of an up-or-down market call at the Harbor market stall.'),
  ('market_call_payout', 'earn',  'A market call paid out: twice the stake for a right call, or the stake back.')
on conflict (reason) do nothing;


-- -----------------------------------------------------------------------------
-- 2. Table market_calls: every up-or-down call
-- -----------------------------------------------------------------------------

create table if not exists public.market_calls (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references public.profiles (id) on delete cascade,
  action_uid    text not null,
  asset         text not null,
  direction     text not null,
  stake         integer not null,
  open_price    numeric(28, 10) not null,
  opened_at     timestamptz not null default now(),
  settle_at     timestamptz not null,
  settled_at    timestamptz,
  settle_price  numeric(28, 10),
  outcome       text,
  payout        integer,

  constraint market_calls_action_uid_format
    check (action_uid ~ '^[A-Za-z0-9_-]{8,64}$'),
  -- The five assets of the stall (backend/server/market/calls.py, a test compares).
  constraint market_calls_asset_allowed
    check (asset in ('harbor-trust', 'tidewright-works', 'greyfathom-salvage', 'apple', 'nvidia')),
  constraint market_calls_direction_allowed
    check (direction in ('up', 'down')),
  constraint market_calls_stake_allowed
    check (stake in (5, 10, 25)),
  constraint market_calls_open_price_positive
    check (open_price > 0),
  constraint market_calls_settle_after_open
    check (settle_at > opened_at),
  constraint market_calls_outcome_allowed
    check (outcome is null or outcome in ('won', 'lost', 'refunded')),
  -- The result is all there (outcome, payout, settled_at) or all missing; a
  -- refund for a missing price has no settle price.
  constraint market_calls_result_complete
    check (
      (settled_at is null) = (outcome is null)
      and (settled_at is null) = (payout is null)
      and (settle_price is null or settled_at is not null)
      and (settle_price is null or settle_price > 0)
    ),
  constraint market_calls_payout_fits_outcome
    check (
      outcome is null
      or (outcome = 'won' and payout = stake * 2)
      or (outcome = 'lost' and payout = 0)
      or (outcome = 'refunded' and payout = stake)
    )
);

-- One call per player and actionUid: a repeated click is the same call.
create unique index if not exists market_calls_one_per_action
  on public.market_calls (player_id, action_uid);

-- A player's open calls, and the newest settled ones, quickly.
create index if not exists market_calls_player_open_idx
  on public.market_calls (player_id, opened_at desc);

comment on table public.market_calls is
  'One row per up-or-down market call at the Harbor market stall: the player, the asset, the direction, the stake (5, 10 or 25 coins), the opening price, when it is decided (1 hour later) and the outcome. Written only by market_call_open() and market_call_settle(). No browser access.';
comment on column public.market_calls.id is
  'The call id. The stake and the payout both carry the ledger ref call:<id>.';
comment on column public.market_calls.player_id is
  'The player who made the call. Deleting the player deletes the row.';
comment on column public.market_calls.action_uid is
  'The id the browser made for the click (8 to 64 letters, digits, hyphens or underscores). One call per player and actionUid.';
comment on column public.market_calls.asset is
  'The market company id: harbor-trust (Bitcoin), tidewright-works (Ether), greyfathom-salvage (Gold), apple or nvidia.';
comment on column public.market_calls.direction is
  'up: the player says the price will be higher at the settle time; down: lower.';
comment on column public.market_calls.stake is
  'Whole coins staked: 5, 10 or 25.';
comment on column public.market_calls.open_price is
  'The live price the server read when the call was opened.';
comment on column public.market_calls.opened_at is
  'When the call was opened. Set by the database.';
comment on column public.market_calls.settle_at is
  'When the call is decided: opened_at plus 1 hour.';
comment on column public.market_calls.settled_at is
  'When the call was decided. Null while it is open.';
comment on column public.market_calls.settle_price is
  'The price the call was decided with: the first price the server read at or after settle_at. Null for an open call and for a refund because no price came.';
comment on column public.market_calls.outcome is
  'won, lost or refunded. Null while the call is open.';
comment on column public.market_calls.payout is
  'Coins paid back: 2 x stake (won), 0 (lost) or the stake (refunded). Null while open.';

-- Row-level security on and no policy: no browser role sees a row.
--   anon, authenticated  nothing
--   service_role         read, insert (open), update (settle); no delete
alter table public.market_calls enable row level security;
revoke all on table public.market_calls from public, anon, authenticated, service_role;
grant select, insert, update on table public.market_calls to service_role;


-- -----------------------------------------------------------------------------
-- 3. Function market_call_open(): open a call
-- -----------------------------------------------------------------------------
--   p_player_id   the verified player
--   p_action_uid  the id the browser made for the click
--   p_asset       one of the five assets (the table rule checks it)
--   p_direction   up or down
--   p_stake       5, 10 or 25
--   p_open_price  the live price the server read, above 0
--
-- It returns {"status": "opened", "call": {...}, "balance": ..., "repeat": ...}
-- or {"status": "refused", "reason": "player_not_set_up" | "too_many_calls"}
-- with nothing changed. Not enough coins raises insufficient_funds (from the
-- wallet) and changes nothing. A bad argument raises bad_market_call.

create or replace function public.market_call_open(
  p_player_id  uuid,
  p_action_uid text,
  p_asset      text,
  p_direction  text,
  p_stake      integer,
  p_open_price numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  -- The rules of the stall (backend/server/market/calls.py repeats them; a test compares).
  c_max_open constant integer  := 3;
  c_hold     constant interval := interval '1 hour';
  v_balance  bigint;
  v_call     public.market_calls;
  v_repeat   boolean := false;
begin
  if p_player_id is null or p_action_uid is null or p_asset is null
     or p_direction is null or p_stake is null
     or p_open_price is null or p_open_price <= 0 then
    raise exception 'bad_market_call';
  end if;

  -- The wallet first, as in every money function: one player's calls run one at a time.
  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  select * into v_call
    from public.market_calls
   where player_id = p_player_id and action_uid = p_action_uid;

  if found then
    v_repeat := true;
  else
    if (select count(*) from public.market_calls
         where player_id = p_player_id and settled_at is null) >= c_max_open then
      return jsonb_build_object('status', 'refused', 'reason', 'too_many_calls');
    end if;

    insert into public.market_calls
      (player_id, action_uid, asset, direction, stake, open_price, settle_at)
    values
      (p_player_id, p_action_uid, p_asset, p_direction, p_stake, p_open_price, now() + c_hold)
    returning * into v_call;

    v_balance := public.apply_wallet_transaction(
      p_player_id, -p_stake, 'market_call_stake', 'call:' || v_call.id::text
    );
  end if;

  return jsonb_build_object(
    'status', 'opened', 'call', to_jsonb(v_call), 'balance', v_balance, 'repeat', v_repeat
  );
end;
$$;

revoke all on function public.market_call_open(uuid, text, text, text, integer, numeric)
  from public, anon, authenticated, service_role;
grant execute on function public.market_call_open(uuid, text, text, text, integer, numeric)
  to service_role;

comment on function public.market_call_open(uuid, text, text, text, integer, numeric) is
  'Opens an up-or-down market call in one step: locks the wallet, answers a repeated player and actionUid with the same call (repeat true), refuses a fourth open call (too_many_calls), writes the call (settle_at = now + 1 hour) and takes the stake with apply_wallet_transaction() (reason market_call_stake, ref call:<id>). Returns {status: opened, call, balance, repeat} or {status: refused, reason}. Raises insufficient_funds (from the wallet) or bad_market_call. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 4. Function market_call_settle(): decide a call, once
-- -----------------------------------------------------------------------------
--   p_call_id       the call
--   p_settle_price  the price the server read at or after settle_at, or null
--                   when it has none
--
-- It returns {"status": "settled", "call": {...}, "balance": ..., "repeat": ...}
-- or {"status": "refused", "reason": "no_such_call" | "not_due" | "no_price"}
-- with nothing changed: not_due before settle_at, no_price for a null price
-- while the 24-hour wait for a price has not passed.

create or replace function public.market_call_settle(
  p_call_id      uuid,
  p_settle_price numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  -- How long a call waits for a price before the stake goes back.
  c_price_wait constant interval := interval '24 hours';
  v_player     uuid;
  v_balance    bigint;
  v_call       public.market_calls;
  v_outcome    text;
  v_payout     integer;
  v_repeat     boolean := false;
begin
  if p_call_id is null or (p_settle_price is not null and p_settle_price <= 0) then
    raise exception 'bad_market_settle';
  end if;

  -- The owner of the call, so the wallet can be locked first.
  select player_id into v_player from public.market_calls where id = p_call_id;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_call');
  end if;
  select balance into v_balance from public.wallets where player_id = v_player for update;
  select * into v_call from public.market_calls where id = p_call_id for update;

  if v_call.settled_at is not null then
    v_repeat := true;
  elsif now() < v_call.settle_at then
    return jsonb_build_object('status', 'refused', 'reason', 'not_due');
  elsif p_settle_price is null and now() <= v_call.settle_at + c_price_wait then
    return jsonb_build_object('status', 'refused', 'reason', 'no_price');
  else
    if p_settle_price is null or p_settle_price = v_call.open_price then
      v_outcome := 'refunded';
      v_payout := v_call.stake;
    elsif (v_call.direction = 'up') = (p_settle_price > v_call.open_price) then
      v_outcome := 'won';
      v_payout := v_call.stake * 2;
    else
      v_outcome := 'lost';
      v_payout := 0;
    end if;

    update public.market_calls
       set settled_at = now(), settle_price = p_settle_price, outcome = v_outcome,
           payout = v_payout
     where id = p_call_id
    returning * into v_call;

    if v_payout > 0 then
      v_balance := public.apply_wallet_transaction(
        v_player, v_payout, 'market_call_payout', 'call:' || v_call.id::text
      );
    end if;
  end if;

  return jsonb_build_object(
    'status', 'settled', 'call', to_jsonb(v_call), 'balance', v_balance, 'repeat', v_repeat
  );
end;
$$;

revoke all on function public.market_call_settle(uuid, numeric)
  from public, anon, authenticated, service_role;
grant execute on function public.market_call_settle(uuid, numeric) to service_role;

comment on function public.market_call_settle(uuid, numeric) is
  'Decides a market call once: locks the wallet, then the call. A settled call answers as it is (repeat true). Refuses before settle_at (not_due), and a null price while the 24-hour wait has not passed (no_price). Then: a price higher (up) or lower (down) than the opening price wins 2 x stake; the other way loses; the same price, or no price after 24 hours, refunds the stake (reason market_call_payout, ref call:<id>). Returns {status: settled, call, balance, repeat} or {status: refused, reason}. Only service_role may run it.';
