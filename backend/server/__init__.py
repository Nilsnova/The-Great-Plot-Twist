"""The Great Plot Twist server: the Python code that holds the game rules.

Used by: backend/main.py (Vercel serves it) and the tests in backend/server/tests/.

Where things are (one job per file):
    app.py             builds the FastAPI app and plugs everything together
    errors.py          the one error shape every failed request returns
    settings.py        reads the environment variables (addresses, keys, switches)
    flags.py           feature flags: which unfinished features are switched on
    clock.py           "what time is it?", replaceable in tests
    auth.py            checks a login token with Supabase and says who the player is
    sign_in_code.py    swaps the one-time code from the GitHub sign-in for a login token (PKCE)
    supabase_admin.py  server-only calls to the database with the secret key
    crew_broadcast.py  tells a crew's browsers that something changed (Supabase Realtime)
    wallet.py          the rules for changing a player's coins
    routes/            the URLs of the API (the game calls them; keepalive is for one daily caller)
    adapters/          the pattern for outside data (weather, stocks, sports, ...)
"""

# The version the API reports at /api/health. It must match "version" in pyproject.toml
# (a test checks that, so the two cannot drift apart).
__version__ = "0.1.0"
