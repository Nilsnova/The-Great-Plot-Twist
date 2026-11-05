"""Captain name routes: a generated name for a new player, and one re-roll.

Why they exist: at sign-up every player gets a neutral placeholder name ("Captain-3fa85f"). Names
appear on a projector, so a real name is never taken from the login and never typed in: the server
picks one from the word lists in backend/content/names.json, for example "Brave Puffin 17"
(decision D006). The player may change it once.

Who may call them: signed-in players only. The player is the owner of the token in
    Authorization: Bearer <token>
The player id always comes from that verified login (`PlayerDep`, see auth.py), never from the body.
Every answer carries `Cache-Control: private, no-store`.

    POST /api/me/name          (no body)
      200  {"captainName": "Brave Puffin 17", "rerollsLeft": 1}
      Gives the player their captain name. It is idempotent: the name is written only while the
      placeholder is still there, so asking again changes nothing and answers 200 with the same
      name.
      404  player_not_set_up     the player has no profile row

    POST /api/me/name/reroll
      {"actionUid": "r8x2k9m4"}   8 to 64 characters of A-Z a-z 0-9 _ -. Anything else is refused.
      200  {"captainName": "Calm Gannet 42", "rerollsLeft": 0}
      409  already_applied      this very actionUid was used for the one re-roll (treat as done)
      409  no_rerolls_left      the one re-roll is used up
      409  no_name_yet          call POST /api/me/name first
      404  player_not_set_up    the player has no profile row
      422  validation_error     a bad or missing actionUid, or an extra field. Nothing was called.
      The new name is always a different one from the current name.

Both routes also answer: 401 unauthorized, 502 database_error, 503 auth_not_configured,
auth_unavailable, database_not_configured and database_unavailable (as GET /api/me does).

The names come from the word lists only. A name from the login (the GitHub login, the e-mail
address) never appears here, and the body of the re-roll cannot name a player or a name.

Used by: the game client, once the sign-in screen exists.
"""

from fastapi import APIRouter, Response
from pydantic import BaseModel, ConfigDict, Field

from server.account.name_store import (
    NameReply,
    assign_name,
    read_current_name,
    reroll_name,
)
from server.account.names import (
    MAX_REROLLS,
    load_word_lists,
    pick_name,
    pick_new_name,
    placeholder_name,
)
from server.auth import PlayerDep
from server.errors import ApiError
from server.routes.me import player_not_set_up
from server.supabase_admin import AdminDep, AlreadyApplied

router = APIRouter()

# The actionUid is made once per click by the browser. The database repeats the same rule (the
# check captain_name_rerolls_action_uid_format), and a test compares the two.
ACTION_UID_MIN_LENGTH = 8
ACTION_UID_MAX_LENGTH = 64
ACTION_UID_PATTERN = r"^[A-Za-z0-9_-]+$"


class RerollRequest(BaseModel):
    """What the browser sends to re-roll. Anything extra is refused."""

    model_config = ConfigDict(extra="forbid")

    actionUid: str = Field(  # camelCase on purpose: this is the exact JSON key the browser sends
        min_length=ACTION_UID_MIN_LENGTH,
        max_length=ACTION_UID_MAX_LENGTH,
        pattern=ACTION_UID_PATTERN,
    )


class CaptainNameResponse(BaseModel):
    """What both routes return: the player's captain name and the re-rolls they have left."""

    captainName: str  # camelCase on purpose: these are the exact JSON keys the browser reads
    rerollsLeft: int


def name_response(reply: NameReply) -> CaptainNameResponse:
    rerolls_left = max(0, MAX_REROLLS - reply.rerolls_used)
    return CaptainNameResponse(captainName=reply.name, rerollsLeft=rerolls_left)


def refusal_error(reason: str) -> ApiError:
    """The 409 for a re-roll that a rule refused."""
    if reason == "already_applied":
        return AlreadyApplied()
    if reason == "no_rerolls_left":
        return ApiError(409, "no_rerolls_left", "You already used your one re-roll.")
    return ApiError(409, "no_name_yet", "Get your captain name first.")


@router.post("/me/name")
async def post_name(player: PlayerDep, admin: AdminDep, response: Response) -> CaptainNameResponse:
    response.headers["Cache-Control"] = "private, no-store"
    name = pick_name(load_word_lists())
    reply = await assign_name(admin, player.id, placeholder_name(player.id), name)
    if reply.status == "missing":
        raise player_not_set_up()
    return name_response(reply)


@router.post("/me/name/reroll")
async def post_reroll(
    body: RerollRequest, player: PlayerDep, admin: AdminDep, response: Response
) -> CaptainNameResponse:
    response.headers["Cache-Control"] = "private, no-store"
    current_name = await read_current_name(admin, player.id)
    if current_name is None:
        raise player_not_set_up()
    new_name = pick_new_name(load_word_lists(), current_name)
    reply = await reroll_name(
        admin, player.id, placeholder_name(player.id), new_name, body.actionUid
    )
    if reply.status == "missing":
        raise player_not_set_up()
    if reply.status == "refused":
        raise refusal_error(reply.reason)
    return name_response(reply)
