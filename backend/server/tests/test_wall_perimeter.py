"""Home wall placement and purchases through the ordinary API with an available layout."""

from dataclasses import replace

import pytest

from server.island import layout
from server.tests.island_helpers import FRIEND_ID, PLAYER_ID, World
from server.tests.test_island_move_routes import move, move_calls, spot
from server.tests.test_normal_wall_purchase import RPC

SOCKETS = (
    (-17.0, -1.5),
    (-17.0, -3.5),
    (-15.5, -8.0),
    (-14.5, -10.0),
    (-10.5, -14.0),
    (-8.5, -15.5),
    (-7.0, -17.5),
    (-5.0, -17.0),
    (-3.0, -18.0),
    (-1.0, -18.0),
    (1.0, -19.0),
    (3.0, -18.5),
    (5.0, -18.0),
    (7.0, -17.5),
)


@pytest.fixture
def perimeter(monkeypatch):
    old = layout.load_layout()
    value = replace(
        old,
        wall_perimeter=frozenset(SOCKETS),
        wall_defaults={f"wall_{i}": cell for i, cell in enumerate(SOCKETS[:12], 1)},
    )
    layout.check_file(value, layout.CONTENT_FILE)
    monkeypatch.setattr(
        layout,
        "island_layout",
        lambda more=False: layout.with_extra_spots(value) if more else value,
    )
    return value


@pytest.fixture
def world(perimeter):
    return World()


def xy(answer, spot_id):
    item = spot(answer, spot_id)
    return item["x"], item["z"]


def row(spot_id, where):
    x, z = where
    return {"plot": spot_id, "x_half": round(2 * x), "z_half": round(2 * z)}


def test_shipped_perimeter_reserves_dry_nonoverlapping_sockets_for_the_fresh_island():
    rules = layout.island_layout(more=True)
    positions = layout.positions_of(rules, {}, set())
    assert len(rules.wall_perimeter) > len(rules.wall_defaults) == 12
    for spot_id, where in rules.wall_defaults.items():
        assert positions[spot_id] == where
        layout.check_move(rules, positions, spot_id, *where)


def test_only_a_perimeter_socket_can_be_moved_to(world):
    answer = world.island().json()
    assert xy(answer, "wall_1") == SOCKETS[0]
    assert xy(answer, "wall_2") == SOCKETS[1]
    assert move(world, spot="wall_1", x=-12, z=0.5).json()["error"] == {
        "code": "off_path",
        "message": layout.WALL_EDGE_MESSAGE,
    }
    assert move(world, spot="wall_1", x=-16.5, z=-1.5).json()["error"]["code"] == "off_path"
    assert (
        move(world, spot="wall_1", x=SOCKETS[1][0], z=SOCKETS[1][1]).json()["error"]["code"]
        == "place_taken"
    )
    assert move_calls(world) == []
    x, z = SOCKETS[-1]
    moved = move(world, spot="wall_1", x=x, z=z)
    assert moved.status_code == 200
    assert xy(moved.json(), "wall_1") == (x, z)
    assert world.database.layout_rows == [row("wall_1", (x, z))]


def test_paid_fixed_and_moved_legacy_walls_keep_their_current_places(world):
    world.database.buildings[PLAYER_ID] = [
        {"plot": "wall_1", "building_type": "wall", "level": 3},
        {"plot": "wall_11", "building_type": "wall", "level": 2},
    ]
    world.database.layout_rows = [row("wall_11", (-12, 0.5))]
    answer = world.island().json()
    assert (xy(answer, "wall_1"), xy(answer, "wall_11")) == ((-18.5, -1), (-12, 0.5))
    assert spot(answer, "wall_1")["level"] == 3
    assert xy(answer, "wall_2") == SOCKETS[1]
    same = move(world, spot="wall_1", x=-18.5, z=-1)
    assert same.status_code == 200
    assert move_calls(world) == []


def test_unbuilt_legacy_marker_is_passed_to_atomic_purchase_and_reread(world):
    saved = row("wall_1", (-12, 0.5))
    target = row("wall_1", SOCKETS[0])
    world.database.layout_rows = [saved]
    assert xy(world.island().json(), "wall_1") == SOCKETS[0]
    response = world.build(spot="wall_1", kind="wall")
    assert response.status_code == 200, response.json()
    (sent,) = world.database.calls(RPC)
    assert sent["p_seen"] == [saved]
    assert (sent["p_x_half"], sent["p_z_half"]) == (target["x_half"], target["z_half"])
    assert sent["p_materialize"] is True
    assert move_calls(world) == []
    assert world.database.calls("islet_build") == []
    # The PostgreSQL RPC owns the write and receipt. Reflect both in the HTTP fixture.
    world.database.layout_rows = [target]
    world.database.buildings[PLAYER_ID] = [{"plot": "wall_1", "building_type": "wall"}]
    world.database.ledger_refs.add(("building_purchase", "island:click-0001"))
    assert xy(world.build(spot="wall_1", kind="wall").json(), "wall_1") == SOCKETS[0]
    assert len(world.database.calls(RPC)) == 1


def test_friend_purchase_sends_the_selected_socket_with_the_owner_and_payer(world):
    world.database.islands["K7Q2M"] = {
        "player_id": FRIEND_ID,
        "code": "K7Q2M",
        "wave_best": 3,
        "flags": 3,
    }
    world.database.games.add(FRIEND_ID, PLAYER_ID)
    response = world.build(spot="wall_2", kind="wall", code="ISLE-K7Q2M")
    assert response.status_code == 200, response.json()
    (sent,) = world.database.calls(RPC)
    assert sent["p_island_owner"] == FRIEND_ID
    assert sent["p_player_id"] == PLAYER_ID
    assert (sent["p_x_half"], sent["p_z_half"]) == tuple(round(n * 2) for n in SOCKETS[1])
    assert sent["p_materialize"] is True
    assert move_calls(world) == []
    assert world.database.calls("island_build") == []


@pytest.mark.parametrize(
    ("reason", "code"), [("layout_changed", "busy"), ("wave_running", "wave_running")]
)
def test_failed_atomic_purchase_keeps_the_layout_and_balance(world, reason, code):
    world.database.paid_replies[RPC] = {"status": "refused", "reason": reason}
    response = world.build(spot="wall_1", kind="wall")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == code
    assert len(world.database.calls(RPC)) == 1
    assert move_calls(world) == []
    assert world.database.calls("islet_build") == []
    assert world.database.layout_rows == []
    assert world.database.balance == 100


def test_missing_layout_table_leaves_legacy_view_and_refuses_purchase(world):
    world.database.layout_missing = True
    old = world.island().json()
    assert xy(old, "wall_1") == (-18.5, -1)
    response = world.build(spot="wall_1", kind="wall")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "layout_unavailable"
    assert world.database.calls(RPC) == []


def test_an_old_island_with_no_free_socket_cannot_buy_a_wall(world, perimeter):
    non_wall = [spot.spot for spot in perimeter.spots if spot.slot != "wall"]
    reserved = list(zip(non_wall, SOCKETS[: len(non_wall)], strict=True))
    saved = list(
        zip(("wall_2", "wall_3", "wall_4", "wall_5"), SOCKETS[len(non_wall) :], strict=True)
    )
    world.database.layout_rows = [row(spot_id, where) for spot_id, where in reserved + saved]
    world.database.buildings[PLAYER_ID] = [
        {"plot": spot_id, "building_type": "wall"} for spot_id, _ in saved
    ]
    assert xy(world.island().json(), "wall_1") == (None, None)
    response = world.build(spot="wall_1", kind="wall")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "place_taken"
    assert move_calls(world) == []
    assert world.database.calls(RPC) == []
