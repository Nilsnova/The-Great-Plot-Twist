"""Reservation and reconnect invariants for the inactive shared-session domain layer."""

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest

from server.errors import ApiError
from server.island.wave_session_lifecycle import (
    accepts_input,
    close_wave,
    disconnect,
    expire_slots,
    reconnect,
    reserve_wave,
    withdraw,
)
from server.island.wave_session_participation import (
    acknowledge_combat,
    completed_participants,
    victory_participants,
)
from server.island.wave_session_state import (
    ControlLease,
    FrozenCaptain,
    ParticipantSlot,
    ParticipantSnapshot,
    Reservation,
)

NOW = datetime(2026, 11, 18, 12, tzinfo=UTC)
OWNER, PLAYER, OTHER, SESSION, OTHER_SESSION, WAVE, EPOCH, COPY = map(
    UUID,
    (
        "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-000000000002",
        "00000000-0000-0000-0000-000000000003",
        "00000000-0000-0000-0000-000000000004",
        "00000000-0000-0000-0000-000000000005",
        "00000000-0000-0000-0000-000000000006",
        "00000000-0000-0000-0000-000000000007",
        "00000000-0000-0000-0000-000000000008",
    ),
)
LOADOUT = FrozenCaptain(5, "engineer", ("bastion",), "blunderbuss", COPY, 3)
LEASE = ControlLease(PLAYER, SESSION, OWNER, NOW)
CHECKPOINT = b'{"hp":0,"fallen":true,"x":12,"z":-4,"reloadUntil":90,"head":17}'
SNAPSHOT = ParticipantSnapshot(PLAYER, SESSION, LOADOUT, CHECKPOINT)


def wave() -> Reservation:
    return reserve_wave(
        WAVE,
        OWNER,
        EPOCH,
        NOW,
        NOW + timedelta(seconds=10),
        NOW + timedelta(seconds=900),
        (SNAPSHOT,),
        (LEASE,),
        frozenset(),
        b'{"defenses":["wall"],"difficulty":1}',
    )


def test_bell_freezes_roster_loadout_and_world_snapshot() -> None:
    reserved = wave()
    assert reserved.slots[0].snapshot is SNAPSHOT
    assert reserved.world_snapshot == b'{"defenses":["wall"],"difficulty":1}'
    assert reserved.slots[0].snapshot.captain.copy_generation == 3


def test_bell_rejects_a_second_live_cross_island_assignment() -> None:
    with pytest.raises(ApiError, match="already assigned") as error:
        reserve_wave(
            WAVE,
            OWNER,
            EPOCH,
            NOW,
            NOW + timedelta(seconds=10),
            NOW + timedelta(seconds=900),
            (SNAPSHOT,),
            (LEASE,),
            frozenset({PLAYER}),
            b"{}",
        )
    assert error.value.code == "captain_assigned"


def test_bell_rejects_a_forged_or_old_controlling_session() -> None:
    with pytest.raises(ApiError) as error:
        reserve_wave(
            WAVE,
            OWNER,
            EPOCH,
            NOW,
            NOW + timedelta(seconds=10),
            NOW + timedelta(seconds=900),
            (replace(SNAPSHOT, session_id=OTHER_SESSION),),
            (LEASE,),
            frozenset(),
            b"{}",
        )
    assert error.value.code == "not_controller"


def test_disconnect_retains_targetable_body_and_repeated_disconnect_does_not_extend_grace() -> None:
    disconnected = disconnect(wave(), PLAYER, SESSION, NOW, connection_generation=0)
    repeated = disconnect(
        disconnected, PLAYER, SESSION, NOW + timedelta(seconds=15), connection_generation=0
    )
    assert repeated == disconnected
    assert repeated.slots[0].is_targetable
    assert not accepts_input(
        repeated, PLAYER, SESSION, NOW + timedelta(seconds=11), connection_generation=0
    )


def test_reconnect_keeps_fallen_state_position_cooldowns_and_journal_exactly() -> None:
    disconnected = disconnect(wave(), PLAYER, SESSION, NOW, connection_generation=0)
    resumed = reconnect(
        disconnected, PLAYER, SESSION, NOW + timedelta(seconds=59), connection_generation=0
    )
    assert resumed.slots[0].snapshot.checkpoint is CHECKPOINT
    assert resumed.world_snapshot == disconnected.world_snapshot
    assert resumed.slots[0].status == "active"


def test_reconnect_at_the_deadline_cannot_reclaim_the_slot() -> None:
    disconnected = disconnect(wave(), PLAYER, SESSION, NOW, connection_generation=0)
    with pytest.raises(ApiError) as error:
        reconnect(
            disconnected, PLAYER, SESSION, NOW + timedelta(seconds=60), connection_generation=0
        )
    assert error.value.code == "slot_expired"


def test_stale_disconnect_input_and_withdrawal_cannot_affect_a_reconnected_slot() -> None:
    disconnected = disconnect(wave(), PLAYER, SESSION, NOW, connection_generation=0)
    resumed = reconnect(
        disconnected,
        PLAYER,
        SESSION,
        NOW + timedelta(seconds=15),
        connection_generation=0,
    )
    assert resumed.slots[0].connection_generation == 1
    assert not accepts_input(
        resumed,
        PLAYER,
        SESSION,
        NOW + timedelta(seconds=16),
        connection_generation=0,
    )
    assert accepts_input(
        resumed,
        PLAYER,
        SESSION,
        NOW + timedelta(seconds=16),
        connection_generation=1,
    )
    with pytest.raises(ApiError) as error:
        disconnect(resumed, PLAYER, SESSION, NOW + timedelta(seconds=16), connection_generation=0)
    assert error.value.code == "not_controller"
    with pytest.raises(ApiError):
        withdraw(resumed, PLAYER, SESSION, NOW + timedelta(seconds=16), connection_generation=0)


def test_bell_captures_the_current_connection_generation() -> None:
    current_lease = replace(LEASE, connection_generation=4)
    reserved = reserve_wave(
        WAVE,
        OWNER,
        EPOCH,
        NOW,
        NOW + timedelta(seconds=10),
        NOW + timedelta(seconds=900),
        (SNAPSHOT,),
        (current_lease,),
        frozenset(),
        b"{}",
    )
    assert reserved.slots[0].connection_generation == 4


def test_new_disconnect_after_reconnect_gets_its_own_sixty_second_deadline() -> None:
    disconnected = disconnect(wave(), PLAYER, SESSION, NOW, connection_generation=0)
    resumed = reconnect(
        disconnected,
        PLAYER,
        SESSION,
        NOW + timedelta(seconds=15),
        connection_generation=0,
    )
    again = disconnect(
        resumed,
        PLAYER,
        SESSION,
        NOW + timedelta(seconds=20),
        connection_generation=1,
    )
    assert again.slots[0].grace_until == NOW + timedelta(seconds=80)


def test_late_arrival_spectates_and_does_not_change_the_frozen_roster() -> None:
    with pytest.raises(ApiError) as error:
        reconnect(
            wave(), OTHER, OTHER_SESSION, NOW + timedelta(seconds=11), connection_generation=0
        )
    assert error.value.code == "not_in_wave"
    assert len(wave().slots) == 1


def test_explicit_exit_revokes_input_immediately_and_keeps_copy_tenure_for_return() -> None:
    withdrawn = withdraw(
        wave(), PLAYER, SESSION, NOW + timedelta(seconds=11), connection_generation=0
    )
    assert withdrawn.slots[0].status == "withdrawn"
    assert not accepts_input(
        withdrawn, PLAYER, SESSION, NOW + timedelta(seconds=11), connection_generation=0
    )
    assert withdrawn.slots[0].snapshot.captain.copy_id == COPY
    assert withdrawn.slots[0].snapshot.captain.copy_generation == 3


def test_last_grace_expiry_abandons_without_a_client_or_future_read() -> None:
    disconnected = disconnect(wave(), PLAYER, SESSION, NOW, connection_generation=0)
    abandoned = expire_slots(disconnected, NOW + timedelta(seconds=60))
    assert abandoned.outcome == "abandoned"
    assert abandoned.slots[0].status == "withdrawn"
    assert abandoned.world_snapshot == disconnected.world_snapshot


def test_delayed_win_cannot_reverse_canonical_abandonment() -> None:
    abandoned = close_wave(wave(), "abandoned", NOW + timedelta(seconds=20))
    repeated = close_wave(abandoned, "won", NOW + timedelta(seconds=21))
    assert repeated == abandoned
    assert victory_participants(repeated) == ()


def test_delayed_expiry_worker_cannot_allow_a_win_after_the_last_grace_deadline() -> None:
    combat = acknowledge_combat(
        wave(),
        PLAYER,
        SESSION,
        NOW + timedelta(seconds=11),
        connection_generation=0,
    )
    disconnected = disconnect(
        combat,
        PLAYER,
        SESSION,
        NOW + timedelta(seconds=12),
        connection_generation=0,
    )
    closed = close_wave(disconnected, "won", NOW + timedelta(seconds=72))
    assert closed.outcome == "abandoned"
    assert closed.slots[0].status == "withdrawn"
    assert victory_participants(closed) == ()


def test_combat_acknowledgment_is_required_after_countdown_and_survives_departure() -> None:
    other = ParticipantSlot(replace(SNAPSHOT, player_id=OTHER, session_id=OTHER_SESSION))
    reserved = replace(wave(), slots=(*wave().slots, other))
    countdown = acknowledge_combat(
        reserved, PLAYER, SESSION, NOW + timedelta(seconds=9), connection_generation=0
    )
    assert not countdown.slots[0].participated
    combat = acknowledge_combat(
        countdown, PLAYER, SESSION, NOW + timedelta(seconds=10), connection_generation=0
    )
    withdrawn = withdraw(
        combat, PLAYER, SESSION, NOW + timedelta(seconds=11), connection_generation=0
    )
    won = close_wave(withdrawn, "won", NOW + timedelta(seconds=20))
    assert victory_participants(won) == (PLAYER,)


def test_last_explicit_departure_abandons_and_delayed_victory_cannot_pay() -> None:
    combat = acknowledge_combat(
        wave(), PLAYER, SESSION, NOW + timedelta(seconds=11), connection_generation=0
    )
    withdrawn = withdraw(
        combat, PLAYER, SESSION, NOW + timedelta(seconds=12), connection_generation=0
    )
    assert withdrawn.outcome == "abandoned"
    assert victory_participants(close_wave(withdrawn, "won", NOW + timedelta(seconds=20))) == ()


def test_confirmed_normal_defeat_qualifies_for_engineer_completion_without_victory_progress() -> (
    None
):
    combat = acknowledge_combat(
        wave(), PLAYER, SESSION, NOW + timedelta(seconds=11), connection_generation=0
    )
    lost = close_wave(combat, "lost", NOW + timedelta(seconds=20))
    assert completed_participants(lost) == (PLAYER,)
    assert victory_participants(lost) == ()


def test_abandonment_never_completes_an_engineer_commitment() -> None:
    combat = acknowledge_combat(
        wave(), PLAYER, SESSION, NOW + timedelta(seconds=11), connection_generation=0
    )
    abandoned = close_wave(combat, "abandoned", NOW + timedelta(seconds=20))
    assert completed_participants(abandoned) == ()


def test_membership_and_countdown_connection_never_qualify_for_a_win_receipt() -> None:
    won = close_wave(wave(), "won", NOW + timedelta(seconds=20))
    assert victory_participants(won) == ()


def test_old_tab_cannot_confirm_participation_after_controller_changes() -> None:
    with pytest.raises(ApiError) as error:
        acknowledge_combat(
            wave(), PLAYER, OTHER_SESSION, NOW + timedelta(seconds=11), connection_generation=0
        )
    assert error.value.code == "not_controller"


def test_disconnected_session_cannot_confirm_combat_participation() -> None:
    disconnected = disconnect(wave(), PLAYER, SESSION, NOW, connection_generation=0)
    with pytest.raises(ApiError) as error:
        acknowledge_combat(
            disconnected, PLAYER, SESSION, NOW + timedelta(seconds=11), connection_generation=0
        )
    assert error.value.code == "not_controller"


def test_expiry_at_maximum_prevents_late_inputs_and_late_participation() -> None:
    reserved = wave()
    assert not accepts_input(
        reserved, PLAYER, SESSION, reserved.expires_at, connection_generation=0
    )
    assert expire_slots(reserved, reserved.expires_at).outcome == "expired"
    with pytest.raises(ApiError) as error:
        acknowledge_combat(reserved, PLAYER, SESSION, reserved.expires_at, connection_generation=0)
    assert error.value.code == "wave_over"
