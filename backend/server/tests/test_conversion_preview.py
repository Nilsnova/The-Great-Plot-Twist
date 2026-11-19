"""Offline conversion counterexamples. Fixtures contain synthetic identities only."""

import json
import subprocess
import sys
from copy import deepcopy
from pathlib import Path
from uuid import UUID

import pytest

from tools.economy.conversion import preview


def uid(number):
    return str(UUID(int=number))


def populated():
    player = {
        "playerId": uid(1),
        "walletCoins": "900",
        "privateTimber": "17",
        "walletLedger": [
            {
                "entryId": "101",
                "reason": "starting_coins",
                "sourceRef": "opening:101",
                "balanceDelta": "900",
                "committedDelta": "0",
            }
        ],
        "captainLevel": 4,
        "personalBestWave": 8,
        "earnedPoints": "4",
        "unspentPoints": "1",
        "knownSkills": ["steady_aim", "cutlass", "quick_fix"],
        "role": "engineer",
        "engineerCommitmentId": None,
        "progressionVersion": 0,
        "assignmentWaveId": None,
        "openLegacyWaveIds": [],
    }
    member = deepcopy(player)
    member.update(
        playerId=uid(2),
        walletCoins="500",
        privateTimber="0",
        walletLedger=[
            {
                "entryId": "102",
                "reason": "starting_coins",
                "sourceRef": "opening:102",
                "balanceDelta": "500",
                "committedDelta": "0",
            }
        ],
    )
    island = {
        "ownerId": uid(1),
        "revision": "7",
        "mode": "personal_legacy",
        "accountId": None,
        "members": [uid(2)],
        "waveBest": 80,
        "openWaveIds": [],
        "closedWaveIds": [uid(50)],
        "buildings": [
            {
                "instanceId": uid(30),
                "spot": "cannon_1",
                "kind": "cannon",
                "level": 1,
                "payments": [
                    {
                        "level": 1,
                        "coins": "90",
                        "sourceRef": "paid:actual90",
                        "payerId": uid(2),
                        "refunded": False,
                    }
                ],
                "refundEligible": True,
                "layout": {"x": 7, "z": -3},
                "skill": None,
                "treeA": 0,
                "treeB": 0,
            }
        ],
        "copies": [
            {
                "copyId": uid(200 + n),
                "weapon": "pistols",
                "copyNumber": n + 1,
                "sourceRef": f"copy:{n}",
                "buyerId": uid(1),
                "holderId": uid(n + 1) if n < 2 else None,
                "accountId": None,
                "runEpoch": None,
                "holderGeneration": "0",
                "pendingReturnWaveId": None,
                "disconnectedUntil": None,
            }
            for n in range(22)
        ],
        "unmappedWeaponIds": [],
        "legacyWeaponsOwned": ["musket"],
        "legacyEquippedWeapon": "musket",
        "research": {"wallTier": 3, "choice": "mason_drill"},
        "crew": {"gunner": 3, "carpenter": 2, "lookout": 1, "guard": 1},
        "wreckPaid": "30",
    }
    snapshot = {
        "schemaVersion": 1,
        "sourceCommit": "a" * 40,
        "snapshotId": uid(10),
        "sourceFamilies": [
            "wallets",
            "captains",
            "buildings",
            "research",
            "copies",
            "waves",
            "wagers",
            "ship",
            "membership",
            "guest_cleanup",
        ],
        "players": [player, member],
        "islands": [island],
        "accounts": [],
        "obligations": [
            {
                "obligationId": uid(40),
                "kind": "wave_claim",
                "mode": "personal_legacy",
                "actorId": uid(2),
                "recipientId": uid(2),
                "accountId": None,
                "runEpoch": None,
                "principalCoins": "35",
                "settled": False,
                "sourceRef": "closed-wave:50",
                "origin": {
                    "waveId": uid(50),
                    "waveProtocol": 2,
                    "closed": True,
                    "claimed": False,
                    "rewardCoins": "35",
                    "recipientMode": "personal_legacy",
                },
            }
        ],
        "unknownOrigins": [],
    }
    policy = {
        "schemaVersion": 1,
        "policyId": uid(11),
        "reviewReference": "synthetic-review",
        "reviewedBy": ["synthetic-owner", "synthetic-peer"],
        "selectedIslands": [uid(1)],
        "openingGrantCoins": "200",
        "wavesPerPoint": 2,
        "skillCosts": {"steady_aim": 1, "cutlass": 1, "quick_fix": 1},
        "retiredSkillIds": ["quick_fix"],
        "personalCash": "preserve",
        "refundBasis": "verified_actual_payments",
        "retiredSkills": "preserve_ids_no_compensation",
        "copyOverflow": "grandfather",
        "obligations": "retain_origin",
    }
    return snapshot, policy


def test_preview_preserves_cash_points_retired_ids_copy_ids_and_original_obligations():
    snapshot, policy = populated()
    before = deepcopy(snapshot)
    report = preview(snapshot, policy)
    assert report["status"] == "ready_for_rehearsal"
    plan = report["islands"][0]
    assert plan["openingGrantCoins"] == "200"
    assert plan["refundBases"][0]["refundCoins"] == "45"
    assert plan["copyIds"] == sorted(copy["copyId"] for copy in snapshot["islands"][0]["copies"])
    assert plan["overflowCopies"] == 2
    assert report["preserved"]["players"] == snapshot["players"]
    assert report["preserved"]["obligations"] == snapshot["obligations"]
    assert report["preserved"]["islands"] == snapshot["islands"]
    assert snapshot == before
    assert report == preview(snapshot, policy)


@pytest.mark.parametrize(
    "change,code",
    [
        (lambda s, p: p.pop("openingGrantCoins"), "invalid_policy"),
        (lambda s, p: p.update(personalCash="pool"), "invalid_policy"),
        (lambda s, p: s["players"][0].update(unspentPoints="2"), "point_mismatch"),
        (lambda s, p: s["players"][0].update(earnedPoints="40"), "personal_points_from_island"),
        (lambda s, p: s["islands"][0]["buildings"][0].update(payments=[]), "missing_actual_cost"),
        (lambda s, p: s["islands"][0].update(openWaveIds=[uid(80)]), "unsealed_wave"),
        (lambda s, p: s["islands"][0].update(unmappedWeaponIds=["old-rifle"]), "unmapped_weapon"),
        (lambda s, p: s.update(unknownOrigins=["new-money-product"]), "unknown_origin"),
        (lambda s, p: s["obligations"][0].update(recipientId=uid(1)), "private_recipient_changed"),
    ],
)
def test_preview_refuses_unreviewed_or_inconsistent_sources(change, code):
    snapshot, policy = populated()
    change(snapshot, policy)
    report = preview(snapshot, policy)
    assert report["status"] == "blocked"
    assert code in {finding["code"] for finding in report["findings"]}


def test_two_islands_do_not_duplicate_personal_money_or_captain_entitlements():
    snapshot, policy = populated()
    second = deepcopy(snapshot["islands"][0])
    second.update(ownerId=uid(2), members=[uid(1)], copies=[], buildings=[])
    snapshot["islands"].append(second)
    policy["selectedIslands"].append(uid(2))
    report = preview(snapshot, policy)
    assert report["status"] == "ready_for_rehearsal"
    assert [plan["openingGrantCoins"] for plan in report["islands"]] == ["200", "200"]
    assert len(report["preserved"]["players"]) == 2
    assert [row["walletCoins"] for row in report["preserved"]["players"]] == ["900", "500"]


def test_shared_retired_account_holds_and_private_bets_keep_their_original_recipients():
    snapshot, policy = populated()
    account = {
        "accountId": uid(60),
        "islandOwner": uid(3),
        "runEpoch": uid(61),
        "balanceCoins": "80",
        "committedCoins": "30",
        "retired": True,
        "ledger": [
            {
                "entryId": uid(62),
                "reason": "starting_coins",
                "sourceRef": "old:grant",
                "balanceDelta": "80",
                "committedDelta": "0",
            },
            {
                "entryId": uid(63),
                "reason": "market_call_stake",
                "sourceRef": "old:hold",
                "balanceDelta": "0",
                "committedDelta": "30",
            },
        ],
    }
    snapshot["accounts"].append(account)
    snapshot["obligations"].append(
        {
            "obligationId": uid(64),
            "kind": "shared_wager",
            "mode": "island_shared",
            "actorId": uid(2),
            "recipientId": uid(3),
            "accountId": uid(60),
            "runEpoch": uid(61),
            "principalCoins": "30",
            "settled": False,
            "sourceRef": "old:shared-bet",
            "origin": {
                "productId": "synthetic-football:1",
                "openingRef": "old:reserve",
                "openingFeeCoins": "0",
                "recipientMode": "island_shared",
            },
        }
    )
    report = preview(snapshot, policy)
    assert report["status"] == "ready_for_rehearsal"
    assert report["preserved"]["accounts"] == snapshot["accounts"]
    assert report["preserved"]["obligations"] == snapshot["obligations"]
    snapshot["obligations"][-1]["runEpoch"] = uid(65)
    assert "shared_origin_changed" in {row["code"] for row in preview(snapshot, policy)["findings"]}


def test_manifest_hashes_refuse_stale_snapshot_or_changed_policy():
    snapshot, policy = populated()
    first = preview(snapshot, policy)
    assert (
        preview(
            snapshot,
            policy,
            expected_snapshot=first["snapshotSha256"],
            expected_policy=first["policySha256"],
        )
        == first
    )
    snapshot["players"][0]["privateTimber"] = "18"
    report = preview(snapshot, policy, expected_snapshot=first["snapshotSha256"])
    assert report["status"] == "blocked"
    assert report["findings"][-1]["code"] == "stale_snapshot"
    policy["openingGrantCoins"] = "201"
    report = preview(snapshot, policy, expected_policy=first["policySha256"])
    assert "stale_policy" in {row["code"] for row in report["findings"]}


def test_reordered_top_level_rows_have_the_same_manifest():
    snapshot, policy = populated()
    first = preview(snapshot, policy)
    snapshot["players"].reverse()
    snapshot["sourceFamilies"].reverse()
    assert preview(snapshot, policy) == first


def test_nested_copy_payment_and_ledger_row_order_does_not_change_the_preview():
    snapshot, policy = populated()
    # Two actual paid levels give the same entitlement when SQL row order changes.
    building = snapshot["islands"][0]["buildings"][0]
    building["level"] = 2
    building["payments"].append(
        {
            "level": 2,
            "coins": "180",
            "sourceRef": "upgrade:actual180",
            "payerId": uid(1),
            "refunded": False,
        }
    )
    snapshot["players"][0]["walletLedger"].extend(
        [
            {
                "entryId": "103",
                "reason": "admin_adjust",
                "sourceRef": "later:credit",
                "balanceDelta": "10",
                "committedDelta": "0",
            },
            {
                "entryId": "104",
                "reason": "market_fee",
                "sourceRef": "later:fee",
                "balanceDelta": "-10",
                "committedDelta": "0",
            },
        ]
    )
    first = preview(snapshot, policy)
    assert first["status"] == "ready_for_rehearsal"
    snapshot["islands"][0]["copies"].reverse()
    building["payments"].reverse()
    snapshot["players"][0]["walletLedger"].reverse()
    policy["reviewedBy"].reverse()
    assert preview(snapshot, policy) == first


def test_existing_personal_engineer_generation_is_preserved_without_compensation():
    snapshot, policy = populated()
    snapshot["players"][0].update(progressionVersion=1, engineerCommitmentId=uid(99))
    report = preview(snapshot, policy)
    assert report["status"] == "ready_for_rehearsal"
    assert report["preserved"]["players"][0]["engineerCommitmentId"] == uid(99)
    assert report["preserved"]["players"][0]["knownSkills"] == [
        "steady_aim",
        "cutlass",
        "quick_fix",
    ]


@pytest.mark.parametrize(
    "change,code",
    [
        (lambda s, p: p.update(reviewedBy=["same", "same"]), "duplicate_identity"),
        (lambda s, p: s.update(schemaVersion=True), "invalid_snapshot"),
        (lambda s, p: s["players"][0].update(walletCoins=900), "invalid_snapshot"),
        (
            lambda s, p: s["players"][0]["walletLedger"][0].update(reason="unknown_product"),
            "unknown_wallet_reason",
        ),
        (lambda s, p: p["skillCosts"].pop("steady_aim"), "unknown_skill_cost"),
        (
            lambda s, p: s["players"][1]["walletLedger"][0].update(entryId="101"),
            "duplicate_identity",
        ),
        (lambda s, p: s["islands"][0]["copies"][0].update(holderId=uid(2)), "duplicate_identity"),
        (lambda s, p: s["obligations"][0].update(accountId=uid(90)), "private_origin_changed"),
        (
            lambda s, p: s["islands"][0]["buildings"][0]["payments"][0].update(refunded=True),
            "invalid_live_refund_basis",
        ),
        (
            lambda s, p: s["islands"][0]["buildings"][0].update(refundEligible=False),
            "unmapped_refund_right",
        ),
        (lambda s, p: s.update(sourceFamilies=[]), "source_inventory_incomplete"),
        (
            lambda s, p: s["players"][0].update(
                progressionVersion=1, engineerCommitmentId=uid(99), role="medic"
            ),
            "engineer_binding_mismatch",
        ),
    ],
)
def test_additional_source_counterexamples_are_blocked(change, code):
    snapshot, policy = populated()
    change(snapshot, policy)
    report = preview(snapshot, policy)
    assert report["status"] == "blocked"
    assert code in {row["code"] for row in report["findings"]}


def test_null_original_payer_is_preserved_in_actual_cost_basis():
    snapshot, policy = populated()
    snapshot["islands"][0]["buildings"][0]["payments"][0]["payerId"] = None
    report = preview(snapshot, policy)
    assert report["status"] == "ready_for_rehearsal"
    basis = report["islands"][0]["refundBases"][0]
    assert basis["refundCoins"] == "45" and basis["payments"][0]["payerId"] is None


def test_executable_cli_outputs_a_stable_report_and_no_writer(tmp_path):
    snapshot, policy = populated()
    source, manifest = tmp_path / "snapshot.json", tmp_path / "policy.json"
    source.write_text(json.dumps(snapshot))
    manifest.write_text(json.dumps(policy))
    command = [sys.executable, "-m", "tools.economy.conversion", str(source), str(manifest)]
    first = subprocess.run(
        command,
        cwd=Path(__file__).resolve().parents[2],
        capture_output=True,
        text=True,
        check=False,
    )
    second = subprocess.run(
        command,
        cwd=Path(__file__).resolve().parents[2],
        capture_output=True,
        text=True,
        check=False,
    )
    assert first.returncode == second.returncode == 0
    assert first.stdout == second.stdout
    assert json.loads(first.stdout)["manifestSha256"] == preview(snapshot, policy)["manifestSha256"]
    assert json.loads(source.read_text()) == snapshot and json.loads(manifest.read_text()) == policy


@pytest.mark.parametrize("payload", ['{"schemaVersion":1,"schemaVersion":2}', '{"number":NaN}'])
def test_cli_rejects_duplicate_keys_and_non_json_constants(tmp_path, payload):
    source, policy = tmp_path / "snapshot.json", tmp_path / "policy.json"
    source.write_text(payload)
    policy.write_text("{}")
    result = subprocess.run(
        [sys.executable, "-m", "tools.economy.conversion", str(source), str(policy)],
        cwd=Path(__file__).resolve().parents[2],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 2
    assert "strict JSON" in result.stderr


@pytest.mark.parametrize("kind", ["market_call", "position", "sports", "prediction", "duel"])
def test_old_personal_wagers_keep_terms_recipient_and_cash_after_conversion_preview(kind):
    snapshot, policy = populated()
    snapshot["players"][0]["walletCoins"] = "855"
    snapshot["players"][0]["walletLedger"].extend(
        [
            {
                "entryId": "103",
                "reason": "market_call_stake",
                "sourceRef": "old:stake",
                "balanceDelta": "-40",
                "committedDelta": "0",
            },
            {
                "entryId": "104",
                "reason": "market_fee",
                "sourceRef": "old:fee",
                "balanceDelta": "-5",
                "committedDelta": "0",
            },
        ]
    )
    old = {
        "obligationId": uid(70),
        "kind": kind,
        "mode": "personal_legacy",
        "actorId": uid(1),
        "recipientId": uid(1),
        "accountId": None,
        "runEpoch": None,
        "principalCoins": "40",
        "settled": False,
        "sourceRef": "old:bet",
        "origin": {
            "productId": "synthetic-product:1",
            "openingRef": "old:stake",
            "openingFeeCoins": "5",
            "openingPrice": "123.45",
            "recipientMode": "personal_legacy",
        },
    }
    snapshot["obligations"].append(old)
    report = preview(snapshot, policy)
    assert report["status"] == "ready_for_rehearsal"
    assert report["preserved"]["players"][0]["walletCoins"] == "855"
    assert report["preserved"]["obligations"][-1] == old
    assert report["islands"][0]["openingGrantCoins"] == "200"


def test_closed_unclaimed_wave_receipt_remains_personal_without_new_treasury_income():
    snapshot, policy = populated()
    original = deepcopy(snapshot["obligations"][0])
    report = preview(snapshot, policy)
    assert report["status"] == "ready_for_rehearsal"
    assert report["preserved"]["obligations"][0] == original
    assert report["islands"][0]["openingGrantCoins"] == "200"
    snapshot["obligations"][0]["origin"]["closed"] = False
    assert "obligation_origin_incomplete" in {
        r["code"] for r in preview(snapshot, policy)["findings"]
    }


def test_unmapped_old_ship_claim_fails_closed_without_reopening_paid_record():
    snapshot, policy = populated()
    claim = {
        "obligationId": uid(71),
        "kind": "ship_claim",
        "mode": "personal_legacy",
        "actorId": uid(1),
        "recipientId": uid(1),
        "accountId": None,
        "runEpoch": None,
        "principalCoins": "0",
        "settled": True,
        "sourceRef": "boat:old-paid-12",
        "origin": {
            "claimRef": "boat:old-paid-12",
            "playedWave": 30,
            "game": "rigging",
            "paidCoins": "12",
            "islandRecord": 30,
            "originalIslandOwner": uid(1),
            "recipientMode": "personal_legacy",
        },
    }
    snapshot["obligations"].append(claim)
    report = preview(snapshot, policy)
    assert report["status"] == "blocked"
    assert "ship_cap_mapping_required" in {r["code"] for r in report["findings"]}
    assert report["preserved"]["obligations"][-1] == claim
    assert report["islands"] == []


@pytest.mark.parametrize(
    "change,code",
    [
        (
            lambda s, p: s["islands"][0].update(legacyWeaponsOwned=["musket", "pistols"]),
            "unmapped_weapon",
        ),
        (lambda s, p: s["islands"][0].update(legacyEquippedWeapon="long_rifle"), "unmapped_weapon"),
        (lambda s, p: s["obligations"][0].update(origin={}), "obligation_origin_incomplete"),
        (lambda s, p: s["players"][0].update(openLegacyWaveIds=[uid(72)]), "personal_wave_active"),
        (
            lambda s, p: s["islands"][0]["copies"][0].update(accountId=uid(73)),
            "copy_origin_mismatch",
        ),
    ],
)
def test_residual_weapon_and_original_lifecycle_sources_are_not_silently_omitted(change, code):
    snapshot, policy = populated()
    change(snapshot, policy)
    assert code in {row["code"] for row in preview(snapshot, policy)["findings"]}


@pytest.mark.parametrize(
    "field,value",
    [
        ("rewardCoins", "-1"),
        ("rewardCoins", 35),
        ("waveId", "not-a-wave"),
        ("waveProtocol", True),
        ("claimed", True),
    ],
)
def test_unverifiable_old_wave_origin_never_becomes_a_rehearsal_plan(field, value):
    snapshot, policy = populated()
    snapshot["obligations"][0]["origin"][field] = value
    report = preview(snapshot, policy)
    assert report["status"] == "blocked" and report["islands"] == []
    assert "obligation_origin_incomplete" in {row["code"] for row in report["findings"]}


def test_foundation_scale_money_is_exact_without_a_legacy_ceiling():
    snapshot, policy = populated()
    coins = "1" + "0" * 5000
    snapshot["players"][0]["walletCoins"] = coins
    snapshot["players"][0]["walletLedger"][0]["balanceDelta"] = coins
    policy["openingGrantCoins"] = coins
    report = preview(snapshot, policy)
    assert report["status"] == "ready_for_rehearsal"
    assert report["preserved"]["players"][0]["walletCoins"] == coins
    assert report["islands"][0]["openingGrantCoins"] == coins
