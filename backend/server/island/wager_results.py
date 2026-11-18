"""Shared market-call and football payout checks. Used by Harbor integration and tests.

Inputs are server-fetched evidence and persisted product terms, never client-declared results.
These functions calculate returned principal plus winnings; they do not claim money movement
or prove every upstream fact. Product/treasury atomic settlement remains a prerequisite.
"""

from datetime import datetime
from decimal import Decimal

from server.errors import ApiError
from server.island.wager_rules import WagerIntent, invalid_transaction, validate_stake
from server.market.calls import PRICE_WAIT
from server.market.calls_store import CallRow
from server.market.readings import SOURCE_CACHE, SOURCE_LIVE
from server.market.states import CompanyState
from server.sports.rules import VOID, outcome
from server.sports.source import CACHE_SECONDS, SportsReading


def result_pending() -> ApiError:
    return ApiError(409, "result_pending", "A verified result is not available for this wager yet.")


def require_aware(moment: datetime) -> None:
    if not isinstance(moment, datetime) or moment.utcoffset() is None:
        raise invalid_transaction()


def require_price(price: Decimal | None) -> Decimal:
    if not isinstance(price, Decimal) or not price.is_finite() or price <= 0:
        raise invalid_transaction()
    return price


def market_settlement_price(
    row: CallRow, state: CompanyState | None, now: datetime
) -> Decimal | None:
    """Unusable data is absence of a price; the server clock can still authorize a refund."""
    if state is None:
        return None
    if state.company.id != row.asset:
        raise result_pending()
    reading = state.reading
    if reading.source not in (SOURCE_LIVE, SOURCE_CACHE) or reading.price is None:
        return None
    if reading.fetched_at is None or reading.quoted_at is None:
        return None
    require_aware(reading.fetched_at)
    require_aware(reading.quoted_at)
    if not row.settle_at <= reading.fetched_at <= now:
        return None
    if not row.opened_at < reading.quoted_at <= now:
        return None
    return require_price(reading.price)


def market_call_returned_payout(row: CallRow, state: CompanyState | None, now: datetime) -> int:
    """Double or nothing, tied-price refund, or no-price refund after the stored timeout.

    The state must name the persisted asset. A fetched price at/after settle_at must be
    quoted after opening and no later than the server clock. Missing or unusable data refunds
    only after the existing 24-hour wait. The clock authorizes that refund, never the data.
    """
    require_aware(now)
    terms = WagerIntent("market_call", row.asset, row.direction, row.stake)
    opening = require_price(row.open_price)
    if row.settle_at <= row.opened_at:
        raise invalid_transaction()
    if row.settled_at is not None:
        raise ApiError(409, "already_settled", "This wager already has a recorded result.")
    if now < row.settle_at:
        raise result_pending()
    price = market_settlement_price(row, state, now)
    if price is None:
        if now > row.settle_at + PRICE_WAIT:
            return terms.stake
        raise result_pending()
    if price == opening:
        return terms.stake
    won = (price > opening) == (terms.selection == "up")
    return terms.stake * 2 if won else 0


def football_returned_payout(
    stake: object, pick: str, fixture_id: str, reading: SportsReading, now: datetime
) -> int:
    """Fixed even odds from a current official football reading, never a recorded match."""
    principal = validate_stake(stake)
    WagerIntent("football", fixture_id, pick, principal)
    require_aware(now)
    require_aware(reading.fetched_at)
    if reading.source != "live" or reading.provider != "football-data.org":
        raise result_pending()
    if reading.match.id != fixture_id or reading.match.sport != "football":
        raise result_pending()
    if not 0 <= (now - reading.fetched_at).total_seconds() < CACHE_SECONDS:
        raise result_pending()
    result = outcome(reading.match)
    if result is None:
        raise result_pending()
    if result == VOID:
        return principal
    if now < reading.match.kickoff:
        raise result_pending()
    return principal * 2 if result == pick else 0
