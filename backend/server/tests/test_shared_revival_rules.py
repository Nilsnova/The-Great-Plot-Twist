"""Free revival policy checks against supplied canonical journal state, without a wallet."""

from dataclasses import replace
from uuid import UUID

import pytest

from server.errors import ApiError
from server.island.shared_revival_rules import (
    RevivalAttempt,
    RevivalState,
    prepare_revival,
)
from server.supabase_admin import SupabaseRejected

ATTEMPT = RevivalAttempt("helper", UUID(int=1), UUID(int=2), 100, "revive-00001")


def state(**changes: object) -> RevivalState:
    value = RevivalState(
        wave_id=ATTEMPT.wave_id,
        helper_actor_id="helper",
        is_running=True,
        helper_can_control=True,
        helper_is_standing=True,
        target_is_eligible=True,
        target_down_at=100,
        target_token=ATTEMPT.target_token,
        helper_token=UUID(int=3),
        tick=200,
        hold_started_tick=160,
        hold_ticks=40,
        distance=2.0,
        reach=2.2,
        restored_hp=50,
    )
    return replace(value, **changes)


def refused(code: str, current: RevivalState, attempt: RevivalAttempt = ATTEMPT) -> None:
    with pytest.raises(ApiError) as caught:
        prepare_revival(attempt, current)
    assert caught.value.code == code


def test_timed_revival_needs_no_wallet_or_treasury_and_costs_zero() -> None:
    operation, repeat = prepare_revival(ATTEMPT, state())

    assert operation.price == 0
    assert operation.restored_hp == 50
    assert repeat is False


def test_medic_can_use_its_frozen_shorter_hold_and_higher_hp() -> None:
    operation, _ = prepare_revival(
        ATTEMPT, state(hold_started_tick=176, hold_ticks=24, restored_hp=75)
    )
    assert operation.restored_hp == 75
    assert operation.price == 0


def test_incomplete_hold_cannot_revive() -> None:
    refused("revive_not_ready", state(hold_started_tick=161))


def test_hold_must_start_for_the_current_fall() -> None:
    refused("revive_not_ready", state(hold_started_tick=99, tick=140))


def test_walking_outside_reach_cannot_finish_helping_up() -> None:
    refused("revive_not_ready", state(distance=2.21))


def test_revive_at_exact_reach_is_eligible() -> None:
    assert prepare_revival(ATTEMPT, state(distance=2.2))[1] is False


@pytest.mark.parametrize(
    "changes",
    [{"helper_can_control": False}, {"helper_is_standing": False}, {"target_is_eligible": False}],
)
def test_withdrawn_or_ineligible_participants_cannot_revive(changes: dict[str, object]) -> None:
    refused("not_in_wave", state(**changes))


def test_captain_cannot_help_itself_up() -> None:
    refused("not_in_wave", state(helper_token=ATTEMPT.target_token))


def test_finished_wave_cannot_accept_a_new_revive() -> None:
    refused("wave_over", state(is_running=False))


def test_other_wave_cannot_accept_a_new_revive() -> None:
    refused("wave_over", state(wave_id=UUID(int=99)))


def test_target_already_standing_cannot_be_revived_again() -> None:
    refused("already_up", state(target_down_at=None))


def test_a_later_fall_cannot_use_an_earlier_fall_command() -> None:
    refused("already_up", state(target_down_at=120))


def test_target_token_must_match_the_journal_slot() -> None:
    refused("not_in_wave", state(target_token=UUID(int=90)))


def test_same_successful_uid_replays_without_rechecking_a_later_fall_or_closed_wave() -> None:
    old, _ = prepare_revival(ATTEMPT, state())

    operation, repeat = prepare_revival(
        ATTEMPT, state(is_running=False, target_down_at=300), previous=old
    )
    assert operation is old
    assert repeat is True


@pytest.mark.parametrize(
    "changes",
    [
        {"actor_id": "other-helper"},
        {"wave_id": UUID(int=9)},
        {"target_token": UUID(int=10)},
        {"down_at": 101},
        {"action_uid": "revive-00002"},
    ],
)
def test_changed_actor_or_fall_cannot_reuse_a_revive_receipt(changes: dict[str, object]) -> None:
    old, _ = prepare_revival(ATTEMPT, state())

    with pytest.raises(ApiError) as caught:
        prepare_revival(replace(ATTEMPT, **changes), state(), previous=old)
    assert caught.value.code == "idempotency_conflict"


def test_preparation_does_not_change_fall_or_hold_journal_state() -> None:
    current = state()

    prepare_revival(ATTEMPT, current)

    assert current.target_down_at == 100
    assert current.hold_started_tick == 160


def test_authenticated_helper_must_match_the_canonical_control_state() -> None:
    refused("not_in_wave", state(helper_actor_id="other-helper"))


@pytest.mark.parametrize(
    "changes",
    [
        {"tick": True},
        {"hold_ticks": 0},
        {"restored_hp": 0},
        {"hold_started_tick": -1},
        {"distance": float("nan")},
        {"distance": float("inf")},
        {"distance": "2"},
        {"reach": 0},
        {"reach": -1},
        {"helper_can_control": "yes"},
    ],
)
def test_invalid_canonical_values_fail_closed(changes: dict[str, object]) -> None:
    with pytest.raises(SupabaseRejected):
        prepare_revival(ATTEMPT, state(**changes))


@pytest.mark.parametrize("changes", [{"down_at": True}, {"down_at": -1}, {"action_uid": "short"}])
def test_invalid_fall_or_action_identity_is_refused(changes: dict[str, object]) -> None:
    with pytest.raises(ApiError) as caught:
        prepare_revival(replace(ATTEMPT, **changes), state())
    assert caught.value.code == "validation_error"
