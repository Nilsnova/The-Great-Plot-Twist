"""Reset receipt DDL drains old writers without partial-lock deadlocks.

Uses the disposable full-chain fixture; no external database or migration tool is run.
"""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from time import monotonic, sleep

import pytest

psycopg = pytest.importorskip("psycopg")
from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import keys, ready, spend  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import as_owner  # noqa: E402

MIGRATION = Path(__file__).resolve().parents[4] / (
    "supabase/migrations/20261118051600_island_economy_reset.sql"
)


def wait_until_sleeping(server, pid):
    deadline = monotonic() + 5
    with psycopg.connect(server.get_uri(), autocommit=True) as observer:
        while monotonic() < deadline:
            state = observer.execute(
                "select wait_event from pg_stat_activity where pid=%s", (pid,)
            ).fetchone()
            if state and state[0] == "PgSleep":
                return
            sleep(0.01)
    raise AssertionError("The bounded cutover retry was not observed.")


@pytest.mark.parametrize("reapply", [False, True])
def test_reset_ddl_waits_without_blocking_the_writer_it_needs_to_drain(
    database, scratch_server, reapply
):
    owner, _, _, treasury = ready(database, 100)
    as_owner(database)
    if not reapply:
        database.execute("drop table public.island_economy_reset_receipts")
    database.commit()
    with psycopg.connect(scratch_server.get_uri()) as writer:
        writer.execute("select public.island_treasury_lock_scope(%s)", (owner,))
        writer.execute(
            "select id from public.island_economy_accounts where id=%s for update",
            (keys(treasury)[0],),
        )
        with psycopg.connect(scratch_server.get_uri()) as migration:
            pid = migration.info.backend_pid
            with ThreadPoolExecutor(1) as pool:
                future = pool.submit(migration.execute, MIGRATION.read_text())
                wait_until_sleeping(scratch_server, pid)
                writer.execute("set local statement_timeout='2s'")
                assert spend(writer, owner, treasury, 1)["status"] == "done"
                writer.commit()
                future.result(timeout=10)
                migration.commit()


def test_busy_cutover_releases_earlier_relation_locks_before_refusing(database, scratch_server):
    owner, _, _, treasury = ready(database, 100)
    database.commit()
    with psycopg.connect(scratch_server.get_uri()) as blocker:
        blocker.execute("lock table public.island_economy_reset_receipts in access share mode")
        with psycopg.connect(scratch_server.get_uri()) as migration:
            with pytest.raises(psycopg.errors.LockNotAvailable, match="reset_migration_busy"):
                with migration.transaction():
                    migration.execute(
                        MIGRATION.read_text().replace(
                            "interval '30 seconds'", "interval '0 seconds'"
                        )
                    )
            with psycopg.connect(scratch_server.get_uri()) as writer:
                writer.execute("set local statement_timeout='2s'")
                assert spend(writer, owner, treasury, 1)["status"] == "done"


def test_partial_barriers_release_while_an_existing_receipt_reader_is_active(
    database, scratch_server
):
    owner, _, _, treasury = ready(database, 100)
    database.commit()
    with psycopg.connect(scratch_server.get_uri()) as reader:
        reader.execute("lock table public.island_economy_reset_receipts in access share mode")
        with psycopg.connect(scratch_server.get_uri()) as migration:
            pid = migration.info.backend_pid
            with ThreadPoolExecutor(1) as pool:
                future = pool.submit(migration.execute, MIGRATION.read_text())
                wait_until_sleeping(scratch_server, pid)
                with psycopg.connect(scratch_server.get_uri()) as writer:
                    writer.execute("set local statement_timeout='2s'")
                    assert spend(writer, owner, treasury, 1)["status"] == "done"
                    writer.commit()
                reader.commit()
                future.result(timeout=10)
                migration.commit()


@pytest.mark.parametrize("isolation", ["repeatable read", "serializable"])
def test_reset_migration_rejects_unsupported_snapshot_before_schema_work(database, isolation):
    database.rollback()
    database.execute(f"set transaction isolation level {isolation}")
    with pytest.raises(psycopg.errors.InvalidTransactionState, match="requires_read_committed"):
        with database.transaction():
            database.execute(MIGRATION.read_text())
