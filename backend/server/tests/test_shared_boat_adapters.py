"""Shared ship adapters/DTOs and frozen catalogue parity; no route activation or real auth."""

import asyncio
from copy import deepcopy
from pathlib import Path

import pytest

from server.errors import ApiError
from server.island import shared_boat
from server.island.boat import BOAT
from server.island.catalogue import load_island
from server.island.shared_boat_store import read_claim, read_start
from server.supabase_admin import SupabaseRejected
from server.tests.test_island_treasury import ACCOUNT, ACTOR, EPOCH, OPERATION, OWNER, envelope

ROUND = "00000000-0000-4000-8000-000000000011"
ROOT = Path(__file__).resolve().parents[3]


def started():
    return {
        "status": "started",
        "repeat": False,
        "receipt": {
            "receiptId": OPERATION,
            "actionUid": "start0001",
            "action": "boat:start",
            "actorId": ACTOR,
            "origin": {
                "mode": "island_shared",
                "version": 1,
                "islandOwner": OWNER,
                "accountId": ACCOUNT,
                "runEpoch": EPOCH,
            },
            "result": {
                "round": {
                    "id": ROUND,
                    "actorId": ACTOR,
                    "islandOwner": OWNER,
                    "accountId": ACCOUNT,
                    "runEpoch": EPOCH,
                    "game": "dash",
                    "recordWave": 30,
                    "maximumCoins": "36",
                }
            },
        },
    }


def completed(*, repeat=False):
    return {
        "status": "done",
        "repeat": repeat,
        "receipt": {
            "receiptId": OPERATION,
            "actionUid": "claim0001",
            "action": "boat:claim",
            "actorId": ACTOR,
            "origin": {
                "mode": "island_shared",
                "version": 1,
                "islandOwner": OWNER,
                "accountId": ACCOUNT,
                "runEpoch": EPOCH,
            },
            "result": {
                "roundId": ROUND,
                "game": "dash",
                "recordWave": 30,
                "stars": 3,
                "coins": "36",
                "cumulativeCoins": "36",
                "maximumCoins": "36",
                "treasuryReceiptId": OPERATION,
            },
        },
        "currentEconomy": None if repeat else envelope(balance=236, committed=0, revision=2),
    }


class Database:
    def __init__(self, reply):
        self.reply = reply
        self.calls = []

    async def call_function(self, name, parameters):
        self.calls.append((name, parameters))
        return deepcopy(self.reply)


def test_round_start_takes_no_client_coin_record_or_account_authority():
    database = Database(started())
    row = asyncio.run(shared_boat.start_round(database, ACTOR, OWNER, EPOCH, "dash", "start0001"))
    assert str(row.receipt.result.round.id) == ROUND
    assert database.calls == [
        (
            "island_shared_boat_start",
            {
                "p_actor_id": ACTOR,
                "p_island_owner": OWNER,
                "p_run_epoch": EPOCH,
                "p_game": "dash",
                "p_action_uid": "start0001",
            },
        )
    ]


def test_claim_uses_bound_round_and_can_read_historical_receipt_without_preflight():
    database = Database(completed(repeat=True))
    row = asyncio.run(shared_boat.claim_round(database, ACTOR, ROUND, EPOCH, 3, "claim0001"))
    assert row.currentEconomy is None and row.repeat is True
    assert database.calls == [
        (
            "island_shared_boat_claim",
            {
                "p_actor_id": ACTOR,
                "p_round_id": ROUND,
                "p_run_epoch": EPOCH,
                "p_stars": 3,
                "p_action_uid": "claim0001",
            },
        )
    ]


@pytest.mark.parametrize("uid", ["fx_00000000_reward", "sys_00000000_reward", "short"])
def test_internal_or_invalid_root_identifiers_fail_before_rpc(uid):
    database = Database(started())
    with pytest.raises(ApiError):
        asyncio.run(shared_boat.start_round(database, ACTOR, OWNER, EPOCH, "dash", uid))
    assert database.calls == []


def test_explicit_epoch_is_required_before_start_or_claim_rpc():
    database = Database(started())
    with pytest.raises(ApiError) as error:
        asyncio.run(shared_boat.start_round(database, ACTOR, OWNER, None, "dash", "start0001"))
    assert error.value.code == "economy_context_required" and database.calls == []


@pytest.mark.parametrize("stars", [True, -1, 4, "3", 1.0])
def test_bad_score_is_refused_before_rpc(stars):
    database = Database(completed())
    with pytest.raises(ApiError):
        asyncio.run(shared_boat.claim_round(database, ACTOR, ROUND, EPOCH, stars, "claim0001"))
    assert database.calls == []


def test_zero_reward_still_has_immutable_common_receipt_without_ledger_effect():
    value = completed()
    value["receipt"]["result"].update(coins="0", treasuryReceiptId=None)
    row, account = read_claim(value)
    assert row.receipt.result.coins == "0" and account is not None


@pytest.mark.parametrize(
    "field,value",
    [
        ("coins", 36),
        ("coins", "-1"),
        ("cumulativeCoins", "37"),
        ("maximumCoins", "39"),
        ("stars", True),
        ("treasuryReceiptId", None),
    ],
)
def test_inconsistent_receipt_results_fail_closed(field, value):
    result = completed()
    result["receipt"]["result"][field] = value
    with pytest.raises(SupabaseRejected):
        read_claim(result)


def test_historical_reply_cannot_expose_fresh_treasury_state():
    result = completed()
    result["repeat"] = True
    with pytest.raises(SupabaseRejected):
        read_claim(result)


def test_new_claim_requires_matching_fresh_account():
    result = completed()
    result["receipt"]["origin"]["accountId"] = ROUND
    with pytest.raises(SupabaseRejected):
        read_claim(result)


def test_wrong_actor_or_action_uid_reply_is_refused():
    result = completed()
    result["receipt"]["actionUid"] = "other0001"
    with pytest.raises(SupabaseRejected):
        asyncio.run(shared_boat.claim_round(Database(result), ACTOR, ROUND, EPOCH, 3, "claim0001"))
    result = started()
    result["receipt"]["result"]["round"]["actorId"] = OWNER
    with pytest.raises(SupabaseRejected):
        asyncio.run(
            shared_boat.start_round(Database(result), ACTOR, OWNER, EPOCH, "dash", "start0001")
        )


def test_exact_treasury_strings_above_python_decimal_conversion_limit_are_supported():
    result = completed()
    huge = "1" + "0" * 5000
    result["currentEconomy"]["treasury"].update(balanceCoins=huge, availableCoins=huge)
    _, account = read_claim(result)
    assert account.balance_coins == 10**5000


@pytest.mark.parametrize("value", [None, {}, {"status": "refused", "reason": []}])
def test_missing_or_malformed_answers_never_fall_back(value):
    with pytest.raises(SupabaseRejected):
        read_start(value)


def test_sql_version_one_rules_match_current_catalogue():
    catalogue = load_island()
    assert catalogue.campaign.wave_of("ship") == 30 and catalogue.wreck.goal == 500
    assert (BOAT.stars, BOAT.coins_base, BOAT.coins_per_waves, BOAT.max_wave) == (3, 6, 5, 100)
    sql = (ROOT / "supabase/migrations/20261118051500_shared_ship_rewards.sql").read_text()
    assert "if v_island.wave_best < 30 then" in sql
    assert "if v_island.wreck_paid < 500 then" in sql
    assert "6+least(v_island.wave_best,100)/5" in sql
