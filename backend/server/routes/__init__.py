"""Routes: the URLs of the API. One file per group of URLs.

Most of them are called by the browser. keepalive.py is called by Vercel's daily cron instead.
market.py is the Island Exchange (its rules are in server/market/).
Each file creates a `router` with its URLs. app.py plugs every router in under /api.
To add a feature: create a new file here, then add one line in app.py.
"""
