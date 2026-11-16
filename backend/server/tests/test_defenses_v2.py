"""Tests for the second wave of defenses (T43, decision D048 proposed): the culverin, a long gun.

The culverin lives in its own file, backend/content/defenses_v2.json, and joins the island's
catalogue only while the feature flag defenses_v2 is on (catalogue.catalogue_for_flags). With the
flag off the live game must not change at all: the same catalogue object, the same API answers.

Nothing here uses the network: the API tests use the FakeIslandDatabase of island_helpers.py.

Used by: pytest (cd backend && uv run pytest).
"""

import json
from dataclasses import replace

import pytest

from server.flags import parse_flags
from server.island.catalogue import (
    DEFENSES_V2_FILE,
    IslandFileError,
    catalogue_for_flags,
    load_island,
    read_defenses_v2,
)
from server.tests.helpers import assert_error
from server.tests.island_helpers import ISLAND_SETTINGS, PLAYER_ID, World

CATALOGUE = load_island()
TOWER_SPOTS = tuple(f"cannon_{n}" for n in range(1, 8))
FLAG_ON = parse_flags("islands,defenses_v2")
FLAG_OFF = parse_flags("islands")


def write(tmp_path, change) -> object:
    """A copy of the real file with `change(data)` applied, written to tmp_path."""
    data = json.loads(DEFENSES_V2_FILE.read_text(encoding="utf-8"))
    change(data)
    path = tmp_path / "defenses_v2.json"
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


# --- the file ---


def test_the_file_reads_and_describes_the_culverin():
    (culverin,) = read_defenses_v2(CATALOGUE)
    assert culverin.kind.kind == "culverin"
    assert culverin.kind.name == "Culverin"
    assert culverin.kind.prices == (80, 160, 320, 640, 1280)
    # Levels 1 to 3 after wave 15 (the gunboats come from 16), level 4 after 20, level 5 after 30.
    assert culverin.kind.level_waves == (15, 15, 15, 20, 30)
    assert culverin.spots == TOWER_SPOTS
    assert culverin.line == (
        "A long gun: hits far ships hard but slowly. Hunts gunboats and siege barges first."
    )
    assert culverin.news


@pytest.mark.parametrize(
    ("change", "message"),
    [
        (lambda d: d["kinds"][0].update(kind="cannon"), "already a kind"),
        (lambda d: d["kinds"][0].update(spots=["wall_1"]), "tower spot"),
        (lambda d: d["kinds"][0].update(spots=["pp_tower_1"]), "tower spot"),
        (lambda d: d["kinds"][0].update(levelWaves=[15, 15, 15, 20]), "one wave per level"),
        (lambda d: d["kinds"][0].update(levelWaves=[15, 20, 15, 20, 30]), "in order"),
        (lambda d: d["kinds"][0].update(levelWaves=[15, 15, 15, 21, 30]), "campaign step"),
        (lambda d: d["kinds"][0].update(prices=[80, 160, 320, 640, 1280, 2560]), "prices"),
        (lambda d: d["kinds"][0].pop("line"), "line"),
    ],
)
def test_a_broken_file_is_refused_with_a_clear_message(tmp_path, change, message):
    with pytest.raises(IslandFileError, match=message):
        read_defenses_v2(CATALOGUE, write(tmp_path, change))


# --- merging into the catalogue ---


def test_with_the_flag_off_the_catalogue_is_unchanged():
    assert catalogue_for_flags(CATALOGUE, FLAG_OFF) is CATALOGUE
    assert "culverin" not in {kind.kind for kind in CATALOGUE.kinds}
    assert all("culverin" not in spot.kinds for spot in CATALOGUE.spots)
    assert all(not item.startswith("culverin") for item, _, _ in CATALOGUE.campaign.ids())


def test_with_the_flag_off_a_broken_file_is_never_read(tmp_path):
    missing = tmp_path / "nowhere.json"
    assert catalogue_for_flags(CATALOGUE, FLAG_OFF, missing) is CATALOGUE


def test_with_the_flag_on_the_culverin_joins_the_tower_spots_and_the_campaign():
    merged = catalogue_for_flags(CATALOGUE, FLAG_ON)
    assert [kind.kind for kind in merged.kinds] == [kind.kind for kind in CATALOGUE.kinds] + [
        "culverin"
    ]
    for before, after in zip(CATALOGUE.spots, merged.spots, strict=True):
        expected = before.kinds + (("culverin",) if before.id in TOWER_SPOTS else ())
        assert (after.id, after.kinds) == (before.id, expected)
    # Pirate Point keeps cannon or mortar only.
    assert merged.pirate_point_spots == CATALOGUE.pirate_point_spots
    assert merged.campaign.wave_of("culverin:1") == 15
    assert merged.campaign.wave_of("culverin:4") == 20
    assert merged.campaign.wave_of("culverin:5") == 30
    # Nothing else in the campaign moves.
    old = {item: wave for item, wave, _ in CATALOGUE.campaign.ids()}
    new = {item: wave for item, wave, _ in merged.campaign.ids() if not item.startswith("culverin")}
    assert new == old
    # The original is not touched.
    assert "culverin" not in {kind.kind for kind in CATALOGUE.kinds}


def test_with_the_flag_on_a_broken_file_leaves_the_island_as_it_was(tmp_path, caplog):
    broken = write(tmp_path, lambda d: d["kinds"][0].update(spots=["wall_1"]))
    assert catalogue_for_flags(CATALOGUE, FLAG_ON, broken) is CATALOGUE
    assert "defenses_v2" in caplog.text


# --- the API ---


def world_at(wave: int, flags) -> World:
    world = World(settings=replace(ISLAND_SETTINGS, flags=flags))
    world.database.progress.update(wave_best=wave)
    return world


def test_flag_off_island_answer_and_build_are_as_before():
    world = world_at(30, FLAG_OFF)
    body = world.island().json()
    assert "culverin" not in body["prices"]["kinds"]
    assert all("culverin" not in spot["kinds"] for spot in body["spots"])
    assert not any(item.startswith("culverin") for item in body["unlocks"]["unlocked"])
    assert not any(item.startswith("culverin") for item in body["unlocks"]["locked"])
    refused = world.build(spot="cannon_1", kind="culverin")
    assert_error(refused, 422, "wrong_kind")
    assert world.database.calls("islet_build") == []


def test_flag_off_hides_a_culverin_row_already_in_the_database():
    world = world_at(30, FLAG_OFF)
    world.database.buildings[PLAYER_ID] = [
        {"plot": "cannon_1", "building_type": "culverin", "level": 2}
    ]
    spot = next(spot for spot in world.island().json()["spots"] if spot["id"] == "cannon_1")
    assert (spot["built"], spot["kind"]) == (False, "cannon")


def test_flag_on_island_answer_lists_and_locks_the_culverin():
    early = world_at(14, FLAG_ON)
    body = early.island().json()
    assert body["prices"]["kinds"]["culverin"] == [80, 160, 320, 640, 1280]
    assert body["unlocks"]["locked"]["culverin:1"] == 15
    assert body["unlocks"]["locked"]["culverin:5"] == 30
    shown = next(spot for spot in body["spots"] if spot["id"] == "cannon_5")
    assert shown["kinds"] == ["cannon", "mortar", "harpoon", "swivel", "culverin"]
    locked = early.build(spot="cannon_5", kind="culverin")
    assert_error(locked, 409, "locked")
    assert locked.json()["error"]["message"] == "Opens after wave 15."
    # A wall spot never takes it.
    assert_error(world_at(30, FLAG_ON).build(spot="wall_1", kind="culverin"), 422, "wrong_kind")


def test_flag_on_build_asks_the_database_with_the_culverin_price():
    world = world_at(15, FLAG_ON)
    world.database.build_reply = {"status": "done", "balance": 20, "timber": 0, "level": 1}
    assert world.build(spot="cannon_5", kind="culverin").status_code == 200
    (call,) = world.database.calls("islet_build")
    assert (call["p_plot"], call["p_building_type"], call["p_coins"]) == (
        "cannon_5",
        "culverin",
        80,
    )
