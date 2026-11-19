"""Shared construction intents preserve exact quotes and trusted catalogue limits."""

import pytest

from server.island.catalogue import load_island, runtime_catalogue
from server.island.construction_rules import (
    ConstructionIntent,
    catalogue_manifest,
    refund_for_payments,
)

INSTANCE = "00000000-0000-0000-0000-000000000010"


def test_manifest_preserves_island_unlocks_and_always_on_runtime_kinds():
    catalogue = runtime_catalogue(load_island())
    manifest = catalogue_manifest(catalogue)
    assert manifest["kinds"]["wall"] == {
        "prices": ["10", "20", "40", "80", "160"],
        "waves": [0, 2, 5, 12, 20],
    }
    assert manifest["spots"]["wall_7"]["wave"] == 5
    assert manifest["spots"]["cannon_8"]["wave"] == 10
    assert manifest["engineerDiscountPercent"] == 10
    assert "culverin" in manifest["kinds"]


def test_intent_keeps_a_demolition_quote_bound_to_its_instance_and_level():
    intent = ConstructionIntent.model_validate(
        {
            "action": "demolish",
            "spot": "cannon_1",
            "kind": "cannon",
            "instanceId": INSTANCE,
            "expectedLevel": 3,
            "quotedCoins": "9007199254740993",
        }
    )
    assert intent.model_dump(mode="json")["quotedCoins"] == "9007199254740993"
    assert intent.model_dump(mode="json")["instanceId"] == INSTANCE


@pytest.mark.parametrize(
    "change",
    [
        {"quotedCoins": 90},
        {"quotedCoins": "090"},
        {"quotedCoins": "9.0"},
        {"quotedCoins": "-1"},
        {"expectedLevel": True},
        {"instanceId": INSTANCE},
        {"payer": "00000000-0000-0000-0000-000000000001"},
    ],
)
def test_build_intent_rejects_coercion_or_a_forged_instance_or_payer(change):
    value = {
        "action": "build",
        "spot": "cannon_1",
        "kind": "cannon",
        "instanceId": None,
        "expectedLevel": 0,
        "quotedCoins": "30",
    }
    with pytest.raises(ValueError):
        ConstructionIntent.model_validate({**value, **change})


@pytest.mark.parametrize("action", ["upgrade", "demolish"])
def test_existing_structure_actions_require_an_instance_and_positive_expected_level(action):
    with pytest.raises(ValueError):
        ConstructionIntent.model_validate(
            {
                "action": action,
                "spot": "wall_1",
                "kind": "wall",
                "instanceId": None,
                "expectedLevel": 0,
                "quotedCoins": "0",
            }
        )


def test_zero_refund_is_valid_but_a_zero_price_purchase_is_not():
    common = {"spot": "wall_1", "kind": "wall", "quotedCoins": "0"}
    assert (
        ConstructionIntent.model_validate(
            {
                **common,
                "action": "demolish",
                "instanceId": INSTANCE,
                "expectedLevel": 1,
            }
        ).quotedCoins
        == "0"
    )
    with pytest.raises(ValueError):
        ConstructionIntent.model_validate(
            {
                **common,
                "action": "build",
                "instanceId": None,
                "expectedLevel": 0,
            }
        )


def test_refund_uses_total_actual_shared_payments_not_undiscounted_prices():
    assert refund_for_payments((90,)) == 45
    assert refund_for_payments((9, 18, 36)) == 31
    assert refund_for_payments((1, 1, 1)) == 1
    assert refund_for_payments((1,)) == 0


@pytest.mark.parametrize("payments", [(), (True,), (0,), (-1,), (1.5,), ("90",)])
def test_refund_rejects_missing_or_invalid_actual_basis(payments):
    with pytest.raises(ValueError):
        refund_for_payments(payments)
