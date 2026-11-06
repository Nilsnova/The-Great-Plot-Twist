"""W1–W9: once-only Relighting, proved only on the private disposable PostgreSQL server."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest

from .conftest import (
    CASE_MIGRATION,
    MIGRATIONS,
    as_owner,
    as_server,
    open_case,
    ready_to_accuse,
    rpc,
    seed_crew,
)

pytestmark = pytest.mark.pg
RELIGHTING = MIGRATIONS / "20261106120000_relighting.sql"


def prepared_crew(database):
    players = tuple(uuid4() for _ in range(4))
    as_owner(database)
    crew = seed_crew(database, players=players)
    as_server(database)
    open_case(database, crew)
    ready_to_accuse(database, crew)
    return crew, players


def solve(database, crew, players, case_data, *, relight_open=True):
    revision = database.execute(
        "select revision from public.case_state where crew_id = %s", (crew,)
    ).fetchone()[0]
    version = database.execute(
        "select version from public.crews where id = %s", (crew,)
    ).fetchone()[0]
    culprit = case_data["accusation"]["culprit"]
    return rpc(
        database,
        "case_accuse",
        crew,
        players[0],
        "accuseworld1",
        culprit,
        culprit,
        ["D2", "D3", "D4"],
        60,
        400,
        800,
        "false_light:solve",
        [{"player_id": str(players[0]), "share": 700}],
        revision,
        version,
        relight_open,
    )


def world(database):
    return database.execute(
        "select stage, solves, extra_lights, relit_at, first_crew_id from public.world_state"
    ).fetchone()


def test_w1_migration_reapplies_without_changing_the_singleton(database):
    original = world(database)
    database.execute(RELIGHTING.read_text())
    database.execute(RELIGHTING.read_text())
    assert world(database) == original
    assert database.execute("select count(*) from public.world_state").fetchone() == (1,)


def test_w2_locked_solve_pays_rewards_and_never_reaches_the_world_later(database, case_data):
    crew, players = prepared_crew(database)
    answer = solve(database, crew, players, case_data, relight_open=False)
    assert answer["status"] == "solved" and answer["world"] == {"world": "locked"}
    assert world(database)[:3] == ("dark", 0, 0)
    assert database.execute("select count(*) from public.world_solves").fetchone() == (0,)
    assert database.execute("select count(*) from public.wall_of_lights").fetchone() == (0,)
    assert database.execute(
        "select delta from public.wallet_transactions "
        "where player_id = %s and ref = 'false_light:solve'",
        (players[0],),
    ).fetchone() == (700,)
    assert database.execute(
        "select world_outcome from public.case_state where crew_id = %s", (crew,)
    ).fetchone() == ("locked",)
    assert database.execute(
        "select count(*) from public.case_solvers where crew_id = %s", (crew,)
    ).fetchone() == (4,)
    assert rpc(database, "case_after_solve", crew, True, list(players)) == {"world": "locked"}
    assert world(database)[:3] == ("dark", 0, 0)
    assert database.execute("select count(*) from public.wall_of_lights").fetchone() == (0,)


def test_w3_w4_w5_once_only_relighting_and_contributor_names(database, case_data):
    crew, players = prepared_crew(database)
    assert solve(database, crew, players, case_data)["world"] == {"world": "relit", "solveNo": 1}
    original = world(database)
    assert original[:3] == ("relit", 1, 0) and original[4] == crew
    assert database.execute(
        "select world_outcome from public.case_state where crew_id = %s", (crew,)
    ).fetchone() == ("relit",)
    assert database.execute("select player_id, solve_no from public.wall_of_lights").fetchall() == [
        (players[0], 1)
    ]
    second, second_players = prepared_crew(database)
    assert solve(database, second, second_players, case_data)["world"] == {
        "world": "added",
        "solveNo": 2,
    }
    current = world(database)
    assert current[:3] == ("relit", 2, 1) and current[3:] == original[3:]
    assert database.execute(
        "select player_id, solve_no from public.wall_of_lights order by solve_no"
    ).fetchall() == [(players[0], 1), (second_players[0], 2)]
    assert rpc(database, "case_after_solve", crew, True, list(players)) == {
        "world": "already_recorded"
    }
    assert world(database) == current


def test_w6_two_concurrent_solve_transactions_relight_once(scratch_server, case_data):
    import psycopg

    with psycopg.connect(scratch_server.get_uri()) as setup:
        crews = [prepared_crew(setup), prepared_crew(setup)]
    barrier = Barrier(2)

    def finish(item):
        with psycopg.connect(scratch_server.get_uri()) as session:
            as_server(session)
            barrier.wait(timeout=10)
            return solve(session, *item, case_data)["world"]["world"]

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            outcomes = list(executor.map(finish, crews))
        assert sorted(outcomes) == ["added", "relit"]
        with psycopg.connect(scratch_server.get_uri()) as check:
            assert world(check)[:3] == ("relit", 2, 1)
            assert check.execute("select count(*) from public.world_solves").fetchone() == (2,)
            assert check.execute("select count(*) from public.wall_of_lights").fetchone() == (2,)
    finally:
        with psycopg.connect(scratch_server.get_uri()) as cleanup:
            for crew, players in crews:
                cleanup.execute("delete from public.crews where id = %s", (crew,))
                for player in players:
                    cleanup.execute("delete from auth.users where id = %s", (player,))
            cleanup.execute(
                "update public.world_state set stage = 'dark', relit_at = null, "
                "first_crew_id = null, solves = 0, extra_lights = 0 where id = 1"
            )


def test_w7_later_crews_add_one_light_up_to_12(database, case_data):
    for number in range(14):
        crew, players = prepared_crew(database)
        assert solve(database, crew, players, case_data)["world"]["solveNo"] == number + 1
    assert world(database)[:3] == ("relit", 14, 12)


def test_w8_deleting_a_player_removes_their_wall_entry(database, case_data):
    crew, players = prepared_crew(database)
    solve(database, crew, players, case_data)
    as_owner(database)
    database.execute("delete from auth.users where id = %s", (players[0],))
    assert database.execute("select count(*) from public.wall_of_lights").fetchone() == (0,)
    assert world(database)[:3] == ("relit", 1, 0)


def test_w9_reloading_phase1_preserves_phase3_hook_and_comment(database, case_data):
    query = "select obj_description('public.case_after_solve(uuid,boolean,uuid[])'::regprocedure)"
    comment = database.execute(query).fetchone()[0]
    database.execute(CASE_MIGRATION.read_text())
    assert database.execute(query).fetchone()[0] == comment
    crew, players = prepared_crew(database)
    assert solve(database, crew, players, case_data)["world"]["world"] == "relit"


def test_world_tables_and_hook_are_server_only(database):
    for table in ("world_state", "world_solves", "wall_of_lights"):
        assert database.execute(
            "select relrowsecurity from pg_class where oid = %s::regclass", (f"public.{table}",)
        ).fetchone() == (True,)
        for role in ("anon", "authenticated"):
            assert database.execute(
                "select has_table_privilege(%s, %s, 'select,insert,update,delete')",
                (role, f"public.{table}"),
            ).fetchone() == (False,)
    for role in ("anon", "authenticated"):
        assert database.execute(
            "select has_function_privilege(%s, "
            "'public.case_after_solve(uuid,boolean,uuid[])', 'execute')",
            (role,),
        ).fetchone() == (False,)
    assert database.execute(
        "select prosecdef, proconfig from pg_proc "
        "where oid = 'public.case_after_solve(uuid,boolean,uuid[])'::regprocedure"
    ).fetchone() == (False, ['search_path=""'])


def test_extra_light_spots_in_the_data_match_the_sql_constant(case_data):
    cap = case_data["relighting"]["later_crews"]["extra_light_spots"]
    assert f"least(extra_lights + 1, {cap})" in RELIGHTING.read_text()


def test_world_migration_parses_without_browser_policies():
    pglast = pytest.importorskip("pglast")
    assert pglast.parse_sql(RELIGHTING.read_text())
    assert "create policy" not in RELIGHTING.read_text().lower()
