"""Sports match rules: known results, strict scores and closing before kickoff; no I/O."""

from dataclasses import replace
from datetime import UTC, datetime, timedelta

import pytest

from server.sports.models import Match
from server.sports.rules import closes_at, outcome, picking_open, validate_pick

KICKOFF = datetime(2023, 8, 11, 19, tzinfo=UTC)


def fixture(**changes) -> Match:
    match = Match(
        "recorded-burnley-city", "football", "Premier League", "Burnley", "Manchester City",
        KICKOFF, "scheduled",
    )
    return replace(match, **changes)


@pytest.mark.parametrize("home,away,expected", [(3, 0, "home"), (0, 3, "away"), (1, 1, "draw")])
def test_regular_time_football_result(home, away, expected):
    assert outcome(fixture(status="finished", home_score=home, away_score=away)) == expected


@pytest.mark.parametrize("status", ["postponed", "cancelled", "suspended"])
def test_disrupted_matches_refund_even_without_scores(status):
    assert outcome(fixture(status=status)) == "void"


@pytest.mark.parametrize("status", ["scheduled", "playing", "unknown"])
def test_unfinished_or_unknown_matches_cannot_settle(status):
    assert outcome(fixture(status=status, home_score=0, away_score=0)) is None


def test_picking_closes_one_hour_before_kickoff_and_never_reopens_after_start():
    match = fixture()
    assert closes_at(match) == KICKOFF - timedelta(hours=1)
    assert picking_open(match, closes_at(match) - timedelta(microseconds=1))
    assert not picking_open(match, closes_at(match))
    assert not picking_open(match, KICKOFF)
    assert not picking_open(replace(match, status="playing"), KICKOFF - timedelta(days=1))


@pytest.mark.parametrize("value", [-1, 1.5, True, "3"])
def test_scores_must_be_nonnegative_whole_numbers(value):
    with pytest.raises(ValueError):
        fixture(status="finished", home_score=value, away_score=0)


def test_final_scores_are_required_and_basketball_cannot_end_in_a_draw():
    with pytest.raises(ValueError):
        fixture(status="finished")
    with pytest.raises(ValueError):
        fixture(sport="basketball", status="finished", home_score=90, away_score=90)


def test_timestamps_must_have_a_timezone():
    with pytest.raises(ValueError):
        fixture(kickoff=KICKOFF.replace(tzinfo=None))
    with pytest.raises(ValueError):
        picking_open(fixture(), KICKOFF.replace(tzinfo=None))


@pytest.mark.parametrize("sport,pick", [
    ("football", "home"), ("football", "draw"), ("football", "away"),
    ("basketball", "home"), ("basketball", "away"),
])
def test_only_the_sports_named_outcomes_are_valid_picks(sport, pick):
    validate_pick(fixture(sport=sport), pick)


@pytest.mark.parametrize("sport,pick", [
    ("football", "winner"), ("football", "HOME"), ("football", True), ("basketball", "draw"),
])
def test_invalid_picks_are_refused(sport, pick):
    with pytest.raises(ValueError):
        validate_pick(fixture(sport=sport), pick)
