"""Me route: GET /api/me tells a signed-in player what the game knows about them.

Why it exists: after the GitHub sign-in the browser holds a login token, but it does not know
the player's game name, coins or crews. This route reads them from the database and sends them
back. Its first user is the sign-in check page (frontend/public/auth-check.html).

Who may call it: signed-in players only. The player is the owner of the token in
    Authorization: Bearer <token>
The player id always comes from that verified login (`PlayerDep`, see auth.py). It never comes
from the address, the headers or the body, so a player can only ask about themselves.

    GET /api/me
      200  {"id": "<player id>", "displayName": "Brave Puffin 17", "coins": 0,
            "crews": [{"id": "<crew id>", "mode": "solo", "status": "forming", "seatNo": 1}],
            "captainName": "Brave Puffin 17", "kit": "witness", "place": "saltreach_harbor",
            "rerollsLeft": 1, "isHost": false}
      401  unauthorized          no token, a malformed one, or one that Supabase refuses
      404  player_not_set_up     the login is fine, but the player has no profile or wallet row
                                 (the sign-up trigger never ran for an account that was made
                                 before the database was ready)
      502  database_error        the database refused a read or answered with something odd
      503  auth_not_configured, auth_unavailable             the login cannot be checked
      503  database_not_configured, database_unavailable     the database cannot be read

What the fields mean:
  * displayName is profiles.display_name. It is never the GitHub login name or e-mail address.
    A new player has the sign-up placeholder ("Captain-3fa85f") until POST /api/me/name gives them
    a generated captain name (routes/captain_name.py).
  * captainName is displayName once the player has a generated captain name, and null while
    displayName is still the placeholder. It is worked out here, with no extra read. This route
    only reads: it never gives a name, so asking for it never changes anything.
  * kit and place are the entry kit id and the start place of a player who finished Act 1, and
    null before that. They come from the table entry_profiles, which the referee fills in
    (POST /api/intro/complete, package A3). A player has at most one row there.
  * rerollsLeft is 1 until the player has consumed their single name reroll, then 0.
    isHost is derived from this verified player id and the server's host list. Neither field
    causes a write or reveals another player's records.
  * coins is wallets.balance. A new wallet holds 0, which is a normal answer.
  * crews are the crews the player sits in, newest seat first, at most MAX_CREWS. seatNo is the
    player's own seat number (1 to 4) in that crew. The list is empty for a player in no crew.

How it reads: five reads with the server's secret key (SUPABASE_SECRET_KEY), which skips
row-level security: the profile, wallet, seats, entry profile and reroll record. The filter on
the verified player id in each read is the ONLY thing that keeps another player's rows out of
the answer. The tests check every filter. A refused read stops before later tables are asked for.

The fourth read needs the table entry_profiles (migration 20261106030000). A server that is
deployed before that migration is applied answers 502 database_error here, to every player. This
route is live today and a push to main deploys to production at once, so apply the migration
BEFORE the branch that holds this read is merged into main (a preview shares the same database, so
it breaks the same way). If the merge has to come first, hold this read back (kit and place stay
null) and merge it after the apply. See supabase/README.md, "Apply before you merge".

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

from server.account.names import is_placeholder
from server.auth import PlayerDep
from server.errors import ApiError
from server.game.entry_profile_store import read_kit_and_place
from server.settings import SettingsDep
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
    captainName: str | None
    kit: str | None
    place: str | None
    rerollsLeft: int
    isHost: bool


# The rows we read from the database, as small models. The database sends plain JSON, and a
# model checks that each row looks the way we expect. StrictStr and StrictInt mean "no
# conversions": the text "70" is not accepted where a number belongs.
class ProfileRow(BaseModel):
    display_name: StrictStr


class WalletRow(BaseModel):
    balance: StrictInt


class RerollRow(BaseModel):
    player_id: StrictStr


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


async def read_rerolls_left(admin: SupabaseAdmin, player_id: str) -> int:
    """The unique reroll row is the record of the player's single consumed reroll."""
    rows = await admin.select_rows(
        "captain_name_rerolls",
        {
            "select": "player_id",
            "player_id": f"eq.{player_id}",
            "limit": "1",
        },
    )
    if not rows:
        return 1
    if read_row(RerollRow, rows[0]).player_id != player_id:
        raise SupabaseRejected("The reroll record belongs to another player.")
    return 0


@router.get("/me")
async def get_me(
    player: PlayerDep, admin: AdminDep, settings: SettingsDep, response: Response
) -> MeResponse:
    # Personal data: tell the hosting network and proxies not to keep a copy of the answer.
    response.headers["Cache-Control"] = "private, no-store"
    display_name = await read_display_name(admin, player.id)
    coins = await read_coins(admin, player.id)
    crews = await read_crews(admin, player.id)
    entry = await read_kit_and_place(admin, player.id)  # None until the player finished Act 1
    rerolls_left = await read_rerolls_left(admin, player.id)
    captain_name = None if is_placeholder(display_name, player.id) else display_name
    return MeResponse(
        id=player.id,
        displayName=display_name,
        coins=coins,
        crews=crews,
        captainName=captain_name,
        kit=entry.kit if entry else None,
        place=entry.place if entry else None,
        rerollsLeft=rerolls_left,
        isHost=player.id in settings.host_player_ids,
    )
