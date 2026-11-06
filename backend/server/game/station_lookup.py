"""The finale's small read-only port to immutable home signal stations and timber."""

from collections.abc import Sequence
from typing import Protocol

from server.game import islet_store
from server.game.building_catalogue import BuildingCatalogue
from server.supabase_admin import SupabaseAdmin, SupabaseRejected


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
    def __init__(self, catalogue: BuildingCatalogue) -> None:
        self.catalogue = catalogue

    async def players_with_signal_station(
        self, admin: SupabaseAdmin, player_ids: Sequence[str]
    ) -> frozenset[str]:
        return await islet_store.players_with_signal_station(admin, player_ids)

    async def timber(self, admin: SupabaseAdmin, player_id: str) -> int:
        amount = await islet_store.read_timber(admin, player_id)
        if amount is None:
            return self.catalogue.starter_timber
        if type(amount) is not int or amount < 0:
            raise SupabaseRejected("The islet materials could not be read.")
        return amount
