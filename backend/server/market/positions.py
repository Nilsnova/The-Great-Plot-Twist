"""Island Exchange position rules: what a 10x position is worth, what it costs and when it ends.

Pure Python. These functions touch no network, no database and no clock. They take plain values
and return plain values, so the tests can check them with fixed numbers
(backend/server/tests/test_market_positions.py). The database function exchange_close_position()
computes the same numbers again and refuses the server's numbers if they differ, so the arithmetic
here and in the migration is written to agree exactly (multiply first, divide once at the very end).

The rules, in plain words
  * Every investment is a position with LEVERAGE 10, rising or falling. A player puts in a STAKE
    of coins (10 to 500) and pays a fee on top. Every 1 % the price moves for the position adds
    10 % of the stake, every 1 % against it takes 10 % away.
  * The zero point. A rising position is used up when the price falls to 90 % of the entry price,
    a falling one when the price rises to 110 % of it. Reaching the point exactly counts as used
    up. A jump past the point is used up too. A used-up position is worth 0 coins, never less.
  * The value is counted in whole coins and rounded down (against the player), and never below 0.
        rising:   value = stake x (entry + 10 x move) / entry     with move = price - entry
        falling:  value = stake x (entry - 10 x move) / entry
    If the top part is 0 or less, the position is used up and worth 0.
  * The fee is 2 % of the STAKE, rounded up, when a position opens and again when it closes
    (1 % after the Relighting). The closing fee comes out of the value and is never more than it.
  * So the most a player can lose on one position is the stake plus the opening fee, and nobody
    can owe coins: after the opening, a position can only pay coins into the wallet, never take
    them out.

Used by: exchange.py (works out an opening and a closing), store.py (the numbers it sends to the
database), routes/market.py (the rules shown on the board) and the tests.
"""

from dataclasses import dataclass
from decimal import ROUND_CEILING, ROUND_HALF_EVEN, ROUND_HALF_UP, Decimal, InvalidOperation

from server.errors import ApiError

# --- The numbers that make the rules. Change them here and nowhere else. ---

# 10 must divide a power of ten, so the zero point is an exact decimal (entry x 9 / 10).
LEVERAGE = 10
FEE_BASIS_POINTS = 200  # a basis point is 0.01 %, so 200 means a fee of 2 %
RELIT_FEE_BASIS_POINTS = 100  # 1 % after the Relighting
BASIS_POINTS_IN_WHOLE = 10_000  # 100 % in basis points
MIN_STAKE_COINS = 10  # the fee is rounded up, so a smaller stake would pay 10 % or more
MAX_STAKE_COINS = 500
DAILY_STAKE_CAP_COINS = 2000  # new stakes per player per game day (game_day.py)
MAX_OPEN_POSITIONS = 20  # open positions per player
MAX_VALUE_COINS = 1_000_000  # the biggest change the wallet takes (wallet.MAX_DELTA)
STAKE_CHOICES = (10, 25, 50, 100, 250, 500)  # what the screen offers
MAX_PRICE_DECIMALS = 8  # a price has at most this many decimals (the database checks it too)
MAX_PRICE = Decimal("1000000000000")  # a sanity limit, far above any price of the Exchange

RISING = "rising"
FALLING = "falling"
SIDES = (RISING, FALLING)

ONE_HUNDRED = Decimal(100)
TWO_DECIMALS = Decimal("0.01")
EIGHT_DECIMALS = Decimal(1).scaleb(-MAX_PRICE_DECIMALS)


@dataclass(frozen=True)
class Closing:
    """What closing a position at a price pays. All numbers are whole coins."""

    value: int  # what the position is worth, before the closing fee
    fee: int  # the closing fee: the fee of the stake, but never more than the value
    coins_change: int  # what reaches the wallet: value - fee
    used_up: bool  # True if the price is at or past the zero point


@dataclass(frozen=True)
class StakeChoice:
    """One stake the screen offers, with the opening fee and what it costs in all."""

    stake: int
    fee: int
    total: int  # stake + fee: what leaves the wallet when the position opens


def check_side(side: str) -> None:
    if side not in SIDES:
        raise ValueError(f"The side must be '{RISING}' or '{FALLING}'.")


def round_price(price: Decimal) -> Decimal:
    """A finite price with at most MAX_PRICE_DECIMALS decimals; more are rounded half to even.

    A price that already fits is returned as it is (0.1 stays 0.1, no zeros are added).
    """
    if price.as_tuple().exponent >= -MAX_PRICE_DECIMALS:
        return price
    return price.quantize(EIGHT_DECIMALS, rounding=ROUND_HALF_EVEN)


def check_price(price: Decimal) -> None:
    """A price must be above 0 with at most 8 decimals. Raises ValueError if it is not."""
    if not price.is_finite() or price <= 0 or price >= MAX_PRICE:
        raise ValueError("A price must be above 0 and below one trillion.")
    try:
        has_too_many_decimals = price.quantize(EIGHT_DECIMALS) != price
    except InvalidOperation as error:
        raise ValueError("A price must have at most 8 decimals.") from error
    if has_too_many_decimals:
        raise ValueError("A price must have at most 8 decimals.")


def check_stake(stake: int) -> None:
    """A stake from MIN_STAKE_COINS to MAX_STAKE_COINS. Raises a 422 ApiError if it is not."""
    if stake < MIN_STAKE_COINS:
        raise ApiError(
            422,
            "stake_too_small",
            f"A position needs a stake of at least {MIN_STAKE_COINS} coins.",
        )
    if stake > MAX_STAKE_COINS:
        raise ApiError(
            422,
            "stake_too_big",
            f"A position can have a stake of at most {MAX_STAKE_COINS} coins.",
        )


def fee_basis_points(is_relit: bool) -> int:
    """The fee rate in basis points: 2 % before the Relighting, 1 % after it."""
    return RELIT_FEE_BASIS_POINTS if is_relit else FEE_BASIS_POINTS


def fee_for(stake: int, basis_points: int) -> int:
    """The fee: the rate of the stake, rounded up (so a fee is at least 1 coin)."""
    exact_fee = Decimal(stake * basis_points) / BASIS_POINTS_IN_WHOLE
    return int(exact_fee.to_integral_value(rounding=ROUND_CEILING))


def zero_price(side: str, entry: Decimal) -> Decimal:
    """The price where the position is used up: 90 % of the entry (rising) or 110 % (falling)."""
    check_side(side)
    if side == RISING:
        return entry * (LEVERAGE - 1) / LEVERAGE
    return entry * (LEVERAGE + 1) / LEVERAGE


def is_used_up(side: str, entry: Decimal, price: Decimal) -> bool:
    """True when the price is at the zero point or beyond it (a jump past it counts too)."""
    point = zero_price(side, entry)
    if side == RISING:
        return price <= point
    return price >= point


def position_value(side: str, stake: int, entry: Decimal, price: Decimal) -> int:
    """What the position is worth now, in whole coins: rounded down, never below 0.

    Example: stake 100, rising, entry 76000.00, price 77520.00 (+2 %): the value is 120.
    """
    check_side(side)
    move = price - entry
    if side == RISING:
        top_part = stake * (entry + LEVERAGE * move)
    else:
        top_part = stake * (entry - LEVERAGE * move)
    if top_part <= 0:
        return 0
    return min(int(top_part // entry), MAX_VALUE_COINS)


def opening_costs(stake: int, basis_points: int) -> int:
    """What leaves the wallet when a position opens: the stake plus the opening fee."""
    return stake + fee_for(stake, basis_points)


def closing_amounts(
    side: str, stake: int, entry: Decimal, price: Decimal, basis_points: int
) -> Closing:
    """What closing the position at `price` pays. A used-up position pays 0 and charges no fee."""
    value = position_value(side, stake, entry, price)
    fee = min(fee_for(stake, basis_points), value)
    return Closing(
        value=value,
        fee=fee,
        coins_change=value - fee,
        used_up=is_used_up(side, entry, price),
    )


def profit(value: int, stake: int) -> int:
    """Coins won (positive) or lost (negative) before any fee."""
    return value - stake


def profit_percent(value: int, stake: int) -> Decimal:
    """The profit in percent of the stake, with two decimals (for display)."""
    percent = Decimal(value - stake) * ONE_HUNDRED / stake
    return percent.quantize(TWO_DECIMALS, rounding=ROUND_HALF_UP)


def result_of(value: int, close_fee: int, stake: int, open_fee: int) -> int:
    """What the whole position has made or lost, with both fees counted."""
    return value - close_fee - stake - open_fee


def stake_choices(basis_points: int) -> tuple[StakeChoice, ...]:
    """The stakes the screen offers, each with its opening fee and total cost."""
    return tuple(
        StakeChoice(stake, fee_for(stake, basis_points), opening_costs(stake, basis_points))
        for stake in STAKE_CHOICES
    )
