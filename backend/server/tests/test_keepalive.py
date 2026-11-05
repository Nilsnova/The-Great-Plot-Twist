"""Tests for routes/keepalive.py: GET /api/keepalive, with a fake database and no network."""

import logging
from dataclasses import replace
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from server.app import create_app
from server.routes import keepalive
from server.settings import Settings
from server.tests.helpers import (
    CONFIGURED_SETTINGS,
    FAKE_CRON_SECRET,
    FAKE_SECRET_KEY,
    FakeReply,
    assert_error,
    fail_with,
    make_admin,
)

URL = "/api/keepalive"

# The header Vercel sends to its cron routes.
RIGHT_HEADER = {"Authorization": f"Bearer {FAKE_CRON_SECRET}"}

# Headers that must be refused. Each one is close to the right one, or plainly wrong.
WRONG_HEADERS = [
    {"Authorization": ""},
    {"Authorization": "Bearer"},
    {"Authorization": "Bearer "},
    {"Authorization": "Bearer wrong-secret"},
    {"Authorization": FAKE_CRON_SECRET},  # the secret without the word Bearer
    {"Authorization": f"Basic {FAKE_CRON_SECRET}"},
    {"Authorization": f"Bearer {FAKE_CRON_SECRET}x"},  # one character too long
    {"Authorization": f"Bearer {FAKE_CRON_SECRET[:-1]}"},  # one character too short
]


def database_works(request: httpx.Request) -> httpx.Response:
    """A fake database where every read works and finds one row."""
    return httpx.Response(200, json=[{"id": "row-1"}])


def database_answers(status: int, body: dict) -> FakeReply:
    """A fake database that answers every read with this status and this JSON."""
    return lambda request: httpx.Response(status, json=body)


def crews_table_missing(request: httpx.Request) -> httpx.Response:
    """A fake database where the first two reads work and the crews table does not exist."""
    if request.url.path.endswith("/crews"):
        return httpx.Response(404, json={"code": "PGRST205", "message": "no such table"})
    return httpx.Response(200, json=[])


def make_client(
    reply: FakeReply = database_works, settings: Settings = CONFIGURED_SETTINGS
) -> tuple[TestClient, list[httpx.Request]]:
    """The app, wired to a fake database. Also returns every request the database received."""
    secret_key = settings.supabase_secret_key.get_secret_value()
    admin, seen = make_admin(reply, settings.supabase_url, secret_key)
    return TestClient(create_app(settings, admin=admin)), seen


# --- who may call it ---


def test_without_an_authorization_header_it_answers_401_and_reads_nothing():
    client, seen = make_client()

    response = client.get(URL)

    assert_error(response, 401, "unauthorized")
    assert seen == []


def test_the_401_asks_for_a_bearer_token():
    client, _ = make_client()

    response = client.get(URL)

    assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize("headers", WRONG_HEADERS)
def test_a_wrong_authorization_header_gets_401_and_reads_nothing(headers):
    client, seen = make_client()

    response = client.get(URL, headers=headers)

    assert_error(response, 401, "unauthorized")
    assert seen == []


def test_a_header_with_odd_characters_gets_401_and_not_a_crash():
    client, seen = make_client()
    odd_header = {"Authorization": "Bearer caf\xe9".encode("latin-1")}

    response = client.get(URL, headers=odd_header)

    assert_error(response, 401, "unauthorized")
    assert seen == []


def test_the_secret_is_compared_with_hmac_compare_digest(monkeypatch):
    # compare_digest takes the same time however much of the secret is right, so nobody can
    # find the secret by timing the answers. A plain == would not. No other test can tell the
    # two apart, so this one watches the call.
    calls = []

    def spy(sent: bytes, expected: bytes) -> bool:
        calls.append(sent)
        return sent == expected

    monkeypatch.setattr(keepalive, "hmac", SimpleNamespace(compare_digest=spy))
    client, _ = make_client()

    client.get(URL, headers=RIGHT_HEADER)

    assert len(calls) == 1


def test_post_is_not_allowed_because_the_vercel_cron_uses_get():
    client, seen = make_client()

    response = client.post(URL, headers=RIGHT_HEADER)

    assert_error(response, 405, "method_not_allowed")
    assert seen == []


# --- the right secret: three small reads ---


def test_with_the_right_secret_it_answers_ok_after_three_reads():
    client, _ = make_client()

    response = client.get(URL, headers=RIGHT_HEADER)

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "reads": 3}


def test_it_reads_profiles_wallet_reasons_and_crews_with_get():
    client, seen = make_client()

    client.get(URL, headers=RIGHT_HEADER)

    assert [request.method for request in seen] == ["GET", "GET", "GET"]
    assert [request.url.path for request in seen] == [
        "/rest/v1/profiles",
        "/rest/v1/wallet_reasons",
        "/rest/v1/crews",
    ]


def test_each_read_asks_for_one_column_of_one_row():
    client, seen = make_client()

    client.get(URL, headers=RIGHT_HEADER)

    assert [dict(request.url.params) for request in seen] == [
        {"select": "id", "limit": "1"},
        {"select": "reason", "limit": "1"},
        {"select": "id", "limit": "1"},
    ]


def test_the_reads_use_the_supabase_secret_key():
    client, seen = make_client()

    client.get(URL, headers=RIGHT_HEADER)

    assert [request.headers["apikey"] for request in seen] == [FAKE_SECRET_KEY] * 3


def test_tables_without_rows_are_fine():
    client, _ = make_client(database_answers(200, []))

    response = client.get(URL, headers=RIGHT_HEADER)

    assert response.json() == {"status": "ok", "reads": 3}


# --- settings that are missing ---


@pytest.mark.parametrize("headers", [{}, {"Authorization": "Bearer "}, RIGHT_HEADER])
def test_without_a_cron_secret_it_answers_503_whatever_the_header_says(headers):
    # With no secret set, nobody can prove who they are. An empty token must never match.
    settings = replace(CONFIGURED_SETTINGS, cron_secret=SecretStr(""))
    client, seen = make_client(settings=settings)

    response = client.get(URL, headers=headers)

    assert_error(response, 503, "not_configured")
    assert seen == []


@pytest.mark.parametrize(
    "missing", [{"supabase_secret_key": SecretStr("")}, {"supabase_url": ""}]
)
def test_without_the_database_settings_it_answers_503_not_configured(missing):
    client, seen = make_client(settings=replace(CONFIGURED_SETTINGS, **missing))

    response = client.get(URL, headers=RIGHT_HEADER)

    assert_error(response, 503, "not_configured")
    assert seen == []


def test_a_stranger_gets_401_even_when_the_database_is_not_set_up():
    # Only a caller with the secret may learn what is missing on the server.
    settings = replace(CONFIGURED_SETTINGS, supabase_secret_key=SecretStr(""))
    client, _ = make_client(settings=settings)

    response = client.get(URL, headers={"Authorization": "Bearer wrong-secret"})

    assert_error(response, 401, "unauthorized")


# --- a database that does not answer ---


def test_a_database_with_a_server_error_gives_503_and_hides_its_text():
    client, _ = make_client(database_answers(500, {"message": "internal detail"}))

    response = client.get(URL, headers=RIGHT_HEADER)

    assert_error(response, 503, "database_unavailable")
    assert "internal detail" not in response.text


@pytest.mark.parametrize("error_class", [httpx.ConnectError, httpx.ReadTimeout])
def test_a_database_that_cannot_be_reached_gives_503(error_class):
    client, _ = make_client(fail_with(error_class))

    response = client.get(URL, headers=RIGHT_HEADER)

    assert_error(response, 503, "database_unavailable")


def test_a_database_that_refuses_the_read_also_gives_503_and_hides_its_text():
    error = {"code": "PGRST205", "message": "Could not find the table in the schema cache"}
    client, _ = make_client(database_answers(404, error))

    response = client.get(URL, headers=RIGHT_HEADER)

    assert_error(response, 503, "database_unavailable")
    assert "schema cache" not in response.text


def test_one_failed_read_out_of_three_makes_the_whole_call_fail():
    client, seen = make_client(crews_table_missing)

    response = client.get(URL, headers=RIGHT_HEADER)

    assert_error(response, 503, "database_unavailable")
    assert len(seen) == 3


# --- secrets and database text stay out of answers and logs ---


def test_a_failed_read_logs_the_table_the_status_and_the_database_code(caplog):
    error = {"code": "PGRST205", "message": "Could not find the table in the schema cache"}
    client, _ = make_client(database_answers(404, error))

    with caplog.at_level(logging.DEBUG):
        client.get(URL, headers=RIGHT_HEADER)

    assert "Keep-alive read of profiles failed" in caplog.text
    assert "HTTP 404" in caplog.text
    assert "PGRST205" in caplog.text
    assert "schema cache" not in caplog.text


def test_neither_secret_appears_in_the_answer_or_the_logs_when_the_database_is_down(caplog):
    client, _ = make_client(fail_with(httpx.ConnectError))

    with caplog.at_level(logging.DEBUG):
        response = client.get(URL, headers=RIGHT_HEADER)

    assert "Keep-alive read of profiles failed" in caplog.text  # our own log line was captured
    assert FAKE_CRON_SECRET not in response.text
    assert FAKE_SECRET_KEY not in response.text
    assert FAKE_CRON_SECRET not in caplog.text
    assert FAKE_SECRET_KEY not in caplog.text


def test_a_wrong_secret_is_not_repeated_in_the_answer_or_the_logs(caplog):
    client, _ = make_client()

    with caplog.at_level(logging.DEBUG):
        response = client.get(URL, headers={"Authorization": "Bearer guess-12345"})

    assert_error(response, 401, "unauthorized")
    assert "Keep-alive refused" in caplog.text  # our own log line was captured
    assert "guess-12345" not in response.text
    assert "guess-12345" not in caplog.text
    assert FAKE_CRON_SECRET not in response.text
    assert FAKE_CRON_SECRET not in caplog.text


def test_neither_secret_appears_in_the_logs_when_everything_works(caplog):
    client, _ = make_client()

    with caplog.at_level(logging.DEBUG):
        client.get(URL, headers=RIGHT_HEADER)

    assert FAKE_CRON_SECRET not in caplog.text
    assert FAKE_SECRET_KEY not in caplog.text
