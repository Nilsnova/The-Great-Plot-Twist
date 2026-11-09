"""Tests for guest play: who counts as a guest, the demo gate, getting a guest ready, /api/config.

A small route that needs a signed-in player is mounted on the real app (as test_hosts.py does), so
the gate is tested exactly as every PlayerDep route uses it. Nothing uses the network.
"""

from dataclasses import replace
from datetime import timedelta

import httpx
import pytest
from fastapi.testclient import TestClient

from server.auth import PlayerDep, is_anonymous_user, player_from_response
from server.demo.guests import GUEST_ENDING, GUEST_KIT
from server.flags import parse_flags
from server.tests.demo_helpers import (
    DEMO_SETTINGS,
    GOOGLE,
    GOOGLE_ID,
    GUEST,
    GUEST_ID,
    PLAYER,
    PLAYER_ID,
    make_demo_app,
)
from server.tests.helpers import assert_error

URL = "/api/test/needs-a-player"


def client_with_route(settings=DEMO_SETTINGS):
    app, database, clock = make_demo_app(settings)

    @app.get(URL)
    async def needs_a_player(player: PlayerDep) -> dict:
        return {"id": player.id, "guest": player.is_anonymous}

    return TestClient(app), database, clock


# --- who is a guest ---


@pytest.mark.parametrize(
    ("user", "expected"),
    [
        ({"id": "x", "is_anonymous": True}, True),
        ({"id": "x", "is_anonymous": False}, False),
        ({"id": "x", "app_metadata": {"provider": "anonymous"}}, True),
        ({"id": "x", "app_metadata": {"provider": "github"}}, False),
        ({"id": "x"}, False),
        # A guest who linked GitHub: is_anonymous decides, even with an old provider name.
        ({"id": "x", "is_anonymous": False, "app_metadata": {"provider": "anonymous"}}, False),
        # Text is not a yes.
        ({"id": "x", "is_anonymous": "true"}, False),
    ],
)
def test_who_counts_as_a_guest(user, expected):
    assert is_anonymous_user(user) is expected


def test_the_player_carries_the_guest_flag_from_supabase():
    response = httpx.Response(200, json={"id": "abc", "is_anonymous": True})

    assert player_from_response(response).is_anonymous is True


# --- the gate ---


def test_a_github_player_passes_without_any_demo_read():
    client, database, _ = client_with_route()

    response = client.get(URL, headers=PLAYER)

    assert response.status_code == 200
    assert response.json() == {"id": PLAYER_ID, "guest": False}
    assert database.requests == []


def test_a_google_player_is_a_normal_player_too():
    client, database, _ = client_with_route()

    response = client.get(URL, headers=GOOGLE)

    assert response.json() == {"id": GOOGLE_ID, "guest": False}
    assert database.requests == []


def test_a_guest_is_refused_while_the_flag_is_off_and_nothing_is_read():
    client, database, _ = client_with_route(replace(DEMO_SETTINGS, flags=parse_flags("")))
    database.open_for(2)

    response = client.get(URL, headers=GUEST)

    assert_error(response, 403, "demo_closed")
    assert database.requests == []


def test_a_guest_is_refused_while_the_window_is_closed():
    client, database, _ = client_with_route()

    assert_error(client.get(URL, headers=GUEST), 403, "demo_closed")
    assert database.paths() == ["POST /rest/v1/rpc/demo_window_read"]


def test_a_guest_passes_while_the_window_is_open_and_gets_a_name_and_the_default_kit():
    client, database, _ = client_with_route()
    database.open_for(2)

    response = client.get(URL, headers=GUEST)

    assert response.status_code == 200
    assert response.json() == {"id": GUEST_ID, "guest": True}
    (named,) = database.calls("assign_captain_name")
    assert named["p_player_id"] == GUEST_ID
    assert named["p_placeholder"] == "Captain-aaaaaa"
    (granted,) = database.calls("grant_entry_kit")
    assert granted["p_player_id"] == GUEST_ID
    assert granted["p_kit"] == GUEST_KIT == "stranger"
    assert granted["p_ending"] == GUEST_ENDING == "ending_demo"
    assert granted["p_decision"] == "none"
    assert granted["p_read_log"] is False
    assert granted["p_move_count"] == 1
    assert granted["p_start_place"] == "saltreach_harbor"
    assert len(granted["p_story_sha256"]) == 64


def test_a_ready_guest_is_not_set_up_twice_on_the_same_instance():
    client, database, _ = client_with_route()
    database.open_for(2)

    client.get(URL, headers=GUEST)
    client.get(URL, headers=GUEST)

    assert len(database.calls("grant_entry_kit")) == 1
    # The window was read once: the gate remembers it for 10 seconds.
    assert len(database.calls("demo_window_read")) == 1


def test_a_guest_with_a_kit_already_is_only_looked_up():
    client, database, _ = client_with_route()
    database.open_for(2)
    database.entry_profiles[GUEST_ID] = "stranger"

    assert client.get(URL, headers=GUEST).status_code == 200

    assert database.calls("assign_captain_name") == []
    assert database.calls("grant_entry_kit") == []


def test_the_window_is_read_again_after_ten_seconds_and_a_closed_window_refuses():
    client, database, clock = client_with_route()
    database.open_for(2)
    assert client.get(URL, headers=GUEST).status_code == 200

    database.open_until = None  # the host closed it on another server instance
    clock.advance(5)
    assert client.get(URL, headers=GUEST).status_code == 200  # still remembered
    clock.advance(6)
    assert_error(client.get(URL, headers=GUEST), 403, "demo_closed")


def test_a_remembered_window_that_ended_refuses_at_once():
    client, database, clock = client_with_route()
    database.open_until = clock() + timedelta(seconds=5)
    assert client.get(URL, headers=GUEST).status_code == 200

    clock.advance(6)

    assert_error(client.get(URL, headers=GUEST), 403, "demo_closed")


def test_a_guest_whose_profile_is_missing_gets_404():
    client, database, _ = client_with_route()
    database.open_for(1)
    database.assign_name = lambda body: {"status": "missing"}

    assert_error(client.get(URL, headers=GUEST), 404, "player_not_set_up")


def test_the_gate_also_guards_the_festival_read_with_an_optional_login():
    settings = replace(DEMO_SETTINGS, flags=parse_flags("demo,festival"))
    client, database, _ = client_with_route(settings)

    response = client.get("/api/festival", headers=GUEST)

    assert_error(response, 403, "demo_closed")


# --- what GET /api/config says ---


def test_config_says_closed_while_the_flag_is_off_without_reading():
    app, database, _ = make_demo_app(replace(DEMO_SETTINGS, flags=parse_flags("")))
    database.open_for(2)

    body = TestClient(app).get("/api/config").json()

    assert body["demo"] == {"open": False, "openUntil": None}
    assert database.requests == []


def test_config_shows_an_open_window_with_its_end_in_utc():
    app, database, clock = make_demo_app()
    database.open_for(2)

    body = TestClient(app).get("/api/config").json()

    assert body["demo"] == {"open": True, "openUntil": "2026-11-05T14:00:00Z"}
    assert body["flags"]["demo"] is True


def test_config_shows_closed_when_the_window_cannot_be_read():
    app, database, _ = make_demo_app()

    def broken(*_args):
        raise httpx.ConnectError("down")

    database.window_read = broken

    response = TestClient(app).get("/api/config")

    assert response.status_code == 200
    assert response.json()["demo"] == {"open": False, "openUntil": None}


def test_a_guest_may_always_delete_their_own_data():
    client, database, _ = client_with_route()
    database.delete_player = lambda body: {"status": "deleted"}

    response = client.request("DELETE", "/api/me", headers=GUEST, json={"confirm": True})

    assert response.status_code == 200
    assert response.json() == {"deleted": True}
    assert database.calls("demo_window_read") == []
    assert database.calls("delete_player") == [{"p_player_id": GUEST_ID}]
