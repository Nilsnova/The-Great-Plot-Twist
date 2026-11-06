"""The bulletin stays hidden by default without querying weather, world, market or database."""

from fastapi.testclient import TestClient

from server.app import create_app
from server.flags import default_flags, parse_flags
from server.settings import Settings
from server.tests.bulletin_helpers import World


class NoRead:
    async def get(self):
        raise AssertionError("Disabled bulletin must not fetch weather")

    async def read(self):
        raise AssertionError("Disabled bulletin must not read world state")

    async def select_rows(self, *args):
        raise AssertionError("Disabled bulletin must not read database")


def test_bulletin_is_default_off_and_can_be_explicitly_enabled():
    assert default_flags()["bulletin"] is False
    assert parse_flags("bulletin")["bulletin"] is True
    assert World().get().status_code == 200


def test_disabled_bulletin_refuses_before_data_reads_or_content_errors():
    spy = NoRead()
    app = create_app(Settings(), admin=spy, weather_source=spy, world_stage=spy)
    app.state.daily_content = None
    app.state.weather_rules = None
    response = TestClient(app).get("/api/bulletin")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "feature_disabled"
    assert response.headers["cache-control"] == "private, no-store"
