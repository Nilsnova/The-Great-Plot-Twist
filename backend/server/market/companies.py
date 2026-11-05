"""The list of Island Exchange companies, loaded from backend/content/market/companies.json.

Company data (names, tickers, which real instrument each one follows, its first price) lives in a
data file, not in code. This file reads it, checks every field and hands out Company objects. A
mistake in the file stops the server at start-up with a message that names the company and the
field, so a typo cannot hide until a player trades.

Used by: exchange.py (the price board and trades), feed.py (which Binance symbols to ask for) and
the tests.
"""

import json
import string
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path

from server.market.rules import CEILING_PERCENT_OF_START, FLOOR_PERCENT_OF_START, ONE_HUNDRED
from server.market.trade_rules import MAX_TRADE_COINS, MIN_TRADE_COINS

# backend/server/market/companies.py -> parents[2] is backend/
CONTENT_FOLDER = Path(__file__).resolve().parents[2] / "content" / "market"
COMPANIES_FILE = CONTENT_FOLDER / "companies.json"

# The database allows the same characters for a company id (see the SQL check rules).
ID_CHARACTERS = set(string.ascii_lowercase + string.digits + "-")
SYMBOL_CHARACTERS = set(string.ascii_uppercase + string.digits)
TICKER_CHARACTERS = set(string.ascii_uppercase)

MAX_COMPANIES = 20
# A company must always be tradable. Its price stays between a quarter and four times its start
# price (rules.py, rule 2). At the floor one unit must still be worth a whole coin, and at the
# ceiling one unit must still fit into one purchase. With the numbers today that is 4.00 to 125.00.
MIN_START_PRICE = Decimal(MIN_TRADE_COINS) * ONE_HUNDRED / FLOOR_PERCENT_OF_START
MAX_START_PRICE = Decimal(MAX_TRADE_COINS) * ONE_HUNDRED / CEILING_PERCENT_OF_START


class CompaniesError(ValueError):
    """The companies file has a problem. The message says where."""


@dataclass(frozen=True)
class Company:
    """One fictional island company."""

    id: str  # lowercase words joined by hyphens, for example "harbor-trust"
    name: str  # the name players see
    ticker: str  # 2 to 5 capital letters
    follows: str  # the real instrument, for people: "BTC", "Gold"
    symbol: str  # the Binance trading pair the price comes from, for example "BTCUSDT"
    start_price: Decimal  # the first game price, in coins, with at most 2 decimals
    tagline: str  # one short line of flavour text


def read_text_field(
    entry: dict, name: str, where: str, shortest: int, longest: int, allowed: set | None
) -> str:
    """A text field: the right length, not blank, and only made of the allowed characters."""
    value = entry.get(name)
    if not isinstance(value, str) or not value.strip():
        raise CompaniesError(f"{where}: '{name}' must be text that is not empty.")
    if not shortest <= len(value) <= longest:
        raise CompaniesError(f"{where}: '{name}' must be {shortest} to {longest} characters long.")
    if allowed is not None and not set(value) <= allowed:
        raise CompaniesError(f"{where}: '{name}' has a character that is not allowed.")
    return value


def read_start_price(entry: dict, where: str) -> Decimal:
    """The first price: a number from MIN_START_PRICE to MAX_START_PRICE with at most 2 decimals."""
    value = entry.get("startPrice")
    if not isinstance(value, Decimal):
        raise CompaniesError(f"{where}: 'startPrice' must be a number with a decimal point.")
    if value != value.quantize(Decimal("0.01")):
        raise CompaniesError(f"{where}: 'startPrice' can have at most 2 decimals.")
    if not MIN_START_PRICE <= value <= MAX_START_PRICE:
        raise CompaniesError(
            f"{where}: 'startPrice' must be from {MIN_START_PRICE:.2f} to {MAX_START_PRICE:.2f}, "
            "so that one unit stays tradable from the floor to the ceiling of its price."
        )
    return value


def read_company(entry: object, position: int) -> Company:
    """Check one entry of the file and turn it into a Company."""
    where = f"companies[{position}]"
    if not isinstance(entry, dict):
        raise CompaniesError(f"{where} must be an object.")
    return Company(
        id=read_text_field(entry, "id", where, 2, 40, ID_CHARACTERS),
        name=read_text_field(entry, "name", where, 2, 40, None),
        ticker=read_text_field(entry, "ticker", where, 2, 5, TICKER_CHARACTERS),
        follows=read_text_field(entry, "follows", where, 2, 12, None),
        symbol=read_text_field(entry, "symbol", where, 5, 20, SYMBOL_CHARACTERS),
        start_price=read_start_price(entry, where),
        tagline=read_text_field(entry, "tagline", where, 1, 120, None),
    )


def check_no_duplicates(companies: list[Company]) -> None:
    """Every id, ticker and symbol is used by exactly one company."""
    for field_name in ("id", "ticker", "symbol"):
        values = [getattr(company, field_name) for company in companies]
        if len(values) != len(set(values)):
            raise CompaniesError(f"Two companies share the same '{field_name}'.")


def load_companies(path: Path = COMPANIES_FILE) -> tuple[Company, ...]:
    """Read and check the companies file. Raises CompaniesError if anything is wrong."""
    try:
        # parse_float=Decimal keeps 60.00 exactly as 60.00 instead of a float.
        data = json.loads(path.read_text(encoding="utf-8"), parse_float=Decimal)
    except (OSError, ValueError) as error:
        raise CompaniesError(f"Cannot read {path.name}: {type(error).__name__}.") from error
    entries = data.get("companies") if isinstance(data, dict) else None
    if not isinstance(entries, list) or not 1 <= len(entries) <= MAX_COMPANIES:
        raise CompaniesError(f"'companies' must be a list of 1 to {MAX_COMPANIES} entries.")
    companies = [read_company(entry, position) for position, entry in enumerate(entries)]
    check_no_duplicates(companies)
    return tuple(companies)
