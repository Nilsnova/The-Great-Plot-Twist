"""Tests for the case data loader (game/case_data.py) and the load-time checks on the real file.

The real file is backend/content/secret/case.json. These tests load it into frozen data, count the
routes of the 23 Nov minimum, run every load-time rule on it and prove that a broken file is
refused with the rule number and the place, never with a line of the story.

The API half of "a broken case file makes the case unavailable" (503 case_unavailable while
/api/health keeps answering) needs case_or_none and the routes. It lands with the service slice.

Used by: pytest, with the other tests in backend/server/tests/.
"""

import json
from collections import Counter
from dataclasses import FrozenInstanceError

import pytest

from plot_twist.engine import CONTENT_DIR
from server.game.case_checks import run_checks
from server.game.case_data import (
    CASE_PATH,
    MINIMUM_ROUTE_KINDS,
    CaseData,
    CaseDataError,
    load_case,
    parse_case,
)
from server.routes.content import PUBLIC_CONTENT
from server.tests.case_data_helpers import card_of, raw_case, route_of


@pytest.fixture(scope="module")
def data() -> CaseData:
    return load_case()


# ---- The real file loads into frozen data ---------------------------------------------------


def test_the_real_case_file_loads_into_frozen_data(data):
    assert isinstance(data, CaseData)
    assert (data.format_version, data.case_id) == (1, "false_light")
    assert [card.id for card in data.cards] == [f"C{number}" for number in range(1, 9)]
    assert [deduction.id for deduction in data.deductions] == ["D1", "D2", "D3", "D4"]
    assert len(data.kits) == 4
    assert len(data.entry_profiles) == 8
    assert len(data.routes) == 19

    with pytest.raises(FrozenInstanceError):
        data.case_id = "another_case"  # type: ignore[misc]
    with pytest.raises(FrozenInstanceError):
        data.cards[0].title = "Another title"  # type: ignore[misc]
    with pytest.raises(FrozenInstanceError):
        data.cards[0].routes[0].coins = 99  # type: ignore[misc]


def test_every_list_is_a_tuple_and_every_mapping_is_read_only(data):
    assert isinstance(data.cards, tuple)
    assert isinstance(data.cards[0].routes, tuple)
    assert isinstance(data.cards[0].opens_after, tuple)
    assert isinstance(data.night.lights, tuple)

    with pytest.raises(TypeError):
        data.board.lines["wrong_pair"] = "Changed."  # type: ignore[index]
    with pytest.raises(TypeError):
        data.raw["case_id"] = "another_case"  # type: ignore[index]
    with pytest.raises(TypeError):
        data.raw["cards"][0]["title"] = "Changed."  # type: ignore[index]


def test_the_case_file_is_read_from_the_secret_folder_and_is_never_a_public_name(data):
    assert CASE_PATH == CONTENT_DIR / "secret" / "case.json"
    assert CASE_PATH.is_file()
    assert "case.json" not in PUBLIC_CONTENT.values()
    assert all("secret" not in filename for filename in PUBLIC_CONTENT.values())


def test_the_loader_reads_the_values_the_case_rules_need(data):
    low_tide = data.window("low_tide")
    assert (low_tide.every_minutes, low_tide.from_minute, low_tide.open_minutes) == (20, 12, 8)
    assert "{minutes}" in low_tide.closed_line

    cave = data.route("C4.low_tide_cave")
    assert (cave.card_id, cave.kind, cave.open_when, cave.timer_minutes) == (
        "C4",
        "timed",
        "low_tide",
        5,
    )
    assert data.route("C2.radio_words").starts_in_journal is True
    assert data.route("C6.shareholder_register").needs_share == "greyfathom-salvage"
    assert data.card("C5").opens_after == ("D2",)
    assert data.card("C5").closed_line

    assert data.deduction("D1").cards == ("C1", "C2")
    assert data.deduction("D1").opens == ("nightfall",)
    assert data.board.wrong_pair_wait_seconds == 30
    assert data.night.lock_seconds == 90
    assert data.night.tolerance_degrees == 5
    assert data.night.chart.fog_center == (250, 40)
    assert data.accusation.wrong_wait_seconds == 60
    assert data.accusation.needs_deductions == ("D2", "D3", "D4")
    assert data.rewards.coin("solve_share").maximum == 800
    assert data.partners.kit_order == ("informant", "stranger", "true_keeper", "witness")
    assert data.reveal.order[-3:] == ("closing_line", "log_reader_line", "last_beat")
    assert set(data.reveal.closing_lines) == {kit.id for kit in data.kits}


def test_a_route_label_is_optional_and_empty_until_the_data_sets_one(data):
    assert all(route.label is None or route.label.strip() for route in data.routes)

    raw = raw_case()
    route_of(raw, "C1.notice_board")["label"] = "Read the notice"
    labelled = parse_case(raw)

    assert labelled.route("C1.notice_board").label == "Read the notice"


# ---- The 23 Nov minimum ---------------------------------------------------------------------


def test_the_minimum_has_12_routes_4_kit_4_open_4_timed(data):
    kinds = Counter(route.kind for route in data.active_routes)

    assert MINIMUM_ROUTE_KINDS == ("kit", "open", "timed")
    assert len(data.active_routes) == 12
    assert kinds == {"kit": 4, "open": 4, "timed": 4}


def test_the_routes_of_later_kinds_stay_in_the_data_so_that_ids_keep_their_meaning(data):
    later = [route for route in data.routes if route.kind not in MINIMUM_ROUTE_KINDS]

    assert len(later) == 7
    assert Counter(route.kind for route in later) == {
        "paid": 4,
        "share": 1,
        "world": 1,
        "log_reader": 1,
    }
    assert data.route("C8.log_reader") is not None
    assert data.route("C8.log_reader") not in data.active_routes


def test_the_minimum_lights_are_the_three_of_tier_must(data):
    assert [light.id for light in data.active_lights] == [
        "keepers_lamp",
        "harbor_light",
        "islet_signal_station",
    ]
    assert [light.id for light in data.night.lights if light.tier != "must"] == ["ruin_light"]


# ---- Load-time checks -----------------------------------------------------------------------


def test_load_time_checks_pass_on_the_real_file(data):
    run_checks(data)


# ---- A broken file is refused with the rule and the place, never with the story -------------


def test_a_file_that_is_not_json_is_refused_as_a_loading_problem(tmp_path):
    broken_file = tmp_path / "case.json"
    broken_file.write_text("{ this is not json", encoding="utf-8")

    with pytest.raises(CaseDataError) as caught:
        load_case(broken_file)

    assert caught.value.rule == "L1"
    assert caught.value.place == "case.json"


def test_a_missing_file_is_refused_as_a_loading_problem(tmp_path):
    with pytest.raises(CaseDataError) as caught:
        load_case(tmp_path / "case.json")

    assert caught.value.rule == "L1"


def test_a_json_object_that_repeats_a_key_is_refused(tmp_path):
    repeated = tmp_path / "case.json"
    repeated.write_text('{"windows": {"low_tide": {}, "low_tide": {}}}', encoding="utf-8")

    with pytest.raises(CaseDataError) as caught:
        load_case(repeated)

    assert caught.value.rule == "L2"


def test_a_file_that_is_not_an_object_is_refused(tmp_path):
    listing = tmp_path / "case.json"
    listing.write_text(json.dumps(["not", "an", "object"]), encoding="utf-8")

    with pytest.raises(CaseDataError) as caught:
        load_case(listing)

    assert caught.value.rule == "L1"


def test_a_missing_field_is_refused_and_the_place_names_it():
    raw = raw_case()
    del route_of(raw, "C3.key_tag")["kind"]

    with pytest.raises(CaseDataError) as caught:
        parse_case(raw)

    assert caught.value.rule == "L1"
    assert caught.value.place == "cards[2].routes[0]"
    assert "kind" in caught.value.problem


def test_a_field_of_the_wrong_type_is_refused():
    raw = raw_case()
    card_of(raw, "C1")["opens_after"] = "D1"

    with pytest.raises(CaseDataError) as caught:
        parse_case(raw)

    assert caught.value.rule == "L1"
    assert caught.value.place == "cards[0]"


def test_a_number_that_is_really_a_bool_is_refused():
    raw = raw_case()
    route_of(raw, "C1.notice_board")["timer_minutes"] = True

    with pytest.raises(CaseDataError):
        parse_case(raw)


def test_the_error_says_the_rule_and_the_place_and_nothing_else():
    error = CaseDataError("L4", "cards[1].routes[0]", "the route sits at another card's hotspot")

    assert (error.rule, error.place) == ("L4", "cards[1].routes[0]")
    assert str(error) == "L4 at cards[1].routes[0]: the route sits at another card's hotspot"
    assert isinstance(error, ValueError)
