"""Game rules on the server that are bigger than one small helper (package A3 starts this folder).

One job per file:
    entry_kits.py           reads and checks backend/content/entry_kits.json: the four kits
    referee.py              replays the Act 1 move log with the story engine, says how it ended
    entry_profile_store.py  the database calls for the entry profile: grant the kit, read the kit

The route that uses them is server/routes/intro.py (POST /api/intro/complete). routes/me.py reads
the kit and the start place through entry_profile_store.py. The database part is in
supabase/migrations/20261106030000_entry_profiles.sql.

Later packages add their rules here: the case (package S3, case.py) and the NPC partners
(package S4, partners.py).

Used by: routes/intro.py and routes/me.py.
"""
