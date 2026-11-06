"""Prediction desk refusals: the plain-English errors of the desk, each with its own code.

Every function builds an ApiError (errors.py), so a route that lets it escape answers in the
standard error shape. The sentences are the ones in the contract at the top of
routes/predictions.py. None of them holds a secret or a player id.

Used by: desk.py and the tests.
"""

from datetime import datetime

from server.errors import ApiError
from server.predictions.pools import VOID
from server.predictions.stake_rules import DAILY_STAKE_CAP
from server.predictions.store import PoolRow, SettleOutcome, StakeOutcome
from server.supabase_admin import AlreadyApplied, SupabaseRejected


class AlreadyDone(AlreadyApplied):
    """The 409 already_applied, with a message that says what was done already."""

    def __init__(self, message: str) -> None:
        ApiError.__init__(self, 409, "already_applied", message)


def coins_text(coins: int) -> str:
    return "1 coin" if coins == 1 else f"{coins} coins"


def utc_text(moment: datetime) -> str:
    """A time for a message, such as Thu 17 Dec 12:00 UTC."""
    return f"{moment:%a} {moment.day} {moment:%b %H:%M} UTC"


def pool_open(closes_at: datetime) -> ApiError:
    """The error for settling yes or no while staking is still open."""
    return ApiError(
        409,
        "pool_open",
        f"Staking is open until {utc_text(closes_at)}. Settle it after that, or void it.",
    )


def no_such_question() -> ApiError:
    return ApiError(404, "no_such_question", "That question is not on the prediction desk.")


def pool_closed(on_manifold: bool = False) -> ApiError:
    where = " on Manifold" if on_manifold else ""
    return ApiError(409, "pool_closed", f"Staking on this question has closed{where}.")


def settled_message(pool: PoolRow | None) -> str:
    """The sentence for a pool that was settled already, naming how it ended."""
    start = "This question was settled already"
    if pool is None or pool.outcome is None:
        return start + "."
    if pool.outcome == VOID:
        return start + ": it was void, and everybody got their coins back."
    return f"{start}: {pool.outcome.upper()} won."


def stake_refusal(outcome: StakeOutcome) -> ApiError:
    """The error for a stake that a rule in the database refused. Nothing was changed."""
    if outcome.reason == "pool_closed":
        return pool_closed()
    if outcome.reason == "already_staked":
        return ApiError(
            409,
            "already_staked",
            f"You already staked {coins_text(outcome.amount)} on {outcome.side.upper()} "
            "for this question. One stake per question.",
        )
    if outcome.reason == "daily_cap":
        return ApiError(
            409,
            "daily_stake_cap",
            f"You can stake at most {DAILY_STAKE_CAP} coins a day at the desk. "
            f"You can still stake {coins_text(outcome.coins_left)} today.",
        )
    return SupabaseRejected()  # a reason we do not know: the database and the server disagree


def settle_refusal(outcome: SettleOutcome) -> ApiError:
    """The error for a settlement that a rule in the database refused. Nothing was changed."""
    if outcome.reason == "pool_open" and outcome.closes_at is not None:
        return pool_open(outcome.closes_at)
    if outcome.reason == "stakes_changed":
        return ApiError(
            409, "stakes_changed", "The pool changed while it was being settled. Try again."
        )
    return SupabaseRejected()  # a reason we do not know: the database and the server disagree
