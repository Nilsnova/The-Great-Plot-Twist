"""Private Unix-socket PostgreSQL for the case migration checks.

The fixture never reads a database URL or environment credentials. All game records are local
stand-ins; the server directory is removed after the session and each check is rolled back.
"""

import json
import os
from pathlib import Path
from uuid import UUID, uuid4

import pytest

ROOT = Path(__file__).resolve().parents[4]
MIGRATIONS = ROOT / "supabase" / "migrations"
CASE_MIGRATION = MIGRATIONS / "20261106060000_case_rules.sql"
PLAYERS = tuple(UUID(int=number) for number in range(1, 5))
KITS = ("witness", "informant", "true_keeper", "stranger")


def pytest_configure(config):
    config.addinivalue_line("markers", "pg: opt-in disposable PostgreSQL checks")


@pytest.fixture(scope="session")
def scratch_server(tmp_path_factory):
    if os.environ.get("CASE_PG_SCRATCH") != "1":
        pytest.skip("opt-in database tests")
    pgserver = pytest.importorskip("pgserver")
    psycopg = pytest.importorskip("psycopg")

    # get_server creates only the new directory supplied by pytest, outside the checkout.
    directory = tmp_path_factory.mktemp("case-pg") / "data"
    with pgserver.get_server(directory, cleanup_mode="delete") as server:
        parameters = psycopg.conninfo.conninfo_to_dict(server.get_uri())
        assert parameters.get("host", "").startswith("/"), "A local Unix socket is required."
        with psycopg.connect(server.get_uri(), autocommit=True) as database:
            database.execute(Path(__file__).with_name("stub.sql").read_text())
            for _ in range(2):
                for migration in sorted(MIGRATIONS.glob("*.sql")):
                    sql = migration.read_text()
                    # PostgreSQL parses and executes every migration. The separate pglast
                    # gate remains useful, but the documented SQL runner needs only these
                    # two test-only packages and must not silently skip without a third.
                    database.execute(sql)
        yield server
    assert not directory.exists(), "The disposable PostgreSQL directory was not removed."


@pytest.fixture
def database(scratch_server):
    import psycopg

    with psycopg.connect(scratch_server.get_uri()) as connection:
        yield connection
        connection.rollback()


@pytest.fixture(scope="session")
def case_data():
    # Read values for the checks without copying or printing solution literals.
    return json.loads((ROOT / "backend/content/secret/case.json").read_text())


def seed_crew(database, *, status="active", players=PLAYERS, partner=False):
    """Create a crew, its player records and four kit seats using test-only identifiers."""
    for player in players:
        database.execute(
            "insert into auth.users (id) values (%s) on conflict do nothing", (player,)
        )
    crew = uuid4()
    database.execute(
        "insert into public.crews (id, created_by, mode, status, started_at) "
        "values (%s, %s, 'crew', %s, clock_timestamp())",
        (crew, players[0], status),
    )
    for index, kit in enumerate(KITS, 1):
        if partner and index == 1:
            database.execute(
                "insert into public.crew_seats (crew_id, seat_no, npc_id, kit) "
                "values (%s, %s, 'test_partner', %s)",
                (crew, index, kit),
            )
        else:
            player = players[index - 1]
            database.execute(
                "insert into public.crew_seats (crew_id, seat_no, player_id, kit) "
                "values (%s, %s, %s, %s)",
                (crew, index, player, kit),
            )
    return crew


def as_server(database):
    database.execute("set local role service_role")


def as_owner(database):
    database.execute("reset role")


def rpc(database, name, *arguments):
    """Call a fixed test function with bound arguments, never a Supabase connection."""
    from psycopg.types.json import Jsonb

    json_lists = {"case_open": {2}, "case_accuse": {10}}
    arguments = tuple(
        Jsonb(value)
        if isinstance(value, dict)
        or (isinstance(value, list) and index in json_lists.get(name, set()))
        else value
        for index, value in enumerate(arguments)
    )
    parameters = ", ".join("%s" for _ in arguments)
    return database.execute(f"select public.{name}({parameters})", arguments).fetchone()[0]


def open_case(database, crew):
    # Witness starts with C2 for a player or partner; the route id is a public contract id.
    return rpc(
        database,
        "case_open",
        crew,
        "false_light",
        [{"kit": "witness", "card_id": "C2", "route_id": "C2.radio_words"}],
    )


def move_clock(database, crew, second):
    as_owner(database)
    database.execute(
        "update public.case_state set started_at = clock_timestamp() - make_interval(secs => %s) "
        "where crew_id = %s",
        (second, crew),
    )
    as_server(database)


def route(
    database,
    crew,
    *,
    uid="route0001",
    card="C4",
    route_id="C4.back_room",
    needs=None,
    window=None,
    timer=300,
):
    return rpc(
        database,
        "case_start_route",
        crew,
        PLAYERS[0],
        uid,
        card,
        route_id,
        needs or [],
        window,
        timer,
        0,
        None,
    )


def ready_to_accuse(database, crew):
    as_owner(database)
    database.execute(
        "update public.case_state set schooner_found_second = 0 where crew_id = %s", (crew,)
    )
    for deduction in ("D2", "D3", "D4"):
        database.execute(
            "insert into public.case_deductions "
            "(crew_id, deduction_id, formed_second, formed_seat) "
            "values (%s, %s, 0, 1) on conflict do nothing",
            (crew, deduction),
        )
    as_server(database)


def accuse(
    database, crew, case_data, *, uid="accuse001", correct=True, revision=None, version=None
):
    current_revision = database.execute(
        "select revision from public.case_state where crew_id = %s", (crew,)
    ).fetchone()[0]
    current_version = database.execute(
        "select version from public.crews where id = %s", (crew,)
    ).fetchone()[0]
    culprit = case_data["accusation"]["culprit"]
    suspect = (
        culprit
        if correct
        else next(item["id"] for item in case_data["suspects"] if item["id"] != culprit)
    )
    return rpc(
        database,
        "case_accuse",
        crew,
        PLAYERS[0],
        uid,
        suspect,
        culprit,
        ["D2", "D3", "D4"],
        60,
        400,
        800,
        "false_light:solve",
        [{"player_id": str(PLAYERS[0]), "share": 700}],
        current_revision if revision is None else revision,
        current_version if version is None else version,
        False,
    )
