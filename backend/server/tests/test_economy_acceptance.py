"""Offline acceptance assertions and evidence checks; no runtime acceptance is simulated."""

import copy
import hashlib
import json
import subprocess
import sys
from pathlib import Path

import pytest

from tools.economy_acceptance import (
    evidence_template,
    reconcile_treasury,
    validate_evidence,
    validate_treasury,
)

SOURCE = "a" * 40


def treasury(balance: str, committed: str, available: str) -> dict:
    return {"balanceCoins": balance, "committedCoins": committed, "availableCoins": available}


def complete_evidence(tmp_path) -> dict:
    artifact = tmp_path / "run.txt"
    artifact.write_text("Declared test artifact; this unit test is not runtime evidence.\n")
    digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
    bundle = evidence_template(SOURCE)
    for row in bundle["results"]:
        row.update(status="passed", command="declared command", artifact="run.txt", sha256=digest)
    return bundle


@pytest.mark.parametrize(("payout", "cash_delta"), [("0", "-100"), ("100", "0"), ("140", "40")])
def test_all_in_escrow_settlement_does_not_double_debit_principal(payout, cash_delta):
    reconcile_treasury(
        treasury("100", "0", "100"),
        treasury(payout, "0", payout),
        [("0", "100"), (cash_delta, "-100")],
    )


def test_large_whole_coin_balances_have_no_legacy_ceiling():
    value = "1" + "0" * 70
    validate_treasury(treasury(value, value, "0"))


def test_foundation_scale_snapshots_have_no_python_decimal_conversion_ceiling():
    value = "1" + "0" * 5000
    assert validate_treasury(treasury(value, "0", value)) == (10**5000, 0)


def test_foundation_scale_signed_ledger_deltas_reconcile_exactly():
    value = "1" + "0" * 5000
    reconcile_treasury(treasury(value, "0", value), treasury("0", "0", "0"), [("-" + value, "0")])


@pytest.mark.parametrize("value", [1, True, None, "-1", "-0", "+1", "01", "1.0", " 1", "1e3"])
def test_noncanonical_treasury_amounts_are_rejected(value):
    with pytest.raises(ValueError, match="canonical"):
        validate_treasury(treasury(value, "0", "0"))


def test_reserved_funds_cannot_be_spent_by_another_product():
    with pytest.raises(ValueError, match="available"):
        reconcile_treasury(
            treasury("100", "0", "100"),
            treasury("0", "0", "0"),
            [("0", "100"), ("-100", "0"), ("0", "-100")],
        )


def test_a_zero_final_balance_does_not_hide_a_negative_intermediate_balance():
    with pytest.raises(ValueError, match="negative"):
        reconcile_treasury(
            treasury("0", "0", "0"), treasury("0", "0", "0"), [("-1", "0"), ("1", "0")]
        )


def test_a_missing_ledger_effect_is_detected():
    with pytest.raises(ValueError, match="reconcile"):
        reconcile_treasury(treasury("100", "0", "100"), treasury("90", "0", "90"), [])


def test_fee_and_purchase_use_the_same_available_funds():
    reconcile_treasury(
        treasury("100", "0", "100"),
        treasury("80", "80", "0"),
        [("-1", "80"), ("-19", "0")],
    )


def test_duplicate_commitment_release_is_detected():
    with pytest.raises(ValueError, match="negative"):
        reconcile_treasury(
            treasury("100", "100", "0"),
            treasury("100", "0", "100"),
            [("0", "-100"), ("0", "-100")],
        )


def test_a_snapshot_must_expose_exact_available_funds():
    with pytest.raises(ValueError, match="available"):
        validate_treasury(treasury("100", "40", "100"))


def test_template_reports_every_required_check_as_not_run(tmp_path):
    problems = validate_evidence(evidence_template(SOURCE), SOURCE, tmp_path)
    assert problems
    assert all("not_run" in problem for problem in problems)


def test_complete_declared_evidence_passes_metadata_checks_only(tmp_path):
    assert validate_evidence(complete_evidence(tmp_path), SOURCE, tmp_path) == []


def test_fixture_browser_evidence_cannot_replace_authenticated_evidence(tmp_path):
    bundle = complete_evidence(tmp_path)
    bundle["results"][1]["layer"] = "fixture_browser"
    problems = validate_evidence(bundle, SOURCE, tmp_path)
    assert any("unexpected" in problem for problem in problems)
    assert any("missing" in problem and "authenticated_browser" in problem for problem in problems)


def test_evidence_from_another_source_commit_fails(tmp_path):
    bundle = complete_evidence(tmp_path)
    bundle["sourceCommit"] = "b" * 40
    assert "sourceCommit mismatch" in validate_evidence(bundle, SOURCE, tmp_path)


def test_an_individual_stale_result_fails_even_if_manifest_source_is_current(tmp_path):
    bundle = complete_evidence(tmp_path)
    bundle["results"][0]["sourceCommit"] = "b" * 40
    assert any(
        "sourceCommit mismatch" in item for item in validate_evidence(bundle, SOURCE, tmp_path)
    )


def test_missing_artifact_fails(tmp_path):
    bundle = complete_evidence(tmp_path)
    (tmp_path / "run.txt").unlink()
    assert any(
        "artifact unavailable" in item for item in validate_evidence(bundle, SOURCE, tmp_path)
    )


def test_changed_artifact_fails(tmp_path):
    bundle = complete_evidence(tmp_path)
    (tmp_path / "run.txt").write_text("Changed result.\n")
    assert any("sha256 mismatch" in item for item in validate_evidence(bundle, SOURCE, tmp_path))


def test_duplicate_evidence_cannot_hide_a_missing_scenario(tmp_path):
    bundle = complete_evidence(tmp_path)
    bundle["results"][1] = copy.deepcopy(bundle["results"][0])
    problems = validate_evidence(bundle, SOURCE, tmp_path)
    assert any("duplicate" in problem for problem in problems)
    assert any("missing" in problem for problem in problems)


def test_a_reported_failure_never_passes_metadata_checks(tmp_path):
    bundle = complete_evidence(tmp_path)
    bundle["results"][0]["status"] = "failed"
    assert any("failed" in item for item in validate_evidence(bundle, SOURCE, tmp_path))


def test_empty_commands_are_not_accepted_as_reproducible_evidence(tmp_path):
    bundle = complete_evidence(tmp_path)
    bundle["results"][0]["command"] = "  "
    assert any("command missing" in item for item in validate_evidence(bundle, SOURCE, tmp_path))


def test_artifacts_outside_the_evidence_directory_are_refused(tmp_path):
    bundle = complete_evidence(tmp_path)
    bundle["results"][0]["artifact"] = "../outside.txt"
    problems = validate_evidence(bundle, SOURCE, tmp_path)
    assert any("relative to the evidence directory" in item for item in problems)


def test_the_command_line_fails_for_an_unexecuted_template(tmp_path):
    manifest = tmp_path / "evidence.json"
    manifest.write_text(json.dumps(evidence_template(SOURCE)))
    backend = Path(__file__).resolve().parents[2]
    result = subprocess.run(
        [sys.executable, "-m", "tools.economy_acceptance", "--source", SOURCE, str(manifest)],
        cwd=backend,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 1
    assert "runtime acceptance remains unverified" in result.stdout
    assert result.stderr == ""


@pytest.mark.parametrize("results", [None, {}, [None], ["passed"]])
def test_malformed_manifests_are_reported_without_a_traceback(tmp_path, results):
    bundle = {"sourceCommit": SOURCE, "results": results}
    assert validate_evidence(bundle, SOURCE, tmp_path)
