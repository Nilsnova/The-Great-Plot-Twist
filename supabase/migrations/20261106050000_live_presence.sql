-- =============================================================================
-- 20261106050000_live_presence.sql
--
-- WHAT IT DOES
--   The database part of live presence (package A4): players see each other's
--   captains move in real time, send preset emotes, and the server can tell a
--   crew the moment something changed. All of it runs on Supabase Realtime.
--   Realtime needs no table of ours. Its only database part is the rules that
--   say who may join which room ("private rooms"), written as row-level
--   security policies on the Realtime table realtime.messages. This file adds
--   one small function and five of those policies.
--
--   There are three kinds of room, told apart by their topic (their name):
--
--     live:world                       presence only. Who is online, in which
--                                      place and room, with which kit.
--     live:place:<place id>:<room>     broadcast only. The moves and the
--                                      preset emotes of the captains in one
--                                      numbered room of one place, for example
--                                      live:place:saltreach_harbor:1
--     live:crew:<crew id>              broadcast only, and players can only
--                                      LISTEN. Only the server sends there.
--
--     live_crew_id()                   reads the crew id out of a crew room's
--                                      topic, so a policy can ask
--                                      is_crew_member() about it
--
-- WHO USES IT
--   You run it once on the Supabase project, AFTER the foundation migration
--   (20261106000000_foundation.sql), because it uses is_crew_member() from
--   there. The steps are in supabase/README.md. After that the browser game
--   (frontend/src/online/realtime.js) joins the rooms with the signed-in
--   player's login token, and the Python server (backend/server/
--   crew_broadcast.py) sends into the crew rooms with the secret key. The
--   feature flag live_presence switches the browser and the server code on.
--   The flag cannot stop a modified browser, so these policies are the real
--   lock: until this file is applied, Realtime refuses every private room.
--
-- THE RULES THAT THE DATABASE KEEPS
--   1. Only signed-in players (role "authenticated") may use a room. Someone
--      who is not signed in (role "anon") has no policy at all, so gets
--      nothing.
--   2. Only the three kinds of topic above exist. A topic that matches none of
--      them has no policy, so it is refused. That includes every public room,
--      once the dashboard setting "Allow public access" is switched off (see
--      supabase/README.md).
--   3. In live:world players may only look at presence and set their own. In a
--      place room they may only listen and send broadcasts. Nobody can use
--      presence in a place room, or broadcast in the world room.
--   4. A crew room is open only to the players who hold a seat in that crew
--      (is_crew_member). There is NO policy that lets a player send into a crew
--      room, so a player cannot fake an event of the server. The server sends
--      with its secret key, which skips row-level security.
--   5. Positions, presence and emotes are only for showing (decision D003 in
--      docs/DECISIONS.md). Realtime keeps no client message in a table, and no
--      rule of the game depends on what a browser claims here. Coins,
--      progress, pins and accusations stay on the server.
--   6. Nothing is open by accident. A malformed topic is refused and never
--      raises an error (live_crew_id() answers null for it).
--
-- WHAT IT NEEDS
--   The foundation migration (the function is_crew_member() and the table
--   crew_seats). A Supabase project already has the roles anon, authenticated
--   and service_role, and the schema realtime with its table messages and its
--   function realtime.topic(). It will not run on a plain Postgres database.
--   This file grants nothing on realtime.messages: Supabase sets the rights of
--   that table itself (supabase/README.md has a check for them).
--
-- SAFE TO RUN TWICE
--   The function uses "create or replace", policies are dropped and created
--   again, and grants and comments simply repeat. A second run changes
--   nothing.
--
-- HOW THE FILE IS ORGANISED
--   1. Function live_crew_id()
--   2. The five rules (policies) on realtime.messages
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Function live_crew_id()
-- -----------------------------------------------------------------------------
-- The topic of a crew room is "live:crew:" followed by the crew id, for example
-- live:crew:11111111-1111-4111-8111-111111111111. This function gives back the
-- crew id as a uuid, or null if the text is not exactly such a topic.
--
-- Why the check inside: a plain cast of "nope" to uuid would raise an error,
-- and a policy that raises an error shows up as a crash instead of a refusal.
-- So the text is checked with a pattern first, and anything else gives null.
-- is_crew_member(null) is false, so a malformed topic is simply refused.
--
-- The pattern wants lowercase letters, like the ids the server writes. It ends
-- in a $, which in Postgres means the very end of the text (a line break at
-- the end does not match). It reads no table, so it can be immutable.
create or replace function public.live_crew_id(p_topic text)
returns uuid
language sql
immutable
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
  select case
    when p_topic ~ '^live:crew:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then substring(p_topic from 11)::uuid
  end;
$$;

-- Only signed-in players need it, because only their room checks run the
-- policies below. The server skips row-level security and never calls it.
revoke all on function public.live_crew_id(text)
  from public, anon, authenticated, service_role;
grant execute on function public.live_crew_id(text)
  to authenticated;

comment on function public.live_crew_id(text) is
  'Reads the crew id out of the topic of a crew room (live:crew: and a lowercase uuid). Gives null for any other text and never raises an error, so a malformed topic is refused instead of crashing a policy. Used by the policy on realtime.messages for crew rooms. Only authenticated may run it.';


-- -----------------------------------------------------------------------------
-- 2. The five rules (policies) on realtime.messages
-- -----------------------------------------------------------------------------
-- How Realtime uses them: when a player joins a private room, Realtime asks the
-- database whether this player may read (select) and may send (insert) in this
-- room, and remembers the answer. It asks again when the player's login token
-- is renewed. A player needs at least one of the two rights to join at all.
--
--   * realtime.topic() is the topic of the room that is being checked.
--   * "extension" tells what kind of traffic it is: 'broadcast' (the moves,
--     the emotes and the crew events) or 'presence' (who is online).
--   * A "select" policy lets a player RECEIVE. An "insert" policy lets a
--     player SEND, or in a presence room, announce themselves ("track").
--   * A message that no policy allows is dropped silently.
--   * (select realtime.topic()) is written inside (select ...) so that the
--     database works it out once per check and not once per row.
--
-- All policies are "to authenticated". The role "anon" has none, so a visitor
-- gets nothing. The server (role "service_role", the secret key) skips all of
-- them, which is how it can send into a crew room.
--
-- The policies compare the topic that is being checked with realtime.topic().
-- They do not compare the "topic" column of the stored row, which is safe
-- because Realtime keeps no client message in the table.
--
-- Never add a policy with "using (true)" on realtime.messages: it would open
-- every room, including every crew room, to every signed-in player.

-- The world room: any signed-in player may see who is online.
drop policy if exists "Live: players can see who is online" on realtime.messages;
create policy "Live: players can see who is online"
  on realtime.messages for select to authenticated
  using (
    (select realtime.topic()) = 'live:world'
    and realtime.messages.extension = 'presence'
  );
comment on policy "Live: players can see who is online" on realtime.messages is
  'A signed-in player may look at the presence of the room live:world (who is online, in which place and room, with which kit). Presence only, no broadcast. Visitors get nothing.';

-- The world room: any signed-in player may say where they are.
drop policy if exists "Live: players can say where they are" on realtime.messages;
create policy "Live: players can say where they are"
  on realtime.messages for insert to authenticated
  with check (
    (select realtime.topic()) = 'live:world'
    and realtime.messages.extension = 'presence'
  );
comment on policy "Live: players can say where they are" on realtime.messages is
  'A signed-in player may announce their own place, room and kit in the room live:world (track). Presence only, no broadcast. The browser may claim anything here: it is only for showing, never for game rules.';

-- A place room: any signed-in player may listen to the moves and the emotes.
-- The topic is live:place:<place id>:<room number>. A place id is a lowercase
-- word of 2 to 40 letters, digits and underscores that starts with a letter. A
-- room number is 1 to 99, without a leading zero.
drop policy if exists "Live: players can watch a place room" on realtime.messages;
create policy "Live: players can watch a place room"
  on realtime.messages for select to authenticated
  using (
    (select realtime.topic()) ~ '^live:place:[a-z][a-z0-9_]{1,39}:[1-9][0-9]?$'
    and realtime.messages.extension = 'broadcast'
  );
comment on policy "Live: players can watch a place room" on realtime.messages is
  'A signed-in player may listen to the broadcasts of any place room (live:place:<place id>:<room 1 to 99>). Broadcast only, no presence. The messages are positions and preset emotes, only for showing.';

-- A place room: any signed-in player may send their moves and emotes.
drop policy if exists "Live: players can move in a place room" on realtime.messages;
create policy "Live: players can move in a place room"
  on realtime.messages for insert to authenticated
  with check (
    (select realtime.topic()) ~ '^live:place:[a-z][a-z0-9_]{1,39}:[1-9][0-9]?$'
    and realtime.messages.extension = 'broadcast'
  );
comment on policy "Live: players can move in a place room" on realtime.messages is
  'A signed-in player may send broadcasts (their position and preset emotes) in any place room (live:place:<place id>:<room 1 to 99>). Broadcast only, no presence. Nothing sent here changes any game state.';

-- A crew room: only the crew's own members may listen.
-- live_crew_id() gives null for any other topic, and is_crew_member(null) is
-- false, so only a real crew topic of a crew the player sits in is allowed.
drop policy if exists "Live: crew members can hear their crew room" on realtime.messages;
create policy "Live: crew members can hear their crew room"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and public.is_crew_member(public.live_crew_id((select realtime.topic())))
  );
comment on policy "Live: crew members can hear their crew room" on realtime.messages is
  'A signed-in player may listen to the broadcasts of the room live:crew:<crew id> only while they hold a seat in that crew (is_crew_member). Listening only: there is no insert policy for crew rooms, so only the server (secret key, skips row-level security) can send crew events.';

-- No insert policy for crew rooms, no policy for "anon" and no policy for any
-- other topic. Without a policy there is no access.
