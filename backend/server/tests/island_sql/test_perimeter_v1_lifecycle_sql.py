"""Actual priced perimeter construction and value lifecycle on an old immutable v1 template."""

import json

import pytest

pytest.importorskip("psycopg")

from server.island import layout, rules  # noqa: E402
from server.island.catalogue import load_island  # noqa: E402
from server.island.layout_store import LayoutRow, LayoutSnapshot  # noqa: E402
from server.island.wall_chain import quote_chain  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    as_server,
    balance,
    call,
)
from server.tests.island_sql.test_structure_recovery_mutations_sql import (  # noqa: E402
    OWNER,
    WAVE,
    seed_v1,
)

LEGACY_CELLS = [
    (-18.5, -4),
    (-18.5, -6),
    (-18.5, -8),
    (-18.5, -10),
    (-16.5, -10),
    (-16.5, -12),
    (-14.5, -12),
    (-12.5, -12),
    (-10.5, -12),
    (-10.5, -14),
    (-10.5, -16),
]
ADDED_CELLS = [(2.5, -16), (4.5, -16)]
BUILD_SQL = "select public.island_wall_build(%s,%s,%s,%s::jsonb,%s::jsonb,%s::jsonb,%s,%s)"
REPAIR_SQL = "select public.island_structure_repair(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s::jsonb)"


def health(db, spot="wall_1"):
    return db.execute(
        "select instance_id,hp_units,max_hp,level,repair_seq from public.island_structure_health "
        "where island_owner=%s and spot=%s",
        (OWNER, spot),
    ).fetchone()


def hold_old_health(db):
    """Declare zero earned recovery during each mutation; never rewrite the old HP value."""
    db.execute(
        "update public.island_structure_health set rate_numerator=0 "
        "where island_owner=%s and spot='wall_1'",
        (OWNER,),
    )
    assert health(db)[1] == 500000


def history(db):
    return call(
        db, "select initial_snapshot from public.recovery_wave_states where wave_id=%s", WAVE
    )


def buy(db, catalogue, cells, uid, stage, role):
    hold_old_health(db)
    raw = call(db, "select public.island_wall_layout_read(%s)", OWNER)
    snapshot = LayoutSnapshot(
        raw["ruleVersion"],
        raw["capacity"],
        tuple(LayoutRow(**r) for r in raw["rows"]),
        raw["islandEpoch"],
    )
    built = {
        spot: rules.Built(kind, level)
        for spot, kind, level in db.execute(
            "select plot,building_type,level from public.islet_buildings where player_id=%s",
            (OWNER,),
        )
    }
    quote = quote_chain(
        catalogue, built, snapshot, cells, wave=stage, role=role, island_epoch=snapshot.island_epoch
    )
    intent = {
        "placements": [p.wire() for p in quote.placements],
        "quotedTotal": quote.total_cost,
        "islandEpoch": str(quote.island_epoch),
    }
    items = [
        {
            "spot": p.spot,
            "x_half": round(p.x * 2),
            "z_half": round(p.z * 2),
            "price": quote.unit_cost,
        }
        for p in quote.placements
    ]
    args = [
        OWNER,
        OWNER,
        uid,
        json.dumps(intent),
        json.dumps(items),
        json.dumps(raw["rows"]),
        role,
        stage,
    ]
    before = balance(db, OWNER)
    done = call(db, BUILD_SQL, *args)
    assert done["status"] == "done" and balance(db, OWNER) == before - quote.total_cost
    assert health(db)[1] == 500000
    return quote, args


def first_added_pieces(db, role=None):
    seed_v1(db)
    as_server(db)
    old = history(db)
    assert "wall_13" not in old["defaultPositions"]
    catalogue = load_island()
    wall = rules.kind_of(catalogue, "wall")
    stage = max(
        max(s.unlock_wave for s in catalogue.spots if s.kinds == ("wall",)),
        rules.unlock_wave_of(catalogue, wall, 2),
    )
    call(
        db,
        "select public.apply_wallet_transaction(%s,1000,'admin_adjust','v1-fixture-budget')",
        OWNER,
    )
    db.execute(
        "update public.islands set wave_best=%s,captain_role=%s,captain_level=%s "
        "where player_id=%s",
        (stage, role, catalogue.skills.role_level, OWNER),
    )
    hold_old_health(db)
    raw = call(db, "select public.island_wall_layout_read(%s)", OWNER)
    effective = [
        {"plot": spot, "x_half": round(x * 2), "z_half": round(z * 2)}
        for spot, (x, z) in sorted(layout.positions_of(layout.island_layout(more=True), {}).items())
    ]
    assert (
        call(
            db,
            "select public.island_wall_policy_admit(%s,%s,%s::jsonb,%s::jsonb)",
            OWNER,
            OWNER,
            json.dumps(raw["rows"]),
            json.dumps(effective),
        )["status"]
        == "done"
    )
    assert health(db)[1] == 500000
    original, _ = buy(db, catalogue, LEGACY_CELLS, "v1-original-run-001", stage, role)
    assert {p.spot for p in original.placements} == {f"wall_{n}" for n in range(2, 13)}
    quote, args = buy(db, catalogue, ADDED_CELLS, "v1-added-run-001", stage, role)
    assert [p.spot for p in quote.placements] == ["wall_13", "wall_14"]
    assert len({health(db, spot)[0] for spot in ("wall_1", "wall_13", "wall_14")}) == 3
    for p in quote.placements:
        assert health(db, p.spot)[1:] == (
            1000000,
            old["recoveryConfig"]["structureMaxHp"]["wall"][0],
            1,
            0,
        )
        assert db.execute(
            "select x_half,z_half from public.island_layout where island_owner=%s and plot=%s",
            (OWNER, p.spot),
        ).fetchone() == (round(p.x * 2), round(p.z * 2))
        assert (
            call(
                db,
                "select ref from public.islet_buildings where player_id=%s and plot=%s",
                OWNER,
                p.spot,
            )
            == f"island:v1-added-run-001:{p.spot}"
        )
    assert history(db) == old
    assert (
        call(db, "select count(*) from public.recovery_wave_states where island_owner=%s", OWNER)
        == 1
    )
    assert call(db, "select count(*) from public.wave_runs where island_owner=%s", OWNER) == 0
    return catalogue, stage, old, quote, args


def upgrade_and_repair(db, catalogue, stage, quote, role):
    wall = rules.kind_of(catalogue, "wall")
    prices = [rules.engineer_price(catalogue, price, role) for price in wall.prices]
    before = balance(db, OWNER)
    original = health(db, "wall_13")[0]
    hold_old_health(db)
    upgraded = call(
        db,
        "select public.island_upgrade(%s,%s,'wall_13','v1-upgrade-001',%s,%s)",
        OWNER,
        OWNER,
        prices,
        rules.unlocked_level(catalogue, wall, stage),
    )
    assert upgraded["status"] == "done" and balance(db, OWNER) == before - prices[1]
    assert health(db, "wall_13")[0] == original and health(db, "wall_13")[1] == 1000000
    assert health(db)[1] == 500000
    assert health(db, "wall_13")[2:4] == (
        history(db)["recoveryConfig"]["structureMaxHp"]["wall"][1],
        2,
    )
    db.execute(
        "update public.island_structure_health set hp_units=500000,rate_numerator=0 "
        "where island_owner=%s and spot='wall_13'",
        (OWNER,),
    )
    hold_old_health(db)
    repair_price = rules.price_table(catalogue)["wall"][1]
    repair_args = [
        OWNER,
        OWNER,
        "wall_13",
        original,
        "v1-paid-repair-001",
        quote.island_epoch,
        "between_waves",
        None,
        2,
        health(db, "wall_13")[4],
        repair_price,
        "c" * 64,
        json.dumps(rules.price_table(catalogue)),
    ]
    before = balance(db, OWNER)
    paid = call(db, REPAIR_SQL, *repair_args)
    assert paid["status"] == "done" and balance(db, OWNER) == before - repair_price
    assert health(db, "wall_13")[1] == 1000000 and health(db)[1] == 500000
    assert (
        call(
            db,
            "select count(*) from public.building_payments "
            "where island_owner=%s and plot='wall_13'",
            OWNER,
        )
        == 2
    )
    return original, prices[1], repair_args, paid


def demolish(db, catalogue, paid_value):
    hold_old_health(db)
    args = [OWNER, OWNER, "wall_13", json.dumps(rules.price_table(catalogue))]
    offer = call(db, "select public.island_demolish_quote(%s,%s,%s,%s::jsonb)", *args)
    expected_refund = paid_value // 2
    assert offer["refunds"] == [
        {"playerId": str(OWNER), "paid": paid_value, "coins": expected_refund}
    ]
    before = balance(db, OWNER)
    done = call(db, "select public.island_demolish(%s,%s,%s,'v1-demolish-001',%s::jsonb)", *args)
    assert done["status"] == "done" and balance(db, OWNER) == before + expected_refund
    assert health(db, "wall_13") is None and health(db)[1] == 500000
    assert (
        call(
            db,
            "select count(*) from public.island_layout where island_owner=%s and plot='wall_13'",
            OWNER,
        )
        == 0
    )


@pytest.mark.parametrize("role", [None, "engineer"])
def test_new_v1_piece_before_next_wave_retains_exact_paid_upgrade_repair_and_refund_value(
    database, role
):
    catalogue, stage, old, quote, _ = first_added_pieces(database, role)
    _, upgrade_price, _, _ = upgrade_and_repair(database, catalogue, stage, quote, role)
    demolish(database, catalogue, quote.unit_cost + upgrade_price)
    assert history(database) == old
    assert health(database, "wall_14")[1] == 1000000


def test_historical_paid_receipts_do_not_reconstruct_or_heal_the_replacement(database):
    catalogue, stage, old, quote, original_build = first_added_pieces(database)
    original_instance, upgrade_price, repair_args, paid = upgrade_and_repair(
        database, catalogue, stage, quote, None
    )
    demolish(database, catalogue, quote.unit_cost + upgrade_price)
    replacement, _ = buy(database, catalogue, ADDED_CELLS[:1], "v1-replacement-001", stage, None)
    assert replacement.placements[0].spot == "wall_13"
    current_instance = health(database, "wall_13")[0]
    assert current_instance != original_instance
    database.execute(
        "update public.island_structure_health set hp_units=250000,rate_numerator=0 "
        "where island_owner=%s and spot='wall_13'",
        (OWNER,),
    )
    hold_old_health(database)
    before = balance(database, OWNER)
    assert call(database, BUILD_SQL, *original_build)["receipt"]["repeat"] is True
    assert call(database, REPAIR_SQL, *repair_args)["receipt"] == paid["receipt"]
    assert balance(database, OWNER) == before
    assert health(database, "wall_13")[0:2] == (current_instance, 250000)
    assert history(database) == old
