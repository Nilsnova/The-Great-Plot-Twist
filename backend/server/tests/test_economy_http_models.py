"""Shared HTTP intents retain exact caller assertions and reject financial selectors."""

from copy import deepcopy
from uuid import UUID

import pytest

from server.island.economy_http_models import parse_shared_body

OWNER, EPOCH, INSTANCE = (str(UUID(int=value)) for value in (901, 902, 903))
ECONOMY = {"mode": "island_shared", "version": 1, "islandOwner": OWNER, "runEpoch": EPOCH}


def body():
    return {
        "economy": ECONOMY,
        "actionUid": "build001",
        "spot": "wall_1",
        "kind": "wall",
        "instanceId": None,
        "expectedLevel": 0,
        "quotedCoins": "9007199254740993",
    }


def test_build_keeps_exact_decimal_quote_and_does_not_accept_a_dispatch_action():
    parsed = parse_shared_body("build", body())
    assert parsed.quotedCoins == "9007199254740993"
    assert parsed.economy.islandOwner == UUID(OWNER)
    assert parsed.model_dump(mode="json") == {**body(), "code": None}


@pytest.mark.parametrize(
    "change",
    [
        {"actorId": OWNER},
        {"payer": OWNER},
        {"accountId": OWNER},
        {"action": "demolish"},
        {"quotedCoins": 100},
        {"quotedCoins": "01"},
        {"expectedLevel": True},
        {"expectedLevel": 0.0},
        {"instanceId": INSTANCE},
    ],
)
def test_shared_build_rejects_extra_selectors_coercion_and_nonempty_target(change):
    with pytest.raises(ValueError):
        parse_shared_body("build", {**body(), **change})


@pytest.mark.parametrize(
    "change",
    [
        {"version": True},
        {"version": 1.0},
        {"accountId": OWNER},
        {"treasury": {}},
    ],
)
def test_economy_assertion_is_exact_and_cannot_select_an_account(change):
    value = body()
    value["economy"] = {**ECONOMY, **change}
    with pytest.raises(ValueError):
        parse_shared_body("build", value)


def test_existing_structure_body_requires_the_exact_instance_kind_level_and_quote():
    value = {**body(), "instanceId": INSTANCE, "expectedLevel": 2, "quotedCoins": "45"}
    assert parse_shared_body("demolish", value).instanceId == UUID(INSTANCE)
    for field in ("instanceId", "kind", "expectedLevel", "quotedCoins"):
        missing = deepcopy(value)
        del missing[field]
        with pytest.raises(ValueError):
            parse_shared_body("demolish", missing)


def test_research_preserves_aba_revision_and_explicit_null_choices():
    value = {
        "economy": ECONOMY,
        "actionUid": "research1",
        "branch": "wall",
        "tier": 2,
        "choice": "thick_walls",
        "change": True,
        "quotedCoins": "240",
        "expected": {
            "tier": 2,
            "choice2": "mason_drill",
            "choice3": None,
            "revision": "9007199254740993",
        },
    }
    result = parse_shared_body("research", value)
    assert result.expected.revision == "9007199254740993"
    del value["expected"]["choice3"]
    with pytest.raises(ValueError):
        parse_shared_body("research", value)


def test_free_house_role_still_requires_uid_and_the_complete_building_cas():
    value = {
        "economy": ECONOMY,
        "actionUid": "house001",
        "spot": "house_1",
        "spec": "tavern",
        "quotedCoins": "0",
        "expected": {
            "instanceId": INSTANCE,
            "kind": "house",
            "level": 2,
            "spec": "barracks",
            "treeA": 0,
            "treeB": 0,
            "revision": "4",
        },
    }
    assert parse_shared_body("towerSkill", value).quotedCoins == "0"
    del value["actionUid"]
    with pytest.raises(ValueError):
        parse_shared_body("towerSkill", value)


def test_hire_targets_scope_but_cannot_choose_price_count_or_role():
    value = {"economy": ECONOMY, "actionUid": "hire0001", "crew": "guard", "code": "ISLE-K7Q2M"}
    assert parse_shared_body("hire", value).code == "ISLE-K7Q2M"
    for field in ("quotedCoins", "count", "role"):
        with pytest.raises(ValueError):
            parse_shared_body("hire", {**value, field: "1"})
