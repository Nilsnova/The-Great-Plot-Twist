"""Normal Build honors the displayed wall cell and delegates the checked layout to payment."""

import httpx
import pytest

from server.tests.island_helpers import FRIEND_ID, ISLAND_SETTINGS, PLAYER_ID, World
from server.tests.test_island_move_routes import PLACEMENT
from server.tests.test_island_routes import friend_island

UID = "build-wall-0001"
RPC = "island_build_checked_wall"


def game_at(member, recovery_version, x, z, *, settings=PLACEMENT):
    world = World(settings=settings)
    owner = FRIEND_ID if member else PLAYER_ID
    if member:
        friend_island(world)
    world.database.recovery_policy_versions[owner] = recovery_version
    world.database.layout_rows = [{"plot": "wall_1", "x_half": x, "z_half": z}]
    return world, owner, ({"code": "ISLE-K7Q2M"} if member else {})


@pytest.mark.parametrize("member", [False, True])
@pytest.mark.parametrize("recovery_version", [0, 1])
@pytest.mark.parametrize(
    ("x", "z", "obstacle"),
    [(-32, 0, "a tree"), (-4, 24, "the lantern"), (-7, 8, "the record board")],
)
def test_old_empty_wall_cannot_buy_through_scenery(member, recovery_version, x, z, obstacle):
    world, _, where = game_at(member, recovery_version, x, z)

    answer = world.build(spot="wall_1", kind="wall", actionUid=UID, **where)

    assert answer.status_code == 409
    assert answer.json()["error"] == {
        "code": "place_taken",
        "message": f"That is too close to {obstacle}.",
    }
    for name in (RPC, "islet_build", "island_build"):
        assert world.database.calls(name) == []
    assert world.database.balance == 100
    assert world.database.layout_rows == [{"plot": "wall_1", "x_half": x, "z_half": z}]


def test_saved_overlap_is_refused_while_move_is_disabled():
    world, _, where = game_at(False, 0, -32, 0, settings=ISLAND_SETTINGS)

    response = world.build(spot="wall_1", kind="wall", actionUid=UID, **where)

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "place_taken"
    assert world.database.calls(RPC) == []
    assert world.database.balance == 100


def test_unreadable_layout_refuses_before_payment():
    world, _, where = game_at(True, 0, -37, -2)
    world.database.layout_missing = True

    response = world.build(spot="wall_1", kind="wall", actionUid=UID, **where)

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "layout_unavailable"
    assert world.database.calls(RPC) == []
    assert world.database.balance == 100


@pytest.mark.parametrize("member", [False, True])
@pytest.mark.parametrize("recovery_version", [0, 1])
def test_clear_normal_purchase_passes_the_complete_checked_snapshot(member, recovery_version):
    world, owner, where = game_at(member, recovery_version, -37, -2)
    world.database.layout_rows.append({"plot": "wall_10", "x_half": -19, "z_half": -2})

    result = world.build(spot="wall_1", kind="wall", actionUid=UID, **where)

    assert result.status_code == 200, result.json()
    (sent,) = world.database.calls(RPC)
    assert sent == {
        "p_player_id": PLAYER_ID,
        "p_island_owner": owner,
        "p_plot": "wall_1",
        "p_action_uid": UID,
        "p_price": 10,
        "p_seen": world.database.layout_rows,
        "p_x_half": -37,
        "p_z_half": -2,
        "p_materialize": False,
        "p_recovery_version": recovery_version,
        "p_hidden_extra_plots": [f"cannon_{n}" for n in range(8, 12)] if recovery_version else [],
        "p_existing_extra_spots": False,
    }


@pytest.mark.parametrize("member", [False, True])
def test_previously_paid_uid_reconciles_even_if_the_old_cell_is_blocked(member):
    world, _, where = game_at(member, 1, -32, 0)
    # A receipt outlives the structure, for example after demolition.
    world.database.ledger_refs.add(("building_purchase", f"island:{UID}"))

    retry = world.build(spot="wall_1", kind="wall", actionUid=UID, **where)

    assert retry.status_code == 200
    assert world.database.calls(RPC) == []
    assert world.database.calls("islet_build") == []
    assert world.database.calls("island_build") == []


@pytest.mark.parametrize(
    ("reply", "status", "code"),
    [
        ({"status": "refused", "reason": "layout_changed"}, 409, "busy"),
        ({"status": "refused", "reason": "not_member"}, 403, "not_member"),
        (httpx.Response(404, json={"code": "PGRST202"}), 502, "database_error"),
    ],
)
def test_guard_error_never_falls_back_to_unchecked_purchase(reply, status, code):
    world, _, where = game_at(True, 0, -37, -2)
    world.database.paid_replies[RPC] = reply

    response = world.build(spot="wall_1", kind="wall", actionUid=UID, **where)

    assert response.status_code == status
    assert response.json()["error"]["code"] == code
    assert len(world.database.calls(RPC)) == 1
    assert world.database.calls("island_build") == []
    assert world.database.calls("islet_build") == []
