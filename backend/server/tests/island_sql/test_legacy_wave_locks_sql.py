"""SQL regressions for legacy wave locks and recovery-policy write fences.

Run on the private disposable PostgreSQL fixture from backend/:

    CASE_PG_SCRATCH=1 UV_CACHE_DIR=/tmp/t55-uv-cache \
        uv run --with pgserver --with 'psycopg[binary]' \
        pytest -q server/tests/island_sql/test_legacy_wave_locks_sql.py
"""

from uuid import UUID

import pytest

pytest.importorskip("psycopg")

from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    OWNER,
    add_players,
    as_server,
    build,
    call,
    finish,
    move_start,
    open_island,
    start,
)
from server.tests.island_sql.test_wall_recovery_sql import record, restore  # noqa: E402
from server.tests.island_sql.test_wave_crews_sql import join  # noqa: E402

FRIEND = UUID(int=991)


def mark_recovery_v1(database):
    database.execute(
        "update public.island_recovery_state set recovery_version = 1, wave_protocol = 2 "
        "where island_owner = %s",
        (OWNER,),
    )


def test_legacy_start_refuses_new_policy_and_wall_calls_cannot_write_it(database):
    add_players(database, OWNER, FRIEND)
    open_island(database, OWNER, "K7Q2M")
    build(database, OWNER, "wall_1", "wall", "island:click-0001")
    legacy_wave = start(database, OWNER, "bell-v0-0001", owner=OWNER)
    assert start(database, OWNER, "bell-v0-0001", owner=OWNER) == {
        **legacy_wave,
        "repeat": True,
    }
    mark_recovery_v1(database)
    database.execute(
        "insert into public.recovery_wave_states "
        "(wave_id, island_owner, reset_epoch, recovery_version, wave_protocol, initial_snapshot) "
        "select %s, %s, reset_epoch, 1, 2, '{}'::jsonb "
        "from public.island_recovery_state where island_owner = %s",
        (legacy_wave["waveId"], OWNER, OWNER),
    )

    as_server(database)
    started = call(
        database,
        "select public.wave_start(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
        OWNER,
        "bell-v0-0001",
        "island",
        OWNER,
        123,
        0,
        0,
        600,
        100,
        "calm",
        1,
        0,
    )
    assert started == {
        "status": "refused",
        "reason": "client_update_required",
        "recoveryVersion": 1,
        "waveProtocol": 2,
    }

    restore_answer = restore(database, "fix-v1-0001")
    assert restore_answer == {
        "status": "refused",
        "reason": "client_update_required",
        "recoveryVersion": 1,
        "waveProtocol": 2,
    }

    assert record(database, OWNER, legacy_wave["waveId"], {"wall_1": 25}) == {"status": "skipped"}
    assert database.execute(
        "select wall_health from public.islet_buildings where player_id = %s and plot = 'wall_1'",
        (OWNER,),
    ).fetchone() == (100,)


def test_legacy_join_and_both_finish_overloads_refuse_recovery_v1_waves(database):
    add_players(database, OWNER, FRIEND)
    open_island(database, OWNER, "K7Q2M")
    wave = start(database, OWNER, "bell-v1-0002", owner=OWNER)
    database.execute(
        "insert into public.recovery_wave_states "
        "(wave_id, island_owner, reset_epoch, recovery_version, wave_protocol, initial_snapshot) "
        "select %s, %s, reset_epoch, 1, 2, '{}'::jsonb "
        "from public.island_recovery_state where island_owner = %s",
        (wave["waveId"], OWNER, OWNER),
    )
    mark_recovery_v1(database)

    refusal = {
        "status": "refused",
        "reason": "client_update_required",
        "recoveryVersion": 1,
        "waveProtocol": 2,
    }
    assert join(database, FRIEND, wave["waveId"]) == refusal

    as_server(database)
    for query, params in (
        (
            "select public.wave_finish(%s,%s,%s,%s,%s,%s,%s,%s)",
            (OWNER, wave["waveId"], True, 10, 10, 5, 5, 20),
        ),
        (
            "select public.wave_finish(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (OWNER, wave["waveId"], True, 10, 10, 5, 5, 20, 10, 2, 0),
        ),
    ):
        answer = call(database, query, *params)
        assert answer == refusal


def test_reset_and_a_visitor_finish_serialize_without_deadlock(scratch_server, database):
    import threading

    add_players(database, OWNER, FRIEND)
    open_island(database, OWNER, "K7Q2M")
    wave = start(database, OWNER, "bell-race-0001", owner=OWNER)
    join(database, FRIEND, wave["waveId"])
    as_server(database)
    database.execute(
        "update public.wave_runs set minimum_seconds = 0 where id = %s",
        (wave["waveId"],),
    )
    move_start(database, wave["waveId"], 20)
    database.commit()

    barrier = threading.Barrier(2)
    results = {}
    failures = []

    def run_finish():
        try:
            import psycopg

            with psycopg.connect(scratch_server.get_uri()) as connection:
                connection.execute("set lock_timeout = '10s'")
                as_server(connection)
                barrier.wait(timeout=5)
                results["finish"] = call(
                    connection,
                    "select public.wave_finish(%s,%s,true,10,10,5,5,20)",
                    FRIEND,
                    wave["waveId"],
                )
                connection.commit()
        except Exception as error:  # retain the worker exception for the assertion below
            failures.append(error)

    def run_reset():
        try:
            import psycopg

            with psycopg.connect(scratch_server.get_uri()) as connection:
                connection.execute("set lock_timeout = '10s'")
                as_server(connection)
                barrier.wait(timeout=5)
                results["reset"] = call(
                    connection,
                    "select public.island_fresh_start(%s,%s,%s,%s)",
                    OWNER,
                    "reset-race-0001",
                    "K7Q2M",
                    100,
                )
                connection.commit()
        except Exception as error:
            failures.append(error)

    workers = [threading.Thread(target=run_finish), threading.Thread(target=run_reset)]
    for worker in workers:
        worker.start()
    for worker in workers:
        worker.join(timeout=10)

    try:
        assert not any(worker.is_alive() for worker in workers), "reset/finish lock cycle timed out"
        assert failures == []
        assert results["reset"]["status"] in {"done", "refused"}
        if results["reset"]["status"] == "refused":
            assert results["reset"]["reason"] == "wave_running"
        assert results["finish"]["status"] in {"done", "refused"}
        if results["finish"]["status"] == "refused":
            assert results["finish"]["reason"] == "no_such_wave"
    finally:
        with __import__("psycopg").connect(scratch_server.get_uri(), autocommit=True) as cleanup:
            cleanup.execute("delete from auth.users where id = any(%s)", ([OWNER, FRIEND],))


def test_migration_keeps_only_the_final_service_role_legacy_signatures(database):
    rows = database.execute(
        "select proname, pg_get_function_identity_arguments(oid) "
        "from pg_proc where pronamespace = 'public'::regnamespace "
        "and proname in ('wave_start', 'wave_join', 'wave_finish', "
        "'island_wall_restore', 'island_walls_record') order by proname, pronargs"
    ).fetchall()
    assert rows == [
        (
            "island_wall_restore",
            "p_player_id uuid, p_island_owner uuid, p_plot text, p_action_uid text, "
            "p_full_price integer, p_recover_seconds integer",
        ),
        ("island_walls_record", "p_player_id uuid, p_wave_id uuid, p_walls jsonb"),
        (
            "wave_finish",
            "p_player_id uuid, p_wave_id uuid, p_survived boolean, p_ships_sunk integer, "
            "p_loot_base integer, p_loot_per_wave integer, p_loot_per_house integer, "
            "p_point_loot_base integer",
        ),
        (
            "wave_finish",
            "p_player_id uuid, p_wave_id uuid, p_survived boolean, p_ships_sunk integer, "
            "p_loot_base integer, p_loot_per_wave integer, p_loot_per_house integer, "
            "p_point_loot_base integer, p_boss_every integer, p_boss_multiplier integer, "
            "p_restart_back integer",
        ),
        (
            "wave_join",
            "p_player_id uuid, p_wave_id uuid",
        ),
        (
            "wave_start",
            "p_player_id uuid, p_action_uid text, p_place text, p_island_owner uuid, "
            "p_seed integer, p_countdown_seconds integer, p_minimum_seconds integer, "
            "p_maximum_seconds integer, p_highest_wave integer, p_weather_kind text, "
            "p_weather_ships numeric, p_weather_fog numeric",
        ),
    ]
    grants = database.execute(
        "select bool_or(has_function_privilege('anon', oid, 'execute')) "
        "from pg_proc where pronamespace = 'public'::regnamespace and proname in "
        "('wave_start', 'wave_join', 'wave_finish', 'island_wall_restore', 'island_walls_record')"
    ).fetchone()[0]
    assert grants is False


def test_frozen_legacy_wave_keeps_legacy_finish_after_policy_advances(database):
    add_players(database, OWNER, FRIEND)
    open_island(database, OWNER, "K7Q2M")
    wave = start(database, OWNER, "bell-v0-0002", owner=OWNER)
    move_start(database, wave["waveId"], 20)
    mark_recovery_v1(database)

    result = finish(database, OWNER, wave["waveId"])
    repeated = finish(database, OWNER, wave["waveId"], survived=False)

    assert result["status"] == "done"
    assert result["loot"] == 15
    assert result["flags"] == 1
    assert repeated == {**result, "repeat": True}
