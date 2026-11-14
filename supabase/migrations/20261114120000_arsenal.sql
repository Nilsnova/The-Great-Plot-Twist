-- =============================================================================
-- 20261114120000_arsenal.sql
--
-- WHAT IT DOES
--   The shared arsenal of an island (tasks T40 and T41, decision D042): a
--   building on the island where the crew keeps its weapons. Weapons are no
--   longer a personal list of a player; they are COPIES that belong to an
--   island. Every copy has its own identity (an id and a number on the rack,
--   "Pistols #3"); copies of one type share the type's stats.
--
--     arsenal_copies  one row per weapon copy an island owns: its type, its
--                     number on the rack and WHERE it is: holder is null
--                     (stored on the rack) or the one captain who carries
--                     it. One column, so a copy can never be stored and
--                     carried at once, or carried by two captains.
--     arsenal_moves   one row per arsenal click (buy, take, return), keyed by
--                     (player, actionUid): a repeated click is answered and
--                     changes nothing.
--
--     arsenal_capacity()  20: the most copies the rack holds.
--     arsenal_may()       THE permission rule of the arsenal (who may look,
--                         buy, take and return). Today: any active member of
--                         the island's game (the host included). Task T37
--                         replaces this one function to change the rule.
--     arsenal_buy()       a new copy, paid by the buyer's own coins (ledger
--                         reason weapon_purchase, ref arsenal:<actionUid>)
--     arsenal_take()      take a stored copy: a withdraw with empty hands, or
--                         an atomic swap that puts the carried copy back first
--     arsenal_return()    put the carried copy back on the rack
--     arsenal_state()     the arsenal as it is now (for GET /api/island/arsenal)
--     arsenal_convert_island()  turns one player's old personal weapons
--                         (islands.weapons_owned) into copies, lazily, the
--                         first time their arsenal is opened (flag on)
--     arsenal_convert_personal_weapons()  the same for every island, by hand
--
-- WHO USES IT
--   Only the Python server, with the secret key (service_role):
--   backend/server/island/arsenal.py and arsenal_store.py, reached by
--   GET /api/island/arsenal and POST /api/island/arsenal/buy, /take, /return
--   (backend/server/routes/arsenal.py). Prices and unlock waves come from
--   backend/content/islands.json through the server. No browser role gets
--   anything: RLS on, no policy, no grant to anon or authenticated.
--
-- THE RULES THAT THE DATABASE KEEPS
--   1. A copy is stored (holder null) OR carried by exactly one captain. A
--      captain carries at most one copy per island (a unique index). The
--      musket is standard issue: every captain who carries no copy shoots
--      with it, and it is never a copy (the check on weapon).
--   2. At most arsenal_capacity() = 20 copies are STORED per island. Carried
--      copies take no slot. Every function checks it under the island lock,
--      and a deferred constraint trigger checks it again at commit, so even
--      a bug in a function cannot leave 21 copies on the rack.
--   3. Every write locks the island row first (the lock wave_start() takes);
--      arsenal_buy() locks the buyer's wallet before it (the order every
--      paid island function keeps). So two clicks on one island run one
--      after the other: two captains taking the last copy, or two returns
--      into the last free slot, are decided one by one.
--   4. A repeated actionUid answers {status: done, repeat: true} and changes
--      nothing; a buy charges once (the ledger ref is unique, too). An
--      actionUid used for another action or island is refused action_used.
--   5. A return into a full rack is REFUSED (arsenal_full): the copy stays in
--      the captain's hands, nothing is lost. A swap (take while carrying)
--      needs no free slot: one copy goes back, one comes out, in one step.
--   6. A disconnect changes nothing: the copy stays with its holder, who
--      still has it after a reload. A holder who LEFT the game (no longer an
--      active member) keeps it until somebody opens or uses the arsenal: then
--      it goes back on the rack while there is room (the sweep, lowest copy
--      number first). It is never deleted.
--   7. No take, swap, return or buy while a wave runs on the island
--      (wave_running): a fight always uses the loadout it started with.
--   8. Coins move only through apply_wallet_transaction(). Deleting an
--      account deletes the copy that account carried (the account's data
--      goes, D022); every other path keeps every copy.
--
-- THE OLD PERSONAL WEAPONS (islands.weapons_owned)
--   Applying this file changes NO existing row. The feature sits behind the
--   server flag "arsenal" (off by default); while it is off the old personal
--   weapon shop (island_weapon_buy, island_weapon_equip) works as before.
--   With the flag on, the server stops selling personal weapons and
--   arsenal_state() converts an island owner's personal weapons the first
--   time that arsenal is opened: one copy of each on the player's OWN
--   island, the equipped one in their hands, the others on the rack (at most
--   4, far below 20). Then weapons_owned is {musket} and weapon_equipped is
--   musket. arsenal_convert_personal_weapons() does the same for everyone at
--   once (optional). Both are harmless when run again.
--
-- WHAT IT NEEDS
--   Every earlier migration, in particular 20261110010000_islands_and_waves
--   (islands, wave_runs), 20261112030000_captain_skills (weapons_owned,
--   weapon_purchase) and 20261112040000_game_rooms (island_members). It edits
--   none of them.
--
-- SAFE TO RUN TWICE
--   Tables and indexes "if not exists", functions "create or replace", the
--   trigger "drop trigger if exists" first, revokes, grants and comments
--   repeat. Nothing is converted at migration time.
--
-- HOW THE FILE IS ORGANISED
--   1. Tables arsenal_copies and arsenal_moves, rights
--   2. Helpers: arsenal_capacity, arsenal_may, arsenal_wave_running,
--      arsenal_sweep, arsenal_snapshot, the capacity trigger
--   3. arsenal_state()
--   4. arsenal_buy()
--   5. arsenal_take()
--   6. arsenal_return()
--   7. arsenal_convert_island(), arsenal_convert_personal_weapons()
--
-- HOW TO VERIFY (read-only queries, after applying)
--   a. RLS on and no policy:
--        select relname, relrowsecurity from pg_class
--         where relname in ('arsenal_copies', 'arsenal_moves');            -- true, true
--        select count(*) from pg_policies
--         where tablename in ('arsenal_copies', 'arsenal_moves');           -- 0
--   b. No island stores more than 20 copies:
--        select island_owner, count(*) from public.arsenal_copies
--         where holder is null group by island_owner having count(*) > 20; -- no rows
--   c. Nobody carries two copies of one island:
--        select island_owner, holder, count(*) from public.arsenal_copies
--         where holder is not null group by 1, 2 having count(*) > 1;      -- no rows
--   d. Applying changed no player row (before the flag goes on, this is the
--      same number as before applying):
--        select count(*) from public.islands where cardinality(weapons_owned) > 1;
--   e. Only the server may run the functions (browser and visitor false):
--        select p.proname,
--               has_function_privilege('authenticated', p.oid, 'execute') as browser,
--               has_function_privilege('anon', p.oid, 'execute') as visitor,
--               has_function_privilege('service_role', p.oid, 'execute') as server
--          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--         where n.nspname = 'public' and p.proname like 'arsenal_%';
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Tables
-- -----------------------------------------------------------------------------

create table if not exists public.arsenal_copies (
  id            uuid primary key default gen_random_uuid(),
  island_owner  uuid not null references public.islands (player_id) on delete cascade,
  copy_no       integer not null,
  weapon        text not null,
  holder        uuid references public.profiles (id) on delete cascade,
  bought_by     uuid references public.profiles (id) on delete set null,
  source        text not null,
  created_at    timestamptz not null default now(),

  -- The ids repeat backend/content/islands.json (weapons) without the musket:
  -- the musket is standard issue and never a copy.
  constraint arsenal_copies_weapon_known
    check (weapon in ('pistols', 'blunderbuss', 'long_rifle', 'fire_bombs')),
  constraint arsenal_copies_copy_no_range check (copy_no between 1 and 100000),
  constraint arsenal_copies_source_known check (source in ('bought', 'converted')),
  constraint arsenal_copies_copy_no_unique unique (island_owner, copy_no)
);

-- One copy per captain per island: a captain's hands hold one weapon.
create unique index if not exists arsenal_copies_one_per_holder
  on public.arsenal_copies (island_owner, holder) where holder is not null;

comment on table public.arsenal_copies is
  'The weapon copies of an island arsenal (T40, D042). holder null: stored on the rack; else carried by that one captain. At most 20 stored per island. Written only by the arsenal_* functions.';
comment on column public.arsenal_copies.id is 'The identity of this one copy.';
comment on column public.arsenal_copies.island_owner is 'The island (and game) that owns the copy.';
comment on column public.arsenal_copies.copy_no is 'Its number on the rack of this island, shown as Pistols #3. Never reused.';
comment on column public.arsenal_copies.weapon is 'The weapon type; copies of one type share the type stats.';
comment on column public.arsenal_copies.holder is 'Null while stored; else the one captain who carries it.';
comment on column public.arsenal_copies.bought_by is 'Who paid for it (null for a converted weapon whose buyer is gone).';
comment on column public.arsenal_copies.source is 'bought (arsenal_buy) or converted (an old personal weapon).';
comment on column public.arsenal_copies.created_at is 'When the copy came into the arsenal.';

create table if not exists public.arsenal_moves (
  player_id     uuid not null references public.profiles (id) on delete cascade,
  action_uid    text not null,
  island_owner  uuid not null references public.islands (player_id) on delete cascade,
  kind          text not null,
  copy_id       uuid references public.arsenal_copies (id) on delete set null,
  created_at    timestamptz not null default now(),

  primary key (player_id, action_uid),
  constraint arsenal_moves_kind_known check (kind in ('buy', 'take', 'return')),
  constraint arsenal_moves_action_uid_format check (action_uid ~ '^[A-Za-z0-9_-]{8,64}$')
);

comment on table public.arsenal_moves is
  'One row per arsenal click that went through (buy, take, return), so a repeated actionUid changes nothing. Written only by the arsenal_* functions.';
comment on column public.arsenal_moves.player_id is 'Who clicked.';
comment on column public.arsenal_moves.action_uid is 'The click id the browser made; one action per player and id.';
comment on column public.arsenal_moves.island_owner is 'The island whose arsenal it was.';
comment on column public.arsenal_moves.kind is 'buy, take (withdraw or swap) or return.';
comment on column public.arsenal_moves.copy_id is 'The copy bought, taken or returned.';
comment on column public.arsenal_moves.created_at is 'When it happened.';

alter table public.arsenal_copies enable row level security;
alter table public.arsenal_moves enable row level security;

-- No policy: the browser never reads or writes the arsenal tables; the server
-- answers GET /api/island/arsenal. The second lock: every right taken away,
-- then only the server's needs granted back (never delete: a copy leaves only
-- with its island or its holder's account, by cascade).
revoke all on table public.arsenal_copies from public, anon, authenticated, service_role;
revoke all on table public.arsenal_moves from public, anon, authenticated, service_role;
grant select, insert, update on table public.arsenal_copies to service_role;
grant select, insert on table public.arsenal_moves to service_role;


-- -----------------------------------------------------------------------------
-- 2. Helpers
-- -----------------------------------------------------------------------------

-- The most copies one island stores. backend/server/island/arsenal_rules.py
-- keeps the same number (a test compares them).
create or replace function public.arsenal_capacity()
returns integer
language sql
immutable
set search_path = ''
as $$ select 20 $$;

comment on function public.arsenal_capacity() is
  'The most weapon copies one island arsenal stores (20). Carried copies take no slot.';

-- THE permission rule of the arsenal, in one place (T37 replaces it). p_action
-- is look, buy, take or return. Today every action needs an active member of
-- the island's game; the host (the island's owner) always is one. Buying is
-- paid from the buyer's own coins: there is no shared wallet.
create or replace function public.arsenal_may(
  p_player_id     uuid,
  p_island_owner  uuid,
  p_action        text
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_action in ('look', 'buy', 'take', 'return')
     and (
       p_player_id = p_island_owner
       or exists (
         select 1 from public.island_members m
          where m.island_owner = p_island_owner
            and m.player_id = p_player_id
            and m.left_at is null
       )
     )
$$;

comment on function public.arsenal_may(uuid, uuid, text) is
  'Who may use an island arsenal: any active member of its game, the host included, for look, buy, take and return. The one place to change that rule (T37).';

-- A wave "runs" on an island while it has an unfinished wave_runs row within
-- its maximum length: the test island_demolish() and island_research() use.
create or replace function public.arsenal_wave_running(p_island_owner uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.wave_runs
     where island_owner = p_island_owner and finished_at is null
       and starts_at + make_interval(secs => maximum_seconds) >= now()
  )
$$;

comment on function public.arsenal_wave_running(uuid) is
  'True while a wave runs on the island (unfinished and within its maximum length).';

-- Copies carried by captains who left the game go back on the rack while
-- there is room, lowest copy number first. Call it with the island row locked.
create or replace function public.arsenal_sweep(p_island_owner uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_room   integer;
  v_moved  integer;
begin
  select public.arsenal_capacity() - count(*) into v_room
    from public.arsenal_copies where island_owner = p_island_owner and holder is null;
  if v_room <= 0 then
    return 0;
  end if;
  update public.arsenal_copies set holder = null
   where id in (
     select c.id from public.arsenal_copies c
      where c.island_owner = p_island_owner and c.holder is not null
        and not public.arsenal_may(c.holder, p_island_owner, 'look')
      order by c.copy_no
      limit v_room
   );
  get diagnostics v_moved = row_count;
  return v_moved;
end;
$$;

comment on function public.arsenal_sweep(uuid) is
  'Puts copies carried by captains who left the game back on the rack while there is room. Never deletes a copy. Call with the island row locked.';

-- The arsenal as the server answers it: the rack, who carries what, the
-- caller's own copy and whether a wave runs there.
create or replace function public.arsenal_snapshot(p_player_id uuid, p_island_owner uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'capacity', public.arsenal_capacity(),
    'stored', (select count(*) from public.arsenal_copies
                where island_owner = p_island_owner and holder is null),
    'mine', (select id from public.arsenal_copies
              where island_owner = p_island_owner and holder = p_player_id),
    'waveRunning', public.arsenal_wave_running(p_island_owner),
    'copies', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'no', c.copy_no, 'weapon', c.weapon, 'holder', c.holder,
               'holderName', p.display_name,
               'away', c.holder is not null
                       and not public.arsenal_may(c.holder, c.island_owner, 'look'))
             order by c.copy_no)
        from public.arsenal_copies c
        left join public.profiles p on p.id = c.holder
       where c.island_owner = p_island_owner
    ), '[]'::jsonb)
  )
$$;

comment on function public.arsenal_snapshot(uuid, uuid) is
  'The arsenal of an island as JSON: capacity, stored count, the copies with their holders, the caller''s own copy and waveRunning. Read only.';

-- The second lock on rule 2: checked at commit, after every insert and every
-- change of holder (deferred, so a swap may pass through 21 within one step).
create or replace function public.arsenal_check_capacity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.arsenal_copies
       where island_owner = new.island_owner and holder is null) > public.arsenal_capacity() then
    raise exception 'arsenal_over_capacity' using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

drop trigger if exists arsenal_copies_capacity on public.arsenal_copies;
create constraint trigger arsenal_copies_capacity
  after insert or update of holder on public.arsenal_copies
  deferrable initially deferred
  for each row execute function public.arsenal_check_capacity();

comment on function public.arsenal_check_capacity() is
  'Constraint trigger: no island arsenal may store more than arsenal_capacity() copies at commit.';

revoke all on function public.arsenal_capacity() from public, anon, authenticated, service_role;
revoke all on function public.arsenal_may(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.arsenal_wave_running(uuid) from public, anon, authenticated, service_role;
revoke all on function public.arsenal_sweep(uuid) from public, anon, authenticated, service_role;
revoke all on function public.arsenal_snapshot(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.arsenal_check_capacity() from public, anon, authenticated, service_role;
grant execute on function public.arsenal_capacity() to service_role;
grant execute on function public.arsenal_may(uuid, uuid, text) to service_role;
grant execute on function public.arsenal_wave_running(uuid) to service_role;
grant execute on function public.arsenal_sweep(uuid) to service_role;
grant execute on function public.arsenal_snapshot(uuid, uuid) to service_role;
grant execute on function public.arsenal_check_capacity() to service_role;


-- -----------------------------------------------------------------------------
-- 3. arsenal_state(): the arsenal as it is now
-- -----------------------------------------------------------------------------
-- Returns {status: ok, arsenal: <snapshot>} or {status: refused, reason:
-- no_island | not_member}. It sweeps first (rule 6), so it locks the island row.

create or replace function public.arsenal_state(p_player_id uuid, p_island_owner uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if p_player_id is null or p_island_owner is null then
    raise exception 'bad_arsenal_state';
  end if;
  perform 1 from public.islands where player_id = p_island_owner for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_island');
  end if;
  if not public.arsenal_may(p_player_id, p_island_owner, 'look') then
    return jsonb_build_object('status', 'refused', 'reason', 'not_member');
  end if;
  perform public.arsenal_convert_island(p_island_owner);
  perform public.arsenal_sweep(p_island_owner);
  return jsonb_build_object('status', 'ok',
                            'arsenal', public.arsenal_snapshot(p_player_id, p_island_owner));
end;
$$;

revoke all on function public.arsenal_state(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.arsenal_state(uuid, uuid) to service_role;

comment on function public.arsenal_state(uuid, uuid) is
  'The arsenal of an island for one of its members. Locks the island row and returns the copies of departed captains to the rack while there is room. Refuses no_island and not_member. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 4. arsenal_buy(): a new copy, paid with the buyer's own coins
-- -----------------------------------------------------------------------------
--   p_price        the type's price in coins (islands.json)
--   p_unlock_wave  the won wave the type needs; compared with the BUYER's own
--                  unlock wave (the greater of wave_best and won_wave_best of
--                  their own island row), like the old weapon shop
-- The copy goes into the buyer's hands when they carry none on this island,
-- else onto the rack (which needs a free slot).
-- Returns {status: done, repeat, copy, balance, arsenal} or {status: refused,
-- reason: player_not_set_up | no_island | action_used | not_member |
-- wave_running | locked | arsenal_full | insufficient_funds (with price)}.

create or replace function public.arsenal_buy(
  p_player_id     uuid,
  p_island_owner  uuid,
  p_weapon        text,
  p_action_uid    text,
  p_price         integer,
  p_unlock_wave   integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_ref      text;
  v_balance  bigint;
  v_move     public.arsenal_moves;
  v_unlock   integer;
  v_carries  boolean;
  v_stored   integer;
  v_copy     uuid;
begin
  if p_player_id is null or p_island_owner is null
     or p_price is null or p_price < 1 or p_price > 1000000
     or p_unlock_wave is null or p_unlock_wave < 0
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_weapon is null
     or p_weapon not in ('pistols', 'blunderbuss', 'long_rifle', 'fire_bombs') then
    raise exception 'bad_arsenal_buy';
  end if;
  v_ref := 'arsenal:' || p_action_uid;

  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;
  perform 1 from public.islands where player_id = p_island_owner for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_island');
  end if;

  select * into v_move from public.arsenal_moves
   where player_id = p_player_id and action_uid = p_action_uid;
  if found then
    if v_move.kind <> 'buy' or v_move.island_owner <> p_island_owner then
      return jsonb_build_object('status', 'refused', 'reason', 'action_used');
    end if;
    return jsonb_build_object('status', 'done', 'repeat', true, 'copy', v_move.copy_id,
      'balance', v_balance, 'arsenal', public.arsenal_snapshot(p_player_id, p_island_owner));
  end if;

  if not public.arsenal_may(p_player_id, p_island_owner, 'buy') then
    return jsonb_build_object('status', 'refused', 'reason', 'not_member');
  end if;
  if public.arsenal_wave_running(p_island_owner) then
    return jsonb_build_object('status', 'refused', 'reason', 'wave_running');
  end if;
  perform public.arsenal_sweep(p_island_owner);

  select greatest(wave_best, won_wave_best) into v_unlock
    from public.islands where player_id = p_player_id;
  if coalesce(v_unlock, 0) < p_unlock_wave then
    return jsonb_build_object('status', 'refused', 'reason', 'locked');
  end if;

  v_carries := exists (select 1 from public.arsenal_copies
                        where island_owner = p_island_owner and holder = p_player_id);
  select count(*) into v_stored from public.arsenal_copies
   where island_owner = p_island_owner and holder is null;
  if v_carries and v_stored >= public.arsenal_capacity() then
    return jsonb_build_object('status', 'refused', 'reason', 'arsenal_full');
  end if;
  if v_balance < p_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', p_price);
  end if;

  v_balance := public.apply_wallet_transaction(p_player_id, -p_price, 'weapon_purchase', v_ref);
  insert into public.arsenal_copies (island_owner, copy_no, weapon, holder, bought_by, source)
  values (
    p_island_owner,
    coalesce((select max(copy_no) from public.arsenal_copies where island_owner = p_island_owner), 0) + 1,
    p_weapon,
    case when v_carries then null else p_player_id end,
    p_player_id,
    'bought'
  )
  returning id into v_copy;
  insert into public.arsenal_moves (player_id, action_uid, island_owner, kind, copy_id)
  values (p_player_id, p_action_uid, p_island_owner, 'buy', v_copy);

  return jsonb_build_object('status', 'done', 'repeat', false, 'copy', v_copy,
    'balance', v_balance, 'arsenal', public.arsenal_snapshot(p_player_id, p_island_owner));
end;
$$;

revoke all on function public.arsenal_buy(uuid, uuid, text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.arsenal_buy(uuid, uuid, text, text, integer, integer)
  to service_role;

comment on function public.arsenal_buy(uuid, uuid, text, text, integer, integer) is
  'Buys one weapon copy for an island arsenal with the buyer''s own coins (reason weapon_purchase, ref arsenal:<uid>). Into the buyer''s hands when empty, else onto the rack. Locks the wallet, then the island. A repeated actionUid answers repeat: true. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 5. arsenal_take(): withdraw a stored copy, or swap for the one you carry
-- -----------------------------------------------------------------------------
-- Returns {status: done, repeat, copy, swapped (the copy put back, or null),
-- arsenal} or {status: refused, reason: no_island | action_used | not_member
-- | wave_running | no_such_copy | taken}.

create or replace function public.arsenal_take(
  p_player_id     uuid,
  p_island_owner  uuid,
  p_copy_id       uuid,
  p_action_uid    text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_move    public.arsenal_moves;
  v_copy    public.arsenal_copies;
  v_mine    uuid;
begin
  if p_player_id is null or p_island_owner is null or p_copy_id is null
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$' then
    raise exception 'bad_arsenal_take';
  end if;
  perform 1 from public.islands where player_id = p_island_owner for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_island');
  end if;

  select * into v_move from public.arsenal_moves
   where player_id = p_player_id and action_uid = p_action_uid;
  if found then
    if v_move.kind <> 'take' or v_move.island_owner <> p_island_owner then
      return jsonb_build_object('status', 'refused', 'reason', 'action_used');
    end if;
    return jsonb_build_object('status', 'done', 'repeat', true, 'copy', v_move.copy_id,
      'swapped', null, 'arsenal', public.arsenal_snapshot(p_player_id, p_island_owner));
  end if;

  if not public.arsenal_may(p_player_id, p_island_owner, 'take') then
    return jsonb_build_object('status', 'refused', 'reason', 'not_member');
  end if;
  if public.arsenal_wave_running(p_island_owner) then
    return jsonb_build_object('status', 'refused', 'reason', 'wave_running');
  end if;
  perform public.arsenal_sweep(p_island_owner);

  select * into v_copy from public.arsenal_copies
   where id = p_copy_id and island_owner = p_island_owner for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_copy');
  end if;
  if v_copy.holder = p_player_id then
    -- You carry it already: nothing to do (an old click from another tab).
    return jsonb_build_object('status', 'done', 'repeat', true, 'copy', v_copy.id,
      'swapped', null, 'arsenal', public.arsenal_snapshot(p_player_id, p_island_owner));
  end if;
  if v_copy.holder is not null then
    return jsonb_build_object('status', 'refused', 'reason', 'taken');
  end if;

  -- A swap puts the carried copy back first (one copy per captain), then
  -- takes the new one: the rack ends with as many copies as before.
  update public.arsenal_copies set holder = null
   where island_owner = p_island_owner and holder = p_player_id
  returning id into v_mine;
  update public.arsenal_copies set holder = p_player_id where id = v_copy.id;
  insert into public.arsenal_moves (player_id, action_uid, island_owner, kind, copy_id)
  values (p_player_id, p_action_uid, p_island_owner, 'take', v_copy.id);

  return jsonb_build_object('status', 'done', 'repeat', false, 'copy', v_copy.id,
    'swapped', v_mine, 'arsenal', public.arsenal_snapshot(p_player_id, p_island_owner));
end;
$$;

revoke all on function public.arsenal_take(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.arsenal_take(uuid, uuid, uuid, text) to service_role;

comment on function public.arsenal_take(uuid, uuid, uuid, text) is
  'Takes one stored copy from an island arsenal: a withdraw with empty hands, or a swap that puts the carried copy back in the same step (no free slot needed). Locks the island row. Refuses taken when another captain has it. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 6. arsenal_return(): put the carried copy back on the rack
-- -----------------------------------------------------------------------------
-- Returns {status: done, repeat, copy, arsenal} or {status: refused, reason:
-- no_island | action_used | not_member | wave_running | nothing_held |
-- arsenal_full}. A full rack refuses: the copy stays in the captain's hands.

create or replace function public.arsenal_return(
  p_player_id     uuid,
  p_island_owner  uuid,
  p_action_uid    text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_move    public.arsenal_moves;
  v_mine    uuid;
  v_stored  integer;
begin
  if p_player_id is null or p_island_owner is null
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$' then
    raise exception 'bad_arsenal_return';
  end if;
  perform 1 from public.islands where player_id = p_island_owner for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_island');
  end if;

  select * into v_move from public.arsenal_moves
   where player_id = p_player_id and action_uid = p_action_uid;
  if found then
    if v_move.kind <> 'return' or v_move.island_owner <> p_island_owner then
      return jsonb_build_object('status', 'refused', 'reason', 'action_used');
    end if;
    return jsonb_build_object('status', 'done', 'repeat', true, 'copy', v_move.copy_id,
      'arsenal', public.arsenal_snapshot(p_player_id, p_island_owner));
  end if;

  if not public.arsenal_may(p_player_id, p_island_owner, 'return') then
    return jsonb_build_object('status', 'refused', 'reason', 'not_member');
  end if;
  if public.arsenal_wave_running(p_island_owner) then
    return jsonb_build_object('status', 'refused', 'reason', 'wave_running');
  end if;
  perform public.arsenal_sweep(p_island_owner);

  select id into v_mine from public.arsenal_copies
   where island_owner = p_island_owner and holder = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'nothing_held');
  end if;
  select count(*) into v_stored from public.arsenal_copies
   where island_owner = p_island_owner and holder is null;
  if v_stored >= public.arsenal_capacity() then
    return jsonb_build_object('status', 'refused', 'reason', 'arsenal_full');
  end if;

  update public.arsenal_copies set holder = null where id = v_mine;
  insert into public.arsenal_moves (player_id, action_uid, island_owner, kind, copy_id)
  values (p_player_id, p_action_uid, p_island_owner, 'return', v_mine);

  return jsonb_build_object('status', 'done', 'repeat', false, 'copy', v_mine,
    'arsenal', public.arsenal_snapshot(p_player_id, p_island_owner));
end;
$$;

revoke all on function public.arsenal_return(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.arsenal_return(uuid, uuid, text) to service_role;

comment on function public.arsenal_return(uuid, uuid, text) is
  'Puts the copy the captain carries back on the rack of an island arsenal. Locks the island row. A full rack refuses arsenal_full and the copy stays with the captain. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 7. The old personal weapons become copies
-- -----------------------------------------------------------------------------
-- arsenal_convert_island(owner): if the owner's island row still owns weapons
-- besides the musket, one copy of each goes into the owner's OWN island
-- arsenal: the equipped one into their hands, the rest onto the rack while
-- there is room (a weapon with no room stays in weapons_owned for a later
-- run). What was converted leaves weapons_owned; weapon_equipped becomes
-- musket once its weapon is a copy. Call it with the island row locked.
-- arsenal_state() calls it for the island it opens, so a player's weapons
-- arrive the first time anyone opens that arsenal with the flag "arsenal" on.
-- NOTHING runs at migration time: while the flag is off, the old personal
-- weapon shop keeps working exactly as before.
-- arsenal_convert_personal_weapons() runs it for every island (optional, by
-- hand, once the flag is on). Both return the number of copies made and are
-- safe to run any number of times.

create or replace function public.arsenal_convert_island(p_owner uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_island   public.islands;
  v_weapon   text;
  v_carries  boolean;
  v_stored   integer;
  v_holder   uuid;
  v_left     text[] := array['musket'];
  v_made     integer := 0;
begin
  select * into v_island from public.islands where player_id = p_owner;
  if not found or cardinality(v_island.weapons_owned) <= 1 then
    return 0;
  end if;
  foreach v_weapon in array v_island.weapons_owned loop
    continue when v_weapon = 'musket';
    v_carries := exists (select 1 from public.arsenal_copies
                          where island_owner = p_owner and holder = p_owner);
    select count(*) into v_stored from public.arsenal_copies
     where island_owner = p_owner and holder is null;
    if v_weapon = v_island.weapon_equipped and not v_carries then
      v_holder := p_owner;
    elsif v_stored < public.arsenal_capacity() then
      v_holder := null;
    else
      v_left := array_append(v_left, v_weapon);  -- no room: kept for a later run
      continue;
    end if;
    insert into public.arsenal_copies (island_owner, copy_no, weapon, holder, bought_by, source)
    values (
      p_owner,
      coalesce((select max(copy_no) from public.arsenal_copies where island_owner = p_owner), 0) + 1,
      v_weapon, v_holder, p_owner, 'converted'
    );
    v_made := v_made + 1;
  end loop;
  update public.islands
     set weapons_owned = v_left,
         weapon_equipped = case when v_island.weapon_equipped = any (v_left)
                                then v_island.weapon_equipped else 'musket' end
   where player_id = p_owner;
  return v_made;
end;
$$;

revoke all on function public.arsenal_convert_island(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.arsenal_convert_island(uuid) to service_role;

comment on function public.arsenal_convert_island(uuid) is
  'Turns the old personal weapons of one player (islands.weapons_owned) into copies of their own island arsenal: the equipped one carried, the rest stored. Call with the island row locked. Safe to run again. Only service_role may run it.';

create or replace function public.arsenal_convert_personal_weapons()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_owner  uuid;
  v_made   integer := 0;
begin
  for v_owner in
    select player_id from public.islands where cardinality(weapons_owned) > 1
     order by player_id for update
  loop
    v_made := v_made + public.arsenal_convert_island(v_owner);
  end loop;
  return v_made;
end;
$$;

revoke all on function public.arsenal_convert_personal_weapons()
  from public, anon, authenticated, service_role;
grant execute on function public.arsenal_convert_personal_weapons() to service_role;

comment on function public.arsenal_convert_personal_weapons() is
  'Runs arsenal_convert_island() for every island that still owns personal weapons. Optional, by hand, once the flag arsenal is on. Safe to run again. Only service_role may run it.';
