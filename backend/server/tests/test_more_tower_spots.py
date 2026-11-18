"""D060: more tower spots over time.

islands.json "extraTowerSpots" lists cannon_8..cannon_11 with the won wave each one needs; they
join the island only while the flag more_tower_spots is on (catalogue.catalogue_for_flags), take
every kind cannon_1 takes, stand where island_layout.json "extraSpots" says, and are allowed by
supabase/migrations/20261117010000_more_tower_spots.sql. With the flag off nothing changes.
"""

import re
from dataclasses import replace
from pathlib import Path

import pytest

from server.errors import ApiError
from server.flags import FLAG_NAMES, parse_flags
from server.game.building_catalogue import load_buildings
from server.island import layout, rules
from server.island.catalogue import IslandFileError, catalogue_for_flags, load_island
from server.tests.helpers import assert_error
from server.tests.island_helpers import ISLAND_SETTINGS, World

REPO_ROOT = Path(__file__).resolve().parents[3]
MIGRATION = REPO_ROOT / "supabase" / "migrations" / "20261117010000_more_tower_spots.sql"
SWIVEL_RULE = REPO_ROOT / "supabase" / "migrations" / "20261116020100_swivel_spot_rule.sql"
CATALOGUE = load_island()
ON = parse_flags("islands,more_tower_spots")
EXTRA = {"cannon_8": 10, "cannon_9": 20, "cannon_10": 30, "cannon_11": 40}


def flagged(**flags: bool):
    return catalogue_for_flags(CATALOGUE, {"more_tower_spots": True, **flags})


def test_the_flag_is_known_and_off_by_default():
    assert "more_tower_spots" in FLAG_NAMES
    assert parse_flags("")["more_tower_spots"] is False


def test_flag_off_keeps_the_same_22_spots():
    assert len(catalogue_for_flags(CATALOGUE, parse_flags("islands")).spots) == 22
    assert len(CATALOGUE.spots) == 22
    assert not {spot.id for spot in CATALOGUE.spots} & set(EXTRA)
    assert CATALOGUE.more_tower_spots is False
    assert len(layout.island_layout().spots) == 22


def test_flag_on_adds_four_tower_spots_with_every_tower_kind():
    catalogue = flagged()
    extra = catalogue.spots[22:]
    assert [(spot.id, spot.unlock_wave) for spot in extra] == list(EXTRA.items())
    template = next(spot for spot in catalogue.spots if spot.id == "cannon_1")
    assert all(spot.kinds == template.kinds for spot in extra)
    # The culverin (defenses_v2, always on) comes along.
    assert set(template.kinds) == {"cannon", "mortar", "harpoon", "swivel", "culverin"}


@pytest.mark.parametrize(("spot", "wave"), list(EXTRA.items()))
def test_an_extra_spot_opens_after_its_wave(spot, wave):
    catalogue = flagged()
    with pytest.raises(ApiError) as refused:
        rules.check_build(catalogue, spot, "cannon", {}, wave - 1)
    assert (refused.value.status_code, refused.value.code) == (409, "locked")
    assert f"wave {wave}" in str(refused.value.message)
    built, price = rules.check_build(catalogue, spot, "cannon", {}, wave)
    assert (built.id, price) == (spot, 30)


def test_an_extra_spot_takes_no_wall_or_house():
    with pytest.raises(ApiError) as refused:
        rules.check_build(flagged(), "cannon_8", "wall", {}, 50)
    assert refused.value.code == "wrong_kind"


def test_flag_off_an_extra_spot_does_not_exist():
    with pytest.raises(ApiError) as refused:
        rules.check_build(CATALOGUE, "cannon_8", "cannon", {}, 50)
    assert refused.value.code == "no_such_spot"


def test_a_broken_extra_list_is_refused(tmp_path):
    import json

    from server.island.catalogue import CONTENT_FILE

    data = json.loads(CONTENT_FILE.read_text())
    data["extraTowerSpots"]["spots"][0]["id"] = "cannon_1"  # an existing spot
    path = tmp_path / "islands.json"
    path.write_text(json.dumps(data))
    with pytest.raises(IslandFileError):
        load_island(path)


def test_the_extra_spots_stand_on_grass_off_every_lane_and_leave_the_route_open():
    plain, more = layout.island_layout(), layout.island_layout(True)
    assert [spot.spot for spot in more.spots[22:]] == list(EXTRA)
    positions = layout.positions_of(more, {})
    # Nothing of before moves (walls settle exactly as without the extra spots).
    before = layout.positions_of(plain, {})
    assert {key: positions[key] for key in before} == before
    assert layout.route_open(more, positions)
    for spot in more.spots[22:]:
        assert spot.slot == "tower"
        assert layout.surface_class(more, spot.x, spot.z) == 2
        box = layout.box_of(more, spot.spot, (spot.x, spot.z))
        assert not any(layout.overlaps(box, other) for other in more.keep_out)
        others = [key for key in positions if key != spot.spot]
        assert not any(
            layout.overlaps(box, layout.box_of(more, key, positions[key])) for key in others
        )
        # D056: no wall lane cell under the tower's footprint.
        assert not any(
            abs(x - spot.x) <= 1 and abs(z - spot.z) <= 1 for x, z in layout.lane_cells(more)
        )
        # Every spot of the island can still be moved (the check of a stay in place passes).
        layout.check_move(more, positions, spot.spot, spot.x, spot.z)


def check_pairs(text: str, constraint: str) -> set[tuple[str, str]]:
    check = re.search(rf"constraint {constraint}(.*?)\)\);", text, re.DOTALL).group(1)
    return set(re.findall(r"\('([a-z0-9_]+)',\s*'([a-z0-9_]+)'\)", check))


def test_the_migration_allows_every_pair_of_before_and_the_new_spots():
    text = MIGRATION.read_text()
    newest = check_pairs(text, "islet_buildings_plot_fits_building")
    before = check_pairs(SWIVEL_RULE.read_text(), "islet_buildings_plot_fits_building")
    old = {(s.plot, s.building_type) for s in load_buildings().spots if not s.stands_from_start}
    full = flagged(defenses_v2=True)
    assert newest == old | {(spot.id, kind) for spot in full.spots for kind in spot.kinds}
    assert newest - before == {
        (spot, kind)
        for spot in EXTRA
        for kind in ("cannon", "mortar", "harpoon", "culverin", "swivel")
    }
    layout_rule = re.search(
        r"constraint island_layout_plot_known check \(plot in \((.*?)\)\)", text, re.DOTALL
    )
    assert set(re.findall(r"'([a-z0-9_]+)'", layout_rule.group(1))) == {
        spot.spot for spot in layout.island_layout(True).spots
    }
    # Both tear-down functions accept the new plots and nothing else changed in them.
    pattern = "'^(wall_([1-9]|1[0-2])|cannon_([1-9]|1[01])|tower_1|house_[12])$'"
    assert text.count(pattern) == 2
    for plot in [*EXTRA, "cannon_1", "wall_12"]:
        assert re.fullmatch(pattern[2:-2], plot)
    assert not re.fullmatch(pattern[2:-2], "cannon_12")


def test_flag_on_the_island_answer_lists_the_extra_spots():
    world = World(settings=replace(ISLAND_SETTINGS, flags=ON))
    spots = world.island().json()["spots"]
    assert [spot["id"] for spot in spots][22:] == list(EXTRA)
    assert spots[22]["kinds"] == ["cannon", "mortar", "harpoon", "swivel", "culverin"]
    assert (spots[22]["x"], spots[22]["z"]) == (-8.5, 12.0)


def test_flag_off_the_island_answer_has_22_spots_and_refuses_an_extra_spot():
    world = World()
    assert len(world.island().json()["spots"]) == 22
    assert_error(world.build(spot="cannon_8"), 404, "no_such_spot")


def test_the_server_refuses_a_locked_extra_spot_before_the_database():
    world = World(settings=replace(ISLAND_SETTINGS, flags=ON))
    world.database.progress["wave_best"] = 9
    response = world.build(spot="cannon_8")
    assert_error(response, 409, "locked")
    assert "wave 10" in response.json()["error"]["message"]
    assert world.database.calls("islet_build") == []
    world.database.progress["wave_best"] = 10
    assert world.build(spot="cannon_8").status_code == 200
    (call,) = world.database.calls("islet_build")
    assert call["p_plot"] == "cannon_8"
