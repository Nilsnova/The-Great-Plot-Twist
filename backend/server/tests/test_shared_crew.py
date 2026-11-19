"""Shared crew offers and checked service replies; no personal wallet or live API calls."""

import asyncio
from copy import deepcopy

import pytest
from pydantic import ValidationError

from server.errors import ApiError
from server.island.catalogue import load_island
from server.island.shared_crew import hire, read, read_result
from server.island.shared_crew_rules import HireIntent, crew_offers, manifest
from server.supabase_admin import SupabaseRejected
from server.tests.test_island_treasury import ACTOR, OPERATION, context, envelope
from server.tests.test_island_treasury import FakeAdmin as TreasuryAdmin


def reply():
    origin = {
        key: value for key, value in envelope().items() if key not in {"treasury", "revision"}
    }
    return {
        "status": "done",
        "repeat": False,
        "currentEconomy": envelope(),
        "currentCrew": {"gunner": 1, "carpenter": 2, "lookout": 0, "guard": 0},
        "currentWaveBest": 9,
        "receipt": {
            "receiptId": OPERATION,
            "actionUid": "hire0001",
            "action": "hire",
            "actorId": ACTOR,
            "origin": origin,
            "result": {
                "crew": "gunner",
                "previousCount": 0,
                "count": 1,
                "chargedCoins": "40",
                "treasuryReceiptId": OPERATION,
            },
        },
    }


def test_server_offers_use_target_counts_progress_and_free_funds_without_discounts():
    catalogue = load_island()
    offers = crew_offers(catalogue, {"gunner": 1, "carpenter": 2, "lookout": 0, "guard": 3}, 9, 40)
    by_kind = {offer["crew"]: offer for offer in offers}
    assert by_kind["gunner"] == {
        "crew": "gunner",
        "count": 1,
        "priceCoins": "40",
        "maxCount": 2,
        "unlockWave": 3,
        "available": True,
        "reason": None,
    }
    assert by_kind["carpenter"]["reason"] == "crew_unavailable"
    assert by_kind["guard"]["reason"] == "crew_full"
    assert by_kind["lookout"]["priceCoins"] == "25"
    locked = crew_offers(catalogue, {}, 0, 10**30)
    assert next(offer for offer in locked if offer["crew"] == "lookout")["reason"] == "locked"
    poor = crew_offers(catalogue, {}, 9, 24)
    assert (
        next(offer for offer in poor if offer["crew"] == "lookout")["reason"]
        == "insufficient_funds"
    )


@pytest.mark.parametrize("extra", [{"price": 1}, {"payer": ACTOR}, {"count": 0}, {"owner": ACTOR}])
def test_intent_cannot_choose_price_payer_owner_or_count(extra):
    with pytest.raises(ValidationError):
        HireIntent.model_validate({"crew": "gunner", **extra})


def test_service_uses_one_atomic_rpc_with_server_manifest_and_exact_scope():
    admin = TreasuryAdmin(reply())
    result = asyncio.run(
        hire(admin, context(), "hire0001", HireIntent(crew="gunner"), load_island())
    )
    assert result["receipt"]["result"]["count"] == 1
    name, parameters = admin.calls[0]
    assert name == "island_economy_hire"
    assert parameters["p_actor_id"] == ACTOR
    assert parameters["p_crew"] == "gunner"
    assert parameters["p_catalogue"] == manifest(load_island())
    assert len(admin.calls) == 1


def test_repeat_preserves_original_charge_after_catalogue_changes_and_hides_unauthorized_current():
    value = reply()
    value.update(repeat=True, currentEconomy=None, currentCrew=None, currentWaveBest=None)
    parsed = read_result(value, context(), "hire0001", HireIntent(crew="gunner"))
    assert parsed["receipt"]["result"]["chargedCoins"] == "40"
    assert parsed["currentEconomy"] is None


@pytest.mark.parametrize("change", ["scope", "uid", "count", "money", "current", "carpenter"])
def test_unreadable_domain_answers_never_become_a_personal_fallback(change):
    value = deepcopy(reply())
    if change == "scope":
        value["receipt"]["origin"]["accountId"] = OPERATION
    elif change == "uid":
        value["receipt"]["actionUid"] = "other001"
    elif change == "count":
        value["receipt"]["result"]["count"] = 2
    elif change == "money":
        value["receipt"]["result"]["chargedCoins"] = 40
    elif change == "current":
        value["currentCrew"] = None
    else:
        value["receipt"]["result"]["crew"] = "carpenter"
    with pytest.raises(SupabaseRejected):
        read_result(value, context(), "hire0001", HireIntent(crew="gunner"))


def test_carpenter_is_refused_by_atomic_rpc_and_reserved_child_identity_is_never_sent():
    admin = TreasuryAdmin({"status": "refused", "reason": "crew_unavailable"})
    with pytest.raises(ApiError) as error:
        asyncio.run(hire(admin, context(), "hire0001", HireIntent(crew="carpenter"), load_island()))
    assert error.value.code == "crew_unavailable"
    assert len(admin.calls) == 1
    admin.calls.clear()
    with pytest.raises(ApiError) as error:
        asyncio.run(
            hire(admin, context(), "fx_invalid_root", HireIntent(crew="gunner"), load_island())
        )
    assert error.value.code == "invalid_transaction"
    assert admin.calls == []


def test_read_projects_target_crew_and_catalogue_from_exact_available_funds():
    value = {
        "status": "ok",
        "crew": reply()["currentCrew"],
        "waveBest": 900,
        "currentEconomy": envelope(balance=10**30, committed=10**30 - 24),
    }
    admin = TreasuryAdmin(value)
    result = asyncio.run(read(admin, context(), load_island()))
    assert result["crew"]["carpenter"] == 2
    assert (
        next(offer for offer in result["offers"] if offer["crew"] == "lookout")["reason"]
        == "insufficient_funds"
    )
    assert admin.calls[0][0] == "island_economy_crew"
    value["currentEconomy"]["accountId"] = OPERATION
    with pytest.raises(SupabaseRejected):
        asyncio.run(read(admin, context(), load_island()))


@pytest.mark.parametrize(
    "reason,code",
    [
        ("not_member", "not_member"),
        ("crew_full", "crew_full"),
        ("epoch_mismatch", "economy_epoch_mismatch"),
        ("action_conflict", "idempotency_conflict"),
    ],
)
def test_service_exposes_known_refusals_without_another_rpc(reason, code):
    admin = TreasuryAdmin({"status": "refused", "reason": reason})
    with pytest.raises(ApiError) as error:
        asyncio.run(hire(admin, context(), "hire0001", HireIntent(crew="gunner"), load_island()))
    assert error.value.code == code
    assert len(admin.calls) == 1
