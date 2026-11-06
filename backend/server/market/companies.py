"""The list of Island Exchange companies, loaded from backend/content/market/companies.json.

Company data (names, tickers, which real instrument or share each one follows, how its price is
shown) lives in a data file, not in code. This file reads it, checks every field and hands out
Company objects. A mistake in the file stops the server at start-up with a message that names the
company and the field, so a typo cannot hide until a player trades.

Two kinds of company:
  island  an invented company that follows one Binance pair (symbol, for example BTCUSDT). It
          trades around the clock (market "always").
  stock   a real listed company shown with its real name and real share price. It has no symbol:
          the stock source finds the share by ticker and market. Its market must be one of the
          markets in calendars.json, because it can be traded only while that market is open.

Used by: exchange.py (the board and trades), feed.py (which prices to ask for), the routes and
the tests.
"""

import json
import re
from collections.abc import Collection
from dataclasses import dataclass
from pathlib import Path

from server.market import CONTENT_FOLDER
from server.market.calendars import ALWAYS, load_calendars

COMPANIES_FILE = CONTENT_FOLDER / "companies.json"

MAX_COMPANIES = 20
ISLAND = "island"
STOCK = "stock"
KINDS = (ISLAND, STOCK)
MAX_PRICE_DECIMALS = 8

# Each pattern must match the whole text. The database allows the same characters for an id.
ID_PATTERN = re.compile(r"[a-z0-9-]{2,40}")
TICKER_PATTERN = re.compile(r"[A-Z0-9]{1,6}")
SYMBOL_PATTERN = re.compile(r"[A-Z0-9]{5,20}")
CURRENCY_PATTERN = re.compile(r"[A-Z]{3,5}")


class CompaniesError(ValueError):
    """The companies file has a problem. The message says where."""


@dataclass(frozen=True)
class Company:
    """One company of the Exchange."""

    id: str  # lowercase words joined by hyphens, for example "harbor-trust"
    name: str  # the name players see
    ticker: str  # capital letters and digits: invented (island) or the real one (stock)
    kind: str  # ISLAND or STOCK
    follows: str  # the real instrument or share, in words, shown next to the name
    symbol: str | None  # the Binance pair of an island company, for example "BTCUSDT"
    market: str  # "always" for island companies, else a market id from calendars.json
    currency: str  # what the price is in: "USDT", "USD", ...
    price_decimals: int  # how many decimals the screen shows (display only)
    tagline: str  # one short line of flavour text
    delist_at_relighting: bool = False  # True: no new positions after the Relighting

    @property
    def is_stock(self) -> bool:
        return self.kind == STOCK


def read_text_field(
    entry: dict,
    name: str,
    where: str,
    shortest: int,
    longest: int,
    pattern: re.Pattern | None = None,
) -> str:
    """A text field: the right length, not blank, and (if given) matching the pattern."""
    value = entry.get(name)
    if not isinstance(value, str) or not value.strip():
        raise CompaniesError(f"{where}: '{name}' must be text that is not empty.")
    if not shortest <= len(value) <= longest:
        raise CompaniesError(f"{where}: '{name}' must be {shortest} to {longest} characters long.")
    if pattern is not None and not pattern.fullmatch(value):
        raise CompaniesError(f"{where}: '{name}' has a character or a form that is not allowed.")
    return value


def read_price_decimals(entry: dict, where: str) -> int:
    value = entry.get("priceDecimals")
    # bool is a kind of int in Python (True == 1), so it needs its own check.
    if (
        isinstance(value, bool)
        or not isinstance(value, int)
        or not 0 <= value <= MAX_PRICE_DECIMALS
    ):
        raise CompaniesError(
            f"{where}: 'priceDecimals' must be a whole number from 0 to {MAX_PRICE_DECIMALS}."
        )
    return value


def read_symbol(entry: dict, kind: str, where: str) -> str | None:
    """An island company has a Binance pair. A stock has none (ticker and market find it)."""
    if kind == STOCK:
        if "symbol" in entry:
            raise CompaniesError(f"{where}: 'symbol' must be left out for a stock company.")
        return None
    return read_text_field(entry, "symbol", where, 5, 20, SYMBOL_PATTERN)


def read_market(entry: dict, kind: str, where: str, market_ids: Collection[str]) -> str:
    """Island companies trade around the clock. A stock needs a market from calendars.json."""
    market = entry.get("market")
    if kind == ISLAND and market != ALWAYS:
        raise CompaniesError(f"{where}: 'market' must be '{ALWAYS}' for an island company.")
    if kind == STOCK and market not in market_ids:
        raise CompaniesError(
            f"{where}: 'market' is '{market}', which is not a market of calendars.json."
        )
    return str(market)


def read_delist_flag(entry: dict, where: str) -> bool:
    """Optional. When present it must be exactly true."""
    if "delistAtRelighting" not in entry:
        return False
    if entry["delistAtRelighting"] is not True:
        raise CompaniesError(f"{where}: 'delistAtRelighting' must be true when it is there.")
    return True


def read_company(entry: object, position: int, market_ids: Collection[str]) -> Company:
    """Check one entry of the file and turn it into a Company."""
    where = f"companies[{position}]"
    if not isinstance(entry, dict):
        raise CompaniesError(f"{where} must be an object.")
    company_id = read_text_field(entry, "id", where, 2, 40, ID_PATTERN)
    where = f"{where} ({company_id})"
    kind = entry.get("kind")
    if kind not in KINDS:
        raise CompaniesError(f"{where}: 'kind' must be '{ISLAND}' or '{STOCK}'.")
    return Company(
        id=company_id,
        name=read_text_field(entry, "name", where, 2, 40),
        ticker=read_text_field(entry, "ticker", where, 1, 6, TICKER_PATTERN),
        kind=kind,
        follows=read_text_field(entry, "follows", where, 2, 60),
        symbol=read_symbol(entry, kind, where),
        market=read_market(entry, kind, where, market_ids),
        currency=read_text_field(entry, "currency", where, 3, 5, CURRENCY_PATTERN),
        price_decimals=read_price_decimals(entry, where),
        tagline=read_text_field(entry, "tagline", where, 1, 120),
        delist_at_relighting=read_delist_flag(entry, where),
    )


def check_no_duplicates(companies: list[Company]) -> None:
    """Every id, ticker and Binance pair is used by exactly one company."""
    for field_name in ("id", "ticker", "symbol"):
        values = [getattr(company, field_name) for company in companies]
        values = [value for value in values if value is not None]
        if len(values) != len(set(values)):
            raise CompaniesError(f"Two companies share the same '{field_name}'.")


def load_companies(
    path: Path = COMPANIES_FILE, market_ids: Collection[str] | None = None
) -> tuple[Company, ...]:
    """Read and check the companies file. Raises CompaniesError if anything is wrong.

    `market_ids` are the markets a stock may belong to. By default they come from calendars.json.
    """
    if market_ids is None:
        market_ids = set(load_calendars().markets)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise CompaniesError(f"Cannot read {path.name}: {type(error).__name__}.") from error
    entries = data.get("companies") if isinstance(data, dict) else None
    if not isinstance(entries, list) or not 1 <= len(entries) <= MAX_COMPANIES:
        raise CompaniesError(f"'companies' must be a list of 1 to {MAX_COMPANIES} entries.")
    companies = [
        read_company(entry, position, market_ids) for position, entry in enumerate(entries)
    ]
    check_no_duplicates(companies)
    return tuple(companies)
