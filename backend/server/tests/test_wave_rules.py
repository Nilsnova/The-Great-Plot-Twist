"""The simulation rules a wave carries ("rules" on the wave answers of routes/waves.py): the rules
of ALWAYS_ON on every new wave (their flags are retired), each other one switched on by the feature
flag of the same name, and every client of a wave reads them from the wave answer, so a whole wave
plays one rule set. None: the key is left out, as before.

Nothing here uses the network: the database is a FakeIslandDatabase (island_helpers.py).
"""

from dataclasses import replace

import httpx
import pytest

from server.flags import parse_flags
from server.island.wave_rules import ALWAYS_ON, SIM_RULES
from server.tests.island_helpers import ISLAND_SETTINGS, STARTED, World

# The rules a feature flag still switches (the others are always on).
FLAGGED = tuple(name for name in SIM_RULES if name not in ALWAYS_ON)


def world_with(flags: str) -> World:
    return World(settings=replace(ISLAND_SETTINGS, flags=parse_flags(flags)))


def plays(*flagged: str) -> list[str]:
    """The rules of a new wave with these flagged rules on: the always-on ones too, in SIM_RULES
    order; tower_obstacles only with pathing and tower_health."""
    on = set(ALWAYS_ON) | set(flagged)
    if not {"pathing", "tower_health"} <= on:
        on.discard("tower_obstacles")
    return [name for name in SIM_RULES if name in on]


def rules_of(answer: dict) -> list[str]:
    return answer.get("rules", [])


def test_with_no_rule_flag_on_the_wave_answers_carry_the_always_on_rules_and_keep_them():
    world = world_with("islands")
    world.database.join_reply = {**STARTED, "status": "joined"}
    world.database.current_reply = {**STARTED, "status": "running"}

    started, joined, current = world.start().json(), world.join().json(), world.current().json()

    assert rules_of(started) == rules_of(joined) == rules_of(current) == plays()
    assert world.database.wave_rules == {STARTED["waveId"]: plays()}
    assert len(world.database.calls("wave_rules_keep")) == 3  # one small call per answer


def test_a_rule_flag_switched_on_mid_wave_gives_later_joiners_the_starters_rules():
    world = world_with("islands")
    world.database.join_reply = {**STARTED, "status": "joined"}
    world.database.current_reply = {**STARTED, "status": "running"}
    assert rules_of(world.start().json()) == plays()

    flip(world, f"islands,{','.join(FLAGGED)}")  # mid-wave: every rule flag on

    assert rules_of(world.join().json()) == plays()  # the joiner plays the starter's set
    assert rules_of(world.current().json()) == plays()


def test_every_rule_flag_switched_off_mid_wave_keeps_the_starters_rules():
    world = world_with(f"islands,{','.join(FLAGGED)}")
    world.database.join_reply = {**STARTED, "status": "joined"}
    assert world.start().json()["rules"] == plays(*FLAGGED)

    flip(world, "islands")

    assert world.join().json()["rules"] == plays(*FLAGGED)


@pytest.mark.parametrize("rule", SIM_RULES)
def test_a_rule_flag_puts_that_rule_on_the_wave_answer(rule: str):
    flags = f"islands,{rule}"
    flagged = [rule]
    if rule == "tower_obstacles":
        flags += ",pathing,tower_health"
        flagged = ["tower_health", "pathing", "tower_obstacles"]
    assert world_with(flags).start().json()["rules"] == plays(*flagged)


def test_tower_obstacles_only_turns_on_with_its_three_dependencies():
    for flags, flagged in (
        ("islands,tower_obstacles", ["tower_obstacles"]),
        ("islands,tower_obstacles,pathing", ["tower_obstacles", "pathing"]),
        ("islands,tower_obstacles,tower_health", ["tower_obstacles", "tower_health"]),
    ):
        assert rules_of(world_with(flags).start().json()) == plays(*flagged)
    world = world_with("islands,pathing,tower_health,tower_obstacles")
    assert world.start().json()["rules"] == ["tower_health", "pathing", "tower_obstacles"]


def test_the_rules_follow_the_agreed_order_whatever_the_order_of_the_flags():
    flags = ",".join(reversed(SIM_RULES))
    world = world_with(f"{flags},islands")
    assert world.start().json()["rules"] == list(SIM_RULES)


def test_join_and_current_answer_the_same_rules_as_start():
    world = world_with("islands,structure_recovery")
    world.database.join_reply = {**STARTED, "status": "joined"}
    world.database.current_reply = {**STARTED, "status": "running"}

    assert world.join().json()["rules"] == plays("structure_recovery")
    assert world.current().json()["rules"] == plays("structure_recovery")


def flip(world: World, flags: str) -> None:
    """Switch the server's flags while a wave runs (a redeploy with other FEATURE_FLAGS)."""
    world.app.state.settings = replace(ISLAND_SETTINGS, flags=parse_flags(flags))


def test_a_joiner_after_a_flag_flip_gets_the_rules_the_wave_started_with():
    world = world_with("islands,structure_recovery")
    world.database.join_reply = {**STARTED, "status": "joined"}
    world.database.current_reply = {**STARTED, "status": "running"}
    assert world.start().json()["rules"] == plays("structure_recovery")

    flip(world, "islands")  # mid-wave: the flag off

    assert world.join().json()["rules"] == plays("structure_recovery")
    assert world.current().json()["rules"] == plays("structure_recovery")


def test_the_first_answer_keeps_the_rules_even_when_it_is_a_join():
    world = world_with("islands")
    world.database.join_reply = {**STARTED, "status": "joined"}
    assert rules_of(world.join().json()) == plays()

    flip(world, "islands,structure_recovery")

    assert rules_of(world.start().json()) == plays()  # the same wave id: its kept set


@pytest.mark.parametrize("flags", ["islands,rescue", "islands"])
def test_a_failing_rule_store_never_breaks_the_wave_it_plays_without_rules(flags: str):
    world = world_with(flags)
    world.database.wave_rules_reply = httpx.Response(404, json={"message": "no such function"})

    answer = world.start()

    assert answer.status_code == 200
    assert "rules" not in answer.json()
