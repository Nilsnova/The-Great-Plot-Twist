"""Crew codes: make one, tidy up what a player types, and the limit on wrong guesses.

A crew code is how a friend joins a crew. It has 6 symbols, for example K7QF2M. The alphabet
leaves out 0, O, 1, I and L, because they look alike on a projector and in a chat message.
That leaves 31 symbols, so there are about 890 million codes.

Codes are made with the system's secure random generator, so nobody can predict the next one.
A guesser is slowed down by the database: at most MAX_WRONG_CODES wrong codes in
WRONG_CODE_WINDOW_SECONDS seconds per player (the function crew_find_by_code() counts them).
The numbers live here and are handed to the database as arguments, like the market limits.

Used by: service.py and the tests.
"""

import random
import secrets

# 31 symbols: A-Z without I, L and O, and the digits 2-9. The same list is in the database rule
# crews_code_format. A test compares the two.
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 6

# The secure generator, made once. It is a module constant because ruff does not allow a
# function call in an argument default.
SYSTEM_RANDOM = secrets.SystemRandom()

# A player may guess wrong this many times in this many seconds. The next try is refused.
MAX_WRONG_CODES = 10
WRONG_CODE_WINDOW_SECONDS = 600


def make_crew_code(rng: random.Random = SYSTEM_RANDOM) -> str:
    """A fresh crew code. Tests pass a seeded generator to get the same code every time."""
    return "".join(rng.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def normalize_code(text: str) -> str | None:
    """The crew code a player meant, or None if what they typed cannot be a code.

    A player may type lower case, add spaces or hyphens ("k7q-f2m") or end with a line break.
    Anything that is not a code after that gives None, and the caller never asks the database,
    so a typing mistake does not count as a wrong guess.
    """
    if not text.isascii():
        # upper() turns some letters outside A-Z into plain ones (the long s becomes S), so
        # refuse them before they can look like a code.
        return None
    code = text.strip().upper().replace(" ", "").replace("-", "")
    if len(code) != CODE_LENGTH:
        return None
    if any(symbol not in CODE_ALPHABET for symbol in code):
        return None
    return code
