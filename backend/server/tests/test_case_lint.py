"""The case linter: rules L1 to L8, L10 to L12, L14, L15, L18 and L19, each proved twice.

Every rule is tested on the real file (it passes) and with mutations: one thing in a copy of the
real file is changed on purpose, and the rule for that thing must notice. A rule that no mutation
can trip is a rule that protects nothing, so a mutation that stops tripping its rule fails here.

The rules are listed, with what each one protects, in backend/content/README.md ("Linter rules").
L1 to L8, L14, L15, L18 and L19 run on every load (game/case_checks.py) and raise CaseDataError.
L10 to L12 are heavier, so they run only in tests (game/case_lint.py) and return a list of problems.
L9 and L17 are checked by the timing program, and L13 and L16 wait for the paid routes and the
finale geometry (the full version).

The culprit's id is never written in this file. A test that needs it reads it from the data, and
every error message is checked not to repeat it.

Used by: pytest, with the other tests in backend/server/tests/.
"""

from collections import namedtuple

import pytest

from server.game.case_checks import LOAD_TIME_CHECKS, run_checks
from server.game.case_data import CaseData, CaseDataError, load_case
from server.game.case_lint import LINT_RULES, seat_fills
from server.tests.case_data_helpers import (
    broken,
    card_of,
    deduction_of,
    hotspot_of,
    kit_of,
    light_of,
    raw_case,
    route_of,
    suspect_of,
)

# Characters the style rule forbids, written as escapes so that this file holds none of them.
EM_DASH = "—"
EN_DASH = "–"
DOUBLE_HYPHEN = "-" * 2

Mutation = namedtuple("Mutation", "rule name change")


@pytest.fixture(scope="module")
def real() -> CaseData:
    return load_case()


def culprit_of(raw) -> str:
    """The culprit's id, read from the data."""
    return raw["accusation"]["culprit"]


def first_suspect_who_is_not_the_culprit(raw) -> dict:
    return next(entry for entry in raw["suspects"] if entry["id"] != culprit_of(raw))


# ---- The mutations the load-time rules must catch -------------------------------------------


def duplicate_a_route(raw):
    card_of(raw, "C1")["routes"].append(dict(route_of(raw, "C1.notice_board")))


def rename_the_last_card(raw):
    card_of(raw, "C8")["id"] = "C9"


def put_a_capital_letter_in_a_hotspot_id(raw):
    hotspot_of(raw, "ferry_pier")["id"] = "Ferry_Pier"


def put_a_route_under_another_card(raw):
    route_of(raw, "C3.key_tag")["id"] = "C4.key_tag"


def shorten_a_suspect_id(raw):
    suspect_of(raw, "fisherman")["id"] = "x"


def move_a_route_to_an_unknown_hotspot(raw):
    route_of(raw, "C1.notice_board")["hotspot"] = "no_such_spot"


def move_a_route_to_an_unknown_place(raw):
    route_of(raw, "C1.notice_board")["place"] = "no_such_place"


def move_a_route_to_a_hotspot_of_another_place(raw):
    route_of(raw, "C1.notice_board")["place"] = "wreck_point"


def gate_a_card_on_an_unknown_deduction(raw):
    card_of(raw, "C5")["opens_after"] = ["D9"]


def open_a_route_in_an_unknown_window(raw):
    route_of(raw, "C4.low_tide_cave")["open_when"] = "high_tide"


def name_a_company_the_exchange_does_not_list(raw):
    route_of(raw, "C6.shareholder_register")["needs_share"] = "no-such-company"


def let_a_deduction_clear_an_unknown_suspect(raw):
    deduction_of(raw, "D2")["clears"] = "nobody_at_all"


def put_two_cards_at_one_hotspot(raw):
    route = route_of(raw, "C3.key_tag")
    route["place"] = "saltreach_harbor"
    route["hotspot"] = "notice_board"


def put_a_route_at_a_decoy_hotspot(raw):
    route_of(raw, "C1.notice_board")["hotspot"] = "jail"


def add_a_third_card_to_a_deduction(raw):
    deduction_of(raw, "D1")["cards"].append("C3")


def use_one_card_twice_in_a_deduction(raw):
    deduction_of(raw, "D1")["cards"] = ["C1", "C1"]


def drop_the_last_card(raw):
    raw["cards"].pop()


def move_a_card_to_the_wrong_deduction(raw):
    card_of(raw, "C1")["deduction"] = "D2"


def make_two_kit_cards_cheap_for_one_kit(raw):
    card_of(raw, "C4")["cheap_for_kit"] = "witness"


def point_a_kit_at_the_wrong_card(raw):
    kit_of(raw, "informant")["cheap_card"] = "C2"


def give_an_open_card_a_kit_route(raw):
    route_of(raw, "C1.notice_board")["kind"] = "kit"


def make_a_fifth_card_open(raw):
    card_of(raw, "C2")["kind"] = "open"


def make_a_kit_route_slower_than_the_timed_route(raw):
    route_of(raw, "C4.back_room")["timer_minutes"] = 9


def make_a_kit_route_cost_coins(raw):
    route_of(raw, "C4.back_room")["coins"] = 5


def close_a_kit_route_outside_a_window(raw):
    route_of(raw, "C4.back_room")["open_when"] = "low_tide"


def make_a_paid_route_only_two_minutes_slower(raw):
    route_of(raw, "C4.doorman_paid")["timer_minutes"] = 7


def give_a_kit_card_two_kit_routes(raw):
    route_of(raw, "C4.low_tide_cave")["kind"] = "kit"
    route_of(raw, "C4.low_tide_cave")["kit"] = "witness"
    route_of(raw, "C4.low_tide_cave")["open_when"] = "always"


def give_a_kit_route_to_the_wrong_kit(raw):
    route_of(raw, "C5.yard_shift")["kit"] = "witness"


def make_a_partner_kind_players_only(raw):
    route_of(raw, "C1.notice_board")["players_only"] = True


def let_partners_use_a_share_route(raw):
    route_of(raw, "C6.shareholder_register")["players_only"] = False


def make_a_paid_route_free(raw):
    route_of(raw, "C2.ferry_log_paid")["coins"] = 0


def give_a_timed_route_no_window(raw):
    route_of(raw, "C2.ferry_log_timed")["open_when"] = "always"


def drop_the_world_event_of_a_world_route(raw):
    del route_of(raw, "C4.beach_crate")["needs_world"]


def take_the_kit_off_a_kit_route(raw):
    route_of(raw, "C2.radio_words")["kit"] = None


def give_an_open_route_a_world_event(raw):
    route_of(raw, "C1.notice_board")["needs_world"] = "sealed_crate_on_your_beach"


def start_a_timed_route_in_the_journal(raw):
    route_of(raw, "C2.ferry_log_timed")["starts_in_journal"] = True


def gate_a_card_on_its_own_deduction(raw):
    card_of(raw, "C5")["opens_after"] = ["D3"]


def gate_the_first_deduction_on_a_later_one(raw):
    card_of(raw, "C1")["opens_after"] = ["D2"]


def open_the_night_after_nothing(raw):
    raw["night"]["opens_after"] = []


def open_the_night_after_an_unknown_deduction(raw):
    raw["night"]["opens_after"] = ["D9"]


def put_the_culprit_in_a_lead(raw):
    card_of(raw, "C1")["lead"] += " " + culprit_of(raw)


def put_the_culprit_in_a_found_line(raw):
    route_of(raw, "C1.notice_board")["found_line"] += " " + culprit_of(raw)


def leave_a_suspect_uncleared(raw):
    first_suspect_who_is_not_the_culprit(raw)["cleared_by"] = None


def start_a_refusal_the_wrong_way(raw):
    first_suspect_who_is_not_the_culprit(raw)["refused_line"] = "Not that one."


def clear_the_culprit_by_a_deduction(raw):
    deduction_of(raw, "D1")["clears"] = culprit_of(raw)


def stop_the_accusation_needing_a_clearing_deduction(raw):
    raw["accusation"]["needs_deductions"] = ["D3", "D4"]


def give_the_culprit_a_refused_line(raw):
    suspect_of(raw, culprit_of(raw))["refused_line"] = "Refused. Not him."


def make_a_ref_121_characters_long(raw):
    raw["rewards"]["coins"][0]["ref"] = "false_light:" + "x" * 109


def use_a_reason_that_is_not_a_wallet_reason(raw):
    raw["rewards"]["coins"][0]["reason"] = "loot_drop"


def let_the_partner_ref_outgrow_the_limit(raw):
    raw["rewards"]["paid_routes"]["partner_ref"] = "false_light:{crew_id}:npc:{order_uid}:extra"


def use_a_placeholder_nobody_fills(raw):
    raw["rewards"]["coins"][0]["ref"] = "false_light:{player_id}"


def cap_the_solve_share_below_its_base(raw):
    raw["rewards"]["coins"][2]["max"] = 300


def cap_the_solve_share_above_everything_it_adds_up_to(raw):
    raw["rewards"]["coins"][2]["max"] = 901


def put_an_em_dash_in_a_lead(raw):
    card_of(raw, "C1")["lead"] = f"Look here {EM_DASH} now."


def put_an_en_dash_in_a_premise(raw):
    raw["premise"] = f"Lights {EN_DASH} lost."


def put_a_double_hyphen_in_a_found_line(raw):
    route_of(raw, "C1.notice_board")["found_line"] = f"The notice{DOUBLE_HYPHEN}fresh."


def leave_a_text_empty(raw):
    card_of(raw, "C1")["lead"] = ""


def leave_a_text_blank(raw):
    raw["question"] = "   "


def start_the_twist_line_wrongly(raw):
    for line in raw["reveal"]["lines"]:
        if line["id"] == "twist":
            line["text"] = "A twist: nothing was as it seemed."


def make_a_card_text_401_characters_long(raw):
    card_of(raw, "C1")["text"] = "x" * 401


def make_a_found_line_241_characters_long(raw):
    route_of(raw, "C1.notice_board")["found_line"] = "x" * 241


def make_the_version_2(raw):
    raw["format_version"] = 2


def make_another_case(raw):
    raw["case_id"] = "another_case"


LOAD_TIME_MUTATIONS = [
    Mutation("L1", "another format version", make_the_version_2),
    Mutation("L1", "another case id", make_another_case),
    Mutation("L2", "a duplicate route id", duplicate_a_route),
    Mutation("L2", "cards that are not exactly C1 to C8", rename_the_last_card),
    Mutation("L2", "an id with a capital letter", put_a_capital_letter_in_a_hotspot_id),
    Mutation("L2", "a route id under another card", put_a_route_under_another_card),
    Mutation("L2", "an id that is too short", shorten_a_suspect_id),
    Mutation("L3", "an unknown hotspot", move_a_route_to_an_unknown_hotspot),
    Mutation("L3", "an unknown place", move_a_route_to_an_unknown_place),
    Mutation("L3", "a hotspot of another place", move_a_route_to_a_hotspot_of_another_place),
    Mutation("L3", "a gate on an unknown deduction", gate_a_card_on_an_unknown_deduction),
    Mutation("L3", "an unknown window", open_a_route_in_an_unknown_window),
    Mutation(
        "L3", "a company the Exchange does not list", name_a_company_the_exchange_does_not_list
    ),
    Mutation("L3", "an unknown suspect cleared", let_a_deduction_clear_an_unknown_suspect),
    Mutation("L4", "two cards at one hotspot", put_two_cards_at_one_hotspot),
    Mutation("L4", "a route at a decoy hotspot", put_a_route_at_a_decoy_hotspot),
    Mutation("L5", "a third card in a deduction", add_a_third_card_to_a_deduction),
    Mutation("L5", "one card twice in a deduction", use_one_card_twice_in_a_deduction),
    Mutation("L5", "only seven cards", drop_the_last_card),
    Mutation("L5", "a card in the wrong deduction", move_a_card_to_the_wrong_deduction),
    Mutation("L6", "two kit cards for one kit", make_two_kit_cards_cheap_for_one_kit),
    Mutation("L6", "a kit that does not point back", point_a_kit_at_the_wrong_card),
    Mutation("L6", "an open card with a kit route", give_an_open_card_a_kit_route),
    Mutation("L6", "five open cards", make_a_fifth_card_open),
    Mutation(
        "L7",
        "a kit route slower than the timed route",
        make_a_kit_route_slower_than_the_timed_route,
    ),
    Mutation("L7", "a kit route that costs coins", make_a_kit_route_cost_coins),
    Mutation("L7", "a kit route that is not always open", close_a_kit_route_outside_a_window),
    Mutation("L7", "a paid route only 2 minutes slower", make_a_paid_route_only_two_minutes_slower),
    Mutation("L7", "a kit card with two kit routes", give_a_kit_card_two_kit_routes),
    Mutation("L7", "a kit route for the wrong kit", give_a_kit_route_to_the_wrong_kit),
    Mutation("L8", "a players_only partner kind", make_a_partner_kind_players_only),
    Mutation("L8", "a share route that partners may use", let_partners_use_a_share_route),
    Mutation("L8", "a paid route that is free", make_a_paid_route_free),
    Mutation("L8", "a timed route with no window", give_a_timed_route_no_window),
    Mutation("L8", "a world route with no world event", drop_the_world_event_of_a_world_route),
    Mutation("L8", "a kit route with no kit", take_the_kit_off_a_kit_route),
    Mutation("L8", "an open route with a world event", give_an_open_route_a_world_event),
    Mutation("L8", "a timed route that starts in the journal", start_a_timed_route_in_the_journal),
    Mutation("L14", "C5 gated by its own D3", gate_a_card_on_its_own_deduction),
    Mutation("L14", "D1 gated by a later deduction", gate_the_first_deduction_on_a_later_one),
    Mutation("L14", "a night that opens after nothing", open_the_night_after_nothing),
    Mutation(
        "L14",
        "a night that opens after a missing deduction",
        open_the_night_after_an_unknown_deduction,
    ),
    Mutation("L15", "the culprit id in a lead", put_the_culprit_in_a_lead),
    Mutation("L15", "the culprit id in a found line", put_the_culprit_in_a_found_line),
    Mutation("L15", "a suspect nobody clears", leave_a_suspect_uncleared),
    Mutation("L15", "a refusal that does not start with Refused", start_a_refusal_the_wrong_way),
    Mutation("L15", "the culprit cleared by a deduction", clear_the_culprit_by_a_deduction),
    Mutation(
        "L15",
        "a clearing deduction the accusation skips",
        stop_the_accusation_needing_a_clearing_deduction,
    ),
    Mutation("L15", "a refused line for the culprit", give_the_culprit_a_refused_line),
    Mutation("L18", "a ref of 121 characters", make_a_ref_121_characters_long),
    Mutation(
        "L18", "a reason that is not a wallet reason", use_a_reason_that_is_not_a_wallet_reason
    ),
    Mutation(
        "L18", "a partner ref that outgrows 120 characters", let_the_partner_ref_outgrow_the_limit
    ),
    Mutation("L18", "a placeholder nobody fills", use_a_placeholder_nobody_fills),
    Mutation("L18", "a solve share cap below its base", cap_the_solve_share_below_its_base),
    Mutation(
        "L18",
        "a solve share cap above its parts",
        cap_the_solve_share_above_everything_it_adds_up_to,
    ),
    Mutation("L19", "an em dash", put_an_em_dash_in_a_lead),
    Mutation("L19", "an en dash", put_an_en_dash_in_a_premise),
    Mutation("L19", "a double hyphen", put_a_double_hyphen_in_a_found_line),
    Mutation("L19", "an empty text", leave_a_text_empty),
    Mutation("L19", "a blank text", leave_a_text_blank),
    Mutation("L19", "a twist line without Plot twist", start_the_twist_line_wrongly),
    Mutation("L19", "a card text of 401 characters", make_a_card_text_401_characters_long),
    Mutation("L19", "a found line of 241 characters", make_a_found_line_241_characters_long),
]


# ---- The mutations the test-time rules must catch -------------------------------------------


def delete_the_timed_route_of_c2(raw):
    card = card_of(raw, "C2")
    card["routes"] = [route for route in card["routes"] if route["id"] != "C2.ferry_log_timed"]


def make_the_only_route_of_c1_cost_coins(raw):
    route_of(raw, "C1.notice_board")["coins"] = 10


def drop_one_entry_profile(raw):
    raw["entry_profiles"].pop()


def leave_a_reveal_line_without_cites(raw):
    raw["reveal"]["lines"][0]["cites"] = []


def cite_a_card_that_not_every_profile_reaches(raw):
    card = card_of(raw, "C8")
    card["routes"] = [route for route in card["routes"] if route["id"] != "C8.ruin"]


def cite_a_card_that_does_not_exist(raw):
    raw["reveal"]["lines"][0]["cites"] = ["C9"]


def leave_a_kit_without_a_closing_line(raw):
    del raw["reveal"]["closing_lines"]["witness"]


def keep_partners_off_the_timed_routes_to_d3(raw):
    route_of(raw, "C5.yard_gate_timed")["players_only"] = True
    route_of(raw, "C6.mail_boat_timed")["players_only"] = True


def make_the_third_light_cost_more_than_any_kit_starts_with(raw):
    light_of(raw, "islet_signal_station")["planning_price_coins"] = 5000


def keep_partners_off_the_harbor_light(raw):
    light_of(raw, "harbor_light")["partners_may_man"] = False


LINT_MUTATIONS = [
    Mutation("L10", "a kit with no free route to a card", delete_the_timed_route_of_c2),
    Mutation("L10", "a card whose only route costs coins", make_the_only_route_of_c1_cost_coins),
    Mutation("L10", "only seven entry profiles", drop_one_entry_profile),
    Mutation("L11", "a reveal line with no cites", leave_a_reveal_line_without_cites),
    Mutation(
        "L11", "a cited card not every profile reaches", cite_a_card_that_not_every_profile_reaches
    ),
    Mutation("L11", "a cited card that does not exist", cite_a_card_that_does_not_exist),
    Mutation("L11", "a kit with no closing line", leave_a_kit_without_a_closing_line),
    Mutation("L12", "a seat fill that cannot form D3", keep_partners_off_the_timed_routes_to_d3),
    Mutation(
        "L12",
        "a third light no kit can afford",
        make_the_third_light_cost_more_than_any_kit_starts_with,
    ),
    Mutation(
        "L12", "a crew with one player cannot man three lights", keep_partners_off_the_harbor_light
    ),
]


# ---- Every rule passes on the real file -----------------------------------------------------


@pytest.mark.parametrize("rule", sorted(LOAD_TIME_CHECKS, key=lambda name: int(name[1:])))
def test_the_real_case_file_passes_every_load_time_rule(real, rule):
    LOAD_TIME_CHECKS[rule](real)


@pytest.mark.parametrize("rule", sorted(LINT_RULES))
def test_the_real_case_file_passes_every_test_time_rule(real, rule):
    assert LINT_RULES[rule](real) == []


def test_the_build_now_rules_are_exactly_the_ones_the_spec_lists():
    assert sorted(LOAD_TIME_CHECKS, key=lambda name: int(name[1:])) == [
        "L1",
        "L2",
        "L3",
        "L4",
        "L5",
        "L6",
        "L7",
        "L8",
        "L14",
        "L15",
        "L18",
        "L19",
    ]
    assert sorted(LINT_RULES) == ["L10", "L11", "L12"]


# ---- Every rule catches its mutations -------------------------------------------------------


@pytest.mark.parametrize(
    "mutation", LOAD_TIME_MUTATIONS, ids=lambda mutation: f"{mutation.rule} {mutation.name}"
)
def test_a_load_time_rule_catches_its_mutation(mutation):
    data = broken(mutation.change)

    with pytest.raises(CaseDataError) as caught:
        LOAD_TIME_CHECKS[mutation.rule](data)

    assert caught.value.rule == mutation.rule
    assert caught.value.place
    assert str(caught.value).startswith(f"{mutation.rule} at ")


@pytest.mark.parametrize(
    "mutation", LINT_MUTATIONS, ids=lambda mutation: f"{mutation.rule} {mutation.name}"
)
def test_a_test_time_rule_catches_its_mutation(mutation):
    problems = LINT_RULES[mutation.rule](broken(mutation.change))

    assert problems


@pytest.mark.parametrize("rule", sorted(LOAD_TIME_CHECKS, key=lambda name: int(name[1:])))
def test_every_load_time_rule_has_at_least_one_mutation_that_trips_it(rule):
    assert [mutation for mutation in LOAD_TIME_MUTATIONS if mutation.rule == rule]


@pytest.mark.parametrize("rule", sorted(LINT_RULES))
def test_every_test_time_rule_has_at_least_one_mutation_that_trips_it(rule):
    assert [mutation for mutation in LINT_MUTATIONS if mutation.rule == rule]


def test_the_spec_mutations_are_all_there():
    named = {(mutation.rule, mutation.name) for mutation in LOAD_TIME_MUTATIONS + LINT_MUTATIONS}

    assert ("L2", "a duplicate route id") in named
    assert ("L3", "an unknown hotspot") in named
    assert ("L4", "two cards at one hotspot") in named
    assert ("L5", "a third card in a deduction") in named
    assert ("L6", "two kit cards for one kit") in named
    assert ("L7", "a kit route slower than the timed route") in named
    assert ("L8", "a players_only partner kind") in named
    assert ("L10", "a kit with no free route to a card") in named
    assert ("L11", "a reveal line with no cites") in named
    assert ("L12", "a seat fill that cannot form D3") in named
    assert ("L14", "C5 gated by its own D3") in named
    assert ("L15", "the culprit id in a lead") in named
    assert ("L18", "a ref of 121 characters") in named
    assert ("L19", "an em dash") in named


# ---- The error never quotes the story, and the checks run in the order of the rules ---------


@pytest.mark.parametrize(
    "mutation",
    [mutation for mutation in LOAD_TIME_MUTATIONS if mutation.rule in ("L15", "L19")],
    ids=lambda mutation: f"{mutation.rule} {mutation.name}",
)
def test_a_load_time_error_never_repeats_the_culprit_or_a_line_of_the_story(mutation):
    original = raw_case()

    with pytest.raises(CaseDataError) as caught:
        LOAD_TIME_CHECKS[mutation.rule](broken(mutation.change))

    message = str(caught.value)
    assert culprit_of(original) not in message
    assert original["cards"][0]["text"] not in message
    assert original["premise"] not in message


def test_run_checks_stops_at_the_first_broken_rule_and_names_it():
    def break_l7_and_l19(raw):
        make_a_kit_route_slower_than_the_timed_route(raw)
        put_an_em_dash_in_a_lead(raw)

    with pytest.raises(CaseDataError) as caught:
        run_checks(broken(break_l7_and_l19))

    assert caught.value.rule == "L7"


def test_run_checks_runs_the_rules_in_the_order_of_their_numbers(real):
    order = list(LOAD_TIME_CHECKS)

    assert order == sorted(order, key=lambda name: int(name[1:]))


# ---- What the test-time rules count ---------------------------------------------------------


def test_the_linter_covers_8_entry_profiles_and_531_seat_fills(real):
    assert len(real.entry_profiles) == 8
    assert {(profile.kit, profile.read_log) for profile in real.entry_profiles} == {
        (kit.id, read_log) for kit in real.kits for read_log in (False, True)
    }
    assert len(seat_fills(real)) == 531


def test_every_seat_fill_has_four_seats_and_at_least_one_player(real):
    fills = seat_fills(real)

    assert all(len(fill) == 4 for fill in fills)
    assert all(any(not seat.partner for seat in fill) for fill in fills)
    assert len(set(fills)) == len(fills)


def test_a_fill_with_one_player_has_three_partners_holding_any_kit(real):
    one_player = [fill for fill in seat_fills(real) if sum(not seat.partner for seat in fill) == 1]

    assert len(one_player) == 4 * 4**3
    assert {seat.kit for fill in one_player for seat in fill if seat.partner} == {
        kit.id for kit in real.kits
    }
