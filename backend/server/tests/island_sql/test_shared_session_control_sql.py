"""Real canonical controller/provider checks; never install an authority fixture.

Run with CASE_PG_SCRATCH=1 and pgserver/psycopg. All production migrations are
applied twice to local Unix-socket PostgreSQL. Synthetic actors use real hooks.
"""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest

psycopg = pytest.importorskip("psycopg")

from psycopg.types.json import Jsonb  # noqa: E402

from server.island.catalogue import load_island  # noqa: E402
from server.island.personal_captain import configuration  # noqa: E402
from server.tests.island_sql.test_island_treasury_sql import keys, ready, rpc  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    as_owner,
    as_server,
)
from server.tests.island_sql.test_shared_realtime_membership_sql import allowed  # noqa: E402


def prepared(database):
    owner, member, outsider, treasury = ready(database)
    for actor in (owner, member):
        as_server(database)
        value = rpc(
            database,
            "personal_captain_initialize",
            actor,
            owner,
            keys(treasury)[1],
            Jsonb(configuration(load_island())),
        )
        assert value["captain"]["progressionVersion"] == 1
    return owner, member, outsider, treasury


def attach(database, actor, owner, treasury, session, generation=0, uid=None):
    as_server(database)
    return rpc(
        database,
        "shared_session_attach",
        actor,
        owner,
        keys(treasury)[1],
        session,
        generation,
        uid or uuid4().hex,
    )


def authority(database, actor, owner):
    as_server(database)
    return rpc(database, "island_economy_authority", actor, owner)


def test_real_provider_exact_six_fields_and_no_read_side_effects(database):
    owner, member, outsider, _ = prepared(database)
    for actor, is_member in ((owner, True), (member, True), (outsider, False)):
        assert authority(database, actor, owner) == {
            "actor_id": str(actor),
            "island_owner": str(owner),
            "is_member": is_member,
            "reservation_id": None,
            "session_leader_id": None,
            "actor_assignment_wave_id": None,
        }
    as_owner(database)
    assert (
        database.execute(
            "select count(*) from public.shared_session_controls where island_owner=%s", (owner,)
        ).fetchone()[0]
        == 0
    )
    assert (
        database.execute(
            "select count(*) from public.island_wave_accounting where island_owner=%s", (owner,)
        ).fetchone()[0]
        == 0
    )


def test_one_global_controller_and_generation_fences_duplicate_tabs(database):
    owner, _, _, treasury = prepared(database)
    session = uuid4()
    first = attach(database, owner, owner, treasury, session, uid="attach_001")
    assert first["status"] == "done" and first["session"]["connectionGeneration"] == "1"
    assert attach(database, owner, owner, treasury, uuid4())["reason"] == "controller_held"
    next_connection = attach(database, owner, owner, treasury, session, 1, "attach_002")
    assert next_connection["session"]["connectionGeneration"] == "2"
    assert attach(database, owner, owner, treasury, session, 1, "attach_002") == next_connection
    assert attach(database, owner, owner, treasury, session, 1)["reason"] == "stale_controller"
    as_server(database)
    assert (
        rpc(database, "shared_session_heartbeat", owner, owner, keys(treasury)[1], session, 1)[
            "reason"
        ]
        == "stale_controller"
    )
    assert (
        rpc(database, "shared_session_heartbeat", owner, owner, keys(treasury)[1], session, 2)[
            "status"
        ]
        == "done"
    )


def test_leader_grace_deadline_and_oldest_active_successor(database):
    owner, member, _, treasury = prepared(database)
    owner_session, member_session = uuid4(), uuid4()
    attach(database, owner, owner, treasury, owner_session)
    attach(database, member, owner, treasury, member_session)
    assert authority(database, member, owner)["session_leader_id"] == str(owner)
    as_server(database)
    assert (
        rpc(
            database, "shared_session_disconnect", owner, owner, keys(treasury)[1], owner_session, 1
        )["status"]
        == "done"
    )
    assert authority(database, member, owner)["session_leader_id"] == str(owner)
    as_owner(database)
    database.execute(
        "update public.shared_session_controls set grace_until=clock_timestamp() "
        "where player_id=%s",
        (owner,),
    )
    as_server(database)
    assert rpc(database, "shared_session_process_due", 20)["status"] == "done"
    assert authority(database, member, owner)["session_leader_id"] == str(member)


def test_departure_revokes_without_grace_and_rotates_topic(database):
    owner, member, _, treasury = prepared(database)
    session = uuid4()
    attach(database, member, owner, treasury, session)
    as_server(database)
    before = rpc(database, "shared_session_read", member, owner)
    as_owner(database)
    database.execute("select public.shared_session_rotate_topic_locked(%s)", (owner,))
    as_server(database)
    rotated = rpc(database, "shared_session_read", member, owner)
    assert rotated["session"]["place"] != before["session"]["place"]
    assert len(rotated["session"]["place"]) == 35
    as_owner(database)
    database.execute(
        "select public.shared_session_withdraw_locked(%s,null,'leave',clock_timestamp())", (member,)
    )
    as_server(database)
    assert (
        rpc(database, "shared_session_heartbeat", member, owner, keys(treasury)[1], session, 1)[
            "reason"
        ]
        == "stale_controller"
    )


def test_missing_or_tombstoned_owner_never_gets_an_authority_object(database):
    owner, _, outsider, _ = prepared(database)
    as_owner(database)
    database.execute(
        "insert into public.island_deleted_player_dispositions(player_id,deleted_at) "
        "values(%s,clock_timestamp())",
        (owner,),
    )
    for actor in (owner, outsider):
        database.execute("savepoint inactive")
        if actor == outsider:
            as_owner(database)
            database.execute("delete from auth.users where id=%s", (actor,))
        as_server(database)
        with pytest.raises(psycopg.errors.InsufficientPrivilege, match="actor_inactive"):
            rpc(database, "island_economy_authority", actor, owner)
        database.execute("rollback to savepoint inactive")


def test_controller_storage_and_private_hooks_have_no_direct_browser_rights(database):
    for table in ("shared_session_controls", "shared_session_settings", "shared_session_slots"):
        assert database.execute(
            "select relrowsecurity from pg_class where oid=%s::regclass", (f"public.{table}",)
        ).fetchone() == (True,)
        for role in ("anon", "authenticated", "service_role"):
            assert not database.execute(
                "select has_table_privilege(%s,%s,'insert,update,delete')",
                (role, f"public.{table}"),
            ).fetchone()[0]
    for role in ("anon", "authenticated"):
        assert not database.execute(
            "select has_function_privilege(%s,"
            "'public.island_economy_authority(uuid,uuid)','execute')",
            (role,),
        ).fetchone()[0]


def test_silent_loss_expires_at_last_proof_plus_sixty_without_detection_extension(database):
    owner, member, _, treasury = prepared(database)
    attach(database, owner, owner, treasury, uuid4())
    attach(database, member, owner, treasury, uuid4())
    as_owner(database)
    database.execute(
        "update public.shared_session_controls "
        "set last_seen=clock_timestamp()-interval '60 seconds',"
        "connected_until=clock_timestamp()-interval '45 seconds' where player_id=%s",
        (owner,),
    )
    as_server(database)
    rpc(database, "shared_session_process_due", 20)
    assert authority(database, member, owner)["session_leader_id"] == str(member)
    as_owner(database)
    assert database.execute(
        "select released_at is not null,island_owner from public.shared_session_controls "
        "where player_id=%s",
        (owner,),
    ).fetchone() == (True, None)


def test_disconnect_deadline_and_proof_time_cannot_be_extended_by_late_callbacks(database):
    owner, _, _, treasury = prepared(database)
    session = uuid4()
    attach(database, owner, owner, treasury, session)
    as_server(database)
    rpc(database, "shared_session_disconnect", owner, owner, keys(treasury)[1], session, 1)
    as_owner(database)
    deadline = database.execute(
        "select grace_until,last_seen from public.shared_session_controls where player_id=%s",
        (owner,),
    ).fetchone()
    as_server(database)
    rpc(database, "shared_session_disconnect", owner, owner, keys(treasury)[1], session, 1)
    assert (
        rpc(database, "shared_session_heartbeat", owner, owner, keys(treasury)[1], session, 1)[
            "reason"
        ]
        == "reconnect_required"
    )
    assert (
        rpc(database, "shared_session_heartbeat", owner, owner, keys(treasury)[1], uuid4(), 1)[
            "reason"
        ]
        == "stale_controller"
    )
    as_owner(database)
    assert (
        database.execute(
            "select grace_until,last_seen from public.shared_session_controls where player_id=%s",
            (owner,),
        ).fetchone()
        == deadline
    )


def test_metadata_never_discloses_another_tabs_controller_identity(database):
    owner, _, _, treasury = prepared(database)
    session = uuid4()
    attach(database, owner, owner, treasury, session)
    as_server(database)
    spectator = rpc(database, "shared_session_read", owner, owner)["session"]
    assert spectator["sessionId"] is None and spectator["connectionGeneration"] is None
    assert spectator["isController"] is False
    controller = rpc(database, "shared_session_read", owner, owner, session, 1)["session"]
    assert controller["sessionId"] == str(session) and controller["isController"] is True


def test_racing_tabs_create_one_lease_and_refusal_does_not_burn_root(database, scratch_server):
    owner, _, _, treasury = prepared(database)
    database.commit()
    barrier = Barrier(2)

    def connect(index):
        with psycopg.connect(scratch_server.get_uri()) as connection:
            barrier.wait(timeout=5)
            result = attach(connection, owner, owner, treasury, uuid4(), uid=f"racing_tab_{index}")
            connection.commit()
            return result

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(connect, (1, 2)))
    assert sorted(row["status"] for row in results) == ["done", "refused"]
    assert next(row for row in results if row["status"] == "refused")["reason"] == "controller_held"
    as_owner(database)
    assert (
        database.execute(
            "select count(*) from public.shared_session_controls where player_id=%s", (owner,)
        ).fetchone()[0]
        == 1
    )
    assert (
        database.execute(
            "select count(*) from public.island_economy_operations "
            "where actor_id=%s and domain_action='session_attach'",
            (owner,),
        ).fetchone()[0]
        == 1
    )


def test_released_controller_counter_never_reuses_an_old_generation(database):
    owner, _, _, treasury = prepared(database)
    session = uuid4()
    attach(database, owner, owner, treasury, session)
    as_owner(database)
    database.execute(
        "select public.shared_session_withdraw_locked(%s,null,'leave',clock_timestamp())", (owner,)
    )
    returned = attach(database, owner, owner, treasury, session, 0)
    assert returned["session"]["connectionGeneration"] == "2"
    as_server(database)
    assert (
        rpc(database, "shared_session_disconnect", owner, owner, keys(treasury)[1], session, 1)[
            "reason"
        ]
        == "stale_controller"
    )
    assert (
        rpc(database, "shared_session_heartbeat", owner, owner, keys(treasury)[1], session, 2)[
            "status"
        ]
        == "done"
    )


@pytest.mark.parametrize("operation", ["select", "insert"])
def test_rotated_channel_uses_current_nonce_and_active_membership(database, operation):
    owner, member, outsider, _ = prepared(database)
    as_server(database)
    old_place = rpc(database, "shared_session_read", member, owner)["session"]["place"]
    old_topic = f"live:place:{old_place}:1"
    assert allowed(database, member, old_topic, operation)
    assert not allowed(database, outsider, old_topic, operation)
    as_owner(database)
    database.execute("select public.shared_session_rotate_topic_locked(%s)", (owner,))
    as_server(database)
    new_place = rpc(database, "shared_session_read", member, owner)["session"]["place"]
    assert not allowed(database, member, old_topic, operation)
    assert allowed(database, member, f"live:place:{new_place}:1", operation)
    as_server(database)
    rpc(database, "game_leave", member, owner)
    assert not allowed(database, member, f"live:place:{new_place}:1", operation)
