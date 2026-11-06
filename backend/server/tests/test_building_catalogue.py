"""Tests for game/building_catalogue.py: the list of buildings, loaded from buildings.json.

Nothing here uses the network or a database. The real file is read for the facts that the team
agreed on (five spots, 300 coins and 10 timber, 20 timber to start). Every rule of the loader is
tested with a small copy of the real file that has exactly one mistake.

Used by: pytest (cd backend && uv run pytest).
"""

import copy
import json
import logging
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from server.app import create_app
from server.game import building_catalogue
from server.game.building_catalogue import (
    CONTENT_FILE,
    MAX_SPOTS,
    BuildingCatalogue,
    BuildingsFileError,
    Cost,
    catalogue_or_none,
    load_buildings,
)
from server.routes.content import PUBLIC_CONTENT
from server.tests.helpers import CONFIGURED_SETTINGS, assert_error
from server.wallet import MAX_DELTA

WORKSHOP = 1  # the position of the workshop in the "spots" list of the file
WINDMILL = 2
SIGNAL_STATION = 4


def real_data() -> dict:
    """The real buildings.json as plain data, so a test can break one thing in a copy."""
    return copy.deepcopy(json.loads(CONTENT_FILE.read_text(encoding="utf-8")))


def write_data(tmp_path: Path, data: object) -> Path:
    path = tmp_path / "buildings.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


def problem_in(tmp_path: Path, data: object) -> str:
    """Load a file that must be refused, and return the message that says what is wrong."""
    with pytest.raises(BuildingsFileError) as error:
        load_buildings(write_data(tmp_path, data))
    return str(error.value)


def spot_for(catalogue: BuildingCatalogue, plot: str):
    return next(spot for spot in catalogue.spots if spot.plot == plot)


# --- the real file ---


def test_the_real_buildings_file_loads_with_five_spots_in_registry_order():
    catalogue = load_buildings()

    assert [spot.plot for spot in catalogue.spots] == [
        "plot_1",
        "plot_2",
        "plot_3",
        "plot_4",
        "islet_signal_station",
    ]
    assert [spot.building_type for spot in catalogue.spots] == [
        "cabin",
        "workshop",
        "windmill",
        "greenhouse",
        "signal_station",
    ]


def test_level_one_costs_300_coins_and_10_timber_and_the_starter_pack_is_20():
    catalogue = load_buildings()

    assert len(catalogue.price_list) == 1
    assert catalogue.price_list[0].level == 1
    assert catalogue.price_list[0].cost == Cost(coins=300, timber=10)
    assert catalogue.starter_timber == 20


def test_the_cabin_stands_from_the_start_and_is_not_buildable():
    cabin = spot_for(load_buildings(), "plot_1")

    assert cabin.stands_from_start is True
    assert cabin.buildable is False
    assert cabin.locked_note is None


def test_only_the_workshop_and_the_signal_station_can_be_built_for_now():
    catalogue = load_buildings()

    assert spot_for(catalogue, "plot_2").buildable is True
    assert spot_for(catalogue, "islet_signal_station").buildable is True
    assert spot_for(catalogue, "plot_3").buildable is False
    assert spot_for(catalogue, "plot_4").buildable is False


def test_a_flag_that_is_left_out_means_the_spot_does_not_stand_from_the_start():
    assert spot_for(load_buildings(), "plot_2").stands_from_start is False


def test_the_windmill_and_the_greenhouse_say_why_they_are_locked():
    catalogue = load_buildings()

    assert "timber starts washing up" in spot_for(catalogue, "plot_3").locked_note
    assert "timber starts washing up" in spot_for(catalogue, "plot_4").locked_note


def test_exactly_one_signal_station_stands_on_islet_signal_station():
    stations = [spot for spot in load_buildings().spots if spot.building_type == "signal_station"]

    assert len(stations) == 1
    assert stations[0].plot == "islet_signal_station"


def test_the_play_money_note_says_there_is_no_cash_value():
    assert load_buildings().play_money_note == (
        "Play money. No cash value. It cannot be bought or cashed out."
    )


def test_the_buildings_file_is_not_served_to_the_browser():
    # The browser gets everything through GET /api/islet (decision D016). The file stays on the
    # server, so it must never be on the list of public content.
    assert "buildings.json" not in PUBLIC_CONTENT.values()

    response = TestClient(create_app(CONFIGURED_SETTINGS)).get("/api/content/buildings")

    assert_error(response, 404, "content_not_found")


# --- the rules of the loader: each test breaks exactly one thing ---


@pytest.mark.parametrize("name", ["plot", "type"])
def test_two_spots_with_the_same_plot_or_type_are_refused(tmp_path, name):
    data = real_data()
    data["spots"][WINDMILL][name] = data["spots"][WORKSHOP][name]

    message = problem_in(tmp_path, data)

    assert f"'{name}'" in message
    assert "share" in message


@pytest.mark.parametrize("coins", [0, -5, MAX_DELTA + 1, 1.5, True, "300", None])
def test_a_price_of_zero_or_above_the_wallet_limit_is_refused(tmp_path, coins):
    data = real_data()
    data["priceList"][0]["coins"] = coins

    message = problem_in(tmp_path, data)

    assert "priceList[0]" in message
    assert "'coins'" in message


def test_a_price_of_exactly_the_wallet_limit_is_allowed(tmp_path):
    data = real_data()
    data["priceList"][0]["coins"] = MAX_DELTA

    catalogue = load_buildings(write_data(tmp_path, data))

    assert catalogue.price_list[0].cost.coins == MAX_DELTA


@pytest.mark.parametrize("timber", [-1, 2.5, True, "10", None, 1001])
def test_negative_or_fractional_or_boolean_timber_is_refused(tmp_path, timber):
    data = real_data()
    data["priceList"][0]["timber"] = timber

    message = problem_in(tmp_path, data)

    assert "priceList[0]" in message
    assert "'timber'" in message


@pytest.mark.parametrize("timber", [-1, 20.5, 20.0, True, "20", None, 101])
def test_negative_or_fractional_or_boolean_starter_timber_is_refused(tmp_path, timber):
    data = real_data()
    data["starterTimber"] = timber

    assert "'starterTimber'" in problem_in(tmp_path, data)


@pytest.mark.parametrize("timber", [0, 100])
def test_the_smallest_and_the_biggest_starter_pack_are_allowed(tmp_path, timber):
    data = real_data()
    data["starterTimber"] = timber

    assert load_buildings(write_data(tmp_path, data)).starter_timber == timber


def test_a_locked_spot_without_a_locked_note_is_refused(tmp_path):
    data = real_data()
    del data["spots"][WINDMILL]["lockedNote"]

    message = problem_in(tmp_path, data)

    assert f"spots[{WINDMILL}]" in message
    assert "'lockedNote'" in message


def test_a_spot_that_is_buildable_needs_no_locked_note(tmp_path):
    data = real_data()
    assert "lockedNote" not in data["spots"][WORKSHOP]

    catalogue = load_buildings(write_data(tmp_path, data))

    assert spot_for(catalogue, "plot_2").locked_note is None


def test_a_spot_that_stands_from_the_start_cannot_also_be_buildable(tmp_path):
    data = real_data()
    data["spots"][0]["buildable"] = True

    message = problem_in(tmp_path, data)

    assert "spots[0]" in message
    assert "'buildable'" in message


@pytest.mark.parametrize("name", ["plot", "type"])
@pytest.mark.parametrize("value", ["Plot_2", "plot 2", "plot-2", "x", "a" * 41, "", None, 7])
def test_an_id_with_capitals_or_spaces_is_refused(tmp_path, name, value):
    data = real_data()
    data["spots"][WORKSHOP][name] = value

    message = problem_in(tmp_path, data)

    assert f"spots[{WORKSHOP}]" in message
    assert f"'{name}'" in message


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("plotName", ""),
        ("plotName", "x"),
        ("plotName", "n" * 41),
        ("name", "   "),
        ("name", "n" * 41),
        ("about", ""),
        ("about", "a" * 161),
        ("lockedNote", ""),
        ("lockedNote", "l" * 161),
    ],
)
def test_texts_that_are_empty_or_too_long_are_refused(tmp_path, name, value):
    data = real_data()
    data["spots"][WINDMILL][name] = value

    message = problem_in(tmp_path, data)

    assert f"spots[{WINDMILL}]" in message
    assert f"'{name}'" in message


@pytest.mark.parametrize("name", ["about", "playMoneyNote"])
def test_the_file_needs_an_about_text_and_a_play_money_note(tmp_path, name):
    data = real_data()
    data[name] = "  "

    assert f"'{name}'" in problem_in(tmp_path, data)


@pytest.mark.parametrize("name", ["standsFromStart", "buildable"])
def test_the_two_flags_must_be_true_or_false(tmp_path, name):
    data = real_data()
    data["spots"][WORKSHOP][name] = "yes"

    message = problem_in(tmp_path, data)

    assert f"spots[{WORKSHOP}]" in message
    assert f"'{name}'" in message


def test_a_spot_must_say_whether_it_is_buildable(tmp_path):
    data = real_data()
    del data["spots"][WORKSHOP]["buildable"]

    assert "'buildable'" in problem_in(tmp_path, data)


@pytest.mark.parametrize(
    "price_list",
    [
        [],
        [{"level": 1, "coins": 300, "timber": 10}, {"level": 2, "coins": 900, "timber": 20}],
        [{"level": 2, "coins": 900, "timber": 20}],
        "none",
    ],
)
def test_the_price_list_has_exactly_one_entry_and_it_is_for_level_one(tmp_path, price_list):
    data = real_data()
    data["priceList"] = price_list

    assert "priceList" in problem_in(tmp_path, data)


@pytest.mark.parametrize("count", [0, MAX_SPOTS + 1])
def test_a_file_with_no_spots_or_too_many_is_refused(tmp_path, count):
    data = real_data()
    data["spots"] = (data["spots"] * 3)[:count]

    assert "'spots'" in problem_in(tmp_path, data)


def test_the_signal_station_must_stand_on_islet_signal_station(tmp_path):
    data = real_data()
    data["spots"][SIGNAL_STATION]["plot"] = "islet_beacon"

    message = problem_in(tmp_path, data)

    assert "signal_station" in message
    assert "islet_signal_station" in message


def test_a_file_without_a_signal_station_is_refused(tmp_path):
    data = real_data()
    del data["spots"][SIGNAL_STATION]

    assert "signal_station" in problem_in(tmp_path, data)


def test_a_missing_file_is_a_clear_error_that_names_the_file(tmp_path):
    with pytest.raises(BuildingsFileError) as error:
        load_buildings(tmp_path / "buildings.json")

    assert "buildings.json" in str(error.value)


@pytest.mark.parametrize("text", ["not json at all", "[]", "7", '"text"'])
def test_a_file_that_is_not_a_json_object_is_refused(tmp_path, text):
    path = tmp_path / "buildings.json"
    path.write_text(text, encoding="utf-8")

    with pytest.raises(BuildingsFileError) as error:
        load_buildings(path)

    assert "buildings.json" in str(error.value)


def test_a_spot_that_is_not_an_object_is_refused(tmp_path):
    data = real_data()
    data["spots"][WORKSHOP] = "workshop"

    assert f"spots[{WORKSHOP}]" in problem_in(tmp_path, data)


def test_a_broken_file_names_the_entry_and_the_field(tmp_path):
    data = real_data()
    data["spots"][3]["name"] = ""

    message = problem_in(tmp_path, data)

    assert message.startswith("spots[3]: 'name'")


def test_catalogue_or_none_returns_the_catalogue_for_the_real_file():
    assert isinstance(catalogue_or_none(), BuildingCatalogue)


def test_catalogue_or_none_returns_none_for_a_broken_file(monkeypatch, caplog):
    def broken(path=CONTENT_FILE):
        raise BuildingsFileError("spots[0]: 'plot' must be text that is not empty.")

    monkeypatch.setattr(building_catalogue, "load_buildings", broken)

    with caplog.at_level(logging.ERROR):
        result = catalogue_or_none()

    assert result is None
    assert "spots[0]: 'plot'" in caplog.text
