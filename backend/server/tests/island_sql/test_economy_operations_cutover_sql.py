"""Registry cutover drains financial, admission and personal writers without inversion.

Each case owns a disposable PostgreSQL cluster, including pre-registry first application.
"""

import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Event
from time import monotonic, sleep

import pytest

psycopg = pytest.importorskip("psycopg")
pgserver = pytest.importorskip("pgserver")

from server.tests.island_sql.test_island_treasury_sql import (  # noqa: E402
    keys,
    ready,
    rpc,
    spend,
)
from server.tests.island_sql.test_islands_and_waves_sql import as_owner  # noqa: E402

ROOT = Path(__file__).resolve().parents[4]
MIGRATION = ROOT / "supabase/migrations/20261118050150_island_economy_operations.sql"
STUB = ROOT / "backend/server/tests/case_sql/stub.sql"


@pytest.fixture
def cutover_server(tmp_path):
    if os.environ.get("CASE_PG_SCRATCH") != "1":
        pytest.skip("opt-in database tests")
    with pgserver.get_server(tmp_path / "data", cleanup_mode="delete") as server:
        with psycopg.connect(server.get_uri(), autocommit=True) as connection:
            connection.execute(STUB.read_text())
            for path in sorted((ROOT / "supabase/migrations").glob("*.sql")):
                if path.name < MIGRATION.name:
                    connection.execute(path.read_text())
        yield server


def migrate(server, started, *, statement=None):
    with psycopg.connect(server.get_uri(), application_name="registry-cutover-test") as connection:
        connection.execute("set deadlock_timeout='100ms';set lock_timeout='5s'")
        started.set()
        connection.execute(statement or MIGRATION.read_text())


def wait_started(started, future, server):
    assert started.wait(timeout=5)
    deadline = monotonic() + 5
    with psycopg.connect(server.get_uri(), autocommit=True) as observer:
        while monotonic() < deadline:
            if future.done():
                future.result()
                pytest.fail("Cutover did not wait for the in-flight writer.")
            waiting = observer.execute(
                "select wait_event from pg_stat_activity "
                "where application_name='registry-cutover-test'",
            ).fetchone()
            if waiting and waiting[0] in ("PgSleep", "advisory"):
                return
            sleep(0.01)
    pytest.fail("Cutover did not reach its lock barrier.")


def wait_for_account_lock(server, process_id, mode):
    deadline = monotonic() + 5
    with psycopg.connect(server.get_uri(), autocommit=True) as observer:
        while monotonic() < deadline:
            waiting = observer.execute(
                "select exists(select 1 from pg_locks where pid=%s and not granted "
                "and relation='public.island_economy_accounts'::regclass and mode=%s)",
                (process_id, mode),
            ).fetchone()
            if waiting == (True,):
                return
            sleep(0.01)
    pytest.fail("Writer did not wait on the account-table relation barrier.")


def has_operation(connection, actor, uid):
    return connection.execute(
        "select count(*) from public.island_economy_operations where actor_id=%s and action_uid=%s",
        (actor, uid),
    ).fetchone() == (1,)


@pytest.mark.parametrize("reapply", [False, True])
def test_first_or_repeated_cutover_overlaps_an_existing_financial_writer(cutover_server, reapply):
    uri = cutover_server.get_uri()
    with psycopg.connect(uri) as setup:
        if reapply:
            setup.execute(MIGRATION.read_text())
        owner, actor, _, initial = ready(setup)
    with psycopg.connect(uri) as writer:
        as_owner(writer)
        rpc(writer, "island_treasury_lock_scope", owner)
        writer.execute(
            "select id from public.island_economy_accounts where id=%s for update",
            (keys(initial)[0],),
        )
        started = Event()
        with ThreadPoolExecutor(1) as pool:
            future = pool.submit(migrate, cutover_server, started)
            wait_started(started, future, cutover_server)
            assert spend(writer, actor, initial, 10, uid="cutover1")["status"] == "done"
            writer.commit()
            future.result(timeout=5)
    with psycopg.connect(uri) as check:
        assert has_operation(check, actor, "cutover1")


@pytest.mark.parametrize("reapply", [False, True])
def test_cutover_includes_a_new_account_admitted_while_its_transaction_is_open(
    cutover_server,
    reapply,
):
    uri = cutover_server.get_uri()
    with psycopg.connect(uri) as setup:
        if reapply:
            setup.execute(MIGRATION.read_text())
        owner, _, _, _ = ready(setup, admitted=False)
    with psycopg.connect(uri) as admission:
        as_owner(admission)
        result = rpc(admission, "island_treasury_admit", owner, owner, "admitnew", 200)
        assert result["status"] == "done"
        started = Event()
        with ThreadPoolExecutor(1) as pool:
            future = pool.submit(migrate, cutover_server, started)
            wait_started(started, future, cutover_server)
            admission.commit()
            future.result(timeout=5)
    with psycopg.connect(uri) as check:
        assert has_operation(check, owner, "admitnew")
        assert check.execute(
            "select balance_coins from public.island_economy_accounts where id=%s",
            (keys(result)[0],),
        ).fetchone() == (200,)


def test_reapply_does_not_invert_a_personal_null_scope_foreign_key(cutover_server):
    uri = cutover_server.get_uri()
    with psycopg.connect(uri) as setup:
        setup.execute(MIGRATION.read_text())
        _, actor, _, _ = ready(setup)
    with psycopg.connect(uri) as personal:
        personal.execute(
            "insert into public.island_economy_operations "
            "(actor_id,action_uid,is_player_intent,domain_action,fingerprint) "
            "values(%s,'personal1',true,'captain:role','{}')",
            (actor,),
        )
        started = Event()
        with ThreadPoolExecutor(1) as pool:
            future = pool.submit(migrate, cutover_server, started)
            wait_started(started, future, cutover_server)
            personal.commit()
            future.result(timeout=5)
    with psycopg.connect(uri) as check:
        assert has_operation(check, actor, "personal1")


@pytest.mark.parametrize("reapply", [False, True])
def test_new_admission_waiting_behind_cutover_uses_the_installed_guard(cutover_server, reapply):
    uri = cutover_server.get_uri()
    with psycopg.connect(uri) as setup:
        if reapply:
            setup.execute(MIGRATION.read_text())
        owner, _, _, _ = ready(setup, admitted=False)
    sql = MIGRATION.read_text()
    anchor = "create table if not exists public.island_economy_operations"
    assert sql.count(anchor) == 1
    sql = sql.replace(anchor, "select pg_advisory_xact_lock(149157991);\n" + anchor)
    with psycopg.connect(uri) as gate, psycopg.connect(uri) as admission:
        gate.execute("select pg_advisory_xact_lock(149157991)")
        started = Event()
        admission_started = Event()

        def admit():
            admission_started.set()
            result = rpc(admission, "island_treasury_admit", owner, owner, "admitnew", 200)
            admission.commit()
            return result

        with ThreadPoolExecutor(2) as pool:
            migration = pool.submit(migrate, cutover_server, started, statement=sql)
            wait_started(started, migration, cutover_server)
            entering = pool.submit(admit)
            assert admission_started.wait(timeout=5)
            wait_for_account_lock(cutover_server, admission.info.backend_pid, "RowExclusiveLock")
            gate.commit()
            migration.result(timeout=5)
            assert entering.result(timeout=5)["status"] == "done"
    with psycopg.connect(uri) as check:
        assert has_operation(check, owner, "admitnew")


@pytest.mark.parametrize("reapply", [False, True])
def test_busy_cutover_exhaustion_releases_partial_locks_without_schema_changes(
    cutover_server,
    reapply,
):
    uri = cutover_server.get_uri()
    with psycopg.connect(uri) as setup:
        if reapply:
            setup.execute(MIGRATION.read_text())
        _, actor, _, _ = ready(setup)
    with psycopg.connect(uri) as blocker:
        table = "island_economy_operations" if reapply else "island_treasury_transactions"
        blocker.execute(f"lock table public.{table} in row exclusive mode")
        with psycopg.connect(uri) as attempt, psycopg.connect(uri) as check:
            attempt.execute("set lock_timeout='2s'")
            before = check.execute(
                "select to_regclass('public.island_economy_operations')"
            ).fetchone()
            statement = MIGRATION.read_text()
            assert statement.count("interval '30 seconds'") == 1
            statement = statement.replace("interval '30 seconds'", "interval '0 seconds'")
            with pytest.raises(psycopg.errors.LockNotAvailable, match="operation_cutover_busy"):
                with attempt.transaction():
                    attempt.execute(statement)
            # The caller transaction is still open; no partial barrier may survive its savepoint.
            check.execute("set lock_timeout='1s'")
            check.execute("lock table public.island_economy_accounts in row exclusive mode")
            check.execute("lock table public.island_treasury_transactions in row exclusive mode")
            assert (
                check.execute("select to_regclass('public.island_economy_operations')").fetchone()
                == before
            )
            if reapply:
                assert not has_operation(check, actor, "absent01")
            check.rollback()
        blocker.rollback()


def test_a_personal_insert_can_finish_when_cutover_releases_a_partial_barrier(cutover_server):
    uri = cutover_server.get_uri()
    with psycopg.connect(uri) as setup:
        setup.execute(MIGRATION.read_text())
        _, actor, _, _ = ready(setup)
    with psycopg.connect(uri) as personal, psycopg.connect(uri) as blocker:
        # Hold a null-scope insert after its operation-table lock but before its FK parent lock.
        blocker.execute("lock table public.island_economy_accounts in exclusive mode")
        started_personal = Event()
        started_migration = Event()

        def insert_personal():
            started_personal.set()
            personal.execute(
                "insert into public.island_economy_operations "
                "(actor_id,action_uid,is_player_intent,domain_action,fingerprint) "
                "values(%s,'personal1',true,'captain:role','{}')",
                (actor,),
            )
            personal.commit()

        with ThreadPoolExecutor(2) as pool:
            insertion = pool.submit(insert_personal)
            assert started_personal.wait(timeout=5)
            wait_for_account_lock(cutover_server, personal.info.backend_pid, "RowShareLock")
            migration = pool.submit(migrate, cutover_server, started_migration)
            assert started_migration.wait(timeout=5)
            blocker.commit()
            insertion.result(timeout=5)
            migration.result(timeout=5)


@pytest.mark.parametrize("isolation", ["repeatable read", "serializable", "read uncommitted"])
def test_cutover_refuses_an_unsupported_snapshot_before_ddl(cutover_server, isolation):
    uri = cutover_server.get_uri()
    with psycopg.connect(uri) as setup:
        owner, _, _, _ = ready(setup, admitted=False)
    with psycopg.connect(uri) as admission, psycopg.connect(uri) as attempt:
        assert (
            rpc(admission, "island_treasury_admit", owner, owner, "admitnew", 200)["status"]
            == "done"
        )
        attempt.execute(f"set transaction isolation level {isolation}")
        sql = MIGRATION.read_text().replace("interval '30 seconds'", "interval '0 seconds'")
        with pytest.raises(psycopg.errors.InvalidTransactionState, match="requires_read_committed"):
            with attempt.transaction():
                attempt.execute(sql)
        assert attempt.execute("show transaction_isolation").fetchone() == (isolation,)
        assert attempt.execute(
            "select to_regclass('public.island_economy_operations')"
        ).fetchone() == (None,)
        attempt.rollback()
        admission.commit()
    with psycopg.connect(uri) as retry:
        retry.execute(MIGRATION.read_text())
        assert has_operation(retry, owner, "admitnew")
