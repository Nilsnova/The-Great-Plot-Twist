"""Strict shared arsenal adapter checks; SQL/authority behavior is tested separately."""

import asyncio
import re
from copy import deepcopy
from dataclasses import replace
from pathlib import Path
from uuid import UUID

import pytest

from server.errors import ApiError
from server.island.catalogue import load_island
from server.island.shared_arsenal_store import mutate, read_result
from server.island.treasury import EconomyContext
from server.supabase_admin import SupabaseRejected

ACTOR, OWNER, ACCOUNT, EPOCH, OPERATION, COPY, FINANCIAL = (str(UUID(int=i)) for i in range(1, 8))
CONTEXT = EconomyContext("island_shared", 1, ACTOR, OWNER, ACCOUNT, EPOCH, 1)


def response(*, repeat=False):
    return {
        "status": "done",
        "repeat": repeat,
        "operationId": OPERATION,
        "currentEconomy": None
        if repeat
        else {
            "mode": "island_shared",
            "version": 1,
            "islandOwner": OWNER,
            "accountId": ACCOUNT,
            "runEpoch": EPOCH,
            "revision": "2",
            "treasury": {"balanceCoins": "140", "committedCoins": "0", "availableCoins": "140"},
        },
        "receipt": {
            "receiptId": OPERATION,
            "actionUid": "arsenal001",
            "action": "arsenal_buy",
            "actorId": ACTOR,
            "origin": {
                "mode": "island_shared",
                "version": 1,
                "islandOwner": OWNER,
                "accountId": ACCOUNT,
                "runEpoch": EPOCH,
            },
            "result": {
                "copyId": COPY,
                "weapon": "pistols",
                "holderGeneration": "1",
                "priceCoins": "60",
                "financialReceiptId": FINANCIAL,
            },
        },
    }


class Admin:
    def __init__(self, reply):
        self.reply = reply
        self.calls = []

    async def call_function(self, function, parameters):
        self.calls.append((function, parameters))
        return self.reply


def test_adapter_issues_one_atomic_domain_call_and_no_standalone_debit():
    admin = Admin(response())
    result = asyncio.run(
        mutate(admin, CONTEXT, "arsenal001", "buy", weapon="pistols", catalogue=load_island())
    )
    assert result["receipt"]["result"]["copyId"] == COPY
    assert len(admin.calls) == 1
    name, values = admin.calls[0]
    assert name == "island_shared_arsenal_mutate"
    assert values["p_actor_id"] == ACTOR and values["p_account_id"] == ACCOUNT
    assert values["p_price"] == "60"
    assert values["p_unlock_wave"] == 2


def test_historical_replay_does_not_require_current_catalogue_or_authority_preflight():
    admin = Admin(response(repeat=True))
    retired_catalogue = replace(load_island(), weapons=())
    result = asyncio.run(
        mutate(admin, CONTEXT, "arsenal001", "buy", weapon="pistols", catalogue=retired_catalogue)
    )
    assert result["repeat"] and result["currentEconomy"] is None
    assert len(admin.calls) == 1
    assert admin.calls[0][1]["p_price"] is None


@pytest.mark.parametrize(
    "reason,code",
    [
        ("action_conflict", "idempotency_conflict"),
        ("epoch_mismatch", "economy_epoch_mismatch"),
        ("path_unavailable", "economy_path_unavailable"),
        ("stale_holder", "stale_holder"),
    ],
)
def test_stable_refusals_do_not_invoke_legacy_fallback(reason, code):
    admin = Admin({"status": "refused", "reason": reason})
    with pytest.raises(ApiError) as error:
        asyncio.run(mutate(admin, CONTEXT, "arsenal001", "buy", weapon="pistols"))
    assert error.value.code == code
    assert len(admin.calls) == 1


@pytest.mark.parametrize(
    "field,value",
    [
        ("mode", "personal_legacy"),
        ("version", True),
        ("account_id", None),
        ("run_epoch", None),
    ],
)
def test_shared_context_is_required_before_dispatch(field, value):
    admin = Admin(response())
    with pytest.raises(ApiError):
        asyncio.run(mutate(admin, replace(CONTEXT, **{field: value}), "arsenal001", "buy"))
    assert admin.calls == []


@pytest.mark.parametrize(
    "field,value",
    [
        ("holderGeneration", "-1"),
        ("priceCoins", 60),
        ("priceCoins", "01"),
        ("copyId", "bad"),
        ("financialReceiptId", None),
    ],
)
def test_unreadable_effect_is_refused(field, value):
    reply = response()
    reply["receipt"]["result"][field] = value
    with pytest.raises(SupabaseRejected):
        read_result(reply)


def test_replay_cannot_smuggle_a_fresh_economy_snapshot():
    reply = response()
    reply["repeat"] = True
    with pytest.raises(SupabaseRejected):
        read_result(reply)


def test_fresh_purchase_reply_must_match_the_authoritative_catalogue_charge():
    reply = response()
    reply["receipt"]["result"]["priceCoins"] = "61"
    with pytest.raises(SupabaseRejected):
        asyncio.run(
            mutate(
                Admin(reply),
                CONTEXT,
                "arsenal001",
                "buy",
                weapon="pistols",
                catalogue=load_island(),
            )
        )


def test_cross_account_receipt_or_reply_is_refused():
    for field in ("receipt", "currentEconomy"):
        reply = deepcopy(response())
        target = reply[field]["origin"] if field == "receipt" else reply[field]
        target["accountId"] = str(UUID(int=99))
        with pytest.raises(SupabaseRejected):
            asyncio.run(mutate(Admin(reply), CONTEXT, "arsenal001", "buy", weapon="pistols"))


@pytest.mark.parametrize("generation", [True, -1, 1.0, "1"])
def test_invalid_holder_generation_is_refused_without_dispatch(generation):
    admin = Admin(response())
    with pytest.raises(ApiError) as error:
        asyncio.run(
            mutate(admin, CONTEXT, "arsenal001", "take", copy_id=COPY, generation=generation)
        )
    assert error.value.code == "invalid_transaction"
    assert not admin.calls


def test_malformed_refusal_does_not_escape_as_an_unhandled_type_error():
    with pytest.raises(SupabaseRejected):
        read_result({"status": "refused", "reason": []})


def test_sql_weapon_catalogue_matches_authoritative_content_without_another_price_table():
    migration = (
        Path(__file__).resolve().parents[3]
        / "supabase/migrations/20261118050900_shared_arsenal.sql"
    )
    sql = migration.read_text()
    weapon_list = re.search(r"if p_weapon not in \(([^)]+)\)", sql).group(1)
    assert set(re.findall(r"'([a-z_]+)'", weapon_list)) == {
        entry.weapon for entry in load_island().weapons if entry.weapon != "musket"
    }
