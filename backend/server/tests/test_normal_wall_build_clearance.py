"""Fresh ordinary wall purchases use checked geometry and fenced SQL overloads, never cleanup."""

from dataclasses import replace

import httpx
import pytest

from server.flags import parse_flags
from server.tests.island_helpers import FRIEND_ID, ISLAND_SETTINGS, PLAYER_ID, World
from server.tests.test_island_routes import friend_island


def game_at(policy, friend=False, x=-16, z=0):
    game = World(settings=replace(ISLAND_SETTINGS, flags=parse_flags("islands,placement")))
    if friend:
        friend_island(game)
    owner = FRIEND_ID if friend else PLAYER_ID
    game.database.wall_policies[owner] = {"ruleVersion": policy, "capacity": 128 if policy else 12}
    game.database.layout_rows_by_owner[owner] = [
        {"plot": "wall_1", "x_half": round(x * 2), "z_half": round(z * 2)}
    ]
    return game, owner, ({"code": "ISLE-K7Q2M"} if friend else {})


@pytest.mark.parametrize("policy", [0, 1])
@pytest.mark.parametrize("friend", [False, True])
@pytest.mark.parametrize("at", [(-16, 0), (-2, 12)])
def test_fresh_ordinary_wall_refuses_tree_or_prop_before_paid_rpc(policy, friend, at):
    game, _, code = game_at(policy, friend, *at)
    response = game.build(spot="wall_1", kind="wall", **code)
    assert response.status_code == 409 and response.json()["error"]["code"] == "place_taken"
    assert game.database.calls("islet_build") == game.database.calls("island_build") == []
    assert game.database.balance == 100


@pytest.mark.parametrize("policy", [0, 1])
@pytest.mark.parametrize("friend", [False, True])
def test_safe_wall_purchase_sends_checked_coordinate_and_complete_snapshot(policy, friend):
    game, owner, code = game_at(policy, friend, -18.5, -1)
    response = game.build(spot="wall_1", kind="wall", **code)
    assert response.status_code == 200
    (call,) = game.database.calls("island_build" if friend else "islet_build")
    assert (call["p_x_half"], call["p_z_half"]) == (-37, -2)
    assert call["p_seen"] == game.database.layout_rows_by_owner[owner]
    assert call["p_expected_rule_version"] == policy
    assert call["p_expected_capacity"] == (128 if policy else 12)


@pytest.mark.parametrize("policy", [0, 1])
@pytest.mark.parametrize("friend", [False, True])
def test_old_uid_replay_is_answered_before_new_obstruction_validation(policy, friend):
    game, _, code = game_at(policy, friend)
    game.database.ledger_refs.add(("building_purchase", "island:click-0001"))
    response = game.build(spot="wall_1", kind="wall", **code)
    assert response.status_code == 200
    assert game.database.calls("islet_build") == game.database.calls("island_build") == []
    assert game.database.balance == 100


@pytest.mark.parametrize("friend", [False, True])
def test_racing_layout_refusal_is_plain_and_does_not_fall_back(friend):
    game, _, code = game_at(1, friend, -18.5, -1)
    refusal = {"status": "refused", "reason": "busy"}
    if friend:
        game.database.paid_replies["island_build"] = refusal
    else:
        game.database.build_reply = refusal
    response = game.build(spot="wall_1", kind="wall", **code)
    assert response.status_code == 409 and response.json()["error"]["code"] == "busy"
    assert len(game.database.calls("island_build" if friend else "islet_build")) == 1


def test_missing_guarded_overload_fails_closed_without_legacy_fallback():
    game, _, code = game_at(1, False, -18.5, -1)
    game.database.build_reply = httpx.Response(404, json={"code": "PGRST202"})
    response = game.build(spot="wall_1", kind="wall", **code)
    assert response.status_code == 502
    assert len(game.database.calls("islet_build")) == 1
