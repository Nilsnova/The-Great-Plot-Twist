-- =============================================================================
-- 20261106090000_exchange_leverage.sql
--
-- WHAT IT DOES
--   The database part of the Island Exchange, version 2 (package L4): real
--   prices and 10x positions. Every investment is a position with a stake of
--   coins, rising or falling. If the price moves 10 % against a position, its
--   stake is used up and the position closes by itself at zero. This file
--   replaces everything the first Exchange file (20261106010000_island_exchange
--   .sql) added, except the wallet reasons, and adds:
--
--     two wallet reasons  market_stake (the stake goes out) and market_payout
--                         (the value of a closed position comes in). The fee
--                         reason market_fee of the first file is used again.
--     exchange_positions  one row per position of a player
--     exchange_events     the history: one row for every open, close and close
--                         at zero, never edited
--
--     exchange_open_position()   opens a position: the stake and the fee leave
--                                the wallet, the position and its history are
--                                written, all in ONE step
--     exchange_close_position()  closes one position of a player: the value is
--                                paid, the closing fee is taken, in ONE step
--     exchange_close_used_up()   closes, in one statement, every position whose
--                                zero point a price has reached. No coins move
--
-- WHO USES IT
--   You run it once on the Supabase project, AFTER the foundation migration
--   (20261106000000_foundation.sql) and the first Exchange file. The steps are
--   in supabase/README.md. After that the Python server (backend/server/market/)
--   does all the writing, with the secret key. The browser may only read its own
--   positions and events.
--
-- THE RULES THAT THE DATABASE KEEPS
--   1. Play money only. Coins cannot be bought, cashed out or exchanged for real
--      prizes. The simulation says so on screen.
--   2. The browser never writes. Players can read; every write goes through the
--      server (rule D003, docs/DECISIONS.md).
--   3. Coins move only through apply_wallet_transaction() (the foundation file).
--      The functions below call it, so every coin change follows the same rules
--      as every other one: a known reason, the right direction, never below 0
--      coins, and a ref that can be used only once.
--   4. Nobody can be left below zero. After the opening, a position can only PAY
--      coins into a wallet, never take them out: the value is never negative and
--      the closing fee is never more than the value. The most a player can lose
--      on one position is the stake plus the opening fee.
--   5. An opening and a closing are all or nothing. Either the coins, the
--      position and the history change together, or nothing changes.
--   6. Someone who is not signed in (role "anon") gets nothing at all.
--   7. The arithmetic is checked again. The server works out the fee, the value
--      and the closing fee; the functions recompute them from the stake, the
--      entry price and the closing price. If the server ever had a bug, the
--      database refuses (bad_trade) instead of moving wrong coins.
--
--   The price rules live in Python (backend/server/market/): where the prices
--   come from, when a market is open, what a company shows. The database stores
--   the positions and keeps the limits that depend on what a player did before,
--   because only the database sees two requests at the same moment. A price is
--   an input from the server, like the amount of a wallet change. Everything that
--   follows from a price, the database checks.
--
-- WHAT IT NEEDS
--   The foundation migration (tables profiles, wallets, wallet_reasons,
--   wallet_transactions and the function apply_wallet_transaction) and the first
--   Exchange file (it adds the wallet reason market_fee, which is used again). A
--   Supabase project has the roles anon, authenticated and service_role already.
--
-- SAFE TO RUN TWICE
--   The guard and the drops do nothing the second time. Tables and indexes use
--   "if not exists", the new reasons use "on conflict do nothing", functions use
--   "create or replace", policies are dropped and created again, and grants and
--   comments simply repeat. A second run changes nothing.
--
-- HOW THE FILE IS ORGANISED
--   1. Stop if the first Exchange tables hold data (the guard)
--   2. Remove the first Exchange functions and tables
--   3. Wallet reasons market_stake and market_payout
--   4. Table exchange_positions
--   5. Table exchange_events
--   6. Row-level security: who may see which row
--   7. Table privileges: which roles may use which table at all
--   8. Function exchange_open_position()
--   9. Function exchange_close_position()
--  10. Function exchange_close_used_up()
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The guard: stop if the first Exchange was ever used
-- -----------------------------------------------------------------------------
-- The first Exchange (market_bases, market_positions, market_trades) was merged
-- but its file was never applied, so its tables hold no real data. This file
-- drops them. If somebody did apply it and a player traded, the history must not
-- vanish quietly: the file stops before anything changes, and a person decides.
-- The inner "if" is nested on purpose: the inner query is planned only when the
-- table exists.

do $$
begin
  if to_regclass('public.market_trades') is not null then
    if exists (select 1 from public.market_trades) then
      raise exception 'v1_market_data_present';
    end if;
  end if;
end;
$$;


-- -----------------------------------------------------------------------------
-- 2. Remove the first Exchange functions and tables
-- -----------------------------------------------------------------------------
-- The new tables have NEW names (exchange_...), so dropping an old name can never
-- touch new data, even when this file runs twice. The wallet reasons market_buy
-- and market_sell stay in wallet_reasons, unused: a reason is never removed,
-- because ledger rows point at it.

drop function if exists public.market_trade(uuid, text, text, bigint, numeric, bigint, bigint, text, integer, bigint, timestamptz, integer, bigint);
drop function if exists public.market_trade(uuid, text, text, bigint, numeric, bigint, bigint, text, integer, bigint, timestamptz);
drop function if exists public.market_set_base(text, numeric, numeric, timestamptz, text, timestamptz, numeric, integer);
drop table if exists public.market_trades;
drop table if exists public.market_positions;
drop table if exists public.market_bases;


-- -----------------------------------------------------------------------------
-- 3. Wallet reasons
-- -----------------------------------------------------------------------------
-- An opening writes two ledger rows: market_stake (the stake, coins go out) and
-- market_fee (the fee, coins go out). A closing writes market_payout (the value,
-- coins come in, only if it is above 0) and market_fee (the closing fee, coins
-- go out, only if it is above 0). All rows of one action share one ref, which
-- is allowed because the ledger accepts each player + reason + ref once.
--
-- A close at zero by the automatic close moves 0 coins, and the wallet refuses an
-- amount of 0, so it has no reason and no ledger row. It is recorded only as a
-- row of exchange_events (kind zero).
--
-- The same two pairs, in the same order, are added at the END of WALLET_REASONS
-- in backend/server/wallet.py. A test reads this INSERT. Write each description
-- without an apostrophe.

insert into public.wallet_reasons (reason, direction, description) values
  ('market_stake',  'spend', 'Coins put into an Island Exchange position (the stake).'),
  ('market_payout', 'earn',  'Coins paid out when an Island Exchange position is closed.')
on conflict (reason) do nothing;


-- -----------------------------------------------------------------------------
-- 4. Table exchange_positions: the positions of the players
-- -----------------------------------------------------------------------------
-- One row per position. A position is a stake in one company, rising or falling,
-- at 10x leverage. It stays open across days until the player closes it or a
-- price reaches its zero point.
--
-- zero_price is the price where the stake is used up: 90 % of the entry price for
-- a rising position, 110 % for a falling one. The database works it out when the
-- position opens, and a check rule keeps it exact.
--
-- price_mode says which kind of prices the position was opened on: live (the
-- real feed) or replay (the recorded demo day). A position can only be closed
-- with prices of its own kind, so mixing the two on one database can never pay
-- out at a recorded price.
--
-- The close columns are all empty while the position is open and all filled once
-- it is closed. status closed means the player closed it, zeroed means the stake
-- was used up. A zeroed position has a value and a fee of 0.
--
-- Rows are never deleted, except together with their player.

create table if not exists public.exchange_positions (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.profiles (id) on delete cascade,
  company_id  text not null,
  side        text not null,
  price_mode  text not null,
  leverage    integer not null,
  stake       bigint not null,
  entry_price numeric(28, 10) not null,
  zero_price  numeric(28, 10) not null,
  open_fee    bigint not null,
  open_ref    text not null,
  opened_at   timestamptz not null default now(),
  status      text not null default 'open',
  closed_at   timestamptz,
  close_price numeric(28, 10),
  close_value bigint,
  close_fee   bigint,
  close_ref   text,

  -- The pattern reads: from the start (^) to the end ($), 2 to 40 characters,
  -- each one of: a-z, 0-9, hyphen. The server checks the same thing.
  constraint exchange_positions_company_id_format
    check (company_id ~ '^[a-z0-9-]{2,40}$'),
  constraint exchange_positions_side_allowed
    check (side in ('rising', 'falling')),
  constraint exchange_positions_price_mode_allowed
    check (price_mode in ('live', 'replay')),
  -- LEVERAGE in backend/server/market/positions.py. A test compares the two.
  constraint exchange_positions_leverage_is_10
    check (leverage = 10),
  -- The functions check the real limits (10 to 500). This only keeps the column sane.
  constraint exchange_positions_stake_range
    check (stake between 1 and 1000000),
  -- A price has at most 8 decimals.
  constraint exchange_positions_entry_price_valid
    check (entry_price > 0 and entry_price = round(entry_price, 8)),
  -- Rising: 90 % of the entry. Falling: 110 % of the entry.
  constraint exchange_positions_zero_price_follows_entry
    check (
      (side = 'rising'  and zero_price * leverage = entry_price * (leverage - 1))
      or (side = 'falling' and zero_price * leverage = entry_price * (leverage + 1))
    ),
  constraint exchange_positions_open_fee_at_least_1
    check (open_fee >= 1),
  constraint exchange_positions_open_ref_not_blank
    check (char_length(btrim(open_ref)) > 0),
  constraint exchange_positions_open_ref_max_length
    check (char_length(open_ref) <= 120),
  constraint exchange_positions_status_allowed
    check (status in ('open', 'closed', 'zeroed')),
  -- All close columns are empty while the position is open, and all filled once it is not.
  constraint exchange_positions_close_columns_match_status
    check (
      (status = 'open'
        and closed_at is null and close_price is null and close_value is null
        and close_fee is null and close_ref is null)
      or (status in ('closed', 'zeroed')
        and closed_at is not null and close_price is not null and close_value is not null
        and close_fee is not null and close_ref is not null)
    ),
  constraint exchange_positions_close_price_valid
    check (close_price is null or (close_price > 0 and close_price = round(close_price, 8))),
  constraint exchange_positions_close_value_not_negative
    check (close_value is null or close_value >= 0),
  -- The closing fee comes out of the value and is never more than it.
  constraint exchange_positions_close_fee_within_value
    check (close_fee is null or (close_fee >= 0 and close_fee <= close_value)),
  constraint exchange_positions_zeroed_pays_nothing
    check (status <> 'zeroed' or (close_value = 0 and close_fee = 0)),
  constraint exchange_positions_close_ref_valid
    check (close_ref is null or (char_length(btrim(close_ref)) > 0 and char_length(close_ref) <= 120))
);

-- One position per player and open ref. This makes a repeated request safe.
create unique index if not exists exchange_positions_one_row_per_open_ref
  on public.exchange_positions (player_id, open_ref);

-- The automatic close looks for open positions of a company and side whose zero
-- point a price has reached.
create index if not exists exchange_positions_sweep_idx
  on public.exchange_positions (company_id, side, zero_price)
  where status = 'open';

-- The positions of a player: the portfolio, the count of open positions and the
-- stakes of the day. It also serves the cleanup when a player is deleted.
create index if not exists exchange_positions_player_idx
  on public.exchange_positions (player_id, status, opened_at desc);

comment on table public.exchange_positions is
  'One row per Island Exchange position: a stake in one company, rising or falling, at 10x. It stays open until the player closes it or a price reaches its zero point, where the stake is used up and the position closes at zero. Players can read only their own rows. Only the functions exchange_open_position(), exchange_close_position() and exchange_close_used_up() write it. Rows are never deleted, except together with their player.';
comment on column public.exchange_positions.id is
  'The position, a random id.';
comment on column public.exchange_positions.player_id is
  'The player who holds the position. Deleting the player deletes this row.';
comment on column public.exchange_positions.company_id is
  'The company, as written in backend/content/market/companies.json: lowercase letters, digits and hyphens, for example harbor-trust.';
comment on column public.exchange_positions.side is
  'rising: the player gains when the price goes up. falling: the player gains when the price goes down.';
comment on column public.exchange_positions.price_mode is
  'Which kind of prices the position was opened on: live (the real feed) or replay (the recorded demo day). The position can only be closed with prices of the same kind.';
comment on column public.exchange_positions.leverage is
  'How many times a price move counts: always 10. A move of 1 percent changes the position by 10 percent of the stake.';
comment on column public.exchange_positions.stake is
  'Whole coins the player put in. The fee comes on top and is not part of the stake.';
comment on column public.exchange_positions.entry_price is
  'The real price of the company when the position opened, with at most 8 decimals.';
comment on column public.exchange_positions.zero_price is
  'The price where the stake is used up: 90 percent of the entry price for a rising position, 110 percent for a falling one. At or beyond it the position closes at zero.';
comment on column public.exchange_positions.open_fee is
  'Whole coins of fee paid when the position opened: 2 percent of the stake, rounded up (1 percent after the Relighting). At least 1.';
comment on column public.exchange_positions.open_ref is
  'market:open: plus the actionUid the browser made for the click, at most 120 characters. For one player the same ref can be used only once, so a repeated request cannot open twice.';
comment on column public.exchange_positions.opened_at is
  'When the database transaction of the opening started. The automatic close only closes a position with a price that was quoted after this moment.';
comment on column public.exchange_positions.status is
  'open, closed (the player closed it) or zeroed (the stake was used up and the position closed at zero).';
comment on column public.exchange_positions.closed_at is
  'When the position was closed. Empty while it is open.';
comment on column public.exchange_positions.close_price is
  'The price it was closed at (for a zeroed position the price that reached the zero point). Empty while it is open.';
comment on column public.exchange_positions.close_value is
  'Whole coins the position was worth when it closed, before the closing fee. Never below 0. Always 0 for a zeroed position. Empty while it is open.';
comment on column public.exchange_positions.close_fee is
  'Whole coins of closing fee, taken from the value and never more than it. Always 0 for a zeroed position. Empty while it is open.';
comment on column public.exchange_positions.close_ref is
  'The ref of the closing: market:close: plus the actionUid for a closing by the player, market:zero: plus the position id for a close at zero. Empty while it is open.';


-- -----------------------------------------------------------------------------
-- 5. Table exchange_events: the history
-- -----------------------------------------------------------------------------
-- One row for every opening, closing and close at zero, never edited afterwards
-- (no role can update or delete a row; rows disappear only when their player is
-- deleted). The server also uses it to see whether a click has been done already.
--
-- The ref is the ref of the action. A player can use a ref only once, so a
-- repeated click can never act twice. The wallet ledger rows of the action carry
-- the same ref. A close at zero by the automatic close has no ledger row (it moves
-- no coins), only an event with the ref market:zero: plus the position id.

create table if not exists public.exchange_events (
  id           bigint generated always as identity primary key,
  player_id    uuid not null references public.profiles (id) on delete cascade,
  position_id  uuid not null references public.exchange_positions (id) on delete cascade,
  kind         text not null,
  company_id   text not null,
  side         text not null,
  price        numeric(28, 10) not null,
  stake        bigint not null,
  value        bigint not null,
  fee          bigint not null,
  coins_change bigint not null,
  ref          text not null,
  created_at   timestamptz not null default now(),

  constraint exchange_events_kind_allowed
    check (kind in ('open', 'close', 'zero')),
  constraint exchange_events_company_id_format
    check (company_id ~ '^[a-z0-9-]{2,40}$'),
  constraint exchange_events_side_allowed
    check (side in ('rising', 'falling')),
  constraint exchange_events_price_valid
    check (price > 0 and price = round(price, 8)),
  constraint exchange_events_amounts_not_negative
    check (stake >= 1 and value >= 0 and fee >= 0),
  -- open: the stake and the fee left the wallet. close: the value came in, the fee went
  -- out, and the fee is never more than the value. zero: nothing moved.
  constraint exchange_events_amounts_follow_kind
    check (
      (kind = 'open' and value = 0 and coins_change = -(stake + fee))
      or (kind = 'close' and fee <= value and coins_change = value - fee)
      or (kind = 'zero' and value = 0 and fee = 0 and coins_change = 0)
    ),
  constraint exchange_events_ref_not_blank
    check (char_length(btrim(ref)) > 0),
  constraint exchange_events_ref_max_length
    check (char_length(ref) <= 120)
);

-- One event per player and ref. This makes a repeated request safe.
create unique index if not exists exchange_events_one_row_per_ref
  on public.exchange_events (player_id, ref);

-- The newest events of a player first. It also serves the cleanup when a player
-- is deleted.
create index if not exists exchange_events_player_id_idx
  on public.exchange_events (player_id, id desc);

comment on table public.exchange_events is
  'The history of the Island Exchange: one row for every opening, closing and close at zero, never edited afterwards. Players can read only their own rows. Rows are added only by exchange_open_position(), exchange_close_position() and exchange_close_used_up(). The same player and ref can appear only once.';
comment on column public.exchange_events.id is
  'Running number in the order the events happened. Order the rows of a player by id.';
comment on column public.exchange_events.player_id is
  'The player whose position changed. Deleting the player deletes this row.';
comment on column public.exchange_events.position_id is
  'The position. Deleting the position deletes this row.';
comment on column public.exchange_events.kind is
  'open (a position was opened), close (the player closed it) or zero (a price reached its zero point and it closed at zero).';
comment on column public.exchange_events.company_id is
  'The company, as written in backend/content/market/companies.json.';
comment on column public.exchange_events.side is
  'rising or falling, as in the position.';
comment on column public.exchange_events.price is
  'The price of the event: the entry price for open, the closing price for close and zero.';
comment on column public.exchange_events.stake is
  'The stake of the position, in whole coins.';
comment on column public.exchange_events.value is
  'Whole coins the position was worth. 0 for open and zero.';
comment on column public.exchange_events.fee is
  'Whole coins of fee of this event: the opening fee for open, the closing fee for close, 0 for zero.';
comment on column public.exchange_events.coins_change is
  'What reached the wallet: minus (stake + fee) for open, value minus fee for close, 0 for zero.';
comment on column public.exchange_events.ref is
  'The ref of the action, at most 120 characters. For one player the same ref can be used only once, so a repeated request cannot act twice. The wallet ledger rows of the action use the same ref.';
comment on column public.exchange_events.created_at is
  'When the database transaction of the event started.';


-- -----------------------------------------------------------------------------
-- 6. Row-level security (RLS): who may see which row
-- -----------------------------------------------------------------------------
-- Same plan as the foundation file: all policies are for "authenticated" and
-- are read policies. There is no policy for insert, update or delete, so no
-- player can write. "anon" has no policy, so it gets nothing.

alter table public.exchange_positions enable row level security;
alter table public.exchange_events    enable row level security;

-- exchange_positions: a player may read only their own positions.
drop policy if exists "Players can read their own exchange positions" on public.exchange_positions;
create policy "Players can read their own exchange positions"
  on public.exchange_positions for select to authenticated
  using (player_id = (select auth.uid()));
comment on policy "Players can read their own exchange positions" on public.exchange_positions is
  'A signed-in player may read only their own positions. Nobody except the server can write them.';

-- exchange_events: a player may read only their own events.
drop policy if exists "Players can read their own exchange events" on public.exchange_events;
create policy "Players can read their own exchange events"
  on public.exchange_events for select to authenticated
  using (player_id = (select auth.uid()));
comment on policy "Players can read their own exchange events" on public.exchange_events is
  'A signed-in player may read only their own events. Nobody except the server can add rows.';

-- No insert, update or delete policy on either table: the browser never writes
-- game data.


-- -----------------------------------------------------------------------------
-- 7. Table privileges: which roles may use which table at all
-- -----------------------------------------------------------------------------
-- The second lock, as in the foundation file. First take everything away from
-- every role (this also makes the file behave the same on a project that hands
-- out rights to new tables by itself), then give back only what is needed.
--
--   anon           nothing
--   authenticated  read only (RLS then limits the rows)
--   service_role   the server:
--                    exchange_positions  read, insert, update  (never deleted)
--                    exchange_events     read, insert          (the history is append-only)
--
-- The three functions below are not SECURITY DEFINER: they run with these rights.
-- The server needs the update right on the positions for the automatic close and
-- for the row locks (select ... for update).

revoke all on table
  public.exchange_positions,
  public.exchange_events
from public, anon, authenticated, service_role;

-- The event counter (the sequence behind the identity column "id"). An identity
-- column needs no rights on its counter, but a project that exposes new objects
-- hands out rights on new sequences. Anyone who could move the counter could
-- break every later event.
revoke all on sequence public.exchange_events_id_seq
from public, anon, authenticated, service_role;

grant select on table
  public.exchange_positions,
  public.exchange_events
to authenticated;

grant select, insert, update on table public.exchange_positions to service_role;
grant select, insert on table public.exchange_events to service_role;


-- -----------------------------------------------------------------------------
-- 8. Function exchange_open_position(): opens a position
-- -----------------------------------------------------------------------------
-- The server works out the numbers (the price, the fee: see
-- backend/server/market/positions.py) and calls this. In ONE transaction it:
--
--   1. checks the arguments it is given: none missing, a known side and price
--      mode, a price above 0 with at most 8 decimals, a stake inside the limits,
--      a fee that follows from the stake and the fee rate,
--   2. locks the player's wallet row, so a player's actions happen one at a time,
--   3. refuses a repeated ref,
--   4. refuses the opening if the player already has the most open positions,
--   5. refuses it if the stakes of the game day would pass the daily cap,
--   6. moves the coins with apply_wallet_transaction() (the stake with the reason
--      market_stake and the fee with market_fee, both spend),
--   7. writes the position (the zero point is worked out here, from the entry
--      price, the side and the leverage), and
--   8. writes the history row.
--
--   p_player_id           whose wallet and position change
--   p_company_id          the company
--   p_side                'rising' or 'falling'
--   p_price_mode          'live' or 'replay': the kind of prices of p_entry_price
--   p_entry_price         the price of the company now, above 0, at most 8 decimals
--   p_leverage            always 10
--   p_stake               whole coins, from p_min_stake to p_max_stake
--   p_fee                 whole coins of fee: the fee rate of the stake, rounded UP
--   p_fee_basis_points    the fee rate in basis points (200 = 2 %, 100 = 1 %)
--   p_ref                 'market:open:' plus the id the browser made for the click
--   p_min_stake           the least a position may have (10)
--   p_max_stake           the most a position may have (500)
--   p_daily_stake_cap     the most coins of new stakes per player per game day (2000)
--   p_day_start           when the game day began (08:00 Lisbon time), for the cap. It
--                         cannot be in the future (a minute of clock difference is
--                         allowed), or the cap would count no stakes at all
--   p_max_open_positions  the most open positions a player may have (20)
--
-- It returns a JSON object:
--   {"status": "done", "positionId": ..., "zeroPrice": ..., "balance": ..., "openedAt": ...}
--   {"status": "refused", "reason": ...} when a rule says no. Nothing was changed.
--       reason "too_many_positions"  also "openCount"
--       reason "daily_cap"           also "coinsLeft", what the player may still stake today
--
-- Real failures raise an error and change nothing:
--   * insufficient_funds, unknown_reason, wrong_direction: from the wallet function.
--   * A repeated ref: error code 23505 (unique violation), message already_applied.
--   * wallet_not_found, bad_trade: a missing wallet, or arguments that make no
--     sense or do not add up. These mean the server and the database disagree:
--     they are bugs, not refusals.
--
-- Why a refusal is returned and not raised: a raised error cannot carry the
-- reason through the server's database client, and nothing was written yet, so
-- there is nothing to undo.
--
-- It is not SECURITY DEFINER on purpose. It runs with the rights of its caller,
-- so a player (who has no rights on these tables and no right to run it) is
-- stopped even if it were granted by mistake.

create or replace function public.exchange_open_position(
  p_player_id          uuid,
  p_company_id         text,
  p_side               text,
  p_price_mode         text,
  p_entry_price        numeric,
  p_leverage           integer,
  p_stake              bigint,
  p_fee                bigint,
  p_fee_basis_points   integer,
  p_ref                text,
  p_min_stake          bigint,
  p_max_stake          bigint,
  p_daily_stake_cap    bigint,
  p_day_start          timestamptz,
  p_max_open_positions integer
)
returns jsonb
language plpgsql
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_open_count   bigint;
  v_staked_today bigint;
  v_balance      bigint;
  v_zero_price   numeric;
  v_position_id  uuid;
  v_opened_at    timestamptz;
begin
  -- Step 1: the arguments must make sense, and they must add up. A missing value
  -- would make a later comparison quietly "not true", so each test starts with
  -- "is null": then the whole condition is true, whatever the other parts say.
  if p_player_id is null
     or p_company_id is null or p_company_id !~ '^[a-z0-9-]{2,40}$'
     or p_side is null or p_side not in ('rising', 'falling')
     or p_price_mode is null or p_price_mode not in ('live', 'replay')
     or p_entry_price is null or p_entry_price <= 0 or p_entry_price <> round(p_entry_price, 8)
     or p_leverage is null or p_leverage <> 10
     or p_min_stake is null or p_min_stake < 1
     or p_max_stake is null or p_max_stake < p_min_stake
     or p_stake is null or p_stake < p_min_stake or p_stake > p_max_stake
     or p_fee_basis_points is null or p_fee_basis_points not in (100, 200)
     or p_fee is null or p_fee <> ceil(p_stake::numeric * p_fee_basis_points / 10000)
     or p_ref is null or char_length(btrim(p_ref)) = 0 or char_length(p_ref) > 120
     or p_daily_stake_cap is null or p_daily_stake_cap < 1
     or p_day_start is null or p_day_start > now() + interval '1 minute'
     or p_max_open_positions is null or p_max_open_positions < 1 then
    raise exception 'bad_trade';
  end if;

  -- Step 2: lock the player's wallet row until the end of this transaction. A
  -- second action by the same player waits here, so the checks below always see
  -- the first one. (A SELECT ... FOR UPDATE needs the right to update wallets.)
  perform 1 from public.wallets where player_id = p_player_id for update;
  if not found then
    raise exception 'wallet_not_found';
  end if;

  -- Step 3: a repeated ref. Say "already applied" with the unique-violation code
  -- (23505), the same answer the wallet gives, before any other rule can answer.
  if exists (
    select 1 from public.exchange_events where player_id = p_player_id and ref = p_ref
  ) then
    raise exception 'already_applied' using errcode = '23505';
  end if;

  -- Step 4: the most open positions.
  select count(*)
    into v_open_count
    from public.exchange_positions
   where player_id = p_player_id and status = 'open';

  if v_open_count >= p_max_open_positions then
    return jsonb_build_object(
      'status', 'refused', 'reason', 'too_many_positions', 'openCount', v_open_count
    );
  end if;

  -- Step 5: the daily cap on new stakes.
  select coalesce(sum(stake), 0)
    into v_staked_today
    from public.exchange_positions
   where player_id = p_player_id and opened_at >= p_day_start;

  if v_staked_today + p_stake > p_daily_stake_cap then
    return jsonb_build_object(
      'status', 'refused', 'reason', 'daily_cap',
      'coinsLeft', greatest(p_daily_stake_cap - v_staked_today, 0)
    );
  end if;

  -- Step 6: move the coins. Each call is checked by the wallet function, and an
  -- error (not enough coins, a repeated ref) cancels the whole action.
  v_balance := public.apply_wallet_transaction(p_player_id, -p_stake, 'market_stake', p_ref);
  v_balance := public.apply_wallet_transaction(p_player_id, -p_fee, 'market_fee', p_ref);

  -- Step 7: write the position. The zero point is 90 % of the entry price for a
  -- rising position and 110 % for a falling one: entry x (leverage -/+ 1) / leverage.
  -- The entry is rounded to 10 decimals first. It has at most 8 already, so nothing
  -- changes, but a division keeps at least as many decimals as its top part has. Without
  -- this, Postgres cuts the answer for a very large price (above about 100 million) to
  -- 8 decimals, while the exact zero point needs 9, and the check rule
  -- exchange_positions_zero_price_follows_entry would refuse the row.
  if p_side = 'rising' then
    v_zero_price := round(p_entry_price, 10) * (p_leverage - 1) / p_leverage;
  else
    v_zero_price := round(p_entry_price, 10) * (p_leverage + 1) / p_leverage;
  end if;

  insert into public.exchange_positions
    (player_id, company_id, side, price_mode, leverage, stake, entry_price, zero_price,
     open_fee, open_ref)
  values
    (p_player_id, p_company_id, p_side, p_price_mode, p_leverage, p_stake, p_entry_price,
     v_zero_price, p_fee, p_ref)
  returning id, opened_at into v_position_id, v_opened_at;

  -- Step 8: write the history row.
  insert into public.exchange_events
    (player_id, position_id, kind, company_id, side, price, stake, value, fee, coins_change, ref)
  values
    (p_player_id, v_position_id, 'open', p_company_id, p_side, p_entry_price, p_stake, 0,
     p_fee, -(p_stake + p_fee), p_ref);

  return jsonb_build_object(
    'status', 'done',
    'positionId', v_position_id,
    'zeroPrice', v_zero_price,
    'balance', v_balance,
    'openedAt', v_opened_at
  );
end;
$$;

revoke all on function public.exchange_open_position(uuid, text, text, text, numeric, integer, bigint, bigint, integer, text, bigint, bigint, bigint, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.exchange_open_position(uuid, text, text, text, numeric, integer, bigint, bigint, integer, text, bigint, bigint, bigint, timestamptz, integer)
  to service_role;

comment on function public.exchange_open_position(uuid, text, text, text, numeric, integer, bigint, bigint, integer, text, bigint, bigint, bigint, timestamptz, integer) is
  'Opens an Island Exchange position. In one step: checks that the arguments add up (a known side and price mode, a price above 0 with at most 8 decimals, a stake inside the limits, a fee that follows from the stake and the fee rate, a game day that does not start in the future), locks the wallet, refuses a repeated ref (error 23505 already_applied), refuses more than p_max_open_positions open positions or more than p_daily_stake_cap of new stakes per game day, moves the coins with apply_wallet_transaction() (market_stake and market_fee), writes the position with its zero point and writes the history row. Returns {status: done, positionId, zeroPrice, balance, openedAt}, or {status: refused, reason: too_many_positions or daily_cap} with nothing changed. Raises insufficient_funds (from the wallet), wallet_not_found or bad_trade. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 9. Function exchange_close_position(): closes one position of a player
-- -----------------------------------------------------------------------------
-- The server reads the position, works out the value and the closing fee with
-- the price of now (backend/server/market/positions.py) and calls this. In ONE
-- transaction it:
--
--   1. checks the arguments: a price above 0 with at most 8 decimals, a known price
--      mode and fee rate, a value and a fee that are not negative,
--   2. locks the player's wallet row,
--   3. refuses a repeated ref,
--   4. locks the position (by its id AND its player),
--   5. refuses if the position is not open any more,
--   6. refuses if it was opened on another kind of prices,
--   7. works out the value and the closing fee itself and compares them with the
--      ones it was given. The value is stake x (entry + 10 x move) / entry for a
--      rising position and stake x (entry - 10 x move) / entry for a falling one,
--      with move = price - entry. The whole-number part is taken once, at the very
--      end, and a value never passes 1,000,000. If the top part is 0 or less, the
--      stake is used up: the value is 0. The closing fee is the fee of the stake,
--      rounded up, but never more than the value,
--   8. moves the coins: the value comes in first (market_payout, only if above 0),
--      then the fee goes out (market_fee, only if above 0). So the balance never
--      dips, and a close at zero moves nothing,
--   9. marks the position closed (or zeroed, when the stake was used up) and
--      writes the history row.
--
--   p_player_id         whose position it is
--   p_position_id       the position
--   p_price_mode        'live' or 'replay': the kind of prices of p_close_price
--   p_close_price       the price of the company now, above 0, at most 8 decimals
--   p_value             what the server says the position is worth (checked here)
--   p_fee               what the server says the closing fee is (checked here)
--   p_fee_basis_points  the fee rate in basis points (200 = 2 %, 100 = 1 %)
--   p_ref               'market:close:' plus the id the browser made for the click
--
-- It returns a JSON object:
--   {"status": "done", "closedAs": "closed" or "zeroed", "value": ..., "fee": ...,
--    "coinsChange": ..., "balance": ..., "closedAt": ...}
--   {"status": "refused", "reason": ...} when a rule says no. Nothing was changed.
--       reason "no_such_position"   no such position for this player
--       reason "position_closed"    also "closedAs" and "closedAt"
--       reason "wrong_price_mode"   opened on another kind of prices
--
-- Real failures raise an error and change nothing: insufficient_funds is not
-- possible here (a closing only pays coins in, and the fee is paid out of them,
-- after the payout), already_applied (23505), wallet_not_found and bad_trade.

create or replace function public.exchange_close_position(
  p_player_id        uuid,
  p_position_id      uuid,
  p_price_mode       text,
  p_close_price      numeric,
  p_value            bigint,
  p_fee              bigint,
  p_fee_basis_points integer,
  p_ref              text
)
returns jsonb
language plpgsql
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_position  public.exchange_positions%rowtype;
  v_top_part  numeric;
  v_value     bigint;
  v_fee       bigint;
  v_used_up   boolean;
  v_balance   bigint;
  v_closed_at timestamptz;
begin
  -- Step 1: the arguments must make sense (a missing value never passes, see above).
  if p_player_id is null
     or p_position_id is null
     or p_price_mode is null or p_price_mode not in ('live', 'replay')
     or p_close_price is null or p_close_price <= 0 or p_close_price <> round(p_close_price, 8)
     or p_value is null or p_value < 0
     or p_fee is null or p_fee < 0
     or p_fee_basis_points is null or p_fee_basis_points not in (100, 200)
     or p_ref is null or char_length(btrim(p_ref)) = 0 or char_length(p_ref) > 120 then
    raise exception 'bad_trade';
  end if;

  -- Step 2: lock the player's wallet row.
  perform 1 from public.wallets where player_id = p_player_id for update;
  if not found then
    raise exception 'wallet_not_found';
  end if;

  -- Step 3: a repeated ref.
  if exists (
    select 1 from public.exchange_events where player_id = p_player_id and ref = p_ref
  ) then
    raise exception 'already_applied' using errcode = '23505';
  end if;

  -- Step 4: lock the position. If the automatic close holds it right now, this waits
  -- for it, and then finds the position closed (step 5).
  select *
    into v_position
    from public.exchange_positions
   where id = p_position_id and player_id = p_player_id
     for update;

  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_position');
  end if;

  -- Step 5: not open any more.
  if v_position.status <> 'open' then
    return jsonb_build_object(
      'status', 'refused', 'reason', 'position_closed',
      'closedAs', v_position.status, 'closedAt', v_position.closed_at
    );
  end if;

  -- Step 6: another kind of prices.
  if v_position.price_mode <> p_price_mode then
    return jsonb_build_object('status', 'refused', 'reason', 'wrong_price_mode');
  end if;

  -- Step 7: the value and the closing fee. Multiply first, divide once at the end:
  -- div() gives the exact whole-number part, the same as Python's Decimal //.
  if v_position.side = 'rising' then
    v_top_part := v_position.stake
      * (v_position.entry_price + v_position.leverage * (p_close_price - v_position.entry_price));
  else
    v_top_part := v_position.stake
      * (v_position.entry_price - v_position.leverage * (p_close_price - v_position.entry_price));
  end if;

  if v_top_part <= 0 then
    v_used_up := true;
    v_value := 0;
  else
    v_used_up := false;
    v_value := least(div(v_top_part, v_position.entry_price), 1000000);
  end if;
  v_fee := least(ceil(v_position.stake::numeric * p_fee_basis_points / 10000), v_value);

  if p_value <> v_value or p_fee <> v_fee then
    raise exception 'bad_trade';
  end if;

  -- Step 8: move the coins. The payout comes first, so the balance never dips.
  if v_value > 0 then
    v_balance := public.apply_wallet_transaction(p_player_id, v_value, 'market_payout', p_ref);
  end if;
  if v_fee > 0 then
    v_balance := public.apply_wallet_transaction(p_player_id, -v_fee, 'market_fee', p_ref);
  end if;
  if v_balance is null then
    select balance into v_balance from public.wallets where player_id = p_player_id;
  end if;

  -- Step 9: mark the position closed and write the history row.
  update public.exchange_positions
     set status      = case when v_used_up then 'zeroed' else 'closed' end,
         closed_at   = now(),
         close_price = p_close_price,
         close_value = v_value,
         close_fee   = v_fee,
         close_ref   = p_ref
   where id = v_position.id
  returning closed_at into v_closed_at;

  insert into public.exchange_events
    (player_id, position_id, kind, company_id, side, price, stake, value, fee, coins_change, ref)
  values
    (p_player_id, v_position.id, case when v_used_up then 'zero' else 'close' end,
     v_position.company_id, v_position.side, p_close_price, v_position.stake, v_value, v_fee,
     v_value - v_fee, p_ref);

  return jsonb_build_object(
    'status', 'done',
    'closedAs', case when v_used_up then 'zeroed' else 'closed' end,
    'value', v_value,
    'fee', v_fee,
    'coinsChange', v_value - v_fee,
    'balance', v_balance,
    'closedAt', v_closed_at
  );
end;
$$;

revoke all on function public.exchange_close_position(uuid, uuid, text, numeric, bigint, bigint, integer, text)
  from public, anon, authenticated;
grant execute on function public.exchange_close_position(uuid, uuid, text, numeric, bigint, bigint, integer, text)
  to service_role;

comment on function public.exchange_close_position(uuid, uuid, text, numeric, bigint, bigint, integer, text) is
  'Closes one Island Exchange position of a player. In one step: checks the arguments, locks the wallet, refuses a repeated ref (error 23505 already_applied), locks the position by its id and player, refuses a position that is not open or was opened on another kind of prices, works out the value (stake x (entry plus or minus 10 x move) / entry, whole coins, rounded down, 0 if the stake is used up, at most 1,000,000) and the closing fee (the fee of the stake, rounded up, never more than the value), raises bad_trade if the server was given other numbers, pays the value (market_payout) and then takes the fee (market_fee), marks the position closed or zeroed and writes the history row. Returns {status: done, closedAs, value, fee, coinsChange, balance, closedAt}, or {status: refused, reason: no_such_position, position_closed or wrong_price_mode} with nothing changed. Raises wallet_not_found or bad_trade. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 10. Function exchange_close_used_up(): the automatic close at zero
-- -----------------------------------------------------------------------------
-- There is no timer on our hosting, so the server calls this whenever it has
-- prices in hand: every look at the price board, every opening and closing and
-- every look at a portfolio. It closes, in ONE statement, every open position
-- whose zero point a price has reached, at zero. Nobody can lose more than the
-- stake and the opening fee, and no coins move, so it needs no wallet.
--
--   p_prices     a JSON array of prices, for example
--                [{"company_id": "harbor-trust", "price": "76159.21",
--                  "quoted_at": "2026-11-06T12:05:00Z", "mode": "live"}]
--                The keys are snake_case because this is a contract of the database.
--                The price is text, so it stays exact. Each company and mode appears
--                at most once.
--   p_player_id  only this player's positions, or null for all players
--
-- A price closes a position only if:
--   * the position is open, of the same company and the same price mode,
--   * it was opened BEFORE the price was quoted (a price never closes a position that
--     was opened after it was quoted), and
--   * the price is at or beyond the zero point (at or below it for a rising position, at
--     or above it for a falling one).
--
-- "skip locked" leaves a position that another call is closing right now to that
-- call. So two sweeps never wait for each other, never deadlock and never close one
-- position twice, and a player closing their own position is never held up.
--
-- It returns {"closed": n, "positionIds": [...]}. A badly formed list raises bad_sweep:
-- the server and the database disagree, which is a bug and not something a player can
-- cause.

create or replace function public.exchange_close_used_up(
  p_prices    jsonb,
  p_player_id uuid
)
returns jsonb
language plpgsql
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_item       jsonb;
  v_company_id text;
  v_price      numeric;
  v_quoted_at  timestamptz;
  v_mode       text;
  v_ids        uuid[];
begin
  -- Step 1: every element of the list must be well formed.
  if p_prices is null or jsonb_typeof(p_prices) <> 'array' or jsonb_array_length(p_prices) > 100 then
    raise exception 'bad_sweep';
  end if;

  for v_item in select value from jsonb_array_elements(p_prices) loop
    begin
      -- Exactly the four known keys. Anything else (or a value of the wrong kind) lands
      -- in the handler below.
      if jsonb_typeof(v_item) <> 'object'
         or (select count(*) from jsonb_object_keys(v_item)) <> 4
         or not (v_item ?& array['company_id', 'price', 'quoted_at', 'mode']) then
        raise exception 'bad_sweep';
      end if;
      v_company_id := v_item ->> 'company_id';
      v_price := (v_item ->> 'price')::numeric;
      v_quoted_at := (v_item ->> 'quoted_at')::timestamptz;
      v_mode := v_item ->> 'mode';
    exception when others then
      raise exception 'bad_sweep';
    end;

    -- A quote time must be a real moment (not "infinity", which would be after every position).
    if v_company_id is null or v_company_id !~ '^[a-z0-9-]{2,40}$'
       or v_price is null or v_price <= 0 or v_price <> round(v_price, 8)
       or v_quoted_at is null or not isfinite(v_quoted_at)
       or v_mode is null or v_mode not in ('live', 'replay') then
      raise exception 'bad_sweep';
    end if;
  end loop;

  -- Each company and mode at most once.
  if (select count(*) from jsonb_array_elements(p_prices))
     <> (select count(*) from (
           select distinct e ->> 'company_id', e ->> 'mode' from jsonb_array_elements(p_prices) e
         ) as pairs) then
    raise exception 'bad_sweep';
  end if;

  -- Step 2: close the positions in one statement.
  with prices as (
    select *
      from jsonb_to_recordset(p_prices)
        as q(company_id text, price numeric, quoted_at timestamptz, mode text)
  ), due as (
    select p.id, q.price
      from public.exchange_positions p
      join prices q on q.company_id = p.company_id and q.mode = p.price_mode
     where p.status = 'open'
       and p.opened_at < q.quoted_at
       and (p_player_id is null or p.player_id = p_player_id)
       and ((p.side = 'rising'  and q.price <= p.zero_price)
         or (p.side = 'falling' and q.price >= p.zero_price))
     order by p.id
       for update of p skip locked
  ), closed as (
    update public.exchange_positions p
       set status = 'zeroed', closed_at = now(), close_price = due.price,
           close_value = 0, close_fee = 0, close_ref = 'market:zero:' || p.id::text
      from due
     where p.id = due.id
       and p.status = 'open'  -- a second guard, cheap
    returning p.*
  ), logged as (
    insert into public.exchange_events
      (player_id, position_id, kind, company_id, side, price, stake, value, fee, coins_change, ref)
    select player_id, id, 'zero', company_id, side, close_price, stake, 0, 0, 0, close_ref
      from closed
    returning position_id
  )
  select coalesce(array_agg(position_id), '{}'::uuid[])
    into v_ids
    from logged;

  return jsonb_build_object(
    'closed', coalesce(array_length(v_ids, 1), 0),
    'positionIds', to_jsonb(v_ids)
  );
end;
$$;

revoke all on function public.exchange_close_used_up(jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.exchange_close_used_up(jsonb, uuid)
  to service_role;

comment on function public.exchange_close_used_up(jsonb, uuid) is
  'The automatic close of the Island Exchange. Takes a JSON array of prices (company_id, price as text, quoted_at, mode live or replay; each company and mode at most once) and closes, in one statement and at zero, every open position of that company and price mode whose zero point the price has reached, if the position was opened before the price was quoted. p_player_id limits it to one player, null means all players. No coins move, so it uses no wallet; it writes one history row of kind zero for each position. Positions that another call is closing right now are skipped, so two calls never wait for each other. Returns {closed, positionIds}. Raises bad_sweep for a badly formed list. Only service_role may run it.';
