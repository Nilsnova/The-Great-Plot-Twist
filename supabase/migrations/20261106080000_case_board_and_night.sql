-- Stores shared board pins and timed light-post history for the case API.
-- Used after case_rules; safe to run twice. All writes retain caller rights.

alter table public.case_state add column if not exists night_no integer not null default 0;
alter table public.case_state add column if not exists night_started_second integer;
alter table public.case_state add column if not exists night_called_by uuid references public.profiles (id) on delete set null;
alter table public.case_state drop constraint if exists case_state_night_is_complete;
alter table public.case_state add constraint case_state_night_is_complete
  check ((night_no = 0) = (night_started_second is null) and night_no >= 0);

-- Board pins preserve who contributed, including orders whose partner pins land later.
create table if not exists public.board_pins (
  crew_id        uuid not null references public.crews (id) on delete cascade,
  card_id        text not null,
  seat_no        smallint not null,
  ordered_second integer not null,
  pinned_second  integer not null,
  pinned_by      uuid references public.profiles (id) on delete set null,
  by_partner     boolean not null default false,
  order_no       integer,
  coins_rewarded integer not null default 0,
  created_at     timestamptz not null default now(),
  primary key (crew_id, card_id, seat_no),
  constraint board_pins_card_id_format check (card_id ~ '^C[1-8]$'),
  constraint board_pins_seat_no_range check (seat_no between 1 and 4),
  constraint board_pins_seconds check (ordered_second >= 0 and pinned_second >= ordered_second),
  constraint board_pins_partner_has_order check (by_partner = (order_no is not null)),
  constraint board_pins_player_pin_is_at_once check (by_partner or pinned_second = ordered_second),
  constraint board_pins_reward_not_negative check (coins_rewarded >= 0)
);
create index if not exists board_pins_pinned_by_idx on public.board_pins (pinned_by);

-- Light posts are history: a post ends by setting ended_second, and no row is ever deleted.
create table if not exists public.finale_posts (
  id             bigint generated always as identity primary key,
  crew_id        uuid not null references public.crews (id) on delete cascade,
  light_id       text not null,
  seat_no        smallint not null,
  player_id      uuid references public.profiles (id) on delete cascade,
  npc_id         text,
  taken_second   integer not null,
  on_post_second integer not null,
  ended_second   integer,
  order_no       integer,
  created_at     timestamptz not null default now(),
  constraint finale_posts_light_allowed check (light_id in ('keepers_lamp', 'harbor_light', 'islet_signal_station', 'ruin_light')),
  constraint finale_posts_seat_no_range check (seat_no between 1 and 4),
  constraint finale_posts_player_or_npc check (num_nonnulls(player_id, npc_id) = 1),
  constraint finale_posts_times check (taken_second >= 0 and on_post_second >= taken_second),
  constraint finale_posts_end_after_start check (ended_second is null or ended_second >= taken_second)
);
-- At most one open post per light, and one open post per seat.
create unique index if not exists finale_posts_one_open_per_light
  on public.finale_posts (crew_id, light_id) where ended_second is null;
create unique index if not exists finale_posts_one_open_per_seat
  on public.finale_posts (crew_id, seat_no) where ended_second is null;
create index if not exists finale_posts_crew_idx on public.finale_posts (crew_id, id desc);

-- Every aim is retained; only unexpired locks at currently held posts count.
create table if not exists public.finale_signals (
  id                 bigint generated always as identity primary key,
  crew_id            uuid not null references public.crews (id) on delete cascade,
  night_no           integer not null,
  light_id           text not null,
  post_seat_no       smallint not null,
  aimed_by           uuid references public.profiles (id) on delete set null,
  aimed_seat_no      smallint not null,
  bearing            numeric(4, 1) not null,
  on_target          boolean not null,
  case_second        integer not null,
  holds_until_second integer,
  ended_second       integer,
  parted             boolean not null default false,
  created_at         timestamptz not null default now(),
  constraint finale_signals_night_positive check (night_no >= 1),
  constraint finale_signals_bearing_range check (bearing >= 0 and bearing < 360),
  constraint finale_signals_seats_range check (post_seat_no between 1 and 4 and aimed_seat_no between 1 and 4),
  constraint finale_signals_hold_only_on_target check (on_target = (holds_until_second is not null)),
  constraint finale_signals_parted_only_on_target check (on_target or not parted)
);
create index if not exists finale_signals_crew_night_idx on public.finale_signals (crew_id, night_no, id desc);

-- A post holds only while the current crew seat has its recorded holder.
create or replace function public.finale_post_holds(p_crew_id uuid, p_light_id text, p_seat_no smallint)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  -- An open post counts only while its seat still has the same holder (an A6 takeover ends a
  -- partner's duty).
  select exists (
    select 1
      from public.finale_posts as p
      join public.crew_seats as s on s.crew_id = p.crew_id and s.seat_no = p.seat_no
     where p.crew_id = p_crew_id and p.light_id = p_light_id and p.seat_no = p_seat_no
       and p.ended_second is null
       and (p.player_id = s.player_id or p.npc_id = s.npc_id)
  );
$$;

-- End a seat's open post and current locks without removing its history.
create or replace function public.finale_leave_post(p_crew_id uuid, p_seat_no smallint, p_night_no integer, p_now integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- A lock ends as soon as the seat at that light leaves it.
  update public.finale_signals as fs
     set ended_second = p_now
    from public.finale_posts as p
   where p.crew_id = p_crew_id and p.seat_no = p_seat_no and p.ended_second is null
     and fs.crew_id = p_crew_id and fs.night_no = p_night_no and fs.light_id = p.light_id
     and fs.on_target and fs.ended_second is null and fs.holds_until_second > p_now;
  -- The post ends too. Its row stays: posts are history, never deleted.
  update public.finale_posts
     set ended_second = p_now
   where crew_id = p_crew_id and seat_no = p_seat_no and ended_second is null;
end;
$$;

-- Pin one landed find and pay its once-per-player clue reward atomically.
create or replace function public.board_pin(
  p_crew_id uuid, p_player_id uuid, p_action_uid text, p_card_id text, p_reward_coins integer, p_reward_ref text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_begin    jsonb;
  v_seat     smallint;
  v_now      integer;
  v_paid     integer := 0;
  v_revision bigint;
begin
  if p_card_id is null or p_reward_coins is null or p_reward_coins < 1
     or p_reward_ref is null or btrim(p_reward_ref) = '' then
    raise exception 'bad_pin';
  end if;
  v_begin := public.case_begin(p_crew_id, p_player_id, p_action_uid);
  if v_begin ->> 'status' <> 'ok' then
    return v_begin;
  end if;
  v_seat := (v_begin ->> 'seatNo')::smallint;
  v_now := (v_begin ->> 'now')::integer;
  if not exists (select 1 from public.case_finds as f
                  where f.crew_id = p_crew_id and f.seat_no = v_seat
                    and f.card_id = p_card_id and f.ready_second <= v_now) then
    return jsonb_build_object('status', 'refused', 'reason', 'card_not_held');
  end if;
  if exists (select 1 from public.board_pins as b
              where b.crew_id = p_crew_id and b.card_id = p_card_id and b.seat_no = v_seat) then
    return jsonb_build_object('status', 'refused', 'reason', 'already_pinned');
  end if;
  begin
    perform public.apply_wallet_transaction(p_player_id, p_reward_coins, 'clue_reward', p_reward_ref);
    v_paid := p_reward_coins;
  exception when unique_violation then
    v_paid := 0;  -- this player pinned this card before, in this crew or another one
  end;
  insert into public.board_pins (crew_id, card_id, seat_no, ordered_second, pinned_second, pinned_by,
                                 coins_rewarded)
  values (p_crew_id, p_card_id, v_seat, v_now, v_now, p_player_id, v_paid);
  v_revision := public.case_finish(p_crew_id, p_player_id, p_action_uid, 'pin', p_card_id, 'pinned', v_now);
  return jsonb_build_object('status', 'done', 'coinsPaid', v_paid, 'revision', v_revision);
end;
$$;

-- Form a cross-seat deduction and pay every contributing pin owner once.
create or replace function public.board_pair(
  p_crew_id uuid, p_player_id uuid, p_action_uid text, p_card_a text, p_card_b text, p_deduction_id text,
  p_wrong_wait_seconds integer, p_reward_coins integer, p_reward_ref text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_begin     jsonb;
  v_seat      smallint;
  v_now       integer;
  v_wait      integer;
  v_player    uuid;
  v_paid      integer;
  v_paid_list jsonb := '[]'::jsonb;
  v_revision  bigint;
begin
  if p_card_a is null or p_card_b is null or p_card_a = p_card_b
     or p_wrong_wait_seconds is null or p_wrong_wait_seconds < 1
     or p_reward_coins is null or p_reward_coins < 1
     or p_reward_ref is null or btrim(p_reward_ref) = '' then
    raise exception 'bad_pair';
  end if;
  v_begin := public.case_begin(p_crew_id, p_player_id, p_action_uid);
  if v_begin ->> 'status' <> 'ok' then
    return v_begin;
  end if;
  v_seat := (v_begin ->> 'seatNo')::smallint;
  v_now := (v_begin ->> 'now')::integer;
  select pair_wait_until into v_wait from public.case_state where crew_id = p_crew_id;
  if v_now < v_wait then
    return jsonb_build_object('status', 'refused', 'reason', 'pair_cooldown', 'seconds', v_wait - v_now);
  end if;
  if not exists (select 1 from public.board_pins as b
                  where b.crew_id = p_crew_id and b.card_id = p_card_a and b.pinned_second <= v_now)
     or not exists (select 1 from public.board_pins as b
                     where b.crew_id = p_crew_id and b.card_id = p_card_b and b.pinned_second <= v_now) then
    return jsonb_build_object('status', 'refused', 'reason', 'not_pinned');
  end if;
  -- Two different seats: some seat pinned card a, and another seat pinned card b.
  if not exists (
    select 1
      from public.board_pins as a
      join public.board_pins as b
        on b.crew_id = a.crew_id and b.card_id = p_card_b and b.seat_no <> a.seat_no
     where a.crew_id = p_crew_id and a.card_id = p_card_a
       and a.pinned_second <= v_now and b.pinned_second <= v_now
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'different_seats_required');
  end if;
  if p_deduction_id is null then
    update public.case_state set pair_wait_until = v_now + p_wrong_wait_seconds
     where crew_id = p_crew_id;
    v_revision := public.case_finish(p_crew_id, p_player_id, p_action_uid, 'pair',
                                     p_card_a || '+' || p_card_b, 'wrong_pair', v_now);
    return jsonb_build_object('status', 'wrong_pair', 'seconds', p_wrong_wait_seconds, 'revision', v_revision);
  end if;
  if exists (select 1 from public.case_deductions as d
              where d.crew_id = p_crew_id and d.deduction_id = p_deduction_id) then
    return jsonb_build_object('status', 'refused', 'reason', 'already_deduced');
  end if;
  insert into public.case_deductions (crew_id, deduction_id, formed_second, formed_by, formed_seat)
  values (p_crew_id, p_deduction_id, v_now, p_player_id, v_seat);
  -- Part of a deduction (case.json, rewards.part_of_a_deduction): pinned one of its cards, or
  -- ordered a partner's pin of it, before it formed. Every pin row here was placed before now.
  for v_player in
    select distinct b.pinned_by
      from public.board_pins as b
     where b.crew_id = p_crew_id and b.card_id in (p_card_a, p_card_b)
       and b.pinned_by is not null and b.ordered_second <= v_now
     order by b.pinned_by  -- overlapping crews take wallet locks in the same order
  loop
    begin
      perform public.apply_wallet_transaction(v_player, p_reward_coins, 'mystery_reward', p_reward_ref);
      v_paid := p_reward_coins;
    exception when unique_violation then
      v_paid := 0;  -- part of this deduction before, in another crew
    end;
    v_paid_list := v_paid_list || jsonb_build_object('playerId', v_player, 'paid', v_paid);
  end loop;
  v_revision := public.case_finish(p_crew_id, p_player_id, p_action_uid, 'pair', p_deduction_id, 'formed', v_now);
  return jsonb_build_object('status', 'formed', 'payouts', v_paid_list, 'revision', v_revision);
end;
$$;

-- Begin another night only after its prerequisite and the dawn wait.
create or replace function public.finale_nightfall(
  p_crew_id uuid, p_player_id uuid, p_action_uid text, p_needs_deduction text,
  p_night_seconds integer, p_dawn_wait_seconds integer)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_begin    jsonb;
  v_now      integer;
  v_state    public.case_state%rowtype;
  v_ends     integer;
  v_revision bigint;
begin
  if p_needs_deduction is null or p_night_seconds is null or p_night_seconds < 1
     or p_dawn_wait_seconds is null or p_dawn_wait_seconds < 0 then
    raise exception 'bad_nightfall';
  end if;
  v_begin := public.case_begin(p_crew_id, p_player_id, p_action_uid);
  if v_begin ->> 'status' <> 'ok' then
    return v_begin;
  end if;
  v_now := (v_begin ->> 'now')::integer;
  select * into v_state from public.case_state where crew_id = p_crew_id;
  if v_state.schooner_found_second is not null then
    return jsonb_build_object('status', 'refused', 'reason', 'schooner_found');
  end if;
  if not exists (select 1 from public.case_deductions as d
                  where d.crew_id = p_crew_id and d.deduction_id = p_needs_deduction) then
    return jsonb_build_object('status', 'refused', 'reason', 'deduction_required');
  end if;
  if v_state.night_no > 0 then
    v_ends := v_state.night_started_second + p_night_seconds;
    if v_now < v_ends then
      return jsonb_build_object('status', 'refused', 'reason', 'night_in_progress');
    end if;
    if v_now < v_ends + p_dawn_wait_seconds then
      return jsonb_build_object('status', 'refused', 'reason', 'dawn_wait',
                                'seconds', v_ends + p_dawn_wait_seconds - v_now);
    end if;
  end if;
  update public.case_state
     set night_no = night_no + 1, night_started_second = v_now, night_called_by = p_player_id
   where crew_id = p_crew_id;
  v_revision := public.case_finish(p_crew_id, p_player_id, p_action_uid, 'nightfall', null, 'night', v_now);
  return jsonb_build_object('status', 'done', 'nightNo', v_state.night_no + 1,
                            'endsSecond', v_now + p_night_seconds, 'revision', v_revision);
end;
$$;

-- Move a player to an available light after its climb; stale duties end.
create or replace function public.finale_take_post(
  p_crew_id uuid, p_player_id uuid, p_action_uid text, p_light_id text, p_light_ready boolean,
  p_climb_seconds integer, p_night_seconds integer)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_begin    jsonb;
  v_seat     smallint;
  v_now      integer;
  v_state    public.case_state%rowtype;
  v_post     public.finale_posts%rowtype;
  v_revision bigint;
begin
  if p_light_id is null or p_light_ready is null or p_climb_seconds is null or p_climb_seconds < 0
     or p_night_seconds is null or p_night_seconds < 1 then
    raise exception 'bad_post';
  end if;
  v_begin := public.case_begin(p_crew_id, p_player_id, p_action_uid);
  if v_begin ->> 'status' <> 'ok' then
    return v_begin;
  end if;
  v_seat := (v_begin ->> 'seatNo')::smallint;
  v_now := (v_begin ->> 'now')::integer;
  select * into v_state from public.case_state where crew_id = p_crew_id;
  if v_state.schooner_found_second is not null or v_state.night_no = 0
     or v_now >= v_state.night_started_second + p_night_seconds then
    return jsonb_build_object('status', 'refused', 'reason', 'night_required');
  end if;
  if not p_light_ready then
    return jsonb_build_object('status', 'refused', 'reason', 'light_not_ready');
  end if;
  select * into v_post from public.finale_posts
   where crew_id = p_crew_id and light_id = p_light_id and ended_second is null;
  if found then
    if public.finale_post_holds(p_crew_id, p_light_id, v_post.seat_no) then
      if v_post.seat_no = v_seat then
        return jsonb_build_object('status', 'refused', 'reason', 'already_on_post');
      end if;
      return jsonb_build_object('status', 'refused', 'reason', 'post_taken');
    end if;
    -- A stale post (its seat changed hands): end it so the light is free.
    perform public.finale_leave_post(p_crew_id, v_post.seat_no, v_state.night_no, v_now);
  end if;
  perform public.finale_leave_post(p_crew_id, v_seat, v_state.night_no, v_now);
  insert into public.finale_posts (crew_id, light_id, seat_no, player_id, taken_second, on_post_second)
  values (p_crew_id, p_light_id, v_seat, p_player_id, v_now, v_now + p_climb_seconds);
  v_revision := public.case_finish(p_crew_id, p_player_id, p_action_uid, 'post', p_light_id, 'climbing', v_now);
  return jsonb_build_object('status', 'done', 'onPostSecond', v_now + p_climb_seconds, 'revision', v_revision);
end;
$$;

-- Record an aim and part the fog only while distinct seats and lights overlap.
create or replace function public.finale_signal(
  p_crew_id uuid, p_player_id uuid, p_action_uid text, p_light_id text, p_bearing numeric, p_on_target boolean,
  p_lock_seconds integer, p_relock_wait_seconds integer, p_night_seconds integer, p_lights_needed integer)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_begin     jsonb;
  v_seat      smallint;
  v_now       integer;
  v_state     public.case_state%rowtype;
  v_post      public.finale_posts%rowtype;
  v_last_miss integer;
  v_seats     integer;
  v_lights    integer;
  v_parted    boolean := false;
  v_revision  bigint;
begin
  -- Python sends the bearing normalised to one decimal in [0, 360).
  if p_light_id is null or p_bearing is null or p_bearing < 0 or p_bearing >= 360
     or p_bearing <> round(p_bearing, 1)
     or p_on_target is null or p_lock_seconds is null or p_lock_seconds < 1
     or p_relock_wait_seconds is null or p_relock_wait_seconds < 0
     or p_night_seconds is null or p_night_seconds < 1
     or p_lights_needed is null or p_lights_needed < 1 then
    raise exception 'bad_signal';
  end if;
  v_begin := public.case_begin(p_crew_id, p_player_id, p_action_uid);
  if v_begin ->> 'status' <> 'ok' then
    return v_begin;
  end if;
  v_seat := (v_begin ->> 'seatNo')::smallint;
  v_now := (v_begin ->> 'now')::integer;
  select * into v_state from public.case_state where crew_id = p_crew_id;
  if v_state.schooner_found_second is not null then
    return jsonb_build_object('status', 'refused', 'reason', 'schooner_found');
  end if;
  if v_state.night_no = 0 or v_now >= v_state.night_started_second + p_night_seconds then
    return jsonb_build_object('status', 'refused', 'reason', 'night_required');
  end if;
  select * into v_post from public.finale_posts
   where crew_id = p_crew_id and light_id = p_light_id and ended_second is null;
  if not found or v_post.on_post_second > v_now
     or not public.finale_post_holds(p_crew_id, p_light_id, v_post.seat_no) then
    return jsonb_build_object('status', 'refused', 'reason', 'post_not_ready');
  end if;
  if v_post.player_id is not null and v_post.player_id <> p_player_id then
    return jsonb_build_object('status', 'refused', 'reason', 'post_not_owned');
  end if;
  select max(fs.case_second) into v_last_miss
    from public.finale_signals as fs
   where fs.crew_id = p_crew_id and fs.night_no = v_state.night_no
     and fs.light_id = p_light_id and not fs.on_target;
  if v_last_miss is not null and v_now < v_last_miss + p_relock_wait_seconds then
    return jsonb_build_object('status', 'refused', 'reason', 'aim_cooldown',
                              'seconds', v_last_miss + p_relock_wait_seconds - v_now);
  end if;
  if not p_on_target then
    insert into public.finale_signals (crew_id, night_no, light_id, post_seat_no, aimed_by, aimed_seat_no,
                                       bearing, on_target, case_second)
    values (p_crew_id, v_state.night_no, p_light_id, v_post.seat_no, p_player_id, v_seat,
            p_bearing, false, v_now);
    v_revision := public.case_finish(p_crew_id, p_player_id, p_action_uid, 'signal', p_light_id, 'off_target', v_now);
    return jsonb_build_object('status', 'off_target', 'seconds', p_relock_wait_seconds, 'revision', v_revision);
  end if;
  -- A new lock on this light replaces the one it held before.
  update public.finale_signals
     set ended_second = v_now
   where crew_id = p_crew_id and night_no = v_state.night_no and light_id = p_light_id
     and on_target and ended_second is null and holds_until_second > v_now;
  insert into public.finale_signals (crew_id, night_no, light_id, post_seat_no, aimed_by, aimed_seat_no,
                                     bearing, on_target, case_second, holds_until_second)
  values (p_crew_id, v_state.night_no, p_light_id, v_post.seat_no, p_player_id, v_seat,
          p_bearing, true, v_now, v_now + p_lock_seconds);
  -- Do enough locks hold at this moment, from different seats at different lights?
  select count(distinct fs.post_seat_no), count(distinct fs.light_id)
    into v_seats, v_lights
    from public.finale_signals as fs
   where fs.crew_id = p_crew_id and fs.night_no = v_state.night_no
     and fs.on_target and fs.ended_second is null and fs.holds_until_second > v_now
     and public.finale_post_holds(p_crew_id, fs.light_id, fs.post_seat_no);
  if v_seats >= p_lights_needed and v_lights >= p_lights_needed then
    update public.finale_signals as fs
       set parted = true
     where fs.crew_id = p_crew_id and fs.night_no = v_state.night_no
       and fs.on_target and fs.ended_second is null and fs.holds_until_second > v_now
       and public.finale_post_holds(p_crew_id, fs.light_id, fs.post_seat_no);
    update public.case_state set schooner_found_second = v_now where crew_id = p_crew_id;
    v_parted := true;
  end if;
  v_revision := public.case_finish(p_crew_id, p_player_id, p_action_uid, 'signal', p_light_id,
                                   case when v_parted then 'parted' else 'locked' end, v_now);
  return jsonb_build_object('status', 'locked', 'parted', v_parted, 'revision', v_revision);
end;
$$;

-- Server-only tables have RLS and no player policy. History has no delete grant.
alter table public.board_pins enable row level security;
revoke all on table public.board_pins from public, anon, authenticated, service_role;
grant select, insert on table public.board_pins to service_role;
alter table public.finale_posts enable row level security;
revoke all on table public.finale_posts from public, anon, authenticated, service_role;
grant select, insert on table public.finale_posts to service_role;
alter table public.finale_signals enable row level security;
revoke all on table public.finale_signals from public, anon, authenticated, service_role;
grant select, insert on table public.finale_signals to service_role;
grant update (ended_second) on table public.finale_posts to service_role;
grant update (ended_second, parted) on table public.finale_signals to service_role;
revoke all on sequence public.finale_posts_id_seq from public, anon, authenticated, service_role;
revoke all on sequence public.finale_signals_id_seq from public, anon, authenticated, service_role;

-- Helpers and intents are private to the server, using its existing grants.
revoke all on function public.finale_post_holds(uuid, text, smallint) from public, anon, authenticated;
grant execute on function public.finale_post_holds(uuid, text, smallint) to service_role;
revoke all on function public.finale_leave_post(uuid, smallint, integer, integer) from public, anon, authenticated;
grant execute on function public.finale_leave_post(uuid, smallint, integer, integer) to service_role;
revoke all on function public.board_pin(uuid, uuid, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.board_pin(uuid, uuid, text, text, integer, text) to service_role;
revoke all on function public.board_pair(uuid, uuid, text, text, text, text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.board_pair(uuid, uuid, text, text, text, text, integer, integer, text) to service_role;
revoke all on function public.finale_nightfall(uuid, uuid, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.finale_nightfall(uuid, uuid, text, text, integer, integer) to service_role;
revoke all on function public.finale_take_post(uuid, uuid, text, text, boolean, integer, integer) from public, anon, authenticated;
grant execute on function public.finale_take_post(uuid, uuid, text, text, boolean, integer, integer) to service_role;
revoke all on function public.finale_signal(uuid, uuid, text, text, numeric, boolean, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.finale_signal(uuid, uuid, text, text, numeric, boolean, integer, integer, integer, integer) to service_role;

-- Catalog comments describe structure without embedding any case solution.
comment on function public.finale_post_holds(uuid, text, smallint) is 'A post holds only while the current crew seat has its recorded holder.';
comment on function public.finale_leave_post(uuid, smallint, integer, integer) is 'End a seat''s open post and current locks without removing its history.';
comment on function public.board_pin(uuid, uuid, text, text, integer, text) is 'Pin one landed find and pay its once-per-player clue reward atomically.';
comment on function public.board_pair(uuid, uuid, text, text, text, text, integer, integer, text) is 'Form a cross-seat deduction and pay every contributing pin owner once.';
comment on function public.finale_nightfall(uuid, uuid, text, text, integer, integer) is 'Begin another night only after its prerequisite and the dawn wait.';
comment on function public.finale_take_post(uuid, uuid, text, text, boolean, integer, integer) is 'Move a player to an available light after its climb; stale duties end.';
comment on function public.finale_signal(uuid, uuid, text, text, numeric, boolean, integer, integer, integer, integer) is 'Record an aim and part the fog only while distinct seats and lights overlap.';
comment on table public.board_pins is 'A seat pin, its landing time, contribution owner and once-per-player payout.';
comment on column public.board_pins.crew_id is 'Crew whose case owns this record.';
comment on column public.board_pins.card_id is 'Public card identifier, from C1 to C8.';
comment on column public.board_pins.seat_no is 'Kit seat number, from one to four.';
comment on column public.board_pins.ordered_second is 'Crew case second when a player pinned or ordered the partner pin.';
comment on column public.board_pins.pinned_second is 'Crew case second when this pin becomes available for pairing.';
comment on column public.board_pins.pinned_by is 'Player credited for this pin, including a partner orderer; null after deletion.';
comment on column public.board_pins.by_partner is 'Whether the pin was ordered for a partner.';
comment on column public.board_pins.order_no is 'Partner order number when applicable.';
comment on column public.board_pins.coins_rewarded is 'Clue coins actually paid, zero for a previously rewarded card.';
comment on column public.board_pins.created_at is 'Database time when this immutable history row was created.';
comment on table public.finale_posts is 'Light duty history; an open post is held by the same current seat holder.';
comment on column public.finale_posts.id is 'Database-generated history identifier.';
comment on column public.finale_posts.crew_id is 'Crew whose case owns this record.';
comment on column public.finale_posts.light_id is 'Public light identifier.';
comment on column public.finale_posts.seat_no is 'Kit seat number, from one to four.';
comment on column public.finale_posts.player_id is 'Player holding this duty; exactly one of player_id and npc_id is set.';
comment on column public.finale_posts.npc_id is 'Partner holding this duty; exactly one of player_id and npc_id is set.';
comment on column public.finale_posts.taken_second is 'Crew case second when the duty started.';
comment on column public.finale_posts.on_post_second is 'Crew case second when the climb finishes and aiming becomes possible.';
comment on column public.finale_posts.ended_second is 'Crew case second when explicitly ended; null while not explicitly ended.';
comment on column public.finale_posts.order_no is 'Partner order number when applicable.';
comment on column public.finale_posts.created_at is 'Database time when this immutable history row was created.';
comment on table public.finale_signals is 'Aim history and bounded locks; success marks every contributing live lock.';
comment on column public.finale_signals.id is 'Database-generated history identifier.';
comment on column public.finale_signals.crew_id is 'Crew whose case owns this record.';
comment on column public.finale_signals.night_no is 'One-based night whose aims are recorded.';
comment on column public.finale_signals.light_id is 'Public light identifier.';
comment on column public.finale_signals.post_seat_no is 'Seat holding the light when aimed; distinct post seats are required.';
comment on column public.finale_signals.aimed_by is 'Player who aimed, including a player aiming a partner light; null after deletion.';
comment on column public.finale_signals.aimed_seat_no is 'Seat of the player who aimed.';
comment on column public.finale_signals.bearing is 'Normalised compass bearing in degrees to one decimal, from zero below 360.';
comment on column public.finale_signals.on_target is 'Whether this aim hit the server-computed target.';
comment on column public.finale_signals.case_second is 'Crew case second when the aim happened.';
comment on column public.finale_signals.holds_until_second is 'Exclusive lock expiry second, set only for on-target aims.';
comment on column public.finale_signals.ended_second is 'Crew case second when explicitly ended; null while not explicitly ended.';
comment on column public.finale_signals.parted is 'Whether this lock contributed when the fog parted.';
comment on column public.finale_signals.created_at is 'Database time when this immutable history row was created.';
comment on column public.case_state.night_no is 'Number of the current or most recent night, zero before the first.';
comment on column public.case_state.night_started_second is 'Crew case second when the current or most recent night began.';
comment on column public.case_state.night_called_by is 'Player who called the current or most recent night; null after deletion.';
