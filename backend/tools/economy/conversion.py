"""Deterministic offline save conversion preview; no network or database writer.

Run from backend: python -m tools.economy.conversion SNAPSHOT POLICY
The supplied policy must state reviewed opening funds; this tool chooses none.
"""

import argparse
import hashlib
import json
from pathlib import Path
from typing import Never

from pydantic import JsonValue, ValidationError

from tools.economy.conversion_models import Policy, Snapshot
from tools.economy.conversion_rules import findings, island_plan


def encoded(value: object) -> str:
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False
    )


def fingerprint(value: object) -> str:
    return hashlib.sha256(encoded(value).encode()).hexdigest()


def strict_json(path: Path) -> JsonValue:
    """Duplicate keys and non-JSON numeric constants cannot hide policy decisions."""

    def object_pairs(pairs: list[tuple[str, JsonValue]]) -> dict[str, JsonValue]:
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("duplicate JSON key")
            result[key] = value
        return result

    def reject_constant(_value: str) -> Never:
        raise ValueError("non-JSON numeric constant")

    return json.loads(
        path.read_text(), object_pairs_hook=object_pairs, parse_constant=reject_constant
    )


def snapshot_facts(snapshot: Snapshot) -> dict[str, JsonValue]:
    """Canonicalize collection order without rewriting saved field values."""
    value = snapshot.model_dump(mode="json")
    for family, key in (
        ("players", "playerId"),
        ("islands", "ownerId"),
        ("accounts", "accountId"),
        ("obligations", "obligationId"),
    ):
        value[family].sort(key=lambda row: row[key])
    value["sourceFamilies"].sort()
    value["unknownOrigins"].sort()
    for player in value["players"]:
        player["walletLedger"].sort(key=lambda row: row["entryId"])
        player["openLegacyWaveIds"].sort()
    for account in value["accounts"]:
        account["ledger"].sort(key=lambda row: row["entryId"])
    for island in value["islands"]:
        for field in ("members", "openWaveIds", "closedWaveIds", "unmappedWeaponIds"):
            island[field].sort()
        island["copies"].sort(key=lambda row: row["copyId"])
        island["buildings"].sort(key=lambda row: row["instanceId"])
        for building in island["buildings"]:
            building["payments"].sort(key=lambda row: row["level"])
    return value


def policy_facts(policy: Policy) -> dict[str, JsonValue]:
    value = policy.model_dump(mode="json")
    for field in ("selectedIslands", "reviewedBy", "retiredSkillIds"):
        value[field].sort()
    return value


def invalid_findings(error: ValidationError, source: str) -> list[dict[str, str]]:
    return [
        {
            "code": "invalid_" + source,
            "subject": source + "." + ".".join(map(str, entry["loc"])),
            "reason": entry["msg"],
        }
        for entry in error.errors(include_input=False, include_url=False)
    ]


def preview(
    snapshot_value: object,
    policy_value: object,
    *,
    expected_snapshot: str | None = None,
    expected_policy: str | None = None,
) -> dict[str, JsonValue]:
    report = {
        "schemaVersion": 1,
        "status": "blocked",
        "findings": [],
        "islands": [],
        "coverageClaim": "supplied_facts_only",
        "verificationBoundary": "No production export, verified approval or conversion executed.",
    }
    try:
        snapshot = Snapshot.model_validate(snapshot_value)
    except ValidationError as error:
        report["findings"] = invalid_findings(error, "snapshot")
        return report
    try:
        policy = Policy.model_validate(policy_value)
    except ValidationError as error:
        report["findings"] = invalid_findings(error, "policy")
        return report
    facts = snapshot_facts(snapshot)
    snapshot_hash = fingerprint(facts)
    policy_value = policy_facts(policy)
    policy_hash = fingerprint(policy_value)
    problems = findings(snapshot, policy)
    for expected, actual, code in (
        (expected_snapshot, snapshot_hash, "stale_snapshot"),
        (expected_policy, policy_hash, "stale_policy"),
    ):
        if expected is not None and expected != actual:
            problems.append({"code": code, "subject": "manifest"})
    report.update(
        snapshotSha256=snapshot_hash,
        policySha256=policy_hash,
        manifestSha256=fingerprint({"snapshot": snapshot_hash, "policy": policy_hash}),
        reviewReference=policy.reviewReference,
        declaredReviewers=policy_value["reviewedBy"],
        findings=sorted(problems, key=lambda row: (row["code"], row["subject"])),
        preserved={key: facts[key] for key in ("players", "islands", "accounts", "obligations")},
    )
    if not problems:
        report["status"] = "ready_for_rehearsal"
        report["islands"] = [
            island_plan(island, policy)
            for island in sorted(snapshot.islands, key=lambda row: str(row.ownerId))
            if island.ownerId in policy.selectedIslands
        ]
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("policy", type=Path)
    parser.add_argument("--expected-snapshot")
    parser.add_argument("--expected-policy")
    arguments = parser.parse_args()
    try:
        report = preview(
            strict_json(arguments.snapshot),
            strict_json(arguments.policy),
            expected_snapshot=arguments.expected_snapshot,
            expected_policy=arguments.expected_policy,
        )
    except (OSError, ValueError):
        parser.exit(2, "Snapshot/policy must be readable strict JSON files.\n")
    print(json.dumps(report, sort_keys=True, indent=2, allow_nan=False))
    return 0 if report["status"] == "ready_for_rehearsal" else 1


if __name__ == "__main__":
    raise SystemExit(main())
