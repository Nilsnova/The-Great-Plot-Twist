"""The price board: every company with its status, and the numbers that go with it.

A Snapshot is the state of every company at one moment (states.py), the same for every player
who looks at that moment. The routes turn it into the JSON of GET /api/market and
GET /api/market/portfolio, and trades read the company they need from it.

This file also holds the two small texts-and-numbers blocks of the board: the rules the screen
shows (so the screen never has to guess a number) and the credit lines (whose prices these are).

Used by: exchange.py (builds the snapshot), portfolio.py and routes/market.py.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from server.market.feed import TRADE_MAX_AGE_SECONDS, PriceFeed
from server.market.game_day import GAME_DAY_STARTS_TEXT
from server.market.limits import MAX_TRADES
from server.market.positions import (
    DAILY_STAKE_CAP_COINS,
    LEVERAGE,
    MAX_OPEN_POSITIONS,
    MAX_STAKE_COINS,
    MIN_STAKE_COINS,
    fee_basis_points,
    stake_choices,
)
from server.market.states import CompanyState, is_listed

BINANCE_CREDIT = "Real prices from Binance market data."


@dataclass(frozen=True)
class Snapshot:
    """Every company of the file with its state at one moment."""

    states: tuple[CompanyState, ...]
    now: datetime
    relit: bool  # the Relighting has happened: fees are lower, Greyfathom is delisted
    trading_enabled: bool  # the feature flag "market" is on
    demo_mode: bool

    def find(self, company_id: str) -> CompanyState | None:
        for state in self.states:
            if state.company.id == company_id:
                return state
        return None

    @property
    def listed(self) -> tuple[CompanyState, ...]:
        """The companies the board shows: island companies first, then the stocks, in file order."""
        shown = [state for state in self.states if is_listed(state)]
        return tuple(sorted(shown, key=lambda state: state.company.is_stock))

    @property
    def basis_points(self) -> int:
        return fee_basis_points(self.relit)


def rules_block(relit: bool) -> dict[str, Any]:
    """The numbers of the rules, so the screen never has to guess them."""
    basis_points = fee_basis_points(relit)
    return {
        "leverage": LEVERAGE,
        "zeroPointMovePercent": 100 // LEVERAGE,
        "feePercent": basis_points / 100,  # 100 basis points are 1 percent
        "minStake": MIN_STAKE_COINS,
        "maxStake": MAX_STAKE_COINS,
        "dailyStakeCap": DAILY_STAKE_CAP_COINS,
        "maxOpenPositions": MAX_OPEN_POSITIONS,
        "stakeChoices": [
            {"stake": choice.stake, "fee": choice.fee, "total": choice.total}
            for choice in stake_choices(basis_points)
        ],
        "tradePriceMaxAgeSeconds": TRADE_MAX_AGE_SECONDS,
        "tradesPer30Seconds": MAX_TRADES,
        "gameDayStarts": GAME_DAY_STARTS_TEXT,
    }


def credit(
    text: str,
    href: str | None = None,
    licence: str | None = None,
    licence_href: str | None = None,
) -> dict[str, Any]:
    return {"text": text, "href": href, "licenceText": licence, "licenceHref": licence_href}


def credits_block(feed: PriceFeed) -> list[dict[str, Any]]:
    """Whose prices these are. Binance and the stock provider ask for a credit line; the recording
    of demo mode is licensed CC BY-NC-SA 4.0, with a link to the licence text."""
    if not feed.live:
        replay = feed.replay
        text = f"Recorded prices from {replay.credit}, played back."
        return [credit(text, licence=replay.licence, licence_href=replay.licence_url)]
    credits = [credit(BINANCE_CREDIT)]
    if feed.stocks is not None:
        provider = feed.stocks.provider
        credits.append(credit(provider.credit, href=provider.credit_href))
    return credits
