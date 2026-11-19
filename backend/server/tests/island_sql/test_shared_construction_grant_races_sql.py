"""Standalone construction guards serialize actual intro/demo grants and visitors.

The core legacy migration is not required. Each module has its own disposable cluster.
"""

from concurrent.futures import ThreadPoolExecutor
from queue import Queue
from threading import Event
from time import monotonic

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import ready, rpc  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    as_owner,
    as_server,
    balance,
)


def kit(connection, actor, *, demo=False, amount=200):
    as_server(connection)
    return rpc(
        connection,
        "grant_entry_kit",
        actor,
        "ending_demo" if demo else "ending_trapped",
        "none",
        False,
        "stranger",
        "saltreach_harbor",
        amount,
        1,
        "0" * 64,
    )


def worker(server, started, operation):
    with psycopg.connect(server.get_uri()) as connection:
        connection.execute("set statement_timeout='5s'")
        started.put(connection.info.backend_pid)
        return operation(connection)


def wait_for_scope(observer, pid):
    deadline, pause, state = monotonic() + 3, Event(), None
    while monotonic() < deadline:
        observer.execute("select pg_stat_clear_snapshot()")
        state = observer.execute(
            "select wait_event_type,wait_event from pg_stat_activity where pid=%s", (pid,)
        ).fetchone()
        if state == ("Lock", "advisory"):
            return
        pause.wait(0.01)
    assert state == ("Lock", "advisory")


@pytest.mark.parametrize("demo", [False, True])
@pytest.mark.parametrize("action", ["build", "upgrade"])
def test_actual_intro_or_demo_grant_blocks_visitor_before_wallet_without_core_guards(
    database, scratch_server, demo, action
):
    target, actor, _, _ = ready(database, admitted=False)
    if action == "upgrade":
        as_owner(database)
        database.execute("update public.islands set wave_best=80 where player_id=%s", (target,))
        as_server(database)
        rpc(database, "island_build", target, target, "wall_1", "wall", "seedwall1", 10)
    if demo:
        as_server(database)
        assert rpc(database, "demo_guest_admit", actor)["status"] == "admitted"
    database.commit()
    started = Queue()

    def visit(connection):
        as_server(connection)
        if action == "build":
            return rpc(
                connection, "island_build", actor, target, "wall_1", "wall", "kitvisit01", 10
            )
        return rpc(
            connection,
            "island_upgrade",
            actor,
            target,
            "wall_1",
            "kitvisit01",
            [10, 20, 40, 80, 160],
            5,
        )

    with psycopg.connect(scratch_server.get_uri()) as grant:
        assert kit(grant, actor, demo=demo)["paid"] == 200
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(worker, scratch_server, started, visit)
            wait_for_scope(database, started.get(timeout=3))
            grant.commit()
            assert future.result(timeout=5)["status"] == "done"
    as_owner(database)
    expected = 190 if action == "build" else 180
    assert balance(database, actor) == expected
    repeat = kit(database, actor, demo=demo, amount=999)
    assert repeat["paid"] == 0 and repeat["kitCoins"] == 200
    assert repeat["ending"] == ("ending_demo" if demo else "ending_trapped")
    assert balance(database, actor) == expected


@pytest.mark.parametrize("action", ["build", "upgrade"])
def test_visitor_blocks_actual_later_kit_grant_without_core_guards(
    database, scratch_server, action
):
    target, actor, _, _ = ready(database, admitted=False)
    if action == "upgrade":
        as_owner(database)
        database.execute("update public.islands set wave_best=80 where player_id=%s", (target,))
        as_server(database)
        rpc(database, "island_build", target, target, "wall_1", "wall", "seedwall1", 10)
    as_server(database)
    rpc(database, "apply_wallet_transaction", actor, 1000, "admin_adjust", "fixturefunds")
    database.commit()
    started = Queue()
    with psycopg.connect(scratch_server.get_uri()) as visitor:
        as_server(visitor)
        if action == "build":
            result = rpc(visitor, "island_build", actor, target, "wall_1", "wall", "visitkit01", 10)
        else:
            result = rpc(
                visitor,
                "island_upgrade",
                actor,
                target,
                "wall_1",
                "visitkit01",
                [10, 20, 40, 80, 160],
                5,
            )
        assert result["status"] == "done"
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(
                worker, scratch_server, started, lambda connection: kit(connection, actor)
            )
            wait_for_scope(database, started.get(timeout=3))
            visitor.commit()
            assert future.result(timeout=5)["paid"] == 200
    as_owner(database)
    assert balance(database, actor) == (1190 if action == "build" else 1180)


def test_kit_alias_is_private_and_keeps_exact_public_signature(database):
    signature = "uuid,text,text,boolean,text,text,bigint,integer,text"
    alias = f"public.grant_entry_kit_legacy_personal({signature})"
    public = f"public.grant_entry_kit({signature})"
    assert database.execute("select to_regprocedure(%s) is not null", (alias,)).fetchone() == (
        True,
    )
    for role in ("anon", "authenticated", "service_role"):
        assert database.execute(
            "select has_function_privilege(%s,%s,'execute')", (role, alias)
        ).fetchone() == (False,)
    assert database.execute(
        "select has_function_privilege('service_role',%s,'execute')", (public,)
    ).fetchone() == (True,)
    for role in ("anon", "authenticated"):
        assert database.execute(
            "select has_function_privilege(%s,%s,'execute')", (role, public)
        ).fetchone() == (False,)
