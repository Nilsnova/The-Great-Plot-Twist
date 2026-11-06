"""Partner reads are bounded and crew-scoped; only the two free intent RPCs are callable."""

import asyncio
from dataclasses import replace

import pytest

from server.game.case_data import load_case
from server.game.case_rows import NPC_ORDER_SUMMARIES, npc_history, npc_order_from_row
from server.game.case_store import CaseStore, run_function, snapshot_query
from server.game.npc_orders import NpcOrder, decide_fetch
from server.supabase_admin import SupabaseRejected
from server.tests.case_rule_helpers import PLAYER, snapshot
from server.tests.test_case_store import RowsDatabase


def order_row(**changes):
    row = {
        "crew_id": snapshot().crew_id,
        "order_no": 1,
        "seat_no": 2,
        "npc_id": "deckhand",
        "action_uid": "npcorder001",
        "ordered_by": PLAYER,
        "kind": "fetch",
        "target": "C4",
        "route_id": "C4.low_tide_cave",
        "result_card": "C4",
        "price": 0,
        "ordered_second": 2880,
        "arrive_second": 3120,
        "found_second": 3480,
        "pin_second": 3780,
        "ready_second": 3780,
    }
    return row | changes


def test_partner_history_uses_recent_40_and_latest_per_seat_without_losing_signal_aliases():
    query = snapshot_query(snapshot().crew_id)
    assert query["npc_orders.limit"] == "40" and query["npc_orders.order"] == "order_no.desc"
    assert query["finale_signals.limit"] == "40" and "finale_parted_signals.limit" in query
    for alias, filters, limit in NPC_ORDER_SUMMARIES:
        assert query[f"{alias}.limit"] == str(limit) == "1"
        assert query[f"{alias}.order"] == "order_no.desc"
        assert all(query[f"{alias}.{key}"] == value for key, value in filters.items())
        assert f"{alias}:npc_orders(*)" in query["select"]


def test_a_quiet_seats_old_order_survives_the_recent_history_limit():
    old = order_row()
    recent = [order_row(order_no=number, seat_no=4, npc_id="cook") for number in range(2, 42)]
    raw = {"id": snapshot().crew_id, "npc_orders": recent, "npc_latest_seat_2": [old]}
    result = npc_history(raw)
    assert len(result) == 41 and any(order.order_no == 1 for order in result)
    assert [order.order_no for order in result] == sorted(
        (order.order_no for order in result), reverse=True
    )


@pytest.mark.parametrize(
    "changes",
    [
        {"order_no": True},
        {"seat_no": 0},
        {"npc_id": "unknown"},
        {"price": 1},
        {"kind": "search"},
        {"target": "C9"},
        {"result_card": "C3"},
        {"ready_second": 3779},
        {"arrive_second": 3121},
        {"found_second": 3479},
        {"route_id": "C3.other"},
        {"action_uid": "short"},
        {"ordered_second": -1},
    ],
)
def test_malformed_or_nonminimum_orders_are_private_database_errors(changes):
    with pytest.raises(SupabaseRejected):
        npc_order_from_row(order_row(**changes))


def test_partner_history_rejects_foreign_rows_duplicates_and_unbounded_summaries():
    crew = snapshot().crew_id
    cases = [
        {"id": crew, "npc_orders": [order_row(crew_id="another")]},
        {"id": crew, "npc_orders": [order_row(), order_row()]},
        {"id": crew, "npc_orders": [order_row(order_no=n) for n in range(1, 42)]},
        {"id": crew, "npc_latest_seat_2": [order_row(), order_row(order_no=2)]},
        {
            "id": crew,
            "npc_orders": [order_row()],
            "npc_latest_seat_2": [order_row(pin_second=3781, ready_second=3781)],
        },
    ]
    for raw in cases:
        with pytest.raises(SupabaseRejected):
            npc_history(raw)


def test_snapshot_reads_orders_and_counter_and_rejects_impossible_counter():
    database = RowsDatabase()
    raw = database.tables["crews"][0]
    raw["npc_orders"] = [order_row()]
    raw["case_state"]["orders_count"] = 1
    result = asyncio.run(CaseStore(database).snapshot(PLAYER))
    assert result.orders_count == 1 and result.npc_orders[0].order_no == 1
    raw["case_state"]["orders_count"] = 0
    with pytest.raises(SupabaseRejected):
        asyncio.run(CaseStore(database).snapshot(PLAYER))


def test_order_receipt_lookup_is_exactly_scoped_and_survives_bounded_view_history():
    database = RowsDatabase()
    database.tables["npc_orders"] = [order_row()]
    order = asyncio.run(
        CaseStore(database).npc_order_for_action(PLAYER, "npcorder001", snapshot().crew_id)
    )
    assert isinstance(order, NpcOrder) and order.order_no == 1
    table, query = database.reads[-1]
    assert table == "npc_orders"
    assert query == {
        "select": "*",
        "crew_id": f"eq.{snapshot().crew_id}",
        "ordered_by": f"eq.{PLAYER}",
        "action_uid": "eq.npcorder001",
        "limit": "1",
    }
    for changes in ({"crew_id": "other"}, {"ordered_by": "other"}, {"action_uid": "otheruid"}):
        database.tables["npc_orders"] = [order_row(**changes)]
        with pytest.raises(SupabaseRejected):
            asyncio.run(
                CaseStore(database).npc_order_for_action(PLAYER, "npcorder001", snapshot().crew_id)
            )


def test_fetch_adapter_uses_free_fixed_durations_and_first_pin_reward_only():
    class Capture(RowsDatabase):
        async def call_function(self, name, params):
            self.called = name, params
            return {
                "status": "done",
                "orderNo": 1,
                "foundSecond": 3480,
                "pinSecond": 3780,
                "coinsPaid": 50,
                "revision": 2,
            }

    data, current = load_case(), snapshot()
    decision = decide_fetch(data, current, current.seats[1], "C4", 2880)
    database = Capture()
    asyncio.run(
        CaseStore(database).npc_fetch(current, data, PLAYER, "npcorder001", 2, "C4", decision)
    )
    name, params = database.called
    assert name == "npc_fetch_pin" and params["p_npc_id"] == "deckhand"
    assert params["p_price"] == 0 and params["p_purchase_ref"] is None
    assert params["p_errand_seconds"] == 600 and params["p_arrive_seconds"] == 240
    assert params["p_pin_seconds"] == 300 and params["p_reward_coins"] == 50
    assert params["p_reward_ref"] == "false_light:card:C4"
    assert params["p_route_id"] == decision.route.id


@pytest.mark.parametrize(
    "name,reply",
    [
        (
            "npc_fetch_pin",
            {
                "status": "done",
                "orderNo": True,
                "foundSecond": 1,
                "pinSecond": 2,
                "coinsPaid": 50,
                "revision": 2,
            },
        ),
        (
            "npc_fetch_pin",
            {
                "status": "done",
                "orderNo": 1,
                "foundSecond": 3,
                "pinSecond": 2,
                "coinsPaid": 50,
                "revision": 2,
            },
        ),
        ("npc_man_light", {"status": "done", "orderNo": 1, "onPostSecond": -1, "revision": 2}),
        ("npc_fetch_pin", {"status": "refused", "reason": "locked_window", "minute": True}),
    ],
)
def test_partner_rpc_replies_are_strict(name, reply):
    database = RowsDatabase()
    database.reply = reply
    with pytest.raises(SupabaseRejected):
        asyncio.run(run_function(database, name, {}))


def test_partner_helpers_are_not_rpc_intents():
    for name in ("npc_begin", "npc_next_order_no"):
        with pytest.raises(ValueError):
            asyncio.run(run_function(RowsDatabase(), name, {}))


def test_order_repeats_attach_the_known_uid_even_when_the_database_claims_another_uid():
    database = RowsDatabase()
    action = {"crew_id": snapshot().crew_id, "kind": "order", "target": "C4", "outcome": "fetch"}
    database.tables["case_actions"] = [action | {"actionUid": "untrusted"}]
    result = asyncio.run(CaseStore(database).action_lookup(PLAYER, "npcorder001"))
    assert result["actionUid"] == "npcorder001"
    database.reply = {
        "status": "repeat",
        "crewId": snapshot().crew_id,
        "kind": "order",
        "target": "C4",
        "outcome": "fetch",
        "actionUid": "untrusted",
    }
    result = asyncio.run(run_function(database, "npc_fetch_pin", {"p_action_uid": "npcorder001"}))
    assert result["actionUid"] == "npcorder001"
    database.tables["case_actions"] = [action | {"kind": "search"}]
    assert "actionUid" not in asyncio.run(CaseStore(database).action_lookup(PLAYER, "npcorder001"))


def test_man_light_adapter_carries_only_public_light_and_fixed_trip_parameters():
    class Capture(RowsDatabase):
        async def call_function(self, name, params):
            self.called = name, params
            return {"status": "done", "orderNo": 1, "onPostSecond": 600, "revision": 2}

    database, data, current = Capture(), load_case(), snapshot()
    asyncio.run(
        CaseStore(database).npc_man_light(current, data, PLAYER, "npcorder001", 2, "harbor_light")
    )
    assert database.called == (
        "npc_man_light",
        {
            "p_crew_id": current.crew_id,
            "p_player_id": PLAYER,
            "p_action_uid": "npcorder001",
            "p_seat_no": 2,
            "p_npc_id": "deckhand",
            "p_light_id": "harbor_light",
            "p_travel_seconds": 600,
            "p_night_seconds": data.night.night_minutes * 60,
        },
    )


def test_pin_only_adapter_preserves_the_held_card_without_starting_another_trip():
    from server.game.case_snapshot import Find

    class Capture(RowsDatabase):
        async def call_function(self, name, params):
            self.called = name, params
            return {
                "status": "done",
                "orderNo": 1,
                "foundSecond": None,
                "pinSecond": 310,
                "coinsPaid": 50,
                "revision": 2,
            }

    data = load_case()
    current = replace(snapshot(), finds=(Find(4, "C2", "C2.radio_words", 0, 0),))
    decision = decide_fetch(data, current, current.seats[3], "C2", 10)
    database = Capture()
    asyncio.run(
        CaseStore(database).npc_fetch(current, data, PLAYER, "npcorder001", 4, "C2", decision)
    )
    assert database.called[1]["p_route_id"] is None and database.called[1]["p_window"] is None
