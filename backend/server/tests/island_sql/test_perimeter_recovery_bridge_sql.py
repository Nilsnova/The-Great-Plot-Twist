"""First positioned added wall uses stored geometry, not an edited old wave template.

Requires the selected cohort migrations in the disposable full-chain SQL fixture.
This seeds validated synthetic rows; it does not claim paid construction coverage.
"""

import json

import pytest

pytest.importorskip("psycopg")

from server.tests.island_sql.test_islands_and_waves_sql import as_server, call  # noqa: E402
from server.tests.island_sql.test_structure_recovery_mutations_sql import (  # noqa: E402
    OWNER,
    WAVE,
    seed_v1,
)


def test_first_added_wall_refreshes_before_another_wave_without_mutating_old_snapshot(database):
    seed_v1(database, structures=())
    as_server(database)
    old = call(
        database, "select initial_snapshot from public.recovery_wave_states where wave_id=%s", WAVE
    )
    assert "wall_13" not in old["defaultPositions"]
    database.execute(
        "insert into public.islets(player_id,timber) values(%s,0) on conflict do nothing", (OWNER,)
    )
    database.execute(
        "insert into public.island_wall_policy(island_owner,rule_version,capacity) "
        "values(%s,1,128)",
        (OWNER,),
    )
    database.execute(
        "insert into public.island_layout(island_owner,plot,x_half,z_half,moved_by) "
        "values(%s,'wall_13',5,-32,%s)",
        (OWNER, OWNER),
    )
    context = dict(
        owner=str(OWNER), payer=str(OWNER), actionUid="bridge-wall-001", plots=["wall_13"]
    )
    call(database, "select set_config('app.positioned_wall_build',%s,true)", json.dumps(context))
    instance = call(
        database,
        "insert into public.islet_buildings"
        "(player_id,plot,building_type,level,coins_paid,timber_paid,ref) "
        "values(%s,'wall_13','wall',1,10,0,'island:bridge-wall-001:wall_13') "
        "returning recovery_instance_id",
        OWNER,
    )
    refreshed = call(
        database,
        "select public.structure_recovery_refresh_locked(%s,clock_timestamp(),null)",
        OWNER,
    )
    row = next(row for row in refreshed["structures"] if row["spot"] == "wall_13")
    assert row["instanceId"] == str(instance)
    assert (row["hpUnits"], row["maxHP"], row["repairSeq"]) == (1_000_000, 60, 0)
    assert refreshed["positions"]["wall_13"] == {"x": 2.5, "z": -16}
    assert (
        call(
            database,
            "select initial_snapshot from public.recovery_wave_states where wave_id=%s",
            WAVE,
        )
        == old
    )
