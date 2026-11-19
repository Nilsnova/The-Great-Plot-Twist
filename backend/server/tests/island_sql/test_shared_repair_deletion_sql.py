"""Real shared repair vs complete canonical account deletion, in both commit orders.

Only the existing native combat fixture seeds initial legacy structures/entitlements.
Actual controllers, bell, structural checkpoint, repair and lifecycle executor produce every
effect. Internal historical receipt checks do not authenticate a deleted HTTP caller.
"""

import time
from concurrent.futures import ThreadPoolExecutor
from queue import Queue

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import keys  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import as_owner  # noqa: E402
from server.tests.island_sql.test_shared_combat_native_sql import (  # noqa: E402
    damage,
    native_combat,
    repair,
    wave_hp,
)
from server.tests.island_sql.test_shared_lifecycle_transactions_sql import delete  # noqa: E402


@pytest.mark.parametrize("first_domain", ["repair", "delete"])
def test_actual_repair_and_account_delete_serialize_without_partial_effects(
    scratch_server, first_domain,
):
    with psycopg.connect(scratch_server.get_uri()) as setup:
        world = native_combat(setup)
        seq = damage(setup, world)
        setup.commit()
    pids = Queue()

    def operation(connection, domain):
        if domain == "delete":
            return delete(connection, world.target)
        return repair(connection, world, actor=world.target, uid="repair_delete_race_001", seq=seq)

    def second_operation(domain):
        with psycopg.connect(scratch_server.get_uri()) as connection:
            connection.execute("set statement_timeout='5s'")
            pids.put(connection.execute("select pg_backend_pid()").fetchone()[0])
            return operation(connection, domain)

    with psycopg.connect(scratch_server.get_uri()) as first:
        first.execute("set statement_timeout='5s'")
        original = operation(first, first_domain)
        assert original["status"] == ("done" if first_domain == "repair" else "deleted"), original
        as_owner(first)
        with ThreadPoolExecutor(max_workers=1) as pool:
            pending = pool.submit(
                second_operation, "delete" if first_domain == "repair" else "repair",
            )
            pid = pids.get(timeout=3)
            deadline = time.monotonic() + 3
            while (
                first.execute("select cardinality(pg_blocking_pids(%s))", (pid,)).fetchone()[0] == 0
            ):
                assert not pending.done(), "The second transaction bypassed canonical actor guards."
                assert time.monotonic() < deadline, (
                    "The second operation did not reach the lock wait."
                )
                time.sleep(0.01)
            # Readers see neither a partial debit nor a new root before the first commit.
            with psycopg.connect(scratch_server.get_uri()) as observer:
                as_owner(observer)
                assert observer.execute(
                    "select balance_coins from public.island_economy_accounts where id=%s",
                    (keys(world.treasury)[0],),
                ).fetchone()[0] == 40
                assert observer.execute(
                    "select count(*) from public.island_economy_operations where actor_id=%s "
                    "and action_uid='repair_delete_race_001'", (world.target,),
                ).fetchone()[0] == 0
            first.commit()
            later = pending.result(timeout=5)

    repaired = first_domain == "repair"
    assert later == ({"status": "deleted"} if repaired else {
        "status": "refused", "reason": "not_member",
    }), later
    with psycopg.connect(scratch_server.get_uri()) as check:
        as_owner(check)
        assert check.execute("select count(*) from auth.users where id=%s",
                             (world.target,)).fetchone()[0] == 0
        assert check.execute("select count(*) from public.profiles where id=%s",
                             (world.target,)).fetchone()[0] == 0
        assert check.execute("select count(*) from public.wallets where player_id=%s",
                             (world.target,)).fetchone()[0] == 0
        assert check.execute(
            "select balance_coins,committed_coins from public.island_economy_accounts where id=%s",
            (keys(world.treasury)[0],),
        ).fetchone() == (30 if repaired else 40, 0)
        assert check.execute(
            "select paid_used from public.recovery_wave_states where wave_id=%s", (world.wave,),
        ).fetchone()[0] == int(repaired)
        assert check.execute(
            "select count(*) from public.recovery_wave_events "
            "where wave_id=%s and event_kind='structure_repaired'", (world.wave,),
        ).fetchone()[0] == int(repaired)
        assert check.execute(
            "select count(*) from public.island_economy_operations where actor_id=%s "
            "and action_uid='repair_delete_race_001'", (world.target,),
        ).fetchone()[0] == int(repaired)
        assert check.execute(
            "select count(*) from public.island_shared_repair_receipts r "
            "join public.island_economy_operations o on o.id=r.operation_id "
            "where o.actor_id=%s and o.action_uid='repair_delete_race_001'", (world.target,),
        ).fetchone()[0] == int(repaired)
        assert wave_hp(check, world) == (1000000 if repaired else 400000)
        if repaired:
            # Original internal history remains immutable after real identity/profile deletion.
            replay = repair(check, world, actor=world.target, uid="repair_delete_race_001", seq=seq)
            assert replay == {"status": "done", "repeat": True, "receipt": original["receipt"]}
            assert set(replay) == {"status", "repeat", "receipt"}
