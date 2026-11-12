"""The rules of the island: what each spot shows, what may be built or upgraded, the unlocks, the
loot cap and the weather.

Pure Python: no network, no database, no clock. The rules take the catalogue (islands.json) and
plain values, and give plain values back.

Who enforces what: this file decides what may be built where, which level comes next, what is
unlocked and what the screen shows. The database decides what depends on what happened before
(is the spot taken? can the player pay? is a wave running?), because only the database sees two
requests at the same moment; it also refuses a level above the maximum or above the unlocked
level the server passes. The loot is worked out in the database too (wave_finish); loot_cap()
below is the same rule in Python, for the tests and the documentation.

Unlocks (docs/GAME-V3.md section 4, the campaign table of campaign.json): what may be BUILT on
an island (a kind, a level, the inner wall ring, the Tech hub's research, the wreck) follows the
best wave won on THAT island, the game's progress, whoever pays. What belongs to the player (the
captain's levels, the crew, the weapon shop and Pirate Point) follows the player's own unlock
wave as before: the best wave they won, on their own island or in any wave they fought in.

Used by: service.py, pirate_point.py and the tests.
"""

from dataclasses import dataclass

from server.errors import ApiError
from server.island.catalogue import (
    RESEARCH_SPECS,
    Crew,
    IslandCatalogue,
    Kind,
    Loot,
    Research,
    Skill,
    Spot,
    Weapon,
    Weather,
)

# The weather state the waves use when the real weather cannot be read.
CALM = "calm"
# The cabin stands from the start (BUILD-PLAN 3.3). It is not a build spot and has no row.
CABIN = "cabin"


class BuildRefused(ApiError):
    """A build the rules do not allow. Nothing was changed."""


@dataclass(frozen=True)
class Built:
    """A building that stands on a spot."""

    kind: str
    level: int
    spec: str | None = None  # the tower skill it picked at the Tech hub (GAME-V3 section 5)


@dataclass(frozen=True)
class SpotView:
    """One build spot as the API shows it."""

    id: str
    kind: str  # what stands there, or the first kind the spot takes while it is empty
    kinds: tuple[str, ...]  # every kind the spot takes
    built: bool
    level: int  # 0 while empty
    cost: int  # the level-1 price of `kind`, also once it is built
    upgrade_cost: int | None  # the price of the next level, None while empty or at the top
    spec: str | None = None  # the tower skill it picked (GAME-V3 section 5), None for none


def kind_named(catalogue: IslandCatalogue, kind: str) -> Kind | None:
    for entry in catalogue.kinds:
        if entry.kind == kind:
            return entry
    return None


def kind_of(catalogue: IslandCatalogue, kind: str) -> Kind:
    """A kind that must exist (every spot's kinds are in the list: the loader checks it)."""
    entry = kind_named(catalogue, kind)
    if entry is None:
        raise ValueError(f"No price for the kind {kind}.")
    return entry


def price_of(catalogue: IslandCatalogue, kind: str) -> int:
    """The level-1 price of a kind."""
    return kind_of(catalogue, kind).coins


def spot_view(catalogue: IslandCatalogue, spot: Spot, built: Built | None) -> SpotView:
    if built is None:
        return SpotView(
            spot.id, spot.kind, spot.kinds, False, 0, price_of(catalogue, spot.kind), None
        )
    kind = kind_of(catalogue, built.kind)
    upgrade = kind.prices[built.level] if built.level < kind.max_level else None
    spec = built.spec if built.spec in RESEARCH_SPECS.get(kind.kind, ()) else None
    return SpotView(spot.id, kind.kind, spot.kinds, True, built.level, kind.coins, upgrade, spec)


def plan_spots(
    catalogue: IslandCatalogue, built: dict[str, Built], spots: tuple[Spot, ...] | None = None
) -> tuple[SpotView, ...]:
    """Every build spot (the island's, or `spots`), in the order of the file. Other rows are
    ignored, and so is a row whose kind does not belong on its spot."""
    views = []
    for spot in catalogue.spots if spots is None else spots:
        standing = built.get(spot.id)
        if standing is not None and standing.kind not in spot.kinds:
            standing = None
        views.append(spot_view(catalogue, spot, standing))
    return tuple(views)


def find_spot(
    catalogue: IslandCatalogue, spot_id: str, spots: tuple[Spot, ...] | None = None
) -> Spot:
    for spot in catalogue.spots if spots is None else spots:
        if spot.id == spot_id:
            return spot
    if spot_id == CABIN and spots is None:
        raise BuildRefused(409, "spot_taken", "Your cabin already stands there.")
    raise BuildRefused(404, "no_such_spot", "There is no such build spot.")


# --- unlocks ---


def locked(wave: int) -> ApiError:
    return ApiError(409, "locked", f"Opens after wave {wave}.")


def unlock_wave_of(catalogue: IslandCatalogue, kind: Kind, level: int) -> int:
    """The best won wave `kind` at `level` needs (campaign.json)."""
    return kind.level_waves[level - 1] if kind.level_waves else 0


def unlocked_level(catalogue: IslandCatalogue, kind: Kind, wave: int) -> int:
    """The highest level of `kind` a player with this unlock wave may reach (0: not yet)."""
    reached = 0
    for level in range(1, kind.max_level + 1):
        if unlock_wave_of(catalogue, kind, level) <= wave:
            reached = level
    return reached


def captain_unlocked_level(catalogue: IslandCatalogue, wave: int) -> int:
    return max(
        level
        for level, needed in enumerate(catalogue.captain.unlock_waves, start=1)
        if needed <= wave
    )


def unlock_table(catalogue: IslandCatalogue) -> list[tuple[str, int]]:
    """Every unlockable thing with the wave it needs: ("wall:1", 0), ("crew:gunner", 5), ..."""
    items = []
    for kind in catalogue.kinds:
        for level in range(1, kind.max_level + 1):
            items.append((f"{kind.kind}:{level}", unlock_wave_of(catalogue, kind, level)))
    for member in catalogue.crew:
        items.append((f"crew:{member.crew}", member.unlock_wave))
    for level, needed in enumerate(catalogue.captain.unlock_waves, start=1):
        items.append((f"captain:{level}", needed))
    return items


def check_unlocked(catalogue: IslandCatalogue, kind: Kind, level: int, wave: int) -> None:
    needed = unlock_wave_of(catalogue, kind, level)
    if needed > wave:
        raise locked(needed)


def check_open(catalogue: IslandCatalogue, item: str, wave: int) -> None:
    """409 locked ("Opens after wave N.") while the campaign has not opened `item` on the island."""
    needed = catalogue.campaign.wave_of(item)
    if needed is None or needed > wave:
        raise locked(needed if needed is not None else catalogue.waves.highest_wave)


def campaign_table(
    catalogue: IslandCatalogue, wave: int
) -> tuple[list[str], dict[str, int], list[str]]:
    """The campaign of an island whose best won wave is `wave`: (open ids, locked ids with the wave
    they open after, ids that come later and are not built yet)."""
    opened, closed, later = [], {}, []
    for item, needed, coming in catalogue.campaign.ids():
        if coming:
            later.append(item)
        elif needed <= wave:
            opened.append(item)
        else:
            closed[item] = needed
    return opened, closed, later


# --- build, upgrade, hire, captain ---


def check_build(
    catalogue: IslandCatalogue,
    spot_id: str,
    kind: str,
    built: dict[str, Built],
    wave: int,
    spots: tuple[Spot, ...] | None = None,
) -> tuple[Spot, int]:
    """Check that this kind may be built on this spot, and say what it costs.

    The checks come in a fixed order, and the first one that fails is the answer:
      1. the cabin                                409 spot_taken
      2. an unknown spot                          404 no_such_spot
      3. a kind that does not belong there        422 wrong_kind
      4. a spot where something stands already    409 spot_taken (the database checks it again)
      5. a kind the player has not unlocked       409 locked
    Whether the player can pay is not asked here: the wallet answers that in the same step.
    """
    spot = find_spot(catalogue, spot_id, spots)
    if kind not in spot.kinds:
        names = " or a ".join(kind_of(catalogue, name).name.lower() for name in spot.kinds)
        raise BuildRefused(422, "wrong_kind", f"Only a {names} can stand on this spot.")
    if spot.id in built:
        raise spot_taken(catalogue, built[spot.id].kind)
    entry = kind_of(catalogue, kind)
    check_unlocked(catalogue, entry, 1, wave)
    # A spot of a later step (the inner wall ring after wave 5).
    if spots is None and catalogue.campaign.spot_wave(spot.id) > wave:
        raise locked(catalogue.campaign.spot_wave(spot.id))
    return spot, entry.coins


def check_upgrade(
    catalogue: IslandCatalogue,
    spot_id: str,
    built: dict[str, Built],
    wave: int,
    spots: tuple[Spot, ...] | None = None,
) -> tuple[Spot, Kind, int]:
    """Check one level up: 404 no_such_spot, 409 not_built, 409 max_level, 409 locked.
    Returns the spot, the kind and the level the player may reach (for the database)."""
    spot = find_spot(catalogue, spot_id, spots)
    standing = built.get(spot.id)
    if standing is None or standing.kind not in spot.kinds:
        raise ApiError(409, "not_built", "Build something on this spot first.")
    kind = kind_of(catalogue, standing.kind)
    if standing.level >= kind.max_level:
        raise max_level(kind.name)
    check_unlocked(catalogue, kind, standing.level + 1, wave)
    return spot, kind, unlocked_level(catalogue, kind, wave)


def max_level(name: str) -> ApiError:
    return ApiError(409, "max_level", f"{name} is at its highest level.")


def crew_named(catalogue: IslandCatalogue, crew: str) -> Crew:
    for member in catalogue.crew:
        if member.crew == crew:
            return member
    raise ApiError(404, "no_such_crew", "There is no such crew member.")


def check_hire(catalogue: IslandCatalogue, crew: str, hired: int, wave: int) -> Crew:
    """409 crew_full, 409 locked."""
    member = crew_named(catalogue, crew)
    if hired >= member.max:
        raise crew_full(member)
    if member.unlock_wave > wave:
        raise locked(member.unlock_wave)
    return member


def crew_full(member: Crew) -> ApiError:
    return ApiError(409, "crew_full", f"You have every {member.name.lower()} you can hire.")


def check_captain(catalogue: IslandCatalogue, level: int, wave: int) -> int:
    """409 max_level, 409 locked. Returns the captain level the player may reach."""
    captain = catalogue.captain
    if level >= len(captain.prices):
        raise max_level("Your captain")
    needed = captain.unlock_waves[level]
    if needed > wave:
        raise locked(needed)
    return captain_unlocked_level(catalogue, wave)


def captain_next_price(catalogue: IslandCatalogue, level: int) -> int | None:
    prices = catalogue.captain.prices
    return prices[level] if level < len(prices) else None


# --- the captain's skills and weapons (docs/TOWER-DEFENSE.md sections 14 and 15) ---


def skill_points(
    catalogue: IslandCatalogue, won_wave: int, known: tuple[str, ...]
) -> tuple[int, int]:
    """(points left, points spent): one point per wavesPerPoint won waves, minus the costs."""
    spent = sum(skill.cost for skill in catalogue.skills.tree if skill.skill in known)
    earned = max(0, won_wave) // catalogue.skills.waves_per_point
    return max(0, earned - spent), spent


def skill_named(catalogue: IslandCatalogue, skill: str) -> Skill:
    for entry in catalogue.skills.tree:
        if entry.skill == skill:
            return entry
    raise ApiError(400, "bad_skill", "There is no such skill.")


def check_skill(
    catalogue: IslandCatalogue, skill: str, known: tuple[str, ...], won_wave: int
) -> Skill:
    """400 bad_skill, 409 known, 409 locked (the tier above first), 409 no_points.
    The database checks the order and the points again under its lock."""
    entry = skill_named(catalogue, skill)
    if entry.skill in known:
        raise ApiError(409, "known", f"You know {entry.name} already.")
    if entry.needs is not None and entry.needs not in known:
        raise skill_locked(catalogue, entry.needs)
    if skill_points(catalogue, won_wave, known)[0] < entry.cost:
        raise no_points()
    return entry


def skill_locked(catalogue: IslandCatalogue, needs: str) -> ApiError:
    return ApiError(409, "locked", f"Learn {skill_named(catalogue, needs).name} first.")


def no_points() -> ApiError:
    return ApiError(409, "no_points", "Win new waves to earn skill points.")


def weapon_named(catalogue: IslandCatalogue, weapon: str) -> Weapon:
    for entry in catalogue.weapons:
        if entry.weapon == weapon:
            return entry
    raise ApiError(400, "bad_weapon", "There is no such weapon.")


def check_weapon_buy(
    catalogue: IslandCatalogue, weapon: str, owned: tuple[str, ...], wave: int
) -> Weapon:
    """400 bad_weapon, 409 owned, 409 locked. Whether the player can pay: the wallet answers."""
    entry = weapon_named(catalogue, weapon)
    if entry.weapon in owned or entry.coins == 0:
        raise weapon_owned(entry)
    if entry.unlock_wave > wave:
        raise locked(entry.unlock_wave)
    return entry


def weapon_owned(entry: Weapon) -> ApiError:
    return ApiError(409, "owned", f"You own the {entry.name.lower()} already.")


def check_weapon_equip(catalogue: IslandCatalogue, weapon: str, owned: tuple[str, ...]) -> Weapon:
    """400 bad_weapon, 409 not_owned."""
    entry = weapon_named(catalogue, weapon)
    if entry.weapon not in owned:
        raise weapon_not_owned(entry)
    return entry


def weapon_not_owned(entry: Weapon) -> ApiError:
    return ApiError(409, "not_owned", f"Buy the {entry.name.lower()} first.")


# --- the Tech hub (docs/GAME-V3.md section 5) and the wreck (section 4) ---


def research_named(catalogue: IslandCatalogue, branch: str) -> Research:
    for entry in catalogue.research:
        if entry.branch == branch:
            return entry
    raise ApiError(400, "bad_research", "There is no such research.")


def check_research(
    catalogue: IslandCatalogue, branch: str, researched: tuple[str, ...], wave: int
) -> Research:
    """400 bad_research, 409 locked (the Tech hub opens after wave 8), 409 known."""
    entry = research_named(catalogue, branch)
    check_open(catalogue, "tech_hub", wave)
    if entry.branch in researched:
        raise research_known(entry)
    return entry


def research_known(entry: Research) -> ApiError:
    return ApiError(409, "known", f"{entry.name} are researched on this island already.")


def branch_of_spec(spec: str) -> str | None:
    for branch, specs in RESEARCH_SPECS.items():
        if spec in specs:
            return branch
    return None


def check_specialise(
    catalogue: IslandCatalogue,
    spot_id: str,
    spec: str,
    built: dict[str, Built],
    researched: tuple[str, ...],
) -> tuple[Spot, str]:
    """A tower picks one skill of its kind (409 not_built, 400 bad_spec, 422 wrong_kind,
    409 not_researched). Returns the spot and the branch (the tower's kind)."""
    spot = find_spot(catalogue, spot_id)
    standing = built.get(spot.id)
    if standing is None or standing.kind not in spot.kinds:
        raise ApiError(409, "not_built", "Build something on this spot first.")
    branch = branch_of_spec(spec)
    if branch is None:
        raise ApiError(400, "bad_spec", "There is no such tower skill.")
    if branch != standing.kind:
        name = kind_of(catalogue, standing.kind).name.lower()
        raise BuildRefused(422, "wrong_kind", f"A {name} cannot learn that skill.")
    if branch not in researched:
        raise not_researched(research_named(catalogue, branch))
    return spot, branch


def not_researched(entry: Research) -> ApiError:
    return ApiError(409, "not_researched", f"Research {entry.name.lower()} at the Tech hub first.")


def check_wreck_gift(catalogue: IslandCatalogue, amount: int, paid: int, wave: int) -> int:
    """400 bad_gift, 409 locked (after wave 6), 409 repaired. Returns what this gift pays (never
    more than the repair still needs)."""
    if amount not in catalogue.wreck.gifts:
        raise ApiError(400, "bad_gift", "Pick one of the amounts shown.")
    check_open(catalogue, "wreck", wave)
    if paid >= catalogue.wreck.goal:
        raise wreck_repaired()
    return min(amount, catalogue.wreck.goal - paid)


def wreck_repaired() -> ApiError:
    return ApiError(409, "repaired", "The wreck is repaired. Sailing opens later.")


def spot_taken(catalogue: IslandCatalogue, kind: str) -> BuildRefused:
    entry = kind_named(catalogue, kind)
    name = entry.name if entry else "Something"
    return BuildRefused(409, "spot_taken", f"{name} already stands on this spot.")


# --- waves ---


def is_boss(catalogue: IslandCatalogue, wave: int) -> bool:
    every = catalogue.waves.boss_every
    return every > 0 and wave % every == 0


def next_wave(catalogue: IslandCatalogue, wave_best: int, stored_next: int | None) -> int:
    """The wave the next bell on an island rings (wave_start in SQL does the same)."""
    wave = stored_next if stored_next is not None else wave_best + 1
    return min(max(wave, 1), catalogue.waves.highest_wave)


def loot_rates(loot: Loot, wave: int) -> tuple[int, int, int]:
    """(base, per wave, Pirate Point base) for wave_finish, whose loot is base + per_wave x wave.
    From lateFrom on, a wave adds latePerWave instead of perWave: the same line, its base raised by
    (perWave - latePerWave) x lateFrom, so the loot never jumps and the database needs no change."""
    if not loot.late_from or wave <= loot.late_from or loot.late_per_wave >= loot.per_wave:
        return loot.base, loot.per_wave, loot.pirate_point_base
    lift = (loot.per_wave - loot.late_per_wave) * loot.late_from
    return loot.base + lift, loot.late_per_wave, loot.pirate_point_base + lift


def loot_cap(
    loot: Loot, wave: int, house_levels: int, pirate_point: bool = False, boss: bool = False
) -> int:
    """The loot for surviving wave `wave`: 25 + 10 x wave + 10 x house levels on an island, and
    40 + 10 x wave on Pirate Point (which has no houses), 4 a wave instead of 10 past wave 30; a
    boss wave pays twice that."""
    base, per_wave, point_base = loot_rates(loot, wave)
    if pirate_point:
        amount = point_base + per_wave * wave
    else:
        amount = base + per_wave * wave + loot.per_house * house_levels
    return amount * loot.boss_multiplier if boss else amount


def weather_for(catalogue: IslandCatalogue, state: str | None) -> Weather:
    """What a weather state does to the pirates. An unknown or missing state is calm."""
    by_kind = {line.kind: line for line in catalogue.weather}
    return by_kind.get(state or CALM, by_kind[CALM])
