"""Account deletion and sports money follow the same profile-before-wallet lock order.

The temporary wallet trigger only pauses the actual RPC inside disposable PostgreSQL. It does
not pre-acquire an inverted wallet lock in the caller and therefore catches the former cycle.
"""

import os
import time
from concurrent.futures import ThreadPoolExecutor

import pytest

from server.tests.sports_sql.test_sports_atomic import (
    fixture_id,
    past,
    seed,
    settle,
    settlement_arguments,
    stake,
)

pytestmark = pytest.mark.skipif(
    os.environ.get("CASE_PG_SCRATCH") != "1", reason="opt-in scratch SQL"
)
GATE = 180000


def wait_for_lock(monitor, pid):
    deadline = time.monotonic() + 4
    while time.monotonic() < deadline:
        if monitor.execute(
            "select wait_event_type from pg_stat_activity where pid = %s", (pid,)
        ).fetchone() == ("Lock",):
            return
        time.sleep(0.01)
    pytest.fail("The controlled scratch transaction did not reach its lock wait.")


def configure(connection):
    connection.execute("set local statement_timeout = '8s'")
    connection.execute("set local deadlock_timeout = '100ms'")
    connection.execute("set local role service_role")


def delete(connection, player):
    configure(connection)
    result = connection.execute("select public.delete_player(%s)", (player,)).fetchone()[0]
    connection.commit()
    return result


@pytest.mark.parametrize("operation", ["stake", "settlement"])
def test_actual_sports_rpc_and_account_deletion_never_invert_profile_wallet_locks(
    scratch_server, operation
):
    import psycopg

    fixture = fixture_id()
    with psycopg.connect(scratch_server.get_uri()) as setup:
        players = seed(setup, 2)
        if operation == "settlement":
            stake(setup, fixture, players[0], pick="home")
            stake(setup, fixture, players[1], pick="away")
            past(setup, fixture)
            arguments = settlement_arguments(setup, fixture)
        setup.execute("reset role")
        setup.execute(
            "create function public.sports_test_pause_wallet() returns trigger language plpgsql "
            "set search_path = '' as $$ begin "
            "if current_setting('sports.pause_wallet', true) = '1' then "
            f"perform pg_catalog.pg_advisory_xact_lock({GATE}); "
            "end if; return new; end $$"
        )
        setup.execute(
            "create trigger sports_test_pause_wallet before update on public.wallets "
            "for each row execute function public.sports_test_pause_wallet()"
        )
    try:
        with (
            psycopg.connect(scratch_server.get_uri()) as writer,
            psycopg.connect(scratch_server.get_uri()) as deleter,
            psycopg.connect(scratch_server.get_uri(), autocommit=True) as gate,
            ThreadPoolExecutor(max_workers=2) as pool,
        ):
            gate.execute("select pg_advisory_lock(%s)", (GATE,))

            def write():
                configure(writer)
                writer.execute("set local sports.pause_wallet = '1'")
                result = (
                    stake(writer, fixture, players[0])
                    if operation == "stake"
                    else settle(writer, fixture, arguments=arguments)
                )
                writer.commit()
                return result

            writing = pool.submit(write)
            wait_for_lock(gate, writer.info.backend_pid)
            deleting = pool.submit(delete, deleter, players[0])
            wait_for_lock(gate, deleter.info.backend_pid)
            gate.execute("select pg_advisory_unlock(%s)", (GATE,))
            assert writing.result(timeout=10)["status"] == "done"
            assert deleting.result(timeout=10)["status"] == "deleted"
        with psycopg.connect(scratch_server.get_uri()) as check:
            assert check.execute(
                "select count(*) from public.profiles where id = %s", (players[0],)
            ).fetchone() == (0,)
            assert check.execute(
                "select count(*) from public.sports_stakes where player_id = %s", (players[0],)
            ).fetchone() == (0,)
    finally:
        with psycopg.connect(scratch_server.get_uri()) as cleanup:
            cleanup.execute("drop trigger sports_test_pause_wallet on public.wallets")
            cleanup.execute("drop function public.sports_test_pause_wallet()")
            for player in players:
                cleanup.execute("delete from auth.users where id = %s", (player,))
            cleanup.execute(
                "delete from public.fixtures where fixture_id = %s and status = 'open'", (fixture,)
            )


def test_settlement_rechecks_stake_membership_after_waiting_for_a_deleting_profile(scratch_server):
    import psycopg

    fixture = fixture_id()
    with psycopg.connect(scratch_server.get_uri()) as setup:
        players = seed(setup, 2)
        stake(setup, fixture, players[0], pick="home")
        stake(setup, fixture, players[1], pick="away")
        past(setup, fixture)
        arguments = settlement_arguments(setup, fixture)
    try:
        with (
            psycopg.connect(scratch_server.get_uri()) as deleter,
            psycopg.connect(scratch_server.get_uri()) as writer,
            psycopg.connect(scratch_server.get_uri(), autocommit=True) as monitor,
            ThreadPoolExecutor(max_workers=1) as pool,
        ):
            # This is the real deletion's first FK-parent lock, before any cascade wallet lock.
            deleter.execute("select 1 from public.profiles where id = %s for update", (players[0],))

            def write():
                configure(writer)
                result = settle(writer, fixture, arguments=arguments)
                writer.commit()
                return result

            pending = pool.submit(write)
            wait_for_lock(monitor, writer.info.backend_pid)
            deleter.execute("select public.delete_player(%s)", (players[0],))
            deleter.commit()
            assert pending.result(timeout=10) == {"status": "refused", "reason": "stakes_changed"}
        with psycopg.connect(scratch_server.get_uri()) as check:
            assert check.execute(
                "select status from public.fixtures where fixture_id = %s", (fixture,)
            ).fetchone() == ("open",)
            assert check.execute(
                "select count(*) from public.wallet_transactions where ref = %s",
                (f"sports:pool:{fixture}",),
            ).fetchone() == (0,)
            assert check.execute(
                "select balance from public.wallets where player_id = %s", (players[1],)
            ).fetchone() == (950,)
    finally:
        with psycopg.connect(scratch_server.get_uri()) as cleanup:
            for player in players:
                cleanup.execute("delete from auth.users where id = %s", (player,))
            cleanup.execute(
                "delete from public.fixtures where fixture_id = %s and status = 'open'", (fixture,)
            )
