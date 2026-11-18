"""Actual legacy revival/shared admission fences on disposable PostgreSQL only.

Direct SQL fixtures deliberately exercise old entry points on a shared target; this is not
proof of a production wave producer, canonical Captain fall or authenticated free revival.
"""

import time
from concurrent.futures import ThreadPoolExecutor
from queue import Queue

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.island_sql.test_captain_revive_sql import running_wave  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import ready, rpc  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    FRIEND,
    OWNER,
    add_players,
    as_owner,
    as_server,
    balance,
    move_start,
    open_island,
)
from server.tests.island_sql.test_recovery_revive_sql import context  # noqa: E402
from server.tests.island_sql.test_recovery_wave_end_sql import (  # noqa: E402
    move_start as move_recovery_start,
)
from server.tests.island_sql.test_tower_defense_sql import start  # noqa: E402
from server.tests.island_sql.test_wave_crews_sql import join as join_wave  # noqa: E402


def seed(connection, *, recovery=False, shared_target=False, shared_actor=False):
    add_players(connection, OWNER, FRIEND)
    open_island(connection, OWNER, "K7Q2M")
    open_island(connection, FRIEND, "M8P3N")
    if shared_target:
        assert rpc(connection, "island_treasury_admit", OWNER, OWNER, "targetadmit1", 200)[
            "status"
        ] == "done"
    if shared_actor:
        assert rpc(connection, "island_treasury_admit", FRIEND, FRIEND, "actoradmit01", 200)[
            "status"
        ] == "done"
    if recovery:
        wave, target = context(connection, target_player=OWNER)
    else:
        wave, target = running_wave(connection, FRIEND), "p-fallen"
        assert join_wave(connection, FRIEND, wave)["status"] == "joined"
    return wave, target


def revive(connection, entry, wave, target, *, actor=FRIEND):
    as_server(connection)
    arguments = (actor, wave, target, 10, "guardrevive1", 20, 5)
    if entry == "recovery_wave_revive":
        arguments += (1.0, 2.0)
    return rpc(connection, entry, *arguments)


def facts(connection, actor, wave):
    as_owner(connection)
    return (
        balance(connection, actor),
        connection.execute(
            "select count(*) from public.wallet_transactions "
            "where player_id=%s and reason='captain_revive'", (actor,),
        ).fetchone()[0],
        connection.execute(
            "select count(*) from public.captain_revives where player_id=%s", (actor,),
        ).fetchone()[0],
        connection.execute(
            "select count(*) from public.recovery_wave_events "
            "where wave_id=%s and event_kind='captain_revive'", (wave,),
        ).fetchone()[0],
        connection.execute(
            "select count(*) from public.island_economy_operations where actor_id=%s", (actor,),
        ).fetchone()[0],
    )


@pytest.mark.parametrize(
    ("entry", "recovery"),
    [("wave_revive", False), ("wave_revive_charge", False),
     ("wave_revive_charge", True), ("recovery_wave_revive", True)],
)
def test_shared_target_refuses_every_actual_personal_charge_entry_without_effects(
    database, entry, recovery,
):
    wave, target = seed(database, recovery=recovery, shared_target=True)
    before = facts(database, FRIEND, wave)
    assert revive(database, entry, wave, target) == {
        "status": "refused", "reason": "economy_context_required",
    }
    assert facts(database, FRIEND, wave) == before


@pytest.mark.parametrize("recovery", [False, True])
@pytest.mark.parametrize("shared_actor", [False, True])
def test_explicit_legacy_target_keeps_payment_retry_and_journal_even_for_a_shared_actor(
    database, recovery, shared_actor,
):
    wave, target = seed(database, recovery=recovery, shared_actor=shared_actor)
    entry = "recovery_wave_revive" if recovery else "wave_revive"
    before = facts(database, FRIEND, wave)
    paid = revive(database, entry, wave, target)
    assert paid["status"] == "done" and paid["repeat"] is False and paid["price"] == 25
    after = facts(database, FRIEND, wave)
    assert after == (before[0] - 25, before[1] + 1, before[2] + 1,
                     before[3] + int(recovery), before[4])
    repeated = revive(database, entry, wave, target)
    assert repeated == {**paid, "repeat": True}
    assert facts(database, FRIEND, wave) == after


@pytest.mark.parametrize("recovery", [False, True])
def test_shared_admission_preserves_original_legacy_data_and_closes_its_paid_retry(
    database, recovery,
):
    wave, target = seed(database, recovery=recovery)
    entry = "recovery_wave_revive" if recovery else "wave_revive"
    assert revive(database, entry, wave, target)["status"] == "done"
    before = facts(database, FRIEND, wave)
    if recovery:
        move_recovery_start(database, wave, 1000)
    else:
        move_start(database, wave, 1000)
    assert rpc(database, "island_treasury_admit", OWNER, OWNER, "targetadmit1", 200)[
        "status"
    ] == "done"
    assert revive(database, entry, wave, target) == {
        "status": "refused", "reason": "economy_context_required",
    }
    assert facts(database, FRIEND, wave) == before


def test_admission_scope_blocks_legacy_revive_before_wallet_and_rechecks_mode_after_wait(
    scratch_server,
):
    # Unique actors keep this committed concurrency fixture separate from rolled-back tests.
    with psycopg.connect(scratch_server.get_uri()) as connection:
        owner, actor, _, _ = ready(connection, admitted=False)
        open_island(connection, actor, "R4C3A")
        wave = start(connection, owner, "racebell01", owner=owner)["waveId"]
        move_start(connection, wave, 20)
        assert join_wave(connection, actor, wave)["status"] == "joined"
        before = facts(connection, actor, wave)
        connection.commit()

    worker_pid = Queue()

    def pay():
        with psycopg.connect(scratch_server.get_uri()) as connection:
            connection.execute("set lock_timeout='5s'")
            worker_pid.put(connection.info.backend_pid)
            answer = revive(connection, "wave_revive", wave, "p-fallen", actor=actor)
            connection.commit()
            return answer

    with psycopg.connect(scratch_server.get_uri()) as admission:
        # The scratch owner controls the synchronization fixture; the internal lock helper
        # intentionally remains unavailable as a standalone service-role RPC.
        as_owner(admission)
        rpc(admission, "island_treasury_lock_scope", owner)
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(pay)
            pid = worker_pid.get(timeout=5)
            with psycopg.connect(scratch_server.get_uri(), autocommit=True) as observer:
                deadline = time.monotonic() + 3
                while True:
                    blocked = observer.execute(
                        "select %s=any(pg_blocking_pids(%s))", (admission.info.backend_pid, pid),
                    ).fetchone()[0]
                    if blocked or time.monotonic() >= deadline:
                        break
                    time.sleep(0.01)
                assert blocked, "The paid entry must wait for the common target scope guard."
                # A blocked legacy revive has not acquired its personal wallet row yet.
                observer.execute(
                    "select 1 from public.wallets where player_id=%s for update nowait", (actor,),
                )
            # Move the retained fixture past expiry so actual admission is allowed. This is
            # a timer fixture, not an assertion that active-wave admission is permitted.
            move_start(admission, wave, 1000)
            assert rpc(admission, "island_treasury_admit", owner, owner, "raceadmit01", 200)[
                "status"
            ] == "done"
            admission.commit()
            assert future.result(timeout=5) == {
                "status": "refused", "reason": "economy_context_required",
            }
    with psycopg.connect(scratch_server.get_uri()) as connection:
        assert facts(connection, actor, wave) == before
