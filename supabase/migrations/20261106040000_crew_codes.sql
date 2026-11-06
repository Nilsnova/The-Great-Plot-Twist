-- =============================================================================
-- 20261106040000_crew_codes.sql
--
-- WHAT IT DOES
--   The database part of crews and seats (package A6). The foundation created the
--   tables crews and crew_seats and left the rules for later. This file adds a
--   crew code that a friend types to join, guards that keep the seats of a crew
--   safe, a counter for wrong codes, and four functions that are the only way the
--   server starts, joins and sails a crew.
--
--     crews.code           the crew code: 6 symbols, for example K7QF2M, unique
--     crews.version        counts the changes of a crew, so two requests cannot both
--                          act on the same old picture of it
--     crews.started_at     when the crew sailed (the muster)
--     crew_join_failures   one row for every wrong crew code a player typed
--
--     crew_create()        starts a crew with the player in seat 1
--     crew_find_by_code()  looks a crew up by its code and counts wrong guesses
--     crew_take_seat()     seats a friend in an empty seat, or in a partner's seat
--     crew_start()         the muster: seats an NPC partner in every empty seat
--
-- WHO USES IT
--   You run it once on the Supabase project, AFTER the foundation migration
--   (20261106000000_foundation.sql), because it changes the tables from there. The
--   steps are in supabase/README.md. After that the Python server
--   (backend/server/crews/) calls the four functions with the secret key. The
--   browser may only read the crews it sits in, as before.
--
-- THE RULES THAT THE DATABASE KEEPS
--   1. A crew has at most four seats, and a seat holds a player or an NPC partner
--      (the foundation already keeps that).
--   2. One player holds one seat in a crew, and one NPC partner sits once in a crew
--      (two new unique indexes).
--   3. A seat carries one of the four entry kits: true_keeper, witness, informant
--      or stranger. The kits are written the same way in
--      backend/server/crews/seats.py, and a test compares the two lists.
--   4. A crew code is 6 symbols from a list without 0, O, 1, I and L, and no two
--      crews share a code. A crew made before this file has no code.
--   5. A player sits in at most one open crew (forming or active), except for one
--      case: a player who started a crew and sits in it alone (a "draft") may join
--      another crew, and the draft is deleted in the same step.
--   6. A wrong code changes no crew and no seat. It only adds one row to
--      crew_join_failures. After too many wrong codes in a short time the player is
--      refused before the code is even looked at, so a guesser cannot find out
--      whether a guess was right.
--   7. Every function checks the version of the crew that the server read. If the
--      crew changed in between, the function does nothing and says "changed", and
--      the server reads the crew again. So the server always acts on the crew as
--      it is, never on an old picture of it.
--
--   WHAT THE SERVER DECIDES, AND THE DATABASE ONLY CHECKS: which seat a friend takes
--   and which kit each NPC partner carries (backend/server/crews/seats.py). The
--   database does not repeat those rules.
--
-- WHAT IT NEEDS
--   The foundation migration (tables profiles, crews and crew_seats). A Supabase
--   project has the roles anon, authenticated and service_role already.
--
-- SAFE TO RUN TWICE
--   Columns and indexes use "if not exists", rules are dropped and added again,
--   the table uses "if not exists", functions use "create or replace", and grants
--   and comments simply repeat. A second run changes nothing.
--
-- HOW THE FILE IS ORGANISED
--   1. New columns and rules on crews
--   2. New rules on crew_seats
--   3. Table crew_join_failures: the wrong codes
--   4. Function crew_create()
--   5. Function crew_find_by_code()
--   6. Function crew_take_seat()
--   7. Function crew_start()
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. New columns and rules on crews
-- -----------------------------------------------------------------------------
-- code: what a friend types to join. It stays empty for a crew that was made
-- before this file (only test crews), so such a crew cannot be joined by code.
-- version: counts the changes. The crew functions below change it with every join
-- and with the muster.
-- started_at: set by the muster, empty while the crew is forming.

alter table public.crews add column if not exists code text;
alter table public.crews add column if not exists version integer not null default 1;
alter table public.crews add column if not exists started_at timestamptz;

-- The pattern reads: from the start (^) to the end ($), exactly 6 symbols, each one of
-- A-Z without I, L and O, or 2-9. A missing (null) code passes this rule on purpose,
-- because a crew made before this file has none.
alter table public.crews drop constraint if exists crews_code_format;
alter table public.crews add constraint crews_code_format
  check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$');

alter table public.crews drop constraint if exists crews_version_positive;
alter table public.crews add constraint crews_version_positive
  check (version >= 1);

-- No two crews share a code. Many crews may have no code (null counts as different).
create unique index if not exists crews_code_unique
  on public.crews (code);

comment on table public.crews is
  'One row per crew: a team of up to four seats. Players can read only the crews they sit in. Only the server writes crews, and only through crew_create(), crew_find_by_code(), crew_take_seat() and crew_start() (a team rule, as with the wallet). Those functions make sure a player sits in at most one open crew.';
comment on column public.crews.code is
  'The crew code a friend types to join: 6 symbols from A-Z without I, L and O, and 2-9 (for example K7QF2M). Unique. Empty for a crew made before the crew codes existed, which cannot be joined by code.';
comment on column public.crews.version is
  'How many times the crew changed through the crew functions, starting at 1. A join or the muster works only if the server read the current version, so a request never acts on an old picture of the crew. Only the crew functions change it.';
comment on column public.crews.started_at is
  'When the muster happened and the crew became active. Empty while the crew is forming.';
comment on constraint crews_code_format on public.crews is
  'A crew code has exactly 6 symbols from A-Z without I, L and O, and 2-9. A missing code is allowed (a crew made before the codes existed).';
comment on constraint crews_version_positive on public.crews is
  'The version starts at 1 and only goes up.';
comment on index public.crews_code_unique is
  'No two crews share a crew code. Crews without a code do not count.';


-- -----------------------------------------------------------------------------
-- 2. New rules on crew_seats
-- -----------------------------------------------------------------------------
-- A seat carries one of the four entry kits. "not valid" means: the rule holds for
-- every new or changed row; rows written before this migration (only test rows)
-- are not checked again, so this file cannot fail on old test data.
alter table public.crew_seats drop constraint if exists crew_seats_kit_allowed;
alter table public.crew_seats add constraint crew_seats_kit_allowed
  check (kit is not null and kit in ('true_keeper', 'witness', 'informant', 'stranger')) not valid;

-- One player holds one seat in a crew. A seat with an NPC partner has no player and
-- does not count.
create unique index if not exists crew_seats_one_seat_per_player
  on public.crew_seats (crew_id, player_id) where player_id is not null;

-- One NPC partner sits once in a crew. A seat with a player has no partner and does
-- not count.
create unique index if not exists crew_seats_one_seat_per_partner
  on public.crew_seats (crew_id, npc_id) where npc_id is not null;

comment on table public.crew_seats is
  'One row per taken seat in a crew (seats 1 to 4). A seat holds a player or an NPC partner. Players can read the seats of the crews they sit in. Only the server writes seats, through the crew functions.';
comment on column public.crew_seats.kit is
  'The entry kit this seat carries: true_keeper, witness, informant or stranger. A player carries the kit of their own Act 1 ending, also after they take over a partner''s seat (a decision that still waits for Nils). An NPC partner carries a kit the players are missing. The rule is checked for every new or changed row.';
comment on constraint crew_seats_kit_allowed on public.crew_seats is
  'A seat carries one of the four kit ids. NOT VALID: rows written before this migration are not checked again; every new or changed row is.';
comment on index public.crew_seats_one_seat_per_player is
  'A player holds at most one seat in a crew.';
comment on index public.crew_seats_one_seat_per_partner is
  'An NPC partner sits at most once in a crew.';


-- -----------------------------------------------------------------------------
-- 3. Table crew_join_failures: the wrong codes
-- -----------------------------------------------------------------------------
-- One row for every wrong crew code that a player typed. crew_find_by_code() counts
-- the rows of the last few minutes and refuses a player who has typed too many wrong
-- codes. The count lives in the database, because every Vercel instance of the
-- server has its own memory, and a cold start empties it: a guesser who spreads
-- requests over several instances would get many times the limit.
--
-- Nobody reads this table except the server. There is no policy at all, so a
-- signed-in player sees no row. Rows older than the window are deleted by
-- crew_find_by_code() each time it runs.

create table if not exists public.crew_join_failures (
  id           bigint generated always as identity primary key,
  player_id    uuid not null references public.profiles (id) on delete cascade,
  attempted_at timestamptz not null default now()
);

-- Finds the recent wrong codes of one player fast. It also helps the database find a
-- player's rows when that player is deleted.
create index if not exists crew_join_failures_player_time_idx
  on public.crew_join_failures (player_id, attempted_at);

comment on table public.crew_join_failures is
  'One row for every wrong crew code a player typed. crew_find_by_code() counts the rows of the last few minutes to slow down guessing, and deletes older rows. Players cannot read it. Only the server uses it.';
comment on column public.crew_join_failures.id is
  'Running number. Nothing depends on its order.';
comment on column public.crew_join_failures.player_id is
  'The player who typed the wrong code. Deleting the player deletes this row.';
comment on column public.crew_join_failures.attempted_at is
  'When the wrong code was typed. Set by the database.';
comment on index public.crew_join_failures_player_time_idx is
  'The wrong codes of one player, oldest first.';

-- Row-level security without a policy: a signed-in player gets no row at all.
alter table public.crew_join_failures enable row level security;

-- The second lock, as in the foundation file. First take every right away, then give
-- back only what the server needs: it counts the rows, adds one for a wrong code and
-- deletes the old ones. Nobody changes a row.
revoke all on table public.crew_join_failures from public, anon, authenticated, service_role;

-- The counter behind the identity column "id". Nobody needs rights on it, but a
-- project that exposes new objects hands out rights on new sequences, and anyone who
-- could move the counter could break every later insert.
revoke all on sequence public.crew_join_failures_id_seq from public, anon, authenticated, service_role;

grant select, insert, delete on table public.crew_join_failures to service_role;


-- -----------------------------------------------------------------------------
-- 4. Function crew_create(): start a crew
-- -----------------------------------------------------------------------------
-- The server calls this when a player starts a crew. In ONE transaction it:
--
--   1. locks the player's profile row, so one player's requests happen one at a time
--      (a double click cannot start two crews),
--   2. looks for an open crew (forming or active) that the player already sits in:
--        * a crew that the player started, still forming, with only the player in
--          it (a "draft"): answers "existing" with that crew, and creates nothing,
--        * any other open crew: refuses with "already_in_crew",
--   3. refuses with "code_taken" if another crew has the code (the server then tries
--      a new code),
--   4. creates the crew (mode solo, status forming) and seat 1 for the player.
--
--   p_player_id  who starts the crew
--   p_code       the crew code the server made (6 symbols, see crews_code_format)
--   p_kit        the player's own kit, read from their entry profile
--
-- It returns a JSON object:
--   {"status": "created", "crewId": ...}    a new crew
--   {"status": "existing", "crewId": ...}   the player's draft, nothing changed
--   {"status": "missing"}                   the player has no profile
--   {"status": "refused", "reason": ...}    nothing changed
--       reason "already_in_crew"    the player sits in another open crew
--       reason "code_taken"         another crew has this code
--
-- A bad argument raises an error (bad_crew): it means the server and the database
-- disagree, which is a bug, not a refusal.
--
-- It is not SECURITY DEFINER on purpose. It runs with the rights of its caller, so a
-- player (who has no rights on these tables and no right to run it) is stopped even
-- if it were granted by mistake.

create or replace function public.crew_create(
  p_player_id uuid,
  p_code      text,
  p_kit       text
)
returns jsonb
language plpgsql
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_open    record;
  v_crew_id uuid;
begin
  -- Step 1: the arguments must make sense. A missing code would create a crew that
  -- nobody can join, because the code rule lets a missing code pass.
  if p_code is null or p_kit is null then
    raise exception 'bad_crew';
  end if;

  -- Step 2: lock the player's profile until the end of this transaction.
  perform 1 from public.profiles where id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'missing');
  end if;

  -- Step 3: an open crew that the player sits in already.
  select c.id         as id,
         c.status     as status,
         c.created_by as created_by,
         (select count(*) from public.crew_seats as s where s.crew_id = c.id) as seats
    into v_open
    from public.crew_seats as mine
    join public.crews as c on c.id = mine.crew_id
   where mine.player_id = p_player_id
     and c.status in ('forming', 'active')
   order by mine.joined_at desc
   limit 1;

  if found then
    if v_open.status = 'forming' and v_open.created_by = p_player_id and v_open.seats = 1 then
      return jsonb_build_object('status', 'existing', 'crewId', v_open.id);
    end if;
    return jsonb_build_object('status', 'refused', 'reason', 'already_in_crew');
  end if;

  -- Step 4: the code must be free.
  if exists (select 1 from public.crews where code = p_code) then
    return jsonb_build_object('status', 'refused', 'reason', 'code_taken');
  end if;

  -- Step 5: create the crew. If another player took the code a moment ago (the check
  -- above cannot see a crew that is not saved yet), "do nothing" leaves no row and the
  -- answer is the same refusal, so the server just tries a new code.
  insert into public.crews (created_by, mode, status, code)
  values (p_player_id, 'solo', 'forming', p_code)
  on conflict (code) do nothing
  returning id into v_crew_id;

  if v_crew_id is null then
    return jsonb_build_object('status', 'refused', 'reason', 'code_taken');
  end if;

  insert into public.crew_seats (crew_id, seat_no, player_id, kit)
  values (v_crew_id, 1, p_player_id, p_kit);

  return jsonb_build_object('status', 'created', 'crewId', v_crew_id);
end;
$$;

revoke all on function public.crew_create(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.crew_create(uuid, text, text)
  to service_role;

comment on function public.crew_create(uuid, text, text) is
  'Starts a crew: the crew (mode solo, status forming, with the code p_code) and seat 1 for the player with the kit p_kit, in one step, under a lock on the player''s profile. Returns {status: created, crewId}; {status: existing, crewId} if the player already started a crew and sits in it alone (nothing changes); {status: missing} if the player has no profile; or {status: refused, reason: already_in_crew or code_taken} with nothing changed. Raises bad_crew for a missing code or kit. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 5. Function crew_find_by_code(): look a crew up and count wrong guesses
-- -----------------------------------------------------------------------------
-- The server calls this when a player types a crew code. In ONE transaction it:
--
--   1. locks the player's profile row, so a burst of parallel guesses is counted
--      exactly,
--   2. deletes this player's wrong codes that are older than the window,
--   3. refuses with "too_many_attempts" if the player already has p_max_wrong_codes
--      wrong codes in the window. This happens BEFORE the code is looked at, so after
--      too many wrong guesses even a right code is refused, and a guesser cannot
--      tell whether a guess was right,
--   4. looks the crew up and answers with the crew and ALL its seats in one query (so
--      the crew and its seats are from the same moment),
--   5. if no crew has the code, adds one row to crew_join_failures and refuses with
--      "wrong_code". That row is the only change a wrong code causes.
--
--   p_player_id        who types the code
--   p_code             the crew code, already tidied up by the server
--   p_max_wrong_codes  how many wrong codes are allowed in the window
--   p_window_seconds   how long a wrong code counts, in seconds
--
-- It returns a JSON object:
--   {"status": "found", "crewId": ..., "crewStatus": ..., "version": ...,
--    "seats": [{"seatNo": ..., "playerId": ..., "npcId": ..., "kit": ...}, ...]}
--   {"status": "missing"}                   the player has no profile
--   {"status": "refused", "reason": ...}
--       reason "wrong_code"         no crew has this code (one row was added)
--       reason "too_many_attempts"  also "retryAfterSeconds", at least 1
--
-- A bad limit raises an error (bad_limits): a bug, not a refusal.
--
-- It is not SECURITY DEFINER on purpose, for the same reason as crew_create().

create or replace function public.crew_find_by_code(
  p_player_id       uuid,
  p_code            text,
  p_max_wrong_codes integer,
  p_window_seconds  integer
)
returns jsonb
language plpgsql
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_failures integer;
  v_oldest   timestamptz;
  v_wait     integer;
  v_found    jsonb;
begin
  -- Step 1: the limits must make sense.
  if p_max_wrong_codes is null or p_max_wrong_codes < 1
     or p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'bad_limits';
  end if;

  -- Step 2: lock the player's profile until the end of this transaction.
  perform 1 from public.profiles where id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'missing');
  end if;

  -- Step 3: forget the wrong codes that are older than the window.
  delete from public.crew_join_failures
   where player_id = p_player_id
     and attempted_at < now() - make_interval(secs => p_window_seconds);

  -- Step 4: too many wrong codes? Refuse before the code is looked at.
  select count(*), min(attempted_at)
    into v_failures, v_oldest
    from public.crew_join_failures
   where player_id = p_player_id;

  if v_failures >= p_max_wrong_codes then
    -- The oldest wrong code leaves the window at v_oldest plus the window. Wait until then.
    v_wait := greatest(
      1,
      ceil(extract(epoch from (v_oldest + make_interval(secs => p_window_seconds) - now())))::integer
    );
    return jsonb_build_object(
      'status', 'refused', 'reason', 'too_many_attempts', 'retryAfterSeconds', v_wait
    );
  end if;

  -- Step 5: the crew with its seats, in one query.
  select jsonb_build_object(
           'status', 'found',
           'crewId', c.id,
           'crewStatus', c.status,
           'version', c.version,
           'seats', coalesce(
             (select jsonb_agg(
                       jsonb_build_object(
                         'seatNo', s.seat_no,
                         'playerId', s.player_id,
                         'npcId', s.npc_id,
                         'kit', s.kit
                       )
                       order by s.seat_no
                     )
                from public.crew_seats as s
               where s.crew_id = c.id),
             '[]'::jsonb
           )
         )
    into v_found
    from public.crews as c
   where c.code = p_code;

  -- Step 6: no crew has the code. Count it, and say so.
  if v_found is null then
    insert into public.crew_join_failures (player_id) values (p_player_id);
    return jsonb_build_object('status', 'refused', 'reason', 'wrong_code');
  end if;

  return v_found;
end;
$$;

revoke all on function public.crew_find_by_code(uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.crew_find_by_code(uuid, text, integer, integer)
  to service_role;

comment on function public.crew_find_by_code(uuid, text, integer, integer) is
  'Looks a crew up by its code and counts wrong guesses, under a lock on the player''s profile. Deletes the player''s wrong codes older than p_window_seconds. If the player has p_max_wrong_codes wrong codes left, it refuses BEFORE it looks at the code: {status: refused, reason: too_many_attempts, retryAfterSeconds}. Otherwise returns {status: found, crewId, crewStatus, version, seats: [{seatNo, playerId, npcId, kit}]}, or, when no crew has the code, adds one row to crew_join_failures and returns {status: refused, reason: wrong_code}. Returns {status: missing} for a player without a profile. Raises bad_limits for a limit below 1. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 6. Function crew_take_seat(): seat a friend
-- -----------------------------------------------------------------------------
-- The server calls this when a friend joins a crew. The server has already read the
-- crew (crew_find_by_code) and decided which seat the friend takes and which kit the
-- seat carries. In ONE transaction this function:
--
--   1. locks the friend's profile row,
--   2. refuses if the friend already sits in this crew ("already_seated"),
--   3. looks at the other open crews of the friend. If they sit in an open crew that
--      they did not start, or in one that is already active, or in more than one,
--      it refuses with "already_in_crew". The one exception is a "draft": a crew that
--      the friend started, still forming, with only the friend in it. The friend may
--      leave a draft behind by joining another crew, so a player who pressed "start a
--      crew" by mistake is never stuck,
--   4. locks the target crew and the draft, always in the order of their ids, so two
--      requests never wait for each other in a circle,
--   5. checks again that the draft still has exactly one seat ("already_in_crew"),
--   6. checks the target crew: it must exist and not be finished ("crew_finished"),
--      and it must still have the version the server read ("changed"),
--   7. checks the seat: it must be empty or held by an NPC partner. A seat that a
--      player holds now means the crew changed ("changed"),
--   8. only now changes anything: deletes the draft (its seat goes with it), seats the
--      friend (a new row for an empty seat; for a partner's seat the row changes to the
--      friend, and the partner steps aside) and raises the version of the crew by one.
--      The crew becomes mode crew.
--
--   p_crew_id           the crew to join
--   p_player_id         the friend
--   p_seat_no           the seat, 1 to 4
--   p_kit               the kit the seat carries afterwards
--   p_expected_version  the version of the crew that the server read
--
-- All the refusals come BEFORE the first change, because a function that returns keeps
-- everything it has done so far. An error (a bad argument, a broken rule) cancels the
-- whole step instead.
--
-- It returns a JSON object:
--   {"status": "joined", "seatNo": ..., "replacedPartner": ...}  the NPC partner who stepped
--                                                                aside, or null for an empty seat
--   {"status": "missing"}                   the friend has no profile
--   {"status": "refused", "reason": ...}    nothing changed
--       reason "already_seated"     the friend sits in this crew already
--       reason "already_in_crew"    the friend sits in another open crew
--       reason "crew_finished"      the crew has finished
--       reason "changed"            the crew or the seat is not as the server read it
--
-- A bad argument raises an error (bad_seat): a bug, not a refusal.
--
-- It is not SECURITY DEFINER on purpose, for the same reason as crew_create().

create or replace function public.crew_take_seat(
  p_crew_id          uuid,
  p_player_id        uuid,
  p_seat_no          integer,
  p_kit              text,
  p_expected_version integer
)
returns jsonb
language plpgsql
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_other       record;
  v_draft_id    uuid;
  v_draft_seats integer;
  v_status      text;
  v_version     integer;
  v_seat_player uuid;
  v_seat_npc    text;
  v_seat_found  boolean;
begin
  -- Step 1: the arguments must make sense.
  if p_seat_no is null or p_seat_no < 1 or p_seat_no > 4
     or p_kit is null
     or p_expected_version is null or p_expected_version < 1 then
    raise exception 'bad_seat';
  end if;

  -- Step 2: lock the friend's profile until the end of this transaction.
  perform 1 from public.profiles where id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'missing');
  end if;

  -- Step 3: already in this crew?
  if exists (
    select 1 from public.crew_seats where crew_id = p_crew_id and player_id = p_player_id
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'already_seated');
  end if;

  -- Step 4: the other open crews of the friend. Only one draft is allowed.
  for v_other in
    select c.id as id, c.status as status, c.created_by as created_by
      from public.crew_seats as mine
      join public.crews as c on c.id = mine.crew_id
     where mine.player_id = p_player_id
       and c.status in ('forming', 'active')
  loop
    if v_other.status <> 'forming'
       or v_other.created_by <> p_player_id
       or v_draft_id is not null then
      return jsonb_build_object('status', 'refused', 'reason', 'already_in_crew');
    end if;
    v_draft_id := v_other.id;
  end loop;

  -- Step 5: lock the target crew and the draft, in the order of their ids. A null
  -- v_draft_id matches no row, so without a draft only the target is locked.
  perform 1
    from public.crews
   where id = p_crew_id or id = v_draft_id
   order by id
     for update;

  -- Step 6: the draft must still be a forming crew with the friend alone in it.
  if v_draft_id is not null then
    select count(*)
      into v_draft_seats
      from public.crew_seats as s
      join public.crews as c on c.id = s.crew_id
     where s.crew_id = v_draft_id
       and c.status = 'forming';
    if v_draft_seats <> 1 then
      return jsonb_build_object('status', 'refused', 'reason', 'already_in_crew');
    end if;
  end if;

  -- Step 7: the target crew.
  select status, version
    into v_status, v_version
    from public.crews
   where id = p_crew_id;

  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'changed');
  end if;
  if v_status = 'finished' then
    return jsonb_build_object('status', 'refused', 'reason', 'crew_finished');
  end if;
  if v_version <> p_expected_version then
    return jsonb_build_object('status', 'refused', 'reason', 'changed');
  end if;

  -- Step 8: the seat is empty (no row) or held by an NPC partner. A player in it means
  -- somebody else joined first.
  select player_id, npc_id
    into v_seat_player, v_seat_npc
    from public.crew_seats
   where crew_id = p_crew_id and seat_no = p_seat_no;
  v_seat_found := found;

  if v_seat_found and v_seat_player is not null then
    return jsonb_build_object('status', 'refused', 'reason', 'changed');
  end if;

  -- Step 9: from here on nothing is refused. Delete the draft (its seat goes with it).
  if v_draft_id is not null then
    delete from public.crews where id = v_draft_id;
  end if;

  -- Step 10: seat the friend.
  if v_seat_found then
    update public.crew_seats
       set player_id = p_player_id,
           npc_id    = null,
           kit       = p_kit,
           joined_at = now()
     where crew_id = p_crew_id and seat_no = p_seat_no;
  else
    insert into public.crew_seats (crew_id, seat_no, player_id, kit)
    values (p_crew_id, p_seat_no, p_player_id, p_kit);
  end if;

  -- Step 11: the crew has changed. More than one player sits in it now.
  update public.crews
     set mode = 'crew',
         version = version + 1
   where id = p_crew_id;

  return jsonb_build_object(
    'status', 'joined',
    'seatNo', p_seat_no,
    'replacedPartner', v_seat_npc
  );
end;
$$;

revoke all on function public.crew_take_seat(uuid, uuid, integer, text, integer)
  from public, anon, authenticated;
grant execute on function public.crew_take_seat(uuid, uuid, integer, text, integer)
  to service_role;

comment on function public.crew_take_seat(uuid, uuid, integer, text, integer) is
  'Seats a friend in seat p_seat_no of crew p_crew_id with the kit p_kit, in one step, under locks on the friend''s profile and on the crews involved (in the order of their ids). The seat must be empty or held by an NPC partner, and the crew must still have the version p_expected_version. A crew that the friend started and sits in alone (a draft) is deleted in the same step; any other open crew of the friend stops the join. Every refusal comes before the first change. Returns {status: joined, seatNo, replacedPartner} (the npc id that stepped aside, or null); {status: missing}; or {status: refused, reason: already_seated, already_in_crew, crew_finished or changed} with nothing changed. Raises bad_seat for a bad argument. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 7. Function crew_start(): the muster
-- -----------------------------------------------------------------------------
-- The server calls this when a crew sails. It has read the crew, and worked out which
-- NPC partner goes into which empty seat with which kit (backend/server/crews/seats.py).
-- In ONE transaction this function:
--
--   1. locks the crew,
--   2. refuses if the caller does not sit in it ("not_in_crew"),
--   3. refuses a crew that is already active ("already_started") or finished
--      ("crew_finished"), or that has changed since the server read it ("changed"),
--   4. seats the partners, one row for each entry of p_partners,
--   5. checks that the crew now has exactly four seats (the case always runs with
--      four), and
--   6. makes the crew active, stamps started_at and raises the version by one.
--
--   p_crew_id           the crew that sails
--   p_player_id         the player who asks (they must sit in the crew)
--   p_partners          a JSON list of {"seatNo": 2, "npcId": "deckhand", "kit": "informant"}
--   p_expected_version  the version of the crew that the server read
--
-- It returns a JSON object:
--   {"status": "started"}
--   {"status": "refused", "reason": ...}    nothing changed
--       reason "not_in_crew"        the caller does not sit in the crew
--       reason "already_started"    the crew is active already
--       reason "crew_finished"      the crew has finished
--       reason "changed"            the crew is gone or has another version
--
-- A bad argument, or a list that does not fill the crew to four seats, raises an error
-- (bad_muster) and cancels the whole step, including the partners already inserted.
--
-- It is not SECURITY DEFINER on purpose, for the same reason as crew_create().

create or replace function public.crew_start(
  p_crew_id          uuid,
  p_player_id        uuid,
  p_partners         jsonb,
  p_expected_version integer
)
returns jsonb
language plpgsql
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_status  text;
  v_version integer;
  v_seats   integer;
begin
  -- Step 1: the arguments must make sense.
  if p_expected_version is null or p_expected_version < 1
     or p_partners is null or jsonb_typeof(p_partners) <> 'array' then
    raise exception 'bad_muster';
  end if;

  -- Step 2: lock the crew until the end of this transaction.
  select status, version
    into v_status, v_version
    from public.crews
   where id = p_crew_id
     for update;

  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'changed');
  end if;

  -- Step 3: the caller must sit in the crew.
  if not exists (
    select 1 from public.crew_seats where crew_id = p_crew_id and player_id = p_player_id
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'not_in_crew');
  end if;

  -- Step 4: the crew must be forming, and as the server read it.
  if v_status = 'active' then
    return jsonb_build_object('status', 'refused', 'reason', 'already_started');
  end if;
  if v_status = 'finished' then
    return jsonb_build_object('status', 'refused', 'reason', 'crew_finished');
  end if;
  if v_version <> p_expected_version then
    return jsonb_build_object('status', 'refused', 'reason', 'changed');
  end if;

  -- Step 5: seat the partners.
  insert into public.crew_seats (crew_id, seat_no, npc_id, kit)
  select p_crew_id,
         (partner ->> 'seatNo')::smallint,
         partner ->> 'npcId',
         partner ->> 'kit'
    from jsonb_array_elements(p_partners) as partner;

  -- Step 6: the crew must have all four seats now. If not, the error cancels the partners.
  select count(*) into v_seats from public.crew_seats where crew_id = p_crew_id;
  if v_seats <> 4 then
    raise exception 'bad_muster';
  end if;

  -- Step 7: the crew sails.
  update public.crews
     set status = 'active',
         started_at = now(),
         version = version + 1
   where id = p_crew_id;

  return jsonb_build_object('status', 'started');
end;
$$;

revoke all on function public.crew_start(uuid, uuid, jsonb, integer)
  from public, anon, authenticated;
grant execute on function public.crew_start(uuid, uuid, jsonb, integer)
  to service_role;

comment on function public.crew_start(uuid, uuid, jsonb, integer) is
  'The muster: seats the NPC partners of p_partners (a JSON list of {seatNo, npcId, kit}) in a forming crew that the caller sits in and that still has the version p_expected_version, then makes the crew active, stamps started_at and raises the version, all in one step under a lock on the crew. The crew must have exactly four seats afterwards, or the whole step is cancelled with bad_muster. Returns {status: started}, or {status: refused, reason: not_in_crew, already_started, crew_finished or changed} with nothing changed. Raises bad_muster for a bad argument or a list that does not fill the crew. Only service_role may run it.';
