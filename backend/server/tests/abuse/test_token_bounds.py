"""Resource bounds at the bearer-token boundary, without upstream network access."""

import httpx
from fastapi.testclient import TestClient

from server.app import create_app
from server.auth import PlayerVerifier
from server.tests.helpers import CONFIGURED_SETTINGS, assert_error


def test_oversized_token_is_refused_before_upstream_verification():
    seen = []

    def reject(request):
        seen.append(request)
        return httpx.Response(401, json={"msg": "invalid JWT"})

    verifier = PlayerVerifier(CONFIGURED_SETTINGS, transport=httpx.MockTransport(reject))
    client = TestClient(create_app(CONFIGURED_SETTINGS, verifier=verifier))
    response = client.get("/api/save", headers={"Authorization": "Bearer " + "a" * 4097})

    assert_error(response, 401, "unauthorized")
    assert seen == []
