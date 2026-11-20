-- Fresh private-channel authorization for persisted shared islands (#501).
-- Realtime caches existing connections: admission/leave revocation still needs
-- canonical lifecycle integration. This migration does not evict subscribers.

-- Internal policy schema: never add it to the exposed PostgREST API schemas.
-- No table grants or caller-selected actor are needed by the browser role.
create schema if not exists island_realtime_private;
comment on schema island_realtime_private is
  'Internal Realtime RLS predicates. Must remain outside exposed API schemas; no domain or authority API.';
revoke all on schema island_realtime_private from public, anon, authenticated, service_role;
grant usage on schema island_realtime_private to authenticated;

create or replace function island_realtime_private.may_access_place_topic(p_topic text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_place text;
  v_owner uuid;
  v_shared boolean;
begin
  if v_actor is null or p_topic is null
    or p_topic !~ '^live:place:[a-z][a-z0-9_]{1,39}:[1-9][0-9]?$' then
    return false;
  end if;
  v_place := split_part(p_topic, ':', 3);
  if v_place <> 'isle' and left(v_place, 5) <> 'isle_' then return true; end if;
  if v_place !~ '^isle_[abcdefghjkmnpqrstuvwxyz23456789]{5}$' then return false; end if;

  select i.player_id, s.island_owner is not null into v_owner, v_shared
    from public.islands i
    left join public.island_economy_state s on s.island_owner = i.player_id
    where i.code = upper(substring(v_place from 6));
  if not found then return false; end if;
  -- Successful known-island absence alone preserves explicit legacy behavior.
  -- Any persisted state remains private, including paused admission.
  if not v_shared then return true; end if;
  return v_actor = v_owner or exists (
    select 1 from public.island_members m
      where m.island_owner = v_owner and m.player_id = v_actor and m.left_at is null
  );
end;
$$;
comment on function island_realtime_private.may_access_place_topic(text) is
  'Caller-auth.uid-only fresh place-channel predicate. Known legacy rooms retain access; persisted shared islands require owner or active membership. No effects or cached-channel eviction.';
revoke all on function island_realtime_private.may_access_place_topic(text)
  from public, anon, authenticated, service_role;
grant execute on function island_realtime_private.may_access_place_topic(text) to authenticated;

-- Tighten both existing permissive policies; an extra permissive policy would OR
-- with their broad legacy conditions and leave the original bypass intact.
drop policy if exists "Live: players can watch a place room" on realtime.messages;
create policy "Live: players can watch a place room"
  on realtime.messages for select to authenticated
  using (
    (not (select public.jwt_is_anonymous()) or (select public.is_admitted_guest()))
    and (select realtime.topic()) ~ '^live:place:[a-z][a-z0-9_]{1,39}:[1-9][0-9]?$'
    and realtime.messages.extension = 'broadcast'
    and (select island_realtime_private.may_access_place_topic((select realtime.topic())))
  );
comment on policy "Live: players can watch a place room" on realtime.messages is
  'Fresh Broadcast receive authorization retains class admission and known legacy places; persisted shared island rooms require the caller to own or actively belong to the island. Existing Realtime connections are cached.';

drop policy if exists "Live: players can move in a place room" on realtime.messages;
create policy "Live: players can move in a place room"
  on realtime.messages for insert to authenticated
  with check (
    (not (select public.jwt_is_anonymous()) or (select public.is_admitted_guest()))
    and (select realtime.topic()) ~ '^live:place:[a-z][a-z0-9_]{1,39}:[1-9][0-9]?$'
    and realtime.messages.extension = 'broadcast'
    and (select island_realtime_private.may_access_place_topic((select realtime.topic())))
  );
comment on policy "Live: players can move in a place room" on realtime.messages is
  'Fresh Broadcast send authorization retains class admission and known legacy places; persisted shared island rooms require the caller to own or actively belong to the island. Broadcasts grant no game-effect authority.';
