"""The island arsenal (T40, T41, D042): puts the rules, the policy and the database together.

    look()        the arsenal of your own island, or (with `code`) of a game you are a member of
    buy()         a new copy of a weapon type, paid with your own coins (ledger reason
                  weapon_purchase, ref arsenal:<actionUid>); into your hands when they are empty,
                  else onto the rack
    take()        a stored copy into your hands; if you carry one, the two swap in one step
    give_back()   the copy you carry back on the rack (409 arsenal_full keeps it in your hands)

How every action is made:
  1. Your own island is opened first (so a brand-new player holds the starting coins), then the
     island of `code`, if any.
  2. arsenal_policy.py says whether you may (403 not_member otherwise).
  3. arsenal_rules.py checks the type and the unlock; prices come from islands.json.
  4. One database function does the step under the island lock and answers the arsenal after it.
     A repeated actionUid changes nothing. A refusal changed nothing.

Used by: routes/arsenal.py.
"""

from dataclasses import dataclass

from server.game import islet_store
from server.island import arsenal_policy, arsenal_rules, arsenal_store, service, store
from server.island.arsenal_store import Outcome, SnapshotRow
from server.island.catalogue import IslandCatalogue
from server.island.codes import shown
from server.island.store import Island
from server.supabase_admin import SupabaseAdmin


@dataclass(frozen=True)
class CopyView:
    id: str
    no: int
    weapon: str
    name: str
    holder: str | None  # the captain's id, or None while stored
    holder_name: str | None
    away: bool  # the holder left the game (the copy goes back when there is room)
    you: bool


@dataclass(frozen=True)
class TypeView:
    weapon: str
    name: str
    coins: int
    unlock_wave: int
    unlocked: bool  # for you: your own best won wave


@dataclass(frozen=True)
class ArsenalView:
    code: str
    capacity: int
    stored: int
    copies: tuple[CopyView, ...]
    mine: str | None
    carried: str  # the type you carry here: a copy's type, or the standard musket
    wave_running: bool
    coins: int
    unlock_wave: int
    types: tuple[TypeView, ...]


def view_of(
    catalogue: IslandCatalogue,
    island: Island,
    player_id: str,
    snapshot: SnapshotRow,
    coins: int,
    unlock_wave: int,
) -> ArsenalView:
    names = {weapon.weapon: weapon.name for weapon in catalogue.weapons}
    copies = tuple(
        CopyView(
            item.id,
            item.no,
            item.weapon,
            names.get(item.weapon, item.weapon),
            item.holder,
            item.holderName,
            item.away,
            item.holder == player_id,
        )
        for item in snapshot.copies
    )
    carried = next((c.weapon for c in copies if c.id == snapshot.mine), None)
    types = tuple(
        TypeView(w.weapon, w.name, w.coins, w.unlock_wave, w.unlock_wave <= unlock_wave)
        for w in catalogue.weapons
    )
    return ArsenalView(
        shown(island.code),
        snapshot.capacity,
        snapshot.stored,
        copies,
        snapshot.mine,
        carried or arsenal_rules.STANDARD_WEAPON,
        snapshot.waveRunning,
        coins,
        unlock_wave,
        types,
    )


async def open_for(
    admin: SupabaseAdmin, catalogue: IslandCatalogue, player_id: str, code: str | None, action: str
) -> Island:
    """The island whose arsenal it is, after the permission check. Your own island always opens."""
    own = await store.open_island(admin, player_id, catalogue.starting_coins)
    island = own if code is None else await service.find_by_code(admin, code)
    await arsenal_policy.require_permission(admin, island, player_id, action)
    return island


async def answer(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    island: Island,
    player_id: str,
    outcome: Outcome,
    name: str = "This weapon",
) -> ArsenalView:
    """The view after a function answered, or its refusal as an ApiError."""
    if outcome.refusal is not None or outcome.snapshot is None:
        raise arsenal_rules.refusal_error(outcome.refusal or "", name, outcome.price)
    coins = await islet_store.read_coins(admin, player_id)
    unlock = (await store.read_progress(admin, player_id)).unlock_wave
    return view_of(catalogue, island, player_id, outcome.snapshot, coins, unlock)


async def look(
    admin: SupabaseAdmin, catalogue: IslandCatalogue, player_id: str, code: str | None = None
) -> ArsenalView:
    island = await open_for(admin, catalogue, player_id, code, "look")
    outcome = await arsenal_store.state(admin, player_id, island.owner)
    return await answer(admin, catalogue, island, player_id, outcome)


async def buy(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    player_id: str,
    weapon: str,
    action_uid: str,
    code: str | None = None,
) -> ArsenalView:
    """400 bad_weapon, 409 standard_weapon, 409 locked, 409 arsenal_full, 409 insufficient_funds,
    409 wave_running, 403 not_member, 404 no_such_island. A repeated actionUid charges nothing."""
    island = await open_for(admin, catalogue, player_id, code, "buy")
    unlock = (await store.read_progress(admin, player_id)).unlock_wave
    entry = arsenal_rules.check_buy(catalogue, weapon, unlock)
    arguments = {
        "p_player_id": player_id,
        "p_island_owner": island.owner,
        "p_weapon": entry.weapon,
        "p_action_uid": action_uid,
        "p_price": entry.coins,
        "p_unlock_wave": entry.unlock_wave,
    }
    outcome = await arsenal_store.run(admin, "arsenal_buy", arguments)
    return await answer(admin, catalogue, island, player_id, outcome, f"The {entry.name.lower()}")


async def take(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    player_id: str,
    copy_id: str,
    action_uid: str,
    code: str | None = None,
) -> ArsenalView:
    """404 no_such_copy, 409 taken, 409 wave_running, 403 not_member. Safe to repeat."""
    island = await open_for(admin, catalogue, player_id, code, "take")
    arguments = {
        "p_player_id": player_id,
        "p_island_owner": island.owner,
        "p_copy_id": copy_id,
        "p_action_uid": action_uid,
    }
    outcome = await arsenal_store.run(admin, "arsenal_take", arguments)
    return await answer(admin, catalogue, island, player_id, outcome)


async def give_back(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    player_id: str,
    action_uid: str,
    code: str | None = None,
) -> ArsenalView:
    """409 nothing_held, 409 arsenal_full (the copy stays with you), 409 wave_running."""
    island = await open_for(admin, catalogue, player_id, code, "return")
    arguments = {
        "p_player_id": player_id,
        "p_island_owner": island.owner,
        "p_action_uid": action_uid,
    }
    outcome = await arsenal_store.run(admin, "arsenal_return", arguments)
    return await answer(admin, catalogue, island, player_id, outcome)
