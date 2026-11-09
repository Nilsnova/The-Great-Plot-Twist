"""The Keeper's Lock: the weather puzzle of the class demo (G29 checkpoint C0, decision D029).

The lock asks "What does the sky over <your place> look like right now?" and checks the answer
against the real weather of the player's own place. The server works the verdict out; the browser
only shows the question and sends the answer id.

Where things are (one job per file):
    place.py     the player's place: the browser's chosen place, else Vercel's IP geo headers
                 (city level), else the default weather place of the settings. Never stored.
    sky.py       pure rules: the five skies, which WMO weather code is which sky, which skies are
                 one step apart ("close enough"), and the verdict of one answer
    content.py   reads backend/content/keeper_lock.json (every word, the riddle and its answer)
    weather.py   the weather now for a place, cached 10 minutes by rounded coordinates
    places.py    the "Change place" search through Open-Meteo's geocoding API, cached
    limits.py    small per-player request budgets (per server instance)
    store.py     the database: the player's stored answers and demo_lock_record()

The routes are in routes/lock.py. Nothing here moves coins.
"""
