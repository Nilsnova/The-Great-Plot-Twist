"""The automatic close of used-up positions: one database call with the prices at hand.

There is no timer on Vercel, so the close runs whenever the server has prices in hand: every
board look, every open, every close and every portfolio look (docs/DECISIONS.md, D017). Each run is
ONE call of exchange_close_used_up(): the database closes, in a single statement, every open
position whose zero point a price has reached (store_calls.py explains the function).

Which prices are sent: only those of companies that are open (states.sweep_prices). A closed or
stale company is never in the list, so a stock position is never closed while its market is closed.
Which positions are checked: a player's, or everybody's (player_id None).

A sweep never fails the answer it belongs to. If it cannot run (the database is away, or this
server has no database settings) it is logged by the kind of error and skipped; the next look
runs it again. A dip past the zero point that comes and goes between two looks is missed, which is
in the player's favour.

Used by: exchange.py and the tests.
"""

import logging

from server.market.states import CompanyState, sweep_prices
from server.market.store import database_is_configured
from server.market.store_calls import run_sweep, sweep_arguments
from server.supabase_admin import SupabaseAdmin

logger = logging.getLogger(__name__)


async def sweep(
    admin: SupabaseAdmin, states: tuple[CompanyState, ...], player_id: str | None
) -> None:
    """Close the positions that the prices of the open companies have used up. Never raises."""
    prices = sweep_prices(list(states))
    if not prices or not database_is_configured(admin):
        return
    try:
        outcome = await run_sweep(admin, sweep_arguments(prices, player_id))
    except Exception as error:  # on purpose: a sweep must never fail the answer
        logger.warning("The automatic close (sweep) failed: %s", type(error).__name__)
        return
    if outcome.closed:
        logger.info("The automatic close (sweep) closed %d position(s) at zero.", outcome.closed)
