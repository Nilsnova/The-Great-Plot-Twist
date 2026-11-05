"""Delete route: DELETE /api/me removes the signed-in player and all their data.

This is the "delete my data" button. It deletes the login and every row of the player: the
profile, the save, the wallet, ALL ledger rows, seats, Island Exchange positions and trades, the
name re-roll and the entry profile. The ledger keeps nothing about the player: the coins are play
money, and "delete my data" must really delete (decision D018). A crew that the player started and
that other players sit in is handed to the player in the lowest seat first, so friends keep their
game. A crew nobody else sits in is deleted with the player. The handover happens only here:
deleting a user in the Supabase dashboard (Authentication > Users) skips it.

Not deleted: Supabase Auth's audit log (auth.audit_log_entries, which can hold the login e-mail
address and an IP address) and Supabase's platform logs, which expire on Supabase's own schedule.
Whether to purge the audit log, or to stop Auth writing it to the database, is part of the pending
decision N4 (D018).

Who may call it: signed-in players only. The player is the owner of the token in
    Authorization: Bearer <token>
and the id always comes from that verified login (`PlayerDep`, see auth.py), never from the body.

    DELETE /api/me
    {"confirm": true}      exactly true. Missing, false or anything else is refused.
      200  {"deleted": true}    the player and their data are gone (also if they were gone already)
      422  validation_error     `confirm` is not true, or there is an extra field. Nothing was
                                deleted.
      503  database_unavailable the OUTCOME IS UNKNOWN: the deletion may have happened. The message
                                says so. Deleting again is safe.
      401, 502, 503 auth_* and database_not_configured: as for GET /api/me.

The login token keeps working on the same server instance for up to 60 seconds after the deletion
(auth.py remembers a good token for that long). In that time a read such as GET /api/me answers
404 player_not_set_up. That is documented and accepted.

The route deletes no row itself: one database function does all of it in one step
(account/deletion.py). Careful with the log: one line is written, and it never holds the player id.

Used by: the game client, once the sign-in screen exists (a "delete my data" button).
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Response
from pydantic import AfterValidator, BaseModel, ConfigDict, StrictBool

from server.account.deletion import delete_player
from server.auth import PlayerDep
from server.supabase_admin import AdminDep

logger = logging.getLogger(__name__)

router = APIRouter()


def must_be_true(value: bool) -> bool:
    if value is not True:
        raise ValueError("confirm must be true")
    return value


class DeleteRequest(BaseModel):
    """What the browser sends. `confirm` must be exactly true: a stray request deletes nothing."""

    model_config = ConfigDict(extra="forbid")

    # StrictBool: only the JSON words true and false are booleans. Pydantic's Literal[True] would
    # also accept the number 1, because 1 == True in Python, and 1 is not a confirmation.
    confirm: Annotated[StrictBool, AfterValidator(must_be_true)]


class DeleteResponse(BaseModel):
    """What the route returns."""

    deleted: bool  # camelCase is not needed here: it is one plain word


# PENDING Nils' decision (N4 in specs/M1-backbone.md, D018): deletes every row, ledger included,
# and hands shared crews to the lowest other seat.
@router.delete("/me")
async def delete_me(
    body: DeleteRequest, player: PlayerDep, admin: AdminDep, response: Response
) -> DeleteResponse:
    # `body` is not read. It is here so that FastAPI checks it: without "confirm": true the
    # request is refused with a 422 before this function runs.
    response.headers["Cache-Control"] = "private, no-store"
    await delete_player(admin, player.id)
    # One line for the team, without the player id: it is personal data that is gone now.
    logger.info("A player deleted their account.")
    return DeleteResponse(deleted=True)
