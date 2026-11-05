"""The Island Exchange: fictional island companies whose play-money prices follow real markets.

Used by: routes/market.py (the three URLs), app.py (builds the service) and settings.py (the
multiplier limits).

Play money only. Coins cannot be bought, cashed out or exchanged for real prizes. The screen says
"simulation". Everything that decides money or prices happens in this package, on the server.

Where things are (one job per file):
    rules.py        the PRICE rules: real price to game price, the floor and the ceiling, the 30 %
                    circuit breaker, the daily re-base. Pure functions, tested with fixed numbers.
    trade_rules.py  the TRADE rules: whole coins and rounding, the fee, the trade limits, the
                    minimum holding time. Pure functions too.
    limits.py       the speed limit for trades: 10 per player in 30 seconds.
    companies.py    loads the list of companies from backend/content/market/companies.json.
    feed.py         the real prices: Binance market data (cached for 60 seconds for the board, at
                    most 5 seconds old for a trade), and a recorded replay for demo mode only.
    store.py        reads and writes the database: company bases, positions, and the trade function.
    exchange.py     puts the pieces together for the routes: the price board, a trade, a portfolio.

Data files (not code) are in backend/content/market/: companies.json, replay.json and a README.
The database part is supabase/migrations/20261106010000_island_exchange.sql.
"""
