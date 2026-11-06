"""Disposable PostgreSQL for the follow-up migration; never uses a configured database.

Run from backend with CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]'
--with pglast pytest -q server/tests/followups_sql. Extra tools stay in uv's cache.
"""

import os
from pathlib import Path

import pytest

MIGRATIONS = Path(__file__).resolve().parents[4] / "supabase" / "migrations"
FOLLOWUPS = MIGRATIONS / "20261106140000_followups.sql"


@pytest.fixture(scope="session")
def scratch_server(tmp_path_factory):
    if os.environ.get("CASE_PG_SCRATCH") != "1":
        pytest.skip("Set CASE_PG_SCRATCH=1 with the test-only PostgreSQL tools to run SQL checks.")
    import pglast
    import pgserver
    import psycopg

    # Only this new, local server supplies the connection string. Never read a database URL.
    pgdata = tmp_path_factory.mktemp("followups-postgres") / "data"
    with pgserver.get_server(pgdata, cleanup_mode="delete") as server:
        with psycopg.connect(server.get_uri(), autocommit=True) as connection:
            connection.execute(
                "create role anon; create role authenticated; create role service_role bypassrls;"
            )
            connection.execute("create schema auth; create table auth.users (id uuid primary key);")
            connection.execute(
                "create function auth.uid() returns uuid language sql stable "
                "as $$ select null::uuid $$;"
            )
            # Prove this additive fix against group 1 without requiring future case migrations.
            for migration in sorted(MIGRATIONS.glob("202611060[0-4]0000_*.sql")):
                sql = migration.read_text()
                pglast.parse_sql(sql)
                connection.execute(sql)
            if FOLLOWUPS.exists():
                sql = FOLLOWUPS.read_text()
                pglast.parse_sql(sql)
                connection.execute(sql)
                connection.execute(sql)
        yield server
    assert not pgdata.exists(), "The disposable database must be removed after the checks."


@pytest.fixture
def database(scratch_server):
    import psycopg

    with psycopg.connect(scratch_server.get_uri()) as connection:
        yield connection
        connection.rollback()
