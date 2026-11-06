"""Phase 3 checks W1 to W9 using the disposable local PostgreSQL migration chain.

Used by: the opt-in SQL gate. The concurrency check commits two actual accusations,
then removes its own stand-ins. Protected content comes only from the checked loader.
"""

import os
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Event
from time import monotonic
from uuid import uuid4

import pytest

from server.game.case_data import load_case

from .conftest import (
    CASE_MIGRATION,
    PLAYERS,
    as_owner,
    as_server,
    open_case,
    rpc,
    seed_crew,
)

pytestmark = [
    pytest.mark.pg,
    pytest.mark.skipif(os.environ.get("CASE_PG_SCRATCH") != "1", reason="opt-in database tests"),
]
TABLES = ("world_state", "world_solves", "wall_of_lights")
HOOK = "public.case_after_solve(uuid,boolean,uuid[])"


@pytest.fixture(scope="module")
def world_data():
    return load_case()


def ready_crew(database, data, *, players=PLAYERS):
    as_owner(database)
    crew = seed_crew(database, players=players)
    as_server(database)
    open_case(database, crew)
    database.execute(
        "update public.case_state set schooner_found_second = 0 where crew_id = %s", (crew,)
    )
    for deduction in data.accusation.needs_deductions:
        database.execute(
            "insert into public.case_deductions "
            "(crew_id, deduction_id, formed_second, formed_seat) values (%s, %s, 0, 1)",
            (crew, deduction),
        )
    return crew


def solve(database, crew, data, *, players=PLAYERS, uid="world001", relight=True):
    reward = data.rewards.coin("solve_share")
    state = database.execute(
        "select cs.revision, c.version from public.case_state as cs "
        "join public.crews as c on c.id = cs.crew_id where cs.crew_id = %s",
        (crew,),
    ).fetchone()
    return rpc(
        database,
        "case_accuse",
        crew,
        players[0],
        uid,
        data.accusation.culprit,
        data.accusation.culprit,
        list(data.accusation.needs_deductions),
        data.accusation.wrong_wait_seconds,
        reward.base,
        reward.maximum,
        reward.ref,
        [{"player_id": str(players[0]), "share": reward.base + reward.finale_role}],
        *state,
        relight,
    )


def state(database):
    return database.execute(
        "select stage, relit_at, first_crew_id, solves, extra_lights "
        "from public.world_state where id = 1"
    ).fetchone()


def hook(database, crew, *, open_switch=True, contributors=None):
    return rpc(database, "case_after_solve", crew, open_switch, contributors or [])


def test_w1_full_chain_applies_twice_and_seeds_exactly_one_dark_world(database):
    assert database.execute("select count(*) from public.world_state").fetchone() == (1,)
    assert state(database) == ("dark", None, None, 0, 0)


@pytest.mark.parametrize("switch", [False, None])
def test_w2_locked_solve_pays_rewards_and_never_reaches_the_world_later(
    database, world_data, switch
):
    crew = ready_crew(database, world_data)
    reply = solve(database, crew, world_data, relight=switch)
    assert reply["status"] == "solved"
    assert reply["world"] == {"world": "locked"}
    assert (
        reply["payouts"][0]["paid"]
        == world_data.rewards.coin("solve_share").base
        + world_data.rewards.coin("solve_share").finale_role
    )
    assert state(database) == ("dark", None, None, 0, 0)
    for table in ("wall_of_lights", "world_solves"):
        assert database.execute(f"select count(*) from public.{table}").fetchone() == (0,)
    assert database.execute(
        "select world_outcome from public.case_state where crew_id = %s", (crew,)
    ).fetchone() == ("locked",)
    assert solve(database, crew, world_data, relight=True)["status"] == "repeat"
    assert (
        solve(database, crew, world_data, uid="world002", relight=True)["reason"]
        == "crew_not_active"
    )
    assert state(database) == ("dark", None, None, 0, 0)
    later = ready_crew(database, world_data)
    assert solve(database, later, world_data, uid="world003")["world"] == {
        "world": "relit",
        "solveNo": 1,
    }
    assert database.execute("select crew_id from public.world_solves").fetchall() == [(later,)]


def test_w3_first_open_accusation_relights_and_records_only_contributors(database, world_data):
    crew = ready_crew(database, world_data)
    reply = solve(database, crew, world_data)
    assert reply["world"] == {"world": "relit", "solveNo": 1}
    stage, relit_at, first_crew, solves, extra = state(database)
    assert (stage, first_crew, solves, extra) == ("relit", crew, 1, 0)
    assert relit_at is not None
    assert database.execute(
        "select player_id, solve_no, crew_id from public.wall_of_lights"
    ).fetchall() == [(PLAYERS[0], 1, crew)]
    assert database.execute(
        "select contributor, share_paid from public.case_solvers where crew_id = %s "
        "order by seat_no",
        (crew,),
    ).fetchall() == [(True, reply["payouts"][0]["paid"]), (False, 0), (False, 0), (False, 0)]
    assert database.execute(
        "select world_outcome from public.case_state where crew_id = %s", (crew,)
    ).fetchone() == ("relit",)


def test_w4_later_crew_adds_one_light_and_preserves_the_first_time_and_wall_entries(
    database, world_data
):
    first = ready_crew(database, world_data)
    solve(database, first, world_data)
    initial = state(database)
    players = tuple(uuid4() for _ in range(4))
    second = ready_crew(database, world_data, players=players)
    reply = solve(database, second, world_data, players=players)
    assert reply["world"] == {"world": "added", "solveNo": 2}
    assert state(database) == (*initial[:3], 2, 1)
    assert database.execute(
        "select player_id, solve_no, crew_id from public.wall_of_lights order by solve_no"
    ).fetchall() == [(PLAYERS[0], 1, first), (players[0], 2, second)]
    third = ready_crew(database, world_data)
    assert solve(database, third, world_data, uid="world003")["world"] == {
        "world": "added",
        "solveNo": 3,
    }
    assert database.execute(
        "select solve_no, crew_id from public.wall_of_lights where player_id = %s", (PLAYERS[0],)
    ).fetchone() == (1, first)
    assert database.execute(
        "select world_outcome from public.case_state where crew_id = %s", (second,)
    ).fetchone() == ("added",)


def test_w5_the_hook_records_a_crew_once_without_raising_a_unique_error(database, world_data):
    crew = ready_crew(database, world_data)
    solve(database, crew, world_data)
    before = state(database)
    assert hook(database, crew, contributors=[PLAYERS[0], PLAYERS[1]]) == {
        "world": "already_recorded"
    }
    assert state(database) == before
    assert database.execute("select count(*) from public.world_solves").fetchone() == (1,)
    assert database.execute("select count(*) from public.wall_of_lights").fetchone() == (1,)


def race_solve(uri, crew, players, data, barrier, application):
    import psycopg

    with psycopg.connect(uri, application_name=application) as connection:
        connection.execute("set local statement_timeout = '10s'")
        as_server(connection)
        barrier.wait(timeout=5)
        return solve(connection, crew, data, players=players)


def test_w6_two_real_accusations_wait_on_the_world_lock_and_exactly_one_relights(
    database, scratch_server, world_data
):
    import psycopg

    crews = []
    player_groups = [tuple(uuid4() for _ in range(4)) for _ in range(2)]
    application = f"case-world-race-{uuid4()}"
    uri = scratch_server.get_uri()
    initial_world = database.execute(
        "select stage, relit_at, first_crew_id, solves, extra_lights, updated_at "
        "from public.world_state where id = 1"
    ).fetchone()
    try:
        with psycopg.connect(uri) as setup:
            for players in player_groups:
                crews.append(ready_crew(setup, world_data, players=players))
        database.execute("select id from public.world_state where id = 1 for update")
        with ThreadPoolExecutor(max_workers=2) as executor:
            barrier = Barrier(2)
            futures = [
                executor.submit(race_solve, uri, crew, players, world_data, barrier, application)
                for crew, players in zip(crews, player_groups, strict=True)
            ]
            try:
                deadline = monotonic() + 5
                waiting = 0
                while waiting < 2 and monotonic() < deadline:
                    database.execute("select pg_stat_clear_snapshot()")
                    waiting = database.execute(
                        "select count(*) from pg_stat_activity "
                        "where application_name = %s and wait_event_type = 'Lock'",
                        (application,),
                    ).fetchone()[0]
                    Event().wait(0.01)
                assert waiting == 2, "Both accusations must reach the locked world row."
            finally:
                database.rollback()
            replies = [future.result(timeout=10) for future in futures]
        assert sorted(reply["world"]["world"] for reply in replies) == ["added", "relit"]
        assert {reply["world"]["solveNo"] for reply in replies} == {1, 2}
        assert database.execute("select count(*) from public.world_solves").fetchone() == (2,)
        assert state(database)[3:] == (2, 1)
        assert database.execute(
            "select count(*) from public.case_accusations where correct"
        ).fetchone() == (2,)
    finally:
        database.rollback()
        with psycopg.connect(uri) as cleanup:
            cleanup.execute("delete from public.crews where id = any(%s)", (crews,))
            cleanup.execute(
                "delete from auth.users where id = any(%s)",
                ([player for players in player_groups for player in players],),
            )
            cleanup.execute(
                "update public.world_state set stage = %s, relit_at = %s, "
                "first_crew_id = %s, solves = %s, extra_lights = %s, updated_at = %s where id = 1",
                initial_world,
            )


def test_w7_thirteen_later_solves_keep_the_extra_light_counter_at_twelve(database, world_data):
    for number in range(14):
        crew = ready_crew(database, world_data)
        assert (
            solve(database, crew, world_data, uid=f"world{number:03}")["world"]["solveNo"]
            == number + 1
        )
    assert state(database)[3:] == (14, 12)
    assert database.execute("select count(*) from public.world_solves").fetchone() == (14,)
    assert database.execute("select count(*) from public.wall_of_lights").fetchone() == (1,)


def test_w8_account_deletion_removes_only_that_players_wall_entry(database, world_data):
    first = ready_crew(database, world_data)
    solve(database, first, world_data)
    players = tuple(uuid4() for _ in range(4))
    second = ready_crew(database, world_data, players=players)
    solve(database, second, world_data, players=players)
    assert rpc(database, "delete_player", PLAYERS[0])["status"] == "deleted"
    assert database.execute("select player_id from public.wall_of_lights").fetchall() == [
        (players[0],)
    ]
    assert state(database)[0] == "relit"


def test_w9_reapplying_phase1_preserves_the_replacement_hook_and_its_comment(database, world_data):
    before = database.execute(
        "select obj_description(%s::regprocedure, 'pg_proc')", (HOOK,)
    ).fetchone()[0]
    as_owner(database)
    database.execute(CASE_MIGRATION.read_text())
    after = database.execute(
        "select obj_description(%s::regprocedure, 'pg_proc')", (HOOK,)
    ).fetchone()[0]
    assert before == after
    assert "Relighting" in after
    crew = ready_crew(database, world_data)
    assert solve(database, crew, world_data)["world"] == {"world": "relit", "solveNo": 1}


def test_world_hook_failure_rolls_back_the_accusation_wallet_and_case_finish(database, world_data):
    import psycopg

    crew = ready_crew(database, world_data)
    as_owner(database)
    database.execute("delete from public.world_state")
    as_server(database)
    with (
        pytest.raises(psycopg.errors.RaiseException, match="world_state_missing"),
        database.transaction(),
    ):
        solve(database, crew, world_data)
    for table in ("case_accusations", "case_actions", "case_solvers"):
        assert database.execute(
            f"select count(*) from public.{table} where crew_id = %s", (crew,)
        ).fetchone() == (0,)
    assert database.execute(
        "select status from public.crews where id = %s", (crew,)
    ).fetchone() == ("active",)
    assert database.execute(
        "select solved_second, revision from public.case_state where crew_id = %s", (crew,)
    ).fetchone() == (None, 1)
    assert database.execute(
        "select count(*) from public.wallet_transactions where player_id = %s and ref = %s",
        (PLAYERS[0], world_data.rewards.coin("solve_share").ref),
    ).fetchone() == (0,)


def test_world_tables_and_hook_are_server_only_with_no_history_update_or_delete(database):
    import psycopg

    for table in TABLES:
        assert database.execute(
            "select relrowsecurity from pg_class where oid = %s::regclass", (f"public.{table}",)
        ).fetchone() == (True,)
        for role in ("anon", "authenticated"):
            assert database.execute(
                "select has_table_privilege(%s, %s, 'select,insert,update,delete')",
                (role, f"public.{table}"),
            ).fetchone() == (False,)
    assert database.execute(
        "select has_function_privilege('authenticated', %s, 'execute')", (HOOK,)
    ).fetchone() == (False,)
    as_server(database)
    for table in TABLES:
        with pytest.raises(psycopg.errors.InsufficientPrivilege), database.transaction():
            database.execute(f"delete from public.{table}")
    for table in ("world_solves", "wall_of_lights"):
        with pytest.raises(psycopg.errors.InsufficientPrivilege), database.transaction():
            database.execute(f"update public.{table} set solve_no = 1")
    database.execute("set local role authenticated")
    for table in TABLES:
        with pytest.raises(psycopg.errors.InsufficientPrivilege), database.transaction():
            database.execute(f"select * from public.{table}")
    with pytest.raises(psycopg.errors.InsufficientPrivilege), database.transaction():
        hook(database, None)
