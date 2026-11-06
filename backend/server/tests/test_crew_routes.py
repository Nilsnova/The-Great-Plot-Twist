"""Tests for routes/crews.py and crews/service.py: the four crew URLs.

  POST /api/crews            start a crew and get a crew code
  POST /api/crews/join       join a crew with its code
  POST /api/crews/me/start   the muster: NPC partners take the empty seats
  GET  /api/crews/me         the crew I sit in, or null

Nothing here uses the network. The login check and the database are fakes (crew_helpers.py). The
database functions answer with replies a test scripts, so each test shows how the server reacts to
one answer. What the functions really do is checked on a real Postgres by hand (steps C1 to C8 in
supabase/README.md).

Fixed facts used again and again: the signed-in player carries the kit "witness"; a stranger's
entry profile (kit "stranger") comes first in the table, so a read without its filter would pick
up the wrong kit.
"""

import re

import httpx
import pytest

from server.crews.codes import CODE_ALPHABET, CODE_LENGTH
from server.crews.store import find_arguments, take_arguments
from server.tests.crew_helpers import (
    AUTH,
    CODE,
    CREW_ID,
    FRIEND_ID,
    OTHER_CREW_ID,
    OTHER_PLAYER_ID,
    PLAYER_ID,
    STARTED_AT_IN_API,
    STARTED_AT_IN_DATABASE,
    FakeCrewDatabase,
    crew_row,
    found_reply,
    found_seat,
    make_crew_client,
    partner_seat,
    player_seat,
    refused,
    seat_of_player,
)
from server.tests.helpers import assert_error, fail_with

CREATE = "/api/crews"
JOIN = "/api/crews/join"
START = "/api/crews/me/start"
MINE = "/api/crews/me"

ME = player_seat(1, PLAYER_ID, "Brave Puffin 17", "witness")
FRIEND = player_seat(2, FRIEND_ID, "Calm Gannet 42", "stranger")


def open_seat(seat_no: int) -> dict:
    """A seat nobody holds, as the API shows it."""
    return {
        "seatNo": seat_no,
        "holder": "open",
        "name": None,
        "kit": None,
        "partnerId": None,
        "isMe": False,
    }


def seat_view(seat_no, holder, name, kit, partner_id=None, is_me=False) -> dict:
    return {
        "seatNo": seat_no,
        "holder": holder,
        "name": name,
        "kit": kit,
        "partnerId": partner_id,
        "isMe": is_me,
    }


def sailed_crew(seats=None, version=2) -> dict:
    """A crew after the muster: me in seat 1 and three partners."""
    return crew_row(
        seats
        or [
            ME,
            partner_seat(2, "deckhand", "informant"),
            partner_seat(3, "bosun", "stranger"),
            partner_seat(4, "cook", "true_keeper"),
        ],
        status="active",
        version=version,
        started_at=STARTED_AT_IN_DATABASE,
    )


# --- starting a crew ---


def test_create_gives_a_code_and_seats_me_in_seat_1():
    database = FakeCrewDatabase()
    database.script("crew_create", {"status": "created", "crewId": CREW_ID})
    database.set_crew(CREW_ID, crew_row([ME]))
    client = make_crew_client(database)

    response = client.post(CREATE, headers=AUTH)

    assert response.status_code == 200
    assert response.json() == {
        "crew": {
            "id": CREW_ID,
            "code": CODE,
            "status": "forming",
            "mode": "solo",
            "mySeat": 1,
            "startedAt": None,
            "seats": [
                seat_view(1, "player", "Brave Puffin 17", "witness", is_me=True),
                open_seat(2),
                open_seat(3),
                open_seat(4),
            ],
        }
    }


def test_create_sends_the_verified_player_the_kit_from_the_entry_profile_and_a_fresh_code():
    database = FakeCrewDatabase()
    database.script("crew_create", {"status": "created", "crewId": CREW_ID})
    database.set_crew(CREW_ID, crew_row([ME]))
    client = make_crew_client(database)

    client.post(CREATE, headers=AUTH)

    (call,) = database.calls("crew_create")
    assert call["p_player_id"] == PLAYER_ID
    assert call["p_kit"] == "witness"  # not the stranger's kit, which comes first in the table
    assert len(call["p_code"]) == CODE_LENGTH
    assert all(symbol in CODE_ALPHABET for symbol in call["p_code"])


def test_create_reads_the_kit_first_then_calls_the_function_then_reads_the_crew():
    database = FakeCrewDatabase()
    database.script("crew_create", {"status": "created", "crewId": CREW_ID})
    database.set_crew(CREW_ID, crew_row([ME]))
    client = make_crew_client(database)

    client.post(CREATE, headers=AUTH)

    assert database.routes() == ["GET entry_profiles", "POST rpc/crew_create", "GET crews"]
    assert dict(database.reads("entry_profiles")[0].url.params)["player_id"] == f"eq.{PLAYER_ID}"
    assert dict(database.reads("crews")[0].url.params)["id"] == f"eq.{CREW_ID}"


def test_create_without_a_kit_is_409_kit_needed_and_creates_nothing():
    database = FakeCrewDatabase()
    database.entry_profiles = [{"player_id": OTHER_PLAYER_ID, "kit": "stranger"}]
    client = make_crew_client(database)

    response = client.post(CREATE, headers=AUTH)

    assert_error(response, 409, "kit_needed")
    assert "Act 1" in response.json()["error"]["message"]
    assert database.routes() == ["GET entry_profiles"]


def test_create_tries_another_code_when_taken(monkeypatch):
    codes = iter(["AAAAAA", "BBBBBB"])
    monkeypatch.setattr("server.crews.service.make_crew_code", lambda: next(codes))
    database = FakeCrewDatabase()
    database.script("crew_create", refused("code_taken"), {"status": "created", "crewId": CREW_ID})
    database.set_crew(CREW_ID, crew_row([ME], code="BBBBBB"))
    client = make_crew_client(database)

    response = client.post(CREATE, headers=AUTH)

    assert response.status_code == 200
    assert [call["p_code"] for call in database.calls("crew_create")] == ["AAAAAA", "BBBBBB"]
    assert response.json()["crew"]["code"] == "BBBBBB"


def test_create_gives_up_after_five_taken_codes_with_503():
    database = FakeCrewDatabase()
    database.script("crew_create", refused("code_taken"))
    client = make_crew_client(database)

    response = client.post(CREATE, headers=AUTH)

    assert_error(response, 503, "crew_codes_busy")
    assert len(database.calls("crew_create")) == 5
    assert database.reads("crews") == []


def test_create_again_returns_my_draft():
    database = FakeCrewDatabase()
    database.script("crew_create", {"status": "existing", "crewId": CREW_ID})
    database.set_crew(CREW_ID, crew_row([ME]))
    client = make_crew_client(database)

    response = client.post(CREATE, headers=AUTH)

    assert response.status_code == 200
    assert response.json()["crew"]["id"] == CREW_ID
    assert response.json()["crew"]["code"] == CODE
    assert len(database.calls("crew_create")) == 1


def test_create_while_in_another_open_crew_is_409():
    database = FakeCrewDatabase()
    database.script("crew_create", refused("already_in_crew"))
    client = make_crew_client(database)

    response = client.post(CREATE, headers=AUTH)

    assert_error(response, 409, "already_in_crew")
    assert database.reads("crews") == []


def test_create_for_a_player_without_a_profile_is_404_player_not_set_up():
    database = FakeCrewDatabase()
    database.script("crew_create", {"status": "missing"})
    client = make_crew_client(database)

    response = client.post(CREATE, headers=AUTH)

    assert_error(response, 404, "player_not_set_up")


# --- joining with a code ---


def test_a_wrong_code_is_404_and_changes_nothing():
    database = FakeCrewDatabase()
    database.script("crew_find_by_code", refused("wrong_code"))
    client = make_crew_client(database)

    response = client.post(JOIN, headers=AUTH, json={"code": "zzzzzz"})

    assert_error(response, 404, "wrong_code")
    assert database.routes() == ["GET entry_profiles", "POST rpc/crew_find_by_code"]
    assert database.calls("crew_find_by_code") == [find_arguments(PLAYER_ID, "ZZZZZZ")]


def test_too_many_wrong_codes_is_429_with_retry_after():
    database = FakeCrewDatabase()
    database.script("crew_find_by_code", refused("too_many_attempts", retryAfterSeconds=42))
    client = make_crew_client(database)

    response = client.post(JOIN, headers=AUTH, json={"code": CODE})

    assert_error(response, 429, "too_many_requests")
    assert response.headers["retry-after"] == "42"
    assert "42" in response.json()["error"]["message"]
    assert database.reads("crews") == []


def test_a_wait_of_one_second_is_written_in_the_singular():
    database = FakeCrewDatabase()
    database.script("crew_find_by_code", refused("too_many_attempts", retryAfterSeconds=1))
    client = make_crew_client(database)

    response = client.post(JOIN, headers=AUTH, json={"code": CODE})

    assert response.headers["retry-after"] == "1"
    assert "Wait 1 second," in response.json()["error"]["message"]


@pytest.mark.parametrize("typed", ["K7QF", "K7QF2O", "", "K7QF2M!!", "x" * 21, "!!!!!!"])
def test_a_badly_formed_code_is_422_and_costs_no_guess(typed):
    database = FakeCrewDatabase()
    client = make_crew_client(database)

    response = client.post(JOIN, headers=AUTH, json={"code": typed})

    assert_error(response, 422, "validation_error")
    assert database.requests == []


def test_a_code_with_six_wrong_symbols_says_what_a_code_looks_like():
    client = make_crew_client(FakeCrewDatabase())

    response = client.post(JOIN, headers=AUTH, json={"code": "K7QF2O"})

    assert response.json()["error"]["message"] == (
        "A crew code has 6 letters and digits, for example K7QF2M."
    )


def test_join_without_a_kit_is_409_and_costs_no_guess():
    database = FakeCrewDatabase()
    database.entry_profiles = [{"player_id": OTHER_PLAYER_ID, "kit": "stranger"}]
    client = make_crew_client(database)

    response = client.post(JOIN, headers=AUTH, json={"code": CODE})

    assert_error(response, 409, "kit_needed")
    assert database.routes() == ["GET entry_profiles"]


def test_join_takes_the_lowest_open_seat_of_a_forming_crew():
    database = FakeCrewDatabase()
    database.script(
        "crew_find_by_code", found_reply([found_seat(1, FRIEND_ID, None, "stranger")], version=3)
    )
    database.script("crew_take_seat", {"status": "joined", "seatNo": 2, "replacedPartner": None})
    database.set_crew(
        CREW_ID,
        crew_row(
            [
                player_seat(1, FRIEND_ID, "Calm Gannet 42", "stranger"),
                player_seat(2, PLAYER_ID, "Brave Puffin 17", "witness"),
            ],
            mode="crew",
            version=4,
        ),
    )
    client = make_crew_client(database)

    response = client.post(JOIN, headers=AUTH, json={"code": " k7q-f2m "})

    assert response.status_code == 200
    assert database.calls("crew_find_by_code") == [find_arguments(PLAYER_ID, CODE)]
    assert database.calls("crew_take_seat") == [take_arguments(CREW_ID, PLAYER_ID, 2, "witness", 3)]
    crew = response.json()["crew"]
    assert crew["mySeat"] == 2
    assert crew["mode"] == "crew"
    assert [seat["isMe"] for seat in crew["seats"]] == [False, True, False, False]


def test_join_takes_the_partner_seat_with_my_kit_after_the_muster():
    # The crew has sailed: no seat is open. My kit is witness, and the Bosun carries it.
    database = FakeCrewDatabase()
    seats = [
        found_seat(1, FRIEND_ID, None, "true_keeper"),
        found_seat(2, None, "deckhand", "informant"),
        found_seat(3, None, "bosun", "witness"),
        found_seat(4, None, "cook", "stranger"),
    ]
    database.script("crew_find_by_code", found_reply(seats, crew_status="active", version=2))
    database.script("crew_take_seat", {"status": "joined", "seatNo": 3, "replacedPartner": "bosun"})
    database.set_crew(
        CREW_ID,
        crew_row([player_seat(3, PLAYER_ID, "Brave Puffin 17", "witness")], status="active"),
    )
    client = make_crew_client(database)

    response = client.post(JOIN, headers=AUTH, json={"code": CODE})

    assert response.status_code == 200
    assert database.calls("crew_take_seat") == [take_arguments(CREW_ID, PLAYER_ID, 3, "witness", 2)]


def test_join_keeps_my_own_kit():
    # No partner carries my kit (witness), so the partner whose kit comes last in the partner
    # order steps aside: the cook with true_keeper. The seat then carries MY kit, not his.
    database = FakeCrewDatabase()
    seats = [
        found_seat(1, FRIEND_ID, None, "witness"),
        found_seat(2, None, "deckhand", "informant"),
        found_seat(3, None, "bosun", "stranger"),
        found_seat(4, None, "cook", "true_keeper"),
    ]
    database.script("crew_find_by_code", found_reply(seats, crew_status="active", version=2))
    database.script("crew_take_seat", {"status": "joined", "seatNo": 4, "replacedPartner": "cook"})
    database.set_crew(
        CREW_ID,
        crew_row([player_seat(4, PLAYER_ID, "Brave Puffin 17", "witness")], status="active"),
    )
    client = make_crew_client(database)

    client.post(JOIN, headers=AUTH, json={"code": CODE})

    (call,) = database.calls("crew_take_seat")
    assert call["p_seat_no"] == 4
    assert call["p_kit"] == "witness"


def test_join_a_full_crew_is_409_and_takes_no_seat():
    database = FakeCrewDatabase()
    seats = [
        found_seat(1, FRIEND_ID, None, "stranger"),
        found_seat(2, OTHER_PLAYER_ID, None, "informant"),
        found_seat(3, "33333333-4444-4555-8666-777777777777", None, "true_keeper"),
        found_seat(4, "44444444-5555-4666-8777-888888888888", None, "witness"),
    ]
    database.script("crew_find_by_code", found_reply(seats, crew_status="active"))
    client = make_crew_client(database)

    response = client.post(JOIN, headers=AUTH, json={"code": CODE})

    assert_error(response, 409, "crew_full")
    assert database.calls("crew_take_seat") == []


def test_join_a_finished_crew_is_409():
    database = FakeCrewDatabase()
    database.script(
        "crew_find_by_code",
        found_reply([found_seat(1, FRIEND_ID, None, "stranger")], crew_status="finished"),
    )
    client = make_crew_client(database)

    response = client.post(JOIN, headers=AUTH, json={"code": CODE})

    assert_error(response, 409, "crew_finished")
    assert database.calls("crew_take_seat") == []


def test_joining_my_own_crew_again_is_409_already_seated():
    database = FakeCrewDatabase()
    seats = [found_seat(1, PLAYER_ID, None, "witness")]
    database.script("crew_find_by_code", found_reply(seats))
    client = make_crew_client(database)

    response = client.post(JOIN, headers=AUTH, json={"code": CODE})

    assert_error(response, 409, "already_seated")
    assert database.calls("crew_take_seat") == []


def test_join_retries_when_the_crew_changed():
    database = FakeCrewDatabase()
    seats = [found_seat(1, FRIEND_ID, None, "stranger")]
    database.script(
        "crew_find_by_code", found_reply(seats, version=1), found_reply(seats, version=2)
    )
    database.script(
        "crew_take_seat",
        refused("changed"),
        {"status": "joined", "seatNo": 2, "replacedPartner": None},
    )
    database.set_crew(CREW_ID, crew_row([FRIEND, ME], mode="crew", version=3))
    client = make_crew_client(database)

    response = client.post(JOIN, headers=AUTH, json={"code": CODE})

    assert response.status_code == 200
    assert [call["p_expected_version"] for call in database.calls("crew_take_seat")] == [1, 2]
    assert len(database.calls("crew_find_by_code")) == 2


def test_join_gives_up_after_three_changes_with_409_crew_busy():
    database = FakeCrewDatabase()
    database.script("crew_find_by_code", found_reply([found_seat(1, FRIEND_ID, None, "stranger")]))
    database.script("crew_take_seat", refused("changed"))
    client = make_crew_client(database)

    response = client.post(JOIN, headers=AUTH, json={"code": CODE})

    assert_error(response, 409, "crew_busy")
    assert "Try again" in response.json()["error"]["message"]
    assert len(database.calls("crew_take_seat")) == 3
    assert database.reads("crews") == []


@pytest.mark.parametrize("reason", ["already_seated", "already_in_crew", "crew_finished"])
def test_a_refusal_of_the_seat_function_is_a_409_with_the_same_code(reason):
    database = FakeCrewDatabase()
    database.script("crew_find_by_code", found_reply([found_seat(1, FRIEND_ID, None, "stranger")]))
    database.script("crew_take_seat", refused(reason))
    client = make_crew_client(database)

    response = client.post(JOIN, headers=AUTH, json={"code": CODE})

    assert_error(response, 409, reason)


@pytest.mark.parametrize("function_name", ["crew_find_by_code", "crew_take_seat"])
def test_a_player_without_a_profile_is_404_player_not_set_up_when_joining(function_name):
    database = FakeCrewDatabase()
    database.script("crew_find_by_code", found_reply([found_seat(1, FRIEND_ID, None, "stranger")]))
    database.script(function_name, {"status": "missing"})
    client = make_crew_client(database)

    response = client.post(JOIN, headers=AUTH, json={"code": CODE})

    assert_error(response, 404, "player_not_set_up")


# --- the muster ---


def test_start_seats_partners_in_every_empty_seat():
    database = FakeCrewDatabase()
    database.seat_rows = [
        seat_of_player(OTHER_CREW_ID, 2, "active", OTHER_PLAYER_ID),
        seat_of_player(CREW_ID, 1, "forming"),
    ]
    database.set_crew(CREW_ID, crew_row([ME], version=1), sailed_crew())
    database.script("crew_start", {"status": "started"})
    client = make_crew_client(database)

    response = client.post(START, headers=AUTH)

    assert response.status_code == 200
    assert database.calls("crew_start") == [
        {
            "p_crew_id": CREW_ID,
            "p_player_id": PLAYER_ID,
            "p_partners": [
                {"seatNo": 2, "npcId": "deckhand", "kit": "informant"},
                {"seatNo": 3, "npcId": "bosun", "kit": "stranger"},
                {"seatNo": 4, "npcId": "cook", "kit": "true_keeper"},
            ],
            "p_expected_version": 1,
        }
    ]
    crew = response.json()["crew"]
    assert crew["status"] == "active"
    assert crew["startedAt"] == STARTED_AT_IN_API
    assert crew["seats"] == [
        seat_view(1, "player", "Brave Puffin 17", "witness", is_me=True),
        seat_view(2, "partner", "the Deckhand", "informant", "deckhand"),
        seat_view(3, "partner", "the Bosun", "stranger", "bosun"),
        seat_view(4, "partner", "the Cook", "true_keeper", "cook"),
    ]


def test_start_fills_the_seats_a_friend_left_open():
    # Players in seats 1 and 3, so the partners take seats 2 and 4, with the kits that are missing.
    database = FakeCrewDatabase()
    database.seat_rows = [seat_of_player(CREW_ID, 1, "forming")]
    players = [ME, player_seat(3, FRIEND_ID, "Calm Gannet 42", "informant")]
    database.set_crew(CREW_ID, crew_row(players, mode="crew", version=5), sailed_crew(players, 6))
    database.script("crew_start", {"status": "started"})
    client = make_crew_client(database)

    client.post(START, headers=AUTH)

    (call,) = database.calls("crew_start")
    assert call["p_partners"] == [
        {"seatNo": 2, "npcId": "deckhand", "kit": "stranger"},
        {"seatNo": 4, "npcId": "cook", "kit": "true_keeper"},
    ]
    assert call["p_expected_version"] == 5


def test_start_reads_my_seat_then_the_crew_then_starts_it_then_reads_the_crew_again():
    database = FakeCrewDatabase()
    database.seat_rows = [seat_of_player(CREW_ID, 1, "forming")]
    database.set_crew(CREW_ID, crew_row([ME]), sailed_crew())
    database.script("crew_start", {"status": "started"})
    client = make_crew_client(database)

    client.post(START, headers=AUTH)

    assert database.routes() == ["GET crew_seats", "GET crews", "POST rpc/crew_start", "GET crews"]


def test_start_twice_is_409_already_started():
    database = FakeCrewDatabase()
    database.seat_rows = [seat_of_player(CREW_ID, 1, "active")]
    database.set_crew(CREW_ID, sailed_crew())
    client = make_crew_client(database)

    response = client.post(START, headers=AUTH)

    assert_error(response, 409, "already_started")
    assert database.calls("crew_start") == []


def test_start_loses_a_race_with_a_second_start_and_is_409_already_started():
    database = FakeCrewDatabase()
    database.seat_rows = [seat_of_player(CREW_ID, 1, "forming")]
    database.set_crew(CREW_ID, crew_row([ME]))
    database.script("crew_start", refused("already_started"))
    client = make_crew_client(database)

    response = client.post(START, headers=AUTH)

    assert_error(response, 409, "already_started")


def test_start_without_a_crew_is_404_no_crew():
    database = FakeCrewDatabase()
    database.seat_rows = [seat_of_player(OTHER_CREW_ID, 2, "active", OTHER_PLAYER_ID)]
    client = make_crew_client(database)

    response = client.post(START, headers=AUTH)

    assert_error(response, 404, "no_crew")
    assert database.routes() == ["GET crew_seats"]


def test_start_with_only_a_finished_crew_is_404_no_crew():
    database = FakeCrewDatabase()
    database.seat_rows = [seat_of_player(CREW_ID, 1, "finished")]
    client = make_crew_client(database)

    response = client.post(START, headers=AUTH)

    assert_error(response, 404, "no_crew")


def test_start_retries_when_the_crew_changed():
    database = FakeCrewDatabase()
    database.seat_rows = [seat_of_player(CREW_ID, 1, "forming")]
    database.set_crew(
        CREW_ID,
        crew_row([ME], version=1),
        crew_row([ME, FRIEND], mode="crew", version=2),
        sailed_crew(
            [
                ME,
                FRIEND,
                partner_seat(3, "bosun", "informant"),
                partner_seat(4, "cook", "true_keeper"),
            ],
            3,
        ),
    )
    database.script("crew_start", refused("changed"), {"status": "started"})
    client = make_crew_client(database)

    response = client.post(START, headers=AUTH)

    assert response.status_code == 200
    calls = database.calls("crew_start")
    assert [call["p_expected_version"] for call in calls] == [1, 2]
    assert [partner["seatNo"] for partner in calls[0]["p_partners"]] == [2, 3, 4]
    assert [partner["seatNo"] for partner in calls[1]["p_partners"]] == [3, 4]


def test_start_gives_up_after_three_changes_with_409_crew_busy():
    database = FakeCrewDatabase()
    database.seat_rows = [seat_of_player(CREW_ID, 1, "forming")]
    database.set_crew(CREW_ID, crew_row([ME]))
    database.script("crew_start", refused("changed"))
    client = make_crew_client(database)

    response = client.post(START, headers=AUTH)

    assert_error(response, 409, "crew_busy")
    assert len(database.calls("crew_start")) == 3


@pytest.mark.parametrize(
    ("reason", "status", "code"),
    [("not_in_crew", 404, "no_crew"), ("crew_finished", 409, "crew_finished")],
)
def test_the_other_refusals_of_the_muster_are_errors(reason, status, code):
    database = FakeCrewDatabase()
    database.seat_rows = [seat_of_player(CREW_ID, 1, "forming")]
    database.set_crew(CREW_ID, crew_row([ME]))
    database.script("crew_start", refused(reason))
    client = make_crew_client(database)

    response = client.post(START, headers=AUTH)

    assert_error(response, status, code)


def test_start_for_a_crew_that_vanished_between_the_reads_is_404_no_crew():
    database = FakeCrewDatabase()
    database.seat_rows = [seat_of_player(CREW_ID, 1, "forming")]
    client = make_crew_client(database)

    response = client.post(START, headers=AUTH)

    assert_error(response, 404, "no_crew")
    assert database.calls("crew_start") == []


def test_start_for_a_crew_that_finished_between_the_reads_is_409_crew_finished():
    # The crew is still there, so it is not "no crew". This is the same answer the database
    # function gives for a finished crew (see test_the_other_refusals_of_the_muster_are_errors),
    # whichever of the two finds out first.
    database = FakeCrewDatabase()
    database.seat_rows = [seat_of_player(CREW_ID, 1, "forming")]
    database.set_crew(CREW_ID, {**crew_row([ME]), "status": "finished"})
    client = make_crew_client(database)

    response = client.post(START, headers=AUTH)

    assert_error(response, 409, "crew_finished")
    assert database.calls("crew_start") == []


# --- my crew ---


def test_my_crew_is_null_without_an_open_crew():
    database = FakeCrewDatabase()
    database.seat_rows = [
        seat_of_player(OTHER_CREW_ID, 1, "active", OTHER_PLAYER_ID),
        seat_of_player(CREW_ID, 2, "finished"),
    ]
    client = make_crew_client(database)

    response = client.get(MINE, headers=AUTH)

    assert response.status_code == 200
    assert response.json() == {"crew": None}
    assert database.routes() == ["GET crew_seats"]


def test_my_crew_shows_four_seats_with_names_kits_and_titles():
    database = FakeCrewDatabase()
    database.seat_rows = [seat_of_player(CREW_ID, 1, "active")]
    seats = [
        ME,
        FRIEND,
        partner_seat(3, "bosun", "informant"),
        partner_seat(4, "cook", "true_keeper"),
    ]
    database.set_crew(
        CREW_ID,
        crew_row(seats, status="active", mode="crew", version=5, started_at=STARTED_AT_IN_DATABASE),
    )
    client = make_crew_client(database)

    response = client.get(MINE, headers=AUTH)

    assert response.json() == {
        "crew": {
            "id": CREW_ID,
            "code": CODE,
            "status": "active",
            "mode": "crew",
            "mySeat": 1,
            "startedAt": STARTED_AT_IN_API,
            "seats": [
                seat_view(1, "player", "Brave Puffin 17", "witness", is_me=True),
                seat_view(2, "player", "Calm Gannet 42", "stranger"),
                seat_view(3, "partner", "the Bosun", "informant", "bosun"),
                seat_view(4, "partner", "the Cook", "true_keeper", "cook"),
            ],
        }
    }


def test_my_crew_lists_open_seats_where_no_row_exists_and_my_own_seat_number():
    database = FakeCrewDatabase()
    database.seat_rows = [seat_of_player(CREW_ID, 3, "forming")]
    mine = player_seat(3, PLAYER_ID, "Brave Puffin 17", "witness")
    database.set_crew(CREW_ID, crew_row([FRIEND, mine], mode="crew"))
    client = make_crew_client(database)

    crew = client.get(MINE, headers=AUTH).json()["crew"]

    assert crew["mySeat"] == 3
    assert [seat["holder"] for seat in crew["seats"]] == ["open", "player", "player", "open"]
    assert [seat["isMe"] for seat in crew["seats"]] == [False, False, True, False]


def test_a_crew_that_does_not_hold_me_after_all_is_404_no_crew():
    # The seat read says the player sits in the crew, but the crew read shows no seat of theirs
    # (the seat went away between the two reads). The answer is 404 no_crew, the same as for a
    # player in no crew at all, and it never shows the seat of somebody else as "mine".
    database = FakeCrewDatabase()
    database.seat_rows = [seat_of_player(CREW_ID, 1, "forming")]
    database.set_crew(CREW_ID, crew_row([FRIEND], mode="crew"))
    client = make_crew_client(database)

    response = client.get(MINE, headers=AUTH)

    assert_error(response, 404, "no_crew")


def test_my_crew_never_shows_player_ids_or_another_crew():
    database = FakeCrewDatabase()
    database.seat_rows = [
        seat_of_player(OTHER_CREW_ID, 1, "active", OTHER_PLAYER_ID),
        seat_of_player(CREW_ID, 1, "forming"),
    ]
    database.set_crew(CREW_ID, crew_row([ME, FRIEND], mode="crew"))
    database.set_crew(OTHER_CREW_ID, crew_row([], crew_id=OTHER_CREW_ID, code="ZZZZZZ"))
    client = make_crew_client(database)

    response = client.get(MINE, headers=AUTH)

    private_values = (PLAYER_ID, FRIEND_ID, OTHER_PLAYER_ID, OTHER_CREW_ID, "playerId", "player_id")
    assert not any(value in response.text for value in private_values)
    assert dict(database.reads("crew_seats")[0].url.params)["player_id"] == f"eq.{PLAYER_ID}"
    assert [dict(request.url.params)["id"] for request in database.reads("crews")] == [
        f"eq.{CREW_ID}"
    ]


# --- who may call, and what a caller may send ---

ALL_ROUTES = [("POST", CREATE), ("POST", JOIN), ("POST", START), ("GET", MINE)]
BODY_OF = {CREATE: None, JOIN: {"code": CODE}, START: None, MINE: None}


@pytest.mark.parametrize(("method", "url"), ALL_ROUTES)
def test_every_crew_route_needs_sign_in(method, url):
    database = FakeCrewDatabase()
    client = make_crew_client(database)

    response = client.request(method, url, json=BODY_OF[url])

    assert_error(response, 401, "unauthorized")
    assert database.requests == []


@pytest.mark.parametrize(("method", "url"), ALL_ROUTES)
def test_a_token_that_supabase_refuses_is_401_on_every_crew_route(method, url):
    database = FakeCrewDatabase()
    client = make_crew_client(database)

    headers = {"Authorization": "Bearer nobody-issued-this"}

    response = client.request(method, url, headers=headers, json=BODY_OF[url])

    assert_error(response, 401, "unauthorized")
    assert database.requests == []


def test_a_player_id_in_the_body_of_join_is_refused():
    database = FakeCrewDatabase()
    client = make_crew_client(database)

    response = client.post(JOIN, headers=AUTH, json={"code": CODE, "playerId": OTHER_PLAYER_ID})

    assert_error(response, 422, "validation_error")
    assert database.requests == []


def test_a_kit_or_a_seat_in_the_body_of_join_is_refused():
    database = FakeCrewDatabase()
    client = make_crew_client(database)

    response = client.post(
        JOIN, headers=AUTH, json={"code": CODE, "kit": "true_keeper", "seatNo": 1}
    )

    assert_error(response, 422, "validation_error")
    assert database.requests == []


def test_a_missing_code_in_join_is_422():
    client = make_crew_client(FakeCrewDatabase())

    response = client.post(JOIN, headers=AUTH, json={})

    assert_error(response, 422, "validation_error")


def test_a_code_that_is_not_text_is_422():
    database = FakeCrewDatabase()
    client = make_crew_client(database)

    response = client.post(JOIN, headers=AUTH, json={"code": 123456})

    assert_error(response, 422, "validation_error")
    assert database.requests == []


def test_the_player_id_of_create_and_start_always_comes_from_the_login_never_from_a_body():
    database = FakeCrewDatabase()
    database.script("crew_create", {"status": "created", "crewId": CREW_ID})
    database.script("crew_start", {"status": "started"})
    database.seat_rows = [seat_of_player(CREW_ID, 1, "forming")]
    # The reads of the crew, in order: the view after create, the muster's look, the view after it.
    database.set_crew(CREW_ID, crew_row([ME]), crew_row([ME]), sailed_crew())
    client = make_crew_client(database)
    body = {"playerId": OTHER_PLAYER_ID, "player_id": OTHER_PLAYER_ID}

    client.post(CREATE, headers=AUTH, json=body)
    client.post(START, headers=AUTH, json=body)

    assert database.calls("crew_create")[0]["p_player_id"] == PLAYER_ID
    assert database.calls("crew_start")[0]["p_player_id"] == PLAYER_ID
    assert all(OTHER_PLAYER_ID not in str(request.url) for request in database.requests)
    assert all(OTHER_PLAYER_ID.encode() not in request.content for request in database.requests)


# --- answers are never cached ---


def test_crew_answers_are_never_cached():
    database = FakeCrewDatabase()
    database.script("crew_create", {"status": "created", "crewId": CREW_ID})
    database.script("crew_find_by_code", found_reply([found_seat(1, FRIEND_ID, None, "stranger")]))
    database.script("crew_take_seat", {"status": "joined", "seatNo": 2, "replacedPartner": None})
    database.script("crew_start", {"status": "started"})
    database.seat_rows = [seat_of_player(CREW_ID, 1, "forming")]
    database.set_crew(CREW_ID, crew_row([ME, FRIEND], mode="crew"))
    client = make_crew_client(database)

    responses = [
        client.post(CREATE, headers=AUTH),
        client.post(JOIN, headers=AUTH, json={"code": CODE}),
        client.post(START, headers=AUTH),
        client.get(MINE, headers=AUTH),
    ]

    assert [response.status_code for response in responses] == [200, 200, 200, 200]
    assert [response.headers["cache-control"] for response in responses] == [
        "private, no-store"
    ] * 4


# --- the database in trouble ---


@pytest.mark.parametrize(("method", "url"), [("POST", CREATE), ("POST", START), ("GET", MINE)])
def test_a_database_that_cannot_be_reached_is_503(method, url):
    client = make_crew_client(fail_with(httpx.ConnectError))

    response = client.request(method, url, headers=AUTH)

    assert_error(response, 503, "database_unavailable")


def test_a_missing_entry_profiles_table_is_502_and_hides_the_database_text():
    # Package A3 makes the table. Before its migration the read is refused.
    def table_missing(request: httpx.Request) -> httpx.Response:
        error = {"code": "PGRST205", "message": "Could not find the table entry_profiles"}
        return httpx.Response(404, json=error)

    client = make_crew_client(table_missing)

    response = client.post(CREATE, headers=AUTH)

    assert_error(response, 502, "database_error")
    assert "entry_profiles" not in response.text


def test_a_crew_function_that_answers_something_strange_is_502():
    database = FakeCrewDatabase()
    database.script("crew_create", {"status": "weird"})
    client = make_crew_client(database)

    response = client.post(CREATE, headers=AUTH)

    assert_error(response, 502, "database_error")


def test_a_unique_violation_from_a_crew_function_is_502_and_not_already_applied():
    database = FakeCrewDatabase()
    database.script("crew_create", httpx.Response(409, json={"code": "23505", "message": "dup"}))
    client = make_crew_client(database)

    response = client.post(CREATE, headers=AUTH)

    assert_error(response, 502, "database_error")


def test_a_crew_row_we_cannot_read_is_502():
    database = FakeCrewDatabase()
    database.seat_rows = [seat_of_player(CREW_ID, 1, "forming")]
    database.set_crew(CREW_ID, {**crew_row([ME]), "status": "paused"})
    client = make_crew_client(database)

    response = client.get(MINE, headers=AUTH)

    assert_error(response, 502, "database_error")


def test_the_player_id_stays_out_of_the_log(caplog):
    database = FakeCrewDatabase()
    database.script("crew_create", {"status": "created", "crewId": CREW_ID})
    database.set_crew(CREW_ID, {**crew_row([ME]), "status": "paused"})
    client = make_crew_client(database)

    with caplog.at_level("DEBUG"):
        client.post(CREATE, headers=AUTH)

    assert PLAYER_ID not in caplog.text
    assert CODE not in caplog.text
    assert re.search(r"Bearer|token-of-the-crew-player", caplog.text) is None
