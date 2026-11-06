-- Atomic play-money sports pools. Used only by server/sports through the service role.
-- Provider results are fetched and verified by the server; browsers cannot write either table
-- or invoke these functions. No migration statement creates a fixture, stake or payout.
-- Reuses prediction_stake/prediction_payout with sports: refs, separate from L5 question refs.
-- Locks always follow fixture -> wallets in player-id order. Wallet locking also serialises
-- the daily cap across different fixtures. Rerunning this unapplied file is safe.

-- Provider identity and the original cutoff survive changed or delayed provider responses.
create table if not exists public.fixtures (
  fixture_id text primary key,
  provider text not null,
  provider_match_id bigint not null,
  sport text not null,
  competition text not null,
  home text not null,
  away text not null,
  kickoff timestamptz not null,
  closes_at timestamptz not null,
  status text not null default 'open',
  outcome text,
  settlement text,
  cut_coins bigint,
  paid_coins bigint,
  settled_at timestamptz,
  result_status text,
  home_score integer,
  away_score integer,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint fixtures_provider_identity check (
    provider_match_id > 0 and (
      (provider = 'football-data.org' and sport = 'football'
       and fixture_id = 'fd-' || provider_match_id::text)
      or (provider = 'balldontlie' and sport = 'basketball'
          and fixture_id = 'bdl-' || provider_match_id::text)
    )
  ),
  constraint fixtures_labels check (
    length(btrim(competition)) between 1 and 120 and length(btrim(home)) between 1 and 120
    and length(btrim(away)) between 1 and 120
    and competition !~ '[[:cntrl:]]' and home !~ '[[:cntrl:]]' and away !~ '[[:cntrl:]]'
  ),
  constraint fixtures_early_cutoff check (closes_at <= kickoff - interval '1 hour'),
  constraint fixtures_status check (status in ('open', 'settled')),
  constraint fixtures_result check (
    (status = 'open' and outcome is null and settlement is null and cut_coins is null
     and paid_coins is null and settled_at is null and result_status is null
     and home_score is null and away_score is null and verified_at is null)
    or (status = 'settled' and outcome is not null and settlement is not null
        and cut_coins is not null and paid_coins is not null and result_status is not null
        and outcome in ('home', 'draw', 'away', 'void')
        and settlement in ('winners', 'refund_void', 'refund_no_winners', 'refund_one_sided')
        and cut_coins >= 0 and paid_coins >= 0 and settled_at is not null
        and result_status in ('finished', 'postponed', 'cancelled', 'suspended')
        and verified_at is not null)
  ),
  constraint fixtures_result_identity check (
    status = 'open' or (
      (outcome = 'void' and result_status in ('postponed', 'cancelled', 'suspended'))
      or (outcome <> 'void' and result_status = 'finished' and home_score is not null
          and away_score is not null and (
            (outcome = 'home' and home_score > away_score)
            or (outcome = 'away' and away_score > home_score)
            or (outcome = 'draw' and sport = 'football' and home_score = away_score)
          ))
    )
  ),
  constraint fixtures_scores check (
    (home_score is null or home_score between 0 and 1000)
    and (away_score is null or away_score between 0 and 1000)
  )
);

-- One stake per captain/fixture and one durable action uid per captain across sports fixtures.
create table if not exists public.sports_stakes (
  id bigint generated always as identity primary key,
  fixture_id text not null references public.fixtures (fixture_id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  pick text not null,
  amount integer not null,
  stake_id text not null,
  payout bigint,
  created_at timestamptz not null default now(),
  constraint sports_stakes_pick check (pick in ('home', 'draw', 'away')),
  constraint sports_stakes_amount check (amount between 1 and 50),
  constraint sports_stakes_uid check (stake_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  constraint sports_stakes_payout check (payout is null or payout >= 0),
  constraint sports_stakes_one_per_fixture unique (player_id, fixture_id),
  constraint sports_stakes_one_per_uid unique (player_id, stake_id)
);
create index if not exists sports_stakes_fixture_order_idx on public.sports_stakes (fixture_id, id);
create index if not exists sports_stakes_player_day_idx on public.sports_stakes (player_id, created_at);

alter table public.fixtures enable row level security;
alter table public.sports_stakes enable row level security;
revoke all on table public.fixtures, public.sports_stakes
  from public, anon, authenticated, service_role;
grant select, insert, update on table public.fixtures, public.sports_stakes to service_role;
revoke all on sequence public.sports_stakes_id_seq from public, anon, authenticated, service_role;
grant usage, select on sequence public.sports_stakes_id_seq to service_role;

-- A paid fixture is final, including for direct server updates. Fixes need a reviewed new design.
create or replace function public.sports_keep_settled()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.status = 'settled' then
    raise exception 'sports_fixture_final';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
create or replace trigger sports_fixture_final
  before update or delete on public.fixtures
  for each row execute function public.sports_keep_settled();
revoke all on function public.sports_keep_settled() from public, anon, authenticated;
grant execute on function public.sports_keep_settled() to service_role;

-- The server supplies verified fixture metadata; the database independently checks all money,
-- identity, cutoff, idempotency and daily-cap facts before debiting a wallet.
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
     or p_max_stake is null or p_max_stake not between 1 and 50 or p_amount > p_max_stake
     or p_daily_cap is null or p_daily_cap not between 1 and 200
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

-- Recompute the exact three-way largest-remainder plan, then atomically pay every winner/refund.
-- Only a fresh provider result accepted by server/sports may reach this server-only RPC.
create or replace function public.sports_settle_fixture(
  p_fixture_id text, p_outcome text, p_provider text, p_provider_match_id bigint,
  p_home_score integer, p_away_score integer, p_result_status text,
  p_expected_stakes bigint[], p_payouts jsonb, p_cut_percent integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_fixture public.fixtures%rowtype;
  v_ids bigint[];
  v_total bigint;
  v_winning bigint;
  v_cut bigint := 0;
  v_paid bigint;
  v_settlement text;
  v_expected jsonb;
  v_given jsonb;
  v_player uuid;
  v_payout record;
  v_when timestamptz;
begin
  if p_fixture_id is null or p_outcome is null or p_outcome not in ('home', 'draw', 'away', 'void')
     or p_provider is null or p_provider_match_id is null or p_cut_percent is distinct from 5
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
  select coalesce(array_agg(id order by id), '{}'::bigint[]), coalesce(sum(amount), 0),
         coalesce(sum(amount) filter (where pick = p_outcome), 0)
    into v_ids, v_total, v_winning from public.sports_stakes where fixture_id = p_fixture_id;
  if v_ids is distinct from p_expected_stakes then
    return jsonb_build_object('status', 'refused', 'reason', 'stakes_changed');
  end if;
  if p_outcome = 'void' then
    v_settlement := 'refund_void';
  elsif v_winning = 0 then
    v_settlement := 'refund_no_winners';
  elsif v_winning = v_total then
    v_settlement := 'refund_one_sided';
  else
    v_settlement := 'winners';
    v_cut := (v_total - v_winning) * p_cut_percent / 100;
  end if;
  v_paid := v_total - v_cut;
  with paid_stakes as (
    select id, player_id, amount,
           case when v_settlement = 'winners' then amount::bigint * v_paid / greatest(v_winning, 1)
                else amount::bigint end as whole,
           amount::bigint * v_paid % greatest(v_winning, 1) as remainder
      from public.sports_stakes
     where fixture_id = p_fixture_id and (v_settlement <> 'winners' or pick = p_outcome)
  ), ranked as (
    select *, row_number() over (order by remainder desc, id) as rank,
           v_paid - sum(whole) over () as left_over from paid_stakes
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'row_id', id, 'player_id', player_id,
           'coins', whole + case when rank <= left_over then 1 else 0 end) order by id), '[]'::jsonb)
    into v_expected from ranked;
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
  -- A consistent player order also protects two different fixtures settling concurrently.
  for v_player in select player_id from public.sports_stakes
                   where fixture_id = p_fixture_id order by player_id
  loop
    perform 1 from public.wallets where player_id = v_player for update;
  end loop;
  for v_payout in select x.player_id, x.coins from jsonb_to_recordset(v_expected)
                   as x(row_id bigint, player_id uuid, coins bigint) order by x.player_id
  loop
    perform public.apply_wallet_transaction(v_payout.player_id, v_payout.coins::integer,
                                            'prediction_payout', 'sports:pool:' || p_fixture_id);
  end loop;
  update public.sports_stakes set payout = 0 where fixture_id = p_fixture_id;
  update public.sports_stakes as s set payout = x.coins
    from jsonb_to_recordset(v_expected) as x(row_id bigint, player_id uuid, coins bigint)
   where s.id = x.row_id and s.fixture_id = p_fixture_id;
  v_when := clock_timestamp();
  update public.fixtures set status = 'settled', outcome = p_outcome, settlement = v_settlement,
         cut_coins = v_cut, paid_coins = v_paid, settled_at = v_when,
         result_status = p_result_status, home_score = p_home_score, away_score = p_away_score,
         verified_at = v_when where fixture_id = p_fixture_id;
  return jsonb_build_object('status', 'done', 'settlement', v_settlement,
                           'paidPlayers', jsonb_array_length(v_expected), 'paidCoins', v_paid,
                           'cutCoins', v_cut, 'settledAt', v_when);
end;
$$;
revoke all on function public.sports_settle_fixture(text, text, text, bigint, integer, integer,
  text, bigint[], jsonb, integer) from public, anon, authenticated;
grant execute on function public.sports_settle_fixture(text, text, text, bigint, integer, integer,
  text, bigint[], jsonb, integer) to service_role;

comment on table public.fixtures is 'Server-only sports pools bound to provider ids and an early cutoff. Settled results are immutable; no browser policy.';
comment on table public.sports_stakes is 'Server-only one play-money stake per player and fixture. UID and prefixed wallet refs enforce retries; account deletion cascades private stakes.';
comment on function public.sports_keep_settled() is 'Prevents updating or deleting any settled sports pool, including direct service-role writes.';
comment on function public.sports_place_stake(text, uuid, text, integer, text, text, bigint, text,
  text, text, text, timestamptz, timestamptz, integer, integer, timestamptz) is
  'Server-only atomic sports stake: canonical live-provider identity, one-hour cutoff, wallet lock, per-player fixture/UID uniqueness and Lisbon-day cap. Reuses prediction_stake with sports:stake: refs.';
comment on function public.sports_settle_fixture(text, text, text, bigint, integer, integer, text,
  bigint[], jsonb, integer) is
  'Server-only provider-result settlement: validates final scores or disrupted refund status, exact stake snapshot and largest-remainder three-way payouts, then pays once with sorted wallet locks. Reuses prediction_payout with sports:pool: refs.';
