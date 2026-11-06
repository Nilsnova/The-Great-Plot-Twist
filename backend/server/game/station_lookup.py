"""Read crew station ownership and timber through the existing home-islet store.

Used by: the case store. The fallback port keeps the case independent of an islet adapter.
"""

from collections.abc import Sequence
from typing import Protocol

from server.game import islet_store
from server.game.building_catalogue import load_buildings
from server.supabase_admin import SupabaseAdmin


class StationLookup(Protocol):
    async def players_with_signal_station(
        self, admin: SupabaseAdmin, player_ids: Sequence[str]
    ) -> frozenset[str]: ...

    async def timber(self, admin: SupabaseAdmin, player_id: str) -> int | None: ...


class NoStations:
    async def players_with_signal_station(
        self, admin: SupabaseAdmin, player_ids: Sequence[str]
    ) -> frozenset[str]:
        return frozenset()

    async def timber(self, admin: SupabaseAdmin, player_id: str) -> int | None:
        return None


class IsletStations:
    async def players_with_signal_station(
        self, admin: SupabaseAdmin, player_ids: Sequence[str]
    ) -> frozenset[str]:
        return await islet_store.players_with_signal_station(admin, player_ids)

    async def timber(self, admin: SupabaseAdmin, player_id: str) -> int:
        held = await islet_store.read_timber(admin, player_id)
        return load_buildings().starter_timber if held is None else held
