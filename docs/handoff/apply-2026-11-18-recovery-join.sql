-- Production apply for migration 20261118010000_recovery_current_for_joiners.sql (fix/recovery-join).
-- Idempotent: create or replace + revoke/grant/comment, and the history row with on conflict do nothing.
-- Apply AFTER the backend/frontend deploy of fix/recovery-join (old server code turns the new
-- not-joined answer into 502 instead of 403; both fail, nothing private is exposed either way).
-- The body between the markers is byte-identical to the migration file.
begin;

-- >>> migration body
-- Recovery waves: a member who has not joined yet can discover the running protocol-2 wave.
-- 20261117040000 refused every non-participant with not_in_wave, so /api/waves/current answered
-- 403 and a teammate never learnt the waveId that recovery_wave_join needs. The island owner and
-- active members (the same gate as recovery_wave_join) now get the public wave row with
-- recoveryVersion 1, waveProtocol 2 and joined false. They get no initialSnapshot (it lists the
-- participants' tokens), no participantToken and no lastActorCounter; the join reply carries all
-- three. Outsiders are still refused not_in_wave; participants' answers are unchanged plus
-- joined true. Same signature, grants and owner as before; legacy and protocol-1 paths unchanged.
create or replace function public.recovery_wave_current(
  p_player_id uuid, p_place text, p_island_owner uuid, p_protocol smallint
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_reply jsonb;
  v_wave_id uuid;
  v_wave public.recovery_wave_states;
  v_part public.recovery_wave_participants;
begin
  if p_player_id is null or p_place is null or p_place not in ('island','pirate_point')
     or (p_place='island') <> (p_island_owner is not null)
     or p_protocol is null or p_protocol not in (1,2) then
    raise exception 'bad_recovery_current';
  end if;
  v_reply := public.wave_current(p_place,p_island_owner);
  if v_reply is null then return jsonb_build_object('status','empty'); end if;
  v_wave_id := (v_reply ->> 'waveId')::uuid;
  select * into v_wave from public.recovery_wave_states where wave_id=v_wave_id;
  if not found then return v_reply || jsonb_build_object('recoveryVersion',0,'waveProtocol',1); end if;
  if p_protocol < v_wave.wave_protocol then
    return jsonb_build_object('status','refused','reason','client_update_required');
  end if;
  if not exists (select 1 from public.recovery_wave_participants
                  where wave_id=v_wave_id and player_id=p_player_id) then
    if p_player_id <> v_wave.island_owner and not exists (
      select 1 from public.island_members where island_owner=v_wave.island_owner
        and player_id=p_player_id and left_at is null
    ) then
      return jsonb_build_object('status','refused','reason','not_in_wave');
    end if;
    return v_reply || jsonb_build_object('recoveryVersion',1,'waveProtocol',2,'joined',false);
  end if;
  select * into v_part from public.recovery_wave_participants
   where wave_id=v_wave_id and player_id=p_player_id;
  return v_reply || jsonb_build_object('recoveryVersion',1,'waveProtocol',2,
    'initialSnapshot',v_wave.initial_snapshot,
    'participantToken',case when found then v_part.participant_token end,
    'lastActorCounter',case when found then v_part.last_actor_counter end,
    'joined',true);
end;
$$;

revoke all on function public.recovery_wave_current(uuid,text,uuid,smallint) from public, anon, authenticated, service_role;
grant execute on function public.recovery_wave_current(uuid,text,uuid,smallint) to service_role;
comment on function public.recovery_wave_current(uuid,text,uuid,smallint) is
  'Reads the current wave. A participant gets the frozen versioned snapshot and only their own token/counter (joined true); the island owner or an active member who has not joined gets the public wave row with recoveryVersion 1, waveProtocol 2 and joined false, without snapshot, token or counter; anyone else is refused not_in_wave. No account identifiers enter the returned snapshot or journal.';
-- <<< migration body

insert into supabase_migrations.schema_migrations (version, name)
values ('20261118010000', 'recovery_current_for_joiners')
on conflict (version) do nothing;

commit;
