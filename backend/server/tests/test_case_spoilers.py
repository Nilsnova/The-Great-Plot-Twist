"""Earned-content boundaries and pre-solve protection, with no protected literal fixtures."""

import json
from dataclasses import replace

import pytest

from server.game.case_data import load_case
from server.game.case_snapshot import Find, Formed, Solver
from server.game.case_view import build_case_view
from server.tests.case_fixtures import EXAMPLE_NOW, KEEPER, VIEWER, example_snapshot


@pytest.fixture(scope="module")
def data():
    return load_case()


def require(condition, message):
    if not condition:
        pytest.fail(message, pytrace=False)


def protected_texts(data):
    return (
        *(line.text for line in data.reveal.lines),
        *(line.text for line in data.reveal.closing_lines.values()),
        data.reveal.log_reader_line.text,
        data.reveal.last_beat.text,
        *data.raw["rewards"]["epilogue_lines"].values(),
    )


def test_culprit_is_never_sent_before_the_solve(data):
    encoded = json.dumps(build_case_view(data, example_snapshot(), VIEWER, EXAMPLE_NOW))

    assert '"culprit"' not in encoded
    require(
        not any(text and text in encoded for text in protected_texts(data)),
        "Protected text leaked.",
    )


def test_no_view_lets_a_client_find_the_culprit_by_elimination(data):
    view = build_case_view(data, example_snapshot(), VIEWER, EXAMPLE_NOW)

    for row in view["board"]["deductions"]:
        if not row["complete"]:
            assert set(row) == {"id", "name", "complete"}
    assert all(
        set(row) == {"id", "title", "cleared", "clearedBy"} for row in view["board"]["suspects"]
    )
    assert all("refusedLine" not in row for row in view["accusation"]["suspects"])
    assert not any(row["cleared"] for row in view["board"]["suspects"])


def test_a_crew_gets_only_what_it_has_earned(data):
    encoded = json.dumps(build_case_view(data, example_snapshot(), VIEWER, EXAMPLE_NOW))
    held = {"C1", "C2", "C3"}

    require(
        all(card.text not in encoded for card in data.cards if card.id not in held),
        "Unheld card leaked.",
    )
    require(
        all(row.finding not in encoded for row in data.deductions if row.id != "D1"),
        "Unformed finding leaked.",
    )


def test_a_card_text_is_not_sent_one_second_before_it_lands(data):
    snapshot = replace(
        example_snapshot(),
        finds=(Find(1, "C4", "C4.back_room", 0, 300, VIEWER),),
        pins=(),
        formed=(),
    )
    before = build_case_view(data, snapshot, VIEWER, 299)
    after = build_case_view(data, snapshot, VIEWER, 300)

    require(data.card("C4").text not in json.dumps(before), "Running find leaked card text.")
    assert not before["board"]["cards"]
    assert before["search"]["jobs"][0]["foundLine"] is None
    card = after["board"]["cards"][0]
    require(card["text"] == data.card("C4").text, "Landed card was missing its text.")
    assert card["foundSecond"] == 300
    assert card["holders"] == [{"seat": 1, "label": "Brave Puffin 17"}]


def test_a_solver_of_another_crew_sees_no_reveal_in_an_unsolved_crew(data):
    snapshot = replace(
        example_snapshot(),
        solvers=(Solver(KEEPER, 3, "true_keeper", True, 500, 500, 100),),
    )

    view = build_case_view(data, snapshot, VIEWER, EXAMPLE_NOW)

    assert view["reveal"] == {"available": False}


def test_suspect_clearing_comes_only_from_deductions_the_crew_formed(data):
    snapshot = replace(example_snapshot(), formed=(Formed("D2", 100, VIEWER, 1),))

    view = build_case_view(data, snapshot, VIEWER, EXAMPLE_NOW)

    for row in view["board"]["suspects"]:
        expected = row["id"] == data.deduction("D2").clears
        require(row["cleared"] == expected, "A suspect was marked by unearned elimination.")
        require(row["clearedBy"] == ("D2" if expected else None), "Wrong clearing source.")


def test_search_eligibility_does_not_reveal_discovery_lines_before_a_find(data):
    snapshot = replace(example_snapshot(), finds=(), pins=(), formed=())
    view = build_case_view(data, snapshot, VIEWER, 0)
    statuses = [
        route["statusText"] for spot in view["search"]["spots"] for route in spot.get("routes", ())
    ]

    require(
        not any(route.found_line in statuses for route in data.active_routes),
        "Search eligibility exposed an unearned discovery line.",
    )


def test_night_controls_never_expose_an_unearned_solution_or_exact_target(data):
    snapshot = replace(example_snapshot(), night_no=1, night_started_second=2000)
    view = build_case_view(data, snapshot, VIEWER, EXAMPLE_NOW)
    encoded = json.dumps(view)

    assert view["finale"]["glow"] is not None
    assert view["finale"]["parted"] is None
    assert "target" not in view["finale"]
    require(
        not any(text and text in encoded for text in protected_texts(data)),
        "Night controls leaked protected text.",
    )
    require(
        all(card.text not in encoded for card in data.cards if card.id not in {"C1", "C2", "C3"}),
        "Night controls leaked an unheld card.",
    )
