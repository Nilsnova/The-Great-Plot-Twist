"""Reset my island (T53, docs/GAME-V3.md section "Reset my island"): the owner of an island starts
it again from nothing, from Settings, between waves only, after typing the island code.

The work is one database function, island_fresh_start() (20261116070000_island_fresh_start.sql),
in one transaction: the wallet set to the starting coins of a brand-new player (the catalogue's
startingCoins, islands.json, the same number island_open() pays; reason fresh_start, ref
reset:<actionUid>), the save
emptied, every building but the cabin, the research, the moved spots, the arsenal, the wall records
and the island's waves removed, and the island row (best waves, flags, crews, captain, wreck,
weapons) back to its defaults. The island, its code, its members and the ledger stay.

This module only reads what the player typed and turns the database's answer into the route's:
  * the code is read like every typed code (codes.read_code: with or without ISLE-, any case);
    one that cannot be a code is 400 wrong_code at once, without a database call;
  * refused wrong_code (not your island's code)      -> 400 wrong_code
  * refused not_owner (no island of your own, or the code of a friend's game) -> 403 not_owner
  * refused wave_running                              -> 409 wave_running
  * refused player_not_set_up                         -> 404 player_not_set_up
  * a repeated actionUid answers the first reset's counts and resets nothing again.

Used by: routes/island_reset.py; tests test_fresh_start_routes.py.
"""

from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, StrictBool, StrictInt, StrictStr

from server.errors import ApiError
from server.game.islet_store import player_not_set_up
from server.island import codes
from server.island.catalogue import IslandCatalogue
from server.island.store import read_model
from server.supabase_admin import SupabaseAdmin

FUNCTION = "island_fresh_start"


class CountsRow(BaseModel):
    """What one reset cleared (the coins: the change made to the wallet, start minus before)."""

    coins: StrictInt
    saves: StrictInt
    buildings: StrictInt
    research: StrictInt
    layout: StrictInt
    arsenalMoves: StrictInt  # noqa: N815 - the database's JSON name
    arsenalCopies: StrictInt  # noqa: N815
    wallRecords: StrictInt  # noqa: N815
    waveRules: StrictInt  # noqa: N815
    waves: StrictInt
    membersKept: StrictInt  # noqa: N815


class DoneRow(BaseModel):
    status: Literal["done"]
    repeat: StrictBool
    balance: StrictInt
    counts: CountsRow


class RefusedRow(BaseModel):
    status: Literal["refused"]
    reason: StrictStr


@dataclass(frozen=True)
class FreshStart:
    repeat: bool
    balance: int
    counts: CountsRow


def wrong_code() -> ApiError:
    return ApiError(400, "wrong_code", "That is not your island's code. Type the code shown.")


def not_owner() -> ApiError:
    return ApiError(403, "not_owner", "Only the host can reset this game's island.")


def wave_running() -> ApiError:
    return ApiError(409, "wave_running", "A wave is under way. Reset your island between waves.")


def refusal(reason: str) -> ApiError:
    if reason == "wrong_code":
        return wrong_code()
    if reason == "not_owner":
        return not_owner()
    if reason == "wave_running":
        return wave_running()
    if reason == "player_not_set_up":
        return player_not_set_up()
    return ApiError(409, reason, "Your island could not be reset. Nothing changed.")


async def fresh_start(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    player_id: str,
    confirm_code: str,
    action_uid: str,
) -> FreshStart:
    """Reset the player's own island (see the module text). Raises ApiError for a refusal."""
    typed = codes.read_code(confirm_code)
    if typed is None:
        raise wrong_code()
    reply = await admin.call_function(
        FUNCTION,
        {
            "p_player_id": player_id,
            "p_action_uid": action_uid,
            "p_confirm_code": typed,
            "p_starting_coins": catalogue.starting_coins,
        },
    )
    if isinstance(reply, dict) and reply.get("status") == "refused":
        raise refusal(read_model(RefusedRow, reply).reason)
    row = read_model(DoneRow, reply)
    return FreshStart(repeat=row.repeat, balance=row.balance, counts=row.counts)
