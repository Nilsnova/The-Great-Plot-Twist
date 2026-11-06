"""Phase2 reads preserve crew scope and reject malformed night history and RPC replies."""

import asyncio

import pytest

from server.game.case_data import load_case
from server.game.case_store import CaseStore, run_function
from server.supabase_admin import SupabaseRejected
from server.tests.case_rule_helpers import PLAYER, snapshot
from server.tests.test_case_store import RowsDatabase


class Stations:
    async def players_with_signal_station(self, admin, players):
        assert set(players) == {seat.player_id for seat in snapshot().seats if seat.player_id}
        return frozenset({PLAYER})

    async def timber(self, admin, player_id):
        assert player_id == PLAYER
        return 0


def test_phase2_snapshot_batches_stations_and_limits_night_history():
    database = RowsDatabase()
    crew = database.tables["crews"][0]
    crew["case_state"].update(night_no=1, night_started_second=10, night_called_by=PLAYER)
    crew["board_pins"] = [
        dict(card_id="C1", seat_no=1, ordered_second=1, pinned_second=1, pinned_by=PLAYER)
    ]
    crew["finale_posts"] = [
        dict(
            id=1,
            light_id="harbor_light",
            seat_no=1,
            player_id=PLAYER,
            npc_id=None,
            taken_second=1,
            on_post_second=61,
            ended_second=None,
            order_no=None,
        )
    ]
    crew["finale_signals"] = [
        dict(
            id=1,
            night_no=1,
            light_id="harbor_light",
            post_seat_no=1,
            aimed_by=PLAYER,
            aimed_seat_no=1,
            bearing=10.2,
            on_target=True,
            case_second=61,
            holds_until_second=151,
            ended_second=None,
            parted=True,
        )
    ]
    result = asyncio.run(CaseStore(database, stations=Stations()).snapshot(PLAYER))
    assert result.night_no == 1 and len(result.pins) == len(result.posts) == 1
    assert result.signals[0].bearing == 10.2
    assert result.parted_players == result.station_players == frozenset({PLAYER})
    assert result.timber == 0
    query = next(query for table, query in database.reads if table == "crews")
    assert query["finale_posts.ended_second"] == "is.null"
    assert query["finale_signals.order"] == "id.desc"
    assert query["finale_signals.limit"] == "40"


@pytest.mark.parametrize("table", ["board_pins", "finale_posts", "finale_signals"])
def test_other_crew_phase2_history_is_a_private_database_error(table):
    database = RowsDatabase()
    database.tables["crews"][0][table] = [{"crew_id": "another-crew"}]
    with pytest.raises(SupabaseRejected):
        asyncio.run(CaseStore(database).snapshot(PLAYER))


@pytest.mark.parametrize(
    ("name", "reply"),
    [
        ("board_pin", {"status": "done", "revision": 2}),
        ("board_pair", {"status": "formed", "revision": 2, "payouts": [None]}),
        ("finale_nightfall", {"status": "done", "revision": 2, "nightNo": True}),
        ("finale_take_post", {"status": "done", "revision": 2, "onPostSecond": -1}),
        ("finale_signal", {"status": "locked", "revision": 2, "parted": "true"}),
    ],
)
def test_malformed_phase2_rpc_answers_are_database_errors(name, reply):
    database = RowsDatabase()
    database.reply = reply
    with pytest.raises(SupabaseRejected):
        asyncio.run(run_function(database, name, {}))


def test_signal_arguments_use_the_server_target_and_normalise_the_bearing():
    database = RowsDatabase()
    calls = []

    async def call(name, params):
        calls.append((name, params))
        return {"status": "locked", "revision": 2, "parted": False}

    database.call_function = call
    data = load_case()
    asyncio.run(
        CaseStore(database).signal(snapshot(), data, PLAYER, "signal001", "harbor_light", 359.99)
    )
    name, params = calls[0]
    assert name == "finale_signal" and params["p_bearing"] == 0.0
    assert type(params["p_on_target"]) is bool
    assert params["p_lock_seconds"] == data.night.lock_seconds
