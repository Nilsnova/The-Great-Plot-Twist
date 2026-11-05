-- =============================================================================
-- 20261106010000_island_exchange.sql
--
-- WHAT IT DOES
--   The database part of the Island Exchange (package L4): fictional island
--   companies whose play-money prices follow real markets. It adds three wallet
--   reasons, three tables and two functions.
--
--     market_bases       one row per company: the "base" its price is measured
--                        from, and whether trading is paused
--     market_positions   one row per player and company: how many units the
--                        player holds
--     market_trades      the trade history: one row for every buy or sell
--
--     market_set_base()  saves a company's base (and a pause) safely, even
--                        when two server instances try at the same moment
--     market_trade()     the only way a trade happens: it moves the coins, writes
--                        the trade and changes the position in ONE step
--
-- WHO USES IT
--   You run it once on the Supabase project, AFTER the foundation migration
--   (20261106000000_foundation.sql), because it uses the wallet and the profiles
--   table from there. The steps are in supabase/README.md. After that the Python
--   server (backend/server/market/) does all the writing, with the secret key.
--   The browser may only read its own positions and trades, and the company bases.
--
-- THE RULES THAT THE DATABASE KEEPS
--   1. Play money only. Coins cannot be bought, cashed out or exchanged for real
--      prizes. The simulation says so on screen.
--   2. The browser never writes. Players can read; every write goes through the
--      server (rule D003, docs/DECISIONS.md).
--   3. Coins move only through apply_wallet_transaction() (the foundation file).
--      market_trade() calls it, so a trade follows the same rules as every other
--      coin change: a known reason, the right direction, never below 0 coins,
--      and every change has a ref that can be used only once.
--   4. A trade is all or nothing. Either the coins, the trade row and the position
--      change together, or nothing changes.
--   5. Someone who is not signed in (role "anon") gets nothing at all.
--   6. The arithmetic of a trade is checked again. The server works out the coins
--      (rounded against the player, plus the fee), and market_trade() recomputes
--      them from the units and the price. If the server ever had a bug, the
--      database refuses the trade instead of moving wrong coins. The same goes
--      for the size of a purchase, the company and the start of the market day.
--
--   The price rules (the multiplier, the floor and ceiling, the 30 % breaker,
--   the daily re-base) live in Python (backend/server/market/rules.py). The
--   database stores their state and enforces the limits that depend on what a
--   player did before, because only the database sees two requests at the same
--   moment. It does not repeat the price rules: the price is an input from the
--   server, like the amount of a wallet change (see "what the server may do" in
--   supabase/README.md). Everything that follows from the price, it checks.
--
-- WHAT IT NEEDS
--   The foundation migration (tables profiles, wallets, wallet_reasons,
--   wallet_transactions and the function apply_wallet_transaction). A Supabase
--   project has the roles anon, authenticated and service_role already.
--
-- SAFE TO RUN TWICE
--   Tables and indexes use "if not exists", the new reasons use "on conflict do
--   nothing", functions use "create or replace", policies are dropped and
--   created again, and grants and comments simply repeat. A second run changes
--   nothing.
--
-- HOW THE FILE IS ORGANISED
--   1. Wallet reasons market_buy, market_sell and market_fee
--   2. Table market_bases
--   3. Table market_positions
--   4. Table market_trades
--   5. Row-level security: who may see which row
--   6. Table privileges: which roles may use which table at all
--   7. Function market_set_base()
--   8. Function market_trade()
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Wallet reasons
-- -----------------------------------------------------------------------------
-- A buy writes two ledger rows: market_buy (the shares, coins go out) and
-- market_fee (the fee, coins go out). A sell writes market_sell (coins come in)
-- and market_fee. All rows of one trade share the same ref, which is allowed
-- because the ledger accepts each player + reason + ref once.
--
-- The same three pairs, in the same order, are added at the END of
-- WALLET_REASONS in backend/server/wallet.py. A test reads this INSERT. Write
-- each description without an apostrophe.

insert into public.wallet_reasons (reason, direction, description) values
  ('market_buy',  'spend', 'Coins paid for shares bought on the Island Exchange.'),
  ('market_sell', 'earn',  'Coins received for shares sold on the Island Exchange.'),
  ('market_fee',  'spend', 'Fee paid on a trade on the Island Exchange.')
on conflict (reason) do nothing;


-- -----------------------------------------------------------------------------
-- 2. Table market_bases: where each company's price is measured from
-- -----------------------------------------------------------------------------
-- A company's game price is worked out from its BASE: the game price and the
-- real price at the moment the base was set. The base is set when the company is
-- first looked at, at the daily re-base (08:00 Lisbon time), when the real price
-- source changes, and when a pause ends. Every Vercel instance of the server
-- reads the same row, so every instance agrees on the base and on a pause. (Each
-- instance still works out the price from its own copy of the real prices, so
-- two instances can differ by the age of that copy.)
--
-- A pause starts when the game price is 30 % away from the base. While it lasts,
-- halted_until and frozen_price are both filled in. When it is over, the server
-- sets a new base (the frozen price, and the real price of that moment) and
-- clears both.
--
-- version counts the saves. market_set_base() only saves when the version is the
-- one the server read, so two instances cannot overwrite each other's change.
--
-- No row is ever deleted: the companies are listed in a data file, and a row is
-- created the first time a company is looked at.

create table if not exists public.market_bases (
  company_id      text primary key,
  base_game_price numeric(18, 4) not null,
  base_real_price numeric(24, 8) not null,
  base_at         timestamptz not null,
  base_source     text not null,
  halted_until    timestamptz,
  frozen_price    numeric(18, 4),
  version         integer not null default 1,

  -- The pattern reads: from the start (^) to the end ($), 2 to 40 characters,
  -- each one of: a-z, 0-9, hyphen. The server checks the same thing.
  constraint market_bases_company_id_format
    check (company_id ~ '^[a-z0-9-]{2,40}$'),
  constraint market_bases_prices_above_zero
    check (base_game_price > 0 and base_real_price > 0),
  constraint market_bases_source_allowed
    check (base_source in ('live', 'replay')),
  constraint market_bases_frozen_price_above_zero
    check (frozen_price is null or frozen_price > 0),
  -- A pause has both a time and a price, or neither.
  constraint market_bases_pause_is_complete
    check ((halted_until is null) = (frozen_price is null)),
  constraint market_bases_version_above_zero
    check (version >= 1)
);

comment on table public.market_bases is
  'One row per Island Exchange company: the base its game price is measured from (a game price and a real price), and whether trading is paused. Every server instance reads and saves the same row, so all agree on the base and on a pause. Signed-in players may read it. Only the server writes it, through market_set_base().';
comment on column public.market_bases.company_id is
  'The company, as written in backend/content/market/companies.json: lowercase letters, digits and hyphens, for example harbor-trust.';
comment on column public.market_bases.base_game_price is
  'The company game price (in coins) at the moment the base was set. Game prices have 2 decimals.';
comment on column public.market_bases.base_real_price is
  'The real price of the instrument the company follows (in USDT) at the moment the base was set.';
comment on column public.market_bases.base_at is
  'When the base was set. A base set before the latest 08:00 Lisbon time is replaced at the daily re-base.';
comment on column public.market_bases.base_source is
  'Which kind of real prices base_real_price comes from: live (the Binance feed) or replay (the recorded prices). The two cannot be compared, so the server sets a new base when the kind changes.';
comment on column public.market_bases.halted_until is
  'While this time is in the future, trading in the company is paused (the 30 % circuit breaker). Empty when the company is not paused. Shares are not sold when a pause starts.';
comment on column public.market_bases.frozen_price is
  'The price the company is stuck at while it is paused (30 % above or below the base). Filled in exactly when halted_until is.';
comment on column public.market_bases.version is
  'How many times the row was saved, starting at 1. market_set_base() saves only if the version is the one the caller read.';


-- -----------------------------------------------------------------------------
-- 3. Table market_positions: what each player holds
-- -----------------------------------------------------------------------------
-- One row per player and company, while the player holds at least 1 unit. When a
-- player sells everything the row is deleted. A player reads only their own rows.
--
-- last_buy_at is what the minimum holding time counts from. Every buy sets it,
-- so buying more restarts the clock for all the shares of that company.

create table if not exists public.market_positions (
  player_id   uuid not null references public.profiles (id) on delete cascade,
  company_id  text not null,
  units       bigint not null,
  avg_price   numeric(18, 6) not null,
  opened_at   timestamptz not null default now(),
  last_buy_at timestamptz not null default now(),

  primary key (player_id, company_id),
  constraint market_positions_company_id_format
    check (company_id ~ '^[a-z0-9-]{2,40}$'),
  constraint market_positions_units_above_zero
    check (units > 0),
  constraint market_positions_avg_price_above_zero
    check (avg_price > 0)
);

comment on table public.market_positions is
  'One row per player and company: how many units the player holds and what they paid on average. The row is deleted when the player sells every unit. Players can read only their own rows. Only market_trade() writes them.';
comment on column public.market_positions.player_id is
  'The player who holds the units. Deleting the player deletes this row.';
comment on column public.market_positions.company_id is
  'The company, as written in backend/content/market/companies.json.';
comment on column public.market_positions.units is
  'Whole units held. Always above 0: a position with 0 units does not exist.';
comment on column public.market_positions.avg_price is
  'The average game price per unit that the player paid, without fees. A buy changes it (weighted by units). A sell does not.';
comment on column public.market_positions.opened_at is
  'When the player first bought this company. For display only.';
comment on column public.market_positions.last_buy_at is
  'When the player last bought this company. The minimum holding time counts from here, so a new buy restarts the clock for all units of the company.';


-- -----------------------------------------------------------------------------
-- 4. Table market_trades: the trade history
-- -----------------------------------------------------------------------------
-- One row for every buy or sell, never edited afterwards (no role can update or
-- delete a row; rows disappear only when their player is deleted). The server
-- also uses it to add up what a player has bought today (the daily buy cap).
--
-- The ref is "market:" plus the id the browser made for the click (actionUid).
-- A player can use a ref only once, so a repeated request cannot trade twice.
-- The wallet ledger rows of the trade carry the same ref.

create table if not exists public.market_trades (
  id         bigint generated always as identity primary key,
  player_id  uuid not null references public.profiles (id) on delete cascade,
  company_id text not null,
  side       text not null,
  units      bigint not null,
  price      numeric(18, 4) not null,
  gross      bigint not null,
  fee        bigint not null,
  ref        text not null,
  created_at timestamptz not null default now(),

  constraint market_trades_company_id_format
    check (company_id ~ '^[a-z0-9-]{2,40}$'),
  constraint market_trades_side_allowed
    check (side in ('buy', 'sell')),
  constraint market_trades_units_above_zero
    check (units > 0),
  constraint market_trades_price_above_zero
    check (price > 0),
  constraint market_trades_gross_above_zero
    check (gross > 0),
  constraint market_trades_fee_not_negative
    check (fee >= 0),
  constraint market_trades_ref_not_blank
    check (char_length(btrim(ref)) > 0),
  constraint market_trades_ref_max_length
    check (char_length(ref) <= 120)
);

-- The newest trades of a player first. It also serves the daily buy cap, which
-- adds up the player's recent buys, and the cleanup when a player is deleted.
create index if not exists market_trades_player_id_idx
  on public.market_trades (player_id, id desc);

-- One trade per player and ref. This makes a repeated request safe.
create unique index if not exists market_trades_one_row_per_ref
  on public.market_trades (player_id, ref);

comment on table public.market_trades is
  'The trade history of the Island Exchange: one row per buy or sell, never edited afterwards. Players can read only their own rows. Rows are added only by market_trade(). The same player and ref can appear only once.';
comment on column public.market_trades.id is
  'Running number in the order the trades happened. Order the rows of a player by id.';
comment on column public.market_trades.player_id is
  'The player who traded. Deleting the player deletes this row.';
comment on column public.market_trades.company_id is
  'The company that was traded, as written in backend/content/market/companies.json.';
comment on column public.market_trades.side is
  'buy or sell.';
comment on column public.market_trades.units is
  'Whole units traded. Always above 0.';
comment on column public.market_trades.price is
  'The game price per unit at the moment of the trade, in coins, with 2 decimals.';
comment on column public.market_trades.gross is
  'Whole coins for the shares themselves, without the fee. Rounded against the player: up when buying, down when selling.';
comment on column public.market_trades.fee is
  'Whole coins of fee, rounded up. A buy cost gross + fee, a sell paid gross - fee.';
comment on column public.market_trades.ref is
  'market: plus the actionUid the browser made for the click, at most 120 characters. For one player the same ref can be used only once, so a repeated request cannot trade twice. The wallet ledger rows of the trade use the same ref.';
comment on column public.market_trades.created_at is
  'When the database transaction of the trade started.';


-- -----------------------------------------------------------------------------
-- 5. Row-level security (RLS): who may see which row
-- -----------------------------------------------------------------------------
-- Same plan as the foundation file: all policies are for "authenticated" and
-- are read policies. There is no policy for insert, update or delete, so no
-- player can write. "anon" has no policy, so it gets nothing.

alter table public.market_bases     enable row level security;
alter table public.market_positions enable row level security;
alter table public.market_trades    enable row level security;

-- market_bases: every signed-in player may read every company's base. It holds
-- no personal data, and a screen can use it to show a pause.
drop policy if exists "Players can read all market bases" on public.market_bases;
create policy "Players can read all market bases"
  on public.market_bases for select to authenticated
  using (true);
comment on policy "Players can read all market bases" on public.market_bases is
  'Any signed-in player may read the bases of all companies. They hold no personal data. Nobody except the server can write them.';

-- market_positions: a player may read only their own positions.
drop policy if exists "Players can read their own market positions" on public.market_positions;
create policy "Players can read their own market positions"
  on public.market_positions for select to authenticated
  using (player_id = (select auth.uid()));
comment on policy "Players can read their own market positions" on public.market_positions is
  'A signed-in player may read only their own positions. Nobody except the server can write them.';

-- market_trades: a player may read only their own trades.
drop policy if exists "Players can read their own market trades" on public.market_trades;
create policy "Players can read their own market trades"
  on public.market_trades for select to authenticated
  using (player_id = (select auth.uid()));
comment on policy "Players can read their own market trades" on public.market_trades is
  'A signed-in player may read only their own trades. Nobody except the server can add rows.';

-- No insert, update or delete policy on any of the three tables: the browser
-- never writes game data.


-- -----------------------------------------------------------------------------
-- 6. Table privileges: which roles may use which table at all
-- -----------------------------------------------------------------------------
-- The second lock, as in the foundation file. First take everything away from
-- every role (this also makes the file behave the same on a project that hands
-- out rights to new tables by itself), then give back only what is needed.
--
--   anon           nothing
--   authenticated  read only (RLS then limits the rows)
--   service_role   the server:
--                    market_bases      read, insert, update   (a company is never deleted)
--                    market_positions  read, insert, update, delete (deleted when a player sells everything)
--                    market_trades     read, insert           (the history is append-only)

revoke all on table
  public.market_bases,
  public.market_positions,
  public.market_trades
from public, anon, authenticated, service_role;

-- The trade counter (the sequence behind the identity column "id"). An identity
-- column needs no rights on its counter, but a project that exposes new objects
-- hands out rights on new sequences. Anyone who could move the counter could
-- break every later trade.
revoke all on sequence public.market_trades_id_seq
from public, anon, authenticated, service_role;

grant select on table
  public.market_bases,
  public.market_positions,
  public.market_trades
to authenticated;

grant select, insert, update on table public.market_bases to service_role;
grant select, insert, update, delete on table public.market_positions to service_role;
grant select, insert on table public.market_trades to service_role;


-- -----------------------------------------------------------------------------
-- 7. Function market_set_base(): save a company's base, safely
-- -----------------------------------------------------------------------------
-- The server calls this when a company gets a new base or a pause starts. Two
-- server instances can look at the same company at the same moment, so a plain
-- "save this" could let one erase the other's pause. Instead the caller says
-- which version of the row it read (p_expected_version):
--
--   * 0 means "I found no row": the row is created, unless somebody created it
--     first.
--   * 1 or more means "I read this version": the row is changed only if it still
--     has that version.
--
-- It returns the new version number, or null when somebody else saved first. In
-- that case the caller reads the row again and uses what it finds.
--
-- It runs with the rights of its caller (not SECURITY DEFINER), so only a role
-- with insert and update rights on the table can use it: the server.

create or replace function public.market_set_base(
  p_company_id       text,
  p_base_game_price  numeric,
  p_base_real_price  numeric,
  p_base_at          timestamptz,
  p_base_source      text,
  p_halted_until     timestamptz,
  p_frozen_price     numeric,
  p_expected_version integer
)
returns integer
language plpgsql
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_version integer;  -- stays null when nothing was saved
begin
  if p_expected_version is null or p_expected_version < 0 then
    raise exception 'bad_version';
  end if;

  if p_expected_version = 0 then
    insert into public.market_bases
      (company_id, base_game_price, base_real_price, base_at, base_source,
       halted_until, frozen_price, version)
    values
      (p_company_id, p_base_game_price, p_base_real_price, p_base_at, p_base_source,
       p_halted_until, p_frozen_price, 1)
    on conflict (company_id) do nothing
    returning version into v_version;
  else
    update public.market_bases
       set base_game_price = p_base_game_price,
           base_real_price = p_base_real_price,
           base_at         = p_base_at,
           base_source     = p_base_source,
           halted_until    = p_halted_until,
           frozen_price    = p_frozen_price,
           version         = version + 1
     where company_id = p_company_id
       and version = p_expected_version
    returning version into v_version;
  end if;

  return v_version;
end;
$$;

revoke all on function public.market_set_base(text, numeric, numeric, timestamptz, text, timestamptz, numeric, integer)
  from public, anon, authenticated;
grant execute on function public.market_set_base(text, numeric, numeric, timestamptz, text, timestamptz, numeric, integer)
  to service_role;

comment on function public.market_set_base(text, numeric, numeric, timestamptz, text, timestamptz, numeric, integer) is
  'Saves the base (and a pause) of one Island Exchange company. p_expected_version is the version the caller read: 0 creates the row, 1 or more changes it only if the row still has that version. Returns the new version, or null if somebody else saved first. Raises bad_version for a missing or negative version, and a constraint error for bad values. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 8. Function market_trade(): the only way a trade happens
-- -----------------------------------------------------------------------------
-- The server works out the numbers (price, whole coins, fee: see
-- backend/server/market/trade_rules.py) and calls this. In ONE transaction it:
--
--   0. checks the numbers it is given (see step 1 in the body): the coins must
--      follow from the units and the price, the fee from the fee rate, a purchase
--      must not be bigger than the limit, and the company must exist,
--   1. locks the player's wallet row, so a player's trades happen one at a time,
--   2. refuses a repeated ref,
--   3. refuses the trade if the company is paused,
--   4. checks the limits that depend on earlier trades: the daily buy cap for a
--      buy; the units held and the minimum holding time for a sell,
--   5. moves the coins with apply_wallet_transaction() (a buy: market_buy and
--      market_fee, both spend; a sell: market_sell, earn, and market_fee, spend),
--   6. changes the position, and
--   7. writes the trade row.
--
--   p_player_id         whose wallet and position change
--   p_company_id        the company
--   p_side              'buy' or 'sell'
--   p_units             whole units, at least 1
--   p_price             the game price per unit, in coins (recorded in the trade)
--   p_gross             whole coins for the shares, at least 1. It must be the units
--                       times the price rounded against the player: UP for a buy,
--                       DOWN for a sell
--   p_fee               whole coins of fee: the fee rate of p_gross, rounded UP
--   p_ref               'market:' plus the id the browser made for the click
--   p_min_hold_seconds  the minimum holding time before a sell
--   p_daily_buy_cap     the most coins (shares only) a player may buy per market day
--   p_day_start         when the market day began (08:00 Lisbon time), for the cap.
--                       It cannot be in the future (a minute of clock difference is
--                       allowed), or the cap would count no trades at all
--   p_fee_basis_points  the fee rate in basis points (200 = 2 %), to check p_fee
--   p_max_buy_coins     the most a single PURCHASE may be worth in coins (shares
--                       only). A sale has no upper limit
--
-- It returns a JSON object:
--   {"status": "done", "balance": ..., "unitsAfter": ..., "avgPrice": ..., "tradeId": ...}
--   {"status": "refused", "reason": ...} when a rule says no. Nothing was changed.
--       reason "halted"           the company is paused
--       reason "daily_cap"        also "coinsLeft", what the player may still buy today
--       reason "not_enough_units" also "unitsHeld"
--       reason "holding_time"     also "waitSeconds", how long until the units can be sold
--
-- Real failures raise an error and change nothing:
--   * insufficient_funds, unknown_reason, wrong_direction: from the wallet function.
--   * A repeated ref: error code 23505 (unique violation), message already_applied.
--   * wallet_not_found, unknown_company, bad_trade: a missing wallet, a company
--     without a base, or arguments that make no sense or do not add up (a wrong
--     gross or fee, a purchase over the limit, a market day in the future). These
--     mean the server and the database disagree: they are bugs, not refusals.
--
-- Why a refusal is returned and not raised: a raised error cannot carry the
-- reason through the server's database client, and nothing was written yet, so
-- there is nothing to undo.
--
-- It is not SECURITY DEFINER on purpose. It runs with the rights of its caller,
-- so a player (who has no rights on these tables and no right to run it) is
-- stopped even if it were granted by mistake.

-- An earlier draft of this file had no p_fee_basis_points and no p_max_buy_coins.
-- If that draft was ever run on a project, its function must go: otherwise two
-- versions would exist side by side. Nothing happens if it was never run.
drop function if exists public.market_trade(uuid, text, text, bigint, numeric, bigint, bigint, text, integer, bigint, timestamptz);

create or replace function public.market_trade(
  p_player_id        uuid,
  p_company_id       text,
  p_side             text,
  p_units            bigint,
  p_price            numeric,
  p_gross            bigint,
  p_fee              bigint,
  p_ref              text,
  p_min_hold_seconds integer,
  p_daily_buy_cap    bigint,
  p_day_start        timestamptz,
  p_fee_basis_points integer,
  p_max_buy_coins    bigint
)
returns jsonb
language plpgsql
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_balance      bigint;
  v_held_units   bigint;
  v_held_price   numeric;
  v_last_buy_at  timestamptz;
  v_spent_today  bigint;
  v_wait_seconds integer;
  v_units_after  bigint;
  v_avg_price    numeric;
  v_trade_id     bigint;
  v_exact_gross  numeric;
begin
  -- Step 1: the arguments must make sense, and they must add up. A missing value
  -- would make a later comparison quietly "not true", so none may be missing.
  if p_side is null or p_side not in ('buy', 'sell')
     or p_units is null or p_units < 1
     or p_price is null or p_price <= 0
     or p_gross is null or p_gross < 1
     or p_fee is null or p_fee < 0
     or p_min_hold_seconds is null or p_min_hold_seconds < 0
     or p_daily_buy_cap is null or p_daily_buy_cap < 0
     or p_day_start is null
     or p_fee_basis_points is null or p_fee_basis_points < 0
     or p_max_buy_coins is null or p_max_buy_coins < 1 then
    raise exception 'bad_trade';
  end if;

  -- The coins of the shares are the units times the price, rounded against the
  -- player: up when buying, down when selling. The fee is its rate of the shares'
  -- coins, rounded up. The server works both out the same way (trade_rules.py).
  if p_side = 'buy' then
    v_exact_gross := ceil(p_units * p_price);
  else
    v_exact_gross := floor(p_units * p_price);
  end if;
  if p_gross <> v_exact_gross
     or p_fee <> ceil(p_gross::numeric * p_fee_basis_points / 10000) then
    raise exception 'bad_trade';
  end if;

  -- One purchase may be worth at most p_max_buy_coins. A sale has no upper limit,
  -- so a player can always sell what they hold, even after a price rise.
  if p_side = 'buy' and p_gross > p_max_buy_coins then
    raise exception 'bad_trade';
  end if;

  -- The market day cannot start in the future. If it could, the daily cap below
  -- would count no trades at all. One minute of difference between the clock of
  -- the server and the clock of the database is allowed.
  if p_day_start > now() + interval '1 minute' then
    raise exception 'bad_trade';
  end if;

  -- The company must be known. The server saves a base for every company before it
  -- trades (market_set_base), and a base is never deleted.
  if not exists (select 1 from public.market_bases where company_id = p_company_id) then
    raise exception 'unknown_company';
  end if;

  -- Step 2: lock the player's wallet row until the end of this transaction. A
  -- second trade by the same player waits here, so the checks below always see
  -- the first trade. (A SELECT ... FOR UPDATE needs the right to update wallets.)
  perform 1 from public.wallets where player_id = p_player_id for update;
  if not found then
    raise exception 'wallet_not_found';
  end if;

  -- Step 3: a repeated ref. Say "already applied" with the unique-violation code
  -- (23505), the same answer the wallet gives, before any other rule can answer.
  if exists (
    select 1 from public.market_trades where player_id = p_player_id and ref = p_ref
  ) then
    raise exception 'already_applied' using errcode = '23505';
  end if;

  -- Step 4: a paused company cannot be traded. The server checks this first, too,
  -- but only the database sees a pause that another instance has just saved.
  if exists (
    select 1 from public.market_bases
     where company_id = p_company_id and halted_until > now()
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'halted');
  end if;

  -- Step 5: the limits that depend on earlier trades.
  if p_side = 'buy' then
    select coalesce(sum(gross), 0)
      into v_spent_today
      from public.market_trades
     where player_id = p_player_id and side = 'buy' and created_at >= p_day_start;

    if v_spent_today + p_gross > p_daily_buy_cap then
      return jsonb_build_object(
        'status', 'refused', 'reason', 'daily_cap',
        'coinsLeft', greatest(p_daily_buy_cap - v_spent_today, 0)
      );
    end if;
  else
    select units, avg_price, last_buy_at
      into v_held_units, v_held_price, v_last_buy_at
      from public.market_positions
     where player_id = p_player_id and company_id = p_company_id
       for update;

    if not found or v_held_units < p_units then
      return jsonb_build_object(
        'status', 'refused', 'reason', 'not_enough_units',
        'unitsHeld', coalesce(v_held_units, 0)
      );
    end if;

    v_wait_seconds := ceil(extract(epoch from
      (v_last_buy_at + make_interval(secs => p_min_hold_seconds) - now())
    ));
    if v_wait_seconds > 0 then
      return jsonb_build_object(
        'status', 'refused', 'reason', 'holding_time', 'waitSeconds', v_wait_seconds
      );
    end if;
  end if;

  -- Step 6: move the coins. Each call is checked by the wallet function, and an
  -- error (not enough coins, a repeated ref) cancels the whole trade.
  if p_side = 'buy' then
    v_balance := public.apply_wallet_transaction(p_player_id, -p_gross, 'market_buy', p_ref);
  else
    v_balance := public.apply_wallet_transaction(p_player_id, p_gross, 'market_sell', p_ref);
  end if;
  if p_fee > 0 then
    v_balance := public.apply_wallet_transaction(p_player_id, -p_fee, 'market_fee', p_ref);
  end if;

  -- Step 7: change the position.
  if p_side = 'buy' then
    insert into public.market_positions as mp
      (player_id, company_id, units, avg_price, opened_at, last_buy_at)
    values
      (p_player_id, p_company_id, p_units, p_price, now(), now())
    on conflict (player_id, company_id) do update
      set avg_price   = round((mp.units * mp.avg_price + excluded.units * excluded.avg_price)
                              / (mp.units + excluded.units), 6),
          units       = mp.units + excluded.units,
          last_buy_at = now()
    returning mp.units, mp.avg_price into v_units_after, v_avg_price;
  else
    v_units_after := v_held_units - p_units;
    v_avg_price := v_held_price;
    if v_units_after = 0 then
      delete from public.market_positions
       where player_id = p_player_id and company_id = p_company_id;
      v_avg_price := null;
    else
      update public.market_positions
         set units = v_units_after
       where player_id = p_player_id and company_id = p_company_id;
    end if;
  end if;

  -- Step 8: write the trade row.
  insert into public.market_trades (player_id, company_id, side, units, price, gross, fee, ref)
  values (p_player_id, p_company_id, p_side, p_units, p_price, p_gross, p_fee, p_ref)
  returning id into v_trade_id;

  return jsonb_build_object(
    'status', 'done',
    'balance', v_balance,
    'unitsAfter', v_units_after,
    'avgPrice', v_avg_price,
    'tradeId', v_trade_id
  );
end;
$$;

revoke all on function public.market_trade(uuid, text, text, bigint, numeric, bigint, bigint, text, integer, bigint, timestamptz, integer, bigint)
  from public, anon, authenticated;
grant execute on function public.market_trade(uuid, text, text, bigint, numeric, bigint, bigint, text, integer, bigint, timestamptz, integer, bigint)
  to service_role;

comment on function public.market_trade(uuid, text, text, bigint, numeric, bigint, bigint, text, integer, bigint, timestamptz, integer, bigint) is
  'The only way an Island Exchange trade happens. In one step: checks that the arguments add up (the coins follow from the units and the price, rounded against the player; the fee follows from the fee rate; a purchase is at most p_max_buy_coins; the market day is not in the future; the company has a base), locks the wallet, refuses a repeated ref (error 23505 already_applied), refuses a paused company, checks the daily buy cap (buy) or the units held and the minimum holding time (sell), moves the coins with apply_wallet_transaction() (market_buy or market_sell, plus market_fee), changes the position and writes the trade. Returns {status: done, balance, unitsAfter, avgPrice, tradeId}, or {status: refused, reason: halted, daily_cap, not_enough_units or holding_time} with nothing changed. Raises insufficient_funds (from the wallet), wallet_not_found, unknown_company or bad_trade. Only service_role may run it.';
