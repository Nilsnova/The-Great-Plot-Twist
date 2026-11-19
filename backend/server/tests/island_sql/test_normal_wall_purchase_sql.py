"""HTTP and database proof for normal wall purchases on the disposable local database."""

import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from uuid import UUID

import httpx
import pytest
from fastapi.testclient import TestClient

psycopg = pytest.importorskip("psycopg")

from psycopg.types.json import Jsonb  # noqa: E402

from server.app import create_app  # noqa: E402
from server.auth import PlayerVerifier  # noqa: E402
from server.flags import parse_flags  # noqa: E402
from server.island import layout  # noqa: E402
from server.tests.helpers import CONFIGURED_SETTINGS, FakeClock  # noqa: E402
from server.tests.island_helpers import CALM, FakeWeather  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    add_players,
    as_owner,
    as_server,
    balance,
    call,
    ledger,
    open_island,
)
from server.tests.island_sql.test_structure_recovery_mutations_sql import template  # noqa: E402
from server.tests.island_sql.test_structure_repair_sql import (  # noqa: E402
    ISLAND_CODE,
    MEMBER,
    OWNER,
    seed_recovery,
)
from server.tests.structure_recovery_pg import ScratchRecoveryAdmin  # noqa: E402

UID = "wall-purchase-0454"


def ready(database, version):
    if version == 1:
        epoch, _ = seed_recovery(database, structure_rows=())
        as_server(database)
        # Policy refresh on the member's legacy purchase RPC needs a prior v1 wave manifest.
        database.execute(
            "insert into public.recovery_wave_states "
            "(wave_id,island_owner,reset_epoch,recovery_version,wave_protocol,initial_snapshot) "
            "values (%s,%s,%s,1,2,%s)",
            (UUID(int=45409000), OWNER, epoch, Jsonb(template())),
        )
    else:
        add_players(database, OWNER, MEMBER)
        open_island(database, OWNER, ISLAND_CODE)
        open_island(database, MEMBER, "RPQ26")
        joined = call(database, "select public.game_join(%s, %s, 10)", MEMBER, OWNER)
        assert joined["status"] == "joined"


def client_for(database, actor):
    settings = replace(
        CONFIGURED_SETTINGS, flags=parse_flags("islands,placement,structure_recovery")
    )

    def login(request):
        assert request.headers["authorization"] == "Bearer test.wall.signature"
        return httpx.Response(200, json={"id": str(actor), "is_anonymous": False})

    verifier = PlayerVerifier(settings, transport=httpx.MockTransport(login), clock=FakeClock())
    admin = ScratchRecoveryAdmin(database)
    client = TestClient(
        create_app(settings, verifier, admin, weather_source=FakeWeather(CALM)),
        headers={"Authorization": "Bearer test.wall.signature"},
    )
    return client, admin


def purchase(client, actor):
    body = {"spot": "wall_1", "kind": "wall", "actionUid": UID}
    if actor == MEMBER:
        body["code"] = f"ISLE-{ISLAND_CODE}"
    return client.post("/api/island/build", json=body)


def set_cell(database, raw):
    as_owner(database)
    database.execute(
        "insert into public.island_layout (island_owner, plot, x_half, z_half, moved_by) "
        "values (%s, 'wall_1', %s, %s, %s)",
        (OWNER, *raw, OWNER),
    )


def cells(database, owner=OWNER):
    return database.execute(
        "select plot, x_half, z_half, moved_by, moved_at from public.island_layout "
        "where island_owner=%s order by plot",
        (owner,),
    ).fetchall()


def built(database, owner=OWNER):
    return database.execute(
        "select plot, level from public.islet_buildings where player_id=%s and plot='wall_1'",
        (owner,),
    ).fetchall()


@pytest.fixture
def legacy_wall_lanes(monkeypatch):
    legacy = replace(layout.load_layout(), wall_perimeter=frozenset(), wall_defaults={})
    monkeypatch.setattr(
        layout,
        "island_layout",
        lambda more=False: layout.with_extra_spots(legacy) if more else legacy,
    )


@pytest.mark.parametrize("actor", [OWNER, MEMBER], ids=["owner", "member"])
@pytest.mark.parametrize("version", [0, 1])
def test_http_rejects_old_effective_overlap_without_writes(
    database, actor, version, legacy_wall_lanes
):
    ready(database, version)
    # Raw (-3.5, 4) is clear of the board. The generated lane view rolls it to (-3, 3).
    set_cell(database, (-7, 8))
    before = cells(database)
    client, admin = client_for(database, actor)
    with client:
        response = purchase(client, actor)
    assert response.status_code == 409, (response.json(), admin.last_database_error)
    assert response.json()["error"] == {
        "code": "place_taken",
        "message": "That is too close to the record board.",
    }
    assert cells(database) == before
    assert built(database) == []
    assert balance(database, actor) == 100
    assert ledger(database, actor, "building_purchase") == []


@pytest.mark.parametrize("actor", [OWNER, MEMBER], ids=["owner", "member"])
@pytest.mark.parametrize("version", [0, 1])
@pytest.mark.parametrize(
    "raw", [None, (-37, -2), (-26, -24)], ids=["default", "matching", "settled"]
)
def test_production_http_charges_once_and_only_writes_a_changed_cell(
    database, actor, version, raw, legacy_wall_lanes
):
    ready(database, version)
    if raw:
        set_cell(database, raw)
    before = cells(database)
    stored = {"wall_1": tuple(value / 2 for value in raw)} if raw else {}
    expected = layout.positions_of(layout.island_layout(), stored)["wall_1"]
    client, admin = client_for(database, actor)
    with client:
        response = purchase(client, actor)
        assert response.status_code == 200, (response.json(), admin.last_database_error)
        assert response.json()["coins"] == 90
        wall = next(spot for spot in response.json()["spots"] if spot["id"] == "wall_1")
        assert (wall["x"], wall["z"]) == expected
        assert purchase(client, actor).status_code == 200
    assert built(database) == [("wall_1", 1)]
    assert balance(database, actor) == 90
    assert ledger(database, actor, "building_purchase") == [(-10, f"island:{UID}")]
    if actor == MEMBER:
        assert balance(database, OWNER) == 100
        if version == 1:
            assert (
                call(
                    database,
                    "select hp_units from public.island_structure_health "
                    "where island_owner=%s and spot='wall_1'",
                    OWNER,
                )
                == 1_000_000
            )
    if raw == (-26, -24):
        x_half, z_half = (round(value * 2) for value in expected)
        assert cells(database)[0][:4] == ("wall_1", x_half, z_half, actor)
    else:
        assert cells(database) == before


@pytest.mark.parametrize("actor", [OWNER, MEMBER], ids=["owner", "member"])
@pytest.mark.parametrize("version", [0, 1])
def test_atomic_purchase_persists_the_displayed_perimeter_cell(database, actor, version):
    ready(database, version)
    set_cell(database, (-24, 1))  # an empty legacy slot, away from the perimeter
    expected = layout.island_layout().wall_defaults["wall_1"]
    client, admin = client_for(database, actor)
    with client:
        response = purchase(client, actor)
        assert response.status_code == 200, (response.json(), admin.last_database_error)
        wall = next(spot for spot in response.json()["spots"] if spot["id"] == "wall_1")
        assert wall["built"] is True
        assert (wall["x"], wall["z"]) == expected
        assert purchase(client, actor).status_code == 200
    assert built(database) == [("wall_1", 1)]
    assert [row[:4] for row in cells(database)] == [
        ("wall_1", *(round(value * 2) for value in expected), actor)
    ]
    assert balance(database, actor) == 90
    assert ledger(database, actor, "building_purchase") == [(-10, f"island:{UID}")]


def checked_sql(connection, actor, owner=OWNER, expected=None, materialize=False):
    as_server(connection)
    return call(
        connection,
        "select public.island_build_checked_wall(%s,%s,'wall_1',%s,10,%s,-37,-2,%s,0,'{}',false)",
        actor,
        owner,
        UID,
        Jsonb([] if expected is None else expected),
        materialize,
    )


def test_checked_purchase_is_service_only(database):
    signature = (
        "public.island_build_checked_wall(uuid,uuid,text,text,integer,jsonb,integer,integer,"
        "boolean,integer,text[],boolean)"
    )
    for role in ("anon", "authenticated", "service_role"):
        permitted = call(
            database, "select has_function_privilege(%s,%s,'execute')", role, signature
        )
        assert permitted == (role == "service_role")


@pytest.mark.parametrize("actor", [OWNER, MEMBER], ids=["owner", "member"])
def test_paid_repeat_keeps_old_receipt_after_layout_moves(database, actor):
    ready(database, 0)
    assert checked_sql(database, actor)["repeat"] is False
    set_cell(database, (-32, 0))
    before = cells(database)
    assert checked_sql(database, actor, materialize=True) == {
        "status": "done",
        "balance": 90,
        "repeat": True,
    }
    assert cells(database) == before
    assert ledger(database, actor, "building_purchase") == [(-10, f"island:{UID}")]


def test_stale_hidden_tower_presence_cannot_persist_a_wall(database):
    ready(database, 1)
    assert call(
        database,
        "select public.island_build_checked_wall(%s,%s,'wall_1',%s,10,'[]',-37,-2,"
        "true,1,array['cannon_8'],true)",
        MEMBER,
        OWNER,
        UID,
    ) == {"status": "refused", "reason": "layout_changed"}
    assert cells(database) == []
    assert built(database) == []
    assert balance(database, MEMBER) == 100
    assert ledger(database, MEMBER, "building_purchase") == []


@pytest.mark.parametrize("actor", [OWNER, MEMBER], ids=["owner", "member"])
def test_insufficient_funds_preserves_old_layout_for_both_internal_payment_paths(database, actor):
    ready(database, 0)
    set_cell(database, (-26, -24))
    before = cells(database)
    as_owner(database)
    database.execute("update public.wallets set balance=5 where player_id=%s", (actor,))
    checked = [{"plot": "wall_1", "x_half": -26, "z_half": -24}]
    if actor == OWNER:
        with (
            pytest.raises(psycopg.errors.RaiseException, match="insufficient_funds"),
            database.transaction(),
        ):
            checked_sql(database, actor, expected=checked, materialize=True)
    else:
        refused = checked_sql(database, actor, expected=checked, materialize=True)
        assert refused["reason"] == "insufficient_funds"
    assert cells(database) == before
    assert built(database) == []
    assert balance(database, actor) == 5
    assert ledger(database, actor, "building_purchase") == []


def test_member_purchase_waits_for_owner_move_then_refuses_its_stale_snapshot(scratch_server):
    host, member = UUID(int=45408001), UUID(int=45408002)
    uri = scratch_server.get_uri()  # private local Unix socket from the test fixture
    with psycopg.connect(uri) as setup:
        add_players(setup, host, member)
        open_island(setup, host, "TMP54")
        open_island(setup, member, "TMP55")
        joined = call(setup, "select public.game_join(%s, %s, 10)", member, host)
        assert joined["status"] == "joined"
    with (
        psycopg.connect(uri) as mover,
        psycopg.connect(uri) as buyer,
        psycopg.connect(uri, autocommit=True) as observer,
        ThreadPoolExecutor(max_workers=1) as worker,
    ):
        as_server(mover)
        assert (
            call(mover, "select public.island_move(%s,%s,'wall_6',-24,-2,'[]')", host, host)[
                "status"
            ]
            == "done"
        )
        buyer.execute("set statement_timeout = '5s'")
        pending = worker.submit(checked_sql, buyer, member, host)
        try:
            deadline = time.monotonic() + 3
            while time.monotonic() < deadline:
                if (
                    call(
                        observer,
                        "select wait_event_type from pg_stat_activity where pid=%s",
                        buyer.info.backend_pid,
                    )
                    == "Lock"
                ):
                    break
                assert not pending.done()
                time.sleep(0.02)
            else:
                pytest.fail("the purchase did not wait on the in-progress owner Move")
        finally:
            mover.commit()
        assert pending.result(timeout=5) == {"status": "refused", "reason": "layout_changed"}
        assert built(buyer, host) == []
        assert balance(buyer, member) == 100
        assert ledger(buyer, member, "building_purchase") == []
        assert [row[:3] for row in cells(buyer, host)] == [("wall_6", -24, -2)]


@pytest.mark.parametrize("scoped_actor", [False, True], ids=["target", "payer"])
def test_member_purchase_waits_before_locking_the_payer_wallet(scratch_server, scoped_actor):
    first_id = 45408100 + 2 * scoped_actor
    host, member = UUID(int=first_id), UUID(int=first_id + 1)
    uri = scratch_server.get_uri()
    with psycopg.connect(uri) as setup:
        add_players(setup, host, member)
        open_island(setup, host, "TMP56" if scoped_actor else "TMP58")
        open_island(setup, member, "TMP57" if scoped_actor else "TMP59")
        assert call(setup, "select public.game_join(%s,%s,10)", member, host)["status"] == "joined"

    with (
        psycopg.connect(uri) as scoped_writer,
        psycopg.connect(uri) as buyer,
        psycopg.connect(uri, autocommit=True) as observer,
        ThreadPoolExecutor(max_workers=1) as worker,
    ):
        call(
            scoped_writer,
            "select public.island_treasury_lock_scope(%s)",
            member if scoped_actor else host,
        )
        buyer.execute("set statement_timeout = '5s'")
        pending = worker.submit(checked_sql, buyer, member, host)
        try:
            deadline = time.monotonic() + 3
            while time.monotonic() < deadline:
                blockers = call(observer, "select pg_blocking_pids(%s)", buyer.info.backend_pid)
                if scoped_writer.info.backend_pid in blockers:
                    break
                assert not pending.done()
                time.sleep(0.02)
            else:
                pytest.fail("the checked wall purchase did not wait for the economy scope")
            assert (
                call(
                    scoped_writer,
                    "select balance from public.wallets where player_id=%s for update nowait",
                    member,
                )
                == 100
            )
        finally:
            scoped_writer.commit()

        assert pending.result(timeout=5) == {
            "status": "done",
            "balance": 90,
            "repeat": False,
            "level": 1,
        }
        assert ledger(buyer, member, "building_purchase") == [(-10, f"island:{UID}")]
