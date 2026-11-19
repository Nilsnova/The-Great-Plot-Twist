"""Real disposable PostgreSQL guard schema and grants; no authority provider is mocked."""

from uuid import uuid4

import pytest

psycopg = pytest.importorskip("psycopg")
from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import rpc  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    add_players,
    as_owner,
    as_server,
)


def test_status_denies_missing_auth_and_persisted_deleted_actor(database):
    actor, unknown = uuid4(), uuid4()
    add_players(database, actor)
    as_server(database)
    assert rpc(database, "island_lifecycle_actor_status", actor) == {"status": "active"}
    assert rpc(database, "island_lifecycle_actor_status", unknown) == {"status": "deleted"}
    as_owner(database)
    database.execute(
        "insert into public.island_deleted_player_dispositions(player_id) values(%s)", (actor,)
    )
    as_server(database)
    assert rpc(database, "island_lifecycle_actor_status", actor) == {"status": "deleted"}


def test_deletion_guard_has_no_profile_cascade_and_no_role_write_grant(database):
    actor = uuid4()
    add_players(database, actor)
    as_owner(database)
    database.execute(
        "insert into public.island_deleted_player_dispositions(player_id) values(%s)", (actor,)
    )
    database.execute("delete from auth.users where id=%s", (actor,))
    assert database.execute(
        "select count(*) from public.island_deleted_player_dispositions where player_id=%s",
        (actor,),
    ).fetchone() == (1,)
    assert database.execute(
        "select relrowsecurity from pg_class where oid="
        "'public.island_deleted_player_dispositions'::regclass"
    ).fetchone() == (True,)
    for role in ("anon", "authenticated", "service_role"):
        assert database.execute(
            "select has_table_privilege(%s,'public.island_deleted_player_dispositions',"
            "'insert,update,delete')",
            (role,),
        ).fetchone() == (False,)
    for role in ("anon", "authenticated"):
        assert database.execute(
            "select has_function_privilege(%s,'public.island_lifecycle_actor_status(uuid)',"
            "'execute')",
            (role,),
        ).fetchone() == (False,)


def test_deletion_guard_rejects_updates(database):
    actor = uuid4()
    as_owner(database)
    database.execute(
        "insert into public.island_deleted_player_dispositions(player_id) values(%s)", (actor,)
    )
    with pytest.raises(psycopg.errors.RaiseException, match="deletion_disposition_immutable"):
        database.execute(
            "update public.island_deleted_player_dispositions set deleted_at=clock_timestamp() "
            "where player_id=%s",
            (actor,),
        )
