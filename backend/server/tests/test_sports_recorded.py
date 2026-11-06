"""Recorded fixtures have real historical results, distinct ids and explicit timezone conversion."""

from datetime import UTC, datetime

from server.sports.recorded import load_recorded_matches
from server.sports.rules import outcome, picking_open


def test_real_opening_round_results_include_a_home_win_away_win_and_draw():
    matches = load_recorded_matches()
    assert [(m.home, m.away, m.home_score, m.away_score) for m in matches] == [
        ("Burnley FC", "Manchester City FC", 0, 3),
        ("Arsenal FC", "Nottingham Forest FC", 2, 1),
        ("AFC Bournemouth", "West Ham United FC", 1, 1),
    ]
    assert [outcome(m) for m in matches] == ["away", "home", "draw"]
    assert len({m.id for m in matches}) == 3
    assert all(m.id.startswith("recorded-") for m in matches)


def test_recorded_times_are_historical_and_never_open_for_real_picks():
    matches = load_recorded_matches()
    assert matches[0].kickoff == datetime(2023, 8, 11, 19, tzinfo=UTC)
    assert not any(picking_open(m, datetime(2026, 11, 6, tzinfo=UTC)) for m in matches)
