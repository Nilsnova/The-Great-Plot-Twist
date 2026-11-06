"""Tests for predictions/state.py: what state a question is in, and may a captain stake on it.

Pure functions: a Question, a reading from Manifold, the pool row and the time go in, and the
state comes out. The rules (spec sections 4.4 and 7.1): a reading is real when it is live, cached
or stale (and in demo mode also the recording). Staking needs an open pool, an open Manifold
market and a closing time that has not passed. The earliest of all closing times we know counts.
A stale reading older than 15 minutes is still shown but is too old to stake on (decision D018).
"""

from datetime import UTC, datetime, timedelta

import pytest

from server.adapters.base import SourceResult
from server.predictions.manifold import MarketState
from server.predictions.pools import VOID
from server.predictions.questions import Question
from server.predictions.stake_rules import STALE_LIMIT_FOR_STAKE
from server.predictions.state import (
    CLOSED,
    DECIDED,
    OPEN,
    UNKNOWN,
    ManifoldView,
    is_too_old_to_stake,
    question_state,
    read_manifold,
)
from server.predictions.store import PoolRow

NOW = datetime(2026, 11, 20, 12, 0, tzinfo=UTC)
OUR_CLOSE = NOW + timedelta(days=10)
MANIFOLD_CLOSE = NOW + timedelta(days=20)

QUESTION = Question(
    id="groundhog-2027",
    market_id="pRq8uqsEus",
    text="Will Punxsutawney Phil see his shadow on Groundhog Day, 2 February 2027?",
    topic="weather",
    decided_by="The Groundhog Club announcement, as resolved on Manifold.",
    event_at=None,
    closes_at=OUR_CLOSE,
    reviewed_by="Nils",
    reviewed_on="2026-11-20",
)


def market(**changes) -> MarketState:
    fields = {
        "market_id": "pRq8uqsEus",
        "closes_at": MANIFOLD_CLOSE,
        "is_resolved": False,
        "decided_as": None,
        "decided_at": None,
    }
    fields.update(changes)
    return MarketState(**fields)


def reading(source: str = "live", fetched_at: datetime = NOW, **changes) -> SourceResult:
    return SourceResult(market(**changes), source, fetched_at)


def pool(closes_at: datetime = OUR_CLOSE, status: str = "open") -> PoolRow:
    settled = status == "settled"
    return PoolRow(
        question_id="groundhog-2027",
        closes_at=closes_at,
        status=status,
        outcome="yes" if settled else None,
        settlement="winners" if settled else None,
        settled_by="host" if settled else None,
        settled_at=NOW if settled else None,
        cut_coins=2 if settled else None,
        paid_coins=98 if settled else None,
    )


def view(result: SourceResult | None, demo_mode: bool = False) -> ManifoldView:
    return read_manifold(result, NOW, demo_mode)


# --- reading Manifold ---


def test_a_live_reading_of_an_open_market_is_open_and_real():
    manifold = view(reading("live"))

    assert manifold.state == OPEN
    assert manifold.is_real is True
    assert manifold.source == "live"
    assert manifold.fetched_at == NOW
    assert manifold.closes_at == MANIFOLD_CLOSE


@pytest.mark.parametrize("source", ["live", "cache", "stale"])
def test_live_cache_and_stale_readings_are_real(source):
    assert view(reading(source)).is_real is True


def test_the_recording_is_not_a_real_reading_outside_demo_mode():
    manifold = view(reading("fallback"))

    assert manifold.state == UNKNOWN
    assert manifold.is_real is False
    assert manifold.source == "fallback"
    assert manifold.closes_at is None
    assert manifold.decided_as is None


def test_in_demo_mode_the_recording_counts_as_the_reading():
    manifold = view(reading("fallback"), demo_mode=True)

    assert manifold.state == OPEN
    assert manifold.is_real is True
    assert manifold.source == "fallback"


def test_no_data_at_all_is_unknown_with_no_source_and_no_time():
    manifold = view(None)

    assert (manifold.state, manifold.source, manifold.fetched_at) == (UNKNOWN, None, None)
    assert manifold.is_real is False


def test_a_resolved_market_is_decided_with_the_result_and_the_time():
    decided_at = NOW - timedelta(hours=3)
    manifold = view(reading(is_resolved=True, decided_as="yes", decided_at=decided_at))

    assert manifold.state == DECIDED
    assert manifold.decided_as == "yes"
    assert manifold.decided_at == decided_at


@pytest.mark.parametrize("decided_as", ["yes", "no", VOID])
def test_decided_keeps_yes_no_and_void(decided_as):
    assert view(reading(is_resolved=True, decided_as=decided_as)).decided_as == decided_as


def test_a_market_that_closed_in_the_past_is_closed():
    assert view(reading(closes_at=NOW - timedelta(seconds=1))).state == CLOSED


def test_a_market_that_closes_exactly_now_is_closed():
    assert view(reading(closes_at=NOW)).state == CLOSED


def test_a_market_without_a_close_time_is_open():
    assert view(reading(closes_at=None)).state == OPEN


# --- the state of a question ---


def state_of(result, pool_row=None, demo_mode=False, now=NOW, question=QUESTION):
    return question_state(question, pool_row, read_manifold(result, now, demo_mode), now)


def test_a_normal_open_question_can_be_staked_on():
    state = state_of(reading())

    assert state.status == "open"
    assert state.can_stake is True
    assert state.closes_at == OUR_CLOSE


def test_the_effective_closing_time_is_the_earliest_of_ours_and_manifolds():
    state = state_of(reading(closes_at=NOW + timedelta(days=2)))

    assert state.closes_at == NOW + timedelta(days=2)
    assert state.can_stake is True


def test_a_pool_that_closes_earlier_than_the_list_wins():
    state = state_of(reading(), pool(closes_at=NOW + timedelta(days=1)))

    assert state.closes_at == NOW + timedelta(days=1)


def test_a_pool_that_closes_later_than_the_list_does_not_reopen_anything():
    state = state_of(reading(), pool(closes_at=NOW + timedelta(days=99)))

    assert state.closes_at == OUR_CLOSE


def test_after_our_closing_time_the_question_is_closed_and_cannot_be_staked_on():
    state = state_of(reading(), now=OUR_CLOSE)

    assert state.status == "closed"
    assert state.can_stake is False


def test_one_second_before_our_closing_time_it_is_still_open():
    state = state_of(reading(closes_at=None), now=OUR_CLOSE - timedelta(seconds=1))

    assert state.status == "open"
    assert state.can_stake is True


def test_a_market_that_manifold_closed_early_closes_the_question():
    state = state_of(reading(closes_at=NOW - timedelta(minutes=5)))

    assert state.status == "closed"
    assert state.can_stake is False
    assert state.manifold.state == CLOSED


def test_a_market_that_manifold_decided_closes_the_question():
    state = state_of(reading(is_resolved=True, decided_as="no", closes_at=NOW - timedelta(hours=1)))

    assert state.status == "closed"
    assert state.can_stake is False
    assert state.manifold.state == DECIDED


def test_a_decided_market_closes_at_the_time_manifold_decided_if_that_is_earliest():
    decided_at = NOW - timedelta(hours=5)

    state = state_of(
        reading(is_resolved=True, decided_as="no", closes_at=None, decided_at=decided_at)
    )

    assert state.closes_at == decided_at


def test_a_settled_pool_is_settled_whatever_manifold_says():
    state = state_of(reading(), pool(status="settled"))

    assert state.status == "settled"
    assert state.can_stake is False


def test_with_only_the_recording_the_question_is_open_by_time_but_cannot_be_staked_on():
    state = state_of(reading("fallback"))

    assert state.status == "open"
    assert state.manifold.state == UNKNOWN
    assert state.can_stake is False


def test_with_no_data_at_all_the_question_cannot_be_staked_on():
    state = state_of(None)

    assert state.status == "open"
    assert state.can_stake is False


def test_in_demo_mode_the_recording_lets_captains_stake():
    state = state_of(reading("fallback"), demo_mode=True)

    assert state.can_stake is True


def test_in_demo_mode_the_closing_time_of_the_list_still_counts():
    state = state_of(reading("fallback"), demo_mode=True, now=OUR_CLOSE)

    assert state.status == "closed"
    assert state.can_stake is False


def test_a_stale_reading_still_lets_captains_stake_while_it_says_open():
    assert state_of(reading("stale")).can_stake is True


# --- a stale reading that is too old to stake on ---


def test_a_stale_reading_of_exactly_15_minutes_can_still_be_staked_on():
    assert state_of(reading("stale", fetched_at=NOW - STALE_LIMIT_FOR_STAKE)).can_stake is True


def test_a_stale_reading_one_second_older_than_15_minutes_cannot_be_staked_on():
    old = NOW - STALE_LIMIT_FOR_STAKE - timedelta(seconds=1)

    assert state_of(reading("stale", fetched_at=old)).can_stake is False


def test_an_old_stale_reading_is_still_shown_and_still_counts_as_a_real_reading():
    state = state_of(reading("stale", fetched_at=NOW - timedelta(hours=3)))

    assert state.can_stake is False
    assert state.status == "open"  # by the clock the question is open
    assert state.manifold.state == OPEN  # what the old reading says is still shown
    assert state.manifold.source == "stale"
    assert state.manifold.is_real is True  # so a host's settlement is still checked against it


def test_an_old_stale_reading_that_says_decided_still_closes_the_question():
    old = NOW - timedelta(hours=3)

    state = state_of(reading("stale", fetched_at=old, is_resolved=True, decided_as="yes"))

    assert (state.status, state.manifold.state) == ("closed", DECIDED)


def test_in_demo_mode_an_old_recording_is_not_held_to_the_age_limit():
    state = state_of(reading("fallback", fetched_at=NOW - timedelta(days=9)), demo_mode=True)

    assert state.can_stake is True


def test_a_reading_without_a_time_is_never_too_old():
    assert is_too_old_to_stake(view(None), NOW) is False
    assert (
        is_too_old_to_stake(ManifoldView(OPEN, None, None, None, "stale", None, True), NOW) is False
    )


def test_a_closing_time_that_is_none_in_the_reading_does_not_change_ours():
    state = state_of(reading(closes_at=None))

    assert state.closes_at == OUR_CLOSE
