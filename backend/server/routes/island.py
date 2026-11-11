"""Island routes: your own island, building and upgrading on it, crew, your captain, visiting a
friend's island by its code, and the friend invite.

The contract is docs/TOWER-DEFENSE.md section 7 (on top of docs/BUILD-PLAN.md section 3.4). The
rules are in backend/server/island/, the prices in backend/content/islands.json, the database part
in supabase/migrations/20261110010000_islands_and_waves.sql and 20261111030000_tower_defense.sql.
Coins are play money only.

Every route needs a signed-in player (a GitHub or email player, or an admitted guest: auth.py lets
both through), then the feature flag "islands" (404 feature_off while it is off, before the body
is checked or the database is asked). The player id always comes from the verified login, never
from the body. Answers carry `Cache-Control: private, no-store`. The invite route moved to
routes/games.py (see below).

GET /api/island
    -> {"code": "ISLE-K7Q2M", "coins": 100, "waveBest": 0, "nextWave": 1, "flags": 0,
        "spots": [{"id": "wall_1", "kind": "wall", "kinds": ["wall"], "built": false,
                   "level": 0, "cost": 10, "upgradeCost": null}, ...],
        "crew": {"gunner": 0, "carpenter": 0, "lookout": 0},
        "captain": {"level": 1, "nextPrice": 20},
        "prices": {"kinds": {"wall": [10, 20, 40], ...}, "crew": {"gunner": {"price": 40,
                   "max": 2}, ...}, "captain": [0, 20, 40, 80, 160]},
        "unlocks": {"wave": 0, "unlocked": ["wall:1", "cannon:1", "captain:1"],
                    "locked": {"wall:2": 2, "mortar:1": 3, "crew:gunner": 5, ...}}}
    The first call makes the player's island with a new code and, for a brand-new player whose
    wallet never moved, pays the starting coins (100, once). The 16 spots come in the order of
    islands.json: wall_1..wall_6, cannon_1..cannon_7 (cannon or mortar), tower_1, house_1,
    house_2. "kind" is what stands there, or the first kind an empty spot takes; "cost" is the
    level-1 price of that kind; "upgradeCost" the price of the next level (null while empty or at
    the top). Price lists are indexed by level - 1 (the first entry is the build; the captain's
    level 1 is free). "unlocks.wave" is the best wave the player won (own island, or any Pirate
    Point wave they fought in); unlock ids are "<kind>:<level>", "crew:<crew>", "captain:<level>".
    "nextWave" is the wave the next bell on this island rings.
    Errors: 401, 403 demo_closed (a guest who was not admitted), 404 feature_off,
            404 player_not_set_up, 502 database_error, 503 island_unavailable, database_unavailable

POST /api/island/build  {"spot": "cannon_1", "kind": "cannon" | "mortar", "actionUid": "...",
                         "code"?: "ISLE-K7Q2M"}
    -> the island after the build, in the shape of GET /api/island
    Co-op (TOWER-DEFENSE section 6): with "code" the building goes up on that island (it
    belongs to the island) and the player pays with their own coins and their own unlocks. Only
    a member of that game may (GAME-V3 section 2: 403 not_member otherwise; join it first with
    POST /api/games/join). The
    answer is then that island (code, spots, waveBest, nextWave, flags) with the player's own
    coins, crew, captain and unlocks. Without "code", or with your own code: your own island.
    "actionUid" is made once per click (8 to 64 letters, digits, hyphens or underscores); the
    ledger ref is "island:<actionUid>", so a repeat never builds or charges twice and is answered
    with the island as it is now. Anything extra is a 422.
    Errors: 404 no_such_island (a code that names no island), 403 not_member, 404 no_such_spot,
            409 spot_taken
            (also the cabin), 409 locked ("Unlocks after wave
            N"), 409 insufficient_funds, 422 wrong_kind, 422 validation_error, 429
            too_many_requests, 503 database_unavailable (the OUTCOME IS UNKNOWN: read the
            island, then repeat with the SAME actionUid), and the errors of GET /api/island

POST /api/island/upgrade  {"spot": "cannon_1", "actionUid": "...", "code"?: "ISLE-K7Q2M"}
    -> the island. One level up (ledger ref upgrade:<actionUid>); the kind stays. "code" works
    as for a build (co-op on a friend's island).
    Errors: 404 no_such_island (a code that names no island), 404 no_such_spot, 409 not_built,
            409 max_level, 409 locked, 409 insufficient_funds

POST /api/island/hire  {"crew": "gunner" | "carpenter" | "lookout", "actionUid": "..."}
    -> the island. One crew member, kept (ledger ref crew:<actionUid>). Always your own island.
    Errors: 409 crew_full, 409 locked, 409 insufficient_funds

POST /api/island/captain  {"actionUid": "..."}
    -> the island. The captain one level up (ledger ref captain:<actionUid>). Always your own.
    Errors: 409 max_level, 409 locked, 409 insufficient_funds

    Build, upgrade, hire and captain share one budget of 30 a minute per player.

GET /api/island/visit/{code}
    -> {"code": "ISLE-K7Q2M", "ownerName": "Captain Gull", "waveBest": 3, "spots": [...],
        "crew": {"gunner": 1, "carpenter": 0, "lookout": 0}}
    The spots in the shape of GET /api/island (kind, kinds, level, ...) and the owner's crew, so
    every visitor's wave simulation uses the same defenses as the owner's. An admitted guest
    (also one admitted through the friend invite) may read it.
    The code may be written with or without "ISLE-", in any case. Your own code works too.
    Errors: 404 no_such_island, 429 too_many_requests, and the errors of GET /api/island

POST /api/island/invite/join  {"code": "ISLE-K7Q2M", "actionUid": "..."}
    The friend invite (TOWER-DEFENSE section 6) is now an alias of POST /api/games/join (GAME-V3
    section 2): it lives in routes/games.py, admits a guest who presents a valid code, makes the
    caller a member of that game (at most 10 players, 409 game_full) and answers
    {"admitted": true, "game": {...}, "island": {"code", "ownerName"}}.

Used by: the island scene and the friends panel of the game client.
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Path, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from server.auth import Player, PlayerDep
from server.errors import ApiError
from server.flags import is_enabled
from server.island import service
from server.island.catalogue import IslandCatalogue
from server.island.rules import SpotView
from server.island.service import IslandCatalogueDep, IslandView
from server.settings import SettingsDep
from server.supabase_admin import AdminDep

router = APIRouter()

NO_STORE = "private, no-store"
ACTION_UID_PATTERN = r"^[A-Za-z0-9_-]{8,64}$"
ID_PATTERN = r"^[a-z][a-z0-9_]{1,39}$"
# A typed code is short (codes.MAX_TYPED_LENGTH); a longer path is refused before any lookup.
CODE_MAX_LENGTH = 32


async def require_islands(player: PlayerDep, settings: SettingsDep, response: Response) -> Player:
    """Every island and wave route: the signed-in player (401/403), then the flag (404)."""
    if not is_enabled("islands", settings.flags):
        raise ApiError(404, "feature_off", "Islands are not open yet.")
    response.headers["Cache-Control"] = NO_STORE
    return player


# Write `player: IslandPlayerDep` in a route and FastAPI checks the login and the flag for you.
IslandPlayerDep = Annotated[Player, Depends(require_islands)]


class SpotOut(BaseModel):
    id: str
    kind: str
    kinds: list[str]
    built: bool
    level: int
    cost: int
    upgradeCost: int | None


class CrewOut(BaseModel):
    gunner: int
    carpenter: int
    lookout: int


class CaptainOut(BaseModel):
    level: int
    nextPrice: int | None


class CrewPriceOut(BaseModel):
    price: int
    max: int


class PricesOut(BaseModel):
    kinds: dict[str, list[int]]
    crew: dict[str, CrewPriceOut]
    captain: list[int]


class UnlocksOut(BaseModel):
    wave: int
    unlocked: list[str]
    locked: dict[str, int]


class IslandResponse(BaseModel):
    """camelCase on purpose: these are the JSON keys of BUILD-PLAN 3.4 and TOWER-DEFENSE 7."""

    code: str
    coins: int
    waveBest: int
    nextWave: int
    flags: int
    spots: list[SpotOut]
    crew: CrewOut
    captain: CaptainOut
    prices: PricesOut
    unlocks: UnlocksOut


class VisitResponse(BaseModel):
    code: str
    ownerName: str
    waveBest: int
    spots: list[SpotOut]
    crew: CrewOut


class BuildRequest(BaseModel):
    """What the browser sends to POST /api/island/build. Anything extra is refused."""

    model_config = ConfigDict(extra="forbid")

    spot: str = Field(pattern=ID_PATTERN)
    kind: str = Field(pattern=ID_PATTERN)
    actionUid: str = Field(pattern=ACTION_UID_PATTERN)
    # Co-op: build on the island with this code ("ISLE-K7Q2M"); missing means your own island.
    code: str | None = Field(default=None, max_length=CODE_MAX_LENGTH)


class UpgradeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    spot: str = Field(pattern=ID_PATTERN)
    actionUid: str = Field(pattern=ACTION_UID_PATTERN)
    code: str | None = Field(default=None, max_length=CODE_MAX_LENGTH)


class HireRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    crew: Literal["gunner", "carpenter", "lookout"]
    actionUid: str = Field(pattern=ACTION_UID_PATTERN)


class CaptainRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    actionUid: str = Field(pattern=ACTION_UID_PATTERN)


def spots_out(spots: tuple[SpotView, ...]) -> list[SpotOut]:
    return [
        SpotOut(
            id=spot.id,
            kind=spot.kind,
            kinds=list(spot.kinds),
            built=spot.built,
            level=spot.level,
            cost=spot.cost,
            upgradeCost=spot.upgrade_cost,
        )
        for spot in spots
    ]


def prices_out(catalogue: IslandCatalogue) -> PricesOut:
    return PricesOut(
        kinds={kind.kind: list(kind.prices) for kind in catalogue.kinds},
        crew={m.crew: CrewPriceOut(price=m.coins, max=m.max) for m in catalogue.crew},
        captain=list(catalogue.captain.prices),
    )


def island_out(view: IslandView, catalogue: IslandCatalogue) -> IslandResponse:
    return IslandResponse(
        code=view.code,
        coins=view.coins,
        waveBest=view.wave_best,
        nextWave=view.next_wave,
        flags=view.flags,
        spots=spots_out(view.spots),
        crew=CrewOut(**view.crew),
        captain=CaptainOut(level=view.captain_level, nextPrice=view.captain_next_price),
        prices=prices_out(catalogue),
        unlocks=UnlocksOut(
            wave=view.unlocks.wave,
            unlocked=list(view.unlocks.unlocked),
            locked=view.unlocks.locked,
        ),
    )


@router.get("/island")
async def get_island(
    player: IslandPlayerDep, catalogue: IslandCatalogueDep, admin: AdminDep
) -> IslandResponse:
    return island_out(await service.look(admin, catalogue, player.id), catalogue)


@router.post("/island/build")
async def post_build(
    body: BuildRequest,
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
) -> IslandResponse:
    request.app.state.island_build_budget.spend(player.id)
    view = await service.build(
        admin, catalogue, player.id, body.spot, body.kind, body.actionUid, body.code
    )
    return island_out(view, catalogue)


@router.post("/island/upgrade")
async def post_upgrade(
    body: UpgradeRequest,
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
) -> IslandResponse:
    request.app.state.island_build_budget.spend(player.id)
    view = await service.upgrade(admin, catalogue, player.id, body.spot, body.actionUid, body.code)
    return island_out(view, catalogue)


@router.post("/island/hire")
async def post_hire(
    body: HireRequest,
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
) -> IslandResponse:
    request.app.state.island_build_budget.spend(player.id)
    view = await service.hire(admin, catalogue, player.id, body.crew, body.actionUid)
    return island_out(view, catalogue)


@router.post("/island/captain")
async def post_captain(
    body: CaptainRequest,
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
) -> IslandResponse:
    request.app.state.island_build_budget.spend(player.id)
    view = await service.captain(admin, catalogue, player.id, body.actionUid)
    return island_out(view, catalogue)


@router.get("/island/visit/{code}")
async def get_visit(
    code: Annotated[str, Path(max_length=CODE_MAX_LENGTH)],
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
) -> VisitResponse:
    # A budget, because a visit looks a code up: guessing codes stays slow.
    request.app.state.island_visit_budget.spend(player.id)
    view = await service.visit(admin, catalogue, code)
    return VisitResponse(
        code=view.code,
        ownerName=view.owner_name,
        waveBest=view.wave_best,
        spots=spots_out(view.spots),
        crew=CrewOut(**view.crew),
    )
