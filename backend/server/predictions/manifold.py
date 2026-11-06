"""Manifold adapter: reads one market from Manifold Markets, a free play-money forecasting site.

This is the only file that knows Manifold's address and field names. The rest of the server sees a
MarketState in our own words: when the market closes, whether it is decided, and how.

What was checked in Manifold's documentation and in live answers on 6 Nov 2026. Look the pages up
again (and change the date here) before you change what this file asks for:
  * API docs:  https://docs.manifold.markets/api
  * Terms:     the Terms of Service of manifold.markets
The facts we rely on:
  * The address is https://api.manifold.markets/v0/market/{marketId}. Reading needs no key and no
    sign-in. The limit is 500 requests a minute per IP address, and using several addresses to get
    around it is not allowed. We call each question at most once per 2 minutes per server instance
    (source.py), so five questions are about 2.5 calls a minute. Vercel shares IP addresses with
    other customers, so Manifold can answer HTTP 429 even when we are quiet. The call then counts
    as failed and the source uses older or recorded data (it says so in `source`).
  * The API is labelled alpha and may change, so the parser below is strict, and the recorded
    answers cover a change.
  * Integrations are a permitted use of the API under the terms; scraping outside the API and
    dodging the limit are not. We found no clause that asks for credit. We credit Manifold in text
    anyway (routes/predictions.py), and nothing links to a betting site.
  * "token" is MANA (play money) or CASH (prize cash). The field is optional. A missing token
    counts as MANA. Anything else is refused: this desk is play money only.
  * "closeTime" is milliseconds since 1970. It is the earlier of the creator's chosen date and the
    resolution time, so a market that was resolved early shows its resolution time there.
  * "resolution" of a resolved binary market is YES, NO, CANCEL or MKT (milliseconds in
    "resolutionTime"). An unresolved market has neither key at all. YES and NO decide the question.
    Everything else (CANCEL, MKT, or a value that does not exist today) makes it void and refunds
    everybody.
  * The answer also holds the market's own probability and pool. We never read them and never
    show them: a captain picks a side from the coins of our own pool.

Nothing here logs an answer: a log line holds the kind of problem only, never the text of the
question or any number from Manifold.

Used by: source.py (the cached source of each question) and the tests.
"""

import math
import string
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

MANIFOLD_API = "https://api.manifold.markets/v0"

# A short timeout: the kiosk waits for the answer, and the recorded answer is always there.
TIMEOUT_SECONDS = 3.0

# The only characters a market id may have. It is the only value that ever goes into the address,
# and it comes from questions.json, never from a request.
MARKET_ID_CHARACTERS = set(string.ascii_letters + string.digits)
MAX_MARKET_ID_LENGTH = 40

PLAY_MONEY_TOKEN = "MANA"
EPOCH = datetime(1970, 1, 1, tzinfo=UTC)

# What a decided question can be, in our words.
YES = "yes"
NO = "no"
VOID = "void"


class ManifoldAnswerError(ValueError):
    """Manifold's answer is not one we can use. The message says what, never repeats the answer."""


@dataclass(frozen=True)
class MarketState:
    """What we need to know about one Manifold market. All times are UTC."""

    market_id: str
    closes_at: datetime | None  # Manifold's closeTime, or None if the market has none
    is_resolved: bool
    decided_as: str | None  # "yes", "no" or "void"; None while the market is not resolved
    decided_at: datetime | None  # Manifold's resolutionTime, if it sent one


def read_whole_number(value: Any) -> int | None:
    """The value as a whole number, or None if it is not one (a bool is not a number here)."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and math.isfinite(value) and value.is_integer():
        return int(value)
    return None


def milliseconds_to_time(value: Any, name: str) -> datetime:
    """Manifold's milliseconds since 1970 as a UTC time. Raises if it is not a usable number."""
    milliseconds = read_whole_number(value)
    message = f"The Manifold '{name}' is not a whole number of milliseconds."
    if milliseconds is None:
        raise ManifoldAnswerError(message)
    try:
        return EPOCH + timedelta(milliseconds=milliseconds)
    except OverflowError as error:
        raise ManifoldAnswerError(message) from error


def read_optional_time(answer: dict[str, Any], name: str) -> datetime | None:
    """A time that may be missing: None if the key is absent, an error if it is not a time."""
    if name not in answer:
        return None
    return milliseconds_to_time(answer[name], name)


def decision_of(resolution: Any) -> str:
    """YES and NO decide the question. Anything else makes it void."""
    if resolution == "YES":
        return YES
    if resolution == "NO":
        return NO
    return VOID


def check_it_is_ours(answer: dict[str, Any], expected_id: str) -> None:
    """The answer must be about the market we asked for, binary, and on play money."""
    if answer.get("id") != expected_id:
        raise ManifoldAnswerError("The Manifold answer is for another market than we asked for.")
    if answer.get("outcomeType") != "BINARY":
        raise ManifoldAnswerError("The Manifold market is not a BINARY (yes or no) market.")
    # A missing token counts as MANA. CASH is prize cash and is refused, like anything unknown.
    if answer.get("token", PLAY_MONEY_TOKEN) != PLAY_MONEY_TOKEN:
        raise ManifoldAnswerError("The Manifold market is not on play money (MANA).")


def parse_market(answer: object, expected_id: str) -> MarketState:
    """Pick what we need out of Manifold's JSON answer, or raise ManifoldAnswerError.

    The answer is refused when it is for another market, is not BINARY, is not on play money,
    has no true-or-false isResolved, has a closeTime that is not a whole number, or is resolved
    without a text resolution. YES becomes "yes", NO becomes "no", everything else "void".
    """
    if not isinstance(answer, dict):
        raise ManifoldAnswerError("The Manifold answer is not an object.")
    check_it_is_ours(answer, expected_id)
    is_resolved = answer.get("isResolved")
    if not isinstance(is_resolved, bool):
        raise ManifoldAnswerError("The Manifold answer has no true-or-false 'isResolved'.")
    closes_at = read_optional_time(answer, "closeTime")
    if not is_resolved:
        return MarketState(expected_id, closes_at, False, None, None)

    resolution = answer.get("resolution")
    if not isinstance(resolution, str):
        raise ManifoldAnswerError(
            "The Manifold market is resolved but its 'resolution' is not text."
        )
    decided_at = read_optional_time(answer, "resolutionTime")
    return MarketState(expected_id, closes_at, True, decision_of(resolution), decided_at)


def check_market_id(market_id: str) -> None:
    """A market id is 1 to 40 letters and digits. Raises before any address is built."""
    is_plain = bool(market_id) and set(market_id) <= MARKET_ID_CHARACTERS
    if not is_plain or len(market_id) > MAX_MARKET_ID_LENGTH:
        raise ManifoldAnswerError("That is not a Manifold market id.")


async def fetch_market(
    market_id: str, transport: httpx.AsyncBaseTransport | None = None
) -> MarketState:
    """Ask Manifold about one market. Raises an error if anything fails.

    A 429, a 5xx, a timeout and an answer we cannot use all raise, and the source (source.py)
    catches the error and falls back to older or recorded data. Tests pass a fake transport.
    """
    check_market_id(market_id)
    async with httpx.AsyncClient(transport=transport, timeout=TIMEOUT_SECONDS) as client:
        response = await client.get(f"{MANIFOLD_API}/market/{market_id}")
    response.raise_for_status()
    try:
        answer = response.json()
    except ValueError as error:
        raise ManifoldAnswerError("The Manifold answer is not JSON.") from error
    return parse_market(answer, market_id)
