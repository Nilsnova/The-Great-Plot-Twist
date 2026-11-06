"""New case intents preserve flag/auth/privacy boundaries and pass only verified inputs."""

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from server.app import create_app
from server.flags import parse_flags
from server.settings import Settings
from server.tests.case_api_helpers import HEADER, TestVerifier
from server.tests.case_rule_helpers import PLAYER, START, snapshot
from server.tests.helpers import FakeClock

INTENTS = [
    ("/api/board/pin", {"cardId": "C1"}, "pin", ("C1",)),
    ("/api/board/pair", {"cards": ["C1", "C2"]}, "pair", ("C1", "C2")),
    ("/api/finale/nightfall", {}, "nightfall", ()),
    ("/api/finale/post", {"light": "harbor_light"}, "post", ("harbor_light",)),
    (
        "/api/finale/signal",
        {"light": "harbor_light", "bearing": 20},
        "signal",
        ("harbor_light", 20),
    ),
]


class Port:
    def __init__(self):
        self.calls = []

    def __getattr__(self, name):
        async def call(admin, player_id, *args):
            self.calls.append((name, player_id, args))
            return {"accepted": True, "case": None}

        return call


def client(port, flags="case"):
    return TestClient(
        create_app(
            Settings(flags=parse_flags(flags), demo_mode=True),
            verifier=TestVerifier(),
            admin=object(),
            case_service=port,
        )
    )


@pytest.mark.parametrize(("path", "body", "method", "args"), INTENTS)
def test_new_intents_use_the_verified_player_and_private_cache(path, body, method, args):
    port = Port()
    response = client(port).post(path, headers=HEADER, json={**body, "actionUid": "intent001"})
    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    assert port.calls == [(method, PLAYER, (*args, "intent001"))]


@pytest.mark.parametrize(("path", "body", "method", "args"), INTENTS)
@pytest.mark.parametrize(("flags", "headers", "status"), [("", HEADER, 404), ("case", {}, 401)])
def test_gates_refuse_before_any_case_write(path, body, method, args, flags, headers, status):
    port = Port()
    response = client(port, flags).post(
        path, headers=headers, json={**body, "actionUid": "intent001"}
    )
    assert response.status_code == status and not port.calls
    assert response.headers["cache-control"] == "private, no-store"


@pytest.mark.parametrize("path", ["/api/board/pin", "/api/finale/signal"])
def test_validation_errors_are_private(path):
    port = Port()
    response = client(port).post(path, headers=HEADER, json={"actionUid": "intent001"})
    assert response.status_code == 422 and not port.calls
    assert response.headers["cache-control"] == "private, no-store"


def test_default_case_view_uses_the_app_clock_for_its_countdowns():
    clock = FakeClock()
    clock.now = START + timedelta(seconds=123)
    app = create_app(Settings(demo_mode=True), clock=clock)
    assert app.state.case.view(snapshot(), PLAYER)["now"] == 123
