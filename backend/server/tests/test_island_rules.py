"""Tests for island/catalogue.py, codes.py and rules.py, and that Python and the migration agree.

The numbers are the economy table of docs/BUILD-PLAN.md section 3.2 and the spots of 3.3: a test
here fails if islands.json drifts from the contract the frontend lanes build against.

Used by: pytest (cd backend && uv run pytest).
"""

import hashlib
import json
import re

import pytest

from server.game.building_catalogue import load_buildings
from server.island import codes, rules
from server.island.catalogue import CONTENT_FILE, IslandFileError, load_island
from server.island.waves import SEED_LIMIT
from server.tests.helpers import REPO_ROOT
from server.wallet import find_direction

MIGRATION = REPO_ROOT / "supabase" / "migrations" / "20261110010000_islands_and_waves.sql"
CREWS = REPO_ROOT / "supabase" / "migrations" / "20261110020000_wave_crews.sql"
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

    assert catalogue.starting_coins == 100
    assert {kind.kind: kind.coins for kind in catalogue.kinds} == {
        "wall": 10,
        "cannon": 30,
        "watchtower": 40,
        "house": 50,
    }


def test_the_spots_are_the_spots_of_the_contract():
    spots = [(spot.id, spot.kind) for spot in load_island().spots]

    assert spots == [
        ("wall_1", "wall"), ("wall_2", "wall"), ("wall_3", "wall"), ("wall_4", "wall"),
        ("cannon_1", "cannon"), ("cannon_2", "cannon"), ("cannon_3", "cannon"),
        ("cannon_4", "cannon"), ("tower_1", "watchtower"), ("house_1", "house"),
        ("house_2", "house"),
    ]  # fmt: skip


@pytest.mark.parametrize(("wave", "houses", "loot"), [(1, 0, 15), (3, 0, 25), (3, 2, 35)])
def test_the_loot_is_ten_plus_five_per_wave_plus_five_per_house(wave, houses, loot):
    assert rules.loot_cap(load_island().loot, wave, houses) == loot


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
        (lambda data: data["kinds"][0].update(coins=True), "coins"),
        (lambda data: data["spots"][0].update(kind="moat"), "not in 'kinds'"),
        (lambda data: data["spots"].append({"id": "wall_1", "kind": "wall"}), "same 'id'"),
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
    spot, price = rules.check_build(load_island(), "tower_1", "watchtower", set())

    assert (spot.id, price) == ("tower_1", 40)


def test_the_spots_are_planned_in_file_order_with_their_state():
    plans = rules.plan_spots(load_island(), {"wall_2", "plot_3"})

    assert [plan.id for plan in plans if plan.built] == ["wall_2"]
    assert len(plans) == 11


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


def test_the_check_rule_allows_the_old_pairs_and_every_island_spot():
    check = re.search(
        r"add constraint islet_buildings_plot_fits_building(.*?)\)\);", migration_text(), re.DOTALL
    ).group(1)
    pairs = set(re.findall(r"\('([a-z0-9_]+)',\s*'([a-z0-9_]+)'\)", check))

    old = {(s.plot, s.building_type) for s in load_buildings().spots if not s.stands_from_start}
    new = {(spot.id, spot.kind) for spot in load_island().spots}
    assert pairs == old | new


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

    assert loot.pirate_point_base == 20
    assert rules.loot_cap(loot, 1, 2, pirate_point=True) == 25
