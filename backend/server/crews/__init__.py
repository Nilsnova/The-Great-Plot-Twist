"""Crews and seats: how a crew forms, how a friend joins, and who sits where.

Used by: routes/crews.py (the four URLs under /api/crews) and the tests in backend/server/tests/.

A crew has four seats (numbered 1 to 4). A seat holds a player or an NPC partner, a crew mate
that the game runs. A player starts a crew and gets a crew code. A friend types the code to join.
Before the crew sails, the "muster" fills every empty seat with an NPC partner, so a crew of
one still has four seats. Only the server writes crews and seats, always through the four
database functions in supabase/migrations/20261106040000_crew_codes.sql.

Where things are (one job per file):
    codes.py     the crew code: make one, tidy up what a player types, the limit on wrong guesses
    seats.py     the pure seat rules: which kit each partner carries, which seat a friend takes
    store.py     the database: three reads and the four crew functions, and checking their answers
    service.py   the flows (start a crew, join, muster, my crew) and their errors

The decisions that still wait for Nils are marked "PENDING Nils' decision" in seats.py and in
docs/DECISIONS.md (D020).
"""
