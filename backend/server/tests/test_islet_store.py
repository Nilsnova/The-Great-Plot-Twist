"""Tests for game/islet_store.py: the database calls of the home islet.

Nothing here uses the network. The database is a fake transport (make_admin in helpers.py) that
answers like the parts of Supabase the islet uses and remembers every request, so a test can check
exactly what the server asked for: the filter on the verified player, the limit, the seven
arguments of islet_build() and the one read that the finale uses.

Used by: pytest (cd backend && uv run pytest).
"""

import asyncio
import json
import uuid
from datetime import UTC, datetime

import httpx
import pytest

from server.errors import ApiError
from server.game import islet_store as store
from server.game.building import StandingBuilding
from server.game.building_catalogue import Cost
from server.game.islet_store import BuildOutcome
from server.supabase_admin import (
    AlreadyApplied,
    InsufficientFunds,
    SupabaseRejected,
    SupabaseUnavailable,
)
from server.tests.helpers import make_admin

PLAYER_ID = "11111111-2222-4333-8444-555555555555"
OTHER_IDS = [
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
    "44444444-4444-4444-8444-444444444444",
]

BUILDING_ROW = {
    "plot": "islet_signal_station",
    "building_type": "signal_station",
    "level": 1,
    "built_at": "2026-11-16T10:00:00.250000+00:00",
}


def answers(rows_by_table: dict):
    """A fake database that answers every read of a table with the rows given for it."""

    def reply(request: httpx.Request) -> httpx.Response:
        table = request.url.path.rsplit("/", 1)[-1]
        return httpx.Response(200, json=rows_by_table[table])

    return reply


def answers_with(body) -> object:
    """A fake database that answers every call with the same JSON."""
    return lambda request: httpx.Response(200, json=body)


def answers_with_status(status: int, body: dict) -> object:
    return lambda request: httpx.Response(status, json=body)


def build_call(admin, reply_arguments=None):
    """Run islet_build with the arguments of a normal build of the signal station."""
    arguments = reply_arguments or store.build_arguments(
        PLAYER_ID, "islet_signal_station", "signal_station", Cost(300, 10), 20, "islet:click-0001"
    )
    return asyncio.run(store.run_build(admin, arguments))


# --- reads ---


def test_every_read_filters_on_the_verified_player_and_has_a_limit():
    rows = {
        "wallets": [{"balance": 1000}],
        "islets": [{"timber": 20}],
        "islet_buildings": [BUILDING_ROW],
    }
    admin, seen = make_admin(answers(rows))

    asyncio.run(store.read_coins(admin, PLAYER_ID))
    asyncio.run(store.read_timber(admin, PLAYER_ID))
    asyncio.run(store.read_buildings(admin, PLAYER_ID))
    asyncio.run(store.build_exists(admin, PLAYER_ID, "islet:click-0001"))

    assert [request.url.path.rsplit("/", 1)[-1] for request in seen] == [
        "wallets",
        "islets",
        "islet_buildings",
        "islet_buildings",
    ]
    assert {request.method for request in seen} == {"GET"}
    assert [request.url.params["player_id"] for request in seen] == [f"eq.{PLAYER_ID}"] * 4
    assert all("limit" in request.url.params for request in seen)


def test_read_coins_is_the_balance():
    admin, seen = make_admin(answers_with([{"balance": 640}]))

    coins = asyncio.run(store.read_coins(admin, PLAYER_ID))

    assert coins == 640
    assert seen[0].url.params["select"] == "balance"


def test_a_player_without_a_wallet_is_404_player_not_set_up():
    admin, _seen = make_admin(answers_with([]))

    with pytest.raises(ApiError) as error:
        asyncio.run(store.read_coins(admin, PLAYER_ID))

    assert (error.value.status_code, error.value.code) == (404, "player_not_set_up")


def test_read_timber_is_the_timber_held():
    admin, seen = make_admin(answers_with([{"timber": 10}]))

    assert asyncio.run(store.read_timber(admin, PLAYER_ID)) == 10
    assert seen[0].url.params["select"] == "timber"


def test_read_timber_is_none_without_an_islet_row():
    admin, _seen = make_admin(answers_with([]))

    assert asyncio.run(store.read_timber(admin, PLAYER_ID)) is None


def test_read_buildings_gives_the_standing_buildings_asked_in_plot_order():
    admin, seen = make_admin(answers_with([BUILDING_ROW]))

    standing = asyncio.run(store.read_buildings(admin, PLAYER_ID))

    assert standing == [
        StandingBuilding(
            plot="islet_signal_station",
            building_type="signal_station",
            level=1,
            built_at=datetime(2026, 11, 16, 10, 0, 0, 250000, tzinfo=UTC),
        )
    ]
    params = seen[0].url.params
    assert params["select"] == "plot,building_type,level,built_at"
    assert params["order"] == "plot.asc"
    assert params["limit"] == "10"


def test_read_buildings_is_empty_for_a_player_who_has_built_nothing():
    admin, _seen = make_admin(answers_with([]))

    assert asyncio.run(store.read_buildings(admin, PLAYER_ID)) == []


@pytest.mark.parametrize(
    "bad_row",
    [
        {**BUILDING_ROW, "level": "1"},
        {**BUILDING_ROW, "level": True},
        {**BUILDING_ROW, "built_at": "yesterday"},
        {**BUILDING_ROW, "built_at": "2026-11-16T10:00:00"},  # no time zone
        {**BUILDING_ROW, "plot": 5},
        {"plot": "plot_2"},
    ],
)
def test_a_building_row_in_the_wrong_shape_is_a_502(bad_row):
    admin, _seen = make_admin(answers_with([bad_row]))

    with pytest.raises(SupabaseRejected):
        asyncio.run(store.read_buildings(admin, PLAYER_ID))


@pytest.mark.parametrize("rows", [[{"balance": "5"}], [{"balance": True}], [{}]])
def test_a_wallet_row_in_the_wrong_shape_is_a_502(rows):
    admin, _seen = make_admin(answers_with(rows))

    with pytest.raises(SupabaseRejected):
        asyncio.run(store.read_coins(admin, PLAYER_ID))


@pytest.mark.parametrize("rows", [[{"timber": "5"}], [{"timber": 2.5}], [{}]])
def test_an_islet_row_in_the_wrong_shape_is_a_502(rows):
    admin, _seen = make_admin(answers_with(rows))

    with pytest.raises(SupabaseRejected):
        asyncio.run(store.read_timber(admin, PLAYER_ID))


def test_build_exists_looks_for_this_player_and_this_ref():
    admin, seen = make_admin(answers_with([{"plot": "plot_2"}]))

    found = asyncio.run(store.build_exists(admin, PLAYER_ID, "islet:click-0001"))

    assert found is True
    assert seen[0].url.path.endswith("/islet_buildings")
    assert seen[0].url.params["player_id"] == f"eq.{PLAYER_ID}"
    assert seen[0].url.params["ref"] == "eq.islet:click-0001"
    assert seen[0].url.params["limit"] == "1"


def test_build_exists_is_false_for_a_ref_that_was_never_used():
    admin, _seen = make_admin(answers_with([]))

    assert asyncio.run(store.build_exists(admin, PLAYER_ID, "islet:click-0002")) is False


# --- the build call ---


def test_build_arguments_are_the_seven_arguments_of_the_sql_function():
    arguments = store.build_arguments(
        PLAYER_ID, "plot_2", "workshop", Cost(coins=300, timber=10), 20, "islet:click-0001"
    )

    assert arguments == {
        "p_player_id": PLAYER_ID,
        "p_plot": "plot_2",
        "p_building_type": "workshop",
        "p_coins": 300,
        "p_timber": 10,
        "p_starter_timber": 20,
        "p_ref": "islet:click-0001",
    }


def test_run_build_sends_exactly_the_seven_arguments():
    done = {"status": "done", "balance": 700, "timber": 10, "level": 1}
    admin, seen = make_admin(answers_with(done))

    build_call(admin)

    assert len(seen) == 1
    assert seen[0].method == "POST"
    assert seen[0].url.path.endswith("/rpc/islet_build")
    assert list(json.loads(seen[0].content)) == [
        "p_player_id",
        "p_plot",
        "p_building_type",
        "p_coins",
        "p_timber",
        "p_starter_timber",
        "p_ref",
    ]


@pytest.mark.parametrize(
    ("reply", "expected"),
    [
        (
            {"status": "done", "balance": 700, "timber": 10, "level": 1},
            BuildOutcome(done=True, balance=700, timber=10, level=1),
        ),
        (
            {"status": "refused", "reason": "player_not_set_up"},
            BuildOutcome(done=False, reason="player_not_set_up"),
        ),
        (
            {"status": "refused", "reason": "plot_occupied", "standing": "signal_station"},
            BuildOutcome(done=False, reason="plot_occupied", standing="signal_station"),
        ),
        (
            {"status": "refused", "reason": "not_enough_timber", "timberHeld": 4},
            BuildOutcome(done=False, reason="not_enough_timber", timber_held=4),
        ),
    ],
)
def test_a_done_reply_and_each_refused_reply_are_understood(reply, expected):
    admin, _seen = make_admin(answers_with(reply))

    assert build_call(admin) == expected


def test_a_refusal_with_a_reason_we_do_not_know_is_still_read_so_the_caller_can_decide():
    admin, _seen = make_admin(answers_with({"status": "refused", "reason": "something_new"}))

    outcome = build_call(admin)

    assert outcome.done is False
    assert outcome.reason == "something_new"


@pytest.mark.parametrize(
    "reply",
    [
        None,
        [],
        "done",
        {"status": "maybe"},
        {"balance": 5},
        {"status": "done", "balance": "700", "timber": 10, "level": 1},
        {"status": "done", "balance": True, "timber": 10, "level": 1},
        {"status": "done", "balance": 700, "timber": 10},
        {"status": "refused"},
        {"status": "refused", "reason": 5},
        {"status": "refused", "reason": "not_enough_timber", "timberHeld": "4"},
        {"status": "refused", "reason": "plot_occupied", "standing": 7},
    ],
)
def test_an_unreadable_reply_is_a_502(reply):
    admin, _seen = make_admin(answers_with(reply))

    with pytest.raises(SupabaseRejected) as error:
        build_call(admin)

    assert error.value.status_code == 502


def test_not_enough_coins_is_raised_by_the_wallet_and_passes_through():
    admin, _seen = make_admin(
        answers_with_status(400, {"code": "P0001", "message": "insufficient_funds"})
    )

    with pytest.raises(InsufficientFunds):
        build_call(admin)


def test_a_repeated_ref_is_raised_as_already_applied_and_passes_through():
    admin, _seen = make_admin(
        answers_with_status(409, {"code": "23505", "message": "already_applied"})
    )

    with pytest.raises(AlreadyApplied):
        build_call(admin)


def test_a_database_problem_during_a_build_means_the_outcome_is_unknown():
    admin, _seen = make_admin(answers_with_status(500, {}))

    with pytest.raises(SupabaseUnavailable):
        build_call(admin)


# --- the finale: who has a signal station ---


def test_players_with_signal_station_asks_one_read_for_at_most_four_ids():
    ids = [PLAYER_ID, *OTHER_IDS]
    admin, seen = make_admin(answers_with([]))

    asyncio.run(store.players_with_signal_station(admin, ids))

    assert len(seen) == 1
    params = seen[0].url.params
    assert seen[0].url.path.endswith("/islet_buildings")
    assert params["select"] == "player_id"
    assert params["building_type"] == "eq.signal_station"
    assert params["player_id"] == f"in.({','.join(ids)})"
    assert params["limit"] == "4"


def test_players_with_signal_station_refuses_a_non_uuid_and_more_than_four_ids():
    admin, seen = make_admin(answers_with([]))
    five_ids = [PLAYER_ID, *OTHER_IDS, str(uuid.uuid4())]

    with pytest.raises(ValueError):
        asyncio.run(store.players_with_signal_station(admin, [PLAYER_ID, "not-a-uuid"]))
    with pytest.raises(ValueError):
        asyncio.run(store.players_with_signal_station(admin, five_ids))

    assert seen == []  # nothing was sent


def test_players_with_signal_station_returns_only_players_who_built_one():
    ids = [PLAYER_ID, *OTHER_IDS]
    admin, _seen = make_admin(answers_with([{"player_id": OTHER_IDS[0]}, {"player_id": PLAYER_ID}]))

    found = asyncio.run(store.players_with_signal_station(admin, ids))

    assert found == frozenset({PLAYER_ID, OTHER_IDS[0]})
    assert isinstance(found, frozenset)


def test_players_with_signal_station_with_no_ids_asks_nobody():
    admin, seen = make_admin(answers_with([{"player_id": PLAYER_ID}]))

    found = asyncio.run(store.players_with_signal_station(admin, []))

    assert found == frozenset()
    assert seen == []


def test_players_with_signal_station_answers_in_the_spelling_the_caller_used():
    quiet = "abcdefab-cdef-4abc-8def-abcdefabcdef"
    shouted = quiet.upper()
    admin, seen = make_admin(answers_with([{"player_id": quiet}]))

    found = asyncio.run(store.players_with_signal_station(admin, [shouted]))

    assert found == frozenset({shouted})
    assert seen[0].url.params["player_id"] == f"in.({quiet})"  # the database sees one spelling


def test_players_with_signal_station_ignores_a_row_it_did_not_ask_for():
    admin, _seen = make_admin(answers_with([{"player_id": OTHER_IDS[1]}]))

    found = asyncio.run(store.players_with_signal_station(admin, [PLAYER_ID]))

    assert found == frozenset()


def test_has_signal_station_built_is_true_when_the_player_has_one():
    admin, seen = make_admin(answers_with([{"player_id": PLAYER_ID}]))

    assert asyncio.run(store.has_signal_station_built(admin, PLAYER_ID)) is True
    assert seen[0].url.params["player_id"] == f"in.({PLAYER_ID})"


def test_has_signal_station_built_is_false_when_the_player_has_none():
    admin, _seen = make_admin(answers_with([]))

    assert asyncio.run(store.has_signal_station_built(admin, PLAYER_ID)) is False
