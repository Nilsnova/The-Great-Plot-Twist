"""The client advertises compatibility; only the persisted owner policy grants geometry."""

import pytest
from pydantic import ValidationError

from server.errors import ApiError
from server.island import wave_recovery
from server.routes.waves import StartRequest
from server.tests.helpers import assert_error
from server.tests.island_helpers import PLAYER, PLAYER_ID, World


@pytest.mark.parametrize("value", [True, "1", -1, 2, None])
def test_capability_is_a_bounded_strict_integer(value):
    with pytest.raises(ValidationError):
        StartRequest(where="own", actionUid="capability-001", wallClientVersion=value)


def test_an_older_protocol_two_client_cannot_strand_a_new_perimeter_wave():
    world = World()
    world.database.wall_policies[PLAYER_ID] = {"ruleVersion": 1, "capacity": 128}
    response = world.client.post(
        "/api/waves/start",
        headers=PLAYER,
        json={"where": "own", "actionUid": "old-client-001", "waveProtocol": 2},
    )
    assert_error(response, 409, "client_update_required")
    assert world.database.calls("perimeter_wave_start") == []


def test_advertising_client_support_does_not_enable_the_owner_policy():
    world = World()
    response = world.client.post(
        "/api/waves/start",
        headers=PLAYER,
        json={
            "where": "own",
            "actionUid": "new-client-001",
            "waveProtocol": 2,
            "wallClientVersion": 1,
        },
    )
    assert response.status_code == 200, response.text
    assert world.database.wall_policies == {}
    assert world.database.calls("perimeter_wave_start")[0]["p_wall_client_version"] == 1
    assert response.json()["waveProtocol"] == 1


@pytest.mark.parametrize("reason", ["structure_recovery_required", "perimeter_rules_required"])
def test_start_wrapper_refusals_have_clear_stable_api_codes(reason):
    with pytest.raises(ApiError) as error:
        wave_recovery._refusal({"status": "refused", "reason": reason})
    assert (error.value.status_code, error.value.code) == (409, reason)
