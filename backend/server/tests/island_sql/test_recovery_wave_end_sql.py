"""Real PostgreSQL checks for 20261118020000_recovery_wave_end.sql (integ/recovery-fixes).

One check per server-side finding of the recovery bug hunt: the finish takes its own complete
prefix (F1), a teammate can still read and finish after the close (F2, F9), abandoned waves end on
the server (F4), a late join lands after the seal (F5), and nothing is appended or sealed past the
last tick (F10).
"""

import json
from uuid import UUID

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    FRIEND,
    OWNER,
    add_players,
    as_owner,
    as_server,
    call,
    open_island,
)

FINISH = (
    "select public.recovery_wave_finish(%s,%s,%s,7,10,5,5,20,5,2,2,%s,%s,"
    "%s,%s,0,'{}'::jsonb,'{}'::jsonb)"
)
PAGE = "select public.recovery_wave_events_page(%s,%s,%s,null,null)"
INPUTS = "select public.recovery_wave_inputs(%s,%s,%s::jsonb)"


def template(database, structures=()):
    value = {
        "configVersion": 1,
        "createWave": {"defenses": []},
        "priceSchedule": {},
        "structureConfigBySpot": {},
        "legacyWallRecoverSeconds": 600,
        "recoveryConfig": {
            "recoveryVersion": 1,
            "waveProtocol": 2,
            "structureMaxHp": {
                "wall": [60, 120, 200, 300, 420],
                "cannon": [80, 130, 200, 290, 400],
                "mortar": [70, 115, 180, 260, 360],
                "harpoon": [60, 100, 155, 230, 320],
                "culverin": [56, 91, 140, 203, 280],
                "swivel": [72, 117, 180, 261, 360],
            },
            "wallSkillMaxHpFactors": {"stone": [2, 1], "bastion": [3, 2]},
            "wallResearchMaxHpFactors": {"thick_walls": [23, 20]},
            "recoveryRateFactors": {
                "carpenterMultiplierPerWorker": 0,
                "carpenterMaximumWorkers": 2,
                "workshopPercentPerHouse": 0,
                "workshopPercentCap": 0,
                "workshopRadius": 10,
                "wallSpecRateFactors": {"quick_mend": [1, 1], "bastion": [1, 1]},
                "wallResearchRateFactors": {"mason_drill": [1, 1]},
            },
        },
        "defaultPositions": {
            spot: {"x": index * 3, "z": 0} for index, (spot, _) in enumerate(structures)
        },
        "eventByWave": {str(wave): None for wave in range(1, 6)},
        "bossByWave": {str(wave): False for wave in range(1, 6)},
    }
    value["structureConfigBySpot"] = {
        spot: {
            "kind": kind,
            "level": 1,
            "maxHP": value["recoveryConfig"]["structureMaxHp"][kind][0],
            "rateNumerator": 1,
            "rateDenominator": 1,
        }
        for spot, kind in structures
    }
    value["expectedRevision"] = database.execute(
        "select revision from public.island_recovery_state where island_owner=%s", (OWNER,)
    ).fetchone()[0]
    return value


def ring(database, uid, structures=()):
    return call(
        database,
        "select public.recovery_wave_start(%s,%s,'island',%s,4242,0,0,900,50,"
        "'calm',1,0,%s::text[],%s::jsonb,true,2::smallint)",
        OWNER,
        uid,
        OWNER,
        ["structure_recovery"],
        json.dumps(template(database, structures)),
    )


def move_start(database, wave_id, seconds, activity=None):
    """Move a wave (and its reservation) `seconds` into the past; optionally its last activity."""
    as_owner(database)
    database.execute(
        "update public.wave_runs set starts_at=now()-make_interval(secs=>%s) where id=%s",
        (seconds, wave_id),
    )
    database.execute(
        "update public.island_recovery_state set starts_at=now()-make_interval(secs=>%s),"
        "reserved_at=now()-make_interval(secs=>%s),"
        "expires_at=now()-make_interval(secs=>%s)+interval '900 seconds' "
        "where island_owner=%s and current_wave_id=%s",
        (seconds, seconds, seconds, OWNER, wave_id),
    )
    if activity is not None:
        database.execute(
            "update public.recovery_wave_states set last_activity_at=now()-make_interval(secs=>%s) "
            "where wave_id=%s",
            (activity, wave_id),
        )
    as_server(database)


def two_player_wave(database, *, join=True, seconds=20):
    add_players(database, OWNER, FRIEND)
    open_island(database, OWNER, "K7Q2M")
    open_island(database, FRIEND, "M8P3N")
    as_server(database)
    started = ring(database, "endwave0001")
    assert started["status"] == "started", started
    wave_id = UUID(started["waveId"])
    move_start(database, wave_id, seconds)
    as_owner(database)
    database.execute(
        "insert into public.island_members(island_owner,player_id,role) values (%s,%s,'member')",
        (OWNER, FRIEND),
    )
    as_server(database)
    if join:
        joined = call(
            database, "select public.recovery_wave_join(%s,%s,2::smallint)", FRIEND, wave_id
        )
        assert joined["status"] == "joined", joined
    epoch = database.execute(
        "select reset_epoch from public.recovery_wave_states where wave_id=%s", (wave_id,)
    ).fetchone()[0]
    return wave_id, epoch


def move(uid, counter, tick=0):
    return json.dumps(
        [
            {
                "inputUid": uid,
                "actorCounter": counter,
                "tick": tick,
                "command": {"type": "captain_move", "x": 1, "z": 2},
            }
        ]
    )


def test_f1_finish_takes_its_own_prefix_after_a_teammate_moved_the_seal_and_head(database):
    wave_id, epoch = two_player_wave(database)
    owner_page = call(database, PAGE, OWNER, wave_id, 0)
    # The teammate keeps playing: a later poll moves the seal, an input moves the head.
    move_start(database, wave_id, 22)
    friend_page = call(database, PAGE, FRIEND, wave_id, 0)
    assert friend_page["sealedThroughTick"] > owner_page["sealedThroughTick"]
    assert call(database, INPUTS, FRIEND, wave_id, move("friendmove01", 1))["status"] == "accepted"
    finished = call(
        database,
        FINISH,
        OWNER,
        wave_id,
        True,
        epoch,
        "ownprefix001",
        owner_page["sealedThroughTick"],
        owner_page["headSeq"],
    )
    assert finished["status"] == "done", finished
    assert finished["loot"] == 15
    assert finished["recovery"]["throughTick"] == owner_page["sealedThroughTick"]
    assert database.execute(
        "select finished_at is not null, survived from public.wave_runs where id=%s", (wave_id,)
    ).fetchone() == (True, True)


def test_f1_an_older_checkpoint_than_an_accepted_one_still_closes_with_the_accepted_one(database):
    wave_id, epoch = two_player_wave(database)
    page = call(database, PAGE, OWNER, wave_id, 0)
    accepted = call(
        database,
        "select public.recovery_wave_report_health(%s,%s,%s,'friendhealth1',%s,%s,0,"
        "'{}'::jsonb,'{}'::jsonb)",
        FRIEND,
        wave_id,
        epoch,
        page["sealedThroughTick"],
        page["headSeq"],
    )
    assert accepted["status"] == "accepted"
    finished = call(
        database, FINISH, OWNER, wave_id, True, epoch, "olderprefix01", 0, page["headSeq"]
    )
    assert finished["status"] == "done", finished
    assert finished["recovery"]["checkpointUid"] == "friendhealth1"


def test_f2_teammate_reads_and_finishes_after_the_close_and_gets_the_first_outcome(database):
    wave_id, epoch = two_player_wave(database)
    page = call(database, PAGE, OWNER, wave_id, 0)
    first = call(
        database,
        FINISH,
        OWNER,
        wave_id,
        True,
        epoch,
        "firstclose01",
        page["sealedThroughTick"],
        page["headSeq"],
    )
    assert first["status"] == "done"
    sealed = database.execute(
        "select sealed_through_tick from public.recovery_wave_states where wave_id=%s", (wave_id,)
    ).fetchone()[0]
    # Before the fix the closed-row trigger turned this poll into an exception.
    move_start(database, wave_id, 25)
    after_close = call(database, PAGE, FRIEND, wave_id, 0)
    assert after_close["status"] == "ok"
    assert after_close["sealedThroughTick"] == sealed
    refused = call(database, INPUTS, FRIEND, wave_id, move("lateinput01", 1))
    assert refused == {"status": "refused", "reason": "wave_over"}
    # F9: the teammate's own claim (lost) does not override the first close (won).
    second = call(
        database,
        FINISH,
        FRIEND,
        wave_id,
        False,
        epoch,
        "secondclose1",
        after_close["sealedThroughTick"],
        after_close["headSeq"],
    )
    assert second["status"] == "done", second
    assert second["survived"] is True
    assert second["loot"] == first["loot"]


def test_f4_an_abandoned_wave_is_not_offered_and_the_next_bell_ends_it(database):
    wave_id, _ = two_player_wave(database, join=False)
    call(database, PAGE, OWNER, wave_id, 0)
    move_start(database, wave_id, 30, activity=5)
    busy = ring(database, "endwave0002")
    assert busy == {"status": "refused", "reason": "wave_running"}
    assert (
        call(
            database,
            "select public.recovery_wave_current(%s,'island',%s,2::smallint)",
            OWNER,
            OWNER,
        )["status"]
        == "running"
    )
    # Nobody has read the journal for more than three minutes (20261118030000; was one).
    move_start(database, wave_id, 300, activity=200)
    assert call(
        database, "select public.recovery_wave_current(%s,'island',%s,2::smallint)", OWNER, OWNER
    ) == {"status": "empty"}
    assert call(
        database, "select public.recovery_wave_join(%s,%s,2::smallint)", FRIEND, wave_id
    ) == {"status": "refused", "reason": "wave_over"}
    assert database.execute(
        "select finished_at is not null, expired, survived from public.wave_runs where id=%s",
        (wave_id,),
    ).fetchone() == (True, True, False)
    assert database.execute(
        "select current_wave_id from public.island_recovery_state where island_owner=%s", (OWNER,)
    ).fetchone() == (None,)
    nxt = ring(database, "endwave0003")
    assert nxt["status"] == "started", nxt
    assert UUID(nxt["waveId"]) != wave_id


def test_f4_a_build_after_an_abandoned_wave_is_not_refused_wave_running(database):
    wave_id, _ = two_player_wave(database, join=False)
    move_start(database, wave_id, 300, activity=200)
    began = call(database, "select public.structure_recovery_mutation_begin(%s)", OWNER)
    assert began["settlement"]["status"] == "settled"
    assert database.execute(
        "select expired from public.wave_runs where id=%s", (wave_id,)
    ).fetchone() == (True,)


def test_f4_v0_islands_keep_legacy_settlement(database):
    add_players(database, OWNER)
    open_island(database, OWNER, "K7Q2M")
    as_server(database)
    assert (
        call(
            database, "select public.structure_recovery_settle_locked(%s,clock_timestamp())", OWNER
        )["status"]
        == "legacy"
    )


def test_f5_a_late_join_lands_after_the_seal_so_earlier_prefixes_stay_complete(database):
    wave_id, epoch = two_player_wave(database, join=False)
    owner_page = call(database, PAGE, OWNER, wave_id, 0)
    assert owner_page["sealedThroughTick"] > 0
    joined = call(database, "select public.recovery_wave_join(%s,%s,2::smallint)", FRIEND, wave_id)
    assert joined["status"] == "joined"
    tick = database.execute(
        "select effective_tick from public.recovery_wave_events where wave_id=%s "
        "and event_kind='participant_joined'",
        (wave_id,),
    ).fetchone()[0]
    assert tick == owner_page["sealedThroughTick"] + 1
    # The owner's sealed prefix is still complete: its checkpoint and a fixed page are accepted.
    assert (
        call(
            database,
            "select public.recovery_wave_events_page(%s,%s,0,%s,%s)",
            OWNER,
            wave_id,
            owner_page["headSeq"],
            owner_page["sealedThroughTick"],
        )["status"]
        == "ok"
    )
    health = call(
        database,
        "select public.recovery_wave_report_health(%s,%s,%s,'ownerafterjoin',%s,%s,0,"
        "'{}'::jsonb,'{}'::jsonb)",
        OWNER,
        wave_id,
        epoch,
        owner_page["sealedThroughTick"],
        owner_page["headSeq"],
    )
    assert health["status"] == "accepted", health


def test_f10_nothing_is_sealed_or_appended_past_the_last_tick(database):
    wave_id, _ = two_player_wave(database)
    # 899.99 s in: a command now would land at tick 18000 (now + 1, 20261118030000), after the last
    # tick 17999.
    move_start(database, wave_id, 899.99)
    late = call(database, INPUTS, OWNER, wave_id, move("lastsecond01", 1, 17995))
    assert late == {"status": "refused", "reason": "wave_over"}
    page = call(database, PAGE, OWNER, wave_id, 0)
    assert page["sealedThroughTick"] <= 17999
    move_start(database, wave_id, 905)
    after = call(database, PAGE, OWNER, wave_id, 0)
    assert after["sealedThroughTick"] == 17999
    assert (
        database.execute(
            "select coalesce(max(effective_tick),0) from public.recovery_wave_events "
            "where wave_id=%s",
            (wave_id,),
        ).fetchone()[0]
        <= 17999
    )


def test_f10_the_append_helper_refuses_a_tick_past_the_maximum(database):
    wave_id, _ = two_player_wave(database)
    as_owner(database)
    database.execute(
        "update public.recovery_wave_states set sealed_through_tick=17999 where wave_id=%s",
        (wave_id,),
    )
    as_server(database)
    with pytest.raises(psycopg.errors.RaiseException, match="recovery_event_after_maximum"):
        database.execute(
            "select public.recovery_wave_append_event_locked(%s,null,null,null,null,null,"
            "'participant_joined',0,'{}'::jsonb)",
            (wave_id,),
        )


SUPPORTED_STRUCTURES = (
    ("wall_1", "wall"),
    ("cannon_1", "cannon"),
    ("cannon_2", "mortar"),
    ("cannon_3", "harpoon"),
    ("cannon_4", "culverin"),
    ("cannon_5", "swivel"),
)


def damaged_supported_wave(database, uid):
    add_players(database, OWNER)
    open_island(database, OWNER, "K7Q2M")
    as_server(database)
    for index, (spot, kind) in enumerate(SUPPORTED_STRUCTURES, start=1):
        call(
            database,
            "select public.islet_build(%s,%s,%s,10,0,0,%s)",
            OWNER,
            spot,
            kind,
            f"{uid[:16]}-{index:04d}",
        )
    started = ring(database, uid, SUPPORTED_STRUCTURES)
    assert started["status"] == "started", started
    wave_id = UUID(started["waveId"])
    move_start(database, wave_id, 20)
    page = call(database, PAGE, OWNER, wave_id, 0)
    epoch = database.execute(
        "select reset_epoch from public.recovery_wave_states where wave_id=%s", (wave_id,)
    ).fetchone()[0]
    rows = database.execute(
        "select instance_id::text from public.island_structure_health "
        "where island_owner=%s order by spot",
        (OWNER,),
    ).fetchall()
    vector = {instance_id: 500_000 for (instance_id,) in rows}
    vector[next(iter(vector))] = 0
    basis = {instance_id: 0 for (instance_id,) in rows}
    accepted = call(
        database,
        "select public.recovery_wave_report_health(%s,%s,%s,'damageprefix01',"
        "%s,%s,0,%s::jsonb,%s::jsonb)",
        OWNER,
        wave_id,
        epoch,
        page["sealedThroughTick"],
        page["headSeq"],
        json.dumps(basis),
        json.dumps(vector),
    )
    assert accepted["status"] == "accepted", accepted
    return wave_id, epoch, page, vector


def assert_full_health_and_closed_damage(database, wave_id, vector):
    assert database.execute(
        "select closed_hp from public.recovery_wave_states where wave_id=%s", (wave_id,)
    ).fetchone()[0] == vector
    assert database.execute(
        "select count(*),min(hp_units),max(hp_units) from public.island_structure_health "
        "where island_owner=%s",
        (OWNER,),
    ).fetchone() == (len(SUPPORTED_STRUCTURES), 1_000_000, 1_000_000)


@pytest.mark.parametrize("survived,uid", [(True, "fullhealthwin01"), (False, "fullhealthloss01")])
def test_a_finished_wave_restores_supported_structures_and_keeps_the_damaged_vector(
    database, survived, uid
):
    wave_id, epoch, page, vector = damaged_supported_wave(database, uid)
    closed = call(
        database,
        FINISH,
        OWNER,
        wave_id,
        survived,
        epoch,
        "closedloss001",
        page["sealedThroughTick"],
        page["headSeq"],
    )
    assert closed["status"] == "done", closed
    assert closed["survived"] is survived
    assert closed["recovery"]["closedHp"] == vector
    assert_full_health_and_closed_damage(database, wave_id, vector)


def test_expiry_and_abandonment_close_damaged_history_and_restore_current_health(database):
    expired_id, _, _, expired_vector = damaged_supported_wave(database, "fullhealexpire01")
    move_start(database, expired_id, 901)
    expired = call(
        database,
        "select public.recovery_wave_current(%s,'island',%s,2::smallint)",
        OWNER,
        OWNER,
    )
    assert expired == {"status": "empty"}
    as_owner(database)
    database.execute("select player_id from public.islands where player_id=%s for update", (OWNER,))
    as_server(database)
    settled = call(database, "select public.structure_recovery_mutation_begin(%s)", OWNER)
    assert settled["settlement"]["status"] == "settled"
    assert_full_health_and_closed_damage(database, expired_id, expired_vector)

    abandoned_id, _, _, abandoned_vector = damaged_supported_wave(
        database, "fullhealabandon01"
    )
    move_start(database, abandoned_id, 300, activity=300)
    next_wave = ring(database, "fullhealnext001", SUPPORTED_STRUCTURES)
    assert next_wave["status"] == "started", next_wave
    assert_full_health_and_closed_damage(database, abandoned_id, abandoned_vector)
