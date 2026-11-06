"""What the bulletin says about the Island Exchange: which feed the prices come from, who is paused.

The bulletin only LOOKS at the Exchange. It asks for the price board without saving anything
(`market.snapshot(admin, trading_enabled=False)`), so reading the bulletin never moves the market.
This also holds while the feature flag is off. A feed or database error leaves out the
Exchange line and the route sends `exchange: null`.

    live     real prices, just fetched
    cache    real prices, fetched less than a minute ago
    stale    Binance is not answering: the prices are old and nobody can trade
    replay   the recorded prices of demo mode

Used by: routes/bulletin.py (reads the summary) and daily/bulletin.py (writes the line).
"""

import logging
from dataclasses import dataclass

from server.errors import ApiError
from server.market.board import Snapshot
from server.market.exchange import MarketService
from server.market.states import STATUS_STALE
from server.supabase_admin import SupabaseAdmin

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PausedCompany:
    id: str
    name: str


@dataclass(frozen=True)
class ExchangeSummary:
    """The feed of the prices and the companies that are paused right now."""

    feed: str  # live, cache, stale or replay
    paused: tuple[PausedCompany, ...]  # in the order of the price board


def summarize_board(board: Snapshot) -> ExchangeSummary | None:
    """The summary of one price board."""
    companies = board.listed
    sources = {state.reading.source for state in companies}
    priority = ("stale", "live", "cache", "replay")
    feed = next((source for source in priority if source in sources), None)
    if feed is None:
        return None
    paused = tuple(
        PausedCompany(state.company.id, state.company.name)
        for state in companies
        if state.status == STATUS_STALE
    )
    return ExchangeSummary(feed=feed, paused=paused)



async def read_exchange(
    market: MarketService | None, admin: SupabaseAdmin
) -> ExchangeSummary | None:
    """Look at the Exchange. None if there is no service, or the board cannot be made."""
    if market is None:
        return None
    try:
        board = await market.snapshot(admin, trading_enabled=False)
    except ApiError as error:
        logger.warning("The bulletin leaves out the Exchange line: %s", error.code)
        return None
    return summarize_board(board)
