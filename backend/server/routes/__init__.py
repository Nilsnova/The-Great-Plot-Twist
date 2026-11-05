"""Routes: the URLs of the API. One file per group of URLs.

    health.py         GET  /api/health         is the API alive?
    config.py         GET  /api/config         which features are on, and how to sign in
    me.py             GET  /api/me             the signed-in player's name, coins and crews
    auth_exchange.py  POST /api/auth/exchange  swaps a one-time sign-in code for a login token
    keepalive.py      GET  /api/keepalive      for one daily caller, not for the browser
    weather.py        GET  /api/weather        the real weather, the weather state and tonight
    bulletin.py       GET  /api/bulletin       the harbor bulletin and the Chapter 2 hook

Most of them are called by the browser. keepalive.py is for one daily caller instead: the
GitHub Actions workflow .github/workflows/keepalive.yml (docs/ARCHITECTURE.md, keep-alive).
market.py is the Island Exchange (its rules are in server/market/).
bulletin_answer.py is the one file here without a URL: it holds the shape of the bulletin's answer,
so bulletin.py stays short.
Each file with URLs creates a `router`. app.py plugs every router in under /api.
To add a feature: create a new file here, then add one line in app.py.
"""
