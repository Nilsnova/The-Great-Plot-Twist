"""Committed legacy writers compose with actual deletion on disposable PostgreSQL.

The real authority migration and admission are used. Local Auth records are fixture
identities, not provider-issued sessions. Lock assertions observe PostgreSQL wait
graphs; the cluster is removed by the existing scratch fixture after the session.
"""

from concurrent.futures import ThreadPoolExecutor
from queue import Queue
from threading import Event
from time import monotonic
from uuid import uuid4

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import rpc  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    add_players,
    as_owner,
    as_server,
    open_island,
)
from server.tests.island_sql.test_shared_lifecycle_transactions_sql import (  # noqa: E402
    delete,
    prepare,
)


def worker(server, started, operation):
    with psycopg.connect(server.get_uri()) as connection:
        connection.execute("set statement_timeout='12s'")
        started.put(connection.info.backend_pid)
        return operation(connection)


def wait_for_block(observer, waiting, blocker, event=None):
    deadline, pause, state = monotonic() + 5, Event(), None
    while monotonic() < deadline:
        observer.execute("select pg_stat_clear_snapshot()")
        state = observer.execute(
            "select %s=any(pg_blocking_pids(pid)),wait_event_type,wait_event "
            "from pg_stat_activity where pid=%s",
            (blocker, waiting),
        ).fetchone()
        if state and state[0] and state[1] == "Lock" and (event is None or state[2] == event):
            return
        pause.wait(0.01)
    pytest.fail(f"Expected backend {waiting} to wait for {blocker}/{event}; observed {state}.")


def profile_is_unlocked(observer, actor, *, key_share_writer=False):
    # NO KEY UPDATE is compatible with the legacy writer's KEY SHARE, but
    # conflicts with any personal/profile lock taken by deletion prematurely.
    strength = "no key update" if key_share_writer else "update"
    with observer.transaction():
        observer.execute(
            f"select 1 from public.profiles where id=%s for {strength} nowait", (actor,)
        )


def add_legacy_stock(connection, actor, *, lower_than=None, held=True):
    as_owner(connection)
    for _ in range(100):
        owner = uuid4()
        if lower_than is None or connection.execute(
            "select hashtextextended('island-economy:'||%s,0) < "
            "(select min(hashtextextended('island-economy:'||p::text,0)) "
            "from unnest(%s::uuid[]) p)",
            (str(owner), lower_than),
        ).fetchone()[0]:
            break
    else:
        pytest.fail("Could not allocate an earlier signed scope key for the retry check.")
    add_players(connection, owner)
    alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # pragma: allowlist secret
    code = "".join(alphabet[(owner.int >> (5 * i)) % len(alphabet)] for i in range(5))
    open_island(connection, owner, code)
    as_server(connection)
    assert rpc(connection, "game_join", actor, owner, 10)["status"] == "joined"
    as_owner(connection)
    copy = connection.execute(
        "insert into public.arsenal_copies(island_owner,copy_no,weapon,holder,bought_by,source) "
        "values(%s,1,'pistols',%s,%s,'bought') returning id",
        (owner, actor if held else None, owner),
    ).fetchone()[0]
    return owner, copy


def test_legacy_copy_return_finishes_before_shared_related_deletion_takes_profile(scratch_server):
    started = Queue()
    with (
        psycopg.connect(scratch_server.get_uri()) as seed,
        psycopg.connect(scratch_server.get_uri()) as gate,
        psycopg.connect(scratch_server.get_uri(), autocommit=True) as observer,
        ThreadPoolExecutor(max_workers=2) as pool,
    ):
        _, actor, _, _, _ = prepare(seed)
        legacy_owner, copy = add_legacy_stock(seed, actor)
        seed.commit()
        gate.execute("select 1 from public.arsenal_copies where id=%s for update", (copy,))

        def return_copy(connection):
            as_server(connection)
            return rpc(connection, "arsenal_return", actor, legacy_owner, "return0001")

        try:
            returning = pool.submit(worker, scratch_server, started, return_copy)
            returning_pid = started.get(timeout=5)
            wait_for_block(observer, returning_pid, gate.info.backend_pid)
            deleting = pool.submit(worker, scratch_server, started, lambda c: delete(c, actor))
            deleting_pid = started.get(timeout=5)
            wait_for_block(observer, deleting_pid, returning_pid, "advisory")
            profile_is_unlocked(observer, actor)
        finally:
            gate.rollback()
        assert returning.result(timeout=12)["status"] == "done"
        assert deleting.result(timeout=12) == {"status": "deleted"}
        assert observer.execute(
            "select holder from public.arsenal_copies where id=%s", (copy,)
        ).fetchone() == (None,)
        assert observer.execute(
            "select count(*) from public.islands where player_id=%s", (legacy_owner,)
        ).fetchone() == (1,)


def test_accepted_legacy_wallet_writer_commits_before_deleted_profile_upgrade(scratch_server):
    started = Queue()
    with (
        psycopg.connect(scratch_server.get_uri()) as writer,
        psycopg.connect(scratch_server.get_uri(), autocommit=True) as observer,
        ThreadPoolExecutor(max_workers=1) as pool,
    ):
        _, actor, _, _, _ = prepare(writer)
        writer.commit()
        as_server(writer)
        assert (
            rpc(writer, "apply_wallet_transaction", actor, 17, "admin_adjust", "legacyrace01") == 17
        )
        try:
            deleting = pool.submit(worker, scratch_server, started, lambda c: delete(c, actor))
            wait_for_block(observer, started.get(timeout=5), writer.info.backend_pid)
            profile_is_unlocked(observer, actor, key_share_writer=True)
        finally:
            writer.commit()
        assert deleting.result(timeout=12) == {"status": "deleted"}
        assert observer.execute(
            "select count(*) from auth.users where id=%s", (actor,)
        ).fetchone() == (0,)


def test_new_earlier_stock_scope_retries_whole_batch_before_domain_effects(scratch_server):
    started = Queue()
    with (
        psycopg.connect(scratch_server.get_uri()) as writer,
        psycopg.connect(scratch_server.get_uri(), autocommit=True) as observer,
        ThreadPoolExecutor(max_workers=1) as pool,
    ):
        _, actor, _, _, _ = prepare(writer)
        as_owner(writer)
        initial_owners = rpc(writer, "island_lifecycle_actor_owners", actor)
        initial_guards = rpc(writer, "island_lifecycle_guard_actors", actor, initial_owners)
        legacy_owner, copy = add_legacy_stock(writer, actor, held=False, lower_than=initial_guards)
        writer.commit()
        # This session-level scope survives the writer commit. After discovering
        # the newly held copy, deletion must release its old profile locks and
        # reacquire the complete batch, waiting on this earlier key first.
        writer.execute(
            "select pg_advisory_lock(hashtextextended('island-economy:'||%s,0))",
            (str(legacy_owner),),
        )
        writer.execute("select 1 from public.profiles where id=%s for key share", (actor,))
        try:
            deleting = pool.submit(worker, scratch_server, started, lambda c: delete(c, actor))
            deleting_pid = started.get(timeout=5)
            wait_for_block(observer, deleting_pid, writer.info.backend_pid, "transactionid")
            as_server(writer)
            assert rpc(writer, "arsenal_take", actor, legacy_owner, copy, "take-newscope01")[
                "status"
            ] == "done"
            writer.commit()
            wait_for_block(observer, deleting_pid, writer.info.backend_pid, "advisory")
            profile_is_unlocked(observer, actor)
            assert observer.execute(
                "select count(*) from public.island_deleted_player_dispositions where player_id=%s",
                (actor,),
            ).fetchone() == (0,)
        finally:
            writer.rollback()
            writer.execute("select pg_advisory_unlock_all()")
            writer.commit()
        assert deleting.result(timeout=12) == {"status": "deleted"}
        # Original legacy purge semantics apply after the new scope was guarded.
        assert observer.execute(
            "select count(*) from public.arsenal_copies where id=%s", (copy,)
        ).fetchone() == (0,)
