"""Real SQL checks for 20261115140000_guard_crew.sql: the guard (decision D052) is a fourth crew
kind. island_hire() hires one for 60 coins up to the maximum the server passes (3), refuses too
few coins, and the other three kinds work as before.

Opt-in, like test_tower_defense_sql.py (whose helpers it reuses), on a disposable local PostgreSQL
with every migration applied twice. Run from backend/:

    CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
        pytest -q server/tests/island_sql/test_guard_crew_sql.py

Each test is one transaction, rolled back at the end.
"""

import pytest

psycopg = pytest.importorskip("psycopg")

from server.tests.island_sql.test_harpoon_tower_sql import coins  # noqa: E402
from server.tests.island_sql.test_islands_and_waves_sql import OWNER, balance, call  # noqa: E402
from server.tests.island_sql.test_tower_defense_sql import hire, island_row, ready  # noqa: E402

PRICE, MOST = 60, 3


def test_a_new_island_has_no_guard(database):
    ready(database, OWNER)

    assert island_row(database, OWNER, "crew_guard") == 0


def test_guards_are_paid_up_to_the_maximum_and_a_repeat_pays_nothing(database):
    ready(database, OWNER)
    coins(database, OWNER, 100, "test-coins")  # 100 + 100

    assert hire(database, OWNER, "guard", "guard-0001", PRICE, MOST)["count"] == 1
    assert hire(database, OWNER, "guard", "guard-0001", PRICE, MOST)["repeat"] is True
    assert hire(database, OWNER, "guard", "guard-0002", PRICE, MOST)["count"] == 2
    assert hire(database, OWNER, "guard", "guard-0003", PRICE, MOST)["count"] == 3
    assert hire(database, OWNER, "guard", "guard-0004", PRICE, MOST) == {
        "status": "refused",
        "reason": "crew_full",
    }
    assert (island_row(database, OWNER, "crew_guard"), balance(database, OWNER)) == (3, 20)
    # The other kinds did not move.
    for column in ("crew_gunner", "crew_carpenter", "crew_lookout"):
        assert island_row(database, OWNER, column) == 0


def test_too_few_coins_hires_no_guard(database):
    ready(database, OWNER)  # 100 coins

    assert hire(database, OWNER, "guard", "guard-0001", PRICE, MOST)["count"] == 1
    assert hire(database, OWNER, "guard", "guard-0002", PRICE, MOST) == {
        "status": "refused",
        "reason": "insufficient_funds",
        "price": PRICE,
    }
    assert (island_row(database, OWNER, "crew_guard"), balance(database, OWNER)) == (1, 40)


def test_the_old_crew_kinds_are_hired_as_before(database):
    ready(database, OWNER)

    assert hire(database, OWNER, "gunner", "crew-0001")["count"] == 1
    assert hire(database, OWNER, "lookout", "crew-0002", 25, 1)["count"] == 1
    assert hire(database, OWNER, "carpenter", "crew-0003", 30, 2)["count"] == 1
    assert island_row(database, OWNER, "crew_guard") == 0
    assert balance(database, OWNER) == 100 - 40 - 25 - 30


def test_an_unknown_crew_kind_is_refused(database):
    ready(database, OWNER)

    with pytest.raises(psycopg.errors.RaiseException):
        hire(database, OWNER, "cook", "crew-0009")


def test_the_check_rule_keeps_guards_between_0_and_10(database):
    ready(database, OWNER)
    database.execute("reset role")

    with pytest.raises(psycopg.errors.CheckViolation):
        database.execute("update public.islands set crew_guard = 11 where player_id = %s", (OWNER,))


def test_only_the_server_may_hire(database):
    ready(database, OWNER)
    database.execute("reset role")

    def may(role):
        return call(
            database,
            "select has_function_privilege(%s,"
            " 'public.island_hire(uuid, text, text, integer, integer)', 'execute')",
            role,
        )

    assert (may("authenticated"), may("anon"), may("service_role")) == (False, False, True)
