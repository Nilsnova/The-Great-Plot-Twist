"""Game rules on the server that are bigger than one small helper.

Package A3 starts this folder on its own branch (the entry kits and the referee), and package L2
adds the home islet. The controller combines the two lists when the branches are merged.

One job per file (the home islet, package L2):
    building_catalogue.py  reads and checks backend/content/buildings.json: the five spots, the
                           prices and the starter timber
    building.py            the pure rules: what can be built where, what is missing, what the
                           islet looks like for a player (no network, no database)
    islet_store.py         the database calls of the home islet, and the finale's question
                           "does this player have a signal station?"
    islet_service.py       puts the pieces together for the routes: look at the islet, build

The routes that use them are in server/routes/islet.py (GET /api/islet and POST
/api/islet/build). The database part is in supabase/migrations/20261106070000_home_islet.sql.

Later packages add their rules here: the case (package S3) and the NPC partners (package S4).

Used by: routes/islet.py and, later, the case and the finale (packages S3 and L3).
"""
