-- WHAT IT DOES
-- Stores accepted partner orders and their fixed find, pin and light-duty deadlines.
-- WHO USES IT
-- The partner service calls fetch-and-pin and man-light intents after its pure decisions.
-- WHAT IT NEEDS
-- The full migration chain through the case board, night helpers and Relighting.
-- SAFE TO RUN TWICE
-- Columns, tables and indexes are created only if missing; functions and grants repeat.
-- HOW THE FILE IS ORGANISED
-- The order counter and history table, guarded helpers, two intents, grants and comments.

alter table public.case_state add column if not exists orders_count integer not null default 0;

-- Keeps each accepted partner order with its result fixed at acceptance.
create table if not exists public.npc_orders (
  crew_id        uuid not null references public.crews (id) on delete cascade,
  order_no       integer not null,
  seat_no        smallint not null,
  npc_id         text not null,
  kind           text not null,
  target         text not null,
  ordered_by     uuid references public.profiles (id) on delete set null,
  route_id       text,
  result_card    text,
  price          integer not null default 0,
  ordered_second integer not null,
  arrive_second  integer,
  found_second   integer,
  pin_second     integer,
  ready_second   integer not null,
  created_at     timestamptz not null default now(),
  primary key (crew_id, order_no),
  constraint npc_orders_order_no_positive check (order_no >= 1),
  constraint npc_orders_seat_no_range check (seat_no between 1 and 4),
  constraint npc_orders_npc_id_format check (npc_id ~ '^[a-z0-9_]{2,40}$'),
  constraint npc_orders_kind_allowed check (kind in ('fetch', 'search', 'pin', 'man_light', 'wait')),
  constraint npc_orders_price_not_negative check (price >= 0),
  constraint npc_orders_times check (ordered_second >= 0 and ready_second >= ordered_second)
);
create index if not exists npc_orders_seat_idx on public.npc_orders (crew_id, seat_no, order_no desc);

-- Locks through case_begin, returns repeats first, and checks the exact partner holder and busy deadline.
create or replace function public.npc_begin(p_crew_id uuid, p_player_id uuid, p_action_uid text,
  p_seat_no smallint, p_npc_id text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_begin      jsonb;
  v_now        integer;
  v_busy_until integer;
begin
  v_begin := public.case_begin(p_crew_id, p_player_id, p_action_uid);
  if v_begin ->> 'status' <> 'ok' then
    return v_begin;
  end if;
  v_now := (v_begin ->> 'now')::integer;
  if not exists (select 1 from public.crew_seats as s
                  where s.crew_id = p_crew_id and s.seat_no = p_seat_no and s.npc_id = p_npc_id) then
    return jsonb_build_object('status', 'refused', 'reason', 'seat_changed');
  end if;
  select max(o.ready_second) into v_busy_until
    from public.npc_orders as o where o.crew_id = p_crew_id and o.seat_no = p_seat_no;
  if v_busy_until is not null and v_now < v_busy_until then
    return jsonb_build_object('status', 'refused', 'reason', 'busy', 'seconds', v_busy_until - v_now);
  end if;
  return v_begin;
end;
$$;

-- Allocates the next crew order number while the caller holds the crew lock.
create or replace function public.npc_next_order_no(p_crew_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_order_no integer;
begin
  update public.case_state set orders_count = orders_count + 1
   where crew_id = p_crew_id
  returning orders_count into v_order_no;
  return v_order_no;
end;
$$;

-- Stores a fixed partner find and pin and immediately rewards the ordering player once.
create or replace function public.npc_fetch_pin(
  p_crew_id uuid, p_player_id uuid, p_action_uid text, p_seat_no smallint, p_npc_id text, p_card_id text,
  p_route_id text, p_needs_deductions text[], p_window jsonb, p_errand_seconds integer, p_arrive_seconds integer,
  p_pin_seconds integer, p_price integer, p_purchase_ref text, p_reward_coins integer, p_reward_ref text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_begin    jsonb;
  v_now      integer;
  v_night_no integer;
  v_holds    boolean;
  v_found_at integer;
  v_pin_at   integer;
  v_order_no integer;
  v_paid     integer := 0;
  v_revision bigint;
begin
  if p_card_id is null or p_needs_deductions is null or p_errand_seconds is null or p_errand_seconds < 1
     or p_arrive_seconds is null or p_arrive_seconds < 0 or p_arrive_seconds > p_errand_seconds
     or p_pin_seconds is null or p_pin_seconds < 1 or p_price is null or p_price < 0
     or (p_price > 0 and (p_purchase_ref is null or btrim(p_purchase_ref) = ''))
     or p_reward_coins is null or p_reward_coins < 1 or p_reward_ref is null then
    raise exception 'bad_order';
  end if;
  v_begin := public.npc_begin(p_crew_id, p_player_id, p_action_uid, p_seat_no, p_npc_id);
  if v_begin ->> 'status' <> 'ok' then
    return v_begin;
  end if;
  v_now := (v_begin ->> 'now')::integer;
  if exists (
    select 1 from unnest(p_needs_deductions) as needed(deduction_id)
     where not exists (select 1 from public.case_deductions as d
                        where d.crew_id = p_crew_id and d.deduction_id = needed.deduction_id)
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'no_lead');
  end if;
  if exists (select 1 from public.board_pins as b
              where b.crew_id = p_crew_id and b.card_id = p_card_id and b.seat_no = p_seat_no) then
    return jsonb_build_object('status', 'refused', 'reason', 'already_have');
  end if;
  v_holds := exists (select 1 from public.case_finds as f
                      where f.crew_id = p_crew_id and f.seat_no = p_seat_no and f.card_id = p_card_id);
  if not v_holds then
    if p_route_id is null then
      raise exception 'bad_order';
    end if;
    if p_window is not null and not public.case_window_open(
         (v_now + p_arrive_seconds) / 60, (p_window ->> 'every')::integer,
         (p_window ->> 'from')::integer, (p_window ->> 'open')::integer) then
      return jsonb_build_object('status', 'refused', 'reason', 'locked_window', 'minute', v_now / 60);
    end if;
  end if;
  v_order_no := public.npc_next_order_no(p_crew_id);
  if v_holds then
    v_found_at := null;
    v_pin_at := v_now + p_pin_seconds;
  else
    v_found_at := v_now + p_errand_seconds;
    v_pin_at := v_found_at + p_pin_seconds;
    insert into public.case_finds (crew_id, seat_no, card_id, route_id, started_second, ready_second,
                                   coins_paid, started_by, by_partner, order_no)
    values (p_crew_id, p_seat_no, p_card_id, p_route_id, v_now, v_found_at,
            p_price, p_player_id, true, v_order_no);
  end if;
  if p_price > 0 then
    perform public.apply_wallet_transaction(p_player_id, -p_price, 'clue_purchase', p_purchase_ref);
  end if;
  -- The outcome is fixed now (NPC-PARTNERS N5), so the ordering player's first-pin reward is paid now (C6).
  begin
    perform public.apply_wallet_transaction(p_player_id, p_reward_coins, 'clue_reward', p_reward_ref);
    v_paid := p_reward_coins;
  exception when unique_violation then
    v_paid := 0;
  end;
  insert into public.board_pins (crew_id, card_id, seat_no, ordered_second, pinned_second, pinned_by,
                                 by_partner, order_no, coins_rewarded)
  values (p_crew_id, p_card_id, p_seat_no, v_now, v_pin_at, p_player_id, true, v_order_no, v_paid);
  -- A new order ends light duty.
  select night_no into v_night_no from public.case_state where crew_id = p_crew_id;
  perform public.finale_leave_post(p_crew_id, p_seat_no, v_night_no, v_now);
  insert into public.npc_orders (crew_id, order_no, seat_no, npc_id, kind, target, ordered_by, route_id,
                                 result_card, price, ordered_second, arrive_second, found_second,
                                 pin_second, ready_second)
  values (p_crew_id, v_order_no, p_seat_no, p_npc_id, 'fetch', p_card_id, p_player_id,
          case when v_holds then null else p_route_id end, p_card_id, p_price, v_now,
          case when v_holds then null else v_now + p_arrive_seconds end, v_found_at, v_pin_at, v_pin_at);
  -- Store the exact order number so a repeat recovers its original seat and line variant.
  v_revision := public.case_finish(p_crew_id, p_player_id, p_action_uid, 'order', v_order_no::text, 'fetch', v_now);
  return jsonb_build_object('status', 'done', 'orderNo', v_order_no, 'foundSecond', v_found_at,
                            'pinSecond', v_pin_at, 'coinsPaid', v_paid, 'revision', v_revision);
end;
$$;

-- Reserves a light immediately and places the same partner on post after travel.
create or replace function public.npc_man_light(
  p_crew_id uuid, p_player_id uuid, p_action_uid text, p_seat_no smallint, p_npc_id text, p_light_id text,
  p_travel_seconds integer, p_night_seconds integer)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_begin    jsonb;
  v_now      integer;
  v_state    public.case_state%rowtype;
  v_post     public.finale_posts%rowtype;
  v_order_no integer;
  v_revision bigint;
begin
  if p_light_id is null or p_travel_seconds is null or p_travel_seconds < 1
     or p_night_seconds is null or p_night_seconds < 1 then
    raise exception 'bad_order';
  end if;
  v_begin := public.npc_begin(p_crew_id, p_player_id, p_action_uid, p_seat_no, p_npc_id);
  if v_begin ->> 'status' <> 'ok' then
    return v_begin;
  end if;
  v_now := (v_begin ->> 'now')::integer;
  select * into v_state from public.case_state where crew_id = p_crew_id;
  if v_state.schooner_found_second is not null or v_state.night_no = 0
     or v_now >= v_state.night_started_second + p_night_seconds then
    return jsonb_build_object('status', 'refused', 'reason', 'not_nightfall');
  end if;
  select * into v_post from public.finale_posts
   where crew_id = p_crew_id and light_id = p_light_id and ended_second is null;
  if found then
    if public.finale_post_holds(p_crew_id, p_light_id, v_post.seat_no) then
      if v_post.seat_no = p_seat_no then
        return jsonb_build_object('status', 'refused', 'reason', 'already_have');
      end if;
      return jsonb_build_object('status', 'refused', 'reason', 'light_taken');
    end if;
    perform public.finale_leave_post(p_crew_id, v_post.seat_no, v_state.night_no, v_now);
  end if;
  perform public.finale_leave_post(p_crew_id, p_seat_no, v_state.night_no, v_now);
  v_order_no := public.npc_next_order_no(p_crew_id);
  -- The light is reserved now; the partner is on post after the trip (a player may aim it meanwhile).
  insert into public.finale_posts (crew_id, light_id, seat_no, npc_id, taken_second, on_post_second, order_no)
  values (p_crew_id, p_light_id, p_seat_no, p_npc_id, v_now, v_now + p_travel_seconds, v_order_no);
  insert into public.npc_orders (crew_id, order_no, seat_no, npc_id, kind, target, ordered_by,
                                 ordered_second, ready_second)
  values (p_crew_id, v_order_no, p_seat_no, p_npc_id, 'man_light', p_light_id, p_player_id,
          v_now, v_now + p_travel_seconds);
  -- Store the exact order number so a repeat recovers its original seat and line variant.
  v_revision := public.case_finish(p_crew_id, p_player_id, p_action_uid, 'order', v_order_no::text, 'man_light', v_now);
  return jsonb_build_object('status', 'done', 'orderNo', v_order_no, 'onPostSecond', v_now + p_travel_seconds,
                            'revision', v_revision);
end;
$$;

-- Orders are append-only history. Only the server reads and appends them.
alter table public.npc_orders enable row level security;
revoke all on table public.npc_orders from public, anon, authenticated, service_role;
grant select, insert on table public.npc_orders to service_role;

-- Helpers and intents use caller rights and are callable only by the server.
revoke all on function public.npc_begin(uuid, uuid, text, smallint, text) from public, anon, authenticated;
grant execute on function public.npc_begin(uuid, uuid, text, smallint, text) to service_role;
comment on function public.npc_begin(uuid, uuid, text, smallint, text) is
  'Locks through case_begin, returns repeats first, and checks the exact partner holder and busy deadline.';
revoke all on function public.npc_next_order_no(uuid) from public, anon, authenticated;
grant execute on function public.npc_next_order_no(uuid) to service_role;
comment on function public.npc_next_order_no(uuid) is
  'Allocates the next crew order number while the caller holds the crew lock.';
revoke all on function public.npc_fetch_pin(uuid, uuid, text, smallint, text, text, text, text[], jsonb, integer, integer, integer, integer, text, integer, text) from public, anon, authenticated;
grant execute on function public.npc_fetch_pin(uuid, uuid, text, smallint, text, text, text, text[], jsonb, integer, integer, integer, integer, text, integer, text) to service_role;
comment on function public.npc_fetch_pin(uuid, uuid, text, smallint, text, text, text, text[], jsonb, integer, integer, integer, integer, text, integer, text) is
  'Stores a fixed partner find and pin and immediately rewards the ordering player once.';
revoke all on function public.npc_man_light(uuid, uuid, text, smallint, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.npc_man_light(uuid, uuid, text, smallint, text, text, integer, integer) to service_role;
comment on function public.npc_man_light(uuid, uuid, text, smallint, text, text, integer, integer) is
  'Reserves a light immediately and places the same partner on post after travel.';

comment on table public.npc_orders is
  'Keeps each accepted partner order with its result fixed at acceptance.';
comment on column public.npc_orders.crew_id is
  'The crew whose lock serializes its partner orders.';
comment on column public.npc_orders.order_no is
  'The positive consecutive order number within this crew.';
comment on column public.npc_orders.seat_no is
  'The partner seat that receives this order and any future find or pin.';
comment on column public.npc_orders.npc_id is
  'The exact partner holder at acceptance; a takeover refuses new orders for this holder.';
comment on column public.npc_orders.kind is
  'The accepted order kind; the minimum service offers fetch and man_light.';
comment on column public.npc_orders.target is
  'The card or light id fixed for this order at acceptance.';
comment on column public.npc_orders.ordered_by is
  'The player who ordered and receives any first-pin reward or pin contribution credit.';
comment on column public.npc_orders.route_id is
  'The route fixed for a fetch, or null when the card was already held.';
comment on column public.npc_orders.result_card is
  'The card the accepted fetch will pin, fixed before any later clock change.';
comment on column public.npc_orders.price is
  'The ordering player price, always zero in the minimum service. Partners never pay.';
comment on column public.npc_orders.ordered_second is
  'The acceptance second and start of contribution credit.';
comment on column public.npc_orders.arrive_second is
  'The arrival second for a fetch errand, or null for pin-only orders.';
comment on column public.npc_orders.found_second is
  'The second the stored find becomes visible, or null when it was already held.';
comment on column public.npc_orders.pin_second is
  'The second the stored partner pin becomes effective for pairing.';
comment on column public.npc_orders.ready_second is
  'The exclusive busy deadline; another order is allowed at this second.';
comment on column public.npc_orders.created_at is
  'When this append-only order history record was stored.';
comment on column public.case_state.orders_count is
  'The last accepted partner order number, allocated under the crew lock.';
