"""Coherent member reads and actor-owned historical resolution on private PostgreSQL.

The module owns its scratch cluster, including committed concurrency setup records.
"""

from concurrent.futures import ThreadPoolExecutor
from queue import Queue
from time import monotonic, sleep

import pytest

psycopg = pytest.importorskip("psycopg")
from psycopg.types.json import Jsonb  # noqa: E402

from server.island.catalogue import load_island  # noqa: E402
from server.island.shared_snapshot import snapshot_from_row  # noqa: E402
from server.tests.case_sql.conftest import scratch_server as scratch_server  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import keys, ready, rpc  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    as_owner,
    as_server,
    balance,
)
from server.tests.island_sql.test_personal_captain_sql import (  # noqa: E402
    RULES,
    initialized,
)
from server.tests.island_sql.test_shared_construction_sql import construct  # noqa: E402


def snapshot(connection, actor, owner):
    as_server(connection)
    return rpc(connection, "island_economy_snapshot", actor, owner)


def origin(connection, actor, owner, epoch, uid="build001", domain="construction:build"):
    as_server(connection)
    return rpc(connection, "island_economy_operation_origin", actor, owner, epoch, uid, domain)


def test_snapshot_uses_target_resources_and_separate_authenticated_personal_state(database):
    owner, member, _, initial, _ = initialized(database)
    built = construct(database, owner, initial, uid="build001")
    as_owner(database)
    database.execute("update public.islands set crew_gunner=2 where player_id=%s", (owner,))
    as_server(database)
    rpc(database, "personal_captain_initialize", member, owner, keys(initial)[1], Jsonb(RULES))
    wallet = balance(database, owner)
    result = snapshot(database, member, owner)
    assert result["status"] == "ok", result
    assert result["actorId"] == str(member)
    assert result["economy"]["islandOwner"] == str(owner)
    assert result["economy"]["treasury"]["balanceCoins"] == "191"
    assert result["crew"]["gunner"] == 2
    assert result["personal"]["captain"]["level"] == 1
    assert result["buildings"][0]["instanceId"] == built["receipt"]["result"]["instanceId"]
    assert result["buildings"][0]["refundCoins"] == "4"
    assert result["buildings"][0]["refundReason"] is None
    assert balance(database, owner) == wallet


def test_read_proves_absent_personal_state_without_initializing_or_granting(database):
    owner, _, _, initial = ready(database)
    wallet = balance(database, owner)
    result = snapshot(database, owner, owner)
    assert result["status"] == "ok" and result["personal"] is None
    assert result["economy"]["accountId"] == keys(initial)[0]
    as_owner(database)
    assert database.execute(
        "select count(*) from public.personal_captain_profiles where player_id=%s", (owner,)
    ).fetchone() == (0,)
    assert balance(database, owner) == wallet


def test_paused_member_snapshot_stays_readable_but_outsider_gets_no_projection(database):
    owner, member, outsider, _ = ready(database)
    as_owner(database)
    database.execute(
        "update public.island_economy_state set admission_state='paused' where island_owner=%s",
        (owner,),
    )
    result = snapshot(database, member, owner)
    assert result["status"] == "ok" and result["admissionState"] == "paused"
    assert snapshot(database, outsider, owner) == {"status": "refused", "reason": "not_member"}


def test_snapshot_keeps_missing_actual_refund_lineage_explicit(database):
    owner, _, _, _ = ready(database)
    as_owner(database)
    database.execute("insert into public.islets(player_id,timber) values(%s,0)", (owner,))
    database.execute(
        "insert into public.islet_buildings "
        "(player_id,plot,building_type,level,coins_paid,timber_paid,ref) "
        "values(%s,'wall_1','wall',1,10,0,'old-private')",
        (owner,),
    )
    result = snapshot(database, owner, owner)
    assert result["buildings"][0]["refundCoins"] is None
    assert result["buildings"][0]["refundReason"] == "construction_basis_missing"


def test_historical_origin_precedes_current_epoch_and_departed_membership(database):
    owner, member, _, initial, _ = initialized(database)
    as_server(database)
    rpc(database, "personal_captain_initialize", member, owner, keys(initial)[1], Jsonb(RULES))
    built = construct(
        database,
        member,
        initial,
        {
            "action": "build",
            "spot": "wall_1",
            "kind": "wall",
            "instanceId": None,
            "expectedLevel": 0,
            "quotedCoins": "10",
        },
        uid="build001",
    )
    assert built["status"] == "done"
    as_server(database)
    rpc(database, "game_leave", member, owner)
    as_owner(database)
    database.execute(
        "update public.island_economy_accounts set state='retired',"
        "retired_at=clock_timestamp() where id=%s",
        (keys(initial)[0],),
    )
    replacement = database.execute(
        "insert into public.island_economy_accounts(island_owner) "
        "values(%s) returning id,run_epoch",
        (owner,),
    ).fetchone()
    database.execute(
        "update public.island_economy_state set current_account_id=%s,run_epoch=%s "
        "where island_owner=%s",
        (*replacement, owner),
    )
    result = origin(database, member, owner, keys(initial)[1])
    assert result["status"] == "replay"
    assert result["origin"]["accountId"] == keys(initial)[0]
    assert origin(database, member, owner, replacement[1])["reason"] == "action_conflict"
    assert (
        origin(database, member, owner, keys(initial)[1], domain="crew:hire")["reason"]
        == "action_conflict"
    )
    assert snapshot(database, member, owner)["reason"] == "not_member"


def test_origin_lookup_waits_for_the_original_scope_before_declaring_a_new_uid(
    database, scratch_server
):
    owner, _, _, initial, _ = initialized(database)
    database.commit()
    readers = Queue()
    with psycopg.connect(scratch_server.get_uri()) as writer:
        assert construct(writer, owner, initial, uid="build001")["status"] == "done"

        def read_origin():
            with psycopg.connect(scratch_server.get_uri()) as reader:
                readers.put(reader.info.backend_pid)
                return origin(reader, owner, owner, keys(initial)[1])

        with ThreadPoolExecutor(1) as pool:
            reading = pool.submit(read_origin)
            wait_for_lock(database, readers.get(timeout=5))
            assert not reading.done()
            writer.commit()
            assert reading.result(timeout=5)["status"] == "replay"


def test_private_snapshot_rpcs_grant_no_browser_capability(database):
    for signature in (
        "public.island_economy_snapshot(uuid,uuid)",
        "public.island_economy_operation_origin(uuid,uuid,uuid,text,text)",
    ):
        for role in ("anon", "authenticated"):
            assert database.execute(
                "select has_function_privilege(%s,%s,'execute')", (role, signature)
            ).fetchone() == (False,)


def wait_for_lock(observer, pid):
    as_owner(observer)
    deadline = monotonic() + 5
    while monotonic() < deadline:
        # Each poll needs fresh activity rather than this transaction's cached statistics.
        observer.execute("select pg_stat_clear_snapshot()")
        if observer.execute(
            "select wait_event_type from pg_stat_activity where pid=%s", (pid,)
        ).fetchone() == ("Lock",):
            return
        sleep(0.01)
    pytest.fail("The concurrent read did not reach the held database lock.")


def test_snapshot_waits_for_atomic_purchase_and_reads_money_asset_and_captain_together(
    database,
    scratch_server,
):
    owner, _, _, initial, _ = initialized(database)
    database.commit()
    readers = Queue()
    with psycopg.connect(scratch_server.get_uri()) as writer:
        built = construct(writer, owner, initial, uid="coherent01")
        assert built["status"] == "done"

        def read():
            with psycopg.connect(scratch_server.get_uri()) as reader:
                readers.put(reader.info.backend_pid)
                return snapshot(reader, owner, owner)

        with ThreadPoolExecutor(1) as pool:
            reading = pool.submit(read)
            wait_for_lock(database, readers.get(timeout=5))
            assert not reading.done()
            writer.commit()
            value = reading.result(timeout=5)
    assert value["economy"]["treasury"]["balanceCoins"] == "191"
    assert value["buildings"][0]["instanceId"] == built["receipt"]["result"]["instanceId"]
    assert (
        value["personal"]["captain"]["engineerCommitment"]["id"]
        == built["receipt"]["result"]["engineerCommitmentId"]
    )


def test_snapshot_waits_for_pointer_rotation_and_never_mixes_old_money_with_new_assets(
    database,
    scratch_server,
):
    owner, _, _, initial, _ = initialized(database)
    assert construct(database, owner, initial)["status"] == "done"
    database.commit()
    readers = Queue()
    with psycopg.connect(scratch_server.get_uri()) as writer:
        rpc(writer, "island_treasury_lock_scope", owner)
        writer.execute(
            "update public.island_economy_accounts set state='retired',"
            "retired_at=clock_timestamp() where id=%s",
            (keys(initial)[0],),
        )
        replacement = writer.execute(
            "insert into public.island_economy_accounts"
            "(island_owner) values(%s) returning id,run_epoch",
            (owner,),
        ).fetchone()
        writer.execute(
            "update public.island_economy_state set current_account_id=%s,run_epoch=%s "
            "where island_owner=%s",
            (*replacement, owner),
        )
        writer.execute("delete from public.islet_buildings where player_id=%s", (owner,))
        writer.execute(
            "update public.islands set crew_gunner=0,wave_best=0 where player_id=%s", (owner,)
        )

        def read():
            with psycopg.connect(scratch_server.get_uri()) as reader:
                readers.put(reader.info.backend_pid)
                return snapshot(reader, owner, owner)

        with ThreadPoolExecutor(1) as pool:
            reading = pool.submit(read)
            wait_for_lock(database, readers.get(timeout=5))
            writer.commit()
            value = reading.result(timeout=5)
    assert value["economy"]["accountId"] == str(replacement[0])
    assert value["economy"]["treasury"]["balanceCoins"] == "0"
    assert value["buildings"] == [] and value["waveBest"] == 0


def test_prepared_construction_quotes_round_trip_through_actual_transactions(database):
    owner, _, _, initial, _ = initialized(database)
    for action, expected_balance in (("build", "191"), ("upgrade", "173"), ("demolish", "186")):
        projected = snapshot_from_row(
            snapshot(database, owner, owner), str(owner), str(owner), load_island()
        )
        selector = {"spot": "wall_1", "kind": "wall"} if action == "build" else {"spot": "wall_1"}
        quoted = next(row for row in projected["quotes"][action] if row["target"] == selector)
        assert quoted["available"], quoted
        result = construct(database, owner, initial, {"action": action, **quoted["intent"]})
        assert result["status"] == "done", result
        assert result["currentEconomy"]["treasury"]["balanceCoins"] == expected_balance


def test_reserved_snapshot_preserves_stale_reservation_without_expiring_it(database):
    owner, _, _, initial, _ = initialized(database)
    assert construct(database, owner, initial)["status"] == "done"
    as_owner(database)
    held = database.execute("select gen_random_uuid()").fetchone()[0]
    database.execute(
        "update public.island_recovery_state set current_wave_id=%s,"
        "reserved_at=clock_timestamp()-interval '2 hours',"
        "starts_at=clock_timestamp()-interval '2 hours',"
        "expires_at=clock_timestamp()-interval '1 hour' where island_owner=%s",
        (held, owner),
    )
    value = snapshot(database, owner, owner)
    assert value["reserved"] is True
    assert value["buildings"][0]["hpUnits"] is None
    as_owner(database)
    assert database.execute(
        "select current_wave_id from public.island_recovery_state where island_owner=%s", (owner,)
    ).fetchone() == (held,)
    projected = snapshot_from_row(value, str(owner), str(owner), load_island())
    assert all(not offer["available"] for rows in projected["quotes"].values() for offer in rows)


def test_changed_retry_intent_is_still_checked_by_original_domain_after_departure(database):
    owner, member, _, initial, _ = initialized(database)
    as_server(database)
    rpc(database, "personal_captain_initialize", member, owner, keys(initial)[1], Jsonb(RULES))
    intent = {
        "action": "build",
        "spot": "wall_1",
        "kind": "wall",
        "instanceId": None,
        "expectedLevel": 0,
        "quotedCoins": "10",
    }
    built = construct(database, member, initial, intent, uid="frozen001")
    assert built["status"] == "done"
    as_server(database)
    rpc(database, "game_leave", member, owner)
    assert origin(database, member, owner, keys(initial)[1], uid="frozen001")["status"] == "replay"
    assert construct(database, member, initial, {**intent, "spot": "wall_2"}, uid="frozen001") == {
        "status": "refused",
        "reason": "action_conflict",
    }
    repeat = construct(database, member, initial, intent, uid="frozen001")
    assert repeat["receipt"] == built["receipt"] and repeat["currentEconomy"] is None
