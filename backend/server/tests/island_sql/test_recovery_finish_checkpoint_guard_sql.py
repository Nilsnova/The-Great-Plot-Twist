"""Malformed first recovery finishes cannot replace the required canonical checkpoint.

Uses the full migration chain on the existing disposable Unix-socket PostgreSQL fixture.
"""

import json
from uuid import UUID

import pytest

pytest.importorskip("psycopg")

from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    OWNER,
    add_players,
    as_owner,
    as_server,
    balance,
    call,
    open_island,
)
from server.tests.island_sql.test_recovery_wave_end_sql import move_start  # noqa: E402
from server.tests.island_sql.test_structure_recovery_mutations_sql import template  # noqa: E402

FINISH = (
    "select public.recovery_wave_finish(%s,%s,true,7,10,5,5,20,5,2,2,%s,%s,"
    "%s,%s,0,%s::jsonb,%s::jsonb)"
)


def start_wall_wave(db):
    add_players(db, OWNER)
    open_island(db, OWNER, "K7Q2M")
    as_server(db)
    assert (
        call(
            db, "select public.island_build(%s,%s,'wall_1','wall','guard-wall01',10)", OWNER, OWNER
        )["status"]
        == "done"
    )
    as_owner(db)
    db.execute(
        "update public.islet_buildings set wall_health=40,"
        "wall_damaged_at=now()-interval '5 minutes' where player_id=%s and plot='wall_1'",
        (OWNER,),
    )
    as_server(db)
    current = template((("wall_1", "wall"),))
    current["expectedRevision"] = call(
        db, "select revision from public.island_recovery_state where island_owner=%s", OWNER
    )
    started = call(
        db,
        "select public.recovery_wave_start(%s,'guard-wave01','island',%s,4242,0,15,900,50,"
        "'calm',1,0,%s::text[],%s::jsonb,true,2::smallint)",
        OWNER,
        OWNER,
        ["structure_recovery"],
        json.dumps(current),
    )
    assert started["status"] == "started", started
    wave, snapshot = UUID(started["waveId"]), started["initialSnapshot"]
    move_start(db, wave, 20)
    page = call(db, "select public.recovery_wave_events_page(%s,%s,0,null,null)", OWNER, wave)
    structure = snapshot["structures"][0]
    assert len(snapshot["structures"]) == 1 and structure["hpUnits"] == 400000
    return wave, UUID(snapshot["islandEpoch"]), structure["instanceId"], page


def state(db, wave):
    return (
        balance(db, OWNER),
        db.execute(
            "select finished_at,survived,loot,expired from public.wave_runs where id=%s", (wave,)
        ).fetchone(),
        db.execute(
            "select closed_at,closed_hp,checkpoint_uid,checkpoint_accepted_at "
            "from public.recovery_wave_states "
            "where wave_id=%s",
            (wave,),
        ).fetchone(),
        db.execute(
            "select hp_units,repair_seq from public.island_structure_health "
            "where island_owner=%s and spot='wall_1'",
            (OWNER,),
        ).fetchone(),
        db.execute(
            "select wave_best,flags,next_wave,won_wave_best from public.islands where player_id=%s",
            (OWNER,),
        ).fetchone(),
        db.execute(
            "select finished_at,survived,loot from public.wave_participants "
            "where wave_id=%s and player_id=%s",
            (wave, OWNER),
        ).fetchone(),
        call(
            db,
            "select count(*) from public.wallet_transactions "
            "where reason='pirate_loot' and ref like %s",
            f"wave:{wave}:%",
        ),
    )


def finish(db, wave, epoch, page, hp, basis, *, tick=None):
    return call(
        db,
        FINISH,
        OWNER,
        wave,
        epoch,
        "guard-finish01",
        page["sealedThroughTick"] if tick is None else tick,
        page["headSeq"],
        json.dumps(basis),
        json.dumps(hp),
    )


@pytest.mark.parametrize("bad", ["missing", "extra", "foreign", "fractional", "healing", "basis"])
def test_first_malformed_vector_cannot_close_pay_or_change_progress(database, bad):
    wave, epoch, instance, page = start_wall_wave(database)
    hp, basis = {instance: 200000}, {instance: 0}
    if bad == "missing":
        hp = {}
    elif bad == "extra":
        hp["00000000-0000-0000-0000-000000000050"] = 0
    elif bad == "foreign":
        hp = {"00000000-0000-0000-0000-000000000050": 0}
    elif bad == "fractional":
        hp[instance] = 1.5
    elif bad == "healing":
        hp[instance] = 400001
    else:
        basis[instance] = 0.5
    before = state(database, wave)
    assert before[2] == (None, None, None, None)
    assert finish(database, wave, epoch, page, hp, basis) == {
        "status": "refused",
        "reason": "checkpoint_divergence",
    }
    assert state(database, wave) == before


def test_valid_first_finish_and_retry_pay_only_once(database):
    wave, epoch, instance, page = start_wall_wave(database)
    before = balance(database, OWNER)
    first = finish(database, wave, epoch, page, {instance: 200000}, {instance: 0})
    assert first["status"] == "done" and first["loot"] == 15 and not first["repeat"]
    assert first["recovery"]["closedHp"] == {instance: 200000}
    assert first["recovery"]["checkpointUid"] == "guard-finish01"
    repeated = finish(database, wave, epoch, page, {instance: 200000}, {instance: 0})
    assert repeated["repeat"] and repeated["recovery"] == first["recovery"]
    assert balance(database, OWNER) == before + 15 and state(database, wave)[-1] == 1


@pytest.mark.parametrize("prefix", ["older", "divergent"])
def test_existing_accepted_checkpoint_still_supports_finish_fallback(database, prefix):
    wave, epoch, instance, page = start_wall_wave(database)
    accepted = call(
        database,
        "select public.recovery_wave_report_health(%s,%s,%s,'guard-health01',%s,%s,0,"
        "%s::jsonb,%s::jsonb)",
        OWNER,
        wave,
        epoch,
        page["sealedThroughTick"],
        page["headSeq"],
        json.dumps({instance: 0}),
        json.dumps({instance: 200000}),
    )
    assert accepted["status"] == "accepted"
    closed = finish(
        database,
        wave,
        epoch,
        page,
        {instance: 300000},
        {instance: 0},
        tick=0 if prefix == "older" else page["sealedThroughTick"],
    )
    assert closed["status"] == "done" and closed["loot"] == 15
    assert closed["recovery"]["checkpointUid"] == "guard-health01"
    assert closed["recovery"]["closedHp"] == {instance: 200000}
