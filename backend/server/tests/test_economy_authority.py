"""Strict service-only authority admission rejects missing, forged and unavailable state.

Used by: MP-ECO-08. These fakes do not claim database lock or mutation coverage.
"""

import asyncio

import pytest

from server.errors import ApiError
from server.island.economy_authority import read_economy_authority
from server.supabase_admin import SupabaseRejected, SupabaseUnavailable

ACTOR = "00000000-0000-4000-8000-000000000001"
OWNER = "00000000-0000-4000-8000-000000000002"
OTHER = "00000000-0000-4000-8000-000000000003"
WAVE = "00000000-0000-4000-8000-000000000010"


def row(**changes):
    values = {"actor_id": ACTOR, "island_owner": OWNER, "is_member": True,
              "reservation_id": WAVE, "session_leader_id": ACTOR,
              "actor_assignment_wave_id": WAVE}
    values.update(changes)
    return values


class Admin:
    def __init__(self, answer):
        self.answer = answer
        self.calls = []

    async def call_function(self, name, arguments):
        self.calls.append((name, arguments))
        if isinstance(self.answer, Exception):
            raise self.answer
        return self.answer


def test_server_identity_member_reservation_and_leader_are_read_together():
    admin = Admin(row())
    result = asyncio.run(read_economy_authority(admin, ACTOR, OWNER))
    assert result.actor_id == ACTOR
    assert result.island_owner == OWNER
    assert result.is_member is True
    assert result.reservation_id == WAVE
    assert result.actor_assignment_wave_id == WAVE
    assert result.session_leader_id == ACTOR
    assert admin.calls == [("island_economy_authority", {
        "p_actor_id": ACTOR, "p_island_owner": OWNER,
    })]


@pytest.mark.parametrize("answer", [
    None, [], [row()], {}, {"status": "unavailable"},
    row(is_member="true"), row(is_member=1), row(is_member=None),
    row(actor_id=OTHER), row(island_owner=OTHER), row(actor_id="owner"),
    row(reservation_id="combat"), row(actor_assignment_wave_id="active"),
    row(session_leader_id="me"), row(payer=OWNER),
])
def test_unreadable_or_cross_identity_authority_fails_closed(answer):
    with pytest.raises(ApiError) as caught:
        asyncio.run(read_economy_authority(Admin(answer), ACTOR, OWNER))
    assert (caught.value.status_code, caught.value.code) == (409, "economy_path_unavailable")


@pytest.mark.parametrize("missing", list(row()))
def test_missing_authority_fields_are_not_defaulted_to_idle_or_owner(missing):
    answer = row()
    del answer[missing]
    with pytest.raises(ApiError) as caught:
        asyncio.run(read_economy_authority(Admin(answer), ACTOR, OWNER))
    assert caught.value.code == "economy_path_unavailable"


def test_idle_and_departed_state_are_returned_without_fabricating_permission():
    result = asyncio.run(read_economy_authority(Admin(row(
        is_member=False, reservation_id=None, session_leader_id=None,
        actor_assignment_wave_id=None,
    )), ACTOR, OWNER))
    assert result.is_member is False
    assert result.reservation_id is None
    assert result.session_leader_id is None
    assert result.actor_assignment_wave_id is None


def test_unimplemented_authority_rpc_is_an_unavailable_path_not_legacy_permission():
    with pytest.raises(ApiError) as caught:
        asyncio.run(read_economy_authority(Admin(SupabaseRejected()), ACTOR, OWNER))
    assert (caught.value.status_code, caught.value.code) == (409, "economy_path_unavailable")


def test_transport_outcome_remains_unavailable_without_making_up_authority():
    with pytest.raises(SupabaseUnavailable):
        asyncio.run(read_economy_authority(Admin(SupabaseUnavailable()), ACTOR, OWNER))
