"""Question state: what state a question is in right now, and may a captain stake on it.

Pure Python: a Question, the latest reading from Manifold, the pool row and the time go in; the
state comes out. No network, no database and no clock of its own, so the tests can check every
case with fixed times (backend/server/tests/test_prediction_state.py).

The rules, in plain words
  * A reading is REAL when it is live, cached or stale: it came from Manifold, however long ago.
    The recording (source "fallback") is not real, because the market may have been decided since
    it was made. In demo mode (DEMO_MODE=true) the server never calls Manifold, so there the
    recording counts as the reading.
  * What Manifold says (manifold.state): "decided" when the market is resolved, "closed" when its
    closing time is now or earlier, "open" otherwise. With no real reading it is "unknown".
  * The effective closing time is the earliest of every closing time we know: the one in the list of
    questions, Manifold's own (from a real reading), the moment Manifold decided, and the one stored
    in the pool. The database never changes the stored one, so it never moves later.
  * The status of a question: "settled" once its pool is settled, "closed" when the effective
    closing time has passed or Manifold has closed or decided the market, otherwise "open".
  * A captain may stake only when the status is "open" AND Manifold says "open": a recording is
    never enough, because nobody can tell from it whether the market is still open.
  * A stale reading that is older than STALE_LIMIT_FOR_STAKE (15 minutes) is too old to stake on:
    Manifold may have decided the market since, and the news may be public already. The old reading
    is still shown, and it still limits what a host may settle. In demo mode the recording is never
    "stale", so the limit does not apply there.

Used by: desk.py (the list, a stake and a settlement) and the tests.
"""

from dataclasses import dataclass
from datetime import datetime

from server.adapters.base import SourceResult
from server.predictions.manifold import MarketState
from server.predictions.questions import Question
from server.predictions.stake_rules import (
    STALE_LIMIT_FOR_STAKE,
    effective_closes_at,
    is_staking_open,
)
from server.predictions.store import PoolRow

# What Manifold says about a market. These words are in the answer of GET /api/predictions.
OPEN = "open"
CLOSED = "closed"
DECIDED = "decided"
UNKNOWN = "unknown"

# The status of a question.
SETTLED = "settled"

# The readings that really came from Manifold. "fallback" is the recording. "stale" is the last good
# answer, kept when Manifold cannot be reached.
STALE = "stale"
REAL_SOURCES = ("live", "cache", STALE)


@dataclass(frozen=True)
class ManifoldView:
    """What the desk knows about one Manifold market, in our own words."""

    state: str  # "open", "closed", "decided" or "unknown"
    decided_as: str | None  # "yes", "no" or "void" when the state is "decided"
    decided_at: datetime | None
    closes_at: datetime | None  # Manifold's own closing time (only from a real reading)
    source: str | None  # "live", "cache", "stale" or "fallback"; None if there is no data at all
    fetched_at: datetime | None
    is_real: bool  # True for a real reading (and in demo mode for the recording too)


@dataclass(frozen=True)
class QuestionState:
    """The state of one question at one moment."""

    status: str  # "open", "closed" or "settled"
    can_stake: bool
    closes_at: datetime  # the effective closing time
    manifold: ManifoldView


def read_manifold(result: SourceResult | None, now: datetime, demo_mode: bool) -> ManifoldView:
    """Turn the reading of a source into a ManifoldView. `result` is None if there is no data."""
    if result is None:
        return ManifoldView(UNKNOWN, None, None, None, None, None, False)

    is_real = result.source in REAL_SOURCES or demo_mode
    if not is_real:
        return ManifoldView(UNKNOWN, None, None, None, result.source, result.fetched_at, False)

    market: MarketState = result.data
    if market.is_resolved:
        state = DECIDED
    elif market.closes_at is not None and market.closes_at <= now:
        state = CLOSED
    else:
        state = OPEN
    return ManifoldView(
        state=state,
        decided_as=market.decided_as,
        decided_at=market.decided_at,
        closes_at=market.closes_at,
        source=result.source,
        fetched_at=result.fetched_at,
        is_real=True,
    )


def is_too_old_to_stake(manifold: ManifoldView, now: datetime) -> bool:
    """True for a stale reading older than STALE_LIMIT_FOR_STAKE: fine to show, not to stake on.

    Only the source "stale" is judged. A live or cached reading is young by construction. The
    recording is never judged by its age: outside demo mode it is no reading at all, and in demo
    mode it counts however old it is.
    """
    return (
        manifold.source == STALE
        and manifold.fetched_at is not None
        and now - manifold.fetched_at > STALE_LIMIT_FOR_STAKE
    )


def question_state(
    question: Question, pool: PoolRow | None, manifold: ManifoldView, now: datetime
) -> QuestionState:
    """The status of a question, whether a captain may stake, and its effective closing time."""
    closes_at = effective_closes_at(
        question.closes_at,
        manifold.closes_at,
        manifold.decided_at,
        pool.closes_at if pool is not None else None,
    )
    if pool is not None and pool.status == SETTLED:
        status = SETTLED
    elif not is_staking_open(closes_at, now) or manifold.state in (CLOSED, DECIDED):
        status = CLOSED
    else:
        status = OPEN
    can_stake = status == OPEN and manifold.state == OPEN and not is_too_old_to_stake(manifold, now)
    return QuestionState(status, can_stake, closes_at, manifold)
