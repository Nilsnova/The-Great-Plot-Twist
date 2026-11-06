"""Home islet routes: your own islet, saved to your account (package L2).

Every player has a home islet with five spots, and each spot holds one kind of building: the cabin
(there from the start, free), the workshop, the windmill, the greenhouse and the signal station.
For now a player can build the workshop and the signal station. A level 1 building costs 300 coins
and 10 timber, and every player starts with 20 timber once. The numbers are in
backend/content/buildings.json. Coins are play money only: they cannot be bought, cashed out or
exchanged for real prizes, and every answer says so. The rules are in backend/server/game/
(building.py), the database part is in supabase/migrations/20261106070000_home_islet.sql. The
routes only check who is asking.

Both routes are for signed-in players only. The player is the owner of the token in
    Authorization: Bearer <token>
and the id always comes from that verified login. It never comes from the address or the body, so
a player can only look at and change their own islet. There is no feature flag. Both answers carry
`Cache-Control: private, no-store`, because they hold personal data.

GET /api/islet
    -> {"coins": 1000, "timber": 20, "signalStationBuilt": false,
        "playMoneyNote": "Play money. No cash value. It cannot be bought or cashed out.",
        "spots": [{"plot", "plotName", "type", "name", "about",
                   "state": "built" | "empty" | "locked",
                   "level": number or null, "builtAt": "2026-11-16T10:00:00Z" or null,
                   "cost": {"coins": 300, "timber": 10} or null,
                   "missing": [] or ["coins"] or ["timber"] or ["coins", "timber"],
                   "canBuild": true or false, "lockedNote": text or null}, ...]}
    The spots come in the order of buildings.json, which is the order of the place registry: plot_1
    (cabin), plot_2 (workshop), plot_3 (windmill), plot_4 (greenhouse), islet_signal_station.
    "built": something stands there. The cabin always does (no level, no time, no cost). "empty":
    nothing stands there and it can be built; "cost" is what it costs and "missing" what the player
    is short of, in the order coins, timber. "locked": it cannot be built yet (the windmill and the
    greenhouse); "lockedNote" says why. The SERVER decides "canBuild"; the browser only shows it.
    A player who has not built yet has no islet row, and the answer shows the starter pack.
    Errors:
      401 unauthorized               no or bad sign-in
      404 player_not_set_up          the login is fine, but the player has no wallet row
      502 database_error             the database refused a read or answered strangely
      503 islet_unavailable          buildings.json could not be read when the server started
      503 database_not_configured, database_unavailable

POST /api/islet/build
    {"plot": "islet_signal_station", "type": "signal_station", "actionUid": "k3j9x2m4q8w1z7a0"}
    -> {"plot", "type", "name", "level": 1, "coinsPaid": 300, "timberPaid": 10,
        "coins": 700, "timber": 10}
    The SERVER takes every price from buildings.json; the browser sends only what the player wants.
    "type" confirms what the player means: a building on the wrong plot is a 422. "actionUid" is
    made once per click (8 to 64 letters, digits, hyphens or underscores) and sent again if the
    request is repeated: the ledger reference is "islet:<actionUid>", so a repeat can never build or
    charge twice. Anything extra in the body (a "coins" or a "playerId") is a 422.
    The checks come in this order, and the first that fails is the answer:
      1. the sign-in (401), the catalogue (503) and the shape of the request (422)
      2. a click that was done already (409 already_applied), whatever has changed since
      3. the rules: 404 no_such_plot, 404 no_such_building, 422 wrong_plot, 409 plot_occupied
         (the cabin), 409 not_buildable_yet
      4. the wallet rules for the charge (422 invalid_transaction; not possible with a checked file)
      5. the database function islet_build(): 404 player_not_set_up, 409 already_applied (the click
         was still running), 409 plot_occupied, 409 not_enough_timber, 409 insufficient_funds
    Every refusal changes nothing. Errors (standard shape, see errors.py):
      401 unauthorized            no or bad sign-in
      404 no_such_plot            not one of the five spots
      404 no_such_building        not a building in buildings.json
      404 player_not_set_up       the player has no wallet row
      409 already_applied         this actionUid was used before; nothing changed, treat as done
      409 plot_occupied           something already stands on that plot (always true for the cabin)
      409 not_buildable_yet       the windmill and the greenhouse, until timber has a second source
      409 not_enough_timber       the player holds less timber than the building needs
      409 insufficient_funds      not enough coins
      422 wrong_plot              that building belongs on another plot
      422 validation_error        the request does not fit (a missing or extra field, a bad pattern)
      502 database_error          the database refused the call: a bug, not something a player did
      503 islet_unavailable       buildings.json could not be read when the server started
      503 database_unavailable    the OUTCOME IS UNKNOWN: call GET /api/islet. If the building
                                  stands, it is done. Otherwise try again with the SAME actionUid.

Used by: the home islet panel in the game client (frontend/src/screens/islet/).
"""

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Response
from pydantic import BaseModel, ConfigDict, Field

from server.auth import PlayerDep
from server.game import islet_service
from server.game.building import SpotPlan
from server.game.building_catalogue import Cost
from server.game.islet_service import BuildReceipt, IsletCatalogueDep
from server.supabase_admin import AdminDep

router = APIRouter()

# Both answers hold personal data: tell the hosting network and proxies not to keep a copy.
NO_STORE = "private, no-store"

# The length limits of an actionUid. With "islet:" in front it must fit into a wallet ref (120).
ACTION_UID_MIN_LENGTH = 8
ACTION_UID_MAX_LENGTH = 64

# Plot and building ids are lowercase letters, digits and underscores (buildings.json).
ID_PATTERN = r"^[a-z0-9_]{2,40}$"


def whole_seconds(moment: datetime | None) -> datetime | None:
    """A time in UTC without microseconds, so the JSON reads 2026-11-16T10:00:00Z."""
    if moment is None:
        return None
    return moment.astimezone(UTC).replace(microsecond=0)


class CostOut(BaseModel):
    """What a building costs."""

    coins: int
    timber: int


class SpotOut(BaseModel):
    """One spot of the islet, with its state. camelCase on purpose: these are the JSON keys."""

    plot: str
    plotName: str
    type: str
    name: str
    about: str
    state: Literal["built", "empty", "locked"]
    level: int | None
    builtAt: datetime | None
    cost: CostOut | None
    missing: list[Literal["coins", "timber"]]
    canBuild: bool
    lockedNote: str | None


class IsletResponse(BaseModel):
    """What GET /api/islet returns: the signed-in player's own islet and nothing else."""

    coins: int
    timber: int
    signalStationBuilt: bool
    playMoneyNote: str
    spots: list[SpotOut]


class BuildRequest(BaseModel):
    """What the browser sends to POST /api/islet/build. Anything extra is refused."""

    model_config = ConfigDict(extra="forbid")

    plot: str = Field(pattern=ID_PATTERN)
    type: str = Field(pattern=ID_PATTERN)
    # Made by the browser once per click. With "islet:" in front it becomes the ledger ref.
    actionUid: str = Field(
        min_length=ACTION_UID_MIN_LENGTH,
        max_length=ACTION_UID_MAX_LENGTH,
        pattern=r"^[A-Za-z0-9_-]+$",
    )


class BuildResponse(BaseModel):
    """What POST /api/islet/build returns after a finished build."""

    plot: str
    type: str
    name: str
    level: int
    coinsPaid: int
    timberPaid: int
    coins: int  # the wallet balance after the build
    timber: int  # the timber held after the build


def cost_out(cost: Cost | None) -> CostOut | None:
    return None if cost is None else CostOut(coins=cost.coins, timber=cost.timber)


def spot_out(plan: SpotPlan) -> SpotOut:
    spot = plan.spot
    return SpotOut(
        plot=spot.plot,
        plotName=spot.plot_name,
        type=spot.building_type,
        name=spot.name,
        about=spot.about,
        state=plan.state,
        level=plan.level,
        builtAt=whole_seconds(plan.built_at),
        cost=cost_out(plan.cost),
        missing=list(plan.missing),
        canBuild=plan.can_build,
        # The note explains a locked spot. Once something stands there it has no meaning.
        lockedNote=spot.locked_note if plan.state == "locked" else None,
    )


def build_response(receipt: BuildReceipt) -> BuildResponse:
    return BuildResponse(
        plot=receipt.spot.plot,
        type=receipt.spot.building_type,
        name=receipt.spot.name,
        level=receipt.level,
        coinsPaid=receipt.cost.coins,
        timberPaid=receipt.cost.timber,
        coins=receipt.coins,
        timber=receipt.timber,
    )


@router.get("/islet")
async def get_islet(
    player: PlayerDep, catalogue: IsletCatalogueDep, admin: AdminDep, response: Response
) -> IsletResponse:
    response.headers["Cache-Control"] = NO_STORE
    plan = await islet_service.look(admin, catalogue, player.id)
    return IsletResponse(
        coins=plan.coins,
        timber=plan.timber,
        signalStationBuilt=plan.signal_station_built,
        playMoneyNote=catalogue.play_money_note,
        spots=[spot_out(spot_plan) for spot_plan in plan.spots],
    )


@router.post("/islet/build")
async def post_build(
    request: BuildRequest,
    player: PlayerDep,
    catalogue: IsletCatalogueDep,
    admin: AdminDep,
    response: Response,
) -> BuildResponse:
    response.headers["Cache-Control"] = NO_STORE
    receipt = await islet_service.build(
        admin, catalogue, player.id, request.plot, request.type, request.actionUid
    )
    return build_response(receipt)
