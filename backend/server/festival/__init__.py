"""Pure festival rules; no routes, persistence, clocks or duel creation.

G10 owns the first Relighting timestamp. A7 owns actual duels. Callers must check
the festival flag and apply these decisions atomically when storage is added.
"""
