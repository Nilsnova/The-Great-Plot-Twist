-- =============================================================================
-- 20261109010000_demo_window.sql
--
-- WHAT IT DOES
--   The database part of the class demo (checkpoint C0 of G29, decision D029).
--   It adds three tables and three functions.
--
--     demo_window           one row: until when guests may play. Empty (null)
--                           means the demo is closed.
--     demo_window_actions   one row per switch of the window by a host, so a
--                           repeated click with the same actionUid changes
--                           nothing the second time
--     demo_lock_attempts    one row per answer a player gave at the Keeper's
--                           Lock, so a repeated answer with the same actionUid
--                           gets the first verdict back
--
--     demo_window_set()     opens the window for 1 to 6 hours, or closes it
--                           (0 hours), once per host and actionUid
--     demo_window_read()    the window as it is now, for the server's demo gate
--     demo_lock_record()    stores a verdict of the Keeper's Lock, once per player
--                           and actionUid
--
-- WHO USES IT
--   Only the Python server, with the secret key (service_role). The host routes
--   GET and POST /api/host/demo switch the window; every guest request reads it
--   through the demo gate (backend/server/demo/gate.py); the routes GET /api/lock
--   and POST /api/lock/answer store and read the lock verdicts. The browser never
--   reads or writes these tables: they have row-level security and no policy.
--   Run it after the foundation, accounts and entry kit migrations
--   (20261106000000, 20261106020000, 20261106030000).
--
-- THE RULES THAT THE DATABASE KEEPS
--   1. The window is one row (name class_demo). A host may open it for at most
--      6 hours. The server checks the host list (HOST_PLAYER_IDS) before it calls.
--   2. A host's actionUid is used once. A repeat answers with the window as it is
--      now and changes nothing.
--   3. A lock verdict is worked out by the server (the live weather of the
--      player's place). The database stores only the answer id, whether it was
--      accepted and why. It never stores the place, the coordinates or the
--      weather reading.
--   4. A player's actionUid at the lock is used once: a repeat gets the stored
--      verdict back. A player may store at most 40 lock answers.
--   5. Nothing here moves coins. No wallet reason is added or written.
--   6. Deleting a player deletes their lock answers and their window switches
--      (cascade). The window row itself only forgets who switched it last.
--   7. Someone who is not signed in (role "anon") and signed-in players
--      ("authenticated", which includes Supabase's anonymous guests) get nothing.
--
-- WHAT IT NEEDS
--   The table public.profiles from the foundation migration. A Supabase project
--   has the roles anon, authenticated and service_role already.
--
-- SAFE TO RUN TWICE
--   Tables use "if not exists", the window row is added with "on conflict do
--   nothing", functions use "create or replace", and revokes, grants and
--   comments simply repeat. A second run changes nothing.
--
-- HOW THE FILE IS ORGANISED
--   1. Table demo_window, its one row, rights
--   2. Table demo_window_actions, rights
--   3. Table demo_lock_attempts, rights
--   4. Function demo_window_set()
--   5. Function demo_window_read()
--   6. Function demo_lock_record()
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Table demo_window: until when guests may play
-- -----------------------------------------------------------------------------
-- Exactly one row, named class_demo. open_until is the end of the window; null
-- means closed. A time in the past also means closed: the server compares it with
-- the database clock (demo_window_read), so nobody has to close a window by hand.

create table if not exists public.demo_window (
  name        text primary key,
  open_until  timestamptz,
  changed_by  uuid references public.profiles (id) on delete set null,
  changed_at  timestamptz not null default now(),

  -- One row only: the class demo.
  constraint demo_window_one_row
    check (name = 'class_demo')
);

insert into public.demo_window (name, open_until)
values ('class_demo', null)
on conflict (name) do nothing;

comment on table public.demo_window is
  'One row (class_demo): until when anonymous guests may use the API. open_until null or in the past means closed. Written only by demo_window_set(). No browser access.';
comment on column public.demo_window.name is
  'Always class_demo. The check demo_window_one_row allows no other row.';
comment on column public.demo_window.open_until is
  'The end of the demo window, or null when a host closed it. A time in the past means closed as well.';
comment on column public.demo_window.changed_by is
  'The host who switched the window last. Empty when nobody has yet, or when that host deleted their account.';
comment on column public.demo_window.changed_at is
  'When the window was switched last. Set by the database.';

-- Row-level security on and no policy at all: no browser role can see the row.
-- Rights: take everything away, then give the server only what it needs.
--   anon, authenticated  nothing
--   service_role         read, and update the one row (through demo_window_set)
alter table public.demo_window enable row level security;
revoke all on table public.demo_window from public, anon, authenticated, service_role;
grant select, update on table public.demo_window to service_role;


-- -----------------------------------------------------------------------------
-- 2. Table demo_window_actions: one row per switch, for safe repeats
-- -----------------------------------------------------------------------------
-- The primary key is the host and the actionUid the browser made for the click,
-- so the same click can never switch the window twice.

create table if not exists public.demo_window_actions (
  host_id     uuid not null references public.profiles (id) on delete cascade,
  action_uid  uuid not null,
  hours       integer not null,
  open_until  timestamptz,
  created_at  timestamptz not null default now(),
  primary key (host_id, action_uid),

  -- 0 closes the window; 1 to 6 opens it for that many hours.
  constraint demo_window_actions_hours_range
    check (hours between 0 and 6),
  -- Closing leaves no end time; opening always has one.
  constraint demo_window_actions_until_matches
    check ((hours = 0) = (open_until is null))
);

comment on table public.demo_window_actions is
  'One row per switch of the demo window by a host: the hours asked for and the end time it set. Makes a repeated click safe. Removed with the host account. No browser access.';
comment on column public.demo_window_actions.host_id is
  'The verified host who switched the window. The server checks HOST_PLAYER_IDS before it calls.';
comment on column public.demo_window_actions.action_uid is
  'The id the browser made for the click. Used once per host.';
comment on column public.demo_window_actions.hours is
  'The hours asked for: 0 closes the window, 1 to 6 opens it.';
comment on column public.demo_window_actions.open_until is
  'The end time this switch set, or null when it closed the window.';
comment on column public.demo_window_actions.created_at is
  'When the switch happened. Set by the database.';

alter table public.demo_window_actions enable row level security;
revoke all on table public.demo_window_actions from public, anon, authenticated, service_role;
grant select, insert on table public.demo_window_actions to service_role;


-- -----------------------------------------------------------------------------
-- 3. Table demo_lock_attempts: the answers a player gave at the Keeper's Lock
-- -----------------------------------------------------------------------------
-- One row per answer. The server works the verdict out (outcome) and stores it
-- with the answer id. No place, coordinates or weather are kept: the lock asks
-- about the sky where the player is, and that place is never stored.
--
-- The outcomes:
--   exact, close, hint, clue        accepted: the lock opened (the right sky, the
--                                   sky one step away, the hint path, the clue)
--   wrong                           refused: another sky
--   hint_too_early                  refused: the hint before one honest try
--   hint_offered                    refused for now: the hint's second prompt
--   question_changed                refused: an answer to a question the server
--                                   no longer asks (the weather came or went)

create table if not exists public.demo_lock_attempts (
  player_id   uuid not null references public.profiles (id) on delete cascade,
  action_uid  text not null,
  answer      text not null,
  outcome     text not null,
  accepted    boolean not null,
  created_at  timestamptz not null default now(),
  primary key (player_id, action_uid),

  -- The same rule as every actionUid the browser makes: 8 to 64 of A-Z a-z 0-9 _ -.
  constraint demo_lock_attempts_action_uid_format
    check (action_uid ~ '^[A-Za-z0-9_-]{8,64}$'),
  -- An answer id: a sky (clear, cloudy, rain, fog, snow), a clue choice, hint or
  -- hint_confirm. Lowercase letters and underscores, 2 to 20 characters.
  constraint demo_lock_attempts_answer_format
    check (answer ~ '^[a-z_]{2,20}$'),
  constraint demo_lock_attempts_outcome_allowed
    check (outcome in ('exact', 'close', 'hint', 'clue', 'wrong', 'hint_too_early',
                       'hint_offered', 'question_changed')),
  -- Accepted exactly for the four outcomes that open the lock.
  constraint demo_lock_attempts_accepted_matches
    check (accepted = (outcome in ('exact', 'close', 'hint', 'clue')))
);

comment on table public.demo_lock_attempts is
  'One row per answer a player gave at the Keeper''s Lock: the answer id, the verdict the server worked out and whether it opened the lock. Never a place, coordinates or weather. A repeated actionUid gets the stored verdict back. Removed with the player. No browser access.';
comment on column public.demo_lock_attempts.player_id is
  'The player who answered. Deleting the player deletes the row.';
comment on column public.demo_lock_attempts.action_uid is
  'The id the browser made for the answer. Used once per player.';
comment on column public.demo_lock_attempts.answer is
  'The answer id: clear, cloudy, rain, fog, snow, a clue choice, hint or hint_confirm.';
comment on column public.demo_lock_attempts.outcome is
  'The verdict of the server: exact, close, hint or clue (accepted), or wrong, hint_too_early, hint_offered or question_changed (refused).';
comment on column public.demo_lock_attempts.accepted is
  'True when this answer opened the lock. Follows from the outcome (check demo_lock_attempts_accepted_matches).';
comment on column public.demo_lock_attempts.created_at is
  'When the answer was stored. Set by the database.';

alter table public.demo_lock_attempts enable row level security;
revoke all on table public.demo_lock_attempts from public, anon, authenticated, service_role;
grant select, insert on table public.demo_lock_attempts to service_role;


-- -----------------------------------------------------------------------------
-- 4. Function demo_window_set(): open the window for some hours, or close it
-- -----------------------------------------------------------------------------
--   p_host_id     the verified host (the server checked HOST_PLAYER_IDS)
--   p_action_uid  the id the browser made for the click
--   p_hours       0 closes the window, 1 to 6 opens it from now for that long
--
-- A repeat of the same host and actionUid changes nothing and answers with the
-- window as it is now and "repeat": true. Hours outside 0 to 6, or a missing
-- argument, raise bad_demo_window with nothing changed (the server checks first,
-- so that is a bug on the server side).
--
-- It returns {"status": "set", "openUntil": <time or null>, "repeat": true or false}.
--
-- It runs with the rights of its caller (not SECURITY DEFINER) and only
-- service_role may run it.

create or replace function public.demo_window_set(
  p_host_id    uuid,
  p_action_uid uuid,
  p_hours      integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_until timestamptz;
begin
  if p_host_id is null or p_action_uid is null or p_hours is null
     or p_hours < 0 or p_hours > 6 then
    raise exception 'bad_demo_window';
  end if;

  -- Two switches at the same moment run one after the other.
  perform 1 from public.demo_window where name = 'class_demo' for update;

  if exists (
    select 1 from public.demo_window_actions
     where host_id = p_host_id and action_uid = p_action_uid
  ) then
    select open_until into v_until from public.demo_window where name = 'class_demo';
    return jsonb_build_object('status', 'set', 'openUntil', v_until, 'repeat', true);
  end if;

  if p_hours = 0 then
    v_until := null;
  else
    v_until := now() + make_interval(hours => p_hours);
  end if;

  update public.demo_window
     set open_until = v_until, changed_by = p_host_id, changed_at = now()
   where name = 'class_demo';

  insert into public.demo_window_actions (host_id, action_uid, hours, open_until)
  values (p_host_id, p_action_uid, p_hours, v_until);

  return jsonb_build_object('status', 'set', 'openUntil', v_until, 'repeat', false);
end;
$$;

revoke all on function public.demo_window_set(uuid, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.demo_window_set(uuid, uuid, integer) to service_role;

comment on function public.demo_window_set(uuid, uuid, integer) is
  'Opens the demo window for 1 to 6 hours from now, or closes it (0 hours), once per host and actionUid. A repeat changes nothing and returns the current window with repeat true. Returns {status: set, openUntil, repeat}. Raises bad_demo_window for hours outside 0 to 6. Never moves coins. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 5. Function demo_window_read(): the window as it is now
-- -----------------------------------------------------------------------------
-- Compares the end time with the database clock, so every server instance agrees
-- on "open" even if their own clocks differ a little.
--
-- It returns {"open": true or false, "openUntil": <time or null>}. openUntil is
-- null when the window is closed, also when its end time has passed.

create or replace function public.demo_window_read()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'open', coalesce(open_until > now(), false),
    'openUntil', case when open_until > now() then open_until end
  )
  from public.demo_window
  where name = 'class_demo';
$$;

revoke all on function public.demo_window_read() from public, anon, authenticated, service_role;
grant execute on function public.demo_window_read() to service_role;

comment on function public.demo_window_read() is
  'The demo window now: {open, openUntil}. Open only while open_until lies in the future by the database clock; openUntil is null when closed. Reads only. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 6. Function demo_lock_record(): store a verdict of the Keeper's Lock, once
-- -----------------------------------------------------------------------------
--   p_player_id   the verified player
--   p_action_uid  the id the browser made for the answer
--   p_answer      the answer id
--   p_outcome     the verdict the server worked out (see section 3)
--
-- In this order:
--   1. The player's profile row is locked (FOR NO KEY UPDATE, as grant_entry_kit
--      does), so two answers of one player are stored one after the other. No
--      such player: {"status": "missing"}.
--   2. The actionUid was used already: nothing is stored and the STORED answer
--      and verdict come back with status repeat.
--   3. The player has 40 answers stored already: {"status": "full"}.
--   4. Otherwise the answer is stored: status recorded.
--
-- It returns {"status": "recorded" or "repeat", "answer": ..., "outcome": ...,
-- "accepted": ...}, or {"status": "missing"} or {"status": "full"}. A value that
-- breaks a table rule raises an error with nothing stored.

create or replace function public.demo_lock_record(
  p_player_id  uuid,
  p_action_uid text,
  p_answer     text,
  p_outcome    text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.demo_lock_attempts;
begin
  perform 1 from public.profiles where id = p_player_id for no key update;
  if not found then
    return jsonb_build_object('status', 'missing');
  end if;

  select * into v_row
    from public.demo_lock_attempts
   where player_id = p_player_id and action_uid = p_action_uid;

  if found then
    return jsonb_build_object(
      'status', 'repeat', 'answer', v_row.answer, 'outcome', v_row.outcome,
      'accepted', v_row.accepted
    );
  end if;

  if (select count(*) from public.demo_lock_attempts where player_id = p_player_id) >= 40 then
    return jsonb_build_object('status', 'full');
  end if;

  insert into public.demo_lock_attempts (player_id, action_uid, answer, outcome, accepted)
  values (p_player_id, p_action_uid, p_answer, p_outcome,
          p_outcome in ('exact', 'close', 'hint', 'clue'))
  returning * into v_row;

  return jsonb_build_object(
    'status', 'recorded', 'answer', v_row.answer, 'outcome', v_row.outcome,
    'accepted', v_row.accepted
  );
end;
$$;

revoke all on function public.demo_lock_record(uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.demo_lock_record(uuid, text, text, text) to service_role;

comment on function public.demo_lock_record(uuid, text, text, text) is
  'Stores one Keeper''s Lock answer and the verdict the server worked out, once per player and actionUid. Locks the player profile first. A repeat returns the stored answer and verdict with status repeat; a player with 40 stored answers gets status full; a player with no profile gets status missing. Stores no place or weather and never moves coins. Only service_role may run it.';
