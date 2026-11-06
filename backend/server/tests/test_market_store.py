"""Tests for market/store.py: reading numbers and times from the database, the rows of positions and
events, the arguments of the three database functions and the answers they give.

No network: the database is a fake transport.
"""

import asyncio
from datetime import UTC, datetime
from decimal import Decimal

import httpx
import pytest

from server.market import positions
from server.market.positions import Closing
from server.market.states import SweepPrice
from server.market.store import (
    database_is_configured,
    event_exists,
    has_open_rising_position,
    plain,
    read_balance,
    read_open_positions,
    read_position,
    read_recently_closed,
    read_staked_since,
    row_to_event,
    row_to_position,
    to_decimal,
    to_time,
    to_whole_number,
)
from server.market.store_calls import (
    CLOSE_REF_PREFIX,
    OPEN_REF_PREFIX,
    ZERO_REF_PREFIX,
    close_arguments,
    open_arguments,
    read_close_reply,
    read_open_reply,
    read_sweep_reply,
    run_close,
    run_open,
    run_sweep,
    sweep_arguments,
)
from server.supabase_admin import SupabaseAdmin, SupabaseRejected, SupabaseUnavailable
from server.tests.helpers import make_admin

D = Decimal
NOW = datetime(2026, 11, 6, 12, 5, tzinfo=UTC)
PLAYER = "11111111-2222-4333-8444-555555555555"
POSITION = "7b3e5f20-1111-4222-8333-444455556666"


def run(coroutine):
    return asyncio.run(coroutine)


# What the database sends for an open position (numbers as JSON numbers).
POSITION_ROW = {
    "id": POSITION,
    "company_id": "harbor-trust",
    "side": "rising",
    "price_mode": "live",
    "stake": 100,
    "entry_price": 75000.0,
    "zero_price": 67500.0,
    "open_fee": 2,
    "opened_at": "2026-11-06T11:40:12.250000+00:00",
    "status": "open",
    "closed_at": None,
    "close_price": None,
    "close_value": None,
    "close_fee": None,
}

CLOSED_ROW = {
    **POSITION_ROW,
    "id": "9a71aaaa-1111-4222-8333-444455556666",
    "company_id": "pier-post-courier",
    "side": "falling",
    "stake": 50,
    "entry_price": 2.4,
    "zero_price": 2.64,
    "open_fee": 1,
    "status": "zeroed",
    "closed_at": "2026-11-06T10:02:31+00:00",
    "close_price": 2.6512,
    "close_value": 0,
    "close_fee": 0,
}

EVENT_ROW = {
    "id": 12,
    "position_id": POSITION,
    "kind": "close",
    "company_id": "harbor-trust",
    "side": "rising",
    "price": 76159.21,
    "stake": 100,
    "value": 115,
    "fee": 2,
    "coins_change": 113,
    "ref": "market:close:click-0001",
    "created_at": "2026-11-06T12:06:10+00:00",
}


def request_of(seen: list) -> httpx.Request:
    return seen[0]


# --- numbers and times from the database ---


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (60, D("60")),
        (60.0, D("60.0")),
        (76159.21, D("76159.21")),
        (0.1, D("0.1")),
        ("12.3400", D("12.3400")),
    ],
)
def test_a_number_from_the_database_becomes_the_exact_decimal_it_was_written_as(value, expected):
    assert to_decimal(value) == expected


def test_a_float_is_not_turned_into_its_long_binary_expansion():
    assert str(to_decimal(0.1)) == "0.1"


@pytest.mark.parametrize("value", [None, True, [1], {"a": 1}, "abc", "NaN-ish"])
def test_something_that_is_not_a_number_is_refused(value):
    with pytest.raises(SupabaseRejected):
        to_decimal(value)


@pytest.mark.parametrize("value", [5, 5.0, 0, 1_000_000])
def test_a_whole_number_is_accepted(value):
    assert to_whole_number(value) == int(value)


@pytest.mark.parametrize("value", [5.5, True, "5", None, [5]])
def test_something_that_is_not_a_whole_number_is_refused(value):
    with pytest.raises(SupabaseRejected):
        to_whole_number(value)


def test_a_time_with_a_timezone_is_read():
    assert to_time("2026-11-06T12:05:00+00:00") == NOW
    assert to_time("2026-11-06T12:05:00.250000+00:00") == NOW.replace(microsecond=250000)


@pytest.mark.parametrize("value", ["2026-11-06T12:05:00", "yesterday", 5, None])
def test_a_time_without_a_timezone_or_that_is_not_text_is_refused(value):
    with pytest.raises(SupabaseRejected):
        to_time(value)


@pytest.mark.parametrize(
    ("value", "text"), [(D("60.00"), "60.00"), (D("1E+3"), "1000"), (D("0.00001234"), "0.00001234")]
)
def test_a_decimal_is_written_for_the_database_without_an_exponent(value, text):
    assert plain(value) == text


# --- a row of exchange_positions ---


def test_an_open_row_is_read_exactly():
    row = row_to_position(POSITION_ROW)

    assert row.id == POSITION
    assert (row.company_id, row.side, row.price_mode, row.status) == (
        "harbor-trust",
        "rising",
        "live",
        "open",
    )
    assert (row.stake, row.open_fee) == (100, 2)
    assert (row.entry_price, row.zero_price) == (D("75000.0"), D("67500.0"))
    assert row.opened_at == datetime(2026, 11, 6, 11, 40, 12, 250000, tzinfo=UTC)
    assert row.is_open is True
    assert (row.closed_at, row.close_price, row.close_value, row.close_fee) == (None,) * 4


def test_a_closed_row_keeps_how_and_when_it_closed():
    row = row_to_position(CLOSED_ROW)

    assert row.status == "zeroed"
    assert row.is_open is False
    assert row.closed_at == datetime(2026, 11, 6, 10, 2, 31, tzinfo=UTC)
    assert row.close_price == D("2.6512")
    assert (row.close_value, row.close_fee) == (0, 0)


@pytest.mark.parametrize("missing", list(POSITION_ROW))
def test_a_position_row_with_a_missing_column_is_refused(missing):
    row = {name: value for name, value in POSITION_ROW.items() if name != missing}

    with pytest.raises(SupabaseRejected):
        row_to_position(row)


@pytest.mark.parametrize(
    ("name", "value"), [("status", "pending"), ("side", "sideways"), ("price_mode", "demo")]
)
def test_a_position_row_with_an_unknown_word_is_refused(name, value):
    with pytest.raises(SupabaseRejected):
        row_to_position({**POSITION_ROW, name: value})


# --- a row of exchange_events ---


def test_an_events_row_is_read_exactly():
    event = row_to_event(EVENT_ROW)

    assert (event.id, event.position_id, event.kind) == (12, POSITION, "close")
    assert (event.company_id, event.side) == ("harbor-trust", "rising")
    assert event.price == D("76159.21")
    assert (event.stake, event.value, event.fee, event.coins_change) == (100, 115, 2, 113)
    assert event.ref == "market:close:click-0001"
    assert event.created_at == datetime(2026, 11, 6, 12, 6, 10, tzinfo=UTC)


@pytest.mark.parametrize("missing", list(EVENT_ROW))
def test_an_events_row_with_a_missing_column_is_refused(missing):
    row = {name: value for name, value in EVENT_ROW.items() if name != missing}

    with pytest.raises(SupabaseRejected):
        row_to_event(row)


# --- reading from the tables ---


def test_the_open_positions_of_a_player_are_asked_for_newest_first_and_at_most_20():
    admin, seen = make_admin(lambda request: httpx.Response(200, json=[POSITION_ROW]))

    rows = run(read_open_positions(admin, PLAYER))

    assert [row.id for row in rows] == [POSITION]
    request = request_of(seen)
    assert request.method == "GET"
    assert request.url.path == "/rest/v1/exchange_positions"
    params = request.url.params
    assert params["player_id"] == f"eq.{PLAYER}"
    assert params["status"] == "eq.open"
    assert params["order"] == "opened_at.desc"
    assert params["limit"] == str(positions.MAX_OPEN_POSITIONS) == "20"


def test_the_recently_closed_positions_are_the_ten_newest_closed_or_zeroed():
    admin, seen = make_admin(lambda request: httpx.Response(200, json=[CLOSED_ROW]))

    rows = run(read_recently_closed(admin, PLAYER))

    assert rows[0].status == "zeroed"
    params = request_of(seen).url.params
    assert params["player_id"] == f"eq.{PLAYER}"
    assert params["status"] == "in.(closed,zeroed)"
    assert params["order"] == "closed_at.desc"
    assert params["limit"] == "10"


def test_one_position_is_asked_for_by_its_id_and_its_player():
    admin, seen = make_admin(lambda request: httpx.Response(200, json=[POSITION_ROW]))

    row = run(read_position(admin, PLAYER, POSITION))

    assert row.id == POSITION
    params = request_of(seen).url.params
    assert params["id"] == f"eq.{POSITION}"
    assert params["player_id"] == f"eq.{PLAYER}"
    assert params["limit"] == "1"


def test_a_position_that_is_not_there_is_none():
    admin, _ = make_admin(lambda request: httpx.Response(200, json=[]))

    assert run(read_position(admin, PLAYER, POSITION)) is None


def test_the_stakes_since_the_start_of_the_game_day_are_added_up():
    rows = [{"stake": 100}, {"stake": 250}, {"stake": 10}]
    admin, seen = make_admin(lambda request: httpx.Response(200, json=rows))

    total = run(read_staked_since(admin, PLAYER, datetime(2026, 11, 6, 8, 0, tzinfo=UTC)))

    assert total == 360
    params = request_of(seen).url.params
    assert params["player_id"] == f"eq.{PLAYER}"
    assert params["opened_at"] == "gte.2026-11-06T08:00:00+00:00"
    assert params["select"] == "stake"


def test_a_ref_in_the_history_of_the_player_is_found():
    admin, seen = make_admin(lambda request: httpx.Response(200, json=[{"id": 7}]))

    assert run(event_exists(admin, PLAYER, "market:open:click-0001")) is True
    request = request_of(seen)
    assert request.url.path == "/rest/v1/exchange_events"
    assert request.url.params["player_id"] == f"eq.{PLAYER}"
    assert request.url.params["ref"] == "eq.market:open:click-0001"
    assert request.url.params["limit"] == "1"


def test_a_ref_that_is_not_in_the_history_is_not_found():
    admin, _ = make_admin(lambda request: httpx.Response(200, json=[]))

    assert run(event_exists(admin, PLAYER, "market:open:click-0002")) is False


def test_a_greyfathom_share_is_asked_for_with_open_rising_positions_of_that_player_and_company():
    admin, seen = make_admin(lambda request: httpx.Response(200, json=[{"id": POSITION}]))

    holds = run(has_open_rising_position(admin, PLAYER, "greyfathom-salvage"))

    assert holds is True
    params = request_of(seen).url.params
    assert request_of(seen).url.path == "/rest/v1/exchange_positions"
    assert params["player_id"] == f"eq.{PLAYER}"
    assert params["company_id"] == "eq.greyfathom-salvage"
    assert params["side"] == "eq.rising"
    assert params["status"] == "eq.open"
    assert params["limit"] == "1"


def test_no_open_rising_position_means_no_greyfathom_share():
    admin, _ = make_admin(lambda request: httpx.Response(200, json=[]))

    assert run(has_open_rising_position(admin, PLAYER, "greyfathom-salvage")) is False


def test_the_balance_of_a_player_is_read_from_the_wallet():
    admin, seen = make_admin(lambda request: httpx.Response(200, json=[{"balance": 940}]))

    assert run(read_balance(admin, PLAYER)) == 940
    assert request_of(seen).url.path == "/rest/v1/wallets"
    assert request_of(seen).url.params["player_id"] == f"eq.{PLAYER}"


def test_a_player_without_a_wallet_is_refused():
    admin, _ = make_admin(lambda request: httpx.Response(200, json=[]))

    with pytest.raises(SupabaseRejected, match="no wallet"):
        run(read_balance(admin, PLAYER))


def test_a_database_that_is_not_set_up_is_not_configured():
    assert database_is_configured(SupabaseAdmin("", "")) is False
    assert database_is_configured(SupabaseAdmin("https://x.supabase.co", "")) is False
    assert database_is_configured(SupabaseAdmin("https://x.supabase.co", "sb_secret_x")) is True


# --- the refs ---


def test_the_refs_of_an_open_a_close_and_a_close_at_zero_have_their_own_prefixes():
    assert OPEN_REF_PREFIX == "market:open:"
    assert CLOSE_REF_PREFIX == "market:close:"
    assert ZERO_REF_PREFIX == "market:zero:"


# --- the arguments of exchange_open_position ---


def open_args() -> dict:
    return open_arguments(
        PLAYER,
        "harbor-trust",
        "rising",
        "live",
        D("76159.21"),
        100,
        2,
        200,
        "market:open:click-0001",
        datetime(2026, 11, 6, 8, 0, tzinfo=UTC),
    )


def test_the_arguments_of_exchange_open_position_use_the_names_of_the_sql_parameters_in_order():
    assert list(open_args()) == [
        "p_player_id",
        "p_company_id",
        "p_side",
        "p_price_mode",
        "p_entry_price",
        "p_leverage",
        "p_stake",
        "p_fee",
        "p_fee_basis_points",
        "p_ref",
        "p_min_stake",
        "p_max_stake",
        "p_daily_stake_cap",
        "p_day_start",
        "p_max_open_positions",
    ]


def test_the_price_the_coins_and_the_day_start_are_sent_as_exact_text_and_whole_numbers():
    sent = open_args()

    assert sent["p_entry_price"] == "76159.21"
    assert (sent["p_stake"], sent["p_fee"], sent["p_fee_basis_points"]) == (100, 2, 200)
    assert sent["p_day_start"] == "2026-11-06T08:00:00+00:00"
    assert sent["p_ref"] == "market:open:click-0001"
    assert sent["p_player_id"] == PLAYER


def test_the_limits_come_from_positions_py_so_the_numbers_live_in_one_place():
    sent = open_args()

    assert sent["p_leverage"] == positions.LEVERAGE == 10
    assert sent["p_min_stake"] == positions.MIN_STAKE_COINS == 10
    assert sent["p_max_stake"] == positions.MAX_STAKE_COINS == 500
    assert sent["p_daily_stake_cap"] == positions.DAILY_STAKE_CAP_COINS == 2000
    assert sent["p_max_open_positions"] == positions.MAX_OPEN_POSITIONS == 20


# --- the arguments of exchange_close_position ---


def test_the_arguments_of_exchange_close_position_use_the_names_of_the_sql_parameters_in_order():
    closing = Closing(value=115, fee=2, coins_change=113, used_up=False)

    sent = close_arguments(
        PLAYER, POSITION, "live", D("76159.21"), closing, 200, "market:close:click-0002"
    )

    assert sent == {
        "p_player_id": PLAYER,
        "p_position_id": POSITION,
        "p_price_mode": "live",
        "p_close_price": "76159.21",
        "p_value": 115,
        "p_fee": 2,
        "p_fee_basis_points": 200,
        "p_ref": "market:close:click-0002",
    }
    assert list(sent) == [
        "p_player_id",
        "p_position_id",
        "p_price_mode",
        "p_close_price",
        "p_value",
        "p_fee",
        "p_fee_basis_points",
        "p_ref",
    ]


# --- the arguments of exchange_close_used_up ---


def test_the_sweep_arguments_hold_the_prices_as_exact_text_with_snake_case_keys():
    prices = [
        SweepPrice("harbor-trust", D("76159.21"), NOW, "live"),
        SweepPrice("apple", D("271.2"), datetime(2026, 11, 6, 12, 4, 59, tzinfo=UTC), "live"),
    ]

    sent = sweep_arguments(prices, None)

    assert list(sent) == ["p_prices", "p_player_id"]
    assert sent["p_player_id"] is None
    assert sent["p_prices"] == [
        {
            "company_id": "harbor-trust",
            "price": "76159.21",
            "quoted_at": "2026-11-06T12:05:00+00:00",
            "mode": "live",
        },
        {
            "company_id": "apple",
            "price": "271.2",
            "quoted_at": "2026-11-06T12:04:59+00:00",
            "mode": "live",
        },
    ]


def test_a_sweep_for_one_player_carries_the_player_id():
    assert sweep_arguments([], PLAYER)["p_player_id"] == PLAYER


# --- the answer of exchange_open_position ---


def test_an_opened_position_is_understood():
    outcome = read_open_reply(
        {
            "status": "done",
            "positionId": POSITION,
            "zeroPrice": 68543.289,
            "balance": 838,
            "openedAt": "2026-11-06T12:05:04+00:00",
        }
    )

    assert outcome.done is True
    assert outcome.position_id == POSITION
    assert outcome.zero_price == D("68543.289")
    assert outcome.balance == 838
    assert outcome.opened_at == datetime(2026, 11, 6, 12, 5, 4, tzinfo=UTC)


def test_a_refusal_for_too_many_positions_carries_the_count():
    outcome = read_open_reply(
        {"status": "refused", "reason": "too_many_positions", "openCount": 20}
    )

    assert outcome.done is False
    assert (outcome.reason, outcome.open_count) == ("too_many_positions", 20)


def test_a_refusal_for_the_daily_cap_carries_the_coins_left():
    outcome = read_open_reply({"status": "refused", "reason": "daily_cap", "coinsLeft": 380})

    assert (outcome.reason, outcome.coins_left) == ("daily_cap", 380)


@pytest.mark.parametrize(
    "reply",
    [
        None,
        "done",
        [],
        {},
        {"status": "done"},
        {"status": "done", "positionId": POSITION, "zeroPrice": "x", "balance": 1, "openedAt": "z"},
        {"status": "refused"},
        {"status": "refused", "reason": 5},
        {"status": "refused", "reason": "something_new"},
        {"status": "refused", "reason": "daily_cap"},
        {"status": "maybe"},
    ],
)
def test_an_open_answer_that_is_not_understood_is_a_502(reply):
    with pytest.raises(SupabaseRejected):
        read_open_reply(reply)


# --- the answer of exchange_close_position ---


def test_a_closed_position_is_understood():
    outcome = read_close_reply(
        {
            "status": "done",
            "closedAs": "closed",
            "value": 115,
            "fee": 2,
            "coinsChange": 113,
            "balance": 951,
            "closedAt": "2026-11-06T12:06:10+00:00",
        }
    )

    assert outcome.done is True
    assert outcome.closed_as == "closed"
    assert (outcome.value, outcome.fee, outcome.coins_change, outcome.balance) == (115, 2, 113, 951)
    assert outcome.closed_at == datetime(2026, 11, 6, 12, 6, 10, tzinfo=UTC)


def test_a_position_that_closed_at_zero_says_zeroed():
    outcome = read_close_reply(
        {
            "status": "done",
            "closedAs": "zeroed",
            "value": 0,
            "fee": 0,
            "coinsChange": 0,
            "balance": 838,
            "closedAt": "2026-11-06T12:06:10+00:00",
        }
    )

    assert (outcome.closed_as, outcome.coins_change) == ("zeroed", 0)


@pytest.mark.parametrize("reason", ["no_such_position", "wrong_price_mode"])
def test_a_close_refusal_without_details_is_understood(reason):
    outcome = read_close_reply({"status": "refused", "reason": reason})

    assert (outcome.done, outcome.reason) == (False, reason)


def test_a_refusal_because_the_position_is_closed_says_how_and_when():
    outcome = read_close_reply(
        {
            "status": "refused",
            "reason": "position_closed",
            "closedAs": "zeroed",
            "closedAt": "2026-11-06T10:02:31+00:00",
        }
    )

    assert outcome.reason == "position_closed"
    assert outcome.closed_as == "zeroed"
    assert outcome.closed_at == datetime(2026, 11, 6, 10, 2, 31, tzinfo=UTC)


@pytest.mark.parametrize(
    "reply",
    [
        None,
        [],
        {},
        {"status": "done"},
        {"status": "done", "closedAs": "closed", "value": "1"},
        {
            "status": "done",
            "closedAs": "sold",
            "value": 1,
            "fee": 0,
            "coinsChange": 1,
            "balance": 1,
            "closedAt": "2026-11-06T10:02:31+00:00",
        },
        {"status": "refused", "reason": "something_new"},
        {"status": "refused", "reason": "position_closed"},
        {"status": "refused", "reason": "position_closed", "closedAs": "sold", "closedAt": "x"},
    ],
)
def test_a_close_answer_that_is_not_understood_is_a_502(reply):
    with pytest.raises(SupabaseRejected):
        read_close_reply(reply)


# --- the answer of exchange_close_used_up ---


def test_a_sweep_answer_says_how_many_positions_closed_and_which():
    outcome = read_sweep_reply({"closed": 2, "positionIds": [POSITION, "other"]})

    assert outcome.closed == 2
    assert outcome.position_ids == (POSITION, "other")


@pytest.mark.parametrize(
    "reply", [None, [], {}, {"closed": "2"}, {"closed": 1, "positionIds": "x"}, {"closed": 1}]
)
def test_a_sweep_answer_that_is_not_understood_is_a_502(reply):
    with pytest.raises(SupabaseRejected):
        read_sweep_reply(reply)


# --- running the three functions ---


def test_the_three_functions_are_called_by_their_sql_names_with_the_arguments():
    replies = {
        "exchange_open_position": {
            "status": "done",
            "positionId": POSITION,
            "zeroPrice": 68543.289,
            "balance": 838,
            "openedAt": "2026-11-06T12:05:04+00:00",
        },
        "exchange_close_position": {
            "status": "done",
            "closedAs": "closed",
            "value": 115,
            "fee": 2,
            "coinsChange": 113,
            "balance": 951,
            "closedAt": "2026-11-06T12:06:10+00:00",
        },
        "exchange_close_used_up": {"closed": 0, "positionIds": []},
    }

    def reply(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=replies[request.url.path.rsplit("/", 1)[1]])

    admin, seen = make_admin(reply)
    closing = Closing(115, 2, 113, False)

    run(run_open(admin, open_args()))
    run(run_close(admin, close_arguments(PLAYER, POSITION, "live", D("1"), closing, 200, "r")))
    run(run_sweep(admin, sweep_arguments([], None)))

    assert [request.url.path for request in seen] == [
        "/rest/v1/rpc/exchange_open_position",
        "/rest/v1/rpc/exchange_close_position",
        "/rest/v1/rpc/exchange_close_used_up",
    ]
    assert all(request.method == "POST" for request in seen)


# --- an answer that cannot be read after the database has finished ---


def run_with_reply(call, reply):
    """Run one of the three functions against a database that answers HTTP 200 with `reply`."""
    admin, _ = make_admin(lambda request: httpx.Response(200, json=reply))
    return run(call(admin))


def close_args() -> dict:
    return close_arguments(PLAYER, POSITION, "live", D("1"), Closing(115, 2, 113, False), 200, "r")


@pytest.mark.parametrize("reply", [None, [], "done", {}, {"status": "done"}, {"status": "maybe"}])
def test_an_opening_answer_that_is_not_a_refusal_and_cannot_be_read_is_an_unknown_outcome(reply):
    # The database answered, so its transaction has finished. The coins may have moved.
    with pytest.raises(SupabaseUnavailable):
        run_with_reply(lambda admin: run_open(admin, open_args()), reply)


@pytest.mark.parametrize("reply", [None, [], "done", {}, {"status": "done"}, {"status": "maybe"}])
def test_a_closing_answer_that_is_not_a_refusal_and_cannot_be_read_is_an_unknown_outcome(reply):
    with pytest.raises(SupabaseUnavailable):
        run_with_reply(lambda admin: run_close(admin, close_args()), reply)


@pytest.mark.parametrize(
    "reply",
    [{"status": "refused"}, {"status": "refused", "reason": "something_new"}],
)
def test_a_refusal_that_cannot_be_read_changed_nothing_so_it_stays_a_rejection(reply):
    with pytest.raises(SupabaseRejected):
        run_with_reply(lambda admin: run_open(admin, open_args()), reply)
    with pytest.raises(SupabaseRejected):
        run_with_reply(lambda admin: run_close(admin, close_args()), reply)


def test_an_unknown_outcome_is_not_a_rejection():
    with pytest.raises(SupabaseUnavailable) as stopped:
        run_with_reply(lambda admin: run_open(admin, open_args()), {"status": "maybe"})

    assert not isinstance(stopped.value, SupabaseRejected)


def test_a_sweep_answer_that_cannot_be_read_is_a_rejection_because_no_coins_move():
    with pytest.raises(SupabaseRejected):
        run_with_reply(lambda admin: run_sweep(admin, sweep_arguments([], None)), {"closed": "x"})
