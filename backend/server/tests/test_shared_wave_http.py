"""Shared wave proof validation and compatibility without synthesized authority."""

from copy import deepcopy

import pytest
from pydantic import ValidationError
from starlette.requests import Request

from server.errors import ApiError
from server.island.shared_wave_http import SharedWaveProof, require_shared_wave_client


def proof():
    return {
        "economy": {
            "mode": "island_shared", "version": 1,
            "islandOwner": "11111111-1111-4111-8111-111111111111",
            "runEpoch": "22222222-2222-4222-8222-222222222222",
        },
        "sessionId": "33333333-3333-4333-8333-333333333333",
        "connectionGeneration": "9007199254740993",
    }


def test_controller_generation_remains_an_exact_decimal_string():
    saved = SharedWaveProof.model_validate(proof())
    assert saved.model_dump(mode="json") == proof()


@pytest.mark.parametrize("value", [True, 1, 1.0, "0", "01", "1.0", "-1", " 1"])
def test_controller_proof_refuses_coercion_and_noncanonical_generations(value):
    body = proof()
    body["connectionGeneration"] = value
    with pytest.raises(ValidationError):
        SharedWaveProof.model_validate(body)


@pytest.mark.parametrize("field", ["actorId", "payer", "accountId", "isController"])
def test_browser_cannot_supply_controller_or_payment_authority(field):
    body = deepcopy(proof())
    body[field] = "chosen-by-client"
    with pytest.raises(ValidationError):
        SharedWaveProof.model_validate(body)


@pytest.mark.parametrize("version,code", [(None, "economy_context_required"),
                                        ("2", "economy_version_mismatch")])
def test_shared_wave_transport_requires_the_common_capability(version, code):
    headers = [] if version is None else [(b"x-island-economy-version", version.encode())]
    request = Request({"type": "http", "headers": headers})
    with pytest.raises(ApiError) as error:
        require_shared_wave_client(request, 2)
    assert error.value.code == code


def test_native_protocol_one_refuses_instead_of_selecting_legacy_accounting():
    request = Request({"type": "http", "headers": [(b"x-island-economy-version", b"1")]})
    with pytest.raises(ApiError) as error:
        require_shared_wave_client(request, 1)
    assert (error.value.status_code, error.value.code) == (409, "client_update_required")
