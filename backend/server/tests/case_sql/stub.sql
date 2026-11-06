-- Supabase stand-ins used only by the disposable local PostgreSQL tests.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;

-- A4 policy dependencies join the migration chain when that package reaches main.
create schema realtime;
create table realtime.messages (
  topic text not null,
  extension text not null,
  payload jsonb,
  event text,
  private boolean default false,
  updated_at timestamp not null default now(),
  inserted_at timestamp not null default now(),
  id uuid not null default gen_random_uuid(),
  primary key (id, inserted_at)
);
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as
  $$ select nullif(current_setting('realtime.topic', true), '')::text $$;
grant usage on schema realtime to anon, authenticated, service_role;
grant select, insert on realtime.messages to anon, authenticated, service_role;
