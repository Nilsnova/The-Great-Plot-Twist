"""Tests for POST /api/market/close: closing a position at the price of now.

Nothing here uses the network (see market_world.py for the pretend world). The position of most
tests is POSITION_ID: 100 coins, rising, in Saltreach Harbor Trust, entry price 75000.00, zero
point 67500.00. The clock starts at Monday 9 Nov 2026, 16:00 UTC, and Bitcoin is 76159.21, so the
position is worth 115 coins and closing it pays 115 - 2 = 113.
"""

from dataclasses import replace
from datetime import UTC, datetime
from decimal import Decimal

import httpx
import pytest

from server.market.positions import closing_amounts
from server.market.readings import SOURCE_REPLAY
from server.tests.helpers import CONFIGURED_SETTINGS, assert_error
from server.tests.market_helpers import CLASS_TIME
from server.tests.market_world import (
    AUTH,
    CLOSED_POSITION_ID,
    OTHER_PLAYER_ID,
    PLAYER_ID,
    POSITION_ID,
    World,
    position_row,
)

D = Decimal
REF = "market:close:click-0001"


def world_with_position(**options) -> World:
    world = World(**options)
    world.database.positions = [position_row()]
    return world


def feed_returns_recorded_prices(world: World, monkeypatch) -> None:
    """Pretend the feed has a bug: a live server whose prices come from the recording."""
    real_read = world.feed.read

    async def read(max_age_seconds, only=None):
        readings = await real_read(max_age_seconds, only=only)
        return {key: replace(reading, source=SOURCE_REPLAY) for key, reading in readings.items()}

    monkeypatch.setattr(world.feed, "read", read)


# --- who may close ---


def test_closing_needs_a_sign_in():
    world = World()

    response = world.client.post("/api/market/close", json={})

    assert_error(response, 401, "unauthorized")
    assert world.database.requests == []


def test_while_the_flag_is_off_closing_answers_404_feature_off_and_asks_nobody():
    world = world_with_position(settings=CONFIGURED_SETTINGS)

    assert_error(world.close(), 404, "feature_off")
    assert world.database.requests == []


def test_the_flag_is_checked_before_the_body():
    world = World(settings=CONFIGURED_SETTINGS)

    response = world.client.post("/api/market/close", json={"positionId": 5}, headers=AUTH)

    assert_error(response, 404, "feature_off")


@pytest.mark.parametrize(
    "change",
    [
        {"positionId": "not-a-uuid"},
        {"positionId": ""},
        {"positionId": 12345},
        {"positionId": None},
        {"actionUid": "short"},
        {"actionUid": "has spaces in it"},
        {"actionUid": "x" * 65},
        {"actionUid": 12345678},
    ],
)
def test_a_request_that_does_not_fit_is_refused_with_422_and_nothing_else_happens(change):
    world = world_with_position()

    response = world.close(**change)

    assert_error(response, 422, "validation_error")
    assert world.database.calls("exchange_close_position") == []
    assert world.binance.requests == []


@pytest.mark.parametrize("missing", ["positionId", "actionUid"])
def test_a_missing_field_is_refused_with_422(missing):
    world = world_with_position()
    body = {"positionId": POSITION_ID, "actionUid": "click-0001"}
    del body[missing]

    response = world.client.post("/api/market/close", json=body, headers=AUTH)

    assert_error(response, 422, "validation_error")
    assert missing in response.json()["error"]["message"]


@pytest.mark.parametrize("extra", [{"price": 1.0}, {"playerId": "someone-else"}, {"value": 9999}])
def test_an_extra_field_such_as_a_price_or_a_value_is_refused(extra):
    world = world_with_position()

    assert_error(world.close(**extra), 422, "validation_error")
    assert world.database.calls("exchange_close_position") == []


# --- the speed limit counts closings too ---


def test_openings_and_closings_share_the_limit_of_10_trades_in_30_seconds():
    world = world_with_position()
    first = [world.open(actionUid=f"open-{number:04d}").status_code for number in range(5)]
    second = [world.close(actionUid=f"close-{number:04d}").status_code for number in range(5)]

    response = world.close(actionUid="close-9999")

    assert first + second == [200] * 10
    assert_error(response, 429, "too_many_requests")
    assert response.headers["retry-after"] == "30"


# --- a click that was made already ---


def test_a_repeated_action_uid_is_a_409_already_applied_and_nothing_else_is_asked():
    world = world_with_position()
    world.database.known_refs.add((PLAYER_ID, REF))

    response = world.close()

    assert_error(response, 409, "already_applied")
    assert world.database.calls("exchange_close_position") == []
    assert world.binance.requests == []


def test_the_repeat_check_looks_for_a_close_ref_of_this_player():
    world = world_with_position()

    world.close()

    (read,) = world.database.reads("exchange_events")
    assert read.url.params["player_id"] == f"eq.{PLAYER_ID}"
    assert read.url.params["ref"] == f"eq.{REF}"


def test_a_repeat_is_already_applied_even_when_the_position_is_closed_by_now():
    world = World()
    world.database.positions = [
        position_row(status="closed", closed_at="2026-11-09T12:00:00+00:00")
    ]
    world.database.known_refs.add((PLAYER_ID, REF))

    assert_error(world.close(), 409, "already_applied")


def test_the_database_saying_already_applied_is_a_409_too():
    world = world_with_position()
    world.database.close_reply = httpx.Response(
        409, json={"code": "23505", "message": "already_applied", "details": None}
    )

    assert_error(world.close(), 409, "already_applied")


# --- the position ---


def test_a_position_that_does_not_exist_is_404_no_such_position():
    world = World()

    response = world.close()

    assert_error(response, 404, "no_such_position")
    assert response.json()["error"]["message"] == "You have no position with that id."


def test_the_position_of_another_player_is_404_no_such_position():
    world = World()
    world.database.positions = [position_row(player_id=OTHER_PLAYER_ID)]

    assert_error(world.close(), 404, "no_such_position")
    assert world.database.calls("exchange_close_position") == []


def test_the_position_is_read_by_its_id_and_its_player():
    world = world_with_position()

    world.close()

    read = world.database.reads("exchange_positions")[0]
    assert read.url.params["id"] == f"eq.{POSITION_ID}"
    assert read.url.params["player_id"] == f"eq.{PLAYER_ID}"


def test_a_position_the_player_closed_already_is_a_409_that_says_when():
    world = World()
    world.database.positions = [
        position_row(status="closed", closed_at="2026-11-09T12:06:10+00:00")
    ]

    response = world.close()

    assert_error(response, 409, "position_closed")
    assert response.json()["error"]["message"] == (
        "This position is already closed: you closed it at 12:06 Lisbon time."
    )
    assert world.binance.requests == []


def test_a_position_that_reached_its_zero_point_is_a_409_that_says_so():
    world = World()
    world.database.positions = [
        position_row(
            id=CLOSED_POSITION_ID,
            status="zeroed",
            closed_at="2026-11-09T10:02:31+00:00",
            close_price=67000.0,
            close_value=0,
            close_fee=0,
        )
    ]

    response = world.close(positionId=CLOSED_POSITION_ID)

    assert_error(response, 409, "position_closed")
    assert response.json()["error"]["message"] == (
        "This position is already closed: it reached its zero point at 10:02 Lisbon time "
        "and closed at zero."
    )


def test_a_position_of_a_company_that_left_the_file_cannot_be_closed():
    world = World()
    world.database.positions = [position_row(company_id="old-company")]

    response = world.close()

    assert_error(response, 409, "company_unavailable")
    assert "old-company cannot be traded right now" in response.json()["error"]["message"]


def test_a_position_in_a_stock_cannot_be_closed_while_the_stock_source_is_off():
    world = World(stocks=False)
    world.database.positions = [position_row(company_id="apple")]

    assert_error(world.close(), 409, "company_unavailable")


def test_a_position_opened_on_the_recording_cannot_be_closed_on_live_prices():
    world = World()
    world.database.positions = [position_row(price_mode="replay")]

    response = world.close()

    assert_error(response, 409, "wrong_price_mode")
    assert response.json()["error"]["message"] == (
        "This position was opened on the demo recording, so it can only be closed in demo mode."
    )
    assert world.binance.requests == []


def test_a_position_opened_on_live_prices_cannot_be_closed_in_demo_mode():
    world = World(demo=True)
    world.database.positions = [position_row()]

    response = world.close()

    assert_error(response, 409, "wrong_price_mode")
    assert response.json()["error"]["message"] == (
        "This position was opened on the live market, so it can only be closed there."
    )


def test_in_demo_mode_a_position_of_the_recording_can_be_closed():
    world = World(demo=True)
    world.database.positions = [position_row(price_mode="replay")]

    response = world.close()

    assert response.status_code == 200
    assert world.database.calls("exchange_close_position")[0]["p_price_mode"] == "replay"
    assert world.binance.requests == []


# --- the market must be open and the price fresh ---


def test_a_stock_position_cannot_be_closed_while_new_york_is_closed():
    world = World(stocks=True, start=CLASS_TIME)
    world.database.positions = [
        position_row(company_id="apple", entry_price=250.0, zero_price=225.0)
    ]

    response = world.close()

    assert_error(response, 409, "market_closed")
    assert response.json()["error"]["message"] == (
        "Apple trades in New York, which is closed now (outside its hours). "
        "It opens again on Monday 9 November at 14:30 Lisbon time."
    )
    assert world.stock_server.requests == []
    assert world.database.calls("exchange_close_position") == []


def test_when_the_prices_are_not_current_the_position_cannot_be_closed():
    world = world_with_position()
    world.binance_down()

    response = world.close()

    assert_error(response, 409, "prices_stale")
    assert world.database.calls("exchange_close_position") == []


def test_a_stock_position_can_be_closed_while_new_york_is_open():
    world = World(stocks=True)
    world.database.positions = [
        position_row(company_id="apple", entry_price=250.0, zero_price=225.0)
    ]

    response = world.close()

    assert response.status_code == 200
    call = world.database.calls("exchange_close_position")[0]
    assert (call["p_close_price"], call["p_value"], call["p_fee"]) == ("271.20", 184, 2)


def test_a_delisted_company_can_still_be_closed():
    world = World(relit=True)
    world.database.positions = [
        position_row(company_id="greyfathom-salvage", entry_price=4000.0, zero_price=3600.0)
    ]

    assert world.close().status_code == 200


def test_the_trade_asks_for_prices_at_most_5_seconds_old():
    world = world_with_position()
    world.close(actionUid="click-0001")
    assert len(world.binance.requests) == 1

    world.advance(6)
    world.close(actionUid="click-0002")

    assert len(world.binance.requests) == 2


# --- closing a position ---


def test_closing_pays_the_value_minus_the_closing_fee_and_the_answer_says_where_it_stands():
    world = world_with_position()

    response = world.close()

    assert response.status_code == 200
    assert response.json() == {
        "positionId": POSITION_ID,
        "closedAs": "closed",
        "closePrice": 76159.21,
        "value": 115,
        "fee": 2,
        "coinsChange": 113,
        "coins": 1113,
        "closedAt": "2026-11-09T16:00:10Z",
    }


def test_the_server_sends_the_database_the_price_and_the_value_and_fee_it_worked_out():
    world = world_with_position()

    world.close()

    (call,) = world.database.calls("exchange_close_position")
    assert call == {
        "p_player_id": PLAYER_ID,
        "p_position_id": POSITION_ID,
        "p_price_mode": "live",
        "p_close_price": "76159.21",
        "p_value": 115,
        "p_fee": 2,
        "p_fee_basis_points": 200,
        "p_ref": REF,
    }


@pytest.mark.parametrize(
    "price",
    [
        "76159.21",
        "80000.00",
        "75000.00",
        "70000.00",
        "67600.00",
        "67500.01",
        "67500.00",
        "60000.00",
    ],
)
def test_the_value_and_fee_sent_are_the_ones_of_the_pure_rules(price):
    world = world_with_position()
    world.set_price(BTCUSDT=price)
    expected = closing_amounts("rising", 100, D("75000.0"), D(price), 200)

    world.close()

    (call,) = world.database.calls("exchange_close_position")
    assert (call["p_value"], call["p_fee"]) == (expected.value, expected.fee)


def test_the_closing_fee_is_never_more_than_the_value():
    world = World()
    world.database.positions = [position_row(stake=500, open_fee=10)]
    world.set_price(BTCUSDT="67600.00")  # 500 x (75000 - 7400 x 10) / 75000 = 6.67, so 6 coins

    world.close()

    (call,) = world.database.calls("exchange_close_position")
    assert (call["p_value"], call["p_fee"]) == (6, 6)  # the fee of 10 is cut to the value


def test_a_price_past_the_zero_point_is_worth_zero_and_the_answer_is_zeroed_with_0_coins():
    world = world_with_position()
    world.set_price(BTCUSDT="60000.00")
    world.database.close_reply = {
        "status": "done",
        "closedAs": "zeroed",
        "value": 0,
        "fee": 0,
        "coinsChange": 0,
        "balance": 1000,
        "closedAt": "2026-11-09T16:00:10+00:00",
    }

    response = world.close()

    (call,) = world.database.calls("exchange_close_position")
    assert (call["p_value"], call["p_fee"]) == (0, 0)
    assert response.json()["closedAs"] == "zeroed"
    assert response.json()["coinsChange"] == 0
    assert response.json()["coins"] == 1000


def test_a_falling_position_is_worth_more_when_the_price_falls():
    world = World()
    world.database.positions = [
        position_row(side="falling", entry_price=80000.0, zero_price=88000.0)
    ]

    world.close()

    (call,) = world.database.calls("exchange_close_position")
    assert (call["p_value"], call["p_fee"]) == (148, 2)


def test_after_the_relighting_the_closing_fee_is_1_percent():
    world = World(relit=True)
    world.database.positions = [position_row(stake=500, open_fee=5)]

    world.close()

    (call,) = world.database.calls("exchange_close_position")
    assert (call["p_fee"], call["p_fee_basis_points"]) == (5, 100)


def test_the_automatic_close_runs_after_the_position_is_closed():
    world = world_with_position()

    world.close()

    assert world.database.names() == [
        "exchange_events",
        "exchange_positions",
        "exchange_close_position",
        "exchange_close_used_up",
    ]
    (sweep,) = world.database.calls("exchange_close_used_up")
    assert sweep["p_player_id"] is None


def test_no_automatic_close_runs_when_the_closing_was_refused():
    world = world_with_position()
    world.database.close_reply = {"status": "refused", "reason": "wrong_price_mode"}

    world.close()

    assert world.database.calls("exchange_close_used_up") == []


def test_a_sweep_that_fails_does_not_fail_the_closing():
    world = world_with_position()
    world.database.sweep_reply = httpx.Response(500, json={"code": "XX000", "message": "boom"})

    assert world.close().status_code == 200


def test_the_coin_movements_of_a_closing_go_through_the_wallet_rules(monkeypatch):
    from server.market import trading

    seen = []
    original = trading.validate_transaction

    def spy(delta, reason, ref):
        seen.append((delta, reason, ref))
        original(delta, reason, ref)

    monkeypatch.setattr(trading, "validate_transaction", spy)
    world = world_with_position()

    world.close()

    assert seen == [(115, "market_payout", REF), (-2, "market_fee", REF)]


def test_a_closing_that_pays_nothing_moves_no_coins_so_the_wallet_is_not_asked(monkeypatch):
    from server.market import trading

    seen = []
    monkeypatch.setattr(trading, "validate_transaction", lambda *args: seen.append(args))
    world = world_with_position()
    world.set_price(BTCUSDT="60000.00")

    world.close()

    assert seen == []


# --- what the database refuses ---


def test_a_position_that_was_closed_a_moment_ago_by_a_sweep_is_a_409_with_the_database_words():
    world = world_with_position()
    world.database.close_reply = {
        "status": "refused",
        "reason": "position_closed",
        "closedAs": "zeroed",
        "closedAt": "2026-11-09T16:00:02+00:00",
    }

    response = world.close()

    assert_error(response, 409, "position_closed")
    assert (
        "reached its zero point at 16:00 Lisbon time and closed at zero"
        in (response.json()["error"]["message"])
    )


def test_the_database_saying_no_such_position_is_a_404():
    world = world_with_position()
    world.database.close_reply = {"status": "refused", "reason": "no_such_position"}

    assert_error(world.close(), 404, "no_such_position")


def test_the_database_saying_wrong_price_mode_is_a_409():
    world = world_with_position()
    world.database.close_reply = {"status": "refused", "reason": "wrong_price_mode"}

    assert_error(world.close(), 409, "wrong_price_mode")


def test_the_mode_sent_to_the_database_is_the_mode_of_the_price_that_was_used(monkeypatch):
    world = world_with_position()
    feed_returns_recorded_prices(world, monkeypatch)

    world.close()

    (call,) = world.database.calls("exchange_close_position")
    assert call["p_price_mode"] == "replay"  # not "live", the mode stored with the position


def test_a_price_of_the_wrong_kind_is_refused_by_the_database_even_if_the_server_slips(
    monkeypatch,
):
    world = world_with_position()
    feed_returns_recorded_prices(world, monkeypatch)

    response = world.close()

    assert_error(response, 409, "wrong_price_mode")
    assert "can only be closed there" in response.json()["error"]["message"]
    assert world.database.balance == 1000  # nothing was paid


def test_the_prices_and_the_position_of_one_kind_pass_the_database_check_on_both_kinds():
    live = world_with_position()
    recorded = world_with_position(demo=True)
    recorded.database.positions = [position_row(price_mode="replay")]

    assert live.close().status_code == 200
    assert recorded.close().status_code == 200
    assert live.database.calls("exchange_close_position")[0]["p_price_mode"] == "live"
    assert recorded.database.calls("exchange_close_position")[0]["p_price_mode"] == "replay"


def test_a_refusal_we_do_not_know_is_a_502_and_not_a_success():
    world = world_with_position()
    world.database.close_reply = {"status": "refused", "reason": "something_new"}

    assert_error(world.close(), 502, "database_error")


@pytest.mark.parametrize(
    "reply",
    [
        None,
        [],
        "done",
        {"status": "maybe"},
        {"balance": 5},
        {"status": "done"},
        {"status": "done", "closedAs": "closed", "value": "1"},
    ],
)
def test_an_answer_that_is_not_a_refusal_and_cannot_be_read_is_an_unknown_outcome(reply):
    # The database answered, so its transaction has finished: the coins may have been paid.
    world = world_with_position()
    world.database.close_reply = reply

    response = world.close()

    assert_error(response, 503, "database_unavailable")
    assert "check your positions" in response.json()["error"]["message"]


@pytest.mark.parametrize(
    "reply",
    [
        {"status": "refused"},
        {"status": "refused", "reason": "position_closed"},  # how and when it closed are missing
        {"status": "refused", "reason": "position_closed", "closedAs": "sold", "closedAt": "x"},
    ],
)
def test_a_refusal_that_cannot_be_read_changed_nothing_so_it_is_a_502(reply):
    world = world_with_position()
    world.database.close_reply = reply

    assert_error(world.close(), 502, "database_error")


def test_numbers_that_do_not_add_up_are_a_502():
    world = world_with_position()
    world.database.close_reply = httpx.Response(
        400, json={"code": "P0001", "message": "bad_trade", "details": None}
    )

    assert_error(world.close(), 502, "database_error")


def test_a_database_that_times_out_is_a_503_and_the_message_says_the_outcome_is_unknown():
    world = world_with_position()
    world.database.close_reply = httpx.ReadTimeout("slow")

    response = world.close()

    assert_error(response, 503, "database_unavailable")
    assert "may or may not have gone through" in response.json()["error"]["message"]


def test_a_laptop_without_a_database_cannot_close_a_position():
    assert_error(World(database=False).close(), 503, "database_not_configured")


# --- safe repeats ---


def test_sending_the_same_click_twice_uses_the_same_ledger_ref_both_times():
    world = world_with_position()

    world.close(actionUid="click-same-1")
    world.close(actionUid="click-same-1")

    refs = [call["p_ref"] for call in world.database.calls("exchange_close_position")]
    assert refs == ["market:close:click-same-1", "market:close:click-same-1"]


def test_two_different_clicks_use_two_different_refs():
    world = world_with_position()

    world.close(actionUid="click-aaaa-1")
    world.close(actionUid="click-bbbb-2")

    refs = {call["p_ref"] for call in world.database.calls("exchange_close_position")}
    assert refs == {"market:close:click-aaaa-1", "market:close:click-bbbb-2"}


def test_the_clock_of_a_sunday_does_not_matter_to_the_island_companies():
    world = world_with_position(start=datetime(2026, 11, 8, 12, 0, tzinfo=UTC))  # a Sunday

    assert world.close().status_code == 200
