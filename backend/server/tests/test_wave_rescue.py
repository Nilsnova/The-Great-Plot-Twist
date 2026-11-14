"""Tests for island/rescue.py and the `rescued` field of POST /api/waves/finish (T38, decision
D044).

The last-chance rescue is played in the browsers (frontend/src/pirates/finisher/rescue.js). The
server only decides what a reported rescue changes: on a lost island wave from wave 4 to 100,
with the flag `rescue` on, the restart rule falls back one wave below the best instead of two.
Exactly once is the database's: wave_finish() applies the restart rule only at the first finish
that closes the run, so a repeat or a second participant cannot apply it again. Nothing here
uses the network or a database.

Used by: pytest (cd backend && uv run pytest).
"""

import re
from dataclasses import replace
from pathlib import Path

import pytest

from server.flags import parse_flags
from server.island import rescue
from server.tests.helpers import assert_error
from server.tests.island_helpers import ISLAND_SETTINGS, PLAYER_ID, WAVE_ID, World

RESCUE_ON = replace(ISLAND_SETTINGS, flags=parse_flags("islands,rescue"))
RESCUE_JS = Path(__file__).resolve().parents[3] / "frontend/src/pirates/finisher/rescue.js"


def rescue_world(wave: int = 20, place: str = "island", settings=RESCUE_ON) -> World:
    world = World(settings=settings)
    owner = PLAYER_ID if place == "island" else None
    world.database.wave_places[WAVE_ID] = {
        "place": place,
        "island_owner": owner,
        "wave": wave,
        "seed": 7,
    }
    return world


def restart_back_sent(world: World) -> int:
    (call,) = world.database.calls("wave_finish")
    return call["p_restart_back"]


# --- the rules (island/rescue.py) ---


@pytest.mark.parametrize(
    ("wave", "allowed"),
    [(1, False), (3, False), (4, True), (50, True), (100, True), (101, False), (None, False)],
)
def test_a_rescue_counts_only_from_wave_4_to_100(wave, allowed):
    assert rescue.rescue_counts(True, survived=False, place="island", wave=wave) is allowed


def test_a_rescue_never_counts_for_a_won_wave_pirate_point_or_without_a_claim():
    assert not rescue.rescue_counts(True, survived=True, place="island", wave=20)
    assert not rescue.rescue_counts(True, survived=False, place="pirate_point", wave=20)
    assert not rescue.rescue_counts(False, survived=False, place="island", wave=20)


def test_a_counted_rescue_falls_back_one_wave_less_and_never_below_zero():
    assert rescue.restart_back(2, counts=True) == 1
    assert rescue.restart_back(2, counts=False) == 2
    assert rescue.restart_back(0, counts=True) == 0


@pytest.mark.parametrize(
    ("best", "rescued", "next_wave"),
    [
        (0, False, 1),
        (0, True, 1),
        (2, True, 1),
        (3, False, 1),
        (3, True, 2),
        (20, False, 18),
        (20, True, 19),
    ],
)
def test_the_next_bell_after_a_loss_never_rings_wave_zero(best, rescued, next_wave):
    back = rescue.restart_back(2, counts=rescued)
    assert rescue.next_wave_after_loss(best, back) == next_wave


def test_the_first_rescued_wave_is_the_same_in_the_browser_and_on_the_server():
    text = RESCUE_JS.read_text(encoding="utf-8")
    assert int(re.search(r"fromWave:\s*(\d+)", text).group(1)) == rescue.RESCUE_FROM_WAVE
    assert int(re.search(r"lastWave:\s*(\d+)", text).group(1)) == rescue.RESCUE_LAST_WAVE


# --- POST /api/waves/finish with rescued ---


def test_a_rescued_loss_sends_a_fallback_of_one_wave():
    world = rescue_world()

    response = world.finish(survived=False, rescued=True)

    assert response.status_code == 200
    assert restart_back_sent(world) == 1


def test_an_ordinary_loss_keeps_the_fallback_of_two_waves():
    world = rescue_world()

    world.finish(survived=False)

    assert restart_back_sent(world) == 2


@pytest.mark.parametrize(
    ("wave", "place", "survived"),
    [(3, "island", False), (20, "pirate_point", False), (20, "island", True)],
)
def test_a_rescue_the_wave_does_not_allow_is_ignored_not_refused(wave, place, survived):
    world = rescue_world(wave=wave, place=place)

    response = world.finish(survived=survived, rescued=True)

    assert response.status_code == 200
    assert restart_back_sent(world) == 2


def test_with_the_flag_off_a_rescue_changes_nothing():
    world = rescue_world(settings=ISLAND_SETTINGS)

    response = world.finish(survived=False, rescued=True)

    assert response.status_code == 200
    assert restart_back_sent(world) == 2


def test_a_rescue_never_moves_the_loot_or_the_best_wave_arguments():
    plain, saved = rescue_world(), rescue_world()

    plain.finish(survived=False)
    saved.finish(survived=False, rescued=True)

    (one,) = plain.database.calls("wave_finish")
    (two,) = saved.database.calls("wave_finish")
    assert {**one, "p_restart_back": None} == {**two, "p_restart_back": None}


@pytest.mark.parametrize("rescued", ["yes", 1, None, [True]])
def test_a_rescued_value_that_is_not_true_or_false_is_refused(rescued):
    world = rescue_world()

    assert_error(world.finish(survived=False, rescued=rescued), 422, "validation_error")
    assert world.database.calls("wave_finish") == []
