"""Game rules on the server that are bigger than one small helper (package A3 starts this folder).

One job per file:
    entry_kits.py           reads and checks backend/content/entry_kits.json: the four kits
    referee.py              replays the Act 1 move log with the story engine, says how it ended
    entry_profile_store.py  the database calls for the entry profile: grant the kit, read the kit
    case_data.py            reads immutable private case content and runs load-time checks
    case_lint.py            exhaustive free-route and seat-fill checks used by tests
    case_*.py               pure decisions, earned views, scoped store and case intent service

The route that uses them is server/routes/intro.py (POST /api/intro/complete). routes/me.py reads
the kit and the start place through entry_profile_store.py. The database part is in
supabase/migrations/20261106030000_entry_profiles.sql.

Later case phases add the board, lights, world switch and NPC partner rules here.

Used by: routes/intro.py and routes/me.py.
"""
