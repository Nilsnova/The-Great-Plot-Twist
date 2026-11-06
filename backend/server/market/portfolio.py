"""A player's positions with their value now: what the portfolio route shows.

For every open position the server works out, from the price of the company, what it is worth,
what it has made, what closing it would pay and what the whole position has made with both fees
counted. All these numbers come from positions.py: the screen does no arithmetic.

Values are at the current price, or at the LAST price when the company is closed or stale (then
the position cannot be closed). Three cases have no value at all, and the position cannot be
closed: the company has no price yet, the company is no longer in companies.json (the content
README forbids removing a company while players hold positions in it), and the position was opened
on the other kind of prices (a live position on a demo server or the reverse, rule R20).

Used by: exchange.py (MarketService.portfolio) and routes/market.py.
"""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from server.market.board import Snapshot
from server.market.companies import Company
from server.market.positions import Closing, closing_amounts, result_of
from server.market.states import (
    REASON_NO_PRICE,
    STATUS_UNAVAILABLE,
)
from server.market.store import PositionRow

# Why a position has no value although its company exists in the file.
REASON_WRONG_PRICE_MODE = "wrong_price_mode"


@dataclass(frozen=True)
class PositionView:
    """One open position with its value at the price of now."""

    row: PositionRow
    company: Company | None  # None: the company is no longer in companies.json
    company_status: str  # "open", "closed", "stale" or "unavailable"
    company_reason: str | None
    opens_at: datetime | None  # when the market opens again, if it is closed
    price: Decimal | None  # the price the value is worked out at (the last one if closed or stale)
    price_at: datetime | None
    closing: Closing | None  # None when there is no price to work out a value
    can_close: bool

    @property
    def result(self) -> int | None:
        """What the whole position has made with both fees counted (as if closed now)."""
        if self.closing is None:
            return None
        return result_of(self.closing.value, self.closing.fee, self.row.stake, self.row.open_fee)


@dataclass(frozen=True)
class ClosedView:
    """A position that has been closed or used up."""

    row: PositionRow
    company: Company | None
    coins_change: int  # what reached the wallet when it closed: value - closing fee
    result: int  # what the whole position made, both fees counted


@dataclass(frozen=True)
class Portfolio:
    """A player's coins and positions."""

    coins: int
    positions: tuple[PositionView, ...]
    recently_closed: tuple[ClosedView, ...]
    staked_today: int
    snapshot: Snapshot


def unavailable_view(row: PositionRow, company: Company | None, reason: str) -> PositionView:
    return PositionView(
        row=row,
        company=company,
        company_status=STATUS_UNAVAILABLE,
        company_reason=reason,
        opens_at=None,
        price=None,
        price_at=None,
        closing=None,
        can_close=False,
    )


def view_position(row: PositionRow, snapshot: Snapshot, price_mode: str) -> PositionView:
    """The position at the price of this snapshot."""
    state = snapshot.find(row.company_id)
    if state is None:
        return unavailable_view(row, None, REASON_NO_PRICE)
    if row.price_mode != price_mode:
        return unavailable_view(row, state.company, REASON_WRONG_PRICE_MODE)
    reading = state.reading
    closing = None
    if reading.has_price:
        closing = closing_amounts(
            row.side, row.stake, row.entry_price, reading.price, snapshot.basis_points
        )
    return PositionView(
        row=row,
        company=state.company,
        company_status=state.status,
        company_reason=state.reason,
        opens_at=state.session.opens_at if not state.session.is_open else None,
        price=reading.price,
        price_at=reading.quoted_at,
        closing=closing,
        can_close=state.can_close,
    )


def view_closed(row: PositionRow, snapshot: Snapshot) -> ClosedView:
    """A closed position as the portfolio lists it. The numbers were fixed when it closed."""
    state = snapshot.find(row.company_id)
    value = row.close_value or 0
    fee = row.close_fee or 0
    return ClosedView(
        row=row,
        company=None if state is None else state.company,
        coins_change=value - fee,
        result=result_of(value, fee, row.stake, row.open_fee),
    )


def build_portfolio(
    coins: int,
    open_rows: list[PositionRow],
    closed_rows: list[PositionRow],
    staked_today: int,
    snapshot: Snapshot,
    price_mode: str,
) -> Portfolio:
    return Portfolio(
        coins=coins,
        positions=tuple(view_position(row, snapshot, price_mode) for row in open_rows),
        recently_closed=tuple(view_closed(row, snapshot) for row in closed_rows),
        staked_today=staked_today,
        snapshot=snapshot,
    )
