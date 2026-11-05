"""Tests for routes/auth_exchange.py: POST /api/auth/exchange, with a fake Supabase.

No test uses the network. A fake Supabase stands in for the real one. It answers a good code
with a whole session (access token, refresh token and GitHub's own token), like the real one,
so the tests can prove that only the access token comes out.

The last section guards the sign-in check page (frontend/public/auth-check.*). The page and this
route are two halves of one sign-in. The page is read as text, like the migration in
test_wallet_matches_migration.py, so the two halves cannot drift apart unnoticed.
"""

import json
import logging
from dataclasses import replace

import httpx
import pytest
from fastapi.testclient import TestClient

from server.app import create_app
from server.routes.auth_exchange import ExchangeRequest, ExchangeResponse
from server.settings import Settings
from server.sign_in_code import CodeExchanger
from server.tests.helpers import (
    CONFIGURED_SETTINGS,
    FAKE_PUBLISHABLE_KEY,
    FAKE_SECRET_KEY,
    FAKE_URL,
    FakeReply,
    assert_error,
    fail_with,
    read_check_script_without_comments,
)

URL = "/api/auth/exchange"

# What the check page sends: the one-time code from the address and the secret it made before
# it left for GitHub. The real code is a UUID. The real secret is 64 characters, made by the page.
CODE = "6f1c0c2e-9a52-4b8e-8d3a-0a7c3f1d2b44"
VERIFIER = "a1b2c3d4" * 8
BODY = {"code": CODE, "codeVerifier": VERIFIER}

# What the fake Supabase hands out for a good code. Only ACCESS_TOKEN may reach the browser.
ACCESS_TOKEN = "access-token-of-octocat"
REFRESH_TOKEN = "refresh-token-nobody-outside-supabase-may-see"
GITHUB_TOKEN = "github-token-nobody-may-see"
PLAYER_ID = "11111111-2222-3333-4444-555555555555"
EMAIL = "octocat@example.com"


def supabase_gives_a_session(request: httpx.Request) -> httpx.Response:
    """The fake Supabase answer for a good code: a whole session, like the real one."""
    session = {
        "access_token": ACCESS_TOKEN,
        "token_type": "bearer",
        "expires_in": 3600,
        "refresh_token": REFRESH_TOKEN,
        "provider_token": GITHUB_TOKEN,
        "user": {"id": PLAYER_ID, "email": EMAIL},
    }
    return httpx.Response(200, json=session)


def supabase_answers(status: int, body: dict) -> FakeReply:
    """A fake Supabase that answers every request with this status and this JSON."""
    return lambda request: httpx.Response(status, json=body)


def make_client(
    reply: FakeReply = supabase_gives_a_session,
    settings: Settings = CONFIGURED_SETTINGS,
) -> tuple[TestClient, list[httpx.Request]]:
    """The app, wired to a fake Supabase. Also returns every request that Supabase received."""
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return reply(request)

    exchanger = CodeExchanger(settings, transport=httpx.MockTransport(handler))
    return TestClient(create_app(settings, exchanger=exchanger)), seen


# --- the normal answer ---


def test_a_good_code_gives_the_access_token_and_nothing_else():
    client, _ = make_client()

    response = client.post(URL, json=BODY)

    assert response.status_code == 200
    assert response.json() == {"accessToken": ACCESS_TOKEN}


def test_the_refresh_token_and_the_github_token_never_reach_the_browser():
    # Supabase hands the server a whole session. The browser only needs the short-lived access
    # token. A refresh token never expires on the free plan, so it must not leave the server.
    client, _ = make_client()

    response = client.post(URL, json=BODY)

    for secret in (REFRESH_TOKEN, GITHUB_TOKEN, EMAIL, PLAYER_ID):
        assert secret not in response.text


def test_the_answer_may_not_be_kept_by_any_cache():
    # It holds a login token. A shared cache (the hosting network, a proxy) must not keep it.
    client, _ = make_client()

    response = client.post(URL, json=BODY)

    assert response.headers["cache-control"] == "private, no-store"


# --- what the route asks Supabase ---


def test_it_makes_one_post_to_the_token_address_of_supabase_with_the_pkce_grant():
    client, seen = make_client()

    client.post(URL, json=BODY)

    assert len(seen) == 1
    assert seen[0].method == "POST"
    assert str(seen[0].url).startswith(f"{FAKE_URL}/auth/v1/token")
    assert dict(seen[0].url.params) == {"grant_type": "pkce"}


def test_the_code_and_the_secret_go_in_the_body_and_never_in_the_address():
    client, seen = make_client()

    client.post(URL, json=BODY)

    assert json.loads(seen[0].content) == {"auth_code": CODE, "code_verifier": VERIFIER}
    assert CODE not in str(seen[0].url)
    assert VERIFIER not in str(seen[0].url)


def test_it_shows_the_publishable_key_and_never_the_secret_key():
    # This call needs no special rights. Whoever holds the code and the secret may make it, so
    # it uses the key that is public anyway.
    client, seen = make_client()

    client.post(URL, json=BODY)

    assert seen[0].headers["apikey"] == FAKE_PUBLISHABLE_KEY
    assert FAKE_SECRET_KEY not in str(seen[0].headers)


# --- a code that does not work ---


@pytest.mark.parametrize("status", [400, 401, 403, 404, 410, 422])
def test_a_code_that_supabase_refuses_gives_401_and_hides_its_text(status):
    # Supabase refuses a code that was used before, that is older than 5 minutes, that never
    # existed or whose secret does not fit. For the player they all mean: sign in again.
    refusal = {"code": status, "error_code": "flow_state_not_found", "msg": "internal detail"}
    client, _ = make_client(supabase_answers(status, refusal))

    response = client.post(URL, json=BODY)

    assert_error(response, 401, "unauthorized")
    assert response.headers["www-authenticate"] == "Bearer"
    assert "internal detail" not in response.text
    assert "flow_state" not in response.text


@pytest.mark.parametrize("status", [429, 500, 502, 503])
def test_a_supabase_that_is_busy_or_broken_gives_503(status):
    client, _ = make_client(supabase_answers(status, {"msg": "internal detail"}))

    response = client.post(URL, json=BODY)

    assert_error(response, 503, "auth_unavailable")
    assert "internal detail" not in response.text


@pytest.mark.parametrize("error_class", [httpx.ConnectError, httpx.ReadTimeout])
def test_a_supabase_that_cannot_be_reached_gives_503(error_class):
    client, _ = make_client(fail_with(error_class))

    response = client.post(URL, json=BODY)

    assert_error(response, 503, "auth_unavailable")


@pytest.mark.parametrize("missing", ["supabase_url", "supabase_publishable_key"])
def test_a_server_without_login_settings_gives_503_and_asks_supabase_nothing(missing):
    settings = replace(CONFIGURED_SETTINGS, **{missing: ""})
    client, seen = make_client(settings=settings)

    response = client.post(URL, json=BODY)

    assert_error(response, 503, "auth_not_configured")
    assert seen == []


@pytest.mark.parametrize(
    "strange_answer",
    [
        httpx.Response(200, text="this is not json"),
        httpx.Response(200, json=["a", "list"]),
        httpx.Response(200, json={}),
        httpx.Response(200, json={"access_token": ""}),
        httpx.Response(200, json={"access_token": 42}),
    ],
)
def test_an_answer_without_a_usable_access_token_gives_503(strange_answer):
    client, _ = make_client(lambda request: strange_answer)

    response = client.post(URL, json=BODY)

    assert_error(response, 503, "auth_unavailable")


# --- a request that does not fit ---


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"code": CODE},
        {"codeVerifier": VERIFIER},
        {"code": "", "codeVerifier": VERIFIER},
        {"code": CODE, "codeVerifier": "too-short"},  # PKCE wants 43 to 128 characters
        {"code": CODE, "codeVerifier": "v" * 129},
        {"code": "c" * 201, "codeVerifier": VERIFIER},
        {"code": 42, "codeVerifier": VERIFIER},
        {"code": CODE, "codeVerifier": None},
        ["a", "list"],
    ],
)
def test_a_request_that_does_not_fit_gives_422_and_asks_supabase_nothing(body):
    client, seen = make_client()

    response = client.post(URL, json=body)

    assert_error(response, 422, "validation_error")
    assert seen == []


def test_the_422_does_not_repeat_what_was_sent():
    client, _ = make_client()

    response = client.post(URL, json={"code": CODE, "codeVerifier": "recognisable-short-text"})

    assert response.status_code == 422
    assert "recognisable-short-text" not in response.text


def test_get_is_not_allowed():
    client, seen = make_client()

    response = client.get(URL)

    assert_error(response, 405, "method_not_allowed")
    assert seen == []


# --- secrets stay out of the logs ---


def test_nothing_secret_is_logged_when_everything_works(caplog):
    client, _ = make_client()

    with caplog.at_level(logging.DEBUG):
        response = client.post(URL, json=BODY)

    assert response.status_code == 200
    secrets = (CODE, VERIFIER, ACCESS_TOKEN, REFRESH_TOKEN, GITHUB_TOKEN, FAKE_PUBLISHABLE_KEY)
    for secret in secrets:
        assert secret not in caplog.text


def test_a_refused_code_is_logged_with_the_status_only(caplog):
    client, _ = make_client(supabase_answers(404, {"msg": "internal detail"}))

    with caplog.at_level(logging.DEBUG):
        client.post(URL, json=BODY)

    assert "HTTP 404" in caplog.text  # the server's own log line was captured
    for secret in (CODE, VERIFIER, FAKE_PUBLISHABLE_KEY, "internal detail"):
        assert secret not in caplog.text


def test_nothing_secret_is_logged_when_supabase_cannot_be_reached(caplog):
    client, _ = make_client(fail_with(httpx.ConnectError))

    with caplog.at_level(logging.DEBUG):
        client.post(URL, json=BODY)

    assert "ConnectError" in caplog.text  # the server's own log line was captured
    for secret in (CODE, VERIFIER, FAKE_PUBLISHABLE_KEY):
        assert secret not in caplog.text


# --- the check page: the other half of this sign-in ---


def test_the_check_page_sends_exactly_the_fields_of_the_exchange_request():
    # If a package renames a field of this route, this test says that the page must change too.
    # The page writes its body as JSON.stringify({ code, codeVerifier }). We cut out the part
    # between the two curly brackets and compare the names with the fields of the route.
    script = read_check_script_without_comments()
    start = script.index("JSON.stringify({") + len("JSON.stringify({")
    names_sent = [name.strip() for name in script[start : script.index("}", start)].split(",")]

    assert names_sent == list(ExchangeRequest.model_fields)


def test_the_check_page_reads_the_access_token_from_the_exchange_answer():
    assert "accessToken" in ExchangeResponse.model_fields
    assert ".accessToken" in read_check_script_without_comments()


def test_the_check_page_calls_the_exchange_route():
    assert "/api/auth/exchange" in read_check_script_without_comments()


def test_the_check_page_starts_the_sign_in_with_pkce():
    script = read_check_script_without_comments()

    assert "code_challenge" in script
    assert "'s256'" in script  # the way Supabase spells "SHA-256" in the address


def test_the_check_page_never_puts_the_secret_into_the_address_to_supabase():
    # The secret goes to our server in a JSON body. In the address to Supabase it would be
    # public, and PKCE would protect nothing. Only the fingerprint (code_challenge) goes there.
    assert "code_verifier" not in read_check_script_without_comments()


@pytest.mark.parametrize("token_name", ["access_token", "refresh_token", "provider_token"])
def test_the_check_page_never_reads_tokens_from_the_address(token_name):
    # Tokens in the address are the old, unsafe flow (the "implicit flow"): the browser writes
    # the whole address to its history before the page can remove it. With PKCE the address
    # holds a one-time code and nothing else.
    assert token_name not in read_check_script_without_comments()


def test_the_check_page_keeps_one_secret_in_the_tab_and_deletes_it_when_it_is_used():
    script = read_check_script_without_comments()

    assert script.count("sessionStorage.setItem(") == 1
    assert "sessionStorage.setItem(VERIFIER_KEY" in script
    assert "sessionStorage.removeItem(VERIFIER_KEY" in script
