"""Tests for island/wave_events.py and the bonuses of POST /api/waves/finish (GAME-V3.md 4.2-4.3).

The event of a wave is chosen in every browser (frontend/src/pirates/wave-events.js); the server
repeats the same steps, checked here against the samples of content/wave_events.json (the
browser's tests check the same samples), so both always agree on which wave had the galleon.

Used by: pytest (cd backend && uv run pytest).
"""

import json
from pathlib import Path

import pytest

from server.island import wave_events
from server.tests.helpers import assert_error
from server.tests.island_helpers import PLAYER_ID, WAVE_ID, World

ROOT = Path(__file__).resolve().parents[3]
TABLE = json.loads((ROOT / "backend" / "content" / "wave_events.json").read_text(encoding="utf-8"))


def test_the_browser_keeps_an_equal_copy_of_the_table():
    copy = json.loads(
        (ROOT / "frontend" / "src" / "pirates" / "wave-events.json").read_text(encoding="utf-8")
    )
    assert copy == TABLE


def test_the_server_picks_the_same_event_as_the_browser():
    assert len(TABLE["samples"]) >= 40
    for wave, seed, expected in TABLE["samples"]:
        assert wave_events.event_for(wave, seed) == expected, (wave, seed)


def test_no_event_before_wave_3_nor_at_pirate_point_and_every_one_opens_in_time():
    assert wave_events.event_for(1, 5) is None
    assert wave_events.event_for(2, 5) is None
    assert wave_events.event_for(3, 5, flagship=True) is None
    assert wave_events.event_for(101, 5) is None
    seen = {}
    for wave in range(3, 101):
        for seed in range(40):
            event = wave_events.event_for(wave, seed * 7919)
            opens = next(item["from"] for item in TABLE["events"] if item["id"] == event)
            assert wave >= opens
            seen.setdefault(event, wave)
    assert set(seen) == {item["id"] for item in TABLE["events"]}


def test_the_32_bit_steps_match_javascript():
    # Math.imul(0x9e3779b1, 3) and the first number of mulberry32(1) in JavaScript.
    assert wave_events.imul(0x9E3779B1, 3) == (0x9E3779B1 * 3) & 0xFFFFFFFF
    assert wave_events.u32_stream(1)() == 2693262067


def galleon_wave() -> tuple[int, int]:
    for seed in range(10_000):
        if wave_events.event_for(9, seed) == "treasure_galleon":
            return 9, seed
    raise AssertionError("no galleon seed")


def other_wave() -> tuple[int, int]:
    for seed in range(10_000):
        if wave_events.event_for(9, seed) != "treasure_galleon":
            return 9, seed
    raise AssertionError("no other seed")


def test_a_bonus_counts_only_where_the_wave_allows_it():
    wave, seed = galleon_wave()
    allowed = wave_events.allowed_bonuses
    assert allowed(["galleon"], place="island", wave=wave, seed=seed, boss_every=5) == ["galleon"]
    assert allowed(["galleon", "finisher"], place="island", wave=wave, seed=seed, boss_every=5) == [
        "galleon"
    ]
    other, other_seed = other_wave()
    assert allowed(["galleon"], place="island", wave=other, seed=other_seed, boss_every=5) == []
    assert allowed(["finisher"], place="island", wave=10, seed=1, boss_every=5) == ["finisher"]
    assert allowed(["finisher"], place="island", wave=11, seed=1, boss_every=5) == []
    assert allowed(["finisher"], place="pirate_point", wave=10, seed=1, boss_every=5) == []
    assert allowed(None, place="island", wave=10, seed=1, boss_every=5) == []
    assert allowed(["finisher"], place="island", wave=10, seed=None, boss_every=5) == []
    assert wave_events.bonus_base(["galleon"], 9) == 20 + 4 * 9
    assert wave_events.bonus_base(["galleon", "finisher"], 10) == 20 + 40 + 15 + 30


def finish_base(world: World) -> int:
    (call,) = world.database.calls("wave_finish")
    return call["p_loot_base"]


def test_a_won_galleon_raises_the_base_of_the_loot():
    wave, seed = galleon_wave()
    world = World()
    world.database.wave_places[WAVE_ID] = {
        "place": "island",
        "island_owner": PLAYER_ID,
        "wave": wave,
        "seed": seed,
    }

    response = world.finish(bonuses=["galleon"])

    assert response.status_code == 200
    assert finish_base(world) == 25 + 20 + 4 * wave


def test_a_bonus_the_wave_does_not_allow_is_dropped_not_refused():
    wave, seed = other_wave()
    world = World()
    world.database.wave_places[WAVE_ID] = {
        "place": "island",
        "island_owner": PLAYER_ID,
        "wave": wave,
        "seed": seed,
    }

    response = world.finish(bonuses=["galleon", "finisher"])

    assert response.status_code == 200
    assert finish_base(world) == 25


def test_a_won_finisher_on_a_boss_wave_raises_the_base():
    world = World()
    world.database.wave_places[WAVE_ID] = {
        "place": "island",
        "island_owner": PLAYER_ID,
        "wave": 5,
        "seed": 7,
    }

    world.finish(bonuses=["finisher", "finisher"])

    assert finish_base(world) == 25 + 15 + 3 * 5


def test_late_waves_keep_their_taper_and_add_the_bonus():
    world = World()
    world.database.wave_places[WAVE_ID] = {
        "place": "island",
        "island_owner": PLAYER_ID,
        "wave": 40,
        "seed": 7,
    }

    world.finish(bonuses=["finisher"])

    # loot_rates past wave 30: base 25 + (10 - 4) x 30, then the finisher's 15 + 3 x 40.
    assert finish_base(world) == 25 + 180 + 15 + 120


@pytest.mark.parametrize(
    "bonuses", [["gold"], ["galleon", "finisher", "galleon"], "galleon", [1], {"galleon": True}]
)
def test_bonuses_that_do_not_fit_are_refused(bonuses):
    world = World()

    assert_error(world.finish(bonuses=bonuses), 422, "validation_error")
    assert world.database.calls("wave_finish") == []
