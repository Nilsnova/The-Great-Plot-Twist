"""Tests for hosts.py: require_host and HostDep, the check for presenter-only routes.

No route in production uses it yet (the presenter routes of package L3 will), so each test mounts
a small route of its own on a real app, as test_app.py does. A fake login check knows two tokens:
one belongs to a host and one to a normal player. Nothing uses the network.
"""

from dataclasses import replace

import httpx
import pytest
from fastapi.testclient import TestClient

from server.app import create_app
from server.auth import Player, PlayerVerifier
from server.errors import ApiError
from server.hosts import HostDep, require_host
from server.settings import Settings
from server.tests.helpers import CONFIGURED_SETTINGS, FakeClock, assert_error

URL = "/api/test/host-only"

HOST_ID = "11111111-2222-3333-4444-555555555555"
HOST_TOKEN = "test.host.signature"
PLAYER_ID = "99999999-8888-7777-6666-555555555555"
PLAYER_TOKEN = "test.player.signature"

HOST_HEADER = {"Authorization": f"Bearer {HOST_TOKEN}"}
PLAYER_HEADER = {"Authorization": f"Bearer {PLAYER_TOKEN}"}

SETTINGS_WITH_A_HOST = replace(CONFIGURED_SETTINGS, host_player_ids=frozenset({HOST_ID}))


def login_works(request: httpx.Request) -> httpx.Response:
    """A fake Supabase login check that knows the host's token and a normal player's token."""
    token = request.headers["authorization"]
    if token == f"Bearer {HOST_TOKEN}":
        return httpx.Response(200, json={"id": HOST_ID})
    if token == f"Bearer {PLAYER_TOKEN}":
        return httpx.Response(200, json={"id": PLAYER_ID})
    return httpx.Response(401, json={"msg": "invalid JWT"})


def make_client(settings: Settings = SETTINGS_WITH_A_HOST) -> TestClient:
    """The real app, plus one route that only a host may call."""
    verifier = PlayerVerifier(
        settings, transport=httpx.MockTransport(login_works), clock=FakeClock()
    )
    app = create_app(settings, verifier=verifier)

    @app.get(URL)
    async def host_only(host: HostDep) -> dict[str, str]:
        return {"hostId": host.id}

    return TestClient(app)


# --- the route check ---


def test_a_host_gets_200():
    response = make_client().get(URL, headers=HOST_HEADER)

    assert response.status_code == 200
    assert response.json() == {"hostId": HOST_ID}


def test_a_player_who_is_not_a_host_gets_403_forbidden():
    response = make_client().get(URL, headers=PLAYER_HEADER)

    assert_error(response, 403, "forbidden")
    assert response.json()["error"]["message"] == "Only a host can do this."


def test_without_a_token_it_is_401_not_403():
    # The login is checked first. A visitor must be told to sign in, not that they are not a host.
    response = make_client().get(URL)

    assert_error(response, 401, "unauthorized")


def test_a_token_that_supabase_refuses_is_401_not_403():
    response = make_client().get(
        URL, headers={"Authorization": "Bearer test.nobody-issued-this.signature"}
    )

    assert_error(response, 401, "unauthorized")


def test_with_no_hosts_configured_everybody_gets_403():
    # Even the player who would be a host in another configuration.
    client = make_client(replace(CONFIGURED_SETTINGS, host_player_ids=frozenset()))

    assert_error(client.get(URL, headers=HOST_HEADER), 403, "forbidden")
    assert_error(client.get(URL, headers=PLAYER_HEADER), 403, "forbidden")


def test_a_header_or_query_naming_the_host_does_not_help():
    # The player id comes from the verified login and from nowhere else.
    client = make_client()
    headers = {**PLAYER_HEADER, "X-Player-Id": HOST_ID}

    by_header = client.get(URL, headers=headers)
    by_query = client.get(
        f"{URL}?playerId={HOST_ID}&player_id={HOST_ID}&id={HOST_ID}", headers=PLAYER_HEADER
    )

    assert_error(by_header, 403, "forbidden")
    assert_error(by_query, 403, "forbidden")


# --- the plain function ---


def test_require_host_gives_back_the_player_when_they_are_a_host():
    player = Player(id=HOST_ID)

    assert require_host(player, SETTINGS_WITH_A_HOST) is player


@pytest.mark.parametrize("player_id", [PLAYER_ID, ""])
def test_require_host_refuses_everybody_else(player_id):
    with pytest.raises(ApiError) as refusal:
        require_host(Player(id=player_id), SETTINGS_WITH_A_HOST)

    assert refusal.value.status_code == 403
    assert refusal.value.code == "forbidden"
