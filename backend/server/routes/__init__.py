"""Routes: the URLs of the API. One file per group of URLs.

    health.py         GET  /api/health         is the API alive?
    config.py         GET  /api/config         which features are on, and how to sign in
    me.py             GET  /api/me             the signed-in player's name, coins and crews
    auth_exchange.py  POST /api/auth/exchange  swaps a one-time sign-in code for a login token
    keepalive.py      GET  /api/keepalive      called by Vercel's daily cron, not by the browser

Most of them are called by the browser. keepalive.py is called by Vercel's daily cron instead.
market.py is the Island Exchange (its rules are in server/market/).
Each file creates a `router` with its URLs. app.py plugs every router in under /api.
To add a feature: create a new file here, then add one line in app.py.
"""
