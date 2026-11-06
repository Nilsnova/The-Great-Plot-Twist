"""NPC ports enforce authenticated receipt scope, fixed server arguments and strict input shapes."""

import asyncio

import pytest
from pydantic import ValidationError

from server.game.case_data import load_case
from server.game.case_store import CaseStore, run_function
from server.game.npc_orders import decide_order
from server.routes.case_models import OrderIntent
from server.supabase_admin import SupabaseRejected
from server.tests.case_rule_helpers import PLAYER, snapshot
from server.tests.test_case_store import RowsDatabase


def order_row(**changes):
    return dict(
        crew_id=snapshot().crew_id,
        order_no=1,
        seat_no=2,
        npc_id="deckhand",
        kind="fetch",
        target="C1",
        ordered_by=PLAYER,
        route_id="C1.notice_board",
        result_card="C1",
        price=0,
        ordered_second=0,
        arrive_second=240,
        found_second=600,
        pin_second=900,
        ready_second=900,
        **changes,
    )


@pytest.mark.parametrize(
    "body",
    [
        {"seat": True, "order": "fetch", "target": "C1"},
        {"seat": 0, "order": "fetch", "target": "C1"},
        {"seat": 2, "order": "search", "target": "C1"},
        {"seat": 2, "order": "fetch", "target": "C1", "allowPaid": "false"},
        {"seat": 2, "order": "fetch", "target": "C1", "price": 500},
    ],
)
def test_order_inputs_reject_nonminimum_kinds_and_forged_facts(body):
    with pytest.raises(ValidationError):
        OrderIntent(**body, actionUid="order0001")


def test_old_receipt_lookup_checks_crew_player_and_order_number():
    database = RowsDatabase()
    database.tables["npc_orders"] = [order_row()]
    result = asyncio.run(CaseStore(database).order_lookup(PLAYER, snapshot().crew_id, 1))
    assert result.order_no == 1 and result.seat_no == 2
    _, query = database.reads[-1]
    assert query["crew_id"] == f"eq.{snapshot().crew_id}"
    assert query["ordered_by"] == f"eq.{PLAYER}" and query["order_no"] == "eq.1"


def test_snapshot_limits_job_history_and_preserves_the_accepted_order_count():
    database = RowsDatabase()
    database.tables["crews"][0]["case_state"]["orders_count"] = 41
    database.tables["crews"][0]["npc_orders"] = [order_row()]
    result = asyncio.run(CaseStore(database).snapshot(PLAYER))
    assert result.orders_count == 41 and result.orders[0].pin_second == 900
    query = next(query for table, query in database.reads if table == "crews")
    assert query["npc_orders.order"] == "order_no.desc" and query["npc_orders.limit"] == "40"


def test_snapshot_rejects_an_order_embedded_from_another_crew():
    database = RowsDatabase()
    row = order_row()
    row["crew_id"] = "another-crew"
    database.tables["crews"][0]["npc_orders"] = [row]
    with pytest.raises(SupabaseRejected):
        asyncio.run(CaseStore(database).snapshot(PLAYER))


@pytest.mark.parametrize("field", ["crew_id", "ordered_by"])
def test_receipt_rows_from_another_scope_are_private_database_errors(field):
    database = RowsDatabase()
    row = order_row()
    row[field] = "another-scope"
    database.tables["npc_orders"] = [row]
    with pytest.raises(SupabaseRejected):
        asyncio.run(CaseStore(database).order_lookup(PLAYER, snapshot().crew_id, 1))


def test_fetch_arguments_use_fixed_server_durations_and_first_card_reward():
    database = RowsDatabase()
    calls = []

    async def call(name, params):
        calls.append((name, params))
        return {
            "status": "done",
            "orderNo": 1,
            "foundSecond": 600,
            "pinSecond": 900,
            "coinsPaid": 50,
            "revision": 2,
        }

    database.call_function = call
    data, crew = load_case(), snapshot()
    decision = decide_order(data, crew, crew.seats[0], crew.seats[1], "fetch", "C1", 0)
    asyncio.run(
        CaseStore(database).order(crew, data, PLAYER, "order0001", 2, "fetch", "C1", decision)
    )
    name, params = calls[0]
    assert name == "npc_fetch_pin"
    assert (params["p_errand_seconds"], params["p_arrive_seconds"], params["p_pin_seconds"]) == (
        600,
        240,
        300,
    )
    assert params["p_price"] == 0 and params["p_purchase_ref"] is None
    assert params["p_reward_coins"] == data.rewards.coin("first_card").amount


@pytest.mark.parametrize(
    "name,reply",
    [
        ("npc_fetch_pin", {"status": "done", "orderNo": 1, "revision": 2}),
        ("npc_man_light", {"status": "done", "orderNo": True, "onPostSecond": 600, "revision": 2}),
    ],
)
def test_unreadable_npc_write_answers_are_private_database_errors(name, reply):
    database = RowsDatabase()
    database.reply = reply
    with pytest.raises(SupabaseRejected):
        asyncio.run(run_function(database, name, {}))
