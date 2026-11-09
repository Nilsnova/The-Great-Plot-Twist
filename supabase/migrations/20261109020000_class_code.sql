-- =============================================================================
-- 20261109020000_class_code.sql
--
-- WHAT IT DOES
--   The class code of the class demo (G29, decision D030). It replaces the
--   host's on/off demo window: Supabase anonymous sign-ins stay switched on for
--   good, and a guest (an anonymous user) may play only after they presented the
--   current class code (from the projector QR or typed under Join).
--
--   It adds three tables and six functions, and it rewrites every browser
--   policy of the game so that an anonymous user passes only once admitted.
--
--     demo_class_code          one row: the current class code (5 symbols) and
--                              when it was made. Null until a host makes one.
--     demo_class_code_actions  one row per "New class code" of a host, so a
--                              repeated click with the same actionUid changes
--                              nothing the second time (the audit of changes)
--     demo_guests              one row per guest who presented a valid code:
--                              the player id and when. Nothing else.
--
--     demo_class_code_set()    stores a new class code (made by the server),
--                              once per host and actionUid
--     demo_class_code_read()   the code, when it was made, and how many guests
--                              are admitted, for the server
--     demo_guest_admit()       records one admitted guest (safe to repeat)
--     jwt_is_anonymous()       for the policies: is the caller's login token the
--                              token of an anonymous user?
--     is_admitted_guest()      for the policies: is the caller in demo_guests?
--
-- WHY THE POLICIES CHANGE
--   Anyone can create an anonymous user with the public publishable key, so the
--   QR code is not a lock. An anonymous user has the role "authenticated", like
--   a GitHub or Google player, so every policy "to authenticated" let them in.
--   The locks are the server's guest gate (backend/server/demo/gate.py) and the
--   policies below. Each policy keeps its name, its table and its rule, and gets
--   one more condition:
--
--       (not (select public.jwt_is_anonymous()) or (select public.is_admitted_guest()))
--
--   A GitHub or Google player (is_anonymous false in the token) is unchanged.
--   An anonymous user passes only once the server recorded them in demo_guests.
--
--   Rewritten here: 21 policies, 16 on tables and 5 on realtime.messages, each
--   with "drop policy if exists" and "create policy" and the same name, table,
--   command and role as before:
--     public.profiles, saves, wallets, wallet_reasons, wallet_transactions,
--       crews, crew_seats                                      (foundation)
--     public.captain_name_rerolls                              (accounts)
--     public.entry_profiles                                    (entry kit)
--     public.islets, islet_buildings                           (home islet)
--     public.exchange_positions, exchange_events               (leverage)
--     public.prediction_pools, prediction_stakes               (prediction desk)
--     public.duels                                             (lantern duels)
--     (The three Island Exchange tables of 20261106010000 are gone: the leverage
--     migration dropped them with their policies.)
--     realtime.messages: the five Live policies (world presence select and
--       insert, place room select and insert, crew room select)  (live presence)
--
--   Admitted guests keep every room they had: the world room, every place room
--   and their own crew room. A guest can leave the class harbor ("Full mystery",
--   the map), so limiting them to live:place:class_harbor:1 would break the game
--   for them, and the place rooms carry only positions and preset emotes.
--
-- WHO USES IT
--   Only the Python server, with the secret key (service_role), reads and writes
--   the three tables and runs demo_class_code_set, demo_class_code_read and
--   demo_guest_admit: the host routes GET /api/host/demo and POST
--   /api/host/demo/code, the route POST /api/demo/join and the guest gate. The
--   browser never reads these tables: they have row-level security and no
--   policy. The two policy helpers are for the role authenticated only.
--   Run it after every earlier migration; it needs the tables of all of them.
--
-- THE RULES THAT THE DATABASE KEEPS
--   1. There is one current code (row class_demo). A new one replaces the old
--      one at once: the server compares every join with the stored code, never
--      with a remembered one.
--   2. The code is stored as plain text, on purpose: the host must be able to
--      show it again on the projector. Only service_role can read it. It is not
--      a password: it only lets a guest in, and a guest can only play.
--   3. A code is 5 symbols of ABCDEFGHJKMNPQRSTUVWXYZ23456789 (no 0, O, 1, I, L).
--   4. A host's actionUid is used once. A repeat answers with the code as it is
--      now and changes nothing.
--   5. demo_guests stores the player id and the moment of admission, nothing
--      else. A new code does not remove anyone: an admitted guest stays admitted.
--      Deleting the player (auth.users) deletes the row (cascade), which is what
--      the automatic and the manual guest clean-up do.
--   6. Nothing here moves coins. No wallet reason is added or written.
--   7. The old demo window (20261109010000_demo_window.sql) stays in the database
--      unused. Nothing here drops it.
--
-- WHAT IT NEEDS
--   The earlier migrations of this folder. A Supabase project has the roles
--   anon, authenticated and service_role, auth.uid(), auth.jwt(), realtime.topic()
--   and realtime.messages already.
--
-- SAFE TO RUN TWICE
--   Tables use "if not exists", the code row is added with "on conflict do
--   nothing", functions use "create or replace", every policy is dropped before
--   it is created, and revokes, grants and comments simply repeat. A second run
--   changes nothing.
--
-- HOW THE FILE IS ORGANISED
--   1. Table demo_class_code, its one row, rights
--   2. Table demo_class_code_actions, rights
--   3. Table demo_guests, rights
--   4. Function demo_class_code_set()
--   5. Function demo_class_code_read()
--   6. Function demo_guest_admit()
--   7. Functions jwt_is_anonymous() and is_admitted_guest()
--   8. The table policies, rewritten
--   9. The Realtime policies, rewritten
--
-- HOW TO VERIFY (read-only queries, after applying)
--   a. The new tables have RLS on and no policy:
--        select relname, relrowsecurity from pg_class
--         where relname in ('demo_class_code', 'demo_class_code_actions', 'demo_guests');
--        select count(*) from pg_policies where tablename like 'demo_%';   -- 0
--   b. The code row exists (and is empty until a host makes a code):
--        select name, code is null as empty, set_at from public.demo_class_code;
--   c. Every browser policy now names the guest check (expect 21 rows, all true):
--        select schemaname, tablename, policyname,
--               coalesce(qual, '') || coalesce(with_check, '') like '%is_admitted_guest%' as guarded
--          from pg_policies
--         where 'authenticated' = any(roles) and schemaname in ('public', 'realtime')
--         order by 1, 2, 3;
--   d. No browser policy is left without it (expect 0):
--        select count(*) from pg_policies
--         where schemaname in ('public', 'realtime')
--           and coalesce(qual, '') || coalesce(with_check, '') not like '%is_admitted_guest%';
--   e. Who may run the new functions (authenticated only the two helpers):
--        select p.proname, p.prosecdef, p.proconfig,
--               has_function_privilege('authenticated', p.oid, 'execute') as browser,
--               has_function_privilege('anon', p.oid, 'execute') as visitor,
--               has_function_privilege('service_role', p.oid, 'execute') as server
--          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--         where n.nspname = 'public'
--           and p.proname in ('demo_class_code_set', 'demo_class_code_read', 'demo_guest_admit',
--                             'jwt_is_anonymous', 'is_admitted_guest')
--         order by 1;
--   f. The browser roles cannot read the new tables (all false):
--        select has_table_privilege('authenticated', 'public.demo_class_code', 'select'),
--               has_table_privilege('authenticated', 'public.demo_guests', 'select'),
--               has_table_privilege('anon', 'public.demo_guests', 'select');
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Table demo_class_code: the current class code
-- -----------------------------------------------------------------------------
-- Exactly one row, named class_demo. code is null until a host makes the first
-- one. Plain text on purpose (rule 2 above): the projector shows it again.

create table if not exists public.demo_class_code (
  name    text primary key,
  code    text,
  set_by  uuid references public.profiles (id) on delete set null,
  set_at  timestamptz,

  -- One row only: the class demo.
  constraint demo_class_code_one_row
    check (name = 'class_demo'),
  -- 5 symbols without 0, O, 1, I and L, so a code read off a projector is never
  -- ambiguous. The server makes the code; this repeats its rule.
  constraint demo_class_code_format
    check (code is null or code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$'),
  -- A code always comes with the moment it was made.
  constraint demo_class_code_set_at_matches
    check ((code is null) = (set_at is null))
);

insert into public.demo_class_code (name, code, set_at)
values ('class_demo', null, null)
on conflict (name) do nothing;

comment on table public.demo_class_code is
  'One row (class_demo): the current class code that lets an anonymous guest in (POST /api/demo/join). Stored as plain text so the host can show it again; only service_role can read it. Written only by demo_class_code_set(). No browser access.';
comment on column public.demo_class_code.name is
  'Always class_demo. The check demo_class_code_one_row allows no other row.';
comment on column public.demo_class_code.code is
  'The current class code: 5 symbols of ABCDEFGHJKMNPQRSTUVWXYZ23456789, shown as HARBOR-<code>. Null until a host makes the first one. A new code replaces it at once.';
comment on column public.demo_class_code.set_by is
  'The host who made the current code. Empty when nobody has yet, or when that host deleted their account.';
comment on column public.demo_class_code.set_at is
  'When the current code was made. Set by the database. Null while there is no code.';

-- Row-level security on and no policy at all: no browser role can see the row.
--   anon, authenticated  nothing
--   service_role         read, and update the one row (through demo_class_code_set)
alter table public.demo_class_code enable row level security;
revoke all on table public.demo_class_code from public, anon, authenticated, service_role;
grant select, update on table public.demo_class_code to service_role;


-- -----------------------------------------------------------------------------
-- 2. Table demo_class_code_actions: one row per new code, for safe repeats
-- -----------------------------------------------------------------------------
-- The primary key is the host and the actionUid the browser made for the click,
-- so the same click can never make two codes. The rows are also the audit of
-- every code change (who, when, which code).

create table if not exists public.demo_class_code_actions (
  host_id     uuid not null references public.profiles (id) on delete cascade,
  action_uid  uuid not null,
  code        text not null,
  created_at  timestamptz not null default now(),
  primary key (host_id, action_uid),

  constraint demo_class_code_actions_code_format
    check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$')
);

comment on table public.demo_class_code_actions is
  'One row per "New class code" of a host: the code it set and when. Makes a repeated click safe and keeps the audit of code changes. An old code here no longer lets anyone in. Removed with the host account. No browser access.';
comment on column public.demo_class_code_actions.host_id is
  'The verified host who made the code. The server checks HOST_PLAYER_IDS before it calls.';
comment on column public.demo_class_code_actions.action_uid is
  'The id the browser made for the click. Used once per host.';
comment on column public.demo_class_code_actions.code is
  'The code this click set. Only the code in demo_class_code is current.';
comment on column public.demo_class_code_actions.created_at is
  'When the code was made. Set by the database.';

alter table public.demo_class_code_actions enable row level security;
revoke all on table public.demo_class_code_actions from public, anon, authenticated, service_role;
grant select, insert on table public.demo_class_code_actions to service_role;


-- -----------------------------------------------------------------------------
-- 3. Table demo_guests: the guests who presented a valid code
-- -----------------------------------------------------------------------------
-- One row per admitted guest. Only the player id and the moment: no code, no
-- name, no address. The row goes with the player (cascade from auth.users), so
-- "Delete my data" and the guest clean-up remove it.

create table if not exists public.demo_guests (
  player_id    uuid primary key references auth.users (id) on delete cascade,
  admitted_at  timestamptz not null default now()
);

comment on table public.demo_guests is
  'One row per anonymous guest who presented a valid class code: the player id and when. The guest gate of the server and the browser policies (is_admitted_guest) let an anonymous user in only with a row here. A new code removes nobody. Removed with the player. No browser access.';
comment on column public.demo_guests.player_id is
  'The admitted guest (auth.users). Deleting the player deletes the row.';
comment on column public.demo_guests.admitted_at is
  'When the guest was admitted the first time. Set by the database.';

-- service_role reads (the gate, the guest count) and inserts (an admission).
-- No update and no delete: a row goes only with its player, by cascade.
alter table public.demo_guests enable row level security;
revoke all on table public.demo_guests from public, anon, authenticated, service_role;
grant select, insert on table public.demo_guests to service_role;


-- -----------------------------------------------------------------------------
-- 4. Function demo_class_code_set(): store a new class code
-- -----------------------------------------------------------------------------
--   p_host_id     the verified host (the server checked HOST_PLAYER_IDS)
--   p_action_uid  the id the browser made for the click
--   p_code        the new code, made by the server from a secure random source
--
-- A repeat of the same host and actionUid changes nothing and answers with the
-- code as it is now and "repeat": true. A missing argument or a code that breaks
-- the format raises bad_class_code with nothing changed.
--
-- It returns {"status": "set", "code": ..., "setAt": ..., "guests": <count>,
-- "repeat": true or false}. guests counts the admitted guests (a new code keeps
-- them all).
--
-- It runs with the rights of its caller (not SECURITY DEFINER) and only
-- service_role may run it.

create or replace function public.demo_class_code_set(
  p_host_id    uuid,
  p_action_uid uuid,
  p_code       text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_row public.demo_class_code;
begin
  if p_host_id is null or p_action_uid is null or p_code is null
     or p_code !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$' then
    raise exception 'bad_class_code';
  end if;

  -- Two clicks at the same moment run one after the other.
  perform 1 from public.demo_class_code where name = 'class_demo' for update;

  if exists (
    select 1 from public.demo_class_code_actions
     where host_id = p_host_id and action_uid = p_action_uid
  ) then
    select * into v_row from public.demo_class_code where name = 'class_demo';
    return jsonb_build_object('status', 'set', 'code', v_row.code, 'setAt', v_row.set_at,
                              'guests', (select count(*) from public.demo_guests),
                              'repeat', true);
  end if;

  update public.demo_class_code
     set code = p_code, set_by = p_host_id, set_at = now()
   where name = 'class_demo'
  returning * into v_row;

  insert into public.demo_class_code_actions (host_id, action_uid, code)
  values (p_host_id, p_action_uid, p_code);

  return jsonb_build_object('status', 'set', 'code', v_row.code, 'setAt', v_row.set_at,
                            'guests', (select count(*) from public.demo_guests),
                            'repeat', false);
end;
$$;

revoke all on function public.demo_class_code_set(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.demo_class_code_set(uuid, uuid, text) to service_role;

comment on function public.demo_class_code_set(uuid, uuid, text) is
  'Stores a new class code (made by the server) and replaces the old one at once, once per host and actionUid. A repeat changes nothing and returns the current code with repeat true. Returns {status: set, code, setAt, guests, repeat}. Raises bad_class_code for a missing argument or a code outside the format. Removes no admitted guest and never moves coins. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 5. Function demo_class_code_read(): the code and the guest count
-- -----------------------------------------------------------------------------
-- It returns {"code": <text or null>, "setAt": <time or null>, "guests": <count>}.
-- guests counts the rows of demo_guests (admitted guests not yet cleaned up).

create or replace function public.demo_class_code_read()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'code', c.code,
    'setAt', c.set_at,
    'guests', (select count(*) from public.demo_guests)
  )
  from public.demo_class_code c
  where c.name = 'class_demo';
$$;

revoke all on function public.demo_class_code_read() from public, anon, authenticated, service_role;
grant execute on function public.demo_class_code_read() to service_role;

comment on function public.demo_class_code_read() is
  'The current class code: {code, setAt, guests}. code and setAt are null until a host makes a code; guests is the number of admitted guests. Reads only. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 6. Function demo_guest_admit(): record one admitted guest
-- -----------------------------------------------------------------------------
--   p_player_id  the verified anonymous player who presented the current code
--                (the server compared the code before it calls)
--
-- It returns {"status": "admitted"} for a new guest, {"status": "already"} for a
-- guest who was admitted before (nothing changes, the first moment is kept) and
-- {"status": "missing"} when no such user exists (deleted in the meantime).

create or replace function public.demo_guest_admit(p_player_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_player_id is null then
    raise exception 'bad_demo_guest';
  end if;

  insert into public.demo_guests (player_id)
  values (p_player_id)
  on conflict (player_id) do nothing;

  if found then
    return jsonb_build_object('status', 'admitted');
  end if;
  return jsonb_build_object('status', 'already');
exception
  when foreign_key_violation then
    return jsonb_build_object('status', 'missing');
end;
$$;

revoke all on function public.demo_guest_admit(uuid) from public, anon, authenticated, service_role;
grant execute on function public.demo_guest_admit(uuid) to service_role;

comment on function public.demo_guest_admit(uuid) is
  'Records an admitted guest in demo_guests, once: {status: admitted} the first time, {status: already} after that (the first moment is kept), {status: missing} for a user that does not exist. The server compares the class code before it calls. Never moves coins. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 7. Functions jwt_is_anonymous() and is_admitted_guest(): for the policies
-- -----------------------------------------------------------------------------
-- jwt_is_anonymous() reads the claim is_anonymous of the caller's login token
-- (auth.jwt()). Supabase writes it into every token: true for an anonymous
-- user, false for everyone else. Only an explicit false counts as "not
-- anonymous": a token without the claim is treated as anonymous, so a doubt
-- never opens a door (it then needs is_admitted_guest like any guest).
--
-- is_admitted_guest() is true when the caller (auth.uid()) has a row in
-- demo_guests. SECURITY DEFINER, because the browser role has no right on
-- demo_guests; safe because it answers only for the caller and only yes or no.

create or replace function public.jwt_is_anonymous()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  -- "is distinct from" is never null: a missing token or claim gives true.
  select (auth.jwt() -> 'is_anonymous') is distinct from 'false'::jsonb;
$$;

revoke all on function public.jwt_is_anonymous() from public, anon, authenticated, service_role;
grant execute on function public.jwt_is_anonymous() to authenticated;

comment on function public.jwt_is_anonymous() is
  'True unless the caller''s login token says is_anonymous false, so a token without the claim counts as anonymous. Used by every browser policy together with is_admitted_guest(). Reads only the token. Only authenticated may run it.';

create or replace function public.is_admitted_guest()
returns boolean
language sql
stable
security definer
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
  select exists (
    select 1
      from public.demo_guests
     where player_id = (select auth.uid())
  );
$$;

revoke all on function public.is_admitted_guest() from public, anon, authenticated, service_role;
grant execute on function public.is_admitted_guest() to authenticated;

comment on function public.is_admitted_guest() is
  'True if the signed-in caller (auth.uid()) is an admitted guest (a row in demo_guests). Used by every browser policy: an anonymous user passes only when this is true. SECURITY DEFINER so it can read demo_guests, which no browser role may read; it answers only for the caller. Only authenticated may run it.';


-- -----------------------------------------------------------------------------
-- 8. The table policies, rewritten
-- -----------------------------------------------------------------------------
-- Each policy is the one from its own migration (same name, table, command,
-- role and rule) and the guest condition from the top of this file. Both
-- helpers are written inside (select ...), so the database works them out once
-- per query and not once per row. The table rights (grants) do not change.

-- profiles (foundation): every signed-in player may read every profile.
drop policy if exists "Players can read all profiles" on public.profiles;
create policy "Players can read all profiles"
  on public.profiles for select to authenticated
  using (
    (not (select public.jwt_is_anonymous()) or (select public.is_admitted_guest()))
  );
comment on policy "Players can read all profiles" on public.profiles is
  'Any signed-in player may read every profile, because display names are shown to other players. An anonymous user only once admitted with the class code (is_admitted_guest). Nobody except the server can write to profiles.';

-- saves (foundation): a player may read only their own save.
drop policy if exists "Players can read their own save" on public.saves;
create policy "Players can read their own save"
  on public.saves for select to authenticated
  using (
    (not (select public.jwt_is_anonymous()) or (select public.is_admitted_guest()))
    and player_id = (select auth.uid())
  );
comment on policy "Players can read their own save" on public.saves is
  'A signed-in player may read only their own save; an anonymous user only once admitted with the class code. Nobody except the server can write to it.';

-- wallets (foundation): a player may read only their own wallet.
drop policy if exists "Players can read their own wallet" on public.wallets;
create policy "Players can read their own wallet"
  on public.wallets for select to authenticated
  using (
    (not (select public.jwt_is_anonymous()) or (select public.is_admitted_guest()))
    and player_id = (select auth.uid())
  );
comment on policy "Players can read their own wallet" on public.wallets is
  'A signed-in player may read only their own wallet; an anonymous user only once admitted with the class code. Nobody except the server can write to it.';

-- wallet_reasons (foundation): every signed-in player may read the whole list.
drop policy if exists "Players can read all wallet reasons" on public.wallet_reasons;
create policy "Players can read all wallet reasons"
  on public.wallet_reasons for select to authenticated
  using (
    (not (select public.jwt_is_anonymous()) or (select public.is_admitted_guest()))
  );
comment on policy "Players can read all wallet reasons" on public.wallet_reasons is
  'Any signed-in player may read the list of wallet reasons; an anonymous user only once admitted with the class code. Nobody can change it at run time.';

-- wallet_transactions (foundation): a player may read only their own ledger rows.
drop policy if exists "Players can read their own transactions" on public.wallet_transactions;
create policy "Players can read their own transactions"
  on public.wallet_transactions for select to authenticated
  using (
    (not (select public.jwt_is_anonymous()) or (select public.is_admitted_guest()))
    and player_id = (select auth.uid())
  );
comment on policy "Players can read their own transactions" on public.wallet_transactions is
  'A signed-in player may read only their own ledger rows; an anonymous user only once admitted with the class code. Nobody except the server can add rows.';

-- crews (foundation): a player may read a crew only if they sit in it.
drop policy if exists "Players can read the crews they sit in" on public.crews;
create policy "Players can read the crews they sit in"
  on public.crews for select to authenticated
  using (
    (not (select public.jwt_is_anonymous()) or (select public.is_admitted_guest()))
    and public.is_crew_member(id)
  );
comment on policy "Players can read the crews they sit in" on public.crews is
  'A signed-in player may read a crew only if they hold a seat in it; an anonymous user only once admitted with the class code. Nobody except the server can write to crews.';

-- crew_seats (foundation): a player may read all seats of a crew they sit in.
drop policy if exists "Players can read the seats of their crews" on public.crew_seats;
create policy "Players can read the seats of their crews"
  on public.crew_seats for select to authenticated
  using (
    (not (select public.jwt_is_anonymous()) or (select public.is_admitted_guest()))
    and public.is_crew_member(crew_id)
  );
comment on policy "Players can read the seats of their crews" on public.crew_seats is
  'A signed-in player may read the seats of a crew only if they hold a seat in that crew; an anonymous user only once admitted with the class code. Nobody except the server can write to seats.';

-- captain_name_rerolls (accounts): a player may read only their own re-roll row.
drop policy if exists "Players can read their own name re-roll" on public.captain_name_rerolls;
create policy "Players can read their own name re-roll"
  on public.captain_name_rerolls for select to authenticated
  using (
    (not (select public.jwt_is_anonymous()) or (select public.is_admitted_guest()))
    and player_id = (select auth.uid())
  );
comment on policy "Players can read their own name re-roll" on public.captain_name_rerolls is
  'A signed-in player may read only their own re-roll row; an anonymous user only once admitted with the class code. Nobody except the server can add rows.';

-- entry_profiles (entry kit): a player may read only their own entry profile.
drop policy if exists "Players can read their own entry profile" on public.entry_profiles;
create policy "Players can read their own entry profile"
  on public.entry_profiles for select to authenticated
  using (
    (not (select public.jwt_is_anonymous()) or (select public.is_admitted_guest()))
    and player_id = (select auth.uid())
  );
comment on policy "Players can read their own entry profile" on public.entry_profiles is
  'A signed-in player may read only their own entry profile; an anonymous user only once admitted with the class code. Nobody except the server can add rows.';

-- islets (home islet): a player may read only their own islet.
drop policy if exists "Players can read their own islet" on public.islets;
create policy "Players can read their own islet"
  on public.islets for select to authenticated
  using (
    (not (select public.jwt_is_anonymous()) or (select public.is_admitted_guest()))
    and player_id = (select auth.uid())
  );
comment on policy "Players can read their own islet" on public.islets is
  'A signed-in player may read only their own islet row (the timber); an anonymous user only once admitted with the class code. Nobody except the server can write it.';

-- islet_buildings (home islet): a player may read only their own buildings.
drop policy if exists "Players can read their own islet buildings" on public.islet_buildings;
create policy "Players can read their own islet buildings"
  on public.islet_buildings for select to authenticated
  using (
    (not (select public.jwt_is_anonymous()) or (select public.is_admitted_guest()))
    and player_id = (select auth.uid())
  );
comment on policy "Players can read their own islet buildings" on public.islet_buildings is
  'A signed-in player may read only the buildings on their own islet; an anonymous user only once admitted with the class code. Nobody except the server can add rows.';

-- exchange_positions (leverage): a player may read only their own positions.
drop policy if exists "Players can read their own exchange positions" on public.exchange_positions;
create policy "Players can read their own exchange positions"
  on public.exchange_positions for select to authenticated
  using (
    (not (select public.jwt_is_anonymous()) or (select public.is_admitted_guest()))
    and player_id = (select auth.uid())
  );
comment on policy "Players can read their own exchange positions" on public.exchange_positions is
  'A signed-in player may read only their own positions; an anonymous user only once admitted with the class code. Nobody except the server can write them.';

-- exchange_events (leverage): a player may read only their own events.
drop policy if exists "Players can read their own exchange events" on public.exchange_events;
create policy "Players can read their own exchange events"
  on public.exchange_events for select to authenticated
  using (
    (not (select public.jwt_is_anonymous()) or (select public.is_admitted_guest()))
    and player_id = (select auth.uid())
  );
comment on policy "Players can read their own exchange events" on public.exchange_events is
  'A signed-in player may read only their own events; an anonymous user only once admitted with the class code. Nobody except the server can add rows.';

-- prediction_pools (prediction desk): every signed-in player may read every pool.
drop policy if exists "Players can read all prediction pools" on public.prediction_pools;
create policy "Players can read all prediction pools"
  on public.prediction_pools for select to authenticated
  using (
    (not (select public.jwt_is_anonymous()) or (select public.is_admitted_guest()))
  );
comment on policy "Players can read all prediction pools" on public.prediction_pools is
  'Any signed-in player may read all prediction pools; an anonymous user only once admitted with the class code. They hold no personal data. Nobody except the server can write them.';

-- prediction_stakes (prediction desk): a player may read only their own stakes.
drop policy if exists "Players can read their own prediction stakes" on public.prediction_stakes;
create policy "Players can read their own prediction stakes"
  on public.prediction_stakes for select to authenticated
  using (
    (not (select public.jwt_is_anonymous()) or (select public.is_admitted_guest()))
    and player_id = (select auth.uid())
  );
comment on policy "Players can read their own prediction stakes" on public.prediction_stakes is
  'A signed-in player may read only their own stakes; an anonymous user only once admitted with the class code. Nobody except the server can add rows.';

-- duels (lantern duels): a player may read only the duels they take part in.
drop policy if exists "Players can read the duels they take part in" on public.duels;
create policy "Players can read the duels they take part in"
  on public.duels for select to authenticated
  using (
    (not (select public.jwt_is_anonymous()) or (select public.is_admitted_guest()))
    and (challenger_id = (select auth.uid()) or opponent_id = (select auth.uid()))
  );
comment on policy "Players can read the duels they take part in" on public.duels is
  'A signed-in player may read the duels where they are the challenger or the opponent; an anonymous user only once admitted with the class code. A duel holds no signal. Nobody except the server can write them.';


-- -----------------------------------------------------------------------------
-- 9. The Realtime policies, rewritten
-- -----------------------------------------------------------------------------
-- The five rules of 20261106050000_live_presence.sql with the guest condition.
-- Realtime runs them with the joining player's token, so auth.jwt() and
-- auth.uid() are that player's. An anonymous user who never presented the class
-- code can no longer join any room: not live:world, no place room, no crew room.
-- Never add a policy with "using (true)" on realtime.messages.

-- The world room: any signed-in player may see who is online.
drop policy if exists "Live: players can see who is online" on realtime.messages;
create policy "Live: players can see who is online"
  on realtime.messages for select to authenticated
  using (
    (not (select public.jwt_is_anonymous()) or (select public.is_admitted_guest()))
    and (select realtime.topic()) = 'live:world'
    and realtime.messages.extension = 'presence'
  );
comment on policy "Live: players can see who is online" on realtime.messages is
  'A signed-in player may look at the presence of the room live:world (who is online, in which place and room, with which kit); an anonymous user only once admitted with the class code. Presence only, no broadcast. Visitors get nothing.';

-- The world room: any signed-in player may say where they are.
drop policy if exists "Live: players can say where they are" on realtime.messages;
create policy "Live: players can say where they are"
  on realtime.messages for insert to authenticated
  with check (
    (not (select public.jwt_is_anonymous()) or (select public.is_admitted_guest()))
    and (select realtime.topic()) = 'live:world'
    and realtime.messages.extension = 'presence'
  );
comment on policy "Live: players can say where they are" on realtime.messages is
  'A signed-in player may announce their own place, room and kit in the room live:world (track); an anonymous user only once admitted with the class code. Presence only, no broadcast. The browser may claim anything here: it is only for showing, never for game rules.';

-- A place room: any signed-in player may listen to the moves and the emotes.
drop policy if exists "Live: players can watch a place room" on realtime.messages;
create policy "Live: players can watch a place room"
  on realtime.messages for select to authenticated
  using (
    (not (select public.jwt_is_anonymous()) or (select public.is_admitted_guest()))
    and (select realtime.topic()) ~ '^live:place:[a-z][a-z0-9_]{1,39}:[1-9][0-9]?$'
    and realtime.messages.extension = 'broadcast'
  );
comment on policy "Live: players can watch a place room" on realtime.messages is
  'A signed-in player may listen to the broadcasts of any place room (live:place:<place id>:<room 1 to 99>), the class harbor live:place:class_harbor:1 included; an anonymous user only once admitted with the class code. Broadcast only, no presence. The messages are positions and preset emotes, only for showing.';

-- A place room: any signed-in player may send their moves and emotes.
drop policy if exists "Live: players can move in a place room" on realtime.messages;
create policy "Live: players can move in a place room"
  on realtime.messages for insert to authenticated
  with check (
    (not (select public.jwt_is_anonymous()) or (select public.is_admitted_guest()))
    and (select realtime.topic()) ~ '^live:place:[a-z][a-z0-9_]{1,39}:[1-9][0-9]?$'
    and realtime.messages.extension = 'broadcast'
  );
comment on policy "Live: players can move in a place room" on realtime.messages is
  'A signed-in player may send broadcasts (their position and preset emotes) in any place room (live:place:<place id>:<room 1 to 99>); an anonymous user only once admitted with the class code. Broadcast only, no presence. Nothing sent here changes any game state.';

-- A crew room: only the crew's own members may listen.
drop policy if exists "Live: crew members can hear their crew room" on realtime.messages;
create policy "Live: crew members can hear their crew room"
  on realtime.messages for select to authenticated
  using (
    (not (select public.jwt_is_anonymous()) or (select public.is_admitted_guest()))
    and realtime.messages.extension = 'broadcast'
    and public.is_crew_member(public.live_crew_id((select realtime.topic())))
  );
comment on policy "Live: crew members can hear their crew room" on realtime.messages is
  'A signed-in player may listen to the broadcasts of the room live:crew:<crew id> only while they hold a seat in that crew (is_crew_member); an anonymous user only once admitted with the class code. Listening only: there is no insert policy for crew rooms, so only the server (secret key, skips row-level security) can send crew events.';

-- No insert policy for crew rooms, no policy for "anon" and no policy for any
-- other topic. Without a policy there is no access.
