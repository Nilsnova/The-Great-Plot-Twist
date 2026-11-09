"""Tests for the host's demo routes and "Clean up guests" (routes/demo.py, demo/guests.py).

The login check and the database are fakes (demo_helpers.py). Nothing uses the network.
"""

from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from server.demo.guests import MAX_DELETIONS, PAGE_SIZE, is_old_guest
from server.flags import parse_flags
from server.tests.demo_helpers import (
    DEMO_SETTINGS,
    GUEST,
    HOST,
    HOST_ID,
    PLAYER,
    make_demo_app,
    make_demo_client,
)
from server.tests.helpers import assert_error

UID = "6f0c0e5e-9d8a-4c3b-8e1f-2a7b6c5d4e3f"
OTHER_UID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"
NOW = datetime(2026, 11, 5, 12, 0, tzinfo=UTC)
CUTOFF = NOW - timedelta(hours=24)


def guest_user(number: int, *, hours_old: float = 30, **changes) -> dict:
    user = {
        "id": f"eeeeeeee-0000-4000-8000-{number:012d}",
        "is_anonymous": True,
        "email": "",
        "phone": "",
        "identities": [],
        "app_metadata": {"provider": "anonymous", "providers": ["anonymous"]},
        "created_at": (NOW - timedelta(hours=hours_old)).isoformat().replace("+00:00", "Z"),
    }
    user.update(changes)
    return user


# --- who may switch ---


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("get", "/api/host/demo", None),
        ("post", "/api/host/demo", {"hours": 2, "actionUid": UID}),
        ("post", "/api/host/demo/cleanup", {"actionUid": UID}),
    ],
)
def test_only_a_host_may_use_the_demo_routes(method, path, body):
    client, database = make_demo_client()
    kwargs = {"json": body} if body is not None else {}

    assert_error(getattr(client, method)(path, **kwargs), 401, "unauthorized")
    assert_error(getattr(client, method)(path, headers=PLAYER, **kwargs), 403, "forbidden")
    # A guest is never a host; with the demo closed the gate answers first.
    assert_error(getattr(client, method)(path, headers=GUEST, **kwargs), 403, "demo_closed")
    assert database.calls("demo_window_set") == []


# --- the switch ---


def test_a_host_reads_a_closed_window():
    client, _ = make_demo_client()

    response = client.get("/api/host/demo", headers=HOST)

    assert response.status_code == 200
    assert response.json() == {"flagOn": True, "open": False, "openUntil": None}
    assert response.headers["cache-control"] == "private, no-store"


def test_a_host_opens_the_window_for_two_hours_and_guests_may_play_at_once():
    app, database, _ = make_demo_app()
    client = TestClient(app)

    response = client.post("/api/host/demo", headers=HOST, json={"hours": 2, "actionUid": UID})

    assert response.json() == {
        "flagOn": True,
        "open": True,
        "openUntil": "2026-11-05T14:00:00Z",
        "repeat": False,
    }
    assert database.calls("demo_window_set") == [
        {"p_host_id": HOST_ID, "p_action_uid": UID, "p_hours": 2}
    ]
    # The host's own instance knows at once, without a new read.
    assert client.get("/api/config").json()["demo"]["open"] is True
    assert database.calls("demo_window_read") == []


def test_a_repeat_changes_nothing_and_says_so():
    client, database = make_demo_client()
    client.post("/api/host/demo", headers=HOST, json={"hours": 2, "actionUid": UID})

    response = client.post("/api/host/demo", headers=HOST, json={"hours": 5, "actionUid": UID})

    assert response.json()["repeat"] is True
    assert response.json()["openUntil"] == "2026-11-05T14:00:00Z"


def test_zero_hours_closes_the_window():
    client, database = make_demo_client()
    client.post("/api/host/demo", headers=HOST, json={"hours": 2, "actionUid": UID})

    body = client.post(
        "/api/host/demo", headers=HOST, json={"hours": 0, "actionUid": OTHER_UID}
    ).json()

    assert body == {"flagOn": True, "open": False, "openUntil": None, "repeat": False}


def test_with_the_flag_off_the_window_can_be_prepared_but_does_not_open_for_guests():
    client, database = make_demo_client(replace(DEMO_SETTINGS, flags=parse_flags("")))

    body = client.post("/api/host/demo", headers=HOST, json={"hours": 1, "actionUid": UID}).json()

    assert body["flagOn"] is False
    assert body["open"] is False
    assert database.open_until is not None


@pytest.mark.parametrize(
    "body",
    [
        {"hours": 7, "actionUid": UID},
        {"hours": -1, "actionUid": UID},
        {"hours": 1.5, "actionUid": UID},
        {"hours": "2", "actionUid": UID},
        {"hours": 2, "actionUid": "not-a-uuid"},
        {"hours": 2},
        {"hours": 2, "actionUid": UID, "openUntil": "2030-01-01T00:00:00Z"},
    ],
)
def test_a_bad_switch_is_refused_before_the_database(body):
    client, database = make_demo_client()

    assert_error(client.post("/api/host/demo", headers=HOST, json=body), 422, "validation_error")
    assert database.calls("demo_window_set") == []


# --- who counts as an old guest ---


def test_an_old_anonymous_user_is_an_old_guest():
    assert is_old_guest(guest_user(1), CUTOFF, frozenset()) is True


@pytest.mark.parametrize(
    "changes",
    [
        {"hours_old": 23},
        {"is_anonymous": False},
        {"is_anonymous": "true"},
        {"email": "someone@example.org"},
        {"phone": "+351000000000"},
        {"identities": [{"provider": "github"}]},
        {"app_metadata": {"provider": "anonymous", "providers": ["anonymous", "github"]}},
        {"app_metadata": {"provider": "google"}},
        {"created_at": None},
        {"created_at": "yesterday"},
        {"created_at": "2026-11-01T10:00:00"},  # no timezone: in doubt, keep
        {"id": None},
    ],
)
def test_every_doubt_keeps_the_user(changes):
    hours_old = changes.pop("hours_old", 30)

    assert is_old_guest(guest_user(1, hours_old=hours_old, **changes), CUTOFF, frozenset()) is False


def test_a_host_is_never_cleaned_up():
    user = guest_user(1)

    assert is_old_guest(user, CUTOFF, frozenset({user["id"]})) is False


# --- the cleanup route ---


def test_cleanup_deletes_only_old_guests_through_delete_player():
    app, database, clock = make_demo_app()
    clock.now = NOW
    keep_young = guest_user(2, hours_old=2)
    keep_github = guest_user(3, is_anonymous=False, identities=[{"provider": "github"}])
    database.auth_users = [guest_user(1), keep_young, keep_github, guest_user(4)]

    response = TestClient(app).post(
        "/api/host/demo/cleanup", headers=HOST, json={"actionUid": UID}
    )

    assert response.status_code == 200
    assert response.json() == {"checked": 4, "deleted": 2, "more": False}
    assert database.deleted == [guest_user(1)["id"], guest_user(4)["id"]]
    assert response.headers["cache-control"] == "private, no-store"


def test_cleanup_reads_every_page_and_stops_at_the_deletion_limit():
    app, database, clock = make_demo_app()
    clock.now = NOW
    database.auth_users = [guest_user(number) for number in range(PAGE_SIZE + 5)]

    body = TestClient(app).post(
        "/api/host/demo/cleanup", headers=HOST, json={"actionUid": UID}
    ).json()

    assert body == {"checked": PAGE_SIZE + 5, "deleted": MAX_DELETIONS, "more": True}
    pages = [r.url.params["page"] for r in database.requests if r.url.path.endswith("/users")]
    assert pages == ["1", "2"]
