"""The island service: puts the rules and the database together for routes/island.py.

    look()     the signed-in player's own island (made on first use, with the starting coins)
    build()    one building on one spot, paid in coins
    upgrade()  one level up for a building (docs/TOWER-DEFENSE.md section 2)
    hire()     one crew member (section 3)
    captain()  one captain level up (section 10)
    visit()    another player's island, found by its code
    invite()   the friend invite: an anonymous guest with a valid island code is admitted

How a paid action is made, in one place:
  1. The island is opened (island_open), so a brand-new player holds the starting coins first.
  2. A click that was done already (its ledger ref is in the wallet, or for a build in
     islet_buildings) is answered with the island as it is now: a repeat is never charged twice.
  3. rules.py says whether the action is allowed now (the spot, the kind, the level, the unlock)
     and what it costs. Prices, maximums and unlocks come from islands.json, never the request.
  4. One database function takes the coins and changes the island in ONE step. It checks the
     maximum and the unlocked level again, so two clicks at once cannot skip a rule.

Used by: routes/island.py, waves.py, pirate_point.py and app.py (which keeps the catalogue).
"""

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request

from server.errors import ApiError
from server.game import islet_store
from server.game.building_catalogue import Cost
from server.island import rules, store
from server.island.catalogue import IslandCatalogue
from server.island.codes import read_code, shown
from server.island.rules import Built, SpotView
from server.island.store import Island, Paid, Progress, Refusal
from server.supabase_admin import AlreadyApplied, InsufficientFunds, SupabaseAdmin, SupabaseRejected
from server.wallet import validate_transaction

# The ledger references: this text plus the actionUid the browser made.
REF_PREFIX = "island:"
UPGRADE_PREFIX = "upgrade:"
CREW_PREFIX = "crew:"
CAPTAIN_PREFIX = "captain:"
# The island has no timber any more (BUILD-PLAN 3.2): coins only.
NO_TIMBER = 0


@dataclass(frozen=True)
class Unlocks:
    wave: int  # the best wave the player won (own island or Pirate Point)
    unlocked: tuple[str, ...]  # "wall:1", "crew:gunner", "captain:2", ...
    locked: dict[str, int]  # the rest, with the wave each one needs


@dataclass(frozen=True)
class IslandView:
    """What GET /api/island and every island action answer."""

    code: str  # as people see it: ISLE-K7Q2M
    coins: int
    wave_best: int
    flags: int
    next_wave: int
    spots: tuple[SpotView, ...]
    crew: dict[str, int]
    captain_level: int
    captain_next_price: int | None
    unlocks: Unlocks


@dataclass(frozen=True)
class VisitView:
    """What GET /api/island/visit/{code} answers."""

    code: str
    owner_name: str
    wave_best: int
    spots: tuple[SpotView, ...]


@dataclass(frozen=True)
class InviteView:
    code: str
    owner_name: str


def no_such_island() -> ApiError:
    return ApiError(404, "no_such_island", "There is no island with that code.")


def unlocks_of(catalogue: IslandCatalogue, wave: int) -> Unlocks:
    table = rules.unlock_table(catalogue)
    unlocked = tuple(item for item, needed in table if needed <= wave)
    locked = {item: needed for item, needed in table if needed > wave}
    return Unlocks(wave, unlocked, locked)


def view_of(
    catalogue: IslandCatalogue,
    island: Island,
    coins: int,
    built: dict[str, Built],
    progress: Progress,
) -> IslandView:
    return IslandView(
        code=shown(island.code),
        coins=coins,
        wave_best=progress.wave_best,
        flags=island.flags,
        next_wave=rules.next_wave(catalogue, progress.wave_best, progress.next_wave),
        spots=rules.plan_spots(catalogue, built),
        crew=progress.crew,
        captain_level=progress.captain_level,
        captain_next_price=rules.captain_next_price(catalogue, progress.captain_level),
        unlocks=unlocks_of(catalogue, progress.unlock_wave),
    )


async def look(admin: SupabaseAdmin, catalogue: IslandCatalogue, player_id: str) -> IslandView:
    """The player's own island. The first look makes it (and pays the starting coins once)."""
    island = await store.open_island(admin, player_id, catalogue.starting_coins)
    return await look_open(admin, catalogue, island)


async def look_open(admin: SupabaseAdmin, catalogue: IslandCatalogue, island: Island) -> IslandView:
    coins = await islet_store.read_coins(admin, island.owner)
    built = await store.read_built_spots(admin, island.owner)
    progress = await store.read_progress(admin, island.owner)
    return view_of(catalogue, island, coins, built, progress)


def not_enough_coins(name: str, price: int) -> ApiError:
    return ApiError(409, "insufficient_funds", f"{name} costs {price} coins. You need more coins.")


def refusal_error(
    outcome: islet_store.BuildOutcome, catalogue: IslandCatalogue, kind: str
) -> ApiError:
    """The error for a build that islet_build() refused. Nothing was changed."""
    if outcome.reason == "player_not_set_up":
        return islet_store.player_not_set_up()
    if outcome.reason == "plot_occupied":
        return rules.spot_taken(catalogue, outcome.standing or kind)
    return SupabaseRejected()  # not_enough_timber cannot happen with a timber price of 0


def paid_refusal(refusal: Refusal, name: str) -> ApiError:
    """The error for a paid action that its database function refused. Nothing was changed."""
    reason = refusal.reason
    if reason == "player_not_set_up":
        return islet_store.player_not_set_up()
    if reason == "insufficient_funds":
        return not_enough_coins(name, refusal.price)
    if reason == "not_built":
        return ApiError(409, "not_built", "Build something on this spot first.")
    if reason == "max_level":
        return rules.max_level(name)
    if reason == "locked":
        return ApiError(409, "locked", "This is not unlocked yet. Win more waves first.")
    if reason == "crew_full":
        return ApiError(409, "crew_full", "You have every crew member of this kind you can hire.")
    if reason == "spot_taken":
        return ApiError(409, "spot_taken", "Something already stands on this spot.")
    if reason == "wrong_kind":
        return ApiError(422, "wrong_kind", "Something else stands on this spot.")
    return SupabaseRejected()


async def paid(admin: SupabaseAdmin, function: str, arguments: dict, name: str) -> Paid:
    outcome = await store.run_paid(admin, function, arguments)
    if isinstance(outcome, Refusal):
        raise paid_refusal(outcome, name)
    return outcome


async def build(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    player_id: str,
    spot_id: str,
    kind: str,
    action_uid: str,
) -> IslandView:
    """Build `kind` on `spot_id` for the player and answer with the island after the build.

    Errors (ApiErrors): 404 no_such_spot, 409 spot_taken, 422 wrong_kind, 409 locked,
    409 insufficient_funds, 404 player_not_set_up, 502 database_error, 503 database_unavailable
    (outcome unknown: call GET /api/island, then repeat with the SAME actionUid).
    """
    ref = f"{REF_PREFIX}{action_uid}"
    island = await store.open_island(admin, player_id, catalogue.starting_coins)
    if await islet_store.build_exists(admin, player_id, ref):
        return await look_open(admin, catalogue, island)

    built = await store.read_built_spots(admin, player_id)
    progress = await store.read_progress(admin, player_id)
    spot, price = rules.check_build(catalogue, spot_id, kind, built, progress.unlock_wave)
    validate_transaction(-price, "building_purchase", ref)
    arguments = islet_store.build_arguments(
        player_id, spot.id, kind, Cost(price, NO_TIMBER), NO_TIMBER, ref
    )
    name = rules.kind_of(catalogue, kind).name
    try:
        outcome = await islet_store.run_build(admin, arguments)
    except InsufficientFunds as error:
        raise not_enough_coins(f"A {name.lower()}", price) from error
    except AlreadyApplied:  # the same click was still running a moment ago: it is done now
        return await look_open(admin, catalogue, island)
    if not outcome.done:
        raise refusal_error(outcome, catalogue, kind)
    built[spot.id] = Built(kind, 1)
    return view_of(catalogue, island, outcome.balance, built, progress)


async def upgrade(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    player_id: str,
    spot_id: str,
    action_uid: str,
) -> IslandView:
    """One level up for the building on `spot_id`. 404 no_such_spot, 409 not_built, 409
    max_level, 409 locked, 409 insufficient_funds. A repeated actionUid charges nothing."""
    ref = f"{UPGRADE_PREFIX}{action_uid}"
    island = await store.open_island(admin, player_id, catalogue.starting_coins)
    if not await store.ledger_has(admin, player_id, "building_purchase", ref):
        built = await store.read_built_spots(admin, player_id)
        progress = await store.read_progress(admin, player_id)
        spot, kind, reachable = rules.check_upgrade(catalogue, spot_id, built, progress.unlock_wave)
        arguments = {
            "p_player_id": player_id,
            "p_plot": spot.id,
            "p_action_uid": action_uid,
            "p_prices": list(kind.prices),
            "p_unlocked_level": reachable,
        }
        await paid(admin, "island_upgrade", arguments, f"The next {kind.name.lower()} level")
    return await look_open(admin, catalogue, island)


async def hire(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    player_id: str,
    crew: str,
    action_uid: str,
) -> IslandView:
    """One crew member. 409 crew_full, 409 locked, 409 insufficient_funds."""
    ref = f"{CREW_PREFIX}{action_uid}"
    island = await store.open_island(admin, player_id, catalogue.starting_coins)
    if not await store.ledger_has(admin, player_id, "crew_hire", ref):
        progress = await store.read_progress(admin, player_id)
        member = rules.check_hire(catalogue, crew, progress.crew[crew], progress.unlock_wave)
        arguments = {
            "p_player_id": player_id,
            "p_crew": member.crew,
            "p_action_uid": action_uid,
            "p_price": member.coins,
            "p_max": member.max,
        }
        outcome = await store.run_paid(admin, "island_hire", arguments)
        if isinstance(outcome, Refusal):
            if outcome.reason == "crew_full":
                raise rules.crew_full(member)
            raise paid_refusal(outcome, f"A {member.name.lower()}")
    return await look_open(admin, catalogue, island)


async def captain(
    admin: SupabaseAdmin, catalogue: IslandCatalogue, player_id: str, action_uid: str
) -> IslandView:
    """One captain level up. 409 max_level, 409 locked, 409 insufficient_funds."""
    ref = f"{CAPTAIN_PREFIX}{action_uid}"
    island = await store.open_island(admin, player_id, catalogue.starting_coins)
    if not await store.ledger_has(admin, player_id, "captain_upgrade", ref):
        progress = await store.read_progress(admin, player_id)
        reachable = rules.check_captain(catalogue, progress.captain_level, progress.unlock_wave)
        arguments = {
            "p_player_id": player_id,
            "p_action_uid": action_uid,
            "p_prices": list(catalogue.captain.prices),
            "p_unlocked_level": reachable,
        }
        await paid(admin, "island_captain", arguments, "The next captain level")
    return await look_open(admin, catalogue, island)


async def find_by_code(admin: SupabaseAdmin, typed_code: str) -> Island:
    """The island of a typed code (with or without ISLE-, any case). 404 if none."""
    code = read_code(typed_code)
    island = await store.find_island(admin, code) if code is not None else None
    if island is None:
        raise no_such_island()
    return island


async def visit(admin: SupabaseAdmin, catalogue: IslandCatalogue, typed_code: str) -> VisitView:
    """Another player's island by its code. 404 if none."""
    island = await find_by_code(admin, typed_code)
    owner_name = await store.read_display_name(admin, island.owner)
    built = await store.read_built_spots(admin, island.owner)
    spots = rules.plan_spots(catalogue, built)
    return VisitView(shown(island.code), owner_name, island.wave_best, spots)


async def invite(admin: SupabaseAdmin, typed_code: str) -> InviteView:
    """The island a friend's invite code names, for POST /api/island/invite/join. 404 if none."""
    island = await find_by_code(admin, typed_code)
    owner_name = await store.read_display_name(admin, island.owner)
    return InviteView(shown(island.code), owner_name)


def get_island_catalogue(request: Request) -> IslandCatalogue:
    """FastAPI dependency: the catalogue that create_app() stored on the app."""
    catalogue = request.app.state.island
    if catalogue is None:
        raise ApiError(503, "island_unavailable", "Your island is not available right now.")
    return catalogue


# Write `catalogue: IslandCatalogueDep` in a route and FastAPI hands you the catalogue.
IslandCatalogueDep = Annotated[IslandCatalogue, Depends(get_island_catalogue)]
