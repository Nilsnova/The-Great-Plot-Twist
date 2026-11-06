"""The NPC route keeps orders behind player/flag gates and private cache headers."""

import pytest

from server.tests.case_api_helpers import HEADER
from server.tests.case_rule_helpers import PLAYER
from server.tests.test_case_phase2_routes_api import Port, client

BODY = {"seat": 2, "order": "fetch", "target": "C1", "actionUid": "order0001"}


def npc_client(port, flags="case"):
    return client(port, flags)


def test_npc_intent_passes_only_the_verified_actor_and_validated_values():
    port = Port()
    response = npc_client(port).post("/api/crews/me/orders", headers=HEADER, json=BODY)
    assert response.status_code == 200
    assert port.calls == [("order", PLAYER, (2, "fetch", "C1", False, "order0001"))]
    assert response.headers["cache-control"] == "private, no-store"


@pytest.mark.parametrize("flags,headers,status", [("", HEADER, 404), ("case", {}, 401)])
def test_npc_gates_make_no_service_call(flags, headers, status):
    port = Port()
    response = npc_client(port, flags).post("/api/crews/me/orders", headers=headers, json=BODY)
    assert response.status_code == status and port.calls == []
    assert response.headers["cache-control"] == "private, no-store"


def test_malformed_npc_input_is_private_without_any_service_call():
    port = Port()
    response = npc_client(port).post(
        "/api/crews/me/orders", headers=HEADER, json={**BODY, "seat": True, "coinsPaid": 50}
    )
    assert response.status_code == 422 and port.calls == []
    assert response.headers["cache-control"] == "private, no-store"
