"""Opening and closing a position: the checks a trade must pass, and what it gives back.

exchange.py puts the steps in order (the order is part of the contract, see routes/market.py).
This file holds the pieces of those steps, each small and plainly named:
  * OpenOrder, CloseOrder   what a player asked for (the route builds them from the checked request)
  * OpenReceipt, CloseReceipt   what a finished trade did
  * refusal_for_state       the company cannot be traded right now: market closed, prices old, ...
  * check_open_coins, check_close_coins   the wallet rules for each coin movement, checked BEFORE
                            the database is asked, exactly like every other coin change
  * open_refusal, close_refusal   a rule of the database said no: the error to answer with

Used by: exchange.py and the tests.
"""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from server.errors import ApiError
from server.market import messages
from server.market.calendars import Calendars
from server.market.companies import Company
from server.market.positions import Closing
from server.market.states import (
    REASON_NOT_IN_RECORDING,
    REASON_SOURCE_OFF,
    STATUS_CLOSED,
    STATUS_OPEN,
    STATUS_UNAVAILABLE,
    CompanyState,
)
from server.market.store import PositionRow
from server.market.store_calls import CloseOutcome, OpenOutcome
from server.supabase_admin import SupabaseRejected
from server.wallet import validate_transaction


@dataclass(frozen=True)
class OpenOrder:
    """What a player asked for when opening a position."""

    company_id: str
    side: str  # "rising" or "falling"
    stake: int  # whole coins
    action_uid: str  # made by the browser once per click; the same again if the click is repeated


@dataclass(frozen=True)
class CloseOrder:
    """What a player asked for when closing a position."""

    position_id: str
    action_uid: str


@dataclass(frozen=True)
class OpenReceipt:
    """What an opened position cost."""

    position_id: str
    company: Company
    side: str
    stake: int
    fee: int
    coins_change: int  # minus (stake + fee)
    balance: int  # coins after the opening
    entry_price: Decimal
    zero_price: Decimal  # worked out by the database from the entry price
    fee_basis_points: int
    opened_at: datetime


@dataclass(frozen=True)
class CloseReceipt:
    """What a closed position paid."""

    position_id: str
    closed_as: str  # "closed" by the player, or "zeroed" (the stake was used up)
    close_price: Decimal
    value: int
    fee: int
    coins_change: int
    balance: int
    closed_at: datetime


def refusal_for_state(state: CompanyState, calendars: Calendars) -> ApiError | None:
    """The error that says why a company cannot be traded right now, or None if it can.

    A closed market names its opening. A company without a connected source is "unavailable".
    Everything else (old prices, no price yet) is "prices are not up to date": try again soon.
    """
    if state.status == STATUS_OPEN:
        return None
    if state.status == STATUS_CLOSED:
        return messages.market_closed(state.company, calendars, state.session)
    if state.status == STATUS_UNAVAILABLE and state.reason in (
        REASON_SOURCE_OFF,
        REASON_NOT_IN_RECORDING,
    ):
        return messages.company_unavailable(state.company.name)
    return messages.prices_stale(state.company)


def check_open_coins(stake: int, fee: int, ref: str) -> None:
    """Both coin movements of an opening follow the wallet rules (a spend is a negative amount)."""
    validate_transaction(-stake, "market_stake", ref)
    validate_transaction(-fee, "market_fee", ref)


def check_close_coins(closing: Closing, ref: str) -> None:
    """The coin movements of a closing follow the wallet rules (0 coins move nothing)."""
    if closing.value > 0:
        validate_transaction(closing.value, "market_payout", ref)
    if closing.fee > 0:
        validate_transaction(-closing.fee, "market_fee", ref)


def open_refusal(outcome: OpenOutcome) -> ApiError:
    """The error for an opening that a rule in the database refused. Nothing was changed."""
    if outcome.reason == "too_many_positions":
        return messages.too_many_positions()
    if outcome.reason == "daily_cap":
        return messages.daily_stake_cap(outcome.coins_left)
    return SupabaseRejected()  # a reason we do not know: the database and the server disagree


def close_refusal(outcome: CloseOutcome, row: PositionRow) -> ApiError:
    """The error for a closing that a rule in the database refused. Nothing was changed."""
    if outcome.reason == "no_such_position":
        return messages.no_such_position()
    if outcome.reason == "position_closed":
        return messages.position_closed(outcome.closed_as, outcome.closed_at)
    if outcome.reason == "wrong_price_mode":
        return messages.wrong_price_mode(row.price_mode)
    return SupabaseRejected()  # a reason we do not know: the database and the server disagree
