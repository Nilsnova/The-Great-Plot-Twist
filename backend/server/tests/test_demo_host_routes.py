"""Tests for the host's demo routes and "Clean up guests" (routes/demo.py, demo/guests.py).

The login check and the database are fakes (demo_helpers.py). Nothing uses the network.
"""

from dataclasses import replace
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from fastapi.testclient import TestClient

from server.demo.code import CODE_FORMAT, new_code
from server.demo.guests import (
    AUTO_MAX_DELETIONS,
    MAX_DELETIONS,
    PAGE_SIZE,
    AutoCleanup,
    is_old_guest,
)
from server.flags import parse_flags
from server.tests.demo_helpers import (
    DEMO_SETTINGS,
    GUEST,
    GUEST_ID,
    HOST,
    HOST_ID,
    PLAYER,
    make_demo_app,
    make_demo_client,
)
from server.tests.helpers import assert_error

UID = "6f0c0e5e-9d8a-4c3b-8e1f-2a7b6c5d4e3f"
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


# --- who may use the host routes ---


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("get", "/api/host/demo", None),
        ("post", "/api/host/demo/code", {"actionUid": UID}),
        ("post", "/api/host/demo/cleanup", {"actionUid": UID}),
    ],
)
def test_only_a_host_may_use_the_demo_routes(method, path, body):
    client, database = make_demo_client()
    kwargs = {"json": body} if body is not None else {}

    assert_error(getattr(client, method)(path, **kwargs), 401, "unauthorized")
    assert_error(getattr(client, method)(path, headers=PLAYER, **kwargs), 403, "forbidden")
    # A guest is never a host; a guest without an admission is stopped by the gate first.
    assert_error(getattr(client, method)(path, headers=GUEST, **kwargs), 403, "demo_closed")
    # An admitted guest is still not a host.
    database.admit(GUEST_ID)
    assert_error(getattr(client, method)(path, headers=GUEST, **kwargs), 403, "forbidden")
    assert database.calls("demo_class_code_set") == []
    assert database.calls("delete_player") == []
    assert database.calls("demo_class_code_read") == []


@pytest.mark.parametrize("path", ["/api/host/demo", "/api/host/demo/open"])
def test_the_old_window_switch_is_gone(path):
    client, _ = make_demo_client()

    response = client.post(path, headers=HOST, json={"hours": 2, "actionUid": UID})

    assert response.status_code in (404, 405)


# --- the class code ---


def test_a_host_reads_that_there_is_no_code_yet():
    client, _ = make_demo_client()

    response = client.get("/api/host/demo", headers=HOST)

    assert response.status_code == 200
    assert response.json() == {"flagOn": True, "code": None, "codeSetAt": None, "guests": 0}
    assert response.headers["cache-control"] == "private, no-store"


def test_a_host_makes_a_new_code_and_reads_it_back_with_the_guest_count():
    client, database = make_demo_client()
    database.admit(GUEST_ID)

    made = client.post("/api/host/demo/code", headers=HOST, json={"actionUid": UID})

    body = made.json()
    assert made.headers["cache-control"] == "private, no-store"
    assert CODE_FORMAT.fullmatch(body["code"])
    assert body == {
        "flagOn": True,
        "code": body["code"],
        "codeSetAt": "2026-11-05T12:00:00Z",
        "guests": 1,
        "repeat": False,
    }
    (call,) = database.calls("demo_class_code_set")
    assert call == {"p_host_id": HOST_ID, "p_action_uid": UID, "p_code": body["code"]}
    read = client.get("/api/host/demo", headers=HOST).json()
    assert read == {k: v for k, v in body.items() if k != "repeat"}


def test_a_repeat_changes_nothing_and_a_new_click_replaces_the_code():
    client, database = make_demo_client()
    first = client.post("/api/host/demo/code", headers=HOST, json={"actionUid": UID}).json()

    repeat = client.post("/api/host/demo/code", headers=HOST, json={"actionUid": UID}).json()
    assert repeat == {**first, "repeat": True}

    codes = {first["code"]}
    for number in range(5):
        uid = f"0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c{number:02d}"
        codes.add(
            client.post("/api/host/demo/code", headers=HOST, json={"actionUid": uid}).json()["code"]
        )
    # Random codes: six clicks make (almost surely) six different codes.
    assert len(codes) >= 5
    assert database.code in codes


def test_new_codes_use_only_the_unambiguous_alphabet():
    codes = {new_code() for _ in range(300)}

    assert all(CODE_FORMAT.fullmatch(code) for code in codes)
    assert not set("".join(codes)) & set("0O1IL")
    assert len(codes) > 290


def test_with_the_flag_off_a_code_can_be_prepared():
    client, database = make_demo_client(replace(DEMO_SETTINGS, flags=parse_flags("")))

    body = client.post("/api/host/demo/code", headers=HOST, json={"actionUid": UID}).json()

    assert body["flagOn"] is False
    assert database.code == body["code"]


@pytest.mark.parametrize(
    "body",
    [
        {"actionUid": "not-a-uuid"},
        {},
        {"actionUid": UID, "code": "K7QXM"},  # a host can never choose the code
    ],
)
def test_a_bad_code_request_is_refused_before_the_database(body):
    client, database = make_demo_client()

    response = client.post("/api/host/demo/code", headers=HOST, json=body)

    assert_error(response, 422, "validation_error")
    assert database.calls("demo_class_code_set") == []


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
        {"app_metadata": {"provider": "email"}},
        {"identities": [{"provider": "email"}]},
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

    response = TestClient(app).post("/api/host/demo/cleanup", headers=HOST, json={"actionUid": UID})

    assert response.status_code == 200
    assert response.json() == {"checked": 4, "deleted": 2, "more": False}
    assert database.deleted == [guest_user(1)["id"], guest_user(4)["id"]]
    assert response.headers["cache-control"] == "private, no-store"


def test_cleanup_reads_every_page_and_stops_at_the_deletion_limit():
    app, database, clock = make_demo_app()
    clock.now = NOW
    database.auth_users = [guest_user(number) for number in range(PAGE_SIZE + 5)]

    body = (
        TestClient(app).post("/api/host/demo/cleanup", headers=HOST, json={"actionUid": UID}).json()
    )

    assert body == {"checked": PAGE_SIZE + 5, "deleted": MAX_DELETIONS, "more": True}
    pages = [r.url.params["page"] for r in database.requests if r.url.path.endswith("/users")]
    assert pages == ["1", "2"]


# --- the automatic clean-up after the host's read ---


def test_reading_the_code_also_cleans_old_guests_up_in_a_bounded_batch_once_per_ten_minutes():
    app, database, clock = make_demo_app()
    clock.now = NOW
    database.auth_users = [guest_user(number) for number in range(AUTO_MAX_DELETIONS + 5)]
    client = TestClient(app)

    response = client.get("/api/host/demo", headers=HOST)

    assert response.status_code == 200
    assert len(database.deleted) == AUTO_MAX_DELETIONS
    client.get("/api/host/demo", headers=HOST)
    clock.advance(9 * 60)
    client.get("/api/host/demo", headers=HOST)
    assert len(database.deleted) == AUTO_MAX_DELETIONS  # not again within 10 minutes
    clock.advance(61)
    client.get("/api/host/demo", headers=HOST)
    assert len(database.deleted) == AUTO_MAX_DELETIONS + 5


def test_a_failed_automatic_clean_up_is_logged_and_the_read_still_answers(caplog):
    app, database, clock = make_demo_app()

    def broken(request):
        raise httpx.ConnectError("down")

    database.list_users = broken

    with caplog.at_level("WARNING"):
        response = TestClient(app).get("/api/host/demo", headers=HOST)

    assert response.status_code == 200
    assert response.json()["code"] is None
    assert "Automatic guest clean-up failed: SupabaseUnavailable" in caplog.text
    assert database.deleted == []


def test_the_automatic_clean_up_gives_up_after_its_time_limit(monkeypatch, caplog):
    import asyncio

    import server.demo.guests as guests

    async def slow(*_args):
        await asyncio.sleep(5)

    monkeypatch.setattr(guests, "cleanup_guests", slow)
    monkeypatch.setattr(guests, "AUTO_TIMEOUT_SECONDS", 0.01)
    auto = AutoCleanup(admin=None, clock=lambda: NOW, hosts=frozenset())
    assert auto.claim() is True
    assert auto.claim() is False  # already running

    with caplog.at_level("WARNING"):
        assert asyncio.run(auto.run()) is None

    assert "Automatic guest clean-up failed: TimeoutError" in caplog.text
    assert auto.running is False
