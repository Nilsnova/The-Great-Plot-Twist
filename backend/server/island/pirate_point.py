"""Pirate Point, the joint island: its shared buildings (docs/TOWER-DEFENSE.md section 5).

    look()     every Pirate Point spot with what stands there, and Pirate Point's best wave
    build()    build one spot, paid by the player who clicks (pp_build)
    upgrade()  one level up for one spot, paid by the player who clicks (pp_upgrade)

The buildings belong to Pirate Point: everybody sees and fights with them, and they stay between
battles. The prices and the unlocks are the island's (islands.json); the player's own unlock wave
decides what they may build or upgrade here. The database part is pirate_point_buildings in
supabase/migrations/20261111030000_tower_defense.sql. A repeated actionUid (ledger ref
pp:<actionUid>) answers the state as it is and charges nothing.

Used by: routes/pirate_point.py and the tests.
"""

from dataclasses import dataclass

from server.game import islet_store
from server.island import rules, store
from server.island.catalogue import IslandCatalogue
from server.island.rules import SpotView
from server.island.service import paid
from server.supabase_admin import SupabaseAdmin

REF_PREFIX = "pp:"


@dataclass(frozen=True)
class PointView:
    spots: tuple[SpotView, ...]
    wave_best: int
    coins: int  # the coins of the player who asks


async def look(admin: SupabaseAdmin, catalogue: IslandCatalogue, player_id: str) -> PointView:
    built = await store.read_point_buildings(admin)
    spots = rules.plan_spots(catalogue, built, catalogue.pirate_point_spots)
    wave_best = await store.read_point_wave_best(admin)
    coins = await islet_store.read_coins(admin, player_id)
    return PointView(spots, wave_best, coins)


async def unlock_wave(admin: SupabaseAdmin, catalogue: IslandCatalogue, player_id: str) -> int:
    await store.open_island(admin, player_id, catalogue.starting_coins)
    return (await store.read_progress(admin, player_id)).unlock_wave


async def build(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    player_id: str,
    spot_id: str,
    kind: str,
    action_uid: str,
) -> PointView:
    """404 no_such_spot, 422 wrong_kind, 409 spot_taken, 409 locked, 409 insufficient_funds."""
    wave = await unlock_wave(admin, catalogue, player_id)
    if not await store.ledger_has(admin, player_id, "building_purchase", REF_PREFIX + action_uid):
        built = await store.read_point_buildings(admin)
        spots = catalogue.pirate_point_spots
        spot, price = rules.check_build(catalogue, spot_id, kind, built, wave, spots)
        arguments = {
            "p_player_id": player_id,
            "p_spot": spot.id,
            "p_kind": kind,
            "p_action_uid": action_uid,
            "p_price": price,
        }
        await paid(admin, "pp_build", arguments, f"A {rules.kind_of(catalogue, kind).name.lower()}")
    return await look(admin, catalogue, player_id)


async def upgrade(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    player_id: str,
    spot_id: str,
    kind: str | None,
    action_uid: str,
) -> PointView:
    """404 no_such_spot, 409 not_built, 422 wrong_kind (a kind that does not stand there), 409
    max_level, 409 locked, 409 insufficient_funds."""
    wave = await unlock_wave(admin, catalogue, player_id)
    if not await store.ledger_has(admin, player_id, "building_purchase", REF_PREFIX + action_uid):
        built = await store.read_point_buildings(admin)
        spots = catalogue.pirate_point_spots
        standing = built.get(spot_id)
        if kind is not None and standing is not None and standing.kind != kind:
            raise rules.BuildRefused(422, "wrong_kind", "Something else stands on this spot.")
        spot, entry, reachable = rules.check_upgrade(catalogue, spot_id, built, wave, spots)
        arguments = {
            "p_player_id": player_id,
            "p_spot": spot.id,
            "p_kind": entry.kind,
            "p_action_uid": action_uid,
            "p_prices": list(entry.prices),
            "p_unlocked_level": reachable,
        }
        await paid(admin, "pp_upgrade", arguments, f"The next {entry.name.lower()} level")
    return await look(admin, catalogue, player_id)
