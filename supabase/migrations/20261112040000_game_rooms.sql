-- =============================================================================
-- 20261112040000_game_rooms.sql
--
-- WHAT IT DOES
--   The database part of the v3 rooms (docs/GAME-V3.md section 2, lane R):
--   create a game, join it with its code, see your games under Continue, and
--   leave one. Up to 10 players play on one island.
--
--   The model, in one line: A GAME IS AN ISLAND. Every player still has one
--   island (islands, one row per player); that island is the game the player
--   HOSTS, and its code (ISLE-<code>) is the game's code. A player may be a
--   MEMBER of any number of other players' games. Existing progress therefore
--   stays where it is: a player's island, its buildings and its best wave are
--   their first game.
--
--     island_members   one row per player in a game: the island's owner (the
--                      host, role host) and everyone who joined it (role
--                      member), when they joined, when they last opened it
--                      (the order of Continue) and when they left (left_at;
--                      null while they are in)
--
--     game_join()      the host opens their own game, or a player joins one by
--                      its code. At most p_max_members active members (the
--                      host counts), checked under a lock of the island row,
--                      so two joins at once cannot pass the limit. A repeat
--                      only stamps opened_at. A player who left joins again
--                      like a new member.
--     game_leave()     a member leaves a game (left_at). The host cannot leave
--                      their own game. Leaving twice changes nothing.
--     game_list()      the games of one player for Continue, newest first:
--                      their own island and every game they are an active
--                      member of, with the host's name, the best wave and the
--                      number of active members.
--     game_members()   the active members of one game, host first, with their
--                      captain names (the lobby).
--
--   Backfill: every existing island gets its host row, and every player who
--   fought a wave on somebody else's island becomes a member of that game (the
--   9 most recent per island), so tonight's friends find their game under
--   Continue.
--
-- WHO USES IT
--   Only the Python server, with the secret key (service_role): the routes
--   POST /api/games, POST /api/games/join (and its alias POST
--   /api/island/invite/join), GET /api/games, GET /api/games/{code} and POST
--   /api/games/leave (backend/server/island/games.py), and the membership check
--   of the co-op build, upgrade and bell. The browser never reads the new
--   table: row-level security on and no policy, nothing granted to anon or
--   authenticated. Who is online comes from the presence of the island's room
--   (live:place:isle_<code>:1), not from here.
--
-- THE RULES THAT THE DATABASE KEEPS
--   1. The host of a game is the owner of its island, always, and only the
--      owner has role host (island_members_host_is_owner).
--   2. A game has at most p_max_members active members, the host included
--      (the server passes 10). game_join() locks the island row first (the
--      lock wave_start() takes too), counts, and only then inserts, so two
--      joins at once run one after the other.
--   3. A player is in a game once (primary key island_owner, player_id).
--      Leaving sets left_at; joining again clears it and counts again.
--   4. The host never leaves (game_leave refuses host_cannot_leave, and the
--      check island_members_host_stays keeps left_at empty on the host row).
--   5. Nothing here moves coins. Coins stay in each player's own wallet.
--   6. Someone who is not signed in (role anon), and every browser role, gets
--      nothing from the new table and functions.
--
-- WHAT IT NEEDS
--   Every earlier migration, in particular 20261110010000_islands_and_waves.sql
--   (islands, wave_runs), 20261110020000_wave_crews.sql (wave_participants)
--   and the profiles of the foundation. It edits none of them.
--
-- SAFE TO RUN TWICE
--   The table and indexes use "if not exists", the backfills "on conflict do
--   nothing", functions "create or replace", and revokes, grants and comments
--   simply repeat. A second run changes nothing.
--
-- HOW THE FILE IS ORGANISED
--   1. Table island_members, rights
--   2. Backfill: hosts, and the friends who fought on an island
--   3. game_join()
--   4. game_leave()
--   5. game_list()
--   6. game_members()
--
-- HOW TO VERIFY (read-only queries, after applying)
--   a. RLS on and no policy:
--        select relrowsecurity from pg_class where relname = 'island_members';  -- true
--        select count(*) from pg_policies where tablename = 'island_members';   -- 0
--   b. Every island has its host row:
--        select count(*) from public.islands i
--         where not exists (select 1 from public.island_members m
--                            where m.island_owner = i.player_id and m.role = 'host'); -- 0
--   c. No game has more than 10 active members:
--        select island_owner, count(*) from public.island_members
--         where left_at is null group by island_owner having count(*) > 10;   -- no rows
--   d. Only the server may run the new functions (browser and visitor false):
--        select p.proname,
--               has_function_privilege('authenticated', p.oid, 'execute') as browser,
--               has_function_privilege('anon', p.oid, 'execute') as visitor,
--               has_function_privilege('service_role', p.oid, 'execute') as server
--          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--         where n.nspname = 'public'
--           and p.proname in ('game_join', 'game_leave', 'game_list', 'game_members');
--   e. The browser roles cannot read the table (both false):
--        select has_table_privilege('authenticated', 'public.island_members', 'select'),
--               has_table_privilege('anon', 'public.island_members', 'select');
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Table island_members: who is in which game
-- -----------------------------------------------------------------------------

create table if not exists public.island_members (
  island_owner  uuid not null references public.islands (player_id) on delete cascade,
  player_id     uuid not null references public.profiles (id) on delete cascade,
  role          text not null,
  joined_at     timestamptz not null default now(),
  opened_at     timestamptz not null default now(),
  left_at       timestamptz,

  primary key (island_owner, player_id),
  constraint island_members_role_allowed
    check (role in ('host', 'member')),
  -- The host is the island's owner, and the owner is the host.
  constraint island_members_host_is_owner
    check ((role = 'host') = (player_id = island_owner)),
  -- The host never leaves their own game.
  constraint island_members_host_stays
    check (role = 'member' or left_at is null)
);

-- Continue: the games of one player, newest first.
create index if not exists island_members_player_idx
  on public.island_members (player_id, opened_at desc)
  where left_at is null;

comment on table public.island_members is
  'One row per player in a game (docs/GAME-V3.md section 2). A game is an island: its owner is the host (role host), everyone who joined it with its code is a member. left_at is set when a member leaves. At most 10 active members per game, checked by game_join() under a lock. Written only by game_join() and game_leave(). No browser access.';
comment on column public.island_members.island_owner is
  'The game: the owner of its island (islands.player_id), who is its host. Deleting the island deletes its members.';
comment on column public.island_members.player_id is
  'The player in the game. Deleting the player deletes the row.';
comment on column public.island_members.role is
  'host (the island''s owner) or member (joined with the code).';
comment on column public.island_members.joined_at is
  'When the player joined (again, after a leave). Set by the database.';
comment on column public.island_members.opened_at is
  'When the player last opened the game: Continue shows the newest first. Set by the database.';
comment on column public.island_members.left_at is
  'When the member left the game in the Menu; null while they are in. Always null for the host.';

-- Row-level security on and no policy: no browser role sees a row.
--   anon, authenticated  nothing
--   service_role         read, insert (game_join), update (game_join, game_leave); no delete
alter table public.island_members enable row level security;
revoke all on table public.island_members from public, anon, authenticated, service_role;
grant select, insert, update on table public.island_members to service_role;


-- -----------------------------------------------------------------------------
-- 2. Backfill: every island's host, and the friends who fought on an island
-- -----------------------------------------------------------------------------
-- Existing progress becomes the first game: the owner of every island is its
-- host. A player who fought a wave on somebody else's island becomes a member
-- of that game, the 9 most recent per island (with the host that makes 10).

insert into public.island_members (island_owner, player_id, role, joined_at, opened_at)
select i.player_id, i.player_id, 'host', i.created_at, greatest(i.created_at, i.updated_at)
  from public.islands i
on conflict (island_owner, player_id) do nothing;

insert into public.island_members (island_owner, player_id, role, joined_at, opened_at)
select friends.island_owner, friends.player_id, 'member', friends.first_at, friends.last_at
  from (
    select r.island_owner, p.player_id,
           min(p.joined_at) as first_at, max(p.joined_at) as last_at,
           row_number() over (partition by r.island_owner order by max(p.joined_at) desc) as rank
      from public.wave_participants p
      join public.wave_runs r on r.id = p.wave_id
     where r.place = 'island' and r.island_owner is not null and p.player_id <> r.island_owner
     group by r.island_owner, p.player_id
  ) friends
 where friends.rank <= 9
   -- First run only: an island that already has members keeps them, so running this again by hand
   -- after live joins and leaves never goes past the cap of 10.
   and not exists (select 1 from public.island_members m
                    where m.island_owner = friends.island_owner and m.role = 'member')
on conflict (island_owner, player_id) do nothing;


-- -----------------------------------------------------------------------------
-- 3. game_join(): open your own game, or join one by its code
-- -----------------------------------------------------------------------------
--   p_player_id    the verified player
--   p_island_owner the game (the owner of the island the code names)
--   p_max_members  the most active members, the host included (the server
--                  passes 10, docs/GAME-V3.md section 2)
--
-- In one transaction it:
--   1. checks the arguments (bad_game_join),
--   2. locks the island row (no_such_game when there is none), so two joins
--      of one game run one after the other,
--   3. checks that the player has a profile (player_not_set_up),
--   4. for the owner: makes or stamps the host row (role host),
--   5. for anyone already in: stamps opened_at (repeat: true),
--   6. counts the active members and refuses game_full at p_max_members,
--   7. writes the member row, or clears left_at of a player who left.
--
-- Returns {status: joined, role: host | member, members: active members now,
-- repeat: true | false} or {status: refused, reason: no_such_game |
-- player_not_set_up | game_full, members} with nothing changed.

create or replace function public.game_join(
  p_player_id    uuid,
  p_island_owner uuid,
  p_max_members  integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_member  public.island_members;
  v_count   integer;
begin
  if p_player_id is null or p_island_owner is null
     or p_max_members is null or p_max_members not between 2 and 50 then
    raise exception 'bad_game_join';
  end if;

  perform 1 from public.islands where player_id = p_island_owner for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_game', 'members', 0);
  end if;
  if not exists (select 1 from public.profiles where id = p_player_id) then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up', 'members', 0);
  end if;

  select * into v_member
    from public.island_members
   where island_owner = p_island_owner and player_id = p_player_id;

  -- The host: always in, never counted against the door.
  if p_player_id = p_island_owner then
    insert into public.island_members (island_owner, player_id, role)
    values (p_island_owner, p_player_id, 'host')
    on conflict (island_owner, player_id) do update set opened_at = now();
  elsif v_member.player_id is not null and v_member.left_at is null then
    update public.island_members set opened_at = now()
     where island_owner = p_island_owner and player_id = p_player_id;
  else
    -- Active members, the host counted once whether or not the row exists yet.
    select count(*) + 1 into v_count
      from public.island_members
     where island_owner = p_island_owner and left_at is null and player_id <> p_island_owner;
    if v_count >= p_max_members then
      return jsonb_build_object('status', 'refused', 'reason', 'game_full', 'members', v_count);
    end if;
    insert into public.island_members (island_owner, player_id, role)
    values (p_island_owner, p_player_id, 'member')
    on conflict (island_owner, player_id) do update
      set left_at = null, joined_at = now(), opened_at = now();
  end if;

  select count(*) + 1 into v_count
    from public.island_members
   where island_owner = p_island_owner and left_at is null and player_id <> p_island_owner;

  return jsonb_build_object(
    'status', 'joined',
    'role', case when p_player_id = p_island_owner then 'host' else 'member' end,
    'members', v_count,
    'repeat', p_player_id = p_island_owner and v_member.player_id is not null
              or (v_member.player_id is not null and v_member.left_at is null)
  );
end;
$$;

revoke all on function public.game_join(uuid, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.game_join(uuid, uuid, integer) to service_role;

comment on function public.game_join(uuid, uuid, integer) is
  'Opens a game for p_player_id: the owner of the island p_island_owner gets or stamps their host row; anyone else becomes an active member, unless the game already has p_max_members active members (the host included; refused game_full). Locks the island row first, so joins of one game run one after the other. A repeat only stamps opened_at. Returns {status: joined, role, members, repeat} or {status: refused, reason: no_such_game | player_not_set_up | game_full, members}. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 4. game_leave(): a member leaves a game
-- -----------------------------------------------------------------------------
-- Returns {status: left, repeat: true | false} (leaving a game you are not in
-- changes nothing) or {status: refused, reason: no_such_game |
-- host_cannot_leave}.

create or replace function public.game_leave(
  p_player_id    uuid,
  p_island_owner uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
begin
  if p_player_id is null or p_island_owner is null then
    raise exception 'bad_game_leave';
  end if;

  perform 1 from public.islands where player_id = p_island_owner for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_game');
  end if;
  if p_player_id = p_island_owner then
    return jsonb_build_object('status', 'refused', 'reason', 'host_cannot_leave');
  end if;

  update public.island_members set left_at = now()
   where island_owner = p_island_owner and player_id = p_player_id and left_at is null;

  return jsonb_build_object('status', 'left', 'repeat', not found);
end;
$$;

revoke all on function public.game_leave(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.game_leave(uuid, uuid) to service_role;

comment on function public.game_leave(uuid, uuid) is
  'A member leaves the game of the island p_island_owner (left_at). The host cannot leave (refused host_cannot_leave). Leaving a game you are not in changes nothing (repeat: true). Returns {status: left, repeat} or {status: refused, reason: no_such_game | host_cannot_leave}. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 5. game_list(): the games of one player, for Continue
-- -----------------------------------------------------------------------------
-- The player's own island (as host, even before a host row exists) and every
-- game they are an active member of, newest first (opened_at), at most
-- p_limit. Each: {code, hostId, hostName, role, waveBest, members, openedAt}.

create or replace function public.game_list(
  p_player_id uuid,
  p_limit     integer
)
returns jsonb
language sql
stable
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
  select coalesce(jsonb_agg(game order by game ->> 'openedAt' desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'code', i.code,
               'hostId', i.player_id,
               'hostName', p.display_name,
               'role', case when i.player_id = p_player_id then 'host' else 'member' end,
               'waveBest', i.wave_best,
               'members', 1 + (select count(*) from public.island_members x
                                where x.island_owner = i.player_id and x.left_at is null
                                  and x.player_id <> i.player_id),
               'openedAt', to_char(coalesce(m.opened_at, i.updated_at) at time zone 'UTC',
                                   'YYYY-MM-DD"T"HH24:MI:SS"Z"')
             ) as game
        from public.islands i
        join public.profiles p on p.id = i.player_id
        left join public.island_members m
          on m.island_owner = i.player_id and m.player_id = p_player_id
       where p_player_id is not null
         and (i.player_id = p_player_id or (m.player_id is not null and m.left_at is null))
       order by coalesce(m.opened_at, i.updated_at) desc
       limit greatest(1, least(coalesce(p_limit, 20), 50))
    ) games;
$$;

revoke all on function public.game_list(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.game_list(uuid, integer) to service_role;

comment on function public.game_list(uuid, integer) is
  'The games of p_player_id for Continue, newest first: their own island (as host) and every game they are an active member of, at most p_limit (1 to 50). A JSON list of {code, hostId, hostName, role, waveBest, members, openedAt}. Reads only. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 6. game_members(): the lobby of one game
-- -----------------------------------------------------------------------------
-- The active members of the game of p_island_owner, the host first, then by
-- when they joined: a JSON list of {id, name, role}. The host is listed even
-- before their host row exists.

create or replace function public.game_members(
  p_island_owner uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', who.id, 'name', who.name, 'role', who.role)
                            order by who.host desc, who.joined_at), '[]'::jsonb)
    from (
      select p.id, p.display_name as name, 'host' as role, true as host, i.created_at as joined_at
        from public.islands i
        join public.profiles p on p.id = i.player_id
       where i.player_id = p_island_owner
      union all
      select p.id, p.display_name, 'member', false, m.joined_at
        from public.island_members m
        join public.profiles p on p.id = m.player_id
       where m.island_owner = p_island_owner and m.left_at is null
         and m.player_id <> p_island_owner
    ) who;
$$;

revoke all on function public.game_members(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.game_members(uuid) to service_role;

comment on function public.game_members(uuid) is
  'The lobby of the game of p_island_owner: its host and its active members, host first, then by when they joined, as a JSON list of {id, name, role}. Reads only. Only service_role may run it.';
