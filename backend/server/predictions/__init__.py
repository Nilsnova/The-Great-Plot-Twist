"""The prediction desk: hand-picked real questions, play-coin pools and a presenter settle button.

Used by: routes/predictions.py (the four URLs) and app.py (builds the desk). Nothing here reads the
environment: the desk takes the settings it needs as arguments.

Play money only. Coins cannot be bought, cashed out or exchanged for real prizes. The screen says
"forecasting with play coins". Everything that decides money happens in this package, on the
server, and the database checks the arithmetic again
(supabase/migrations/20261106100000_prediction_desk.sql).

Where things are (one job per file):
    pools.py        the POOL rules: who gets how many coins when a question is decided. Pure
                    functions with no input or output. It works for 2 or 3 outcomes, so the
                    sports predictions (L6) can share it.
    stake_rules.py  the desk's numbers (stake size, daily cap, the cut, how old a stale reading of
                    Manifold may be for a stake), the Lisbon day and the small pure checks. Pure
                    functions too.
    questions.py    loads the hand-picked list of questions from backend/content/predictions/
                    questions.json and checks every field.
    manifold.py     the ONLY file that knows Manifold's address and field names. It reads one
                    market and turns it into a MarketState in our own words.
    source.py       one cached source per question (120 seconds), with a recorded real answer as
                    the fallback.
    state.py        pure: what state is a question in right now (open, closed, settled), may a
                    captain stake (not on a reading of Manifold that is too old), and what does
                    Manifold say.
    store.py        reads and writes the database: pools, stakes, wallet balance, and the two
                    functions prediction_place_stake() and prediction_settle_pool().
    limits.py       the speed limit for stakes: 10 per player in 30 seconds.
    views.py        the plain records that the desk hands to the routes: a question with its
                    sides, one of my stakes, the orders and the receipts.
    refusals.py     the plain-English errors of the desk, each with its own code.
    desk.py         puts the pieces together for the routes: the list of questions, my stakes,
                    one stake and one settlement.

Data files (not code) are in backend/content/predictions/: questions.json, recorded/ (one real
Manifold answer per question), samples/ (answers the tests use) and a README.
The database part is supabase/migrations/20261106100000_prediction_desk.sql.
"""
