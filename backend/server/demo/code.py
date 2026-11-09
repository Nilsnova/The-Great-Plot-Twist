"""The class code: make one, read it, compare a typed one, and admit a guest who knows it.

A class code is 5 symbols of ABCDEFGHJKMNPQRSTUVWXYZ23456789 (no 0, O, 1, I or L, the same alphabet
as a crew code), shown as HARBOR-K7QXM. The projector QR carries it as ?join=K7QXM. A player may
type it with or without "HARBOR-", in any case, with spaces or dashes: normalize_code() takes all of
those. Crew codes have 6 symbols, so a 5-symbol code is never mistaken for a crew code.

There is one current code. The host's "New class code" replaces it, and the old one stops working
at once: every join reads the stored code from the database (no memory), and compares with
hmac.compare_digest, so the time of the comparison does not tell how much of a guess was right.

The database part is supabase/migrations/20261109020000_class_code.sql:

    demo_class_code_read()                     {"code", "setAt", "guests"}
    demo_class_code_set(host, actionUid, code) {"status": "set", "code", "setAt", "guests",
                                                "repeat"}
    demo_guest_admit(player)                   {"status": "admitted" | "already" | "missing"}
    table demo_guests                          read by is_admitted() (the guest gate)

The code is stored as plain text, readable only with the secret key (service_role), because the
host must be able to show it again. It is never logged and never sent by GET /api/config.

Used by: demo/gate.py (is_admitted), routes/demo.py (the host routes and POST /api/demo/join).
"""

import hmac
import re
import secrets
from dataclasses import dataclass
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, StrictBool, StrictInt, ValidationError

from server.supabase_admin import AlreadyApplied, SupabaseAdmin, SupabaseRejected

# The public symbols a class code is drawn from (not a secret; the scanner sees high entropy).
CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # pragma: allowlist secret
CODE_LENGTH = 5
CODE_PREFIX = "HARBOR"
CODE_FORMAT = re.compile(f"[{CODE_ALPHABET}]{{{CODE_LENGTH}}}")
# A typed code is short. Anything longer is refused before it is looked at.
MAX_TYPED_LENGTH = 32


@dataclass(frozen=True)
class ClassCode:
    """The current class code (None until a host makes one) and the number of admitted guests."""

    code: str | None
    set_at: datetime | None
    guests: int


class ReadRow(BaseModel):
    code: str | None
    setAt: datetime | None
    guests: StrictInt


class SetRow(ReadRow):
    status: Literal["set"]
    repeat: StrictBool


class AdmitRow(BaseModel):
    status: Literal["admitted", "already", "missing"]


def new_code(choice=secrets.choice) -> str:
    """A fresh code from a secure random source. Tests may pass their own `choice`."""
    return "".join(choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def normalize_code(text: object) -> str | None:
    """The 5-symbol code inside what a player typed, or None if it cannot be a class code.

    "harbor-k7qxm", "HARBOR K7QXM", "k7q-xm" and "K7QXM" all give "K7QXM".
    """
    if not isinstance(text, str) or len(text) > MAX_TYPED_LENGTH:
        return None
    compact = re.sub(r"[\s-]", "", text).upper()
    if len(compact) == len(CODE_PREFIX) + CODE_LENGTH and compact.startswith(CODE_PREFIX):
        compact = compact[len(CODE_PREFIX) :]
    return compact if CODE_FORMAT.fullmatch(compact) else None


def codes_match(given: str, current: str | None) -> bool:
    """Compare in constant time. No current code means nothing matches."""
    if current is None:
        return False
    return hmac.compare_digest(given.encode("ascii"), current.encode("ascii"))


def display_code(code: str | None) -> str | None:
    """How people see it: HARBOR-K7QXM."""
    return f"{CODE_PREFIX}-{code}" if code else None


def unreadable() -> SupabaseRejected:
    return SupabaseRejected("The database sent an answer we could not read.")


def class_code_from(row: ReadRow) -> ClassCode:
    if row.code is not None and not CODE_FORMAT.fullmatch(row.code):
        raise unreadable()
    if (row.code is None) != (row.setAt is None) or row.guests < 0:
        raise unreadable()
    return ClassCode(code=row.code, set_at=row.setAt, guests=row.guests)


async def read_code(admin: SupabaseAdmin) -> ClassCode:
    """The current code as the database has it now. A missing row counts as no code."""
    reply = await admin.call_function("demo_class_code_read", {})
    if reply is None:
        return ClassCode(code=None, set_at=None, guests=0)
    try:
        return class_code_from(ReadRow.model_validate(reply))
    except ValidationError as error:
        raise unreadable() from error


async def set_code(
    admin: SupabaseAdmin, host_id: str, action_uid: UUID, code: str
) -> tuple[ClassCode, bool]:
    """Store `code` as the new class code. Returns the code now and "repeat".

    A repeat of the same actionUid changes nothing and returns the code as it is now.
    """
    if not CODE_FORMAT.fullmatch(code):
        raise ValueError("A class code is 5 symbols of the code alphabet.")
    arguments = {"p_host_id": host_id, "p_action_uid": str(action_uid), "p_code": code}
    try:
        reply = await admin.call_function("demo_class_code_set", arguments)
    except AlreadyApplied as error:
        # The function looks the actionUid up first, so a unique violation is a bug, not a repeat.
        raise SupabaseRejected() from error
    try:
        row = SetRow.model_validate(reply)
    except ValidationError as error:
        raise unreadable() from error
    current = class_code_from(row)
    if current.code is None:
        raise unreadable()
    return current, row.repeat


async def admit(admin: SupabaseAdmin, player_id: str) -> str:
    """Record an admitted guest. Returns "admitted", "already" or "missing"."""
    reply = await admin.call_function("demo_guest_admit", {"p_player_id": player_id})
    try:
        return AdmitRow.model_validate(reply).status
    except ValidationError as error:
        raise unreadable() from error


async def is_admitted(admin: SupabaseAdmin, player_id: str) -> bool:
    """True if the player has a row in demo_guests (they presented a valid code once)."""
    rows = await admin.select_rows(
        "demo_guests", {"select": "player_id", "player_id": f"eq.{player_id}", "limit": "1"}
    )
    return any(row.get("player_id") == player_id for row in rows)
