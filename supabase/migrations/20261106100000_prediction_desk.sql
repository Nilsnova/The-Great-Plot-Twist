-- =============================================================================
-- 20261106100000_prediction_desk.sql
--
-- WHAT IT DOES
--   The database part of the prediction desk (package L5): hand-picked real
--   questions, and play-coin pools that the winners share. It adds two wallet
--   reasons, two tables, one view, one trigger and two functions.
--
--     prediction_pools        one row per question: when staking closes, and how
--                             the pool ended once it was settled
--     prediction_stakes       one row per stake: who staked how many coins on
--                             which side of which question, and what came back
--     prediction_pool_sides   the coins and the players on each side of each
--                             pool, added up from the stakes (for the server)
--
--     prediction_pools_keep_settled()  a trigger on prediction_pools: once a
--                               pool is settled, the table accepts no change to
--                               its row any more (a settled pool is final)
--
--     prediction_place_stake()  the only way a stake happens: it checks the
--                               limits, takes the coins and writes the stake
--                               in ONE step
--     prediction_settle_pool()  the only way a pool is settled: it checks the
--                               payouts, pays everybody and closes the pool in
--                               ONE step
--
-- WHO USES IT
--   You run it once on the Supabase project, AFTER the foundation migration
--   (20261106000000_foundation.sql), because it uses the wallet and the profiles
--   table from there. The Island Exchange migration is not needed, but it sorts
--   before this file, so the usual order (oldest first) is right. The steps are
--   in supabase/README.md. After that the Python server
--   (backend/server/predictions/) does all the writing, with the secret key.
--   The browser may only read the pools, and its own stakes.
--
-- THE RULES THAT THE DATABASE KEEPS
--   1. Play money only. Coins cannot be bought, cashed out or exchanged for real
--      prizes. The screen says so.
--   2. The browser never writes. Players can read; every write goes through the
--      server (rule D003, docs/DECISIONS.md).
--   3. Coins move only through apply_wallet_transaction() (the foundation file).
--      Both functions call it, so a stake and a payout follow the same rules as
--      every other coin change: a known reason, the right direction, never below
--      0 coins, and every change has a ref that can be used only once.
--   4. A stake is all or nothing, and so is a settlement. Either the coins and
--      the rows change together, or nothing changes.
--   5. Someone who is not signed in (role "anon") gets nothing at all.
--   6. A captain stakes once per question, 1 to p_max_stake coins, and at most
--      p_daily_cap coins per day. The numbers are passed in by the server
--      (backend/server/predictions/stake_rules.py), so they live in one place.
--   7. A pool settles ONCE. The pool row is locked first, and a second settlement
--      is refused. A trigger makes a settled pool final: the table accepts no
--      change to its row any more, not even from the server, so nobody can reopen
--      a settled pool and pay it out again. The ref pool:<questionId> of the
--      payout rows stops a second payout to the same player.
--   8. The arithmetic of a settlement is checked again. The server works out the
--      payouts (backend/server/predictions/pools.py), and
--      prediction_settle_pool() recomputes what they must be. If the server ever
--      had a bug, the database refuses the settlement instead of paying wrong
--      coins. The payouts plus the cut always add up to the coins staked, so no
--      coin is ever created or lost.
--
--   Lock order, everywhere: the pool row first, then wallets in player-id order.
--   Two settlements, or a settlement and a stake, can therefore never wait for
--   each other in a circle.
--
-- WHAT IT NEEDS
--   The foundation migration (tables profiles, wallets, wallet_reasons,
--   wallet_transactions and the function apply_wallet_transaction). A Supabase
--   project has the roles anon, authenticated and service_role already.
--
-- SAFE TO RUN TWICE
--   Tables and indexes use "if not exists", the new reasons use "on conflict do
--   nothing", the view and the functions use "create or replace", policies are
--   dropped and created again, and grants and comments simply repeat. A second
--   run changes nothing.
--
-- HOW THE FILE IS ORGANISED
--   1. Wallet reasons prediction_stake and prediction_payout
--   2. Table prediction_pools
--   3. Table prediction_stakes
--   4. View prediction_pool_sides
--   5. Row-level security: who may see which row
--   6. Table privileges: which roles may use which table at all
--   7. Trigger prediction_pools_keep_settled(): a settled pool is final
--   8. Function prediction_place_stake()
--   9. Function prediction_settle_pool()
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Wallet reasons
-- -----------------------------------------------------------------------------
-- A stake writes one ledger row, prediction_stake (the coins go out, ref
-- stake:<stakeId>). A settlement writes one ledger row per paid stake,
-- prediction_payout (the coins come in, ref pool:<questionId>), for a win and for
-- a refund alike. A player has only one stake per question, so the ledger's rule
-- "one row per player, reason and ref" never gets in the way.
--
-- The same two pairs, in the same order, are added at the END of WALLET_REASONS
-- in backend/server/wallet.py. A test reads this INSERT. Write each description
-- without an apostrophe.

insert into public.wallet_reasons (reason, direction, description) values
  ('prediction_stake',  'spend', 'Coins staked on a question at the prediction desk.'),
  ('prediction_payout', 'earn',  'Coins paid back from a prediction desk pool, for a win or a refund.')
on conflict (reason) do nothing;


-- -----------------------------------------------------------------------------
-- 2. Table prediction_pools: one row per question
-- -----------------------------------------------------------------------------
-- A pool row is created by the first stake on a question, or by its settlement,
-- and it is never deleted. The pool holds no running totals: the totals come from
-- the stakes (the view below), so they cannot drift.
--
-- closes_at is the closing time the server knew at the first stake, and nothing
-- ever changes it. Every later call passes the closing time the server knows at
-- that moment, and the function uses the EARLIER of the two. So the stored closing
-- time never moves later. (A call that passes an earlier time is refused, but that
-- time is not stored: the next call is judged against the stored time and the time
-- that call knows. Two server instances with different readings of Manifold can
-- therefore disagree for a short while.)
--
-- A pool is "open" until it is settled. Then it is "settled", and the outcome,
-- the way it ended and the coins are filled in. A void outcome always means a
-- full refund. A settled pool is final (section 7).

create table if not exists public.prediction_pools (
  question_id text primary key,
  closes_at   timestamptz not null,
  status      text not null default 'open',
  outcome     text,
  settlement  text,
  settled_by  text,
  settled_at  timestamptz,
  cut_coins   bigint,
  paid_coins  bigint,
  created_at  timestamptz not null default now(),

  -- The pattern reads: from the start (^) to the end ($), 2 to 40 characters,
  -- each one of: a-z, 0-9, hyphen. The server checks the same thing.
  constraint prediction_pools_question_id_format
    check (question_id ~ '^[a-z0-9-]{2,40}$'),
  constraint prediction_pools_status_allowed
    check (status in ('open', 'settled')),
  constraint prediction_pools_outcome_allowed
    check (outcome is null or outcome in ('yes', 'no', 'void')),
  constraint prediction_pools_settlement_allowed
    check (settlement is null or settlement in
      ('winners', 'refund_void', 'refund_no_winners', 'refund_one_sided')),
  constraint prediction_pools_settled_by_allowed
    check (settled_by is null or settled_by in ('host', 'auto')),
  -- A void question is always refunded.
  constraint prediction_pools_void_is_refunded
    check (outcome is distinct from 'void' or settlement = 'refund_void'),
  -- An open pool has nothing filled in. A settled pool has everything filled in.
  constraint prediction_pools_state_is_complete
    check (
      (status = 'open' and outcome is null and settlement is null and settled_by is null
         and settled_at is null and cut_coins is null and paid_coins is null)
      or
      (status = 'settled' and outcome is not null and settlement is not null
         and settled_by is not null and settled_at is not null
         and cut_coins >= 0 and paid_coins >= 0)
    )
);

comment on table public.prediction_pools is
  'One row per prediction desk question: when staking closes, and how the pool ended once it was settled. Created by the first stake or by the settlement, never deleted. Signed-in players may read it. Only the server writes it, through prediction_place_stake() and prediction_settle_pool(). A settled pool is final: a trigger refuses every change to its row.';
comment on column public.prediction_pools.question_id is
  'The question, as written in backend/content/predictions/questions.json: lowercase letters, digits and hyphens, for example groundhog-2027. Never rename a question while its pool is unsettled.';
comment on column public.prediction_pools.closes_at is
  'When staking closes: the closing time the server knew at the first stake. Nothing ever changes it. At every later stake the earlier of this time and the closing time the server knows at that moment counts, so the stored closing time never moves later.';
comment on column public.prediction_pools.status is
  'open until the pool is settled, then settled. A pool settles once, and a settled pool is final: a trigger refuses every change to its row.';
comment on column public.prediction_pools.outcome is
  'How the question was decided: yes, no, or void (cancelled or unclear). Empty while the pool is open.';
comment on column public.prediction_pools.settlement is
  'How the pool ended: winners (the winning side shared the pool), refund_void (the question is void), refund_no_winners (nobody picked the winning side) or refund_one_sided (everybody picked the same side). Empty while the pool is open.';
comment on column public.prediction_pools.settled_by is
  'Who settled the pool: host (a presenter pressed the button) or auto (the server, after Manifold decided and a grace period). Empty while the pool is open.';
comment on column public.prediction_pools.settled_at is
  'When the pool was settled. Empty while the pool is open.';
comment on column public.prediction_pools.cut_coins is
  'Coins that left the game: 5 percent of the coins on the losing side, rounded down. 0 for a refund. Empty while the pool is open.';
comment on column public.prediction_pools.paid_coins is
  'Coins paid out to the players. The paid coins plus the cut are exactly the coins staked. Empty while the pool is open.';
comment on column public.prediction_pools.created_at is
  'When the pool row was created, by the first stake or by the settlement.';


-- -----------------------------------------------------------------------------
-- 3. Table prediction_stakes: one row per stake
-- -----------------------------------------------------------------------------
-- A stake is never edited, except that the server writes its payout when the pool
-- is settled (the one column the server may update). Rows disappear only when
-- their player is deleted (cascade). Then the coins of that stake simply leave
-- the game: no coin is ever created. This is a documented limit.
--
-- stake_id is the id the browser made for the click, and ref is "stake:" plus
-- that id: the ref of the ledger row that took the coins. A player can use a
-- stake_id once, and has one stake per question.

create table if not exists public.prediction_stakes (
  id          bigint generated always as identity primary key,
  question_id text not null references public.prediction_pools (question_id),
  player_id   uuid not null references public.profiles (id) on delete cascade,
  side        text not null,
  amount      bigint not null,
  stake_id    text not null,
  ref         text not null,
  payout      bigint,
  created_at  timestamptz not null default now(),

  constraint prediction_stakes_side_allowed
    check (side in ('yes', 'no')),
  constraint prediction_stakes_amount_above_zero
    check (amount > 0),
  -- 8 to 64 letters, digits, underscores or hyphens, like an actionUid.
  constraint prediction_stakes_stake_id_format
    check (stake_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  constraint prediction_stakes_ref_from_stake_id
    check (ref = 'stake:' || stake_id),
  constraint prediction_stakes_payout_not_negative
    check (payout is null or payout >= 0)
);

-- A player can use a stake id once. This makes a repeated request safe.
create unique index if not exists prediction_stakes_one_per_stake_id
  on public.prediction_stakes (player_id, stake_id);

-- A player has one stake per question.
create unique index if not exists prediction_stakes_one_per_question
  on public.prediction_stakes (question_id, player_id);

-- The newest stakes of a player first. It also serves the daily cap, which adds
-- up the player's recent stakes, and the cleanup when a player is deleted.
create index if not exists prediction_stakes_player_id_idx
  on public.prediction_stakes (player_id, id desc);

-- The coins on each side of a question (the view below).
create index if not exists prediction_stakes_question_side_idx
  on public.prediction_stakes (question_id, side);

comment on table public.prediction_stakes is
  'One row per prediction desk stake: who staked how many coins on which side of which question, and what came back. Never edited except that the server writes the payout when the pool is settled. Players can read only their own rows. Rows are added only by prediction_place_stake(). A player has one stake per question. If a player is deleted, their stakes go with them and those coins leave the game.';
comment on column public.prediction_stakes.id is
  'Running number in the order the stakes were placed. A pool uses it to break ties, so the earliest stake wins a tie. Order the stakes of a player by id.';
comment on column public.prediction_stakes.question_id is
  'The pool the stake belongs to (a row of prediction_pools).';
comment on column public.prediction_stakes.player_id is
  'The player who staked. Deleting the player deletes this row.';
comment on column public.prediction_stakes.side is
  'yes or no.';
comment on column public.prediction_stakes.amount is
  'Whole coins staked. Always above 0. The server limits one stake to 50 coins.';
comment on column public.prediction_stakes.stake_id is
  'The id the browser made for the click: 8 to 64 letters, digits, underscores or hyphens. For one player it can be used only once, so a repeated request cannot stake twice.';
comment on column public.prediction_stakes.ref is
  'stake: plus the stake_id: the ref of the wallet ledger row that took the coins.';
comment on column public.prediction_stakes.payout is
  'Coins paid back when the pool was settled: 0 for a lost stake, more than the stake for a win, the stake for a refund. Empty while the pool is open.';
comment on column public.prediction_stakes.created_at is
  'When the database transaction of the stake started. The daily cap counts stakes from the start of the Lisbon day.';


-- -----------------------------------------------------------------------------
-- 4. View prediction_pool_sides: the coins and the players on each side
-- -----------------------------------------------------------------------------
-- Added up from the stakes, so it cannot drift. "security_invoker" makes the view
-- use the rights of whoever reads it, not of its owner, so it cannot be a way
-- around the rules of the table. Only the server may read it (section 6).

create or replace view public.prediction_pool_sides
  with (security_invoker = true)
as
  select question_id,
         side,
         count(*)::integer as players,
         sum(amount)::bigint as coins
    from public.prediction_stakes
   group by question_id, side;

comment on view public.prediction_pool_sides is
  'The coins and the number of players on each side of each prediction pool, added up from prediction_stakes. For the server only: the browser has no right to read it.';
comment on column public.prediction_pool_sides.question_id is
  'The pool (a question id).';
comment on column public.prediction_pool_sides.side is
  'yes or no. A side nobody picked has no row.';
comment on column public.prediction_pool_sides.players is
  'How many players staked on this side.';
comment on column public.prediction_pool_sides.coins is
  'How many coins were staked on this side.';


-- -----------------------------------------------------------------------------
-- 5. Row-level security (RLS): who may see which row
-- -----------------------------------------------------------------------------
-- Same plan as the other files: all policies are for "authenticated" and are read
-- policies. There is no policy for insert, update or delete, so no player can
-- write. "anon" has no policy, so it gets nothing.

alter table public.prediction_pools  enable row level security;
alter table public.prediction_stakes enable row level security;

-- prediction_pools: every signed-in player may read every pool. A pool holds no
-- personal data, and a screen can show how a question ended.
drop policy if exists "Players can read all prediction pools" on public.prediction_pools;
create policy "Players can read all prediction pools"
  on public.prediction_pools for select to authenticated
  using (true);
comment on policy "Players can read all prediction pools" on public.prediction_pools is
  'Any signed-in player may read all prediction pools. They hold no personal data. Nobody except the server can write them.';

-- prediction_stakes: a player may read only their own stakes.
drop policy if exists "Players can read their own prediction stakes" on public.prediction_stakes;
create policy "Players can read their own prediction stakes"
  on public.prediction_stakes for select to authenticated
  using (player_id = (select auth.uid()));
comment on policy "Players can read their own prediction stakes" on public.prediction_stakes is
  'A signed-in player may read only their own stakes. Nobody except the server can add rows.';

-- No insert, update or delete policy on either table: the browser never writes
-- game data.


-- -----------------------------------------------------------------------------
-- 6. Table privileges: which roles may use which table at all
-- -----------------------------------------------------------------------------
-- The second lock, as in the foundation file. First take everything away from
-- every role (this also makes the file behave the same on a project that hands
-- out rights to new tables by itself), then give back only what is needed.
--
--   anon           nothing
--   authenticated  read only (RLS then limits the rows); not the view
--   service_role   the server:
--                    prediction_pools        read, insert, and update of seven
--                                            columns (not closes_at, not
--                                            question_id): the settlement
--                    prediction_stakes       read, insert, and update of the
--                                            column payout (not the player, the
--                                            side or the amount)
--                    prediction_pool_sides   read
--
-- The update rights are per column on purpose. "select ... for update" needs the
-- update right on at least one column, and the column grants give exactly that.
-- The server cannot change who staked what or how much, and it cannot delete a
-- stake or a pool.

revoke all on table
  public.prediction_pools,
  public.prediction_stakes,
  public.prediction_pool_sides
from public, anon, authenticated, service_role;

-- The stake counter (the sequence behind the identity column "id"). An identity
-- column needs no rights on its counter, but a project that exposes new objects
-- hands out rights on new sequences. Anyone who could move the counter could
-- break every later stake.
revoke all on sequence public.prediction_stakes_id_seq
from public, anon, authenticated, service_role;

grant select on table
  public.prediction_pools,
  public.prediction_stakes
to authenticated;

grant select, insert on table public.prediction_pools to service_role;
grant update (status, outcome, settlement, settled_by, settled_at, cut_coins, paid_coins)
  on table public.prediction_pools to service_role;

grant select, insert on table public.prediction_stakes to service_role;
grant update (payout) on table public.prediction_stakes to service_role;

grant select on table public.prediction_pool_sides to service_role;


-- -----------------------------------------------------------------------------
-- 7. Trigger prediction_pools_keep_settled(): a settled pool is final
-- -----------------------------------------------------------------------------
-- prediction_settle_pool() refuses a pool that is settled already. This trigger
-- makes the same rule true in the table itself. Once a pool row says "settled",
-- the table accepts no change to that row any more, whoever asks: not even the
-- server, which holds the update right on seven of its columns (section 6).
--
-- Why it is needed: without it, a server bug that wrote to the table directly
-- could set a settled pool back to "open" and settle it again with the other
-- outcome. The ref pool:<questionId> would stop a second payout to the SAME
-- player, but it would not stop a payout to the OTHER player, so the coins of one
-- pool could be paid out twice.
--
-- The settlement itself is not in the way: it changes an OPEN pool, once.
-- (A "select ... for update" is a lock, not a change, so it does not fire this.)

create or replace function public.prediction_pools_keep_settled()
returns trigger
language plpgsql
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
begin
  if old.status = 'settled' then
    raise exception 'pool_settled';
  end if;
  return new;
end;
$$;

-- A trigger fires without checking who may run the function, so nobody needs
-- the right to call it directly.
revoke all on function public.prediction_pools_keep_settled()
  from public, anon, authenticated, service_role;

comment on function public.prediction_pools_keep_settled() is
  'Trigger helper. Raises pool_settled on every update of a prediction_pools row whose status is settled, so a settled pool can never be changed again, not even by the server.';

create or replace trigger prediction_pools_keep_settled
  before update on public.prediction_pools
  for each row execute function public.prediction_pools_keep_settled();


-- -----------------------------------------------------------------------------
-- 8. Function prediction_place_stake(): the only way a stake happens
-- -----------------------------------------------------------------------------
-- The server checks the question, the Manifold state, the size of the stake and the
-- wallet rules (backend/server/predictions/desk.py), then calls this. In ONE
-- transaction it:
--
--   1. checks the arguments it is given,
--   2. makes sure the pool row exists and locks it, so a stake and a settlement
--      of the same pool happen one at a time,
--   3. locks the player's wallet row (always after the pool),
--   4. refuses a repeated stake id,
--   5. refuses the stake if the pool is settled or its closing time has passed,
--   6. refuses a second stake on the same question,
--   7. refuses a stake that would take the player over the daily cap,
--   8. takes the coins with apply_wallet_transaction(),
--   9. writes the stake, and
--  10. returns the new balance, what the player staked today and the sides.
--
--   p_player_id    whose wallet changes
--   p_question_id  the question (a pool is created for it if there is none yet)
--   p_side         'yes' or 'no'
--   p_amount       whole coins, at least 1 and at most p_max_stake
--   p_stake_id     the id the browser made for the click (8 to 64 letters, digits,
--                  underscores or hyphens). The ledger ref is 'stake:' plus it
--   p_closes_at    the closing time the server knows (the earliest of the list of
--                  questions and Manifold). The earlier of this and the closing
--                  time stored in the pool counts
--   p_max_stake    the biggest stake allowed in coins
--   p_daily_cap    the most coins a player may stake per day
--   p_day_start    when the day began (00:00 Lisbon time), for the cap. It cannot
--                  be in the future (a minute of clock difference is allowed), or
--                  the cap would count no stakes at all
--
-- It returns a JSON object:
--   {"status": "done", "balance": ..., "stakedToday": ..., "sides": [{"side", "coins", "players"}]}
--       "sides" are the sides of this question that have stakes, after this stake
--   {"status": "refused", "reason": ...} when a rule says no. Nothing was changed.
--       reason "pool_closed"      the pool is settled, or its closing time has passed
--       reason "already_staked"   also "side" and "amount" of the stake the player has
--       reason "daily_cap"        also "coinsLeft", what the player may still stake today
--
-- Real failures raise an error and change nothing:
--   * insufficient_funds, unknown_reason, wrong_direction: from the wallet function.
--   * A repeated stake id: error code 23505 (unique violation), message already_applied.
--   * wallet_not_found, bad_stake: a missing wallet, or arguments that make no sense.
--     These mean the server and the database disagree: they are bugs, not refusals.
--
-- Why a refusal is returned and not raised: a raised error cannot carry the
-- reason through the server's database client, and nothing was written yet, so
-- there is nothing to undo. "already_staked" is returned for the same reason: the
-- unique index would raise 23505, which the server reads as "already applied" and
-- that would be the wrong answer.
--
-- It is not SECURITY DEFINER on purpose. It runs with the rights of its caller,
-- so a player (who has no rights on these tables and no right to run it) is
-- stopped even if it were granted by mistake.

create or replace function public.prediction_place_stake(
  p_player_id   uuid,
  p_question_id text,
  p_side        text,
  p_amount      bigint,
  p_stake_id    text,
  p_closes_at   timestamptz,
  p_max_stake   bigint,
  p_daily_cap   bigint,
  p_day_start   timestamptz
)
returns jsonb
language plpgsql
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_status          text;
  v_closes_at       timestamptz;
  v_existing_side   text;
  v_existing_amount bigint;
  v_staked_today    bigint;
  v_balance         bigint;
  v_sides           jsonb;
begin
  -- Step 1: the arguments must make sense. A missing value would make a later
  -- comparison quietly "not true", so none may be missing.
  if p_player_id is null
     or p_question_id is null or p_question_id !~ '^[a-z0-9-]{2,40}$'
     or p_side is null or p_side not in ('yes', 'no')
     or p_amount is null or p_amount < 1
     or p_max_stake is null or p_max_stake < 1 or p_amount > p_max_stake
     or p_stake_id is null or p_stake_id !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_closes_at is null
     or p_daily_cap is null or p_daily_cap < 0
     or p_day_start is null or p_day_start > now() + interval '1 minute' then
    raise exception 'bad_stake';
  end if;

  -- Step 2: make sure the pool row exists, then lock it until the end of this
  -- transaction. A settlement of the same pool waits here, so it always sees every
  -- stake, and a stake that comes after it sees a settled pool. (If this whole
  -- call fails later, the new pool row is rolled back with it.)
  insert into public.prediction_pools (question_id, closes_at)
  values (p_question_id, p_closes_at)
  on conflict (question_id) do nothing;

  select status, closes_at
    into v_status, v_closes_at
    from public.prediction_pools
   where question_id = p_question_id
     for update;

  -- Step 3: lock the player's wallet row, always after the pool. (A SELECT ... FOR
  -- UPDATE needs the right to update wallets.)
  perform 1 from public.wallets where player_id = p_player_id for update;
  if not found then
    raise exception 'wallet_not_found';
  end if;

  -- Step 4: a repeated stake id. Say "already applied" with the unique-violation
  -- code (23505), the same answer the wallet gives, before any other rule can
  -- answer. It is the answer to a repeat whatever has changed since.
  if exists (
    select 1 from public.prediction_stakes
     where player_id = p_player_id and stake_id = p_stake_id
  ) then
    raise exception 'already_applied' using errcode = '23505';
  end if;

  -- Step 5: the pool must be open. The earlier of the stored closing time and the
  -- one the server passes at this call counts. (The stored time never moves later,
  -- but a time passed at an earlier call is not remembered.)
  if v_status <> 'open' or now() >= least(v_closes_at, p_closes_at) then
    return jsonb_build_object('status', 'refused', 'reason', 'pool_closed');
  end if;

  -- Step 6: one stake per question. Checked here and not left to the unique index,
  -- because the index would raise 23505, and that means "already applied".
  select side, amount
    into v_existing_side, v_existing_amount
    from public.prediction_stakes
   where question_id = p_question_id and player_id = p_player_id;

  if found then
    return jsonb_build_object(
      'status', 'refused', 'reason', 'already_staked',
      'side', v_existing_side, 'amount', v_existing_amount
    );
  end if;

  -- Step 7: the daily cap. The wallet lock above makes a player's stakes happen
  -- one at a time, so the sum below always includes the stake that came first.
  select coalesce(sum(amount), 0)
    into v_staked_today
    from public.prediction_stakes
   where player_id = p_player_id and created_at >= p_day_start;

  if v_staked_today + p_amount > p_daily_cap then
    return jsonb_build_object(
      'status', 'refused', 'reason', 'daily_cap',
      'coinsLeft', greatest(p_daily_cap - v_staked_today, 0)
    );
  end if;

  -- Step 8: take the coins. The wallet function checks the reason, the direction
  -- and the balance, and an error (not enough coins, a repeated ref) cancels
  -- the whole call.
  v_balance := public.apply_wallet_transaction(
    p_player_id, -p_amount, 'prediction_stake', 'stake:' || p_stake_id
  );

  -- Step 9: write the stake.
  insert into public.prediction_stakes (question_id, player_id, side, amount, stake_id, ref)
  values (p_question_id, p_player_id, p_side, p_amount, p_stake_id, 'stake:' || p_stake_id);

  -- Step 10: the sides of this question, added up from the stakes.
  select coalesce(
           jsonb_agg(
             jsonb_build_object('side', t.side, 'coins', t.coins, 'players', t.players)
             order by t.side
           ),
           '[]'::jsonb
         )
    into v_sides
    from (
      select side, sum(amount)::bigint as coins, count(*)::integer as players
        from public.prediction_stakes
       where question_id = p_question_id
       group by side
    ) as t;

  return jsonb_build_object(
    'status', 'done',
    'balance', v_balance,
    'stakedToday', v_staked_today + p_amount,
    'sides', v_sides
  );
end;
$$;

revoke all on function public.prediction_place_stake(uuid, text, text, bigint, text, timestamptz, bigint, bigint, timestamptz)
  from public, anon, authenticated;
grant execute on function public.prediction_place_stake(uuid, text, text, bigint, text, timestamptz, bigint, bigint, timestamptz)
  to service_role;

comment on function public.prediction_place_stake(uuid, text, text, bigint, text, timestamptz, bigint, bigint, timestamptz) is
  'The only way a prediction desk stake happens. In one step: checks the arguments, makes sure the pool row exists and locks it, locks the wallet, refuses a repeated stake id (error 23505 already_applied), refuses a settled pool or one past its closing time (the earlier of the stored and the given closing time counts), refuses a second stake on the question, refuses a stake over the daily cap, takes the coins with apply_wallet_transaction() (reason prediction_stake, ref stake: plus the stake id) and writes the stake. Returns {status: done, balance, stakedToday, sides}, or {status: refused, reason: pool_closed, already_staked or daily_cap} with nothing changed. Raises insufficient_funds (from the wallet), wallet_not_found or bad_stake. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 9. Function prediction_settle_pool(): the only way a pool is settled
-- -----------------------------------------------------------------------------
-- The server works out who gets how many coins (backend/server/predictions/pools.py)
-- and calls this. In ONE transaction it:
--
--   1. checks the arguments it is given,
--   2. makes sure the pool row exists and locks it (an empty pool is settled too,
--      so no stake can arrive afterwards),
--   3. refuses a pool that is settled already,
--   4. refuses yes or no while staking is still open (void works at any time),
--   5. reads the pool from its stakes, under the lock,
--   6. decides how the pool ends, exactly as pools.py does,
--   7. checks that the payouts name exactly the stakes that get paid,
--   8. checks that the numbers add up,
--   9. pays everybody with apply_wallet_transaction(), in player-id order,
--  10. writes the payout of every stake (0 for a lost stake), and
--  11. marks the pool settled.
--
--   p_question_id  the question
--   p_outcome      'yes', 'no' or 'void'
--   p_closes_at    the closing time the server knows. The earlier of this and the
--                  closing time stored in the pool counts
--   p_cut_percent  the share of the losing side that leaves the game (5), 0 to 100
--   p_payouts      a JSON list [{"stakeRowId": 12, "coins": 34}, ...]: one entry for
--                  every stake that gets paid. The stakes are rows of prediction_stakes
--   p_settled_by   'host' or 'auto'
--
-- How a pool ends (the same rules as pools.py, in this order):
--   outcome void                 refund_void          everybody gets their stake back
--   nobody picked the outcome    refund_no_winners    everybody gets their stake back
--   everybody picked the outcome refund_one_sided     everybody gets their stake back
--   otherwise                    winners              the winners share the pool
-- With T all the coins, W the coins on the winning side and L = T - W: the cut is
-- L times p_cut_percent divided by 100, rounded down, and the winners share
-- D = T - cut. For a refund the cut is 0. The payouts must add up to D, each
-- payout must be at least 1 coin, a refund must be the stake, and a win must be
-- within one coin of the exact share: abs(coins x W - stake x D) < W.
--
-- It returns a JSON object:
--   {"status": "done", "settlement", "paidPlayers", "paidCoins", "cutCoins", "settledAt"}
--   {"status": "refused", "reason": ...} when a rule says no. Nothing was changed.
--       reason "pool_open"        yes or no while staking is open; also "closesAt"
--       reason "stakes_changed"   the payouts do not name exactly the stakes that get
--                                 paid: a stake was deleted with its player, or a new
--                                 stake arrived after the server read the pool (that can
--                                 happen to a void while staking is still open). The
--                                 server reads the stakes again and tries once more
--
-- Real failures raise an error and change nothing:
--   * A pool that is settled already: error code 23505 (unique violation), message
--     already_applied.
--   * insufficient_funds, unknown_reason, wrong_direction, wallet_not_found: from the
--     wallet function.
--   * bad_settlement: arguments that make no sense, or payouts that do not add up.
--     This means the server and the database disagree: it is a bug, not a refusal.
--
-- It is not SECURITY DEFINER on purpose, for the same reason as prediction_place_stake().

create or replace function public.prediction_settle_pool(
  p_question_id text,
  p_outcome     text,
  p_closes_at   timestamptz,
  p_cut_percent integer,
  p_payouts     jsonb,
  p_settled_by  text
)
returns jsonb
language plpgsql
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_status         text;
  v_closes_at      timestamptz;
  v_row_ids        bigint[];
  v_coins          bigint[];
  v_total          bigint;   -- T: all the coins in the pool
  v_winning        bigint;   -- W: the coins on the winning side (0 for void)
  v_losing         bigint;   -- L: T - W
  v_settlement     text;
  v_cut            bigint;
  v_shared         bigint;   -- D: the coins the paid stakes share, T - cut
  v_expected_count integer;  -- how many stakes get paid
  v_given_count    integer;
  v_distinct_count integer;
  v_matching_count integer;
  v_paid_players   integer := 0;
  v_paid_coins     bigint := 0;
  v_settled_at     timestamptz;
  v_payment        record;
begin
  -- Step 1: the arguments must make sense. A missing value would make a later
  -- comparison quietly "not true", so none may be missing.
  if p_question_id is null or p_question_id !~ '^[a-z0-9-]{2,40}$'
     or p_outcome is null or p_outcome not in ('yes', 'no', 'void')
     or p_closes_at is null
     or p_cut_percent is null or p_cut_percent < 0 or p_cut_percent > 100
     or p_payouts is null or jsonb_typeof(p_payouts) <> 'array'
     or p_settled_by is null or p_settled_by not in ('host', 'auto') then
    raise exception 'bad_settlement';
  end if;

  -- Every entry of the list must be an object with two whole numbers. The text of
  -- a whole number has digits only (a number with a fraction, such as 1.5 or 59.0,
  -- is refused).
  if exists (
    select 1
      from jsonb_array_elements(p_payouts) as entry
     where jsonb_typeof(entry) <> 'object'
        or jsonb_typeof(entry -> 'stakeRowId') is distinct from 'number'
        or jsonb_typeof(entry -> 'coins') is distinct from 'number'
        or (entry ->> 'stakeRowId') !~ '^[0-9]{1,15}$'
        or (entry ->> 'coins') !~ '^[0-9]{1,15}$'
  ) then
    raise exception 'bad_settlement';
  end if;

  select array_agg((entry ->> 'stakeRowId')::bigint order by item_no),
         array_agg((entry ->> 'coins')::bigint order by item_no)
    into v_row_ids, v_coins
    from jsonb_array_elements(p_payouts) with ordinality as listed(entry, item_no);

  -- Step 2: make sure the pool row exists, then lock it until the end of this
  -- transaction. An empty pool is settled too, so no stake can arrive later.
  insert into public.prediction_pools (question_id, closes_at)
  values (p_question_id, p_closes_at)
  on conflict (question_id) do nothing;

  select status, closes_at
    into v_status, v_closes_at
    from public.prediction_pools
   where question_id = p_question_id
     for update;

  -- Step 3: a pool settles once. Say "already applied" with the unique-violation
  -- code (23505), the same answer the wallet gives. (The trigger of section 7 keeps
  -- the same promise in the table itself, for a write that does not come through
  -- this function.)
  if v_status = 'settled' then
    raise exception 'already_applied' using errcode = '23505';
  end if;

  -- Step 4: yes or no only after the pool has closed. Void works at any time.
  if p_outcome <> 'void' and now() < least(v_closes_at, p_closes_at) then
    return jsonb_build_object(
      'status', 'refused', 'reason', 'pool_open',
      'closesAt', least(v_closes_at, p_closes_at)
    );
  end if;

  -- Step 5: read the pool from its stakes. The pool is locked, and a stake locks
  -- the pool first, so no stake can be written while this runs.
  select coalesce(sum(amount), 0),
         coalesce(sum(amount) filter (where side = p_outcome), 0)
    into v_total, v_winning
    from public.prediction_stakes
   where question_id = p_question_id;
  v_losing := v_total - v_winning;

  -- Step 6: how the pool ends. The order matters: a void question is refunded even
  -- if one side is empty.
  v_cut := 0;
  if p_outcome = 'void' then
    v_settlement := 'refund_void';
  elsif v_winning = 0 then
    v_settlement := 'refund_no_winners';
  elsif v_losing = 0 then
    v_settlement := 'refund_one_sided';
  else
    v_settlement := 'winners';
    v_cut := (v_losing * p_cut_percent) / 100;  -- whole numbers: rounded down
  end if;
  v_shared := v_total - v_cut;

  -- Step 7: the payouts must name exactly the stakes that get paid: every stake for
  -- a refund, every winning stake for a win. Compare how many entries there are,
  -- how many are different, how many are expected and how many really match.
  select count(*)
    into v_expected_count
    from public.prediction_stakes
   where question_id = p_question_id
     and (v_settlement <> 'winners' or side = p_outcome);

  v_given_count := coalesce(cardinality(v_row_ids), 0);

  select count(distinct listed.row_id)
    into v_distinct_count
    from unnest(v_row_ids) as listed(row_id);

  select count(*)
    into v_matching_count
    from public.prediction_stakes
   where question_id = p_question_id
     and (v_settlement <> 'winners' or side = p_outcome)
     and id = any (coalesce(v_row_ids, '{}'::bigint[]));

  if v_given_count <> v_expected_count
     or v_distinct_count <> v_expected_count
     or v_matching_count <> v_expected_count then
    return jsonb_build_object('status', 'refused', 'reason', 'stakes_changed');
  end if;

  -- Step 8: the numbers must add up. The payouts share exactly D. Each payout is at
  -- least 1 coin. A refund is the stake. A win is within one coin of the exact
  -- share: abs(coins x W - stake x D) < W.
  if coalesce((select sum(paid.coins)
                 from unnest(v_row_ids, v_coins) as paid(row_id, coins)), 0) <> v_shared then
    raise exception 'bad_settlement';
  end if;

  if exists (
    select 1
      from unnest(v_row_ids, v_coins) as paid(row_id, coins)
      join public.prediction_stakes as s on s.id = paid.row_id
     where paid.coins < 1
        or (v_settlement <> 'winners' and paid.coins <> s.amount)
        or (v_settlement = 'winners'
            and abs(paid.coins * v_winning - s.amount * v_shared) >= v_winning)
  ) then
    raise exception 'bad_settlement';
  end if;

  -- Step 9: pay everybody, in player-id order. Every function locks in the same
  -- order (the pool, then the wallets by player id), so two settlements, or a
  -- settlement and a stake, cannot wait for each other in a circle. An error from
  -- the wallet cancels the whole settlement.
  for v_payment in
    select s.player_id, paid.coins
      from unnest(v_row_ids, v_coins) as paid(row_id, coins)
      join public.prediction_stakes as s on s.id = paid.row_id
     order by s.player_id, s.id
  loop
    perform public.apply_wallet_transaction(
      v_payment.player_id, v_payment.coins, 'prediction_payout', 'pool:' || p_question_id
    );
    v_paid_players := v_paid_players + 1;
    v_paid_coins := v_paid_coins + v_payment.coins;
  end loop;

  -- Step 10: write the payout of every stake: 0 for a stake that lost.
  update public.prediction_stakes
     set payout = 0
   where question_id = p_question_id;

  update public.prediction_stakes as s
     set payout = paid.coins
    from unnest(v_row_ids, v_coins) as paid(row_id, coins)
   where s.id = paid.row_id;

  -- Step 11: mark the pool settled.
  update public.prediction_pools
     set status = 'settled',
         outcome = p_outcome,
         settlement = v_settlement,
         settled_by = p_settled_by,
         settled_at = now(),
         cut_coins = v_cut,
         paid_coins = v_paid_coins
   where question_id = p_question_id
  returning settled_at into v_settled_at;

  return jsonb_build_object(
    'status', 'done',
    'settlement', v_settlement,
    'paidPlayers', v_paid_players,
    'paidCoins', v_paid_coins,
    'cutCoins', v_cut,
    'settledAt', v_settled_at
  );
end;
$$;

revoke all on function public.prediction_settle_pool(text, text, timestamptz, integer, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.prediction_settle_pool(text, text, timestamptz, integer, jsonb, text)
  to service_role;

comment on function public.prediction_settle_pool(text, text, timestamptz, integer, jsonb, text) is
  'The only way a prediction desk pool is settled. In one step: checks the arguments, makes sure the pool row exists and locks it, refuses a pool that is settled already (error 23505 already_applied), refuses yes or no before the pool has closed (void works at any time), reads the pool from its stakes, decides the settlement (refund_void, refund_no_winners, refund_one_sided or winners), checks that the payouts name exactly the stakes that get paid and that they add up (the payouts share the pool minus the cut, each is at least 1 coin, a refund is the stake and a win is within one coin of the exact share), pays everybody with apply_wallet_transaction() in player-id order (reason prediction_payout, ref pool: plus the question id), writes the payout of every stake and marks the pool settled. Returns {status: done, settlement, paidPlayers, paidCoins, cutCoins, settledAt}, or {status: refused, reason: pool_open or stakes_changed} with nothing changed. Raises bad_settlement when the arguments or the payouts are wrong. Only service_role may run it.';
