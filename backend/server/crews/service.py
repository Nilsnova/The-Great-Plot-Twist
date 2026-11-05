"""Crew flows: start a crew, join with a code, the muster, and "my crew".

Each flow reads what it needs, asks the seat rules (seats.py) what to do, and calls one crew
function (store.py). The database functions refuse anything that is not allowed and say "changed"
when the crew is not as the server read it. In that case a flow reads the crew again and tries
once more, at most MAX_CHANGE_TRIES times, and then answers 409 crew_busy.

What the server decides here, and the database only checks:
  * which seat a friend takes (seats.seat_for_friend) and which kit the seat then carries,
  * which kit each NPC partner carries at the muster (seats.partner_seats).

The flows return a CrewRecord. routes/crews.py turns it into the JSON the browser reads. Every
failure is an ApiError with the standard shape. Nothing here moves coins.

Used by: routes/crews.py and the tests.
"""

from server.crews.codes import make_crew_code, normalize_code
from server.crews.seats import kit_after_takeover, partner_seats, seat_for_friend
from server.crews.store import (
    CrewRecord,
    FindReply,
    crew_create,
    crew_find_by_code,
    crew_start,
    crew_take_seat,
    read_crew,
    read_open_crew_seat,
    read_player_kit,
)
from server.errors import ApiError
from server.supabase_admin import SupabaseAdmin

# A fresh code is taken by another crew with a chance of about 1 in 4 million, so a second try
# nearly always works. Five taken codes in a row mean something is wrong.
MAX_CODE_TRIES = 5

# How often a flow reads the crew again after "changed", before it gives up.
MAX_CHANGE_TRIES = 3

BAD_CODE_MESSAGE = "A crew code has 6 letters and digits, for example K7QF2M."


# --- the errors ---


def conflict(code: str, message: str) -> ApiError:
    """A 409: the request is fine, but the crew is not in a state that allows it."""
    return ApiError(409, code, message)


def kit_needed() -> ApiError:
    return conflict("kit_needed", "Finish Act 1 first: your kit comes from your ending.")


def no_crew() -> ApiError:
    return ApiError(404, "no_crew", "You are not in a crew. Start one, or join with a crew code.")


def player_not_set_up() -> ApiError:
    message = "Your player record is not set up yet. Ask the team to reset your account."
    return ApiError(404, "player_not_set_up", message)


def too_many_guesses(seconds: int) -> ApiError:
    """The 429 for a player who typed too many wrong codes. Retry-After says how long to wait."""
    seconds = max(1, seconds)
    unit = "second" if seconds == 1 else "seconds"
    message = f"You typed too many wrong codes. Wait {seconds} {unit}, then try again."
    return ApiError(429, "too_many_requests", message, headers={"Retry-After": str(seconds)})


def refused_join(reason: str) -> ApiError:
    """The error for a reason the seat function refused with. "changed" is never passed here."""
    messages = {
        "already_seated": "You already sit in this crew.",
        "already_in_crew": "You already sit in another crew.",
        "crew_finished": "That crew has finished.",
    }
    return conflict(reason, messages[reason])


def refused_start(reason: str) -> ApiError:
    """The error for a reason the muster function refused with. "changed" is never passed here."""
    if reason == "not_in_crew":
        return no_crew()
    if reason == "already_started":
        return conflict("already_started", "Your crew has sailed already.")
    return conflict("crew_finished", "That crew has finished.")


# --- small steps the flows share ---


async def require_kit(admin: SupabaseAdmin, player_id: str) -> str:
    """The player's kit. Before Act 1 is done there is none, and a crew needs one (409)."""
    kit = await read_player_kit(admin, player_id)
    if kit is None:
        raise kit_needed()
    return kit


async def require_crew(admin: SupabaseAdmin, crew_id: str) -> CrewRecord:
    """The crew with this id, or 404 no_crew if it is gone."""
    crew = await read_crew(admin, crew_id)
    if crew is None:
        raise no_crew()
    return crew


# --- starting a crew ---


async def create_with_free_code(admin: SupabaseAdmin, player_id: str, kit: str) -> str:
    """Start the crew with a fresh code. Returns its id (the player's draft, if they have one)."""
    for _ in range(MAX_CODE_TRIES):
        reply = await crew_create(admin, player_id, make_crew_code(), kit)
        if reply.status in ("created", "existing"):
            return reply.crew_id
        if reply.status == "missing":
            raise player_not_set_up()
        if reply.reason == "already_in_crew":
            raise conflict("already_in_crew", "You already sit in a crew.")
        # The reason is "code_taken": try a new code.
    raise ApiError(503, "crew_codes_busy", "Could not find a free crew code. Try again.")


async def create_crew(admin: SupabaseAdmin, player_id: str) -> CrewRecord:
    """POST /api/crews: a new crew with the player in seat 1, or the draft they already have."""
    kit = await require_kit(admin, player_id)
    crew_id = await create_with_free_code(admin, player_id, kit)
    return await require_crew(admin, crew_id)


# --- joining with a code ---


async def find_crew(admin: SupabaseAdmin, player_id: str, code: str) -> FindReply:
    """Look the crew up. A wrong code is 404, and too many wrong codes is 429."""
    reply = await crew_find_by_code(admin, player_id, code)
    if reply.status == "found":
        return reply
    if reply.status == "missing":
        raise player_not_set_up()
    if reply.reason == "too_many_attempts":
        raise too_many_guesses(reply.retry_after_seconds)
    raise ApiError(404, "wrong_code", "No crew has that code. Check it and try again.")


def choose_seat(found: FindReply, player_id: str, kit: str) -> int:
    """The seat the player takes in the crew that was found, or a 409 if they cannot join."""
    if found.crew_status == "finished":
        raise refused_join("crew_finished")
    if any(seat.player_id == player_id for seat in found.seats):
        raise refused_join("already_seated")
    seat_no = seat_for_friend(list(found.seats), kit)
    if seat_no is None:
        raise conflict("crew_full", "That crew is full.")
    return seat_no


def kit_of_partner_in(found: FindReply, seat_no: int) -> str | None:
    """The kit of the NPC partner who sits in this seat, or None if the seat is empty."""
    for seat in found.seats:
        if seat.seat_no == seat_no and seat.npc_id is not None:
            return seat.kit
    return None


async def try_to_join(admin: SupabaseAdmin, player_id: str, code: str, kit: str) -> str | None:
    """One try to join. Returns the crew id, or None if the crew changed in the meantime."""
    found = await find_crew(admin, player_id, code)
    seat_no = choose_seat(found, player_id, kit)
    seat_kit = kit_after_takeover(kit, kit_of_partner_in(found, seat_no))
    taken = await crew_take_seat(admin, found.crew_id, player_id, seat_no, seat_kit, found.version)
    if taken.status == "joined":
        return found.crew_id
    if taken.status == "missing":
        raise player_not_set_up()
    if taken.reason == "changed":
        return None
    raise refused_join(taken.reason)


async def join_crew(admin: SupabaseAdmin, player_id: str, typed_code: str) -> CrewRecord:
    """POST /api/crews/join: take a seat in the crew that has this code."""
    code = normalize_code(typed_code)
    if code is None:
        # A typing mistake: no database call, so it does not count as a wrong guess.
        raise ApiError(422, "validation_error", BAD_CODE_MESSAGE)
    kit = await require_kit(admin, player_id)
    for _ in range(MAX_CHANGE_TRIES):
        crew_id = await try_to_join(admin, player_id, code, kit)
        if crew_id is not None:
            return await require_crew(admin, crew_id)
    raise conflict("crew_busy", "The crew changed while you joined. Try again.")


# --- the muster ---


async def try_to_start(admin: SupabaseAdmin, player_id: str, crew_id: str) -> bool:
    """One try to start the crew. True if it sailed, False if the crew changed meanwhile."""
    crew = await read_crew(admin, crew_id)
    if crew is None:
        raise no_crew()
    # Same answer as the database gives for a finished crew, so both paths read the same.
    if crew.status == "finished":
        raise refused_start("crew_finished")
    if crew.status == "active":
        raise refused_start("already_started")
    partners = partner_seats(list(crew.seats))
    reply = await crew_start(admin, crew.id, player_id, partners, crew.version)
    if reply.status == "started":
        return True
    if reply.reason == "changed":
        return False
    raise refused_start(reply.reason)


async def start_crew(admin: SupabaseAdmin, player_id: str) -> CrewRecord:
    """POST /api/crews/me/start: the crew sails, and NPC partners take every empty seat."""
    seat = await read_open_crew_seat(admin, player_id)
    if seat is None:
        raise no_crew()
    for _ in range(MAX_CHANGE_TRIES):
        if await try_to_start(admin, player_id, seat.crew_id):
            return await require_crew(admin, seat.crew_id)
    raise conflict("crew_busy", "The crew changed while it was sailing. Try again.")


# --- my crew ---


async def find_my_crew(admin: SupabaseAdmin, player_id: str) -> CrewRecord | None:
    """GET /api/crews/me: the crew the player sits in, or None."""
    seat = await read_open_crew_seat(admin, player_id)
    if seat is None:
        return None
    return await read_crew(admin, seat.crew_id)
