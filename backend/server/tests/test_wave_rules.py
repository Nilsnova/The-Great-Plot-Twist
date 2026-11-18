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


def test_with_every_rule_flag_off_the_wave_answers_have_no_rules_but_keep_the_empty_set():
    world = world_with("islands")
    world.database.join_reply = {**STARTED, "status": "joined"}
    world.database.current_reply = {**STARTED, "status": "running"}

    started, joined, current = world.start().json(), world.join().json(), world.current().json()

    assert "rules" not in started and "rules" not in joined and "rules" not in current
    assert world.database.wave_rules == {STARTED["waveId"]: []}
    assert len(world.database.calls("wave_rules_keep")) == 3  # one small call per answer


def test_with_every_rule_flag_off_the_answer_is_the_same_as_when_keeping_fails():
    # Keeping failing is the old path (no rules looked at): the answers must match exactly.
    kept, failing = world_with("islands"), world_with("islands")
    failing.database.wave_rules_reply = httpx.Response(500, json={"message": "down"})
    answers = [world.start().json() for world in (kept, failing)]
    for answer in answers:
        answer.pop("serverNow")  # the server's clock moves on between answers
    assert answers[0] == answers[1]


def test_a_rule_flag_switched_on_mid_wave_gives_later_joiners_no_rules():
    world = world_with("islands")
    world.database.join_reply = {**STARTED, "status": "joined"}
    world.database.current_reply = {**STARTED, "status": "running"}
    assert "rules" not in world.start().json()

    flip(world, "islands,tower_health,pathing")  # mid-wave: rule flags on

    assert "rules" not in world.join().json()  # the starter plays none, so does the joiner
    assert "rules" not in world.current().json()


def test_every_rule_flag_switched_off_mid_wave_keeps_the_starters_rules():
    world = world_with("islands,rescue")
    world.database.join_reply = {**STARTED, "status": "joined"}
    assert world.start().json()["rules"] == ["rescue"]

    flip(world, "islands")

    assert world.join().json()["rules"] == ["rescue"]


@pytest.mark.parametrize("rule", SIM_RULES)
def test_a_rule_flag_puts_that_rule_on_the_wave_answer(rule: str):
    flags = f"islands,{rule}"
    expected = [rule]
    if rule == "tower_obstacles":
        flags += ",pathing,tower_health"
        expected = ["tower_health", "pathing", "tower_obstacles"]
    assert world_with(flags).start().json()["rules"] == expected


def test_tower_obstacles_only_turns_on_with_its_three_dependencies():
    for flags, expected in (("islands,tower_obstacles", []),
                            ("islands,tower_obstacles,pathing", ["pathing"]),
                            ("islands,tower_obstacles,tower_health", ["tower_health"])):
        assert world_with(flags).start().json().get("rules", []) == expected
    world = world_with("islands,pathing,tower_health,tower_obstacles")
    assert world.start().json()["rules"] == ["tower_health", "pathing", "tower_obstacles"]


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


@pytest.mark.parametrize("flags", ["islands,rescue", "islands"])
def test_a_failing_rule_store_never_breaks_the_wave_it_plays_without_rules(flags: str):
    world = world_with(flags)
    world.database.wave_rules_reply = httpx.Response(404, json={"message": "no such function"})

    answer = world.start()

    assert answer.status_code == 200
    assert "rules" not in answer.json()
