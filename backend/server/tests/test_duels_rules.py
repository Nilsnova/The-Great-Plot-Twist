"""Tests for duels/rules.py: the signals, the oil, the choices, the payout and the fairness checks.

Everything here is pure: no network, no database, no clock of its own. The fixed numbers used
again and again are the worked example of the spec (specs/A7-lantern-duels.md, section 2):
5 rounds, 100 coins each. The challenger seals Flash, Shade, Shade, Mirror, Shade and the
answerer seals Mirror, Flash, Shade, Shade, Mirror. The score is 1 to 3 for the answerer.
"""

from datetime import UTC, datetime
from itertools import product
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from server.app import create_app
from server.duels import rules
from server.duels.rules import (
    ANSWER_HOURS,
    BEATS,
    CUT_PERCENT,
    MAX_WAITING,
    OIL_COST,
    PAIR_DAILY_LIMIT,
    ROUND_CHOICES,
    SIGNALS,
    STAKE_CHOICES,
    DuelRuleRefused,
    Resolution,
    all_valid_sequences,
    check_choices,
    check_sequence,
    coins_change,
    duel_day_start,
    duel_ref,
    oil_for,
    resolve,
    round_point,
    sequence_cost,
    winner_takes,
)
from server.tests.helpers import CONFIGURED_SETTINGS, assert_error
from server.wallet import MAX_REF_LENGTH, validate_transaction

CHALLENGER_SIGNALS = ("flash", "shade", "shade", "mirror", "shade")
ANSWERER_SIGNALS = ("mirror", "flash", "shade", "shade", "mirror")
THREE_ROUNDS = ("flash", "shade", "shade")
THREE_ROUNDS_BACK = ("shade", "flash", "shade")

DUEL_ID = "6f1c0c2e-9a52-4b8e-8d3a-0a7c3f1d2b44"


def swapped(resolution: Resolution) -> tuple:
    """What the same duel looks like from the other side of the table."""
    swap = {"challenger": "opponent", "opponent": "challenger", "even": "even", "draw": "draw"}
    return (
        tuple(swap[result] for result in resolution.round_results),
        resolution.opponent_points,
        resolution.challenger_points,
        swap[resolution.outcome],
    )


def pairs_that_do_not_swap(rounds: int) -> list:
    """Every pair of allowed sequences where swapping the captains does not swap the result."""
    sequences = all_valid_sequences(rounds)
    offenders = []
    for first, second in product(sequences, sequences):
        forward = resolve(first, second)
        backward = resolve(second, first)
        mirrored = (
            forward.round_results,
            forward.challenger_points,
            forward.opponent_points,
            forward.outcome,
        )
        if mirrored != swapped(backward):
            offenders.append((first, second))
    return offenders


def sequences_with_the_wrong_cost(rounds: int) -> list:
    """Sequences that are allowed but cost too much, or refused although they fit the oil."""
    allowed = set(all_valid_sequences(rounds))
    wrong = []
    for sequence in product(SIGNALS, repeat=rounds):
        fits = sequence_cost(sequence) <= oil_for(rounds)
        if fits != (sequence in allowed):
            wrong.append(sequence)
    return wrong


def unbeatable_sequences(rounds: int) -> list:
    """Allowed sequences that no other allowed sequence beats."""
    sequences = all_valid_sequences(rounds)
    unbeaten = []
    for sequence in sequences:
        beaten = any(resolve(sequence, other).outcome == "opponent" for other in sequences)
        if not beaten:
            unbeaten.append(sequence)
    return unbeaten


# --- the signals ---


@pytest.mark.parametrize(
    ("challenger_signal", "opponent_signal", "point"),
    [
        ("flash", "shade", "challenger"),
        ("shade", "mirror", "challenger"),
        ("mirror", "flash", "challenger"),
        ("shade", "flash", "opponent"),
        ("mirror", "shade", "opponent"),
        ("flash", "mirror", "opponent"),
        ("flash", "flash", "even"),
        ("shade", "shade", "even"),
        ("mirror", "mirror", "even"),
    ],
)
def test_flash_beats_shade_shade_beats_mirror_mirror_beats_flash(
    challenger_signal, opponent_signal, point
):
    assert round_point(challenger_signal, opponent_signal) == point


@pytest.mark.parametrize("signal", SIGNALS)
def test_the_same_signal_scores_for_nobody(signal):
    assert round_point(signal, signal) == "even"


def test_the_three_signals_are_flash_shade_and_mirror():
    assert SIGNALS == ("flash", "shade", "mirror")


def test_every_signal_beats_exactly_one_other_signal():
    assert BEATS == {"flash": "shade", "shade": "mirror", "mirror": "flash"}


# --- the oil ---


@pytest.mark.parametrize(("rounds", "oil"), [(3, 3), (5, 5)])
def test_oil_is_the_number_of_rounds(rounds, oil):
    assert oil_for(rounds) == oil


@pytest.mark.parametrize(("signal", "cost"), [("flash", 2), ("mirror", 1), ("shade", 0)])
def test_flash_costs_2_mirror_1_shade_0(signal, cost):
    assert OIL_COST[signal] == cost
    assert sequence_cost((signal,)) == cost


def test_the_cost_of_a_sequence_is_the_sum_of_its_signals():
    assert sequence_cost(CHALLENGER_SIGNALS) == 3
    assert sequence_cost(ANSWERER_SIGNALS) == 4


def test_a_sequence_over_the_oil_is_refused():
    too_much = ("flash", "flash", "mirror", "mirror", "shade")  # costs 6 of 5

    with pytest.raises(DuelRuleRefused) as caught:
        check_sequence(too_much, 5)

    assert caught.value.status_code == 422
    assert caught.value.code == "not_enough_oil"


@pytest.mark.parametrize(
    ("signals", "rounds"),
    [
        (("flash", "shade"), 3),
        (("flash", "shade", "shade", "shade"), 3),
        (("shade", "shade", "shade"), 5),
        ((), 3),
    ],
)
def test_a_sequence_with_the_wrong_number_of_signals_is_refused(signals, rounds):
    with pytest.raises(DuelRuleRefused) as caught:
        check_sequence(signals, rounds)

    assert caught.value.status_code == 422
    assert caught.value.code == "wrong_signal_count"


def test_the_signal_count_is_checked_before_the_oil():
    with pytest.raises(DuelRuleRefused) as caught:
        check_sequence(("flash", "flash", "flash", "flash"), 3)

    assert caught.value.code == "wrong_signal_count"


@pytest.mark.parametrize(
    ("signals", "rounds"),
    [
        (("flash", "mirror", "shade"), 3),  # costs exactly 3 of 3
        (("shade", "shade", "shade"), 3),
        (CHALLENGER_SIGNALS, 5),
        (ANSWERER_SIGNALS, 5),  # costs 4 of 5
    ],
)
def test_a_sequence_within_the_oil_is_accepted(signals, rounds):
    check_sequence(signals, rounds)


def test_a_refused_sequence_is_an_error_in_the_standard_shape():
    error = DuelRuleRefused(422, "not_enough_oil", "Too much oil.")

    assert (error.status_code, error.code) == (422, "not_enough_oil")


# --- the choices ---


def test_only_3_or_5_rounds_and_the_five_stakes_are_allowed():
    assert ROUND_CHOICES == (3, 5)
    assert STAKE_CHOICES == (0, 10, 25, 50, 100)


@pytest.mark.parametrize(("rounds", "stake"), list(product(ROUND_CHOICES, STAKE_CHOICES)))
def test_every_agreed_choice_is_accepted(rounds, stake):
    check_choices(rounds, stake)


@pytest.mark.parametrize("rounds", [0, 1, 2, 4, 6, 10, -3, True])
def test_other_numbers_of_rounds_are_refused(rounds):
    with pytest.raises(DuelRuleRefused) as caught:
        check_choices(rounds, 0)

    assert (caught.value.status_code, caught.value.code) == (422, "bad_rounds")


@pytest.mark.parametrize("stake", [-10, 1, 5, 30, 99, 101, 1000, False, True])
def test_other_stakes_are_refused(stake):
    with pytest.raises(DuelRuleRefused) as caught:
        check_choices(3, stake)

    assert (caught.value.status_code, caught.value.code) == (422, "bad_stake")


def test_the_cut_is_5_percent_and_the_other_numbers_are_the_agreed_ones():
    assert CUT_PERCENT == 5
    assert ANSWER_HOURS == 24
    assert MAX_WAITING == 3
    assert PAIR_DAILY_LIMIT == 3


# --- resolving a duel ---


def test_the_worked_example_ends_1_to_3():
    resolution = resolve(CHALLENGER_SIGNALS, ANSWERER_SIGNALS)

    assert resolution == Resolution(
        round_results=("opponent", "opponent", "even", "opponent", "challenger"),
        challenger_points=1,
        opponent_points=3,
        outcome="opponent",
    )


def test_equal_points_are_a_draw():
    resolution = resolve(
        THREE_ROUNDS, THREE_ROUNDS_BACK
    )  # Flash, Shade, Shade against Shade, Flash, Shade

    assert resolution.round_results == ("challenger", "opponent", "even")
    assert (resolution.challenger_points, resolution.opponent_points) == (1, 1)
    assert resolution.outcome == "draw"


def test_more_rounds_won_wins_for_the_challenger_too():
    resolution = resolve(ANSWERER_SIGNALS, CHALLENGER_SIGNALS)

    assert resolution.outcome == "challenger"
    assert (resolution.challenger_points, resolution.opponent_points) == (3, 1)


def test_a_duel_of_only_equal_signals_is_a_draw_with_no_points():
    resolution = resolve(("shade", "shade", "shade"), ("shade", "shade", "shade"))

    assert resolution.round_results == ("even", "even", "even")
    assert (resolution.challenger_points, resolution.opponent_points) == (0, 0)
    assert resolution.outcome == "draw"


def test_two_sequences_of_different_length_cannot_be_resolved():
    with pytest.raises(ValueError):
        resolve(THREE_ROUNDS, CHALLENGER_SIGNALS)


def test_a_resolution_cannot_be_changed_afterwards():
    resolution = resolve(THREE_ROUNDS, THREE_ROUNDS_BACK)

    with pytest.raises(AttributeError):
        resolution.outcome = "challenger"


# --- fairness (the script of the spec, section 3, repeated as tests) ---


@pytest.mark.parametrize(("rounds", "count"), [(3, 17), (5, 147)])
def test_there_are_17_sequences_of_3_rounds_and_147_of_5(rounds, count):
    assert len(all_valid_sequences(rounds)) == count


@pytest.mark.parametrize("rounds", [3, 5])
def test_every_allowed_sequence_fits_the_oil_and_none_is_missing(rounds):
    assert sequences_with_the_wrong_cost(rounds) == []


@pytest.mark.parametrize("rounds", [3, 5])
def test_swapping_the_captains_swaps_the_result(rounds):
    assert pairs_that_do_not_swap(rounds) == []


@pytest.mark.parametrize("rounds", [3, 5])
def test_no_sequence_is_unbeatable(rounds):
    assert unbeatable_sequences(rounds) == []


# --- the coins ---


@pytest.mark.parametrize(("stake", "takes"), [(10, 19), (25, 47), (50, 95), (100, 190)])
def test_the_winner_takes_19_47_95_or_190(stake, takes):
    assert winner_takes(stake, CUT_PERCENT) == takes


def test_the_payout_is_rounded_down_by_whole_coins():
    assert winner_takes(25, 5) == 47  # 2 x 25 x 95 / 100 = 47.5, rounded down


def test_a_cut_of_zero_gives_the_winner_the_whole_pot():
    assert winner_takes(50, 0) == 100


@pytest.mark.parametrize("outcome", ["challenger", "opponent", "draw"])
@pytest.mark.parametrize("role", ["challenger", "opponent"])
def test_a_friendly_duel_moves_no_coins(outcome, role):
    assert winner_takes(0, CUT_PERCENT) == 0
    assert coins_change(0, CUT_PERCENT, outcome, role) == 0


@pytest.mark.parametrize("stake", [10, 25, 50, 100])
@pytest.mark.parametrize("role", ["challenger", "opponent"])
def test_a_draw_returns_every_stake(stake, role):
    assert coins_change(stake, CUT_PERCENT, "draw", role) == 0


def test_the_winner_gains_and_the_loser_loses_the_stake():
    assert coins_change(100, CUT_PERCENT, "opponent", "opponent") == 90
    assert coins_change(100, CUT_PERCENT, "opponent", "challenger") == -100


@pytest.mark.parametrize(("stake", "cut"), [(10, 1), (25, 3), (50, 5), (100, 10)])
@pytest.mark.parametrize("winner", ["challenger", "opponent"])
def test_a_decided_duel_takes_only_the_cut_out_of_the_game(stake, cut, winner):
    total = coins_change(stake, CUT_PERCENT, winner, "challenger") + coins_change(
        stake, CUT_PERCENT, winner, "opponent"
    )

    assert total == -cut


@pytest.mark.parametrize("stake", STAKE_CHOICES)
@pytest.mark.parametrize("outcome", ["challenger", "opponent", "draw"])
def test_duels_never_create_coins(stake, outcome):
    total = coins_change(stake, CUT_PERCENT, outcome, "challenger") + coins_change(
        stake, CUT_PERCENT, outcome, "opponent"
    )

    assert total <= 0
    assert total == 0 or outcome != "draw"


def test_the_duel_ref_fits_into_a_wallet_ref():
    ref = duel_ref(str(UUID(DUEL_ID)))

    assert ref == f"duel:{DUEL_ID}"
    assert len(ref) == 41
    assert len(ref) <= MAX_REF_LENGTH


def test_the_wallet_accepts_the_duel_ref_for_both_arena_reasons():
    ref = duel_ref(DUEL_ID)

    validate_transaction(-100, "arena_stake", ref)
    validate_transaction(190, "arena_payout", ref)


# --- the Lisbon day for the daily limit between two captains ---


@pytest.mark.parametrize(
    ("now", "day_start"),
    [
        # Winter: Lisbon is on UTC, so the day starts at 00:00 UTC.
        (datetime(2026, 11, 6, 14, 0, tzinfo=UTC), datetime(2026, 11, 6, 0, 0, tzinfo=UTC)),
        (datetime(2026, 11, 6, 0, 0, tzinfo=UTC), datetime(2026, 11, 6, 0, 0, tzinfo=UTC)),
        (datetime(2026, 11, 6, 23, 59, tzinfo=UTC), datetime(2026, 11, 6, 0, 0, tzinfo=UTC)),
        # Summer: Lisbon is on UTC+1, so its midnight is 23:00 UTC the evening before.
        (datetime(2026, 7, 1, 12, 0, tzinfo=UTC), datetime(2026, 6, 30, 23, 0, tzinfo=UTC)),
        (datetime(2026, 7, 1, 0, 30, tzinfo=UTC), datetime(2026, 6, 30, 23, 0, tzinfo=UTC)),
    ],
)
def test_the_duel_day_starts_at_00_00_lisbon_time(now, day_start):
    assert duel_day_start(now) == day_start


@pytest.mark.parametrize(
    ("now", "day_start"),
    [
        # The clocks go back at 01:00 UTC on Sunday 25 Oct 2026. Before that, Lisbon is on UTC+1.
        (datetime(2026, 10, 25, 0, 30, tzinfo=UTC), datetime(2026, 10, 24, 23, 0, tzinfo=UTC)),
        # After the change the day that began at 23:00 UTC is still the same Lisbon day.
        (datetime(2026, 10, 25, 5, 0, tzinfo=UTC), datetime(2026, 10, 24, 23, 0, tzinfo=UTC)),
        # The next day begins at 00:00 UTC, because Lisbon is back on UTC.
        (datetime(2026, 10, 26, 0, 30, tzinfo=UTC), datetime(2026, 10, 26, 0, 0, tzinfo=UTC)),
    ],
)
def test_the_duel_day_starts_at_lisbon_midnight_also_on_the_october_clock_change(now, day_start):
    assert duel_day_start(now) == day_start


def test_the_duel_day_start_is_a_utc_time_not_after_now():
    now = datetime(2026, 11, 6, 14, 0, tzinfo=UTC)

    start = duel_day_start(now)

    assert start.utcoffset().total_seconds() == 0
    assert start <= now


def test_the_timezone_of_the_duel_day_is_lisbon():
    assert rules.DUEL_DAY_TIMEZONE_NAME == "Europe/Lisbon"


# --- a rule that is refused travels in the standard error shape ---


@pytest.fixture
def client_with_a_refused_choice():
    app = create_app(CONFIGURED_SETTINGS)

    @app.get("/api/test/bad-rounds")
    async def bad_rounds() -> None:
        check_choices(4, 0)

    return TestClient(app)


def test_a_refused_choice_is_answered_in_the_standard_error_shape(client_with_a_refused_choice):
    response = client_with_a_refused_choice.get("/api/test/bad-rounds")

    assert_error(response, 422, "bad_rounds")
