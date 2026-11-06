"""Reveal selection tests without copying protected text into fixtures or failure output."""

from dataclasses import replace

import pytest

from server.game.case_data import load_case
from server.game.case_reveal import reveal_lines
from server.game.case_snapshot import Solver
from server.game.case_view import build_case_view
from server.tests.case_fixtures import EXAMPLE_NOW, VIEWER, example_snapshot


@pytest.fixture(scope="module")
def data():
    return load_case()


def require(condition, message):
    if not condition:
        pytest.fail(message, pytrace=False)


@pytest.mark.parametrize("kit", ["true_keeper", "witness", "informant", "stranger"])
def test_reveal_order_and_closing_line_follow_the_viewer_kit(data, kit):
    lines = reveal_lines(data, kit, False)

    assert [line["id"] for line in lines] == [
        line_id for line_id in data.reveal.order if line_id != "log_reader_line"
    ]
    closing = next(line for line in lines if line["kind"] == "closing")
    require(closing["text"] == data.reveal.closing_lines[kit].text, "Wrong closing selection.")
    assert {line["kind"] for line in lines} == {"unmasking", "twist", "evidence", "closing", "last"}


def test_the_log_line_only_for_players_who_read_the_log(data):
    without = reveal_lines(data, "informant", False)
    with_log = reveal_lines(data, "informant", True)

    assert not any(line["kind"] == "log" for line in without)
    assert [line["id"] for line in with_log] == list(data.reveal.order)
    selected = next(line for line in with_log if line["kind"] == "log")
    require(selected["text"] == data.reveal.log_reader_line.text, "Wrong log selection.")


def test_every_reveal_line_cites_cards(data):
    lines = reveal_lines(data, "witness", True)

    assert all(line["cites"] for line in lines)
    assert all(set(line["cites"]) <= {card.id for card in data.cards} for line in lines)


@pytest.mark.parametrize("world", ["unchanged", "locked", "relit", "added", "already_recorded"])
def test_every_solver_sees_the_world_outcome(data, world):
    snapshot = replace(
        example_snapshot(),
        status="finished",
        solved_second=2100,
        world_outcome=world,
        solvers=(Solver(VIEWER, 1, "informant", True, 700, 700, 2100),),
    )

    view = build_case_view(data, snapshot, VIEWER, EXAMPLE_NOW)

    assert view["reveal"]["available"] is True
    assert view["reveal"]["world"] == world
    assert view["reveal"]["solvedSecond"] == 2100
