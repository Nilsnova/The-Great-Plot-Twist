"""Island Exchange trade rules: what a trade costs in whole coins, and the limits on trading.

Pure Python: no network, no database, no clock of its own. The tests check every rule with fixed
numbers (backend/server/tests/test_market_trade_rules.py).

The rules, in plain words
  * Whole units. A player buys or sells a whole number of units (shares), at least 1.
  * Whole coins. A wallet holds whole coins, so every amount of coins is rounded, always in the
    player's disfavour: what a player pays is rounded UP, what a player receives is rounded DOWN.
        buy:   shares cost  units x price, rounded up          (the player pays more)
        sell:  shares bring units x price, rounded down        (the player gets less)
        fee:   2 % of that amount, rounded up, for buying and for selling
    A buy costs "shares + fee". A sell pays "shares - fee".
  * Trade size. One trade must be worth at least 1 coin. A BUY may be worth at most MAX_TRADE_COINS.
    A SELL has no upper limit, because a player must always be able to sell what they hold: a
    price can rise, and then a few units are worth more than one buy may be (a player who holds
    them bought them in trades of at most that size). The most one player can buy is also limited
    per day (DAILY_BUY_CAP_COINS).
  * Daily buy cap. A player can spend at most DAILY_BUY_CAP_COINS on shares (without fees) per
    market day. The market day starts at 08:00 Lisbon time (see rules.py).
  * Minimum holding time. Shares can be sold only MIN_HOLD_MINUTES after the player's LATEST
    purchase of that company. Buying more restarts the clock for all shares of that company.

Who enforces what: this file works out the numbers, and the server checks the size of one trade
before it asks the database. The rules that depend on what a player did before (holding time,
daily cap, units owned) are checked by the database function market_trade in the same step that
moves the coins. Only the database can see two requests that arrive at the same moment. It is given
the limits below as arguments, so the numbers live in one place: here.

Used by: exchange.py (works out a trade) and the tests.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import ROUND_CEILING, ROUND_FLOOR, Decimal

from server.errors import ApiError

# --- The numbers that make the rules. Change them here and nowhere else. ---

FEE_BASIS_POINTS = 200  # a basis point is 0.01 %, so 200 means a fee of 2 %
BASIS_POINTS_IN_WHOLE = 10_000  # 100 % in basis points
MIN_HOLD_MINUTES = 10  # shares can be sold this long after the latest purchase
MIN_HOLD_SECONDS = MIN_HOLD_MINUTES * 60  # the same time, as the database function wants it
MAX_TRADE_COINS = 500  # the most one BUY may be worth (shares only, without the fee)
MIN_TRADE_COINS = 1  # the least one trade may be worth
DAILY_BUY_CAP_COINS = 2000  # the most a player may spend on shares per market day
MAX_UNITS_PER_TRADE = 100_000  # only a sanity limit for the request: the coin limit is stricter

BUY = "buy"
SELL = "sell"


class TradeRefused(ApiError):
    """A trade the rules do not allow. Nothing was changed.

    It is an ApiError, so a route that lets it escape answers in the standard error shape.
    """


@dataclass(frozen=True)
class TradeAmounts:
    """The coins of one trade, all whole numbers."""

    gross: int  # coins for the shares themselves (rounded against the player)
    fee: int  # coins for the fee (rounded up)

    @property
    def paid_by_player(self) -> int:
        """A buy: shares plus fee leave the wallet."""
        return self.gross + self.fee

    @property
    def received_by_player(self) -> int:
        """A sell: shares minus fee arrive in the wallet."""
        return self.gross - self.fee


def whole_coins(value: Decimal, rounding: str) -> int:
    """A Decimal as a whole number of coins. `rounding` is ROUND_CEILING or ROUND_FLOOR."""
    return int(value.to_integral_value(rounding=rounding))


def fee_for(gross: int) -> int:
    """The fee: 2 % of the shares' coins, rounded up (so a trade of 1 to 50 coins pays 1 coin)."""
    exact_fee = Decimal(gross * FEE_BASIS_POINTS) / BASIS_POINTS_IN_WHOLE
    return whole_coins(exact_fee, ROUND_CEILING)


def buy_amounts(units: int, price: Decimal) -> TradeAmounts:
    """What buying `units` at `price` costs. The shares are rounded UP."""
    gross = whole_coins(units * price, ROUND_CEILING)
    return TradeAmounts(gross=gross, fee=fee_for(gross))


def sell_amounts(units: int, price: Decimal) -> TradeAmounts:
    """What selling `units` at `price` brings. The shares are rounded DOWN."""
    gross = whole_coins(units * price, ROUND_FLOOR)
    return TradeAmounts(gross=gross, fee=fee_for(gross))


def check_trade_size(side: str, gross: int) -> None:
    """A trade must be worth at least MIN_TRADE_COINS, and a buy at most MAX_TRADE_COINS.

    Raises a 422 TradeRefused if not. A sell is never refused for being too big (see the top).
    """
    if gross < MIN_TRADE_COINS:
        raise TradeRefused(
            422, "trade_too_small", "That trade is worth less than 1 coin. Use more units."
        )
    if side == BUY and gross > MAX_TRADE_COINS:
        raise TradeRefused(
            422,
            "trade_too_big",
            f"One purchase can be worth at most {MAX_TRADE_COINS} coins. Buy fewer units.",
        )


def sellable_from(last_buy_at: datetime) -> datetime:
    """The first moment shares bought at `last_buy_at` (the latest purchase) can be sold."""
    return last_buy_at + timedelta(seconds=MIN_HOLD_SECONDS)


def can_sell_now(last_buy_at: datetime, now: datetime) -> bool:
    """True once the minimum holding time has passed."""
    return now >= sellable_from(last_buy_at)
