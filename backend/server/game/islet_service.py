"""The home islet service: puts the rules and the database together for the routes.

routes/islet.py is thin. It checks who is asking, then calls one of the two functions here:
  * look()   the whole islet of a signed-in player: coins, timber and every spot
  * build()  one build of level 1 for a signed-in player

How a build is made, in one place:
  1. A look in the history: a click that was done already is answered "already applied",
     whatever else has changed since. Nothing else is asked.
  2. building.check_build says which spot this is and what it costs. The price comes from
     buildings.json, never from the request.
  3. The wallet rules check the coin movement (a purchase takes coins away), like every other coin
     change, before the database is asked.
  4. The database function islet_build does the rest in ONE step (see islet_store.py): it locks
     the wallet, refuses a repeat, checks the plot and the timber, charges the coins through
     apply_wallet_transaction, takes the timber and records the building. All or nothing.

Used by: routes/islet.py and app.py (which keeps the catalogue on the app).
"""

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request

from server.errors import ApiError
from server.game import islet_store as store
from server.game.building import IsletPlan, check_build, plan_islet
from server.game.building_catalogue import BuildingCatalogue, Cost, Spot
from server.game.islet_store import BuildOutcome
from server.supabase_admin import AlreadyApplied, InsufficientFunds, SupabaseAdmin, SupabaseRejected
from server.wallet import validate_transaction

# The ledger reference of a build is this text plus the actionUid that the browser made.
REF_PREFIX = "islet:"

# The reasons islet_build() can refuse with. A test keeps this list equal to the SQL file.
REFUSAL_REASONS = ("player_not_set_up", "plot_occupied", "not_enough_timber")


@dataclass(frozen=True)
class BuildReceipt:
    """What a finished build did."""

    spot: Spot
    level: int
    cost: Cost  # what was paid
    coins: int  # the wallet balance after the build
    timber: int  # the timber held after the build


async def look(admin: SupabaseAdmin, catalogue: BuildingCatalogue, player_id: str) -> IsletPlan:
    """The whole islet of a player. A player who has not built yet still holds the starter pack."""
    coins = await store.read_coins(admin, player_id)
    held = await store.read_timber(admin, player_id)
    standing = await store.read_buildings(admin, player_id)
    timber = catalogue.starter_timber if held is None else held
    return plan_islet(catalogue, standing, coins, timber)


def name_of_building(catalogue: BuildingCatalogue, building_type: str | None) -> str | None:
    """The name of a kind of building ("signal station"), or None if the file does not know it."""
    for spot in catalogue.spots:
        if spot.building_type == building_type:
            return spot.name.lower()
    return None


def refusal_error(
    outcome: BuildOutcome, spot: Spot, cost: Cost, catalogue: BuildingCatalogue
) -> ApiError:
    """The error for a build that a rule in the database refused. Nothing was changed."""
    if outcome.reason == "player_not_set_up":
        return store.player_not_set_up()
    if outcome.reason == "plot_occupied":
        standing = name_of_building(catalogue, outcome.standing)
        subject = "Something" if standing is None else f"A {standing}"
        return ApiError(409, "plot_occupied", f"{subject} already stands on {spot.plot_name}.")
    if outcome.reason == "not_enough_timber":
        need = f"The {spot.name.lower()} needs {cost.timber} timber."
        message = f"{need} You have {outcome.timber_held}."
        return ApiError(409, "not_enough_timber", message)
    return SupabaseRejected()  # a reason we do not know: the database and the server disagree


def not_enough_coins(spot: Spot, cost: Cost) -> ApiError:
    """The error for a build the player cannot pay. The wallet said no; nothing was changed."""
    message = f"The {spot.name.lower()} costs {cost.coins} coins. You do not have enough coins."
    return ApiError(409, "insufficient_funds", message)


async def build(
    admin: SupabaseAdmin,
    catalogue: BuildingCatalogue,
    player_id: str,
    plot: str,
    building_type: str,
    action_uid: str,
) -> BuildReceipt:
    """Build level 1 of a building for a player. Raises an ApiError if the rules do not allow it.

    Errors (all are ApiErrors, see errors.py):
      AlreadyApplied (409)       this actionUid was used before; nothing changed
      BuildRefused (404, 409, 422)   the rules of building.py said no
      InvalidTransaction (422)   the wallet rules refused the charge (a bug in the file)
      ApiError (409, 404)        islet_build() refused: plot_occupied, not_enough_timber,
                                 insufficient_funds or player_not_set_up
      SupabaseUnavailable (503)  the OUTCOME IS UNKNOWN; look at the islet before you retry
    """
    ref = f"{REF_PREFIX}{action_uid}"
    if await store.build_exists(admin, player_id, ref):
        raise AlreadyApplied()

    spot, cost = check_build(catalogue, plot, building_type)
    validate_transaction(-cost.coins, "building_purchase", ref)

    arguments = store.build_arguments(
        player_id, spot.plot, spot.building_type, cost, catalogue.starter_timber, ref
    )
    try:
        outcome = await store.run_build(admin, arguments)
    except InsufficientFunds as error:
        raise not_enough_coins(spot, cost) from error
    if not outcome.done:
        raise refusal_error(outcome, spot, cost, catalogue)
    return BuildReceipt(spot, outcome.level, cost, outcome.balance, outcome.timber)


def get_islet_catalogue(request: Request) -> BuildingCatalogue:
    """FastAPI dependency: the catalogue that create_app() stored on the app."""
    catalogue = request.app.state.islet_catalogue
    if catalogue is None:
        raise ApiError(503, "islet_unavailable", "Your home islet is not available right now.")
    return catalogue


# Write `catalogue: IsletCatalogueDep` in a route and FastAPI hands you the catalogue.
IsletCatalogueDep = Annotated[BuildingCatalogue, Depends(get_islet_catalogue)]
