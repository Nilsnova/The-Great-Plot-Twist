-- Minimal durable deletion fencing for cached authenticated identities.
-- The encompassing delete transaction records this fact before deleting Auth.
create table if not exists public.island_deleted_player_dispositions (
  player_id uuid primary key,
  deleted_at timestamptz not null default clock_timestamp()
);
comment on table public.island_deleted_player_dispositions is
  'Minimal deleted-player UUID/time needed to fence cached identities. No Auth/profile FK, login details or retained private profile. Only complete lifecycle deletion inserts this fact in the same commit as Auth deletion.';
comment on column public.island_deleted_player_dispositions.player_id is
  'Original deleted UUID, retained only for revocation and saved-origin disposition.';
comment on column public.island_deleted_player_dispositions.deleted_at is
  'Database deletion-disposition time from the encompassing atomic transaction.';
alter table public.island_deleted_player_dispositions enable row level security;
revoke all on table public.island_deleted_player_dispositions
  from public, anon, authenticated, service_role;
grant select on table public.island_deleted_player_dispositions to service_role;

-- The completed revocation fact cannot be silently cleared or rewritten.
create or replace function public.island_deleted_player_disposition_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'deletion_disposition_immutable';
end;
$$;
comment on function public.island_deleted_player_disposition_immutable() is
  'Reject mutation/removal of a committed deletion fence.';
create or replace trigger island_deleted_player_dispositions_immutable
  before update or delete on public.island_deleted_player_dispositions
  for each row execute function public.island_deleted_player_disposition_immutable();

-- Reads never import a Captain, initialize state or establish membership.
create or replace function public.island_lifecycle_actor_status(p_player_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('status', case
    when p_player_id is null
      or exists(select 1 from public.island_deleted_player_dispositions
        where player_id = p_player_id)
      or not exists(select 1 from auth.users where id = p_player_id)
    then 'deleted' else 'active' end);
$$;
comment on function public.island_lifecycle_actor_status(uuid) is
  'Service-only cross-worker cached-identity fence. Missing Auth or explicit deletion is inactive; a positive result grants no game authority.';
revoke all on function public.island_deleted_player_disposition_immutable()
  from public, anon, authenticated, service_role;
revoke all on function public.island_lifecycle_actor_status(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.island_lifecycle_actor_status(uuid) to service_role;
