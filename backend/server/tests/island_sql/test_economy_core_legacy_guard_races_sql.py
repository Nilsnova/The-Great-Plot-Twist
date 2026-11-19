"""Real connections prove ordering between legacy entries, grants and adoption.

Used by: core/MP-ECO-04 reviewers; all data is synthetic on a private disposable server.
"""

from concurrent.futures import ThreadPoolExecutor
from queue import Queue
from threading import Barrier, Event
from time import monotonic

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.island_sql.test_economy_core_legacy_guards_sql import (  # noqa: E402
    build_home,
    code_for,
    initialize,
    kit,
    legacy_member_home,
)
from server.tests.island_sql.test_island_treasury_sql import keys, ready, rpc  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    as_owner,
    as_server,
    balance,
)


def worker(server, started, operation):
    with psycopg.connect(server.get_uri()) as connection:
        connection.execute("set statement_timeout='5s'")
        started.put(connection.execute("select pg_backend_pid()").fetchone()[0])
        return operation(connection)


def wait_for_lock(observer, pid, expected):
    """Observe an actual waiting backend; do not infer lock entry from a timed future."""
    deadline, pause, observed = monotonic() + 3, Event(), None
    while monotonic() < deadline:
        observer.execute("select pg_stat_clear_snapshot()")
        observed = observer.execute(
            "select wait_event_type,wait_event from pg_stat_activity where pid=%s", (pid,)
        ).fetchone()
        if observed == ("Lock", expected):
            return
        pause.wait(0.01)
    assert observed == ("Lock", expected)


@pytest.mark.parametrize("entry", ["build", "open"])
def test_admission_wins_before_a_waiting_old_own_entry(database, scratch_server, entry):
    owner, _, _, _ = ready(database, admitted=False)
    before = balance(database, owner)
    database.commit()
    started = Queue()

    def old_entry(connection):
        as_server(connection)
        return (
            build_home(connection, owner)
            if entry == "build"
            else rpc(connection, "island_open", owner, code_for(owner), 200)
        )

    with psycopg.connect(scratch_server.get_uri()) as admission:
        as_server(admission)
        assert (
            rpc(admission, "island_treasury_admit", owner, owner, "raceadmit01", 200)["status"]
            == "done"
        )
        with ThreadPoolExecutor(max_workers=1) as pool:
            result = pool.submit(worker, scratch_server, started, old_entry)
            wait_for_lock(database, started.get(timeout=3), "advisory")
            admission.commit()
            assert result.result(timeout=5)["reason"] == "economy_context_required"
    as_owner(database)
    assert balance(database, owner) == before
    assert database.execute(
        "select count(*) from public.islet_buildings where player_id=%s", (owner,)
    ).fetchone() == (0,)


def test_a_legacy_build_that_wins_the_scope_finishes_before_admission(database, scratch_server):
    owner, _, _, _ = ready(database, admitted=False)
    database.commit()
    started = Queue()

    def adopt(connection):
        as_server(connection)
        return rpc(connection, "island_treasury_admit", owner, owner, "raceadmit02", 200)

    with psycopg.connect(scratch_server.get_uri()) as builder:
        assert build_home(builder, owner)["status"] == "done"
        with ThreadPoolExecutor(max_workers=1) as pool:
            result = pool.submit(worker, scratch_server, started, adopt)
            wait_for_lock(database, started.get(timeout=3), "advisory")
            builder.commit()
            assert result.result(timeout=5)["status"] == "done"
    as_owner(database)
    assert balance(database, owner) == 90
    assert database.execute(
        "select count(*) from public.islet_buildings where player_id=%s", (owner,)
    ).fetchone() == (1,)


@pytest.mark.parametrize("entry", ["captain", "build", "open"])
def test_personal_adoption_wins_before_an_old_profile_or_grant_path(
    database, scratch_server, entry
):
    owner, actor, treasury = legacy_member_home(database)
    as_server(database)
    rpc(database, "apply_wallet_transaction", actor, 1000, "admin_adjust", "racefunds01")
    database.commit()
    started = Queue()

    def old_entry(connection):
        as_server(connection)
        choices = {
            "captain": lambda: rpc(
                connection, "island_captain", actor, "racecapt01", [0, 20, 40, 80, 160], 5
            ),
            "build": lambda: build_home(connection, actor),
            "open": lambda: rpc(connection, "island_open", actor, code_for(actor), 200),
        }
        return choices[entry]()

    with psycopg.connect(scratch_server.get_uri()) as adoption:
        assert initialize(adoption, actor, owner, treasury)["captain"]["level"] == 4
        with ThreadPoolExecutor(max_workers=1) as pool:
            result = pool.submit(worker, scratch_server, started, old_entry)
            wait_for_lock(database, started.get(timeout=3), "transactionid")
            adoption.commit()
            outcome = result.result(timeout=5)
    as_owner(database)
    assert balance(database, actor) == 1000
    assert outcome.get("reason") == "captain_context_required" or outcome == {
        "status": "open",
        "code": code_for(actor),
        "waveBest": 0,
        "flags": 0,
        "created": False,
        "paid": 0,
    }


@pytest.mark.parametrize("demo", [False, True])
def test_actual_kit_or_demo_grant_serializes_a_visiting_build_before_its_wallet(
    database,
    scratch_server,
    demo,
):
    target, actor, _, _ = ready(database, admitted=False)
    as_server(database)
    if demo:
        assert rpc(database, "demo_guest_admit", actor)["status"] == "admitted"
    database.commit()
    started = Queue()

    def visiting_build(connection):
        as_server(connection)
        return rpc(connection, "island_build", actor, target, "wall_1", "wall", "visitold001", 10)

    with psycopg.connect(scratch_server.get_uri()) as grant:
        assert kit(grant, actor)["paid"] == 200
        with ThreadPoolExecutor(max_workers=1) as pool:
            result = pool.submit(worker, scratch_server, started, visiting_build)
            wait_for_lock(database, started.get(timeout=3), "advisory")
            grant.commit()
            assert result.result(timeout=5)["status"] == "done"
    as_owner(database)
    assert balance(database, actor) == 190
    assert kit(database, actor)["paid"] == 0


def test_a_visiting_build_serializes_the_actual_later_kit_grant(database, scratch_server):
    target, actor, _, _ = ready(database, admitted=False)
    as_server(database)
    rpc(database, "apply_wallet_transaction", actor, 1000, "admin_adjust", "racefunds02")
    database.commit()
    started = Queue()

    with psycopg.connect(scratch_server.get_uri()) as builder:
        as_server(builder)
        assert (
            rpc(builder, "island_build", actor, target, "wall_1", "wall", "visitold002", 10)[
                "status"
            ]
            == "done"
        )
        with ThreadPoolExecutor(max_workers=1) as pool:
            result = pool.submit(worker, scratch_server, started, lambda c: kit(c, actor))
            wait_for_lock(database, started.get(timeout=3), "advisory")
            builder.commit()
            assert result.result(timeout=5)["paid"] == 200
    as_owner(database)
    assert balance(database, actor) == 1190


def test_a_kit_grant_waiting_for_personal_adoption_keeps_its_original_reward(
    database, scratch_server
):
    owner, actor, treasury = legacy_member_home(database)
    database.commit()
    started = Queue()
    with psycopg.connect(scratch_server.get_uri()) as adoption:
        assert initialize(adoption, actor, owner, treasury)["captain"]["role"] == "engineer"
        with ThreadPoolExecutor(max_workers=1) as pool:
            result = pool.submit(worker, scratch_server, started, lambda c: kit(c, actor))
            wait_for_lock(database, started.get(timeout=3), "transactionid")
            adoption.commit()
            assert result.result(timeout=5)["paid"] == 200
    as_owner(database)
    assert balance(database, actor) == 200
    assert database.execute(
        "select role from public.personal_captain_profiles where player_id=%s", (actor,)
    ).fetchone() == ("engineer",)
    assert database.execute(
        "select balance_coins from public.island_economy_accounts where id=%s", (keys(treasury)[0],)
    ).fetchone() == (200,)


def test_opposite_visiting_builds_complete_with_both_early_scopes_sorted(database, scratch_server):
    first, second, _, _ = ready(database, admitted=False)
    as_owner(database)
    database.execute(
        "insert into public.islands(player_id,code) values(%s,%s)", (second, code_for(second))
    )
    as_server(database)
    rpc(database, "game_join", first, second, 10)
    rpc(database, "apply_wallet_transaction", second, 1000, "admin_adjust", "racefunds03")
    database.commit()
    together = Barrier(2)

    def visit(pair):
        actor, target = pair
        with psycopg.connect(scratch_server.get_uri()) as connection:
            connection.execute("set statement_timeout='5s'")
            as_server(connection)
            together.wait(timeout=3)
            return rpc(
                connection, "island_build", actor, target, "wall_1", "wall", "opposite001", 10
            )

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(visit, [(first, second), (second, first)]))
    assert [result["status"] for result in results] == ["done", "done"]
