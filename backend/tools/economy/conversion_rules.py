"""Conservation checks for supplied offline save facts. Used by conversion.py."""

import re
from collections import Counter
from uuid import UUID

from server.island.treasury_models import decimal_integer, decimal_string
from server.wallet import WALLET_REASONS
from tools.economy.conversion_models import Policy, Snapshot

SOURCE_FAMILIES = {
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
}


def origin_complete(obligation):
    """Require old product terms, not only a generic obligation-kind label."""
    fields = {"recipientMode"}
    if obligation.kind == "wave_claim":
        fields |= {"waveId", "waveProtocol", "closed", "claimed", "rewardCoins"}
    elif obligation.kind == "ship_claim":
        fields |= {
            "claimRef",
            "playedWave",
            "game",
            "paidCoins",
            "islandRecord",
            "originalIslandOwner",
        }
    else:
        fields |= {"productId", "openingRef", "openingFeeCoins"}
    if not fields <= set(obligation.origin) or any(
        obligation.origin[field] is None for field in fields
    ):
        return False
    for field in fields & {"openingFeeCoins", "rewardCoins", "paidCoins"}:
        value = obligation.origin[field]
        if not isinstance(value, str) or re.fullmatch(r"0|[1-9][0-9]*", value) is None:
            return False
    for field in fields & {"productId", "openingRef", "claimRef", "game"}:
        if not isinstance(obligation.origin[field], str) or not obligation.origin[field].strip():
            return False
    if obligation.kind == "wave_claim":
        try:
            if str(UUID(obligation.origin["waveId"])) != obligation.origin["waveId"]:
                return False
        except (ValueError, TypeError, AttributeError):
            return False
        return (
            obligation.origin["closed"] is True
            and type(obligation.origin["claimed"]) is bool
            and obligation.origin["claimed"] == obligation.settled
            and type(obligation.origin["waveProtocol"]) is int
            and obligation.origin["waveProtocol"] in (1, 2)
        )
    if obligation.kind == "ship_claim":
        return all(
            type(obligation.origin[field]) is int and obligation.origin[field] >= 1
            for field in ("playedWave", "islandRecord")
        )
    return True


def findings(snapshot: Snapshot, policy: Policy) -> list[dict]:
    problems = []

    def record(code, subject):
        problems.append({"code": code, "subject": str(subject)})

    def unique(values, subject):
        if any(count > 1 for count in Counter(values).values()):
            record("duplicate_identity", subject)

    if set(snapshot.sourceFamilies) != SOURCE_FAMILIES:
        record("source_inventory_incomplete", "sourceFamilies")
    for origin in snapshot.unknownOrigins:
        record("unknown_origin", origin)
    unique(snapshot.sourceFamilies, "sourceFamilies")
    unique(policy.reviewedBy, "reviewedBy")
    unique(policy.selectedIslands, "selectedIslands")
    unique(policy.retiredSkillIds, "retiredSkillIds")
    if any(skill not in policy.skillCosts for skill in policy.retiredSkillIds):
        record("retired_skill_cost_missing", "policy")
    unique((row.playerId for row in snapshot.players), "players")
    unique((row.ownerId for row in snapshot.islands), "islands")
    unique((row.accountId for row in snapshot.accounts), "accounts")
    unique(((row.islandOwner, row.runEpoch) for row in snapshot.accounts), "account epochs")
    unique(
        (entry.entryId for player in snapshot.players for entry in player.walletLedger),
        "private ledger IDs",
    )
    unique(
        (entry.entryId for account in snapshot.accounts for entry in account.ledger),
        "treasury ledger IDs",
    )
    unique((row.obligationId for row in snapshot.obligations), "obligations")
    unique((row.sourceRef for row in snapshot.obligations), "obligation sources")
    players = {row.playerId: row for row in snapshot.players}
    islands = {row.ownerId: row for row in snapshot.islands}
    accounts = {row.accountId: row for row in snapshot.accounts}
    affected_captains = {
        actor
        for island in snapshot.islands
        if island.ownerId in policy.selectedIslands
        for actor in [island.ownerId, *island.members]
    }
    for owner in policy.selectedIslands:
        if owner not in islands:
            record("missing_selected_island", owner)
    for player in snapshot.players:
        if player.playerId in affected_captains and (
            player.assignmentWaveId is not None or player.openLegacyWaveIds
        ):
            record("personal_wave_active", player.playerId)
        unique(player.knownSkills, player.playerId)
        unique((entry.entryId for entry in player.walletLedger), player.playerId)
        if any(entry.reason not in dict(WALLET_REASONS) for entry in player.walletLedger):
            record("unknown_wallet_reason", player.playerId)
        if player.progressionVersion == 0 and player.engineerCommitmentId is not None:
            record("legacy_commitment_without_profile", player.playerId)
        if player.engineerCommitmentId is not None and player.role != "engineer":
            record("engineer_binding_mismatch", player.playerId)
        if any(decimal_integer(entry.committedDelta) != 0 for entry in player.walletLedger):
            record("private_commitment_in_wallet_ledger", player.playerId)
        if sum(decimal_integer(e.balanceDelta) for e in player.walletLedger) != decimal_integer(
            player.walletCoins
        ):
            record("wallet_ledger_mismatch", player.playerId)
        if any(skill not in policy.skillCosts for skill in player.knownSkills):
            record("unknown_skill_cost", player.playerId)
            continue
        earned = decimal_integer(player.earnedPoints)
        spent = sum(policy.skillCosts[skill] for skill in player.knownSkills)
        if earned != player.personalBestWave // policy.wavesPerPoint:
            record("personal_points_from_island", player.playerId)
        if earned != spent + decimal_integer(player.unspentPoints):
            record("point_mismatch", player.playerId)
    for account in snapshot.accounts:
        unique((entry.entryId for entry in account.ledger), account.accountId)
        balance = decimal_integer(account.balanceCoins)
        committed = decimal_integer(account.committedCoins)
        if (
            balance < committed
            or balance != sum(decimal_integer(e.balanceDelta) for e in account.ledger)
            or committed != sum(decimal_integer(e.committedDelta) for e in account.ledger)
        ):
            record("treasury_ledger_mismatch", account.accountId)
        held = sum(
            decimal_integer(o.principalCoins)
            for o in snapshot.obligations
            if o.mode == "island_shared" and not o.settled and o.accountId == account.accountId
        )
        if held != committed:
            record("obligation_hold_mismatch", account.accountId)
    copies, instances, payment_sources = [], [], []
    for island in snapshot.islands:
        copies.extend(copy.copyId for copy in island.copies)
        instances.extend(building.instanceId for building in island.buildings)
        if island.ownerId not in players:
            record("missing_owner", island.ownerId)
        unique(island.members, island.ownerId)
        if any(member not in players for member in island.members):
            record("missing_member", island.ownerId)
        unique((copy.copyNumber for copy in island.copies), island.ownerId)
        unique(
            (copy.holderId for copy in island.copies if copy.holderId is not None),
            "copy holders " + str(island.ownerId),
        )
        unique((building.spot for building in island.buildings), island.ownerId)
        for copy in island.copies:
            if copy.holderId is not None and copy.holderId not in players:
                record("unknown_copy_holder", copy.copyId)
            if copy.holderId is not None and copy.holderId not in (island.ownerId, *island.members):
                record("departed_copy_holder", copy.copyId)
            if island.mode == "personal_legacy" and (
                copy.accountId is not None or copy.runEpoch is not None
            ):
                record("copy_origin_mismatch", copy.copyId)
            if island.mode == "island_shared":
                origin = accounts.get(island.accountId)
                if origin is None or (copy.accountId, copy.runEpoch) != (
                    origin.accountId,
                    origin.runEpoch,
                ):
                    record("copy_origin_mismatch", copy.copyId)
        if island.mode == "personal_legacy" and island.accountId is not None:
            record("legacy_account_mismatch", island.ownerId)
        if island.mode == "island_shared":
            account = accounts.get(island.accountId)
            if account is None or account.islandOwner != island.ownerId or account.retired:
                record("shared_account_mismatch", island.ownerId)
        if island.ownerId not in policy.selectedIslands:
            continue
        if island.openWaveIds:
            record("unsealed_wave", island.ownerId)
        residual_weapons = set(island.legacyWeaponsOwned) - {"musket"}
        if island.legacyEquippedWeapon != "musket":
            residual_weapons.add(island.legacyEquippedWeapon)
        if island.unmappedWeaponIds or residual_weapons:
            record("unmapped_weapon", island.ownerId)
        if any(
            copy.pendingReturnWaveId is not None or copy.disconnectedUntil is not None
            for copy in island.copies
        ):
            record("unresolved_copy_lifecycle", island.ownerId)
        for building in island.buildings:
            if not building.refundEligible:
                if building.kind != "cabin":
                    record("unmapped_refund_right", building.instanceId)
                continue
            if building.kind == "cabin":
                record("protected_refund_basis", building.instanceId)
            levels = [payment.level for payment in building.payments]
            if sorted(levels) != list(range(1, building.level + 1)):
                record("missing_actual_cost", building.instanceId)
            for payment in building.payments:
                payment_sources.append(payment.sourceRef)
                if payment.refunded or decimal_integer(payment.coins) <= 0:
                    record("invalid_live_refund_basis", building.instanceId)
    unique(copies, "copy IDs across islands")
    unique(instances, "building IDs across islands")
    unique(payment_sources, "actual payment sources")
    for obligation in snapshot.obligations:
        if not origin_complete(obligation):
            record("obligation_origin_incomplete", obligation.obligationId)
        if obligation.origin.get("recipientMode") != obligation.mode:
            record("obligation_mode_changed", obligation.obligationId)
        if obligation.kind == "ship_claim" and obligation.origin.get("originalIslandOwner") in {
            str(owner) for owner in policy.selectedIslands
        }:
            record("ship_cap_mapping_required", obligation.obligationId)
        if obligation.mode == "personal_legacy":
            if obligation.accountId is not None or obligation.runEpoch is not None:
                record("private_origin_changed", obligation.obligationId)
            if obligation.recipientId != obligation.actorId:
                record("private_recipient_changed", obligation.obligationId)
        else:
            account = accounts.get(obligation.accountId)
            if account is None or (account.runEpoch, account.islandOwner) != (
                obligation.runEpoch,
                obligation.recipientId,
            ):
                record("shared_origin_changed", obligation.obligationId)
    return sorted(problems, key=lambda finding: (finding["code"], finding["subject"]))


def island_plan(island, policy):
    """Describe proposed grant and refund entitlements; no cash or asset is written."""
    bases = []
    for building in sorted(island.buildings, key=lambda row: str(row.instanceId)):
        if not building.refundEligible:
            continue
        paid = sum(decimal_integer(payment.coins) for payment in building.payments)
        bases.append(
            {
                "instanceId": str(building.instanceId),
                "actualCoins": decimal_string(paid),
                "refundCoins": decimal_string(paid // 2),
                "payments": [
                    row.model_dump(mode="json")
                    for row in sorted(building.payments, key=lambda row: row.level)
                ],
            }
        )
    legacy = island.mode == "personal_legacy"
    return {
        "ownerId": str(island.ownerId),
        "expectedRevision": island.revision,
        "action": "admit" if legacy else "preserve_shared",
        "openingGrantCoins": policy.openingGrantCoins if legacy else "0",
        "refundBases": bases,
        "copyIds": sorted(str(copy.copyId) for copy in island.copies),
        "overflowCopies": max(0, len(island.copies) - 20),
        "canBuyCopy": len(island.copies) < 20,
    }
