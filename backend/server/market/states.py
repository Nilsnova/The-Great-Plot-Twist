"""What the board says about each company: open, closed, stale or unavailable.

Pure functions: they take a reading, the opening hours and a few switches, and return a plain
answer, so the tests can check every case with fixed values. The checks run in this order, and
the first that applies wins:

  1. unavailable  the company cannot be priced at all
       source_off          the price source for this company is off (a stock without a key, or a
                           provider that does not cover its market)
       not_in_recording    a stock in demo mode (the recording has only the island companies)
       no_price            no price yet
  2. closed       its market is closed: weekend, holiday, outside_hours, no_calendar.
                  It shows its last price and when it opens again. Nothing is traded or closed.
  3. stale        the price cannot be trusted right now. Nothing is traded or closed.
       source_away         the newest price is older than this look accepts and the source did
                           not answer (the latest request failed, or the call budget was used up)
       waiting_first_price a stock quoted before today's opening: it still shows yesterday's close
       quote_old           a stock whose quote was already more than 60 seconds old when we got it
  4. open         tradable

Closed and stale companies never close a position by themselves (rule R8): a stock position is
closed or used up only while its market is open and its price is fresh.

Used by: exchange.py (builds the board and decides if a trade may go on) and the tests.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal

from server.market.calendars import Session
from server.market.companies import Company
from server.market.readings import SOURCE_STALE, Reading

STATUS_OPEN = "open"
STATUS_CLOSED = "closed"
STATUS_STALE = "stale"
STATUS_UNAVAILABLE = "unavailable"

REASON_SOURCE_OFF = "source_off"
REASON_NOT_IN_RECORDING = "not_in_recording"
REASON_NO_PRICE = "no_price"
REASON_SOURCE_AWAY = "source_away"
REASON_WAITING_FIRST_PRICE = "waiting_first_price"
REASON_QUOTE_OLD = "quote_old"

# A stock quote that was already older than this when we fetched it is not a current price. If
# the provider's time lags by design for liquid stocks, change this number, not the rule.
MAX_QUOTE_LAG_SECONDS = 60


@dataclass(frozen=True)
class CompanyState:
    """One company, its reading, its market hours and what the board says about it."""

    company: Company
    reading: Reading
    session: Session
    status: str
    reason: str | None
    delisted: bool
    trading_enabled: bool  # the feature flag "market" is on

    @property
    def is_open(self) -> bool:
        return self.status == STATUS_OPEN

    @property
    def can_open(self) -> bool:
        """A new position may be opened: the flag is on, the company is open and not delisted."""
        return self.trading_enabled and self.is_open and not self.delisted

    @property
    def can_close(self) -> bool:
        """A position may be closed: the flag is on and the company is open (even if delisted)."""
        return self.trading_enabled and self.is_open


@dataclass(frozen=True)
class SweepPrice:
    """One price for the automatic close: the database closes positions that this price reaches."""

    company_id: str
    price: Decimal
    quoted_at: datetime  # only positions opened before this moment can be closed by the price
    mode: str  # "live" or "replay": only positions of the same price mode are closed


def why_not_priced(
    company: Company, reading: Reading, *, source_on: bool, demo_mode: bool
) -> str | None:
    """Check 1: the reason the company cannot be priced at all, or None."""
    if company.is_stock and demo_mode:
        return REASON_NOT_IN_RECORDING
    if not source_on:
        return REASON_SOURCE_OFF
    if not reading.has_price:
        return REASON_NO_PRICE
    return None


def why_stale(company: Company, reading: Reading, session: Session) -> str | None:
    """Check 3: the reason the price cannot be trusted right now, or None."""
    if reading.source == SOURCE_STALE:
        return REASON_SOURCE_AWAY
    if not company.is_stock:
        return None
    if session.opened_at is not None and reading.quoted_at < session.opened_at:
        return REASON_WAITING_FIRST_PRICE
    lag = reading.fetched_at - reading.quoted_at
    if lag > timedelta(seconds=MAX_QUOTE_LAG_SECONDS):
        return REASON_QUOTE_OLD
    return None


def find_status(
    company: Company, reading: Reading, session: Session, *, source_on: bool, demo_mode: bool
) -> tuple[str, str | None]:
    """The status and the reason of a company, checked in the order of the top of this file."""
    unavailable = why_not_priced(company, reading, source_on=source_on, demo_mode=demo_mode)
    if unavailable is not None:
        return STATUS_UNAVAILABLE, unavailable
    if not session.is_open:
        return STATUS_CLOSED, session.reason
    stale = why_stale(company, reading, session)
    if stale is not None:
        return STATUS_STALE, stale
    return STATUS_OPEN, None


def company_state(
    company: Company,
    reading: Reading,
    session: Session,
    *,
    source_on: bool,
    demo_mode: bool,
    relit: bool,
    trading_enabled: bool,
) -> CompanyState:
    """Work out the status of one company.

    source_on        the price source for this company is on (always true for an island company)
    demo_mode        the recording plays: stocks are not part of it
    relit            the Relighting has happened: a company marked delistAtRelighting is delisted
    trading_enabled  the feature flag "market" is on
    """
    status, reason = find_status(
        company, reading, session, source_on=source_on, demo_mode=demo_mode
    )
    return CompanyState(
        company=company,
        reading=reading,
        session=session,
        status=status,
        reason=reason,
        delisted=relit and company.delist_at_relighting,
        trading_enabled=trading_enabled,
    )


def sweep_prices(states: list[CompanyState]) -> list[SweepPrice]:
    """The prices that may close used-up positions: only companies that are open (rule R8)."""
    prices = []
    for state in states:
        if state.is_open:
            reading = state.reading
            prices.append(
                SweepPrice(state.company.id, reading.price, reading.quoted_at, reading.price_mode)
            )
    return prices


def is_listed(state: CompanyState) -> bool:
    """False for a stock whose source is off or that is not part of the recording.

    The board lists a stock company only while the stock source is on and the server is not in
    demo mode. Every other company is listed, whatever its status.
    """
    hidden = (REASON_SOURCE_OFF, REASON_NOT_IN_RECORDING)
    return not (state.status == STATUS_UNAVAILABLE and state.reason in hidden)
