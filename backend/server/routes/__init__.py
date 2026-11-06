"""Routes: the URLs of the API. One file per group of URLs.

    health.py         GET  /api/health         is the API alive?
    config.py         GET  /api/config         which features are on, and how to sign in
    me.py             GET  /api/me             the signed-in player's name, coins and crews
    auth_exchange.py  POST /api/auth/exchange  swaps a one-time sign-in code for a login token
    keepalive.py      GET  /api/keepalive      for one daily caller, not for the browser
    predictions.py    GET  /api/predictions, /api/predictions/mine and POST .../stake, .../settle:
                      the prediction desk (settle is for hosts only)

Most of them are called by the browser. keepalive.py is for one daily caller instead: the
GitHub Actions workflow .github/workflows/keepalive.yml (docs/ARCHITECTURE.md, keep-alive).
market.py is the Island Exchange (its rules are in server/market/), predictions.py the
prediction desk (its rules are in server/predictions/).
Each file creates a `router` with its URLs. app.py plugs every router in under /api.
To add a feature: create a new file here, then add one line in app.py.
"""
