"""Island codes: make one, read what a player typed, and show it as ISLE-<code>.

An island code is 5 symbols of ABCDEFGHJKMNPQRSTUVWXYZ23456789 (no 0, O, 1, I or L), the alphabet
of the class code (demo/code.py). The screens show it as ISLE-K7Q2M. A player may type it with or
without "ISLE-", in any case, with spaces or dashes: read_code() takes all of those. The database
stores only the 5 symbols (islands.code) and keeps them unique.

The live room of an island is live:place:isle_<the 5 symbols in lowercase>:1 (BUILD-PLAN 3.6).

Used by: service.py, routes/island.py, routes/waves.py and the tests.
"""

import re
import secrets
from collections.abc import Callable

from server.demo.code import CODE_ALPHABET, CODE_LENGTH

PREFIX = "ISLE"
CODE_FORMAT = re.compile(f"[{CODE_ALPHABET}]{{{CODE_LENGTH}}}")
# A typed code is short. Anything longer is refused before it is looked at.
MAX_TYPED_LENGTH = 32


def new_code(choice: Callable[[str], str] = secrets.choice) -> str:
    """A fresh code from a secure random source. Tests may pass their own `choice`."""
    return "".join(choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def read_code(text: object) -> str | None:
    """The 5 symbols inside what a player typed, or None if it cannot be an island code.

    "ISLE-K7Q2M", "isle k7q2m", "k7q-2m" and "K7Q2M" all give "K7Q2M".
    """
    if not isinstance(text, str) or len(text) > MAX_TYPED_LENGTH:
        return None
    compact = re.sub(r"[\s-]", "", text).upper()
    if len(compact) == len(PREFIX) + CODE_LENGTH and compact.startswith(PREFIX):
        compact = compact[len(PREFIX) :]
    return compact if CODE_FORMAT.fullmatch(compact) else None


def shown(code: str) -> str:
    """How people see a code: ISLE-K7Q2M."""
    return f"{PREFIX}-{code}"
