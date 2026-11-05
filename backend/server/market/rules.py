"""Island Exchange price rules: how a real price turns into a game price.

Pure Python. These functions touch no network, no database and no clock of their own. They take
plain values and return plain values, so the tests can check them with fixed numbers
(backend/server/tests/test_market_rules.py).

The rules, in plain words
  1. Amplified price. Every company follows one real instrument (BTC, gold, ...). Its game price is

         base game price x (1 + MULTIPLIER x real change since the base)

     "Real change" is a fraction: a real move of +0.12 % is 0.0012. With the default MULTIPLIER of
     100 that becomes +12 % in the game. So a real move of just 0.3 % is already a 30 % game move.
  2. Floor and ceiling. A game price never falls below 25 % of the company's START price (the
     startPrice in companies.json) and never rises above 400 % of it (four times). Both are
     measured from the START price, which never changes. They are NOT measured from the base: the
     base moves with every pause, so a floor of "5 % of the base" never acted. The breaker (rule 3)
     always fired first, every pause locked in a step of 30 %, and the prices of a volatile company
     sank toward one cent within days. At one cent no real move could change the price any more.
     (Found by the independent review, see docs/DECISIONS.md, D017.)
     When a price sits on the floor or the ceiling it stays there until the real price has moved
     back past the real price of the base, or until the next daily re-base (rule 4).
  3. Circuit breaker. When the game price is 30 % away from its base, up or down, the company is
     paused for 15 minutes. While it is paused its price is frozen at that 30 % limit (a jump
     cannot go further than the limit) and nobody can trade it. Shares are NOT sold for the
     players: a pause only stops trading. After the pause the company restarts from the frozen
     price and measures real moves from the real price at that moment.
  4. Daily re-base. The first time anybody looks after 08:00 Lisbon time, every company gets a new
     base: its game price stays what it is, and the real price of that moment becomes the new
     starting point. Nobody's shares change value, but every day starts with a fresh 30 % band.
  5. Source change. If the real prices now come from another source than when the base was set (the
     live feed against the recorded replay), the two real prices cannot be compared. The company
     goes back to its base game price and starts measuring from the new source. The move since
     the base is dropped, so the price can step back by up to 30 % at that moment. This happens
     only when somebody changes DEMO_MODE on a server that shares the database: the live server
     never plays the replay (feed.py), so a Binance outage does not switch the source.

A BASE is the pair (game price, real price) that moves are measured from. The database keeps one
base per company, so every Vercel instance agrees on the base and on a pause (the table
market_bases in the migration). Each instance still works out the price from its own copy of the
real prices, so two instances can differ by the age of that copy.

Prices are Decimal numbers, not floats, so the cents come out exactly. The game price is rounded
to whole cents (0.01 coin). Coins in a wallet are whole numbers: that is trade_rules.py.

Used by: exchange.py (the price board and trades), settings.py (the multiplier limits) and
companies.py (the lowest and highest price of a company must be tradable).
"""

import logging
from dataclasses import dataclass, replace
from datetime import UTC, datetime, time, timedelta, tzinfo
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

logger = logging.getLogger(__name__)

# --- The numbers that make the rules. Change them here and nowhere else. ---

# The multiplier is a setting (MARKET_MULTIPLIER). These are the values it may take.
MIN_MULTIPLIER = 20
MAX_MULTIPLIER = 100
DEFAULT_MULTIPLIER = 100

FLOOR_PERCENT_OF_START = Decimal(25)  # a price never falls below 25 % of the start price
CEILING_PERCENT_OF_START = Decimal(400)  # ... and never rises above 400 % (4 times) of it
MIN_PRICE = Decimal("0.01")  # a last safety net: never below one cent, whatever the file says
BREAKER_PERCENT = Decimal(30)  # a move of 30 % from the base pauses the company
HALT_MINUTES = 15  # how long a paused company stays paused

# The market day starts at 08:00 Lisbon time. That is also the moment of the daily re-base.
MARKET_TIMEZONE_NAME = "Europe/Lisbon"
MARKET_DAY_START_HOUR = 8

# Which kind of real prices a base was measured with.
LIVE = "live"  # the real feed (also when the answer came from the cache or is a little old)
REPLAY = "replay"  # the recorded prices that play back when the real feed is not available

CENT = Decimal("0.01")
ONE_HUNDRED = Decimal(100)


def load_market_timezone() -> tzinfo:
    """The timezone of the market day (Lisbon). Falls back to UTC if the server has no tz data.

    Lisbon is on UTC+0 in winter, so UTC gives the same 08:00 from the end of October to the end
    of March, which covers the whole class game. Only in summer would the fallback be one hour off.
    """
    try:
        return ZoneInfo(MARKET_TIMEZONE_NAME)
    except ZoneInfoNotFoundError:
        logger.warning("No timezone database on this server: the market day uses UTC.")
        return UTC


MARKET_TIMEZONE = load_market_timezone()


@dataclass(frozen=True)
class Base:
    """What the database remembers about one company between two looks at it."""

    game_price: Decimal  # the game price at the moment the base was set
    real_price: Decimal  # the real price at that moment
    set_at: datetime  # when the base was set
    source: str  # LIVE or REPLAY: the kind of real price used for real_price
    halted_until: datetime | None = None  # None unless the company is paused
    frozen_price: Decimal | None = None  # the price while paused (None unless paused)
    version: int = 0  # counts the saves; 0 means not saved yet. See market_set_base in the SQL.


@dataclass(frozen=True)
class Evaluation:
    """The result of looking at one company: its price now, and what the database must learn."""

    price: Decimal  # the game price to show and to trade at
    move_percent: Decimal  # how far the price is from the base game price, in percent
    halted_until: datetime | None  # None unless the company is paused right now
    base: Base  # the base after this look (the same as before if nothing changed)
    must_save: bool  # True if `base` is new and has to be saved in the database


def round_price(value: Decimal) -> Decimal:
    """Round to whole cents, halves upwards. The one place where game prices are rounded."""
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def price_limits(start_price: Decimal) -> tuple[Decimal, Decimal]:
    """Rule 2: the lowest and the highest price a company may have, from its START price."""
    lowest = start_price * FLOOR_PERCENT_OF_START / ONE_HUNDRED
    highest = start_price * CEILING_PERCENT_OF_START / ONE_HUNDRED
    return lowest, highest


def price_from_real(
    base_game_price: Decimal,
    base_real_price: Decimal,
    real_price: Decimal,
    multiplier: int,
    start_price: Decimal,
) -> Decimal:
    """Rules 1 and 2: the amplified game price, held between the floor and the ceiling.

    Example: base game price 100, base real price 50000, real price now 50060 (+0.12 %),
    multiplier 100, start price 100: the game price is 100 x (1 + 100 x 0.0012) = 112.00.
    """
    real_change = real_price / base_real_price - 1
    amplified = base_game_price * (1 + multiplier * real_change)
    lowest, highest = price_limits(start_price)
    limited = max(lowest, min(amplified, highest))
    return max(round_price(limited), MIN_PRICE)


def move_percent(price: Decimal, base_game_price: Decimal) -> Decimal:
    """How far a price is from the base game price, in percent. +12.00 means 12 % above."""
    return round_price((price / base_game_price - 1) * ONE_HUNDRED)


def has_hit_breaker(price: Decimal, base_game_price: Decimal) -> bool:
    """Rule 3: True when the price is 30 % or more away from the base, up or down."""
    limit = BREAKER_PERCENT / ONE_HUNDRED
    return abs(price / base_game_price - 1) >= limit


def limit_to_breaker_band(price: Decimal, base_game_price: Decimal) -> Decimal:
    """Rule 3: hold a price inside the 30 % band around the base.

    The price a paused company is frozen at. A huge one-minute jump (or a wrong tick from the
    feed) can therefore change a price by at most 30 % in one go, never by 300 %.
    """
    limit = BREAKER_PERCENT / ONE_HUNDRED
    highest = base_game_price * (1 + limit)
    lowest = base_game_price * (1 - limit)
    return max(round_price(max(lowest, min(highest, price))), MIN_PRICE)


def market_day_start(now: datetime) -> datetime:
    """Rule 4: the latest 08:00 Lisbon time that is not after `now`, as a UTC time."""
    local_now = now.astimezone(MARKET_TIMEZONE)
    start = datetime.combine(local_now.date(), time(MARKET_DAY_START_HOUR), tzinfo=MARKET_TIMEZONE)
    if start > local_now:
        yesterday = local_now.date() - timedelta(days=1)
        start = datetime.combine(yesterday, time(MARKET_DAY_START_HOUR), tzinfo=MARKET_TIMEZONE)
    return start.astimezone(UTC)


def make_evaluation(base: Base, price: Decimal, must_save: bool) -> Evaluation:
    """Wrap a base and a price in an Evaluation. The move is measured from the base."""
    return Evaluation(
        price=price,
        move_percent=move_percent(price, base.game_price),
        halted_until=base.halted_until,
        base=base,
        must_save=must_save,
    )


def pause_company(base: Base, price: Decimal, now: datetime) -> Evaluation:
    """Rule 3: the breaker has tripped. Freeze the price at the limit and pause for 15 minutes."""
    frozen_price = limit_to_breaker_band(price, base.game_price)
    halted_until = now + timedelta(minutes=HALT_MINUTES)
    paused = replace(base, halted_until=halted_until, frozen_price=frozen_price)
    return make_evaluation(paused, frozen_price, must_save=True)


def look_at_paused_company(
    base: Base, real_price: Decimal, source: str, now: datetime
) -> Evaluation:
    """A company that was paused: still frozen, or restarted if the 15 minutes are over."""
    frozen_price = base.frozen_price if base.frozen_price is not None else base.game_price
    if now < base.halted_until:
        return make_evaluation(base, frozen_price, must_save=False)
    # The pause is over. Restart from the frozen price and measure from the real price right now.
    restarted = replace(
        base,
        game_price=frozen_price,
        real_price=real_price,
        set_at=now,
        source=source,
        halted_until=None,
        frozen_price=None,
    )
    return make_evaluation(restarted, frozen_price, must_save=True)


def restart_for_new_source(
    base: Base, real_price: Decimal, source: str, now: datetime
) -> Evaluation:
    """Rule 5: the real prices come from another source now. Back to the base game price."""
    restarted = replace(base, real_price=real_price, set_at=now, source=source)
    return make_evaluation(restarted, restarted.game_price, must_save=True)


def rebase_for_new_day(
    base: Base, price: Decimal, real_price: Decimal, now: datetime
) -> Evaluation:
    """Rule 4: a new market day. The price stays, the real price of now becomes the new start."""
    rebased = replace(base, game_price=price, real_price=real_price, set_at=now)
    return make_evaluation(rebased, price, must_save=True)


def evaluate(
    base: Base | None,
    start_price: Decimal,
    real_price: Decimal,
    source: str,
    now: datetime,
    multiplier: int,
) -> Evaluation:
    """Look at one company and work out its price. This is the whole price logic.

    base         what the database remembers, or None if the company has never been looked at
    start_price  the company's first game price (from companies.json). It is the first base, and
                 the floor and the ceiling of the price are measured from it (rule 2)
    real_price   the real price of its instrument right now
    source       LIVE or REPLAY: where real_price comes from
    now          the current time (a fake time in tests)
    multiplier   how strongly real moves are amplified (20 to 100)

    The checks run in this order, and the first that applies wins.
    """
    if base is None:
        first_base = Base(start_price, real_price, now, source)
        return make_evaluation(first_base, start_price, must_save=True)
    if base.halted_until is not None:
        return look_at_paused_company(base, real_price, source, now)
    if base.source != source:
        return restart_for_new_source(base, real_price, source, now)

    price = price_from_real(base.game_price, base.real_price, real_price, multiplier, start_price)
    if has_hit_breaker(price, base.game_price):
        return pause_company(base, price, now)
    if base.set_at < market_day_start(now):
        return rebase_for_new_day(base, price, real_price, now)
    return make_evaluation(base, price, must_save=False)
