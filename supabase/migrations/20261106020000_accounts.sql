-- =============================================================================
-- 20261106020000_accounts.sql
--
-- WHAT IT DOES
--   The database part of package A2 (captain names, cloud progress and "delete
--   my data"). It adds one table and four functions, and it gives the column
--   saves.version a new meaning.
--
--     captain_name_rerolls   one row per player who used their one re-roll
--
--     assign_captain_name()  gives a player their generated captain name, once
--     reroll_captain_name()  changes that name, once
--     save_progress()        writes a save, but only if nobody saved in between
--     delete_player()        deletes a player and everything that belongs to them
--
-- WHO USES IT
--   You run it once on the Supabase project, AFTER the foundation migration
--   (20261106000000_foundation.sql), because it uses the tables profiles, saves,
--   crews and crew_seats from there. The steps are in supabase/README.md. After
--   that the Python server (backend/server/account/) calls the four functions,
--   with the secret key. The browser may only read its own re-roll row.
--
-- THE RULES THAT THE DATABASE KEEPS
--   1. The browser never writes. Names, saves and deletions all go through the
--      server (rule D003 in docs/DECISIONS.md). The server takes the player id
--      from the verified login, never from the request.
--   2. A name is given once and changed once. The names themselves are made in
--      Python from the word lists in backend/content/names.json; the database
--      only makes sure a player cannot get more than one name and one re-roll,
--      even if two requests arrive at the same moment.
--   3. A save never overwrites newer progress. The caller says which version it
--      read, and the save is written only if that is still the current version.
--   4. A save stays a JSON object of reasonable size (the foundation rule of
--      about 200 KB is checked again here, before the write, so the answer is a
--      clear "too big" and not a constraint error).
--   5. Deleting a player removes everything about them, the ledger included.
--      Coins are play money, so no record of them has to be kept. A crew that
--      the player started and that other players sit in is handed over first, so
--      friends keep their game.
--   6. Someone who is not signed in (role "anon") gets nothing at all.
--
-- WHAT IT NEEDS
--   The foundation migration. A Supabase project has the roles anon,
--   authenticated and service_role and the table auth.users already.
--
-- SAFE TO RUN TWICE
--   The table uses "if not exists", the policy is dropped and created again,
--   functions use "create or replace", and grants and comments simply repeat. A
--   second run changes nothing.
--
-- HOW THE FILE IS ORGANISED
--   1. The new meaning of saves.version
--   2. Table captain_name_rerolls
--   3. Row-level security and rights for captain_name_rerolls
--   4. Function assign_captain_name()
--   5. Function reroll_captain_name()
--   6. Function save_progress()
--   7. Function delete_player()
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The new meaning of saves.version
-- -----------------------------------------------------------------------------
-- The foundation file said "version of the save format". Nothing ever used it
-- that way. Now it counts the writes of the save, and it is how two devices of
-- one player avoid overwriting each other: PUT /api/save sends the version it
-- last read, and save_progress() (section 6) writes only if that is still the
-- current version. The table, the column and the rule saves_version_positive
-- stay as they are.

comment on column public.saves.version is
  'How many times the save was written, starting at 1 (the empty save from sign-up). PUT /api/save sends the version it last read; save_progress() writes only if the save still has that version and then adds 1, so an older copy on a second device cannot overwrite newer progress. Only save_progress() changes it. (Changed meaning, migration 20261106020000: it is no longer a format version.)';


-- -----------------------------------------------------------------------------
-- 2. Table captain_name_rerolls: who used their one re-roll
-- -----------------------------------------------------------------------------
-- A player gets one generated captain name and may change it once. This table
-- remembers that the change happened. The primary key is player_id, so a second
-- row for the same player is impossible: the database itself guards the rule
-- "one re-roll per player", even if the Python has a bug.
--
-- action_uid is the id that the browser made for the click on "re-roll". If the
-- same request arrives twice, reroll_captain_name() sees the same action_uid and
-- answers "already applied". Any other request after the first is refused with
-- "no re-rolls left".
--
-- Rows disappear only when their player is deleted (cascade).

create table if not exists public.captain_name_rerolls (
  player_id   uuid primary key references public.profiles (id) on delete cascade,
  action_uid  text not null,
  rerolled_at timestamptz not null default now(),

  -- The pattern reads: from the start (^) to the end ($), 8 to 64 characters,
  -- each one of: A-Z, a-z, 0-9, underscore, hyphen. The route in
  -- backend/server/routes/captain_name.py asks for the same thing.
  constraint captain_name_rerolls_action_uid_format
    check (action_uid ~ '^[A-Za-z0-9_-]{8,64}$')
);

comment on table public.captain_name_rerolls is
  'One row per player who used their one captain name re-roll. The primary key makes a second re-roll impossible. Players can read their own row. Only reroll_captain_name() adds rows.';
comment on column public.captain_name_rerolls.player_id is
  'The player who re-rolled. It is also the primary key, so there is at most one re-roll per player. Deleting the player deletes this row.';
comment on column public.captain_name_rerolls.action_uid is
  'The id the browser made for the click on re-roll: 8 to 64 characters from A-Z, a-z, 0-9, underscore and hyphen. A repeat of the same request is recognised by it.';
comment on column public.captain_name_rerolls.rerolled_at is
  'When the re-roll happened. Set by the database.';


-- -----------------------------------------------------------------------------
-- 3. Row-level security and rights for captain_name_rerolls
-- -----------------------------------------------------------------------------
-- Same plan as the other tables: the policy is a read policy for "authenticated"
-- (a signed-in player). There is no policy for insert, update or delete, so no
-- player can write. "anon" has no policy, so it gets nothing.

alter table public.captain_name_rerolls enable row level security;

drop policy if exists "Players can read their own name re-roll" on public.captain_name_rerolls;
create policy "Players can read their own name re-roll"
  on public.captain_name_rerolls for select to authenticated
  using (player_id = (select auth.uid()));
comment on policy "Players can read their own name re-roll" on public.captain_name_rerolls is
  'A signed-in player may read only their own re-roll row. Nobody except the server can add rows.';

-- The second lock: take every right away, then give back only what each role
-- needs.
--
--   anon           nothing
--   authenticated  read only (RLS then limits the rows to the player's own)
--   service_role   the server: read and insert (a re-roll is final, so no update
--                  and no delete; the row goes only with its player, by cascade)

revoke all on table public.captain_name_rerolls from public, anon, authenticated, service_role;
grant select on table public.captain_name_rerolls to authenticated;
grant select, insert on table public.captain_name_rerolls to service_role;


-- -----------------------------------------------------------------------------
-- 4. Function assign_captain_name(): give a player their captain name
-- -----------------------------------------------------------------------------
-- The server picks a name from the word lists (Python) and calls this.
--
--   p_player_id    whose name it is
--   p_placeholder  the neutral name from sign-up, "Captain-" and the first 6
--                  characters of the id. The server works it out.
--   p_name         the generated name, for example Brave Puffin 17
--
-- The name is written only while the player still has the placeholder. So a
-- second request, or a request that arrives at the same moment, changes
-- nothing and gets the first name back. The UPDATE locks the profile row; a
-- second caller waits there, then finds the placeholder gone.
--
-- It returns a JSON object:
--   {"status": "named", "name": ..., "rerollsUsed": 0 or 1}
--   {"status": "missing"} when the player has no profile
--
-- The rules of profiles.display_name (length, characters, no space at either
-- end) are checked by the table. A name that breaks them stops the call with a
-- constraint error and changes nothing: that is a bug on the server side.
--
-- It is not SECURITY DEFINER on purpose. It runs with the rights of its caller,
-- so a player (who has no right to write profiles) is stopped even if the
-- function were granted to them by mistake.

create or replace function public.assign_captain_name(
  p_player_id   uuid,
  p_placeholder text,
  p_name        text
)
returns jsonb
language plpgsql
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_name         text;
  v_rerolls_used integer;
begin
  -- Step 1: give the name, but only while the placeholder is still there.
  update public.profiles
     set display_name = p_name
   where id = p_player_id
     and display_name = p_placeholder
  returning display_name into v_name;

  -- Step 2: nothing was changed. Either the player has a name already (a
  -- repeat), or there is no profile at all.
  if not found then
    select display_name
      into v_name
      from public.profiles
     where id = p_player_id;

    if not found then
      return jsonb_build_object('status', 'missing');
    end if;
  end if;

  -- Step 3: tell the caller whether the re-roll is still available.
  select count(*)
    into v_rerolls_used
    from public.captain_name_rerolls
   where player_id = p_player_id;

  return jsonb_build_object('status', 'named', 'name', v_name, 'rerollsUsed', v_rerolls_used);
end;
$$;

revoke all on function public.assign_captain_name(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.assign_captain_name(uuid, text, text)
  to service_role;

comment on function public.assign_captain_name(uuid, text, text) is
  'Gives a player their generated captain name, but only while they still have the sign-up placeholder p_placeholder. A repeat changes nothing and returns the name the player already has. Returns {status: named, name, rerollsUsed}, or {status: missing} when the player has no profile. A name that breaks the rules of profiles.display_name stops the call with a constraint error. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 5. Function reroll_captain_name(): change the name, once
-- -----------------------------------------------------------------------------
-- The server picks a new name (Python, always a different one) and calls this.
--
--   p_player_id    whose name changes
--   p_placeholder  the neutral name from sign-up (to tell "no name yet" apart)
--   p_new_name     the new generated name
--   p_action_uid   the id the browser made for the click, to recognise a repeat
--
-- The checks run in this order, and each one that says no returns a refusal
-- and changes nothing:
--
--   1. The profile is locked (FOR NO KEY UPDATE), so two re-rolls of one player
--      happen one after the other. This lock level waits for another writer of
--      the row, but not for the foreign-key checks of other tables that point at
--      the profile (a new ledger row, a trade, a seat), so a re-roll never makes
--      those wait. No profile: {"status": "missing"}.
--   2. A re-roll exists already: reason "already_applied" when it was this very
--      request (the same action_uid), otherwise "no_rerolls_left".
--   3. The player still has the placeholder: reason "no_name_yet".
--   4. p_new_name is missing or equal to the current name: that is a bug on the
--      server side, so it raises the error "same_name".
--   5. Otherwise the re-roll is written, the name is changed, and the answer is
--      {"status": "named", "name": ..., "rerollsUsed": 1}.
--
-- A refusal carries the player's current name too, as "name".
--
-- Not SECURITY DEFINER, for the same reason as assign_captain_name().

create or replace function public.reroll_captain_name(
  p_player_id   uuid,
  p_placeholder text,
  p_new_name    text,
  p_action_uid  text
)
returns jsonb
language plpgsql
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_name       text;
  v_action_uid text;
begin
  -- Step 1: lock the profile and read the current name. FOR NO KEY UPDATE, not
  -- FOR UPDATE: see the note above the function.
  select display_name
    into v_name
    from public.profiles
   where id = p_player_id
     for no key update;

  if not found then
    return jsonb_build_object('status', 'missing');
  end if;

  -- Step 2: one re-roll per player. The same action_uid means a repeat of the
  -- request that already worked.
  select action_uid
    into v_action_uid
    from public.captain_name_rerolls
   where player_id = p_player_id;

  if found then
    return jsonb_build_object(
      'status', 'refused',
      'reason', case when v_action_uid = p_action_uid then 'already_applied' else 'no_rerolls_left' end,
      'name', v_name
    );
  end if;

  -- Step 3: there is nothing to change until the first name was given.
  if v_name = p_placeholder then
    return jsonb_build_object('status', 'refused', 'reason', 'no_name_yet', 'name', v_name);
  end if;

  -- Step 4: the server must send a different name. Anything else is a bug.
  if p_new_name is null or p_new_name = v_name then
    raise exception 'same_name';
  end if;

  -- Step 5: write the re-roll and change the name, in this one transaction.
  insert into public.captain_name_rerolls (player_id, action_uid)
  values (p_player_id, p_action_uid);

  update public.profiles
     set display_name = p_new_name
   where id = p_player_id;

  return jsonb_build_object('status', 'named', 'name', p_new_name, 'rerollsUsed', 1);
end;
$$;

revoke all on function public.reroll_captain_name(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.reroll_captain_name(uuid, text, text, text)
  to service_role;

comment on function public.reroll_captain_name(uuid, text, text, text) is
  'Changes a player captain name, once. In order: locks the profile (no profile returns {status: missing}); a re-roll exists already returns {status: refused, reason: already_applied} for the same p_action_uid and no_rerolls_left otherwise; a player who still has the placeholder p_placeholder returns reason no_name_yet; a missing or unchanged p_new_name raises same_name. Otherwise writes the re-roll, changes the name and returns {status: named, name, rerollsUsed: 1}. A refusal also carries the current name and changes nothing. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 6. Function save_progress(): write a save, without overwriting newer progress
-- -----------------------------------------------------------------------------
-- A player can play on two devices. Each device holds the version of the save it
-- last read. A write is accepted only if the save still has that version, and
-- then the version goes up by one. So an old copy on a second device can never
-- overwrite newer progress: its write finds the version moved on and is refused.
--
--   p_player_id         whose save it is
--   p_expected_version  the version the caller last read, at least 1
--   p_data              the new progress, a JSON object
--
-- It returns a JSON object:
--   {"status": "saved", "version": ..., "updatedAt": ...}
--   {"status": "stale", "version": ...}  somebody saved first; nothing changed.
--                                        "version" is the current version.
--   {"status": "too_big"}                p_data is over 200000 bytes as text. The
--                                        server checks 100000 bytes of compact
--                                        JSON first. This check is the exact one:
--                                        the same text the table rule
--                                        saves_data_max_size measures.
--   {"status": "missing"}                the player has no save row
--
-- A missing or too small version, or data that is not a JSON object, raises the
-- error "bad_save": the server checks both first, so it is a bug on the server
-- side, not something a player can cause.
--
-- Not SECURITY DEFINER, for the same reason as assign_captain_name().

create or replace function public.save_progress(
  p_player_id        uuid,
  p_expected_version integer,
  p_data             jsonb
)
returns jsonb
language plpgsql
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_version    integer;
  v_updated_at timestamptz;
begin
  -- Step 1: the arguments must make sense.
  if p_expected_version is null or p_expected_version < 1
     or p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'bad_save';
  end if;

  -- Step 2: the size, counted as the table rule saves_data_max_size counts it. Keep
  -- the number the same as in that rule (foundation migration, section 3).
  if octet_length(p_data::text) > 200000 then
    return jsonb_build_object('status', 'too_big');
  end if;

  -- Step 3: write, but only if the save still has the version the caller read.
  update public.saves
     set data = p_data,
         version = version + 1
   where player_id = p_player_id
     and version = p_expected_version
  returning version, updated_at into v_version, v_updated_at;

  if found then
    return jsonb_build_object('status', 'saved', 'version', v_version, 'updatedAt', v_updated_at);
  end if;

  -- Step 4: nothing was written. Find out why.
  select version
    into v_version
    from public.saves
   where player_id = p_player_id;

  if not found then
    return jsonb_build_object('status', 'missing');
  end if;

  return jsonb_build_object('status', 'stale', 'version', v_version);
end;
$$;

revoke all on function public.save_progress(uuid, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_progress(uuid, integer, jsonb)
  to service_role;

comment on function public.save_progress(uuid, integer, jsonb) is
  'Writes a save only if it still has the version p_expected_version, and then adds 1 to the version, so an older copy on a second device cannot overwrite newer progress. Returns {status: saved, version, updatedAt}; {status: stale, version} when somebody saved first (nothing changed); {status: too_big} when p_data is over 200000 bytes as text (the limit of saves_data_max_size); {status: missing} when the player has no save. A missing or too small version, or data that is not a JSON object, raises bad_save. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 7. Function delete_player(): delete a player and everything about them
-- -----------------------------------------------------------------------------
-- "Delete my data". The server calls this with the id of the verified player.
--
-- Deleting the login (the row in auth.users) deletes everything else by cascade:
-- the profile, the save, the wallet, ALL ledger rows, the seats, the Island
-- Exchange positions and trades, the name re-roll, and every table that a later
-- package adds, as long as it points at profiles with "on delete cascade" (the
-- team rule). Deleting the login also removes the login identities and sessions
-- that Supabase keeps. The ledger keeps nothing about the player: the coins are
-- play money, no other player's balance depends on those rows, and "delete my
-- data" must really delete.
--
-- PENDING Nils' decision (N4, D022): delete everything, the ledger included, and
-- hand a shared crew to the lowest other seat. It touches personal data, so the
-- team agrees before anyone uses DELETE /api/me for real.
--
-- Two things happen, in this order:
--
--   1. A crew that the player started and that another player sits in is handed
--      to the player in the lowest seat, so friends keep their game. Without
--      this, the cascade would delete the whole crew with everyone's seats. The
--      deleted player's own seat goes with them, so it is open again.
--   2. The login is deleted.
--
-- The handover happens only here. Deleting a user in the Supabase dashboard
-- (Authentication > Users) skips it and deletes every crew that user started,
-- with everyone's seats.
--
-- Not deleted: Supabase Auth's own audit log (auth.audit_log_entries, which can
-- hold the login e-mail address and an IP address, and which has no foreign key
-- to auth.users) and Supabase's platform logs, which expire on Supabase's own
-- schedule. Whether to purge the audit log, or to stop Auth writing it to the
-- database, is part of decision N4.
--
-- Deleting twice is safe. It returns a JSON object:
--   {"status": "deleted"}
--   {"status": "not_found"}  there was no such login (already deleted)
--
-- THIS IS THE ONLY SECURITY DEFINER FUNCTION OF THIS FILE. Deleting from
-- auth.users needs the rights of the function owner (the postgres role), which
-- the server's role has not. It is safe because only service_role may run it,
-- it takes the id from the server (which takes it from the verified login), and
-- it starts with "set search_path = ''" and names every table in full.

create or replace function public.delete_player(p_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
begin
  -- Step 1: hand over the crews that other players sit in.
  update public.crews as c
     set created_by = (
           select s.player_id
             from public.crew_seats as s
            where s.crew_id = c.id
              and s.player_id is not null
              and s.player_id <> p_player_id
            order by s.seat_no
            limit 1
         )
   where c.created_by = p_player_id
     and exists (
           select 1
             from public.crew_seats as s
            where s.crew_id = c.id
              and s.player_id is not null
              and s.player_id <> p_player_id
         );

  -- Step 2: delete the login. Everything else follows by cascade.
  delete from auth.users where id = p_player_id;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  return jsonb_build_object('status', 'deleted');
end;
$$;

revoke all on function public.delete_player(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_player(uuid)
  to service_role;

comment on function public.delete_player(uuid) is
  'Deletes a player and everything that belongs to them: the login in auth.users, and by cascade the profile, save, wallet, all ledger rows, seats, Island Exchange positions and trades and name re-roll. First hands every crew the player started to the player in the lowest other seat (a crew nobody else sits in is deleted with them). Returns {status: deleted} or {status: not_found} (already deleted). SECURITY DEFINER, because deleting from auth.users needs the rights of the function owner; safe because only service_role may run it and the server passes the id of the verified player. Only service_role may run it.';
