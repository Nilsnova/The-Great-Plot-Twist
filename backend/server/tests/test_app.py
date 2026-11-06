"""Tests for the app as a whole: the error shape, the /api prefix and the Vercel entry file."""

import importlib.util
import inspect
import subprocess
import sys
import tomllib
from dataclasses import replace
from pathlib import Path

import pytest
from fastapi.exceptions import RequestValidationError
from fastapi.testclient import TestClient

from server import __version__
from server.app import create_app
from server.clock import ClockDep, utc_now
from server.errors import ApiError, describe_validation_problems
from server.tests.helpers import CONFIGURED_SETTINGS, FakeClock, assert_error

# backend/ holds main.py, pyproject.toml and the server/ package.
BACKEND_ROOT = Path(__file__).resolve().parents[2]
ENTRY_FILE = BACKEND_ROOT / "main.py"

# Every environment variable the server reads (see backend/server/settings.py).
SETTING_NAMES = (
    "APP_ENV",
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "CRON_SECRET",
    "DEMO_MODE",
    "FEATURE_FLAGS",
    "HOST_PLAYER_IDS",
)


@pytest.fixture
def empty_environment(monkeypatch):
    """Remove every setting the server reads, so the test does not depend on your own shell.

    Programs that a test starts (a subprocess) get the same empty environment.
    """
    for name in SETTING_NAMES:
        monkeypatch.delenv(name, raising=False)


def make_problem(field_name: str) -> dict:
    """One validation mistake, in the form FastAPI reports them."""
    return {"loc": ("query", field_name), "msg": "bad value", "type": "value_error"}


def make_client(raise_server_exceptions: bool = True) -> TestClient:
    """A client for an app that also has routes which fail on purpose.

    By default the test client re-raises bugs inside the app, which helps while developing.
    Pass False to see the response a real browser would get.
    """
    app = create_app(CONFIGURED_SETTINGS)

    @app.get("/api/test/needs-number")
    async def needs_number(n: int) -> dict[str, int]:
        return {"n": n}

    @app.get("/api/test/teapot")
    async def teapot() -> None:
        raise ApiError(418, "teapot", "I am a teapot.")

    @app.get("/api/test/crash")
    async def crash() -> None:
        raise RuntimeError("secret detail that must not leak")

    return TestClient(app, raise_server_exceptions=raise_server_exceptions)


# --- the one error shape ---


def test_unknown_url_uses_the_error_shape():
    response = make_client().get("/api/no-such-page")

    assert_error(response, 404, "not_found")


def test_wrong_method_uses_the_error_shape_and_keeps_the_allow_header():
    response = make_client().post("/api/health")

    assert_error(response, 405, "method_not_allowed")
    assert "GET" in response.headers["allow"]


def test_validation_error_uses_the_error_shape_and_does_not_repeat_the_input():
    response = make_client().get("/api/test/needs-number", params={"n": "banana"})

    assert_error(response, 422, "validation_error")
    assert "query.n" in response.json()["error"]["message"]
    assert "banana" not in response.text


def test_validation_message_lists_at_most_five_problems():
    six_problems = [
        make_problem("field0"),
        make_problem("field1"),
        make_problem("field2"),
        make_problem("field3"),
        make_problem("field4"),
        make_problem("field5"),
    ]

    message = describe_validation_problems(RequestValidationError(six_problems))

    assert "field0" in message
    assert "field4" in message
    assert "field5" not in message


def test_api_error_keeps_its_own_status_code_and_message():
    response = make_client().get("/api/test/teapot")

    assert_error(response, 418, "teapot")
    assert response.json()["error"]["message"] == "I am a teapot."


def test_unexpected_error_hides_all_details():
    client = make_client(raise_server_exceptions=False)  # show what a real browser would get

    response = client.get("/api/test/crash")

    assert_error(response, 500, "server_error")
    assert "secret detail" not in response.text
    assert "RuntimeError" not in response.text
    assert "Traceback" not in response.text


@pytest.mark.parametrize(
    ("method", "path", "status"),
    [
        ("GET", "/api/health", 200),
        ("GET", "/api/me", 401),
        ("GET", "/api/no-such-page", 404),
        ("POST", "/api/health", 405),
        ("GET", "/api/test/needs-number?n=bad", 422),
        ("GET", "/api/test/crash", 500),
    ],
)
def test_api_answers_without_an_explicit_cache_policy_default_to_no_store(method, path, status):
    response = make_client(raise_server_exceptions=False).request(method, path)

    assert response.status_code == status
    assert response.headers["cache-control"] == "private, no-store"


def test_public_content_keeps_its_explicit_cache_policy():
    response = make_client().get("/api/content/intro-story")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=300"


# --- every URL lives under /api ---


def test_every_documented_url_starts_with_api():
    paths = make_client().get("/api/openapi.json").json()["paths"]

    assert paths
    assert all(path.startswith("/api/") for path in paths)


@pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"])
def test_fastapis_default_urls_outside_api_do_not_exist(path):
    assert make_client().get(path).status_code == 404


@pytest.mark.parametrize("app_env", ["local", "preview"])
def test_interactive_docs_are_available_under_api(app_env):
    client = TestClient(create_app(replace(CONFIGURED_SETTINGS, app_env=app_env)))

    assert client.get("/api/docs").status_code == 200
    assert client.get("/api/openapi.json").status_code == 200


@pytest.mark.parametrize("path", ["/api/docs", "/api/openapi.json"])
def test_interactive_docs_are_not_served_in_production(path):
    # The docs list every route and what it accepts. Production does not hand that out.
    client = TestClient(create_app(replace(CONFIGURED_SETTINGS, app_env="production")))

    assert_error(client.get(path), 404, "not_found")


# --- the Vercel entry file and the version ---


def test_entry_file_exposes_the_app(empty_environment):
    spec = importlib.util.spec_from_file_location("entry", ENTRY_FILE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    assert module.app.title == "The Great Plot Twist API"


def test_entry_file_finds_the_server_package_when_started_from_another_folder(
    tmp_path, empty_environment
):
    # "-I" starts Python without the current folder on its import path, like Vercel does.
    # The server folder can then only be found through the fix at the top of main.py.
    code = (
        "import importlib.util; "
        f"spec = importlib.util.spec_from_file_location('entry', {str(ENTRY_FILE)!r}); "
        "module = importlib.util.module_from_spec(spec); "
        "spec.loader.exec_module(module); "
        "print(module.app.title)"
    )

    result = subprocess.run(
        [sys.executable, "-I", "-c", code], cwd=tmp_path, capture_output=True, text=True
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "The Great Plot Twist API"


def test_importing_server_app_does_not_read_the_environment(monkeypatch):
    # A typo in FEATURE_FLAGS must stop create_app(), but never a plain import. Otherwise a
    # wrong variable in your shell would stop the tests from loading at all.
    monkeypatch.setenv("FEATURE_FLAGS", "markt")

    result = subprocess.run(
        [sys.executable, "-c", "import server.app"],
        cwd=BACKEND_ROOT,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr


def test_version_in_the_code_matches_pyproject():
    with open(BACKEND_ROOT / "pyproject.toml", "rb") as file:
        pyproject = tomllib.load(file)

    assert pyproject["project"]["version"] == __version__


# --- the services of create_app that only tests replace ---


SERVICES = (
    "weather_source",
    "exchanger",
    "market_service",
    "prediction_desk",
    "duel_service",
    "broadcaster",
    "islet_catalogue",
    "world_stage",
    "clock",
)


@pytest.mark.parametrize("name", SERVICES)
def test_the_new_services_are_keyword_only(name):
    parameter = inspect.signature(create_app).parameters[name]

    assert parameter.kind is inspect.Parameter.KEYWORD_ONLY


def test_the_app_clock_is_the_real_clock_unless_a_test_passes_one():
    app = create_app(CONFIGURED_SETTINGS)

    assert app.state.clock is utc_now


def test_the_app_keeps_the_clock_a_test_passes_in():
    clock = FakeClock()

    app = create_app(CONFIGURED_SETTINGS, clock=clock)

    assert app.state.clock is clock


def test_a_route_can_ask_for_the_clock_of_the_app():
    clock = FakeClock()
    app = create_app(CONFIGURED_SETTINGS, clock=clock)

    @app.get("/api/test/time")
    async def what_time_is_it(now: ClockDep) -> dict[str, str]:
        return {"now": now().isoformat()}

    response = TestClient(app).get("/api/test/time")

    assert response.json() == {"now": "2026-11-05T12:00:00+00:00"}
