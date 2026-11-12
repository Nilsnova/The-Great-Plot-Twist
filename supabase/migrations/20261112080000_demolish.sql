-- =============================================================================
-- 20261112080000_demolish.sql
--
-- WHAT IT DOES
--   Tearing a building down between waves, with coins back (the owner's
--   decision of 12 Nov, docs/GAME-V3.md section 4.2): any member of the game
--   may tear down a building on the game's island while no wave runs there.
--   Every player who paid for that building gets back half of what they
--   themselves paid for it (the build and every level they paid for, rounded
--   down). Nobody gets coins a teammate paid. The spot is empty again, and
--   the building's tower skill goes with it.
--
--     building_payments     one row per paid level of a building on an island:
--                           who paid how many coins for level 1 (the build) or
--                           for each upgrade, tied to that one building by its
--                           islet_buildings.ref. Written by island_build() and
--                           island_upgrade() from now on.
--     building_demolitions  one row per building torn down: who did it (the
--                           click, demolish:<uid>), which building, and the
--                           refunds paid, so a repeated click is answered and
--                           never pays twice.
--
--     island_build()        replaced: the co-op build also writes its
--                           building_payments row. Nothing else changes.
--     island_upgrade()      replaced: an upgrade also writes its
--                           building_payments row. Nothing else changes.
--     island_refund_split() who gets how many coins back for one building
--                           (read only; used by the two functions below)
--     island_demolish_quote()  the refund per payer, for the confirmation card
--                           (read only, nothing is locked or changed)
--     island_demolish()     tears the building down and pays the refunds
--
--     wallet reason         building_refund (earn).
--
-- WHO USES IT
--   Only the Python server, with the secret key (service_role): GET and POST
--   /api/island/demolish in backend/server/routes/island.py. The price lists
--   come from backend/content/islands.json through the server; the database
--   works out every amount itself, never the browser. No browser role gets
--   anything new.
--
-- HOW A PAYMENT IS TIED TO A BUILDING
--   The ledger alone cannot do it: an upgrade's ledger row says only
--   building_purchase and upgrade:<uid>, not which spot or which building it
--   paid for, and a spot can hold several buildings one after the other. So
--   island_build() and island_upgrade() now write one building_payments row
--   per paid level, keyed by (island_owner, building_ref, level), where
--   building_ref is the islet_buildings.ref of that one building (island:<uid>
--   of the click that built it). A building rebuilt on the same spot has a new
--   ref, so it never inherits the rows of the one before.
--
--   The host's own builds go through islet_build() of the home islet, which is
--   not changed: their level 1 has no row, and a level without a row counts as
--   paid by the host (below), which is who paid it.
--
-- BUILDINGS FROM BEFORE THIS MIGRATION (no payment rows)
--   Every level of a building that has no building_payments row counts as paid
--   by the island's host, at the catalogue price of that level (islands.json,
--   sent by the server). So a building from before this migration gives the
--   host back half of the catalogue value of its current level, and a building
--   built before and upgraded after gives the host half of the old levels and
--   each later payer half of what they paid. A payer whose account was deleted
--   (payer null) gets nothing; their coins are not handed to anybody else.
--
-- THE RULES THAT THE DATABASE KEEPS
--   1. Play money only; coins move only through apply_wallet_transaction(),
--      reason building_refund, ref demolish:<uid> in every refunded wallet.
--   2. Only a member of the game tears down: the island's owner (the host) or
--      a player with an island_members row of that island with no left_at.
--   3. Never while a wave runs on that island (a wave that has a row, is not
--      finished and is not past its maximum length, its countdown included):
--      refused wave_running. The wave's simulation reads the buildings when the
--      wave starts, so it never sees a building disappear in the middle.
--   4. Only the island's build spots: wall_1..wall_12, cannon_1..cannon_7,
--      tower_1, house_1, house_2. Anything else is refused protected: the
--      heart of the island (the cabin) and the harbor bell have no row at all,
--      the Harbor, the Tech hub and the wreck are campaign buildings without a
--      row, and the home islet's buildings (workshop, windmill, greenhouse and
--      the signal station that the finale counts on) are never removed.
--      Pirate Point's buildings (pirate_point_buildings) are not touched.
--   5. Safe to repeat: the building_demolitions row (player, demolish:<uid>).
--      A repeat answers {status: done, repeat: true} with the same refunds.
--   6. Refunded once: the building row is deleted and its payment rows are
--      marked refunded_by in the same step; a second click with another uid
--      finds no building (not_built).
--   7. Locks, in the order of the other money functions: the wallets first
--      (every payer of the building and the host, in player id order, so two
--      tear-downs never wait on each other in a circle), then the island row
--      (the lock wave_start() takes, so a bell and a tear-down run one after
--      the other), then the building row (the lock island_upgrade() takes). A
--      payer who paid between the first read and the building lock (an upgrade
--      that got in first) is a wallet that is not locked: refused busy, and
--      nothing changed; the next click works.
--
-- WHAT IT NEEDS
--   Every earlier migration, in particular 20261111030000_tower_defense.sql
--   (island_build), 20261112070000_tower_tiers.sql (island_upgrade, up to five
--   levels), 20261112040000_game_rooms.sql (island_members) and
--   20261112060000_tech_hub.sql (islet_buildings.spec).
--
-- SAFE TO RUN TWICE
--   The tables use "if not exists", the reason "on conflict do nothing", check
--   rules are dropped "if exists" first, functions use "create or replace", and
--   revokes, grants and comments repeat.
--
-- HOW THE FILE IS ORGANISED
--   1. One wallet reason
--   2. Table building_payments
--   3. Table building_demolitions
--   4. island_build(), now with its payment row
--   5. island_upgrade(), now with its payment row
--   6. island_refund_split()
--   7. island_demolish_quote()
--   8. island_demolish()
--
-- HOW TO VERIFY (read-only queries, after applying)
--   a. select relname, relrowsecurity from pg_class
--       where relname in ('building_payments', 'building_demolitions');      -- 2 rows, true
--      select count(*) from pg_policies
--       where tablename in ('building_payments', 'building_demolitions');     -- 0
--   b. select reason, direction from public.wallet_reasons
--       where reason = 'building_refund';                                    -- 1 row, earn
--   c. select count(*) from public.building_payments;                         -- 0 until a build
--   d. Only the server may run the functions (browser and visitor false):
--      select p.proname,
--             has_function_privilege('authenticated', p.oid, 'execute') as browser,
--             has_function_privilege('anon', p.oid, 'execute') as visitor,
--             has_function_privilege('service_role', p.oid, 'execute') as server
--        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'public'
--         and p.proname in ('island_build', 'island_upgrade', 'island_refund_split',
--                           'island_demolish_quote', 'island_demolish');
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. One wallet reason
-- -----------------------------------------------------------------------------
-- The same pair ends WALLET_REASONS in backend/server/wallet.py (a test compares
-- them).

insert into public.wallet_reasons (reason, direction, description) values
  ('building_refund', 'earn', 'Half of what you paid for a building on an island, back when a member of the game tears it down.')
on conflict (reason) do nothing;


-- -----------------------------------------------------------------------------
-- 2. Table building_payments: who paid for each level of a building
-- -----------------------------------------------------------------------------

create table if not exists public.building_payments (
  island_owner  uuid not null references public.islets (player_id) on delete cascade,
  plot          text not null,
  building_ref  text not null,
  level         smallint not null,
  -- set null, not cascade: the row stays when the payer deletes their account (nobody gets it back then).
  payer         uuid references public.profiles (id) on delete set null,
  coins         integer not null,
  ref           text not null,
  paid_at       timestamptz not null default now(),
  refunded_by   text,

  primary key (island_owner, building_ref, level),
  constraint building_payments_level_range
    check (level between 1 and 5),
  constraint building_payments_coins_range
    check (coins between 1 and 1000000),
  constraint building_payments_ref_format
    check (ref ~ '^(island|upgrade):[A-Za-z0-9_-]{8,64}$'),
  constraint building_payments_refunded_by_format
    check (refunded_by is null or refunded_by ~ '^demolish:[A-Za-z0-9_-]{8,64}$')
);

comment on table public.building_payments is
  'One row per paid level of a building on an island (docs/GAME-V3.md section 4.2): who paid how many coins for it. Written by island_build() (level 1 of a co-op build) and island_upgrade() (every level up); island_demolish() refunds half of them and marks them refunded_by. A level with no row counts as paid by the host at its catalogue price (the host''s own builds and everything from before 20261112080000_demolish.sql). No browser access.';
comment on column public.building_payments.island_owner is
  'The island (its owner, the game''s host) the building stands on.';
comment on column public.building_payments.plot is
  'The spot of the building (wall_1, cannon_3, ...). Kept for reading; the key is building_ref.';
comment on column public.building_payments.building_ref is
  'The islet_buildings.ref of the one building this paid for (island:<uid> of the click that built it). A building rebuilt on the same spot has another ref, so it never inherits these rows.';
comment on column public.building_payments.level is
  'The level paid for: 1 is the build, 2 to 5 the upgrades.';
comment on column public.building_payments.payer is
  'The player who paid. Null once that player deleted their account.';
comment on column public.building_payments.coins is
  'What that level cost them.';
comment on column public.building_payments.ref is
  'The ref of the ledger row that paid it: island:<uid> (the build) or upgrade:<uid>.';
comment on column public.building_payments.paid_at is
  'When it was paid. Set by the database.';
comment on column public.building_payments.refunded_by is
  'Null while the building stands; demolish:<uid> of the tear-down that refunded it.';

-- Row-level security on and no policy: no browser role sees a row.
--   service_role  read, insert (island_build, island_upgrade), update
--                 (refunded_by, island_demolish); no delete
alter table public.building_payments enable row level security;
revoke all on table public.building_payments from public, anon, authenticated, service_role;
grant select, insert, update on table public.building_payments to service_role;


-- -----------------------------------------------------------------------------
-- 3. Table building_demolitions: one row per building torn down
-- -----------------------------------------------------------------------------

create table if not exists public.building_demolitions (
  demolished_by  uuid not null references public.profiles (id) on delete cascade,
  ref            text not null,
  island_owner   uuid not null references public.islets (player_id) on delete cascade,
  plot           text not null,
  building_type  text not null,
  level          smallint not null,
  building_ref   text not null,
  refunds        jsonb not null,
  demolished_at  timestamptz not null default now(),

  primary key (demolished_by, ref),
  constraint building_demolitions_ref_format
    check (ref ~ '^demolish:[A-Za-z0-9_-]{8,64}$'),
  constraint building_demolitions_level_range
    check (level between 1 and 5),
  constraint building_demolitions_refunds_list
    check (jsonb_typeof(refunds) = 'array')
);

comment on table public.building_demolitions is
  'One row per building torn down on an island (docs/GAME-V3.md section 4.2), written by island_demolish(): who did it, which building and the refunds it paid. A repeated click finds its row and pays nothing. No browser access.';
comment on column public.building_demolitions.demolished_by is
  'The member who tore it down.';
comment on column public.building_demolitions.ref is
  'demolish:<actionUid>: the click, and the ref of every refund''s ledger row.';
comment on column public.building_demolitions.island_owner is
  'The island (its host) the building stood on.';
comment on column public.building_demolitions.plot is
  'The spot it stood on.';
comment on column public.building_demolitions.building_type is
  'What stood there: wall, cannon, mortar, watchtower or house.';
comment on column public.building_demolitions.level is
  'Its level when it was torn down.';
comment on column public.building_demolitions.building_ref is
  'Its islet_buildings.ref.';
comment on column public.building_demolitions.refunds is
  'The refunds paid: [{playerId, paid, coins}], coins = paid / 2 rounded down.';
comment on column public.building_demolitions.demolished_at is
  'When. Set by the database.';

alter table public.building_demolitions enable row level security;
revoke all on table public.building_demolitions from public, anon, authenticated, service_role;
grant select, insert on table public.building_demolitions to service_role;

-- island_demolish() removes the building's row; nothing else deletes one.
grant delete on table public.islet_buildings to service_role;

comment on table public.islet_buildings is
  'One row per building that stands on a home islet or an island. The cabin stands from the start and has no row. Players can read only their own rows. islet_build() and island_build() add rows, island_upgrade() raises the level, island_specialise() sets the tower skill, and island_demolish() deletes the row of an island building torn down between waves (never a home islet building). The same player and ref can appear only once.';


-- -----------------------------------------------------------------------------
-- 4. island_build(), now with its payment row
-- -----------------------------------------------------------------------------
-- As in 20261111030000_tower_defense.sql section 5, word for word, with one
-- addition: after the building row, one building_payments row (level 1, the
-- payer, the price, the ref). test_demolish_matches_migration.py checks that
-- nothing else changed.

create or replace function public.island_build(
  p_player_id     uuid,
  p_island_owner  uuid,
  p_plot          text,
  p_building_type text,
  p_action_uid    text,
  p_price         integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_ref     text;
  v_balance bigint;
begin
  if p_player_id is null or p_island_owner is null or p_plot is null
     or p_building_type is null
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_price is null or p_price < 1 then
    raise exception 'bad_island_build';
  end if;
  v_ref := 'island:' || p_action_uid;

  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  if exists (
    select 1 from public.wallet_transactions
     where player_id = p_player_id and reason = 'building_purchase' and ref = v_ref
  ) then
    return jsonb_build_object('status', 'done', 'level', 1, 'balance', v_balance, 'repeat', true);
  end if;

  insert into public.islets (player_id, timber)
  values (p_island_owner, 0)
  on conflict (player_id) do nothing;
  perform 1 from public.islets where player_id = p_island_owner for update;

  if exists (
    select 1 from public.islet_buildings where player_id = p_island_owner and plot = p_plot
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'spot_taken');
  end if;
  if v_balance < p_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', p_price);
  end if;

  v_balance := public.apply_wallet_transaction(p_player_id, -p_price, 'building_purchase', v_ref);
  insert into public.islet_buildings
    (player_id, plot, building_type, level, coins_paid, timber_paid, ref)
  values
    (p_island_owner, p_plot, p_building_type, 1, p_price, 0, v_ref);
  -- 20261112080000_demolish.sql: who paid for this building, for a refund when it is torn down.
  insert into public.building_payments
    (island_owner, plot, building_ref, level, payer, coins, ref)
  values
    (p_island_owner, p_plot, v_ref, 1, p_player_id, p_price, v_ref);

  return jsonb_build_object('status', 'done', 'level', 1, 'balance', v_balance, 'repeat', false);
end;
$$;
revoke all on function public.island_build(uuid, uuid, text, text, text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.island_build(uuid, uuid, text, text, text, integer)
  to service_role;

comment on function public.island_build(uuid, uuid, text, text, text, integer) is
  'The co-op build: p_player_id pays p_price (reason building_purchase, ref island:<uid>) and the building stands at level 1 on the island of p_island_owner; a building_payments row records who paid it (20261112080000_demolish.sql). Locks the payer''s wallet, then the owner''s islet row. A repeat answers {status: done, repeat: true}. Refuses spot_taken and insufficient_funds, with nothing changed. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 5. island_upgrade(), now with its payment row
-- -----------------------------------------------------------------------------
-- As in 20261112070000_tower_tiers.sql section 2, word for word, with one
-- addition: after the level goes up, one building_payments row (the new level,
-- the payer, the price, the ref). test_demolish_matches_migration.py checks
-- that nothing else changed.

create or replace function public.island_upgrade(
  p_player_id      uuid,
  p_island_owner   uuid,
  p_plot           text,
  p_action_uid     text,
  p_prices         integer[],
  p_unlocked_level integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_ref      text;
  v_balance  bigint;
  v_building public.islet_buildings;
  v_price    integer;
begin
  if p_player_id is null or p_island_owner is null or p_plot is null or p_unlocked_level is null
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_prices is null or coalesce(array_length(p_prices, 1), 0) not between 1 and 5
     or exists (select 1 from unnest(p_prices) price where price is null or price < 1) then
    raise exception 'bad_upgrade';
  end if;
  v_ref := 'upgrade:' || p_action_uid;

  select balance into v_balance from public.wallets where player_id = p_player_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'player_not_set_up');
  end if;

  select * into v_building
    from public.islet_buildings
   where player_id = p_island_owner and plot = p_plot
     for update;

  if exists (
    select 1 from public.wallet_transactions
     where player_id = p_player_id and reason = 'building_purchase' and ref = v_ref
  ) then
    return jsonb_build_object(
      'status', 'done', 'level', coalesce(v_building.level, 0), 'balance', v_balance,
      'repeat', true
    );
  end if;

  if v_building.player_id is null then
    return jsonb_build_object('status', 'refused', 'reason', 'not_built');
  end if;
  if v_building.level >= array_length(p_prices, 1) then
    return jsonb_build_object('status', 'refused', 'reason', 'max_level');
  end if;
  if v_building.level + 1 > p_unlocked_level then
    return jsonb_build_object('status', 'refused', 'reason', 'locked');
  end if;
  v_price := p_prices[v_building.level + 1];
  if v_balance < v_price then
    return jsonb_build_object('status', 'refused', 'reason', 'insufficient_funds', 'price', v_price);
  end if;

  v_balance := public.apply_wallet_transaction(p_player_id, -v_price, 'building_purchase', v_ref);
  update public.islet_buildings
     set level = level + 1, coins_paid = coins_paid + v_price
   where player_id = p_island_owner and plot = p_plot
  returning * into v_building;
  -- 20261112080000_demolish.sql: who paid for this level, for a refund when it is torn down.
  insert into public.building_payments
    (island_owner, plot, building_ref, level, payer, coins, ref)
  values
    (p_island_owner, p_plot, v_building.ref, v_building.level, p_player_id, v_price, v_ref);

  return jsonb_build_object(
    'status', 'done', 'level', v_building.level, 'balance', v_balance, 'repeat', false
  );
end;
$$;
revoke all on function public.island_upgrade(uuid, uuid, text, text, integer[], integer)
  from public, anon, authenticated, service_role;
grant execute on function public.island_upgrade(uuid, uuid, text, text, integer[], integer)
  to service_role;

comment on function public.island_upgrade(uuid, uuid, text, text, integer[], integer) is
  'Raises one building on the island of p_island_owner by one level, paid by p_player_id (the owner or a visitor); a building_payments row records who paid that level (20261112080000_demolish.sql). Locks the payer''s wallet, then the building. A repeated actionUid (ledger ref upgrade:<uid>, reason building_purchase) answers {status: done, repeat: true}. Refuses not_built, max_level (the length of p_prices), locked (above p_unlocked_level) and insufficient_funds, with nothing changed. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 6. island_refund_split(): who gets how many coins back for one building
-- -----------------------------------------------------------------------------
--   p_building_ref  the islet_buildings.ref of the building
--   p_kind, p_level what stands there
--   p_prices        the catalogue: {"wall": [10, 20, 40, 80, 160], ...}; the
--                   price of a level without a payment row (paid by the host)
--
-- Returns [{playerId, paid, coins}], the biggest payer first: paid is all
-- that player paid for this building, coins = paid / 2 rounded down. Rows of a
-- deleted payer and rows refunded already count for nobody.

create or replace function public.island_refund_split(
  p_island_owner  uuid,
  p_building_ref  text,
  p_kind          text,
  p_level         integer,
  p_prices        jsonb
)
returns jsonb
language sql
stable
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
  with rows as (
    select level, payer, coins
      from public.building_payments
     where island_owner = p_island_owner and building_ref = p_building_ref
       and refunded_by is null and level <= p_level
  ), paid as (
    select payer as player_id, coins::bigint as coins from rows where payer is not null
    union all
    -- A level nobody has a row for: the host paid it, at its catalogue price.
    select p_island_owner, (p_prices -> p_kind ->> (step - 1))::bigint
      from generate_series(1, p_level) as step
     where not exists (select 1 from rows where rows.level = step)
  ), total as (
    select player_id, sum(coins)::bigint as paid from paid group by player_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object('playerId', player_id, 'paid', paid, 'coins', paid / 2)
      order by paid desc, player_id
    ),
    '[]'::jsonb
  )
    from total
   where paid > 0;
$$;

revoke all on function public.island_refund_split(uuid, text, text, integer, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.island_refund_split(uuid, text, text, integer, jsonb)
  to service_role;

comment on function public.island_refund_split(uuid, text, text, integer, jsonb) is
  'Who gets how many coins back when the building p_building_ref (p_kind at p_level) on the island of p_island_owner is torn down: [{playerId, paid, coins}], coins half of what that player paid, rounded down. A level without a building_payments row counts as paid by the host at its price in p_prices. Reads only. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 7. island_demolish_quote(): the refunds, for the confirmation card
-- -----------------------------------------------------------------------------
-- The same checks as island_demolish() (without locks) and the same split.
-- Returns {status: quote, plot, kind, level, refunds} or {status: refused,
-- reason: protected | no_island | not_member | not_built | wave_running}.

create or replace function public.island_demolish_quote(
  p_player_id     uuid,
  p_island_owner  uuid,
  p_plot          text,
  p_prices        jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_building public.islet_buildings;
begin
  if p_player_id is null or p_island_owner is null or p_plot is null
     or p_prices is null or jsonb_typeof(p_prices) <> 'object' then
    raise exception 'bad_demolish';
  end if;
  if p_plot !~ '^(wall_([1-9]|1[0-2])|cannon_[1-7]|tower_1|house_[12])$' then
    return jsonb_build_object('status', 'refused', 'reason', 'protected');
  end if;
  if not exists (select 1 from public.islands where player_id = p_island_owner) then
    return jsonb_build_object('status', 'refused', 'reason', 'no_island');
  end if;
  if p_player_id <> p_island_owner and not exists (
    select 1 from public.island_members
     where island_owner = p_island_owner and player_id = p_player_id and left_at is null
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'not_member');
  end if;

  select * into v_building
    from public.islet_buildings
   where player_id = p_island_owner and plot = p_plot;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'not_built');
  end if;
  if exists (
    select 1 from public.wave_runs
     where island_owner = p_island_owner and finished_at is null
       and starts_at + make_interval(secs => maximum_seconds) >= now()
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'wave_running');
  end if;
  if jsonb_typeof(p_prices -> v_building.building_type) is distinct from 'array'
     or jsonb_array_length(p_prices -> v_building.building_type) < v_building.level then
    raise exception 'bad_demolish';
  end if;

  return jsonb_build_object(
    'status', 'quote', 'plot', p_plot, 'kind', v_building.building_type, 'level', v_building.level,
    'refunds', public.island_refund_split(
      p_island_owner, v_building.ref, v_building.building_type, v_building.level, p_prices
    )
  );
end;
$$;

revoke all on function public.island_demolish_quote(uuid, uuid, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.island_demolish_quote(uuid, uuid, text, jsonb)
  to service_role;

comment on function public.island_demolish_quote(uuid, uuid, text, jsonb) is
  'What tearing down the building on p_plot of the island of p_island_owner would pay back, per payer, for the confirmation card: {status: quote, plot, kind, level, refunds: [{playerId, paid, coins}]}. Refuses protected (not an island build spot), no_island, not_member, not_built and wave_running. Reads only, locks nothing. Only service_role may run it.';


-- -----------------------------------------------------------------------------
-- 8. island_demolish(): tear the building down and pay the refunds
-- -----------------------------------------------------------------------------
--   p_player_id     the member who tears it down
--   p_island_owner  the island (the game's host)
--   p_plot          the spot
--   p_action_uid    the click (ref demolish:<uid>)
--   p_prices        the catalogue, as for island_refund_split()
--
-- Returns {status: done, plot, kind, level, refunds, repeat} or {status:
-- refused, reason: protected | no_island | not_member | not_built |
-- wave_running | busy}, with nothing changed.

create or replace function public.island_demolish(
  p_player_id     uuid,
  p_island_owner  uuid,
  p_plot          text,
  p_action_uid    text,
  p_prices        jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''  -- empty on purpose: every name inside is written in full
as $$
declare
  v_ref      text;
  v_done     public.building_demolitions;
  v_building public.islet_buildings;
  v_payers   uuid[];
  v_locked   uuid[] := '{}';
  v_id       uuid;
  v_refunds  jsonb := '[]'::jsonb;
  v_refund   jsonb;
begin
  if p_player_id is null or p_island_owner is null or p_plot is null
     or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_prices is null or jsonb_typeof(p_prices) <> 'object' then
    raise exception 'bad_demolish';
  end if;
  v_ref := 'demolish:' || p_action_uid;

  -- Step 1: the same click again is answered from its record.
  select * into v_done
    from public.building_demolitions where demolished_by = p_player_id and ref = v_ref;
  if found then
    return jsonb_build_object(
      'status', 'done', 'plot', v_done.plot, 'kind', v_done.building_type, 'level', v_done.level,
      'refunds', v_done.refunds, 'repeat', true
    );
  end if;

  -- Step 2: only an island build spot, on an island, by a member of its game.
  if p_plot !~ '^(wall_([1-9]|1[0-2])|cannon_[1-7]|tower_1|house_[12])$' then
    return jsonb_build_object('status', 'refused', 'reason', 'protected');
  end if;
  if not exists (select 1 from public.islands where player_id = p_island_owner) then
    return jsonb_build_object('status', 'refused', 'reason', 'no_island');
  end if;
  if p_player_id <> p_island_owner and not exists (
    select 1 from public.island_members
     where island_owner = p_island_owner and player_id = p_player_id and left_at is null
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'not_member');
  end if;
  select * into v_building
    from public.islet_buildings
   where player_id = p_island_owner and plot = p_plot;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'not_built');
  end if;

  -- Step 3: the wallets first, every payer of this building and the host, in
  -- player id order (the order every tear-down takes, so none waits in a circle).
  select array_agg(id order by id) into v_payers
    from (
      select payer as id from public.building_payments
       where island_owner = p_island_owner and building_ref = v_building.ref
         and refunded_by is null and payer is not null
      union
      select p_island_owner
    ) ids;
  foreach v_id in array v_payers loop
    perform 1 from public.wallets where player_id = v_id for update;
    if found then
      v_locked := v_locked || v_id;
    end if;
  end loop;

  -- Step 4: the island row (the lock wave_start() takes), then no running wave.
  perform 1 from public.islands where player_id = p_island_owner for update;
  if exists (
    select 1 from public.wave_runs
     where island_owner = p_island_owner and finished_at is null
       and starts_at + make_interval(secs => maximum_seconds) >= now()
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'wave_running');
  end if;

  -- Step 5: the building row (the lock island_upgrade() takes), read again.
  select * into v_building
    from public.islet_buildings
   where player_id = p_island_owner and plot = p_plot
     for update;
  if not found then
    -- The same click may have finished meanwhile (two tabs), or another member was first.
    select * into v_done
      from public.building_demolitions where demolished_by = p_player_id and ref = v_ref;
    if found then
      return jsonb_build_object(
        'status', 'done', 'plot', v_done.plot, 'kind', v_done.building_type,
        'level', v_done.level, 'refunds', v_done.refunds, 'repeat', true
      );
    end if;
    return jsonb_build_object('status', 'refused', 'reason', 'not_built');
  end if;
  if jsonb_typeof(p_prices -> v_building.building_type) is distinct from 'array'
     or jsonb_array_length(p_prices -> v_building.building_type) < v_building.level then
    raise exception 'bad_demolish';
  end if;
  -- Somebody paid for it after step 3 (an upgrade got the building lock first):
  -- their wallet is not locked, so stop here; the next click locks it.
  if exists (
    select 1 from public.building_payments
     where island_owner = p_island_owner and building_ref = v_building.ref
       and refunded_by is null and payer is not null and not (payer = any(v_payers))
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'busy');
  end if;

  -- Step 6: the refunds, half of what each payer paid, into the wallets locked above. A payer
  -- without a wallet (never set up) gets nothing and is left out of the record, so the record
  -- and the answer list only coins that were really paid.
  for v_refund in
    select value from jsonb_array_elements(public.island_refund_split(
      p_island_owner, v_building.ref, v_building.building_type, v_building.level, p_prices
    ))
  loop
    if not ((v_refund ->> 'playerId')::uuid = any(v_locked)) then
      continue;
    end if;
    if (v_refund ->> 'coins')::bigint > 0 then
      perform public.apply_wallet_transaction(
        (v_refund ->> 'playerId')::uuid, (v_refund ->> 'coins')::bigint, 'building_refund', v_ref
      );
    end if;
    v_refunds := v_refunds || jsonb_build_array(v_refund);
  end loop;

  -- Step 7: the spot is empty again; its payments are refunded; the record of the click.
  update public.building_payments
     set refunded_by = v_ref
   where island_owner = p_island_owner and building_ref = v_building.ref and refunded_by is null;
  delete from public.islet_buildings where player_id = p_island_owner and plot = p_plot;
  insert into public.building_demolitions
    (demolished_by, ref, island_owner, plot, building_type, level, building_ref, refunds)
  values
    (p_player_id, v_ref, p_island_owner, p_plot, v_building.building_type, v_building.level,
     v_building.ref, v_refunds);

  return jsonb_build_object(
    'status', 'done', 'plot', p_plot, 'kind', v_building.building_type, 'level', v_building.level,
    'refunds', v_refunds, 'repeat', false
  );
end;
$$;

revoke all on function public.island_demolish(uuid, uuid, text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.island_demolish(uuid, uuid, text, text, jsonb)
  to service_role;

comment on function public.island_demolish(uuid, uuid, text, text, jsonb) is
  'Tears down the building on p_plot of the island of p_island_owner (p_player_id: the host or an active member) while no wave runs there, and pays every payer half of what they paid for it, rounded down (reason building_refund, ref demolish:<uid>); a level without a payment row goes to the host at its price in p_prices. Locks the payers'' and the host''s wallets in player id order, then the island row, then the building. A repeated actionUid answers {status: done, repeat: true} with the same refunds. Refuses protected (not an island build spot), no_island, not_member, not_built, wave_running and busy (a payment arrived meanwhile), with nothing changed. Only service_role may run it.';
