"""Tests for supabase_admin.py: the server-only database client, with a fake database."""

import asyncio
import json
import logging

import httpx
import pytest
from fastapi.testclient import TestClient

from server.app import create_app
from server.supabase_admin import (
    AdminDep,
    AlreadyApplied,
    InsufficientFunds,
    SupabaseAdmin,
    SupabaseNotConfigured,
    SupabaseRejected,
    SupabaseUnavailable,
    admin_from_settings,
    build_headers,
)
from server.tests.helpers import (
    CONFIGURED_SETTINGS,
    FAKE_SECRET_KEY,
    FAKE_URL,
    FakeReply,
    assert_error,
    make_admin,
)

# An old-style key is a long JWT. This one is obviously fake.
LEGACY_KEY = "legacy-service-role-token-for-tests"

# What the database sends when the SQL function raises insufficient_funds.
INSUFFICIENT_FUNDS_ERROR = {
    "code": "P0001",
    "details": None,
    "hint": None,
    "message": "insufficient_funds",
}

# What the database sends when the same player + reason + ref is used a second time.
ALREADY_APPLIED_ERROR = {
    "code": "23505",
    "details": "Key (player_id, reason, ref)=(player-1, market_buy, order-7) already exists.",
    "hint": None,
    "message": (
        'duplicate key value violates unique constraint "wallet_transactions_one_row_per_ref"'
    ),
}


def call(admin: SupabaseAdmin, name: str = "some_function", params: dict | None = None):
    """Run call_function from a normal (not async) test."""
    return asyncio.run(admin.call_function(name, params or {}))


def fail_with(error_class: type[httpx.RequestError]) -> FakeReply:
    """A fake-database reply that raises a network error."""

    def reply(request: httpx.Request) -> httpx.Response:
        raise error_class("pretend network failure", request=request)

    return reply


# --- which headers prove that the server is calling ---


def test_a_new_style_key_goes_in_the_apikey_header_only():
    headers = build_headers(FAKE_SECRET_KEY)

    assert headers["apikey"] == FAKE_SECRET_KEY
    assert "Authorization" not in headers


def test_an_old_style_key_goes_in_the_apikey_header_and_in_authorization():
    headers = build_headers(LEGACY_KEY)

    assert headers["apikey"] == LEGACY_KEY
    assert headers["Authorization"] == f"Bearer {LEGACY_KEY}"


def test_a_new_style_key_is_sent_in_the_apikey_header_only_on_the_wire():
    admin, seen = make_admin(lambda request: httpx.Response(200, json=1))

    call(admin)

    assert seen[0].headers["apikey"] == FAKE_SECRET_KEY
    assert "authorization" not in seen[0].headers


def test_an_old_style_key_is_sent_in_both_headers_on_the_wire():
    admin, seen = make_admin(lambda request: httpx.Response(200, json=1), secret_key=LEGACY_KEY)

    call(admin)

    assert seen[0].headers["apikey"] == LEGACY_KEY
    assert seen[0].headers["authorization"] == f"Bearer {LEGACY_KEY}"


# --- calling a database function ---


def test_a_function_call_is_a_post_with_json_to_the_rpc_address():
    admin, seen = make_admin(lambda request: httpx.Response(200, json=1))

    call(admin, "apply_wallet_transaction", {"p_delta": 5})

    request = seen[0]
    assert request.method == "POST"
    assert str(request.url) == f"{FAKE_URL}/rest/v1/rpc/apply_wallet_transaction"
    assert json.loads(request.content) == {"p_delta": 5}


def test_the_result_is_the_decoded_json():
    admin, _ = make_admin(lambda request: httpx.Response(200, json=1050))

    assert call(admin) == 1050


def test_a_reply_without_a_body_gives_none():
    admin, _ = make_admin(lambda request: httpx.Response(204))

    assert call(admin) is None


def test_admin_from_settings_uses_the_address_and_the_secret_key_from_the_settings():
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=1)

    admin = admin_from_settings(CONFIGURED_SETTINGS, httpx.MockTransport(handler))

    call(admin, "ping")

    assert str(seen[0].url) == f"{FAKE_URL}/rest/v1/rpc/ping"
    assert seen[0].headers["apikey"] == FAKE_SECRET_KEY


# --- typed errors ---


def test_insufficient_funds_becomes_its_own_error():
    admin, _ = make_admin(lambda request: httpx.Response(400, json=INSUFFICIENT_FUNDS_ERROR))

    with pytest.raises(InsufficientFunds) as problem:
        call(admin)

    assert problem.value.status_code == 409
    assert problem.value.code == "insufficient_funds"


@pytest.mark.parametrize(
    "error",
    [
        # The right code but another message from our SQL function.
        {"code": "P0001", "message": "wallet_not_found"},
        {"code": "P0001", "message": "insufficient_funds: 5 < 10"},
        # The right message but not raised by our SQL function.
        {"code": "23514", "message": "insufficient_funds"},
        # A check violation puts the whole failing row in "details". A ref that a player chose
        # can contain the word, so only the exact error from our function may count.
        {
            "code": "23514",
            "message": 'new row violates check constraint "wallet_transactions_spend_takes_coins"',
            "details": "Failing row contains (7, player-1, 10, market_buy, insufficient_funds).",
        },
    ],
)
def test_only_the_exact_error_from_our_sql_function_means_insufficient_funds(error):
    admin, _ = make_admin(lambda request: httpx.Response(400, json=error))

    with pytest.raises(SupabaseRejected):
        call(admin)


def test_a_repeat_in_the_ledger_becomes_its_own_error():
    admin, _ = make_admin(lambda request: httpx.Response(409, json=ALREADY_APPLIED_ERROR))

    with pytest.raises(AlreadyApplied) as problem:
        call(admin)

    assert problem.value.status_code == 409
    assert problem.value.code == "already_applied"
    assert problem.value.message == "This was already done."


def test_already_applied_hides_the_database_text():
    admin, _ = make_admin(lambda request: httpx.Response(409, json=ALREADY_APPLIED_ERROR))

    with pytest.raises(AlreadyApplied) as problem:
        call(admin)

    assert "wallet_transactions_one_row_per_ref" not in problem.value.message
    assert "order-7" not in problem.value.message


def test_other_client_errors_become_a_database_error_that_hides_the_database_text():
    error = {"code": "42883", "message": "function secret_internal_name() does not exist"}
    admin, _ = make_admin(lambda request: httpx.Response(404, json=error))

    with pytest.raises(SupabaseRejected) as problem:
        call(admin)

    assert problem.value.status_code == 502
    assert problem.value.code == "database_error"
    assert "secret_internal_name" not in problem.value.message


@pytest.mark.parametrize("status", [500, 502, 503])
def test_server_errors_become_database_unavailable(status):
    admin, _ = make_admin(lambda request: httpx.Response(status, json={"message": "boom"}))

    with pytest.raises(SupabaseUnavailable) as problem:
        call(admin)

    assert problem.value.status_code == 503
    assert problem.value.code == "database_unavailable"


@pytest.mark.parametrize("error_class", [httpx.ConnectError, httpx.ReadTimeout])
def test_network_trouble_becomes_database_unavailable(error_class):
    admin, _ = make_admin(fail_with(error_class))

    with pytest.raises(SupabaseUnavailable):
        call(admin)


def test_a_success_reply_that_is_not_json_becomes_a_database_error():
    admin, _ = make_admin(lambda request: httpx.Response(200, content=b"<html>oops</html>"))

    with pytest.raises(SupabaseRejected):
        call(admin)


def test_an_error_reply_that_is_not_json_still_gives_a_clean_error():
    admin, _ = make_admin(lambda request: httpx.Response(400, content=b"plain text"))

    with pytest.raises(SupabaseRejected):
        call(admin)


@pytest.mark.parametrize(("base_url", "key"), [("", FAKE_SECRET_KEY), (FAKE_URL, "")])
def test_missing_settings_give_not_configured_and_no_network_call(base_url, key):
    admin, seen = make_admin(lambda request: httpx.Response(200, json=1), base_url, key)

    with pytest.raises(SupabaseNotConfigured) as problem:
        call(admin)

    assert problem.value.status_code == 503
    assert problem.value.code == "database_not_configured"
    assert seen == []


@pytest.mark.parametrize(
    "name", ["../auth/v1/user", "Apply", "a b", "", "x/y", "1abc", "name;drop", "name?x=1"]
)
def test_function_names_that_could_change_the_address_are_refused(name):
    admin, seen = make_admin(lambda request: httpx.Response(200, json=1))

    with pytest.raises(ValueError, match="Not a valid database function name"):
        call(admin, name)

    assert seen == []


def test_a_typed_error_becomes_the_standard_error_shape_inside_a_route():
    admin, _ = make_admin(lambda request: httpx.Response(400, json=INSUFFICIENT_FUNDS_ERROR))
    app = create_app(CONFIGURED_SETTINGS, admin=admin)

    @app.get("/api/test/spend")
    async def spend(database: AdminDep) -> None:
        await database.call_function("apply_wallet_transaction", {})

    response = TestClient(app).get("/api/test/spend")

    assert_error(response, 409, "insufficient_funds")


def test_already_applied_becomes_the_standard_error_shape_inside_a_route():
    admin, _ = make_admin(lambda request: httpx.Response(409, json=ALREADY_APPLIED_ERROR))
    app = create_app(CONFIGURED_SETTINGS, admin=admin)

    @app.get("/api/test/spend-twice")
    async def spend_twice(database: AdminDep) -> None:
        await database.call_function("apply_wallet_transaction", {})

    response = TestClient(app).get("/api/test/spend-twice")

    assert_error(response, 409, "already_applied")
    assert "order-7" not in response.text


# --- the secret key stays secret ---


def test_the_secret_key_is_not_in_the_repr_of_the_admin_client():
    admin, _ = make_admin(lambda request: httpx.Response(200, json=1))

    assert FAKE_SECRET_KEY not in repr(admin)


def test_the_secret_key_never_appears_in_the_logs(caplog):
    admin, _ = make_admin(fail_with(httpx.ConnectError))

    with caplog.at_level(logging.DEBUG):
        with pytest.raises(SupabaseUnavailable):
            call(admin)

    assert "ConnectError" in caplog.text  # our own log line was captured
    assert FAKE_SECRET_KEY not in caplog.text
