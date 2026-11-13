"""The island service: puts the rules and the database together for routes/island.py.

    look()     the signed-in player's own island (made on first use, with the starting coins)
    build()    one building on one spot, paid in coins (own island, or a friend's with `code`)
    upgrade()  one level up for a building (docs/TOWER-DEFENSE.md section 2), the same way
    hire()     one crew member (section 3)
    captain()  one captain level up (section 10)
    learn_skill()  one skill of the captain's skill tree, paid with skill points (section 14)
    pick_role(), respec()  the captain's role and the paid reset (GAME-V3, Captain tree and roles)
    buy_weapon(), equip_weapon()  the weapon shop (section 15)
    research()    the Tech hub: one research branch for the island, paid by any member (GAME-V3 5)
    specialise()  one tower picks a skill of its researched branch (GAME-V3 section 5), or a
                  house of level 2 a role (GAME-V3 "Houses")
    repair_wreck()  coins into the island's wreck (GAME-V3 section 4)
    demolish(), demolish_quote()  tear a building down between waves; each payer gets half of what
                  they paid back (GAME-V3 section 4.2)
    harbor_wave() the best wave of the games a player is in: the Harbor opens after wave 4
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

from dataclasses import dataclass, field
from typing import Annotated

from fastapi import Depends, Request

from server.errors import ApiError
from server.game import islet_store
from server.game.building_catalogue import Cost
from server.island import games, rules, store
from server.island.catalogue import IslandCatalogue
from server.island.codes import read_code, shown
from server.island.rules import Built, ResearchTier, SpotView
from server.island.store import Demolished, Island, Paid, Progress, Refusal
from server.supabase_admin import AlreadyApplied, InsufficientFunds, SupabaseAdmin, SupabaseRejected
from server.wallet import validate_transaction

# The ledger references: this text plus the actionUid the browser made.
REF_PREFIX = "island:"
UPGRADE_PREFIX = "upgrade:"
CREW_PREFIX = "crew:"
CAPTAIN_PREFIX = "captain:"
SKILL_PREFIX = "skill:"
RESPEC_PREFIX = "respec:"
WEAPON_PREFIX = "weapon:"
RESEARCH_PREFIX = "research:"
WRECK_PREFIX = "wreck:"
DEMOLISH_PREFIX = "demolish:"
# The island has no timber any more (BUILD-PLAN 3.2): coins only.
NO_TIMBER = 0


@dataclass(frozen=True)
class Unlocks:
    wave: int  # the best wave the player won (own island or Pirate Point)
    unlocked: tuple[str, ...]  # "wall:1", "crew:gunner", "captain:2", ...
    locked: dict[str, int]  # the rest, with the wave each one needs


@dataclass(frozen=True)
class CampaignView:
    """The campaign of the island on screen (docs/GAME-V3.md section 4)."""

    wave: int  # the island's best won wave: it decides what is open there
    opened: tuple[str, ...]
    locked: dict[str, int]  # id -> the wave it opens after
    later: tuple[str, ...]  # named in the table, not built yet (the ship)
    research: tuple[str, ...]  # the Tech hub's researched branches (tier 1 or more)
    wreck_paid: int  # coins paid into the wreck so far
    wreck_goal: int
    # branch -> its tier and the choices of tiers 2 and 3 (docs/GAME-V3.md section 5.1)
    tiers: dict[str, ResearchTier] = field(default_factory=dict)


@dataclass(frozen=True)
class SkillsView:
    """The skill tree of GET /api/island (section 14)."""

    points: int  # left to spend
    spent: int
    known: tuple[str, ...]  # in the order learnt
    role: str | None = None  # medic, engineer or gunner (captain tree)
    role_level: int = 3  # the captain level that opens the role choice
    respec_price: int = 0  # the coins a respec costs now (coinsPerLevel x captain level)


@dataclass(frozen=True)
class WeaponsView:
    """The weapon shop of GET /api/island (section 15)."""

    owned: tuple[str, ...]  # in the order of the shop, always with the musket
    equipped: str


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
    skills: SkillsView
    weapons: WeaponsView
    campaign: CampaignView


@dataclass(frozen=True)
class VisitView:
    """What GET /api/island/visit/{code} answers."""

    code: str
    owner_name: str
    wave_best: int
    spots: tuple[SpotView, ...]
    crew: dict[str, int]  # the owner's crew: every visitor simulates the same defenses
    campaign: CampaignView


@dataclass(frozen=True)
class InviteView:
    code: str
    owner_name: str


def no_such_island() -> ApiError:
    return ApiError(404, "no_such_island", "There is no island with that code.")


def unlocks_of(catalogue: IslandCatalogue, wave: int, island_wave: int | None = None) -> Unlocks:
    """The unlocks of GET /api/island. `wave` is the player's own unlock wave (crew and captain);
    the building levels follow `island_wave`, the best wave won on the island on screen
    (docs/GAME-V3.md section 4). Without it both follow `wave`."""
    island = wave if island_wave is None else island_wave
    table = rules.unlock_table(catalogue)
    personal = lambda item: item.startswith(("crew:", "captain:"))  # noqa: E731
    reached = {item: (wave if personal(item) else island) >= needed for item, needed in table}
    unlocked = tuple(item for item, _ in table if reached[item])
    locked = {item: needed for item, needed in table if not reached[item]}
    return Unlocks(wave, unlocked, locked)


def campaign_of(
    catalogue: IslandCatalogue,
    wave: int,
    research: dict[str, ResearchTier] | tuple[str, ...] = (),
    wreck_paid: int = 0,
) -> CampaignView:
    opened, locked, later = rules.campaign_table(catalogue, wave)
    tiers = (
        dict(research)
        if isinstance(research, dict)
        else {branch: ResearchTier() for branch in research}
    )
    return CampaignView(
        wave,
        tuple(opened),
        locked,
        tuple(later),
        tuple(tiers),
        min(wreck_paid, catalogue.wreck.goal),
        catalogue.wreck.goal,
        tiers,
    )


def view_of(
    catalogue: IslandCatalogue,
    island: Island,
    coins: int,
    built: dict[str, Built],
    progress: Progress,
    personal: Progress | None = None,
    research: dict[str, ResearchTier] | tuple[str, ...] = (),
) -> IslandView:
    """The island of `progress` (its spots, best and next wave, campaign) with the personal part
    (coins, crew, captain, unlocks) of `personal`: the same player on their own island, the
    visitor after a co-op build or upgrade on a friend's island."""
    mine = progress if personal is None else personal
    return IslandView(
        code=shown(island.code),
        coins=coins,
        wave_best=progress.wave_best,
        flags=island.flags,
        next_wave=rules.next_wave(catalogue, progress.wave_best, progress.next_wave),
        spots=rules.plan_spots(catalogue, built, role=mine.role),
        crew=mine.crew,
        captain_level=mine.captain_level,
        captain_next_price=rules.captain_next_price(catalogue, mine.captain_level),
        unlocks=unlocks_of(catalogue, mine.unlock_wave, progress.wave_best),
        skills=skills_of(catalogue, mine),
        weapons=weapons_of(catalogue, mine),
        campaign=campaign_of(catalogue, progress.wave_best, research, progress.wreck_paid),
    )


def skills_of(catalogue: IslandCatalogue, progress: Progress) -> SkillsView:
    points, spent = rules.skill_points(catalogue, progress.won_wave_best, progress.skills)
    return SkillsView(
        points,
        spent,
        progress.skills,
        progress.role,
        catalogue.skills.role_level,
        rules.respec_price(catalogue, progress.captain_level),
    )


def weapons_of(catalogue: IslandCatalogue, progress: Progress) -> WeaponsView:
    owned = tuple(
        weapon.weapon
        for weapon in catalogue.weapons
        if weapon.coins == 0 or weapon.weapon in progress.weapons_owned
    )
    equipped = progress.weapon_equipped if progress.weapon_equipped in owned else owned[0]
    return WeaponsView(owned, equipped)


async def look(admin: SupabaseAdmin, catalogue: IslandCatalogue, player_id: str) -> IslandView:
    """The player's own island. The first look makes it (and pays the starting coins once)."""
    island = await store.open_island(admin, player_id, catalogue.starting_coins)
    return await look_open(admin, catalogue, island)


async def look_open(
    admin: SupabaseAdmin, catalogue: IslandCatalogue, island: Island, payer: str | None = None
) -> IslandView:
    """`island` as it is now. With `payer` (a visitor): their coins, crew, captain and unlocks."""
    who = island.owner if payer is None else payer
    coins = await islet_store.read_coins(admin, who)
    built = await store.read_built_spots(admin, island.owner)
    progress = await store.read_progress(admin, island.owner)
    personal = None if payer is None else await store.read_progress(admin, payer)
    research = await store.read_research(admin, island.owner)
    return view_of(catalogue, island, coins, built, progress, personal, research)


async def target_island(
    admin: SupabaseAdmin, catalogue: IslandCatalogue, player_id: str, code: str | None
) -> tuple[Island, str | None]:
    """The island a build or upgrade is for, and the visiting payer (None on your own island).
    The payer's own island is opened first, so a brand-new visitor holds their starting coins.
    On somebody else's island the payer must be a member of that game (403 not_member)."""
    own = await store.open_island(admin, player_id, catalogue.starting_coins)
    if code is None:
        return own, None
    island = await find_by_code(admin, code)
    if island.owner == player_id:
        return own, None
    # GAME-V3 section 2: only a member of the game builds or upgrades on its island.
    await games.require_member(admin, island, player_id)
    return island, player_id


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
    code: str | None = None,
) -> IslandView:
    """Build `kind` on `spot_id` and answer with the island after the build. Without `code` on
    the player's own island; with `code` on that island (co-op: the player pays, the building
    belongs to the island, the player's own unlocks count).

    Errors (ApiErrors): 404 no_such_spot, 404 no_such_island, 403 not_member (a code of a game
    the player is not in), 409 spot_taken, 422 wrong_kind,
    409 locked, 409 insufficient_funds, 404 player_not_set_up, 502 database_error, 503
    database_unavailable (outcome unknown: read the island, then repeat with the SAME actionUid).
    """
    ref = f"{REF_PREFIX}{action_uid}"
    island, payer = await target_island(admin, catalogue, player_id, code)
    if payer is not None:
        return await build_with_friend(admin, catalogue, island, payer, spot_id, kind, action_uid)
    if await islet_store.build_exists(admin, player_id, ref):
        return await look_open(admin, catalogue, island)

    built = await store.read_built_spots(admin, player_id)
    progress = await store.read_progress(admin, player_id)
    # GAME-V3 section 4: the island's own best won wave decides what may be built on it.
    spot, price = rules.check_build(catalogue, spot_id, kind, built, progress.wave_best)
    price = rules.engineer_price(catalogue, price, progress.role)  # an engineer pays less
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
    research = await store.read_research(admin, island.owner)
    return view_of(catalogue, island, outcome.balance, built, progress, None, research)


async def build_with_friend(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    island: Island,
    payer: str,
    spot_id: str,
    kind: str,
    action_uid: str,
) -> IslandView:
    """The co-op build on a friend's island through island_build(). Same refusals; the friend's
    island's best won wave decides what is open there (GAME-V3 section 4)."""
    if not await store.ledger_has(admin, payer, "building_purchase", REF_PREFIX + action_uid):
        built = await store.read_built_spots(admin, island.owner)
        progress = await store.read_progress(admin, island.owner)
        spot, price = rules.check_build(catalogue, spot_id, kind, built, progress.wave_best)
        price = rules.engineer_price(
            catalogue, price, (await store.read_progress(admin, payer)).role
        )
        arguments = {
            "p_player_id": payer,
            "p_island_owner": island.owner,
            "p_plot": spot.id,
            "p_building_type": kind,
            "p_action_uid": action_uid,
            "p_price": price,
        }
        await paid(
            admin, "island_build", arguments, f"A {rules.kind_of(catalogue, kind).name.lower()}"
        )
    return await look_open(admin, catalogue, island, payer)


async def upgrade(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    player_id: str,
    spot_id: str,
    action_uid: str,
    code: str | None = None,
) -> IslandView:
    """One level up for the building on `spot_id`, on the player's own island or (with `code`)
    on a friend's island, paid by the player; the island's best won wave decides the levels that
    are open (GAME-V3 section 4). 404 no_such_spot, 404 no_such_island, 403 not_member, 409
    not_built, 409 max_level, 409 locked, 409 insufficient_funds. A repeated actionUid charges
    nothing."""
    ref = f"{UPGRADE_PREFIX}{action_uid}"
    island, payer = await target_island(admin, catalogue, player_id, code)
    if not await store.ledger_has(admin, player_id, "building_purchase", ref):
        built = await store.read_built_spots(admin, island.owner)
        progress = await store.read_progress(admin, island.owner)
        spot, kind, reachable = rules.check_upgrade(catalogue, spot_id, built, progress.wave_best)
        role = (
            progress.role
            if island.owner == player_id
            else (await store.read_progress(admin, player_id)).role
        )
        arguments = {
            "p_player_id": player_id,
            "p_island_owner": island.owner,
            "p_plot": spot.id,
            "p_action_uid": action_uid,
            "p_prices": [rules.engineer_price(catalogue, price, role) for price in kind.prices],
            "p_unlocked_level": reachable,
        }
        await paid(admin, "island_upgrade", arguments, f"The next {kind.name.lower()} level")
    return await look_open(admin, catalogue, island, payer)


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


async def learn_skill(
    admin: SupabaseAdmin, catalogue: IslandCatalogue, player_id: str, skill: str, action_uid: str
) -> IslandView:
    """One skill (section 14), paid with skill points: one per two won waves (won_wave_best),
    minus the points spent. 400 bad_skill, 409 known, 409 closed (the fork twin was chosen), 409
    locked ("Learn X first"), 409 wrong_role (a capstone of another role), 409 no_points.
    A repeated actionUid learns nothing and answers the island as it is now."""
    island = await store.open_island(admin, player_id, catalogue.starting_coins)
    entry = rules.skill_named(catalogue, skill)
    if await store.skill_learnt(admin, player_id, f"{SKILL_PREFIX}{action_uid}"):
        return await look_open(admin, catalogue, island)
    progress = await store.read_progress(admin, player_id)
    rules.check_skill(
        catalogue, entry.skill, progress.skills, progress.won_wave_best, progress.role
    )
    arguments = {
        "p_player_id": player_id,
        "p_skill": entry.skill,
        "p_action_uid": action_uid,
        "p_tree": [
            {
                "skill": item.skill,
                "needs": list(item.needs),
                "excludes": item.excludes,
                "role": item.role,
                "cost": item.cost,
            }
            for item in catalogue.skills.tree
        ],
        "p_waves_per_point": catalogue.skills.waves_per_point,
    }
    outcome = await store.learn_skill(admin, arguments)
    if isinstance(outcome, Refusal):
        raise skill_refusal(catalogue, outcome, entry.skill, progress)
    return await look_open(admin, catalogue, island)


def skill_refusal(
    catalogue: IslandCatalogue, refusal: Refusal, skill: str, progress: Progress
) -> ApiError:
    """The error for a skill that island_learn_skill() refused (another click won the race)."""
    entry = rules.skill_named(catalogue, skill)
    if refusal.reason == "known":
        return ApiError(409, "known", f"You know {entry.name} already.")
    if refusal.reason == "closed" and entry.excludes is not None:
        return rules.skill_closed(catalogue, entry)
    if refusal.reason == "locked" and entry.needs:
        return rules.skill_locked(catalogue, entry.needs)
    if refusal.reason == "wrong_role" and entry.role is not None:
        return rules.skill_wrong_role(catalogue, entry, progress.role)
    if refusal.reason == "no_points":
        return rules.no_points()
    if refusal.reason == "bad_skill":
        return ApiError(400, "bad_skill", "There is no such skill.")
    return SupabaseRejected()


async def pick_role(
    admin: SupabaseAdmin, catalogue: IslandCatalogue, player_id: str, role: str
) -> IslandView:
    """The role choice (medic, engineer or gunner) at the captain level the file names. 400
    bad_role, 409 locked, 409 role_known (respec first). The same role again changes nothing."""
    island = await store.open_island(admin, player_id, catalogue.starting_coins)
    entry = rules.role_named(catalogue, role)
    progress = await store.read_progress(admin, player_id)
    if progress.role != entry.role:
        rules.check_role(catalogue, entry.role, progress.captain_level, progress.role)
        arguments = {
            "p_player_id": player_id,
            "p_role": entry.role,
            "p_min_level": catalogue.skills.role_level,
        }
        outcome = await store.pick_role(admin, arguments)
        if isinstance(outcome, Refusal):
            if outcome.reason == "role_known":
                raise ApiError(409, "role_known", "You have a role already. Respec to change it.")
            if outcome.reason == "locked":
                level = catalogue.skills.role_level
                raise ApiError(409, "locked", f"Reach captain level {level} first.")
            raise SupabaseRejected()
    return await look_open(admin, catalogue, island)


async def respec(
    admin: SupabaseAdmin, catalogue: IslandCatalogue, player_id: str, action_uid: str
) -> IslandView:
    """Forget every skill and the role, paid in coins (coinsPerLevel x captain level, wallet
    reason captain_respec, ref respec:<actionUid>). 409 nothing_to_reset, 409 wave_running (no
    respec while a wave runs on your island), 409 insufficient_funds. The database works out the
    price under the island lock (per level x the captain level it finds there), so an upgrade at
    the same moment cannot change what is charged against what is shown. A repeated actionUid
    charges nothing."""
    ref = f"{RESPEC_PREFIX}{action_uid}"
    island = await store.open_island(admin, player_id, catalogue.starting_coins)
    if not await store.ledger_has(admin, player_id, "captain_respec", ref):
        progress = await store.read_progress(admin, player_id)
        if not progress.skills and progress.role is None:
            raise ApiError(409, "nothing_to_reset", "You have no skills or role to reset.")
        per_level = catalogue.skills.respec_per_level
        validate_transaction(-per_level, "captain_respec", ref)
        arguments = {"p_player_id": player_id, "p_action_uid": action_uid, "p_per_level": per_level}
        outcome = await store.run_paid(admin, "island_respec", arguments)
        if isinstance(outcome, Refusal):
            if outcome.reason == "nothing_to_reset":
                raise ApiError(409, "nothing_to_reset", "You have no skills or role to reset.")
            if outcome.reason == "wave_running":
                raise wave_running_between_waves()
            raise paid_refusal(outcome, "A respec")
    return await look_open(admin, catalogue, island)


async def buy_weapon(
    admin: SupabaseAdmin, catalogue: IslandCatalogue, player_id: str, weapon: str, action_uid: str
) -> IslandView:
    """One weapon from the shop (section 15), bought once with coins and equipped at once (ledger
    ref weapon:<actionUid>, reason weapon_purchase). 400 bad_weapon, 409 owned, 409 locked, 409
    insufficient_funds. A repeated actionUid charges nothing."""
    ref = f"{WEAPON_PREFIX}{action_uid}"
    island = await store.open_island(admin, player_id, catalogue.starting_coins)
    if not await store.ledger_has(admin, player_id, "weapon_purchase", ref):
        progress = await store.read_progress(admin, player_id)
        entry = rules.check_weapon_buy(
            catalogue, weapon, progress.weapons_owned, progress.unlock_wave
        )
        arguments = {
            "p_player_id": player_id,
            "p_weapon": entry.weapon,
            "p_action_uid": action_uid,
            "p_price": entry.coins,
            "p_unlock_wave": entry.unlock_wave,
        }
        outcome = await store.run_paid(admin, "island_weapon_buy", arguments)
        if isinstance(outcome, Refusal):
            if outcome.reason == "owned":
                raise rules.weapon_owned(entry)
            raise paid_refusal(outcome, f"The {entry.name.lower()}")
    return await look_open(admin, catalogue, island)


async def equip_weapon(
    admin: SupabaseAdmin, catalogue: IslandCatalogue, player_id: str, weapon: str
) -> IslandView:
    """Carry a weapon you own (section 15). 400 bad_weapon, 409 not_owned. Safe to repeat."""
    island = await store.open_island(admin, player_id, catalogue.starting_coins)
    progress = await store.read_progress(admin, player_id)
    entry = rules.check_weapon_equip(catalogue, weapon, weapons_of(catalogue, progress).owned)
    outcome = await store.equip_weapon(admin, player_id, entry.weapon)
    if isinstance(outcome, Refusal):
        if outcome.reason == "not_owned":
            raise rules.weapon_not_owned(entry)
        raise paid_refusal(outcome, entry.name)
    return await look_open(admin, catalogue, island)


# --- the Tech hub, tower skills and the wreck (docs/GAME-V3.md sections 4 and 5) ---


def campaign_refusal(
    refusal: Refusal, catalogue: IslandCatalogue, item: str, name: str
) -> ApiError:
    """The error for a research, a tower skill or a wreck gift that its function refused."""
    reason = refusal.reason
    if reason == "not_member":
        return games.not_member()
    if reason == "locked":
        return rules.locked(catalogue.campaign.wave_of(item) or 0)
    if reason == "known":
        return ApiError(409, "known", f"{name} are researched on this island already.")
    if reason == "not_researched":
        return ApiError(409, "not_researched", f"Research {name.lower()} at the Tech hub first.")
    if reason == "repaired":
        return rules.wreck_repaired()
    return paid_refusal(refusal, name)


async def research(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    player_id: str,
    branch: str,
    action_uid: str,
    code: str | None = None,
    tier: int = 1,
    choice: str | None = None,
    change: bool = False,
) -> IslandView:
    """One research step at the Tech hub of the island (your own, or with `code` the game you are
    in), paid by the player with coins (ledger ref research:<actionUid>, reason tech_research):
    tier 1 of a branch (every tower of that kind may then pick one of its skills), or one of the
    two options of tier 2 or 3 (docs/GAME-V3.md section 5.1); `change` switches from the option
    chosen before, at the tier's price again. 400 bad_research, 404 no_such_island, 403 not_member,
    409 locked (tier 1 after wave 8, 2 after 15, 3 after 25), 409 top_tier, 409 needs_tier,
    409 known, 409 closed, 409 wave_running (between waves only), 409 insufficient_funds. A
    repeated actionUid charges nothing."""
    entry = rules.research_named(catalogue, branch)
    island, payer = await target_island(admin, catalogue, player_id, code)
    ref = f"{RESEARCH_PREFIX}{action_uid}"
    if not await store.ledger_has(admin, player_id, "tech_research", ref):
        progress = await store.read_progress(admin, island.owner)
        done = await store.read_research(admin, island.owner)
        entry, price = rules.check_research(
            catalogue, entry.branch, done, progress.wave_best, tier, choice, change
        )
        arguments = {
            "p_player_id": player_id,
            "p_island_owner": island.owner,
            "p_branch": entry.branch,
            "p_action_uid": action_uid,
            "p_price": price,
            "p_unlock_wave": catalogue.campaign.wave_of(rules.RESEARCH_TIER_ITEMS[tier - 1]) or 0,
            "p_tier": tier,
            "p_choice": choice,
            "p_change": change,
        }
        outcome = await store.run_paid(admin, "island_research", arguments)
        if isinstance(outcome, Refusal):
            raise research_refusal(outcome, catalogue, entry, tier, choice)
    return await look_open(admin, catalogue, island, payer)


def research_refusal(
    refusal: Refusal, catalogue: IslandCatalogue, entry, tier: int, choice: str | None
) -> ApiError:
    """The error for a research step that island_research() refused (it checks again under lock)."""
    if refusal.reason == "wave_running":
        return wave_running_between_waves()
    if refusal.reason == "known" and tier > 1 and choice is not None:
        return rules.option_known(entry, choice)
    if refusal.reason == "closed":
        return ApiError(
            409, "closed", "Closed: your crew chose the other option. Change it to switch."
        )
    if refusal.reason == "needs_tier":
        return rules.needs_tier(entry, tier)
    if refusal.reason == "top_tier":
        return ApiError(409, "top_tier", f"{entry.name} have {rules.RESEARCH_TOP_TIER} tiers.")
    return campaign_refusal(refusal, catalogue, rules.RESEARCH_TIER_ITEMS[tier - 1], entry.name)


async def specialise(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    player_id: str,
    spot_id: str,
    spec: str,
    code: str | None = None,
) -> IslandView:
    """A tower on the island picks one skill of its researched branch (no coins; picking again
    changes it, for the next wave). A house of level 2 or more picks a role (barracks, tavern,
    workshop) the same way, with no research (docs/GAME-V3.md "Houses"). 400 bad_spec, 404
    no_such_spot, 404 no_such_island, 403 not_member, 409 not_built, 422 wrong_kind, 409
    not_researched, 409 house_level. Safe to repeat."""
    island, payer = await target_island(admin, catalogue, player_id, code)
    built = await store.read_built_spots(admin, island.owner)
    done = await store.read_research(admin, island.owner)
    spot, branch = rules.check_specialise(catalogue, spot_id, spec, built, done)
    arguments = {
        "p_player_id": player_id,
        "p_island_owner": island.owner,
        "p_plot": spot.id,
        "p_branch": branch,
        "p_spec": spec,
    }
    reply = await admin.call_function("island_specialise", arguments)
    refusal = store.refusal_or_none(reply)
    if refusal is not None:
        if refusal.reason == "not_built":
            raise ApiError(409, "not_built", "Build something on this spot first.")
        if refusal.reason == "wrong_kind":
            raise rules.BuildRefused(422, "wrong_kind", "Something else stands on this spot.")
        if refusal.reason == "house_level":
            raise rules.house_level()
        if branch == "house":
            raise campaign_refusal(refusal, catalogue, "tech_hub", "House roles")
        if refusal.reason == "not_researched" and spec in rules.RESEARCH_CAPSTONES[branch]:
            raise rules.capstone_not_chosen(rules.research_named(catalogue, branch), spec)
        name = rules.research_named(catalogue, branch).name
        raise campaign_refusal(refusal, catalogue, "tech_hub", name)
    return await look_open(admin, catalogue, island, payer)


async def repair_wreck(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    player_id: str,
    amount: int,
    action_uid: str,
    code: str | None = None,
) -> IslandView:
    """Coins into the wreck of the island (your own, or the game of `code`): ledger ref
    wreck:<actionUid>, reason wreck_repair. Never more than the repair still needs. 400 bad_gift,
    404 no_such_island, 403 not_member, 409 locked (after wave 6), 409 repaired, 409
    insufficient_funds. A repeated actionUid charges nothing."""
    island, payer = await target_island(admin, catalogue, player_id, code)
    ref = f"{WRECK_PREFIX}{action_uid}"
    if not await store.ledger_has(admin, player_id, "wreck_repair", ref):
        progress = await store.read_progress(admin, island.owner)
        rules.check_wreck_gift(catalogue, amount, progress.wreck_paid, progress.wave_best)
        arguments = {
            "p_player_id": player_id,
            "p_island_owner": island.owner,
            "p_amount": amount,
            "p_action_uid": action_uid,
            "p_goal": catalogue.wreck.goal,
            "p_unlock_wave": catalogue.campaign.wave_of("wreck") or 0,
        }
        outcome = await store.run_paid(admin, "island_wreck_repair", arguments)
        if isinstance(outcome, Refusal):
            raise campaign_refusal(outcome, catalogue, "wreck", "The wreck repair")
    return await look_open(admin, catalogue, island, payer)


# --- tearing a building down (docs/GAME-V3.md section 4.2) ---


@dataclass(frozen=True)
class RefundView:
    player_id: str
    name: str
    coins: int


@dataclass(frozen=True)
class DemolishView:
    """A tear-down (or its quote): the building and what each payer gets back."""

    spot: str
    kind: str
    name: str  # the kind's name: "Cannon"
    level: int
    refunds: tuple[RefundView, ...]
    repeat: bool


def wave_running_between_waves() -> ApiError:
    """The 409 for research and a respec during a wave (a tear-down has its own wording)."""
    return ApiError(409, "wave_running", "A wave is under way. Research and respec between waves.")


def demolish_refusal(refusal: Refusal) -> ApiError:
    """The error for a tear-down (or its quote) that the database refused. Nothing changed."""
    reason = refusal.reason
    if reason == "protected":
        return rules.protected()
    if reason == "no_island":
        return no_such_island()
    if reason == "not_member":
        return games.not_member()
    if reason == "not_built":
        return ApiError(409, "not_built", "Nothing stands on this spot now.")
    if reason == "wave_running":
        return ApiError(409, "wave_running", "A wave is under way. Tear it down between waves.")
    if reason == "busy":
        return ApiError(409, "busy", "Somebody changed this building just now. Try again.")
    return SupabaseRejected()


async def demolish_view(
    admin: SupabaseAdmin, catalogue: IslandCatalogue, done: Demolished
) -> DemolishView:
    """The refunds with the captain names other players see (at most one per member)."""
    names: dict[str, str] = {}
    for refund in done.refunds:
        if refund.player_id not in names:
            names[refund.player_id] = await store.read_display_name(admin, refund.player_id)
    kind = rules.kind_named(catalogue, done.kind)
    return DemolishView(
        done.plot,
        done.kind,
        kind.name if kind is not None else done.kind,
        done.level,
        tuple(
            RefundView(item.player_id, names[item.player_id], item.coins) for item in done.refunds
        ),
        done.repeat,
    )


async def demolish_quote(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    player_id: str,
    spot_id: str,
    code: str | None = None,
) -> DemolishView:
    """What tearing down the building on `spot_id` would give back, per payer, worked out by the
    database (island_demolish_quote): for the confirmation card. Changes nothing. 409 protected,
    404 no_such_spot, 404 no_such_island, 403 not_member, 409 not_built, 409 wave_running."""
    spot = rules.check_demolish(catalogue, spot_id)
    island, _payer = await target_island(admin, catalogue, player_id, code)
    arguments = {
        "p_player_id": player_id,
        "p_island_owner": island.owner,
        "p_plot": spot.id,
        "p_prices": rules.price_table(catalogue),
    }
    outcome = await store.run_demolish(admin, "island_demolish_quote", arguments)
    if isinstance(outcome, Refusal):
        raise demolish_refusal(outcome)
    return await demolish_view(admin, catalogue, outcome)


async def demolish(
    admin: SupabaseAdmin,
    catalogue: IslandCatalogue,
    player_id: str,
    spot_id: str,
    action_uid: str,
    code: str | None = None,
) -> tuple[IslandView, DemolishView]:
    """Tear down the building on `spot_id` (your own island, or with `code` the game you are a
    member of) while no wave runs there. Every payer gets half of what they paid for it back,
    rounded down (ledger ref demolish:<actionUid>, reason building_refund); the spot is empty
    again and its tower skill is gone. A repeated actionUid pays nothing and answers the same
    refunds. 409 protected, 404 no_such_spot, 404 no_such_island, 403 not_member, 409 not_built,
    409 wave_running, 409 busy."""
    spot = rules.check_demolish(catalogue, spot_id)
    island, payer = await target_island(admin, catalogue, player_id, code)
    arguments = {
        "p_player_id": player_id,
        "p_island_owner": island.owner,
        "p_plot": spot.id,
        "p_action_uid": action_uid,
        "p_prices": rules.price_table(catalogue),
    }
    outcome = await store.run_demolish(admin, "island_demolish", arguments)
    if isinstance(outcome, Refusal):
        raise demolish_refusal(outcome)
    done = await demolish_view(admin, catalogue, outcome)
    return await look_open(admin, catalogue, island, payer), done


async def harbor_wave(admin: SupabaseAdmin, player_id: str) -> int | None:
    """The best wave won in any game the player is in (their own island and the games they
    joined), or None for a player with no island game at all (the class demo). The Harbor's
    market calls open after wave 4 of the campaign (docs/GAME-V3.md section 4)."""
    listed = await games.mine(admin, player_id)
    if not listed:
        return None
    return max(game.wave_best for game in listed)


async def find_by_code(admin: SupabaseAdmin, typed_code: str) -> Island:
    """The island of a typed code (with or without ISLE-, any case). 404 if none."""
    code = read_code(typed_code)
    island = await store.find_island(admin, code) if code is not None else None
    if island is None:
        raise no_such_island()
    return island


async def visit(
    admin: SupabaseAdmin, catalogue: IslandCatalogue, typed_code: str, player_id: str
) -> VisitView:
    """An island by its code, for a member of its game (GAME-V3 section 2; the owner always).
    404 no_such_island, 403 not_member: a code alone shows nothing, joining the game comes first
    (POST /api/games/join or /api/island/invite/join)."""
    island = await find_by_code(admin, typed_code)
    await games.require_member(admin, island, player_id)
    owner_name = await store.read_display_name(admin, island.owner)
    built = await store.read_built_spots(admin, island.owner)
    spots = rules.plan_spots(catalogue, built)
    progress = await store.read_progress(admin, island.owner)
    research = await store.read_research(admin, island.owner)
    campaign = campaign_of(catalogue, progress.wave_best, research, progress.wreck_paid)
    return VisitView(
        shown(island.code), owner_name, island.wave_best, spots, progress.crew, campaign
    )


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
