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
                    "locked": {"wall:2": 2, "mortar:1": 3, "crew:gunner": 5, ...}},
        "skills": {"points": 1, "spent": 1, "known": ["steady_aim"],
                   "tree": [{"id": "steady_aim", "name": "Steady aim", "branch": "marksman",
                             "tier": 1, "cost": 1, "needs": null}, ...]},
        "weapons": {"owned": ["musket"], "equipped": "musket",
                    "shop": [{"id": "pistols", "name": "Pistols", "price": 60,
                              "unlockWave": 2}, ...]},
        "campaign": {"wave": 4, "open": ["wall:1", ..., "harbor", "market_calls"],
                     "locked": {"ring_walls": 5, "wreck": 6, "tech_hub": 8, ...},
                     "later": ["ship"],
                     "research": {"done": ["cannon"], "tiers": {"cannon": {"tier": 2,
                                  "tier2": "long_guns", "tier3": null}, ...},
                                  "tierWaves": [8, 15, 25], "branches": [{"branch": "cannon",
                                  "name": "Cannon skills", "price": 180, "prices": [180, 360, 630],
                                  "specs": [{"id": "rapid", "name": "Rapid"}, ...],
                                  "tier2": [{"id": "rapid_2", "name": "Rapid II"}, ...],
                                  "tier3": [{"id": "broadside", "name": "Broadside"}, ...]},
                                  ...]},
                     "wreck": {"paid": 125, "goal": 500, "gifts": [25, 100]}}}
    The first call makes the player's island with a new code and, for a brand-new player whose
    wallet never moved, pays the starting coins (once). The 22 spots come in the order of
    islands.json: wall_1..wall_6, cannon_1..cannon_7 (cannon or mortar), tower_1, house_1,
    house_2, then the inner ring wall_7..wall_12 (TOWER-DEFENSE section 12). "kind" is what
    stands there, or the first kind an empty spot takes; "cost" is the level-1 price of that
    kind; "upgradeCost" the price of the next level (null while empty or at the top). Price
    lists are indexed by level - 1 (the first entry is the build; the captain's level 1 is
    free). "unlocks.wave" is the best wave the player won (own island, or any Pirate
    Point wave they fought in); unlock ids are "<kind>:<level>", "crew:<crew>", "captain:<level>".
    "nextWave" is the wave the next bell on this island rings. "skills" (TOWER-DEFENSE section
    14): one skill point per two waves the player won anywhere (won_wave_best), minus the costs
    of "known" (tier n costs n). "weapons" (section 15): what the player owns (always the
    musket), carries, and what the shop sells after which won wave. "campaign" (GAME-V3 sections
    4 and 5): what is open on THIS island after its best won wave (building levels, the inner
    wall ring, the Harbor, the wreck, the Tech hub), what opens after which wave, the Tech hub's
    research and the wreck's repair. A spot with a tower skill carries "spec" (null for none).
    The building levels of "unlocks" follow the island's best won wave too; crew and captain
    levels follow the player's own unlock wave.
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
            (also the cabin), 409 locked ("Opens after wave
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

POST /api/island/research  {"branch": "cannon", "actionUid": "...", "tier"?: 1 | 2 | 3,
                            "choice"?: "long_guns", "change"?: true, "code"?: "ISLE-K7Q2M"}
    -> the island. The Tech hub (GAME-V3 sections 5 and 5.1): one research step for the whole
    island (yours, or with "code" the game you are a member of), paid with the caller's coins
    (ledger ref research:<actionUid>, reason tech_research). Tier 1 (no "choice") opens after
    wave 8; tiers 2 and 3 (after waves 15 and 25) need "choice", one of the tier's two options:
    once the crew chose one, the other is closed, and "change": true switches to it at the tier's
    price again (a tier-3 switch takes the old capstone off the towers that picked it).
    Errors: 400 bad_research, 403 not_member, 404 no_such_island, 409 locked, 409 known,
            409 closed, 409 needs_tier, 409 top_tier, 409 insufficient_funds

POST /api/island/tower-skill  {"spot": "cannon_1", "spec": "rapid", "code"?: "ISLE-K7Q2M"}
    -> the island. The tower on the spot picks one skill of its researched branch (no coins;
    picking another one changes it, for the next wave). Safe to repeat. A house of level 2 or
    more picks a role the same way: "spec" barracks, tavern or workshop, with no research
    (docs/GAME-V3.md "Houses"); the spot then carries it as "spec".
    Errors: 400 bad_spec, 403 not_member, 404 no_such_spot, 404 no_such_island, 409 not_built,
            409 not_researched, 409 house_level ("Raise this house to level 2 first."),
            422 wrong_kind

POST /api/island/wreck  {"amount": 25, "actionUid": "...", "code"?: "ISLE-K7Q2M"}
    -> the island. Coins into the island's wreck (GAME-V3 section 4, after wave 6; ledger ref
    wreck:<actionUid>, reason wreck_repair), never more than the repair still needs.
    Errors: 400 bad_gift, 403 not_member, 404 no_such_island, 409 locked, 409 repaired,
            409 insufficient_funds

GET /api/island/demolish?spot=cannon_1&code=ISLE-K7Q2M   (code optional: your own island)
    -> {"spot": "cannon_1", "kind": "cannon", "name": "Cannon", "level": 3,
        "refunds": [{"id": "...", "name": "Ana", "coins": 75, "you": false}, ...], "repeat": false}
    What tearing the building down would give back (GAME-V3 section 4.2), worked out by the
    database, for the confirmation card: each payer half of what they paid for it, rounded down,
    the biggest payer first; a level nobody has a payment row for counts as the host's. Changes
    nothing.
    Errors: 409 protected (the heart of the island, the bell, the Harbor, the Tech hub, the
            wreck), 404 no_such_spot, 404 no_such_island, 403 not_member, 409 not_built, 409
            wave_running

POST /api/island/demolish  {"spot": "cannon_1", "actionUid": "...", "code"?: "ISLE-K7Q2M"}
    -> the island (as GET /api/island, with your coins) plus "demolished": the quote's shape,
    the refunds as paid. Any member of the game, between waves only: the building comes down,
    every payer gets half of what they paid back (ledger ref demolish:<actionUid>, reason
    building_refund), the spot is empty again and its tower skill goes with it. A repeated
    actionUid pays nothing and answers the same refunds ("repeat": true).
    Errors: the quote's, and 409 busy (a payment arrived at the same moment: try again)

POST /api/island/captain  {"actionUid": "..."}
    -> the island. The captain one level up (ledger ref captain:<actionUid>). Always your own.
    Errors: 409 max_level, 409 locked, 409 insufficient_funds

POST /api/island/skill  {"skill": "steady_aim", "actionUid": "..."}
    -> the island. One skill of the captain's skill tree, paid with skill points (no coins).
    A repeated actionUid learns nothing (captain_skill_learns ref skill:<actionUid>).
    Errors: 400 bad_skill, 409 known, 409 locked ("Learn Steady aim first."),
            409 closed (the other skill of its fork was chosen), 409 wrong_role (a capstone
            of another role), 409 no_points ("Win new waves to earn skill points.")
POST /api/island/role  {"role": "medic"}
    -> the island. The captain's role (medic, engineer or gunner), once, from captain level 3.
    Errors: 400 bad_role, 409 locked, 409 role_known (respec first)
POST /api/island/respec  {"actionUid": "..."}
    -> the island. Forgets every skill and the role for 100 coins x captain level (wallet
    reason captain_respec, ref respec:<actionUid>). Errors: 409 nothing_to_reset,
    409 insufficient_funds

POST /api/island/weapon/buy  {"weapon": "pistols", "actionUid": "..."}
    -> the island. One weapon, bought once with coins and equipped at once (ledger ref
    weapon:<actionUid>, reason weapon_purchase).
    Errors: 400 bad_weapon, 409 owned, 409 locked ("Opens after wave N."),
            409 insufficient_funds

POST /api/island/weapon/equip  {"weapon": "musket"}
    -> the island. The captain carries this weapon from now on. Safe to repeat.
    Errors: 400 bad_weapon, 409 not_owned

    Build, upgrade, hire, captain, skill and the weapon routes share one budget of 30 a
    minute per player.

GET /api/island/visit/{code}
    -> {"code": "ISLE-K7Q2M", "ownerName": "Captain Gull", "waveBest": 3, "spots": [...],
        "crew": {"gunner": 1, "carpenter": 0, "lookout": 0}, "campaign": {...}}
    The spots in the shape of GET /api/island (kind, kinds, level, ...) and the owner's crew, so
    every visitor's wave simulation uses the same defenses as the owner's. An admitted guest
    (also one admitted through the friend invite) may read it.
    The code may be written with or without "ISLE-", in any case. Your own code works too.
    Only for members of that game (GAME-V3 section 2; join it first with POST /api/games/join
    or /api/island/invite/join); the owner always.
    Errors: 403 not_member, 404 no_such_island, 429 too_many_requests, and the errors of GET
    /api/island

POST /api/island/invite/join  {"code": "ISLE-K7Q2M", "actionUid": "..."}
    The friend invite (TOWER-DEFENSE section 6) is now an alias of POST /api/games/join (GAME-V3
    section 2): it lives in routes/games.py, admits a guest who presents a valid code, makes the
    caller a member of that game (at most 10 players, 409 game_full) and answers
    {"admitted": true, "game": {...}, "island": {"code", "ownerName"}}.

Used by: the island scene and the friends panel of the game client.
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Path, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from server.auth import Player, PlayerDep
from server.errors import ApiError
from server.flags import is_enabled
from server.island import rules, service
from server.island.catalogue import IslandCatalogue
from server.island.rules import ResearchTier, SpotView
from server.island.service import CampaignView, DemolishView, IslandCatalogueDep, IslandView
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
    spec: str | None = None


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


class SkillOut(BaseModel):
    id: str
    name: str
    branch: str
    tier: int
    cost: int
    needs: list[str]
    excludes: str | None
    role: str | None


class RoleOut(BaseModel):
    id: str
    name: str
    branch: str


class SkillsOut(BaseModel):
    points: int
    spent: int
    known: list[str]
    tree: list[SkillOut]
    role: str | None
    roleLevel: int
    roles: list[RoleOut]
    respecPrice: int


class WeaponOut(BaseModel):
    id: str
    name: str
    price: int
    unlockWave: int


class WeaponsOut(BaseModel):
    owned: list[str]
    equipped: str
    shop: list[WeaponOut]


class SpecOut(BaseModel):
    id: str
    name: str


class BranchOut(BaseModel):
    branch: str
    name: str
    price: int  # tier 1
    prices: list[int]  # tier 1, 2 and 3
    specs: list[SpecOut]
    tier2: list[SpecOut]
    tier3: list[SpecOut]


class TierOut(BaseModel):
    tier: int
    tier2: str | None
    tier3: str | None


class ResearchOut(BaseModel):
    done: list[str]
    tiers: dict[str, TierOut]  # every branch: tier 0 to 3 and the choices of tiers 2 and 3
    tierWaves: list[int]  # the won wave each tier needs
    branches: list[BranchOut]


class WreckOut(BaseModel):
    paid: int
    goal: int
    gifts: list[int]


class CampaignOut(BaseModel):
    wave: int
    open: list[str]
    locked: dict[str, int]
    later: list[str]
    research: ResearchOut
    wreck: WreckOut


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
    skills: SkillsOut
    weapons: WeaponsOut
    campaign: CampaignOut


class VisitResponse(BaseModel):
    code: str
    ownerName: str
    waveBest: int
    spots: list[SpotOut]
    crew: CrewOut
    campaign: CampaignOut


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


class SkillRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Any short text: an unknown skill is a 400 bad_skill (rules.py), not a 422.
    skill: str = Field(min_length=1, max_length=40)
    actionUid: str = Field(pattern=ACTION_UID_PATTERN)


class RoleRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Any short text: an unknown role is a 400 bad_role (rules.py), not a 422.
    role: str = Field(min_length=1, max_length=40)


class RespecRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    actionUid: str = Field(pattern=ACTION_UID_PATTERN)


class WeaponBuyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    weapon: str = Field(min_length=1, max_length=40)
    actionUid: str = Field(pattern=ACTION_UID_PATTERN)


class WeaponEquipRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    weapon: str = Field(min_length=1, max_length=40)


class ResearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Any short text: an unknown branch is a 400 bad_research (rules.py), not a 422.
    branch: str = Field(min_length=1, max_length=40)
    actionUid: str = Field(pattern=ACTION_UID_PATTERN)
    code: str | None = Field(default=None, max_length=CODE_MAX_LENGTH)
    # GAME-V3 section 5.1: the tier (above 3: 409 top_tier) and, for tiers 2 and 3, the option.
    tier: int = Field(default=1, ge=1, le=10)
    choice: str | None = Field(default=None, min_length=1, max_length=40)
    change: bool = False


class SpecialiseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    spot: str = Field(pattern=ID_PATTERN)
    spec: str = Field(min_length=1, max_length=40)
    code: str | None = Field(default=None, max_length=CODE_MAX_LENGTH)


class WreckRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    amount: int = Field(strict=True, ge=1, le=100000)
    actionUid: str = Field(pattern=ACTION_UID_PATTERN)
    code: str | None = Field(default=None, max_length=CODE_MAX_LENGTH)


class DemolishRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    spot: str = Field(pattern=ID_PATTERN)
    actionUid: str = Field(pattern=ACTION_UID_PATTERN)
    code: str | None = Field(default=None, max_length=CODE_MAX_LENGTH)


class RefundOut(BaseModel):
    id: str
    name: str
    coins: int
    you: bool


class DemolishOut(BaseModel):
    spot: str
    kind: str
    name: str
    level: int
    refunds: list[RefundOut]
    repeat: bool


class DemolishResponse(IslandResponse):
    demolished: DemolishOut


def demolish_out(view: DemolishView, player_id: str) -> DemolishOut:
    return DemolishOut(
        spot=view.spot,
        kind=view.kind,
        name=view.name,
        level=view.level,
        refunds=[
            RefundOut(
                id=item.player_id, name=item.name, coins=item.coins, you=item.player_id == player_id
            )
            for item in view.refunds
        ],
        repeat=view.repeat,
    )


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
            spec=spot.spec,
        )
        for spot in spots
    ]


def tier_out(tier: ResearchTier | None) -> TierOut:
    if tier is None:
        return TierOut(tier=0, tier2=None, tier3=None)
    return TierOut(
        tier=tier.tier,
        tier2=tier.choice_2 if tier.tier >= 2 else None,
        tier3=tier.choice_3 if tier.tier >= 3 else None,
    )


def campaign_out(view: CampaignView, catalogue: IslandCatalogue) -> CampaignOut:
    return CampaignOut(
        wave=view.wave,
        open=list(view.opened),
        locked=view.locked,
        later=list(view.later),
        research=ResearchOut(
            done=list(view.research),
            tiers={
                entry.branch: tier_out(view.tiers.get(entry.branch)) for entry in catalogue.research
            },
            tierWaves=[catalogue.campaign.wave_of(item) or 0 for item in rules.RESEARCH_TIER_ITEMS],
            branches=[
                BranchOut(
                    branch=entry.branch,
                    name=entry.name,
                    price=entry.coins,
                    prices=list(entry.prices),
                    specs=[SpecOut(id=spec, name=name) for spec, name in entry.specs],
                    tier2=[SpecOut(id=item, name=name) for item, name in entry.tier2],
                    tier3=[SpecOut(id=item, name=name) for item, name in entry.tier3],
                )
                for entry in catalogue.research
            ],
        ),
        wreck=WreckOut(
            paid=view.wreck_paid, goal=view.wreck_goal, gifts=list(catalogue.wreck.gifts)
        ),
    )


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
        skills=SkillsOut(
            points=view.skills.points,
            spent=view.skills.spent,
            known=list(view.skills.known),
            tree=[
                SkillOut(
                    id=skill.skill,
                    name=skill.name,
                    branch=skill.branch,
                    tier=skill.tier,
                    cost=skill.cost,
                    needs=list(skill.needs),
                    excludes=skill.excludes,
                    role=skill.role,
                )
                for skill in catalogue.skills.tree
            ],
            role=view.skills.role,
            roleLevel=view.skills.role_level,
            roles=[
                RoleOut(id=role.role, name=role.name, branch=role.branch)
                for role in catalogue.skills.roles
            ],
            respecPrice=view.skills.respec_price,
        ),
        weapons=WeaponsOut(
            owned=list(view.weapons.owned),
            equipped=view.weapons.equipped,
            shop=[
                WeaponOut(
                    id=weapon.weapon,
                    name=weapon.name,
                    price=weapon.coins,
                    unlockWave=weapon.unlock_wave,
                )
                for weapon in catalogue.weapons
            ],
        ),
        campaign=campaign_out(view.campaign, catalogue),
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


@router.post("/island/skill")
async def post_skill(
    body: SkillRequest,
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
) -> IslandResponse:
    request.app.state.island_build_budget.spend(player.id)
    view = await service.learn_skill(admin, catalogue, player.id, body.skill, body.actionUid)
    return island_out(view, catalogue)


@router.post("/island/role")
async def post_role(
    body: RoleRequest,
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
) -> IslandResponse:
    request.app.state.island_build_budget.spend(player.id)
    view = await service.pick_role(admin, catalogue, player.id, body.role)
    return island_out(view, catalogue)


@router.post("/island/respec")
async def post_respec(
    body: RespecRequest,
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
) -> IslandResponse:
    request.app.state.island_build_budget.spend(player.id)
    view = await service.respec(admin, catalogue, player.id, body.actionUid)
    return island_out(view, catalogue)


@router.post("/island/weapon/buy")
async def post_weapon_buy(
    body: WeaponBuyRequest,
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
) -> IslandResponse:
    request.app.state.island_build_budget.spend(player.id)
    view = await service.buy_weapon(admin, catalogue, player.id, body.weapon, body.actionUid)
    return island_out(view, catalogue)


@router.post("/island/weapon/equip")
async def post_weapon_equip(
    body: WeaponEquipRequest,
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
) -> IslandResponse:
    request.app.state.island_build_budget.spend(player.id)
    view = await service.equip_weapon(admin, catalogue, player.id, body.weapon)
    return island_out(view, catalogue)


@router.post("/island/research")
async def post_research(
    body: ResearchRequest,
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
) -> IslandResponse:
    request.app.state.island_build_budget.spend(player.id)
    view = await service.research(
        admin,
        catalogue,
        player.id,
        body.branch,
        body.actionUid,
        body.code,
        body.tier,
        body.choice,
        body.change,
    )
    return island_out(view, catalogue)


@router.post("/island/tower-skill")
async def post_specialise(
    body: SpecialiseRequest,
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
) -> IslandResponse:
    request.app.state.island_build_budget.spend(player.id)
    view = await service.specialise(admin, catalogue, player.id, body.spot, body.spec, body.code)
    return island_out(view, catalogue)


@router.post("/island/wreck")
async def post_wreck(
    body: WreckRequest,
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
) -> IslandResponse:
    request.app.state.island_build_budget.spend(player.id)
    view = await service.repair_wreck(
        admin, catalogue, player.id, body.amount, body.actionUid, body.code
    )
    return island_out(view, catalogue)


@router.get("/island/demolish")
async def get_demolish(
    spot: Annotated[str, Query(pattern=ID_PATTERN)],
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
    code: Annotated[str | None, Query(max_length=CODE_MAX_LENGTH)] = None,
) -> DemolishOut:
    request.app.state.island_build_budget.spend(player.id)
    view = await service.demolish_quote(admin, catalogue, player.id, spot, code)
    return demolish_out(view, player.id)


@router.post("/island/demolish")
async def post_demolish(
    body: DemolishRequest,
    player: IslandPlayerDep,
    catalogue: IslandCatalogueDep,
    admin: AdminDep,
    request: Request,
) -> DemolishResponse:
    request.app.state.island_build_budget.spend(player.id)
    island, done = await service.demolish(
        admin, catalogue, player.id, body.spot, body.actionUid, body.code
    )
    return DemolishResponse(
        **island_out(island, catalogue).model_dump(), demolished=demolish_out(done, player.id)
    )


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
    view = await service.visit(admin, catalogue, code, player.id)
    return VisitResponse(
        code=view.code,
        ownerName=view.owner_name,
        waveBest=view.wave_best,
        spots=spots_out(view.spots),
        crew=CrewOut(**view.crew),
        campaign=campaign_out(view.campaign, catalogue),
    )
