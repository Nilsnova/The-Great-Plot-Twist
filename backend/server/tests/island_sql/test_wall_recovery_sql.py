"""Real SQL checks for 20261114100000_wall_recovery.sql: wall damage that stays after a wave and
the paid Repair/Rebuild between waves (decision D039, proposed).

Opt-in, like test_demolish_sql.py, on a disposable local PostgreSQL with every migration applied
twice. Run from backend/:

    CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
        pytest -q server/tests/island_sql/test_wall_recovery_sql.py

Each test is one transaction, rolled back at the end.
"""

import json
from uuid import UUID

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    OWNER,
    add_players,
    as_owner,
    as_server,
    balance,
    build,
    call,
    finish,
    ledger,
    move_start,
    open_island,
    start,
)

STRANGER = UUID(int=951)
FULL_PRICE = 9  # a level-2 wall: 30% of 10 + 20, rounded up
RECOVER = 600


def record(database, player, wave_id, walls):
    as_server(database)
    return call(
        database,
        "select public.island_walls_record(%s, %s, %s::jsonb)",
        player,
        wave_id,
        json.dumps(walls),
    )


def restore(database, uid, plot="wall_1", player=OWNER, full=FULL_PRICE):
    as_server(database)
    return call(
        database,
        "select public.island_wall_restore(%s, %s, %s, %s, %s, %s)",
        player,
        OWNER,
        plot,
        uid,
        full,
        RECOVER,
    )


def wall(database, plot="wall_1"):
    return database.execute(
        "select wall_health, wall_damaged_at is not null, level from public.islet_buildings "
        "where player_id = %s and plot = %s",
        (OWNER, plot),
    ).fetchone()


def island_with_a_fought_wave(database):
    """OWNER's island with wall_1 and wall_2, after one finished wave. Returns the wave id."""
    add_players(database, OWNER, STRANGER)
    open_island(database, OWNER, "K7Q2M")
    build(database, OWNER, "wall_1", "wall", "island:click-0001")
    build(database, OWNER, "wall_2", "wall", "island:click-0002")
    wave = start(database, OWNER, "bell-0001", owner=OWNER)
    move_start(database, wave["waveId"], 20)
    finish(database, OWNER, wave["waveId"])
    return wave["waveId"]


def test_old_walls_and_new_buildings_start_whole(database):
    island_with_a_fought_wave(database)
    assert wall(database) == (100, False, 1)


def test_the_first_finish_records_the_walls_and_a_second_changes_nothing(database):
    wave_id = island_with_a_fought_wave(database)

    first = record(database, OWNER, wave_id, {"wall_1": 40, "wall_2": 100, "wall_9": 0})
    second = record(database, OWNER, wave_id, {"wall_1": 0})

    assert first == {"status": "recorded"} and second == {"status": "repeat"}
    assert wall(database, "wall_1") == (40, True, 1)
    assert wall(database, "wall_2") == (100, False, 1)  # whole: no timer


def test_a_player_who_was_not_in_the_wave_records_nothing(database):
    wave_id = island_with_a_fought_wave(database)
    assert record(database, STRANGER, wave_id, {"wall_1": 0}) == {"status": "skipped"}
    assert wall(database) == (100, False, 1)


def test_a_health_above_100_is_refused(database):
    wave_id = island_with_a_fought_wave(database)
    as_server(database)
    with pytest.raises(psycopg.errors.RaiseException):
        record(database, OWNER, wave_id, {"wall_1": 101})


def test_a_repair_takes_the_missing_share_once_and_makes_the_wall_whole(database):
    wave_id = island_with_a_fought_wave(database)
    record(database, OWNER, wave_id, {"wall_1": 40})
    before = balance(database, OWNER)

    done = restore(database, "fix-00001")
    repeat = restore(database, "fix-00001")
    again = restore(database, "fix-00002")

    # 9 x 60% = 5.4, rounded up to 6.
    assert done == {"status": "done", "balance": before - 6, "price": 6, "repeat": False}
    assert repeat["repeat"] is True and repeat["balance"] == before - 6
    assert again == {"status": "refused", "reason": "intact"}
    assert wall(database) == (100, False, 1)
    assert ledger(database, OWNER, "building_purchase")[-1] == (-6, "wallfix:fix-00001")


def test_a_rebuild_keeps_the_level_and_costs_the_full_price(database):
    wave_id = island_with_a_fought_wave(database)
    record(database, OWNER, wave_id, {"wall_1": 0})

    assert restore(database, "fix-00001")["price"] == FULL_PRICE
    assert wall(database) == (100, False, 1)


def test_not_enough_coins_changes_nothing(database):
    wave_id = island_with_a_fought_wave(database)
    record(database, OWNER, wave_id, {"wall_1": 0})

    refused = restore(database, "fix-00001", full=100000)

    assert refused == {"status": "refused", "reason": "insufficient_funds", "price": 100000}
    assert wall(database) == (0, True, 1)


def test_no_repair_while_a_wave_runs_on_the_island(database):
    wave_id = island_with_a_fought_wave(database)
    record(database, OWNER, wave_id, {"wall_1": 40})
    start(database, OWNER, "bell-0002", owner=OWNER)

    assert restore(database, "fix-00001") == {"status": "refused", "reason": "wave_running"}


def test_a_wall_whose_timer_ran_out_counts_as_whole(database):
    wave_id = island_with_a_fought_wave(database)
    record(database, OWNER, wave_id, {"wall_1": 40})
    as_owner(database)
    database.execute(
        "update public.islet_buildings set wall_damaged_at = now() - interval '11 minutes' "
        "where player_id = %s and plot = 'wall_1'",
        (OWNER,),
    )

    assert restore(database, "fix-00001") == {"status": "refused", "reason": "intact"}


def test_only_walls_and_built_spots_are_restored(database):
    island_with_a_fought_wave(database)
    build(database, OWNER, "house_1", "house", "island:click-0003", coins=50)

    assert restore(database, "fix-00001", plot="house_1")["reason"] == "wrong_kind"
    assert restore(database, "fix-00002", plot="wall_3")["reason"] == "not_built"


def test_no_browser_role_may_run_the_functions_or_read_the_records(database):
    for role in ("anon", "authenticated"):
        as_owner(database)
        database.execute("savepoint browser")
        database.execute(f"set local role {role}")
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            database.execute("select * from public.island_wall_records")
        database.execute("rollback to savepoint browser")
