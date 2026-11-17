"""Receipt-first HTTP authority/retry checks; atomic money effects are proven separately in SQL."""

from dataclasses import replace

import httpx
import pytest

from server.flags import parse_flags
from server.tests.island_helpers import FRIEND_ID, PLAYER, PLAYER_ID
from server.tests.test_island_routes import friend_island
from server.tests.test_wall_offer_routes import post, world


def quoted(game, **extra):
    return post(game, "quote", cells=[{"x": 4, "z": -19.5}, {"x": 6, "z": -19.5}], **extra).json()


def ready():
    game = world()
    assert post(game, "enable").status_code == 200
    return game


def intent(quote, uid="wall-run-0001", **extra):
    return {
        "placements": quote["placements"],
        "quotedTotal": quote["totalCost"],
        "islandEpoch": quote["islandEpoch"],
        "actionUid": uid,
        **extra,
    }


def test_new_build_passes_full_uid_ordered_prices_and_current_fences_to_sql():
    game = ready()
    quote = quoted(game)
    response = post(game, "build", **intent(quote, "u" * 64))
    assert response.status_code == 200 and response.headers["cache-control"] == "private, no-store"
    assert response.json()["receipt"]["repeat"] is False
    assert response.json()["island"]["coins"] == 80
    (call,) = game.database.calls("island_wall_build")
    assert call["p_action_uid"] == "u" * 64
    assert call["p_items"] == [
        {"spot": "wall_1", "x_half": 8, "z_half": -39, "price": 10},
        {"spot": "wall_2", "x_half": 12, "z_half": -39, "price": 10},
    ]
    assert (call["p_expected_role"], call["p_expected_wave_best"]) == (None, 0)
    assert len(call["p_seen"]) == 26 and call["p_intent"]["islandEpoch"] == quote["islandEpoch"]


def test_lost_committed_reply_reconciles_after_reset_and_offer_pause_without_rebuilding():
    game = ready()
    original = intent(quoted(game))
    game.database.wall_build_after_commit = httpx.Response(503, json={"code": "XX000"})
    assert post(game, "build", **original).status_code == 503
    game.database.buildings[PLAYER_ID] = []
    game.database.layout_rows_by_owner[PLAYER_ID] = []
    game.database.wall_epochs[PLAYER_ID] = "33333333-4444-4555-8666-777777777777"
    game.database.balance = 200
    game.app.state.settings = replace(game.app.state.settings, flags=parse_flags("islands"))
    replay = post(game, "build", **original)
    assert replay.status_code == 200
    body = replay.json()
    assert body["receipt"]["repeat"] is True and body["receipt"]["totalCost"] == 20
    assert body["receipt"]["islandEpoch"] == original["islandEpoch"]
    assert body["island"]["coins"] == 200 and not any(s["built"] for s in body["island"]["spots"])
    assert len(game.database.calls("island_wall_build")) == 1


def test_same_uid_different_intent_refuses_before_requote_or_reconstruction():
    game = ready()
    original = intent(quoted(game))
    assert post(game, "build", **original).status_code == 200
    response = post(game, "build", **{**original, "quotedTotal": 21})
    assert response.status_code == 409 and response.json()["error"]["code"] == "action_uid_conflict"
    assert len(game.database.calls("island_wall_build")) == 1 and game.database.balance == 80


@pytest.mark.parametrize("change", ["price", "epoch"])
def test_fresh_stale_quote_refuses_before_any_paid_commit(change):
    game = ready()
    if change == "epoch":
        game.database.layout_rows_by_owner[PLAYER_ID] = []  # Same empty layout across two resets.
    body = intent(quoted(game))
    if change == "price":
        game.database.progress.update(captain_level=5, captain_role="engineer")
    else:
        game.database.wall_epochs[PLAYER_ID] = "33333333-4444-4555-8666-777777777777"
    response = post(game, "build", **body)
    assert response.status_code == 409 and response.json()["error"]["code"] == "quote_changed"
    assert game.database.calls("island_wall_build") == [] and game.database.balance == 100


def test_membership_is_checked_before_private_receipt_lookup():
    game = world()
    friend_island(game)
    game.database.wall_policies[FRIEND_ID] = {"ruleVersion": 1, "capacity": 128}
    body = intent(quoted(game, code="ISLE-K7Q2M"), code="ISLE-K7Q2M")
    assert post(game, "build", **body).status_code == 200
    before = len(game.database.calls("island_wall_build_receipt"))
    game.database.games.rows[FRIEND_ID].pop(PLAYER_ID)
    response = post(game, "build", **body)
    assert response.status_code == 403
    assert len(game.database.calls("island_wall_build_receipt")) == before


@pytest.mark.parametrize(
    "reason,status",
    [
        ("insufficient_funds", 409),
        ("busy", 409),
        ("wave_running", 409),
        ("quote_changed", 409),
    ],
)
def test_commit_refusals_are_not_reported_as_paid_success(reason, status):
    game = ready()
    body = intent(quoted(game))
    game.database.wall_build_reply = {"status": "refused", "reason": reason, "price": 20}
    response = post(game, "build", **body)
    assert response.status_code == status and response.json()["error"]["code"] == reason
    assert game.database.balance == 100 and game.database.wall_build_receipts == {}


def test_missing_receipt_rpc_cannot_turn_into_a_new_purchase():
    game = ready()
    body = intent(quoted(game))
    game.database.wall_receipt_reply = httpx.Response(404, json={"code": "PGRST202"})
    assert post(game, "build", **body).status_code == 502
    assert game.database.calls("island_wall_build") == []


def test_strict_build_shape_does_not_accept_client_policy_or_missing_epoch():
    game = ready()
    body = intent(quoted(game))
    for changed in [
        {**body, "wallCapacity": 128},
        {k: v for k, v in body.items() if k != "islandEpoch"},
    ]:
        response = game.client.post("/api/island/walls/build", json=changed, headers=PLAYER)
        assert response.status_code == 422
    assert game.database.calls("island_wall_build_receipt") == []
