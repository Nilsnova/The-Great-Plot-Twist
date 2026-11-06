"""Tests for routes/me.py: GET /api/me, with a fake login check and a fake database.

No test uses the network. Two fakes stand in for Supabase:
  * a fake login check that knows exactly one token, and
  * a fake database that holds the rows of TWO players. It understands the "column=eq.value"
    filter, so a test can prove that the route hands back only the signed-in player's rows.

In every table the OTHER player's row comes first. A route that forgot its filter would pick
that row up, and the tests below would catch it.

The route makes five reads: the profile, wallet, seats, entry profile and reroll record (the
kit and the start place, package A3). The entry profile is read last on purpose: a test checks that
a refused seats read stops the route after three reads.

The last section guards the two files that ship with this route and could drift away from it
unnoticed: the sign-in check page (frontend/public/auth-check.*) and vercel.json, which must hold
no cron entry. They are read as text, like the migration in test_wallet_matches_migration.py.
"""

import json
import logging
from dataclasses import replace
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from server.app import create_app
from server.auth import PlayerVerifier
from server.routes.config import AuthConfig
from server.routes.me import MeResponse
from server.settings import Settings
from server.tests.helpers import (
    CONFIGURED_SETTINGS,
    FAKE_SECRET_KEY,
    REPO_ROOT,
    FakeClock,
    FakeReply,
    assert_error,
    fail_with,
    make_admin,
    read_check_page,
    read_check_script_without_comments,
)

URL = "/api/me"
TOKEN = "test.octocat.signature"
RIGHT_HEADER = {"Authorization": f"Bearer {TOKEN}"}

# The signed-in player, and another player whose data must never show up.
PLAYER_ID = "11111111-2222-3333-4444-555555555555"
NAME = "Captain-111111"
COINS = 70
CREW_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
OTHER_PLAYER_ID = "99999999-8888-7777-6666-555555555555"
OTHER_NAME = "Captain-999999"
OTHER_COINS = 424242
OTHER_CREW_ID = "ffffffff-0000-1111-2222-333333333333"
SECOND_CREW_ID = "12121212-3434-5656-7878-909090909090"

MY_CREW = {"id": CREW_ID, "mode": "solo", "status": "forming"}
MY_SEAT = {"player_id": PLAYER_ID, "seat_no": 1, "crews": MY_CREW}

# The entry profiles (package A3). The other player is a Stranger who starts in the harbor, and the
# signed-in player is a True Keeper who starts on the island: a kit or a place that shows up in the
# wrong answer is easy to spot.
OTHER_ENTRY = {"player_id": OTHER_PLAYER_ID, "kit": "stranger", "start_place": "saltreach_harbor"}
MY_ENTRY = {"player_id": PLAYER_ID, "kit": "true_keeper", "start_place": "lighthouse_isle"}


def make_tables() -> dict[str, list[dict[str, Any]]]:
    """The rows in the fake database. A fresh copy for each test, so a test may change it."""
    return {
        "profiles": [
            {"id": OTHER_PLAYER_ID, "display_name": OTHER_NAME},
            {"id": PLAYER_ID, "display_name": NAME},
        ],
        "wallets": [
            {"player_id": OTHER_PLAYER_ID, "balance": OTHER_COINS},
            {"player_id": PLAYER_ID, "balance": COINS},
        ],
        "crew_seats": [
            {
                "player_id": OTHER_PLAYER_ID,
                "seat_no": 2,
                "crews": {"id": OTHER_CREW_ID, "mode": "crew", "status": "active"},
            },
            MY_SEAT,
        ],
        "entry_profiles": [OTHER_ENTRY, MY_ENTRY],
        "captain_name_rerolls": [{"player_id": OTHER_PLAYER_ID}],
    }


def without_the_player(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The same rows, minus the ones that belong to the signed-in player."""
    return [row for row in rows if PLAYER_ID not in row.values()]


def database_with(tables: dict[str, list[dict[str, Any]]]) -> FakeReply:
    """A fake database that holds these tables and understands the filter "column=eq.value"."""

    def reply(request: httpx.Request) -> httpx.Response:
        table_name = request.url.path.rsplit("/", 1)[-1]
        rows = tables[table_name]
        for column, condition in request.url.params.items():
            if condition.startswith("eq."):
                wanted = condition.removeprefix("eq.")
                rows = [row for row in rows if row[column] == wanted]
        return httpx.Response(200, json=rows)

    return reply


def database_answers(status: int, body: dict) -> FakeReply:
    """A fake database that answers every read with this status and this JSON."""
    return lambda request: httpx.Response(status, json=body)


def database_where(table_name: str, rows: list[Any]) -> FakeReply:
    """A fake database where one table answers with exactly these rows, whatever is asked."""
    normal_reply = database_with(make_tables())

    def reply(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith(f"/{table_name}"):
            return httpx.Response(200, json=rows)
        return normal_reply(request)

    return reply


def crews_read_fails(request: httpx.Request) -> httpx.Response:
    """A fake database where the profile and the wallet are fine but the seats read is refused."""
    if request.url.path.endswith("/crew_seats"):
        error = {"code": "PGRST200", "message": "Could not find a relationship in the schema cache"}
        return httpx.Response(400, json=error)
    return database_with(make_tables())(request)


def login_works(request: httpx.Request) -> httpx.Response:
    """A fake Supabase login check that knows one token.

    The answer carries a login name and an e-mail address, like the real one. The game must
    never show either of them.
    """
    if request.headers["authorization"] == f"Bearer {TOKEN}":
        user = {
            "id": PLAYER_ID,
            "email": "octocat@example.com",
            "user_metadata": {"user_name": "octocat"},
        }
        return httpx.Response(200, json=user)
    return httpx.Response(401, json={"msg": "invalid JWT"})


def make_client(
    database_reply: FakeReply | None = None,
    login_reply: FakeReply = login_works,
    settings: Settings = CONFIGURED_SETTINGS,
) -> tuple[TestClient, list[httpx.Request]]:
    """The app, wired to a fake login check and a fake database.

    Also returns every request that the database received. With no `database_reply`, the
    database holds the normal rows from make_tables().
    """
    if database_reply is None:
        database_reply = database_with(make_tables())
    verifier = PlayerVerifier(
        settings, transport=httpx.MockTransport(login_reply), clock=FakeClock()
    )
    secret_key = settings.supabase_secret_key.get_secret_value()
    admin, seen = make_admin(database_reply, settings.supabase_url, secret_key)
    return TestClient(create_app(settings, verifier=verifier, admin=admin)), seen


# --- the normal answer ---


def test_a_signed_in_player_gets_their_name_coins_and_crews():
    client, _ = make_client()

    response = client.get(URL, headers=RIGHT_HEADER)

    assert response.status_code == 200
    # Changed on purpose (A2): the answer gained captainName, kit and place. The four values it
    # had before (id, displayName, coins and crews) are unchanged. This player still has the
    # sign-up placeholder, so there is no captain name yet.
    # Changed on purpose (A3): kit and place used to be empty. They now come from the entry
    # profile of a player who has finished Act 1.
    assert response.json() == {
        "id": PLAYER_ID,
        "displayName": NAME,
        "coins": COINS,
        "crews": [{"id": CREW_ID, "mode": "solo", "status": "forming", "seatNo": 1}],
        "captainName": None,
        "kit": "true_keeper",
        "place": "lighthouse_isle",
        "rerollsLeft": 1,
        "isHost": False,
    }


def test_a_player_with_no_coins_gets_0_and_not_an_error():
    # A new wallet starts at 0. Zero is a balance, not a missing row.
    tables = make_tables()
    tables["wallets"][1]["balance"] = 0
    client, _ = make_client(database_with(tables))

    response = client.get(URL, headers=RIGHT_HEADER)

    assert response.status_code == 200
    assert response.json()["coins"] == 0


def test_a_player_who_sits_in_no_crew_gets_an_empty_list():
    tables = make_tables()
    tables["crew_seats"] = without_the_player(tables["crew_seats"])
    client, _ = make_client(database_with(tables))

    response = client.get(URL, headers=RIGHT_HEADER)

    assert response.status_code == 200
    assert response.json()["crews"] == []


def test_a_player_in_two_crews_gets_both_in_the_order_the_database_sent_them():
    second_seat = {
        "player_id": PLAYER_ID,
        "seat_no": 3,
        "crews": {"id": SECOND_CREW_ID, "mode": "crew", "status": "finished"},
    }
    tables = make_tables()
    tables["crew_seats"] = [MY_SEAT, second_seat]
    client, _ = make_client(database_with(tables))

    crews = client.get(URL, headers=RIGHT_HEADER).json()["crews"]

    assert [crew["id"] for crew in crews] == [CREW_ID, SECOND_CREW_ID]
    assert [crew["seatNo"] for crew in crews] == [1, 3]


def test_the_answer_may_not_be_kept_by_any_cache():
    # It holds personal data. A shared cache (the hosting network, a proxy) must not keep it.
    client, _ = make_client()

    response = client.get(URL, headers=RIGHT_HEADER)

    assert response.headers["cache-control"] == "private, no-store"


# --- the captain name, the kit and the place (package A2) ---


def tables_with_name(display_name: str) -> dict[str, list[dict[str, Any]]]:
    """The normal rows, but the signed-in player has this display name."""
    tables = make_tables()
    tables["profiles"][1]["display_name"] = display_name
    return tables


def test_captain_name_is_null_while_the_name_is_the_placeholder():
    # NAME is "Captain-" and the first 6 characters of PLAYER_ID: what the sign-up trigger writes.
    client, _ = make_client()

    body = client.get(URL, headers=RIGHT_HEADER).json()

    assert body["displayName"] == "Captain-111111"
    assert body["captainName"] is None


def test_captain_name_is_the_display_name_once_generated():
    client, _ = make_client(database_with(tables_with_name("Brave Puffin 17")))

    body = client.get(URL, headers=RIGHT_HEADER).json()

    assert body["displayName"] == "Brave Puffin 17"
    assert body["captainName"] == "Brave Puffin 17"


def test_kit_and_place_are_null_before_act_1():
    # Changed on purpose (A3): this test used to check the placeholder in the route. It now checks
    # the real rule. A player who has not finished Act 1 has no entry profile, so both are empty.
    tables = make_tables()
    tables["entry_profiles"] = without_the_player(tables["entry_profiles"])
    client, _ = make_client(database_with(tables))

    body = client.get(URL, headers=RIGHT_HEADER).json()

    assert body["kit"] is None
    assert body["place"] is None


def test_kit_and_place_are_the_ones_in_the_entry_profile():
    tables = make_tables()
    tables["entry_profiles"] = [
        {"player_id": PLAYER_ID, "kit": "informant", "start_place": "saltreach_harbor"}
    ]
    client, _ = make_client(database_with(tables))

    body = client.get(URL, headers=RIGHT_HEADER).json()

    assert body["kit"] == "informant"
    assert body["place"] == "saltreach_harbor"


def test_the_kit_is_never_another_players_kit():
    # Only the other player has finished Act 1. Their row must not leak into this answer, neither
    # as the kit nor as the place.
    tables = make_tables()
    tables["entry_profiles"] = [OTHER_ENTRY]
    client, _ = make_client(database_with(tables))

    response = client.get(URL, headers=RIGHT_HEADER)

    assert response.json()["kit"] is None
    assert response.json()["place"] is None
    assert "stranger" not in response.text
    assert "saltreach_harbor" not in response.text


def test_the_players_own_entry_profile_wins_when_the_other_players_row_comes_first():
    client, _ = make_client()  # the other player's row is first in the table

    body = client.get(URL, headers=RIGHT_HEADER).json()

    assert (body["kit"], body["place"]) == ("true_keeper", "lighthouse_isle")


def test_get_me_only_reads():
    # A GET must never change anything. In particular it must not give a player a captain name
    # by itself: that is POST /api/me/name. A route that named players while reading would send a
    # database function call (a POST) here.
    client, seen = make_client()

    client.get(URL, headers=RIGHT_HEADER)

    # G9 R10 adds a fifth read for the verified player's reroll record.
    assert [request.method for request in seen] == ["GET"] * 5
    assert not any("/rpc/" in request.url.path for request in seen)


# --- what the route asks the database ---


def test_it_reads_the_profile_wallet_seats_entry_and_reroll_record_with_get():
    # G9 R10 appends the reroll read after the existing four reads.
    client, seen = make_client()

    client.get(URL, headers=RIGHT_HEADER)

    assert [request.method for request in seen] == ["GET"] * 5
    assert [request.url.path for request in seen] == [
        "/rest/v1/profiles",
        "/rest/v1/wallets",
        "/rest/v1/crew_seats",
        "/rest/v1/entry_profiles",
        "/rest/v1/captain_name_rerolls",
    ]


def test_every_read_is_filtered_on_the_verified_player_id_and_asks_for_few_columns():
    client, seen = make_client()

    client.get(URL, headers=RIGHT_HEADER)

    assert [dict(request.url.params) for request in seen] == [
        {"select": "display_name", "id": f"eq.{PLAYER_ID}", "limit": "1"},
        {"select": "balance", "player_id": f"eq.{PLAYER_ID}", "limit": "1"},
        {
            "select": "seat_no,crews(id,mode,status)",
            "player_id": f"eq.{PLAYER_ID}",
            "order": "joined_at.desc",
            "limit": "20",
        },
        # Changed on purpose (A3): the fourth read, for the kit and the start place.
        {"select": "kit,start_place", "player_id": f"eq.{PLAYER_ID}", "limit": "1"},
        {"select": "player_id", "player_id": f"eq.{PLAYER_ID}", "limit": "1"},
    ]


def test_the_reads_use_the_supabase_secret_key():
    client, seen = make_client()

    client.get(URL, headers=RIGHT_HEADER)

    # G9 R10: five scoped reads, all through the existing server credential.
    assert [request.headers["apikey"] for request in seen] == [FAKE_SECRET_KEY] * 5


def test_the_player_id_comes_from_the_login_and_never_from_the_request():
    # Someone who changes the request must not be able to ask for another player's data.
    client, seen = make_client()
    sneaky_address = (
        f"{URL}?id={OTHER_PLAYER_ID}&playerId={OTHER_PLAYER_ID}&player_id={OTHER_PLAYER_ID}"
    )
    sneaky_headers = {**RIGHT_HEADER, "X-Player-Id": OTHER_PLAYER_ID}

    response = client.get(sneaky_address, headers=sneaky_headers)

    assert response.json()["id"] == PLAYER_ID
    assert all(OTHER_PLAYER_ID not in str(request.url) for request in seen)


# --- never another player's data ---


def test_the_answer_holds_only_the_signed_in_players_data():
    client, _ = make_client()

    response = client.get(URL, headers=RIGHT_HEADER)

    assert response.status_code == 200
    for other_players_value in (OTHER_PLAYER_ID, OTHER_NAME, str(OTHER_COINS), OTHER_CREW_ID):
        assert other_players_value not in response.text


def test_the_name_is_the_one_in_the_database_and_never_the_login_name_or_email():
    client, _ = make_client()

    response = client.get(URL, headers=RIGHT_HEADER)

    assert response.json()["displayName"] == NAME
    assert "octocat" not in response.text
    assert "example.com" not in response.text


# --- who may call it ---


def test_without_a_token_it_answers_401_and_reads_nothing():
    client, seen = make_client()

    response = client.get(URL)

    assert_error(response, 401, "unauthorized")
    assert response.headers["www-authenticate"] == "Bearer"
    assert seen == []


def test_a_token_that_supabase_refuses_gets_401_and_reads_nothing():
    client, seen = make_client()

    response = client.get(URL, headers={"Authorization": "Bearer test.nobody-issued.signature"})

    assert_error(response, 401, "unauthorized")
    assert seen == []


def test_a_malformed_authorization_header_gets_401_and_reads_nothing():
    client, seen = make_client()

    response = client.get(URL, headers={"Authorization": TOKEN})

    assert_error(response, 401, "unauthorized")
    assert seen == []


def test_post_is_not_allowed():
    client, seen = make_client()

    response = client.post(URL, headers=RIGHT_HEADER)

    assert_error(response, 405, "method_not_allowed")
    assert seen == []


def test_a_login_check_that_is_down_gives_503_and_reads_nothing():
    client, seen = make_client(login_reply=fail_with(httpx.ConnectError))

    response = client.get(URL, headers=RIGHT_HEADER)

    assert_error(response, 503, "auth_unavailable")
    assert seen == []


def test_a_server_without_login_settings_gives_503_and_reads_nothing():
    settings = replace(CONFIGURED_SETTINGS, supabase_publishable_key="")
    client, seen = make_client(settings=settings)

    response = client.get(URL, headers=RIGHT_HEADER)

    assert_error(response, 503, "auth_not_configured")
    assert seen == []


# --- a player whose rows do not exist yet ---


@pytest.mark.parametrize(("missing_table", "reads_made"), [("profiles", 1), ("wallets", 2)])
def test_a_player_without_a_profile_or_wallet_row_gets_a_clear_404(missing_table, reads_made):
    # This happens to a player who signed up before the database was ready: the sign-up
    # trigger never ran for them. The answer says so, and it stops at the first missing row.
    tables = make_tables()
    tables[missing_table] = without_the_player(tables[missing_table])
    client, seen = make_client(database_with(tables))

    response = client.get(URL, headers=RIGHT_HEADER)

    assert_error(response, 404, "player_not_set_up")
    assert "not set up" in response.json()["error"]["message"]
    assert len(seen) == reads_made


def test_the_404_for_a_missing_row_does_not_fall_back_to_another_players_row():
    tables = make_tables()
    tables["wallets"] = without_the_player(tables["wallets"])
    client, _ = make_client(database_with(tables))

    response = client.get(URL, headers=RIGHT_HEADER)

    assert_error(response, 404, "player_not_set_up")
    assert str(OTHER_COINS) not in response.text


# --- the database in trouble ---


def test_without_the_secret_key_it_gives_503_database_not_configured():
    settings = replace(CONFIGURED_SETTINGS, supabase_secret_key=SecretStr(""))
    client, seen = make_client(settings=settings)

    response = client.get(URL, headers=RIGHT_HEADER)

    assert_error(response, 503, "database_not_configured")
    assert seen == []


@pytest.mark.parametrize("error_class", [httpx.ConnectError, httpx.ReadTimeout])
def test_a_database_that_cannot_be_reached_gives_503(error_class):
    client, _ = make_client(fail_with(error_class))

    response = client.get(URL, headers=RIGHT_HEADER)

    assert_error(response, 503, "database_unavailable")


def test_a_database_with_a_server_error_gives_503_and_hides_its_text():
    client, _ = make_client(database_answers(500, {"message": "internal detail"}))

    response = client.get(URL, headers=RIGHT_HEADER)

    assert_error(response, 503, "database_unavailable")
    assert "internal detail" not in response.text


@pytest.mark.parametrize("status", [400, 401, 403, 404])
def test_a_database_that_refuses_the_read_gives_502_and_hides_its_text(status):
    refusal = {"code": "42501", "message": "permission denied for table wallets"}
    client, _ = make_client(database_answers(status, refusal))

    response = client.get(URL, headers=RIGHT_HEADER)

    assert_error(response, 502, "database_error")
    assert "permission denied" not in response.text


def test_a_refused_seats_read_gives_502_and_hides_its_text():
    # The seats read is the only one that asks the database to join two tables. It is the third
    # read, and the route stops there: the entry profile (the fourth read) is never asked for.
    client, seen = make_client(crews_read_fails)

    response = client.get(URL, headers=RIGHT_HEADER)

    assert_error(response, 502, "database_error")
    assert "relationship" not in response.text
    assert len(seen) == 3


def entry_read_fails(request: httpx.Request) -> httpx.Response:
    """A fake database where the entry profile read is refused and the other reads are fine."""
    if request.url.path.endswith("/entry_profiles"):
        error = {"code": "42P01", "message": 'relation "public.entry_profiles" does not exist'}
        return httpx.Response(404, json=error)
    return database_with(make_tables())(request)


def test_a_refused_entry_profile_read_gives_502_and_hides_its_text():
    # This is what a server that is deployed before the entry profiles migration is applied would
    # see. The answer is the standard database error, and it says nothing about the table.
    client, seen = make_client(entry_read_fails)

    response = client.get(URL, headers=RIGHT_HEADER)

    assert_error(response, 502, "database_error")
    assert "entry_profiles" not in response.text
    assert len(seen) == 4


@pytest.mark.parametrize(
    ("table_name", "strange_rows"),
    [
        ("profiles", [{"id": PLAYER_ID}]),  # no display_name
        ("profiles", [{"id": PLAYER_ID, "display_name": 42}]),  # a number, not text
        ("profiles", ["not a row"]),
        ("wallets", [{"player_id": PLAYER_ID}]),  # no balance
        ("wallets", [{"player_id": PLAYER_ID, "balance": "70"}]),  # text, not a number
        ("wallets", [{"player_id": PLAYER_ID, "balance": 70.5}]),  # not a whole number
        ("wallets", [{"player_id": PLAYER_ID, "balance": True}]),  # True is not a balance
        ("crew_seats", [{"player_id": PLAYER_ID, "seat_no": 1, "crews": None}]),
        ("crew_seats", [{"player_id": PLAYER_ID, "seat_no": 1, "crews": {"id": CREW_ID}}]),
        ("crew_seats", [{"player_id": PLAYER_ID, "seat_no": "1", "crews": MY_CREW}]),
        ("crew_seats", [{"player_id": PLAYER_ID, "crews": MY_CREW}]),  # no seat_no
        ("entry_profiles", [{"player_id": PLAYER_ID, "kit": "witness"}]),  # no start_place
        ("entry_profiles", [{"player_id": PLAYER_ID, "start_place": "lighthouse_isle"}]),  # no kit
        ("entry_profiles", [{"player_id": PLAYER_ID, "kit": 7, "start_place": "lighthouse_isle"}]),
        ("entry_profiles", [{"player_id": PLAYER_ID, "kit": "witness", "start_place": 7}]),
        ("entry_profiles", [{"player_id": PLAYER_ID, "kit": None, "start_place": None}]),
        ("entry_profiles", ["not a row"]),
    ],
)
def test_a_row_we_cannot_read_gives_502_and_not_a_crash(table_name, strange_rows):
    client, _ = make_client(database_where(table_name, strange_rows))

    response = client.get(URL, headers=RIGHT_HEADER)

    assert_error(response, 502, "database_error")


def test_a_database_answer_that_is_not_a_list_gives_502():
    client, _ = make_client(database_answers(200, {"rows": []}))

    response = client.get(URL, headers=RIGHT_HEADER)

    assert_error(response, 502, "database_error")


# --- secrets and personal data stay out of answers and logs ---


def test_neither_the_token_nor_the_secret_key_appears_when_the_database_is_down(caplog):
    client, _ = make_client(fail_with(httpx.ConnectError))

    with caplog.at_level(logging.DEBUG):
        response = client.get(URL, headers=RIGHT_HEADER)

    assert "Database call failed" in caplog.text  # the server's own log line was captured
    for secret in (TOKEN, FAKE_SECRET_KEY):
        assert secret not in response.text
        assert secret not in caplog.text


def test_a_missing_row_is_logged_without_the_player_id(caplog):
    tables = make_tables()
    tables["profiles"] = without_the_player(tables["profiles"])
    client, _ = make_client(database_with(tables))

    with caplog.at_level(logging.DEBUG):
        response = client.get(URL, headers=RIGHT_HEADER)

    assert "no profile row" in caplog.text  # the server's own log line was captured
    assert PLAYER_ID not in caplog.text
    assert PLAYER_ID not in response.text
    assert TOKEN not in caplog.text


def test_nothing_secret_appears_in_the_logs_when_everything_works(caplog):
    client, _ = make_client()

    with caplog.at_level(logging.DEBUG):
        response = client.get(URL, headers=RIGHT_HEADER)

    assert response.status_code == 200
    assert TOKEN not in caplog.text
    assert FAKE_SECRET_KEY not in caplog.text


# --- the files that ship with this route: the check page, and vercel.json (no cron entry) ---


@pytest.mark.parametrize("field", ["displayName", "coins", "crews"])
def test_the_check_page_reads_this_field_of_the_me_answer(field):
    # If a package renames a field of /api/me, this test says that the page must change too.
    assert field in MeResponse.model_fields
    assert f".{field}" in read_check_script_without_comments()


@pytest.mark.parametrize("field", ["provider", "supabaseUrl"])
def test_the_check_page_reads_this_field_of_the_config_answer(field):
    assert field in AuthConfig.model_fields
    assert f".{field}" in read_check_script_without_comments()


@pytest.mark.parametrize(
    "forbidden",
    ["localStorage", "indexedDB", "document.cookie", "console."],
)
def test_the_check_page_script_never_stores_or_logs_a_login_token(forbidden):
    # The login token lives in memory only: not saved, not logged.
    #
    # Changed on purpose: "sessionStorage" used to be on this list. The sign-in now uses the PKCE
    # flow (review finding: the old flow left tokens in the browser history), and PKCE needs one
    # secret to survive the trip to GitHub and back. That secret is not a token, and the only
    # place allowed to hold it is sessionStorage. The tests in test_auth_exchange.py check that
    # sessionStorage holds that one secret and nothing else.
    assert forbidden not in read_check_script_without_comments()


def test_the_check_page_says_it_is_not_the_game_and_keeps_search_engines_out():
    page = read_check_page()

    assert "not the game" in page
    assert 'content="noindex' in page


def test_the_check_page_may_only_run_its_own_script_and_talk_to_its_own_server():
    page = read_check_page()

    assert "Content-Security-Policy" in page
    assert "script-src 'self'" in page
    assert "connect-src 'self'" in page


def test_vercel_json_has_no_cron_entry():
    # Changed on purpose (5 Nov 2026): these tests used to require a daily "crons" entry for
    # /api/keepalive. With that entry, every production deploy failed silently on our Vercel
    # project (cron together with Vercel Services), and the live site stayed on an old version.
    # The entry was removed in commit 409316e, and the deploys went live again. This test keeps
    # it from coming back. What calls the keep-alive once a day is a pending decision.
    config = json.loads((REPO_ROOT / "vercel.json").read_text())

    assert "crons" not in config


def test_vercel_functions_run_in_dublin_next_to_the_database():
    # Added on 6 Nov 2026: the live API answered from Washington (x-vercel-id ...::iad1::...),
    # the default for new projects, while the database is in Ireland (D002). The region now
    # lives in vercel.json instead of only in the dashboard, so it cannot drift back unnoticed.
    config = json.loads((REPO_ROOT / "vercel.json").read_text())

    assert config["regions"] == ["dub1"]


def test_vercel_json_sends_the_browser_security_headers():
    # Added on 6 Nov 2026 (security audit, finding 1): the live site sent no security headers.
    # The policy is G8's strict self-only CSP, plus the Supabase project (sign-in, Realtime).
    config = json.loads((REPO_ROOT / "vercel.json").read_text())
    rules = {rule["source"]: rule["headers"] for rule in config["headers"]}
    every_page = {header["key"]: header["value"] for header in rules["/(.*)"]}

    assert "script-src 'self';" in every_page["Content-Security-Policy"]
    assert "frame-ancestors 'none'" in every_page["Content-Security-Policy"]
    assert every_page["X-Content-Type-Options"] == "nosniff"
    assert every_page["Referrer-Policy"] == "strict-origin-when-cross-origin"


def test_the_keepalive_route_still_exists_for_whatever_calls_it():
    # Whatever ends up calling it daily (see the test above), the route must exist, or the free
    # Supabase project would pause after 7 days without anyone noticing.
    app_paths = TestClient(create_app(CONFIGURED_SETTINGS)).get("/api/openapi.json").json()["paths"]

    assert "/api/keepalive" in app_paths
