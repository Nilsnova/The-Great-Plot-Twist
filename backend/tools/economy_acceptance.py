"""Offline economy assertions and evidence inventory. Used by MP-ECO-20 reviewers.

This tool checks declared evidence metadata, not authenticated execution or truth
of reported results. Its input is an evidence export, never a game mutation API.
"""

import argparse
import hashlib
import json
import re
from collections.abc import Sequence
from pathlib import Path

SCENARIOS = (
    "treasury-concurrent-spending",
    "settlement-source-account",
    "wave-income-once",
    "personal-participation",
    "engineer-generation",
    "arsenal-holder-lifecycle",
    "repairs-free-revival",
    "unrestricted-bets",
    "ship-reward-cap",
    "member-owner-permissions",
    "reset-deletion",
    "legacy-class-contexts",
    "old-client-rejection",
    "wave-protocol-1",
    "wave-protocol-2",
)
LAYERS = ("sql", "authenticated_browser")


def coin_integer(value: object, *, signed: bool = False) -> int:
    """Read contract decimals exactly, without float conversion or legacy ceilings."""
    pattern = r"0|-?[1-9][0-9]*" if signed else r"0|[1-9][0-9]*"
    if not isinstance(value, str) or re.fullmatch(pattern, value) is None:
        raise ValueError("coin amount must be a canonical decimal string")
    return int(value)


def validate_treasury(snapshot: dict) -> tuple[int, int]:
    """Check the treasury object from the common wire contract."""
    balance, committed, available = (
        coin_integer(snapshot.get(name))
        for name in ("balanceCoins", "committedCoins", "availableCoins")
    )
    if balance - committed != available:
        raise ValueError("available funds must equal balance minus committed funds")
    return balance, committed


def reconcile_treasury(before: dict, after: dict, deltas: Sequence[tuple[str, str]]) -> None:
    """Check ordered (cash, commitment) ledger deltas against two wire snapshots."""
    balance, committed = validate_treasury(before)
    expected = validate_treasury(after)
    for cash_delta, commitment_delta in deltas:
        balance += coin_integer(cash_delta, signed=True)
        committed += coin_integer(commitment_delta, signed=True)
        if balance < 0 or committed < 0:
            raise ValueError("ledger produces a negative balance or commitment")
        if committed > balance:
            raise ValueError("ledger spends unavailable funds: negative available balance")
    if (balance, committed) != expected:
        raise ValueError("ledger effects do not reconcile with the final snapshot")


def evidence_template(source_commit: str) -> dict:
    """Prepare an explicitly not-run inventory, with separate evidence layers."""
    return {
        "sourceCommit": source_commit,
        "results": [
            {
                "scenario": scenario,
                "layer": layer,
                "sourceCommit": source_commit,
                "status": "not_run",
                "reason": "Implementation and runtime evidence pending.",
            }
            for scenario in SCENARIOS
            for layer in LAYERS
        ],
    }


def artifact_problems(row: dict, artifact_root: Path) -> list[str]:
    """Require a reproducible command and an unchanged local evidence file."""
    problems = []
    command = row.get("command")
    if not isinstance(command, str) or not command.strip():
        problems.append("command missing")
    reference = row.get("artifact")
    if not isinstance(reference, str) or not reference.strip():
        return [*problems, "artifact unavailable"]
    root = artifact_root.resolve()
    artifact = (root / reference).resolve()
    if Path(reference).is_absolute() or not artifact.is_relative_to(root):
        return [*problems, "artifact must be relative to the evidence directory"]
    try:
        digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
    except OSError:
        return [*problems, "artifact unavailable"]
    if row.get("sha256") != digest:
        problems.append("sha256 mismatch")
    return problems


def validate_evidence(bundle: object, source_commit: str, artifact_root: Path) -> list[str]:
    """Report missing or inconsistent declarations; no network or execution occurs."""
    if re.fullmatch(r"[0-9a-f]{40}", source_commit) is None:
        return ["expected source must be a full lowercase Git commit SHA"]
    if not isinstance(bundle, dict):
        return ["manifest must be an object"]
    problems = []
    if bundle.get("sourceCommit") != source_commit:
        problems.append("sourceCommit mismatch")
    rows = bundle.get("results")
    if not isinstance(rows, list):
        return [*problems, "results must be a list"]
    expected = {(scenario, layer) for scenario in SCENARIOS for layer in LAYERS}
    seen = set()
    for row in rows:
        if not isinstance(row, dict):
            problems.append("result must be an object")
            continue
        scenario, layer = row.get("scenario"), row.get("layer")
        if not isinstance(scenario, str) or not isinstance(layer, str):
            problems.append("result scenario and layer must be strings")
            continue
        key = (scenario, layer)
        label = f"{scenario}/{layer}"
        if key not in expected:
            problems.append(f"{label}: unexpected evidence requirement")
            continue
        if key in seen:
            problems.append(f"{label}: duplicate result")
        seen.add(key)
        if row.get("sourceCommit") != source_commit:
            problems.append(f"{label}: sourceCommit mismatch")
        if row.get("status") != "passed":
            problems.append(f"{label}: {row.get('status', 'status missing')}")
            continue
        problems.extend(f"{label}: {item}" for item in artifact_problems(row, artifact_root))
    problems.extend(f"{scenario}/{layer}: missing" for scenario, layer in sorted(expected - seen))
    return problems


def main() -> int:
    """Print a template or check an existing manifest without writing artifacts."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, help="Full commit SHA of the tested source")
    parser.add_argument("--template", action="store_true")
    parser.add_argument("manifest", nargs="?", type=Path)
    args = parser.parse_args()
    if re.fullmatch(r"[0-9a-f]{40}", args.source) is None:
        parser.error("--source must be a full lowercase Git commit SHA")
    if args.template:
        print(json.dumps(evidence_template(args.source), indent=2))
        return 0
    if args.manifest is None:
        parser.error("provide a manifest or --template")
    try:
        bundle = json.loads(args.manifest.read_text())
    except (OSError, UnicodeError, ValueError) as error:
        print(f"Evidence metadata invalid: {type(error).__name__}")
        return 1
    problems = validate_evidence(bundle, args.source, args.manifest.parent)
    for problem in problems:
        print(problem)
    if problems:
        print("Evidence incomplete; runtime acceptance remains unverified.")
        return 1
    print("Evidence metadata complete; runtime results still require independent review.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
