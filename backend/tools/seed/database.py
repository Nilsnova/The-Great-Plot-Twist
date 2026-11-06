"""Local connection guard and Supabase stand-ins for disposable Postgres only."""

import os
from pathlib import Path

import psycopg
from psycopg.conninfo import conninfo_to_dict

ROOT = Path(__file__).resolve().parents[3]
MARKER = "the-great-plot-twist-g22-scratch-v1"


def local_parameters(database_url: str, *, scratch: bool) -> dict[str, str]:
    """Validate BEFORE connecting, including libpq URI query overrides.

    No implicit host, service file, DNS name, multi-host list, hostaddr override,
    password file or libpq environment fallback may select another server.
    """
    if not scratch:
        raise ValueError("Refusing database access without explicit --scratch.")
    try:
        params = conninfo_to_dict(database_url)
    except psycopg.Error as error:
        raise ValueError("Use an explicit local Postgres URL or conninfo string.") from error
    if set(params) - {"host", "port", "dbname", "user"}:
        raise ValueError("Only host, port, dbname and user are allowed for scratch connections.")
    host = params.get("host", "")
    if host not in {"localhost", "127.0.0.1", "::1"} and not (
        host.startswith("/") and "," not in host and "\x00" not in host
    ):
        raise ValueError("Refusing database access: use a Unix socket or literal localhost.")
    if not params.get("dbname") or not params.get("user"):
        raise ValueError("The scratch connection must explicitly name its database and user.")
    port = params.get("port", "5432")
    if not port.isdigit() or not 1 <= int(port) <= 65535:
        raise ValueError("The scratch port must be a single number between 1 and 65535.")
    params["port"] = port
    # Pin localhost to loopback and override inherited libpq defaults explicitly.
    params.update(
        hostaddr="" if host.startswith("/") else ("::1" if host == "::1" else "127.0.0.1"),
        # pgserver uses local trust auth. A public dummy prevents reading ~/.pgpass.
        password="local-scratch-only",
        passfile=os.devnull,
        options="",
        connect_timeout="5",
    )
    return params


def connect(database_url: str, *, scratch: bool) -> psycopg.Connection:
    """Connect locally with all destination selectors checked first."""
    params = local_parameters(database_url, scratch=scratch)
    if any(key.startswith("PG") and value for key, value in os.environ.items()):
        raise ValueError("Unset libpq PG* environment variables before using scratch tools.")
    return psycopg.connect(**params)


def require_marker(conn: psycopg.Connection) -> None:
    """A local database alone is insufficient: it must be our scratch database."""
    exists = conn.execute("select to_regclass('dev_scratch.identity')").fetchone()[0]
    if exists is None:
        raise ValueError("Not a G22 scratch database: scratch identity is missing.")
    row = conn.execute("select marker from dev_scratch.identity").fetchall()
    if row != [(MARKER,)]:
        raise ValueError("Not a G22 scratch database: scratch identity does not match.")


def bootstrap(conn: psycopg.Connection) -> None:
    """Apply the case_sql-style auth stub only to a new or marked scratch DB."""
    marked = conn.execute("select to_regclass('dev_scratch.identity')").fetchone()[0]
    if marked is not None:
        require_marker(conn)
        return
    occupied = conn.execute(
        "select count(*) from information_schema.tables where table_schema in ('public', 'auth')"
    ).fetchone()[0]
    if occupied:
        raise ValueError("Refusing to bootstrap a database containing application tables.")
    conn.execute("create schema dev_scratch")
    conn.execute("create table dev_scratch.identity (marker text primary key)")
    conn.execute("insert into dev_scratch.identity values (%s)", (MARKER,))
    # These are the stand-ins documented in specs/M1-backbone.md, section 7.
    conn.execute("""
        do $$ begin
          if not exists (select from pg_roles where rolname = 'anon') then
            create role anon nologin;
          end if;
          if not exists (select from pg_roles where rolname = 'authenticated') then
            create role authenticated nologin;
          end if;
          if not exists (select from pg_roles where rolname = 'service_role') then
            create role service_role nologin bypassrls;
          end if;
        end $$;
        create schema auth;
        create table auth.users (id uuid primary key, email text);
        create function auth.uid() returns uuid language sql stable as $$
          select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
        $$;
        grant usage on schema auth, public to anon, authenticated, service_role;
        grant execute on function auth.uid() to anon, authenticated, service_role;
    """)


def apply_migrations(conn: psycopg.Connection) -> list[str]:
    """The launcher and migration test both execute this exact chain, in name order."""
    require_marker(conn)
    paths = sorted((ROOT / "supabase/migrations").glob("*.sql"))
    if not paths:
        raise RuntimeError("No migrations found.")
    for path in paths:
        conn.execute(path.read_text(encoding="utf-8"))
    return [path.name for path in paths]
