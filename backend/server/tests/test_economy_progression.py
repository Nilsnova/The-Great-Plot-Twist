"""Shared progression intents and current catalogue rules, without private wallets."""

import asyncio
from dataclasses import replace
from uuid import uuid4

import pytest

from server.errors import ApiError
from server.island.catalogue import load_island
from server.island.economy_progression import (
    catalogue_rule,
    mutate,
    parse_intent,
    read_result,
    read_state,
)
from server.island.treasury import EconomyContext
from server.supabase_admin import SupabaseRejected, SupabaseUnavailable
from server.tests.test_island_treasury import (
    ACCOUNT,
    ACTOR,
    EPOCH,
    OPERATION,
    OWNER,
    FakeAdmin,
    context,
    envelope,
)


def research(**changes):
    return {
        "action": "research",
        "branch": "cannon",
        "tier": 1,
        "choice": None,
        "change": False,
        "expected": {"tier": 0, "choice2": None, "choice3": None, "revision": "0"},
        "quotedCoins": "180",
        **changes,
    }


def building(**changes):
    return {
        "instanceId": str(uuid4()),
        "kind": "cannon",
        "level": 5,
        "spec": None,
        "treeA": 0,
        "treeB": 0,
        "revision": "0",
        **changes,
    }


def test_research_rule_uses_current_catalogue_and_island_campaign():
    intent = parse_intent(research())
    assert catalogue_rule(load_island(), intent) == {
        "price": "180",
        "unlockWave": 8,
    }
    intent = parse_intent(research(tier=2, choice="long_guns", quotedCoins="1"))
    assert catalogue_rule(load_island(), intent) == {"price": "360", "unlockWave": 15}


@pytest.mark.parametrize(
    "change",
    [
        {"quotedCoins": 180},
        {"quotedCoins": "0180"},
        {"tier": True},
        {"change": 1},
        {"extra": 1},
        {"expected": {"tier": 0}},
    ],
)
def test_malformed_intent_never_reaches_database(change):
    with pytest.raises(ApiError) as caught:
        parse_intent(research(**change))
    assert caught.value.code == "invalid_progression"


def test_house_role_is_free_and_skill_prices_have_no_role_discount():
    house = parse_intent(
        {
            "action": "specialise",
            "spot": "house_1",
            "spec": "workshop",
            "expected": building(kind="house", level=2),
            "quotedCoins": "0",
        }
    )
    assert catalogue_rule(load_island(), house)["price"] == "0"
    skill = parse_intent(
        {
            "action": "specialise",
            "spot": "cannon_1",
            "spec": "rapid",
            "expected": building(),
            "quotedCoins": "1",
        }
    )
    rule = catalogue_rule(load_island(), skill)
    assert rule["price"] == str(load_island().research[0].skill_coins)
    assert rule["branch"] == "cannon" and rule["capstone"] is False


def test_wreck_rule_preserves_catalogue_gifts_and_goal():
    intent = parse_intent({"action": "wreck", "amount": 100, "quotedCoins": "3"})
    assert catalogue_rule(load_island(), intent) == {"goal": 500, "unlockWave": 6}
    with pytest.raises(ApiError):
        catalogue_rule(
            load_island(), parse_intent({"action": "wreck", "amount": 99, "quotedCoins": "99"})
        )


def test_legacy_context_has_no_personal_wallet_fallback():
    actor, owner = str(uuid4()), str(uuid4())
    admin = FakeAdmin({})
    with pytest.raises(ApiError) as caught:
        asyncio.run(
            mutate(
                admin,
                load_island(),
                EconomyContext("personal_legacy", 0, actor, owner, None, None, None),
                "research01",
                research(),
            )
        )
    assert caught.value.code == "economy_context_required"
    assert admin.calls == []


def reply():
    return {
        "status": "done",
        "repeat": False,
        "currentEconomy": envelope(),
        "receipt": {
            "receiptId": OPERATION,
            "actorId": ACTOR,
            "actionUid": "research01",
            "action": "research",
            "origin": {
                "mode": "island_shared",
                "version": 1,
                "islandOwner": OWNER,
                "accountId": ACCOUNT,
                "runEpoch": EPOCH,
            },
            "result": {
                "chargedCoins": "180",
                "treasuryReceiptId": OPERATION,
                "research": {
                    "branch": "cannon",
                    "tier": 1,
                    "choice2": None,
                    "choice3": None,
                    "revision": "1",
                    "coinsPaid": "180",
                },
                "building": None,
                "wreckPaid": None,
            },
        },
    }


def test_service_binds_verified_scope_and_current_rules_without_private_calls():
    admin = FakeAdmin(reply())
    result = asyncio.run(mutate(admin, load_island(), context(), "research01", research()))
    assert result.receipt.result.chargedCoins == "180"
    assert admin.calls == [
        (
            "island_economy_progression",
            {
                "p_actor_id": ACTOR,
                "p_account_id": ACCOUNT,
                "p_run_epoch": EPOCH,
                "p_action_uid": "research01",
                "p_intent": research(),
                "p_rule": {"price": "180", "unlockWave": 8},
            },
        )
    ]


@pytest.mark.parametrize(
    "change", ["unknown", "numeric_money", "effect", "origin", "actor", "outcome"]
)
def test_malformed_or_other_origin_replies_are_never_accepted(change):
    value = reply()
    if change == "unknown":
        value["status"] = "ok"
    elif change == "numeric_money":
        value["receipt"]["result"]["chargedCoins"] = 180
    elif change == "effect":
        value["receipt"]["result"]["treasuryReceiptId"] = None
    elif change == "origin":
        value["receipt"]["origin"]["runEpoch"] = str(uuid4())
    elif change == "actor":
        value["receipt"]["actorId"] = str(uuid4())
    else:
        value["receipt"]["result"]["research"] = None
    with pytest.raises(SupabaseRejected):
        asyncio.run(mutate(FakeAdmin(value), load_island(), context(), "research01", research()))


def test_known_refusals_remain_typed_and_transport_failures_do_not_fall_back():
    with pytest.raises(ApiError) as caught:
        read_result({"status": "refused", "reason": "stale_progression_quote"})
    assert caught.value.status_code == 409 and caught.value.code == "stale_progression_quote"
    with pytest.raises(SupabaseUnavailable):
        asyncio.run(
            mutate(
                FakeAdmin(SupabaseUnavailable()), load_island(), context(), "research01", research()
            )
        )


def test_read_state_preserves_exact_totals_and_rejects_mixed_epochs():
    value = {
        "status": "ok",
        "economy": envelope(),
        "bestWave": 50,
        "wreckPaid": 0,
        "research": [{**reply()["receipt"]["result"]["research"], "coinsPaid": str(2**80)}],
        "buildings": [],
    }
    result = asyncio.run(read_state(FakeAdmin(value), context()))
    assert result.research[0].coinsPaid == str(2**80)
    value["economy"]["runEpoch"] = str(uuid4())
    with pytest.raises(SupabaseRejected):
        asyncio.run(read_state(FakeAdmin(value), context()))


@pytest.mark.parametrize("uid", ["fx_forged_charge", "sys_forged_origin"])
def test_client_intents_cannot_claim_internal_effect_identifiers(uid):
    admin = FakeAdmin(reply())
    with pytest.raises(ApiError) as caught:
        asyncio.run(mutate(admin, load_island(), context(), uid, research()))
    assert caught.value.code == "invalid_transaction"
    assert admin.calls == []


def test_removed_wreck_gift_can_still_replay_its_immutable_receipt():
    catalogue = load_island()
    catalogue = replace(catalogue, wreck=replace(catalogue.wreck, gifts=(25,)))
    value = reply()
    value["repeat"] = True
    value["receipt"]["action"] = "wreck"
    value["receipt"]["result"].update(chargedCoins="100", research=None, wreckPaid=100)
    admin = FakeAdmin(value)
    result = asyncio.run(
        mutate(
            admin,
            catalogue,
            context(),
            "research01",
            {"action": "wreck", "amount": 100, "quotedCoins": "100"},
        )
    )
    assert result.repeat is True and result.receipt.result.chargedCoins == "100"
    assert admin.calls[0][1]["p_rule"] == {"unavailable": True}


def test_removed_research_choice_reaches_sql_replay_before_current_catalogue_rejection():
    catalogue = load_island()
    catalogue = replace(
        catalogue, research=(replace(catalogue.research[0], tier2=()), *catalogue.research[1:])
    )
    value = reply()
    value["repeat"] = True
    value["receipt"]["result"]["research"].update(tier=2, choice2="long_guns", revision="2")
    admin = FakeAdmin(value)
    assert (
        asyncio.run(
            mutate(
                admin,
                catalogue,
                context(),
                "research01",
                research(tier=2, choice="long_guns", quotedCoins="360"),
            )
        ).repeat
        is True
    )
    assert admin.calls[0][1]["p_rule"] == {"unavailable": True}
