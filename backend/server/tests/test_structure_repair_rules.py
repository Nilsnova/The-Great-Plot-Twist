"""Pure price and intent rules for the future paid structure repair route.

These tests read the real island catalogue and need no database or network.
Used by: pytest in backend/server/tests/.
"""

from uuid import UUID

import pytest
from pydantic import ValidationError

from server.island.catalogue import catalogue_for_flags, load_island
from server.island.structure_repair import kind_for_instance
from server.island.structure_repair_models import RepairRequest, RepairResponse
from server.island.structure_repair_rules import (
    intent_fingerprint,
    repair_price,
    repair_price_from_schedule,
    request_intent_fingerprint,
)


@pytest.mark.parametrize(
    ("kind", "expected"),
    [
        ("wall", [10, 20, 40, 80, 160]),
        ("cannon", [30, 60, 120, 240, 480]),
        ("mortar", [60, 120, 240, 480, 960]),
        ("harpoon", [40, 80, 160, 320, 640]),
        ("swivel", [50, 100, 200, 400, 800]),
        ("culverin", [80, 160, 320, 640, 1280]),
    ],
)
def test_all_repair_prices_are_catalogue_increments_for_the_current_base_level(kind, expected):
    catalogue = catalogue_for_flags(load_island(), {"defenses_v2": True})

    assert [repair_price(catalogue, kind, level) for level in range(1, 6)] == expected


def test_wave_repair_uses_the_price_schedule_frozen_in_its_snapshot():
    frozen = {"cannon": [30, 60, 120, 240, 480]}

    assert repair_price_from_schedule(frozen, "cannon", 2) == 60


def test_wave_repair_refuses_a_missing_or_invalid_frozen_price_schedule():
    with pytest.raises(ValueError, match="price schedule"):
        repair_price_from_schedule({}, "cannon", 2)
    with pytest.raises(ValueError, match="price schedule"):
        repair_price_from_schedule({"cannon": [30, 0, 120]}, "cannon", 2)


@pytest.mark.parametrize("kind", ["house", "watchtower", "unknown"])
def test_non_repairable_or_unknown_kinds_have_no_repair_price(kind):
    with pytest.raises(ValueError, match="not repairable"):
        repair_price(load_island(), kind, 1)


@pytest.mark.parametrize("level", [0, 6, True, 1.5])
def test_invalid_repair_levels_are_refused(level):
    with pytest.raises(ValueError, match="level"):
        repair_price(load_island(), "wall", level)


def request(**changes):
    body = {
        "code": "ISLE-K7Q2M",
        "spot": "cannon_8",
        "instanceId": "10b7b257-4f3f-4dd8-bcd3-b18a68d6e468",
        "actionUid": "repair_123456",
        "expectedEpoch": "dc6f36b8-b7b5-4fd1-b08c-e2f933be10d2",
        "expectedWindow": "reserved_wave",
        "expectedWaveId": "25126b41-cff8-4f53-b4bd-526849dd9ee0",
        "expectedLevel": 2,
        "expectedRepairSeq": 9,
        "quotedPrice": 60,
        "waveProtocol": 2,
    }
    body.update(changes)
    return RepairRequest.model_validate(body)


def test_repair_request_accepts_t54_wire_shape_and_strict_types():
    parsed = request()

    assert parsed.spot == "cannon_8"
    assert parsed.action_uid == "repair_123456"
    assert parsed.expected_epoch == UUID("dc6f36b8-b7b5-4fd1-b08c-e2f933be10d2")
    assert parsed.expected_wave_id == UUID("25126b41-cff8-4f53-b4bd-526849dd9ee0")
    assert parsed.expected_window == "reserved_wave"


@pytest.mark.parametrize(
    "changes",
    [
        {"waveProtocol": 1},
        {"expectedWindow": "combat"},
        {"expectedWindow": "reserved_wave", "expectedWaveId": None},
        {
            "expectedWindow": "between_waves",
            "expectedWaveId": "25126b41-cff8-4f53-b4bd-526849dd9ee0",
        },
        {"expectedLevel": True},
        {"expectedRepairSeq": -1},
        {"quotedPrice": "60"},
        {"quotedPrice": 1_000_001},
        {"expectedRepairSeq": 9_223_372_036_854_775_808},
        {"code": "ISLE-K7Q2M-ISLE-K7Q2M-ISLE-K7Q2M-ISLE-K7Q2M"},
        {"unexpected": "field"},
        {"actionUid": "short"},
    ],
)
def test_repair_request_rejects_invalid_wire_values(changes):
    with pytest.raises(ValidationError):
        request(**changes)


def test_repair_response_keeps_commit_balance_separate_from_current_wallet_and_state():
    response = RepairResponse.model_validate(
        {
            "receipt": {
                "actionUid": "repair_123456",
                "spot": "cannon_8",
                "instanceId": "10b7b257-4f3f-4dd8-bcd3-b18a68d6e468",
                "kind": "cannon",
                "level": 2,
                "chargedPrice": 60,
                "balanceAtCommit": 40,
                "waveId": "25126b41-cff8-4f53-b4bd-526849dd9ee0",
                "useOrdinal": 1,
                "eventSeq": 11,
                "repairSeq": 10,
            },
            "currentState": {"repairWindow": "reserved_wave", "remainingPaidUses": 2},
            "coins": 15,
        }
    )

    assert response.receipt.balance_at_commit == 40
    assert response.coins == 15


def test_repair_response_rejects_incomplete_shared_quota_receipt():
    with pytest.raises(ValidationError, match="quota receipt fields"):
        RepairResponse.model_validate(
            {
                "receipt": {
                    "actionUid": "repair_123456",
                    "spot": "wall_1",
                    "instanceId": "10b7b257-4f3f-4dd8-bcd3-b18a68d6e468",
                    "kind": "wall",
                    "level": 1,
                    "chargedPrice": 10,
                    "balanceAtCommit": 90,
                    "waveId": "25126b41-cff8-4f53-b4bd-526849dd9ee0",
                    "useOrdinal": None,
                    "eventSeq": 2,
                    "repairSeq": 1,
                },
                "currentState": {},
                "coins": 90,
            }
        )


def test_recovery_state_kind_lookup_uses_instance_id_on_an_extra_d060_spot():
    instance = UUID("10b7b257-4f3f-4dd8-bcd3-b18a68d6e468")
    state = {
        "structures": [
            {
                "spot": "cannon_11",
                "instanceId": str(instance),
                "kind": "culverin",
            }
        ]
    }

    assert kind_for_instance(state, instance) == "culverin"


def test_recovery_state_kind_lookup_does_not_match_a_replacement_instance():
    state = {
        "structures": [
            {
                "spot": "wall_1",
                "instanceId": "10b7b257-4f3f-4dd8-bcd3-b18a68d6e468",
                "kind": "wall",
            }
        ]
    }

    assert kind_for_instance(state, UUID("dc6f36b8-b7b5-4fd1-b08c-e2f933be10d2")) is None


def test_request_fingerprint_ignores_phase_wave_and_repair_sequence_guards():
    reserved = request()
    between = request(
        expectedWindow="between_waves",
        expectedWaveId=None,
        expectedRepairSeq=11,
    )

    first = request_intent_fingerprint("owner-1", "cannon", reserved)
    retry = request_intent_fingerprint("owner-1", "cannon", between)

    assert first == retry
    assert len(first) == 64


@pytest.mark.parametrize(
    "change",
    [
        {"owner_id": "owner-2"},
        {"reset_epoch": "epoch-2"},
        {"instance_id": "instance-2"},
        {"repair_kind": "mortar"},
        {"quoted_level": 3},
        {"quoted_price": 120},
    ],
)
def test_intent_fingerprint_changes_when_the_paid_intent_changes(change):
    values = {
        "owner_id": "owner-1",
        "reset_epoch": "epoch-1",
        "instance_id": "instance-1",
        "repair_kind": "cannon",
        "quoted_level": 2,
        "quoted_price": 60,
    }
    changed = values | change

    assert intent_fingerprint(**values) != intent_fingerprint(**changed)
