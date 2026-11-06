"""Festival lifecycle, scoped views and atomic claim/ring coordination.

G10 owns the immutable first Relighting time and extra-light counter. The authored
pure timer/claim/FIFO helpers remain immutable; SQL stores exact action receipts and
reuses A7's existing duel functions. routes/festival.py applies feature/auth gates.
"""
