"""Shared projections use coherent facts and exact server quotes without private fallbacks."""

from copy import deepcopy
from uuid import UUID

import pytest

from server.island.catalogue import load_island
from server.island.economy_http_models import parse_shared_body
from server.island.shared_snapshot import snapshot_from_row
from server.supabase_admin import SupabaseRejected

ACTOR, OWNER, ACCOUNT, EPOCH, INSTANCE = (str(UUID(int=n)) for n in range(910, 915))


def raw_snapshot():
    return {
        "status": "ok",
        "actorId": ACTOR,
        "owner": OWNER,
        "code": "K7Q2M",
        "ownerName": "Test Captain",
        "economy": {
            "mode": "island_shared",
            "version": 1,
            "islandOwner": OWNER,
            "accountId": ACCOUNT,
            "runEpoch": EPOCH,
            "revision": "2",
            "treasury": {"balanceCoins": "191", "committedCoins": "0", "availableCoins": "191"},
        },
        "admissionState": "active",
        "waveBest": 80,
        "nextWave": 1,
        "flags": 0,
        "crew": {"gunner": 0, "carpenter": 1, "guard": 0, "lookout": 0},
        "personal": {
            "status": "ok",
            "captain": {
                "progressionVersion": 1,
                "level": 4,
                "personalBestWave": 4,
                "role": "engineer",
                "revision": "1",
                "assignmentWaveId": None,
                "engineerCommitment": None,
                "canRespec": True,
                "respecBlockedReason": None,
                "roleLockedReason": None,
            },
            "skills": {
                "points": 1,
                "earned": 2,
                "spent": 1,
                "known": ["steady_aim"],
                "role": "engineer",
            },
        },
        "buildings": [
            {
                "spot": "wall_1",
                "kind": "wall",
                "instanceId": INSTANCE,
                "level": 1,
                "spec": None,
                "treeA": 0,
                "treeB": 0,
                "revision": "0",
                "refundCoins": "4",
                "refundReason": None,
                "hpUnits": 1000000,
                "maxHP": 60,
            }
        ],
        "research": [
            {
                "branch": "wall",
                "tier": 1,
                "choice2": None,
                "choice3": None,
                "revision": "1",
                "coinsPaid": "120",
            }
        ],
        "layout": [{"plot": "wall_1", "xHalf": -36, "zHalf": -2}],
        "wreckPaid": 0,
        "recoveryVersion": 1,
        "waveProtocol": 2,
        "serverNow": "2026-11-18T12:00:00Z",
        "reserved": False,
    }


def quote(snapshot, group, **target):
    return next(row for row in snapshot["quotes"][group] if row["target"] == target)


def project(row=None):
    return snapshot_from_row(row or raw_snapshot(), ACTOR, OWNER, load_island())


def test_snapshot_quotes_use_actual_shared_basis_personal_discount_and_stored_layout():
    result = project()
    assert result["snapshotVersion"] == 1 and result["actorId"] == ACTOR
    assert "coins" not in result and "weapons" not in result
    assert result["crew"]["carpenter"] == 1
    assert quote(result, "build", spot="wall_2", kind="wall")["intent"]["quotedCoins"] == "9"
    assert quote(result, "upgrade", spot="wall_1")["intent"]["quotedCoins"] == "18"
    assert quote(result, "demolish", spot="wall_1")["intent"]["quotedCoins"] == "4"
    wall = next(spot for spot in result["spots"] if spot["id"] == "wall_1")
    assert (wall["x"], wall["z"], wall["instanceId"]) == (-18, -1, INSTANCE)
    assert result["layout"] == {"version": 2, "grid": 0.5, "movable": False}
    assert {
        name for name, value in result["capabilities"].items() if value["available"]
    } == {"arsenal", "session", "repair", "market", "match"}
    assert all(
        value["reason"] is None if value["available"] else value["reason"]
        for value in result["capabilities"].values()
    )


def test_missing_personal_profile_or_shared_payment_basis_never_invents_a_price():
    row = raw_snapshot()
    row["personal"] = None
    row["buildings"][0].update(refundCoins=None, refundReason="construction_basis_missing")
    result = project(row)
    assert result["personalCaptain"] is None
    build = quote(result, "build", spot="wall_2", kind="wall")
    assert build["intent"] is None and build["reason"] == "captain_not_initialized"
    removed = quote(result, "demolish", spot="wall_1")
    assert removed["target"] == {"spot": "wall_1"} and removed["intent"] is None
    assert removed["reason"] == "construction_basis_missing"


def test_paused_snapshot_keeps_read_facts_but_no_new_offer_is_available():
    row = raw_snapshot()
    row["admissionState"] = "paused"
    result = project(row)
    assert result["economy"]["treasury"]["balanceCoins"] == "191"
    assert all(not entry["available"] for entries in result["quotes"].values() for entry in entries)
    assert all(not entry["available"] for entry in result["crewOffers"])


def test_raw_snapshot_failures_do_not_become_legacy_or_unadopted_mode():
    for mutate in (
        lambda row: row.update(actorId=OWNER),
        lambda row: row["economy"].update(islandOwner=ACTOR),
        lambda row: row["economy"]["treasury"].update(balanceCoins=191),
        lambda row: row.update(personal={"status": "legacy"}),
        lambda row: row["buildings"].append(deepcopy(row["buildings"][0])),
    ):
        row = raw_snapshot()
        mutate(row)
        with pytest.raises(SupabaseRejected):
            project(row)


def test_wreck_quote_uses_current_remaining_amount_and_keeps_original_gift_selector():
    row = raw_snapshot()
    row["wreckPaid"] = 490
    result = project(row)
    entry = quote(result, "wreck", amount=100)
    assert entry["intent"] == {"amount": 100, "quotedCoins": "10"}
    assert result["wreck"] == {"paidCoins": "490", "goalCoins": "500"}


def test_every_prepared_intent_round_trips_through_its_strict_endpoint_body():
    result = project()
    economy = {
        key: result["economy"][key] for key in ("mode", "version", "islandOwner", "runEpoch")
    }
    for action, quotes in result["quotes"].items():
        for offer in quotes:
            if offer["intent"] is not None:
                parse_shared_body(
                    action, {**offer["intent"], "economy": economy, "actionUid": "quote001"}
                )


def test_already_selected_house_role_is_visible_without_an_invented_zero_price_purchase():
    row = raw_snapshot()
    row["buildings"][0].update(
        spot="house_1", kind="house", spec="tavern", hpUnits=None, maxHP=None
    )
    current = quote(project(row), "towerSkill", spot="house_1", spec="tavern")
    assert current["intent"] is None and current["reason"] == "known"


def test_saved_gated_structure_keeps_identity_and_refund_but_respects_its_island_unlock():
    row = raw_snapshot()
    row["waveBest"] = 0
    row["buildings"][0].update(spot="cannon_8", kind="culverin")
    result = project(row)
    spot = next(spot for spot in result["spots"] if spot["id"] == "cannon_8")
    assert spot["built"] is True and spot["instanceId"] == INSTANCE
    build = quote(result, "build", spot="cannon_8", kind="culverin")
    assert build["intent"] is None and build["reason"] == "economy_path_unavailable"
    demo = quote(result, "demolish", spot="cannon_8")
    assert demo["intent"]["quotedCoins"] == "4" and demo["reason"] == "locked"
    assert all(
        not offer["available"]
        for offer in result["quotes"]["towerTree"]
        if offer["target"]["spot"] == "cannon_8"
    )


@pytest.mark.parametrize(
    "kind,spot", [("cannon", "cannon_8"), ("culverin", "cannon_1"), ("culverin", "cannon_8")]
)
def test_saved_gated_tower_keeps_its_existing_tree_offer_when_new_purchases_are_off(kind, spot):
    row = raw_snapshot()
    row["economy"]["treasury"].update(balanceCoins="10000", availableCoins="10000")
    row["buildings"][0].update(kind=kind, spot=spot, level=5)
    result = project(row)
    tree = quote(result, "towerTree", spot=spot, path="a", tier=1)
    assert tree["available"] and tree["intent"]["expected"]["instanceId"] == INSTANCE
    assert tree["intent"]["quotedCoins"] != "0"
    build = quote(result, "build", spot=spot, kind=kind)
    assert not build["available"]
