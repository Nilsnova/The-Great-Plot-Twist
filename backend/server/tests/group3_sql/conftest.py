"""Apply the complete group 3 chain twice on a disposable Unix-socket PostgreSQL.

Used only by the opt-in migration tests. Never reads a configured database URL or credentials.
"""

from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[4]
GROUP3_STAMPS = {
    "20261106" + suffix
    for suffix in (
        "000000",
        "010000",
        "020000",
        "030000",
        "040000",
        "050000",
        "070000",
        "090000",
        "100000",
        "110000",
    )
}


def pytest_configure(config):
    config.addinivalue_line("markers", "pg: opt-in disposable PostgreSQL checks")


@pytest.fixture(scope="session")
def group3_database(tmp_path_factory):
    pgserver = pytest.importorskip("pgserver")
    psycopg = pytest.importorskip("psycopg")
    pglast = pytest.importorskip("pglast")
    directory = tmp_path_factory.mktemp("group3-pg") / "data"
    with pgserver.get_server(directory, cleanup_mode="delete") as server:
        settings = psycopg.conninfo.conninfo_to_dict(server.get_uri())
        assert settings.get("host", "").startswith("/"), "A private Unix socket is required."
        with psycopg.connect(server.get_uri(), autocommit=True) as connection:
            connection.execute(Path(__file__).with_name("stub.sql").read_text())
            # Keep this checkpoint's object-count proof stable when later case phases land.
            # The case SQL package separately applies its entire contemporary chain.
            migrations = [
                path
                for path in sorted((ROOT / "supabase/migrations").glob("*.sql"))
                if path.name.split("_", 1)[0] in GROUP3_STAMPS
            ]
            assert len(migrations) == 10
            for _ in range(2):
                for migration in migrations:
                    sql = migration.read_text()
                    pglast.parse_sql(sql)
                    connection.execute(sql)
            yield connection
    assert not directory.exists(), "The disposable database must be removed after the checks."
