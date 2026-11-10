"""The island service: puts the rules and the database together for routes/island.py.

    look()    the signed-in player's own island (made on first use, with the starting coins)
    build()   one building on one spot, paid in coins
    visit()   another player's island, found by its code

How a build is made, in one place:
  1. The island is opened (island_open), so a brand-new player holds the starting coins first.
  2. A click that was done already (the ledger ref island:<actionUid> is in islet_buildings) is
     answered with the island as it is now: a repeat is never charged twice.
  3. rules.check_build says whether the kind belongs on the spot and what it costs. The price
     comes from islands.json, never from the request.
  4. The wallet rules check the charge, then islet_build() (the home islet's atomic function)
     takes the coins and writes the building in ONE step, with a timber price of 0.

Used by: routes/island.py, waves.py and app.py (which keeps the catalogue on the app).
"""

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request

from server.errors import ApiError
from server.game import islet_store
from server.game.building_catalogue import Cost
from server.island import rules, store
from server.island.catalogue import IslandCatalogue, Spot
from server.island.codes import read_code, shown
from server.island.rules import SpotView
from server.island.store import Island
from server.supabase_admin import AlreadyApplied, InsufficientFunds, SupabaseAdmin, SupabaseRejected
from server.wallet import validate_transaction

# The ledger reference of a build is this text plus the actionUid the browser made.
REF_PREFIX = "island:"
# The island has no timber any more (BUILD-PLAN 3.2): coins only.
NO_TIMBER = 0


@dataclass(frozen=True)
class IslandView:
    """What GET /api/island and POST /api/island/build answer."""

    code: str  # as people see it: ISLE-K7Q2M
    coins: int
    wave_best: int
    flags: int
    spots: tuple[SpotView, ...]


@dataclass(frozen=True)
class VisitView:
    """What GET /api/island/visit/{code} answers."""

    code: str
    owner_name: str
    wave_best: int
    spots: tuple[SpotView, ...]


def no_such_island() -> ApiError:
    return ApiError(404, "no_such_island", "There is no island with that code.")


def view_of(
    catalogue: IslandCatalogue, island: Island, coins: int, built: dict[str, str]
) -> IslandView:
    spots = rules.plan_spots(catalogue, set(built))
    return IslandView(shown(island.code), coins, island.wave_best, island.flags, spots)


async def look(admin: SupabaseAdmin, catalogue: IslandCatalogue, player_id: str) -> IslandView:
    """The player's own island. The first look makes it (and pays the starting coins once)."""
    island = await store.open_island(admin, player_id, catalogue.starting_coins)
    coins = await islet_store.read_coins(admin, player_id)
    built = await store.read_built_spots(admin, player_id)
    return view_of(catalogue, island, coins, built)


def not_enough_coins(catalogue: IslandCatalogue, spot: Spot, price: int) -> ApiError:
    kind = rules.kind_named(catalogue, spot.kind)
    name = kind.name.lower() if kind else spot.kind
    return ApiError(
        409, "insufficient_funds", f"A {name} costs {price} coins. You need more coins."
    )


def refusal_error(
    outcome: islet_store.BuildOutcome, catalogue: IslandCatalogue, spot: Spot
) -> ApiError:
    """The error for a build that islet_build() refused. Nothing was changed."""
    if outcome.reason == "player_not_set_up":
        return islet_store.player_not_set_up()
    if outcome.reason == "plot_occupied":
        return rules.spot_taken(catalogue, spot)
    return SupabaseRejected()  # not_enough_timber cannot happen with a timber price of 0


async def build(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    player_id: str,
    spot_id: str,
    kind: str,
    action_uid: str,
) -> IslandView:
    """Build `kind` on `spot_id` for the player and answer with the island after the build.

    Errors (ApiErrors): 404 no_such_spot, 409 spot_taken, 422 wrong_kind, 409 insufficient_funds,
    404 player_not_set_up, 502 database_error, 503 database_unavailable (outcome unknown: call
    GET /api/island, then repeat with the SAME actionUid).
    """
    ref = f"{REF_PREFIX}{action_uid}"
    island = await store.open_island(admin, player_id, catalogue.starting_coins)
    if await islet_store.build_exists(admin, player_id, ref):
        return await look(admin, catalogue, player_id)

    built = await store.read_built_spots(admin, player_id)
    spot, price = rules.check_build(catalogue, spot_id, kind, set(built))
    validate_transaction(-price, "building_purchase", ref)
    arguments = islet_store.build_arguments(
        player_id, spot.id, spot.kind, Cost(price, NO_TIMBER), NO_TIMBER, ref
    )
    try:
        outcome = await islet_store.run_build(admin, arguments)
    except InsufficientFunds as error:
        raise not_enough_coins(catalogue, spot, price) from error
    except AlreadyApplied:  # the same click was still running a moment ago: it is done now
        return await look(admin, catalogue, player_id)
    if not outcome.done:
        raise refusal_error(outcome, catalogue, spot)
    built[spot.id] = spot.kind
    return view_of(catalogue, island, outcome.balance, built)


async def visit(admin: SupabaseAdmin, catalogue: IslandCatalogue, typed_code: str) -> VisitView:
    """Another player's island by its code (with or without ISLE-, any case). 404 if none."""
    code = read_code(typed_code)
    if code is None:
        raise no_such_island()
    island = await store.find_island(admin, code)
    if island is None:
        raise no_such_island()
    owner_name = await store.read_display_name(admin, island.owner)
    built = await store.read_built_spots(admin, island.owner)
    spots = rules.plan_spots(catalogue, set(built))
    return VisitView(shown(island.code), owner_name, island.wave_best, spots)


def get_island_catalogue(request: Request) -> IslandCatalogue:
    """FastAPI dependency: the catalogue that create_app() stored on the app."""
    catalogue = request.app.state.island
    if catalogue is None:
        raise ApiError(503, "island_unavailable", "Your island is not available right now.")
    return catalogue


# Write `catalogue: IslandCatalogueDep` in a route and FastAPI hands you the catalogue.
IslandCatalogueDep = Annotated[IslandCatalogue, Depends(get_island_catalogue)]
