"""Crew routes: start a crew, join it with a code, sail with NPC partners, and look at my crew.

A crew has four seats. A seat holds a player or an NPC partner (a crew mate that the game runs),
and every seat carries one of the four entry kits. A player starts a crew and gets a crew code,
a friend types the code to join, and when the crew sails (the "muster") every empty seat gets an
NPC partner with a kit the players are missing. A crew of one player still has four seats. The
rules for seats are in server/crews/seats.py, the flows in server/crews/service.py, and the
database part in supabase/migrations/20261106040000_crew_codes.sql (decision D020).

    POST /api/crews            signed in   start a crew and get its code
    POST /api/crews/join       signed in   join a crew with its code
    POST /api/crews/me/start   signed in   the muster: NPC partners take every empty seat
    GET  /api/crews/me         signed in   the crew I sit in

Who may call: signed-in players only. The player is the owner of the token in
    Authorization: Bearer <token>
The player id always comes from that verified login (`PlayerDep`, see auth.py). It never comes
from the address, the headers or the body. Every answer carries `Cache-Control: private, no-store`
and holds no player id: other players are shown by their display name, partners by their title.

Every crew route answers with the same view, or {"crew": null} when the player sits in no crew:

    {"crew": {"id": "<crew id>", "code": "K7QF2M", "status": "active", "mode": "crew",
              "mySeat": 1, "startedAt": "2026-11-13T10:02:00Z",
              "seats": [
                {"seatNo": 1, "holder": "player",  "name": "Brave Puffin 17", "kit": "witness",
                 "partnerId": null, "isMe": true},
                {"seatNo": 3, "holder": "partner", "name": "the Bosun", "kit": "informant",
                 "partnerId": "bosun", "isMe": false},
                {"seatNo": 4, "holder": "open", "name": null, "kit": null,
                 "partnerId": null, "isMe": false}, ...]}}

  * "seats" always has 4 entries, in seat order. A seat nobody holds has the holder "open".
  * "status" is forming (still gathering players), active (sailed) or finished.
  * "mode" is solo until a second player joins, and crew after that. It does not go back to solo
    if a player is deleted later (decision D020, known limits).
  * "code" is empty only for a crew that was made before crew codes existed.
  * "startedAt" is the time of the muster, empty while the crew is forming.

POST /api/crews
    No body. The kit comes from the player's entry profile (package A3).
    200  the new crew: status forming, the player in seat 1, three open seats. A player who
         already started a crew and sits in it alone (a draft) gets that same crew back.
    409  kit_needed       Act 1 is not finished, so there is no kit yet
    409  already_in_crew  the player sits in another crew
    503  crew_codes_busy  five codes in a row were taken (very unlikely: try again)

POST /api/crews/join
    {"code": "k7q-f2m"}   1 to 20 characters. Capitals, spaces and hyphens do not matter.
    The friend takes the lowest open seat. If there is none, the friend takes over the NPC
    partner who carries the friend's own kit, or else the partner whose kit comes last in the
    partner order. The seat then carries the friend's own kit. A player who started a crew and
    sits in it alone gives that draft up by joining another crew.
    200  the crew the friend joined
    404  wrong_code       no crew has that code (this counts as a wrong guess)
    409  kit_needed, already_in_crew, already_seated (the player sits in this crew already: treat
         as done), crew_full (four players), crew_finished, crew_busy (the crew changed three
         times while the player joined: try again)
    422  validation_error not 6 letters and digits (this does NOT count as a wrong guess), or an
         extra field
    429  too_many_requests 10 wrong codes in 10 minutes; the Retry-After header says how many
         seconds to wait. While it lasts even the right code is refused.

POST /api/crews/me/start
    No body. The player must sit in a forming crew. Every empty seat gets an NPC partner who
    carries the first kit that nobody in the crew has yet.
    200  the crew, now active, with all four seats
    404  no_crew          the player sits in no crew
    409  already_started (treat as done), crew_finished, crew_busy

GET /api/crews/me
    200  the crew the player sits in (forming or active), or {"crew": null}

Common errors (standard shape, see errors.py):
    401 unauthorized, 404 player_not_set_up, 502 database_error,
    503 auth_not_configured, auth_unavailable, database_not_configured, database_unavailable.
    A 503 means the outcome of a change is unknown: ask GET /api/crews/me before trying again.

Safe repeats: POST /api/crews gives the same draft back; join answers 409 already_seated; start
answers 409 already_started. A repeat never makes a second seat or a second crew.

Two seat choices in server/crews/seats.py were decided by Nils in the story round (D018): the
kit a seat carries after a friend takes it over, and the order in which partners fill the
missing kits.

Needs the crew migration (20261106040000) and the entry profiles of package A3.

Successful join and muster send a version-only crew_changed hint through the shared A4
broadcaster. It has a one-second budget; a failed hint leaves the successful API answer intact.
Reads, refused writes and repeated intents send no hint. live_presence remains off by default.

Used by: the game client (the crew screen) once it exists, and later the case board (S3, L3).
"""

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Response
from pydantic import BaseModel, ConfigDict, Field

from server.auth import PlayerDep
from server.crew_broadcast import BroadcasterDep
from server.crew_nudges import crew_changed
from server.crews.seats import SEAT_NUMBERS, Seat
from server.crews.service import (
    create_crew,
    find_my_crew,
    join_crew,
    no_crew,
    start_crew,
)
from server.crews.store import CrewRecord
from server.supabase_admin import AdminDep

router = APIRouter()

# A crew code has 6 symbols. A player may type spaces or hyphens around them.
MAX_TYPED_CODE_LENGTH = 20


class JoinRequest(BaseModel):
    """What the browser sends to POST /api/crews/join. Anything extra is refused."""

    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1, max_length=MAX_TYPED_CODE_LENGTH)


class SeatView(BaseModel):
    """One of the four seats. An open seat has no name, kit or partner."""

    seatNo: int  # camelCase on purpose: these are the exact JSON keys the browser reads
    holder: Literal["player", "partner", "open"]
    name: str | None
    kit: str | None
    partnerId: str | None
    isMe: bool


class CrewView(BaseModel):
    """A crew as the browser sees it. It holds no player id."""

    id: str
    code: str | None
    status: Literal["forming", "active", "finished"]
    mode: Literal["solo", "crew"]
    mySeat: int
    startedAt: datetime | None
    seats: list[SeatView]


class CrewResponse(BaseModel):
    """What every crew route returns. `crew` is empty when the player sits in no crew."""

    crew: CrewView | None


def seat_view(seat_no: int, seat: Seat | None, player_id: str) -> SeatView:
    if seat is None:
        return SeatView(
            seatNo=seat_no, holder="open", name=None, kit=None, partnerId=None, isMe=False
        )
    return SeatView(
        seatNo=seat_no,
        holder="partner" if seat.npc_id is not None else "player",
        name=seat.name,
        kit=seat.kit,
        partnerId=seat.npc_id,
        isMe=seat.player_id == player_id,
    )


def my_seat_number(crew: CrewRecord, player_id: str) -> int:
    """The seat number of the caller. 404 no_crew if they do not sit in this crew after all."""
    for seat in crew.seats:
        if seat.player_id == player_id:
            return seat.seat_no
    raise no_crew()


def crew_response(crew: CrewRecord, player_id: str) -> CrewResponse:
    """The view of a crew for one player: always four seats, and no player id."""
    by_number = {seat.seat_no: seat for seat in crew.seats}
    view = CrewView(
        id=crew.id,
        code=crew.code,
        status=crew.status,
        mode=crew.mode,
        mySeat=my_seat_number(crew, player_id),
        startedAt=crew.started_at,
        seats=[seat_view(number, by_number.get(number), player_id) for number in SEAT_NUMBERS],
    )
    return CrewResponse(crew=view)


@router.post("/crews")
async def post_crew(player: PlayerDep, admin: AdminDep, response: Response) -> CrewResponse:
    # Personal data: tell the hosting network and proxies not to keep a copy of the answer.
    response.headers["Cache-Control"] = "private, no-store"
    crew = await create_crew(admin, player.id)
    return crew_response(crew, player.id)


@router.post("/crews/join")
async def post_join(
    request: JoinRequest,
    player: PlayerDep,
    admin: AdminDep,
    response: Response,
    broadcaster: BroadcasterDep,
) -> CrewResponse:
    response.headers["Cache-Control"] = "private, no-store"
    crew = await join_crew(admin, player.id, request.code)
    await crew_changed(broadcaster, crew.id, crew.version)
    return crew_response(crew, player.id)


@router.post("/crews/me/start")
async def post_start(
    player: PlayerDep, admin: AdminDep, response: Response, broadcaster: BroadcasterDep
) -> CrewResponse:
    response.headers["Cache-Control"] = "private, no-store"
    crew = await start_crew(admin, player.id)
    await crew_changed(broadcaster, crew.id, crew.version)
    return crew_response(crew, player.id)


@router.get("/crews/me")
async def get_my_crew(player: PlayerDep, admin: AdminDep, response: Response) -> CrewResponse:
    response.headers["Cache-Control"] = "private, no-store"
    crew = await find_my_crew(admin, player.id)
    if crew is None:
        return CrewResponse(crew=None)
    return crew_response(crew, player.id)
