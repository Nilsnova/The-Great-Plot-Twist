"""Tests for predictions/store.py: reading the pools and stakes, and running the two functions.

The database is a fake (an httpx.MockTransport), so no test touches Supabase. The tests check the
exact shape of every request the store sends, how it reads each reply, and that an odd reply
becomes a 502 and not a crash.
"""

import asyncio
import json
from datetime import UTC, datetime

import httpx
import pytest

from server.predictions import store
from server.predictions.pools import Payout, Stake
from server.predictions.store import (
    MAX_STAKES_IN_POOL,
    MAX_STAKES_OF_PLAYER,
    PoolRow,
    SettleOutcome,
    StakeOutcome,
    StakeRow,
)
from server.supabase_admin import AlreadyApplied, InsufficientFunds, SupabaseRejected
from server.tests.helpers import make_admin

PLAYER = "11111111-2222-4333-8444-555555555555"
NOON = datetime(2026, 11, 20, 12, 0, tzinfo=UTC)
DAY_START = datetime(2026, 11, 20, 0, 0, tzinfo=UTC)
CLOSES = datetime(2026, 12, 1, 0, 0, tzinfo=UTC)


def run(coroutine):
    return asyncio.run(coroutine)


def answer(rows):
    """A fake database that answers every request with these rows (or this JSON value)."""
    return make_admin(lambda request: httpx.Response(200, json=rows))


def query_of(request: httpx.Request) -> dict[str, str]:
    return dict(request.url.params)


# --- the arguments of the two functions ---


def test_the_stake_function_gets_exactly_the_parameters_it_declares():
    arguments = store.place_stake_arguments(
        PLAYER, "groundhog-2027", "yes", 20, "stake-0001-ab", CLOSES, DAY_START
    )

    assert list(arguments) == [
        "p_player_id",
        "p_question_id",
        "p_side",
        "p_amount",
        "p_stake_id",
        "p_closes_at",
        "p_max_stake",
        "p_daily_cap",
        "p_day_start",
    ]


def test_the_stake_arguments_carry_the_limits_from_stake_rules_and_the_start_of_the_day():
    arguments = store.place_stake_arguments(
        PLAYER, "groundhog-2027", "no", 20, "stake-0001-ab", CLOSES, DAY_START
    )

    assert arguments["p_max_stake"] == 50
    assert arguments["p_daily_cap"] == 200
    assert arguments["p_day_start"] == "2026-11-20T00:00:00+00:00"
    assert arguments["p_closes_at"] == "2026-12-01T00:00:00+00:00"
    assert arguments["p_player_id"] == PLAYER
    assert arguments["p_amount"] == 20
    assert arguments["p_side"] == "no"


def test_the_settle_function_gets_exactly_the_parameters_it_declares():
    arguments = store.settle_arguments("groundhog-2027", "yes", CLOSES, [], "host")

    assert list(arguments) == [
        "p_question_id",
        "p_outcome",
        "p_closes_at",
        "p_cut_percent",
        "p_payouts",
        "p_settled_by",
    ]


def test_the_settle_arguments_carry_the_cut_and_the_payouts_in_the_agreed_shape():
    payouts = [
        Payout(row_id=12, player_id="p", coins=34),
        Payout(row_id=15, player_id="q", coins=1),
    ]

    arguments = store.settle_arguments("groundhog-2027", "no", CLOSES, payouts, "host")

    assert arguments["p_cut_percent"] == 5
    assert arguments["p_payouts"] == [
        {"stakeRowId": 12, "coins": 34},
        {"stakeRowId": 15, "coins": 1},
    ]
    assert arguments["p_settled_by"] == "host"
    assert arguments["p_closes_at"] == "2026-12-01T00:00:00+00:00"


# --- running the stake function ---


DONE_STAKE = {
    "status": "done",
    "balance": 980,
    "stakedToday": 20,
    "sides": [
        {"side": "no", "coins": 60, "players": 2},
        {"side": "yes", "coins": 20, "players": 1},
    ],
}


def test_a_finished_stake_is_read_with_the_balance_and_the_sides():
    admin, seen = answer(DONE_STAKE)

    outcome = run(store.run_place_stake(admin, {"p_player_id": PLAYER}))

    assert outcome.done is True
    assert (outcome.balance, outcome.staked_today) == (980, 20)
    assert outcome.sides["yes"].coins == 20 and outcome.sides["yes"].players == 1
    assert outcome.sides["no"].coins == 60 and outcome.sides["no"].players == 2
    assert str(seen[0].url).endswith("/rest/v1/rpc/prediction_place_stake")
    assert json.loads(seen[0].content) == {"p_player_id": PLAYER}


def test_a_stake_into_an_empty_pool_has_no_other_side():
    admin, _ = answer({**DONE_STAKE, "sides": [{"side": "yes", "coins": 20, "players": 1}]})

    outcome = run(store.run_place_stake(admin, {}))

    assert list(outcome.sides) == ["yes"]


def test_a_closed_pool_is_a_refusal_with_its_reason():
    admin, _ = answer({"status": "refused", "reason": "pool_closed"})

    outcome = run(store.run_place_stake(admin, {}))

    assert outcome == StakeOutcome(done=False, reason="pool_closed")


def test_an_earlier_stake_is_a_refusal_with_its_side_and_amount():
    admin, _ = answer(
        {"status": "refused", "reason": "already_staked", "side": "yes", "amount": 20}
    )

    outcome = run(store.run_place_stake(admin, {}))

    assert (outcome.done, outcome.reason, outcome.side, outcome.amount) == (
        False,
        "already_staked",
        "yes",
        20,
    )


def test_the_daily_cap_is_a_refusal_with_the_coins_left():
    admin, _ = answer({"status": "refused", "reason": "daily_cap", "coinsLeft": 30})

    outcome = run(store.run_place_stake(admin, {}))

    assert (outcome.done, outcome.reason, outcome.coins_left) == (False, "daily_cap", 30)


@pytest.mark.parametrize(
    "reply",
    [
        None,
        [],
        "done",
        42,
        {},
        {"status": "weird"},
        {"status": "refused"},
        {"status": "refused", "reason": 7},
        {"status": "done", "balance": "980", "stakedToday": 20, "sides": []},
        {"status": "done", "balance": 980, "stakedToday": True, "sides": []},
        {"status": "done", "balance": 980, "stakedToday": 20, "sides": "yes"},
        {"status": "done", "balance": 980, "stakedToday": 20, "sides": [5]},
        {"status": "done", "balance": 980, "stakedToday": 20, "sides": [{"side": "yes"}]},
        {"status": "done", "balance": 12.5, "stakedToday": 20, "sides": []},
    ],
)
def test_a_stake_reply_that_cannot_be_read_is_a_502(reply):
    admin, _ = answer(reply)

    with pytest.raises(SupabaseRejected) as problem:
        run(store.run_place_stake(admin, {}))

    assert problem.value.status_code == 502


def test_a_repeated_stake_id_is_already_applied():
    error = {"code": "23505", "message": "already_applied", "details": None, "hint": None}
    admin, _ = make_admin(lambda request: httpx.Response(409, json=error))

    with pytest.raises(AlreadyApplied):
        run(store.run_place_stake(admin, {}))


def test_not_enough_coins_is_insufficient_funds():
    error = {"code": "P0001", "message": "insufficient_funds", "details": None, "hint": None}
    admin, _ = make_admin(lambda request: httpx.Response(400, json=error))

    with pytest.raises(InsufficientFunds):
        run(store.run_place_stake(admin, {}))


@pytest.mark.parametrize("message", ["bad_stake", "wallet_not_found"])
def test_a_bug_error_of_the_function_is_a_502_database_error(message):
    error = {"code": "P0001", "message": message, "details": None, "hint": None}
    admin, _ = make_admin(lambda request: httpx.Response(400, json=error))

    with pytest.raises(SupabaseRejected) as problem:
        run(store.run_place_stake(admin, {}))

    assert (problem.value.status_code, problem.value.code) == (502, "database_error")


# --- running the settle function ---


def test_a_finished_settlement_is_read_with_its_receipt():
    admin, seen = answer(
        {
            "status": "done",
            "settlement": "winners",
            "paidPlayers": 2,
            "paidCoins": 98,
            "cutCoins": 2,
            "settledAt": "2026-12-01T10:00:00.123456+00:00",
        }
    )

    outcome = run(store.run_settle(admin, {"p_question_id": "groundhog-2027"}))

    assert outcome == SettleOutcome(
        done=True,
        settlement="winners",
        paid_players=2,
        paid_coins=98,
        cut_coins=2,
        settled_at=datetime(2026, 12, 1, 10, 0, 0, 123456, tzinfo=UTC),
    )
    assert str(seen[0].url).endswith("/rest/v1/rpc/prediction_settle_pool")


def test_a_pool_that_is_still_open_is_a_refusal_with_the_closing_time():
    admin, _ = answer(
        {"status": "refused", "reason": "pool_open", "closesAt": "2026-12-01T00:00:00+00:00"}
    )

    outcome = run(store.run_settle(admin, {}))

    assert (outcome.done, outcome.reason, outcome.closes_at) == (False, "pool_open", CLOSES)


def test_stakes_that_changed_are_a_refusal_with_that_reason():
    admin, _ = answer({"status": "refused", "reason": "stakes_changed"})

    outcome = run(store.run_settle(admin, {}))

    assert (outcome.done, outcome.reason) == (False, "stakes_changed")


@pytest.mark.parametrize(
    "reply",
    [
        None,
        [],
        {"status": "done"},
        {
            "status": "done",
            "settlement": "winners",
            "paidPlayers": "2",
            "paidCoins": 1,
            "cutCoins": 0,
            "settledAt": "2026-12-01T10:00:00+00:00",
        },
        {
            "status": "done",
            "settlement": "winners",
            "paidPlayers": 2,
            "paidCoins": 1,
            "cutCoins": 0,
            "settledAt": "yesterday",
        },
        {
            "status": "done",
            "settlement": "winners",
            "paidPlayers": 2,
            "paidCoins": 1,
            "cutCoins": 0,
            "settledAt": "2026-12-01T10:00:00",
        },
        {
            "status": "done",
            "settlement": 5,
            "paidPlayers": 2,
            "paidCoins": 1,
            "cutCoins": 0,
            "settledAt": "2026-12-01T10:00:00+00:00",
        },
        {"status": "refused", "reason": "pool_open", "closesAt": "soon"},
        {"status": "refused"},
        {"status": "maybe"},
    ],
)
def test_a_settle_reply_that_cannot_be_read_is_a_502(reply):
    admin, _ = answer(reply)

    with pytest.raises(SupabaseRejected):
        run(store.run_settle(admin, {}))


def test_a_pool_that_was_settled_already_is_already_applied():
    error = {"code": "23505", "message": "already_applied", "details": None, "hint": None}
    admin, _ = make_admin(lambda request: httpx.Response(409, json=error))

    with pytest.raises(AlreadyApplied):
        run(store.run_settle(admin, {}))


# --- reading pools ---

POOL_ROW = {
    "question_id": "groundhog-2027",
    "closes_at": "2026-12-01T00:00:00+00:00",
    "status": "settled",
    "outcome": "yes",
    "settlement": "winners",
    "settled_by": "host",
    "settled_at": "2026-12-01T10:00:00.5+00:00",
    "cut_coins": 2,
    "paid_coins": 98,
}
OPEN_POOL_ROW = {
    "question_id": "warmest-year-2026",
    "closes_at": "2026-12-01T00:00:00+00:00",
    "status": "open",
    "outcome": None,
    "settlement": None,
    "settled_by": None,
    "settled_at": None,
    "cut_coins": None,
    "paid_coins": None,
}


def test_pools_are_read_with_one_query_that_lists_the_checked_ids():
    admin, seen = answer([POOL_ROW])

    pools = run(store.read_pools(admin, ["groundhog-2027", "warmest-year-2026"]))

    assert len(seen) == 1
    assert seen[0].url.path.endswith("/rest/v1/prediction_pools")
    query = query_of(seen[0])
    assert query["question_id"] == "in.(groundhog-2027,warmest-year-2026)"
    assert query["limit"] == str(store.MAX_POOLS_READ)
    assert query["select"] == store.POOL_COLUMNS
    assert list(pools) == ["groundhog-2027"]


def test_a_settled_pool_row_is_read_in_full():
    admin, _ = answer([POOL_ROW])

    pool = run(store.read_pools(admin, ["groundhog-2027"]))["groundhog-2027"]

    assert pool == PoolRow(
        question_id="groundhog-2027",
        closes_at=CLOSES,
        status="settled",
        outcome="yes",
        settlement="winners",
        settled_by="host",
        settled_at=datetime(2026, 12, 1, 10, 0, 0, 500000, tzinfo=UTC),
        cut_coins=2,
        paid_coins=98,
    )


def test_an_open_pool_row_has_nothing_filled_in():
    admin, _ = answer([OPEN_POOL_ROW])

    pool = run(store.read_pools(admin, ["warmest-year-2026"]))["warmest-year-2026"]

    assert pool.status == "open"
    assert (pool.outcome, pool.settlement, pool.settled_at, pool.cut_coins) == (
        None,
        None,
        None,
        None,
    )


def test_reading_no_pools_asks_the_database_nothing():
    admin, seen = answer([])

    assert run(store.read_pools(admin, [])) == {}
    assert seen == []


@pytest.mark.parametrize("bad_id", ["a,b", "a)", "Q", "x" * 41, "", "a b", "a;drop", "a.b"])
def test_an_id_that_could_break_the_query_is_refused_before_any_request(bad_id):
    admin, seen = answer([])

    with pytest.raises(ValueError, match="question id"):
        run(store.read_pools(admin, ["groundhog-2027", bad_id]))

    assert seen == []


def test_one_pool_is_read_with_an_exact_match_and_a_limit_of_one():
    admin, seen = answer([POOL_ROW])

    pool = run(store.read_pool(admin, "groundhog-2027"))

    query = query_of(seen[0])
    assert query["question_id"] == "eq.groundhog-2027"
    assert query["limit"] == "1"
    assert pool.status == "settled"


def test_a_question_without_a_pool_row_gives_none():
    admin, _ = answer([])

    assert run(store.read_pool(admin, "groundhog-2027")) is None


@pytest.mark.parametrize(
    "row",
    [
        {**POOL_ROW, "closes_at": "tomorrow"},
        {**POOL_ROW, "closes_at": "2026-12-01T00:00:00"},
        {**POOL_ROW, "status": 3},
        {**POOL_ROW, "cut_coins": "2"},
        {**POOL_ROW, "settled_at": 5},
        {k: v for k, v in POOL_ROW.items() if k != "status"},
    ],
)
def test_a_pool_row_that_cannot_be_read_is_a_502(row):
    admin, _ = answer([row])

    with pytest.raises(SupabaseRejected):
        run(store.read_pools(admin, ["groundhog-2027"]))


# --- reading the sides ---


def test_the_sides_come_from_the_view_with_one_query():
    rows = [
        {"question_id": "groundhog-2027", "side": "yes", "players": 4, "coins": 120},
        {"question_id": "groundhog-2027", "side": "no", "players": 3, "coins": 80},
        {"question_id": "warmest-year-2026", "side": "yes", "players": 1, "coins": 5},
    ]
    admin, seen = answer(rows)

    sides = run(store.read_side_totals(admin, ["groundhog-2027", "warmest-year-2026"]))

    assert seen[0].url.path.endswith("/rest/v1/prediction_pool_sides")
    query = query_of(seen[0])
    assert query["question_id"] == "in.(groundhog-2027,warmest-year-2026)"
    assert query["limit"] == str(store.MAX_SIDE_ROWS_READ)
    assert sides["groundhog-2027"]["yes"].coins == 120
    assert sides["groundhog-2027"]["no"].players == 3
    assert list(sides["warmest-year-2026"]) == ["yes"]


def test_a_question_nobody_staked_on_has_no_sides():
    admin, _ = answer([])

    assert run(store.read_side_totals(admin, ["groundhog-2027"])) == {}


def test_a_side_row_that_cannot_be_read_is_a_502():
    admin, _ = answer(
        [{"question_id": "groundhog-2027", "side": "yes", "players": "4", "coins": 1}]
    )

    with pytest.raises(SupabaseRejected):
        run(store.read_side_totals(admin, ["groundhog-2027"]))


# --- reading stakes ---


def test_the_stakes_of_a_pool_are_read_oldest_first_with_a_limit():
    rows = [
        {"id": 3, "player_id": "p-1", "side": "yes", "amount": 30},
        {"id": 9, "player_id": "p-2", "side": "no", "amount": 20},
    ]
    admin, seen = answer(rows)

    stakes = run(store.read_pool_stakes(admin, "groundhog-2027"))

    query = query_of(seen[0])
    assert seen[0].url.path.endswith("/rest/v1/prediction_stakes")
    assert query["question_id"] == "eq.groundhog-2027"
    assert query["order"] == "id.asc"
    assert query["limit"] == str(MAX_STAKES_IN_POOL) == "10000"
    assert stakes == [Stake(3, "p-1", "yes", 30), Stake(9, "p-2", "no", 20)]


def test_a_stake_row_that_cannot_be_read_is_a_502():
    admin, _ = answer([{"id": 3, "player_id": "p-1", "side": "yes", "amount": 0}])

    with pytest.raises(SupabaseRejected):
        run(store.read_pool_stakes(admin, "groundhog-2027"))


def test_the_stakes_of_a_player_are_read_newest_first_and_at_most_50():
    rows = [
        {
            "id": 9,
            "question_id": "groundhog-2027",
            "side": "yes",
            "amount": 20,
            "payout": None,
            "created_at": "2026-11-20T10:00:00+00:00",
        },
        {
            "id": 3,
            "question_id": "warmest-year-2026",
            "side": "no",
            "amount": 5,
            "payout": 0,
            "created_at": "2026-11-19T10:00:00+00:00",
        },
    ]
    admin, seen = answer(rows)

    stakes = run(store.read_player_stakes(admin, PLAYER))

    query = query_of(seen[0])
    assert query["player_id"] == f"eq.{PLAYER}"
    assert query["order"] == "id.desc"
    assert query["limit"] == str(MAX_STAKES_OF_PLAYER) == "50"
    assert stakes[0] == StakeRow(
        id=9,
        question_id="groundhog-2027",
        side="yes",
        amount=20,
        payout=None,
        created_at=datetime(2026, 11, 20, 10, 0, tzinfo=UTC),
    )
    assert stakes[1].payout == 0


def test_the_coins_staked_today_are_added_up_from_the_start_of_the_day():
    admin, seen = answer([{"amount": 50}, {"amount": 20}])

    staked = run(store.read_staked_today(admin, PLAYER, NOON))

    query = query_of(seen[0])
    assert staked == 70
    assert query["player_id"] == f"eq.{PLAYER}"
    assert query["created_at"] == "gte.2026-11-20T12:00:00+00:00"
    assert query["select"] == "amount"
    assert query["limit"] == str(store.MAX_STAKES_FOR_DAY)


def test_no_stakes_today_is_zero_coins():
    admin, _ = answer([])

    assert run(store.read_staked_today(admin, PLAYER, NOON)) == 0


def test_a_stake_id_that_was_used_before_is_found():
    admin, seen = answer([{"id": 4}])

    assert run(store.stake_exists(admin, PLAYER, "stake-0001-ab")) is True
    query = query_of(seen[0])
    assert query["player_id"] == f"eq.{PLAYER}"
    assert query["stake_id"] == "eq.stake-0001-ab"
    assert query["limit"] == "1"


def test_a_new_stake_id_is_not_found():
    admin, _ = answer([])

    assert run(store.stake_exists(admin, PLAYER, "stake-0001-ab")) is False


@pytest.mark.parametrize("bad_id", ["a,b", "x y", "stake&other=1", "", "a" * 65, "stake.0001"])
def test_a_stake_id_that_could_break_the_query_is_refused_before_any_request(bad_id):
    admin, seen = answer([])

    with pytest.raises(ValueError, match="stake id"):
        run(store.stake_exists(admin, PLAYER, bad_id))

    assert seen == []


def test_the_balance_is_read_from_the_wallet():
    admin, seen = answer([{"balance": 940}])

    assert run(store.read_balance(admin, PLAYER)) == 940
    query = query_of(seen[0])
    assert seen[0].url.path.endswith("/rest/v1/wallets")
    assert query["player_id"] == f"eq.{PLAYER}"
    assert query["limit"] == "1"


def test_a_player_without_a_wallet_is_a_502():
    admin, _ = answer([])

    with pytest.raises(SupabaseRejected, match="no wallet"):
        run(store.read_balance(admin, PLAYER))


def test_every_list_the_store_reads_has_a_limit():
    # The rule of ENGINEERING section 7: no route returns a whole table.
    admin, seen = answer([])
    run(store.read_pools(admin, ["groundhog-2027"]))
    run(store.read_pool(admin, "groundhog-2027"))
    run(store.read_side_totals(admin, ["groundhog-2027"]))
    run(store.read_pool_stakes(admin, "groundhog-2027"))
    run(store.read_player_stakes(admin, PLAYER))
    run(store.read_staked_today(admin, PLAYER, NOON))
    run(store.stake_exists(admin, PLAYER, "stake-0001-ab"))

    assert all("limit" in query_of(request) for request in seen)
    assert len(seen) == 7
