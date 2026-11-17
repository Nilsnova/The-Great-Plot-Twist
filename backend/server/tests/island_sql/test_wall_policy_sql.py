"""Trusted wall admission and policy/layout fences on disposable PostgreSQL only."""

import json
from uuid import UUID

import pytest

pytest.importorskip("psycopg")
from server.island.layout import load_layout, positions_of  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    OWNER,
    add_players,
    as_owner,
    call,
    open_island,
    start,
)

MEMBER = UUID(int=99002)


def ready(db):
    add_players(db, OWNER, MEMBER)
    open_island(db, OWNER, "K7Q2M")


def read(db):
    return call(db, "select public.island_wall_layout_read(%s)", OWNER)


def effective(stored=None):
    return [
        {"plot": key, "x_half": round(x * 2), "z_half": round(z * 2)}
        for key, (x, z) in sorted(positions_of(load_layout(), stored or {}).items())
    ]


def admit(db, seen=None, cells=None, actor=OWNER):
    return call(
        db,
        "select public.island_wall_policy_admit(%s,%s,%s::jsonb,%s::jsonb)",
        actor,
        OWNER,
        json.dumps(seen or []),
        json.dumps(cells or effective()),
    )


def move(db, plot="wall_1", x=-10, z=20, snapshot=None, actor=OWNER):
    s = snapshot or read(db)
    return call(
        db,
        "select public.island_wall_move(%s,%s,%s,%s,%s,%s::jsonb,%s,%s)",
        OWNER,
        actor,
        plot,
        x,
        z,
        json.dumps(s["rows"]),
        s["ruleVersion"],
        s["capacity"],
    )


def test_empty_island_is_explicitly_legacy_and_browser_cannot_read_or_admit(database):
    ready(database)
    assert read(database) == {"ruleVersion": 0, "capacity": 12, "rows": []}
    as_owner(database)
    assert database.execute(
        "select has_table_privilege('authenticated',"
        "'public.island_wall_policy','select'),"
        "has_function_privilege('authenticated',"
        "'public.island_wall_policy_admit(uuid,uuid,jsonb,jsonb)','execute')"
    ).fetchone() == (False, False)


def test_admission_materializes_effective_legacy_layout_once_without_drift(database):
    ready(database)
    # A historical off-lane row: the old API displays its deterministic D056 effective cell.
    assert (
        call(database, "select public.island_move(%s,%s,'wall_1',0,-36,'[]'::jsonb)", OWNER, OWNER)[
            "status"
        ]
        == "done"
    )
    old = read(database)
    expected = effective({"wall_1": (0.0, -18.0)})
    assert admit(database, old["rows"], expected) == {"status": "done", "repeat": False}
    assert read(database) == {"ruleVersion": 1, "capacity": 128, "rows": expected}
    assert admit(database) == {"status": "done", "repeat": True}
    assert read(database)["rows"] == expected


def test_legacy_validation_cannot_write_after_an_admission_race(database):
    ready(database)
    old = read(database)
    assert admit(database)["status"] == "done"
    assert move(database, snapshot=old) == {"status": "refused", "reason": "busy"}
    current = read(database)
    assert move(database, snapshot=current)["status"] == "done"
    assert move(database, snapshot=current) == {"status": "refused", "reason": "busy"}


def test_owner_and_membership_are_checked_before_replay_or_write(database):
    ready(database)
    assert admit(database, actor=MEMBER) == {"status": "refused", "reason": "owner_only"}
    assert move(database, actor=MEMBER) == {"status": "refused", "reason": "not_member"}
    assert read(database)["rows"] == []


def test_active_wave_prevents_admission_and_both_policy_move_versions(database):
    ready(database)
    assert admit(database)["status"] == "done"
    before = read(database)
    start(database, OWNER, "bell-policy-01", owner=OWNER)
    assert move(database) == {"status": "refused", "reason": "wave_running"}
    assert read(database) == before


def test_inventory_wall_is_not_an_unpaid_spatial_reservation(database):
    ready(database)
    assert admit(database)["status"] == "done"
    before = read(database)
    assert move(database, plot="wall_13") == {"status": "refused", "reason": "not_built"}
    assert move(database, plot="wall_129") == {"status": "refused", "reason": "no_such_spot"}
    assert read(database) == before


def test_invalid_effective_rows_roll_back_admission(database):
    import psycopg

    ready(database)
    cells = effective()
    cells[0] = {**cells[0], "x_half": 0.5}
    with (
        pytest.raises(psycopg.errors.RaiseException, match="bad_wall_policy_admit"),
        database.transaction(),
    ):
        admit(database, cells=cells)
    assert read(database) == {"ruleVersion": 0, "capacity": 12, "rows": []}


def test_v1_admission_preserves_instance_health_and_repair_sequence(database):
    from server.tests.island_sql.test_structure_recovery_mutations_sql import (
        OWNER as V1_OWNER,
    )
    from server.tests.island_sql.test_structure_recovery_mutations_sql import (
        seed_v1,
    )

    seed_v1(database)
    as_owner(database)
    database.execute(
        "update public.island_structure_health set rate_numerator=0 where island_owner=%s",
        (V1_OWNER,),
    )
    before = database.execute(
        "select instance_id,hp_units,repair_seq from public.island_structure_health "
        "where island_owner=%s",
        (V1_OWNER,),
    ).fetchone()
    result = call(
        database,
        "select public.island_wall_policy_admit(%s,%s,'[]'::jsonb,%s::jsonb)",
        V1_OWNER,
        V1_OWNER,
        json.dumps(effective()),
    )
    assert result == {"status": "done", "repeat": False}
    as_owner(database)
    assert (
        database.execute(
            "select instance_id,hp_units,repair_seq from public.island_structure_health "
            "where island_owner=%s",
            (V1_OWNER,),
        ).fetchone()
        == before
    )


def test_policy_cannot_be_downgraded_by_service_role_update_or_delete(database):
    ready(database)
    assert admit(database)["status"] == "done"
    as_owner(database)
    assert database.execute(
        "select has_table_privilege('service_role','public.island_wall_policy','update'),"
        "has_table_privilege('service_role','public.island_wall_policy','delete')"
    ).fetchone() == (False, False)


def test_waiting_legacy_move_observes_committed_admission_policy(scratch_server):
    import threading

    import psycopg

    from server.tests.island_sql.test_islands_and_waves_sql import as_server

    owner = UUID(int=999871)
    replies, failures = [], []
    entered = threading.Event()
    uri = scratch_server.get_uri()  # Private Unix socket, never a configured/live URL.
    with psycopg.connect(uri) as setup:
        add_players(setup, owner)
        open_island(setup, owner, "CAS29")
    try:
        with psycopg.connect(uri) as admission:
            as_server(admission)
            assert (
                call(
                    admission,
                    "select public.island_wall_policy_admit(%s,%s,'[]'::jsonb,%s::jsonb)",
                    owner,
                    owner,
                    json.dumps(effective()),
                )["status"]
                == "done"
            )

            def waiting_move():
                try:
                    with psycopg.connect(uri) as moving:
                        as_server(moving)
                        moving.execute("set local lock_timeout='5s'")
                        entered.set()
                        replies.append(
                            call(
                                moving,
                                "select public.island_wall_move(%s,%s,'wall_1',-10,20,"
                                "'[]'::jsonb,0,12)",
                                owner,
                                owner,
                            )
                        )
                except Exception as error:
                    failures.append(type(error).__name__)

            worker = threading.Thread(target=waiting_move)
            worker.start()
            assert entered.wait(5)
            admission.commit()
            worker.join(6)
            assert not worker.is_alive()
        assert not failures
        assert replies == [{"status": "refused", "reason": "busy"}]
    finally:
        with psycopg.connect(uri) as cleanup:
            cleanup.execute("delete from auth.users where id=%s", (owner,))
