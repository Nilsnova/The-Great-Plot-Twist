-- Durable festival reservations and friendly Keepers' Ring matchmaking.
-- Uses the original Relighting timestamp and unchanged A7 duel functions; no wallet reasons.
-- All state is server-only. Applying this file never opens or starts the festival.

-- A separate row serializes festival writes without reversing the solve's wallet -> world lock order.
create table if not exists public.festival_control (
  id smallint primary key default 1 check (id = 1)
);
insert into public.festival_control (id) values (1) on conflict do nothing;

-- Exact action receipts survive visible claim expiry and changed request targets.
create table if not exists public.festival_actions (
  player_id uuid not null references public.profiles (id) on delete cascade,
  action_uid text not null check (action_uid ~ '^[A-Za-z0-9_-]{8,64}$'),
  kind text not null check (kind in ('claim', 'join', 'leave')),
  reply jsonb not null check (jsonb_typeof(reply) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (player_id, action_uid)
);

-- A reservation neither lights a lamp nor changes the later-solve extra_lights counter.
create table if not exists public.festival_claims (
  lamp_id text primary key check (lamp_id ~ '^festival_lamp_(0[1-9]|1[0-2])$'),
  player_id uuid not null references public.profiles (id) on delete cascade,
  claimed_at timestamptz not null default clock_timestamp()
);
create index if not exists festival_claims_player_idx on public.festival_claims (player_id);

-- Signals remain server-only until the unchanged A7 functions seal and resolve both envelopes.
create table if not exists public.festival_queue (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  signals text[] not null,
  state text not null default 'queued' check (state in ('queued', 'paired', 'left')),
  duel_id uuid references public.duels (id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  constraint festival_queue_three_signals check (
    array_ndims(signals) = 1 and cardinality(signals) = 3
    and array_position(signals, null) is null
    and signals <@ array['flash', 'shade', 'mirror']::text[]
    and cardinality(array_positions(signals, 'flash')) * 2
      + cardinality(array_positions(signals, 'mirror')) <= 3
  )
);
create unique index if not exists festival_queue_one_waiting_player
  on public.festival_queue (player_id) where state = 'queued';
create index if not exists festival_queue_fifo_idx
  on public.festival_queue (created_at, id) where state = 'queued';
create index if not exists festival_queue_player_idx
  on public.festival_queue (player_id, created_at desc, id desc);
create index if not exists festival_queue_duel_idx on public.festival_queue (duel_id);

-- The event lasts exactly 172800 elapsed seconds from the one original Relighting.
create or replace function public.festival_phase()
returns text language sql security invoker set search_path = '' as $$
  select case
    when stage <> 'relit' or relit_at is null or clock_timestamp() < relit_at then 'waiting'
    when clock_timestamp() >= relit_at + interval '48 hours' then 'ended'
    else 'active' end
  from public.world_state where id = 1;
$$;

-- Save one immutable result; no receipt includes a sealed signal or another player's id.
create or replace function public.festival_finish(
  p_player_id uuid, p_action_uid text, p_kind text, p_reply jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  p_reply := p_reply || jsonb_build_object('repeat', false);
  insert into public.festival_actions (player_id, action_uid, kind, reply)
  values (p_player_id, p_action_uid, p_kind, p_reply);
  return p_reply;
end;
$$;

-- Serialize writes, replay first, then check the real clock and current player record.
create or replace function public.festival_begin(p_player_id uuid, p_action_uid text, p_kind text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_reply jsonb; v_phase text;
begin
  if p_player_id is null or p_action_uid is null or p_action_uid !~ '^[A-Za-z0-9_-]{8,64}$'
     or p_kind is null or p_kind not in ('claim', 'join', 'leave') then
    raise exception 'bad_festival_action';
  end if;
  perform 1 from public.festival_control where id = 1 for update;
  if not found then raise exception 'festival_state_missing'; end if;
  select reply into v_reply from public.festival_actions
   where player_id = p_player_id and action_uid = p_action_uid;
  if found then return v_reply || jsonb_build_object('repeat', true); end if;
  -- Keep the profile alive through a write; account deletion never waits on our control row.
  perform 1 from public.profiles where id = p_player_id for key share;
  if not found then raise exception 'player_not_set_up'; end if;
  v_phase := public.festival_phase();
  if v_phase is null then raise exception 'world_state_missing'; end if;
  if v_phase <> 'active' then
    return public.festival_finish(p_player_id, p_action_uid, p_kind,
      jsonb_build_object('status', 'refused', 'accepted', false,
        'reason', 'festival_' || v_phase, 'outcome', null));
  end if;
  return jsonb_build_object('status', 'ready');
end;
$$;

-- A read-only private preview lets Python reuse A7's pure resolver for the exact FIFO candidate.
create or replace function public.festival_ring_candidate(p_player_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select jsonb_build_object('candidate', (
    select jsonb_build_object('id', q.id, 'playerId', q.player_id, 'signals', q.signals)
      from public.festival_queue as q
     where q.state = 'queued' and q.player_id <> p_player_id
       and not exists (select 1 from public.duels as d where d.status = 'open'
         and d.expires_at > clock_timestamp()
         and (d.challenger_id = q.player_id or d.opponent_id = q.player_id))
     order by q.created_at, q.id limit 1
  ));
$$;

-- Exclusive per-lamp reservations. One captain may reserve more than one distinct lamp.
create or replace function public.festival_claim(p_player_id uuid, p_action_uid text, p_lamp_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_begin jsonb; v_owner uuid; v_outcome text;
begin
  v_begin := public.festival_begin(p_player_id, p_action_uid, 'claim');
  if v_begin ->> 'status' <> 'ready' then return v_begin; end if;
  if p_lamp_id is null or p_lamp_id !~ '^festival_lamp_(0[1-9]|1[0-2])$' then
    raise exception 'bad_festival_lamp';
  end if;
  select player_id into v_owner from public.festival_claims where lamp_id = p_lamp_id;
  if found and v_owner <> p_player_id then
    return public.festival_finish(p_player_id, p_action_uid, 'claim',
      jsonb_build_object('status', 'refused', 'accepted', false, 'reason', 'lamp_occupied',
        'outcome', null, 'lampId', p_lamp_id));
  end if;
  v_outcome := case when v_owner is null then 'claimed' else 'already_claimed' end;
  if v_owner is null then
    insert into public.festival_claims (lamp_id, player_id) values (p_lamp_id, p_player_id);
  end if;
  return public.festival_finish(p_player_id, p_action_uid, 'claim',
    jsonb_build_object('status', 'done', 'accepted', true, 'reason', null,
      'outcome', v_outcome, 'lampId', p_lamp_id));
end;
$$;

-- Leave only this captain's waiting entry; receipts remain exact after pairing or expiry.
create or replace function public.festival_ring_leave(p_player_id uuid, p_action_uid text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_begin jsonb; v_queue_id uuid;
begin
  v_begin := public.festival_begin(p_player_id, p_action_uid, 'leave');
  if v_begin ->> 'status' <> 'ready' then return v_begin; end if;
  update public.festival_queue set state = 'left'
   where player_id = p_player_id and state = 'queued' returning id into v_queue_id;
  if not found then
    return public.festival_finish(p_player_id, p_action_uid, 'leave',
      jsonb_build_object('status', 'refused', 'accepted', false,
        'reason', 'not_queued', 'outcome', null));
  end if;
  return public.festival_finish(p_player_id, p_action_uid, 'leave',
    jsonb_build_object('status', 'done', 'accepted', true, 'reason', null,
      'outcome', 'left', 'queueId', v_queue_id));
end;
$$;

-- Queue privately, or atomically create and answer a friendly three-round A7 duel.
-- Candidate identity is rechecked under the control lock, so an old Python resolution cannot pair wrong people.
create or replace function public.festival_ring_join(
  p_player_id uuid, p_action_uid text, p_signals text[], p_expected_queue_id uuid,
  p_round_results text[], p_outcome text, p_day_start timestamptz)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_begin jsonb; v_candidate jsonb; v_queue public.festival_queue%rowtype;
  v_own_id uuid; v_duel_id uuid; v_created jsonb; v_answered jsonb;
  v_players uuid[]; v_count integer; v_phase text;
begin
  v_begin := public.festival_begin(p_player_id, p_action_uid, 'join');
  if v_begin ->> 'status' <> 'ready' then return v_begin; end if;
  if p_signals is null or array_ndims(p_signals) <> 1 or cardinality(p_signals) <> 3
     or array_position(p_signals, null) is not null
     or not p_signals <@ array['flash', 'shade', 'mirror']::text[]
     or cardinality(array_positions(p_signals, 'flash')) * 2
        + cardinality(array_positions(p_signals, 'mirror')) > 3 then
    raise exception 'bad_festival_signals';
  end if;
  if exists (select 1 from public.duels where status = 'open' and expires_at > clock_timestamp()
      and (challenger_id = p_player_id or opponent_id = p_player_id)) then
    return public.festival_finish(p_player_id, p_action_uid, 'join',
      jsonb_build_object('status', 'refused', 'accepted', false, 'reason', 'in_duel', 'outcome', null));
  end if;
  select id into v_own_id from public.festival_queue
   where player_id = p_player_id and state = 'queued';
  if found then
    return public.festival_finish(p_player_id, p_action_uid, 'join',
      jsonb_build_object('status', 'refused', 'accepted', false, 'reason', 'already_queued',
        'outcome', null, 'queueId', v_own_id));
  end if;
  v_candidate := public.festival_ring_candidate(p_player_id) -> 'candidate';
  if (v_candidate ->> 'id')::uuid is distinct from p_expected_queue_id then
    return jsonb_build_object('status', 'state_changed');
  end if;
  if p_expected_queue_id is not null then
    select * into v_queue from public.festival_queue where id = p_expected_queue_id;
    if not found then return jsonb_build_object('status', 'state_changed'); end if;
    v_players := array[p_player_id, v_queue.player_id];
  else
    v_players := array[p_player_id];
  end if;
  -- Protect participant profiles before wallet locks, so deletion cascades cannot reverse that order.
  perform 1 from public.profiles where id = any(v_players) order by id for key share;
  get diagnostics v_count = row_count;
  if v_count <> cardinality(v_players) then return jsonb_build_object('status', 'state_changed'); end if;
  -- A7 create locks one wallet, answer locks both. Pre-lock both in UUID order to avoid inversions.
  perform 1 from public.wallets where player_id = any(v_players) order by player_id for update;
  get diagnostics v_count = row_count;
  if v_count <> cardinality(v_players) then raise exception 'wallet_not_found'; end if;
  v_phase := public.festival_phase();
  if v_phase <> 'active' then
    return public.festival_finish(p_player_id, p_action_uid, 'join',
      jsonb_build_object('status', 'refused', 'accepted', false,
        'reason', 'festival_' || v_phase, 'outcome', null));
  end if;
  if exists (select 1 from public.duels where status = 'open' and expires_at > clock_timestamp()
      and (challenger_id = p_player_id or opponent_id = p_player_id)) then
    return public.festival_finish(p_player_id, p_action_uid, 'join',
      jsonb_build_object('status', 'refused', 'accepted', false, 'reason', 'in_duel', 'outcome', null));
  end if;
  if (public.festival_ring_candidate(p_player_id) -> 'candidate' ->> 'id')::uuid
       is distinct from p_expected_queue_id then
    return jsonb_build_object('status', 'state_changed');
  end if;
  -- The pure queue rule drops captains who entered another active duel while waiting.
  update public.festival_queue as q set state = 'left'
   where q.state = 'queued' and exists (select 1 from public.duels as d
     where d.status = 'open' and d.expires_at > clock_timestamp()
       and (d.challenger_id = q.player_id or d.opponent_id = q.player_id));
  if p_expected_queue_id is null then
    insert into public.festival_queue (player_id, signals) values (p_player_id, p_signals)
    returning id into v_own_id;
    return public.festival_finish(p_player_id, p_action_uid, 'join',
      jsonb_build_object('status', 'done', 'accepted', true, 'reason', null,
        'outcome', 'queued', 'queueId', v_own_id));
  end if;
  -- Neither intermediate challenge nor its first envelope is visible outside this transaction.
  v_created := public.duel_create(v_queue.player_id, null, 3, 0, 5, v_queue.signals,
    'festival_' || replace(v_queue.id::text, '-', ''), 24, 3);
  if v_created ->> 'status' <> 'done' then raise exception 'festival_duel_create_failed'; end if;
  v_duel_id := (v_created ->> 'duelId')::uuid;
  v_answered := public.duel_answer(v_duel_id, p_player_id, p_signals,
    'festival_' || md5(p_player_id::text || ':' || p_action_uid),
    p_round_results, p_outcome, p_day_start, 3);
  if v_answered ->> 'status' <> 'done' then raise exception 'festival_duel_answer_failed'; end if;
  update public.festival_queue set state = 'paired', duel_id = v_duel_id where id = v_queue.id;
  insert into public.festival_queue (player_id, signals, state, duel_id)
  values (p_player_id, p_signals, 'paired', v_duel_id) returning id into v_own_id;
  return public.festival_finish(p_player_id, p_action_uid, 'join',
    jsonb_build_object('status', 'done', 'accepted', true, 'reason', null,
      'outcome', 'paired', 'queueId', v_own_id, 'duelId', v_duel_id));
end;
$$;

-- All four tables have RLS without player policies; visible data comes through the API only.
alter table public.festival_control enable row level security;
alter table public.festival_actions enable row level security;
alter table public.festival_claims enable row level security;
alter table public.festival_queue enable row level security;
revoke all on table public.festival_control, public.festival_actions, public.festival_claims, public.festival_queue
  from public, anon, authenticated, service_role;
grant select, update (id) on table public.festival_control to service_role;
grant select, insert on table public.festival_actions, public.festival_claims, public.festival_queue to service_role;
grant update (state, duel_id) on table public.festival_queue to service_role;

-- Helpers and intents retain caller rights and are executable only by the server.
revoke all on function public.festival_phase() from public, anon, authenticated;
grant execute on function public.festival_phase() to service_role;
comment on function public.festival_phase() is 'Server-only festival timing, exact receipts or friendly A7 matchmaking; no wallet rewards.';
revoke all on function public.festival_finish(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.festival_finish(uuid, text, text, jsonb) to service_role;
comment on function public.festival_finish(uuid, text, text, jsonb) is 'Server-only festival timing, exact receipts or friendly A7 matchmaking; no wallet rewards.';
revoke all on function public.festival_begin(uuid, text, text) from public, anon, authenticated;
grant execute on function public.festival_begin(uuid, text, text) to service_role;
comment on function public.festival_begin(uuid, text, text) is 'Server-only festival timing, exact receipts or friendly A7 matchmaking; no wallet rewards.';
revoke all on function public.festival_ring_candidate(uuid) from public, anon, authenticated;
grant execute on function public.festival_ring_candidate(uuid) to service_role;
comment on function public.festival_ring_candidate(uuid) is 'Server-only festival timing, exact receipts or friendly A7 matchmaking; no wallet rewards.';
revoke all on function public.festival_claim(uuid, text, text) from public, anon, authenticated;
grant execute on function public.festival_claim(uuid, text, text) to service_role;
comment on function public.festival_claim(uuid, text, text) is 'Server-only festival timing, exact receipts or friendly A7 matchmaking; no wallet rewards.';
revoke all on function public.festival_ring_leave(uuid, text) from public, anon, authenticated;
grant execute on function public.festival_ring_leave(uuid, text) to service_role;
comment on function public.festival_ring_leave(uuid, text) is 'Server-only festival timing, exact receipts or friendly A7 matchmaking; no wallet rewards.';
revoke all on function public.festival_ring_join(uuid, text, text[], uuid, text[], text, timestamptz) from public, anon, authenticated;
grant execute on function public.festival_ring_join(uuid, text, text[], uuid, text[], text, timestamptz) to service_role;
comment on function public.festival_ring_join(uuid, text, text[], uuid, text[], text, timestamptz) is 'Server-only festival timing, exact receipts or friendly A7 matchmaking; no wallet rewards.';

-- Catalog descriptions contain structure only, never sealed signals or private case content.
comment on table public.festival_control is 'Server-only durable festival state; player access is through authenticated API views.';
comment on column public.festival_control.id is 'The single serialization row for festival writes, independent of world solve locks.';
comment on table public.festival_actions is 'Server-only durable festival state; player access is through authenticated API views.';
comment on column public.festival_actions.player_id is 'Verified player who made this action; deleted with their account.';
comment on column public.festival_actions.action_uid is 'Exact caller-generated click receipt, unique per player.';
comment on column public.festival_actions.kind is 'The claim, join or leave operation originally accepted or refused.';
comment on column public.festival_actions.reply is 'Immutable public-safe result without sealed signals or another player id.';
comment on column public.festival_actions.created_at is 'Database time when this action result was recorded.';
comment on table public.festival_claims is 'Server-only durable festival state; player access is through authenticated API views.';
comment on column public.festival_claims.lamp_id is 'Canonical festival_lamp_01 to festival_lamp_12 spot identifier.';
comment on column public.festival_claims.player_id is 'Current reservation owner, cleared by account deletion.';
comment on column public.festival_claims.claimed_at is 'Database time when this reservation was accepted.';
comment on table public.festival_queue is 'Server-only durable festival state; player access is through authenticated API views.';
comment on column public.festival_queue.id is 'Server-generated immutable queue entry identifier.';
comment on column public.festival_queue.player_id is 'Verified waiting or paired captain, cleared by account deletion.';
comment on column public.festival_queue.signals is 'Three sealed A7 signals, visible only to server code.';
comment on column public.festival_queue.state is 'Queued, paired or left; old entries remain history.';
comment on column public.festival_queue.duel_id is 'Actual friendly A7 duel once paired, null if that duel is deleted.';
comment on column public.festival_queue.created_at is 'Database entry time used with id for deterministic FIFO order.';
