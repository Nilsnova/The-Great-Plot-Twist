"""Shared wave proof validation and compatibility without synthesized authority."""

import asyncio
from copy import deepcopy

import pytest
from pydantic import ValidationError
from starlette.requests import Request

from server.errors import ApiError
from server.island.shared_wave_http import (
    SharedWaveProof,
    read_target_context,
    require_legacy_controller,
    require_shared_wave_client,
)
from server.supabase_admin import SupabaseRejected
from server.tests.island_helpers import PLAYER_ID, World
from server.tests.test_personal_captain import reply as captain_reply


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


def test_readonly_mode_discovery_never_initializes_the_own_island():
    world = World()
    context = asyncio.run(read_target_context(world.app.state.admin, PLAYER_ID, "own"))
    assert context.mode == "personal_legacy"
    assert world.database.paths() == ["POST /rpc/island_economy_context"]


@pytest.mark.parametrize("value,code", [
    ({"status": "missing_island"}, None),
    ({"status": "not_understood"}, "database_error"),
    ({"status": "refused", "reason": "unrecognized"}, "database_error"),
])
def test_only_an_explicit_missing_own_island_can_reach_legacy_creation(value, code):
    world = World()
    world.database.economy_context_replies[PLAYER_ID] = value
    if code is None:
        assert asyncio.run(read_target_context(world.app.state.admin, PLAYER_ID, "own")) is None
    else:
        with pytest.raises(ApiError) as error:
            asyncio.run(read_target_context(world.app.state.admin, PLAYER_ID, "own"))
        assert error.value.code == code
    assert world.database.paths() == ["POST /rpc/island_economy_context"]


def test_pirate_point_has_no_island_account_to_resolve():
    world = World()
    context = asyncio.run(read_target_context(world.app.state.admin, PLAYER_ID, "pirate_point"))
    assert context is None
    assert world.database.paths() == []


class CaptainContextAdmin:
    def __init__(self, value):
        self.value, self.calls = value, []

    async def call_function(self, name, arguments):
        self.calls.append((name, arguments))
        return self.value


@pytest.mark.parametrize("value,code", [
    ({"status": "legacy"}, None),
    (captain_reply(), "personal_captain_managed"),
    ({"status": "ok"}, "database_error"),
])
def test_legacy_controller_check_reads_the_global_captain_without_import(value, code):
    admin = CaptainContextAdmin(value)
    if code is None:
        asyncio.run(require_legacy_controller(admin, PLAYER_ID))
    else:
        with pytest.raises((ApiError, SupabaseRejected)) as error:
            asyncio.run(require_legacy_controller(admin, PLAYER_ID))
        assert error.value.code == code
    assert admin.calls == [("personal_captain_context", {"p_player_id": PLAYER_ID})]
