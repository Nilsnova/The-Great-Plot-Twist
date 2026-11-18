"""Delete the verified account through one atomic lifecycle transaction.

DELETE /api/me {"confirm": true, "confirmOwnedIslandDeletion": false}
returns {"deleted": true}. Both confirmations are strict booleans; the first must
be true. The database determines whether the account owns an admitted shared
island. If it does, the optional second confirmation must also be true, otherwise
409 owned_island_confirmation_required leaves everything intact. A visited
island never becomes the caller's owned island through this request.

Legacy-only accounts keep the original purge and crew handover. Shared members
return held copies on continuing islands. Confirmed owner deletion removes the
owned island without transfer, preserving other players' personal Captain
progress. Minimal immutable UUID origins needed for legitimate retained
settlements and receipts survive; Auth credentials, profile and personal live
state are deleted together. The new transaction revokes controls before profile
cascades, while shared endpoints reject cached deleted identities.

Auth audit/platform logs remain subject to Supabase retention as before (D022).
No player id or other personal information is written to the route's log. A503
means the outcome is unknown: retry the same confirmation body. See
specs/MP-ECO-16-lifecycle-compatibility-integration.md for composition details.

Used by the account settings screen and authenticated lifecycle acceptance.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Response
from pydantic import AfterValidator, BaseModel, ConfigDict, StrictBool

from server.account.deletion import outcome_unknown
from server.auth import PlayerDep
from server.errors import ApiError
from server.island.shared_lifecycle import delete_player
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
    confirmOwnedIslandDeletion: StrictBool = False


class DeleteResponse(BaseModel):
    """What the route returns."""

    deleted: bool  # camelCase is not needed here: it is one plain word


# PENDING Nils' decision (N4 in specs/M1-backbone.md, D022): deletes every row, ledger included,
# and hands shared crews to the lowest other seat.
@router.delete("/me")
async def delete_me(
    body: DeleteRequest, player: PlayerDep, admin: AdminDep, response: Response
) -> DeleteResponse:
    response.headers["Cache-Control"] = "private, no-store"
    try:
        await delete_player(admin, player.id, body.confirmOwnedIslandDeletion)
    except ApiError as error:
        if error.code == "database_unavailable":
            raise outcome_unknown() from error
        raise
    # One line for the team, without the player id: it is personal data that is gone now.
    logger.info("A player deleted their account.")
    return DeleteResponse(deleted=True)
