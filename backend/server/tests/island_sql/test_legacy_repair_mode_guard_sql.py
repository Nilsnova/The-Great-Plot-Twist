"""Actual legacy repair/admission serialization on disposable PostgreSQL, never live data."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest

psycopg = pytest.importorskip("psycopg")
from psycopg.types.json import Jsonb  # noqa: E402

from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import (  # noqa: E402
    as_owner,
    as_server,
    balance,
    ready,
    rpc,
)
from server.tests.island_sql.test_islands_and_waves_sql import build, open_island  # noqa: E402


def seed(connection):
    owner, member, _, _ = ready(connection, admitted=False)
    alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
    code = "".join(alphabet[(member.int >> (5 * i)) % len(alphabet)] for i in range(5))
    open_island(connection, member, code)
    build(connection, owner, "wall_1", "wall", "build-0001", coins=10)
    as_owner(connection)
    epoch = uuid4()
    connection.execute(
        "update public.island_recovery_state set reset_epoch=%s,recovery_version=1,wave_protocol=2 "
        "where island_owner=%s",
        (epoch, owner),
    )
    instance = connection.execute(
        "select recovery_instance_id from public.islet_buildings "
        "where player_id=%s and plot='wall_1'",
        (owner,),
    ).fetchone()[0]
    connection.execute(
        "insert into public.island_structure_health "
        "(island_owner,spot,instance_id,building_kind,level,hp_units,max_hp,config_version,"
        "settled_at,rate_numerator,rate_denominator,repair_seq) "
        "values(%s,'wall_1',%s,'wall',1,500000,60,1,clock_timestamp(),0,1,0)",
        (owner, instance),
    )
    return {"owner": owner, "member": member, "epoch": epoch, "instance": instance}


def legacy_repair(connection, world):
    as_server(connection)
    return rpc(
        connection,
        "island_structure_repair",
        world["member"],
        world["owner"],
        "wall_1",
        world["instance"],
        "repair-0001",
        world["epoch"],
        "between_waves",
        None,
        1,
        0,
        10,
        "a" * 64,
        Jsonb({"wall": [10, 20, 40, 80, 160]}),
    )


def test_actual_private_repair_rechecks_admitted_mode_before_any_wallet_lock_or_charge(database):
    world = seed(database)
    before = balance(database, world["member"])
    assert (
        rpc(database, "island_treasury_admit", world["owner"], world["owner"], "admit0001", 200)[
            "status"
        ]
        == "done"
    )
    assert legacy_repair(database, world) == {
        "status": "refused",
        "reason": "economy_context_required",
    }
    assert balance(database, world["member"]) == before
    as_owner(database)
    assert database.execute(
        "select hp_units,repair_seq from public.island_structure_health where island_owner=%s",
        (world["owner"],),
    ).fetchone() == (500_000, 0)


def test_explicit_legacy_retry_remains_idempotent_and_admission_keeps_its_original_receipt(
    database,
):
    world = seed(database)
    before = balance(database, world["member"])
    first = legacy_repair(database, world)
    again = legacy_repair(database, world)
    assert first["status"] == "done" and again["repeat"] is True
    assert first["receipt"] == again["receipt"]
    assert balance(database, world["member"]) == before - 10
    assert (
        rpc(database, "island_treasury_admit", world["owner"], world["owner"], "admit0001", 200)[
            "status"
        ]
        == "done"
    )
    assert legacy_repair(database, world)["reason"] == "economy_context_required"
    as_owner(database)
    assert (
        database.execute(
            "select receipt_json from public.structure_repair_receipts "
            "where payer_id=%s and action_uid='repair-0001'",
            (world["member"],),
        ).fetchone()[0]
        == first["receipt"]
    )


def test_actual_shared_admission_racing_private_repair_cannot_charge_after_admission(
    scratch_server,
):
    with psycopg.connect(scratch_server.get_uri()) as connection:
        world = seed(connection)
        before = balance(connection, world["member"])
        connection.commit()
    barrier = Barrier(2)

    def run(admission):
        with psycopg.connect(scratch_server.get_uri()) as connection:
            connection.execute("set lock_timeout='5s'")
            barrier.wait(timeout=5)
            result = (
                rpc(
                    connection,
                    "island_treasury_admit",
                    world["owner"],
                    world["owner"],
                    "admit0001",
                    200,
                )
                if admission
                else legacy_repair(connection, world)
            )
            connection.commit()
            return result

    with ThreadPoolExecutor(max_workers=2) as pool:
        admitted, repair = list(pool.map(run, (True, False)))
    assert admitted["status"] == "done"
    with psycopg.connect(scratch_server.get_uri()) as connection:
        as_owner(connection)
        if repair["status"] == "done":
            assert balance(connection, world["member"]) == before - 10
            assert connection.execute(
                "select r.committed_at <= s.admitted_at from public.structure_repair_receipts r "
                "join public.island_economy_state s on s.island_owner=r.island_owner "
                "where r.payer_id=%s and r.action_uid='repair-0001'",
                (world["member"],),
            ).fetchone() == (True,)
        else:
            assert repair == {"status": "refused", "reason": "economy_context_required"}
            assert balance(connection, world["member"]) == before
        assert legacy_repair(connection, world)["reason"] == "economy_context_required"
