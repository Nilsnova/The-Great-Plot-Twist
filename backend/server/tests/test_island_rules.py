"""Tests for island/catalogue.py, codes.py and rules.py, and that Python and the migration agree.

The numbers are the tables of docs/TOWER-DEFENSE.md (and BUILD-PLAN.md 3.2): a test here fails
if islands.json drifts from the contract the frontend lanes build against.

Used by: pytest (cd backend && uv run pytest).
"""

import hashlib
import json
import re

import pytest

from server.errors import ApiError
from server.game.building_catalogue import load_buildings
from server.island import codes, rules
from server.island.catalogue import CONTENT_FILE, IslandFileError, load_island
from server.island.waves import SEED_LIMIT
from server.tests.helpers import REPO_ROOT
from server.wallet import find_direction

MIGRATION = REPO_ROOT / "supabase" / "migrations" / "20261110010000_islands_and_waves.sql"
CREWS = REPO_ROOT / "supabase" / "migrations" / "20261110020000_wave_crews.sql"
TOWER_DEFENSE = REPO_ROOT / "supabase" / "migrations" / "20261111030000_tower_defense.sql"
INNER_WALLS = REPO_ROOT / "supabase" / "migrations" / "20261112020000_inner_walls.sql"
# The md5 of 20261110010000 as applied live (a checksum, not a secret).
APPLIED_MD5 = "79278156e4925b2d39076722c11d2f00"  # pragma: allowlist secret


def write_island(tmp_path, change):
    data = json.loads(CONTENT_FILE.read_text())
    change(data)
    path = tmp_path / "islands.json"
    path.write_text(json.dumps(data))
    return path


# --- the contract: BUILD-PLAN 3.2 and 3.3 ---


def test_the_prices_and_the_starting_coins_are_the_economy_table():
    catalogue = load_island()

    assert catalogue.starting_coins == 200
    assert {kind.kind: kind.prices for kind in catalogue.kinds} == {
        "wall": (10, 20, 40, 80, 160),
        "cannon": (30, 60, 120, 240, 480),
        "mortar": (60, 120, 240, 480, 960),
        "watchtower": (40, 80, 160, 320, 640),
        "house": (50, 100, 200),  # level 3: the house roles (docs/GAME-V3.md "Houses")
    }
    # Levels 4 and 5 (docs/GAME-V3.md 4.1): 4 after wave 12 (the mortar 15), 5 after wave 20.
    waves = {kind.kind: kind.level_waves for kind in catalogue.kinds}
    assert waves["cannon"] == waves["wall"] == (0, 2, 5, 12, 20)
    assert waves["mortar"] == (2, 2, 5, 15, 20)
    assert waves["watchtower"] == (3, 3, 12, 15, 20)
    assert {m.crew: (m.coins, m.max, m.unlock_wave) for m in catalogue.crew} == {
        "gunner": (40, 2, 3),
        "carpenter": (30, 2, 5),
        "lookout": (25, 1, 8),
    }
    assert catalogue.captain.prices == (0, 20, 40, 80, 160)
    assert (catalogue.waves.highest_wave, catalogue.waves.boss_every) == (100, 5)
    assert (catalogue.waves.restart_back, catalogue.loot.boss_multiplier) == (2, 2)


def test_the_spots_are_the_spots_of_the_contract():
    catalogue = load_island()
    spots = [(spot.id, spot.kinds) for spot in catalogue.spots]
    tower = ("cannon", "mortar")

    assert spots == (
        [(f"wall_{n}", ("wall",)) for n in range(1, 7)]
        + [(f"cannon_{n}", tower) for n in range(1, 8)]
        + [("tower_1", ("watchtower",)), ("house_1", ("house",)), ("house_2", ("house",))]
        + [(f"wall_{n}", ("wall",)) for n in range(7, 13)]  # the inner ring (section 12)
    )
    assert [(spot.id, spot.kinds) for spot in catalogue.pirate_point_spots] == (
        [(f"pp_wall_{n}", ("wall",)) for n in range(1, 5)]
        + [(f"pp_tower_{n}", tower) for n in range(1, 7)]
    )


@pytest.mark.parametrize(("wave", "houses", "loot"), [(1, 0, 35), (3, 0, 55), (3, 2, 75)])
def test_the_loot_is_twenty_five_plus_ten_per_wave_plus_ten_per_house(wave, houses, loot):
    assert rules.loot_cap(load_island().loot, wave, houses) == loot


def test_a_boss_wave_is_every_fifth_and_pays_twice():
    catalogue = load_island()

    assert [wave for wave in range(1, 21) if rules.is_boss(catalogue, wave)] == [5, 10, 15, 20]
    assert rules.loot_cap(catalogue.loot, 5, 3, boss=True) == (25 + 50 + 30) * 2
    assert rules.loot_cap(catalogue.loot, 10, 0, pirate_point=True, boss=True) == 280


@pytest.mark.parametrize(
    ("best", "stored", "next_wave"), [(0, None, 1), (4, None, 5), (10, 8, 8), (100, None, 100)]
)
def test_the_next_wave_is_the_stored_restart_or_the_best_plus_one(best, stored, next_wave):
    assert rules.next_wave(load_island(), best, stored) == next_wave


def test_the_unlocks_follow_the_campaign_table_of_game_v3_section_four():
    catalogue = load_island()
    table = dict(rules.unlock_table(catalogue))

    assert {item for item, wave in table.items() if wave == 0} == {
        "wall:1", "cannon:1", "captain:1",
    }  # fmt: skip
    assert (table["captain:2"], table["captain:3"], table["house:1"]) == (1, 1, 1)
    assert (table["wall:2"], table["cannon:2"], table["house:2"]) == (2, 2, 2)
    assert table["house:3"] == 5
    assert (table["mortar:1"], table["mortar:2"], table["watchtower:1"]) == (2, 2, 3)
    assert (table["crew:gunner"], table["crew:carpenter"], table["wall:3"]) == (3, 5, 5)
    assert (table["mortar:3"], table["crew:lookout"]) == (5, 8)
    assert (table["captain:4"], table["captain:5"]) == (8, 8)
    campaign = catalogue.campaign
    assert [campaign.wave_of(item) for item in ("harbor", "market_calls", "ring_walls")] == [
        4,
        4,
        5,
    ]
    assert [campaign.wave_of(item) for item in ("wreck", "football_board", "tech_hub")] == [6, 7, 8]
    assert [campaign.wave_of(f"tier_{n}") for n in (12, 15, 20, 30, 50)] == [12, 15, 20, 30, 50]
    assert campaign.spot_wave("wall_7") == 5 and campaign.spot_wave("wall_1") == 0


def test_the_inner_wall_ring_opens_after_wave_five():
    catalogue = load_island()

    with pytest.raises(ApiError) as early:
        rules.check_build(catalogue, "wall_9", "wall", {}, 4)
    assert (early.value.code, early.value.message) == ("locked", "Opens after wave 5.")
    assert rules.check_build(catalogue, "wall_9", "wall", {}, 5)[1] == 10
    assert rules.check_build(catalogue, "wall_1", "wall", {}, 0)[1] == 10


def test_the_campaign_table_says_what_is_open_locked_and_later():
    opened, locked, later = rules.campaign_table(load_island(), 4)

    assert {"harbor", "market_calls", "watchtower:1", "mortar:1"} <= set(opened)
    assert locked["ring_walls"] == 5 and locked["tech_hub"] == 8 and "harbor" not in locked
    assert later == ["ship"]


def test_a_locked_kind_level_crew_or_captain_level_is_refused_with_its_wave():
    catalogue = load_island()
    wall = {"wall_1": rules.Built("wall", 2)}

    with pytest.raises(ApiError) as mortar:
        rules.check_build(catalogue, "cannon_1", "mortar", {}, 1)
    with pytest.raises(ApiError) as level:
        rules.check_upgrade(catalogue, "wall_1", wall, 4)
    with pytest.raises(ApiError) as crew:
        rules.check_hire(catalogue, "lookout", 0, 7)
    with pytest.raises(ApiError) as captain:
        rules.check_captain(catalogue, 1, 0)

    assert (mortar.value.code, mortar.value.message) == ("locked", "Opens after wave 2.")
    assert [e.value.message for e in (level, crew, captain)] == [
        "Opens after wave 5.", "Opens after wave 8.", "Opens after wave 1.",
    ]  # fmt: skip


def test_upgrade_hire_and_captain_refuse_the_top_and_a_full_crew():
    catalogue = load_island()

    with pytest.raises(ApiError, match="highest level") as top:
        rules.check_upgrade(catalogue, "house_1", {"house_1": rules.Built("house", 3)}, 99)
    with pytest.raises(ApiError) as empty:
        rules.check_upgrade(catalogue, "wall_1", {}, 99)
    with pytest.raises(ApiError) as full:
        rules.check_hire(catalogue, "gunner", 2, 99)
    with pytest.raises(ApiError) as captain:
        rules.check_captain(catalogue, 5, 99)

    assert [e.value.code for e in (top, empty, full, captain)] == [
        "max_level", "not_built", "crew_full", "max_level",
    ]  # fmt: skip
    assert rules.check_captain(catalogue, 1, 1) == 3  # captain levels 2 and 3 open at wave 1


@pytest.mark.parametrize(
    ("state", "kind", "ships", "fog"),
    [
        ("storm", "storm", 1.5, 0.0),
        ("fog", "fog", 1.0, 0.4),
        ("rain", "rain", 1.0, 0.0),
        ("calm", "calm", 1.0, 0.0),
        (None, "calm", 1.0, 0.0),
        ("hail", "calm", 1.0, 0.0),
    ],
)
def test_what_the_weather_does_to_the_pirates(state, kind, ships, fog):
    weather = rules.weather_for(load_island(), state)

    assert (weather.kind, weather.ships, weather.fog) == (kind, ships, fog)


# --- the file checks ---


@pytest.mark.parametrize(
    ("change", "message"),
    [
        (lambda data: data.update(startingCoins=0), "startingCoins"),
        (lambda data: data["kinds"][0].update(prices=[True]), "prices"),
        (lambda data: data["spots"][0].update(kinds=["moat"]), "not in 'kinds'"),
        (lambda data: data["spots"].append({"id": "wall_1", "kinds": ["wall"]}), "same 'id'"),
        (lambda data: data["crew"].pop(), "one entry for each"),
        (lambda data: data["captain"].update(prices=[5, 20, 40, 80, 160]), "level 1 is free"),
        (lambda data: data["kinds"].append(dict(data["kinds"][0])), "same 'kind'"),
        (lambda data: data["weather"].pop(), "one entry for each"),
        (lambda data: data["weather"][0].update(ships=9), "ships"),
        (lambda data: data["waves"].update(minimumSeconds=5000), "cannot be more"),
        (lambda data: data["loot"].update(perWave=-1), "perWave"),
    ],
)
def test_a_mistake_in_the_file_is_named(tmp_path, change, message):
    with pytest.raises(IslandFileError, match=message):
        load_island(write_island(tmp_path, change))


def test_a_file_that_is_not_json_is_refused(tmp_path):
    path = tmp_path / "islands.json"
    path.write_text("{")

    with pytest.raises(IslandFileError, match="Cannot read"):
        load_island(path)


# --- codes ---


@pytest.mark.parametrize("typed", ["ISLE-K7Q2M", "isle-k7q2m", "ISLE K7Q2M", "K7Q2M", "k7q-2m"])
def test_a_typed_code_is_read_in_every_spelling(typed):
    assert codes.read_code(typed) == "K7Q2M"


@pytest.mark.parametrize("typed", ["", "K7Q2", "K7Q20", "HARBOR-K7Q2M", "ISLE-K7Q2MM", None, 5])
def test_a_typed_code_that_cannot_be_one_is_none(typed):
    assert codes.read_code(typed) is None


def test_a_new_code_uses_the_alphabet_and_is_shown_with_isle():
    code = codes.new_code()

    assert codes.CODE_FORMAT.fullmatch(code)
    assert codes.shown("K7Q2M") == "ISLE-K7Q2M"


# --- build rules ---


def test_a_build_on_a_free_spot_costs_its_kind():
    spot, price = rules.check_build(load_island(), "tower_1", "watchtower", {}, 3)
    mortar_spot, mortar = rules.check_build(load_island(), "cannon_5", "mortar", {}, 3)

    assert (spot.id, price, mortar_spot.id, mortar) == ("tower_1", 40, "cannon_5", 60)


def test_the_spots_are_planned_in_file_order_with_their_state():
    built = {
        "wall_2": rules.Built("wall", 1),
        "cannon_1": rules.Built("mortar", 3),
        "cannon_3": rules.Built("cannon", 5),
        "plot_3": rules.Built("windmill", 1),
    }
    plans = {plan.id: plan for plan in rules.plan_spots(load_island(), built)}

    assert [plan.id for plan in plans.values() if plan.built] == ["wall_2", "cannon_1", "cannon_3"]
    assert len(plans) == 22
    assert (plans["wall_2"].level, plans["wall_2"].upgrade_cost) == (1, 20)
    # A level-3 mortar has two levels to go (docs/GAME-V3.md section 4.1); a level-5 cannon none.
    assert (plans["cannon_1"].kind, plans["cannon_1"].cost, plans["cannon_1"].upgrade_cost) == (
        "mortar",
        60,
        480,
    )
    assert (plans["cannon_3"].level, plans["cannon_3"].upgrade_cost) == (5, None)
    assert (plans["cannon_2"].kind, plans["cannon_2"].kinds) == ("cannon", ("cannon", "mortar"))


# --- Python and the migration agree ---


def migration_text() -> str:
    return MIGRATION.read_text()


def declared_parameters(function_name: str, text: str | None = None) -> list[str]:
    match = re.search(
        rf"create or replace function public\.{function_name}\((.*?)\)\s*returns",
        migration_text() if text is None else text,
        re.DOTALL,
    )
    assert match, function_name
    return re.findall(r"^\s*(p_[a-z_]+)\s", match.group(1), re.MULTILINE)


def check_pairs(text: str, constraint: str) -> set[tuple[str, str]]:
    check = re.search(rf"constraint {constraint}(.*?)\)\);", text, re.DOTALL).group(1)
    return set(re.findall(r"\('([a-z0-9_]+)',\s*'([a-z0-9_]+)'\)", check))


def test_the_check_rule_allows_the_old_pairs_and_every_island_spot():
    # The newest rule (20261112020000, the inner ring of TOWER-DEFENSE section 12) is the file's.
    pairs = check_pairs(INNER_WALLS.read_text(), "islet_buildings_plot_fits_building")

    old = {(s.plot, s.building_type) for s in load_buildings().spots if not s.stands_from_start}
    new = {(spot.id, kind) for spot in load_island().spots for kind in spot.kinds}
    first = check_pairs(migration_text(), "islet_buildings_plot_fits_building")
    before = check_pairs(TOWER_DEFENSE.read_text(), "islet_buildings_plot_fits_building")
    assert pairs == old | new
    assert first <= before <= pairs  # every pair an existing row may use stays allowed
    assert pairs - before == {(f"wall_{n}", "wall") for n in range(7, 13)}


def test_the_inner_wall_migration_changes_only_the_spot_rule():
    text = INNER_WALLS.read_text()
    verbs = r"^(alter|create|drop|insert|update|delete|grant|comment)"
    statements = [line for line in text.splitlines() if re.match(verbs, line)]
    assert statements == [
        "alter table public.islet_buildings",
        "alter table public.islet_buildings",
        "comment on constraint islet_buildings_plot_fits_building on public.islet_buildings is",
    ]


def test_the_pirate_point_check_rule_is_the_spots_of_the_file():
    pairs = check_pairs(TOWER_DEFENSE.read_text(), "pirate_point_buildings_spot_fits_kind")

    catalogue = load_island()
    assert pairs == {(s.id, kind) for s in catalogue.pirate_point_spots for kind in s.kinds}


def test_the_tower_defense_functions_take_exactly_the_arguments_the_server_sends():
    text = TOWER_DEFENSE.read_text()

    assert declared_parameters("wave_finish", text) == [
        "p_player_id", "p_wave_id", "p_survived", "p_ships_sunk", "p_loot_base",
        "p_loot_per_wave", "p_loot_per_house", "p_point_loot_base", "p_boss_every",
        "p_boss_multiplier", "p_restart_back",
    ]  # fmt: skip
    assert declared_parameters("island_build", text) == [
        "p_player_id", "p_island_owner", "p_plot", "p_building_type", "p_action_uid", "p_price",
    ]  # fmt: skip
    assert declared_parameters("island_upgrade", text) == [
        "p_player_id", "p_island_owner", "p_plot", "p_action_uid", "p_prices", "p_unlocked_level",
    ]  # fmt: skip
    assert declared_parameters("island_hire", text) == [
        "p_player_id", "p_crew", "p_action_uid", "p_price", "p_max",
    ]  # fmt: skip
    assert declared_parameters("island_captain", text) == [
        "p_player_id", "p_action_uid", "p_prices", "p_unlocked_level",
    ]  # fmt: skip
    assert declared_parameters("pp_build", text) == [
        "p_player_id", "p_spot", "p_kind", "p_action_uid", "p_price",
    ]  # fmt: skip
    assert declared_parameters("pp_upgrade", text) == [
        "p_player_id", "p_spot", "p_kind", "p_action_uid", "p_prices", "p_unlocked_level",
    ]  # fmt: skip
    assert find_direction("crew_hire") == "spend"
    assert find_direction("captain_upgrade") == "spend"


def test_the_functions_take_exactly_the_arguments_the_server_sends():
    assert declared_parameters("island_open") == ["p_player_id", "p_code", "p_starting_coins"]
    assert declared_parameters("wave_finish") == [
        "p_player_id", "p_wave_id", "p_survived", "p_ships_sunk",
        "p_loot_base", "p_loot_per_wave", "p_loot_per_house",
    ]  # fmt: skip
    assert declared_parameters("wave_start") == [
        "p_player_id", "p_action_uid", "p_place", "p_island_owner", "p_seed",
        "p_countdown_seconds", "p_minimum_seconds", "p_maximum_seconds", "p_highest_wave",
        "p_weather_kind", "p_weather_ships", "p_weather_fog",
    ]  # fmt: skip


def test_the_loot_is_paid_with_pirate_loot_and_the_starting_coins_with_their_own_reason():
    text = migration_text()

    assert "'pirate_loot', 'wave:' || v_run.id::text" in text
    assert "'starting_coins', 'starting_coins'" in text
    assert find_direction("pirate_loot") == "earn"
    assert find_direction("starting_coins") == "earn"
    assert find_direction("fresh_start") == "either"


def test_the_weather_kinds_and_the_seed_fit_the_table_rules():
    text = migration_text()

    assert "weather_kind in ('storm', 'fog', 'rain', 'calm')" in text
    assert SEED_LIMIT == 2**31  # the seed column is an integer from 0 to 2147483647


def test_the_shared_wave_functions_take_exactly_the_arguments_the_server_sends():
    text = CREWS.read_text()

    assert declared_parameters("wave_join", text) == ["p_player_id", "p_wave_id"]
    assert declared_parameters("wave_current", text) == ["p_place", "p_island_owner"]
    assert declared_parameters("wave_finish", text) == [
        "p_player_id", "p_wave_id", "p_survived", "p_ships_sunk",
        "p_loot_base", "p_loot_per_wave", "p_loot_per_house", "p_point_loot_base",
    ]  # fmt: skip
    assert declared_parameters("wave_start", text) == declared_parameters("wave_start")
    assert "'pirate_loot',\n        'wave:' || v_run.id::text || ':' || p_player_id::text" in text


def test_the_shared_waves_do_not_change_the_applied_migration():
    # 20261110010000 is applied live; its bytes must never change (md5 of the applied file).
    assert hashlib.md5(MIGRATION.read_bytes()).hexdigest() == APPLIED_MD5


def test_pirate_point_pays_its_own_base_and_no_houses():
    loot = load_island().loot

    assert loot.pirate_point_base == 40  # 40 + 10 per wave since the faster pace of 11 Nov
    assert rules.loot_cap(loot, 1, 2, pirate_point=True) == 50


@pytest.mark.parametrize(("wave", "loot"), [(30, 325), (31, 329), (40, 365), (100, 605)])
def test_the_loot_grows_four_a_wave_past_wave_thirty(wave, loot):
    # GAME-V3 section 4: 100 waves, and the coins stay worth something (the prices do not grow).
    catalogue = load_island()

    assert rules.loot_cap(catalogue.loot, wave, 0) == loot
    base, per_wave, point_base = rules.loot_rates(catalogue.loot, wave)
    assert base + per_wave * wave == loot  # the line wave_finish draws, with plain arguments
    assert (
        rules.loot_cap(catalogue.loot, wave, 0, pirate_point=True) == point_base + per_wave * wave
    )
    assert rules.loot_rates(catalogue.loot, 12) == (25, 10, 40)
