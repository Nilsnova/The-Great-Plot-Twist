"""Save routes: the player's progress in the cloud, so they can go on at a second device.

A save is the browser's own progress (the local Act 1 state, settings). It is a JSON object that
the browser writes and reads back. The server never trusts it for coins, kits, names or crews: those
come from the server's own records.

Who may call them: signed-in players only. The player is the owner of the token in
    Authorization: Bearer <token>
The player id always comes from that verified login (`PlayerDep`, see auth.py), never from the
address or the body, so a player can only read and write their own save. Every answer carries
`Cache-Control: private, no-store`.

    GET /api/save
      200  {"version": 3, "data": {...}, "updatedAt": "2026-11-06T10:15:02Z"}
      404  player_not_set_up     the player has no save row

    PUT /api/save
      {"version": 3, "data": {"intro": {"scene": "shore"}, "settings": {"sound": true}}}
      200  {"version": 4, "updatedAt": "2026-11-06T10:15:30Z"}
      409  stale_save       the save changed on another device since version 3. Nothing was
                            written. Read the newest save with GET /api/save, then save again.
      422  save_too_big     more than 100000 bytes of compact JSON (or 200000 as jsonb text)
      422  save_not_json    the data holds a value that JSON cannot store, such as NaN
      422  validation_error the version is not a whole number from 1 to 2147483647, `data` is
                            not a JSON object (a list, text or null), or there is an extra field
      404  player_not_set_up the player has no save row

    `version` is the version the browser last read. The save is written only if it is still the
    current version, and then the version goes up by one. So an old copy on a second device can
    never overwrite newer progress. A repeated PUT finds the version moved on and gets 409
    stale_save, with nothing changed.

Both routes also answer: 401 unauthorized, 502 database_error, 503 auth_not_configured,
auth_unavailable, database_not_configured and database_unavailable (as GET /api/me does).

Used by: the game client, once the sign-in screen exists.
"""

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Response
from pydantic import BaseModel, ConfigDict, Field, StrictInt

from server.account.saves import (
    MAX_SAVE_VERSION,
    SaveReply,
    check_save_size,
    read_save,
    save_too_big,
    write_save,
)
from server.auth import PlayerDep
from server.errors import ApiError
from server.routes.me import player_not_set_up
from server.supabase_admin import AdminDep

router = APIRouter()


class SaveResponse(BaseModel):
    """What GET /api/save returns: the save and the version to send back when saving."""

    version: int
    data: dict[str, Any]
    updatedAt: datetime  # camelCase on purpose: these are the exact JSON keys the browser reads


class SaveRequest(BaseModel):
    """What the browser sends to PUT /api/save. Anything extra is refused."""

    model_config = ConfigDict(extra="forbid")

    # StrictInt: 3 is fine, but "3", 2.5 and true are refused instead of quietly repaired. The upper
    # limit is the largest number that the database column holds (see MAX_SAVE_VERSION).
    version: StrictInt = Field(ge=1, le=MAX_SAVE_VERSION)
    data: dict[str, Any]


class SavedResponse(BaseModel):
    """What PUT /api/save returns: the new version, to send with the next save."""

    version: int
    updatedAt: datetime


def stale_save() -> ApiError:
    return ApiError(
        409,
        "stale_save",
        "Your save changed on another device. Load the newest save, then save again.",
    )


def saved_response(reply: SaveReply) -> SavedResponse:
    """The answer for a save that was written, or the error for one that was not."""
    if reply.status == "stale":
        raise stale_save()
    if reply.status == "too_big":
        raise save_too_big()
    if reply.status == "missing" or reply.updated_at is None:
        raise player_not_set_up()
    return SavedResponse(version=reply.version, updatedAt=reply.updated_at)


@router.get("/save")
async def get_save(player: PlayerDep, admin: AdminDep, response: Response) -> SaveResponse:
    response.headers["Cache-Control"] = "private, no-store"
    row = await read_save(admin, player.id)
    if row is None:
        raise player_not_set_up()
    return SaveResponse(version=row.version, data=row.data, updatedAt=row.updated_at)


@router.put("/save")
async def put_save(
    body: SaveRequest, player: PlayerDep, admin: AdminDep, response: Response
) -> SavedResponse:
    response.headers["Cache-Control"] = "private, no-store"
    check_save_size(body.data)
    reply = await write_save(admin, player.id, body.version, body.data)
    return saved_response(reply)
