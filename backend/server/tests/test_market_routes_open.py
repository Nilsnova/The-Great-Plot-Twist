"""Tests for POST /api/market/open: opening a 10x position.

Nothing here uses the network (see market_world.py for the pretend world). The order of the
checks is part of the contract (routes/market.py): sign-in, the flag, the request, the speed
limit, a repeat, the stake, the company, delisting, the price source, a fresh price on an open
market, the automatic close, the wallet rules, the database.

Fixed numbers: the clock starts at Monday 9 Nov 2026, 16:00 UTC (New York is open), Bitcoin is
76159.21, and a stake of 100 coins pays a fee of 2 (1 after the Relighting).
"""

import logging
from datetime import UTC, datetime

import httpx
import pytest

from server.tests.helpers import CONFIGURED_SETTINGS, assert_error
from server.tests.market_helpers import CLASS_TIME
from server.tests.market_world import (
    AUTH,
    NEW_POSITION_ID,
    PLAYER_ID,
    World,
)

REF = "market:open:click-0001"


def opens(world: World, count: int) -> list[int]:
    """Open `count` positions with different clicks and give the status codes."""
    return [world.open(actionUid=f"click-{number:04d}").status_code for number in range(count)]


# --- who may open ---


def test_opening_needs_a_sign_in():
    world = World()

    response = world.client.post("/api/market/open", json={})

    assert_error(response, 401, "unauthorized")
    assert world.database.requests == []


def test_a_visitor_without_a_sign_in_gets_401_even_while_the_flag_is_off():
    world = World(settings=CONFIGURED_SETTINGS)

    assert_error(world.client.post("/api/market/open", json={}), 401, "unauthorized")


def test_while_the_flag_is_off_opening_answers_404_feature_off_and_asks_nobody():
    world = World(settings=CONFIGURED_SETTINGS)

    response = world.open()

    assert_error(response, 404, "feature_off")
    assert world.database.requests == []
    assert world.binance.requests == []


def test_the_flag_is_checked_before_the_body_so_a_bad_body_while_it_is_off_is_still_a_404():
    world = World(settings=CONFIGURED_SETTINGS)

    response = world.client.post("/api/market/open", json={"stake": "lots"}, headers=AUTH)

    assert_error(response, 404, "feature_off")


# --- the request must fit ---


@pytest.mark.parametrize(
    "change",
    [
        {"stake": 0},
        {"stake": -3},
        {"stake": 100.5},
        {"stake": "100"},
        {"stake": True},
        {"stake": 1_000_001},
        {"stake": None},
        {"side": "hold"},
        {"side": "RISING"},
        {"side": "buy"},
        {"companyId": "Harbor-Trust"},
        {"companyId": "x"},
        {"companyId": "harbor trust"},
        {"companyId": ""},
        {"actionUid": "short"},
        {"actionUid": "has spaces in it"},
        {"actionUid": "x" * 65},
        {"actionUid": 12345678},
    ],
)
def test_a_request_that_does_not_fit_is_refused_with_422_and_nothing_else_happens(change):
    world = World()

    response = world.open(**change)

    assert_error(response, 422, "validation_error")
    assert world.database.calls("exchange_open_position") == []
    assert world.binance.requests == []


@pytest.mark.parametrize("missing", ["companyId", "side", "stake", "actionUid"])
def test_a_missing_field_is_refused_with_422(missing):
    world = World()
    body = {"companyId": "harbor-trust", "side": "rising", "stake": 100, "actionUid": "click-0001"}
    del body[missing]

    response = world.client.post("/api/market/open", json=body, headers=AUTH)

    assert_error(response, 422, "validation_error")
    assert missing in response.json()["error"]["message"]


@pytest.mark.parametrize(
    "extra", [{"price": 1.0}, {"playerId": "someone-else"}, {"coins": 99999}, {"entryPrice": "1"}]
)
def test_an_extra_field_such_as_a_price_or_a_player_id_is_refused(extra):
    world = World()

    response = world.open(**extra)

    assert_error(response, 422, "validation_error")
    assert world.database.calls("exchange_open_position") == []


@pytest.mark.parametrize(
    ("stake", "code", "words"),
    [(9, "stake_too_small", "at least 10 coins"), (501, "stake_too_big", "at most 500 coins")],
)
def test_a_stake_outside_10_to_500_is_a_422_with_its_own_code(stake, code, words):
    world = World()

    response = world.open(stake=stake)

    assert_error(response, 422, code)
    assert words in response.json()["error"]["message"]
    assert world.database.calls("exchange_open_position") == []
    assert world.binance.requests == []


@pytest.mark.parametrize("stake", [10, 500])
def test_the_smallest_and_the_biggest_stake_are_accepted(stake):
    assert World().open(stake=stake).status_code == 200


# --- the speed limit ---


def test_the_11th_open_within_30_seconds_is_a_429_with_a_hint_how_long_to_wait():
    world = World()
    assert opens(world, 10) == [200] * 10

    response = world.open(actionUid="click-0011")

    assert_error(response, 429, "too_many_requests")
    assert response.headers["retry-after"] == "30"
    assert "trading very fast" in response.json()["error"]["message"]


def test_the_refused_11th_open_asks_nobody():
    world = World()
    opens(world, 10)
    database_calls = len(world.database.requests)
    binance_calls = len(world.binance.requests)

    world.open(actionUid="click-0011")

    assert len(world.database.requests) == database_calls
    assert len(world.binance.requests) == binance_calls


def test_after_30_seconds_the_player_may_open_again():
    world = World()
    opens(world, 10)
    world.advance(30)

    assert world.open(actionUid="click-0011").status_code == 200


# --- a click that was made already ---


def test_a_repeated_action_uid_is_a_409_already_applied_and_nothing_else_is_asked():
    world = World()
    world.database.known_refs.add((PLAYER_ID, REF))

    response = world.open()

    assert_error(response, 409, "already_applied")
    assert world.database.calls("exchange_open_position") == []
    assert world.binance.requests == []


def test_the_repeat_check_looks_for_this_player_and_this_ref():
    world = World()

    world.open()

    (read,) = world.database.reads("exchange_events")
    assert read.url.params["player_id"] == f"eq.{PLAYER_ID}"
    assert read.url.params["ref"] == f"eq.{REF}"


def test_a_repeat_is_already_applied_even_when_the_market_has_closed_since():
    world = World(stocks=True, start=CLASS_TIME)  # New York is closed at this time
    world.database.known_refs.add((PLAYER_ID, REF))

    response = world.open(companyId="apple")

    assert_error(response, 409, "already_applied")


def test_a_repeat_is_already_applied_even_when_the_prices_have_gone_old():
    world = World()
    world.binance_down()
    world.database.known_refs.add((PLAYER_ID, REF))

    assert_error(world.open(), 409, "already_applied")


@pytest.mark.parametrize("stake", [9, 501])
def test_a_repeat_is_already_applied_before_the_stake_is_checked(stake):
    world = World()
    world.database.known_refs.add((PLAYER_ID, REF))

    assert_error(world.open(stake=stake), 409, "already_applied")


def test_a_new_click_is_not_a_repeat():
    world = World()
    world.database.known_refs.add((PLAYER_ID, "market:open:click-0000"))

    assert world.open().status_code == 200


def test_the_database_saying_already_applied_is_a_409_too():
    world = World()
    world.database.open_reply = httpx.Response(
        409, json={"code": "23505", "message": "already_applied", "details": None}
    )

    assert_error(world.open(), 409, "already_applied")


def test_a_close_with_the_same_action_uid_is_not_a_repeat_of_an_open():
    world = World()
    world.database.known_refs.add((PLAYER_ID, "market:close:click-0001"))

    assert world.open().status_code == 200


# --- the company ---


def test_an_unknown_company_is_404():
    world = World()

    response = world.open(companyId="no-such-company")

    assert_error(response, 404, "no_such_company")
    assert world.database.calls("exchange_open_position") == []


def test_after_the_relighting_greyfathom_salvage_takes_no_new_positions():
    world = World(relit=True)

    response = world.open(companyId="greyfathom-salvage")

    assert_error(response, 409, "company_delisted")
    assert "delisted after the Relighting" in response.json()["error"]["message"]
    assert "close your positions" in response.json()["error"]["message"]
    assert world.database.calls("exchange_open_position") == []


def test_before_the_relighting_greyfathom_salvage_can_be_traded():
    assert World(relit=False).open(companyId="greyfathom-salvage").status_code == 200


def test_the_other_companies_are_not_delisted_after_the_relighting():
    assert World(relit=True).open(companyId="harbor-trust").status_code == 200


def test_a_stock_while_the_stock_source_is_off_is_unavailable():
    world = World(stocks=False)

    response = world.open(companyId="apple")

    assert_error(response, 409, "company_unavailable")
    assert "Apple cannot be traded right now" in response.json()["error"]["message"]
    assert world.database.calls("exchange_open_position") == []


def test_a_stock_in_demo_mode_is_unavailable_and_its_provider_is_never_called():
    world = World(stocks=True, demo=True)

    assert_error(world.open(companyId="apple"), 409, "company_unavailable")
    assert world.stock_server.requests == []


# --- the market must be open and the price fresh ---


def test_a_stock_while_new_york_is_closed_is_a_409_market_closed_with_the_opening_in_words():
    world = World(stocks=True, start=CLASS_TIME)

    response = world.open(companyId="apple")

    assert_error(response, 409, "market_closed")
    assert response.json()["error"]["message"] == (
        "Apple trades in New York, which is closed now (outside its hours). "
        "It opens again on Monday 9 November at 14:30 Lisbon time."
    )
    assert world.stock_server.requests == []  # nobody is asked for the price of a closed market
    assert world.database.calls("exchange_open_position") == []


def test_on_thanksgiving_day_the_message_names_the_holiday():
    world = World(stocks=True, start=datetime(2026, 11, 26, 16, 0, tzinfo=UTC))

    message = world.open(companyId="apple").json()["error"]["message"]

    assert message == (
        "Apple trades in New York, which is closed for Thanksgiving Day. "
        "It opens again on Friday 27 November at 14:30 Lisbon time."
    )


def test_after_the_calendar_the_message_says_the_opening_hours_are_not_known_yet():
    world = World(stocks=True, start=datetime(2027, 1, 4, 15, 0, tzinfo=UTC))

    response = world.open(companyId="apple")

    assert_error(response, 409, "market_closed")
    assert (
        "Its opening hours after 31 December 2026 are not known yet."
        in (response.json()["error"]["message"])
    )


def test_at_the_class_time_the_island_companies_can_be_opened_while_new_york_is_closed():
    assert World(stocks=True, start=CLASS_TIME).open().status_code == 200


def test_when_binance_has_never_answered_a_trade_is_a_409_prices_stale_and_not_a_503():
    world = World()
    world.binance_down()

    response = world.open()

    assert_error(response, 409, "prices_stale")
    assert response.json()["error"]["message"] == (
        "The price of Saltreach Harbor Trust is not up to date right now, so trading is paused. "
        "Try again in a moment."
    )
    assert world.database.calls("exchange_open_position") == []


def test_when_binance_fails_after_a_good_look_the_old_price_cannot_be_traded_on():
    world = World()
    world.board()
    world.binance_down()
    world.advance(6)

    assert_error(world.open(), 409, "prices_stale")


def test_a_stock_whose_provider_fails_cannot_be_opened():
    world = World(stocks=True)
    world.stock_server.status = 500

    assert_error(world.open(companyId="apple"), 409, "prices_stale")


def test_a_stock_quoted_before_todays_opening_cannot_be_opened_yet():
    world = World(stocks=True, start=datetime(2026, 11, 9, 14, 31, tzinfo=UTC))
    world.stock_server.quoted_at = datetime(2026, 11, 6, 20, 59, 59, tzinfo=UTC)

    assert_error(world.open(companyId="apple"), 409, "prices_stale")


def test_when_the_stock_call_budget_is_used_up_the_trade_is_refused_with_prices_stale():
    world = World(stocks=True)
    world.service.feed.stocks.budget.max_calls = 0

    response = world.open(companyId="apple")

    assert_error(response, 409, "prices_stale")
    assert world.stock_server.requests == []


# --- opening a position ---


def test_a_100_coin_rising_position_costs_102_and_the_answer_says_where_it_stands():
    world = World()

    response = world.open()

    assert response.status_code == 200
    assert response.json() == {
        "positionId": NEW_POSITION_ID,
        "companyId": "harbor-trust",
        "side": "rising",
        "stake": 100,
        "fee": 2,
        "coinsChange": -102,
        "coins": 838,
        "entryPrice": 76159.21,
        "zeroPrice": 68543.289,
        "feePercent": 2.0,
        "openedAt": "2026-11-09T16:00:04Z",
    }


def test_the_server_sends_the_database_the_verified_player_the_fresh_price_the_fee_and_the_limits():
    world = World()

    world.open()

    (call,) = world.database.calls("exchange_open_position")
    assert call == {
        "p_player_id": PLAYER_ID,
        "p_company_id": "harbor-trust",
        "p_side": "rising",
        "p_price_mode": "live",
        "p_entry_price": "76159.21",
        "p_leverage": 10,
        "p_stake": 100,
        "p_fee": 2,
        "p_fee_basis_points": 200,
        "p_ref": REF,
        "p_min_stake": 10,
        "p_max_stake": 500,
        "p_daily_stake_cap": 2000,
        "p_day_start": "2026-11-09T08:00:00+00:00",
        "p_max_open_positions": 20,
    }


def test_the_player_comes_from_the_sign_in_never_from_the_request():
    world = World()

    world.open()

    assert world.database.calls("exchange_open_position")[0]["p_player_id"] == PLAYER_ID


def test_a_falling_position_is_opened_the_same_way():
    world = World()

    response = world.open(side="falling", companyId="two-shores-bureau", stake=50)

    assert response.status_code == 200
    (call,) = world.database.calls("exchange_open_position")
    assert (call["p_side"], call["p_company_id"], call["p_stake"], call["p_fee"]) == (
        "falling",
        "two-shores-bureau",
        50,
        1,
    )
    assert call["p_entry_price"] == "1.1246"


def test_the_price_of_an_opening_is_the_price_of_that_moment_not_the_one_on_the_screen():
    world = World()
    world.board()  # the player's screen shows 76159.21
    world.set_price(BTCUSDT="77000.00")
    world.advance(6)  # the shared price is older than 5 seconds, so the trade asks again

    world.open()

    assert world.database.calls("exchange_open_position")[0]["p_entry_price"] == "77000.00"


def test_after_the_relighting_the_fee_is_1_percent():
    world = World(relit=True)

    response = world.open()

    call = world.database.calls("exchange_open_position")[0]
    assert (call["p_fee"], call["p_fee_basis_points"]) == (1, 100)
    assert response.json()["fee"] == 1
    assert response.json()["coinsChange"] == -101
    assert response.json()["feePercent"] == 1.0


def test_a_stock_is_opened_at_its_provider_price_and_only_its_own_symbol_is_asked_first():
    world = World(stocks=True)

    response = world.open(companyId="apple", side="falling", stake=250)

    assert response.status_code == 200
    (call,) = world.database.calls("exchange_open_position")
    assert call["p_entry_price"] == "271.20"
    assert (call["p_fee"], call["p_price_mode"]) == (5, "live")
    assert world.stock_server.asked_symbols()[0] == "AAPL"
    assert world.stock_server.asked_symbols().count("AAPL") == 1


def test_a_stock_trade_does_not_ask_binance_for_the_stock_but_the_board_sweep_may():
    world = World(stocks=True)

    world.open(companyId="apple")

    assert len(world.binance.requests) == 1  # only the sweep of the island companies


def test_in_demo_mode_the_position_is_stored_with_the_replay_mode_and_binance_is_never_asked():
    world = World(demo=True)

    response = world.open()

    assert response.status_code == 200
    (call,) = world.database.calls("exchange_open_position")
    assert call["p_price_mode"] == "replay"
    assert world.binance.requests == []


def test_the_trade_asks_for_prices_at_most_5_seconds_old():
    world = World()
    world.open(actionUid="click-0001")
    assert len(world.binance.requests) == 1

    world.advance(4)
    world.open(actionUid="click-0002")
    assert len(world.binance.requests) == 1  # 4 seconds old: the cache is good enough

    world.advance(2)
    world.open(actionUid="click-0003")
    assert len(world.binance.requests) == 2  # 6 seconds old: Binance is asked again


def test_the_automatic_close_runs_before_the_position_is_opened():
    world = World()

    world.open()

    assert world.database.names() == [
        "exchange_events",
        "exchange_close_used_up",
        "exchange_open_position",
    ]
    (sweep,) = world.database.calls("exchange_close_used_up")
    assert sweep["p_player_id"] is None  # all players, so the count of 20 positions is right


def test_a_sweep_that_fails_does_not_fail_the_opening(caplog):
    world = World()
    world.database.sweep_reply = httpx.Response(500, json={"code": "XX000", "message": "boom"})

    with caplog.at_level(logging.WARNING, logger="server"):
        response = world.open()

    assert response.status_code == 200
    assert "sweep" in caplog.text.lower()


def test_every_coin_movement_goes_through_the_wallet_rules_before_the_database_is_asked(
    monkeypatch,
):
    seen = []
    from server.market import trading

    original = trading.validate_transaction

    def spy(delta, reason, ref):
        seen.append((delta, reason, ref, len(world.database.calls("exchange_open_position"))))
        original(delta, reason, ref)

    monkeypatch.setattr(trading, "validate_transaction", spy)
    world = World()

    world.open()

    assert seen == [(-100, "market_stake", REF, 0), (-2, "market_fee", REF, 0)]


def test_a_coin_movement_the_wallet_rules_refuse_is_a_422_before_the_database_is_asked(monkeypatch):
    from server.market import trading
    from server.wallet import InvalidTransaction

    def refuse(delta, reason, ref):
        raise InvalidTransaction("The amount cannot be zero.")

    monkeypatch.setattr(trading, "validate_transaction", refuse)
    world = World()

    assert_error(world.open(), 422, "invalid_transaction")
    assert world.database.calls("exchange_open_position") == []


# --- what the database refuses ---


def test_not_enough_coins_is_a_409_insufficient_funds():
    world = World()
    world.database.open_reply = httpx.Response(
        400, json={"code": "P0001", "message": "insufficient_funds", "details": None}
    )

    assert_error(world.open(), 409, "insufficient_funds")


def test_the_daily_cap_is_a_409_that_says_how_many_coins_are_left_today():
    world = World()
    world.database.open_reply = {"status": "refused", "reason": "daily_cap", "coinsLeft": 380}

    response = world.open()

    assert_error(response, 409, "daily_stake_cap")
    assert response.json()["error"]["message"] == (
        "You can put at most 2,000 coins into new positions per game day (from 08:00 Lisbon "
        "time). You can still use 380 coins today."
    )


def test_twenty_open_positions_is_a_409_too_many_positions():
    world = World()
    world.database.open_reply = {
        "status": "refused",
        "reason": "too_many_positions",
        "openCount": 20,
    }

    response = world.open()

    assert_error(response, 409, "too_many_positions")
    assert response.json()["error"]["message"] == (
        "You can have at most 20 open positions. Close one first."
    )


def test_a_refusal_we_do_not_know_is_a_502_and_not_a_success():
    world = World()
    world.database.open_reply = {"status": "refused", "reason": "something_new"}

    assert_error(world.open(), 502, "database_error")


@pytest.mark.parametrize(
    "reply",
    [
        None,
        [],
        "done",
        {"status": "maybe"},
        {"balance": 5},
        {"status": "done"},
        {"status": "done", "positionId": "x", "zeroPrice": "x", "balance": 1, "openedAt": "z"},
    ],
)
def test_an_answer_that_is_not_a_refusal_and_cannot_be_read_is_an_unknown_outcome(reply):
    # The database answered, so its transaction has finished: the coins may have moved. A plain
    # 502 would tell the player nothing happened, and the next click (a new uid) could open twice.
    world = World()
    world.database.open_reply = reply

    response = world.open()

    assert_error(response, 503, "database_unavailable")
    assert "check your positions" in response.json()["error"]["message"]


@pytest.mark.parametrize(
    "reply",
    [
        {"status": "refused"},
        {"status": "refused", "reason": 5},
        {"status": "refused", "reason": "daily_cap"},  # the coins left are missing
        {"status": "refused", "reason": "too_many_positions", "openCount": "many"},
    ],
)
def test_a_refusal_that_cannot_be_read_changed_nothing_so_it_is_a_502(reply):
    world = World()
    world.database.open_reply = reply

    assert_error(world.open(), 502, "database_error")


def test_numbers_that_do_not_add_up_are_a_502_because_it_is_a_bug_not_something_a_player_causes():
    world = World()
    world.database.open_reply = httpx.Response(
        400, json={"code": "P0001", "message": "bad_trade", "details": None}
    )

    assert_error(world.open(), 502, "database_error")


def test_a_database_that_times_out_is_a_503_and_the_message_says_the_outcome_is_unknown():
    world = World()
    world.database.open_reply = httpx.ReadTimeout("slow")

    response = world.open()

    assert_error(response, 503, "database_unavailable")
    assert "may or may not have gone through" in response.json()["error"]["message"]
    assert "check your positions" in response.json()["error"]["message"]


def test_a_database_with_an_internal_problem_is_also_an_unknown_outcome():
    world = World()
    world.database.open_reply = httpx.Response(500, json={"code": "XX000", "message": "boom"})

    response = world.open()

    assert_error(response, 503, "database_unavailable")
    assert "may or may not have gone through" in response.json()["error"]["message"]


def test_a_laptop_without_a_database_cannot_open_a_position():
    assert_error(World(database=False).open(), 503, "database_not_configured")


# --- safe repeats ---


def test_sending_the_same_click_twice_uses_the_same_ledger_ref_both_times():
    world = World()

    world.open(actionUid="click-same-1")
    world.open(actionUid="click-same-1")

    refs = [call["p_ref"] for call in world.database.calls("exchange_open_position")]
    assert refs == ["market:open:click-same-1", "market:open:click-same-1"]


def test_two_different_clicks_use_two_different_refs():
    world = World()

    world.open(actionUid="click-aaaa-1")
    world.open(actionUid="click-bbbb-2")

    refs = {call["p_ref"] for call in world.database.calls("exchange_open_position")}
    assert refs == {"market:open:click-aaaa-1", "market:open:click-bbbb-2"}
