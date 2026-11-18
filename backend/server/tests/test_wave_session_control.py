"""Exclusive controlling sessions and delegated session-setting permission checks."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest

from server.errors import ApiError
from server.island.wave_session_control import (
    SessionSettings,
    acquire_control,
    release_control,
    select_leader,
    set_connection,
    update_settings,
)
from server.island.wave_session_state import ControlLease

OWNER, PLAYER, OTHER, SESSION, OTHER_SESSION, ISLAND = (UUID(int=n) for n in range(1, 7))
NOW = datetime(2026, 11, 18, 12, tzinfo=UTC)
LEASE = ControlLease(PLAYER, SESSION, OWNER, NOW)


def test_exact_claim_retry_returns_the_existing_single_control_lease() -> None:
    leases = acquire_control((), LEASE)
    assert acquire_control(leases, LEASE) == (LEASE,)


@pytest.mark.parametrize(
    "lease",
    (
        ControlLease(PLAYER, OTHER_SESSION, OWNER),
        ControlLease(PLAYER, SESSION, ISLAND),
    ),
)
def test_another_tab_or_island_cannot_claim_a_second_captain(lease: ControlLease) -> None:
    with pytest.raises(ApiError) as error:
        acquire_control((LEASE,), lease)
    assert error.value.code == "captain_assigned"


def test_release_revokes_the_old_controller_before_a_destination_claim() -> None:
    leases = release_control((LEASE,), LEASE)
    destination = ControlLease(PLAYER, OTHER_SESSION, ISLAND)
    assert acquire_control(leases, destination) == (destination,)


def test_an_old_tab_cannot_release_the_current_controller() -> None:
    with pytest.raises(ApiError) as error:
        release_control((LEASE,), ControlLease(PLAYER, OTHER_SESSION, OWNER))
    assert error.value.code == "not_controller"


def test_current_active_member_keeps_leadership_without_gaining_ownership() -> None:
    other = ControlLease(OTHER, OTHER_SESSION, OWNER, NOW - timedelta(seconds=5))
    assert (
        select_leader((LEASE, other), OWNER, frozenset({PLAYER, OTHER}), PLAYER, now=NOW) == PLAYER
    )


def test_succession_excludes_disconnected_or_departed_members() -> None:
    other = ControlLease(OTHER, OTHER_SESSION, OWNER, NOW)
    disconnected = ControlLease(PLAYER, SESSION, OWNER)
    assert select_leader((other, disconnected), OWNER, frozenset({OTHER}), PLAYER, now=NOW) == OTHER


def test_succession_cannot_select_a_controller_on_another_island() -> None:
    other_island = ControlLease(PLAYER, SESSION, ISLAND, NOW)
    assert select_leader((other_island,), OWNER, frozenset({PLAYER}), None, now=NOW) is None


def test_succession_prefers_longest_continuous_activity_then_stable_player_id() -> None:
    other = ControlLease(OTHER, OTHER_SESSION, OWNER, NOW - timedelta(seconds=5))
    assert select_leader((LEASE, other), OWNER, frozenset({PLAYER, OTHER}), None, now=NOW) == OTHER
    tied = ControlLease(OTHER, OTHER_SESSION, OWNER, NOW)
    assert select_leader((tied, LEASE), OWNER, frozenset({PLAYER, OTHER}), None, now=NOW) == PLAYER


def test_reconnection_resets_continuous_activity_but_heartbeats_do_not() -> None:
    disconnected = set_connection((LEASE,), LEASE, now=NOW, is_connected=False)
    reconnected = set_connection(
        disconnected, LEASE, now=NOW + timedelta(seconds=10), is_connected=True
    )
    repeated = set_connection(
        reconnected, reconnected[0], now=NOW + timedelta(seconds=20), is_connected=True
    )
    assert repeated[0].active_since == NOW + timedelta(seconds=10)


def test_disconnected_leader_retains_leadership_strictly_before_grace_ends() -> None:
    other = ControlLease(OTHER, OTHER_SESSION, OWNER, NOW - timedelta(seconds=5))
    leases = set_connection((LEASE, other), LEASE, now=NOW, is_connected=False)
    assert (
        select_leader(
            leases,
            OWNER,
            frozenset({PLAYER, OTHER}),
            PLAYER,
            now=NOW + timedelta(seconds=59),
        )
        == PLAYER
    )


def test_succession_begins_exactly_at_the_leaders_disconnect_deadline() -> None:
    other = ControlLease(OTHER, OTHER_SESSION, OWNER, NOW - timedelta(seconds=5))
    leases = set_connection((LEASE, other), LEASE, now=NOW, is_connected=False)
    assert (
        select_leader(
            leases,
            OWNER,
            frozenset({PLAYER, OTHER}),
            PLAYER,
            now=NOW + timedelta(seconds=60),
        )
        == OTHER
    )


def test_explicit_leader_departure_revokes_leadership_without_waiting_for_grace() -> None:
    other = ControlLease(OTHER, OTHER_SESSION, OWNER, NOW)
    leases = release_control((LEASE, other), LEASE)
    assert select_leader(leases, OWNER, frozenset({PLAYER, OTHER}), PLAYER, now=NOW) == OTHER


def test_membership_loss_revokes_disconnected_leader_inside_grace() -> None:
    other = ControlLease(OTHER, OTHER_SESSION, OWNER, NOW)
    leases = set_connection((LEASE, other), LEASE, now=NOW, is_connected=False)
    assert select_leader(leases, OWNER, frozenset({OTHER}), PLAYER, now=NOW) == OTHER


def test_repeated_disconnect_does_not_extend_leadership_grace() -> None:
    leases = set_connection((LEASE,), LEASE, now=NOW, is_connected=False)
    repeated = set_connection(
        leases,
        LEASE,
        now=NOW + timedelta(seconds=30),
        is_connected=False,
    )
    assert repeated[0].grace_until == NOW + timedelta(seconds=60)


def test_expired_leader_without_connected_successor_leaves_no_leader() -> None:
    leases = set_connection((LEASE,), LEASE, now=NOW, is_connected=False)
    assert (
        select_leader(
            leases,
            OWNER,
            frozenset({PLAYER}),
            PLAYER,
            now=NOW + timedelta(seconds=60),
        )
        is None
    )


def test_reconnecting_leader_before_grace_keeps_leadership() -> None:
    other = ControlLease(OTHER, OTHER_SESSION, OWNER, NOW - timedelta(seconds=5))
    leases = set_connection((LEASE, other), LEASE, now=NOW, is_connected=False)
    reconnected = set_connection(
        leases,
        LEASE,
        now=NOW + timedelta(seconds=59),
        is_connected=True,
    )
    assert (
        select_leader(
            reconnected,
            OWNER,
            frozenset({PLAYER, OTHER}),
            PLAYER,
            now=NOW + timedelta(seconds=60),
        )
        == PLAYER
    )


def test_expired_disconnected_controller_cannot_reclaim_leadership_before_cleanup() -> None:
    leases = set_connection((LEASE,), LEASE, now=NOW, is_connected=False)
    with pytest.raises(ApiError) as error:
        set_connection(leases, LEASE, now=NOW + timedelta(seconds=60), is_connected=True)
    assert error.value.code == "slot_expired"


def test_stale_transport_notifications_cannot_disconnect_or_release_a_new_connection() -> None:
    disconnected = set_connection((LEASE,), LEASE, now=NOW, is_connected=False)
    reconnected = set_connection(
        disconnected, LEASE, now=NOW + timedelta(seconds=10), is_connected=True
    )
    with pytest.raises(ApiError):
        set_connection(reconnected, LEASE, now=NOW, is_connected=False)
    with pytest.raises(ApiError):
        release_control(reconnected, LEASE)


def test_only_current_leader_can_set_between_wave_pause_and_auto_next() -> None:
    settings = update_settings(
        SessionSettings(),
        PLAYER,
        PLAYER,
        is_reserved=False,
        paused=True,
        auto_next=True,
    )
    assert settings.paused and settings.auto_next
    with pytest.raises(ApiError) as error:
        update_settings(settings, OTHER, PLAYER, is_reserved=False, paused=False)
    assert error.value.code == "not_session_leader"


def test_pause_cannot_freeze_a_live_reservation_or_any_combat_clock() -> None:
    with pytest.raises(ApiError) as error:
        update_settings(SessionSettings(), PLAYER, PLAYER, is_reserved=True, paused=True)
    assert error.value.code == "wave_running"
