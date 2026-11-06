"""The daily round of the open world: the Lisbon day, the harbor bulletin and the Chapter 2 hook.

Nothing here runs on a timer. Everything is worked out when a player asks, from the clock, the
weather the server already fetches and two content files (design: OPEN-WORLD.md section 3.3,
"No timers"). Pure functions do the work, and routes/bulletin.py gathers their inputs.

Where things are (one job per file):
    frame.py             the game day, the bulletin day and the harbor week around one moment
    bulletin.py          the lines of the harbor bulletin, in their fixed order
    chapter_two_hook.py  when the Chapter 2 hook fires after the first solve
    exchange_summary.py  what the bulletin says about the Island Exchange
    content.py           loads bulletin.json and chapter_two_hook.json
    bulletin_content.py  the checked shape of bulletin.json
    hook_content.py      the checked shape of chapter_two_hook.json

The Lisbon clock is server/lisbon_time.py, the weather states and the fog nights are in
server/weather/, and the stage of the world (dark or relit) is server/world_stage.py.

Used by: routes/bulletin.py (GET /api/bulletin), app.py (loads the content once at start-up) and
the tests in backend/server/tests/.
"""
