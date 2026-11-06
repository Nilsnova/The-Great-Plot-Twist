"""Lantern Duels: sealed-signal duels between two captains. Play money only.

Used by: routes/duels.py (the five URLs), app.py (builds the service) and the tests.

Two captains each seal a sequence of lantern signals: Flash, Shade or Mirror. Flash outshines
Shade, Shade leaves Mirror nothing to throw back, and Mirror throws Flash back. The server opens
both envelopes at once and decides every round (D003). A duel is friendly (stake 0) or played for
equal stakes of 10, 25, 50 or 100 coins. Play money only: coins cannot be bought, cashed out or
exchanged for real prizes, and the screen says "Simulation, play money". The whole feature sits
behind the flag "arena", which stays off until the team switches it on.

Where things are (one job per file):
    rules.py      every rule and number as pure functions: the signals, who beats whom, the lantern
                  oil, the stakes, the cut, the caps, resolving a duel, the payout, the Lisbon day
    views.py      what ONE captain may see of one duel: the summary, the detail and the reveal from
                  their side. Pure. The only place that decides visibility: a sealed signal never
                  reaches the other captain before the duel is finished
    store.py      the database reads, the three database functions (duel_create, duel_answer,
                  duel_void), their argument dictionaries and the readers of their replies
    refusals.py   turns a refusal from the database, or a failed check, into the standard ApiError
    service.py    puts the pieces together for the routes: list, get, create, answer, cancel, and
                  the lazy clean-up of expired challenges (there is no timer)

The database part is supabase/migrations/20261106110000_lantern_duels.sql. The numbers are named
constants in rules.py (as decision D017 did for the Island Exchange), not a data file.
"""
