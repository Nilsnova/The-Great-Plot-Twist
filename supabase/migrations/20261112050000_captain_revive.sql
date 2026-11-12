-- =============================================================================
-- 20261112050000_captain_revive.sql
--
-- WHAT IT DOES
--   The database part of captain health (docs/GAME-V3.md section 3, lane H):
--   a captain who falls in a pirate wave can be helped up by a teammate who
--   stands next to them and holds E for 2 seconds. The helper pays for it in
--   coins: 20 + 5 x the wave number (backend/content/islands.json "revive").
--   Falling and standing up happen in every player's browser (the wave's
--   simulation); only the payment is here.
--
--     captain_revives   one row per paid revive: the click (actionUid) that
--                       paid it, the wave, the fallen captain's id in the
--                       wave and the price, so a repeated click is answered,
--                       not paid twice
--
--     wave_revive()     one revive, paid in coins through the wallet ledger
--                       (reason captain_revive, ref revive:<uid>), only by a
--                       member of the game who is in that wave and has not
--                       finished it, while the wave runs
--
--     wallet reason     captain_revive (spend).
--
-- WHO USES IT
--   Only the Python server, with the secret key (service_role): POST
--   /api/waves/revive in backend/server/routes/waves.py. The price numbers
--   come from backend/content/islands.json through the server; the database
--   takes the wave number from its own wave row, so the browser never sets
--   the price. No browser role gets anything new.
--
-- THE RULES THAT THE DATABASE KEEPS
--   1. Play money only; coins move only through apply_wallet_transaction().
--   2. Every revive is safe to repeat: its row in captain_revives (player,
--      ref revive:<uid>) and its ledger row (player, captain_revive,
--      revive:<uid>). A repeat answers {status: done, repeat: true} with the
--      price it paid and changes nothing.
--   3. The wallet is locked first, before anything else is read.
--   4. Only a player in the wave (wave_participants) pays, before their own
--      finish and while the wave runs (from starts_at to its maximum
--      length); on somebody else's island only a member of that game
--      (island_members, not left; the owner always).
--   5. The price is p_base + p_per_wave x the wave's own number.
--
-- WHAT IT NEEDS
--   Every earlier migration, in particular 20261110010000_islands_and_waves.sql
--   (wave_runs), 20261110020000_wave_crews.sql (wave_participants) and
--   20261112040000_game_rooms.sql (island_members).
--
-- SAFE TO RUN TWICE
--   The table and its index use "if not exists", the reason "on conflict do
--   nothing", the function "create or replace", and revokes, grants and
--   comments repeat.
--
-- HOW THE FILE IS ORGANISED
--   1. One wallet reason
--   2. Table captain_revives
--   3. wave_revive()
--
-- HOW TO VERIFY (read-only queries, after applying)
--   a. select relrowsecurity from pg_class where relname = 'captain_revives';  -- true
--      select count(*) from pg_policies where tablename = 'captain_revives';   -- 0
--   b. select reason, direction from public.wallet_reasons
--       where reason = 'captain_revive';                                      -- 1 row, spend
--   c. Only the server may run the function (browser and visitor false):
--      select has_function_privilege('authenticated', p.oid, 'execute') as browser,
--             has_function_privilege('anon', p.oid, 'execute') as visitor,
--             has_function_privilege('service_role', p.oid, 'execute') as server
--        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'public' and p.proname = 'wave_revive';
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. One wallet reason
-- -----------------------------------------------------------------------------
-- The same pair ends WALLET_REASONS in backend/server/wallet.py (a test compares
-- them).

insert into public.wallet_reasons (reason, direction, description) values
  ('captain_revive', 'spend', 'Helping a fallen captain back up during a pirate wave.')
on conflict (reason) do nothing;


-- -----------------------------------------------------------------------------
-- 2. Table captain_revives: one row per paid revive, by its click
-- -----------------------------------------------------------------------------

create table if not exists public.captain_revives (
  player_id   uuid not null references public.profiles (id) on delete cascade,
  ref         text not null,
  wave_id     uuid not null references public.wave_runs (id) on delete cascade,
  fallen      text not null,
  price       integer not null,
  revived_at  timestamptz not null default now(),

  primary key (player_id, ref),
  constraint captain_revives_ref_format check (ref ~ '^revive:[A-Za-z0-9_-]{8,64}$'),
  -- The fallen captain's id in the wave's simulation (frontend/src/pirates/sync.js BY).
  constraint captain_revives_fallen_format check (fallen ~ '^[A-Za-z0-9_.:-]{1,64}$'),
  -- The biggest change the wallet allows (MAX_DELTA in backend/server/wallet.py).
  constraint captain_revives_price_range check (price between 1 and 1000000)
);

-- The revives of one wave, also for the cascade when a wave run is deleted.
create index if not exists captain_revives_wave_idx on public.captain_revives (wave_id);

comment on table public.captain_revives is
  'One row per revive a player paid for in a pirate wave (docs/GAME-V3.md section 3): the click that paid it (ref revive:<actionUid>), so a repeated click is answered and never pays twice. Written only by wave_revive(). No browser access.';
comment on column public.captain_revives.player_id is
  'The helper who paid. Deleting the player deletes the row.';
comment on column public.captain_revives.ref is
  'revive:<actionUid>, the click id the browser made (8 to 64 letters, digits, hyphens or underscores). The same ref is on the ledger row.';
comment on column public.captain_revives.wave_id is
  'The wave the revive happened in. Deleting the wave run deletes the row.';
comment on column public.captain_revives.fallen is
  'The fallen captain''s id in the wave''s simulation, as the browser sent it. Shown only; never checked against a player.';
comment on column public.captain_revives.price is
  'The coins paid: base + per wave x the wave number, from backend/content/islands.json.';
comment on column public.captain_revives.revived_at is
  'When it was paid. Set by the database.';

-- Row-level security on and no policy: no browser role sees a row.
--   service_role  read, insert (wave_revive); no update, no delete
alter table public.captain_revives enable row level security;
revoke all on table public.captain_revives from public, anon, authenticated, service_role;
grant select, insert on table public.captain_revives to service_role;


-- -----------------------------------------------------------------------------
-- 3. wave_revive(): one revive, paid by the helper
-- -----------------------------------------------------------------------------
--   p_player_id   the helper (the signed-in player)
--   p_wave_id     the wave they are in
--   p_fallen      the fallen captain's id in the wave's simulation
--   p_action_uid  the click id: one per hold of E
--   p_base, p_per_wave  the price: p_base + p_per_wave x the wave number (islands.json)
--
-- Returns {status: done, price, balance, repeat} or {status: refused, reason:
-- player_not_set_up | no_such_wave | not_member | not_in_wave | wave_over |
-- insufficient_funds (with price)}. Nothing changes on a refusal.

create or replace function public.wave_revive(
  p_player_id   uuid,
  p_wave_id     uuid,
  p_fallen      text,
  p_action_uid  text,
  p_base        integer,
  p_per_wave    integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_ref      text;
  v_balance  bigint;
  v_run      public.wave_runs;
  v_joined   public.wave_participants;
  v_done     public.captain_revives;
  v_price    integer;
begin
  if p_player_id is null or p_wave_id is null
     or p_fallen is null or p_fallen !~ '^[A-Za-z0-9_.:-]{1,64}$'
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_base is null or p_base < 1 or p_base > 1000
     or p_per_wave is null or p_per_wave < 0 or p_per_wave > 1000 then
    raise exception 'bad_wave_revive';
  end if;
  v_ref := 'revive:' || p_action_uid;

  -- The wallet first, as every paid action does.
  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  -- A repeated click answers what it paid.
  select * into v_done from public.captain_revives where player_id = p_player_id and ref = v_ref;
  if found then
    return jsonb_build_object('status', 'done', 'price', v_done.price, 'balance', v_balance, 'repeat', true);
  end if;

  -- The wave, read without a lock (the finish locks it; the wallet is held already).
  select * into v_run from public.wave_runs where id = p_wave_id;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_such_wave');
  end if;
  if v_run.place = 'island' and v_run.island_owner <> p_player_id and not exists (
    select 1 from public.island_members
     where island_owner = v_run.island_owner and player_id = p_player_id and left_at is null
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'not_member');
  end if;
  select * into v_joined from public.wave_participants where wave_id = p_wave_id and player_id = p_player_id;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'not_in_wave');
  end if;
  if v_joined.finished_at is not null
     or now() < v_run.starts_at
     or now() > v_run.starts_at + make_interval(secs => v_run.maximum_seconds) then
    return jsonb_build_object('status', 'refused', 'reason', 'wave_over');
  end if;

  v_price := p_base + p_per_wave * v_run.wave;
  if v_balance < v_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', v_price);
  end if;

  v_balance := public.apply_wallet_transaction(p_player_id, -v_price, 'captain_revive', v_ref);
  insert into public.captain_revives (player_id, ref, wave_id, fallen, price)
  values (p_player_id, v_ref, p_wave_id, p_fallen, v_price);

  return jsonb_build_object('status', 'done', 'price', v_price, 'balance', v_balance, 'repeat', false);
end;
$$;

revoke all on function public.wave_revive(uuid, uuid, text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.wave_revive(uuid, uuid, text, text, integer, integer)
  to service_role;

comment on function public.wave_revive(uuid, uuid, text, text, integer, integer) is
  'Pays for helping a fallen captain up in a pirate wave (docs/GAME-V3.md section 3): p_base + p_per_wave x the wave number, from the helper''s wallet (reason captain_revive, ref revive:<actionUid>). Locks the wallet first. Only a player in the wave who has not finished it, while it runs; on somebody else''s island only a member of that game. A repeated actionUid answers {status: done, repeat: true} with the price it paid. Refuses player_not_set_up, no_such_wave, not_member, not_in_wave, wave_over and insufficient_funds, with nothing changed. Raises bad_wave_revive for a bad argument. Only service_role may run it.';
