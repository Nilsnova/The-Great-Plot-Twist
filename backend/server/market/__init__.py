"""The Island Exchange: real prices, 10x positions, play money only.

Seven invented island companies follow real instruments at their real Binance prices, and real
stock companies follow their real share prices (when a stock-price key exists). A player puts a
stake of coins into a position that is 10x, rising or falling. If the price moves 10 % against the
position, it is used up and closes by itself at zero. Coins cannot be bought, cashed out or
exchanged for real prizes. The screen says "simulation". Everything that decides money or prices
happens in this package, on the server.

Where things are (one job per file):
    positions.py    the MONEY rules: zero point, value, fees, stake limits. Pure functions.
    game_day.py     the game day that starts at 08:00 Lisbon time (the daily stake cap).
    calendars.py    the opening hours of the stock markets, from content/market/calendars.json.
    companies.py    the list of companies, from content/market/companies.json.
    readings.py     what a price source knows about one company at one moment.
    states.py       the status of a company (open, closed, stale, unavailable). Pure functions.
    binance.py      the Binance request and its answer (the island companies).
    replay.py       the recorded day that plays in demo mode.
    stocks.py       the stock source: providers, the call budget, sending the requests.
    stock_finnhub.py  the Finnhub provider (one quote per request).
    feed.py         the caches and the freshness of every price, per source.
    limits.py       the speed limit for trades: 10 per player in 30 seconds.
    store.py        reads the database: positions, events, the daily stakes and the wallet.
    store_calls.py  calls the three database functions that open, close and sweep positions.
    messages.py     the plain-English texts of the refusals.
    board.py        the price board: every company with its status and price.
    sweeps.py       the automatic close of used-up positions.
    portfolio.py    a player's positions with their value now.
    trading.py      opening and closing a position, step by step.
    exchange.py     puts the pieces together for the routes: MarketService.

Data files (not code) are in backend/content/market/: companies.json, calendars.json, replay.json
and a README. The database part is supabase/migrations/20261106090000_exchange_leverage.sql.
The rules and the reasons are in docs/DECISIONS.md (D017) and specs/L4-exchange-v2.md.
"""

from pathlib import Path

# backend/server/market/__init__.py -> parents[2] is backend/
CONTENT_FOLDER = Path(__file__).resolve().parents[2] / "content" / "market"
