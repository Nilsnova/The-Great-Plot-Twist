"""The simulation rules a wave carries ("rules" on the wave answers of routes/waves.py): each one
is switched on by the feature flag of the same name, and every client of a wave reads them from
the wave answer, so a whole wave plays one rule set. Off: the key is left out, as before.

Nothing here uses the network: the database is a FakeIslandDatabase (island_helpers.py).
"""

from dataclasses import replace

import httpx
import pytest

from server.flags import parse_flags
from server.island.wave_rules import SIM_RULES
from server.tests.island_helpers import ISLAND_SETTINGS, STARTED, World


def world_with(flags: str) -> World:
    return World(settings=replace(ISLAND_SETTINGS, flags=parse_flags(flags)))


def test_with_every_rule_flag_off_the_wave_answers_have_no_rules_and_nothing_is_kept():
    world = world_with("islands")
    assert "rules" not in world.start().json()
    assert world.database.calls("wave_rules_keep") == []  # the table may not exist yet


@pytest.mark.parametrize("rule", SIM_RULES)
def test_a_rule_flag_puts_that_rule_on_the_wave_answer(rule: str):
    world = world_with(f"islands,{rule}")
    assert world.start().json()["rules"] == [rule]


def test_the_rules_follow_the_agreed_order_whatever_the_order_of_the_flags():
    flags = ",".join(reversed(SIM_RULES))
    world = world_with(f"{flags},islands")
    assert world.start().json()["rules"] == list(SIM_RULES)


def test_join_and_current_answer_the_same_rules_as_start():
    world = world_with("islands,tower_health")
    world.database.join_reply = {**STARTED, "status": "joined"}
    world.database.current_reply = {**STARTED, "status": "running"}

    assert world.join().json()["rules"] == ["tower_health"]
    assert world.current().json()["rules"] == ["tower_health"]


def flip(world: World, flags: str) -> None:
    """Switch the server's flags while a wave runs (a redeploy with other FEATURE_FLAGS)."""
    world.app.state.settings = replace(ISLAND_SETTINGS, flags=parse_flags(flags))


def test_a_joiner_after_a_flag_flip_gets_the_rules_the_wave_started_with():
    world = world_with("islands,tower_health")
    world.database.join_reply = {**STARTED, "status": "joined"}
    world.database.current_reply = {**STARTED, "status": "running"}
    assert world.start().json()["rules"] == ["tower_health"]

    flip(world, "islands,pathing,rescue")  # mid-wave: tower_health off, two others on

    assert world.join().json()["rules"] == ["tower_health"]
    assert world.current().json()["rules"] == ["tower_health"]


def test_the_first_answer_keeps_the_rules_even_when_it_is_a_join():
    world = world_with("islands,pathing")
    world.database.join_reply = {**STARTED, "status": "joined"}
    assert world.join().json()["rules"] == ["pathing"]

    flip(world, "islands,pathing,tower_health")

    assert world.start().json()["rules"] == ["pathing"]  # the same wave id: its kept set


def test_a_failing_rule_store_never_breaks_the_wave_it_plays_without_rules():
    world = world_with("islands,rescue")
    world.database.wave_rules_reply = httpx.Response(404, json={"message": "no such function"})

    answer = world.start()

    assert answer.status_code == 200
    assert "rules" not in answer.json()
