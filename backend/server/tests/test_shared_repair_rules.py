"""Shared repair policy checks; no database effects or runtime integration are simulated."""

from dataclasses import replace
from uuid import UUID

import pytest

from server.errors import ApiError
from server.island.shared_repair_rules import (
    RepairOperation,
    RepairTarget,
    ReservedRepairState,
    prepare_repair,
)
from server.island.structure_repair_models import RepairRequest
from server.island.structure_repair_rules import request_intent_fingerprint
from server.supabase_admin import SupabaseRejected

OWNER = "09c63858-bff4-4f6b-8ff7-b7c3bcc29306"
EPOCH = UUID(int=1)
WAVE = UUID(int=2)
INSTANCE = UUID(int=3)
PRICES = {"cannon": [30, 60, 120, 240, 480]}


def request(**changes: object) -> RepairRequest:
    value = {
        "spot": "cannon_1",
        "instanceId": str(INSTANCE),
        "actionUid": "repair-00001",
        "expectedEpoch": str(EPOCH),
        "expectedWindow": "reserved_wave",
        "expectedWaveId": str(WAVE),
        "expectedLevel": 2,
        "expectedRepairSeq": 4,
        "quotedPrice": 60,
        "waveProtocol": 2,
    }
    value.update(changes)
    return RepairRequest.model_validate(value)


def state(**changes: object) -> ReservedRepairState:
    value = ReservedRepairState(
        owner_id=OWNER,
        recovery_epoch=EPOCH,
        wave_id=WAVE,
        successful_repairs=0,
        target=RepairTarget(INSTANCE, "cannon_1", "cannon", 2, 150_000, 4),
        prices=PRICES,
    )
    return replace(value, **changes)


def previous() -> RepairOperation:
    body = request()
    return RepairOperation(
        action_uid=body.action_uid,
        fingerprint=request_intent_fingerprint(OWNER, "cannon", body),
        instance_id=INSTANCE,
        wave_id=WAVE,
        kind="cannon",
        level=2,
        price=60,
        repair_seq=5,
        use_ordinal=1,
    )


def assert_refused(code: str, body: RepairRequest, current: ReservedRepairState) -> None:
    with pytest.raises(ApiError) as caught:
        prepare_repair(body, current)
    assert caught.value.code == code


def test_accepted_reservation_allows_countdown_repair_without_a_combat_start_clock() -> None:
    operation, repeat = prepare_repair(request(), state())

    assert repeat is False
    assert operation.price == 60
    assert operation.restored_hp_units == 1_000_000
    assert operation.use_ordinal == 1
    assert operation.repair_seq == 5
    assert operation.wave_id == WAVE


def test_plan_uses_frozen_full_catalogue_increment_without_an_engineer_discount() -> None:
    current = state(prices={"cannon": [31, 61, 121, 241, 481]})

    operation, _ = prepare_repair(request(quotedPrice=61), current)

    assert operation.price == 61


def test_third_success_is_allowed_but_a_fourth_plan_is_refused() -> None:
    current = state(successful_repairs=2)

    operation, _ = prepare_repair(request(), current)

    assert operation.use_ordinal == 3
    assert_refused("repair_limit_reached", request(), replace(current, successful_repairs=3))


@pytest.mark.parametrize(
    "body",
    [
        request(expectedEpoch=str(UUID(int=50))),
        request(expectedWaveId=str(UUID(int=51))),
        request(expectedWindow="between_waves", expectedWaveId=None),
        request(instanceId=str(UUID(int=52))),
        request(spot="cannon_2"),
        request(expectedLevel=3),
        request(expectedRepairSeq=3),
        request(quotedPrice=59),
    ],
)
def test_stale_quote_cannot_produce_a_repair(body: RepairRequest) -> None:
    assert_refused("stale_recovery_quote", body, state())


def test_no_paid_repair_is_offered_between_reservations() -> None:
    assert_refused("intact", request(), state(wave_id=None))


def test_already_full_structure_cannot_consume_money_or_a_use() -> None:
    current = state()
    target = replace(current.target, hp_units=1_000_000)
    assert_refused("intact", request(), replace(current, target=target))


def test_unsupported_target_kind_cannot_be_repaired() -> None:
    current = state()
    target = replace(current.target, kind="house")
    assert_refused("wrong_kind", request(), replace(current, target=target))


def test_unsynchronized_health_cannot_produce_a_repair() -> None:
    assert_refused("health_sync_required", request(), state(health_sync_required=True))


def test_destroyed_structure_is_repairable() -> None:
    current = state()
    target = replace(current.target, hp_units=0)
    operation, repeat = prepare_repair(request(), replace(current, target=target))
    assert operation.price == 60
    assert repeat is False


def test_uid_retry_returns_original_operation_before_new_damage_or_phase_guards() -> None:
    old = previous()
    changed = state(wave_id=None, recovery_epoch=UUID(int=99), successful_repairs=3)

    operation, repeat = prepare_repair(request(expectedRepairSeq=40), changed, previous=old)

    assert operation is old
    assert operation.repair_seq == 5
    assert repeat is True


@pytest.mark.parametrize(
    "body",
    [
        request(quotedPrice=61),
        request(expectedLevel=3),
        request(instanceId=str(UUID(int=70))),
        request(expectedEpoch=str(UUID(int=71))),
    ],
)
def test_changed_paid_intent_cannot_reuse_a_successful_uid(body: RepairRequest) -> None:
    with pytest.raises(ApiError) as caught:
        prepare_repair(body, state(), previous=previous())
    assert caught.value.code == "idempotency_conflict"


def test_receipt_for_another_uid_cannot_be_replayed() -> None:
    with pytest.raises(ApiError) as caught:
        prepare_repair(request(actionUid="repair-00002"), state(), previous=previous())
    assert caught.value.code == "idempotency_conflict"


def test_preparing_a_repair_does_not_mutate_canonical_hp_quota_or_price_schedule() -> None:
    current = state()

    prepare_repair(request(), current)

    assert current.successful_repairs == 0
    assert current.target.hp_units == 150_000
    assert current.target.repair_seq == 4
    assert current.prices == PRICES


@pytest.mark.parametrize("successes", [-1, 4, True, 1.5])
def test_invalid_shared_quota_is_not_treated_as_available(successes: object) -> None:
    with pytest.raises(SupabaseRejected):
        prepare_repair(request(), state(successful_repairs=successes))


@pytest.mark.parametrize(
    "changes",
    [{"hp_units": -1}, {"hp_units": 1_000_001}, {"repair_seq": 2**63 - 1}, {"level": True}],
)
def test_invalid_canonical_target_cannot_produce_a_repair(changes: dict[str, object]) -> None:
    current = state()
    with pytest.raises(SupabaseRejected):
        prepare_repair(request(), replace(current, target=replace(current.target, **changes)))


def test_missing_frozen_prices_never_fall_back_to_current_or_personal_pricing() -> None:
    with pytest.raises(SupabaseRejected):
        prepare_repair(request(), state(prices={}))


def test_retry_after_another_damage_event_does_not_prepare_a_fresh_heal() -> None:
    old = previous()
    current = state()
    damaged = replace(current, target=replace(current.target, hp_units=0, repair_seq=9))

    operation, repeat = prepare_repair(request(), damaged, previous=old)

    assert repeat is True
    assert operation is old
    assert operation.repair_seq == 5
    assert damaged.target.hp_units == 0
    assert damaged.target.repair_seq == 9
