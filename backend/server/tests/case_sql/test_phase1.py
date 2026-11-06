"""Phase 1 database checks C1 to C14, using only disposable local PostgreSQL.

These checks exercise the actual migrations as service_role. Secret values are read from the
canonical case data when needed and are never embedded in test names or assertions.
"""

import os

import pytest

from .conftest import (
    CASE_MIGRATION,
    PLAYERS,
    accuse,
    as_owner,
    as_server,
    move_clock,
    open_case,
    ready_to_accuse,
    route,
    rpc,
    seed_crew,
)

pytestmark = [
    pytest.mark.pg,
    pytest.mark.skipif(os.environ.get("CASE_PG_SCRATCH") != "1", reason="opt-in database tests"),
]


def test_c1_complete_chain_runs_twice_and_phase1_keeps_a_replaced_hook(database):
    # Reaching the fixture already proves the full sorted migration chain applied twice.
    assert database.execute(
        "select count(*) from pg_tables where schemaname = 'public' and tablename like 'case_%'"
    ).fetchone() == (6,)
    database.execute(
        "create or replace function public.case_after_solve "
        "(p_crew_id uuid, p_relight_open boolean, p_contributors uuid[]) returns jsonb "
        "language sql set search_path = '' as $$ "
        'select \'{"world":"unchanged","testHook":true}\'::jsonb $$'
    )
    database.execute(CASE_MIGRATION.read_text())
    result = rpc(database, "case_after_solve", None, False, [])
    assert result.get("testHook") is True


@pytest.mark.parametrize("partner", [False, True])
def test_c2_open_adds_starting_cards_once_for_player_and_partner_seats(database, partner):
    crew = seed_crew(database, partner=partner)
    as_server(database)

    assert open_case(database, crew)["status"] == "opened"
    assert open_case(database, crew)["status"] == "opened"

    assert database.execute(
        "select count(*) from public.case_state where crew_id = %s", (crew,)
    ).fetchone() == (1,)
    rows = database.execute(
        "select seat_no, card_id, ready_second, by_partner "
        "from public.case_finds where crew_id = %s",
        (crew,),
    ).fetchall()
    assert rows == [(1, "C2", 0, partner)]


@pytest.mark.parametrize("status", ["forming", "finished"])
def test_c3_nonactive_crews_are_refused_with_their_actual_status(database, status):
    crew = seed_crew(database, status=status)
    as_server(database)

    reply = open_case(database, crew)

    assert reply == {"status": "refused", "reason": "crew_not_active", "crewStatus": status}


def test_c4_start_stores_database_timer_and_increments_revision_once(database):
    crew = seed_crew(database)
    as_server(database)
    open_case(database, crew)

    reply = route(database, crew)

    assert reply["status"] == "done"
    start, ready = database.execute(
        "select started_second, ready_second from public.case_finds "
        "where crew_id = %s and card_id = 'C4'",
        (crew,),
    ).fetchone()
    assert ready - start == 300
    assert reply["readySecond"] == ready
    assert reply["revision"] == 2


def test_c5_same_uid_returns_the_original_receipt_even_after_finished(database):
    crew = seed_crew(database)
    as_server(database)
    open_case(database, crew)
    route(database, crew)
    database.execute("update public.crews set status = 'finished' where id = %s", (crew,))

    reply = route(database, crew, card="C1", route_id="C1.notice_board")

    assert reply["status"] == "repeat"
    assert reply["kind"] == "search"
    assert reply["target"] == "C4.back_room"
    assert reply["outcome"] == "started"
    assert database.execute(
        "select count(*) from public.case_actions where crew_id = %s", (crew,)
    ).fetchone() == (1,)
    assert database.execute(
        "select revision from public.case_state where crew_id = %s", (crew,)
    ).fetchone() == (2,)


def test_c6_route_gate_requires_the_stored_deduction(database):
    crew = seed_crew(database)
    as_server(database)
    open_case(database, crew)

    reply = route(database, crew, card="C5", route_id="C5.salvage_yard", needs=["D2"])
    assert reply == {"status": "refused", "reason": "lead_locked"}
    database.execute(
        "insert into public.case_deductions (crew_id, deduction_id, formed_second, formed_seat) "
        "values (%s, 'D2', 0, 1)",
        (crew,),
    )

    assert (
        route(database, crew, card="C5", route_id="C5.salvage_yard", needs=["D2"])["status"]
        == "done"
    )


def test_c7_the_same_seat_cannot_start_a_card_twice(database):
    crew = seed_crew(database)
    as_server(database)
    open_case(database, crew)
    route(database, crew)

    reply = route(database, crew, uid="route0002")

    assert reply == {"status": "refused", "reason": "already_have"}


def test_c8_window_uses_the_database_minute_at_the_boundary(database):
    crew = seed_crew(database)
    as_server(database)
    open_case(database, crew)
    window = {"every": 20, "from": 12, "open": 8}
    move_clock(database, crew, 11 * 60)

    reply = route(database, crew, window=window)
    assert reply == {"status": "refused", "reason": "locked_window", "minute": 11}
    move_clock(database, crew, 12 * 60)

    assert route(database, crew, window=window)["status"] == "done"


def test_c9_accusation_needs_the_schooner_then_all_evidence(database, case_data):
    crew = seed_crew(database)
    as_server(database)
    open_case(database, crew)

    assert accuse(database, crew, case_data) == {"status": "refused", "reason": "schooner_required"}
    database.execute(
        "update public.case_state set schooner_found_second = 0 where crew_id = %s", (crew,)
    )
    assert accuse(database, crew, case_data) == {"status": "refused", "reason": "evidence_required"}


def test_c10_wrong_accusation_waits_for_sixty_seconds(database, case_data):
    crew = seed_crew(database)
    as_server(database)
    open_case(database, crew)
    ready_to_accuse(database, crew)
    move_clock(database, crew, 0)

    reply = accuse(database, crew, case_data, correct=False)
    assert reply["status"] == "wrong"
    assert reply["seconds"] == 60
    move_clock(database, crew, 59)
    reply = accuse(database, crew, case_data, uid="accuse002")
    assert reply == {"status": "refused", "reason": "accusation_cooldown", "seconds": 1}
    move_clock(database, crew, 60)

    assert accuse(database, crew, case_data, uid="accuse003")["status"] == "solved"


def test_c11_solve_records_every_player_and_pays_a_player_once_across_crews(database, case_data):
    # Phase 3 replaces the empty hook. This closed-setting solve must then stay locked.
    has_world_hook = database.execute(
        "select to_regclass('public.world_solves') is not null"
    ).fetchone()[0]
    world_outcome = "locked" if has_world_hook else "unchanged"
    for number in range(2):
        as_owner(database)
        crew = seed_crew(database)
        as_server(database)
        open_case(database, crew)
        ready_to_accuse(database, crew)

        reply = accuse(database, crew, case_data, uid=f"solve000{number}")

        assert reply["status"] == "solved"
        assert reply["payouts"][0]["paid"] == (700 if number == 0 else 0)
        assert reply["world"] == {"world": world_outcome}
        assert database.execute(
            "select status from public.crews where id = %s", (crew,)
        ).fetchone() == ("finished",)
        assert database.execute(
            "select count(*) from public.case_solvers where crew_id = %s", (crew,)
        ).fetchone() == (4,)
        assert database.execute(
            "select count(*) from public.case_accusations where crew_id = %s and correct", (crew,)
        ).fetchone() == (1,)
        assert database.execute(
            "select world_outcome from public.case_state where crew_id = %s", (crew,)
        ).fetchone() == (world_outcome,)
    assert database.execute(
        "select count(*), sum(delta) from public.wallet_transactions "
        "where player_id = %s and ref = 'false_light:solve'",
        (PLAYERS[0],),
    ).fetchone() == (1, 700)


def test_c12_authenticated_has_no_case_table_or_function_access(database):
    import psycopg

    tables = database.execute(
        "select tablename from pg_tables where schemaname = 'public' and tablename like 'case_%'"
    ).fetchall()
    functions = database.execute(
        "select oid::regprocedure::text from pg_proc "
        "where pronamespace = 'public'::regnamespace and proname like 'case_%'"
    ).fetchall()
    for (table,) in tables:
        assert database.execute(
            "select has_table_privilege('authenticated', %s, 'select')", (f"public.{table}",)
        ).fetchone() == (False,)
    for (function,) in functions:
        assert database.execute(
            "select has_function_privilege('authenticated', %s, 'execute')", (function,)
        ).fetchone() == (False,)
    database.execute("set local role authenticated")
    with pytest.raises(psycopg.errors.InsufficientPrivilege), database.transaction():
        database.execute("select * from public.case_state")
    with pytest.raises(psycopg.errors.InsufficientPrivilege), database.transaction():
        rpc(database, "case_open", None, "test_case", [])


@pytest.mark.parametrize("stale", ["revision", "version"])
def test_c13_stale_solve_snapshots_change_no_receipt_accusation_or_wallet(
    database, case_data, stale
):
    crew = seed_crew(database)
    as_server(database)
    open_case(database, crew)
    ready_to_accuse(database, crew)
    reply = accuse(database, crew, case_data, **{stale: 999})

    assert reply == {"status": "refused", "reason": "state_changed"}
    for table in ("case_accusations", "case_actions", "case_solvers"):
        assert database.execute(
            f"select count(*) from public.{table} where crew_id = %s", (crew,)
        ).fetchone() == (0,)
    assert database.execute("select count(*) from public.wallet_transactions").fetchone() == (0,)
    assert database.execute(
        "select solved_second from public.case_state where crew_id = %s", (crew,)
    ).fetchone() == (None,)


def test_c14_clock_forward_moves_only_its_crew_and_logs_one_revision(database):
    crew = seed_crew(database)
    other = seed_crew(database)
    as_server(database)
    open_case(database, crew)
    open_case(database, other)
    before = database.execute(
        "select started_at from public.case_state where crew_id = %s", (crew,)
    ).fetchone()[0]
    other_before = database.execute(
        "select started_at from public.case_state where crew_id = %s", (other,)
    ).fetchone()[0]

    reply = rpc(database, "case_clock_forward", crew, PLAYERS[0], "clock001", 600)

    assert reply["status"] == "done"
    assert reply["revision"] == 2
    assert reply["now"] >= 600
    after = database.execute(
        "select started_at from public.case_state where crew_id = %s", (crew,)
    ).fetchone()[0]
    assert (before - after).total_seconds() == 600
    assert database.execute(
        "select started_at from public.case_state where crew_id = %s", (other,)
    ).fetchone() == (other_before,)
    assert database.execute(
        "select kind, outcome from public.case_actions where crew_id = %s", (crew,)
    ).fetchone() == ("clock", "moved")
    database.execute("update public.crews set status = 'forming' where id = %s", (other,))
    assert (
        rpc(database, "case_clock_forward", other, PLAYERS[0], "clock002", 600)["reason"]
        == "crew_not_active"
    )


def test_case_window_open_equals_python_window_open_for_all_case_windows(database, case_data):
    from server.game.case_clock import window_open
    from server.game.case_data import load_case

    windows = tuple(case_data["case_clock"]["windows"].values())
    assert len(windows) == 4, "The parity check must exercise all four recurring case windows."
    loaded = load_case()
    as_server(database)
    for window in windows:
        for minute in range(120):
            record = next(
                value
                for value in loaded.windows
                if value.every_minutes == window["every_minutes"]
                and value.from_minute == window["from_minute"]
                and value.open_minutes == window["open_minutes"]
            )
            expected = window_open(record, minute)
            actual = rpc(
                database,
                "case_window_open",
                minute,
                window["every_minutes"],
                window["from_minute"],
                window["open_minutes"],
            )
            assert actual is expected


@pytest.mark.parametrize(
    "minute,every,starts,opens",
    [(0, 0, 0, 1), (-1, 20, 0, 1), (0, 20, -1, 1), (0, 20, 0, 0)],
)
def test_invalid_windows_are_closed_without_division_errors(database, minute, every, starts, opens):
    as_server(database)
    assert rpc(database, "case_window_open", minute, every, starts, opens) is False
