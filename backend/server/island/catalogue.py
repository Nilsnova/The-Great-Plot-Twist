"""The island and its waves, loaded from backend/content/islands.json.

The spots (also Pirate Point's), the prices per level of the five kinds, the crew, the captain,
the captain's skill tree and weapon shop (docs/TOWER-DEFENSE.md sections 14 and 15), the
unlocks, the starting coins, the loot rule, the wave timing and what each weather state does to
the pirates live in a data file (decision D016), so a price changes by editing the file, not the
code. This file reads it, checks every field and hands out an
IslandCatalogue. A mistake stops only the island routes (503 island_unavailable), never the whole
API. The numbers are the tables of docs/TOWER-DEFENSE.md and docs/ECONOMY.md; change them together.

The file is for the server only. The browser gets what it needs through GET /api/island.

Used by: app.py (loads it once at start-up), rules.py, service.py and the tests.
"""

import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path

from server.wallet import MAX_DELTA

logger = logging.getLogger(__name__)

# backend/server/island/catalogue.py -> parents[2] is backend/
CONTENT_FILE = Path(__file__).resolve().parents[2] / "content" / "islands.json"
# The campaign table (docs/GAME-V3.md section 4): what opens after which won wave. The browser
# keeps a copy in frontend/src/campaign/campaign.json; frontend/tests/campaign/campaign.test.js
# keeps the two equal.
CAMPAIGN_FILE = CONTENT_FILE.with_name("campaign.json")

ID_PATTERN = re.compile(r"[a-z][a-z0-9_]{1,39}")
# The weather states of weather/states.py. Each one needs its line in the file.
WEATHER_KINDS = ("storm", "fog", "rain", "calm")
# The limits the database checks too (wave_runs in the migration). MAX_SPOTS: the longest spot list
# (22 island spots since the inner ring of TOWER-DEFENSE section 12), with room to spare.
MAX_SPOTS = 30
MAX_WAVE = 1000
MAX_SECONDS = 86400
MIN_SHIPS, MAX_SHIPS = 0.5, 3.0
# A building has at most 5 levels and a captain 5 (the check rules of the migrations; levels 4 and 5
# since 20261112070000_tower_tiers.sql, docs/GAME-V3.md section 4.1).
MAX_LEVEL = 5
MAX_CAPTAIN_LEVEL = 5
# The crew of docs/TOWER-DEFENSE.md section 3. The database knows exactly these three.
CREW_KINDS = ("gunner", "carpenter", "lookout")
# The skills and weapons the database knows (the check rules of 20261112030000_captain_skills.sql),
# in the order of the tree and the shop. frontend/src/pirates/captain-ids.js lists the same.
# 20261112120000_captain_tree.sql widened them to five tiers a branch with forks and capstones.
SKILL_IDS = (
    "steady_aim",
    "long_barrel",
    "hot_shot",
    "quick_hands",
    "far_sight",
    "heavy_shot",
    "dead_eye",
    "cutlass",
    "sweep",
    "heavy_blade",
    "second_wind",
    "snap_shot",
    "bruiser",
    "field_surgeon",
    "quick_fix",
    "long_reach",
    "sturdy_planks",
    "master_shipwright",
    "swift_hammer",
    "wide_arc",
    "grand_engineer",
)
# The captain roles (docs/GAME-V3.md, Captain tree and roles): one per captain, picked at roleLevel.
ROLE_IDS = ("medic", "engineer", "gunner")
WEAPON_IDS = ("musket", "pistols", "blunderbuss", "long_rifle", "fire_bombs")
STARTING_WEAPON = "musket"
# The Tech hub (docs/GAME-V3.md section 5): the four research branches and the skill a tower of that
# kind may pick once its branch is researched. The check rules of 20261112060000_tech_hub.sql and
# frontend/src/campaign/tech.js list the same ids.
RESEARCH_SPECS = {
    "cannon": ("rapid", "heavy", "chain"),
    "mortar": ("cluster", "fire_pot", "long_range"),
    "wall": ("stone", "spiked", "quick_mend"),
    "watchtower": ("spotter", "signal_fire"),
}
# The campaign's own ids: the island's services and the tiers (everything that is not a level,
# a crew member or a captain level). docs/GAME-V3.md section 4.
SERVICE_IDS = (
    "harbor",
    "market_calls",
    "football_board",
    "wreck",
    "tech_hub",
    "ship",
    "final_battle",
    "tier_12",
    "tier_15",
    "tier_20",
    "tier_30",
    "tier_50",
)


class IslandFileError(ValueError):
    """islands.json has a problem. The message says where."""


@dataclass(frozen=True)
class Kind:
    kind: str  # "wall"
    name: str  # "Wall"
    prices: tuple[int, ...]  # index 0 = level 1 (the build), 1 = level 2, ...; length = max level
    # The island's best won wave each level needs (index 0 = level 1), from campaign.json.
    level_waves: tuple[int, ...] = ()

    @property
    def unlock_wave(self) -> int:
        """The island's best won wave before this kind can be built (campaign.json)."""
        return self.level_waves[0] if self.level_waves else 0

    @property
    def coins(self) -> int:
        """The price of building one (level 1)."""
        return self.prices[0]

    @property
    def max_level(self) -> int:
        return len(self.prices)


@dataclass(frozen=True)
class Spot:
    id: str  # "wall_1": the marker in the island scene and the plot in islet_buildings
    kinds: tuple[str, ...]  # what can stand here; the first is shown on an empty spot

    @property
    def kind(self) -> str:
        return self.kinds[0]


@dataclass(frozen=True)
class Crew:
    crew: str  # gunner, carpenter or lookout
    name: str
    coins: int  # the price of one
    max: int  # at most this many per island
    unlock_wave: int = 0  # from campaign.json (crew:<crew>)


@dataclass(frozen=True)
class Captain:
    prices: tuple[int, ...]  # index 0 = level 1 (free), 1 = level 2, ...; length = max level
    unlock_waves: tuple[
        int, ...
    ] = ()  # the same index: the best won wave each level needs (campaign)


@dataclass(frozen=True)
class Skill:
    skill: str  # steady_aim
    name: str  # Steady aim
    branch: str  # marksman, brawler or shipwright
    tier: int  # 1 to 5
    cost: int  # skill points
    needs: tuple[str, ...]  # the skills of the tier above in the same branch (any one opens it)
    excludes: str | None = None  # the twin of a fork: learning one closes the other
    role: str | None = None  # a capstone: only this role may learn it


@dataclass(frozen=True)
class Role:
    role: str  # medic
    name: str  # Medic
    branch: str  # the branch whose capstone this role opens


@dataclass(frozen=True)
class SkillTree:
    waves_per_point: int  # one skill point per this many won waves
    tree: tuple[Skill, ...]  # in the order of SKILL_IDS
    roles: tuple[Role, ...] = ()  # in the order of ROLE_IDS
    role_level: int = 3  # the captain level that opens the role choice
    respec_per_level: int = 100  # a respec costs this many coins x the captain level
    engineer_discount: int = 10  # percent off buildings and upgrades for an engineer


@dataclass(frozen=True)
class Weapon:
    weapon: str  # pistols
    name: str  # Pistols
    coins: int  # the price, bought once (0 for the musket everybody has)
    unlock_wave: int  # the best won wave a player needs before it can be bought


@dataclass(frozen=True)
class Loot:
    base: int  # loot for surviving wave n: base + per_wave * n + per_house * house levels
    per_wave: int
    per_house: int
    pirate_point_base: int  # the base on Pirate Point, where there are no houses
    boss_multiplier: int  # a boss wave pays this many times the loot
    # From wave late_from on each wave adds late_per_wave instead of per_wave (GAME-V3 section 4:
    # the 100-wave game keeps its coins worth something). 0 for late_from: no taper.
    late_from: int = 0
    late_per_wave: int = 0


@dataclass(frozen=True)
class Revive:
    base: int  # helping a fallen captain up during wave n costs the helper base + per_wave * n
    per_wave: int

    def price(self, wave: int) -> int:
        return self.base + self.per_wave * wave


@dataclass(frozen=True)
class WaveTiming:
    countdown_seconds: int  # from the bell to the first ship
    minimum_seconds: int  # a finish earlier than this after the countdown is refused
    maximum_seconds: int  # after this the wave is over and pays nothing
    highest_wave: int  # the wave number never goes above this
    boss_every: int  # every boss_every-th wave is a boss wave
    restart_back: int  # after a lost wave the next bell rings best wave minus this (at least 1)


@dataclass(frozen=True)
class Research:
    """One research branch of the Tech hub (docs/GAME-V3.md section 5)."""

    branch: str  # cannon, mortar, wall or watchtower: the tower kind it is for
    name: str
    coins: int  # paid once per island, by any member
    specs: tuple[tuple[str, str], ...]  # (spec id, name): what a tower of that kind may pick


@dataclass(frozen=True)
class Wreck:
    """The wreck that washes ashore after wave 6: members pay coins into her repair."""

    goal: int  # coins in all; at this sum she is repaired
    gifts: tuple[int, ...]  # the amounts one tap may pay


@dataclass(frozen=True)
class CampaignStep:
    wave: int  # opens after winning this wave (0: from the start)
    opens: tuple[str, ...]
    later: bool  # not built yet: shown as coming later


@dataclass(frozen=True)
class Campaign:
    """docs/GAME-V3.md section 4, read from campaign.json."""

    steps: tuple[CampaignStep, ...]  # by wave, lowest first
    spots: dict[str, tuple[str, ...]]  # a spot group id -> its spots (ring_walls)

    def wave_of(self, item: str) -> int | None:
        """The won wave after which `item` opens, or None when the table does not name it."""
        for step in self.steps:
            if item in step.opens:
                return step.wave
        return None

    def spot_wave(self, spot: str) -> int:
        """The won wave a spot needs before anything is built on it (0 for most spots)."""
        for group, members in self.spots.items():
            if spot in members:
                return self.wave_of(group) or 0
        return 0

    def ids(self) -> tuple[tuple[str, int, bool], ...]:
        """Every id with its wave and whether it comes later, in the order of the table."""
        return tuple((item, step.wave, step.later) for step in self.steps for item in step.opens)


@dataclass(frozen=True)
class Weather:
    kind: str  # storm, fog, rain or calm
    label: str  # one line for the screen
    ships: float  # how many ships compared with calm weather
    fog: float  # how much fog hides the ships, 0 to 1


@dataclass(frozen=True)
class IslandCatalogue:
    play_money_note: str
    starting_coins: int
    kinds: tuple[Kind, ...]
    spots: tuple[Spot, ...]  # in the order of the file
    pirate_point_spots: tuple[Spot, ...]
    crew: tuple[Crew, ...]
    captain: Captain
    skills: SkillTree
    weapons: tuple[Weapon, ...]
    loot: Loot
    revive: Revive  # captain health (docs/GAME-V3.md section 3)
    waves: WaveTiming
    weather: tuple[Weather, ...]
    campaign: Campaign
    research: tuple[Research, ...] = ()
    wreck: Wreck = Wreck(500, (25, 100))


def read_whole(entry: dict, name: str, where: str, lowest: int, highest: int) -> int:
    value = entry.get(name)
    # bool is a kind of int in Python (True == 1), so it needs its own check.
    if isinstance(value, bool) or not isinstance(value, int) or not lowest <= value <= highest:
        raise IslandFileError(
            f"{where}: '{name}' must be a whole number from {lowest} to {highest}."
        )
    return value


def read_number(entry: dict, name: str, where: str, lowest: float, highest: float) -> float:
    value = entry.get(name)
    if (
        isinstance(value, bool)
        or not isinstance(value, int | float)
        or not lowest <= value <= highest
    ):
        raise IslandFileError(f"{where}: '{name}' must be a number from {lowest} to {highest}.")
    return float(value)


def read_text(entry: dict, name: str, where: str, longest: int) -> str:
    value = entry.get(name)
    if not isinstance(value, str) or not value.strip() or len(value) > longest:
        raise IslandFileError(f"{where}: '{name}' must be text of 1 to {longest} characters.")
    return value


def read_id(entry: dict, name: str, where: str) -> str:
    value = entry.get(name)
    if not isinstance(value, str) or not ID_PATTERN.fullmatch(value):
        raise IslandFileError(f"{where}: '{name}' must be 2 to 40 lowercase letters, digits or _.")
    return value


def read_list(data: dict, name: str, longest: int) -> list:
    entries = data.get(name)
    if not isinstance(entries, list) or not 1 <= len(entries) <= longest:
        raise IslandFileError(f"'{name}' must be a list of 1 to {longest} entries.")
    if not all(isinstance(entry, dict) for entry in entries):
        raise IslandFileError(f"Every entry of '{name}' must be an object.")
    return entries


def read_object(data: dict, name: str) -> dict:
    value = data.get(name)
    if not isinstance(value, dict):
        raise IslandFileError(f"'{name}' must be an object.")
    return value


def read_whole_list(entry: dict, name: str, where: str, lowest: int, longest: int) -> tuple:
    values = entry.get(name)
    if not isinstance(values, list) or not 1 <= len(values) <= longest:
        raise IslandFileError(f"{where}: '{name}' must be a list of 1 to {longest} whole numbers.")
    return tuple(
        read_whole({"value": value}, "value", f"{where}.{name}", lowest, MAX_DELTA)
        for value in values
    )


def read_kinds(data: dict) -> tuple[Kind, ...]:
    kinds = tuple(
        Kind(
            kind=read_id(entry, "kind", f"kinds[{index}]"),
            name=read_text(entry, "name", f"kinds[{index}]", 40),
            prices=read_whole_list(entry, "prices", f"kinds[{index}]", 1, MAX_LEVEL),
        )
        for index, entry in enumerate(read_list(data, "kinds", MAX_SPOTS))
    )
    if len({kind.kind for kind in kinds}) != len(kinds):
        raise IslandFileError("Two entries of 'kinds' share the same 'kind'.")
    return kinds


def read_spots(data: dict, name: str, kinds: tuple[Kind, ...]) -> tuple[Spot, ...]:
    known = {kind.kind for kind in kinds}
    spots = []
    for index, entry in enumerate(read_list(data, name, MAX_SPOTS)):
        where = f"{name}[{index}]"
        spot_kinds = entry.get("kinds")
        if not isinstance(spot_kinds, list) or not 1 <= len(spot_kinds) <= 4:
            raise IslandFileError(f"{where}: 'kinds' must be a list of 1 to 4 kinds.")
        spot = Spot(
            id=read_id(entry, "id", where),
            kinds=tuple(read_id({"kind": kind}, "kind", where) for kind in spot_kinds),
        )
        unknown = [kind for kind in spot.kinds if kind not in known]
        if unknown:
            raise IslandFileError(f"{where}: the kind '{unknown[0]}' is not in 'kinds'.")
        spots.append(spot)
    if len({spot.id for spot in spots}) != len(spots):
        raise IslandFileError(f"Two entries of '{name}' share the same 'id'.")
    return tuple(spots)


def read_crew(data: dict) -> tuple[Crew, ...]:
    crew = tuple(
        Crew(
            crew=read_id(entry, "crew", f"crew[{index}]"),
            name=read_text(entry, "name", f"crew[{index}]", 40),
            coins=read_whole(entry, "coins", f"crew[{index}]", 1, MAX_DELTA),
            max=read_whole(entry, "max", f"crew[{index}]", 1, 10),
        )
        for index, entry in enumerate(read_list(data, "crew", len(CREW_KINDS)))
    )
    if sorted(member.crew for member in crew) != sorted(CREW_KINDS):
        raise IslandFileError(f"'crew' must have one entry for each of {', '.join(CREW_KINDS)}.")
    return crew


def read_captain(data: dict) -> Captain:
    entry = read_object(data, "captain")
    captain = Captain(prices=read_whole_list(entry, "prices", "captain", 0, MAX_CAPTAIN_LEVEL))
    if captain.prices[0] != 0 or 0 in captain.prices[1:]:
        raise IslandFileError("captain: level 1 is free (0) and every later level costs coins.")
    return captain


def read_skills(data: dict) -> SkillTree:
    entry = read_object(data, "captainSkills")
    tree = []
    for index, item in enumerate(read_list(entry, "tree", len(SKILL_IDS))):
        where = f"captainSkills.tree[{index}]"
        needs = item.get("needs")
        if not isinstance(needs, list):
            raise IslandFileError(f"{where}: 'needs' must be a list (empty for tier 1).")
        excludes, role = item.get("excludes"), item.get("role")
        tree.append(
            Skill(
                skill=read_id(item, "skill", where),
                name=read_text(item, "name", where, 40),
                branch=read_id(item, "branch", where),
                tier=read_whole(item, "tier", where, 1, 5),
                cost=read_whole(item, "cost", where, 1, 10),
                needs=tuple(read_id({"needs": value}, "needs", where) for value in needs),
                excludes=None if excludes is None else read_id(item, "excludes", where),
                role=None if role is None else read_id(item, "role", where),
            )
        )
    if tuple(skill.skill for skill in tree) != SKILL_IDS:
        raise IslandFileError(f"captainSkills.tree must list {', '.join(SKILL_IDS)} in this order.")
    roles = tuple(
        Role(
            role=read_id(item, "role", f"captainSkills.roles[{index}]"),
            name=read_text(item, "name", f"captainSkills.roles[{index}]", 40),
            branch=read_id(item, "branch", f"captainSkills.roles[{index}]"),
        )
        for index, item in enumerate(read_list(entry, "roles", len(ROLE_IDS)))
    )
    if tuple(role.role for role in roles) != ROLE_IDS:
        raise IslandFileError(f"captainSkills.roles must list {', '.join(ROLE_IDS)} in this order.")
    check_tree(tree, roles)
    respec = read_object(entry, "respec")
    return SkillTree(
        waves_per_point=read_whole(entry, "wavesPerPoint", "captainSkills", 1, 100),
        tree=tuple(tree),
        roles=roles,
        role_level=read_whole(entry, "roleLevel", "captainSkills", 2, MAX_CAPTAIN_LEVEL),
        respec_per_level=read_whole(respec, "coinsPerLevel", "captainSkills.respec", 1, 100000),
        engineer_discount=read_whole(entry, "engineerDiscountPercent", "captainSkills", 1, 50),
    )


def check_tree(tree: list[Skill], roles: tuple[Role, ...]) -> None:
    """The shape of the tree: a tier 1 needs nothing, every other skill needs the skills of the
    tier above in its branch, a fork is a pair of tier 2 or 4 skills that exclude each other, and
    a capstone (tier 5) needs the role of its branch."""
    by_id = {skill.skill: skill for skill in tree}
    for skill in tree:
        where = f"captainSkills: '{skill.skill}'"
        above = [by_id.get(name) for name in skill.needs]
        if (skill.tier == 1) != (not skill.needs) or any(
            item is None or item.branch != skill.branch or item.tier != skill.tier - 1
            for item in above
        ):
            raise IslandFileError(f"{where} must need the tier above it in its branch.")
        if skill.excludes is not None:
            twin = by_id.get(skill.excludes)
            if (
                skill.tier not in (2, 4)
                or twin is None
                or twin.excludes != skill.skill
                or (twin.branch, twin.tier) != (skill.branch, skill.tier)
            ):
                raise IslandFileError(f"{where} must exclude its twin on tier 2 or 4.")
        wanted = next((role.role for role in roles if role.branch == skill.branch), None)
        if (skill.role is not None) != (skill.tier == 5) or (
            skill.role is not None and skill.role != wanted
        ):
            raise IslandFileError(f"{where}: only the tier 5 capstone has the role of its branch.")


def read_weapons(data: dict) -> tuple[Weapon, ...]:
    weapons = tuple(
        Weapon(
            weapon=read_id(entry, "weapon", f"weapons[{index}]"),
            name=read_text(entry, "name", f"weapons[{index}]", 40),
            coins=read_whole(entry, "coins", f"weapons[{index}]", 0, MAX_DELTA),
            unlock_wave=read_whole(entry, "unlockWave", f"weapons[{index}]", 0, MAX_WAVE),
        )
        for index, entry in enumerate(read_list(data, "weapons", len(WEAPON_IDS)))
    )
    if tuple(weapon.weapon for weapon in weapons) != WEAPON_IDS:
        raise IslandFileError(f"'weapons' must list {', '.join(WEAPON_IDS)} in this order.")
    for weapon in weapons:
        if (weapon.coins == 0) != (weapon.weapon == STARTING_WEAPON):
            raise IslandFileError("weapons: the musket is free and every other weapon costs coins.")
    return weapons


def read_loot(data: dict) -> Loot:
    entry = read_object(data, "loot")
    return Loot(
        base=read_whole(entry, "base", "loot", 0, 1000),
        per_wave=read_whole(entry, "perWave", "loot", 0, 1000),
        per_house=read_whole(entry, "perHouse", "loot", 0, 1000),
        pirate_point_base=read_whole(entry, "piratePointBase", "loot", 0, 1000),
        boss_multiplier=read_whole(entry, "bossMultiplier", "loot", 1, 10),
        late_from=read_whole(entry, "lateFrom", "loot", 0, MAX_WAVE),
        late_per_wave=read_whole(entry, "latePerWave", "loot", 0, 1000),
    )


def read_revive(data: dict) -> Revive:
    entry = read_object(data, "revive")
    read_text(entry, "about", "revive", 1000)  # the entry explains itself; checked only
    return Revive(
        base=read_whole(entry, "base", "revive", 1, 1000),
        per_wave=read_whole(entry, "perWave", "revive", 0, 1000),
    )


def read_waves(data: dict) -> WaveTiming:
    entry = read_object(data, "waves")
    timing = WaveTiming(
        countdown_seconds=read_whole(entry, "countdownSeconds", "waves", 0, 600),
        minimum_seconds=read_whole(entry, "minimumSeconds", "waves", 0, MAX_SECONDS),
        maximum_seconds=read_whole(entry, "maximumSeconds", "waves", 1, MAX_SECONDS),
        highest_wave=read_whole(entry, "highestWave", "waves", 1, MAX_WAVE),
        boss_every=read_whole(entry, "bossEvery", "waves", 0, MAX_WAVE),
        restart_back=read_whole(entry, "restartBack", "waves", 0, MAX_WAVE),
    )
    if timing.minimum_seconds > timing.maximum_seconds:
        raise IslandFileError("waves: 'minimumSeconds' cannot be more than 'maximumSeconds'.")
    return timing


def read_weather(data: dict) -> tuple[Weather, ...]:
    lines = tuple(
        Weather(
            kind=read_id(entry, "kind", f"weather[{index}]"),
            label=read_text(entry, "label", f"weather[{index}]", 80),
            ships=read_number(entry, "ships", f"weather[{index}]", MIN_SHIPS, MAX_SHIPS),
            fog=read_number(entry, "fog", f"weather[{index}]", 0.0, 1.0),
        )
        for index, entry in enumerate(read_list(data, "weather", len(WEATHER_KINDS)))
    )
    if sorted(line.kind for line in lines) != sorted(WEATHER_KINDS):
        raise IslandFileError(
            f"'weather' must have one entry for each of {', '.join(WEATHER_KINDS)}."
        )
    return lines


def read_research(data: dict) -> tuple[Research, ...]:
    entry = read_object(data, "research")
    branches = []
    for index, item in enumerate(read_list(entry, "branches", len(RESEARCH_SPECS))):
        where = f"research.branches[{index}]"
        specs = item.get("specs")
        if not isinstance(specs, list) or not 1 <= len(specs) <= 3:
            raise IslandFileError(f"{where}: 'specs' must be a list of 1 to 3 skills.")
        branch = Research(
            branch=read_id(item, "branch", where),
            name=read_text(item, "name", where, 40),
            coins=read_whole(item, "coins", where, 1, MAX_DELTA),
            specs=tuple(
                (read_id(spec, "spec", where), read_text(spec, "name", where, 40))
                for spec in specs
                if isinstance(spec, dict)
            ),
        )
        if tuple(spec for spec, _ in branch.specs) != RESEARCH_SPECS.get(branch.branch):
            raise IslandFileError(
                f"{where}: the skills of '{branch.branch}' must be the known ones."
            )
        branches.append(branch)
    if tuple(branch.branch for branch in branches) != tuple(RESEARCH_SPECS):
        raise IslandFileError(f"research.branches must list {', '.join(RESEARCH_SPECS)} in order.")
    return tuple(branches)


def read_wreck(data: dict) -> Wreck:
    entry = read_object(data, "wreck")
    wreck = Wreck(
        goal=read_whole(entry, "goal", "wreck", 1, 100000),
        gifts=read_whole_list(entry, "gifts", "wreck", 1, 4),
    )
    if any(gift < 1 or gift > wreck.goal for gift in wreck.gifts):
        raise IslandFileError("wreck: every gift must be from 1 coin up to the goal.")
    return wreck


def read_campaign(path: Path = CAMPAIGN_FILE) -> Campaign:
    """Read and check campaign.json (docs/GAME-V3.md section 4)."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise IslandFileError(f"Cannot read {path.name}: {type(error).__name__}.") from error
    if not isinstance(data, dict):
        raise IslandFileError(f"{path.name} must hold one JSON object.")
    read_text(data, "about", path.name, 1500)
    steps, seen, last = [], set(), -1
    for index, entry in enumerate(read_list(data, "steps", 40)):
        where = f"campaign.steps[{index}]"
        wave = read_whole(entry, "wave", where, 0, MAX_WAVE)
        if wave <= last:
            raise IslandFileError(f"{where}: the steps must go up by wave.")
        last = wave
        opens = entry.get("opens")
        if not isinstance(opens, list) or not 1 <= len(opens) <= 12:
            raise IslandFileError(f"{where}: 'opens' must be a list of 1 to 12 ids.")
        ids = tuple(read_text({"id": item}, "id", where, 40) for item in opens)
        if seen & set(ids):
            raise IslandFileError(f"{where}: an id opens twice.")
        seen |= set(ids)
        read_text(entry, "title", where, 80)
        read_text(entry, "line", where, 200)
        later = entry.get("later", False)
        if not isinstance(later, bool):
            raise IslandFileError(f"{where}: 'later' must be true or false.")
        steps.append(CampaignStep(wave, ids, later))
    groups = read_object(data, "spots")
    spots = {}
    for group, members in groups.items():
        if not isinstance(members, list) or not all(isinstance(m, str) for m in members):
            raise IslandFileError(f"campaign.spots.{group} must be a list of spot ids.")
        spots[group] = tuple(members)
    return Campaign(tuple(steps), spots)


def with_campaign(
    campaign: Campaign, kinds: tuple[Kind, ...], crew: tuple[Crew, ...], captain: Captain
) -> tuple[tuple[Kind, ...], tuple[Crew, ...], Captain]:
    """The kinds, crew and captain with the waves of the campaign table. Every level, crew member
    and captain level must be in the table once."""

    def wave(item: str) -> int:
        found = campaign.wave_of(item)
        if found is None:
            raise IslandFileError(f"campaign.json does not say when '{item}' opens.")
        return found

    kinds = tuple(
        Kind(
            k.kind,
            k.name,
            k.prices,
            tuple(wave(f"{k.kind}:{n}") for n in range(1, k.max_level + 1)),
        )
        for k in kinds
    )
    for k in kinds:
        if list(k.level_waves) != sorted(k.level_waves):
            raise IslandFileError(f"campaign.json: the levels of '{k.kind}' must open in order.")
    crew = tuple(Crew(m.crew, m.name, m.coins, m.max, wave(f"crew:{m.crew}")) for m in crew)
    levels = tuple(wave(f"captain:{n}") for n in range(1, len(captain.prices) + 1))
    if levels[0] != 0 or list(levels) != sorted(levels):
        raise IslandFileError(
            "campaign.json: captain:1 opens at the start and the levels in order."
        )
    known = (
        {f"{k.kind}:{n}" for k in kinds for n in range(1, k.max_level + 1)}
        | {f"crew:{m.crew}" for m in crew}
        | {f"captain:{n}" for n in range(1, len(captain.prices) + 1)}
        | set(SERVICE_IDS)
        | set(campaign.spots)
    )
    unknown = [item for item, _, _ in campaign.ids() if item not in known]
    if unknown:
        raise IslandFileError(
            f"campaign.json names '{unknown[0]}', which the island does not know."
        )
    return kinds, crew, Captain(captain.prices, levels)


def load_island(path: Path = CONTENT_FILE, campaign_path: Path | None = None) -> IslandCatalogue:
    """Read and check islands.json and campaign.json. Raises IslandFileError on any mistake."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise IslandFileError(f"Cannot read {path.name}: {type(error).__name__}.") from error
    if not isinstance(data, dict):
        raise IslandFileError(f"{path.name} must hold one JSON object.")
    read_text(data, "about", path.name, 1000)  # the file explains itself; checked only
    campaign = read_campaign(campaign_path or CAMPAIGN_FILE)
    kinds = read_kinds(data)
    spots = read_spots(data, "spots", kinds)
    spot_ids = {spot.id for spot in spots}
    for group, members in campaign.spots.items():
        if not members or not set(members) <= spot_ids:
            raise IslandFileError(f"campaign.spots.{group} names a spot the island does not have.")
    kinds, crew, captain = with_campaign(campaign, kinds, read_crew(data), read_captain(data))
    return IslandCatalogue(
        play_money_note=read_text(data, "playMoneyNote", path.name, 200),
        starting_coins=read_whole(data, "startingCoins", path.name, 1, MAX_DELTA),
        kinds=kinds,
        spots=spots,
        pirate_point_spots=read_spots(data, "piratePointSpots", kinds),
        crew=crew,
        captain=captain,
        skills=read_skills(data),
        weapons=read_weapons(data),
        loot=read_loot(data),
        revive=read_revive(data),
        waves=read_waves(data),
        weather=read_weather(data),
        campaign=campaign,
        research=read_research(data),
        wreck=read_wreck(data),
    )


def island_or_none() -> IslandCatalogue | None:
    """Like load_island, but a broken file stops only the island routes, not the whole server."""
    try:
        return load_island()
    except IslandFileError as error:
        logger.error("The island cannot start: %s", error)
        return None
