"""Real SQL checks for the class demo migration (20261109010000_demo_window.sql).

Opt-in, on a disposable local PostgreSQL that the case_sql fixture builds (all migrations, applied
twice). Run from backend/:

    CASE_PG_SCRATCH=1 uv run --with pgserver --with 'psycopg[binary]' \
        pytest -q server/tests/demo_sql

Neither package is added to the project. No test reads a database URL or uses the network.
"""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import UUID, uuid4

import pytest

HOST = UUID(int=901)
PLAYER = UUID(int=902)


def as_server(database):
    database.execute("set local role service_role")


def add_players(database, *players):
    for player in players:
        database.execute(
            "insert into auth.users (id) values (%s) on conflict do nothing", (player,)
        )


def call(database, sql, *arguments):
    return database.execute(sql, arguments).fetchone()[0]


def window_set(database, hours, uid=None, host=HOST):
    return call(database, "select public.demo_window_set(%s, %s, %s)", host, uid or uuid4(), hours)


def window_read(database):
    return call(database, "select public.demo_window_read()")


def lock_record(database, uid, answer, outcome, player=PLAYER):
    return call(
        database, "select public.demo_lock_record(%s, %s, %s, %s)", player, uid, answer, outcome
    )


def test_the_window_has_one_closed_row_after_two_runs(database):
    rows = database.execute("select name, open_until from public.demo_window").fetchall()

    assert rows == [("class_demo", None)]
    as_server(database)
    assert window_read(database) == {"open": False, "openUntil": None}


def test_a_host_opens_and_closes_the_window_and_a_repeat_changes_nothing(database):
    add_players(database, HOST)
    as_server(database)
    uid = uuid4()

    opened = window_set(database, 2, uid)
    assert opened["status"] == "set" and opened["repeat"] is False
    assert opened["openUntil"] is not None
    assert window_read(database)["open"] is True

    repeat = window_set(database, 5, uid)
    assert repeat == {**opened, "repeat": True}

    closed = window_set(database, 0)
    assert closed["openUntil"] is None
    assert window_read(database) == {"open": False, "openUntil": None}
    count = call(database, "select count(*) from public.demo_window_actions")
    assert count == 2


def test_an_ended_window_reads_as_closed(database):
    add_players(database, HOST)
    database.execute("update public.demo_window set open_until = now() - interval '1 minute'")
    as_server(database)

    assert window_read(database) == {"open": False, "openUntil": None}


@pytest.mark.parametrize("hours", [-1, 7, None])
def test_hours_outside_zero_to_six_are_refused(database, hours):
    import psycopg

    add_players(database, HOST)
    as_server(database)
    with pytest.raises(psycopg.errors.RaiseException, match="bad_demo_window"):
        window_set(database, hours)


def test_lock_answers_are_stored_once_per_uid_and_capped_at_forty(database):
    add_players(database, PLAYER)
    as_server(database)

    first = lock_record(database, "answer0001", "rain", "wrong")
    assert first == {"status": "recorded", "answer": "rain", "outcome": "wrong", "accepted": False}
    again = lock_record(database, "answer0001", "clear", "exact")
    assert again == {**first, "status": "repeat"}

    for number in range(2, 41):
        lock_record(database, f"answer{number:04d}", "fog", "question_changed")
    assert lock_record(database, "answer0041", "rain", "exact") == {"status": "full"}


def test_accepted_follows_the_outcome_and_odd_values_are_refused(database):
    import psycopg

    add_players(database, PLAYER)
    as_server(database)
    assert lock_record(database, "answer0001", "hint_confirm", "hint")["accepted"] is True
    for uid, answer, outcome in (
        ("short", "rain", "wrong"),
        ("answer0002", "RAIN", "wrong"),
        ("answer0003", "rain", "lucky"),
    ):
        with pytest.raises(psycopg.errors.CheckViolation):
            database.execute("savepoint odd")
            try:
                lock_record(database, uid, answer, outcome)
            finally:
                database.execute("rollback to savepoint odd")


def test_a_player_without_a_profile_is_missing(database):
    as_server(database)

    assert lock_record(database, "answer0001", "rain", "wrong", player=uuid4()) == {
        "status": "missing"
    }


def test_browser_roles_get_nothing(database):
    import psycopg

    add_players(database, PLAYER)
    for role in ("anon", "authenticated"):
        for statement in (
            "select * from public.demo_window",
            "select * from public.demo_window_actions",
            "select * from public.demo_lock_attempts",
            "select public.demo_window_read()",
            f"select public.demo_lock_record('{PLAYER}', 'answer0001', 'rain', 'wrong')",
            f"select public.demo_window_set('{PLAYER}', '{uuid4()}', 6)",
        ):
            database.execute("savepoint denied")
            database.execute(f"set local role {role}")
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                database.execute(statement)
            database.execute("rollback to savepoint denied")


def test_objects_have_rls_comments_and_safe_function_settings(database):
    tables = database.execute(
        "select c.relname, c.relrowsecurity, obj_description(c.oid, 'pg_class') is not null "
        "from pg_class c join pg_namespace n on n.oid = c.relnamespace "
        "where n.nspname = 'public' and c.relkind = 'r' "
        "and c.relname in ('demo_lock_attempts', 'demo_window', 'demo_window_actions') "
        "order by 1"
    ).fetchall()
    assert tables == [
        ("demo_lock_attempts", True, True),
        ("demo_window", True, True),
        ("demo_window_actions", True, True),
    ]
    policies = call(database, "select count(*) from pg_policies where tablename like 'demo_%%'")
    assert policies == 0
    uncommented = call(
        database,
        "select count(*) from information_schema.columns c "
        "where c.table_schema = 'public' and c.table_name like 'demo_%%' "
        "and col_description(format('public.%%I', c.table_name)::regclass, c.ordinal_position) "
        "is null",
    )
    assert uncommented == 0
    functions = database.execute(
        "select p.proname, p.prosecdef, p.proconfig, obj_description(p.oid, 'pg_proc') is not null "
        "from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
        "where n.nspname = 'public' "
        "and p.proname in ('demo_lock_record', 'demo_window_read', 'demo_window_set') order by 1"
    ).fetchall()
    assert [name for name, *_ in functions] == [
        "demo_lock_record",
        "demo_window_read",
        "demo_window_set",
    ]
    for _, definer, config, commented in functions:
        assert definer is False
        assert config == ['search_path=""']
        assert commented is True


def test_deleting_a_player_removes_their_rows_and_keeps_the_window(database):
    add_players(database, HOST, PLAYER)
    as_server(database)
    window_set(database, 3)
    lock_record(database, "answer0001", "rain", "exact")
    database.execute("reset role")

    assert call(database, "select public.delete_player(%s)", PLAYER) == {"status": "deleted"}
    assert call(database, "select public.delete_player(%s)", HOST) == {"status": "deleted"}

    assert call(database, "select count(*) from public.demo_lock_attempts") == 0
    assert call(database, "select count(*) from public.demo_window_actions") == 0
    row = database.execute("select changed_by, open_until from public.demo_window").fetchone()
    assert row[0] is None and row[1] is not None


def test_no_wallet_reason_or_ledger_row_comes_with_the_demo(database):
    add_players(database, PLAYER)
    as_server(database)
    before = call(database, "select count(*) from public.wallet_reasons")
    lock_record(database, "answer0001", "rain", "exact")

    assert call(database, "select count(*) from public.wallet_transactions") == 0
    assert call(database, "select count(*) from public.wallet_reasons") == before


def test_two_switches_at_once_both_land_one_after_the_other(scratch_server):
    import psycopg

    with psycopg.connect(scratch_server.get_uri(), autocommit=True) as setup:
        setup.execute("insert into auth.users (id) values (%s) on conflict do nothing", (HOST,))
    barrier = Barrier(2)
    uids = [uuid4(), uuid4()]

    def switch(index):
        with psycopg.connect(scratch_server.get_uri()) as connection:
            connection.execute("set role service_role")
            barrier.wait()
            reply = connection.execute(
                "select public.demo_window_set(%s, %s, %s)", (HOST, uids[index], index + 1)
            ).fetchone()[0]
            connection.commit()
            return reply

    with ThreadPoolExecutor(2) as pool:
        replies = list(pool.map(switch, range(2)))

    assert all(reply["repeat"] is False for reply in replies)
    with psycopg.connect(scratch_server.get_uri(), autocommit=True) as check:
        count = check.execute(
            "select count(*) from public.demo_window_actions where action_uid = any(%s)", (uids,)
        ).fetchone()[0]
        assert count == 2
        check.execute("delete from public.demo_window_actions where host_id = %s", (HOST,))
        check.execute("update public.demo_window set open_until = null, changed_by = null")
        check.execute("delete from auth.users where id = %s", (HOST,))
