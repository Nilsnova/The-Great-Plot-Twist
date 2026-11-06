"""Crew database access: three reads, the four crew functions, and checking what comes back.

Everything here talks to Supabase through SupabaseAdmin (the server's secret key), so it runs on
the server only. The reads use select_rows. The writes are the four database functions of
supabase/migrations/20261106040000_crew_codes.sql, run with call_function:
  * crew_create         starts a crew with the player in seat 1
  * crew_find_by_code   looks a crew up by its code and counts wrong guesses
  * crew_take_seat      seats a friend
  * crew_start          the muster: seats an NPC partner in every empty seat

A crew function RETURNS its answer as JSON: {"status": ...}, or {"status": "refused", "reason":
...} when a rule says no and nothing changed. It RAISES only for a bug (a bad argument), and that
comes back as 502 database_error. Every answer is checked here, and an answer that does not have
the agreed shape is a 502 too. The reads filter on the player id or the crew id and ask only for
the columns they need, because the secret key skips row-level security: the filter is the only
thing that keeps another player's rows out.

One trap: supabase_admin turns every Postgres unique violation (code 23505) into 409
already_applied, the answer for a repeated wallet ref. The crew functions are safe to call twice,
so for them a unique violation can only mean a bug on our side. run_function() turns it into 502.

Used by: service.py and the tests.
"""

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal

from pydantic import BaseModel, StrictInt, StrictStr, ValidationError

from server.crews.codes import MAX_WRONG_CODES, WRONG_CODE_WINDOW_SECONDS
from server.crews.seats import KITS, Seat, partner_title
from server.supabase_admin import AlreadyApplied, SupabaseAdmin, SupabaseRejected

logger = logging.getLogger(__name__)

# A player holds few seats over time. Every list in the API has a maximum size.
MAX_SEAT_ROWS = 20

# The crews that are still going. A finished crew is over.
OPEN_STATUSES = ("forming", "active")
CREW_STATUSES = ("forming", "active", "finished")

# One crew with its seats, and the display name of each player, in one read.
CREW_COLUMNS = (
    "id,code,status,mode,version,started_at,"
    "crew_seats(seat_no,player_id,npc_id,kit,profiles(display_name))"
)

# The reasons each function may refuse with. They are the same words as in the SQL.
CREATE_REASONS = ("already_in_crew", "code_taken")
FIND_REASONS = ("wrong_code", "too_many_attempts")
TAKE_REASONS = ("already_seated", "already_in_crew", "crew_finished", "changed")
START_REASONS = ("not_in_crew", "already_started", "crew_finished", "changed")


# --- what the reads give back ---


@dataclass(frozen=True)
class OpenSeat:
    """The seat a player holds in a crew that is still going."""

    crew_id: str
    seat_no: int
    crew_status: str


@dataclass(frozen=True)
class CrewRecord:
    """One crew with its taken seats, sorted by seat number. An open seat has no entry."""

    id: str
    code: str | None
    status: str
    mode: str
    version: int
    started_at: datetime | None  # UTC, whole seconds
    seats: tuple[Seat, ...]


# --- what the functions give back ---
# Each reply has a `status` and, when a rule said no, a `reason`. The other fields are filled in
# only for the statuses that have them.


@dataclass(frozen=True)
class CreateReply:
    status: str  # created, existing, missing or refused
    reason: str = ""  # refused: already_in_crew or code_taken
    crew_id: str = ""  # created and existing


@dataclass(frozen=True)
class FindReply:
    status: str  # found, missing or refused
    reason: str = ""  # refused: wrong_code or too_many_attempts
    retry_after_seconds: int = 0  # refused too_many_attempts
    crew_id: str = ""  # found
    crew_status: str = ""  # found
    version: int = 0  # found: the version of the crew that was read
    seats: tuple[Seat, ...] = ()  # found: the taken seats, without names


@dataclass(frozen=True)
class TakeReply:
    status: str  # joined, missing or refused
    reason: str = ""  # refused: already_seated, already_in_crew, crew_finished or changed
    seat_no: int = 0  # joined
    replaced_partner: str | None = None  # joined: the partner who stepped aside, if any


@dataclass(frozen=True)
class StartReply:
    status: str  # started or refused
    reason: str = ""  # refused: not_in_crew, already_started, crew_finished or changed


def unreadable() -> SupabaseRejected:
    return SupabaseRejected("The database sent an answer we could not read.")


# --- the rows of the reads, as small models ---
# The database sends plain JSON, and a model checks that each row looks the way we expect.
# StrictStr and StrictInt mean "no conversions": the text "1" is not accepted where a number
# belongs.


class KitRow(BaseModel):
    kit: StrictStr


class SeatCrewRow(BaseModel):
    status: StrictStr


class MySeatRow(BaseModel):
    crew_id: StrictStr
    seat_no: StrictInt
    crews: SeatCrewRow  # the crew of this seat, joined in by the database


class SeatProfileRow(BaseModel):
    display_name: StrictStr


class CrewSeatRow(BaseModel):
    seat_no: StrictInt
    player_id: StrictStr | None
    npc_id: StrictStr | None
    kit: StrictStr | None
    profiles: SeatProfileRow | None = None  # the player's profile, joined in by the database


class CrewRow(BaseModel):
    id: StrictStr
    code: StrictStr | None
    status: Literal["forming", "active", "finished"]
    mode: Literal["solo", "crew"]
    version: StrictInt
    started_at: StrictStr | None
    crew_seats: list[CrewSeatRow]


def read_row(model: type[BaseModel], row: object) -> Any:
    """Check one row from the database against its model. A row we cannot read becomes a 502."""
    try:
        return model.model_validate(row)
    except ValidationError as error:
        # Say nothing about the row itself: it holds data. The model's name is enough to look
        # for the problem.
        logger.warning("The database sent a %s that we could not read.", model.__name__)
        raise unreadable() from error


def to_utc_seconds(text: str) -> datetime:
    """A time from the database in UTC and whole seconds, like every time the API sends."""
    try:
        moment = datetime.fromisoformat(text)
    except ValueError as error:
        raise unreadable() from error
    if moment.tzinfo is None:
        raise unreadable()
    return moment.astimezone(UTC).replace(microsecond=0)


# --- the reads ---


async def read_player_kit(admin: SupabaseAdmin, player_id: str) -> str | None:
    """The kit of the player's Act 1 ending, from entry_profiles. None before Act 1 is done.

    The table is made by package A3. Until its migration is applied this read fails (502).
    """
    query = {"select": "kit", "player_id": f"eq.{player_id}", "limit": "1"}
    rows = await admin.select_rows("entry_profiles", query)
    if not rows:
        return None
    kit = read_row(KitRow, rows[0]).kit
    if kit not in KITS:
        raise unreadable()
    return kit


async def read_open_crew_seat(admin: SupabaseAdmin, player_id: str) -> OpenSeat | None:
    """The newest seat of the player in a forming or active crew. None if there is none.

    Other packages (the case board, the finale) use this to find out which crew and which seat a
    player is acting for.
    """
    query = {
        # "crews(status)" asks the database to join in the crew of each seat.
        "select": "crew_id,seat_no,crews(status)",
        "player_id": f"eq.{player_id}",
        "order": "joined_at.desc",
        "limit": str(MAX_SEAT_ROWS),
    }
    rows = await admin.select_rows("crew_seats", query)
    for row in rows:
        seat = read_row(MySeatRow, row)
        if seat.crews.status in OPEN_STATUSES:
            return OpenSeat(seat.crew_id, seat.seat_no, seat.crews.status)
    return None


def seat_from_row(row: CrewSeatRow) -> Seat:
    """A seat of a crew. A player shows their display name, an NPC partner shows its title."""
    name = None
    if row.player_id is not None and row.profiles is not None:
        name = row.profiles.display_name
    elif row.npc_id is not None:
        name = partner_title(row.npc_id)
    return Seat(row.seat_no, row.player_id, row.npc_id, row.kit, name)


async def read_crew(admin: SupabaseAdmin, crew_id: str) -> CrewRecord | None:
    """One crew with all its taken seats. None if no crew has this id."""
    query = {"select": CREW_COLUMNS, "id": f"eq.{crew_id}", "limit": "1"}
    rows = await admin.select_rows("crews", query)
    if not rows:
        return None
    crew = read_row(CrewRow, rows[0])
    seats = sorted((seat_from_row(row) for row in crew.crew_seats), key=lambda seat: seat.seat_no)
    started_at = None if crew.started_at is None else to_utc_seconds(crew.started_at)
    return CrewRecord(
        id=crew.id,
        code=crew.code,
        status=crew.status,
        mode=crew.mode,
        version=crew.version,
        started_at=started_at,
        seats=tuple(seats),
    )


# --- checking an answer of a crew function ---


def check_answer(reply: object, statuses: tuple[str, ...], reasons: tuple[str, ...]) -> dict:
    """The answer of a crew function as a dictionary, if it has a status we know.

    `statuses` are the plain answers of the function (including "missing" where it has one).
    A refusal needs one of its `reasons`.
    """
    if not isinstance(reply, dict):
        raise unreadable()
    status = reply.get("status")
    if status == "refused":
        if reply.get("reason") not in reasons:
            raise unreadable()
    elif status not in statuses:
        raise unreadable()
    return reply


def read_text(answer: dict, key: str) -> str:
    """A field that must be non-empty text."""
    value = answer.get(key)
    if not isinstance(value, str) or not value:
        raise unreadable()
    return value


def read_optional_text(answer: dict, key: str) -> str | None:
    """A field that is text or empty (null)."""
    value = answer.get(key)
    if value is not None and not isinstance(value, str):
        raise unreadable()
    return value


def read_whole(answer: dict, key: str) -> int:
    """A field that must be a whole number. True and False are not numbers here."""
    value = answer.get(key)
    if isinstance(value, bool) or not isinstance(value, int):
        raise unreadable()
    return value


def read_found_seats(value: object) -> tuple[Seat, ...]:
    """The seats in the answer of crew_find_by_code. They carry no names: only ids and kits."""
    if not isinstance(value, list):
        raise unreadable()
    seats = []
    for item in value:
        if not isinstance(item, dict):
            raise unreadable()
        seats.append(
            Seat(
                seat_no=read_whole(item, "seatNo"),
                player_id=read_optional_text(item, "playerId"),
                npc_id=read_optional_text(item, "npcId"),
                kit=read_optional_text(item, "kit"),
                name=None,
            )
        )
    return tuple(seats)


# --- the four functions ---


def create_arguments(player_id: str, code: str, kit: str) -> dict[str, Any]:
    """The arguments of crew_create. The names are the parameter names in the SQL."""
    return {"p_player_id": player_id, "p_code": code, "p_kit": kit}


def find_arguments(player_id: str, code: str) -> dict[str, Any]:
    """The arguments of crew_find_by_code. The guess limit lives in codes.py, not in the SQL."""
    return {
        "p_player_id": player_id,
        "p_code": code,
        "p_max_wrong_codes": MAX_WRONG_CODES,
        "p_window_seconds": WRONG_CODE_WINDOW_SECONDS,
    }


def take_arguments(
    crew_id: str, player_id: str, seat_no: int, kit: str, version: int
) -> dict[str, Any]:
    """The arguments of crew_take_seat. `version` is the version of the crew that was read."""
    return {
        "p_crew_id": crew_id,
        "p_player_id": player_id,
        "p_seat_no": seat_no,
        "p_kit": kit,
        "p_expected_version": version,
    }


def start_arguments(
    crew_id: str, player_id: str, partners: list[Seat], version: int
) -> dict[str, Any]:
    """The arguments of crew_start: the partners of the muster as a JSON list."""
    return {
        "p_crew_id": crew_id,
        "p_player_id": player_id,
        "p_partners": [
            {"seatNo": seat.seat_no, "npcId": seat.npc_id, "kit": seat.kit} for seat in partners
        ],
        "p_expected_version": version,
    }


async def run_function(admin: SupabaseAdmin, name: str, arguments: dict[str, Any]) -> object:
    """Run a crew function and return its JSON answer.

    Errors it can raise (all are ApiErrors, see supabase_admin.py):
      SupabaseRejected (502)     a bug: the database refused the call (a bad argument, a broken
                                 rule, or a unique violation, see the top of this file)
      SupabaseUnavailable (503)  the database could not be reached
    """
    try:
        return await admin.call_function(name, arguments)
    except AlreadyApplied as error:
        logger.warning("The crew function %s hit a unique rule.", name)
        raise SupabaseRejected("The database refused the crew change.") from error


async def crew_create(admin: SupabaseAdmin, player_id: str, code: str, kit: str) -> CreateReply:
    reply = await run_function(admin, "crew_create", create_arguments(player_id, code, kit))
    answer = check_answer(reply, ("created", "existing", "missing"), CREATE_REASONS)
    if answer["status"] in ("created", "existing"):
        return CreateReply(answer["status"], crew_id=read_text(answer, "crewId"))
    return CreateReply(answer["status"], reason=answer.get("reason", ""))


async def crew_find_by_code(admin: SupabaseAdmin, player_id: str, code: str) -> FindReply:
    reply = await run_function(admin, "crew_find_by_code", find_arguments(player_id, code))
    answer = check_answer(reply, ("found", "missing"), FIND_REASONS)
    if answer["status"] == "found":
        crew_status = read_text(answer, "crewStatus")
        if crew_status not in CREW_STATUSES:
            raise unreadable()
        return FindReply(
            "found",
            crew_id=read_text(answer, "crewId"),
            crew_status=crew_status,
            version=read_whole(answer, "version"),
            seats=read_found_seats(answer.get("seats")),
        )
    if answer["status"] == "missing":
        return FindReply("missing")
    if answer["reason"] == "too_many_attempts":
        wait = read_whole(answer, "retryAfterSeconds")
        return FindReply("refused", reason="too_many_attempts", retry_after_seconds=wait)
    return FindReply("refused", reason=answer["reason"])


async def crew_take_seat(
    admin: SupabaseAdmin, crew_id: str, player_id: str, seat_no: int, kit: str, version: int
) -> TakeReply:
    arguments = take_arguments(crew_id, player_id, seat_no, kit, version)
    reply = await run_function(admin, "crew_take_seat", arguments)
    answer = check_answer(reply, ("joined", "missing"), TAKE_REASONS)
    if answer["status"] == "joined":
        return TakeReply(
            "joined",
            seat_no=read_whole(answer, "seatNo"),
            replaced_partner=read_optional_text(answer, "replacedPartner"),
        )
    return TakeReply(answer["status"], reason=answer.get("reason", ""))


async def crew_start(
    admin: SupabaseAdmin, crew_id: str, player_id: str, partners: list[Seat], version: int
) -> StartReply:
    arguments = start_arguments(crew_id, player_id, partners, version)
    reply = await run_function(admin, "crew_start", arguments)
    answer = check_answer(reply, ("started",), START_REASONS)
    return StartReply(answer["status"], reason=answer.get("reason", ""))
