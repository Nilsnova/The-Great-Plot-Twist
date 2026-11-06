"""Tests for routes/captain_name.py: POST /api/me/name and POST /api/me/name/reroll.

No test uses the network. A fake login check knows one token, and a fake database keeps the
players' names and re-rolls in memory and runs the same steps as the SQL functions (see
account_helpers.py), so a test can send two requests and see how the second one is answered.

The login answer carries a GitHub login name and an e-mail address, like the real one. The names
must come from the word lists only, so the tests look for both of them in every answer.
"""

import httpx
import pytest

from server.account.names import (
    PLACEHOLDER_PREFIX,
    is_valid_display_name,
    load_word_lists,
)
from server.tests.account_helpers import (
    OTHER_PLAYER_ID,
    PLACEHOLDER,
    PLAYER_ID,
    RIGHT_HEADER,
    AccountsDatabase,
    database_error,
    make_client,
    scripted_database,
    sent_arguments,
)
from server.tests.helpers import assert_error, fail_with

NAME_URL = "/api/me/name"
REROLL_URL = "/api/me/name/reroll"
ACTION_UID = "r8x2k9m4"
OTHER_ACTION_UID = "n3p7q1w5"

WORDS = load_word_lists()


def a_new_player() -> AccountsDatabase:
    """A database with the signed-in player, who still has the sign-up placeholder."""
    accounts = AccountsDatabase()
    accounts.add_player(OTHER_PLAYER_ID, "Silver Seal 33")  # first: a route without a filter fails
    accounts.add_player(PLAYER_ID)
    return accounts


def a_named_player(name: str = "Brave Puffin 17") -> AccountsDatabase:
    accounts = a_new_player()
    accounts.profiles[PLAYER_ID] = name
    return accounts


def is_a_name_from_the_lists(name: str) -> bool:
    adjective, noun, number = name.split(" ")
    return adjective in WORDS.adjectives and noun in WORDS.nouns and 10 <= int(number) <= 99


# --- POST /api/me/name: the first captain name ---


def test_a_new_player_gets_a_generated_name():
    accounts = a_new_player()
    client, seen = make_client(accounts)

    response = client.post(NAME_URL, headers=RIGHT_HEADER)

    assert response.status_code == 200
    body = response.json()
    assert list(body) == ["captainName", "rerollsLeft"]
    assert is_a_name_from_the_lists(body["captainName"])
    assert body["rerollsLeft"] == 1
    assert accounts.profiles[PLAYER_ID] == body["captainName"]
    assert response.headers["cache-control"] == "private, no-store"
    assert [request.url.path for request in seen] == ["/rest/v1/rpc/assign_captain_name"]
    assert sent_arguments(seen[0]) == {
        "p_player_id": PLAYER_ID,
        "p_placeholder": PLACEHOLDER,
        "p_name": body["captainName"],
    }


def test_asking_twice_keeps_the_first_name(monkeypatch):
    # The second request picks another name, but the database keeps the first one.
    picked = iter(["Brave Puffin 17", "Calm Gannet 42"])
    monkeypatch.setattr("server.routes.captain_name.pick_name", lambda words: next(picked))
    accounts = a_new_player()
    client, _ = make_client(accounts)

    first = client.post(NAME_URL, headers=RIGHT_HEADER)
    second = client.post(NAME_URL, headers=RIGHT_HEADER)

    assert first.json() == {"captainName": "Brave Puffin 17", "rerollsLeft": 1}
    assert second.status_code == 200
    assert second.json() == {"captainName": "Brave Puffin 17", "rerollsLeft": 1}
    assert accounts.profiles[PLAYER_ID] == "Brave Puffin 17"


def test_asking_after_the_re_roll_shows_that_no_re_roll_is_left():
    accounts = a_named_player()
    accounts.rerolls[PLAYER_ID] = ACTION_UID
    client, _ = make_client(accounts)

    response = client.post(NAME_URL, headers=RIGHT_HEADER)

    assert response.json() == {"captainName": "Brave Puffin 17", "rerollsLeft": 0}


def test_the_name_never_comes_from_the_login():
    # The fake login says the player is "octocat" at example.com. Neither may appear anywhere:
    # not in the answer and not in what the server sends to the database.
    accounts = a_new_player()
    client, seen = make_client(accounts)

    response = client.post(NAME_URL, headers=RIGHT_HEADER)

    assert is_a_name_from_the_lists(response.json()["captainName"])
    assert "octocat" not in response.text
    assert "example.com" not in response.text
    for request in seen:
        assert b"octocat" not in request.content
        assert "octocat" not in str(request.url)


def test_the_answer_may_not_be_kept_by_any_cache():
    client, _ = make_client(a_new_player())

    response = client.post(NAME_URL, headers=RIGHT_HEADER)

    assert response.headers["cache-control"] == "private, no-store"


def test_a_player_without_a_profile_gets_404_player_not_set_up():
    client, _ = make_client(AccountsDatabase())

    response = client.post(NAME_URL, headers=RIGHT_HEADER)

    assert_error(response, 404, "player_not_set_up")


def test_the_player_id_comes_from_the_login_and_never_from_the_request():
    accounts = a_new_player()
    client, seen = make_client(accounts)
    sneaky_address = f"{NAME_URL}?playerId={OTHER_PLAYER_ID}&id={OTHER_PLAYER_ID}"
    sneaky_headers = {**RIGHT_HEADER, "X-Player-Id": OTHER_PLAYER_ID}

    client.post(sneaky_address, headers=sneaky_headers)

    assert sent_arguments(seen[0])["p_player_id"] == PLAYER_ID
    assert accounts.profiles[OTHER_PLAYER_ID] == "Silver Seal 33"


def test_get_is_not_allowed():
    client, seen = make_client(a_new_player())

    response = client.get(NAME_URL, headers=RIGHT_HEADER)

    assert_error(response, 405, "method_not_allowed")
    assert seen == []


# --- POST /api/me/name/reroll: one change ---


def test_reroll_gives_a_different_name_once():
    accounts = a_named_player("Brave Puffin 17")
    client, seen = make_client(accounts)

    response = client.post(REROLL_URL, headers=RIGHT_HEADER, json={"actionUid": ACTION_UID})

    assert response.status_code == 200
    body = response.json()
    assert body["rerollsLeft"] == 0
    assert body["captainName"] != "Brave Puffin 17"
    assert is_a_name_from_the_lists(body["captainName"])
    assert accounts.profiles[PLAYER_ID] == body["captainName"]
    assert response.headers["cache-control"] == "private, no-store"
    assert [request.url.path for request in seen] == [
        "/rest/v1/profiles",
        "/rest/v1/rpc/reroll_captain_name",
    ]
    assert dict(seen[0].url.params) == {
        "select": "display_name",
        "id": f"eq.{PLAYER_ID}",
        "limit": "1",
    }
    assert sent_arguments(seen[1]) == {
        "p_player_id": PLAYER_ID,
        "p_placeholder": PLACEHOLDER,
        "p_new_name": body["captainName"],
        "p_action_uid": ACTION_UID,
    }


def test_the_new_name_follows_the_profile_rules_and_is_not_the_current_name():
    # A few tries (test_captain_names.py checks a thousand): the name always differs and fits.
    for _ in range(5):
        client, _ = make_client(a_named_player("Brave Puffin 17"))

        response = client.post(REROLL_URL, headers=RIGHT_HEADER, json={"actionUid": ACTION_UID})

        name = response.json()["captainName"]
        assert name != "Brave Puffin 17"
        assert is_valid_display_name(name)


def test_a_second_reroll_is_409_no_rerolls_left():
    accounts = a_named_player()
    client, _ = make_client(accounts)
    first = client.post(REROLL_URL, headers=RIGHT_HEADER, json={"actionUid": ACTION_UID})

    second = client.post(REROLL_URL, headers=RIGHT_HEADER, json={"actionUid": OTHER_ACTION_UID})

    assert first.status_code == 200
    assert_error(second, 409, "no_rerolls_left")
    assert second.json()["error"]["message"] == "You already used your one re-roll."
    assert accounts.profiles[PLAYER_ID] == first.json()["captainName"]


def test_the_same_reroll_sent_twice_is_409_already_applied():
    accounts = a_named_player()
    client, _ = make_client(accounts)
    first = client.post(REROLL_URL, headers=RIGHT_HEADER, json={"actionUid": ACTION_UID})

    second = client.post(REROLL_URL, headers=RIGHT_HEADER, json={"actionUid": ACTION_UID})

    assert_error(second, 409, "already_applied")
    assert accounts.profiles[PLAYER_ID] == first.json()["captainName"]


def test_reroll_before_a_name_is_409_no_name_yet():
    accounts = a_new_player()
    client, _ = make_client(accounts)

    response = client.post(REROLL_URL, headers=RIGHT_HEADER, json={"actionUid": ACTION_UID})

    assert_error(response, 409, "no_name_yet")
    assert response.json()["error"]["message"] == "Get your captain name first."
    assert accounts.profiles[PLAYER_ID] == PLACEHOLDER
    assert accounts.rerolls == {}


def test_reroll_for_a_player_without_a_profile_is_404_and_calls_no_function():
    client, seen = make_client(AccountsDatabase())

    response = client.post(REROLL_URL, headers=RIGHT_HEADER, json={"actionUid": ACTION_UID})

    assert_error(response, 404, "player_not_set_up")
    assert [request.url.path for request in seen] == ["/rest/v1/profiles"]


def test_reroll_when_the_database_says_there_is_no_profile_is_404():
    # The profile was there for the read and gone for the function (deleted in between).
    database = scripted_database(
        tables={"profiles": [{"id": PLAYER_ID, "display_name": "Brave Puffin 17"}]},
        functions={"reroll_captain_name": lambda arguments: {"status": "missing"}},
    )
    client, _ = make_client(database)

    response = client.post(REROLL_URL, headers=RIGHT_HEADER, json={"actionUid": ACTION_UID})

    assert_error(response, 404, "player_not_set_up")


@pytest.mark.parametrize(
    "action_uid",
    ["abc", "a b c d e f g h", "a" * 65, "r8x2k9m!", "r8x2k9m4\n", "", "../../etc/x1"],
)
def test_a_bad_action_uid_is_422_and_calls_nothing(action_uid):
    client, seen = make_client(a_named_player())

    response = client.post(REROLL_URL, headers=RIGHT_HEADER, json={"actionUid": action_uid})

    assert_error(response, 422, "validation_error")
    assert seen == []


@pytest.mark.parametrize("body", [{}, {"actionUid": 12345678}, {"actionUid": None}, []])
def test_a_missing_or_odd_action_uid_is_422_and_calls_nothing(body):
    client, seen = make_client(a_named_player())

    response = client.post(REROLL_URL, headers=RIGHT_HEADER, json=body)

    assert_error(response, 422, "validation_error")
    assert seen == []


@pytest.mark.parametrize("action_uid", ["a" * 8, "a" * 64, "A-z_09-Zz"])
def test_the_shortest_and_longest_action_uid_and_all_allowed_characters_work(action_uid):
    client, _ = make_client(a_named_player())

    response = client.post(REROLL_URL, headers=RIGHT_HEADER, json={"actionUid": action_uid})

    assert response.status_code == 200


@pytest.mark.parametrize(
    "extra",
    [
        {"playerId": OTHER_PLAYER_ID},
        {"player_id": OTHER_PLAYER_ID},
        {"name": "Hacker 99"},
        {"captainName": "Hacker 99"},
        {"newName": "Hacker 99"},
    ],
)
def test_a_player_id_or_a_name_in_the_body_is_refused(extra):
    # The browser can say only "re-roll". It cannot name a player or choose the new name.
    accounts = a_named_player()
    client, seen = make_client(accounts)

    response = client.post(
        REROLL_URL, headers=RIGHT_HEADER, json={"actionUid": ACTION_UID, **extra}
    )

    assert_error(response, 422, "validation_error")
    assert seen == []
    assert accounts.profiles[PLAYER_ID] == "Brave Puffin 17"


# --- who may call them ---


@pytest.mark.parametrize(
    ("url", "body"), [(NAME_URL, None), (REROLL_URL, {"actionUid": ACTION_UID})]
)
def test_without_a_token_it_is_401_and_calls_nothing(url, body):
    client, seen = make_client(a_named_player())

    response = client.post(url, json=body)

    assert_error(response, 401, "unauthorized")
    assert response.headers["www-authenticate"] == "Bearer"
    assert seen == []


@pytest.mark.parametrize(
    ("url", "body"), [(NAME_URL, None), (REROLL_URL, {"actionUid": ACTION_UID})]
)
def test_a_token_that_supabase_refuses_gets_401_and_calls_nothing(url, body):
    client, seen = make_client(a_named_player())

    response = client.post(url, headers={"Authorization": "Bearer nobody-issued-this"}, json=body)

    assert_error(response, 401, "unauthorized")
    assert seen == []


# --- the database in trouble ---


@pytest.mark.parametrize(
    ("url", "body"), [(NAME_URL, None), (REROLL_URL, {"actionUid": ACTION_UID})]
)
@pytest.mark.parametrize("error_class", [httpx.ConnectError, httpx.ReadTimeout])
def test_a_database_that_cannot_be_reached_gives_503(url, body, error_class):
    client, _ = make_client(fail_with(error_class))

    response = client.post(url, headers=RIGHT_HEADER, json=body)

    assert_error(response, 503, "database_unavailable")


@pytest.mark.parametrize(
    ("url", "body", "function_name"),
    [
        (NAME_URL, None, "assign_captain_name"),
        (REROLL_URL, {"actionUid": ACTION_UID}, "reroll_captain_name"),
    ],
)
def test_a_unique_violation_is_a_bug_on_our_side_and_not_already_applied(url, body, function_name):
    # supabase_admin turns every unique violation into AlreadyApplied (409). For these functions
    # that would be a lie: the browser would treat a bug as "done". It must be a 502 instead.
    database = scripted_database(
        tables={"profiles": [{"id": PLAYER_ID, "display_name": "Brave Puffin 17"}]},
        functions={function_name: lambda arguments: database_error(409, "23505", "duplicate key")},
    )
    client, _ = make_client(database)

    response = client.post(url, headers=RIGHT_HEADER, json=body)

    assert_error(response, 502, "database_error")
    assert "duplicate" not in response.text


@pytest.mark.parametrize(
    "reply",
    [
        "a string",
        [],
        {},
        {"status": "named"},  # no name
        {"status": "named", "name": 42, "rerollsUsed": 0},
        {"status": "named", "name": "Brave Puffin 17", "rerollsUsed": "0"},
        {"status": "named", "name": "Brave Puffin 17", "rerollsUsed": True},
        {"status": "named", "name": "Brave Puffin 17", "rerollsUsed": -1},
        {"status": "refused", "reason": "no_rerolls_left", "name": "Brave Puffin 17"},
        {"status": "something_new"},
    ],
)
def test_an_answer_of_assign_captain_name_that_we_cannot_read_gives_502(reply):
    database = scripted_database(functions={"assign_captain_name": lambda arguments: reply})
    client, _ = make_client(database)

    response = client.post(NAME_URL, headers=RIGHT_HEADER)

    assert_error(response, 502, "database_error")


@pytest.mark.parametrize(
    "reply",
    [
        {"status": "refused", "reason": "something_new", "name": "Brave Puffin 17"},
        {"status": "refused", "reason": "no_name_yet"},  # no name
        {"status": "refused", "name": "Brave Puffin 17"},  # no reason
        {"status": "named", "name": "Brave Puffin 17"},  # no count
    ],
)
def test_an_answer_of_reroll_captain_name_that_we_cannot_read_gives_502(reply):
    database = scripted_database(
        tables={"profiles": [{"id": PLAYER_ID, "display_name": "Brave Puffin 17"}]},
        functions={"reroll_captain_name": lambda arguments: reply},
    )
    client, _ = make_client(database)

    response = client.post(REROLL_URL, headers=RIGHT_HEADER, json={"actionUid": ACTION_UID})

    assert_error(response, 502, "database_error")


def test_a_database_that_refuses_the_function_gives_502_and_hides_its_text():
    refusal = database_error(403, "42501", "permission denied for function assign_captain_name")
    database = scripted_database(functions={"assign_captain_name": lambda arguments: refusal})
    client, _ = make_client(database)

    response = client.post(NAME_URL, headers=RIGHT_HEADER)

    assert_error(response, 502, "database_error")
    assert "permission denied" not in response.text


@pytest.mark.parametrize("rows", [[{"display_name": 42}], [{"id": PLAYER_ID}], ["not a row"]])
def test_a_profile_row_we_cannot_read_gives_502_for_the_reroll(rows):
    # The fake answers every read with these rows, whatever the filter says.
    client, _ = make_client(lambda request: httpx.Response(200, json=rows))

    response = client.post(REROLL_URL, headers=RIGHT_HEADER, json={"actionUid": ACTION_UID})

    assert_error(response, 502, "database_error")


def test_the_placeholder_prefix_is_never_in_a_generated_name():
    accounts = a_new_player()
    client, _ = make_client(accounts)

    name = client.post(NAME_URL, headers=RIGHT_HEADER).json()["captainName"]

    assert not name.startswith(PLACEHOLDER_PREFIX)
