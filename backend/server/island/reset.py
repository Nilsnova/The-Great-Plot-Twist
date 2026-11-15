"""D054: a player resets their OWN island to a fresh start ("Start fresh" in Settings › Account).

The whole reset is one database function, island_reset_own() of
supabase/migrations/20261116010000_island_reset.sql: it locks the wallet, then the island, refuses
while a wave runs there, clears the island (buildings, layout, research, arsenal, wave runs, the
other members of its game, crew and captain progress) and sets the wallet to the starting coins
through the ledger (reason island_reset, ref reset:<actionUid>). A repeated actionUid changes
nothing. This module only maps the answer to the island view or an error.

Used by: backend/server/routes/island_reset.py.
"""

from typing import Literal

from pydantic import BaseModel, StrictBool, StrictInt

from server.errors import ApiError
from server.game import islet_store
from server.island import service, store
from server.island.catalogue import IslandCatalogue
from server.island.service import IslandView
from server.supabase_admin import SupabaseAdmin

RESET_PREFIX = "reset:"


class ResetRow(BaseModel):
    status: Literal["done"]
    balance: StrictInt
    repeat: StrictBool


def no_island() -> ApiError:
    return ApiError(404, "no_island", "You have no island to reset yet. Open your island first.")


def wave_running() -> ApiError:
    return ApiError(409, "wave_running", "A wave is under way. Start fresh between waves.")


async def reset_own(
    admin: SupabaseAdmin, catalogue: IslandCatalogue, player_id: str, action_uid: str
) -> IslandView:
    """Reset the player's own island and answer it as it is now (fresh, with the starting coins).
    404 player_not_set_up, 404 no_island, 409 wave_running; nothing changes then."""
    arguments = {
        "p_player_id": player_id,
        "p_action_uid": action_uid,
        "p_start_coins": catalogue.starting_coins,
    }
    reply = await admin.call_function("island_reset_own", arguments)
    refusal = store.refusal_or_none(reply)
    if refusal is not None:
        if refusal.reason == "player_not_set_up":
            raise islet_store.player_not_set_up()
        if refusal.reason == "no_island":
            raise no_island()
        if refusal.reason == "wave_running":
            raise wave_running()
        raise store.unreadable()
    store.read_model(ResetRow, reply)
    island = await store.open_island(admin, player_id, catalogue.starting_coins)
    return await service.look_open(admin, catalogue, island)
