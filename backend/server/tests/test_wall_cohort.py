"""The admitted wall cohort is bounded, complete and has no implicit spatial defaults."""

import asyncio
from dataclasses import replace

import pytest

from server.errors import ApiError
from server.game.building_catalogue import load_buildings
from server.island import rules, store
from server.island.catalogue import (
    MAX_SPOTS,
    IslandFileError,
    Spot,
    catalogue_for_flags,
    load_island,
    with_wall_capacity,
)
from server.supabase_admin import SupabaseRejected

BASE = load_island()


def perimeter():
    return with_wall_capacity(
        catalogue_for_flags(BASE, {"more_tower_spots": True, "defenses_v2": True}), 128
    )


def test_legacy_adapter_is_unchanged_and_admitted_cohort_reuses_wall_rules():
    assert with_wall_capacity(BASE, 12) is BASE
    selected = perimeter()
    assert len(selected.spots) == MAX_SPOTS == 142
    before = catalogue_for_flags(BASE, {"more_tower_spots": True, "defenses_v2": True})
    assert selected.spots[:26] == before.spots
    assert [spot.id for spot in selected.spots[26:]] == [f"wall_{n}" for n in range(13, 129)]
    assert all(spot.kinds == ("wall",) and spot.unlock_wave == 0 for spot in selected.spots[26:])
    assert all(not hasattr(spot, "x") and not hasattr(spot, "z") for spot in selected.spots[26:])
    assert selected.kinds == catalogue_for_flags(BASE, {"defenses_v2": True}).kinds
    assert with_wall_capacity(selected, 128) is selected
    assert len(BASE.spots) == 22


@pytest.mark.parametrize("capacity", [None, True, 13, 127, 129, 128.0, "128"])
def test_capacity_must_be_an_exact_supported_trusted_policy_value(capacity):
    with pytest.raises(ValueError, match="Unsupported wall capacity"):
        with_wall_capacity(BASE, capacity)


def test_an_existing_wrong_kind_cannot_shadow_a_wall_identity():
    broken = replace(BASE, spots=BASE.spots + (Spot("wall_13", ("cannon",)),))
    with pytest.raises(IslandFileError, match="incompatible"):
        with_wall_capacity(broken, 128)


def test_last_wall_uses_existing_price_and_kind_checks_and_unknown_ids_still_refuse():
    selected = perimeter()
    wall, price = rules.check_build(selected, "wall_128", "wall", {}, 0)
    assert (wall.id, price) == ("wall_128", 10)
    for spot, kind, code in [
        ("wall_129", "wall", "no_such_spot"),
        ("wall_128", "cannon", "wrong_kind"),
    ]:
        with pytest.raises(ApiError) as error:
            rules.check_build(selected, spot, kind, {}, 50)
        assert error.value.code == code


class Rows:
    def __init__(self, rows):
        self.rows = rows
        self.query = None

    async def select_rows(self, table, query):
        assert table == "islet_buildings"
        self.query = query
        return self.rows[: int(query["limit"])]


def full_rows():
    island = [
        {"plot": spot.id, "building_type": spot.kind, "level": 1} for spot in perimeter().spots
    ]
    home = [
        {"plot": spot.plot, "building_type": spot.building_type, "level": 1}
        for spot in load_buildings().spots
        if not spot.stands_from_start
    ]
    return sorted(island + home, key=lambda row: row["plot"])


def test_complete_read_includes_all_walls_nonwalls_and_home_plots_without_truncation():
    rows = full_rows()
    assert len(rows) == store.MAX_BUILDING_ROWS == 146
    admin = Rows(rows)
    built = asyncio.run(store.read_built_spots(admin, "owner"))
    assert len(built) == 146
    assert built["wall_128"].kind == "wall"
    assert built["cannon_11"].kind == "cannon"
    assert admin.query["player_id"] == "eq.owner"
    assert admin.query["limit"] == "147"
    assert admin.query["order"] == "plot.asc"


def test_overflow_is_detected_even_when_the_database_honors_the_requested_limit():
    rows = full_rows() + [
        {"plot": f"wall_{n}", "building_type": "wall", "level": 1} for n in (129, 130)
    ]
    with pytest.raises(SupabaseRejected):
        asyncio.run(store.read_built_spots(Rows(rows), "owner"))


def test_duplicate_rows_cannot_silently_replace_a_paid_piece():
    row = {"plot": "wall_128", "building_type": "wall", "level": 1}
    with pytest.raises(SupabaseRejected):
        asyncio.run(store.read_built_spots(Rows([row, {**row, "level": 5}]), "owner"))
