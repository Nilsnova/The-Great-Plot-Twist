"""Tests for the case timing program and the case files it reads.

The program is backend/tools/simulate_case.py. It plays "The Light That Shouldn't Be" on paper for
all 69 crews and checks the promised minutes (about 120 for four players, about 150 for one player
with three NPC partners). Its full run takes 15 to 20 seconds or more, so this file does not run it.
Run the whole program by hand before you change a minute, a window or a price:

    python3 -I backend/tools/simulate_case.py

These tests run the fast parts: the program finds its files, the data says what the decisions of
5 Nov 2026 say, and the crews that matter most still fit their minutes. They need no network.

Used by: pytest, with the other tests in backend/server/tests/.
"""

import copy
import importlib.util
import json
import sys
from pathlib import Path

import pytest

# This file is backend/server/tests/test_case_timing.py, so the backend folder is two levels up.
BACKEND = Path(__file__).resolve().parents[2]
PROGRAM = BACKEND / "tools" / "simulate_case.py"
FIRST_TIME_PACE = 1.5  # the program's pace for first-time crews
FOUR_PLAYER_BUDGET = 120  # minutes promised to four players with mixed endings
SOLO_BUDGET = 150  # minutes promised to one player with three partners


@pytest.fixture(scope="module")
def program():
    """The timing program, loaded from its file. It is a script, not a package."""
    spec = importlib.util.spec_from_file_location("simulate_case", PROGRAM)
    module = importlib.util.module_from_spec(spec)
    sys.modules["simulate_case"] = module
    try:
        spec.loader.exec_module(module)
        yield module
    finally:
        sys.modules.pop("simulate_case", None)


@pytest.fixture(scope="module")
def case(program):
    return program.load_json(program.CASE_FILE)


@pytest.fixture(scope="module")
def study(program, case):
    """One study for the whole file: it remembers every crew it has played."""
    return program.Study(case)


def minutes_of(study, program, kits):
    """Total minutes and budget of one crew at first-time pace, on free routes."""
    result = study.run(tuple(kits), FIRST_TIME_PACE, False)
    return program.whole(result["total"]), result["budget"]


# ---- The program finds its files ------------------------------------------------------------


def test_the_program_reads_the_case_and_the_partner_lines_from_backend_content(program):
    assert program.CASE_FILE == BACKEND / "content" / "secret" / "case.json"
    assert program.LINES_FILE == BACKEND / "content" / "partners.json"
    assert program.CASE_FILE.is_file()
    assert program.LINES_FILE.is_file()


def test_game_content_lives_in_backend_content_and_not_in_a_root_content_folder():
    assert not (BACKEND.parent / "content").exists()


def test_the_case_file_is_format_1_of_the_false_light_case(case):
    assert case["format_version"] == 1
    assert case["case_id"] == "false_light"


def test_no_text_in_the_case_data_names_a_real_person(program, case):
    text = json.dumps(case) + json.dumps(program.load_json(program.LINES_FILE))

    for name in ("Nils", "Claude", "Codex"):
        assert name not in text


# ---- The data says what the decisions of 5 Nov 2026 say -------------------------------------


def test_the_kit_order_in_the_data_is_the_one_the_program_uses(program, case):
    order = ("informant", "stranger", "true_keeper", "witness")

    assert tuple(case["partners"]["kit_order"]) == order
    assert program.NPC_KIT_ORDER == order


def test_the_shift_change_window_is_eight_minutes_wide(case):
    window = case["case_clock"]["windows"]["shift_change"]

    assert (window["every_minutes"], window["from_minute"], window["open_minutes"]) == (20, 0, 8)


def test_a_lens_can_be_made_before_d3_and_only_fitting_it_waits(case):
    ruin = next(light for light in case["night"]["lights"] if light["id"] == "ruin_light")

    assert ruin["ready"]["fit_after"] == ["D3"]
    assert "after" not in ruin["ready"]  # nothing else waits for D3, so the lens can be made early


def test_players_call_nightfall_after_d1_and_the_night_needs_three_lights(case):
    night = case["night"]

    assert night["opens_after"] == ["D1"]
    assert night["called_by"] == "player"
    assert night["lights_needed"] == 3


def test_the_third_light_is_a_home_signal_station_for_300_coins(case):
    lights = case["night"]["lights"]
    station = next(light for light in lights if light["id"] == "islet_signal_station")

    assert station["planning_price_coins"] == 300
    assert all(kit["home"] == "home_islet" for kit in case["kits"])  # every kit can build one


def test_case_rewards_use_the_foundation_wallet_reasons_and_start_every_ref_with_the_case_id(case):
    rewards = case["rewards"]
    reasons = {coin["reason"] for coin in rewards["coins"]} | {rewards["paid_routes"]["reason"]}
    refs = [coin["ref"] for coin in rewards["coins"]]
    refs += [rewards["paid_routes"]["player_ref"], rewards["paid_routes"]["partner_ref"]]

    assert reasons == {"clue_reward", "mystery_reward", "clue_purchase"}
    assert all(ref.startswith(case["case_id"] + ":") for ref in refs)


def test_the_share_route_names_a_company_that_is_on_the_island_exchange(case):
    companies_file = BACKEND / "content" / "market" / "companies.json"
    exchange = json.loads(companies_file.read_text(encoding="utf-8"))
    company_ids = {company["id"] for company in exchange["companies"]}
    shares = [
        route["needs_share"]
        for card in case["cards"]
        for route in card["routes"]
        if "needs_share" in route
    ]

    assert shares  # the share route exists, so there is something to check
    assert set(shares) <= company_ids


def test_the_relighting_has_a_lock_and_no_demo_world(case):
    relighting = case["relighting"]

    assert "relight_lock" in relighting
    assert "demo_world" not in relighting


# ---- The crews that matter most still fit their minutes -------------------------------------


def test_route_estimates_match_the_planning_formula(program, case):
    assert program.check_route_estimates(case) == []


def test_the_two_timetables_add_up_to_120_and_150_minutes(program, case):
    assert program.timetable_total(case, "crew_of_four") == FOUR_PLAYER_BUDGET
    assert program.timetable_total(case, "solo_with_three_partners") == SOLO_BUDGET


def test_every_crew_of_four_fits_its_minutes_at_first_time_pace(program, study):
    fours = [kits for kits in program.all_mixes() if len(kits) == 4]
    late = []
    for kits in fours:
        total, budget = minutes_of(study, program, kits)
        if total > budget:
            late.append((program.mix_label(kits), total, budget))

    assert len(fours) == 35
    assert late == []


@pytest.mark.parametrize("kit", ["true_keeper", "witness", "informant", "stranger"])
def test_a_solo_player_with_three_partners_fits_150_minutes(program, study, kit):
    total, budget = minutes_of(study, program, [kit])

    assert budget == SOLO_BUDGET
    assert total <= budget


def test_a_shift_change_window_of_five_minutes_would_break_three_crews_of_four(program, case):
    narrow = copy.deepcopy(case)
    narrow["case_clock"]["windows"]["shift_change"]["open_minutes"] = 5
    narrow_study = program.Study(narrow)
    crews = [
        ("true_keeper", "true_keeper", "true_keeper", "witness"),
        ("true_keeper", "true_keeper", "witness", "witness"),
        ("true_keeper", "witness", "witness", "witness"),
    ]

    for kits in crews:
        total, budget = minutes_of(narrow_study, program, kits)
        assert budget == FOUR_PLAYER_BUDGET
        assert total == 124  # the number TIMING.md quotes for the first run
