"""The player's own island and the pirate waves (docs/BUILD-PLAN.md section 3, lane 0).

    catalogue.py  reads backend/content/islands.json: spots, prices, loot, wave timing, weather
    codes.py      island codes: make one, read what a player typed, show it as ISLE-<code>
    rules.py      pure rules: the spots of an island, a build check, the loot cap, the weather
    store.py      the database: island_open, the reads, islet_build, wave_start, wave_finish
    service.py    puts rules and store together for routes/island.py and routes/waves.py
    permissions.py  who may act on a game's island and who pays (T37/T42, proposed D043)

The database part is supabase/migrations/20261110010000_islands_and_waves.sql.
"""
