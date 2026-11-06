"""Tests for auth.py: the login check, with a fake Supabase (no network).

Each test builds an app that has one protected route, /api/test/whoami.
"""

import asyncio
import hashlib
import logging
from dataclasses import replace

import httpx
import pytest
from fastapi.testclient import TestClient

from server.app import create_app
from server.auth import (
    Player,
    PlayerDep,
    PlayerVerifier,
    hash_token,
    read_bearer_token,
)
from server.clock import Clock
from server.errors import ApiError
from server.settings import Settings
from server.tests.helpers import (
    CONFIGURED_SETTINGS,
    FAKE_PUBLISHABLE_KEY,
    FAKE_SECRET_KEY,
    FAKE_URL,
    FakeClock,
    FakeReply,
    assert_error,
)

TOKEN = "test.octocat.signature"
USER_ID = "11111111-2222-3333-4444-555555555555"


def good_answer() -> httpx.Response:
    """What Supabase answers for a good token."""
    return httpx.Response(200, json={"id": USER_ID, "user_metadata": {"user_name": "octocat"}})


def build_client(
    reply: FakeReply,
    settings: Settings = CONFIGURED_SETTINGS,
    clock: Clock | None = None,
) -> tuple[TestClient, PlayerVerifier, list[httpx.Request]]:
    """Make a test client whose app talks to a fake Supabase.

    `reply` receives each request meant for Supabase and returns (or raises) the pretend
    answer. Returns the client, the verifier and a list of every request Supabase received.
    """
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return reply(request)

    verifier = PlayerVerifier(
        settings, transport=httpx.MockTransport(handler), clock=clock or FakeClock()
    )
    app = create_app(settings, verifier=verifier)

    @app.get("/api/test/whoami")
    async def whoami(player: PlayerDep) -> dict[str, str]:
        return {"id": player.id}

    return TestClient(app), verifier, seen


def ask(client: TestClient, token: str = TOKEN):
    """Call the protected route with a Bearer token."""
    return client.get("/api/test/whoami", headers={"Authorization": f"Bearer {token}"})


def fail_with(error_class: type[httpx.RequestError]) -> FakeReply:
    """A fake-Supabase reply that raises a network error."""

    def reply(request: httpx.Request) -> httpx.Response:
        raise error_class("pretend network failure", request=request)

    return reply


# --- the Authorization header ---


def test_missing_header_is_401_and_supabase_is_not_asked():
    client, _, seen = build_client(lambda request: good_answer())

    response = client.get("/api/test/whoami")

    assert_error(response, 401, "unauthorized")
    assert response.headers["www-authenticate"] == "Bearer"
    assert seen == []


@pytest.mark.parametrize("header", ["Basic abc", "Bearer", "justatoken", "Bearer two tokens"])
def test_malformed_header_is_401_and_supabase_is_not_asked(header):
    client, _, seen = build_client(lambda request: good_answer())

    response = client.get("/api/test/whoami", headers={"Authorization": header})

    assert_error(response, 401, "unauthorized")
    assert seen == []


def test_a_token_with_non_ascii_characters_is_401_and_not_a_server_error():
    client, _, seen = build_client(lambda request: good_answer())
    odd_header = "Bearer t\xf6k\xe9n".encode("latin-1")  # raw bytes, like a broken client sends

    response = client.get("/api/test/whoami", headers={"Authorization": odd_header})

    assert_error(response, 401, "unauthorized")
    assert seen == []


def test_the_word_bearer_may_be_written_in_lowercase():
    client, _, _ = build_client(lambda request: good_answer())

    response = client.get("/api/test/whoami", headers={"Authorization": f"bearer {TOKEN}"})

    assert response.status_code == 200


def test_read_bearer_token_returns_just_the_token():
    assert read_bearer_token("Bearer abc.def.ghi") == "abc.def.ghi"


def test_read_bearer_token_rejects_a_missing_header():
    with pytest.raises(ApiError) as problem:
        read_bearer_token(None)

    assert problem.value.status_code == 401


@pytest.mark.parametrize(
    "token", ["a" * 4093 + ".b.c", "one", "one.two", "a.b.c.d", ".b.c", "a..c", "a.b."]
)
def test_oversized_or_incomplete_tokens_are_refused_before_any_login_request(token):
    client, verifier, seen = build_client(lambda request: good_answer())

    response = ask(client, token)

    assert_error(response, 401, "unauthorized")
    assert response.headers["www-authenticate"] == "Bearer"
    assert seen == []
    assert verifier.cache == {}


def test_a_three_part_token_at_the_size_limit_reaches_the_login_check():
    client, _, seen = build_client(lambda request: good_answer())

    response = ask(client, "a" * 4092 + ".b.c")

    assert response.status_code == 200
    assert len(seen) == 1


def test_direct_verification_also_refuses_incomplete_tokens_without_network():
    _, verifier, seen = build_client(lambda request: good_answer())

    with pytest.raises(ApiError) as problem:
        asyncio.run(verifier.verify("one.two"))

    assert problem.value.status_code == 401
    assert seen == []


# --- a good login ---


def test_good_token_returns_the_player():
    client, _, _ = build_client(lambda request: good_answer())

    response = ask(client)

    assert response.status_code == 200
    assert response.json() == {"id": USER_ID}


def test_supabase_is_asked_at_the_right_address_with_the_right_headers():
    client, _, seen = build_client(lambda request: good_answer())

    ask(client)

    request = seen[0]
    assert request.method == "GET"
    assert str(request.url) == f"{FAKE_URL}/auth/v1/user"
    assert request.headers["apikey"] == FAKE_PUBLISHABLE_KEY
    assert request.headers["authorization"] == f"Bearer {TOKEN}"
    assert FAKE_SECRET_KEY not in str(request.headers)  # login never uses the secret key


# --- a login that is not good ---


@pytest.mark.parametrize("status", [400, 401, 403])
def test_token_refused_by_supabase_is_401(status):
    client, _, _ = build_client(lambda request: httpx.Response(status, json={"msg": "bad jwt"}))

    assert_error(ask(client), 401, "unauthorized")


def test_supabase_down_is_503_auth_unavailable():
    client, _, _ = build_client(fail_with(httpx.ConnectError))

    assert_error(ask(client), 503, "auth_unavailable")


def test_supabase_too_slow_is_503_auth_unavailable():
    client, _, _ = build_client(fail_with(httpx.ReadTimeout))

    assert_error(ask(client), 503, "auth_unavailable")


@pytest.mark.parametrize("status", [404, 429, 500, 502])
def test_supabase_in_trouble_is_503_auth_unavailable(status):
    client, _, _ = build_client(lambda request: httpx.Response(status, json={"msg": "oops"}))

    assert_error(ask(client), 503, "auth_unavailable")


@pytest.mark.parametrize(
    "strange_answer",
    [
        lambda: httpx.Response(200, content=b"this is not json"),
        lambda: httpx.Response(200, json=[1, 2, 3]),
        lambda: httpx.Response(200, json={"no_id_here": True}),
        lambda: httpx.Response(200, json={"id": ""}),
        lambda: httpx.Response(200, json={"id": 12345}),
    ],
)
def test_strange_answer_from_supabase_is_503_auth_unavailable(strange_answer):
    client, _, _ = build_client(lambda request: strange_answer())

    assert_error(ask(client), 503, "auth_unavailable")


def test_an_error_status_is_never_accepted_even_if_the_body_looks_like_a_user():
    client, _, _ = build_client(lambda request: httpx.Response(500, json={"id": USER_ID}))

    assert_error(ask(client), 503, "auth_unavailable")


@pytest.mark.parametrize("missing", ["supabase_url", "supabase_publishable_key"])
def test_missing_supabase_settings_are_503_auth_not_configured(missing):
    settings = replace(CONFIGURED_SETTINGS, **{missing: ""})
    client, _, seen = build_client(lambda request: good_answer(), settings=settings)

    assert_error(ask(client), 503, "auth_not_configured")
    assert seen == []


def test_a_missing_header_is_still_401_when_login_is_not_configured():
    settings = replace(CONFIGURED_SETTINGS, supabase_url="")
    client, _, _ = build_client(lambda request: good_answer(), settings=settings)

    assert_error(client.get("/api/test/whoami"), 401, "unauthorized")


# --- the 60 second memory ---


def test_a_good_answer_is_remembered_for_60_seconds():
    clock = FakeClock()
    client, _, seen = build_client(lambda request: good_answer(), clock=clock)

    ask(client)
    ask(client)
    assert len(seen) == 1  # the second request did not ask Supabase again

    clock.advance(59)
    ask(client)
    assert len(seen) == 1

    clock.advance(2)  # 61 seconds since the first answer
    ask(client)
    assert len(seen) == 2


def test_each_token_is_checked_on_its_own():
    client, _, seen = build_client(lambda request: good_answer())

    ask(client, "test.one.signature")
    ask(client, "test.two.signature")

    assert len(seen) == 2


def test_refused_tokens_are_not_remembered():
    client, _, seen = build_client(lambda request: httpx.Response(401, json={}))

    ask(client)
    ask(client)

    assert len(seen) == 2


def test_old_entries_are_removed_so_the_cache_cannot_grow_forever():
    clock = FakeClock()
    client, verifier, _ = build_client(lambda request: good_answer(), clock=clock)
    ask(client, "test.one.signature")

    clock.advance(61)
    ask(client, "test.two.signature")

    assert list(verifier.cache) == [hash_token("test.two.signature")]


def test_the_cache_is_keyed_by_a_hash_and_never_holds_the_token():
    client, verifier, _ = build_client(lambda request: good_answer())

    ask(client)

    assert list(verifier.cache) == [hashlib.sha256(TOKEN.encode("utf-8")).hexdigest()]
    assert TOKEN not in repr(verifier.cache)


def test_the_token_never_appears_in_the_logs(caplog):
    client, _, _ = build_client(fail_with(httpx.ConnectError))

    with caplog.at_level(logging.DEBUG):
        ask(client)

    assert "ConnectError" in caplog.text  # our own log line was captured
    assert TOKEN not in caplog.text


@pytest.mark.parametrize("status", [400, 401, 403])
def test_a_refused_token_is_logged_with_its_status_but_never_the_token(caplog, status):
    # If the publishable key is wrong, Supabase refuses every token. This line is the only trace.
    client, _, _ = build_client(lambda request: httpx.Response(status, json={}))

    with caplog.at_level(logging.WARNING):
        ask(client)

    assert f"Supabase refused a login token: HTTP {status}" in caplog.text
    assert TOKEN not in caplog.text


# --- who the player is ---


def test_the_player_is_only_the_user_id_even_if_the_login_details_hold_a_name():
    # A player can edit their own login details in Supabase. The game must not trust a name
    # from there: other players see profiles.display_name from the database instead.
    answer = {"id": USER_ID, "user_metadata": {"user_name": "<img src=x onerror=alert(1)>"}}
    _, verifier, _ = build_client(lambda request: httpx.Response(200, json=answer))

    player = asyncio.run(verifier.verify(TOKEN))

    assert player == Player(id=USER_ID)
