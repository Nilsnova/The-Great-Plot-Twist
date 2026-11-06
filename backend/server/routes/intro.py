"""Intro route: POST /api/intro/complete hands in the Act 1 move log and gets the entry kit.

This is package A3 (the referee and the entry kits).

Why it exists: the browser plays Act 1 by itself. At the end it sends the list of moves it made,
and the server plays the same moves again with the original story engine (the referee,
game/referee.py). Only what that replay reaches counts. The server works out the ending, the
decision and the kit itself, stores them as the player's entry profile, and pays the kit coins
once. The browser can never send a kit, an ending or a player: a body with any field but `actions`
is refused.

Who may call it: signed-in players only. The player is the owner of the token in
    Authorization: Bearer <token>
The player id always comes from that verified login (`PlayerDep`, see auth.py), never from the body.

    POST /api/intro/complete
    {"actions": ["to_desk", "take_key", "desk_back", "to_shore", "take_lantern", "warn_harbor",
                 "shore_back", "to_tower", "unlock_door", "climb", "untie"]}
      `actions`: 1 to 300 action ids of the story, in the order the player picked them. An id is
      1 to 40 characters of a-z, 0-9 and underscore.

      200  {"ending": "ending_trapped", "decision": "warned", "readLog": false,
            "kit": {"id": "witness", "name": "Witness", "startPlace": "saltreach_harbor",
                    "coins": 1000,
                    "item": {"id": "radio_words", "name": "Words through the door", "text": "..."},
                    "cheapCard": "C2"},
            "coinsPaid": 1000, "alreadyGranted": false}
      422  validation_error     no `actions`, an empty or longer than 300 list, an odd id, or any
                                extra field (a kit, an ending, a player id). Nothing was stored.
      422  move_refused         a move the story does not allow at that point (an unknown id, a move
                                of another scene, a blocked move, a move after the ending). The
                                message names the first bad move, for example "Move 2". It also
                                answers a log that only a newer story allows, and says to reload.
      422  no_ending            the moves stop before an ending
      422  invalid_transaction  the kit amount is refused by the wallet rules (a mistake in
                                entry_kits.json; the wallet is never called)
      404  player_not_set_up     the player has no profile row
      503  intro_unavailable     the story or the kits file cannot be read on this server
      401, 502 and 503 auth_* / database_*: as for GET /api/me. After a 503 database_unavailable
      the OUTCOME IS UNKNOWN (the kit may have been granted before the call timed out): send the
      same request again, it is safe, or look at GET /api/me, which shows `kit` once it is granted.

What the fields mean:
  * ending is the id of the Act 1 ending scene the replay reached (ending_rescue or ending_trapped).
  * decision is warned (the player sent the note to the harbor master), trusted (they told the
    fisherman) or none (they took no side).
  * readLog is true if the player read the keeper's last logbook entry. It gives the log card on the
    case board. It does not change the kit.
  * kit is one of four: True Keeper, Witness, Informant, Stranger. The 8 end states map to them
    (README of backend/content, "The format of entry_kits.json"). startPlace, coins, the item and
    the cheap card come with the kit.
  * coinsPaid is what this call paid: the kit coins the first time, otherwise 0.
  * alreadyGranted is true when the player had an entry profile already.

The first ending counts (PENDING Nils' decision N6, decision D019). A player who has a profile gets
that STORED profile back, whatever log they send now, with coinsPaid 0 and alreadyGranted true. The
ending, the decision, the kit, the start place and the coins in the answer are the stored ones. So
the call is safe to repeat: a double click, a retry after a timeout, or a second playthrough changes
nothing.

The coins move exactly once, inside the database function grant_entry_kit, which stores the profile
and calls the wallet function in one step (reason kit_grant, fixed ref kit). This route checks the
amount with the wallet rules first, but it never calls the wallet itself.

The log carries no story version. The server replays on the story it has, and stores the SHA-256
of that file with the profile (it is not required of the browser). Story v2 only adds actions, so
an old log still replays to the same end state.

The answer is for one player and is never cached (`Cache-Control: private, no-store`).

Used by: the game client, at the end of Act 1.
"""

import logging
from dataclasses import dataclass
from typing import Annotated

from fastapi import APIRouter, Response
from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from plot_twist.engine import STORY_PATH, Story, load_story
from server.auth import PlayerDep
from server.errors import ApiError
from server.game.entry_kits import (
    ENTRY_KITS_PATH,
    EntryKits,
    kit_by_id,
    kit_for,
    load_entry_kits,
)
from server.game.entry_profile_store import (
    KIT_REASON,
    KIT_REF,
    EntryProfile,
    GrantReply,
    grant_entry_kit,
)
from server.game.referee import MAX_MOVES, judge, story_fingerprint
from server.routes.me import player_not_set_up
from server.supabase_admin import AdminDep
from server.wallet import validate_transaction

logger = logging.getLogger(__name__)

router = APIRouter()

# One move of the log is the id of an action in the story: lowercase letters, digits and
# underscores. strict=True means the number 42 is not quietly turned into the text "42".
MAX_ACTION_ID_LENGTH = 40
ActionId = Annotated[
    str,
    StringConstraints(
        strict=True, min_length=1, max_length=MAX_ACTION_ID_LENGTH, pattern=r"^[a-z0-9_]+$"
    ),
]


class CompleteRequest(BaseModel):
    """What the browser sends at the end of Act 1. Anything extra is refused."""

    model_config = ConfigDict(extra="forbid")

    actions: list[ActionId] = Field(min_length=1, max_length=MAX_MOVES)


class ItemResponse(BaseModel):
    """The small item that comes with a kit."""

    id: str
    name: str
    text: str


class KitResponse(BaseModel):
    """The kit the player got."""

    id: str
    name: str
    startPlace: str  # camelCase on purpose: these are the exact JSON keys the browser reads
    coins: int
    item: ItemResponse
    cheapCard: str


class CompleteResponse(BaseModel):
    """What POST /api/intro/complete returns."""

    ending: str
    decision: str
    readLog: bool
    kit: KitResponse
    coinsPaid: int
    alreadyGranted: bool


@dataclass(frozen=True)
class IntroContent:
    """The three things the route reads from disk for every request."""

    story: Story
    kits: EntryKits
    fingerprint: str  # the SHA-256 of the story file


def load_intro_content() -> IntroContent:
    """Read the story and the kits (small files). A file that cannot be read is a 503."""
    try:
        return IntroContent(
            story=load_story(STORY_PATH),
            kits=load_entry_kits(ENTRY_KITS_PATH),
            fingerprint=story_fingerprint(STORY_PATH),
        )
    except (OSError, ValueError) as error:
        # The message names the file or the field, never a player. The answer stays generic.
        logger.warning("The intro content could not be read: %s", error)
        raise ApiError(
            503, "intro_unavailable", "The intro cannot be checked right now. Try again soon."
        ) from error


def build_answer(reply: GrantReply, profile: EntryProfile, kits: EntryKits) -> CompleteResponse:
    """The answer, from the profile the database returned (the stored one on a repeat).

    The kit's texts come from the kits file. The start place and the coins come from the stored
    profile, because those are what the player really got.
    """
    kit = kit_by_id(kits, profile.kit)
    return CompleteResponse(
        ending=profile.ending,
        decision=profile.decision,
        readLog=profile.read_log,
        kit=KitResponse(
            id=kit.id,
            name=kit.name,
            startPlace=profile.start_place,
            coins=profile.kit_coins,
            item=ItemResponse(id=kit.item.id, name=kit.item.name, text=kit.item.text),
            cheapCard=kit.cheap_card,
        ),
        coinsPaid=reply.coins_paid,
        alreadyGranted=reply.status == "stored",
    )


@router.post("/intro/complete")
async def post_complete(
    body: CompleteRequest, player: PlayerDep, admin: AdminDep, response: Response
) -> CompleteResponse:
    response.headers["Cache-Control"] = "private, no-store"
    content = load_intro_content()
    # A forged log is refused here, before the database is called, so nothing is stored.
    verdict = judge(content.story, content.kits, body.actions)
    kit = kit_for(content.kits, verdict.ending, verdict.decision)
    # Check the amount with the wallet rules before any database call. The coins themselves move
    # inside grant_entry_kit, never here.
    validate_transaction(kit.coins, KIT_REASON, KIT_REF)
    reply = await grant_entry_kit(admin, player.id, verdict, kit, content.fingerprint)
    if reply.status == "missing" or reply.profile is None:
        raise player_not_set_up()
    return build_answer(reply, reply.profile, content.kits)
