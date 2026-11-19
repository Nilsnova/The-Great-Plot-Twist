"""Real SQL checks for the server-only T7/T45 bounded leaderboard query.

Opt-in disposable PostgreSQL checks run with the full migration chain applied twice:

    CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
        pytest -q server/tests/island_sql/test_leaderboard_query_sql.py
"""

from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    add_players,
    as_server,
    open_island,
)

FUNCTION = "public.leaderboard_best_runs(timestamptz, timestamptz, timestamptz)"
FUNCTION_NAME = "public.leaderboard_best_runs"
CODE_CHARACTERS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # pragma: allowlist secret


def player(number: int) -> UUID:
    return UUID(int=number)


def add_islands(database, count: int) -> list[UUID]:
    owners = [player(10000 + index) for index in range(count)]
    add_players(database, *owners)
    as_server(database)
    for index, owner in enumerate(owners):
        value = index
        code = ""
        for _ in range(5):
            code += CODE_CHARACTERS[value % len(CODE_CHARACTERS)]
            value //= len(CODE_CHARACTERS)
        open_island(database, owner, code)
    return owners


def add_run(
    database,
    owner: UUID,
    run_number: int,
    wave: int,
    finished_at: datetime,
    *,
    survived: bool = True,
    expired: bool = False,
    place: str = "island",
) -> UUID:
    run_id = player(50000 + run_number)
    island_owner = owner if place == "island" else None
    database.execute(
        """
        insert into public.wave_runs (
          id, started_by, action_uid, place, island_owner, wave, seed,
          starts_at, minimum_seconds, maximum_seconds, weather_kind,
          weather_ships, weather_fog, finished_at, survived, ships_sunk, loot, expired
        ) values (
          %s, %s, %s, %s, %s, %s, 4242, %s, 5, 60, 'calm', 1, 0, %s, %s, 3, 0, %s
        )
        """,
        (
            run_id,
            owner,
            f"run_{run_number:05d}",
            place,
            island_owner,
            wave,
            finished_at - timedelta(seconds=5),
            finished_at,
            survived,
            expired,
        ),
    )
    return run_id


def leaderboard(database, cutoff, start=None, end=None):
    as_server(database)
    return database.execute(
        f"select id, island_owner, wave from {FUNCTION_NAME}(%s, %s, %s)",
        (cutoff, start, end),
    ).fetchall()


def test_best_win_per_island_and_ties_use_finish_then_id(database):
    owners = add_islands(database, 3)
    same_finish = datetime(2026, 11, 12, 12, tzinfo=UTC)
    add_run(database, owners[0], 12, 60, same_finish)
    chosen_first = add_run(database, owners[0], 10, 60, same_finish)
    add_run(database, owners[0], 13, 60, same_finish + timedelta(seconds=1))
    earlier_cross_island = add_run(database, owners[1], 3, 60, same_finish)
    add_run(database, owners[2], 5, 59, same_finish - timedelta(days=1))

    rows = leaderboard(database, datetime(2026, 11, 13, tzinfo=UTC))
    assert rows == [
        (earlier_cross_island, owners[1], 60),
        (chosen_first, owners[0], 60),
        (player(50005), owners[2], 59),
    ]


def test_cutoff_and_optional_half_open_week_window(database):
    owners = add_islands(database, 5)
    start = datetime(2026, 11, 9, tzinfo=UTC)
    cutoff = datetime(2026, 11, 13, 12, tzinfo=UTC)
    end = datetime(2026, 11, 16, tzinfo=UTC)
    add_run(database, owners[4], 15, 99, start - timedelta(microseconds=1))
    add_run(database, owners[0], 11, 30, start)
    at_cutoff = add_run(database, owners[1], 12, 29, cutoff)
    add_run(database, owners[2], 13, 28, cutoff + timedelta(microseconds=1))
    add_run(database, owners[3], 14, 27, end)

    assert leaderboard(database, cutoff, start, end) == [
        (player(50011), owners[0], 30),
        (at_cutoff, owners[1], 29),
    ]
    assert leaderboard(database, cutoff) == [
        (player(50015), owners[4], 99),
        (player(50011), owners[0], 30),
        (at_cutoff, owners[1], 29),
    ]
    assert leaderboard(database, end + timedelta(days=1), start, end) == [
        (player(50011), owners[0], 30),
        (at_cutoff, owners[1], 29),
        (player(50013), owners[2], 28),
    ]
def test_losses_expired_runs_and_pirate_point_are_excluded(database):
    owners = add_islands(database, 3)
    finished = datetime(2026, 11, 12, tzinfo=UTC)
    add_run(database, owners[0], 21, 100, finished, survived=False)
    add_run(database, owners[1], 22, 99, finished, survived=False, expired=True)
    add_run(database, owners[2], 23, 98, finished, place="pirate_point")
    assert leaderboard(database, finished + timedelta(days=1)) == []


def test_more_than_two_thousand_repeated_wins_do_not_hide_other_islands(database):
    owners = add_islands(database, 11)
    add_run(database, owners[0], 100, 100, datetime(2026, 11, 12, tzinfo=UTC))
    as_server(database)
    database.execute(
        """
        insert into public.wave_runs (
          started_by, action_uid, place, island_owner, wave, seed, starts_at,
          minimum_seconds, maximum_seconds, weather_kind, weather_ships,
          weather_fog, finished_at, survived, ships_sunk, loot, expired
        )
        select
          %s, 'repeat_' || lpad(number::text, 8, '0'), 'island', %s, 100,
          number,
          timestamptz '2026-11-12 12:00:00+00' - make_interval(secs => number + 1),
          1, 60, 'calm', 1, 0,
          timestamptz '2026-11-12 12:00:00+00' - make_interval(secs => number),
          true, 1, 0, false
        from generate_series(1, 2001) as series(number)
        """,
        (owners[0], owners[0]),
    )
    for index, owner in enumerate(owners[1:], 1):
        add_run(
            database,
            owner,
            200 + index,
            100 - index,
            datetime(2026, 11, 13, 12, tzinfo=UTC) + timedelta(seconds=index),
        )

    cutoff = datetime(2026, 11, 14, tzinfo=UTC)
    rows = leaderboard(database, cutoff)
    assert len(rows) == 10
    assert len({owner for _, owner, _ in rows}) == 10
    assert rows[0][1:] == (owners[0], 100)
    assert [row[1:] for row in rows[1:]] == [
        (owner, 100 - index) for index, owner in enumerate(owners[1:10], 1)
    ]
    assert leaderboard(
        database,
        cutoff,
        datetime(2026, 11, 9, tzinfo=UTC),
        datetime(2026, 11, 16, tzinfo=UTC),
    ) == rows


def test_service_role_only_function_rights_and_argument_validation(database):
    rights = database.execute(
        "select has_function_privilege('anon', %s, 'execute'), "
        "has_function_privilege('authenticated', %s, 'execute'), "
        "has_function_privilege('service_role', %s, 'execute')",
        (FUNCTION, FUNCTION, FUNCTION),
    ).fetchone()
    assert rights == (False, False, True)

    as_server(database)
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        with database.transaction():
            database.execute("set local role anon")
            database.execute(
                "select * from public.leaderboard_best_runs(now(), null, null)"
            ).fetchall()
    as_server(database)
    with pytest.raises(psycopg.errors.InvalidParameterValue):
        with database.transaction():
            database.execute(
                "select * from public.leaderboard_best_runs(null, null, null)"
            ).fetchall()
    with pytest.raises(psycopg.errors.InvalidParameterValue):
        with database.transaction():
            database.execute(
                "select * from public.leaderboard_best_runs(now(), now(), null)"
            ).fetchall()
    with pytest.raises(psycopg.errors.InvalidParameterValue):
        with database.transaction():
            database.execute(
                "select * from public.leaderboard_best_runs(now(), null, now())"
            ).fetchall()
    with pytest.raises(psycopg.errors.InvalidParameterValue):
        with database.transaction():
            database.execute(
                "select * from public.leaderboard_best_runs(now(), now(), now())"
            ).fetchall()
def test_empty_board_returns_no_rows(database):
    assert leaderboard(database, datetime(2026, 11, 13, tzinfo=UTC)) == []
