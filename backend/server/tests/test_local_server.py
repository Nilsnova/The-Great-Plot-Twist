"""Local-only guards need no PostgreSQL extras or disposable database."""

import subprocess
import sys

import pytest
from fastapi.testclient import TestClient

from server.app import create_app
from server.settings import Settings
from tools.local_server import LocalServerRefused, create_local_app, require_local


@pytest.mark.parametrize(
    "env",
    [
        {},
        {"APP_ENV": "local"},
        {"LOCAL_TEST_SERVER": "1"},
        {"LOCAL_TEST_SERVER": "true", "APP_ENV": "local"},
        *[
            {"LOCAL_TEST_SERVER": "1", "APP_ENV": value}
            for value in ("", "preview", "production", "LOCAL", " local ")
        ],
        {"LOCAL_TEST_SERVER": "1", "APP_ENV": "local", "VERCEL": ""},
        {"LOCAL_TEST_SERVER": "1", "APP_ENV": "local", "VERCEL": "1"},
    ],
)
def test_startup_refuses_before_constructing_a_database(env, monkeypatch):
    def forbidden():
        pytest.fail("A refused factory must not construct the scratch database")

    monkeypatch.setattr("tools.local_server.ScratchDatabase", forbidden)
    with pytest.raises(LocalServerRefused):
        create_local_app(env)


def test_guard_and_factory_ignore_every_other_environment_value():
    class GuardOnly(dict):
        def get(self, key, default=None):
            assert key in ("LOCAL_TEST_SERVER", "APP_ENV")
            return super().get(key, default)

    env = GuardOnly(LOCAL_TEST_SERVER="1", APP_ENV="local")
    require_local(env)
    app = create_local_app(env)
    settings = app.state.settings
    assert settings.supabase_url == settings.supabase_publishable_key == ""
    assert settings.supabase_secret_key.get_secret_value() == ""
    assert settings.demo_mode and not settings.relight_open
    assert settings.flags["case"] and not settings.flags["sign_in"]
    assert len(settings.host_player_ids) == 1
    assert app.state.local_database.uri is None


def test_local_sign_in_is_absent_from_the_regular_app():
    assert "/api/local/sign-in" not in create_app(Settings()).openapi()["paths"]


def test_guard_module_does_not_import_optional_database_packages():
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "import sys; import tools.local_server; "
            "assert 'pgserver' not in sys.modules; assert 'psycopg' not in sys.modules",
        ],
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0


def test_startup_failure_still_closes_the_database(monkeypatch):
    closed = []

    def fail_start(self):
        raise RuntimeError("deliberate local startup failure")

    monkeypatch.setattr("tools.local_database.ScratchDatabase.start", fail_start)
    monkeypatch.setattr(
        "tools.local_database.ScratchDatabase.close", lambda self: closed.append(True)
    )
    with pytest.raises(RuntimeError, match="deliberate local startup failure"):
        with TestClient(create_local_app({"LOCAL_TEST_SERVER": "1", "APP_ENV": "local"})):
            pytest.fail("startup should fail")
    assert closed == [True]
