"""Capacity refusal and non-destructive retention policy for the T60 offline planner."""

import pytest

from tools.recovery_journal_budget import plan_capacity

SOURCE = "a" * 40
SAMPLE = {"sourceCommit": SOURCE, "journalEvents": 10_000, "allocatedBytes": 6_500_000}


def plan(**changes):
    options = dict(
        source_commit=SOURCE,
        retained_waves=100,
        events_per_wave=14_400,
        storage_budget_bytes=2_000_000_000,
        event_budget=2_000_000,
        safety_factor=2,
    )
    return plan_capacity(SAMPLE, **(options | changes))


def test_capacity_plan_retains_every_original_record_and_reports_conservative_bytes():
    result = plan()
    assert result["status"] == "within_budget"
    assert result["forecast"] == {
        "retainedEvents": 1_440_000,
        "bytesPerEventUpperEstimate": 650,
        "reservedBytes": 1_872_000_000,
        "safetyFactor": 2,
    }
    assert result["retention"] == {
        "action": "retain_all",
        "destructiveOperations": 0,
        "automaticCleanup": False,
    }
    assert result["constraints"]["durableCrossWorkerEventCap"] is False


@pytest.mark.parametrize(
    "changes,reason",
    [
        ({"storage_budget_bytes": 1_871_999_999}, "storage_budget_exceeded"),
        ({"event_budget": 1_439_999}, "event_budget_exceeded"),
        ({"source_commit": "b" * 40}, "measurement_source_mismatch"),
    ],
)
def test_over_budget_or_wrong_source_never_produces_a_ready_plan(changes, reason):
    result = plan(**changes)
    assert result["status"] == "blocked" and reason in result["reasons"]
    assert result["retention"]["destructiveOperations"] == 0


@pytest.mark.parametrize(
    "key,value",
    [
        ("retained_waves", 0),
        ("events_per_wave", -1),
        ("safety_factor", 0),
        ("storage_budget_bytes", True),
        ("event_budget", 1.5),
    ],
)
def test_invalid_operating_controls_fail_closed(key, value):
    with pytest.raises(ValueError):
        plan(**{key: value})


def test_allocated_relation_estimate_rounds_up_and_large_counts_stay_exact():
    sample = {"sourceCommit": SOURCE, "journalEvents": 3, "allocatedBytes": 10}
    result = plan_capacity(
        sample,
        source_commit=SOURCE,
        retained_waves=10**15,
        events_per_wave=3,
        storage_budget_bytes=10**18,
        event_budget=10**18,
        safety_factor=2,
    )
    assert result["forecast"]["bytesPerEventUpperEstimate"] == 4
    assert result["forecast"]["reservedBytes"] == 24 * 10**15
