"""Real placement, identity and economy cases for canonical perimeter-wall quotes."""

import json
from dataclasses import replace
from pathlib import Path
from uuid import UUID

import pytest

from server.errors import ApiError
from server.island import layout
from server.island.catalogue import catalogue_for_flags, load_island
from server.island.layout_store import LayoutRow, LayoutSnapshot
from server.island.rules import Built
from server.island.wall_chain import chain_cells, quote_chain

CATALOGUE = catalogue_for_flags(load_island(), {"more_tower_spots": True})
RING = json.loads(
    (Path(__file__).parent / "fixtures/perimeter-scenery-ring.json").read_text()
)["cells"]


def snapshot(stored=None, version=1, capacity=128):
    return LayoutSnapshot(
        version,
        capacity,
        tuple(
            LayoutRow(plot=k, x_half=round(x * 2), z_half=round(z * 2))
            for k, (x, z) in sorted((stored or {}).items())
        ),
    )


def quote(cells=None, built=None, stored=None, role=None, wave=100, catalogue=CATALOGUE):
    return quote_chain(
        catalogue,
        built or {},
        snapshot(stored),
        cells or [tuple(RING[0])],
        role=role,
        wave=wave,
        island_epoch=UUID(int=105),
    )


def test_selected_old_reservations_move_together_and_keep_input_id_pairing():
    q = quote([tuple(p) for p in RING[:12]])
    assert [p.spot for p in q.placements] == [f"wall_{n}" for n in range(1, 13)]
    assert [(p.x, p.z) for p in q.placements] == [tuple(p) for p in RING[:12]]
    assert q.wire()["totalCost"] == 120
    assert q.remaining == 116


def test_locked_original_inner_sites_are_skipped_without_claiming_they_are_built():
    q = quote([tuple(p) for p in RING[:8]], wave=0)
    assert [p.spot for p in q.placements] == [f"wall_{n}" for n in [1, 2, 3, 4, 5, 6, 13, 14]]
    assert q.remaining == 120


def test_per_piece_rounding_is_not_an_aggregate_discount():
    kinds = tuple(
        replace(k, prices=(11, *k.prices[1:])) if k.kind == "wall" else k for k in CATALOGUE.kinds
    )
    q = quote(
        [tuple(p) for p in RING[:32]], role="engineer", catalogue=replace(CATALOGUE, kinds=kinds)
    )
    assert q.unit_cost == 10
    assert q.total_cost == 320  # 32 rounded 9.9 costs, rather than rounding352*.9 to317.


@pytest.mark.parametrize(
    "cells,code",
    [
        ([], "invalid_chain"),
        ([(0, 0)] * 33, "invalid_chain"),
        ([(True, 0)], "off_grid"),
        ([(0.25, 0)], "off_grid"),
        ([(float("nan"), 0)], "off_grid"),
        ([(float("inf"), 0)], "off_grid"),
        ([(31, 0)], "off_grid"),
        ([(1, 1), (3, 3)], "invalid_chain"),
        ([(1, 1), (3, 1), (1, 1)], "place_taken"),
    ],
)
def test_invalid_ordered_intent_is_rejected(cells, code):
    with pytest.raises(ApiError) as error:
        chain_cells(cells)
    assert error.value.code == code


@pytest.mark.parametrize("cell,code", [((30, 30), "not_on_land"), ((0, 2), "place_taken")])
def test_land_and_protected_heart_are_authoritative(cell, code):
    with pytest.raises(ApiError) as error:
        quote([cell])
    assert error.value.code == code


def test_other_paid_walls_remain_occupied_and_missing_coordinate_fails_closed():
    with pytest.raises(ApiError) as error:
        quote(built={"wall_13": Built("wall", 1)}, stored={"wall_13": tuple(RING[0])})
    assert error.value.code == "place_taken"
    with pytest.raises(ApiError) as error:
        quote(built={"wall_13": Built("wall", 1)})
    assert error.value.code == "database_error"


def test_no_free_grid_right_is_inferred_from_ordinary_layout_version():
    with pytest.raises(ApiError) as error:
        quote_chain(
            CATALOGUE,
            {},
            snapshot(version=0, capacity=12),
            [tuple(RING[0])],
            wave=100,
            role=None,
            island_epoch=UUID(int=105),
        )
    assert error.value.code == "walls_not_ready"


def test_complete_capacity_refuses_extra_payment_intent():
    built = {f"wall_{n}": Built("wall", 1) for n in range(1, 129)}
    # Every known piece is positioned; capacity fails before geometry is used.
    stored = {f"wall_{n}": (0.0, 0.0) for n in range(1, 129)}
    with pytest.raises(ApiError) as error:
        quote(built=built, stored=stored)
    assert error.value.code == "wall_limit"


def test_measured_full_perimeter_is_constructible_in_four_real_bounded_quote_runs():
    built, stored, payments = {}, {}, 0
    for start in range(0, len(RING), 32):
        q = quote([tuple(p) for p in RING[start : start + 32]], built=built, stored=stored)
        for p in q.placements:
            built[p.spot] = Built("wall", 1)
            stored[p.spot] = (p.x, p.z)
        payments += q.total_cost
    assert len(built) == 102 and q.remaining == 26 and payments == 1020
    positions = layout.positions_of(
        layout.island_layout(True), stored, wall_rule_version=1, wall_capacity=128
    )
    for spot, (x, z) in stored.items():
        layout.check_move(
            layout.island_layout(True),
            positions,
            spot,
            x,
            z,
            wall_rule_version=1,
            wall_capacity=128,
        )


def test_flag_off_moved_d060_tower_position_remains_reserved():
    with pytest.raises(ApiError) as error:
        quote(stored={"cannon_8": tuple(RING[0])}, catalogue=load_island())
    assert error.value.code == "place_taken"
