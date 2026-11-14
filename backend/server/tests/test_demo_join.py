"""Tests for POST /api/demo/join: a guest presents the class code and passes the guest gate after.

The login check and the database are fakes (demo_helpers.py). Nothing uses the network.
"""

from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from server.auth import PlayerDep
from server.demo.code import codes_match, display_code, normalize_code
from server.flags import parse_flags
from server.tests.demo_helpers import (
    DEMO_SETTINGS,
    GUEST,
    GUEST_ID,
    HOST,
    PLAYER,
    PLAYER_ID,
    make_demo_app,
)
from server.tests.helpers import assert_error

UID = "6f0c0e5e-9d8a-4c3b-8e1f-2a7b6c5d4e3f"
CODE = "K7QXM"
URL = "/api/demo/join"
GATED = "/api/test/needs-a-player"


def client_with_code(settings=DEMO_SETTINGS, code=CODE):
    app, database, clock = make_demo_app(settings)

    @app.get(GATED)
    async def needs_a_player(player: PlayerDep) -> dict:
        return {"id": player.id}

    if code is not None:
        database.set_code(code)
    return TestClient(app), database, clock


def join(client, code=CODE, headers=GUEST, forwarded=None):
    extra = {"x-forwarded-for": forwarded} if forwarded else {}
    return client.post(URL, headers={**headers, **extra}, json={"code": code, "actionUid": UID})


# --- reading what a player typed ---


@pytest.mark.parametrize(
    "typed",
    ["K7QXM", "k7qxm", "HARBOR-K7QXM", "harbor-k7qxm", " Harbor K7QXM ", "K7Q-XM", "HARBORK7QXM"],
)
def test_the_code_is_read_with_or_without_the_prefix_in_any_case(typed):
    assert normalize_code(typed) == "K7QXM"


@pytest.mark.parametrize(
    "typed",
    [
        "",
        "HARBOR",
        "K7QX",
        "K7QXMM",
        "K7QX0",
        "K7QXO",
        "K7QX1",
        "K7QXI",
        "K7QXL",
        "HARBOR-K7QX",
        "PIER-K7QXM",
        "K7QXM!",
        None,
        12345,
        "K" * 40,
    ],
)
def test_anything_else_is_not_a_class_code(typed):
    assert normalize_code(typed) is None


def test_the_comparison_needs_a_current_code_and_the_exact_code():
    assert codes_match("K7QXM", "K7QXM") is True
    assert codes_match("K7QXN", "K7QXM") is False
    assert codes_match("K7QXM", None) is False
    assert display_code("K7QXM") == "HARBOR-K7QXM"
    assert display_code(None) is None


# --- joining ---


def test_a_guest_with_the_current_code_is_admitted_and_then_passes_the_gate():
    client, database, _ = client_with_code()
    assert_error(client.get(GATED, headers=GUEST), 403, "demo_closed")

    response = join(client, "harbor-k7qxm")

    assert response.status_code == 200
    assert response.json() == {"admitted": True}
    assert response.headers["cache-control"] == "private, no-store"
    assert GUEST_ID in database.guests
    assert database.calls("demo_guest_admit") == [{"p_player_id": GUEST_ID}]
    # This instance knows at once, without reading the admission again.
    before = database.paths().count("GET /rest/v1/demo_guests")
    assert client.get(GATED, headers=GUEST).json() == {"id": GUEST_ID}
    assert database.paths().count("GET /rest/v1/demo_guests") == before


@pytest.mark.parametrize("typed", ["ZZ234", "HARBOR", "K7QX", "", "HARBOR-K7QXN"])
def test_a_wrong_code_is_refused_and_records_nothing(typed):
    client, database, _ = client_with_code()

    response = join(client, typed)

    assert_error(response, 403, "class_code_invalid")
    assert "not valid" in response.json()["error"]["message"]
    assert database.guests == {}
    assert database.calls("demo_guest_admit") == []
    assert_error(client.get(GATED, headers=GUEST), 403, "demo_closed")


def test_before_any_code_exists_nothing_lets_a_guest_in():
    client, database, _ = client_with_code(code=None)

    assert_error(join(client, "K7QXM"), 403, "class_code_invalid")
    assert database.guests == {}


def test_a_new_code_stops_the_old_one_at_once_for_new_joins():
    client, database, _ = client_with_code()
    database.code = "ZZ234"  # the host made a new code, on any instance

    assert_error(join(client, CODE), 403, "class_code_invalid")
    assert join(client, "ZZ234").json() == {"admitted": True}


def test_an_admitted_guest_stays_admitted_after_a_new_code():
    client, database, clock = client_with_code()
    assert join(client).status_code == 200

    database.code = "ZZ234"
    clock.advance(3600)

    # The gate still lets them in, and a repeat of the join with the old code says so too.
    assert client.get(GATED, headers=GUEST).json() == {"id": GUEST_ID}
    assert join(client, CODE).json() == {"admitted": True}
    assert database.calls("demo_guest_admit") == [{"p_player_id": GUEST_ID}]


def test_a_github_player_with_the_code_is_fine_and_is_not_recorded():
    client, database, _ = client_with_code()

    assert join(client, headers=PLAYER).json() == {"admitted": True}
    assert_error(join(client, "ZZ234", headers=PLAYER), 403, "class_code_invalid")
    assert PLAYER_ID not in database.guests
    assert database.calls("demo_guest_admit") == []


def test_with_the_flag_off_nobody_joins_and_nothing_is_read():
    client, database, _ = client_with_code(replace(DEMO_SETTINGS, flags=parse_flags("")))

    assert_error(join(client), 403, "demo_closed")
    assert database.guests == {}
    assert database.calls("demo_class_code_read") == []


def test_joining_needs_a_login():
    client, database, _ = client_with_code()

    response = client.post(URL, json={"code": CODE, "actionUid": UID})

    assert_error(response, 401, "unauthorized")
    assert database.requests == []


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"actionUid": UID},
        {"code": None, "actionUid": UID},
        {"code": True, "actionUid": UID},
        {"code": [], "actionUid": UID},
        {"code": CODE},
        {"code": CODE, "actionUid": None},
        {"code": CODE, "actionUid": 123},
        {"code": CODE, "actionUid": ""},
        {"code": CODE, "actionUid": "nope"},
        {"code": "K" * 33, "actionUid": UID},
        {"code": 12345, "actionUid": UID},
        {"code": CODE, "actionUid": UID, "playerId": GUEST_ID},
    ],
)
def test_a_bad_body_is_refused_before_the_database(body):
    client, database, _ = client_with_code()

    assert_error(client.post(URL, headers=GUEST, json=body), 422, "validation_error")
    assert database.requests == []


def test_a_guest_whose_login_vanished_gets_404():
    client, database, _ = client_with_code()
    database.known_users = set()

    assert_error(join(client), 404, "player_not_set_up")
    assert database.guests == {}


# --- the budget: 10 tries in 10 minutes per player and per address ---


def test_the_eleventh_try_of_a_player_is_refused_with_retry_after():
    client, database, clock = client_with_code()
    for number in range(10):
        assert_error(join(client, "ZZ234", forwarded=f"10.0.0.{number}"), 403, "class_code_invalid")

    response = join(client, CODE, forwarded="10.0.1.1")

    assert_error(response, 429, "too_many_requests")
    assert 0 < int(response.headers["retry-after"]) <= 600
    assert database.guests == {}  # even the right code waits
    clock.advance(601)
    assert join(client, CODE, forwarded="10.0.1.1").json() == {"admitted": True}


def test_the_eleventh_try_from_one_address_is_refused_for_every_player():
    client, database, _ = client_with_code()
    for _ in range(5):
        join(client, "ZZ234", headers=PLAYER, forwarded="203.0.113.7, 10.1.1.1")
    for _ in range(5):
        join(client, "ZZ234", headers=HOST, forwarded="203.0.113.7")

    assert_error(join(client, CODE, forwarded="203.0.113.7"), 429, "too_many_requests")
    # Another address and another player still may try.
    assert join(client, CODE, forwarded="198.51.100.2").json() == {"admitted": True}


def test_the_code_is_never_written_to_the_log(caplog):
    client, _, _ = client_with_code()

    with caplog.at_level("DEBUG"):
        join(client, "ZZ234")
        join(client, CODE)
        client.post("/api/host/demo/code", headers=HOST, json={"actionUid": UID})

    assert CODE not in caplog.text
    assert "ZZ234" not in caplog.text
