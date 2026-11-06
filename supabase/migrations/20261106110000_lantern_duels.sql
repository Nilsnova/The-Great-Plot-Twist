-- =============================================================================
-- 20261106110000_lantern_duels.sql
--
-- WHAT IT DOES
--   The database part of Lantern Duels (package A7): two captains each seal a
--   sequence of lantern signals (flash, shade or mirror), the server opens both
--   envelopes at once and decides every round, and the duel is friendly or played
--   for equal play-coin stakes. It adds two wallet reasons, two tables and three
--   functions.
--
--     duels        one row per challenge: who, how many rounds, the stake, the
--                  status, and (once decided) the result of every round. It holds
--                  no signal
--     duel_moves   the sealed envelopes: one row per captain and round. The only
--                  table that holds a signal. Nobody but the server may even read
--                  it, and nobody may change a row
--
--     duel_create()  sends a challenge: the duel, the challenger's envelope and
--                    the challenger's stake, in ONE step
--     duel_answer()  answers it: the answerer's stake and envelope, the reveal,
--                    the result and the payout or the refunds, in ONE step
--     duel_void()    withdraws, declines or expires a challenge and gives the
--                    challenger's stake back
--
-- WHO USES IT
--   You run it once on the Supabase project, AFTER the foundation migration
--   (20261106000000_foundation.sql) and the Island Exchange migration
--   (20261106010000_island_exchange.sql), because it uses the wallet and the
--   profiles table from the first. The steps are in supabase/README.md. After
--   that the Python server (backend/server/duels/) does all the writing, with the
--   secret key. The browser may only read the duels it takes part in.
--
-- THE RULES THAT THE DATABASE KEEPS
--   1. Play money only. Coins cannot be bought, cashed out or exchanged for real
--      prizes. The screen says "Simulation, play money".
--   2. The browser never writes. Players can read their own duels; every write
--      goes through the server (rule D003, docs/DECISIONS.md).
--   3. Sealed means sealed. A captain's signals reach the other captain only
--      after both envelopes are in, and only as part of the reveal. So players
--      have NO right at all on duel_moves (no grant, no policy, and row-level
--      security on), the duels table holds no signal, and no role, not even the
--      server, may change or delete a sealed signal.
--   4. Coins move only through apply_wallet_transaction() (the foundation file).
--      The three functions call it, so a duel follows the same rules as every
--      other coin change: a known reason, the right direction, never below 0
--      coins, and every change has a ref that can be used only once.
--   5. A duel step is all or nothing. Either the duel, the envelopes and the coins
--      change together, or nothing changes.
--   6. The server is the referee, but the database checks what follows from the
--      server's numbers (see duel_answer()). Round results and the outcome are an
--      INPUT from Python, like the price of a trade. The database does not repeat
--      the signal rules, but it checks that the results fit the rounds and that
--      the outcome fits the counted points.
--   7. The caps hold even when two requests arrive at the same moment, because
--      they are checked while the locks are held: at most 3 waiting challenges
--      per captain, at most 3 staked duels per day between the same two captains.
--   8. Someone who is not signed in (role "anon") gets nothing at all.
--
--   There is no timer. A challenge that nobody answers in 24 hours is closed by
--   the next request that touches it (duel_void(), asked by the server), and the
--   DATABASE clock decides whether the time is over.
--
-- WHAT IT NEEDS
--   The foundation migration (tables profiles, wallets, wallet_reasons,
--   wallet_transactions and the function apply_wallet_transaction). A Supabase
--   project has the roles anon, authenticated and service_role already.
--
-- SAFE TO RUN TWICE
--   Tables and indexes use "if not exists", the new reasons use "on conflict do
--   nothing", functions use "create or replace", the policy is dropped and created
--   again, and grants and comments simply repeat. A second run changes nothing.
--
-- HOW THE FILE IS ORGANISED
--   1. Wallet reasons arena_stake and arena_payout
--   2. Table duels
--   3. Table duel_moves
--   4. Row-level security: who may see which row
--   5. Table privileges: which roles may use which table at all
--   6. Function duel_create()
--   7. Function duel_answer()
--   8. Function duel_void()
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Wallet reasons
-- -----------------------------------------------------------------------------
-- A staked duel writes these ledger rows. All of them carry the ref "duel:" and
-- the duel id (41 characters, under the limit of 120), and the ledger accepts each
-- player + reason + ref once, so a stake or a payout can never be booked twice:
--
--   arena_stake    spend  the challenger's stake when the challenge is sent, and
--                         the answerer's stake when they answer
--   arena_payout   earn   the winner's payout, or a stake that comes back (a draw,
--                         a withdrawal, a decline or an expiry)
--
-- The cut (5 percent of the pot, rounded in the winner's disfavour) has no ledger
-- row: it is simply not paid out. It is the only coin sink of the duels, and
-- duels never create coins.
--
-- The same two pairs, in the same order, are added at the END of WALLET_REASONS
-- in backend/server/wallet.py. A test reads this INSERT. Write each description
-- without an apostrophe.

insert into public.wallet_reasons (reason, direction, description) values
  ('arena_stake',  'spend', 'Coins held as the stake of a Lantern Duel.'),
  ('arena_payout', 'earn',  'Coins paid out of a Lantern Duel: the winnings, or a stake that comes back.')
on conflict (reason) do nothing;


-- -----------------------------------------------------------------------------
-- 2. Table duels: one row per challenge
-- -----------------------------------------------------------------------------
-- A duel starts "open" when the challenger sends it, and ends exactly once as
-- "finished" (the other captain answered), "withdrawn" (the challenger stepped
-- back), "declined" (the named captain said no) or "expired" (nobody answered in
-- time). A closed duel never changes again.
--
-- The table never holds a signal. Before the reveal it holds nothing secret; after
-- the reveal it holds the result of every round ("challenger", "opponent" or
-- "even") and the outcome.
--
-- opponent_id is the named captain, or whoever answered an open challenge. It is
-- set to null (not deleted) when that captain's profile goes away, so deleting an
-- opponent never deletes a duel whose stake is still held.

create table if not exists public.duels (
  id            uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.profiles (id) on delete cascade,
  opponent_id   uuid references public.profiles (id) on delete set null,
  is_open       boolean not null,
  rounds        smallint not null,
  stake         integer not null,
  cut_percent   smallint not null,
  status        text not null default 'open',
  outcome       text,
  round_results text[],
  create_uid    text not null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  answered_at   timestamptz,
  closed_at     timestamptz,

  -- One small check per rule, so the error message names the broken rule.
  constraint duels_rounds_allowed
    check (rounds in (3, 5)),
  constraint duels_stake_range
    check (stake between 0 and 100),
  constraint duels_cut_percent_range
    check (cut_percent between 0 and 20),
  constraint duels_status_allowed
    check (status in ('open', 'finished', 'withdrawn', 'declined', 'expired')),
  constraint duels_outcome_allowed
    check (outcome in ('challenger', 'opponent', 'draw')),
  constraint duels_not_against_yourself
    check (opponent_id <> challenger_id),
  -- The pattern reads: from the start (^) to the end ($), 8 to 64 characters, each
  -- one of: A-Z, a-z, 0-9, underscore, hyphen. The server checks the same thing.
  constraint duels_create_uid_format
    check (create_uid ~ '^[A-Za-z0-9_-]{8,64}$'),
  constraint duels_expires_after_creation
    check (expires_at > created_at),
  -- The result columns are filled exactly when the duel is finished.
  constraint duels_result_only_when_finished
    check ((status = 'finished')
           = (outcome is not null and round_results is not null and answered_at is not null)),
  -- closed_at is filled exactly when the duel is not open any more.
  constraint duels_closed_time_only_when_closed
    check ((status = 'open') = (closed_at is null)),
  -- One result per round, each one of the three allowed words.
  constraint duels_round_results_fit
    check (round_results is null
           or (cardinality(round_results) = rounds
               and round_results <@ array['challenger', 'opponent', 'even']))
);

-- One challenge per challenger and create_uid. This makes a repeated click safe:
-- the same click can never send two challenges.
create unique index if not exists duels_one_row_per_create_uid
  on public.duels (challenger_id, create_uid);

-- The duels of one captain, newest first, in both roles. They also help the
-- database find a captain's duels when the captain is deleted.
create index if not exists duels_challenger_id_idx
  on public.duels (challenger_id, created_at desc);
create index if not exists duels_opponent_id_idx
  on public.duels (opponent_id, created_at desc);

-- The open challenges of other captains, newest first.
create index if not exists duels_status_idx
  on public.duels (status, created_at desc);

comment on table public.duels is
  'One row per Lantern Duel challenge. It never holds a signal: before the reveal it holds nothing secret, and after the reveal it holds the result of every round. A duel is open until it ends exactly once as finished, withdrawn, declined or expired. Players can read only the duels they take part in. Rows are added and changed only by duel_create(), duel_answer() and duel_void().';
comment on column public.duels.id is
  'The duel. The ledger ref of every coin movement of the duel is duel: plus this id.';
comment on column public.duels.challenger_id is
  'The captain who sent the challenge. Deleting the captain deletes the duel.';
comment on column public.duels.opponent_id is
  'The named captain, or the captain who answered an open challenge. Empty for an open challenge nobody answered yet. Set to empty (not deleted) when that captain is deleted, so a duel whose stake is still held never disappears.';
comment on column public.duels.is_open is
  'True: any captain except the challenger may answer, and the first answer wins. False: only the named captain may answer.';
comment on column public.duels.rounds is
  'The number of rounds: 3 or 5. It is also the lantern oil each captain has: Flash burns 2, Mirror 1 and Shade 0.';
comment on column public.duels.stake is
  'The stake each captain puts in, in whole coins: 0 (a friendly duel), 10, 25, 50 or 100. The server only offers those five. The table refuses more than 100.';
comment on column public.duels.cut_percent is
  'The share of the pot that is not paid out, in percent. Fixed when the duel is created, so a later change of the cut never touches a running duel.';
comment on column public.duels.status is
  'open, finished, withdrawn, declined or expired. A duel starts open and ends once in one of the other four. A closed duel never changes again.';
comment on column public.duels.outcome is
  'challenger, opponent or draw. Filled exactly when the duel is finished.';
comment on column public.duels.round_results is
  'One entry per round: challenger, opponent or even (a round that scored for nobody). Worked out by the server and checked by duel_answer(). Filled exactly when the duel is finished.';
comment on column public.duels.create_uid is
  'The actionUid of the click that sent the challenge, 8 to 64 letters, digits, hyphens or underscores. For one challenger the same value can be used only once, so a repeated click cannot send two challenges.';
comment on column public.duels.created_at is
  'When the challenge was sent.';
comment on column public.duels.expires_at is
  'The end of the answer window: 24 hours after creation. Must be after created_at. The database clock decides whether it has passed.';
comment on column public.duels.answered_at is
  'When the other captain answered. Empty unless the duel is finished.';
comment on column public.duels.closed_at is
  'When the duel ended in any way. Empty exactly while the duel is open.';


-- -----------------------------------------------------------------------------
-- 3. Table duel_moves: the sealed envelopes
-- -----------------------------------------------------------------------------
-- One row per captain and round. A captain seals ALL their rounds at once: the
-- challenger with the challenge, the other captain with the answer. A sealed
-- signal never changes.
--
-- This is the only table that holds a signal, so it is locked tighter than any
-- other: no policy and no grant for players (not even for their own signals), and
-- the server may only read and insert. No role may update or delete a row. Rows
-- disappear only when their duel or their captain is deleted (cascade).
--
-- The primary key makes a second envelope from the same captain in the same duel
-- a unique violation. There is no identity column, so there is no counter to lock.

create table if not exists public.duel_moves (
  duel_id    uuid not null references public.duels (id) on delete cascade,
  player_id  uuid not null references public.profiles (id) on delete cascade,
  round_no   smallint not null,
  signal     text not null,
  action_uid text not null,
  sealed_at  timestamptz not null default now(),

  primary key (duel_id, player_id, round_no),
  constraint duel_moves_round_no_range
    check (round_no between 1 and 5),
  constraint duel_moves_signal_allowed
    check (signal in ('flash', 'shade', 'mirror')),
  constraint duel_moves_action_uid_format
    check (action_uid ~ '^[A-Za-z0-9_-]{8,64}$')
);

-- The envelopes of one captain. The primary key starts with duel_id, so it cannot
-- serve a search by captain. This index helps the database find a captain's
-- envelopes when that captain is deleted (the cascade above).
create index if not exists duel_moves_player_id_idx
  on public.duel_moves (player_id);

comment on table public.duel_moves is
  'The sealed envelopes of Lantern Duels: one row per captain and round, holding a signal. Players have no right on this table at all, not even to read their own rows, so a sealed signal can never reach the other captain early. The server may read and insert, and no role may update or delete a row. Rows are added only by duel_create() and duel_answer().';
comment on column public.duel_moves.duel_id is
  'The duel. Deleting the duel deletes its envelopes.';
comment on column public.duel_moves.player_id is
  'The captain who sealed the signal. Deleting the captain deletes their envelope.';
comment on column public.duel_moves.round_no is
  'The round, counted from 1.';
comment on column public.duel_moves.signal is
  'flash, shade or mirror. Flash outshines Shade, Shade leaves Mirror nothing to throw back and Mirror throws Flash back.';
comment on column public.duel_moves.action_uid is
  'The actionUid of the click that sealed the envelope. For the challenger it is the create_uid of the duel.';
comment on column public.duel_moves.sealed_at is
  'When the signal was sealed. Never shown to anyone.';


-- -----------------------------------------------------------------------------
-- 4. Row-level security (RLS): who may see which row
-- -----------------------------------------------------------------------------
-- Same plan as the other files: the only policy is a read policy for
-- "authenticated". There is no policy for insert, update or delete, so no player
-- can write, and "anon" has no policy, so it gets nothing.
--
-- duel_moves has NO policy on purpose. With row-level security on and no policy, a
-- role that was granted select by mistake would still see nothing.

alter table public.duels      enable row level security;
alter table public.duel_moves enable row level security;

-- duels: a player may read only the duels they take part in.
drop policy if exists "Players can read the duels they take part in" on public.duels;
create policy "Players can read the duels they take part in"
  on public.duels for select to authenticated
  using (challenger_id = (select auth.uid()) or opponent_id = (select auth.uid()));
comment on policy "Players can read the duels they take part in" on public.duels is
  'A signed-in player may read the duels where they are the challenger or the opponent. A duel holds no signal. Nobody except the server can write them.';


-- -----------------------------------------------------------------------------
-- 5. Table privileges: which roles may use which table at all
-- -----------------------------------------------------------------------------
-- The second lock, as in the other files. First take everything away from every
-- role (this also makes the file behave the same on a project that hands out
-- rights to new tables by itself), then give back only what is needed.
--
--   anon           nothing
--   authenticated  duels: read only (RLS then limits the rows)
--                  duel_moves: nothing
--   service_role   the server:
--                    duels       read, insert, update   (a duel is never deleted)
--                    duel_moves  read, insert           (sealed means sealed: no update
--                                                        and no delete)

revoke all on table
  public.duels,
  public.duel_moves
from public, anon, authenticated, service_role;

grant select on table public.duels to authenticated;

grant select, insert, update on table public.duels to service_role;
grant select, insert on table public.duel_moves to service_role;


-- -----------------------------------------------------------------------------
-- 6. Function duel_create(): send a challenge
-- -----------------------------------------------------------------------------
-- The server checks the choices and the signals (backend/server/duels/rules.py)
-- and calls this. In ONE transaction it:
--
--   1. checks that the arguments make sense,
--   2. locks the challenger's wallet row, so a captain's challenges happen one at
--      a time,
--   3. refuses a repeated create_uid,
--   4. for a named challenge, finds the captain by name and refuses a name nobody
--      has, a name several captains share, and the challenger's own name,
--   5. refuses a challenge when the challenger already has the most waiting,
--   6. inserts the duel,
--   7. inserts the challenger's envelope, one row per round, and
--   8. takes the stake, if it is above 0.
--
--   p_challenger_id  who sends the challenge
--   p_opponent_name  the display name of the named captain (any letter case), or
--                    null for an open challenge. It is only a lookup key: it is
--                    never stored
--   p_rounds         3 or 5
--   p_stake          0 (friendly) to 100 coins from each captain
--   p_cut_percent    the share of the pot that is not paid out, kept on the duel
--   p_signals        the challenger's signals, one per round
--   p_create_uid     the actionUid of the click (8 to 64 letters, digits, - or _)
--   p_answer_hours   how long the challenge can be answered (1 to 72)
--   p_max_waiting    the most open, unexpired challenges one captain may have
--
-- It returns a JSON object:
--   {"status": "done", "duelId": ..., "opponentId": ..., "opponentName": ..., "balance": ...}
--   {"status": "refused", "reason": ...} when a rule says no. Nothing was changed.
--       reason "no_such_captain"       nobody has that name
--       reason "name_not_unique"       several captains have that name
--       reason "cannot_duel_yourself"  the name is the challenger's own
--       reason "too_many_waiting"      the challenger has the most waiting already
--
-- Real failures raise an error and change nothing:
--   * insufficient_funds, unknown_reason, wrong_direction: from the wallet function.
--   * A repeated create_uid: error code 23505 (unique violation), message
--     already_applied.
--   * wallet_not_found, bad_duel: a missing wallet, or arguments that make no sense.
--     These mean the server and the database disagree: they are bugs, not refusals.
--
-- Why a refusal is returned and not raised: a raised error cannot carry the
-- reason through the server's database client, and nothing was written yet, so
-- there is nothing to undo.
--
-- It is not SECURITY DEFINER on purpose. It runs with the rights of its caller, so
-- a player (who has no rights on these tables and no right to run it) is stopped
-- even if it were granted by mistake.

create or replace function public.duel_create(
  p_challenger_id uuid,
  p_opponent_name text,
  p_rounds        integer,
  p_stake         integer,
  p_cut_percent   integer,
  p_signals       text[],
  p_create_uid    text,
  p_answer_hours  integer,
  p_max_waiting   integer
)
returns jsonb
language plpgsql
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_balance       bigint;
  v_matches       integer;
  v_opponent_id   uuid;
  v_opponent_name text;
  v_waiting       integer;
  v_duel_id       uuid;
  v_round         integer;
begin
  -- Step 1: the arguments must make sense. A missing value would make a later
  -- comparison quietly "not true", so none may be missing, except the name (null
  -- means an open challenge).
  if p_challenger_id is null
     or p_rounds is null or p_rounds not in (3, 5)
     or p_stake is null or p_stake < 0 or p_stake > 100
     or p_cut_percent is null or p_cut_percent < 0 or p_cut_percent > 20
     or p_signals is null or cardinality(p_signals) <> p_rounds
     or p_create_uid is null
     or p_answer_hours is null or p_answer_hours < 1 or p_answer_hours > 72
     or p_max_waiting is null or p_max_waiting < 1 then
    raise exception 'bad_duel';
  end if;

  -- Step 2: lock the challenger's wallet row until the end of this transaction. A
  -- second request of the same captain waits here, so the checks below always see
  -- the first one. (A SELECT ... FOR UPDATE needs the right to update wallets.)
  select balance into v_balance
    from public.wallets where player_id = p_challenger_id for update;
  if not found then
    raise exception 'wallet_not_found';
  end if;

  -- Step 3: a repeated create_uid. Say "already applied" with the unique-violation
  -- code (23505), the same answer the wallet gives, before any other rule can answer.
  if exists (
    select 1 from public.duels
     where challenger_id = p_challenger_id and create_uid = p_create_uid
  ) then
    raise exception 'already_applied' using errcode = '23505';
  end if;

  -- Step 4: a named challenge. The name is only a lookup key.
  if p_opponent_name is not null then
    select count(*) into v_matches
      from public.profiles
     where lower(display_name) = lower(btrim(p_opponent_name));
    if v_matches = 0 then
      return jsonb_build_object('status', 'refused', 'reason', 'no_such_captain');
    end if;
    if v_matches > 1 then
      return jsonb_build_object('status', 'refused', 'reason', 'name_not_unique');
    end if;
    select id, display_name into v_opponent_id, v_opponent_name
      from public.profiles
     where lower(display_name) = lower(btrim(p_opponent_name));
    if v_opponent_id = p_challenger_id then
      return jsonb_build_object('status', 'refused', 'reason', 'cannot_duel_yourself');
    end if;
  end if;

  -- Step 5: the cap on waiting challenges. Only unexpired ones count, because an
  -- expired one is as good as closed even before somebody refunds it.
  select count(*) into v_waiting
    from public.duels
   where challenger_id = p_challenger_id and status = 'open' and expires_at > now();
  if v_waiting >= p_max_waiting then
    return jsonb_build_object('status', 'refused', 'reason', 'too_many_waiting');
  end if;

  -- Step 6: the duel. It is open for anyone when no name was given.
  insert into public.duels
    (challenger_id, opponent_id, is_open, rounds, stake, cut_percent, create_uid, expires_at)
  values
    (p_challenger_id, v_opponent_id, p_opponent_name is null, p_rounds, p_stake, p_cut_percent,
     p_create_uid, now() + make_interval(hours => p_answer_hours))
  returning id into v_duel_id;

  -- Step 7: the challenger's envelope. Its action_uid is the create_uid.
  for v_round in 1 .. p_rounds loop
    insert into public.duel_moves (duel_id, player_id, round_no, signal, action_uid)
    values (v_duel_id, p_challenger_id, v_round, p_signals[v_round], p_create_uid);
  end loop;

  -- Step 8: hold the stake. The wallet function raises insufficient_funds, which
  -- cancels the whole call, including the duel and the envelope.
  if p_stake > 0 then
    v_balance := public.apply_wallet_transaction(
      p_challenger_id, -p_stake, 'arena_stake', 'duel:' || v_duel_id::text);
  end if;

  return jsonb_build_object(
    'status', 'done',
    'duelId', v_duel_id,
    'opponentId', v_opponent_id,
    'opponentName', v_opponent_name,
    'balance', v_balance
  );
end;
$$;

revoke all on function public.duel_create(uuid, text, integer, integer, integer, text[], text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.duel_create(uuid, text, integer, integer, integer, text[], text, integer, integer)
  to service_role;

comment on function public.duel_create(uuid, text, integer, integer, integer, text[], text, integer, integer) is
  'Sends a Lantern Duel challenge. In one step: checks the arguments, locks the challenger wallet, refuses a repeated create_uid (error 23505 already_applied), finds a named captain (any letter case) and refuses an unknown or shared name or the challenger own name, refuses a challenge when the challenger has p_max_waiting waiting already, inserts the duel and the challenger envelope (one row per round), and holds the stake with apply_wallet_transaction() (arena_stake, ref duel: and the duel id). Returns {status: done, duelId, opponentId, opponentName, balance}, or {status: refused, reason: no_such_captain, name_not_unique, cannot_duel_yourself or too_many_waiting} with nothing changed. Raises insufficient_funds (from the wallet), wallet_not_found or bad_duel. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 7. Function duel_answer(): answer a challenge
-- -----------------------------------------------------------------------------
-- The answer IS the acceptance. In ONE transaction the function stores the
-- answerer's envelope, reveals both envelopes (the results are stored on the duel),
-- takes the answerer's stake and pays out. There is no half-accepted duel.
--
-- IMPORTANT: the round results and the outcome are an INPUT from Python
-- (backend/server/duels/rules.py, resolve()), like the price of a trade. The
-- database does not repeat the signal rules (it never reads the challenger's
-- envelope). It checks only what follows from the numbers it is given: one signal
-- and one result per round, every result one of the three words, and an outcome
-- that fits the counted points. So a result list and an outcome that contradict
-- each other are refused (a win is never booked for a drawn count), but a single
-- wrongly judged round is not something the database could see. The browser never
-- sends a result.
--
--   p_duel_id           the duel
--   p_player_id         the answering captain (the verified player)
--   p_signals           the answerer's signals, one per round
--   p_action_uid        the actionUid of the click (8 to 64 letters, digits, - or _)
--   p_round_results     for every round: challenger, opponent or even
--   p_outcome           challenger, opponent or draw
--   p_day_start         when the Lisbon day began (00:00 Europe/Lisbon), for the pair
--                       limit. It cannot be in the future (a minute of clock
--                       difference is allowed), or the limit would count nothing
--   p_pair_daily_limit  the most staked duels two captains may decide per day
--
-- It returns a JSON object:
--   {"status": "done", "balance": ..., "winnerTakes": ...}
--       balance      the answerer's coins after everything
--       winnerTakes  the winner's payout (0 for a friendly duel or a draw)
--   {"status": "refused", "reason": ...} when a rule says no. Nothing was changed.
--       reason "no_such_duel"       no such duel, or a named duel for somebody else
--       reason "duel_taken"         another captain answered this open challenge first
--       reason "duel_closed"        withdrawn, declined or decided already
--       reason "duel_expired"       the answer window is over (the server then asks
--                                   duel_void() to refund the challenger)
--       reason "daily_pair_limit"   the two captains decided the most staked duels today
--
-- Real failures raise an error and change nothing:
--   * insufficient_funds, unknown_reason, wrong_direction: from the wallet function.
--   * The caller has an envelope in this duel already (they answered, or they are
--     the challenger): error code 23505 (unique violation), message already_applied.
--   * wallet_not_found, bad_duel: a missing wallet, or numbers that do not fit.
--
-- Locks, in this order, so that two requests never wait for each other forever: the
-- duel row first, then both wallets in player-id order. The duel row lock lets ONE
-- of two simultaneous answers through; the other sees the finished duel.
--
-- It is not SECURITY DEFINER on purpose (see duel_create()).

create or replace function public.duel_answer(
  p_duel_id          uuid,
  p_player_id        uuid,
  p_signals          text[],
  p_action_uid       text,
  p_round_results    text[],
  p_outcome          text,
  p_day_start        timestamptz,
  p_pair_daily_limit integer
)
returns jsonb
language plpgsql
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_duel              public.duels%rowtype;
  v_result            text;
  v_challenger_points integer := 0;
  v_opponent_points   integer := 0;
  v_wallets_locked    integer;
  v_staked_today      integer;
  v_ref               text;
  v_payout            bigint;
  v_round             integer;
  v_balance           bigint;
begin
  -- Step 1: the arguments must make sense. The day cannot start in the future, or the
  -- pair limit below would count no duels at all. One minute of difference between
  -- the clock of the server and the clock of the database is allowed.
  if p_duel_id is null or p_player_id is null or p_signals is null or p_action_uid is null
     or p_round_results is null
     or p_outcome is null or p_outcome not in ('challenger', 'opponent', 'draw')
     or p_day_start is null or p_day_start > now() + interval '1 minute'
     or p_pair_daily_limit is null or p_pair_daily_limit < 1 then
    raise exception 'bad_duel';
  end if;

  -- Step 2: lock the duel row until the end of this transaction.
  select * into v_duel from public.duels where id = p_duel_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_duel');
  end if;

  -- Step 3: the caller sealed in this duel already (they answered, or they are the
  -- challenger). Say "already applied" with the unique-violation code, before any
  -- other rule can answer.
  if exists (
    select 1 from public.duel_moves where duel_id = p_duel_id and player_id = p_player_id
  ) then
    raise exception 'already_applied' using errcode = '23505';
  end if;

  -- Step 4: the state of the duel. The database clock decides whether time is over.
  if v_duel.status <> 'open' then
    if v_duel.is_open and v_duel.status = 'finished' then
      return jsonb_build_object('status', 'refused', 'reason', 'duel_taken');
    end if;
    return jsonb_build_object('status', 'refused', 'reason', 'duel_closed');
  end if;
  if not v_duel.is_open and v_duel.opponent_id is distinct from p_player_id then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_duel');
  end if;
  if v_duel.expires_at <= now() then
    return jsonb_build_object('status', 'refused', 'reason', 'duel_expired');
  end if;

  -- Step 5: the numbers must fit. One signal and one result per round, every result
  -- one of the three words, and an outcome that follows from the counted points.
  if cardinality(p_signals) <> v_duel.rounds
     or cardinality(p_round_results) <> v_duel.rounds
     or not (p_round_results <@ array['challenger', 'opponent', 'even']) then
    raise exception 'bad_duel';
  end if;
  foreach v_result in array p_round_results loop
    if v_result = 'challenger' then
      v_challenger_points := v_challenger_points + 1;
    elsif v_result = 'opponent' then
      v_opponent_points := v_opponent_points + 1;
    end if;
  end loop;
  if (p_outcome = 'challenger' and v_challenger_points <= v_opponent_points)
     or (p_outcome = 'opponent' and v_opponent_points <= v_challenger_points)
     or (p_outcome = 'draw' and v_challenger_points <> v_opponent_points) then
    raise exception 'bad_duel';
  end if;

  -- Step 6: lock both wallets in player-id order. Another duel between the same two
  -- captains locks the same two wallets in the same order, so the second request
  -- counts the first one in the pair limit below.
  perform 1 from public.wallets
   where player_id in (v_duel.challenger_id, p_player_id)
   order by player_id
     for update;
  get diagnostics v_wallets_locked = row_count;
  if v_wallets_locked <> 2 then
    raise exception 'wallet_not_found';
  end if;

  -- Step 7: the pair limit. It counts the staked duels the two captains decided since
  -- the Lisbon day began, whoever challenged. A friendly duel counts for nothing.
  if v_duel.stake > 0 then
    select count(*) into v_staked_today
      from public.duels
     where status = 'finished' and stake > 0 and answered_at >= p_day_start
       and ((challenger_id = v_duel.challenger_id and opponent_id = p_player_id)
         or (challenger_id = p_player_id and opponent_id = v_duel.challenger_id));
    if v_staked_today >= p_pair_daily_limit then
      return jsonb_build_object('status', 'refused', 'reason', 'daily_pair_limit');
    end if;
  end if;

  -- Step 8: the answerer's stake and envelope, and the finished duel. The wallet
  -- function raises insufficient_funds, which cancels the whole call: no envelope,
  -- and the duel stays open.
  v_ref := 'duel:' || p_duel_id::text;
  if v_duel.stake > 0 then
    perform public.apply_wallet_transaction(p_player_id, -v_duel.stake, 'arena_stake', v_ref);
  end if;

  for v_round in 1 .. v_duel.rounds loop
    insert into public.duel_moves (duel_id, player_id, round_no, signal, action_uid)
    values (p_duel_id, p_player_id, v_round, p_signals[v_round], p_action_uid);
  end loop;

  update public.duels
     set opponent_id   = p_player_id,
         status        = 'finished',
         outcome       = p_outcome,
         round_results = p_round_results,
         answered_at   = now(),
         closed_at     = now()
   where id = p_duel_id;

  -- Step 9: pay out. A draw returns each stake. Otherwise the winner takes the pot
  -- minus the cut, in whole coins, rounded down by integer division (for positive
  -- numbers). The cut gets no ledger row: it is simply not paid out.
  v_payout := 0;
  if v_duel.stake > 0 and p_outcome = 'draw' then
    perform public.apply_wallet_transaction(v_duel.challenger_id, v_duel.stake, 'arena_payout', v_ref);
    perform public.apply_wallet_transaction(p_player_id, v_duel.stake, 'arena_payout', v_ref);
  elsif v_duel.stake > 0 then
    v_payout := (2 * v_duel.stake * (100 - v_duel.cut_percent)) / 100;
    if p_outcome = 'challenger' then
      perform public.apply_wallet_transaction(v_duel.challenger_id, v_payout, 'arena_payout', v_ref);
    else
      perform public.apply_wallet_transaction(p_player_id, v_payout, 'arena_payout', v_ref);
    end if;
  end if;

  -- Step 10: the answerer's balance, for the answer of the server.
  select balance into v_balance from public.wallets where player_id = p_player_id;
  return jsonb_build_object('status', 'done', 'balance', v_balance, 'winnerTakes', v_payout);
end;
$$;

revoke all on function public.duel_answer(uuid, uuid, text[], text, text[], text, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.duel_answer(uuid, uuid, text[], text, text[], text, timestamptz, integer)
  to service_role;

comment on function public.duel_answer(uuid, uuid, text[], text, text[], text, timestamptz, integer) is
  'Answers a Lantern Duel challenge. The answer is the acceptance: in one step it locks the duel row, refuses a caller who sealed in this duel already (error 23505 already_applied), checks the state (duel_taken, duel_closed, no_such_duel for a named duel of somebody else, duel_expired by the database clock), checks the numbers it is given, locks both wallets in player-id order, refuses the pair limit (daily_pair_limit), takes the answerer stake (arena_stake), stores the answerer envelope, finishes the duel and pays out (arena_payout: a draw returns each stake, otherwise the winner takes 2 x stake x (100 - cut_percent) / 100 rounded down; the cut gets no ledger row). The round results and the outcome are an INPUT from Python (rules.resolve): the database never reads the challenger envelope and checks only what follows from the numbers (one signal and one result per round, results from the three allowed words, an outcome that fits the counted points). Returns {status: done, balance, winnerTakes}, or {status: refused, reason} with nothing changed. Raises insufficient_funds (from the wallet), wallet_not_found or bad_duel. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 8. Function duel_void(): withdraw, decline or expire a challenge
-- -----------------------------------------------------------------------------
-- Closes a challenge that nobody answered, and gives the challenger's stake back.
--
--   p_duel_id     the duel
--   p_player_id   the captain who asks
--   p_new_status  withdrawn (the challenger asks), declined (the named captain asks)
--                 or expired (anyone may ask, but only once expires_at has passed)
--
-- It returns a JSON object:
--   {"status": "done", "refunded": ..., "challengerBalance": ...}
--   {"status": "refused", "reason": ...} when a rule says no. Nothing was changed.
--       reason "no_such_duel"  no such duel
--       reason "duel_closed"   the duel is not open any more (it ended some other way)
--       reason "not_your_duel" only the challenger withdraws; only the named captain
--                              declines (and nobody declines an open challenge)
--       reason "not_expired"   the database clock says the window is not over yet
--
-- Real failures raise an error and change nothing:
--   * The same captain closing the duel the same way again (withdrawing a withdrawn
--     duel, declining a declined one): error code 23505, message already_applied.
--   * insufficient_funds, unknown_reason, wrong_direction: from the wallet function
--     (they cannot happen for a refund; they would be bugs).
--   * bad_duel: arguments that make no sense.
--
-- It locks the duel row first and then the challenger's wallet, the same order as
-- duel_answer(), so an answer and a withdrawal at the same moment end in order: the
-- later one finds a closed duel (duel_closed), and the coins follow whichever came
-- first.
--
-- It is not SECURITY DEFINER on purpose (see duel_create()).

create or replace function public.duel_void(
  p_duel_id    uuid,
  p_player_id  uuid,
  p_new_status text
)
returns jsonb
language plpgsql
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_duel    public.duels%rowtype;
  v_balance bigint;
begin
  -- Step 1: the arguments must make sense.
  if p_duel_id is null or p_player_id is null
     or p_new_status is null or p_new_status not in ('withdrawn', 'declined', 'expired') then
    raise exception 'bad_duel';
  end if;

  -- Step 2: lock the duel row until the end of this transaction.
  select * into v_duel from public.duels where id = p_duel_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_duel');
  end if;

  -- Step 3: a duel that is closed already. The same captain closing it the same way
  -- again is a repeat ("already applied", code 23505). Anything else is "closed".
  if v_duel.status <> 'open' then
    if v_duel.status = p_new_status
       and ((p_new_status = 'withdrawn' and v_duel.challenger_id = p_player_id)
         or (p_new_status = 'declined' and v_duel.opponent_id = p_player_id)) then
      raise exception 'already_applied' using errcode = '23505';
    end if;
    return jsonb_build_object('status', 'refused', 'reason', 'duel_closed');
  end if;

  -- Step 4: who asks. The database clock decides whether time is over.
  if p_new_status = 'withdrawn' and v_duel.challenger_id <> p_player_id then
    return jsonb_build_object('status', 'refused', 'reason', 'not_your_duel');
  end if;
  if p_new_status = 'declined'
     and (v_duel.is_open or v_duel.opponent_id is distinct from p_player_id) then
    return jsonb_build_object('status', 'refused', 'reason', 'not_your_duel');
  end if;
  if p_new_status = 'expired' and v_duel.expires_at > now() then
    return jsonb_build_object('status', 'refused', 'reason', 'not_expired');
  end if;

  -- Step 5: lock the challenger's wallet and give the stake back. This is the only
  -- stake that was taken, because the answerer pays only when they answer.
  select balance into v_balance
    from public.wallets where player_id = v_duel.challenger_id for update;

  if v_duel.stake > 0 then
    v_balance := public.apply_wallet_transaction(
      v_duel.challenger_id, v_duel.stake, 'arena_payout', 'duel:' || p_duel_id::text);
  end if;

  update public.duels set status = p_new_status, closed_at = now() where id = p_duel_id;

  return jsonb_build_object(
    'status', 'done',
    'refunded', v_duel.stake,
    'challengerBalance', v_balance
  );
end;
$$;

revoke all on function public.duel_void(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.duel_void(uuid, uuid, text)
  to service_role;

comment on function public.duel_void(uuid, uuid, text) is
  'Closes a Lantern Duel challenge that nobody answered and gives the challenger stake back. p_new_status is withdrawn (the challenger asks), declined (the named captain asks) or expired (anyone may ask, but only after expires_at by the database clock). In one step: locks the duel row, refuses a duel that is not open (the same captain closing it the same way again raises error 23505 already_applied, anything else is duel_closed), checks who asks (not_your_duel, not_expired), locks the challenger wallet, returns the stake with apply_wallet_transaction() (arena_payout, ref duel: and the duel id) and closes the duel. Returns {status: done, refunded, challengerBalance}, or {status: refused, reason: no_such_duel, duel_closed, not_your_duel or not_expired} with nothing changed. Raises bad_duel for arguments that make no sense. Only service_role may run it.';
