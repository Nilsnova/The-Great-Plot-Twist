"""Account data: captain names, the cloud save and deleting a player's data (package A2).

One job per file:
    names.py       the pure rules: the word lists, the placeholder name, picking a captain name
    name_store.py  the database calls for captain names: read, give a first name, re-roll once
    saves.py       the rules for a save (its size) and the database calls to read and write it
    deletion.py    the database call that deletes a player and everything that belongs to them

The routes that use them are in server/routes/ (captain_name.py, save.py and delete_me.py).
The database functions behind them are in supabase/migrations/20261106020000_accounts.sql.

Used by: the routes named above, and routes/me.py (it reads names.py).
"""
