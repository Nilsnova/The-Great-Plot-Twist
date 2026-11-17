"""Owner-locked start admission and immutable replay in disposable PostgreSQL."""

import json
import threading
import time
from uuid import UUID

import pytest

psycopg = pytest.importorskip("psycopg")

from server.island.layout import island_layout, positions_of  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    add_players,
    as_server,
    call,
    open_island,
)
from server.tests.island_sql.test_structure_recovery_mutations_sql import (  # noqa: E402
    OWNER,
    seed_v1,
    template,
)

START = (
    "select public.perimeter_wave_start(%s,%s,%s,%s,42,0,15,150,100,'calm',1,0,"
    "%s,%s::jsonb,%s,%s::smallint,%s::smallint)"
)


def start(
    db,
    *,
    player=OWNER,
    owner=OWNER,
    place="island",
    uid="perimeter-start-01",
    rules=None,
    snapshot=None,
    admit=False,
    protocol=2,
    client=1,
):
    as_server(db)
    return call(
        db,
        START,
        player,
        uid,
        place,
        owner,
        ["pathing", "structure_recovery"] if rules is None else rules,
        json.dumps(snapshot) if snapshot is not None else None,
        admit,
        protocol,
        client,
    )


def setup(db, *, v1=True):
    if v1:
        seed_v1(db, structures=())
    else:
        add_players(db, OWNER)
        open_island(db, OWNER, "MUT55")
    as_server(db)
    db.execute("insert into public.island_wall_policy values(%s,1,128)", (OWNER,))
    current = template()
    current.update(
        wallRuleVersion=1,
        wallCapacity=128,
        expectedRevision=call(
            db, "select revision from public.island_recovery_state where island_owner=%s", OWNER
        ),
    )
    current["createWave"].update(pathing=True, perimeterWalls=True)
    return current


@pytest.mark.parametrize(
    ("protocol", "client", "reason"),
    [
        (1, 1, "client_update_required"),
        (2, 0, "client_update_required"),
        (2, 1, "structure_recovery_required"),
    ],
)
def test_unsupported_perimeter_start_creates_no_wave_or_participant(
    database, protocol, client, reason
):
    current = setup(database, v1=False)
    assert start(database, protocol=protocol, client=client, snapshot=current) == {
        "status": "refused",
        "reason": reason,
    }
    assert call(database, "select count(*) from public.wave_runs") == 0
    assert call(database, "select count(*) from public.wave_participants") == 0


@pytest.mark.parametrize("bad", ["capacity", "marker", "pathing", "null_rule"])
def test_incomplete_or_malformed_perimeter_rules_never_start(database, bad):
    current = setup(database)
    rules = ["pathing", "structure_recovery"]
    if bad == "capacity":
        current["wallCapacity"] = 12
    elif bad == "marker":
        current["createWave"]["perimeterWalls"] = False
    elif bad == "pathing":
        current["createWave"]["pathing"] = False
    else:
        rules.append(None)
    assert start(database, snapshot=current, rules=rules) == {
        "status": "refused",
        "reason": "perimeter_rules_required",
    }
    assert call(database, "select count(*) from public.wave_runs") == 0


def test_same_context_retry_keeps_frozen_geometry_after_flags_and_template_change(database):
    current = setup(database)
    accepted = start(database, snapshot=current)
    assert accepted["status"] == "started"
    stored = accepted["initialSnapshot"]
    assert stored["createWave"]["perimeterWalls"] is True
    assert stored["createWave"]["pathing"] is True
    assert (stored["wallRuleVersion"], stored["wallCapacity"], stored["configVersion"]) == (
        1,
        128,
        1,
    )
    retried = start(database, snapshot=None, rules=[], client=0)
    assert retried["waveId"] == accepted["waveId"]
    assert retried["initialSnapshot"] == stored
    assert retried["repeat"] is True
    assert call(database, "select count(*) from public.wave_runs") == 1


def test_explicit_v1_admission_requires_the_actual_rule_and_then_starts_safely(database):
    current = setup(database, v1=False)
    assert start(database, snapshot=current, admit=True, rules=["pathing", None]) == {
        "status": "refused",
        "reason": "structure_recovery_required",
    }
    accepted = start(database, snapshot=current, admit=True)
    assert (accepted["status"], accepted["recoveryVersion"], accepted["waveProtocol"]) == (
        "started",
        1,
        2,
    )


def test_membership_precedes_private_replay(database):
    current = setup(database)
    member = UUID(int=2201)
    add_players(database, member)
    open_island(database, member, "NTH32")
    database.execute(
        "insert into public.island_members(island_owner,player_id,role) values(%s,%s,'member')",
        (OWNER, member),
    )
    accepted = start(database, player=member, snapshot=current)
    assert accepted["status"] == "started"
    database.execute(
        "update public.island_members set left_at=clock_timestamp() "
        "where island_owner=%s and player_id=%s",
        (OWNER, member),
    )
    assert start(database, player=member, client=0) == {"status": "refused", "reason": "not_member"}


def test_legacy_delegation_and_cross_target_uid_fence(database):
    add_players(database, OWNER)
    open_island(database, OWNER, "MUT55")
    accepted = start(database, protocol=1, client=0, rules=[])
    assert (accepted["recoveryVersion"], accepted["waveProtocol"]) == (0, 1)
    assert start(database, protocol=1, client=0, rules=[])["waveId"] == accepted["waveId"]
    assert start(database, owner=None, place="pirate_point", protocol=1, client=0, rules=[]) == {
        "status": "refused",
        "reason": "input_conflict",
    }


def test_stale_legacy_start_waits_for_actual_policy_admission_and_then_refuses(
    scratch_server, database
):
    add_players(database, OWNER)
    open_island(database, OWNER, "MUT55")
    database.commit()
    started = threading.Event()
    answers, failures, worker_pid = [], [], []

    def stale_start():
        try:
            with psycopg.connect(scratch_server.get_uri()) as db:
                db.execute("set local lock_timeout='5s'")
                worker_pid.append(call(db, "select pg_backend_pid()"))
                started.set()
                answers.append(start(db, protocol=1, client=0, rules=[]))
                db.commit()
        except Exception as error:
            failures.append(error)

    worker = threading.Thread(target=stale_start)
    try:
        with psycopg.connect(scratch_server.get_uri()) as admission:
            as_server(admission)
            admission.execute(
                "select 1 from public.islands where player_id=%s for update", (OWNER,)
            )
            raw = call(admission, "select public.island_wall_layout_read(%s)", OWNER)
            assert raw["ruleVersion"] == 0
            effective = [
                {"plot": spot, "x_half": round(x * 2), "z_half": round(z * 2)}
                for spot, (x, z) in sorted(positions_of(island_layout(), {}).items())
            ]
            admitted = call(
                admission,
                "select public.island_wall_policy_admit(%s,%s,'[]'::jsonb,%s::jsonb)",
                OWNER,
                OWNER,
                json.dumps(effective),
            )
            assert admitted["status"] == "done"
            worker.start()
            assert started.wait(timeout=5)
            admission.execute("reset role")
            for _ in range(100):
                call(admission, "select pg_stat_clear_snapshot()")
                waiting = call(
                    admission,
                    "select wait_event_type from pg_stat_activity where pid=%s",
                    worker_pid[0],
                )
                if waiting == "Lock":
                    break
                time.sleep(0.01)
            else:
                pytest.fail("The competing start did not wait on the held owner lock.")
            admission.commit()
        worker.join(timeout=6)
        assert not worker.is_alive()
        assert failures == []
        assert answers == [{"status": "refused", "reason": "client_update_required"}]
        assert call(database, "select count(*) from public.wave_runs") == 0
    finally:
        if worker.is_alive():
            worker.join(timeout=6)
        with psycopg.connect(scratch_server.get_uri(), autocommit=True) as cleanup:
            cleanup.execute("delete from auth.users where id=%s", (OWNER,))


def test_wrapper_remains_service_only(database):
    signature = (
        "public.perimeter_wave_start(uuid,text,text,uuid,integer,integer,integer,"
        "integer,integer,text,numeric,numeric,text[],jsonb,boolean,smallint,smallint)"
    )
    for role in ("anon", "authenticated"):
        assert (
            call(database, "select has_function_privilege(%s,%s,'execute')", role, signature)
            is False
        )
    assert (
        call(database, "select has_function_privilege('service_role',%s,'execute')", signature)
        is True
    )
