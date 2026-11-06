-- =============================================================================
-- 20261106030000_entry_profiles.sql
--
-- WHAT IT DOES
--   The database part of package A3 (the referee and the entry kits). It adds one
--   table and one function.
--
--     entry_profiles    one row per player who finished Act 1: how the story
--                       ended, what the player decided, and the entry kit they
--                       got (with its start place and coins)
--
--     grant_entry_kit() stores that row and pays the kit coins, once
--
-- WHO USES IT
--   You run it once on the Supabase project, AFTER the foundation migration
--   (20261106000000_foundation.sql), because it uses the tables profiles and
--   wallet_transactions, the wallet reason kit_grant and the function
--   apply_wallet_transaction() from there. The steps are in supabase/README.md.
--   Run it BEFORE the branch that reads GET /api/me is merged into main: that
--   route is live today and now reads this table, a merge deploys to production
--   at once, and previews share the same database. Until the table exists, every
--   player gets 502 database_error there. After that the Python server
--   (backend/server/game/) calls grant_entry_kit() with the secret key, and the
--   browser may only read its own row.
--
-- THE RULES THAT THE DATABASE KEEPS
--   1. The browser never writes. The server replays the move log of Act 1 with the
--      story engine, works out the ending, the decision and the kit itself, and
--      only then calls grant_entry_kit(). The server takes the player id from the
--      verified login, never from the request.
--   2. One entry profile per player, written once, never changed. The first
--      ending counts: playing Act 1 again changes nothing and pays nothing.
--      (PENDING Nils' decision N6, decision D019 in docs/DECISIONS.md.)
--   3. The kit coins are paid once, inside grant_entry_kit(), through
--      apply_wallet_transaction() with the reason kit_grant and the fixed ref kit.
--      The profile and the payment are one step: either both are saved or neither.
--      The unique index of the ledger (player, reason, ref) is the last guard.
--   4. A profile holds only values the game knows: one of four kit ids, one of
--      three decisions, a move count of 1 to 300, coins within the limits of a wallet
--      change, ids in the usual format, and the SHA-256 of the story file that the
--      replay used.
--   5. Deleting a player deletes the profile (cascade), so "delete my data" stays
--      complete (decision D018).
--   6. Someone who is not signed in (role "anon") gets nothing at all.
--
-- WHAT IT NEEDS
--   The foundation migration. A Supabase project has the roles anon,
--   authenticated and service_role and the table auth.users already.
--
-- SAFE TO RUN TWICE
--   The table uses "if not exists", the policy is dropped and created again, the
--   function uses "create or replace", and grants and comments simply repeat. A
--   second run changes nothing.
--
-- HOW THE FILE IS ORGANISED
--   1. Table entry_profiles
--   2. Row-level security and rights for entry_profiles
--   3. Function grant_entry_kit()
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Table entry_profiles: how Act 1 ended for a player
-- -----------------------------------------------------------------------------
-- One row per player, written once by grant_entry_kit(). The primary key is the
-- player id, so a second row for the same player is impossible: the database
-- itself guards the rule "the first ending counts", even if the Python has a bug.
--
-- The values come from the server's replay of the player's move log, never from
-- the browser. The checks below do not repeat the story: they only make sure that
-- a row holds values of the right kind. The server decides which ending leads to
-- which kit (backend/content/entry_kits.json).
--
-- Rows disappear only when their player is deleted (cascade).

create table if not exists public.entry_profiles (
  player_id    uuid primary key references public.profiles (id) on delete cascade,
  ending       text not null,
  decision     text not null,
  read_log     boolean not null,
  kit          text not null,
  start_place  text not null,
  kit_coins    bigint not null,
  move_count   integer not null,
  story_sha256 text not null,
  created_at   timestamptz not null default now(),

  -- The pattern reads: from the start (^) to the end ($), 2 to 40 characters, each
  -- one of: a-z, 0-9, underscore. The same rule as an id in entry_kits.json.
  constraint entry_profiles_ending_format
    check (ending ~ '^[a-z0-9_]{2,40}$'),
  -- What the player decided at the shore: warned the harbor master, trusted the
  -- fisherman, or took no side.
  constraint entry_profiles_decision_allowed
    check (decision in ('warned', 'trusted', 'none')),
  -- The four entry kits. A later migration (the crews) repeats this list for the
  -- seats of a crew, and a test compares the lists with entry_kits.json.
  constraint entry_profiles_kit_allowed
    check (kit in ('true_keeper', 'witness', 'informant', 'stranger')),
  constraint entry_profiles_start_place_format
    check (start_place ~ '^[a-z0-9_]{2,40}$'),
  -- The same limits as a wallet change (MAX_DELTA in backend/server/wallet.py): more
  -- than 0 and at most one million coins.
  constraint entry_profiles_kit_coins_range
    check (kit_coins between 1 and 1000000),
  -- The referee replays at most 300 moves (MAX_MOVES in backend/server/game/referee.py).
  constraint entry_profiles_move_count_range
    check (move_count between 1 and 300),
  -- A SHA-256 hash written as 64 hexadecimal characters.
  constraint entry_profiles_story_sha256_format
    check (story_sha256 ~ '^[0-9a-f]{64}$')
);

comment on table public.entry_profiles is
  'One row per player who finished Act 1: how the story ended, what the player decided and which entry kit they got. Written once by grant_entry_kit() from the server replay of the move log. The first ending counts. Players can read their own row. Nobody changes or deletes a row, except by deleting the player.';
comment on column public.entry_profiles.player_id is
  'The player this profile belongs to. It is also the primary key, so there is exactly one profile per player. Deleting the player deletes this row.';
comment on column public.entry_profiles.ending is
  'The id of the Act 1 ending scene the replay reached, for example ending_trapped.';
comment on column public.entry_profiles.decision is
  'What the player decided at the shore: warned (told the harbor master), trusted (told the fisherman) or none (took no side).';
comment on column public.entry_profiles.read_log is
  'True if the player read the last entry in the keeper logbook. It gives the log card on the case board.';
comment on column public.entry_profiles.kit is
  'The entry kit: true_keeper, witness, informant or stranger. It follows from the ending and the decision, worked out by the server.';
comment on column public.entry_profiles.start_place is
  'The id of the place where the player starts the case. It comes with the kit and is a place of the browser registry.';
comment on column public.entry_profiles.kit_coins is
  'The coins that came with the kit, as paid through the reason kit_grant. Kept here so the answer stays the same even if the kit file changes later.';
comment on column public.entry_profiles.move_count is
  'How many moves the replayed move log had, from 1 to 300.';
comment on column public.entry_profiles.story_sha256 is
  'The SHA-256 of the story file the replay used, as 64 hexadecimal characters. Kept for audits. The browser does not send it.';
comment on column public.entry_profiles.created_at is
  'When the profile was written. Set by the database.';


-- -----------------------------------------------------------------------------
-- 2. Row-level security and rights for entry_profiles
-- -----------------------------------------------------------------------------
-- Same plan as the other tables: the policy is a read policy for "authenticated"
-- (a signed-in player). There is no policy for insert, update or delete, so no
-- player can write. "anon" has no policy, so it gets nothing.

alter table public.entry_profiles enable row level security;

drop policy if exists "Players can read their own entry profile" on public.entry_profiles;
create policy "Players can read their own entry profile"
  on public.entry_profiles for select to authenticated
  using (player_id = (select auth.uid()));
comment on policy "Players can read their own entry profile" on public.entry_profiles is
  'A signed-in player may read only their own entry profile. Nobody except the server can add rows.';

-- The second lock: take every right away, then give back only what each role
-- needs.
--
--   anon           nothing
--   authenticated  read only (RLS then limits the rows to the player's own)
--   service_role   the server: read and insert. A profile is written once, so no
--                  update and no delete; the row goes only with its player, by cascade.

revoke all on table public.entry_profiles from public, anon, authenticated, service_role;
grant select on table public.entry_profiles to authenticated;
grant select, insert on table public.entry_profiles to service_role;


-- -----------------------------------------------------------------------------
-- 3. Function grant_entry_kit(): store the profile and pay the kit, once
-- -----------------------------------------------------------------------------
-- The server calls this after the referee has replayed the move log and found the
-- kit. Everything is already worked out; this function only stores it and pays.
--
--   p_player_id     whose profile it is
--   p_ending        the Act 1 ending scene the replay reached
--   p_decision      warned, trusted or none
--   p_read_log      true if the player read the logbook
--   p_kit           true_keeper, witness, informant or stranger
--   p_start_place   where the kit starts the player
--   p_kit_coins     the coins of the kit
--   p_move_count    how many moves the log had
--   p_story_sha256  the SHA-256 of the story file the replay used
--
-- In this order:
--
--   1. The player's profile row is locked (FOR NO KEY UPDATE), so two requests of
--      one player run one after the other. A second request waits here, then finds
--      the entry profile of the first. No such player: {"status": "missing"}.
--
--      Why not FOR UPDATE: this function locks the profile first and the wallet
--      second (inside apply_wallet_transaction), while market_trade() locks the
--      wallet first and then adds rows that point at the profile. FOR UPDATE
--      blocks those foreign-key checks, so the two could wait for each other in a
--      circle. FOR NO KEY UPDATE still makes two grants run one after the other
--      but lets the foreign-key checks through, so there is no circle.
--   2. An entry profile exists already: nothing is written and nothing is paid. The
--      answer is the STORED profile, whatever this call was given. The first ending
--      counts. (PENDING Nils' decision N6.)
--   3. Otherwise the profile is stored and the kit coins are paid through the wallet
--      function, with the reason kit_grant and the fixed ref kit. Both happen in
--      this one transaction. If the payment fails, for example because the player
--      has no wallet, the profile is not stored either.
--
--      One exception: if the ledger already has a kit_grant row with the ref kit for
--      this player, the profile is stored but nothing is paid again. Only test users
--      from the manual test plan have such a row (they were paid by hand), and the
--      ledger would refuse a second payment anyway.
--
-- It returns a JSON object:
--   {"status": "granted" or "stored", "paid": ..., "ending": ..., "decision": ...,
--    "readLog": ..., "kit": ..., "startPlace": ..., "kitCoins": ...}
--     "granted"  this call stored the profile. "paid" is the coins it paid.
--     "stored"   the profile existed already. "paid" is 0. The other values are the
--                stored ones.
--   {"status": "missing"}   the player has no profile row
--
-- A value that breaks a table rule (a kit id that does not exist, a move count of
-- 0) stops the call with a constraint error and changes nothing: the server checks
-- all of them first, so it is a bug on the server side, not something a player can
-- cause. The wallet function can also raise (wallet_not_found, wrong_direction,
-- unknown_reason), with the same effect.
--
-- It is not SECURITY DEFINER on purpose. It runs with the rights of its caller, so
-- a player (who may write nothing here) is stopped even if the function were
-- granted to them by mistake.

create or replace function public.grant_entry_kit(
  p_player_id    uuid,
  p_ending       text,
  p_decision     text,
  p_read_log     boolean,
  p_kit          text,
  p_start_place  text,
  p_kit_coins    bigint,
  p_move_count   integer,
  p_story_sha256 text
)
returns jsonb
language plpgsql
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_profile public.entry_profiles;
  v_status  text;
  v_paid    bigint := 0;
begin
  -- Step 1: lock the player's profile row, so two requests of one player cannot
  -- both store a profile and both pay. FOR NO KEY UPDATE, not FOR UPDATE: see
  -- the note above the function.
  perform 1
     from public.profiles
    where id = p_player_id
      for no key update;

  if not found then
    return jsonb_build_object('status', 'missing');
  end if;

  -- Step 2: is there a profile already? Then it stays as it is.
  select *
    into v_profile
    from public.entry_profiles
   where player_id = p_player_id;

  if found then
    v_status := 'stored';
  else
    -- Step 3: the first time. Store the profile, then pay.
    insert into public.entry_profiles (
      player_id, ending, decision, read_log, kit, start_place, kit_coins, move_count, story_sha256
    )
    values (
      p_player_id, p_ending, p_decision, p_read_log, p_kit, p_start_place, p_kit_coins,
      p_move_count, p_story_sha256
    )
    returning * into v_profile;

    v_status := 'granted';

    -- The kit coins, once. The ledger holds each player, reason and ref only once,
    -- so a second payment would fail. A player who was paid by hand has the row
    -- already (see the note above), and then only the profile is stored.
    if not exists (
      select 1
        from public.wallet_transactions
       where player_id = p_player_id
         and reason = 'kit_grant'
         and ref = 'kit'
    ) then
      perform public.apply_wallet_transaction(p_player_id, p_kit_coins, 'kit_grant', 'kit');
      v_paid := p_kit_coins;
    end if;
  end if;

  return jsonb_build_object(
    'status', v_status,
    'paid', v_paid,
    'ending', v_profile.ending,
    'decision', v_profile.decision,
    'readLog', v_profile.read_log,
    'kit', v_profile.kit,
    'startPlace', v_profile.start_place,
    'kitCoins', v_profile.kit_coins
  );
end;
$$;

revoke all on function public.grant_entry_kit(uuid, text, text, boolean, text, text, bigint, integer, text)
  from public, anon, authenticated;
grant execute on function public.grant_entry_kit(uuid, text, text, boolean, text, text, bigint, integer, text)
  to service_role;

comment on function public.grant_entry_kit(uuid, text, text, boolean, text, text, bigint, integer, text) is
  'Stores the entry profile of a player and pays the kit coins, once. Locks the player profile row first. If an entry profile exists already, changes nothing, pays nothing and returns the stored one with status stored (the first ending counts). Otherwise stores the profile and pays p_kit_coins through apply_wallet_transaction() with the reason kit_grant and the ref kit, in one transaction, and returns status granted; if the ledger already has that kit_grant row (a test user paid by hand), the profile is stored and nothing is paid. Returns {status: granted or stored, paid, ending, decision, readLog, kit, startPlace, kitCoins}, or {status: missing} when the player has no profile. A value that breaks a table rule, or a failing wallet call, raises an error and changes nothing. Only service_role may run it.';
