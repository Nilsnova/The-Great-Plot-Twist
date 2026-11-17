"""First/last perimeter IDs use the actual existing paid-repair transaction and safe replay."""

import json

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_islands_and_waves_sql import balance, call  # noqa: E402
from server.tests.island_sql.test_structure_repair_sql import (  # noqa: E402
    OWNER,
    hp,
    instance,
    repair,
    seed_recovery,
)


@pytest.mark.parametrize("spot", ["wall_13", "wall_128"])
def test_added_piece_repairs_once_and_retry_never_charges_twice(database, spot):
    seed_recovery(database)
    database.execute(
        "insert into public.island_wall_policy (island_owner,rule_version,capacity) values (%s,1,128)",
        (OWNER,),
    )
    database.execute(
        "insert into public.island_layout (island_owner,plot,x_half,z_half) values (%s,%s,-20,-10)",
        (OWNER, spot),
    )
    marker = {
        "owner": str(OWNER),
        "payer": str(OWNER),
        "actionUid": "repair-seed-001",
        "plots": [spot],
    }
    call(database, "select set_config('app.positioned_wall_build',%s,true)", json.dumps(marker))
    database.execute(
        "insert into public.islet_buildings "
        "(player_id,plot,building_type,level,coins_paid,timber_paid,ref) "
        "values (%s,%s,'wall',1,10,0,%s)",
        (OWNER, spot, f"island:repair-seed-001:{spot}"),
    )
    database.execute(
        "insert into public.island_structure_health "
        "(island_owner,spot,instance_id,building_kind,level,hp_units,max_hp,config_version,"
        "settled_at,rate_numerator,rate_denominator) "
        "values (%s,%s,%s,'wall',1,500000,60,1,clock_timestamp(),0,1)",
        (OWNER, spot, instance(database, spot)),
    )
    before = balance(database, OWNER)
    done = repair(database, spot=spot)
    retry = repair(database, spot=spot)
    assert done["status"] == "done" and done["receipt"]["spot"] == spot
    assert retry["repeat"] is True and retry["receipt"] == done["receipt"]
    assert balance(database, OWNER) == before - 10
    assert hp(database, spot) == (1000000, 1)


@pytest.mark.parametrize("spot", ["wall_01", "wall_129", "wall_999", "WALL_13"])
def test_noncanonical_repair_ids_still_fail_before_payment(database, spot):
    seed_recovery(database)
    before = balance(database, OWNER)
    with pytest.raises(psycopg.errors.RaiseException, match="bad_structure_repair"):
        with database.transaction():
            repair(database, spot=spot, instance_id=instance(database))
    assert balance(database, OWNER) == before
    assert hp(database) == (500000, 0)
