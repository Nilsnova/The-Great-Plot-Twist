"""Real PostgreSQL checks for the additive T55 recovery state and history schema.

Run only on the disposable full-chain PostgreSQL fixture; every migration is applied twice.
"""

from uuid import UUID, uuid4

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    OWNER,
    add_players,
    as_owner,
    as_server,
    call,
    open_island,
)

OTHER = UUID(int=965)


def build_wall(database, uid: str, plot: str = "wall_1") -> None:
    as_server(database)
    call(
        database,
        "select public.island_build(%s, %s, %s, 'wall', %s, 10)",
        OWNER,
        OWNER,
        plot,
        uid,
    )


def test_recovery_tables_are_service_only_and_protect_normalized_health(database) -> None:
    add_players(database, OWNER)
    open_island(database, OWNER, "K7Q2M")
    build_wall(database, "wall0001")

    assert database.execute(
        "select count(*) from pg_tables where schemaname = 'public' and tablename = any(%s)",
        (
            [
                "island_recovery_state",
                "island_structure_health",
                "recovery_wave_states",
                "recovery_wave_participants",
                "recovery_wave_events",
                "recovery_health_checkpoints",
                "structure_repair_receipts",
            ],
        ),
        ).fetchone() == (7,)
    assert database.execute(
        "select recovery_instance_id is not null from public.islet_buildings "
        "where player_id = %s and plot = 'wall_1'",
        (OWNER,),
    ).fetchone() == (True,)
    assert database.execute(
        "select reset_epoch is not null, recovery_version, wave_protocol "
        "from public.island_recovery_state where island_owner = %s",
        (OWNER,),
    ).fetchone() == (True, 0, 1)

    for table in (
        "island_recovery_state",
        "island_structure_health",
        "recovery_wave_states",
        "recovery_wave_participants",
        "recovery_wave_events",
        "recovery_health_checkpoints",
        "structure_repair_receipts",
    ):
        assert database.execute(
            "select relrowsecurity from pg_class where oid = %s::regclass", (f"public.{table}",)
        ).fetchone() == (True,)
        assert database.execute(
            "select has_table_privilege('anon', %s, 'select'), "
            "has_table_privilege('authenticated', %s, 'select')",
            (f"public.{table}", f"public.{table}"),
        ).fetchone() == (False, False)
        assert database.execute(
            "select has_table_privilege('service_role', %s, 'select')",
            (f"public.{table}",),
        ).fetchone() == (True,)
        assert database.execute(
            "select has_table_privilege('anon', %s, 'insert'), "
            "has_table_privilege('anon', %s, 'update'), "
            "has_table_privilege('authenticated', %s, 'insert'), "
            "has_table_privilege('authenticated', %s, 'delete')",
            (f"public.{table}",) * 4,
        ).fetchone() == (False, False, False, False)

    assert database.execute(
        "select has_table_privilege('service_role', 'public.recovery_wave_events', 'delete'), "
        "has_table_privilege('service_role', 'public.recovery_wave_participants', 'update'), "
        "has_table_privilege('service_role', 'public.structure_repair_receipts', 'update'), "
        "has_table_privilege('service_role', 'public.structure_repair_receipts', 'delete')"
    ).fetchone() == (False, False, False, False)

    as_server(database)
    with pytest.raises(psycopg.errors.CheckViolation):
        with database.transaction():
            database.execute(
                "update public.island_recovery_state set recovery_version = 0, wave_protocol = 2 "
                "where island_owner = %s",
                (OWNER,),
            )
    database.execute(
        "update public.island_recovery_state set recovery_version = 1, wave_protocol = 2, "
        "revision = 1 "
        "where island_owner = %s",
        (OWNER,),
    )
    with pytest.raises(psycopg.errors.RaiseException, match="recovery_state_not_monotonic"):
        with database.transaction():
            database.execute(
                "update public.island_recovery_state set recovery_version = 0, wave_protocol = 1, "
                "revision = 0 where island_owner = %s",
                (OWNER,),
            )
    with pytest.raises(psycopg.errors.CheckViolation):
        with database.transaction():
            database.execute(
                "insert into public.island_structure_health "
                "(island_owner, spot, instance_id, building_kind, level, hp_units, max_hp, "
                "config_version, settled_at, rate_numerator, rate_denominator) "
                "values (%s, 'wall_1', %s, 'wall', 1, 1000001, 60, 1, "
                "clock_timestamp(), 1, 600000)",
                (OWNER, uuid4()),
            )
    for spot, kind in (("tower_1", "watchtower"), ("wall_1", "watchtower")):
        with pytest.raises(psycopg.errors.CheckViolation):
            with database.transaction():
                database.execute(
                    "insert into public.island_structure_health "
                    "(island_owner, spot, instance_id, building_kind, level, hp_units, max_hp, "
                    "config_version, settled_at, rate_numerator, rate_denominator) "
                    "values (%s, %s, %s, %s, 1, 1000000, 60, 1, clock_timestamp(), 1, 1)",
                    (OWNER, spot, uuid4(), kind),
                )


@pytest.mark.parametrize(
    ("hp", "elapsed", "numerator", "denominator", "expected"),
    [
        (0, 600000, 1, 1, 1000000),
        (0, 86400000, 81, 4, 1000000),
        (0, 2592000000, 1, 1, 1000000),
        (0, 1, 0, 1, 0),
        (500000, 300000, 1, 1, 1000000),
        (123456, 1, 1, 3, 123456),
        (1000000, 6000000, 99, 1, 1000000),
    ],
)
def test_sql_projection_uses_integer_units_and_zero_can_recover(
    database, hp, elapsed, numerator, denominator, expected
) -> None:
    as_server(database)
    assert call(
        database,
        "select public.structure_recovery_project_hp(%s, %s, %s, %s)",
        hp,
        elapsed,
        numerator,
        denominator,
    ) == expected


@pytest.mark.parametrize(
    ("starts", "expires", "closed", "now", "expected"),
    [
        (10, 910, None, 9, "preparing"),
        (10, 910, None, 10, "combat"),
        (10, 910, None, 909, "combat"),
        (10, 910, None, 910, "between_waves"),
        (10, 910, 20, 11, "between_waves"),
        (10, 910, None, 1000, "between_waves"),
    ],
)
def test_phase_uses_canonical_expiry_not_request_access_time(
    database, starts, expires, closed, now, expected
) -> None:
    as_server(database)
    assert call(
        database,
        "select public.structure_recovery_phase(to_timestamp(%s), to_timestamp(%s), "
        "to_timestamp(%s), to_timestamp(%s))",
        starts,
        expires,
        closed,
        now,
    ) == expected


def test_database_state_reader_returns_canonical_wire_shape_and_pure_projection(database) -> None:
    from psycopg.types.json import Jsonb

    add_players(database, OWNER)
    open_island(database, OWNER, "K7Q2M")
    build_wall(database, "wall0005")
    as_server(database)
    instance_id = database.execute(
        "select recovery_instance_id from public.islet_buildings "
        "where player_id = %s and plot = 'wall_1'",
        (OWNER,),
    ).fetchone()[0]
    database.execute(
        "update public.island_recovery_state set recovery_version = 1, wave_protocol = 2 "
        "where island_owner = %s",
        (OWNER,),
    )
    database.execute(
        "insert into public.island_structure_health "
        "(island_owner, spot, instance_id, building_kind, level, hp_units, max_hp, config_version, "
        "settled_at, rate_numerator, rate_denominator) "
        "values (%s, 'wall_1', %s, 'wall', 1, 1000, 60, 1, clock_timestamp(), 1, 1)",
        (OWNER, instance_id),
    )
    reply = call(
        database,
        "select public.structure_recovery_read_state(%s, %s)",
        OWNER,
        Jsonb({"wall": [10, 20, 40, 80, 160]}),
    )
    assert reply["status"] == "ok"
    assert reply["recoveryVersion"] == 1 and reply["waveProtocol"] == 2
    assert reply["displayPhase"] == "between_waves"
    assert reply["repairWindow"] == "between_waves"
    assert reply["waveId"] is None and reply["remainingPaidUses"] is None
    assert set(reply) == {
        "status",
        "serverNow",
        "islandEpoch",
        "revision",
        "recoveryVersion",
        "waveProtocol",
        "displayPhase",
        "repairWindow",
        "waveId",
        "remainingPaidUses",
        "structures",
    }
    assert len(reply["structures"]) == 1
    structure = reply["structures"][0]
    assert {key: structure[key] for key in ("spot", "instanceId", "kind", "level")} == {
        "spot": "wall_1",
        "instanceId": str(instance_id),
        "kind": "wall",
        "level": 1,
    }
    anchor = database.execute(
        "select settled_at from public.island_structure_health "
        "where island_owner = %s and spot = 'wall_1'",
        (OWNER,),
    ).fetchone()[0]
    expected_hp = database.execute(
        "select public.structure_recovery_project_hp(1000, "
        "floor(extract(epoch from (%s::timestamptz - %s)) * 1000)::bigint, 1, 1)",
        (reply["serverNow"], anchor),
    ).fetchone()[0]
    assert structure["hpUnits"] == expected_hp
    assert structure["maxHP"] == 60
    assert structure["rateUnitsPerSecond"] == 1666.6666666666667
    assert structure["estimatedFreeSeconds"] == 600
    assert structure["fixedPrice"] == 10
    assert structure["repairSeq"] == 0
    assert database.execute(
        "select hp_units from public.island_structure_health "
        "where island_owner = %s and spot = 'wall_1'",
        (OWNER,),
    ).fetchone() == (1000,)
    assert database.execute(
        "select settled_at from public.island_structure_health "
        "where island_owner = %s and spot = 'wall_1'",
        (OWNER,),
    ).fetchone() == (anchor,)


def test_settle_locked_materializes_normal_between_wave_health(database) -> None:
    add_players(database, OWNER)
    open_island(database, OWNER, "K7Q2M")
    build_wall(database, "wall0006")
    as_server(database)
    instance_id = database.execute(
        "select recovery_instance_id from public.islet_buildings "
        "where player_id = %s and plot = 'wall_1'",
        (OWNER,),
    ).fetchone()[0]
    database.execute(
        "update public.island_recovery_state set recovery_version = 1, wave_protocol = 2 "
        "where island_owner = %s",
        (OWNER,),
    )
    database.execute(
        "insert into public.island_structure_health "
        "(island_owner, spot, instance_id, building_kind, level, hp_units, max_hp, config_version, "
        "settled_at, rate_numerator, rate_denominator) "
        "values (%s, 'wall_1', %s, 'wall', 1, 500000, 60, 1, "
        "clock_timestamp() - interval '5 minutes', 1, 1)",
        (OWNER, instance_id),
    )
    database.execute("select 1 from public.islands where player_id = %s for update", (OWNER,))
    server_now = database.execute("select clock_timestamp()").fetchone()[0]
    settled = call(
        database,
        "select public.structure_recovery_settle_locked(%s, %s)",
        OWNER,
        server_now,
    )
    assert settled["status"] == "between_waves"
    assert database.execute(
        "select hp_units, settled_at from public.island_structure_health "
        "where island_owner = %s and spot = 'wall_1'",
        (OWNER,),
    ).fetchone() == (1000000, server_now)

    # A shorter interval uses the precise integer projection from the passed
    # post-lock timestamp and advances the materialization anchor once.
    database.execute(
        "update public.island_structure_health set hp_units = 500000, "
        "settled_at = %s - interval '60 seconds' where island_owner = %s and spot = 'wall_1'",
        (server_now, OWNER),
    )
    database.execute("select 1 from public.islands where player_id = %s for update", (OWNER,))
    server_now = database.execute("select clock_timestamp()").fetchone()[0]
    expected = database.execute(
        "select public.structure_recovery_project_hp(500000, "
        "floor(extract(epoch from (%s - settled_at)) * 1000)::bigint, 1, 1) "
        "from public.island_structure_health where island_owner = %s and spot = 'wall_1'",
        (server_now, OWNER),
    ).fetchone()[0]
    call(
        database,
        "select public.structure_recovery_settle_locked(%s, %s)",
        OWNER,
        server_now,
    )
    assert database.execute(
        "select hp_units, settled_at from public.island_structure_health "
        "where island_owner = %s and spot = 'wall_1'",
        (OWNER,),
    ).fetchone() == (expected, server_now)


def test_post_bell_build_is_readable_and_survives_expiry_settlement(database) -> None:
    from psycopg.types.json import Jsonb

    add_players(database, OWNER)
    open_island(database, OWNER, "K7Q2M")
    build_wall(database, "wall0007")
    as_server(database)
    original_id = database.execute(
        "select recovery_instance_id from public.islet_buildings "
        "where player_id = %s and plot = 'wall_1'",
        (OWNER,),
    ).fetchone()[0]
    reset_epoch = database.execute(
        "select reset_epoch from public.island_recovery_state where island_owner = %s",
        (OWNER,),
    ).fetchone()[0]
    database.execute(
        "update public.island_recovery_state set recovery_version = 1, wave_protocol = 2, "
        "revision = 1 where island_owner = %s",
        (OWNER,),
    )
    database.execute(
        "insert into public.island_structure_health "
        "(island_owner, spot, instance_id, building_kind, level, hp_units, max_hp, config_version, "
        "settled_at, rate_numerator, rate_denominator) "
        "values (%s, 'wall_1', %s, 'wall', 1, 600000, 60, 1, clock_timestamp(), 0, 1)",
        (OWNER, original_id),
    )
    wave_id = uuid4()
    initial_snapshot = {
        "recoveryVersion": 1,
        "waveProtocol": 2,
        "waveId": str(wave_id),
        "priceSchedule": {"wall": [10, 20, 40, 80, 160]},
        "structures": [
            {
                "instanceId": str(original_id),
                "spot": "wall_1",
                "kind": "wall",
                "level": 1,
                "hpUnits": 600000,
                "maxHP": 60,
                "repairSeq": 0,
            }
        ],
    }
    database.execute(
        "insert into public.recovery_wave_states "
        "(wave_id, island_owner, reset_epoch, recovery_version, wave_protocol, initial_snapshot) "
        "values (%s, %s, %s, 1, 2, %s)",
        (wave_id, OWNER, reset_epoch, Jsonb(initial_snapshot)),
    )
    database.execute(
        "update public.island_recovery_state set current_wave_id = %s, "
        "reserved_at = clock_timestamp(), "
        "starts_at = clock_timestamp(), expires_at = clock_timestamp() + interval '10 minutes' "
        "where island_owner = %s",
        (wave_id, OWNER),
    )

    # A new build after the bell is present in current island state but absent
    # from the immutable combat HP vector.
    build_wall(database, "wall0008", "wall_2")
    next_wave_id = database.execute(
        "select recovery_instance_id from public.islet_buildings "
        "where player_id = %s and plot = 'wall_2'",
        (OWNER,),
    ).fetchone()[0]
    database.execute(
        "insert into public.island_structure_health "
        "(island_owner, spot, instance_id, building_kind, level, hp_units, max_hp, config_version, "
        "settled_at, rate_numerator, rate_denominator) "
        "values (%s, 'wall_2', %s, 'wall', 1, 750000, 60, 1, clock_timestamp(), 0, 1)",
        (OWNER, next_wave_id),
    )
    read = call(
        database,
        "select public.structure_recovery_read_state(%s, %s)",
        OWNER,
        Jsonb({"wall": [10, 20, 40, 80, 160]}),
    )
    assert read["displayPhase"] in {"preparing", "combat"}
    assert {item["instanceId"]: item["hpUnits"] for item in read["structures"]} == {
        str(original_id): 600000,
        str(next_wave_id): 750000,
    }
    next_wave_structure = next(
        item for item in read["structures"] if item["instanceId"] == str(next_wave_id)
    )
    assert next_wave_structure["maxHP"] == 60

    database.execute(
        "update public.island_recovery_state "
        "set reserved_at = clock_timestamp() - interval '11 minutes', "
        "starts_at = clock_timestamp() - interval '10 minutes', "
        "expires_at = clock_timestamp() - interval '1 second' "
        "where island_owner = %s",
        (OWNER,),
    )
    database.execute("select 1 from public.islands where player_id = %s for update", (OWNER,))
    server_now = database.execute("select clock_timestamp()").fetchone()[0]
    settled = call(
        database,
        "select public.structure_recovery_settle_locked(%s, %s)",
        OWNER,
        server_now,
    )
    assert settled["status"] == "settled"
    assert database.execute(
        "select hp_units from public.island_structure_health "
        "where island_owner = %s and spot = 'wall_2' and instance_id = %s",
        (OWNER, next_wave_id),
    ).fetchone() == (750000,)
    assert database.execute(
        "select current_wave_id from public.island_recovery_state where island_owner = %s",
        (OWNER,),
    ).fetchone() == (None,)


def test_snapshot_is_immutable_and_journal_history_outlives_legacy_wave_rows(database) -> None:
    from psycopg.types.json import Jsonb

    add_players(database, OWNER, OTHER)
    open_island(database, OWNER, "K7Q2M")
    build_wall(database, "wall0002")
    as_server(database)
    wave_id = call(
        database,
        "select public.wave_start(%s, 'bell-0002', 'island', %s, 77, 10, 15, 900, 50, "
        "'storm', 1.5, 0)->>'waveId'",
        OWNER,
        OWNER,
    )
    wave_id = UUID(wave_id)
    reset_epoch = uuid4()
    participant_token = uuid4()
    snapshot = {
        "recoveryVersion": 1,
        "waveProtocol": 2,
        "waveId": str(wave_id),
        "seed": 77,
        "structures": [],
        "participants": [{"participantToken": str(participant_token)}],
    }
    database.execute(
        "update public.island_recovery_state set reset_epoch = %s, recovery_version = 1, "
        "wave_protocol = 2, revision = 1 where island_owner = %s",
        (reset_epoch, OWNER),
    )
    database.execute(
        "insert into public.recovery_wave_states "
        "(wave_id, island_owner, reset_epoch, recovery_version, wave_protocol, initial_snapshot) "
        "values (%s, %s, %s, 1, 2, %s)",
        (wave_id, OWNER, reset_epoch, Jsonb(snapshot)),
    )
    database.execute(
        "insert into public.recovery_wave_participants "
        "(wave_id, player_id, participant_token) values (%s, %s, %s)",
        (wave_id, OTHER, participant_token),
    )
    database.execute(
        "insert into public.recovery_wave_events "
        "(wave_id, seq, actor_id, participant_token, input_uid, event_kind, effective_tick, "
        "payload) "
        "values (%s, 1, %s, %s, 'input0001', 'captain_input', 5, %s)",
        (wave_id, OTHER, participant_token, Jsonb({"type": "move", "x": 1, "z": 2})),
    )
    database.execute(
        "insert into public.recovery_wave_events "
        "(wave_id, seq, actor_id, participant_token, input_uid, event_kind, effective_tick, "
        "payload) "
        "values (%s, 2, %s, %s, 'input0002', 'captain_input', 6, %s)",
        (wave_id, OTHER, participant_token, Jsonb({"type": "captain_move", "x": 2, "z": 2})),
    )
    database.execute(
        "update public.recovery_wave_states set journal_head = 2 where wave_id = %s", (wave_id,)
    )
    database.execute(
        "update public.recovery_wave_states set checkpoint_actor = %s, "
        "checkpoint_uid = 'checkpoint0001', checkpoint_through_tick = 7, "
        "checkpoint_input_head_seq = 2, checkpoint_last_repair_seq = 0, "
        "checkpoint_basis_repair_seq = %s, checkpoint_hp = %s, "
        "checkpoint_accepted_at = clock_timestamp(), "
        "closed_at = clock_timestamp(), closed_hp = %s where wave_id = %s",
        (OTHER, Jsonb({}), Jsonb({}), Jsonb({}), wave_id),
    )
    as_owner(database)
    database.execute("delete from auth.users where id = %s", (OTHER,))
    as_server(database)
    assert database.execute(
        "select actor_id, input_uid, participant_token from public.recovery_wave_events "
        "where wave_id = %s order by seq",
        (wave_id,),
    ).fetchall() == [
        (None, "input0001", participant_token),
        (None, "input0002", participant_token),
    ]
    assert database.execute(
        "select journal_head from public.recovery_wave_states where wave_id = %s", (wave_id,)
    ).fetchone() == (2,)
    assert database.execute(
        "select checkpoint_actor, checkpoint_uid, closed_hp from public.recovery_wave_states "
        "where wave_id = %s",
        (wave_id,),
    ).fetchone() == (None, "checkpoint0001", {})
    assert database.execute(
        "select count(*) from public.recovery_wave_participants where wave_id = %s", (wave_id,)
    ).fetchone() == (0,)
    database.execute(
        "insert into public.wave_rules (wave_id, rules) values (%s, array['structure_recovery'])",
        (wave_id,),
    )

    with pytest.raises(psycopg.errors.RaiseException, match="recovery_snapshot_immutable"):
        with database.transaction():
            database.execute(
                "update public.recovery_wave_states set initial_snapshot = %s where wave_id = %s",
                (Jsonb({**snapshot, "seed": 78}), wave_id),
            )
    with pytest.raises(psycopg.errors.RaiseException, match="recovery_state_not_monotonic"):
        with database.transaction():
            database.execute(
                "update public.recovery_wave_states set journal_head = 0 where wave_id = %s",
                (wave_id,),
            )
    database.execute("delete from public.wave_runs where id = %s", (wave_id,))
    assert database.execute(
        "select initial_snapshot->>'seed' from public.recovery_wave_states where wave_id = %s",
        (wave_id,),
    ).fetchone() == ("77",)
    assert database.execute(
        "select payload->>'type' from public.recovery_wave_events where wave_id = %s and seq = 1",
        (wave_id,),
    ).fetchone() == ("move",)


def test_rebuilt_structure_gets_a_fresh_instance_identity(database) -> None:
    add_players(database, OWNER)
    open_island(database, OWNER, "K7Q2M")
    build_wall(database, "wall0003")
    old_id = database.execute(
        "select recovery_instance_id from public.islet_buildings "
        "where player_id = %s and plot = 'wall_1'",
        (OWNER,),
    ).fetchone()[0]
    as_owner(database)
    database.execute(
        "delete from public.islet_buildings where player_id = %s and plot = 'wall_1'", (OWNER,)
    )
    build_wall(database, "wall0004")
    new_id = database.execute(
        "select recovery_instance_id from public.islet_buildings "
        "where player_id = %s and plot = 'wall_1'",
        (OWNER,),
    ).fetchone()[0]
    assert new_id != old_id
