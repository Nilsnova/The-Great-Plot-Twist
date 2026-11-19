"""Rehearse an interleaved synthetic schema catch-up on private local PostgreSQL.

Uses repository SQL only; never reads a database URL, credentials or production data.
"""

import os
from pathlib import Path
from uuid import UUID

import pytest

psycopg = pytest.importorskip("psycopg")
from psycopg import sql  # noqa: E402

from server.tests.island_sql.test_game_rooms_sql import join  # noqa: E402
from server.tests.island_sql.test_island_fresh_start_sql import seed  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    FRIEND,
    OWNER,
    add_players,
    open_island,
)

ROOT = Path(__file__).resolve().parents[4]
MIGRATIONS = sorted((ROOT / "supabase/migrations").glob("*.sql"))
FOUNDATION_END = "20261118050150"
INTERLEAVED_LEGACY = {"20261118051000", "20261118060000", "20261118070000"}


def catalog(connection):
    """Compare definitions and effective ACLs across clusters without unstable OIDs."""
    functions = connection.execute(
        "select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),"
        "md5(pg_get_functiondef(p.oid)),pg_get_userbyid(p.proowner) "
        "from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
        "where n.nspname in ('public','island_realtime_private') order by 1,2,3"
    ).fetchall()
    privileges = connection.execute(
        "select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),"
        "case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,"
        "a.privilege_type,a.is_grantable from pg_proc p "
        "join pg_namespace n on n.oid=p.pronamespace "
        "cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a "
        "where n.nspname in ('public','island_realtime_private') order by 1,2,3,4,5,6"
    ).fetchall()
    tables = connection.execute(
        "select table_schema,table_name,column_name,data_type,is_nullable,column_default "
        "from information_schema.columns where table_schema='public' "
        "order by table_name,ordinal_position"
    ).fetchall()
    policies = connection.execute(
        "select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check "
        "from pg_policies where schemaname in ('public','realtime') order by 1,2,3"
    ).fetchall()
    table_security = connection.execute(
        "select n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity,"
        "pg_get_userbyid(c.relowner) from pg_class c "
        "join pg_namespace n on n.oid=c.relnamespace "
        "where n.nspname='public' and c.relkind in ('r','p') order by 1,2"
    ).fetchall()
    table_privileges = connection.execute(
        "select table_schema,table_name,grantee,privilege_type,is_grantable "
        "from information_schema.table_privileges where table_schema='public' "
        "order by 1,2,3,4,5"
    ).fetchall()
    triggers = connection.execute(
        "select n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid,true) "
        "from pg_trigger t join pg_class c on c.oid=t.tgrelid "
        "join pg_namespace n on n.oid=c.relnamespace "
        "where not t.tgisinternal and n.nspname='public' order by 1,2,3"
    ).fetchall()
    return {
        "functions": functions, "function_privileges": privileges, "columns": tables,
        "policies": policies, "table_security": table_security,
        "table_privileges": table_privileges, "triggers": triggers,
    }


def original_columns(connection):
    rows = connection.execute(
        "select table_name,array_agg(column_name::text order by ordinal_position) "
        "from information_schema.columns where table_schema='public' "
        "group by table_name order by table_name"
    ).fetchall()
    return dict(rows)


def saved_rows(connection, columns):
    records = {}
    for table, names in columns.items():
        query = sql.SQL(
            "select coalesce(jsonb_agg(to_jsonb(original) order by to_jsonb(original)::text),"
            "'[]'::jsonb) from (select {} from public.{}) original"
        ).format(sql.SQL(",").join(map(sql.Identifier, names)), sql.Identifier(table))
        records[table] = connection.execute(query).fetchone()[0]
    return records


def test_ordered_catchup_matches_fresh_chain_and_preserves_legacy_games(
    scratch_server, tmp_path
):
    if os.environ.get("CASE_PG_SCRATCH") != "1":
        pytest.skip("opt-in disposable PostgreSQL check")
    pgserver = pytest.importorskip("pgserver")
    directory = tmp_path / "catchup"
    with pgserver.get_server(directory, cleanup_mode="delete") as server:
        assert psycopg.conninfo.conninfo_to_dict(server.get_uri())["host"].startswith("/")
        with psycopg.connect(server.get_uri(), autocommit=True) as connection:
            connection.execute((ROOT / "backend/server/tests/case_sql/stub.sql").read_text())
            for migration in MIGRATIONS:
                version = migration.name.split("_", 1)[0]
                if version <= FOUNDATION_END or version in INTERLEAVED_LEGACY:
                    connection.execute(migration.read_text())
            newcomer = UUID(int=924)
            with connection.transaction():
                add_players(connection, OWNER, FRIEND, newcomer)
                seed(connection, OWNER, "K7Q2M", uid_tail="catchup01")
                assert join(connection, FRIEND, OWNER)["status"] == "joined"
            columns = original_columns(connection)
            before = saved_rows(connection, columns)
            assert connection.execute(
                "select to_regprocedure('public.island_lifecycle_actor_status(uuid)'),"
                "to_regprocedure('public.personal_captain_context(uuid)')"
            ).fetchone() == (None, None)

            # Replay the entire suffix, including interleaved files already installed.
            for migration in MIGRATIONS:
                if migration.name.split("_", 1)[0] > FOUNDATION_END:
                    connection.execute(migration.read_text())

            assert saved_rows(connection, columns) == before
            for table in ("island_economy_accounts", "personal_captain_profiles"):
                assert connection.execute(
                    sql.SQL("select count(*) from public.{}").format(sql.Identifier(table))
                ).fetchone() == (0,)
            with connection.transaction():
                connection.execute("set local role service_role")
                assert connection.execute(
                    "select public.island_lifecycle_actor_status(%s)", (OWNER,)
                ).fetchone()[0] == {"status": "active"}
                assert connection.execute(
                    "select public.personal_captain_context(%s)", (OWNER,)
                ).fetchone()[0] == {"status": "legacy"}
                opened = open_island(connection, newcomer, "N3WGM")
                assert opened["created"] is True and opened["paid"] == 100
                assert open_island(connection, newcomer, "N3WGM")["paid"] == 0
                assert join(connection, newcomer, OWNER)["repeat"] is False
                assert join(connection, newcomer, OWNER)["repeat"] is True
                assert join(connection, FRIEND, OWNER)["repeat"] is True
            actual = catalog(connection)
        with psycopg.connect(scratch_server.get_uri()) as fresh:
            expected = catalog(fresh)
        for category in expected:
            assert actual[category] == expected[category], category
    assert not directory.exists()
