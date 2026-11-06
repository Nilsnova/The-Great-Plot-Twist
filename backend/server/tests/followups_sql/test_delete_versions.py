"""Real SQL checks for deletion handover, freed seats, version counters and permissions.

Used by: G10 follow-up migration checks on disposable PostgreSQL, with no live services.
"""

import time
from concurrent.futures import ThreadPoolExecutor
from uuid import UUID, uuid4

import pytest

PLAYER = UUID(int=1)
FRIEND = UUID(int=2)
OTHER = UUID(int=3)


def add_players(database):
    for player in (PLAYER, FRIEND, OTHER):
        database.execute("insert into auth.users (id) values (%s)", (player,))


def add_crew(database, owner, seats, version=7):
    crew = uuid4()
    database.execute(
        "insert into public.crews (id, created_by, mode, version) values (%s, %s, 'crew', %s)",
        (crew, owner, version),
    )
    for seat, player in seats:
        database.execute(
            "insert into public.crew_seats (crew_id, seat_no, player_id, kit) "
            "values (%s, %s, %s, 'witness')",
            (crew, seat, player),
        )
    return crew


def delete_player(database, player=PLAYER):
    return database.execute("select public.delete_player(%s)", (player,)).fetchone()[0]


def crew_state(database, crew):
    return database.execute(
        "select created_by, version from public.crews where id = %s", (crew,)
    ).fetchone()


def test_owner_handover_and_freed_seat_increment_the_crew_once(database):
    add_players(database)
    crew = add_crew(database, PLAYER, [(1, PLAYER), (3, OTHER), (2, FRIEND)])

    assert delete_player(database) == {"status": "deleted"}

    assert crew_state(database, crew) == (FRIEND, 8)
    assert database.execute(
        "select seat_no from public.crew_seats where crew_id = %s order by seat_no", (crew,)
    ).fetchall() == [(2,), (3,)]
    for table, column in (("users", "id"), ("profiles", "id"), ("wallets", "player_id")):
        schema = "auth" if table == "users" else "public"
        # Table and column names are fixed test constants, never user input.
        assert database.execute(
            f"select count(*) from {schema}.{table} where {column} = %s", (PLAYER,)
        ).fetchone() == (0,)


def test_nonowner_seat_removal_increments_the_surviving_crew(database):
    add_players(database)
    crew = add_crew(database, FRIEND, [(1, FRIEND), (2, PLAYER)])

    delete_player(database)

    assert crew_state(database, crew) == (FRIEND, 8)


def test_an_owner_without_a_seat_still_hands_over_and_increments(database):
    add_players(database)
    crew = add_crew(database, PLAYER, [(3, FRIEND)])

    delete_player(database)

    assert crew_state(database, crew) == (FRIEND, 8)


def test_every_affected_crew_changes_but_an_unrelated_crew_does_not(database):
    add_players(database)
    owned = add_crew(database, PLAYER, [(1, PLAYER), (2, FRIEND)])
    seated = add_crew(database, OTHER, [(1, OTHER), (2, PLAYER)])
    unrelated = add_crew(database, FRIEND, [(1, FRIEND)])

    delete_player(database)

    assert crew_state(database, owned) == (FRIEND, 8)
    assert crew_state(database, seated) == (OTHER, 8)
    assert crew_state(database, unrelated) == (FRIEND, 7)


def test_a_crew_without_another_player_is_deleted_with_its_owner(database):
    add_players(database)
    crew = add_crew(database, PLAYER, [(1, PLAYER)])
    database.execute(
        "insert into public.crew_seats (crew_id, seat_no, npc_id, kit) "
        "values (%s, 2, 'partner_one', 'informant')",
        (crew,),
    )

    delete_player(database)

    assert crew_state(database, crew) is None
    assert database.execute(
        "select count(*) from public.crew_seats where crew_id = %s", (crew,)
    ).fetchone() == (0,)


def test_a_repeated_deletion_changes_no_crew_again(database):
    add_players(database)
    crew = add_crew(database, FRIEND, [(1, FRIEND), (2, PLAYER)])
    delete_player(database)

    assert delete_player(database) == {"status": "not_found"}
    assert crew_state(database, crew) == (FRIEND, 8)


def test_concurrent_retries_do_not_increment_a_surviving_crew_twice(scratch_server):
    import psycopg

    with (
        psycopg.connect(scratch_server.get_uri()) as first,
        psycopg.connect(scratch_server.get_uri()) as second,
        psycopg.connect(scratch_server.get_uri(), autocommit=True) as monitor,
        ThreadPoolExecutor(max_workers=1) as pool,
    ):
        try:
            add_players(first)
            crew = add_crew(first, FRIEND, [(1, FRIEND), (2, PLAYER)])
            first.commit()
            assert delete_player(first) == {"status": "deleted"}
            retry = pool.submit(delete_player, second)
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                wait = monitor.execute(
                    "select wait_event_type from pg_stat_activity where pid = %s",
                    (second.info.backend_pid,),
                ).fetchone()
                if wait == ("Lock",):
                    break
                time.sleep(0.01)
            else:
                pytest.fail("The concurrent retry did not reach the held deletion lock.")
            first.commit()
            assert retry.result(timeout=5) == {"status": "not_found"}
            second.commit()
            assert crew_state(first, crew) == (FRIEND, 8)
        finally:
            # Release locks before the executor waits, even when an assertion fails.
            first.rollback()
            second.rollback()
            first.execute("truncate auth.users cascade")
            first.commit()


@pytest.mark.parametrize("role", ["anon", "authenticated"])
def test_only_the_server_may_delete_a_player(database, role):
    import psycopg

    database.execute(f"set local role {role}")
    with pytest.raises(psycopg.errors.InsufficientPrivilege):
        delete_player(database)


def test_function_stays_a_definer_with_empty_search_path_and_server_permission(database):
    assert database.execute(
        "select prosecdef, proconfig from pg_proc "
        "where oid = 'public.delete_player(uuid)'::regprocedure"
    ).fetchone() == (True, ['search_path=""'])
    assert database.execute(
        "select has_function_privilege('service_role', 'public.delete_player(uuid)', 'execute')"
    ).fetchone() == (True,)


def test_the_new_kit_comment_records_the_decided_rule(database):
    comment = database.execute(
        "select col_description('public.crew_seats'::regclass, attnum) "
        "from pg_attribute where attrelid = 'public.crew_seats'::regclass and attname = 'kit'"
    ).fetchone()[0]

    assert "their own Act 1 ending" in comment
    assert "waits for Nils" not in comment
