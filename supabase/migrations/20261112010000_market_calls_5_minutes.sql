-- =============================================================================
-- 20261112010000_market_calls_5_minutes.sql
--
-- WHAT IT DOES
--   Market calls at the Harbor market stall are decided 5 minutes after they
--   open, not 1 hour. Only the waiting time changes:
--
--     market_call_open()    c_hold is interval '5 minutes' (was '1 hour'), so a
--                           new call gets settle_at = now() + 5 minutes.
--     market_call_settle()  no hard-coded hour (it reads settle_at from the
--                           row), so it is the same as before; it is repeated
--                           here so both functions of the stall can be read in
--                           one place.
--     comments              the table and settle_at comments said "1 hour".
--
--   Nothing else in 20261111010000_market_calls.sql hard-codes the hour: the
--   table, its check rules and its indexes only store settle_at. The 24-hour
--   wait for a price is a different rule and stays.
--
-- WHY
--   Owner request, 11 November 2026: a call that takes an hour is too slow to
--   play at the stall.
--
-- NOTES
--   - Both functions are copied from 20261111010000_market_calls.sql (which is
--     already applied and never edited), with the same signature, security
--     invoker, empty search_path, revoke and grant.
--   - Calls opened before this migration keep their stored settle_at (1 hour).
--   - A stock outside New York hours settles at the last close, so a 5-minute
--     call on it would only return the stake. The server offers a stock only
--     while its price is live (backend/server/market/calls.py).
--   - Safe to run twice: create or replace.
-- =============================================================================

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
  c_hold     constant interval := interval '5 minutes';
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
  'Opens an up-or-down market call in one step: locks the wallet, answers a repeated player and actionUid with the same call (repeat true), refuses a fourth open call (too_many_calls), writes the call (settle_at = now + 5 minutes) and takes the stake with apply_wallet_transaction() (reason market_call_stake, ref call:<id>). Returns {status: opened, call, balance, repeat} or {status: refused, reason}. Raises insufficient_funds (from the wallet) or bad_market_call. Only service_role may run it.';


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


-- -----------------------------------------------------------------------------
-- Comments that named the old hour
-- -----------------------------------------------------------------------------

comment on table public.market_calls is
  'One row per up-or-down market call at the Harbor market stall: the player, the asset, the direction, the stake (5, 10 or 25 coins), the opening price, when it is decided (5 minutes later; calls opened before 12 Nov 2026 took 1 hour) and the outcome. Written only by market_call_open() and market_call_settle(). No browser access.';
comment on column public.market_calls.settle_at is
  'When the call is decided: opened_at plus 5 minutes (1 hour for calls opened before 12 Nov 2026).';
