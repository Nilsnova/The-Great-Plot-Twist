"""Tests for routes/delete_me.py: DELETE /api/me, the "delete my data" route.

No test uses the network. A fake login check knows one token, and a fake database keeps a player in
memory and runs the same steps as the SQL function delete_player (see account_helpers.py). What
the database function removes (every row of the player, the ledger too) is checked on a real
Postgres in the manual test plan (supabase/README.md, step N6). Here the tests check what the
route does: it calls the one database function with the verified id, and nothing else.
"""

import logging

import httpx
import pytest

from server.tests.account_helpers import (
    OTHER_PLAYER_ID,
    PLAYER_ID,
    RIGHT_HEADER,
    AccountsDatabase,
    database_error,
    make_client,
    scripted_database,
    sent_arguments,
)
from server.tests.helpers import assert_error, fail_with

URL = "/api/me"
CONFIRM = {"confirm": True}


def two_players() -> AccountsDatabase:
    accounts = AccountsDatabase()
    accounts.add_player(OTHER_PLAYER_ID, "Silver Seal 33")
    accounts.add_player(PLAYER_ID, "Brave Puffin 17")
    return accounts


def delete(client, **options):
    """Send DELETE /api/me with a body. The test client's own delete() cannot carry one."""
    return client.request("DELETE", URL, **options)


# --- the normal answer ---


def test_delete_calls_delete_player_once_with_the_verified_id():
    accounts = two_players()
    client, seen = make_client(accounts)

    response = delete(client, headers=RIGHT_HEADER, json=CONFIRM)

    assert response.status_code == 200
    assert response.json() == {"deleted": True}
    assert response.headers["cache-control"] == "private, no-store"
    assert [(request.method, request.url.path) for request in seen] == [
        ("POST", "/rest/v1/rpc/delete_player")
    ]
    assert sent_arguments(seen[0]) == {"p_player_id": PLAYER_ID}
    assert accounts.deleted == [PLAYER_ID]


def test_only_the_signed_in_player_is_deleted():
    accounts = two_players()
    client, _ = make_client(accounts)

    delete(client, headers=RIGHT_HEADER, json=CONFIRM)

    assert PLAYER_ID not in accounts.profiles
    assert accounts.profiles[OTHER_PLAYER_ID] == "Silver Seal 33"
    assert OTHER_PLAYER_ID in accounts.saves


def test_the_player_id_comes_from_the_login_and_never_from_the_request():
    accounts = two_players()
    client, seen = make_client(accounts)
    sneaky_address = f"{URL}?playerId={OTHER_PLAYER_ID}&id={OTHER_PLAYER_ID}"

    delete_sneakily = client.request(
        "DELETE",
        sneaky_address,
        headers={**RIGHT_HEADER, "X-Player-Id": OTHER_PLAYER_ID},
        json=CONFIRM,
    )

    assert delete_sneakily.status_code == 200
    assert sent_arguments(seen[0]) == {"p_player_id": PLAYER_ID}
    assert OTHER_PLAYER_ID in accounts.profiles


def test_a_player_id_in_the_body_is_refused():
    accounts = two_players()
    client, seen = make_client(accounts)

    response = delete(
        client, headers=RIGHT_HEADER, json={"confirm": True, "playerId": OTHER_PLAYER_ID}
    )

    assert_error(response, 422, "validation_error")
    assert seen == []


def test_after_the_deletion_the_old_token_finds_no_player():
    # The server remembers a good token for 60 seconds, so the token still passes the login
    # check for a moment. The player has no rows any more, so a read answers player_not_set_up.
    accounts = two_players()
    client, _ = make_client(accounts)
    delete(client, headers=RIGHT_HEADER, json=CONFIRM)

    after = client.get(URL, headers=RIGHT_HEADER)

    assert_error(after, 404, "player_not_set_up")


# --- confirm ---


@pytest.mark.parametrize(
    "options",
    [
        {},  # no body at all
        {"json": {}},
        {"json": {"confirm": False}},
        {"json": {"confirm": "yes"}},
        {"json": {"confirm": "true"}},
        {"json": {"confirm": 1}},
        {"json": {"confirm": None}},
        {"json": {"confirm": [True]}},
        {"json": [True]},
        {"json": None, "content": "not json"},
    ],
)
def test_delete_needs_confirm_true(options):
    accounts = two_players()
    client, seen = make_client(accounts)

    response = delete(client, headers=RIGHT_HEADER, **options)

    assert_error(response, 422, "validation_error")
    assert seen == []
    assert accounts.deleted == []


# --- who may call it ---


def test_without_a_token_it_is_401_and_deletes_nothing():
    accounts = two_players()
    client, seen = make_client(accounts)

    response = delete(client, json=CONFIRM)

    assert_error(response, 401, "unauthorized")
    assert response.headers["www-authenticate"] == "Bearer"
    assert seen == []
    assert accounts.deleted == []


def test_a_token_that_supabase_refuses_gets_401_and_deletes_nothing():
    client, seen = make_client(two_players())

    response = delete(
        client, headers={"Authorization": "Bearer test.nobody-issued-this.signature"}, json=CONFIRM
    )

    assert_error(response, 401, "unauthorized")
    assert seen == []


# --- what the route does, and what it never does ---


def test_an_account_that_is_already_gone_still_answers_200():
    # delete_player answers not_found when the login was deleted already. For the caller the
    # result is the same: the player has no data left.
    client, _ = make_client(AccountsDatabase())

    response = delete(client, headers=RIGHT_HEADER, json=CONFIRM)

    assert response.status_code == 200
    assert response.json() == {"deleted": True}


def test_deleting_twice_is_safe():
    accounts = two_players()
    client, _ = make_client(accounts)

    first = delete(client, headers=RIGHT_HEADER, json=CONFIRM)
    second = delete(client, headers=RIGHT_HEADER, json=CONFIRM)

    assert first.json() == second.json() == {"deleted": True}
    assert accounts.deleted == [PLAYER_ID]


def test_the_route_never_deletes_rows_itself():
    # One database function removes the login and, by cascade, everything else in one step. A
    # route that deleted table by table could leave a half-deleted player behind.
    client, seen = make_client(two_players())

    delete(client, headers=RIGHT_HEADER, json=CONFIRM)

    assert [(request.method, request.url.path) for request in seen] == [
        ("POST", "/rest/v1/rpc/delete_player")
    ]
    assert not any(request.method == "DELETE" for request in seen)


def test_the_route_never_touches_the_wallet():
    # The ledger rows go with the player by cascade. The wallet function is never called.
    client, seen = make_client(two_players())

    delete(client, headers=RIGHT_HEADER, json=CONFIRM)

    assert not any("apply_wallet_transaction" in request.url.path for request in seen)


# --- the log ---


def test_the_log_never_holds_the_player_id(caplog):
    client, _ = make_client(two_players())

    with caplog.at_level(logging.DEBUG):
        response = delete(client, headers=RIGHT_HEADER, json=CONFIRM)

    assert response.status_code == 200
    assert "A player deleted their account." in caplog.text  # the server's own line was captured
    assert PLAYER_ID not in caplog.text
    assert "Brave Puffin" not in caplog.text


# --- the database in trouble ---


@pytest.mark.parametrize("error_class", [httpx.ConnectError, httpx.ReadTimeout])
def test_a_database_timeout_is_503_and_says_deleting_twice_is_safe(error_class):
    client, _ = make_client(fail_with(error_class))

    response = delete(client, headers=RIGHT_HEADER, json=CONFIRM)

    assert_error(response, 503, "database_unavailable")
    assert response.json()["error"]["message"] == (
        "We could not confirm the deletion. Try again: deleting twice is safe."
    )


def test_a_server_error_of_the_database_is_503_with_the_same_message():
    database = scripted_database(
        functions={"delete_player": lambda arguments: database_error(500, "XX000", "internal")}
    )
    client, _ = make_client(database)

    response = delete(client, headers=RIGHT_HEADER, json=CONFIRM)

    assert_error(response, 503, "database_unavailable")
    assert "deleting twice is safe" in response.json()["error"]["message"]
    assert "internal" not in response.text


def test_a_database_that_refuses_the_function_gives_502_and_hides_its_text():
    refusal = database_error(403, "42501", "permission denied for function delete_player")
    client, _ = make_client(scripted_database(functions={"delete_player": lambda a: refusal}))

    response = delete(client, headers=RIGHT_HEADER, json=CONFIRM)

    assert_error(response, 502, "database_error")
    assert "permission denied" not in response.text


def test_a_unique_violation_is_a_bug_on_our_side_and_not_already_applied():
    database = scripted_database(
        functions={"delete_player": lambda arguments: database_error(409, "23505", "duplicate")}
    )
    client, _ = make_client(database)

    response = delete(client, headers=RIGHT_HEADER, json=CONFIRM)

    assert_error(response, 502, "database_error")


@pytest.mark.parametrize("reply", ["deleted", {}, {"status": "something_new"}, {"status": None}])
def test_an_answer_of_delete_player_that_we_cannot_read_gives_502(reply):
    database = scripted_database(functions={"delete_player": lambda arguments: reply})
    client, _ = make_client(database)

    response = delete(client, headers=RIGHT_HEADER, json=CONFIRM)

    assert_error(response, 502, "database_error")
