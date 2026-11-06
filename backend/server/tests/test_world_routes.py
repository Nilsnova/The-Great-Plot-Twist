"""The public world route needs no login, rejects query strings and caches only success."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from server.errors import register_error_handlers
from server.flags import parse_flags
from server.game.world_state import WorldReader
from server.routes.world import router
from server.settings import Settings
from server.supabase_admin import SupabaseUnavailable
from server.tests.test_world_read import PUBLIC_LINE, Database


def client(database=None, *, flags="case"):
    app = FastAPI()
    app.state.settings = Settings(flags=parse_flags(flags), demo_mode=True)
    app.state.world_reader = WorldReader(
        database, enabled=flags == "case", line_loader=lambda: PUBLIC_LINE
    )
    register_error_handlers(app)
    app.include_router(router, prefix="/api")
    return TestClient(app)


def test_the_world_route_needs_no_sign_in_and_is_publicly_cached_for_thirty_seconds():
    database = Database(relit=True)
    response = client(database).get("/api/world", headers={"Authorization": "invalid"})

    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=30, s-maxage=30"
    assert response.json()["wall"] == [{"name": "Brave Puffin 17", "order": 1}]


def test_case_off_is_404_before_database_reads_even_with_queries():
    database = Database(relit=True)
    response = client(database, flags="").get("/api/world?extra=1")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "feature_off"
    assert database.calls == []


def test_query_parameters_are_422_before_database_reads():
    database = Database()
    response = client(database).get("/api/world?extra=1")

    assert response.status_code == 422 and database.calls == []
    assert response.headers["cache-control"] == "private, no-store"


def test_no_database_is_the_dark_world():
    response = client().get("/api/world")

    assert response.status_code == 200
    assert response.json()["stage"] == "dark"
    assert response.json()["line"] is None


@pytest.mark.parametrize("malformed", [False, True])
def test_database_errors_are_private_generic_503s(malformed):
    database = Database()
    if malformed:
        database.rows = [{"stage": "malformed-private-row"}]
    else:
        database.error = SupabaseUnavailable()
    response = client(database).get("/api/world")

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "database_unavailable"
    assert response.headers["cache-control"] == "private, no-store"
    assert "malformed-private-row" not in response.text
