"""Payout verification against server evidence; no route or treasury is activated."""

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from server.errors import ApiError
from server.island.wager_results import football_returned_payout, market_call_returned_payout
from server.market.calendars import ALWAYS_OPEN
from server.market.calls_store import CallRow
from server.market.readings import NO_READING, Reading
from server.market.states import CompanyState
from server.sports.models import Match
from server.sports.source import SportsReading
from server.tests.market_helpers import island_company

NOW = datetime(2026, 11, 18, 15, tzinfo=UTC)
PRINCIPAL = 10**70 + 7


def call(**changes: object) -> CallRow:
    values = {
        "id": "call-1", "asset": "harbor-trust", "direction": "up", "stake": PRINCIPAL,
        "open_price": Decimal("100"), "opened_at": NOW - timedelta(minutes=5),
        "settle_at": NOW, "settled_at": None, "settle_price": None, "outcome": None,
        "payout": None,
    }
    return CallRow.model_validate(values | changes)


def market_reading(price: str = "101", **changes: object) -> CompanyState:
    reading = replace(Reading(Decimal(price), NOW, NOW, "live"), **changes)
    return CompanyState(island_company(id="harbor-trust"), reading, ALWAYS_OPEN,
                        "open", None, False, True)


def football_reading(**changes: object) -> SportsReading:
    match = Match("fd-123", "football", "League", "Home", "Away",
                  NOW - timedelta(hours=2), "finished", 2, 1)
    return replace(SportsReading(match, "football-data.org", "live", NOW), **changes)


@pytest.mark.parametrize("direction,price,expected", [
    ("up", "101", PRINCIPAL * 2), ("up", "99", 0), ("down", "101", 0),
    ("down", "99", PRINCIPAL * 2), ("up", "100", PRINCIPAL),
])
def test_market_calls_pay_uncapped_win_loss_or_tie(
    direction: str, price: str, expected: int,
) -> None:
    assert market_call_returned_payout(call(direction=direction), market_reading(price), NOW) == (
        expected
    )


def test_a_call_cannot_settle_before_its_stored_deadline() -> None:
    with pytest.raises(ApiError) as error:
        market_call_returned_payout(call(settle_at=NOW + timedelta(seconds=1)),
                                   market_reading(), NOW)
    assert error.value.code == "result_pending"


@pytest.mark.parametrize("changes", [
    {"source": "replay"}, {"source": "stale"}, {"source": "none"},
    {"fetched_at": NOW - timedelta(seconds=1)}, {"fetched_at": NOW + timedelta(seconds=1)},
    {"quoted_at": NOW - timedelta(minutes=5)}, {"quoted_at": NOW + timedelta(seconds=1)},
    {"quoted_at": None}, {"fetched_at": None},
])
def test_unusable_market_evidence_cannot_authorize_a_payout(changes: dict) -> None:
    with pytest.raises(ApiError) as error:
        market_call_returned_payout(call(), market_reading(**changes), NOW)
    assert error.value.code == "result_pending"


@pytest.mark.parametrize("price", ["NaN", "Infinity", "-1", "0"])
def test_nonfinite_or_nonpositive_market_prices_are_rejected(price: str) -> None:
    with pytest.raises(ApiError):
        market_call_returned_payout(call(), market_reading(price), NOW)


def test_no_price_refunds_only_after_the_stored_timeout() -> None:
    after_timeout = NOW + timedelta(hours=24, seconds=1)
    assert market_call_returned_payout(call(), None, after_timeout) == PRINCIPAL


def test_a_missing_price_at_the_timeout_boundary_still_waits() -> None:
    with pytest.raises(ApiError) as error:
        market_call_returned_payout(call(), None, NOW + timedelta(hours=24))
    assert error.value.code == "result_pending"


def test_a_no_reading_state_refunds_after_the_price_wait() -> None:
    state = replace(market_reading(), reading=NO_READING)
    assert market_call_returned_payout(call(), state, NOW + timedelta(hours=24, seconds=1)) == (
        PRINCIPAL
    )


@pytest.mark.parametrize("changes", [
    {"source": "stale"}, {"source": "replay"}, {"quoted_at": None},
    {"fetched_at": NOW - timedelta(seconds=1)},
    {"quoted_at": NOW - timedelta(minutes=5)},
])
def test_unusable_data_cannot_prevent_a_clock_authorized_timeout_refund(changes: dict) -> None:
    assert market_call_returned_payout(call(), market_reading(**changes),
                                      NOW + timedelta(hours=24, seconds=1)) == PRINCIPAL


def test_a_cached_price_fetched_after_the_deadline_is_valid() -> None:
    assert market_call_returned_payout(call(), market_reading(source="cache"), NOW) == (
        PRINCIPAL * 2
    )


def test_a_valid_market_price_for_another_asset_cannot_pay() -> None:
    state = market_reading()
    state = replace(state, company=island_company(id="apple"))
    with pytest.raises(ApiError) as error:
        market_call_returned_payout(call(), state, NOW)
    assert error.value.code == "result_pending"


@pytest.mark.parametrize("pick,payout", [("home", PRINCIPAL * 2), ("away", 0), ("draw", 0)])
def test_official_football_results_compute_uncapped_payouts(pick: str, payout: int) -> None:
    assert football_returned_payout(PRINCIPAL, pick, "fd-123", football_reading(), NOW) == payout


def test_void_football_fixtures_return_principal() -> None:
    reading = football_reading()
    reading = replace(reading, match=replace(reading.match, status="cancelled",
                                            home_score=None, away_score=None))
    assert football_returned_payout(PRINCIPAL, "home", "fd-123", reading, NOW) == PRINCIPAL


@pytest.mark.parametrize("changes", [
    {"source": "recorded"}, {"provider": "recorded"},
    {"fetched_at": NOW - timedelta(seconds=60)}, {"fetched_at": NOW + timedelta(seconds=1)},
])
def test_recorded_stale_or_future_football_evidence_cannot_pay(changes: dict) -> None:
    with pytest.raises(ApiError) as error:
        football_returned_payout(PRINCIPAL, "home", "fd-123", football_reading(**changes), NOW)
    assert error.value.code == "result_pending"


def test_a_result_for_another_fixture_cannot_pay() -> None:
    with pytest.raises(ApiError):
        football_returned_payout(PRINCIPAL, "home", "fd-124", football_reading(), NOW)


def test_a_scheduled_match_cannot_pay() -> None:
    reading = football_reading()
    reading = replace(reading, match=replace(reading.match, status="scheduled",
                                            home_score=None, away_score=None))
    with pytest.raises(ApiError) as error:
        football_returned_payout(PRINCIPAL, "home", "fd-123", reading, NOW)
    assert error.value.code == "result_pending"


def test_an_invalid_football_pick_cannot_pay() -> None:
    with pytest.raises(ApiError) as error:
        football_returned_payout(PRINCIPAL, "up", "fd-123", football_reading(), NOW)
    assert error.value.code == "invalid_transaction"
