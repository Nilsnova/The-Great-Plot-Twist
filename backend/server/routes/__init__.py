"""Routes: the URLs of the API. One file per group of URLs.

    health.py         GET  /api/health         is the API alive?
    config.py         GET  /api/config         which features are on, and how to sign in
    me.py             GET  /api/me             the player's name, coins, crews, kit and start place
    captain_name.py   POST /api/me/name        gives a captain name; /reroll changes it once
    save.py           GET, PUT /api/save       the player's progress in the cloud
    delete_me.py      DELETE /api/me           deletes the player and all their data
    intro.py          POST /api/intro/complete replays the Act 1 move log and gives the entry kit
    auth_exchange.py  POST /api/auth/exchange  swaps a one-time sign-in code for a login token
    keepalive.py      GET  /api/keepalive      for one daily caller, not for the browser
    predictions.py    /api/predictions...     questions, stakes and host settlement
    duels.py          /api/duels...           sealed-signal challenges and moves
    crews.py          /api/crews...            start a crew, join with a code, the muster, my crew
    case.py           /api/case...             earned view, card searches and accusation
    world.py          GET /api/world           public coast state and Wall of Lights
    host_case.py      /api/host/case/clock      move the host's own crew's case clock
    islet.py          GET  /api/islet          your home islet: coins, timber, the five spots
                      POST /api/islet/build    build level 1 of a building on your islet
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
