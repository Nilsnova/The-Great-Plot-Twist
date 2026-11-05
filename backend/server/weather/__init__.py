"""Live weather: the real weather of one place, fetched from Open-Meteo and ready for the game.

This package is the first real outside data source. It follows the pattern in
server/adapters/base.py (a cache, a timeout and fallbacks) and keeps its three jobs in three
files, one job each:

    open_meteo.py  talks to Open-Meteo: builds the request, reads the answer into a
                   WeatherReading. The only file that knows Open-Meteo's field names.
    source.py      wraps that call in a CachedSource (one call per 10 minutes) with the recorded
                   answer from backend/content/weather/ as the last fallback.
    mapping.py     pure arithmetic: turns a WeatherReading into the four sliders the game draws
                   (cloudCover, rain, fog, wind), plus day or night and a summary in words.

The same call also asks for hourly weather (31 past days, 3 forecast days), for the open world's
weather states and fog nights. Those have their own files, again one job each, all pure:

    state_rules.py  reads backend/content/weather_states.json (the thresholds, the night hours)
    states.py       the state of an hour (storm, fog, rain or calm) and of a whole night
    nights.py       when a night starts and ends in Lisbon, and which hours belong to which night
    fog_nights.py   the fog-night rule: a fog night at least every third night
    outlook.py      tonight and tomorrow, put together for the weather route and the bulletin

The route that serves it is routes/weather.py (GET /api/weather). The saved answers used for the
fallback and for the tests are in backend/content/weather/.

Used by: app.py (builds the source and loads the rules once at start-up), routes/weather.py,
routes/bulletin.py and daily/.
"""
