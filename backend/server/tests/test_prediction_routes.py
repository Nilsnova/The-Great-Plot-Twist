"""Tests for routes/predictions.py and predictions/desk.py: the four prediction desk URLs.

Nothing here uses the network. Manifold is a FakeManifold, the database is a FakeDatabase (an
httpx.MockTransport that behaves like the tables, the view and the two functions of the
migration), the sign-in check answers from a fake transport, and the clock is a FakeClock that
only moves when the test says so. All of them are in prediction_helpers.py.

Fixed numbers used again and again:
  * the clock starts at Thursday 5 Nov 2026, 12:00 UTC,
  * the five questions of the real file are marked as read, and they close from 1 Dec 2026 on,
  * every player has 1000 coins, and groundhog-2027 is the question the tests stake on,
  * case A of the pool rules: yes 30 and yes 20 against no 50 pays 59 and 39, and 2 coins leave.
"""

import asyncio
import json
import logging
from datetime import timedelta

import httpx
import pytest
from fastapi.testclient import TestClient

from server.app import create_app
from server.predictions import desk as desk_module
from server.predictions.desk import SettleOrder, StakeOrder, desk_from_settings
from server.predictions.pools import Stake, plan_settlement
from server.predictions.questions import QuestionsError
from server.settings import Settings
from server.supabase_admin import AlreadyApplied
from server.tests.helpers import CONFIGURED_SETTINGS, assert_error
from server.tests.prediction_helpers import (
    AUTH_1,
    AUTH_2,
    AUTH_3,
    AUTH_HOST,
    HOST_ID,
    PLAYER_1,
    PLAYER_2,
    PLAYER_3,
    DeskWorld,
    milliseconds,
)

GROUNDHOG = "groundhog-2027"
GROUNDHOG_MARKET = "pRq8uqsEus"
QUESTION_IDS = [
    "groundhog-2027",
    "warmest-year-2026",
    "avengers-opening-record",
    "ophelia-two-billion",
    "ai-song-top-20",
]


def case_a(world: DeskWorld) -> None:
    """Yes 30 (player 1) and yes 20 (player 2) against no 50 (player 3) on groundhog-2027."""
    assert (
        world.stake(AUTH_1, side="yes", amount=30, stakeId="stake-p1-groundhog").status_code == 200
    )
    assert (
        world.stake(AUTH_2, side="yes", amount=20, stakeId="stake-p2-groundhog").status_code == 200
    )
    assert (
        world.stake(AUTH_3, side="no", amount=50, stakeId="stake-p3-groundhog").status_code == 200
    )


def decide_on_manifold(world: DeskWorld, resolution: str) -> None:
    """Manifold resolved the groundhog market an hour ago. The desk sees it when the cache ends."""
    when = milliseconds(world.clock.now - timedelta(hours=1))
    world.manifold.resolve(GROUNDHOG_MARKET, resolution, at_ms=when)
    world.clock.advance(121)


# --- the flag is off ---


def test_while_the_flag_is_off_the_list_answers_404_feature_off():
    response = DeskWorld(flag_on=False).listing()

    assert_error(response, 404, "feature_off")
    assert response.json()["error"]["message"] == "The prediction desk is closed for now."


def test_while_the_flag_is_off_my_stakes_answer_404_feature_off():
    assert_error(DeskWorld(flag_on=False).mine(), 404, "feature_off")


def test_while_the_flag_is_off_a_stake_answers_404_feature_off_and_changes_nothing():
    world = DeskWorld(flag_on=False)

    response = world.stake()

    assert_error(response, 404, "feature_off")
    assert world.database.stakes == []
    assert world.database.requests == []


def test_while_the_flag_is_off_a_settlement_answers_404_feature_off():
    world = DeskWorld(flag_on=False)

    assert_error(world.settle(), 404, "feature_off")
    assert world.database.requests == []


def test_while_the_flag_is_off_the_sign_in_check_still_comes_first():
    world = DeskWorld(flag_on=False)

    assert_error(world.client.get("/api/predictions/mine"), 401, "unauthorized")
    assert_error(world.settle(AUTH_1), 403, "forbidden")


def test_the_flag_is_off_by_default():
    assert Settings().flags["predictions"] is False


# --- GET /api/predictions ---


def test_the_list_works_without_signing_in():
    assert DeskWorld().listing().status_code == 200


def test_the_list_shows_the_five_questions_in_the_order_of_the_file():
    body = DeskWorld().listing().json()

    assert [question["id"] for question in body["questions"]] == QUESTION_IDS


def test_a_question_carries_the_agreed_fields():
    question = DeskWorld().question()

    assert list(question) == [
        "id",
        "text",
        "topic",
        "decidedBy",
        "closesAt",
        "status",
        "canStake",
        "outcome",
        "settlement",
        "settledAt",
        "manifold",
        "sides",
        "totalCoins",
        "source",
        "fetchedAt",
    ]
    assert question["text"].startswith("Will Punxsutawney Phil")
    assert question["topic"] == "weather"
    assert question["decidedBy"].endswith("as resolved on Manifold.")
    assert question["closesAt"] == "2027-02-01T23:00:00Z"


def test_a_fresh_question_is_open_and_can_be_staked_on():
    question = DeskWorld().question()

    assert (question["status"], question["canStake"]) == ("open", True)
    assert (question["outcome"], question["settlement"], question["settledAt"]) == (
        None,
        None,
        None,
    )


def test_a_fresh_question_has_two_empty_sides_and_no_payout_to_promise():
    question = DeskWorld().question()

    assert question["sides"] == [
        {"side": "yes", "label": "Yes", "coins": 0, "players": 0, "payoutPerCoin": None},
        {"side": "no", "label": "No", "coins": 0, "players": 0, "payoutPerCoin": None},
    ]
    assert question["totalCoins"] == 0


def test_the_list_says_where_the_reading_of_manifold_comes_from_and_when():
    question = DeskWorld().question()

    assert question["source"] == "live"
    assert question["fetchedAt"] == "2026-11-05T12:00:00Z"
    assert question["manifold"] == {"state": "open", "decidedAs": None, "decidedAt": None}


def test_the_list_carries_the_rules_the_screen_shows():
    assert DeskWorld().listing().json()["rules"] == {
        "minStake": 1,
        "maxStake": 50,
        "dailyCap": 200,
        "cutPercent": 5,
        "cutOf": "losing side",
        "dayStarts": "00:00 Europe/Lisbon",
    }


def test_the_list_carries_the_credit_and_the_play_money_line():
    body = DeskWorld().listing().json()

    assert body["attribution"] == (
        "Questions and results: Manifold Markets (manifold.markets), a play-money forecasting site."
    )
    assert body["playMoney"] == (
        "Forecasting with play coins. Play money: no cash value. It cannot be bought or cashed out."
    )


def test_the_list_never_contains_the_probability_or_the_pool_of_manifold():
    text = DeskWorld().listing().text.lower()

    assert "probability" not in text
    assert "0.77" not in text  # the made-up probability in the fake answers of Manifold
    assert "volume" not in text
    assert "1234.5" not in text
    assert "someone" not in text  # the made-up creator of the fake answers of Manifold
    assert "http" not in text  # nothing links to Manifold or to a betting site


def test_the_list_can_be_cached_for_10_seconds():
    response = DeskWorld().listing()

    assert response.headers["cache-control"] == "public, max-age=10, s-maxage=10"


def test_the_list_takes_no_query_parameters_so_nobody_can_skip_the_cache():
    world = DeskWorld()

    response = world.listing("?now=1")

    assert_error(response, 422, "validation_error")
    assert world.manifold.calls == 0
    assert world.database.requests == []


def test_a_failed_list_is_not_cached():
    world = DeskWorld()
    world.database.unavailable = True

    response = world.listing()

    assert_error(response, 503, "database_unavailable")
    assert response.headers["cache-control"] == "no-store"


def test_a_question_that_a_person_has_not_read_is_hidden():
    world = DeskWorld()
    world.change_question("groundhog-2027", reviewed_on="pending")

    ids = [question["id"] for question in world.listing().json()["questions"]]

    assert ids == QUESTION_IDS[1:]


def test_with_no_question_read_yet_the_list_is_empty_but_still_has_the_rules_and_the_credit():
    world = DeskWorld()
    for question_id in QUESTION_IDS:
        world.change_question(question_id, reviewed_by="pending")

    body = world.listing().json()

    assert body["questions"] == []
    assert body["rules"]["maxStake"] == 50
    assert body["playMoney"]


def test_the_real_file_as_it_is_checked_in_lists_only_what_a_person_has_read():
    desk = desk_from_settings(CONFIGURED_SETTINGS)

    served = [question.id for question in desk.questions if question.is_reviewed]
    assert set(served) <= set(QUESTION_IDS)


def test_the_sides_show_coins_captains_and_what_one_coin_brings_back():
    world = DeskWorld()
    world.stake(AUTH_1, side="yes", amount=30, stakeId="stake-p1-groundhog")
    world.stake(AUTH_2, side="no", amount=50, stakeId="stake-p2-groundhog")

    question = world.question()

    assert question["sides"] == [
        # yes wins: 50 coins lose, the cut is 2, 78 coins go to 30 coins: 2.6
        {"side": "yes", "label": "Yes", "coins": 30, "players": 1, "payoutPerCoin": 2.6},
        # no wins: 30 coins lose, the cut is 1, 79 coins go to 50 coins: 1.58
        {"side": "no", "label": "No", "coins": 50, "players": 1, "payoutPerCoin": 1.58},
    ]
    assert question["totalCoins"] == 80


def test_a_side_nobody_picked_has_no_payout_to_promise_and_the_other_pays_one_for_one():
    world = DeskWorld()
    world.stake(AUTH_1, side="yes", amount=30, stakeId="stake-p1-groundhog")

    sides = world.question()["sides"]

    assert sides[0]["payoutPerCoin"] == 1.0
    assert sides[1]["payoutPerCoin"] is None


def test_when_manifold_cannot_be_reached_the_recording_is_shown_but_nobody_can_stake():
    world = DeskWorld()
    world.manifold.status = 500

    question = world.question()

    assert question["source"] == "fallback"
    assert question["fetchedAt"] == "2026-11-05T22:46:22Z"
    assert question["manifold"]["state"] == "unknown"
    assert (question["status"], question["canStake"]) == ("open", False)


def test_in_demo_mode_the_recording_lets_captains_stake_and_manifold_is_never_called():
    world = DeskWorld(demo_mode=True)

    question = world.question()

    assert question["source"] == "fallback"
    assert (question["manifold"]["state"], question["canStake"]) == ("open", True)
    assert world.manifold.calls == 0


def test_a_question_whose_closing_time_has_passed_is_closed():
    world = DeskWorld()
    world.close_question(GROUNDHOG)

    question = world.question()

    assert (question["status"], question["canStake"]) == ("closed", False)


def test_a_question_that_manifold_decided_is_closed_and_says_how():
    world = DeskWorld()
    decide_on_manifold(world, "NO")

    question = world.question()

    assert (question["status"], question["canStake"]) == ("closed", False)
    assert question["manifold"]["state"] == "decided"
    assert question["manifold"]["decidedAs"] == "no"
    assert question["manifold"]["decidedAt"] == "2026-11-05T11:00:00Z"


def test_a_question_that_manifold_closed_is_closed_for_us_too():
    world = DeskWorld()
    world.manifold.change(
        GROUNDHOG_MARKET, closeTime=milliseconds(world.clock.now - timedelta(minutes=5))
    )

    question = world.question()

    assert (question["status"], question["canStake"]) == ("closed", False)
    assert question["manifold"]["state"] == "closed"


def test_a_settled_question_shows_how_it_ended():
    world = DeskWorld()
    case_a(world)
    world.close_question(GROUNDHOG)
    assert world.settle(outcome="yes").status_code == 200

    question = world.question()

    assert question["status"] == "settled"
    assert question["canStake"] is False
    assert question["outcome"] == "yes"
    assert question["settlement"] == "winners"
    assert question["settledAt"] == "2026-11-05T12:00:00Z"


def test_the_list_asks_the_database_with_two_reads_not_one_per_question():
    world = DeskWorld()

    world.listing()

    paths = [request.url.path.rsplit("/", 1)[-1] for request in world.database.requests]
    assert sorted(paths) == ["prediction_pool_sides", "prediction_pools"]


def test_the_list_asks_manifold_once_per_question_and_then_uses_the_cache():
    world = DeskWorld()

    world.listing()
    world.listing()

    assert world.manifold.calls == 5


def test_a_broken_questions_file_makes_the_desk_routes_answer_503_but_the_api_keeps_working():
    world = DeskWorld()
    world.app.state.predictions = None

    assert_error(world.listing(), 503, "predictions_unavailable")
    assert_error(world.mine(), 503, "predictions_unavailable")
    assert_error(world.stake(), 503, "predictions_unavailable")
    assert_error(world.settle(), 503, "predictions_unavailable")
    assert world.client.get("/api/health").status_code == 200


def test_a_broken_questions_file_with_the_flag_off_still_says_the_desk_is_closed():
    world = DeskWorld(flag_on=False)
    world.app.state.predictions = None

    assert_error(world.listing(), 404, "feature_off")


# --- GET /api/predictions/mine ---


def test_my_stakes_need_a_sign_in():
    assert_error(DeskWorld().client.get("/api/predictions/mine"), 401, "unauthorized")


def test_my_stakes_start_empty_with_my_coins_and_what_is_left_to_stake():
    body = DeskWorld().mine().json()

    assert body == {
        "coins": 1000,
        "stakedToday": 0,
        "leftToday": 200,
        "dailyCap": 200,
        "host": False,
        "stakes": [],
    }


def test_my_stakes_are_never_cached():
    assert DeskWorld().mine().headers["cache-control"] == "private, no-store"


def test_a_stake_shows_in_my_stakes_with_everything_the_screen_needs():
    world = DeskWorld()
    world.stake(AUTH_1, side="yes", amount=20)

    body = world.mine().json()

    assert (body["coins"], body["stakedToday"], body["leftToday"]) == (980, 20, 180)
    assert body["stakes"] == [
        {
            "questionId": GROUNDHOG,
            "text": world.question()["text"],
            "side": "yes",
            "amount": 20,
            "placedAt": "2026-11-05T12:00:00Z",
            "status": "open",
            "result": None,
            "payout": None,
            "settlement": None,
            "outcome": None,
            "settledAt": None,
        }
    ]


def test_my_stakes_list_only_my_own_stakes():
    world = DeskWorld()
    world.stake(AUTH_1, side="yes", amount=20, stakeId="stake-p1-groundhog")
    world.stake(AUTH_2, side="no", amount=30, stakeId="stake-p2-groundhog")

    mine = world.mine(AUTH_1).json()["stakes"]
    theirs = world.mine(AUTH_2).json()["stakes"]

    assert [(stake["side"], stake["amount"]) for stake in mine] == [("yes", 20)]
    assert [(stake["side"], stake["amount"]) for stake in theirs] == [("no", 30)]


def test_my_newest_stake_comes_first_and_at_most_50_are_asked_for():
    world = DeskWorld()
    world.stake(AUTH_1, questionId=QUESTION_IDS[0], stakeId="stake-first-aaaa")
    world.stake(AUTH_1, questionId=QUESTION_IDS[1], stakeId="stake-second-bbb")

    stakes = world.mine().json()["stakes"]

    assert [stake["questionId"] for stake in stakes] == [QUESTION_IDS[1], QUESTION_IDS[0]]
    reads = [r for r in world.database.requests if r.url.path.endswith("/prediction_stakes")]
    assert any(
        r.url.params.get("limit") == "50" and r.url.params.get("order") == "id.desc" for r in reads
    )


def test_a_stake_on_a_question_that_closed_is_closed_but_not_settled():
    world = DeskWorld()
    world.stake(AUTH_1, side="yes", amount=20)
    world.close_question(GROUNDHOG)

    stake = world.mine().json()["stakes"][0]

    assert (stake["status"], stake["result"], stake["payout"]) == ("closed", None, None)


def test_a_winner_sees_won_and_the_coins_and_a_loser_sees_lost():
    world = DeskWorld()
    case_a(world)
    world.close_question(GROUNDHOG)
    world.settle(outcome="yes")

    winner = world.mine(AUTH_1).json()["stakes"][0]
    loser = world.mine(AUTH_3).json()["stakes"][0]

    assert (winner["status"], winner["result"], winner["payout"]) == ("settled", "won", 59)
    assert (winner["settlement"], winner["outcome"]) == ("winners", "yes")
    assert winner["settledAt"] == "2026-11-05T12:00:00Z"
    assert (loser["result"], loser["payout"]) == ("lost", 0)


def test_a_void_pool_shows_refunded_for_everybody():
    world = DeskWorld()
    case_a(world)
    world.settle(outcome="void")

    stakes = [world.mine(headers).json()["stakes"][0] for headers in (AUTH_1, AUTH_2, AUTH_3)]

    assert [stake["result"] for stake in stakes] == ["refunded"] * 3
    assert [stake["payout"] for stake in stakes] == [30, 20, 50]
    assert {stake["settlement"] for stake in stakes} == {"refund_void"}


def test_the_balance_in_my_stakes_follows_the_payouts():
    world = DeskWorld()
    case_a(world)
    world.close_question(GROUNDHOG)
    world.settle(outcome="yes")

    assert world.mine(AUTH_1).json()["coins"] == 1029
    assert world.mine(AUTH_3).json()["coins"] == 950


def test_the_host_flag_is_true_only_for_a_host():
    world = DeskWorld()

    assert world.mine(AUTH_HOST).json()["host"] is True
    assert world.mine(AUTH_1).json()["host"] is False


def test_with_no_hosts_configured_nobody_is_a_host():
    assert DeskWorld(hosts=frozenset()).mine(AUTH_HOST).json()["host"] is False


def test_what_i_staked_today_counts_only_from_the_start_of_the_lisbon_day():
    world = DeskWorld()
    world.stake(AUTH_1, amount=40)
    world.clock.advance(12 * 3600)  # 5 Nov 2026, 24:00 UTC is 6 Nov 00:00 in Lisbon

    body = world.mine().json()

    assert (body["stakedToday"], body["leftToday"]) == (0, 200)
    reads = [r for r in world.database.requests if "created_at" in r.url.params]
    assert reads[-1].url.params["created_at"] == "gte.2026-11-06T00:00:00+00:00"


# --- POST /api/predictions/stake ---


def test_a_stake_takes_the_coins_and_answers_with_the_new_state_of_the_pool():
    world = DeskWorld()

    response = world.stake(side="yes", amount=20)

    assert response.status_code == 200
    assert response.json() == {
        "questionId": GROUNDHOG,
        "side": "yes",
        "amount": 20,
        "coins": 980,
        "stakedToday": 20,
        "leftToday": 180,
        "sides": [
            {"side": "yes", "label": "Yes", "coins": 20, "players": 1, "payoutPerCoin": 1.0},
            {"side": "no", "label": "No", "coins": 0, "players": 0, "payoutPerCoin": None},
        ],
        "totalCoins": 20,
    }


def test_a_stake_writes_one_stake_row_and_one_ledger_row_with_the_stake_ref():
    world = DeskWorld()

    world.stake(amount=20, stakeId="stake-0001-aaaa")

    assert world.database.balances[PLAYER_1] == 980
    assert world.database.ledger == [
        {
            "player_id": PLAYER_1,
            "delta": -20,
            "reason": "prediction_stake",
            "ref": "stake:stake-0001-aaaa",
        }
    ]
    assert len(world.database.stakes) == 1


def test_the_database_function_gets_the_player_from_the_sign_in_and_the_limits_from_the_rules():
    world = DeskWorld()

    world.stake(AUTH_2, side="no", amount=15, stakeId="stake-0001-aaaa")

    (call,) = world.database.calls("prediction_place_stake")
    assert call["p_player_id"] == PLAYER_2
    assert (call["p_question_id"], call["p_side"], call["p_amount"]) == (GROUNDHOG, "no", 15)
    assert call["p_stake_id"] == "stake-0001-aaaa"
    assert (call["p_max_stake"], call["p_daily_cap"]) == (50, 200)
    assert call["p_day_start"] == "2026-11-05T00:00:00+00:00"
    assert call["p_closes_at"] == "2027-02-01T23:00:00+00:00"


def test_the_earliest_closing_time_is_the_one_the_database_gets_and_stores():
    world = DeskWorld()
    manifold_closes = world.clock.now + timedelta(
        minutes=30
    )  # long before the list says (Feb 2027)
    world.manifold.change(GROUNDHOG_MARKET, closeTime=milliseconds(manifold_closes))

    assert world.stake().status_code == 200

    (call,) = world.database.calls("prediction_place_stake")
    assert call["p_closes_at"] == manifold_closes.isoformat()
    assert world.database.pools[GROUNDHOG]["closes_at"] == manifold_closes.isoformat()


def test_a_stake_needs_a_sign_in():
    world = DeskWorld()

    response = world.client.post("/api/predictions/stake", json={})

    assert_error(response, 401, "unauthorized")


def test_the_same_stake_sent_twice_is_409_already_applied_and_the_wallet_ran_once():
    world = DeskWorld()
    assert world.stake(stakeId="stake-0001-aaaa").status_code == 200

    second = world.stake(stakeId="stake-0001-aaaa")

    assert_error(second, 409, "already_applied")
    assert second.json()["error"]["message"] == "This stake was already placed."
    assert len(world.database.calls("prediction_place_stake")) == 1
    assert len(world.database.ledger_rows("prediction_stake")) == 1
    assert world.database.balances[PLAYER_1] == 980


def test_a_repeat_is_still_already_applied_after_the_question_has_closed():
    world = DeskWorld()
    world.stake(stakeId="stake-0001-aaaa")
    world.close_question(GROUNDHOG)

    assert_error(world.stake(stakeId="stake-0001-aaaa"), 409, "already_applied")


def test_a_repeat_is_still_already_applied_when_manifold_cannot_be_reached():
    world = DeskWorld()
    world.stake(stakeId="stake-0001-aaaa")
    world.manifold.status = 500
    world.clock.advance(500)

    assert_error(world.stake(stakeId="stake-0001-aaaa"), 409, "already_applied")


def test_a_repeat_is_already_applied_even_if_the_question_is_not_on_the_list_any_more():
    world = DeskWorld()
    world.stake(stakeId="stake-0001-aaaa")
    world.change_question(GROUNDHOG, reviewed_on="pending")

    assert_error(world.stake(stakeId="stake-0001-aaaa"), 409, "already_applied")


def test_two_players_may_use_the_same_stake_id():
    world = DeskWorld()

    assert world.stake(AUTH_1, stakeId="stake-0001-aaaa").status_code == 200
    assert world.stake(AUTH_2, stakeId="stake-0001-aaaa").status_code == 200


def test_the_same_stake_arriving_twice_at_the_same_moment_stakes_once():
    world = DeskWorld()
    order = StakeOrder(GROUNDHOG, "yes", 20, "stake-0001-aaaa")

    async def both():
        return await asyncio.gather(
            world.desk.stake(world.admin, PLAYER_1, order),
            world.desk.stake(world.admin, PLAYER_1, order),
            return_exceptions=True,
        )

    results = asyncio.run(both())

    refused = [result for result in results if isinstance(result, AlreadyApplied)]
    assert len(refused) == 1
    assert refused[0].message == "This stake was already placed."
    assert len(world.database.calls("prediction_place_stake")) == 2  # both reached the database
    assert len(world.database.stakes) == 1
    assert world.database.balances[PLAYER_1] == 980


def test_a_question_that_is_not_on_the_list_is_404_no_such_question():
    response = DeskWorld().stake(questionId="no-such-question")

    assert_error(response, 404, "no_such_question")
    assert response.json()["error"]["message"] == "That question is not on the prediction desk."


def test_a_question_that_a_person_has_not_read_cannot_be_staked_on():
    world = DeskWorld()
    world.change_question(GROUNDHOG, reviewed_by="pending")

    assert_error(world.stake(), 404, "no_such_question")
    assert world.database.stakes == []


def test_a_stake_after_the_closing_time_is_409_pool_closed():
    world = DeskWorld()
    world.close_question(GROUNDHOG)

    response = world.stake()

    assert_error(response, 409, "pool_closed")
    assert response.json()["error"]["message"] == "Staking on this question has closed."
    assert world.database.calls("prediction_place_stake") == []


def test_a_stake_at_exactly_the_closing_time_is_too_late():
    world = DeskWorld()
    world.change_question(GROUNDHOG, closes_at=world.clock.now)

    assert_error(world.stake(), 409, "pool_closed")


def test_a_stake_when_manifold_has_decided_is_409_pool_closed_on_manifold():
    world = DeskWorld()
    decide_on_manifold(world, "YES")

    response = world.stake()

    assert_error(response, 409, "pool_closed")
    assert response.json()["error"]["message"] == "Staking on this question has closed on Manifold."


def test_a_stake_when_manifold_closed_the_market_is_409_pool_closed():
    world = DeskWorld()
    world.manifold.change(
        GROUNDHOG_MARKET, closeTime=milliseconds(world.clock.now - timedelta(minutes=5))
    )

    assert_error(world.stake(), 409, "pool_closed")


def test_a_stake_when_the_pool_was_closed_earlier_than_the_list_says_is_refused_by_the_database():
    world = DeskWorld()
    assert world.stake(AUTH_1, stakeId="stake-0001-aaaa").status_code == 200
    world.database.pools[GROUNDHOG]["closes_at"] = (
        world.clock.now - timedelta(minutes=1)
    ).isoformat()

    response = world.stake(AUTH_2, stakeId="stake-0002-bbbb")

    assert_error(response, 409, "pool_closed")
    assert world.database.balances[PLAYER_2] == 1000


def test_with_only_the_recording_a_stake_is_503_source_unavailable():
    world = DeskWorld()
    world.manifold.status = 500

    response = world.stake()

    assert_error(response, 503, "source_unavailable")
    assert world.database.calls("prediction_place_stake") == []


def test_with_an_old_but_real_reading_a_stake_still_works():
    world = DeskWorld()
    world.listing()  # a good reading is cached
    world.manifold.status = 429
    world.clock.advance(500)  # the cache ran out, Manifold says 429: the old answer is "stale"

    assert world.stake().status_code == 200
    assert world.question()["source"] == "stale"


def test_a_stale_reading_that_is_exactly_15_minutes_old_still_lets_a_stake_through():
    world = DeskWorld()
    world.listing()  # a good reading is cached
    world.manifold.status = 429
    world.clock.advance(15 * 60)  # the cache ran out long ago; Manifold still says 429

    assert world.stake().status_code == 200
    assert world.question()["source"] == "stale"


def test_a_stale_reading_older_than_15_minutes_is_503_source_unavailable_and_changes_nothing():
    world = DeskWorld()
    world.listing()  # a good reading is cached
    world.manifold.status = 429
    world.clock.advance(15 * 60 + 1)

    response = world.stake()

    assert_error(response, 503, "source_unavailable")
    assert world.database.calls("prediction_place_stake") == []
    assert world.database.balances[PLAYER_1] == 1000


def test_an_old_stale_reading_is_still_shown_but_the_list_says_nobody_can_stake():
    world = DeskWorld()
    world.listing()
    world.manifold.status = 429
    world.clock.advance(15 * 60 + 1)

    question = world.question()

    assert question["source"] == "stale"
    assert question["manifold"]["state"] == "open"  # what the old reading says is still shown
    assert (question["status"], question["canStake"]) == ("open", False)


def test_an_old_stale_reading_that_says_decided_is_still_pool_closed_on_manifold():
    world = DeskWorld()
    decide_on_manifold(world, "YES")
    world.listing()  # the reading that says "decided" is cached
    world.manifold.status = 429
    world.clock.advance(20 * 60)

    response = world.stake()

    assert_error(response, 409, "pool_closed")
    assert response.json()["error"]["message"] == "Staking on this question has closed on Manifold."


def test_when_manifold_is_back_a_stake_works_again():
    world = DeskWorld()
    world.listing()
    world.manifold.status = 429
    world.clock.advance(15 * 60 + 1)
    assert_error(world.stake(), 503, "source_unavailable")

    world.manifold.status = 200
    world.clock.advance(121)  # the source waits one TTL after a failed call

    assert world.stake().status_code == 200
    assert world.question()["source"] == "cache"


def test_in_demo_mode_a_stake_works_on_the_recording_and_manifold_is_never_called():
    world = DeskWorld(demo_mode=True)

    assert world.stake().status_code == 200
    assert world.manifold.calls == 0


def test_a_stake_of_zero_coins_is_422_stake_too_small():
    response = DeskWorld().stake(amount=0)

    assert_error(response, 422, "stake_too_small")
    assert response.json()["error"]["message"] == "A stake must be at least 1 coin."


def test_a_negative_stake_is_422_stake_too_small_and_cannot_credit_coins():
    world = DeskWorld()

    response = world.stake(amount=-3)

    assert_error(response, 422, "stake_too_small")
    assert world.database.balances[PLAYER_1] == 1000
    assert world.database.stakes == []


def test_a_stake_of_51_coins_is_422_stake_too_big():
    response = DeskWorld().stake(amount=51)

    assert_error(response, 422, "stake_too_big")
    assert response.json()["error"]["message"] == "You can stake at most 50 coins on one question."


@pytest.mark.parametrize("amount", [1, 50])
def test_the_smallest_and_the_biggest_stake_are_accepted(amount):
    assert DeskWorld().stake(amount=amount).status_code == 200


@pytest.mark.parametrize("amount", ["5", 5.5, True, None, [5], {"coins": 5}])
def test_an_amount_that_is_not_a_whole_number_is_422_validation_error(amount):
    assert_error(DeskWorld().stake(amount=amount), 422, "validation_error")


def test_an_extra_field_is_refused_so_nobody_can_name_the_player():
    world = DeskWorld()

    response = world.stake(playerId=PLAYER_2)

    assert_error(response, 422, "validation_error")
    assert world.database.stakes == []


@pytest.mark.parametrize(
    "changes",
    [
        {"side": "maybe"},
        {"side": "YES"},
        {"questionId": "Groundhog"},
        {"questionId": "g"},
        {"questionId": "a" * 41},
        {"stakeId": "short"},
        {"stakeId": "x" * 65},
        {"stakeId": "bad stake id!"},
        {"stakeId": ""},
    ],
)
def test_a_bad_field_is_422_validation_error(changes):
    assert_error(DeskWorld().stake(**changes), 422, "validation_error")


def test_a_missing_field_is_422_validation_error():
    world = DeskWorld()

    response = world.client.post(
        "/api/predictions/stake",
        json={"questionId": GROUNDHOG, "side": "yes", "amount": 20},
        headers=AUTH_1,
    )

    assert_error(response, 422, "validation_error")


def test_a_second_stake_on_the_same_question_is_409_already_staked():
    world = DeskWorld()
    world.stake(amount=20, side="yes", stakeId="stake-0001-aaaa")

    response = world.stake(amount=10, side="no", stakeId="stake-0002-bbbb")

    assert_error(response, 409, "already_staked")
    assert response.json()["error"]["message"] == (
        "You already staked 20 coins on YES for this question. One stake per question."
    )
    assert world.database.balances[PLAYER_1] == 980


def test_a_player_may_stake_on_every_question_once():
    world = DeskWorld()

    codes = [
        world.stake(
            questionId=question_id, stakeId=f"stake-{number:04d}-xxxx", amount=10
        ).status_code
        for number, question_id in enumerate(QUESTION_IDS)
    ]

    assert codes == [200] * 5


def test_the_daily_cap_of_200_coins_stops_the_next_stake_and_says_how_many_are_left():
    world = DeskWorld()
    amounts = [50, 50, 50, 20]
    for number, amount in enumerate(amounts):
        ok = world.stake(
            questionId=QUESTION_IDS[number], amount=amount, stakeId=f"stake-{number:04d}-xxxx"
        )
        assert ok.status_code == 200

    response = world.stake(questionId=QUESTION_IDS[4], amount=40, stakeId="stake-0004-xxxx")

    assert_error(response, 409, "daily_stake_cap")
    assert response.json()["error"]["message"] == (
        "You can stake at most 200 coins a day at the desk. You can still stake 30 coins today."
    )
    assert world.database.balances[PLAYER_1] == 1000 - 170


def test_the_exact_rest_of_the_daily_cap_may_still_be_staked():
    world = DeskWorld()
    for number in range(3):
        world.stake(questionId=QUESTION_IDS[number], amount=50, stakeId=f"stake-{number:04d}-xxxx")

    response = world.stake(questionId=QUESTION_IDS[3], amount=50, stakeId="stake-0003-xxxx")

    assert response.status_code == 200
    assert (response.json()["stakedToday"], response.json()["leftToday"]) == (200, 0)


def test_the_daily_cap_starts_again_at_midnight_in_lisbon():
    world = DeskWorld()
    for number in range(4):
        world.stake(questionId=QUESTION_IDS[number], amount=50, stakeId=f"stake-{number:04d}-xxxx")
    world.clock.advance(12 * 3600)  # past 00:00 on 6 Nov in Lisbon

    response = world.stake(questionId=QUESTION_IDS[4], amount=50, stakeId="stake-0004-xxxx")

    assert response.status_code == 200
    assert response.json()["stakedToday"] == 50


def test_not_enough_coins_is_409_insufficient_funds_and_changes_nothing():
    world = DeskWorld()
    world.database.give(PLAYER_1, 10)

    response = world.stake(amount=20)

    assert_error(response, 409, "insufficient_funds")
    assert world.database.balances[PLAYER_1] == 10
    assert world.database.stakes == []


def test_staking_exactly_the_whole_balance_leaves_zero_coins():
    world = DeskWorld()
    world.database.give(PLAYER_1, 50)

    response = world.stake(amount=50)

    assert response.status_code == 200
    assert response.json()["coins"] == 0
    assert world.database.balances[PLAYER_1] == 0


def test_a_player_without_a_wallet_is_a_502_database_error():
    world = DeskWorld()
    del world.database.balances[PLAYER_1]

    assert_error(world.stake(), 502, "database_error")


def test_the_eleventh_stake_in_30_seconds_is_429_with_a_retry_after():
    world = DeskWorld()
    for number in range(10):
        world.stake(amount=20, stakeId=f"stake-{number:04d}-xxxx")

    response = world.stake(amount=20, stakeId="stake-0010-xxxx")

    assert_error(response, 429, "too_many_requests")
    assert response.headers["retry-after"] == "30"
    assert response.json()["error"]["message"] == (
        "You are staking very fast. Wait a few seconds, then try again."
    )


def test_after_30_seconds_the_player_may_stake_again():
    world = DeskWorld()
    for number in range(10):
        world.stake(amount=20, stakeId=f"stake-{number:04d}-xxxx")
    world.clock.advance(31)

    assert_error(world.stake(amount=20, stakeId="stake-0011-xxxx"), 409, "already_staked")


def test_the_speed_limit_is_per_player():
    world = DeskWorld()
    for number in range(10):
        world.stake(AUTH_1, stakeId=f"stake-{number:04d}-xxxx")

    assert world.stake(AUTH_2, stakeId="stake-other-player").status_code == 200


def test_a_database_that_is_down_is_503_database_unavailable():
    world = DeskWorld()
    world.database.unavailable = True

    assert_error(world.stake(), 503, "database_unavailable")


def test_a_timeout_of_the_stake_function_says_the_outcome_is_unknown_and_the_same_id_is_safe():
    world = DeskWorld()
    world.database.rpc_unavailable = True
    first = world.stake(stakeId="stake-0001-aaaa")
    world.database.rpc_unavailable = False

    retry = world.stake(stakeId="stake-0001-aaaa")

    assert_error(first, 503, "database_unavailable")
    assert retry.status_code == 200
    assert len(world.database.ledger_rows("prediction_stake")) == 1


def test_a_database_without_the_migration_is_a_502_database_error():
    world = DeskWorld()
    missing = {"code": "PGRST205", "message": "Could not find the table", "details": None}
    world.database.fail_with = httpx.Response(404, json=missing)

    assert_error(world.stake(), 502, "database_error")
    assert_error(world.listing(), 502, "database_error")


# --- POST /api/predictions/settle ---


def test_a_settlement_needs_a_sign_in():
    response = DeskWorld().client.post("/api/predictions/settle", json={})

    assert_error(response, 401, "unauthorized")


def test_a_player_who_is_not_a_host_cannot_settle():
    world = DeskWorld()

    response = world.settle(AUTH_1)

    assert_error(response, 403, "forbidden")
    assert response.json()["error"]["message"] == "Only a host can do this."
    assert world.database.calls("prediction_settle_pool") == []


def test_with_no_hosts_configured_even_the_host_gets_403():
    world = DeskWorld(hosts=frozenset())

    assert_error(world.settle(AUTH_HOST), 403, "forbidden")


def test_the_host_is_an_ordinary_player_in_every_other_way():
    world = DeskWorld()

    assert world.stake(AUTH_HOST).status_code == 200
    assert world.database.balances[HOST_ID] == 980


@pytest.mark.parametrize(
    "body",
    [
        {"outcome": "maybe"},
        {"outcome": "YES"},
        {"questionId": "Groundhog"},
        {"extra": 1},
    ],
)
def test_a_bad_settle_body_is_422_validation_error(body):
    assert_error(DeskWorld().settle(**body), 422, "validation_error")


def test_a_question_that_is_not_on_the_list_cannot_be_settled():
    assert_error(DeskWorld().settle(questionId="no-such-question"), 404, "no_such_question")


def test_a_question_nobody_has_read_cannot_be_settled():
    world = DeskWorld()
    world.change_question(GROUNDHOG, reviewed_on="pending")

    assert_error(world.settle(), 404, "no_such_question")


def test_void_works_on_an_open_pool_and_gives_everybody_their_coins_back():
    world = DeskWorld()
    world.stake(AUTH_1, side="yes", amount=20, stakeId="stake-p1-groundhog")
    world.stake(AUTH_2, side="no", amount=30, stakeId="stake-p2-groundhog")

    response = world.settle(outcome="void")

    assert response.status_code == 200
    assert response.json() == {
        "questionId": GROUNDHOG,
        "outcome": "void",
        "settlement": "refund_void",
        "settledAt": "2026-11-05T12:00:00Z",
        "paidPlayers": 2,
        "paidCoins": 50,
        "cutCoins": 0,
    }
    assert world.database.balances[PLAYER_1] == 1000
    assert world.database.balances[PLAYER_2] == 1000


def test_yes_before_the_closing_time_is_409_pool_open_and_pays_nothing():
    world = DeskWorld()
    case_a(world)

    response = world.settle(outcome="yes")

    assert_error(response, 409, "pool_open")
    assert response.json()["error"]["message"] == (
        "Staking is open until Mon 1 Feb 23:00 UTC. Settle it after that, or void it."
    )
    assert world.database.calls("prediction_settle_pool") == []
    assert world.database.ledger_rows("prediction_payout") == []


def test_no_before_the_closing_time_is_409_pool_open_too():
    world = DeskWorld()
    case_a(world)

    assert_error(world.settle(outcome="no"), 409, "pool_open")


def test_yes_after_the_closing_time_pays_exactly_what_the_pool_rules_gave():
    world = DeskWorld()
    case_a(world)
    world.close_question(GROUNDHOG)

    response = world.settle(outcome="yes")

    expected = plan_settlement(
        [
            Stake(1, PLAYER_1, "yes", 30),
            Stake(2, PLAYER_2, "yes", 20),
            Stake(3, PLAYER_3, "no", 50),
        ],
        "yes",
        5,
    )
    assert response.status_code == 200
    assert response.json() == {
        "questionId": GROUNDHOG,
        "outcome": "yes",
        "settlement": "winners",
        "settledAt": "2026-11-05T12:00:00Z",
        "paidPlayers": 2,
        "paidCoins": 98,
        "cutCoins": expected.cut,
    }
    assert [payout.coins for payout in expected.payouts] == [59, 39]
    assert world.database.balances == {PLAYER_1: 1029, PLAYER_2: 1019, PLAYER_3: 950, HOST_ID: 1000}


def test_the_payout_ledger_rows_use_the_pool_ref_and_the_agreed_reason():
    world = DeskWorld()
    case_a(world)
    world.close_question(GROUNDHOG)
    world.settle(outcome="yes")

    rows = world.database.ledger_rows("prediction_payout")

    assert sorted((row["player_id"], row["delta"], row["ref"]) for row in rows) == [
        (PLAYER_1, 59, f"pool:{GROUNDHOG}"),
        (PLAYER_2, 39, f"pool:{GROUNDHOG}"),
    ]


def test_the_database_function_gets_the_payouts_the_cut_and_the_host_as_settled_by():
    world = DeskWorld()
    case_a(world)
    world.close_question(GROUNDHOG)

    world.settle(outcome="yes")

    (call,) = world.database.calls("prediction_settle_pool")
    assert call["p_question_id"] == GROUNDHOG
    assert call["p_outcome"] == "yes"
    assert call["p_cut_percent"] == 5
    assert call["p_settled_by"] == "host"
    assert call["p_payouts"] == [{"stakeRowId": 1, "coins": 59}, {"stakeRowId": 2, "coins": 39}]
    assert call["p_closes_at"] == (world.clock.now - timedelta(minutes=5)).isoformat()


def test_a_pool_with_no_winners_refunds_everybody():
    world = DeskWorld()
    case_a(world)
    world.close_question(GROUNDHOG)
    world.database.stakes[:] = [s for s in world.database.stakes if s["side"] == "no"]

    response = world.settle(outcome="yes")

    assert response.json()["settlement"] == "refund_no_winners"
    assert response.json()["paidCoins"] == 50


def test_a_pool_where_everybody_picked_the_winning_side_refunds_everybody():
    world = DeskWorld()
    world.stake(AUTH_1, side="yes", amount=40, stakeId="stake-p1-groundhog")
    world.stake(AUTH_2, side="yes", amount=10, stakeId="stake-p2-groundhog")
    world.close_question(GROUNDHOG)

    response = world.settle(outcome="yes")

    assert response.json()["settlement"] == "refund_one_sided"
    assert (response.json()["paidCoins"], response.json()["cutCoins"]) == (50, 0)


def test_an_empty_pool_settles_with_no_payouts():
    world = DeskWorld()
    world.close_question(GROUNDHOG)

    response = world.settle(outcome="yes")

    assert response.status_code == 200
    assert response.json()["paidPlayers"] == 0
    assert response.json()["settlement"] == "refund_no_winners"


def test_settling_twice_is_409_already_applied_and_names_how_it_ended():
    world = DeskWorld()
    case_a(world)
    world.close_question(GROUNDHOG)
    world.settle(outcome="yes")

    second = world.settle(outcome="yes")

    assert_error(second, 409, "already_applied")
    assert second.json()["error"]["message"] == "This question was settled already: YES won."
    assert len(world.database.ledger_rows("prediction_payout")) == 2


def test_not_even_void_settles_a_pool_a_second_time():
    world = DeskWorld()
    case_a(world)
    world.close_question(GROUNDHOG)
    world.settle(outcome="no")

    second = world.settle(outcome="void")

    assert_error(second, 409, "already_applied")
    assert second.json()["error"]["message"] == "This question was settled already: NO won."


def test_a_pool_that_was_void_says_so_when_settled_again():
    world = DeskWorld()
    case_a(world)
    world.settle(outcome="void")

    second = world.settle(outcome="yes")

    assert second.json()["error"]["message"] == (
        "This question was settled already: it was void, and everybody got their coins back."
    )


def test_a_stake_after_the_settlement_is_409_pool_closed():
    world = DeskWorld()
    case_a(world)
    world.settle(outcome="void")

    response = world.stake(AUTH_HOST)

    assert_error(response, 409, "pool_closed")


@pytest.mark.parametrize(
    ("resolution", "wrong", "right"), [("NO", "yes", "no"), ("YES", "no", "yes")]
)
def test_the_host_cannot_settle_against_what_manifold_decided(resolution, wrong, right):
    world = DeskWorld()
    case_a(world)
    decide_on_manifold(world, resolution)

    conflict = world.settle(outcome=wrong)
    agreed = world.settle(outcome=right)

    assert_error(conflict, 409, "outcome_conflict")
    assert conflict.json()["error"]["message"] == (
        f"Manifold decided this question as {resolution}. Settle it as {right}, or void it."
    )
    assert agreed.status_code == 200


def test_when_manifold_decided_yes_or_no_may_be_settled_even_before_our_closing_time():
    world = DeskWorld()
    case_a(world)
    decide_on_manifold(world, "NO")

    response = world.settle(outcome="no")

    assert response.status_code == 200
    assert response.json()["settlement"] == "winners"


@pytest.mark.parametrize("resolution", ["CANCEL", "MKT"])
def test_when_manifold_cancelled_or_gave_no_clear_answer_only_void_is_allowed(resolution):
    world = DeskWorld()
    case_a(world)
    decide_on_manifold(world, resolution)

    yes = world.settle(outcome="yes")
    no = world.settle(outcome="no")
    void = world.settle(outcome="void")

    assert_error(yes, 409, "outcome_conflict")
    assert_error(no, 409, "outcome_conflict")
    assert yes.json()["error"]["message"] == (
        "Manifold cancelled this question or gave no clear YES or NO. Void it."
    )
    assert (void.status_code, void.json()["settlement"]) == (200, "refund_void")


def test_void_is_always_allowed_even_when_manifold_decided_yes():
    world = DeskWorld()
    case_a(world)
    decide_on_manifold(world, "YES")

    assert world.settle(outcome="void").status_code == 200


def test_a_stale_reading_older_than_15_minutes_still_limits_the_host_to_what_manifold_decided():
    world = DeskWorld()
    case_a(world)
    decide_on_manifold(world, "YES")
    world.listing()  # the reading that says "decided YES" is cached
    world.manifold.status = 429
    world.clock.advance(20 * 60)  # that reading is now stale and older than the limit for stakes

    conflict = world.settle(outcome="no")
    agreed = world.settle(outcome="yes")

    assert_error(conflict, 409, "outcome_conflict")
    assert agreed.status_code == 200
    assert world.question()["source"] == "stale"


def test_with_only_the_recording_the_host_decides_alone_after_the_closing_time():
    world = DeskWorld()
    case_a(world)
    world.manifold.status = 500
    world.forget_manifold()  # a server instance that just started has no old reading either
    world.close_question(GROUNDHOG)

    response = world.settle(outcome="no")

    assert response.status_code == 200
    assert world.question()["source"] == "fallback"


def test_with_only_the_recording_yes_before_the_closing_time_is_still_pool_open():
    world = DeskWorld()
    case_a(world)
    world.manifold.status = 500
    world.forget_manifold()

    assert_error(world.settle(outcome="yes"), 409, "pool_open")
    assert world.question()["source"] == "fallback"


def test_with_no_data_from_manifold_at_all_the_host_can_still_void():
    world = DeskWorld(demo_mode=False)
    case_a(world)
    world.manifold.status = 500
    world.forget_manifold()
    world.desk.sources[GROUNDHOG].fallback = None  # no recording either

    assert world.settle(outcome="void").status_code == 200


def test_the_database_losing_a_stake_in_between_is_retried_once():
    world = DeskWorld()
    case_a(world)
    world.close_question(GROUNDHOG)
    world.database.stakes_changed_times = 1

    response = world.settle(outcome="yes")

    assert response.status_code == 200
    assert len(world.database.calls("prediction_settle_pool")) == 2
    stake_reads = [
        r
        for r in world.database.requests
        if r.url.path.endswith("/prediction_stakes") and r.url.params.get("order") == "id.asc"
    ]
    assert len(stake_reads) == 2


def test_a_second_stakes_changed_is_409_and_nothing_is_paid():
    world = DeskWorld()
    case_a(world)
    world.close_question(GROUNDHOG)
    world.database.stakes_changed_times = 2

    response = world.settle(outcome="yes")

    assert_error(response, 409, "stakes_changed")
    assert (
        response.json()["error"]["message"]
        == "The pool changed while it was being settled. Try again."
    )
    assert world.database.ledger_rows("prediction_payout") == []


def test_when_the_database_clock_says_the_pool_is_still_open_the_answer_is_409_pool_open():
    world = DeskWorld()
    case_a(world)
    world.close_question(GROUNDHOG, minutes_ago=5)
    world.database.skew = timedelta(minutes=-10)  # the database clock is 10 minutes behind

    response = world.settle(outcome="yes")

    assert_error(response, 409, "pool_open")
    assert response.json()["error"]["message"] == (
        "Staking is open until Thu 5 Nov 11:55 UTC. Settle it after that, or void it."
    )
    assert world.database.ledger_rows("prediction_payout") == []


def test_two_hosts_settling_the_same_pool_at_the_same_moment_pay_once():
    world = DeskWorld()
    case_a(world)
    world.close_question(GROUNDHOG)
    order = SettleOrder(GROUNDHOG, "yes")

    async def both():
        return await asyncio.gather(
            world.desk.settle(world.admin, order),
            world.desk.settle(world.admin, order),
            return_exceptions=True,
        )

    results = asyncio.run(both())

    receipts = [result for result in results if not isinstance(result, Exception)]
    refused = [result for result in results if isinstance(result, AlreadyApplied)]
    assert len(receipts) == 1
    assert len(refused) == 1
    assert refused[0].message == "This question was settled already: YES won."
    assert len(world.database.ledger_rows("prediction_payout")) == 2
    assert len(world.database.calls("prediction_settle_pool")) == 2


def test_a_database_that_is_down_during_a_settlement_is_503_and_a_retry_is_safe():
    world = DeskWorld()
    case_a(world)
    world.close_question(GROUNDHOG)
    world.database.rpc_unavailable = True
    first = world.settle(outcome="yes")
    world.database.rpc_unavailable = False

    retry = world.settle(outcome="yes")

    assert_error(first, 503, "database_unavailable")
    assert retry.status_code == 200
    assert len(world.database.ledger_rows("prediction_payout")) == 2


def test_the_settlement_leaves_one_info_line_without_any_player_id(caplog):
    world = DeskWorld()
    case_a(world)
    world.close_question(GROUNDHOG)

    with caplog.at_level(logging.INFO, logger="server.predictions.desk"):
        world.settle(outcome="yes")

    lines = [
        record.getMessage() for record in caplog.records if record.name == "server.predictions.desk"
    ]
    assert lines == [
        "Settled groundhog-2027 as yes (winners): 2 payouts, 98 coins, 2 coins left the game."
    ]
    assert (
        PLAYER_1 not in caplog.text and PLAYER_2 not in caplog.text and PLAYER_3 not in caplog.text
    )


# --- nothing leaks ---


def test_no_answer_of_the_desk_holds_a_secret_or_the_price_of_manifold():
    world = DeskWorld()
    case_a(world)
    world.close_question(GROUNDHOG)
    texts = [
        world.listing().text,
        world.mine().text,
        world.settle(outcome="yes").text,
        json.dumps(world.mine(AUTH_3).json()),
    ]

    for text in texts:
        assert "sb_secret" not in text
        assert "probability" not in text.lower()
        assert "0.77" not in text


# --- the desk is built from the settings ---


def test_a_stake_stays_in_my_stakes_after_its_question_left_the_list():
    world = DeskWorld()
    world.stake(amount=20)
    world.desk.questions = ()  # the question was removed from questions.json by mistake

    stake = world.mine().json()["stakes"][0]

    assert stake["questionId"] == GROUNDHOG
    assert stake["text"] == GROUNDHOG  # no text any more, so the id stands in
    assert stake["status"] == "open"


def test_a_stake_on_a_question_nobody_has_read_any_more_is_still_in_my_stakes_with_its_text():
    world = DeskWorld()
    world.stake(amount=20)
    world.change_question(GROUNDHOG, reviewed_on="pending")

    stake = world.mine().json()["stakes"][0]

    assert stake["text"].startswith("Will Punxsutawney Phil")


def test_a_broken_questions_file_gives_no_desk_and_an_error_in_the_log(monkeypatch, caplog):
    def broken(path):
        raise QuestionsError("questions[0] (x): 'text' must end with a question mark.")

    monkeypatch.setattr(desk_module, "load_questions", broken)

    with caplog.at_level(logging.ERROR):
        assert desk_module.desk_or_none(CONFIGURED_SETTINGS) is None

    assert "The prediction desk cannot start" in caplog.text
    assert "must end with a question mark" in caplog.text


def test_the_app_starts_and_answers_503_when_the_questions_file_is_broken(monkeypatch):
    def broken(path):
        raise QuestionsError("broken")

    monkeypatch.setattr(desk_module, "load_questions", broken)
    client = TestClient(create_app(CONFIGURED_SETTINGS))

    assert client.get("/api/health").status_code == 200
    assert client.get("/api/config").status_code == 200


def test_building_the_real_desk_never_calls_manifold_or_the_database():
    desk = desk_from_settings(
        CONFIGURED_SETTINGS
    )  # the socket guard of conftest.py would fail a call

    assert len(desk.questions) == 5
    assert sorted(desk.sources) == sorted(question.id for question in desk.questions)
