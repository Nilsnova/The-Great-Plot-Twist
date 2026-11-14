"""The simulation rules a wave carries ("rules" on the wave answers of routes/waves.py): each one
is switched on by the feature flag of the same name, and every client of a wave reads them from
the wave answer, so a whole wave plays one rule set. Off: the key is left out, as before.

Nothing here uses the network: the database is a FakeIslandDatabase (island_helpers.py).
"""

from dataclasses import replace

import pytest

from server.flags import parse_flags
from server.routes.waves import SIM_RULES
from server.tests.island_helpers import ISLAND_SETTINGS, STARTED, World


def world_with(flags: str) -> World:
    return World(settings=replace(ISLAND_SETTINGS, flags=parse_flags(flags)))


def test_with_every_rule_flag_off_the_wave_answers_have_no_rules():
    world = world_with("islands")
    assert "rules" not in world.start().json()


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
