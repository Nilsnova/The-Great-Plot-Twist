"""Lantern Duels rules: every number and rule of a duel, as plain functions.

Pure Python: no network, no database and no clock of its own. The tests check every rule with
fixed numbers (backend/server/tests/test_duels_rules.py).

The rules, in plain words
  * Signals. Each round, both captains show one signal at the same moment: flash, shade or
    mirror. Flash outshines Shade, Shade leaves Mirror nothing to throw back, and Mirror throws
    Flash back at its sender. The same signal on both sides scores for nobody.
  * Lantern oil. A duel gives each captain as much oil as it has rounds (3 or 5). Flash burns 2,
    Mirror 1 and Shade 0. A sequence that burns more oil than that is refused. This is "duel
    oil", not the windmill's lamp oil.
  * Sealed. Each captain seals ALL their signals at once. The challenger seals with the
    challenge, the other captain with the answer. The server opens both envelopes only when both
    are in. More rounds won wins the duel, and equal points are a draw.
  * Coins. A duel is friendly (stake 0) or both captains stake the same 10, 25, 50 or 100 coins.
    The winner takes the pot minus a cut of 5 %, rounded down to whole coins. A draw, a
    withdrawal, a decline and an expiry give every stake back. The cut is simply not paid out:
    it is the only coin sink of the duels, and duels never create coins.
  * Caps. A captain may have 3 challenges waiting, and two captains may play 3 staked duels
    with each other per day. The day starts at 00:00 Lisbon time.

Who enforces what: this file works out the numbers, and the service checks one request before it
asks the database. The rules that depend on earlier duels (the caps) are checked by the database
functions in the same step that moves the coins, because only the database sees two requests that
arrive at the same moment. They are given the limits below as arguments, so the numbers live in
one place: here. The database does not repeat the signal rules, but it checks everything that
follows from them (see duel_answer() in the migration).

Used by: views.py, store.py, refusals.py, service.py, routes/duels.py and the tests.
"""

import logging
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, time, tzinfo
from itertools import product
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from server.errors import ApiError

logger = logging.getLogger(__name__)

# --- The numbers that make the rules. Change them here and nowhere else. ---

SIGNALS = ("flash", "shade", "mirror")
BEATS = {"flash": "shade", "shade": "mirror", "mirror": "flash"}  # the key beats the value
OIL_COST = {"flash": 2, "mirror": 1, "shade": 0}
OIL_PER_ROUND = 1  # a duel gives as much oil as it has rounds
ROUND_CHOICES = (3, 5)
STAKE_CHOICES = (0, 10, 25, 50, 100)  # 0 is a friendly duel
CUT_PERCENT = 5
ANSWER_HOURS = 24
MAX_WAITING = 3  # challenges one captain may have waiting at the same time
PAIR_DAILY_LIMIT = 3  # staked duels between the same two captains per day
DUEL_DAY_TIMEZONE_NAME = "Europe/Lisbon"  # the pair limit counts from 00:00 there
SWEEP_LIMIT = 5  # expired duels refunded per request at most
MY_DUELS_LIMIT = 20  # own duels read for one list
OPEN_CHALLENGES_LIMIT = 10
RECENT_LIMIT = 10
REF_PREFIX = "duel:"

# The five statuses of a duel. A duel starts "open" and ends in one of the other four, once.
OPEN = "open"
FINISHED = "finished"  # answered: both envelopes opened, the coins settled
WITHDRAWN = "withdrawn"  # the challenger stepped back
DECLINED = "declined"  # the named captain said no
EXPIRED = "expired"  # nobody answered within ANSWER_HOURS
STATUSES = (OPEN, FINISHED, WITHDRAWN, DECLINED, EXPIRED)

# The words for who took a round, and for how a duel ended. The database uses the same words.
CHALLENGER = "challenger"
OPPONENT = "opponent"
EVEN = "even"  # a round that scored for nobody
DRAW = "draw"  # a duel with equal points


def load_duel_timezone() -> tzinfo:
    """The timezone of the duel day (Lisbon). Falls back to UTC if the server has no tz data.

    Lisbon is on UTC+0 in winter, so UTC gives the same midnight from the end of October to the
    end of March, which covers the whole class game. Only in summer would the fallback be one
    hour off.
    """
    try:
        return ZoneInfo(DUEL_DAY_TIMEZONE_NAME)
    except ZoneInfoNotFoundError:
        logger.warning("No timezone database on this server: the duel day uses UTC.")
        return UTC


DUEL_TIMEZONE = load_duel_timezone()


class DuelRuleRefused(ApiError):
    """A choice or a sequence the rules do not allow. Nothing was changed.

    It is an ApiError, so a route that lets it escape answers in the standard error shape.
    """


@dataclass(frozen=True)
class Resolution:
    """How a duel ended: who took each round, the points, and the outcome."""

    round_results: tuple[str, ...]  # one of CHALLENGER, OPPONENT or EVEN for every round
    challenger_points: int
    opponent_points: int
    outcome: str  # CHALLENGER, OPPONENT or DRAW


def oil_for(rounds: int) -> int:
    """The lantern oil each captain gets in a duel of `rounds` rounds."""
    return rounds * OIL_PER_ROUND


def sequence_cost(signals: Sequence[str]) -> int:
    """The oil a sequence of signals burns."""
    return sum(OIL_COST[signal] for signal in signals)


def check_choices(rounds: int, stake: int) -> None:
    """The rounds must be one of ROUND_CHOICES and the stake one of STAKE_CHOICES."""
    # bool is a kind of int in Python (False == 0), so it needs its own check.
    if isinstance(rounds, bool) or rounds not in ROUND_CHOICES:
        raise DuelRuleRefused(422, "bad_rounds", "A duel has 3 or 5 rounds.")
    if isinstance(stake, bool) or stake not in STAKE_CHOICES:
        allowed = ", ".join(str(choice) for choice in STAKE_CHOICES)
        raise DuelRuleRefused(422, "bad_stake", f"The stake must be one of {allowed} coins.")


def check_sequence(signals: Sequence[str], rounds: int) -> None:
    """One signal for every round, and no more oil burned than the duel gives."""
    if len(signals) != rounds:
        raise DuelRuleRefused(
            422, "wrong_signal_count", f"Seal exactly {rounds} signals, one for each round."
        )
    if sequence_cost(signals) > oil_for(rounds):
        raise DuelRuleRefused(
            422,
            "not_enough_oil",
            f"Those signals burn more than the {oil_for(rounds)} oil you have.",
        )


def round_point(challenger_signal: str, opponent_signal: str) -> str:
    """Who takes one round: CHALLENGER, OPPONENT or EVEN."""
    if challenger_signal == opponent_signal:
        return EVEN
    if BEATS[challenger_signal] == opponent_signal:
        return CHALLENGER
    return OPPONENT


def resolve(challenger_signals: Sequence[str], opponent_signals: Sequence[str]) -> Resolution:
    """Open both envelopes: the result of every round, the points and the outcome."""
    results = tuple(
        round_point(challenger_signal, opponent_signal)
        for challenger_signal, opponent_signal in zip(
            challenger_signals, opponent_signals, strict=True
        )
    )
    challenger_points = results.count(CHALLENGER)
    opponent_points = results.count(OPPONENT)
    if challenger_points > opponent_points:
        outcome = CHALLENGER
    elif opponent_points > challenger_points:
        outcome = OPPONENT
    else:
        outcome = DRAW
    return Resolution(results, challenger_points, opponent_points, outcome)


def winner_takes(stake: int, cut_percent: int) -> int:
    """What the winner is paid: the pot minus the cut, in whole coins rounded down.

    Example: stake 25 from each captain is a pot of 50. 95 % of 50 is 47.5, so the winner takes 47.
    The database function duel_answer() works it out the same way (integer division).
    """
    return (2 * stake * (100 - cut_percent)) // 100


def coins_change(stake: int, cut_percent: int, outcome: str, role: str) -> int:
    """A captain's net coins from a decided duel. `role` is CHALLENGER or OPPONENT.

    A friendly duel and a draw change nothing. The winner gains the payout minus their own
    stake, and the loser loses their stake. The two captains' changes add up to minus the cut.
    """
    if stake == 0 or outcome == DRAW:
        return 0
    if outcome == role:
        return winner_takes(stake, cut_percent) - stake
    return -stake


def duel_day_start(now: datetime) -> datetime:
    """The latest 00:00 Lisbon time that is not after `now`, as a UTC time."""
    local_now = now.astimezone(DUEL_TIMEZONE)
    start = datetime.combine(local_now.date(), time(0), tzinfo=DUEL_TIMEZONE)
    return start.astimezone(UTC)


def duel_ref(duel_id: str) -> str:
    """The ledger ref of every coin movement of one duel: "duel:" and the duel id."""
    return f"{REF_PREFIX}{duel_id}"


def all_valid_sequences(rounds: int) -> list[tuple[str, ...]]:
    """Every sequence of signals that fits the oil of a duel of `rounds` rounds (for the tests)."""
    return [
        sequence
        for sequence in product(SIGNALS, repeat=rounds)
        if sequence_cost(sequence) <= oil_for(rounds)
    ]
