"""Game rules on the server that are bigger than one small helper (package A3 starts this folder).

One job per file. The entry kits and the referee (package A3):
    entry_kits.py           reads and checks backend/content/entry_kits.json: the four kits
    referee.py              replays the Act 1 move log with the story engine, says how it ended
    entry_profile_store.py  the database calls for the entry profile: grant the kit, read the kit
    case_data.py            reads immutable private case content and runs load-time checks
    case_lint.py            exhaustive free-route and seat-fill checks used by tests
    case_*.py               pure decisions, earned views, scoped store and case intent service

The home islet (package L2):
    building_catalogue.py   reads and checks backend/content/buildings.json: the five spots, the
                            prices and the starter timber
    building.py             the pure rules: what can be built where, what is missing, what the
                            islet looks like for a player (no network, no database)
    islet_store.py          the database calls of the home islet, and the finale's question
                            "does this player have a signal station?"
    islet_service.py        puts the pieces together for the routes: look at the islet, build

The routes that use them are server/routes/intro.py (POST /api/intro/complete) and
server/routes/islet.py (GET /api/islet and POST /api/islet/build). routes/me.py reads the kit and
the start place through entry_profile_store.py. The database parts are in
supabase/migrations/20261106030000_entry_profiles.sql and
supabase/migrations/20261106070000_home_islet.sql.

Later case phases add the board, lights, world switch and NPC partner rules here.

Used by: routes/intro.py, routes/me.py, routes/islet.py and, later, the case and the finale
(packages S3 and L3).
"""
