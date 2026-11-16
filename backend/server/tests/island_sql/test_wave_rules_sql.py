"""Real SQL checks for 20261114130500_wave_rules.sql: a wave keeps the simulation rules of its
first answer (wave_rules_keep()), so a later join after a flag flip gets the same rules.

Opt-in, like test_wall_recovery_sql.py, on a disposable local PostgreSQL with every migration
applied twice. Run from backend/:

    CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
        pytest -q server/tests/island_sql/test_wave_rules_sql.py

Each test is one transaction, rolled back at the end.
"""

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_islands_and_waves_sql import (  # noqa: E402
    OWNER,
    add_players,
    as_owner,
    as_server,
    call,
    open_island,
    start,
)


def keep(database, wave_id, rules):
    as_server(database)
    return call(database, "select public.wave_rules_keep(%s, %s::text[])", wave_id, rules)


def a_wave(database):
    add_players(database, OWNER)
    open_island(database, OWNER, "K7Q2M")
    return start(database, OWNER, "bell-0001", owner=OWNER)["waveId"]


def test_the_first_call_keeps_the_rules_and_a_later_one_changes_nothing(database):
    wave_id = a_wave(database)

    assert keep(database, wave_id, ["tower_health"]) == {"rules": ["tower_health"]}
    assert keep(database, wave_id, ["pathing", "rescue"]) == {"rules": ["tower_health"]}


def test_tower_obstacles_is_allowed_and_the_combined_rule_set_is_frozen(database):
    wave_id = a_wave(database)

    rules = ["tower_health", "pathing", "tower_obstacles"]
    assert keep(database, wave_id, rules) == {"rules": rules}
    assert keep(database, wave_id, ["tower_health"]) == {"rules": rules}


def test_an_unknown_rule_name_is_refused(database):
    wave_id = a_wave(database)
    with pytest.raises(psycopg.errors.CheckViolation):
        keep(database, wave_id, ["fly"])


def test_players_cannot_read_or_run_it(database):
    wave_id = a_wave(database)
    keep(database, wave_id, ["pathing"])
    as_owner(database)
    database.execute("set local role authenticated")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        database.execute("select public.wave_rules_keep(%s, %s::text[])", (wave_id, ["rescue"]))
