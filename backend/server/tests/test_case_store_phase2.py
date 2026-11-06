"""Phase 2 case reads and RPC replies are scoped, checked and derived from server data."""

import asyncio
from copy import deepcopy

import pytest

from server.game.case_data import load_case
from server.game.case_rewards import solve_shares
from server.game.case_rows import SIGNAL_SUMMARIES
from server.game.case_store import CaseStore, run_function
from server.game.case_view import build_case_view
from server.supabase_admin import SupabaseRejected
from server.tests.case_rule_helpers import PLAYER, snapshot
from server.tests.test_case_store import RowsDatabase, stored_crew


def phase2_crew():
    row = stored_crew()
    row["case_state"].update(night_no=1, night_started_second=100, schooner_found_second=300)
    row["board_pins"] = [
        {
            "crew_id": row["id"],
            "seat_no": 2,
            "card_id": "C2",
            "ordered_second": 10,
            "pinned_second": 100,
            "pinned_by": PLAYER,
            "by_partner": True,
            "order_no": 1,
            "coins_rewarded": 50,
        }
    ]
    row["finale_posts"] = [
        {
            "crew_id": row["id"],
            "id": 1,
            "light_id": "keepers_lamp",
            "seat_no": 2,
            "player_id": None,
            "npc_id": "deckhand",
            "taken_second": 100,
            "on_post_second": 160,
            "ended_second": None,
            "order_no": 2,
        }
    ]
    row["finale_signals"] = [
        {
            "crew_id": row["id"],
            "id": 1,
            "night_no": 1,
            "light_id": "keepers_lamp",
            "post_seat_no": 2,
            "aimed_seat_no": 1,
            "aimed_by": PLAYER,
            "bearing": 50.2,
            "on_target": True,
            "case_second": 300,
            "holds_until_second": 390,
            "ended_second": None,
            "parted": True,
        }
    ]
    return row


def read(row):
    database = RowsDatabase()
    database.tables["crews"] = [row]
    return asyncio.run(CaseStore(database).snapshot(PLAYER)), database


def test_snapshot_reads_crew_pins_open_posts_and_last_40_signals():
    result, database = read(phase2_crew())
    assert result.pins[0].by_partner and result.pins[0].ordered_second == 10
    assert result.posts[0].npc_id == "deckhand" and result.signals[0].bearing == 50.2
    assert (result.night_no, result.night_started_second) == (1, 100)
    assert result.parted_players == frozenset({PLAYER})
    query = next(query for table, query in database.reads if table == "crews")
    assert all(
        f"{table}(*)" in query["select"]
        for table in ("board_pins", "finale_posts", "finale_signals")
    )
    assert query["finale_posts.ended_second"] == "is.null"
    assert query["finale_signals.order"] == "id.desc"
    assert query["finale_signals.limit"] == "40"
    assert query["id"] == f"eq.{snapshot().crew_id}"
    for alias, filters, limit in SIGNAL_SUMMARIES:
        assert f"{alias}:finale_signals(*)" in query["select"]
        assert query[f"{alias}.limit"] == str(limit)
        assert all(query[f"{alias}.{key}"] == value for key, value in filters.items())


def test_old_parting_locks_survive_more_than_40_newer_attempts():
    row = phase2_crew()
    row["case_state"]["schooner_found_second"] = 189
    first = {**row["finale_signals"][0], "case_second": 100, "holds_until_second": 190}
    misses = [
        {
            **first,
            "id": index,
            "light_id": "harbor_light",
            "on_target": False,
            "case_second": 100 + index,
            "holds_until_second": None,
            "parted": False,
            "aimed_by": None,
        }
        for index in range(4, 42)
    ]
    last = [
        {
            **first,
            "id": index,
            "light_id": light,
            "case_second": at,
            "holds_until_second": at + 90,
            "aimed_by": None,
        }
        for index, light, at in ((42, "harbor_light", 188), (43, "islet_signal_station", 189))
    ]
    row["finale_signals"] = [*misses, *last]
    row["finale_parted_signals"] = [first, *last]
    state, _ = read(row)
    assert PLAYER in state.parted_players
    assert next(
        payout for payout in solve_shares(load_case(), state) if payout.player_id == PLAYER
    ).finale_role
    view = build_case_view(load_case(), state, PLAYER, 190)
    assert set(view["finale"]["parted"]["lights"]) == {
        "keepers_lamp",
        "harbor_light",
        "islet_signal_station",
    }


def test_quiet_light_latest_bearing_and_lock_survive_recent_history_truncation():
    row = phase2_crew()
    row["case_state"]["schooner_found_second"] = None
    first = {
        **row["finale_signals"][0],
        "case_second": 100,
        "holds_until_second": 190,
        "parted": False,
    }
    row["finale_signals"] = [
        {
            **first,
            "id": index,
            "light_id": "harbor_light",
            "on_target": False,
            "holds_until_second": None,
            "case_second": 100 + index,
        }
        for index in range(2, 42)
    ]
    row["finale_latest_keepers_lamp"] = [first]
    row["finale_lock_keepers_lamp"] = [first]
    state, _ = read(row)
    view = build_case_view(load_case(), state, PLAYER, 180)
    keeper = next(light for light in view["finale"]["lights"] if light["id"] == "keepers_lamp")
    assert keeper["lastBearing"] == 50.2
    assert keeper["lock"] == {"remaining": 10, "aimedBySeat": 1}
    assert next(credit for credit in view["credits"] if credit["isMe"])["locks"] == 1


@pytest.mark.parametrize("alias,filters,limit", SIGNAL_SUMMARIES)
def test_supplementary_signal_rows_are_crew_scoped_and_bounded(alias, filters, limit):
    row = phase2_crew()
    row[alias] = [{**row["finale_signals"][0], "crew_id": "other-crew"}]
    with pytest.raises(SupabaseRejected):
        read(row)
    row[alias] = [row["finale_signals"][0]] * (limit + 1)
    with pytest.raises(SupabaseRejected):
        read(row)


def test_overlapping_signal_reads_must_agree_on_the_whole_row():
    row = phase2_crew()
    row["finale_parted_signals"] = [{**row["finale_signals"][0], "bearing": 80.1}]
    with pytest.raises(SupabaseRejected):
        read(row)


@pytest.mark.parametrize("table", ["board_pins", "finale_posts", "finale_signals"])
def test_crosscrew_phase2_rows_are_rejected(table):
    row = phase2_crew()
    row[table][0]["crew_id"] = "other-crew"
    with pytest.raises(SupabaseRejected):
        read(row)


@pytest.mark.parametrize(
    "table,changes",
    [
        ("board_pins", {"pinned_second": 9}),
        ("board_pins", {"by_partner": False}),
        ("board_pins", {"coins_rewarded": True}),
        ("finale_posts", {"player_id": PLAYER}),
        ("finale_posts", {"on_post_second": 99}),
        ("finale_posts", {"ended_second": 99}),
        ("finale_signals", {"bearing": float("nan")}),
        ("finale_signals", {"bearing": 360}),
        ("finale_signals", {"bearing": "50.2"}),
        ("finale_signals", {"on_target": False}),
        ("finale_signals", {"holds_until_second": 299}),
        ("finale_signals", {"ended_second": 299}),
        ("finale_signals", {"night_no": 2}),
    ],
)
def test_invalid_phase2_history_is_a_private_database_error(table, changes):
    row = phase2_crew()
    row[table][0].update(changes)
    with pytest.raises(SupabaseRejected):
        read(row)


@pytest.mark.parametrize(
    "changes",
    [
        {"night_no": 0},
        {"night_started_second": None},
        {"night_started_second": -1},
    ],
)
def test_night_number_and_start_are_complete(changes):
    row = phase2_crew()
    row["case_state"].update(changes)
    with pytest.raises(SupabaseRejected):
        read(row)


GOOD_REPLIES = [
    ("board_pin", {"status": "done", "coinsPaid": 50, "revision": 2}),
    ("board_pair", {"status": "wrong_pair", "seconds": 20, "revision": 2}),
    (
        "board_pair",
        {"status": "formed", "payouts": [{"playerId": PLAYER, "paid": 200}], "revision": 2},
    ),
    ("finale_nightfall", {"status": "done", "nightNo": 1, "endsSecond": 1200, "revision": 2}),
    ("finale_take_post", {"status": "done", "onPostSecond": 60, "revision": 2}),
    ("finale_signal", {"status": "off_target", "seconds": 5, "revision": 2}),
    ("finale_signal", {"status": "locked", "parted": False, "revision": 2}),
]


@pytest.mark.parametrize("name,reply", GOOD_REPLIES)
def test_each_phase2_rpc_accepts_its_own_reply_without_a_now_field(name, reply):
    database = RowsDatabase()
    database.reply = reply
    assert asyncio.run(run_function(database, name, {})) == reply


@pytest.mark.parametrize("name,reply", GOOD_REPLIES)
def test_each_state_changing_reply_requires_a_positive_integer_revision(name, reply):
    database = RowsDatabase()
    for invalid in (None, True, 0, "2"):
        database.reply = {**reply, "revision": invalid}
        with pytest.raises(SupabaseRejected):
            asyncio.run(run_function(database, name, {}))


@pytest.mark.parametrize(
    "name,reply",
    [
        ("board_pin", {"status": "done", "coinsPaid": True, "revision": 2}),
        ("board_pin", {"status": "locked", "parted": False, "revision": 2}),
        ("board_pair", {"status": "wrong_pair", "seconds": -1, "revision": 2}),
        (
            "board_pair",
            {"status": "formed", "payouts": [{"playerId": "", "paid": 1}], "revision": 2},
        ),
        (
            "board_pair",
            {"status": "formed", "payouts": [{"playerId": PLAYER, "paid": 1}] * 2, "revision": 2},
        ),
        ("finale_nightfall", {"status": "done", "nightNo": 0, "endsSecond": 1, "revision": 2}),
        ("finale_take_post", {"status": "done", "onPostSecond": True, "revision": 2}),
        ("finale_signal", {"status": "locked", "parted": 1, "revision": 2}),
    ],
)
def test_malformed_or_wrong_function_replies_are_rejected(name, reply):
    database = RowsDatabase()
    database.reply = reply
    with pytest.raises(SupabaseRejected):
        asyncio.run(run_function(database, name, {}))


def test_helpers_are_not_callable_through_the_intent_store():
    with pytest.raises(ValueError):
        asyncio.run(run_function(RowsDatabase(), "finale_leave_post", {}))


def test_phase2_methods_only_send_server_content_and_verified_player_arguments():
    class CapturingDatabase(RowsDatabase):
        async def call_function(self, name, params):
            self.calls.append((name, deepcopy(params)))
            return {"status": "refused", "reason": "changed"}

    database, data, state = CapturingDatabase(), load_case(), snapshot()
    database.calls = []
    store = CaseStore(database)

    async def exercise():
        await store.pin(state, data, PLAYER, "action001", "C1")
        await store.pair(state, data, PLAYER, "action002", "C1", "C2")
        await store.pair(state, data, PLAYER, "action003", "C1", "C3")
        await store.nightfall(state, data, PLAYER, "action004")
        await store.take_post(state, data, PLAYER, "action005", "keepers_lamp", True)
        await store.signal(state, data, PLAYER, "action006", "keepers_lamp", 359.96, True)

    asyncio.run(exercise())
    calls = database.calls
    assert [name for name, _ in calls] == [
        "board_pin",
        "board_pair",
        "board_pair",
        "finale_nightfall",
        "finale_take_post",
        "finale_signal",
    ]
    assert all(
        params["p_crew_id"] == state.crew_id and params["p_player_id"] == PLAYER
        for _, params in calls
    )
    assert calls[0][1]["p_reward_ref"] == "false_light:card:C1"
    assert calls[0][1]["p_reward_coins"] == data.rewards.coin("first_card").amount
    assert calls[1][1]["p_deduction_id"] == "D1"
    assert calls[1][1]["p_reward_ref"] == "false_light:deduction:D1"
    assert calls[2][1]["p_deduction_id"] is None and calls[2][1]["p_reward_ref"]
    assert "p_payouts" not in calls[1][1]
    assert calls[3][1]["p_night_seconds"] == data.night.night_minutes * 60
    assert calls[4][1]["p_climb_seconds"] == data.night.climb_minutes * 60
    assert calls[5][1]["p_bearing"] == 0 and calls[5][1]["p_on_target"] is True
