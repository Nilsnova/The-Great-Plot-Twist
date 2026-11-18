"""Real foundation composition with fixture RPC replies, without runtime authority claims."""

import asyncio
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest

from server.errors import ApiError
from server.island.economy_permissions import EconomyPermit
from server.island.treasury import EconomyContext
from server.island.wave_session_adapter import read_reserved_session_preflight
from server.island.wave_session_state import (
    FrozenCaptain,
    ParticipantSlot,
    ParticipantSnapshot,
    Reservation,
)
from server.supabase_admin import SupabaseRejected, SupabaseUnavailable

OWNER, ACTOR, ACCOUNT, EPOCH, WAVE, OTHER, SESSION = (str(UUID(int=n)) for n in range(1, 8))
NOW = datetime(2026, 11, 18, 12, tzinfo=UTC)
FROZEN = EconomyContext("island_shared", 1, OWNER, OWNER, ACCOUNT, EPOCH, 1)
SNAPSHOT = ParticipantSnapshot(
    UUID(ACTOR),
    UUID(SESSION),
    FrozenCaptain(1, "engineer", (), "musket"),
    b'{"hp":10,"fallen":false,"head":17}',
)
RESERVATION = Reservation(
    UUID(WAVE),
    UUID(OWNER),
    UUID(EPOCH),
    NOW - timedelta(seconds=10),
    NOW,
    NOW + timedelta(seconds=900),
    (ParticipantSlot(SNAPSHOT),),
    b'{"difficulty":1}',
)


def authority() -> dict:
    return {
        "actor_id": ACTOR,
        "island_owner": OWNER,
        "is_member": True,
        "reservation_id": WAVE,
        "session_leader_id": OWNER,
        "actor_assignment_wave_id": WAVE,
    }


def context_reply() -> dict:
    return {
        "status": "ok",
        "economy": {
            "mode": "island_shared",
            "version": 1,
            "islandOwner": OWNER,
            "accountId": ACCOUNT,
            "runEpoch": EPOCH,
            "revision": "9",
            "treasury": {"balanceCoins": "0", "committedCoins": "0", "availableCoins": "0"},
        },
    }


class ReadOnlyAdmin:
    def __init__(self) -> None:
        self.context = context_reply()
        self.authority: object = authority()
        self.calls: list[tuple[str, dict]] = []

    async def call_function(self, name: str, arguments: dict) -> object:
        self.calls.append((name, arguments))
        if name == "island_economy_context":
            return self.context
        if name == "island_economy_authority":
            if isinstance(self.authority, Exception):
                raise self.authority
            return self.authority
        raise AssertionError("Session preflight must only read the published foundation RPCs.")


def preflight(
    admin: ReadOnlyAdmin,
    *,
    frozen: EconomyContext | None = FROZEN,
    wave: Reservation = RESERVATION,
    action: str = "combat_input",
    now: datetime = NOW,
    generation: int = 0,
) -> EconomyPermit:
    return asyncio.run(
        read_reserved_session_preflight(
            admin,
            ACTOR,
            wave,
            frozen,
            UUID(SESSION),
            generation,
            now,
            action=action,
        )
    )


def test_real_foundation_modules_bind_the_authenticated_actor_to_the_frozen_wave_origin() -> None:
    admin = ReadOnlyAdmin()
    permit = preflight(admin)
    assert permit.context.actor_id == ACTOR
    assert permit.context.actor_id != FROZEN.actor_id
    assert permit.context.account_id == FROZEN.account_id
    assert permit.context.revision == 9
    assert permit.action == "combat_input"
    assert admin.calls == [
        ("island_economy_context", {"p_island_owner": OWNER}),
        ("island_economy_authority", {"p_actor_id": ACTOR, "p_island_owner": OWNER}),
    ]


def test_free_revive_preflight_works_at_zero_funds_and_never_calls_a_money_function() -> None:
    admin = ReadOnlyAdmin()
    permit = preflight(admin, action="wave_revive")
    assert permit.funding == "none"
    assert len(admin.calls) == 2


def test_a_stale_wave_cannot_use_a_current_assignment_to_another_wave_on_the_same_run() -> None:
    admin = ReadOnlyAdmin()
    admin.authority = authority() | {"reservation_id": OTHER, "actor_assignment_wave_id": OTHER}
    with pytest.raises(ApiError) as caught:
        preflight(admin)
    assert caught.value.code == "wave_over"


def test_a_current_wave_cannot_use_the_actors_assignment_on_another_island() -> None:
    admin = ReadOnlyAdmin()
    admin.authority = authority() | {"actor_assignment_wave_id": OTHER}
    with pytest.raises(ApiError) as caught:
        preflight(admin)
    assert caught.value.code == "not_in_wave"


def test_another_account_cannot_replace_the_frozen_wave_origin() -> None:
    with pytest.raises(ApiError) as caught:
        preflight(ReadOnlyAdmin(), frozen=replace(FROZEN, account_id=OTHER))
    assert caught.value.code == "economy_path_unavailable"


def test_a_current_new_run_cannot_accept_the_previous_frozen_epoch() -> None:
    admin = ReadOnlyAdmin()
    admin.context["economy"]["runEpoch"] = OTHER
    with pytest.raises(ApiError) as caught:
        preflight(admin)
    assert caught.value.code == "economy_epoch_mismatch"


def test_recovery_epoch_is_not_an_alternative_source_for_a_missing_frozen_economy_binding() -> None:
    admin = ReadOnlyAdmin()
    with pytest.raises(ApiError) as caught:
        preflight(admin, frozen=None)
    assert caught.value.code == "economy_path_unavailable"
    assert admin.calls == []


@pytest.mark.parametrize(
    "frozen",
    (
        replace(FROZEN, island_owner=OTHER),
        replace(FROZEN, account_id=None),
        replace(FROZEN, account_id="not-an-account"),
        replace(FROZEN, version=True),
        replace(FROZEN, mode="personal_legacy", version=0),
    ),
)
def test_missing_or_incoherent_frozen_origins_fail_closed(frozen: EconomyContext) -> None:
    with pytest.raises(ApiError) as caught:
        preflight(ReadOnlyAdmin(), frozen=frozen)
    assert caught.value.code == "economy_path_unavailable"


def test_the_frozen_wave_epoch_must_match_its_reserved_run() -> None:
    with pytest.raises(ApiError) as caught:
        preflight(ReadOnlyAdmin(), frozen=replace(FROZEN, run_epoch=OTHER))
    assert caught.value.code == "economy_epoch_mismatch"


@pytest.mark.parametrize("answer", (SupabaseRejected(), None, {}, authority() | {"is_member": 1}))
def test_absent_or_malformed_authority_uses_the_published_fail_closed_decoder(
    answer: object,
) -> None:
    admin = ReadOnlyAdmin()
    admin.authority = answer
    with pytest.raises(ApiError) as caught:
        preflight(admin)
    assert caught.value.code == "economy_path_unavailable"


def test_database_transport_failure_is_not_converted_to_a_legacy_permission() -> None:
    admin = ReadOnlyAdmin()
    admin.authority = SupabaseUnavailable()
    with pytest.raises(SupabaseUnavailable):
        preflight(admin)


def test_departed_members_cannot_use_a_previously_frozen_slot() -> None:
    admin = ReadOnlyAdmin()
    admin.authority = authority() | {"is_member": False}
    with pytest.raises(ApiError) as caught:
        preflight(admin)
    assert caught.value.code == "not_member"


def test_an_old_connection_generation_cannot_submit_commands_after_reconnect() -> None:
    slot = replace(RESERVATION.slots[0], connection_generation=1)
    with pytest.raises(ApiError) as caught:
        preflight(ReadOnlyAdmin(), wave=replace(RESERVATION, slots=(slot,)))
    assert caught.value.code == "not_controller"


def test_a_boolean_is_not_a_controller_generation_even_when_it_compares_equal() -> None:
    with pytest.raises(ApiError) as caught:
        preflight(ReadOnlyAdmin(), generation=False)
    assert caught.value.code == "not_controller"


@pytest.mark.parametrize("status", ("disconnected", "withdrawn"))
def test_a_retained_or_withdrawn_body_has_no_active_input_authority(status: str) -> None:
    slot = replace(RESERVATION.slots[0], status=status)
    with pytest.raises(ApiError) as caught:
        preflight(ReadOnlyAdmin(), wave=replace(RESERVATION, slots=(slot,)))
    assert caught.value.code == "not_controller"


def test_countdown_only_connection_cannot_send_combat_or_revive_commands() -> None:
    with pytest.raises(ApiError) as caught:
        preflight(ReadOnlyAdmin(), now=NOW - timedelta(seconds=1))
    assert caught.value.code == "wave_too_early"


def test_expired_wave_cannot_obtain_a_fresh_session_preflight() -> None:
    with pytest.raises(ApiError) as caught:
        preflight(ReadOnlyAdmin(), now=RESERVATION.expires_at)
    assert caught.value.code == "wave_over"


@pytest.mark.parametrize("action", ("wave_ready", "wave_join", "settlement", "island_visit"))
def test_unsupported_actions_never_alias_a_read_or_receipt_privilege(action: str) -> None:
    admin = ReadOnlyAdmin()
    with pytest.raises(ValueError, match="reserved-session"):
        preflight(admin, action=action)
    assert admin.calls == []


def test_legacy_context_cannot_fall_back_to_personal_money_or_authority() -> None:
    admin = ReadOnlyAdmin()
    admin.context = {"status": "legacy", "islandOwner": OWNER}
    with pytest.raises(ApiError) as caught:
        preflight(admin)
    assert caught.value.code == "economy_context_required"
    assert len(admin.calls) == 1
