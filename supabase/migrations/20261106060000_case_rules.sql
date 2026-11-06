-- WHAT IT DOES
-- Stores the crew case clock, findings, deductions, accusations, solvers and action receipts.
-- WHO USES IT
-- The case service calls the intent functions after deciding rules from server-only content.
-- WHAT IT NEEDS
-- The foundation, account, entry-profile and crew-code migrations from group 1.
-- SAFE TO RUN TWICE
-- Tables and indexes are created only if missing; functions, comments and grants repeat.
-- The empty solve hook is created only if missing, preserving its Phase 3 replacement.
-- HOW THE FILE IS ORGANISED
-- Tables, helpers, intent functions, access grants, then schema comments.

create table if not exists public.case_state (
  crew_id               uuid primary key references public.crews (id) on delete cascade,
  case_id               text not null,
  started_at            timestamptz not null,
  revision              bigint not null default 1,
  pair_wait_until       integer not null default 0,
  accuse_wait_until     integer not null default 0,
  schooner_found_second integer,
  solved_second         integer,
  solved_by             uuid references public.profiles (id) on delete set null,
  world_outcome         text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint case_state_case_id_format check (case_id ~ '^[a-z0-9_]{2,40}$'),
  constraint case_state_revision_positive check (revision >= 1),
  constraint case_state_waits_not_negative check (pair_wait_until >= 0 and accuse_wait_until >= 0),
  constraint case_state_schooner_not_negative check (schooner_found_second is null or schooner_found_second >= 0),
  constraint case_state_solved_needs_schooner check (solved_second is null or schooner_found_second is not null),
  constraint case_state_world_outcome_allowed check (world_outcome is null
    or (solved_second is not null and world_outcome in ('unchanged', 'locked', 'relit', 'added', 'already_recorded')))
);
create or replace trigger case_state_touch_updated_at
  before insert or update on public.case_state
  for each row execute function public.touch_updated_at();

create table if not exists public.case_finds (
  crew_id        uuid not null references public.crews (id) on delete cascade,
  seat_no        smallint not null,
  card_id        text not null,
  route_id       text not null,
  started_second integer not null,
  ready_second   integer not null,
  coins_paid     integer not null default 0,
  started_by     uuid references public.profiles (id) on delete set null,
  by_partner     boolean not null default false,
  order_no       integer,
  created_at     timestamptz not null default now(),
  primary key (crew_id, seat_no, card_id),
  constraint case_finds_seat_no_range check (seat_no between 1 and 4),
  constraint case_finds_card_id_format check (card_id ~ '^C[1-8]$'),
  constraint case_finds_route_matches_card check (split_part(route_id, '.', 1) = card_id),
  constraint case_finds_route_id_format check (route_id ~ '^C[1-8][.][a-z0-9_]{2,40}$'),
  constraint case_finds_times check (started_second >= 0 and ready_second >= started_second),
  constraint case_finds_coins_not_negative check (coins_paid >= 0),
  constraint case_finds_order_no_positive check (order_no is null or order_no >= 1)
);

create table if not exists public.case_deductions (
  crew_id       uuid not null references public.crews (id) on delete cascade,
  deduction_id  text not null,
  formed_second integer not null,
  formed_by     uuid references public.profiles (id) on delete set null,
  formed_seat   smallint not null,
  created_at    timestamptz not null default now(),
  primary key (crew_id, deduction_id),
  constraint case_deductions_id_format check (deduction_id ~ '^D[1-4]$'),
  constraint case_deductions_second_not_negative check (formed_second >= 0),
  constraint case_deductions_seat_range check (formed_seat between 1 and 4)
);

create table if not exists public.case_accusations (
  id          bigint generated always as identity primary key,
  crew_id     uuid not null references public.crews (id) on delete cascade,
  player_id   uuid references public.profiles (id) on delete set null,
  seat_no     smallint not null,
  suspect     text not null,
  correct     boolean not null,
  case_second integer not null,
  created_at  timestamptz not null default now(),
  constraint case_accusations_seat_range check (seat_no between 1 and 4),
  constraint case_accusations_suspect_format check (suspect ~ '^[a-z0-9_]{2,40}$'),
  constraint case_accusations_second_not_negative check (case_second >= 0)
);
create index if not exists case_accusations_crew_idx on public.case_accusations (crew_id, id desc);
-- The database's own guard for "accepted once": one correct accusation per crew.
create unique index if not exists case_accusations_one_correct on public.case_accusations (crew_id) where correct;

create table if not exists public.case_solvers (
  crew_id       uuid not null references public.crews (id) on delete cascade,
  player_id     uuid not null references public.profiles (id) on delete cascade,
  seat_no       smallint not null,
  kit           text not null,
  contributor   boolean not null,
  share         integer not null,
  share_paid    integer not null,
  solved_second integer not null,
  created_at    timestamptz not null default now(),
  primary key (crew_id, player_id),
  constraint case_solvers_seat_range check (seat_no between 1 and 4),
  constraint case_solvers_kit_allowed check (kit in ('true_keeper', 'witness', 'informant', 'stranger')),
  constraint case_solvers_share_range check (share between 0 and 1000000),
  constraint case_solvers_paid_is_all_or_nothing check (share_paid = 0 or share_paid = share),
  constraint case_solvers_share_only_for_contributors check (contributor or share = 0)
);
create index if not exists case_solvers_player_idx on public.case_solvers (player_id);

create table if not exists public.case_actions (
  id          bigint generated always as identity primary key,
  crew_id     uuid not null references public.crews (id) on delete cascade,
  player_id   uuid not null references public.profiles (id) on delete cascade,
  action_uid  text not null,
  kind        text not null,
  target      text,
  outcome     text not null,
  case_second integer not null,
  created_at  timestamptz not null default now(),
  constraint case_actions_action_uid_format check (action_uid ~ '^[A-Za-z0-9_-]{8,64}$'),
  constraint case_actions_kind_allowed check (kind in ('search', 'accuse', 'pin', 'pair', 'nightfall', 'post', 'signal', 'order', 'clock')),
  constraint case_actions_outcome_format check (outcome ~ '^[a-z_]{2,40}$'),
  constraint case_actions_second_not_negative check (case_second >= 0)
);
create unique index if not exists case_actions_one_per_uid on public.case_actions (player_id, action_uid);
create index if not exists case_actions_crew_idx on public.case_actions (crew_id, id desc);


create or replace function public.case_window_open(p_minute integer, p_every integer, p_from integer, p_open integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when p_every > 0 and p_minute >= 0 and p_from >= 0 and p_open > 0
    then p_from <= (p_minute % p_every) and (p_minute % p_every) < p_from + p_open
    else false end;
$$;

create or replace function public.case_begin(p_crew_id uuid, p_player_id uuid, p_action_uid text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_status     text;
  v_version    integer;
  v_seat       smallint;
  v_started_at timestamptz;
  v_revision   bigint;
  v_done       public.case_actions%rowtype;
begin
  if p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$' then
    raise exception 'bad_action_uid';
  end if;
  -- Every case write and every seat change of package A6 takes this lock first.
  select c.status, c.version into v_status, v_version
    from public.crews as c where c.id = p_crew_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_crew');
  end if;
  -- A repeat is answered first, from what was stored, whatever has changed since.
  select * into v_done from public.case_actions as a
   where a.player_id = p_player_id and a.action_uid = p_action_uid;
  if found then
    return jsonb_build_object('status', 'repeat', 'crewId', v_done.crew_id, 'kind', v_done.kind,
                              'target', v_done.target, 'outcome', v_done.outcome);
  end if;
  if v_status <> 'active' then
    return jsonb_build_object('status', 'refused', 'reason', 'crew_not_active', 'crewStatus', v_status);
  end if;
  select s.seat_no into v_seat from public.crew_seats as s
   where s.crew_id = p_crew_id and s.player_id = p_player_id;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'not_in_crew');
  end if;
  select cs.started_at, cs.revision into v_started_at, v_revision
    from public.case_state as cs where cs.crew_id = p_crew_id;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'case_not_open');
  end if;
  return jsonb_build_object(
    'status', 'ok',
    'seatNo', v_seat,
    'now', floor(extract(epoch from (clock_timestamp() - v_started_at)))::integer,
    'revision', v_revision,
    'crewVersion', v_version);
end;
$$;

create or replace function public.case_finish(p_crew_id uuid, p_player_id uuid, p_action_uid text,
  p_kind text, p_target text, p_outcome text, p_now integer)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_revision bigint;
begin
  insert into public.case_actions (crew_id, player_id, action_uid, kind, target, outcome, case_second)
  values (p_crew_id, p_player_id, p_action_uid, p_kind, p_target, p_outcome, p_now);
  update public.case_state set revision = revision + 1
   where crew_id = p_crew_id
  returning revision into v_revision;
  return v_revision;
end;
$$;


create or replace function public.case_open(p_crew_id uuid, p_case_id text, p_start_cards jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_status     text;
  v_started_at timestamptz;
begin
  if p_case_id is null or p_start_cards is null or jsonb_typeof(p_start_cards) <> 'array' then
    raise exception 'bad_case_open';
  end if;
  select c.status, c.started_at into v_status, v_started_at
    from public.crews as c where c.id = p_crew_id for update;
  if not found then
    return jsonb_build_object('status', 'refused', 'reason', 'no_crew');
  end if;
  if v_status <> 'active' or v_started_at is null then
    return jsonb_build_object('status', 'refused', 'reason', 'crew_not_active', 'crewStatus', v_status);
  end if;
  insert into public.case_state (crew_id, case_id, started_at)
  values (p_crew_id, p_case_id, v_started_at)
  on conflict (crew_id) do nothing;
  insert into public.case_finds (crew_id, seat_no, card_id, route_id, started_second, ready_second, by_partner)
  select s.crew_id, s.seat_no, start.card_id, start.route_id, 0, 0, s.npc_id is not null
    from public.crew_seats as s
    join jsonb_to_recordset(p_start_cards) as start(kit text, card_id text, route_id text)
      on start.kit = s.kit
   where s.crew_id = p_crew_id
  on conflict (crew_id, seat_no, card_id) do nothing;
  return jsonb_build_object('status', 'opened');
end;
$$;


create or replace function public.case_start_route(
  p_crew_id uuid, p_player_id uuid, p_action_uid text, p_card_id text, p_route_id text,
  p_needs_deductions text[], p_window jsonb, p_timer_seconds integer, p_coins integer, p_purchase_ref text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_begin    jsonb;
  v_seat     smallint;
  v_now      integer;
  v_minute   integer;
  v_revision bigint;
begin
  if p_card_id is null or p_route_id is null or p_needs_deductions is null
     or p_timer_seconds is null or p_timer_seconds < 0 or p_coins is null or p_coins < 0
     or (p_coins > 0 and (p_purchase_ref is null or btrim(p_purchase_ref) = '')) then
    raise exception 'bad_route';
  end if;
  v_begin := public.case_begin(p_crew_id, p_player_id, p_action_uid);
  if v_begin ->> 'status' <> 'ok' then
    return v_begin;
  end if;
  v_seat := (v_begin ->> 'seatNo')::smallint;
  v_now := (v_begin ->> 'now')::integer;
  v_minute := v_now / 60;
  if exists (
    select 1 from unnest(p_needs_deductions) as needed(deduction_id)
     where not exists (select 1 from public.case_deductions as d
                        where d.crew_id = p_crew_id and d.deduction_id = needed.deduction_id)
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'lead_locked');
  end if;
  if exists (select 1 from public.case_finds as f
              where f.crew_id = p_crew_id and f.seat_no = v_seat and f.card_id = p_card_id) then
    return jsonb_build_object('status', 'refused', 'reason', 'already_have');
  end if;
  if p_window is not null and not public.case_window_open(
       v_minute, (p_window ->> 'every')::integer, (p_window ->> 'from')::integer, (p_window ->> 'open')::integer) then
    return jsonb_build_object('status', 'refused', 'reason', 'locked_window', 'minute', v_minute);
  end if;
  if p_coins > 0 then
    perform public.apply_wallet_transaction(p_player_id, -p_coins, 'clue_purchase', p_purchase_ref);
  end if;
  insert into public.case_finds (crew_id, seat_no, card_id, route_id, started_second, ready_second,
                                 coins_paid, started_by)
  values (p_crew_id, v_seat, p_card_id, p_route_id, v_now, v_now + p_timer_seconds, p_coins, p_player_id);
  v_revision := public.case_finish(p_crew_id, p_player_id, p_action_uid, 'search', p_route_id, 'started', v_now);
  return jsonb_build_object('status', 'done', 'now', v_now, 'readySecond', v_now + p_timer_seconds,
                            'revision', v_revision);
end;
$$;


do $do$
begin
  if to_regprocedure('public.case_after_solve(uuid, boolean, uuid[])') is null then
    execute $create$
      create function public.case_after_solve(p_crew_id uuid, p_relight_open boolean, p_contributors uuid[])
      returns jsonb
      language plpgsql
      set search_path = ''
      as $body$
      begin
        -- Phase 3 (20261106120000_relighting.sql) replaces this function. Until then a solve
        -- changes nothing outside the crew.
        return jsonb_build_object('world', 'unchanged');
      end;
      $body$
    $create$;
    execute $comment$
      comment on function public.case_after_solve(uuid, boolean, uuid[]) is
        'The world hook of a solve. This first version changes nothing and answers {world: unchanged}. 20261106120000_relighting.sql replaces it, and this file never puts it back.'
    $comment$;
  end if;
end;
$do$;
revoke all on function public.case_after_solve(uuid, boolean, uuid[]) from public, anon, authenticated;
grant execute on function public.case_after_solve(uuid, boolean, uuid[]) to service_role;


create or replace function public.case_accuse(
  p_crew_id uuid, p_player_id uuid, p_action_uid text, p_suspect text, p_culprit text,
  p_needs_deductions text[], p_wrong_wait_seconds integer, p_share_base integer, p_share_max integer,
  p_share_ref text, p_payouts jsonb, p_expected_revision bigint, p_expected_crew_version integer,
  p_relight_open boolean)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_begin        jsonb;
  v_seat         smallint;
  v_now          integer;
  v_state        public.case_state%rowtype;
  v_revision     bigint;
  v_payout       record;
  v_paid         integer;
  v_paid_list    jsonb := '[]'::jsonb;
  v_contributors uuid[] := '{}';
  v_world        jsonb;
begin
  if p_suspect is null or p_culprit is null or p_needs_deductions is null
     or p_wrong_wait_seconds is null or p_wrong_wait_seconds < 1
     or p_share_base is null or p_share_max is null or p_share_base < 1 or p_share_max < p_share_base
     or p_share_ref is null or btrim(p_share_ref) = ''
     or p_expected_revision is null or p_expected_crew_version is null
     or p_payouts is null or jsonb_typeof(p_payouts) <> 'array' or jsonb_array_length(p_payouts) > 4 then
    raise exception 'bad_accusation';
  end if;
  if (select count(distinct x.player_id) from jsonb_to_recordset(p_payouts) as x(player_id uuid))
     <> jsonb_array_length(p_payouts) then
    raise exception 'bad_payout';
  end if;
  v_begin := public.case_begin(p_crew_id, p_player_id, p_action_uid);
  if v_begin ->> 'status' <> 'ok' then
    return v_begin;
  end if;
  v_seat := (v_begin ->> 'seatNo')::smallint;
  v_now := (v_begin ->> 'now')::integer;
  select * into v_state from public.case_state where crew_id = p_crew_id;
  -- Defensive only: a solved crew is finished, so case_begin has refused already.
  if v_state.solved_second is not null then
    return jsonb_build_object('status', 'refused', 'reason', 'already_solved');
  end if;
  if v_state.schooner_found_second is null then
    return jsonb_build_object('status', 'refused', 'reason', 'schooner_required');
  end if;
  if exists (
    select 1 from unnest(p_needs_deductions) as needed(deduction_id)
     where not exists (select 1 from public.case_deductions as d
                        where d.crew_id = p_crew_id and d.deduction_id = needed.deduction_id)
  ) then
    return jsonb_build_object('status', 'refused', 'reason', 'evidence_required');
  end if;
  if v_now < v_state.accuse_wait_until then
    return jsonb_build_object('status', 'refused', 'reason', 'accusation_cooldown',
                              'seconds', v_state.accuse_wait_until - v_now);
  end if;
  if p_suspect <> p_culprit then
    insert into public.case_accusations (crew_id, player_id, seat_no, suspect, correct, case_second)
    values (p_crew_id, p_player_id, v_seat, p_suspect, false, v_now);
    update public.case_state set accuse_wait_until = v_now + p_wrong_wait_seconds
     where crew_id = p_crew_id;
    v_revision := public.case_finish(p_crew_id, p_player_id, p_action_uid, 'accuse', p_suspect,
                                     'wrong_suspect', v_now);
    return jsonb_build_object('status', 'wrong', 'seconds', p_wrong_wait_seconds, 'revision', v_revision);
  end if;
  -- The payouts were worked out from a snapshot read before this lock. If anything was written
  -- since, nothing changes here: Python reads the snapshot again and retries once.
  if (v_begin ->> 'revision')::bigint <> p_expected_revision
     or (v_begin ->> 'crewVersion')::integer <> p_expected_crew_version then
    return jsonb_build_object('status', 'refused', 'reason', 'state_changed');
  end if;
  insert into public.case_accusations (crew_id, player_id, seat_no, suspect, correct, case_second)
  values (p_crew_id, p_player_id, v_seat, p_suspect, true, v_now);
  update public.case_state set solved_second = v_now, solved_by = p_player_id
   where crew_id = p_crew_id;
  for v_payout in
    select x.player_id, x.share from jsonb_to_recordset(p_payouts) as x(player_id uuid, share integer)
  loop
    if v_payout.share is null or v_payout.share < p_share_base or v_payout.share > p_share_max
       or not exists (select 1 from public.crew_seats as s
                       where s.crew_id = p_crew_id and s.player_id = v_payout.player_id) then
      raise exception 'bad_payout';
    end if;
    begin
      perform public.apply_wallet_transaction(v_payout.player_id, v_payout.share, 'mystery_reward', p_share_ref);
      v_paid := v_payout.share;
    exception when unique_violation then
      v_paid := 0;  -- solved before, in another crew: the share is paid once per player
    end;
    insert into public.case_solvers (crew_id, player_id, seat_no, kit, contributor, share, share_paid, solved_second)
    select p_crew_id, s.player_id, s.seat_no, s.kit, true, v_payout.share, v_paid, v_now
      from public.crew_seats as s
     where s.crew_id = p_crew_id and s.player_id = v_payout.player_id;
    v_contributors := array_append(v_contributors, v_payout.player_id);
    v_paid_list := v_paid_list || jsonb_build_object('playerId', v_payout.player_id,
                                                     'share', v_payout.share, 'paid', v_paid);
  end loop;
  -- Every other player seat saw the solve too: it may read the reveal, and earns nothing.
  insert into public.case_solvers (crew_id, player_id, seat_no, kit, contributor, share, share_paid, solved_second)
  select p_crew_id, s.player_id, s.seat_no, s.kit, false, 0, 0, v_now
    from public.crew_seats as s
   where s.crew_id = p_crew_id and s.player_id is not null
  on conflict (crew_id, player_id) do nothing;
  update public.crews set status = 'finished', version = version + 1 where id = p_crew_id;
  v_world := public.case_after_solve(p_crew_id, p_relight_open, v_contributors);
  -- Every solver's reveal shows what this solve did to the world (the row is locked already).
  update public.case_state set world_outcome = v_world ->> 'world' where crew_id = p_crew_id;
  v_revision := public.case_finish(p_crew_id, p_player_id, p_action_uid, 'accuse', p_suspect, 'solved', v_now);
  return jsonb_build_object('status', 'solved', 'payouts', v_paid_list, 'world', v_world,
                            'revision', v_revision);
end;
$$;


create or replace function public.case_clock_forward(p_crew_id uuid, p_player_id uuid, p_action_uid text,
  p_seconds integer)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_begin    jsonb;
  v_now      integer;
  v_revision bigint;
begin
  if p_seconds is null or p_seconds < 1 or p_seconds > 3600 then
    raise exception 'bad_clock';
  end if;
  v_begin := public.case_begin(p_crew_id, p_player_id, p_action_uid);
  if v_begin ->> 'status' <> 'ok' then
    return v_begin;
  end if;
  -- Moving the start back moves every case second of this crew forward. Nothing else changes.
  update public.case_state
     set started_at = started_at - make_interval(secs => p_seconds)
   where crew_id = p_crew_id;
  v_now := (v_begin ->> 'now')::integer + p_seconds;
  v_revision := public.case_finish(p_crew_id, p_player_id, p_action_uid, 'clock', null, 'moved', v_now);
  return jsonb_build_object('status', 'done', 'now', v_now, 'revision', v_revision);
end;
$$;


-- Case records are server-only, read through the API. History is append-only.
alter table public.case_state enable row level security;
revoke all on table public.case_state from public, anon, authenticated, service_role;
grant select, insert, update on table public.case_state to service_role;
alter table public.case_finds enable row level security;
revoke all on table public.case_finds from public, anon, authenticated, service_role;
grant select, insert on table public.case_finds to service_role;
alter table public.case_deductions enable row level security;
revoke all on table public.case_deductions from public, anon, authenticated, service_role;
grant select, insert on table public.case_deductions to service_role;
alter table public.case_accusations enable row level security;
revoke all on table public.case_accusations from public, anon, authenticated, service_role;
grant select, insert on table public.case_accusations to service_role;
alter table public.case_solvers enable row level security;
revoke all on table public.case_solvers from public, anon, authenticated, service_role;
grant select, insert on table public.case_solvers to service_role;
alter table public.case_actions enable row level security;
revoke all on table public.case_actions from public, anon, authenticated, service_role;
grant select, insert on table public.case_actions to service_role;
revoke all on sequence public.case_accusations_id_seq from public, anon, authenticated, service_role;
revoke all on sequence public.case_actions_id_seq from public, anon, authenticated, service_role;

-- Only the server may call case helpers or intents. All run with caller rights.
revoke all on function public.case_window_open(integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.case_window_open(integer, integer, integer, integer) to service_role;
revoke all on function public.case_begin(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.case_begin(uuid, uuid, text) to service_role;
revoke all on function public.case_finish(uuid, uuid, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.case_finish(uuid, uuid, text, text, text, text, integer) to service_role;
revoke all on function public.case_open(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.case_open(uuid, text, jsonb) to service_role;
revoke all on function public.case_start_route(uuid, uuid, text, text, text, text[], jsonb, integer, integer, text) from public, anon, authenticated;
grant execute on function public.case_start_route(uuid, uuid, text, text, text, text[], jsonb, integer, integer, text) to service_role;
revoke all on function public.case_accuse(uuid, uuid, text, text, text, text[], integer, integer, integer, text, jsonb, bigint, integer, boolean) from public, anon, authenticated;
grant execute on function public.case_accuse(uuid, uuid, text, text, text, text[], integer, integer, integer, text, jsonb, bigint, integer, boolean) to service_role;
revoke all on function public.case_clock_forward(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.case_clock_forward(uuid, uuid, text, integer) to service_role;
comment on function public.case_window_open(integer, integer, integer, integer) is
  'Tests whether a case minute is inside a recurring window. Invalid periods are closed.';
comment on function public.case_begin(uuid, uuid, text) is
  'Locks the crew, returns a stored repeat first, checks active membership and reads the database case clock.';
comment on function public.case_finish(uuid, uuid, text, text, text, text, integer) is
  'Records one changed intent and advances its crew case revision exactly once.';
comment on function public.case_open(uuid, text, jsonb) is
  'Creates case state at the muster clock and missing starting cards, including partner seats. Safe to repeat.';
comment on function public.case_start_route(uuid, uuid, text, text, text, text[], jsonb, integer, integer, text) is
  'Starts one validated route for the caller seat, checking shared gates, held cards and the database window.';
comment on function public.case_accuse(uuid, uuid, text, text, text, text[], integer, integer, integer, text, jsonb, bigint, integer, boolean) is
  'Records an accusation, enforces evidence and waits, and accepts a fresh correct solve once with once-per-player rewards.';
comment on function public.case_clock_forward(uuid, uuid, text, integer) is
  'Moves an active crew case clock forward by 1 to 3600 seconds. The server separately checks host authorization.';

-- Explain every table and column without embedding case solution content.
comment on table public.case_state is
  'Server-only case records for state. Players read only the authorized API view.';
comment on column public.case_state.crew_id is
  'The crew id recorded for this state entry. Server only.';
comment on column public.case_state.case_id is
  'The case id recorded for this state entry. Server only.';
comment on column public.case_state.started_at is
  'The started at recorded for this state entry. Server only.';
comment on column public.case_state.revision is
  'The revision recorded for this state entry. Server only.';
comment on column public.case_state.pair_wait_until is
  'The pair wait until recorded for this state entry. Server only.';
comment on column public.case_state.accuse_wait_until is
  'The accuse wait until recorded for this state entry. Server only.';
comment on column public.case_state.schooner_found_second is
  'The schooner found second recorded for this state entry. Server only.';
comment on column public.case_state.solved_second is
  'The solved second recorded for this state entry. Server only.';
comment on column public.case_state.solved_by is
  'The solved by recorded for this state entry. Server only.';
comment on column public.case_state.world_outcome is
  'The world outcome recorded for this state entry. Server only.';
comment on column public.case_state.created_at is
  'The created at recorded for this state entry. Server only.';
comment on column public.case_state.updated_at is
  'The updated at recorded for this state entry. Server only.';
comment on table public.case_finds is
  'Server-only case records for finds. Players read only the authorized API view.';
comment on column public.case_finds.crew_id is
  'The crew id recorded for this finds entry. Server only.';
comment on column public.case_finds.seat_no is
  'The seat no recorded for this finds entry. Server only.';
comment on column public.case_finds.card_id is
  'The card id recorded for this finds entry. Server only.';
comment on column public.case_finds.route_id is
  'The route id recorded for this finds entry. Server only.';
comment on column public.case_finds.started_second is
  'The started second recorded for this finds entry. Server only.';
comment on column public.case_finds.ready_second is
  'The ready second recorded for this finds entry. Server only.';
comment on column public.case_finds.coins_paid is
  'The coins paid recorded for this finds entry. Server only.';
comment on column public.case_finds.started_by is
  'The started by recorded for this finds entry. Server only.';
comment on column public.case_finds.by_partner is
  'The by partner recorded for this finds entry. Server only.';
comment on column public.case_finds.order_no is
  'The order no recorded for this finds entry. Server only.';
comment on column public.case_finds.created_at is
  'The created at recorded for this finds entry. Server only.';
comment on table public.case_deductions is
  'Server-only case records for deductions. Players read only the authorized API view.';
comment on column public.case_deductions.crew_id is
  'The crew id recorded for this deductions entry. Server only.';
comment on column public.case_deductions.deduction_id is
  'The deduction id recorded for this deductions entry. Server only.';
comment on column public.case_deductions.formed_second is
  'The formed second recorded for this deductions entry. Server only.';
comment on column public.case_deductions.formed_by is
  'The formed by recorded for this deductions entry. Server only.';
comment on column public.case_deductions.formed_seat is
  'The formed seat recorded for this deductions entry. Server only.';
comment on column public.case_deductions.created_at is
  'The created at recorded for this deductions entry. Server only.';
comment on table public.case_accusations is
  'Server-only case records for accusations. Players read only the authorized API view.';
comment on column public.case_accusations.id is
  'The id recorded for this accusations entry. Server only.';
comment on column public.case_accusations.crew_id is
  'The crew id recorded for this accusations entry. Server only.';
comment on column public.case_accusations.player_id is
  'The player id recorded for this accusations entry. Server only.';
comment on column public.case_accusations.seat_no is
  'The seat no recorded for this accusations entry. Server only.';
comment on column public.case_accusations.suspect is
  'The suspect recorded for this accusations entry. Server only.';
comment on column public.case_accusations.correct is
  'The correct recorded for this accusations entry. Server only.';
comment on column public.case_accusations.case_second is
  'The case second recorded for this accusations entry. Server only.';
comment on column public.case_accusations.created_at is
  'The created at recorded for this accusations entry. Server only.';
comment on table public.case_solvers is
  'Server-only case records for solvers. Players read only the authorized API view.';
comment on column public.case_solvers.crew_id is
  'The crew id recorded for this solvers entry. Server only.';
comment on column public.case_solvers.player_id is
  'The player id recorded for this solvers entry. Server only.';
comment on column public.case_solvers.seat_no is
  'The seat no recorded for this solvers entry. Server only.';
comment on column public.case_solvers.kit is
  'The kit recorded for this solvers entry. Server only.';
comment on column public.case_solvers.contributor is
  'The contributor recorded for this solvers entry. Server only.';
comment on column public.case_solvers.share is
  'The share recorded for this solvers entry. Server only.';
comment on column public.case_solvers.share_paid is
  'The share paid recorded for this solvers entry. Server only.';
comment on column public.case_solvers.solved_second is
  'The solved second recorded for this solvers entry. Server only.';
comment on column public.case_solvers.created_at is
  'The created at recorded for this solvers entry. Server only.';
comment on table public.case_actions is
  'Server-only case records for actions. Players read only the authorized API view.';
comment on column public.case_actions.id is
  'The id recorded for this actions entry. Server only.';
comment on column public.case_actions.crew_id is
  'The crew id recorded for this actions entry. Server only.';
comment on column public.case_actions.player_id is
  'The player id recorded for this actions entry. Server only.';
comment on column public.case_actions.action_uid is
  'The action uid recorded for this actions entry. Server only.';
comment on column public.case_actions.kind is
  'The kind recorded for this actions entry. Server only.';
comment on column public.case_actions.target is
  'The target recorded for this actions entry. Server only.';
comment on column public.case_actions.outcome is
  'The outcome recorded for this actions entry. Server only.';
comment on column public.case_actions.case_second is
  'The case second recorded for this actions entry. Server only.';
comment on column public.case_actions.created_at is
  'The created at recorded for this actions entry. Server only.';
