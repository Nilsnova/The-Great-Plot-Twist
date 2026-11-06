"""The shared coast is public, flag-gated, spoiler-safe and cached only on success."""

import asyncio
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from server.app import create_app
from server.game.case_data import load_case
from server.settings import Settings
from server.supabase_admin import SupabaseAdmin
from server.tests.helpers import assert_error


def client_for(*, enabled=True, stage="relit", failure=False, configured=True):
    def reply(request):
        if failure:
            return httpx.Response(503)
        if request.url.path.endswith("/world_state"):
            return httpx.Response(
                200,
                json=[
                    {
                        "stage": stage,
                        "relit_at": "2026-11-20T12:00:00Z" if stage == "relit" else None,
                        "solves": 1 if stage == "relit" else 0,
                        "extra_lights": 0,
                    }
                ],
            )
        return httpx.Response(
            200,
            json=[
                {
                    "solve_no": 1,
                    "added_at": "2026-11-20T12:00:00Z",
                    "profiles": {"display_name": "Brave Puffin 17"},
                }
            ],
        )

    admin = SupabaseAdmin(
        "https://stand-in.invalid" if configured else "",
        "fixture" if configured else "",
        transport=httpx.MockTransport(reply),
    )
    app = create_app(settings=Settings(flags={"case": enabled}), admin=admin)
    return TestClient(app)


def test_world_route_needs_no_sign_in_is_cached_30_seconds_and_takes_no_query_parameters():
    client = client_for()
    answer = client.get("/api/world")
    assert answer.status_code == 200
    assert answer.headers["cache-control"] == "public, max-age=30, s-maxage=30"
    assert answer.json()["wall"] == [{"name": "Brave Puffin 17", "order": 1}]
    # A malformed Authorization header cannot turn this public route into a login dependency.
    assert client.get("/api/world", headers={"Authorization": "not-a-token"}).status_code == 200
    error = client.get("/api/world?crew=other")
    assert_error(error, 422, "validation_error")
    assert "public" not in error.headers.get("cache-control", "")


def test_world_route_is_behind_the_case_flag():
    assert_error(client_for(enabled=False).get("/api/world"), 404, "feature_off")


def test_the_world_answer_never_names_the_culprit():
    data = load_case()
    answer = client_for().get("/api/world").json()
    assert answer["line"] == data.raw["relighting"]["spoiler_rule"]["everyone_else_sees"]
    assert data.accusation.culprit not in json.dumps(answer)
    assert all(set(row) == {"name", "order"} for row in answer["wall"])


def test_world_laptop_fallback_and_database_failure():
    answer = client_for(configured=False).get("/api/world")
    assert answer.status_code == 200 and answer.json()["stage"] == "dark"
    error = client_for(failure=True).get("/api/world")
    assert_error(error, 503, "database_unavailable")
    assert "public" not in error.headers.get("cache-control", "")


@pytest.mark.parametrize("stage", ["dark", "relit"])
def test_public_coast_bulletin_and_exchange_use_the_same_world_state(stage):
    client = client_for(stage=stage)
    app = client.app
    public = client.get("/api/world").json()
    bulletin_stage = asyncio.run(app.state.world_stage.read())
    exchange_relit = asyncio.run(app.state.market.relit_check(app.state.admin))
    assert public["stage"] == bulletin_stage.stage == stage
    assert public["lightsOn"] == exchange_relit == (stage == "relit")
