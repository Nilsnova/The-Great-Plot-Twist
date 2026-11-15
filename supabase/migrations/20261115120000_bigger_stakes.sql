-- =============================================================================
-- 20261115120000_bigger_stakes.sql
--
-- WHAT IT DOES
--   Bigger Harbor stakes and double-or-nothing match payouts (decision D050,
--   owner request 15 Nov 2026: "only betting 25 when you have 1,000 is
--   useless"). Play coins only, as everywhere in the game.
--
--     sports_stakes         the check rule sports_stakes_amount allows 1 to
--                           10,000 coins (was 1 to 50).
--     sports_place_stake()  the same function and signature, but it accepts a
--                           p_max_stake from 1 to 10,000 (was 50) and a
--                           p_daily_cap from 1 to 25,000 (was 200). The server
--                           sends 10,000 and 25,000 (backend/server/sports/rules.py).
--     sports_settle_fixture()  fixed even odds instead of a shared pool: a right
--                           pick pays 2 x its stake, a wrong pick 0, a void
--                           match (postponed, cancelled, suspended) refunds
--                           every stake. No cut. The old 10-argument function
--                           (with p_cut_percent) is dropped and a 9-argument
--                           one takes its place; like before, it recomputes the
--                           plan itself and refuses a server plan that differs.
--                           A finished match is stored with settlement
--                           'winners' (also when nobody picked right), cut_coins
--                           0 and paid_coins = the coins paid out.
--     market_calls          the check rule market_calls_stake_allowed allows 5
--                           to 10,000 coins (was 5, 10 or 25). market_call_open()
--                           and market_call_settle() need no change: they take
--                           the stake as given and already pay 2 x on a right
--                           call (market_calls_payout_fits_outcome).
--
-- OLD STAKES
--   Every match stake that is still open settles under the new rule, whenever
--   it was placed: all of them are 1 to 50 coins, valid under both rules. Pools
--   settled before this migration keep their stored pool payouts; a settled
--   fixture is final (sports_keep_settled).
--
-- WHAT IT NEEDS
--   20261106180000_sports_desk.sql and 20261111010000_market_calls.sql (and
--   20261112010000_market_calls_5_minutes.sql). Deploy order: apply this file,
--   then deploy the server that sends the new limits and the 9-argument
--   settlement. A server from before it keeps placing stakes of up to 50 coins,
--   but its settlement call (10 arguments) no longer exists, so its open stakes
--   just wait: no coin moves until the new server settles them.
--
-- HOW TO CHECK
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname in ('sports_stakes_amount', 'market_calls_stake_allowed');
--     -> CHECK (amount >= 1 AND amount <= 10000), CHECK (stake >= 5 AND stake <= 10000)
--   select pg_get_function_identity_arguments('public.sports_settle_fixture'::regproc);
--     -> 9 arguments, no p_cut_percent
--   Scratch tests: CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]'
--     pytest -q server/tests/sports_sql server/tests/market_calls_sql   (from backend/)
--
-- SAFE TO RUN AGAIN
--   Each constraint is dropped if it exists and added again; the functions use
--   create or replace (the old settlement function is dropped if it exists).
--
-- ROLLBACK (by hand, only while every stake is at most 50 and every call 5, 10
-- or 25 coins, and the old server is deployed again)
--   Run the sports_stakes_amount, sports_place_stake() and
--   sports_settle_fixture() parts of 20261106180000_sports_desk.sql again,
--   drop the 9-argument sports_settle_fixture(), and add the check rule
--   market_calls_stake_allowed check (stake in (5, 10, 25)) again. Fixtures
--   settled under the double-or-nothing rule stay as they are.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- The stake limits
-- -----------------------------------------------------------------------------

alter table public.sports_stakes drop constraint if exists sports_stakes_amount;
alter table public.sports_stakes add constraint sports_stakes_amount
  check (amount between 1 and 10000);

alter table public.market_calls drop constraint if exists market_calls_stake_allowed;
alter table public.market_calls add constraint market_calls_stake_allowed
  check (stake between 5 and 10000);

comment on column public.market_calls.stake is
  'Whole coins staked: 5 to 10,000 (5, 10 or 25 before 15 Nov 2026).';
comment on table public.market_calls is
  'One row per up-or-down market call at the Harbor market stall: the player, the asset, the direction, the stake (5 to 10,000 coins), the opening price, when it is decided (5 minutes later; calls opened before 12 Nov 2026 took 1 hour) and the outcome. Written only by market_call_open() and market_call_settle(). No browser access.';

-- -----------------------------------------------------------------------------
-- sports_place_stake(): copied from 20261106180000_sports_desk.sql; only the
-- two limit checks change (p_max_stake up to 10,000, p_daily_cap up to 25,000).
-- -----------------------------------------------------------------------------

create or replace function public.sports_place_stake(
  p_fixture_id text, p_player_id uuid, p_pick text, p_amount integer, p_stake_id text,
  p_provider text, p_provider_match_id bigint, p_sport text, p_competition text, p_home text,
  p_away text, p_kickoff timestamptz, p_closes_at timestamptz, p_max_stake integer,
  p_daily_cap integer, p_day_start timestamptz)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_fixture public.fixtures%rowtype;
  v_stake public.sports_stakes%rowtype;
  v_coins bigint;
  v_today bigint;
  v_id bigint;
  v_day timestamptz;
begin
  v_day := date_trunc('day', clock_timestamp() at time zone 'Europe/Lisbon') at time zone 'Europe/Lisbon';
  if p_fixture_id is null or p_player_id is null or p_pick is null
     or p_pick not in ('home', 'draw', 'away') or p_amount is null or p_amount < 1
     or p_max_stake is null or p_max_stake not between 1 and 10000 or p_amount > p_max_stake
     or p_daily_cap is null or p_daily_cap not between 1 and 25000
     or p_stake_id is null or p_stake_id !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_provider is null or p_provider_match_id is null or p_provider_match_id < 1
     or p_sport is null or p_competition is null or p_home is null or p_away is null
     or p_kickoff is null or p_closes_at is null or p_day_start is distinct from v_day
     or p_closes_at <> p_kickoff - interval '1 hour'
     or not ((p_provider = 'football-data.org' and p_sport = 'football'
              and p_fixture_id = 'fd-' || p_provider_match_id::text)
             or (p_provider = 'balldontlie' and p_sport = 'basketball'
                 and p_fixture_id = 'bdl-' || p_provider_match_id::text))
     or (p_sport = 'basketball' and p_pick = 'draw') then
    raise exception 'bad_sports_stake';
  end if;
  insert into public.fixtures (fixture_id, provider, provider_match_id, sport, competition,
                               home, away, kickoff, closes_at)
  values (p_fixture_id, p_provider, p_provider_match_id, p_sport, p_competition,
          p_home, p_away, p_kickoff, p_closes_at)
  on conflict (fixture_id) do nothing;
  select * into v_fixture from public.fixtures where fixture_id = p_fixture_id for update;
  -- Pin the FK parent before any wallet. delete_player removes profiles before wallets;
  -- taking the wallet first would deadlock with its cascade at the later ledger/stake FK.
  perform 1 from public.profiles where id = p_player_id for key share;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_missing');
  end if;
  -- Wallet before the day sum: two different fixture locks cannot overspend a daily cap.
  select balance into v_coins from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_missing');
  end if;
  select * into v_stake from public.sports_stakes
   where player_id = p_player_id and stake_id = p_stake_id;
  select coalesce(sum(amount), 0) into v_today from public.sports_stakes
   where player_id = p_player_id and created_at >= p_day_start;
  if v_stake.id is not null then
    if v_stake.fixture_id <> p_fixture_id or v_stake.pick <> p_pick or v_stake.amount <> p_amount then
      return jsonb_build_object('status', 'refused', 'reason', 'stake_id_conflict');
    end if;
    return jsonb_build_object('status', 'repeat', 'id', v_stake.id, 'fixtureId', v_stake.fixture_id,
                             'pick', v_stake.pick, 'amount', v_stake.amount,
                             'coins', v_coins, 'stakedToday', v_today);
  end if;
  if v_fixture.provider <> p_provider or v_fixture.provider_match_id <> p_provider_match_id
     or v_fixture.sport <> p_sport or v_fixture.home <> p_home or v_fixture.away <> p_away
     or v_fixture.competition <> p_competition then
    return jsonb_build_object('status', 'refused', 'reason', 'fixture_changed');
  end if;
  if v_fixture.status = 'settled' then
    return jsonb_build_object('status', 'refused', 'reason', 'fixture_closed');
  end if;
  -- Store an earlier observed deadline permanently; a later/stale instance cannot reopen it.
  if p_closes_at < v_fixture.closes_at then
    update public.fixtures set closes_at = p_closes_at where fixture_id = p_fixture_id;
  end if;
  if clock_timestamp() >= least(v_fixture.closes_at, p_closes_at) then
    return jsonb_build_object('status', 'refused', 'reason', 'fixture_closed');
  end if;
  if exists (select 1 from public.sports_stakes
              where player_id = p_player_id and fixture_id = p_fixture_id) then
    return jsonb_build_object('status', 'refused', 'reason', 'already_staked');
  end if;
  if v_today + p_amount > p_daily_cap then
    return jsonb_build_object('status', 'refused', 'reason', 'daily_cap',
                              'coinsLeft', greatest(0, p_daily_cap - v_today));
  end if;
  v_coins := public.apply_wallet_transaction(
    p_player_id, -p_amount, 'prediction_stake', 'sports:stake:' || p_stake_id);
  insert into public.sports_stakes (fixture_id, player_id, pick, amount, stake_id)
  values (p_fixture_id, p_player_id, p_pick, p_amount, p_stake_id) returning id into v_id;
  return jsonb_build_object('status', 'done', 'id', v_id, 'fixtureId', p_fixture_id,
                           'pick', p_pick, 'amount', p_amount, 'coins', v_coins,
                           'stakedToday', v_today + p_amount);
end;
$$;
revoke all on function public.sports_place_stake(text, uuid, text, integer, text, text, bigint,
  text, text, text, text, timestamptz, timestamptz, integer, integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.sports_place_stake(text, uuid, text, integer, text, text, bigint,
  text, text, text, text, timestamptz, timestamptz, integer, integer, timestamptz) to service_role;

-- -----------------------------------------------------------------------------
-- sports_settle_fixture(): double or nothing. The checks of the result, the
-- locks (profiles, then wallets in player order), the stake snapshot and the
-- payout JSON are the same as in 20261106180000_sports_desk.sql; only the plan
-- changes, and p_cut_percent is gone.
-- -----------------------------------------------------------------------------

drop function if exists public.sports_settle_fixture(text, text, text, bigint, integer, integer,
  text, bigint[], jsonb, integer);

create or replace function public.sports_settle_fixture(
  p_fixture_id text, p_outcome text, p_provider text, p_provider_match_id bigint,
  p_home_score integer, p_away_score integer, p_result_status text,
  p_expected_stakes bigint[], p_payouts jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  -- A right pick gets back this many times its stake (backend/server/sports/rules.py).
  c_multiplier constant integer := 2;
  v_fixture public.fixtures%rowtype;
  v_ids bigint[];
  v_paid bigint;
  v_settlement text;
  v_expected jsonb;
  v_given jsonb;
  v_player uuid;
  v_payout record;
  v_when timestamptz;
begin
  if p_fixture_id is null or p_outcome is null or p_outcome not in ('home', 'draw', 'away', 'void')
     or p_provider is null or p_provider_match_id is null
     or p_result_status is null or p_expected_stakes is null or p_payouts is null
     or jsonb_typeof(p_payouts) <> 'array' or jsonb_array_length(p_payouts) > 10000
     or (p_home_score is not null and p_home_score not between 0 and 1000)
     or (p_away_score is not null and p_away_score not between 0 and 1000) then
    raise exception 'bad_sports_settlement';
  end if;
  select * into v_fixture from public.fixtures where fixture_id = p_fixture_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'fixture_missing');
  end if;
  if p_provider <> v_fixture.provider or p_provider_match_id <> v_fixture.provider_match_id then
    raise exception 'bad_sports_settlement';
  end if;
  if v_fixture.status = 'settled' then
    return jsonb_build_object('status', 'repeat', 'settlement', v_fixture.settlement,
                             'paidPlayers', (select count(*) from public.sports_stakes
                                             where fixture_id = p_fixture_id and payout > 0),
                             'paidCoins', v_fixture.paid_coins, 'cutCoins', v_fixture.cut_coins,
                             'settledAt', v_fixture.settled_at);
  end if;
  if p_outcome = 'void' then
    if p_result_status not in ('postponed', 'cancelled', 'suspended') then
      raise exception 'bad_sports_settlement';
    end if;
  elsif p_result_status <> 'finished' or p_home_score is null or p_away_score is null
        or clock_timestamp() < v_fixture.kickoff
        or (p_outcome = 'draw' and (v_fixture.sport <> 'football' or p_home_score <> p_away_score))
        or (p_outcome = 'home' and p_home_score <= p_away_score)
        or (p_outcome = 'away' and p_away_score <= p_home_score) then
    raise exception 'bad_sports_settlement';
  end if;
  -- All FK parents precede all wallets, matching account deletion's parent-first order.
  perform p.id from public.profiles as p
   where p.id in (select player_id from public.sports_stakes where fixture_id = p_fixture_id)
   order by p.id for key share;
  for v_player in select player_id from public.sports_stakes
                   where fixture_id = p_fixture_id order by player_id
  loop
    perform 1 from public.wallets where player_id = v_player for update;
  end loop;
  select coalesce(array_agg(id order by id), '{}'::bigint[])
    into v_ids from public.sports_stakes where fixture_id = p_fixture_id;
  if v_ids is distinct from p_expected_stakes then
    return jsonb_build_object('status', 'refused', 'reason', 'stakes_changed');
  end if;
  -- The plan: a void match refunds every stake; otherwise every right pick gets
  -- c_multiplier x its stake and a wrong pick gets nothing (no entry).
  v_settlement := case when p_outcome = 'void' then 'refund_void' else 'winners' end;
  select coalesce(jsonb_agg(jsonb_build_object(
           'row_id', id, 'player_id', player_id,
           'coins', case when p_outcome = 'void' then amount::bigint
                         else amount::bigint * c_multiplier end) order by id), '[]'::jsonb)
    into v_expected from public.sports_stakes
   where fixture_id = p_fixture_id and (p_outcome = 'void' or pick = p_outcome);
  select coalesce(sum((e ->> 'coins')::bigint), 0) into v_paid
    from jsonb_array_elements(v_expected) as e;
  if exists (select 1 from jsonb_array_elements(p_payouts) as e
              where jsonb_typeof(e) <> 'object' or not (e ?& array['row_id', 'player_id', 'coins'])
                 or case when jsonb_typeof(e) = 'object'
                         then (select count(*) from jsonb_object_keys(e)) else 0 end <> 3
                 or jsonb_typeof(e -> 'row_id') <> 'number' or e ->> 'row_id' !~ '^[1-9][0-9]*$'
                 or jsonb_typeof(e -> 'coins') <> 'number' or e ->> 'coins' !~ '^[1-9][0-9]*$'
                 or jsonb_typeof(e -> 'player_id') <> 'string') then
    raise exception 'bad_sports_settlement';
  end if;
  begin
    select coalesce(jsonb_agg(jsonb_build_object('row_id', x.row_id, 'player_id', x.player_id,
                                               'coins', x.coins) order by x.row_id), '[]'::jsonb)
      into v_given from jsonb_to_recordset(p_payouts) as x(row_id bigint, player_id uuid, coins bigint);
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'bad_sports_settlement';
  end;
  if v_expected is distinct from v_given then
    raise exception 'bad_sports_settlement';
  end if;
  for v_payout in select x.player_id, x.coins from jsonb_to_recordset(v_expected)
                   as x(row_id bigint, player_id uuid, coins bigint) order by x.player_id
  loop
    perform public.apply_wallet_transaction(v_payout.player_id, v_payout.coins,
                                            'prediction_payout', 'sports:pool:' || p_fixture_id);
  end loop;
  update public.sports_stakes set payout = 0 where fixture_id = p_fixture_id;
  update public.sports_stakes as s set payout = x.coins
    from jsonb_to_recordset(v_expected) as x(row_id bigint, player_id uuid, coins bigint)
   where s.id = x.row_id and s.fixture_id = p_fixture_id;
  v_when := clock_timestamp();
  update public.fixtures set status = 'settled', outcome = p_outcome, settlement = v_settlement,
         cut_coins = 0, paid_coins = v_paid, settled_at = v_when,
         result_status = p_result_status, home_score = p_home_score, away_score = p_away_score,
         verified_at = v_when where fixture_id = p_fixture_id;
  return jsonb_build_object('status', 'done', 'settlement', v_settlement,
                           'paidPlayers', jsonb_array_length(v_expected), 'paidCoins', v_paid,
                           'cutCoins', 0, 'settledAt', v_when);
end;
$$;
revoke all on function public.sports_settle_fixture(text, text, text, bigint, integer, integer,
  text, bigint[], jsonb) from public, anon, authenticated;
grant execute on function public.sports_settle_fixture(text, text, text, bigint, integer, integer,
  text, bigint[], jsonb) to service_role;

comment on table public.sports_stakes is 'Server-only one play-money stake per player and fixture (1 to 10,000 coins since 15 Nov 2026). UID and prefixed wallet refs enforce retries; account deletion cascades private stakes.';
comment on function public.sports_place_stake(text, uuid, text, integer, text, text, bigint, text,
  text, text, text, timestamptz, timestamptz, integer, integer, timestamptz) is
  'Server-only atomic sports stake: canonical live-provider identity, one-hour cutoff, wallet lock, per-player fixture/UID uniqueness and Lisbon-day cap (max stake up to 10,000, daily cap up to 25,000). Reuses prediction_stake with sports:stake: refs.';
comment on function public.sports_settle_fixture(text, text, text, bigint, integer, integer, text,
  bigint[], jsonb) is
  'Server-only provider-result settlement at fixed even odds (D050): validates final scores or disrupted refund status and the exact stake snapshot, pays 2 x stake to every right pick (nothing to a wrong pick) or refunds every stake of a void match, once, with sorted wallet locks. Reuses prediction_payout with sports:pool: refs.';
