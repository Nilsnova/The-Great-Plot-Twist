"""The recorded day that plays in demo mode: 90 minutes of real Binance prices.

In demo mode (DEMO_MODE=true) the Exchange never calls Binance. It plays this recording as if it
were happening now, so a demo or a rehearsal works without internet. The recorded minute that
plays comes from the clock, so every server instance plays the same minute at the same moment.

The replay plays forward through its minutes, then backward, then forward again, forever. Going
back and forth means the price never jumps at the end of the recording.

Why the replay never plays in live mode (D017). The file is in the repository and the minute that
plays comes from the clock. Anybody can read the next prices from the file and trade against them
without risk. That is acceptable in a demo, where nothing real is at stake, but a live Exchange
must never fall back to it. If Binance is away, the live Exchange shows the old prices and closes
for trading. Positions opened on the recording can only be closed on the recording (rule R20).

The replay is a derivative of Binance Vision public data. Its licence (CC BY-NC-SA 4.0) and credit
("Binance Vision") are written in the file itself and are shown next to the prices. It holds only
the seven island pairs: stock companies are not part of the recording (rule R24).

Used by: feed.py (plays it), exchange.py (the credit and the demo label) and the tests.
"""

import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path

from server.market import CONTENT_FOLDER

REPLAY_FILE = CONTENT_FOLDER / "replay.json"
MIN_REPLAY_CANDLES = 2


class ReplayError(ValueError):
    """The replay file is not usable. The message says why."""


@dataclass(frozen=True)
class Replay:
    """The recorded prices: for every symbol, one closing price per minute."""

    closes: Mapping[str, tuple[Decimal, ...]]
    candles: int  # how many minutes are recorded
    candle_seconds: int  # the length of one candle (60)
    credit: str  # whom to credit: "Binance Vision"
    licence: str  # the licence of the data: "CC BY-NC-SA 4.0"
    licence_url: str | None = None  # where the licence text is, for a link next to the prices
    recorded_on: date | None = None  # the day that was recorded, for the demo label


@dataclass(frozen=True)
class ReplayMinute:
    """The recorded prices that play at one moment."""

    as_of: datetime  # the start of the minute that plays
    prices: Mapping[str, Decimal]


def read_replay_closes(raw: object, candles: int) -> dict[str, tuple[Decimal, ...]]:
    """The closing prices of the replay file: for each symbol a list of `candles` numbers."""
    if not isinstance(raw, dict) or not raw:
        raise ReplayError("The replay has no prices.")
    closes: dict[str, tuple[Decimal, ...]] = {}
    for symbol, values in raw.items():
        if not isinstance(values, list) or len(values) != candles:
            raise ReplayError(f"The replay for {symbol} does not have {candles} prices.")
        prices = []
        for value in values:
            # JSON numbers without a decimal point (78630) arrive as int, the rest as Decimal.
            if isinstance(value, bool) or not isinstance(value, int | Decimal) or value <= 0:
                raise ReplayError(f"The replay for {symbol} has a price that is not above 0.")
            prices.append(Decimal(value))
        closes[symbol] = tuple(prices)
    return closes


def read_replay_text(data: dict, name: str) -> str:
    """A text field of the replay file that must not be empty (the credit and the licence)."""
    value = data.get(name)
    if not isinstance(value, str) or not value.strip():
        raise ReplayError(
            f"The replay file must have a '{name}' (credit and licence are required)."
        )
    return value


def read_replay_link(data: dict) -> str | None:
    """The web address of the licence text (licenceUrl). Optional, but it must be a web address."""
    value = data.get("licenceUrl")
    if value is None:
        return None
    if not isinstance(value, str) or not value.startswith("https://"):
        raise ReplayError("'licenceUrl' must be a web address that starts with https://.")
    return value


def read_recorded_on(data: dict) -> date | None:
    """The day of the first recorded candle (firstCandleUtc). Optional."""
    value = data.get("firstCandleUtc")
    if value is None:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()
    except ValueError as error:
        raise ReplayError("'firstCandleUtc' must be a time like 2026-11-04T11:00:00Z.") from error


def load_replay(path: Path = REPLAY_FILE) -> Replay:
    """Read and check the replay file. Raises ReplayError if it is not usable."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"), parse_float=Decimal)
    except (OSError, ValueError) as error:
        raise ReplayError(f"Cannot read {path.name}: {type(error).__name__}.") from error
    if not isinstance(data, dict):
        raise ReplayError("The replay file must be a JSON object.")
    candles = data.get("candles")
    candle_seconds = data.get("candleSeconds")
    if not isinstance(candles, int) or candles < MIN_REPLAY_CANDLES:
        raise ReplayError(f"'candles' must be a whole number of at least {MIN_REPLAY_CANDLES}.")
    if not isinstance(candle_seconds, int) or candle_seconds < 1:
        raise ReplayError("'candleSeconds' must be a whole number above 0.")
    return Replay(
        closes=read_replay_closes(data.get("closes"), candles),
        candles=candles,
        candle_seconds=candle_seconds,
        credit=read_replay_text(data, "credit"),
        licence=read_replay_text(data, "licence"),
        licence_url=read_replay_link(data),
        recorded_on=read_recorded_on(data),
    )


def check_has_symbols(replay: Replay, symbols: Sequence[str]) -> None:
    """The replay must have prices for every island pair. Raises ReplayError if one is missing."""
    missing = [symbol for symbol in symbols if symbol not in replay.closes]
    if missing:
        raise ReplayError(f"The replay has no prices for: {', '.join(missing)}.")


def ping_pong_index(step: int, length: int) -> int:
    """Which recorded minute plays at `step`: 0, 1, ... length-1, length-2, ... 1, 0, 1, ...

    Forward, then backward, forever. With length 4 the steps 0 to 7 give 0 1 2 3 2 1 0 1.
    """
    turn_length = 2 * (length - 1)
    position = step % turn_length
    return position if position < length else turn_length - position


def replay_minute(replay: Replay, symbols: Sequence[str], now: datetime) -> ReplayMinute:
    """The recorded prices that play at `now`. The same time always gives the same prices."""
    step = int(now.timestamp()) // replay.candle_seconds
    index = ping_pong_index(step, replay.candles)
    prices = {symbol: replay.closes[symbol][index] for symbol in symbols}
    as_of = datetime.fromtimestamp(step * replay.candle_seconds, UTC)
    return ReplayMinute(as_of, prices)
