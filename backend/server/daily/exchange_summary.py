"""What the bulletin says about the Island Exchange: which feed the prices come from, who is paused.

The bulletin only LOOKS at the Exchange. It asks for the price board without saving anything
(`market.board(admin, save=False)`), so reading the bulletin never moves the market, also while
the feature flag is still off. Any ApiError from the board (the feed has never answered, the
database is down) means there is no Exchange line today and the route sends `exchange: null`.

    live     real prices, just fetched
    cache    real prices, fetched less than a minute ago
    stale    Binance is not answering: the prices are old and nobody can trade
    replay   the recorded prices of demo mode

Used by: routes/bulletin.py (reads the summary) and daily/bulletin.py (writes the line).
"""

import logging
from dataclasses import dataclass

from server.errors import ApiError
from server.market.exchange import Board, MarketService
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


def summarize_board(board: Board) -> ExchangeSummary:
    """The summary of one price board."""
    paused = tuple(
        PausedCompany(quote.company.id, quote.company.name)
        for quote in board.quotes
        if quote.is_halted
    )
    return ExchangeSummary(feed=board.snapshot.source, paused=paused)


async def read_exchange(
    market: MarketService | None, admin: SupabaseAdmin
) -> ExchangeSummary | None:
    """Look at the Exchange. None if there is no service, or the board cannot be made."""
    if market is None:
        return None
    try:
        board = await market.board(admin, save=False)
    except ApiError as error:
        logger.warning("The bulletin leaves out the Exchange line: %s", error.code)
        return None
    return summarize_board(board)
