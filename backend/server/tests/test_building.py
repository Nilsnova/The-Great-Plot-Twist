"""Tests for game/building.py: the pure rules of the home islet.

No network, no database, no clock. The rules take plain values (the catalogue from
buildings.json, the buildings that stand, the coins and the timber) and give plain values back.
The real buildings file is used, so these tests also say what a new player can do: 1,000 coins and
20 timber build the signal station and the workshop.

Used by: pytest (cd backend && uv run pytest).
"""

import logging
from dataclasses import replace
from datetime import UTC, datetime

import pytest

from server.errors import ApiError
from server.game import building
from server.game.building import (
    BUILT,
    EMPTY,
    LOCKED,
    BuildRefused,
    StandingBuilding,
    check_build,
    find_spot,
    has_signal_station,
    level_one_cost,
    missing_for,
    plan_islet,
    plan_spot,
)
from server.game.building_catalogue import Cost, PriceStep, load_buildings

CATALOGUE = load_buildings()
LEVEL_ONE = Cost(coins=300, timber=10)
BUILT_AT = datetime(2026, 11, 16, 10, 0, tzinfo=UTC)

STATION = StandingBuilding("islet_signal_station", "signal_station", 1, BUILT_AT)
WORKSHOP = StandingBuilding("plot_2", "workshop", 1, BUILT_AT)


def refusal_of(plot: str, building_type: str) -> BuildRefused:
    """Ask check_build for a build that must be refused, and return the refusal."""
    with pytest.raises(BuildRefused) as refused:
        check_build(CATALOGUE, plot, building_type)
    return refused.value


def plan_for(plot: str, standing: list[StandingBuilding], coins: int = 1000, timber: int = 20):
    """The plan of one spot of the islet."""
    islet = plan_islet(CATALOGUE, standing, coins, timber)
    return next(plan for plan in islet.spots if plan.spot.plot == plot)


# --- check_build: what may be built where ---


def test_a_refusal_is_an_api_error_so_a_route_answers_in_the_standard_shape():
    assert isinstance(refusal_of("plot_9", "workshop"), ApiError)


def test_an_unknown_plot_is_404_no_such_plot():
    refused = refusal_of("plot_9", "workshop")

    assert (refused.status_code, refused.code) == (404, "no_such_plot")


def test_find_spot_returns_the_spot_of_a_plot_and_refuses_an_unknown_plot():
    assert find_spot(CATALOGUE, "plot_3").building_type == "windmill"

    with pytest.raises(BuildRefused) as refused:
        find_spot(CATALOGUE, "plot_9")
    assert refused.value.code == "no_such_plot"


def test_an_unknown_type_is_404_no_such_building():
    refused = refusal_of("plot_2", "castle")

    assert (refused.status_code, refused.code) == (404, "no_such_building")


def test_a_building_on_another_plot_is_422_wrong_plot():
    refused = refusal_of("plot_2", "windmill")

    assert (refused.status_code, refused.code) == (422, "wrong_plot")
    assert "windmill" in refused.message


def test_the_cabin_plot_is_409_plot_occupied():
    refused = refusal_of("plot_1", "cabin")

    assert (refused.status_code, refused.code) == (409, "plot_occupied")
    assert refused.message == "Your cabin already stands here."


@pytest.mark.parametrize(
    ("plot", "building_type"), [("plot_3", "windmill"), ("plot_4", "greenhouse")]
)
def test_the_windmill_and_the_greenhouse_are_409_not_buildable_yet(plot, building_type):
    refused = refusal_of(plot, building_type)

    assert (refused.status_code, refused.code) == (409, "not_buildable_yet")
    assert refused.message == find_spot(CATALOGUE, plot).locked_note


@pytest.mark.parametrize(
    ("plot", "building_type"), [("islet_signal_station", "signal_station"), ("plot_2", "workshop")]
)
def test_the_station_and_the_workshop_cost_the_level_one_price(plot, building_type):
    spot, cost = check_build(CATALOGUE, plot, building_type)

    assert spot.plot == plot
    assert cost == LEVEL_ONE


def test_refusals_come_in_the_documented_order():
    # 1. the plot, 2. the type, 3. the pair, 4. the cabin, 5. a spot that is not buildable yet.
    asked = [
        ("plot_9", "castle"),  # both are unknown: the plot is named first
        ("plot_2", "castle"),  # a known plot, an unknown type
        ("plot_1", "workshop"),  # the pair is wrong, although the cabin plot is taken too
        ("plot_1", "cabin"),
        ("plot_3", "windmill"),
    ]

    codes = [refusal_of(plot, building_type).code for plot, building_type in asked]

    assert codes == [
        "no_such_plot",
        "no_such_building",
        "wrong_plot",
        "plot_occupied",
        "not_buildable_yet",
    ]


def test_the_level_one_cost_is_300_coins_and_10_timber():
    assert level_one_cost(CATALOGUE) == LEVEL_ONE


# --- missing_for: what is short ---


@pytest.mark.parametrize(
    ("coins", "timber", "expected"),
    [
        (1000, 20, ()),
        (299, 20, ("coins",)),
        (1000, 9, ("timber",)),
        (0, 0, ("coins", "timber")),
    ],
)
def test_missing_names_coins_timber_or_both(coins, timber, expected):
    assert missing_for(LEVEL_ONE, coins, timber) == expected


def test_exactly_300_coins_and_10_timber_is_enough():
    assert missing_for(LEVEL_ONE, 300, 10) == ()
    assert plan_for("plot_2", [], coins=300, timber=10).can_build is True


# --- plan_islet and plan_spot: what the player sees ---


def test_a_new_islet_shows_the_cabin_standing_two_spots_empty_and_two_locked():
    islet = plan_islet(CATALOGUE, [], 0, 20)

    assert [plan.state for plan in islet.spots] == [BUILT, EMPTY, LOCKED, LOCKED, EMPTY]


def test_the_plan_keeps_the_order_of_the_spots_in_the_file():
    islet = plan_islet(CATALOGUE, [STATION], 1000, 20)

    assert [plan.spot.plot for plan in islet.spots] == [spot.plot for spot in CATALOGUE.spots]


def test_a_new_player_with_1000_coins_can_build_the_station_and_the_workshop():
    islet = plan_islet(CATALOGUE, [], 1000, 20)

    can_build = {plan.spot.plot: plan.can_build for plan in islet.spots}
    assert can_build == {
        "plot_1": False,
        "plot_2": True,
        "plot_3": False,
        "plot_4": False,
        "islet_signal_station": True,
    }


def test_the_plan_carries_the_coins_and_the_timber_of_the_player():
    islet = plan_islet(CATALOGUE, [], 640, 7)

    assert (islet.coins, islet.timber) == (640, 7)


def test_an_empty_spot_shows_its_cost_and_what_is_missing():
    plan = plan_for("plot_2", [], coins=120, timber=4)

    assert plan.state == EMPTY
    assert plan.cost == LEVEL_ONE
    assert plan.missing == ("coins", "timber")
    assert plan.can_build is False


def test_a_locked_spot_shows_its_cost_but_misses_nothing_and_cannot_be_built():
    plan = plan_for("plot_3", [], coins=0, timber=0)

    assert plan.state == LOCKED
    assert plan.cost == LEVEL_ONE
    assert plan.missing == ()
    assert plan.can_build is False


def test_the_cabin_stands_with_no_level_no_time_and_no_cost():
    plan = plan_for("plot_1", [])

    assert plan.state == BUILT
    assert (plan.level, plan.built_at, plan.cost) == (None, None, None)
    assert plan.missing == ()
    assert plan.can_build is False


def test_a_built_plot_shows_its_level_and_time_and_cannot_be_built():
    plan = plan_for("plot_2", [WORKSHOP], coins=1000, timber=20)

    assert plan.state == BUILT
    assert plan.level == 1
    assert plan.built_at == BUILT_AT
    assert plan.cost is None
    assert plan.missing == ()
    assert plan.can_build is False


def test_plan_spot_works_on_one_spot_with_the_building_that_stands_on_it():
    spot = find_spot(CATALOGUE, "plot_2")

    empty = plan_spot(CATALOGUE, spot, None, 1000, 20)
    built = plan_spot(CATALOGUE, spot, WORKSHOP, 1000, 20)

    assert (empty.state, built.state) == (EMPTY, BUILT)


def test_a_row_for_an_unknown_plot_is_skipped(caplog):
    stray = StandingBuilding("plot_77", "workshop", 1, BUILT_AT)

    with caplog.at_level(logging.WARNING):
        islet = plan_islet(CATALOGUE, [stray], 1000, 20)

    assert [plan.state for plan in islet.spots] == [BUILT, EMPTY, LOCKED, LOCKED, EMPTY]
    assert "plot_77" in caplog.text


def test_the_plan_says_whether_the_signal_station_stands():
    assert plan_islet(CATALOGUE, [WORKSHOP], 0, 0).signal_station_built is False
    assert plan_islet(CATALOGUE, [WORKSHOP, STATION], 0, 0).signal_station_built is True


def test_has_signal_station_is_true_only_with_a_station():
    assert has_signal_station([]) is False
    assert has_signal_station([WORKSHOP]) is False
    assert has_signal_station([STATION]) is True
    assert has_signal_station([WORKSHOP, STATION]) is True


# --- the prices belong to the file, not to the code ---


def test_prices_come_from_the_catalogue_not_from_the_code():
    cheap = replace(CATALOGUE, price_list=(PriceStep(level=1, cost=Cost(coins=7, timber=3)),))

    _spot, cost = check_build(cheap, "plot_2", "workshop")
    plan = plan_islet(cheap, [], 7, 3).spots[1]

    assert level_one_cost(cheap) == Cost(7, 3)
    assert cost == Cost(7, 3)
    assert plan.cost == Cost(7, 3)
    assert plan.can_build is True


def test_the_signal_station_word_of_the_rules_is_the_one_the_loader_checks():
    assert building.SIGNAL_STATION == "signal_station"
