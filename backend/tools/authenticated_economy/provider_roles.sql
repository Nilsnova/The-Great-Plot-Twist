-- Minimal provider roles on official PostgreSQL; Auth/Realtime create their real tables.
-- Used only by the isolated acceptance installer before starting those services.
do $$
begin
  if not exists (select 1 from pg_roles where rolname='anon') then
    create role anon nologin noinherit;
    create role authenticated nologin noinherit;
    create role service_role nologin noinherit bypassrls;
    create role authenticator login noinherit;
    create role supabase_auth_admin login noinherit;
    create role supabase_admin login superuser;
  end if;
end $$;
-- The real Realtime tenant migrations grant dashboard inspection privileges.
do $$
begin
  if not exists (select 1 from pg_roles where rolname='dashboard_user') then
    create role dashboard_user nologin noinherit;
  end if;
end $$;
grant anon,authenticated,service_role to authenticator;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create schema if not exists auth authorization supabase_auth_admin;
grant usage on schema auth to anon,authenticated,service_role;
alter role supabase_auth_admin set search_path=auth,public,extensions;
alter role supabase_admin set search_path=public,extensions;
create schema if not exists _realtime authorization supabase_admin;
create schema if not exists realtime authorization supabase_admin;

-- These standard JWT claim helpers read only claims set by the real PostgREST role switch.
-- They grant no identity in the absence of a verified request token.
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid;
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role');
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb);
$$;
grant execute on function auth.uid(),auth.role(),auth.jwt() to anon,authenticated,service_role;
alter function auth.uid() owner to supabase_auth_admin;
alter function auth.role() owner to supabase_auth_admin;
alter function auth.jwt() owner to supabase_auth_admin;
