"""Me route: GET /api/me tells a signed-in player what the game knows about them.

Why it exists: after the GitHub sign-in the browser holds a login token, but it does not know
the player's game name, coins or crews. This route reads them from the database and sends them
back. Its first user is the sign-in check page (frontend/public/auth-check.html).

Who may call it: signed-in players only. The player is the owner of the token in
    Authorization: Bearer <token>
The player id always comes from that verified login (`PlayerDep`, see auth.py). It never comes
from the address, the headers or the body, so a player can only ask about themselves.

    GET /api/me
      200  {"id": "<player id>", "displayName": "Captain-3fa85f", "coins": 0,
            "crews": [{"id": "<crew id>", "mode": "solo", "status": "forming", "seatNo": 1}]}
      401  unauthorized          no token, a malformed one, or one that Supabase refuses
      404  player_not_set_up     the login is fine, but the player has no profile or wallet row
                                 (the sign-up trigger never ran for an account that was made
                                 before the database was ready)
      502  database_error        the database refused a read or answered with something odd
      503  auth_not_configured, auth_unavailable             the login cannot be checked
      503  database_not_configured, database_unavailable     the database cannot be read

What the fields mean:
  * displayName is profiles.display_name. It is never the GitHub login name or e-mail address.
  * coins is wallets.balance. A new wallet holds 0, which is a normal answer.
  * crews are the crews the player sits in, newest seat first, at most MAX_CREWS. seatNo is the
    player's own seat number (1 to 4) in that crew. The list is empty for a player in no crew.

How it reads: three reads with the server's secret key (SUPABASE_SECRET_KEY), which skips
row-level security. So the filter on the verified player id in each read is the ONLY thing that
keeps another player's rows out of the answer. The tests check every filter.

The answer holds personal data, so it carries `Cache-Control: private, no-store`: the hosting
network and proxies must not keep a copy. For the same reason the player id stays out of our
logs. Careful: the id is part of the ADDRESS of each database read, and the httpx library would
write that address to the log at INFO level. create_app() in app.py keeps that level off.

Used by: the sign-in check page, and later the game client.
"""

import logging
from typing import Any

from fastapi import APIRouter, Response
from pydantic import BaseModel, StrictInt, StrictStr, ValidationError

from server.auth import PlayerDep
from server.errors import ApiError
from server.supabase_admin import AdminDep, SupabaseAdmin, SupabaseRejected

logger = logging.getLogger(__name__)

router = APIRouter()

# The most crews the answer lists. Every list in the API has a maximum size.
MAX_CREWS = 20


class CrewSummary(BaseModel):
    """One crew the player sits in, and the seat they hold there."""

    id: str
    mode: str  # solo or crew
    status: str  # forming, active or finished
    seatNo: int  # camelCase on purpose: this is the exact JSON key the browser reads


class MeResponse(BaseModel):
    """What /api/me returns: the signed-in player's own data and nothing else."""

    id: str
    displayName: str  # camelCase on purpose, like the other JSON keys the browser reads
    coins: int
    crews: list[CrewSummary]


# The rows we read from the database, as small models. The database sends plain JSON, and a
# model checks that each row looks the way we expect. StrictStr and StrictInt mean "no
# conversions": the text "70" is not accepted where a number belongs.
class ProfileRow(BaseModel):
    display_name: StrictStr


class WalletRow(BaseModel):
    balance: StrictInt


class CrewRow(BaseModel):
    id: StrictStr
    mode: StrictStr
    status: StrictStr


class SeatRow(BaseModel):
    seat_no: StrictInt
    crews: CrewRow  # the crew of this seat, joined in by the database (see read_crews)


def player_not_set_up() -> ApiError:
    """The 404 for a signed-in player who has no profile or wallet row yet."""
    message = "Your player record is not set up yet. Ask the team to reset your account."
    return ApiError(404, "player_not_set_up", message)


def read_row(model: type[BaseModel], row: object) -> Any:
    """Check one row from the database against its model. A row we cannot read becomes a 502."""
    try:
        return model.model_validate(row)
    except ValidationError as error:
        # Say nothing about the row itself: it holds data. The model's name is enough to look
        # for the problem.
        logger.warning("The database sent a %s that we could not read.", model.__name__)
        raise SupabaseRejected("The database sent an answer we could not read.") from error


async def read_display_name(admin: SupabaseAdmin, player_id: str) -> str:
    """The player's display name, from the table profiles."""
    query = {"select": "display_name", "id": f"eq.{player_id}", "limit": "1"}
    rows = await admin.select_rows("profiles", query)
    if not rows:
        logger.warning("A signed-in player has no profile row.")
        raise player_not_set_up()
    return read_row(ProfileRow, rows[0]).display_name


async def read_coins(admin: SupabaseAdmin, player_id: str) -> int:
    """The player's coins, from the table wallets."""
    query = {"select": "balance", "player_id": f"eq.{player_id}", "limit": "1"}
    rows = await admin.select_rows("wallets", query)
    if not rows:
        logger.warning("A signed-in player has no wallet row.")
        raise player_not_set_up()
    return read_row(WalletRow, rows[0]).balance


async def read_crews(admin: SupabaseAdmin, player_id: str) -> list[CrewSummary]:
    """The crews the player sits in, found through their rows in the table crew_seats."""
    query = {
        # "crews(id,mode,status)" asks the database to join in the crew of each seat.
        "select": "seat_no,crews(id,mode,status)",
        "player_id": f"eq.{player_id}",
        "order": "joined_at.desc",
        "limit": str(MAX_CREWS),
    }
    rows = await admin.select_rows("crew_seats", query)

    crews = []
    for row in rows:
        seat = read_row(SeatRow, row)
        crew = seat.crews
        crews.append(
            CrewSummary(id=crew.id, mode=crew.mode, status=crew.status, seatNo=seat.seat_no)
        )
    return crews


@router.get("/me")
async def get_me(player: PlayerDep, admin: AdminDep, response: Response) -> MeResponse:
    # Personal data: tell the hosting network and proxies not to keep a copy of the answer.
    response.headers["Cache-Control"] = "private, no-store"
    display_name = await read_display_name(admin, player.id)
    coins = await read_coins(admin, player.id)
    crews = await read_crews(admin, player.id)
    return MeResponse(id=player.id, displayName=display_name, coins=coins, crews=crews)
