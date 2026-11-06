"""Tests for predictions/manifold.py: reading one Manifold market into a MarketState.

Nothing here uses the network. The answers are the real recordings and samples in
backend/content/predictions/, and a FakeManifold (an httpx.MockTransport) plays Manifold.
"""

import asyncio
import logging
from datetime import UTC, datetime

import httpx
import pytest

from server.predictions.manifold import (
    MANIFOLD_API,
    TIMEOUT_SECONDS,
    ManifoldAnswerError,
    MarketState,
    fetch_market,
    parse_market,
)
from server.tests.prediction_helpers import (
    SAMPLE_CANCEL,
    SAMPLE_CASH,
    SAMPLE_MKT,
    SAMPLE_NO,
    SAMPLE_YES,
    FakeManifold,
    recorded_answer,
    recording_names,
    sample_answer,
    sample_names,
)

OPEN_MARKET = "q68phStPls"  # the warmest-year question: open, binary, MANA


def good_answer(**changes) -> dict:
    """A valid open market. A test changes one field and keeps the rest."""
    answer = {
        "id": "abc123xyz",
        "slug": "will-it-happen",
        "question": "Will it happen?",
        "outcomeType": "BINARY",
        "mechanism": "cpmm-1",
        "token": "MANA",
        "closeTime": 1798761540000,
        "isResolved": False,
    }
    answer.update(changes)
    return answer


def parse(answer, expected_id: str = "abc123xyz") -> MarketState:
    return parse_market(answer, expected_id)


def fetch(market_id: str, fake: FakeManifold) -> MarketState:
    return asyncio.run(fetch_market(market_id, fake.transport))


# --- the saved answers ---


@pytest.mark.parametrize("name", recording_names())
def test_every_recorded_answer_parses(name):
    state = parse_market(recorded_answer(name), name)

    assert state.market_id == name
    assert state.is_resolved is False
    assert state.decided_as is None


@pytest.mark.parametrize("name", [SAMPLE_YES, SAMPLE_NO, SAMPLE_CANCEL, SAMPLE_MKT])
def test_every_resolved_sample_parses(name):
    assert parse_market(sample_answer(name), name).is_resolved is True


def test_the_list_of_samples_is_the_four_resolved_ones_and_the_edited_copy():
    assert sample_names() == sorted([SAMPLE_YES, SAMPLE_NO, SAMPLE_CANCEL, SAMPLE_MKT, SAMPLE_CASH])


@pytest.mark.parametrize(
    ("name", "decided_as"),
    [(SAMPLE_YES, "yes"), (SAMPLE_NO, "no"), (SAMPLE_CANCEL, "void"), (SAMPLE_MKT, "void")],
)
def test_yes_no_cancel_and_mkt_become_yes_no_void_and_void(name, decided_as):
    assert parse_market(sample_answer(name), name).decided_as == decided_as


def test_the_edited_sample_with_a_cash_token_is_refused():
    with pytest.raises(ManifoldAnswerError, match="play money"):
        parse_market(sample_answer(SAMPLE_CASH), SAMPLE_YES)


# --- what a market state holds ---


def test_milliseconds_since_1970_become_a_utc_time():
    state = parse(good_answer(closeTime=1798761540000))

    assert state.closes_at == datetime(2026, 12, 31, 23, 59, tzinfo=UTC)
    assert state.closes_at.tzinfo is UTC


def test_the_resolution_time_becomes_a_utc_time_too():
    state = parse(good_answer(isResolved=True, resolution="YES", resolutionTime=1788826249594))

    assert state.decided_at == datetime(2026, 9, 8, 0, 10, 49, 594000, tzinfo=UTC)


def test_an_unresolved_market_has_no_decision_and_no_decision_time():
    state = parse(good_answer())

    assert state.is_resolved is False
    assert state.decided_as is None
    assert state.decided_at is None


def test_an_unresolved_market_ignores_a_stray_resolution_field():
    state = parse(good_answer(resolution="YES"))

    assert state.decided_as is None


def test_a_market_without_a_close_time_has_none():
    answer = good_answer()
    del answer["closeTime"]

    assert parse(answer).closes_at is None


def test_a_whole_number_written_with_a_decimal_point_is_accepted():
    assert parse(good_answer(closeTime=1798761540000.0)).closes_at.year == 2026


def test_a_resolved_market_without_a_resolution_time_has_no_decision_time():
    answer = good_answer(isResolved=True, resolution="NO")

    state = parse(answer)

    assert state.decided_as == "no"
    assert state.decided_at is None


def test_a_missing_token_counts_as_play_money():
    answer = good_answer()
    del answer["token"]

    assert parse(answer).market_id == "abc123xyz"


def test_a_state_holds_only_our_own_words_and_none_of_the_price():
    state = parse({**good_answer(), **{"probability": 0.77, "pool": {"YES": 1}}})

    assert set(vars(state)) == {"market_id", "closes_at", "is_resolved", "decided_as", "decided_at"}


@pytest.mark.parametrize("resolution", ["CANCEL", "MKT", "PARTIAL", "yes", "", "SOMETHING_NEW"])
def test_everything_that_is_not_exactly_yes_or_no_is_void(resolution):
    state = parse(good_answer(isResolved=True, resolution=resolution))

    assert state.decided_as == "void"


# --- answers that are refused ---


def test_an_answer_that_is_not_an_object_is_refused():
    with pytest.raises(ManifoldAnswerError, match="not an object"):
        parse([1, 2, 3])


def test_an_answer_for_another_market_is_refused():
    with pytest.raises(ManifoldAnswerError, match="another market"):
        parse(good_answer(id="somebody-else"))


@pytest.mark.parametrize("outcome_type", ["MULTIPLE_CHOICE", "NUMERIC", "POLL", "binary", None])
def test_a_market_that_is_not_binary_is_refused(outcome_type):
    with pytest.raises(ManifoldAnswerError, match="BINARY"):
        parse(good_answer(outcomeType=outcome_type))


def test_a_cash_market_is_refused_because_it_is_not_play_money():
    with pytest.raises(ManifoldAnswerError, match="play money"):
        parse(good_answer(token="CASH"))


def test_a_token_we_do_not_know_is_refused_too():
    with pytest.raises(ManifoldAnswerError, match="play money"):
        parse(good_answer(token="SPICE"))


@pytest.mark.parametrize("is_resolved", [None, 1, 0, "true", "false", []])
def test_is_resolved_must_be_true_or_false(is_resolved):
    with pytest.raises(ManifoldAnswerError, match="isResolved"):
        parse(good_answer(isResolved=is_resolved))


def test_a_missing_is_resolved_is_refused():
    answer = good_answer()
    del answer["isResolved"]

    with pytest.raises(ManifoldAnswerError, match="isResolved"):
        parse(answer)


@pytest.mark.parametrize("close_time", [1798761540000.5, "1798761540000", True, [1], {}, 1e400])
def test_a_close_time_that_is_not_a_whole_number_is_refused(close_time):
    with pytest.raises(ManifoldAnswerError, match="closeTime"):
        parse(good_answer(closeTime=close_time))


def test_a_close_time_that_cannot_be_a_date_is_refused():
    with pytest.raises(ManifoldAnswerError, match="closeTime"):
        parse(good_answer(closeTime=10**30))


@pytest.mark.parametrize("resolution", [None, 1, True, ["YES"]])
def test_a_resolved_market_whose_resolution_is_not_text_is_refused(resolution):
    with pytest.raises(ManifoldAnswerError, match="resolution"):
        parse(good_answer(isResolved=True, resolution=resolution))


def test_a_resolved_market_without_a_resolution_is_refused():
    with pytest.raises(ManifoldAnswerError, match="resolution"):
        parse(good_answer(isResolved=True))


def test_a_resolution_time_that_is_not_a_whole_number_is_refused():
    with pytest.raises(ManifoldAnswerError, match="resolutionTime"):
        parse(good_answer(isResolved=True, resolution="YES", resolutionTime="soon"))


def test_the_error_never_repeats_the_question_text_of_the_answer():
    answer = good_answer(question="A secret question", outcomeType="POLL")

    with pytest.raises(ManifoldAnswerError) as problem:
        parse(answer)

    assert "secret" not in str(problem.value)


# --- asking Manifold ---


def test_fetch_asks_for_the_market_by_its_id_and_reads_the_answer():
    fake = FakeManifold()

    state = fetch(OPEN_MARKET, fake)

    assert state.market_id == OPEN_MARKET
    assert state.closes_at == datetime(2026, 12, 31, 23, 59, tzinfo=UTC)
    assert fake.calls == 1
    request = fake.requests[0]
    assert request.method == "GET"
    assert str(request.url) == f"{MANIFOLD_API}/market/{OPEN_MARKET}"


def test_the_address_of_manifold_is_the_official_api():
    assert MANIFOLD_API == "https://api.manifold.markets/v0"


def test_fetch_sends_no_key_and_no_sign_in():
    fake = FakeManifold()

    fetch(OPEN_MARKET, fake)

    assert "authorization" not in fake.requests[0].headers
    assert "apikey" not in fake.requests[0].headers


def test_fetch_reads_a_resolved_market():
    fake = FakeManifold()
    fake.resolve(OPEN_MARKET, "YES")

    state = fetch(OPEN_MARKET, fake)

    assert (state.is_resolved, state.decided_as) == (True, "yes")


def test_the_price_in_the_answer_never_gets_into_the_state():
    fake = FakeManifold()

    state = fetch(OPEN_MARKET, fake)

    assert "0.77" not in repr(state)


@pytest.mark.parametrize("status", [429, 500, 502, 503, 404])
def test_a_failed_answer_raises(status):
    fake = FakeManifold()
    fake.status = status

    with pytest.raises(httpx.HTTPStatusError):
        fetch(OPEN_MARKET, fake)


def test_an_answer_that_is_not_json_raises():
    transport = httpx.MockTransport(lambda request: httpx.Response(200, text="<html>oops</html>"))

    with pytest.raises(ManifoldAnswerError, match="not JSON"):
        asyncio.run(fetch_market(OPEN_MARKET, transport))


def test_an_answer_for_another_market_raises():
    fake = FakeManifold()
    fake.answers[OPEN_MARKET]["id"] = "somebody-else"

    with pytest.raises(ManifoldAnswerError, match="another market"):
        fetch(OPEN_MARKET, fake)


def test_a_network_error_raises():
    def fail(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("pretend the network is gone", request=request)

    with pytest.raises(httpx.ConnectTimeout):
        asyncio.run(fetch_market(OPEN_MARKET, httpx.MockTransport(fail)))


@pytest.mark.parametrize(
    "market_id",
    ["a/b", "../etc/passwd", "abc?x=1", "abc#frag", "ab c", "", "marketé", "a" * 41, "id\n"],
)
def test_an_id_with_odd_characters_is_refused_before_any_request(market_id):
    fake = FakeManifold()

    with pytest.raises(ManifoldAnswerError, match="market id"):
        fetch(market_id, fake)

    assert fake.calls == 0


def test_the_timeout_is_three_seconds():
    assert TIMEOUT_SECONDS == 3.0


def test_nothing_of_the_answer_is_written_to_the_log(caplog):
    fake = FakeManifold()
    fake.answers[OPEN_MARKET]["outcomeType"] = "POLL"
    fake.answers[OPEN_MARKET]["question"] = "A secret question"

    with caplog.at_level(logging.DEBUG), pytest.raises(ManifoldAnswerError):
        fetch(OPEN_MARKET, fake)

    assert "secret" not in caplog.text
    assert "0.77" not in caplog.text
