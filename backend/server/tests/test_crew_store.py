"""Tests for crews/store.py: the three reads, the four crew functions and their answers.

No network: the database is the FakeCrewDatabase of crew_helpers.py. The tests check three things:
  * the reads ask for the right rows (a filter on the verified player or crew id, few columns),
  * every answer of a crew function is understood, and an answer we cannot read is a 502,
  * a unique violation from a crew function is a 502 and never "already applied".
"""

import asyncio
from datetime import UTC, datetime

import httpx
import pytest

from server.crews.codes import MAX_WRONG_CODES, WRONG_CODE_WINDOW_SECONDS
from server.crews.seats import Seat
from server.crews.store import (
    CreateReply,
    CrewRecord,
    FindReply,
    OpenSeat,
    StartReply,
    TakeReply,
    create_arguments,
    crew_create,
    crew_find_by_code,
    crew_start,
    crew_take_seat,
    find_arguments,
    read_crew,
    read_open_crew_seat,
    read_player_kit,
    start_arguments,
    take_arguments,
)
from server.supabase_admin import (
    AlreadyApplied,
    SupabaseRejected,
    SupabaseUnavailable,
)
from server.tests.crew_helpers import (
    CODE,
    CREW_ID,
    FRIEND_ID,
    OTHER_CREW_ID,
    OTHER_PLAYER_ID,
    PLAYER_ID,
    STARTED_AT_IN_DATABASE,
    FakeCrewDatabase,
    crew_row,
    found_reply,
    found_seat,
    partner_seat,
    player_seat,
    refused,
    seat_of_player,
)
from server.tests.helpers import fail_with, make_admin


def run(coroutine):
    return asyncio.run(coroutine)


def make_store_admin(database=None):
    """An admin client wired to the fake database. Returns the admin and the database."""
    database = database or FakeCrewDatabase()
    admin, _ = make_admin(database)
    return admin, database


# --- the kit of the player ---


def test_the_kit_is_read_with_a_filter_on_the_player_and_one_column():
    admin, database = make_store_admin()

    run(read_player_kit(admin, PLAYER_ID))

    assert [dict(request.url.params) for request in database.reads("entry_profiles")] == [
        {"select": "kit", "player_id": f"eq.{PLAYER_ID}", "limit": "1"}
    ]


def test_the_kit_is_the_one_of_the_player_and_never_of_another_player():
    admin, _ = make_store_admin()

    assert run(read_player_kit(admin, PLAYER_ID)) == "witness"


def test_a_player_without_an_entry_profile_has_no_kit():
    admin, database = make_store_admin()
    database.entry_profiles = [{"player_id": OTHER_PLAYER_ID, "kit": "stranger"}]

    assert run(read_player_kit(admin, PLAYER_ID)) is None


@pytest.mark.parametrize("strange_kit", ["lantern", "", None, 5, ["witness"]])
def test_a_kit_that_is_not_one_of_the_four_is_refused(strange_kit):
    admin, database = make_store_admin()
    database.entry_profiles = [{"player_id": PLAYER_ID, "kit": strange_kit}]

    with pytest.raises(SupabaseRejected):
        run(read_player_kit(admin, PLAYER_ID))


# --- the open crew seat of the player ---


def test_the_open_seat_is_read_with_a_filter_on_the_player_newest_first_and_a_limit():
    admin, database = make_store_admin()

    run(read_open_crew_seat(admin, PLAYER_ID))

    assert [dict(request.url.params) for request in database.reads("crew_seats")] == [
        {
            "select": "crew_id,seat_no,crews(status)",
            "player_id": f"eq.{PLAYER_ID}",
            "order": "joined_at.desc",
            "limit": "20",
        }
    ]


def test_the_open_seat_is_the_newest_seat_in_a_forming_or_active_crew():
    admin, database = make_store_admin()
    database.seat_rows = [
        seat_of_player(OTHER_CREW_ID, 2, "active", OTHER_PLAYER_ID),
        seat_of_player(CREW_ID, 3, "active"),
    ]

    assert run(read_open_crew_seat(admin, PLAYER_ID)) == OpenSeat(CREW_ID, 3, "active")


def test_a_finished_crew_is_skipped_for_the_next_older_seat():
    admin, database = make_store_admin()
    database.seat_rows = [
        seat_of_player(OTHER_CREW_ID, 1, "finished"),
        seat_of_player(CREW_ID, 2, "forming"),
    ]

    assert run(read_open_crew_seat(admin, PLAYER_ID)) == OpenSeat(CREW_ID, 2, "forming")


def test_a_player_with_only_finished_crews_has_no_open_seat():
    admin, database = make_store_admin()
    database.seat_rows = [seat_of_player(CREW_ID, 1, "finished")]

    assert run(read_open_crew_seat(admin, PLAYER_ID)) is None


def test_a_player_in_no_crew_has_no_open_seat():
    admin, _ = make_store_admin()

    assert run(read_open_crew_seat(admin, PLAYER_ID)) is None


@pytest.mark.parametrize(
    "strange_row",
    [
        {"player_id": PLAYER_ID, "crew_id": CREW_ID, "seat_no": 1, "crews": None},
        {"player_id": PLAYER_ID, "crew_id": CREW_ID, "seat_no": 1, "crews": {"state": "forming"}},
        {
            "player_id": PLAYER_ID,
            "crew_id": CREW_ID,
            "seat_no": "1",
            "crews": {"status": "forming"},
        },
        {"player_id": PLAYER_ID, "crew_id": 7, "seat_no": 1, "crews": {"status": "forming"}},
    ],
)
def test_a_seat_row_we_cannot_read_is_502(strange_row):
    admin, database = make_store_admin()
    database.seat_rows = [strange_row]

    with pytest.raises(SupabaseRejected):
        run(read_open_crew_seat(admin, PLAYER_ID))


# --- a crew with its seats ---


def test_a_crew_is_read_with_a_filter_on_its_id_and_the_names_of_its_players():
    admin, database = make_store_admin()
    database.set_crew(CREW_ID, crew_row([player_seat(1, PLAYER_ID, "Brave Puffin 17", "witness")]))

    run(read_crew(admin, CREW_ID))

    assert [dict(request.url.params) for request in database.reads("crews")] == [
        {
            "select": (
                "id,code,status,mode,version,started_at,"
                "crew_seats(seat_no,player_id,npc_id,kit,profiles(display_name))"
            ),
            "id": f"eq.{CREW_ID}",
            "limit": "1",
        }
    ]


def test_a_crew_becomes_a_record_with_sorted_seats_names_and_a_utc_start_time():
    admin, database = make_store_admin()
    seats = [
        partner_seat(3, "bosun", "informant"),
        player_seat(2, FRIEND_ID, "Calm Gannet 42", "stranger"),
        player_seat(1, PLAYER_ID, "Brave Puffin 17", "witness"),
    ]
    row = crew_row(
        seats, status="active", mode="crew", version=4, started_at=STARTED_AT_IN_DATABASE
    )
    database.set_crew(CREW_ID, row)

    crew = run(read_crew(admin, CREW_ID))

    assert crew == CrewRecord(
        id=CREW_ID,
        code=CODE,
        status="active",
        mode="crew",
        version=4,
        started_at=datetime(2026, 11, 13, 10, 2, 0, tzinfo=UTC),
        seats=(
            Seat(1, PLAYER_ID, None, "witness", "Brave Puffin 17"),
            Seat(2, FRIEND_ID, None, "stranger", "Calm Gannet 42"),
            Seat(3, None, "bosun", "informant", "the Bosun"),
        ),
    )


def test_a_crew_without_a_code_or_a_start_time_is_read_with_empty_values():
    admin, database = make_store_admin()
    database.set_crew(
        CREW_ID, crew_row([player_seat(1, PLAYER_ID, "Brave Puffin 17", "witness")], code=None)
    )

    crew = run(read_crew(admin, CREW_ID))

    assert crew.code is None
    assert crew.started_at is None


def test_a_partner_that_is_not_on_the_list_is_shown_by_its_id():
    admin, database = make_store_admin()
    database.set_crew(CREW_ID, crew_row([partner_seat(2, "old_salt", "compass")]))

    crew = run(read_crew(admin, CREW_ID))

    assert crew.seats[0].name == "old salt"


def test_a_crew_that_does_not_exist_is_none():
    admin, _ = make_store_admin()

    assert run(read_crew(admin, CREW_ID)) is None


@pytest.mark.parametrize(
    "change",
    [
        {"status": "paused"},
        {"status": None},
        {"mode": "team"},
        {"version": "1"},
        {"version": 1.5},
        {"crew_seats": None},
        {"crew_seats": ["not a seat"]},
        {"started_at": "2026-11-13T10:02:00"},  # no timezone
        {"started_at": 5},
        {"id": 7},
        {"code": 5},
    ],
)
def test_a_crew_row_we_cannot_read_is_502(change):
    admin, database = make_store_admin()
    database.set_crew(
        CREW_ID, {**crew_row([player_seat(1, PLAYER_ID, "Brave Puffin 17", "witness")]), **change}
    )

    with pytest.raises(SupabaseRejected):
        run(read_crew(admin, CREW_ID))


@pytest.mark.parametrize(
    "strange_seat",
    [
        {**player_seat(1, PLAYER_ID, "Brave Puffin 17", "witness"), "seat_no": "1"},
        {**player_seat(1, PLAYER_ID, "Brave Puffin 17", "witness"), "profiles": "Brave Puffin 17"},
        {**player_seat(1, PLAYER_ID, "Brave Puffin 17", "witness"), "profiles": {"name": "x"}},
        {**player_seat(1, PLAYER_ID, "Brave Puffin 17", "witness"), "kit": 5},
    ],
)
def test_a_seat_row_inside_a_crew_that_we_cannot_read_is_502(strange_seat):
    admin, database = make_store_admin()
    database.set_crew(CREW_ID, crew_row([strange_seat]))

    with pytest.raises(SupabaseRejected):
        run(read_crew(admin, CREW_ID))


# --- the arguments of the four functions ---


def test_crew_create_gets_the_player_the_code_and_the_kit():
    assert create_arguments(PLAYER_ID, CODE, "witness") == {
        "p_player_id": PLAYER_ID,
        "p_code": CODE,
        "p_kit": "witness",
    }


def test_crew_find_by_code_gets_the_guess_limit_from_python():
    assert find_arguments(PLAYER_ID, CODE) == {
        "p_player_id": PLAYER_ID,
        "p_code": CODE,
        "p_max_wrong_codes": MAX_WRONG_CODES,
        "p_window_seconds": WRONG_CODE_WINDOW_SECONDS,
    }


def test_the_guess_limit_sent_to_the_database_is_10_in_600_seconds():
    arguments = find_arguments(PLAYER_ID, CODE)

    assert arguments["p_max_wrong_codes"] == 10
    assert arguments["p_window_seconds"] == 600


def test_crew_take_seat_gets_the_crew_the_seat_the_kit_and_the_version():
    assert take_arguments(CREW_ID, PLAYER_ID, 2, "witness", 3) == {
        "p_crew_id": CREW_ID,
        "p_player_id": PLAYER_ID,
        "p_seat_no": 2,
        "p_kit": "witness",
        "p_expected_version": 3,
    }


def test_crew_start_gets_each_partner_with_seat_number_id_and_kit():
    partners = [
        Seat(3, None, "bosun", "informant", "the Bosun"),
        Seat(4, None, "cook", "stranger", "the Cook"),
    ]

    assert start_arguments(CREW_ID, PLAYER_ID, partners, 2) == {
        "p_crew_id": CREW_ID,
        "p_player_id": PLAYER_ID,
        "p_partners": [
            {"seatNo": 3, "npcId": "bosun", "kit": "informant"},
            {"seatNo": 4, "npcId": "cook", "kit": "stranger"},
        ],
        "p_expected_version": 2,
    }


def test_each_function_is_called_by_its_name_with_its_arguments():
    admin, database = make_store_admin()
    database.script("crew_create", {"status": "created", "crewId": CREW_ID})
    database.script("crew_find_by_code", refused("wrong_code"))
    database.script("crew_take_seat", {"status": "joined", "seatNo": 2, "replacedPartner": None})
    database.script("crew_start", {"status": "started"})

    run(crew_create(admin, PLAYER_ID, CODE, "witness"))
    run(crew_find_by_code(admin, PLAYER_ID, CODE))
    run(crew_take_seat(admin, CREW_ID, PLAYER_ID, 2, "witness", 1))
    run(crew_start(admin, CREW_ID, PLAYER_ID, [], 1))

    assert database.routes() == [
        "POST rpc/crew_create",
        "POST rpc/crew_find_by_code",
        "POST rpc/crew_take_seat",
        "POST rpc/crew_start",
    ]
    assert database.calls("crew_create") == [create_arguments(PLAYER_ID, CODE, "witness")]
    assert database.calls("crew_find_by_code") == [find_arguments(PLAYER_ID, CODE)]
    assert database.calls("crew_take_seat") == [take_arguments(CREW_ID, PLAYER_ID, 2, "witness", 1)]
    assert database.calls("crew_start") == [start_arguments(CREW_ID, PLAYER_ID, [], 1)]


# --- every answer of the functions is understood ---


@pytest.mark.parametrize(
    ("reply", "expected"),
    [
        ({"status": "created", "crewId": CREW_ID}, CreateReply("created", crew_id=CREW_ID)),
        ({"status": "existing", "crewId": CREW_ID}, CreateReply("existing", crew_id=CREW_ID)),
        ({"status": "missing"}, CreateReply("missing")),
        (refused("already_in_crew"), CreateReply("refused", reason="already_in_crew")),
        (refused("code_taken"), CreateReply("refused", reason="code_taken")),
    ],
)
def test_every_answer_of_crew_create_is_understood(reply, expected):
    admin, database = make_store_admin()
    database.script("crew_create", reply)

    assert run(crew_create(admin, PLAYER_ID, CODE, "witness")) == expected


@pytest.mark.parametrize(
    ("reply", "expected"),
    [
        (
            found_reply(
                [
                    found_seat(1, FRIEND_ID, None, "stranger"),
                    found_seat(3, None, "bosun", "informant"),
                ],
                version=3,
            ),
            FindReply(
                "found",
                crew_id=CREW_ID,
                crew_status="forming",
                version=3,
                seats=(
                    Seat(1, FRIEND_ID, None, "stranger", None),
                    Seat(3, None, "bosun", "informant", None),
                ),
            ),
        ),
        (
            found_reply([], crew_status="active", version=7),
            FindReply("found", crew_id=CREW_ID, crew_status="active", version=7, seats=()),
        ),
        ({"status": "missing"}, FindReply("missing")),
        (refused("wrong_code"), FindReply("refused", reason="wrong_code")),
        (
            refused("too_many_attempts", retryAfterSeconds=42),
            FindReply("refused", reason="too_many_attempts", retry_after_seconds=42),
        ),
    ],
)
def test_every_answer_of_crew_find_by_code_is_understood(reply, expected):
    admin, database = make_store_admin()
    database.script("crew_find_by_code", reply)

    assert run(crew_find_by_code(admin, PLAYER_ID, CODE)) == expected


@pytest.mark.parametrize(
    ("reply", "expected"),
    [
        (
            {"status": "joined", "seatNo": 3, "replacedPartner": "bosun"},
            TakeReply("joined", seat_no=3, replaced_partner="bosun"),
        ),
        (
            {"status": "joined", "seatNo": 2, "replacedPartner": None},
            TakeReply("joined", seat_no=2, replaced_partner=None),
        ),
        ({"status": "missing"}, TakeReply("missing")),
        (refused("already_seated"), TakeReply("refused", reason="already_seated")),
        (refused("already_in_crew"), TakeReply("refused", reason="already_in_crew")),
        (refused("crew_finished"), TakeReply("refused", reason="crew_finished")),
        (refused("changed"), TakeReply("refused", reason="changed")),
    ],
)
def test_every_answer_of_crew_take_seat_is_understood(reply, expected):
    admin, database = make_store_admin()
    database.script("crew_take_seat", reply)

    assert run(crew_take_seat(admin, CREW_ID, PLAYER_ID, 2, "witness", 1)) == expected


@pytest.mark.parametrize(
    ("reply", "expected"),
    [
        ({"status": "started"}, StartReply("started")),
        (refused("not_in_crew"), StartReply("refused", reason="not_in_crew")),
        (refused("already_started"), StartReply("refused", reason="already_started")),
        (refused("crew_finished"), StartReply("refused", reason="crew_finished")),
        (refused("changed"), StartReply("refused", reason="changed")),
    ],
)
def test_every_answer_of_crew_start_is_understood(reply, expected):
    admin, database = make_store_admin()
    database.script("crew_start", reply)

    assert run(crew_start(admin, CREW_ID, PLAYER_ID, [], 1)) == expected


# --- an answer we cannot read is a 502 ---

CALLS = {
    "crew_create": lambda admin: crew_create(admin, PLAYER_ID, CODE, "witness"),
    "crew_find_by_code": lambda admin: crew_find_by_code(admin, PLAYER_ID, CODE),
    "crew_take_seat": lambda admin: crew_take_seat(admin, CREW_ID, PLAYER_ID, 2, "witness", 1),
    "crew_start": lambda admin: crew_start(admin, CREW_ID, PLAYER_ID, [], 1),
}

UNREADABLE_ANSWERS = [
    None,
    [],
    "done",
    5,
    {},
    {"status": 5},
    {"status": "weird"},
    {"status": "refused"},
    {"status": "refused", "reason": 5},
    {"status": "refused", "reason": "weird"},
]


@pytest.mark.parametrize("answer", UNREADABLE_ANSWERS)
@pytest.mark.parametrize("function_name", list(CALLS))
def test_an_answer_that_is_not_in_the_agreed_shape_is_502(function_name, answer):
    admin, database = make_store_admin()
    database.script(function_name, answer)

    with pytest.raises(SupabaseRejected) as caught:
        run(CALLS[function_name](admin))

    assert caught.value.status_code == 502


@pytest.mark.parametrize(
    ("function_name", "answer"),
    [
        ("crew_create", {"status": "created"}),
        ("crew_create", {"status": "created", "crewId": 5}),
        ("crew_create", {"status": "existing", "crewId": ""}),
        ("crew_create", refused("wrong_code")),  # a reason of another function
        ("crew_create", refused("changed")),
        ("crew_find_by_code", refused("too_many_attempts")),  # no wait time
        ("crew_find_by_code", refused("too_many_attempts", retryAfterSeconds="42")),
        ("crew_find_by_code", refused("too_many_attempts", retryAfterSeconds=True)),
        ("crew_find_by_code", refused("code_taken")),
        ("crew_find_by_code", {**found_reply([]), "version": "1"}),
        ("crew_find_by_code", {**found_reply([]), "crewStatus": 5}),
        ("crew_find_by_code", {**found_reply([]), "seats": None}),
        ("crew_find_by_code", {**found_reply([]), "seats": ["not a seat"]}),
        (
            "crew_find_by_code",
            found_reply([{**found_seat(1, FRIEND_ID, None, "stranger"), "seatNo": "1"}]),
        ),
        (
            "crew_find_by_code",
            found_reply([{**found_seat(1, FRIEND_ID, None, "stranger"), "kit": 5}]),
        ),
        ("crew_take_seat", {"status": "joined"}),
        ("crew_take_seat", {"status": "joined", "seatNo": True}),
        ("crew_take_seat", {"status": "joined", "seatNo": "2"}),
        ("crew_take_seat", {"status": "joined", "seatNo": 2, "replacedPartner": 5}),
        ("crew_take_seat", refused("not_in_crew")),
        ("crew_start", {"status": "missing"}),  # crew_start has no "missing" answer
        ("crew_start", refused("already_seated")),
    ],
)
def test_an_answer_with_a_missing_or_wrong_field_is_502(function_name, answer):
    admin, database = make_store_admin()
    database.script(function_name, answer)

    with pytest.raises(SupabaseRejected) as caught:
        run(CALLS[function_name](admin))

    assert caught.value.status_code == 502


# --- errors from the database ---


@pytest.mark.parametrize("function_name", list(CALLS))
def test_a_unique_violation_from_a_crew_function_is_502_database_error_not_already_applied(
    function_name,
):
    # supabase_admin turns EVERY unique violation (code 23505) into 409 already_applied, the
    # answer for a repeated wallet ref. The crew functions are safe to repeat, so here it can only
    # mean that the server and the database disagree: a bug on our side, never a repeat.
    admin, database = make_store_admin()
    database.script(
        function_name,
        httpx.Response(409, json={"code": "23505", "message": "duplicate key value"}),
    )

    with pytest.raises(SupabaseRejected) as caught:
        run(CALLS[function_name](admin))

    assert not isinstance(caught.value, AlreadyApplied)
    assert caught.value.status_code == 502
    assert caught.value.code == "database_error"


@pytest.mark.parametrize("function_name", list(CALLS))
def test_a_bug_raised_inside_a_function_is_502_and_hides_the_database_text(function_name):
    admin, database = make_store_admin()
    database.script(
        function_name,
        httpx.Response(400, json={"code": "P0001", "message": "bad_seat secret detail"}),
    )

    with pytest.raises(SupabaseRejected) as caught:
        run(CALLS[function_name](admin))

    assert "secret detail" not in caught.value.message


@pytest.mark.parametrize("function_name", list(CALLS))
def test_a_database_that_cannot_be_reached_is_503(function_name):
    admin, _ = make_admin(fail_with(httpx.ConnectError))

    with pytest.raises(SupabaseUnavailable) as caught:
        run(CALLS[function_name](admin))

    assert caught.value.status_code == 503


def test_a_read_that_fails_is_503_too():
    admin, _ = make_admin(fail_with(httpx.ReadTimeout))

    with pytest.raises(SupabaseUnavailable):
        run(read_player_kit(admin, PLAYER_ID))
